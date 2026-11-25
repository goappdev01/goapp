export const alertCategories = ["booking", "solicitud", "go", "pedido", "visita", "task"] as const;

export type GoAlertSettings = {
  mode: "sound" | "visual" | "silent";
  priority: "standard" | "high";
  categories: Record<(typeof alertCategories)[number], boolean>;
  intervalMinutes: 0 | 15 | 30 | 60;
  repeats: 0 | 1 | 2 | 3;
  quietHours: { enabled: boolean; start: string; end: string };
};

const time = /^([01]\d|2[0-3]):[0-5]\d$/;
export function validGoAlertSettings(value: unknown): value is GoAlertSettings {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const input = value as Record<string, unknown>;
  if (Object.keys(input).sort().join() !== "categories,intervalMinutes,mode,priority,quietHours,repeats") return false;
  if (!["sound", "visual", "silent"].includes(String(input.mode))
    || !["standard", "high"].includes(String(input.priority))
    || typeof input.intervalMinutes !== "number" || ![0, 15, 30, 60].includes(input.intervalMinutes)
    || typeof input.repeats !== "number" || ![0, 1, 2, 3].includes(input.repeats)) return false;
  const categories = input.categories;
  if (!categories || typeof categories !== "object" || Array.isArray(categories)) return false;
  const flags = categories as Record<string, unknown>;
  if (Object.keys(flags).sort().join() !== [...alertCategories].sort().join()
    || alertCategories.some(key => typeof flags[key] !== "boolean")) return false;
  const quiet = input.quietHours;
  if (!quiet || typeof quiet !== "object" || Array.isArray(quiet)) return false;
  const hours = quiet as Record<string, unknown>;
  return Object.keys(hours).sort().join() === "enabled,end,start"
    && typeof hours.enabled === "boolean" && typeof hours.start === "string" && time.test(hours.start)
    && typeof hours.end === "string" && time.test(hours.end);
}
