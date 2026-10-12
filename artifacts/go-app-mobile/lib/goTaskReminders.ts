import type { GoEntry } from "@/components/AgendaOperativa";
import { normalizeBookingText, parseTaskCommand, stripGoAddress } from "@workspace/api-zod";
import { readPersonalGoLog, updatePersonalGoLog } from "./goLogBridge";
import { assertTaskUser, ownsTask } from "./goTaskAccess";

export type TaskScope = { userId: string; context: string };
import type { NativeReminderReport } from "./goNativeReminderScheduler";
export type ReminderTask = GoEntry & { taskContext?: string; reminderSilencedByRemoval?: boolean };
export type ReminderCommand = {
  operation: "add" | "replace" | "read" | "remove";
  query: string; date: string | null; contextual: boolean;
  minutes: number | null; previousMinutes: number | null; all: boolean; question: string | null;
};
const amounts: Record<string, number> = {
  un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, diez: 10,
  quince: 15, veinte: 20, treinta: 30, cuarenta: 40, cuarentaicinco: 45,
  sesenta: 60, media: 0.5,
};
/** Minutes are elapsed time, matching the existing GO reminder engine. */
export function reminderIntervals(text: string): number[] {
  const n = normalizeBookingText(text).replace(/cuarenta y cinco/g, "cuarentaicinco");
  const result: number[] = [];
  const pattern = /\b(\d+(?:[.,]\d+)?|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|cuarenta|cuarentaicinco|sesenta|media)\s+(minutos?|horas?|dias?)(\s+y\s+media)?\b/g;
  for (const match of n.matchAll(pattern)) {
    const amount = amounts[match[1]] ?? Number(match[1].replace(",", "."));
    const minutes = (amount + (match[3] ? 0.5 : 0)) * (match[2].startsWith("dia") ? 1440 : match[2].startsWith("hora") ? 60 : 1);
    result.push(/(?:^|\s)-\s*$/.test(n.slice(0, match.index)) ? -minutes : minutes);
  }
  return result;
}
const validMinutes = (n: number) => Number.isInteger(n) && n > 0 && n <= 525600;
export function parseReminderCommand(text: string, today: string): ReminderCommand | null {
  const n = normalizeBookingText(stripGoAddress(text)).replace(/^[¿¡\s]+|[?!.\s]+$/g, "");
  const marker = /\b(?:recordatorios?|avisos?|avisame)\b/.test(n) || /^no me avises\b/.test(n);
  const relative = /\b(?:antes|antelacion)\b/.test(n);
  if (!marker && !(relative && /\b(?:recuerdame|recuerda|ponlo|cambialo)\b/.test(n))) return null;
  // "Crea una tarea: comprobar los recordatorios" is still task creation.
  if (/^(?:crea|apunta|anade)\s+(?:una?\s+)?(?:tarea|nota|lista)\b/.test(n)) return null;
  const operation = /\b(?:elimina|borra|quita|suprime|cancela)\b/.test(n) || /^no me avises\b/.test(n) ? "remove"
    : /^(?:que|cual|cuando|consulta|muestra|ver|tengo|hay)\b/.test(n) ? "read"
    : /\b(?:cambia|modifica|actualiza|sustituye|ponlo|cambialo)\b/.test(n) ? "replace" : "add";
  const intervals = reminderIntervals(n);
  let selector = n.replace(/\b(?:\d+(?:[.,]\d+)?|un|una|uno|dos|tres|cuatro|cinco|diez|quince|veinte|treinta|cuarenta(?: y cinco)?|sesenta|media)\s+(?:minutos?|horas?|dias?)(?:\s+y\s+media)?(?:\s+antes|\s+de antelacion)?/g, "");
  const contextual = /\b(?:esa tarea|esta tarea|la que acabas de crear|la ultima tarea|la anterior|ese aviso|ese recordatorio|ponlo|cambialo)\b/.test(n)
    || /^(?:avisame|recuerdame)\s+(?:\d|un[ao]?|dos|media)\b/.test(n);
  selector = selector.replace(/la que acabas de crear|la ultima tarea|esa tarea|esta tarea|la anterior/g, "")
    .replace(/\b(?:pon|ponme|anade|agrega|crea|cambia|modifica|actualiza|sustituye|elimina|borra|quita|suprime|cancela|consulta|muestra|ver|que|cual|cuando|tiene|tengo|hay|avisame|recuerdame|recordatorios?|avisos?|asociados?|a|antes|con|en|mi|mis|todas?|todos?|su|ese|esa|lo|el|una?|quiero|por favor|antelacion|y)\b/g, " ").replace(/\s+/g, " ").trim();
  const selection = parseTaskCommand("Elimina la tarea " + selector, today)!;
  const invalid = intervals.some(value => !validMinutes(value)) || /\b(?:despues|menos|negativ[oa])\b/.test(n);
  return {
    operation, query: selection.query, date: selection.selectorDate, contextual: contextual || (!selection.query && !selection.selectorDate && !selection.invalidSelector),
    minutes: intervals.at(-1) ?? null, previousMinutes: intervals.length === 2 ? intervals[0] : null,
    all: /\b(?:todos|todas)\b/.test(n),
    question: selection.invalidSelector ? "¿Qué fecha válida tiene la tarea?"
      : invalid || intervals.length > 2 ? "Indica una anticipación válida en minutos, horas o días (entre un minuto y un año)."
      : operation !== "read" && operation !== "remove" && !relative ? "¿Cuánto tiempo antes de la tarea quieres el aviso?"
      : operation !== "read" && operation !== "remove" && !intervals.length ? "¿Cuánto tiempo antes de la tarea quieres el aviso?" : null,
  };
}
export function taskInScope(entry: ReminderTask, scope: TaskScope): boolean {
  return ownsTask(entry, scope.userId)
    && (entry.taskContext ? entry.taskContext === scope.context : scope.context === "live:USER");
}
export async function assertReminderScope(scope: TaskScope, active: () => boolean): Promise<void> {
  await assertTaskUser(scope.userId);
  if (!active()) throw new Error("El contexto ha cambiado. Vuelve a solicitar el aviso.");
}
export async function selectReminderTasks(command: ReminderCommand, scope: TaskScope,
  contextualId: string | null, active: () => boolean): Promise<ReminderTask[]> {
  await assertReminderScope(scope, active);
  const rows = await readPersonalGoLog();
  await assertReminderScope(scope, active);
  if (command.question && command.question.includes("fecha válida")) return [];
  if (command.contextual && !contextualId) return [];
  if (!command.contextual && !command.query && !command.date) return [];
  const words = command.query.split(/\s+/).filter(Boolean);
  return rows.filter(entry => taskInScope(entry, scope) && !entry.deleted && entry.estado !== "rechazado"
    && (!command.contextual || entry.id === contextualId)
    && (!command.date || entry.dateISO === command.date)
    && words.every(word => normalizeBookingText(entry.notes || "").split(/\s+/).includes(word)));
}
/** GO calendar times follow the device's local zone. Reject DST gaps/folds rather than guess. */
export function reminderTaskInstant(entry: GoEntry): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.dateISO) || !/^\d{2}:\d{2}$/.test(entry.time))
    throw new Error("La tarea necesita fecha y hora para calcular el aviso. Indícalas antes de añadirlo.");
  const [y, m, d] = entry.dateISO.split("-").map(Number), [h, min] = entry.time.split(":").map(Number);
  const date = new Date(y, m - 1, d, h, min, 0, 0);
  const matches = (x: Date) => x.getFullYear() === y && x.getMonth() === m - 1 && x.getDate() === d && x.getHours() === h && x.getMinutes() === min;
  if (!matches(date)) throw new Error("Esa hora no existe en la zona horaria del teléfono. Revisa la fecha y hora de la tarea.");
  for (const shift of [30, 60, 120]) {
    if (matches(new Date(date.getTime() + shift * 60000)))
      throw new Error("Esa hora se repite con el cambio de horario. Elige una hora inequívoca para el aviso.");
  }
  return date.getTime();
}
export function reminderOffsets(entry: GoEntry): number[] {
  return [...new Set((entry.reminders || []).filter(validMinutes))].sort((a, b) => b - a);
}
export function describeReminders(entry: GoEntry, reports: NativeReminderReport[] = []): string {
  const offsets = reminderOffsets(entry);
  const failure = reports.some(report => report.status === "failed" && (!report.taskId || report.taskId === entry.id));
  if (!offsets.length) return "La tarea «" + entry.notes + "» no tiene avisos asociados explícitamente."
    + (failure ? " No he podido confirmar la cancelación en el teléfono. Vuelve a intentarlo." : "");
  let instant: number;
  try { instant = reminderTaskInstant(entry); } catch (error) { return (error as Error).message; }
  const messages: Record<string, string> = {
    scheduled: "Notificación local programada en el teléfono; GO puede estar cerrado.",
    quiet: "Notificación local programada sin sonido o con entrega discreta según los permisos.",
    denied: "Guardado, pero no programado: permite las notificaciones de GO en los ajustes del teléfono.",
    muted: "Guardado; las alertas están silenciadas y no se ha programado una notificación.",
    past: "No programado: la hora del aviso ya ha pasado.", invalid: "No programado: revisa la fecha y hora de la tarea.",
    capacity: "Guardado, pero el teléfono no admite más avisos pendientes. No está activado.",
    unsupported: "Guardado; este entorno no permite programar una notificación del teléfono.",
    failed: "Guardado, pero no he podido confirmar su programación en el teléfono. Inténtalo de nuevo.",
    inactive: "Guardado; vuelve al contexto de esta tarea para comprobar su programación.",
  };
  const lines = offsets.map(minutes => {
    const report = reports.find(item => item.taskId === entry.id && item.minutes === minutes);
    const at = new Date(report?.at ?? instant - minutes * 60000);
    const state = report?.status === "failed" ? messages.failed : entry.notificationsEnabled === false ? messages.muted : report ? messages[report.status]
      : "El aviso está guardado, pero su programación en el teléfono no está comprobada.";
    return minutes + " min antes · " + at.toLocaleDateString("es-ES") + " · "
      + at.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }) + "\n" + state;
  });
  return "Avisos de «" + entry.notes + "»:\n" + lines.join("\n");
}
export async function changeReminder(command: ReminderCommand, expected: ReminderTask, scope: TaskScope,
  active: () => boolean, confirmed = false): Promise<ReminderTask> {
  if (command.operation === "read" || command.question) throw new Error(command.question || "Indica el cambio de aviso.");
  if (command.operation === "remove" && !confirmed) throw new Error("Confirma explícitamente qué aviso quieres eliminar.");
  await assertReminderScope(scope, active);
  const saved = await updatePersonalGoLog(async rows => {
    await assertReminderScope(scope, active);
    const matches = rows.filter(entry => entry.id === expected.id);
    const current = matches[0] as ReminderTask | undefined;
    if (matches.length !== 1 || !current || !taskInScope(current, scope) || current.deleted || current.estado === "rechazado")
      throw new Error("La tarea ya no está disponible en este contexto. No he cambiado nada.");
    if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error("La tarea ha cambiado. Vuelve a seleccionarla antes de modificar su aviso.");
    const old = reminderOffsets(current);
    let next: number[];
    if (command.operation === "remove") {
      if (!command.all && command.minutes === null && old.length > 1) throw new Error("¿Cuál de los avisos quieres eliminar? Indica su anticipación o di «todos». ");
      next = command.all || command.minutes === null ? [] : old.filter(minutes => minutes !== command.minutes);
    } else {
      if (command.minutes === null || !validMinutes(command.minutes)) throw new Error("Indica una anticipación válida para el aviso.");
      const at = reminderTaskInstant(current) - command.minutes * 60000;
      if (at <= Date.now()) throw new Error("Ese aviso quedaría en el pasado. Elige otra anticipación o cambia la fecha de la tarea.");
      if (command.operation === "replace") {
        const previous = command.previousMinutes ?? (old.length === 1 ? old[0] : null);
        if (previous === null || !old.includes(previous)) throw new Error("¿Qué aviso quieres cambiar? Indica su anticipación actual.");
        next = old.filter(minutes => minutes !== previous).concat(command.minutes);
      } else next = [...old, command.minutes];
    }
    next = [...new Set(next)].sort((a, b) => b - a);
    if (next.length > 3) throw new Error("La tarea admite hasta tres avisos. Cambia o elimina uno antes de añadir otro.");
    if (JSON.stringify(old) === JSON.stringify(next)) return { entries: rows, result: current };
    const entry: ReminderTask = { ...current, reminders: next,
      firedReminderMins: (current.firedReminderMins || []).filter(minutes => next.includes(minutes) && old.includes(minutes)
        && !(command.operation === "replace" && minutes === command.minutes)),
      // Preserve manual mute, but allow an explicit new reminder after removing the final one.
      ...(next.length === 0 ? { notificationsEnabled: false, reminderSilencedByRemoval: current.notificationsEnabled !== false || current.reminderSilencedByRemoval, snoozeUntil: undefined }
        : current.reminderSilencedByRemoval ? { notificationsEnabled: true, reminderSilencedByRemoval: undefined } : {}),
    };
    return { entries: rows.map(row => row.id === entry.id ? entry : row), result: entry };
  });
  await assertReminderScope(scope, active);
  return saved;
}
