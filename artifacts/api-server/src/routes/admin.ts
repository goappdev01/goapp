import { Router } from "express";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
const router = Router();
router.use(requireAdmin);
router.get("/access", requireAdminPermission("admin.access"), (_req, res) => {
  res.json({ userId: res.locals.adminUserId, role: "admin", allowed: true,
    level: res.locals.adminLevel, permissions: res.locals.adminPermissions });
});
export default router;
