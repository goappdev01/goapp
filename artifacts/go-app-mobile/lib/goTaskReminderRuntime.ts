import AsyncStorage from "@react-native-async-storage/async-storage";
import { readGoLog } from "./goLogStore";
import { effectiveNoteReminderEntry } from "./goNoteTools";
import { getTaskUser } from "./goTaskAccess";
import { reminderOffsets, reminderTaskInstant, type TaskScope } from "./goTaskReminders";
import { createNativeReminderScheduler, nativeReminderTaskInScope, type NativeReminderReport } from "./goNativeReminderScheduler";
import { createExpoReminderPorts } from "./goNativeNotificationAdapter";
import { clearTaskNotificationFocus, focusTaskFromNotification } from "./goTaskNotificationFocus";
import type { AlertMode } from "@/contexts/GoNotificationContext";
import { inQuietHours, type GoAlertSettings } from "./goAlertPreferences";
import { recordAlarmReconciliation, recordAlarmAttempt } from "./goAlarmIncidents";

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
let currentPreferences: GoAlertSettings | null = null;
let revision = 0;
let schedulerActivated = false;
type RefreshFlight={expected:TaskScope;epoch:number;permission:boolean;dirty:boolean;promise:Promise<NativeReminderReport[]>};
let refreshFlight:RefreshFlight|null=null;
const same = (a: TaskScope | null, b: TaskScope | null) => a === null || b === null ? a === b : a.userId === b.userId && a.context === b.context;
export const isNativeTaskScopeActive = (expected: TaskScope) => same(scope, expected);
const listeners = new Set<() => void>();
const emptyReports: NativeReminderReport[] = [];
let confirmedReports = emptyReports;
export const subscribeNativeReminderReports = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const getNativeReminderReports = (expected: TaskScope | null) => expected && same(scope, expected) ? confirmedReports : emptyReports;
function publish(reports: NativeReminderReport[] = emptyReports) {
  confirmedReports = reports;
  for (const listener of listeners) listener();
}
const ports = createExpoReminderPorts({
  readTasks: readGoLog, now: () => Date.now(),
  readCompletionRequests: expected => completionPolicy?.requests(expected) ?? Promise.resolve([]),
  async scopeValid(expected) { return isNativeTaskScopeActive(expected) && await getTaskUser() === expected.userId && isNativeTaskScopeActive(expected); },
});
const scheduler = createNativeReminderScheduler(ports);
async function persistedMode(): Promise<AlertMode> {
  const values = await AsyncStorage.multiGet(["go_alert_mode_v1", "go_notif_enabled_v1"]);
  const alert = values[0][1];
  return mode === "silent" || values[1][1] === "off" || alert === "silent" ? "silent" : alert === "visual" ? "visual" : mode;
}
export async function setNativeTaskReminderScope(value: TaskScope | null, alertMode: AlertMode,
  preferences?: GoAlertSettings, deviceHaptics = true): Promise<NativeReminderReport[]> {
  currentPreferences = value && preferences ? preferences : null;
  if (preferences) scheduler.setPreferences({ enabled: preferences.categories.task, quietHours: preferences.quietHours,
    priority: preferences.priority, haptics: deviceHaptics });
  const previous = scope, changed = !same(scope, value), epoch = ++revision;
  scope = value ? { ...value } : null; mode = alertMode;
  if (changed || !value) schedulerActivated = false;
  publish();
  if (changed) clearTaskNotificationFocus();
  // Fence identity changes before preference reads; never briefly schedule with a default sound mode.
  if ((changed && previous) || !value) {
    const canceled = await scheduler.setScope(null, "silent");
    if (canceled.some(item => item.status === "failed")) {
      await recordAlarmReconciliation(canceled, previous?.context || value?.context || "live:USER", ports.platform);
      return canceled;
    }
  } else if (alertMode === "silent") await scheduler.setScope(scope, "silent");
  let effective: AlertMode;
  try { effective = await persistedMode(); }
  catch {
    const failed: NativeReminderReport[] = [{ taskId: "", minutes: 0, status: "failed", cause: "preferences" }];
    await recordAlarmReconciliation(failed, value?.context || "live:USER", ports.platform);
    return failed;
  }
  if (revision !== epoch || !same(scope, value)) return [];
  await recordAlarmAttempt(value?.context || "live:USER", ports.platform);
  if (revision !== epoch || !same(scope, value)) return [];
  const reports = await scheduler.setScope(scope, effective);
  await recordAlarmReconciliation(reports, value?.context || "live:USER", ports.platform);
  if (revision !== epoch || !same(scope, value)) return [];
  schedulerActivated = true;
  publish(reports);
  return reports;
}
export function refreshNativeTaskReminders(expected: TaskScope, requestPermission = false): Promise<NativeReminderReport[]> {
  if (!isNativeTaskScopeActive(expected)) return Promise.resolve([]);
  publish(); // A persisted edit/cancellation invalidates the old receipt immediately.
  if(refreshFlight&&refreshFlight.epoch===revision&&same(refreshFlight.expected,expected)){
    refreshFlight.permission ||= requestPermission;refreshFlight.dirty=true;return refreshFlight.promise;
  }
  const flight:RefreshFlight={expected:{...expected},epoch:revision,permission:requestPermission,dirty:true,promise:Promise.resolve([])};
  refreshFlight=flight;
  flight.promise=Promise.resolve().then(async()=>{
    let reports:NativeReminderReport[]=[], retried=false;
    while(flight.epoch===revision&&isNativeTaskScopeActive(flight.expected)){
      let savedMode: AlertMode;
      try { savedMode=await persistedMode(); }
      catch {
        reports=[{taskId:"",minutes:0,status:"failed",cause:"preferences"}];
        await recordAlarmReconciliation(reports,expected.context,ports.platform);
        if(flight.epoch===revision&&isNativeTaskScopeActive(expected))publish(reports);
        return reports;
      }
      if(flight.epoch!==revision||!isNativeTaskScopeActive(flight.expected))return [];
      const permission=flight.permission;flight.permission=false;flight.dirty=false;
      // Applying mode and refreshing is one reconciliation, not setScope + refresh.
      await recordAlarmAttempt(expected.context,ports.platform);
      if(flight.epoch!==revision||!isNativeTaskScopeActive(flight.expected))return [];
      if (!schedulerActivated) {
        reports=await scheduler.setScope(flight.expected,savedMode,permission);
        if(flight.epoch===revision&&isNativeTaskScopeActive(flight.expected))schedulerActivated=true;
      } else reports=await scheduler.refresh(flight.expected,{requestPermission:permission,mode:savedMode});
      if(flight.epoch!==revision||!isNativeTaskScopeActive(flight.expected))return [];
      const retry=!retried&&reports.some(item=>item.status==="failed");
      await recordAlarmReconciliation(reports,expected.context,ports.platform,retry);
      if(retry){retried=true;continue;} // Re-read before retry; stable IDs prevent duplicate delivery after an ambiguous failure.
      if(!flight.dirty){if(flight.epoch===revision&&isNativeTaskScopeActive(expected))publish(reports);return reports;}
    }
    return [];
  }).finally(()=>{if(refreshFlight===flight)refreshFlight=null;});
  return flight.promise;
}
export async function suspendNativeTaskReminders(): Promise<void> {
  const previous = scope;
  ++revision; scope = null; currentPreferences = null; schedulerActivated = false; publish(); clearTaskNotificationFocus();
  const report = await scheduler.setScope(null, mode);
  await recordAlarmReconciliation(report,previous?.context || "live:USER",ports.platform);
  if (report.some(item => item.status === "failed")) throw new Error("Alarma no activada");
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
  if (owner !== expected.userId || preference === "silent" || currentPreferences?.categories.task === false
    || (currentPreferences && inQuietHours(currentPreferences, Date.now())) || !isNativeTaskScopeActive(expected)) return false;
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
  ++revision; scope = null; currentPreferences = null; schedulerActivated = false; publish(); clearTaskNotificationFocus(); scheduler.pause();
}
