import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { boardsCache } from "@/lib/goBoardsCache";
import { canUseGoBoards, type BoardDocument } from "@workspace/api-zod";
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
  const store = useMemo(() => createBoardsStore(admin.userId || "", boardsCache, async (path, method = "GET", body, headers = {}) => {
    if (!access.current.allowed || access.current.user !== admin.userId) throw new Error("Acceso ADMIN no disponible.");
    return supabaseApiRequest(`/supabase/boards${path}`, { method,
      headers: { "X-GO-Context": "ADMIN", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, true, admin.userId || undefined);
  }, () => access.current.allowed && access.current.user === admin.userId), [admin.userId]);
  const state = useSyncExternalStore(store.subscribe, store.snapshot, store.snapshot);
  const projecting = useRef(false), latest = useRef<BoardDocument | null>(state.selected); latest.current = state.selected;
  useEffect(() => {
    if (!allowed) return;
    let refreshing = false;
    const refresh = async (initial: boolean) => {
      if (refreshing) return;
      refreshing = true;
      try {
      if (initial) await store.load(); else await store.sync();
      const entries = await readGoLog();
      for (const doc of store.allCached()) { const changed = calendarChanges(doc, entries); if (changed !== doc) await store.save(changed, false); }
      await store.loadCalendar();
      if (!access.current.allowed) return;
      projecting.current = true;
      try { await updateGoLog(entries => ({ entries: store.allCached().reduce((all, doc) => projectBoardCalendar(doc, all), entries), result: undefined }),
        () => { if (!access.current.allowed || access.current.user !== admin.userId) throw new Error("Perfil cambiado."); }); }
      finally { projecting.current = false; }
      await store.list();
      } finally { refreshing = false; }
    };
    void refresh(true).catch(error => { if (access.current.allowed) store.reportError((error as Error).message); });
    const listener = AppState.addEventListener("change", status => { if (status === "active" && access.current.allowed)
      void refresh(false).catch(error => store.reportError((error as Error).message)); });
    return () => listener.remove();
  }, [store, allowed]);
  useEffect(() => {
    if (!allowed) return;
    return subscribeGoLog(() => {
      if (projecting.current || !access.current.allowed) return;
      for (const doc of store.allCached()) {
        try {
          const changed = calendarChanges(doc, getGoLogSnapshot());
          if (changed !== doc) void store.save(changed, false).catch(error => store.reportError((error as Error).message));
        } catch { store.reportError("Revisa la tarea modificada en Calendario: tiene campos no válidos para Tableros. La versión guardada se conserva."); }
      }
    });
  }, [allowed, store]);
  useEffect(() => {
    const doc = state.selected;
    if (!allowed || !doc) return;
    projecting.current = true;
    void updateGoLog(entries => ({ entries: store.allCached().reduce((all, board) => projectBoardCalendar(board, all), entries), result: undefined }),
      () => { if (!access.current.allowed || access.current.user !== doc.ownerUserId) throw new Error("Cuenta o perfil cambiado."); })
      .finally(() => { projecting.current = false; }).catch(() => {});
  }, [state.selected, allowed]);
  return { store, state, allowed, async open(id: string) {
    // Reconcile same-device Calendar edits before replacing the cached projection.
    const entries = await readGoLog(), cached = store.cached(id);
    if (cached) { const changed = calendarChanges(cached, entries); if (changed !== cached) await store.save(changed); }
    await store.open(id);
  } };
}
