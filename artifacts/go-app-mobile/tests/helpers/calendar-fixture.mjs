import { readFileSync, existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const actualResponder = require('./tests/helpers/native-pan-responder.cjs').nativePanResponder();
const translatedFloorLabels = {};
vm.runInNewContext(ts.transpileModule(readFileSync("i18n/translations.ts", "utf8"), {
  compilerOptions: { esModuleInterop: false, alwaysStrict: false, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: translatedFloorLabels });

// Run the real calendar components with deterministic native adapters. Keep hook
// state across renders so navigation and closing are tested without remounting.
export function fixture({ now, viewport = {width:390,height:844,fontScale:1} } = {}) {
  const urls = [];
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now ?? Date.now()])); }
    static now() { return now === undefined ? Date.now() : new Date(now).getTime(); }
  }
  let slots = [];
  const cache = new Map(), timers=[], sessionSlots = new Map();
  let cursor = 0, effects = [], language = 'es';
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.length ? children.flat(Infinity) : [props?.children].flat(Infinity).filter(v => v !== undefined) }),
    useState(initial) {
      const index = cursor++;
      const ownSlots = slots;
      if (!(index in ownSlots)) ownSlots[index] = typeof initial === 'function' ? initial() : initial;
      return [ownSlots[index], value => { ownSlots[index] = typeof value === 'function' ? value(ownSlots[index]) : value; }];
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
    useLayoutEffect(fn, deps) { react.useEffect(fn, deps); },
  };
  const animation = { start(callback) { callback?.({ finished: true }); }, stop() {} };
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate() { return 0; } }
  const native = new Proxy({
    StyleSheet: { create: value => value, absoluteFill: {} },
    Dimensions: { get: () => viewport },
    useWindowDimensions: () => viewport,
    Platform: { OS: 'web' },
    AppState: { addEventListener: () => ({remove(){}}) },
    Linking: { openURL: async url => { urls.push(url); } },
    Alert: { alert() {} },
    PanResponder: actualResponder,
    Animated: { Value, View: 'Animated.View', timing: () => animation, spring: () => animation, sequence: () => animation, loop: () => animation, delay: () => animation },
  }, { get: (target, key) => target[key] ?? key });
  const gestureChain = () => { const values={};const chain=new Proxy(values,{get:(target,key)=>key in target?target[key]:(...args)=>{target['_'+String(key)]=args[0];return chain;}});return chain; };
  const mocks = {
    react: { ...react, default: react },
    'react-native': native,
    '@/components/debug/OwnerContextIndicator': { OwnerContextModal: 'Modal' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'expo-haptics': { selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync:async()=>{},NotificationFeedbackType:{Success:'success'}, ImpactFeedbackStyle: { Light: 'light' } },
    '@react-native-async-storage/async-storage': { default: { getItem: async () => null, setItem: async () => {} } },
    'react-native-gesture-handler': { Gesture: { Tap: gestureChain, Pan: gestureChain, Race: (...gestures) => ({gestures}), Simultaneous: (...gestures) => ({gestures}) }, GestureDetector: 'GestureDetector', ScrollView: 'GHScrollView', LegacyScrollView: 'GHScrollView' },
    'react-native-reanimated': { default: { View: 'ReAnimated.View' }, useSharedValue: value => react.useRef({ value }).current, useAnimatedStyle: fn => fn(), withSpring: value => value, withTiming: value => value, runOnJS: fn => fn, interpolateColor: () => '#000' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, right: 0, left: 0, bottom: 0 }) },
    '@/hooks/useGoLog': { useGoLog: () => react.useState([]) },
    '@/lib/sessionEvents': { onSessionChanged: () => () => {} },
    '@/data/booking': { subscribeBookingUpdates: () => () => {},
      getAuthenticatedUserId: async () => {throw new Error('No network in navigation fixture');},
      getOwnedBusinesses: async () => {throw new Error('No network in navigation fixture');},
      getLiveBusinessBookings: async () => {throw new Error('No network in navigation fixture');},
      changeBookingRequest: async () => {throw new Error('No booking writes in navigation fixture');},
    },
    '@/hooks/useGoCalendarEntries': { useGoCalendarEntries: entries => entries },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: language, t: key => key.startsWith("floor_") ? (translatedFloorLabels.translations[language]?.[key] ?? key) : key }) },
    '@/contexts/GoBusinessConfigContext': { useBusinessConfig: () => ({ config: { plantillaItems: [], businessName: 'Test', subId: '' } }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    './PlanoEmpresaScreen': { PlanoEmpresaScreen: 'PlanoEmpresaScreen' },
    '@/components/DraggableFAB': { DraggableFAB: 'DraggableFAB' },
    '@/components/GoCalConfigPanel': { GoCalConfigPanel: 'GoCalConfigPanel' },
    '@/data/floorPlan': { loadReservations: async () => [], loadFloorPlan: async () => null },
    '@/data/businessDemoStore': { getBusinessDemoProfessionals: () => { throw new Error('Real calendar must not invoke the DEMO adapter'); } },
    '../hooks/useWeatherContext': { useWeatherContext: () => ({ weatherHours: {}, weatherDays: {}, dayNightProgress: 0 }), getWeatherForHour: () => null, isAdverseWeather: () => false, getWeatherFeatherIcon: () => "cloud-rain", getWeatherColor: () => "#60a5fa" },
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
      compilerOptions: { esModuleInterop: false, alwaysStrict: false, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    vm.runInNewContext(code, {
      exports, console: { log() {}, warn() {}, error: console.error }, Date: Clock, Set, Map,
      setTimeout: fn => {timers.push(fn);return timers.length;}, clearTimeout() {}, setInterval: () => 1, clearInterval() {},
      require(name) {
        if (name in mocks) return mocks[name];
        if (name === '@/components/ui/GoScreenModal') return {GoScreenModal: mocks['react-native'].Modal};
        if (name === '@/components/ui/GoScreenCloseSurface') return {GoScreenCloseSurface:'View',GoScreenCloseGuide:'Guide'};
        if (name === '@/hooks/useBusinessBookings') return load('hooks/useBusinessBookings.ts');
        if (name === '@/data/reservationCardPolicy') return load('data/reservationCardPolicy.ts');
        if (name === '@/data/goEntryPresentation') return load('data/goEntryPresentation.ts');
        if (name === '@/data/customerBookingProjection') return load('data/customerBookingProjection.ts');
        if (name.startsWith('@/components/')) return load(name.replace('@/', '') + '.tsx');
        if (name === '@/lib/time') return load('lib/time.ts');
        if (name === '@/lib/unifiedNotes') return load('lib/unifiedNotes.ts');
        if (name === '@/lib/calendarGestureOwnership') return load('lib/calendarGestureOwnership.ts');
        if (name === '@/lib/calendarCloseResponder') return load('lib/calendarCloseResponder.ts');
        if (name === '@/lib/entryDetailTouchDelivery') return load('lib/entryDetailTouchDelivery.ts');
        if (name === '@/lib/goNoteNavigation') return load('lib/goNoteNavigation.ts');
        if (name.startsWith('.')) { const target=path.resolve(path.dirname(filename),name);return load(target+(existsSync(target+'.tsx')?'.tsx':'.ts')); }
        throw new Error(`Unexpected import ${name}`);
      },
    }, { filename });
    return exports;
  }
  return {
    urls,
    runTimers(){const pending=timers.splice(0);pending.forEach(fn=>fn());},
    load,
    setLanguage: value => { language = value; },
    render(component, props) {
      cursor = 0; effects = [];
      const tree = component(props);
      const pending = effects; effects = [];
      pending.forEach(fn => fn());
      const mountedSessions = new Set();
      const expand = node => {
        if (node == null || typeof node !== 'object') return node;
        if (typeof node.type === 'function' && node.type.name === 'GoEntryDetailsSession') {
          const id = node.props.entry.id; mountedSessions.add(id);
          const previousSlots = slots, previousCursor = cursor, previousEffects = effects;
          slots = sessionSlots.get(id) ?? []; sessionSlots.set(id, slots); cursor = 0; effects = [];
          const child = node.type({ ...node.props, children: node.children });
          const childEffects = effects; effects = []; childEffects.forEach(fn => fn());
          const expanded = expand(child);
          slots = previousSlots; cursor = previousCursor; effects = previousEffects;
          return expanded;
        }
        if (typeof node.type === 'function' && /^GoEntry/.test(node.type.name))
          return expand(node.type({...node.props,children:node.children}));
        return {...node,children:(node.children ?? []).map(expand)};
      };
      const expanded = expand(tree);
      for (const id of sessionSlots.keys()) if (!mountedSessions.has(id)) sessionSlots.delete(id);
      return expanded;
    },
  };
}
