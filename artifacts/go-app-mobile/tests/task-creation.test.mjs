import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const plain = v => JSON.parse(JSON.stringify(v));
class Today extends Date {
  constructor(...args) { super(...(args.length ? args : ["2026-10-08T09:00:00"])); }
  static now() { return new Today().getTime(); }
}
function load(file, modules = {}, extra = {}) {
  const scope = { exports: {}, Date: Today, Error, console, ...extra,
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
const booking = load("../../lib/api-zod/src/booking-assistant.ts", { zod: require("zod") });
const clocks = load("../../lib/api-zod/src/task-creation.ts", { "./booking-assistant": booking });
const actions = load("../../lib/api-zod/src/go-actions.ts", {
  zod: require("zod"), "./booking-assistant": booking, "./task-creation": clocks,
});
const model = { ...booking, ...clocks, ...actions };
const agenda = ts.createSourceFile("Agenda.tsx", readFileSync("components/AgendaOperativa.tsx", "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dayFilter = agenda.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "isInDay");
const calendar = {};
vm.runInNewContext(ts.transpileModule(dayFilter.getText(agenda), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, calendar);
function fixture(initial = []) {
  let raw = JSON.stringify(initial), fail = false, writes = 0;
  const storage = {
    async getItem(key) { assert.equal(key, "go_log_v1"); return raw; },
    async setItem(key, value) {
      assert.equal(key, "go_log_v1");
      if (fail) throw new Error("Storage unavailable");
      raw = value; writes++;
    },
  };
  function newStore() {
    return load("lib/goLogStore.ts", { "@react-native-async-storage/async-storage": { default: storage } });
  }
  const store = newStore();
  const bridge = load("lib/goLogBridge.ts", {
    "./goLogStore": store, "@/data/booking": { getBookingSlotKey() { return "unused"; } },
  });
  const personal = load("lib/goPersonalActions.ts", {
    "@workspace/api-zod": model,
    "@/data/booking": { async getAuthenticatedUserId() { return null; } },
    "./bookingAssistant": { localToday: () => "2026-10-08", assistantApi() { throw new Error("Unexpected network"); } },
    "./goLogBridge": bridge,
    "./time": load("lib/time.ts"),
  });
  function screen() {
    const state = [], refs = [];
    let si = 0, ri = 0, notice = "";
    const messages = [], bookingRequests = [];
    const react = {
      useState(initial) {
        const i = si++; if (!(i in state)) state[i] = initial;
        return [state[i], value => { state[i] = typeof value === "function" ? value(state[i]) : value; }];
      },
      useRef(initial) { const i = ri++; return refs[i] ||= { current: initial }; },
    };
    const a = {
      lock: { current: false }, request: model.emptyBookingRequest(), created: null,
      setPanel() {}, setBusy() {}, setNotice(value) { notice = value; },
      say(text, role = "assistant") { messages.push({ text, role }); },
      check() {}, changeField() {}, async showBookings() {},
      async send(text) { bookingRequests.push(text); },
      async work(label, op) {
        if (a.lock.current) return;
        a.lock.current = true; notice = "";
        try { await op(0); } catch (e) { notice = e.message; }
        finally { a.lock.current = false; }
      },
    };
    const hook = load("hooks/useGoActions.ts", {
      react, "@workspace/api-zod": model, "@/lib/bookingAssistant": { localToday: () => "2026-10-08" },
      "@/lib/goPersonalActions": personal,
    });
    return { render() { si = 0; ri = 0; return hook.useGoActions(a); }, messages, bookingRequests,
      get notice() { return notice; } };
  }
  const s = screen();
  return { store, personal, screen, ...s, get notice() { return s.notice; }, get saved() { return JSON.parse(raw); },
    get writes() { return writes; }, fail(value) { fail = value; }, reopenStore: newStore };
}
test("dated spoken task uses the manual task record and real calendar day filter", async () => {
  const f = fixture();
  await f.render().dispatch("GO, recuérdame llamar a Nelson mañana a las diez de la mañana", false);
  assert.equal(f.saved.length, 1);
  const task = f.saved[0];
  assert.equal(task.notes, "llamar a Nelson");
  assert.equal(task.dateISO, "2026-10-09"); assert.equal(task.time, "10:00");
  assert.equal(task.place, ""); assert.equal(task.type, "TAREA_INTERNA");
  assert.equal(calendar.isInDay(task, "2026-10-09"), true);
  assert.equal(calendar.isInDay(task, "2026-10-08"), false);
});
test("Friday task keeps its missing hour and persists after reopening", async () => {
  const f = fixture();
  await f.render().dispatch("GO, crea una tarea para el viernes: revisar las reservas", false);
  assert.equal(f.saved[0].notes, "revisar las reservas");
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].time, "");
  assert.equal(calendar.isInDay(f.saved[0], "2026-10-09"), true);
  assert.deepEqual(plain(await f.reopenStore().readGoLog()), f.saved);
});
test("unqualified spoken hour requires an explicit choice; repeated confirmations cannot duplicate", async () => {
  const f = fixture();
  await f.render().dispatch("GO, recuérdame llamar a Nelson mañana a las diez", false);
  assert.equal(f.saved.length, 0);
  assert.deepEqual(plain(f.render().review.times), ["10:00", "22:00"]);
  await f.render().dispatch("sí", false);
  assert.equal(f.saved.length, 0);
  const review = f.render();
  await Promise.all([review.confirmTask("10:00"), review.confirmTask("10:00")]);
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].time, "10:00");
  assert.equal(f.render().review, null);
});
test("meeting Monday four becomes a calendar activity after spoken clarification", async () => {
  const f = fixture();
  await f.render().dispatch("GO, apunta una reunión con William el lunes a las cuatro", false);
  assert.equal(f.saved.length, 0);
  assert.equal(f.render().review.action.date, "2026-10-12");
  await f.render().dispatch("a las cuatro de la tarde", false);
  assert.equal(f.saved.length, 1);
  assert.equal(f.saved[0].notes, "una reunión con William");
  assert.equal(f.saved[0].type, "GO_INTERNO"); assert.equal(f.saved[0].time, "16:00");
  assert.equal(calendar.isInDay(f.saved[0], "2026-10-12"), true);
});
test("untimed and undated tasks preserve other user records and have no artificial calendar date", async () => {
  const old = { id: "manual", dateISO: "", time: "", notes: "Conservar" };
  const f = fixture([old]);
  await f.render().dispatch("recuérdame comprar pan", false);
  assert.equal(f.saved.length, 2); assert.equal(f.saved[0].dateISO, ""); assert.equal(f.saved[0].time, "");
  assert.deepEqual(f.saved[1], old);
  assert.equal(calendar.isInDay(f.saved[0], "2026-10-08"), false);
});
test("only the missing title is asked and prior schedule is kept", async () => {
  const f = fixture();
  await f.render().dispatch("crea una tarea mañana a las 17:30", false);
  assert.equal(f.saved.length, 0);
  assert.equal(f.messages.at(-1).text, "¿Qué quieres apuntar?");
  await f.render().dispatch("llamar a Nelson", false);
  assert.equal(f.saved[0].notes, "llamar a Nelson");
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].time, "17:30");
});
test("invalid date and hour are not silently discarded or invented", async () => {
  const f = fixture();
  await f.render().dispatch("crea una tarea llamar a Nelson el 31/02/2027", false);
  assert.equal(f.saved.length, 0); assert.match(f.messages.at(-1).text, /fecha válida/);
  await f.render().dispatch("el viernes", false);
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].time, "");
  const g = fixture();
  await g.render().dispatch("recuérdame llamar mañana a las 25:00", false);
  assert.equal(g.saved.length, 0); assert.match(g.messages.at(-1).text, /hora válida/);
  await g.render().dispatch("sin hora", false);
  assert.equal(g.saved[0].time, ""); assert.equal(g.saved[0].dateISO, "2026-10-09");
});
test("missing title does not lose an unresolved ambiguous hour", async () => {
  const f = fixture();
  await f.render().dispatch("crea una tarea mañana a las diez", false);
  assert.equal(f.saved.length, 0);
  await f.render().dispatch("llamar a Nelson", false);
  assert.equal(f.saved.length, 0);
  assert.deepEqual(plain(f.render().review.times), ["10:00", "22:00"]);
});
test("resends across screen reopening reuse the original entry within five minutes", async () => {
  const f = fixture();
  const text = "crea una tarea revisar reservas el viernes a las 17:30";
  await f.render().dispatch(text, false);
  const original = f.saved[0];
  await f.screen().render().dispatch(text, false);
  assert.equal(f.saved.length, 1); assert.deepEqual(f.saved[0], original); assert.equal(f.writes, 1);
});
test("concurrent save calls deduplicate inside the shared persistence transaction", async () => {
  const f = fixture();
  const action = model.parseGoPlan("recuérdame llamar mañana a las 17:30", model.emptyGoContext(), "2026-10-08").actions[0];
  const results = await Promise.all([f.personal.savePersonalAction(action), f.personal.savePersonalAction(action)]);
  assert.equal(f.saved.length, 1); assert.equal(f.writes, 1);
  assert.equal(results[0].entry.id, results[1].entry.id); assert.equal(results[1].changed, false);
});
test("a failed save keeps the review available for retry and never acknowledges a saved task", async () => {
  const f = fixture();
  await f.render().dispatch("recuérdame llamar mañana a las diez", false);
  f.fail(true);
  await f.render().confirmTask("10:00");
  assert.equal(f.saved.length, 0); assert.ok(f.render().review);
  assert.equal(f.notice, "Storage unavailable");
  assert.ok(!f.messages.some(m => m.text.includes("Tarea guardada")));
  f.fail(false);
  await f.render().confirmTask("10:00");
  assert.equal(f.saved.length, 1); assert.equal(f.render().review, null);
});
test("CRUD, notes and lists stay inactive and cannot modify records", async () => {
  const f = fixture([{ id: "manual", notes: "Original", dateISO: "", time: "" }]);
  for (const text of ["borra la tarea Original", "cambia la tarea Original para mañana",
    "muestra mis tareas", "crea una nota Ideas", "crea una lista de compra con pan"]) {
    await f.render().dispatch(text, false);
  }
  assert.equal(f.writes, 0); assert.equal(f.saved[0].notes, "Original");
});
test("booking intent continues through the existing booking state machine", async () => {
  const f = fixture();
  await f.render().dispatch("GO, reserva una peluquería mañana", false);
  assert.equal(f.saved.length, 0); assert.equal(f.bookingRequests.length, 1);
});
test("period, quarter-hour and midnight interpretations preserve clock semantics", () => {
  for (const [text, time] of [
    ["a las cinco y media de la tarde", "17:30"], ["a las diez menos cuarto de la mañana", "09:45"],
    ["a las doce de la noche", "00:00"], ["a las 17:30", "17:30"], ["10:00", "10:00"],
  ]) assert.equal(model.taskClock(text).time, time, text);
  assert.deepEqual(plain(model.taskClock("a las diez menos cuarto").candidates), ["09:45", "21:45"]);
});
