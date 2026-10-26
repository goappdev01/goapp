import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import lifecycle from './helpers/react-lifecycle.cjs';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { nativePanResponder, touchStream } = require('./tests/helpers/native-pan-responder.cjs');
const { evaluate } = lifecycle;
const actual = nativePanResponder();

function contractEvent(event, kind) {
  const history = event.touchHistory;
  delete event.touchHistory;
  if (kind === 'inherited') Object.setPrototypeOf(event, { touchHistory: history });
  else Object.defineProperty(event, 'touchHistory', { get: () => history, enumerable: kind === 'enumerable' });
  return event;
}

test('the installed SDK 58 PanResponder requires the original responder touchHistory at start capture', () => {
  const event = contractEvent(touchStream().event(), 'non-enumerable');
  const native = actual.create({}).panHandlers;
  assert.equal(event.touchHistory.numberActiveTouches, 1);
  assert.doesNotThrow(() => native.onStartShouldSetResponderCapture(event));
  // This is the original failure: spreading a responder event is not its contract.
  assert.equal({ ...event }.touchHistory, undefined);
  assert.throws(() => native.onStartShouldSetResponderCapture({ ...event }), /numberActiveTouches/);
});

  for (const hand of ['right', 'left']) {
    for (const kind of ['enumerable', 'non-enumerable', 'inherited']) {
      test(`${hand}/${kind}: the shared gesture retains native history through real PanResponder start, move, grant and end`, () => {
        let current, closes = 0, scrolling = true;
        const callbacks = [];
        const native = { PanResponder: { create(config) {
          const result = actual.create(config);
          for (const name of ['onStartShouldSetResponderCapture', 'onMoveShouldSetResponderCapture', 'onMoveShouldSetResponder', 'onResponderGrant', 'onResponderMove', 'onResponderRelease', 'onResponderStart', 'onResponderEnd']) {
            const callback = result.panHandlers[name];
            result.panHandlers[name] = event => {
              callbacks.push(name);
              const result = callback(event);
              assert.equal(event.touchHistory, current.touchHistory, name + ': preserve the original native history reference');
              return result;
            };
          }
          return result;
        } } };
        const ownership = evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership;
        const responder = evaluate('lib/calendarCloseResponder.ts', { 'react-native': native, './calendarGestureOwnership': { calendarGestureOwnership: ownership } });
        const delivery = evaluate('lib/entryDetailTouchDelivery.ts');
        const { createScreenCloseGesture } = evaluate('lib/screenCloseGesture.ts', { './calendarCloseResponder': responder, './entryDetailTouchDelivery': delivery });
        const releaseParent = ownership.openDetail();
        const guide = { x: hand === 'right' ? 290 : 10, y: 420, width: 90, height: 320 };
        const surface = createScreenCloseGesture({ guide: () => guide, handedness: () => hand, enabled: () => true, onClose: () => closes++, scrollEnabled: value => { scrolling = value; } });
        const pan = surface.panHandlers, stream = touchStream({ x: guide.x + 45, y: 500 });
        const event = (...args) => (current = contractEvent(stream.event(...args), kind));
        try {
          const down = event();
          assert.equal(pan.onStartShouldSetResponderCapture(down), false);
          assert.equal(scrolling, false);
          assert.equal(pan.onMoveShouldSetResponderCapture(event(0, 13, 30)), true);
          pan.onResponderGrant(current);
          pan.onResponderStart(current);
          pan.onResponderMove(event(0, 55, 120));
          const up = event(0, 55, 10, true);
          pan.onResponderEnd(up);
          pan.onResponderRelease(up);
          pan.onTouchEndCapture(up);
          assert.equal(closes, 1);
          assert.equal(scrolling, true);
          pan.onResponderRelease(up);
          assert.equal(closes, 1, 'duplicate native release cannot close a second screen');
          for (const name of ['onStartShouldSetResponderCapture', 'onMoveShouldSetResponderCapture', 'onResponderGrant', 'onResponderMove', 'onResponderEnd']) assert.ok(callbacks.includes(name));
        } finally { surface.release(); releaseParent(); }
      });
    }
  }
