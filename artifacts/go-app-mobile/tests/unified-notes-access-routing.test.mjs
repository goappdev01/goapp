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
function mountedControl(root, id) {
  if (root.attributes?.['data-testid'] === id) return root;
  for (const child of root.childNodes || []) {
    const match = mountedControl(child, id);
    if (match) return match;
  }
  return null;
}
function mountedAncestor(node, attribute, value) {
  for (let current = node?.parentNode; current; current = current.parentNode)
    if (current.attributes?.[attribute] === value) return current;
  return null;
}

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
    isGoNoteReminderTarget: tools.isGoNoteReminderTarget, isArchivedNote: model.isArchivedNote,
    listFilter: 'propuesta', typeFilter: 'GO', activityFilter: 'comida', llamadasListOpen: true,
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
    'calScrollToDateTarget', 'calHighlightEntryId', 'quickNoteText', 'quickNoteDetail', 'goNoteContext',
    'listFilter', 'typeFilter', 'activityFilter', 'llamadasListOpen']) {
    ctx[`set${state[0].toUpperCase()}${state.slice(1)}`] = value => {
      ctx[state] = typeof value === 'function' ? value(ctx[state]) : value;
      calls.push([state, h.plain(ctx[state])]);
    };
  }
  loadFunctions(ctx, ['openUnifiedNote', 'openUnifiedNoteComposer', 'openQuickNoteFrom', 'openCalendarNote', 'openListNote',
    'openCalendarDayNote', 'openCalendarSlotTask', 'openListSavedNote', 'handleUnifiedNoteSaved', 'openSavedNoteDestination',
    'cacheNoteDraft', 'renderUnifiedNoteEditor', 'isEditableListNote', 'isPendingListEntry', 'clearClassicListFilters']);
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
    noteKeyboardScroll: false, expandToSafeTop:true, kbVisible: false, nativeScrollGesture: {},
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
      assert.equal(f.ctx.listFilter, 'todos');
      assert.equal(f.ctx.typeFilter, 'todos');
      assert.equal(f.ctx.activityFilter, 'todas');
      assert.equal(f.ctx.llamadasListOpen, false);
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

test('a note opened from Listados while GO is active remains in the shared editor', () => {
  const f = fixture('list');
  f.ctx.isActivelyCreating = true;
  f.ctx.openQuickNoteFrom('list', 'NOTA_EXTERNA', 'Avisar al cliente', '2027-01-15');
  assertComposer(f, 'list', { title: 'Avisar al cliente', dateISO: '2027-01-15' });
  assert.equal(f.ctx.fieldSelectorOpen, false);
});

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

function goComposerFixture() {
  const f = fixture('landing');
  let draftNumber = 0;
  Object.assign(f.ctx, {
    goView: { view: 'ADMIN' }, adminAccess: { allowed: true, checking: false, userId: f.scope.userId },
    isActivelyCreating: true, goNoteContext: null, goNoteContextRef: { current: null },
    goAttachmentAllowedRef: { current: true }, goNoteDiscardingRef: { current: false }, goNoteDiscarding: false,
    goNoteTargetActiveRef: { current: true }, goPhase: 'creating', categorySelected: true, intentIndex: 0,
    INTENTS: [{ key: 'reunion' }, { key: 'comida' }, { key: 'cafe' }], otroSelected: false, customOtroLabel: '',
    phone: '+34600000001', multiMode: false, multiRecipients: [],
    makeUid: () => 'active-go-' + ++draftNumber,
    TouchableOpacity: 'TouchableOpacity', Feather: 'Feather', Text: 'Text', StatusPill: 'StatusPill',
    goButtonColor: '#1e40af', intentTextOnWhite: '#1e40af',
    setGoNoteDiscarding: value => { f.ctx.goNoteDiscarding = value; },
    proposalModeRef: { current: false }, genericMode: false, activeLabelUpper: 'REUNIÓN', selectedSugerencia: null,
    notesDraft: '', place: '', coords: null, date: '15/01/2027', time: '18:00', duration: '', shareRoute: false, t: key => key,
  });
  loadFunctions(f.ctx, ['normalizePhoneForWhatsApp', 'hasActiveGoNoteTarget', 'openLandingNote',
    'canAttachNoteToGo', 'updateGoNoteContext', 'getOrStartGoNoteContext',
    'currentGoAttachmentEntry', 'currentGoAttachment', 'stageGoNote', 'openComposeGoNote', 'renderComposeGoNote', 'buildMessage']);
  return f;
}
function pressLandingSatellite(f) {
  const satellite = findAll(node => ts.isObjectLiteralExpression(node) && node.properties.some(prop =>
    ts.isPropertyAssignment(prop) && prop.name.getText(ast) === 'key' && prop.initializer.getText(ast) === '"bell"'));
  assert.equal(satellite.length, 1);
  const press = satellite[0].properties.find(prop => prop.name?.getText(ast) === 'onPress');
  valueOf(f.ctx, press.initializer)();
}

test('the actual NOTA satellite requires both a selected action and a valid recipient before attaching', () => {
  for (const [categorySelected, phone, goPhase, view, expected] of [
    [false, '', 'creating', 'ADMIN', false], [true, '', 'creating', 'ADMIN', false],
    [false, '+34600000001', 'creating', 'ADMIN', false], [true, '123', 'creating', 'ADMIN', false],
    [true, '+34600000001', 'creating', 'ADMIN', true], [true, '+34600000001', 'executing', 'ADMIN', false],
    [true, '+34600000001', 'receiving', 'ADMIN', false], [true, '+34600000001', 'creating', 'USER', false],
  ]) {
    const f = goComposerFixture(), { ctx } = f;
    Object.assign(ctx, { categorySelected, phone, goPhase, goView: { view }, getGoLogSnapshot: () => [] });
    pressLandingSatellite(f);
    assert.equal(ctx.renderUnifiedNoteEditor().props.goAttachment, expected);
    assert.equal(!!ctx.renderComposeGoNote(), expected);
    if (!expected) assert.deepEqual(h.plain(ctx.unifiedNoteSeed), {});
  }
});

test('a temporary contact/action removal preserves the same attached note, while GO reset restores standalone creation', () => {
  const f = goComposerFixture(), { ctx } = f;
  let rows = [];
  ctx.getGoLogSnapshot = () => rows;
  pressLandingSatellite(f);
  const contextId = ctx.goNoteContextRef.current.id;
  const saved = { ...model.buildNoteEntry({ ...model.noteDraft(), destination: 'go', content: 'Conservada' }, f.scope), noteLinkedEntryId: contextId };
  rows = [saved];
  ctx.notesOpen = false;
  ctx.intentIndex = 1;
  ctx.renderComposeGoNote().props.onPress();
  assert.equal(ctx.renderUnifiedNoteEditor().props.initial.id, saved.id);
  ctx.notesOpen = false;
  for (const missing of ['phone', 'categorySelected']) {
    const old = ctx[missing];
    ctx[missing] = missing === 'phone' ? '' : false;
    pressLandingSatellite(f);
    assert.equal(ctx.renderUnifiedNoteEditor().props.goAttachment, false);
    assert.equal(ctx.goNoteContextRef.current.id, contextId);
    ctx.notesOpen = false; ctx[missing] = old;
    pressLandingSatellite(f);
    assert.equal(ctx.renderUnifiedNoteEditor().props.initial.id, saved.id);
    ctx.notesOpen = false;
  }
  for (const name of ['resetContactFields', 'resetAdvancedDrafts']) {
    const node = findAll(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name)[0];
    const install = current => {
      if (ts.isIdentifier(current) && /^set[A-Z]/.test(current.text)) {
        const field = current.text.slice(3,4).toLowerCase() + current.text.slice(4);
        ctx[current.text] = value => { ctx[field] = value; };
      }
      ts.forEachChild(current, install);
    };
    install(node);
    loadFunctions(ctx, [name]);
    Object.assign(ctx, { categorySelected: true, phone: '+34600000001', goNoteContext: { id: contextId, scope: f.scope } });
    ctx.goNoteContextRef.current = ctx.goNoteContext;
    ctx[name]();
    assert.equal(ctx.goNoteContextRef.current, null);
    pressLandingSatellite(f);
    assert.equal(ctx.renderUnifiedNoteEditor().props.goAttachment, false);
    assert.equal(rows[0].note.content, 'Conservada');
    ctx.notesOpen = false;
  }
});

test('ADMIN can attach one existing standalone note while preserving its own destination', () => {
  const f = goComposerFixture();
  const entry = model.buildNoteEntry({ ...model.noteDraft(), title: 'Aviso', destination: 'pending', content: 'Texto adjunto' }, f.scope);
  const other = { ...entry, id: 'other-note' };
  f.ctx.getGoLogSnapshot = () => [entry, other];
  assert.equal(f.ctx.stageGoNote(entry), true);
  assert.equal(f.ctx.stageGoNote(other), false);
  f.ctx.renderComposeGoNote().props.onPress();
  const editor = assertComposer(f, 'landing', { goDraftId: 'active-go-1' }, entry);
  assert.equal(editor.props.goAttachment, true);
  assert.equal(entry.note.destination, 'pending');
  assert.deepEqual(h.plain(f.ctx.currentGoAttachment()), { id: entry.id, title: 'Aviso', detail: 'Texto adjunto' });
  f.ctx.goView.view = 'USER';
  assert.equal(f.ctx.renderComposeGoNote(), null);
  assert.equal(f.ctx.stageGoNote(entry), false);
  assert.equal(f.ctx.currentGoAttachment(), null);
  f.ctx.goView.view = 'ADMIN';
  f.ctx.noteIdentityRef.current = { ready: true, scope: { ...f.scope, context: 'other' } };
  assert.equal(f.ctx.currentGoAttachment(), null);
  assert.equal(f.ctx.stageGoNote(entry), false);
});

test('both GO note states use the same live category pill as Contacto, Ubicación and Fecha', () => {
  const f = goComposerFixture(), { ctx } = f;
  Object.assign(ctx, { View: 'View', styles: { statusPill: { maxWidth: '100%', gap: 6 },
    statusPillText: { fontSize: 12, fontWeight: '700', maxWidth: 220 } } });
  loadFunctions(ctx, ['StatusPill', 'isLightHex']);
  const palette = valueOf(ctx, findAll(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'GO_COLORS')[0].initializer);
  const contrast = findAll(node => ts.isVariableDeclaration(node) && node.name.getText(ast) === 'intentTextOnWhite')[0].initializer;
  const entry = model.buildNoteEntry({ ...model.noteDraft(), title: 'Nota conservada', destination: 'pending', content: 'Texto íntegro' }, f.scope);
  ctx.getGoLogSnapshot = () => [entry];
  for (const attached of [false, true]) {
    if (attached) assert.equal(ctx.stageGoNote(entry), true);
    for (const category of Object.keys(palette)) for (const handedness of ['left', 'right']) {
      Object.assign(ctx, { handedness, activeIntentColor: palette[category], goButtonColor: palette[category] });
      ctx.intentTextOnWhite = valueOf(ctx, contrast);
      const button = ctx.renderComposeGoNote();
      const pill = nodes(button, node => node.type === ctx.StatusPill)[0];
      assert.equal(pill.props.color, palette[category]);
      assert.equal(pill.props.fg, ctx.intentTextOnWhite);
      assert.equal(pill.props.wrapText, true);
      assert.equal(pill.props.text, attached ? 'NOTA ADJUNTADA · EDITAR' : 'Adjuntar nota GO');
      assert.equal(pill.props.icon, attached ? 'edit-2' : 'paperclip');
      const rendered = ctx.StatusPill(pill.props);
      const reference = ctx.StatusPill({ icon: 'user', text: 'Contacto', color: ctx.goButtonColor, fg: ctx.intentTextOnWhite });
      assert.deepEqual(h.plain(rendered.props.style), h.plain(reference.props.style));
      assert.equal(rendered.children[0].props.color, reference.children[0].props.color);
      assert.equal(rendered.children[1].props.numberOfLines, undefined, 'full note label can wrap within narrow iPhones');
      assert.equal(reference.children[1].props.numberOfLines, 1, 'other pills preserve their approved rendering');
      assert.equal(button.props.style.maxWidth, '100%');
      assert.equal(button.props.style.flexShrink, 1);
      assert.equal(button.props.style.minHeight, 44);
      if (attached) assert.equal(ctx.currentGoAttachment().detail, 'Texto íntegro');
    }
  }
});

test('the real GO compose button creates one attached note, reopens it, and sends its updated text only', async () => {
  const disk = await h.diskFixture();
  let ui;
  try {
    const f = goComposerFixture(), { ctx } = f;
    const asset = await disk.sourceFile();
    Object.assign(ctx, { getGoLogSnapshot: () => disk.store.getGoLogSnapshot(), saveUnifiedNote: disk.api().saveUnifiedNote,
      watchNoteReminderReceipt() {} });
    loadFunctions(ctx, ['saveNoteDraft']);
    const label = control => nodes(control, node => node.type === 'StatusPill')[0].props.text;
    assert.equal(label(ctx.renderComposeGoNote()), 'Adjuntar nota GO');
    pressLandingSatellite(f); pressLandingSatellite(f);
    let editor = assertComposer(f, 'landing', { goDraftId: 'active-go-1' });
    ui = await h.editorFixture({ ...editor.props, ports: {
      documents: { getDocumentAsync: async () => ({ canceled: false, assets: [asset] }) }, importFile: disk.fileApi.importNoteFile,
    } });
    assert.ok(ui.hosts.has('note-go-target'));
    await ui.run(() => ui.hosts.get('note-title').onChangeText('Aviso'));
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Primera versión'));
    await ui.tap('note-tools-toggle');
    assert.ok(ui.hosts.has('note-option-attachments'));
    assert.equal(ui.hosts.has('note-destinations'), false);
    await ui.tool('attachments');
    await ui.tap('PDF o documento');
    await ui.idle();
    const save = ui.hosts.get('unified-note-save').onPress;
    await ui.run(() => { save(); save(); });
    await ui.idle();
    assert.equal(disk.rows.length, 1);
    const [saved] = disk.rows;
    assert.equal(saved.note.destination, 'go');
    assert.equal(saved.noteLinkedEntryId, 'active-go-1');
    assert.equal(saved.dateISO, '');
    assert.equal(saved.time, '');
    assert.equal(saved.note.attachments.length, 1);
    assert.equal(model.noteEntryDestination(saved), null);
    assert.equal(disk.refreshes.length, 0);
    assert.throws(() => navigation.savedNoteTarget(saved, disk.scope, 0));
    await ui.dismissSaved();
    await ui.close(); ui = null;
    assert.equal(ctx.notesOpen, false);
    assert.equal(ctx.calOpen, false);
    assert.equal(ctx.goNoteContextRef.current.id, 'active-go-1');
    assert.equal(label(ctx.renderComposeGoNote()), 'NOTA ADJUNTADA · EDITAR');
    assert.equal(ctx.buildMessage().includes('Primera versión'), true);

    const second = disk.draft({ destination: 'go', content: 'No es una segunda nota' });
    await assert.rejects(disk.api().saveUnifiedNote(second, disk.scope, disk.active, 'active-go-1'), /ya tiene una nota/);
    await assert.rejects(disk.api().saveUnifiedNote(second, disk.scope, disk.active), /GO al que pertenece/);
    await assert.rejects(disk.api().saveUnifiedNote({ ...model.noteDraft(saved), destination: 'archive' }, disk.scope, disk.active), /cambiar el destino/);
    ctx.renderComposeGoNote().props.onPress();
    editor = assertComposer(f, 'landing', { goDraftId: 'active-go-1' }, disk.store.getGoLogSnapshot()[0]);
    assert.equal(editor.props.initial.id, saved.id);
    ui = await h.editorFixture(editor.props);
    assert.equal(ui.hosts.get('note-content').value, 'Primera versión');
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Texto actualizado'));
    await ui.tap('unified-note-save');
    await ui.idle();
    await ui.dismissSaved();
    const [changed] = await disk.reopen();
    assert.equal(disk.rows.length, 1);
    assert.equal(changed.id, saved.id);
    assert.equal(changed.noteLinkedEntryId, saved.noteLinkedEntryId);
    assert.deepEqual(h.plain(changed.note.attachments), h.plain(saved.note.attachments));
    pressLandingSatellite(f);
    assert.equal(ctx.renderUnifiedNoteEditor().props.initial.id, changed.id);
    assert.equal(ctx.renderUnifiedNoteEditor().props.initial.note.content, 'Texto actualizado');
    ctx.notesOpen = false;
    const message = ctx.buildMessage();
    assert.equal(message.split('Aviso — Texto actualizado').length, 2);
    assert.doesNotMatch(message, /Primera versión|documento\.pdf|file:/);
    assert.equal(ctx.currentGoAttachment().id, saved.id);
    const outgoing = { id: 'sent-go', ownerUserId: disk.scope.userId, taskContext: disk.scope.context, attachedNoteId: saved.id };
    assert.equal(model.linkedNotesForEntry([changed], outgoing, disk.scope).length, 1);
    ctx.updateGoNoteContext(null);
    assert.equal(ctx.currentGoAttachment(), null);
    ctx.renderComposeGoNote().props.onPress();
    assertComposer(f, 'landing', { goDraftId: 'active-go-2' });
  } finally { if (ui) await ui.close(); disk.close(); }
});

test('a GO reset or loss of ADMIN access prevents a stale editor from writing', async () => {
  const f = goComposerFixture(), { ctx } = f;
  Object.assign(ctx, { getGoLogSnapshot: () => [], saveUnifiedNote: () => assert.fail('invalid compose scope must not persist') });
  loadFunctions(ctx, ['saveNoteDraft']);
  ctx.renderComposeGoNote().props.onPress();
  const editor = assertComposer(f, 'landing', { goDraftId: 'active-go-1' });
  const draft = { ...model.noteDraft(), destination: 'go', content: 'Nota privada' };
  ctx.goAttachmentAllowedRef.current = false;
  await assert.rejects(editor.props.onSave(draft), /ya no está disponible/);
  ctx.goAttachmentAllowedRef.current = true;
  ctx.updateGoNoteContext(null);
  await assert.rejects(editor.props.onSave(draft), /ya no está disponible/);
});

function installDiscardCallbacks(f, disk) {
  const { ctx } = f;
  ctx.getGoLogSnapshot = () => disk.store.getGoLogSnapshot();
  ctx.discardUnifiedNoteDraft = disk.api().discardUnifiedNoteDraft;
  ctx.discardExclusiveGoNote = disk.api().discardExclusiveGoNote;
  ctx.alerts = [];
  ctx.Alert = { alert: (title, message, buttons) => ctx.alerts.push({ title, message, buttons }) };
  loadFunctions(ctx, ['currentGoNoteDraft', 'clearNoteRecovery', 'discardNewNoteDraft',
    'discardComposeGoNote', 'renderComposeGoNoteDiscard']);
}

test('the actual Landing satellite shows draft trash immediately, preserves normal close and discards recovery and files', async () => {
  const disk = await h.diskFixture();
  let ui;
  try {
    const f = goComposerFixture(), { ctx } = f;
    ctx.categorySelected = false; ctx.phone = '';
    installDiscardCallbacks(f, disk);
    const other = await disk.api().saveUnifiedNote(disk.draft({ content: 'Otra nota guardada' }), disk.scope, disk.active);
    const asset = await disk.sourceFile();
    pressLandingSatellite(f);
    const ports = { documents: { getDocumentAsync: async () => ({ canceled: false, assets: [asset] }) }, importFile: disk.fileApi.importNoteFile };
    ui = await h.editorFixture({ ...ctx.renderUnifiedNoteEditor().props, ports });
    assert.equal(ui.hosts.has('note-draft-discard-row'),false);
    assert.equal(ui.hosts.get('note-discard').disabled, false);
    assert.equal(ui.hosts.has('note-destination-selected'), false);
    const trashElement = mountedControl(ui.container, 'note-discard');
    assert.ok(trashElement);
    assert.ok(mountedAncestor(trashElement,'data-testid','note-editor-footer'));
    assert.equal(mountedAncestor(trashElement,'data-testid','note-tools-panel'), null);
    assert.equal(mountedAncestor(trashElement,'data-testid','unified-note-scroll'), null);
    await ui.run(() => ui.hosts.get('note-title').onChangeText('Borrador'));
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Texto recuperable'));
    await ui.tool('attachments'); await ui.tap('PDF o documento'); await ui.idle();
    await ui.exit();
    const draft = ctx.unifiedNoteCache.current.draft;
    const uri = draft.attachments[0].uri;
    assert.equal(draft.content, 'Texto recuperable');
    assert.equal(await disk.fileApi.verifyNoteFiles(disk.scope, draft.id, draft.attachments), undefined);
    await ui.close(); ui = null;
    pressLandingSatellite(f);
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    assert.equal(ui.hosts.get('note-content').value, 'Texto recuperable');
    const trash = ui.hosts.get('note-discard').onPress;
    await ui.run(() => { trash(); trash(); });
    await ui.idle();
    assert.equal(ui.alerts.length, 0);
    assert.equal(ctx.notesOpen, false);
    assert.equal(ctx.unifiedNoteCache.current, null);
    assert.equal(ctx.unifiedNoteEditCache.current.size, 0);
    assert.equal(fs.existsSync(new URL(uri)), false);
    assert.equal((await disk.reopen())[0].id, other.entry.id);
    await ui.close(); ui = null;
    pressLandingSatellite(f);
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    assert.equal(ui.hosts.get('note-title').value, '');
    assert.equal(ui.hosts.get('note-content').value, '');
  } finally { if (ui) await ui.close(); disk.close(); }
});

test('standalone draft trash shares the compact footer with keyboard, text scaling and either hand', async () => {
  for (const handedness of ['left','right']) for (const width of [320,390,430]) for (const keyboardVisible of [false,true]) {
    const ui = await h.editorFixture({ handedness, onDiscard: async()=>{}, ports: {
      keyboardVisible, viewport: { width, height: width===320?568:932, scale:3, fontScale:1.5 },
    } });
    try {
      assert.equal(ui.hosts.has('note-draft-discard-row'),false);
      const footer=ui.hosts.get('note-editor-footer');
      assert.deepEqual(footer.children.map(child=>child.props.testID||'close'),['note-discard','unified-note-save','note-microphone','note-navigation-slot']);
      const footerStyle=Object.assign({},...footer.style.flat(Infinity).filter(Boolean));
      assert.equal(footerStyle.flexDirection,handedness==='right'?'row':'row-reverse');
      assert.equal(ui.hosts.get('note-discard').style.width,44);
      assert.ok(ui.hosts.get('note-discard').style.minHeight>=44);
      assert.equal(ui.hosts.get('note-discard').children.props.size,28);
      assert.doesNotMatch(ui.container.textContent,/DESCARTAR BORRADOR/);
      assert.equal(ui.hosts.get('note-navigation-back').touchSize,56);
      assert.equal(ui.hosts.get('unified-note-save').style.flex,1);
      const button = mountedControl(ui.container, 'note-discard');
      assert.ok(button);
      assert.ok(mountedAncestor(button,'data-native','KeyboardFrame'));
      assert.ok(mountedAncestor(button,'data-testid','note-editor-footer'));
      assert.equal(mountedAncestor(button,'data-testid','note-tools-panel'),null);
      await ui.tap('note-tools-toggle');
      for(const destination of ['calendar','pending','archive'])assert.ok(ui.hosts.has('note-destination-'+destination));
      assert.ok(ui.hosts.has('note-discard'));
    } finally { await ui.close(); }
  }
});

test('discarding from the real satellite starts a new blank draft even when the same editor remains mounted', async () => {
  const disk = await h.diskFixture();
  let ui;
  try {
    const f = goComposerFixture(), { ctx } = f;
    ctx.categorySelected=false;ctx.phone='';
    installDiscardCallbacks(f,disk);
    const ids=[];
    const props=()=>{
      const editor=ctx.renderUnifiedNoteEditor().props;
      return {...editor,onDiscard:async draft=>{ids.push(draft.id);await editor.onDiscard(draft);}};
    };
    pressLandingSatellite(f);
    ui=await h.editorFixture(props());
    for(let cycle=0;cycle<3;cycle++){
      await ui.run(()=>ui.hosts.get('note-title').onChangeText('Título '+cycle));
      await ui.run(()=>ui.hosts.get('note-content').onChangeText('Texto descartado '+cycle));
      await ui.destination('pending');
      await ui.tap('note-discard');await ui.idle();
      assert.equal(ctx.notesOpen,false);
      assert.equal(ctx.unifiedNoteCache.current,null);
      await ui.render(props());
      pressLandingSatellite(f);
      await ui.render(props());
      assert.equal(ui.hosts.get('note-title').value,'');
      assert.equal(ui.hosts.get('note-content').value,'');
      await ui.tap('note-tools-toggle');
      assert.equal(ui.hosts.has('note-destination-selected'),false);
      await ui.tap('note-tools-toggle');
    }
    assert.equal(new Set(ids).size,3);
    await ui.run(()=>ui.hosts.get('note-content').onChangeText('Cerrar conserva'));
    await ui.back();
    assert.equal(ctx.notesOpen,false);
    const retainedId=ctx.unifiedNoteCache.current.draft.id;
    await ui.render(props());
    pressLandingSatellite(f);await ui.render(props());
    assert.equal(ui.hosts.get('note-content').value,'Cerrar conserva');
    await ui.close();ui=null;
    ui=await h.editorFixture(props());
    assert.equal(ui.hosts.get('note-content').value,'Cerrar conserva');
    await ui.tap('note-discard');await ui.idle();
    assert.equal(ids.at(-1),retainedId);
    await ui.close();ui=null;
    pressLandingSatellite(f);ui=await h.editorFixture(props());
    assert.equal(ui.hosts.get('note-title').value,'');
    assert.equal(ui.hosts.get('note-content').value,'');
    assert.equal(disk.rows.length,0);
  }finally{if(ui)await ui.close();disk.close();}
});

test('GO trash discards a partial draft, removes one exclusive note, and preserves the action and sent history', async () => {
  const disk = await h.diskFixture();
  let ui;
  try {
    const f = goComposerFixture(), { ctx } = f;
    installDiscardCallbacks(f, disk);
    Object.assign(ctx, { saveUnifiedNote: disk.api().saveUnifiedNote, watchNoteReminderReceipt() {} });
    loadFunctions(ctx, ['saveNoteDraft']);
    const action = () => [ctx.phone, ctx.categorySelected, ctx.intentIndex, ctx.date, ctx.time];
    const original = action();
    pressLandingSatellite(f);
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Borrador GO descartado'));
    await ui.exit();
    assert.ok(ctx.currentGoNoteDraft());
    ctx.renderComposeGoNoteDiscard().props.onPress();
    for (let i=0;i<20;i++) await h.settle(() => new Promise(setImmediate));
    assert.equal(ctx.alerts.length, 0);
    assert.equal(ctx.currentGoNoteDraft(), undefined);
    assert.deepEqual(action(), original);
    await ui.close(); ui = null;
    ctx.renderComposeGoNote().props.onPress();
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    assert.equal(ui.hosts.get('note-content').value, '');
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Adjunta guardada'));
    await ui.tap('unified-note-save'); await ui.idle(); await ui.dismissSaved();
    const saved = disk.rows[0];
    ctx.goNoteDiscardingRef.current = true;
    assert.doesNotMatch(ctx.buildMessage(), /Adjunta guardada/);
    ctx.goNoteDiscardingRef.current = false;
    await ui.close(); ui = null;
    ctx.renderComposeGoNoteDiscard().props.onPress();
    assert.equal(ctx.alerts.length, 1);
    assert.equal(disk.rows[0].deleted, undefined);
    ctx.alerts[0].buttons[0].onPress?.();
    assert.equal(ctx.currentGoAttachment().id, saved.id);
    ctx.alerts[0].buttons.at(-1).onPress();
    for(let i=0;i<20;i++) await h.settle(() => new Promise(setImmediate));
    assert.equal(disk.rows[0].deleted, true);
    assert.equal(disk.rows[0].noteLinkedEntryId, undefined);
    assert.equal(ctx.currentGoAttachment(), null);
    assert.doesNotMatch(ctx.buildMessage(), /Adjunta guardada|Borrador GO descartado/);
    assert.deepEqual(action(), original);
    pressLandingSatellite(f);
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Nueva nota GO'));
    await ui.tap('unified-note-save'); await ui.idle(); await ui.dismissSaved();
    const replacement = disk.rows.find(row => !row.deleted);
    assert.notEqual(replacement.id, saved.id);
    await ui.close(); ui = null;
    pressLandingSatellite(f);
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    await ui.tap('note-discard');
    assert.equal(ui.alerts.length, 1);
    await ui.run(() => ui.alerts[0].buttons.at(-1).onPress());
    await ui.idle();
    assert.equal(ctx.notesOpen, false);
    assert.equal(ctx.currentGoAttachment(), null);
    assert.equal(disk.rows.filter(row => !row.deleted).length, 0);
    assert.deepEqual(action(), original);
  } finally { if(ui) await ui.close(); disk.close(); }
});

test('unlinking an existing independent note preserves its record, files and destination', async () => {
  const disk = await h.diskFixture();
  let ui;
  try {
    const f = goComposerFixture(), { ctx } = f;
    installDiscardCallbacks(f, disk);
    const draft = disk.draft({ content: 'Original independiente', destination: 'pending' });
    draft.attachments = [await disk.fileApi.importNoteFile(disk.scope, draft.id, await disk.sourceFile())];
    const saved = await disk.api().saveUnifiedNote(draft, disk.scope, disk.active);
    const independentCacheKey = JSON.stringify(disk.scope)+":"+saved.entry.id;
    const independentDraft = { ...model.noteDraft(saved.entry), content: 'Edición independiente recuperable' };
    ctx.unifiedNoteEditCache.current.set(independentCacheKey, independentDraft);
    assert.equal(ctx.stageGoNote(saved.entry), true);
    ctx.renderComposeGoNote().props.onPress();
    ui = await h.editorFixture(ctx.renderUnifiedNoteEditor().props);
    await ui.tap('note-discard');
    assert.equal(ui.alerts.length, 1);
    await ui.run(() => ui.alerts[0].buttons.at(-1).onPress()); await ui.idle();
    assert.equal(ctx.currentGoAttachment(), null);
    const rows = await disk.reopen();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].id, saved.entry.id);
    assert.equal(rows[0].note.destination, 'pending');
    assert.equal(rows[0].note.content, 'Original independiente');
    assert.equal(rows[0].deleted, undefined);
    assert.equal(ctx.unifiedNoteEditCache.current.get(independentCacheKey).content, 'Edición independiente recuperable');
    await disk.fileApi.verifyNoteFiles(disk.scope, rows[0].id, rows[0].note.attachments);
    assert.doesNotMatch(ctx.buildMessage(), /Original independiente/);
  } finally { if(ui)await ui.close(); disk.close(); }
});

test('failed or foreign-context discard preserves recovery and refuses to remove a committed note as a draft', async () => {
  const disk = await h.diskFixture();
  try {
    const draft = disk.draft();
    const result = await disk.api().saveUnifiedNote(draft, disk.scope, disk.active);
    await assert.rejects(disk.api().discardUnifiedNoteDraft(draft, disk.scope, disk.active), /ya está guardada/);
    await assert.rejects(disk.api().discardExclusiveGoNote(result.entry.id, 'wrong-go', disk.scope, disk.active), /verificar/);
    await assert.rejects(disk.api().discardUnifiedNoteDraft(disk.draft(), disk.scope, () => false), /contexto/);
    assert.equal(disk.rows[0].deleted, undefined);
  } finally { disk.close(); }
});

test('removing a GO attachment preserves the content and reference already used in sent history', async () => {
  const disk = await h.diskFixture();
  try {
    const result = await disk.api().saveUnifiedNote(disk.draft({ destination: 'go', content: 'Texto enviado' }), disk.scope, disk.active, 'sent-context');
    const sent = { id: 'sent-go-history', attachedNoteId: result.entry.id, attachedNote: 'Texto enviado', estado: 'pendiente' };
    await disk.store.updateGoLog(rows => ({ entries: [...rows, sent], result: undefined }));
    await disk.api().discardExclusiveGoNote(result.entry.id, 'sent-context', disk.scope, disk.active);
    const rows = await disk.reopen();
    assert.deepEqual(h.plain(rows.find(row => row.id === sent.id)), sent);
    assert.equal(rows.find(row => row.id === result.entry.id).note.content, 'Texto enviado');
    assert.equal(rows.find(row => row.id === result.entry.id).deleted, undefined);
  } finally { disk.close(); }
});

test('a discard failure keeps the editor content recoverable and allows an ordinary close', async () => {
  const ui = await h.editorFixture({ onDiscard: async () => { throw Error('No se pudo quitar el borrador'); } });
  try {
    await ui.run(() => ui.hosts.get('note-content').onChangeText('Contenido conservado'));
    await ui.tap('note-discard'); await ui.idle();
    assert.equal(ui.hosts.get('note-content').value, 'Contenido conservado');
    assert.ok(ui.hosts.has('note-save-error'));
    assert.equal(ui.calls.filter(call => call[0] === 'close').length, 0);
    await ui.exit();
    assert.equal(ui.calls.find(call => call[0] === 'close')[1].saved, false);
    assert.equal(ui.calls.find(call => call[0] === 'close')[1].draft.content, 'Contenido conservado');
  } finally { await ui.close(); }
});

test('the committed store permits only one simultaneous creation per GO and keeps other GOs separate', async () => {
  const disk = await h.diskFixture();
  try {
    const save = disk.api().saveUnifiedNote;
    const create = (parent, content) => save(disk.draft({ destination: 'go', content }), disk.scope, disk.active, parent);
    const raced = await Promise.allSettled([create('go-one', 'Primera'), create('go-one', 'Segunda')]);
    assert.deepEqual(raced.map(result => result.status).sort(), ['fulfilled', 'rejected']);
    assert.match(raced.find(result => result.status === 'rejected').reason.message, /ya tiene una nota/);
    const other = await create('go-two', 'Otro GO');
    const rows = await disk.reopen();
    assert.equal(rows.length, 2);
    assert.equal(rows.filter(entry => entry.noteLinkedEntryId === 'go-one').length, 1);
    assert.equal(rows.find(entry => entry.id === other.entry.id).noteLinkedEntryId, 'go-two');
  } finally { disk.close(); }
});
test('linked note survives local persistence and reopens only for the owning GO or reservation scope', async () => {
  const disk = await h.diskFixture();
  try {
    const parent = { id: 'reservation-fixture', type: 'GO_BOOKING', customerBooking: true,
      ownerUserId: disk.scope.userId, actionContext: disk.scope.context, estado: 'aceptado' };
    const draft = disk.draft({ content: 'Nota de reserva' });
    const saved = await disk.api().saveUnifiedNote(draft, disk.scope, disk.active, parent.id);
    await saved.reminderSync;
    const rows = await disk.reopen();
    assert.equal(rows[0].noteLinkedEntryId, parent.id);
    assert.equal(disk.model.linkedNotesForEntry(rows, parent, disk.scope)[0].id, saved.entry.id);
    assert.equal(disk.model.linkedNotesForEntry(rows, { ...parent, ownerUserId: 'other' }, disk.scope).length, 0);
    assert.equal(disk.model.linkedNotesForEntry(rows, { ...parent, actionContext: 'other' }, disk.scope).length, 0);
    const go = { ...parent, id: 'sent-go', customerBooking: false, type: 'GO', attachedNoteId: saved.entry.id };
    assert.equal(disk.model.linkedNotesForEntry(rows, go, disk.scope)[0].id, saved.entry.id);
    const edit = { ...disk.model.noteDraft(rows[0]), content: 'Actualizada' };
    const changed = await disk.api().saveUnifiedNote(edit, disk.scope, disk.active);
    assert.equal(changed.entry.noteLinkedEntryId, parent.id);
  } finally { disk.close(); }
});

test('the card note control opens the existing editor and consumes the press', () => {
  const f = fixture('list');
  const parent = { id: 'reservation-fixture', type: 'GO_BOOKING', customerBooking: true,
    ownerUserId: f.scope.userId, actionContext: f.scope.context, estado: 'aceptado' };
  const entry = { ...model.buildNoteEntry({ ...model.noteDraft(), destination: 'archive', content: 'Recuperable' }, f.scope), noteLinkedEntryId: parent.id };
  Object.assign(f.ctx, {
    personalGoLog: [], linkedNotesForEntry: model.linkedNotesForEntry, canReadBoardTask: () => true,
    Feather: 'Feather', Text: 'Text', TouchableOpacity: 'TouchableOpacity',
  });
  loadFunctions(f.ctx, ['canLinkNoteTo', 'renderLinkedNotes']);
  let stopped = 0;
  f.ctx.renderLinkedNotes(parent).props.onPress({ stopPropagation: () => stopped++ });
  assertComposer(f, 'list', { linkedEntryId: parent.id });
  f.ctx.personalGoLog = [entry];
  f.ctx.renderLinkedNotes(parent).props.onPress({ stopPropagation: () => stopped++ });
  assert.equal(f.ctx.renderUnifiedNoteEditor().props.initial.id, entry.id);
  assert.equal(stopped, 2);
  assert.equal(f.ctx.renderLinkedNotes({ ...parent, ownerUserId: 'other' }), null);
});
