const { test } = require('node:test'), assert = require('node:assert/strict'), http = require('node:http');
const { wrapListener } = require('../../../docs/development/go-support-8088/forward-support.cjs');
test('existing API forwards only SOPORTE, preserves authentication and leaves other modules untouched', async () => {
  let forwarded = 0, original = 0;
  const target = http.createServer((req, res) => { forwarded++; assert.equal(req.headers.authorization, 'Bearer synthetic');
    assert.equal(req.headers.cookie, undefined); res.writeHead(401, { 'content-type': 'application/json' }); res.end('{"code":"AUTH_REQUIRED"}'); });
  await new Promise(done => target.listen(0, '127.0.0.1', done));
  const api = http.createServer(wrapListener((_req, res) => { original++; res.end('existing'); },
    `http://127.0.0.1:${target.address().port}`, true));
  await new Promise(done => api.listen(0, '127.0.0.1', done));
  try {
    const base = `http://127.0.0.1:${api.address().port}`;
    const response = await fetch(base + '/api/supabase/support/requests', { headers: { Authorization: 'Bearer synthetic', Cookie: 'private=do-not-forward' } });
    assert.equal(response.status, 401); assert.equal((await response.json()).code, 'AUTH_REQUIRED');
    for (const path of ['/api/healthz', '/api/supabase/bookings', '/api/supabase/support-other'])
      assert.equal(await (await fetch(base + path)).text(), 'existing');
    assert.equal(forwarded, 1); assert.equal(original, 3);
    assert.throws(() => wrapListener(() => {}, 'http://external.invalid'), /Invalid/);
  } finally { await Promise.all([new Promise(done => api.close(done)), new Promise(done => target.close(done))]); }
});
