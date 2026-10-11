// Keep subscriptions shared across Fast Refresh module generations.
const runtime = globalThis as typeof globalThis & { __goSessionListeners?: Set<() => void> };
const listeners = runtime.__goSessionListeners ??= new Set<() => void>();
export function notifySessionChanged(): void { for (const listener of listeners) listener(); }
export function onSessionChanged(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
