import { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/requireAdmin";

const router: IRouter = Router();
// Every method/path in this namespace must pass the same server boundary.
router.use(requireAdmin);
router.get("/access", (_req, res) => {
  res.json({ userId: res.locals.adminUserId, role: "admin", allowed: true });
});

// Existing ADMIN screens are local prototypes; no privileged data/write API
// exists yet. Future operations belong behind this middleware, never /manage.
export default router;
