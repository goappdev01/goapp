import type { GoEntry } from "@/components/AgendaOperativa";

/** Suppress only known development placeholders, never legitimate catalogue names. */
export function entryIdentity(value?: string): string {
  const name = value?.trim() ?? "";
  return /^(?:Cliente DEMO local|Reserva DEMO)$/i.test(name) ? "" : name;
}

/** Existing GO national-number convention is Spain; explicit international prefixes win. */
export function entryPhone(value?: string | null): string | null {
  if (!value || !/^(?:\+|00)?[\d\s().-]+$/.test(value.trim())) return null;
  const international = /^(?:\+|00)/.test(value.trim());
  let digits = value.replace(/\D/g, "");
  if (value.trim().startsWith("00")) digits = digits.slice(2);
  if (!international && digits.length === 9) digits = "34" + digits;
  return /^[1-9]\d{7,14}$/.test(digits) && !/^(\d)\1+$/.test(digits) ? digits : null;
}

export function entryCommunication(entry: GoEntry) {
  const phone = entryPhone(entry.phone);
  const whatsapp = entryPhone(entry.whatsapp || entry.phone);
  return { call: phone ? `tel:+${phone}` : null, whatsapp: whatsapp ? `https://wa.me/${whatsapp}` : null };
}

export function entryIsInternal(entry: GoEntry): boolean {
  if (entry.customerBooking || entry.businessBooking || entry.kind === "received" || entry.recipients?.length) return false;
  if (entry.direction === "incoming" || entry.direction === "outgoing") return false;
  return ["TAREA_INTERNA", "GO_INTERNO"].includes(entry.type ?? "")
    || entry.type === "TAREA" && (entry.direction === "self" || !entry.phone?.trim() && !entry.contactName?.trim());
}

export function entryHeading(entry: GoEntry, unknown: string): string {
  return entryIdentity(entry.contactName) || (entry.customerBooking || entry.businessBooking || entry.bookingPerspective ? unknown
    : entryIdentity(entry.notes) || entry.intentLabel || unknown);
}

/**
 * Format the canonical calendar date without interpreting a local YYYY-MM-DD
 * as a device-zone instant. Booking projections already derive dateISO from
 * the business timezone, so retaining that wall date avoids day shifts around
 * UTC and daylight-saving boundaries.
 */
export function formatBookingLocalDate(dateISO?: string, fallback?: string, lang = "es", timezone?: string, instant?: string): string {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateISO ?? "");
  let year: number, month: number, day: number, weekday: string;
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]);
    const wallDate = new Date(Date.UTC(year, month - 1, day, 12));
    if (wallDate.getUTCFullYear() !== year || wallDate.getUTCMonth() !== month - 1 || wallDate.getUTCDate() !== day) return fallback?.trim() ?? "";
    weekday = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { weekday: "short", timeZone: "UTC" }).format(wallDate);
  } else {
    const legacy = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(fallback?.trim() ?? "");
    if (legacy) {
      day = Number(legacy[1]); month = Number(legacy[2]); year = Number(legacy[3]);
      const wallDate = new Date(Date.UTC(year, month - 1, day, 12));
      if (wallDate.getUTCFullYear() !== year || wallDate.getUTCMonth() !== month - 1 || wallDate.getUTCDate() !== day) return fallback?.trim() ?? "";
      weekday = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { weekday: "short", timeZone: "UTC" }).format(wallDate);
    } else if (instant && timezone) {
      const stamp = new Date(instant);
      if (!Number.isFinite(stamp.getTime())) return fallback?.trim() ?? "";
      try {
        const parts = new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", {
          weekday: "short", day: "2-digit", month: "2-digit", year: "numeric", timeZone: timezone,
        }).formatToParts(stamp);
        const part = (key: string) => parts.find(value => value.type === key)?.value ?? "";
        weekday = part("weekday"); day = Number(part("day")); month = Number(part("month")); year = Number(part("year"));
      } catch { return fallback?.trim() ?? ""; }
    } else return fallback?.trim() ?? "";
  }
  const shortDay = weekday ? weekday[0].toLocaleUpperCase(lang === "en" ? "en-GB" : "es-ES") + weekday.slice(1) : "";
  return `${shortDay} ${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function entryIsReservation(entry: GoEntry): boolean {
  return !!(entry.customerBooking || entry.businessBooking || entry.bookingPerspective || ["GO_BOOKING","GO_RESERVA"].includes(entry.type ?? ""));
}

/** Keep the stored duration intact; show only values with a known unit. */
export function entryDurationLabel(value?: string, lang = "es"): string | null {
  const raw = value?.trim() ?? "";
  const minutes = /^(\d+(?:[.,]\d+)?)\s*(?:m|min|mins|minuto|minutos)?$/i.exec(raw);
  const hours = /^(\d+(?:[.,]\d+)?)\s*(?:h|hora|horas)$/i.exec(raw);
  const hoursAndMinutes = /^(\d+)\s*h\s*(\d+)\s*(?:m|min|mins|minuto|minutos)?$/i.exec(raw);
  const amount = minutes?.[1] ?? hours?.[1];
  if (amount && Number(amount.replace(",", ".")) > 0) return `${lang === "en" ? "Duration" : "Duración"}: ${amount} ${hours ? "h" : "min"}`;
  if (hoursAndMinutes && Number(hoursAndMinutes[1]) > 0 && Number(hoursAndMinutes[2]) < 60)
    return `${lang === "en" ? "Duration" : "Duración"}: ${hoursAndMinutes[1]} h ${hoursAndMinutes[2]} min`;
  return null;
}

/** Read context from the same authorized card; server still resolves every recipient. */
export function entryMessageContext(entry: GoEntry) {
  if(entryIsInternal(entry))return null;
  return { actionId:entry.id, bookingId:entryIsReservation(entry) ? String(entry.bookingId || entry.reservationId || entry.id.replace(/^go_booking_(?:cli_|prv_)?/,"")) : undefined,
    name:entryIdentity(entry.contactName),phone:entry.phone||"",date:entry.date||entry.dateISO,time:entry.time,
    kind:entryIsReservation(entry)?"booking" as const:"task" as const };
}

export function entryProposalPending(entry: GoEntry): boolean {
  return !!entry.changeProposal && ["propuesto", "propuesta_pendiente"].includes(entry.estado);
}

export function internalEntryCommand(operation: "update" | "delete", date: string | null = null, time: string | null = null): import("@workspace/api-zod").TaskCommand {
  return { operation, source: "entry-details", query: "", selectorDate: null, period: "all", pendingOnly: false,
    invalidSelector: false, date, time, clearDate: false, clearTime: false, times: [], question: null };
}
