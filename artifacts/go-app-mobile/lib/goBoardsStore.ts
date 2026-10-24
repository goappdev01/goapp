import { boardDocumentSchema, type BoardDocument, type BoardSummary } from "@workspace/api-zod";
import { updateBoard, type BoardOperation } from "./goBoards";

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Api = <T>(path: string, method?: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
type Pending = { base: BoardDocument; next: BoardDocument };
export function createBoardsStore(owner: string, storage: Storage, api: Api, active: () => boolean) {
  const key = `go_boards_v1:ADMIN:${owner}`;
  let pending: Record<string, Pending> = {}, cache: Record<string, BoardDocument> = {};
  let state = { boards: [] as BoardSummary[], selected: null as BoardDocument | null, error: "", busy: false, more: false, pending: 0 };
  const listeners = new Set<() => void>(); let queue = Promise.resolve();
  const assert = () => { if (!active()) throw new Error("El acceso o el perfil han cambiado."); };
  const emit = (patch: Partial<typeof state>) => { state = { ...state, ...patch, pending: Object.keys(pending).length }; for (const fn of listeners) fn(); };
  const persist = async () => { assert(); await storage.setItem(key, JSON.stringify({ cache, pending })); assert(); };
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const work = queue.then(async () => { assert(); return operation(); }); queue = work.then(() => {}, () => {}); return work;
  };
  const flush = async () => {
    assert();
    for (const [id, job] of Object.entries(pending)) {
      try {
        const saved = boardDocumentSchema.parse(await api<BoardDocument>(`/${id}`, "PUT", job.next)); assert();
        cache[id] = saved; delete pending[id]; await persist();
        emit({ selected: state.selected?.id === id ? saved : state.selected, error: "" });
      } catch (error) {
        assert(); emit({ error: error instanceof Error ? error.message : "Sin conexión. Cambios conservados en este dispositivo." }); return;
      }
    }
    emit({});
  };
  return {
    cached: (id: string) => cache[id],
    allCached: () => Object.values(cache),
    reportError: (error: string) => emit({ error }),
    snapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async load() { return run(async () => {
      const raw = await storage.getItem(key); assert();
      if (raw) {
        const parsed = JSON.parse(raw) as { cache: Record<string, BoardDocument>; pending: Record<string, Pending> };
        for (const board of Object.values(parsed.cache)) if (boardDocumentSchema.parse(board).ownerUserId !== owner) throw new Error("Caché de otra identidad.");
        cache = parsed.cache; pending = parsed.pending; emit({});
      }
      await flush();
    }); },
    async loadCalendar() { return run(async () => {
      for (let offset = 0; ; offset += 30) {
        const rows = await api<BoardDocument[]>(`/calendar?offset=${offset}`); assert();
        for (const row of rows) { const doc = boardDocumentSchema.parse(row); if (doc.ownerUserId !== owner) throw new Error("Identidad incorrecta.");
          if (!pending[doc.id]) cache[doc.id] = doc; }
        if (rows.length < 30) break;
      }
      await persist(); emit({});
    }); },
    async list(search = "", archived = "false", more = false) { return run(async () => {
      emit({ busy: true });
      try {
        const rows = await api<BoardSummary[]>(`/?offset=${more ? state.boards.length : 0}&search=${encodeURIComponent(search)}&archived=${archived}`); assert();
        const items = more ? [...state.boards, ...rows] : rows;
        for (const { next } of Object.values(pending)) if (next.name.toLowerCase().includes(search.toLowerCase())
          && (archived === "all" || next.archived === (archived === "true"))) {
          const index = items.findIndex(b => b.id === next.id); if (index < 0) items.unshift(next); else items[index] = next;
        }
        emit({ boards: items.filter((b, i) => items.findIndex(x => x.id === b.id) === i), more: rows.length === 30, error: state.pending ? state.error : "" });
      } catch (error) { assert(); emit({ boards: Object.values(cache).filter(b => !b.removed && b.name.toLowerCase().includes(search.toLowerCase())), error: String((error as Error).message) }); }
      finally { if (active()) emit({ busy: false }); }
    }); },
    async open(id: string) { return run(async () => {
      assert(); emit({ selected: cache[id] || null, busy: true });
      try {
        if (!pending[id]) { const remote = boardDocumentSchema.parse(await api<BoardDocument>(`/${id}`)); assert(); if (remote.ownerUserId !== owner) throw new Error("Identidad incorrecta."); cache[id] = remote; await persist(); }
        emit({ selected: pending[id]?.next || cache[id] || null });
      } catch (error) { assert(); emit({ error: (error as Error).message }); }
      finally { if (active()) emit({ busy: false }); }
    }); },
    async save(board: BoardDocument, select = true) { return run(async () => {
      const next = boardDocumentSchema.parse(board); if (next.ownerUserId !== owner) throw new Error("Identidad incorrecta.");
      pending[next.id] = { base: pending[next.id]?.base || cache[next.id] || next, next };
      cache[next.id] = next; await persist(); emit({ selected: select || state.selected?.id === next.id ? next : state.selected }); await flush();
    }); },
    async change(op: BoardOperation) { const doc = state.selected; if (!doc) return; return this.save(updateBoard(doc, op)); },
    async sync() { return run(flush); },
    close() { emit({ selected: null }); },
    async remove(doc: BoardDocument) { return run(async () => {
      if (pending[doc.id]) throw new Error("Sincroniza el tablero antes de eliminarlo.");
      const result = await api<{ deleted: true; document: BoardDocument }>(`/${doc.id}?version=${doc.version}`, "DELETE", undefined, { "X-GO-Confirm-Delete": "yes" }); assert();
      // Keep only the durable task projection cache; discovery no longer exposes the deleted board.
      cache[doc.id] = boardDocumentSchema.parse(result.document);
      await persist(); emit({ selected: null, boards: state.boards.filter(b => b.id !== doc.id) });
    }); },
    async transfer(task: string, target: BoardDocument, column: string) { return run(async () => {
      const source = state.selected; if (!source || pending[source.id] || pending[target.id]) throw new Error("Sincroniza antes de trasladar.");
      const moved = await api<{ source: BoardDocument; target: BoardDocument }>("/transfer", "POST", {
        source: source.id, target: target.id, task, column, sourceVersion: source.version, targetVersion: target.version }); assert();
      cache[source.id] = boardDocumentSchema.parse(moved.source); cache[target.id] = boardDocumentSchema.parse(moved.target);
      await persist(); emit({ selected: cache[source.id] });
    }); },
    async resolveConflict(keepLocal: boolean) { return run(async () => {
      const doc = state.selected; if (!doc || !pending[doc.id]) return;
      const remote = boardDocumentSchema.parse(await api<BoardDocument>(`/${doc.id}`)); assert();
      if (remote.ownerUserId !== owner) throw new Error("Identidad incorrecta.");
      // Explicit user decision; a conflict never silently overwrites another device.
      if (keepLocal) { pending[doc.id].next = { ...pending[doc.id].next, version: remote.version }; cache[doc.id] = pending[doc.id].next; }
      else { delete pending[doc.id]; cache[doc.id] = remote; }
      await persist(); emit({ selected: cache[doc.id], error: "" }); if (keepLocal) await flush();
    }); },
  };
}
export type BoardsStore = ReturnType<typeof createBoardsStore>;
