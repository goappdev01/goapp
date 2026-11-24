import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ts = require('typescript');
const { fixture, devices } = require('./helpers/landing-qr-fixture.cjs');

const separated = (a, b, gap = 3.9) => a.x + a.width + gap <= b.x || b.x + b.width + gap <= a.x
  || a.y + a.height + gap <= b.y || b.y + b.height + gap <= a.y;

test('the cart sits between LIST and FOOD without moving any existing orbit or floating control', () => {
  for (const device of devices)
    for (const preset of ['compacto', 'estandar', 'grande'])
      for (const profile of ['ADMIN', 'USER'])
        for (const hand of ['right', 'left']) {
          const f = fixture(device, preset, profile, hand);
          const geometry = f.compactLandingGeometry;
          const cart = f.landingShoppingRect;
          const hidden = fixture(device, preset, profile, hand, { shoppingShortcutVisible: false });
          assert.ok(geometry.fitted && cart, `${device.width} ${preset} ${profile} ${hand}`);
          assert.equal(hidden.landingShoppingRect, null);
          assert.equal(JSON.stringify(geometry.obstacles), JSON.stringify(hidden.compactLandingGeometry.obstacles));
          assert.equal(JSON.stringify(geometry.center), JSON.stringify(hidden.compactLandingGeometry.center));
          assert.equal(JSON.stringify(f.landingNavigationCloseRect), JSON.stringify(hidden.landingNavigationCloseRect));
          assert.ok(cart.width >= 44 && cart.height >= 44);
          assert.ok(cart.x >= geometry.bounds.left - .01 && cart.x + cart.width <= geometry.bounds.right + .01);
          assert.ok(cart.y >= geometry.bounds.top - .01 && cart.y + cart.height <= geometry.bounds.bottom + .01);
          for (const other of geometry.obstacles)
            assert.ok(separated(cart, other, 0), `${device.width} ${preset} ${profile} ${hand}: ${other.key}`);
          for (const other of geometry.fixedObstacles)
            assert.ok(separated(cart, other, 0), `fixed ${device.width} ${preset} ${profile} ${hand}`);
          assert.ok(separated(cart, geometry.help), `AYUDA ${device.width} ${hand}`);
          assert.ok(separated(cart, f.landingNavigationCloseRect, 0), `close ${device.width} ${hand}`);
          const list = geometry.obstacles.find(rect => rect.key === 'list');
          const food = geometry.obstacles.find(rect => rect.key === 'orbit-1');
          const centerDistance = rect => Math.hypot(cart.x + cart.width / 2 - rect.x - rect.width / 2,
            cart.y + cart.height / 2 - rect.y - rect.height / 2);
          const shortcut = f.ctx.shoppingShortcut;
          const ideal = { x: geometry.center.x + (geometry.mirrored ? -shortcut.x : shortcut.x) - shortcut.touchSize / 2,
            y: geometry.center.y + shortcut.y - shortcut.touchSize / 2,
            width: shortcut.touchSize, height: shortcut.touchSize };
          if (separated(ideal, f.landingNavigationCloseRect, 0))
            assert.ok(Math.abs(centerDistance(list) - centerDistance(food)) < 14,
              `balanced LIST/FOOD ${device.width} ${preset} ${hand}`);
        }
});

test('Landing opens the existing GO Compras product orbit and closes directly back to Landing', () => {
  const source = fs.readFileSync('app/index.tsx', 'utf8');
  const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let opener;
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'openLandingShopping') opener = node;
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(opener);
  const calls = [], shoppingFromLanding = { current: false };
  const js = ts.transpileModule(opener.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(`${js}\nopenLandingShopping()`, { openUnifiedNoteComposer: seed => calls.push(seed), shoppingFromLanding });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].shopping, true);
  assert.equal(shoppingFromLanding.current, true);
  const shortcut = source.slice(source.indexOf('testID="landing-shopping-shortcut"'), source.indexOf('</TouchableOpacity>', source.indexOf('testID="landing-shopping-shortcut"')));
  assert.ok(shortcut.includes('openLandingShopping()'));
  assert.ok(source.includes('if(shoppingFromLanding.current){shoppingFromLanding.current=false;setNotesOpen(false)'));
  assert.match(shortcut, /backgroundColor: "#080808"/);
  assert.doesNotMatch(shortcut, /LinearGradient/);
  const cartArt = fs.readFileSync('components/landing/LandingShoppingCart.tsx', 'utf8');
  assert.match(cartArt, /stroke="#FFFFFF"/);
  assert.doesNotMatch(cartArt, /LinearGradient|<Rect|fill="#[0-9A-F]{6}"/);
  const shopping = fs.readFileSync('components/notes/GoShoppingNote.tsx', 'utf8');
  assert.match(shopping, /useState<"list"\|"add">\("add"\)/);
  assert.match(shopping, /testID="shopping-seven-orbits"/);
});
