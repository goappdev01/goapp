import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { modulePublicationPolicy, loadModulePublicationHook } from "./helpers/module-publication-fixture.mjs";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const source = name => readFileSync(name, "utf8");
const compile = (name, reactCompiler = false) => {
  let code = source(name);
  if (reactCompiler) {
    const babel = require("@babel/core");
    const expoRequire = createRequire(require.resolve("babel-preset-expo"));
    code = babel.transformSync(code, { filename: name, babelrc: false, configFile: false,
      parserOpts: { sourceType: "module", plugins: ["typescript", "jsx"] },
      plugins: [[expoRequire("babel-plugin-react-compiler"), { target: "19" }]],
    }).code;
  }
  return ts.transpileModule(code, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
};
const owner = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const plain = value => JSON.parse(JSON.stringify(value));
const turn = async () => { for (let i = 0; i < 12; i++) await new Promise(resolve => setImmediate(resolve)); };
// The reservation fixture is intentionally future relative to this fixed test clock.
// Production continues to reject past times; advancing wall-clock time must not invalidate the fixture.
class TestDate extends Date { static now() { return Date.parse("2026-10-12T08:00:00"); } }
function loadPure(name, imports = {}) {
  const exports = {};
  vm.runInNewContext(compile(name), { exports, require: key => {
    if (key in imports) return imports[key];
    throw new Error("Unexpected runtime dependency: " + key);
  }, console, Date: TestDate, Set, Map });
  return exports;
}
const storeModule = loadPure("data/businessDemoStore.ts");
const bookingRepositoryModule = loadPure("data/demoBookingRepository.ts", { "./businessDemoStore": storeModule,"./bookingServices":loadPure("data/bookingServices.ts") });
const localized = loadPure("i18n/translations.ts").translations;
const initial = {
  businessName: "", address: "", cartaUrl: "", sectorId: null, subId: null, plantillaItems: [],
  activeDays: [0, 1, 2, 3, 4], openFrom: "09:00", openTo: "20:00", daySchedules: {}, services: [],
  paymentPolicy: 0, approvalPolicy: 0, cancelPolicy: 0, bookingEnabled: false, completedSteps: [],
  paymentMethod: null, isBusinessActive: false, staffSchedules: {},
};
function dataFixture(userId = owner, shared = new Map()) {
  let allowed = true, failWrite = false, blockedRead;
  const reads = [], writes = [];
  const storage = {
    async getItem(key) { reads.push(key); if (blockedRead) await blockedRead; return shared.get(key) ?? null; },
    async setItem(key, value) { if (failWrite) throw new Error("storage failure"); writes.push(key); shared.set(key, value); },
  };
  const make = () => storeModule.createBusinessDemoStore({ ownerUserId: userId, storage, initialConfig: initial, canUse: () => allowed });
  return { make, store: make(), shared, storage, reads, writes,
    authorize(value) { allowed = value; }, failWrites(value) { failWrite = value; }, blockRead(value) { blockedRead = value; } };
}
const floor = store => ({ id: store.planId, businessId: store.businessId, elements: [{
  id: "demo-space", type: "silla", label: "Profesional DEMO", capacity: 1, x: 0, y: 0, width: 90, height: 52,
  status: "disponible", reservable: true,
}], updatedAt: 1 });
const futureReservationDay = new Date();
futureReservationDay.setDate(futureReservationDay.getDate() + 7 + (1 - futureReservationDay.getDay() + 7) % 7);
futureReservationDay.setHours(12, 0, 0, 0);
const futureReservationISO = [futureReservationDay.getFullYear(), String(futureReservationDay.getMonth() + 1).padStart(2, "0"), String(futureReservationDay.getDate()).padStart(2, "0")].join("-");
const futureReservationLabel = futureReservationISO.split("-").reverse().join("/");
const reservation = store => ({ id: "demo-reservation", planId: store.planId, elementId: "demo-space",
  customerName: "Cliente de prueba", date: futureReservationLabel, dateISO: futureReservationISO, time: "12:00",
  status: "pendiente", notes: "Prueba local", createdAt: 1 });

test("DEMO uses only its owner key and cannot import real config, agenda or floor data", async () => {
  const shared = new Map([["go_business_config_v1", "REAL"], ["go_log_v1", "REAL"], ["go_floor_plan_v1_my_business", "REAL"]]);
  const before = Array.from(shared);
  const f = dataFixture(owner, shared); await f.store.load();
  await f.store.updateConfig({ businessName: "Negocio de prueba", services: [{ name: "Servicio DEMO", duration: 30, price: 5 }] });
  assert.deepEqual(plain(f.reads), [storeModule.businessDemoStorageKey(owner)]);
  assert.ok(f.writes.every(key => key === storeModule.businessDemoStorageKey(owner)));
  for (const [key, value] of before) assert.equal(shared.get(key), value);
  assert.equal(f.store.getSnapshot().config.isBusinessActive, false);
});
test("configuration, services, professionals and schedules survive a new store/Reload", async () => {
  const f = dataFixture(); await f.store.load();
  await Promise.all([
    f.store.updateConfig({ businessName: "Demo" }), f.store.updateConfig({ address: "Dirección ficticia" }),
    f.store.updateConfig({ services: [{ name: "Corte DEMO", duration: 30, price: 0 }], plantillaItems: [{ id: "pro", label: "Prueba", count: 1, staffNames: ["Profesional DEMO"] }],
      daySchedules: { "0": { shift1: { from: "10:00", to: "14:00", active: true }, shift2: { from: "16:00", to: "18:00", active: false } } }, completedSteps: [0,1,2,3,4,5,6,7] }),
  ]);
  const saved = plain(f.store.getSnapshot().config);
  const again = f.make(); await again.load();
  assert.deepEqual(plain(again.getSnapshot().config), saved);
  assert.equal(saved.businessName, "Demo"); assert.equal(saved.services.length, 1); assert.equal(saved.plantillaItems.length, 1);
});
test("two owners have independent DEMO documents and reset never erases another owner or real data", async () => {
  const shared = new Map([["go_empresa_setup_v2", "REAL"]]), a = dataFixture(owner, shared), b = dataFixture(other, shared);
  await a.store.updateConfig({ businessName: "A" }); await b.store.updateConfig({ businessName: "B" });
  await a.store.reset();
  assert.equal(a.store.getSnapshot().config.businessName, "");
  assert.equal(b.store.getSnapshot().config.businessName, "B"); assert.equal(shared.get("go_empresa_setup_v2"), "REAL");
});
test("malformed/foreign documents fail closed and remain unchanged", async () => {
  for (const raw of ["bad JSON", JSON.stringify({ version: 1, ownerUserId: other, config: initial })]) {
    const f = dataFixture(); f.shared.set(storeModule.businessDemoStorageKey(owner), raw);
    await assert.rejects(f.store.load()); await assert.rejects(f.store.updateConfig({ businessName: "Must not overwrite" }));
    assert.equal(f.shared.get(storeModule.businessDemoStorageKey(owner)), raw); assert.equal(f.writes.length, 0);
  }
});
test("failed persistence preserves the committed snapshot and a later attempt can succeed", async () => {
  const f = dataFixture(); await f.store.updateConfig({ businessName: "Before" }); f.failWrites(true);
  await assert.rejects(f.store.updateConfig({ businessName: "Lost" }), /storage failure/);
  assert.equal(f.store.getSnapshot().config.businessName, "Before");
  f.failWrites(false); await f.store.updateConfig({ businessName: "After" }); assert.equal(f.store.getSnapshot().config.businessName, "After");
});
test("revocation during a read cancels the operation before any write", async () => {
  const f = dataFixture(); let release; f.blockRead(new Promise(resolve => { release = resolve; }));
  const pending = f.store.updateConfig({ businessName: "Rejected" }); await turn(); f.authorize(false); release();
  await assert.rejects(pending, /no está autorizado/); assert.equal(f.writes.length, 0);
});
test("normal or technical identities cannot use the DEMO store and IDs cannot target live data", async () => {
  const f = dataFixture(); f.authorize(false);
  await assert.rejects(f.store.load(), /no está autorizado/); assert.equal(f.reads.length, 0);
  f.authorize(true);
  await assert.rejects(f.store.updateConfig({ businessId: other }), /empresa real/);
  await assert.rejects(f.store.loadFloorPlan("my_business"), /empresa real/);
  await assert.rejects(f.store.loadReservations("fp_real"), /plano ajeno/);
  await assert.rejects(f.store.saveFloorPlan({ ...floor(f.store), id: "fp_real" }), /plano ajeno/);
  await f.store.updateConfig({ verified: true, role: "empresa", isBusinessActive: true });
  assert.equal(f.store.getSnapshot().config.isBusinessActive, false);
  assert.equal(f.store.getSnapshot().config.verified, undefined); assert.equal(f.store.getSnapshot().config.role, undefined);
});
test("floor and pending reservation persist and feed only the DEMO calendar", async () => {
  const f = dataFixture(); await f.store.saveFloorPlan(floor(f.store)); await f.store.saveReservations(f.store.planId, [reservation(f.store)]);
  const again = f.make(); await again.load();
  const doc = again.getSnapshot();
  assert.equal(doc.reservations[0].status, "pendiente"); assert.equal(doc.plan.elements[0].status, "reservado");
  assert.equal(doc.entries.length, 1); assert.equal(doc.entries[0].dateISO, futureReservationISO);
  assert.equal(doc.entries[0].ownerUserId, owner); assert.equal(doc.entries[0].businessId, f.store.businessId);
  await assert.rejects(f.store.saveReservations(f.store.planId, [{ ...reservation(f.store), elementId: "real-space" }]), /espacio guardado/);
});
test("DEMO confirmation/cancellation update the same local reservation and release its space", async () => {
  const f = dataFixture(); await f.store.saveFloorPlan(floor(f.store)); await f.store.saveReservations(f.store.planId, [reservation(f.store)]);
  await f.store.updateEntries(entries => entries.map(entry => ({ ...entry, estado: "aceptado" })));
  assert.equal(f.store.getSnapshot().reservations[0].status, "confirmada");
  await f.store.updateEntries(entries => entries.map(entry => ({ ...entry, estado: "rechazado" })));
  assert.equal(f.store.getSnapshot().reservations[0].status, "cancelada"); assert.equal(f.store.getSnapshot().plan.elements[0].status, "disponible");
});
test("calendar preferences remain inside DEMO and unrelated keys are rejected", async () => {
  const f = dataFixture(); await f.store.preferences.setItem("cal_density", "15min");
  assert.equal(await f.make().preferences.getItem("cal_density"), "15min");
  await assert.rejects(f.store.preferences.setItem("go_log_v1", "[]"), /Preferencia ajena/);
  assert.ok([...f.reads, ...f.writes].every(key => key === storeModule.businessDemoStorageKey(owner)));
});
test("reset clears only the local configuration, plan, reservations and preferences", async () => {
  const f = dataFixture(); await f.store.saveFloorPlan(floor(f.store)); await f.store.saveReservations(f.store.planId, [reservation(f.store)]);
  await f.store.preferences.setItem("cal_density", "1h"); await f.store.reset();
  assert.equal(f.store.getSnapshot().plan, null); assert.equal(f.store.getSnapshot().entries.length, 0);
  assert.equal(f.store.getSnapshot().reservations.length, 0); assert.deepEqual(plain(f.store.getSnapshot().preferences), {});
});

// Execute the real providers and screen callbacks with deterministic native APIs.
function uiFixture(data, { authorized = true, reactCompiler = false, bookingToday, realActivity = false, gpsAdapter } = {}) {
  const cache = new Map(), hooks = new Map(), alerts = [], calls = { liveAgenda: 0, liveFloor: 0, external: 0 };
  let current, cursor = 0, effects = [], lang = "es", keyboardVisible = false;
  const keyboardListeners = new Map();
  const hook = () => { const i = cursor++; return [current, i]; };
  const same = (a,b) => a && b && a.length === b.length && a.every((v,i) => Object.is(v,b[i]));
  const React = {
    Fragment: "Fragment",
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    createContext(value) { const context = { value }; context.Provider = { context }; return context; },
    useContext: context => context.value,
    useState(initial) { const [slots,i] = hook(); slots[i] ??= { value: typeof initial === "function" ? initial() : initial };
      return [slots[i].value, next => { slots[i].value = typeof next === "function" ? next(slots[i].value) : next; }]; },
    useRef(initial) { return React.useState(() => ({ current: initial }))[0]; },
    useMemo(fn,deps) { const [slots,i] = hook(); if (!slots[i] || !same(slots[i].deps,deps)) slots[i] = { value: fn(), deps }; return slots[i].value; },
    useCallback(fn,deps) { return React.useMemo(() => fn,deps); },
    useSyncExternalStore(subscribe,getSnapshot) { const [value,setValue] = React.useState(getSnapshot); React.useEffect(() => { const refresh = () => setValue(getSnapshot()); const unsubscribe = subscribe(refresh); refresh(); return unsubscribe; }, [subscribe,getSnapshot]); return value; },
    useEffect(fn,deps) { const [slots,i] = hook(), old = slots[i]; if (!old || !same(old.deps,deps)) {
      slots[i] = { deps }; effects.push(() => { old?.cleanup?.(); slots[i].cleanup = fn(); });
    } },
  };
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate() { return 0; } }
  const animation = { start(fn) { fn?.({ finished: true }); }, stop() {} };
  const native = new Proxy({
    Alert: { alert: (...args) => alerts.push(args) },
    AppState: { currentState: "active" }, Keyboard: {
      isVisible: () => keyboardVisible,
      addListener: (event, fn) => { const listeners = keyboardListeners.get(event) ?? new Set(); listeners.add(fn); keyboardListeners.set(event, listeners); return { remove: () => listeners.delete(fn) }; },
      dismiss() { keyboardVisible = false; for (const event of ["keyboardWillHide", "keyboardDidHide"]) for (const fn of keyboardListeners.get(event) ?? []) fn(); },
    },
    StyleSheet: { create: v => v, absoluteFill: {}, absoluteFillObject: {} }, Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Platform: { OS: "ios", select: options => options.ios ?? options.default },
    Animated: { Value, View: "Animated.View", timing: () => animation, spring: () => animation, add: () => 0, sequence: () => animation, loop: () => animation },
    Easing: { in: () => 0, inOut: () => 0, quad: 0 },
    PanResponder: { create: config => ({ panHandlers: config }) },
  }, { get: (target,key) => target[key] ?? key });
  const chain = new Proxy({}, { get: () => () => chain });
  const external = () => { calls.external++; throw new Error("External service must not run"); };
  const storage = { getItem: async () => { calls.liveFloor++; throw new Error("Live key read"); },
    setItem: async () => { calls.liveFloor++; throw new Error("Live key write"); } };
  const componentMocks = new Proxy({ __esModule: true }, { get(target,key) {
    if (key in target) return target[key];
    const component = { [key]: function() {} }[key]; target[key] = component; return component;
  } });
  const configApi = () => reactCompiler ? load("contexts/GoBusinessConfigContext.tsx").useBusinessConfig() : ({ config: data.store.getSnapshot().config, loaded: true, demo: data.store,
    updateConfig: patch => data.store.updateConfig(patch), resetConfig: () => data.store.reset(),
    resetToSubActivity: (sectorId,subId) => data.store.transformConfig(config => ({ ...config, sectorId, subId })),
  });
  const imports = {
    "@workspace/api-zod": modulePublicationPolicy,
    "@/hooks/useBookingModulePublication": loadModulePublicationHook(React, { context: "BUSINESS", owner: authorized }),
    react: { ...React, default: React }, "react-native": native,
    "react/compiler-runtime": { c: size => React.useMemo(() => new Array(size).fill(Symbol.for("react.memo_cache_sentinel")), []) },
    "@react-native-async-storage/async-storage": { default: storage },
    "@/contexts/GoViewContext": { useGoView: () => ({ isBusinessPreview: authorized, isOwner: authorized, isAdminView: false }) },
    "./GoViewContext": { useGoView: () => ({ isBusinessPreview: authorized }) },
    "./GoAdminAccessContext": { useAdminAccess: () => ({ userId: owner, isOwner: authorized, checking: false }) },
    "@/contexts/GoAdminAccessContext": { useAdminAccess: () => ({ userId: owner, isOwner: authorized, allowed: authorized }) },
    "./OwnerBusinessDemoContext": { useOwnerBusinessDemo: () => ({ demo: authorized ? data.store : undefined, loaded: authorized, config: authorized ? data.store.getSnapshot().config : undefined }) },
    "./DemoCompanyManager": { DemoCompanyManager: "DemoCompanyManager" },
    "@/contexts/OwnerBusinessDemoContext": { useOwnerBusinessDemo: () => ({ demo: authorized ? data.store : undefined, loaded: authorized, locationReturn: undefined, beginLocationReturn: () => 1, consumeLocationReturn: () => true, finishLocationReturn() {}, clearLocationReturn() {}, saveDeviceCoordinates: async (coordinates, expectedUserId, countryCode) => { if (!authorized || expectedUserId !== owner) throw new Error("Denied owner"); await data.store.updateConfig({coordinates, ...(countryCode ? {countryCode} : {})}); } }) },
    "./GoBusinessAccessContext": { useBusinessAccess: () => ({ allowed: false }) },
    "@/contexts/GoBusinessConfigContext": { useBusinessConfig: configApi },
    "@/contexts/LanguageContext": { useLanguage: () => ({ lang, locale: lang === "en" ? "en-US" : "es-ES", t: key => key.startsWith("floor_") ? localized[lang][key] : key }) },
    "@/lib/sessionEvents": { onSessionChanged: () => () => {} },
    "@/data/booking": new Proxy({ BookingApiError: class BookingApiError extends Error {} }, { get: (target,key) => target[key] ?? external }),
    "@/data/goRecentBusinesses": { getRecentBusinessIds: external, recordBusinessVisit: external },
    "@/lib/goLogBridge": { syncBookingToGoLog: external },
    "@/data/businessDemoCatalog": loadPure("data/businessDemoCatalog.ts", { "./businessDemoStore": storeModule }),
    "@/data/businessDemoStore": { ...storeModule, createBusinessDemoStore: options => storeModule.createBusinessDemoStore({ ...options, storage: data.storage }) },
    "@/hooks/useGoLog": { useGoLog: () => { calls.liveAgenda++; return React.useState([]); } },
    "@/hooks/useVerification": { useVerification: () => ({ status: "unverified" }) },
    "@/utils/guidance": { getGuidanceConfig: () => ({ labelOpacity: () => 0 }), swipeGuideMaxOpacity: () => 0 },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 44, bottom: 34, left: 0, right: 0 }) },
    "@expo/vector-icons": { Feather: "Feather", MaterialCommunityIcons: "MaterialCommunityIcons" },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" },
    "expo-haptics": { selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync: async () => {},
      NotificationFeedbackType: { Success: "success" }, ImpactFeedbackStyle: { Light: "light" } },
    "react-native-reanimated": { default: { View: "Reanimated.View" }, useSharedValue: value => React.useRef({ value }).current,
      useAnimatedStyle: fn => fn(), withTiming: value => value, withDecay: () => 0, runOnJS: fn => fn },
    "react-native-gesture-handler": { Gesture: new Proxy({}, { get: () => () => chain }), GestureDetector: "GestureDetector" },
    "expo-image": { Image: "Image" }, "expo-status-bar": { StatusBar: "StatusBar" },
    "expo-location": gpsAdapter ?? { Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: async () => ({ status: "denied" }), getCurrentPositionAsync: external, reverseGeocodeAsync: external },
    "expo-image-picker": new Proxy({}, { get: () => external }),
    "expo-document-picker": new Proxy({}, { get: () => external }),
    "expo-clipboard": new Proxy({}, { get: () => external }),
    "react-native-qrcode-svg": { default: "QRCode" },
  };
  native.Share = { share: external };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name,exports);
    vm.runInNewContext(compile(name, reactCompiler && ["contexts/GoBusinessConfigContext.tsx", "components/booking/GoReservasConfigScreen.tsx", "components/empresa/EmpresaConfigScreen.tsx"].includes(name)), { exports, console, Date, Set, Map, setTimeout: () => 1, clearTimeout() {},
      setInterval: () => 1, clearInterval() {}, require(key) {
        if (key in imports) return imports[key];
        if (key === "./CatalogAssociationManager") return { CatalogAssociationManager: () => null };
        if (key === "./CatalogComplementSelector") return { CatalogComplementSelector: () => null };
        if (key === "./booking") return imports["@/data/booking"];
        if (key === "@/data/floorPlan") {
          const module = load("data/floorPlan.ts");
          return { ...module, loadFloorPlan: external, saveFloorPlan: external, loadReservations: external, saveReservations: external };
        }
        if (key.startsWith("@/data/")) return load(key.replace("@/","") + ".ts");
        if (key === "@/utils/countryConfig") return load("utils/countryConfig.ts");
        if (key === "@/utils/goHaptics") return { hapticNextStep: async () => {} };
        if (realActivity && key === "@/components/empresa/EmpresaSetupGuide") return load("components/empresa/EmpresaSetupGuide.tsx");
        if (key === "@/lib/time") return { ...load("lib/time.ts"), ...(bookingToday ? { getToday: () => new Date(bookingToday) } : {}) };
        if (key === "@/lib/businessIcons") return { getBusinessIcon: () => ({}) };
        if (key.includes("components/") || key.startsWith("./Plano") || key.startsWith("../Draggable") || (key.startsWith("./") && key.endsWith("Screen"))) return componentMocks;
        throw new Error("Unexpected UI import " + key);
      },
    }, { filename: name });
    return exports;
  }
  const render = (component, props = {}) => {
    current = hooks.get(component) ?? []; hooks.set(component,current); cursor = 0; effects = [];
    const tree = component(props); if (tree?.type?.context) tree.type.context.value = tree.props.value;
    const run = effects; effects = []; for (const fn of run) fn(); return tree;
  };
  return { load, render, alerts, calls, configApi,
    emitKeyboard(event) { if (event.endsWith("Show")) keyboardVisible = true; if (event.endsWith("Hide")) keyboardVisible = false; for (const fn of keyboardListeners.get(event) ?? []) fn(); },
    unmount(component) { for (const slot of hooks.get(component) ?? []) slot?.cleanup?.(); hooks.delete(component); },
    setLanguage(value) { lang = value; } };
}
const nodes = tree => !tree || typeof tree !== "object" ? [] : [tree, ...tree.children.flatMap(nodes)];
const text = node => typeof node === "string" ? node : node?.children?.map(text).join("") ?? "";
const button = (tree, label) => nodes(tree).find(node => node.type === "TouchableOpacity" && text(node).includes(label));
const component = (tree,name) => nodes(tree).find(node => node.type?.name === name);

test("authorized provider persists activity edits using its DEMO store, without calling live synchronization", async () => {
  const f = dataFixture(), ui = uiFixture(f), module = ui.load("contexts/GoBusinessConfigContext.tsx");
  ui.render(module.GoBusinessPreviewProvider,{ children: "child" }); await turn();
  let tree = ui.render(module.GoBusinessPreviewProvider,{ children: "child" });
  tree.props.value.resetToSubActivity("belleza","peluqueria"); await turn();
  tree = ui.render(module.GoBusinessPreviewProvider,{ children: "child" });
  assert.equal(tree.props.value.config.subId,"peluqueria"); assert.ok(tree.props.value.config.services.length > 0);
  tree.props.value.updateConfig({ businessName: "Demo persistida" }); await turn();
  assert.equal(ui.render(module.GoBusinessPreviewProvider).props.value.config.businessName,"Demo persistida");
  assert.equal(ui.calls.external,0); assert.equal(ui.calls.liveFloor,0);
});
test("unapproved provider never exposes the DEMO or reads live keys", async () => {
  const f = dataFixture(), ui = uiFixture(f,{ authorized:false }), module = ui.load("contexts/GoBusinessConfigContext.tsx");
  assert.equal(ui.render(module.GoBusinessPreviewProvider),null); await turn();
  assert.equal(ui.render(module.GoBusinessPreviewProvider),null); assert.equal(f.reads.length,0); assert.equal(ui.calls.external,0);
});
test("the existing setup screen advances through all eight steps and saves progress", async () => {
  const f = dataFixture(); await f.store.updateConfig({ businessName:"GO Prueba",address:"Dirección de prueba",phone:"912345678",
    services:[{name:"Corte",duration:30,price:0}],plantillaItems:[{id:"pro",label:"Puesto",count:1,staffNames:["Profesional"]}] });
  await f.store.saveFloorPlan(floor(f.store));
  const ui = uiFixture(f), Screen = ui.load("components/empresa/EmpresaConfigScreen.tsx").EmpresaConfigScreen;
  let finished = 0, tree = ui.render(Screen,{ onBack() {}, onFinalizarConfig: () => finished++ });
  let activity = component(tree,"Step0Actividad");
  activity.props.setSector({ id:"belleza", emoji:"", label:"Belleza", color:"#000", subs:[] });
  tree = ui.render(Screen,{ onBack() {}, onFinalizarConfig: () => finished++ }); activity = component(tree,"Step0Actividad");
  activity.props.setSubId("peluqueria"); await turn();
  await f.store.updateConfig({ services:[{name:"Corte",duration:30,price:0,capacity:1}],plantillaItems:[{id:"pro",label:"Puesto",count:1,staffNames:["Profesional"]}] });
  activity.props.onSubConfirmed();
  for (let step = 0; step < 8; step++) {
    tree = ui.render(Screen,{ onBack() {}, onFinalizarConfig: () => finished++ });
    assert.ok(button(tree,step === 7 ? "biz_finish_config" : "biz_next"));
    button(tree,step === 7 ? "biz_finish_config" : "biz_next").props.onPress(); await turn();
  }
  assert.equal(finished,1); assert.deepEqual(plain(f.store.getSnapshot().config.completedSteps),[0,1,2,3,4,5,6,7]);
  assert.equal(ui.calls.external,0); assert.equal(ui.calls.liveFloor,0);
});
test("the panel opens existing configuration and DEMO bookings without activation or real verification callbacks", async () => {
  const f=dataFixture(), ui=uiFixture(f), Panel=ui.load("components/empresa/EmpresaPanel.tsx").EmpresaPanel;
  for(const modulo of ["empresa_config","reservas_config"]) {
    const props={ visible:true,previewReadOnly:true,initialModulo:modulo,onClose() {},onOpenVerificacion() { throw new Error("real verification"); } };
    ui.render(Panel,props); const tree=ui.render(Panel,props);
    const screen=component(tree,modulo === "empresa_config" ? "EmpresaConfigScreen" : "GoReservasDemoScreen");
    assert.ok(screen); assert.equal(screen.props.onOpenVerificacion,undefined);
    assert.equal(component(tree,"ActivacionCobrosScreen"),undefined);
  }
  assert.equal(ui.calls.liveAgenda,0);
});
test("the real floor booking form commits a pending DEMO reservation before closing", async () => {
  const f=dataFixture(); await f.store.updateConfig({ activeDays:[0,1,2,3,4,5,6],openFrom:"09:00",openTo:"20:00",services:[{name:"Corte DEMO",duration:30,price:0}] }); await f.store.saveFloorPlan(floor(f.store));
  const ui=uiFixture(f), Plano=ui.load("components/booking/PlanoEmpresaScreen.tsx").PlanoEmpresaScreen;
  let tree=ui.render(Plano,{ businessId:"my_business",onClose(){},hideFAB:true }); await turn();
  tree=ui.render(Plano,{ businessId:"my_business",onClose(){},hideFAB:true });
  const sheet=component(tree,"ClientBookingSheet"); let closed=0;
  const props={ ...sheet.props,el:floor(f.store).elements[0],visible:true,onClose:()=>closed++ };
  let form=ui.render(sheet.type,props);
  nodes(form).find(node=>node.type==="TextInput").props.onChangeText("Cliente DEMO");
  component(form,"GoTimeField").props.onConfirm("12:00");
  nodes(form).filter(node=>node.type==="TouchableOpacity" && /^\d{4}-\d{2}-\d{2}$/.test(node.props.key))[1].props.onPress();
  form=ui.render(sheet.type,props); await button(form,"CONFIRMAR RESERVA").props.onPress();
  assert.equal(closed,1); assert.equal(f.store.getSnapshot().reservations[0].status,"pendiente");
  assert.equal(f.store.getSnapshot().reservations[0].customerName,"Cliente DEMO"); assert.equal(ui.calls.external,0);
});
test("a failed floor booking write leaves the form open and reports failure", async () => {
  const f=dataFixture(); await f.store.updateConfig({ activeDays:[0,1,2,3,4,5,6],openFrom:"09:00",openTo:"20:00",services:[{name:"Corte DEMO",duration:30,price:0}] }); await f.store.saveFloorPlan(floor(f.store));
  const ui=uiFixture(f), Plano=ui.load("components/booking/PlanoEmpresaScreen.tsx").PlanoEmpresaScreen;
  ui.render(Plano,{ businessId:"my_business",onClose(){},hideFAB:true }); await turn();
  const sheet=component(ui.render(Plano,{ businessId:"my_business",onClose(){},hideFAB:true }),"ClientBookingSheet"); let closed=0;
  const props={...sheet.props,el:floor(f.store).elements[0],visible:true,onClose:()=>closed++};
  let form=ui.render(sheet.type,props); nodes(form).find(node=>node.type==="TextInput").props.onChangeText("Cliente DEMO");
  component(form,"GoTimeField").props.onConfirm("12:00");
  nodes(form).filter(node=>node.type==="TouchableOpacity" && /^\d{4}-\d{2}-\d{2}$/.test(node.props.key))[1].props.onPress();
  form=ui.render(sheet.type,props); f.failWrites(true); await button(form,"CONFIRMAR RESERVA").props.onPress();
  assert.equal(closed,0); assert.equal(f.store.getSnapshot().reservations.length,0); assert.ok(ui.alerts.some(alert=>alert[0]==="No se pudo guardar la reserva"));
});
test("DEMO calendar receives its reservations and changing status never mounts the live agenda hook", async () => {
  const f=dataFixture(); await f.store.saveFloorPlan(floor(f.store)); await f.store.saveReservations(f.store.planId,[reservation(f.store)]);
  const ui=uiFixture(f), Screen=ui.load("components/booking/GoReservasConfigScreen.tsx").GoReservasDemoScreen;
  let tree=ui.render(Screen,{ onClose(){},hideFAB:true }); await turn();
  button(tree,"view_mode_calendario").props.onPress(); tree=ui.render(Screen,{ onClose(){},hideFAB:true });
  const calendar=component(tree,"AgendaBoard"); assert.ok(calendar); assert.equal(calendar.props.goLog.length,1);
  calendar.props.onChangeEstado(calendar.props.goLog[0].id,"aceptado"); await turn();
  tree=ui.render(Screen,{ onClose(){},hideFAB:true });
  assert.equal(component(tree,"AgendaBoard").props.goLog[0].estado,"aceptado");
  assert.equal(f.store.getSnapshot().reservations[0].status,"confirmada"); assert.equal(ui.calls.liveAgenda,0); assert.equal(ui.calls.liveFloor,0);
});
test("accidentally routing DEMO to the live bookings component is denied before reading the real agenda", () => {
  const f=dataFixture(),ui=uiFixture(f),Screen=ui.load("components/booking/GoReservasConfigScreen.tsx").GoReservasConfigScreen;
  assert.throws(()=>ui.render(Screen,{onClose(){}}),/adaptador aislado/); assert.equal(ui.calls.liveAgenda,0);
});

test("denied device GPS, OCR and public sharing cannot call external services in DEMO", async () => {
  const f=dataFixture(); await f.store.updateConfig({ businessName:"GO Prueba",address:"Dirección de prueba",sectorId:"belleza",subId:"peluqueria",phone:"912345678",services:[{name:"Corte",duration:30,price:0}],plantillaItems:[{id:"pro",label:"Puesto",count:1,staffNames:["Profesional"]}] });
  await f.store.saveFloorPlan(floor(f.store));
  const ui=uiFixture(f),Screen=ui.load("components/empresa/EmpresaConfigScreen.tsx").EmpresaConfigScreen;
  const props={onBack(){},onFinalizarConfig(){}};
  component(ui.render(Screen,props),"Step0Actividad").props.onSubConfirmed();
  for(let step=0;step<8;step++){
    const tree=ui.render(Screen,props);
    if(step===1){
      const child=component(tree,"StepUbicacion"),page=ui.render(child.type,child.props);
      await button(page,"biz_use_current_location").props.onPress();
    }
    if(step===3){
      const child=component(tree,"StepServicios"),page=ui.render(child.type,child.props);
      const imports=nodes(page).filter(node=>node.type==="TouchableOpacity" && text(node).includes("biz_import_"));
      assert.equal(imports.length,3);
      for(const control of imports)await control.props.onPress();
      assert.equal(component(page,"GoOcrImportSheet"),undefined);
    }
    if(step===7){
      const child=component(tree,"StepPublicar"),page=ui.render(child.type,child.props);
      await button(page,"biz_share_whatsapp").props.onPress(); await button(page,"biz_copy_link").props.onPress();
      const qr=nodes(page).find(node=>node.type==="QRCode");
      assert.ok(qr.props.value.startsWith("GO DEMO local")); assert.equal(button(page,"biz_verify_business_btn"),undefined);
    }
    button(tree,step===7?"biz_finish_config":"biz_next").props.onPress(); await turn();
  }
  assert.equal(ui.calls.external,0); assert.equal(ui.alerts.length,6);
});
test("repeated confirmation taps produce only one persisted DEMO reservation", async () => {
  const f=dataFixture(); await f.store.updateConfig({ activeDays:[0,1,2,3,4,5,6],openFrom:"09:00",openTo:"20:00",services:[{name:"Corte DEMO",duration:30,price:0}] }); await f.store.saveFloorPlan(floor(f.store));
  const ui=uiFixture(f),Plano=ui.load("components/booking/PlanoEmpresaScreen.tsx").PlanoEmpresaScreen;
  ui.render(Plano,{businessId:"my_business",onClose(){},hideFAB:true}); await turn();
  const sheet=component(ui.render(Plano,{businessId:"my_business",onClose(){},hideFAB:true}),"ClientBookingSheet");
  let closed=0; const props={...sheet.props,el:floor(f.store).elements[0],visible:true,onClose:()=>closed++};
  let page=ui.render(sheet.type,props); nodes(page).find(node=>node.type==="TextInput").props.onChangeText("Cliente DEMO");
  component(page,"GoTimeField").props.onConfirm("12:00");
  nodes(page).filter(node=>node.type==="TouchableOpacity" && /^\d{4}-\d{2}-\d{2}$/.test(node.props.key))[1].props.onPress();
  page=ui.render(sheet.type,props); const confirm=button(page,"CONFIRMAR RESERVA").props.onPress;
  await Promise.all([confirm(),confirm()]);
  assert.equal(f.store.getSnapshot().reservations.length,1); assert.equal(closed,1);
});
test("NEXT in the DEMO floor waits for persistence even when the floor has no unsaved edits", async () => {
  const f=dataFixture(); await f.store.saveFloorPlan(floor(f.store));
  const ui=uiFixture(f),Plano=ui.load("components/booking/PlanoEmpresaScreen.tsx").PlanoEmpresaScreen;
  let advanced=0; const props={businessId:"my_business",onClose(){},onNext:()=>advanced++,hideFAB:true};
  ui.render(Plano,props); await turn(); let tree=ui.render(Plano,props);
  f.failWrites(true); await button(tree,"biz_next").props.onPress(); assert.equal(advanced,0);
  f.failWrites(false); tree=ui.render(Plano,props); await button(tree,"biz_next").props.onPress(); assert.equal(advanced,1);
});
test("DEMO calendar controls persist locally without altering public calendar preferences", async () => {
  const f=dataFixture(),ui=uiFixture(f),Screen=ui.load("components/booking/GoReservasConfigScreen.tsx").GoReservasDemoScreen;
  let tree=ui.render(Screen,{onClose(){},hideFAB:true}); button(tree,"Configuración").props.onPress();
  tree=ui.render(Screen,{onClose(){},hideFAB:true}); const panel=component(tree,"GoCalConfigPanel");
  panel.props.onDensityChange("15min"); panel.props.onDayNightModeChange("oscuro"); await turn();
  assert.equal(f.store.getSnapshot().preferences.cal_density,"15min");
  assert.equal(f.store.getSnapshot().preferences.cal_day_night_mode_v1,"oscuro");
  assert.equal(ui.calls.liveFloor,0); assert.equal(ui.calls.liveAgenda,0);
});


test("Expo-compiled DEMO provider keeps form edits visible and persists them across reload", async () => {
  const f = dataFixture();
  await f.store.updateConfig({ businessName: "GO PELUQUERÍA", sectorId: "belleza", subId: "peluqueria" });
  const ui = uiFixture(f, { reactCompiler: true });
  const Provider = ui.load("contexts/GoBusinessConfigContext.tsx").GoBusinessPreviewProvider;
  const Screen = ui.load("components/empresa/EmpresaConfigScreen.tsx").EmpresaConfigScreen;
  ui.render(Provider, { children: "form" });
  let tree = ui.render(Screen, { onBack() {} });
  component(tree, "Step0Actividad").props.onSubConfirmed();
  tree = ui.render(Screen, { onBack() {} });
  const step = component(tree, "StepNombre");
  let page = ui.render(step.type, step.props);
  nodes(page).find(node => node.type === "TextInput").props.onChangeText("GO PELUQUERÍA REMOTA");
  await turn();
  ui.render(Provider, { children: "form" });
  page = ui.render(step.type, step.props);
  assert.equal(nodes(page).find(node => node.type === "TextInput").props.value, "GO PELUQUERÍA REMOTA");
  const patch = { address: "Calle de prueba 10", phone: "912345678", mobile: "612345678",
    openFrom: "10:00", services: [{ name: "Corte de prueba", duration: 30, price: 15 }] };
  ui.render(Provider, { children: "form" }).props.value.updateConfig(patch);
  await turn();
  const saved = ui.render(Provider, { children: "form" }).props.value.config;
  const reopened = await f.make().load();
  for (const [key, value] of Object.entries(patch)) {
    assert.deepEqual(plain(saved[key]), value);
    assert.deepEqual(plain(reopened.config[key]), value);
  }
  assert.equal(reopened.config.businessName, "GO PELUQUERÍA REMOTA");
  assert.equal(reopened.config.businessId, f.store.businessId);
  assert.equal(reopened.ownerUserId, owner);
  assert.equal(ui.calls.external, 0); assert.equal(ui.calls.liveFloor, 0);
  assert.ok(f.writes.every(key => key === storeModule.businessDemoStorageKey(owner)));
});


for (const multiple of [false, true]) test("complete DEMO booking reaches its final screen and updates both real calendar callbacks, reload and cancellation" + (multiple ? " with multiple services" : ""), async () => {
  const f = dataFixture();
  await f.store.updateConfig({ businessName: "GO PELUQUERÍA", sectorId: "belleza", subId: "peluqueria", address: "Calle de prueba", phone: "912345678",
    activeDays: [0,1,2,3,4], services: [{ name: "Corte de prueba", duration: 30, price: 12 }, ...(multiple ? [{ name: "Tinte de prueba", duration: 60, price: 20 }] : [])],
    plantillaItems: [{ id: "puestos", count: 2, label: "Puestos", staffNames: ["Profesional DEMO", "Profesional DOS"] }], completedSteps: [0,1,2,3,4,5,6,7] });
  const plan = floor(f.store); plan.elements.push({ ...plan.elements[0], id: "demo-space-two", label: "Profesional DOS" });
  await f.store.saveFloorPlan(plan);
  const now = () => Date.parse("2030-01-07T08:00:00");
  const repo = bookingRepositoryModule.createDemoBookingRepository(f.store, { now });
  const ui = uiFixture(f, { reactCompiler: true, bookingToday: "2030-01-07T00:00:00" });
  const Provider = ui.load("contexts/GoBusinessConfigContext.tsx").GoBusinessPreviewProvider;
  const Customer = ui.load("components/booking/DemoCustomerCalendar.tsx").DemoCustomerCalendar;
  const Company = ui.load("components/booking/GoReservasConfigScreen.tsx").GoReservasDemoScreen;
  const Overlay = ui.load("components/booking/BookingSearchOverlay.tsx").BookingSearchOverlay;
  const companyProps = { onClose() {}, hideFAB: true }, customerProps = { repository: repo, onPersonal() {} };
  ui.render(Provider); ui.render(Customer, customerProps); let company = ui.render(Company, companyProps); await turn();
  company = ui.render(Company, companyProps); button(company, "view_mode_calendario").props.onPress();
  company = ui.render(Company, companyProps); button(company, "Profesional DEMO").props.onPress();
  assert.equal(component(ui.render(Company, companyProps), "AgendaBoard").props.goLog.length, 0);
  const navigation = [], props = { visible: true, demoRepository: repo, initialBusinessId: f.store.businessId, onClose() {}, onDemoGoToBooking: (...args) => navigation.push(args) };
  ui.render(Overlay, props); await turn(); ui.render(Overlay, props); await turn();
  let tree = ui.render(Overlay, props); button(tree, "Corte de prueba").props.onPress(); tree = ui.render(Overlay, props);
  if (multiple) { button(tree, "Tinte de prueba").props.onPress(); tree = ui.render(Overlay, props); }
  button(tree, "save").props.onPress(); tree = ui.render(Overlay, props);
  button(tree, "Profesional DEMO").props.onPress(); ui.render(Overlay, props); await turn(); tree = ui.render(Overlay, props);
  button(tree, "09:00").props.onPress(); await turn(); tree = ui.render(Overlay, props);
  const confirm = button(tree, "BIZ_CONFIRM_BOOKING_BTN").props.onPress;
  await Promise.all([confirm(), confirm()]); tree = ui.render(Overlay, props);
  assert.ok(text(tree).includes("BIZ_BOOKING_CONFIRMED")); assert.ok(text(tree).includes("GO PELUQUERÍA")); assert.ok(text(tree).includes("Profesional DEMO"));
  const data = f.store.getSnapshot(), booking = data.bookings[0];
  assert.equal(data.bookings.length, 1); assert.equal(data.reservations.length, 1);
  assert.equal(booking.status, "CONFIRMED"); assert.equal(booking.businessId, f.store.businessId);
  assert.equal(booking.bookableItemId, (await repo.getBookableItems(f.store.businessId))[0].id);
  assert.equal(booking.staffId, (await repo.getStaff(f.store.businessId))[0].id);
  ui.render(Provider); let clientBoard = component(ui.render(Customer, customerProps), "AgendaBoard");
  let companyBoard = component(ui.render(Company, companyProps), "AgendaBoard");
  assert.equal(clientBoard.props.goLog.length, 1); assert.equal(companyBoard.props.goLog.length, 1);
  assert.equal(clientBoard.props.goLog[0].reservationId, companyBoard.props.goLog[0].reservationId);
  assert.equal(clientBoard.props.goLog[0].staffId, booking.staffId);
  if (multiple) {
    assert.equal(booking.services.length, 2); assert.equal(booking.endDatetime, "2030-01-07T10:30:00");
    for (const board of [clientBoard, companyBoard]) { assert.equal(board.props.goLog[0].duration, "90"); assert.equal(board.props.goLog[0].intentLabel, "Corte de prueba + Tinte de prueba"); }
  }
  const reopened = f.make(); await reopened.load(); assert.equal(reopened.getSnapshot().bookings.length, 1); assert.equal(reopened.getSnapshot().bookings[0].id, booking.id);
  button(ui.render(Company, companyProps), "Profesional DOS").props.onPress();
  assert.equal(component(ui.render(Company, companyProps), "AgendaBoard").props.goLog.length, 0);
  button(ui.render(Company, companyProps), "Profesional DEMO").props.onPress();
  button(tree, "biz_ok_view_calendar").props.onPress(); assert.equal(navigation.length, 1); assert.equal(navigation[0][0], "2030-01-07");
  await clientBoard.props.onDeleteItem(clientBoard.props.goLog[0].id); await turn(); ui.render(Provider);
  clientBoard = component(ui.render(Customer, customerProps), "AgendaBoard"); companyBoard = component(ui.render(Company, companyProps), "AgendaBoard");
  assert.equal(clientBoard.props.goLog[0].estado, "rechazado");
  assert.ok(companyBoard.props.goLog.every(entry => entry.reservationId !== booking.id || entry.estado === "rechazado"));
  const restored = await reopened.load(); assert.equal(restored.bookings.length, 1); assert.equal(restored.bookings[0].status, "CANCELLED");
  assert.equal((await repo.getAllSlots(f.store.businessId, booking.bookableItemId, "2030-01-07", booking.staffId)).find(slot => slot.startDatetime === booking.startDatetime).isAvailable, true);
  assert.equal(ui.calls.external, 0); assert.equal(ui.calls.liveFloor, 0);
});

// Exercise the actual eight-step callbacks, rather than direct store.updateConfig alone.
async function configuredSalon(f) {
  await f.store.updateConfig({businessName:"GO PELUQUERIA",sectorId:"belleza",subId:"peluqueria",
    address:"Direccion ficticia",phone:"912345678",activeDays:[0,1,2,3,4],
    services:[{name:"Corte DEMO",duration:30,price:15,capacity:1},{name:"Servicio adicional",duration:45,price:20,capacity:1}],
    plantillaItems:[{id:"original-posts",emoji:"chair",label:"Puestos",count:4,
      staffNames:["Raul 1 GO PRUEBA","Raul 2 GO PRUEBA","Raul 3 GO PRUEBA","Raul 4 GO PRUEBA"],
      staffServices:Array.from({length:4},()=>["Corte DEMO"]),staffEmojis:["a","b","c","d"]}],completedSteps:[0,1,2,3,4,5,6,7]});
  await f.store.saveFloorPlan({id:f.store.planId,businessId:f.store.businessId,updatedAt:1,
    elements:Array.from({length:4},(_,i)=>({id:"preserved-space-"+i,type:"silla",label:"Raul "+(i+1)+" GO PRUEBA",
      capacity:1,x:10+i*100,y:20+i*30,width:150,height:52,status:"disponible",reservable:true}))});
}
function configurationUI(f,initialStep=0,options={}) {
  const ui=uiFixture(f,{reactCompiler:true,realActivity:true,...options});
  const Provider=ui.load("contexts/GoBusinessConfigContext.tsx").GoBusinessPreviewProvider;
  const Screen=ui.load("components/empresa/EmpresaConfigScreen.tsx").EmpresaConfigScreen;
  const props={initialStep,onBack(){},goPrevRef:{current:null}};
  const render=()=>{ui.render(Provider,{children:"configuration"});return ui.render(Screen,props)};
  const enterStep=name=>{component(render(),"Step0Actividad").props.onSubConfirmed();const step=component(render(),name);assert.ok(step,"Expected "+name);
    const page=()=>{render();return ui.render(step.type,step.props)};return {step,page};};
  return {...ui,Screen,Provider,props,render,renderComponent:ui.render,enterStep};
}
test("reopening the salon and reselecting its actual sector/activity preserves staff, services and all floor positions",async()=>{
  const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot()),ui=configurationUI(f);
  let activity=component(ui.render(),"Step0Actividad"),page=ui.renderComponent(activity.type,activity.props);
  button(page,"Belleza").props.onPress();await turn();activity=component(ui.render(),"Step0Actividad");page=ui.renderComponent(activity.type,activity.props);
  button(page,"Peluquer").props.onPress();await turn();ui.render();const restored=await f.make().load();
  assert.deepEqual(plain(restored.config),before.config);assert.deepEqual(plain(restored.plan),before.plan);
  assert.equal(ui.calls.external,0);assert.equal(ui.calls.liveFloor,0);
});
test("browsing a different sector then going back/cancelling never resets saved business configuration",async()=>{
  const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot()),ui=configurationUI(f);
  const activity=component(ui.render(),"Step0Actividad"),page=ui.renderComponent(activity.type,activity.props);
  button(page,"Restauraci").props.onPress();await turn();ui.render();ui.props.goPrevRef.current();await turn();ui.render();ui.props.goPrevRef.current();await turn();
  assert.deepEqual(plain(await f.make().load()),before);
});
test("a named service edited without a blur event persists when leaving the step and after Reload",async()=>{
  const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,3),{step,page}=ui.enterStep("StepServicios");
  button(page(),"biz_add_service_btn").props.onPress();
  const inputs=nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder?.startsWith("biz_service_placeholder"));
  inputs.at(-1).props.onChangeText("Servicio nuevo sin blur");page();
  const numeric=nodes(page()).filter(n=>n.type==="TextInput" && n.props.keyboardType==="numeric");numeric.at(-3).props.onChangeText("50");page();
  ui.unmount(step.type);await turn();const saved=plain((await f.make().load()).config.services);
  assert.equal(saved.length,3);assert.deepEqual(saved[2],{name:"Servicio nuevo sin blur",duration:50,price:0,capacity:1});
  const reopened=configurationUI(f,3).enterStep("StepServicios").page();assert.ok(nodes(reopened).some(n=>n.type==="TextInput" && n.props.value==="Servicio nuevo sin blur"));
});
test("an older asynchronous staff save cannot replace newer additions or specialties in the open step",async()=>{
  const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,4),{page}=ui.enterStep("StepEspacios");
  const pending=[],write=f.storage.setItem;let blocking=true;
  f.storage.setItem=async(key,value)=>{if(blocking)await new Promise(resolve=>pending.push(resolve));await write(key,value)};
  button(page(),"biz_add_professional").props.onPress();page();await turn();
  const first=nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder==="biz_professional_name_ph").at(-1);
  first.props.onChangeText("Profesional nuevo uno");first.props.onSubmitEditing();page();
  button(page(),"biz_add_professional").props.onPress();page();
  assert.equal(nodes(page()).filter(n=>n.props.placeholder==="biz_professional_name_ph").length,5,"A tap during insertion must not create another professional");
  assert.equal(pending.length,1);pending.shift()();await turn();page();
  button(page(),"biz_add_professional").props.onPress();page();
  assert.equal(pending.length,1);pending.shift()();await turn();page();page();
  assert.equal(nodes(page()).filter(n=>n.props.placeholder==="biz_professional_name_ph").length,6,"An older name acknowledgement cannot discard a later completed insertion");
  const specialty=nodes(page()).find(n=>n.type==="TouchableOpacity" && text(n)==="Servicio adicional");assert.ok(specialty);specialty.props.onPress();page();
  blocking=false;while(pending.length){pending.shift()();await turn()}await turn();const saved=(await f.make().load()).config;
  assert.equal(saved.plantillaItems[0].count,6);
  assert.equal(saved.plantillaItems[0].staffNames[4],"Profesional nuevo uno");
  assert.deepEqual(plain(saved.plantillaItems[0].staffServices[0]),["Corte DEMO","Servicio adicional"]);assert.equal(saved.plantillaItems[0].staffNames[3],"Raul 4 GO PRUEBA");
});
test("Next commits a focused professional name before validating and advancing the saved step",async()=>{
  const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot().plan),ui=configurationUI(f,4),{step,page}=ui.enterStep("StepEspacios");
  button(page(),"biz_add_professional").props.onPress();
  const names=nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder==="biz_professional_name_ph");names.at(-1).props.onChangeText("Profesional adicional");page();
  button(ui.render(),"biz_next").props.onPress();await turn();
  assert.ok(component(ui.render(),"StepReservas"));ui.unmount(step.type);await turn();
  const restored=await f.make().load();assert.equal(restored.config.plantillaItems[0].count,5);assert.equal(restored.config.plantillaItems[0].staffNames[4],"Profesional adicional");
  assert.deepEqual(plain(restored.plan.elements.slice(0,before.elements.length)),before.elements);assert.equal(restored.plan.elements.length,5);assert.equal(restored.config.plantillaItems[0].id,"original-posts");
});
test("closing the professional page commits its focused name and specialties without requiring blur",async()=>{
  const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,4),{step,page}=ui.enterStep("StepEspacios");
  button(page(),"biz_add_professional").props.onPress();
  const specialties=nodes(page()).filter(n=>n.type==="TouchableOpacity" && text(n)==="Servicio adicional");specialties.at(-1).props.onPress();
  nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder==="biz_professional_name_ph").at(-1).props.onChangeText("Profesional con especialidad");
  ui.unmount(step.type);await turn();const stored=await f.make().load();
  assert.equal(stored.config.plantillaItems[0].staffNames[4],"Profesional con especialidad");assert.deepEqual(plain(stored.config.plantillaItems[0].staffServices[4]),["Servicio adicional"]);
  assert.equal(storeModule.getBusinessDemoProfessionals(stored.config,f.store.businessId).length,5);
});
test("service acknowledgements retain the next empty input and Save persists duration, price and capacity once",async()=>{
  const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,3),{step,page}=ui.enterStep("StepServicios");
  button(page(),"biz_add_service_btn").props.onPress();
  nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder?.startsWith("biz_service_placeholder")).at(-1).props.onChangeText("Servicio completo");
  button(page(),"biz_add_service_btn").props.onPress();await turn();
  const inputs=nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder?.startsWith("biz_service_placeholder"));assert.equal(inputs.length,4);assert.equal(inputs.at(-1).props.value,"");
  for(const [offset,value] of [[6,"60"],[7,"25"],[8,"2"]])nodes(page()).filter(n=>n.type==="TextInput" && n.props.keyboardType==="numeric")[offset].props.onChangeText(value);
  button(ui.render(),"biz_next").props.onPress();await turn();assert.ok(component(ui.render(),"StepEspacios"));ui.unmount(step.type);await turn();
  const services=plain((await f.make().load()).config.services);assert.equal(services.length,3);assert.deepEqual(services[2],{name:"Servicio completo",duration:60,price:25,capacity:2});
});
test("a failed field write keeps the configuration open and never announces successful completion",async()=>{
  const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot().config.services),ui=configurationUI(f,3),{page}=ui.enterStep("StepServicios");
  f.failWrites(true);nodes(page()).find(n=>n.type==="TextInput" && n.props.placeholder?.startsWith("biz_service_placeholder")).props.onChangeText("Cambio no guardado");await turn();
  button(ui.render(),"biz_next").props.onPress();await turn();assert.ok(component(ui.render(),"StepServicios"));assert.deepEqual(plain(f.store.getSnapshot().config.services),before);
  assert.ok(ui.alerts.some(alert=>String(alert[1]).includes("storage failure")));f.failWrites(false);
});
test("hydrating and leaving untouched configuration does not write or regenerate existing professionals, services or floor",async()=>{
  const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot()),writes=f.writes.length;
  for(const [index,name] of [[3,"StepServicios"],[4,"StepEspacios"]]){
    const ui=configurationUI(f,index),{step,page}=ui.enterStep(name);page();page();ui.unmount(step.type);await turn();
  }
  assert.equal(f.writes.length,writes);assert.deepEqual(plain(await f.make().load()),before);
});
test("editing one company and reopening the catalog keeps restaurant, salon and other owners isolated",async()=>{
  const f=dataFixture(),catalogAPI=loadPure("data/businessDemoCatalog.ts",{"./businessDemoStore":storeModule});
  const catalog=catalogAPI.createBusinessDemoCatalog({ownerUserId:owner,storage:f.storage,initialConfig:initial,canUse:()=>true});
  await catalog.create("GO PELUQUERIA");const salon=catalog.getSelectedStore(),salonId=catalog.getSelectedId();await configuredSalon({store:salon});
  await catalog.create("GO RESTAURANTE");const restaurant=catalog.getSelectedStore();await restaurant.updateConfig({address:"Restaurante ficticio",sectorId:"restauracion",subId:"restaurante",services:[{name:"Menu DEMO",duration:90,price:30}],plantillaItems:[{id:"table",label:"Mesa",count:1,staffNames:["Personal restaurante"]}]});const beforeRestaurant=plain(restaurant.getSnapshot());
  const otherOwner=dataFixture(other,f.shared);await otherOwner.store.updateConfig({businessName:"Otra identidad"});const beforeOther=plain(await otherOwner.make().load());
  await catalog.select(salonId);const ui=configurationUI({store:salon,storage:f.storage},3),{step,page}=ui.enterStep("StepServicios");button(page(),"biz_add_service_btn").props.onPress();
  nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder?.startsWith("biz_service_placeholder")).at(-1).props.onChangeText("Servicio solo peluqueria");ui.unmount(step.type);await turn();
  const newStoreAPI=loadPure("data/businessDemoStore.ts"),newCatalogAPI=loadPure("data/businessDemoCatalog.ts",{"./businessDemoStore":newStoreAPI});
  const reopened=newCatalogAPI.createBusinessDemoCatalog({ownerUserId:owner,storage:f.storage,initialConfig:initial,canUse:()=>true});await reopened.load();
  assert.equal(reopened.getSelectedStore().getSnapshot().config.services.length,3);assert.equal(reopened.getSelectedStore().getSnapshot().config.services[2].name,"Servicio solo peluqueria");
  await reopened.select(catalog.getCompanies().find(c=>c.name==="GO RESTAURANTE").id);assert.deepEqual(plain(reopened.getSelectedStore().getSnapshot()),beforeRestaurant);assert.deepEqual(plain(await otherOwner.make().load()),beforeOther);
});
test("configuration edits and re-entry keep booking staff/service IDs, both calendars and floor IDs/positions",async()=>{
  const f=dataFixture();await configuredSalon(f);const repo=bookingRepositoryModule.createDemoBookingRepository(f.store,{now:()=>Date.parse("2030-01-07T08:00:00")});
  const service=(await repo.getBookableItems(f.store.businessId))[0],staff=(await repo.getStaff(f.store.businessId))[0];
  const hold=await repo.createHold({businessId:f.store.businessId,bookableItemId:service.id,staffId:staff.id,customerId:owner,startDatetime:"2030-01-07T10:00:00",endDatetime:"2030-01-07T10:30:00",unitsReserved:1,peopleCount:1});assert.equal(hold.ok,true);
  const confirmed=await repo.claimSlot({...hold.booking,status:"CONFIRMED",holdExpiresAt:undefined});assert.equal(confirmed.ok,true);const before=plain(f.store.getSnapshot());
  const ui=configurationUI(f,4),{step,page}=ui.enterStep("StepEspacios");button(page(),"biz_add_professional").props.onPress();
  nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder==="biz_professional_name_ph").at(-1).props.onChangeText("Profesional nuevo");ui.unmount(step.type);await turn();
  const activityUI=configurationUI(f);let activity=component(activityUI.render(),"Step0Actividad");button(activityUI.renderComponent(activity.type,activity.props),"Belleza").props.onPress();activity=component(activityUI.render(),"Step0Actividad");button(activityUI.renderComponent(activity.type,activity.props),"Peluquer").props.onPress();await turn();
  const restored=f.make();await restored.load();const snapshot=plain(restored.getSnapshot());assert.deepEqual(snapshot.bookings,before.bookings);assert.deepEqual(snapshot.reservations,before.reservations);assert.deepEqual(snapshot.entries,before.entries);assert.deepEqual(snapshot.plan.elements.slice(0,before.plan.elements.length),before.plan.elements);assert.equal(snapshot.plan.elements.length,5);
  const restoredRepo=bookingRepositoryModule.createDemoBookingRepository(restored,{now:()=>Date.parse("2030-01-07T08:00:00")});assert.equal((await restoredRepo.getMyBookings())[0].staffId,staff.id);assert.equal((await restoredRepo.getMyBookings())[0].bookableItemId,service.id);assert.equal(restoredRepo.getCustomerEntries().length,1);
  const reopenedUI=uiFixture({...f,store:restored},{reactCompiler:true}),Provider=reopenedUI.load("contexts/GoBusinessConfigContext.tsx").GoBusinessPreviewProvider,Company=reopenedUI.load("components/booking/GoReservasConfigScreen.tsx").GoReservasDemoScreen,Customer=reopenedUI.load("components/booking/DemoCustomerCalendar.tsx").DemoCustomerCalendar;
  reopenedUI.render(Provider);let company=reopenedUI.render(Company,{onClose(){},hideFAB:true});await turn();button(company,"view_mode_calendario").props.onPress();company=reopenedUI.render(Company,{onClose(){},hideFAB:true});button(company,staff.name).props.onPress();
  assert.equal(component(reopenedUI.render(Company,{onClose(){},hideFAB:true}),"AgendaBoard").props.goLog.length,1);assert.equal(component(reopenedUI.render(Customer,{repository:restoredRepo,onPersonal(){}}),"AgendaBoard").props.goLog.length,1);
  assert.equal(reopenedUI.calls.liveAgenda,0);assert.equal(reopenedUI.calls.liveFloor,0);assert.equal(reopenedUI.calls.external,0);
});
test("the actual floor merges added professionals once and preserves all original station IDs and positions across reopening",async()=>{
  const f=dataFixture();await configuredSalon(f);const original=plain(f.store.getSnapshot().plan.elements),form=configurationUI(f,4),{step,page}=form.enterStep("StepEspacios");
  for(const name of ["Profesional adicional uno","Profesional adicional dos"]){
    button(page(),"biz_add_professional").props.onPress();nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder==="biz_professional_name_ph").at(-1).props.onChangeText(name);
    // Commit the field through its existing native Return path; the next addition is independent.
    nodes(page()).filter(n=>n.type==="TextInput" && n.props.placeholder==="biz_professional_name_ph").at(-1).props.onSubmitEditing();page();await turn();
  }
  form.unmount(step.type);await turn();
  const openFloor=async store=>{
    const ui=uiFixture({...f,store},{reactCompiler:true}),Provider=ui.load("contexts/GoBusinessConfigContext.tsx").GoBusinessPreviewProvider,Floor=ui.load("components/booking/PlanoEmpresaScreen.tsx").PlanoEmpresaScreen;
    ui.render(Provider);const props={businessId:store.businessId,businessName:"GO PELUQUERIA",onClose(){},onNext(){},hideFAB:true};ui.render(Floor,props);await turn();
    const tree=ui.render(Floor,props),next=button(tree,"biz_next");assert.ok(next);await next.props.onPress();await turn();return ui;
  };
  const first=await openFloor(f.store);const saved=plain(f.store.getSnapshot().plan);assert.equal(saved.elements.length,6);assert.equal(new Set(saved.elements.map(e=>e.id)).size,6);
  for(const element of original){const current=saved.elements.find(e=>e.id===element.id);assert.ok(current);assert.equal(current.x,element.x);assert.equal(current.y,element.y);assert.equal(current.label,element.label);}
  assert.ok(saved.elements.some(e=>e.label==="Profesional adicional uno"));assert.ok(saved.elements.some(e=>e.label==="Profesional adicional dos"));
  const restored=f.make();await restored.load();await openFloor(restored);assert.deepEqual(plain(restored.getSnapshot().plan.elements),saved.elements);assert.equal(restored.getSnapshot().config.plantillaItems[0].count,6);
  assert.equal(first.calls.external,0);assert.equal(first.calls.liveFloor,0);
});
test("repeated draft values do not let an intermediate save acknowledge a later pending edit",async()=>{
  const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,4),{page}=ui.enterStep("StepEspacios");
  const pending=[],write=f.storage.setItem;f.storage.setItem=async(key,value)=>{await new Promise(resolve=>pending.push(resolve));await write(key,value)};
  for(const label of ["Version antigua","Version nueva","Version antigua","Version nueva"]){
    nodes(page()).find(n=>n.type==="TextInput" && n.props.placeholder==="biz_space_name_placeholder").props.onChangeText(label);page();
  }
  await turn();for(let index=0;index<3;index++){assert.equal(pending.length,1);pending.shift()();await turn();page();page();}
  const specialty=nodes(page()).find(n=>n.type==="TouchableOpacity" && text(n)==="Servicio adicional");specialty.props.onPress();page();
  while(pending.length){pending.shift()();await turn()}await turn();const saved=(await f.make().load()).config.plantillaItems[0];
  assert.equal(saved.label,"Version nueva");assert.deepEqual(plain(saved.staffServices[0]),["Corte DEMO","Servicio adicional"]);assert.equal(saved.count,4);
});

function nativeBusinessGPS(f,{permission="granted",address=true,onPermission=()=>{},waitForAddress}={}){
 const calls=[];return {calls,adapter:{Accuracy:{Balanced:3},
  async requestForegroundPermissionsAsync(){calls.push("permission");onPermission();return {status:permission}},
  async getCurrentPositionAsync(){calls.push("position");return {coords:{latitude:40.4168,longitude:-3.7038}}},
  async reverseGeocodeAsync(){calls.push("address");assert.deepEqual(plain(f.store.getSnapshot().config.coordinates),{latitude:40.4168,longitude:-3.7038});if(waitForAddress)await waitForAddress;return address?[{street:"Calle de prueba",streetNumber:"12",city:"Madrid",country:"España"}]:[{city:"Madrid"}]},
 }};
}

test("DEMO GPS fills the editable street field and keeps both address and coordinates after Reload",async()=>{
 const f=dataFixture();await configuredSalon(f);const gps=nativeBusinessGPS(f),ui=configurationUI(f,1,{gpsAdapter:gps.adapter}),{step,page}=ui.enterStep("StepUbicacion");
 assert.deepEqual(gps.calls,[]);await nodes(page()).find(n=>n.type==="TextInput"&&n.props.placeholder==="biz_address_placeholder").props.onChangeText("");await turn();
 await button(page(),"biz_use_current_location").props.onPress();await turn();const address="Calle de prueba 12, Madrid, España";
 assert.equal(nodes(page()).find(n=>n.type==="TextInput"&&n.props.placeholder==="biz_address_placeholder").props.value,address);
 const input=nodes(page()).find(n=>n.type==="TextInput"&&n.props.placeholder==="biz_address_placeholder");input.props.onChangeText(address+", Local 2");await turn();ui.unmount(step.type);
 const restored=await f.make().load();assert.equal(restored.config.address,address+", Local 2");assert.deepEqual(plain(restored.config.coordinates),{latitude:40.4168,longitude:-3.7038});assert.deepEqual(gps.calls,["permission","position","address"]);assert.equal(ui.calls.external,0);
});

test("address resolution survives the location prompt remount without relying on the old screen instance",async()=>{
 const f=dataFixture();await configuredSalon(f);await f.store.updateConfig({address:""});let ui,step;
 const gps=nativeBusinessGPS(f,{onPermission:()=>ui.unmount(step.type)});ui=configurationUI(f,1,{gpsAdapter:gps.adapter});const opened=ui.enterStep("StepUbicacion");step=opened.step;
 await button(opened.page(),"biz_use_current_location").props.onPress();await turn();const restored=await f.make().load();assert.equal(restored.config.address,"Calle de prueba 12, Madrid, España");assert.deepEqual(plain(restored.config.coordinates),{latitude:40.4168,longitude:-3.7038});
});

test("unreliable DEMO lookup keeps coordinates and clearly requests manual address confirmation",async()=>{
 const f=dataFixture();await configuredSalon(f);await f.store.updateConfig({address:""});const gps=nativeBusinessGPS(f,{address:false}),ui=configurationUI(f,1,{gpsAdapter:gps.adapter}),{page}=ui.enterStep("StepUbicacion");
 await button(page(),"biz_use_current_location").props.onPress();await turn();assert.equal((await f.make().load()).config.address,"");assert.ok(text(page()).includes("confirma la dirección"));assert.ok(ui.alerts.some(alert=>String(alert[1]).includes("coordenadas quedan guardadas")));
});

test("denied native location permission leaves DEMO coordinates and address untouched",async()=>{
 const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot()),gps=nativeBusinessGPS(f,{permission:"denied"}),ui=configurationUI(f,1,{gpsAdapter:gps.adapter}),{page}=ui.enterStep("StepUbicacion");
 await button(page(),"biz_use_current_location").props.onPress();await turn();assert.deepEqual(plain(await f.make().load()),before);assert.deepEqual(gps.calls,["permission"]);assert.ok(ui.alerts.some(alert=>String(alert[0]).includes("Permiso")));
});

test("typing a manual address while the native lookup is pending is not overwritten",async()=>{
 const f=dataFixture();await configuredSalon(f);await f.store.updateConfig({address:""});let release;const waitForAddress=new Promise(resolve=>{release=resolve});
 const gps=nativeBusinessGPS(f,{waitForAddress}),ui=configurationUI(f,1,{gpsAdapter:gps.adapter}),{page}=ui.enterStep("StepUbicacion");const pending=button(page(),"biz_use_current_location").props.onPress();await turn();
 nodes(page()).find(n=>n.type==="TextInput"&&n.props.placeholder==="biz_address_placeholder").props.onChangeText("Dirección introducida manualmente");await turn();release();await pending;assert.equal((await f.make().load()).config.address,"Dirección introducida manualmente");
});

test("the floor review classifies only its selected ambiguous old element, keeping physical posts and history",async()=>{
 const f=dataFixture();await configuredSalon(f);const plan=plain(f.store.getSnapshot().plan),original=plain(plan.elements);plan.elements.push({...plan.elements[0],id:"old_unknown",label:"Profesional antiguo",demoStaffId:undefined,demoKind:undefined,demoArchived:undefined,x:350});await f.store.saveFloorPlan(plan);
 const ui=uiFixture(f),Floor=ui.load("components/booking/PlanoEmpresaScreen.tsx").PlanoEmpresaScreen,props={businessId:f.store.businessId,onClose(){},hideFAB:true};ui.render(Floor,props);await turn();
 let tree=ui.render(Floor,props);button(tree,"Revisar elementos antiguos").props.onPress();const options=ui.alerts.at(-1)[2];options.find(option=>option.text==="Profesional obsoleto").onPress();await turn();tree=ui.render(Floor,props);
 assert.equal(f.store.getSnapshot().plan.elements.find(element=>element.id==="old_unknown").demoArchived,true);assert.deepEqual(plain(f.store.getSnapshot().plan.elements.slice(0,4)),original);assert.ok(!text(tree).includes("Profesional antiguo"));assert.equal(ui.calls.liveFloor,0);assert.equal(ui.calls.external,0);
});

test("a late blur after deleting a focused professional never renames the following slot",async()=>{
 const f=dataFixture();await configuredSalon(f);const original=plain(f.store.getSnapshot().config.plantillaItems[0]),ui=configurationUI(f,4),{step,page}=ui.enterStep("StepEspacios");
 const tree=page(),input=nodes(tree).find(n=>n.type==="TextInput"&&n.props.placeholder==="biz_professional_name_ph");
 input.props.onChangeText("Borrador del profesional eliminado");page();
 const row=nodes(tree).find(n=>n.type==="View"&&n.children?.includes(input));assert.ok(row);row.children.filter(n=>n.type==="TouchableOpacity").at(-1).props.onPress();
 ui.alerts.at(-1)[2].find(option=>option.text==="biz_delete_slot").onPress();ui.alerts.at(-1)[2].find(option=>option.text==="biz_delete_slot").onPress();page();
 input.props.onBlur();page();ui.unmount(step.type);await turn();const restored=await f.make().load();
 assert.deepEqual(plain(restored.config.plantillaItems[0].staffNames),original.staffNames.slice(1));assert.deepEqual(plain(restored.config.plantillaItems[0].staffIds),original.staffIds.slice(1));
 assert.equal(restored.plan.elements.find(element=>element.demoStaffId===original.staffIds[0]).demoArchived,true);
});

test("the individual schedule editor writes the persisted professional ID after renaming",async()=>{
 const f=dataFixture();await configuredSalon(f);const original=plain(f.store.getSnapshot().config.plantillaItems[0]);
 await f.store.updateConfig({plantillaItems:[{...original,staffNames:["Nombre cambiado",...original.staffNames.slice(1)]}]});
 const ui=configurationUI(f,4),{page}=ui.enterStep("StepEspacios");page();const schedule=component(page(),"ProfessionalScheduleSection");assert.equal(schedule.props.staffId,original.staffIds[0]);
 let controls=ui.renderComponent(schedule.type,schedule.props);button(controls,"biz_schedule_colon").props.onPress();controls=ui.renderComponent(schedule.type,schedule.props);
 button(controls,"biz_custom_schedule").props.onPress();await turn();page();controls=ui.renderComponent(schedule.type,schedule.props);
 component(controls,"GoTimeField").props.onConfirm("10:00");await turn();const restored=await f.make().load();
 assert.equal(restored.config.staffSchedules[original.staffIds[0]].daySchedules["0"].shift1.from,"10:00");
 const staff=storeModule.getBusinessDemoProfessionals(restored.config,f.store.businessId);const date="2030-01-07";assert.equal(storeModule.getBusinessDemoShifts(restored.config,date,staff[0])[0].from,600);
});

test("the professional calendar filters IDs after rename, distinguishes equal names and preserves retired history",async()=>{
 const f=dataFixture();await configuredSalon(f);const repo=bookingRepositoryModule.createDemoBookingRepository(f.store,{now:()=>Date.parse("2030-01-07T08:00:00")});
 const people=await repo.getStaff(f.store.businessId),service=(await repo.getBookableItems(f.store.businessId))[0];
 for(const person of people.slice(0,2)){const held=await repo.createHold({businessId:f.store.businessId,bookableItemId:service.id,staffId:person.id,customerId:owner,startDatetime:"2030-01-07T10:00:00",endDatetime:"2030-01-07T10:30:00",unitsReserved:1,peopleCount:1});assert.equal(held.ok,true);assert.equal((await repo.claimSlot({...held.booking,status:"CONFIRMED",holdExpiresAt:undefined})).ok,true);}
 const item=plain(f.store.getSnapshot().config.plantillaItems[0]);await f.store.updateConfig({plantillaItems:[{...item,staffNames:["Mismo nombre","Mismo nombre",...item.staffNames.slice(2)]}]});
 const ui=uiFixture(f,{reactCompiler:true}),Provider=ui.load("contexts/GoBusinessConfigContext.tsx").GoBusinessPreviewProvider,Company=ui.load("components/booking/GoReservasConfigScreen.tsx").GoReservasDemoScreen,Customer=ui.load("components/booking/DemoCustomerCalendar.tsx").DemoCustomerCalendar,props={onClose(){},hideFAB:true};
 const render=()=>{ui.render(Provider);return ui.render(Company,props)};let tree=render();await turn();button(tree,"view_mode_calendario").props.onPress();tree=render();
 const pills=nodes(tree).filter(n=>n.type==="TouchableOpacity"&&text(n)==="Mismo nombre");assert.equal(pills.length,2);
 pills[0].props.onPress();assert.equal(component(render(),"AgendaBoard").props.goLog[0].staffId,people[0].id);assert.equal(component(render(),"AgendaBoard").props.goLog.length,1);
 pills[1].props.onPress();assert.equal(component(render(),"AgendaBoard").props.goLog[0].staffId,people[1].id);assert.equal(component(render(),"AgendaBoard").props.goLog.length,1);
 await f.store.updateConfig({plantillaItems:[{...item,staffNames:["Mismo nombre","Nuevo nombre segundo",...item.staffNames.slice(2)]}]});tree=render();assert.ok(button(tree,"Nuevo nombre segundo"));assert.equal(component(tree,"AgendaBoard").props.goLog[0].staffId,people[1].id);
 const updated=plain(f.store.getSnapshot().config.plantillaItems[0]);await f.store.updateConfig({plantillaItems:[{...updated,count:3,staffNames:updated.staffNames.filter((_,i)=>i!==1),staffIds:updated.staffIds.filter((_,i)=>i!==1),staffServices:updated.staffServices.filter((_,i)=>i!==1)}]});render();tree=render();assert.equal(button(tree,"Nuevo nombre segundo"),undefined);assert.equal(component(tree,"AgendaBoard").props.goLog.length,2);
 assert.equal(component(ui.render(Customer,{repository:repo,onPersonal(){}}),"AgendaBoard").props.goLog.length,2);assert.equal((await f.make().load()).bookings.length,2);assert.equal(ui.calls.liveAgenda,0);assert.equal(ui.calls.external,0);
});


test('selected business name appears in both wizard phases and a selected configured company opens its eight steps',async()=>{
 const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f);let tree=ui.render();
 assert.equal(text(nodes(tree).find(n=>n.props.testID==='config-business-name')),'GO PELUQUERIA');
 component(tree,'Step0Actividad').props.onSubConfirmed();tree=ui.render();assert.equal(text(nodes(tree).find(n=>n.props.testID==='config-business-name')),'GO PELUQUERIA');
 const selected=configurationUI(f);selected.props.startAtSteps=true;tree=selected.render();assert.ok(component(tree,'StepNombre'));assert.equal(component(tree,'Step0Actividad'),undefined);
});

test('return to My businesses awaits a focused professional name and specialties before changing company',async()=>{
 const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,4);let opened=0,saved;
 ui.props.onOpenCompanies=()=>{opened++;saved=plain(f.store.getSnapshot())};const {page}=ui.enterStep('StepEspacios');
 const write=f.storage.setItem;let release;const gate=new Promise(resolve=>release=resolve);f.storage.setItem=async(key,value)=>{await gate;await write(key,value)};
 button(page(),'biz_add_professional').props.onPress();const input=nodes(page()).filter(n=>n.props.placeholder==='biz_professional_name_ph').at(-1);input.props.onChangeText('Profesional antes de cambiar');
 nodes(page()).filter(n=>n.type==='TouchableOpacity'&&text(n)==='Servicio adicional').at(-1).props.onPress();
 const back=nodes(ui.render()).find(n=>n.props.testID==='config-company-list');back.props.onPress();back.props.onPress();await turn();assert.equal(opened,0);
 release();await turn();assert.equal(opened,1);assert.equal(saved.config.plantillaItems[0].staffNames[4],'Profesional antes de cambiar');assert.deepEqual(saved.config.plantillaItems[0].staffServices[4],['Servicio adicional']);
 const reopened=await f.make().load();assert.deepEqual(plain(reopened),saved);assert.equal(ui.calls.external,0);assert.equal(ui.calls.liveFloor,0);
});

test('a failed save keeps the company configuration open instead of proceeding to the business selector',async()=>{
 const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,3);let opened=0;ui.props.onOpenCompanies=()=>opened++;
 const {page}=ui.enterStep('StepServicios');f.failWrites(true);nodes(page()).find(n=>n.props.placeholder?.startsWith('biz_service_placeholder')).props.onChangeText('Cambio con fallo');await turn();
 nodes(ui.render()).find(n=>n.props.testID==='config-company-list').props.onPress();await turn();assert.equal(opened,0);assert.ok(component(ui.render(),'StepServicios'));assert.ok(ui.alerts.some(row=>String(row[1]).includes('storage failure')));f.failWrites(false);
});

test('DEMO selector reuses the wizard, changes its business key and lets it return to the named list',async()=>{
 const f=dataFixture();await configuredSalon(f);const ui=uiFixture(f),Panel=ui.load('components/empresa/EmpresaPanel.tsx').EmpresaPanel,props={visible:true,previewReadOnly:true,onClose(){}};
 ui.render(Panel,props);let tree=ui.render(Panel,props),manager=nodes(tree).find(n=>n.type==='DemoCompanyManager');assert.ok(manager);
 manager.props.onOpenConfiguration();tree=ui.render(Panel,props);let screen=component(tree,'EmpresaConfigScreen');assert.ok(screen);assert.equal(screen.props.startAtSteps,true);assert.ok(screen.props.key.includes(f.store.businessId));const firstKey=screen.props.key;
 screen.props.onOpenCompanies();tree=ui.render(Panel,props);manager=nodes(tree).find(n=>n.type==='DemoCompanyManager');assert.equal(manager.props.open,true);
 const next=storeModule.createBusinessDemoStore({ownerUserId:owner,companyId:'33333333-3333-4333-8333-333333333333',storage:f.storage,initialConfig:initial,canUse:()=>true});await next.load();f.store=next;manager.props.onOpenConfiguration();screen=component(ui.render(Panel,props),'EmpresaConfigScreen');assert.notEqual(screen.props.key,firstKey);assert.ok(screen.props.key.includes(next.businessId));
 assert.equal(ui.calls.liveAgenda,0);assert.equal(ui.calls.external,0);
});

test('enterprise modal handles keyboard once and hides/restores its floating navigation controls',async()=>{
 const f=dataFixture();await configuredSalon(f);const ui=uiFixture(f),Panel=ui.load('components/empresa/EmpresaPanel.tsx').EmpresaPanel,props={visible:true,previewReadOnly:true,initialModulo:'empresa_config',onClose(){}};
 ui.render(Panel,props);let tree=ui.render(Panel,props),frame=nodes(tree).find(n=>n.props.testID==='empresa-keyboard-frame');
 assert.equal(frame.type,'KeyboardAvoidingView');assert.equal(frame.props.enabled,true);assert.equal(frame.props.behavior,'padding');assert.equal(frame.props.keyboardVerticalOffset,0);
 assert.equal(component(tree,'EmpresaConfigScreen').props.keyboardManagedByParent,true);assert.ok(nodes(tree).some(n=>n.props.accessibilityLabel==='biz_panel_close'));
 ui.emitKeyboard('keyboardWillShow');tree=ui.render(Panel,props);assert.equal(nodes(tree).some(n=>n.props.accessibilityLabel==='biz_panel_close'),false);assert.equal(nodes(tree).some(n=>n.props.accessibilityLabel==='biz_panel_back'),false);
 ui.emitKeyboard('keyboardWillHide');tree=ui.render(Panel,props);assert.ok(nodes(tree).some(n=>n.props.accessibilityLabel==='biz_panel_close'));assert.ok(nodes(tree).some(n=>n.props.accessibilityLabel==='biz_panel_back'));
});

test('Name and Location keep the scrollable form and tappable Next outside it with the keyboard open',async()=>{
 for(const [index,name] of [[0,'StepNombre'],[1,'StepUbicacion']]){
  const f=dataFixture();await configuredSalon(f);const ui=configurationUI(f,index);ui.props.keyboardManagedByParent=true;ui.enterStep(name);let tree=ui.render();
  const scroll=nodes(tree).find(n=>n.type==='ScrollView'&&n.props.ref);scroll.props.onScroll({nativeEvent:{contentOffset:{y:100}}});ui.emitKeyboard('keyboardWillShow');tree=ui.render();
  assert.equal(tree.type,'KeyboardAvoidingView');assert.equal(tree.props.enabled,false,'The outer enterprise modal already adjusts the keyboard');
  assert.equal(scroll.props.keyboardShouldPersistTaps,'handled');const next=button(tree,'biz_next');assert.equal(typeof next.props.onPress,'function');
  assert.equal(nodes(scroll).includes(next),false,'Next stays in the footer outside the scrollable form');ui.emitKeyboard('keyboardWillHide');assert.ok(button(ui.render(),'biz_next'));
 }
});

test('guided addition follows the last professional, scrolls/focuses its stable input and prevents rapid/unfinished duplicate cards',async()=>{
 const f=dataFixture();await configuredSalon(f);const before=plain(f.store.getSnapshot().plan),ui=configurationUI(f,4),{step,page}=ui.enterStep('StepEspacios');
 const scrolled=[],focused=[],content={nativeContent:true};let tree=ui.render();nodes(tree).find(n=>n.type==='ScrollView'&&n.props.ref).props.ref.current={scrollTo:value=>scrolled.push(value)};
 nodes(tree).find(n=>n.props.testID==='config-scroll-content').props.ref.current=content;
 for(const name of ['Profesional guiado uno','Profesional guiado dos']){
  const currentPage=page(),currentNodes=nodes(currentPage),add=currentNodes.find(n=>n.props.testID==='add-professional');assert.ok(currentNodes.indexOf(add)>currentNodes.findLastIndex(n=>n.props.placeholder==='biz_professional_name_ph'));
  add.props.onPress();add.props.onPress();tree=page();const input=nodes(tree).filter(n=>n.props.placeholder==='biz_professional_name_ph').at(-1),id=input.props.testID;
  let inputFocused=false;const nativeInput={focus:()=>{inputFocused=true;focused.push(id)},isFocused:()=>inputFocused,measureLayout:(parent,callback)=>{assert.equal(parent,content);callback(0,800,200,40)}};input.props.ref(nativeInput);input.props.onLayout();assert.equal(focused.at(-1),id);assert.equal(scrolled.at(-1).y,776);
  const count=nodes(page()).filter(n=>n.props.placeholder==='biz_professional_name_ph').length;await turn();button(page(),'biz_add_professional').props.onPress();page();assert.equal(nodes(page()).filter(n=>n.props.placeholder==='biz_professional_name_ph').length,count,'Blank new card is re-used');
  ui.emitKeyboard('keyboardDidShow');assert.equal(scrolled.at(-1).y,776);inputFocused=false;const scrollsBefore=scrolled.length;ui.emitKeyboard('keyboardDidShow');assert.equal(scrolled.length,scrollsBefore,'Opening another input must not scroll back to the added professional');input.props.onChangeText(name);input.props.onSubmitEditing();await turn();
  nodes(page()).filter(n=>n.type==='TouchableOpacity'&&text(n)==='Servicio adicional').at(-1).props.onPress();await turn();
 }
 ui.unmount(step.type);await turn();const restored=await f.make().load();assert.equal(restored.config.plantillaItems[0].count,6);assert.deepEqual(plain(restored.config.plantillaItems[0].staffNames.slice(-2)),['Profesional guiado uno','Profesional guiado dos']);
 assert.equal(new Set(restored.config.plantillaItems[0].staffIds).size,6);assert.deepEqual(plain(restored.config.plantillaItems[0].staffServices.slice(-2)),[['Servicio adicional'],['Servicio adicional']]);assert.deepEqual(plain(restored.plan.elements.slice(0,4)),before.elements.slice(0,4));assert.equal(ui.calls.external,0);
});

test('the first professional in an empty business is created only once and keeps its name on reopen',async()=>{
 const f=dataFixture();await f.store.updateConfig({businessName:'Negocio vacío',sectorId:'belleza',subId:'peluqueria',plantillaItems:[]});const ui=configurationUI(f,4),{step,page}=ui.enterStep('StepEspacios');
 const add=button(page(),'biz_add_professional');add.props.onPress();add.props.onPress();let names=nodes(page()).filter(n=>n.props.placeholder==='biz_professional_name_ph');assert.equal(names.length,1);names[0].props.onChangeText('Primera persona');ui.unmount(step.type);await turn();
 const restored=await f.make().load();assert.equal(restored.config.plantillaItems.length,1);assert.equal(restored.config.plantillaItems[0].count,1);assert.equal(restored.config.plantillaItems[0].staffNames[0],'Primera persona');
});


test('configuration navigation survives the actual company-panel remount without removing its isolation key',async()=>{
 const root=source('app/index.tsx');assert.match(root,/const \[empresaDemoRoute, setEmpresaDemoRoute\]/);assert.match(root,/key=\{ownerDemo\.demo\?\.businessId\}[\s\S]*initialModulo=\{empresaDemoRoute === "configuration" \? "empresa_config" : empresaDemoRoute === "reservations" \? "reservas_config" : "home"\}/);assert.match(root,/onDemoNavigate=\{setEmpresaDemoRoute\}/);
 const f=dataFixture();await configuredSalon(f);const ui=uiFixture(f),Panel=ui.load('components/empresa/EmpresaPanel.tsx').EmpresaPanel;let route='home';
 const props=()=>({visible:true,previewReadOnly:true,initialModulo:route==='configuration'?'empresa_config':'home',initialCompaniesOpen:route==='companies',onDemoNavigate:value=>route=value,onClose(){}});
 ui.render(Panel,props());let tree=ui.render(Panel,props());const opening=nodes(tree).find(n=>n.type==='DemoCompanyManager').props.onOpenConfiguration;
 ui.unmount(Panel);f.store=storeModule.createBusinessDemoStore({ownerUserId:owner,companyId:'44444444-4444-4444-8444-444444444444',storage:f.storage,initialConfig:initial,canUse:()=>true});await f.store.load();await configuredSalon(f);
 opening();assert.equal(route,'configuration');ui.render(Panel,props());tree=ui.render(Panel,props());const wizard=component(tree,'EmpresaConfigScreen');assert.ok(wizard);assert.equal(wizard.props.startAtSteps,true);assert.ok(wizard.props.key.includes(f.store.businessId));
 wizard.props.onOpenCompanies();assert.equal(route,'companies');tree=ui.render(Panel,props());assert.equal(nodes(tree).find(n=>n.type==='DemoCompanyManager').props.open,true);assert.equal(ui.calls.external,0);
});

test("a fixed clock preserves future reservation tests without permitting past bookings",async()=>{
 const f=dataFixture();await f.store.updateConfig({openFrom:"06:00",openTo:"20:00"});await f.store.saveFloorPlan(floor(f.store));
 await assert.rejects(f.store.saveReservations(f.store.planId,[{...reservation(f.store),date:"12/10/2026",dateISO:"2026-10-12",time:"07:00"}]),/hora futura/);
 assert.equal(f.store.getSnapshot().reservations.length,0);
 await f.store.saveReservations(f.store.planId,[reservation(f.store)]);assert.equal(f.store.getSnapshot().reservations.length,1);
});
