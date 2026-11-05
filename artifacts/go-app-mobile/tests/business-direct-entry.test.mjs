import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { direct: api, context, draft, plain, businessId, serviceId, receiptId } = require('./helpers/business-direct-fixture.cjs');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
const flush = () => new Promise(setImmediate);
const receipt = (command, requestId) => ({ id: receiptId, kind: command.kind, businessId: command.businessId, requestId });

test('a selected slot is preserved exactly; service selection proposes its configured duration', () => {
  const value = draft();
  assert.equal(value.startTime, '10:15'); assert.equal(value.durationMinutes, '45');
  const command = plain(api.buildDirectEntry(context(), value));
  assert.equal(command.customerName, 'Cliente sintético'); assert.equal(command.durationMinutes, 45);
  assert.equal(command.source, 'phone'); assert.equal(command.serviceId, serviceId);
  assert.equal(command.timezone, 'Europe/Madrid'); assert.equal(command.dateISO, '2026-11-06');
  assert.equal('customerId' in command, false); assert.equal('customer_id' in command, false);
});

test('service and professional membership cannot be replaced by identifiers from another company', () => {
  assert.throws(() => api.buildDirectEntry(context(), { ...draft(), serviceId: receiptId }), /servicio/);
  assert.throws(() => api.buildDirectEntry(context(), { ...draft(), staffId: receiptId }), /profesional/);
  assert.throws(() => api.buildDirectEntry(context(), { ...draft(), staffId: '' }), /profesional/);
  const ctx = context(); ctx.services[0].staffIds = [receiptId];
  assert.throws(() => api.buildDirectEntry(ctx, draft()), /profesional/);
});

test('duration overrides require a server-supplied UI allowance and will still need server authorization', () => {
  const value = { ...draft(), durationMinutes: '60' };
  assert.throws(() => api.buildDirectEntry(context(), value), /duración configurada/);
  assert.equal(api.buildDirectEntry({ ...context(), allowDurationOverride: true }, value).durationMinutes, 60);
});

test('invalid dates, DST timezone names and impossible times are not submitted', () => {
  for (const dateISO of ['2026-02-30', '2026-13-06', 'not-a-date']) assert.throws(() => api.buildDirectEntry(context(), { ...draft(), dateISO }));
  for (const startTime of ['24:00', '10:60', '1:30', '']) assert.throws(() => api.buildDirectEntry(context(), { ...draft(), startTime }));
  assert.throws(() => api.buildDirectEntry({ ...context(), timezone: 'invented/zone' }, draft()));
  assert.throws(() => api.buildDirectEntry(context(), { ...draft(), startTime: '23:45' }), /duración/);
});

test('incomplete/negative/fractional durations are rejected without replacing user content', () => {
  for (const durationMinutes of ['', '-5', '1.5', '0', '1441', 'abc']) {
    const value = { ...draft(), durationMinutes };
    assert.throws(() => api.buildDirectEntry(context(), value));
    assert.equal(value.customerName, 'Cliente sintético'); assert.equal(value.durationMinutes, durationMinutes);
  }
});

test('phone and notes are optional; concept-only appointments need explicit contract support', () => {
  const command = api.buildDirectEntry(context(), draft(), 'walk_in');
  assert.equal(command.phone, null); assert.equal(command.notes, null); assert.equal(command.source, 'walk_in');
  assert.throws(() => api.buildDirectEntry(context(), { ...draft(), serviceId: '', concept: 'Consulta' }));
  const other = api.buildDirectEntry({ ...context(), allowConcept: true }, { ...draft(), serviceId: '', concept: 'Consulta' });
  assert.equal(other.serviceId, null); assert.equal(other.concept, 'Consulta');
  assert.throws(() => api.buildDirectEntry(context(), { ...draft(), customerName: ' ' }), /nombre/);
});

test('blocks contain no customer, phone or fake reservation; end must follow start', () => {
  const value = { ...draft(), kind: 'block', endTime: '11:00', concept: 'Descanso' };
  const command = plain(api.buildDirectEntry(context(), value));
  assert.equal(command.durationMinutes, 45); assert.equal(command.reason, 'Descanso');
  for (const name of ['customerName', 'phone', 'serviceId', 'source']) assert.equal(name in command, false);
  assert.throws(() => api.buildDirectEntry(context(), { ...value, endTime: '10:00' }), /posterior/);
  assert.equal(api.buildDirectEntry(context(), { ...value, startTime: '23:45', endTime: '24:00' }).durationMinutes, 15);
});

test('without the real server contract no local fallback can confirm a booking', async () => {
  const commit = api.createDirectEntryCommitter(null, () => 'reference');
  await assert.rejects(commit(api.buildDirectEntry(context(), draft())), /contrato revisado/);
});

test('rapid repeated submissions share a single server call and a confirmed receipt', async () => {
  const wait = deferred(), calls = [];
  const commit = api.createDirectEntryCommitter({ currentIdentity: async () => 'actor-session',
    commit: async (command, requestId) => { calls.push({ command, requestId }); await wait.promise; return receipt(command, requestId); },
  }, () => 'operation_1');
  const command = api.buildDirectEntry(context(), draft()), a = commit(command), b = commit(command);
  assert.equal(a, b); await flush(); assert.equal(calls.length, 1);
  wait.resolve(); assert.equal((await a).id, receiptId); await b;
  await commit(command); assert.equal(calls.length, 1);
});

test('lost responses retry the SAME operation identifier, never an owner-based substitute booking', async () => {
  const keys = []; let failing = true, generated = 0;
  const commit = api.createDirectEntryCommitter({ currentIdentity: async () => 'actor-session',
    commit: async (command, key) => { keys.push(key); if (failing) throw Error('response lost'); return receipt(command, key); },
  }, () => `operation_${++generated}`);
  const command = api.buildDirectEntry(context(), draft());
  await assert.rejects(commit(command), /response lost/); failing = false;
  await commit(command); assert.deepEqual(keys, ['operation_1', 'operation_1']); assert.equal(generated, 1);
});

test('backend conflicts and forbidden responses propagate; no local success receipt is fabricated', async () => {
  for (const code of ['BOOKING_CONFLICT', 'FORBIDDEN', 'CONNECTION_LOST']) {
    const failure = Error(code);
    const commit = api.createDirectEntryCommitter({ currentIdentity: async () => 'session', commit: async () => { throw failure; } }, () => 'key');
    await assert.rejects(commit(api.buildDirectEntry(context(), draft())), error => error === failure);
  }
});

test('logout or a different session prevents leaking a result into another company/account', async () => {
  let identity = 'session-a'; const wait = deferred();
  const commit = api.createDirectEntryCommitter({ currentIdentity: async () => identity,
    commit: async (command, key) => { await wait.promise; return receipt(command, key); },
  }, () => 'same_operation');
  const pending = commit(api.buildDirectEntry(context(), draft())); await flush(); identity = 'session-b'; wait.resolve();
  await assert.rejects(pending, /sesión ha cambiado/);
});

test('wrong business, missing id, wrong kind and mismatched idempotency receipts never confirm', async () => {
  for (const overrides of [{ businessId: receiptId }, { id: 'local-id' }, { kind: 'block' }, { requestId: 'wrong' }]) {
    const commit = api.createDirectEntryCommitter({ currentIdentity: async () => 'session',
      commit: async (command, key) => ({ ...receipt(command, key), ...overrides }),
    }, () => 'key');
    await assert.rejects(commit(api.buildDirectEntry(context(), draft())), /confirmar el resultado/);
  }
});

test('changing a pending command does not submit a second competing operation', async () => {
  const wait = deferred();
  const commit = api.createDirectEntryCommitter({ currentIdentity: async () => 'session',
    commit: async (command, key) => { await wait.promise; return receipt(command, key); },
  }, () => 'key');
  const command = api.buildDirectEntry(context(), draft());
  const pending = commit(command);
  await assert.rejects(commit({ ...command, notes: 'another version' }), /operación anterior/);
  wait.resolve(); await pending;
});
