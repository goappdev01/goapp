import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { CompletionScope } from "@/lib/goActionCompletion";
import { DEFAULT_HISTORY_DAYS } from "@/lib/listadosHistory";

export function useListadosHistory(scope: CompletionScope | null) {
  const key = scope ? "go_list_history_days_v1:" + JSON.stringify([scope.userId, scope.context]) : null;
  const active = useRef(key);
  const revision = useRef(0);
  active.current = key;
  const [stored, setStored] = useState<{ key: string; days: number } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    setError("");
    if (!key) return;
    const expected = revision.current;
    let mounted = true;
    AsyncStorage.getItem(key).then(raw => {
      const days = Number(raw);
      if (mounted && active.current === key && revision.current === expected) setStored({ key, days: Number.isInteger(days) && days > 0 && days <= 3650 ? days : DEFAULT_HISTORY_DAYS });
    }).catch(() => { if (mounted && active.current === key) setError("No se pudo recuperar el plazo de ANTIGUAS."); });
    return () => { mounted = false; };
  }, [key]);
  const save = async (days: number) => {
    if (!key || !Number.isInteger(days) || days < 1 || days > 3650) return;
    revision.current++;
    try {
      await AsyncStorage.setItem(key, String(days));
      if (active.current === key) { setStored({ key, days }); setError(""); }
    } catch { if (active.current === key) setError("No se pudo guardar el plazo de ANTIGUAS. Vuelve a intentarlo."); }
  };
  return { days: stored?.key === key ? stored.days : DEFAULT_HISTORY_DAYS, save, error };
}
