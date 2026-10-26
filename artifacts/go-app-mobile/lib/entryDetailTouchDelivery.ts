import type { GestureResponderEvent } from "react-native";
import type { createCalendarCloseResponder } from "./calendarCloseResponder";

/** Deliver the original Calendar responder's lane before UIScrollView starts panning.
 * The complete sheet owns the handlers, including its footer. Native scrolling is
 * suspended only for that contact; taps still reach the existing buttons below. */
export function entryDetailTouchDelivery(responder: ReturnType<typeof createCalendarCloseResponder>, options: {
  enabled: () => boolean;
  width: () => number;
  handedness: () => "left" | "right";
  scrollEnabled: (enabled: boolean) => void;
}) {
  let locked: { identifier: number | string; timestamp: number } | null = null;
  const release = () => { if (locked) { locked = null; options.scrollEnabled(true); } };
  const matches = (event: GestureResponderEvent) => !!locked && event?.nativeEvent.identifier === locked.identifier
    && event.nativeEvent.timestamp >= locked.timestamp;
  const finalize = (event: GestureResponderEvent) => { if (matches(event)) release(); };
  const native = responder.panHandlers;
  return {
    release,
    panHandlers: {
      ...native,
      onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
        release();
        const e = event.nativeEvent;
        const inLane = options.handedness() === "left" ? e.pageX <= options.width() * 0.25 : e.pageX >= options.width() * 0.75;
        if (options.enabled() && e.touches.length === 1 && inLane) {
          locked = { identifier: e.identifier, timestamp: e.timestamp };
          options.scrollEnabled(false);
        }
        return native.onStartShouldSetResponderCapture(event);
      },
      onTouchEndCapture: finalize,
      onTouchCancelCapture: (event: GestureResponderEvent) => { try { native.onResponderTerminate(event); } finally { finalize(event); } },
      onResponderRelease: (event: GestureResponderEvent) => { try { native.onResponderRelease(event); } finally { finalize(event); } },
      onResponderTerminate: (event: GestureResponderEvent) => { try { native.onResponderTerminate(event); } finally { finalize(event); } },
      onResponderReject: (event: GestureResponderEvent) => { try { native.onResponderReject(event); } finally { finalize(event); } },
    },
  };
}
