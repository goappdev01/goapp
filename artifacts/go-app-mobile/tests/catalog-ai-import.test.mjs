import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { evaluate } = require('./tests/helpers/react-lifecycle.cjs');
const privacy = evaluate('../../lib/api-zod/src/privacy-controls.ts');
const business = '11111111-1111-4111-8111-111111111111';

test('GO AI draft requires consent and server capability before any interpretation request', async () => {
  let available = false;
  const calls = [];
  const data = evaluate('data/catalogImport.ts', { '@workspace/api-zod': privacy, './booking': {
    getAuthenticatedUserId: async () => 'owner', isCloudId: id => id === business,
    supabaseApiRequest: async (url, options) => {
      calls.push({ url, options });
      if (url.endsWith('/capabilities')) return { url: true, image: true, pdf: true, goAi: available };
      return { ok: true, services: [{ name: 'Corte', price: 25, duration: 30, description: '' }] };
    },
  } });
  await assert.rejects(data.interpretCatalogWithGoAi(business, 'Corte 25 €', null, false), /Autoriza/);
  assert.equal(calls.length, 0);
  await assert.rejects(data.interpretCatalogWithGoAi(business, 'Corte 25 €', null, true), /no está disponible/);
  assert.equal(calls.length, 1);
  assert.ok(calls[0].url.endsWith('/capabilities'));
  available = true;
  const rows = await data.interpretCatalogWithGoAi(business, 'Corte 25 €', null, true);
  assert.equal(rows[0].name, 'Corte');
  assert.equal(calls.length, 3);
  assert.ok(calls[2].url.endsWith('/catalog-import/ai/interpret'));
  assert.deepEqual(JSON.parse(calls[2].options.body), { text: 'Corte 25 €', consent: true });
  assert.equal(calls[2].options.method, 'POST');
});
