import type { BusinessConfig, DaySchedule } from "@/contexts/GoBusinessConfigContext";
import type { AvailabilityWindow } from "./booking";
import type { CalendarException } from "./calendarExceptions";

export const BUSINESS_WORK_HOURS_PREFERENCE = "go_business_calendar_work_hours";
export const businessWorkHoursKey = (userId: string, businessId: string) =>
  BUSINESS_WORK_HOURS_PREFERENCE + ":" + JSON.stringify([userId, businessId]);

export type WorkRange = { start: number; end: number };
export type WorkSlot = WorkRange & { shift?: WorkRange; previousEnd?: number };
type Professional = { id: string; name: string };
type Schedule = Pick<BusinessConfig, "activeDays" | "daySchedules" | "openFrom" | "openTo" | "completedSteps" | "staffSchedules">;

const DAY = 1440;
export function workMinute(value: string | undefined): number | undefined {
  if (!value || !/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(value)) return undefined;
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

export function businessCalendarClock(timezone?: string, now = new Date()) {
  if (!timezone) return undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).formatToParts(now);
    const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
    return { dateISO: [part("year"), part("month"), part("day")].join("-"),
      minute: Number(part("hour")) * 60 + Number(part("minute")) };
  } catch { return undefined; }
}

function merge(ranges: readonly WorkRange[]): WorkRange[] {
  const sorted = ranges.filter(range => range.start >= 0 && range.end <= DAY && range.start < range.end)
    .map(({ start, end }) => ({ start, end })).sort((a, b) => a.start - b.start);
  const result: WorkRange[] = [];
  for (const range of sorted) {
    const last = result[result.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else result.push(range);
  }
  return result;
}

function subtract(ranges: WorkRange[], gaps: WorkRange[]): WorkRange[] {
  return gaps.reduce((open, gap) => open.flatMap(range => {
    if (range.end <= gap.start || range.start >= gap.end) return [range];
    return [{ start: range.start, end: Math.min(range.end, gap.start) },
      { start: Math.max(range.start, gap.end), end: range.end }].filter(piece => piece.start < piece.end);
  }), ranges);
}

function localShifts(schedule: DaySchedule | { from: string; to: string } | undefined): WorkRange[] {
  if (!schedule) return [];
  const shifts = "shift1" in schedule ? [schedule.shift1, schedule.shift2] : [{ ...schedule, active: true }];
  return shifts.flatMap(shift => {
    if (!shift?.active) return [];
    const start = workMinute(shift.from), end = shift.to === "24:00" ? DAY : workMinute(shift.to);
    return start === undefined || end === undefined || start === end ? [] : [{ start, end: end < start ? end + DAY : end }];
  });
}

function onDay(get: (weekday: number) => WorkRange[], weekday: number) {
  return merge([
    ...get(weekday).map(range => ({ ...range, end: Math.min(DAY, range.end) })),
    ...get((weekday + 6) % 7).filter(range => range.end > DAY).map(range => ({ start: 0, end: range.end - DAY })),
  ]);
}

function weeklyWindows(windows: readonly AvailabilityWindow[], staffId: string | undefined) {
  return windows.filter(w => w.active && (w.staffId || undefined) === staffId).flatMap(w => {
    const start = w.visibleStartHour * 60 + (w.visibleStartMinute ?? 0);
    const end = w.visibleEndHour * 60 + (w.visibleEndMinute ?? 0) + (w.endNextDay ? DAY : 0);
    return Number.isInteger(start) && Number.isInteger(end) && start >= 0 && start < DAY && end > start && end <= DAY * 2
      ? [{ weekday: (w.weekday + 6) % 7, start, end }] : [];
  });
}

/** Display-only projection of the existing weekly configuration and dated adjustments. */
export function businessWorkHoursForDate(
  config: Schedule, dateISO: string, professional?: Professional,
  exceptions: readonly Pick<CalendarException, "dateISO" | "staffId" | "intervals">[] = [],
  windows: readonly AvailabilityWindow[] = [], activeStaffIds: ReadonlySet<string> = new Set(),
): WorkRange[] | undefined {
  const weekday = (new Date(dateISO + "T12:00:00Z").getUTCDay() + 6) % 7;
  if (!Number.isFinite(weekday)) return undefined;

  const saved = config.daySchedules ?? {};
  const legacy = { from: config.openFrom, to: config.openTo };
  const hasSavedShift = Object.values(saved).some(day => localShifts(day).length > 0);
  const legacyWasSet = config.completedSteps?.includes(2) || config.openFrom !== "09:00" || config.openTo !== "20:00";
  const useLocal = hasSavedShift || (legacyWasSet && localShifts(legacy).length > 0);
  const remote = weeklyWindows(windows, undefined);
  const recurring = onDay(day => {
    if (!useLocal) return remote.filter(range => range.weekday === day);
    if (!config.activeDays.includes(day)) return [];
    // The single-range legacy configuration only applies to active days without a saved turn.
    return localShifts(saved[String(day)] ?? legacy);
  }, weekday);

  const dated = exceptions.filter(row => row.dateISO === dateISO);
  const spans = (kind: "open" | "closed", applies: (staffId: string | null) => boolean) => merge(
    dated.filter(row => applies(row.staffId)).flatMap(row => row.intervals
      .filter(interval => interval.kind === kind).map(({ startMinute: start, endMinute: end }) => ({ start, end }))),
  );
  const companyOpen = spans("open", id => id === null);
  const companyClosed = spans("closed", id => id === null);
  if (!professional) {
    const staffOpen = spans("open", id => id !== null && activeStaffIds.has(id));
    if (!useLocal && !remote.length && !companyOpen.length && !staffOpen.length) return undefined;
    return subtract(merge([...recurring, ...companyOpen, ...staffOpen]), companyClosed);
  }

  const additions = spans("open", id => id === professional.id);
  if (!useLocal && !remote.length && !companyOpen.length && !additions.length) return undefined;
  const company = merge([...recurring, ...companyOpen]);
  const staffSchedules = config.staffSchedules ?? {};
  const slug = professional.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  const legacyKeys = slug ? Object.keys(staffSchedules).filter(key => key.endsWith("_staff_" + slug)) : [];
  const staff = staffSchedules[professional.id] ?? (legacyKeys.length === 1 ? staffSchedules[legacyKeys[0]] : undefined);
  const remoteStaff = weeklyWindows(windows, professional.id);
  const staffWork = staff && !staff.useCompanySchedule
    ? onDay(day => localShifts(staff.daySchedules[String(day)]), weekday)
    : !staff && remoteStaff.length ? onDay(day => remoteStaff.filter(range => range.weekday === day), weekday) : company;
  const companyEffective = subtract(merge([...company, ...additions]), companyClosed);
  const staffEffective = subtract(merge([...staffWork, ...additions]), spans("closed", id => id === professional.id));
  return merge(companyEffective.flatMap(open => staffEffective.map(work => ({
    start: Math.max(open.start, work.start), end: Math.min(open.end, work.end),
  }))));
}

export function workHourSlots(ranges: readonly WorkRange[], density: 15 | 30 | 60): WorkSlot[] {
  const slots: WorkSlot[] = [];
  ranges.forEach((range, index) => {
    for (let start = range.start; start < range.end;) {
      const end = Math.min(range.end, (Math.floor(start / density) + 1) * density);
      slots.push(start === range.start ? { start, end, shift: range, previousEnd: ranges[index - 1]?.end } : { start, end });
      start = end;
    }
  });
  return slots;
}

export function splitWorkHourEntries<T extends { time: string; endTime?: string }>(
  entries: readonly T[], ranges: readonly WorkRange[],
) {
  const inside: T[] = [], outside: T[] = [];
  for (const entry of entries) {
    const start = workMinute(entry.time), end = entry.endTime === "24:00" ? DAY : workMinute(entry.endTime);
    const fits = start !== undefined && ranges.some(range => start >= range.start && start < range.end &&
      (end === undefined || end === start || (end > start ? end : DAY) <= range.end));
    (fits ? inside : outside).push(entry);
  }
  return { inside, outside };
}
