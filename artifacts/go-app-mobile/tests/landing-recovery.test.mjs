import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('app/index.tsx', 'utf8');
const home = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let found;
  ts.forEachChild(node, child => { if (!found) found = find(child, predicate); });
  return found;
}

test('expanded Próxima keeps its measured height in every size; only hidden panels clear it', () => {
  const effect = find(home, node => ts.isCallExpression(node)
    && node.expression.getText(home) === 'useEffect'
    && node.arguments[0]?.getText(home).includes('const willRenderHorizontal'));
  assert.ok(effect);
  const callback = effect.arguments[0].getText(home);
  for (const useCompactNextApt of [true, false]) {
    for (const overrides of [{}, { nextAptMinimized: true }, { anyOverlayOpen: true },
      { isActivelyCreating: true }, { rutasMode: true }, { nextAppointment: null }]) {
      const state = {
        nextAppointment: {}, anyOverlayOpen: false, isActivelyCreating: false,
        nextAptMinimized: false, rutasMode: false, useCompactNextApt,
        nextAptBottomY: null, nextAptPanelH: 260, ...overrides,
      };
      const cleared = [];
      vm.runInNewContext(`(${callback})()`, {
        ...state, setNextAptBottomY() {}, setNextAptPanelH: value => cleared.push(value),
      });
      assert.deepEqual(cleared, Object.keys(overrides).length ? [0] : []);
    }
  }
});

test('expanded changes use the same fixed safe region as visit/task', () => {
  const panel = find(home, node => ts.isJsxOpeningElement(node)
    && node.attributes.properties.some(attr => ts.isJsxAttribute(attr)
      && attr.name.getText(home) === 'key'
      && attr.initializer?.getText(home) === '"pendientes-open-panel"'));
  assert.ok(panel);
  const style = panel.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'style').initializer.expression;
  assert.ok(!style.properties.some(prop => prop.name?.getText(home) === 'maxHeight'), 'natural information is not constrained by the former outer panel cap');
  assert.ok(!style.properties.some(prop => prop.name?.getText(home) === 'minHeight'), 'never stretch changes to the top edge');
  const viewport = find(panel.parent, node => ts.isJsxOpeningElement(node)
    && node.tagName.getText(home) === 'LandingCardContents');
  assert.ok(viewport, 'constrain the proposal and its operations inside the shared panel region');
  const natural = viewport.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'overflowing').initializer.expression.getText(home);
  assert.equal(natural, 'false', 'long bodies stay inside the existing card; no moving outer viewport');
  const cardOpening = find(viewport.parent, node => ts.isJsxOpeningElement(node)
    && node.tagName.getText(home) === 'View'
    && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(home) === 'style'
      && attr.initializer?.getText(home).includes('borderColor: cardAccent')));
  assert.ok(cardOpening, 'preserve the existing proposal card and its four borders');
  const cardStyle = cardOpening.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'style').initializer.expression;
  assert.ok(cardStyle.properties.some(prop => prop.name?.getText(home) === 'borderWidth'));
  const cardBody = find(viewport.parent, node => ts.isJsxOpeningElement(node)
    && node.tagName.getText(home) === 'View'
    && node.attributes.properties.some(attr => ts.isJsxAttribute(attr) && attr.name.getText(home) === 'onLayout'
      && attr.initializer?.getText(home).includes('setPendingContentH')));
  assert.ok(cardBody, 'preserve the measured information body in the shared adaptive viewport');
  const frameSlot = viewport.attributes.properties.find(attr => ts.isJsxAttribute(attr) && attr.name.getText(home) === 'bodyFrame');
  assert.ok(frameSlot?.initializer?.getText(home).includes('{body}'), 'the border encloses the scroll viewport, never its moving contents');
  const contentStyle = cardBody.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'style').initializer.expression.getText(home);
  const density = vm.runInNewContext(`(${contentStyle})`, { uiScaleFactor: 1 });
  assert.equal(density.gap, 2);
  assert.equal(density.paddingVertical, 6);
  const fixedHeader = viewport.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'header');
  assert.ok(fixedHeader?.initializer?.getText(home).includes('{_ordinal}'), 'preserve the ordinal in the fixed header');
  const scrollingChildren = viewport.parent.children.map(child => child.getText(home)).join('');
  assert.ok(!scrollingChildren.includes('{_ordinal}'), 'header stays outside scrolling content');
  const adaptiveSpace = find(home, node => ts.isVariableDeclaration(node)
    && node.name.getText(home) === 'changesCardSpace');
  let renderPanel = panel;
  while (!ts.isArrowFunction(renderPanel)) renderPanel = renderPanel.parent;
  const panelWidth = find(renderPanel, node => ts.isVariableDeclaration(node)
    && node.name.getText(home) === 'PANEL_W');
  const module = {exports:{}};
  vm.runInNewContext(ts.transpileModule(readFileSync('components/landing/landingPanels.ts','utf8'),
    {compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,module);
  for(const width of [320,390,430])for(const nextOpen of [false,true]){
    const frame={virtual:false,width,height:260,baseline:320,top:264,left:0,scroll:false,contentHeight:260,naturalHeight:500};
    const landingPanels=module.exports.landingPanelFrames({frame,screenHeight:844,insets:{left:0,right:0},nextOpen,changesOpen:true});
    const context={landingPanels,screen:{height:844},landingFrame:frame};
    const actualWidth=vm.runInNewContext(panelWidth.initializer.getText(home),context);
    assert.equal(actualWidth,width-36,'use the full useful width, independent of previous measured widths');
    const space=vm.runInNewContext(adaptiveSpace.initializer.getText(home),{
      ...context,insets:{top:47},titleBottomLocalY:65,landingHeaderControls:[],
      landingAdaptivePanelSpace:module.exports.landingAdaptivePanelSpace,
    });
    const bottom=find(home,node=>ts.isVariableDeclaration(node)&&node.name.getText(home)==='panelBottom');
    const anchor=vm.runInNewContext(bottom.initializer.getText(home),context);
    const floor=844-anchor;
    assert.equal(space.availableHeight,floor-65,'use the actual safe/title boundary, not the old full-width reservation');
    assert.equal(space.width,actualWidth);
    assert.equal(landingPanels.next.y+landingPanels.next.height,floor,'all panels retain the same lower anchor');
    assert.ok(space.availableHeight>=44,'exceptional long information retains a bounded safe viewport');
    assert.ok(space.availableHeight>frame.height,'vacant space above the former region remains usable');
  }
});

test('recovered Humanity placement includes its label and avoids orbital and panel touch rectangles', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(
    readFileSync('components/landing/humanityPlacement.ts', 'utf8'),
    { compilerOptions: { esModuleInterop: false, alwaysStrict: false, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
  ).outputText, { exports });
  const { placeHumanity, overlapsHumanity } = exports;
  const tightSlot = placeHumanity({ cx: 200, cy: 200, radius: 20, buttonSize: 20,
    satelliteRadius: 100, satelliteSize: 10, count: 0, scale: 1,
    bounds: { x: 33, y: 43, width: 62, height: 72 }, obstacles: [] });
  assert.ok(tightSlot, 'enlarging the image must not discard the original safe footprint');
  assert.ok(tightSlot.globe > 52);
  for (const scale of [0.83, 1, 1.12]) {
    const radius = Math.round(99 * scale), buttonSize = Math.round(65 * scale);
    const satelliteRadius = radius + Math.round(35 * scale), satelliteSize = Math.round(50 * scale);
    const bounds = { x: 8, y: 120, width: 374, height: 682 };
    const cx = 390 - satelliteRadius - satelliteSize / 2;
    const cy = 844 - 34 - 6 - ((radius + buttonSize / 2) * 2 + 12) / 2;
    for (const obstacles of [[], [{ x: 18, y: 220, width: 354, height: 160 }]]) {
      const result = placeHumanity({ cx, cy, radius, buttonSize, satelliteRadius,
        satelliteSize, count: 7, bounds, obstacles, scale });
      assert.ok(result, `space available at scale ${scale}`);
      assert.ok(result.globe >= Math.round(54 * scale) && result.globe <= Math.round(56 * scale));
      assert.ok(result.x + result.width / 2 < cx && result.y + result.height / 2 < cy);
      assert.ok(result.x >= bounds.x && result.x + result.width <= bounds.x + bounds.width);
      assert.ok(result.y >= bounds.y && result.y + result.height <= bounds.y + bounds.height);
      assert.ok(result.height >= result.globe + 16);
      const occupied = [...obstacles];
      const add = (a, r, size) => occupied.push({ x: cx + Math.cos(a) * r - size / 2,
        y: cy + Math.sin(a) * r - size / 2, width: size, height: size });
      for (let i = 0; i < 7; i++) add(-Math.PI / 2 + i * 2 * Math.PI / 7, radius, buttonSize + 8);
      for (let i = 0; i < 8; i++) add((-112.5 + i * 45) * Math.PI / 180, satelliteRadius, satelliteSize + 8);
      assert.ok(occupied.every(rect => !overlapsHumanity(result, rect)));
    }
    assert.equal(placeHumanity({ cx, cy, radius, buttonSize, satelliteRadius,
      satelliteSize, count: 7, bounds, obstacles: [bounds], scale }), null);
  }
});
