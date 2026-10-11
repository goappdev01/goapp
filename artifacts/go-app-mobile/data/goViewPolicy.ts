export type GoView = "ADMIN" | "BUSINESS" | "USER";

export function isGoView(value: unknown): value is GoView {
  return value === "ADMIN" || value === "BUSINESS" || value === "USER";
}

export function isOwnerAuthorization(allowed: unknown, level: unknown): boolean {
  return allowed === true && level === "owner";
}

export function ownerViewStorageKey(userId: string): string {
  return `go_owner_view_context_v1:${userId}`;
}

// Stored preference chooses presentation only after a server owner authorization.
export function resolveGoView(preferred: unknown, ownerAuthorized: unknown, adminAllowed: unknown, businessMode: unknown): GoView {
  if (ownerAuthorized === true && isGoView(preferred)) return preferred;
  if (adminAllowed === true) return "ADMIN";
  return businessMode === true ? "BUSINESS" : "USER";
}

export function isAuthorizedAdminView(view: unknown, adminAllowed: unknown): boolean {
  return view === "ADMIN" && adminAllowed === true;
}

export function isOwnerBusinessPreview(view: unknown, ownerAuthorized: unknown): boolean {
  return view === "BUSINESS" && ownerAuthorized === true;
}
