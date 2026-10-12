// Extends the appearance-only hook from b8254e5 with explicit confirmation and account isolation.
import { useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createLandingVisualPreference, initialLandingVisualState, landingVisualStorageKey,
  type LandingVisualState } from "@/components/landing/landingVisualPreference";
import type { LandingVisualVariant } from "@/components/landing/landingVariant";

export function useLandingVisualVariant(userId: string | null | undefined, enabled: boolean) {
  const key = userId ? landingVisualStorageKey(userId) : null;
  const [record, setRecord] = useState<{ key: string; state: LandingVisualState } | null>(null);
  const store = useRef<ReturnType<typeof createLandingVisualPreference> | null>(null);
  const allowed = useRef(enabled); allowed.current = enabled;
  useEffect(() => {
    if (!key) { store.current = null; setRecord(null); return; }
    const current = createLandingVisualPreference(AsyncStorage, key, state => setRecord({ key, state }));
    store.current = current;
    setRecord({ key, state: initialLandingVisualState() });
    void current.load();
    return () => { current.dispose(); if (store.current === current) store.current = null; };
  }, [key]);
  useEffect(() => { if (!enabled) store.current?.cancel(); }, [enabled]);
  const state = record?.key === key ? record.state : initialLandingVisualState();
  return {
    ...state,
    ready: enabled && state.ready,
    preview: enabled ? state.preview : null,
    startPreview: (variant: LandingVisualVariant) => allowed.current && !!store.current?.preview(variant),
    cancelPreview: () => store.current?.cancel(),
    confirm: () => allowed.current ? store.current?.confirm() ?? Promise.resolve(false) : Promise.resolve(false),
    recover: () => store.current?.recover(),
  };
}
