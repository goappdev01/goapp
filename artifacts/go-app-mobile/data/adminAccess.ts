import { captureAuthIdentity, isAuthIdentityCurrent } from "@/lib/authSession";
import { BookingApiError, supabaseApiRequest } from "./booking";

export type AdminLevel = "owner" | "technical";
export type AdminAccess = { userId: string | null; allowed: boolean; level: AdminLevel | null; permissions: string[] };

export async function getAdminAccess(): Promise<AdminAccess> {
  const identity = await captureAuthIdentity();
  const userId = identity?.userId;
  if (!identity || !userId) return { userId: null, allowed: false, level: null, permissions: [] };
  try {
    const access = await supabaseApiRequest<{ userId?: unknown; role?: unknown; allowed?: unknown; level?: unknown; permissions?: unknown }>(
      "/supabase/admin/access", {}, true, userId,
    );
    if (!await isAuthIdentityCurrent(identity)) throw new Error("Session changed");
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
    return { userId, allowed: true, level: access.level as AdminLevel, permissions: [...grants] as string[] };
  } catch (error) {
    if (error instanceof BookingApiError && [401, 403].includes(error.status)) {
      return { userId, allowed: false, level: null, permissions: [] };
    }
    throw error;
  }
}
