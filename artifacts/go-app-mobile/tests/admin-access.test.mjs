import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json')), ts = require('typescript');
const read = file => readFileSync(file, 'utf8');
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const userId = '11111111-1111-4111-8111-111111111111', key = 'go_supabase_session_v1';
const plain = value => JSON.parse(JSON.stringify(value));

function dataFixture(reply) {
  class BookingApiError extends Error { constructor(status) { super('denied'); this.status = status; } }
  const storage = new Map([[key, JSON.stringify({ access_token: 'test-only', user: { id: userId, user_metadata: { role: 'admin' } } })]]);
  const calls = [];
  const context = { exports: {}, require(name) {
    if (name === '@react-native-async-storage/async-storage') return { default: { getItem: async k => storage.get(k) ?? null } };
    if (name === './booking') return { BookingApiError,
      getAuthenticatedUserId: async () => storage.has(key) ? userId : null,
      supabaseApiRequest: async (...args) => { calls.push(args); return typeof reply === 'function' ? reply() : reply; },
    };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.createContext(context); vm.runInContext(transpile(read('data/adminAccess.ts')), context);
  return { api: context.exports, storage, calls, BookingApiError };
}

test('ADMIN permission requires the authenticated server response for the same current identity', async () => {
  const f = dataFixture({ userId, role: 'admin', allowed: true, level: 'technical', permissions: ['admin.access', 'diagnostics'] });
  assert.deepEqual(plain(await f.api.getAdminAccess()), { userId, allowed: true });
  assert.deepEqual(plain(f.calls[0]), ['/supabase/admin/access', {}, true, userId]);
  for (const reply of [{ userId, role: 'usuario', allowed: true }, { userId, role: 'admin', allowed: 'true' },
    { userId: 'another-user', role: 'admin', allowed: true },
    { userId, role: 'admin', allowed: true },
    { userId, role: 'admin', allowed: true, level: 'technical', permissions: ['admin.access', 'ownership.manage'] },
    { userId, role: 'admin', allowed: true, level: 'owner', permissions: [] }, null, '<html>']) {
    await assert.rejects(dataFixture(reply).api.getAdminAccess(), /authorization response/);
  }
  f.storage.delete(key);
  assert.deepEqual(plain(await f.api.getAdminAccess()), { userId: null, allowed: false });
  assert.equal(f.calls.length, 1);
  assert.equal((await dataFixture({ userId, role: 'admin', allowed: true, level: 'owner',
    permissions: ['admin.access', 'memberships.manage', 'ownership.manage'] }).api.getAdminAccess()).allowed, true);
});

test('denials and temporary failures never erase a session; stale session responses cannot grant ADMIN', async () => {
  for (const status of [401, 403]) {
    const f = dataFixture(() => { throw new f.BookingApiError(status); });
    assert.equal((await f.api.getAdminAccess()).allowed, false); assert.equal(f.storage.has(key), true);
  }
  const offline = dataFixture(() => { throw new Error('offline'); });
  await assert.rejects(offline.api.getAdminAccess(), /offline/); assert.equal(offline.storage.has(key), true);
  const next = deferred(), f = dataFixture(() => next.promise), request = f.api.getAdminAccess();
  await flush(); f.storage.set(key, 'a new session'); next.resolve({ userId, role: 'admin', allowed: true });
  await assert.rejects(request, /Session changed/);
});

function providerFixture() {
  const slots = [], listeners = new Set(), requests = []; let cursor = 0, effects = [], appListener;
  const React = { createContext: () => ({ Provider: 'provider' }),
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState(initial) { const i = cursor++; if (!slots[i]) slots[i] = { value: initial }; return [slots[i].value, v => { slots[i].value = v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useCallback(callback) { const i = cursor++; return slots[i] ??= callback; },
    useEffect(callback, deps) { const i = cursor++; if (!slots[i] || deps.some((v, n) => v !== slots[i].deps[n])) {
      const old = slots[i]; slots[i] = { deps, cleanup: old?.cleanup }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = callback(); });
    } },
  };
  const AppState = { currentState: 'active', addEventListener: (_event, listener) => { appListener = listener; return { remove() {} }; } };
  const context = { exports: {}, require(name) {
    if (name === 'react') return { default: React, ...React };
    if (name === 'react-native') return { AppState };
    if (name === '@/data/adminAccess') return { getAdminAccess: () => { const next = deferred(); requests.push(next); return next.promise; } };
    if (name === '@/lib/sessionEvents') return { onSessionChanged: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.createContext(context); vm.runInContext(transpile(read('contexts/GoAdminAccessContext.tsx')), context);
  const render = () => { cursor = 0; effects = []; const tree = context.exports.GoAdminAccessProvider({ children: 'child' }); for (const run of effects) run(); return tree.props.value; };
  render();
  return { requests, render, event: () => { for (const listener of listeners) listener(); },
    appState: next => { AppState.currentState = next; appListener(next); },
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); } };
}

test('shared permission checks reject logout/stale responses and recheck after background or revocation', async () => {
  const f = providerFixture(); assert.equal(f.render().allowed, false);
  const a = f.render().refresh(), b = f.render().refresh(); assert.equal(a, b); assert.equal(f.requests.length, 1);
  f.event(); assert.equal(f.requests.length, 2);
  f.requests[0].resolve({ userId, allowed: true }); assert.equal(await a, false);
  f.requests[1].resolve({ userId: null, allowed: false }); await flush(); assert.equal(f.render().allowed, false);
  const current = f.render().refresh(); f.requests[2].resolve({ userId, allowed: true });
  assert.equal(await current, true); assert.equal(f.render().allowed, true);
  f.appState('background'); assert.equal(f.render().allowed, false);
  f.appState('active'); f.requests[3].resolve({ userId, allowed: false }); await flush(); assert.equal(f.render().allowed, false);
  const offline = f.render().refresh(); f.requests[4].reject(new Error('offline')); assert.equal(await offline, false);
  f.unmount();
});

test('public account selection is Empresa then Usuario; every existing ADMIN entry is permission guarded', () => {
  const auth = read('components/auth/LoginRegisterPanel.tsx');
  const source = ts.createSourceFile('auth.tsx', auth, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const roleOptions = source.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'getRoleOptions');
  const roles = [...roleOptions.getText(source).matchAll(/role: "(\w+)"/g)].map(m => m[1]);
  assert.deepEqual(roles, ['empresa', 'usuario']);
  assert.doesNotMatch(auth, /IS_INTERNAL_ADMIN/);
  const setup = auth.slice(auth.indexOf('{/* ── SETUP:'), auth.indexOf('{/* ── ACTIVE ACCOUNT'));
  assert.doesNotMatch(setup, /onOpenAdmin|adminCard|>ADMIN</);
  assert.match(auth, /adminAccess.allowed && \(/);
  const home = read('app/index.tsx');
  assert.match(home, /if \(await adminAccess.refresh\(\)\)/);
  assert.match(home, /adminAccess.allowed && <GoAdminDashboard/);
  assert.match(home, /resolvedRole === "admin" \? "usuario" : resolvedRole/);
  const panel = read('components/empresa/EmpresaPanel.tsx');
  assert.match(panel, /filter\(m => m.key !== "admin" \|\| adminAccess.allowed\)/);
  assert.match(panel, /if \(key === "admin" && !adminAccess.allowed\) return/);
  assert.match(panel, /initialModulo === "admin" && !adminAccess.allowed \? "home"/);
  for (const file of ['AdminScreen', 'GoAdminDashboard']) {
    assert.match(read(`components/empresa/${file}.tsx`), /if \(!adminAccess.allowed\) return null/);
  }
});
