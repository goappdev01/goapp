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

test('cart circle intersection follows actual LIST, REUNIÓN and COMIDA radii', () => {
  for (const hand of ['right', 'left']) for (const device of devices) {
    const f = fixture(device, 'estandar', 'USER', hand);
    const geometry = f.compactLandingGeometry;
    const list = geometry.obstacles.find(rect => rect.key === 'list');
    const reunion = geometry.obstacles.find(rect => rect.key === 'orbit-0');
    const food = geometry.obstacles.find(rect => rect.key === 'orbit-1');
    const preferred = f.ctx.landingShoppingPreferred(list, reunion, food, f.ctx.shoppingShortcut.touchSize, geometry.mirrored);
    const center = rect => [rect.x + rect.width / 2, rect.y + rect.height / 2];
    const edgeGap = (a, b) => Math.hypot(center(a)[0] - center(b)[0], center(a)[1] - center(b)[1]) - a.width / 2 - b.width / 2;
    const reference = Math.max(2, (Math.max(0, edgeGap(list, reunion)) + Math.max(0, edgeGap(list, food))) / 2);
    assert.ok(Math.abs(edgeGap(preferred, list) - reference) < .01);
    assert.ok(Math.abs(edgeGap(preferred, food) - reference) < .01);
    assert.equal(geometry.mirrored ? center(preferred)[0] < center(list)[0] : center(preferred)[0] > center(list)[0], true);
  }
});

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
          const reunion = geometry.obstacles.find(rect => rect.key === 'orbit-0');
          const shortcut = f.ctx.shoppingShortcut;
          const ideal = f.ctx.landingShoppingPreferred(list, reunion, food, shortcut.touchSize, geometry.mirrored);
          const close = f.landingNavigationCloseRect;
          const oldClose = hidden.landingNavigationCloseRect;
          assert.equal(close.width, oldClose.width);
          assert.equal(close.height, oldClose.height);
          for (const other of [...geometry.obstacles, ...geometry.fixedObstacles, geometry.help])
            assert.ok(separated(close, other, 0), `close target ${device.width} ${preset} ${hand}`);
          if (close.x !== oldClose.x || close.y !== oldClose.y) {
            assert.ok(!separated(cart, oldClose, 2), 'close moves only when it blocks the cart corner');
            assert.ok(separated(cart, close, 2), 'close frees the cart corner');
          }
          assert.ok(Math.hypot(cart.x - ideal.x, cart.y - ideal.y) < shortcut.touchSize,
            `cart remains near the circle intersection ${device.width} ${preset} ${hand}`);
          const listGap = geometry.mirrored
            ? list.x - cart.x - cart.width : cart.x - list.x - list.width;
          const foodGap = food.y - cart.y - cart.height;
          assert.ok(Math.abs(listGap - 2) < .01 && Math.abs(foodGap - 2) < .01,
            `minimum balanced touch gaps beside LIST and above FOOD ${device.width} ${preset} ${hand}`);
        }
});

test('standard iPhone layout places the cart in the LIST–FOOD corner on both hands', () => {
  for (const hand of ['right', 'left']) {
    const f = fixture(devices[2], 'estandar', 'USER', hand);
    const cart = f.landingShoppingRect;
    const list = f.compactLandingGeometry.obstacles.find(rect => rect.key === 'list');
    const food = f.compactLandingGeometry.obstacles.find(rect => rect.key === 'orbit-1');
    assert.ok(cart && list && food);
    assert.ok(cart.y + cart.height + 1.9 < food.y);
    if (hand === 'right') assert.ok(list.x + list.width + 1.9 < cart.x);
    else assert.ok(cart.x + cart.width + 1.9 < list.x);
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
