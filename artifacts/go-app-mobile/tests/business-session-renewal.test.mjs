import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { loadAuthSession } from './helpers/auth-session-fixture.mjs';
import { modulePublicationPolicy } from './helpers/module-publication-fixture.mjs';
const ts = createRequire(import.meta.url)('typescript');
const compile = source => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const login = { exports: {} };
vm.runInNewContext(compile(readFileSync('lib/loginResponse.ts', 'utf8')), login);
const owner = '11111111-1111-4111-8111-111111111111', other = '22222222-2222-4222-8222-222222222222';
const sid = '33333333-3333-4333-8333-333333333333', businessId = '44444444-4444-4444-8444-444444444444';
const base = 'https://synthetic.invalid/api';
const jwt = expiration => 'test.' + Buffer.from(JSON.stringify({ exp: expiration, session_id: sid })).toString('base64url') + '.test';
const expired = jwt(Math.floor(Date.now() / 1000) - 3600), renewed = jwt(Math.floor(Date.now() / 1000) + 3600);
const session = { access_token: expired, refresh_token: 'test-only-refresh', expires_at: Math.floor(Date.now() / 1000) - 3600,
  user: { id: owner, user_metadata: { role: 'empresa' } } };

function fixture({ refreshStatus = 200, refreshCode, freshOwner = owner, storage: sharedStorage, secure: sharedSecure } = {}) {
  const storage = sharedStorage ?? new Map(), secure = sharedSecure ?? new Map([['go_auth_session_v2', JSON.stringify(session)]]), calls = [];
  const storageApi = { getItem: async key => storage.get(key) ?? null, setItem: async (key, value) => { storage.set(key, value); },
    multiRemove: async keys => { for (const key of keys) storage.delete(key); }, removeItem: async key => { storage.delete(key); } };
  const fetch = async (url, init) => {
    calls.push({ path: new URL(url).pathname, token: new Headers(init?.headers).get('Authorization') });
    if (url.endsWith('/supabase/auth/refresh')) return Response.json(refreshStatus === 200
      ? { ...session, access_token: renewed, refresh_token: 'test-only-rotated', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: freshOwner } }
      : { code: refreshCode }, { status: refreshStatus });
    if (url.endsWith('/supabase/manage/businesses')) {
      assert.equal(new Headers(init.headers).get('Authorization'), 'Bearer ' + renewed);
      return Response.json([{ id: businessId, owner_id: owner, name: 'Empresa sintética', verified: false }]);
    }
    throw Error('Unexpected synthetic route');
  };
  const globals = { process: { env: { EXPO_PUBLIC_API_URL: base } }, fetch };
  const auth = loadAuthSession(globals, storageApi, {}, { secure });
  const scope = { exports: {}, ...globals, Headers, Response, URLSearchParams, Error, require(name) {
    if (name === '@react-native-async-storage/async-storage') return { default: storageApi };
    if (name === '@/lib/authSession') return auth;
    if (name === 'react-native') return { Platform: { OS: 'ios' } };
    if (name === '@/lib/loginResponse') return login.exports;
    if (name === '@workspace/api-zod') return modulePublicationPolicy;
    if (name === './goSearchAliases') return {};
    throw Error('Unexpected import ' + name);
  } };
  vm.runInNewContext(compile(readFileSync('data/booking.ts', 'utf8')), scope);
  return { auth, booking: scope.exports, storage, secure, calls };
}

test('business list refreshes a restored expired session BEFORE querying private businesses', async () => {
  const f = fixture();
  const businesses = await f.booking.getOwnedBusinesses();
  assert.equal(businesses[0].id, businessId);
  assert.deepEqual(f.calls.map(call => call.path), ['/api/supabase/auth/refresh', '/api/supabase/manage/businesses']);
  assert.equal(f.calls.some(call => call.token === 'Bearer ' + expired), false);
  // This list projection cannot promote the server's unverified business.
  // Permission/verification checks are covered by the business-access suites.
  assert.notEqual(businesses[0].verified, true);
});

test('rotated business credentials survive a new module instance/app reopening', async () => {
  const first = fixture(); await first.booking.getOwnedBusinesses();
  const reopened = fixture({ storage: first.storage, secure: first.secure });
  await reopened.booking.getOwnedBusinesses();
  assert.deepEqual(reopened.calls.map(call => call.path), ['/api/supabase/manage/businesses']);
});

test('concurrent business entry points share one refresh; no expired access token is forwarded', async () => {
  const f = fixture(); await Promise.all([f.booking.getOwnedBusinesses(), f.booking.getOwnedBusinesses()]);
  assert.equal(f.calls.filter(call => call.path.endsWith('/refresh')).length, 1);
  assert.equal(f.calls.filter(call => call.path.endsWith('/manage/businesses')).length, 2);
});

test('irrecoverable renewal returns to normal identification, without business requests', async () => {
  const f = fixture({ refreshStatus: 401, refreshCode: 'SESSION_UNRECOVERABLE' });
  await assert.rejects(f.booking.getOwnedBusinesses());
  assert.equal(await f.auth.readAuthSession(), null);
  assert.equal(f.calls.some(call => call.path.endsWith('/manage/businesses')), false);
});

test('temporary renewal failure preserves recovery credentials and denies the protected request', async () => {
  const f = fixture({ refreshStatus: 503, refreshCode: 'UNAVAILABLE' });
  await assert.rejects(f.booking.getOwnedBusinesses());
  assert.equal((await f.auth.readAuthSession()).refresh_token, session.refresh_token);
  assert.equal(f.calls.some(call => call.path.endsWith('/manage/businesses')), false);
});

test('renewal cannot silently switch the business session to a different user', async () => {
  const f = fixture({ freshOwner: other });
  await assert.rejects(f.booking.getOwnedBusinesses());
  assert.equal(f.calls.some(call => call.path.endsWith('/manage/businesses')), false);
});
