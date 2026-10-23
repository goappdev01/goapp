import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";

export const NOTE_REMINDER_MINUTES = [5, 10, 15, 30, 45, 60, 120, 180, 360, 720, 1440] as const;
export type NoteReminderDraft = { scope: TaskScope; minutes: number | null; entryId?: string };
export const isNoteReminderMinutes = (value: unknown): value is number =>
  typeof value === "number" && (NOTE_REMINDER_MINUTES as readonly number[]).includes(value);
export function noteReminderLabel(minutes: number, english = false): string {
  return minutes < 60 ? `${minutes} min ${english ? "before" : "antes"}`
    : `${minutes / 60} ${english ? (minutes === 60 ? "hour before" : "hours before") : (minutes === 60 ? "hora antes" : "horas antes")}`;
}
export function noteReminderMetadata(entry: GoEntry, draft: NoteReminderDraft) {
  if (!draft.scope.userId || !draft.scope.context || (draft.minutes !== null && !isNoteReminderMinutes(draft.minutes)))
    throw new Error("El aviso de la nota no es válido.");
  if (entry.type !== "TAREA" && entry.type !== "TAREA_INTERNA") throw new Error("El aviso pertenece a una nota/tarea.");
  return { ...entry, ownerUserId: draft.scope.userId, taskContext: draft.scope.context,
    goNoteReminder: true, reminders: draft.minutes === null ? [] : [draft.minutes], firedReminderMins: [],
    notificationsEnabled: draft.minutes !== null };
}
export function appendNoteDictation(current: string, text: string): string {
  return [current.trimEnd(), text.trim()].filter(Boolean).join(" ");
}
/** Keyboard coordinates and safe insets are logical points, measured in the same window. */
export function noteKeyboardContentHeight(windowHeight: number, keyboardTop: number | null,
  insetTop: number, headerHeight: number, paddingTop: number, paddingBottom: number): number {
  const bottom = keyboardTop === null ? windowHeight : Math.min(windowHeight, Math.max(0, keyboardTop));
  return Math.max(0, bottom - insetTop - headerHeight - paddingTop - paddingBottom);
}

/** A linked note shares its GO identifier and queue, never a second task/calendar entry. */
export type AttachedGoNote = GoEntry & { ownerUserId?: string; taskContext?: string; attachedNote?: string;
  goAttachedNoteReminder?: { version: 1; minutes: number | null; shared: boolean }; reminderSilencedByRemoval?: boolean };
export function hasAttachedNoteReminder(entry: GoEntry): entry is AttachedGoNote {
  const link = (entry as AttachedGoNote).goAttachedNoteReminder;
  return entry.kind === "sent" && link?.version === 1 && typeof link.shared === "boolean"
    && (link.minutes === null || isNoteReminderMinutes(link.minutes));
}
const noteOffsets = (entry: GoEntry) => [...new Set((entry.reminders || []).filter(n =>
  Number.isInteger(n) && n > 0 && n <= 525600))].sort((a,b) => b-a);
export function bindAttachedNoteReminder(entry: GoEntry, draft: NoteReminderDraft): AttachedGoNote {
  const old = entry as AttachedGoNote;
  if (entry.kind !== "sent" || !old.attachedNote?.trim() || !draft.scope.userId || !draft.scope.context
    || (draft.minutes !== null && !isNoteReminderMinutes(draft.minutes))
    || (old.ownerUserId && old.ownerUserId !== draft.scope.userId)
    || (old.taskContext && old.taskContext !== draft.scope.context)) throw new Error("La nota no está disponible en este contexto.");
  const offsets = noteOffsets(entry), link = old.goAttachedNoteReminder;
  const shared = draft.minutes !== null && (link?.minutes === draft.minutes ? link.shared : offsets.includes(draft.minutes));
  if (draft.minutes !== null && !offsets.includes(draft.minutes)) offsets.push(draft.minutes);
  return { ...entry, ownerUserId: draft.scope.userId, taskContext: draft.scope.context,
    reminders: offsets.sort((a,b)=>b-a), goAttachedNoteReminder: { version: 1, minutes: draft.minutes, shared } };
}
/** Only the selected shared alert changes; independent offsets/actions keep their history. */
export function changeAttachedNoteReminder(entry: GoEntry, draft: NoteReminderDraft): AttachedGoNote {
  if (!hasAttachedNoteReminder(entry) || !entry.attachedNote?.trim()) throw new Error("La nota ya no está adjunta.");
  const previous = entry.goAttachedNoteReminder!.minutes;
  const remaining = previous === draft.minutes ? noteOffsets(entry) : noteOffsets(entry).filter(n=>n!==previous);
  const next = bindAttachedNoteReminder({ ...entry, reminders: remaining },draft);
  if (previous !== draft.minutes) next.goAttachedNoteReminder!.shared = draft.minutes !== null && remaining.includes(draft.minutes);
  return { ...next, firedReminderMins: (entry.firedReminderMins || []).filter(n=>n!==previous && n!==draft.minutes),
    snoozeUntil: undefined,
    ...(next.reminders!.length === 0 ? { notificationsEnabled: false, reminderSilencedByRemoval: entry.notificationsEnabled !== false || entry.reminderSilencedByRemoval }
      : entry.reminderSilencedByRemoval ? { notificationsEnabled: true, reminderSilencedByRemoval: undefined } : {}) };
}
/** Also handles legacy/manual unlinking without deleting the GO or its independent alerts. */
export function effectiveNoteReminderEntry(entry: GoEntry): AttachedGoNote {
  if (!hasAttachedNoteReminder(entry) || entry.attachedNote?.trim()) return entry;
  const link = entry.goAttachedNoteReminder!, offsets = noteOffsets(entry).filter(n=>link.shared || n!==link.minutes);
  return { ...entry, reminders: offsets, notificationsEnabled: offsets.length ? entry.notificationsEnabled : false,
    goAttachedNoteReminder: { version: 1, minutes: null, shared: false } };
}
export function isGoNoteReminderTarget(entry: GoEntry): boolean {
  return (entry as GoEntry & { goNoteReminder?: boolean }).goNoteReminder === true
    || (hasAttachedNoteReminder(entry) && !!entry.attachedNote?.trim());
}
export function goNoteReminderMinutes(entry: GoEntry): number | null {
  return hasAttachedNoteReminder(entry) ? entry.goAttachedNoteReminder!.minutes : entry.reminders?.[0] ?? null;
}
