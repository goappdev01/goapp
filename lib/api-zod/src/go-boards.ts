import { z } from "zod";

export const boardViews = ["columns", "days", "week", "month", "undated"] as const;
const day = z.string().refine(value => { if (!value) return true;
  const at = new Date(value + "T12:00:00Z"); return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(at.getTime()) && at.toISOString().slice(0, 10) === value;
}, "Fecha inválida");
const clock = z.string().regex(/^$|^([01]\d|2[0-3]):[0-5]\d$/);
export const boardEntrySchema = z.object({
  id: z.string().min(1).max(160), ownerUserId: z.string().uuid(),
  taskContext: z.literal("ADMIN"), actionContext: z.literal("ADMIN"),
  kind: z.literal("sent"), type: z.literal("TAREA"), intentKey: z.string(), intentLabel: z.string(),
  color: z.string(), place: z.string(), date: z.string(), dateISO: day, time: clock,
  duration: z.string(), contactName: z.string(), phone: z.string(),
  estado: z.enum(["pendiente", "aceptado", "rechazado", "propuesto", "propuesta_pendiente"]),
  notes: z.string().min(1).max(500), detail: z.string().max(30000).optional(),
  localResolutionStatus: z.enum(["done", "pending"]).optional(), deleted: z.boolean().optional(),
  messages: z.array(z.object({ id: z.string(), text: z.string(), goId: z.string(), senderId: z.string(),
    createdAt: z.number(), deliveryMode: z.enum(["internal", "whatsapp"]) })).optional(),
}).passthrough().refine(entry => !!entry.dateISO || !entry.time, "La hora necesita una fecha");
export const boardColumnSchema = z.object({ id: z.string().uuid(), title: z.string().trim().min(1).max(120), archived: z.boolean() });
export const boardCardSchema = z.object({ entry: boardEntrySchema, columnId: z.string().uuid(),
  calendarLinked: z.boolean(), archived: z.boolean() });
export const boardDocumentSchema = z.object({
  id: z.string().uuid(), ownerUserId: z.string().uuid(), profile: z.literal("ADMIN"),
  name: z.string().trim().min(1).max(160), description: z.string().max(10000),
  cover: z.string().max(900000).nullable().refine(value => value === null || /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(value), "Portada inválida"),
  archived: z.boolean(), position: z.number().finite(), version: z.number().int().nonnegative(),
  removed: z.boolean().optional(),
  columns: z.array(boardColumnSchema), cards: z.array(boardCardSchema),
  view: z.enum(boardViews), anchorDate: day.refine(Boolean),
}).superRefine((board, context) => {
  const columns = new Set(board.columns.map(c => c.id)), cards = new Set(board.cards.map(c => c.entry.id));
  if (columns.size !== board.columns.length || cards.size !== board.cards.length
    || board.cards.some(c => !columns.has(c.columnId) || c.entry.ownerUserId !== board.ownerUserId))
    context.addIssue({ code: "custom", message: "Identidad o asociación de tarea inválida" });
});
export type BoardDocument = z.infer<typeof boardDocumentSchema>;
export type BoardCard = BoardDocument["cards"][number];
export type BoardView = typeof boardViews[number];
export type BoardSummary = Pick<BoardDocument, "id" | "name" | "description" | "archived" | "position" | "version"> & { cover?: string | null };
export function canUseGoBoards(profile: string, allowed: boolean, userId: string | null | undefined): boolean {
  return profile === "ADMIN" && allowed && !!userId;
}
export function reorderBoardItem<T extends { id: string }>(items: readonly T[], id: string, target: string): T[] {
  const from = items.findIndex(item => item.id === id), to = items.findIndex(item => item.id === target);
  if (from < 0 || to < 0) throw new Error("El elemento ya no está disponible");
  const next = [...items]; next.splice(to, 0, next.splice(from, 1)[0]); return next;
}
export function boardDatePatch(dateISO: string, time: string) {
  day.parse(dateISO); clock.parse(time);
  if (!dateISO && time) throw new Error("La hora necesita una fecha");
  return { dateISO, time, date: dateISO ? new Date(dateISO + "T12:00:00").toLocaleDateString("es-ES") : "",
    startDatetime: undefined, endDatetime: undefined };
}
