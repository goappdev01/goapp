import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json")), ts = require("typescript");
const A = { userId: "A", context: "live:USER" }, B = { userId: "B", context: "live:USER" };
const plain = value => JSON.parse(JSON.stringify(value));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
const response = (scope = A, taskId = "buy") => ({ notification: { date: 101,
  request: { identifier: "notice:" + scope.userId + ":" + scope.context + ":" + taskId,
    content: { data: { goTaskReminder: true, userId: scope.userId, context: scope.context, taskId } } } } });
function fixture({ ready = true, scope = A, last = null, platform = "ios" } = {}) {
  const refs = [], effects = [], commits = [], subscriptions = { store: new Set(), session: new Set(), app: new Set(), tap: new Set() };
  const calls = { setup: [], refresh: [], suspend: 0, open: [], clear: 0, removed: [], warnings: [], nativeCancel: 0 };
  const state = { identity: { ready, scope }, alertMode: "sound", active: null, last, openGate: null };
  let refIndex = 0, effectIndex = 0;
  const subscribe = (kind, listener) => { subscriptions[kind].add(listener); return () => {
    subscriptions[kind].delete(listener); calls.removed.push(kind);
  }; };
  const react = {
    useRef(value) { const index = refIndex++; return refs[index] ||= { current: value }; },
    useEffect(fn, dependencies) {
      const index = effectIndex++, previous = effects[index];
      if (!previous || dependencies.some((value, i) => !Object.is(value, previous.dependencies[i]))) {
        const next = { dependencies: [...dependencies], cleanup: null };
        effects[index] = next; commits.push(() => { previous?.cleanup?.(); next.cleanup = fn(); });
      }
    },
  };
  const runtime = {
    setNativeTaskReminderScope(scope, mode) {
      const gate = deferred(); state.active = scope ? plain(scope) : null;
      calls.setup.push({ scope: scope ? plain(scope) : null, mode, gate }); return gate.promise;
    },
    async refreshNativeTaskReminders(scope) { calls.refresh.push(plain(scope)); return []; },
    suspendNativeTaskReminders() { calls.suspend++; state.active = null; return Promise.resolve(); },
    pauseNativeTaskReminderRuntime() { state.active = null; },
    isNativeTaskScopeActive(scope) { return !!state.active && scope.userId === state.active.userId && scope.context === state.active.context; },
    async openNativeReminderTask(data) { calls.open.push(plain(data)); await state.openGate?.promise; return true; },
  };
  const notifications = {
    addNotificationResponseReceivedListener(listener) { return { remove: subscribe("tap", listener) }; },
    async getLastNotificationResponseAsync() { return state.last; },
    async clearLastNotificationResponseAsync() { calls.clear++; state.last = null; },
    async cancelScheduledNotificationAsync() { calls.nativeCancel++; throw Error("Unexpected native cancellation"); },
  };
  const modules = { react, "react-native": { Platform: { OS: platform },
      AppState: { addEventListener(event, listener) { assert.equal(event, "change"); return { remove: subscribe("app", listener) }; } } },
    "expo-notifications": notifications, "@/contexts/GoNotificationContext": { useGoNotification: () => ({ alertMode: state.alertMode }) },
    "@/hooks/useAssistantZoneScope": { useAssistantZoneScope: () => state.identity },
    "@/lib/goLogStore": { subscribeGoLog: listener => subscribe("store", listener) },
    "@/lib/sessionEvents": { onSessionChanged: listener => subscribe("session", listener) },
    "@/lib/goTaskReminderRuntime": runtime };
  const context = { exports: {}, console: { warn: (...args) => calls.warnings.push(args) }, require(name) {
    if (name in modules) return modules[name]; throw Error("Unexpected import: " + name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync("services/GoTaskReminderService.tsx", "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText, context);
  function render(identity = state.identity, mode = state.alertMode) {
    state.identity = identity; state.alertMode = mode; refIndex = 0; effectIndex = 0;
    assert.equal(context.exports.GoTaskReminderInitializer(), null); while (commits.length) commits.shift()();
  }
  function emit(kind, value) { for (const listener of [...subscriptions[kind]]) listener(value); }
  async function complete(index = calls.setup.length - 1, result = []) {
    assert.ok(calls.setup[index], "setup exists"); calls.setup[index].gate.resolve(result); await tick();
  }
  function cleanup() { for (const effect of effects) effect?.cleanup?.(); }
  render(); return { calls, state, subscriptions, render, emit, complete, cleanup };
}
test("cold-start tap remains pending during activation and opens exactly once after setup", async () => {
  const f = fixture({ last: response() }); await tick(); assert.equal(f.calls.open.length, 0);
  await f.complete(); assert.equal(f.calls.open.length, 1); assert.equal(f.calls.open[0].taskId, "buy");
  assert.equal(f.calls.clear, 1); f.emit("app", "active"); await tick(); assert.equal(f.calls.open.length, 1);
});
test("initial identity loading retains the tap until the authenticated scope becomes ready", async () => {
  const f = fixture({ ready: false, scope: null, last: response() }); await tick(); await f.complete(0);
  assert.equal(f.calls.open.length, 0); f.render({ ready: true, scope: A });
  assert.equal(f.calls.open.length, 0); await f.complete(1); assert.equal(f.calls.open.length, 1);
});
test("other users or DEMO/company contexts never open a private task", async () => {
  for (const foreign of [B, { ...A, context: "demo:USER" }, { ...A, context: "demo:BUSINESS:company" }]) {
    const f = fixture({ last: response(foreign) }); await tick(); await f.complete();
    assert.equal(f.calls.open.length, 0); assert.equal(f.calls.clear, 1);
  }
});
test("changing context during activation prevents the old completion from opening a previous task", async () => {
  const f = fixture({ last: response() }); await tick();
  const demo = { ...A, context: "demo:USER" }; f.render({ ready: true, scope: demo });
  await f.complete(0); assert.equal(f.calls.open.length, 0);
  await f.complete(1); assert.equal(f.calls.open.length, 0); assert.equal(f.calls.clear, 1);
});
test("a new-context tap arriving during activation waits for the corresponding activation", async () => {
  const f = fixture(); const demo = { ...A, context: "demo:BUSINESS:company" };
  f.render({ ready: true, scope: demo }); f.emit("tap", response(demo)); await tick();
  await f.complete(0); assert.equal(f.calls.open.length, 0);
  await f.complete(1); assert.equal(f.calls.open.length, 1); assert.equal(f.calls.open[0].context, demo.context);
});
test("same-identity rendering does not reconfigure or register duplicate listeners", async () => {
  const f = fixture(); await f.complete(); f.render({ ready: true, scope: { ...A } });
  assert.equal(f.calls.setup.length, 1);
  for (const values of Object.values(f.subscriptions)) assert.equal(values.size, 1);
});
test("manual shared-store changes refresh the active scope and use the new scope after switching", async () => {
  const f = fixture(); await f.complete(); f.emit("store"); await tick();
  assert.deepEqual(f.calls.refresh, [A]); f.render({ ready: true, scope: B }); await f.complete();
  f.emit("store"); await tick(); assert.deepEqual(f.calls.refresh, [A, B]);
});
test("returning to foreground refreshes alerts, while background and inactive do not", async () => {
  const f = fixture(); await f.complete(); f.emit("app", "background"); f.emit("app", "inactive"); await tick();
  assert.equal(f.calls.refresh.length, 0); f.emit("app", "active"); await tick();
  assert.deepEqual(f.calls.refresh, [A]);
});
test("session events suspend synchronously, invalidate pending activation and clear a queued tap", async () => {
  const f = fixture({ last: response() }); await tick(); f.emit("session");
  assert.equal(f.calls.suspend, 1); assert.equal(f.state.active, null);
  await f.complete(0); assert.equal(f.calls.open.length, 0);
  f.emit("app", "active"); f.emit("store"); await tick(); assert.equal(f.calls.refresh.length, 0);
  f.render({ ready: true, scope: B }); await f.complete(1); assert.equal(f.calls.open.length, 0);
});
test("runtime-inactive scopes cannot open a tap until activation restores a matching scope", async () => {
  const f = fixture(); await f.complete(); f.state.active = B;
  f.emit("tap", response()); await tick(); assert.equal(f.calls.open.length, 0);
  f.state.active = A; f.emit("app", "active"); await tick(); assert.equal(f.calls.open.length, 1);
});
test("consumed response replay never opens the same task again; unrelated notifications are ignored", async () => {
  const f = fixture(); await f.complete(); const tap = response();
  f.emit("tap", tap); await tick(); f.emit("tap", tap); await tick();
  const unrelated = response(); unrelated.notification.request.content.data = { kind: "pedido" };
  f.emit("tap", unrelated); await tick(); assert.equal(f.calls.open.length, 1); assert.equal(f.calls.clear, 1);
});
test("normal component cleanup removes all JS listeners and never cancels OS reminders", async () => {
  const f = fixture(); await f.complete(); f.cleanup();
  for (const values of Object.values(f.subscriptions)) assert.equal(values.size, 0);
  assert.deepEqual(f.calls.removed.sort(), ["app", "session", "store", "tap"]);
  assert.equal(f.calls.suspend, 0); assert.equal(f.calls.nativeCancel, 0);
});
test("web omits all native lifecycle listeners and notification responses", async () => {
  const f = fixture({ platform: "web", last: response() }); await tick(); await f.complete();
  for (const values of Object.values(f.subscriptions)) assert.equal(values.size, 0);
  assert.equal(f.calls.open.length, 0); assert.equal(f.calls.clear, 0);
});

test("duplicate tap and cold-start callbacks while opening is pending focus a task only once",async()=>{
 const f=fixture();await f.complete();f.state.openGate=deferred();
 f.emit("tap",response());await tick();f.emit("tap",response());await tick();assert.equal(f.calls.open.length,1);
 f.state.openGate.resolve();await tick();await tick();assert.equal(f.calls.open.length,1);assert.equal(f.calls.clear,1);
 f.emit("app","active");await tick();assert.equal(f.calls.open.length,1);
});
