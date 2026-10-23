import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const ts = createRequire(path.join(process.cwd(), "package.json"))("typescript");
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const timing = { exports: {}, Intl };
vm.runInNewContext(compile(readFileSync("data/serviceTiming.ts", "utf8")), timing);
const { validateServiceTiming, serviceTimingDuration, serializeServiceConfiguration, validateBookingResources, validateBusinessTimezone } = timing.exports;
const plain = value => JSON.parse(JSON.stringify(value));
const business = "11111111-1111-4111-8111-111111111111", resource = "22222222-2222-4222-8222-222222222222", staff = "33333333-3333-4333-8333-333333333333";
const resources = [{ id: resource, name: "Lavacabezas", capacity: 2 }];
const phase = (id, durationMinutes, kind = "work", patch = {}) => ({ id, name: id, durationMinutes, kind, resources: [], ...patch });
const config = (phases, patch = {}) => ({ version: 1, mode: "phases", phases, resourcesConfigured: true, ...patch });

test("legacy services keep exact minutes, price and customer capacity without inventing timing or resources", () => {
  for (const duration of [17, 42, 55, 12]) {
    const service = { name: "Servicio", duration, price: 12.5, capacity: 3 };
    assert.deepEqual(plain(serializeServiceConfiguration([service])), [service]);
  }
  for (const duration of [0, -1, 27.5, "27", NaN, Infinity])
    assert.throws(() => serializeServiceConfiguration([{ name: "Servicio", duration, price: 12.5 }]));
});

test("ordered work/wait phases preserve exact minutes, fixed staff and configured occupancy across a JSON save", () => {
  const source = config([phase("Aplicar", 17, "work", { staffId: staff, resources: [{ resourceId: resource, quantity: 1, occupancy: "phase" }] }),
    phase("Procesar", 42, "wait", { resources: [{ resourceId: resource, quantity: 1, occupancy: "booking" }] }), phase("Acabar", 55), phase("Lavar", 12)]);
  const saved = serializeServiceConfiguration([{ name: "Tinte", duration: 30, price: 38, capacity: 1, timing: source }], { resources, staffIds: [staff] });
  assert.equal(saved[0].duration, 126);
  assert.equal(saved[0].price, 38);
  assert.equal(saved[0].capacity, 1);
  assert.deepEqual(plain(saved[0].timing), source);
  assert.deepEqual(plain(serializeServiceConfiguration(JSON.parse(JSON.stringify(saved)), { resources, staffIds: [staff] })), plain(saved));
  saved[0].timing.phases[0].resources[0].quantity = 2;
  assert.equal(source.phases[0].resources[0].quantity, 1, "serialized metadata must not mutate its draft");
});

test("unknown/fractional durations, duplicate phase identities, invalid staff and mismatched totals fail closed", () => {
  for (const duration of [0, -1, 1.5, NaN, Infinity, "17", 1441]) assert.throws(() => validateServiceTiming(config([phase("a", duration)])));
  assert.throws(() => validateServiceTiming(config([phase("same", 17), phase("same", 12)])));
  assert.throws(() => validateServiceTiming(config([phase("a", 17, "work", { staffId: "local-person" })])));
  assert.throws(() => validateServiceTiming(config([phase("a", 17, "work", { staffId: staff })]), { staffIds: [] }));
  assert.throws(() => validateServiceTiming(config([phase("a", 17)]), { durationMinutes: 30 }));
  assert.throws(() => validateServiceTiming(config([phase("a", 1000), phase("b", 1000)])));
});

test("advanced timing needs an explicit declaration even when it uses no resources", () => {
  const source = config([phase("a", 17)]);
  assert.equal(serviceTimingDuration(validateServiceTiming(source, { resources: [] })), 17);
  assert.throws(() => validateServiceTiming({ ...source, resourcesConfigured: false }));
  assert.equal(validateServiceTiming({ ...source, mode: "simple", resourcesConfigured: false }).mode, "simple");
  assert.throws(() => validateServiceTiming(config([phase("a", 17, "wait")], { mode: "simple" })));
});

test("resource references require stable configured IDs and actual available capacity", () => {
  const requirement = { resourceId: resource, quantity: 2, occupancy: "booking" };
  const source = config([phase("a", 17, "work", { resources: [requirement] })]);
  assert.deepEqual(plain(validateServiceTiming(source, { resources })).phases[0].resources, [requirement]);
  for (const patch of [{ quantity: 0 }, { quantity: 1.5 }, { quantity: 3 }, { occupancy: "service" }, { resourceId: "chair-0" }])
    assert.throws(() => validateServiceTiming(config([phase("a", 17, "work", { resources: [{ ...requirement, ...patch }] })]), { resources }));
  assert.throws(() => validateServiceTiming(source, { resources: [] }));
  assert.throws(() => validateServiceTiming(source, { resources: [{ ...resources[0], active: false }] }));
  assert.throws(() => validateServiceTiming(config([phase("a", 17, "work", { resources: [requirement, requirement] })]), { resources }));
  assert.throws(() => validateBookingResources([{ ...resources[0], id: "silla_0" }]));
  assert.throws(() => validateBookingResources([...resources, ...resources]));
});

test("business zone is explicitly validated and never inferred from the device", () => {
  assert.equal(validateBusinessTimezone(" Europe/Madrid "), "Europe/Madrid");
  assert.equal(validateBusinessTimezone("America/New_York"), "America/New_York");
  assert.throws(() => validateBusinessTimezone(""));
  assert.throws(() => validateBusinessTimezone("device"));
});

test("existing cloud synchronization updates timing-only changes and preserves resource metadata and server timezone", async () => {
  const source = readFileSync("contexts/GoBusinessConfigContext.tsx", "utf8");
  const ast = ts.createSourceFile("config.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ensureBookingRecord");
  const first = config([phase("work", 17), phase("wait", 12, "wait")]);
  const changed = config([phase("work", 12), phase("wait", 17, "wait")]);
  let rows = [{ id: "service", businessId: business, title: "Tinte", durationMinutes: 29, price: 30, customerCapacity: 1, active: true, timing: first }];
  const writes = [], companies = [], windowWrites = [];
  const scope = { exports: {}, ...timing.exports, SECTORS: [], isCloudId: timing.exports.isStableBookingId,
    deriveCancellationPolicy: () => ({}), console: { log() {} },
    getBusinesses: async () => [{ id: business, timezone: "America/New_York", bookingResources: resources, bookingBlocks: [{ startsAt: "2030-01-07T10:00:00Z", endsAt: "2030-01-07T11:00:00Z" }] }],
    saveBusiness: async value => companies.push(value), getBookableItems: async () => rows,
    saveBookableItem: async value => { writes.push(value); rows = [value]; }, getStaff: async () => [], getAvailabilityWindows: async () => [],
    createAvailabilityWindow: async value => windowWrites.push(value), migrateDayScheduleEntry: value => ({ shift1: { ...value, active: true }, shift2: { active: false } }),
    fromTimeStr: value => ({ hour: Number(value.slice(0, 2)), minute: Number(value.slice(3, 5)) }) };
  vm.runInNewContext(compile(declaration.getText(ast) + ";exports.sync=ensureBookingRecord;"), scope);
  const saved = { businessId: business, businessName: "Local", services: [{ name: "Tinte", duration: 29, price: 30, capacity: 1, timing: changed }],
    plantillaItems: [], activeDays: [0], openFrom: "09:17", openTo: "18:42", daySchedules: {}, bookingResources: resources };
  await scope.exports.sync(saved, async () => {}, "owner");
  assert.equal(writes.length, 1, "equal totals must not suppress phase-only changes");
  assert.deepEqual(plain(writes[0].timing), changed);
  assert.equal(companies[0].timezone, "America/New_York");
  assert.deepEqual(plain(companies[0].bookingResources), resources);
  assert.equal(companies[0].bookingBlocks.length, 1);
  assert.equal(windowWrites[0].visibleStartMinute, 17);
  assert.equal(windowWrites[0].visibleEndMinute, 42);
  await scope.exports.sync({ ...saved, timezone: "Europe/Madrid" }, async () => {}, "owner");
  assert.equal(companies[1].timezone, "Europe/Madrid");
  await scope.exports.sync({ ...saved, services: saved.services.map(service => ({ ...service, timing: undefined })) }, async () => {}, "owner");
  assert.equal(writes.length, 2, "switching back to simple timing removes the old metadata");
  assert.equal(writes[1].timing, undefined);
});

test("saving exact overnight business and professional hours preserves persisted absence blocks", async () => {
  const ast = ts.createSourceFile("config.tsx", readFileSync("contexts/GoBusinessConfigContext.tsx", "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const declaration = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "ensureBookingRecord");
  const blocks = [{ startsAt: "2035-01-08T10:17:00Z", endsAt: "2035-01-08T11:43:00Z" }];
  const writes = [], windowWrites = [];
  const scope = { exports: {}, ...timing.exports, SECTORS: [], isCloudId: timing.exports.isStableBookingId,
    deriveCancellationPolicy: () => ({}), console: { log() {} }, getBusinesses: async () => [{ id: business, timezone: "Europe/Madrid" }],
    saveBusiness: async () => {}, getBookableItems: async () => [{ id: "cut", title: "Corte", durationMinutes: 27, price: 12, customerCapacity: 1, active: true }],
    getStaff: async () => [{ id: staff, businessId: business, name: "Ana", active: true, serviceIds: ["cut"], bookingBlocks: blocks }],
    saveStaff: async member => writes.push(member), getAvailabilityWindows: async () => [],
    createAvailabilityWindow: async window => windowWrites.push(window),
    migrateDayScheduleEntry: value => value.shift1 ? value : ({ shift1: { ...value, active: true }, shift2: { active: false } }),
  };
  vm.runInNewContext(compile(declaration.getText(ast) + ";exports.sync=ensureBookingRecord;"), scope);
  await scope.exports.sync({ businessId: business, businessName: "Local", activeDays: [0], daySchedules: {}, openFrom: "22:13", openTo: "06:07",
    staffSchedules: { [staff]: { useCompanySchedule: false, daySchedules: { "0": { shift1: { active: true, from: "23:17", to: "04:29" }, shift2: { active: false } } } } },
    services: [{ name: "Corte", duration: 27, price: 12, capacity: 1 }], plantillaItems: [{ staffNames: ["Ana"], staffServices: [["Corte"]] }] }, async () => {}, "owner");
  assert.equal(writes.length, 1);
  assert.equal(writes[0].id, staff);
  assert.deepEqual(plain(writes[0].bookingBlocks), blocks);
  assert.equal(windowWrites.length, 2);
  assert.deepEqual(plain(windowWrites.map(window => [window.staffId ?? null, window.weekday, window.visibleStartHour, window.visibleStartMinute, window.visibleEndHour, window.visibleEndMinute, window.endNextDay])),
    [[null, 1, 22, 13, 6, 7, true], [staff, 1, 23, 17, 4, 29, true]]);
});

test("schedule ranges reject equal or malformed clocks and retain minute precision across midnight", () => {
  assert.deepEqual(plain(timing.exports.validateScheduleRange("22:13", "06:07")),
    { startHour: 22, startMinute: 13, endHour: 6, endMinute: 7, endNextDay: true });
  assert.equal(timing.exports.validateScheduleRange("09:17", "18:42").endNextDay, false);
  for (const [from, to] of [["09:17", "09:17"], ["25:00", "06:00"], ["09:60", "10:00"], ["9:00", "18:00"]])
    assert.throws(() => timing.exports.validateScheduleRange(from, to));
});
