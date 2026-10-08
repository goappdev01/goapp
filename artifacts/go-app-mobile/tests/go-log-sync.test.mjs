import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, modules) {
  const scope = { exports: {}, console: { log() {}, warn() {} }, Date, Map, Set,
    require(name) {
      if (name in modules) return modules[name];
      throw new Error("Unexpected import: " + name);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports;
}
const entry = (id, extras = {}) => ({
  id, kind: "sent", intentKey: "nota_interna", intentLabel: "Tarea interna",
  color: "#7c3aed", place: "", date: "", dateISO: "", time: "", duration: "",
  contactName: "", phone: "", estado: "pendiente", type: "TAREA_INTERNA", notes: id, ...extras,
});
function fixture(initial = []) {
  let raw = typeof initial === "string" ? initial : JSON.stringify(initial);
  let fail = false;
  let pause;
  let writing;
  const writes = [];
  const storage = {
    async getItem(key) { assert.equal(key, "go_log_v1"); return raw; },
    async setItem(key, value) {
      assert.equal(key, "go_log_v1");
      if (pause) { writing?.(); await pause; pause = undefined; }
      if (fail) throw new Error("Storage unavailable");
      raw = value; writes.push(JSON.parse(value));
    },
  };
  const store = load("lib/goLogStore.ts", {
    "@react-native-async-storage/async-storage": { default: storage },
    "./goTaskAccess": { getTaskUser: async () => null, isPersonalTask: () => true },
  });
  const bridge = load("lib/goLogBridge.ts", {
    "./goLogStore": store, "@/data/booking": { getBookingSlotKey: () => "slot-test" },
  });
  let landing = [];
  const hook = load("hooks/useGoLog.ts", {
    "@/lib/goLogStore": store,
    react: {
      useEffect(effect) { effect(); },
      useSyncExternalStore(subscribe, get) {
        subscribe(() => { landing = plain(get()); });
        landing = plain(get());
        return get();
      },
    },
  });
  const [, setManual] = hook.useGoLog();
  return { store, bridge, setManual, writes, storage,
    get landing() { return landing; }, get saved() { return JSON.parse(raw); },
    get raw() { return raw; }, fail(value) { fail = value; },
    delayWrite() {
      let release, started;
      pause = new Promise(resolve => { release = resolve; });
      const entered = new Promise(resolve => { started = resolve; });
      writing = started;
      return { release, entered };
    },
  };
}
test("IA and a Landing timer serialize writes and publish only after storage succeeds", async () => {
  const existing = entry("manual", { dateISO: "2026-10-21", detail: "Conservar" });
  const f = fixture([existing]);
  await f.store.readGoLog();
  const gate = f.delayWrite();
  const saving = f.bridge.updatePersonalGoLog(entries => ({
    entries: [entry("ia", { dateISO: "2026-10-24", time: "11:00" }), ...entries], result: "ia",
  }));
  await gate.entered;
  assert.deepEqual(f.landing, [existing], "no premature saved state");
  f.setManual(prev => {
    void f.store.flushGoLog(); // same call pattern as persistLog inside Landing's updater
    return prev.map(e => e.id === "manual" ? { ...e, firedReminderMins: [15] } : e);
  });
  gate.release();
  assert.equal(await saving, "ia");
  await f.store.flushGoLog();
  assert.deepEqual(f.saved.map(e => e.id).sort(), ["ia", "manual"]);
  assert.deepEqual(f.landing, f.saved);
  assert.equal(f.saved.find(e => e.id === "manual").dateISO, "2026-10-21");
  assert.equal(f.saved.find(e => e.id === "manual").detail, "Conservar");
  assert.equal(f.saved.find(e => e.id === "ia").time, "11:00");
});
test("stale snapshots preserve newer IA dates, independent manual fields and new entries", async () => {
  const f = fixture([entry("same", { dateISO: "2026-10-12" })]);
  const old = await f.store.readGoLog();
  await f.bridge.updatePersonalGoLog(entries => ({
    entries: entries.map(e => ({ ...e, dateISO: "2026-10-16", time: "17:30" })), result: undefined,
  }));
  await f.store.commitGoLogSnapshot(old, [
    { ...old[0], notes: "Editado manualmente" }, entry("manual-new"),
  ]);
  const rows = f.saved;
  assert.equal(rows.length, 2);
  assert.equal(rows.find(e => e.id === "same").dateISO, "2026-10-16");
  assert.equal(rows.find(e => e.id === "same").time, "17:30");
  assert.equal(rows.find(e => e.id === "same").notes, "Editado manualmente");
  assert.deepEqual(f.landing, rows);
});
test("IA modification and a manual update retain one identity and both changes", async () => {
  const f = fixture([entry("same", { dateISO: "2026-10-12" })]);
  await f.store.readGoLog();
  f.setManual(rows => rows.map(e => ({ ...e, detail: "Detalle manual" })));
  await f.bridge.updatePersonalGoLog(entries => ({
    entries: entries.map(e => ({ ...e, dateISO: "2026-10-19" })), result: undefined,
  }));
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].dateISO, "2026-10-19");
  assert.equal(f.saved[0].detail, "Detalle manual");
});
test("storage errors do not publish failed changes, leak updater mutations or poison the queue", async () => {
  const original = entry("original");
  const f = fixture([original]);
  await f.store.readGoLog();
  f.fail(true);
  await assert.rejects(f.bridge.updatePersonalGoLog(entries => {
    entries[0].detail = "No guardar";
    entries.push(entry("failed"));
    return { entries, result: undefined };
  }), /Storage unavailable/);
  assert.deepEqual(f.saved, [original]);
  assert.deepEqual(f.landing, [original]);
  f.fail(false);
  f.setManual(entries => [...entries, entry("manual-after-error")]);
  await f.store.flushGoLog();
  assert.deepEqual(f.saved.map(e => e.id), ["original", "manual-after-error"]);
  assert.equal(f.saved[0].detail, undefined);
});
test("invalid stored data is never replaced by an empty record", async () => {
  for (const raw of ["invalid JSON", '{"not":"an array"}']) {
    const f = fixture(raw);
    await assert.rejects(f.bridge.updatePersonalGoLog(entries => ({ entries: [entry("new"), ...entries], result: undefined })));
    assert.equal(f.raw, raw);
    assert.equal(f.writes.length, 0);
  }
});
test("readers cannot mutate the committed record and unchanged snapshots cause no writes", async () => {
  const f = fixture([entry("original", { recipients: [{ name: "Persona", phone: "", estado: "pending" }] })]);
  const read = await f.store.readGoLog();
  read[0].recipients[0].name = "Changed without saving";
  assert.equal(f.landing[0].recipients[0].name, "Persona");
  const unchanged = await f.store.readGoLog();
  await f.store.commitGoLogSnapshot(unchanged, plain(unchanged));
  assert.equal(f.writes.length, 0);
});
test("reopening retains canonical dates and explicitly undated actions", async () => {
  const f = fixture([entry("undated"), entry("dated", { dateISO: "2026-10-24", time: "11:00", place: "Murcia" })]);
  await f.bridge.updatePersonalGoLog(entries => ({ entries: [...entries, entry("ai-undated")], result: undefined }));
  const reopened = fixture(f.saved);
  const rows = await reopened.store.readGoLog();
  assert.equal(rows.find(e => e.id === "undated").dateISO, "");
  assert.equal(rows.find(e => e.id === "ai-undated").dateISO, "");
  assert.equal(rows.find(e => e.id === "dated").dateISO, "2026-10-24");
  assert.equal(rows.find(e => e.id === "dated").time, "11:00");
});
test("Landing hydration preserves empty dateISO and writes only through the shared record", () => {
  const source = readFileSync("app/index.tsx", "utf8");
  const home = ts.createSourceFile("index.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let dateExpression;
  function walk(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(home) === "dateISO"
        && node.initializer?.getText(home).includes("legacy.dateISO")) dateExpression = node.initializer.getText(home);
    ts.forEachChild(node, walk);
  }
  walk(home);
  assert.ok(dateExpression);
  for (const dateISO of ["", "2026-10-24"]) {
    assert.equal(vm.runInNewContext(dateExpression, { legacy: { dateISO }, formatISODate() { throw new Error("Date invented"); } }), dateISO);
  }
  assert.match(source, /\[goLog, setGoLog\] = useGoLog\(\)/);
  assert.doesNotMatch(source, /AsyncStorage\.setItem\("go_log_v1"/);
  assert.doesNotMatch(source, /AsyncStorage\.getItem\("go_log_v1"/);
});
test("booking projections share the queue and upsert without duplicating or dropping personal actions", async () => {
  const f = fixture([entry("personal", { dateISO: "" })]);
  const booking = {
    id: "confirmed", startDatetime: "2026-10-24T11:00:00", endDatetime: "2026-10-24T11:30:00",
    businessId: "business", bookableItemId: "service", staffId: "staff", status: "CONFIRMED",
  };
  const business = { id: "business", name: "Negocio", location: "Cieza" };
  const service = { title: "Corte" };
  await Promise.all([
    f.bridge.syncBookingToGoLog(booking, business, service),
    f.bridge.updatePersonalGoLog(entries => ({ entries: [...entries, entry("ai")], result: undefined })),
  ]);
  await f.bridge.syncBookingToGoLog(booking, business, service);
  assert.equal(f.saved.length, 3);
  assert.equal(f.saved.filter(e => e.reservationId === booking.id).length, 1);
  assert.equal(f.saved.find(e => e.id === "personal").dateISO, "");
  assert.deepEqual(f.landing, f.saved);
});
test("stale snapshots never resurrect removed entries or remove concurrent additions", async () => {
  const f = fixture([entry("removed"), entry("kept")]);
  const old = await f.store.readGoLog();
  await f.bridge.updatePersonalGoLog(entries => ({ entries: [...entries.filter(e => e.id !== "removed"), entry("new")], result: undefined }));
  await f.store.commitGoLogSnapshot(old, old.map(e => ({ ...e, notes: "Stale edit" })));
  assert.deepEqual(f.saved.map(e => e.id).sort(), ["kept", "new"]);
});

test("cancelling a real booking updates the shared calendar without dropping personal dates", async () => {
  const f = fixture([entry("personal", { dateISO: "2026-10-24" }),
    entry("projection", { type: "GO_RESERVA", reservationId: "booking-test" })]);
  let cancelled;
  const api = load("lib/bookingAssistant.ts", {
    "react-native": { Platform: { OS: "web" } },
    "@workspace/api-zod": {},
    "@/data/booking": { cancelBooking: async id => { cancelled = id; } },
    "./goLogBridge": f.bridge,
    "@/data/goSearchAliases": {},
    "@react-native-async-storage/async-storage": { default: f.storage },
  });
  await api.cancelAssistantBooking({ id: "booking-test" });
  assert.equal(cancelled, "booking-test");
  assert.equal(f.saved.find(e => e.id === "projection").deleted, true);
  assert.equal(f.saved.find(e => e.id === "personal").dateISO, "2026-10-24");
  assert.deepEqual(f.landing, f.saved);
});

function callbackFrom(file, predicate) {
  const source = readFileSync(file, "utf8");
  const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let found;
  function walk(node) {
    if (!found && predicate(node, ast)) found = node;
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.ok(found);
  return { text: found.arguments[0].getText(ast), source };
}
function runCallback(text, globals) {
  const scope = { exports: {}, ...globals };
  vm.runInNewContext(ts.transpileModule("exports.callback = " + text, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports.callback;
}
test("business-calendar edits and deletes keep hidden booking mirrors and IA actions", async () => {
  const f = fixture([
    entry("client", { type: "GO_BOOKING", kind: "received", reservationId: "reservation" }),
    entry("provider", { type: "GO_BOOKING", reservationId: "reservation" }),
    entry("ia", { dateISO: "2026-10-24" }),
  ]);
  await f.store.readGoLog();
  const file = "components/booking/GoReservasConfigScreen.tsx";
  const callback = name => callbackFrom(file, node => ts.isCallExpression(node)
    && ts.isVariableDeclaration(node.parent) && node.parent.name.getText() === name).text;
  const change = runCallback(callback("handleChangeEstado"), { setGoLog: f.setManual });
  const remove = runCallback(callback("handleDeleteItem"), { setGoLog: f.setManual });
  await change("provider", "aceptado");
  await f.store.flushGoLog();
  assert.equal(f.saved.find(e => e.id === "client").estado, "pendiente");
  assert.equal(f.saved.find(e => e.id === "provider").estado, "aceptado");
  await remove("provider");
  await f.store.flushGoLog();
  assert.deepEqual(f.saved.map(e => e.id).sort(), ["client", "ia"]);
  assert.equal(f.saved.find(e => e.id === "ia").dateISO, "2026-10-24");
  assert.doesNotMatch(readFileSync(file, "utf8"), /AsyncStorage\.setItem\("go_log_v1"/);
});
test("supplier booking projection uses the latest shared record and its existing slot dedupe", async () => {
  const projection = entry("new-projection", { type: "GO_BOOKING", businessId: "b", staffId: "s",
    dateISO: "2026-10-24", time: "11:00", endTime: "11:30" });
  const f = fixture([entry("ia", { dateISO: "" }), { ...projection, id: "old-projection" }]);
  const { text, source } = callbackFrom("components/booking/GoProveedorReservaSheet.tsx",
    node => ts.isCallExpression(node) && node.expression.getText() === "updateGoLog");
  const project = runCallback(text, { entry: projection, _entryFp: "b|s|2026-10-24|11:00|11:30", console: { log() {} } });
  await f.store.updateGoLog(project);
  assert.deepEqual(f.saved.map(e => e.id).sort(), ["ia", "new-projection"]);
  assert.equal(f.saved.find(e => e.id === "ia").dateISO, "");
  assert.doesNotMatch(source, /AsyncStorage\.setItem\("go_log_v1"/);
});
