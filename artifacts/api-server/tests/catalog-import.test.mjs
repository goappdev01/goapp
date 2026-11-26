import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
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
    assert.equal(source.extractCatalogHtml(Array.from({length:45},(_,i)=>`<li>Plato ${i+1} · 8 €</li>`).join('')).length,41);
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
    assert.deepEqual(source.extractCatalogText('TAPAS\nCroquetas 8,50 €\nTortilla 6,00 €\nPeluquería\nCorte 25,50 € · 30 min'), [
      { name: 'Croquetas', price: 8.5, duration: null, description: '', category: 'TAPAS', needsReview: true },
      { name: 'Tortilla', price: 6, duration: null, description: '', category: 'TAPAS', needsReview: true },
      { name: 'Corte', price: 25.5, duration: 30, description: '', category: 'Peluquería', needsReview: false },
    ]);
    assert.deepEqual(source.extractCatalogText('Tinte desde 20 €\nPlato del día 8 € 12 €'), []);
    assert.deepEqual(source.extractCatalogText('BEBIDAS\nRefresco (Grande) 3,50 €')[0],
      { name: 'Refresco', variant: 'Grande', category: 'BEBIDAS', price: 3.5, duration: null, description: '', needsReview: true });
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
    assert.equal((await post('/ai/interpret', { text: 'Corte 25 €', consent: true }, false)).status, 401);
    assert.equal((await post('/extract', { source: 'pdf' })).status, 400);
    assert.equal((await post('/confirm', { services: [{ ...item, duration: null }] })).status, 400);
    assert.equal(rpc.length, 0);
    owns = false;
    assert.equal((await post('/confirm', { services: [item] })).status, 404);
    assert.equal((await post('/ai/interpret', { text: 'Corte 25 €', consent: true })).status, 404);
    assert.equal(rpc.length, 0);
    owns = true;
    const ai = await post('/ai/interpret', { text: 'Corte 25 €', consent: true });
    assert.equal(ai.status, 503);
    assert.equal((await ai.json()).code, 'CATALOG_AI_UNAVAILABLE');
    assert.equal(rpc.length, 0, 'Unavailable GO AI cannot import or call another service');
    const result = await post('/confirm', { services: [item] });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).imported, 1);
    assert.deepEqual(rpc[0].body, { p_business_id: business, p_items: [item] });
    assert.equal(rpc[0].authorization, 'Bearer test');
    const product = { name: 'Croquetas', description: '', duration: 0, price: 8.5, capacity: 1, kind: 'product', category: 'Tapas', variant: '' };
    assert.equal((await post('/confirm', { services: [product] })).status, 200);
    assert.equal(rpc[1].body.p_items[0].kind, 'product');
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

test('product import remains atomic and outside bookable services configuration', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const sql = await readFile('supabase/migrations/20261126004000_go_catalog_import_products_variants_v1.sql', 'utf8');
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
      grant usage on schema public to authenticated; grant select on public.businesses to authenticated;`);
    await db.query('insert into public.businesses values($1,$2,true)', [business, owner]);
    await db.query('insert into public.business_settings values($1,$2::jsonb)', [business, JSON.stringify({ services: [] })]);
    await db.exec(sql);
    await db.exec('set role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [owner]);
    const product = { name: 'Croquetas', description: '', price: 8.5, duration: 0, capacity: 1,
      kind: 'product', category: 'Tapas', variant: '' };
    const invoke = items => db.query('select public.go_import_catalog_services($1::uuid,$2::jsonb) result', [business, JSON.stringify(items)]);
    assert.equal((await invoke([product])).rows[0].result.imported, 1);
    assert.equal((await invoke([product])).rows[0].result.imported, 0);
    assert.equal((await invoke([{ ...product, variant: 'Grande' }])).rows[0].result.imported, 1);
    await assert.rejects(() => invoke([{ ...product, name: 'Tortilla' }, { ...product, name: 'Paella', price: -1 }]));
    await db.exec('reset role');
    const row = (await db.query("select duration_minutes,ui_metadata from public.services where ui_metadata->>'variant'='' ")).rows[0];
    const payload = (await db.query('select payload from public.business_settings')).rows[0].payload;
    assert.equal(row.duration_minutes, 0);
    assert.equal(row.ui_metadata.catalogKind, 'product');
    assert.equal(row.ui_metadata.category, 'Tapas');
    assert.deepEqual(payload.services, []);
    assert.equal((await db.query('select count(*)::integer n from public.services')).rows[0].n, 2);
  } finally { await db.close(); }
});

test('document intake rejects wrong MIME, oversized and decompression-prone images before OCR', async () => {
  const { module: doc, dispose } = await compiled('src/lib/catalogDocument.ts');
  try {
    const png = Buffer.alloc(100);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
    png.writeUInt32BE(500, 16); png.writeUInt32BE(500, 20);
    assert.equal(doc.catalogDocumentBytes('image', 'image/png', png.toString('base64')).length, 100);
    assert.throws(() => doc.catalogDocumentBytes('image', 'image/jpeg', png.toString('base64')), /JPG|PNG/);
    png.writeUInt32BE(6001, 16);
    assert.throws(() => doc.catalogDocumentBytes('image', 'image/png', png.toString('base64')), /resolución/);
    const pdf = Buffer.from('%PDF-1.7\nsynthetic document');
    assert.equal(doc.catalogDocumentBytes('pdf', 'application/pdf', pdf.toString('base64')).length, pdf.length);
    assert.throws(() => doc.catalogDocumentBytes('pdf', 'image/png', pdf.toString('base64')));
    assert.throws(() => doc.catalogDocumentBytes('pdf', 'application/pdf', '%%%'));
    const tsv = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n'
      + '5\t1\t1\t1\t1\t1\t10\t20\t80\t20\t92\tCroquetas\n'
      + '5\t1\t2\t1\t1\t1\t260\t20\t50\t20\t94\t8,50\n'
      + '5\t1\t2\t1\t1\t2\t320\t20\t15\t20\t95\t€\n';
    assert.equal(doc.catalogTsvText(tsv), 'Croquetas 8,50 €');
  } finally { await dispose(); }
});

test('catalog usage is aggregate and admin-only in an isolated database', async () => {
  const { PGlite } = await import('@electric-sql/pglite');
  const db = new PGlite();
  const business = '11111111-1111-4111-8111-111111111111';
  const owner = '22222222-2222-4222-8222-222222222222';
  const admin = '33333333-3333-4333-8333-333333333333';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth;
      create function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated; grant execute on function auth.uid() to authenticated;
      create table public.businesses(id uuid primary key,owner_id uuid,verified boolean);
      create table public.admin_memberships(user_id uuid primary key,active boolean,permissions text[]);
      grant usage on schema public to authenticated;`);
    await db.query('insert into public.businesses values($1,$2,true)', [business, owner]);
    await db.query("insert into public.admin_memberships values($1,true,array['admin.access'])", [admin]);
    await db.exec(await readFile('supabase/migrations/20261126003000_go_catalog_import_usage_v1.sql','utf8'));
    const become = async id => { await db.exec('reset role; set role authenticated');
      await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
    const record = (method, outcome) => db.query('select public.go_catalog_import_record($1::uuid,$2,$3)', [business,method,outcome]);
    await become(admin);
    await assert.rejects(() => record('ocr','success'), /Empresa no autorizada/);
    await become(owner);
    await record('ocr','success'); await record('direct','insufficient');
    await assert.rejects(() => db.query('select public.go_catalog_import_usage()'), /ADMIN no autorizado/);
    await become(admin);
    const rows = (await db.query('select public.go_catalog_import_usage() usage')).rows[0].usage;
    assert.equal(rows.length, 2);
    assert.equal(rows.find(row => row.method === 'ocr').count, 1);
    assert.equal(JSON.stringify(rows).includes(owner), false);
  } finally { await db.close(); }
});

test('document pipeline OCRs only the image-only PDF page and cleans temporary files (simulated CLI)', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-catalog-test-'));
  const outfile = path.join(dir, 'module.mjs');
  const calls = [];
  globalThis.__catalogCliCalls = calls;
  globalThis.__catalogCliMode = 'mixed';
  try {
    await build({ entryPoints: ['src/lib/catalogDocument.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
      banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
      plugins: [{ name: 'synthetic-cli', setup(build) {
        build.onResolve({ filter: /^node:child_process$/ }, () => ({ path: 'cli', namespace: 'synthetic' }));
        build.onLoad({ filter: /.*/, namespace: 'synthetic' }, () => ({ loader: 'js', contents: `
          import {promisify} from 'node:util';
          export function execFile(){}
          execFile[promisify.custom]=async(cmd,args)=>{
            globalThis.__catalogCliCalls.push([cmd,...args]);
            if(cmd==='pdfinfo')return {stdout:globalThis.__catalogCliMode==='direct'?'Pages: 2\\n':'Pages: 3\\n'};
            if(cmd==='pdftotext')return {stdout:globalThis.__catalogCliMode==='direct'?(args[1]==='1'?'Tinte 45,00 € 60 min':'Peinado 20,00 € 30 min'):args[1]==='2'?'':args[1]==='1'?'Tinte 45,00 € 60 min':'Peinado 20,00 € 30 min'};
            if(cmd==='tesseract')return {stdout:'level\\tpage_num\\tblock_num\\tpar_num\\tline_num\\tword_num\\tleft\\ttop\\twidth\\theight\\tconf\\ttext\\n5\\t1\\t1\\t1\\t1\\t1\\t10\\t20\\t80\\t20\\t90\\tCroquetas\\n5\\t1\\t2\\t1\\t1\\t1\\t200\\t20\\t60\\t20\\t90\\t8,50\\n5\\t1\\t2\\t1\\t1\\t2\\t270\\t20\\t10\\t20\\t90\\t€\\n'};
            if(cmd==='pdftoppm')return {stdout:''};
            throw Error('unexpected CLI');
          }` }));
      } }] });
    const doc = await import(pathToFileURL(outfile));
    const before = (await readdir(tmpdir())).filter(name => name.startsWith('go-catalog-')).sort();
    const result = await doc.extractCatalogDocument('pdf','application/pdf',Buffer.from('%PDF-1.7\nsynthetic').toString('base64'));
    assert.equal(result.method, 'mixed');
    assert.deepEqual(result.services.map(row => row.name), ['Tinte','Croquetas','Peinado']);
    assert.equal(calls.filter(row => row[0] === 'tesseract').length, 1);
    assert.equal(calls.filter(row => row[0] === 'pdftotext').length, 3);
    assert.deepEqual((await readdir(tmpdir())).filter(name => name.startsWith('go-catalog-')).sort(), before);
    globalThis.__catalogCliMode = 'direct'; calls.length = 0;
    const direct = await doc.extractCatalogDocument('pdf','application/pdf',Buffer.from('%PDF-1.7\nsynthetic').toString('base64'));
    assert.equal(direct.method, 'direct');
    assert.deepEqual(direct.services.map(row => row.name), ['Tinte','Peinado']);
    assert.equal(calls.filter(row => row[0] === 'tesseract').length, 0);
    const png = Buffer.alloc(100);
    Buffer.from([137,80,78,71,13,10,26,10]).copy(png);
    png.writeUInt32BE(500, 16); png.writeUInt32BE(500, 20);
    const image = await doc.extractCatalogDocument('image','image/png',png.toString('base64'));
    assert.equal(image.method, 'ocr');
    assert.deepEqual(image.services.map(row => row.name), ['Croquetas']);
  } finally { delete globalThis.__catalogCliCalls; delete globalThis.__catalogCliMode; await rm(dir, { recursive: true, force: true }); }
});
