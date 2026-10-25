import {requireBookingGapPolicy} from "../lib/bookingGapPolicy";
import { Router, type IRouter, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const id = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const instant = (value: unknown): value is string => typeof value === "string" && /(Z|[+-]\d{2}:\d{2})$/.test(value)
  && Number.isFinite(Date.parse(value)) && Date.parse(value) % 60000 === 0;
const serviceIds = (value: unknown): value is string[] => Array.isArray(value) && value.length > 0 && value.length <= 32
  && value.every(id) && new Set(value).size === value.length;

async function rpc(req: Request, res: Response, name: string, args: Record<string, unknown>, created = false) {
  res.setHeader("Cache-Control", "no-store");
  const headers = bearerHeader(req.header("authorization"));
  if (!/^Bearer \S+$/.test(headers.Authorization ?? "")) { res.status(401).json({ error: "Authentication required" }); return; }
  try {
    if(created && !await requireBookingGapPolicy(req,res))return;
    const upstream = await supabaseRequest(`/rest/v1/rpc/${name}`, {
      method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(args),
    });
    const body = await upstream.json().catch(() => null) as Record<string, unknown> | null;
    if (upstream.ok && body) { res.status(created ? 201 : 200).json(created ? [body] : body); return; }
    const code = typeof body?.code === "string" ? body.code : "";
    if (["PGRST202", "42883", "42703"].includes(code)) {
      res.status(501).json({ code: "BOOKING_TIMELINE_UNAVAILABLE", error: "La agenda por fases requiere la revisión del servidor. No se ha creado ni cambiado ninguna reserva." }); return;
    }
    const status = ["23P01", "23505", "40P01", "40001"].includes(code) ? 409
      : /^PT(400|403|404|409|422)$/.test(code) ? Number(code.slice(2))
        : code === "42501" ? 403 : ["22023", "22P02", "22007", "22008"].includes(code) ? 400
          : upstream.status >= 500 ? 503 : upstream.status;
    const message = typeof body?.message === "string" && /^BOOKING_[A-Z_]+$/.test(body.message) ? body.message : "BOOKING_OPERATION_FAILED";
    res.status(status).json({ code: message, error: status === 409 ? "Ese horario o recurso ya no está disponible. Actualiza la agenda." : "No se pudo comprobar la agenda. Revisa la selección." });
  } catch {
    res.status(503).json({ code: "BOOKING_TIMELINE_UNAVAILABLE", error: "No se pudo comprobar el resultado. Reintenta con la misma referencia de reserva." });
  }
}

router.get("/booking-gap-policy",(req,res)=>rpc(req,res,"go_booking_gap_policy_version",{}));
router.get("/booking-phase-policy",(req,res)=>rpc(req,res,"go_booking_phase_policy_version",{}));

router.get("/booking-availability", async (req, res) => {
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ error: "Authentication required" }); return; }
  const query = req.query;
  const selected = typeof query.service_ids === "string" ? query.service_ids.split(",") : [];
  const days = query.days == null ? 1 : Number(query.days);
  const step = query.step_minutes == null ? 1 : Number(query.step_minutes);
  if(query.gap_policy_version!=null && String(query.gap_policy_version)!=="1"){res.status(400).json({code:"BOOKING_INVALID_GAP_POLICY"});return;}
  if(query.phase_policy_version!=null && String(query.phase_policy_version)!=="1"){res.status(400).json({code:"BOOKING_INVALID_PHASE_POLICY"});return;}
  const local = typeof query.dateISO === "string" && /^\d{4}-\d{2}-\d{2}$/.test(query.dateISO);
  if (!id(query.business_id) || !serviceIds(selected) || query.staff_id != null && !id(query.staff_id)
    || !Number.isInteger(days) || days < 1 || days > 31 || !Number.isInteger(step) || step < 1 || step > 60
    || query.datesOnly != null && !["true", "false", "1", "0"].includes(String(query.datesOnly))
    || !local && (!instant(query.from) || !instant(query.to))
    || local && (query.from != null || query.to != null)) {
    res.status(400).json({ code: "BOOKING_INVALID_RANGE", error: "Selecciona servicios y un intervalo con minutos exactos." }); return;
  }
  await rpc(req, res, "go_booking_availability", {
    p_business_id: query.business_id, p_service_ids: selected, p_staff_id: query.staff_id ?? null,
    p_from: local ? null : query.from, p_to: local ? null : query.to, p_date_iso: local ? query.dateISO : null,
    p_days: days, p_dates_only: query.datesOnly === "true" || query.datesOnly === "1", p_step_minutes: step,
  });
});

router.post("/bookings/timeline", async (req, res) => {
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ error: "Authentication required" }); return; }
  const input = req.body;
  const allowed = new Set(["business_id", "service_id", "service_ids", "staff_id", "customer_id", "starts_at", "ends_at", "request_key", "notes", "status", "expected_plan"]);
  if (!input || typeof input !== "object" || Array.isArray(input) || Object.keys(input).some(key => !allowed.has(key))
    || !id(input.business_id) || !serviceIds(input.service_ids) || !instant(input.starts_at)
    || input.staff_id != null && !id(input.staff_id) || input.customer_id != null && !id(input.customer_id)
    || input.service_id != null && input.service_id !== input.service_ids[0]
    || input.ends_at != null && !instant(input.ends_at)
    || input.expected_plan != null && (typeof input.expected_plan !== "object" || Array.isArray(input.expected_plan))
    || typeof input.request_key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(input.request_key)
    || input.notes != null && (typeof input.notes !== "string" || input.notes.length > 4000)
    || input.status != null && !["PENDING", "CONFIRMED"].includes(input.status)) {
    res.status(400).json({ code: "BOOKING_INVALID_COMMAND", error: "Revisa los servicios, fecha y referencia de reserva." }); return;
  }
  await rpc(req, res, "go_create_timeline_booking", {
    p_business_id: input.business_id, p_service_ids: input.service_ids, p_starts_at: input.starts_at,
    p_staff_id: input.staff_id ?? null, p_request_key: input.request_key, p_notes: input.notes ?? null,
    p_status: input.status ?? "CONFIRMED", p_customer_id: input.customer_id ?? null,
    p_expected_plan: input.expected_plan ?? null, p_expected_end_at: input.ends_at ?? null,
  }, true);
});

router.get("/booking-day-analysis",async(req,res)=>{
  if(!id(req.query.business_id) || typeof req.query.dateISO!=="string" || !/^\d{4}-\d{2}-\d{2}$/.test(req.query.dateISO)){
    res.status(400).json({code:"BOOKING_INVALID_RANGE"});return;
  }
  await rpc(req,res,"go_booking_day_analysis",{p_business_id:req.query.business_id,p_date_iso:req.query.dateISO});
});
router.get("/booking-professional-capacity",async(req,res)=>{
 if(!id(req.query.business_id)||!id(req.query.staff_id)||typeof req.query.dateISO!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(req.query.dateISO)){res.status(400).json({code:"BOOKING_INVALID_RANGE"});return;}
 await rpc(req,res,"go_booking_professional_capacity",{p_business_id:req.query.business_id,p_staff_id:req.query.staff_id,p_date_iso:req.query.dateISO});
});
export default router;
