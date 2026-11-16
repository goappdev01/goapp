import { normalizeBookingText } from "@workspace/api-zod";
import type { GoEntry } from "../components/AgendaOperativa";
import type { TranslationKey } from "../i18n/translations";
import { entryHeading, entryIdentity, entryIsReservation, formatBookingLocalDate } from "./goEntryPresentation";
import { reservationCardPolicy } from "./reservationCardPolicy";
import { isNoteEntry, noteDocument, noteEntryDestination } from "../lib/unifiedNotes";

export type CalendarSearchType = "all" | "task" | "note" | "booking" | "event";
export type CalendarSearchStatus = "all" | "pending" | "done";
export type CalendarSearchArchive = "active" | "archive";

export function calendarSearchType(entry: GoEntry): Exclude<CalendarSearchType, "all"> {
  const fallback = ["TAREA", "TAREA_INTERNA"].includes(entry.type ?? "") ? "task" : "event";
  if (entryIsReservation(entry)) return "booking";
  if (isNoteEntry(entry)) return "note";
  return fallback;
}

export function calendarSearchTitle(entry: GoEntry, lang: string): string {
  return noteDocument(entry)?.title.trim() || entryIdentity(entry.notes)
    || entryHeading(entry, lang === "en" ? "Entry" : "Entrada");
}

/** Only an explicit personal resolution is a reliable completion state. */
export function calendarSearchStatus(entry: GoEntry): CalendarSearchStatus | null {
  return !entryIsReservation(entry) && entry.localResolutionStatus ? entry.localResolutionStatus : null;
}

/** Inputs must already be authorized calendar/archive projections. Never reads another store. */
export function indexCalendarSearch(entries: readonly GoEntry[], archiveNotes: readonly GoEntry[] = []) {
  const seen = new Set<string>();
  return [...entries, ...archiveNotes].filter(entry => {
    if (entry.deleted || entry.estado === "rechazado" || seen.has(entry.id) || noteDocument(entry)?.destination === "go") return false;
    seen.add(entry.id);
    return true;
  }).map(entry => ({
    entry,
    type: calendarSearchType(entry),
    status: calendarSearchStatus(entry),
    archived: noteEntryDestination(entry) === "archive",
    text: normalizeBookingText([
      entry.notes, entry.intentLabel, entry.detail, entry.attachedNote, entry.bookingMessageToStaff,
      noteDocument(entry)?.title, noteDocument(entry)?.content,
      entryIdentity(entry.contactName), entryIdentity(entry.professionalName), entry.place,
      ...(entry.bookingCatalog?.lines.map(line => line.name)
        ?? (entry.bookingServices ?? entry.bookingTimeline?.serviceDetails ?? []).map(service => service.title)),
    ].filter(Boolean).join("\n")),
  }));
}

export function filterCalendarSearch(index: ReturnType<typeof indexCalendarSearch>, query: string,
  type: CalendarSearchType = "all", status: CalendarSearchStatus = "all", archive: CalendarSearchArchive = "active") {
  const text = normalizeBookingText(query);
  return index.filter(item => item.archived === (archive === "archive")
    && (type === "all" || item.type === type)
    && (status === "all" || item.status === status)
    && (!text || item.text.includes(text)));
}

export function calendarSearchMeta(entry: GoEntry, lang: string, t: (key: TranslationKey) => string): string {
  const en = lang === "en", kind = calendarSearchType(entry);
  const labels = en ? { task: "Task", note: "Note", booking: "Booking", event: "Event" }
    : { task: "Tarea", note: "Nota", booking: "Reserva", event: "Evento" };
  const status = calendarSearchStatus(entry);
  return [labels[kind], formatBookingLocalDate(entry.dateISO, entry.date, lang), entry.time,
    noteEntryDestination(entry) === "archive" ? (en ? "Archived" : "Archivada") : "",
    kind === "booking" ? t(reservationCardPolicy(entry).stateKey as TranslationKey)
      : status === "done" ? (en ? "Done" : "Realizada") : status === "pending" ? (en ? "Pending" : "Pendiente") : "",
  ].filter(Boolean).join(" · ");
}
