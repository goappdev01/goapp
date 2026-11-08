import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runSupportRetention } from '../scripts/run-support-retention.mjs';

test('retention runner is read-only by default, bounded, authenticated and fails closed', async () => {
  const calls = [], options = { base: 'http://127.0.0.1:3009/api', token: 'synthetic-token' };
  let pending = 0, purges = 0, status = 200;
  const transport = async (url, init) => {
    calls.push({ url, method: init.method });
    assert.equal(init.headers.Authorization, 'Bearer synthetic-token'); assert.equal(init.redirect, 'error');
    return Response.json(url.endsWith('/capabilities') ? { ready: true, version: 1, retentionMonths: 12 }
      : { purged: purges++ === 0 ? 1 : 0, pending }, { status });
  };
  assert.deepEqual(await runSupportRetention({ ...options, transport }), { mode: 'read-only', ready: true, purged: 0, pending: 0 });
  assert.equal(calls.length, 1);
  assert.equal((await runSupportRetention({ ...options, execute: true, transport })).purged, 1);
  pending = 1; await assert.rejects(runSupportRetention({ ...options, execute: true, transport }), /cleanup is pending/);
  status = 401; await assert.rejects(runSupportRetention({ ...options, execute: true, transport }), /HTTP 401/);
  await assert.rejects(runSupportRetention({ ...options, base: 'http://external.invalid/api', transport }), /HTTPS/);
  await assert.rejects(runSupportRetention({ ...options, token: '', transport }), /identity/);
});
