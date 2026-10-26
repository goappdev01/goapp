import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nestedCalendarFixture } from './helpers/nested-calendar-gestures.mjs';

function closeCalendar(f) {
  const s = f.stream(380), pan = f.calendarPan, down = s.event();
  pan.onStartShouldSetResponderCapture(down);
  const move = s.event(0, 13, 40); pan.onMoveShouldSetResponderCapture(move); assert.equal(pan.onMoveShouldSetResponder(move), true);
  pan.onResponderGrant(move); pan.onResponderMove(s.event(0, 180, 600));
  pan.onResponderRelease(s.event(0, 180, 10, true)); f.refreshRoot();
}

for (const hand of ['right', 'left']) for (const mode of ['button', 'drag']) test(`${hand}/${mode}: actual nested recognizers require a new Calendar touch before returning to Landing`, async () => {
  const f = await nestedCalendarFixture({ hand });
  try {
    for (let cycle = 0; cycle < 12; cycle++) {
      await f.open(); assert.equal(f.root.enabled, false, 'native global RNGH must not compete with detail PanResponder');
      f.rootDown(); f.rootStart(); // Also inject callbacks from an already queued global recognition.
      let result;
      if (mode === 'button') await f.detail.pressClose();
      else { result = await f.releaseDetail(f.stream()); assert.equal(result.claimed, true); }
      f.rootEnd(); assert.equal(f.calendarOpenRef.current, true); assert.equal(f.counters.globalCloses, 0);
      assert.equal(f.detail.props.get('entry-details-modal').visible, false);
      assert.equal(f.counters.detailCloses, cycle, 'wait for native iOS dismissal');
      const late = result?.up ?? f.stream().event(0, 200, 10, true);
      f.calendarPan.onResponderRelease(late); // Parent never owned this touch-down.
      assert.equal(f.counters.calendarCloses, cycle);
      await f.acknowledge(); assert.equal(f.counters.detailCloses, cycle + 1); assert.equal(f.detail.ownership.detailOpen(), false);
      f.calendarPan.onResponderRelease(late); f.rootEnd();
      assert.equal(f.calendarOpenRef.current, true, 'late release after onDismiss cannot cascade');
      closeCalendar(f); assert.equal(f.calendarOpenRef.current, false); assert.equal(f.counters.calendarCloses, cycle + 1);
      f.rootEnd(); assert.equal(f.counters.globalCloses, 0, 'Calendar release cannot be reused by Landing');
      assert.equal(f.root.enabled, true, 'Landing recognizer is operable after native modal and Calendar close');
      await f.reopenCalendar();
    }
    assert.equal(f.counters.detailCloses, 12); assert.equal(f.counters.calendarCloses, 12);
  } finally { await f.dispose(); }
});

for (const hand of ['right', 'left']) test(`${hand}: actual RN grant reset, incomplete drags, flicks, cancellation and duplicate attempts remain isolated`, async () => {
  const f = await nestedCalendarFixture({ hand });
  try {
    await f.open();
    let result = await f.releaseDetail(f.stream(), 40, 600); assert.equal(result.claimed, true);
    assert.equal(f.detail.props.get('entry-details-modal').visible, true); assert.equal(f.counters.detailCloses, 0);
    result = await f.releaseDetail(f.stream(), 40, 40); assert.equal(result.claimed, true);
    assert.equal(f.detail.props.get('entry-details-modal').visible, true, 'a sub-threshold flick cannot bypass the Calendar panel criterion');
    result = await f.releaseDetail(f.stream(), 145, 300); assert.equal(result.claimed, true);
    assert.equal(f.detail.props.get('entry-details-modal').visible, false);
    assert.equal((await f.releaseDetail(f.stream(), 200)).claimed, false, 'second gesture during dismissal cannot start');
    const pending = f.stream(380), down = pending.event(); f.calendarPan.onStartShouldSetResponderCapture(down);
    assert.equal(f.calendarPan.onMoveShouldSetResponder(pending.event(0, 30)), false);
    f.rootDown(); f.rootStart(); f.rootEnd(); assert.equal(f.calendarOpenRef.current, true);
    await f.acknowledge(); f.calendarPan.onResponderRelease(pending.event(0, 200, 10, true));
    assert.equal(f.calendarOpenRef.current, true); assert.equal(f.counters.calendarCloses, 0);
    await f.open();
    const pan = f.detail.props.get('entry-details-sheet'), s = f.stream(); pan.onStartShouldSetResponderCapture(s.event());
    const activation = s.event(0, 13); assert.equal(pan.onMoveShouldSetResponderCapture(activation), true); assert.equal(pan.onMoveShouldSetResponder(activation), true); pan.onResponderGrant(activation);
    assert.equal(pan.onResponderTerminationRequest(activation), false, 'another JS responder cannot steal an owned drag');
    pan.onResponderTerminate(activation); pan.onResponderRelease(s.event(0, 200, 10, true));
    assert.equal(f.detail.props.get('entry-details-modal').visible, true, 'forced system cancellation leaves the sheet usable');
    await f.releaseDetail(f.stream(), 145, 600); assert.equal(f.detail.props.get('entry-details-modal').visible, false, 'distance is measured from finger-down despite native grant resetting dy');
    await f.acknowledge(); closeCalendar(f); assert.equal(f.calendarOpenRef.current, false);
    f.rootDown(); f.rootStart(); f.rootEnd(100); assert.equal(f.counters.globalCloses, 1); assert.equal(f.counters.resetFields, 1, 'a separate Landing gesture still invokes its original handlers');
  } finally { await f.dispose(); }
});

for (const hand of ['right', 'left']) test(`${hand}: central scrolling stays central even if the finger later crosses into the side lane`, async () => {
  const f = await nestedCalendarFixture({ hand });
  try {
    await f.open(); const pan = f.detail.props.get('entry-details-sheet'), s = f.stream(195, 400);
    pan.onStartShouldSetResponderCapture(s.event());
    assert.equal(pan.onMoveShouldSetResponderCapture(s.event(hand === 'right' ? 185 : -185, 200, 600)), false);
    assert.equal(f.detail.props.get('entry-details-modal').visible, true); assert.equal(f.root.enabled, false);
    await f.detail.pressClose(); await f.acknowledge(); closeCalendar(f); assert.equal(f.calendarOpenRef.current, false);
  } finally { await f.dispose(); }
});

test('late releases and finalization from an old recognizer cannot erase the next independent gesture', async () => {
  const f = await nestedCalendarFixture();
  try {
    await f.open(); const first = await f.releaseDetail(f.stream()); await f.acknowledge();
    const s = f.stream(380), pan = f.calendarPan;
    pan.onStartShouldSetResponderCapture(s.event()); const move = s.event(0, 13, 40);
    pan.onMoveShouldSetResponderCapture(move); assert.equal(pan.onMoveShouldSetResponder(move), true); pan.onResponderGrant(move);
    pan.onResponderMove(s.event(0, 180, 600));
    pan.onResponderTerminate(first.up); pan.onResponderRelease(first.up); // Reused finger id; older timestamp.
    pan.onResponderRelease(s.event(0, 180, 10, true)); assert.equal(f.calendarOpenRef.current, false);
    const oldRoot = f.root; f.refreshRoot(); f.rootDown(); f.rootStart(); oldRoot.onFinalize?.();
    f.rootEnd(100); assert.equal(f.counters.globalCloses, 1, 'old finalization has recognizer-local state');
    await f.reopenCalendar(); await f.open();
    const oldSheet = f.detail.props.get('entry-details-sheet'), next = f.stream();
    oldSheet.onStartShouldSetResponderCapture(next.event()); const start = next.event(0, 13, 40);
    assert.equal(oldSheet.onMoveShouldSetResponderCapture(start), true); assert.equal(oldSheet.onMoveShouldSetResponder(start), true); oldSheet.onResponderGrant(start);
    oldSheet.onResponderMove(next.event(0, 145, 600)); oldSheet.onResponderTerminate(first.up); oldSheet.onResponderRelease(first.up);
    await f.detail.settle(() => oldSheet.onResponderRelease(next.event(0, 145, 10, true)));
    assert.equal(f.detail.props.get('entry-details-modal').visible, false); await f.acknowledge();
  } finally { await f.dispose(); }
});
