import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { readGoLog, updateGoLog } from "./goLogStore";
import { noteInScope } from "./unifiedNotes";
import { validateShopping } from "./shoppingNote";
import { readShoppingRemote, writeShoppingRemote, type ShoppingRemoteSnapshot } from "./shoppingRemoteStore";

const key = (scope: TaskScope) => "shopping_note:" + encodeURIComponent(scope.userId) + ":" + encodeURIComponent(scope.context);
const syncKey = (scope: TaskScope) => key(scope) + ":supabase_sync";
const activeKey = (scope: TaskScope) => key(scope) + ":active_list";
const snapshots = new Map<string, ShoppingRemoteSnapshot>();
const flights = new Map<string, Promise<void>>();
// PostgreSQL jsonb may reorder object keys. Compare values, not serialization order.
const ordered = (value: unknown): unknown => Array.isArray(value) ? value.map(ordered)
  : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)])) : value;
const same = (a: unknown, b: unknown) => JSON.stringify(ordered(a)) === JSON.stringify(ordered(b));
const scoped = (rows: GoEntry[], scope: TaskScope) => rows.filter(row => noteInScope(row, scope) && row.note?.shopping !== undefined);

function valid(rows: GoEntry[], scope: TaskScope) {
  if (rows.length > 100 || new Set(rows.map(row => row.id)).size !== rows.length
    || rows.some(row => !noteInScope(row, scope) || !row.note?.shopping)) throw Error("Las listas de Compras no pertenecen a esta cuenta.");
  rows.forEach(row => validateShopping(row.note!.shopping!));
}

/** Never discard a local list or overwrite two divergent edits to the same ID. */
async function reconcile(scope: TaskScope, active: () => boolean) {
  let remote: ShoppingRemoteSnapshot;
  try { remote = await readShoppingRemote(scope); }
  catch (error) {
    if ((error as { code?: string })?.code === "AUTH_REQUIRED" || (error as { code?: string })?.code === "SHOPPING_ACCESS_DENIED") throw error;
    const raw = await AsyncStorage.getItem(syncKey(scope));
    const cached = raw ? JSON.parse(raw) as ShoppingRemoteSnapshot : null;
    const local = scoped(await readGoLog(), scope);
    if (!cached || !Number.isSafeInteger(cached.revision) || cached.revision < 1
      || !Array.isArray(cached.lists) || !same(local, cached.lists) || !active()) throw error;
    valid(local, scope);
    snapshots.set(key(scope), cached); // Read-only offline cache. Writes still require Supabase acknowledgement.
    return;
  }
  if (!active()) throw Error("La cuenta cambió durante la sincronización de Compras.");
  valid(remote.lists, scope);
  const local = scoped(await readGoLog(), scope);
  valid(local, scope);
  const raw = await AsyncStorage.getItem(syncKey(scope));
  const marker = raw ? JSON.parse(raw) as ShoppingRemoteSnapshot : null;
  if (marker && (!Number.isSafeInteger(marker.revision) || !Array.isArray(marker.lists)))
    throw Error("La referencia local de sincronización es inválida; se conservan las listas.");
  if (remote.revision === 0 && marker && marker.revision > 0)
    throw Error("No aparece el historial remoto de Compras; se conservan las listas locales para revisión.");
  const prior = new Map((marker?.lists ?? []).map(row => [row.id, row]));
  const found = new Map(remote.lists.map(row => [row.id, row]));
  const merged = [...remote.lists];
  for (const row of local) {
    const server = found.get(row.id), baseline = prior.get(row.id);
    if (!server) {
      if (baseline) throw Error("Una lista desapareció de Supabase; se conserva su copia local para revisión.");
      merged.push(row); continue;
    }
    if (same(row, server) || baseline && same(row, baseline)) continue;
    if (baseline && same(server, baseline)) {
      merged[merged.findIndex(item => item.id === row.id)] = row; continue;
    }
    throw Error("Esta lista cambió en dos dispositivos. Se conservan ambas versiones; revisa el conflicto antes de guardar.");
  }
  const localActive = await AsyncStorage.getItem(activeKey(scope));
  const activeListId = remote.activeListId && merged.some(row => row.id === remote.activeListId) ? remote.activeListId
    : localActive && merged.some(row => row.id === localActive) ? localActive : null;
  let revision = remote.revision;
  if (!same(merged, remote.lists) || activeListId !== remote.activeListId) {
    revision = await writeShoppingRemote(scope, remote.revision, merged, activeListId);
    if (!active()) throw Error("La cuenta cambió durante la sincronización de Compras.");
  }
  // Replace only this account's shopping rows. Notes and other modules retain their own records.
  await updateGoLog(rows => ({ entries: [...merged, ...rows.filter(row => !scoped([row], scope).length)], result: undefined }),
    () => { if (!active()) throw Error("La cuenta cambió durante la sincronización de Compras."); });
  if (activeListId) await AsyncStorage.setItem(activeKey(scope), activeListId);
  else await AsyncStorage.removeItem(activeKey(scope));
  const snapshot = { revision, lists: merged, activeListId };
  await AsyncStorage.setItem(syncKey(scope), JSON.stringify(snapshot));
  snapshots.set(key(scope), snapshot);
}

export async function syncShopping(scope: TaskScope, active: () => boolean) {
  const id = key(scope), running = flights.get(id);
  if (running) return running;
  const task = reconcile(scope, active).finally(() => { if (flights.get(id) === task) flights.delete(id); });
  flights.set(id, task);
  return task;
}

/** Supabase must acknowledge every shopping mutation before the local cache changes. */
export async function updateShoppingLog<T>(scope: TaskScope, active: () => boolean,
  update: (rows: GoEntry[]) => { entries: GoEntry[]; result: T } | Promise<{ entries: GoEntry[]; result: T }>): Promise<T> {
  await syncShopping(scope, active);
  let confirmed: ShoppingRemoteSnapshot | null = null;
  const result = await updateGoLog(update, () => { if (!active()) throw Error("La cuenta cambió durante el guardado de Compras."); },
    async next => {
      const previous = snapshots.get(key(scope));
      if (!previous) throw Error("Compras no tiene una versión remota verificada.");
      const lists = scoped(next, scope); valid(lists, scope);
      const selected = await AsyncStorage.getItem(activeKey(scope));
      const activeListId = selected && lists.some(row => row.id === selected) ? selected : null;
      const revision = await writeShoppingRemote(scope, previous.revision, lists, activeListId);
      confirmed = { revision, lists, activeListId };
    });
  if (confirmed) {
    await AsyncStorage.setItem(syncKey(scope), JSON.stringify(confirmed));
    snapshots.set(key(scope), confirmed);
  }
  return result;
}

export async function selectShoppingList(scope: TaskScope, active: () => boolean, listId: string | null) {
  await syncShopping(scope, active);
  const previous = snapshots.get(key(scope));
  if (!previous || listId && !previous.lists.some(row => row.id === listId && !row.deleted))
    throw Error("La lista activa no está disponible en esta cuenta.");
  if (previous.activeListId === listId) return;
  const revision = await writeShoppingRemote(scope, previous.revision, previous.lists, listId);
  if (!active()) throw Error("La cuenta cambió durante la selección de Compras.");
  if (listId) await AsyncStorage.setItem(activeKey(scope), listId);
  else await AsyncStorage.removeItem(activeKey(scope));
  const current = { ...previous, revision, activeListId: listId };
  await AsyncStorage.setItem(syncKey(scope), JSON.stringify(current));
  snapshots.set(key(scope), current);
}
