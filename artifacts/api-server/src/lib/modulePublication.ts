import type { Request, Response } from "express";
import { bookingActivityEnabled, defaultGoModulePublication, parseGoModulePublication } from "@workspace/api-zod";
import { bearerHeader, supabaseRequest } from "./supabase";
import { requireAdmin } from "../middleware/requireAdmin";

/** Server configuration only. No client preference or editable user metadata is authority. */
export function serverModulePublication() {
  try { return parseGoModulePublication(process.env.GO_MODULE_PUBLICATION ? JSON.parse(process.env.GO_MODULE_PUBLICATION) : defaultGoModulePublication()); }
  catch { return defaultGoModulePublication(); }
}

export async function internalModuleAccess(req: Request, res: Response): Promise<boolean | null> {
  if (req.header("x-go-internal-modules") !== "1") return false;
  let allowed = false;
  await requireAdmin(req, res, () => { allowed = Array.isArray(res.locals.adminPermissions) && res.locals.adminPermissions.includes("development"); });
  if (res.headersSent) return null;
  if (!allowed) { res.status(403).json({ code: "ADMIN_PERMISSION_REQUIRED", error: "Acceso interno no autorizado." }); return null; }
  return true;
}

export type PublishedBusiness = { id: string; booking_enabled?: boolean; ui_metadata?: { category?: unknown } };
export function publishedBusinesses<T extends PublishedBusiness>(rows: T[], internal: boolean): T[] {
  const policy = serverModulePublication();
  return rows.filter(row => row && typeof row.id === "string" && row.booking_enabled !== false && bookingActivityEnabled(row.ui_metadata?.category, policy, internal));
}

/** Query remains anonymous: an ADMIN publication view never widens business-data RLS. */
export async function filterPublishedResources(rows: unknown, internal: boolean): Promise<{ business_id: string; [key: string]: unknown }[] | null> {
  const resourceRow = (row: unknown): row is { business_id: string; [key: string]: unknown } => !!row
    && typeof row === "object" && !Array.isArray(row) && "business_id" in row && typeof row.business_id === "string";
  if (!Array.isArray(rows) || !rows.every(resourceRow)) return null;
  if (!rows.length) return [];
  const query = new URLSearchParams({ select: "id,booking_enabled,ui_metadata", booking_enabled: "eq.true" });
  const response = await supabaseRequest(`/rest/v1/businesses?${query}`);
  if (!response.ok) return null;
  const businesses: unknown = await response.json();
  if (!Array.isArray(businesses)) return null;
  const allowed = new Set(publishedBusinesses(businesses as PublishedBusiness[], internal).map(row => row.id));
  return rows.filter(row => allowed.has(row.business_id));
}

/** New bookings/quotes/availability only. Existing history, cancellation and management keep their own authorization. */
export async function allowNewBookingModule(req: Request, res: Response, businessId: unknown): Promise<boolean> {
  if (typeof businessId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(businessId)) {
    res.status(400).json({ code: "BUSINESS_REQUIRED", error: "Selecciona un negocio válido." }); return false;
  }
  const query = new URLSearchParams({ id: `eq.${businessId}`, select: "id,booking_enabled,ui_metadata", limit: "1" });
  const response = await supabaseRequest(`/rest/v1/businesses?${query}`, { headers: bearerHeader(req.header("authorization")) });
  if (!response.ok) { res.status(response.status >= 500 ? 503 : response.status).json({ code: "MODULE_ACCESS_UNAVAILABLE", error: "No se pudo comprobar la disponibilidad del negocio." }); return false; }
  const rows: unknown = await response.json();
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0]?.id !== businessId || rows[0]?.booking_enabled !== true) {
    res.status(404).json({ code: "BUSINESS_UNAVAILABLE", error: "No se encontró un negocio disponible." }); return false;
  }
  if (bookingActivityEnabled(rows[0].ui_metadata?.category, serverModulePublication())) return true;
  const internal = await internalModuleAccess(req, res);
  if (internal === null) return false;
  if (!internal) { res.status(403).json({ code: "MODULE_NOT_ENABLED", error: "Este sector no está habilitado en esta versión." }); return false; }
  return true;
}
