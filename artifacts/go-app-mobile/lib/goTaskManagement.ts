import type { GoEntry } from "@/components/AgendaOperativa";
import { normalizeBookingText, taskWeek, type TaskCommand } from "@workspace/api-zod";
import { readPersonalGoLog, updatePersonalGoLog } from "./goLogBridge";
import { ownsTask, requireTaskUser, assertTaskUser } from "./goTaskAccess";
import { localToday } from "./bookingAssistant";
import { formatDayLetterSlash } from "./time";
export type TaskSelection = { command: TaskCommand; owner: string; entries: GoEntry[] };
export async function selectTasks(command: TaskCommand, expectedUser?: string): Promise<TaskSelection> {
  if (command.invalidSelector) throw new Error(command.question || "Indica una fecha válida.");
  const owner = expectedUser || await requireTaskUser();
  await assertTaskUser(owner);
  const entries = await readPersonalGoLog();
  await assertTaskUser(owner);
  const [start, end] = taskWeek(localToday());
  const words = command.query.split(" ").filter(Boolean);
  return { command, owner, entries: entries.filter(entry => {
    if (!ownsTask(entry, owner) || entry.deleted || entry.estado === "rechazado") return false;
    if (command.pendingOnly && !["pendiente", "propuesto", "propuesta_pendiente"].includes(entry.estado)) return false;
    if (command.selectorDate && entry.dateISO !== command.selectorDate) return false;
    if (command.period === "week" && (!entry.dateISO || entry.dateISO < start || entry.dateISO > end)) return false;
    const title = normalizeBookingText(entry.notes || "");
    return words.every(word => title.split(/\s+/).includes(word));
  }).sort((a, b) => (a.dateISO || "9999").localeCompare(b.dateISO || "9999")
    || (a.time || "99:99").localeCompare(b.time || "99:99")) };
}
export function describeTask(entry: GoEntry): string {
  return [entry.notes || "Sin título", entry.dateISO ? entry.dateISO.split("-").reverse().join("/") : "Sin fecha",
    entry.time || "Sin hora", entry.estado].join(" · ");
}
export async function changeTask(selection: TaskSelection, expected: GoEntry, time?: string, confirmed = false): Promise<GoEntry> {
  const { command, owner } = selection;
  if (!confirmed || command.operation === "read" || command.question)
    throw new Error("Revisa y confirma la acción antes de guardar.");
  if (command.times.length && (!time || !command.times.includes(time))) throw new Error("Elige la hora correcta.");
  if (command.operation === "update" && !command.date && !command.time && !time && !command.clearDate && !command.clearTime)
    throw new Error("Indica qué fecha u hora quieres cambiar.");
  await assertTaskUser(owner);
  return updatePersonalGoLog(async entries => {
    await assertTaskUser(owner);
    const matches = entries.filter(entry => entry.id === expected.id);
    const current = matches[0];
    if (matches.length !== 1 || !current || !ownsTask(current, owner) || current.deleted || current.estado === "rechazado")
      throw new Error("La tarea ya no está disponible. Vuelve a consultarla.");
    if (JSON.stringify(current) !== JSON.stringify(expected))
      throw new Error("La tarea ha cambiado. Vuelve a seleccionarla antes de confirmar.");
    const entry: GoEntry = command.operation === "delete"
      ? { ...current, deleted: true, estado: "rechazado" }
      : { ...current,
        ...(command.clearDate ? { dateISO: "", date: "" } : command.date
          ? { dateISO: command.date, date: formatDayLetterSlash(new Date(command.date + "T12:00:00")) } : {}),
        ...(command.clearTime ? { time: "" } : (time || command.time) ? { time: time || command.time! } : {}),
      };
    return { entries: entries.map(old => old.id === entry.id ? entry : old), result: entry };
  });
}
