import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Real, persisted PostgreSQL engine behind the real Express router; Auth/Storage HTTP adapters are synthetic.
// This does not claim that hosted Supabase identities or Storage have been activated.
test('AYUDA persistent isolated circuit: user → API → ADMIN → API → user, files and restart', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-support-persistence-'));
  const admin = '11111111-1111-4111-8111-111111111111', alice = '22222222-2222-4222-8222-222222222222';
  const bob = '33333333-3333-4333-8333-333333333333', business = '44444444-4444-4444-8444-444444444444';
  const ids = { admin, alice, bob }, key = n => `55555555-5555-4555-8555-${String(n).padStart(12, '0')}`;
  let db = new PGlite(path.join(dir, 'database'));
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
    create table public.profiles(id uuid primary key,full_name text);
    create table public.businesses(id uuid primary key,owner_id uuid not null,verified boolean not null,name text);
    create table public.admin_memberships(user_id uuid primary key,level text,active boolean);
    create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb,unique(bucket_id,name));
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated; grant select,insert,delete on storage.objects to authenticated;`);
  await db.query('insert into auth.users values($1),($2),($3)', [admin, alice, bob]);
  await db.query("insert into public.admin_memberships values($1,'owner',true)", [admin]);
  await db.query("insert into public.profiles values($1,'Test Admin'),($2,'Test Alice'),($3,'Test Bob')", [admin, alice, bob]);
  await db.query("insert into public.businesses values($1,$2,true,'Test Business')", [business, alice]);
  await db.exec(await readFile('supabase/drafts/go_support_v1.sql', 'utf8'));
  await build({ entryPoints: ['src/routes/support.ts'], outfile: path.join(dir, 'router.mjs'), bundle: true,
    platform: 'node', format: 'esm', banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  const { default: router } = await import(pathToFileURL(path.join(dir, 'router.mjs')));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use('/api/supabase/support', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(done => server.once('listening', done));
  const base = `http://127.0.0.1:${server.address().port}/api/supabase/support`;
  const original = globalThis.fetch, oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://support-isolated.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public';
  let queue = Promise.resolve();
  const asUser = (user, operation) => {
    const run = queue.then(async () => {
      await db.exec('begin; set local role authenticated;');
      try { await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user]);
        const result = await operation(); await db.exec('commit'); return result;
      } catch (error) { await db.exec('rollback'); throw error; }
    }); queue = run.catch(() => {}); return run;
  };
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('https://support-isolated.invalid')) return original(url, init);
    const target = new URL(url), user = ids[String(init.headers?.Authorization).replace('Bearer ', '')];
    if (!user) return Response.json({ error: 'expired' }, { status: 401 });
    if (target.pathname === '/auth/v1/user') return Response.json({ id: user });
    try {
      if (target.pathname.startsWith('/rest/v1/rpc/')) {
        const fn = target.pathname.split('/').at(-1), payload = JSON.parse(init.body);
        assert.match(fn, /^go_support_[a-z_]+$/);
        const names = Object.keys(payload); names.forEach(name => assert.match(name, /^p_[a-z_]+$/));
        const result = await asUser(user, async () => (await db.query(
          `select public.${fn}(${names.map((name, index) => `${name}=>$${index + 1}`).join(',')}) result`, Object.values(payload))).rows[0].result);
        return Response.json(result);
      }
      const objectPath = target.pathname.split('/go-support-private/')[1];
      assert.match(objectPath, /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/);
      const filePath = path.join(dir, objectPath.replace('/', '_'));
      if (init.method === 'POST') {
        await asUser(user, () => db.query("insert into storage.objects(bucket_id,name,metadata) values('go-support-private',$1,$2)",
          [objectPath, { size: init.body.length, mimetype: init.headers['Content-Type'] }]));
        await writeFile(filePath, init.body); return Response.json({ uploaded: true });
      }
      const visible = await asUser(user, () => db.query("select id from storage.objects where bucket_id='go-support-private' and name=$1", [objectPath]));
      if (!visible.rows.length) return Response.json({ error: 'denied' }, { status: 403 });
      return new Response(await readFile(filePath));
    } catch (error) { return Response.json({ code: error.code, message: 'isolated error' },
      { status: error.code === '42501' ? 403 : error.code === 'PT409' ? 409 : 400 }); }
  };
  const request = (who, route, method = 'GET', body, mime = 'application/json') => original(base + route, {
    method, headers: { Authorization: `Bearer ${who}`, 'Content-Type': mime },
    ...(body === undefined ? {} : { body: Buffer.isBuffer(body) ? body : JSON.stringify(body) }),
  });
  const json = async response => { assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  try {
    assert.equal((await request('expired', '/requests')).status, 401);
    const incident = await json(await request('alice', '/requests', 'POST', { kind: 'incident', body: 'Test incident', requestKey: key(1) }));
    await json(await request('alice', '/requests', 'POST', { kind: 'improvement', body: 'Test company improvement', requestKey: key(2), businessId: business }));
    await json(await request('bob', '/requests', 'POST', { kind: 'help', body: 'Test question', requestKey: key(3) }));
    assert.equal((await json(await request('admin', '/requests?admin=true'))).total, 3);
    assert.equal((await request('bob', `/requests/${incident.id}`)).status, 403);
    assert.equal((await request('alice', '/requests?admin=true')).status, 403);
    const act = (who, ticket, n, action, body) => request(who, `/requests/${ticket.id}/actions`, 'POST', { key: key(n), action, body, revision: ticket.revision });
    const noted = await json(await act('admin', incident, 4, 'internal_note', 'Internal test note'));
    const answered = await json(await act('admin', noted, 5, 'reply', 'Public test answer'));
    const own = await json(await request('alice', `/requests/${incident.id}`));
    assert.deepEqual(own.messages.map(message => message.body), ['Public test answer']);
    const followed = await json(await act('alice', own, 6, 'reply', 'Test follow-up'));
    assert.equal((await json(await request('admin', `/requests/${incident.id}`))).messages.length, 3);
    const file = await json(await request('alice', `/requests/${incident.id}/files`, 'POST', { clientId: 'sample', name: 'sample.pdf', mime: 'application/pdf', size: 5 }));
    await json(await request('alice', `/files/${file.id}/content`, 'POST', Buffer.from('%PDF-'), 'application/pdf'));
    await json(await request('alice', `/files/${file.id}/confirm`, 'POST'));
    assert.equal((await request('bob', `/files/${file.id}/content`)).status, 403);
    assert.equal(await (await request('admin', `/files/${file.id}/content`)).text(), '%PDF-');
    const retry = await json(await request('alice', '/requests', 'POST', { kind: 'incident', body: 'Test incident', requestKey: key(1) }));
    assert.equal(retry.id, incident.id);
    await db.close(); db = new PGlite(path.join(dir, 'database'));
    const restored = await json(await request('alice', `/requests/${incident.id}`));
    assert.equal(restored.revision, followed.revision); assert.equal(restored.messages.length, 2); assert.equal(restored.files.length, 1);
    assert.equal(await (await request('alice', `/files/${file.id}/content`)).text(), '%PDF-');
    assert.equal((await json(await request('admin', '/requests?admin=true'))).total, 3);
    assert.equal(answered.messages.some(message => message.internal), true);
  } finally {
    globalThis.fetch = original;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
    await new Promise(done => server.close(done)); await db.close(); await rm(dir, { recursive: true, force: true });
  }
});
