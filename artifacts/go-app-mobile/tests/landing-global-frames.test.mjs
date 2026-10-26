import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { presentation, renderEntryQuickActions, renderEntryMicroActions } from './helpers/entry-details-fixture.mjs';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, rn, ts, evaluate } = require('./tests/helpers/react-lifecycle.cjs');
const source = fs.readFileSync('app/index.tsx', 'utf8'), ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), all = [];
function walk(n) { all.push(n); ts.forEachChild(n, walk); } walk(ast);
const attr = (n, name) => n.openingElement.attributes.properties.find(a => a.name?.getText(ast) === name)?.initializer?.expression;
const cards = all.filter(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'LandingCardContents');
const next = cards.find(n => attr(n, 'footer')?.getText(ast) === 'operations.content'), change = cards.find(n => n !== next);
const nodes = n => n ? [n, ...n.childNodes.flatMap(nodes)] : [], byId = (root, id) => nodes(root).find(n => n.attributes?.['data-testid'] === id);
const flatten = s => Array.isArray(s) ? Object.assign({}, ...s.map(flatten)) : s || {};
const settle = async fn => React.act(async () => { fn(); for (let i = 0; i < 10; i++) await Promise.resolve(); });

test('all three real outer groups contain header, body and the actual number of related actions; visit tokens stay approved', async () => {
  const props = new Map(); let width = 284, fontScale = 1, actionCount = 0;
  function View(p) {
    if (p.testID) props.set(p.testID, p);
    if (p.style?.paddingVertical === 9) props.set('next-header-spacing', p);
    if (p.onLayout?.toString().includes('setPendingHeaderH')) props.set('change-header-spacing', p);
    if (p.onLayout?.toString().includes('setPendingContentH')) props.set('change-body-spacing', p);
    const height = ({ 'landing-card-header': 34 * fontScale, 'landing-card-operations': Math.ceil(actionCount / 3) * 56,
      'landing-compact-primary': 72 * fontScale, 'landing-compact-actions': 100 * fontScale })[p.testID];
    React.useLayoutEffect(() => { if (height != null) p.onLayout?.({ nativeEvent: { layout: { height, width } } }); }, [height, width]);
    return React.createElement('div', { 'data-testid': p.testID }, p.children);
  }
  const native = { ...rn, View, Pressable: p => React.createElement(View, { ...p, style: typeof p.style === 'function' ? p.style({ pressed: false }) : p.style }),
    StyleSheet: { create: x => x, absoluteFill: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 } } };
  const frame = evaluate('components/landing/LandingVisitOutline.tsx', { 'react-native': native }), shared = evaluate('components/landing/LandingContentViewport.tsx', { 'react-native': native });
  assert.equal(frame.LANDING_ENTRY_FRAME, frame.LANDING_VISIT_FRAME);
  assert.deepEqual(JSON.parse(JSON.stringify(frame.LANDING_VISIT_FRAME)), { bottomGap: 8, outset: 8, borderWidth: 1.5, radius: 14 });
  const footer = () => actionCount ? React.createElement(View, { testID: 'existing-related-actions' }, Array.from({ length: actionCount }, (_, i) => React.createElement('button', { key: i }, 'Existing action ' + i))) : null;
  const scope = { React, View, Animated: { View }, Pressable: native.Pressable, TouchableOpacity: View, Text: rn.Text, Feather: () => null,
    renderLandingActionCompletion:()=>null,completionPanelFrame:()=>null,toLandingRootRect:rect=>rect,closeHeaderObstacles:[],closeHeaderHeight:52,insets:{left:0,right:0},
    ...frame, ...shared, ENTRY_COLORS: evaluate('data/reservationCardPolicy.ts').GO_ENTRY_COLORS, entryIsInternal: presentation.entryIsInternal, entryIsReservation: presentation.entryIsReservation, entryIdentity: presentation.entryIdentity,
    renderEntryQuickActions, renderEntryMicroActions, renderLandingOperations: () => ({ content: footer() }), nextCardPanRef: { panHandlers: {} }, cambiosCardPanRef: { panHandlers: {} },
    nextCardSlideAnim: 0, nextCardDeleteConfirm: null, nextSwipeHintAnim: { interpolate: () => 0 }, nextSwipeHintStage: 0, safeIdx: 0, total: 1, ordinal: '1ª',
    cardLabel: 'NOMBRE LARGO', headerObstacles: [], nextCardAvailableHeight: 150, PANEL_ACTION_GAP: 12, lang: 'es', displayContact: (name, phone) => name || phone || '',
    panelSideStyle: { left: 18 }, panelBottom: 344, landingFrame: { virtual: false }, screen: { height: 844 }, landingPanels: { next: { x:18, y: 200, height: 300 }, changes: { x:18, y:200, height:300 } }, contentBottom: x => x,
    dateStr: 'Lun 26/10 · 14:15', dt: new Date('2026-10-26T14:15:00'), receptionNowMs: 0, ACCENT: '#f97316', BLUE: '#60a5fa',
    cardAccent: '#f97316', cardTitle: 'Peluquería con un nombre empresarial muy largo', cardSub: 'Servicio contratado', cardOrigDate: '26/10/26 · 14:15', cardNewDate: '27/10/26 · 18:30', cardDate: '',
    setPendingPanelH() {}, setPendingHeaderH() {}, setPendingContentH() {} };
  vm.createContext(scope);
  const compile = text => ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText;
  vm.runInContext(compile('renderNext=()=>(' + next.parent.getText(ast) + ');renderChange=()=>(' + change.parent.getText(ast) + ');'), scope);
  const container = document.createElement('div'), root = createRoot(container);
  const variants = [
    { group: 'landing-next-visit', outline: 'landing-visit-outline', color: '#22c55e', type: 'GO_BOOKING', customerBooking: true },
    { group: 'landing-task-group', outline: 'landing-task-outline', color: '#a78bfa', type: 'TAREA_INTERNA' },
    { group: 'landing-task-group', outline: 'landing-task-outline', color: '#a78bfa', type: 'TAREA', direction: 'self', sourceNoteId: 'note-1' },
    { group: 'landing-change-group', outline: 'landing-change-outline', color: '#f97316', type: 'GO_BOOKING', estado: 'propuesta_pendiente', change: true },
    { group: 'landing-change-group', outline: 'landing-change-outline', color: '#f97316', type: 'GO_BOOKING', estado: 'propuesto', change: true },
  ];
  try {
    for (const v of variants) for (width of [284, 339, 354, 394]) for (const scale of [.83, 1, 1.12]) for (fontScale of [1, 1.3, 1.6]) for (const hand of ['left', 'right']) for (actionCount of [0, 2, 7]) {
      const g = { id: v.outline, ...v, kind: 'sent', estado: v.estado || 'pendiente', notes: 'Hacer la compra de toda la semana sin recortar el nombre ni las acciones', time: '14:15', dateISO: '2026-10-26', changeProposal: v.change ? { date: '27/10/26', time: '18:30', note: 'Nota conservada' } : undefined };
      Object.assign(scope, { g, item: { kind: 'cambio', g }, isSent: v.estado === 'propuesta_pendiente', allPendientes: [{ kind: 'cambio', g }],
        tint: v.color, uiScaleFactor: scale, handedness: hand, INFO_W: width, PANEL_W: width, changesCardSpace: { width, availableHeight: 150 }, operations: { content: footer() } });
      await settle(() => root.render(v.change ? scope.renderChange() : scope.renderNext()));
      const group = byId(container, v.group), outline = byId(group, v.outline); assert.ok(group && outline);
      for (const id of ['landing-card-header', 'landing-card-body', 'entry-quick-actions']) assert.ok(byId(group, id), id + ' is within its global frame');
      const lower = byId(group, 'existing-related-actions'); assert.equal(!!lower, actionCount > 0);
      assert.equal(lower ? nodes(lower).filter(n => n.tagName === 'BUTTON').length : 0, actionCount);
      assert.equal(!!byId(group, 'landing-card-operations'), actionCount > 0, 'no footer slot or gap when no related actions exist');
      assert.equal(flatten(props.get('landing-card-fixed-frame').style).maxHeight, undefined); assert.equal(flatten(props.get('landing-card-body').style).maxHeight, undefined);
      const decoration = flatten(props.get(v.outline).style); assert.equal(decoration.top, 0); assert.equal(decoration.bottom, 0); assert.equal(decoration.borderWidth, 1.5);
      assert.equal(decoration.borderColor, v.change ? '#f9731655' : v.color); assert.equal(decoration.left, -Math.round(8 * scale)); assert.equal(decoration.right, decoration.left);
      assert.equal(props.get(v.group).style.paddingBottom, Math.round(8 * scale)); assert.equal(props.get(v.group).style.bottom, 344);
      assert.equal(props.get('landing-information-frame').style.borderColor, 'transparent'); assert.equal(props.get(v.outline).pointerEvents, 'none');
      if (v.change) {
        assert.equal(props.get('change-header-spacing').style.paddingBottom, Math.round(2 * scale));
        assert.equal(props.get('change-body-spacing').style.paddingTop, Math.round(2 * scale));
      } else {
        assert.equal(props.get('next-header-spacing').style.paddingBottom, 5);
        assert.equal(props.get('landing-information-frame').style.paddingTop, Math.round(6 * scale));
      }
      assert.equal(nodes(group).filter(n => n.attributes?.['data-testid']?.endsWith('-outline')).length, 1);
    }
    Object.assign(scope, { item: { kind: 'hold', booking: { id: 'hold-1' } }, cardDate: '26/10/26 · 14:15' });
    await settle(() => root.render(scope.renderChange()));
    assert.equal(byId(container, 'landing-change-outline'), undefined); assert.equal(props.get('landing-information-frame').style.borderColor, '#f9731655', 'HOLD retains its existing inner frame');
    assert.equal(props.get('change-header-spacing').style.paddingBottom, Math.round(6 * scope.uiScaleFactor));
    assert.equal(props.get('change-body-spacing').style.paddingTop, Math.round(6 * scope.uiScaleFactor), 'unrelated pending reservations keep their original spacing');
  } finally { await settle(() => root.unmount()); }
});
