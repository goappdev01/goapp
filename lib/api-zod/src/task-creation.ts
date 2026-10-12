import { bookingRequestSchema, normalizeBookingText } from "./booking-assistant";
import type { GoAction } from "./go-actions";

export const stripGoAddress = (text: string) => text.trim().replace(/^(?:oye\s+)?go\b[\s,:;.!¿?¡-]*/i, "").trim();
const spokenHours: Record<string, number> = {
  una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6,
  siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, trece: 13,
  catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18,
  diecinueve: 19, veinte: 20, veintiuna: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
};
const clock = /(?:\ba (?:la|las)|\blas?)\s+(\d{1,2}|veintitr[eé]s|veintid[oó]s|veintiun[ao]|diecinueve|dieciocho|diecisiete|diecis[eé]is|catorce|quince|trece|veinte|cuatro|cinco|siete|ocho|nueve|diez|once|doce|seis|tres|dos|un[ao])(?::(\d{1,2}))?(?:\s+(y media|y cuarto|menos cuarto))?(?:\s+(?:de|por) la (ma[ñn]ana|tarde|noche))?\b/i;
export function taskClock(text: string): { time: string | null; candidates: string[]; matched: string | null; invalid: boolean } {
  const match = text.match(clock) || text.trim().match(/^(\d{1,2}):(\d{1,2})$/);
  if (!match) return { time: null, candidates: [], matched: null, invalid: /\ba las?\b/i.test(text) };
  let hour = /^\d+$/.test(match[1]) ? Number(match[1]) : spokenHours[normalizeBookingText(match[1])];
  const requestedHour = hour;
  const fraction = normalizeBookingText(match[3] || "");
  let minute = Number(match[2] || 0);
  if (fraction === "y media") minute = 30;
  if (fraction === "y cuarto") minute = 15;
  if (fraction === "menos cuarto") { hour = (hour + 23) % 24; minute = 45; }
  const period = normalizeBookingText(match[4] || "");

  if (period === "manana" && hour === 12) hour = 0;
  if ((period === "tarde" || period === "noche") && hour < 12) hour += 12;
  if (period === "noche" && hour === 12) hour = 0;
  const value = String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
  if (!bookingRequestSchema.shape.timeFrom.safeParse(value).success)
    return { time: null, candidates: [], matched: match[0], invalid: true };
  const explicit24h = /^0\d/.test(match[1]) || /^\d{1,2}:\d{2}$/.test(text.trim());
  if (!period && !explicit24h && requestedHour >= 1 && requestedHour <= 12) {
    const other = String((hour + 12) % 24).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
    return { time: null, candidates: [value, other], matched: match[0], invalid: false };
  }
  return { time: value, candidates: [], matched: match[0], invalid: false };
}
export type TaskCreationAssessment = {
  action: GoAction; question: string | null; reason: string | null; times: string[];
};
/** Local ambiguity checks also apply to AI output; an unqualified hour is never guessed. */
export function assessTaskCreation(raw: GoAction): TaskCreationAssessment {
  const action = { ...raw };
  const clock = taskClock(action.source);
  const n = normalizeBookingText(action.source);
  if (/\bsin hora\b/.test(n)) action.time = null;
  else if (clock.time) action.time = clock.time;
  if (clock.invalid) return { action: { ...action, time: null }, question: "¿A qué hora? Indica una hora válida, por ejemplo 17:30.", reason: null, times: [] };
  const requestedDate = /\b(?:hoy|pasado manana|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2})\b/.test(n.replace(/de la manana/g, ""));
  if (requestedDate && !action.date && !/\b(?:antes|esta semana)\b/.test(n))
    return { action, question: "¿Qué fecha válida quieres asignarle?", reason: null, times: [] };
  if (clock.candidates.length)
    return { action: { ...action, time: null }, question: null, reason: "Esa hora puede ser de mañana o de tarde/noche. Elige la correcta antes de guardar.", times: clock.candidates };
  if (/\b(?:por la (?:manana|tarde|noche)|antes|esta semana)\b/.test(n) && !action.time)
    return { action: { ...action, detail: action.detail || action.source }, question: null,
      reason: "He conservado la franja o el plazo como detalle, sin asignar una hora ni una fecha inventadas.", times: [] };
  return { action, question: null, reason: null, times: [] };
}
