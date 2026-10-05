import { createHash } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();

type AuthPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_at?: unknown;
  expires_in?: unknown;
  user?: { id?: unknown };
  error_code?: unknown;
  code?: unknown;
  msg?: unknown;
  message?: unknown;
};

// Stable HTTPS destination for Expo Go and installed pilot builds.
// Allow this exact URL in Supabase Auth > URL Configuration.
const emailConfirmationUrl = "https://goapp-api-production.up.railway.app/api/supabase/auth/email-confirmed";
const emailConfirmationScript = `
const fragment = new URLSearchParams(window.location.hash.slice(1));
const query = new URLSearchParams(window.location.search);
const failed = fragment.has("error") || fragment.has("error_code") || query.has("error") || query.has("error_code");
// Do not retain or forward session tokens that Supabase may append.
window.history.replaceState(null, "", window.location.pathname);
if (failed) {
  document.getElementById("message").textContent = "El enlace no es válido o ha caducado. Si ya confirmaste tu cuenta, vuelve a GO e inicia sesión; si no, solicita un nuevo correo de confirmación.";
}
`;
const emailConfirmationHtml = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>GO · Verificación de correo</title></head>
<body><h1>Continúa en GO</h1>
<p id="message">Después de confirmar tu correo, vuelve a GO e inicia sesión con tu cuenta.</p>
<p>Si utilizas Expo Go en iPhone, vuelve manualmente a Expo Go.</p>
<p>Si tienes instalada la aplicación piloto: <a href="go-app://">Abrir GO</a>.</p>
<script>${emailConfirmationScript}</script></body></html>`;

router.get("/auth/email-confirmed", (_req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const scriptHash = createHash("sha256").update(emailConfirmationScript).digest("base64");
  res.setHeader("Content-Security-Policy", `default-src 'none'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`);
  res.type("html").send(emailConfirmationHtml);
});

router.post("/auth/register", async (req: Request, res: Response) => {
  const { email, password, full_name, role } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "A valid email and a password of at least 8 characters are required" });
    return;
  }
  const acceptedRoles = new Set(["usuario", "empresa"]);
  const accountRole = acceptedRoles.has(role) ? role : "usuario";

  const response = await supabaseRequest(`/auth/v1/signup?${new URLSearchParams({ redirect_to: emailConfirmationUrl })}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, data: { full_name: full_name ?? null, role: accountRole } }),
  });
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

router.post("/auth/login", async (req: Request, res: Response) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const response = await supabaseRequest("/auth/v1/token?grant_type=password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

// Official GoTrue refresh grant. Never log or place refresh tokens in URLs.
router.post("/auth/refresh", async (req: Request, res: Response) => {
  res.setHeader("Cache-Control", "no-store");
  const token = req.body?.refresh_token;
  if (typeof token !== "string" || !token.trim()) {
    res.status(400).json({ code: "REFRESH_TOKEN_REQUIRED", error: "Refresh token is required" });
    return;
  }
  const response = await supabaseRequest("/auth/v1/token?grant_type=refresh_token", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: token }),
  });
  const payload = await response.json().catch(() => null) as AuthPayload | null;
  if (!response.ok) {
    const code = payload?.error_code ?? payload?.code;
    const message = String(payload?.msg ?? payload?.message ?? "").toLowerCase();
    const irrecoverable = [400, 401].includes(response.status) &&
      (["refresh_token_not_found", "refresh_token_already_used", "session_not_found", "user_not_found", "invalid_grant"].includes(String(code))
        || message.includes("invalid refresh token") || message.includes("refresh token not found"));
    res.status(irrecoverable ? 401 : response.status).json({
      code: irrecoverable ? "SESSION_UNRECOVERABLE" : "SESSION_REFRESH_FAILED",
      error: irrecoverable ? "Session can no longer be refreshed" : "Session refresh unavailable",
    });
    return;
  }
  if (!payload?.access_token || !payload?.refresh_token || !payload?.user?.id) {
    res.status(502).json({ code: "SESSION_REFRESH_FAILED", error: "Invalid session response" });
    return;
  }
  res.json({ access_token: payload.access_token, refresh_token: payload.refresh_token,
    expires_at: payload.expires_at, expires_in: payload.expires_in, user: payload.user });
});

router.post("/auth/recover", async (req: Request, res: Response) => {
  const { email } = req.body ?? {};
  if (typeof email !== "string" || !email.includes("@")) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  const response = await supabaseRequest("/auth/v1/recover", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

router.get("/auth/me", async (req: Request, res: Response) => {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) {
    res.status(401).json({ error: "Authorization bearer token is required" });
    return;
  }

  const response = await supabaseRequest("/auth/v1/user", {
    headers: bearerHeader(authorization),
  });
  const body = await response.text();
  if (!response.ok) {
    res.status(response.status).type("application/json").send(body);
    return;
  }

  const user = JSON.parse(body) as { id?: string };
  if (!user.id) {
    res.status(502).json({ error: "Supabase returned an invalid user" });
    return;
  }

  const profileQuery = new URLSearchParams({
    select: "id,role,full_name,phone,avatar_url",
    id: `eq.${user.id}`,
    limit: "1",
  });
  const profileResponse = await supabaseRequest(`/rest/v1/profiles?${profileQuery}`, {
    headers: bearerHeader(authorization),
  });
  const profiles = await profileResponse.json().catch(() => []);
  res.status(profileResponse.ok ? 200 : profileResponse.status).json({
    user,
    profile: Array.isArray(profiles) ? (profiles[0] ?? null) : null,
  });
});

router.get("/businesses", async (req: Request, res: Response) => {
  const query = new URLSearchParams({
    select: "id,name,description,address,timezone,booking_enabled,verified,ui_metadata",
    booking_enabled: "eq.true",
    order: "created_at.desc",
  });

  const response = await supabaseRequest(`/rest/v1/businesses?${query}`);
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

router.get("/businesses/:businessId/services", async (req: Request, res: Response) => {
  const query = new URLSearchParams({
    select: "id,business_id,name,description,duration_minutes,price,currency,active,ui_metadata",
    business_id: `eq.${req.params.businessId}`,
    active: "eq.true",
    order: "name.asc",
  });

  const response = await supabaseRequest(`/rest/v1/services?${query}`);
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

router.get("/services", async (req: Request, res: Response) => {
  const query = new URLSearchParams({
    select: "id,business_id,name,description,duration_minutes,price,currency,active,ui_metadata",
    active: "eq.true",
    order: "name.asc",
  });
  if (typeof req.query.business_id === "string" && req.query.business_id) {
    query.set("business_id", `eq.${req.query.business_id}`);
  }

  const response = await supabaseRequest(`/rest/v1/services?${query}`);
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

router.get("/bookings", async (req: Request, res: Response) => {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) {
    res.status(401).json({ error: "Authorization bearer token is required" });
    return;
  }

  const query = new URLSearchParams({
    select: "id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status,notes",
    order: "starts_at.desc",
  });
  const response = await supabaseRequest(`/rest/v1/bookings?${query}`, {
    headers: bearerHeader(authorization),
  });
  const body = await response.text();
  res.status(response.status).type("application/json").send(body);
});

router.post("/bookings", async (req: Request, res: Response) => {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) {
    res.status(401).json({ error: "Authorization bearer token is required" });
    return;
  }

  const { business_id, service_id, staff_id, customer_id, starts_at, ends_at, notes, status } = req.body ?? {};
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const validId = (value: unknown) => typeof value === "string" && uuid.test(value);
  if (!validId(business_id) || !validId(service_id) ||
      (staff_id != null && !validId(staff_id)) ||
      typeof starts_at !== "string" || typeof ends_at !== "string" ||
      !Number.isFinite(Date.parse(starts_at)) || !Number.isFinite(Date.parse(ends_at)) ||
      Date.parse(ends_at) <= Date.parse(starts_at) ||
      Date.parse(starts_at) <= Date.now() ||
      (notes != null && (typeof notes !== "string" || notes.length > 4000)) ||
      (status != null && status !== "PENDING" && status !== "CONFIRMED")) {
    res.status(400).json({ error: "Invalid booking: check IDs, future dates, status and notes" });
    return;
  }

  const authUserResponse = await supabaseRequest("/auth/v1/user", {
    headers: bearerHeader(authorization),
  });
  const authUser = await authUserResponse.json().catch(() => ({})) as { id?: string };
  if (!authUserResponse.ok || !authUser.id) {
    res.status(authUserResponse.ok ? 502 : authUserResponse.status).json({
      error: "The authorization token does not identify a valid user",
    });
    return;
  }
  if (customer_id && customer_id !== authUser.id) {
    res.status(403).json({ error: "customer_id must match the authenticated user" });
    return;
  }

  const serviceQuery = new URLSearchParams({ id: `eq.${service_id}`, business_id: `eq.${business_id}`, active: "eq.true", select: "id,duration_minutes" });
  const serviceResponse = await supabaseRequest(`/rest/v1/services?${serviceQuery}`, { headers: bearerHeader(authorization) });
  if (!serviceResponse.ok) {
    res.status(serviceResponse.status).json({ error: "Unable to validate service" });
    return;
  }
  const services = await serviceResponse.json() as { id: string; duration_minutes: number }[];
  if (!services[0] || Date.parse(ends_at) - Date.parse(starts_at) !== services[0].duration_minutes * 60000) {
    res.status(400).json({ error: "Service does not belong to this business or duration is invalid" });
    return;
  }
  if (staff_id) {
    const query = new URLSearchParams({ id: `eq.${staff_id}`, business_id: `eq.${business_id}`, active: "eq.true", select: "id" });
    const staffResponse = await supabaseRequest(`/rest/v1/staff?${query}`, { headers: bearerHeader(authorization) });
    if (!staffResponse.ok) { res.status(staffResponse.status).json({ error: "Unable to validate staff" }); return; }
    const staff = await staffResponse.json() as { id: string }[];
    if (!staff.length) { res.status(400).json({ error: "Invalid staff for business" }); return; }
  }

  const response = await supabaseRequest("/rest/v1/bookings", {
    method: "POST",
    headers: {
      ...bearerHeader(authorization),
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify({
      business_id,
      service_id,
      staff_id: staff_id ?? null,
      customer_id: authUser.id,
      starts_at,
      ends_at,
      status: status === "PENDING" ? "PENDING" : "CONFIRMED",
      notes: notes ?? null,
    }),
  });
  const body = await response.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    parsed = null;
  }
  const dbCode = parsed && typeof parsed === "object" && "code" in parsed
    ? String((parsed as { code?: unknown }).code)
    : "";
  if (response.status === 409 || dbCode === "23P01") {
    res.status(409).json({
      error: "BOOKING_CONFLICT",
      code: dbCode || "23P01",
      message: "Ese horario ya no está disponible. Elige otra hora.",
    });
    return;
  }
  res.status(response.status).type("application/json").send(body);
});

// Public bookable resources; visibility is enforced by Supabase RLS.
for (const [resource, select] of [
  ["staff", "id,business_id,display_name,active,ui_metadata"],
  ["availability", "id,business_id,staff_id,weekday,start_time,end_time,timezone,active,ui_metadata"],
]) {
  router.get(`/${resource}`, async (req: Request, res: Response) => {
    const query = new URLSearchParams({ select, active: "eq.true" });
    if (typeof req.query.business_id === "string") query.set("business_id", `eq.${req.query.business_id}`);
    const result = await supabaseRequest(`/rest/v1/${resource}?${query}`);
    res.status(result.status).type("application/json").send(await result.text());
  });
}

// Customer cancellation only. Ownership is checked in the filter and by RLS.
router.patch("/bookings/:bookingId/cancel", async (req: Request, res: Response) => {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) {
    res.status(401).json({ error: "Authorization bearer token is required" }); return;
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(req.params.bookingId))) {
    res.status(400).json({ error: "Invalid booking ID" }); return;
  }
  const auth = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(authorization) });
  const user = await auth.json() as { id?: string };
  if (!auth.ok || !user.id) { res.status(auth.ok ? 502 : auth.status).json({ error: "Invalid session" }); return; }
  const query = new URLSearchParams({ id: `eq.${req.params.bookingId}`, customer_id: `eq.${user.id}`, status: "in.(PENDING,CONFIRMED,CANCELLED)" });
  const result = await supabaseRequest(`/rest/v1/bookings?${query}`, {
    method: "PATCH", headers: { ...bearerHeader(authorization), "Content-Type": "application/json", Prefer: "return=representation" },
    body: JSON.stringify({ status: "CANCELLED" }),
  });
  const body = await result.json();
  if (!result.ok) { res.status(result.status).json(body); return; }
  if (!Array.isArray(body) || !body.length) { res.status(404).json({ error: "No cancellable booking found" }); return; }
  res.json(body);
});

export default router;