import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import life from './helpers/react-lifecycle.cjs';
import { fixture as calendarFixture } from './helpers/calendar-fixture.mjs';
import { fixture as containerFixture, ast, find, transpile } from './helpers/calendar-container-fixture.mjs';

const { React, createRoot, document, evaluate, ts } = life;
const tick = () => new Promise(resolve => setImmediate(resolve));
const act = callback => React.act(async () => { await callback(); });
function disk(seed = []) {
  const values = new Map(seed), writes = [];
  return { values, writes, storage: {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); writes.push([key, value]); },
  } };
}
const loadPreference = storage => evaluate('hooks/useConfigPanelPreference.ts', {
  '@react-native-async-storage/async-storage': storage,
});
async function mountPreference(api, names = Object.values(api.CONFIG_PANEL_KEYS), storage) {
  const host = document.createElement('div'), root = createRoot(host);
  let current;
  function Probe({ names, storage }) {
    current = Object.fromEntries(names.map(key => [key, api.useConfigPanelPreference(key, false, storage)]));
    return null;
  }
  const render = async (props = {}) => act(() => root.render(React.createElement(Probe, { names, storage, ...props })));
  await render();
  return { render, value: key => current[key][0], choose: (key, value) => act(() => current[key][1](value)),
    close: () => act(() => root.unmount()) };
}

test('each screen restores both choices independently, including the existing Calendar key, without writing during restore', async () => {
  const d = disk([['cal_config_visible_v1', 'true'], ['agenda_config_visible_v1', 'false'],
    ['reservas_config_visible_v1', 'true'], ['list_filters_hidden_v1', 'false'], ['cal_density', '15min']]);
  let api = loadPreference(d.storage), ui = await mountPreference(api);
  const names = Object.values(api.CONFIG_PANEL_KEYS);
  assert.equal(api.CONFIG_PANEL_KEYS.calendar, 'cal_config_visible_v1');
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(d.writes, []);
  try {
    for (const name of names) for (const value of [true, false]) {
      const others = names.filter(key => key !== name).map(key => [key, ui.value(key)]);
      await ui.choose(name, value);
      await ui.render(); // The parent can hide and show its screen without changing the preference.
      assert.equal(ui.value(name), value);
      for (const [key, previous] of others) assert.equal(ui.value(key), previous);
      assert.equal(d.values.get(name), String(value));
      const writeCount = d.writes.length;
      await ui.close();
      api = loadPreference(d.storage); // Fresh module and hooks, as on an app restart.
      ui = await mountPreference(api);
      assert.equal(ui.value(name), value);
      for (const [key, previous] of others) assert.equal(ui.value(key), previous);
      assert.equal(d.writes.length, writeCount);
    }
    assert.equal(d.values.get('cal_density'), '15min');
  } finally { await ui.close(); }
});

test('missing or invalid preferences are not initialized or overwritten and never block manual opening', async () => {
  const d = disk([['cal_config_visible_v1', 'invalid'], ['agenda_config_visible_v1', 'null']]);
  const api = loadPreference(d.storage), names = Object.values(api.CONFIG_PANEL_KEYS);
  const before = [...d.values], ui = await mountPreference(api);
  try {
    assert.deepEqual([...d.values], before);
    assert.deepEqual(d.writes, []);
    for (const name of names) {
      assert.equal(ui.value(name), false);
      await ui.choose(name, true);
      assert.equal(ui.value(name), true);
    }
  } finally { await ui.close(); }
});

test('late hydration cannot undo the last direct user choice', async () => {
  const d = disk(), reads = new Map();
  d.storage.getItem = key => new Promise(resolve => reads.set(key, resolve));
  const api = loadPreference(d.storage), names = Object.values(api.CONFIG_PANEL_KEYS), ui = await mountPreference(api);
  try {
    for (const name of names) {
      await ui.choose(name, true);
      await ui.choose(name, false);
      await ui.choose(name, previous => !previous);
    }
    await act(() => { for (const resolve of reads.values()) resolve('false'); });
    for (const name of names) assert.equal(ui.value(name), true);
    assert.deepEqual(d.writes.map(([, value]) => value), names.flatMap(() => ['true', 'false', 'true']));
  } finally { await ui.close(); }
});

test('rapid close and remount waits for ordered saves instead of restoring an older choice', async () => {
  const d = disk(); let release;
  const gate = new Promise(resolve => { release = resolve; });
  d.storage.setItem = async (key, value) => { if (value === 'true') await gate; d.values.set(key, value); d.writes.push([key, value]); };
  const api = loadPreference(d.storage), name = api.CONFIG_PANEL_KEYS.calendar;
  let ui = await mountPreference(api, [name]);
  await ui.choose(name, true);
  await ui.choose(name, false);
  await ui.close();
  ui = await mountPreference(api, [name]);
  try {
    assert.deepEqual(d.writes, []);
    await act(() => release());
    assert.equal(ui.value(name), false);
    assert.deepEqual(d.writes, [[name, 'true'], [name, 'false']]);
  } finally { await ui.close(); }
});

test('switching screen keys or DEMO storage ignores stale reads and retains separate documents', async () => {
  const live = disk(), demo = disk([['reservas_config_visible_v1', 'true']]); let restore;
  live.storage.getItem = () => new Promise(resolve => { restore = resolve; });
  const api = loadPreference(live.storage), name = api.CONFIG_PANEL_KEYS.reservations;
  const ui = await mountPreference(api, [name]);
  try {
    await ui.render({ names: [name], storage: demo.storage });
    assert.equal(ui.value(name), true);
    await act(() => restore('false'));
    assert.equal(ui.value(name), true);
    await ui.choose(name, false);
    assert.equal(demo.values.get(name), 'false');
    assert.deepEqual(live.writes, []);
    await ui.render({ names: [api.CONFIG_PANEL_KEYS.agenda], storage: demo.storage });
    assert.equal(ui.value(api.CONFIG_PANEL_KEYS.agenda), false);
    assert.equal(demo.values.get(name), 'false');
  } finally { await ui.close(); }
});

test('unavailable persistence still permits manual use and the next successful save', async () => {
  const d = disk(); let fail = true;
  d.storage.getItem = async () => { throw Error('Storage unavailable'); };
  d.storage.setItem = async (key, value) => { if (fail) throw Error('Storage unavailable'); d.values.set(key, value); };
  const api = loadPreference(d.storage), name = api.CONFIG_PANEL_KEYS.calendar, ui = await mountPreference(api, [name]);
  try {
    await ui.choose(name, true); assert.equal(ui.value(name), true);
    await ui.choose(name, false); assert.equal(ui.value(name), false);
    fail = false;
    await ui.choose(name, true);
    assert.equal(d.values.get(name), 'true');
  } finally { await ui.close(); }
});

const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.children ?? []).flatMap(nodes)];
for (const [file, component, label, key, extra] of [
  ['components/AgendaOperativa.tsx', 'AgendaOperativa', 'Abrir configuración', 'agenda_config_visible_v1', { visible: true }],
  ['components/booking/GoReservasConfigScreen.tsx', 'GoReservasConfigScreen', 'Configuración de reservas', 'reservas_config_visible_v1', {}],
]) test(`${component}: actual controls retain open and closed choices after navigation and a fresh mount`, async () => {
  const d = disk(), props = { onClose() {}, goLog: [], ...extra };
  let f = calendarFixture({ storage: d.storage }), Screen = f.load(file)[component];
  let tree = f.render(Screen, props); await tick(); tree = f.render(Screen, props);
  const toggle = tree => nodes(tree).find(node => node.props?.accessibilityLabel === label ||
    (component === 'AgendaOperativa' && node.props?.accessibilityState?.expanded === true));
  toggle(tree).props.onPress(); await tick(); tree = f.render(Screen, props);
  assert.equal(d.values.get(key), 'true');
  f.render(Screen, { ...props, visible: false }); tree = f.render(Screen, props);
  assert.ok(nodes(tree).some(node => node.props?.accessibilityLabel === 'Cerrar configuración') ||
    nodes(tree).some(node => typeof node.type === 'function' && node.type.name === 'GoCalConfigPanel') ||
    nodes(tree).some(node => node.type === 'GoCalConfigPanel'));
  f = calendarFixture({ storage: d.storage }); Screen = f.load(file)[component];
  f.render(Screen, props); await tick(); tree = f.render(Screen, props);
  assert.equal(d.values.get(key), 'true');
  const close = component === 'AgendaOperativa'
    ? nodes(tree).find(node => node.props?.level === 'panel' && node.props.accessibilityLabel === 'Cerrar configuración')
    : toggle(tree);
  assert.ok(close, 'Restored settings remain manually closable'); close.props.onPress(); await tick();
  f.render(Screen, { ...props, visible: false }); tree = f.render(Screen, props);
  assert.equal(d.values.get(key), 'false');
  f = calendarFixture({ storage: d.storage }); Screen = f.load(file)[component];
  f.render(Screen, props); await tick(); tree = f.render(Screen, props);
  assert.equal(d.values.get(key), 'false');
  assert.ok(toggle(tree));
  assert.equal(nodes(tree).some(node => node.props?.level === 'panel' && node.props.accessibilityLabel === 'Cerrar configuración'), false);
});

test('Calendar tools production handlers toggle twice, close only settings and persist the same existing preference',async()=>{
 const d=disk(),api=loadPreference(d.storage);
 const state=find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='[calConfigVisible, setCalConfigVisible]').getText(ast);
 const attr=(node,name)=>node.attributes.properties.find(a=>a.name?.getText(ast)===name)?.initializer;
 const settings=find(n=>ts.isJsxSelfClosingElement(n)&&attr(n,'testID')?.text==='calendar-tools-toggle');
 const close=find(n=>ts.isJsxSelfClosingElement(n)&&attr(n,'onPress')?.expression?.getText(ast).includes('else setCalConfigVisible(false)'));
 let current;
 const scope={exports:{},React,...api,Haptics:{selectionAsync(){}},calQuickCreateOpen:false,closeCalendarTaskPanel(){throw Error('Do not close the task');},capture:value=>{current=value;}};
 vm.runInNewContext(transpile(`exports.Probe=function(){const ${state};capture({expanded:calConfigVisible,toggle:${attr(settings,'onPress').expression.getText(ast)},close:${attr(close,'onPress').expression.getText(ast)}});return null;};`),scope);
 const root=createRoot(document.createElement('div'));
 try{
  await act(()=>root.render(React.createElement(scope.exports.Probe)));assert.equal(current.expanded,false);
  await act(()=>current.toggle());assert.equal(current.expanded,true);
  await act(()=>current.toggle());assert.equal(current.expanded,false);
  await act(()=>{current.toggle();current.toggle();});assert.equal(current.expanded,false,'Rapid taps use the latest preference value');
  await act(()=>current.toggle());assert.equal(current.expanded,true);
  await act(()=>current.close());assert.equal(current.expanded,false);await tick();
  assert.equal(d.values.get(api.CONFIG_PANEL_KEYS.calendar),'false');assert.ok(d.writes.every(([key])=>key===api.CONFIG_PANEL_KEYS.calendar));
 }finally{await act(()=>root.unmount());}
});

test('Calendar and Listados production handlers persist manual choices and leave them intact on exit', async () => {
  const d = disk(), api = loadPreference(d.storage);
  const state = name => find(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name).getText(ast);
  const attribute = (node, name) => node.attributes.properties.find(prop => prop.name?.getText(ast) === name)?.initializer;
  const jsx = predicate => find(node => (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && predicate(node));
  const settings = jsx(node => attribute(node, 'accessibilityLabel')?.text === 'Configuración de Calendario');
  const panelClose = jsx(node => attribute(node, 'onPress')?.expression?.getText(ast).includes('else setCalConfigVisible(false)'));
  const list = jsx(node => attribute(node, 'visible')?.expression?.getText(ast) === 'listOpen');
  const listToggle = jsx(node => attribute(node, 'onPress')?.expression?.getText(ast).includes('setListFiltersHidden((prev) => !prev)'));
  const handler = (node, name = 'onPress') => attribute(node, name).expression.getText(ast);
  let current;
  const scope = { exports: {}, React, ...api, capture: value => { current = value; },
    Haptics: { selectionAsync: async () => {} }, calQuickCreateOpen: false, closeCalendarTaskPanel() {},
    listNoteLayerBackRef: { current: null }, setListOpen() {}, setLlamadasListOpen() {}, setListMinimized() {} };
  vm.runInNewContext(transpile(`exports.Probe = function() {
    const ${state('[calConfigVisible, setCalConfigVisible]')};
    const ${state('[listFiltersHidden, setListFiltersHidden]')};
    capture({ calConfigVisible, listFiltersHidden, open: ${handler(settings)}, close: ${handler(panelClose)},
      listExit: ${handler(list, 'onClose')}, listToggle: ${handler(listToggle)}, listSwipe: ${handler(list, 'onSwipeStepDown')} });
    return null;
  };`), scope);
  const root = createRoot(document.createElement('div'));
  try {
    await act(() => root.render(React.createElement(scope.exports.Probe)));
    assert.deepEqual(d.writes, []);
    await act(() => current.open()); assert.equal(current.calConfigVisible, true);
    await act(() => current.listToggle()); assert.equal(current.listFiltersHidden, true);
    await act(() => current.listExit()); assert.equal(current.listFiltersHidden, true);
    assert.equal(current.calConfigVisible, true);
    await act(() => current.close()); assert.equal(current.calConfigVisible, false);
    await act(() => current.listToggle()); assert.equal(current.listFiltersHidden, false);
    await act(() => current.listSwipe()); assert.equal(current.listFiltersHidden, true);
    assert.equal(d.values.get(api.CONFIG_PANEL_KEYS.calendar), 'false');
    assert.equal(d.values.get(api.CONFIG_PANEL_KEYS.listFiltersHidden), 'true');
    const f = containerFixture(); f.scope.calConfigVisible = true; f.scope.exitCalendarContainer();
    assert.equal(f.scope.calOpen, false); assert.equal(f.scope.calConfigVisible, true);
    const tools = readFileSync('components/herramientas/HerramientasPanel.tsx', 'utf8');
    assert.doesNotMatch(tools, /calConfigVisible|tools_show_controls|tools_controls_(visible|hidden)_desc/);
  } finally { await act(() => root.unmount()); }
});
