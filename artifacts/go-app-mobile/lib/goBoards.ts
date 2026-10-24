import { boardDocumentSchema, boardDatePatch, reorderBoardItem, type BoardDocument, type BoardCard } from "@workspace/api-zod";
import type { GoEntry } from "@/components/AgendaOperativa";

export type BoardOperation =
  | { type: "settings"; patch: Partial<Pick<BoardDocument, "name" | "description" | "cover" | "archived" | "position" | "view" | "anchorDate">> }
  | { type: "column"; id: string; title: string; archived?: boolean }
  | { type: "columnOrder"; id: string; target: string }
  | { type: "card"; card: BoardCard }
  | { type: "cardOrder"; id: string; target: string; columnId: string }
  | { type: "removeCard"; id: string };
export const newBoard = (id: string, ownerUserId: string, name: string, firstColumn: string, today: string): BoardDocument => ({
  id, ownerUserId, profile: "ADMIN", name, description: "", cover: null, archived: false,
  version: 0, position: Date.now(), columns: [{ id: firstColumn, title: "Por hacer", archived: false }],
  cards: [], view: "columns", anchorDate: today,
});
export function newBoardTask(id: string, ownerUserId: string, title: string): BoardCard["entry"] {
  return { id, ownerUserId, taskContext: "ADMIN", actionContext: "ADMIN", kind: "sent", type: "TAREA",
    intentKey: "tarea", intentLabel: "Tarea", color: "#a78bfa", place: "", date: "", dateISO: "", time: "",
    duration: "", contactName: "", phone: "", estado: "pendiente", notes: title, detail: "", visibility: "privado", createdAt: Date.now() };
}
export function updateBoard(board: BoardDocument, op: BoardOperation): BoardDocument {
  let next = JSON.parse(JSON.stringify(board)) as BoardDocument;
  switch (op.type) {
    case "settings": next = { ...next, ...op.patch }; break;
    case "column": {
      const existing = next.columns.find(c => c.id === op.id);
      if (existing) Object.assign(existing, { title: op.title, archived: op.archived ?? existing.archived });
      else next.columns.push({ id: op.id, title: op.title, archived: false });
      break;
    }
    case "columnOrder": next.columns = reorderBoardItem(next.columns, op.id, op.target); break;
    case "card": {
      const index = next.cards.findIndex(c => c.entry.id === op.card.entry.id);
      if (index < 0) next.cards.push(op.card); else next.cards[index] = op.card;
      break;
    }
    case "cardOrder": {
      const from = next.cards.findIndex(c => c.entry.id === op.id), to = next.cards.findIndex(c => c.entry.id === op.target);
      if (from < 0 || to < 0) throw new Error("La tarjeta ya no está disponible.");
      const [card] = next.cards.splice(from, 1); card.columnId = op.columnId; next.cards.splice(to, 0, card); break;
    }
    case "removeCard": next.cards = next.cards.filter(c => c.entry.id !== op.id); break;
  }
  return boardDocumentSchema.parse(next);
}
export function moveBoardCardDate(card: BoardCard, date: string): BoardCard {
  return { ...card, entry: { ...card.entry, ...boardDatePatch(date, date ? card.entry.time : "") } };
}
export function duplicateBoardStructure(board: BoardDocument, id: string, name: string,
  columnId: () => string): BoardDocument {
  return { ...board, id, name, version: 0, archived: false, position: Date.now(),
    columns: board.columns.map(c => ({ ...c, id: columnId() })), cards: [] };
}
/** The GO record is a projection of the same task ID; private cards never enter Calendar. */
export function projectBoardCalendar(board: BoardDocument, entries: GoEntry[]): GoEntry[] {
  const ids = new Set(board.cards.map(c => c.entry.id));
  const output = entries.filter(e => !ids.has(e.id) && (e as GoEntry & { boardId?: string }).boardId !== board.id);
  for (const card of board.cards) if (card.calendarLinked && !card.archived && !card.entry.deleted)
    output.push({ ...card.entry, boardId: board.id } as GoEntry);
  return output;
}
/** Only fields actually edited in Calendar replace the cached board record. */
export function calendarChanges(board: BoardDocument, entries: GoEntry[]): BoardDocument {
  let changed = false;
  const cards = board.cards.map(card => {
    const go = entries.find(e => e.id === card.entry.id && e.ownerUserId === board.ownerUserId);
    if (!card.calendarLinked || card.archived || !go) return card;
    const keys = ["dateISO", "date", "time", "duration", "notes", "detail", "place", "estado", "deleted", "localResolutionStatus", "messages"] as const;
    const entry = { ...card.entry };
    for (const key of keys) if (JSON.stringify(go[key]) !== JSON.stringify(entry[key])) {
      (entry as Record<string, unknown>)[key] = go[key]; changed = true;
    }
    if (!entry.dateISO && entry.time) { entry.time = ""; changed = true; }
    return { ...card, entry };
  });
  return changed ? boardDocumentSchema.parse({ ...board, cards }) : board;
}
