import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { modulePublicationPolicy, loadModulePublicationHook } from "./helpers/module-publication-fixture.mjs";

// Execute the production components and booking HTTP adapter. Native rendering,
// hooks and the HTTP transport are deterministic; availability is never rebuilt
// in this fixture, and no network/device/real account is used.
const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");
const source = file => ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: { esModuleInterop: false, alwaysStrict: false,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
const user = "11111111-1111-4111-8111-111111111111";
const business = "22222222-2222-4222-8222-222222222222";
const otherBusiness = "22222222-2222-4222-8222-222222222223";
const firstService = "33333333-3333-4333-8333-333333333333";
const secondService = "44444444-4444-4444-8444-444444444444";
const firstStaff = "55555555-5555-4555-8555-555555555555";
const secondStaff = "66666666-6666-4666-8666-666666666666";
const bookingId = "77777777-7777-4777-8777-777777777777";
const today = "2030-10-27";
const tomorrow = "2030-10-28";
const fixedNow = Date.parse("2030-10-27T00:00:00.000Z");
class Clock extends Date {
  constructor(...args) { super(...(args.length ? args : [fixedNow])); }
  static now() { return fixedNow; }
}
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
function loadPure(file) {
  const scope = { exports: {}, Date: Clock, Intl };
  vm.runInNewContext(source(file), scope);
  return scope.exports;
}
const timeline = loadPure("data/bookingTimeline.ts");
const services = loadPure("data/bookingServices.ts");
function planFor({ date = today, staffId = firstStaff, serviceId = firstService, fold = 1 } = {}) {
  const start = date === today ? `${date}T0${fold}:37:00.000Z` : `${date}T10:37:00.000Z`;
  const minutes = serviceId === firstService ? 13 : 27;
  const end = new Date(Date.parse(start) + minutes * 60000).toISOString();
  return { version: 1, phasePolicyVersion:1, gapPolicy:{version:1,professionals:[{staffId,minimumMinutes:13,exceptionUsed:false,lastMinuteMinutes:1440}]}, staffId, startsAt: start, endsAt: end, timezone: "Europe/Madrid",
    totalClientMinutes: minutes, totalDurationMinutes: minutes, workMinutes: minutes, waitMinutes: 0,
    serviceIds: [serviceId], serviceDetails: [{ id: serviceId, title: serviceId === firstService ? "Corte exacto" : "Lavado exacto", durationMinutes: minutes, price: 12, currency: "EUR" }],
    totalPrice: 12, currency: "EUR", resourcesConfigured: false,
    phases: [{ id: "continuous", name: "Trabajo", serviceId, kind: "work", durationMinutes: minutes, offsetMinutes: 0,
      staffId, startsAt: start, endsAt: end, resources: [] }],
    workIntervals: [{ startsAt: start, endsAt: end, staffId, serviceId }], resourceIntervals: [] };
}
const remoteBusiness = (id, name) => ({ id, name, address: "Calle de prueba", timezone: "Europe/Madrid",
  booking_enabled: true, verified: true, ui_metadata: { category: "peluqueria", bookingColor: "#4A80BD" } });
const remoteService = (id, title, businessId = business) => ({ id, business_id: businessId, name: title,
  duration_minutes: id === firstService ? 13 : 27, price: 12, currency: "EUR", active: true,
  ui_metadata: { visible: true, customerCapacity: 1, unitQuantity: 1 } });
const remoteStaff = (id, name, businessId = business) => ({ id, business_id: businessId, display_name: name,
  active: true, ui_metadata: { serviceIds: [firstService, secondService] } });

function fixture(kind = "provider", overrides = {}) {
  const calls = [], alerts = [], commands = new Map(), writes = [], navigation = [];
  const state = {
    services: new Map([[business, [remoteService(firstService, "Corte exacto"), remoteService(secondService, "Lavado exacto")]],
      [otherBusiness, [remoteService(secondService, "Servicio del segundo negocio", otherBusiness)]]]),
    staff: new Map([[business, [remoteStaff(firstStaff, "Ana"), remoteStaff(secondStaff, "Bea")]],
      [otherBusiness, [remoteStaff(secondStaff, "Profesional segundo", otherBusiness)]]]),
    pendingServices: new Map(), pendingStaff: new Map(), pendingSlots: null,
    foldOptions: false, loseReplyOnce: false, ...overrides,
  };
  class ScenarioClock extends Clock {
    constructor(...args){ super(...(args.length?args:[state.now ?? fixedNow])); }
    static now(){ return state.now ?? fixedNow; }
  }
  const memory = new Map([["go_bookings_v1", "[]"], ["go_log_v1", "[]"], ["go_bookable_items_v1", "[]"]]);
  const storage = { getItem: async key => memory.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); memory.set(key, value); } };
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, body, init });
    const publicCatalogue = /\/(businesses|services|staff)$/.test(parsed.pathname);
    assert.equal(new Headers(init.headers).get("Authorization"), publicCatalogue ? null : "Bearer test-only");
    const selectedBusiness = parsed.searchParams.get("business_id") ?? business;
    if (parsed.pathname.endsWith("/businesses")) return Response.json([
      remoteBusiness(business, "Peluquería primera"), remoteBusiness(otherBusiness, "Peluquería segunda"),
    ]);
    if (parsed.pathname.endsWith("/services")) {
      if (state.pendingServices.has(selectedBusiness)) return Response.json(await state.pendingServices.get(selectedBusiness).promise);
      return Response.json(state.services.get(selectedBusiness) ?? []);
    }
    if (parsed.pathname.endsWith("/staff")) {
      if (state.pendingStaff.has(selectedBusiness)) return Response.json(await state.pendingStaff.get(selectedBusiness).promise);
      return Response.json(state.staff.get(selectedBusiness) ?? []);
    }
    if (parsed.pathname.endsWith("/booking-gap-policy"))return Response.json(1);
    if (parsed.pathname.endsWith("/booking-phase-policy"))return Response.json(1);
    if (parsed.pathname.endsWith("/booking-availability")) {
      if (state.availabilityError) return Response.json({error: "Disponibilidad no verificada"}, {status: state.availabilityError});
      if (parsed.searchParams.get("datesOnly") === "true") return Response.json({ version: 1, phasePolicyVersion:1, gapPolicyVersion:1, timezone: "Europe/Madrid",
        availableDates: state.availableDates ?? [today, tomorrow, "2030-10-29"], slots: [] });
      const unassignedRequest=calls.filter(call=>call.url.pathname.endsWith('/booking-availability')&&call.url.searchParams.get('datesOnly')!=='true'&&!call.url.searchParams.has('staff_id')).length;
      const parameters = { date: parsed.searchParams.get("dateISO"), staffId: parsed.searchParams.get("staff_id") ?? (state.rotateUnassignedStaff && unassignedRequest%2===0?secondStaff:firstStaff),
        serviceId: parsed.searchParams.get("service_ids").split(",")[0] };
      const plans = state.plans ?? (state.pendingSlots ? await state.pendingSlots.promise : state.foldOptions && parameters.date === today
        ? [planFor({ ...parameters, fold: 0 }), planFor({ ...parameters, fold: 1 })] : [planFor(parameters)]);
      return Response.json({ version: 1, phasePolicyVersion:1, gapPolicyVersion:1, timezone: "Europe/Madrid", availableDates: [parameters.date], slots: plans });
    }
    if (parsed.pathname.endsWith("/booking-discounts/prices")) {
      return state.discounts ? Response.json(Object.fromEntries(body.startsAt.map(instant=>[instant,{totalPrice:18,discountTotal:2}])))
        : new Response(null,{status:404});
    }
    if (parsed.pathname.endsWith("/booking-discounts/quote") && !state.discounts) return new Response(null,{status:404});
    if (parsed.pathname.endsWith("/catalog/quote") || parsed.pathname.endsWith("/booking-discounts/quote")) {
      const rows = body.rootIds.map(id => state.services.get(body.businessId)?.find(row => row.id === id));
      assert.ok(rows.every(Boolean), "catalogue quote uses actual selected fixture IDs");
      const timed = parsed.pathname.endsWith("/booking-discounts/quote");
      const originalTotal = rows.reduce((sum, row) => sum + row.price, 0);
      return Response.json({ version: 1, businessId: body.businessId, rootIds: body.rootIds, selectedAssociationIds: [], ready: true,
        lines: rows.map(row => ({ itemId: row.id, name: row.name, kind: "service", durationMinutes: row.duration_minutes, charge: timed ? row.price * .9 : row.price, currency: row.currency,
          ...(timed ? {originalCharge:row.price,discountBasisPoints:1000,discountAmount:row.price / 10} : {}) })),
        options: [], serviceIds: body.rootIds, totalPrice: timed ? originalTotal * .9 : originalTotal, currency: "EUR",
        ...(timed ? {originalTotal,discountTotal:originalTotal / 10} : {}) });
    }
    if (parsed.pathname.endsWith("/bookings/timeline") || parsed.pathname.endsWith("/bookings/catalog")) {
      assert.equal(init.method, "POST");
      assert.ok(body.expected_plan, "the UI must carry the reviewed server plan into confirmation");
      assert.equal(body.ends_at, body.expected_plan.endsAt);
      assert.equal(body.starts_at, body.expected_plan.startsAt);
      const ids = body.expected_quote?.serviceIds ?? body.service_ids;
      if (body.expected_quote) { assert.equal(body.expected_quote.ready, true); assert.deepEqual(body.selected_ids, []); }
      if(state.pendingConfirmation) await state.pendingConfirmation.promise;
      if(state.confirmStatus) return Response.json({code:"BOOKING_CONFLICT",error:"La franja ya está ocupada por otra reserva."},{status:state.confirmStatus});
      let row = commands.get(body.request_key);
      if (!row) {
        row = { id: bookingId, business_id: body.business_id, service_id: ids[0], staff_id: body.staff_id, catalog_snapshot: body.expected_quote,
          customer_id: user, starts_at: body.starts_at, ends_at: body.ends_at, status: "CONFIRMED",
          timing_snapshot: body.expected_plan, customer_name: "Cliente de prueba", business_name: "Peluquería primera",
          business_timezone: "Europe/Madrid", service_name: "Corte exacto", staff_name: "Ana" };
        commands.set(body.request_key, row);
      }
      if (state.loseReplyOnce) { state.loseReplyOnce = false; throw new TypeError("Reply lost after isolated commit"); }
      return Response.json([row], { status: 201 });
    }
    if (parsed.pathname.endsWith("/bookings/" + bookingId + "/change")) {
      if(state.changeStatus) return Response.json({code:state.changeCode,error:"La reserva original se conserva."},{status:state.changeStatus});
      return Response.json(state.changeReply);
    }
    throw new Error("Unexpected HTTP route " + parsed.pathname);
  };
  const auth = { readAuthSession: async () => ({ access_token: "test-only", user: { id: user } }),
    fetchWithAuth: fetch, AuthSessionRequiredError: class extends Error {} };
  const apiScope = { exports: {}, Headers, URLSearchParams, Intl, Date: ScenarioClock, fetch,
    process: { env: { EXPO_PUBLIC_API_URL: "https://timeline.test.invalid/api" } }, console: { log() {}, warn() {}, error() {} },
    require(name) {
      if (name === "react-native") return { Platform: { OS: "ios" } };
      if (name === "@/lib/loginResponse") return loadPure("lib/loginResponse.ts");
      if (name === "@workspace/api-zod") return modulePublicationPolicy;
      if (name === "@react-native-async-storage/async-storage") return { default: storage };
      if (name === "@/lib/authSession") return auth;
      if (name === "./goSearchAliases") return { normalize: value => value.toLowerCase(), expandSearchTerms: value => [value.toLowerCase()] };
      if (name === "./bookingTimeline") return timeline;
      throw new Error("Unexpected booking dependency " + name);
    } };
  vm.runInNewContext(source("data/booking.ts"), apiScope);
  const api = apiScope.exports;
  const catalogScope = { exports: {}, require(name) { if (name === "./booking") return api; throw Error(name); } };
  vm.runInNewContext(source("data/catalogAssociations.ts"), catalogScope);
  const discountScope={exports:{},require(name){if(name==="./booking")return api;if(name==="./catalogAssociations")return catalogScope.exports;throw Error(name);}};
  vm.runInNewContext(source("data/bookingDiscounts.ts"),discountScope);

  let hookIndex = 0, effects = [], dirty = false, tree, props;
  const hooks = [];
  const same = (a, b) => a && b && a.length === b.length && a.every((value, index) => Object.is(value, b[index]));
  const React = {
    Fragment: "Fragment", createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }),
    useState(initial) {
      const index = hookIndex++;
      if (!hooks[index]) hooks[index] = { value: typeof initial === "function" ? initial() : initial };
      return [hooks[index].value, value => {
        const next = typeof value === "function" ? value(hooks[index].value) : value;
        if (!Object.is(next, hooks[index].value)) { hooks[index].value = next; dirty = true; }
      }];
    },
    useRef(initial) { return React.useState(() => ({ current: initial }))[0]; },
    useMemo(factory, dependencies) {
      const index = hookIndex++;
      if (!hooks[index] || !same(hooks[index].dependencies, dependencies)) hooks[index] = { dependencies, value: factory() };
      return hooks[index].value;
    },
    useCallback(callback, dependencies) { return React.useMemo(() => callback, dependencies); },
    useContext() { return overrides.handedness ?? "right"; },
    useEffect(effect, dependencies) {
      const index = hookIndex++, previous = hooks[index];
      if (!previous || !same(previous.dependencies, dependencies)) {
        hooks[index] = { dependencies };
        effects.push(() => { previous?.cleanup?.(); hooks[index].cleanup = effect(); });
      }
    },
  };
  class Value { constructor(value) { this.value = value; } setValue(value) { this.value = value; } interpolate() { return 0; } }
  const animation = { start(callback) { callback?.({ finished: true }); } };
  const native = new Proxy({ Dimensions: { get: () => ({ width: overrides.width ?? 390, height: overrides.height ?? 844 }) }, Platform: { OS: "ios" },
    useWindowDimensions: () => ({ width: overrides.width ?? 390, height: overrides.height ?? 844, fontScale: overrides.fontScale ?? 1 }),
    StyleSheet: { create: value => value, absoluteFillObject: {} }, Alert: { alert: (...args) => alerts.push(args) },
    Keyboard: { isVisible: () => false, addListener: () => ({ remove() {} }), dismiss() {} },
    Animated: { Value, View: "Animated.View", timing: () => animation, spring: () => animation, add: () => 0 },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) },
  }, { get: (target, key) => target[key] ?? key });
  const translations = key => key;
  const config = { businessId: business, businessName: "Peluquería primera", services: [], plantillaItems: [
    { id: "legacy", emoji: "👤", staffNames: ["Fake local professional"], staffServices: [[]] },
  ], activeDays: [], daySchedules: {}, staffSchedules: {}, openFrom: "00:00", openTo: "00:01" };
  const timers = new Map(); let timerId = 0;
  const modules = {"@/components/ui/GoNavigationFloating":{GoNavigationFloating:"GoNavigationFloating"},"@/components/ui/GoCloseButton":{GoCloseButton:"GoCloseButton"},
    "@/components/ui/GoNavigationHand": { GoNavigationHand: {} },
    "@workspace/api-zod": modulePublicationPolicy,
    "@/hooks/useBookingModulePublication": loadModulePublicationHook(React),
    "./CatalogComplementSelector": { CatalogComplementSelector: "CatalogComplementSelector", CatalogQuoteBreakdown: "CatalogQuoteBreakdown" },
    "./PartialPaymentSummary": { PartialPaymentSummary: "PartialPaymentSummary" },
    "./CatalogPhotoView": { CatalogPhotoToggle: () => null, CatalogItemPhoto: () => null, useCatalogPhotoPreference: () => ({ showPhotos: false, choose() {} }) },
    "@/data/demoCatalogPhotos": { demoCatalogPhotoSource: () => undefined },
    "@/data/catalogAssociations": catalogScope.exports, "@/data/bookingDiscounts":discountScope.exports,
    react: { ...React, default: React }, "react-native": native,
    "@react-native-async-storage/async-storage": { default: storage },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" }, "@expo/vector-icons": { Feather: "Feather" },
    "expo-haptics": { selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync: async () => {},
      ImpactFeedbackStyle: { Medium: "medium", Light: "light" }, NotificationFeedbackType: { Success: "success" } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    "@/data/bookingChangeAvailability":loadPure("data/bookingChangeAvailability.ts"),
    "@/data/customerBookingProjection":loadPure("data/customerBookingProjection.ts"),
    "@/data/booking": api, "@/data/bookingServices": services, "@/data/bookingTimeline": timeline,
    "@/data/goRecentBusinesses": { getRecentBusinessIds: async () => [business, otherBusiness], recordBusinessVisit: async () => {} },
    "@/lib/goLogBridge": { syncBookingToGoLog: async () => { throw new Error("Canonical reservations must not be copied to GO Log"); } },
    "@/lib/goLogStore": { updateGoLog: async () => { throw new Error("Cloud availability must not update GO Log"); } },
    "@/lib/time": { getToday: () => new Clock(), formatISODate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}` },
    "@/contexts/LanguageContext": { useLanguage: () => ({ lang: "es", t: translations }) },
    "@/contexts/GoBusinessConfigContext": { useBusinessConfig: () => ({ config }) },
    "@/data/bookingTemplates": { BOOKING_TEMPLATES: { peluqueria: { staff: [{ name: "Fake template professional", services: [] }],
      services: [{ title: "Fake template service", durationMinutes: 30, price: 9 }] } } },
    "@/data/clientCalendar": { getClientBusyIntervals: async () => { throw new Error("Cloud availability must not consult local client occupancy"); } },
    "@/data/goSectorData": { SECTORS: [{ id: "belleza", label: "Belleza", subs: [{ id: "peluqueria", name: "Peluquería" }] }],
      PEOPLE_SECTORS: new Set(["belleza"]), SUB_TO_SECTOR: { peluqueria: "belleza" } },
    "@/data/goSectorTranslations": { trSector: value => value }, "@/lib/businessIcons": { getBusinessIcon: () => "✂️" },
  };
  const uiScope = { exports: {}, Date: ScenarioClock, Intl, Map, Set, __DEV__: false, console: { log() {}, warn() {}, error() {} },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: () => 0, clearInterval() {},
    require(name) { if (name in modules) return modules[name]; throw new Error("Unexpected UI dependency " + name); } };
  const componentPath = kind === "provider" ? "components/booking/GoProveedorReservaSheet.tsx" : "components/booking/BookingSearchOverlay.tsx";
  if(kind === "provider") { const shared={...uiScope,exports:{}};vm.runInNewContext(source("components/booking/BookingSearchOverlay.tsx"),shared);modules["./BookingSearchOverlay"]=shared.exports; }
  vm.runInNewContext(source(componentPath), uiScope);
  const Component = kind === "provider" ? uiScope.exports.GoProveedorReservaSheet : uiScope.exports.BookingSearchOverlay;
  props = kind === "provider" ? { visible: true, proveedor: { name: "Peluquería primera", businessId: business,
    rating: "", distance: "", slots: 0, subId: "peluqueria", subLabel: "Peluquería", subColor: "#4A80BD", subIcon: "scissors" },
    onClose: () => navigation.push("close"), onBookingConfirmed: (...args) => navigation.push(args) }
    : { visible: true, canonicalCustomerBookings: true, changeSelection: overrides.changeSelection, onProposalSubmit: async draft => { if(state.submitError)throw Error(state.submitError);navigation.push(plain(draft)); }, onClose: () => navigation.push("close"),
      onBookingConfirmed: (...args) => navigation.push(args) };
  let catalogueScope = "";
  function render() {
    hookIndex = 0; effects = []; dirty = false;
    tree = Component(props);
    if(typeof tree?.type === "function") tree=tree.type(tree.props);
    // This integration fixture isolates the already separately exercised child
    // selector, while retaining the production catalogue HTTP adapter/transport.
    const selector = nodes(tree).find(node => node.type === "CatalogComplementSelector");
    const nextScope = selector ? selector.props.businessId + "|" + selector.props.rootIds.join(",") : "";
    if (nextScope !== catalogueScope) {
      catalogueScope = nextScope;
      if (selector?.props.rootIds.length) effects.push(() => { void catalogScope.exports.quoteCatalog(selector.props.businessId, selector.props.rootIds).then(quote => {
        if (catalogueScope === nextScope) selector.props.onChange(quote);
      }); });
    }
    for (const effect of effects) effect();
    return tree;
  }
  async function settle() {
    // Drain actual async component effects and any state updates, with a hard
    // convergence limit to catch render/effect loops instead of hiding them.
    for (let turn = 0; turn < 30; turn++) {
      await new Promise(resolve => setImmediate(resolve));
      if (dirty) render();
    }
    assert.equal(dirty, false, "component must settle without a render loop");
    return tree;
  }
  async function press(label) {
    const node = button(tree, label);
    assert.ok(node, `Missing enabled button ${label}: ${text(tree)}`);
    assert.notEqual(node.props.disabled, true, "button must be available: " + label);
    await node.props.onPress();
    render(); return settle();
  }
  async function start() { render(); return settle(); }
  const back=async()=>{const control=nodes(tree).find(node=>node.props.testID==='booking-back')??buttons(tree).find(node=>node.props.onPress?.name==='handleBackOneLevel');assert.ok(control);control.props.onPress();render();return settle();};
  return { api, state, calls, alerts, commands, writes, memory, navigation, hooks, start, render, settle, press, back,
    tree: () => tree, setProps: values => { props = { ...props, ...values }; return render(); },
    timers: async () => { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); return settle(); } };
}
function nodes(tree) {
  if (!tree || typeof tree !== "object") return [];
  return [tree, ...(tree.children ?? []).flatMap(nodes)];
}
function text(tree) {
  if (typeof tree === "string" || typeof tree === "number") return String(tree);
  return (tree?.children ?? []).map(text).join(" ");
}
const buttons = tree => nodes(tree).filter(node => node.type === "TouchableOpacity");
function button(tree, label) { return buttons(tree).find(node => text(node).toLowerCase().includes(label.toLowerCase())); }
const confirmation = f => button(f.tree(), "biz_confirm_booking_btn");
const actualSlots = f => f.calls.filter(call => call.url.pathname.endsWith("/booking-availability") && call.url.searchParams.get("datesOnly") !== "true");
const posted = f => f.calls.filter(call => call.url.pathname.endsWith("/bookings/timeline") || call.url.pathname.endsWith("/bookings/catalog"));
async function openProviderSlots(f, person = "Ana") {
  await f.start(); await f.press("Corte exacto"); await f.press("save"); await f.press(person); return f.tree();
}
async function openOverlaySlots(f, person = "Ana") {
  await f.start(); await f.press("Peluquería primera"); await f.press("Corte exacto");
  await f.press("save"); await f.press(person); return f.tree();
}

for (const kind of ["provider", "overlay"]) test(`${kind} review shows the timed discount and submits the accepted breakdown`, async () => {
  const f = fixture(kind, { discounts: true });
  await (kind === "provider" ? openProviderSlots(f) : openOverlaySlots(f));
  await f.press("02:37");
  assert.match(text(f.tree()),/Precio original/);
  assert.match(text(f.tree()),/Descuento total/);
  assert.match(text(f.tree()),/Precio final/);
  assert.equal(posted(f).length,0);
  const quote=f.calls.find(call=>call.url.pathname.endsWith("/booking-discounts/quote"));
  assert.equal(quote.body.startsAt,planFor().startsAt);
  await f.press("biz_confirm_booking_btn");
  const confirmed=posted(f)[0].body;
  assert.equal(confirmed.expected_quote.discountTotal,confirmed.expected_quote.originalTotal / 10);
  assert.equal(confirmed.expected_quote.totalPrice,confirmed.expected_quote.originalTotal * .9);
});
test("provider's real callback selects the canonical professional UUID and uses only server availability", async () => {
  const f = fixture(); await openProviderSlots(f);
  assert.ok(text(f.tree()).includes("02:37"));
  assert.ok(!text(f.tree()).includes("Fake template professional"));
  assert.ok(!text(f.tree()).includes("Fake local professional"));
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("staff_id"), firstStaff);
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("service_ids"), firstService);
  await f.press("02:37"); await f.press("biz_confirm_booking_btn");
  assert.equal(posted(f)[0].body.staff_id, firstStaff);
  assert.equal(posted(f)[0].body.starts_at, planFor().startsAt);
  assert.equal(f.commands.size, 1);
});

test("an empty real catalogue never advertises local or template services/professionals", async () => {
  const f = fixture("provider"); f.state.services.set(business, []); f.state.staff.set(business, []);
  await f.start();
  for (const forbidden of ["Fake template service", "Fake template professional", "Fake local professional"])
    assert.ok(!text(f.tree()).includes(forbidden), forbidden);
  assert.equal(actualSlots(f).length, 0);
  assert.equal(confirmation(f), undefined);
  assert.equal(posted(f).length, 0);
});

test("late business A catalogue/staff cannot replace business B in the real overlay", async () => {
  const f = fixture("overlay");
  const pendingServices = deferred(), pendingStaff = deferred();
  f.state.pendingServices.set(business, pendingServices); f.state.pendingStaff.set(business, pendingStaff);
  await f.start();
  const selectFirst = button(f.tree(), "Peluquería primera").props.onPress;
  const selectSecond = button(f.tree(), "Peluquería segunda").props.onPress;
  await selectFirst(); f.render(); await f.settle();
  await selectSecond(); f.render(); await f.settle();
  assert.ok(button(f.tree(), "Servicio del segundo negocio"));
  pendingServices.resolve([remoteService(firstService, "Late service A")]);
  pendingStaff.resolve([remoteStaff(firstStaff, "Late person A")]);
  await f.settle();
  assert.ok(button(f.tree(), "Servicio del segundo negocio"));
  assert.ok(!text(f.tree()).includes("Late service A"));
  await f.press("Servicio del segundo negocio"); await f.press("save");
  assert.ok(button(f.tree(), "Profesional segundo"));
  assert.ok(!text(f.tree()).includes("Late person A"));
});

test("provider date, service and professional changes clear old selections before confirmation", async () => {
  const f = fixture(); await openProviderSlots(f); await f.press("02:37");
  assert.ok(confirmation(f));
  await f.back();
  const dates = buttons(f.tree()).filter(node => node.props.key === tomorrow);
  assert.equal(dates.length, 1); await dates[0].props.onPress(); f.render(); await f.settle();
  assert.equal(confirmation(f), undefined, "a new date cannot confirm yesterday's selected instant");
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("dateISO"), tomorrow);
  await f.press("11:37"); assert.ok(confirmation(f));
  await f.back(); await f.back(); await f.press("Bea");
  assert.equal(confirmation(f), undefined, "professional changes clear the selected slot");
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("staff_id"), secondStaff);
  await f.press("11:37"); assert.ok(confirmation(f));
  await f.back(); await f.back(); await f.back(); await f.press("Corte exacto"); await f.press("Lavado exacto"); await f.press("save");
  assert.equal(confirmation(f), undefined, "service changes clear staff and slot selection");
  await f.press("Ana");
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("service_ids"), secondService);
  assert.equal(posted(f).length, 0);
});

for (const kind of ["provider", "overlay"]) {
  test(`${kind} ignores a late availability response after the date changes`, async () => {
    const f = fixture(kind), oldRequest = deferred();
    f.state.pendingSlots = oldRequest;
    if (kind === "provider") await openProviderSlots(f); else await openOverlaySlots(f);
    assert.equal(actualSlots(f).at(-1).url.searchParams.get("dateISO"), today);
    f.state.pendingSlots = null;
    const nextDay = buttons(f.tree()).find(node => node.props.key === tomorrow);
    assert.ok(nextDay); await nextDay.props.onPress(); f.render(); await f.settle();
    assert.equal(actualSlots(f).at(-1).url.searchParams.get("dateISO"), tomorrow);
    assert.ok(button(f.tree(), "11:37"));
    oldRequest.resolve([planFor()]); await f.settle();
    assert.ok(button(f.tree(), "11:37"), "keep the current date's real response");
    assert.equal(button(f.tree(), "02:37"), undefined, "discard the obsolete date's late response");
    assert.equal(posted(f).length, 0);
  });

  test(`${kind} callback preserves the chosen real instant at the repeated autumn hour`, async () => {
    const f = fixture(kind, { foldOptions: true });
    if (kind === "provider") await openProviderSlots(f); else await openOverlaySlots(f);
    const choices = buttons(f.tree()).filter(node => /^02:37 GMT[+]\d/.test(text(node).trim()));
    assert.equal(choices.length, 2, "both repeated wall-clock options remain visible and identifiable");
    const second = choices.find(node => text(node).includes("GMT+1"));
    assert.ok(second); await second.props.onPress(); f.render(); await f.settle();
    await f.press(kind === "overlay" ? "BIZ_CONFIRM_BOOKING_BTN" : "biz_confirm_booking_btn");
    assert.equal(posted(f)[0].body.starts_at, `${today}T01:37:00.000Z`);
    assert.equal(posted(f)[0].body.staff_id, firstStaff);
    assert.deepEqual(posted(f)[0].body.expected_plan, plain(planFor({ fold: 1 })));
    assert.equal(f.commands.size, 1);
  });

  test(`${kind} uncertain confirmation retries one command and the exact reviewed plan`, async () => {
    const f = fixture(kind, { loseReplyOnce: true });
    if (kind === "provider") await openProviderSlots(f); else await openOverlaySlots(f);
    await f.press("02:37");
    const label = kind === "overlay" ? "BIZ_CONFIRM_BOOKING_BTN" : "biz_confirm_booking_btn";
    await f.press(label);
    assert.equal(f.commands.size, 1, "the first isolated server commit happened before its reply was lost");
    assert.equal(posted(f).length, 1);
    await f.press(label);
    assert.equal(posted(f).length, 2);
    assert.deepEqual(posted(f)[1].body, posted(f)[0].body, "retry retains request key, assignment, instant and expected server snapshot");
    assert.equal(f.commands.size, 1, "a lost reply does not produce another reservation");
    assert.deepEqual(posted(f)[1].body.expected_plan, plain(planFor()));
  });

  test(`${kind} confirmation displays the full reviewed duration without decimal-hour rounding`, async () => {
    const plan = planFor();
    plan.totalClientMinutes = plan.totalDurationMinutes = plan.workMinutes = 75;
    plan.endsAt = new Date(Date.parse(plan.startsAt) + 75 * 60000).toISOString();
    plan.phases[0] = { ...plan.phases[0], durationMinutes: 75, endsAt: plan.endsAt };
    plan.workIntervals[0] = { ...plan.workIntervals[0], endsAt: plan.endsAt };
    plan.serviceDetails[0] = { ...plan.serviceDetails[0], durationMinutes: 75 };
    const f = fixture(kind, { pendingSlots: { promise: Promise.resolve([plan]) } });
    if (kind === "provider") await openProviderSlots(f); else await openOverlaySlots(f);
    await f.press("02:37");
    assert.match(text(f.tree()), /75\s+min/);
    assert.doesNotMatch(text(f.tree()), /1\.3 h/);
    await f.press("BIZ_CONFIRM_BOOKING_BTN");
    assert.equal(posted(f)[0].body.expected_plan.totalClientMinutes, 75);
    assert.equal(posted(f)[0].body.ends_at, plan.endsAt);
  });
}

const flatStyle = n => Object.assign({}, ...[n.props.style].flat(Infinity).filter(Boolean));
for (const [width,height] of [[320,568],[375,667],[390,844],[430,932]]) test(`compact services ${width}x${height} keep complete context, two rows, accurate total and compact green Save`, async()=>{
 const f=fixture("overlay",{width,height});await f.start();await f.press("Peluquería primera");
 const context=nodes(f.tree()).find(n=>n.props.testID==="booking-service-context");
 assert.equal(text(context),"Peluquería primera");assert.equal(context.props.numberOfLines,undefined);
 const header=nodes(f.tree()).filter(n=>n.type==="View"&&nodes(n).includes(context)).at(-1);assert.equal(flatStyle(header).flexDirection,"row");
 const list=nodes(f.tree()).find(n=>n.props.testID==="booking-services-list");assert.equal(flatStyle(list).paddingHorizontal,12);assert.equal(list.props.contentContainerStyle.paddingBottom,0);
 const card=nodes(f.tree()).find(n=>n.props.testID==="booking-service-"+firstService);
 assert.equal(flatStyle(card).flexDirection,"column");assert.equal(flatStyle(card).height,undefined);
 const rows=nodes(card).filter(n=>n.type==="View"&&flatStyle(n).flexDirection==="row"&&flatStyle(n).gap===8);assert.equal(rows.length,2);assert.ok(text(rows[0]).includes("Corte exacto"));assert.ok(text(rows[0]).includes("12"));assert.match(text(rows[1]),/13\s+min/);
 const mark=nodes(card).find(n=>flatStyle(n).width===44);assert.equal(flatStyle(mark).minHeight,44);
 const save=nodes(f.tree()).find(n=>n.props.testID==="booking-save-services");assert.equal(save.props.disabled,true);assert.equal(flatStyle(save).minHeight,48);assert.equal(flatStyle(save).backgroundColor,"#22c55e");assert.ok(nodes(list).includes(save));const original=plain(save.props.style[0]);
 await f.press("Corte exacto");let total=nodes(f.tree()).find(n=>n.props.testID==="booking-services-total");assert.match(text(total),/TOTAL:.*12,00.*€/);assert.match(text(total),/13\s+min/);assert.equal(flatStyle(total).flexWrap,"wrap");assert.equal(flatStyle(total).justifyContent,"space-between");
 assert.equal(nodes(f.tree()).find(n=>n.type==="CatalogComplementSelector").props.showTotal,false);
 await f.press("Lavado exacto");total=nodes(f.tree()).find(n=>n.props.testID==="booking-services-total");assert.match(text(total),/TOTAL:.*24,00.*€/);assert.match(text(total),/40\s+min/);
 await f.press("Corte exacto");total=nodes(f.tree()).find(n=>n.props.testID==="booking-services-total");assert.match(text(total),/TOTAL:.*12,00.*€/);assert.match(text(total),/27\s+min/);
 assert.deepEqual(plain(nodes(f.tree()).find(n=>n.props.testID==="booking-save-services").props.style[0]),original);
 await f.press("save");assert.ok(button(f.tree(),"Ana"));assert.equal(posted(f).length,0);
});

// Execute the shared production selector with authoritative HTTP responses, without writes.
const changeApi = loadPure("data/bookingChangeAvailability.ts");
function savedChangeSelection() {
 const plan=planFor();return changeApi.bookingChangeSelection({businessId:business,serviceId:firstService,staffId:firstStaff,
 bookingTimeline:plan,bookingServices:plan.serviceDetails,contactName:"Peluquería primera",professionalName:"Ana",
 bookingCategory:"peluqueria",intentLabel:"Corte exacto",startDatetime:plan.startsAt,endDatetime:plan.endsAt});
}
async function openChangeSlots(f,person="Ana") {
 await f.start();
 assert.ok(button(f.tree(),"save"),"the shared Services and Products step is the entry point");
 await f.press("save");
 const selected=buttons(f.tree()).find(node=>node.props.accessibilityState?.selected&&text(node).includes(person));
 if(person==="Ana")assert.ok(selected,"original professional is preselected");
 await f.press(person);return f.tree();
}
test("change slot notice uses two uppercase lines and the selected business name, without staff or demo filler",async()=>{
 for(const [name,width,fontScale] of [['Go peluquería 2',320,1],['Peluquería Primera',390,1],['Peluquería de nombre muy largo con varias palabras para conservar íntegramente',320,1.8]]){
  const selection=savedChangeSelection();selection.business.name=name;
  const before=JSON.stringify(selection),f=fixture('overlay',{changeSelection:selection,width,fontScale});await openChangeSlots(f);
  const notice=nodes(f.tree()).find(n=>n.props.testID==='booking-change-slot-notice');assert.ok(notice);
  assert.equal(text(notice),`LA RESERVA ACTUAL SE MANTIENE\nHASTA LA ACEPTACIÓN DE ${name.toLocaleUpperCase('es')}`);
  assert.equal(text(notice).split('\n').length,2);assert.doesNotMatch(text(notice),/Ana|Datos de prueba|Elige una franja/);
  assert.equal(notice.props.numberOfLines,undefined,'Long names may wrap without clipping');assert.notEqual(notice.props.allowFontScaling,false);
  assert.equal(flatStyle(notice).height,undefined);assert.equal(JSON.stringify(selection),before);
  assert.equal(posted(f).length,0);assert.equal(f.navigation.length,0);
 }
});

test("normal new booking slots do not display a change-proposal notice",async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);
 assert.equal(nodes(f.tree()).find(n=>n.props.testID==='booking-change-slot-notice'),undefined);
});

test("proposal starts at the same services catalogue, keeps the original selection, and uses normal review without a HOLD",async()=>{
 const selection=savedChangeSelection(),before=JSON.stringify(selection),f=fixture("overlay",{changeSelection:selection});
 await openChangeSlots(f);
 const request=actualSlots(f).at(-1).url;assert.equal(request.searchParams.get("business_id"),business);
 assert.equal(request.searchParams.get("service_ids"),firstService);assert.equal(request.searchParams.get("staff_id"),firstStaff);
 await f.press("02:37");assert.match(text(f.tree()),/Revisar propuesta de cambio/);assert.match(text(f.tree()),/ENVIAR PROPUESTA/);
 assert.match(text(f.tree()),/13\s+min/);assert.equal(f.navigation.length,0);assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);
 await f.press("ENVIAR PROPUESTA");assert.equal(f.navigation.length,1);assert.equal(f.navigation[0].slot.startInstant,planFor().startsAt);
 assert.deepEqual(f.navigation[0].selection.serviceIds,[firstService]);assert.equal(actualSlots(f).length,3);
 assert.equal(changeApi.timeOnlyBookingProposal(selection,f.navigation[0]),true,"unchanged services/professional/price use the existing remote time-only contract");
 for(const patch of [{staffId:secondStaff},{serviceIds:[secondService]},{durationMinutes:27},{catalogSnapshot:{...f.navigation[0].selection.catalogSnapshot,totalPrice:99}}])assert.equal(changeApi.timeOnlyBookingProposal(selection,{...f.navigation[0],selection:{...f.navigation[0].selection,...patch}}),false);
 assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);assert.equal(JSON.stringify(selection),before);
 await f.back();assert.ok(button(f.tree(),"02:37"));await f.back();assert.ok(button(f.tree(),"Ana"));await f.back();assert.ok(button(f.tree(),"save"));
});
for(const reason of ["closed day or holiday","full agenda","break or insufficient service duration"]){
 test("proposal offers no invented hours for server-unavailable "+reason,async()=>{
  const f=fixture("overlay",{changeSelection:savedChangeSelection(),plans:[],availableDates:[tomorrow]});await openChangeSlots(f);
  assert.match(text(f.tree()),/biz_no_availability_day/);assert.equal(button(f.tree(),"02:37"),undefined);
  assert.equal(buttons(f.tree()).find(node=>node.props.key===today).props.disabled,true);
  const next=buttons(f.tree()).find(node=>node.props.key===tomorrow);assert.equal(next.props.disabled,false);
  f.state.plans=undefined;await next.props.onPress();f.render();await f.settle();assert.ok(button(f.tree(),"11:37"));assert.equal(posted(f).length,0);
 });
}
test("changing professional and replacing/removing services uses the same catalogue, duration and availability parameters",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection()});await f.start();
 await f.press("Corte exacto");await f.press("Lavado exacto");await f.press("save");await f.press("Bea");
 assert.equal(actualSlots(f).at(-1).url.searchParams.get("service_ids"),secondService);
 assert.equal(actualSlots(f).at(-1).url.searchParams.get("staff_id"),secondStaff);
 await f.press("02:37");assert.match(text(f.tree()),/27\s+min/);assert.match(text(f.tree()),/Bea/);
 await f.press("ENVIAR PROPUESTA");assert.deepEqual(f.navigation[0].selection.serviceIds,[secondService]);assert.equal(f.navigation[0].selection.durationMinutes,27);assert.equal(f.navigation[0].selection.staffId,secondStaff);
 assert.equal(posted(f).length,0);
});
test("adding a service reviews the new combined duration and price instead of filtering by the original contract",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection()});await f.start();await f.press("Lavado exacto");await f.press("save");
 const plan=planFor();plan.endsAt=new Date(Date.parse(plan.startsAt)+40*60000).toISOString();plan.totalClientMinutes=plan.totalDurationMinutes=40;
 plan.serviceIds=[firstService,secondService];plan.serviceDetails=[{id:firstService,title:"Corte exacto",durationMinutes:13,price:12},{id:secondService,title:"Lavado exacto",durationMinutes:27,price:12}];
 f.state.plans=[plan];await f.press("Ana");await f.press("02:37");assert.match(text(f.tree()),/40\s+min/);assert.match(text(f.tree()),/24\s*€/);
 await f.press("ENVIAR PROPUESTA");assert.deepEqual(f.navigation[0].selection.serviceIds,[firstService,secondService]);assert.equal(f.navigation[0].selection.catalogSnapshot.totalPrice,24);
 assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);
});
test("lost availability during review keeps the original intact and asks for another slot",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection()});await openChangeSlots(f);await f.press("02:37");f.state.plans=[];
 await f.press("ENVIAR PROPUESTA");assert.equal(f.navigation.length,0);assert.match(text(f.tree()),/ya no está disponible|No se pudo enviar|biz_slot_taken_error/);assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);
 f.state.plans=undefined;const next=buttons(f.tree()).find(node=>node.props.key===tomorrow);await next.props.onPress();f.render();await f.settle();await f.press("11:37");await f.press("ENVIAR PROPUESTA");assert.equal(f.navigation.length,1);
});
test("proposal availability permission/network failure never falls back to local times",async()=>{
 for(const status of [403,503]){const f=fixture("overlay",{changeSelection:savedChangeSelection(),availabilityError:status});await openChangeSlots(f);
 assert.match(text(f.tree()),/Disponibilidad no verificada|consultar la disponibilidad/);assert.equal(button(f.tree(),"02:37"),undefined);assert.equal(f.navigation.length,0);assert.equal(f.writes.length,0);}
});
test("an unsupported negotiation remains on the existing review and never claims success or creates a booking",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection(),submitError:"Este servidor no admite esos cambios"});await openChangeSlots(f);await f.press("02:37");await f.press("ENVIAR PROPUESTA");
 assert.equal(f.navigation.length,0);assert.ok(button(f.tree(),"ENVIAR PROPUESTA"));assert.match(text(f.tree()),/No se pudo enviar|no admite/);assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);
});
test("proposal selection keeps repeated DST times tied to the exact server instant",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection(),foldOptions:true});await openChangeSlots(f);
 const slots=buttons(f.tree()).filter(node=>text(node).includes("02:37"));assert.equal(slots.length,2);
 await slots[1].props.onPress();f.render();await f.settle();await f.press("ENVIAR PROPUESTA");assert.equal(f.navigation[0].slot.startInstant,planFor({fold:1}).startsAt);assert.equal(posted(f).length,0);
});

test("proposal adapter carries exact instant/revision/proposal ID; conflict or missing backend writes no local success",async()=>{
 for(const [status,code] of [[409,"BOOKING_CONFLICT"],[403,"FORBIDDEN"],[501,"NOT_IMPLEMENTED"]]){
  const f=fixture("overlay",{changeStatus:status,changeCode:code}),input={dateISO:today,time:"02:37",startsAt:planFor().startsAt,expectedRevision:7,proposalId:bookingId,acceptFinancialTerms:true};
  await assert.rejects(f.api.changeBookingRequest(bookingId,"propose",input,user),error=>error.status===status);
  const command=f.calls.find(call=>call.url.pathname.endsWith("/change"));assert.deepEqual(command.body,{operation:"propose",...input});
  assert.equal(f.writes.length,0);assert.equal(posted(f).length,0);
 }
});
test("server acceptance conflict is reported and rejection/confirmed agreement use only the original reservation endpoint",async()=>{
 const f=fixture("overlay",{changeStatus:409,changeCode:"BOOKING_CONFLICT"});
 await assert.rejects(f.api.changeBookingRequest(bookingId,"accept",{expectedRevision:7,proposalId:bookingId,acceptFinancialTerms:true},user),error=>error.code==="BOOKING_CONFLICT");
 assert.equal(f.writes.length,0);
 f.state.changeStatus=0;
 const original={id:bookingId,business_id:business,service_id:firstService,staff_id:firstStaff,customer_id:user,starts_at:planFor().startsAt,ends_at:planFor().endsAt,status:"CONFIRMED",business_timezone:"Europe/Madrid"};
 f.state.changeReply=original;const rejected=await f.api.changeBookingRequest(bookingId,"reject",{expectedRevision:7,proposalId:bookingId},user);assert.equal(rejected.id,bookingId);assert.equal(rejected.startInstant,original.starts_at);
 const next=planFor({date:tomorrow});f.state.changeReply={...original,starts_at:next.startsAt,ends_at:next.endsAt,timing_snapshot:next};
 const confirmed=await f.api.changeBookingRequest(bookingId,"accept",{expectedRevision:8,proposalId:bookingId,acceptFinancialTerms:true},user);
 assert.equal(confirmed.id,bookingId);assert.equal(confirmed.startInstant,next.startsAt);assert.equal(f.writes.length,0);assert.equal(posted(f).length,0);
});
test("closing during proposal refresh discards a late response without proposing or creating a booking",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection()});await openChangeSlots(f);const pending=deferred();f.state.pendingSlots=pending;
 const slot=button(f.tree(),"02:37"),selection=slot.props.onPress();f.setProps({visible:false});await f.settle();pending.resolve([planFor()]);await selection;await f.settle();
 assert.equal(f.navigation.length,0);assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);
});

test("registered local aliases preserve the already-loaded remote timing/resource contract without new catalogue or data writes",()=>{
 const plan=planFor(),entry={businessId:"registered-local-business",serviceId:"local-service",staffId:"local-professional",bookingServices:[{id:"local-service",title:"Corte",durationMinutes:13,price:12}],startDatetime:"2030-10-27T02:37:00",endDatetime:"2030-10-27T02:50:00"};
 const selection=changeApi.bookingChangeSelection(entry,{timingSnapshot:plan});
 assert.equal(selection.timeline,plan);assert.equal(selection.services[0].id,"local-service");assert.equal(selection.staff.id,"local-professional");
 const slot={startDatetime:entry.startDatetime,endDatetime:entry.endDatetime,startInstant:plan.startsAt,endInstant:plan.endsAt,staffId:"local-professional",timingSnapshot:plan,isAvailable:true,isBlocked:false};
 assert.equal(changeApi.bookingChangeSlots(selection,[slot]).length,1);
 const changed=structuredClone(plan);changed.phases[0].resources=[{resourceId:"another",quantity:1,occupancy:"booking"}];
 assert.equal(changeApi.bookingChangeSlots(selection,[{...slot,timingSnapshot:changed}]).length,0);
});

test("remote adapter rejects changed services/professional explicitly before any request, rather than dropping them",async()=>{
 const f=fixture("overlay");await assert.rejects(f.api.changeBookingRequest(bookingId,"propose",{dateISO:today,time:"02:37",selection:{serviceIds:[secondService],staffId:secondStaff,durationMinutes:27,catalogSnapshot:{}}},user),error=>error.code==="BOOKING_CHANGE_SELECTION_UNSUPPORTED");
 assert.equal(f.calls.length,0);assert.equal(f.writes.length,0);
});

test("an incomplete original record still opens the actual catalogue without guessed services or times",async()=>{
 const original={businessId:business,contactName:"Peluquería primera",bookingCategory:"peluqueria"},before=JSON.stringify(original),selection=changeApi.bookingChangeSelection(original);
 const f=fixture("overlay",{changeSelection:selection});await f.start();assert.ok(button(f.tree(),"Corte exacto"));assert.ok(button(f.tree(),"save").props.disabled);assert.match(text(f.tree()),/precargar/);
 await f.press("Corte exacto");await f.press("save");await f.press("Ana");assert.ok(button(f.tree(),"02:37"));assert.equal(JSON.stringify(original),before);assert.equal(posted(f).length,0);
});


test("repeated tap on the selected day keeps the available choices instead of clearing them",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection()});await openChangeSlots(f);
 const day=nodes(f.tree()).find(node=>node.props.testID==='booking-date-'+today);
 assert.ok(button(f.tree(),'02:37'));await day.props.onPress();f.render();await f.settle();
 assert.ok(button(f.tree(),'02:37'),'the selected date must retain its loaded times');
});

test("no-preference proposals revalidate the chosen professional even if unassigned results rotate",async()=>{
 const f=fixture("overlay",{changeSelection:savedChangeSelection(),rotateUnassignedStaff:true});await openChangeSlots(f,'biz_no_preference');
 await f.press('02:37');assert.ok(button(f.tree(),'ENVIAR PROPUESTA'));
 await f.press('ENVIAR PROPUESTA');assert.equal(f.navigation.length,1);assert.equal(f.navigation[0].selection.staffId,firstStaff);
 assert.equal(posted(f).length,0);assert.equal(f.writes.length,0);
});

test("a lost slot returns to the same selection with its real reason after the refresh finishes",async()=>{
 const original=savedChangeSelection(),before=JSON.stringify(original),f=fixture('overlay',{changeSelection:original});await openChangeSlots(f);
 await f.press('02:37');f.state.plans=[];await f.press('ENVIAR PROPUESTA');
 assert.match(text(f.tree()),/Esta franja ya no está disponible. Elige otra/);
 assert.equal(nodes(f.tree()).find(n=>n.props.testID==='booking-date-'+today).props.accessibilityState.selected,true);
 assert.equal(JSON.stringify(original),before);assert.equal(f.navigation.length,0);assert.equal(f.writes.length,0);
});


const holdWatcher=f=>nodes(f.tree()).find(n=>n.type?.name==='HoldCountdown');
async function letReviewExpire(f,watcher){
 f.state.now=watcher?Date.parse(watcher.props.expiresAt)+1000:fixedNow+301000;
 watcher?.props.onExpire();f.render();await f.settle();
}
test('new reservation: a late hold expiry cannot replace a confirmed booking with the residual availability list',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);await f.press('02:37');const watcher=holdWatcher(f);
 await f.press('BIZ_CONFIRM_BOOKING_BTN');assert.equal(f.navigation.length,1);
 await letReviewExpire(f,watcher);
 assert.match(text(f.tree()),/BIZ_BOOKING_CONFIRMED/);assert.equal(button(f.tree(),'02:37'),undefined);assert.equal(posted(f).length,1);assert.equal(f.commands.size,1);
});
test('hair reservation review keeps one heading and one dynamic total while preserving confirmation',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);await f.press('02:37');const tree=f.tree();
 const headings=nodes(tree).filter(n=>n.type==='Text'&&text(n)==='biz_confirm_booking_btn');
 assert.equal(headings.length,1);assert.doesNotMatch(text(tree),/biz_confirm_booking_title|ACCION_CONFIRMAR/);
 assert.equal(nodes(tree).find(n=>n.type==='CatalogQuoteBreakdown').props.showTotal,false);
 assert.equal(nodes(tree).find(n=>n.type==='CatalogQuoteBreakdown').props.individual,true);
 assert.equal(nodes(tree).filter(n=>n.props?.testID==='booking-review-total').length,1);
 assert.ok(nodes(tree).find(n=>n.type==='GoNavigationFloating').props.avoidRects?.length,'floating navigation avoids the confirmation actions');
 assert.equal((text(tree).match(/Total ·/g)??[]).length,1);assert.match(text(tree),/Total · 12,00/);
 const reviewNodes=nodes(tree),breakdownIndex=reviewNodes.findIndex(n=>n.type==='CatalogQuoteBreakdown');
 const totalIndex=reviewNodes.findIndex(n=>n.props?.testID==='booking-review-total');
 assert.ok(breakdownIndex>=0 && totalIndex>breakdownIndex,'services are followed by the single total');
 assert.equal(reviewNodes[totalIndex].children.filter(n=>n.type==='Text').length,1);
 assert.ok(confirmation(f));await f.press('BIZ_CONFIRM_BOOKING_BTN');assert.equal(posted(f).length,1);
});
test('new reservation: expiry while authoritative confirmation is pending keeps the chosen time in review',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);await f.press('02:37');const watcher=holdWatcher(f),pending=deferred();f.state.pendingConfirmation=pending;
 const confirmation=button(f.tree(),'BIZ_CONFIRM_BOOKING_BTN').props.onPress();f.render();await f.settle();
 await letReviewExpire(f,watcher);assert.match(text(f.tree()),/biz_confirm_booking_btn/);assert.equal(button(f.tree(),'02:37'),undefined,'no second time picker during confirmation');
 pending.resolve();await confirmation;f.render();await f.settle();assert.match(text(f.tree()),/BIZ_BOOKING_CONFIRMED/);assert.equal(f.commands.size,1);
});
test('new reservation: review expiry alone does not require choosing an otherwise valid remote time twice',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);await f.press('02:37');const watcher=holdWatcher(f);
 await letReviewExpire(f,watcher);assert.ok(button(f.tree(),'BIZ_CONFIRM_BOOKING_BTN'),'the same selected time stays in review');
 await f.press('BIZ_CONFIRM_BOOKING_BTN');assert.equal(posted(f).length,1);assert.equal(posted(f)[0].body.starts_at,planFor().startsAt);
});


test('new reservation: a delayed press from an obsolete slot cannot overwrite the new day selection',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);const old=button(f.tree(),'02:37');
 const day=nodes(f.tree()).find(n=>n.props.testID==='booking-date-'+tomorrow);day.props.onPress();f.render();await f.settle();assert.ok(button(f.tree(),'11:37'));
 await old.props.onPress();f.render();await f.settle();assert.ok(button(f.tree(),'11:37'),'obsolete touch is ignored, current day remains');
 await f.press('11:37');assert.ok(button(f.tree(),'BIZ_CONFIRM_BOOKING_BTN'));
});
test('new reservation: two rapid deliveries of a slot touch start only one review operation',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);const slot=button(f.tree(),'02:37'),create=f.api.createHold;let holds=0;
 f.api.createHold=async input=>{holds++;return create(input);};
 await slot.props.onPress();await slot.props.onPress();f.render();await f.settle();
 assert.equal(holds,1);assert.ok(button(f.tree(),'BIZ_CONFIRM_BOOKING_BTN'));
});


test('new reservation: a late review response after changing day cannot replace the new availability',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);const old=button(f.tree(),'02:37'),pending=deferred(),create=f.api.createHold;
 f.api.createHold=async input=>{const result=await create(input);await pending.promise;return result;};
 const selection=old.props.onPress();f.render();await f.settle();
 nodes(f.tree()).find(n=>n.props.testID==='booking-date-'+tomorrow).props.onPress();f.render();await f.settle();
 pending.resolve();await selection;f.render();await f.settle();assert.ok(button(f.tree(),'11:37'));assert.equal(posted(f).length,0);assert.equal(f.navigation.length,0);
});
test('new reservation: duplicate confirmation events dispatch only one command and one completion',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);await f.press('02:37');const confirm=button(f.tree(),'BIZ_CONFIRM_BOOKING_BTN');
 await confirm.props.onPress();await confirm.props.onPress();f.render();await f.settle();
 assert.equal(posted(f).length,1);assert.equal(f.commands.size,1);assert.equal(f.navigation.length,1);
});
test('new reservation: a real authoritative conflict asks for a new time and never claims confirmation',async()=>{
 const f=fixture('overlay');await openOverlaySlots(f);await f.press('02:37');f.state.confirmStatus=409;f.state.plans=[];
 await f.press('BIZ_CONFIRM_BOOKING_BTN');assert.match(text(f.tree()),/biz_slot_taken_error/);assert.equal(f.commands.size,0);assert.equal(f.navigation.length,0);assert.equal(button(f.tree(),'BIZ_CONFIRM_BOOKING_BTN'),undefined);
 f.state.confirmStatus=0;f.state.plans=undefined;
 nodes(f.tree()).find(n=>n.props.testID==='booking-date-'+tomorrow).props.onPress();f.render();await f.settle();await f.press('11:37');await f.press('BIZ_CONFIRM_BOOKING_BTN');
 assert.equal(f.commands.size,1);assert.equal(f.navigation.length,1);assert.equal(posted(f).at(-1).body.starts_at,planFor({date:tomorrow}).startsAt);
});
