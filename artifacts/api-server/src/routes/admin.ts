import { Router, type IRouter } from "express";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
import { TECHNICAL_PERMISSIONS } from "../lib/adminPermissions";
import { bearerHeader, supabaseRequest, supabaseStorageRequest } from "../lib/supabase";
import { serverModulePublication } from "../lib/modulePublication";
import { GO_MODULE_STAGE_LABELS, GO_RESERVATION_SECTORS } from "@workspace/api-zod";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Every method/path in this namespace must pass the same server boundary.
router.use(requireAdmin);
router.get("/module-publication", requireAdminPermission("admin.access"), (_req, res) => {
  res.json({ publication: serverModulePublication(), sectors: GO_RESERVATION_SECTORS, stageLabels: GO_MODULE_STAGE_LABELS,
    configuration: "GO_MODULE_PUBLICATION", mutable: false });
});
router.get("/access", requireAdminPermission("admin.access"), (_req, res) => {
  res.json({ userId: res.locals.adminUserId, role: "admin", allowed: true,
    level: res.locals.adminLevel, permissions: res.locals.adminPermissions });
});

router.get("/trial/applications", requireAdminPermission("ownership.manage"), async (req, res) => {
  if (process.env.GO_BUSINESS_TRIAL_ONBOARDING !== "enabled") { res.json([]); return; }
  const authorization = bearerHeader(req.header("authorization"));
  const [trials, fiscal, documents] = await Promise.all([
    supabaseRequest("/rest/v1/business_trial_requests?select=business_id,owner_id,status,accepted_at,updated_at,review_notes,trial_starts_at,trial_ends_at&order=updated_at.desc", { headers: authorization }),
    supabaseRequest("/rest/v1/business_verification_requests?select=business_id,legal_name,tax_id,trading_name,address,status,rejection_reason", { headers: authorization }),
    supabaseRequest("/rest/v1/business_trial_documents?select=id,business_id,kind,file_name,mime_type,byte_size,created_at&order=created_at.desc", { headers: authorization }),
  ]);
  if (!trials.ok || !fiscal.ok || !documents.ok) { res.status(502).json({ error: "No se pudo consultar la cola de verificación." }); return; }
  const [rows, details, files] = await Promise.all([trials.json(), fiscal.json(), documents.json()]);
  if (!Array.isArray(rows) || !Array.isArray(details) || !Array.isArray(files)) { res.status(502).json({ error: "Respuesta de verificación inválida." }); return; }
  res.json(rows.map(row => ({ ...row, verification: details.find(d => d.business_id === row.business_id) ?? null,
    documents: files.filter(f => f.business_id === row.business_id) })));
});
router.post("/trial/applications/:businessId/decision", requireAdminPermission("ownership.manage"), async (req, res) => {
  if (process.env.GO_BUSINESS_TRIAL_ONBOARDING !== "enabled") { res.status(503).json({ error: "Alta empresarial pendiente de activación." }); return; }
  const { action, reason } = req.body ?? {};
  if (!uuid.test(String(req.params.businessId)) || !["approve", "changes", "reject"].includes(action)
    || typeof reason !== "string" || reason.length > 1000 || (action !== "approve" && reason.trim().length < 3)) {
    res.status(400).json({ error: "Decisión inválida. Indica un motivo para solicitar cambios o rechazar." }); return;
  }
  const response = await supabaseRequest("/rest/v1/rpc/review_business_trial", {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ p_business_id: req.params.businessId, p_action: action, p_reason: reason.trim() }),
  });
  if (!response.ok) { res.status(response.status === 403 ? 403 : 502).json({ error: "No se pudo confirmar la decisión." }); return; }
  res.json(await response.json());
});
router.get("/trial/documents/:documentId", requireAdminPermission("ownership.manage"), async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  if (process.env.GO_BUSINESS_TRIAL_ONBOARDING !== "enabled") { res.status(503).json({ error: "Alta empresarial pendiente de activación." }); return; }
  if (!uuid.test(String(req.params.documentId))) { res.status(400).json({ error: "Documento inválido." }); return; }
  const docs = await supabaseRequest(`/rest/v1/business_trial_documents?${new URLSearchParams({ id: `eq.${req.params.documentId}`, select: "id,object_path,mime_type,file_name,byte_size" })}`, {
    headers: bearerHeader(req.header("authorization")),
  });
  if (!docs.ok) { res.status(502).json({ error: "No se pudo comprobar el documento." }); return; }
  const rows = await docs.json() as { object_path: string; mime_type: string; file_name: string; byte_size: number }[];
  if (!Array.isArray(rows) || rows.length !== 1) { res.status(404).json({ error: "Documento no encontrado." }); return; }
  try {
    const stored = await supabaseStorageRequest(`/storage/v1/object/authenticated/go-business-documents/${rows[0].object_path}`,
      req.header("authorization"));
    if (!stored.ok) { res.status(502).json({ error: "No se pudo abrir el documento privado." }); return; }
    const bytes = Buffer.from(await stored.arrayBuffer());
    if (bytes.length > 5242880 || bytes.length !== rows[0].byte_size) { res.status(502).json({ error: "Tamaño de documento no válido." }); return; }
    res.json({ name: rows[0].file_name, mime_type: rows[0].mime_type, content_base64: bytes.toString("base64") });
  } catch { res.status(502).json({ error: "No se pudo consultar el archivo." }); }
});

// These RPCs recheck the live owner inside the same database transaction as
// the write, so revocation between this middleware and the RPC cannot grant access.
router.get("/memberships", requireAdminPermission("memberships.manage"), async (req, res) => {
  const response = await supabaseRequest("/rest/v1/rpc/admin_list_memberships", {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" }, body: "{}",
  });
  if (!response.ok) { res.status(response.status === 403 ? 403 : 502).json({ code: "ADMIN_OPERATION_FAILED", error: "No se pudo consultar el acceso." }); return; }
  res.json(await response.json());
});
router.get("/audit", requireAdminPermission("memberships.manage"), async (req, res) => {
  const response = await supabaseRequest("/rest/v1/rpc/admin_list_audit", {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" }, body: "{}",
  });
  if (!response.ok) { res.status(response.status === 403 ? 403 : 502).json({ code: "ADMIN_OPERATION_FAILED", error: "No se pudo consultar la auditoría." }); return; }
  res.json(await response.json());
});
router.put("/memberships/:userId", requireAdminPermission("memberships.manage"), async (req, res) => {
  const { level, permissions, active, reason } = req.body ?? {};
  const userId = req.params.userId;
  if (typeof userId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)
    || level !== "technical" || typeof active !== "boolean" || typeof reason !== "string" || !reason.trim() || reason.length > 1000
    || !Array.isArray(permissions) || !permissions.includes("admin.access")
    || !permissions.every(p => TECHNICAL_PERMISSIONS.includes(p))) {
    res.status(400).json({ code: "INVALID_ADMIN_GRANT", error: "Permisos administrativos inválidos." }); return;
  }
  const response = await supabaseRequest("/rest/v1/rpc/admin_set_membership", {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ p_user_id: userId, p_permissions: permissions, p_active: active, p_reason: reason.trim() }),
  });
  if (!response.ok) {
    res.status(response.status === 403 ? 403 : response.status === 400 ? 400 : 502)
      .json({ code: "ADMIN_OPERATION_FAILED", error: "No se pudo modificar el acceso administrativo." }); return;
  }
  res.json(await response.json());
});

// Existing dashboard tools are local prototypes, not real privileged APIs.
// Every future operation needs an explicit requireAdminPermission boundary.
export default router;
