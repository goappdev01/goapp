import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { boardsCache } from "@/lib/goBoardsCache";
import { canUseGoBoards } from "@workspace/api-zod";
import { useGoView } from "@/contexts/GoViewContext";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { supabaseApiRequest } from "@/data/booking";
import { createBoardsStore } from "@/lib/goBoardsStore";
import { configureBoardTaskAccess } from "@/lib/goTaskAccess";
import { calendarChanges, projectBoardCalendar } from "@/lib/goBoards";
import { getGoLogSnapshot, readGoLog, subscribeGoLog, updateGoLog } from "@/lib/goLogStore";

export function useGoBoards() {
  const view = useGoView(), admin = useAdminAccess();
  const allowed = canUseGoBoards(view.view, admin.allowed && !admin.checking, admin.userId);
  configureBoardTaskAccess(admin.userId, allowed);
  useEffect(() => () => configureBoardTaskAccess(null, false), []);
  const access = useRef({ allowed, user: admin.userId }); access.current = { allowed, user: admin.userId };
  const currentStore = useRef<ReturnType<typeof createBoardsStore> | null>(null);
  const store = useMemo(() => {
    const active = (): boolean => access.current.allowed && access.current.user === admin.userId && currentStore.current === created;
    const created: ReturnType<typeof createBoardsStore> = createBoardsStore(admin.userId || "", boardsCache, async (path, method = "GET", body, headers = {}) => {
      if (!active()) throw new Error("Acceso ADMIN no disponible.");
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 10000);
      try {
        return await supabaseApiRequest(`/supabase/boards${path}`, { method,
          signal: controller.signal, headers: { "X-GO-Context": "ADMIN", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, true, admin.userId || undefined);
      } catch (error) {
        const denied = error as { code?: string; status?: number };
        if (currentStore.current === created && access.current.user === admin.userId && (denied.status === 401
          || ["AUTH_REQUIRED", "ADMIN_REQUIRED", "ADMIN_PERMISSION_REQUIRED"].includes(denied.code || ""))) {
          access.current.allowed = false;
          void admin.refresh();
        }
        throw error;
      } finally { clearTimeout(timer); }
    }, active);
    return created;
  }, [admin.userId]);
  currentStore.current = store;
  useEffect(() => {
    currentStore.current = store;
    return () => { if (currentStore.current === store) currentStore.current = null; };
  }, [store]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const projecting = useRef(0), refreshing = useRef<typeof store | null>(null);
  const [calendarStore, setCalendarStore] = useState<typeof store | null>(null);
  const [legacyDetected, setLegacyDetected] = useState(false);
  const refresh = useCallback(async () => {
    if (refreshing.current === store || !access.current.allowed || access.current.user !== admin.userId) return;
    refreshing.current = store;
    try {
      // Hydration has no API dependency. Its failure alone blocks local editing.
      await store.load();
      try {
        const entries = await readGoLog();
        for (const doc of store.allCached()) {
          if (store.hasPending(doc.id)) continue; // A stale projection must not undo a durable local edit after a crash.
          const changed = calendarChanges(doc, entries); if (changed !== doc) await store.save(changed, false);
        }
        if (access.current.allowed && access.current.user === admin.userId) setCalendarStore(store);
      } catch { store.reportError("No se pudo actualizar el vínculo con Calendario. La copia de Tableros se conserva."); }
      // All remote steps run independently of local commits and of each other's failures.
      await Promise.allSettled([store.sync(), store.loadCalendar(), store.list()]);
    } finally { if (refreshing.current === store) refreshing.current = null; }
  }, [store, admin.userId]);
  useEffect(() => {
    if (!allowed) return;
    let current = true;
    // The old store has no owner field. Detect it without adopting or modifying its data.
    void AsyncStorage.getItem("go_tableros_v1").then(raw => { if (current) setLegacyDetected(raw !== null); }).catch(() => {});
    const retry = () => { void refresh().catch(error => store.reportError((error as Error).message)); };
    retry();
    const listener = AppState.addEventListener("change", status => { if (status === "active" && access.current.allowed)
      retry(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") retry(); }, 20000);
    return () => { current = false; listener.remove(); clearInterval(timer); };
  }, [store, allowed, refresh]);
  useEffect(() => {
    if (!allowed || calendarStore !== store) return;
    return subscribeGoLog(() => {
      if (projecting.current || !access.current.allowed) return;
      for (const doc of store.allCached()) {
        try {
          const changed = calendarChanges(doc, getGoLogSnapshot());
          if (changed !== doc) void store.save(changed, false).catch(error => store.reportError((error as Error).message));
        } catch { store.reportError("Revisa la tarea modificada en Calendario: tiene campos no válidos para Tableros. La versión guardada se conserva."); }
      }
    });
  }, [allowed, store, calendarStore]);
  useEffect(() => {
    if (!allowed || !state.localReady || calendarStore !== store) return;
    projecting.current++;
    void updateGoLog(entries => ({ entries: store.allCached().reduce((all, board) => projectBoardCalendar(board, all), entries), result: undefined }),
      () => { if (!access.current.allowed || access.current.user !== admin.userId) throw new Error("Cuenta o perfil cambiado."); })
      .finally(() => { projecting.current--; }).catch(() => store.reportError("No se pudo actualizar el vínculo con Calendario. La copia de Tableros se conserva."));
  }, [state.revision, state.localReady, allowed, store, calendarStore]);
  return { store, state, allowed, refresh, legacyDetected, async open(id: string) {
    // Reconcile same-device Calendar edits before replacing the cached projection.
    try {
      const entries = await readGoLog(), cached = store.cached(id);
      if (cached && !store.hasPending(id)) { const changed = calendarChanges(cached, entries); if (changed !== cached) await store.save(changed); }
    } catch { store.reportError("No se pudo leer Calendario. Puedes abrir la copia local de Tableros."); }
    await store.open(id);
  } };
}
