import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");

// Run the real calendar components with deterministic native adapters. Keep hook
// state across renders so navigation and closing are tested without remounting.
export function fixture({ now } = {}) {
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now ?? Date.now()])); }
    static now() { return now === undefined ? Date.now() : new Date(now).getTime(); }
  }
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
    '@/hooks/useGoLog': { useGoLog: () => react.useState([]) },
    '@/hooks/useGoCalendarEntries': { useGoCalendarEntries: entries => entries },
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
      exports, console: { log() {}, warn() {}, error: console.error }, Date: Clock, Set, Map,
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
