import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const user = '11111111-1111-4111-8111-111111111111';
const business = '22222222-2222-4222-8222-222222222222';
const service = '33333333-3333-4333-8333-333333333333';
const booked = '44444444-4444-4444-8444-444444444444';
const demo = { id: 'demo_biz_padel', name: 'Demo local', bookingActive: true };
const plain = value => JSON.parse(JSON.stringify(value));

function fixture() {
  const storage = new Map([
    ['go_supabase_session_v1', JSON.stringify({ access_token: 'test-only', user: { id: user } })],
    ['go_businesses_v1', JSON.stringify([demo])],
    ['go_bookable_items_v1', JSON.stringify([{ id: service, businessId: business, title: 'Cache local', active: true }])],
  ]);
  const calls = [];
  const behavior = { businesses: [], services: [], status: 200 };
  // Simulate the phone's +02:00 locale for zone-less slots, independently of CI.
  class PhoneDate extends Date {
    constructor(...args) {
      if (typeof args[0] === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(args[0])) args[0] += '+02:00';
      super(...args);
    }
    localParts() { return new Date(this.getTime() + 2 * 60 * 60 * 1000); }
    getFullYear() { return this.localParts().getUTCFullYear(); }
    getMonth() { return this.localParts().getUTCMonth(); }
    getDate() { return this.localParts().getUTCDate(); }
    getHours() { return this.localParts().getUTCHours(); }
    getMinutes() { return this.localParts().getUTCMinutes(); }
    getSeconds() { return this.localParts().getUTCSeconds(); }
  }
  const context = {
    exports: {}, Date: PhoneDate, Headers, process: { env: { EXPO_PUBLIC_API_URL: 'https://test.invalid/api' } },
    console: { log() {}, warn() {} },
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: {
        getItem: async key => storage.get(key) ?? null,
        setItem: async (key, value) => storage.set(key, value),
      } };
      if (name === './goSearchAliases') return { normalize: value => value.toLowerCase(), expandSearchTerms: value => [value.toLowerCase()] };
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      if (behavior.status !== 200) return Response.json({ error: 'Backend unavailable' }, { status: behavior.status });
      if (init.method === 'POST') {
        assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer test-only');
        return Response.json([{ id: booked, ...JSON.parse(init.body) }], { status: 201 });
      }
      return Response.json(url.includes('/services') ? behavior.services : behavior.businesses);
    },
  };
  vm.runInNewContext(ts.transpileModule(readFileSync('data/booking.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, context);
  return { api: context.exports, storage, calls, behavior, Date: PhoneDate };
}

test('empty live customer catalogue never offers local demos; legacy local reads stay unchanged', async () => {
  const f = fixture();
  assert.deepEqual(plain(await f.api.getActivebusinesses()), []);
  assert.deepEqual(plain(await f.api.searchBusinesses('padel')), []);
  assert.deepEqual(plain(await f.api.getBusinesses()), [demo]);
});

test('customer catalogue preserves backend failures rather than falling back to demo businesses', async () => {
  const f = fixture(); f.behavior.status = 503;
  await assert.rejects(f.api.searchBusinesses('padel'), error => error.status === 503);
  assert.equal(f.storage.has('go_supabase_session_v1'), true);
  assert.deepEqual(plain(await f.api.getBusinesses()), [demo]);
});

test('live business services do not fall back to stale local items in customer mode', async () => {
  const f = fixture();
  assert.deepEqual(plain(await f.api.getBookableItems(business, true)), []);
  assert.equal((await f.api.getBookableItems(business)).length, 1);
  f.behavior.status = 503;
  await assert.rejects(f.api.getBookableItems(business, true), error => error.status === 503);
});

test('only live bookable UUID businesses enter the customer catalogue', async () => {
  const f = fixture();
  f.behavior.businesses = [{ id: business, name: 'Published', booking_enabled: true },
    { id: service, name: 'Disabled', booking_enabled: false }, { id: demo.id, name: 'Local' }];
  assert.deepEqual(plain((await f.api.getActivebusinesses()).map(row => row.id)), [business]);
});

const candidate = { id: 'local-hold', businessId: business, bookableItemId: service,
  customerId: 'me', status: 'CONFIRMED', startDatetime: '2035-10-07T10:00:00',
  endDatetime: '2035-10-07T11:00:00', unitsReserved: 1, peopleCount: 1 };

test('stale demo business/service/professional selections cannot send a real confirmation or erase a hold', async () => {
  for (const fields of [{ businessId: demo.id }, { bookableItemId: 'local-service' }, { staffId: 'st-isa' }]) {
    const f = fixture();
    f.storage.set('go_bookings_v1', JSON.stringify([candidate]));
    await assert.rejects(f.api.checkAndClaimBookingSlot({ ...candidate, ...fields }),
      error => error.code === 'LOCAL_BOOKING_NOT_SUPPORTED');
    assert.equal(f.calls.length, 0);
    assert.deepEqual(JSON.parse(f.storage.get('go_bookings_v1')), [candidate]);
  }
});

test('real confirmation sends session identity, valid IDs, UTC instants and unchanged status/notes', async () => {
  const f = fixture();
  const result = await f.api.checkAndClaimBookingSlot({ ...candidate, notes: 'Nota del usuario' });
  assert.equal(result.ok, true);
  assert.equal(result.booking.id, booked);
  assert.equal(result.booking.startDatetime, candidate.startDatetime);
  assert.equal(result.booking.endDatetime, candidate.endDatetime);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(JSON.parse(f.calls[0].init.body), {
    business_id: business, service_id: service, staff_id: null, customer_id: user,
    starts_at: '2035-10-07T08:00:00.000Z', ends_at: '2035-10-07T09:00:00.000Z',
    status: 'CONFIRMED', notes: 'Nota del usuario',
  });
});

test('explicit offsets preserve their instant and failed confirmations never become a local success', async () => {
  const f = fixture();
  await f.api.checkAndClaimBookingSlot({ ...candidate, startDatetime: '2035-10-07T10:00:00-04:00', endDatetime: '2035-10-07T11:00:00-04:00' });
  assert.equal(JSON.parse(f.calls[0].init.body).starts_at, '2035-10-07T14:00:00.000Z');
  const rejected = fixture(); rejected.behavior.status = 400;
  await assert.rejects(rejected.api.checkAndClaimBookingSlot(candidate), error => error.status === 400);
  assert.equal(rejected.storage.has('go_bookings_v1'), false);
});

test('UTC transport crossing midnight returns the selected local calendar day and hour', async () => {
  const f = fixture();
  const result = await f.api.checkAndClaimBookingSlot({ ...candidate,
    startDatetime: '2035-10-07T00:30:00', endDatetime: '2035-10-07T01:30:00' });
  assert.equal(JSON.parse(f.calls[0].init.body).starts_at, '2035-10-06T22:30:00.000Z');
  assert.equal(result.booking.startDatetime, '2035-10-07T00:30:00');
  assert.equal(result.booking.endDatetime, '2035-10-07T01:30:00');
  const bridge = { exports: {}, Date: f.Date, console: { log() {}, warn() {} }, require(name) {
    if (name === '@/data/booking') return f.api;
    if (name === '@react-native-async-storage/async-storage') return { default: {
      getItem: async key => f.storage.get(key) ?? null,
      setItem: async (key, value) => f.storage.set(key, value),
    } };
    throw new Error(name);
  } };
  vm.runInNewContext(ts.transpileModule(readFileSync('lib/goLogBridge.ts', 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, bridge);
  await bridge.exports.syncBookingToGoLog(result.booking, { id: business, name: 'Published' }, { id: service, title: 'Service' });
  const [entry] = JSON.parse(f.storage.get('go_log_v1'));
  assert.equal(entry.dateISO, '2035-10-07');
  assert.equal(entry.time, '00:30');
  assert.equal(entry.startTime, '00:30');
  assert.equal(entry.endTime, '01:30');
});
