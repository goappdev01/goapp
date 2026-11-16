import { boardDocumentSchema, type BoardDocument, type BoardSummary } from "@workspace/api-zod";
import { updateBoard, type BoardOperation } from "./goBoards";

type Storage = { getItem(key: string): Promise<string | null>; setItem(key: string, value: string): Promise<void> };
type Api = <T>(path: string, method?: string, body?: unknown, headers?: Record<string, string>) => Promise<T>;
type Pending = { base: BoardDocument; next: BoardDocument; delete?: boolean; conflict?: boolean };
type Checkpoint = { local: BoardDocument; base: BoardDocument; remote: BoardDocument };

/** Local commits and network requests have separate queues. An unavailable API
 * cannot hold the editor; only durable local values are published as saved. */
export function createBoardsStore(owner: string, storage: Storage, api: Api, active: () => boolean) {
  const key = `go_boards_v1:ADMIN:${owner}`;
  let pending: Record<string, Pending> = {}, cache: Record<string, BoardDocument> = {};
  let checkpoints: Checkpoint[] = [], loaded = false;
  let state = { boards: [] as BoardSummary[], selected: null as BoardDocument | null, error: "", localError: "",
    busy: false, more: false, pending: 0, remoteReady: false, localReady: false, syncing: false, revision: 0, conflicts: [] as string[] };
  let filter = { search: "", archived: "false" }, summaries: Record<string, BoardSummary> = {}, offset = 0, filterRevision = 0;
  const listeners = new Set<() => void>(), transferring = new Set<string>();
  let queue = Promise.resolve(), network: Promise<void> | null = null;
  const assert = () => { if (!active()) throw new Error("El acceso o el perfil han cambiado."); };
  const own = (value: unknown, id?: string) => {
    const doc = boardDocumentSchema.parse(value);
    if (doc.ownerUserId !== owner || (id !== undefined && doc.id !== id)) throw new Error("Identidad de Tableros incorrecta.");
    return doc;
  };
  const visible = (doc: BoardSummary & { removed?: boolean }) => !doc.removed
    && doc.name.toLowerCase().includes(filter.search.toLowerCase())
    && (filter.archived === "all" || doc.archived === (filter.archived === "true"));
  const emit = (patch: Partial<typeof state> = {}) => {
    state = { ...state, ...patch, pending: Object.keys(pending).length,
      conflicts: Object.keys(pending).filter(id => pending[id].conflict),
      boards: Object.values({ ...summaries, ...cache }).filter(visible)
        .sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)) };
    for (const fn of listeners) fn();
  };
  const run = <T>(operation: () => Promise<T>): Promise<T> => {
    const work = queue.then(async () => { assert(); return operation(); }); queue = work.then(() => {}, () => {}); return work;
  };
  const ready = () => { if (!loaded) throw new Error("No se ha podido leer la copia local. Reintenta antes de editar."); };
  const commit = async (nextCache: typeof cache, nextPending = pending, nextCheckpoints = checkpoints, clearLocalError = false) => {
    assert(); ready();
    try { await storage.setItem(key, JSON.stringify({ cache: nextCache, pending: nextPending, checkpoints: nextCheckpoints })); }
    catch { emit({ localError: "No se ha guardado el cambio en este dispositivo. Revisa el almacenamiento y vuelve a intentarlo." }); throw new Error(state.localError); }
    assert(); cache = nextCache; pending = nextPending; checkpoints = nextCheckpoints;
    emit({ localError: clearLocalError ? "" : state.localError, revision: state.revision + 1, selected: state.selected ? cache[state.selected.id] || state.selected : null });
  };
  const remoteFailure = (error: unknown) => {
    if (active()) emit({ remoteReady: false, error: error instanceof Error ? error.message : "Sin conexión con Tableros." });
  };
  const isConflict = (error: unknown) => {
    const e = error as { code?: string; status?: number };
    return e?.code === "BOARD_CONFLICT" || e?.status === 409;
  };
  const flush = async () => {
    assert(); ready(); emit({ syncing: true });
    try {
      // Bounded snapshot: subsequent edits remain queued for the next retry.
      for (const id of Object.keys(pending)) {
        const job = pending[id]; if (!job || job.conflict || transferring.has(id)) continue;
        try {
          // Preserve outstanding content before revision-checked server deletion.
          const needsSave = !job.delete || job.base.version === 0
            || JSON.stringify({ ...job.next, removed: undefined }) !== JSON.stringify({ ...job.base, removed: undefined });
          if (needsSave) {
            const saved = own(await api<BoardDocument>(`/${id}`, "PUT", { ...job.next, removed: undefined }), id); assert();
            if (saved.version !== job.next.version + 1) throw new Error("El servidor no confirmó la revisión esperada. La copia local se conserva.");
            await run(async () => {
              const current = pending[id]; if (!current) return;
              const rest = { ...pending };
              if (current === job && !job.delete) delete rest[id];
              else rest[id] = { ...current, base: saved, next: { ...current.next, version: saved.version } };
              await commit({ ...cache, [id]: rest[id]?.next || saved }, rest);
            });
          }
          if (job.delete) {
            const current = pending[id]; if (!current) continue;
            const result = await api<{ deleted: true; document: BoardDocument }>(`/${id}?version=${current.next.version}`, "DELETE", undefined, { "X-GO-Confirm-Delete": "yes" });
            const saved = own(result.document, id); assert();
            if (!saved.removed) throw new Error("El servidor no confirmó la eliminación.");
            await run(async () => { const rest = { ...pending }; delete rest[id]; await commit({ ...cache, [id]: saved }, rest); });
          }
          emit({ remoteReady: true, error: "" });
        } catch (error) {
          assert();
          if (isConflict(error)) await run(async () => {
            if (pending[id]) await commit(cache, { ...pending, [id]: { ...pending[id], conflict: true } });
          });
          remoteFailure(error);
          if (!isConflict(error)) break;
        }
      }
    } finally { if (active()) emit({ syncing: false }); }
  };
  const sync = (): Promise<void> => {
    if (!network) network = flush().finally(() => { network = null; });
    return network;
  };
  const scheduleSync = () => { void sync().catch(remoteFailure); };
  const saveLocal = async (board: BoardDocument, select: boolean) => {
    ready(); let next = own(board);
    if (cache[next.id]?.removed) throw new Error("El tablero se ha eliminado.");
    if (transferring.has(next.id)) throw new Error("Espera a que termine el traslado de este tablero.");
    // A network acknowledgement may have advanced the revision while an editor was open.
    next = { ...next, version: cache[next.id]?.version ?? next.version };
    const job = { ...pending[next.id], base: pending[next.id]?.base || cache[next.id] || next, next };
    await commit({ ...cache, [next.id]: next }, { ...pending, [next.id]: job }, checkpoints, true);
    emit({ selected: select || state.selected?.id === next.id ? next : state.selected });
  };
  return {
    hasPending: (id: string) => { assert(); return !!pending[id]; },
    cached: (id: string) => { assert(); return cache[id]; },
    allCached: () => { assert(); return Object.values(cache); },
    reportError: (error: string) => { if (active()) emit({ error }); },
    snapshot: () => state, subscribe: (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    async load() { return run(async () => {
      if (loaded) return;
      try {
        const raw = await storage.getItem(key); assert();
        if (raw !== null) {
          const parsed = JSON.parse(raw);
          if (!parsed.cache || typeof parsed.cache !== "object" || Array.isArray(parsed.cache)
            || !parsed.pending || typeof parsed.pending !== "object" || Array.isArray(parsed.pending)) throw new Error("Formato inválido");
          const restored: typeof cache = {}, jobs: typeof pending = {};
          for (const [id, value] of Object.entries(parsed.cache)) restored[id] = own(value, id);
          for (const [id, value] of Object.entries(parsed.pending)) {
            const job = value as Pending, base = own(job.base, id), next = own(job.next, id);
            if (!restored[id] || JSON.stringify(restored[id]) !== JSON.stringify(next) || base.version !== next.version
              || (job.delete !== undefined && typeof job.delete !== "boolean")
              || (job.conflict !== undefined && typeof job.conflict !== "boolean")) throw new Error("Cola inválida");
            jobs[id] = { base, next, delete: job.delete, conflict: job.conflict };
          }
          const history = parsed.checkpoints ?? [];
          if (!Array.isArray(history)) throw new Error("Checkpoint inválido");
          const restoredHistory = history.map((point: Checkpoint) => ({ local: own(point.local), base: own(point.base), remote: own(point.remote) }));
          cache = restored; pending = jobs; checkpoints = restoredHistory;
        }
        loaded = true; emit({ localReady: true, localError: "" });
      } catch (error) {
        assert(); emit({ localReady: false, localError: "No se pudo leer la copia local. Se conserva intacta; no se permite sobrescribirla." }); throw error;
      }
    }); },
    async loadCalendar() {
      assert(); ready();
      try {
        for (let page = 0; ; page += 30) {
          const rows = await api<BoardDocument[]>(`/calendar?offset=${page}`); assert();
          const docs = rows.map(row => own(row));
          await run(async () => {
            const next = { ...cache };
            for (const doc of docs) if (!pending[doc.id] && !transferring.has(doc.id)
              && (!next[doc.id] || doc.version >= next[doc.id].version)) next[doc.id] = doc;
            await commit(next);
          });
          if (rows.length < 30) break;
        }
        emit({ remoteReady: true, error: "" });
      } catch (error) { remoteFailure(error); throw error; }
    },
    async list(search = filter.search, archived = filter.archived, more = false) {
      assert(); ready();
      if (!more || search !== filter.search || archived !== filter.archived) {
        filter = { search, archived }; summaries = {}; offset = 0; filterRevision++;
      }
      const revision = filterRevision, page = offset;
      emit({ busy: true }); // Discovery from cache precedes any network await.
      try {
        const rows = await api<BoardSummary[]>(`/?offset=${page}&search=${encodeURIComponent(search)}&archived=${archived}`); assert();
        if (revision !== filterRevision) return;
        for (const row of rows) summaries[row.id] = row;
        offset = page + rows.length; emit({ more: rows.length === 30 });
      } catch (error) { remoteFailure(error); }
      finally { if (active() && revision === filterRevision) emit({ busy: false }); }
    },
    async open(id: string) {
      assert(); ready();
      if (cache[id]) { emit({ selected: cache[id] }); return; }
      emit({ busy: true });
      try {
        const remote = own(await api<BoardDocument>(`/${id}`), id); assert();
        await run(async () => { await commit({ ...cache, [id]: pending[id]?.next || remote }); emit({ selected: cache[id] }); });
      } catch (error) { remoteFailure(error); throw error; }
      finally { if (active()) emit({ busy: false }); }
    },
    async save(board: BoardDocument, select = true) { await run(() => saveLocal(board, select)); scheduleSync(); },
    async change(op: BoardOperation) {
      await run(async () => { const doc = state.selected; if (doc) await saveLocal(updateBoard(doc, op), true); }); scheduleSync();
    },
    sync,
    close() { assert(); emit({ selected: null }); },
    async remove(doc: BoardDocument) {
      await run(async () => {
        ready(); own(doc); const current = cache[doc.id]; if (!current || current.removed) throw new Error("Tablero no disponible.");
        if (transferring.has(doc.id)) throw new Error("Espera a que termine el traslado de este tablero.");
        const next = { ...current, removed: true };
        await commit({ ...cache, [doc.id]: next }, { ...pending, [doc.id]: { ...pending[doc.id], base: pending[doc.id]?.base || current, next, delete: true } }, checkpoints, true);
        emit({ selected: null });
      }); scheduleSync();
    },
    async transfer(task: string, target: BoardDocument, column: string) {
      assert(); ready(); const source = state.selected; own(target);
      if (!source || !state.remoteReady || pending[source.id] || pending[target.id] || network || transferring.size)
        throw new Error("Mover entre tableros requiere conexión y ambos tableros sincronizados. Puedes seguir organizando las columnas localmente.");
      transferring.add(source.id); transferring.add(target.id);
      try {
        const moved = await api<{ source: BoardDocument; target: BoardDocument }>("/transfer", "POST", {
          source: source.id, target: target.id, task, column, sourceVersion: source.version, targetVersion: target.version }); assert();
        const from = own(moved.source, source.id), to = own(moved.target, target.id);
        await run(() => commit({ ...cache, [source.id]: from, [target.id]: to }));
      } catch (error) { remoteFailure(error); throw error; }
      finally { transferring.delete(source.id); transferring.delete(target.id); }
    },
    async reviewConflict() {
      assert(); const doc = state.selected, job = doc && pending[doc.id];
      if (!doc || !job?.conflict) throw new Error("Abre el tablero con conflicto.");
      const remote = own(await api<BoardDocument>(`/${doc.id}`), doc.id); assert();
      return { local: job.next, base: job.base, remote };
    },
    async resolveConflict(keepLocal: boolean, reviewedVersion?: number, reviewedLocal?: BoardDocument) {
      assert(); ready(); const doc = state.selected, job = doc && pending[doc.id]; if (!doc || !job?.conflict) return;
      if (reviewedLocal && JSON.stringify(job.next) !== JSON.stringify(reviewedLocal)) throw new Error("La copia local ha cambiado. Revisa de nuevo el conflicto.");
      try {
        const remote = own(await api<BoardDocument>(`/${doc.id}`), doc.id); assert();
        if (reviewedVersion !== undefined && remote.version !== reviewedVersion) throw new Error("El servidor ha cambiado. Revisa de nuevo el conflicto.");
        await run(async () => {
          if (pending[doc.id] !== job) throw new Error("La copia local ha cambiado. Revisa de nuevo el conflicto.");
          const rest = { ...pending }, next = keepLocal ? { ...job.next, version: remote.version } : remote;
          if (keepLocal) rest[doc.id] = { ...job, base: remote, next, conflict: false }; else delete rest[doc.id];
          await commit({ ...cache, [doc.id]: next }, rest, [...checkpoints, { local: job.next, base: job.base, remote }], true); emit({ error: "" });
        });
        if (keepLocal) await sync();
      } catch (error) { remoteFailure(error); throw error; }
    },
  };
}
export type BoardsStore = ReturnType<typeof createBoardsStore>;
