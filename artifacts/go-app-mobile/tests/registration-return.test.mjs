import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('components/auth/LoginRegisterPanel.tsx', 'utf8');
const helperSource = readFileSync('lib/registrationReturn.ts', 'utf8');
const panel = ts.createSourceFile('panel.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root, predicate) {
  if (predicate(root)) return root;
  let found; ts.forEachChild(root, child => { if (!found) found = find(child, predicate); });
  return found;
}
const effect = find(panel, node => ts.isCallExpression(node) && node.expression.getText(panel) === 'useEffect'
  && node.arguments[0]?.getText(panel).includes('continueRegistration'));
const authenticate = find(panel, node => ts.isVariableDeclaration(node) && node.name.getText(panel) === 'handleAuthenticate');
const emailChange = find(panel, node => ts.isVariableDeclaration(node) && node.name.getText(panel) === 'handleAuthEmailChange');
const errorMessage = find(panel, node => ts.isFunctionDeclaration(node) && node.name?.text === 'authErrorMessage');
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const pendingKey = 'go_pending_email_confirmation_v1';
const sessionKey = 'go_supabase_session_v1';
const pending = { email: 'new@test.invalid', role: 'usuario' };
const session = { access_token: 'test-only-token', refresh_token: 'test-only-refresh', user: { id: 'test-user' } };
const confirmed = { user: { id: 'test-user', email: pending.email, email_confirmed_at: '2026-10-05T12:00:00Z' }, profile: { role: 'usuario' } };
const flush = () => new Promise(resolve => setImmediate(resolve));
async function settle() { for (let i = 0; i < 5; i++) await flush(); }

function fixture({ marker = null, storedSession = null, me = async () => Response.json(confirmed), registered = {}, registerStatus = 200, respondRegister } = {}) {
  const storage = new Map();
  if (marker) storage.set(pendingKey, JSON.stringify(marker));
  if (storedSession) storage.set(sessionKey, JSON.stringify(storedSession));
  const requests = [], logs = [], subscriptions = new Map(), sessionListeners = new Set();
  const state = { mode: 'register', step: 'credentials', email: pending.email, password: 'memory-only-password', role: 'usuario', account: null, error: 'old error' };
  const pendingRegistrationRef = { current: null };
  const authContextRef = { current: { visible: true, userAccountType: null, onSetAccountType: role => { state.account = role; authContextRef.current.userAccountType = role; } } };
  const AsyncStorage = {
    async getItem(key) { return storage.get(key) ?? null; },
    async setItem(key, value) { storage.set(key, value); },
    async removeItem(key) { storage.delete(key); },
  };
  const AppState = { currentState: 'active', addEventListener: (_event, fn) => {
    subscriptions.set('state', fn); return { remove: () => subscriptions.delete('state') };
  } };
  const context = {
    exports: {}, process: { env: { EXPO_PUBLIC_API_URL: 'https://test.invalid/api' } },
    AbortController, setTimeout, clearTimeout,
    require: name => { assert.equal(name, '@react-native-async-storage/async-storage'); return { default: AsyncStorage }; },
    AsyncStorage, AppState, pendingRegistrationRef, authContextRef, authInputRevisionRef: { current: 0 },
    console: { warn: (...args) => logs.push(args) },
    Linking: { addEventListener: (_event, fn) => { subscriptions.set('url', fn); return { remove: () => subscriptions.delete('url') }; } },
    onSessionChanged: fn => { sessionListeners.add(fn); return () => sessionListeners.delete(fn); },
    notifySessionChanged: () => { sessionListeners.forEach(fn => fn()); },
    fetch: async (url, init) => { requests.push({ url, init }); return url.endsWith('/auth/register')
      ? respondRegister ? respondRegister(init) : Response.json(registered, { status: registerStatus }) : me(); },
    authEmail: pending.email, authPassword: state.password, authName: 'New user', selectedRole: 'usuario', authMode: 'register',
    onSetAccountType: authContextRef.current.onSetAccountType,
    setAuthMode: value => { state.mode = value; }, setAuthStep: value => { state.step = value; },
    setAuthEmail: value => { state.email = value; context.authEmail = value; }, setAuthPassword: value => { state.password = value; },
    setSelectedRole: value => { state.role = value; }, setAuthError: value => { state.error = value; }, setAuthBusy: value => { state.busy = value; },
  };
  vm.createContext(context); vm.runInContext(transpile(helperSource), context);
  Object.assign(context, context.exports);
  vm.runInContext(transpile(`${errorMessage.getText(panel)}
    globalThis.cleanup = (${effect.arguments[0].getText(panel)})();
    globalThis.register = ${authenticate.initializer.getText(panel)};
    globalThis.changeEmail = ${emailChange.initializer.getText(panel)};`), context);
  return {
    state, storage, requests, logs, context, subscriptions, sessionListeners, cleanup: context.cleanup, register: context.register, changeEmail: context.changeEmail,
    async resume() { AppState.currentState = 'background'; subscriptions.get('state')('background'); AppState.currentState = 'inactive'; subscriptions.get('state')('inactive'); AppState.currentState = 'active'; subscriptions.get('state')('active'); await settle(); },
    async link(url = 'go-app://') { subscriptions.get('url')({ url }); await settle(); },
    mark(value = pending) { pendingRegistrationRef.current = value; storage.set(pendingKey, JSON.stringify(value)); },
  };
}

test('successful registration without a token persists only email and role, then return opens existing login', async () => {
  const f = fixture(); await settle(); await f.register();
  assert.deepEqual(JSON.parse(f.storage.get(pendingKey)), pending);
  assert.equal(f.state.mode, 'register'); assert.match(f.state.error, /Revisa tu correo/);
  await f.resume();
  assert.equal(f.state.mode, 'login'); assert.equal(f.state.step, 'credentials');
  assert.equal(f.state.email, pending.email); assert.equal(f.state.password, '');
  assert.equal(f.state.error, null); assert.equal(f.state.account, null);
  assert.equal(f.storage.has(pendingKey), false); assert.equal(f.storage.has(sessionKey), false);
  assert.equal(f.requests.length, 1); // Only the explicit register request; no automatic password login.
});

test('an unsubmitted or failed registration is not changed by returning to the app', async () => {
  const f = fixture(); await settle(); await f.resume();
  assert.equal(f.state.mode, 'register'); assert.equal(f.requests.length, 0);
  const failed = fixture({ registered: { error: 'Registration failed' }, registerStatus: 400 });
  await settle(); await failed.register(); await failed.resume();
  assert.equal(failed.state.mode, 'register'); assert.equal(failed.storage.has(pendingKey), false);
  assert.equal(failed.state.error, 'Registration failed');
});

test('reload/cold launch restores the pending login step and Empresa account selection', async () => {
  const f = fixture({ marker: { ...pending, role: 'empresa' } }); await settle();
  assert.equal(f.state.mode, 'login'); assert.equal(f.state.role, 'empresa');
  assert.equal(f.state.email, pending.email); assert.equal(f.state.account, null);
});

test('existing installed-app link advances the pending registration without consuming URL tokens', async () => {
  const f = fixture(); await settle(); f.mark();
  await f.link('https://unrelated.invalid'); assert.equal(f.state.mode, 'register');
  await f.link('go-app://#access_token=untrusted');
  assert.equal(f.state.mode, 'login'); assert.equal(f.storage.has(sessionKey), false);
  assert.equal(f.requests.length, 0);
});

test('an inactive notification alone does not advance a pending registration', async () => {
  const f = fixture(); await settle(); f.mark();
  f.subscriptions.get('state')('inactive'); f.subscriptions.get('state')('active'); await settle();
  assert.equal(f.state.mode, 'register');
});

test('a stored session for the confirmed same account is validated before automatic continuation', async () => {
  const f = fixture({ storedSession: session }); await settle(); f.mark(); await f.resume();
  assert.equal(f.state.account, 'usuario'); assert.equal(f.state.step, 'role');
  assert.equal(f.requests.length, 1); assert.equal(f.requests[0].url, 'https://test.invalid/api/supabase/auth/me');
  assert.equal(f.requests[0].init.headers.Authorization, 'Bearer test-only-token');
  assert.equal(f.storage.get(sessionKey), JSON.stringify(session));
});

test('unconfirmed, mismatched and rejected sessions fall back to login without deleting the session', async () => {
  const responses = [
    () => Response.json({ user: { ...confirmed.user, email: 'other@test.invalid' } }),
    () => Response.json({ user: { ...confirmed.user, email_confirmed_at: null } }),
    () => Response.json({ user: confirmed.user, profile: null }),
    () => Response.json({ error: 'JWT expired' }, { status: 401 }),
    () => { throw new Error('offline'); },
  ];
  for (const response of responses) {
    const f = fixture({ storedSession: session, me: async () => response() }); await settle(); f.mark(); await f.resume();
    assert.equal(f.state.mode, 'login'); assert.equal(f.state.account, null);
    assert.equal(f.storage.get(sessionKey), JSON.stringify(session));
  }
});

test('concurrent foreground and link events share one return validation', async () => {
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const f = fixture({ storedSession: session, me: async () => { await blocked; return Response.json(confirmed); } });
  await settle(); f.mark(); await f.resume(); await f.link();
  assert.equal(f.requests.length, 1); release(); await settle(); assert.equal(f.state.account, 'usuario');
});

test('logout or a replaced session cancels an older return validation', async () => {
  for (const notify of [true, false]) {
    let release; const blocked = new Promise(resolve => { release = resolve; });
    const f = fixture({ storedSession: session, me: async () => { await blocked; return Response.json(confirmed); } });
    await settle(); f.mark(); await f.resume(); f.storage.delete(sessionKey);
    if (notify) f.context.notifySessionChanged();
    release(); await settle();
    assert.equal(f.state.account, null); assert.equal(f.storage.has(sessionKey), false);
  }
});

test('unmount removes subscriptions and prevents continuation from an obsolete validation', async () => {
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const f = fixture({ storedSession: session, me: async () => { await blocked; return Response.json(confirmed); } });
  await settle(); f.mark(); await f.resume(); f.cleanup(); release(); await settle();
  assert.equal(f.subscriptions.size, 0); assert.equal(f.sessionListeners.size, 0); assert.equal(f.state.account, null);
});

test('registration that already returns a session preserves existing immediate authentication', async () => {
  const f = fixture({ registered: session }); await settle(); await f.register();
  assert.equal(f.state.account, 'usuario'); assert.equal(f.state.step, 'role');
  assert.equal(f.storage.has(pendingKey), false); assert.equal(JSON.parse(f.storage.get(sessionKey)).access_token, session.access_token);
});

test('editing email clears the old error and a new submit uses the new email without automatic retries', async () => {
  const f = fixture({ respondRegister: async () => f.requests.length === 1
    ? Response.json({ code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }, { status: 429 })
    : Response.json({}) });
  await settle(); await f.register();
  assert.match(f.state.error, /límite temporal de envío de correos/); assert.equal(f.state.busy, false);
  f.changeEmail('second@test.invalid');
  assert.equal(f.state.error, null); assert.equal(f.requests.length, 1);
  await f.register();
  assert.equal(f.requests.length, 2);
  assert.equal(JSON.parse(f.requests[1].init.body).email, 'second@test.invalid');
  assert.match(f.state.error, /Revisa tu correo/); assert.equal(f.state.busy, false);
});

test('a real new rate limit remains an error for the new attempt with no session or fake success', async () => {
  const f = fixture({ registered: { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, registerStatus: 429 });
  await settle(); await f.register(); f.changeEmail('second@test.invalid'); await f.register();
  assert.equal(f.requests.length, 2); assert.match(f.state.error, /límite temporal de envío de correos/);
  assert.equal(f.state.busy, false); assert.equal(f.state.account, null);
  assert.equal(f.storage.has(sessionKey), false); assert.equal(f.storage.has(pendingKey), false);
  assert.equal(f.logs.length, 2);
  assert.equal(f.logs[1][1].httpStatus, 429); assert.equal(f.logs[1][1].emailRateLimit, true);
  assert.ok(!JSON.stringify(f.logs).includes('test.invalid')); assert.ok(!JSON.stringify(f.logs).includes('password'));
});

test('a late rejection for an edited email cannot restore the previous error', async () => {
  let release; const response = new Promise(resolve => { release = resolve; });
  const f = fixture({ respondRegister: () => response }); await settle();
  const attempt = f.register(); f.changeEmail('second@test.invalid');
  release(Response.json({ msg: 'email rate limit exceeded' }, { status: 429 })); await attempt;
  assert.equal(f.state.error, null); assert.equal(f.state.busy, false); assert.equal(f.requests.length, 1);
});

test('editing away from an earlier pending registration does not resume the old account', async () => {
  const f = fixture(); await settle(); f.mark(); f.changeEmail('second@test.invalid');
  await f.resume();
  assert.equal(f.storage.has(pendingKey), false); assert.equal(f.state.mode, 'register');
  assert.equal(f.state.email, 'second@test.invalid'); assert.equal(f.requests.length, 0);
});

test('incorrect credentials always use one generic message without revealing account existence', async () => {
  for (const email of ['existing@test.invalid', 'missing@test.invalid']) {
    const f = fixture({ me: async () => Response.json({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, { status: 400 }) });
    await settle(); f.context.authMode = 'login'; f.changeEmail(email); await f.register();
    assert.equal(f.state.error, 'Correo o contraseña incorrectos.');
    assert.equal(f.state.account, null); assert.equal(f.storage.has(sessionKey), false);
    assert.equal(f.requests.length, 1); assert.ok(f.requests[0].url.endsWith('/auth/login'));
  }
});
