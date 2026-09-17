// SISTEMA DE TIEMPO GLOBAL
//
// Fuente única de verdad para fecha/hora en toda la app. Todas las
// funciones invocan `new Date()` en el momento de la llamada, por lo que
// siempre devuelven el "ahora" real del dispositivo (sin caché). Los
// callers obtienen valores frescos sin necesidad de un mecanismo extra de
// invalidación: basta con llamar a la función al abrir IA, al crear un
// GO, o en cualquier punto del flujo donde se necesite un anclaje
// temporal correcto.

export function getNow(): Date {
  return new Date();
}

export function getToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export function getDayOffset(n: number): Date {
  const d = getToday();
  d.setDate(d.getDate() + n);
  return d;
}

export function getTomorrow(): Date {
  return getDayOffset(1);
}

// Devuelve la fecha real del día de la semana indicado (0=domingo,
// 1=lunes, …, 6=sábado) DENTRO DE LA SEMANA EN CURSO desde HOY:
//   - Si hoy ya es ese día → devuelve HOY (no salta 7 días).
//   - Si el día está más adelante en la semana → devuelve esa fecha.
//   - Si el día ya pasó esta semana → devuelve la próxima ocurrencia
//     (semana siguiente).
// Esta es la semántica esperada por los CHIPS Lun/Mar/Mié/Jue/Vie/Sáb/Dom del
// calendario: "selecciona ESE día desde la fecha actual", sin saltar
// a una semana incorrecta cuando el día ya cae hoy.
export function getNextWeekday(weekday: number): Date {
  const today = getToday();
  const diff = (weekday - today.getDay() + 7) % 7;
  return getDayOffset(diff);
}

// Mapa de nombres de días en español → índice de getDay() (0=domingo).
// Acepta variantes con/sin acento y abreviaturas comunes.
export const WEEKDAY_INDEX: Record<string, number> = {
  domingo: 0, dom: 0,
  lunes: 1, lun: 1,
  martes: 2, mar: 2,
  miercoles: 3, "miércoles": 3, mie: 3, "mié": 3,
  jueves: 4, jue: 4,
  viernes: 5, vie: 5,
  sabado: 6, "sábado": 6, sab: 6, "sáb": 6,
};

// Formato ISO local YYYY-MM-DD (sin conversión a UTC, evita off-by-one
// en zonas horarias negativas). Es la representación CANÓNICA y única
// que se debe persistir o transmitir entre sistemas.
export function formatISODate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type DayLabel = "Hoy" | "Mañana" | "Pasado mañana" | string;

// Nombres completos de día de la semana en español, ya capitalizados
// para uso directo en UI ("Lunes", "Martes"…). Indexados por
// getDay() (0=domingo).
export const WEEKDAY_NAMES_ES = [
  "Domingo",
  "Lunes",
  "Martes",
  "Miércoles",
  "Jueves",
  "Viernes",
  "Sábado",
] as const;

// Abreviaturas de 3 letras/sílabas de los días de la semana usadas por
// los chips del calendario y la representación corta "Lun 05/05".
// Indexadas por getDay() (0=domingo). Formato estándar GO: mayúscula
// inicial + 2 letras, con tilde cuando corresponde.
export const WEEKDAY_LETTERS_ES = [
  "Dom", // 0 Domingo
  "Lun", // 1 Lunes
  "Mar", // 2 Martes
  "Mié", // 3 Miércoles
  "Jue", // 4 Jueves
  "Vie", // 5 Viernes
  "Sáb", // 6 Sábado
] as const;

export const WEEKDAY_LETTERS_EN = [
  "Sun", // 0 Sunday
  "Mon", // 1 Monday
  "Tue", // 2 Tuesday
  "Wed", // 3 Wednesday
  "Thu", // 4 Thursday
  "Fri", // 5 Friday
  "Sat", // 6 Saturday
] as const;

// Devuelve una etiqueta legible para una fecha respecto a hoy.
//   diff = 0  → "Hoy"
//   diff = 1  → "Mañana"
//   resto     → "L 05/05"  (letra del día de la semana + DD/MM)
// Es la representación humana usada en chips, resúmenes y listados.
// La SOURCE OF TRUTH siempre es la `Date` real; este label es solo UI.
export function formatDayLabel(d: Date): DayLabel {
  const today = getToday();
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round(
    (target.getTime() - today.getTime()) / (24 * 3600 * 1000),
  );
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  return formatDayLetterSlash(d);
}

// Formato compacto "Lun 05/05" — abreviatura de 3 letras del día + DD/MM —
// usado en chips de calendario, picker de día y status pills donde se
// quiere una representación corta e inequívoca de la fecha. NUNCA
// devuelve "Hoy" / "Mañana": esto es para SELECTORES, no para resumen.
export function formatDayLetterSlash(d: Date): string {
  const ltr = WEEKDAY_LETTERS_ES[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ltr} ${dd}/${mm}`;
}

// Lang-aware variant: uses English abbreviations when lang === 'en'.
export function formatDayLetterSlashLang(d: Date, lang: string): string {
  const letters = lang === 'en' ? WEEKDAY_LETTERS_EN : WEEKDAY_LETTERS_ES;
  const ltr = letters[d.getDay()];
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${ltr} ${dd}/${mm}`;
}

// ── formatHourByLocale ────────────────────────────────────────────────────────
// Formatea "HH:MM" (24h) según idioma + país del usuario.
// Usa Intl.DateTimeFormat, que ya sabe:
//   es-ES → 24h   →  13:00
//   en-US → 12h   →   1:00 PM
//   en-GB → 24h   →  13:00
// No hardcodear: se delega completamente al estándar ECMA-402.
export function formatHourByLocale(hhmm: string, locale: string): string {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hhmm;
  const h   = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  try {
    const date = new Date(2000, 0, 1, h, min, 0);
    return date.toLocaleTimeString(locale, {
      hour:   "numeric",
      minute: "2-digit",
    });
  } catch {
    // Fallback seguro: 24h
    return `${String(h).padStart(2, "0")}:${m[2]}`;
  }
}

// Resuelve la fecha real (Date) a partir de las etiquetas internas del
// parser de IA. Permite que la app trabaje con objetos Date verdaderos
// en vez de strings, manteniendo retrocompatibilidad con los labels.
export function dateFromLabel(
  label: "Hoy" | "Mañana" | "Luego" | "Pasado mañana" | string,
): Date {
  switch (label) {
    case "Hoy":
      return getToday();
    case "Mañana":
      return getTomorrow();
    case "Pasado mañana":
      return getDayOffset(2);
    case "Luego":
      // "Luego/esta tarde/esta noche" se ancla en el día actual; la hora
      // la resuelve el parser de hora por separado.
      return getToday();
    default:
      return getToday();
  }
}
