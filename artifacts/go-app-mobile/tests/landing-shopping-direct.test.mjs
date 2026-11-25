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

test('the cart sits between LIST and FOOD; only a blocking close target may move', () => {
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
          const shortcut = f.ctx.shoppingShortcut;
          const ideal = { x: geometry.center.x + (geometry.mirrored ? -shortcut.x : shortcut.x) - shortcut.touchSize / 2,
            y: geometry.center.y + shortcut.y - shortcut.touchSize / 2,
            width: shortcut.touchSize, height: shortcut.touchSize };
          const close = f.landingNavigationCloseRect;
          const oldClose = hidden.landingNavigationCloseRect;
          assert.equal(close.width, oldClose.width);
          assert.equal(close.height, oldClose.height);
          for (const other of [...geometry.obstacles, ...geometry.fixedObstacles, geometry.help])
            assert.ok(separated(close, other, 0), `close target ${device.width} ${preset} ${hand}`);
          if (close.x !== oldClose.x || close.y !== oldClose.y) {
            assert.ok(!separated(ideal, oldClose, 2), 'close moves only when it blocks the cart corner');
            assert.ok(separated(ideal, close, 2), 'close frees the cart corner');
          }
          assert.ok(Math.abs(cart.x - ideal.x) < .01 && Math.abs(cart.y - ideal.y) < .01,
            `cart stays in the corner ${device.width} ${preset} ${hand}`);
          const listGap = geometry.mirrored
            ? list.x - cart.x - cart.width : cart.x - list.x - list.width;
          const foodGap = food.y - cart.y - cart.height;
          assert.ok(Math.abs(listGap - 6) < .01 && Math.abs(foodGap - 6) < .01,
            `equal touch gaps beside LIST and above FOOD ${device.width} ${preset} ${hand}`);
        }
});

test('standard iPhone layout places the cart in the LIST–FOOD corner on both hands', () => {
  for (const hand of ['right', 'left']) {
    const f = fixture(devices[2], 'estandar', 'USER', hand);
    const cart = f.landingShoppingRect;
    const list = f.compactLandingGeometry.obstacles.find(rect => rect.key === 'list');
    const food = f.compactLandingGeometry.obstacles.find(rect => rect.key === 'orbit-1');
    assert.ok(cart && list && food);
    assert.ok(cart.y + cart.height + 5 < food.y);
    if (hand === 'right') assert.ok(list.x + list.width + 5 < cart.x);
    else assert.ok(cart.x + cart.width + 5 < list.x);
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
  assert.match(shortcut, /<LandingShoppingCart size=\{Math\.round\(\(shoppingShortcut\.visualSize - 2\) \* 0\.82\)\}/);
  const shopping = fs.readFileSync('components/notes/GoShoppingNote.tsx', 'utf8');
  assert.match(shopping, /useState<"list"\|"add">\("add"\)/);
  assert.match(shopping, /testID="shopping-seven-orbits"/);
});
