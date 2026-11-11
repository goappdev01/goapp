import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const req = createRequire(path.join(process.cwd(), 'package.json'));
const ts = req('typescript');
const zod = createRequire(path.resolve('../../lib/api-zod/package.json'))('zod');
function loadContract() {
  const file = '../../lib/api-zod/src/sports-events.ts';
  const scope = { exports: {}, require: name => name === 'zod' ? zod : (() => { throw new Error(name); })() };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  }).outputText, scope);
  return scope.exports;
}

test('sports events client gate allows only a server-authorized ADMIN identity', () => {
  const { canUseSportsEvents } = loadContract();
  assert.equal(canUseSportsEvents('ADMIN', true, 'synthetic-admin-id'), true);
  assert.equal(canUseSportsEvents('ADMIN', false, 'synthetic-admin-id'), false);
  assert.equal(canUseSportsEvents('ADMIN', true, null), false);
  assert.equal(canUseSportsEvents('BUSINESS', true, 'synthetic-business-id'), false);
  assert.equal(canUseSportsEvents('USER', true, 'synthetic-user-id'), false);
});

test('sports orbit and private panel are guarded against non-ADMIN and unverified access', () => {
  const app = fs.readFileSync('app/index.tsx', 'utf8');
  const panel = fs.readFileSync('components/sports/SportsEventsAdminPanel.tsx', 'utf8');
  assert.match(app, /adminAction\?: "sports-events"/);
  assert.match(app, /const sportsAdminAllowed = goView\.isAdminView && adminAccess\.allowed && !adminAccess\.checking/);
  assert.match(app, /sportsAdminAllowed \|\| !layer\.some\(brand => brand\.adminAction === "sports-events"\)/);
  assert.match(app, /if \(!sportsAdminAllowed\) return/);
  assert.match(app, /visible=\{sportsEventsOpen && goView\.isAdminView && adminAccess\.allowed && !adminAccess\.checking\}/);
  assert.match(panel, /canUseSportsEvents\(view\.view, admin\.allowed && !admin\.checking, admin\.userId\)/);
  assert.match(panel, /Espacio privado de esta cuenta ADMIN/);
  assert.match(panel, /no se publican ni son visibles para EMPRESA o USUARIO/);
  assert.match(panel, /no está activado|todavía no activado/);
});
