import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { fetchWithAuth, getAuthApiBase } from "./authSession";

export type ShoppingRemoteSnapshot = { revision: number; lists: GoEntry[]; activeListId: string | null };
const endpoint = () => getAuthApiBase() + "/supabase/shopping";

export class ShoppingRemoteAccessError extends Error {
  readonly code = "SHOPPING_ACCESS_DENIED";
}

async function responseError(response: Response): Promise<Error> {
  const body = await response.json().catch(() => ({})) as { error?: unknown };
  const message = typeof body.error === "string" ? body.error : "No se pudo sincronizar Compras con Supabase.";
  return response.status === 401 || response.status === 403 ? new ShoppingRemoteAccessError(message) : new Error(message);
}
export async function readShoppingRemote(scope: TaskScope): Promise<ShoppingRemoteSnapshot> {
  const response = await fetchWithAuth(endpoint() + "?context=" + encodeURIComponent(scope.context), {}, true, scope.userId);
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as ShoppingRemoteSnapshot;
  if (!Number.isSafeInteger(data.revision) || data.revision < 0 || !Array.isArray(data.lists)
    || data.activeListId != null && typeof data.activeListId !== "string") throw Error("Supabase devolvió una lista de Compras inválida.");
  return data;
}
export async function writeShoppingRemote(scope: TaskScope, expectedRevision: number, lists: GoEntry[], activeListId: string | null): Promise<number> {
  const response = await fetchWithAuth(endpoint(), { method: "PUT", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: scope.context, expectedRevision, lists, activeListId }) }, true, scope.userId);
  if (!response.ok) throw await responseError(response);
  const data = await response.json() as { revision?: unknown };
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) <= expectedRevision)
    throw Error("Supabase no confirmó la nueva versión de Compras.");
  return Number(data.revision);
}
