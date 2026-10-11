import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  isLandingVisualVariant,
  type LandingVisualVariant,
} from "@/components/landing/landingVariant";

const STORAGE_KEY = "go_landing_visual_variant_v1";

/** Local development preference; production always renders the original Landing. */
export function useLandingVisualVariant(): {
  landingVariant: LandingVisualVariant;
  setLandingVariant: (value: LandingVisualVariant) => void;
} {
  const [landingVariant, setVariant] = useState<LandingVisualVariant>("actual");
  const selectedByUser = useRef(false);
  const pendingWrite = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    if (!__DEV__) return;
    let active = true;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((saved) => {
        // A slow read must never overwrite a selection already made in Herramientas.
        if (active && !selectedByUser.current && isLandingVisualVariant(saved)) {
          setVariant(saved);
        }
      })
      .catch(() => {
        // Storage is optional: the original Landing remains the safe default.
      });
    return () => { active = false; };
  }, []);

  const setLandingVariant = useCallback((value: LandingVisualVariant) => {
    if (!__DEV__ || !isLandingVisualVariant(value)) return;
    selectedByUser.current = true;
    setVariant(value);
    // Keep the last choice persisted even when several options are tapped quickly.
    pendingWrite.current = pendingWrite.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, value))
      .catch(() => {
        // Selection still works for this session if local persistence is unavailable.
      });
  }, []);

  return { landingVariant: __DEV__ ? landingVariant : "actual", setLandingVariant };
}
