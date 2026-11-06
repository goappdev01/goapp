import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { fixture as calendarFixture } from './helpers/calendar-fixture.mjs';
import { ast, declaration, find, transpile } from './helpers/calendar-container-fixture.mjs';
const ts = createRequire(import.meta.url)('typescript');
const nodes = tree => !tree || typeof tree !== 'object' ? [] : [tree, ...(tree.children ?? []).flatMap(nodes)];

function gestureFixture(disabled = false) {
  const gestures = [];
  const make = kind => {
    const config = { kind }; gestures.push(config);
    const chain = {};
    for (const method of ['enabled', 'maxDuration', 'maxDistance', 'minDuration', 'runOnJS', 'onEnd']) chain[method] = value => { config[method] = value; return chain; };
    return chain;
  };
  const calls = [];
  const scope = { exports: {}, require(name) {
    if (name === 'react') return { default: { createElement: (type, props, ...children) => ({ type, props, children }) } };
    if (name === 'react-native') return { View: 'View' };
    if (name === '@/contexts/LanguageContext') return { useLanguage: () => ({ t: key => key }) };
    if (name === 'react-native-gesture-handler') return { Gesture: { Tap: () => make('tap'), LongPress: () => make('hold'), Exclusive: (...children) => ({ children }) }, GestureDetector: 'GestureDetector' };
    throw Error(name);
  } };
  vm.runInNewContext(transpile(readFileSync('components/ui/GoCalendarSlot.tsx', 'utf8')), scope);
  const tree = scope.exports.GoCalendarSlot({ dateISO: '2030-01-07', timeHHMM: '11:15', disabled, children: {},
    onPress: (...args) => calls.push(['note', ...args]), onLongPress: (...args) => calls.push(['reserve', ...args]) });
  return { gestures, calls, tree };
}

test('a successful 500ms hold opens reservation once, while tap retains note creation', () => {
  const f = gestureFixture(), tap = f.gestures.find(g => g.kind === 'tap'), hold = f.gestures.find(g => g.kind === 'hold');
  assert.equal(hold.minDuration, 500); assert.equal(hold.maxDistance, 8);
  assert.equal(tap.maxDuration, 250); assert.equal(tap.maxDistance, 8);
  hold.onEnd({}, true); tap.onEnd({}, false);
  assert.deepEqual(f.calls, [['reserve', '2030-01-07', '11:15']]);
  tap.onEnd({}, true); assert.equal(f.calls[1][0], 'note');
  assert.equal(f.tree.props.gesture.children.length, 2, 'recognizers are exclusive, not simultaneous');
});

test('cancelled/scroll gestures and disabled slots cannot open either flow', () => {
  for (const disabled of [false, true]) {
    const f = gestureFixture(disabled);
    for (const gesture of f.gestures) gesture.onEnd({}, disabled);
    assert.equal(f.calls.length, 0);
  }
});

test('VoiceOver longpress performs the same reservation action without changing date/time', () => {
  const f = gestureFixture();
  f.tree.children[0].props.onAccessibilityAction({ nativeEvent: { actionName: 'longpress' } });
  assert.deepEqual(f.calls, [['reserve', '2030-01-07', '11:15']]);
});

test('personal calendar and RESERVAR execute the same real Home handler, even for an enterprise account', () => {
  const board = find(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'AgendaBoard');
  const callback = board.attributes.properties.find(p => p.name?.getText(ast) === 'onReserveAtTime');
  assert.equal(callback.initializer.expression.getText(ast), 'openCalendarReservation');
  const button = find(node => ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === 'TouchableOpacity'
    && node.attributes.properties.some(p => p.name?.getText(ast) === 'onPress' && p.initializer?.expression?.getText(ast) === 'openCalendarReservation'));
  assert.ok(button);
  const overlay = find(node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(ast) === 'BookingSearchOverlay');
  assert.equal(overlay.attributes.properties.find(p => p.name?.getText(ast) === 'initialDateISO')?.initializer.expression.getText(ast), 'bookingInitialDateISO ?? undefined');
  for (const isBusinessMode of [false, true]) {
    const calls = [], scope = { exports: {}, isBusinessMode,
      Haptics: { ImpactFeedbackStyle: { Medium: 'medium' }, impactAsync: async () => {} },
      setShowBookingFromCal: value => calls.push(value),
      setBookingInitialDateISO: value => calls.push(['initial-date', value]),
    };
    vm.runInNewContext(transpile('exports.open = ' + declaration('openCalendarReservation')), scope);
    scope.exports.open('2030-01-22', '11:15');
    assert.deepEqual(calls, [['initial-date', '2030-01-22'], true]);
    calls.length = 0;
    // RESERVAR is also wired directly to this handler and passes a native event.
    scope.exports.open({ nativeEvent: {} });
    assert.deepEqual(calls, [['initial-date', null], true]);
  }
});

for (const density of ['15min', '30min', '1h']) test(`real calendar passes precise empty-slot context for ${density} without changing card drag`, () => {
  const f = calendarFixture(); const { AgendaBoard } = f.load('components/AgendaOperativa.tsx');
  const calls = [];
  const tree = f.render(AgendaBoard, { goLog: [], selectedDateISO: '2026-10-08', viewMode: 'dia', density,
    onReserveAtTime: (...args) => calls.push(args), onCreateTaskAtTime() {} });
  const slots = nodes(tree).filter(node => node.type?.name === 'GoCalendarSlot');
  const slot = slots.find(node => node.props.timeHHMM === '11:00'); assert.ok(slot);
  slot.props.onLongPress(slot.props.dateISO, slot.props.timeHHMM);
  assert.deepEqual(calls, [['2026-10-08', '11:00']]);
  assert.equal(slot.props.disabled, false);
});
