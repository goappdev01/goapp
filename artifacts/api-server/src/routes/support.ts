import { Router, type IRouter, type RequestHandler } from "express";
import express from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const kinds = new Set(["incident", "improvement", "help"]);
const statuses = new Set(["received", "in_review", "pending", "solved", "rejected"]);
const actions = new Set(["reply", "internal_note", "status", "archive", "reopen"]);
const mimes = new Set(["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"]);
const extensions: Record<string, RegExp> = {
  "application/pdf": /\.pdf$/i, "image/jpeg": /\.(jpg|jpeg)$/i, "image/png": /\.png$/i,
  "image/heic": /\.heic$/i, "image/heif": /\.heif$/i, "image/webp": /\.webp$/i,
};
function matchesFile(body: Buffer, mime: string) {
  if (mime === "application/pdf") return body.subarray(0, 5).toString("ascii") === "%PDF-";
  if (mime === "image/jpeg") return body[0] === 255 && body[1] === 216 && body[2] === 255;
  if (mime === "image/png") return body.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
  if (mime === "image/webp") return body.subarray(0, 4).toString("ascii") === "RIFF" && body.subarray(8, 12).toString("ascii") === "WEBP";
  if (mime === "image/heic" || mime === "image/heif") return body.subarray(4, 8).toString("ascii") === "ftyp"
    && ["heic","heix","hevc","hevx","mif1","msf1"].includes(body.subarray(8, 12).toString("ascii"));
  return false;
}
const fail = (code: string, message: string, status = 400) => ({ code, error: message, status });
type SupportError = ReturnType<typeof fail>;
const isUuid = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const validText = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.trim().length >= 1 && value.trim().length <= max;
const integer = (value: unknown, min: number, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= min && value <= max;
const validDate = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

const authorized: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) { res.status(401).json(fail("AUTH_REQUIRED", "Inicia sesión.", 401)); return; }
  try {
    const response = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(authorization) });
    if (!response.ok) { const status = [401,403].includes(response.status) ? 401 : 502;
      res.status(status).json(fail(status === 401 ? "AUTH_REQUIRED" : "AUTH_UNAVAILABLE", "No se pudo comprobar la sesión.", status)); return; }
    const user = await response.json() as { id?: unknown };
    if (!isUuid(user.id)) throw Error("Invalid identity");
    res.locals.supportUserId = user.id;
    next();
  } catch { res.status(502).json(fail("AUTH_UNAVAILABLE", "No se pudo comprobar la sesión.", 502)); }
};
router.use(authorized);

async function rpc(req: express.Request, name: string, payload: object) {
  const response = await supabaseRequest(`/rest/v1/rpc/${name}`, {
    method: "POST", headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => null) as { code?: string; message?: string } | null;
  if (!response.ok) {
    if (["PGRST202", "42P01", "42883"].includes(result?.code ?? ""))
      throw fail("SUPPORT_SETUP_REQUIRED", "AYUDA aún no está activada en el servidor.", 503);
    const denied = response.status === 401 || response.status === 403 || result?.code === "42501";
    const conflict = response.status === 409 || result?.code === "PT409";
    throw fail(conflict ? "SUPPORT_CHANGED" : denied ? "SUPPORT_ACCESS_DENIED" : "SUPPORT_UNAVAILABLE",
      conflict ? "La solicitud ha cambiado. Recarga y vuelve a intentarlo." : denied ? "Acceso no autorizado." : "No se pudo completar la operación de AYUDA.",
      conflict ? 409 : denied ? 403 : response.status >= 500 ? 502 : 400);
  }
  return result;
}
function handle(operation: (req: express.Request) => Promise<unknown>): RequestHandler {
  return (req, res) => { void operation(req).then(result => res.json(result)).catch((error: SupportError) => {
    const safe = error && typeof error.code === "string" && typeof error.status === "number"
      ? error : fail("SUPPORT_UNAVAILABLE", "No se pudo completar la operación de AYUDA.", 502);
    res.status(safe.status).json({ code: safe.code, error: safe.error });
  }); };
}
router.get("/capabilities", handle(async req => rpc(req, "go_support_readiness", {})));
router.post("/requests", handle(async req => {
  const { kind, body, requestKey, businessId } = req.body ?? {};
  if (!kinds.has(kind) || !validText(body, 4000) || !isUuid(requestKey) || businessId != null && !isUuid(businessId))
    throw fail("SUPPORT_INVALID", "Revisa la solicitud.");
  return rpc(req, "go_support_create", { p_kind: kind, p_body: body.trim(), p_request_key: requestKey, p_business_id: businessId ?? null });
}));
router.get("/requests", handle(async req => {
  const { admin, status, kind, archived, offset, limit, from, to, sender, scope, businessId } = req.query;
  const adminFlag = admin === "true", archivedFlag = archived === "true";
  const start = offset === undefined ? 0 : Number(offset), count = limit === undefined ? 30 : Number(limit);
  if (admin !== undefined && !["true", "false"].includes(String(admin)) || archived !== undefined && !["true", "false"].includes(String(archived))
    || status !== undefined && !statuses.has(String(status)) || kind !== undefined && !kinds.has(String(kind))
    || from !== undefined && !validDate(from) || to !== undefined && !validDate(to)
    || from !== undefined && to !== undefined && String(from)>String(to)
    || sender !== undefined && (typeof sender !== "string" || sender.length>80)
    || scope!==undefined&&!["all","personal","business"].includes(String(scope))
    || (scope==="business")!==(businessId!==undefined) || businessId!==undefined&&!isUuid(businessId)
    || adminFlag&&scope!==undefined&&scope!=="all"
    || !integer(start, 0, 100000) || !integer(count, 1, 50)) throw fail("SUPPORT_FILTER_INVALID", "Filtro inválido.");
  return rpc(req, "go_support_list", { p_admin: adminFlag, p_status: status ?? null, p_kind: kind ?? null,
    p_archived: archivedFlag, p_offset: start, p_limit: count,p_from:from??null,p_to:to??null,p_sender:sender??null,
    p_scope:scope??"all",p_business_id:businessId??null });
}));
router.get("/requests/:id", handle(async req => {
  if (!isUuid(req.params.id)) throw fail("SUPPORT_INVALID", "Referencia inválida.");
  return rpc(req, "go_support_detail", { p_id: req.params.id });
}));
router.post("/requests/:id/actions", handle(async req => {
  const { key, action, body, status, revision } = req.body ?? {};
  if (!isUuid(req.params.id) || !isUuid(key) || !actions.has(action) || !integer(revision, 1, 1000000000)
    || (action === "reply" || action === "internal_note") && !validText(body, 4000)
    || action === "status" && (!statuses.has(status) || body != null && !validText(body, 1000)))
    throw fail("SUPPORT_INVALID", "Acción inválida.");
  return rpc(req, "go_support_act", { p_id: req.params.id, p_key: key, p_action: action,
    p_body: body ?? null, p_status: status ?? null, p_revision: revision });
}));
router.post("/requests/:id/files", handle(async req => {
  const { clientId, name, mime, size } = req.body ?? {};
  if (!isUuid(req.params.id) || typeof clientId !== "string" || !/^[a-zA-Z0-9_-]{1,80}$/.test(clientId)
    || typeof name !== "string" || !name.length || name.length > 180 || /[/\\]/.test(name)
    || !mimes.has(mime) || !extensions[mime].test(name) || !integer(size, 1, 10485760)) throw fail("SUPPORT_FILE_INVALID", "Archivo inválido.");
  return rpc(req, "go_support_reserve_file", { p_id: req.params.id, p_client_id: clientId, p_name: name, p_mime: mime, p_size: size });
}));

function storageSettings() {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key) throw fail("SUPPORT_STORAGE_UNAVAILABLE", "No se pudo acceder al archivo privado.", 503);
  return { url: url.replace(/\/$/, ""), key };
}
async function fileInfo(req: express.Request, id: string, mode: "read" | "upload" | "delete") {
  if (!isUuid(id)) throw fail("SUPPORT_FILE_INVALID", "Archivo inválido.");
  return rpc(req, "go_support_file", { p_id: id, p_mode: mode }) as Promise<{ id: string; object_path: string; mime_type: string; byte_size: number }>;
}
async function storage(req: express.Request, path: string, method: string, body?: Buffer, mime?: string) {
  const { url, key } = storageSettings();
  return fetch(`${url}/storage/v1/object/${method === "GET" ? "authenticated/" : ""}go-support-private/${path}`, {
    method, headers: { apikey: key, ...bearerHeader(req.header("authorization")), ...(mime ? { "Content-Type": mime } : {}),
      ...(method === "POST" ? { "x-upsert": "false" } : {}) }, body,
    signal: AbortSignal.timeout(30000),
  });
}
router.post("/files/:id/content", express.raw({ type: () => true, limit: "10mb" }), async (req, res) => {
  try {
    const info = await fileInfo(req, String(req.params.id), "upload");
    const body = req.body;
    if (!Buffer.isBuffer(body) || body.length !== info.byte_size || req.header("content-type") !== info.mime_type
      || !matchesFile(body, info.mime_type))
      throw fail("SUPPORT_FILE_INVALID", "El archivo no coincide con la solicitud.");
    const uploaded = await storage(req, info.object_path, "POST", body, info.mime_type);
    if (!uploaded.ok && uploaded.status !== 409) throw fail("SUPPORT_UPLOAD_FAILED", "No se pudo guardar el archivo.", 502);
    res.json({ id: info.id, uploaded: true });
  } catch (error) { const safe = error && typeof error === "object" && "status" in error ? error as SupportError : fail("SUPPORT_UNAVAILABLE", "No se pudo guardar el archivo.", 502);
    res.status(safe.status).json({ code: safe.code, error: safe.error }); }
});
router.post("/files/:id/confirm", handle(async req => {
  if (!isUuid(req.params.id)) throw fail("SUPPORT_FILE_INVALID", "Archivo inválido.");
  return rpc(req, "go_support_confirm_file", { p_id: req.params.id });
}));
router.get("/files/:id/content", async (req, res) => {
  try {
    const info = await fileInfo(req, String(req.params.id), "read");
    const response = await storage(req, info.object_path, "GET");
    if (!response.ok) throw fail("SUPPORT_FILE_UNAVAILABLE", "No se pudo abrir el archivo.", 502);
    res.setHeader("Content-Type", info.mime_type);
    res.setHeader("Content-Disposition", "attachment");
    res.setHeader("Cache-Control", "private, no-store");
    res.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) { const safe = error && typeof error === "object" && "status" in error ? error as SupportError : fail("SUPPORT_UNAVAILABLE", "No se pudo abrir el archivo.", 502);
    res.status(safe.status).json({ code: safe.code, error: safe.error }); }
});
router.get("/files/:id/link", handle(async req => {
  const info = await fileInfo(req, String(req.params.id), "read");
  const { url, key } = storageSettings();
  const response = await fetch(`${url}/storage/v1/object/sign/go-support-private/${info.object_path}`, {
    method: "POST", headers: { apikey: key, ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }), signal: AbortSignal.timeout(15000),
  });
  const result = await response.json().catch(() => null) as { signedURL?: string } | null;
  const signed=result?.signedURL;
  const prefix=signed?.startsWith("/storage/v1/object/sign/go-support-private/") ? "" :
    signed?.startsWith("/object/sign/go-support-private/") ? "/storage/v1" : null;
  if (!response.ok || !signed || prefix===null)
    throw fail("SUPPORT_FILE_UNAVAILABLE", "No se pudo abrir el archivo privado.", 502);
  return { url: `${url}${prefix}${signed}` };
}));
router.delete("/files/:id", handle(async req => {
  let info;
  try { info = await fileInfo(req, String(req.params.id), "read");
    await rpc(req, "go_support_remove_file", { p_id: info.id }); }
  catch { info = await fileInfo(req, String(req.params.id), "delete"); }
  const removed = await storage(req, info.object_path, "DELETE");
  if (!removed.ok && removed.status !== 404) throw fail("SUPPORT_FILE_CLEANUP_PENDING", "El archivo se ha retirado del hilo; queda pendiente su limpieza privada.", 503);
  return { id: info.id, status: "removed" };
}));
router.post("/retention/purge", handle(async req => {
  const due = await rpc(req, "go_support_expired", { p_limit: 20 }) as { id: string; files: { id: string; path: string }[] }[];
  if (!Array.isArray(due)) throw fail("SUPPORT_UNAVAILABLE", "No se pudo comprobar la retención.", 502);
  let purged = 0, pending = 0;
  for (const row of due) {
    if (!isUuid(row.id) || !Array.isArray(row.files)) throw fail("SUPPORT_UNAVAILABLE", "Resultado de retención inválido.", 502);
    // Claim under the request row lock before deleting any object. Reopening is blocked until cleanup finishes.
    let claimed: { id: string; files: { id: string; path: string }[] };
    try { claimed = await rpc(req, "go_support_claim_expired", { p_id: row.id }) as typeof claimed; }
    catch (error) { if ((error as SupportError)?.status === 409) { pending++; continue; } throw error; }
    if (claimed?.id !== row.id || !Array.isArray(claimed.files))
      throw fail("SUPPORT_UNAVAILABLE", "Resultado de retención inválido.", 502);
    let cleaned = true;
    for (const file of claimed.files) {
      if (!isUuid(file.id) || typeof file.path !== "string" || !file.path.startsWith(row.id + "/"))
        throw fail("SUPPORT_UNAVAILABLE", "Archivo de retención inválido.", 502);
      const removed = await storage(req, file.path, "DELETE");
      if (!removed.ok && removed.status !== 404) { cleaned = false; break; }
    }
    if (cleaned) { await rpc(req, "go_support_purge_expired", { p_id: row.id }); purged++; }
    else pending++;
  }
  return { purged, pending };
}));
router.use(((error, _req, res, next) => {
  if (error?.type === "entity.too.large") {
    res.status(413).json({ code: "SUPPORT_FILE_TOO_LARGE", error: "El archivo supera el tamaño permitido." }); return;
  }
  next(error);
}) as express.ErrorRequestHandler);
export default router;
