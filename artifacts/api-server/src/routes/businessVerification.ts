import express, { Router, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";
import { requireAdmin, requireAdminPermission } from "../middleware/requireAdmin";

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bucket = "business-verification";

async function rpc(req: Request, name: string, body: unknown) {
  return supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
async function reply(res: Response, upstream: Awaited<ReturnType<typeof rpc>>) {
  const body = await upstream.json().catch(() => null);
  if (upstream.ok && body !== null) { res.json(body); return; }
  const failure = body as { code?: unknown } | null;
  const code = typeof failure?.code === "string" ? failure.code : "VERIFICATION_UNAVAILABLE";
  const status = code === "42501" ? 403 : code === "PT409" ? 409
    : ["22023", "22P02", "23514", "23505"].includes(code) ? 400 : 503;
  res.status(status).json({ code, error: status === 409 ? "El expediente ha cambiado. Actualízalo antes de continuar."
    : status === 403 ? "No tienes permiso para esta operación."
    : status === 400 ? "Revisa los datos, documentos y estado del expediente."
    : "La verificación empresarial todavía no está disponible. Tus datos se conservan." });
}

router.use(async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  if (!/^Bearer \S+$/.test(req.header("authorization") ?? "")) {
    res.status(401).json({ code: "AUTH_REQUIRED", error: "Inicia sesión." }); return;
  }
  try {
    const auth = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(req.header("authorization")) });
    const user = await auth.json() as { id?: unknown } | null;
    if (!auth.ok || typeof user?.id !== "string" || !uuid.test(user.id)) {
      res.status(auth.status === 401 || auth.status === 403 ? 401 : 503).json({ error: "No se pudo verificar la sesión." }); return;
    }
    res.locals.userId = user.id;
    next();
  } catch { res.status(503).json({ error: "No se pudo comprobar la sesión." }); }
});
router.get("/requirements", async (_req, res) => {
  const upstream = await supabaseRequest("/rest/v1/business_verification_requirements?select=activity,version,documents&order=activity", {
    headers: bearerHeader(_req.header("authorization")),
  });
  await reply(res, upstream);
});
router.get("/dossiers", async (req, res) => {
  const id = req.query.businessId;
  if (id !== undefined && (typeof id !== "string" || !uuid.test(id))) { res.status(400).json({ error: "Negocio inválido." }); return; }
  await reply(res, await rpc(req, "go_business_dossiers", { p_business_id: id ?? null, p_admin: false }));
});
router.get("/admin/dossiers", requireAdmin, requireAdminPermission("businesses.verify"), async (req, res) => {
  await reply(res, await rpc(req, "go_business_dossiers", { p_business_id: null, p_admin: true }));
});
router.post("/command", async (req, res, next) => {
  const body = req.body;
  if (!body || typeof body !== "object" || Array.isArray(body) || !uuid.test(body.requestId ?? "")
    || (body.businessId !== undefined && !uuid.test(body.businessId))
    || Object.keys(body).some(key => !["operation", "requestId", "businessId", "expectedRevision", "data", "reason", "status"].includes(key))
    || !["draft", "submit", "reserve_document", "complete_document", "decide", "review_document", "requirements"].includes(body.operation)) {
    res.status(400).json({ error: "Operación de verificación inválida." }); return;
  }
  if (["decide", "review_document", "requirements"].includes(body.operation)) {
    requireAdmin(req, res, error => {
      if (error) { next(error); return; }
      requireAdminPermission("businesses.verify")(req, res, next);
    });
  } else next();
}, async (req, res) => {
  await reply(res, await rpc(req, "go_business_verification", { p_command: req.body }));
});

// File bytes stay outside JSON bodies, general logs and database metadata.
async function storage(req: Request, path: string, method: string, body?: Buffer, mime?: string) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("Storage configuration unavailable");
  return fetch(`${url.replace(/\/$/, "")}/storage/v1/${path}`, {
    method, headers: { apikey: key, ...bearerHeader(req.header("authorization")),
      ...(mime ? { "Content-Type": mime } : {}), "x-upsert": "false", "Cache-Control": "no-store" },
    ...(body ? { body: new Uint8Array(body) } : {}), signal: AbortSignal.timeout(30000),
  });
}
export function validDocumentBytes(bytes: Buffer, mime: string): boolean {
  if (bytes.length === 0 || bytes.length > 10485760) return false;
  if (mime === "application/pdf") return bytes.subarray(0, 5).toString() === "%PDF-";
  if (mime === "image/png") return bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  return mime === "image/jpeg" && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
}
type StoredDocument = { id: string; business_id: string; object_path: string; mime_type: string; byte_size: number };
async function readDocument(response: Awaited<ReturnType<typeof rpc>>): Promise<StoredDocument | null> {
  const value = await response.json() as Partial<StoredDocument> | null;
  if (typeof value?.id !== "string" || !uuid.test(value.id) || typeof value.business_id !== "string" || !uuid.test(value.business_id)
    || value.object_path !== `${value.business_id}/${value.id}` || typeof value.mime_type !== "string"
    || !["application/pdf", "image/jpeg", "image/png"].includes(value.mime_type)
    || !Number.isInteger(value.byte_size) || Number(value.byte_size) < 1 || Number(value.byte_size) > 10485760) return null;
  return value as StoredDocument;
}
router.put("/documents/:id/content", express.raw({ type: "application/octet-stream", limit: "10mb" }), async (req, res) => {
  if (!uuid.test(String(req.params.id))) { res.status(400).json({ error: "Documento inválido." }); return; }
  const upstream = await rpc(req, "go_business_document", { p_id: req.params.id, p_upload: true });
  if (!upstream.ok) { await reply(res, upstream); return; }
  const doc = await readDocument(upstream);
  if (!doc || doc.id !== req.params.id) { res.status(503).json({ error: "No se pudo confirmar el documento." }); return; }
  if (!Buffer.isBuffer(req.body) || req.body.length !== doc.byte_size || !validDocumentBytes(req.body, doc.mime_type)) {
    res.status(400).json({ error: "El archivo no corresponde al tipo o tamaño permitido." }); return;
  }
  const saved = await storage(req, `object/${bucket}/${doc.object_path}`, "POST", req.body, doc.mime_type);
  // An interrupted reply may leave the immutable object stored. Confirm its metadata
  // through complete_document instead of overwriting it on retry.
  if (!saved.ok) {
    const failure = await saved.json().catch(() => null) as { error?: string; code?: string } | null;
    if (![400, 409].includes(saved.status) || !["Duplicate", "ResourceAlreadyExists", "KeyAlreadyExists"].includes(failure?.error ?? failure?.code ?? "")) {
      res.status(503).json({ error: "No se confirmó la carga. Conserva el archivo para reintentar." }); return;
    }
  }
  res.json({ documentId: doc.id, completionRequired: true });
});
router.get("/documents/:id/link", async (req, res) => {
  if (!uuid.test(String(req.params.id))) { res.status(400).json({ error: "Documento inválido." }); return; }
  const upstream = await rpc(req, "go_business_document", { p_id: req.params.id, p_upload: false });
  if (!upstream.ok) { await reply(res, upstream); return; }
  const doc = await readDocument(upstream);
  if (!doc || doc.id !== req.params.id) { res.status(503).json({ error: "No se pudo confirmar el documento." }); return; }
  const content = await storage(req, `object/authenticated/${bucket}/${doc.object_path}`, "GET");
  if (!content.ok || Number(content.headers.get("content-length")) > 10485760) {
    res.status(503).json({ error: "No se pudo comprobar el archivo privado." }); return;
  }
  const bytes = Buffer.from(await content.arrayBuffer());
  if (bytes.length !== doc.byte_size || !validDocumentBytes(bytes, doc.mime_type)) {
    res.status(400).json({ error: "El contenido del documento no coincide con el tipo declarado. Solicita su sustitución." }); return;
  }
  // Short-lived links contain an opaque UUID path, never fiscal data or filenames.
  const signed = await supabaseRequest(`/storage/v1/object/sign/${bucket}/${doc.object_path}`, {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" }, body: JSON.stringify({ expiresIn: 60 }),
  });
  const payload = await signed.json().catch(() => null) as { signedURL?: unknown } | null;
  if (!signed.ok || typeof payload?.signedURL !== "string" || !payload.signedURL.startsWith(`/object/sign/${bucket}/`)) {
    res.status(503).json({ error: "No se pudo abrir el documento privado." }); return;
  }
  const base = process.env.SUPABASE_URL;
  if (!base) { res.status(503).json({ error: "Almacenamiento no configurado." }); return; }
  res.json({ url: `${base.replace(/\/$/, "")}/storage/v1${payload.signedURL}`, expiresIn: 60 });
});
export default router;
