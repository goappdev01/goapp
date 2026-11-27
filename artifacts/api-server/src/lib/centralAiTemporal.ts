/** The server clock is authoritative; the device supplies only its IANA display zone. */
export function centralAiTimeZone(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 100 || !/^[A-Za-z0-9_+./-]+$/.test(value)) return null;
  try { new Intl.DateTimeFormat("es-ES", { timeZone: value }); return value; }
  catch { return null; }
}

function wallDate(at: Date, zone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(at);
  const get = (type: string) => Number(parts.find(part => part.type === type)?.value);
  return new Date(Date.UTC(get("year"), get("month") - 1, get("day")));
}
const iso = (date: Date) => date.toISOString().slice(0, 10);
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86400000);

/** Recomputed for every provider turn, including midnight and DST transitions. */
export function centralAiTemporalContext(at: Date, zone: string | null): string {
  if (!zone) return `Instante actual UTC ${at.toISOString()}. Zona horaria del usuario no verificada; pide la zona solo si es imprescindible para una fecha relativa. La zona del establecimiento sigue siendo la autoridad para reservar.`;
  const local = wallDate(at, zone), weekday = local.getUTCDay(), monday = plusDays(local, -(weekday + 6) % 7);
  const date = (days: number) => iso(plusDays(local, days));
  const localClock = new Intl.DateTimeFormat("es-ES", { timeZone: zone, weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(at);
  const twoHours = new Date(at.getTime() + 2 * 3600000);
  const twoHoursLocal = new Intl.DateTimeFormat("es-ES", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(twoHours);
  const friday = plusDays(monday, 4), nextMonday = plusDays(monday, 7);
  return `Reloj fiable del servidor: ${at.toISOString()} UTC. Zona del usuario: ${zone}; hora local ${localClock}. Hoy ${date(0)}, mañana ${date(1)}, pasado mañana ${date(2)}. Este viernes ${iso(friday)}${friday < local ? " (ya pasó)" : ""}; próximo lunes ${iso(nextMonday)}; la semana que viene empieza ${iso(nextMonday)}. Dentro de dos horas: ${twoHours.toISOString()} UTC (${twoHoursLocal} en ${zone}). Recalcula con el reloj de este turno y consulta la disponibilidad en la zona del establecimiento.`;
}
