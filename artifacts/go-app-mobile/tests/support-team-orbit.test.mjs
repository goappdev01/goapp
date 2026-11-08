import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ts = createRequire(import.meta.url)('typescript');
const compile = file => ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const nodes = value => !value || typeof value !== 'object' ? [] : [value, ...(value.children ?? []).flatMap(nodes)];
const labels = value => typeof value === 'string' ? value : (value?.children ?? []).map(labels).join(' ');
const tick = () => new Promise(setImmediate);
const library = { exports: {} };
vm.runInNewContext(compile('lib/orbitalPeople.ts'), library);
const demoLibrary = { exports: {} };
vm.runInNewContext(compile('lib/orbitalPeopleDemo.ts'), demoLibrary);
const { browsePeople, peopleOrbitPage, orbitalPeopleLayout, orbitalPeopleAvoidRects,
  orbitalPeopleSearchScrollOffset } = library.exports;
const { newOrbitalDemoDirectory, parseOrbitalDemoDirectory, createOrbitalDemoPerson,
  updateOrbitalDemoPerson, orbitalDemoStorageKey } = demoLibrary.exports;
const people = count => Array.from({ length: count }, (_, index) => ({
  id: `id-${index}`, code: `T-${String(index).padStart(3, '0')}`, name: `Trabajador ${String(index).padStart(3, '0')}`,
  role: 'Soporte', active: true,
}));

test('orbital pagination has seven people plus one next control for 0, 1, 7, 8, 13, 15 and 100 records', () => {
  for (const count of [0, 1, 7, 8, 13, 15, 100]) {
    const rows = people(count);
    const expectedPages = Math.max(1, Math.ceil(count / 7));
    for (let page = 0; page < expectedPages; page++) {
      const result = peopleOrbitPage(rows, page);
      assert.equal(result.people.length, Math.min(7, Math.max(0, count - page * 7)));
      assert.equal(result.totalPages, expectedPages);
      assert.equal(result.hasNext, page + 1 < expectedPages);
    }
    assert.equal(peopleOrbitPage(rows, 999).page, expectedPages - 1);
  }
});

// Exercise the production render callback and PremiumOrbitBtn, not just the panel's satellite descriptor.
const home = ts.createSourceFile('index.tsx', readFileSync('app/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let satelliteRenderer;
(function visit(node) {
  if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(home) === 'SupportTeamPanel')
    satelliteRenderer = node.attributes.properties.find(prop => prop.name?.getText(home) === 'renderSatellite').initializer.expression.getText(home);
  ts.forEachChild(node, visit);
})(home);
assert.ok(satelliteRenderer);
const orbitDeclarations = ['_orbitLighten', '_orbitDarken', 'PremiumOrbitBtn'].map(name =>
  home.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(home)).join('\n');
const springCalls = [];
const orbitReact = {
  createElement: (type, props, ...children) => typeof type === 'function' ? type(props) :
    ({ type, props: props ?? {}, children: children.flat(Infinity) }),
  useRef: value => ({ current: value }), useState: value => [value, () => {}], Fragment: 'Fragment',
};
const orbitScope = { React: orbitReact, useLanguage: () => ({ t: value => value }),
  Animated: { View: 'AnimatedView', Value: class {}, spring: (_value, options) => ({ start: () => springCalls.push(options) }) },
  View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', LinearGradient: 'LinearGradient', Feather: 'Feather', Ionicons: 'Ionicons' };
vm.runInNewContext(ts.transpileModule(orbitDeclarations + '\nvar renderSatellite = ' + satelliteRenderer, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React },
}).outputText, orbitScope);
const nativeButton = orbit => nodes(orbit).find(node => node.type === 'TouchableOpacity');

test('name and code search ignores accents and case, sorts with stable code tie break and hides inactive/duplicate IDs', () => {
  const rows = [
    { id: 'b', code: 'T-2', name: 'Álvaro Ruiz', role: 'Soporte', active: true },
    { id: 'a', code: 'T-1', name: 'Alvaro Ruiz', role: 'Soporte', active: true },
    { id: 'c', code: 'T-3', name: 'Beatriz', role: 'Soporte', active: false },
    { id: 'a', code: 'T-1', name: 'Alvaro Ruiz', role: 'Soporte', active: true },
  ];
  assert.deepEqual(Array.from(browsePeople(rows, 'ALVARO')).map(row => row.code), ['T-1', 'T-2']);
  assert.deepEqual(Array.from(browsePeople(rows, 't-2')).map(row => row.id), ['b']);
  assert.equal(browsePeople(rows, 'Beatriz').length, 0);
  assert.equal(browsePeople(rows, 'Beatriz', true).length, 1);
  assert.equal(browsePeople(rows, 'sin resultado').length, 0);
});

function fixture(source, dimensions = { width: 390, height: 844 }, handedness = 'left', storage = new Map(), accountScope = 'account-a') {
  let cursor = 0, slots = [], effects = [], keyboardListeners = {};
  const calls = [];
  const equal = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) { const index = cursor++; slots[index] ??= { value: initial }; return [slots[index].value,
      value => { slots[index].value = typeof value === 'function' ? value(slots[index].value) : value; }]; },
    useRef(value) { return React.useState({ current: value })[0]; },
    useMemo: fn => fn(),
    useEffect(fn, deps) { const index = cursor++, old = slots[index]; if (!old || !equal(old.deps, deps)) {
      slots[index] = { deps }; effects.push(() => { old?.cleanup?.(); slots[index].cleanup = fn(); });
    } },
  };
  const scope = { exports: {}, require(name) {
    if (name === 'react') return { ...React, default: React };
    if (name === 'react-native') return {
      ActivityIndicator: 'ActivityIndicator', Modal: 'Modal', ScrollView: 'ScrollView', TouchableOpacity: 'TouchableOpacity',
      StyleSheet: { create: value => value }, Text: 'Text', TextInput: 'TextInput', View: 'View',
      useWindowDimensions: () => dimensions,
      Keyboard: { addListener: (event, handler) => { keyboardListeners[event] = handler; return { remove() { delete keyboardListeners[event]; } }; },
        isVisible: () => false, dismiss: () => calls.push('dismiss') },
    };
    if (name === 'react-native-safe-area-context') return { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) };
    if (name === '@react-native-async-storage/async-storage') return { __esModule: true, default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    } };
    if (name === '@/components/booking-assistant/BookingAssistantUI') return { GoAssistantButton: 'GoAssistantButton' };
    if (name === '@/components/ui/GoCloseButton') return { GoCloseButton: 'GoCloseButton' };
    if (name === '@/components/ui/GoNavigationFloating') return { GoNavigationFloating: 'GoNavigationFloating' };
    if (name === '@/lib/orbitalPeople') return library.exports;
    if (name === '@/lib/orbitalPeopleDemo') return demoLibrary.exports;
    throw Error(name);
  } };
  vm.runInNewContext(compile('components/landing/SupportTeamPanel.tsx'), scope);
  const props = { visible: true, source, onClose: () => calls.push('close'), onGoPress: () => calls.push('GO'),
    handedness, accountScope, renderSatellite: (satellite, size) => ({ type: 'OrbitButton', props: { ...satellite, size },
      children: [orbitScope.renderSatellite(satellite, size)] }) };
  return { props, calls, storage, keyboardShow: (height = 300) => keyboardListeners.keyboardDidShow?.({ endCoordinates: { height } }),
    keyboardHide: () => keyboardListeners.keyboardDidHide?.(),
    render(p = props) { cursor = 0; effects = []; const tree = scope.exports.SupportTeamPanel(p); for (const run of effects) run(); return tree; } };
}

for (const count of [0, 1, 7, 8, 13, 15, 100]) for (const mode of ['source contract', 'local demo'])
test(`${mode}: real orbit render callbacks traverse ${count} people and preserve the page after opening a member`, async () => {
  const rows = people(count).map((person, index) => mode === 'local demo' ?
    { ...person, id: `demo:${index + 1}`, code: `DEMO-${String(index + 1).padStart(3, '0')}` } : person);
  const storage = new Map();
  if (mode === 'local demo') storage.set(orbitalDemoStorageKey('support', 'account-a'),
    JSON.stringify({ version: 1, enabled: true, nextId: count + 1, people: rows }));
  const f = fixture(mode === 'local demo' ? undefined : { list: async () => rows }, undefined, 'right', storage);
  f.render(); await tick(); let tree = f.render();
  const orbit = () => nodes(tree).filter(node => node.type === 'OrbitButton');
  const back = () => nodes(tree).find(node => node.type === 'GoCloseButton');
  const pages = Math.max(1, Math.ceil(count / 7));
  for (let page = 0; page < pages; page++) {
    const expected = rows.slice(page * 7, (page + 1) * 7);
    assert.deepEqual(orbit().slice(0, 7).filter(node => !node.props.empty).map(node => node.props.label), expected.map(row => row.name));
    if (count) assert.ok(labels(tree).includes(`Página ${page + 1} de ${pages}`));
    assert.equal(labels(tree).includes('DEMOSTRACIÓN LOCAL'), mode === 'local demo');
    if (expected.length) {
      nativeButton(orbit()[0]).props.onPress(); tree = f.render();
      assert.ok(labels(tree).replace(/\s+/g, " ").includes(`Código: ${expected[0].code}`));
      back().props.onPress(); tree = f.render();
      assert.ok(labels(tree).includes(`Página ${page + 1} de ${pages}`));
    }
    const next = orbit()[7], touch = nativeButton(next), hasNext = page + 1 < pages;
    assert.equal(next.props.label, 'SOPORTE');
    assert.equal(touch.props.disabled, !hasNext);
    assert.equal(touch.props.accessibilityState.disabled, !hasNext);
    assert.equal(nodes(next).find(node => node.type === 'AnimatedView').props.style.opacity, hasNext ? 1 : 0.22);
    if (hasNext) {
      touch.props.onPressIn(); assert.equal(springCalls.at(-1).toValue, 0.93);
      touch.props.onPressOut(); assert.equal(springCalls.at(-1).toValue, 1);
    }
    touch.props.onPress(); tree = f.render();
    if (!hasNext && count) assert.ok(labels(tree).includes(`Página ${pages} de ${pages}`));
  }
  for (let page = pages - 2; page >= 0; page--) {
    assert.equal(back().props.accessibilityLabel, 'Página anterior');
    back().props.onPress(); tree = f.render();
    assert.ok(labels(tree).includes(`Página ${page + 1} de ${pages}`));
    assert.equal(orbit()[0].props.label, rows[page * 7].name);
  }
  if (mode === 'local demo') assert.deepEqual(JSON.parse(storage.get(orbitalDemoStorageKey('support', 'account-a'))).people, rows);
});

test('diagonal orbital hit boxes stay above the overlapping GO box without changing their geometry', async () => {
  for (const dimensions of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const f = fixture({ list: async () => people(13) }, dimensions); f.render(); await tick(); const tree = f.render();
    const wrap = nodes(tree).find(node => node.type === 'View' && node.children?.some(child =>
      child?.type === 'View' && child.children?.some(orbit => orbit?.type === 'OrbitButton')));
    const go = wrap.children.find(child => child?.children?.some(node => node.type === 'GoAssistantButton'));
    const next = wrap.children.find(child => child?.children?.some(node => node.props?.key === 'team-next'));
    const layout = orbitalPeopleLayout(dimensions.width, dimensions.height, { top: 47, bottom: 34, left: 0, right: 0 });
    assert.equal(go.props.pointerEvents, 'box-none'); assert.equal(next.props.pointerEvents, 'box-none');
    assert.equal(next.props.style.width, layout.orbitSize); assert.equal(next.props.style.height, layout.orbitSize);
    assert.equal(go.props.style.width, layout.goSize); assert.equal(go.props.style.height, layout.goSize);
    const x = next.props.style.left + layout.orbitSize * 0.7, y = next.props.style.top + layout.orbitSize * 0.7;
    assert.ok(x > go.props.style.left && y > go.props.style.top, 'a visible inner part of SOPORTE overlaps GO’s rectangular hit box');
    assert.ok(x < go.props.style.left + layout.goSize && y < go.props.style.top + layout.goSize);
    assert.ok(next.props.style.zIndex > (go.props.style.zIndex ?? 0));
    assert.ok(wrap.children.indexOf(next) > wrap.children.indexOf(go));
    assert.equal(nativeButton(next.children[0]).props.disabled, false);
  }
});

test('disabled final and empty satellite targets absorb overlapping taps without falling through to central GO', async () => {
  for (const dimensions of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    for (const handedness of ['left', 'right']) for (const count of [0, 1, 7, 8]) {
      const f = fixture({ list: async () => people(count) }, dimensions, handedness);
      f.render(); await tick(); let tree = f.render();
      if (count === 8) {
        const next = nodes(tree).filter(node => node.type === 'OrbitButton')[7];
        nativeButton(next).props.onPress(); tree = f.render();
      }
      const go = nodes(tree).find(node => node.type === 'GoAssistantButton');
      const wrap = nodes(tree).find(node => node.type === 'View' && node.children.some(child => child?.children?.includes(go)));
      assert.ok(wrap);
      const slots = wrap.children.filter(child => child?.children?.[0]?.type === 'OrbitButton');
      assert.equal(slots.length, 8);
      for (const slot of slots.filter(slot => slot.children[0].props.disabled)) {
        const orbit = slot.children[0], touch = nativeButton(orbit);
        assert.equal(slot.props.pointerEvents, 'auto', 'a disabled wrapper still owns its rectangle and cannot pass a tap to GO');
        assert.equal(touch.props.disabled, true);
        assert.equal(touch.props.accessibilityState.disabled, true);
        assert.equal(slot.props.style.zIndex, 1);
        const before = JSON.stringify(tree);
        // Even a direct callback invocation cannot advance past the last page or open an empty slot.
        touch.props.onPress(); tree = f.render();
        assert.equal(JSON.stringify(tree), before);
      }
      assert.equal(f.calls.includes('GO'), false);
      go.props.onPress();assert.equal(f.calls.at(-1), 'GO', 'GO keeps its own functional center');
    }
  }
});

test('EQUIPO renders real records, navigates forward/back and returns from the selected record', async () => {
  const f = fixture({ list: async () => people(8) }); f.render(); await tick(); let tree = f.render();
  const orbit = () => nodes(tree).filter(node => node.type === 'OrbitButton');
  const back = () => nodes(tree).find(node => node.type === 'GoCloseButton');
  assert.equal(orbit().length, 8);
  assert.equal(orbit().at(-1).props.label, 'SOPORTE'); assert.equal(orbit().at(-1).props.disabled, false);
  orbit().at(-1).props.onPress(); tree = f.render(); assert.ok(labels(tree).includes('Página 2 de 2'));
  assert.equal(orbit().length, 8); assert.equal(orbit()[0].props.label, 'Trabajador 007');
  assert.equal(orbit()[1].props.empty, true); assert.equal(orbit().at(-1).props.disabled, true);
  orbit()[0].props.onPress(); tree = f.render(); assert.ok(labels(tree).includes('T-007'));
  back().props.onPress(); tree = f.render(); assert.ok(labels(tree).includes('Página 2 de 2'));
  back().props.onPress(); tree = f.render(); assert.ok(labels(tree).includes('Página 1 de 2'));
  back().props.onPress(); assert.deepEqual(f.calls, ['dismiss', 'close']);
  assert.equal(nodes(tree).filter(node => node.type === 'GoCloseButton').length, 1);
});

test('search finds a unique worker code, clears to original list, and keyboard back only dismisses', async () => {
  const f = fixture({ list: async () => people(15) }); f.render(); await tick(); let tree = f.render();
  const input = () => nodes(tree).find(node => node.type === 'TextInput');
  input().props.onChangeText('T-014'); tree = f.render();
  assert.equal(nodes(tree).filter(node => node.type === 'OrbitButton').length, 8);
  assert.ok(nodes(tree).some(node => node.props.title?.includes('T-014')));
  f.keyboardShow(); tree = f.render(); nodes(tree).find(node => node.type === 'GoCloseButton').props.onPress();
  assert.deepEqual(f.calls, ['dismiss']);
  f.keyboardHide(); input().props.onChangeText(''); tree = f.render(); assert.ok(labels(tree).includes('15 trabajadores'));
});

test('without an authorized team source, demo stays opt-in and no synthetic people appear as real', async () => {
  const f = fixture(undefined); f.render(); await tick(); const tree = f.render();
  assert.ok(labels(tree).includes('pendiente de conexión'));
  assert.ok(labels(tree).includes('ACTIVAR DEMOSTRACIÓN'));
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Añadir persona').props.disabled, true);
  assert.equal(nodes(tree).filter(node => node.type === 'OrbitButton').length, 8);
  assert.equal(nodes(tree).filter(node => node.type === 'OrbitButton' && node.props.empty).length, 7);
  assert.ok(nodes(tree).filter(node => node.type === 'OrbitButton').every(node => node.props.disabled));
});

test('compact and tall iPhone layouts keep the eight orbital touch targets and floating back in the chosen hand', async () => {
  for (const dimensions of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    for (const hand of ['left', 'right']) {
      const f = fixture({ list: async () => people(7) }, dimensions, hand); f.render(); await tick(); const tree = f.render();
      const buttons = nodes(tree).filter(node => node.type === 'OrbitButton');
      assert.equal(buttons.length, 8); assert.ok(buttons.every(node => node.props.size >= 44));
      assert.equal(nodes(tree).find(node => node.type === 'GoNavigationFloating').props.handedness, hand);
      assert.equal(nodes(tree).find(node => node.type === 'GoNavigationFloating').props.initialBottom, 0);
      assert.ok(nodes(tree).some(node => node.type === 'ScrollView' && node.props.keyboardShouldPersistTaps === 'handled'));
    }
  }
});

test('GO and seven worker slots keep Landing proportions at the safe bottom; the search stays immediately above', () => {
  for (const dimensions of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    const insets = { top: 47, bottom: 34, left: 0, right: 0 };
    const layout = orbitalPeopleLayout(dimensions.width, dimensions.height, insets);
    assert.ok(Math.abs(layout.goSize / layout.orbitSize - 128 / 65) < 0.04);
    assert.ok(Math.abs(layout.radius / layout.orbitSize - 99 / 65) < 0.04);
    assert.equal(layout.bottom, dimensions.width < 370 ? 64 : 46);
    assert.equal(layout.navigationBottom, 34);
    assert.equal(layout.orbitTop - layout.searchTop, 52);
    assert.equal(layout.contentHeight - layout.orbitTop, layout.wrap);
    assert.ok(layout.wrap <= dimensions.width - 20);
    const withKeyboard = orbitalPeopleLayout(dimensions.width, dimensions.height, insets, 300);
    assert.equal(withKeyboard.bottom, dimensions.width < 370 ? 330 : 312);
    assert.equal(withKeyboard.navigationBottom, 308);
    assert.equal(withKeyboard.scrollNeeded, withKeyboard.contentHeight > withKeyboard.viewportHeight);
  }
});

test('floating back starts clear of the search and every orbit on compact phones, both hands, with or without keyboard', () => {
  const insets = { top: 47, bottom: 34, left: 0, right: 0 };
  for (const dimensions of [{ width: 320, height: 568 }, { width: 360, height: 740 },
    { width: 375, height: 667 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    for (const keyboard of [0, 280]) {
      const layout = orbitalPeopleLayout(dimensions.width, dimensions.height, insets, keyboard);
      const showOrbit = keyboard === 0 || !layout.scrollNeeded;
      const blockers = orbitalPeopleAvoidRects(dimensions.width, dimensions.height, insets, layout, showOrbit);
      assert.equal(blockers.length, showOrbit ? 11 : 2);
      const [search, add] = blockers.slice(-2);
      assert.ok(search.x + search.width + 2 <= add.x, 'search and plus must not overlap');
      const searchOnScreen = layout.searchTop - orbitalPeopleSearchScrollOffset(layout, insets);
      assert.ok(searchOnScreen >= 0 && searchOnScreen + layout.searchHeight <= layout.viewportHeight);
      const navTop = dimensions.height - insets.top - 72 - layout.navigationBottom - 64;
      for (const hand of ['left', 'right']) {
        const navLeft = hand === 'left' ? 8 : dimensions.width - 8 - 64;
        for (const rect of blockers) {
          const overlaps = navLeft < rect.x + rect.width + 2 && navLeft + 64 > rect.x - 2
            && navTop < rect.y + rect.height + 2 && navTop + 64 > rect.y - 2;
          assert.equal(overlaps, false, `${dimensions.width} × ${dimensions.height}, ${hand}, keyboard ${keyboard}`);
        }
      }
    }
  }
});

test('an authorized long press edits only the visible name after a confirmed server response', async () => {
  const worker = people(1)[0], writes = [];
  const source = { list: async () => [worker], canEditName: () => true,
    renameVisibleName: async (id, name) => { writes.push({ id, name }); return { ...worker, name }; } };
  const f = fixture(source); f.render(); await tick(); let tree = f.render();
  const person = nodes(tree).find(node => node.type === 'OrbitButton' && node.props.key === `person:${worker.id}`);
  person.props.onLongPress(); person.props.onPress(); tree = f.render();
  assert.ok(labels(tree).includes('EDITAR PERSONA'));
  assert.equal(labels(tree).includes('Ficha de trabajador'), false, 'long press must not open the regular record');
  nodes(tree).find(node => node.props.accessibilityLabel === 'Nombre visible del trabajador').props.onChangeText('Nombre autorizado');
  tree = f.render(); nodes(tree).find(node => node.type === 'TouchableOpacity' && labels(node) === 'GUARDAR').props.onPress();
  await tick(); tree = f.render();
  assert.deepEqual(writes, [{ id: worker.id, name: 'Nombre autorizado' }]);
  assert.equal(nodes(tree).find(node => node.type === 'OrbitButton' && node.props.key === `person:${worker.id}`).props.label, 'Nombre autorizado');
  assert.equal(worker.code, 'T-000'); assert.equal(worker.role, 'Soporte');
});

test('unauthorized long press cannot edit; invalid, cancelled and rejected edits never change the orbit', async () => {
  const worker = people(1)[0], writes = [];
  const denied = fixture({ list: async () => [worker], canEditName: () => false,
    renameVisibleName: async () => { writes.push('denied'); return worker; } });
  denied.render(); await tick(); let tree = denied.render();
  assert.equal(nodes(tree).find(node => node.type === 'OrbitButton' && node.props.key === `person:${worker.id}`).props.onLongPress, undefined);
  assert.equal(writes.length, 0);
  const permitted = fixture({ list: async () => [worker], canEditName: () => true,
    renameVisibleName: async () => { writes.push('attempt'); throw Error('offline'); } });
  permitted.render(); await tick(); tree = permitted.render();
  nodes(tree).find(node => node.type === 'OrbitButton' && node.props.key === `person:${worker.id}`).props.onLongPress();
  tree = permitted.render(); const input = () => nodes(tree).find(node => node.props.accessibilityLabel === 'Nombre visible del trabajador');
  input().props.onChangeText('x'); tree = permitted.render();
  nodes(tree).find(node => node.type === 'TouchableOpacity' && labels(node) === 'GUARDAR').props.onPress();
  tree = permitted.render(); assert.ok(labels(tree).includes('Comprueba el nombre')); assert.equal(writes.length, 0);
  input().props.onChangeText('Nombre sin guardar'); tree = permitted.render();
  nodes(tree).find(node => node.type === 'TouchableOpacity' && labels(node) === 'GUARDAR').props.onPress();
  await tick(); tree = permitted.render(); assert.ok(labels(tree).includes('No se confirmó')); assert.equal(writes.length, 1);
  nodes(tree).find(node => node.type === 'TouchableOpacity' && labels(node) === 'CANCELAR').props.onPress();
  tree = permitted.render(); assert.equal(nodes(tree).find(node => node.type === 'OrbitButton' && node.props.key === `person:${worker.id}`).props.label, worker.name);
});

test('keyboard lifts only the orbital viewport and floating back, then restores their original safe position', async () => {
  const f = fixture({ list: async () => people(1) }, { width: 320, height: 568 });
  f.render(); await tick(); let tree = f.render();
  const viewport = () => nodes(tree).find(node => node.type === 'ScrollView');
  const navigation = () => nodes(tree).find(node => node.type === 'GoNavigationFloating');
  assert.equal(viewport().props.style[1].bottom, 64);
  assert.equal(navigation().props.protectedBottom, 34);
  assert.equal(navigation().props.avoidRects.length, 11);
  f.keyboardShow(280); tree = f.render();
  assert.equal(viewport().props.style[1].bottom, 310);
  assert.equal(navigation().props.protectedBottom, 288);
  assert.equal(nodes(tree).find(node => node.type === 'GoCloseButton').props.keyboardVisible, true);
  assert.equal(navigation().props.avoidRects.length, 2);
  viewport().props.ref.current = { scrollTo: options => f.calls.push(`scroll-to-search:${options.y}`) };
  viewport().props.onContentSizeChange(); assert.ok(f.calls.some(call => call.startsWith('scroll-to-search:')));
  f.keyboardHide(); tree = f.render();
  assert.equal(viewport().props.style[1].bottom, 64);
  assert.equal(navigation().props.protectedBottom, 34);
  assert.equal(navigation().props.avoidRects.length, 11);
});

const button = (tree, label) => nodes(tree).find(node => node.type === 'TouchableOpacity' && labels(node) === label);
const input = (tree, label) => nodes(tree).find(node => node.type === 'TextInput' && node.props.accessibilityLabel === label);
const orbits = tree => nodes(tree).filter(node => node.type === 'OrbitButton');

test('demo records stay local, explicit, editable and persistent across panel sessions', async () => {
  const storage = new Map(), f = fixture(undefined, undefined, 'right', storage);
  f.render(); await tick(); let tree = f.render();
  assert.equal(orbits(tree).filter(node => node.props.empty).length, 7);
  button(tree, 'ACTIVAR DEMOSTRACIÓN').props.onPress(); await tick(); tree = f.render();
  assert.ok(labels(tree).includes('DEMOSTRACIÓN LOCAL'));
  assert.deepEqual(orbits(tree).slice(0, 7).map(node => node.props.label),
    ['Prueba 1', 'Prueba 2', 'Prueba 3', 'Prueba 4', 'Prueba 5', 'Prueba 6', 'Prueba 7']);
  assert.equal(orbits(tree)[7].props.label, 'SOPORTE');
  const first = orbits(tree)[0]; first.props.onLongPress(); first.props.onPress(); tree = f.render();
  assert.ok(labels(tree).includes('EDITAR PERSONA'));
  assert.equal(labels(tree).includes('Ficha de trabajador'), false);
  input(tree, 'Nombre visible del trabajador').props.onChangeText('Prueba editada');
  tree = f.render(); button(tree, 'GUARDAR').props.onPress(); await tick(); tree = f.render();
  assert.ok(orbits(tree).some(node => node.props.label === 'Prueba editada'));
  assert.ok([...storage.keys()].every(key => key.includes('go_orbital_people_demo_v1')));
  const reopened = fixture(undefined, undefined, 'right', storage);
  reopened.render(); await tick(); const restored = reopened.render();
  assert.ok(labels(restored).includes('DEMOSTRACIÓN LOCAL'));
  assert.ok(orbits(restored).some(node => node.props.label === 'Prueba editada'));
  assert.equal(orbits(restored).filter(node => !node.props.empty && node.props.label !== 'SOPORTE').length, 7);
  button(restored, 'DEMOSTRACIÓN LOCAL · SALIR').props.onPress(); await tick(); let paused = reopened.render();
  assert.equal(orbits(paused).filter(node => node.props.empty).length, 7);
  button(paused, 'ACTIVAR DEMOSTRACIÓN').props.onPress(); await tick(); paused = reopened.render();
  assert.ok(orbits(paused).some(node => node.props.label === 'Prueba editada'));
});

test('demo plus creates a unique eighth member and pagination finds it; inactive members remain stored', async () => {
  const storage = new Map(), f = fixture(undefined, undefined, 'left', storage);
  f.render(); await tick(); let tree = f.render();
  button(tree, 'ACTIVAR DEMOSTRACIÓN').props.onPress(); await tick(); tree = f.render();
  const add = nodes(tree).find(node => node.props.accessibilityLabel === 'Añadir persona');
  assert.equal(add.props.disabled, false); add.props.onPress(); tree = f.render();
  input(tree, 'Nombre visible del trabajador').props.onChangeText('Prueba 8');
  tree = f.render(); button(tree, 'GUARDAR').props.onPress(); await tick(); tree = f.render();
  assert.ok(labels(tree).includes('Página 2 de 2'));
  assert.equal(orbits(tree)[0].props.label, 'Prueba 8');
  assert.equal(orbits(tree)[0].props.title.includes('DEMO-008'), true);
  nodes(tree).find(node => node.type === 'GoCloseButton').props.onPress(); tree = f.render();
  assert.ok(labels(tree).includes('Página 1 de 2'));
  orbits(tree)[0].props.onPress(); tree = f.render();
  assert.ok(labels(tree).includes('FICHA DE DEMOSTRACIÓN'));
  button(tree, 'EDITAR').props.onPress(); tree = f.render();
  input(tree, 'Función del miembro').props.onChangeText('Coordinación de prueba');
  tree = f.render(); nodes(tree).find(node => node.props.accessibilityLabel === 'Cambiar estado del miembro').props.onPress();
  tree = f.render(); button(tree, 'GUARDAR').props.onPress(); await tick(); tree = f.render();
  assert.match(labels(tree), /Estado:\s+INACTIVO/);
  assert.ok(labels(tree).includes('Coordinación de prueba'));
  nodes(tree).find(node => node.type === 'GoCloseButton').props.onPress(); tree = f.render();
  assert.ok(labels(tree).includes('VER INACTIVOS'));
  button(tree, 'VER INACTIVOS').props.onPress(); tree = f.render();
  assert.ok(orbits(tree).some(node => node.props.title.includes('inactivo')));
  const saved = parseOrbitalDemoDirectory(storage.get(orbitalDemoStorageKey('support', 'account-a')));
  assert.equal(saved.people.length, 8);
  assert.equal(saved.people[0].active, false);
  assert.equal(saved.people[0].role, 'Coordinación de prueba');
});

test('demo storage rejects duplicate codes, invalid names and does not leak across accounts or real sources', async () => {
  let directory = newOrbitalDemoDirectory();
  assert.equal(directory.people.length, 7);
  assert.throws(() => createOrbitalDemoPerson(directory, ' ', ''), /nombre visible/);
  assert.throws(() => createOrbitalDemoPerson(directory, 'Repetida', '001'), /pertenece/);
  assert.throws(() => createOrbitalDemoPerson(directory, 'Nueva', 'código no válido'), /código/);
  const result = createOrbitalDemoPerson(directory, 'Nueva', 'X1'); directory = result.directory;
  assert.equal(result.person.code, 'DEMO-X1');
  assert.throws(() => updateOrbitalDemoPerson(directory, 'real:1', { name: 'Otra', role: 'Prueba', active: true }));
  assert.throws(() => parseOrbitalDemoDirectory(JSON.stringify({ ...directory,
    people: [{ ...directory.people[0], id: 'real:1' }] })));
  const storage = new Map([[orbitalDemoStorageKey('support', 'account-a'), JSON.stringify({ ...directory, enabled: true })]]);
  const otherAccount = fixture(undefined, undefined, 'right', storage, 'account-b');
  otherAccount.render(); await tick(); let tree = otherAccount.render();
  assert.equal(orbits(tree).filter(node => node.props.empty).length, 7);
  const real = fixture({ list: async () => people(1) }, undefined, 'right', storage, 'account-a');
  real.render(); await tick(); tree = real.render();
  assert.equal(orbits(tree)[0].props.label, 'Trabajador 000');
  assert.equal(orbits(tree).some(node => node.props.label === 'Nueva'), false);
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Añadir persona').props.disabled, true);
  assert.equal(labels(tree).includes('DEMOSTRACIÓN LOCAL'), false);
});

test('real creation and editing require explicit capabilities and confirmed server responses', async () => {
  const worker = people(1)[0], writes = [], created = { id: 'real:2', code: 'T-002', name: 'Nueva autorizada', role: 'Soporte', active: true };
  const source = { list: async () => [worker], canEditName: () => true,
    renameVisibleName: async (id, name) => ({ ...worker, name }),
    canCreateMember: () => true, createMember: async (name, code) => { writes.push({ name, code }); return created; } };
  const f = fixture(source); f.render(); await tick(); let tree = f.render();
  nodes(tree).find(node => node.props.accessibilityLabel === 'Añadir persona').props.onPress(); tree = f.render();
  input(tree, 'Nombre visible del trabajador').props.onChangeText('Nueva autorizada');
  tree = f.render(); button(tree, 'GUARDAR').props.onPress(); button(tree, 'GUARDAR').props.onPress();
  await tick(); tree = f.render();
  assert.deepEqual(writes, [{ name: 'Nueva autorizada', code: undefined }]);
  assert.ok(orbits(tree).some(node => node.props.label === 'Nueva autorizada'));
  assert.equal(f.storage.size, 0, 'real records never write to the local demo store');
  const denied = fixture({ list: async () => [worker], canCreateMember: () => false,
    createMember: async () => { throw Error('must not run'); } });
  denied.render(); await tick(); tree = denied.render();
  assert.equal(nodes(tree).find(node => node.props.accessibilityLabel === 'Añadir persona').props.disabled, true);
});

test('real role and active changes require per-person capabilities and do not appear before server confirmation', async () => {
  const worker = people(1)[0], writes = [];
  let finish;
  const source = { list: async () => [worker], canEditRole: () => true, canSetActive: () => true,
    updateMember: (id, changes) => { writes.push({ id, changes }); return new Promise(resolve => { finish = resolve; }); } };
  const f = fixture(source); f.render(); await tick(); let tree = f.render();
  assert.equal(orbits(tree)[0].props.onLongPress, undefined, 'name long press needs name permission');
  orbits(tree)[0].props.onPress(); tree = f.render();
  button(tree, 'EDITAR').props.onPress(); tree = f.render();
  assert.equal(input(tree, 'Nombre visible del trabajador').props.editable, false);
  input(tree, 'Función del miembro').props.onChangeText('Coordinación');
  tree = f.render(); nodes(tree).find(node => node.props.accessibilityLabel === 'Cambiar estado del miembro').props.onPress();
  tree = f.render(); button(tree, 'GUARDAR').props.onPress(); tree = f.render();
  assert.equal(writes.length, 1);
  assert.ok(labels(tree).includes('GUARDANDO'));
  assert.match(labels(tree), /Estado:\s+ACTIVO/);
  finish({ ...worker, role: 'Coordinación', active: false }); await tick(); tree = f.render();
  assert.match(labels(tree), /Estado:\s+INACTIVO/);
  assert.ok(labels(tree).includes('Coordinación'));
  const denied = fixture({ list: async () => [worker], canEditRole: () => false,
    canSetActive: () => false, updateMember: async () => { throw Error('must not run'); } });
  denied.render(); await tick(); tree = denied.render();
  orbits(tree)[0].props.onPress(); tree = denied.render();
  assert.equal(button(tree, 'EDITAR'), undefined);
});

test('a late real write from the previous account cannot repaint the next account or leave its editor blocked', async () => {
  const worker = people(1)[0]; let finish;
  const source = { list: async () => [worker], canEditName: () => true,
    renameVisibleName: () => new Promise(resolve => { finish = resolve; }) };
  const f = fixture(source); f.render(); await tick(); let tree = f.render();
  orbits(tree)[0].props.onLongPress(); tree = f.render();
  input(tree, 'Nombre visible del trabajador').props.onChangeText('Nombre antiguo');
  tree = f.render(); button(tree, 'GUARDAR').props.onPress();
  f.props.accountScope = 'account-b'; f.render(); await tick(); tree = f.render();
  finish({ ...worker, name: 'Nombre antiguo' }); await tick(); tree = f.render();
  assert.equal(orbits(tree)[0].props.label, worker.name);
  assert.equal(labels(tree).includes('GUARDANDO'), false);
  assert.equal(f.storage.size, 0);
});

test('the orbital browser accepts a distinct team context without changing SOPORTE or sharing demo storage', async () => {
  assert.notEqual(orbitalDemoStorageKey('support', 'account-a'), orbitalDemoStorageKey('enterprise-1', 'account-a'));
  const f = fixture({ list: async () => people(8) });
  Object.assign(f.props, { directoryKey: 'enterprise-1', directoryLabel: 'PERSONAL', nextLabel: 'EMPRESA',
    memberSingular: 'colaborador', memberPlural: 'colaboradores', originLabel: 'EMPRESA' });
  f.render(); await tick(); const tree = f.render();
  assert.ok(labels(tree).includes('PERSONAL'));
  assert.ok(labels(tree).includes('8 colaboradores'));
  assert.equal(orbits(tree)[7].props.label, 'EMPRESA');
  assert.equal(nodes(tree).find(node => node.type === 'GoCloseButton').props.accessibilityLabel, 'Volver a EMPRESA');
  assert.equal(f.storage.size, 0);
});

test('cancelling a local demo edit keeps the stored record and code unchanged', async () => {
  const storage = new Map(), f = fixture(undefined, undefined, 'left', storage);
  f.render(); await tick(); let tree = f.render();
  button(tree, 'ACTIVAR DEMOSTRACIÓN').props.onPress(); await tick(); tree = f.render();
  orbits(tree)[0].props.onLongPress(); tree = f.render();
  input(tree, 'Nombre visible del trabajador').props.onChangeText('No guardar');
  tree = f.render(); button(tree, 'CANCELAR').props.onPress(); tree = f.render();
  assert.equal(orbits(tree)[0].props.label, 'Prueba 1');
  const stored = parseOrbitalDemoDirectory(storage.get(orbitalDemoStorageKey('support', 'account-a')));
  assert.equal(stored.people[0].name, 'Prueba 1');
  assert.equal(stored.people[0].code, 'DEMO-001');
});
