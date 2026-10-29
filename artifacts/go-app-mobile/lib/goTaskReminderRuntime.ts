import AsyncStorage from "@react-native-async-storage/async-storage";
import { readGoLog } from "./goLogStore";
import { effectiveNoteReminderEntry } from "./goNoteTools";
import { getTaskUser } from "./goTaskAccess";
import { reminderOffsets, reminderTaskInstant, type TaskScope } from "./goTaskReminders";
import { createNativeReminderScheduler, nativeReminderTaskInScope, type NativeReminderReport } from "./goNativeReminderScheduler";
import { createExpoReminderPorts } from "./goNativeNotificationAdapter";
import { clearTaskNotificationFocus, focusTaskFromNotification } from "./goTaskNotificationFocus";
import type { AlertMode } from "@/contexts/GoNotificationContext";

type CompletionPolicy = {
  requests(scope: TaskScope): Promise<import("./goNativeReminderScheduler").NativeReminderRequest[]>;
  present(scope: TaskScope, data: Record<string, unknown>): Promise<boolean>;
  open(scope: TaskScope, data: Record<string, unknown>): Promise<boolean>;
};
let completionPolicy: CompletionPolicy | null = null;
export function registerActionCompletionRuntime(policy: CompletionPolicy) {
  completionPolicy = policy;
  return () => { if (completionPolicy === policy) completionPolicy = null; };
}
let scope: TaskScope | null = null;
let mode: AlertMode = "sound";
let revision = 0;
type RefreshFlight={expected:TaskScope;epoch:number;permission:boolean;dirty:boolean;promise:Promise<NativeReminderReport[]>};
let refreshFlight:RefreshFlight|null=null;
const same = (a: TaskScope | null, b: TaskScope | null) => a === null || b === null ? a === b : a.userId === b.userId && a.context === b.context;
export const isNativeTaskScopeActive = (expected: TaskScope) => same(scope, expected);
const scheduler = createNativeReminderScheduler(createExpoReminderPorts({
  readTasks: readGoLog, now: () => Date.now(),
  readCompletionRequests: expected => completionPolicy?.requests(expected) ?? Promise.resolve([]),
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
export function refreshNativeTaskReminders(expected: TaskScope, requestPermission = false): Promise<NativeReminderReport[]> {
  if (!isNativeTaskScopeActive(expected)) return Promise.resolve([]);
  if(refreshFlight&&refreshFlight.epoch===revision&&same(refreshFlight.expected,expected)){
    refreshFlight.permission ||= requestPermission;refreshFlight.dirty=true;return refreshFlight.promise;
  }
  const flight:RefreshFlight={expected:{...expected},epoch:revision,permission:requestPermission,dirty:true,promise:Promise.resolve([])};
  refreshFlight=flight;
  flight.promise=Promise.resolve().then(async()=>{
    let reports:NativeReminderReport[]=[];
    while(flight.epoch===revision&&isNativeTaskScopeActive(flight.expected)){
      const savedMode=await persistedMode();
      if(flight.epoch!==revision||!isNativeTaskScopeActive(flight.expected))return [];
      const permission=flight.permission;flight.permission=false;flight.dirty=false;
      // Applying mode and refreshing is one reconciliation, not setScope + refresh.
      reports=await scheduler.refresh(flight.expected,{requestPermission:permission,mode:savedMode});
      if(!flight.dirty)return reports; // Changes during native work get one latest trailing run.
    }
    return [];
  }).finally(()=>{if(refreshFlight===flight)refreshFlight=null;});
  return flight.promise;
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
  if (data.goActionCompletion === true) {
    const opened = await completionPolicy?.open(expected, data);
    return !!opened && isNativeTaskScopeActive(expected) && await getTaskUser() === expected.userId;
  }
  const rows = (await readGoLog()).filter(task => task.id === data.taskId);
  if (rows.length !== 1 || !nativeReminderTaskInScope(rows[0], expected) || rows[0].deleted || rows[0].estado === "rechazado"
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
  if (data.goActionCompletion === true) {
    return !!await completionPolicy?.present(expected, data) && await getTaskUser() === expected.userId && isNativeTaskScopeActive(expected);
  }
  const matches = rows.filter(task => task.id === data.taskId);
  const task = matches[0] && effectiveNoteReminderEntry(matches[0]);
  if (matches.length !== 1 || !task || !nativeReminderTaskInScope(task, expected) || task.deleted || task.estado === "rechazado"
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
