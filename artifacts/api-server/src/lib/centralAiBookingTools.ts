import { randomUUID } from "node:crypto";
import { bearerHeader, supabaseRequest } from "./supabase";
import { centralControl, centralBookingsEnabled, CentralAiError } from "./centralAiBudget";
import { CENTRAL_AI_TOOLS, canonicalBookingActivity } from "@workspace/api-zod";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const properties = {
  business_id: { type: "string" }, service_ids: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 8 },
  date: { type: "string", description: "Fecha local YYYY-MM-DD en el establecimiento" }, staff_id: { type: ["string", "null"] },
  time_from: {type:["string","null"],description:"Hora local HH:MM desde la que buscar; para 'por la tarde' usa 12:00. Null si el usuario no tiene preferencia."},
  time_to: {type:["string","null"],description:"Hora local HH:MM máxima solicitada; para 'por la mañana' usa 11:59, para 'por la tarde' usa 23:59. Null si no hay límite."},
};
const tool = (name: string, description: string, fields: object) => {
  if (!CENTRAL_AI_TOOLS.some(entry => entry.module === "bookings" && entry.name === name && entry.enabled)) throw new Error("Unregistered central tool");
  return { type: "function", name, description,
    strict: true, parameters: { type: "object", properties: fields, required: Object.keys(fields), additionalProperties: false } };
};
/** No execution tool: the model cannot confirm, cancel or write a booking. */
export const CENTRAL_BOOKING_TOOLS = [
  tool("read_catalog", "Busca establecimientos reales accesibles por nombre exacto, parcial o variante ortográfica. No devuelve un catálogo completo; distingue REAL de DEMO.", { query: { type: "string" } }),
  tool("read_services", "Consulta solo los servicios relevantes de un establecimiento real ya identificado. Usa query con el servicio pedido, por ejemplo corte. No inventes precios.", {business_id:{type:"string"},query:{type:"string"}}),
  tool("read_availability", "Consulta horarios reales para los servicios y la fecha indicados. No inventes huecos ni conviertas la hora local sin usar la zona devuelta.", properties),
  tool("prepare_booking", "Prepara una propuesta con un horario real elegido por el usuario. NO guarda una reserva: el usuario debe confirmarla después con el control de GO.", {
    ...properties, starts_at: { type: "string", description: "Copia exacta de startsAt devuelto por read_availability" },
  }),
];
export const CENTRAL_BOOKING_READ_TOOLS = CENTRAL_BOOKING_TOOLS.filter(entry => entry.name !== "prepare_booking");
type Row = Record<string, any>;
const normalized = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const oneEdit = (a:string,b:string) => {
  if (Math.abs(a.length-b.length)>1) return false;
  let i=0,j=0,edits=0;
  while(i<a.length&&j<b.length){if(a[i]===b[j]){i++;j++;continue;}
    if(++edits>1)return false;
    if(a.length>=b.length)i++;if(b.length>=a.length)j++;
  }
  return edits+a.length-i+b.length-j<=1;
};
export type CentralProposal = { id: string; summary: { business: string; services: string[]; startsAt: string; endsAt: string; total: number; currency: string; timezone: string } };

/** Existing GO routes remain the authority for catalogue publication, availability, quotes and writes. */
export async function centralGoApi(authorization: string | undefined, path: string, body?: object, signal?: AbortSignal): Promise<any> {
  const port = Number(process.env.PORT || 8080);
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !path.startsWith("/supabase/")) throw new Error("GO route invalid");
  const response = await fetch(`http://127.0.0.1:${port}/api${path}`, {
    method: body ? "POST" : "GET", redirect: "error",
    headers: { ...bearerHeader(authorization), "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: signal ?? AbortSignal.timeout(25000),
  });
  const result = await response.json().catch(() => null) as Record<string, any> | null;
  if (!response.ok) throw new CentralAiError("AI_GO_OPERATION_FAILED",
    typeof result?.error === "string" ? result.error : "GO no pudo comprobar la operación. No se confirma ningún guardado.", response.status >= 500 ? 503 : response.status);
  return result;
}

export function centralBookingTools(authorization: string | undefined, requestId: string, allowed: string[], signal: AbortSignal) {
  let proposal: CentralProposal | undefined;
  const businesses = async (): Promise<Row[]> => {
    const rows = await centralGoApi(authorization, "/supabase/businesses", undefined, signal);
    if (!Array.isArray(rows)) throw new Error("Invalid catalogue");
    return rows.filter(row => row.verified === true && row.booking_enabled === true
      && canonicalBookingActivity(row.ui_metadata?.category)==="peluqueria");
  };
  async function selection(args: Row) {
    if (!uuid.test(args.business_id) || !Array.isArray(args.service_ids)
      || args.service_ids.length < 1 || args.service_ids.length > 8 || !args.service_ids.every((id: unknown) => typeof id === "string" && uuid.test(id))
      || new Set(args.service_ids).size !== args.service_ids.length || typeof args.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)
      || args.staff_id !== null && (typeof args.staff_id !== "string" || !uuid.test(args.staff_id))
      || args.time_from != null && (typeof args.time_from!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time_from))) throw new Error("Revisa empresa, servicios, fecha y profesional.");
    if (args.time_to != null && (typeof args.time_to!=="string"||!/^([01]\d|2[0-3]):[0-5]\d$/.test(args.time_to))) throw new Error("Revisa el límite horario.");
    const business = (await businesses()).find(row => row.id === args.business_id);
    if (!business) throw new Error("Establecimiento no disponible.");
    const services: Row[] = await centralGoApi(authorization, `/supabase/businesses/${business.id}/services`, undefined, signal);
    if (!Array.isArray(services) || args.service_ids.some((id: string) => !services.some(row => row.id === id && row.active === true)))
      throw new Error("Servicio no disponible en ese establecimiento.");
    const quote = await centralGoApi(authorization, "/supabase/catalog/quote", { businessId: business.id, rootIds: args.service_ids, selectedIds: [] }, signal);
    if (quote?.ready !== true || !Array.isArray(quote.serviceIds) || !quote.serviceIds.length
      || !Array.isArray(quote.lines) || !quote.lines.length || quote.lines.some((line:Row)=>typeof line?.name!=="string")
      || !Number.isFinite(Number(quote.totalPrice)) || Number(quote.totalPrice)<0
      || typeof quote.currency!=="string" || !/^[A-Z]{3}$/.test(quote.currency))
      throw new Error("La selección requiere completar sus opciones en el flujo de reservas de GO.");
    const query = new URLSearchParams({ business_id: business.id, service_ids: quote.serviceIds.join(","), dateISO: args.date, days: "1", step_minutes: "15" });
    if (args.staff_id) query.set("staff_id", args.staff_id);
    const availability = await centralGoApi(authorization, `/supabase/booking-availability?${query}`, undefined, signal);
    if (!Array.isArray(availability?.slots) || typeof availability.timezone !== "string") throw new Error("No se pudo comprobar la disponibilidad.");
    return { business, quote, availability };
  }
  return {
    get proposal() { return proposal; },
    async run(name: string, raw: string) {
      if (name === "prepare_booking" && !centralBookingsEnabled()) throw new CentralAiError("AI_BOOKINGS_DISABLED", "La ejecución de reservas no está habilitada.");
      const args = JSON.parse(raw) as Row;
      if (!args || typeof args !== "object" || Array.isArray(args)) throw new Error("Argumentos inválidos");
      if (name === "read_catalog") {
        if (Object.keys(args).some(key => key !== "query") || typeof args.query !== "string" || args.query.length > 120) throw new Error("Búsqueda inválida");
        const query = normalized(args.query), terms = query.split(" ").filter(term => term.length > 1 && !["peluqueria","salon","de","la","el","en"].includes(term));
        const ranked = (await businesses()).map(row => { const name = normalized(String(row.name ?? ""));
          const nameTerms=name.split(" ");
          const score = !query ? 4 : name === query ? 0 : name.includes(query) ? 1
            : terms.length && terms.every(term => name.includes(term)) ? 2
            : terms.length && terms.every(term => term.length>=4&&nameTerms.some(word=>oneEdit(term,word))) ? 3 : 99;
          return { row, score };
        }).filter(match => match.score < 99).sort((a,b) => a.score-b.score || String(a.row.name).localeCompare(String(b.row.name)));
        const rows = ranked[0]?.score === 0 ? [ranked[0].row] : ranked.slice(0,3).map(match => match.row);
        return { source:"REAL", moreMatches:ranked.length>rows.length,
          businesses:rows.map(row=>({id:row.id,name:row.name,timezone:row.timezone})) };
      }
      if(name==="read_services"){
        if(Object.keys(args).some(key=>!["business_id","query"].includes(key))||typeof args.business_id!=="string"||!uuid.test(args.business_id)
          ||typeof args.query!=="string"||args.query.length>80)throw new Error("Búsqueda de servicio inválida");
        const business=(await businesses()).find(row=>row.id===args.business_id);
        if(!business)throw new Error("Establecimiento no disponible.");
        const services:Row[]=await centralGoApi(authorization,`/supabase/businesses/${business.id}/services`,undefined,signal);
        if(!Array.isArray(services))throw new Error("Catálogo no disponible.");
        const query=normalized(args.query),terms=query.split(" ").filter(Boolean);
        const matching=services.filter(row=>row.active===true&&(!query||terms.every(term=>normalized(String(row.name??"")).includes(term))));
        return {source:"REAL",businessId:business.id,moreServices:matching.length>6,
          services:matching.slice(0,6).map(row=>({id:row.id,name:row.name,durationMinutes:row.duration_minutes,price:row.price,currency:row.currency}))};
      }
      if (!["read_availability", "prepare_booking"].includes(name)
        || Object.keys(args).some(key => ![...Object.keys(properties), ...(name === "prepare_booking" ? ["starts_at"] : [])].includes(key))) throw new Error("Herramienta no autorizada");
      if (name === "prepare_booking" && !allowed.includes(args.business_id)) throw new Error("La preparación de reservas está limitada a establecimientos autorizados.");
      const { business, quote, availability } = await selection(args);
      if (name === "read_availability") {
        const localTime=new Intl.DateTimeFormat("en-GB",{timeZone:availability.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"});
        const slots=availability.slots.filter((slot:Row)=>{
          const time=localTime.format(new Date(slot.startsAt));return (!args.time_from||time>=args.time_from)&&(!args.time_to||time<=args.time_to);
        }).sort((a:Row,b:Row)=>Date.parse(a.startsAt)-Date.parse(b.startsAt));
        const available=slots.filter((slot:Row)=>Date.parse(slot.startsAt)>Date.now());
        return { source:"REAL", business:String(business.name), services:quote.lines?.map((line:Row)=>String(line.name)).slice(0,8)??[], timezone: availability.timezone, date: args.date,
          recommended:available[0]?{startsAt:available[0].startsAt,endsAt:available[0].endsAt,staffId:available[0].staffId}:null,
          slots: available.slice(0, 5).map((slot: Row) => ({ startsAt: slot.startsAt, endsAt: slot.endsAt, staffId: slot.staffId })),
          moreSlotsAvailable: available.length > 5, total: quote.totalPrice, currency: quote.currency, reservationCreated:false };
      }
      if (typeof args.starts_at !== "string" || !/(Z|[+-]\d{2}:\d{2})$/.test(args.starts_at)) throw new Error("Selecciona un horario real.");
      const plan = availability.slots.find((slot: Row) => Date.parse(slot.startsAt) === Date.parse(args.starts_at));
      if (!plan || quote.totalPrice === null || quote.totalPrice === undefined || quote.totalPrice === ""
        || !Number.isFinite(Number(quote.totalPrice)) || Number(quote.totalPrice)<0 || !Array.isArray(quote.lines)
        || typeof quote.currency!=="string" || !/^[A-Z]{3}$/.test(quote.currency)) throw new Error("El horario o el precio no se pudo comprobar. Consulta otra vez.");
      const id = randomUUID();
      const summary = { business: String(business.name), services: quote.lines.map((line: Row) => String(line.name)),
        startsAt: String(plan.startsAt), endsAt: String(plan.endsAt), total: Number(quote.totalPrice), currency: String(quote.currency), timezone: availability.timezone };
      const command = { business_id: business.id, root_ids: args.service_ids, selected_ids: [], starts_at: plan.startsAt,
        staff_id: args.staff_id, request_key: "central_" + id, expected_quote: quote, expected_plan: plan, ends_at: plan.endsAt };
      await centralControl(authorization, "prepare", { id, requestId, command, summary });
      proposal = { id, summary };
      return { proposal, reservationCreated: false, requiresExplicitConfirmationInGo: true };
    },
  };
}

export async function confirmCentralBooking(authorization: string | undefined, id: string) {
  if (!centralBookingsEnabled()) throw new CentralAiError("AI_BOOKINGS_DISABLED", "Las herramientas de reserva no están habilitadas.");
  const saved = await centralControl(authorization, "claim", { id });
  if (saved.status === "submitted") return { bookingId: saved.bookingId, status: saved.bookingStatus };
  // This call uses the original caller JWT. RLS, availability, quote, admission and
  // the existing durable GO request key are all enforced by the canonical engine.
  let rows;
  try { rows = await centralGoApi(authorization, "/supabase/bookings/catalog", saved.command); }
  catch (error) {
    // A definite canonical 4xx rejects the transaction. A timeout/5xx keeps the
    // submitting command immutable: it may already have committed.
    if (error instanceof CentralAiError && error.status >= 400 && error.status < 500)
      await centralControl(authorization, "rejected", { id });
    throw error;
  }
  const row = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (!row || typeof row.id !== "string" || !uuid.test(row.id) || !["PENDING", "CONFIRMED"].includes(row.status))
    throw new CentralAiError("AI_BOOKING_RESULT_UNKNOWN", "No se pudo comprobar el resultado. Reintenta la misma propuesta para consultar su resultado sin duplicarla.");
  await centralControl(authorization, "submitted", { id, bookingId: row.id, bookingStatus: row.status });
  return { bookingId: row.id, status: row.status };
}
