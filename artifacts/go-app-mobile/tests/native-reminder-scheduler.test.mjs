import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
process.env.TZ = "Europe/Madrid";
function load(file, modules = {}) {
  const context = { exports: {}, Date, Intl, console, require(name) {
    if (name in modules) return modules[name];
    throw Error("Unexpected import: " + name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return context.exports;
}
const access = load("lib/goTaskAccess.ts", { "@/data/booking": { getAuthenticatedUserId() { throw Error("Unexpected authentication"); } } });
const reminders = load("lib/goTaskReminders.ts", {
  "@workspace/api-zod": {}, "./goLogBridge": {}, "./goTaskAccess": access,
});
const model = load("lib/goNativeReminderScheduler.ts", { "./goTaskAccess": access, "./goTaskReminders": reminders, "./goNoteTools": load("lib/goNoteTools.ts") });
const plain = value => JSON.parse(JSON.stringify(value));
const A = { userId: "A", context: "live:USER" };
const task = (id = "buy", extra = {}) => ({ id, kind: "sent", notes: "Hacer la compra", dateISO: "2026-10-13",
  time: "17:00", type: "TAREA_INTERNA", ownerUserId: "A", reminders: [60], estado: "pendiente", ...extra });
const id = (scope = A, taskId = "buy", minutes = 60) => model.nativeReminderIdentifier(scope, taskId, minutes);
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
function fixture(tasks = [task()], platform = "ios") {
  const state = { tasks, permissions: "allowed", valid: true, now: new Date("2026-10-12T12:00:00").getTime(),
    scheduleFail: false, cancelFail: false, dismissFail: false, readbackEmpty: false, pendingFail: false,
    scheduleGate: null, scheduleEntered: null, permissionGate: null, permissionEntered: null };
  const pending = new Map(), delivered = new Map(), calls = { schedule: [], cancel: [], dismiss: [], permissions: [], reads: 0 };
  const ports = { platform,
    async readTasks() { return plain(state.tasks); },
    async scopeValid() { return state.valid; },
    async permissions(request) { calls.permissions.push(request); state.permissionEntered?.resolve();
      await state.permissionGate?.promise; return state.permissions; },
    async pending() { calls.reads++; if (state.pendingFail) throw Error("Unavailable");
      return state.readbackEmpty ? [] : [...pending.values()]; },
    async schedule(request) { calls.schedule.push(plain(request)); state.scheduleEntered?.resolve();
      await state.scheduleGate?.promise; if (state.scheduleFail) throw Error("No scheduling");
      pending.set(request.identifier, { identifier: request.identifier,
        data: { taskId: request.taskId, minutes: request.minutes, signature: request.signature } });
      return request.identifier;
    },
    async cancel(identifier) { calls.cancel.push(identifier); if (state.cancelFail) throw Error("No cancellation"); pending.delete(identifier); },
    async dismiss(identifier) { calls.dismiss.push(identifier); if (state.dismissFail) throw Error("No dismissal"); delivered.delete(identifier); },
    async delivered() { return [...delivered.values()]; }, now() { return state.now; },
  };
  return { state, pending, delivered, calls, ports, controller: model.createNativeReminderScheduler(ports) };
}
test("mandatory 13 October task schedules one native request at 16:00 and preserves the original", async () => {
  const f = fixture(); const result = await f.controller.setScope(A);
  assert.equal(result[0].status, "scheduled"); assert.equal(result[0].identifier, id());
  const at = new Date(result[0].at); assert.equal(at.getFullYear(), 2026); assert.equal(at.getMonth(), 9);
  assert.equal(at.getDate(), 13); assert.equal(at.getHours(), 16); assert.equal(at.getMinutes(), 0);
  assert.equal(f.calls.schedule.length, 1); assert.equal(f.state.tasks.length, 1); assert.equal(f.state.tasks[0].time, "17:00");
});
test("repeat refresh, repeated offsets and simultaneous requests do not duplicate the OS request", async () => {
  const f = fixture([task("buy", { reminders: [60, 60] })]); await f.controller.setScope(A);
  await Promise.all([f.controller.refresh(A), f.controller.refresh(A), f.controller.refresh(A)]);
  assert.equal(f.pending.size, 1); assert.equal(f.calls.schedule.length, 1);
});
test("a new controller recovers the existing OS queue after an application restart", async () => {
  const f = fixture(); await f.controller.setScope(A); const second = model.createNativeReminderScheduler(f.ports);
  const result = await second.setScope(A); assert.equal(result[0].status, "scheduled");
  assert.equal(f.calls.schedule.length, 1); assert.equal(f.pending.size, 1);
});
test("editing the task time reprograms the same ID with the recomputed relative timestamp", async () => {
  const f = fixture(); await f.controller.setScope(A); f.state.tasks[0].time = "18:00";
  const result = await f.controller.refresh(A); assert.equal(new Date(result[0].at).getHours(), 17);
  assert.equal(result[0].status, "scheduled"); assert.equal(f.pending.size, 1);
  assert.equal(f.calls.schedule.length, 2); assert.equal(f.calls.schedule[0].identifier, f.calls.schedule[1].identifier);
  assert.deepEqual(f.calls.cancel, [id()]);
});
test("changing an offset cancels the prior request; removing the last offset removes pending and delivered", async () => {
  const f = fixture(); await f.controller.setScope(A); f.state.tasks[0].reminders = [30]; await f.controller.refresh(A);
  assert.ok(!f.pending.has(id())); assert.ok(f.pending.has(id(A, "buy", 30)));
  f.delivered.set(id(A, "buy", 30), f.pending.get(id(A, "buy", 30)));
  f.state.tasks[0].reminders = []; const result = await f.controller.refresh(A);
  assert.equal(result.length, 0); assert.equal(f.pending.size, 0); assert.equal(f.delivered.size, 0);
});
test("deleting, rejecting or muting tasks cancels their scheduled and delivered alerts", async () => {
  for (const extra of [{ deleted: true }, { estado: "rechazado" }, { notificationsEnabled: false }]) {
    const f = fixture(); await f.controller.setScope(A); f.delivered.set(id(), f.pending.get(id()));
    Object.assign(f.state.tasks[0], extra); const result = await f.controller.refresh(A);
    assert.equal(result[0].status, "muted"); assert.equal(f.pending.size, 0); assert.equal(f.delivered.size, 0);
  }
});
test("silent mode removes native alerts; visual and provisional modes program quiet notifications", async () => {
  const f = fixture(); await f.controller.setScope(A); let result = await f.controller.setScope(A, "silent");
  assert.equal(result[0].status, "muted"); assert.equal(f.pending.size, 0);
  result = await f.controller.setScope(A, "visual"); assert.equal(result[0].status, "quiet");
  assert.equal(f.calls.schedule.at(-1).sound, false);
  f.state.permissions = "quiet"; result = await f.controller.setScope(A, "sound");
  assert.equal(result[0].status, "quiet"); assert.equal(f.calls.schedule.at(-1).sound, false);
});
test("denied permission never confirms activation and explicit recovery can request permission once", async () => {
  const f = fixture(); f.state.permissions = "denied"; const denied = await f.controller.setScope(A);
  assert.equal(denied[0].status, "denied"); assert.equal(f.calls.schedule.length, 0);
  f.state.permissions = "allowed"; const result = await f.controller.refresh(A, { requestPermission: true });
  assert.equal(result[0].status, "scheduled"); assert.deepEqual(f.calls.permissions, [false, true]);
});
test("revoking permission cancels prior requests and does not acknowledge an active alert", async () => {
  const f = fixture(); await f.controller.setScope(A); f.state.permissions = "denied";
  const result = await f.controller.refresh(A); assert.equal(result[0].status, "denied"); assert.equal(f.pending.size, 0);
});
test("wrong users, contexts, legacy unowned records and duplicate IDs cannot schedule private alerts", async () => {
  const rows = [task("ok"), task("foreign", { ownerUserId: "B" }), task("demo", { taskContext: "demo:USER" }),
    task("business", { taskContext: "demo:BUSINESS:company" }), task("unowned", { ownerUserId: undefined }),
    task("duplicate"), task("duplicate"), task("legacy", { reminders: undefined })];
  const f = fixture(rows); const result = await f.controller.setScope(A);
  assert.equal(f.pending.size, 1); assert.ok(f.pending.has(id(A, "ok")));
  assert.equal(result.find(item => item.taskId === "duplicate").status, "invalid");
  assert.equal(model.isNativeReminderTask(task("unowned", { ownerUserId: undefined })), false);
  assert.equal(model.isNativeReminderTask(task("legacy", { reminders: undefined })), false);
});
test("switching user or company and logging out cancels only managed private alerts", async () => {
  const scopes = [A, { userId: "B", context: "live:USER" }, { userId: "B", context: "demo:BUSINESS:company" }];
  const f = fixture(scopes.map((scope, i) => task(String(i), { ownerUserId: scope.userId, taskContext: scope.context })));
  f.pending.set("marketplace", { identifier: "marketplace", data: {} });
  f.delivered.set("remote", { identifier: "remote", data: {} });
  for (const scope of scopes) {
    await f.controller.setScope(scope); assert.equal(f.pending.size, 2);
    assert.ok([...f.pending.keys()].some(identifier => identifier === id(scope, String(scopes.indexOf(scope)))));
  }
  await f.controller.setScope(null); assert.deepEqual([...f.pending.keys()], ["marketplace"]);
  assert.deepEqual([...f.delivered.keys()], ["remote"]); assert.ok(f.calls.cancel.every(x => x.startsWith(model.NATIVE_REMINDER_PREFIX)));
});
test("invalid authentication cancels private schedules even when the cached scope has not changed", async () => {
  const f = fixture(); await f.controller.setScope(A); f.state.valid = false;
  await f.controller.refresh(A); assert.equal(f.pending.size, 0); assert.deepEqual(f.calls.cancel, [id()]);
});
test("changing scope during scheduling cancels the just-registered alert before the new job", async () => {
  const f = fixture(); f.state.scheduleGate = deferred(); f.state.scheduleEntered = deferred();
  const first = f.controller.setScope(A); await f.state.scheduleEntered.promise;
  const loggedOut = f.controller.setScope(null); f.state.scheduleGate.resolve();
  await Promise.all([first, loggedOut]); assert.equal(f.pending.size, 0); assert.deepEqual(f.calls.cancel, [id()]);
});
test("changing scope during permission checks does not schedule the old account", async () => {
  const f = fixture(); f.state.permissionGate = deferred(); f.state.permissionEntered = deferred();
  const first = f.controller.setScope(A); await f.state.permissionEntered.promise;
  const out = f.controller.setScope(null); f.state.permissionGate.resolve(); await Promise.all([first, out]);
  assert.equal(f.calls.schedule.length, 0);
});
test("cancellation failure reports the removed task and blocks replacement schedules until recovery", async () => {
  const f = fixture(); await f.controller.setScope(A); f.state.tasks = []; f.state.cancelFail = true;
  const result = await f.controller.refresh(A); assert.equal(result[0].taskId, "buy");
  assert.equal(result[0].minutes, 60); assert.equal(result[0].status, "failed"); assert.equal(f.pending.size, 1);
  f.state.cancelFail = false; await f.controller.refresh(A); assert.equal(f.pending.size, 0);
});
test("a privacy cancellation failure on account switch never schedules the next user's reminders", async () => {
  const f = fixture([task(), task("other", { ownerUserId: "B" })]); await f.controller.setScope(A); f.state.cancelFail = true;
  const result = await f.controller.setScope({ userId: "B", context: "live:USER" });
  assert.equal(result[0].status, "failed"); assert.equal(f.calls.schedule.length, 1);
});
test("capacity reserves third-party requests and prioritizes the nearest 64 minus existing third-party slots", async () => {
  const f = fixture(Array.from({ length: 65 }, (_, i) => task(String(i), { time: i === 64 ? "16:00" : "17:00" })));
  f.pending.set("marketplace", { identifier: "marketplace", data: {} });
  const result = await f.controller.setScope(A); assert.equal(f.calls.schedule.length, 63); assert.equal(f.pending.size, 64);
  assert.equal(result.filter(item => item.status === "capacity").length, 2); assert.ok(f.pending.has(id(A, "64")));
  assert.ok(!f.calls.cancel.includes("marketplace"));
});
test("past, absent, invalid or ambiguous DST schedules are never programmed", async () => {
  for (const extra of [{ dateISO: "2020-01-01" }, { time: "" }, { dateISO: "2026-02-31" },
    { dateISO: "2027-03-28", time: "02:30" }, { dateISO: "2026-10-25", time: "02:30" }]) {
    const f = fixture([task("buy", extra)]); const result = await f.controller.setScope(A);
    assert.ok(["past", "invalid"].includes(result[0].status)); assert.equal(f.calls.schedule.length, 0);
  }
});
test("relative anticipation uses elapsed time across midnight and DST rather than inventing a local hour", async () => {
  const f = fixture([task("spring", { dateISO: "2027-03-28", time: "03:30" }), task("midnight", { time: "00:30" })]);
  const result = await f.controller.setScope(A); const spring = new Date(result.find(r => r.taskId === "spring").at);
  assert.equal(spring.getHours(), 1); assert.equal(spring.getMinutes(), 30);
  const midnight = new Date(result.find(r => r.taskId === "midnight").at); assert.equal(midnight.getDate(), 12);
  assert.equal(midnight.getHours(), 23); assert.equal(midnight.getMinutes(), 30);
});
test("scheduled is returned only after OS readback confirms the request; native failures stay failed", async () => {
  const f = fixture(); f.state.readbackEmpty = true; const result = await f.controller.setScope(A);
  assert.equal(result[0].status, "failed");
  const g = fixture(); g.state.scheduleFail = true; const failure = await g.controller.setScope(A);
  assert.equal(failure[0].status, "failed"); assert.equal(g.pending.size, 0);
  g.state.scheduleFail = false; const retry = await g.controller.refresh(A); assert.equal(retry[0].status, "scheduled");
  g.state.pendingFail = true; const unavailable = await g.controller.refresh(A); assert.equal(unavailable[0].status, "failed");
});
test("valid delivered alerts remain visible after due time; changed or removed reminders are dismissed", async () => {
  const f = fixture(); const result = await f.controller.setScope(A); f.delivered.set(id(), f.pending.get(id())); f.pending.delete(id());
  f.state.now = result[0].at + 1000; await f.controller.refresh(A); assert.equal(f.delivered.size, 1);
  assert.equal(f.calls.schedule.length, 1); assert.equal(f.calls.dismiss.length, 0);
  f.state.tasks[0].time = "18:00"; await f.controller.refresh(A); assert.equal(f.delivered.size, 0); assert.deepEqual(f.calls.dismiss, [id()]);
});
test("malformed managed metadata is replaced safely and foreign notification payloads are preserved", async () => {
  const f = fixture(); await f.controller.setScope(A); f.pending.get(id()).data.taskId = "different";
  f.pending.set(model.NATIVE_REMINDER_PREFIX + "malformed", { identifier: model.NATIVE_REMINDER_PREFIX + "malformed", data: {} });
  const result = await f.controller.refresh(A); assert.equal(result[0].status, "scheduled");
  assert.equal(f.pending.size, 1); assert.equal(f.calls.schedule.length, 2);
});
test("web explicitly returns unsupported without using native notification APIs", async () => {
  const f = fixture([task()], "web"); const result = await f.controller.setScope(A);
  assert.equal(result[0].status, "unsupported"); assert.equal(f.calls.reads, 0); assert.equal(f.calls.schedule.length, 0);
});

test("publishing the same scope and mode while scheduling does not invalidate the authorized request", async () => {
  const f = fixture(); f.state.scheduleGate = deferred(); f.state.scheduleEntered = deferred();
  const first = f.controller.setScope(A); await f.state.scheduleEntered.promise;
  const same = f.controller.setScope({ ...A }, "sound"); f.state.scheduleGate.resolve();
  const [initial, repeated] = await Promise.all([first, same]);
  assert.equal(initial[0].status, "scheduled"); assert.equal(repeated[0].status, "scheduled");
  assert.equal(f.calls.schedule.length, 1); assert.equal(f.calls.cancel.length, 0); assert.equal(f.pending.size, 1);
});
test("logout cancellation failures return a public failed report instead of rejecting", async () => {
  const f = fixture(); await f.controller.setScope(A); f.state.cancelFail = true;
  const report = await f.controller.setScope(null); assert.equal(report[0].status, "failed");
  assert.equal(report[0].taskId, "buy"); assert.equal(f.pending.size, 1);
});
test("identity validation errors clear private schedules conservatively", async () => {
  const f = fixture(); await f.controller.setScope(A); f.ports.scopeValid = async () => { throw Error("Unavailable identity"); };
  await f.controller.refresh(A); assert.equal(f.pending.size, 0);
});

test("a reminder that expires during the permission prompt is not scheduled with a past DATE trigger", async () => {
  const f = fixture(); const at = reminders.reminderTaskInstant(f.state.tasks[0]) - 60 * 60000;
  f.state.now = at - 1000; f.state.permissionGate = deferred(); f.state.permissionEntered = deferred();
  const first = f.controller.setScope(A); await f.state.permissionEntered.promise;
  f.state.now = at + 1000; f.state.permissionGate.resolve(); const report = await first;
  assert.equal(report[0].status, "past"); assert.equal(f.calls.schedule.length, 0); assert.equal(f.pending.size, 0);
});

test("normal JS cleanup preserves confirmed OS requests, but fences unconfirmed late scheduling",async()=>{
 const existing=fixture();await existing.controller.setScope(A);existing.controller.pause();
 assert.equal(existing.pending.size,1);assert.equal(existing.calls.cancel.length,0);
 const late=fixture();late.state.scheduleGate=deferred();late.state.scheduleEntered=deferred();
 const opening=late.controller.setScope(A);await late.state.scheduleEntered.promise;
 late.controller.pause();late.state.scheduleGate.resolve();await opening;
 assert.equal(late.pending.size,0);assert.deepEqual(late.calls.cancel,[id()]);
});
