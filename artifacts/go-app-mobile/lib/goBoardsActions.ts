import type { BoardDocument } from "@workspace/api-zod";
import { updateBoard, type BoardOperation } from "./goBoards";
import type { BoardsStore } from "./goBoardsStore";

/** Operations for the existing central assistant; this module has no language/AI engine. */
export type PreparedBoardAction = { boardId: string; ownerUserId: string; version: number; operation: BoardOperation; review: BoardDocument };
export function prepareBoardAction(board: BoardDocument, operation: BoardOperation): PreparedBoardAction {
  return { boardId: board.id, ownerUserId: board.ownerUserId, version: board.version,
    operation, review: updateBoard(board, operation) };
}
/** Both confirmations are supplied by GO's existing comprehension/review flow. */
export async function confirmBoardAction(store: BoardsStore, prepared: PreparedBoardAction,
  confirmation: { understood: boolean; approved: boolean }): Promise<void> {
  if (!confirmation.understood || !confirmation.approved) throw new Error("Revisa y confirma la operación.");
  const current = store.snapshot().selected;
  if (!current || current.id !== prepared.boardId || current.ownerUserId !== prepared.ownerUserId
    || current.version !== prepared.version || JSON.stringify(updateBoard(current, prepared.operation)) !== JSON.stringify(prepared.review))
    throw new Error("El tablero ha cambiado. Vuelve a revisar la operación.");
  await store.change(prepared.operation);
}
