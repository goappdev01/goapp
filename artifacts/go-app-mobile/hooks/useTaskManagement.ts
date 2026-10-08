import { useRef, useState } from "react";
import { normalizeBookingText, stripGoAddress, taskClock, parseTaskCommand, parseTaskPatch, type TaskCommand } from "@workspace/api-zod";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { useBookingAssistant } from "./useBookingAssistant";
import { localToday } from "@/lib/bookingAssistant";
import { getTaskUser } from "@/lib/goTaskAccess";
import { selectTasks, changeTask, describeTask, type TaskSelection } from "@/lib/goTaskManagement";
type Assistant = ReturnType<typeof useBookingAssistant>;
type Managed = TaskSelection & { selected: GoEntry | null };
export function useTaskManagement(a: Assistant, onManaged: () => void, onAccountChange: () => void) {
  const [state, setState] = useState<Managed | null>(null);
  const draft = useRef<Managed | null>(null);
  const lock = useRef(false);
  const account = useRef<string | null | undefined>(undefined);
  function set(value: Managed | null) { draft.current = value; setState(value); }
  function reset() { set(null); }
  async function ensureAccount(): Promise<boolean> {
    const user = await getTaskUser();
    if (account.current !== undefined && user !== account.current) {
      account.current = user; reset(); onAccountChange();
      a.setNotice("La cuenta ha cambiado. Vuelve a solicitar la acción.");
      return false;
    }
    account.current = user;
    return true;
  }
  function review(selection: TaskSelection, selected: GoEntry | null) {
    set({ ...selection, selected });
    if (!selected) a.say("Hay varias tareas coincidentes. Elige una o di su número.");
    else if (selection.command.question) a.say(selection.command.question);
    else a.say(selection.command.operation === "delete"
      ? "Revisa la tarea y confirma explícitamente si quieres eliminarla."
      : "Revisa los cambios de la tarea antes de confirmarlos.");
  }
  async function open(command: TaskCommand, token: number) {
    onManaged();
    const selection = await selectTasks(command);
    a.check(token);
    if (!await ensureAccount()) return;
    if (command.operation === "read") {
      reset();
      a.say(selection.entries.length
        ? "Tus tareas:\n" + selection.entries.map((entry, i) => (i + 1) + ". " + describeTask(entry)).join("\n")
        : "No encuentro tareas tuyas con ese filtro. Los registros antiguos sin propietario verificado no se muestran.");
      return;
    }
    if (!command.query && !command.selectorDate) { reset(); a.say(command.question || "¿Qué tarea quieres cambiar?"); return; }
    if (!selection.entries.length) { reset(); a.say("No encuentro una tarea tuya que coincida. No he cambiado nada."); return; }
    review(selection, selection.entries.length === 1 ? selection.entries[0] : null);
  }
  async function choose(id: string) {
    if (lock.current || a.lock.current || !draft.current) return;
    lock.current = true;
    try {
      if (!await ensureAccount()) return;
      const current = draft.current;
      if (!current || !current.entries.some(entry => entry.id === id)) return;
      await a.work("Revisando tarea…", async token => {
        const fresh = await selectTasks(current.command, current.owner);
        a.check(token);
        const matches = fresh.entries.filter(entry => entry.id === id);
        if (matches.length !== 1) throw new Error("La tarea ya no coincide. Vuelve a consultarla.");
        review(fresh, matches[0]);
      });
    } finally { lock.current = false; }
  }
  async function confirm(time?: string) {
    if (lock.current || a.lock.current) return;
    lock.current = true;
    try {
      if (!await ensureAccount()) return;
      const current = draft.current;
      if (!current?.selected) { if (current) a.say("Primero elige una tarea."); return; }
      if (current.command.question) { a.say(current.command.question); return; }
      if (current.command.times.length && (!time || !current.command.times.includes(time))) {
        a.say("Elige la hora correcta antes de guardar."); return;
      }
      await a.work("Guardando en GO…", async token => {
        const saved = await changeTask(current, current.selected!, time, true);
        a.check(token);
        if (!await ensureAccount()) return;
        reset();
        a.say(current.command.operation === "delete"
          ? "Tarea eliminada: " + saved.notes
          : "Tarea actualizada: " + describeTask(saved));
      });
    } finally { lock.current = false; }
  }
  async function handle(text: string): Promise<boolean> {
    if (lock.current) return true;
    const n = normalizeBookingText(stripGoAddress(text)).replace(/^[¿¡\s]+|[?!.\s]+$/g, "");
    lock.current = true;
    let command: TaskCommand | null = null;
    try {
      if (!await ensureAccount()) return true;
      command = parseTaskCommand(text, localToday());
      if (draft.current && /^(?:cancelar|no|no confirmo|olvida eso|cancelar accion)$/.test(n)) {
        a.say(text, "user"); reset(); a.say("Acción descartada. No he cambiado la tarea."); return true;
      }
      if (draft.current && /^(?:si|confirmo|confirmar|confirmar eliminacion|eliminar|correcto|guardar)$/.test(n)) {
        lock.current = false;
        a.say(text, "user"); await confirm(); return true;
      }
      const current = draft.current;
      if (!command && current && !current.selected) {
        const number = n.match(/^(?:(?:la |el |numero |opcion )?)(\d+)$/);
        const entry = number ? current.entries[Number(number[1]) - 1]
          : current.entries.filter(e => normalizeBookingText(e.notes || "") === n).length === 1
            ? current.entries.find(e => normalizeBookingText(e.notes || "") === n) : undefined;
        a.say(text, "user");
        if (entry) { lock.current = false; await choose(entry.id); }
        else a.say("Elige una tarea del resumen o di su número; todavía no he cambiado nada.");
        return true;
      }
      if (!command && current?.selected && current.command.operation === "update") {
        const patch = parseTaskPatch(text, localToday());
        if (patch.date || patch.time || patch.times.length || patch.clearDate || patch.clearTime
          || /\b(?:a las?|fecha|hora)\b/.test(n)) {
          a.say(text, "user");
          review({ ...current, command: { ...current.command, ...patch,
            date: patch.date || current.command.date,
            time: patch.time || current.command.time,
            clearDate: patch.date ? false : patch.clearDate || current.command.clearDate,
            clearTime: patch.time || patch.times.length ? false : patch.clearTime || current.command.clearTime,
            times: taskClock(text).matched || patch.clearTime ? patch.times : current.command.times,
          } }, current.selected);
          return true;
        }
      }
      if (!command) { reset(); return false; }
      a.say(text.trim(), "user"); a.setPanel(null);
      await a.work("Consultando tus tareas…", token => open(command!, token));
      return true;
    } finally { lock.current = false; }
  }
  return { state, reset, handle, choose, confirm, ensureAccount };
}
