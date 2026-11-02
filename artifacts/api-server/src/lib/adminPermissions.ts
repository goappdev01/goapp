export const ADMIN_PERMISSIONS = [
  "admin.access", "development", "diagnostics", "maintenance",
  "memberships.manage", "ownership.manage",
] as const;
export type AdminPermission = typeof ADMIN_PERMISSIONS[number];
export type AdminLevel = "owner" | "technical";
export const TECHNICAL_PERMISSIONS: readonly AdminPermission[] = [
  "admin.access", "development", "diagnostics", "maintenance",
];

// Reject malformed or reserved grants rather than widening their meaning.
export function effectiveAdminPermissions(level: unknown, grants: unknown): AdminPermission[] | null {
  if (level !== "owner" && level !== "technical") return null;
  if (!Array.isArray(grants) || !grants.every(p => typeof p === "string" &&
    (level === "owner" ? ADMIN_PERMISSIONS : TECHNICAL_PERMISSIONS).includes(p as AdminPermission))) return null;
  if (level === "owner") return [...ADMIN_PERMISSIONS];
  if (!grants.includes("admin.access")) return null;
  return [...new Set(grants)] as AdminPermission[];
}
