import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shoppingFixture, shoppingUI } from './helpers/shopping-fixture.mjs';

test('USER, BUSINESS and verified ADMIN reach the same product orbit directly', async () => {
  for (const [view, context] of [['USER', 'live:USER'], ['BUSINESS', 'live:BUSINESS'],
    ['BUSINESS', 'demo:BUSINESS:synthetic-business'], ['ADMIN', 'live:ADMIN']]) {
    const f = await shoppingFixture();
    const scope = { ...f.disk.scope, context };
    const ui = await shoppingUI(f, { scope, startList: false,
      goView: { view, isAdminView: view === 'ADMIN' },
      adminAccess: { userId: scope.userId, allowed: view === 'ADMIN', checking: false, unavailable: false } });
    assert.ok(ui.hosts.has('shopping-seven-orbits'), `${view} ${context}`);
    assert.ok(ui.hosts.has('shopping-orbit-bakery'), `${view} ${context}`);
    await ui.close();
  }
});

test('unverified ADMIN is denied, while business lists remain local to their owner and context', async () => {
  const f = await shoppingFixture();
  const adminScope = { ...f.disk.scope, context: 'live:ADMIN' };
  const admin = await shoppingUI(f, { scope: adminScope, startList: false,
    goView: { view: 'ADMIN', isAdminView: true },
    adminAccess: { userId: adminScope.userId, allowed: false, checking: false, unavailable: false } });
  assert.equal(admin.hosts.has('shopping-seven-orbits'), false);
  await admin.close();

  const business = { ...f.disk.scope, context: 'live:BUSINESS' };
  const preview = { ...f.disk.scope, context: 'demo:BUSINESS:synthetic-business' };
  const own = await f.api().openShoppingNote(business, () => true);
  const other = await f.api().openShoppingNote(preview, () => true);
  assert.notEqual(own.id, other.id);
  const before = JSON.stringify(f.disk.rows);
  await assert.rejects(() => f.api().runShoppingOperation(business, () => true,
    { type: 'saveItem', operationId: 'cross-context', draft: { ...f.model.shoppingEditor(), name: 'Pan' } }, other.id),
  /Abre COMPRAS/);
  assert.equal(JSON.stringify(f.disk.rows), before);
  await f.disk.setUser('another-synthetic-user');
  await assert.rejects(() => f.api().listShoppingLists(business, () => true), /sesión|cuenta|usuario/i);
});
