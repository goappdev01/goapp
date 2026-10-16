import { recordAuthTrace } from "@/lib/authTrace";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getAdminAccess, type AdminAccess } from "@/data/adminAccess";
import { onSessionChanged } from "@/lib/sessionEvents";

type AdminAccessValue = AdminAccess & {
  isOwner: boolean;
  checking: boolean;
  unavailable: boolean;
  refresh: () => Promise<boolean>;
  refreshOwner: (expectedUserId?: string) => Promise<boolean>;
};
const denied = (userId: string | null = null): AdminAccess => ({ userId, allowed: false, level: null, permissions: [] });
const Context = createContext<AdminAccessValue>({
  ...denied(), isOwner: false, checking: false, unavailable: false,
  refresh: async () => false, refreshOwner: async () => false,
});

export function GoAdminAccessProvider({ children }: { children: React.ReactNode }) {
  const [access, setAccess] = useState<AdminAccess & { checking: boolean; unavailable: boolean }>({ ...denied(), checking: false, unavailable: false });
  const revision = useRef(0);
  const mounted = useRef(false);
  const inFlight = useRef<{ revision: number; result: Promise<AdminAccess>; promise: Promise<boolean> } | null>(null);
  const check = useCallback(() => {
    const version = revision.current;
    recordAuthTrace("admin.check.start", { revision: version });
    if (inFlight.current?.revision === version) return inFlight.current;
    // Identity can retain a cosmetic preference during revalidation; privileges cannot.
    setAccess(current => ({ ...denied(current.userId), checking: true, unavailable: false }));
    const result = getAdminAccess().then(next => {
      const current = mounted.current && version === revision.current && AppState.currentState === "active";
      const granted = current && next.allowed === true;
      const resolved = granted ? next : denied(current ? next.userId : null);
      recordAuthTrace("admin.check.end", { revision: version, allowed: granted });
      if (mounted.current && version === revision.current) setAccess({ ...resolved, checking: false, unavailable: false });
      return resolved;
    }).catch(() => {
      recordAuthTrace("admin.check.error", { revision: version });
      if (mounted.current && version === revision.current) setAccess(current => ({ ...denied(current.userId), checking: false, unavailable: true }));
      return denied();
    }).finally(() => {
      if (inFlight.current?.result === result) inFlight.current = null;
    });
    const promise = result.then(next => next.allowed);
    const flight = { revision: version, result, promise };
    inFlight.current = flight;
    return flight;
  }, []);
  const refresh = useCallback((): Promise<boolean> => check().promise, [check]);
  const refreshOwner = useCallback(async (expectedUserId?: string): Promise<boolean> => {
    const version = revision.current;
    const next = await check().result;
    return mounted.current && version === revision.current && AppState.currentState === "active"
      && next.allowed === true && next.level === "owner"
      && (expectedUserId === undefined || next.userId === expectedUserId);
  }, [check]);

  useEffect(() => {
    mounted.current = true;
    const invalidate = (preserveIdentity = false) => {
      revision.current++;
      setAccess(current => ({ ...denied(preserveIdentity ? current.userId : null), checking: preserveIdentity, unavailable: false }));
    };
    const unsubscribe = onSessionChanged(() => { invalidate(); void refresh(); });
    const subscription = AppState.addEventListener("change", next => {
      invalidate(true);
      if (next === "active") void refresh();
    });
    void refresh();
    return () => { mounted.current = false; invalidate(); unsubscribe(); subscription.remove(); };
  }, [refresh]);

  // Permission is never persisted and is independent of the Usuario/Empresa context.
  return <Context.Provider value={{ ...access, isOwner: access.allowed && access.level === "owner", refresh, refreshOwner }}>{children}</Context.Provider>;
}

export function useAdminAccess() { return useContext(Context); }
