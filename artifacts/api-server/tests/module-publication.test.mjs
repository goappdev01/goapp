import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('release boundaries: discovery, direct writes, internal authorization and preserved history', async t => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-module-publication-'));
  const outfile = path.join(dir, 'router.mjs');
  await build({ stdin: { contents: `import {Router} from 'express';
    import publication from './src/routes/modulePublication';import business from './src/routes/supabase';import admin from './src/routes/admin';
    const router=Router();router.use('/admin',admin);router.use(publication);
    for(const route of ['/bookings/timeline','/bookings/catalog','/catalog/quote'])router.post(route,(_req,res)=>res.json({routed:true}));
    router.get('/booking-availability',(_req,res)=>res.json({slots:[]}));router.use(business);export default router;`,
    resolveDir: process.cwd(), loader: 'ts' }, outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  const { default: router } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(done => server.once('listening', done));
  const realFetch = globalThis.fetch, calls = [];
  const keys = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'GO_MODULE_PUBLICATION'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  process.env.SUPABASE_URL = 'https://publication-test.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public'; delete process.env.GO_MODULE_PUBLICATION;
  const userId = '11111111-1111-4111-8111-111111111111', hair = '22222222-2222-4222-8222-222222222222', restaurant = '33333333-3333-4333-8333-333333333333';
  const businesses = [{ id: hair, booking_enabled: true, ui_metadata: { category: 'Belleza Peluquería' } }, { id: restaurant, booking_enabled: true, ui_metadata: { category: 'restaurante' } }];
  let membership = null, upstreamFailure = false;
  let resources = [{ id: 'hair-resource', business_id: hair }, { id: 'restaurant-resource', business_id: restaurant }];
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url); assert.equal(parsed.origin, process.env.SUPABASE_URL, 'only the fictitious provider is used');
    calls.push({ path: parsed.pathname, query: parsed.searchParams, init });
    if (parsed.pathname === '/auth/v1/user') return Response.json({ id: userId, user_metadata: { role: 'admin', owner: true } });
    if (parsed.pathname === '/rest/v1/admin_memberships') return Response.json(membership ? [membership] : []);
    if (parsed.pathname === '/rest/v1/businesses') {
      if (upstreamFailure) return Response.json({ error: 'unavailable' }, { status: 503 });
      const id = parsed.searchParams.get('id')?.slice(3); return Response.json(id ? businesses.filter(row => row.id === id) : businesses);
    }
    if (['/rest/v1/services', '/rest/v1/staff', '/rest/v1/availability'].includes(parsed.pathname)) return Response.json(resources);
    if (parsed.pathname === '/rest/v1/bookings') return Response.json([{ id: 'old-reservation', business_id: restaurant, customer_id: userId }]);
    throw new Error('Unexpected upstream operation ' + parsed.pathname);
  };
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = (route, internal = false, authenticated = true) => realFetch(base + route, { headers: { ...(authenticated ? { Authorization: 'Bearer test-token' } : {}), ...(internal ? { 'x-go-internal-modules': '1' } : {}) } });
  const post = (route, business = restaurant, internal = false) => realFetch(base + route, { method: 'POST', headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json', ...(internal ? { 'x-go-internal-modules': '1' } : {}) }, body: JSON.stringify({ business_id: business, businessId: business, role: 'admin', internal: true }) });
  try {
    await t.test('public metadata is read-only and contains no users or business records', async () => {
      const r = await get('/module-publication', false, false); assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
      const value = await r.json(); assert.equal(value.stages['reservas.peluqueria'], 'pilot'); assert.equal(JSON.stringify(value).includes(userId), false); assert.equal(calls.length, 0);
    });
    await t.test('text/ID discovery cannot reveal hidden business resources', async () => {
      assert.deepEqual((await (await get('/businesses', false, false)).json()).map(row => row.id), [hair]);
      for (const route of ['/services', `/businesses/${restaurant}/services`, `/staff?business_id=${restaurant}`, `/availability?business_id=${restaurant}`]) {
        const response = await get(route, false, false); assert.equal(response.status, 200); assert.equal((await response.json()).some(row => row.business_id === restaurant), false);
      }
    });
    await t.test('every new booking route denies hidden modules before executing its handler', async () => {
      for (const route of ['/bookings', '/bookings/timeline', '/bookings/catalog', '/catalog/quote']) {
        const response = await post(route); assert.equal(response.status, 403, route); assert.equal((await response.json()).code, 'MODULE_NOT_ENABLED');
      }
      assert.equal((await get(`/booking-availability?business_id=${restaurant}`)).status, 403);
      assert.equal(calls.some(call => call.init.method === 'POST'), false, 'no booking or RPC write was attempted');
    });
    await t.test('malformed resource JSON fails closed without trusting an unchecked array cast', async () => {
      const original = resources;
      try {
        for (const malformed of [null, {}, [null], [{ id: 'broken', business_id: 5 }], ['not-a-row']]) {
          resources = malformed; const response = await get('/services', false, false);
          assert.equal(response.status, 503); assert.equal((await response.json()).code, 'MODULE_ACCESS_UNAVAILABLE');
        }
      } finally { resources = original; }
    });
    await t.test('hairdresser enters existing booking handlers without changing its contract', async () => {
      assert.equal((await post('/bookings/timeline', hair)).status, 200); assert.equal((await post('/bookings/catalog', hair)).status, 200);
      assert.equal((await get(`/booking-availability?business_id=${hair}`)).status, 200);
    });
    await t.test('forged role/header never authorizes hidden sectors or ADMIN metadata', async () => {
      assert.equal((await post('/bookings/timeline', restaurant, true)).status, 403);
      assert.equal((await get('/admin/module-publication')).status, 403);
      assert.equal((await get('/businesses', true)).status, 403);
    });
    await t.test('live owner can use internal modules; private data still uses anonymous catalogue RLS', async () => {
      membership = { user_id: userId, level: 'owner', active: true, permissions: [] };
      assert.equal((await post('/bookings/timeline', restaurant, true)).status, 200);
      const result = await get('/businesses', true); assert.equal((await result.json()).length, 2);
      assert.equal(calls.at(-1).path, '/rest/v1/businesses'); assert.equal(calls.at(-1).init.headers.Authorization, undefined);
      const admin = await get('/admin/module-publication'); assert.equal(admin.status, 200); assert.equal((await admin.json()).mutable, false);
      membership.active = false; assert.equal((await post('/bookings/catalog', restaurant, true)).status, 403);
    });
    await t.test('unpublishing never removes owned history or requests a destructive write', async () => {
      const response = await get('/bookings'); assert.equal(response.status, 200); assert.equal((await response.json())[0].business_id, restaurant);
      assert.equal(calls.some(call => ['DELETE', 'PATCH', 'PUT'].includes(call.init.method)), false);
    });
    await t.test('availability failure closes only this operation, not the session', async () => {
      upstreamFailure = true; const response = await post('/bookings/timeline', hair); assert.equal(response.status, 503); assert.equal((await response.json()).code, 'MODULE_ACCESS_UNAVAILABLE'); upstreamFailure = false;
    });
    await t.test('later activation comes from server config, never a request boolean', async () => {
      process.env.GO_MODULE_PUBLICATION = JSON.stringify({ version: 1, audience: 'pilot', stages: { 'reservas.restaurante': 'pilot' } });
      assert.equal((await post('/bookings/timeline', restaurant)).status, 200);
      process.env.GO_MODULE_PUBLICATION = '{invalid'; assert.equal((await post('/bookings/timeline', restaurant)).status, 403);
    });
  } finally {
    globalThis.fetch = realFetch; for (const key of keys) { if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key]; }
    await new Promise(done => server.close(done));
  }
});
