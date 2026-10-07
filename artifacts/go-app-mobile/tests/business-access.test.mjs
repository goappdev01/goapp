import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const read = file => readFileSync(file, 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const user = '11111111-1111-4111-8111-111111111111';
const id = '22222222-2222-4222-8222-222222222222';
const sessionKey = 'go_supabase_session_v1';
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };

function dataFixture(rows = []) {
  const storage = new Map([[sessionKey, JSON.stringify({ access_token: 'test-only', user: { id: user } })]]);
  const calls = [];
  const context = { exports: {}, require(name) {
    if (name === '@react-native-async-storage/async-storage') return { default: { getItem: async key => storage.get(key) ?? null } };
    if (name === './booking') return {
      BookingApiError: class extends Error { constructor(message, status, code) { super(message); this.status = status; this.code = code; } },
      getAuthenticatedUserId: async () => { const s = JSON.parse(storage.get(sessionKey) ?? 'null'); return s?.access_token ? s.user.id : null; },
      isCloudId: value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
      supabaseApiRequest: async (...args) => { calls.push(args); return typeof rows === 'function' ? rows() : rows; },
    };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.createContext(context); vm.runInContext(transpile(read('data/businessAccess.ts')), context);
  return { api: context.exports, storage, calls };
}

function fakeReact() {
  return { createContext: () => ({ Provider: 'provider' }), Fragment: 'fragment',
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
}
function gate(access, businessMode = true) {
  const React = fakeReact();
  const context = { exports: {}, require(name) {
    if (name === 'react') return { default: React, ...React };
    if (name === '@/contexts/GoBusinessAccessContext') return { useBusinessAccess: () => access };
    if (name === '@/contexts/GoModeContext') return { useGoMode: () => ({ loaded: true, isBusinessMode: businessMode }) };
    if (name === 'react-native') return { View: 'view', Text: 'text', ActivityIndicator: 'spinner', StyleSheet: { create: value => value } };
    return {};
  } };
  vm.createContext(context); vm.runInContext(transpile(read('components/auth/BusinessAccessGate.tsx')), context);
  return context.exports.BusinessAccessGate({ children: 'private-child' });
}

test('only an actual server boolean true grants business access; local/demo/role state has no authority', async () => {
  const f = dataFixture();
  for (const verified of [false, undefined, 'true', 1]) {
    const snapshot = f.api.resolveBusinessAccess([{ id, verified, ui_metadata: { verified: true }, role: 'empresa' }], user);
    assert.equal(snapshot.status, 'pendiente_verificacion');
    const result = gate({ snapshot, allowed: false, loading: false, error: null });
    assert.equal(result.type.name, 'BusinessVerificationScreen');
    assert.equal(result.children.includes('private-child'), false);
  }
  const verified = f.api.resolveBusinessAccess([{ id, verified: true }], user);
  assert.equal(verified.status, 'verificada');
  assert.deepEqual(gate({ snapshot: verified, allowed: true, loading: false, error: null }).children, ['private-child']);
  assert.equal(f.api.resolveBusinessAccess([{ id, verified: false, verification_request: { status: 'rejected' } }], user).status, 'rechazada');
});

test('personal mode remains accessible; pending business and loading/error states never mount private content', () => {
  const f = dataFixture();
  const snapshot = f.api.resolveBusinessAccess([], user);
  assert.equal(snapshot.status, 'sin_empresa');
  assert.equal(gate({ snapshot, allowed: false, loading: false, error: null }).type.name, 'BusinessVerificationScreen');
  assert.deepEqual(gate({ snapshot, allowed: false, loading: true, error: 'offline' }, false).children, ['private-child']);
  assert.equal(gate({ snapshot, allowed: true, loading: true, error: null }).type, 'view');
  assert.equal(gate({ snapshot: null, allowed: false, loading: false, error: 'offline' }).type.name, 'BusinessVerificationScreen');
});

test('server lookup uses the existing authenticated API; logout/new session invalidates its result', async () => {
  const pending = deferred(); const f = dataFixture(() => pending.promise);
  const request = f.api.getBusinessAccess(); await flush();
  assert.deepEqual(plain(f.calls[0]), ['/supabase/manage/businesses', {}, true, user]);
  f.storage.delete(sessionKey); pending.resolve([{ id, verified: true }]);
  await assert.rejects(request, /sesión ha cambiado/);
  assert.equal((await f.api.getBusinessAccess()).userId, null);
  assert.equal(f.calls.length, 1);
  const malformed = dataFixture([{ id: 'nemesi_molina', verified: true }]);
  await assert.rejects(malformed.api.getBusinessAccess(), /comprobar la verificación/);
});

test('enrollment submits fiscal fields under the existing identity and stores no passwords or approval', async () => {
  const f = dataFixture([{ id, verified: false }]); const data = { legal_name: 'Real company', tax_id: 'B12345678', trading_name: '', address: 'Real address' };
  await f.api.submitBusinessEnrollment(data, id);
  const [route, init, authenticated, owner] = f.calls[0];
  assert.equal(route, '/supabase/manage/enrollment'); assert.equal(init.method, 'POST');
  assert.equal(authenticated, true); assert.equal(owner, user);
  assert.deepEqual(JSON.parse(init.body), { ...data, business_id: id });
  assert.equal(f.storage.size, 1);
  f.storage.clear(); await assert.rejects(f.api.submitBusinessEnrollment(data), /Inicia sesión/);
  assert.equal(f.calls.length, 1);
});

function providerFixture() {
  let cursor = 0, tree, queue = [];
  const slots = [], requests = [], sessionListeners = new Set();
  let appListener;
  const mode = { activeMode: 'USER' };
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = { ...fakeReact(),
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = cursor++; return (slots[i] ??= { current: initial }); },
    useCallback(callback, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { deps, callback }; return slots[i].callback; },
    useEffect(callback, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) {
      const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup };
      queue.push(() => { previous?.cleanup?.(); slots[i].cleanup = callback(); });
    } },
  };
  const context = { exports: {}, require(name) {
    if (name === 'react') return { default: React, ...React };
    if (name === 'react-native') return { AppState: { currentState: 'active', addEventListener: (_event, listener) => { appListener = listener; return { remove() {} }; } } };
    if (name === './GoModeContext') return { useGoMode: () => mode };
    if (name === '@/data/businessAccess') return { getBusinessAccess: () => { const next = deferred(); requests.push(next); return next.promise; } };
    if (name === '@/lib/sessionEvents') return { onSessionChanged: listener => { sessionListeners.add(listener); return () => sessionListeners.delete(listener); } };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.createContext(context); vm.runInContext(transpile(read('contexts/GoBusinessAccessContext.tsx')), context);
  const render = (effects = true) => { cursor = 0; queue = []; tree = context.exports.GoBusinessAccessProvider({ children: 'child' });
    if (effects) for (const run of queue) run(); return tree.props.value; };
  render();
  return { requests, mode, render, commitEffects: () => { for (const run of queue) run(); }, event: () => { for (const listener of sessionListeners) listener(); },
    backgroundReturn: () => { appListener('background'); appListener('active'); },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); } };
}

test('provider checks context before rendering business content and shares simultaneous checks', async () => {
  const f = providerFixture(); assert.equal(f.requests.length, 1);
  const snapshot = { userId: user, business: { id, verified: true }, status: 'verificada' };
  f.requests[0].resolve(snapshot); await flush(); assert.equal(f.render().allowed, true);
  f.mode.activeMode = 'BUSINESS';
  const beforeEffects = f.render(false); assert.equal(beforeEffects.allowed, false); assert.equal(beforeEffects.loading, true);
  f.commitEffects();
  const a = f.render().refresh(), b = f.render().refresh();
  assert.equal(a, b); assert.equal(f.requests.length, 2);
  f.requests[1].resolve(snapshot); await a; assert.equal(f.render().allowed, true);
  f.backgroundReturn(); assert.equal(f.render().allowed, false); assert.equal(f.requests.length, 3);
  f.requests[2].resolve({ ...snapshot, business: { id, verified: false }, status: 'pendiente_verificacion' });
  await flush(); assert.equal(f.render().allowed, false);
  f.unmount();
});

test('logout cancels old permission responses and network errors fail closed without deleting sessions', async () => {
  const f = providerFixture(); f.event(); assert.equal(f.requests.length, 2);
  f.requests[0].resolve({ userId: user, business: { id, verified: true }, status: 'verificada' });
  await flush(); assert.equal(f.render().allowed, false);
  f.requests[1].resolve({ userId: null, business: null, status: 'sin_empresa' });
  await flush(); assert.equal(f.render().snapshot.userId, null);
  const pending = f.render().refresh(); f.requests[2].reject(new Error('offline')); await pending;
  const failed = f.render(); assert.equal(failed.allowed, false); assert.match(failed.error, /conexión/);
  f.unmount();
});

test('all direct business entries and configuration effects use the same permission boundary', () => {
  const home = read('app/index.tsx'), config = read('contexts/GoBusinessConfigContext.tsx');
  assert.match(home, /return <BusinessAccessGate><HomeScreenContent \/><\/BusinessAccessGate>/);
  assert.match(home, /const isBusinessMode = requestedBusinessMode && businessAccess.allowed/);
  for (const component of ['EmpresaPanel', 'GoAdminDashboard', 'VerificacionEmpresaPanel', 'ActivacionCobrosScreen']) {
    assert.match(home, new RegExp(`businessAccess\\.allowed && <${component}`));
  }
  assert.match(home, /if \(open\) setActiveMode\("BUSINESS"\)/);
  assert.match(home, /commitAccountType\(resolvedRole, false\)/);
  assert.match(home, /onSwitchContext=\{\(\) => \{ setGoAuthOpen\(false\); setActiveMode\(isBusinessMode \? "USER" : "BUSINESS"\)/);
  assert.match(config, /if \(!enterprise.allowed\)[\s\S]*?return;[\s\S]*?getCloudConfiguration/);
  assert.match(config, /if \(!permission.current\) return;/);
  assert.doesNotMatch(read('hooks/useVerification.ts'), /loadVerification/);
  assert.match(home, /color: "#ffffff",/);
  assert.equal((read('components/auth/LoginRegisterPanel.tsx').match(/name="chevron-down" size=\{13\}/g) ?? []).length, 2);
});

test('pending-company logout waits for local deletion and returns to existing authentication', async () => {
  const source = read('components/auth/BusinessAccessGate.tsx');
  const root = ts.createSourceFile('gate.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let logout;
  function find(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(root) === 'logout') logout = node.initializer;
    ts.forEachChild(node, find);
  }
  find(root); assert.ok(logout);
  const barrier = deferred(), events = [];
  const context = {
    AsyncStorage: { multiRemove: async keys => { events.push(['remove', plain(keys)]); await barrier.promise; } },
    syncModeFromRole: value => events.push(['role', value]), notifySessionChanged: () => events.push(['changed']),
    Alert: { alert: () => events.push(['error']) },
  };
  vm.createContext(context); vm.runInContext(transpile(`globalThis.logout = ${logout.getText(root)}`), context);
  const run = context.logout(); assert.deepEqual(events, [['remove', [sessionKey, 'go_account_type_v1']]]);
  barrier.resolve(); await run;
  assert.deepEqual(events.slice(1), [['role', null], ['changed']]);
});

test('enrollment requires a valid unverified acknowledgement and rejects a changed identity', async () => {
  const data = { legal_name: 'Empresa real', tax_id: 'B12345678', trading_name: '', address: 'Dirección' };
  for (const rows of [[], null, '<html>not an API</html>', [{ id, verified: true }], [{ id, verified: 'false' }], [{ id: 'bad', verified: false }]]) {
    const f = dataFixture(rows);
    await assert.rejects(f.api.submitBusinessEnrollment(data), error => error.code === 'ENROLLMENT_NOT_CONFIRMED');
  }
  const pending = deferred(), f = dataFixture(() => pending.promise);
  const submitted = f.api.submitBusinessEnrollment(data);
  await flush(); f.storage.delete(sessionKey); pending.resolve([{ id, verified: false }]);
  await assert.rejects(submitted, error => error.code === 'ENROLLMENT_SESSION_CHANGED');
});
