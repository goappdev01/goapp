import AsyncStorage from "@react-native-async-storage/async-storage";
import { readGoLog } from "./goLogStore";
import { getTaskUser } from "./goTaskAccess";
import { taskInScope, reminderOffsets, reminderTaskInstant, type TaskScope } from "./goTaskReminders";
import { createNativeReminderScheduler, type NativeReminderReport } from "./goNativeReminderScheduler";
import { createExpoReminderPorts } from "./goNativeNotificationAdapter";
import { clearTaskNotificationFocus, focusTaskFromNotification } from "./goTaskNotificationFocus";
import type { AlertMode } from "@/contexts/GoNotificationContext";

let scope: TaskScope | null = null;
let mode: AlertMode = "sound";
let revision = 0;
const same = (a: TaskScope | null, b: TaskScope | null) => a === null || b === null ? a === b : a.userId === b.userId && a.context === b.context;
export const isNativeTaskScopeActive = (expected: TaskScope) => same(scope, expected);
const scheduler = createNativeReminderScheduler(createExpoReminderPorts({
  readTasks: readGoLog, now: () => Date.now(),
  async scopeValid(expected) { return isNativeTaskScopeActive(expected) && await getTaskUser() === expected.userId && isNativeTaskScopeActive(expected); },
}));
async function persistedMode(): Promise<AlertMode> {
  const values = await AsyncStorage.multiGet(["go_alert_mode_v1", "go_notif_enabled_v1"]);
  const alert = values[0][1];
  return mode === "silent" || values[1][1] === "off" || alert === "silent" ? "silent" : alert === "visual" ? "visual" : mode;
}
export async function setNativeTaskReminderScope(value: TaskScope | null, alertMode: AlertMode): Promise<NativeReminderReport[]> {
  const changed = !same(scope, value), epoch = ++revision;
  scope = value ? { ...value } : null; mode = alertMode;
  if (changed) clearTaskNotificationFocus();
  // Fence identity changes before preference reads; never briefly schedule with a default sound mode.
  if (changed || !value) {
    const canceled = await scheduler.setScope(null, "silent");
    if (canceled.some(item => item.status === "failed")) return canceled;
  } else if (alertMode === "silent") await scheduler.setScope(scope, "silent");
  const effective = await persistedMode();
  if (revision !== epoch || !same(scope, value)) return [];
  return scheduler.setScope(scope, effective);
}
export async function refreshNativeTaskReminders(expected: TaskScope, requestPermission = false): Promise<NativeReminderReport[]> {
  if (!isNativeTaskScopeActive(expected)) return [];
  const savedMode = await persistedMode();
  if (!isNativeTaskScopeActive(expected)) return [];
  await scheduler.setScope(scope, savedMode);
  return scheduler.refresh(expected, { requestPermission });
}
export async function suspendNativeTaskReminders(): Promise<void> {
  ++revision; scope = null; clearTaskNotificationFocus();
  const report = await scheduler.setScope(null, mode);
  if (report.some(item => item.status === "failed")) throw new Error("No se han podido cancelar los avisos anteriores. Inténtalo de nuevo antes de cambiar de cuenta.");
}
export async function openNativeReminderTask(data: Record<string, unknown>): Promise<boolean> {
  if (data.goTaskReminder !== true || typeof data.taskId !== "string" || typeof data.userId !== "string" || typeof data.context !== "string") return false;
  const expected = { userId: data.userId, context: data.context };
  if (!isNativeTaskScopeActive(expected) || await getTaskUser() !== expected.userId) return false;
  const rows = (await readGoLog()).filter(task => task.id === data.taskId);
  if (rows.length !== 1 || !taskInScope(rows[0], expected) || rows[0].deleted || rows[0].estado === "rechazado"
    || !isNativeTaskScopeActive(expected) || await getTaskUser() !== expected.userId || !isNativeTaskScopeActive(expected)) return false;
  focusTaskFromNotification({ task: rows[0], scope: expected });
  return true;
}
export async function canPresentNativeTaskReminder(data: Record<string, unknown>): Promise<boolean> {
  if (data.goTaskReminder !== true) return true;
  if (typeof data.userId !== "string" || typeof data.context !== "string" || typeof data.taskId !== "string" || typeof data.minutes !== "number") return false;
  const expected = { userId: data.userId, context: data.context };
  if (!isNativeTaskScopeActive(expected)) return false;
  const [owner, rows, preference] = await Promise.all([getTaskUser(), readGoLog(), persistedMode()]);
  if (owner !== expected.userId || preference === "silent" || !isNativeTaskScopeActive(expected)) return false;
  const matches = rows.filter(task => task.id === data.taskId);
  const task = matches[0];
  if (matches.length !== 1 || !task || !taskInScope(task, expected) || task.deleted || task.estado === "rechazado"
    || task.notificationsEnabled === false || !reminderOffsets(task).includes(data.minutes)) return false;
  try {
    const signature = JSON.parse(String(data.signature));
    return signature[0] === reminderTaskInstant(task) - data.minutes * 60000
      && signature[1] === Intl.DateTimeFormat().resolvedOptions().timeZone && signature[2] === (task.notes || "Tarea")
      && await getTaskUser() === expected.userId && isNativeTaskScopeActive(expected);
  } catch { return false; }
}

export async function refreshActiveNativeTaskReminders(): Promise<void> {
  if (scope) await refreshNativeTaskReminders({ ...scope });
}

export function pauseNativeTaskReminderRuntime(): void {
  ++revision; scope = null; clearTaskNotificationFocus(); scheduler.pause();
}
