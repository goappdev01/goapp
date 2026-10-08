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
const managementModel = load("../../lib/api-zod/src/task-management.ts", {
  "./booking-assistant": booking, "./task-creation": clocks,
});
const model = { ...booking, ...clocks, ...actions, ...managementModel };
const agenda = ts.createSourceFile("Agenda.tsx", readFileSync("components/AgendaOperativa.tsx", "utf8"),
  ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const dayFilter = agenda.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === "isInDay");
const calendar = {};
vm.runInNewContext(ts.transpileModule(dayFilter.getText(agenda), {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText, calendar);
function fixture(initial = [], userId = null) {
  let raw = JSON.stringify(initial), fail = false, writes = 0;
  const storage = {
    async getItem(key) { assert.equal(key, "go_log_v1"); return raw; },
    async setItem(key, value) {
      assert.equal(key, "go_log_v1");
      if (fail) throw new Error("Storage unavailable");
      raw = value; writes++;
    },
  };
  const access = load("lib/goTaskAccess.ts", {
    "@/data/booking": { async getAuthenticatedUserId() { return userId; } },
  });
  function newStore() {
    return load("lib/goLogStore.ts", { "@react-native-async-storage/async-storage": { default: storage }, "./goTaskAccess": access });
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
    "./goTaskAccess": access,
    "./time": load("lib/time.ts"),
  });
  const management = load("lib/goTaskManagement.ts", {
    "@workspace/api-zod": model, "./goLogBridge": bridge, "./goTaskAccess": access,
    "./bookingAssistant": { localToday: () => "2026-10-08" }, "./time": load("lib/time.ts"),
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
      check() {}, reset() { messages.splice(0); }, changeField() {}, async showBookings() {},
      async send(text) { bookingRequests.push(text); },
      async work(label, op) {
        if (a.lock.current) return;
        a.lock.current = true; notice = "";
        try { await op(0); } catch (e) { notice = e.message; }
        finally { a.lock.current = false; }
      },
    };
    const managerHook = load("hooks/useTaskManagement.ts", {
      react, "@workspace/api-zod": model, "@/lib/bookingAssistant": { localToday: () => "2026-10-08" },
      "@/lib/goTaskAccess": access, "@/lib/goTaskManagement": management,
    });
    const hook = load("hooks/useGoActions.ts", {
      "./useTaskManagement": managerHook,
      react, "@workspace/api-zod": model, "@/lib/bookingAssistant": { localToday: () => "2026-10-08" },
      "@/lib/goPersonalActions": personal,
    });
    return { render() { si = 0; ri = 0; return hook.useGoActions(a); }, messages, bookingRequests,
      get notice() { return notice; } };
  }
  const s = screen();
  return { store, personal, management, user(value) { userId = value; }, screen, ...s, get notice() { return s.notice; }, get saved() { return JSON.parse(raw); },
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

const owned = (id, title, extra = {}) => ({
  id, ownerUserId: "A", kind: "sent", type: "TAREA_INTERNA", intentKey: "nota_interna",
  intentLabel: "Tarea interna", color: "#7c3aed", notes: title, detail: "", place: "",
  dateISO: "", date: "", time: "", duration: "", estado: "pendiente", contactName: "", phone: "", ...extra,
});
const command = text => model.parseTaskCommand(text, "2026-10-08");
test("tomorrow query respects owner, date, time, state and excludes unverifiable legacy records", async () => {
  const f = fixture([
    owned("a", "Llamar", { dateISO: "2026-10-09", time: "10:00" }),
    owned("b", "Secreto B", { ownerUserId: "B", dateISO: "2026-10-09" }),
    owned("legacy", "Antigua", { ownerUserId: undefined, dateISO: "2026-10-09" }),
    owned("done", "Eliminada", { dateISO: "2026-10-09", deleted: true }),
    owned("undated", "Sin fecha"),
  ], "A");
  await f.render().dispatch("¿Qué tengo mañana?", false);
  const answer = f.messages.at(-1).text;
  assert.match(answer, /Llamar.*09\/10\/2026.*10:00.*pendiente/);
  assert.doesNotMatch(answer, /Secreto|Antigua|Eliminada|Sin fecha/);
  assert.equal(f.writes, 0);
});
test("pending and current-week queries retain optional schedules and real completion state", async () => {
  const f = fixture([
    owned("pending", "Pendiente"),
    owned("accepted", "Terminada", { estado: "aceptado", dateISO: "2026-10-09" }),
    owned("monday", "Lunes", { dateISO: "2026-10-05" }),
    owned("sunday", "Domingo", { dateISO: "2026-10-11" }),
    owned("next", "Siguiente", { dateISO: "2026-10-12" }),
  ], "A");
  const pending = await f.management.selectTasks(command("¿Qué tareas tengo pendientes?"));
  assert.ok(pending.entries.some(e => e.id === "pending"));
  assert.ok(!pending.entries.some(e => e.id === "accepted"));
  const week = await f.management.selectTasks(command("¿Qué tengo esta semana?"));
  assert.deepEqual(plain(week.entries.map(e => e.id)), ["monday", "accepted", "sunday"]);
});
test("Thursday selects the existing meeting; unqualified five requires a reviewed time", async () => {
  const f = fixture([owned("meeting", "Reunión William", { dateISO: "2026-10-08", time: "10:00" })], "A");
  await f.render().dispatch("Cambia la reunión del jueves a las cinco", false);
  const state = f.render().manager.state;
  assert.equal(state.selected.id, "meeting");
  assert.deepEqual(plain(state.command.times), ["05:00", "17:00"]);
  assert.equal(f.writes, 0);
  await f.render().dispatch("a las cinco de la tarde", false);
  assert.equal(f.writes, 0);
  await f.render().dispatch("confirmo", false);
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].id, "meeting");
  assert.equal(f.saved[0].dateISO, "2026-10-08"); assert.equal(f.saved[0].time, "17:00");
  assert.match(f.messages.at(-1).text, /Tarea actualizada/);
});
test("moving tomorrow purchase to Friday preserves identity and an absent hour", async () => {
  const original = owned("purchase", "Compra", { dateISO: "2026-10-09", detail: "No perder" });
  const f = fixture([original], "A");
  await f.render().dispatch("Pasa la compra de mañana al viernes", false);
  assert.equal(f.render().manager.state.selected.id, "purchase"); assert.equal(f.writes, 0);
  await f.render().manager.confirm();
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].time, "");
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].detail, "No perder");
  assert.deepEqual(plain(await f.reopenStore().readGoLog()), f.saved);
});
test("multiple matching tasks require a selection and cannot be changed by a bare yes", async () => {
  const f = fixture([
    owned("one", "Dentista", { dateISO: "2026-10-09", time: "09:00" }),
    owned("two", "Dentista", { dateISO: "2026-10-10", time: "11:00" }),
  ], "A");
  await f.render().dispatch("Elimina la tarea del dentista", false);
  assert.equal(f.render().manager.state.selected, null);
  await f.render().dispatch("sí", false);
  assert.equal(f.writes, 0);
  await f.render().dispatch("2", false);
  assert.equal(f.render().manager.state.selected.id, "two"); assert.equal(f.writes, 0);
  await f.render().dispatch("confirmo", false);
  assert.equal(f.saved[0].deleted, undefined); assert.equal(f.saved[1].deleted, true);
  assert.equal(f.saved[1].estado, "rechazado");
  assert.equal(calendar.isInDay(f.saved[1], "2026-10-10"), false);
  assert.deepEqual(plain(await f.reopenStore().readGoLog()), f.saved);
});
test("deletion cancellation and non-explicit consent leave the task untouched", async () => {
  const f = fixture([owned("dentist", "Dentista")], "A");
  await f.render().dispatch("Elimina la tarea del dentista", false);
  await f.render().dispatch("no", false);
  assert.equal(f.writes, 0); assert.equal(f.render().manager.state, null);
  await f.render().dispatch("Elimina la tarea del dentista", false);
  await f.render().dispatch("sí, pero todavía no", false);
  assert.equal(f.writes, 0);
});
test("account switch invalidates a pending deletion and clears previous private conversation", async () => {
  const f = fixture([owned("a", "Secreto de A"), owned("b", "Secreto de B", { ownerUserId: "B" })], "A");
  await f.render().dispatch("Elimina la tarea Secreto de A", false);
  assert.ok(f.render().manager.state.selected);
  f.user("B");
  await f.render().manager.confirm();
  assert.equal(f.writes, 0); assert.equal(f.render().manager.state, null);
  assert.ok(!f.messages.some(m => m.text.includes("Secreto de A")));
  await f.render().dispatch("¿Qué tareas tengo pendientes?", false);
  assert.match(f.messages.at(-1).text, /Secreto de B/); assert.doesNotMatch(f.messages.at(-1).text, /Secreto de A/);
});
test("shared creation assigns account ownership and deduplication never crosses accounts", async () => {
  const f = fixture([], "A");
  const text = "recuérdame llamar mañana a las 17:30";
  await f.render().dispatch(text, false);
  assert.equal(f.saved[0].ownerUserId, "A");
  f.user("B");
  await f.screen().render().dispatch(text, false);
  assert.equal(f.saved.length, 2); assert.equal(f.saved[0].ownerUserId, "B");
  assert.notEqual(f.saved[0].id, f.saved[1].id);
});
test("new manual tasks through the same queue are accessible; legacy records are never adopted", async () => {
  const legacy = owned("legacy", "Legado", { ownerUserId: undefined });
  const f = fixture([legacy], "A");
  await f.store.updateGoLog(entries => ({
    entries: [owned("manual", "Manual", { ownerUserId: undefined }), ...entries], result: null,
  }));
  const rows = (await f.management.selectTasks(command("¿Qué tareas tengo pendientes?"))).entries;
  assert.deepEqual(plain(rows.map(e => e.id)), ["manual"]);
  assert.equal(f.saved.find(e => e.id === "legacy").ownerUserId, undefined);
});
test("stale confirmation cannot overwrite a concurrent manual edit", async () => {
  const f = fixture([owned("one", "Compra", { dateISO: "2026-10-09" })], "A");
  await f.render().dispatch("Pasa la compra de mañana al lunes", false);
  await f.store.updateGoLog(entries => ({
    entries: entries.map(e => ({ ...e, detail: "Nuevo detalle manual" })), result: null,
  }));
  await f.render().manager.confirm();
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].detail, "Nuevo detalle manual");
  assert.match(f.notice, /ha cambiado/);
});
test("service rejects absent consent, foreign identities and duplicate IDs", async () => {
  const f = fixture([owned("one", "Dentista")], "A");
  const selected = await f.management.selectTasks(command("Elimina la tarea dentista"));
  await assert.rejects(f.management.changeTask(selected, selected.entries[0]), /confirma/);
  f.user("B");
  await assert.rejects(f.management.changeTask(selected, selected.entries[0], undefined, true), /cuenta ha cambiado/);
  assert.equal(f.writes, 0);
  const g = fixture([owned("same", "Dentista"), owned("same", "Dentista")], "A");
  const duplicate = await g.management.selectTasks(command("Elimina la tarea dentista"));
  await assert.rejects(g.management.changeTask(duplicate, duplicate.entries[0], undefined, true), /no está disponible/);
  assert.equal(g.writes, 0);
});
test("unauthenticated management is denied without modifying existing local creation", async () => {
  const f = fixture([owned("one", "Privada")]);
  await f.render().dispatch("¿Qué tengo mañana?", false);
  assert.match(f.notice, /Inicia sesión/); assert.equal(f.writes, 0);
  await f.render().dispatch("recuérdame comprar pan", false);
  assert.equal(f.saved.length, 2); assert.equal(f.saved[0].ownerUserId, undefined);
});
test("failed deletion persists nothing and can be explicitly retried", async () => {
  const f = fixture([owned("dentist", "Dentista")], "A");
  await f.render().dispatch("Elimina la tarea dentista", false);
  f.fail(true); await f.render().manager.confirm();
  assert.equal(f.saved[0].deleted, undefined); assert.ok(f.render().manager.state);
  assert.match(f.notice, /Storage unavailable/);
  f.fail(false); await f.render().manager.confirm();
  assert.equal(f.saved[0].deleted, true);
});
test("date or hour clarification only changes the selected task after confirmation", async () => {
  const f = fixture([owned("one", "Compra")], "A");
  await f.render().dispatch("Cambia la compra", false);
  assert.match(f.messages.at(-1).text, /fecha u hora/);
  await f.render().dispatch("el viernes", false);
  assert.equal(f.writes, 0);
  await f.render().dispatch("confirmo", false);
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].time, "");
});
test("notes and lists remain disabled even with an authenticated owner", async () => {
  const f = fixture([owned("one", "Compra")], "A");
  for (const text of ["crea una nota Ideas", "crea una lista de compra con pan", "elimina la nota Ideas", "muestra mis listas"])
    await f.render().dispatch(text, false);
  assert.equal(f.writes, 0);
});

test("invalid requested selector dates cannot turn into an unfiltered query or deletion", async () => {
  const f = fixture([owned("one", "Dentista", { dateISO: "2026-10-09" })], "A");
  await f.render().dispatch("¿Qué tengo el 31/02/2027?", false);
  assert.match(f.notice, /fecha válida/);
  assert.ok(!f.messages.some(m => m.role === "assistant" && m.text.includes("Dentista")));
  await f.render().dispatch("Elimina la tarea dentista del 31/02/2027", false);
  assert.equal(f.render().manager.state, null); assert.equal(f.writes, 0);
});
test("clarifying the date never drops a previously ambiguous requested hour", async () => {
  const f = fixture([owned("one", "Reunión", { dateISO: "2026-10-08", time: "10:00" })], "A");
  await f.render().dispatch("Cambia la reunión del jueves a las cinco", false);
  await f.render().dispatch("el viernes", false);
  const manager = f.render().manager;
  assert.deepEqual(plain(manager.state.command.times), ["05:00", "17:00"]);
  await manager.confirm();
  assert.equal(f.writes, 0);
  await f.render().manager.confirm("17:00");
  assert.equal(f.saved[0].dateISO, "2026-10-09"); assert.equal(f.saved[0].time, "17:00");
});
test("repeated delete confirmation cannot delete a different or newly added task", async () => {
  const f = fixture([owned("one", "Dentista"), owned("two", "Compra")], "A");
  await f.render().dispatch("Elimina la tarea dentista", false);
  const manager = f.render().manager;
  await Promise.all([manager.confirm(), manager.confirm()]);
  await f.render().dispatch("sí", false);
  assert.equal(f.writes, 1); assert.equal(f.saved[0].deleted, true); assert.equal(f.saved[1].deleted, undefined);
});
test("ownership is immutable and repairs of ambiguous legacy IDs do not adopt old tasks", async () => {
  const f = fixture([owned("one", "Propiedad A")], "B");
  await f.store.updateGoLog(entries => ({ entries: entries.map(e => ({ ...e, ownerUserId: "B", detail: "Cambio local" })), result: null }));
  assert.equal(f.saved[0].ownerUserId, "A");
  const g = fixture([owned("same", "Legado 1", { ownerUserId: undefined }), owned("same", "Legado 2", { ownerUserId: undefined })], "A");
  await g.store.updateGoLog(entries => ({ entries: entries.map((e, i) => ({ ...e, id: "fixed-" + i })), result: null }));
  assert.ok(g.saved.every(e => e.ownerUserId === undefined));
});
test("a queued management write checks the account again when it executes", async () => {
  const f = fixture([owned("one", "Dentista")], "A");
  const selected = await f.management.selectTasks(command("Elimina la tarea dentista"));
  let release, entered;
  const waiting = new Promise(resolve => { entered = resolve; });
  const barrier = new Promise(resolve => { release = resolve; });
  const before = f.store.updateGoLog(async entries => { entered(); await barrier; return { entries, result: null }; });
  await waiting;
  const deleting = f.management.changeTask(selected, selected.entries[0], undefined, true);
  await Promise.resolve();
  f.user("B"); release();
  await assert.rejects(before, /cuenta ha cambiado/);
  await assert.rejects(deleting, /cuenta ha cambiado/);
  assert.equal(f.writes, 0); assert.equal(f.saved[0].deleted, undefined);
});

test("task management does not intercept unrelated queries or reject explicit task titles containing reservas", async () => {
  assert.equal(command("consulta negocios de Murcia"), null);
  const f = fixture([owned("review", "Revisar reservas", { dateISO: "2026-10-09" })], "A");
  await f.render().dispatch("Pasa la tarea revisar reservas de mañana al lunes", false);
  assert.equal(f.render().manager.state.selected.id, "review");
  await f.render().manager.confirm();
  assert.equal(f.saved[0].dateISO, "2026-10-12");
});