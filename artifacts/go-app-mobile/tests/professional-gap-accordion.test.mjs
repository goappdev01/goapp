import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, rn, evaluate } = require('./tests/helpers/react-lifecycle.cjs');
const nodes = n => n ? [n, ...n.childNodes.flatMap(nodes)] : [];

for (const lang of ['es', 'en']) test(`${lang}: real professional instances collapse independently and preserve authorizations, drafts and saved values after reload`, async () => {
  const Identity = React.createContext(''), props = new Map(), saves = [];
  const native = name => p => {
    const id = React.useContext(Identity); if (p.testID) props.set(id + '/' + p.testID, p);
    return React.createElement('div', { 'data-testid': id + '/' + (p.testID || name) }, p.children);
  };
  const api = evaluate('components/empresa/ProfessionalGapPolicy.tsx', {
    'react-native': { ...rn, View: native('View'), Text: native('Text'), TouchableOpacity: native('TouchableOpacity'), TextInput: native('TextInput'), Switch: native('Switch'), Alert: { alert() { throw Error('Unexpected validation failure'); } } },
    '@expo/vector-icons': { Feather: native('Feather') }, '@/contexts/LanguageContext': { useLanguage: () => ({ lang }) },
    '@/data/serviceTiming': evaluate('data/serviceTiming.ts'),
  });
  const initial = { ana: { allowLastMinuteGaps: true, lastMinuteMinutes: 1020 }, luis: { allowLastMinuteGaps: false, lastMinuteMinutes: 360 } };
  let saved = JSON.stringify(initial), values;
  function Host() {
    const [state, setState] = React.useState(() => JSON.parse(saved)); values = state;
    return React.createElement(React.Fragment, null, Object.keys(state).map(id => React.createElement(Identity.Provider, { key: id, value: id },
      React.createElement(api.ProfessionalGapPolicy, { color: '#FFD700', value: state[id], onChange: policy => {
        saves.push({ id, policy }); setState(current => { const next = { ...current, [id]: policy }; saved = JSON.stringify(next); return next; });
      } }))));
  }
  const container = document.createElement('div'); let root = createRoot(container);
  const settle = async fn => React.act(async () => { fn(); for (let i = 0; i < 8; i++) await Promise.resolve(); });
  const byId = id => nodes(container).find(n => n.attributes?.['data-testid'] === id);
  const get = (id, key) => props.get(id + '/professional-gap-' + key);
  const toggle = id => settle(() => get(id, 'toggle').onPress());
  try {
    await settle(() => root.render(React.createElement(Host)));
    for (const id of ['ana', 'luis']) {
      assert.equal(get(id, 'toggle').accessibilityState.expanded, false); assert.equal(get(id, 'toggle').style.minHeight, 44);
      assert.equal(byId(id + '/professional-gap-options'), undefined);
    }
    assert.equal(saves.length, 0); assert.deepEqual(values, initial);
    await toggle('ana'); assert.equal(get('ana', 'toggle').accessibilityState.expanded, true); assert.equal(get('luis', 'toggle').accessibilityState.expanded, false);
    assert.equal(get('ana', 'enabled').value, true); assert.equal(get('ana', 'custom').value, '17');
    for (const h of [24, 12, 6, 3]) assert.ok(byId('ana/professional-gap-preset-' + h));
    assert.ok(byId('ana/professional-gap-selected').textContent.includes('17'));
    await settle(() => get('ana', 'custom').onChangeText('1,5')); const pendingEnd = get('ana', 'custom').onEndEditing;
    await toggle('ana'); await settle(pendingEnd);
    assert.equal(saves.length, 0, 'collapse and a late native end-edit event must not authorize or change the selected interval');
    assert.equal(values.ana.allowLastMinuteGaps, true); assert.equal(values.ana.lastMinuteMinutes, 1020);
    await toggle('ana'); assert.equal(get('ana', 'custom').value, '1,5', 'unfinished input survives collapse');
    await settle(() => get('ana', 'custom').onEndEditing()); assert.equal(values.ana.lastMinuteMinutes, 90);
    assert.deepEqual(values.luis, initial.luis);
    await toggle('luis'); assert.equal(get('luis', 'enabled').value, false);
    await settle(() => get('luis', 'enabled').onValueChange(true));
    await settle(() => get('luis', 'preset-12').onPress()); assert.equal(values.luis.lastMinuteMinutes, 720); assert.equal(values.ana.lastMinuteMinutes, 90);
    await toggle('ana'); await toggle('luis'); const count = saves.length;
    await settle(() => root.unmount()); root = createRoot(container);
    await settle(() => root.render(React.createElement(Host)));
    for (const id of ['ana', 'luis']) assert.equal(get(id, 'toggle').accessibilityState.expanded, false);
    await toggle('ana'); await toggle('luis'); assert.equal(saves.length, count, 'opening and closing never save authorization');
    assert.equal(get('ana', 'enabled').value, true); assert.equal(get('ana', 'custom').value, '1.5');
    assert.equal(get('luis', 'enabled').value, true); assert.equal(get('luis', 'preset-12').accessibilityState.selected, true);
  } finally { await settle(() => root.unmount()); }
});
