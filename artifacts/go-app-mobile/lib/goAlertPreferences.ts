import { fetchWithAuth, getAuthApiBase } from "./authSession";

export const GO_ALERT_CATEGORIES = ["booking", "solicitud", "go", "pedido", "visita", "task"] as const;
export type GoAlertCategory = (typeof GO_ALERT_CATEGORIES)[number];
export type GoAlertSettings = {
  mode: "sound" | "visual" | "silent";
  priority: "standard" | "high";
  categories: Record<GoAlertCategory, boolean>;
  intervalMinutes: 0 | 15 | 30 | 60;
  repeats: 0 | 1 | 2 | 3;
  quietHours: { enabled: boolean; start: string; end: string };
};

export const DEFAULT_GO_ALERT_SETTINGS: GoAlertSettings = {
  mode: "sound",
  priority: "standard",
  categories: { booking: true, solicitud: true, go: true, pedido: true, visita: true, task: true },
  intervalMinutes: 15, repeats: 2,
  quietHours: { enabled: false, start: "22:00", end: "08:00" },
};

const validTime = /^([01]\d|2[0-3]):[0-5]\d$/;
export function parseGoAlertSettings(value: unknown): GoAlertSettings | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<GoAlertSettings>;
  if (!["sound", "visual", "silent"].includes(String(item.mode))
    || !["standard", "high"].includes(String(item.priority))
    || typeof item.intervalMinutes !== "number" || ![0, 15, 30, 60].includes(item.intervalMinutes)
    || typeof item.repeats !== "number" || ![0, 1, 2, 3].includes(item.repeats)
    || !item.categories || GO_ALERT_CATEGORIES.some(key => typeof item.categories?.[key] !== "boolean")
    || typeof item.quietHours?.enabled !== "boolean"
    || !validTime.test(item.quietHours.start) || !validTime.test(item.quietHours.end)) return null;
  return {
    mode: item.mode!, priority: item.priority!, categories: Object.fromEntries(GO_ALERT_CATEGORIES.map(key => [key, item.categories![key]])) as GoAlertSettings["categories"],
    intervalMinutes: item.intervalMinutes!, repeats: item.repeats!,
    quietHours: { enabled: item.quietHours.enabled, start: item.quietHours.start, end: item.quietHours.end },
  };
}

export function inQuietHours(settings: GoAlertSettings, at: number): boolean {
  if (!settings.quietHours.enabled) return false;
  const date = new Date(at), minute = date.getHours() * 60 + date.getMinutes();
  const toMinutes = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3));
  const start = toMinutes(settings.quietHours.start), end = toMinutes(settings.quietHours.end);
  return start === end ? true : start < end ? minute >= start && minute < end : minute >= start || minute < end;
}

export async function loadGoAlertSettings(userId: string): Promise<GoAlertSettings | null> {
  const response = await fetchWithAuth(`${getAuthApiBase()}/supabase/alert-preferences`, {}, true, userId);
  if (!response.ok) throw new Error("No se pudieron cargar las preferencias de alertas de tu cuenta.");
  const payload = await response.json();
  if (payload.settings === null) return null;
  const settings = parseGoAlertSettings(payload.settings);
  if (!settings) throw new Error("Las preferencias de alertas guardadas no son válidas.");
  return settings;
}

export async function saveGoAlertSettings(userId: string, settings: GoAlertSettings): Promise<GoAlertSettings> {
  const response = await fetchWithAuth(`${getAuthApiBase()}/supabase/alert-preferences`, {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ settings }),
  }, true, userId);
  if (!response.ok) throw new Error("No se pudieron guardar las preferencias de alertas.");
  const saved = parseGoAlertSettings((await response.json()).settings);
  if (!saved) throw new Error("No se pudo confirmar el guardado de alertas.");
  return saved;
}
