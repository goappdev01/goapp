import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('verification HTTP boundary checks identity, permission, file bytes and private links', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-business-verification-'));
  const outfile = path.join(dir, 'router.mjs');
  await build({ entryPoints: ['src/routes/businessVerification.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  const { default: router, validDocumentBytes } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use(router);
  app.use((error, _req, res, _next) => res.status(error?.type === 'entity.too.large' ? 413 : 503).json({ error: 'Unavailable' }));
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = globalThis.fetch, oldURL = process.env.SUPABASE_URL, oldKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://verification.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-public';
  const id = '11111111-1111-4111-8111-111111111111', company = '22222222-2222-4222-8222-222222222222';
  const bytes = Buffer.from('%PDF-synthetic');
  let membership = null, docAllowed = true, rpcCode = null, storageCalls = 0, commands = 0, offline = false;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith('https://verification.invalid')) return originalFetch(url, init);
    if (offline) throw Error('private details must not appear');
    assert.equal(init.headers.Authorization, 'Bearer synthetic-token');
    const parsed = new URL(url);
    if (parsed.pathname === '/auth/v1/user') return Response.json({ id });
    if (parsed.pathname === '/rest/v1/admin_memberships') return Response.json(membership ? [membership] : []);
    if (parsed.pathname.endsWith('/go_business_document')) return docAllowed ? Response.json({ id, business_id: company, object_path: company + '/' + id, mime_type: 'application/pdf', byte_size: bytes.length })
      : Response.json({ code: '42501' }, { status: 403 });
    if (parsed.pathname.endsWith('/go_business_verification')) {
      commands++;
      return rpcCode ? Response.json({ code: rpcCode, message: 'private database error' }, { status: 400 }) : Response.json({ dossier: { business_id: company, verified: false } });
    }
    if (parsed.pathname.includes('/storage/v1/object/sign/')) return Response.json({ signedURL: `/object/sign/business-verification/${company}/${id}?token=SYNTHETIC` });
    if (parsed.pathname.includes('/storage/v1/object/authenticated/')) return new Response(bytes, { headers: { 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.length) } });
    if (parsed.pathname.includes('/storage/v1/object/business-verification/')) {
      storageCalls++; assert.equal(init.headers['x-upsert'], 'false'); assert.equal(init.headers['Content-Type'], 'application/pdf');
      assert.deepEqual(Buffer.from(init.body), bytes); return Response.json({ Key: 'stored' });
    }
    return Response.json([]);
  };
  const request = (route, method = 'GET', body, token = true, binary = false) => originalFetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method, headers: { ...(token ? { Authorization: 'Bearer synthetic-token' } : {}), ...(body === undefined ? {} : { 'Content-Type': binary ? 'application/octet-stream' : 'application/json' }) },
    ...(body === undefined ? {} : { body: binary ? body : JSON.stringify(body) }),
  });
  const command = { operation: 'draft', requestId: id, data: { legal_name: 'SYNTHETIC' } };
  try {
    assert.equal((await request('/dossiers', 'GET', undefined, false)).status, 401);
    assert.equal((await request('/command', 'POST', { ...command, ownerId: id })).status, 400);
    assert.equal((await request('/command', 'POST', command)).status, 200);
    const before = commands;
    assert.equal((await request('/command', 'POST', { ...command, operation: 'decide', status: 'authorized' })).status, 403);
    assert.equal(commands, before);
    membership = { user_id: id, level: 'technical', permissions: ['admin.access'], active: true };
    assert.equal((await request('/admin/dossiers')).status, 403);
    membership.permissions.push('businesses.verify');
    assert.equal((await request('/admin/dossiers')).status, 200);
    membership = { user_id: id, level: 'owner', permissions: [], active: true };
    assert.equal((await request('/command', 'POST', { ...command, operation: 'decide', status: 'authorized' })).status, 200);
    for (const [code, status] of [['42501', 403], ['PT409', 409], ['22023', 400], ['PGRST202', 503]]) {
      rpcCode = code; const response = await request('/command', 'POST', command); assert.equal(response.status, status);
      assert.doesNotMatch(await response.text(), /private database error/);
    }
    rpcCode = null;
    assert.equal((await request(`/documents/${id}/content`, 'PUT', Buffer.alloc(bytes.length), true, true)).status, 400);
    assert.equal(storageCalls, 0);
    assert.equal((await request(`/documents/${id}/content`, 'PUT', bytes, true, true)).status, 200);
    assert.equal(storageCalls, 1);
    assert.equal(validDocumentBytes(Buffer.from('<html>'), 'application/pdf'), false);
    assert.equal(validDocumentBytes(Buffer.alloc(10485761), 'image/png'), false);
    const link = await request(`/documents/${id}/link`); assert.equal(link.status, 200);
    const signed = await link.json(); assert.equal(signed.expiresIn, 60); assert.match(signed.url, /^https:\/\/verification\.invalid\/storage\/v1\/object\/sign\//);
    docAllowed = false;
    assert.equal((await request(`/documents/${id}/link`)).status, 403);
    assert.equal((await request(`/documents/${id}/content`, 'PUT', bytes, true, true)).status, 403);
    assert.equal(storageCalls, 1);
    assert.equal((await request('/dossiers?businessId=..%2Fother')).status, 400);
    offline = true; const unavailable = await request('/dossiers'); assert.equal(unavailable.status, 503); assert.doesNotMatch(await unavailable.text(), /private details/);
  } finally {
    globalThis.fetch = originalFetch;
    if (oldURL === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = oldURL;
    if (oldKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = oldKey;
    await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});
