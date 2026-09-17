import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";

export type GoMode = "USER" | "BUSINESS";

const STORAGE_KEY = "go_active_mode_v1";
const ACCOUNT_KEY = "go_account_type_v1";

const EMPRESA_ROLES = new Set(["empresa", "admin", "trabajador", "proveedor", "partner", "franquicia"]);

function modeFromRole(role: string | null): GoMode {
  if (!role) return "USER";
  return EMPRESA_ROLES.has(role) ? "BUSINESS" : "USER";
}

interface GoModeContextValue {
  activeMode: GoMode;
  isBusinessMode: boolean;
  isUserMode: boolean;
  loaded: boolean;
  setActiveMode: (mode: GoMode) => void;
  syncModeFromRole: (role: string | null) => void;
}

const GoModeContext = createContext<GoModeContextValue>({
  activeMode: "USER",
  isBusinessMode: false,
  isUserMode: true,
  loaded: false,
  setActiveMode: () => {},
  syncModeFromRole: () => {},
});

export function GoModeProvider({ children }: { children: React.ReactNode }) {
  const [activeMode, setActiveModeState] = useState<GoMode>("USER");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY)
      .then((stored) => {
        if (stored === "USER" || stored === "BUSINESS") {
          setActiveModeState(stored as GoMode);
          setLoaded(true);
        } else {
          AsyncStorage.getItem(ACCOUNT_KEY)
            .then((role) => {
              const derived = modeFromRole(role);
              setActiveModeState(derived);
              AsyncStorage.setItem(STORAGE_KEY, derived).catch(() => {});
              setLoaded(true);
            })
            .catch(() => { setLoaded(true); });
        }
      })
      .catch(() => { setLoaded(true); });
  }, []);

  const setActiveMode = useCallback((mode: GoMode) => {
    setActiveModeState(mode);
    AsyncStorage.setItem(STORAGE_KEY, mode).catch(() => {});
  }, []);

  const syncModeFromRole = useCallback((role: string | null) => {
    const derived = modeFromRole(role);
    setActiveModeState(derived);
    AsyncStorage.setItem(STORAGE_KEY, derived).catch(() => {});
  }, []);

  const isBusinessMode = activeMode === "BUSINESS";
  const isUserMode = activeMode === "USER";

  return (
    <GoModeContext.Provider value={{ activeMode, isBusinessMode, isUserMode, loaded, setActiveMode, syncModeFromRole }}>
      {children}
    </GoModeContext.Provider>
  );
}

export function useGoMode(): GoModeContextValue {
  return useContext(GoModeContext);
}
