import { test } from 'node:test';
import assert from 'node:assert/strict';
import { respond, createGateway } from './gateway.mjs';
const publication = '/api/supabase/module-publication', admin = '/api/supabase/admin/module-publication';
test('only non-sensitive publication metadata adds a public read; ADMIN route retains owner verification', async () => {
  const calls = [], request = async (url, init) => { calls.push({ url, init }); return Response.json(url.endsWith('/admin/access') ? { allowed: false } : { version: 1, audience: 'pilot', stages: {} }); };
  const publicResult = await respond({ method: 'GET', url: publication }, request); assert.equal(publicResult.status, 200); assert.equal(calls.length, 1);
  assert.equal((await respond({ method: 'GET', url: admin }, request)).status, 401);
  assert.equal((await respond({ method: 'GET', url: admin, authorization: 'Bearer fake-token', internalModules: '1' }, request)).status, 403);
  assert.equal((await respond({ method: 'POST', url: publication }, request)).status, 405);
});
test('private web CORS accepts the publication header only on existing GET reads and keeps other origins blocked', async () => {
  const server = createGateway(async () => Response.json({ version: 1, audience: 'pilot', stages: {} }));
  await new Promise(done => server.listen(0, '127.0.0.1', done));
  const base = `http://127.0.0.1:${server.address().port}`;
  const preflight = (origin, method = 'GET') => ({ method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': method, 'Access-Control-Request-Headers': 'authorization,x-go-internal-modules' } });
  try {
    for (const route of [publication, admin]) { const response = await fetch(base + route, preflight('http://100.105.48.111:8086')); assert.equal(response.status, 204); assert.match(response.headers.get('access-control-allow-headers'), /X-GO-Internal-Modules/); }
    assert.equal((await fetch(base + publication, preflight('https://evil.invalid'))).status, 403);
    assert.equal((await fetch(base + '/api/supabase/auth/login', preflight('http://100.105.48.111:8086', 'POST'))).status, 403);
  } finally { await new Promise(done => server.close(done)); }
});
