import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

export const CONFIG_PANEL_KEYS = {
  calendar: "cal_config_visible_v1",
  agenda: "agenda_config_visible_v1",
  reservations: "reservas_config_visible_v1",
  listFiltersHidden: "list_filters_hidden_v1",
} as const;

type PreferenceStorage = Pick<typeof AsyncStorage, "getItem" | "setItem">;
// Keep writes ordered even when a screen is quickly closed and mounted again.
const writes = new WeakMap<PreferenceStorage, Map<string, Promise<void>>>();
function pendingWrites(storage: PreferenceStorage) {
  let pending = writes.get(storage);
  if (!pending) { pending = new Map(); writes.set(storage, pending); }
  return pending;
}

/** Only direct user actions call the setter; navigation must leave this choice intact. */
export function useConfigPanelPreference(key: string, initialValue = false, storage: PreferenceStorage = AsyncStorage) {
  const scopeRef = useRef({ key, storage, initialValue, current: initialValue, revision: 0 });
  if (scopeRef.current.key !== key || scopeRef.current.storage !== storage || scopeRef.current.initialValue !== initialValue) {
    scopeRef.current = { key, storage, initialValue, current: initialValue, revision: 0 };
  }
  const scope = scopeRef.current;
  const [snapshot, setSnapshot] = useState({ scope, value: initialValue });

  useEffect(() => {
    let active = true;
    const revision = scope.revision;
    void (pendingWrites(storage).get(key) ?? Promise.resolve()).then(() => storage.getItem(key)).then(value => {
      // A slow restore must never undo a choice made while storage was loading.
      if (!active || scope.revision !== revision || revision !== 0) return;
      if (value !== "true" && value !== "false") return;
      scope.current = value === "true";
      setSnapshot({ scope, value: scope.current });
    }).catch(() => {});
    return () => { active = false; };
  }, [key, storage, scope]);

  const choose = useCallback((update: SetStateAction<boolean>) => {
    const value = typeof update === "function" ? update(scope.current) : update;
    scope.revision++;
    scope.current = value;
    setSnapshot({ scope, value });
    const pending = pendingWrites(storage);
    const next = (pending.get(key) ?? Promise.resolve()).then(() => storage.setItem(key, String(value)));
    pending.set(key, next.catch(() => {}));
  }, [key, storage, scope]);

  return [snapshot.scope === scope ? snapshot.value : initialValue, choose] as const;
}
