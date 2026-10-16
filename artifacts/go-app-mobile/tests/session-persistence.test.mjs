import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
const ts = createRequire(import.meta.url)("typescript");
import { loadAuthSession } from "./helpers/auth-session-fixture.mjs";

const key = "go_supabase_session_v1", accountKey = "go_account_type_v1", secureKey = "go_auth_session_v2", logoutKey = "go_auth_signed_out_v2";
const owner = "11111111-1111-4111-8111-111111111111", sessionId = "33333333-3333-4333-8333-333333333333";
const base = "https://test.invalid/api", initialTime = Date.parse("2026-10-12T09:00:00Z");
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
async function settle() { await new Promise(setImmediate); }
function jwt(exp, sid = sessionId) { return "test." + Buffer.from(JSON.stringify({ exp, session_id: sid })).toString("base64url") + ".test"; }
function session(exp = initialTime / 1000 + 3600, id = owner, sid = sessionId) {
  return { access_token: jwt(exp, sid), refresh_token: "test-only-refresh", expires_at: exp,
    user: { id, email: "owner@test.invalid", user_metadata: { role: "usuario" } } };
}
function fixture({ storedSession = session(), sharedStorage, sharedSecureStorage, reply, write } = {}) {
  let now = initialTime, changes = 0, nextTimer = 0;
  const timers = new Map(), listeners = new Set(), calls = [];
  const storage = sharedStorage ?? new Map();
  const secure = sharedSecureStorage ?? new Map();
  if (!sharedStorage && storedSession) secure.set(secureKey, JSON.stringify(storedSession));
  // Legacy migrations are tested separately; continuity starts with an already protected pair.
  if (!sharedStorage) {
    storage.set(accountKey, "usuario");
    storage.set("go_owner_view_context_v1:" + owner, "USER");
    storage.set("go_business_demo_v1:" + owner, '{"plan":{"elements":[{"id":"preserved"}]},"bookings":[{"id":"existing"}]}');
    storage.set("go_business_demo_catalog_v1:" + owner, "two independent businesses");
  }
  const storageApi = {
    getItem: async name => storage.get(name) ?? null,
    setItem: async (name, value) => { storage.set(name, value); },
    removeItem: async name => storage.delete(name),
    multiRemove: async names => { for (const name of names) storage.delete(name); },
  };
  class TestDate extends Date { static now() { return now; } }
  const defaultReply = (url, init) => {
    if (url.endsWith("/auth/refresh")) return Response.json({ ...session(now / 1000 + 3600), refresh_token: "test-only-rotated" });
    const current = JSON.parse(secure.get(secureKey) ?? "null");
    return Response.json({ user: current?.user, profile: { role: "usuario" } });
  };
  const globals = {
    Date: TestDate, process: { env: { EXPO_PUBLIC_API_URL: base } },
    fetch: async (url, init) => { calls.push({ url, init }); return (reply ?? defaultReply)(url, init); },
    setInterval: (run, milliseconds) => { const id = ++nextTimer; timers.set(id, { run, milliseconds }); return id; },
    clearInterval: id => timers.delete(id),
  };
  const api = loadAuthSession(globals, storageApi, {
    notifySessionChanged: () => { changes++; for (const listener of listeners) listener(); },
    onSessionChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  }, { secure, write: async (_name, value) => write?.(key, value) });
  return { api, storage, secure, calls, timers, get changes() { return changes; }, setTime: value => { now = value; },
    getStored: () => JSON.parse(secure.get(secureKey) ?? "null"), currentTime: () => now, listeners };
}
function protectedData(f) { return [...f.storage].filter(([name]) => name !== key && name !== accountKey && name !== logoutKey); }

test("login persists expiry/refresh credentials without storing the password or touching DEMO/context", async () => {
  const f = fixture(), before = protectedData(f), payload = { ...session(), expires_in: 3600, password: "must-not-store" };
  delete payload.expires_at;
  await f.api.saveAuthSession(payload);
  assert.equal(f.getStored().expires_at, initialTime / 1000 + 3600);
  assert.equal(f.getStored().refresh_token, payload.refresh_token);
  assert.equal("password" in f.getStored(), false);
  assert.equal(f.changes, 1); assert.deepEqual(protectedData(f), before);
});

test("expired JWTs from existing installations renew once for concurrent requests and keep identity events quiet", async () => {
  const legacy = session(initialTime / 1000 - 1); delete legacy.expires_at;
  const pending = deferred(), f = fixture({ storedSession: legacy, reply: () => pending.promise });
  const before = protectedData(f);
  const checks = Array.from({ length: 12 }, () => f.api.ensureAuthSession());
  await settle(); assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, base + "/supabase/auth/refresh");
  assert.equal(f.calls[0].init.method, "POST");
  assert.deepEqual(JSON.parse(f.calls[0].init.body), { refresh_token: legacy.refresh_token });
  pending.resolve(Response.json({ ...session(), refresh_token: "rotated" }));
  const results = await Promise.all(checks);
  assert.ok(results.every(next => next.refresh_token === "rotated"));
  assert.equal(f.getStored().refresh_token, "rotated"); assert.equal(f.changes, 0);
  assert.deepEqual(protectedData(f), before);
});

test("reopening an expired session restores User and renews before auth/me instead of erasing credentials", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 300) });
  const before = protectedData(f), restored = await f.api.restoreStoredAuthentication();
  assert.equal(restored.session.user.id, owner); assert.equal(restored.role, "usuario");
  assert.deepEqual(f.calls.map(c => c.url), [base + "/supabase/auth/refresh", base + "/supabase/auth/me"]);
  assert.equal(f.changes, 0); assert.deepEqual(protectedData(f), before);
});

test("a server 401 with a legacy token retries once after rotation, including concurrent auth checks", async () => {
  const legacy = { ...session(), access_token: "test-only-old-without-expiry" };
  const pending = deferred(), refreshed = { ...session(), access_token: "test-only-new-without-expiry" };
  const f = fixture({ storedSession: legacy, reply: (url, init) => {
    if (url.endsWith("/auth/refresh")) return pending.promise;
    return new Headers(init.headers).get("Authorization") === "Bearer " + legacy.access_token
      ? Response.json({ error: "expired" }, { status: 401 })
      : Response.json({ user: refreshed.user, profile: { role: "usuario" } });
  } });
  const a = f.api.fetchWithAuth(base + "/supabase/auth/me"), b = f.api.fetchWithAuth(base + "/supabase/auth/me");
  await settle(); assert.equal(f.calls.filter(c => c.url.endsWith("/auth/refresh")).length, 1);
  pending.resolve(Response.json(refreshed));
  assert.equal((await a).status, 200); assert.equal((await b).status, 200);
  assert.equal(f.changes, 0); assert.equal(f.getStored().access_token, refreshed.access_token);
});

for (const failure of ["offline", 403, 405, 429, 500, 502]) {
  test("temporary renewal failure " + failure + " preserves authentication, account, context and DEMO", async () => {
    const original = session(initialTime / 1000 - 1), f = fixture({ storedSession: original, reply: () => {
      if (failure === "offline") throw Error("network unavailable");
      return Response.json({ error: "unavailable" }, { status: failure });
    } });
    const before = [...f.storage];
    const restored = await f.api.restoreStoredAuthentication();
    assert.equal(restored.session.user.id, owner); assert.equal(restored.role, "usuario");
    assert.deepEqual([...f.storage], before); assert.equal(f.changes, 0);
    assert.equal(f.calls.length, 1);
  });
}

test("auth/me permission 403 is not a logout; unrelated protected denials do not delete a session", async () => {
  const f = fixture({ reply: () => Response.json({ error: "not authorized" }, { status: 403 }) });
  const before = [...f.storage], restored = await f.api.restoreStoredAuthentication();
  assert.equal(restored.session.user.id, owner); assert.equal(restored.role, "usuario");
  assert.deepEqual([...f.storage], before); assert.equal(f.calls.length, 1);
});

test("confirmed unrecoverable renewal requests reauthentication and preserve all DEMO data/preferences", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: () =>
    Response.json({ code: "SESSION_UNRECOVERABLE" }, { status: 401 }) });
  const before = protectedData(f), restored = await f.api.restoreStoredAuthentication();
  assert.equal(restored.session, null); assert.equal(restored.role, null);
  assert.equal(f.storage.has(key), false); assert.equal(f.storage.has(accountKey), false);
  assert.equal(f.changes, 1); assert.deepEqual(protectedData(f), before);
});

test("an ambiguous renewal 401 is unavailable, never treated as confirmed revocation", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: () =>
    Response.json({ error: "Owner verification failed" }, { status: 401 }) });
  const before = [...f.storage]; await assert.rejects(f.api.ensureAuthSession(), e => e.code === "SESSION_REFRESH_UNAVAILABLE");
  assert.deepEqual([...f.storage], before); assert.equal(f.changes, 0);
});

for (const action of ["logout", "different-login", "same-user-login"]) {
  test("late renewal cannot resurrect or overwrite " + action, async () => {
    const pending = deferred(), f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: () => pending.promise });
    const refresh = f.api.ensureAuthSession(); await settle();
    let expected = null;
    if (action === "logout") await f.api.clearAuthSession();
    else {
      expected = session(initialTime / 1000 + 7200, action === "different-login" ? "other-user" : owner, "other-session");
      await f.api.saveAuthSession(expected);
    }
    pending.resolve(Response.json(session()));
    await assert.rejects(refresh, e => e.code === "AUTH_REQUIRED");
    assert.deepEqual(f.getStored(), expected); assert.equal(f.changes, 1);
  });
}

test("logout waits for a native credential write and then removes it without clearing DEMO", async () => {
  const writing = deferred(), entered = deferred();
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), write: async name => {
    if (name === key) { entered.resolve(); await writing.promise; }
  } });
  const before = protectedData(f), refresh = f.api.ensureAuthSession(); await entered.promise;
  const logout = f.api.clearAuthSession(); writing.resolve();
  await assert.rejects(refresh, e => e.code === "AUTH_REQUIRED"); await logout;
  assert.equal(f.getStored(), null); assert.deepEqual(protectedData(f), before);
});

test("a failed storage write does not erase the last persisted refresh credential", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), write: async () => { throw Error("disk unavailable"); } });
  const before = [...f.storage]; await assert.rejects(f.api.ensureAuthSession(), e => e.code === "SESSION_REFRESH_UNAVAILABLE");
  assert.deepEqual([...f.storage], before); assert.equal(f.changes, 0);
});

test("rotating tokens retain the identity stamp; a new login of the same UUID invalidates it", async () => {
  const f = fixture(), identity = await f.api.captureAuthIdentity();
  f.setTime(initialTime + 3600000); await f.api.ensureAuthSession();
  assert.equal(await f.api.isAuthIdentityCurrent(identity), true);
  await f.api.saveAuthSession(session(initialTime / 1000 + 7200));
  assert.equal(await f.api.isAuthIdentityCurrent(identity), false);
});

test("identity changes during a protected request prevent an old response from being consumed", async () => {
  const pending = deferred(), f = fixture({ reply: () => pending.promise });
  const response = f.api.fetchWithAuth(base + "/supabase/admin/access", {}, true, owner); await settle();
  await f.api.clearAuthSession(); pending.resolve(Response.json({ allowed: true }));
  await assert.rejects(response, e => e.code === "AUTH_REQUIRED");
  assert.equal(f.getStored(), null);
});

test("an expected UUID mismatch performs no protected request", async () => {
  const f = fixture(); await assert.rejects(f.api.fetchWithAuth(base + "/supabase/admin/access", {}, true, "another-user"), e => e.code === "AUTH_REQUIRED");
  assert.equal(f.calls.length, 0);
});

test("foreground maintenance handles app changes/lock, pauses background timers and keeps one subscription", async () => {
  const f = fixture(), callbacks = new Set();
  const activity = { currentState: "active", addEventListener(_name, fn) { callbacks.add(fn); return { remove: () => callbacks.delete(fn) }; } };
  const stop = f.api.startAuthSessionMaintenance(activity);
  await settle(); assert.equal(f.timers.size, 1); assert.equal(callbacks.size, 1); assert.equal(f.calls.length, 0);
  const change = state => { activity.currentState = state; for (const fn of callbacks) fn(state); };
  for (const state of ["inactive", "background"]) {
    change(state); assert.equal(f.timers.size, 0); f.setTime(initialTime + 3601000); await settle(); assert.equal(f.calls.length, 0);
  }
  change("active"); await settle();
  assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 1); assert.equal(f.changes, 0);
  change("inactive"); change("active"); await settle();
  assert.equal(f.calls.length, 1); assert.equal(f.timers.size, 1);
  stop(); assert.equal(callbacks.size, 0); assert.equal(f.timers.size, 0); assert.equal(f.listeners.size, 0);
});

test("idle foreground ticks renew before expiry without resetting the working screen", async () => {
  const f = fixture(), activity = { currentState: "active", addEventListener() { return { remove() {} }; } };
  const stop = f.api.startAuthSessionMaintenance(activity); await settle();
  f.setTime(initialTime + 3570000);
  for (const timer of f.timers.values()) timer.run(); await settle();
  assert.equal(f.calls.length, 1); assert.equal(f.changes, 0);
  stop();
});

test("Reload/reopen hydrate the rotated session and preserve company configuration/reservations by UUID", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 1) }), before = protectedData(f);
  await f.api.ensureAuthSession();
  const reopened = fixture({ sharedStorage: f.storage, sharedSecureStorage: f.secure });
  const restored = await reopened.api.restoreStoredAuthentication();
  assert.equal(restored.session.refresh_token, "test-only-rotated");
  assert.equal(restored.session.user.id, owner); assert.equal(restored.role, "usuario");
  assert.deepEqual(protectedData(reopened), before); assert.equal(reopened.changes, 0);
});

test("the real root installs maintenance once and authentication bootstrap uses the shared renewal path", () => {
  const root = readFileSync("app/_layout.tsx", "utf8"), home = readFileSync("app/index.tsx", "utf8");
  assert.equal((root.match(/startAuthSessionMaintenance\(AppState\)/g) ?? []).length, 1);
  assert.match(home, /await restoreStoredAuthentication\(\)/);
  const boot = home.slice(home.indexOf("// Restore the stored session"), home.indexOf("// Helper: guarda MI"));
  assert.doesNotMatch(boot, /multiRemove|removeItem|refresh_token/);
  assert.match(boot, /onSessionChanged/);
  assert.match(home, /!adminAccess.checking && !adminAccess.unavailable/);
});

test("login and profile logout share ordered credential persistence; no password storage is introduced", () => {
  const auth = readFileSync("components/auth/LoginRegisterPanel.tsx", "utf8"), home = readFileSync("app/index.tsx", "utf8");
  assert.match(auth, /await saveAuthSession\(payload\)/);
  assert.match(auth, /await clearAuthSession\(\)/); assert.match(home, /await clearAuthSession\(\)/);
  assert.doesNotMatch(auth, /setItem\("go_supabase_session_v1"/);
});

test("pending business logout uses the same ordered credential removal as login and profile", () => {
  const gate = readFileSync("components/auth/BusinessAccessGate.tsx", "utf8");
  assert.match(gate, /await clearAuthSession\(\)/);
  assert.doesNotMatch(gate, /multiRemove|removeItem|notifySessionChanged/);
});

for (const mismatch of ["missing-refresh", "wrong-user", "wrong-session"]) {
  test("renewal response " + mismatch + " cannot replace the authenticated identity", async () => {
    const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: () => {
      const payload = session();
      if (mismatch === "missing-refresh") delete payload.refresh_token;
      if (mismatch === "wrong-user") payload.user.id = "different-user";
      if (mismatch === "wrong-session") payload.access_token = jwt(initialTime / 1000 + 3600, "other-session");
      return Response.json(payload);
    } });
    const before = [...f.storage];
    await assert.rejects(f.api.ensureAuthSession(), error => error.code === "SESSION_REFRESH_UNAVAILABLE");
    assert.deepEqual([...f.storage], before); assert.equal(f.changes, 0);
  });
}

test("the working screen stays mounted during owner revalidation/outage and loses access on revocation or logout", () => {
  const source = readFileSync("app/index.tsx", "utf8");
  const ast = ts.createSourceFile("home.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const home = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "HomeScreen");
  assert.ok(home);
  let admin = { userId: owner, checking: false, unavailable: false }, authorized = true;
  const ref = { current: null };
  const scope = { React: { createElement: (type, props, ...children) => ({ type, props, children }) },
    useRef: () => ref, useAdminAccess: () => admin, useGoView: () => ({ isOwner: authorized }),
    HomeScreenContent() {}, BusinessAccessGate() {} };
  vm.createContext(scope);
  const code = "globalThis.HomeScreen = " + home.getText(ast).replace(/^export default /, "");
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, scope);
  const initial = scope.HomeScreen();
  assert.equal(initial.type, scope.BusinessAccessGate);
  assert.equal(initial.props.ownerPresentation, true);
  assert.equal(initial.children[0].type, scope.HomeScreenContent);
  authorized = false; admin = { ...admin, checking: true };
  assert.equal(scope.HomeScreen().type, initial.type);
  assert.equal(scope.HomeScreen().props.ownerPresentation, true);
  admin = { ...admin, checking: false, unavailable: true };
  assert.equal(scope.HomeScreen().type, initial.type, "Transport errors must not reset local screen state");
  assert.equal(scope.HomeScreen().props.ownerPresentation, true);
  admin = { ...admin, unavailable: false };
  assert.equal(scope.HomeScreen().type, scope.BusinessAccessGate, "Confirmed denial retains the business permission boundary");
  assert.equal(scope.HomeScreen().props.ownerPresentation, false);
  assert.equal(scope.HomeScreen().children[0].type, initial.children[0].type);
  authorized = true; scope.HomeScreen();
  authorized = false; admin = { userId: null, checking: true, unavailable: false };
  assert.equal(scope.HomeScreen().type, scope.BusinessAccessGate, "Logout cannot retain owner presentation");
  assert.equal(scope.HomeScreen().props.ownerPresentation, false);
});


test('the recovery notice is emitted only for confirmed expiry and consumed once',async()=>{
 const f=fixture({storedSession:session(initialTime/1000-1),reply:()=>Response.json({code:'SESSION_UNRECOVERABLE'},{status:401})});
 await f.api.restoreStoredAuthentication();
 assert.match(f.api.consumeAuthRecoveryNotice(),/ya no es válida/);assert.equal(f.api.consumeAuthRecoveryNotice(),null);
 await f.api.clearAuthSession();assert.equal(f.api.consumeAuthRecoveryNotice(),null);
});

test('regression: owner-gateway auth/me 401 after successful rotation must not erase authentication', async()=>{
 const f=fixture({reply:(url)=>url.endsWith('/auth/refresh')?Response.json({...session(),refresh_token:'rotated'}):Response.json({error:'Owner verification failed'},{status:401})});
 const before=protectedData(f),restored=await f.api.restoreStoredAuthentication();
 assert.ok(restored.session,'Gateway denial is not proof that Auth revoked the session');
 assert.equal(f.getStored().refresh_token,'rotated');assert.equal(f.changes,0);assert.deepEqual(protectedData(f),before);
});
test('regression: sequential 429 renewal failures must share a retry pause', async()=>{
 const f=fixture({storedSession:session(initialTime/1000-1),reply:()=>Response.json({error:'Retry later'},{status:429})});
 for(let i=0;i<8;i++)await assert.rejects(f.api.ensureAuthSession());
 assert.equal(f.calls.length,1,'Independent consumers must not exhaust the five-per-minute gateway allowance');
 assert.ok(f.getStored());assert.equal(f.changes,0);
});
test('regression: sequential network renewal failures must share a retry pause', async()=>{
 const f=fixture({storedSession:session(initialTime/1000-1),reply:()=>{throw Error('temporary network outage')}});
 for(let i=0;i<8;i++)await assert.rejects(f.api.ensureAuthSession());
 assert.equal(f.calls.length,1);assert.ok(f.getStored());assert.equal(f.changes,0);
});

test("regression: a 429 renewal obeys Retry-After and recovers once after the pause", async () => {
  let limited = true;
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: () => limited
    ? Response.json({ error: "Retry later" }, { status: 429, headers: { "Retry-After": "120" } })
    : Response.json({ ...session(initialTime / 1000 + 7200), refresh_token: "rotated-after-wait" }) });
  await assert.rejects(f.api.ensureAuthSession());
  limited = false; f.setTime(initialTime + 61000);
  await assert.rejects(f.api.ensureAuthSession()); assert.equal(f.calls.length, 1);
  f.setTime(initialTime + 120000);
  const checks = await Promise.all(Array.from({ length: 8 }, () => f.api.ensureAuthSession()));
  assert.ok(checks.every(value => value.refresh_token === "rotated-after-wait"));
  assert.equal(f.calls.length, 2); assert.equal(f.changes, 0);
});

test("regression: transient network recovery resumes after 30 seconds without login or credential deletion", async () => {
  let offline = true;
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: () => {
    if (offline) throw Error("offline");
    return Response.json({ ...session(), refresh_token: "rotated-after-network" });
  } });
  const before = protectedData(f);
  await assert.rejects(f.api.ensureAuthSession());
  offline = false; f.setTime(initialTime + 29000);
  await assert.rejects(f.api.ensureAuthSession()); assert.equal(f.calls.length, 1);
  f.setTime(initialTime + 30000);
  assert.equal((await f.api.ensureAuthSession()).refresh_token, "rotated-after-network");
  assert.equal(f.calls.length, 2); assert.equal(f.changes, 0); assert.deepEqual(protectedData(f), before);
});

test("regression: repeated gateway 401s cannot repeatedly rotate or erase a valid renewable session", async () => {
  const f = fixture({ reply: url => url.endsWith("/auth/refresh")
    ? Response.json({ ...session(), refresh_token: "rotated" })
    : Response.json({ error: "Owner verification failed" }, { status: 401 }) });
  for (let i = 0; i < 8; i++) {
    if (i === 0) assert.equal((await f.api.fetchWithAuth(base + "/supabase/auth/me")).status, 401);
    else await assert.rejects(f.api.fetchWithAuth(base + "/supabase/auth/me"), error => error.code === "SESSION_REFRESH_UNAVAILABLE");
  }
  assert.equal(f.calls.filter(call => call.url.endsWith("/auth/refresh")).length, 1);
  assert.ok(f.getStored()); assert.equal(f.changes, 0); assert.equal(f.api.consumeAuthRecoveryNotice(), null);
});

test("regression: protected-route 429 suppresses further authenticated traffic until Retry-After", async () => {
  let limited = true;
  const f = fixture({ reply: () => limited
    ? Response.json({ error: "Retry later" }, { status: 429, headers: { "Retry-After": "90" } })
    : Response.json({ allowed: true }) });
  const before = [...f.storage];
  assert.equal((await f.api.fetchWithAuth(base + "/supabase/admin/access")).status, 429);
  for (let i = 0; i < 8; i++) await assert.rejects(f.api.fetchWithAuth(base + "/supabase/auth/me"));
  assert.equal(f.calls.length, 1); assert.deepEqual([...f.storage], before); assert.equal(f.changes, 0);
  limited = false; f.setTime(initialTime + 90000);
  assert.equal((await f.api.fetchWithAuth(base + "/supabase/admin/access")).status, 200);
  assert.equal(f.calls.length, 2);
});

test("regression: a Retry-After HTTP date is honored without changing stored data", async () => {
  const delay = new Date(initialTime + 120000).toUTCString();
  const f = fixture({ storedSession: session(initialTime / 1000 - 1),
    reply: () => Response.json({}, { status: 429, headers: { "Retry-After": delay } }) });
  await assert.rejects(f.api.ensureAuthSession()); f.setTime(initialTime + 61000);
  await assert.rejects(f.api.ensureAuthSession()); assert.equal(f.calls.length, 1);
  f.setTime(initialTime + 120000);
  await assert.rejects(f.api.ensureAuthSession()); assert.equal(f.calls.length, 2);
});

test("regression: a new explicit login clears the old identity's retry pause and manual logout still wins", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: url =>
    url.endsWith("/auth/refresh") ? Response.json({}, { status: 429 }) : Response.json({ user: session().user }) });
  await assert.rejects(f.api.ensureAuthSession());
  await f.api.saveAuthSession(session(initialTime / 1000 + 7200, "new-user", "new-session"));
  assert.equal((await f.api.fetchWithAuth(base + "/supabase/auth/me")).status, 200);
  assert.equal(f.calls.length, 2); await f.api.clearAuthSession();
  assert.equal(await f.api.ensureAuthSession(), null);
  await assert.rejects(f.api.fetchWithAuth(base + "/supabase/auth/me"), error => error.code === "AUTH_REQUIRED");
  assert.equal(f.calls.length, 2); assert.equal(f.getStored(), null);
});

test("regression: bootstrap checks cannot renew twice when a freshly rotated token gets an owner-gateway 401", async () => {
  const f = fixture({ storedSession: session(initialTime / 1000 - 1), reply: url => url.endsWith("/auth/refresh")
    ? Response.json({ ...session(), refresh_token: "rotated" })
    : Response.json({ error: "Owner verification failed" }, { status: 401 }) });
  const before = protectedData(f);
  const restored = await f.api.restoreStoredAuthentication();
  assert.ok(restored.session); assert.equal(restored.role, "usuario");
  assert.equal(f.calls.filter(call => call.url.endsWith("/auth/refresh")).length, 1);
  assert.equal(f.changes, 0); assert.deepEqual(protectedData(f), before);
});

test("regression: an auth/me 429 during bootstrap preserves the account and does not emit a logout event", async () => {
  const f = fixture({ reply: () => Response.json({}, { status: 429 }) });
  const before = protectedData(f);
  const restored = await f.api.restoreStoredAuthentication();
  assert.ok(restored.session); assert.equal(restored.role, "usuario"); assert.equal(f.changes, 0);
  assert.deepEqual(protectedData(f), before);
  const second = await f.api.restoreStoredAuthentication();
  assert.ok(second.session); assert.equal(second.role, "usuario"); assert.equal(f.calls.length, 1);
});
