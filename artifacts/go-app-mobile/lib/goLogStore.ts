import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";

// One in-memory view of the existing store. No new key, table or calendar.
const GO_LOG_KEY = "go_log_v1";
let snapshot: GoEntry[] = [];
let loaded = false;
let loading: Promise<void> | null = null;
let pending: Promise<void> = Promise.resolve();
const listeners = new Set<() => void>();

export const getGoLogSnapshot = () => snapshot;
export function subscribeGoLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function publish(entries: GoEntry[]) {
  snapshot = entries;
  for (const listener of listeners) listener();
}
async function load() {
  if (loaded) return;
  if (!loading) loading = (async () => {
    const raw = await AsyncStorage.getItem(GO_LOG_KEY);
    const entries: unknown = raw === null ? [] : JSON.parse(raw);
    if (!Array.isArray(entries) || entries.some(entry => !entry || typeof entry !== "object"))
      throw new Error("No se pudo leer tu agenda. No se ha modificado.");
    loaded = true;
    publish(entries as GoEntry[]);
  })().finally(() => { loading = null; });
  await loading;
}
function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(async () => {
    await load();
    return operation();
  });
  // A failure is returned to its caller and must not poison later operations.
  pending = next.then(() => undefined, () => undefined);
  return next;
}
export function readGoLog(): Promise<GoEntry[]> {
  return enqueue(async () => JSON.parse(JSON.stringify(snapshot)) as GoEntry[]);
}
export function flushGoLog(): Promise<void> {
  return pending;
}
/** The updater always receives the latest committed view, including manual edits. */
export function updateGoLog<T>(
  update: (entries: GoEntry[]) => { entries: GoEntry[]; result: T },
): Promise<T> {
  return enqueue(async () => {
    const next = update(JSON.parse(JSON.stringify(snapshot)) as GoEntry[]);
    if (!equal(next.entries, snapshot)) {
      await AsyncStorage.setItem(GO_LOG_KEY, JSON.stringify(next.entries));
      // Notify Landing only after storage acknowledges the write.
      publish(next.entries);
    }
    return next.result;
  });
}
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/**
 * Reconcile a snapshot computed by an async manual flow/hydration. Apply only
 * its changed fields; retain newer edits and additions, and never resurrect
 * entries removed in the meantime. Identity is always the existing GO id.
 */
export function mergeGoLogSnapshot(base: GoEntry[], next: GoEntry[], current: GoEntry[]): GoEntry[] {
  if (equal(base, current)) return next;
  // Legacy records without valid unique ids are repaired by hydration. If an
  // intervening edit occurred, defer that repair rather than lose user data.
  if ([base, next, current].some(entries => {
    const ids = entries.map(entry => entry.id);
    return ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length;
  })) return current;
  const before = new Map(base.map(entry => [entry.id, entry]));
  const after = new Map(next.map(entry => [entry.id, entry]));
  const present = new Set(current.map(entry => entry.id));
  const inserted = next.filter(entry => !before.has(entry.id) && !present.has(entry.id));
  const kept = current.flatMap(entry => {
    const old = before.get(entry.id);
    const proposed = after.get(entry.id);
    if (!old) return [entry];
    if (!proposed) return equal(entry, old) ? [] : [entry];
    const merged = { ...entry } as GoEntry & Record<string, unknown>;
    const oldFields = old as GoEntry & Record<string, unknown>;
    const nextFields = proposed as GoEntry & Record<string, unknown>;
    for (const key of new Set([...Object.keys(old), ...Object.keys(proposed)])) {
      if (!equal(oldFields[key], nextFields[key]) && equal(merged[key], oldFields[key])) {
        if (key in proposed) merged[key] = nextFields[key];
        else delete merged[key];
      }
    }
    return [merged];
  });
  return [...inserted, ...kept];
}
export function commitGoLogSnapshot(base: GoEntry[], next: GoEntry[]): Promise<void> {
  return updateGoLog(entries => ({
    entries: mergeGoLogSnapshot(base, next, entries), result: undefined,
  }));
}
