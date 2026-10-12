import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusinessConfig } from "./GoBusinessConfigContext";
import { useAdminAccess } from "./GoAdminAccessContext";
import { type BusinessDemoStore } from "@/data/businessDemoStore";

import { createBusinessDemoCatalog, type BusinessDemoCatalog } from "@/data/businessDemoCatalog";

type Coordinates = NonNullable<BusinessConfig["coordinates"]>;
type LocationReturn = { token: number; userId: string; module: "empresa_config"; phase: "steps"; step: 1 };
type LocationReturnState = LocationReturn & { claimed: boolean; finished: boolean };
type Value = {
  catalog?: BusinessDemoCatalog; demo?: BusinessDemoStore; loaded: boolean; config?: BusinessConfig;
  saveDeviceCoordinates: (coordinates: Coordinates, expectedUserId: string, countryCode?: string, returnToken?: number) => Promise<void>;
  locationReturn?: LocationReturn;
  beginLocationReturn: (expectedUserId: string) => number;
  consumeLocationReturn: (token: number) => boolean;
  finishLocationReturn: (token: number) => void;
  clearLocationReturn: (token?: number) => void;
};
type PendingLocation = {
  userId: string; store: BusinessDemoStore; coordinates: Coordinates; countryCode?: string; returnToken?: number;
  stage: "foreground" | "checking" | "approved" | "writing";
  resolve: () => void; reject: (error: Error) => void; timer?: ReturnType<typeof setTimeout>;
};
const Context = createContext<Value>({ loaded: false,
  beginLocationReturn: () => { throw new Error("La prueba DEMO requiere un propietario autenticado."); },
  consumeLocationReturn: () => false, finishLocationReturn: () => {}, clearLocationReturn: () => {},
  saveDeviceCoordinates: async () => { throw new Error("La ubicación DEMO requiere un propietario autenticado."); },
});

/** One owner-scoped store shared by all visual contexts; permission never comes from storage. */
export function OwnerBusinessDemoProvider({ children, initialConfig }: {
  children: React.ReactNode; initialConfig: BusinessConfig;
}) {
  const admin = useAdminAccess();
  const adminRef = useRef(admin);
  adminRef.current = admin;
  const mounted = useRef(false);
  const permission = useRef({ userId: admin.userId, allowed: false });
  permission.current = { userId: admin.userId, allowed: admin.isOwner && !admin.checking };
  const catalog = useMemo(() => {
    if (!admin.userId) return undefined;
    const userId = admin.userId;
    return createBusinessDemoCatalog({ ownerUserId: userId, storage: AsyncStorage, initialConfig,
      canUse: () => mounted.current && permission.current.allowed && permission.current.userId === userId
        && AppState.currentState === "active",
    });
  }, [admin.userId, initialConfig]);
  const store = catalog?.getSelectedStore();
  const [catalogReady, setCatalogReady] = useState<BusinessDemoCatalog>();
  const storeRef = useRef(store);
  storeRef.current = store;
  const pending = useRef(new Set<PendingLocation>());
  const [ready, setReady] = useState<BusinessDemoStore>();
  const [version, render] = useState(0);
  // A native permission prompt may unmount the panel. This is only an ephemeral visual breadcrumb.
  const locationReturn = useRef<LocationReturnState | undefined>(undefined);
  const returnSequence = useRef(0);
  const finishLocation = useCallback((request: PendingLocation, error?: Error) => {
    if (!pending.current.delete(request)) return;
    if (request.timer !== undefined) clearTimeout(request.timer);
    if (error) request.reject(error); else request.resolve();
  }, []);
  const clearLocationReturn = useCallback((token?: number) => {
    const route = locationReturn.current;
    if (!route || (token !== undefined && route.token !== token)) return;
    locationReturn.current = undefined;
    for (const request of [...pending.current]) if (request.returnToken === route.token && request.stage !== "writing")
      finishLocation(request, new Error("La ruta de ubicación DEMO se ha cerrado."));
    if (mounted.current) render(value => value + 1);
  }, [finishLocation]);
  const beginLocationReturn = useCallback((expectedUserId: string) => {
    if (!mounted.current || !permission.current.allowed || permission.current.userId !== expectedUserId
      || AppState.currentState !== "active" || storeRef.current?.getSnapshot().ownerUserId !== expectedUserId)
      throw new Error("La prueba DEMO requiere el propietario autenticado.");
    clearLocationReturn();
    const token = ++returnSequence.current;
    locationReturn.current = { token, userId: expectedUserId, module: "empresa_config", phase: "steps", step: 1, claimed: false, finished: false };
    render(value => value + 1); return token;
  }, [clearLocationReturn]);
  const consumeLocationReturn = useCallback((token: number) => {
    const route = locationReturn.current;
    if (!route || route.token !== token || route.claimed || !permission.current.allowed
      || permission.current.userId !== route.userId || AppState.currentState !== "active") return false;
    route.claimed = true;
    if (route.finished) locationReturn.current = undefined;
    render(value => value + 1); return true;
  }, []);
  const finishLocationReturn = useCallback((token: number) => {
    const route = locationReturn.current;
    if (!route || route.token !== token) return;
    route.finished = true;
    // Keep the return target until the remounted wizard has actually consumed it.
    if (route.claimed) locationReturn.current = undefined;
    if (mounted.current) render(value => value + 1);
  }, []);
  const saveDeviceCoordinates = useCallback((coordinates: Coordinates, expectedUserId: string, countryCode?: string, returnToken?: number) => {
    return new Promise<void>((resolve, reject) => {
      const current = adminRef.current, target = storeRef.current;
      if (!mounted.current || !target || !expectedUserId || current.userId !== expectedUserId
        || target.getSnapshot().ownerUserId !== expectedUserId) {
        reject(new Error("La identidad propietaria de la prueba ha cambiado.")); return;
      }
      if (returnToken !== undefined && (locationReturn.current?.token !== returnToken || locationReturn.current.userId !== expectedUserId)) {
        reject(new Error("La ruta de ubicación DEMO se ha cerrado.")); return;
      }
      if (!Number.isFinite(coordinates.latitude) || !Number.isFinite(coordinates.longitude)
        || Math.abs(coordinates.latitude) > 90 || Math.abs(coordinates.longitude) > 180
        || (countryCode !== undefined && !/^[A-Z]{2}$/.test(countryCode))) {
        reject(new Error("La ubicación o el país de la prueba no son válidos.")); return;
      }
      const request: PendingLocation = { userId: expectedUserId, store: target,
        coordinates: { ...coordinates }, countryCode, returnToken, stage: "foreground", resolve, reject };
      pending.current.add(request);
      // A permission prompt/revalidation cannot leave a promise pending indefinitely.
      request.timer = setTimeout(() => {
        if (request.stage === "writing") return;
        finishLocation(request, new Error("No se pudo revalidar el propietario para guardar la ubicación."));
        if (request.returnToken !== undefined) clearLocationReturn(request.returnToken);
      }, 30000);
      render(value => value + 1);
    });
  }, [finishLocation, clearLocationReturn]);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener("change", () => render(value => value + 1));
    return () => {
      mounted.current = false; subscription.remove(); locationReturn.current = undefined;
      for (const request of [...pending.current]) finishLocation(request, new Error("La prueba DEMO se ha cerrado antes de guardar la ubicación."));
    };
  }, [finishLocation, clearLocationReturn]);
  useEffect(() => {
    let active = true;
    if (!catalog || !permission.current.allowed) { setCatalogReady(undefined); return; }
    const unsubscribe = catalog.subscribe(() => { if (active) render(value => value + 1); });
    void catalog.load().then(() => { if (active && permission.current.allowed) setCatalogReady(catalog); }).catch(error => { if (active && permission.current.allowed) Alert.alert("Empresa DEMO", String(error)); });
    return () => { active = false; unsubscribe(); };
  }, [catalog, admin.isOwner, admin.checking]);
  useEffect(() => {
    let active = true;
    if (!store || !permission.current.allowed) { setReady(undefined); return; }
    const unsubscribe = store.subscribe(() => { if (active) render(value => value + 1); });
    void store.load().then(() => {
      if (active && permission.current.allowed) setReady(store);
    }).catch(error => {
      if (active && permission.current.allowed) Alert.alert("Empresa DEMO", String(error));
      for (const request of [...pending.current]) if (request.store === store)
        finishLocation(request, error instanceof Error ? error : new Error(String(error)));
    });
    return () => { active = false; unsubscribe(); };
  }, [store, admin.isOwner, admin.checking, finishLocation]);
  const usable = permission.current.allowed && ready === store && !!store && catalogReady === catalog;
  useEffect(() => {
    const route = locationReturn.current;
    if (route && (admin.userId !== route.userId || (!admin.checking && !admin.isOwner))) clearLocationReturn(route.token);
  }, [admin.userId, admin.isOwner, admin.checking, clearLocationReturn]);
  useEffect(() => {
    for (const request of [...pending.current]) {
      if (!mounted.current || admin.userId !== request.userId || store !== request.store) {
        finishLocation(request, new Error("La identidad propietaria de la prueba ha cambiado.")); continue;
      }
      if (request.stage === "writing" || request.stage === "checking" || AppState.currentState !== "active") continue;
      if (request.stage === "foreground") {
        request.stage = "checking";
        // Revalidate the REAL owner UUID; a retained visual label never authorizes this operation.
        void adminRef.current.refreshOwner(request.userId).then(granted => {
          if (!pending.current.has(request)) return;
          if (!mounted.current || adminRef.current.userId !== request.userId || storeRef.current !== request.store || !granted) {
            finishLocation(request, new Error("El servidor no autoriza al propietario para guardar esta ubicación."));
            if (request.returnToken !== undefined) clearLocationReturn(request.returnToken);
            return;
          }
          request.stage = "approved"; render(value => value + 1);
        }).catch(error => finishLocation(request, error instanceof Error ? error : new Error(String(error))));
      } else if (!admin.checking && !admin.isOwner) {
        finishLocation(request, new Error("Los permisos de propietario ya no están autorizados."));
        if (request.returnToken !== undefined) clearLocationReturn(request.returnToken);
      } else if (usable) {
        request.stage = "writing";
        // The deadline bounds permission/revalidation only. A native storage write cannot be cancelled.
        if (request.timer !== undefined) { clearTimeout(request.timer); request.timer = undefined; }
        // Execute after the render that acknowledges fresh permission. Store guards remain unchanged.
        void request.store.updateConfig({ coordinates: request.coordinates,
          ...(request.countryCode ? { countryCode: request.countryCode } : {}),
        }).then(() => finishLocation(request)).catch(error =>
          finishLocation(request, error instanceof Error ? error : new Error(String(error))));
      }
    }
  }, [version, admin.userId, admin.isOwner, admin.checking, store, usable, finishLocation, clearLocationReturn]);
  return <Context.Provider value={{ catalog: usable ? catalog : undefined, demo: usable ? store : undefined, loaded: usable,
    config: usable ? store.getSnapshot().config : undefined, saveDeviceCoordinates,
    locationReturn: usable && locationReturn.current?.userId === admin.userId ? locationReturn.current : undefined,
    beginLocationReturn, consumeLocationReturn, finishLocationReturn, clearLocationReturn }}>{children}</Context.Provider>;
}
export function useOwnerBusinessDemo() { return useContext(Context); }
