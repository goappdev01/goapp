import type { GoEntry } from "@/components/AgendaOperativa";
import { isPersonalTask } from "./goTaskAccess";
import { effectiveNoteReminderEntry, hasAttachedNoteReminder } from "./goNoteTools";
import { taskInScope, reminderOffsets, reminderTaskInstant, type ReminderTask, type TaskScope } from "./goTaskReminders";

export const NATIVE_REMINDER_PREFIX = "go-task-reminder-v1:";
export type NativeReminderStatus = "scheduled" | "quiet" | "denied" | "muted" | "past" | "invalid"
  | "capacity" | "unsupported" | "failed" | "inactive";
export type NativeReminderReport = { taskId: string; minutes: number; status: NativeReminderStatus; at?: number; identifier?: string };
export type NativeReminderRequest = {
  identifier: string; taskId: string; minutes: number; at: number; scope: TaskScope;
  title: string; sound: boolean; signature: string;
  completion?: { key: string; schedule: string };
};
type NativeRequest = { identifier: string; data: Record<string, unknown> };
export type NativeReminderPorts = {
  platform: "ios" | "android" | "web";
  readTasks(): Promise<ReminderTask[]>;
  readCompletionRequests?(scope: TaskScope): Promise<NativeReminderRequest[]>;
  scopeValid(scope: TaskScope): Promise<boolean>;
  permissions(request: boolean): Promise<"allowed" | "quiet" | "denied">;
  pending(): Promise<NativeRequest[]>;
  schedule(request: NativeReminderRequest): Promise<string>;
  cancel(identifier: string): Promise<void>;
  dismiss(identifier: string): Promise<void>;
  delivered(): Promise<NativeRequest[]>;
  now(): number;
};
type Mode = "sound" | "visual" | "silent";
type Desired = NativeReminderRequest & { report: NativeReminderReport };

/** These personal tasks use the OS queue instead of Landing's polling timers. */
export function isNativeReminderTask(entry: GoEntry): boolean {
  return (isPersonalTask(entry) || isExplicitGoNote(entry) || hasAttachedNoteReminder(entry)) && !!(entry as GoEntry & { ownerUserId?: string }).ownerUserId
    && Array.isArray(entry.reminders);
}
// An explicitly saved GO Nota can contain a list title/bullets without becoming a different record.
function isExplicitGoNote(entry: GoEntry): boolean {
  return (entry as GoEntry & { goNoteReminder?: boolean }).goNoteReminder === true
    && entry.kind === "sent" && ["TAREA", "TAREA_INTERNA"].includes(entry.type || "") && !entry.recipients?.length;
}
export function nativeReminderTaskInScope(entry: ReminderTask, scope: TaskScope): boolean {
  return taskInScope(entry, scope) || ((isExplicitGoNote(entry) || hasAttachedNoteReminder(entry))
    && (entry as ReminderTask & { ownerUserId?: string }).ownerUserId === scope.userId && entry.taskContext === scope.context);
}
export function nativeReminderIdentifier(scope: TaskScope, taskId: string, minutes: number): string {
  return NATIVE_REMINDER_PREFIX + encodeURIComponent(JSON.stringify([scope.userId, scope.context, taskId, minutes]));
}
function sameScope(a: TaskScope | null, b: TaskScope | null): boolean {
  return !!a && !!b && a.userId === b.userId && a.context === b.context;
}
function managed(request: NativeRequest): boolean { return request.identifier.startsWith(NATIVE_REMINDER_PREFIX); }
function scopeOf(request: NativeRequest): TaskScope | null {
  try {
    const values = JSON.parse(decodeURIComponent(request.identifier.slice(NATIVE_REMINDER_PREFIX.length)));
    if (Array.isArray(values) && values.length === 4 && typeof values[0] === "string" && typeof values[1] === "string")
      return { userId: values[0], context: values[1] };
  } catch { /* A malformed owned request must be cancelled, never adopted. */ }
  return null;
}

/** Pure serialized controller. The operating system owns delivery after scheduling. */
export function createNativeReminderScheduler(ports: NativeReminderPorts) {
  let current: TaskScope | null = null, mode: Mode = "sound", generation = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let observed: NativeRequest[] = [];
  function enqueue(job: () => Promise<NativeReminderReport[]>): Promise<NativeReminderReport[]> {
    const result = queue.then(job, job).catch(() => {
      const reports = failures(observed);
      return reports.length ? reports : [{ taskId: "", minutes: 0, status: "failed" as const }];
    });
    queue = result.catch(() => undefined);
    return result;
  }
  function fresh(epoch: number, expected: TaskScope | null) {
    return epoch === generation && (expected === null ? current === null : sameScope(current, expected));
  }
  async function valid(epoch: number, expected: TaskScope) {
    if (!fresh(epoch, expected)) return false;
    const allowed = await ports.scopeValid(expected);
    return fresh(epoch, expected) && allowed;
  }
  async function clear(requests: NativeRequest[], kind: "pending" | "delivered", keep: (request: NativeRequest) => boolean) {
    for (const request of requests) {
      if (!managed(request) || keep(request)) continue;
      if (kind === "pending") await ports.cancel(request.identifier);
      else await ports.dismiss(request.identifier);
    }
  }
  async function reconcile(epoch: number, expected: TaskScope | null, selectedMode: Mode, requestPermission: boolean): Promise<NativeReminderReport[]> {
    if (!fresh(epoch, expected)) return [];
    if (ports.platform === "web") {
      if (!expected || !await valid(epoch, expected)) return [];
      const entries = await ports.readTasks();
      if (!fresh(epoch, expected)) return [];
      const report = entries.filter(entry => isNativeReminderTask(entry) && nativeReminderTaskInScope(entry, expected))
        .flatMap(entry => reminderOffsets(effectiveNoteReminderEntry(entry)).map(minutes => ({ taskId: entry.id, minutes, status: "unsupported" as const })));
      const completions = await ports.readCompletionRequests?.(expected) ?? [];
      if (!await valid(epoch, expected)) return [];
      return [...report, ...completions.map(item => ({ taskId: item.taskId, minutes: 0, status: "unsupported" as const }))];
    }
    const pending = await ports.pending();
    observed = pending.filter(managed);
    if (!fresh(epoch, expected)) return [];
    const delivered = await ports.delivered();
    observed = [...observed, ...delivered.filter(managed)];
    if (!fresh(epoch, expected)) return [];
    let verified = false;
    try { verified = expected !== null && await valid(epoch, expected); } catch { /* Unverifiable identity must clear private OS payloads. */ }
    if (!fresh(epoch, expected)) return [];
    // Never depend on foreground handlers for privacy: remove the OS's stored payload.
    try {
      await clear(pending, "pending", item => verified && sameScope(scopeOf(item), expected));
      if (!fresh(epoch, expected)) return [];
      await clear(delivered, "delivered", item => verified && sameScope(scopeOf(item), expected));
    } catch { return failures([...pending, ...delivered]); }
    if (!fresh(epoch, expected) || !verified || !expected) return [];

    const entries = await ports.readTasks();
    if (!await valid(epoch, expected)) return [];
    const reports: NativeReminderReport[] = [], desired: Desired[] = [];
    const identifiers = new Map<string, number>();
    entries.forEach(entry => identifiers.set(entry.id, (identifiers.get(entry.id) || 0) + 1));
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const associated = new Set<string>();
    const deliveredSignature = new Map<string, [number, string, string]>();
    for (const rawEntry of entries) {
      const entry = effectiveNoteReminderEntry(rawEntry);
      if (!isNativeReminderTask(entry) || !nativeReminderTaskInScope(entry, expected)) continue;
      const offsets = reminderOffsets(entry);
      for (const minutes of offsets) {
        const identifier = nativeReminderIdentifier(expected, entry.id, minutes);
        if (associated.has(identifier)) continue;
        associated.add(identifier);
        const report: NativeReminderReport = { taskId: entry.id, minutes, identifier, status: "failed" };
        reports.push(report);
        if ((identifiers.get(entry.id) || 0) !== 1) { report.status = "invalid"; continue; }
        if (entry.deleted || entry.estado === "rechazado" || entry.notificationsEnabled === false || selectedMode === "silent") {
          report.status = "muted"; continue;
        }
        let at: number;
        try { at = reminderTaskInstant(entry) - minutes * 60000; }
        catch { report.status = "invalid"; continue; }
        report.at = at;
        deliveredSignature.set(identifier, [at, timezone, entry.notes || "Tarea"]);
        if (!Number.isFinite(at)) { report.status = "invalid"; continue; }
        if (at <= ports.now()) { report.status = "past"; continue; }
        desired.push({ identifier, taskId: entry.id, minutes, at, scope: { ...expected },
          title: entry.notes || "Tarea", sound: selectedMode === "sound", signature: "", report });
      }
    }
    if (ports.readCompletionRequests) {
      const completions = await ports.readCompletionRequests(expected);
      if (!await valid(epoch, expected)) return [];
      // Preserve delivered unresolved notices only while their identity and schedule remain valid.
      for (const old of delivered) {
        if (selectedMode === "silent" || old.data.goActionCompletion !== true || !completions.some(request =>
          request.completion?.key === old.data.completionKey && request.completion?.schedule === old.data.completionSchedule)) continue;
        try {
          const signature = JSON.parse(String(old.data.signature));
          if (Number.isFinite(signature[0]) && signature[0] <= ports.now() && signature[1] === timezone && typeof signature[2] === "string")
            deliveredSignature.set(old.identifier, [signature[0], signature[1], signature[2]]);
        } catch { /* Malformed native payloads are removed below. */ }
      }
      for (const request of completions) {
        if (request.at <= ports.now() || !sameScope(request.scope, expected)) continue;
        const report: NativeReminderReport = { taskId: request.taskId, minutes: 0, at: request.at,
          identifier: request.identifier, status: "failed" };
        reports.push(report);
        if (selectedMode === "silent") { report.status = "muted"; continue; }
        desired.push({ ...request, sound: selectedMode === "sound", report });
        deliveredSignature.set(request.identifier, [request.at, timezone, request.title]);
      }
    }
    let permission: "allowed" | "quiet" | "denied" = "allowed";
    if (desired.length) {
      permission = await ports.permissions(requestPermission);
      if (!await valid(epoch, expected)) return [];
    }
    if (permission === "denied") desired.forEach(item => { item.report.status = "denied"; });
    const allowed = permission === "denied" ? [] : desired;
    allowed.sort((a, b) => a.at - b.at || a.identifier.localeCompare(b.identifier));
    const foreignCount = pending.filter(item => !managed(item)).length;
    const retained = allowed.slice(0, Math.max(0, 64 - foreignCount));
    allowed.slice(retained.length).forEach(item => { item.report.status = "capacity"; });
    retained.forEach(item => {
      item.sound = item.sound && permission !== "quiet";
      item.signature = JSON.stringify([item.at, timezone, item.title, item.sound]);
    });
    const wanted = new Map(retained.map(item => [item.identifier, item]));
    // Cancel obsolete schedules before creating anything; cancellation failure aborts the run.
    try {
      await clear(pending, "pending", item => {
        const wantedItem = wanted.get(item.identifier);
        return !!wantedItem && matches(item, wantedItem);
      });
      if (!await valid(epoch, expected)) return [];
      await clear(delivered, "delivered", item => {
        const signature = deliveredSignature.get(item.identifier);
        if (!signature) return false;
        try {
          const old = JSON.parse(String(item.data.signature));
          return JSON.stringify(old.slice(0, 3)) === JSON.stringify(signature);
        } catch { return false; }
      });
      if (!await valid(epoch, expected)) return [];
    } catch {
      retained.forEach(item => { item.report.status = "failed"; });
      const oldFailures = failures([...pending, ...delivered]);
      for (const failed of oldFailures) {
        const existing = reports.find(report => report.identifier === failed.identifier);
        if (existing) existing.status = "failed"; else reports.push(failed);
      }
      return reports;
    }

    for (const item of retained) {
      if (!await valid(epoch, expected)) return [];
      const exists = pending.some(request => matches(request, item));
      if (!exists) {
        // Permission prompts or earlier native operations can outlive the requested deadline.
        if (item.at <= ports.now()) { item.report.status = "past"; continue; }
        try {
          const scheduledId = await ports.schedule(item);
          if (!await valid(epoch, expected)) {
            if (scheduledId.startsWith(NATIVE_REMINDER_PREFIX)) await ports.cancel(scheduledId);
            return [];
          }
          if (scheduledId !== item.identifier) {
            if (scheduledId.startsWith(NATIVE_REMINDER_PREFIX)) await ports.cancel(scheduledId);
            item.report.status = "failed";
            continue;
          }
        } catch {
          item.report.status = "failed";
          if (!fresh(epoch, expected)) return reports;
          continue;
        }
      }
      try {
        const confirmed = await ports.pending();
        if (!await valid(epoch, expected)) {
          await ports.cancel(item.identifier);
          return [];
        }
        item.report.status = confirmed.some(request => matches(request, item))
          ? permission === "quiet" || selectedMode === "visual" ? "quiet" : "scheduled" : "failed";
      } catch { item.report.status = "failed"; }
    }
    return reports;
  }
  function matches(request: NativeRequest, desired: NativeReminderRequest) {
    return request.identifier === desired.identifier && request.data.signature === desired.signature
      && request.data.taskId === desired.taskId && request.data.minutes === desired.minutes;
  }
  function failures(requests: NativeRequest[]): NativeReminderReport[] {
    const results = new Map<string, NativeReminderReport>();
    for (const item of requests) {
      if (!managed(item)) continue;
      let taskId = typeof item.data.taskId === "string" ? item.data.taskId : "", minutes = Number(item.data.minutes) || 0;
      try { const parts = JSON.parse(decodeURIComponent(item.identifier.slice(NATIVE_REMINDER_PREFIX.length)));
        if (typeof parts[2] === "string") taskId = parts[2];
        if (typeof parts[3] === "number") minutes = parts[3];
      } catch { /* Preserve a failure result even for an obsolete malformed ID. */ }
      results.set(item.identifier, { taskId, minutes, identifier: item.identifier, status: "failed" });
    }
    return [...results.values()];
  }
  function setScope(scope: TaskScope | null, nextMode: Mode = "sound"): Promise<NativeReminderReport[]> {
    const same = scope === null ? current === null : sameScope(current, scope);
    if (!same || mode !== nextMode) generation++;
    current = scope ? { ...scope } : null;
    mode = nextMode;
    const epoch = generation, expected = current;
    return enqueue(() => reconcile(epoch, expected, nextMode, false));
  }
  function refresh(scope: TaskScope, options: { requestPermission?: boolean } = {}): Promise<NativeReminderReport[]> {
    if (!sameScope(current, scope)) return Promise.resolve([]);
    const epoch = generation, expected = current ? { ...current } : null, selectedMode = mode;
    return enqueue(() => reconcile(epoch, expected, selectedMode, !!options.requestPermission));
  }
  // Unmount/HMR fences unfinished JS work, without removing already confirmed OS requests.
  function pause() { generation++; current = null; }
  return { setScope, refresh, pause };
}
