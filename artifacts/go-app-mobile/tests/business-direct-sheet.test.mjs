import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { React, createRoot, document, evaluate } = require('./helpers/react-lifecycle.cjs');
const { direct, context, staffId, serviceId, receiptId } = require('./helpers/business-direct-fixture.cjs');
const flush = () => new Promise(setImmediate);

async function mount({ fail = false, pending = null } = {}) {
  const controls = new Map(), calls = [], saved = []; let closed = 0;
  const host = name => ({ children, ...props }) => {
    if (props.testID) controls.set(props.testID, props);
    return React.createElement('div', { 'data-testid': props.testID, 'data-native': name }, children);
  };
  const { BusinessQuickBookingSheet } = evaluate('components/booking/BusinessQuickBookingSheet.tsx', {
    'react-native': { View: host('View'), Text: host('Text'), ScrollView: host('ScrollView'), TextInput: host('Input'),
      TouchableOpacity: host('Button'), KeyboardAvoidingView: host('KeyboardAvoidingView'), Platform: { OS: 'ios' }, StyleSheet: { create: value => value } },
    '@/components/ui/GoTimePicker': { GoTimeField: props => React.createElement(host('GoTimeField'), { ...props, testID: `time-${props.label}` }) },
    '@/data/businessDirectEntry': direct,
  });
  const gateway = { currentIdentity: async () => 'owner-session', commit: async (command, requestId) => {
    calls.push(JSON.parse(JSON.stringify(command)));
    if (pending) await pending;
    if (fail) throw Error('Conflicto de horario');
    return { id: receiptId, kind: command.kind, businessId: command.businessId, requestId };
  } };
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  await React.act(async () => root.render(React.createElement(BusinessQuickBookingSheet, {
    context: context(), dateISO: '2026-11-06', startTime: '10:15', staffId, gateway, nextRequestId: () => 'ui_operation',
    onSaved: value => saved.push(value), onClose: () => closed++, onPickDate: (_date, select) => select('2026-11-07'), bottomInset: 34,
  })));
  const change = async (id, value) => React.act(async () => controls.get(id).onChangeText(value));
  const press = async id => React.act(async () => { controls.get(id).onPress(); await flush(); });
  return { controls, calls, saved, change, press, text: () => container.textContent, get closed() { return closed; },
    async unmount() { await React.act(async () => root.unmount()); document.body.removeChild(container); } };
}

test('real quick-sheet handlers preserve slot, select service duration and only report a persisted result', async () => {
  const f = await mount();
  try {
    await f.change('direct-customerName', 'Cliente sintético');
    await f.press(`direct-service-${serviceId}`);
    assert.match(f.text(), /45 min/);
    await f.press('direct-save');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].startTime, '10:15'); assert.equal(f.calls[0].durationMinutes, 45);
    assert.equal(f.saved[0].id, receiptId); assert.equal(f.calls[0].customerName, 'Cliente sintético');
  } finally { await f.unmount(); }
});

test('a server conflict keeps all entered customer data and never invokes success', async () => {
  const f = await mount({ fail: true });
  try {
    await f.change('direct-customerName', 'Conservar cliente'); await f.press(`direct-service-${serviceId}`);
    await f.change('direct-phone', '000000000'); await f.change('direct-notes', 'Solo datos sintéticos');
    await f.press('direct-save');
    assert.match(f.text(), /Conflicto de horario/); assert.equal(f.saved.length, 0);
    assert.equal(f.controls.get('direct-customerName').value, 'Conservar cliente');
    assert.equal(f.controls.get('direct-phone').value, '000000000');
    assert.equal(f.controls.get('direct-notes').value, 'Solo datos sintéticos');
  } finally { await f.unmount(); }
});

test('cancel and date selection use existing host callbacks, without creating any booking', async () => {
  const f = await mount();
  try {
    await f.press('direct-date'); assert.match(f.text(), /07\/11\/2026/);
    await f.press('direct-cancel'); assert.equal(f.closed, 1); assert.equal(f.calls.length, 0);
  } finally { await f.unmount(); }
});

test('block form submits an interval and reason, with no fictitious customer', async () => {
  const f = await mount();
  try {
    await f.press('direct-kind-block'); await f.change('direct-concept', 'Descanso');
    await React.act(async () => f.controls.get('time-Hora final').onConfirm('11:00'));
    await f.press('direct-save');
    assert.equal(f.calls.length, 1); assert.equal(f.calls[0].kind, 'block'); assert.equal(f.calls[0].durationMinutes, 45);
    assert.equal('customerName' in f.calls[0], false);
  } finally { await f.unmount(); }
});

test('double press during a save submits once and keeps save/cancel disabled until the receipt', async () => {
  let resolve; const pending = new Promise(done => { resolve = done; });
  const f = await mount({ pending });
  try {
    await f.change('direct-customerName', 'Cliente sintético'); await f.press(`direct-service-${serviceId}`);
    await React.act(async () => { const handler = f.controls.get('direct-save').onPress; handler(); handler(); await flush(); });
    assert.equal(f.calls.length, 1); assert.equal(f.saved.length, 0);
    assert.equal(f.controls.get('direct-save').disabled, true); assert.equal(f.controls.get('direct-cancel').disabled, true);
    await React.act(async () => { resolve(); await flush(); }); assert.equal(f.saved.length, 1);
  } finally { resolve(); await f.unmount(); }
});
