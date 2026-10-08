import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import path from "node:path";
import { fixture as boardFixture } from "./helpers/calendar-fixture.mjs";
import { fixture as containerFixture, find, ast, declaration, transpile } from "./helpers/calendar-container-fixture.mjs";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, modules) {
  const scope = { exports: {}, Date, Error, Map, Set, JSON, console,
    require(name) { if (name in modules) return modules[name]; throw new Error("Unexpected import " + name); } };
  vm.runInNewContext(transpile(readFileSync(file, "utf8")), scope); return scope.exports;
}
const nodes = (tree, predicate) => !tree || typeof tree !== "object" ? [] :
  [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))];
const texts = tree => nodes(tree, node => node.type === "Text").flatMap(node => node.children).filter(value => typeof value === "string");
const entry = (id, ownerUserId, extra = {}) => ({
  id, ownerUserId, kind: "sent", type: "TAREA_INTERNA", intentKey: "nota_interna", intentLabel: "Tarea interna",
  color: "#7c3aed", dateISO: "2026-10-08", date: "HOY", time: "09:15", duration: "", place: "",
  contactName: "", phone: "", notes: "Revisar", detail: "Detalle guardado", estado: "pendiente", isGeneric: true, ...extra,
});

function flowFixture(initial = []) {
  const { scope, calls } = containerFixture();
  let user = "account-a", raw = JSON.stringify(initial), writes = 0, fail = false, serial = 0;
  const storage = {
    async getItem(key) { assert.equal(key, "go_log_v1"); return raw; },
    async setItem(key, value) { assert.equal(key, "go_log_v1"); if (fail) throw new Error("Storage unavailable"); raw = value; writes++; },
  };
  const access = load("lib/goTaskAccess.ts", { "@/data/booking": { getAuthenticatedUserId: async () => user } });
  const store = load("lib/goLogStore.ts", {
    "@react-native-async-storage/async-storage": { default: storage }, "./goTaskAccess": access,
  });
  Object.assign(scope, {
    Error, lang: "es", calendarSlotOpeningRef: { current: false }, calendarSlotRequestRef: { current: 0 },
    calendarSlotSavingRef: { current: false }, calendarSlotDraftRef: { current: null },
    fieldSelectorSaveBusyRef: { current: false }, pendingCalendarGoRef: { current: false },
    getTaskUser: access.getTaskUser, assertTaskUser: access.assertTaskUser, updateGoLog: store.updateGoLog,
    makeUid: () => "go_slot_" + (++serial), t: key => key, isUserMode: false,
    showToast: (...args) => calls.push(["toast", ...args]),
    setGoLog: () => { throw new Error("Slot tasks must use the existing authenticated queue"); },
    Haptics: { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: "medium" } },
    goChatOpen: false, __DEV__: false, getNow: () => new Date(),
    aiDraftBaseRef: { current: "" }, startIaListening() {},
    setTimeout: callback => { calls.push(["timer", callback]); return 1; },
  });
  for (const name of ["GoChatOpen", "AiDraft", "AiOpen", "AiListening", "Time", "Duration", "Date", "DateISO"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    scope["set" + name] = value => { scope[key] = value; calls.push(["set" + name, value]); };
  }
  for (const name of ["openCalendarSlotTask", "commitCalendarSelectorEntry", "createEntryFromSelector", "openAi", "completeCalendarGoOpen"]) {
    vm.runInContext(transpile("exports." + name + " = " + declaration(name)), scope);
    scope[name] = scope.exports[name];
  }
  const save = find(node => ts.isJsxAttribute(node) && node.name.getText(ast) === "onPress"
    && node.initializer?.expression?.getText(ast).includes("const slotTask ="));
  vm.runInContext(transpile("exports.saveForm = " + save.initializer.expression.getText(ast)), scope);
  const session = find(node => ts.isCallExpression(node) && node.expression.getText(ast) === "onSessionChanged");
  vm.runInContext(transpile("exports.sessionChanged = " + session.arguments[0].getText(ast)), scope);
  return { scope, calls, access, store, storage,
    user(value) { user = value; }, fail(value) { fail = value; },
    get saved() { return JSON.parse(raw); }, get writes() { return writes; }, get idsCreated() { return serial; },
  };
}

for (const [iso, time] of [["2026-10-08", "09:15"], ["2026-10-09", "23:45"]]) {
  test("empty slot " + iso + " " + time + " opens the existing form with exact values and restores context", async () => {
    const f = flowFixture(); const { scope } = f; const scroll = scope.scrollTarget;
    scope.place = "Landing location"; scope.date = "Otra fecha"; scope.dateISO = "2026-12-31"; scope.time = "18:00";
    await scope.openCalendarSlotTask(iso, time);
    assert.equal(scope.fieldSelectorOpen, true); assert.equal(scope.calOpen, true);
    assert.equal(scope.fsFilledValues.dateISO, iso); assert.equal(scope.fsFilledValues.time, time);
    assert.equal(scope.fsFilledValues.place, undefined, "A slot must not inherit another draft's location");
    assert.equal(f.writes, 0); assert.ok(!f.calls.some(call => call[0] === "setItem"));
    scope.closeFieldSelectorPanel();
    assert.equal(scope.calOpen, true); assert.equal(scope.fieldSelectorOpen, false);
    assert.equal(scope.dateISODraft, "2027-02-28"); assert.equal(scope.calBgViewMode, "mes_lineal");
    assert.equal(scope.calBgViewMonth, "2027-02"); assert.equal(scope.scrollTarget, scroll);
  });
}

test("save, reopen and repeated taps preserve one task, its owner, details and real time", async () => {
  const foreign = entry("foreign", "account-b");
  const f = flowFixture([foreign]); const { scope } = f;
  await Promise.all([scope.openCalendarSlotTask("2026-10-09", "00:15"), scope.openCalendarSlotTask("2026-10-09", "00:15")]);
  scope.fieldSelectorText = "Revisar piloto"; scope.fieldSelectorDetail = "Detalle exacto";
  await Promise.all([scope.exports.saveForm(), scope.exports.saveForm()]);
  await scope.exports.saveForm();
  assert.equal(f.saved.length, 2); assert.equal(f.writes, 1); assert.equal(f.idsCreated, 1);
  const task = f.saved.find(record => record.id !== "foreign");
  assert.equal(task.ownerUserId, "account-a"); assert.equal(task.dateISO, "2026-10-09"); assert.equal(task.time, "00:15");
  assert.equal(task.notes, "Revisar piloto"); assert.equal(task.detail, "Detalle exacto"); assert.equal(task.duration, "");
  assert.deepEqual(f.saved.find(record => record.id === "foreign"), foreign);
  const reopened = load("lib/goLogStore.ts", {
    "@react-native-async-storage/async-storage": { default: f.storage }, "./goTaskAccess": f.access,
  });
  assert.deepEqual(plain(await reopened.readGoLog()), f.saved);
  await scope.commitCalendarSelectorEntry(task, "account-a");
  assert.equal(f.writes, 1, "A repeated commit of the same id is idempotent");
});

test("failed persistence keeps the form and reuses the same id on an explicit retry", async () => {
  const f = flowFixture(); const { scope } = f;
  await scope.openCalendarSlotTask("2026-10-09", "10:30");
  scope.fieldSelectorText = "Conservar borrador"; scope.fieldSelectorDetail = "No perder";
  f.fail(true); await scope.exports.saveForm();
  assert.equal(f.saved.length, 0); assert.equal(scope.fieldSelectorOpen, true);
  assert.equal(scope.fieldSelectorText, "Conservar borrador"); assert.equal(scope.fieldSelectorSaveBusyRef.current, false);
  f.fail(false); await scope.exports.saveForm();
  assert.equal(f.saved.length, 1); assert.equal(f.idsCreated, 1); assert.equal(f.saved[0].id, "go_slot_1");
});

test("a different account cannot save the previous account's task or adopt its draft", async () => {
  const f = flowFixture(); const { scope } = f;
  await scope.openCalendarSlotTask("2026-10-09", "10:00"); scope.fieldSelectorText = "Privado";
  f.user("account-b"); await scope.exports.saveForm();
  assert.equal(f.writes, 0); assert.equal(f.saved.length, 0);
  scope.exports.sessionChanged();
  assert.equal(scope.fieldSelectorOpen, false); assert.equal(scope.fieldSelectorText, "");
  assert.equal(scope.calendarSlotDraftRef.current, null); assert.equal(scope.calOpen, true);
});
test("anonymous creation and a cancelled pending opening never create an unowned record", async () => {
  const f = flowFixture(); f.user(null);
  await f.scope.openCalendarSlotTask("2026-10-09", "10:00");
  assert.equal(f.scope.fieldSelectorOpen, false); assert.equal(f.writes, 0);
  f.user("account-a");
  const opening = f.scope.openCalendarSlotTask("2026-10-09", "10:00");
  f.scope.exports.sessionChanged(); await opening;
  assert.equal(f.scope.fieldSelectorOpen, false); assert.equal(f.writes, 0);
});

for (const viewMode of ["dia", "semana", "mes_lineal"]) {
  test("real " + viewMode + " board passes each empty column's date and 15-minute slot exactly", () => {
    const app = boardFixture(); const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
    const tree = app.render(AgendaBoard, {
      goLog: [], viewMode, selectedDateISO: "2026-10-08", calViewMonth: "2026-10", density: "15min",
      onCreateTaskAtTime() {},
    });
    const slots = nodes(tree, node => node.type?.name === "GoCalendarSlot");
    assert.ok(slots.length > 0);
    const dates = viewMode === "dia" ? ["2026-10-08"] : ["2026-10-08", "2026-10-09"];
    for (const date of dates) {
      const slot = slots.find(node => node.props.dateISO === date && node.props.timeHHMM === "09:15");
      assert.ok(slot, date + " " + viewMode);
    }
  });
}
test("existing card opens its real detail and has no empty-slot creation recognizer", () => {
  const app = boardFixture({ now: "2026-10-08T08:00:00" }); const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
  let creates = 0;
  const props = { goLog: [entry("existing", "account-a")], viewMode: "dia", selectedDateISO: "2026-10-08", density: "15min",
    onCreateTaskAtTime: () => creates++ };
  let tree = app.render(AgendaBoard, props);
  assert.ok(!nodes(tree, node => node.type?.name === "GoCalendarSlot").some(node => node.props.timeHHMM === "09:15"));
  assert.ok(!texts(tree).includes("Detalle guardado"));
  const card = nodes(tree, node => node.type === "TouchableOpacity" && node.props.onPress?.name === "tapThis")[0];
  assert.ok(card); card.props.onPress();
  tree = app.render(AgendaBoard, props);
  assert.ok(texts(tree).includes("Detalle guardado")); assert.equal(creates, 0);
});

test("short tap creates once; hold, horizontal swipe, vertical scroll and cancellation never dispatch", () => {
  let config;
  const chain = {
    enabled(value) { config.enabled = value; return this; },
    maxDuration(value) { config.duration = value; return this; },
    maxDistance(value) { config.distance = value; return this; },
    runOnJS() { return this; }, onEnd(callback) { config.end = callback; return this; },
  };
  const component = load("components/ui/GoCalendarSlot.tsx", {
    react: { default: { createElement: (type, props, ...children) => ({ type, props, children }) } },
    "react-native": { View: "View" },
    "react-native-gesture-handler": { Gesture: { Tap() { config = {}; return chain; } }, GestureDetector: "GestureDetector" },
    "@/contexts/LanguageContext": { useLanguage: () => ({ t: () => "Nueva tarea" }) },
  });
  const calls = [];
  const props = { dateISO: "2026-10-09", timeHHMM: "09:15", onPress: (...args) => calls.push(args), children: {} };
  component.GoCalendarSlot(props);
  assert.equal(config.duration, 250); assert.equal(config.distance, 8);
  for (const [duration, distance, nativeSuccess] of [[100, 0, true], [600, 0, false], [100, 30, false], [100, 40, false], [100, 0, false]])
    config.end({}, nativeSuccess && duration <= config.duration && distance <= config.distance);
  assert.deepEqual(calls, [["2026-10-09", "09:15"]]);
  component.GoCalendarSlot({ ...props, disabled: true }); config.end({}, true);
  assert.equal(calls.length, 1);
});

test("GO hands off the Calendar modal once and opens the integrated real assistant", () => {
  const f = flowFixture(); const { scope } = f;
  scope.openAi(); scope.openAi();
  assert.equal(scope.calOpen, false); assert.equal(scope.goChatOpen, false);
  scope.completeCalendarGoOpen(); scope.completeCalendarGoOpen();
  assert.equal(scope.goChatOpen, true);
  assert.equal(f.calls.filter(call => call[0] === "setGoChatOpen").length, 1);
  const modal = find(node => ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "Modal"
    && node.attributes.properties.some(attr => attr.name?.getText(ast) === "visible" && attr.initializer?.getText(ast) === "{calOpen}"));
  assert.ok(modal.attributes.properties.some(attr => attr.name?.getText(ast) === "onDismiss" && attr.initializer?.getText(ast) === "{completeCalendarGoOpen}"));
  const wrapper = readFileSync("components/GOChatScreen.tsx", "utf8");
  assert.match(wrapper, /GO_BOOKING_ASSISTANT_V1 = true/); assert.match(wrapper, /<BookingAssistantScreen/);
  const reservas = find(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "GoReservasConfigScreen");
  assert.ok(reservas.attributes.properties.some(attr => attr.name?.getText(ast) === "onOpenGo" && attr.initializer?.getText(ast) === "{openAi}"));
});

test("calendar ownership refresh hides foreign and unowned tasks, including late session responses", async () => {
  const realAccess = flowFixture().access;
  const requests = []; let changed, effect, state = null, started = false;
  const hook = load("hooks/useGoCalendarEntries.ts", {
    react: { useState: () => [state, value => { state = value; }], useEffect(callback) { if (!started) { started = true; effect = callback(); } } },
    "@/lib/goTaskAccess": { ...realAccess, getTaskUser: () => new Promise(resolve => requests.push(resolve)) },
    "@/lib/sessionEvents": { onSessionChanged(callback) { changed = callback; return () => {}; } },
  });
  const booking = entry("booking", undefined, { type: "GO_BOOKING", kind: "received" });
  const all = [entry("a", "account-a"), entry("b", "account-b"), entry("legacy", undefined), booking,
    entry("checklist-a", "account-a", { notes: "Lista compra", detail: "- Item" })];
  assert.deepEqual(plain(hook.useGoCalendarEntries(all)).map(record => record.id), ["booking"]);
  requests.shift()("account-a"); await Promise.resolve();
  assert.deepEqual(plain(hook.useGoCalendarEntries(all)).map(record => record.id), ["a", "booking", "checklist-a"]);
  changed(); const late = requests.shift(); changed(); const latest = requests.shift();
  assert.deepEqual(plain(hook.useGoCalendarEntries(all)).map(record => record.id), ["booking"]);
  latest("account-b"); await Promise.resolve(); late("account-a"); await Promise.resolve();
  assert.deepEqual(plain(hook.useGoCalendarEntries(all)).map(record => record.id), ["b", "booking"]);
  changed(); requests.shift()(null); await Promise.resolve();
  assert.deepEqual(plain(hook.useGoCalendarEntries(all)).map(record => record.id), ["booking"]);
  effect();
});


test("slot notes with list-like text still persist their authenticated owner", async () => {
  const f = flowFixture(); const { scope } = f;
  await scope.openCalendarSlotTask("2026-10-09", "10:30");
  scope.fieldSelectorText = "Lista compra"; scope.fieldSelectorDetail = "- Leche\n- Pan";
  await scope.exports.saveForm();
  assert.equal(f.saved.length, 1); assert.equal(f.saved[0].ownerUserId, "account-a");
});
test("bulk actions ignore selected ids that are no longer in the authorized calendar", () => {
  const app = boardFixture({ now: "2026-10-08T08:00:00" });
  const { AgendaBoard } = app.load("components/AgendaOperativa.tsx");
  const deleted = [];
  const tree = app.render(AgendaBoard, {
    goLog: [entry("visible", "account-b")], viewMode: "dia", selectedDateISO: "2026-10-08",
    selection: { selectedIds: new Set(["previous-account", "visible"]), selectionMode: true,
      setSelectedIds() {}, setSelectionMode() {} },
    onDeleteItem: id => deleted.push(id),
  });
  const button = nodes(tree, node => node.type === "TouchableOpacity" && texts(node).includes("DELETE"))[0];
  assert.ok(button); button.props.onPress();
  assert.deepEqual(deleted, ["visible"]);
});

test("Reservas forwards slots and GO to the existing handlers with a cluster that fits its draggable bounds", () => {
  const app = boardFixture({ now: "2026-10-08T08:00:00" });
  const { GoReservasConfigScreen } = app.load("components/booking/GoReservasConfigScreen.tsx");
  let opens = 0;
  const onCreateTaskAtTime = () => {};
  const props = { onClose() {}, onOpenGo: () => opens++, onCreateTaskAtTime,
    dayNightMode: "oscuro", navigateToDayISO: "2026-10-09" };
  app.render(GoReservasConfigScreen, props);
  const tree = app.render(GoReservasConfigScreen, props);
  const go = nodes(tree, node => node.props.accessibilityLabel === "Abrir GO")[0];
  assert.ok(go); go.props.onPress(); assert.equal(opens, 1);
  assert.ok(nodes(tree, node => node.type?.name === "AgendaBoard")[0].props.onCreateTaskAtTime === onCreateTaskAtTime);
  const cluster = nodes(tree, node => node.type === "View" && node.children?.includes(go))[0];
  assert.notEqual(cluster.props.style.flexDirection, "row", "DraggableFAB clamps a single 40px column");
  const fab = nodes(tree, node => node.type === "DraggableFAB")[0];
  assert.ok(36 + 44 + 44 + cluster.props.style.gap * 2 <= fab.props.maxH);
  assert.ok(go.props.hitSlop * 2 < cluster.props.style.gap);
});
