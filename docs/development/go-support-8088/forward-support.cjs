'use strict';
// Optional preload for the existing 3002 development API. No new listener, identity or storage.
const http = require('node:http'), https = require('node:https');
const route = '/api/supabase/support';
function wrapListener(listener, target = 'https://goapp-api-production.up.railway.app', allowLoopback = false) {
  const upstream = new URL(target);
  if (upstream.username || upstream.password || upstream.pathname !== '/' || upstream.search || upstream.hash ||
    (upstream.protocol !== 'https:' && !(allowLoopback && upstream.protocol === 'http:' && upstream.hostname === '127.0.0.1')))
    throw Error('Invalid support API target');
  return function (req, res) {
    const rawPath = req.url.split('?')[0];
    if (rawPath !== route && !rawPath.startsWith(route + '/')) return listener.call(this, req, res);
    const incoming = new URL(req.url, 'http://127.0.0.1'), pathname = incoming.pathname;
    if (pathname !== route && !pathname.startsWith(route + '/')) { res.writeHead(400); res.end(); return; }
    const headers = {};
    for (const name of ['authorization', 'content-type', 'content-length', 'accept'])
      if (req.headers[name] !== undefined) headers[name] = req.headers[name];
    const transport = upstream.protocol === 'https:' ? https : http;
    const destination = new URL(upstream); destination.pathname = pathname; destination.search = incoming.search;
    const forward = transport.request(destination, { method: req.method, headers }, response => {
      res.writeHead(response.statusCode, { ...response.headers, 'cache-control': 'no-store' }); response.pipe(res);
    });
    forward.setTimeout(30000, () => forward.destroy());
    forward.on('error', () => {
      if (res.headersSent) { res.destroy(); return; }
      res.writeHead(503, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ code: 'SUPPORT_UNAVAILABLE', error: 'No se pudo conectar con AYUDA. Conserva el texto e inténtalo de nuevo.' }));
    });
    req.on('aborted', () => forward.destroy()); req.pipe(forward);
  };
}
function install() {
  if (process.env.PORT !== '3002') throw Error('Support forwarding is limited to the existing local API.');
  const mark = Symbol.for('go.support.forwarder'); if (http[mark]) return;
  const original = http.createServer;
  http.createServer = function (...args) {
    const index = typeof args[0] === 'function' ? 0 : typeof args[1] === 'function' ? 1 : -1;
    if (index >= 0) args[index] = wrapListener(args[index]);
    return original.apply(this, args);
  }; http[mark] = true;
}
if (process.env.GO_SUPPORT_FORWARD_ENABLED === 'true') install();
module.exports = { wrapListener, install };
