import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('ADMIN namespace checks the live identity and role for every operation, including revocation', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-admin-access-'));
  const outfile = path.join(dir, 'router.mjs');
  await build({ entryPoints: ['src/routes/admin.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  const { default: router } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  let operations = 0;
  // Test-only operation proves middleware covers data and writes, not just /access.
  router.post('/private-probe', (_req, res) => { operations++; res.json({ internal: true }); });
  const app = express(); app.use(express.json()); app.use('/api/supabase/admin', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = globalThis.fetch, oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://admin-test.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-only-public';
  const id = '11111111-1111-4111-8111-111111111111';
  let role = 'usuario', authStatus = 200, profileStatus = 200, profileId = id, offline = false, calls = [];
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://admin-test.invalid')) return originalFetch(url, init);
    calls.push(String(url));
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    if (offline) throw new Error('upstream details must not leak');
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') {
      return Response.json({ id, email: 'admin@example.invalid', user_metadata: { role: 'admin' } }, { status: authStatus });
    }
    assert.equal(u.pathname, '/rest/v1/profiles');
    assert.equal(u.searchParams.get('id'), `eq.${id}`);
    assert.equal(u.searchParams.get('select'), 'id,role');
    return Response.json([{ id: profileId, role }], { status: profileStatus });
  };
  const request = (route = '/access', method = 'GET', token = 'test-only') => originalFetch(
    `http://127.0.0.1:${server.address().port}/api/supabase/admin${route}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: JSON.stringify({ role: 'admin', verified: true, email: 'admin@example.invalid', userId: id }) } : {}),
    });
  try {
    assert.equal((await request('/access', 'GET', null)).status, 401);
    assert.equal(calls.length, 0);
    for (const normalRole of ['usuario', 'empresa', 'trabajador', null, 'ADMIN']) {
      role = normalRole;
      assert.equal((await request()).status, 403);
      const denied = await request('/private-probe', 'POST');
      assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'ADMIN_REQUIRED');
    }
    assert.equal(operations, 0);
    role = 'admin';
    let allowed = await request();
    assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await allowed.json(), { userId: id, role: 'admin', allowed: true });
    assert.equal((await request('/private-probe', 'POST')).status, 200); assert.equal(operations, 1);
    role = 'usuario'; // revoke the same identity while keeping its token unchanged
    assert.equal((await request('/private-probe', 'POST')).status, 403); assert.equal(operations, 1);
    role = 'admin'; profileId = 'another-user';
    assert.equal((await request()).status, 403);
    profileId = id; authStatus = 401;
    assert.equal((await request()).status, 401);
    authStatus = 503; assert.equal((await request()).status, 502);
    authStatus = 200; profileStatus = 503; assert.equal((await request()).status, 502);
    profileStatus = 200; offline = true;
    const unavailable = await request(); assert.equal(unavailable.status, 502);
    assert.deepEqual(await unavailable.json(), { code: 'ADMIN_ACCESS_UNAVAILABLE', error: 'No se pudo comprobar el acceso.' });
    assert.equal(operations, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
    await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});

test('existing profile grants and signup rules prevent public self-assignment of ADMIN', async () => {
  const sql = await readFile('supabase/migrations/20260918142240_booking_owner_security.sql', 'utf8');
  assert.match(sql, /grant update \(full_name, phone, avatar_url\) on public.profiles to authenticated/);
  assert.match(sql, /case when new.raw_user_meta_data->>'role' = 'empresa'[\s\S]*?else 'usuario'/);
  const index = await readFile('src/routes/index.ts', 'utf8');
  assert.match(index, /router.use\("\/supabase\/admin", adminRouter\)/);
  const signup = await readFile('src/routes/supabase.ts', 'utf8');
  assert.match(signup, /acceptedRoles = new Set\(\["usuario", "empresa"\]\)/);
});
