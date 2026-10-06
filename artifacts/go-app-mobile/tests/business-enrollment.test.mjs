import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const transpile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const enrollment = { legal_name: 'Empresa real', tax_id: 'B12345678', trading_name: 'Nombre público', address: 'Dirección de prueba' };

function fixture(shared = new Map()) {
  const logs = [], calls = [], events = [];
  const behavior = { storageFailure: false, submitFailure: null, barrier: null };
  const storage = {
    getItem: async key => shared.get(key) ?? null,
    setItem: async (key, value) => { if (behavior.storageFailure) throw new Error('Disk failure'); shared.set(key, value); },
    removeItem: async key => { shared.delete(key); },
    multiRemove: async keys => { for (const key of keys) shared.delete(key); },
  };
  const modules = new Map();
  const load = (file, imports) => {
    const context = { exports: {}, console: { warn: (...args) => logs.push(plain(args)) }, require: imports };
    vm.createContext(context); vm.runInContext(transpile(readFileSync(file, 'utf8')), context);
    return context.exports;
  };
  const draft = load('data/businessEnrollmentDraft.ts', name => {
    if (name === '@react-native-async-storage/async-storage') return { default: storage };
    throw new Error(name);
  });
  let cursor = 0, effects = [], tree;
  const slots = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const React = {
    Fragment: 'fragment', createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }),
    useState(initial) { const i = cursor++; slots[i] ??= { value: typeof initial === 'function' ? initial() : initial };
      return [slots[i].value, next => { slots[i].value = typeof next === 'function' ? next(slots[i].value) : next; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ??= { current: initial }; },
    useEffect(callback, deps) { const i = cursor++;
      if (!slots[i] || !same(slots[i].deps, deps)) {
        const previous = slots[i]; slots[i] = { deps, cleanup: previous?.cleanup };
        effects.push(() => { previous?.cleanup?.(); slots[i].cleanup = callback(); });
      }
    },
  };
  const access = { snapshot: { userId: 'owner-a', business: null, status: 'sin_empresa' },
    allowed: false, loading: false, error: null, refresh: async () => { events.push('refresh'); } };
  const gate = load('components/auth/BusinessAccessGate.tsx', name => {
    if (name === 'react') return { default: React, ...React };
    if (name === '@react-native-async-storage/async-storage') return { default: storage };
    if (name === 'react-native') return { Platform: { OS: 'ios' }, KeyboardAvoidingView: 'keyboard', ScrollView: 'scroll',
      TextInput: 'input', TouchableOpacity: 'button', View: 'view', Text: 'text', ActivityIndicator: 'spinner',
      StyleSheet: { create: value => value }, Alert: { alert() {} } };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 0, bottom: 0 }) };
    if (name === '@/contexts/GoBusinessAccessContext') return { useBusinessAccess: () => access };
    if (name === '@/contexts/GoModeContext') return { useGoMode: () => ({ loaded: true, isBusinessMode: true,
      setActiveMode: mode => events.push(mode), syncModeFromRole: role => events.push(role) }) };
    if (name === '@/data/businessEnrollmentDraft') return draft;
    if (name === '@/data/businessAccess') return { submitBusinessEnrollment: async (...args) => {
      calls.push(plain(args)); if (behavior.barrier) await behavior.barrier.promise;
      if (behavior.submitFailure) throw behavior.submitFailure;
      return { id: 'stored-business', verified: false };
    } };
    if (name === '@/lib/sessionEvents') return { notifySessionChanged: () => events.push('session') };
    throw new Error(name);
  });
  const Screen = gate.BusinessAccessGate({ children: 'private' }).type;
  const nodes = node => {
    if (!node || typeof node !== 'object') return [];
    if (Array.isArray(node)) return node.flatMap(nodes);
    return [node, ...(node.children ?? []).flatMap(nodes)];
  };
  const render = () => { cursor = 0; effects = []; tree = Screen(); for (const run of effects) run(); return tree; };
  const fields = () => nodes(tree).filter(node => node.type === 'input');
  const submit = () => nodes(tree).find(node => node.type === 'button' && node.children[0]?.children.some(text => /Enviar para|Enviando/.test(text))).props.onPress();
  const fill = async data => { render(); for (const [index, field] of Object.keys(data).entries()) { fields()[index].props.onChangeText(data[field]); render(); } await flush(); render(); };
  return { draft, shared, behavior, logs, calls, events, access, render, fields, fill, submit,
    text: () => nodes(tree).filter(node => node.type === 'text').flatMap(node => node.children).join(' '),
    unmount: () => { for (const slot of slots) slot?.cleanup?.(); } };
}

test('edits persist through background/remount and stay isolated by owner and business', async () => {
  const f = fixture(); f.render(); await flush(); await f.fill(enrollment);
  const key = f.draft.businessEnrollmentDraftKey('owner-a');
  assert.deepEqual(JSON.parse(f.shared.get(key)), enrollment);
  f.unmount();
  const resumed = fixture(f.shared); resumed.render(); await flush(); resumed.render();
  assert.deepEqual(resumed.fields().map(node => node.props.value), Object.values(enrollment));
  resumed.access.snapshot = { ...resumed.access.snapshot, business: null };
  resumed.render(); assert.equal(resumed.fields()[0].props.value, enrollment.legal_name);
  resumed.access.snapshot = { userId: 'owner-b', business: null, status: 'sin_empresa' };
  resumed.render(); await flush(); resumed.render();
  assert.ok(resumed.fields().every(node => node.props.value === ''));
  assert.notEqual(key, f.draft.businessEnrollmentDraftKey('owner-a', 'other-business'));
  assert.deepEqual(JSON.parse(f.shared.get(key)), enrollment);
});

test('ordered drafts keep the newest edit and a late successful submission cannot erase newer edits', async () => {
  const f = fixture(), key = f.draft.businessEnrollmentDraftKey('owner-a');
  const first = f.draft.saveBusinessEnrollmentDraft(key, enrollment);
  const newer = { ...enrollment, address: 'Nueva dirección' };
  const second = f.draft.saveBusinessEnrollmentDraft(key, newer);
  await Promise.all([first, second]);
  await f.draft.clearBusinessEnrollmentDraft(key, enrollment);
  assert.deepEqual(plain(await f.draft.loadBusinessEnrollmentDraft(key)), newer);
  await f.draft.clearBusinessEnrollmentDraft(key, newer);
  assert.equal(await f.draft.loadBusinessEnrollmentDraft(key), null);
});

test('404/network/technical errors preserve the draft and show only the user message', async () => {
  for (const failure of [Object.assign(new Error('Cannot POST /backend/enrollment'), { status: 404 }), new Error('SQL rpc missing')]) {
    const f = fixture(); f.render(); await flush(); await f.fill(enrollment);
    f.behavior.submitFailure = failure; await f.submit(); f.render();
    assert.match(f.text(), /No hemos podido enviar tu solicitud.*Tus datos se han conservado/);
    assert.doesNotMatch(f.text(), /Cannot POST|SQL|actualización del backend/);
    assert.deepEqual(JSON.parse(f.shared.get(f.draft.businessEnrollmentDraftKey('owner-a'))), enrollment);
    assert.equal(f.events.length, 0); assert.equal(f.access.allowed, false);
    assert.ok(f.logs.some(entry => entry[1].stage === 'submit'));
  }
});

test('repeated taps submit once, clear only after acknowledgement, and leave verification to the provider', async () => {
  const f = fixture(); f.render(); await flush(); await f.fill(enrollment);
  f.behavior.barrier = deferred();
  const first = f.submit(); const repeat = f.submit(); await flush();
  assert.equal(f.calls.length, 1);
  assert.ok(f.shared.has(f.draft.businessEnrollmentDraftKey('owner-a')));
  f.behavior.barrier.resolve(); await Promise.all([first, repeat]); f.render();
  assert.equal(f.shared.has(f.draft.businessEnrollmentDraftKey('owner-a')), false);
  assert.deepEqual(f.events, ['refresh']); assert.equal(f.access.allowed, false);
});

test('storage failure prevents submission and never claims the data was preserved', async () => {
  const f = fixture(); f.render(); await flush(); await f.fill(enrollment);
  f.behavior.storageFailure = true; await f.submit(); f.render();
  assert.equal(f.calls.length, 0); assert.match(f.text(), /No hemos podido guardar tus datos/);
  assert.doesNotMatch(f.text(), /Tus datos se han conservado/);
});

test('iPhone form uses keyboard avoidance, scroll, and next/done input navigation', async () => {
  const f = fixture(); f.render(); await flush(); const root = f.render();
  assert.equal(root.type, 'keyboard'); assert.equal(root.props.behavior, 'padding');
  assert.equal(root.children[0].type, 'scroll');
  assert.equal(root.children[0].props.keyboardShouldPersistTaps, 'handled');
  assert.equal(root.children[0].props.keyboardDismissMode, 'interactive');
  assert.deepEqual(f.fields().map(node => node.props.returnKeyType), ['next', 'next', 'next', 'done']);
});
