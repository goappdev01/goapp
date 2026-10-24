import { Router, type IRouter } from "express";
import { boardDocumentSchema } from "@workspace/api-zod";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
router.use(requireAdmin, requireAdminPermission("admin.access"));
router.use((req, res, next) => {
  if (req.header("x-go-context") !== "ADMIN") { res.status(403).json({ error: "Tableros solo está habilitado en ADMIN." }); return; }
  next();
});
async function reply(response: Response, res: import("express").Response) {
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { code?: string };
    const status = detail.code === "40001" || response.status === 409 ? 409
      : response.status === 401 || response.status === 403 ? response.status : detail.code === "22023" ? 400 : 503;
    res.status(status).json({ code: status === 409 ? "BOARD_CONFLICT" : "BOARD_UNAVAILABLE",
      error: status === 409 ? "El tablero ha cambiado. Revisa la versión guardada antes de continuar." : "No se pudo guardar o consultar Tableros. Tus cambios locales se conservan." });
    return;
  }
  res.json(await response.json());
}
router.get("/", async (req, res) => {
  const offset = Math.max(0, Number(req.query.offset) || 0), search = String(req.query.search || "").slice(0, 160);
  const query = new URLSearchParams({ select: "id,version,document->name,document->description,document->archived,document->position,document->cover",
    owner_user_id: `eq.${res.locals.adminUserId}`, order: "document->position.asc,id.asc", limit: "30", offset: String(offset) });
  query.set("deleted", "eq.false");
  if (search) query.set("document->>name", `ilike.*${search.replace(/[*%,()]/g, "")}*`);
  if (req.query.archived !== "all") query.set("document->>archived", `eq.${req.query.archived === "true"}`);
  await reply(await supabaseRequest(`/rest/v1/go_board_documents?${query}`, { headers: bearerHeader(req.header("authorization")) }), res);
});
router.get("/calendar", async (req, res) => {
  await reply(await supabaseRequest("/rest/v1/rpc/go_board_calendar", { method: "POST",
    headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ p_offset: Math.max(0, Math.trunc(Number(req.query.offset) || 0)) }) }), res);
});
router.get("/:id", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id))) { res.status(400).json({ error: "Tablero inválido." }); return; }
  const query = new URLSearchParams({ select: "document", id: `eq.${req.params.id}`, owner_user_id: `eq.${res.locals.adminUserId}`, limit: "1" });
  query.set("deleted", "eq.false");
  const response = await supabaseRequest(`/rest/v1/go_board_documents?${query}`, { headers: bearerHeader(req.header("authorization")) });
  if (!response.ok) { await reply(response, res); return; }
  const rows = await response.json() as { document: unknown }[];
  if (!rows.length) { res.status(404).json({ error: "Tablero no disponible." }); return; }
  res.json(rows[0].document);
});
router.put("/:id", async (req, res) => {
  const parsed = boardDocumentSchema.safeParse(req.body);
  if (!parsed.success || parsed.data.id !== req.params.id || parsed.data.ownerUserId !== res.locals.adminUserId) {
    res.status(400).json({ error: "Datos de tablero inválidos." }); return;
  }
  await reply(await supabaseRequest("/rest/v1/rpc/go_board_save", { method: "POST",
    headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ p_document: parsed.data, p_expected: parsed.data.version }) }), res);
});
router.post("/transfer", async (req, res) => {
  const { source, target, task, column, sourceVersion, targetVersion } = req.body || {};
  if (![source, target, column].every(v => typeof v === "string" && /^[0-9a-f-]{36}$/i.test(v))
    || typeof task !== "string" || task.length > 160 || ![sourceVersion, targetVersion].every(v => Number.isInteger(v) && v > 0)) {
    res.status(400).json({ error: "Traslado inválido." }); return;
  }
  await reply(await supabaseRequest("/rest/v1/rpc/go_board_move_task", { method: "POST",
    headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ p_source: source, p_target: target, p_task: task, p_column: column,
      p_source_version: sourceVersion, p_target_version: targetVersion }) }), res);
});
router.delete("/:id", async (req, res) => {
  if (!/^[0-9a-f-]{36}$/i.test(String(req.params.id)) || !Number.isInteger(Number(req.query.version)) || Number(req.query.version) < 1) {
    res.status(400).json({ error: "Tablero o versión inválidos." }); return;
  }
  if (req.header("x-go-confirm-delete") !== "yes") { res.status(400).json({ error: "Confirma la eliminación." }); return; }
  const response = await supabaseRequest("/rest/v1/rpc/go_board_delete", { method: "POST", headers: {
    ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: req.params.id, p_expected: Number(req.query.version) }) });
  if (!response.ok) { await reply(response, res); return; }
  res.json({ deleted: true, document: await response.json() });
});
export default router;
