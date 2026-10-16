import { recordAuthTrace } from "./authTrace";
const listeners = new Set<() => void>();
export function notifySessionChanged(): void { recordAuthTrace("session.event", { listeners: listeners.size }); for (const listener of listeners) listener(); }
export function onSessionChanged(listener: () => void): () => void {
  listeners.add(listener); return () => { listeners.delete(listener); };
}
