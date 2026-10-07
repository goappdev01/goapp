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

test('expanded changes stay within the safe area and above the complete Próxima panel', () => {
  const panel = find(home, node => ts.isJsxOpeningElement(node)
    && node.attributes.properties.some(attr => ts.isJsxAttribute(attr)
      && attr.name.getText(home) === 'key'
      && attr.initializer?.getText(home) === '"pendientes-open-panel"'));
  assert.ok(panel);
  const style = panel.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'style').initializer.expression;
  assert.equal(style.properties.find(prop => prop.name?.getText(home) === 'maxHeight').initializer.getText(home), 'panelMaxHeight');
  const viewport = find(panel.parent, node => ts.isJsxOpeningElement(node)
    && node.tagName.getText(home) === 'ScrollView');
  assert.ok(viewport, 'constrain the card contents instead of allowing them to overflow into Próxima');
  const viewportStyle = viewport.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'style').initializer.expression.getText(home);
  assert.equal(vm.runInNewContext(`(${viewportStyle})`).flexShrink, 1);
  const card = viewport.parent.parent;
  assert.ok(ts.isJsxElement(card) && card.openingElement.tagName.getText(home) === 'View');
  const cardStyle = card.openingElement.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'style').initializer.expression;
  assert.ok(cardStyle.properties.some(prop => prop.name?.getText(home) === 'borderWidth'),
    'all four card borders stay outside the clipped scroll content');
  const contentStyle = viewport.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'contentContainerStyle').initializer.expression.getText(home);
  const density = vm.runInNewContext(`(${contentStyle})`, { uiScaleFactor: 1 });
  assert.equal(density.gap, 2);
  assert.equal(density.paddingVertical, 6);
  assert.ok(!viewport.parent.getText(home).includes('{_ordinal}'), 'header stays outside scrolling content');
  const maxHeight = find(home, node => ts.isVariableDeclaration(node)
    && node.name.getText(home) === 'panelMaxHeight');
  let renderPanel = panel;
  while (!ts.isArrowFunction(renderPanel)) renderPanel = renderPanel.parent;
  const panelWidth = find(renderPanel, node => ts.isVariableDeclaration(node)
    && node.name.getText(home) === 'PANEL_W');
  for (const width of [320, 390, 430]) {
    for (const measuredWidth of [266, 354]) {
      for (const proximaExpanded of [true, false]) {
        const context = { screen: { width }, insets: { left: 0, right: 0 }, PANEL_EDGE: 18,
          proximaExpanded, humanityObstacles: { next: { width: measuredWidth } }, BTN_W: 82, uiScaleFactor: 1 };
        const actualWidth = vm.runInNewContext(panelWidth.initializer.getText(home), context);
        assert.ok(actualWidth <= width - 36, 'both horizontal safe margins remain inside the screen');
        if (proximaExpanded) assert.equal(actualWidth, Math.min(width - 36, measuredWidth));
      }
    }
  }
  const bottom = find(home, node => ts.isVariableDeclaration(node)
    && node.name.getText(home) === 'panelBottom');
  assert.ok(bottom);
  for (const uiScaleFactor of [0.83, 1, 1.12]) {
    for (const nextAptPanelH of [180, 260, 420]) {
      for (const proposalHeight of [120, 240, 360]) {
        const anchor = vm.runInNewContext(bottom.initializer.getText(home), {
          proximaExpanded: true, PROXIMA_BOTTOM: 320, nextAptPanelH,
          uiScaleFactor, proximaPillShowing: false, _PILL_H: 46,
        });
        const nextTop = 844 - 320 - nextAptPanelH;
        const cap = vm.runInNewContext(maxHeight.initializer.getText(home), {
          screen: { height: 844 }, panelBottom: anchor, insets: { top: 59 }, uiScaleFactor,
        });
        const visibleHeight = Math.min(proposalHeight, cap);
        const proposalTop = 844 - anchor - visibleHeight;
        assert.ok(proposalTop >= 59 + Math.round(12 * uiScaleFactor));
        assert.equal(nextTop - (proposalTop + visibleHeight), Math.round(8 * uiScaleFactor));
      }
    }
  }
  assert.equal(vm.runInNewContext(bottom.initializer.getText(home), {
    proximaExpanded: false, proximaPillShowing: false, PROXIMA_BOTTOM: 320,
  }), 320, 'no extra gap when Próxima is absent');
});

test('recovered Humanity placement includes its label and avoids orbital and panel touch rectangles', () => {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(
    readFileSync('components/landing/humanityPlacement.ts', 'utf8'),
    { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } },
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
