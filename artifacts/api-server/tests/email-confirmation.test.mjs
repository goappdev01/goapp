import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript'); // Existing workspace dev dependency.

function fixture() {
  const requests = []; let upstream = new Response('{}', { status: 200 });
  const source = readFileSync('src/routes/supabase.ts', 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} };
  const localRequire = id => id === '../lib/supabase' ? {
    bearerHeader: authorization => ({ Authorization: authorization }),
    supabaseRequest: async (url, init) => { requests.push({ url, init }); return upstream; },
  } : require(id);
  new vm.Script(`(function(require, module, exports) {${code}\n})`).runInThisContext()(localRequire, module, module.exports);
  const router = module.exports.default;
  const response = () => ({
    statusCode: 200, headers: {}, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; return this; },
    status(value) { this.statusCode = value; return this; },
    type(value) { this.contentType = value; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
  });
  return { requests, response, setUpstream: value => { upstream = value; },
    handler(method, route) { return router.stack.find(layer => layer.route?.path === route && layer.route.methods[method]).route.stack[0].handle; },
  };
}

test('registration adds the public redirect without changing signup data or response', async () => {
  const f = fixture();
  const body = { email: 'pilot@example.invalid', password: 'test-password', full_name: 'Pilot', role: 'usuario', redirect_to: 'http://localhost:3000' };
  const payload = JSON.stringify({ id: 'test-user', confirmation_sent_at: '2030-01-01' });
  f.setUpstream(new Response(payload, { status: 200 }));
  const res = f.response(); await f.handler('post', '/auth/register')({ body }, res);
  const url = new URL(f.requests[0].url, 'https://supabase.invalid');
  assert.equal(url.pathname, '/auth/v1/signup');
  assert.equal(url.searchParams.get('redirect_to'), 'https://goapp-api-production.up.railway.app/api/supabase/auth/email-confirmed');
  assert.deepEqual(JSON.parse(f.requests[0].init.body), { email: body.email, password: body.password, data: { full_name: body.full_name, role: 'usuario' } });
  assert.equal(res.body, payload); assert.equal(res.statusCode, 200); assert.equal(f.requests.length, 1);
});

test('registration retains validation and upstream error responses', async () => {
  const f = fixture(); const invalid = f.response();
  await f.handler('post', '/auth/register')({ body: { email: 'pilot@example.invalid', password: 'short' } }, invalid);
  assert.equal(invalid.statusCode, 400); assert.equal(f.requests.length, 0);
  f.setUpstream(new Response('{"error":"rate limited"}', { status: 429 }));
  const limited = f.response();
  await f.handler('post', '/auth/register')({ body: { email: 'pilot@example.invalid', password: 'test-password' } }, limited);
  assert.equal(limited.statusCode, 429); assert.equal(limited.body, '{"error":"rate limited"}');
});

test('login and password recovery retain destinations and payloads', async () => {
  for (const route of ['login', 'recover']) {
    const f = fixture(); const res = f.response(); const body = { email: 'pilot@example.invalid', password: 'test-password' };
    await f.handler('post', '/auth/' + route)({ body }, res);
    assert.equal(f.requests[0].url, route === 'login' ? '/auth/v1/token?grant_type=password' : '/auth/v1/recover');
    assert.deepEqual(JSON.parse(f.requests[0].init.body), route === 'login' ? body : { email: body.email });
  }
});

test('callback makes no upstream calls, removes URL credentials, and handles link errors', async () => {
  const f = fixture(); const res = f.response();
  await f.handler('get', '/auth/email-confirmed')({ query: { error_description: '<script>untrusted</script>' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(f.requests.length, 0);
  assert.equal(res.headers['cache-control'], 'no-store'); assert.equal(res.headers['referrer-policy'], 'no-referrer');
  assert.ok(res.body.includes('href="go-app://"')); assert.ok(res.body.includes('Expo Go'));
  assert.ok(!res.body.includes('untrusted')); assert.ok(!res.body.includes('localhost'));
  const script = res.body.match(/<script>([\s\S]*?)<\/script>/)[1];
  const hash = require('node:crypto').createHash('sha256').update(script).digest('base64');
  assert.ok(res.headers['content-security-policy'].includes(`'sha256-${hash}'`));
  for (const failure of [false, true]) {
    let cleaned; const message = { textContent: 'initial' };
    vm.runInNewContext(script, { URLSearchParams, window: {
      location: { hash: failure ? '#error=access_denied&error_description=untrusted' : '#access_token=test-only&refresh_token=test-only', search: '', pathname: '/api/supabase/auth/email-confirmed' },
      history: { replaceState: (_state, _title, url) => { cleaned = url; } },
    }, document: { getElementById: () => message } });
    assert.equal(cleaned, '/api/supabase/auth/email-confirmed');
    assert.equal(message.textContent.includes('ha caducado'), failure); assert.ok(!message.textContent.includes('untrusted'));
  }
});
