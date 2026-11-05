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
const noteFixture = require("./tests/helpers/unified-note-fixture.cjs");
const plain = value => JSON.parse(JSON.stringify(value));
const functionSource = name => find(node => ts.isFunctionDeclaration(node) && node.name?.text === name).getText(ast);
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
  let user = "account-a", raw = JSON.stringify(initial), writes = 0, fail = false;
  const storage = {
    async getItem(key) { assert.equal(key, "go_log_v1"); return raw; },
    async setItem(key, value) { assert.equal(key, "go_log_v1"); if (fail) throw new Error("Storage unavailable"); raw = value; writes++; },
    async removeItem(key) { calls.push(["removeItem", key]); },
  };
  const access = load("lib/goTaskAccess.ts", { "@/data/booking": { getAuthenticatedUserId: async () => user } });
  const store = load("lib/goLogStore.ts", {
    "@react-native-async-storage/async-storage": { default: storage }, "./goTaskAccess": access,
  });
  Object.assign(scope, {
    Error, lang: "es", calendarSlotOpeningRef: { current: false }, calendarSlotRequestRef: { current: 0 },
    completionIdentity: { ready: true, scope: { userId: "account-a", context: "live:USER" } },
    noteIdentityRef: { current: { ready: true, scope: { userId: "account-a", context: "live:USER" } } },
    unifiedNoteOriginRef: { current: "landing" }, unifiedNoteInitial: null, unifiedNoteSeed: {},
    quickNoteReminderMinutes: null,
    calendarSlotSavingRef: { current: false }, calendarSlotDraftRef: { current: null },
    fieldSelectorSaveBusyRef: { current: false }, directLandingRef: { current: false }, pendingCalendarGoRef: { current: false }, pendingCalendarGoListenRef: { current: false }, goChatListenSequence: { current: 0 },
    getTaskUser: access.getTaskUser, assertTaskUser: access.assertTaskUser, updateGoLog: store.updateGoLog,
    t: key => key, isUserMode: false,
    showToast: (...args) => calls.push(["toast", ...args]),
    setGoLog: () => { throw new Error("Slot tasks must use the existing authenticated queue"); },
    Haptics: { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: "medium" } },
    goChatOpen: false, __DEV__: false, getNow: () => new Date(),
    aiDraftBaseRef: { current: "" }, startIaListening() {},
    setTimeout: callback => { calls.push(["timer", callback]); return 1; },
  });
  for (const name of ["GoChatOpen", "GoChatListenRequest", "AiDraft", "AiOpen", "AiListening", "Time", "Duration", "Date", "DateISO", "UnifiedNoteInitial", "UnifiedNoteSeed", "QuickNoteText", "QuickNoteDetail"]) {
    const key = name[0].toLowerCase() + name.slice(1);
    scope["set" + name] = value => { scope[key] = value; calls.push(["set" + name, value]); };
  }
  for (const name of ["openCalendarSlotTask", "openAi", "completeCalendarGoOpen"]) {
    vm.runInContext(transpile("exports." + name + " = " + declaration(name)), scope);
    scope[name] = scope.exports[name];
  }
  const model = load("lib/unifiedNotes.ts", {});
  const files = load("lib/goNoteFiles.ts", { "expo-file-system/legacy": {}, "./unifiedNotes": model });
  const progress = load("lib/goNoteSaveProgress.ts", {});
  const noteApi = load("lib/unifiedNoteStore.ts", {
    "@react-native-async-storage/async-storage": { default: storage }, "./goLogStore": store,
    "./goTaskAccess": access, "./goNoteFiles": files, "./unifiedNotes": model, "./goNoteSaveProgress": progress,
    "./goTaskReminderRuntime": { refreshNativeTaskReminders: async () => [] }, "./goTaskReminders": { describeReminders: () => "" },
  });
  scope.saveUnifiedNote = noteApi.saveUnifiedNote;
  scope.watchNoteReminderReceipt = () => {};
  scope.AsyncStorage.removeItem = storage.removeItem;
  scope.openFieldSelector = () => { throw new Error("An empty slot must open the shared note editor"); };
  for (const name of ["openUnifiedNoteComposer", "saveNoteDraft"]) {
    vm.runInContext(transpile(functionSource(name) + ";exports." + name + "=" + name), scope);
    scope[name] = scope.exports[name];
  }
  const session = find(node => ts.isCallExpression(node) && node.expression.getText(ast) === "onSessionChanged"
    && node.arguments[0]?.getText(ast).includes("calendarSlotRequestRef.current"));
  assert.ok(session, "Execute the existing calendar identity-change listener");
  vm.runInContext(transpile("exports.sessionChanged = " + session.arguments[0].getText(ast)), scope);
  return { scope, calls, access, store, storage,
    user(value) { user = value; }, fail(value) { fail = value; },
    get saved() { return JSON.parse(raw); }, get writes() { return writes; },
    editor: onSave => noteFixture.editorFixture({ scope: scope.noteIdentityRef.current.scope, seed: plain(scope.unifiedNoteSeed), onSave: onSave || scope.saveNoteDraft }),
  };
}

for (const [iso, time] of [["2026-10-08", "09:15"], ["2026-10-09", "23:45"]]) {
  test("empty slot " + iso + " " + time + " opens the shared editor with exact values and preserves its Calendar", async () => {
    const f = flowFixture(); const { scope } = f; const scroll = scope.scrollTarget;
    scope.place = "Landing location"; scope.date = "Otra fecha"; scope.dateISO = "2026-12-31"; scope.time = "18:00";
    await scope.openCalendarSlotTask(iso, time);
    assert.equal(scope.notesOpen, true); assert.equal(scope.fieldSelectorOpen, false); assert.equal(scope.calOpen, true);
    assert.equal(scope.unifiedNoteOriginRef.current, "calendar");
    assert.deepEqual(plain(scope.unifiedNoteSeed), { destination: "calendar", dateISO: iso, time });
    assert.equal(scope.calendarSlotDraftRef.current, null); assert.equal(scope.calendarTaskContextRef.current, null);
    assert.equal(f.writes, 0); assert.ok(!f.calls.some(call => call[0] === "setItem"));
    const ui = await f.editor();
    try {
      assert.equal(ui.hosts.get("note-title").value, "");
      assert.ok(ui.hosts.has("note-content"));
      await ui.exit();
      assert.ok(ui.calls.some(call => call[0] === "close"));
      assert.equal(f.writes, 0);
    } finally { await ui.close(); }
    assert.equal(scope.calOpen, true); assert.equal(scope.fieldSelectorOpen, false);
    assert.equal(scope.dateISODraft, "2027-02-28"); assert.equal(scope.calBgViewMode, "mes_lineal");
    assert.equal(scope.calBgViewMonth, "2027-02"); assert.equal(scope.scrollTarget, scroll);
  });
}

test("save, reopen and repeated taps preserve one task, its owner, details and real time", async () => {
  const foreign = entry("foreign", "account-b");
  const f = flowFixture([foreign]); const { scope } = f;
  await Promise.all([scope.openCalendarSlotTask("2026-10-09", "00:15"), scope.openCalendarSlotTask("2026-10-09", "00:15")]);
  assert.equal(f.calls.filter(call => call[0] === "setUnifiedNoteSeed").length, 1);
  let savedDraft;
  const ui = await f.editor(draft => { savedDraft = draft; return scope.saveNoteDraft(draft); });
  try {
    await ui.run(() => ui.hosts.get("note-title").onChangeText("Revisar piloto"));
    await ui.run(() => ui.hosts.get("note-content").onChangeText("Detalle exacto"));
    const save = ui.hosts.get("unified-note-save").onPress;
    await ui.run(() => { save(); save(); }); await ui.idle();
    assert.equal(f.saved.length, 2); assert.equal(f.writes, 1);
  } finally { await ui.close(); }
  const task = f.saved.find(record => record.id !== "foreign");
  assert.equal(task.ownerUserId, "account-a"); assert.equal(task.dateISO, "2026-10-09"); assert.equal(task.time, "00:15");
  assert.equal(task.notes, "Revisar piloto"); assert.equal(task.detail, "Detalle exacto"); assert.equal(task.duration, "");
  assert.equal(task.note.destination, "calendar"); assert.equal(task.taskContext, "live:USER");
  assert.deepEqual(f.saved.find(record => record.id === "foreign"), foreign);
  const reopened = load("lib/goLogStore.ts", {
    "@react-native-async-storage/async-storage": { default: f.storage }, "./goTaskAccess": f.access,
  });
  assert.deepEqual(plain(await reopened.readGoLog()), f.saved);
  await scope.saveNoteDraft(savedDraft);
  assert.equal(f.writes, 1, "The shared save pipeline replays the same operation idempotently");
});

test("failed persistence keeps the shared editor and reuses the same id on an explicit retry", async () => {
  const f = flowFixture(); const { scope } = f;
  await scope.openCalendarSlotTask("2026-10-09", "10:30");
  const attempts = [], ui = await f.editor(draft => { attempts.push(draft.id); return scope.saveNoteDraft(draft); });
  try {
    await ui.run(() => ui.hosts.get("note-title").onChangeText("Conservar borrador"));
    await ui.run(() => ui.hosts.get("note-content").onChangeText("No perder"));
    f.fail(true); await ui.tap("unified-note-save"); await ui.idle();
    assert.equal(f.saved.length, 0); assert.ok(ui.hosts.has("note-save-error"));
    assert.equal(ui.hosts.get("note-title").value, "Conservar borrador");
    assert.equal(ui.hosts.get("unified-note-save").disabled, false);
    f.fail(false); await ui.tap("unified-note-save"); await ui.idle();
    assert.equal(f.saved.length, 1); assert.equal(f.saved[0].id, attempts[0]);
    assert.deepEqual(attempts, [attempts[0], attempts[0]]);
  } finally { await ui.close(); }
});

test("a different account cannot save the previous account's task or adopt its draft", async () => {
  const f = flowFixture(); const { scope } = f;
  await scope.openCalendarSlotTask("2026-10-09", "10:00");
  const ui = await f.editor();
  try {
    await ui.run(() => ui.hosts.get("note-content").onChangeText("Privado"));
    f.user("account-b"); await ui.tap("unified-note-save"); await ui.idle();
    assert.equal(f.writes, 0); assert.equal(f.saved.length, 0);
    assert.ok(ui.hosts.has("note-save-error"));
    scope.exports.sessionChanged();
    await ui.render({ scope: { userId: "account-b", context: "live:USER" } });
    assert.equal(ui.hosts.get("note-content").value, "");
    assert.ok(ui.calls.some(call => call[0] === "close"));
  } finally { await ui.close(); }
  assert.equal(scope.fieldSelectorOpen, false);
  assert.equal(scope.calendarSlotDraftRef.current, null); assert.equal(scope.calOpen, true);
});
test("anonymous creation and a cancelled pending opening never create an unowned record", async () => {
  const f = flowFixture(); f.user(null);
  await f.scope.openCalendarSlotTask("2026-10-09", "10:00");
  assert.equal(f.scope.notesOpen, false); assert.equal(f.scope.fieldSelectorOpen, false); assert.equal(f.writes, 0);
  f.user("account-a");
  const opening = f.scope.openCalendarSlotTask("2026-10-09", "10:00");
  f.scope.exports.sessionChanged(); await opening;
  assert.equal(f.scope.notesOpen, false); assert.equal(f.scope.fieldSelectorOpen, false); assert.equal(f.writes, 0);
});

test("slots wait for a matching verified note scope and cannot replace an already open note", async () => {
  for (const identity of [{ ready: false, scope: { userId: "account-a", context: "live:USER" } }, { ready: true, scope: null }, { ready: true, scope: { userId: "account-b", context: "live:USER" } }]) {
    const f = flowFixture(); f.scope.noteIdentityRef.current = identity;
    await f.scope.openCalendarSlotTask("2026-10-09", "10:00");
    assert.equal(f.scope.notesOpen, false); assert.equal(f.writes, 0);
    assert.ok(f.calls.some(call => call[0] === "toast"));
  }
  const f = flowFixture(); f.scope.notesOpen = true;
  const original = f.scope.unifiedNoteSeed = { title: "Borrador abierto" };
  await f.scope.openCalendarSlotTask("2026-10-09", "10:00");
  assert.equal(f.scope.unifiedNoteSeed, original);
  assert.equal(f.calls.some(call => call[0] === "setUnifiedNoteSeed"), false);
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
  const tap = nodes(tree, node => node.type === "GestureDetector" && node.props.gesture?._maxDuration === 350)[0];
  assert.ok(tap); tap.props.gesture._onEnd({}, true);
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
  const measureSlot = () => {};
  const slot = component.GoCalendarSlot({ ...props, onLayout: measureSlot });
  assert.equal(slot.children[0].props.onLayout, measureSlot, "measure the outer slot at its position in the day");
  assert.equal(config.duration, 250); assert.equal(config.distance, 8);
  for (const [duration, distance, nativeSuccess] of [[100, 0, true], [600, 0, false], [100, 30, false], [100, 40, false], [100, 0, false]])
    config.end({}, nativeSuccess && duration <= config.duration && distance <= config.distance);
  assert.deepEqual(calls, [["2026-10-09", "09:15"]]);
  component.GoCalendarSlot({ ...props, disabled: true }); config.end({}, true);
  assert.equal(calls.length, 1);
});

test("GO retains the Calendar origin and opens the same integrated assistant once", () => {
  const f = flowFixture(); const { scope } = f;
  scope.openAi(); scope.openAi();
  assert.equal(scope.calOpen, true); assert.equal(scope.goChatOpen, true);
  scope.completeCalendarGoOpen(); scope.completeCalendarGoOpen();
  assert.equal(scope.goChatOpen, true);
  assert.equal(f.calls.filter(call => call[0] === "setGoChatOpen").length, 1);
  const modal = find(node => ts.isJsxOpeningElement(node) && node.tagName.getText(ast) === "Modal"
    && node.attributes.properties.some(attr => attr.name?.getText(ast) === "visible" && attr.initializer?.getText(ast) === "{calOpen}"));
  const dismiss=modal.attributes.properties.find(attr=>attr.name?.getText(ast)==="onDismiss");assert.ok(dismiss);
  scope.noteSelectorAfterCalendarDismissRef={current:false};
  vm.runInContext(transpile("exports.dismissCalendar = "+dismiss.initializer.expression.getText(ast)),scope);
  scope.exports.dismissCalendar();assert.equal(scope.goChatOpen,true);assert.equal(f.calls.filter(call=>call[0]==="setGoChatOpen").length,1);
  const wrapper = readFileSync("components/GOChatScreen.tsx", "utf8");
  assert.match(wrapper, /GO_BOOKING_ASSISTANT_V1 = true/); assert.match(wrapper, /<BookingAssistantScreen/);
  const reservas = find(node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === "GoReservasConfigScreen");
  assert.ok(reservas.attributes.properties.some(attr => attr.name?.getText(ast) === "onOpenGo" && attr.initializer?.getText(ast) === "{openAi}"));
});

test("calendar ownership refresh hides foreign and unowned tasks, including late session responses", async () => {
  const realAccess = flowFixture().access;
  const requests = []; let changed, effect, state = null, started = false;
  const hook = load("hooks/useGoCalendarEntries.ts", {
    "./useActionCompletion": { useCompletionDocument: () => ({ doc: null }) },
    "@/lib/goActionCompletion": { completionDecision: () => undefined, ownedCompletionEntry: () => false },
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
  const ui = await f.editor();
  try {
    await ui.run(() => ui.hosts.get("note-title").onChangeText("Lista compra"));
    await ui.run(() => ui.hosts.get("note-content").onChangeText("- Leche\n- Pan"));
    await ui.tap("unified-note-save"); await ui.idle();
    assert.equal(f.saved.length, 1); assert.equal(f.saved[0].ownerUserId, "account-a");
    assert.equal(f.saved[0].note.content, "- Leche\n- Pan");
  } finally { await ui.close(); }
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


test("central GO requests one native listen while other entries remain silent", () => {
  const f = flowFixture(); const { scope } = f;
  scope.calOpen = false;
  scope.openAi(true);
  assert.equal(scope.goChatListenRequest, 1);
  scope.openAi(true);
  assert.equal(scope.goChatListenRequest, 1);
  scope.goChatOpen = false;
  scope.openAi();
  assert.equal(scope.goChatListenRequest, undefined);
  scope.goChatOpen = false;
  scope.openAi(true);
  assert.equal(scope.goChatListenRequest, 2);
  assert.equal(f.calls.filter(call => call[0] === "timer").length, 0);
});
