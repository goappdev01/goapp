import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AccountRole } from "@/components/auth/LoginRegisterPanel";

export const PENDING_REGISTRATION_KEY = "go_pending_email_confirmation_v1";
const SESSION_KEY = "go_supabase_session_v1";
const roles: AccountRole[] = ["usuario", "empresa", "admin", "trabajador", "proveedor", "partner", "franquicia"];
export type PendingRegistration = { email: string; role: AccountRole };

export async function readPendingRegistration(): Promise<PendingRegistration | null> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_REGISTRATION_KEY);
    const pending = raw ? JSON.parse(raw) : null;
    return typeof pending?.email === "string" && pending.email.includes("@") && roles.includes(pending.role)
      ? { email: pending.email.trim().toLowerCase(), role: pending.role }
      : null;
  } catch {
    return null;
  }
}

// Confirmation happens outside GO. Only a stored session validated by the
// existing backend can authenticate this return; otherwise use normal login.
export async function getConfirmedRegistrationRole(pending: PendingRegistration): Promise<AccountRole | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    const session = raw ? JSON.parse(raw) : null;
    if (typeof session?.access_token !== "string" || !session.access_token || typeof session.user?.id !== "string") return null;
    const apiBase = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "")
      ?? (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api");
    const response = await fetch(`${apiBase}/supabase/auth/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const payload = await response.json();
    const user = payload.user;
    if (user?.id !== session.user.id || typeof user.email !== "string"
      || user.email.toLowerCase() !== pending.email
      || !(user.email_confirmed_at || user.confirmed_at)) return null;
    // A logout or a new login must invalidate this older validation.
    if (await AsyncStorage.getItem(SESSION_KEY) !== raw) return null;
    const role = payload.profile?.role ?? user.user_metadata?.role;
    return roles.includes(role) ? role : null;
  } catch {
    // Never delete a session because return validation or connectivity failed.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
