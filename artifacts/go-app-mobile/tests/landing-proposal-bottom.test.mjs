import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { renderEntryQuickActions } from './helpers/entry-details-fixture.mjs';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, rn, ts, evaluate } = require('./tests/helpers/react-lifecycle.cjs');
const source = fs.readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const all = [];
function walk(node) { all.push(node); ts.forEachChild(node, walk); }
walk(ast);
const attr = (node, name) => node.openingElement.attributes.properties.find(a => a.name?.getText(ast) === name)?.initializer?.expression;
const card = all.find(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'LandingCardContents' && n.getText(ast).includes('landing-proposal-card'));
const wrapper = all.find(n => ts.isJsxElement(n) && attr(n, 'onLayout')?.getText(ast).includes('setPendingContentH'));
const compact = all.find(n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'LandingCompactBody' && n.getText(ast).includes('item.kind'));
const compactAttr = name => compact.attributes.properties.find(a => a.name?.getText(ast) === name).initializer.expression;
const flatten = s => Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s || {};
const nodes = n => n ? [n, ...n.childNodes.flatMap(nodes)] : [];
const byId = (n, id) => nodes(n).find(c => c.attributes?.['data-testid'] === id);
const settle = async fn => React.act(async () => { fn?.(); for (let i = 0; i < 12; i++) await Promise.resolve(); });

test('Landing proposal containment and its padding budget remain scoped to change cards', () => {
  assert.ok(card && wrapper && compact);
  for (const scale of [.83, 1, 1.12]) for (const kind of ['cambio', 'hold']) {
    const scope = { item: { kind }, uiScaleFactor: scale };
    const intrinsic = vm.runInNewContext(attr(card, 'intrinsicBody').getText(ast), scope);
    const padding = vm.runInNewContext('(' + attr(wrapper, 'style').getText(ast) + ')', scope);
    const inset = vm.runInNewContext(compactAttr('verticalInset').getText(ast), scope);
    assert.equal(intrinsic, kind === 'cambio');
    assert.equal(padding.paddingTop, Math.round(6 * scale));
    assert.equal(padding.paddingBottom, Math.round((kind === 'cambio' ? 8 : 6) * scale));
    assert.equal(inset, kind === 'cambio' ? padding.paddingTop + padding.paddingBottom : Math.round(12 * scale));
    assert.ok(padding.paddingBottom >= padding.paddingTop);
    assert.equal(padding.height, undefined);
  }
  const otherCards = all.filter(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'LandingCardContents' && n !== card);
  assert.ok(otherCards.length > 0);
  for (const other of otherCards) assert.equal(attr(other, 'intrinsicBody').getText(ast), 'entryIsInternal(g)', 'Visits retain bounded sizing; only internal tasks opt in');
});

test('constrained native measurements cannot clamp the proposal frame through its essential actions', async () => {
  const props = new Map();
  let primaryHeight = 40, actionsHeight = 64;
  function View(p) {
    if (p.testID) props.set(p.testID, p);
    const height = ({ 'landing-card-header': 34, 'landing-card-operations': 128,
      'landing-compact-primary': primaryHeight, 'landing-compact-actions': actionsHeight,
      'landing-compact-row-note': 20 })[p.testID];
    React.useLayoutEffect(() => { if (height != null) p.onLayout?.({ nativeEvent: { layout: { height, width: 284 } } }); }, [height]);
    return React.createElement('div', { 'data-testid': p.testID, 'data-native': 'View' }, p.children);
  }
  const api = evaluate('components/landing/LandingContentViewport.tsx', { 'react-native': { ...rn, View } });
  const container = document.createElement('div'), root = createRoot(container);
  try {
    for (const width of [284, 339, 354, 394]) for (const fontScale of [1, 1.3, 1.6]) {
      primaryHeight = 40 * fontScale; actionsHeight = 64 * fontScale;
      for (const availableHeight of [210, 320, 420]) {
        await settle(() => root.render(React.createElement(api.LandingCardContents, {
          staticBody: true, intrinsicBody: true, adaptiveBody: { width, availableHeight, frameVerticalInset: 3 },
          header: 'CAMBIO PROPUESTO', headerGap: 4, footer: 'WhatsApp · Llamar', footerGap: 12,
          overflowing: false, onHeight() {}, contentContainerStyle: {},
          bodyFrame: body => React.createElement(View, { testID: 'orange-frame' }, body),
        }, React.createElement(api.LandingCompactBody, {
          primary: 'Empresa de nombre largo · Fecha original → propuesta', actions: 'Estado · CANCELAR · PROPONER CAMBIO',
          secondary: [{ key: 'note', content: 'Nota conservada' }], gap: 2, verticalInset: 14,
        }))));
        assert.equal(flatten(props.get('landing-card-body').style).maxHeight, undefined, 'Body must grow when essential content exceeds the budget');
        assert.equal(flatten(props.get('landing-card-fixed-frame').style).maxHeight, undefined, 'Outer frame must not clip the expanded body');
        assert.equal(flatten(props.get('landing-card-fixed-frame').style).overflow, undefined);
        assert.equal(flatten(props.get('landing-compact-actions').style).flexShrink, 0);
        assert.ok(byId(container, 'orange-frame').textContent.includes('CANCELAR · PROPONER CAMBIO'));
        assert.equal(nodes(container).filter(n => n.attributes?.['data-native'] === 'ScrollView').length, 0);
      }
    }
  } finally { await settle(() => root.unmount()); }
});

test('ordinary static cards retain their original bounded height', async () => {
  const props = new Map();
  const View = p => { if (p.testID) props.set(p.testID, p); return React.createElement('div', { 'data-testid': p.testID, 'data-native': 'View' }, p.children); };
  const api = evaluate('components/landing/LandingContentViewport.tsx', { 'react-native': { ...rn, View } });
  const container = document.createElement('div'), root = createRoot(container);
  try {
    await settle(() => root.render(React.createElement(api.LandingCardContents, {
      staticBody: true, adaptiveBody: { width: 284, availableHeight: 210, frameVerticalInset: 3 },
      header: 'PRÓXIMA VISITA', overflowing: false, onHeight() {}, contentContainerStyle: {},
    }, 'Contenido original')));
    assert.ok(byId(container, 'landing-card-fixed-frame'));
    assert.equal(flatten(props.get('landing-card-fixed-frame').style).maxHeight, 210);
    assert.equal(flatten(props.get('landing-card-fixed-frame').style).overflow, 'hidden');
    assert.equal(flatten(props.get('landing-card-body').style).maxHeight, 207);
    assert.equal(nodes(container).filter(n => n.attributes?.['data-native'] === 'ScrollView').length, 0);
  } finally { await settle(() => root.unmount()); }
});

test('sent and received change buttons keep labels, sizes, colors, callbacks and parent-event isolation', () => {
  for (const estado of ['propuesta_pendiente', 'propuesto']) {
    const entry = Object.freeze({ id: 'change-1', kind: estado === 'propuesto' ? 'received' : 'sent', estado,
      contactName: 'Peluquería con nombre muy largo', changeProposal: { date: '26/10/26', time: '17:00' } });
    const calls = [], element = renderEntryQuickActions(entry, true, true);
    const tree = element.type({ ...element.props, onCancel: () => calls.push('cancel'), onPropose: () => calls.push('propose'),
      onReject: () => calls.push('reject'), onAccept: () => calls.push('accept') });
    const actions = tree.props.children.at(-1).props.children.flat().filter(Boolean);
    const expected = estado === 'propuesto' ? ['RECHAZAR', 'PROPONER', 'ACEPTAR'] : ['CANCELAR', 'PROPONER CAMBIO'];
    assert.deepEqual(actions.map(b => b.props.accessibilityLabel), expected);
    for (const button of actions) {
      let stopped = false;
      button.props.onPress({ stopPropagation() { stopped = true; } });
      assert.ok(stopped);
      const style = flatten(button.props.style);
      assert.equal(style.minHeight, 36); assert.equal(style.paddingVertical, 7);
      assert.ok(style.borderColor);
    }
    assert.deepEqual(calls, estado === 'propuesto' ? ['reject', 'propose', 'accept'] : ['cancel', 'propose']);
  }
});
