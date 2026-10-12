import AsyncStorage from "@react-native-async-storage/async-storage";
import { searchZoneSchema, type SearchZone } from "@workspace/api-zod";

// Extend the existing preference family; never adopt its ownerless legacy value.
export const ASSISTANT_ZONE_KEY = "go_booking_assistant_zone_v1";
export type AssistantZoneScope = { userId: string; context: string };
export type AssistantZonePreference =
  | { mode: "fixed"; zone: SearchZone }
  | { mode: "current-location"; radiusKm: number };
const queues = new Map<string, Promise<unknown>>();
export function assistantZoneKey(scope: AssistantZoneScope): string {
  if (!scope.userId.trim() || !scope.context.trim()) throw new Error("ZONE_SCOPE_REQUIRED");
  return `${ASSISTANT_ZONE_KEY}:${encodeURIComponent(scope.userId)}:${encodeURIComponent(scope.context)}`;
}
function enqueue<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) || Promise.resolve()).catch(() => {}).then(operation);
  queues.set(key, next);
  void next.finally(() => { if (queues.get(key) === next) queues.delete(key); }).catch(() => {});
  return next;
}
export function parseAssistantZonePreference(value: unknown): AssistantZonePreference | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.mode === "current-location" && typeof data.radiusKm === "number"
    && Number.isFinite(data.radiusKm) && data.radiusKm > 0)
    return { mode: "current-location", radiusKm: data.radiusKm };
  if (data.mode === "fixed") {
    const parsed = searchZoneSchema.safeParse(data.zone);
    if (parsed.success) return { mode: "fixed", zone: parsed.data };
  }
  return null;
}
export function sameAssistantZonePreference(a: AssistantZonePreference | null, b: AssistantZonePreference | null): boolean {
  if (!a || !b || a.mode !== b.mode) return false;
  if (a.mode === "current-location" && b.mode === "current-location") return a.radiusKm === b.radiusKm;
  return a.mode === "fixed" && b.mode === "fixed" && a.zone.label === b.zone.label
    && a.zone.latitude === b.zone.latitude && a.zone.longitude === b.zone.longitude
    && a.zone.radiusKm === b.zone.radiusKm;
}
export function readAssistantZonePreference(scope: AssistantZoneScope): Promise<AssistantZonePreference | null> {
  const key = assistantZoneKey(scope), owner = { ...scope };
  return enqueue(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (data?.version !== 2 || data.userId !== owner.userId || data.context !== owner.context)
      throw new Error("ZONE_PREFERENCE_INVALID");
    const preference = parseAssistantZonePreference(data.preference);
    if (!preference) throw new Error("ZONE_PREFERENCE_INVALID");
    return preference;
  });
}
export function writeAssistantZonePreference(scope: AssistantZoneScope, value: AssistantZonePreference,
  canWrite: () => boolean | Promise<boolean>): Promise<AssistantZonePreference> {
  const key = assistantZoneKey(scope), owner = { ...scope };
  const preference = parseAssistantZonePreference(value);
  if (!preference) return Promise.reject(new Error("ZONE_PREFERENCE_INVALID"));
  return enqueue(key, async () => {
    if (!await canWrite()) throw new Error("ZONE_SCOPE_CHANGED");
    await AsyncStorage.setItem(key, JSON.stringify({ version: 2, ...owner, preference }));
    return preference;
  });
}