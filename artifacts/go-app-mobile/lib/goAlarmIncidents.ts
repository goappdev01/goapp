import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NativeReminderReport } from "./goNativeReminderScheduler";

const STORAGE_KEY = "go_alarm_incidents_v1";
const LIMIT = 80;
type Incident = {
  cause: string; context: "live" | "demo"; platform: string;
  firstAt: number; lastAt: number; attempts: number; affected: number;
  retry: "in_progress" | "queued" | "waiting_change" | "waiting_foreground" | "resolved";
  support: "local_only";
};
let queue: Promise<unknown> = Promise.resolve();
let memory: Incident[] = [];
let loaded = false;
const causes = new Set(["readTasks", "readCompletionRequests", "scopeValid", "permissions", "pending", "schedule", "cancel",
  "dismiss", "delivered", "identifier_mismatch", "readback_mismatch", "preferences", "persistence", "activation", "interrupted", "reconcile", "denied", "capacity", "unsupported", "invalid", "inactive"]);
export const getLocalAlarmIncidents = () => memory.map(item => ({ ...item }));

/** The existing support circuit is disabled and has no private diagnostics ingestion API.
 * Keep a bounded, serialized local journal; never create user-visible tickets or send to another service.
 * No task/account IDs, payloads, exception messages, titles, dates of tasks, tokens or contact data.
 */
export const recordAlarmAttempt = (context: string, platform: string) => recordAlarmReconciliation([], context, platform, false, true);
export function recordAlarmReconciliation(reports: NativeReminderReport[], context: string, platform: string, retryPlanned = false, started = false): Promise<void> {
  const work = queue.then(async () => {
    if (!loaded) {
      const unsaved = memory;
      let raw: unknown = [];
      let saved: string | null = null;
      try { saved = await AsyncStorage.getItem(STORAGE_KEY); loaded = true; }
      catch { console.warn("[GO alarms] Local incident journal unavailable; keeping events in memory."); }
      try { raw = JSON.parse(saved || "[]"); }
      catch { console.warn("[GO alarms] Invalid local incident journal; rebuilding."); }
      if (loaded && Array.isArray(raw)) memory = raw.filter(item => item && causes.has(item.cause)
        && ["live", "demo"].includes(item.context) && ["ios", "android", "web"].includes(item.platform)
        && Number.isFinite(item.firstAt) && Number.isFinite(item.lastAt) && Number.isInteger(item.attempts)
        && Number.isInteger(item.affected) && ["in_progress", "queued", "waiting_change", "waiting_foreground", "resolved"].includes(item.retry))
        .slice(-LIMIT).map(item => ({ cause: item.cause, context: item.context, platform: item.platform,
          firstAt: item.firstAt, lastAt: item.lastAt, attempts: item.attempts, affected: item.affected, retry: item.retry, support: "local_only" }));
      else if (loaded) memory = [];
      if (loaded) {
        for (const item of memory) if (item.retry === "in_progress") { item.cause = "interrupted"; item.retry = "waiting_foreground"; }
        memory.push(...unsaved);
        memory = memory.slice(-LIMIT);
      }
    }
    const zone = context.startsWith("demo:") ? "demo" : "live", now = Date.now();
    if (started) {
      let attempt = memory.find(item => item.context === zone && item.platform === platform && item.cause === "activation");
      if (!attempt) { attempt = { cause: "activation", context: zone, platform, firstAt: now, lastAt: now, attempts: 0, affected: 0, retry: "in_progress", support: "local_only" }; memory.push(attempt); }
      attempt.lastAt = now; attempt.attempts++; attempt.retry = "in_progress";
      memory = memory.slice(-LIMIT);
      if (loaded) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
      return;
    }
    for (const item of memory) if (item.context === zone && item.platform === platform && item.cause === "activation") {
      item.retry = "resolved"; item.lastAt = now;
    }
    const failures = reports.filter(item => ["failed", "denied", "capacity", "unsupported", "invalid", "inactive"].includes(item.status));
    const groups = new Map<string, number>();
    for (const failure of failures) {
      const cause = failure.status === "failed" ? causes.has(failure.cause || "") ? failure.cause! : "reconcile" : failure.status;
      groups.set(cause, (groups.get(cause) || 0) + 1);
    }
    for (const [cause, affected] of groups) {
      let item = memory.find(row => row.context === zone && row.platform === platform && row.cause === cause && row.retry !== "resolved");
      if (!item) { item = { cause, context: zone, platform, firstAt: now, lastAt: now, attempts: 0, affected, retry: "queued", support: "local_only" }; memory.push(item); }
      item.lastAt = now; item.attempts++; item.affected = affected;
      item.retry = retryPlanned ? "queued" : ["denied", "capacity", "unsupported", "invalid", "inactive", "persistence"].includes(cause) ? "waiting_change" : "waiting_foreground";
    }
    if (!failures.length) for (const item of memory) {
      if (item.context === zone && item.platform === platform && item.cause !== "persistence" && item.retry !== "resolved") { item.retry = "resolved"; item.lastAt = now; }
    }
    memory = memory.slice(-LIMIT);
    if (loaded) await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(memory));
  });
  queue = work.catch(() => { console.warn("[GO alarms] Local incident journal could not be persisted."); });
  return queue.then(() => undefined);
}
