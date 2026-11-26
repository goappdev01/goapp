import { Router, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";
import { readFile } from "node:fs/promises";
import { createCommercialBatchPdf, createCommercialPosterPdf } from "../lib/commercialPoster";

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const code = /^[0-9a-f]{64}$/i;
const inventory = /^GO-\d{8,}$/i;
const validReference = (value: unknown) => typeof value === "string" && (code.test(value) || inventory.test(value));
const validPublicCode = (value: unknown) => typeof value === "string" && (code.test(value) || uuid.test(value));
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[character] ?? character);
let posterBytes: Promise<Buffer> | null = null;
const approvedPoster = () => posterBytes ??= readFile(new URL("./assets/commercial-qr-poster-a6.png", import.meta.url));

async function call(req: Request, name: string, args: object) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST", headers: { "Content-Type": "application/json", ...bearerHeader(req.header("authorization")) },
    body: JSON.stringify(args),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  return { response, body };
}
function failure(res: Response, response: { status: number }, body: Record<string, unknown> | null) {
  const status = [400, 401, 403, 404, 409, 422, 429].includes(response.status) ? response.status
    : body?.code === "42501" ? 403 : body?.code === "PT404" ? 404 : body?.code === "PT409" ? 409
      : body?.code === "PT429" ? 429 : body?.code === "22023" ? 400 : 503;
  res.status(status).json({ code: typeof body?.message === "string" && /^GO_QR_[A-Z_]+$/.test(body.message) ? body.message : "GO_QR_UNAVAILABLE",
    error: status === 403 ? "No tienes autorización para este código." : status === 409 ? "El código ya tiene otro estado. Actualiza y vuelve a comprobarlo."
      : status === 404 ? "Código no disponible." : "No se pudo comprobar el código. No se ha cambiado ninguna asignación." });
}
function noStore(res: Response) {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
}

router.get("/resolve/:code", async (req, res) => {
  noStore(res);
  if (!validPublicCode(req.params.code)) { res.status(404).json({ state: "unavailable" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_resolve", { p_code: req.params.code });
    if (!response.ok || !body || typeof body.state !== "string") { res.status(503).json({ state: "unavailable" }); return; }
    res.json(body);
  } catch { res.status(503).json({ state: "unavailable" }); }
});

router.get("/supplier", async (req, res) => {
  noStore(res);
  try {
    const { response, body } = await call(req, "go_commercial_supplier", {});
    if (!response.ok) { failure(res, response, body); return; }
    res.json({ url: typeof body?.url === "string" && /^https:\/\//.test(body.url) ? body.url : null });
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});

router.get("/go", async (req, res) => {
  noStore(res);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  try {
    const { response, body } = await call(req, "go_commercial_issue_visit", { p_code: "go" });
    if (!response.ok || typeof body?.token !== "string" || !code.test(body.token)) {
      res.status(response.status === 429 ? 429 : 503).type("html").send("<h1>Enlace GO temporalmente no disponible</h1>"); return;
    }
    res.type("html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GO</title><style>body{font-family:system-ui;background:#081121;color:#fff;max-width:36rem;margin:3rem auto;padding:1.5rem}a{display:inline-block;background:#f5c542;color:#081121;padding:1rem 1.3rem;border-radius:.7rem;font-weight:700}</style></head><body><h1>GO</h1><p><a href="go-app:///?commercialRef=${body.token}">Abrir GO</a></p><p>Si aún no tienes la aplicación, vuelve a escanear este código tras instalarla. No se conserva automáticamente el origen al pasar por la tienda.</p></body></html>`);
  } catch { res.status(503).type("html").send("<h1>Enlace GO temporalmente no disponible</h1>"); }
});

// Existing Railway HTTPS domain is used as a safe landing route. It cannot
// promise universal links, deferred installation or browser reservations.
router.get("/b/:code", async (req, res) => {
  noStore(res);
  res.setHeader("X-Robots-Tag", "noindex, nofollow");
  res.setHeader("Content-Security-Policy", "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
  if (!validPublicCode(req.params.code)) { res.status(404).type("html").send("<h1>Código GO no disponible</h1>"); return; }
  try {
    const { response, body } = await call(req, "go_commercial_resolve", { p_code: req.params.code });
    if (!response.ok || !body || typeof body.state !== "string") { res.status(503).type("html").send("<h1>No se pudo comprobar este código GO</h1>"); return; }
    if (body.state !== "published" || typeof body.businessId !== "string" || !uuid.test(body.businessId)) {
      res.status(body.state === "not_published" ? 200 : 404).type("html")
        .send("<h1>Reservas no disponibles</h1><p>Este código GO aún no tiene reservas habilitadas.</p>"); return;
    }
    const name = escapeHtml(String(body.name ?? "Empresa"));
    const visit = await call(req, "go_commercial_issue_visit", { p_code: req.params.code });
    if (!visit.response.ok || typeof visit.body?.token !== "string" || !code.test(visit.body.token)) {
      res.status(visit.response.status === 429 ? 429 : 503).type("html")
        .send("<h1>Enlace GO temporalmente no disponible</h1><p>Vuelve a escanear el código más tarde.</p>"); return;
    }
    const link = `go-app://b/${req.params.code}?ref=${visit.body.token}`;
    res.type("html").send(`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GO · ${name}</title><style>body{font-family:system-ui;background:#081121;color:#fff;max-width:36rem;margin:3rem auto;padding:1.5rem}a{display:inline-block;background:#f5c542;color:#081121;padding:1rem 1.3rem;border-radius:.7rem;font-weight:700}p{line-height:1.5}</style></head><body><h1>${name}</h1><p>Reserva con GO.</p><p><a href="${link}">Abrir GO</a></p><p>Si no tienes la aplicación instalada, conserva este enlace y vuelve a abrirlo cuando esté disponible. Las reservas web no están habilitadas todavía.</p></body></html>`);
  } catch { res.status(503).type("html").send("<h1>No se pudo comprobar este código GO</h1>"); }
});

router.post("/businesses/:businessId/physical/assign", async (req, res) => {
  noStore(res);
  if (!uuid.test(req.params.businessId) || !validReference(req.body?.reference) || Object.keys(req.body ?? {}).some(key => key !== "reference")) {
    res.status(400).json({ code: "GO_QR_INVALID_ASSIGNMENT" }); return;
  }
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ code: "AUTH_REQUIRED" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_assign", { p_code: req.body.reference, p_business_id: req.params.businessId });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});

router.post("/businesses/:businessId/physical/preview", async (req, res) => {
  noStore(res);
  if (!uuid.test(req.params.businessId) || !validReference(req.body?.reference)
    || Object.keys(req.body ?? {}).some(key => key !== "reference")) {
    res.status(400).json({ code: "GO_QR_INVALID_ASSIGNMENT" }); return;
  }
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ code: "AUTH_REQUIRED" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_preview_assignment", { p_code: req.body.reference, p_business_id: req.params.businessId });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});

router.get("/businesses/:businessId/poster.pdf", async (req, res) => {
  noStore(res);
  const businessId = req.params.businessId;
  if (!uuid.test(businessId)) { res.status(400).json({ code: "GO_QR_INVALID_BUSINESS" }); return; }
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ code: "AUTH_REQUIRED" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_owned_poster", { p_business_id: businessId });
    if (!response.ok) { failure(res, response, body); return; }
    if (body?.published !== true) { res.status(409).json({ code: "GO_QR_NOT_PUBLISHED" }); return; }
    const pdf = await createCommercialPosterPdf(await approvedPoster(), businessId);
    res.setHeader("Content-Disposition", 'attachment; filename="go-cartel-a6.pdf"');
    res.type("application/pdf").send(Buffer.from(pdf));
  } catch { res.status(503).json({ code: "GO_QR_PDF_UNAVAILABLE" }); }
});

router.post("/acquisition/claim", async (req, res) => {
  noStore(res);
  if (!code.test(String(req.body?.token ?? "")) || Object.keys(req.body ?? {}).some(key => key !== "token")) {
    res.status(400).json({ code: "GO_QR_VISIT_INVALID" }); return;
  }
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) { res.status(401).json({ code: "AUTH_REQUIRED" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_claim_acquisition", { p_token: req.body.token });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});

router.use("/admin", requireAdmin, requireAdminPermission("ownership.manage"));
router.get("/admin/supplier", async (req, res) => {
  noStore(res);
  try {
    const { response, body } = await call(req, "go_commercial_admin_supplier", {});
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});
router.post("/admin/batches", async (req, res) => {
  noStore(res);
  const { quantity, requestId } = req.body ?? {};
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || !uuid.test(String(requestId))
    || Object.keys(req.body ?? {}).some(key => !["quantity", "requestId"].includes(key))) {
    res.status(400).json({ code: "GO_QR_INVALID_QUANTITY" }); return;
  }
  try {
    const { response, body } = await call(req, "go_commercial_create_batch", { p_quantity: quantity, p_request_id: requestId });
    if (!response.ok) { failure(res, response, body); return; }
    res.status(201).json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});
router.get("/admin/batches/:batchId", async (req, res) => {
  noStore(res);
  if (!uuid.test(req.params.batchId)) { res.status(400).json({ code: "GO_QR_BATCH_NOT_FOUND" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_get_batch", { p_batch_id: req.params.batchId });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});
router.get("/admin/batches/:batchId/poster.pdf", async (req, res) => {
  noStore(res);
  if (!uuid.test(req.params.batchId)) { res.status(400).json({ code: "GO_QR_BATCH_NOT_FOUND" }); return; }
  try {
    const { response, body } = await call(req, "go_commercial_get_batch", { p_batch_id: req.params.batchId });
    if (!response.ok) { failure(res, response, body); return; }
    const entries = body?.codes;
    if (!Array.isArray(entries) || !entries.length || entries.length > 1000
      || entries.some(item => typeof item?.code !== "string" || !code.test(item.code))) {
      res.status(503).json({ code: "GO_QR_BATCH_INVALID" }); return;
    }
    const pdf = await createCommercialBatchPdf(await approvedPoster(), entries.map(item => item.code as string));
    res.setHeader("Content-Disposition", `attachment; filename="go-qr-lote-${req.params.batchId}.pdf"`);
    res.type("application/pdf").send(Buffer.from(pdf));
  } catch { res.status(503).json({ code: "GO_QR_PDF_UNAVAILABLE" }); }
});
router.post("/admin/physical/authorize", async (req, res) => {
  noStore(res);
  const { reference, businessId, reason } = req.body ?? {};
  if (!validReference(reference) || !uuid.test(String(businessId)) || typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500
    || Object.keys(req.body ?? {}).some(key => !["reference", "businessId", "reason"].includes(key))) {
    res.status(400).json({ code: "GO_QR_INVALID_ASSIGNMENT" }); return;
  }
  try {
    const { response, body } = await call(req, "go_commercial_authorize", { p_code: reference, p_business_id: businessId, p_reason: reason.trim() });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});
router.post("/admin/physical/revoke", async (req, res) => {
  noStore(res);
  const { reference, reason } = req.body ?? {};
  if (!validReference(reference) || typeof reason !== "string" || reason.trim().length < 3 || reason.length > 500
    || Object.keys(req.body ?? {}).some(key => !["reference", "reason"].includes(key))) {
    res.status(400).json({ code: "GO_QR_REASON_REQUIRED" }); return;
  }
  try {
    const { response, body } = await call(req, "go_commercial_revoke", { p_code: reference, p_reason: reason.trim() });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});

router.put("/admin/supplier", async (req, res) => {
  noStore(res);
  const { url, enabled } = req.body ?? {};
  if (typeof url !== "string" || url.length > 2048 || !/^https:\/\/[A-Za-z0-9.-]+\/[^\s<>]*$/.test(url)
    || url.includes("@") || typeof enabled !== "boolean"
    || Object.keys(req.body ?? {}).some(key => !["url", "enabled"].includes(key))) {
    res.status(400).json({ code: "GO_QR_SUPPLIER_INVALID" }); return;
  }
  try {
    const { response, body } = await call(req, "go_commercial_set_supplier", { p_url: url, p_enabled: enabled });
    if (!response.ok) { failure(res, response, body); return; }
    res.json(body);
  } catch { res.status(503).json({ code: "GO_QR_UNAVAILABLE" }); }
});

export default router;
