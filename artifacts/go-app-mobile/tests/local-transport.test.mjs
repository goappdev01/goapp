import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { React, createRoot, document, evaluate, rn, native, ts } = require('./helpers/react-lifecycle.cjs');
const transport = evaluate('data/localTransport.ts');
const plain = value => JSON.parse(JSON.stringify(value));
const at = (city, country = 'España') => ({ city, country });

test('verified municipality/country entry points change with locality and transport type', () => {
  for (const source of transport.OFFICIAL_LOCAL_TRANSPORT) {
    for (const kind of ['taxi', 'public']) {
      const target = transport.resolveLocalTransport(kind, source);
      assert.equal(target.official, !!source[kind]);
      if (source[kind]) { assert.equal(target.url, source[kind].url); assert.ok(transport.safeTransportUrl(target.url)); }
    }
  }
  assert.match(transport.resolveLocalTransport('taxi', at('Molina de Segura')).url, /radiotaximolina/);
  assert.match(transport.resolveLocalTransport('public', at('Molina de Segura')).url, /autocaresdemolina.*horarios/);
  assert.match(transport.resolveLocalTransport('taxi', at('Madrid')).url, /radiotelefono-taxi.*pedir-taxi/);
  assert.match(transport.resolveLocalTransport('public', at('Barcelona')).url, /tmb\.cat/);
  assert.equal(transport.resolveLocalTransport('taxi', at('Madrid', 'México')).official, false);
  assert.equal(transport.resolveLocalTransport('taxi', at('Molina')).official, false, 'do not guess a municipality');
  assert.equal(transport.resolveLocalTransport('taxi', at('MOLINA DE SEGURA', 'Spain')).official, true);
});

test('unknown operator or absent/unsafe link yields an explicit locality-only external search', () => {
  for (const kind of ['taxi', 'public']) {
    for (const sources of [[], [{ ...at('Cieza'), [kind]: { name: 'Unsafe', url: 'http://invalid.example', purpose: 'booking' } }]]) {
      const target = transport.resolveLocalTransport(kind, at('Cieza'), sources);
      assert.equal(target.official, false); assert.equal(target.purpose, 'search');
      const url = new URL(target.url);
      assert.equal(url.origin, 'https://www.google.com');
      assert.match(url.searchParams.get('q'), /Cieza España/);
      assert.doesNotMatch(target.url, /latitude|longitude|pickup|dropoff|userId/);
    }
  }
});

test('no exact coordinates, addresses with numbers, URLs or query injection are accepted as locality', () => {
  for (const city of ['38.0123, -1.2222', 'Calle Mayor 79', 'https://example.com', 'Madrid&lat=1', '']) {
    assert.equal(transport.transportLocality(city, 'ES'), null);
  }
  assert.equal(transport.transportLocality('Madrid', ''), null);
  for (const city of ['L’Hospitalet de Llobregat', 'Molina de Segura', 'Saint-Étienne']) assert.ok(transport.transportLocality(city, 'ES'));
});

test('external navigation uses the supplied existing opener, propagates failures, and rejects unsafe schemes', async () => {
  const calls = [], target = transport.resolveLocalTransport('taxi', at('Madrid'));
  await transport.openLocalTransport(target, async url => calls.push(url));
  assert.deepEqual(calls, [target.url]);
  await assert.rejects(transport.openLocalTransport(target, async () => { throw Error('Cannot open'); }), /Cannot open/);
  for (const url of ['javascript:alert(1)', 'http://example.com', 'https://user:password@example.com', 'https://example.com:8443/']) {
    await assert.rejects(transport.openLocalTransport({ ...target, url }, async () => { throw Error('Must not open'); }), /UNSAFE/);
  }
});

function gps(overrides = {}) {
  const calls = [];
  const adapter = { Accuracy: { Lowest: 1 },
    getForegroundPermissionsAsync: async () => { calls.push('permission'); return { status: 'granted' }; },
    getCurrentPositionAsync: async options => { calls.push(['position', options]); return { coords: { latitude: 38.05432, longitude: -1.23456 } }; },
    reverseGeocodeAsync: async point => { calls.push(['geocode', point]); return [{ city: 'Molina de Segura', isoCountryCode: 'ES', street: 'Never forward', streetNumber: '79' }]; }, ...overrides };
  return { calls, adapter };
}
test('location needs explicit geocoder consent AND an existing permission; denied permission leaves manual entry available', async () => {
  const f = gps();
  await assert.rejects(transport.locateTransportLocality(f.adapter, false), /CONSENT_REQUIRED/);
  assert.equal(f.calls.length, 0);
  const denied = gps({ getForegroundPermissionsAsync: async () => ({ status: 'denied' }) });
  assert.equal(await transport.locateTransportLocality(denied.adapter, true), null);
  assert.equal(denied.calls.length, 0, 'no position, geocoding, new permission request or external service');
});
test('a fresh coarse position resolves only city/country, never retaining or handing coordinates to a provider', async () => {
  const f = gps(), result = await transport.locateTransportLocality(f.adapter, true);
  assert.deepEqual(plain(result), { city: 'Molina de Segura', country: 'ES' });
  assert.deepEqual(plain(f.calls[2]), ['geocode', { latitude: 38.05, longitude: -1.23 }]);
  assert.doesNotMatch(JSON.stringify(result), /street|latitude|longitude|38\./);
  f.adapter.reverseGeocodeAsync = async () => [{ city: 'Madrid', isoCountryCode: 'ES' }];
  const moved = await transport.locateTransportLocality(f.adapter, true);
  assert.match(transport.resolveLocalTransport('taxi', moved).url, /radiotelefono/);
  assert.equal(f.calls.filter(c => Array.isArray(c) && c[0] === 'position').length, 2);
});
test('missing city, invalid position or geocoder failure never invent a locality', async () => {
  for (const overrides of [
    { getCurrentPositionAsync: async () => ({ coords: { latitude: NaN, longitude: 1 } }) },
    { reverseGeocodeAsync: async () => [] },
    { reverseGeocodeAsync: async () => [{ street: 'Unknown street', country: 'España' }] },
  ]) assert.equal(await transport.locateTransportLocality(gps(overrides).adapter, true), null);
  await assert.rejects(transport.locateTransportLocality(gps({ reverseGeocodeAsync: async () => { throw Error('Unavailable'); } }).adapter, true), /Unavailable/);
});

function uiFixture({ openURL = async () => {}, location = gps().adapter } = {}) {
  const fields = new Map(), buttons = new Map(); let text = '';
  const nativeProps = { ...rn, KeyboardAvoidingView: native('KeyboardAvoidingView'), Linking: { openURL },
    Text: props => { text += typeof props.children === 'string' ? props.children : ''; return React.createElement('span', null, props.children); },
    TextInput: props => { fields.set(props.accessibilityLabel, props); return React.createElement('input'); },
    TouchableOpacity: props => { buttons.set(props.accessibilityLabel, props); return React.createElement('button', null, props.children); } };
  const { LocalTransportPanel } = evaluate('components/LocalTransportPanel.tsx', { 'react-native': nativeProps,
    'expo-location': location, '@/data/localTransport': transport,
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    '@/components/ui/GoCloseButton': { GoCloseButton: () => null } });
  const container = document.createElement('div'), root = createRoot(container), props = { kind: 'taxi', scopeKey: 'one:USER', onClose() {} };
  const render = async () => { text = ''; await React.act(async () => root.render(React.createElement(LocalTransportPanel, props))); };
  return { props, fields, buttons, render, text: () => text,
    fill: async (field, value) => { await React.act(async () => fields.get(field).onChangeText(value)); },
    press: async label => { await React.act(async () => buttons.get(label).onPress()); },
    close: async () => { await React.act(async () => root.unmount()); } };
}
test('both actual access panels support manual locality, locality changes, failed opening and retry without double navigation', async () => {
  const calls = []; let fail = true;
  const f = uiFixture({ openURL: async url => { calls.push(url); if (fail) throw Error('No handler'); } });
  try {
    await f.render(); await f.fill('Localidad', 'Molina de Segura'); await f.fill('País', 'España');
    await f.press('Abrir web oficial'); assert.match(f.text(), /No se pudo abrir/);
    assert.equal(f.fields.get('Localidad').value, 'Molina de Segura');
    fail = false;
    await React.act(async () => { const button = f.buttons.get('Abrir web oficial'); button.onPress(); button.onPress(); });
    assert.equal(calls.length, 2);
    await f.fill('Localidad', 'Madrid'); await f.press('Abrir web oficial'); assert.match(calls.at(-1), /radiotelefono/);
    f.props.kind = 'public'; await f.render();
    await f.fill('Localidad', 'Barcelona'); await f.fill('País', 'ES'); await f.press('Abrir web oficial');
    assert.match(calls.at(-1), /tmb\.cat/);
    await f.fill('Localidad', 'Cieza'); assert.match(f.text(), /Sin operador verificado/);
    await f.press('Buscar externamente por localidad'); assert.match(calls.at(-1), /google\.com\/search/);
  } finally { await f.close(); }
});
test('denied GPS has a clear manual fallback, and a late GPS response cannot cross accounts', async () => {
  const denied = uiFixture({ location: gps({ getForegroundPermissionsAsync: async () => ({ status: 'denied' }) }).adapter });
  try { await denied.render(); await denied.press('Usar ubicación autorizada'); assert.match(denied.text(), /no autorizada/); assert.equal(denied.fields.get('Localidad').value, ''); }
  finally { await denied.close(); }
  let resolve; const pending = new Promise(done => resolve = done);
  const lateGps = gps({ getCurrentPositionAsync: () => pending });
  const f = uiFixture({ location: lateGps.adapter });
  try {
    await f.render(); await f.press('Usar ubicación autorizada');
    f.props.scopeKey = 'two:BUSINESS'; await f.render();
    await React.act(async () => { resolve({ coords: { latitude: 38, longitude: -1 } }); await Promise.resolve(); });
    assert.equal(f.fields.get('Localidad').value, ''); assert.equal(f.fields.get('País').value, '');
    assert.equal(lateGps.calls.filter(call => Array.isArray(call) && call[0] === 'geocode').length, 0);
  } finally { await f.close(); }
});

test('Landing connects Taxi/T.pub actions and preserves Uber/Bolt URLs, styling and direct opener', () => {
  const source = fs.readFileSync('app/index.tsx', 'utf8');
  const ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let array;
  const visit = node => {
    if (ts.isArrayLiteralExpression(node) && node.elements.length === 4
      && node.elements[0].getText(ast).includes('label: "Taxi"') && node.elements[3].getText(ast).includes('label: "T.pub"')) array = node.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(array);
  const opened = [], context = { exports: {}, openTransportPanel: kind => opened.push(kind) };
  vm.runInNewContext(ts.transpileModule('exports.ops=' + array, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  const [taxi, uber, bolt, publicTransport] = context.exports.ops;
  taxi.action(); publicTransport.action(); assert.deepEqual(opened, ['taxi', 'public']);
  assert.deepEqual(plain(uber), { label: 'Uber', icon: 'navigation', accent: '#e2e8f0', url: 'https://m.uber.com', raise: 1 });
  assert.deepEqual(plain(bolt), { label: 'Bolt', icon: 'zap', accent: '#4ade80', url: 'https://bolt.eu' });
  assert.match(source, /if \(op\.url\) \{\s*Linking\.openURL\(op\.url\)/);
  assert.match(source, /else if \(op\.action\) \{\s*op\.action\(\)/);
  assert.doesNotMatch(array, /toast_taxi_looking|toast_routes_showing/);
});
