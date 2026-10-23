import { Router } from "express";
import { allowNewBookingModule, serverModulePublication } from "../lib/modulePublication";

const router = Router();
router.get("/module-publication", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(serverModulePublication());
});
// No changes to history/cancel/negotiation RPCs or their existing ownership checks.
router.use(async (req, res, next) => {
  const guarded = req.method === "POST" && ["/bookings", "/bookings/timeline", "/bookings/catalog", "/catalog/quote"].includes(req.path)
    || req.method === "GET" && req.path === "/booking-availability";
  if (!guarded) { next(); return; }
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ code: "AUTH_REQUIRED", error: "Inicia sesión." }); return; }
  try {
    if (await allowNewBookingModule(req, res, req.method === "GET" ? req.query.business_id : req.body?.business_id ?? req.body?.businessId)) next();
  } catch { if (!res.headersSent) res.status(503).json({ code: "MODULE_ACCESS_UNAVAILABLE", error: "No se pudo comprobar la disponibilidad del módulo." }); }
});
export default router;
