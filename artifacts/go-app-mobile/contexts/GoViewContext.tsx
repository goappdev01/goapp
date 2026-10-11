import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useAdminAccess } from "./GoAdminAccessContext";
import { useGoMode } from "./GoModeContext";
import {
  isAuthorizedAdminView, isGoView, isOwnerBusinessPreview, ownerViewStorageKey, resolveGoView, type GoView,
} from "@/data/goViewPolicy";

type GoViewValue = {
  view: GoView;
  loaded: boolean;
  isOwner: boolean;
  isAdminView: boolean;
  isBusinessPreview: boolean;
  selectOwnerView: (next: GoView) => Promise<boolean>;
};
const Context = createContext<GoViewValue>({
  view: "USER", loaded: true, isOwner: false, isAdminView: false, isBusinessPreview: false,
  selectOwnerView: async () => false,
});
type Preference = { userId: string; view: GoView; loaded: boolean } | null;

export function GoViewProvider({ children }: { children: React.ReactNode }) {
  const admin = useAdminAccess();
  const mode = useGoMode();
  const [preference, setPreference] = useState<Preference>(null);
  const preferenceRef = useRef<Preference>(null);
  const adminRef = useRef(admin);
  adminRef.current = admin;
  const generation = useRef(0);
  const selection = useRef(0);
  const mounted = useRef(false);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const remember = useCallback((next: Preference) => {
    preferenceRef.current = next;
    setPreference(next);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; generation.current++; };
  }, []);

  useEffect(() => {
    if (!admin.userId || (!admin.checking && !admin.isOwner)) {
      generation.current++;
      if (preferenceRef.current) remember(null);
      return;
    }
    if (!admin.isOwner || preferenceRef.current?.userId === admin.userId) return;
    const userId = admin.userId;
    const version = ++generation.current;
    remember({ userId, view: "USER", loaded: false });
    void AsyncStorage.getItem(ownerViewStorageKey(userId)).catch(() => null).then(stored => {
      const current = adminRef.current;
      if (mounted.current && version === generation.current && current.userId === userId
        && (current.isOwner || current.checking)) remember({ userId, view: isGoView(stored) ? stored : "ADMIN", loaded: true });
    });
  }, [admin.userId, admin.isOwner, admin.checking, remember]);

  const selectOwnerView = useCallback(async (next: GoView): Promise<boolean> => {
    if (!isGoView(next)) return false;
    const current = adminRef.current;
    const userId = current.userId;
    if (!userId) return false;
    const version = generation.current;
    const choice = ++selection.current;
    // A fresh owner check shares the ADMIN request and is bound to this identity.
    if (!await current.refreshOwner(userId)) return false;
    if (!mounted.current || version !== generation.current || choice !== selection.current || adminRef.current.userId !== userId) return false;
    const write = writes.current.catch(() => {}).then(() => AsyncStorage.setItem(ownerViewStorageKey(userId), next));
    writes.current = write;
    try { await write; } catch { return false; }
    if (!mounted.current || version !== generation.current || choice !== selection.current || adminRef.current.userId !== userId) return false;
    generation.current++; // Prevent a late initial storage read from replacing the explicit choice.
    remember({ userId, view: next, loaded: true });
    return true;
  }, [remember]);

  const belongsToIdentity = preference?.userId === admin.userId;
  const ownerPresentation = admin.isOwner || (belongsToIdentity && admin.checking);
  const loaded = !ownerPresentation || (belongsToIdentity && preference?.loaded === true);
  // A stored USER/BUSINESS choice must never flash ADMIN while storage is loading.
  // During revalidation, retain only the selected label, never its authority.
  const view = ownerPresentation
    ? loaded && preference ? preference.view : "USER"
    : resolveGoView(undefined, false, admin.allowed, mode.isBusinessMode);
  return <Context.Provider value={{
    view,
    loaded,
    isOwner: admin.isOwner,
    isAdminView: isAuthorizedAdminView(view, admin.allowed),
    isBusinessPreview: isOwnerBusinessPreview(view, admin.isOwner),
    selectOwnerView,
  }}>{children}</Context.Provider>;
}

export function useGoView() { return useContext(Context); }
