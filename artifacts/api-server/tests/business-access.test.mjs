import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('private management requires server verification while enrollment preserves the identity and cannot approve', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-business-access-'));
  const outfile = path.join(dir, 'router.mjs');
  await build({ entryPoints: ['src/routes/management.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  const { default: router } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use('/api/supabase/manage', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const realFetch = globalThis.fetch;
  const oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://business.test.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public';
  const id = '11111111-1111-4111-8111-111111111111';
  const business = '22222222-2222-4222-8222-222222222222';
  let owned = true, verified = false, upstreamFailure = false;
  let enrollmentReply, enrollmentConnectionFailure = false;
  const upstream = [], writes = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(process.env.SUPABASE_URL)) return realFetch(url, init);
    const route = new URL(url); upstream.push(route.pathname);
    assert.equal(init.headers.Authorization, 'Bearer test');
    if (route.pathname.endsWith('/user')) return Response.json({ id });
    if (upstreamFailure) return Response.json({ code: 'XX000' }, { status: 503 });
    if (route.pathname.endsWith('/businesses') && init.method === 'GET') {
      assert.equal(route.searchParams.get('owner_id'), `eq.${id}`);
      return Response.json(owned && (route.searchParams.get('verified') !== 'eq.true' || verified === true)
        ? [{ id: business, name: 'Real owner', timezone: 'Europe/Madrid', verified }] : []);
    }
    if (route.pathname.endsWith('/business_verification_requests')) {
      return Response.json([{ business_id: business, status: 'rejected', legal_name: 'Real owner', tax_id: 'test-tax' }]);
    }
    if (route.pathname.endsWith('/submit_business_verification')) {
      if (enrollmentConnectionFailure) throw new TypeError('Connection interrupted');
      const body = JSON.parse(init.body); writes.push(body);
      assert.deepEqual(Object.keys(body).sort(), ['p_address', 'p_business_id', 'p_legal_name', 'p_tax_id', 'p_trading_name'].sort());
      if (enrollmentReply !== undefined) return Response.json(enrollmentReply);
      return Response.json([{ id: business, owner_id: id, verified: false }]);
    }
    if (route.pathname.endsWith('/business_settings')) {
      assert.equal(route.searchParams.get('business_id'), `in.(${business})`);
      return Response.json([{ business_id: business, payload: {} }]);
    }
    if (init.method !== 'GET') writes.push(JSON.parse(init.body));
    return Response.json([]);
  };
  const request = (route, body, method = body ? 'POST' : 'GET') => realFetch(
    `http://127.0.0.1:${server.address().port}/api/supabase/manage${route}`, {
      method, headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  try {
    for (const value of [false, undefined, 'true']) {
      verified = value;
      for (const resource of ['services', 'staff', 'availability']) {
        const result = await request(`/businesses/${business}/${resource}`);
        assert.equal(result.status, 403); assert.equal((await result.json()).code, 'BUSINESS_NOT_VERIFIED');
      }
      assert.equal((await request(`/businesses/${business}/services`, { name: 'Cita', duration_minutes: 30, price: 20 })).status, 403);
      assert.equal((await request(`/businesses/${business}/configuration`, { payload: {} }, 'PUT')).status, 403);
      assert.equal((await request(`/businesses/${business}`, { name: 'Cambio' }, 'PATCH')).status, 403);
      const count = upstream.filter(p => p.endsWith('/business_settings')).length;
      assert.deepEqual(await (await request('/configuration')).json(), []);
      assert.equal(upstream.filter(p => p.endsWith('/business_settings')).length, count);
    }
    assert.equal(writes.length, 0);
    const rows = await (await request('/businesses')).json();
    assert.equal(rows[0].verification_request.status, 'rejected');
    const enrollment = { legal_name: 'Empresa real', tax_id: 'B12345678', trading_name: '', address: 'Dirección real' };
    for (const extra of [{ verified: true }, { owner_id: id }, { status: 'verified' }, { business_id: 'bad-id' }]) {
      assert.equal((await request('/enrollment', { ...enrollment, ...extra })).status, 400);
    }
    assert.equal((await request('/enrollment', { ...enrollment, tax_id: '' })).status, 400);
    const submitted = await request('/enrollment', enrollment);
    assert.equal(submitted.status, 200); assert.equal((await submitted.json())[0].verified, false);
    assert.equal(writes[0].p_business_id, null);
    await request('/enrollment', { ...enrollment, business_id: business });
    assert.equal(writes[1].p_business_id, business);
    for (const invalid of [[], {}, [{ id: business, owner_id: id, verified: true }],
      [{ id: business, owner_id: business, verified: false }], [{ id: 'invalid', owner_id: id, verified: false }]]) {
      enrollmentReply = invalid;
      const rejected = await request('/enrollment', enrollment);
      assert.equal(rejected.status, 502);
      assert.match((await rejected.json()).error, /No hemos podido confirmar tu solicitud/);
    }
    enrollmentReply = undefined;
    enrollmentConnectionFailure = true;
    const disconnected = await request('/enrollment', enrollment);
    assert.equal(disconnected.status, 502);
    assert.match((await disconnected.json()).error, /No hemos podido enviar tu solicitud/);
    enrollmentConnectionFailure = false;
    verified = true;
    for (const resource of ['services', 'staff', 'availability']) {
      assert.equal((await request(`/businesses/${business}/${resource}`)).status, 200);
    }
    assert.equal((await (await request('/configuration')).json())[0].business_id, business);
    owned = false;
    assert.equal((await request(`/businesses/${business}/services`)).status, 404);
    assert.deepEqual(await (await request('/businesses')).json(), []);
    owned = true; upstreamFailure = true;
    assert.equal((await request(`/businesses/${business}/services`)).status, 502);
    assert.equal((await request('/enrollment', enrollment)).status, 502);
  } finally {
    globalThis.fetch = realFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
    await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});

test('prepared SQL protects fiscal data and includes no client approval path', async () => {
  const sql = await readFile('supabase/migrations/20261006064253_business_verification_access.sql', 'utf8');
  assert.match(sql, /verified set default false/);
  assert.match(sql, /booking_enabled set default false/);
  assert.match(sql, /check \(not booking_enabled or verified\)/);
  assert.match(sql, /'Europe\/Madrid',false,false/);
  assert.match(sql, /owner_id=caller/);
  assert.match(sql, /status='pending',rejection_reason=null/);
  assert.doesNotMatch(sql, /set\s+verified\s*=\s*true/i);
  assert.match(sql, /revoke all on public.business_verification_requests from public, anon, authenticated/);
  assert.match(sql, /grant select on public.business_verification_requests to authenticated/);
  assert.doesNotMatch(sql, /grant (insert|update|all).*business_verification_requests/i);
  for (const policy of ['services_owner_manage', 'staff_owner_manage', 'availability_owner_manage', 'business_settings_owner', 'bookings_business_manage']) {
    assert.match(sql, new RegExp(`alter policy ${policy}[\\s\\S]*?b\\.verified=true`));
  }
  assert.match(sql, /alter policy bookings_customer_create[\s\S]*?b\.verified=true/);
  assert.match(sql, /guard_customer_booking_update[\s\S]*?b\.owner_id=auth.uid\(\) and b\.verified=true/);
});
