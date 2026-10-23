import { useEffect, useCallback, useRef, useSyncExternalStore, type Dispatch, type SetStateAction } from "react";
import { assertTaskUser } from "@/lib/goTaskAccess";
import type { CompletionScope } from "@/lib/goActionCompletion";
import type { GoEntry } from "@/components/AgendaOperativa";
import { getGoLogSnapshot, readGoLog, subscribeGoLog, updateGoLog } from "@/lib/goLogStore";

const setGoLog: Dispatch<SetStateAction<GoEntry[]>> = update => {
  void updateGoLog(entries => ({
    entries: typeof update === "function" ? update(entries) : update,
    result: undefined,
  })).catch(error => console.warn("[GO] No se pudo guardar la agenda", error));
};
/** Manual GO and IA observe and update the same committed record. */
export function useGoLog(scope?: CompletionScope | null): [GoEntry[], Dispatch<SetStateAction<GoEntry[]>>] {
  const entries = useSyncExternalStore(subscribeGoLog, getGoLogSnapshot, getGoLogSnapshot);
  const scopeRef = useRef(scope);
  const scopeRevision = useRef(0);
  if (scopeRef.current?.userId !== scope?.userId || scopeRef.current?.context !== scope?.context
    || (scopeRef.current === undefined) !== (scope === undefined) || (scopeRef.current === null) !== (scope === null)) scopeRevision.current++;
  scopeRef.current = scope;
  useEffect(() => {
    void readGoLog().catch(error => console.warn("[GO] No se pudo leer la agenda", error));
  }, []);
  const scopedSetter = useCallback<Dispatch<SetStateAction<GoEntry[]>>>(update => {
    const currentScope = scopeRef.current;
    // An omitted scope is the legacy shared-store API. An explicit null means
    // the caller is still hydrating; it must never stamp an unknown identity.
    if (currentScope === undefined) { setGoLog(update); return; }
    if (!currentScope?.userId || !currentScope.context) {
      console.warn("[GO] Espera a que se recupere la cuenta antes de guardar la agenda.");
      return;
    }
    const expected = { ...currentScope }, revision = scopeRevision.current;
    const assertActive = () => {
      if (revision !== scopeRevision.current || scopeRef.current?.userId !== expected.userId || scopeRef.current?.context !== expected.context)
        throw new Error("La cuenta o el calendario han cambiado. Vuelve a solicitar la acción.");
    };
    void updateGoLog(async previous => {
      assertActive();
      await assertTaskUser(expected.userId);
      assertActive();
      const ids = new Set(previous.map(entry => entry.id));
      const next = typeof update === "function" ? update(previous) : update;
      return { entries: next.map(entry => !ids.has(entry.id) && !entry.reservationId
        && !["GO_BOOKING","GO_RESERVA"].includes(entry.type || "")
        && (!entry.ownerUserId || entry.ownerUserId === expected.userId)
        && (!(entry.actionContext || entry.taskContext) || (entry.actionContext || entry.taskContext) === expected.context)
        ? { ...entry, ownerUserId: entry.ownerUserId || expected.userId, actionContext: entry.actionContext || entry.taskContext || expected.context } : entry), result: undefined };
    }, assertActive).catch(error => console.warn("[GO] No se pudo guardar la agenda", error));
  }, []);
  return [entries, scopedSetter];
}
