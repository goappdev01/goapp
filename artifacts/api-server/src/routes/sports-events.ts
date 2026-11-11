import { Router, type IRouter } from "express";
import { sportsEventRecordSchema } from "@workspace/api-zod";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
router.use(requireAdmin, requireAdminPermission("admin.access"));
router.use((req, res, next) => {
  if (req.header("x-go-context") !== "ADMIN") { res.status(403).json({ code: "SPORTS_ADMIN_CONTEXT_REQUIRED", error: "Eventos Deportivos solo está habilitado en ADMIN." }); return; }
  next();
});

function unavailable(detail: { code?: string; message?: string; details?: string } | null): boolean {
  return ["PGRST202", "PGRST205", "42883", "42P01", "42703"].includes(String(detail?.code))
    && /go_sports_record|go_sports_event|sports_events/i.test(`${detail?.message ?? ""} ${detail?.details ?? ""}`);
}
async function send(response: Response, res: import("express").Response, successStatus = 200) {
  if (!response.ok) {
    const detail = await response.json().catch(() => null) as { code?: string; message?: string; details?: string } | null;
    if (unavailable(detail)) { res.status(503).json({ code: "SPORTS_EVENTS_NOT_READY", error: "El almacenamiento privado de Eventos Deportivos aún no está activado. No se guardó ningún cambio." }); return; }
    const code = String(detail?.code ?? "");
    const status = response.status === 401 || response.status === 403 ? response.status
      : response.status === 409 || ["40001", "23505", "PT409"].includes(code) ? 409
        : code === "42501" ? 403 : ["22023", "22003", "22P02"].includes(code) ? 400 : response.status >= 500 ? 503 : response.status;
    res.status(status).json({ code: status === 409 ? "SPORTS_RECORD_CONFLICT" : "SPORTS_RECORD_FAILED",
      error: status === 409 ? "El registro cambió o esa localidad ya está registrada. Actualiza e inténtalo de nuevo." : "No se pudo guardar o consultar Eventos Deportivos." });
    return;
  }
  res.status(successStatus).json(await response.json());
}
function headers(req: import("express").Request) { return { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" }; }
router.get("/records", async (req, res) => {
  const offset = Number(req.query.offset ?? 0), limit = Number(req.query.limit ?? 40);
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 100) { res.status(400).json({ error: "Paginación inválida." }); return; }
  const query = new URLSearchParams({ select: "id,record_type,version,document,updated_at", owner_user_id: `eq.${res.locals.adminUserId}`,
    deleted: "eq.false", order: "updated_at.desc,id.asc", limit: String(limit), offset: String(offset) });
  for (const key of ["recordType", "sport", "status"] as const) {
    const value = req.query[key]; if (typeof value === "string" && /^[a-z_]{1,32}$/.test(value)) query.set(key === "recordType" ? "record_type" : `document->>${key}`, `eq.${value}`);
  }
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 80).replace(/[*%,()]/g, "") : "";
  if (search) query.set("or", `(document->event->>title.ilike.*${search}*,document->event->>city.ilike.*${search}*,document->>title.ilike.*${search}*)`);
  await send(await supabaseRequest(`/rest/v1/go_sports_event_records?${query}`, { headers: headers(req) }), res);
});
router.get("/records/:id", async (req, res) => {
  if (!uuid.test(String(req.params.id))) { res.status(400).json({ error: "Registro inválido." }); return; }
  const query = new URLSearchParams({ select: "document", id: `eq.${req.params.id}`, owner_user_id: `eq.${res.locals.adminUserId}`, deleted: "eq.false", limit: "1" });
  const response = await supabaseRequest(`/rest/v1/go_sports_event_records?${query}`, { headers: headers(req) });
  if (!response.ok) { await send(response, res); return; }
  const rows = await response.json() as { document?: unknown }[];
  if (!rows.length) { res.status(404).json({ error: "Registro no disponible." }); return; }
  res.json(rows[0].document);
});
router.post("/records", async (req, res) => {
  const parsed = sportsEventRecordSchema.safeParse(req.body?.record);
  if (!parsed.success || parsed.data.ownerUserId !== res.locals.adminUserId || req.body?.expectedVersion !== 0) { res.status(400).json({ code: "SPORTS_RECORD_INVALID", error: "Revisa los datos del registro." }); return; }
  const response = await supabaseRequest("/rest/v1/rpc/go_sports_record_save", { method: "POST", headers: headers(req),
    body: JSON.stringify({ p_record: parsed.data, p_expected_version: 0 }) });
  await send(response, res, 201);
});
router.put("/records/:id", async (req, res) => {
  const parsed = sportsEventRecordSchema.safeParse(req.body?.record), expected = req.body?.expectedVersion;
  if (!uuid.test(String(req.params.id)) || !parsed.success || parsed.data.id !== req.params.id || parsed.data.ownerUserId !== res.locals.adminUserId
    || !Number.isInteger(expected) || expected < 1) { res.status(400).json({ code: "SPORTS_RECORD_INVALID", error: "Revisa el registro o su versión." }); return; }
  await send(await supabaseRequest("/rest/v1/rpc/go_sports_record_save", { method: "POST", headers: headers(req),
    body: JSON.stringify({ p_record: parsed.data, p_expected_version: expected }) }), res);
});
router.delete("/records/:id", async (req, res) => {
  const expected = Number(req.query.version);
  if (!uuid.test(String(req.params.id)) || !Number.isInteger(expected) || expected < 1) { res.status(400).json({ error: "Registro o versión inválidos." }); return; }
  const response = await supabaseRequest("/rest/v1/rpc/go_sports_record_withdraw", { method: "POST", headers: headers(req),
    body: JSON.stringify({ p_id: req.params.id, p_expected_version: expected }) });
  await send(response, res);
});
export default router;
