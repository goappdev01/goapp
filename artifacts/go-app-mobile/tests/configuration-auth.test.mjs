import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const read = file => readFileSync(file, 'utf8');
const homeSource = read('app/index.tsx');
const configSource = read('contexts/GoBusinessConfigContext.tsx');
const bookingSource = read('data/booking.ts');
const parse = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const home = parse('index.tsx', homeSource);
const config = parse('GoBusinessConfigContext.tsx', configSource);
function find(root, predicate) {
  if (predicate(root)) return root;
  let found;
  ts.forEachChild(root, child => { if (!found) found = find(child, predicate); });
  return found;
}
const loadEffect = find(config, node => ts.isCallExpression(node) && node.expression.getText(config) === 'useEffect'
  && node.arguments[0]?.getText(config).includes('const rawDraft'));
const loadFunction = find(loadEffect.arguments[0], node => ts.isArrowFunction(node)
  && node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.AsyncKeyword));
const openOptions = find(home, node => ts.isVariableDeclaration(node) && node.name.getText(home) === 'handleOpenOptions');
const transpile = source => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const sessionKey = 'go_supabase_session_v1';
const realSession = { access_token: 'test-only-token', user: { id: 'test-user' } };

function fixture(session = null, response = async () => Response.json([]), onRead) {
  const storage = new Map(session ? [[sessionKey, JSON.stringify(session)]] : []);
  const reads = [], requests = [], alerts = [];
  const generation = { current: 0 };
  const state = { config: { businessName: 'previous user' }, loaded: false };
  const AsyncStorage = {
    async getItem(key) { reads.push(key); onRead?.(key, reads, storage); return storage.get(key) ?? null; },
    async setItem(key, value) { storage.set(key, value); },
  };
  const context = {
    exports: {}, Headers, Response,
    process: { env: { EXPO_PUBLIC_API_URL: 'https://test.invalid/api' } },
    require(name) {
      if (name === '@react-native-async-storage/async-storage') return { default: AsyncStorage };
      if (name === './goSearchAliases') return {};
      throw new Error(`Unexpected import: ${name}`);
    },
    fetch: async (url, init) => { requests.push({ url, init }); return response(); },
    AsyncStorage, generation, storageKey: { current: 'go_business_config_v1' },
    BUSINESS_CONFIG_KEY: 'go_business_config_v1', DEFAULT_BUSINESS_CONFIG: { businessName: '' },
    setConfig: value => { state.config = value; }, setLoaded: value => { state.loaded = value; },
    Alert: { alert: (...args) => alerts.push(args) },
  };
  vm.createContext(context);
  vm.runInContext(transpile(bookingSource), context);
  context.getAuthenticatedUserId = context.exports.getAuthenticatedUserId;
  context.getCloudConfiguration = context.exports.getCloudConfiguration;
  vm.runInContext(transpile(`globalThis.load = ${loadFunction.getText(config)};`), context);
  return { load: context.load, api: context.exports, storage, reads, requests, alerts, generation, state };
}

test('signed-out configuration skips business storage and protected HTTP requests', async () => {
  const f = fixture();
  f.storage.set('go_business_config_v1', 'invalid old cache');
  await f.load();
  assert.deepEqual(f.reads, [sessionKey]);
  assert.equal(f.requests.length, 0); assert.equal(f.alerts.length, 0);
  assert.equal(f.state.loaded, true); assert.equal(f.state.config.businessName, '');
  await assert.rejects(f.api.getCloudConfiguration(), error => error.code === 'AUTH_REQUIRED');
  assert.equal(f.requests.length, 0);
});

test('a user profile without an access token does not authenticate configuration', async () => {
  const f = fixture({ user: { id: 'test-user' } }); await f.load();
  assert.equal(await f.api.getAuthenticatedUserId(), null);
  assert.equal(f.requests.length, 0); assert.equal(f.alerts.length, 0);
});

test('authenticated configuration still sends the token and loads the cloud result', async () => {
  const f = fixture(realSession, async () => Response.json([{ business_id: 'business', payload: { businessName: 'GO Test' } }]));
  await f.load();
  assert.equal(f.requests.length, 1);
  assert.equal(f.requests[0].url, 'https://test.invalid/api/supabase/manage/configuration');
  assert.equal(f.requests[0].init.headers.get('Authorization'), 'Bearer test-only-token');
  assert.equal(f.state.config.businessName, 'GO Test'); assert.equal(f.alerts.length, 0);
});

test('logout during an outstanding configuration request invalidates its result and error', async () => {
  for (const status of [200, 403]) {
    let release, started;
    const pending = new Promise(resolve => { release = resolve; });
    const requested = new Promise(resolve => { started = resolve; });
    const f = fixture(realSession, async () => { started(); await pending; return Response.json([{ payload: { businessName: 'old account' } }], { status }); });
    const oldLoad = f.load(); await requested;
    f.storage.delete(sessionKey); f.generation.current++;
    await f.load(); release(); await oldLoad;
    assert.equal(f.alerts.length, 0); assert.equal(f.state.config.businessName, '');
    assert.equal(f.state.loaded, true);
  }
});

test('a session removed between user lookup and the protected request is a signed-out state', async () => {
  const f = fixture(realSession, undefined, (key, reads, storage) => {
    if (key === sessionKey && reads.length === 2) storage.delete(sessionKey);
  });
  await f.load();
  assert.equal(f.requests.length, 0); assert.equal(f.alerts.length, 0);
  assert.equal(f.state.loaded, true);
});

test('a real backend failure with a session still shows the existing configuration error', async () => {
  const f = fixture(realSession, async () => Response.json({ message: 'Backend unavailable' }, { status: 503 }));
  await f.load();
  assert.equal(f.alerts.length, 1); assert.equal(f.alerts[0][0], 'Configuración no cargada');
  assert.equal(f.state.loaded, false);
});

test('both configuration entry points use the existing authentication flow when signed out', () => {
  assert.equal((homeSource.match(/handleOpenOptions\(\);/g) ?? []).length, 2);
  assert.equal((homeSource.match(/setOptionsOpen\(true\)/g) ?? []).length, 1);
  for (const role of [null, 'usuario', 'empresa']) {
    const state = { options: false, auth: role === null };
    const context = { userAccountType: role, setOptionsOpen: value => { state.options = value; }, setGoAuthOpen: value => { state.auth = value; } };
    vm.createContext(context);
    vm.runInContext(transpile(`(${openOptions.initializer.getText(home)})();`), context);
    assert.equal(state.options, role !== null); assert.equal(state.auth, role === null);
  }
});
