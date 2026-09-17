import { useEffect, useState } from "react";
import {
  CuentaVerification,
  EMPTY_VERIFICATION,
  loadVerification,
} from "@/data/cuenta";

/**
 * Reads empresa verification state from AsyncStorage on mount.
 * Used by screens that need to gate features without prop drilling.
 */
export function useVerification(): CuentaVerification {
  const [verification, setVerification] = useState<CuentaVerification>(EMPTY_VERIFICATION);

  useEffect(() => {
    loadVerification().then(setVerification).catch(() => {});
  }, []);

  return verification;
}
