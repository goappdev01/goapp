import { randomUUID } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest, supabaseStorageRequest } from "../lib/supabase";

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const trialEnabled = () => process.env.GO_BUSINESS_TRIAL_ONBOARDING === "enabled";
const trialUnavailable = (res: Response) => res.status(503).json({ code: "TRIAL_SETUP_PENDING", error: "El alta empresarial está pendiente de activación." });
const fields: Record<string, string[]> = {
  businesses: ["name", "description", "address", "timezone", "booking_enabled", "ui_metadata"],
  services: ["name", "description", "duration_minutes", "price", "currency", "active", "ui_metadata"],
  staff: ["display_name", "active", "ui_metadata"],
  availability: ["staff_id", "weekday", "start_time", "end_time", "timezone", "active", "ui_metadata"],
};
function validTimezone(value: unknown) {
  if (typeof value !== "string") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
function validate(resource: string, body: unknown, creating: boolean): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  if (!Object.keys(data).length || Object.keys(data).some(k => !fields[resource].includes(k))) return null;
  for (const [key, value] of Object.entries(data)) {
    if (key === "ui_metadata" && (!value || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value).length > 16000)) return null;
    if (["name", "display_name"].includes(key) && (typeof value !== "string" || !value.trim() || value.length > 200)) return null;
    if (["description", "address"].includes(key) && value !== null && (typeof value !== "string" || value.length > 4000)) return null;
    if (["active", "booking_enabled"].includes(key) && typeof value !== "boolean") return null;
    if (key === "timezone" && !validTimezone(value)) return null;
    if (key === "duration_minutes" && (typeof value !== "number" || !Number.isInteger(value)
      || value < ((data.ui_metadata as Record<string, unknown> | undefined)?.catalogKind === "product" ? 0 : 1) || value > 1440
      || (data.ui_metadata as Record<string, unknown> | undefined)?.catalogKind === "product" && value !== 0)) return null;
    if (key === "price" && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001)) return null;
    if (key === "currency" && value !== "EUR") return null;
    if (key === "staff_id" && value !== null && (typeof value !== "string" || !uuid.test(value))) return null;
    if (key === "weekday" && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6)) return null;
    if (["start_time", "end_time"].includes(key) && (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(value))) return null;
  }
  const required: Record<string, string[]> = { businesses: ["name"], services: ["name", "duration_minutes", "price"], staff: ["display_name"], availability: ["weekday", "start_time", "end_time"] };
  if (creating && required[resource].some(k => data[k] === undefined)) return null;
  if (resource === "availability" && data.ui_metadata && "endNextDay" in (data.ui_metadata as Record<string, unknown>)
    && typeof (data.ui_metadata as Record<string, unknown>).endNextDay !== "boolean") return null;
  if (data.start_time && data.end_time) {
    const overnight = (data.ui_metadata as Record<string, unknown> | undefined)?.endNextDay === true;
    const order = String(data.end_time).localeCompare(String(data.start_time));
    if (order === 0 || order < 0 && !overnight || order > 0 && overnight) return null;
  }
  const gap=(data.ui_metadata as Record<string,unknown>|undefined)?.gapPolicy;
  if(resource==="staff" && gap!==undefined){
    if(!gap || typeof gap!=="object" || Array.isArray(gap))return null;
    const policy=gap as Record<string,unknown>;
    if(typeof policy.allowLastMinuteGaps!=="boolean" || !Number.isInteger(policy.lastMinuteMinutes)
      || Number(policy.lastMinuteMinutes)<1 || Number(policy.lastMinuteMinutes)>525600)return null;
    // Authorization identity/timestamp are stamped by the database, never trusted from a client.
    data.ui_metadata={...(data.ui_metadata as Record<string,unknown>),gapPolicy:{allowLastMinuteGaps:policy.allowLastMinuteGaps,lastMinuteMinutes:policy.lastMinuteMinutes}};
  }
  return { ...data };
}
router.use(async (req, res, next) => {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) { res.status(401).json({ error: "Inicia sesión." }); return; }
  const response = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(authorization) });
  const user = await response.json() as { id?: string };
  if (!response.ok || !user.id) { res.status(response.ok ? 502 : response.status).json({ error: "Sesión inválida." }); return; }
  res.locals.userId = user.id;
  next();
});
async function request(req: Request, path: string, method = "GET", body?: unknown) {
  return supabaseRequest(`/rest/v1/${path}`, { method, headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json", Prefer: "return=representation" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function relay(res: Response, response: Awaited<ReturnType<typeof request>>, requireRow = false) {
  const body = await response.json();
  if (!response.ok) {
    const status = [400, 401, 403, 404, 409].includes(response.status) ? response.status : 502;
    res.status(status).json({ error: "No se pudo guardar o consultar la configuración.", code: body && typeof body === "object" && "code" in body ? body.code : undefined }); return;
  }
  if (requireRow && (!Array.isArray(body) || !body.length)) { res.status(404).json({ error: "Registro no encontrado." }); return; }
  res.status(response.status).json(body);
}
async function ownsBusiness(req: Request, res: Response): Promise<boolean> {
  const id = String(req.params.businessId);
  if (!uuid.test(id)) { res.status(400).json({ error: "Identificador inválido." }); return false; }
  const query = new URLSearchParams({ id: `eq.${id}`, owner_id: `eq.${res.locals.userId}`, select: "id,timezone,verified" });
  const response = await request(req, `businesses?${query}`);
  if (!response.ok) { await relay(res, response); return false; }
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) { res.status(404).json({ error: "Negocio no encontrado." }); return false; }
  if (rows[0].verified !== true) {
    res.status(403).json({ error: "Empresa pendiente de verificación.", code: "BUSINESS_NOT_VERIFIED" }); return false;
  }
  if (trialEnabled()) {
    const trials = await request(req, `business_trial_requests?${new URLSearchParams({ business_id: `eq.${id}`, select: "trial_ends_at,status" })}`);
    if (!trials.ok) { await relay(res, trials); return false; }
    const items = await trials.json() as { trial_ends_at: string | null; status: string }[];
    if (!Array.isArray(items)) { res.status(502).json({ error: "No se pudo comprobar la prueba gratuita." }); return false; }
    if (items.length && (items[0].status !== "approved" || !items[0].trial_ends_at || Date.parse(items[0].trial_ends_at) <= Date.now())) {
      res.status(403).json({ code: "BUSINESS_TRIAL_INACTIVE", error: "La prueba gratuita ha finalizado." }); return false;
    }
  }
  res.locals.businessTimezone = rows[0].timezone;
  return true;
}
router.get("/businesses", async (req, res) => {
  const query = new URLSearchParams({ owner_id: `eq.${res.locals.userId}`, order: "created_at.desc" });
  const response = await request(req, `businesses?${query}`);
  if (!response.ok) { await relay(res, response); return; }
  const rows = await response.json() as { id: string }[];
  if (!Array.isArray(rows)) { res.status(502).json({ error: "No se pudo comprobar tu empresa." }); return; }
  if (!rows.length) { res.json([]); return; }
  const verification = await request(req, "business_verification_requests?select=business_id,legal_name,tax_id,trading_name,address,status,rejection_reason");
  if (!verification.ok) { await relay(res, verification); return; }
  const requests = await verification.json() as { business_id: string }[];
  if (!Array.isArray(requests)) { res.status(502).json({ error: "No se pudo comprobar tu empresa." }); return; }
  if (!trialEnabled()) {
    res.json(rows.map(row => ({ ...row, verification_request: requests.find(item => item.business_id === row.id) ?? null }))); return;
  }
  const trialsResponse = await request(req, "business_trial_requests?select=business_id,terms_version,accepted_at,status,trial_starts_at,trial_ends_at,review_notes");
  if (!trialsResponse.ok) { await relay(res, trialsResponse); return; }
  const trials = await trialsResponse.json() as { business_id: string }[];
  if (!Array.isArray(trials)) { res.status(502).json({ error: "No se pudo comprobar la prueba gratuita." }); return; }
  const docsResponse = await request(req, "business_trial_documents?select=id,business_id,kind,file_name,mime_type,byte_size,created_at");
  if (!docsResponse.ok) { await relay(res, docsResponse); return; }
  const docs = await docsResponse.json() as { business_id: string }[];
  if (!Array.isArray(docs)) { res.status(502).json({ error: "No se pudo comprobar la documentación." }); return; }
  res.json(rows.map(row => ({ ...row, verification_request: requests.find(item => item.business_id === row.id) ?? null,
    trial: trials.find(item => item.business_id === row.id) ?? null,
    documents: docs.filter(item => item.business_id === row.id) })));
});
router.get("/trial/capabilities", (_req, res) => res.json({ enabled: trialEnabled(), terms_version: "go-trial-v1", days: 30, messages_provider_configured: false }));
router.post("/trial/accept", async (req, res) => {
  if (!trialEnabled()) { trialUnavailable(res); return; }
  if (req.body?.terms_version !== "go-trial-v1" || Object.keys(req.body).length !== 1) {
    res.status(400).json({ error: "Debes aceptar expresamente la prueba gratuita de 30 días." }); return;
  }
  const response = await request(req, "rpc/accept_business_trial", "POST", { p_terms_version: "go-trial-v1" });
  await relay(res, response, true);
});
router.post("/trial/documents", async (req, res) => {
  if (!trialEnabled()) { trialUnavailable(res); return; }
  const { business_id, kind, name, mime_type, content_base64 } = req.body ?? {};
  if (typeof business_id !== "string" || !uuid.test(business_id)
    || !["identidad", "fiscal", "actividad", "otro"].includes(kind)
    || typeof name !== "string" || !name.trim() || name.length > 180
    || !["application/pdf", "image/jpeg", "image/png"].includes(mime_type)
    || typeof content_base64 !== "string" || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(content_base64)) {
    res.status(400).json({ error: "Documento inválido. Adjunta un PDF, JPG o PNG." }); return;
  }
  const content = Buffer.from(content_base64, "base64");
  if (content.length < 1 || content.length > 5 * 1024 * 1024
    || !(mime_type === "application/pdf" && content.subarray(0, 5).toString() === "%PDF-"
      || mime_type === "image/png" && content.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
      || mime_type === "image/jpeg" && content[0] === 255 && content[1] === 216 && content[2] === 255)) {
    res.status(400).json({ error: "El archivo no coincide con el formato o supera 5 MB." }); return;
  }
  const path = `${res.locals.userId}/${business_id}/${randomUUID()}`;
  // Los permisos de Storage verifican el dueño y el estado de la solicitud.
  let upload: Awaited<ReturnType<typeof supabaseStorageRequest>>;
  try {
    upload = await supabaseStorageRequest(`/storage/v1/object/go-business-documents/${path}`,
      req.header("authorization"), { method: "POST", contentType: mime_type,
        body: new Uint8Array(content.buffer.slice(content.byteOffset, content.byteOffset + content.byteLength)) });
  } catch { res.status(502).json({ error: "No se pudo conectar con el almacén privado." }); return; }
  if (!upload.ok) { res.status(upload.status === 403 ? 403 : 502).json({ error: "No se pudo guardar el archivo privado." }); return; }
  const response = await request(req, "rpc/register_business_document", "POST", {
    p_business_id: business_id, p_kind: kind, p_file_name: name.trim(), p_mime_type: mime_type,
    p_byte_size: content.length, p_object_path: path,
  });
  await relay(res, response, true);
});
// Enrollment is the only pending-company write path. Supabase checks ownership
// and fixes status to pending; the caller cannot supply approval or an owner ID.
router.post("/enrollment", async (req, res) => {
  if (trialEnabled() && (!req.body?.business_id || !uuid.test(req.body.business_id))) {
    res.status(400).json({ error: "Primero acepta la prueba gratuita y adjunta los documentos." }); return;
  }
  const data = req.body;
  const keys = ["business_id", "legal_name", "tax_id", "trading_name", "address"];
  if (!data || typeof data !== "object" || Array.isArray(data)
    || Object.keys(data).some(key => !keys.includes(key))
    || (data.business_id !== undefined && (typeof data.business_id !== "string" || !uuid.test(data.business_id)))
    || typeof data.legal_name !== "string" || data.legal_name.trim().length < 2 || data.legal_name.length > 200
    || typeof data.tax_id !== "string" || data.tax_id.trim().length < 3 || data.tax_id.length > 32
    || typeof data.address !== "string" || !data.address.trim() || data.address.length > 4000
    || (data.trading_name !== undefined && (typeof data.trading_name !== "string" || data.trading_name.length > 200))) {
    res.status(400).json({ error: "Completa correctamente la razón social, NIF/CIF y dirección." }); return;
  }
  try {
    // The RPC atomically stores the pending request and an unverified business.
    const response = await request(req, "rpc/submit_business_verification", "POST", {
      p_business_id: data.business_id ?? null, p_legal_name: data.legal_name.trim(),
      p_tax_id: data.tax_id.trim(), p_trading_name: data.trading_name?.trim() ?? "", p_address: data.address.trim(),
    });
    const rows = await response.json().catch(() => null);
    if (!response.ok) {
      console.warn("[business-enrollment]", { stage: "rpc", status: response.status, code: rows && typeof rows === "object" && "code" in rows ? rows.code : undefined });
      res.status([400, 401, 403, 409].includes(response.status) ? response.status : 502)
        .json({ error: "No hemos podido enviar tu solicitud en este momento. Inténtalo de nuevo más tarde." });
      return;
    }
    if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || !uuid.test(rows[0].id)
      || rows[0].owner_id !== res.locals.userId || rows[0].verified !== false
      || (data.business_id && rows[0].id !== data.business_id)) {
      console.warn("[business-enrollment]", { stage: "acknowledgement", status: response.status });
      res.status(502).json({ error: "No hemos podido confirmar tu solicitud. Inténtalo de nuevo más tarde." });
      return;
    }
    res.status(response.status).json(rows);
  } catch (cause) {
    console.warn("[business-enrollment]", { stage: "rpc-connection", name: cause instanceof Error ? cause.name : undefined });
    res.status(502).json({ error: "No hemos podido enviar tu solicitud en este momento. Inténtalo de nuevo más tarde." });
  }
});
router.post("/businesses", (_req, res) => {
  // A direct insert cannot be made idempotent or linked to the verification
  // request. Enrollment's database RPC owns both writes in one transaction.
  res.status(409).json({ error: "Solicita el alta desde la verificación de empresa.", code: "BUSINESS_ENROLLMENT_REQUIRED" });
});
router.patch("/businesses/:businessId", async (req, res) => {
  const data = validate("businesses", req.body, false);
  if (!data) { res.status(400).json({ error: "Datos de negocio inválidos." }); return; }
  if (!await ownsBusiness(req, res)) return;
  const query = new URLSearchParams({ id: `eq.${req.params.businessId}`, owner_id: `eq.${res.locals.userId}` });
  await relay(res, await request(req, `businesses?${query}`, "PATCH", data), true);
});
for (const resource of ["services", "staff", "availability"]) {
  const path = `/businesses/:businessId/${resource}`;
  router.get(path, async (req, res) => {
    if (!await ownsBusiness(req, res)) return;
    const query = new URLSearchParams({ business_id: `eq.${req.params.businessId}`, order: "id.asc" });
    await relay(res, await request(req, `${resource}?${query}`));
  });
  for (const creating of [true, false]) {
    router[creating ? "post" : "patch"](creating ? path : `${path}/:id`, async (req, res) => {
      const data = validate(resource, req.body, creating);
      if (!data || (!creating && !uuid.test(String(req.params.id)))) { res.status(400).json({ error: "Configuración inválida." }); return; }
      if (!await ownsBusiness(req, res)) return;
      if (resource === "availability" && data.staff_id) {
        const query = new URLSearchParams({ id: `eq.${data.staff_id}`, business_id: `eq.${req.params.businessId}`, select: "id" });
        const response = await request(req, `staff?${query}`);
        if (!response.ok) { await relay(res, response); return; }
        const rows = await response.json();
        if (!Array.isArray(rows) || !rows.length) { res.status(400).json({ error: "El profesional no pertenece al negocio." }); return; }
      }
      const query = new URLSearchParams({ id: `eq.${req.params.id}`, business_id: `eq.${req.params.businessId}` });
      const defaults = resource === "services" ? { currency: "EUR" } : resource === "availability" ? { timezone: res.locals.businessTimezone } : {};
      const payload = creating ? { ...defaults, ...data, business_id: req.params.businessId } : data;
      await relay(res, await request(req, creating ? resource : `${resource}?${query}`, creating ? "POST" : "PATCH", payload), true);
    });
  }
}
router.get("/configuration", async (req, res) => {
  const selected = req.query.business_id;
  if (selected !== undefined && (typeof selected !== "string" || !uuid.test(selected))) { res.status(400).json({ error: "Identificador inválido." }); return; }
  res.setHeader("Cache-Control", "no-store");
  const query = new URLSearchParams({ owner_id: `eq.${res.locals.userId}`, verified: "eq.true", select: "id", ...(selected ? { id: `eq.${selected}` } : {}) });
  const response = await request(req, `businesses?${query}`);
  if (!response.ok) { await relay(res, response); return; }
  const rows = await response.json() as { id: string }[];
  if (!Array.isArray(rows)) { res.status(502).json({ error: "No se pudo comprobar tu empresa." }); return; }
  if (!rows.length) { res.status(selected ? 404 : 200).json(selected ? { error: "Esta empresa no está disponible para esta cuenta." } : []); return; }
  if (rows.some(row => !uuid.test(row.id))) { res.status(502).json({ error: "Negocio inválido." }); return; }
  const settingsQuery = new URLSearchParams({ business_id: `in.(${rows.map(row => row.id).join(",")})`, order: "updated_at.desc", limit: "1" });
  await relay(res, await request(req, `business_settings?${settingsQuery}`));
});
router.put("/businesses/:businessId/configuration", async (req, res) => {
  if (!await ownsBusiness(req, res)) return;
  const payload = req.body?.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || JSON.stringify(payload).length > 64000) {
    res.status(400).json({ error: "Configuración inválida." }); return;
  }
  const response = await supabaseRequest("/rest/v1/business_settings?on_conflict=business_id", {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify({ business_id: req.params.businessId, payload }),
  });
  await relay(res, response, true);
});
export default router;
