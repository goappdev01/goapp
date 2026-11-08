import { pathToFileURL } from 'node:url';

/** Scheduler entry point. Its caller supplies a current authorized server-side identity; no credentials are stored here. */
export async function runSupportRetention({ base, token, execute = false, transport = fetch }) {
  const url = new URL(base);
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)))
    || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/api'))
    throw Error('Specify an HTTPS API base or an isolated loopback API.');
  if (typeof token !== 'string' || !token.trim() || /\s/.test(token)) throw Error('A current authorized identity is required.');
  const call = async (route, method) => {
    const response = await transport(url.href.replace(/\/$/, '') + '/supabase/support' + route, {
      method, headers: { Authorization: `Bearer ${token}` }, redirect: 'error', signal: AbortSignal.timeout(60000),
    });
    if (!response.ok) throw Error(`Support retention failed (HTTP ${response.status}).`);
    return response.json();
  };
  const ready = await call('/capabilities', 'GET');
  if (ready?.ready !== true || ready.version !== 1 || ready.retentionMonths !== 12) throw Error('Support is not ready.');
  if (!execute) return { mode: 'read-only', ready: true, purged: 0, pending: 0 };
  let purged = 0;
  for (let batch = 0; batch < 10; batch++) {
    const result = await call('/retention/purge', 'POST');
    if (!Number.isSafeInteger(result?.purged) || result.purged < 0 || !Number.isSafeInteger(result.pending) || result.pending < 0)
      throw Error('Invalid retention result.');
    purged += result.purged;
    if (result.pending > 0) throw Error('Private file cleanup is pending; retry the claimed requests.');
    if (result.purged === 0) return { mode: 'execute', ready: true, purged, pending: 0 };
  }
  throw Error('Retention batch limit reached; schedule another pass.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSupportRetention({ base: process.env.GO_SUPPORT_RETENTION_API_URL, token: process.env.GO_SUPPORT_RETENTION_BEARER,
    execute: process.argv.includes('--execute') })
    .then(result => console.log(JSON.stringify(result)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
}
