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
const { browsePeople, peopleOrbitPage, orbitalPeopleLayout, orbitalPeopleAvoidRects,
  orbitalPeopleSearchScrollOffset } = library.exports;
const people = count => Array.from({ length: count }, (_, index) => ({
  id: `id-${index}`, code: `T-${String(index).padStart(3, '0')}`, name: `Trabajador ${String(index).padStart(3, '0')}`,
  role: 'Soporte', active: true,
}));

test('orbital pagination has seven people plus one next control for 0, 1, 7, 8, 15 and 100 records', () => {
  for (const count of [0, 1, 7, 8, 15, 100]) {
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
  assert.equal(browsePeople(rows, 'sin resultado').length, 0);
});

function fixture(source, dimensions = { width: 390, height: 844 }, handedness = 'left') {
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
    if (name === '@/components/booking-assistant/BookingAssistantUI') return { GoAssistantButton: 'GoAssistantButton' };
    if (name === '@/components/ui/GoCloseButton') return { GoCloseButton: 'GoCloseButton' };
    if (name === '@/components/ui/GoNavigationFloating') return { GoNavigationFloating: 'GoNavigationFloating' };
    if (name === '@/lib/orbitalPeople') return library.exports;
    throw Error(name);
  } };
  vm.runInNewContext(compile('components/landing/SupportTeamPanel.tsx'), scope);
  const props = { visible: true, source, onClose: () => calls.push('close'), onGoPress: () => calls.push('GO'),
    handedness, renderSatellite: (satellite, size) => ({ type: 'OrbitButton', props: { ...satellite, size }, children: [] }) };
  return { props, calls, keyboardShow: (height = 300) => keyboardListeners.keyboardDidShow?.({ endCoordinates: { height } }),
    keyboardHide: () => keyboardListeners.keyboardDidHide?.(),
    render(p = props) { cursor = 0; effects = []; const tree = scope.exports.SupportTeamPanel(p); for (const run of effects) run(); return tree; } };
}

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

test('without an authorized team source, no synthetic people or false activity appear', () => {
  const f = fixture(undefined); f.render(); const tree = f.render();
  assert.ok(labels(tree).includes('pendiente de conexión'));
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
      assert.equal(blockers.length, showOrbit ? 10 : 1);
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
  assert.ok(labels(tree).includes('Nombre visible'));
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
  tree = permitted.render(); assert.ok(labels(tree).includes('2 a 80 caracteres')); assert.equal(writes.length, 0);
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
  assert.equal(navigation().props.avoidRects.length, 10);
  f.keyboardShow(280); tree = f.render();
  assert.equal(viewport().props.style[1].bottom, 310);
  assert.equal(navigation().props.protectedBottom, 288);
  assert.equal(nodes(tree).find(node => node.type === 'GoCloseButton').props.keyboardVisible, true);
  assert.equal(navigation().props.avoidRects.length, 1);
  viewport().props.ref.current = { scrollTo: options => f.calls.push(`scroll-to-search:${options.y}`) };
  viewport().props.onContentSizeChange(); assert.ok(f.calls.some(call => call.startsWith('scroll-to-search:')));
  f.keyboardHide(); tree = f.render();
  assert.equal(viewport().props.style[1].bottom, 64);
  assert.equal(navigation().props.protectedBottom, 34);
  assert.equal(navigation().props.avoidRects.length, 10);
});
