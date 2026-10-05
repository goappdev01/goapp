import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const homeSource = readFileSync('app/index.tsx', 'utf8');
const profileSource = readFileSync('components/perfil/PerfilPanel.tsx', 'utf8');
const home = ts.createSourceFile('index.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const profile = ts.createSourceFile('PerfilPanel.tsx', profileSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(root, predicate) {
  if (predicate(root)) return root;
  let result; ts.forEachChild(root, child => { if (!result) result = find(child, predicate); });
  return result;
}
function functionSource(name) {
  const declaration = find(home, node => ts.isVariableDeclaration(node) && node.name.getText(home) === name);
  assert.ok(declaration, `${name} exists`);
  return `const ${name} = ${declaration.initializer.getText(home)};`;
}
function fixture(remove) {
  const events = [];
  const storage = new Map([['go_supabase_session_v1', '{"access_token":"test-only","refresh_token":"test-only","user":{"id":"test-user"}}'], ['go_account_type_v1', 'usuario'], ['unrelated-preference', 'keep']]);
  const state = { role: 'usuario', profileOpen: true, authOpen: false, mode: 'USER' };
  const context = {
    AsyncStorage: {
      async multiRemove(keys) { events.push('remove:start'); if (remove) await remove(); keys.forEach(key => storage.delete(key)); events.push('remove:finish'); },
      async setItem(key, value) { storage.set(key, value); },
      async removeItem(key) { storage.delete(key); },
    },
    setUserAccountType: role => { state.role = role; events.push('role:' + role); },
    syncModeFromRole: role => { state.mode = role === null ? 'USER' : 'BUSINESS'; storage.set('go_active_mode_v1', state.mode); },
    setGoAuthOpen: open => { state.authOpen = open; },
    setCuentaOpen: open => { state.profileOpen = open; },
    notifySessionChanged: () => { assert.equal(storage.has('go_supabase_session_v1'), false); events.push('session:changed'); },
    console: { warn: () => events.push('storage:error') },
  };
  const code = functionSource('commitAccountType') + '\n' + functionSource('handleProfileLogout') + '\nglobalThis.logout = handleProfileLogout;';
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { logout: context.logout, events, storage, state };
}

test('the red button invokes the logout callback supplied by the home screen', () => {
  const button = find(profile, node => (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(profile) === 'TouchableOpacity' && node.attributes.properties.some(prop => ts.isJsxAttribute(prop) && prop.name.getText(profile) === 'style' && prop.initializer?.getText(profile) === '{s.signOutBtn}'));
  assert.ok(button);
  assert.equal(button.attributes.properties.find(prop => prop.name?.getText(profile) === 'onPress').initializer.getText(profile), '{onLogout}');
  const panel = find(home, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(home) === 'PerfilPanel');
  assert.equal(panel.attributes.properties.find(prop => prop.name?.getText(home) === 'onLogout').initializer.getText(home), '{handleProfileLogout}');
});

test('logout removes the complete session and role, closes the profile, and opens existing authentication', async () => {
  const f = fixture(); await f.logout();
  assert.equal(f.storage.has('go_supabase_session_v1'), false);
  assert.equal(f.storage.has('go_account_type_v1'), false);
  assert.equal(f.storage.get('unrelated-preference'), 'keep');
  assert.deepEqual(f.state, { role: null, profileOpen: false, authOpen: true, mode: 'USER' });
  assert.ok(f.events.indexOf('remove:finish') < f.events.indexOf('role:null'));
  assert.equal(f.events.filter(event => event === 'session:changed').length, 1);
});

test('logout waits for storage before changing authentication or notifying listeners', async () => {
  let release; const blocked = new Promise(resolve => { release = resolve; });
  const f = fixture(() => blocked); const pending = f.logout();
  assert.equal(f.state.role, 'usuario'); assert.equal(f.state.profileOpen, true);
  assert.equal(f.state.authOpen, false); assert.ok(!f.events.includes('session:changed'));
  release(); await pending;
  assert.equal(f.state.role, null); assert.equal(f.state.authOpen, true);
});

test('a storage failure does not falsely report a completed logout', async () => {
  const f = fixture(async () => { throw new Error('storage unavailable'); }); await f.logout();
  assert.equal(f.storage.has('go_supabase_session_v1'), true);
  assert.equal(f.state.role, 'usuario'); assert.equal(f.state.profileOpen, true); assert.equal(f.state.authOpen, false);
  assert.ok(f.events.includes('storage:error')); assert.ok(!f.events.includes('session:changed'));
});
