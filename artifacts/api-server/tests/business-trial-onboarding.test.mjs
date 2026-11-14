import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('trial consent, private documentation and expiry are enforced on server routes', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-trial-test-'));
  const outfile = path.join(dir, 'manage.mjs');
  await build({ entryPoints: ['src/routes/management.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" } });
  const { default: router } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json({ limit: '7mb' })); app.use('/api/supabase/manage', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const saved = { fetch: globalThis.fetch, url: process.env.SUPABASE_URL, key: process.env.SUPABASE_PUBLISHABLE_KEY,
    enabled: process.env.GO_BUSINESS_TRIAL_ONBOARDING };
  process.env.SUPABASE_URL = 'https://trial.test.invalid'; process.env.SUPABASE_PUBLISHABLE_KEY = 'public-key';
  const userId = '11111111-1111-4111-8111-111111111111';
  const businessId = '22222222-2222-4222-8222-222222222222';
  let trialExpires = new Date(Date.now() + 86400000).toISOString();
  let accepted = 0, stored = 0, registered = 0;
  globalThis.fetch = async (url, init) => {
    if (!String(url).startsWith(process.env.SUPABASE_URL)) return saved.fetch(url, init);
    const path = new URL(url).pathname;
    if (path === '/auth/v1/user') return Response.json({ id: userId });
    if (path.endsWith('/accept_business_trial')) {
      assert.deepEqual(JSON.parse(init.body), { p_terms_version: 'go-trial-v1' });
      accepted++; return Response.json([{ id: businessId, owner_id: userId, verified: false }]);
    }
    if (path.startsWith('/storage/v1/object/go-business-documents/')) {
      assert.equal(init.method, 'POST');
      assert.equal(Buffer.from(init.body).subarray(0, 5).toString(), '%PDF-');
      stored++; return Response.json({ Key: 'private-document' });
    }
    if (path.endsWith('/register_business_document')) {
      const payload = JSON.parse(init.body);
      assert.equal(payload.p_business_id, businessId);
      assert.equal(payload.p_byte_size, Buffer.byteLength('%PDF-1.4\nGO test'));
      assert.match(payload.p_object_path, new RegExp(`^${userId}/${businessId}/`));
      registered++;
      return Response.json([{ id: '33333333-3333-4333-8333-333333333333', kind: 'fiscal' }]);
    }
    if (path.endsWith('/business_trial_requests')) return Response.json([{ business_id: businessId,
      status: 'approved', trial_ends_at: trialExpires }]);
    if (path.endsWith('/businesses')) return Response.json([{ id: businessId, owner_id: userId, verified: true,
      timezone: 'Europe/Madrid' }]);
    return Response.json([]);
  };
  const call = (path, body, method = body ? 'POST' : 'GET') => saved.fetch(
    `http://127.0.0.1:${server.address().port}/api/supabase/manage${path}`,
    { method, headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
  try {
    delete process.env.GO_BUSINESS_TRIAL_ONBOARDING;
    assert.equal((await call('/trial/accept', { terms_version: 'go-trial-v1' })).status, 503);
    assert.equal(accepted, 0);
    process.env.GO_BUSINESS_TRIAL_ONBOARDING = 'enabled';
    for (const invalid of [{ terms_version: 'old' }, {}, { terms_version: 'go-trial-v1', verified: true }]) {
      assert.equal((await call('/trial/accept', invalid)).status, 400);
    }
    assert.equal((await call('/trial/accept', { terms_version: 'go-trial-v1' })).status, 200);
    assert.equal(accepted, 1);
    assert.equal((await call('/enrollment', { legal_name: 'Empresa', tax_id: '123', address: 'Dirección' })).status, 400);
    assert.equal((await call('/trial/documents', { business_id: businessId, kind: 'fiscal', name: 'evil.exe', mime_type: 'application/x-msdownload', content_base64: 'YWJj' })).status, 400);
    assert.equal((await call('/trial/documents', { business_id: businessId, kind: 'fiscal', name: 'a.pdf', mime_type: 'application/pdf', content_base64: 'YWJj' })).status, 400);
    assert.equal((await call('/trial/documents', { business_id: businessId, kind: 'fiscal', name: 'a.pdf', mime_type: 'application/pdf',
      content_base64: Buffer.from('%PDF-1.4\nGO test').toString('base64') })).status, 200);
    assert.equal(stored, 1);
    assert.equal(registered, 1);
    assert.equal((await call(`/businesses/${businessId}/services`, undefined, 'GET')).status, 200);
    trialExpires = new Date(Date.now() - 86400000).toISOString();
    const expired = await call(`/businesses/${businessId}/services`);
    assert.equal(expired.status, 403);
    assert.equal((await expired.json()).code, 'BUSINESS_TRIAL_INACTIVE');
  } finally {
    globalThis.fetch = saved.fetch;
    for (const [name, value] of [['SUPABASE_URL', saved.url], ['SUPABASE_PUBLISHABLE_KEY', saved.key], ['GO_BUSINESS_TRIAL_ONBOARDING', saved.enabled]]) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});

test('planned schema isolates documents, enforces trial consent and restricts approvals to live admin membership', async () => {
  const sql = await readFile('supabase/drafts/business_trial_onboarding.sql', 'utf8');
  assert.match(sql, /go-business-documents','go-business-documents',false/);
  assert.match(sql, /create policy go_docs_upload[\s\S]*?auth\.uid\(\)/);
  assert.match(sql, /create policy trial_owner_read/);
  assert.match(sql, /p_terms_version <> 'go-trial-v1'/);
  assert.match(sql, /p_action='approve'[\s\S]*?verified=true/);
  assert.match(sql, /public\.admin_memberships m[\s\S]*?m\.active/);
  assert.match(sql, /trial_ends_at=now\(\)\+interval '30 days'/);
  assert.match(sql, /business_trial_active\(b\.id\)/);
  assert.match(sql, /go_notification_outbox/);
  assert.doesNotMatch(sql, /http[_-]request|send_sms|send_email/i);
});
