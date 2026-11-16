import { useEffect, useState } from "react";
import { AppState } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { readAuthSession } from "@/lib/authSession";
import { onSessionChanged } from "@/lib/sessionEvents";
import { goAccountIdentity, type GoAccountIdentity } from "@/lib/goMessageIdentity";

export function useGoAccountIdentity(): GoAccountIdentity {
  const [identity, setIdentity] = useState<GoAccountIdentity>({ userId: null, phone: "" });
  useEffect(() => {
    let disposed = false, revision = 0;
    const load = async () => {
      const request = ++revision;
      try {
        const session = await readAuthSession();
        if (!disposed && request === revision) setIdentity(goAccountIdentity(session));
      } catch {
        if (!disposed && request === revision) setIdentity({ userId: null, phone: "" });
      }
    };
    const unsubscribe = onSessionChanged(() => {
      // Discard the previous account synchronously, including while its replacement loads.
      setIdentity({ userId: null, phone: "" });
      void load();
    });
    const activity = AppState.addEventListener("change", state => { if (state === "active") void load(); });
    // Retire the old preference even on upgraded installs. Routing never reads it again.
    // Preserve historical phone drafts, device registration and all account/GO data.
    void AsyncStorage.setItem("go_demo_self_send_enabled", "false").catch(() => {
      console.warn("[GO] No se pudo desactivar la preferencia de pruebas antigua; el envío normal la ignora.");
    });
    void load();
    return () => { disposed = true; revision++; unsubscribe(); activity.remove(); };
  }, []);
  return identity;
}
