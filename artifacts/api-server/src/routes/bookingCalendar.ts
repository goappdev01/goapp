import { Router, type IRouter, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
function date(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && value >= "1000-01-01" && value <= "9998-12-31"
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
const selection = (value: unknown): value is string[] => Array.isArray(value) && value.length >= 1 && value.length <= 100 && value.every(id) && new Set(value).size === value.length;
const revisions = (value: unknown, staff: string[]) => !!value && typeof value === "object" && !Array.isArray(value)
  && Object.keys(value).length === staff.length && staff.every(key => Number.isSafeInteger((value as Record<string, unknown>)[key]) && Number((value as Record<string, unknown>)[key]) >= 0 && Number((value as Record<string, unknown>)[key]) <= 2147483647);
const messages: Record<string, string> = {
  BOOKING_CALENDAR_CHANGED: "La excepción ha cambiado. Vuelve a cargarla antes de guardar.",
  BOOKING_CALENDAR_OVERLAP: "Hay intervalos duplicados o superpuestos. Revísalos antes de guardar.",
  BOOKING_CALENDAR_INVALID_INTERVALS: "Indica intervalos de minutos válidos dentro de la fecha seleccionada.",
  BOOKING_CALENDAR_NONEXISTENT_TIME: "Esa hora no existe por el cambio horario. Elige otra hora.",
  BOOKING_CALENDAR_AMBIGUOUS_TIME: "Esa hora se repite por el cambio horario. Elige un límite fuera de la hora repetida.",
  BOOKING_STAFF_UNAVAILABLE: "Selecciona un profesional activo de esta empresa.",
  BOOKING_FORBIDDEN: "No tienes permiso para modificar esta disponibilidad.",
};
async function rpc(req: Request, res: Response, name: string, args: Record<string, unknown>) {
  res.setHeader("Cache-Control", "no-store");
  const headers = bearerHeader(req.header("authorization"));
  if (!/^Bearer \S+$/.test(headers.Authorization ?? "")) { res.status(401).json({ error: "Inicia sesión." }); return; }
  try {
    const upstream = await supabaseRequest(`/rest/v1/rpc/${name}`, { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(args) });
    const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    if (upstream.ok) {
      const day = body?.day && typeof body.day === "object" ? body.day as Record<string, unknown> : null;
      const expectedStaff = args.p_staff_ids as string[] | undefined;
      const matchingDays = !expectedStaff || Array.isArray(body?.days) && body.days.length === expectedStaff.length
        && Array.isArray(body.staffIds) && body.staffIds.length === expectedStaff.length
        && expectedStaff.every(staff => (body.staffIds as unknown[]).includes(staff) && (body.days as Record<string, unknown>[]).some(d => d.staffId === staff && d.dateISO === args.p_date_iso && Array.isArray(d.openIntervals) && Array.isArray(d.closedIntervals)));
      if (matchingDays && body && Array.isArray(body.exceptions) && typeof body.timezone === "string" && day && day.dateISO === args.p_date_iso
        && (expectedStaff ? expectedStaff.includes(String(day.staffId)) : day.staffId === args.p_staff_id) && Array.isArray(day.openIntervals) && Array.isArray(day.closedIntervals)) { res.json(body); return; }
      res.status(502).json({ code: "BOOKING_CALENDAR_INVALID_RESPONSE", error: "No se pudo comprobar el resultado. Recarga antes de reintentar." }); return;
    }
    const code = typeof body?.code === "string" ? body.code : "";
    if (["PGRST202", "42883", "42703", "42P01"].includes(code)) {
      res.status(501).json({ code: "BOOKING_CALENDAR_UNAVAILABLE", error: "Las excepciones por fecha requieren activar el servidor revisado. No se ha guardado ni cambiado ningún horario." }); return;
    }
    const status = code === "42501" ? 403 : ["23505", "23P01", "40001", "40P01"].includes(code) ? 409
      : /^PT(400|403|404|409|422)$/.test(code) ? Number(code.slice(2)) : /^22/.test(code) ? 400 : upstream.status >= 500 ? 503 : upstream.status;
    const reason = typeof body?.message === "string" && /^BOOKING_[A-Z_]+$/.test(body.message) ? body.message : "BOOKING_CALENDAR_FAILED";
    res.status(status).json({ code: reason, error: messages[reason] ?? "No se pudo guardar o consultar la excepción. Recarga antes de reintentar." });
  } catch {
    res.status(503).json({ code: "BOOKING_CALENDAR_UNAVAILABLE", error: "No se pudo comprobar el resultado. Recarga o reintenta sin cambiar los datos; GO conserva la referencia de la operación." });
  }
}

router.get("/booking-calendar-business", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const source = req.query.source_id, headers = bearerHeader(req.header("authorization"));
  if (!/^Bearer \S+$/.test(headers.Authorization ?? "")) { res.status(401).json({ error: "Inicia sesión." }); return; }
  if (typeof source !== "string" || !source || source.length > 256) { res.status(400).json({ error: "Empresa no válida." }); return; }
  try {
    const upstream = await supabaseRequest("/rest/v1/rpc/go_booking_calendar_business", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ p_source_id: source }) });
    const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    if (upstream.ok && body && id(body.businessId) && body.sourceId === source && typeof body.timezone === "string" && typeof body.name === "string") { res.json(body); return; }
    const code = String(body?.code ?? "");
    if (["PGRST202", "42883", "42P01"].includes(code)) { res.status(501).json({ error: "El servidor todavía no permite consultar la empresa sincronizada." }); return; }
    res.status(upstream.ok ? 502 : code === "42501" ? 403 : code === "PT404" ? 404 : 503).json({ code: code === "PT404" ? "BOOKING_CALENDAR_BUSINESS_NOT_LINKED" : "BOOKING_CALENDAR_UNAVAILABLE", error: code === "PT404" ? "Este negocio local todavía no está vinculado a su registro del servidor. No se ha guardado ningún cambio." : "No se pudo comprobar la empresa de esta cuenta." });
  } catch { res.status(503).json({ error: "No se pudo comprobar la empresa. Reintenta cuando haya conexión." }); }
});

router.put("/booking-calendar-timezone", async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const b = req.body, headers = bearerHeader(req.header("authorization"));
  if (!/^Bearer \S+$/.test(headers.Authorization ?? "")) { res.status(401).json({ error: "Inicia sesión." }); return; }
  if (!b || typeof b !== "object" || Array.isArray(b) || Object.keys(b).some(k => !["business_id", "timezone", "expectedTimezone"].includes(k))
    || !id(b.business_id) || typeof b.timezone !== "string" || b.timezone.length > 120 || typeof b.expectedTimezone !== "string") { res.status(400).json({ error: "Selecciona una zona horaria válida." }); return; }
  try { new Intl.DateTimeFormat("en", { timeZone: b.timezone }); } catch { res.status(400).json({ error: "Selecciona una zona horaria válida." }); return; }
  try {
    const upstream = await supabaseRequest("/rest/v1/rpc/go_set_booking_calendar_timezone", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify({ p_business_id: b.business_id, p_timezone: b.timezone, p_expected_timezone: b.expectedTimezone }) });
    const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    if (upstream.ok && body && body.businessId === b.business_id && body.timezone === b.timezone) { res.json(body); return; }
    const code = String(body?.code ?? ""), reason = String(body?.message ?? "");
    if (["PGRST202", "42883", "42P01"].includes(code)) { res.status(501).json({ error: "El servidor todavía no permite guardar la zona horaria. No se ha cambiado." }); return; }
    res.status(upstream.ok ? 502 : code === "42501" ? 403 : code === "PT409" ? 409 : code === "PT422" ? 422 : 503).json({ code: reason,
      error: reason === "BOOKING_TIMEZONE_HAS_COMMITMENTS" ? "La empresa tiene reservas o excepciones guardadas. Su zona horaria se conserva para no cambiar las fechas ni las horas comprometidas."
        : reason === "BOOKING_CALENDAR_CHANGED" ? "La configuración ha cambiado. Vuelve a cargarla antes de guardar." : "No se pudo guardar la zona horaria. Se conserva la anterior." });
  } catch { res.status(503).json({ error: "No se pudo guardar la zona horaria. Se conserva la anterior." }); }
});

router.get("/booking-calendar-exceptions", async (req, res) => {
  const q = req.query;
  const staff = typeof q.staff_ids === "string" ? q.staff_ids.split(",") : undefined;
  if (q.staff_ids !== undefined) {
    if (q.staff_id !== undefined || !selection(staff) || !id(q.business_id) || !date(q.dateISO) || q.from_date != null && !date(q.from_date)) {
      res.status(400).json({ code: "BOOKING_INVALID_RANGE", error: "Selecciona profesionales válidos de la empresa." }); return;
    }
    await rpc(req, res, "go_booking_calendar_exceptions_batch", { p_business_id: q.business_id, p_date_iso: q.dateISO, p_staff_ids: staff, p_from_date: q.from_date ?? null }); return;
  }
  if (!id(q.business_id) || !date(q.dateISO) || q.staff_id != null && !id(q.staff_id) || q.from_date != null && !date(q.from_date)) {
    res.status(400).json({ code: "BOOKING_INVALID_RANGE", error: "Selecciona una empresa, fecha y profesional válidos." }); return;
  }
  await rpc(req, res, "go_booking_calendar_exceptions", { p_business_id: q.business_id, p_date_iso: q.dateISO, p_staff_id: q.staff_id ?? null, p_from_date: q.from_date ?? null });
});
function validCommand(body: unknown, deleting: boolean): body is Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const b = body as Record<string, unknown>;
  const batch = b.staff_ids !== undefined;
  if (Object.keys(b).some(k => !["business_id", "staff_id", "staff_ids", "dateISO", "intervals", "expectedRevision", "expectedRevisions", "requestId"].includes(k))
    || !id(b.business_id) || b.staff_id != null && !id(b.staff_id) || !date(b.dateISO)
    || (batch ? b.staff_id !== undefined || b.expectedRevision !== undefined || !selection(b.staff_ids) || !revisions(b.expectedRevisions, b.staff_ids)
      : b.expectedRevisions !== undefined || !Number.isSafeInteger(b.expectedRevision) || Number(b.expectedRevision) < 0)
    || typeof b.requestId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(b.requestId)) return false;
  if (deleting) return b.intervals === undefined;
  if (!Array.isArray(b.intervals) || !b.intervals.length || b.intervals.length > 32) return false;
  const ranges: { start: number; end: number }[] = [];
  for (const raw of b.intervals) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const i = raw as Record<string, unknown>;
    if (Object.keys(i).some(k => !["kind", "startMinute", "endMinute"].includes(k)) || !["open", "closed"].includes(String(i.kind))
      || !Number.isInteger(i.startMinute) || !Number.isInteger(i.endMinute) || Number(i.startMinute) < 0 || Number(i.endMinute) > 1440
      || Number(i.endMinute) <= Number(i.startMinute)) return false;
    ranges.push({ start: Number(i.startMinute), end: Number(i.endMinute) });
  }
  ranges.sort((a, b) => a.start - b.start);
  return ranges.every((range, index) => index === 0 || range.start >= ranges[index - 1].end);
}
for (const method of ["put", "delete"] as const) router[method]("/booking-calendar-exceptions", async (req, res) => {
  if (!validCommand(req.body, method === "delete")) { res.status(400).json({ code: "BOOKING_CALENDAR_INVALID_INTERVALS", error: "Revisa la fecha y los intervalos; no deben superponerse." }); return; }
  const b = req.body;
  if (selection(b.staff_ids)) {
    await rpc(req, res, "go_save_booking_calendar_exceptions_batch", { p_business_id: b.business_id, p_date_iso: b.dateISO, p_staff_ids: b.staff_ids,
      p_intervals: b.intervals ?? [], p_expected_revisions: b.expectedRevisions, p_request_key: b.requestId, p_delete: method === "delete" }); return;
  }
  await rpc(req, res, "go_save_booking_calendar_exception", { p_business_id: b.business_id, p_date_iso: b.dateISO, p_staff_id: b.staff_id ?? null,
    p_intervals: b.intervals ?? [], p_expected_revision: b.expectedRevision, p_request_key: b.requestId, p_delete: method === "delete" });
});
export default router;
