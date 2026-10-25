import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const transpile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { esModuleInterop: false, alwaysStrict: false,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const ownerId = '11111111-1111-4111-8111-111111111111';
const anotherId = '22222222-2222-4222-8222-222222222222';
const key = id => `go_owner_view_context_v1:${id}`;
const owner = (userId = ownerId) => ({ userId, allowed: true, level: 'owner', permissions: ['admin.access', 'ownership.manage'] });
const technical = { userId: ownerId, allowed: true, level: 'technical', permissions: ['admin.access', 'diagnostics'] };
const denied = (userId = ownerId) => ({ userId, allowed: false, level: null, permissions: [] });
const plain = value => JSON.parse(JSON.stringify(value));

function fixture({ storage = new Map(), slowRead, business = false, failWrite = false } = {}) {
  const requests = [], reads = [], writes = [], sessionListeners = new Set(), appListeners = new Set();
  let disposed = false, rendering = false, scheduled = false, currentHooks;
  const makeHooks = () => ({ slots: [], cursor: 0, effects: [] });
  const adminHooks = makeHooks(), viewHooks = makeHooks();
  let adminTree, viewTree, renderAll;
  const schedule = () => {
    if (scheduled || disposed) return;
    scheduled = true;
    queueMicrotask(() => { scheduled = false; if (!disposed) renderAll(); });
  };
  const sameDeps = (a, b) => a && b && a.length === b.length && a.every((value, i) => value === b[i]);
  const React = {
    createContext(value) { const context = { value }; context.Provider = { context }; return context; },
    createElement: (type, props, ...children) => ({ type, props, children }),
    useContext: context => context.value,
    useState(initial) {
      const hooks = currentHooks, i = hooks.cursor++;
      hooks.slots[i] ??= { value: initial };
      return [hooks.slots[i].value, next => {
        const previous = hooks.slots[i].value;
        const value = typeof next === 'function' ? next(previous) : next;
        if (!Object.is(value, previous)) { hooks.slots[i].value = value; schedule(); }
      }];
    },
    useRef(initial) { const hooks = currentHooks, i = hooks.cursor++; return hooks.slots[i] ??= { current: initial }; },
    useCallback(callback, deps) {
      const hooks = currentHooks, i = hooks.cursor++, old = hooks.slots[i];
      if (!old || !sameDeps(old.deps, deps)) hooks.slots[i] = { callback, deps };
      return hooks.slots[i].callback;
    },
    useEffect(callback, deps) {
      const hooks = currentHooks, i = hooks.cursor++, old = hooks.slots[i];
      if (!old || !sameDeps(old.deps, deps)) {
        const slot = { deps, cleanup: old?.cleanup };
        hooks.slots[i] = slot;
        hooks.effects.push(() => { old?.cleanup?.(); slot.cleanup = callback(); });
      }
    },
  };
  const AppState = {
    currentState: 'active',
    addEventListener(_name, listener) { appListeners.add(listener); return { remove: () => appListeners.delete(listener) }; },
  };
  const storageApi = {
    async getItem(name) {
      reads.push(name);
      return slowRead ? slowRead.promise : storage.get(name) ?? null;
    },
    async setItem(name, value) {
      if (failWrite) throw new Error('test storage failure');
      writes.push([name, value]); storage.set(name, value);
    },
  };
  const evaluate = (file, imports) => {
    const context = { exports: {}, require(name) {
      if (name in imports) return imports[name];
      throw new Error(`Unexpected import ${name}`);
    } };
    vm.createContext(context); vm.runInContext(transpile(file), context); return context.exports;
  };
  const policy = evaluate('data/goViewPolicy.ts', {});
  const adminApi = evaluate('contexts/GoAdminAccessContext.tsx', {
    '@/lib/authTrace': { recordAuthTrace:()=>{} },
    react: { default: React, ...React }, 'react-native': { AppState },
    '@/data/adminAccess': { getAdminAccess: () => { const next = deferred(); requests.push(next); return next.promise; } },
    '@/lib/sessionEvents': { onSessionChanged: listener => { sessionListeners.add(listener); return () => sessionListeners.delete(listener); } },
  });
  const viewApi = evaluate('contexts/GoViewContext.tsx', {
    react: { default: React, ...React },
    '@react-native-async-storage/async-storage': { default: storageApi },
    './GoAdminAccessContext': adminApi,
    './GoModeContext': { useGoMode: () => ({ isBusinessMode: business }) },
    '@/data/goViewPolicy': policy,
  });
  const render = (hooks, provider) => {
    currentHooks = hooks; hooks.cursor = 0; hooks.effects = [];
    const tree = provider({ children: 'child' });
    tree.type.context.value = tree.props.value;
    return tree;
  };
  renderAll = () => {
    if (rendering || disposed) return;
    rendering = true;
    adminTree = render(adminHooks, adminApi.GoAdminAccessProvider);
    viewTree = render(viewHooks, viewApi.GoViewProvider);
    rendering = false;
    for (const hooks of [adminHooks, viewHooks]) for (const effect of hooks.effects) effect();
  };
  renderAll();
  return {
    requests, reads, writes, storage,
    get admin() { return adminTree.props.value; },
    get view() { return viewTree.props.value; },
    async flush() { for (let i = 0; i < 24; i++) { await Promise.resolve(); } },
    sessionChanged() { for (const listener of sessionListeners) listener(); },
    appState(next) { AppState.currentState = next; for (const listener of appListeners) listener(next); },
    unmount() {
      disposed = true;
      for (const hooks of [viewHooks, adminHooks]) for (const slot of hooks.slots) slot?.cleanup?.();
    },
  };
}

async function authorize(f, access = owner()) {
  f.requests.at(-1).resolve(access); await f.flush();
}

test('stored USER/BUSINESS owner context never flashes ADMIN while the preference is loading', async () => {
  for (const saved of ['USER', 'BUSINESS']) {
    const read = deferred(), f = fixture({ slowRead: read });
    await authorize(f);
    assert.equal(f.admin.isOwner, true);
    assert.equal(f.view.loaded, false);
    assert.equal(f.view.view, 'USER');
    assert.equal(f.view.isAdminView, false);
    read.resolve(saved); await f.flush();
    assert.equal(f.view.loaded, true);
    assert.equal(f.view.view, saved);
    assert.equal(f.view.isAdminView, false);
    assert.equal(f.view.isBusinessPreview, saved === 'BUSINESS');
    f.unmount();
  }
});

test('a confirmed owner defaults to ADMIN only after storage returns no preference', async () => {
  const read = deferred(), f = fixture({ slowRead: read });
  await authorize(f);
  assert.equal(f.view.view, 'USER');
  read.resolve(null); await f.flush();
  assert.equal(f.view.view, 'ADMIN'); assert.equal(f.view.isAdminView, true);
  assert.equal(f.view.isOwner, true); assert.equal(f.view.loaded, true);
  assert.deepEqual(f.reads, [key(ownerId)]);
  f.unmount();
});

test('owner selection requires a fresh owner result and shares the existing permission check', async () => {
  const f = fixture(); await authorize(f);
  const select = f.view.selectOwnerView('USER');
  const a = f.admin.refresh(), b = f.admin.refresh();
  assert.equal(a, b); assert.equal(f.requests.length, 2);
  await f.flush();
  assert.equal(f.admin.allowed, false); assert.equal(f.admin.level, null);
  assert.deepEqual(plain(f.admin.permissions), []);
  assert.equal(f.view.view, 'ADMIN'); assert.equal(f.view.isAdminView, false);
  f.requests[1].resolve(owner());
  assert.equal(await select, true); await f.flush();
  assert.equal(f.view.view, 'USER'); assert.equal(f.view.isAdminView, false);
  assert.equal(f.admin.allowed, true); assert.equal(f.admin.isOwner, true);
  assert.deepEqual(f.writes, [[key(ownerId), 'USER']]);
  f.unmount();
});

test('owner BUSINESS preview remains visual and does not modify normal GoMode or identity', async () => {
  const f = fixture(); await authorize(f);
  const select = f.view.selectOwnerView('BUSINESS');
  f.requests[1].resolve(owner()); assert.equal(await select, true); await f.flush();
  assert.equal(f.view.view, 'BUSINESS'); assert.equal(f.view.isBusinessPreview, true);
  assert.equal(f.view.isAdminView, false); assert.equal(f.admin.userId, ownerId);
  assert.equal(f.admin.level, 'owner'); assert.deepEqual(f.writes, [[key(ownerId), 'BUSINESS']]);
  f.unmount();
});

test('normal Usuario/Empresa cannot obtain ADMIN from a stored preference or a selection request', async () => {
  for (const business of [false, true]) {
    const f = fixture({ business, storage: new Map([[key(ownerId), 'ADMIN']]) });
    await authorize(f, denied());
    assert.equal(f.view.view, business ? 'BUSINESS' : 'USER');
    assert.equal(f.view.isOwner, false); assert.equal(f.view.isAdminView, false);
    assert.equal(f.view.isBusinessPreview, false); assert.deepEqual(f.reads, []);
    const select = f.view.selectOwnerView('ADMIN');
    f.requests[1].resolve(denied()); assert.equal(await select, false); await f.flush();
    assert.deepEqual(f.writes, []); assert.equal(f.admin.allowed, false);
    f.unmount();
  }
});

test('technical access remains ADMIN but cannot select owner contexts or consume owner preferences', async () => {
  const f = fixture({ storage: new Map([[key(ownerId), 'BUSINESS']]) });
  await authorize(f, technical);
  assert.equal(f.view.view, 'ADMIN'); assert.equal(f.view.isAdminView, true);
  assert.equal(f.view.isOwner, false); assert.deepEqual(f.reads, []);
  const select = f.view.selectOwnerView('BUSINESS');
  f.requests[1].resolve(technical); assert.equal(await select, false); await f.flush();
  assert.equal(f.view.view, 'ADMIN'); assert.equal(f.view.isBusinessPreview, false);
  assert.deepEqual(f.writes, []); f.unmount();
});

test('revocation and temporary failures discard effective owner context without modifying a session', async () => {
  for (const failure of ['denied', 'offline']) {
    const f = fixture({ storage: new Map([[key(ownerId), 'BUSINESS']]) });
    await authorize(f); assert.equal(f.view.isBusinessPreview, true);
    const refresh = f.admin.refresh(); await f.flush();
    assert.equal(f.view.view, 'BUSINESS'); assert.equal(f.view.isBusinessPreview, false);
    if (failure === 'denied') f.requests[1].resolve(denied());
    else f.requests[1].reject(new Error('test offline'));
    assert.equal(await refresh, false); await f.flush();
    // Unavailability retains only the cosmetic choice; a confirmed denial returns to User.
    assert.equal(f.view.view, failure === 'offline' ? 'BUSINESS' : 'USER'); assert.equal(f.view.isOwner, false);
    assert.equal(f.admin.unavailable, failure === 'offline');
    assert.equal(f.view.isAdminView, false); assert.equal(f.view.isBusinessPreview, false);
    assert.deepEqual(f.writes, []); f.unmount();
  }
});

test('logout/session changes reject an obsolete owner selection and isolate preferences by UUID', async () => {
  const f = fixture({ storage: new Map([[key(ownerId), 'BUSINESS'], [key(anotherId), 'USER']]) });
  await authorize(f);
  const select = f.view.selectOwnerView('ADMIN'); await f.flush();
  f.sessionChanged(); await f.flush();
  assert.equal(f.requests.length, 3); assert.equal(f.view.isOwner, false);
  f.requests[1].resolve(owner()); assert.equal(await select, false); await f.flush();
  assert.equal(f.admin.allowed, false);
  f.requests[2].resolve(owner(anotherId)); await f.flush();
  assert.equal(f.admin.userId, anotherId); assert.equal(f.view.view, 'USER');
  assert.deepEqual(f.reads, [key(ownerId), key(anotherId)]);
  assert.deepEqual(f.writes, []); assert.equal(f.storage.get(key(ownerId)), 'BUSINESS');
  f.unmount();
});

test('foreground revalidation preserves selected USER/BUSINESS without retaining authorization', async () => {
  for (const saved of ['USER', 'BUSINESS']) {
    const f = fixture({ storage: new Map([[key(ownerId), saved]]) }); await authorize(f);
    f.appState('background'); await f.flush();
    assert.equal(f.view.view, saved); assert.equal(f.admin.allowed, false);
    assert.equal(f.view.isAdminView, false); assert.equal(f.view.isBusinessPreview, false);
    f.appState('active'); await f.flush();
    assert.equal(f.view.view, saved); assert.equal(f.requests.length, 2);
    f.requests[1].resolve(owner()); await f.flush();
    assert.equal(f.view.view, saved); assert.equal(f.admin.isOwner, true);
    assert.deepEqual(f.reads, [key(ownerId)]); f.unmount();
  }
});

test('concurrent selections use one fresh permission request and commit only the latest preference', async () => {
  const f = fixture(); await authorize(f);
  const first = f.view.selectOwnerView('USER'), last = f.view.selectOwnerView('BUSINESS');
  assert.equal(f.requests.length, 2);
  f.requests[1].resolve(owner());
  assert.equal(await first, false); assert.equal(await last, true); await f.flush();
  assert.equal(f.view.view, 'BUSINESS'); assert.deepEqual(f.writes, [[key(ownerId), 'BUSINESS']]);
  f.unmount();
});

test('storage failures cannot grant owner access and failed persistence preserves the existing choice', async () => {
  const read = deferred(), f = fixture({ slowRead: read, failWrite: true });
  await authorize(f); read.reject(new Error('test storage failure')); await f.flush();
  assert.equal(f.view.view, 'ADMIN'); assert.equal(f.admin.isOwner, true);
  const select = f.view.selectOwnerView('USER'); f.requests[1].resolve(owner());
  assert.equal(await select, false); await f.flush();
  assert.equal(f.view.view, 'ADMIN'); assert.deepEqual(f.writes, []); f.unmount();
});

test('fresh owner validation is bound to the expected UUID and cannot grant after unmount', async () => {
  const f = fixture(); await authorize(f);
  const wrongIdentity = f.admin.refreshOwner(anotherId);
  f.requests[1].resolve(owner()); assert.equal(await wrongIdentity, false);
  const obsolete = f.admin.refreshOwner(ownerId); f.unmount();
  f.requests[2].resolve(owner()); assert.equal(await obsolete, false);
});

test('a failed selection while storage is loading cannot strand the owner or cancel the existing preference read', async () => {
  const read = deferred(), f = fixture({ slowRead: read, failWrite: true });
  await authorize(f);
  assert.equal(f.view.loaded, false);
  const select = f.view.selectOwnerView('BUSINESS'); f.requests[1].resolve(owner());
  assert.equal(await select, false); await f.flush();
  read.resolve('USER'); await f.flush();
  assert.equal(f.view.loaded, true); assert.equal(f.view.view, 'USER');
  assert.equal(f.admin.isOwner, true); assert.deepEqual(f.writes, []); f.unmount();
});

test('a late initial storage read cannot replace a successfully selected owner context', async () => {
  const read = deferred(), f = fixture({ slowRead: read });
  await authorize(f);
  const select = f.view.selectOwnerView('BUSINESS'); f.requests[1].resolve(owner());
  assert.equal(await select, true); await f.flush();
  read.resolve('ADMIN'); await f.flush();
  assert.equal(f.view.loaded, true); assert.equal(f.view.view, 'BUSINESS');
  assert.deepEqual(f.writes, [[key(ownerId), 'BUSINESS']]); f.unmount();
});

test('all three selected owner contexts survive repeated background revalidation and temporary errors without granting authority', async () => {
  for (const saved of ['ADMIN', 'BUSINESS', 'USER']) {
    const f = fixture({ storage: new Map([[key(ownerId), saved]]) });
    await authorize(f);
    f.appState('inactive'); f.appState('background'); await f.flush();
    assert.equal(f.view.view, saved); assert.equal(f.admin.allowed, false);
    f.appState('active'); await f.flush();
    f.requests[1].reject(new Error('temporary network loss')); await f.flush();
    assert.equal(f.view.view, saved); assert.equal(f.admin.unavailable, true);
    assert.equal(f.view.isOwner, false); assert.equal(f.view.isAdminView, false); assert.equal(f.view.isBusinessPreview, false);
    const check = f.admin.refresh(); f.requests[2].resolve(owner()); assert.equal(await check, true); await f.flush();
    assert.equal(f.view.view, saved); assert.equal(f.view.isOwner, true);
    assert.deepEqual(f.reads, [key(ownerId)]); assert.deepEqual(f.writes, []);
    assert.equal(f.storage.get(key(ownerId)), saved);
    f.unmount();
  }
});

test('after permission revocation no saved owner context or temporary identity retention can restore ADMIN authority', async () => {
  for (const saved of ['ADMIN', 'BUSINESS', 'USER']) {
    const f = fixture({ storage: new Map([[key(ownerId), saved]]) }); await authorize(f);
    const check = f.admin.refresh(); f.requests[1].resolve(denied()); assert.equal(await check, false); await f.flush();
    assert.equal(f.view.view, 'USER'); assert.equal(f.view.isOwner, false); assert.equal(f.view.isAdminView, false);
    assert.equal(f.view.isBusinessPreview, false); assert.equal(f.admin.unavailable, false);
    assert.equal(f.storage.get(key(ownerId)), saved); assert.deepEqual(f.writes, []); f.unmount();
  }
});
