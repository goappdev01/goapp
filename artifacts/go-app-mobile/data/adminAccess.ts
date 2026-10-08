import AsyncStorage from "@react-native-async-storage/async-storage";
import { BookingApiError, getAuthenticatedUserId, supabaseApiRequest } from "./booking";

const sessionKey = "go_supabase_session_v1";
export type AdminAccess = { userId: string | null; allowed: boolean };

export async function getAdminAccess(): Promise<AdminAccess> {
  const before = await AsyncStorage.getItem(sessionKey);
  const userId = await getAuthenticatedUserId();
  if (!userId) return { userId: null, allowed: false };
  try {
    const access = await supabaseApiRequest<{ userId?: unknown; role?: unknown; allowed?: unknown; level?: unknown; permissions?: unknown }>(
      "/supabase/admin/access", {}, true, userId,
    );
    if (await AsyncStorage.getItem(sessionKey) !== before) throw new Error("Session changed");
    // A legacy profiles.role response is insufficient: require the membership contract.
    const grants = access?.permissions;
    const permitted = access?.level === "owner"
      ? ["admin.access", "development", "diagnostics", "maintenance", "memberships.manage", "ownership.manage"]
      : ["admin.access", "development", "diagnostics", "maintenance"];
    if (!access || access.userId !== userId || access.role !== "admin" || access.allowed !== true
      || !["owner", "technical"].includes(String(access.level))
      || !Array.isArray(grants) || !grants.includes("admin.access")
      || !grants.every(p => typeof p === "string" && permitted.includes(p))) {
      throw new Error("Invalid ADMIN authorization response");
    }
    return { userId, allowed: true };
  } catch (error) {
    if (error instanceof BookingApiError && [401, 403].includes(error.status)) {
      return { userId, allowed: false };
    }
    throw error;
  }
}
