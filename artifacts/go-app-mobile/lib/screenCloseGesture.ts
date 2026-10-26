import type { GestureResponderEvent } from "react-native";
import { createCalendarCloseResponder } from "./calendarCloseResponder";
import { entryDetailTouchDelivery } from "./entryDetailTouchDelivery";

export type CloseGuideBounds = { x: number; y: number; width: number; height: number };

/** One contact belongs to the measured guide of one screen, including across its controls. */
export function createScreenCloseGesture(options: {
  guide: () => CloseGuideBounds | null;
  handedness: () => "left" | "right";
  enabled: () => boolean;
  onClose: () => void;
  scrollEnabled: (enabled: boolean) => void;
}) {
  let guide: CloseGuideBounds | null = null, eligible = false;
  let cancellation: GestureResponderEvent | null = null;
  const enabled = () => eligible && options.enabled();
  const width = () => (guide?.width ?? 0) * 4;
  const relative = (event: GestureResponderEvent): GestureResponderEvent => {
    const start = guide ? guide.x - (options.handedness() === "right" ? guide.width * 3 : 0) : 0;
    const x = eligible && guide ? Math.max(guide.x, Math.min(guide.x + guide.width, event.nativeEvent.pageX)) : event.nativeEvent.pageX;
    // Responder history is part of the native contract, even when it is not enumerable.
    return { ...event, touchHistory: event.touchHistory, nativeEvent: { ...event.nativeEvent, pageX: x - start },
      stopPropagation: () => event.stopPropagation() };
  };
  const responder = createCalendarCloseResponder({ enabled, width, handedness: options.handedness,
    detail: true, onClose: options.onClose, onCollapse: options.onClose });
  const delivery = entryDetailTouchDelivery(responder, { enabled, width, handedness: options.handedness, scrollEnabled: options.scrollEnabled });
  const handlers = delivery.panHandlers;
  const matches = (event: GestureResponderEvent) => !!cancellation && event.nativeEvent.identifier === cancellation.nativeEvent.identifier
    && event.nativeEvent.timestamp >= cancellation.nativeEvent.timestamp;
  return {
    release: () => {
      try { if (cancellation) handlers.onResponderTerminate(cancellation); }
      finally { delivery.release(); cancellation = null; eligible = false; guide = null; }
    },
    panHandlers: {
      ...handlers,
      onStartShouldSetResponderCapture: (event: GestureResponderEvent) => {
        guide = options.guide(); const e = event.nativeEvent;
        eligible = !!guide && guide.width > 0 && guide.height > 0 && e.pageX >= guide.x && e.pageX <= guide.x + guide.width
          && e.pageY >= guide.y && e.pageY <= guide.y + guide.height;
        const e2 = relative(event);
        cancellation = { ...e2, nativeEvent: { ...e2.nativeEvent } };
        return handlers.onStartShouldSetResponderCapture(e2);
      },
      onMoveShouldSetResponderCapture: (event: GestureResponderEvent) => {
        const e = relative(event);
        handlers.onMoveShouldSetResponderCapture(e);
        return handlers.onMoveShouldSetResponder(e);
      },
      onMoveShouldSetResponder: (event: GestureResponderEvent) => handlers.onMoveShouldSetResponder(relative(event)),
      onResponderGrant: (event: GestureResponderEvent) => handlers.onResponderGrant(relative(event)),
      onResponderMove: (event: GestureResponderEvent) => handlers.onResponderMove(relative(event)),
      onResponderRelease: (event: GestureResponderEvent) => {
        const current = matches(event);
        try { handlers.onResponderRelease(relative(event)); }
        finally { if (current) { cancellation = null; eligible = false; } }
      },
      onResponderTerminate: (event: GestureResponderEvent) => handlers.onResponderTerminate(relative(event)),
      onResponderReject: (event: GestureResponderEvent) => handlers.onResponderReject(relative(event)),
    },
  };
}
