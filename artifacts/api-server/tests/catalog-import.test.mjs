import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function compiled(entry) {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-catalog-import-'));
  const outfile = path.join(dir, 'module.mjs');
  await build({ entryPoints: [entry], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  return { module: await import(pathToFileURL(outfile)), dispose: () => rm(dir, { recursive: true, force: true }) };
}

test('public catalog extraction requires real named price rows and preserves missing duration', async () => {
  const { module: source, dispose } = await compiled('src/lib/catalogImport.ts');
  try {
    const html = `<html><body><ul><li>Corte señora · 25,50 € · 45 min</li>
      <li>Peinado · 12 EUR</li><li>Sin precio ni duración</li>
      <li>Corte señora · 25,50 € · 45 min</li></ul>
      <script><li>Servicio falso 999 €</li></script></body></html>`;
    assert.deepEqual(source.extractCatalogHtml(html), [
      { name: 'Corte señora', price: 25.5, duration: 45, description: '' },
      { name: 'Peinado', price: 12, duration: null, description: '' },
    ]);
    assert.deepEqual(source.extractCatalogHtml('<tr><td>Corte y peinado</td><td>8 €</td><td>36 €</td><td>10 min – 1 h</td></tr>'), []);
    assert.deepEqual(source.extractCatalogHtml('<tr><td>Retoque de raíz</td><td>32 €</td><td>1 h 10</td></tr>'),
      [{ name: 'Retoque de raíz', price: 32, duration: 70, description: '' }]);
    assert.deepEqual(source.extractCatalogHtml('<p>Ensaladilla · 12,90 € · Alérgenos: 3, 4.</p>'),
      [{ name: 'Ensaladilla', price: 12.9, duration: null, description: 'Alérgenos 3, 4.' }]);
    for (const url of ['http://example.com', 'https://127.0.0.1/menu',
      'https://user:pass@example.com/menu', 'https://example.local/menu',
      'https://example.com:8443/menu']) {
      assert.throws(() => source.catalogUrl(url));
    }
    for (const address of ['127.0.0.1','10.4.5.6','169.254.169.254','192.168.0.2',
      '192.0.0.9','198.19.1.1','::1','fe80::1','2001:db8::1','::ffff:127.0.0.1'])
      assert.equal(source.publicCatalogAddress(address), false, address);
    assert.equal(source.publicCatalogAddress('8.8.8.8'), true);
    assert.equal(source.publicCatalogAddress('2001:4860:4860::8888'), true);
  } finally { await dispose(); }
});

test('catalog import checks owner, validates review and only confirms via authenticated RPC', async () => {
  const { module: { default: router }, dispose } = await compiled('src/routes/management.ts');
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const oldFetch = globalThis.fetch, oldUrl = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  let owns = true, rpc = [];
  process.env.SUPABASE_URL = 'https://supabase.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'public';
  globalThis.fetch = async (url, init) => {
    const u = new URL(url);
    if (u.pathname === '/auth/v1/user') return Response.json({ id: owner });
    if (u.pathname === '/rest/v1/businesses') return Response.json(owns ? [{ id: business, verified: true, timezone: 'Europe/Madrid' }] : []);
    if (u.pathname === '/rest/v1/rpc/go_import_catalog_services') {
      rpc.push({ body: JSON.parse(init.body), authorization: init.headers.Authorization });
      return Response.json({ imported: 1, services: [rpc.at(-1).body.p_items[0]] });
    }
    throw new Error(`Unexpected endpoint ${u.pathname}`);
  };
  const base = `http://127.0.0.1:${server.address().port}/businesses/${business}/catalog-import`;
  const post = (path, body, auth = true) => oldFetch(base + path, { method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: 'Bearer test' } : {}) }, body: JSON.stringify(body) });
  const item = { name: 'Corte', description: '', duration: 30, price: 25, capacity: 1 };
  try {
    assert.equal((await post('/confirm', { services: [item] }, false)).status, 401);
    assert.equal((await post('/extract', { source: 'pdf' })).status, 501);
    assert.equal((await post('/confirm', { services: [{ ...item, duration: null }] })).status, 400);
    assert.equal(rpc.length, 0);
    owns = false;
    assert.equal((await post('/confirm', { services: [item] })).status, 404);
    assert.equal(rpc.length, 0);
    owns = true;
    const result = await post('/confirm', { services: [item] });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).imported, 1);
    assert.deepEqual(rpc[0].body, { p_business_id: business, p_items: [item] });
    assert.equal(rpc[0].authorization, 'Bearer test');
  } finally {
    globalThis.fetch = oldFetch;
    if (oldUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldUrl;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
    await new Promise(resolve => server.close(resolve)); await dispose();
  }
});

test('atomic import preserves prior services, skips duplicates and rolls back an invalid batch', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const stranger = '33333333-3333-4333-8333-333333333333';
  const sql = await readFile('supabase/migrations/20261125232825_go_catalog_import_atomic_v1.sql', 'utf8');
  const rpc = items => db.query('select public.go_import_catalog_services($1::uuid,$2::jsonb) result', [business, JSON.stringify(items)]);
  const user = async id => { await db.exec('reset role; set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.businesses(id uuid primary key, owner_id uuid not null, verified boolean not null);
      create table public.business_settings(business_id uuid primary key, payload jsonb not null);
      create table public.services(id uuid primary key default gen_random_uuid(), business_id uuid not null,
        name text not null, description text, duration_minutes integer not null, price numeric(12,2),
        currency text not null, active boolean not null, ui_metadata jsonb not null);
      alter table public.business_settings enable row level security;
      alter table public.services enable row level security;
      grant usage on schema public to authenticated;
      grant select on public.businesses to authenticated;`);
    await db.query('insert into public.businesses values($1,$2,true)', [business,owner]);
    await db.query('insert into public.business_settings values($1,$2::jsonb)',
      [business,JSON.stringify({businessId:business,subId:'peluqueria',services:[{name:'Tinte',price:45,duration:60}]})]);
    await db.exec(sql);
    const item = {name:'Corte',price:25.5,duration:30,description:'',capacity:1};
    await user(stranger);
    await assert.rejects(() => rpc([item]), /Empresa no autorizada/);
    await user(owner);
    const first = (await rpc([item,{...item,name:'CORTE'}])).rows[0].result;
    assert.equal(first.imported,1);
    assert.equal((await rpc([item])).rows[0].result.imported,0);
    await assert.rejects(() => rpc([{...item,name:'Peinado'}, {...item,name:'Corte largo',duration:0}]),
      /Revisa los servicios|Precio o duración/);
    await db.exec('reset role');
    const settings = (await db.query('select payload from public.business_settings where business_id=$1',[business])).rows[0].payload;
    const rows = (await db.query('select name,price,ui_metadata from public.services where business_id=$1',[business])).rows;
    assert.deepEqual(settings.services.map(s=>s.name), ['Tinte','Corte']);
    assert.deepEqual(rows.map(s=>s.name), ['Corte']);
    assert.equal(rows[0].ui_metadata.type,'peluqueria');
    assert.equal(Number(rows[0].price),25.5);
  } finally { await db.close(); }
});
