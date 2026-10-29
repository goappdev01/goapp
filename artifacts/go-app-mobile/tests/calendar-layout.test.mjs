import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers/calendar-fixture.mjs';
import { ast, find, transpile } from './helpers/calendar-container-fixture.mjs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import path from 'node:path';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const nodes = (tree, predicate) => !tree || typeof tree !== 'object' ? [] :
  [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))];
const texts = tree => nodes(tree, n => n.type === 'Text').flatMap(n => n.children).filter(x => typeof x === 'string');
const style = value => Array.isArray(value) ? Object.assign({}, ...value.filter(Boolean)) : value;
const header = find(n => ts.isJsxAttribute(n) && n.name.getText(ast) === 'renderHeader').initializer.expression.getText(ast);
function renderHeader(monthNavigation, demo = false, insets = { top: 44, left: 0, right: 0 }) {
  const calls = [];
  const scope = { exports: {}, monthNavigation, React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', Feather: 'Feather', GoCalendarViewSelector: 'GoCalendarViewSelector',
    lang: 'es', insets, calBgViewMode: 'mes_lineal', calConfigVisible: false, showBookingFromCal: false, demoBookingRepository: demo,
    changeCalendarView: value => calls.push(['view', value]), Haptics: { selectionAsync() {} },
    setCalConfigVisible: value => calls.push(['settings', value]), setCalQuickCreateOpen: value => calls.push(['task', value]), setCalPanelOpen: value => calls.push(['panel', value]), closeMonthGrid: () => calls.push(['monthGrid']), setDemoCustomerCalendarSelected: value => calls.push(['demo', value]),
  };
  vm.runInNewContext(transpile(`exports.tree = (${header})(monthNavigation);`), scope);
  return { tree: scope.exports.tree, calls };
}
const event = () => ({ stopPropagation() {} });

test('the embedded header reuses one month navigation between MES and configuration, preserving the DEMO shortcut', () => {
  const nav = { type: 'MonthNavigation', props: {}, children: [] };
  for (const demo of [false, true]) {
    const { tree, calls } = renderHeader(nav, demo);
    assert.equal(tree.props.style.flexDirection, 'row');
    assert.ok(tree.props.style.zIndex > 0, 'The view menu remains above the calendar content');
    assert.equal(tree.children.length, 3);
    assert.equal(nodes(tree.children[0], n => n.type === 'GoCalendarViewSelector').length, 1);
    assert.equal(tree.children[1].children[0], nav);
    assert.equal(nodes(tree, n => n.type === 'MonthNavigation').length, 1);
    assert.deepEqual(texts(tree.children[2]), ['CONFIG']);
    const selector = nodes(tree, n => n.type === 'GoCalendarViewSelector')[0];
    assert.equal(selector.props.compact, true);
    selector.props.onChange('semana');
    tree.children[2].props.onPress(event());
    assert.deepEqual(calls.slice(0, 2), [['view', 'semana'], ['settings', true]]);
    if (demo) {
      const shortcut = nodes(tree, n => n.type === 'TouchableOpacity' && n.props.testID === 'customer-calendar-shortcut')[0];
      shortcut.props.onPress(event());
      assert.deepEqual(calls.slice(-5), [['settings', false], ['task', false], ['panel', false], ['monthGrid'], ['demo', true]]);
    }
  }
});

test('embedded and standalone month navigation use the same controlled month and cross years once', () => {
  for (const lang of ['es', 'en']) {
    const app = fixture(); app.setLanguage(lang);
    const { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
    const props = { goLog: [], viewMode: 'mes_lineal', calViewMonth: '2026-12', selectedDateISO: '2026-12-20' };
    props.renderHeader = nav => renderHeader(nav).tree;
    const directions = [];
    props.onChangeMonth = direction => { directions.push(direction); props.calViewMonth = direction === 1 ? '2027-01' : '2026-12'; };
    let tree = app.render(AgendaBoard, props);
    const nextLabel = lang === 'en' ? 'Next month' : 'Mes siguiente';
    assert.equal(nodes(tree, n => n.props.accessibilityLabel === nextLabel).length, 1);
    const next = nodes(tree, n => n.props.accessibilityLabel === nextLabel)[0];
    assert.equal(style(next.props.style).width, 32);
    assert.equal(style(next.props.style).height, 44);
    next.props.onPress(event()); tree = app.render(AgendaBoard, props);
    assert.deepEqual(directions, [1]);
    assert.equal(props.selectedDateISO, '2026-12-20');
    assert.ok(texts(tree).includes(lang === 'en' ? 'January 2027' : 'Enero 2027'));
    const monthTitle = nodes(tree, n => n.type === 'Text' && texts(n).some(x => x.endsWith('2027')))[0];
    assert.equal(monthTitle.props.numberOfLines, 1);
    assert.equal(monthTitle.props.adjustsFontSizeToFit, true);
    assert.equal(style(monthTitle.props.style).minWidth, 0);
    const previous = nodes(tree, n => n.props.accessibilityLabel === (lang === 'en' ? 'Previous month' : 'Mes anterior'))[0];
    previous.props.onPress(event()); app.render(AgendaBoard, props);
    assert.deepEqual(directions, [1, -1]);
    delete props.renderHeader;
    tree = app.render(AgendaBoard, props);
    assert.equal(style(nodes(tree, n => n.props.accessibilityLabel === nextLabel)[0].props.style).width, 44);
    assert.equal(nodes(tree, n => n.props.testID === 'calendar-header').length, 0);
    props.viewMode = 'semana'; assert.equal(nodes(app.render(AgendaBoard, props), n => n.props.accessibilityLabel === nextLabel).length, 0);
    props.viewMode = 'dia'; assert.equal(nodes(app.render(AgendaBoard, props), n => n.props.accessibilityLabel === nextLabel).length, 0);
  }
});

test('the compact existing view selector opens its menu without adding another header row and keeps all three views', () => {
  const app = fixture(), { GoCalendarViewSelector } = app.load('components/ui/GoCalendarViewSelector.tsx');
  const chosen = [], props = { value: 'mes_lineal', compact: true, onChange: value => chosen.push(value) };
  let tree = app.render(GoCalendarViewSelector, props);
  tree.children[0].props.onPress(event()); tree = app.render(GoCalendarViewSelector, props);
  const menu = tree.children[1];
  assert.equal(style(menu.props.style).position, 'absolute');
  assert.ok(style(menu.props.style).top >= style(tree.children[0].props.style).minHeight);
  assert.deepEqual(texts(menu), ['DÍA', 'SEMANA', 'MES']);
  menu.children[0].props.onPress(event());
  assert.deepEqual(chosen, ['dia']);
  tree = app.render(GoCalendarViewSelector, props);
  assert.equal(tree.children.filter(Boolean).length, 1);
});

const pending = { id: 'pending-note', kind: 'sent', type: 'TAREA_INTERNA', intentKey: 'nota_interna', intentLabel: 'Tarea interna',
  color: '#7c3aed', dateISO: '2026-10-13', date: '13/10/2026', time: '17:00', duration: '', place: '', contactName: '', phone: '',
  estado: 'pendiente', localResolutionStatus: 'pending', isGeneric: true, notes: 'Revisión de prueba', messages: [{ id: 'message', goId: 'pending-note', text: 'Contenido que debe conservarse', senderId: 'yo', createdAt: 1, deliveryMode: 'internal' }], sharedChatId: 'existing-shared-chat' };

test('Pending cards keep one closed line; personal tasks have no false chat and shared tasks retain the same conversation in expanded details', () => {
  const app = fixture({ now: '2026-10-14T12:00:00' }), { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
  const opened = [], stateChanges = [], snapshot = JSON.stringify(pending);
  const props = { goLog: [pending], viewMode: 'mes_lineal', calViewMonth: '2026-10', onOpenMessage: item => opened.push(item), onChangeEstado: (...args) => stateChanges.push(args), contentRightInset: 64 };
  let tree = app.render(AgendaBoard, props);
  const card = nodes(tree, n => n.type === 'GestureDetector' && n.props.key === pending.id)[0];
  assert.ok(card);
  const top = nodes(card, n => n.type === 'View' && texts(n).includes('17:00') && texts(n).includes('TAREA.INT') && style(n.props.style)?.flexDirection === 'row')[0];
  assert.equal(style(top.props.style).flexWrap, 'nowrap');
  assert.equal(nodes(top, n => n.type === 'Feather' && n.props.name === 'message-circle').length, 0);
  assert.equal(nodes(card, n => n.props.accessibilityLabel === 'agenda_write_msg').length, 0);
  const body = nodes(card, n => n.type === 'TouchableOpacity' && texts(n).includes('17:00') && texts(n).includes('TAREA.INT'))[0];
  body.props.onPress(); tree = app.render(AgendaBoard, props);
  assert.equal(nodes(tree, n => n.props.testID === 'entry-message-go').length, 0, 'a personal task must not invent a recipient');
  nodes(tree, n => n.type === 'Modal' && n.props.visible && n.props.onRequestClose)[0].props.onRequestClose();
  const shared = {...pending,id:'pending-shared',type:'TAREA_EXTERNA',intentKey:'tarea_externa',contactName:'Participante de prueba'};
  const sharedSnapshot=JSON.stringify(shared), sharedProps={...props,goLog:[pending,shared]};
  tree=app.render(AgendaBoard,sharedProps);
  const sharedCard=nodes(tree,n=>n.type==='GestureDetector'&&n.props.key===shared.id)[0];assert.ok(sharedCard);
  nodes(sharedCard,n=>n.type==='TouchableOpacity'&&n.props.activeOpacity===0.85)[0].props.onPress();
  tree=app.render(AgendaBoard,sharedProps);
  const expanded=nodes(tree,n=>n.props.testID==='entry-details-scroll')[0];assert.ok(expanded);
  const message = nodes(expanded, n => n.type === 'TouchableOpacity' && n.props.testID === 'entry-message-go')[0];
  assert.ok(message);
  assert.equal(message.props.style.minHeight, 44);
  assert.equal(message.props.accessibilityRole, 'button');
  assert.ok(texts(message).includes('MENSAJE GO'));
  message.props.onPress();
  assert.equal(opened.length, 0, "Communication waits for dismissal commit, not a guessed timeout");
  tree = app.render(AgendaBoard, sharedProps);
  const dismissing = nodes(tree, n => n.props.testID === "entry-details-modal")[0];
  assert.equal(dismissing.props.visible, false);
  dismissing.props.onDismiss();
  app.runTimers();
  assert.equal(opened.length, 1); assert.equal(opened[0], shared);
  assert.equal(opened[0].sharedChatId, 'existing-shared-chat');
  assert.equal(JSON.stringify(pending), snapshot);
  assert.equal(JSON.stringify(shared), sharedSnapshot);
  assert.deepEqual(stateChanges, []);
});

test('day, week and month keep full-width scrolling and the original column sizes, without a lateral panel', () => {
  for (const viewMode of ['dia', 'semana', 'mes_lineal']) {
    const app = fixture({ now: '2026-10-14T12:00:00' });
    const { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
    const tree = app.render(AgendaBoard, { goLog: [], viewMode, calViewMonth: '2026-10' });
    const scroll = nodes(tree, n => n.type === 'GHScrollView' && n.props.horizontal)[0];
    assert.ok(scroll); assert.ok(tree.children.includes(scroll), 'No rail container between Board and its existing scroll');
    assert.equal(style(scroll.props.style).flex, 1);
    assert.equal(style(scroll.props.style).marginRight ?? 0, 0);
    const columns = nodes(tree, n => typeof n.props.key === 'string' && n.props.key.startsWith('day_'));
    assert.ok(columns.length); assert.equal(style(columns[0].props.style).width, viewMode === 'dia' ? 366 : 176);
  }
});

test('the restored full calendar width accepts a valid right-edge drop once, while rejecting foreign entries', () => {
  const source = require('node:fs').readFileSync('components/AgendaOperativa.tsx', 'utf8');
  const boardAst = ts.createSourceFile('board.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const scan = node => { if (ts.isVariableDeclaration(node) && node.name.getText(boardAst) === 'jsDropAt') callback = node.initializer.arguments[0]; ts.forEachChild(node, scan); };
  scan(boardAst); assert.ok(callback);
  for (const [pointerX, itemId, expectedMoves, expectedCancelled] of [[350, 'pending-note', 1, 0], [280, 'pending-note', 1, 0], [350, 'foreign-entry', 0, 1]]) {
    const calls = [], moves = [], scope = { exports: {}, screenW: 390,
      allowedEntryIdsRef: { current: new Set(['pending-note']) }, dropConsumed:{current:false}, jsCancelDragRef: { current: () => calls.push('cancelled') },
      boardX: { current: 0 }, scrollX: { current: 0 }, allColumnsRef: { current: [{ id: 'day', dateISO: '2026-10-15' }] }, colLayouts: { current: { day: { x: 200, w: 180 } } },
      clearEdgeScroll() {}, floatOp: {}, floatSc: {}, withTiming: value => value, withSpring: value => value,
      dragItemRef: { current: pending }, selectedIdsRef: { current: new Set() }, onOpenMoveFlow: (...args) => moves.push(args),
      onMoveItemRef: { current: null }, Haptics: { notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } },
      setDragItem() {}, setDragTargetColId() {},
    };
    vm.runInNewContext(transpile(`(${callback.getText(boardAst)})(${pointerX}, '${itemId}', '17:00');`), scope);
    assert.equal(moves.length, expectedMoves); assert.equal(calls.length, expectedCancelled);
    if (moves.length) assert.deepEqual(moves[0], ['pending-note', '2026-10-15', pending.dateISO, '17:00', false]);
  }
});

test('drag edge scrolling uses the original screen boundary on both sides, with no inactive lateral strip', () => {
  const source = require('node:fs').readFileSync('components/AgendaOperativa.tsx', 'utf8');
  const boardAst = ts.createSourceFile('board.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const scan = node => { if (ts.isVariableDeclaration(node) && node.name.getText(boardAst) === 'jsUpdateTarget') callback = node.initializer.arguments[0]; ts.forEachChild(node, scan); };
  scan(boardAst); assert.ok(callback);
  for (const [pointerX, expectedTimers, expectedClears] of [[350, 1, 0], [300, 0, 0], [25, 1, 0]]) {
    const timers = [], cleared = [], scope = { exports: {}, screenW: 390,
      boardX: { current: 0 }, scrollX: { current: 0 }, allColumnsRef: { current: [{ id: 'day' }] }, colLayouts: { current: { day: { x: 200, w: 180 } } },
      edgeScrollDir: { current: null }, edgeScrollTimer: { current: null }, scrollViewRef: { current: null },
      clearEdgeScroll: () => cleared.push(true), clearInterval() {}, setInterval: callback => { timers.push(callback); return 1; },
      Haptics: { selectionAsync: async () => {} }, setDragTargetColId() {},
    };
    vm.runInNewContext(transpile(`(${callback.getText(boardAst)})(${pointerX});`), scope);
    assert.equal(timers.length, expectedTimers); assert.equal(cleared.length, expectedClears);
  }
});

test('the month header recovers padding space while preserving the safe inset and all 44-point navigation targets', () => {
  for (const top of [20, 44, 59]) for (const demo of [false, true]) {
    const { tree } = renderHeader(null, demo, { top, left: 0, right: 0 });
    assert.equal(tree.props.style.paddingTop, top);
    assert.equal(tree.props.style.paddingBottom, 0);
    assert.equal(tree.props.style.height, undefined, 'No cap can clip larger text');
    if (demo) {
      const shortcut = nodes(tree, n => n.type === 'TouchableOpacity' && n.props.testID === 'customer-calendar-shortcut')[0];
      assert.equal(shortcut.props.style.minHeight, 44);
    }
  }
  const app = fixture(), { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
  const tree = app.render(AgendaBoard, { goLog: [], viewMode: 'mes_lineal', calViewMonth: '2026-10', renderHeader: nav => renderHeader(nav).tree });
  const arrows = nodes(tree, n => ['Mes anterior','Mes siguiente'].includes(n.props.accessibilityLabel));
  assert.equal(arrows.length, 2); for (const arrow of arrows) assert.equal(style(arrow.props.style).height, 44);
});

test('only the main Calendar compacts day/date/weather headers and gives the recovered space to the existing agenda', () => {
  for (const viewMode of ['dia','semana','mes_lineal']) for (const calSizeKey of ['GO_CAL_SMALL','GO_CAL_MEDIUM','GO_CAL_LARGE']) {
    const options = { now: '2026-10-14T12:00:00' }, shared = fixture(options), compact = fixture(options);
    const props = { goLog: [], viewMode, calSizeKey, calViewMonth: '2026-10', selectedDateISO: '2026-10-14',
      weatherDays: { '2026-10-14': { weatherCode: 63, tempMax: 24, tempMin: 16, windMax: 30, precipMax: 60 } } };
    const sharedTree = shared.render(shared.load('components/AgendaOperativa.tsx').AgendaBoard, props);
    const selected = [], compactTree = compact.render(compact.load('components/AgendaOperativa.tsx').AgendaBoard,
      { ...props, renderHeader: nav => nav, onSelectDay: date => selected.push(date) });
    const getColumn = tree => nodes(tree, n => n.props.key === 'day_2026-10-14')[0];
    const beforeColumn = getColumn(sharedTree), afterColumn = getColumn(compactTree);
    assert.ok(beforeColumn); assert.ok(afterColumn); assert.equal(style(beforeColumn.props.style).width, style(afterColumn.props.style).width);
    const beforeHeader = beforeColumn.children[0], afterHeader = afterColumn.children[0];
    const headerPress = header => nodes(header, n => n.type === 'TouchableOpacity' && n.props.accessibilityRole === 'button')[0];
    const beforePress = headerPress(beforeHeader), afterPress = headerPress(afterHeader);
    assert.equal(style(beforeHeader.props.style).paddingVertical, 12, 'Shared boards retain their original padding');
    assert.equal(style(beforePress.props.style).gap, 2); assert.equal(style(beforePress.props.style).minHeight, undefined);
    assert.equal(style(afterHeader.props.style).paddingVertical, 0);
    assert.equal(style(afterPress.props.style).minHeight, 44); assert.equal(style(afterPress.props.style).paddingVertical, 2);
    assert.equal(style(afterPress.props.style).gap, 1); assert.equal(style(afterPress.props.style).height, undefined);
    const signature = header => nodes(header, n => n.type === 'Text').map(n => ({text: texts(n), size: style(n.props.style)?.fontSize}));
    assert.deepEqual(signature(afterHeader), signature(beforeHeader), 'Day, date, temperature, wind and rain text sizes/content stay unchanged');
    const labels = nodes(afterHeader, n => n.type === 'Text').map(n => n.children.filter(v => typeof v === 'string' || typeof v === 'number').join(''));
    assert.ok(labels.includes('24°')); assert.ok(labels.includes('30')); assert.ok(labels.includes('60%'));
    const icons = header => nodes(header, n => n.type === 'Feather').map(n => [n.props.name, n.props.size]);
    assert.deepEqual(icons(afterHeader), icons(beforeHeader), 'Weather icons keep their original sizes');
    afterPress.props.onPress(event()); assert.deepEqual(selected, ['2026-10-14']);
    const scroll = tree => nodes(tree, n => n.type === 'GHScrollView' && n.props.horizontal)[0];
    const beforeContent = style(scroll(sharedTree).props.contentContainerStyle), afterContent = style(scroll(compactTree).props.contentContainerStyle);
    assert.equal(beforeContent.paddingTop ?? beforeContent.paddingVertical, 10);
    assert.equal(afterContent.paddingTop, 0); assert.equal(afterContent.paddingBottom ?? afterContent.paddingVertical, 10);
    assert.equal(style(scroll(compactTree).props.style).flex, 1, 'The existing flexible agenda absorbs recovered height');
  }
});

test('only the Calendar Pending title moves left; counter, font and column width remain unchanged', () => {
  for (const calSizeKey of ['GO_CAL_SMALL','GO_CAL_MEDIUM','GO_CAL_LARGE']) for (const count of [1,12]) {
    const options = { now: '2026-10-14T12:00:00' }, shared = fixture(options), compact = fixture(options);
    const props = { goLog: Array.from({length:count},(_,i)=>({...pending,id:'pending-'+i})),
      viewMode: 'mes_lineal', calSizeKey, calViewMonth: '2026-10' };
    const before = shared.render(shared.load('components/AgendaOperativa.tsx').AgendaBoard, props);
    const after = compact.render(compact.load('components/AgendaOperativa.tsx').AgendaBoard, {...props,renderHeader:nav=>nav});
    const column = tree => nodes(tree, n => n.props.key === 'retrasados')[0];
    const title = tree => nodes(column(tree).children[0], n => n.type === 'Text')[0];
    const badge = tree => nodes(column(tree).children[0], n => n.type === 'View' && style(n.props.style)?.right === 4 && style(n.props.style)?.top === 4)[0];
    assert.equal(style(title(before).props.style).transform, undefined);
    assert.equal(style(title(after).props.style).transform[0].translateX, -6);
    assert.deepEqual(texts(title(after)), texts(title(before)));
    assert.equal(style(title(after).props.style).fontSize, style(title(before).props.style).fontSize);
    assert.equal(style(column(after).props.style).width, style(column(before).props.style).width);
    assert.deepEqual(style(badge(after).props.style), style(badge(before).props.style));
    assert.equal(badge(after).children[0].children[0], count);
    assert.equal(nodes(column(after), n => n.type === 'GestureDetector').length, count);
  }
});
