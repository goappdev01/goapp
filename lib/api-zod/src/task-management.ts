import { emptyBookingRequest, normalizeBookingText, parseBookingRequest } from "./booking-assistant";
import { stripGoAddress, taskClock } from "./task-creation";
export type TaskCommand = {
  operation: "read" | "update" | "delete";
  source: string; query: string; selectorDate: string | null;
  period: "all" | "day" | "week"; pendingOnly: boolean; invalidSelector: boolean;
  date: string | null; time: string | null; clearDate: boolean; clearTime: boolean;
  times: string[]; question: string | null;
};
const days = ["domingo", "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
function dateIn(text: string, today: string): string | null {
  const n = normalizeBookingText(text.replace(/(?:de|por) la ma[ñn]ana/gi, ""));
  const day = days.findIndex(d => new RegExp("\\b" + d + "\\b").test(n));
  if (day === new Date(today + "T12:00:00Z").getUTCDay() && !/\b(?:proximo|siguiente)\b/.test(n)) return today;
  return parseBookingRequest(n, emptyBookingRequest(), today).date;
}
const hasDate = (text: string) => /\b(?:hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})\b/.test(
  normalizeBookingText(text.replace(/(?:de|por) la ma[ñn]ana/gi, "")));
export function parseTaskPatch(text: string, today: string) {
  const n = normalizeBookingText(text);
  const clock = taskClock(text);
  const clearDate = /\bsin fecha\b/.test(n), clearTime = /\bsin hora\b/.test(n);
  const date = clearDate ? null : dateIn(text, today);
  const time = clearTime ? null : clock.time;
  const question = clock.invalid ? "¿A qué hora? Indica una hora válida o di «sin hora»."
    : hasDate(text) && !date && !clearDate ? "¿Qué fecha válida quieres asignarle?"
    : !date && !time && !clock.candidates.length && !clearDate && !clearTime ? "¿Qué fecha u hora quieres cambiar?" : null;
  return { date, time, clearDate, clearTime, times: clearTime ? [] : clock.candidates, question };
}
export function parseTaskCommand(text: string, today: string): TaskCommand | null {
  const clean = stripGoAddress(text).replace(/^[¿¡\s]+|[?!.\s]+$/g, "");
  const n = normalizeBookingText(clean);
  if (/\b(?:notas?|listas?|reservas?)\b/.test(n) && !/\btareas?\b/.test(n)) return null;
  const operation = /^(?:elimina|borra|suprime)\b/.test(n) ? "delete"
    : /^(?:cambia|modifica|mueve|pasa|reprograma)\b/.test(n) ? "update"
    : /^(?:que (?:tareas? )?tengo|muestra(?:me)?|ensena(?:me)?|consulta|ver (?:mis|las) tareas)\b/.test(n) ? "read" : null;
  if (!operation) return null;
  if (operation === "read" && !/^que (?:tareas? )?tengo\b/.test(n)
    && !/\b(?:tareas?|agenda|calendario|actividades)\b/.test(n)) return null;
  let selector = clean, destination = "";
  if (operation !== "read") {
    selector = clean.replace(/^\S+\s+/, "");
    if (operation === "update") {
      const split = selector.search(/\s+(?:a las?|al|para)\s+/i);
      if (split >= 0) { destination = selector.slice(split); selector = selector.slice(0, split); }
      else if (/\bsin (?:hora|fecha)\b/.test(n)) {
        const split = selector.search(/\s+sin (?:hora|fecha)\b/i);
        destination = selector.slice(split); selector = selector.slice(0, split);
      }
    }
  }
  const selectorDate = dateIn(selector, today);
  const query = operation === "read" ? "" : normalizeBookingText(selector)
    .replace(/\b(?:pasado manana|manana|hoy|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}(?:[/-]\d{4})?)\b/g, "")
    .replace(/\b(?:la|el|las|los|una|un|tarea|evento|actividad|del|de|para|este|esta|proximo)\b/g, "")
    .replace(/\s+/g, " ").trim();
  const patch = operation === "update" ? parseTaskPatch(destination, today)
    : { date: null, time: null, clearDate: false, clearTime: false, times: [], question: null };
  return {
    operation, source: text, query, selectorDate, invalidSelector: hasDate(selector) && !selectorDate, pendingOnly: /\bpendientes?\b/.test(n),
    period: /\besta semana\b/.test(n) ? "week" : selectorDate ? "day" : "all", ...patch,
    question: hasDate(selector) && !selectorDate ? "¿Qué fecha válida quieres consultar o seleccionar?" : operation !== "read" && !query && !selectorDate ? "¿Qué tarea quieres modificar o eliminar?" : patch.question,
  };
}
export function taskWeek(today: string): [string, string] {
  const start = new Date(today + "T12:00:00Z");
  start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
  const end = new Date(start); end.setUTCDate(end.getUTCDate() + 6);
  return [start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)];
}
