import type { Request, Response } from "express";
import { bearerHeader, supabaseRequest } from "./supabase";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const unavailable = (res: Response) => res.status(503).json({ code: "MULTI_SERVICE_UNAVAILABLE", message: "La reserva de varios servicios aún no está habilitada en este servidor. No se ha creado ninguna reserva." });
const missingContract = (code: unknown) => ["PGRST202", "42883", "42703"].includes(String(code));

export async function bookingCapabilities(req: Request, res: Response) {
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) { res.status(401).json({ error: "Authorization bearer token is required" }); return; }
  const upstream = await supabaseRequest("/rest/v1/rpc/go_booking_contract", { method: "POST", headers: { ...bearerHeader(authorization), "Content-Type": "application/json" }, body: "{}" });
  const body = await upstream.json().catch(() => null) as { code?: string; version?: number; multiService?: boolean } | null;
  if (missingContract(body?.code)) { unavailable(res); return; }
  if (!upstream.ok) { res.status(upstream.status).json({ error: "Unable to verify booking contract" }); return; }
  if (body?.version !== 2 || body.multiService !== true) { unavailable(res); return; }
  res.json(body);
}

type Service = { id: string; business_id: string; name: string; duration_minutes: number; price: number | string | null; currency: string; active: boolean; ui_metadata?: { visible?: boolean; archived?: boolean } };

/** Inputs carry IDs, never trusted client prices. SQL repeats validation in the write transaction. */
export async function createServiceBooking(req: Request, res: Response, authorization: string, customerId: string) {
  const { business_id, service_id, service_ids, staff_id, starts_at, ends_at, notes, status, request_key } = req.body;
  if (!Array.isArray(service_ids) || !service_ids.length || service_ids.length > 32 ||
      service_ids.some((id: unknown) => typeof id !== "string" || !uuid.test(id)) ||
      new Set(service_ids).size !== service_ids.length || service_ids[0] !== service_id ||
      typeof request_key !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(request_key)) {
    res.status(400).json({ code: "INVALID_SERVICES", message: "Selecciona servicios únicos del mismo negocio y una referencia de reserva válida." }); return;
  }
  const query = new URLSearchParams({ id: `in.(${service_ids.join(",")})`, business_id: `eq.${business_id}`, active: "eq.true", select: "id,business_id,name,duration_minutes,price,currency,active,ui_metadata" });
  const servicesResponse = await supabaseRequest(`/rest/v1/services?${query}`, { headers: bearerHeader(authorization) });
  if (!servicesResponse.ok) { res.status(servicesResponse.status).json({ error: "Unable to validate services" }); return; }
  const services = await servicesResponse.json() as Service[];
  const selected = service_ids.map((id: string) => services.find(row => row.id === id));
  if (selected.some((row: Service | undefined) => !row || row.business_id !== business_id || !row.active || row.ui_metadata?.visible === false || row.ui_metadata?.archived || !Number.isInteger(row.duration_minutes) || row.duration_minutes <= 0)) {
    res.status(400).json({ code: "INVALID_SERVICES", message: "Algún servicio no está disponible en este negocio." }); return;
  }
  const duration = selected.reduce((sum: number, row: Service) => sum + row.duration_minutes, 0);
  if (new Set(selected.map((row: Service) => row.currency)).size !== 1 ||
      selected.some((row: Service) => row.price !== null && (!Number.isFinite(Number(row.price)) || Number(row.price) < 0)) ||
      Date.parse(ends_at) - Date.parse(starts_at) !== duration * 60000) {
    res.status(400).json({ code: "INVALID_SERVICE_TOTAL", message: "La duración o moneda no coincide con los servicios actuales. Revisa la selección." }); return;
  }
  const upstream = await supabaseRequest("/rest/v1/rpc/go_create_service_booking", {
    method: "POST", headers: { ...bearerHeader(authorization), "Content-Type": "application/json" },
    body: JSON.stringify({ p_business_id: business_id, p_service_ids: service_ids, p_staff_id: staff_id ?? null, p_starts_at: starts_at, p_ends_at: ends_at, p_notes: notes ?? null, p_status: status ?? "CONFIRMED", p_request_key: request_key }),
  });
  const body = await upstream.json().catch(() => null) as { code?: string; id?: string; customer_id?: string } | null;
  if (missingContract(body?.code)) { unavailable(res); return; }
  if (body?.code === "23P01" || upstream.status === 409) {
    res.status(409).json({ code: body?.code ?? "BOOKING_CONFLICT", error: "BOOKING_CONFLICT", message: "Ese intervalo ya no está disponible. Elige otra hora." }); return;
  }
  if (body?.code === "22023") { res.status(400).json({ code: "INVALID_BOOKING", message: "Los servicios, profesional u horario han cambiado. Revisa la reserva." }); return; }
  if (!upstream.ok) { res.status(upstream.status).json({ code: body?.code, error: "Unable to create service booking" }); return; }
  if (!body?.id || body.customer_id !== customerId) { res.status(502).json({ error: "Invalid service booking response" }); return; }
  res.status(201).json([body]);
}
