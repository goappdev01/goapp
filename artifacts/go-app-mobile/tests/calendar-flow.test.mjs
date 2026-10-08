import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');

function fixture() {
  const slots = [], timers = [], saves = [];
  let cursor = 0;
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { return react.useState(() => ({ current: initial }))[0]; },
    useCallback: fn => fn,
    useEffect() {},
  };
  const exports = {};
  class Value { setValue() {} }
  const date = () => new Date('2026-10-08T00:00:00');
  const mocks = {
    react,
    'react-native': { Animated: { Value, timing: () => ({ start: callback => callback?.() }), spring: () => ({ start() {} }) } },
    'expo-haptics': { selectionAsync: async () => {}, notificationAsync: async () => {}, NotificationFeedbackType: { Error: 'error', Success: 'success' } },
    '@/lib/time': { getToday: date, formatISODate: () => '2026-10-08', formatDayLabel: () => 'Jue 8' },
  };
  const source = readFileSync('hooks/useGoCalendarFlow.tsx', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, {
    exports, Date,
    setTimeout: (fn, delay) => { timers.push({ fn, delay }); return timers.length; },
    require(name) { assert.ok(name in mocks, `Unexpected import ${name}`); return mocks[name]; },
  });
  const render = () => { cursor = 0; return exports.useGoCalendarFlow(); };
  return {
    render, saves,
    flush() { while (timers.length) timers.shift().fn(); },
    open(options = {}) {
      render().open({ startAt: 'clock', initialDateISO: '2026-10-20', initialDateDraft: 'Mar 20', initialTime: '09:45', initialDuration: '2h', onSave: value => saves.push(JSON.parse(JSON.stringify(value))), ...options });
      return render();
    },
  };
}

test('hours switch immediately to minutes, support returning to hours, and lead to duration', () => {
  const app = fixture();
  let flow = app.open();
  assert.equal(flow.clockPhase, 'hours');
  flow.handleClockTouch(170, 108, true, 108); // 3 o'clock
  flow = app.render();
  assert.equal(flow.clockPhase, 'minutes', 'no delayed timer is needed to recognize the active unit');
  flow.goBackToHours(); flow = app.render();
  assert.equal(flow.clockPhase, 'hours');
  flow.handleClockTouch(170, 108, true, 108); flow = app.render();
  flow.handleClockTouch(108, 26, true, 108); flow = app.render(); // :00
  assert.equal(flow.time, '03:00');
  assert.equal(flow.clockOpen, false);
  assert.equal(flow.step, 'duration'); assert.equal(flow.panelOpen, true);
});

for (const duration of ['15m', '30m', '1h', '2h']) {
  test(`${duration} automatically finishes a valid flow and preserves date and time`, () => {
    const app = fixture();
    let flow = app.open();
    flow.commitClock(); flow = app.render();
    assert.equal(flow.step, 'duration');
    flow.selectDuration(duration); flow = app.render();
    assert.equal(flow.step, 'idle'); assert.equal(flow.panelOpen, false);
    app.flush();
    assert.deepEqual(app.saves, [{ dateISO: '2026-10-20', dateDraft: 'Mar 20', time: '09:45', duration }]);
  });
}

test('omitting time and duration emits empty values instead of inventing values or retaining initial drafts', () => {
  const app = fixture();
  let flow = app.open();
  flow.skipTime(); flow = app.render();
  assert.equal(flow.time, ''); assert.equal(flow.step, 'duration');
  flow.selectDuration(''); flow = app.render();
  assert.equal(flow.duration, ''); assert.equal(flow.step, 'idle');
  app.flush();
  assert.deepEqual(app.saves, [{ dateISO: '2026-10-20', dateDraft: 'Mar 20', time: '', duration: '' }]);
});

test('generic close keeps the initial duration; explicit omission uses the existing duration action', () => {
  const app = fixture();
  app.open().skip(); app.flush();
  assert.equal(app.saves[0].duration, '2h', 'legacy close behavior must not be redefined as SIN DURACIÓN');
  const flow = app.open(); flow.selectDuration(''); app.flush();
  assert.equal(app.saves[1].duration, '');
});

test('validation that requires time keeps corrections available and allows continuation after correction', () => {
  const app = fixture();
  let flow = app.open({ validate: result => result.time ? null : 'Selecciona una hora' });
  flow.skipTime(); flow = app.render(); flow.selectDuration('30m'); flow = app.render();
  app.flush();
  assert.equal(app.saves.length, 0);
  assert.equal(flow.calError, 'Selecciona una hora');
  assert.equal(flow.step, 'duration'); assert.equal(flow.panelOpen, true);
  flow.reopenClock(); flow = app.render();
  assert.equal(flow.clockOpen, true); assert.equal(flow.step, 'clock');
  flow.setPeriodDraft('AM'); flow = app.render(); flow.commitClock(); flow = app.render();
  flow.selectDuration('30m'); flow = app.render(); app.flush();
  assert.equal(flow.step, 'idle'); assert.equal(app.saves.length, 1);
  assert.equal(app.saves[0].duration, '30m'); assert.notEqual(app.saves[0].time, '');
});

test('custom skip-time and skip-duration callers retain their existing behavior', () => {
  const app = fixture();
  let skips = 0;
  app.open({ onSkipTime: () => skips++ }).skipTime();
  assert.equal(skips, 1); assert.equal(app.render().step, 'idle');
  app.open({ skipDuration: true }).commitClock(); app.flush();
  assert.equal(app.render().step, 'idle');
  assert.equal(app.saves[0].duration, '2h');
});
