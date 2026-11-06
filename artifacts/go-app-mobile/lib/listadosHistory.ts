import type { GoEntry } from "@/components/AgendaOperativa";
import { durationMinutes, plannedActionEnd, type Decision } from "./goActionCompletion";
import { entryIsReservation } from "@/data/goEntryPresentation";
import { isArchivedNote } from "./unifiedNotes";

export const DEFAULT_HISTORY_DAYS = 90;
export type ListHistoryBucket = "current" | "archive" | "old" | "hidden";

function absoluteEnd(entry: GoEntry): number | null {
  const snapshot = entry.bookingTimeline;
  const zonedSnapshot = snapshot && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(snapshot.endsAt);
  const end = zonedSnapshot ? snapshot.endsAt : entry.endDatetime;
  const start = zonedSnapshot ? snapshot.startsAt : entry.startDatetime || entry.bookingStartsAt;
  if (end && /(?:Z|[+-]\d{2}:?\d{2})$/i.test(end)) {
    const at = Date.parse(end), begins = start ? Date.parse(start) : NaN;
    return Number.isFinite(at) && Number.isFinite(begins) && at > begins ? at : null;
  }
  // A zoned reservation with only wall-clock data is ambiguous. Preserve it.
  if (entryIsReservation(entry)) return null;
  if (!end && !entry.endTime && !durationMinutes(entry.duration || "")) return null;
  return plannedActionEnd(entry, 0);
}

/** Visibility only. Never mutates, archives, deletes or changes a booking state. */
export function listHistoryBucket(entry: GoEntry, decision: Decision | undefined, now: number, days = DEFAULT_HISTORY_DAYS): ListHistoryBucket {
  if (isArchivedNote(entry)) return "archive";
  if (!Number.isFinite(now) || decision?.status === "done" && !Number.isFinite(decision.at)) return "current";
  if (entry.changeProposal || entry.proposal || decision?.status === "pending" || entry.localResolutionStatus === "pending") return "current";
  const reservation = entryIsReservation(entry);
  const finished = decision?.status === "done" || entry.localResolutionStatus === "done"
    || reservation && (["COMPLETED", "CANCELLED", "REJECTED", "NO_SHOW"].includes(entry.bookingServerStatus || "")
      || ["completada", "cancelada"].includes(entry.bookingStatus || ""));
  if (!finished) return "current";
  const end = absoluteEnd(entry);
  if (end === null || end > now) return "current";
  const finishedAt = Math.max(end, decision?.status === "done" ? decision.at : end);
  if (finishedAt > now) return "current";
  const window = Number.isInteger(days) && days > 0 ? days : DEFAULT_HISTORY_DAYS;
  return now - finishedAt < window * 86400000 ? "old" : "hidden";
}
