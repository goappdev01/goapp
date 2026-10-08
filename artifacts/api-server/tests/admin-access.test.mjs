import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('ADMIN namespace uses independent live memberships, scoped permissions and revocation', async () => {
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
  let membership = null, accountRole = 'usuario', authStatus = 200, profileStatus = 200, offline = false, calls = [], rpcStatus = 200;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://admin-test.invalid')) return originalFetch(url, init);
    calls.push(String(url));
    assert.equal(init.headers.Authorization, 'Bearer test-only');
    if (offline) throw new Error('upstream details must not leak');
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') {
      return Response.json({ id, email: 'admin@example.invalid', user_metadata: { role: accountRole } }, { status: authStatus });
    }
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      assert.equal(init.method, 'POST');
      if (u.pathname.endsWith('/admin_set_membership')) {
        const body = JSON.parse(init.body);
        assert.equal(body.p_active, true); assert.equal(body.p_user_id, id);
        assert.deepEqual(body.p_permissions, ['admin.access', 'diagnostics']);
        assert.equal(body.p_reason, 'owner authorization');
        assert.equal('level' in body, false);
      }
      return Response.json({ result: true }, { status: rpcStatus });
    }
    assert.equal(u.pathname, '/rest/v1/admin_memberships');
    assert.equal(u.searchParams.get('user_id'), `eq.${id}`);
    assert.equal(u.searchParams.get('select'), 'user_id,level,permissions,active');
    return Response.json(membership ? [membership] : [], { status: profileStatus });
  };
  const request = (route = '/access', method = 'GET', token = 'test-only', body) => originalFetch(
    `http://127.0.0.1:${server.address().port}/api/supabase/admin${route}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(['POST', 'PUT'].includes(method) ? { body: JSON.stringify(body ?? { role: 'admin', verified: true, userId: id }) } : {}),
    });
  try {
    assert.equal((await request('/access', 'GET', null)).status, 401);
    assert.equal(calls.length, 0);
    for (const normalRole of ['usuario', 'empresa', 'trabajador', null, 'ADMIN', 'admin']) {
      accountRole = normalRole;
      membership = null; // Classification/forged client role never grants a membership.
      assert.equal((await request()).status, 403);
      const denied = await request('/private-probe', 'POST');
      assert.equal(denied.status, 403); assert.equal((await denied.json()).code, 'ADMIN_REQUIRED');
    }
    assert.equal(operations, 0);
    membership = { user_id: id, level: 'owner', permissions: [], active: true };
    let allowed = await request();
    assert.equal(allowed.status, 200); assert.equal(allowed.headers.get('cache-control'), 'no-store');
    const ownerAccess = await allowed.json();
    assert.equal(ownerAccess.level, 'owner'); assert.equal(ownerAccess.allowed, true);
    assert.ok(ownerAccess.permissions.includes('ownership.manage'));
    assert.equal((await request('/memberships')).status, 200);
    assert.equal((await request('/audit')).status, 200);
    const grant = { level: 'technical', active: true, permissions: ['admin.access', 'diagnostics'], reason: 'owner authorization' };
    assert.equal((await request(`/memberships/${id}`, 'PUT', 'test-only', grant)).status, 200);
    assert.equal((await request(`/memberships/${id}`, 'PUT', 'test-only', { ...grant, level: 'owner' })).status, 400);
    assert.equal((await request(`/memberships/${id}`, 'PUT', 'test-only', { ...grant, permissions: ['admin.access', 'ownership.manage'] })).status, 400);
    rpcStatus = 403; // DB rechecks owner/target; a stale middleware grant cannot bypass it.
    assert.equal((await request(`/memberships/${id}`, 'PUT', 'test-only', grant)).status, 403);
    rpcStatus = 200;
    assert.equal((await request('/private-probe', 'POST')).status, 200); assert.equal(operations, 1);
    membership = { user_id: id, level: 'technical', permissions: ['admin.access', 'diagnostics'], active: true };
    assert.equal((await request()).status, 200);
    const beforeTechnical = calls.length;
    for (const target of [id, '22222222-2222-4222-8222-222222222222']) {
      assert.equal((await request(`/memberships/${target}`, 'PUT', 'test-only', { ...grant, active: false })).status, 403);
    }
    assert.equal((await request('/memberships')).status, 403);
    assert.equal((await request('/audit')).status, 403);
    assert.ok(calls.slice(beforeTechnical).every(url => !url.includes('/rpc/')));
    membership.active = false; // revoke same identity, token unchanged
    assert.equal((await request('/private-probe', 'POST')).status, 403); assert.equal(operations, 1);
    membership.active = true; membership.user_id = 'another-user';
    assert.equal((await request()).status, 403);
    membership.user_id = id; membership.permissions.push('ownership.manage');
    assert.equal((await request()).status, 403);
    membership.permissions = ['admin.access']; authStatus = 401;
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

test('draft keeps account types intact and reserves bootstrap/owner management with auditable changes', async () => {
  // Static invariants only; executing PostgreSQL/RLS integration tests is a deployment prerequisite.
  const sql = await readFile('supabase/drafts/admin_memberships.sql', 'utf8');
  assert.doesNotMatch(sql, /(?:insert into|update|alter table|delete from)\s+(?:public\.)?profiles\b/i);
  assert.doesNotMatch(sql, /raw_user_meta_data|service_role.*to authenticated|drop\s+(table|column)/i);
  assert.match(sql, /admin_memberships enable row level security/);
  assert.match(sql, /admin_membership_audit enable row level security/);
  assert.match(sql, /using \(user_id = \(select auth.uid\(\)\)\)/);
  assert.match(sql, /revoke all on function go_admin_private.bootstrap_owner\(uuid, text\) from public, anon, authenticated, service_role/);
  assert.match(sql, /email_confirmed_at is not null/);
  assert.match(sql, /Owner cannot be modified by this operation/);
  assert.match(sql, /user_id = auth.uid\(\) and level = 'owner' and active/g);
  assert.match(sql, /after insert or update or delete on public.admin_memberships/);
  assert.match(sql, /pg_advisory_xact_lock/);
  assert.match(sql, /create unique index admin_single_owner/);
  assert.doesNotMatch(sql, /select\s+go_admin_private\.bootstrap_owner/i);
});
