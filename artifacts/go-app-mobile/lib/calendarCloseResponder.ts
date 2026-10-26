import { PanResponder, type GestureResponderEvent } from "react-native";
import { calendarGestureOwnership, type CalendarGestureTicket } from "./calendarGestureOwnership";

type Options = {
  enabled: () => boolean;
  canClaim?: () => boolean;
  width: () => number;
  handedness?: () => "right" | "left";
  /** A detail keeps the contact in its original lane and cannot navigate its parent. */
  detail?: boolean;
  onClose: () => void;
  onCollapse?: () => void;
  onOpenMonth?: () => void;
};

/** Calendar's existing responder: same quarter-width lane, activation and release rules. */
export function createCalendarCloseResponder(options: Options) {
  let touch: { identifier: number | string; timestamp: number; pageX: number; pageY: number;
    ticket: CalendarGestureTicket | null; granted: boolean } | null = null;
  const inLane = (x: number) => options.handedness?.() === "left"
    ? x <= options.width() * 0.25 : x >= options.width() * 0.75;
  const matches = (event: GestureResponderEvent) => !!touch && event?.nativeEvent.identifier === touch.identifier
    && event.nativeEvent.timestamp >= touch.timestamp;
  const usable = (event: GestureResponderEvent) => matches(event)
    && (options.detail || calendarGestureOwnership.canUseParentTouch(touch!.ticket, event.nativeEvent));
  return PanResponder.create({
    onStartShouldSetPanResponderCapture: event => {
      const e = event.nativeEvent;
      const ticket = options.detail ? null : calendarGestureOwnership.beginParentTouch(e);
      touch = options.enabled() && e.touches.length === 1 && (options.detail || ticket)
        ? { identifier: e.identifier, timestamp: e.timestamp, pageX: e.pageX, pageY: e.pageY, ticket, granted: false } : null;
      return false;
    },
    // Keep Calendar's bubbling negotiation, after native children have seen the move.
    // PanResponder itself updates dy in its capture handler; do not claim there as well.
    onMoveShouldSetPanResponder: (event, g) => {
      if (!options.enabled() || options.canClaim?.() === false || !usable(event) || options.detail && !inLane(touch!.pageX)) return false;
      if (Math.abs(g.dy) <= 12 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
      return inLane(event.nativeEvent.pageX);
    },
    onPanResponderGrant: event => { if (touch) touch.granted = options.enabled() && !!usable(event); },
    onPanResponderRelease: (event, g) => {
      if (!usable(event)) return;
      const origin = touch!; touch = null;
      if (!origin.granted || !options.enabled() || !options.detail && !calendarGestureOwnership.consumeParentTouch(origin.ticket, event.nativeEvent)) return;
      if (options.detail) event.stopPropagation();
      // RN resets dy on grant. Calendar already measures from the initial touch-down.
      const dy = origin.pageY == null ? g.dy : event.nativeEvent.pageY - origin.pageY;
      if (dy > 140) options.onClose();
      else if (dy > 50) options.onCollapse?.();
      else if (dy < -50) options.onOpenMonth?.();
    },
    onPanResponderTerminate: event => { if (matches(event)) touch = null; },
    onPanResponderReject: event => { if (matches(event)) touch = null; },
    onPanResponderTerminationRequest: () => !options.detail,
  });
}
