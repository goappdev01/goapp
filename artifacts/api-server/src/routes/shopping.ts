import { Router, type IRouter } from "express";
import { bearerHeader, supabaseRequest } from "../lib/supabase";

const router: IRouter = Router();
const contextPattern = /^(live:ADMIN|(live|demo):USER|live:BUSINESS|demo:BUSINESS:[^:]+)$/;

async function identity(authorization: string | undefined): Promise<string | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const response = await supabaseRequest("/auth/v1/user", { headers: bearerHeader(authorization) });
  if (!response.ok) return null;
  const user = await response.json() as { id?: unknown };
  return typeof user.id === "string" ? user.id : null;
}

router.get("/", async (req, res) => {
  const context = String(req.query.context ?? "");
  if (!contextPattern.test(context)) { res.status(400).json({ error: "Contexto de Compras inválido." }); return; }
  try {
    const owner = await identity(req.header("authorization"));
    if (!owner) { res.status(401).json({ error: "Inicia sesión para sincronizar Compras." }); return; }
    const query = new URLSearchParams({ select: "revision,lists,active_list_id", user_id: `eq.${owner}`, context: `eq.${context}`, limit: "1" });
    const response = await supabaseRequest(`/rest/v1/go_shopping_snapshots?${query}`, { headers: bearerHeader(req.header("authorization")) });
    if (!response.ok) { res.status(503).json({ error: "No se pudo consultar Compras en Supabase." }); return; }
    const rows = await response.json() as { revision: number; lists: unknown[]; active_list_id: string | null }[];
    if (!Array.isArray(rows) || rows.length > 1) throw Error("Invalid shopping response");
    res.json(rows.length ? { revision: rows[0].revision, lists: rows[0].lists, activeListId: rows[0].active_list_id }
      : { revision: 0, lists: [], activeListId: null });
  } catch { res.status(503).json({ error: "No se pudo consultar Compras en Supabase." }); }
});

router.put("/", async (req, res) => {
  const input = req.body as { context?: unknown; expectedRevision?: unknown; lists?: unknown; activeListId?: unknown } | undefined;
  const context = input?.context;
  if (typeof context !== "string" || !contextPattern.test(context) || !Number.isSafeInteger(input?.expectedRevision)
    || Number(input?.expectedRevision) < 0 || !Array.isArray(input?.lists) || input.lists.length > 100
    || input?.activeListId != null && (typeof input.activeListId !== "string" || input.activeListId.length > 160)) {
    res.status(400).json({ error: "Datos de Compras inválidos." }); return;
  }
  try {
    const owner = await identity(req.header("authorization"));
    if (!owner) { res.status(401).json({ error: "Inicia sesión para guardar Compras." }); return; }
    const ids = new Set<string>();
    if (input.lists.some((row: unknown) => {
      if (!row || typeof row !== "object") return true;
      const entry = row as { id?: unknown; ownerUserId?: unknown; taskContext?: unknown; actionContext?: unknown; note?: { shopping?: { version?: unknown } } };
      if (typeof entry.id !== "string" || !entry.id || entry.id.length > 160 || ids.has(entry.id)) return true;
      ids.add(entry.id);
      return entry.ownerUserId !== owner || (entry.taskContext ?? entry.actionContext ?? "live:USER") !== context
        || entry.note?.shopping?.version !== 1;
    }) || input.activeListId != null && !ids.has(input.activeListId as string)) {
      res.status(400).json({ error: "La lista no pertenece a esta cuenta o contexto." }); return;
    }
    const response = await supabaseRequest("/rest/v1/rpc/go_shopping_save", { method: "POST",
      headers: { ...bearerHeader(req.header("authorization")), "Content-Type": "application/json" },
      body: JSON.stringify({ p_context: context, p_expected: input.expectedRevision, p_lists: input.lists,
        p_active_list_id: input.activeListId ?? null }) });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { code?: string };
      res.status(error.code === "40001" ? 409 : error.code === "22023" ? 400 : 503).json({
        error: error.code === "40001" ? "Compras cambió en otra sesión. Revisa los cambios antes de guardar." : "No se pudo guardar Compras en Supabase." });
      return;
    }
    const revision = await response.json() as unknown;
    if (!Number.isSafeInteger(revision) || Number(revision) <= Number(input.expectedRevision)) throw Error("Invalid shopping revision");
    res.json({ revision });
  } catch { res.status(503).json({ error: "No se pudo guardar Compras en Supabase." }); }
});

export default router;
