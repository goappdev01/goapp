import type { GoEntry } from "@/components/AgendaOperativa";
import {
  goActionSchema, goPlanSchema, parseGoPlan, normalizeBookingText, normalizeListName,
  type GoAction, type GoContext, type GoPlan,
} from "@workspace/api-zod";
import { getAuthenticatedUserId } from "@/data/booking";
import { assistantApi, localToday } from "./bookingAssistant";
import { readPersonalGoLog, updatePersonalGoLog } from "./goLogBridge";
import { formatDayLetterSlash } from "./time";

export async function interpretGoActions(text: string, context: GoContext, useAI: boolean): Promise<GoPlan> {
  const today = localToday();
  if (useAI && await getAuthenticatedUserId()) {
    try {
      const result = await assistantApi<{ plan: unknown }>("/plan", { text, today, context });
      return goPlanSchema.parse(result.plan);
    } catch { /* Same conservative, explicit-field fallback for voice and text. */ }
  }
  return parseGoPlan(text, context, today);
}
const isNote = (entry: GoEntry) => !entry.deleted && entry.estado !== "rechazado"
  && entry.kind === "sent" && entry.type === "TAREA_INTERNA" && entry.intentKey === "nota_interna";
export async function findGoLists(title?: string | null): Promise<GoEntry[]> {
  const name = title ? normalizeListName(title) : null;
  return (await readPersonalGoLog()).filter(entry => isNote(entry) && (
    name ? normalizeListName(entry.notes || "") === name
      : /^lista\b/i.test(entry.notes || "") || /^[-•] /m.test(entry.detail || "")
  ));
}
export function goListItems(entry: GoEntry): string[] {
  return (entry.detail || "").split("\n").map(line => line.replace(/^[-•]\s*/, "").trim()).filter(Boolean);
}
let sequence = 0;
function newEntry(action: GoAction): GoEntry {
  const event = action.kind === "event";
  return {
    id: "go_" + Date.now().toString(36) + "_" + (++sequence).toString(36) + "_" + Math.random().toString(36).slice(2, 10),
    kind: "sent", intentKey: event ? "generico" : "nota_interna",
    intentLabel: event ? "GO" : "Tarea interna", color: event ? "#00e5ff" : "#7c3aed",
    place: action.place || "", dateISO: action.date || "",
    date: action.date ? formatDayLetterSlash(new Date(action.date + "T12:00:00")) : "",
    time: action.time || "", duration: action.durationMinutes ? action.durationMinutes + "min" : "",
    contactName: "", phone: "", estado: "pendiente", createdAt: Date.now(),
    type: event ? "GO_INTERNO" : "TAREA_INTERNA", notes: action.title || "",
    detail: action.detail || "", isGeneric: true,
  };
}
export function personalActionMissing(action: GoAction): string | null {
  if (!action.title) return action.kind === "list" ? "¿Cómo se llama la lista?" : "¿Qué quieres apuntar?";
  if (action.kind === "event" && !action.date) return "¿Qué día es? Puedes dejarlo sin hora.";
  if (action.kind === "list" && ["add", "remove"].includes(action.listOperation || "") && !action.items.length)
    return action.listOperation === "remove" ? "¿Qué elementos quieres quitar?" : "¿Qué elementos quieres añadir?";
  return null;
}
export type PersonalResult = { entry: GoEntry; changed: boolean; kind: "event" | "task" | "list" };
export async function savePersonalAction(raw: GoAction, listId?: string): Promise<PersonalResult> {
  const action = goActionSchema.parse(raw);
  if (!["event", "task", "list"].includes(action.kind)) throw new Error("Acción personal no compatible.");
  if (action.kind !== "list" && action.operation !== "create") throw new Error("Este paso solo permite crear tareas o actividades.");
  const missing = personalActionMissing(action);
  if (missing) throw new Error(missing);
  return updatePersonalGoLog<PersonalResult>(entries => {
    if (action.kind !== "list") {
      // Repeated voice/text deliveries share the same transaction and cannot
      // create another copy of a recently acknowledged assistant task.
      const now = Date.now();
      const existing = entries.find(entry =>
        entry.id.startsWith("go_") && !entry.deleted && entry.estado !== "rechazado"
        && entry.type === (action.kind === "event" ? "GO_INTERNO" : "TAREA_INTERNA")
        && typeof entry.createdAt === "number" && now >= entry.createdAt && now - entry.createdAt < 300000
        && normalizeBookingText(entry.notes || "") === normalizeBookingText(action.title || "")
        && entry.dateISO === (action.date || "") && entry.time === (action.time || "")
        && entry.place === (action.place || "") && (entry.detail || "") === (action.detail || "")
        && entry.duration === (action.durationMinutes ? action.durationMinutes + "min" : "")
      );
      if (existing) return { entries, result: { entry: existing, changed: false, kind: action.kind as "task" | "event" } };
      if (entries.length >= 200) throw new Error("Tu registro de GO está lleno. Revisa tus acciones antes de añadir otra.");
      const entry = newEntry(action);
      return { entries: [entry, ...entries], result: { entry, changed: true, kind: action.kind as "task" | "event" } };
    }
    if (!action.listOperation) throw new Error("Dime si quieres crear, consultar, añadir o quitar elementos.");
    const matches = entries.filter(entry => isNote(entry) && (listId ? entry.id === listId
      : normalizeListName(entry.notes || "") === normalizeListName(action.title!)));
    if (matches.length > 1) throw new Error("Hay varias listas con ese nombre. Elige una.");
    const existing = matches[0];
    if (!existing && action.listOperation !== "create") throw new Error("No encuentro esa lista. Puedes crearla indicando su nombre.");
    if (existing && action.listOperation === "create") throw new Error("Ya existe esa lista. Puedes abrirla o añadir elementos.");
    if (!existing && entries.length >= 200) throw new Error("Tu registro de GO está lleno. Revisa tus acciones antes de añadir otra.");
    const oldItems = existing ? goListItems(existing) : [];
    const requested = new Set(action.items.map(normalizeBookingText));
    // Exact normalized matches only: 'café' never removes 'café descafeinado'.
    let items = action.listOperation === "remove" ? oldItems.filter(item => !requested.has(normalizeBookingText(item))) : [...oldItems];
    if (action.listOperation === "add" || action.listOperation === "create")
      for (const item of action.items)
        if (!items.some(old => normalizeBookingText(old) === normalizeBookingText(item))) items.push(item);
    if (items.length > 200) throw new Error("La nota contiene demasiados elementos. No se ha modificado.");
    const changed = !existing || JSON.stringify(oldItems) !== JSON.stringify(items);
    const entry = existing
      ? { ...existing, ...(changed ? { detail: items.map(item => "• " + item).join("\n") } : {}) }
      : { ...newEntry({ ...action, date: null, time: null, place: null }), detail: items.map(item => "• " + item).join("\n") };
    return {
      entries: existing ? entries.map(old => old.id === entry.id ? entry : old) : [entry, ...entries],
      result: { entry, changed, kind: "list" as const },
    };
  });
}
export function describePersonalResult(result: PersonalResult, operation?: GoAction["listOperation"]): string {
  const { entry } = result;
  const heading = result.kind === "list"
    ? operation === "read" ? "Tu lista" : result.changed ? "Lista guardada en Notas" : "La lista no necesitaba cambios"
    : !result.changed ? "Esta tarea ya estaba guardada" : result.kind === "event" ? "Añadido al Calendario" : "Tarea guardada";
  return [
    heading + ": " + entry.notes,
    entry.dateISO ? entry.dateISO.split("-").reverse().join("/") + (entry.time ? " · " + entry.time : " · Sin hora") : null,
    entry.place || null, result.kind !== "list" ? entry.detail : null,
    result.kind === "list" ? (entry.detail || "Lista vacía. Puedes añadir elementos.") : null,
  ].filter(Boolean).join("\n");
}
