import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getBusinessAccess, type BusinessAccessSnapshot } from "@/data/businessAccess";
import { onSessionChanged } from "@/lib/sessionEvents";
import { useGoMode } from "./GoModeContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { resolveBusinessAccess } from "@/data/businessAccess";

type BusinessAccessValue = {
  snapshot: BusinessAccessSnapshot | null;
  loading: boolean;
  allowed: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  selectBusiness: (id: string) => Promise<void>;
};
const Context = createContext<BusinessAccessValue>({ snapshot: null, loading: true, allowed: false, error: null, refresh: async () => {}, selectBusiness: async () => {} });

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
    const promise = getBusinessAccess().then(async result => {
      const selected = result.userId ? await AsyncStorage.getItem(`go_selected_business:${result.userId}`) : null;
      const resolved = result.userId ? resolveBusinessAccess(result.businesses ?? (result.business ? [result.business] : []), result.userId, selected) : result;
      if (mounted.current && version === revision.current) setSnapshot(resolved);
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
  const selectBusiness = async (id: string) => {
    if (!snapshot?.userId || !snapshot.businesses?.some(business => business.id === id)) throw new Error("Empresa no disponible.");
    revision.current++;
    setLoading(true);
    setSnapshot(null);
    try { await AsyncStorage.setItem(`go_selected_business:${snapshot.userId}`, id); }
    finally { await refresh(); }
  };
  return <Context.Provider value={{ snapshot, loading: checking, error, refresh, selectBusiness,
    allowed: !checking && !error && snapshot?.status === "verificada" && snapshot.business?.verified === true }}>{children}</Context.Provider>;
}

export function useBusinessAccess() { return useContext(Context); }
