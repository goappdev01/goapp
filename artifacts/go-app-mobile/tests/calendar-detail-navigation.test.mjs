import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { detailFixture, detailEntry } from './helpers/calendar-detail-lifecycle.mjs';
import { calendarSelectionFixture } from './helpers/calendar-selection-lifecycle.mjs';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React } = require('./tests/helpers/react-lifecycle.cjs');
const nodes = n => n ? [n, ...n.childNodes.flatMap(nodes)] : [];

for (const hand of ['right', 'left']) for (const internal of [false, true]) test(`${hand}/${internal ? 'task from Note' : 'reservation'}: repeated native dismissal, incomplete gestures and return to Landing leave both surfaces usable`, async () => {
  const detail = await detailFixture({ handedness: hand }); let controls, closeCount = 0, landingTaps = 0, calendarTaps = 0;
  function Screens({ selection }) {
    const [calendarOpen, setCalendarOpen] = React.useState(true);
    const press = () => calendarOpen ? calendarTaps++ : landingTaps++;
    controls = { calendarOpen, exit: () => setCalendarOpen(false), reopen: () => setCalendarOpen(true), press };
    return React.createElement('div', null,
      React.createElement('button', { onClick: press }, calendarOpen ? 'Calendar' : 'Landing'),
      React.createElement(detail.api.GoEntryDetailsSheet, { handedness: hand, entry: selection.entry, onClose: () => { closeCount++; selection.open(null); } }));
  }
  let selected;
  const calendar = await calendarSelectionFixture(undefined, selection => { selected = selection; return React.createElement(Screens, { selection }); });
  const record = { ...detailEntry, ...(internal ? { type: 'TAREA', customerBooking: false, reservationId: undefined, direction: 'self', sourceNoteId: 'note-1', notes: 'Hacer la compra' } : {}) };
  const frozen = JSON.stringify(record), event = { nativeEvent: { pageX: hand === 'right' ? 380 : 10, pageY: 450 } };
  // Keep batches below the selection fixture's 80-render runaway guard.
  try {
    await calendar.render([record]);
    for (let cycle = 0; cycle < 12; cycle++) {
      await calendar.open(record); assert.equal(selected.entry.id, record.id);
      assert.ok(nodes(calendar.container).some(n => n.attributes?.['data-testid'] === 'entry-details-overlay'));
      let pan = detail.props.get('entry-details-gesture-body');
      for (const dy of [40, 139, 140]) await detail.settle(() => pan.onPanResponderRelease(event, { dy, dx: 0 }));
      pan.onPanResponderTerminate(); assert.equal(detail.props.get('entry-details-modal').visible, true);
      assert.equal(closeCount, cycle); assert.equal(controls.calendarOpen, true);
      await calendar.render([{ ...record, time: cycle % 2 ? '12:30' : '12:00' }]);
      assert.equal(detail.props.get('entry-details-modal').visible, true);
      pan = detail.props.get('entry-details-gesture-body'); const stale = detail.props.get('entry-details-modal');
      await detail.settle(() => {
        pan.onPanResponderRelease(event, { dy: 180, dx: 0 });
        pan.onPanResponderRelease(event, { dy: 220, dx: 0 });
        detail.props.get('Cerrar detalle').onPress({ stopPropagation() {} });
      });
      assert.equal(closeCount, cycle); assert.equal(selected.entry.id, record.id); assert.equal(controls.calendarOpen, true);
      await detail.nativeDismiss(); assert.equal(closeCount, cycle + 1); assert.equal(selected.entry, null);
      await detail.settle(() => { stale.onDismiss(); stale.onRequestClose(); pan.onPanResponderRelease(event, { dy: 200, dx: 0 }); });
      assert.equal(closeCount, cycle + 1, 'stale responders cannot issue a second close or exit Calendar');
      await detail.settle(() => controls.exit()); assert.equal(controls.calendarOpen, false);
      // Real React event handlers in the parent remain available after the detail unmounts.
      await detail.settle(() => { controls.press(); controls.reopen(); }); assert.equal(controls.calendarOpen, true); controls.press();
    }
    assert.equal(landingTaps, 12); assert.equal(calendarTaps, 12); assert.equal(closeCount, 12);
    assert.ok(calendar.renders < 65); assert.equal(JSON.stringify(record), frozen);
    assert.equal(nodes(calendar.container).some(n => n.attributes?.['data-testid'] === 'entry-details-overlay'), false);
  } finally { await calendar.close(); await detail.dispose(); }
});
