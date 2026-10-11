import AsyncStorage from "@react-native-async-storage/async-storage";
import { createSessionManager, sessionForRequest } from "./sessionManager";
import { notifySessionChanged } from "./sessionEvents";

// Survives Fast Refresh so two module generations cannot rotate the same refresh token.
// Bump the key when the manager contract changes; this prevents a stale Fast Refresh
// instance from retaining an older save/logout return type.
const runtime = globalThis as typeof globalThis & { __goSessionManagerV2?: ReturnType<typeof createSessionManager> };
export const mobileSession = runtime.__goSessionManagerV2 ??= createSessionManager({
  storage: AsyncStorage,
  changed: notifySessionChanged,
  request: async (path, token, refresh) => {
    const base = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "")
      ?? (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`${base}${path}`, {
        method: refresh ? "POST" : "GET",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(refresh ? { body: JSON.stringify({ refresh_token: refresh }) } : {}),
        signal: controller.signal,
      });
      return { status: response.status, body: await response.json().catch(() => ({})) };
    } finally { clearTimeout(timer); }
  },
});

// Keep the same singleton and in-flight renewal across Fast Refresh.
export const getMobileRequestSession = () => sessionForRequest(mobileSession);
