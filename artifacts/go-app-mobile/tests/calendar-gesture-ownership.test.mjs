import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { evaluate, React } = require('./tests/helpers/react-lifecycle.cjs');
import { detailFixture } from './helpers/calendar-detail-lifecycle.mjs';

test('one parent consumes an interaction; modal transitions invalidate old tickets and a new finger-down is mandatory', () => {
  const owner = evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership;
  const down = { identifier: 0, timestamp: 100 }, calendar = owner.beginParentTouch(down), global = owner.beginParentTouch();
  assert.equal(owner.consumeParentTouch(calendar, { identifier: 0, timestamp: 200 }), true);
  assert.equal(owner.consumeParentTouch(calendar, down), false); assert.equal(owner.consumeParentTouch(global), false);
  const old = owner.beginParentTouch(down), release = owner.openDetail();
  assert.equal(owner.beginParentTouch(down), null); assert.equal(owner.canUseParentTouch(old, down), false);
  release(); release(); assert.equal(owner.detailOpen(), false); assert.equal(owner.canUseParentTouch(old, down), false);
  const next = owner.beginParentTouch({ identifier: 0, timestamp: 300 });
  assert.equal(owner.consumeParentTouch(next, { identifier: 0, timestamp: 200 }), false, 'late old release with reused native finger id is rejected');
  assert.equal(owner.consumeParentTouch(next, { identifier: 1, timestamp: 400 }), false);
  assert.equal(owner.consumeParentTouch(next, { identifier: 0, timestamp: 400 }), true);
});

test('snapshot is a stable primitive and every modal lease and subscriber is released', () => {
  const owner = evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership; let notifications = 0;
  const unsubscribe = owner.subscribe(() => notifications++), a = owner.openDetail(), b = owner.openDetail();
  assert.equal(owner.detailOpen(), true); assert.equal(owner.detailOpen(), owner.detailOpen()); assert.equal(notifications, 1);
  a(); assert.equal(owner.detailOpen(), true); b(); assert.equal(owner.detailOpen(), false); assert.equal(notifications, 2);
  unsubscribe(); const c = owner.openDetail(); c(); assert.equal(notifications, 2);
});

test('a real React subscriber settles across repeated native modal close cycles without maximum update depth', async () => {
  const f = await detailFixture(); let renders = 0;
  const { createRoot, document } = require('./tests/helpers/react-lifecycle.cjs');
  let setEntry, active;
  function Host() {
    if (++renders > 80) throw Error('Gesture subscription did not settle');
    const [entry, set] = React.useState(null); setEntry = set;
    active = React.useSyncExternalStore(f.ownership.subscribe, f.ownership.detailOpen, f.ownership.detailOpen);
    return React.createElement(f.api.GoEntryDetailsSheet, { entry, onClose: () => set(null) });
  }
  const root = createRoot(document.createElement('div'));
  try {
    await f.settle(() => root.render(React.createElement(Host)));
    for (let i = 0; i < 12; i++) {
      await f.settle(() => setEntry({ id: 'same-record', type: 'TAREA_INTERNA', notes: 'Hacer la compra' })); assert.equal(active, true);
      await f.pressClose(); await f.nativeDismiss(); assert.equal(active, false); assert.equal(f.ownership.detailOpen(), false);
    }
    assert.ok(renders < 60);
  } finally { await f.settle(() => root.unmount()); await f.dispose(); }
});
