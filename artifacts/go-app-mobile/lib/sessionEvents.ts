const listeners = new Set<() => void>();
export function notifySessionChanged(): void { for (const listener of listeners) listener(); }
export function onSessionChanged(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
