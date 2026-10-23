import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
const ts = createRequire(path.join(process.cwd(), 'package.json'))('typescript');
const scope = { exports: {} };
vm.runInNewContext(ts.transpileModule(readFileSync('../../lib/api-zod/src/module-publication.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scope);
const p = scope.exports, plain = value => JSON.parse(JSON.stringify(value));
const sectors = [{ id: 'belleza', subs: [{ id: 'peluqueria' }, { id: 'barberia' }, { id: 'unas' }] }, { id: 'restauracion', subs: [{ id: 'restaurante' }] }];
test('pilot exposes only hairdressers while retaining the full original catalogue', () => {
  const before = JSON.stringify(sectors), result = p.visibleBookingSectors(sectors);
  assert.deepEqual(plain(result), [{ id: 'belleza', subs: [{ id: 'peluqueria' }] }]); assert.equal(JSON.stringify(sectors), before);
  assert.equal(p.bookingActivityEnabled('barberia'), false); assert.equal(p.bookingActivityEnabled('restaurante'), false);
});
test('internal view and business authorization are different decisions', () => {
  assert.deepEqual(plain(p.visibleBookingSectors(sectors, p.defaultGoModulePublication(), true)), sectors);
  const decision = p.goModuleDecision('reservas.restaurante', { internalAccess: true, authorized: false });
  assert.equal(decision.visible, true); assert.equal(decision.operable, true); assert.equal(decision.allowed, false);
});
test('new releases are configurable without rewriting sector components', () => {
  const policy = p.parseGoModulePublication({ version: 1, audience: 'general', stages: { 'reservas.restauracion': 'public' } });
  assert.equal(p.bookingActivityEnabled('restaurante', policy), true); assert.equal(p.bookingActivityEnabled('peluqueria', policy), false);
  assert.deepEqual(plain(p.visibleBookingSectors(sectors, policy)).map(row => row.id), ['restauracion']);
});
test('exact legacy category normalization does not infer a sector from a business name', () => {
  assert.equal(p.canonicalBookingActivity('Belleza Peluquería'), 'peluqueria'); assert.equal(p.bookingActivityEnabled('Belleza Peluquería'), true);
  for (const category of ['belleza', 'restauracion', '', null, 'Mi peluquería favorita', 'GO Restaurante']) assert.equal(p.bookingActivityEnabled(category), false);
});
test('invalid configuration cannot enable unpublished sectors', () => {
  for (const value of [null, [], 'all', { version: 2, audience: 'all', stages: { 'reservas.restaurante': 'public' } }]) assert.equal(p.bookingActivityEnabled('restaurante', p.parseGoModulePublication(value)), false);
});
test('every existing activity is retained in the shared release registry', () => {
  const catalogue = readFileSync('data/goSectorData.ts', 'utf8'); let sector = '';
  for (const line of catalogue.split(/\r?\n/)) {
    const parent = line.match(/^    id: "([^"]+)"/); if (parent) sector = parent[1];
    const sub = line.match(/^      \{ id: "([^"]+)"/); if (sub) assert.ok(p.GO_BOOKING_ACTIVITY_GROUPS[sector].includes(sub[1]), sub[1]);
  }
});
test('search uses the same projection for categories, recent businesses, text and direct ID', () => {
  const code = readFileSync('components/booking/BookingSearchOverlay.tsx', 'utf8');
  assert.match(code, /visibleBookingSectors\(SECTORS/); assert.match(code, /all\.filter\(businessVisible\)/);
  assert.match(code, /searchBusinesses\(query\)\)\)\.filter\(businessVisible\)/); assert.match(code, /initialBusinessId && all\.find\(business => business\.id === initialBusinessId && businessVisible\(business\)\)/);
  assert.match(code, /if \(!businessVisible\(b\)\) return/);
});
test('USER with an owner demo repository still sees only the pilot; internal preview requires verified ADMIN/BUSINESS', () => {
  const fixture = (view, admin = { checking: false, allowed: true, level: 'owner', userId: 'owner', permissions: ['development'] }) => {
    const scoped = { exports: {}, require(name) {
      if (name === 'react') return { useState: initial => [initial(), () => {}], useEffect() {} };
      if (name === '@workspace/api-zod') return p;
      if (name === '@/data/booking') return { supabaseApiRequest: async () => p.defaultGoModulePublication() };
      if (name === '@/contexts/GoAdminAccessContext') return { useAdminAccess: () => admin };
      if (name === '@/contexts/GoViewContext') return { useGoView: () => ({ loaded: true, isOwner: true, isBusinessPreview: false, isAdminView: false, ...view }) };
      throw Error(name);
    } };
    vm.runInNewContext(ts.transpileModule(readFileSync('hooks/useBookingModulePublication.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, scoped);
    return scoped.exports.useBookingModulePublication(true, true);
  };
  const user = fixture({}); assert.equal(user.internalAccess, false);
  assert.deepEqual(plain(p.visibleBookingSectors(sectors, user.publication, user.internalAccess)), [{ id: 'belleza', subs: [{ id: 'peluqueria' }] }]);
  assert.equal(fixture({ isAdminView: true }).internalAccess, true);
  const business = fixture({ isBusinessPreview: true }); assert.equal(business.internalAccess, true); assert.equal(business.remoteInternalAccess, false);
  assert.equal(fixture({ isBusinessPreview: true }, { checking: false, allowed: false, level: null, userId: null, permissions: [] }).internalAccess, false);
  assert.equal(fixture({ isAdminView: true }, { checking: true, allowed: true, level: 'owner', permissions: ['development'] }).internalAccess, false);
});
