import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { presentation, renderEntryQuickActions, renderEntryMicroActions } from './helpers/entry-details-fixture.mjs';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, rn, ts, evaluate } = require('./tests/helpers/react-lifecycle.cjs');
const source = fs.readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), all = [];
function walk(n) { all.push(n); ts.forEachChild(n, walk); } walk(ast);
const attr = (n, key) => n.openingElement.attributes.properties.find(p => p.name?.getText(ast) === key)?.initializer?.expression;
const card = all.find(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'LandingCardContents' && attr(n, 'footer')?.getText(ast) === 'operations.content');
const title = all.find(n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(p => p.name?.getText(ast) === 'testID' && p.initializer?.getText(ast) === '"landing-task-description"'));
const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
const flatten = s => Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s || {};
const nodes = n => n ? [n, ...n.childNodes.flatMap(nodes)] : [];
const byId = (n, id) => nodes(n).find(c => c.attributes?.['data-testid'] === id);
const settle = async fn => React.act(async () => { fn?.(); for (let i = 0; i < 10; i++) await Promise.resolve(); });

test('intrinsic containment and the compact bottom inset apply only to internal tasks, including tasks from notes', () => {
  const internal = [{ type: 'TAREA_INTERNA', notes: 'Hacer la compra' }, { type: 'TAREA', direction: 'self', sourceNoteId: 'note-1', notes: 'Hacer la compra' }, { type: 'GO_INTERNO' }];
  const other = [{ type: 'GO_BOOKING', customerBooking: true }, { type: 'GO_BOOKING', businessBooking: true }, { type: 'TAREA', direction: 'outgoing', phone: '600000001' }];
  for (const g of [...internal, ...other]) for (const scale of [.83, 1, 1.12, 1.35]) {
    const expected = internal.includes(g), context = { g, entryIsInternal: presentation.entryIsInternal,
      uiScaleFactor: scale, nextCardAvailableHeight: 300, PANEL_W: 284, headerObstacles: [] };
    assert.equal(vm.runInNewContext(attr(card, 'intrinsicBody').getText(ast), context), expected);
    const sizing = vm.runInNewContext('(' + attr(card, 'adaptiveBody').getText(ast) + ')', context);
    assert.equal(sizing.frameVerticalInset, Math.round(10 * scale) + Math.round((expected ? 8 : 14) * scale) + 3);
    assert.equal(vm.runInNewContext(attr(title, 'numberOfLines').getText(ast), context), expected ? undefined : 1);
  }
});

test('the actual task card contains essential rows without a clipping cap or internal scroller at constrained sizes', async () => {
  const captured = new Map(), textProps = new Map(), calls = [];
  let width = 284, fontScale = 1;
  function View(p) {
    if (p.testID) captured.set(p.testID, p);
    const height = ({ 'landing-card-header': 34 * fontScale, 'landing-card-operations': 128,
      'landing-compact-primary': 70 * fontScale, 'landing-compact-actions': 64 * fontScale })[p.testID];
    React.useLayoutEffect(() => { if (height != null) p.onLayout?.({ nativeEvent: { layout: { height, width } } }); }, [height, width]);
    return React.createElement('div', { 'data-testid': p.testID, 'data-native': 'View' }, p.children);
  }
  function Pressable(p) { return React.createElement(View, { ...p, style: typeof p.style === 'function' ? p.style({ pressed: false }) : p.style }); }
  function Text(p) { if (p.testID) textProps.set(p.testID, p); return React.createElement('span', { 'data-testid': p.testID }, p.children); }
  const shared = evaluate('components/landing/LandingContentViewport.tsx', { 'react-native': { ...rn, View } });
  const scope = { React, View, Animated: { View }, Text, Pressable, TouchableOpacity: View, Feather: () => null,
    LandingCardContents: shared.LandingCardContents, LandingCompactBody: shared.LandingCompactBody,
    entryIsInternal: presentation.entryIsInternal, entryIsReservation: presentation.entryIsReservation, entryIdentity: presentation.entryIdentity,
    renderEntryQuickActions, renderEntryMicroActions, nextCardPanRef: { panHandlers: {} }, nextCardSlideAnim: 0, nextCardDeleteConfirm: null,
    nextSwipeHintAnim: { interpolate: () => 0 }, nextSwipeHintStage: 0, safeIdx: 0, total: 1, tint: '#a78bfa', ordinal: '1ª', cardLabel: 'TAREA INTERNA',
    operations: { content: null }, headerObstacles: [], nextCardAvailableHeight: 160, PANEL_ACTION_GAP: 12, lang: 'es',
    Haptics: { impactAsync: async () => {}, ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' } },
    setLandingDetailsId: id => calls.push(['open', id]), startRelatedGoAction: g => calls.push(['long', g.id]),
    displayContact: (name, phone) => name || phone || '', dateStr: 'Lun 26/10 · 14:15', dt: new Date('2026-10-26T14:15:00'), receptionNowMs: 0,
  };
  vm.createContext(scope); vm.runInContext(compile('renderTask=()=>(' + card.getText(ast) + ');'), scope);
  const rootNode = document.createElement('div'), root = createRoot(rootNode);
  try {
    for (const notes of ['Hacer la compra', 'Hacer la compra de toda la semana y recoger los encargos pendientes sin recortar el título'])
      for (const kind of ['TAREA_INTERNA', 'TAREA']) for (width of [284, 339, 354, 394])
        for (const scale of [.83, 1, 1.12]) for (fontScale of [1, 1.3, 1.6]) for (const hand of ['left', 'right']) {
          const g = { id: 'own-task', type: kind, direction: 'self', sourceNoteId: kind === 'TAREA' ? 'note-1' : undefined,
            kind: 'sent', estado: 'pendiente', notes, dateISO: '2026-10-26', time: '14:15', contactName: '', phone: '' };
          Object.assign(scope, { g, uiScaleFactor: scale, handedness: hand, INFO_W: width, PANEL_W: width });
          await settle(() => root.render(scope.renderTask()));
          const frame = byId(rootNode, 'landing-information-frame'), actions = byId(rootNode, 'entry-quick-actions');
          assert.ok(frame && nodes(frame).includes(actions));
          assert.ok(frame.textContent.includes(notes)); assert.ok(frame.textContent.includes('14:15'));
          for (const label of ['PENDIENTE', 'CANCELAR', 'MODIFICAR']) assert.ok(actions.textContent.includes(label));
          assert.equal(textProps.get('landing-task-description').numberOfLines, undefined);
          assert.equal(flatten(captured.get('landing-card-body').style).maxHeight, undefined);
          assert.equal(flatten(captured.get('landing-card-fixed-frame').style).maxHeight, undefined);
          assert.equal(flatten(captured.get('landing-card-fixed-frame').style).overflow, undefined);
          const style = flatten(captured.get('landing-information-frame').style);
          assert.equal(style.paddingBottom, Math.round(8 * scale)); assert.equal(style.paddingTop, Math.round(10 * scale));
          assert.equal(style.borderWidth, 1.5); assert.equal(style.borderColor, '#a78bfa'); assert.equal(style.borderRadius, Math.round(14 * scale));
          assert.equal(nodes(rootNode).filter(n => n.attributes?.['data-native'] === 'ScrollView').length, 0);
        }
    captured.get('landing-information-frame').onPress(); captured.get('landing-information-frame').onLongPress();
    assert.deepEqual(calls, [['open', 'own-task'], ['long', 'own-task']]);
  } finally { await settle(() => root.unmount()); }
});

test('CANCELAR and MODIFICAR keep their original hit areas, colors and isolated callbacks', () => {
  const entry = Object.freeze({ id: 'own-task', type: 'TAREA_INTERNA', kind: 'sent', estado: 'pendiente', notes: 'Hacer la compra' });
  const element = renderEntryQuickActions(entry, true, true), calls = [];
  const tree = element.type({ ...element.props, onCancel: () => calls.push('cancel'), onEdit: () => calls.push('edit') });
  const buttons = tree.props.children.at(-1).props.children.flat().filter(Boolean);
  assert.deepEqual(buttons.map(b => b.props.accessibilityLabel), ['CANCELAR', 'MODIFICAR']);
  for (const [i, button] of buttons.entries()) {
    let stopped = false; button.props.onPress({ stopPropagation() { stopped = true; } }); assert.ok(stopped);
    const style = flatten(button.props.style); assert.equal(style.minHeight, 36); assert.equal(style.paddingVertical, 7);
    assert.equal(style.borderColor, i ? '#FF8C00' : '#FF0000');
  }
  assert.deepEqual(calls, ['cancel', 'edit']);
});
