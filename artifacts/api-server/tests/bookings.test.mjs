import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('booking API validates ownership, durations, conflicts and cancellation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-booking-'));
  const output = path.join(dir, 'routes.mjs');
  await build({ entryPoints: ['src/routes/supabase.ts'], outfile: output, bundle: true, platform: 'node', format: 'esm', banner: { js: `import {createRequire} from 'node:module';const require=createRequire(import.meta.url);` } });
  const { default: router } = await import(pathToFileURL(output).href);
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const realFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://test.supabase.invalid';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public-key';
  const id = '11111111-1111-4111-8111-111111111111';
  let mode = 'ok'; let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(process.env.SUPABASE_URL)) return realFetch(url, init);
    const route = new URL(url);
    if (route.pathname.endsWith('/user')) return Response.json({ id });
    if (route.pathname.endsWith('/services')) return Response.json(mode === 'wrong-service' ? [] : [{ id, duration_minutes: 60 }]);
    if (route.pathname.endsWith('/bookings')) {
      writes++;
      assert.equal(init.headers.Authorization, 'Bearer test-token');
      if (init.method === 'PATCH') {
        assert.equal(route.searchParams.get('customer_id'), `eq.${id}`);
        assert.deepEqual(JSON.parse(init.body), { status: 'CANCELLED' });
        return Response.json(mode === 'not-owned' ? [] : [{ id, status: 'CANCELLED' }]);
      }
      return mode === 'conflict' ? Response.json({ code: '23P01' }, { status: 409 }) : Response.json([{ id }], { status: 201 });
    }
    throw new Error(`Unexpected upstream: ${route.pathname}`);
  };
  const request = (route, body, auth=true, method='POST') => realFetch(base + route, { method, headers: { 'Content-Type':'application/json', ...(auth ? {Authorization:'Bearer test-token'} : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const booking = { business_id:id, service_id:id, starts_at:'2035-01-01T10:00:00Z', ends_at:'2035-01-01T11:00:00Z' };
  try {
    assert.equal((await request('/bookings', booking, false)).status, 401);
    assert.equal((await request('/bookings', {...booking, ends_at:booking.starts_at})).status, 400);
    assert.equal((await request('/bookings', {...booking, customer_id:'another-user'})).status, 403);
    mode='wrong-service'; assert.equal((await request('/bookings', booking)).status, 400);
    assert.equal(writes, 0);
    mode='ok'; assert.equal((await request('/bookings', booking)).status, 201);
    mode='conflict'; const conflict = await request('/bookings', booking); assert.equal(conflict.status,409); assert.equal((await conflict.json()).error,'BOOKING_CONFLICT');
    mode='not-owned'; assert.equal((await request(`/bookings/${id}/cancel`, null, true, 'PATCH')).status,404);
    mode='ok'; assert.equal((await request(`/bookings/${id}/cancel`, null, true, 'PATCH')).status,200);
    assert.equal((await request(`/bookings/${id}/cancel`, null, false, 'PATCH')).status,401);
  } finally {
    globalThis.fetch=realFetch;
    await new Promise(resolve=>server.close(resolve));
    await rm(dir,{recursive:true,force:true});
  }
});
