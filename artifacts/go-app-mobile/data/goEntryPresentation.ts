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

export function entryIsReservation(entry: GoEntry): boolean {
  return !!(entry.customerBooking || entry.businessBooking || entry.bookingPerspective || ["GO_BOOKING","GO_RESERVA"].includes(entry.type ?? ""));
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
