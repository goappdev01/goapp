import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
import { loadAuthSession } from "./helpers/auth-session-fixture.mjs";

const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const plain = value => JSON.parse(JSON.stringify(value));
function load(file, imports = {}, globals = {}) {
  const scope = { exports: {}, Date, Intl, Headers, URLSearchParams, console: { log() {}, warn() {} },
    require(name) { if (name in imports) return imports[name]; throw new Error("Unexpected import " + name); }, ...globals };
  vm.runInNewContext(compile(readFileSync(file, "utf8")), scope);
  return scope.exports;
}
const timeline = load("data/bookingTimeline.ts");
const customerProjection = load("data/customerBookingProjection.ts");
const user = "11111111-1111-4111-8111-111111111111", business = "22222222-2222-4222-8222-222222222222";
const service = "33333333-3333-4333-8333-333333333333", extraService = "44444444-4444-4444-8444-444444444444";
const firstStaff = "55555555-5555-4555-8555-555555555555", secondStaff = "66666666-6666-4666-8666-666666666666";
const bookingId = "77777777-7777-4777-8777-777777777777", resource = "88888888-8888-4888-8888-888888888888";
const dateISO = "2030-01-07", startsAt = "2030-01-07T10:37:00.000Z";
const after = minutes => new Date(Date.parse(startsAt) + minutes * 60000).toISOString();
function serverPlan() {
  const phases = [
    { id: "apply", name: "Aplicar", durationMinutes: 17, kind: "work", staffId: firstStaff, serviceId: service },
    { id: "process", name: "Procesar", durationMinutes: 42, kind: "wait", staffId: null, serviceId: service },
    { id: "finish", name: "Acabar", durationMinutes: 55, kind: "work", staffId: secondStaff, serviceId: extraService },
    { id: "wash", name: "Lavar", durationMinutes: 12, kind: "work", staffId: firstStaff, serviceId: extraService },
  ];
  let offset = 0;
  const detailed = phases.map(phase => {
    const value = { ...phase, offsetMinutes: offset, startsAt: after(offset), endsAt: after(offset + phase.durationMinutes),
      resources: [{ resourceId: resource, quantity: 1, occupancy: phase.kind === "wait" ? "booking" : "phase" }] };
    offset += phase.durationMinutes;
    return value;
  });
  return { version: 1, staffId: firstStaff, startsAt, endsAt: after(126), timezone: "Europe/Madrid",
    totalClientMinutes: 126, totalDurationMinutes: 126, workMinutes: 84, waitMinutes: 42,
    serviceIds: [service, extraService], serviceDetails: [{ id: service, title: "Tinte", durationMinutes: 59, price: 30, currency: "EUR" },
      { id: extraService, title: "Acabado", durationMinutes: 67, price: 20, currency: "EUR" }], totalPrice: 50, currency: "EUR", resourcesConfigured: true,
    phases: detailed, workIntervals: detailed.filter(phase => phase.kind === "work").map(({ startsAt, endsAt, staffId, serviceId }) => ({ startsAt, endsAt, staffId, serviceId })),
    resourceIntervals: [{ startsAt, endsAt: after(126), resourceId: resource, quantity: 1 }] };
}

function fixture() {
  const storage = new Map([["go_supabase_session_v1", JSON.stringify({ access_token: "test-only", user: { id: user } })],
    ["go_bookable_items_v1", JSON.stringify([{ id: service, businessId: business, active: true, visible: true, durationMinutes: 30, unitQuantity: 99 }])],
    ["go_availability_windows_v1", JSON.stringify([{ businessId: business, active: true, weekday: 1, visibleStartHour: 0, visibleEndHour: 23 }])],
    ["go_bookings_v1", "[]"]]);
  const reads = [], writes = [], calls = [], commands = new Map();
  const behavior = { plan: serverPlan(), status: 200, availability: null, response: null, loseReplyOnce: false };
  const storageApi = { getItem: async key => { reads.push(key); return storage.get(key) ?? null; },
    setItem: async (key, value) => { writes.push(key); storage.set(key, value); },
    multiRemove: async keys => keys.forEach(key => storage.delete(key)) };
  let auth;
  const globals = { exports: {}, Date, Intl, Headers, URLSearchParams, process: { env: { EXPO_PUBLIC_API_URL: "https://timeline.test.invalid/api" } },
    console: { log() {}, warn() {} },
    require(name) {
      if (name === "@react-native-async-storage/async-storage") return { default: storageApi };
      if (name === "@/lib/authSession") return auth;
      if (name === "./goSearchAliases") return { normalize: value => value.toLowerCase(), expandSearchTerms: value => [value.toLowerCase()] };
      if (name === "./bookingTimeline") return timeline;
      throw new Error("Unexpected booking import " + name);
    },
    fetch: async (url, init = {}) => {
      const parsed = new URL(url), body = init.body ? JSON.parse(init.body) : null;
      calls.push({ url: parsed, init, body });
      assert.equal(new Headers(init.headers).get("Authorization"), "Bearer test-only");
      if (behavior.status !== 200) return Response.json({ error: "Timeline unavailable" }, { status: behavior.status });
      if (parsed.pathname.endsWith("/booking-availability")) return Response.json(behavior.availability ?? {
        version: 1, timezone: behavior.plan.timezone, availableDates: [dateISO, "2030-01-09"],
        slots: parsed.searchParams.get("datesOnly") === "true" ? [] : [behavior.plan] });
      if (parsed.pathname.endsWith("/bookings/timeline")) {
        if (behavior.response) return Response.json(behavior.response);
        let row = commands.get(body.request_key);
        if (!row) {
          row = { id: bookingId, business_id: business, service_id: service, staff_id: behavior.plan.staffId, customer_id: user,
            starts_at: behavior.plan.startsAt, ends_at: behavior.plan.endsAt, status: "CONFIRMED", timing_snapshot: plain(behavior.plan),
            customer_name: "Cliente", business_name: "Peluquería", business_address: "Calle de prueba", business_timezone: "Europe/Madrid",
            service_name: "Tinte + Acabado", staff_name: "Ana", notes: body.notes };
          commands.set(body.request_key, row);
        }
        if (behavior.loseReplyOnce) { behavior.loseReplyOnce = false; throw new TypeError("Response lost after commit"); }
        return Response.json([row], { status: 201 });
      }
      if (parsed.pathname.endsWith("/bookings")) return Response.json([...commands.values()]);
      throw new Error("Unexpected live route " + parsed.pathname);
    } };
  auth = loadAuthSession(globals, storageApi);
  vm.runInNewContext(compile(readFileSync("data/booking.ts", "utf8")), globals);
  return { api: globals.exports, auth, storage, reads, writes, calls, commands, behavior };
}

function minuteOptions(from, to, staffId = firstStaff) {
  const result = [];
  for (let minute = from; minute <= to; minute++) {
    const instant = new Date(Date.parse("2030-01-07T00:00:00Z") + minute * 60000).toISOString();
    result.push({ startInstant: instant, startDatetime: instant.slice(0, 19), staffId });
  }
  return result;
}

test("compact choices retain exact 11:37 plus regular alternatives and each boundary after an unavailable gap", () => {
  const candidates = [...minuteOptions(11 * 60 + 37, 12 * 60 + 7), ...minuteOptions(12 * 60 + 19, 12 * 60 + 47)];
  const compact = timeline.compactTimelineOptions(candidates);
  assert.deepEqual(plain(compact.map(slot => slot.startDatetime.slice(11, 16))), ["11:37", "11:45", "12:00", "12:19", "12:30", "12:45"]);
  assert.equal(compact[0], candidates[0], "keep the original exact interval, without rounding or recreating it");
  assert.ok(compact.length < candidates.length / 5, "the customer should not receive every possible minute");
  assert.deepEqual(plain(timeline.compactTimelineOptions([...candidates].reverse()).map(slot => slot.startInstant)), plain(compact.map(slot => slot.startInstant)));
  const second = minuteOptions(11 * 60 + 42, 11 * 60 + 44, secondStaff);
  assert.ok(timeline.compactTimelineOptions([...candidates, ...second]).includes(second[0]), "each professional keeps their own exact free boundary");
});

test("autumn fold labels distinguish both real 02:37 instants without altering their time", () => {
  const folded = ["2030-10-27T00:37:00.000Z", "2030-10-27T01:37:00.000Z"].map(startInstant => ({ startInstant,
    startDatetime: timeline.businessWallTime(startInstant, "Europe/Madrid"), timezone: "Europe/Madrid" }));
  assert.equal(folded[0].startDatetime, "2030-10-27T02:37:00");
  assert.equal(folded[1].startDatetime, folded[0].startDatetime);
  const labels = folded.map(slot => timeline.timelineOptionLabel(slot, folded));
  assert.match(labels[0], /^02:37 .*\+2$/);
  assert.match(labels[1], /^02:37 .*\+1$/);
  assert.notEqual(labels[0], labels[1]);
  assert.equal(timeline.compactTimelineOptions(folded).length, 2, "a clock fold must not collapse distinct instants");
  assert.equal(timeline.timelineOptionLabel({ startDatetime: "2030-01-07T11:37:00" }, []), "11:37");
});

test("all three live availability facades use the same authenticated HTTP authority and retain its exact plan", async () => {
  const f = fixture();
  const available = await f.api.getAvailableSlots(business, service, dateISO, firstStaff);
  const all = await f.api.getAllSlots(business, service, dateISO, firstStaff, [service, extraService]);
  const provider = await f.api.getAvailableReservationSlots({ businessId: business, serviceId: service, selectedDate: dateISO,
    professionalId: "any", durationMinutes: 1, businessActiveDays: [], businessDaySchedules: {}, businessOpenFrom: "00:00", businessOpenTo: "00:01",
    allStaffOptions: [{ id: firstStaff, name: "Ana" }] });
  assert.equal(f.calls.length, 3);
  for (const call of f.calls) {
    assert.ok(call.url.pathname.endsWith("/supabase/booking-availability"));
    assert.equal(call.url.searchParams.get("business_id"), business);
    assert.equal(call.url.searchParams.get("dateISO"), dateISO);
    assert.equal(call.url.searchParams.get("step_minutes"), "15", "visual sampling belongs to the same server authority and retains exact boundaries");
  }
  assert.equal(f.calls[0].url.searchParams.get("staff_id"), firstStaff);
  assert.equal(f.calls[1].url.searchParams.get("service_ids"), `${service},${extraService}`);
  assert.equal(f.calls[2].url.searchParams.has("staff_id"), false);
  for (const slot of [available[0], all[0], provider[0]]) {
    assert.equal(slot.startDatetime, "2030-01-07T11:37:00");
    assert.equal(slot.endDatetime, "2030-01-07T13:43:00");
    assert.equal(slot.startInstant, startsAt);
    assert.deepEqual(plain(slot.timingSnapshot), f.behavior.plan);
  }
  assert.equal(provider[0].professionalId, firstStaff);
  assert.equal(provider[0].professionalName, "Ana");
  assert.equal(f.reads.some(key => /go_(bookings|availability_windows|bookable_items|manual_blocks)_v1/.test(key)), false,
    "live reads must not consult cached local availability, even asynchronously");
});

test("datesOnly returns server-approved business dates and sends the range without computing local opening days", async () => {
  const f = fixture();
  const result = await f.api.getTimelineAvailability(business, [service, extraService], dateISO, secondStaff, { days: 21, datesOnly: true });
  assert.deepEqual(plain(result), { slots: [], availableDates: [dateISO, "2030-01-09"], timezone: "Europe/Madrid" });
  const query = f.calls[0].url.searchParams;
  assert.equal(query.get("days"), "21");
  assert.equal(query.get("datesOnly"), "true");
  assert.equal(query.get("step_minutes"), "1");
  assert.equal(query.get("staff_id"), secondStaff);
  assert.equal(query.get("service_ids"), `${service},${extraService}`);
  assert.equal(f.calls.length, 1);
});

test("missing or incompatible live availability fails closed despite a fully populated local schedule", async () => {
  for (const status of [404, 501, 503]) {
    const f = fixture(); f.behavior.status = status;
    for (const read of [() => f.api.getAvailableSlots(business, service, dateISO), () => f.api.getAllSlots(business, service, dateISO),
      () => f.api.getAvailableReservationSlots({ businessId: business, serviceId: service, selectedDate: dateISO, professionalId: "any" })])
      await assert.rejects(read(), error => error.status === status);
    assert.equal(f.calls.length, 3, "no retries or alternative local endpoint");
    assert.equal(f.reads.some(key => key === "go_bookable_items_v1" || key === "go_availability_windows_v1" || key === "go_bookings_v1"), false);
  }
  const incompatible = fixture(); incompatible.behavior.availability = { version: 2, slots: [], availableDates: [] };
  await assert.rejects(incompatible.api.getTimelineAvailability(business, [service], dateISO), error => error.code === "TIMELINE_UNAVAILABLE");
});

test("review preserves the server's automatic professional and exact instants without claiming a local HOLD", async () => {
  const f = fixture(), slot = (await f.api.getAllSlots(business, service, dateISO, undefined, [service, extraService]))[0];
  const before = f.storage.get("go_bookings_v1");
  const input = { businessId: business, bookableItemId: service, services: slot.timingSnapshot.serviceDetails, customerId: "me", staffId: slot.staffId,
    startDatetime: slot.startDatetime, endDatetime: slot.endDatetime, startInstant: slot.startInstant, endInstant: slot.endInstant,
    timingSnapshot: slot.timingSnapshot, unitsReserved: 1, peopleCount: 1 };
  const held = await f.api.createHold(input);
  assert.equal(held.ok, true);
  assert.equal(held.booking.staffId, firstStaff);
  assert.deepEqual(plain(held.booking.timingSnapshot), f.behavior.plan);
  assert.equal(f.storage.get("go_bookings_v1"), before);
  await assert.rejects(f.api.createHold({ ...input, staffId: secondStaff }), error => error.code === "STALE_AVAILABILITY");
  await assert.rejects(f.api.createHold({ ...input, timingSnapshot: undefined }), error => error.code === "STALE_AVAILABILITY");
  assert.equal(f.calls.length, 1, "review and invalid review do not send reservation writes");
});

test("uncertain confirmation retries send one stable command and retain the authoritative receipt and frozen snapshot", async () => {
  const f = fixture(), plan = f.behavior.plan;
  const input = { id: "stable-review-command", businessId: business, bookableItemId: service, customerId: "me", staffId: firstStaff,
    services: plan.serviceDetails, startDatetime: "2030-01-07T00:01:00", endDatetime: "2030-01-07T00:02:00",
    startInstant: plan.startsAt, endInstant: plan.endsAt, timingSnapshot: plan,
    unitsReserved: 1, peopleCount: 1, status: "CONFIRMED", paymentStatus: "none", notes: "Conservar nota" };
  f.behavior.loseReplyOnce = true;
  await assert.rejects(f.api.claimSlot(input));
  const confirmed = await f.api.claimSlot(input), again = await f.api.claimSlot(input);
  assert.equal(confirmed.ok, true); assert.equal(again.booking.id, confirmed.booking.id);
  assert.equal(f.commands.size, 1);
  assert.equal(confirmed.booking.staffId, firstStaff);
  assert.equal(confirmed.booking.startInstant, plan.startsAt);
  assert.equal(confirmed.booking.endInstant, plan.endsAt);
  assert.deepEqual(plain(confirmed.booking.timingSnapshot), plan, "confirmation keeps the reviewed server snapshot");
  assert.deepEqual(plain(confirmed.booking.services), plan.serviceDetails.map(service => ({ ...service, priceKnown: service.price != null })));
  assert.equal(confirmed.booking.receipt.timezone, "Europe/Madrid");
  assert.equal(confirmed.booking.receipt.serviceName, "Tinte + Acabado");
  for (const call of f.calls) {
    assert.ok(call.url.pathname.endsWith("/supabase/bookings/timeline"));
    assert.deepEqual(call.body, { business_id: business, service_ids: [service, extraService], starts_at: plan.startsAt,
      staff_id: firstStaff, request_key: input.id, notes: input.notes, status: "CONFIRMED", expected_plan: plan, ends_at: plan.endsAt });
  }
  const restored = (await f.api.getLiveCustomerBookings())[0];
  assert.deepEqual(plain(restored.timingSnapshot), plan, "normal booking reads preserve the same frozen plan");
  assert.equal(restored.receipt.businessName, "Peluquería");
});

test("a missing confirmation engine or an incomplete sequence response never creates a successful local booking", async () => {
  const input = { id: "review", businessId: business, bookableItemId: service, customerId: "me", staffId: firstStaff,
    services: serverPlan().serviceDetails, startDatetime: "2030-01-07T11:37:00", endDatetime: "2030-01-07T13:43:00",
    startInstant: startsAt, unitsReserved: 1, peopleCount: 1, status: "CONFIRMED", paymentStatus: "none" };
  for (const status of [404, 501, 503]) {
    const f = fixture(); f.behavior.status = status; const before = f.storage.get("go_bookings_v1");
    await assert.rejects(f.api.claimSlot(input), error => error.status === status);
    assert.equal(f.storage.get("go_bookings_v1"), before);
    assert.equal(f.storage.has("go_log_v1"), false);
    assert.equal(f.calls.length, 1);
  }
  for (const snapshot of [undefined, { ...serverPlan(), serviceIds: [service] }]) {
    const f = fixture(); f.behavior.response = { id: bookingId, timing_snapshot: snapshot };
    await assert.rejects(f.api.claimSlot(input), error => error.code === "INVALID_TIMELINE_CONTRACT");
    assert.equal(f.storage.get("go_bookings_v1"), "[]");
  }
  const invalid = fixture();
  await assert.rejects(invalid.api.claimSlot({ ...input, id: undefined }), error => error.code === "REQUEST_KEY_REQUIRED");
  await assert.rejects(invalid.api.claimSlot({ ...input, services: [input.services[0], input.services[0]] }), error => error.code === "INVALID_SERVICES");
  assert.equal(invalid.calls.length, 0);
});

test("customer full duration and both professional views reuse one booking and its work/wait phases", async () => {
  const f = fixture(), plan = f.behavior.plan;
  const confirmed = await f.api.claimSlot({ id: "projection-command", businessId: business, bookableItemId: service, services: plan.serviceDetails,
    staffId: firstStaff, customerId: "me", startDatetime: startsAt, endDatetime: plan.endsAt, startInstant: startsAt,
    unitsReserved: 1, peopleCount: 1, status: "CONFIRMED", paymentStatus: "none" });
  const businessDetails = { id: business, name: "Peluquería", location: "Calle de prueba", phone: "", timezone: "Europe/Madrid" };
  const customer = customerProjection.customerBookingEntry(confirmed.booking, businessDetails, { id: service, title: "Tinte + Acabado" }, "Ana");
  const providerProjection = load("hooks/useBusinessBookings.ts", { react: {}, "react-native": {}, "@/data/booking": f.api,
    "@/data/customerBookingProjection": customerProjection, "@/lib/sessionEvents": {} });
  const provider = providerProjection.businessBookingEntry(confirmed.booking, businessDetails, "business-owner");
  assert.equal(customer.reservationId, bookingId);
  assert.equal(provider.reservationId, bookingId);
  assert.equal(customer.time, "11:37"); assert.equal(customer.endTime, "13:43"); assert.equal(customer.duration, "126min");
  const afterBusinessTimezoneEdit = customerProjection.customerBookingEntry(confirmed.booking, { ...businessDetails, timezone: "Pacific/Auckland" }, { id: service, title: "Edited catalogue" }, "Ana");
  assert.equal(afterBusinessTimezoneEdit.time, customer.time, "a committed booking retains its own business timezone snapshot");
  assert.equal(afterBusinessTimezoneEdit.duration, customer.duration);
  assert.equal(provider.bookingTimeline, customer.bookingTimeline, "perspectives reference the same immutable booking snapshot");
  assert.deepEqual(plain(customer.bookingTimeline.phases.map(phase => phase.durationMinutes)), [17, 42, 55, 12]);
  assert.equal(provider.bookingTimeline.workIntervals.length, 3);
  assert.equal(provider.bookingTimeline.workMinutes, 84); assert.equal(provider.bookingTimeline.waitMinutes, 42);
  const ast = ts.createSourceFile("reservas.tsx", readFileSync("components/booking/GoReservasConfigScreen.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let selection; (function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "filteredLog") selection = node.initializer; ts.forEachChild(node, visit); })(ast);
  assert.ok(selection);
  for (const selectedPro of [firstStaff, secondStaff]) {
    const scope = { exports: {}, goLog: [provider], selectedPro, demoStore: undefined, liveProfessionals: [{ id: firstStaff }, { id: secondStaff }], useMemo: fn => fn() };
    vm.runInNewContext(compile("exports.entries = " + selection.getText(ast)), scope);
    assert.equal(scope.exports.entries.length, 1);
    assert.equal(scope.exports.entries[0], provider, "professional filtering projects the original booking without splitting it");
  }
  const personal = { id: "personal", type: "TAREA" };
  const customerMerged = customerProjection.mergeCustomerBookingEntries([personal, { ...customer, id: "go_booking_cli_" + bookingId }, { ...customer, id: "go_booking_prv_" + bookingId }], [customer], true);
  assert.equal(customerMerged.length, 2); assert.equal(customerMerged.filter(entry => entry.reservationId === bookingId).length, 1);
  const providerMerged = providerProjection.mergeBusinessBookingEntries([personal, { ...provider, id: "old-provider" }], [provider]);
  assert.equal(providerMerged.length, 2); assert.equal(providerMerged.filter(entry => entry.reservationId === bookingId).length, 1);
  assert.equal(f.storage.has("go_log_v1"), false, "read projections never persist client/provider task copies");
});
