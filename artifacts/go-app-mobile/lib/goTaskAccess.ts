import type { GoEntry } from "@/components/AgendaOperativa";
import { getAuthenticatedUserId } from "@/data/booking";
export type OwnedGoEntry = GoEntry & { ownerUserId?: string };
export const getTaskUser = getAuthenticatedUserId;
export function isPersonalTask(entry: GoEntry): boolean {
  return entry.kind === "sent" && ["TAREA", "TAREA_INTERNA", "GO_INTERNO"].includes(entry.type || "")
    && !entry.recipients?.length && !/^lista\b/i.test(entry.notes || "") && !/^[-•] /m.test(entry.detail || "");
}
export function ownsTask(entry: GoEntry, userId: string): boolean {
  return (entry as OwnedGoEntry).ownerUserId === userId && isPersonalTask(entry);
}
export async function requireTaskUser(): Promise<string> {
  const user = await getTaskUser();
  if (!user) throw new Error("Inicia sesión para consultar o gestionar tus tareas.");
  return user;
}
export async function assertTaskUser(userId: string): Promise<void> {
  if (await getTaskUser() !== userId) throw new Error("La cuenta ha cambiado. Vuelve a solicitar la acción.");
}
