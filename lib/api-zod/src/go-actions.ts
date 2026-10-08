import { z } from "zod";
import { bookingRequestSchema, emptyBookingRequest, normalizeBookingText, parseBookingRequest } from "./booking-assistant";

import { stripGoAddress, taskClock } from "./task-creation";

const personalKinds = ["event", "task", "note", "list"] as const;
const kinds = ["booking", ...personalKinds, "followup", "unknown"] as const;
const operations = ["create", "read", "update", "delete"] as const;
const clearable = ["date", "time", "place", "detail", "durationMinutes"] as const;
export const goActionSchema = z.object({
  kind: z.enum(kinds),
  source: z.string().trim().min(1).max(2000),
  operation: z.enum(operations),
  targetQuery: z.string().trim().min(1).max(200).nullable(),
  title: z.string().trim().min(1).max(200).nullable(),
  date: bookingRequestSchema.shape.date,
  time: bookingRequestSchema.shape.timeFrom,
  place: z.string().trim().min(1).max(200).nullable(),
  detail: z.string().max(2000).nullable(),
  durationMinutes: z.number().int().min(1).max(1440).nullable(),
  clearFields: z.array(z.enum(clearable)).max(5),
  completed: z.boolean().nullable(),
  listOperation: z.enum(["create", "add", "remove", "read"]).nullable(),
  items: z.array(z.string().trim().min(1).max(200)).max(60),
  beforeBooking: z.boolean(),
}).strict();
export type GoAction = z.infer<typeof goActionSchema>;
export const goPlanSchema = z.object({ actions: z.array(goActionSchema).min(1).max(4) }).strict();
export type GoPlan = z.infer<typeof goPlanSchema>;
export const goContextSchema = z.object({
  active: z.enum(["booking", ...personalKinds]).nullable(),
  pending: goActionSchema.nullable(),
  selected: z.object({ kind: z.enum(personalKinds), title: z.string().trim().min(1).max(200) }).strict().nullable(),
  listTitle: z.string().max(200).nullable(),
  bookingDate: bookingRequestSchema.shape.date,
  bookingTime: bookingRequestSchema.shape.timeFrom,
}).strict();
export type GoContext = z.infer<typeof goContextSchema>;
export const emptyGoContext = (): GoContext => ({
  active: null, pending: null, selected: null, listTitle: null, bookingDate: null, bookingTime: null,
});
export const emptyGoAction = (source: string, kind: GoAction["kind"] = "unknown"): GoAction => ({
  kind, source, operation: "create", targetQuery: null, title: null, date: null, time: null,
  place: null, detail: null, durationMinutes: null, clearFields: [], completed: null,
  listOperation: null, items: [], beforeBooking: false,
});
const weekdays = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
const temporal = /\b(?:pasado ma[ñn]ana|hoy|ma[ñn]ana|(?:el |este |pr[oó]ximo )?(?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|a las? \d{1,2}(?::\d{2})?(?: de la (?:ma[ñn]ana|tarde|noche))?|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?)\b/gi;
const taskSignal = /\b(?:recuerdame|recordarme|tengo que|necesito hacer|tarea|pendiente)\b/;
const bookingSignal = /\b(?:reserva[rmselo]*|busca[rme]*|necesito (?:una? )?(?:peluqueria|fisioterapia|cita)|quiero (?:una? )?(?:peluqueria|fisioterapia|cita))\b/;
const querySignal = /^(?:muestra(?:me)?|ensena(?:me)?|consulta(?:r)?|ver|ve(?:r)? (?:mis|las)|abre|abrir|lee|leer|busca(?:me)?|que (?:tengo|hay|pone|dice)|cuales son)\b/;
const updateSignal = /^(?:cambia(?:me|la|lo)?|modifica(?:me|la|lo)?|mueve(?:me|la|lo)?|pasa(?:me|la|lo)?|actualiza|renombra|reprograma|completa|termina|marca|reabre|quita(?:le)? (?:la|el) (?:hora|fecha|lugar|duracion)|deja(?:la|lo)? sin)\b/;
const deleteSignal = /^(?:borra(?:me|la|lo)?|elimina(?:me|la|lo)?|suprime|cancela(?:me|la|lo)?)\b/;
const trimText = (text: string) => text.replace(/^[\s:,"“”]+|[\s.!?,"“”]+$/g, "").trim();
function fields(text: string, today: string) {
  // Time-of-day words never turn "a las 9 de la mañana" into tomorrow.
  const parsed = parseBookingRequest(text.replace(/de la ma[ñn]ana/gi, ""), emptyBookingRequest(), today);
  const n = normalizeBookingText(text);
  const day = weekdays.findIndex(d => new RegExp("\\b" + d + "\\b").test(n));
  const base = new Date(today + "T12:00:00Z");
  if (day === base.getUTCDay() && !/proximo|siguiente/.test(n)) parsed.date = today;
  let time = parsed.timeFrom === parsed.timeTo ? parsed.timeFrom : null;
  const spoken = taskClock(text);
  const exact = n.match(/(?:a las?\s+|^)(\d{1,2})(?::(\d{2}))?(?:\s*h(?:oras?)?)?(?:\s+de la (manana|tarde|noche))?(?=$|\s|[.,])/);
  if (exact && (/\ba las?\b|^\d{1,2}:\d{2}$/.test(n))) {
    let hour = Number(exact[1]);
    if (hour < 12 && /tarde|noche/.test(exact[3] || "")) hour += 12;
    const candidate = String(hour).padStart(2, "0") + ":" + (exact[2] || "00");
    time = bookingRequestSchema.shape.timeFrom.safeParse(candidate).success ? candidate : null;
  }
  if (spoken.matched) time = spoken.time;
  const duration = n.match(/\b(?:durante|duracion (?:de )?)\s*(\d{1,3})\s*(minutos?|horas?)\b/);
  const durationMinutes = duration ? Number(duration[1]) * (/hora/.test(duration[2]) ? 60 : 1) : null;
  return { date: parsed.date, time, durationMinutes: durationMinutes && durationMinutes <= 1440 ? durationMinutes : null };
}
function listName(text: string): string | null {
  const match = text.match(/\blista(?:\s+(?:llamada|titulada|con nombre))?\s+(?:(?:de|del|para)\s+)?(.+?)(?=\s+con\s+|[.!?]?$)/i);
  if (!match) return null;
  const name = trimText(match[1]).replace(/^(?:la|el|los|las)\s+/i, "").trim();
  return name && !/^(?:esta|esa|mi|mis)$/i.test(name) ? "Lista de " + name : null;
}
export const normalizeListName = (name: string) => normalizeBookingText(name)
  .replace(/^lista\s*(?:de|del|para)?\s*(?:la |el |los |las )?/, "").trim();
export const splitListItems = (text: string) => text
  .split(/\s*,\s*|\s*;\s*|\s+y\s+|\n/).map(trimText).filter(Boolean).slice(0, 60);
function explicitKind(n: string): GoAction["kind"] | null {
  if (/\blistas?\b/.test(n)) return "list";
  if (/\bnotas?\b/.test(n)) return "note";
  if (/\btareas?\b/.test(n)) return "task";
  if (/\b(?:eventos?|calendario|agenda|actividades|compromisos?)\b/.test(n)) return "event";
  return null;
}
function target(text: string): string | null {
  const afterKind = text.replace(/^.*?\b(?:tarea|nota|evento|actividad|compromiso)\s*/i, "");
  if (afterKind === text) return null;
  return trimText(afterKind.replace(/^(?:llamada|titulado|titulada|de)\s+/i, "")
    .split(/\s+(?:para|al|a las?|a mañana|a hoy|a pasado|a (?:lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)|como|con (?:el )?(?:t[ií]tulo|texto|detalle))\b/i)[0]) || null;
}
function createTitle(text: string): string | null {
  const clock = taskClock(text);
  const value = trimText((clock.matched ? text.replace(clock.matched, "") : text)
    .replace(/^(?:y )?(?:recu[eé]rdame|ap[uú]ntame|apunta que|apunta|ponme|crea(?:me)? (?:una? )?(?:tarea|evento|actividad|compromiso))\s*/i, "")
    .replace(temporal, "")
    .replace(/\b(?:antes (?:del?|de la)|esta semana)\b/gi, "")
    .replace(/\b(?:durante|duraci[oó]n (?:de )?)\s*\d+\s*(?:minutos?|horas?)\b/gi, "")
    .replace(/^(?:(?:que|tengo que|tengo|el|para|a las?)\s+)+/i, "")
    .replace(/\s+/g, " "));
  return value && !/^(?:una? (?:tarea|evento)|antes|sin hora|sin fecha|a las?|\d{1,2}:\d{2})$/i.test(value) ? value.slice(0, 200) : null;
}
function extractPlace(text: string): string | null {
  const source = /\b(?:voy|llevo|viajo|ir|llevar)\b/i.test(text) ? text : text.replace(/\ba\s+(?=[A-ZÁÉÍÓÚÑ])/gu, "con ");
  return source.match(/(?:\ben|\ba)\s+([A-ZÁÉÍÓÚÑ][\p{L}]+(?:\s+(?:de(?:l)?|la|[A-ZÁÉÍÓÚÑ][\p{L}]+)){0,4})(?=\s+a las|[,.!?]|$)/u)?.[1]?.trim() || null;
}
function finish(action: GoAction): GoPlan { return { actions: [goActionSchema.parse(action)] }; }

/** Conservative offline extraction. Ambiguous requests never become speculative writes. */
export function parseGoPlan(text: string, context: GoContext, today: string): GoPlan {
  const clean = trimText(stripGoAddress(text));
  const n = normalizeBookingText(clean).replace(/^y /, "");
  const action = emptyGoAction(clean || "?");
  // Apply before splitting, so "no reserves X y..." cannot hide a negation.
  if (/^(?:no|nunca|tampoco|olvida(?:lo)?|cancelar|para|detente)\b/.test(n)) return finish(action);
  const pieces = clean.split(/\s+(?:y|adem[aá]s)\s+(?=(?:recu[eé]rdame|apunta que|crea (?:una? )?(?:tarea|nota|evento)|a[ñn]ade .+ a la lista|reserva(?:me)? ))/i);
  if (pieces.length > 1) return {
    actions: pieces.slice(0, 4).flatMap(piece => parseGoPlan(piece, { ...context, pending: null }, today).actions).slice(0, 4),
  };
  const namedKind = explicitKind(n);
  const querying = querySignal.test(n);
  const updating = updateSignal.test(n);
  const deleting = deleteSignal.test(n);
  const selectedKind = context.selected?.kind;
  const kindForOperation = namedKind || selectedKind || (querying && /\bque tengo\b/.test(n) ? "event" : null);
  // List item removal is distinct from deleting the whole note/list.
  const listItemRemoval = /^(?:quita|saca|borra|elimina)\s+(?!(?:(?:la|mi|esta|esa|una)\s+)?lista\b)/.test(n)
    && (namedKind === "list" || context.active === "list");
  const isList = namedKind === "list"
    || ((context.active === "list" || context.pending?.kind === "list") && /^(?:apunta|anade|agrega|quita|saca|muestra|ver|lee)\b/.test(n))
    || (context.pending?.kind === "list" && !namedKind && !taskSignal.test(n) && !bookingSignal.test(n));
  if (isList && !(deleting && !listItemRemoval) && !updating) {
    const pending = context.pending?.kind === "list" ? context.pending : null;
    action.kind = "list";
    action.title = listName(clean) || pending?.title || context.listTitle
      || (selectedKind === "list" ? context.selected!.title : null);
    action.listOperation = listItemRemoval || /^(?:quita|saca)\b/.test(n) ? "remove"
      : querying ? "read"
      : /^(?:haz|hazme|crea|creame|prepara|preparame|quiero)\b/.test(n) ? "create"
      : pending?.listOperation || "add";
    action.operation = action.listOperation === "read" ? "read" : action.listOperation === "create" ? "create" : "update";
    if (pending && !pending.title && !/\blista\b/.test(n)) {
      action.title = "Lista de " + clean.replace(/^(?:de |del |la |el )+/i, "").split(/\s+con\s+/i)[0];
      action.items = [...pending.items];
    }
    if (action.listOperation === "create") {
      const items = clean.match(/\scon\s+(.+)$/i);
      if (items) action.items = splitListItems(items[1]);
    } else if (action.listOperation !== "read") {
      const itemText = clean.replace(/^(?:y )?(?:apunta|a[ñn]ade|agrega|quita|elimina|borra|saca)\s+/i, "")
        .replace(/\s+(?:a|en|de)\s+(?:la |mi |esta )?lista.*$/i, "");
      action.items = itemText !== clean || (pending?.title && !pending.items.length)
        ? splitListItems(itemText) : [...(pending?.items || [])];
    }
    action.targetQuery = action.operation === "create" ? null : action.title;
    return finish(action);
  }
  if ((querying || updating || deleting) && kindForOperation && kindForOperation !== "booking") {
    action.kind = kindForOperation;
    action.operation = deleting ? "delete" : updating ? "update" : "read";
    action.targetQuery = action.kind === "list" ? listName(clean) : target(clean);
    if (!action.targetQuery && !/\b(?:mis|las|los|todas|todos)\b/.test(n)) action.targetQuery = context.selected?.title || null;
    Object.assign(action, fields(clean, today));
    action.place = extractPlace(clean);
    if (action.kind === "list") action.listOperation = action.operation === "read" ? "read" : null;
    if (action.kind === "task" && /\b(?:completa|termina|completad[ao]|hech[ao]|terminad[ao])\b/.test(n)) action.completed = true;
    if (action.kind === "task" && /\b(?:reabre|pendiente|sin hacer)\b/.test(n)) action.completed = false;
    const renamed = clean.match(/(?:t[ií]tulo|nombre)\s+(?:a\s+)?[:"“]?\s*(.+)$/i)
      || clean.match(/^renombra .+?\s+(?:a|como)\s+(.+)$/i);
    if (renamed) action.title = trimText(renamed[1]).slice(0, 200) || null;
    const detail = clean.match(/(?:texto|detalle|contenido)\s+(?:a\s+)?[:"“]?\s*(.+)$/i);
    if (detail) action.detail = trimText(detail[1]).slice(0, 2000);
    for (const [word, field] of [["fecha", "date"], ["hora", "time"], ["lugar", "place"], ["detalle", "detail"], ["duracion", "durationMinutes"]] as const) {
      if (new RegExp("\\b(?:sin " + word + "|quita(?:le)? (?:la|el) " + word + "|borra (?:la|el) " + word + ")\\b").test(n)) action.clearFields.push(field);
    }
    return finish(action);
  }
  if (deleting || updating) return finish(action);
  const explicitTask = taskSignal.test(n);
  const explicitBooking = !explicitTask && bookingSignal.test(n);
  if (explicitBooking) return finish({ ...action, kind: "booking" });
  if (namedKind === "note" || context.pending?.kind === "note") {
    action.kind = "note";
    const pending = context.pending?.kind === "note" ? context.pending : null;
    const body = clean.replace(/^(?:(?:crea|creame|guarda|escribe|apunta|haz|hazme|anota)\s+)?(?:(?:una|la)\s+)?nota(?:\s+(?:llamada|titulada|sobre|de|que diga))?\s*/i, "");
    const parts = body.match(/^(.+?)\s*:\s*(.*)$/);
    action.title = parts ? trimText(parts[1]).slice(0, 200) : pending?.title || trimText(body).slice(0, 200) || null;
    action.detail = parts ? trimText(parts[2]) : pending?.detail || null;
    if (action.title && /^(?:una? nota)$/i.test(action.title)) action.title = null;
    return finish(action);
  }
  const extracted = fields(clean, today);
  const eventSignal = /\b(?:tengo (?:una? )?(?:reunion|cita|dentista)|reunion|llevo|evento|calendario|apunta que|actividad|compromiso)\b/.test(n);
  if (explicitTask || eventSignal || context.pending) {
    const pending = context.pending;
    const kind = explicitTask ? "task" : eventSignal ? "event" : pending!.kind;
    Object.assign(action, { kind, ...extracted });
    action.title = createTitle(clean);
    action.place = extractPlace(clean);
    action.beforeBooking = /\bantes\b/.test(n) && !/antes (?:del?|de la) (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d)/.test(n) && !!context.bookingDate;
    if (/\b(?:antes|esta semana)\b/.test(n)) {
      action.detail = clean;
      action.date = null;
    }
    if (pending && !explicitTask && !eventSignal) {
      Object.assign(action, {
        ...pending, source: clean,
        title: pending.title || action.title,
        date: action.date || pending.date,
        time: action.time || pending.time,
        place: action.place || pending.place,
        durationMinutes: action.durationMinutes || pending.durationMinutes,
        detail: action.detail || pending.detail,
      });
    }
    return finish(action);
  }
  if (context.active === "booking") action.kind = "followup";
  return finish(action);
}

// Deliberately contains no executable tool, catalogue IDs or storage keys.
const nullableText = { type: ["string", "null"] };
export const goPlanJsonSchema = {
  type: "object", additionalProperties: false, required: ["actions"],
  properties: { actions: { type: "array", minItems: 1, maxItems: 4, items: {
    type: "object", additionalProperties: false,
    required: Object.keys(emptyGoAction("x")),
    properties: {
      kind: { type: "string", enum: kinds },
      source: { type: "string" }, operation: { type: "string", enum: operations },
      targetQuery: nullableText, title: nullableText, date: nullableText, time: nullableText,
      place: nullableText, detail: nullableText, durationMinutes: { type: ["integer", "null"] },
      clearFields: { type: "array", items: { type: "string", enum: clearable } },
      completed: { type: ["boolean", "null"] },
      listOperation: { type: ["string", "null"], enum: ["create", "add", "remove", "read", null] },
      items: { type: "array", items: { type: "string" } }, beforeBooking: { type: "boolean" },
    },
  } } },
};
