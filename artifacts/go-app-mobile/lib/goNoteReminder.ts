import type { GoEntry } from "@/components/AgendaOperativa";
import { readGoLog, updateGoLog } from "./goLogStore";
import { assertTaskUser } from "./goTaskAccess";
import { refreshNativeTaskReminders } from "./goTaskReminderRuntime";
import { describeReminders } from "./goTaskReminders";
import { changeAttachedNoteReminder, hasAttachedNoteReminder, isGoNoteReminderTarget, isNoteReminderMinutes, noteReminderMetadata, type NoteReminderDraft } from "./goNoteTools";

/** Saves the existing note once; the shared OS queue handles permissions, edits and cancellation. */
export async function saveGoNoteReminder(entry: GoEntry, draft: NoteReminderDraft, active: () => boolean) {
  const assertActive = () => {
    if (!active()) throw new Error("El contexto ha cambiado. Vuelve a abrir la nota.");
  };
  const check = async () => {
    await assertTaskUser(draft.scope.userId);
    assertActive();
  };
  await check();
  const saved = await updateGoLog(async entries => {
    await check();
    const existing = entries.filter(row => row.id === entry.id);
    if (existing.length > 1 || (existing[0] && ((existing[0] as GoEntry & { ownerUserId?: string }).ownerUserId !== draft.scope.userId
      || ((existing[0] as GoEntry & { taskContext?: string }).taskContext ?? existing[0].actionContext ?? "live:USER") !== draft.scope.context)))
      throw new Error("La nota no está disponible en este contexto.");
    if (draft.edit) {
      const previous = existing[0];
      if (!previous || previous.deleted || previous.estado === "rechazado" || !["TAREA", "TAREA_INTERNA"].includes(previous.type || ""))
        throw new Error("La nota ya no está disponible. No se ha modificado.");
      if (Object.keys(draft.edit).some(key => JSON.stringify(previous[key as keyof GoEntry] ?? (key === "reminders" ? [] : ""))
        !== JSON.stringify(draft.edit![key as keyof typeof draft.edit] ?? (key === "reminders" ? [] : ""))))
        throw new Error("La nota cambió durante la edición. Vuelve a abrirla para conservar los cambios recientes.");
      const result = noteReminderMetadata({ ...previous, notes: entry.notes, detail: entry.detail,
        date: entry.date, dateISO: entry.dateISO, time: entry.time, duration: entry.duration,
        place: entry.place, contactName: entry.contactName, phone: entry.phone }, draft);
      // Other independent alerts on legacy tasks are not removed by editing this note.
      const priorMinutes = previous.reminders?.[0] ?? null;
      result.reminders = draft.minutes === priorMinutes ? previous.reminders || []
        : [...new Set([...(draft.minutes === null ? [] : [draft.minutes]), ...(previous.reminders || []).filter(n => n !== priorMinutes)])];
      result.notificationsEnabled = result.reminders.length > 0 && (draft.minutes === priorMinutes ? previous.notificationsEnabled !== false : true);
      result.firedReminderMins = previous.dateISO !== result.dateISO || previous.time !== result.time ? []
        : (previous.firedReminderMins || []).filter(n => draft.minutes === priorMinutes || (n !== priorMinutes && n !== draft.minutes));
      return { entries: entries.map(row => row.id === result.id ? result : row), result };
    }
    // Retrying a save never overwrites a later edit or creates another note.
    if (existing[0]) return { entries, result: existing[0] };
    const result = noteReminderMetadata(entry, draft);
    return { entries: [result, ...entries], result };
  }, assertActive);
  await check();
  try {
    const reports = await refreshNativeTaskReminders(draft.scope, draft.minutes !== null);
    await check();
    return { saved, message: draft.minutes === null ? "" : describeReminders(saved, reports) };
  } catch {
    // The note is already saved. Do not report a failed save or repeat creation.
    return { saved, message: draft.minutes === null ? "" : "Nota guardada. No he podido confirmar el aviso en el teléfono. Revisa sus permisos y vuelve a intentarlo." };
  }
}

/** Changes only the reminder on a note explicitly saved by this editor. */
export async function changeGoNoteReminder(id: string, draft: NoteReminderDraft, active: () => boolean) {
  if (draft.minutes !== null && !isNoteReminderMinutes(draft.minutes)) throw new Error("Antelación no válida.");
  const assertActive = () => { if (!active()) throw new Error("El contexto ha cambiado."); };
  const check = async () => { await assertTaskUser(draft.scope.userId); assertActive(); };
  await check();
  const saved = await updateGoLog(async entries => {
    await check();
    const matches = entries.filter(row => row.id === id);
    const row = matches[0] as GoEntry & { goNoteReminder?: boolean; ownerUserId?: string; taskContext?: string };
    if (matches.length !== 1 || !row || !isGoNoteReminderTarget(row) || row.ownerUserId !== draft.scope.userId
      || row.taskContext !== draft.scope.context || row.deleted || row.estado === "rechazado")
      throw new Error("La nota ya no está disponible en este contexto.");
    const next = hasAttachedNoteReminder(row) ? changeAttachedNoteReminder(row, draft)
      : { ...noteReminderMetadata(row, draft), snoozeUntil: undefined };
    return { entries: entries.map(entry => entry.id === id ? next : entry), result: next };
  }, assertActive);
  await check();
  const reports = await refreshNativeTaskReminders(draft.scope, draft.minutes !== null);
  await check();
  return { saved, message: describeReminders(saved, reports) };
}

/** Called after GO's existing write queue; a failed permission/schedule never repeats creation. */
export async function confirmAttachedGoNoteReminder(id: string, draft: NoteReminderDraft, active: () => boolean) {
  await assertTaskUser(draft.scope.userId);
  if (!active()) throw new Error("El contexto ha cambiado.");
  const rows = (await readGoLog()).filter(row=>row.id===id);
  const row = rows[0] as GoEntry & { ownerUserId?: string; taskContext?: string };
  if (rows.length !== 1 || !row || !hasAttachedNoteReminder(row) || !row.attachedNote?.trim()
    || row.ownerUserId !== draft.scope.userId || row.taskContext !== draft.scope.context || !active())
    throw new Error("La nota no está disponible en este contexto.");
  const reports = await refreshNativeTaskReminders(draft.scope, draft.minutes !== null);
  await assertTaskUser(draft.scope.userId);
  if (!active()) throw new Error("El contexto ha cambiado.");
  return describeReminders(row,reports);
}
