import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

// Run the real calendar components with deterministic native adapters. Keep hook
// state across renders so navigation and closing are tested without remounting.
function fixture() {
  const slots = [], cache = new Map();
  let cursor = 0, effects = [], language = 'es';
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { return react.useState(() => ({ current: initial }))[0]; },
    useMemo: fn => fn(),
    useCallback: fn => fn,
    useEffect(fn, deps) {
      const index = cursor++;
      if (!slots[index] || !deps || deps.some((value, i) => !Object.is(value, slots[index][i]))) {
        slots[index] = deps;
        effects.push(fn);
      }
    },
  };
  const animation = { start(callback) { callback?.({ finished: true }); }, stop() {} };
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate() { return 0; } }
  const native = new Proxy({
    StyleSheet: { create: value => value, absoluteFill: {} },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Platform: { OS: 'web' },
    PanResponder: { create: config => ({ panHandlers: config }) },
    Animated: { Value, View: 'Animated.View', timing: () => animation, spring: () => animation, sequence: () => animation, loop: () => animation },
  }, { get: (target, key) => target[key] ?? key });
  const chain = new Proxy({}, { get: () => () => chain });
  const mocks = {
    react: { ...react, default: react },
    'react-native': native,
    '@expo/vector-icons': { Feather: 'Feather' },
    'expo-haptics': { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
    'react-native-gesture-handler': { Gesture: { Tap: () => chain, Pan: () => chain, Race: () => chain, Simultaneous: () => chain }, GestureDetector: 'GestureDetector', ScrollView: 'GHScrollView' },
    'react-native-reanimated': { default: { View: 'ReAnimated.View' }, useSharedValue: value => react.useRef({ value }).current, useAnimatedStyle: fn => fn(), withSpring: value => value, withTiming: value => value, runOnJS: fn => fn, interpolateColor: () => '#000' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, left: 0, bottom: 0 }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: language, t: key => key }) },
    '@/contexts/GoBusinessConfigContext': { useBusinessConfig: () => ({ config: { plantillaItems: [], businessName: 'Test', subId: '' } }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    './PlanoEmpresaScreen': { PlanoEmpresaScreen: 'PlanoEmpresaScreen' },
    '@/components/DraggableFAB': { DraggableFAB: 'DraggableFAB' },
    '@/components/GoCalConfigPanel': { GoCalConfigPanel: 'GoCalConfigPanel' },
    '@/data/floorPlan': { loadReservations: async () => [], loadFloorPlan: async () => null },
    '../hooks/useWeatherContext': { useWeatherContext: () => ({ weatherHours: {}, weatherDays: {}, dayNightProgress: 0 }), getWeatherForHour: () => null, isAdverseWeather: () => false },
    '../hooks/usePredictive': { computeDaySuggestions: () => [] },
    '../hooks/useReceptionCountdown': { isReceptionActivity: () => false },
    '@/data/goSectorTranslations': { trSector: value => value },
  };
  function load(file) {
    const filename = path.resolve(file);
    if (cache.has(filename)) return cache.get(filename);
    const exports = {};
    cache.set(filename, exports);
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, console: { log() {}, warn() {}, error: console.error }, Date, Set, Map,
      setTimeout: () => 1, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
      require(name) {
        if (name in mocks) return mocks[name];
        if (name.startsWith('@/components/')) return load(name.replace('@/', '') + '.tsx');
        if (name === '@/lib/time') return load('lib/time.ts');
        if (name.startsWith('.')) return load(path.resolve(path.dirname(filename), name) + (name.includes('/ui/') ? '.tsx' : '.ts'));
        throw new Error(`Unexpected import ${name}`);
      },
    }, { filename });
    return exports;
  }
  return {
    load,
    setLanguage: value => { language = value; },
    render(component, props) {
      cursor = 0; effects = [];
      const tree = component(props);
      const pending = effects; effects = [];
      pending.forEach(fn => fn());
      return tree;
    },
  };
}

function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  return [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))];
}
const button = (tree, label) => nodes(tree, node => node.props.accessibilityLabel === label)[0];
const press = node => {
  let stopped = false;
  node.props.onPress({ stopPropagation() { stopped = true; } });
  return stopped;
};
const texts = tree => nodes(tree, node => node.type === 'Text').flatMap(node => node.children).filter(value => typeof value === 'string');
const columns = tree => nodes(tree, node => typeof node.props.key === 'string' && node.props.key.startsWith('day_')).map(node => node.props.key);

test('monthly navigation crosses years locally and invokes controlled navigation once', () => {
  const app = fixture();
  const { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
  const props = { goLog: [], viewMode: 'mes_lineal', calViewMonth: '2026-12' };
  let tree = app.render(AgendaBoard, props);
  assert.equal(press(button(tree, 'Mes siguiente')), true);
  tree = app.render(AgendaBoard, props);
  assert.ok(columns(tree).includes('day_2027-01-31'));
  press(button(tree, 'Mes anterior'));
  tree = app.render(AgendaBoard, props);
  assert.ok(columns(tree).includes('day_2026-12-31'));
  const directions = [];
  props.onChangeMonth = value => directions.push(value);
  tree = app.render(AgendaBoard, props);
  press(button(tree, 'Mes siguiente'));
  assert.deepEqual(directions, [1]);
  props.calViewMonth = '2027-02';
  tree = app.render(AgendaBoard, props);
  assert.equal(columns(tree).length, 28);
});

test('daily and weekly views honor dates outside today and day taps notify their caller', () => {
  const app = fixture();
  const { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
  const chosen = [];
  const props = { goLog: [], selectedDateISO: '2027-02-27', viewMode: 'semana', onSelectDay: iso => chosen.push(iso) };
  let tree = app.render(AgendaBoard, props);
  assert.equal(columns(tree).length, 7);
  assert.deepEqual(columns(tree).slice(0, 2), ['day_2027-02-27', 'day_2027-02-28']);
  const day = nodes(tree, node => node.type === 'TouchableOpacity' && node.props.accessibilityLabel === 'Sáb 27/02')[0];
  assert.equal(press(day), true);
  assert.deepEqual(chosen, ['2027-02-27']);
  props.selectedDateISO = '2027-02-28';
  app.render(AgendaBoard, props);
  tree = app.render(AgendaBoard, props);
  assert.equal(columns(tree)[0], 'day_2027-02-27', 'selection inside the week does not shift the board');
  props.viewMode = 'dia';
  tree = app.render(AgendaBoard, props);
  assert.equal(columns(tree).length, 1);
  assert.ok(texts(tree).includes('28/02'));
  props.viewMode = 'semana'; props.selectedDateISO = '2028-01-10';
  app.render(AgendaBoard, props);
  tree = app.render(AgendaBoard, props);
  assert.equal(columns(tree)[0], 'day_2028-01-10');
});

test('view selector shows the active view, closes its menu and preserves caller context', () => {
  const app = fixture();
  const { GoCalendarViewSelector } = app.load('components/ui/GoCalendarViewSelector.tsx');
  const context = { dateISO: '2027-02-28', scroll: 320, view: 'semana' };
  const props = { value: context.view, onChange: value => { context.view = value; } };
  let tree = app.render(GoCalendarViewSelector, props);
  assert.ok(texts(tree).includes('SEMANA'));
  assert.equal(press(button(tree, 'Vista del calendario: SEMANA')), true);
  tree = app.render(GoCalendarViewSelector, props);
  const month = nodes(tree, node => node.type === 'TouchableOpacity' && texts(node).includes('MES'))[0];
  press(month); props.value = context.view;
  tree = app.render(GoCalendarViewSelector, props);
  assert.deepEqual(texts(tree), ['MES']);
  assert.equal(button(tree, 'Vista del calendario: MES').props.accessibilityState.expanded, false);
  assert.equal(context.dateISO, '2027-02-28'); assert.equal(context.scroll, 320);
  app.setLanguage('en');
  assert.deepEqual(texts(app.render(GoCalendarViewSelector, props)), ['MONTH']);
});

test('panel close and container exit dispatch separate actions and have nonoverlapping touch surfaces', () => {
  const app = fixture();
  const { GoCloseButton } = app.load('components/ui/GoCloseButton.tsx');
  const context = { panel: true, container: true, date: '2027-02-28', scroll: 320 };
  const panel = app.render(GoCloseButton, { level: 'panel', accessibilityLabel: 'Cerrar panel', onPress: () => { context.panel = false; } });
  const exit = app.render(GoCloseButton, { level: 'container', accessibilityLabel: 'Salir', onPress: () => { context.container = false; } });
  assert.equal(nodes(panel, node => node.type === 'Feather')[0].props.name, 'chevron-down');
  assert.equal(nodes(exit, node => node.type === 'Feather')[0].props.name, 'chevrons-down');
  assert.equal(press(panel), true, 'closing an inner panel must not trigger an ancestor press handler');
  assert.deepEqual(context, { panel: false, container: true, date: '2027-02-28', scroll: 320 });
  assert.equal(panel.props.style.width, 44); assert.equal(panel.props.style.height, 44);
  assert.ok(panel.props.hitSlop * 2 < 8, '8px spacing leaves separated hit areas');
  press(exit); assert.equal(context.container, false);
});

test('Reservas month panel closes without exiting or resetting its selected date; no redundant panel close at root', () => {
  const app = fixture();
  const { GoReservasConfigScreen } = app.load('components/booking/GoReservasConfigScreen.tsx');
  let exits = 0, landingExits = 0;
  const props = { navigateToDayISO: '2027-02-28', dayNightMode: 'oscuro', onClose: () => exits++, onGoToLanding: () => landingExits++ };
  function visibleNodes(tree, predicate) {
    if (!tree || typeof tree !== 'object' || (tree.type === 'Modal' && !tree.props.visible)) return [];
    return [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => visibleNodes(child, predicate))];
  }
  const closes = tree => visibleNodes(tree, node => node.type?.name === 'GoCloseButton');
  const board = tree => nodes(tree, node => node.type?.name === 'AgendaBoard')[0];
  app.render(GoReservasConfigScreen, props);
  let tree = app.render(GoReservasConfigScreen, props);
  assert.equal(board(tree).props.selectedDateISO, '2027-02-28');
  assert.deepEqual(closes(tree).map(node => node.props.level), ['container']);
  button(tree, 'Abrir calendario mensual').props.onPress();
  tree = app.render(GoReservasConfigScreen, props);
  assert.deepEqual(closes(tree).map(node => node.props.level), ['panel', 'container']);
  assert.equal(nodes(tree, node => node.type === 'DraggableFAB').length, 0, 'root controls are hidden behind the open panel');
  const calendarProps = board(tree).props;
  button(tree, 'Cerrar calendario mensual').props.onPress();
  tree = app.render(GoReservasConfigScreen, props);
  assert.equal(exits, 0); assert.equal(landingExits, 0);
  assert.equal(board(tree).props.selectedDateISO, calendarProps.selectedDateISO);
  assert.equal(board(tree).props.viewMode, calendarProps.viewMode);
  assert.deepEqual(closes(tree).map(node => node.props.level), ['container']);
  button(tree, 'Cerrar GO Reservas').props.onPress();
  assert.equal(exits, 1); assert.equal(landingExits, 0);
});
