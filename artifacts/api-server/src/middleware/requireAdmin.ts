import type { RequestHandler } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";
import { effectiveAdminPermissions, type AdminPermission } from "../lib/adminPermissions";

// Always check the live, server-owned membership for this authenticated identity.
// Neither editable user_metadata, email, request body nor a client role authorizes ADMIN.
export const requireAdmin: RequestHandler = async (req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  const authorization = req.header("authorization");
  if (!authorization?.match(/^Bearer \S+$/)) {
    res.status(401).json({ code: "AUTH_REQUIRED", error: "Inicia sesión." });
    return;
  }
  try {
    const response = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(authorization) });
    if (!response.ok) {
      res.status([401, 403].includes(response.status) ? 401 : 502)
        .json({ code: "ADMIN_ACCESS_UNAVAILABLE", error: "No se pudo comprobar el acceso." });
      return;
    }
    const user = await response.json() as { id?: unknown };
    if (typeof user?.id !== "string" || !user.id) throw new Error("Invalid authenticated identity");
    const query = new URLSearchParams({ user_id: `eq.${user.id}`, select: "user_id,level,permissions,active", limit: "1" });
    const memberships = await supabaseRequest(`/rest/v1/admin_memberships?${query}`, { headers: bearerHeader(authorization) });
    if (!memberships.ok) throw new Error("Membership authorization unavailable");
    const rows = await memberships.json() as { user_id?: unknown; level?: unknown; permissions?: unknown; active?: unknown }[];
    if (!Array.isArray(rows)) throw new Error("Invalid membership response");
    const permissions = rows.length === 1 ? effectiveAdminPermissions(rows[0]?.level, rows[0]?.permissions) : null;
    if (rows.length !== 1 || rows[0]?.user_id !== user.id || rows[0]?.active !== true || !permissions) {
      res.status(403).json({ code: "ADMIN_REQUIRED", error: "Acceso no autorizado." });
      return;
    }
    res.locals.adminUserId = user.id;
    res.locals.adminLevel = rows[0].level;
    res.locals.adminPermissions = permissions;
    next();
  } catch {
    // A network/membership failure denies access; it never deletes a real session.
    res.status(502).json({ code: "ADMIN_ACCESS_UNAVAILABLE", error: "No se pudo comprobar el acceso." });
  }
};

export function requireAdminPermission(permission: AdminPermission): RequestHandler {
  return (_req, res, next) => {
    if (!Array.isArray(res.locals.adminPermissions) || !res.locals.adminPermissions.includes(permission)) {
      res.status(403).json({ code: "ADMIN_PERMISSION_REQUIRED", error: "Acceso no autorizado." });
      return;
    }
    next();
  };
}
