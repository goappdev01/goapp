import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fixture as boardFixture } from './helpers/calendar-fixture.mjs';

const require = createRequire(import.meta.url);
const h = require('./helpers/unified-note-fixture.cjs');
const ts = h.ts;
const source = fs.readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('app/index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const model = h.load('lib/unifiedNotes.ts');
const tools = h.load('lib/goNoteTools.ts');
const navigation = h.load('lib/goNoteNavigation.ts', { './unifiedNotes': model });
const findAll = predicate => {
  const found = [];
  function visit(node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return found;
};
const declaration = name => {
  const found = findAll(node => (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node))
    && node.name?.getText(ast) === name);
  assert.equal(found.length, 1, `one real declaration for ${name}`);
  return ts.isFunctionDeclaration(found[0]) ? found[0].getText(ast) : `const ${found[0].getText(ast)};`;
};
const jsxNodes = () => findAll(node => ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node));
const attribute = (node, name) => node.attributes.properties.find(prop => ts.isJsxAttribute(prop) && prop.name.text === name);
const expression = (node, name) => {
  const value = attribute(node, name)?.initializer;
  assert.ok(value && ts.isJsxExpression(value) && value.expression, `${node.tagName.getText(ast)}.${name} has a real JSX expression`);
  return value.expression;
};
const control = testID => {
  const found = jsxNodes().filter(node => {
    const value = attribute(node, 'testID')?.initializer;
    return value && ts.isStringLiteral(value) && value.text === testID;
  });
  assert.equal(found.length, 1, `one visible ${testID} control`);
  return found[0];
};
const agenda = () => {
  const found = jsxNodes().filter(node => node.tagName.getText(ast) === 'AgendaBoard'
    && attribute(node, 'onCreateTaskAtTime'));
  assert.equal(found.length, 1, 'use the personal calendar consumer, outside Reservas');
  return found[0];
};
const listSheet = () => {
  const found = jsxNodes().filter(node => node.tagName.getText(ast) === 'BottomSheet'
    && attribute(node, 'visible')?.initializer?.getText(ast) === '{listOpen}');
  assert.equal(found.length, 1, 'one Listados presenter');
  return found[0];
};
function valueOf(ctx, node) {
  vm.runInContext(h.compile(`globalThis.__result=(${node.getText(ast)});`), ctx);
  return ctx.__result;
}
function loadFunctions(ctx, names) {
  vm.runInContext(h.compile(names.map(declaration).join('\n')
    + names.map(name => `\nglobalThis.${name}=${name};`).join('')), ctx);
}
const nodes = (tree, predicate) => !tree || typeof tree !== 'object' ? [] : [
  ...(predicate(tree) ? [tree] : []), ...(tree.children || []).flatMap(child => nodes(child, predicate)),
];

function fixture(origin = 'calendar') {
  const calls = [];
  const scope = { userId: 'note-user', context: 'demo:USER' };
  const ctx = vm.createContext({
    Date, Error, Map, Set, JSON, Promise,
    React: { createElement: (type, props, ...children) => ({ type, props: props || {}, children }) },
    GoNoteEditor: function GoNoteEditor() {}, GoScreenHost: function GoScreenHost() {},
    notesOpen: false, calOpen: origin === 'calendar', listOpen: origin === 'list',
    calQuickCreateOpen: false, quickCreateOpen: false, fieldSelectorOpen: false, calReservasOpen: false,
    unifiedNoteInitial: null, unifiedNoteSeed: {}, unifiedNoteOriginRef: { current: 'landing' },
    unifiedNoteCache: { current: null }, unifiedNoteEditCache: { current: new Map() },
    noteIdentity: { ready: true, scope }, noteIdentityRef: { current: { ready: true, scope } },
    completionIdentity: { ready: true, scope }, handedness: 'right',
    quickNoteText: '', quickNoteDetail: '', isActivelyCreating: false, categorySelected: false,
    dateISODraft: '2027-01-15', dateDraft: '15 enero', calBgViewMonth: '2027-01', calBgViewMode: 'mes_lineal',
    calendarTaskContextRef: { current: null }, calendarSlotRequestRef: { current: 0 },
    calendarSlotOpeningRef: { current: false }, calendarSlotSavingRef: { current: false },
    calendarSlotDraftRef: { current: null }, noteTaskDraftRef: { current: null },
    listNoteLayerBackRef: { current: null }, listBookingDetail: undefined, lang: 'es', contactName: '', phone: '',
    getToday: () => new Date(2027, 0, 1),
    formatISODate: date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
    savedNoteTarget: navigation.savedNoteTarget, noteDocument: model.noteDocument, noteInScope: model.noteInScope,
    isGoNoteReminderTarget: tools.isGoNoteReminderTarget,
    showToast: (...args) => calls.push(['toast', ...args]),
    closeMonthGrid: () => calls.push(['close-month']),
    getTaskUser: async () => { calls.push(['get-user']); return scope.userId; },
    assertTaskUser: async user => { calls.push(['assert-user', user]); },
    openFieldSelector: () => assert.fail('ordinary note access must never mount the legacy form'),
    deleteSavedNote() {}, renderSavedNoteActions() {}, saveNoteDraft() {},
    AsyncStorage: { removeItem: async key => calls.push(['remove-draft', key]) },
    Haptics: { selectionAsync: async () => {}, notificationAsync: async () => {}, NotificationFeedbackType: { Success: 'success' } },
  });
  for (const state of ['notesOpen', 'unifiedNoteInitial', 'unifiedNoteSeed', 'calOpen', 'listOpen',
    'calQuickCreateOpen', 'quickCreateOpen', 'quickCreateText', 'fieldSelectorOpen', 'calReservasOpen', 'calConfigVisible',
    'calAddOpen', 'calPanelOpen', 'demoCustomerCalendarSelected', 'calBgViewMode', 'calBgViewMonth', 'dateISODraft',
    'calScrollToDateTarget', 'calHighlightEntryId', 'quickNoteText', 'quickNoteDetail', 'attachedExternalNote']) {
    ctx[`set${state[0].toUpperCase()}${state.slice(1)}`] = value => {
      ctx[state] = typeof value === 'function' ? value(ctx[state]) : value;
      calls.push([state, h.plain(ctx[state])]);
    };
  }
  loadFunctions(ctx, ['openUnifiedNote', 'openUnifiedNoteComposer', 'openQuickNoteFrom', 'openCalendarNote', 'openListNote',
    'openCalendarDayNote', 'openCalendarSlotTask', 'openListSavedNote', 'handleUnifiedNoteSaved', 'openSavedNoteDestination',
    'cacheNoteDraft', 'renderUnifiedNoteEditor']);
  return { ctx, calls, scope };
}
function assertComposer(f, origin, expectedSeed, initial = null) {
  const { ctx } = f;
  const editor = ctx.renderUnifiedNoteEditor();
  assert.equal(editor.type, ctx.GoNoteEditor);
  assert.equal(editor.props.visible, true, 'the actual shared editor becomes visible after pressing the actual JSX callback');
  assert.equal(ctx.unifiedNoteOriginRef.current, origin);
  assert.equal(editor.props.initial, initial);
  for (const [key, value] of Object.entries(expectedSeed)) assert.equal(editor.props.seed[key], value, key);
  assert.equal(ctx.calOpen, origin === 'calendar', 'retain the Calendar presenter');
  assert.equal(ctx.listOpen, origin === 'list', 'retain the Listados presenter');
  for (const flag of ['calQuickCreateOpen', 'quickCreateOpen', 'fieldSelectorOpen', 'calReservasOpen']) {
    assert.equal(ctx[flag], false, `${flag} must stay closed`);
    assert.ok(!f.calls.some(call => call[0] === flag && call[1] === true), `${flag} must never open during the route`);
  }
  return editor;
}
const pressNotes = (f, origin) => valueOf(f.ctx, expression(control(`${origin === 'list' ? 'list' : 'calendar'}-notes-open`), 'onPress'))({ stopPropagation() {} });

for (const origin of ['calendar', 'list']) {
  test(`${origin} notes icon executes its JSX onPress and immediately shows the shared editor`, async () => {
    const f = fixture(origin);
    await pressNotes(f, origin);
    assertComposer(f, origin, { title: '' });
    assert.equal(f.calls.filter(call => call[0] === 'notesOpen' && call[1] === true).length, 1);
  });

  test(`${origin} cancel executes the real editor onClose and returns to the still-mounted source`, async () => {
    const f = fixture(origin);
    await pressNotes(f, origin);
    const editor = assertComposer(f, origin, {});
    const draft = { id: 'unsaved', title: 'Continuar después', content: 'Borrador conservado' };
    editor.props.onClose({ saved: false, draft });
    assert.equal(f.ctx.renderUnifiedNoteEditor().props.visible, false);
    assert.equal(f.ctx.calOpen, origin === 'calendar');
    assert.equal(f.ctx.listOpen, origin === 'list');
    assert.equal(f.ctx.unifiedNoteOriginRef.current, 'landing');
    assert.deepEqual(h.plain(f.ctx.unifiedNoteCache.current.draft), draft);
    assert.ok(!f.calls.some(call => call[0] === 'calScrollToDateTarget' || call[0] === 'toast'));
  });
}

test('the calendar day-add JSX callback opens notes without requiring a contact and retains the selected date', async () => {
  const f = fixture();
  await valueOf(f.ctx, expression(agenda(), 'onAddEntry'))('2027-02-18');
  assertComposer(f, 'calendar', { title: '', dateISO: '2027-02-18' });
});

test('Listados places the visible editor in its own native modal host and delegates back to that host', async () => {
  const f = fixture('list');
  const overlay = expression(listSheet(), 'modalOverlay');
  assert.equal(valueOf(f.ctx, overlay), undefined, 'a closed editor has no overlay');
  await pressNotes(f, 'list');
  const host = valueOf(f.ctx, overlay);
  assert.equal(host.type, f.ctx.GoScreenHost, 'the editor must use the Listados Modal host on iOS');
  assert.equal(nodes(host, node => node.type === f.ctx.GoNoteEditor && node.props.visible).length, 1);
  let backs = 0;
  host.props.registerBack(() => { backs++; return true; });
  await valueOf(f.ctx, expression(listSheet(), 'onClose'))();
  assert.equal(backs, 1, 'native back reaches the hosted editor before Listados');
  assert.equal(f.ctx.listOpen, true);
  assert.equal(f.ctx.notesOpen, true);
});

test('Listados blocks both sheet pans while notes are hosted and restores them after closing', () => {
  const f = fixture('list');
  const blockPan = expression(listSheet(), 'blockPan');
  const initializers = ['dragGesture', 'rightZoneGesture'].map(name => {
    const found = findAll(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
    assert.equal(found.length, 1, `execute the real ${name} useMemo`);
    assert.ok(found[0].initializer && ts.isCallExpression(found[0].initializer));
    return found[0].initializer;
  });
  const memo = [];
  let cursor = 0;
  const pan = () => {
    const chain = {};
    for (const name of ['enabled', 'activeOffsetY', 'failOffsetY', 'failOffsetX',
      'simultaneousWithExternalGesture', 'onStart', 'onUpdate', 'onEnd', 'onFinalize']) {
      chain[name] = value => { chain[`_${name}`] = value; return chain; };
    }
    return chain;
  };
  const ctx = vm.createContext({
    Gesture: { Pan: pan }, dragToClose: true, rightZoneClose: true, blockPan: false,
    noteKeyboardScroll: false, kbVisible: false, nativeScrollGesture: {},
    onClose() {}, onSwipeStepDown() {}, doClose() {}, swipeStepDown: { value: 1 },
    translateY: { value: 0 }, scrollOffset: { value: 0 }, panelH: { value: 600 },
    keyboardVisible: { value: false }, rzStartedInZone: { value: false }, rzScreenW: { value: 390 },
    useMemo(factory, dependencies) {
      const index = cursor++;
      if (!memo[index] || dependencies.some((value, i) => !Object.is(value, memo[index].dependencies[i]))) {
        memo[index] = { dependencies, value: factory() };
      }
      return memo[index].value;
    },
  });
  // Retain memo values across renders: omitting blockPan from either dependency
  // list must fail just as surely as leaving its native recognizer enabled.
  for (const notesOpen of [false, true, false]) {
    f.ctx.notesOpen = notesOpen;
    ctx.blockPan = valueOf(f.ctx, blockPan);
    assert.equal(ctx.blockPan, notesOpen, 'only the hosted note session blocks the sheet pans');
    cursor = 0;
    for (const initializer of initializers) {
      assert.equal(valueOf(ctx, initializer)._enabled, !notesOpen,
        'both actual native Pan recognizers must follow the hosted editor lifecycle');
    }
  }
});

test('the root editor mount is suppressed while either Calendar or Listados presents its own editor', () => {
  const rootCalls = findAll(node => ts.isCallExpression(node) && node.expression.getText(ast) === 'renderUnifiedNoteEditor')
    .filter(node => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (ts.isJsxElement(parent) && parent.openingElement.tagName.getText(ast) === 'GoScreenHost') return false;
        if (ts.isJsxAttribute(parent) && parent.name.text === 'modalOverlay') return false;
      }
      return true;
    });
  assert.equal(rootCalls.length, 1, 'one root editor mount');
  let rootExpression = rootCalls[0].parent;
  while (rootExpression && !ts.isJsxExpression(rootExpression)) rootExpression = rootExpression.parent;
  assert.ok(rootExpression?.expression, 'execute the real root JSX mount condition');
  const f = fixture();
  f.ctx.notesOpen = true;
  for (const [calOpen, listOpen, count] of [[true, false, 0], [false, true, 0], [false, false, 1]]) {
    Object.assign(f.ctx, { calOpen, listOpen });
    assert.equal(nodes(valueOf(f.ctx, rootExpression.expression), node => node.type === f.ctx.GoNoteEditor).length, count);
  }
});

for (const [density, time] of [['15min', '13:45'], ['30min', '13:30'], ['1h', '13:00']]) {
  test(`a real empty ${density} calendar slot opens the shared editor at its precise time, outside Reservas`, async () => {
    const f = fixture();
    const route = valueOf(f.ctx, expression(agenda(), 'onCreateTaskAtTime'));
    const app = boardFixture({ now: '2027-01-01T12:00:00' });
    const { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
    let opening;
    const dispatched = [];
    const tree = app.render(AgendaBoard, {
      goLog: [], archiveNotes: [], density, viewMode: 'dia', selectedDateISO: '2027-01-15', calViewMonth: '2027-01',
      onCreateTaskAtTime: (...args) => { dispatched.push(args); opening = route(...args); },
    });
    const slot = nodes(tree, node => node.type?.name === 'GoCalendarSlot'
      && node.props.dateISO === '2027-01-15' && node.props.timeHHMM === time)[0];
    assert.ok(slot, 'the configured calendar density renders the exact empty slot');
    const gesture = slot.type(slot.props).props.gesture;
    gesture._onEnd({}, false);
    assert.equal(dispatched.length, 0, 'cancelled taps cannot open the editor');
    gesture._onEnd({}, true);
    await opening;
    assert.deepEqual(dispatched, [['2027-01-15', time]]);
    assertComposer(f, 'calendar', { destination: 'calendar', dateISO: '2027-01-15', time });
    assert.deepEqual(f.calls.filter(call => ['get-user', 'assert-user'].includes(call[0])), [['get-user'], ['assert-user', f.scope.userId]]);
    assert.equal(f.ctx.calendarSlotDraftRef.current, null, 'the shared composer must not reserve a legacy form draft');
    assert.equal(f.ctx.calendarSlotOpeningRef.current, false);
  });
}

for (const failure of ['anonymous', 'verification', 'scope']) {
  test(`slot ${failure} guard prevents opening the composer`, async () => {
    const f = fixture();
    if (failure === 'anonymous') f.ctx.getTaskUser = async () => null;
    if (failure === 'verification') f.ctx.assertTaskUser = async () => { throw new Error('La sesión ha cambiado'); };
    if (failure === 'scope') f.ctx.noteIdentityRef.current = { ready: true, scope: { ...f.scope, userId: 'other-user' } };
    await valueOf(f.ctx, expression(agenda(), 'onCreateTaskAtTime'))('2027-01-15', '13:45');
    assert.equal(f.ctx.renderUnifiedNoteEditor().props.visible, false);
    assert.equal(f.ctx.calOpen, true);
    assert.equal(f.ctx.calendarSlotDraftRef.current, null);
    assert.equal(f.ctx.calendarSlotOpeningRef.current, false);
  });
}

for (const origin of ['list', 'calendar']) for (const destination of ['calendar', 'pending', 'archive']) {
  test(`${origin} saved editor callback preserves the existing ${destination} destination navigation`, async () => {
    const f = fixture(origin);
    await pressNotes(f, origin);
    const editor = assertComposer(f, origin, {});
    const draft = { ...model.noteDraft(), destination, title: 'Guardada', content: 'Contenido', dateISO: '2027-01-21', time: '18:37' };
    const entry = model.buildNoteEntry(draft, f.scope);
    editor.props.onClose({ saved: true, draft });
    assert.equal(f.ctx.unifiedNoteOriginRef.current, origin, 'native dismissal must retain the source until onSaved');
    editor.props.onSaved(entry, 'Nota guardada.');
    assert.equal(f.ctx.notesOpen, false);
    assert.equal(f.ctx.unifiedNoteOriginRef.current, 'landing');
    assert.deepEqual(f.calls.filter(call => call[0] === 'toast'), [['toast', 'Nota guardada.', 'success']]);
    if (origin === 'list') {
      assert.equal(f.ctx.listOpen, true);
      assert.equal(f.ctx.calOpen, false);
      assert.equal(f.calls.some(call => call[0] === 'calScrollToDateTarget'), false);
    } else {
      assert.equal(f.ctx.calOpen, true);
      assert.equal(f.ctx.calHighlightEntryId, entry.id);
      assert.equal(f.ctx.calScrollToDateTarget.destination, destination);
      assert.equal(f.ctx.calScrollToDateTarget.entryId, entry.id);
      assert.equal(f.ctx.calScrollToDateTarget.dateISO, destination === 'calendar' ? '2027-01-21' : '');
      assert.equal(f.ctx.calScrollToDateTarget.timeHHMM, destination === 'calendar' ? '18:37' : '');
    }
  });
}

for (const active of ['isActivelyCreating', 'categorySelected']) {
  test(`external notes retain direct GO attachment when ${active}, without mounting either form`, () => {
    const f = fixture('list');
    loadFunctions(f.ctx, ['openFieldSelector']);
    f.ctx[active] = true;
    f.ctx.openQuickNoteFrom('list', 'NOTA_EXTERNA', 'Avisar al cliente', '2027-01-15');
    assert.equal(f.ctx.attachedExternalNote.title, 'Avisar al cliente');
    assert.equal(f.ctx.attachedExternalNote.detail, '');
    assert.equal(f.ctx.noteTaskDraftRef.current, null);
    assert.equal(f.ctx.renderUnifiedNoteEditor().props.visible, false);
    assert.equal(f.ctx.fieldSelectorOpen, false);
    assert.equal(f.ctx.listOpen, true);
    assert.ok(!f.calls.some(call => ['fieldSelectorOpen', 'notesOpen', 'quickCreateOpen', 'calQuickCreateOpen'].includes(call[0]) && call[1] === true));
    assert.deepEqual(f.calls.filter(call => call[0] === 'remove-draft'), [['remove-draft', 'go_task_draft_v1']]);
  });
}

test('an external note without an active GO still opens the shared editor with its supplied title and date', () => {
  const f = fixture('list');
  f.ctx.openQuickNoteFrom('list', 'NOTA_EXTERNA', 'Llamar al taller', '2027-01-20');
  assertComposer(f, 'list', { title: 'Llamar al taller', dateISO: '2027-01-20' });
});

for (const target of ['card', 'title']) for (const kind of ['current', 'legacy-internal', 'legacy-external']) {
  test(`Listados ${target} JSX opens the existing ${kind} note in the shared editor`, () => {
    const f = fixture('list');
    const current = model.buildNoteEntry({ ...model.noteDraft(), destination: 'pending', content: 'Nota existente' }, f.scope);
    const entry = kind === 'current' ? current : {
      id: kind, kind: 'sent', type: kind === 'legacy-internal' ? 'TAREA_INTERNA' : 'TAREA',
      intentKey: kind === 'legacy-internal' ? 'nota_interna' : 'nota_externa',
      ownerUserId: f.scope.userId, taskContext: f.scope.context, notes: 'Nota anterior', detail: 'Texto anterior', dateISO: '', time: '',
    };
    f.ctx.g = entry;
    const found = jsxNodes().filter(node => attribute(node, 'testID')?.initializer?.getText(ast) === `{"list-entry-${target}-"+g.id}`);
    assert.equal(found.length, 1, 'one real per-entry JSX callback');
    valueOf(f.ctx, expression(found[0], 'onPress'))();
    assertComposer(f, 'list', {}, entry);
  });
}

for (const target of ['card', 'title']) {
  test(`Listados ${target} JSX rejects a foreign note before mounting the editor`, () => {
    const f = fixture('list');
    f.ctx.g = model.buildNoteEntry({ ...model.noteDraft(), destination: 'pending', content: 'Privada' }, { ...f.scope, userId: 'other-user' });
    const found = jsxNodes().filter(node => attribute(node, 'testID')?.initializer?.getText(ast) === `{"list-entry-${target}-"+g.id}`);
    assert.equal(found.length, 1);
    valueOf(f.ctx, expression(found[0], 'onPress'))();
    assert.equal(f.ctx.renderUnifiedNoteEditor().props.visible, false);
    assert.equal(f.ctx.listOpen, true);
    assert.equal(f.calls.filter(call => call[0] === 'toast' && call[2] === 'error').length, 1);
  });
}
