import { Router, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router = Router();
const id = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const ids = (v: unknown, min = 0): v is string[] => Array.isArray(v) && v.length >= min && v.length <= 64 && v.every(id) && new Set(v).size === v.length;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
async function call(req: Request, res: Response, rpc: string, args: object, created = false) {
  res.setHeader("Cache-Control", "no-store");
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ error: "Inicia sesión." }); return; }
  try {
    const response = await supabaseRequest(`/rest/v1/rpc/${rpc}`, { method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" }, body: JSON.stringify(args) });
    const value = await response.json() as { code?: string; message?: string } | null;
    if (response.ok) { res.status(created ? 201 : 200).json(created ? [value] : value); return; }
    const missing = ["PGRST202", "42883", "42703"].includes(value?.code ?? "");
    const status = missing ? 501 : value?.code === "42501" ? 403 : ["23505", "23P01", "40001", "40P01"].includes(value?.code ?? "") ? 409
      : /^PT(400|403|404|409|422)$/.test(value?.code ?? "") ? Number(value!.code!.slice(2)) : response.status >= 500 ? 503 : 400;
    res.status(status).json({ code: missing ? "CATALOG_ASSOCIATIONS_UNAVAILABLE" : /^CATALOG_[A-Z_]+$/.test(value?.message ?? "") ? value!.message : "CATALOG_OPERATION_FAILED",
      error: missing ? "Las asociaciones requieren revisión del servidor." : "No se pudo confirmar la selección. Revisa los complementos y sus precios." });
  } catch { res.status(503).json({ code: "CATALOG_UNAVAILABLE", error: "No se pudo comprobar el resultado. Reintenta con la misma referencia." }); }
}
router.post("/catalog/associations", async (req, res) => {
  const b = req.body;
  if (!object(b) || !id(b.businessId) || !["list", "create", "update", "delete"].includes(String(b.operation)) || !object(b.input ?? {})
    || Object.keys(b).some(k => !["businessId", "operation", "input"].includes(k))) { res.status(400).json({ error: "Selección inválida." }); return; }
  const i = (b.input ?? {}) as Record<string, unknown>;
  const keys = b.operation === "create" ? ["sourceId", "targetId", "mode"] : b.operation === "update" ? ["id", "revision", "mode", "active"] : ["id", "revision"];
  if (Object.keys(i).some(k => !keys.includes(k)) || b.operation === "create" && (!id(i.sourceId) || !id(i.targetId) || !["included", "optional", "recommended"].includes(String(i.mode)))
    || ["update", "delete"].includes(String(b.operation)) && (!id(i.id) || !Number.isInteger(i.revision) || Number(i.revision) < 1)
    || i.mode != null && !["included", "optional", "recommended"].includes(String(i.mode)) || i.active != null && typeof i.active !== "boolean") {
    res.status(400).json({ error: "Asociación inválida." }); return;
  }
  await call(req, res, "go_catalog_associations", { p_business_id: b.businessId, p_operation: b.operation, p_input: i });
});
router.post("/catalog/quote", async (req, res) => {
  const b = req.body;
  if (!object(b) || !id(b.businessId) || !ids(b.rootIds, 1) || b.rootIds.length > 32 || !ids(b.selectedIds ?? [])
    || Object.keys(b).some(k => !["businessId", "rootIds", "selectedIds"].includes(k))) { res.status(400).json({ error: "Selección inválida." }); return; }
  await call(req, res, "go_catalog_quote", { p_business_id: b.businessId, p_root_ids: b.rootIds, p_selected_ids: b.selectedIds ?? [] });
});
router.post("/bookings/catalog", async (req, res) => {
  const b = req.body;
  if (!object(b) || !id(b.business_id) || !ids(b.root_ids, 1) || b.root_ids.length > 32 || !ids(b.selected_ids)
    || typeof b.request_key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(b.request_key)
    || !object(b.expected_quote) || b.expected_plan != null && !object(b.expected_plan)
    || b.staff_id != null && !id(b.staff_id) || b.customer_id != null && !id(b.customer_id)
    || typeof b.starts_at !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(b.starts_at) || !Number.isFinite(Date.parse(b.starts_at)) || Date.parse(b.starts_at) % 60000 !== 0
    || b.ends_at != null && (typeof b.ends_at !== "string" || !Number.isFinite(Date.parse(b.ends_at)))
    || b.notes != null && (typeof b.notes !== "string" || b.notes.length > 4000)
    || Object.keys(b).some(k => !["business_id", "root_ids", "selected_ids", "starts_at", "staff_id", "customer_id", "request_key", "expected_quote", "expected_plan", "ends_at", "notes"].includes(k))) {
    res.status(400).json({ error: "Reserva inválida." }); return;
  }
  await call(req, res, "go_create_catalog_booking", { p_business_id: b.business_id, p_root_ids: b.root_ids, p_selected_ids: b.selected_ids,
    p_starts_at: b.starts_at, p_staff_id: b.staff_id ?? null, p_customer_id: b.customer_id ?? null, p_request_key: b.request_key,
    p_expected_quote: b.expected_quote, p_expected_plan: b.expected_plan ?? null, p_expected_end: b.ends_at ?? null, p_notes: b.notes ?? null }, true);
});
export default router;
