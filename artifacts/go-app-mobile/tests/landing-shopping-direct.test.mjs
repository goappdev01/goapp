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

test('the GO Compras shortcut keeps a full touch area clear of FOOD, MAP, other circles and floating controls', () => {
  for (const device of [devices[0], devices[2], devices[4]])
    for (const preset of ['compacto', 'estandar', 'grande'])
      for (const profile of ['ADMIN', 'USER'])
        for (const hand of ['right', 'left']) {
          const f = fixture(device, preset, profile, hand);
          const geometry = f.compactLandingGeometry;
          const cart = geometry.obstacles.find(rect => rect.key === 'shopping-direct');
          assert.ok(geometry.fitted && cart, `${device.width} ${preset} ${profile} ${hand}`);
          assert.ok(cart.width >= 44 && cart.height >= 44);
          assert.ok(cart.x >= geometry.bounds.left - .01 && cart.x + cart.width <= geometry.bounds.right + .01);
          assert.ok(cart.y >= geometry.bounds.top - .01 && cart.y + cart.height <= geometry.bounds.bottom + .01);
          for (const other of geometry.obstacles.filter(rect => rect.key !== 'shopping-direct'))
            assert.ok(separated(cart, other), `${device.width} ${preset} ${profile} ${hand}: ${other.key}`);
          assert.ok(separated(cart, geometry.help), `AYUDA ${device.width} ${hand}`);
          assert.ok(separated(cart, f.landingNavigationCloseRect, 0), `close ${device.width} ${hand}`);
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
  const shopping = fs.readFileSync('components/notes/GoShoppingNote.tsx', 'utf8');
  assert.match(shopping, /useState<"list"\|"add">\("add"\)/);
  assert.match(shopping, /testID="shopping-seven-orbits"/);
});
