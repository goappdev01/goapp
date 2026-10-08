import { useEffect, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { DockPosition } from "@workspace/api-zod";
export const GO_DOCK_KEY = "go_booking_assistant_dock_v1";
type Preference = { position: DockPosition; base: "left" | "right" };
let snapshot: Preference | null = null;
let loaded = false;
let queue: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();
function publish(value: Preference | null) { snapshot = value; listeners.forEach(listener => listener()); }
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
const getSnapshot = () => snapshot;
export function readGoDockPreference(): Promise<void> {
  const next = queue.then(async () => {
    if (loaded) return;
    const value = JSON.parse(await AsyncStorage.getItem(GO_DOCK_KEY) || "null");
    loaded = true;
    publish(value && ["left", "center", "right"].includes(value.position)
      && ["left", "right"].includes(value.base) ? value : null);
  });
  queue = next.catch(() => {});
  return next;
}
export function writeGoDockPreference(position: DockPosition, base: "left" | "right"): Promise<void> {
  const next = queue.then(async () => {
    const value = { position, base };
    await AsyncStorage.setItem(GO_DOCK_KEY, JSON.stringify(value));
    loaded = true; publish(value);
  });
  queue = next.catch(() => {});
  return next;
}
export function useGoDockPreference(base: "left" | "right", visible: boolean) {
  const value = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  useEffect(() => { if (visible) void readGoDockPreference().catch(() => {}); }, [visible]);
  return { position: value?.base === base ? value.position : base,
    setPosition: (position: DockPosition, nextBase = base) => writeGoDockPreference(position, nextBase) };
}