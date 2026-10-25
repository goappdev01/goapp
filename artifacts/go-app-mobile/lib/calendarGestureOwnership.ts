type TouchOrigin = { identifier: string | number; timestamp: number; pageY?: number };
export type CalendarGestureTicket = Readonly<{ revision: number; origin?: TouchOrigin }>;

// A modal owns its entire touch stream, including native dismissal. A parent
// must observe a fresh touch-down afterwards; an old release can never navigate.
const details = new Set<symbol>();
const listeners = new Set<() => void>();
let revision = 0;
const detailOpen = () => details.size > 0;

export const calendarGestureOwnership = {
  detailOpen,
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  openDetail() {
    const key = Symbol("entry-detail"), wasOpen = detailOpen();
    details.add(key); revision++;
    if (!wasOpen) listeners.forEach(listener => listener());
    return () => {
      if (!details.delete(key)) return;
      revision++;
      if (!detailOpen()) listeners.forEach(listener => listener());
    };
  },
  beginParentTouch(origin?: TouchOrigin): CalendarGestureTicket | null {
    return detailOpen() ? null : { revision, origin: origin && { identifier: origin.identifier, timestamp: origin.timestamp, pageY: origin.pageY } };
  },
  canUseParentTouch(ticket: CalendarGestureTicket | null, event?: TouchOrigin) {
    return !!ticket && !detailOpen() && ticket.revision === revision && (!ticket.origin || !!event
      && event.identifier === ticket.origin.identifier && event.timestamp >= ticket.origin.timestamp);
  },
  consumeParentTouch(ticket: CalendarGestureTicket | null, event?: TouchOrigin) {
    if (!calendarGestureOwnership.canUseParentTouch(ticket, event)) return false;
    // Invalidate other recognizers that observed this same interaction.
    revision++;
    return true;
  },
};
