import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
const require = createRequire(import.meta.url);
const ts = require("typescript");
function load(file, modules, globals = {}) {
  const context = { exports: {}, console, Date, Error, setTimeout, clearTimeout, ...globals,
    require(name) { if (name in modules) return modules[name]; throw Error("Unexpected " + name); } };
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React }
  }).outputText, context);
  return context.exports;
}
const model = load("../../lib/api-zod/src/booking-assistant.ts", { zod: require("zod") });
const cieza = { label: "Cieza, Murcia", latitude: 38.24, longitude: -1.41 };
function fixture(resolvePlaces = async () => [cieza], location = {}) {
  const values = [], effects = [], timers = new Map(), saved = new Map();
  let cursor = 0, timerId = 0;
  const hooks = {
    useRef(value) { const i = cursor++; return values[i] ??= { current: value }; },
    useState(value) { const i = cursor++; if (!(i in values)) values[i] = typeof value === "function" ? value() : value;
      return [values[i], value => { values[i] = typeof value === "function" ? value(values[i]) : value; }]; },
    useEffect(fn, deps) { const i = cursor++, old = values[i];
      if (!old || deps.some((d, k) => !Object.is(d, old.deps[k]))) {
        old?.cleanup?.(); const record = { deps }; values[i] = record;
        effects.push(() => { record.cleanup = fn(); });
      }
    },
  };
  const api = load("hooks/useBookingAssistant.ts", {
    react: hooks, "@workspace/api-zod": model, "@/data/booking": {},
    "@/lib/bookingAssistant": { resolvePlaces }, "expo-location": location,
    "@react-native-async-storage/async-storage": { default: { setItem: async (k,v) => saved.set(k,v) } }
  }, { setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); } });
  return { saved, render() { cursor = 0; const a = api.useBookingAssistant(); effects.splice(0).forEach(fn => fn()); return a; },
    async tick() { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach(fn => fn()); await new Promise(setImmediate); }, timers };
}
test("typing debounces real resolver calls and exposes selectable results", async () => {
  const calls = [], f = fixture(async q => { calls.push(q); return [cieza]; });
  f.render().setPanel("zone"); f.render().setPlaceQuery("Ci"); f.render();
  f.render().setPlaceQuery("Cieza"); f.render();
  assert.equal(calls.length, 0); await f.tick();
  assert.deepEqual(calls, ["Cieza"]); assert.equal(f.render().places[0].label, cieza.label);
  f.render().pickPlace(cieza); const selected = f.render();
  assert.equal(selected.placeText, cieza.label); assert.equal(selected.zone, null);
  assert.equal(selected.pendingPlace.latitude, cieza.latitude); assert.match(selected.placeNotice, /Aplicar/);
  await f.tick(); assert.equal(calls.length, 1);
});
test("manual search shows loading, empty and failure states without invented results", async () => {
  let finish; const f = fixture(() => new Promise(r => finish = r));
  const pending = f.render().searchPlaces("Cieza"); assert.equal(f.render().placeBusy, true);
  finish([]); await pending; assert.match(f.render().placeNotice, /No se encontraron/);
  assert.equal(f.render().placeBusy, false);
  const error = fixture(async () => { throw Error("Servidor no disponible"); });
  await error.render().searchPlaces("Cieza"); assert.match(error.render().placeNotice, /Servidor/);
  assert.equal(error.render().places.length, 0);
  await error.render().searchPlaces("C"); assert.match(error.render().placeNotice, /dos caracteres/);
});
test("late search responses cannot overwrite a newer query or a closed panel", async () => {
  const pending = [], f = fixture(q => new Promise(r => pending.push({ q, r })));
  const old = f.render().searchPlaces("Cieza");
  f.render().setPlaceQuery("Madrid"); const next = f.render().searchPlaces("Madrid");
  pending[1].r([{ ...cieza, label: "Madrid" }]); await next;
  pending[0].r([cieza]); await old; assert.equal(f.render().places[0].label, "Madrid");
  const closing = f.render().searchPlaces("Valencia"); f.render().invalidate();
  pending[2].r([cieza]); await closing; assert.equal(f.render().places.length, 0);
});
test("selection applies existing zone with radius and uses the original persistence key", async () => {
  const f = fixture(); f.render().pickPlace(cieza); f.render().setRadiusText("3,5");
  f.render().setSaveZone(true); const a = f.render(); await a.chooseZone(a.pendingPlace, a.pendingPlace.source);
  assert.equal(f.render().zone.radiusKm, 3.5); assert.equal(f.render().request.placeQuery, cieza.label);
  assert.equal(JSON.parse(f.saved.get("go_booking_assistant_zone_v1")).latitude, cieza.latitude);
  assert.equal(f.saved.size, 1);
});
function gpsFixture(overrides = {}) { return fixture(undefined, {
  getForegroundPermissionsAsync: async () => ({ granted: true }),
  getLastKnownPositionAsync: async () => ({ coords: cieza }),
  reverseGeocodeAsync: async () => [{ city: "Cieza", postalCode: "30530", country: "España" }],
  ...overrides,
}); }
test("GPS updates visible selection, preserves GPS origin and resolves a real address", async () => {
  const f = gpsFixture(); const gps = await f.render().gpsZone(true);
  assert.match(gps.label, /30530, Cieza/); f.render().pickPlace(gps, "gps");
  assert.equal(f.render().pendingPlace.source, "gps"); assert.equal(f.render().placeText, gps.label);
  assert.equal(f.render().zone, null); const a = f.render(); await a.chooseZone(a.pendingPlace, a.pendingPlace.source);
  assert.equal(f.render().zone.source, "gps");
});
test("GPS denial, invalid coordinates and reverse failure never invent an address", async () => {
  const denied = gpsFixture({ getForegroundPermissionsAsync: async () => ({ granted: false }),
    requestForegroundPermissionsAsync: async () => ({ granted: false }) });
  assert.equal(await denied.render().gpsZone(true), null);
  const invalid = gpsFixture({ getLastKnownPositionAsync: async () => ({ coords: { latitude: 999, longitude: 1 } }) });
  await assert.rejects(invalid.render().gpsZone(true), /coordenadas válidas/);
  const reverse = gpsFixture({ reverseGeocodeAsync: async () => { throw Error("offline"); } });
  const gps = await reverse.render().gpsZone(true); assert.match(gps.label, /^GPS: 38/);
  reverse.render().pickPlace(gps, "gps"); assert.match(reverse.render().placeNotice, /No se pudo resolver/);
});
test("Tools and IA share one saved dock preference across remounts and serialized writes", async () => {
  const saved = new Map(), storage = { getItem: async k => saved.get(k) ?? null, setItem: async (k,v) => saved.set(k,v) };
  let listener;
  const hooks = { useEffect() {}, useSyncExternalStore(subscribe, get) { listener = subscribe(() => {}); return get(); } };
  const create = () => load("hooks/useGoDockPreference.ts", { react: hooks,
    "@react-native-async-storage/async-storage": { default: storage } });
  let api = create(); await api.readGoDockPreference();
  await api.writeGoDockPreference("center", "right"); assert.equal(api.useGoDockPreference("right", true).position, "center");
  listener(); api = create(); await api.readGoDockPreference();
  assert.equal(api.useGoDockPreference("right", true).position, "center");
  await Promise.all([api.writeGoDockPreference("left", "left"), api.writeGoDockPreference("right", "right")]);
  assert.equal(JSON.parse(saved.get(api.GO_DOCK_KEY)).position, "right"); assert.equal(saved.size, 1);
});
test("voice and explicit search survive cleanup of the previous typing debounce", async () => {
  let finish; const f = fixture(() => new Promise(r => finish = r));
  f.render().setPanel("zone"); f.render().setPlaceQuery("Madrid"); f.render();
  f.render().setPlaceQuery("Cieza"); const request = f.render().searchPlaces("Cieza");
  f.render(); finish([cieza]); await request;
  assert.equal(f.render().places[0].label, cieza.label);
});
const React = { createElement(type, props, ...children) { return { type, props: { ...props, children } }; } };
const native = { Platform: { OS: "ios" }, StyleSheet: { create: x => x, absoluteFill: {} }, useWindowDimensions: () => ({ width: 390, height: 844 }) };
for (const name of ["View", "Text", "ScrollView", "TouchableOpacity", "TextInput", "Modal", "Image", "KeyboardAvoidingView", "ActivityIndicator"]) native[name] = name;
const reactModule = { default: React, useState: v => [v, () => {}], useRef: v => ({ current: v }), useEffect() {} };
const ui = load("components/booking-assistant/BookingAssistantUI.tsx", { react: reactModule, "react-native": native, "@expo/vector-icons": { Feather: "Feather" } });
const close = load("components/ui/GoCloseButton.tsx", { react: reactModule, "react-native": native, "@expo/vector-icons": { Feather: "Feather" } });
const controls = load("components/booking-assistant/AssistantCloseControls.tsx", {
  react: reactModule, "react-native": native, "@/components/DraggableFAB": { DraggableFAB: "DraggableFAB" }, "@/components/ui/GoCloseButton": close
});
const panels = load("components/booking-assistant/BookingAssistantPanels.tsx", {
  react: reactModule, "react-native": native, "./AssistantCloseControls": controls, "./BookingAssistantUI": ui,
  "@/hooks/useGoActions": { GO_TASK_CREATION_ONLY: true }
});
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (typeof tree.type === "function") return nodes(tree.type(tree.props));
  return [tree, ...nodes(tree.props?.children)];
}
function screenFixture(panel = null, size = "estandar", position = "right") {
  const f = fixture(); f.render().setPanel(panel); const a = f.render();
  const starts = [], closed = [];
  const voice = { status: "idle", error: "", transcript: "", abort() {}, start: async zone => starts.push(zone), stop: async () => {} };
  const api = load("components/booking-assistant/BookingAssistantScreen.tsx", {
    react: reactModule, "react-native": native, "react-native-gesture-handler": { GestureHandlerRootView: "GestureHandlerRootView" },
    "./AssistantCloseControls": controls, "@/hooks/useGoDockPreference": { useGoDockPreference: () => ({ position }) },
    "@expo/vector-icons": { Feather: "Feather" }, "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 47, bottom: 34 }) },
    "@react-native-async-storage/async-storage": { default: {} }, "expo-image-picker": {}, "expo-document-picker": {}, "expo-status-bar": { StatusBar: "StatusBar" },
    "@workspace/api-zod": model, "@/lib/bookingAssistant": {}, "@/hooks/useBookingAssistant": { useBookingAssistant: () => a },
    "@/hooks/useGoActions": { useGoActions: () => ({ active: "task", choices: [], manager: { state: null } }) },
    "@/hooks/useBookingVoice": { useBookingVoice: () => voice }, "./BookingAssistantPanels": panels, "./BookingAssistantUI": ui,
  });
  const tree = api.BookingAssistantScreen({ visible: true, onClose: () => closed.push(true), uiScale: size });
  return { tree, all: nodes(tree), starts, closed, a };
}
test("the same GO appears once, remains circular at every size and routes zone dictation", async () => {
  for (const panel of [null, "zone"]) for (const size of ["compacto", "estandar", "grande"]) {
    const f = screenFixture(panel, size); const buttons = f.all.filter(n => n.props?.accessibilityLabel === "Escuchar con GO");
    assert.equal(buttons.length, 1);
    const style = Object.assign({}, ...buttons[0].props.style.filter(Boolean));
    assert.equal(style.width, style.height); assert.equal(style.minHeight, style.height);
    assert.equal(style.borderRadius, style.width / 2); assert.equal(style.flexGrow, 0); assert.equal(style.flexShrink, 0);
    await buttons[0].props.onPress(); assert.deepEqual(f.starts, [panel === "zone"]);
    assert.ok(f.all.some(n => n.type === "Feather" && n.props.name === "zap"));
  }
});
test("panel and container reuse one floating close without an additional footer row", () => {
  for (const panel of [null, "zone"]) {
    const f = screenFixture(panel);
    assert.equal(f.all.filter(n => n.props?.accessibilityLabel === (panel ? "Cerrar panel" : "Ir al Landing") && n.type === "TouchableOpacity" && n.props.style?.width === 44).length, 1);
    assert.ok(f.all.some(n => n.type === "KeyboardAvoidingView" && n.props.behavior === "padding"));
    const draggable = f.all.find(n => n.type === "DraggableFAB");
    assert.ok(draggable.props.bounds.height > 60); assert.equal(draggable.props.maxH, 44);
    assert.ok(!f.all.some(n => n.type === "Feather" && (n.props.name === "x" || n.props.name === "sliders")));
    const button = f.all.find(n => n.type === "TouchableOpacity" && n.props.style?.width === 44);
    let stopped = false; button.props.onPress({ stopPropagation() { stopped = true; } }); assert.equal(stopped, true);
    if (!panel) assert.equal(f.closed.length, 1);
  }
});
test("zone uses Tools colors and exposes one existing microphone without a second voice action", () => {
  const f = screenFixture("zone");
  const input = f.all.find(n => n.type === "TextInput" && n.props.accessibilityLabel === "Centro de búsqueda");
  assert.equal(input.props.style.color, "#111827"); assert.equal(input.props.style.fontFamily, "Inter_400Regular");
  assert.ok(!JSON.stringify(f.tree).includes("Decir el lugar por voz"));
  assert.equal(ui.z.primary.backgroundColor, "#4A80BD");
});
function httpFixture(env = {}, fetch = async () => ({ status: 200, ok: true, json: async () => [cieza] }), diagnostics = []) {
  return load("lib/bookingAssistant.ts", {
    "react-native": { Platform: { OS: "ios" } }, "@workspace/api-zod": model, "@/data/booking": {},
    "./goLogBridge": {}, "@/data/goSearchAliases": {},
    "@react-native-async-storage/async-storage": { default: { getItem: async () => null } }
  }, { process: { env }, fetch, AbortSignal, Headers, console: { info: (...args) => diagnostics.push(args) } });
}
test("Expo Go without an absolute API URL explains the missing configuration without fetching", async () => {
  let calls = 0; const api = httpFixture({}, async () => { calls++; });
  await assert.rejects(api.resolvePlaces("Cieza"), /No he podido buscar/); assert.equal(calls, 0);
});
test("missing backend route and connection failure report different honest errors", async () => {
  const env = { EXPO_PUBLIC_API_URL: "https://example.test/api" };
  await assert.rejects(httpFixture(env, async () => ({ status: 404 })).resolvePlaces("Cieza"), /No he podido buscar/);
  await assert.rejects(httpFixture(env, async () => { throw Error("offline"); }).resolvePlaces("Cieza"), /No he podido buscar/);
});
test("configured lookup calls the existing backend route and returns its real coordinates", async () => {
  let url; const api = httpFixture({ EXPO_PUBLIC_API_URL: "https://example.test/api" }, async value => {
    url = value; return { status: 200, ok: true, json: async () => [cieza] };
  });
  const result = await api.resolvePlaces("Cieza");
  assert.equal(url, "https://example.test/api/booking-assistant/places?q=Cieza");
  assert.equal(result[0].longitude, cieza.longitude);
});
test("public API failures never expose configuration, server bodies, paths, URLs or credentials", async () => {
  const diagnostics = [], sensitive = "EXPO_PUBLIC_API_URL https://private.example/api C:\\Users\\person\\keys token=secret";
  const scenarios = [
    httpFixture({}, undefined, diagnostics),
    httpFixture({ EXPO_PUBLIC_API_URL: "https://private.example/api" }, async () => ({ ok: false, status: 500, json: async () => ({ error: sensitive }) }), diagnostics),
    httpFixture({ EXPO_PUBLIC_API_URL: "https://private.example/api" }, async () => { throw Error(sensitive); }, diagnostics),
    httpFixture({ EXPO_PUBLIC_API_URL: "https://private.example/api" }, async () => ({ ok: true, status: 200, json: async () => { throw Error(sensitive); } }), diagnostics),
    httpFixture({ EXPO_PUBLIC_API_URL: "https://private.example/api" }, async () => ({ ok: true, status: 200, json: async () => ({ error: sensitive }) }), diagnostics),
  ];
  for (const api of scenarios) await assert.rejects(api.resolvePlaces("private search"), error => {
    assert.match(error.message, /No he podido buscar/);
    assert.doesNotMatch(error.message, /EXPO_|https?:|Users|secret|private|HTTP|API/); return true;
  });
  const logged = JSON.stringify(diagnostics);
  assert.match(logged, /API_URL_MISSING/); assert.match(logged, /HTTP_FAILURE/);
  assert.doesNotMatch(logged, /https?:|Users|secret|private|EXPO_PUBLIC/);
});
test("floating overlay stays above essential controls as keyboard and footer heights change", () => {
  for (const height of [700, 350]) {
    const tree = controls.AssistantCloseControls({ disabled: false, onClose() {}, viewport: { width: 390, height }, protectedBottom: 144 });
    assert.equal(tree.props.style.position, "absolute"); assert.equal(tree.props.pointerEvents, "box-none");
    const drag = tree.props.children[0]; assert.equal(drag.props.bounds.height, height - 144);
    assert.equal(drag.props.initialBottom, 12); assert.equal(drag.props.buttonKey, "close");
  }
  assert.equal(controls.AssistantCloseControls({ disabled: false, onClose() {}, viewport: { width: 390, height: 180 }, protectedBottom: 144 }), null);
});