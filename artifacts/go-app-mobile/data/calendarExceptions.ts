import { isCloudId, supabaseApiRequest } from "./booking";
import { businessWallTime } from "./bookingTimeline";

export type CalendarExceptionInterval = { kind: "open" | "closed"; startMinute: number; endMinute: number };
export type CalendarExceptionConflict = { bookingId: string; customerName: string | null; serviceName: string; staffName: string | null; startsAt: string; endsAt: string; status: string };
export type CalendarException = {
  id: string; businessId: string; staffId: string | null; dateISO: string; timezone: string; revision: number;
  intervals: CalendarExceptionInterval[]; createdBy: string; updatedBy: string; createdAt: string; updatedAt: string; conflicts: CalendarExceptionConflict[];
};
export type CalendarExceptionResult = {
  timezone: string; exceptions: CalendarException[];
  day: { dateISO: string; staffId: string | null; openIntervals: { startsAt: string; endsAt: string }[]; closedIntervals: { startsAt: string; endsAt: string }[] };
};
export type CalendarExceptionCommand = { businessId: string; staffId: string | null; dateISO: string; intervals: CalendarExceptionInterval[]; expectedRevision: number; requestId: string };

export function validateCalendarDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1000-01-01" || value > "9998-12-31" || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)
    throw new Error("Selecciona una fecha válida del calendario.");
  return value;
}
export function validateCalendarIntervals(input: readonly CalendarExceptionInterval[]): CalendarExceptionInterval[] {
  if (!input.length || input.length > 32) throw new Error("Añade entre uno y 32 intervalos.");
  const sorted = input.map(i => ({ kind: i.kind, startMinute: i.startMinute, endMinute: i.endMinute })).sort((a, b) => a.startMinute - b.startMinute);
  for (let index = 0; index < sorted.length; index++) {
    const i = sorted[index];
    if (!["open", "closed"].includes(i.kind) || !Number.isInteger(i.startMinute) || !Number.isInteger(i.endMinute) || i.startMinute < 0 || i.endMinute > 1440 || i.endMinute <= i.startMinute)
      throw new Error("La hora final debe ser posterior a la inicial, dentro de la fecha elegida.");
    if (index && i.startMinute < sorted[index - 1].endMinute) throw new Error("Los intervalos no pueden duplicarse ni superponerse.");
  }
  return sorted;
}
export const calendarMinuteLabel = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
export function calendarRangeLabel(range: { startsAt: string; endsAt: string }, zone: string, dateISO: string): string {
  const a = businessWallTime(range.startsAt, zone), z = businessWallTime(range.endsAt, zone);
  return `${a.slice(11, 16)}–${z.slice(0, 10) > dateISO && z.slice(11, 16) === "00:00" ? "24:00" : z.slice(11, 16)}`;
}
export function calendarToday(zone: string): string { return businessWallTime(new Date().toISOString(), zone).slice(0, 10); }
function cloud(businessId: string, staffId: string | null) {
  if (!isCloudId(businessId) || staffId !== null && !isCloudId(staffId)) throw new Error("Guarda y sincroniza la empresa y sus profesionales antes de configurar excepciones.");
}
async function calendarRequest(path: string, init: RequestInit, expectedUserId?: string): Promise<CalendarExceptionResult> {
  try { return await supabaseApiRequest<CalendarExceptionResult>(path, init, true, expectedUserId); }
  catch (cause) {
    const status = cause && typeof cause === "object" && "status" in cause ? cause.status : undefined;
    if (status === 404 || status === 501) throw new Error("Las excepciones por fecha necesitan la actualización del servidor. No se ha guardado ningún cambio.");
    throw cause;
  }
}
export async function getCalendarExceptions(businessId: string, dateISO: string, staffId: string | null, fromDate: string, expectedUserId?: string): Promise<CalendarExceptionResult> {
  cloud(businessId, staffId); validateCalendarDate(dateISO); validateCalendarDate(fromDate);
  const query = new URLSearchParams({ business_id: businessId, dateISO, from_date: fromDate, ...(staffId ? { staff_id: staffId } : {}) });
  return calendarRequest(`/supabase/booking-calendar-exceptions?${query}`, {}, expectedUserId);
}
export async function saveCalendarException(command: CalendarExceptionCommand, expectedUserId?: string): Promise<CalendarExceptionResult> {
  cloud(command.businessId, command.staffId); validateCalendarDate(command.dateISO);
  const intervals = validateCalendarIntervals(command.intervals);
  return calendarRequest("/supabase/booking-calendar-exceptions", { method: "PUT", body: JSON.stringify({ business_id: command.businessId, staff_id: command.staffId,
    dateISO: command.dateISO, intervals, expectedRevision: command.expectedRevision, requestId: command.requestId }) }, expectedUserId);
}
export async function deleteCalendarException(command: Omit<CalendarExceptionCommand, "intervals">, expectedUserId?: string): Promise<CalendarExceptionResult> {
  cloud(command.businessId, command.staffId); validateCalendarDate(command.dateISO);
  return calendarRequest("/supabase/booking-calendar-exceptions", { method: "DELETE", body: JSON.stringify({ business_id: command.businessId, staff_id: command.staffId,
    dateISO: command.dateISO, expectedRevision: command.expectedRevision, requestId: command.requestId }) }, expectedUserId);
}
