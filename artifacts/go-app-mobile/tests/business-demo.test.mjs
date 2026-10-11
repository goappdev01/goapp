import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
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
function loadPure(name, imports = {}) {
  const exports = {};
  vm.runInNewContext(compile(name), { exports, require: key => {
    if (key in imports) return imports[key];
    throw new Error("Unexpected runtime dependency: " + key);
  }, console, Set, Map });
  return exports;
}
const storeModule = loadPure("data/businessDemoStore.ts");
const bookingRepositoryModule = loadPure("data/demoBookingRepository.ts", { "./businessDemoStore": storeModule });
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
const reservation = store => ({ id: "demo-reservation", planId: store.planId, elementId: "demo-space",
  customerName: "Cliente de prueba", date: "12/10/2026", dateISO: "2026-10-12", time: "12:00",
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
  assert.equal(doc.entries.length, 1); assert.equal(doc.entries[0].dateISO, "2026-10-12");
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
function uiFixture(data, { authorized = true, reactCompiler = false, bookingToday } = {}) {
  const cache = new Map(), hooks = new Map(), alerts = [], calls = { liveAgenda: 0, liveFloor: 0, external: 0 };
  let current, cursor = 0, effects = [], lang = "es";
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
    AppState: { currentState: "active" }, Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
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
    "expo-location": { Accuracy: { Balanced: 3 }, requestForegroundPermissionsAsync: async () => ({ status: "denied" }), getCurrentPositionAsync: external, reverseGeocodeAsync: external },
    "expo-image-picker": new Proxy({}, { get: () => external }),
    "expo-document-picker": new Proxy({}, { get: () => external }),
    "expo-clipboard": new Proxy({}, { get: () => external }),
    "react-native-qrcode-svg": { default: "QRCode" },
  };
  native.Share = { share: external };
  function load(name) {
    if (cache.has(name)) return cache.get(name);
    const exports = {}; cache.set(name,exports);
    vm.runInNewContext(compile(name, reactCompiler && ["contexts/GoBusinessConfigContext.tsx", "components/booking/GoReservasConfigScreen.tsx"].includes(name)), { exports, console, Date, Set, Map, setTimeout: () => 1, clearTimeout() {},
      setInterval: () => 1, clearInterval() {}, require(key) {
        if (key in imports) return imports[key];
        if (key === "@/data/floorPlan") {
          const module = load("data/floorPlan.ts");
          return { ...module, loadFloorPlan: external, saveFloorPlan: external, loadReservations: external, saveReservations: external };
        }
        if (key.startsWith("@/data/")) return load(key.replace("@/","") + ".ts");
        if (key === "@/utils/countryConfig") return load("utils/countryConfig.ts");
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
  return { load, render, alerts, calls, configApi, setLanguage(value) { lang = value; } };
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


test("complete DEMO booking reaches its final screen and updates both real calendar callbacks, reload and cancellation", async () => {
  const f = dataFixture();
  await f.store.updateConfig({ businessName: "GO PELUQUERÍA", sectorId: "belleza", subId: "peluqueria", address: "Calle de prueba", phone: "912345678",
    activeDays: [0,1,2,3,4], services: [{ name: "Corte de prueba", duration: 30, price: 12 }],
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
