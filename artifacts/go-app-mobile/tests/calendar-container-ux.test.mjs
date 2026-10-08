
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(predicate, root = ast) {
  let result;
  function visit(node) { if (!result && predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(root); assert.ok(result, 'Expected calendar implementation'); return result;
}
const declaration = name => find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name).initializer.getText(ast);
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
function evaluate(code, globals = {}) {
  const scope = { exports: {}, ...globals }; vm.runInNewContext(transpile(code), scope); return scope.exports;
}
function fixture() {
  const calls = [];
  const scope = vm.createContext({
    exports: {}, Date, Set, Math, JSON,
    calOpen: true, fieldSelectorOpen: false, calQuickCreateOpen: false, calConfigVisible: false, calReservasOpen: false,
    dateISODraft: '2027-02-28', dateDraft: 'Dom 28/02', calBgViewMode: 'mes_lineal', calBgViewMonth: '2027-02',
    calendarTaskContextRef: { current: null }, qdReturnTimerRef: { current: null }, qdFlowActiveRef: { current: false },
    pendingMoveCtxRef: { current: null }, qdOriginContextRef: { current: {} },
    ...Object.fromEntries(['ContactName', 'Phone', 'Date', 'DateISO', 'Time', 'Place'].map(name => ['qdCap' + name + 'Ref', { current: '' }])),
    isActivelyCreating: false, categorySelected: false, contactName: '', phone: '', date: '', dateISO: '', time: '', place: '',
    listOpen: false, notesOpen: false, agendaOpOpen: false, fsFilledValues: {},
    scrollTarget: { dateISO: '2027-02-28', timeHHMM: '10:00', token: 123 }, todayToken: 7,
    formatISODate: date => date.toISOString().slice(0, 10),
    getToday: () => new Date('2026-10-08T00:00:00Z'), formatDayLabel: date => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-'),
    clearTimeout: timer => calls.push(['clearTimer', timer]), Keyboard: { dismiss: () => calls.push(['keyboard']) },
    AsyncStorage: {
      setItem: async (...args) => calls.push(['setItem', ...args]),
      multiSet: async pairs => calls.push(['multiSet', JSON.parse(JSON.stringify(pairs))]),
    },
    Haptics: { selectionAsync: async () => {} },
    createEntryFromSelector: () => { throw new Error('Closing must never create a task'); },
    cancelMoveFlow: () => calls.push(['cancelMove']),
    saveCal: () => { calls.push(['saveCal']); scope.setCalOpen(false); },
  });
  for (const name of [
    'CalOpen', 'FieldSelectorOpen', 'FsLocationExpanded', 'FsPlaceDraft', 'DateISODraft', 'DateDraft',
    'CalBgViewMode', 'CalBgViewMonth', 'CalQuickCreateOpen', 'CalConfigVisible', 'CalReservasOpen',
    'FieldSelectorKind', 'FieldSelectorText', 'FieldSelectorDetail', 'FieldSelectorFields', 'FsFilledValues',
    'FsActivityKey', 'FsOrbitalOpen', 'FsCustomOpen', 'FsCustomLabel', 'ListOpen', 'ListMinimized',
    'ListFiltersHidden', 'NotesOpen', 'AgendaOpOpen', 'CalAddOpen',
  ]) {
    const state = name[0].toLowerCase() + name.slice(1);
    scope['set' + name] = value => { calls.push(['set' + name, value]); scope[state] = typeof value === 'function' ? value(scope[state]) : value; };
  }
  scope.setCalScrollToDateTarget = value => { scope.scrollTarget = value; };
  scope.calFlow = {
    isActive: false,
    cancel() { calls.push(['cancelFlow']); this.isActive = false; scope.onCancel?.(); },
    closeMonthGridManual: () => calls.push(['closeMonth']),
  };
  for (const name of ['closeFieldSelectorPanel', 'closeCalendarTaskPanel', 'changeCalendarView', 'navigateCalendarDay', 'closeMonthGrid', 'exitCalendarContainer', 'openFieldSelector']) {
    vm.runInContext(transpile('exports.' + name + ' = ' + declaration(name)), scope);
    scope[name] = scope.exports[name];
  }
  return { scope, calls };
}

for (const kind of ['NOTA_INTERNA', 'NOTA_EXTERNA']) {
  test(kind + ': close the existing task layer without resetting the mounted calendar', () => {
    const { scope, calls } = fixture(); const scroll = scope.scrollTarget;
    scope.openFieldSelector(kind, 'Revisar piloto', '', '2027-02-28');
    assert.equal(scope.calOpen, true); assert.equal(scope.fieldSelectorOpen, true); assert.equal(scope.fieldSelectorKind, kind);
    assert.equal(scope.fsFilledValues.dateISO, '2027-02-28');
    scope.dateISODraft = '2027-03-12'; scope.dateDraft = '12/03'; scope.calBgViewMode = 'dia'; scope.calBgViewMonth = '2027-03';
    scope.qdReturnTimerRef.current = 77; scope.qdFlowActiveRef.current = true; scope.calFlow.isActive = true;
    scope.onCancel = () => { scope.fieldSelectorOpen = true; };
    scope.closeFieldSelectorPanel();
    assert.equal(scope.fieldSelectorOpen, false); assert.equal(scope.calOpen, true);
    assert.equal(scope.dateISODraft, '2027-02-28'); assert.equal(scope.dateDraft, 'Dom 28/02');
    assert.equal(scope.calBgViewMode, 'mes_lineal'); assert.equal(scope.calBgViewMonth, '2027-02');
    assert.equal(scope.scrollTarget, scroll); assert.equal(scope.todayToken, 7);
    assert.equal(scope.calendarTaskContextRef.current, null); assert.equal(scope.qdFlowActiveRef.current, false);
    assert.equal(scope.qdReturnTimerRef.current, null);
    assert.ok(calls.some(call => call[0] === 'clearTimer' && call[1] === 77));
    assert.ok(!calls.some(call => call[0] === 'setCalOpen'));
  });
}
test('container exit cancels the task and closes Calendar without saving', () => {
  const { scope, calls } = fixture();
  scope.openFieldSelector('NOTA_INTERNA', 'Borrador', '', '2027-02-28'); scope.calFlow.isActive = true;
  scope.exitCalendarContainer();
  assert.equal(scope.fieldSelectorOpen, false); assert.equal(scope.calOpen, false);
  assert.equal(scope.calConfigVisible, false); assert.equal(scope.calReservasOpen, false);
  assert.ok(!calls.some(call => call[0] === 'saveCal'));
});
test('quick panel close preserves the day; container exit safely cancels an existing move', () => {
  const { scope, calls } = fixture(); scope.calQuickCreateOpen = true; scope.closeCalendarTaskPanel();
  assert.equal(scope.calQuickCreateOpen, false); assert.equal(scope.calOpen, true); assert.equal(scope.dateISODraft, '2027-02-28');
  scope.pendingMoveCtxRef.current = { itemId: 'existing-task' }; scope.exitCalendarContainer();
  assert.equal(scope.calOpen, false); assert.ok(calls.some(call => call[0] === 'cancelMove'));
  assert.ok(!calls.some(call => call[0] === 'saveCal'));
});
test('standalone task close does not restore a calendar context', () => {
  const { scope, calls } = fixture(); scope.calOpen = false; scope.fieldSelectorOpen = true; scope.closeFieldSelectorPanel();
  assert.equal(scope.fieldSelectorOpen, false); assert.equal(scope.calOpen, false);
  assert.ok(!calls.some(call => call[0] === 'setDateISODraft' || call[0] === 'cancelFlow'));
});
test('principal selector changes all existing views without changing the day or month', () => {
  const { scope, calls } = fixture();
  const selector = find(n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'GoCalendarViewSelector');
  assert.equal(selector.attributes.properties.find(n => n.name?.getText(ast) === 'onChange').initializer.expression.getText(ast), 'changeCalendarView');
  for (const view of ['dia', 'semana', 'mes_lineal']) {
    scope.changeCalendarView(view);
    assert.equal(scope.calBgViewMode, view); assert.equal(scope.dateISODraft, '2027-02-28'); assert.equal(scope.calBgViewMonth, '2027-02');
    assert.deepEqual(calls.at(-1), ['multiSet', [['cal_view', view], ['go_cal_view_mode_v1', view]]]);
  }
});
test('month navigation crosses years and targets the chosen date', () => {
  const { scope } = fixture(); scope.navigateCalendarDay('2028-01-10');
  assert.equal(scope.dateISODraft, '2028-01-10'); assert.equal(scope.calBgViewMonth, '2028-01');
  assert.equal(scope.dateDraft, '2028-01-10'); assert.equal(scope.scrollTarget.dateISO, '2028-01-10');
});
test('closing month correction returns to the internal form without exiting Calendar', () => {
  const { scope, calls } = fixture(); scope.openFieldSelector('NOTA_INTERNA', '', '', '2027-02-28');
  scope.fieldSelectorOpen = false; scope.closeMonthGrid();
  assert.equal(scope.fieldSelectorOpen, true); assert.equal(scope.calOpen, true); assert.ok(calls.some(call => call[0] === 'closeMonth'));
});

const byId = id => find(n => ts.isJsxAttribute(n) && n.name.getText(ast) === 'testID' && n.initializer?.text === id).parent.parent.parent;
const nodes = (tree, predicate) => !tree || typeof tree !== 'object' ? [] :
  [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))];
const textOf = tree => nodes(tree, n => n.type === 'Text').flatMap(n => n.children).filter(n => typeof n === 'string').join('');
function renderFragment(node, globals = {}) {
  return evaluate('exports.tree = (' + node.getText(ast) + ')', {
    React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', Feather: 'Feather',
    MaterialCommunityIcons: 'MaterialCommunityIcons', GoCloseButton: 'GoCloseButton',
    lang: 'es', isBusinessMode: false, calQuickCreateOpen: false, calConfigVisible: false, ...globals,
  }).tree;
}
test('bottom controls emphasize RESERVAR, fit a narrow viewport and retain every action', () => {
  const calls = [];
  const tree = renderFragment(byId('calendar-actions'), {
    GO_GOLD: '#C8A037', t: key => ({ new_task_label: 'Nueva tarea', cal_today_btn: 'HOY', biz_book_btn: 'RESERVAR' })[key],
    Haptics: { selectionAsync: async () => {}, impactAsync: async () => {}, ImpactFeedbackStyle: { Medium: 'medium', Heavy: 'heavy' } },
    setCalQuickCreateOpen: value => calls.push(['task', value]), setCalScrollToTodayToken: update => calls.push(['today', update(7)]),
    setShowBookingFromCal: value => calls.push(['book', value]), setDiagBookingOpen: value => calls.push(['diagnostics', value]),
    openAi: () => calls.push(['go']), startVoiceMode: () => calls.push(['voice']),
  });
  const actions = nodes(tree, n => n.type === 'TouchableOpacity'); assert.equal(actions.length, 4);
  const [task, today, reserve, go] = actions;
  assert.equal(nodes(task, n => n.type === 'MaterialCommunityIcons')[0].props.name, 'note-edit-outline');
  assert.equal(textOf(today), 'HOY'); assert.equal(textOf(reserve), 'RESERVAR'); assert.equal(textOf(go), 'GO');
  assert.ok(reserve.props.style.height > today.props.style.height);
  assert.ok(nodes(reserve, n => n.type === 'Text')[0].props.style.fontSize > nodes(today, n => n.type === 'Text')[0].props.style.fontSize);
  assert.ok(actions.every(action => action.props.hitSlop * 2 < tree.props.style.gap));
  const minimumWidth = 44 + 52 + reserve.props.style.minWidth + 44 + 3 * tree.props.style.gap + 10;
  assert.ok(minimumWidth <= 320 - 36);
  for (const action of actions) action.props.onPress();
  reserve.props.onLongPress(); go.props.onLongPress();
  assert.deepEqual(calls, [['task', true], ['today', 8], ['book', true], ['go'], ['diagnostics', true], ['voice']]);
  assert.equal(reserve.props.delayLongPress, 800); assert.equal(go.props.delayLongPress, 400);
});
test('root has no redundant panel close and floats have a reserved space outside the agenda', () => {
  const globals = { insets: { right: 34 }, overlayPanelHeight: 90, calFlow: {}, Haptics: {}, closeCalendarTaskPanel() {}, setCalConfigVisible() {}, exitCalendarContainer() {} };
  let tree = renderFragment(byId('calendar-floating-controls'), globals);
  assert.deepEqual(nodes(tree, n => n.type === 'GoCloseButton').map(n => n.props.level), ['container']);
  tree = renderFragment(byId('calendar-floating-controls'), { ...globals, calQuickCreateOpen: true });
  assert.deepEqual(nodes(tree, n => n.type === 'GoCloseButton').map(n => n.props.level), ['panel', 'container']);
  const calendar = nodes(tree, n => n.type === 'TouchableOpacity')[0];
  const style = byId('calendar-agenda-viewport').openingElement.attributes.properties.find(n => n.name?.getText(ast) === 'style').initializer.expression.getText(ast);
  const viewport = evaluate('exports.style = (' + style + ')', { insets: globals.insets }).style;
  assert.equal(viewport.paddingRight, undefined, 'Daily columns keep the full viewport width');
  assert.equal(tree.props.style.flexDirection, 'row');
  assert.ok(tree.props.style.bottom - globals.overlayPanelHeight + calendar.props.style.height + calendar.props.hitSlop < viewport.paddingBottom);
  assert.ok(tree.props.style.bottom > globals.overlayPanelHeight);
});
test('one existing form is embedded in Calendar while the agenda stays mounted', () => {
  const body = find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'renderFieldSelector').getText(ast);
  assert.equal((body.match(/<KeyboardAvoidingView/g) ?? []).length, 1); assert.match(body, /if \(embedded\)/);
  const agenda = byId('calendar-agenda-viewport');
  assert.equal(agenda.parent.kind, ts.SyntaxKind.JsxElement, 'Agenda is always mounted, outside any conditional layer');
  const call = find(n => ts.isCallExpression(n) && n.getText(ast) === 'renderFieldSelector(true)');
  let modal = call.parent;
  while (modal && !(ts.isJsxElement(modal) && modal.openingElement.tagName.getText(ast) === 'Modal')) modal = modal.parent;
  assert.ok(modal);
  assert.equal(modal.openingElement.attributes.properties.find(n => n.name?.getText(ast) === 'visible').initializer.expression.getText(ast), 'calOpen');
  assert.match(source, /!calendarTaskContextRef.current && renderFieldSelector\(false\)/);
});


test('exiting month navigation never calls a stale creation callback', () => {
  const { scope, calls } = fixture(); scope.calFlow.step = 'nav'; scope.calFlow.isActive = true;
  scope.exitCalendarContainer();
  assert.equal(scope.calOpen, false); assert.ok(calls.some(call => call[0] === 'closeMonth'));
  assert.ok(!calls.some(call => call[0] === 'saveCal' || call[0] === 'cancelFlow'));
});

test("cancelling the existing date tool returns to the embedded task form", () => {
  const { scope } = fixture(); scope.openFieldSelector("NOTA_INTERNA", "Piloto", "", "2027-02-28");
  let options;
  scope.calFlow.open = value => { options = value; };
  scope._handleCalFlowSave = () => {};
  vm.runInContext(transpile("exports.openDateTool = " + declaration("openFechaHora")), scope);
  scope.exports.openDateTool();
  assert.equal(scope.fieldSelectorOpen, false); assert.equal(scope.calOpen, true);
  assert.equal(options.initialDateISO, "2027-02-28");
  options.onCancel();
  assert.equal(scope.fieldSelectorOpen, true); assert.equal(scope.calOpen, true);
  assert.equal(scope.calendarTaskContextRef.current.dateISO, "2027-02-28");
});
