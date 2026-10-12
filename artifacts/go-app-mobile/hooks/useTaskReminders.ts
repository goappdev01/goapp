import { useRef } from "react";
import { normalizeBookingText } from "@workspace/api-zod";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { useBookingAssistant } from "./useBookingAssistant";
import { localToday } from "@/lib/bookingAssistant";
import { getTaskUser } from "@/lib/goTaskAccess";
import { refreshNativeTaskReminders } from "@/lib/goTaskReminderRuntime";
import { parseReminderCommand, reminderIntervals, reminderOffsets, selectReminderTasks, changeReminder,
  describeReminders, assertReminderScope, type ReminderCommand, type ReminderTask, type TaskScope } from "@/lib/goTaskReminders";

type Draft = { command: ReminderCommand; scope: TaskScope; entries: ReminderTask[];
  selected: ReminderTask | null; phase: "task" | "interval" | "previous" | "confirm" };
const key = (scope: TaskScope) => JSON.stringify([scope.userId, scope.context]);
export function useTaskReminders(a: ReturnType<typeof useBookingAssistant>, scope: TaskScope | null | undefined,
  onManaged: () => void) {
  const currentScope = useRef(scope); currentScope.current = scope;
  const last = useRef<{ id: string; scope: string } | null>(null);
  const draft = useRef<Draft | null>(null);
  const lock = useRef(false);
  function reset() { draft.current = null; last.current = null; }
  function active(expected: TaskScope) {
    const current = currentScope.current;
    return current === undefined ? expected.context === "live:USER"
      : !!current && key(current) === key(expected);
  }
  async function identity(): Promise<TaskScope> {
    const userId = await getTaskUser();
    if (!userId) throw new Error("Inicia sesión para gestionar avisos de tus tareas. No he creado ninguna tarea nueva.");
    const value = currentScope.current === undefined ? { userId, context: "live:USER" } : currentScope.current;
    if (!value || value.userId !== userId) throw new Error("Espera a que GO verifique tu cuenta y contexto antes de gestionar el aviso.");
    if ((last.current && last.current.scope !== key(value)) || (draft.current && key(draft.current.scope) !== key(value))) {
      reset(); a.reset(); throw new Error("La cuenta o el contexto ha cambiado. Repite la petición indicando la tarea.");
    }
    return { ...value };
  }
  async function remember(entry: GoEntry) {
    try { const value = await identity(); last.current = { id: entry.id, scope: key(value) }; }
    catch { last.current = null; }
  }
  async function perform(value: Draft) {
    draft.current = value;
    const { command, selected } = value;
    if (!selected && command.question?.includes("fecha válida")) {
      value.phase = "task"; a.say(command.question); return;
    }
    if (!selected) {
      value.phase = "task";
      a.say(value.entries.length > 1 ? "Hay varias tareas compatibles. ¿Cuál quieres?\n" + value.entries.map((entry, i) =>
        (i + 1) + ". " + entry.notes + " · " + (entry.dateISO || "Sin fecha") + " · " + (entry.time || "Sin hora")).join("\n")
        : "¿A qué tarea te refieres? Indica su título y, si hace falta, su fecha. No he creado otra tarea.");
      return;
    }
    last.current = { id: selected.id, scope: key(value.scope) };
    if (command.operation === "read") {
      const report = await refreshNativeTaskReminders(value.scope);
      await assertReminderScope(value.scope, () => active(value.scope));
      a.say(describeReminders(selected, report)); draft.current = null; return;
    }
    if (command.question) { value.phase = "interval"; a.say(command.question); return; }
    const offsets = reminderOffsets(selected);
    if ((command.operation === "replace" && command.previousMinutes === null && offsets.length !== 1)
      || (command.operation === "remove" && !command.all && command.minutes === null && offsets.length > 1)) {
      value.phase = "previous";
      a.say("¿Cuál de los avisos quieres " + (command.operation === "remove" ? "eliminar" : "cambiar")
        + "? Anticipaciones actuales: " + (offsets.join(", ") || "ninguna") + " minutos."); return;
    }
    if (command.operation === "remove") {
      if (!offsets.length || (command.minutes !== null && !command.all && !offsets.includes(command.minutes))) {
        draft.current = null; a.say("No encuentro ese aviso asociado a la tarea. No he cambiado nada."); return;
      }
      value.phase = "confirm";
      a.say("¿Confirmas eliminar " + (command.all || command.minutes === null ? "los avisos" : "el aviso de " + command.minutes + " minutos antes")
        + " de «" + selected.notes + "»? La tarea se conservará."); return;
    }
    const saved = await changeReminder(command, selected, value.scope, () => active(value.scope));
    const report = await refreshNativeTaskReminders(value.scope, true);
    await assertReminderScope(value.scope, () => active(value.scope));
    draft.current = null;
    a.say((command.operation === "replace" ? "He actualizado el aviso asociado a tu tarea.\n" : "He guardado el aviso asociado a tu tarea.\n") + describeReminders(saved, report));
  }
  async function handle(text: string): Promise<boolean> {
    const command = parseReminderCommand(text, localToday());
    if (!command && !draft.current) return false;
    if (lock.current || a.lock.current) return true;
    const n = normalizeBookingText(text).replace(/^[¿¡\s]+|[?!.\s]+$/g, "");
    // Allow explicit task edits/creation to proceed through their existing manager.
    if (!command && /^(?:cambia|modifica|mueve|pasa|crea|apunta|recu[eé]rdame|elimina|borra)\b/.test(n)) {
      draft.current = null; return false;
    }
    lock.current = true;
    try {
      a.say(text.trim(), "user"); a.setPanel(null);
      await a.work("Revisando el aviso de tu tarea…", async token => {
        const owner = await identity(); a.check(token);
        if (!command && /^(?:no|cancelar|cancela|olvida eso)$/.test(n)) {
          draft.current = null; a.say("Aviso sin cambios. La tarea se conserva."); return;
        }
        let value = draft.current;
        if (command) {
          onManaged();
          const id = last.current?.scope === key(owner) ? last.current.id : null;
          const entries = await selectReminderTasks(command, owner, id, () => active(owner)); a.check(token);
          value = { command, scope: owner, entries, selected: entries.length === 1 ? entries[0] : null, phase: "task" };
        } else if (!value) {
          a.say("El usuario o contexto ha cambiado. Repite la petición indicando la tarea."); return;
        } else if (value.phase === "confirm") {
          if (!/^(?:si|confirmo|confirmar|si confirmo|confirmar eliminacion)$/.test(n)) {
            a.say("Confirma con «sí» o cancela. No he eliminado ningún aviso."); return;
          }
          const saved = await changeReminder(value.command, value.selected!, owner, () => active(owner), true);
          const report = await refreshNativeTaskReminders(owner);
          await assertReminderScope(owner, () => active(owner));
          a.check(token); draft.current = null;
          a.say("Aviso eliminado. La tarea «" + saved.notes + "» se conserva.\n" + describeReminders(saved, report)); return;
        } else if (value.phase === "task") {
          const index = n.match(/^(?:la |el |numero |opcion )?(\d+)$/);
          const choice = index ? value.entries[Number(index[1]) - 1]
            : value.entries.filter(entry => normalizeBookingText(entry.notes || "") === n).length === 1
              ? value.entries.find(entry => normalizeBookingText(entry.notes || "") === n) : null;
          if (choice) {
            const entries = await selectReminderTasks({ ...value.command, contextual: true, query: "", date: null }, owner, choice.id, () => active(owner));
            value = { ...value, entries, selected: entries.length === 1 ? entries[0] : null };
          } else if (!value.entries.length) {
            const selector = parseReminderCommand("Pon un aviso a la tarea " + text + " una hora antes", localToday())!;
            const next = { ...value.command, query: selector.query, date: selector.date, contextual: false,
              question: value.command.question?.includes("fecha válida") ? selector.question : value.command.question };
            const entries = await selectReminderTasks(next, owner, null, () => active(owner));
            value = { ...value, command: next, entries, selected: entries.length === 1 ? entries[0] : null };
          }
        } else {
          if (value.phase === "previous" && value.command.operation === "remove" && n === "todos") {
            value = { ...value, command: { ...value.command, all: true } };
          } else {
            const intervals = reminderIntervals(text);
            if (intervals.length !== 1 || !Number.isInteger(intervals[0]) || intervals[0] <= 0 || intervals[0] > 525600) {
              a.say("Indica una anticipación válida en minutos, horas o días."); return;
            }
            value = { ...value, command: { ...value.command, question: null,
              ...(value.phase === "previous" && value.command.operation === "replace" ? { previousMinutes: intervals[0] } : { minutes: intervals[0] }),
            } };
          }
        }
        a.check(token);
        await perform(value);
      });
      return true;
    } finally { lock.current = false; }
  }
  return { reset, remember, handle };
}
