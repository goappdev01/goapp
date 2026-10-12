import type { ReminderTask, TaskScope } from "./goTaskReminders";
export type TaskNotificationFocus = { task: ReminderTask; scope: TaskScope };
let pending: TaskNotificationFocus | null = null;
const listeners = new Set<(focus: TaskNotificationFocus) => void>();
export function clearTaskNotificationFocus() { pending = null; }
export function focusTaskFromNotification(focus: TaskNotificationFocus) {
  if (!listeners.size) pending = focus;
  else for (const listener of listeners) listener(focus);
}
export function onTaskNotificationFocus(listener: (focus: TaskNotificationFocus) => void): () => void {
  listeners.add(listener);
  if (pending) { const focus = pending; pending = null; listener(focus); }
  return () => { listeners.delete(listener); };
}
