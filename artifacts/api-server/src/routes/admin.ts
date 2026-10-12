import { Router, type IRouter } from "express";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
import { TECHNICAL_PERMISSIONS } from "../lib/adminPermissions";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
// Every method/path in this namespace must pass the same server boundary.
router.use(requireAdmin);
router.get("/access", requireAdminPermission("admin.access"), (_req, res) => {
  res.json({ userId: res.locals.adminUserId, role: "admin", allowed: true,
    level: res.locals.adminLevel, permissions: res.locals.adminPermissions });
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
