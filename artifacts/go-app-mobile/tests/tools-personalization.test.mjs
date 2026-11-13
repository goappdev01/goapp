import { test } from 'node:test';
import assert from 'node:assert/strict';
import life from './helpers/react-lifecycle.cjs';

const { React, createRoot, document, evaluate } = life;
const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

function nativeFixture() {
  const rendered = [];
  const component = name => props => {
    rendered.push({ name, props });
    return React.createElement('div', {}, props.children);
  };
  return {
    rendered,
    latest: predicate => rendered.findLast(({ props }) => predicate(props))?.props,
    native: {
      ...life.rn,
      ...Object.fromEntries(['View', 'Text', 'TouchableOpacity', 'TextInput'].map(name => [name, component(name)])),
      Dimensions: { get: () => ({ width: 320, height: 568 }) },
      PanResponder: { create: handlers => ({ panHandlers: handlers }) },
    },
  };
}

test('compact opacity control updates its label, accessible value and real previews, persists and recovers from a failed save', async () => {
  const f = nativeFixture(), stored = new Map(), icons = [];
  let fail = false;
  const storage = {
    getItem: async key => stored.get(key) ?? null,
    setItem: async (key, value) => { if (fail) throw Error('Local storage unavailable'); stored.set(key, value); },
  };
  const pref = evaluate('components/ui/goNavigationAppearance.ts', { '@react-native-async-storage/async-storage': storage });
  const imports = {
    'react-native': { ...f.native, useColorScheme: () => 'dark' },
    './goNavigationAppearance': pref,
    '@expo/vector-icons': { Feather: props => { icons.push(props); return null; } },
  };
  const close = evaluate('components/ui/GoCloseButton.tsx', imports);
  const { GoNavigationAppearanceControl } = evaluate('components/ui/GoNavigationAppearanceControl.tsx', {
    ...imports, './GoCloseButton': close,
  });
  const host = document.createElement('div'), root = createRoot(host);
  const slider = () => f.latest(p => p.accessibilityRole === 'adjustable');
  const preview = () => f.latest(p => p.accessibilityLabel === 'Vista previa de Atrás');
  const action = async callback => { await React.act(async () => { callback(); }); };
  try {
    await action(() => root.render(React.createElement(GoNavigationAppearanceControl)));
    assert.match(host.textContent, /^OPACIDAD75%$/);
    const label = f.latest(p => p.children === 'OPACIDAD');
    assert.equal(label.numberOfLines, 1);
    assert.equal(flatten(label.style).color, '#17212B', 'The fixed beige tools surface stays readable in system dark mode');
    assert.equal(flatten(f.latest(p => p.testID === 'navigation-opacity-header').style).flexDirection, 'row');
    for (const name of ['Atrás', 'Salir', 'Configuración']) {
      const control = f.latest(p => p.accessibilityLabel === `Vista previa de ${name}`);
      assert.equal(flatten(control.style).width, 44);
      assert.equal(flatten(control.style).height, 44);
      assert.equal(flatten(control.style).borderRadius, 14);
    }
    assert.deepEqual(icons.slice(-3).map(icon => icon.size), [21, 21, 21]);
    assert.equal(flatten(slider().style).height, 44);
    slider().onLayout({ nativeEvent: { layout: { width: 240 } } });
    for (const [x, expected] of [[0, 11], [120, 55], [240, 99], [300, 99]]) {
      await action(() => slider().onPanResponderMove({ nativeEvent: { locationX: x } }));
      assert.equal(host.textContent, `OPACIDAD${expected}%`);
      assert.equal(slider().accessibilityValue.now, expected);
      assert.equal(stored.get(pref.NAVIGATION_OPACITY_KEY), String(expected));
      assert.equal(flatten(preview().style).backgroundColor, `rgba(60,68,78,${expected / 100})`);
      assert.equal(flatten(preview().style).height, 44, 'Compact previews retain a comfortable touch area');
    }
    await action(() => slider().onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    assert.equal(slider().accessibilityValue.now, 99);
    await action(() => slider().onAccessibilityAction({ nativeEvent: { actionName: 'decrement' } }));
    assert.equal(slider().accessibilityValue.now, 98);
    fail = true;
    await action(() => slider().onPanResponderGrant({ nativeEvent: { locationX: 60 } }));
    assert.equal(slider().accessibilityValue.now, 33, 'A failed save does not freeze the preview');
    assert.match(host.textContent, /No se pudo conservar la preferencia/);
    fail = false;
    await action(() => slider().onAccessibilityAction({ nativeEvent: { actionName: 'increment' } }));
    assert.equal(host.textContent, 'OPACIDAD34%');
    assert.equal(stored.get(pref.NAVIGATION_OPACITY_KEY), '34');
  } finally {
    await action(() => root.unmount());
  }
});

test('compact handedness buttons retain selection, persistence, center base and unrelated size controls', async () => {
  const f = nativeFixture(), stored = new Map(), writes = [], errors = [];
  let fail = false, handedness = 'right', toggles = 0, size = 'estandar';
  const storage = {
    getItem: async key => stored.get(key) ?? null,
    setItem: async (key, value) => { if (fail) throw Error('Local storage unavailable'); stored.set(key, value); writes.push([key, value]); },
  };
  let dock = evaluate('hooks/useGoDockPreference.ts', { '@react-native-async-storage/async-storage': storage });
  const country = evaluate('utils/countryConfig.ts');
  const translations = { left_handed: 'Zurdo', right_handed: 'Diestro', large: 'Grande', medium: 'Mediano', small: 'Pequeño' };
  const { HerramientasPanel } = evaluate('components/herramientas/HerramientasPanel.tsx', {
    'react-native': f.native,
    '@/hooks/useGoDockPreference': { useGoDockPreference: (...args) => dock.useGoDockPreference(...args) },
    '@/components/ui/GoNavigationAppearanceControl': { GoNavigationAppearanceControl: () => null },
    '@/components/ui/GoCloseButton': { GoCloseButton: () => null },
    '@/components/dev/GoDevPanel': { GoDevPanel: () => null },
    '../DraggableFAB': { DraggableFAB: ({ children }) => children },
    '@expo/vector-icons': { Feather: () => null },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 20, bottom: 16 }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: 'es', t: key => translations[key] ?? key }) },
    '@/i18n/translations': { LANG_META: [] },
    'expo-haptics': { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light' } },
    '@react-native-async-storage/async-storage': storage,
    '../../utils/guidance': { GUIDANCE_NAMES: [], GUIDANCE_NAMES_EN: [] },
    '../../utils/countryConfig': country,
  });
  const host = document.createElement('div');
  let root = createRoot(host);
  function App() {
    const [hand, setHand] = React.useState(handedness);
    const [scale, setScale] = React.useState(size);
    handedness = hand;
    size = scale;
    return React.createElement(HerramientasPanel, {
      visible: true, onClose() {}, handedness: hand,
      toggleHandedness: () => { toggles++; setHand(value => value === 'right' ? 'left' : 'right'); },
      uiScale: scale, setUiScale: setScale, userGoPhoneDraft: '', userMarket: 'es', userRegion: '',
      showToast: (...args) => errors.push(args),
    });
  }
  const render = async () => { await React.act(async () => root.render(React.createElement(App))); };
  const option = label => f.latest(p => p.accessibilityRole === 'radio' && p.accessibilityLabel === label);
  const press = async label => { await React.act(async () => { option(label).onPress(); }); };
  const selected = label => ['Zurdo', 'Centro', 'Diestro'].forEach(name => {
    assert.equal(option(name).accessibilityState.checked, name === label);
    assert.equal(option(name).accessibilityState.selected, name === label);
    assert.equal(option(name)['aria-checked'], name === label);
  });
  try {
    await render();
    assert.ok(!host.textContent.includes('PERSONALIZACIÓN'));
    selected('Diestro');
    for (const label of ['Zurdo', 'Centro', 'Diestro']) {
      const props = option(label), style = flatten(props.style), children = React.Children.toArray(props.children);
      assert.equal(style.flexDirection, 'row');
      assert.ok(style.minHeight >= 44);
      assert.equal(children[0].props.children, label);
      assert.equal(children[0].props.numberOfLines, 1);
      assert.equal(children.length, label === 'Centro' ? 1 : 2);
      if (label !== 'Centro') assert.equal(children[1].props.children, label === 'Zurdo' ? '←' : '→');
    }
    await press('Centro'); selected('Centro');
    assert.equal(toggles, 0);
    assert.deepEqual(JSON.parse(stored.get(dock.GO_DOCK_KEY)), { position: 'center', base: 'right' });
    await press('Zurdo'); selected('Zurdo');
    assert.equal(handedness, 'left');
    assert.equal(toggles, 1);
    const count = writes.length;
    await press('Zurdo');
    assert.equal(writes.length, count, 'Pressing the current option is a no-op');
    await press('Centro'); selected('Centro');
    assert.deepEqual(JSON.parse(stored.get(dock.GO_DOCK_KEY)), { position: 'center', base: 'left' });
    await React.act(async () => root.unmount());
    dock = evaluate('hooks/useGoDockPreference.ts', { '@react-native-async-storage/async-storage': storage });
    root = createRoot(host);
    await render(); selected('Centro');
    fail = true;
    await press('Diestro'); selected('Centro');
    assert.equal(errors.at(-1)[1], 'error');
    fail = false;
    await press('Diestro'); selected('Diestro');
    assert.equal(handedness, 'right');
    const sizeButton = f.latest(p => React.Children.toArray(p.children)[0]?.props?.children === 'Grande');
    assert.equal(flatten(sizeButton.style).flexDirection, undefined, 'Compact row styles do not leak into GO size controls');
    await React.act(async () => { sizeButton.onPress(); });
    assert.equal(size, 'grande');
    assert.equal(stored.get('go_ui_scale_v1'), 'grande');
  } finally {
    await React.act(async () => root.unmount());
  }
});
