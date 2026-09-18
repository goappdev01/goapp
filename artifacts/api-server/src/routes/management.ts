import { Router, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router = Router();
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const fields: Record<string, string[]> = {
  businesses: ["name", "description", "address", "timezone", "booking_enabled"],
  services: ["name", "description", "duration_minutes", "price", "currency", "active"],
  staff: ["display_name", "active"],
  availability: ["staff_id", "weekday", "start_time", "end_time", "timezone", "active"],
};
function validTimezone(value: unknown) {
  if (typeof value !== "string") return false;
  try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
}
function validate(resource: string, body: unknown, creating: boolean): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const data = body as Record<string, unknown>;
  if (!Object.keys(data).length || Object.keys(data).some(k => !fields[resource].includes(k))) return null;
  for (const [key, value] of Object.entries(data)) {
    if (["name", "display_name"].includes(key) && (typeof value !== "string" || !value.trim() || value.length > 200)) return null;
    if (["description", "address"].includes(key) && value !== null && (typeof value !== "string" || value.length > 4000)) return null;
    if (["active", "booking_enabled"].includes(key) && typeof value !== "boolean") return null;
    if (key === "timezone" && !validTimezone(value)) return null;
    if (key === "duration_minutes" && (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 1440)) return null;
    if (key === "price" && (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 9999999999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.0001)) return null;
    if (key === "currency" && value !== "EUR") return null;
    if (key === "staff_id" && value !== null && (typeof value !== "string" || !uuid.test(value))) return null;
    if (key === "weekday" && (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 6)) return null;
    if (["start_time", "end_time"].includes(key) && (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d(:00)?$/.test(value))) return null;
  }
  const required: Record<string, string[]> = { businesses: ["name"], services: ["name", "duration_minutes", "price"], staff: ["display_name"], availability: ["weekday", "start_time", "end_time"] };
  if (creating && required[resource].some(k => data[k] === undefined)) return null;
  if (data.start_time && data.end_time && String(data.end_time) <= String(data.start_time)) return null;
  return { ...data };
}
router.use(async (req, res, next) => {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) { res.status(401).json({ error: "Inicia sesión." }); return; }
  const response = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(authorization) });
  const user = await response.json() as { id?: string };
  if (!response.ok || !user.id) { res.status(response.ok ? 502 : response.status).json({ error: "Sesión inválida." }); return; }
  res.locals.userId = user.id;
  next();
});
async function request(req: Request, path: string, method = "GET", body?: unknown) {
  return supabaseRequest(`/rest/v1/${path}`, { method, headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json", Prefer: "return=representation" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
}
async function relay(res: Response, response: Awaited<ReturnType<typeof request>>, requireRow = false) {
  const body = await response.json();
  if (!response.ok) {
    const status = [400, 401, 403, 404, 409].includes(response.status) ? response.status : 502;
    res.status(status).json({ error: "No se pudo guardar o consultar la configuración.", code: body && typeof body === "object" && "code" in body ? body.code : undefined }); return;
  }
  if (requireRow && (!Array.isArray(body) || !body.length)) { res.status(404).json({ error: "Registro no encontrado." }); return; }
  res.status(response.status).json(body);
}
async function ownsBusiness(req: Request, res: Response): Promise<boolean> {
  const id = String(req.params.businessId);
  if (!uuid.test(id)) { res.status(400).json({ error: "Identificador inválido." }); return false; }
  const query = new URLSearchParams({ id: `eq.${id}`, owner_id: `eq.${res.locals.userId}`, select: "id,timezone" });
  const response = await request(req, `businesses?${query}`);
  if (!response.ok) { await relay(res, response); return false; }
  const rows = await response.json();
  if (!Array.isArray(rows) || !rows.length) { res.status(404).json({ error: "Negocio no encontrado." }); return false; }
  res.locals.businessTimezone = rows[0].timezone;
  return true;
}
router.get("/businesses", async (req, res) => {
  const query = new URLSearchParams({ owner_id: `eq.${res.locals.userId}`, order: "created_at.desc" });
  await relay(res, await request(req, `businesses?${query}`));
});
router.post("/businesses", async (req, res) => {
  const data = validate("businesses", req.body, true);
  if (!data) { res.status(400).json({ error: "Datos de negocio inválidos." }); return; }
  await relay(res, await request(req, "businesses", "POST", { timezone: "Europe/Madrid", booking_enabled: false, ...data, owner_id: res.locals.userId }), true);
});
router.patch("/businesses/:businessId", async (req, res) => {
  const data = validate("businesses", req.body, false);
  if (!data) { res.status(400).json({ error: "Datos de negocio inválidos." }); return; }
  if (!await ownsBusiness(req, res)) return;
  const query = new URLSearchParams({ id: `eq.${req.params.businessId}`, owner_id: `eq.${res.locals.userId}` });
  await relay(res, await request(req, `businesses?${query}`, "PATCH", data), true);
});
for (const resource of ["services", "staff", "availability"]) {
  const path = `/businesses/:businessId/${resource}`;
  router.get(path, async (req, res) => {
    if (!await ownsBusiness(req, res)) return;
    const query = new URLSearchParams({ business_id: `eq.${req.params.businessId}`, order: "id.asc" });
    await relay(res, await request(req, `${resource}?${query}`));
  });
  for (const creating of [true, false]) {
    router[creating ? "post" : "patch"](creating ? path : `${path}/:id`, async (req, res) => {
      const data = validate(resource, req.body, creating);
      if (!data || (!creating && !uuid.test(String(req.params.id)))) { res.status(400).json({ error: "Configuración inválida." }); return; }
      if (!await ownsBusiness(req, res)) return;
      if (resource === "availability" && data.staff_id) {
        const query = new URLSearchParams({ id: `eq.${data.staff_id}`, business_id: `eq.${req.params.businessId}`, select: "id" });
        const response = await request(req, `staff?${query}`);
        if (!response.ok) { await relay(res, response); return; }
        const rows = await response.json();
        if (!Array.isArray(rows) || !rows.length) { res.status(400).json({ error: "El profesional no pertenece al negocio." }); return; }
      }
      const query = new URLSearchParams({ id: `eq.${req.params.id}`, business_id: `eq.${req.params.businessId}` });
      const defaults = resource === "services" ? { currency: "EUR" } : resource === "availability" ? { timezone: res.locals.businessTimezone } : {};
      const payload = creating ? { ...defaults, ...data, business_id: req.params.businessId } : data;
      await relay(res, await request(req, creating ? resource : `${resource}?${query}`, creating ? "POST" : "PATCH", payload), true);
    });
  }
}
export default router;
