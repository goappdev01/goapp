import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getBusinessAccess, type BusinessAccessSnapshot } from "@/data/businessAccess";
import { onSessionChanged } from "@/lib/sessionEvents";
import { useGoMode } from "./GoModeContext";

type BusinessAccessValue = {
  snapshot: BusinessAccessSnapshot | null;
  loading: boolean;
  allowed: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};
const Context = createContext<BusinessAccessValue>({ snapshot: null, loading: true, allowed: false, error: null, refresh: async () => {} });

export function GoBusinessAccessProvider({ children }: { children: React.ReactNode }) {
  const { activeMode } = useGoMode();
  const [snapshot, setSnapshot] = useState<BusinessAccessSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedMode, setCheckedMode] = useState<string | null>(null);
  const modeRef = useRef(activeMode);
  modeRef.current = activeMode;
  const revision = useRef(0);
  const inFlight = useRef<{ revision: number; promise: Promise<void> } | null>(null);
  const mounted = useRef(false);
  const refresh = useCallback((): Promise<void> => {
    const version = revision.current;
    if (inFlight.current?.revision === version) return inFlight.current.promise;
    setLoading(true);
    setError(null);
    const promise = getBusinessAccess().then(result => {
      if (mounted.current && version === revision.current) setSnapshot(result);
    }).catch(() => {
      if (mounted.current && version === revision.current) {
        setSnapshot(null);
        setError("No se pudo comprobar tu empresa. Comprueba la conexión y vuelve a intentarlo.");
      }
    }).finally(() => {
      if (mounted.current && version === revision.current) {
        setCheckedMode(modeRef.current);
        setLoading(false);
      }
      if (inFlight.current?.promise === promise) inFlight.current = null;
    });
    inFlight.current = { revision: version, promise };
    return promise;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const unsubscribe = onSessionChanged(() => {
      revision.current++;
      setSnapshot(null);
      void refresh();
    });
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener("change", next => {
      if (previous === "background" && next === "active") void refresh();
      previous = next;
    });
    return () => {
      mounted.current = false;
      revision.current++;
      unsubscribe();
      subscription.remove();
    };
  }, [refresh]);
  useEffect(() => { void refresh(); }, [activeMode, refresh]);

  const checking = loading || checkedMode !== activeMode;
  return <Context.Provider value={{ snapshot, loading: checking, error, refresh,
    allowed: !checking && !error && snapshot?.business?.verified === true }}>{children}</Context.Provider>;
}

export function useBusinessAccess() { return useContext(Context); }
