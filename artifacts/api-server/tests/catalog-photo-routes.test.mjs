import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('catalogue photo preference and private signed URL require the caller and matching service', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-catalog-media-'));
  const outfile = path.join(dir, 'router.mjs');
  await build({ entryPoints: ['src/routes/supabase.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: `import {createRequire} from 'node:module';const require=createRequire(import.meta.url);` } });
  const { default: router } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use(router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.SUPABASE_URL, originalKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL = 'https://test.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'synthetic-key';
  const business = '11111111-1111-4111-8111-111111111111';
  const service = '22222222-2222-4222-8222-222222222222';
  const reference = `go-storage:${business}/33333333-3333-4333-8333-333333333333.jpg`;
  const calls = []; let owner = false, photo = reference, shown = false, published = true;
  globalThis.fetch = async (url, init = {}) => {
    if (!String(url).startsWith('https://test.invalid')) return originalFetch(url, init);
    const u = new URL(url); calls.push({ path: u.pathname, search: u.searchParams, method: init.method ?? 'GET' });
    if (u.pathname.endsWith('/auth/v1/user')) return Response.json({ id: '44444444-4444-4444-8444-444444444444' });
    if (u.pathname.endsWith('/go_catalog_photo_preferences')) {
      if (init.method === 'POST') { shown = JSON.parse(init.body).show_photos; return Response.json([{ show_photos: shown }]); }
      return Response.json([{ show_photos: shown }]);
    }
    if (u.pathname.endsWith('/services')) return Response.json([{ id: service, business_id: business, active: true, ui_metadata: { photoUri: photo } }]);
    if (u.pathname.endsWith('/businesses')) return Response.json([{ id: business, owner_id: owner ? '44444444-4444-4444-8444-444444444444' : 'another', verified: true, booking_enabled: published }]);
    if (u.pathname.includes('/object/sign/go-catalog-photos/')) return Response.json({ signedURL: '/object/sign/go-catalog-photos/' + reference.slice('go-storage:'.length) + '?token=synthetic' });
    return Response.json({ code: 'unexpected' }, { status: 500 });
  };
  const request = (route, init = {}) => originalFetch(`http://127.0.0.1:${server.address().port}${route}`, {
    ...init, headers: { Authorization: 'Bearer synthetic', 'Content-Type': 'application/json', ...init.headers },
  });
  try {
    assert.equal((await request('/catalog-photo-preference', { headers: { Authorization: '' } })).status, 401);
    assert.deepEqual(await (await request('/catalog-photo-preference')).json(), { showPhotos: false });
    assert.deepEqual(await (await request('/catalog-photo-preference', { method: 'PUT', body: JSON.stringify({ showPhotos: true }) })).json(), { showPhotos: true });
    assert.deepEqual(await (await request('/catalog-photo-preference')).json(), { showPhotos: true });
    assert.equal((await request('/catalog-photo-preference', { method: 'PUT', body: JSON.stringify({ showPhotos: 'yes' }) })).status, 400);
    const result = await request('/catalog-photo-url?' + new URLSearchParams({ ref: reference }));
    assert.equal(result.status, 200);
    assert.match((await result.json()).url, /^https:\/\/test\.invalid\/storage\/v1\/object\/sign\/go-catalog-photos\//);
    assert.equal(calls.find(call => call.path.endsWith('/services'))?.search.get('ui_metadata->>photoUri'), `eq.${reference}`);
    photo = 'none'; assert.equal((await request('/catalog-photo-url?' + new URLSearchParams({ ref: reference }))).status, 404);
    photo = reference; published = false;
    assert.equal((await request('/catalog-photo-url?' + new URLSearchParams({ ref: reference }))).status, 404);
    owner = true; assert.equal((await request('/catalog-photo-url?' + new URLSearchParams({ ref: reference }))).status, 200);
    assert.equal((await request('/catalog-photo-url?ref=https%3A%2F%2Fother.invalid%2Fimage.jpg')).status, 400);
    assert.equal(calls.filter(call => call.path.includes('/object/sign/')).length, 2);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = originalUrl;
    if (originalKey === undefined) delete process.env.SUPABASE_PUBLISHABLE_KEY; else process.env.SUPABASE_PUBLISHABLE_KEY = originalKey;
    await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true });
  }
});
