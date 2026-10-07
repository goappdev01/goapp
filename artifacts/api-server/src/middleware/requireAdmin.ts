import type { RequestHandler } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

// Always check the live, server-owned profile for this authenticated identity.
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
    const query = new URLSearchParams({ id: `eq.${user.id}`, select: "id,role", limit: "1" });
    const profiles = await supabaseRequest(`/rest/v1/profiles?${query}`, { headers: bearerHeader(authorization) });
    if (!profiles.ok) throw new Error("Profile authorization unavailable");
    const rows = await profiles.json() as { id?: unknown; role?: unknown }[];
    if (!Array.isArray(rows)) throw new Error("Invalid profile response");
    if (rows.length !== 1 || rows[0]?.id !== user.id || rows[0]?.role !== "admin") {
      res.status(403).json({ code: "ADMIN_REQUIRED", error: "Acceso no autorizado." });
      return;
    }
    res.locals.adminUserId = user.id;
    next();
  } catch {
    // A network/profile failure denies access; it never deletes a real session.
    res.status(502).json({ code: "ADMIN_ACCESS_UNAVAILABLE", error: "No se pudo comprobar el acceso." });
  }
};
