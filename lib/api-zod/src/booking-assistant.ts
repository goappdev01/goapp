import { z } from "zod";

const shortText = z.string().trim().min(1).max(200).nullable();
const time = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
  .nullable();
export const bookingRequestSchema = z
  .object({
    serviceQuery: shortText,
    businessQuery: shortText,
    staffQuery: shortText,
    placeQuery: shortText,
    radiusKm: z.number().finite().positive().nullable(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const d = new Date(value + "T12:00:00Z");
        return (
          Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value
        );
      })
      .nullable(),
    timeFrom: time,
    timeTo: time,
  })
  .strict();
export type BookingRequest = z.infer<typeof bookingRequestSchema>;
export type AwaitingField =
  "serviceQuery" | "placeQuery" | "date" | "staffQuery" | null;
export const emptyBookingRequest = (): BookingRequest => ({
  serviceQuery: null,
  businessQuery: null,
  staffQuery: null,
  placeQuery: null,
  radiusKm: null,
  date: null,
  timeFrom: null,
  timeTo: null,
});
export const normalizeBookingText = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

/** Offline fallback: explicit Spanish fields only, never catalogue facts or writes. */
export function parseBookingRequest(
  text: string,
  previous: BookingRequest,
  today: string,
  awaiting: AwaitingField = null,
): BookingRequest {
  const next = { ...previous };
  const clean = text.trim().replace(/[.!?]+$/, "");
  const n = normalizeBookingText(clean);
  const radius = n.match(
    /(?:^|[^\d-])(\d+(?:[.,]\d+)?)\s*(kilometros?|km|metros?|m)\b/,
  );
  if (radius) {
    const km =
      Number(radius[1].replace(",", ".")) /
      (/^(m|metro)/.test(radius[2]) ? 1000 : 1);
    if (km > 0) next.radiusKm = km;
  }
  const base = new Date(today + "T12:00:00Z");
  const dateText = n.replace(/por la manana/g, "");
  const relative = /\bpasado manana\b/.test(dateText)
    ? 2
    : /\bmanana\b/.test(dateText)
      ? 1
      : /\bhoy\b/.test(dateText)
        ? 0
        : null;
  const iso = n.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  const numericDate = n.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{4}))?\b/);
  const weekdays = [
    "domingo",
    "lunes",
    "martes",
    "miercoles",
    "jueves",
    "viernes",
    "sabado",
  ];
  const weekday = weekdays.findIndex((day) =>
    new RegExp("\\b" + day + "\\b").test(n),
  );
  if (iso) next.date = iso[1];
  else if (numericDate)
    next.date =
      (numericDate[3] ?? today.slice(0, 4)) +
      "-" +
      numericDate[2].padStart(2, "0") +
      "-" +
      numericDate[1].padStart(2, "0");
  else if (relative !== null) {
    base.setUTCDate(base.getUTCDate() + relative);
    next.date = base.toISOString().slice(0, 10);
  } else if (weekday >= 0) {
    base.setUTCDate(
      base.getUTCDate() + ((weekday - base.getUTCDay() + 7) % 7 || 7),
    );
    next.date = base.toISOString().slice(0, 10);
  }
  if (/\bpor la tarde\b/.test(n)) {
    next.timeFrom = "16:00";
    next.timeTo = "21:00";
  }
  if (/\bpor la manana\b/.test(n)) {
    next.timeFrom = "08:00";
    next.timeTo = "14:00";
  }
  if (/\bpor la noche\b/.test(n)) {
    next.timeFrom = "21:00";
    next.timeTo = "23:59";
  }
  if (/\bcualquier hora\b/.test(n)) {
    next.timeFrom = null;
    next.timeTo = null;
  }
  const range = n.match(
    /(?:de|entre)\s+(\d{1,2})(?::(\d{2}))?\s*(?:a|y|hasta|[-–])\s*(\d{1,2})(?::(\d{2}))?/,
  );
  const exactTime =
    n.match(/\ba las?\s+(\d{1,2})(?::(\d{2}))?\b/) ??
    n.match(/^\s*(\d{1,2}):(\d{2})\s*$/);
  const hhmm = (h: string, m = "00") => h.padStart(2, "0") + ":" + m;
  if (range) {
    next.timeFrom = hhmm(range[1], range[2]);
    next.timeTo = hhmm(range[3], range[4]);
  } else if (exactTime) {
    next.timeFrom = hhmm(exactTime[1], exactTime[2]);
    next.timeTo = next.timeFrom;
  }
  const boundary =
    /\s+(?:hoy|mañana|pasado mañana|(?:el\s+)?(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)|por la|a las?|a menos de|a\s+\d|dentro de|con un radio|en un radio|menos de|con\s+(?!un radio))\b/i;
  const place = clean.match(
    /(?:\ben\s+(?!un radio)|\bcerca (?:de|del)\s+)(.+)/i,
  );
  if (place)
    next.placeQuery = place[1]
      .split(boundary)[0]
      .replace(/[,;]+$/, "")
      .trim();
  else if (awaiting === "placeQuery" && !radius)
    next.placeQuery = clean
      .replace(/^(?:en|cerca de)\s+/i, "")
      .split(boundary)[0]
      .trim();
  const explicitService =
    /^(?:quiero|necesito|busca(?:r|me)?|reserva(?:r|me)?|me gustaría)\b/i.test(
      clean,
    );
  const service = clean
    .replace(
      /^(?:quiero|necesito|busca(?:r|me)?|reserva(?:r|me)?|me gustaría)\s+/i,
      "",
    )
    .replace(/^(?:reservar|buscar|una?|cita\s+(?:para|de))\s+/i, "")
    .replace(/^(?:una?)\s+/i, "")
    .split(
      /\s+(?:en|cerca de|hoy|mañana|pasado mañana|(?:el\s+)?(?:lunes|martes|miércoles|jueves|viernes|sábado|domingo)|por la|a las?|a menos de|con)\b/i,
    )[0]
    .trim();
  const nonService =
    /^(?:(?:si|sí|no|confirmo|confirmar|vale|lunes|martes|miércoles|jueves|viernes|sábado|domingo|hoy|manana|pasado|en|por|a)\b|\d)/i.test(
      n,
    );
  if (
    (awaiting === "serviceQuery" ||
      !previous.serviceQuery ||
      explicitService) &&
    service &&
    !nonService
  )
    next.serviceQuery = service;
  const professional = clean.match(
    /\bcon\s+(?!(?:un radio|radio|una distancia)\b)(?:(?:el|la)\s+(?:profesional|peluquero|peluquera)\s+)?(.+)/i,
  );
  if (professional) next.staffQuery = professional[1].split(boundary)[0].trim();
  if (awaiting === "staffQuery") next.staffQuery = clean;
  if (/cualquiera|sin preferencia/i.test(next.staffQuery || ""))
    next.staffQuery = null;
  // Invalid individual fields never erase valid information from the same utterance.
  for (const key of Object.keys(next) as (keyof BookingRequest)[]) {
    if (!bookingRequestSchema.shape[key].safeParse(next[key]).success)
      Object.assign(next, { [key]: null });
  }
  return next;
}

export type SearchZone = {
  label: string;
  latitude: number;
  longitude: number;
  radiusKm: number;
  source: "manual" | "gps" | "conversation";
};
export const searchZoneSchema = z.object({
  label: z.string().min(1).max(300),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  radiusKm: z.number().finite().positive(),
  source: z.enum(["manual", "gps", "conversation"]),
});
export function distanceKm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.latitude - a.latitude) * r) / 2) ** 2 +
    Math.cos(a.latitude * r) *
      Math.cos(b.latitude * r) *
      Math.sin(((b.longitude - a.longitude) * r) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export type DockPosition = "left" | "center" | "right";
export function bookingDockOrder(position: DockPosition): string[] {
  const controls = ["menu", "attach", "actions", "zone"];
  controls.splice(
    position === "left" ? 0 : position === "center" ? 2 : 4,
    0,
    "go",
  );
  return controls;
}
