/** Server-owned occupancy snapshot. These helpers format results; they never decide availability. */
export type BookingTimeline = {
  version: 1;
  staffId: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  totalClientMinutes: number;
  totalDurationMinutes: number;
  workMinutes: number;
  waitMinutes: number;
  serviceIds: string[];
  serviceDetails: { id: string; title: string; durationMinutes: number; price?: number; currency?: string }[];
  totalPrice?: number;
  currency?: string;
  resourcesConfigured: boolean;
  phases: {
    id: string; name: string; serviceId: string; kind: "work" | "wait";
    durationMinutes: number; offsetMinutes: number; staffId: string | null;
    startsAt: string; endsAt: string;
    resources: { resourceId: string; quantity: number; occupancy: "phase" | "booking" }[];
  }[];
  workIntervals: { startsAt: string; endsAt: string; staffId: string; serviceId: string }[];
  resourceIntervals: { startsAt: string; endsAt: string; resourceId: string; quantity: number }[];
};

export function businessWallTime(instant: string, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date(instant));
  const get = (key: string) => parts.find(part => part.type === key)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Keep each exact free-boundary minute and regular alternatives. No rounded booking times. */
export function compactTimelineOptions<T extends { startInstant?: string; startDatetime: string; staffId?: string }>(slots: readonly T[], visualStepMinutes = 15): T[] {
  const step = Number.isInteger(visualStepMinutes) && visualStepMinutes > 0 ? visualStepMinutes : 15;
  const ordered = [...slots].sort((a, b) => Date.parse(a.startInstant ?? a.startDatetime) - Date.parse(b.startInstant ?? b.startDatetime));
  const previous = new Map<string, number>();
  return ordered.filter(slot => {
    const instant = Date.parse(slot.startInstant ?? slot.startDatetime);
    const key = slot.staffId ?? "any";
    const before = previous.get(key);
    previous.set(key, instant);
    const minute = Number(slot.startDatetime.slice(14, 16));
    return before === undefined || instant - before > 60000 || minute % step === 0;
  });
}

/** Repeated local times at the autumn DST fold must remain distinguishable. */
export function timelineOptionLabel(slot: { startDatetime: string; startInstant?: string; timezone?: string }, siblings: readonly { startDatetime: string; startInstant?: string }[]): string {
  const time = slot.startDatetime.slice(11, 16);
  if (!slot.startInstant || !siblings.some(other => other.startDatetime === slot.startDatetime && other.startInstant !== slot.startInstant)) return time;
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: slot.timezone || "UTC", timeZoneName: "shortOffset" }).formatToParts(new Date(slot.startInstant));
  return `${time} ${parts.find(part => part.type === "timeZoneName")?.value ?? ""}`.trim();
}
