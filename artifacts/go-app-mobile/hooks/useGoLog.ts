import { useEffect, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import type { GoEntry } from "@/components/AgendaOperativa";
import { getGoLogSnapshot, readGoLog, subscribeGoLog, updateGoLog } from "@/lib/goLogStore";

const setGoLog: Dispatch<SetStateAction<GoEntry[]>> = update => {
  void updateGoLog(entries => ({
    entries: typeof update === "function" ? update(entries) : update,
    result: undefined,
  })).catch(error => console.warn("[GO] No se pudo guardar la agenda", error));
};
/** Manual GO and IA observe and update the same committed record. */
export function useGoLog(): [GoEntry[], Dispatch<SetStateAction<GoEntry[]>>] {
  const entries = useSyncExternalStore(subscribeGoLog, getGoLogSnapshot, getGoLogSnapshot);
  useEffect(() => {
    void readGoLog().catch(error => console.warn("[GO] No se pudo leer la agenda", error));
  }, []);
  return [entries, setGoLog];
}
