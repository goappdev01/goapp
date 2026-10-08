import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

test('combined route registry preserves ADMIN authorization and the AI /plan endpoint', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-v1-integration-'));
  const outfile = path.join(dir, 'router.mjs');
  await build({
    entryPoints: ['src/routes/index.ts'], outfile, bundle: true, platform: 'node', format: 'esm',
    banner: { js: "import {createRequire} from 'node:module';const require=createRequire(import.meta.url);" },
    plugins: [{ name: 'unrelated-routes', setup(builder) {
      builder.onLoad({ filter: /.*/ }, args => {
        if (path.dirname(args.path) !== path.resolve('src/routes') ||
            !['health.ts', 'management.ts', 'supabase.ts'].includes(path.basename(args.path))) return;
        return {
          contents: 'import {Router} from "express"; export default Router();',
          loader: 'ts', resolveDir: path.resolve('src/routes'),
        };
      });
    } }],
  });
  const { default: router } = await import(pathToFileURL(outfile));
  const { default: express } = await import('express');
  const app = express(); app.use(express.json()); app.use('/api', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const realFetch = globalThis.fetch;
  const keys = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'];
  const before = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const id = '11111111-1111-4111-8111-111111111111';
  delete process.env.OPENAI_API_KEY;
  process.env.SUPABASE_URL = 'https://integration-test.invalid';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-public';
  let role = 'usuario', upstreamCalls = 0;
  globalThis.fetch = async (url, init) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://integration-test.invalid', 'no live upstream is contacted');
    assert.equal(init.headers.Authorization, 'Bearer test-token');
    upstreamCalls++;
    if (parsed.pathname === '/auth/v1/user') return Response.json({ id, user_metadata: { role: 'admin' } });
    assert.equal(parsed.pathname, '/rest/v1/profiles');
    assert.equal(parsed.searchParams.get('id'), 'eq.' + id);
    return Response.json([{ id, role }]);
  };
  const base = 'http://127.0.0.1:' + server.address().port + '/api';
  try {
    assert.equal((await realFetch(base + '/supabase/admin/access')).status, 401);
    const authorized = () => realFetch(base + '/supabase/admin/access', { headers: { Authorization: 'Bearer test-token' } });
    assert.equal((await authorized()).status, 403, 'editable metadata does not grant ADMIN');
    role = 'admin';
    assert.equal((await authorized()).status, 200);
    const previousCalls = upstreamCalls;
    const response = await realFetch(base + '/booking-assistant/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'recuérdame llamar a Nelson mañana a las 17:30', today: '2026-10-08',
        context: { active: null, pending: null, selected: null, listTitle: null, bookingDate: null, bookingTime: null } }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.mode, 'rules');
    assert.equal(body.plan.actions[0].kind, 'task');
    assert.equal(body.plan.actions[0].date, '2026-10-09');
    assert.equal(body.plan.actions[0].time, '17:30');
    assert.equal(upstreamCalls, previousCalls, 'local planning uses no provider and performs no task write');
  } finally {
    globalThis.fetch = realFetch;
    for (const key of keys) {
      if (before[key] === undefined) delete process.env[key]; else process.env[key] = before[key];
    }
    await new Promise(resolve => server.close(resolve));
    await rm(dir, { recursive: true, force: true });
  }
});
