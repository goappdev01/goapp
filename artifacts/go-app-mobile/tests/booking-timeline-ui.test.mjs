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
const source = file => ts.transpileModule(readFileSync(file, "utf8"), { compilerOptions: {
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
  return { version: 1, staffId, startsAt: start, endsAt: end, timezone: "Europe/Madrid",
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
  const memory = new Map([["go_bookings_v1", "[]"], ["go_log_v1", "[]"], ["go_bookable_items_v1", "[]"]]);
  const storage = { getItem: async key => memory.get(key) ?? null,
    setItem: async (key, value) => { writes.push(key); memory.set(key, value); } };
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: parsed, body, init });
    assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-only");
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
    if (parsed.pathname.endsWith("/booking-availability")) {
      if (parsed.searchParams.get("datesOnly") === "true") return Response.json({ version: 1, timezone: "Europe/Madrid",
        availableDates: [today, tomorrow, "2030-10-29"], slots: [] });
      const parameters = { date: parsed.searchParams.get("dateISO"), staffId: parsed.searchParams.get("staff_id") ?? firstStaff,
        serviceId: parsed.searchParams.get("service_ids").split(",")[0] };
      const plans = state.pendingSlots ? await state.pendingSlots.promise : state.foldOptions && parameters.date === today
        ? [planFor({ ...parameters, fold: 0 }), planFor({ ...parameters, fold: 1 })] : [planFor(parameters)];
      return Response.json({ version: 1, timezone: "Europe/Madrid", availableDates: [parameters.date], slots: plans });
    }
    if (parsed.pathname.endsWith("/catalog/quote")) {
      const rows = body.rootIds.map(id => state.services.get(body.businessId)?.find(row => row.id === id));
      assert.ok(rows.every(Boolean), "catalogue quote uses actual selected fixture IDs");
      return Response.json({ version: 1, businessId: body.businessId, rootIds: body.rootIds, selectedAssociationIds: [], ready: true,
        lines: rows.map(row => ({ itemId: row.id, name: row.name, kind: "service", durationMinutes: row.duration_minutes, charge: row.price, currency: row.currency })),
        options: [], serviceIds: body.rootIds, totalPrice: rows.reduce((sum, row) => sum + row.price, 0), currency: "EUR" });
    }
    if (parsed.pathname.endsWith("/bookings/timeline") || parsed.pathname.endsWith("/bookings/catalog")) {
      assert.equal(init.method, "POST");
      assert.ok(body.expected_plan, "the UI must carry the reviewed server plan into confirmation");
      assert.equal(body.ends_at, body.expected_plan.endsAt);
      assert.equal(body.starts_at, body.expected_plan.startsAt);
      const ids = body.expected_quote?.serviceIds ?? body.service_ids;
      if (body.expected_quote) { assert.equal(body.expected_quote.ready, true); assert.deepEqual(body.selected_ids, []); }
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
    throw new Error("Unexpected HTTP route " + parsed.pathname);
  };
  const auth = { readAuthSession: async () => ({ access_token: "test-only", user: { id: user } }),
    fetchWithAuth: fetch, AuthSessionRequiredError: class extends Error {} };
  const apiScope = { exports: {}, Headers, URLSearchParams, Intl, Date: Clock,
    process: { env: { EXPO_PUBLIC_API_URL: "https://timeline.test.invalid/api" } }, console: { log() {}, warn() {}, error() {} },
    require(name) {
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
  const native = new Proxy({ Dimensions: { get: () => ({ width: 390, height: 844 }) }, Platform: { OS: "ios" },
    StyleSheet: { create: value => value, absoluteFillObject: {} }, Alert: { alert: (...args) => alerts.push(args) },
    Keyboard: { addListener: () => ({ remove() {} }), dismiss() {} },
    Animated: { Value, View: "Animated.View", timing: () => animation, spring: () => animation, add: () => 0 },
    PanResponder: { create: handlers => ({ panHandlers: handlers }) },
  }, { get: (target, key) => target[key] ?? key });
  const translations = key => key;
  const config = { businessId: business, businessName: "Peluquería primera", services: [], plantillaItems: [
    { id: "legacy", emoji: "👤", staffNames: ["Fake local professional"], staffServices: [[]] },
  ], activeDays: [], daySchedules: {}, staffSchedules: {}, openFrom: "00:00", openTo: "00:01" };
  const timers = new Map(); let timerId = 0;
  const modules = {
    "@workspace/api-zod": modulePublicationPolicy,
    "@/hooks/useBookingModulePublication": loadModulePublicationHook(React),
    "./CatalogComplementSelector": { CatalogComplementSelector: "CatalogComplementSelector" },
    "@/data/catalogAssociations": catalogScope.exports,
    react: { ...React, default: React }, "react-native": native,
    "@react-native-async-storage/async-storage": { default: storage },
    "expo-linear-gradient": { LinearGradient: "LinearGradient" }, "@expo/vector-icons": { Feather: "Feather" },
    "expo-haptics": { selectionAsync: async () => {}, impactAsync: async () => {}, notificationAsync: async () => {},
      ImpactFeedbackStyle: { Medium: "medium", Light: "light" }, NotificationFeedbackType: { Success: "success" } },
    "react-native-safe-area-context": { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
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
  const uiScope = { exports: {}, Date: Clock, Intl, Map, Set, __DEV__: false, console: { log() {}, warn() {}, error() {} },
    setTimeout: callback => { timers.set(++timerId, callback); return timerId; }, clearTimeout: id => timers.delete(id),
    setInterval: () => 0, clearInterval() {},
    require(name) { if (name in modules) return modules[name]; throw new Error("Unexpected UI dependency " + name); } };
  const componentPath = kind === "provider" ? "components/booking/GoProveedorReservaSheet.tsx" : "components/booking/BookingSearchOverlay.tsx";
  vm.runInNewContext(source(componentPath), uiScope);
  const Component = kind === "provider" ? uiScope.exports.GoProveedorReservaSheet : uiScope.exports.BookingSearchOverlay;
  props = kind === "provider" ? { visible: true, proveedor: { name: "Peluquería primera", businessId: business,
    rating: "", distance: "", slots: 0, subId: "peluqueria", subLabel: "Peluquería", subColor: "#4A80BD", subIcon: "scissors" },
    onClose: () => navigation.push("close"), onBookingConfirmed: (...args) => navigation.push(args) }
    : { visible: true, canonicalCustomerBookings: true, onClose: () => navigation.push("close"),
      onBookingConfirmed: (...args) => navigation.push(args) };
  let catalogueScope = "";
  function render() {
    hookIndex = 0; effects = []; dirty = false;
    tree = Component(props);
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
      await Promise.resolve();
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
  return { api, state, calls, alerts, commands, writes, memory, navigation, hooks, start, render, settle, press,
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
function button(tree, label) { return buttons(tree).find(node => text(node).includes(label)); }
const confirmation = f => button(f.tree(), "biz_confirm_booking_btn");
const actualSlots = f => f.calls.filter(call => call.url.pathname.endsWith("/booking-availability") && call.url.searchParams.get("datesOnly") !== "true");
const posted = f => f.calls.filter(call => call.url.pathname.endsWith("/bookings/timeline") || call.url.pathname.endsWith("/bookings/catalog"));
async function openProviderSlots(f, person = "Ana") {
  await f.start(); await f.press("Corte exacto"); await f.press(person); return f.tree();
}
async function openOverlaySlots(f, person = "Ana") {
  await f.start(); await f.press("Peluquería primera"); await f.press("Corte exacto");
  await f.press("save"); await f.press(person); return f.tree();
}

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
  const dates = buttons(f.tree()).filter(node => text(node).includes("day_mon") && text(node).includes("28"));
  assert.equal(dates.length, 1); await dates[0].props.onPress(); f.render(); await f.settle();
  assert.equal(confirmation(f), undefined, "a new date cannot confirm yesterday's selected instant");
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("dateISO"), tomorrow);
  await f.press("11:37"); assert.ok(confirmation(f));
  await f.press("Bea");
  assert.equal(confirmation(f), undefined, "professional changes clear the selected slot");
  assert.equal(actualSlots(f).at(-1).url.searchParams.get("staff_id"), secondStaff);
  await f.press("11:37"); assert.ok(confirmation(f));
  await f.press("Lavado exacto");
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
    const nextDay = kind === "provider"
      ? buttons(f.tree()).find(node => text(node).includes("day_mon") && text(node).includes("28"))
      : buttons(f.tree()).find(node => node.props.key === tomorrow);
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
    if (kind === "provider") {
      await f.press("biz_confirm_booking_btn");
      assert.ok(nodes(f.tree()).some(node => node.props.badge === "1 h 15 min"));
      assert.doesNotMatch(text(f.tree()), /1\.3 h/);
    } else {
      assert.match(text(f.tree()), /75\s+min/);
      await f.press("BIZ_CONFIRM_BOOKING_BTN");
    }
    assert.equal(posted(f)[0].body.expected_plan.totalClientMinutes, 75);
    assert.equal(posted(f)[0].body.ends_at, plan.endsAt);
  });
}
