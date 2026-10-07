import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getAdminAccess } from "@/data/adminAccess";
import { onSessionChanged } from "@/lib/sessionEvents";

type AdminAccessValue = { allowed: boolean; refresh: () => Promise<boolean> };
const Context = createContext<AdminAccessValue>({ allowed: false, refresh: async () => false });

export function GoAdminAccessProvider({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  const revision = useRef(0);
  const mounted = useRef(false);
  const inFlight = useRef<{ revision: number; promise: Promise<boolean> } | null>(null);
  const refresh = useCallback((): Promise<boolean> => {
    const version = revision.current;
    if (inFlight.current?.revision === version) return inFlight.current.promise;
    setAllowed(false);
    const promise = getAdminAccess().then(access => {
      const granted = mounted.current && version === revision.current
        && AppState.currentState === "active" && access.allowed === true;
      if (mounted.current && version === revision.current) setAllowed(granted);
      return granted;
    }).catch(() => {
      if (mounted.current && version === revision.current) setAllowed(false);
      return false;
    }).finally(() => {
      if (inFlight.current?.promise === promise) inFlight.current = null;
    });
    inFlight.current = { revision: version, promise };
    return promise;
  }, []);

  useEffect(() => {
    mounted.current = true;
    const invalidate = () => { revision.current++; setAllowed(false); };
    const unsubscribe = onSessionChanged(() => { invalidate(); void refresh(); });
    const subscription = AppState.addEventListener("change", next => {
      invalidate();
      if (next === "active") void refresh();
    });
    void refresh();
    return () => { mounted.current = false; invalidate(); unsubscribe(); subscription.remove(); };
  }, [refresh]);

  // Permission is never persisted and is independent of the Usuario/Empresa context.
  return <Context.Provider value={{ allowed, refresh }}>{children}</Context.Provider>;
}

export function useAdminAccess() { return useContext(Context); }
