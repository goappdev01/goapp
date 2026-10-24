import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operations = new Set(["propose", "counter", "accept", "reject", "cancel", "confirm"]);
const fields = new Set(["operation", "requestId", "expectedRevision", "proposalId", "dateISO", "date", "time", "startsAt", "acceptFinancialTerms"]);
type RpcError = { code?: string; message?: string };
const messages: Record<string, string> = {
  BOOKING_CONFLICT: "El horario ya no está disponible. La reserva original se conserva.",
  BOOKING_REVISION_CONFLICT: "La reserva ha cambiado. Actualiza antes de decidir.",
  BOOKING_PROPOSAL_CHANGED: "La propuesta ha cambiado. Actualiza antes de decidir.",
  BOOKING_REQUEST_REUSED: "Este identificador ya corresponde a otra operación.",
  BOOKING_NOT_ACTIVE: "La reserva ya no admite esta operación.",
  BOOKING_ORIGINAL_CHANGED: "El horario original ha cambiado. Actualiza la reserva.",
  BOOKING_OTHER_PARTICIPANT_REQUIRED: "La decisión corresponde al otro participante.",
  BOOKING_FINANCIAL_ACCEPTANCE_REQUIRED: "Confirma expresamente las condiciones existentes. No se realizan cobros ni devoluciones.",
  BOOKING_OUTSIDE_AVAILABILITY: "El intervalo completo queda fuera de la disponibilidad.",
  BOOKING_BUSINESS_UNAVAILABLE: "El establecimiento no está disponible para este cambio.",
  BOOKING_STAFF_UNAVAILABLE: "El profesional no está disponible para los servicios de esta reserva.",
  BOOKING_SERVICE_UNAVAILABLE: "Un servicio de la reserva no está disponible.",
  BOOKING_INVALID_INTERVAL: "Selecciona un horario futuro con la duración original.",
  BOOKING_NONEXISTENT_LOCAL_TIME: "Esa hora no existe por el cambio de horario. Selecciona otra.",
  BOOKING_AMBIGUOUS_LOCAL_TIME: "Esa hora se repite por el cambio de horario. Selecciona una hora inequívoca.",
};

async function relay(response: globalThis.Response, res: Response, communication = false) {
  const body = await response.text();
  if (response.ok) { res.status(response.status).type("application/json").send(body); return; }
  let issue: RpcError = {};
  try { issue = JSON.parse(body) as RpcError; } catch { /* Do not expose proxy or SQL diagnostics. */ }
  if (["PGRST202", "42883"].includes(issue.code ?? "")) {
    if(communication){res.status(501).json({code:"GO_MESSAGES_UNAVAILABLE",error:"Comunicación GO aún no está disponible en este servidor. El texto se conserva."});return;}
    res.status(501).json({ code: "BOOKING_NEGOTIATION_UNAVAILABLE", error: "La negociación requiere la migración revisada del servidor. La reserva y sus pagos permanecen intactos." }); return;
  }
  const status = issue.code === "23P01" || issue.code === "23505" || issue.code === "40P01" || issue.code === "40001" ? 409
    : /^PT(400|403|404|409|422)$/.test(issue.code ?? "") ? Number(issue.code!.slice(2))
    : issue.code === "42501" ? 403 : issue.code === "22023" ? 400 : response.status >= 500 ? 503 : response.status;
  const code = issue.code === "23P01" ? "BOOKING_CONFLICT" : messages[issue.message ?? ""] ? issue.message! : status === 404 ? "BOOKING_NOT_FOUND" : "BOOKING_OPERATION_FAILED";
  res.status(status).json({ code, error: messages[code] ?? (status === 404 ? "Reserva no disponible." : "No se pudo completar la operación. Actualiza la reserva antes de volver a intentarlo.") });
}

router.post("/bookings/:bookingId/change", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const auth = bearerHeader(req.header("authorization"));
  if (!auth.Authorization) { res.status(401).json({ error: "Authentication required" }); return; }
  const id = req.params.bookingId;
  const input = req.body;
  if (typeof id !== "string" || !uuid.test(id) || !input || typeof input !== "object" || Array.isArray(input)
    || Object.keys(input).some(key => !fields.has(key)) || !operations.has(input.operation)
    || input.requestId != null && (typeof input.requestId !== "string" || !uuid.test(input.requestId))
    || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0
    || input.proposalId != null && (typeof input.proposalId !== "string" || !uuid.test(input.proposalId))
    || input.acceptFinancialTerms != null && typeof input.acceptFinancialTerms !== "boolean"
    || input.date != null && (typeof input.date !== "string" || input.date.length > 32)) {
    res.status(400).json({ code: "BOOKING_INVALID_COMMAND", error: "Invalid booking decision or revision" }); return;
  }
  const proposing = input.operation === "propose" || input.operation === "counter";
  if (proposing && (typeof input.dateISO !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.dateISO)
    || typeof input.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time))
    || input.startsAt != null && (typeof input.startsAt !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(input.startsAt) || !Number.isFinite(Date.parse(input.startsAt)))) {
    res.status(400).json({ code: "BOOKING_INVALID_LOCAL_TIME", error: "Invalid booking date or time" }); return;
  }
  // A deterministic retry key survives Reload without another client store.
  // It is NOT an authentication credential. The journal is also scoped by auth.uid().
  const digest = createHash("sha256").update(JSON.stringify([id, input.operation, input.expectedRevision,
    input.proposalId ?? null, proposing ? input.dateISO : null, proposing ? input.time : null,
    proposing ? input.startsAt ?? null : null, input.acceptFinancialTerms === true])).digest("hex");
  const requestId = input.requestId ?? digest.slice(0,8)+"-"+digest.slice(8,12)+"-5"+digest.slice(13,16)+"-8"+digest.slice(17,20)+"-"+digest.slice(20,32);
  // Caller JWT is passed through unchanged. The database is the authority for
  // identity, ownership, revision, timing, conflict checks and the transaction.
  try {
    const response = await supabaseRequest("/rest/v1/rpc/go_negotiate_booking", {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ p_booking_id: id, p_operation: input.operation, p_request_id: requestId,
        p_expected_revision: input.expectedRevision, p_proposal_id: input.proposalId ?? null,
        p_date_iso: proposing ? input.dateISO : null, p_time: proposing ? input.time : null,
        p_starts_at: proposing ? input.startsAt ?? null : null, p_financial_consent: input.acceptFinancialTerms === true }),
    });
    await relay(response, res);
  } catch { res.status(503).json({ code: "BOOKING_OPERATION_UNAVAILABLE", error: "No se pudo comprobar el resultado. Actualiza o reintenta con el mismo identificador." }); }
});

// Opt-in receipt projection of the SAME bookings, preserving the legacy GET
// contract. Includes active negotiations and safe labels even after unpublish.
router.get("/bookings", async (req: Request, res: Response, next) => {
  if (req.query.negotiation !== "1") { next(); return; }
  res.setHeader("Cache-Control", "no-store");
  const auth = bearerHeader(req.header("authorization"));
  if (!auth.Authorization) { res.status(401).json({ error: "Authentication required" }); return; }
  const businessId = req.query.business_id;
  if (businessId != null && (typeof businessId !== "string" || !uuid.test(businessId))) { res.status(400).json({ error: "Invalid business" }); return; }
  try {
    await relay(await supabaseRequest("/rest/v1/rpc/go_booking_receipts", {
      method: "POST", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ p_business_id: businessId ?? null }),
    }), res);
  } catch { res.status(503).json({ code: "BOOKING_READ_UNAVAILABLE", error: "No se pudieron leer las reservas. No se ha modificado ninguna." }); }
});

// The same participant authorization as reservation receipts. The authenticated
// identity and recipient are resolved in PostgreSQL, never supplied by the UI.
router.get("/booking-conversations", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const auth = bearerHeader(req.header("authorization")), id = req.query.booking_id;
  if (!auth.Authorization) { res.status(401).json({error:"Authentication required"}); return; }
  if (id != null && (typeof id !== "string" || !uuid.test(id))) { res.status(400).json({error:"Esta reserva local no tiene una conversación compartida en el servidor."}); return; }
  try { await relay(await supabaseRequest("/rest/v1/rpc/go_booking_conversations", {method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({p_booking_id:id??null})}),res,true); }
  catch { res.status(503).json({error:"No se pudo conectar con Comunicación GO. El texto escrito se conserva."}); }
});
router.post("/bookings/:bookingId/messages", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const auth = bearerHeader(req.header("authorization")), id = req.params.bookingId, input = req.body;
  if (!auth.Authorization) { res.status(401).json({error:"Authentication required"}); return; }
  if (typeof id!=="string" || !uuid.test(id) || !input || typeof input!=="object" || Array.isArray(input)
    || Object.keys(input).some(key=>!["messageId","text"].includes(key)) || typeof input.messageId!=="string" || !uuid.test(input.messageId)
    || typeof input.text!=="string" || !input.text.trim() || input.text.length>1000) { res.status(400).json({error:"Mensaje o reserva no válidos."}); return; }
  try { await relay(await supabaseRequest("/rest/v1/rpc/go_send_booking_message", {method:"POST",headers:{...auth,"Content-Type":"application/json"},body:JSON.stringify({p_booking_id:id,p_message_id:input.messageId,p_text:input.text})}),res,true); }
  catch { res.status(503).json({error:"No se pudo confirmar el envío. Tu texto se conserva; reintenta para comprobarlo sin duplicar el mensaje."}); }
});

export default router;
