import AsyncStorage from "@react-native-async-storage/async-storage";
import { captureAuthIdentity, isAuthIdentityCurrent, fetchWithAuth, readAuthSession } from "./authSession";
import type { AccountRole } from "@/components/auth/LoginRegisterPanel";

export const PENDING_REGISTRATION_KEY = "go_pending_email_confirmation_v1";
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
    const identity = await captureAuthIdentity();
    const session = await readAuthSession();
    if (typeof session?.access_token !== "string" || !session.access_token || typeof session.user?.id !== "string") return null;
    const apiBase = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "")
      ?? (process.env.EXPO_PUBLIC_DOMAIN ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : "/api");
    const response = await fetchWithAuth(`${apiBase}/supabase/auth/me`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    }, true, session.user.id);
    if (!response.ok) return null;
    const payload = await response.json();
    const user = payload.user;
    if (user?.id !== session.user.id || typeof user.email !== "string"
      || user.email.toLowerCase() !== pending.email
      || !(user.email_confirmed_at || user.confirmed_at)) return null;
    // A logout or a new login must invalidate this older validation.
    if (!identity || !await isAuthIdentityCurrent(identity)) return null;
    const role = payload.profile?.role ?? user.user_metadata?.role;
    return roles.includes(role) ? role : null;
  } catch {
    // Never delete a session because return validation or connectivity failed.
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
