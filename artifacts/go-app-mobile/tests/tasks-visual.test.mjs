import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const notesFixture = require('./tests/helpers/unified-note-fixture.cjs');
const source = readFileSync('app/index.tsx', 'utf8');
const home = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let match;
  ts.forEachChild(node, child => { if (!match) match = find(child, predicate); });
  return match;
}
function sheet(name) {
  return find(home, node => ts.isJsxElement(node) && node.openingElement.tagName.getText(home) === 'BottomSheet'
    && node.openingElement.attributes.properties.some(p => p.name?.text === 'visible' && p.initializer?.getText(home) === `{${name}}`));
}
function compile(text) {
  return ts.transpileModule(text, { compilerOptions: { esModuleInterop: false, alwaysStrict: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
}
const compactFormatter = find(home, node => ts.isFunctionDeclaration(node) && node.name?.text === 'formatCompactProposalSlot');
const detailsSource = readFileSync('components/GoEntryDetails.tsx', 'utf8');
const detailsAst = ts.createSourceFile('details.tsx', detailsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const sharedActionRow = find(detailsAst, node => ts.isFunctionDeclaration(node) && node.name?.text === 'GoListActionRow');
const sharedActionRowCode = compile(sharedActionRow.getText(detailsAst) + '\nglobalThis.GoListActionRow = GoListActionRow;');
assert.ok(compactFormatter, 'use the actual compact slot formatter');
const listFunctions = ['isPendingListEntry', 'clearClassicListFilters'].map(name =>
  find(home, node => ts.isFunctionDeclaration(node) && node.name?.text === name));
const listState = ['showClassicListFilters', 'listTypeFilter', 'listActivityFilter', 'listCallsOpen', 'filteredListEntries', 'listItemCount'].map(name =>
  'const ' + find(home, node => ts.isVariableDeclaration(node) && node.name?.getText(home) === name).getText(home) + ';');
const listCode = compile(['{', compactFormatter.getText(home), ...listFunctions.map(node => node.getText(home)), "const "+find(home,n=>ts.isVariableDeclaration(n)&&n.name.getText(home)==="RESERVAS_ORBITAL_CATS").getText(home)+";", ...listState,
  'itemCount = listItemCount;', `tree = (${sheet('listOpen').getText(home)});`, '}'].join('\n'));
const routeNames = ['isEditableListNote', 'openUnifiedNote', 'openUnifiedNoteComposer', 'openQuickNoteFrom', 'openCalendarNote', 'openListNote', 'openListSavedNote'];
const routes = routeNames.map(name => {
  const node = find(home, node => (ts.isFunctionDeclaration(node) || ts.isVariableDeclaration(node)) && node.name?.getText(home) === name);
  assert.ok(node, `execute the real ${name} route`);
  return { name, node, code: ts.isFunctionDeclaration(node) ? node.getText(home) : node.initializer.getText(home) };
});
const translationsContext = { exports: {} };
vm.runInNewContext(compile(readFileSync('i18n/translations.ts', 'utf8')), translationsContext);
const translations = translationsContext.exports.translations;
const completionContext = { exports: {} };
vm.runInNewContext(compile(readFileSync('lib/goActionCompletion.ts', 'utf8')), completionContext);
const completionModel = completionContext.exports;
const noteContext = { exports: {} }, toolsContext = { exports: {} };
vm.runInNewContext(compile(readFileSync('lib/unifiedNotes.ts', 'utf8')), noteContext);
vm.runInNewContext(compile(readFileSync('lib/goNoteTools.ts', 'utf8')), toolsContext);
const noteModel = noteContext.exports;
const presentationContext = { exports: {} }, policyContext = { exports: {} };
vm.runInNewContext(compile(readFileSync('data/goEntryPresentation.ts', 'utf8')), presentationContext);
vm.runInNewContext(compile(readFileSync('data/reservationCardPolicy.ts', 'utf8')), policyContext);
function nodes(tree, predicate) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(c => nodes(c, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const texts = tree => nodes(tree, n => n.type === 'Text').flatMap(n => n.props.children).filter(x => typeof x === 'string').join(' | ');
const childWith = (tree, text) => nodes(tree, n => ['TouchableOpacity', 'Pressable'].includes(n.type) && texts(n) === text)[0];
const listControl = (tree, label) => nodes(tree.props.footer, n => n.props.accessibilityLabel === label)[0];
const listCard = (tree, id) => nodes(tree, n => n.props.testID === 'list-entry-card-' + id)[0];
const entries = [
  { id: 'food', intentKey: 'comida', intentLabel: 'COMIDA', notes: 'COMIDA', type: 'GO', estado: 'propuesta_pendiente', dateISO: '2030-06-03', date: '03/06/2030', time: '12:00', changeProposal: { date: '04/06/2030', time: '13:00' } },
  { id: 'sport', intentKey: 'deporte', intentLabel: 'DEPORTE', notes: 'DEPORTE', type: 'GO', estado: 'propuesto', dateISO: '2030-06-05', date: '05/06/2030', time: '18:00', changeProposal: { date: '06/06/2030', time: '19:00' } },
];
function fixture(lang = 'es', overrides = {}) {
  const calls = [];
  const completionDocument = completionModel.emptyCompletionDocument({ userId: 'tasks-fixture', context: 'live:USER' });
  const React = { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }) };
  const hosts = Object.fromEntries(['BottomSheet', 'GoScreenHost', 'View', 'Text', 'TextInput', 'TouchableOpacity', 'Pressable', 'ScrollView', 'SwipeableRow', 'Feather', 'MaterialCommunityIcons', 'LinearGradient', 'Image', 'GoListActionRow'].map(x => [x, x]));
  const context = { ...hosts, exports:{}, React, Date, Math, goView:{view:"USER"},adminAccess:{allowed:false,checking:false},useMemo: fn => fn(),customerBookings:{entries:[],loading:false,error:""}, console,
    t: key => { assert.equal(typeof translations[lang][key], 'string', key); return translations[lang][key]; },
    listOpen: true, listSwipeStepAllowed: true, llamadasListOpen: false, listMinimized: false, listFiltersHidden: false, listFilter: 'todos', typeFilter: 'todos', activityFilter: 'todas',
    quickCreateOpen: false, quickCreateKbVisible: false, quickCreateText: '', paddingBottom: 34, screenBgColors: {}, listGoSize: 'medio', goSortOrder: 'asc',
    calAddOpen: false, calQuickCreateOpen: false, fieldSelectorOpen: false, isActivelyCreating: false, categorySelected: false,
    unifiedNoteOriginRef: { current: 'landing' }, unifiedNoteInitial: null, unifiedNoteSeed: {}, listNoteLayerBackRef: { current: null }, listBookingDetail: undefined,
    noteIdentityRef: { current: { ready: true, scope: { userId: 'tasks-fixture', context: 'live:USER' } } },
    noteDocument: noteModel.noteDocument, noteInScope: noteModel.noteInScope, isArchivedNote: noteModel.isArchivedNote,
    canReadBoardTask: () => true, isGoNoteReminderTarget: toolsContext.exports.isGoNoteReminderTarget,
    noteIdentity: { ready: false }, personalGoLog: [], renderLinkedNotes: () => null,
    goLog: entries, handedness: 'right', allExpanded: false, expandedId: null, isBusinessMode: false, isUserMode: true, altSlotsEntry: null,
    mergeCompletionEntries: completionModel.mergeCompletionEntries,
    actionCompletion: { candidates: [], status: entry => completionModel.completionDecision(entry, completionDocument)?.status },
    ...presentationContext.exports, reservationCardPolicy: policyContext.exports.reservationCardPolicy, ENTRY_COLORS: policyContext.exports.GO_ENTRY_COLORS,
    canResolveEntry: () => false, renderEntryMicroActions: entry => ({ type: 'MicroActions', props: { entry, children: [] } }),
    INTENTS: [{ key: 'comida', color: '#f97316', icon: 'disc' }, { key: 'deporte', color: '#22c55e', icon: 'activity' }], TRASH_DISPLAY_LIMIT: 50,
    slotOf: e => e.deleted || e.estado === 'rechazado' ? 'papelera' : e.estado === 'aceptado' ? 'aceptado' : 'pendiente',
    noTranslate: {}, localizeLabel: x => x, displayContact: name => name || '', getGoActivityKey: g => g.intentKey,
    StyleSheet: { absoluteFill: {} }, styles: {}, Platform: { OS: 'ios' }, catScrollRef: { current: null }, typeScrollRef: { current: null },
    noteInputGoId: null, noteInputDraft: '', pendingUndos: {}, goChats: {}, speakingMsgId: null, place: '', sharedChatKey: g => g.id, currentReceivedIdRef: { current: null }, proposalReturnRef: { current: null }, calFlow: {}, marketplacePedidos: [], lastTapRef: { current: { id: null, t: 0 } }, quickNoteAlarm: false, finishListBookingProposal: () => {},
    Keyboard: { dismiss: () => calls.push(['dismiss']) }, AsyncStorage: { setItem: (...args) => { calls.push(['store', ...args]); return Promise.resolve(); } },
    Haptics: { selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), NotificationFeedbackType: { Warning: 'warning' } },
    date: '', time: '', notesOpen: false, lang, dateISODraft: '2027-01-15', itemCount: 0,
    ...overrides,
  };
  const setterNames = new Set();
  const collect = n => { if (ts.isIdentifier(n) && /^set[A-Z]/.test(n.text) && !['setTimeout', 'setInterval'].includes(n.text)) setterNames.add(n.text); ts.forEachChild(n, collect); };
  collect(sheet('listOpen'));
  for (const fn of listFunctions) collect(fn);
  for (const route of routes) collect(route.node);
  for (const name of setterNames) context[name] = value => { calls.push([name, value]); const field = name.slice(3, 4).toLowerCase() + name.slice(4); context[field] = typeof value === 'function' ? value(context[field]) : value; };
  for (const name of ['updateGoStatus', 'acceptProposal', 'rejectProposal', 'openProposalFromList', 'openFieldSelector', 'showToast', 'scheduleUndo', 'rejectGo', 'toggleGoSortOrder', 'sendExpandedNote', 'toggleNotaRecording', 'resetNotaAudio', 'saveGoNoteOnly', 'sendGoNote', 'applyAlternativeSlot', 'sendSuggestChangeFromCal', 'speakMsg', 'undoStatusChange', 'updateLogStatus']) context[name] = (...args) => calls.push([name, ...args]);
  context.cycleGoSlot = (id, direction) => { calls.push(['cycleGoSlot', id, direction]); return direction === 'advance' ? 'aceptado' : 'pendiente'; };
  vm.runInNewContext(sharedActionRowCode, context);
  context.renderUnifiedNoteEditor = () => ({ type: 'SharedNoteEditor', props: { children: [], visible: context.notesOpen, initial: context.unifiedNoteInitial, seed: context.unifiedNoteSeed } });
  for (const route of routes) vm.runInNewContext(compile(`globalThis.${route.name} = ${route.code};`), context);
  return { context, calls, render: () => { vm.runInNewContext(listCode, context); return context.tree; } };
}

for (const lang of ['es', 'en']) {
  test(`Tasks menus keep ${lang} labels and their real note button opens the shared editor directly`, () => {
    const f = fixture(lang, { goView: { view: 'ADMIN' }, adminAccess: { allowed: true, checking: false } });
    const tree = f.render(), footer = tree.props.footer;
    assert.equal(tree.props.title, lang === 'es' ? 'GO · TAREAS' : 'GO · TASKS');
    const labels = texts(footer);
    for (const k of ['tasks_calls', 'label_task_internal', 'stat_tasks_label', 'tasks_go_internal', 'filter_todos']) assert.ok(labels.includes(translations[lang][k]), k);
    const noteButton = nodes(footer, n => n.props.testID === 'list-notes-open')[0];
    assert.ok(noteButton);
    noteButton.props.onPress();
    assert.equal(f.context.quickCreateOpen, false); assert.equal(f.context.fieldSelectorOpen, false);
    assert.equal(f.context.notesOpen, true); assert.equal(f.context.listOpen, true);
    assert.equal(f.context.unifiedNoteOriginRef.current, 'list');
    assert.deepEqual(JSON.parse(JSON.stringify(f.context.unifiedNoteSeed)), { title: '' });
    assert.equal(f.calls.some(call => call[0] === 'openFieldSelector'), false);
    const next = f.render();
    assert.ok(!texts(next.props.footer).includes(translations[lang].new_task_label.toUpperCase()));
    const editor = nodes(next.props.modalOverlay, n => n.type === 'SharedNoteEditor')[0];
    assert.ok(editor); assert.equal(editor.props.visible, true);
  });
  test(`Proposal cards in ${lang} keep dates and actions in their compact layout`, () => {
    for (const handedness of ['left', 'right']) {
      const f = fixture(lang, { handedness }), tree = f.render();
      const swipes = nodes(tree, n => n.type === 'SwipeableRow');
      assert.equal(swipes.length, 2);
      const card = swipes[0].props.children[0],children=card.props.children.filter(Boolean),top=children[0],info=children[1];
      const label = translations[lang].biz_change_proposed;
      assert.equal(texts(top).split(label).length - 1, 1);
      assert.ok(!texts(info).includes(label));
      const upperButtons = nodes(top, n => n.type === 'TouchableOpacity');
      const indicatorIndex = upperButtons.findIndex(n => texts(n) === label);
      assert.ok(indicatorIndex >= 0);
      const orange = upperButtons.find(n => n.props.style?.backgroundColor === policyContext.exports.GO_ENTRY_COLORS.change);
      assert.equal(orange.props.style.backgroundColor, policyContext.exports.GO_ENTRY_COLORS.change);
      orange.props.onPress({ stopPropagation() {} });
      assert.deepEqual(f.calls.at(-1), ['updateGoStatus', 'food']);
      assert.equal(card.props.style.paddingVertical, 8);
      const body = texts(card);
      for (const value of ['03/06/30', '12:00', '04/06/2030', '13:00', translations[lang].biz_booking_awaiting]) assert.ok(body.includes(value), value);
      const proposal = nodes(card, n => n.props?.testID === 'go-proposal-dates-food')[0];
      assert.ok(proposal);
      assert.equal(proposal.props.children.filter(n => n && typeof n === 'object').length, 3);
      assert.ok(!texts(proposal).includes(translations[lang].biz_booking_awaiting));
      assert.ok(texts(top).includes(translations[lang].biz_booking_awaiting));
      assert.equal(proposal.props.style.paddingHorizontal, 9);
      assert.equal(proposal.props.style.paddingVertical, 7);
      assert.equal(proposal.props.style.marginTop, 4);
      assert.equal(proposal.props.style.gap, 5);
      assert.equal(proposal.props.style.height, undefined);
      const received = swipes[1].props.children[0];
      const mounted = nodes(received, n => n.props.testID === 'go-proposal-responses-sport')[0];
      const buttons = nodes(mounted.type(mounted.props), n => n.type === 'TouchableOpacity');
      buttons.find(n => texts(n) === translations[lang].accept.toUpperCase()).props.onPress({ stopPropagation() {} });
      assert.deepEqual(f.calls.at(-1), ['acceptProposal', 'sport']);
      buttons.find(n => texts(n) === translations[lang].reject.toUpperCase()).props.onPress({ stopPropagation() {} });
      assert.deepEqual(f.calls.at(-1), ['rejectProposal', 'sport']);
      swipes[0].props.onSwipeRight();
      assert.ok(f.calls.some(c => c[0] === 'cycleGoSlot' && c[1] === 'food' && c[2] === 'advance'));
    }
  });
}

for (const type of ['TAREA_INTERNA', 'TAREA']) for (const target of ['card', 'title']) {
  test(`Listados ${target} opens saved ${type} in the shared editor without changing its state`, () => {
    const note = { id: 'saved-note', kind: 'sent', type, intentKey: type === 'TAREA' ? 'nota_externa' : 'nota_interna', intentLabel: 'Nota conservada', notes: 'Mi texto', detail: 'Contenido completo', ownerUserId: 'tasks-fixture', taskContext: 'live:USER', estado: 'pendiente', dateISO: '', time: '' };
    const f = fixture('es', { goLog: [note] });
    const card = nodes(f.render(), n => n.type === 'SwipeableRow')[0].props.children[0];
    const button = target === 'card' ? card : nodes(card, n => n.type === 'TouchableOpacity' && n.props.onPress?.toString().includes('openListSavedNote'))[0];
    assert.ok(button); button.props.onPress();
    assert.equal(f.context.notesOpen, true); assert.equal(f.context.listOpen, true);
    assert.equal(f.context.unifiedNoteInitial, note); assert.equal(f.context.unifiedNoteOriginRef.current, 'list');
    assert.equal(f.context.expandedId, null); assert.equal(note.estado, 'pendiente');
    assert.equal(f.calls.some(call => ['openFieldSelector', 'updateGoStatus', 'updateLogStatus'].includes(call[0])), false);
  });
}

test('Listados refuses to open a saved note from a different owner or context', () => {
  for (const [ownerUserId, taskContext] of [['other-account', 'live:USER'], ['tasks-fixture', 'demo:USER']]) {
    const note = { id: 'foreign-note', kind: 'sent', type: 'TAREA_INTERNA', intentKey: 'nota_interna', intentLabel: 'Privada', notes: 'Otro borrador', ownerUserId, taskContext, estado: 'pendiente' };
    const f = fixture('es', { goLog: [note] });
    nodes(f.render(), n => n.type === 'SwipeableRow')[0].props.children[0].props.onPress();
    assert.equal(f.context.notesOpen, false); assert.equal(f.context.unifiedNoteInitial, null);
    assert.equal(f.context.expandedId, null); assert.ok(f.calls.some(call => call[0] === 'showToast'));
  }
});

const visibilityEffect = find(home, node => ts.isCallExpression(node) && node.expression.getText(home) === 'useEffect' && node.arguments[0]?.getText(home).includes('setListGoVisible'));
function visibility(overrides = {}) {
  const values = [], animations = [];
  const context = {
    anyOverlayOpen: true, aiOpen: false, listOpen: true, titleBottomLocalY: 80, ACTION_TOP_Y: 96, overlayPanelHeight: 300,
    windowHeight: 844, kbHeight: 0, GO_SIZE_8: { goSize: 135 }, GO_SIZE_1: { goSize: 45 }, goSize: 128, orbitWrapSize: 275, systemBoundingRadius: 159,
    optionsOpen: false, contactOpen: false, calOpen: false, minX: -60, maxX: 0, posRef: { x: 0, y: 0 },
    aiShrink: 'scale', overlayDX: 'x', overlayDY: 'y', Easing: { inOut: x => x, ease: 'ease' },
    Animated: { timing: (key, options) => { animations.push([key, options.toValue]); return {}; }, parallel: () => ({ start() {} }) },
    setListGoVisible: value => values.push(value), ...overrides,
  };
  vm.runInNewContext(compile(`(${visibilityEffect.arguments[0].getText(home)})();`), context);
  return { visible: values.at(-1), animations };
}
test('whole Landing GO disappears when the panel or keyboard leaves insufficient space and returns when room recovers', () => {
  assert.equal(visibility().visible, true);
  for (const overlayPanelHeight of [650, 730, 0]) assert.equal(visibility({ overlayPanelHeight }).visible, false);
  assert.equal(visibility({ kbHeight: 300 }).visible, false);
  assert.equal(visibility({ overlayPanelHeight: 300 }).visible, true);
  const restored = visibility({ anyOverlayOpen: false });
  assert.deepEqual(restored.animations, [['scale', 1], ['x', 0], ['y', 0]]);
});
test('Tasks keeps the real active Landing and never mounts a second orbit or context', () => {
  assert.equal(sheet('listOpen').openingElement.attributes.properties.some(p => p.name?.text === 'above'), false);
  const wrapper = find(home, n => ts.isVariableDeclaration(n) && n.name.getText(home) === 'wrapOrbital');
  for (const view of ['USER', 'BUSINESS', 'ADMIN']) {
    const f = fixture('es');
    Object.assign(f.context, { anyOverlayOpen: true, aiOpen: false, listGoVisible: false, insets: { bottom: 34 }, SYSTEM_MARGIN_Y: 12, dockRight: 16, systemBoundingRadius: 159, orbitWrapSize: 275,
      Animated: { View: 'Animated.View' }, landingOffsetY: 0, posReady: true, pan: { x: 0, y: 0 }, overlayDX: 0, overlayDY: 0, aiShrink: 1, kbOrbitTranslate: 0,
      inner: { type: 'ActiveLanding', props: { children: [], view } } });
    const code = compile(`tree = (${wrapper.initializer.getText(home)})(inner);`);
    vm.runInNewContext(code, f.context);
    assert.equal(f.context.tree, null);
    f.context.listGoVisible = true;
    vm.runInNewContext(code, f.context);
    assert.equal(nodes(f.context.tree, n => n.type === 'ActiveLanding')[0], f.context.inner);
    f.context.anyOverlayOpen = false;
    vm.runInNewContext(code, f.context);
    assert.equal(nodes(f.context.tree, n => n.type === 'ActiveLanding')[0], f.context.inner);
  }
});

test('the task note button uses exactly the approved Calendar icon and preserves its size variants', () => {
  const calendar = find(home, n => ts.isJsxElement(n) && n.openingElement.attributes.properties.some(p => p.name?.text === 'testID' && p.initializer?.getText(home) === '"calendar-actions"'));
  const icon = find(calendar, n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(home) === 'MaterialCommunityIcons' && n.attributes.properties.some(p => p.name?.text === 'name' && p.initializer?.getText(home) === '"note-edit-outline"'));
  assert.ok(icon);
  const attrs = Object.fromEntries(icon.attributes.properties.map(p => [p.name.text, p.initializer.getText(home).replace(/^[{"']|[}"']$/g, '')]));
  for (const [listGoSize, size] of [['compacto', 36], ['medio', 44], ['grande', 54]]) {
    const tree = fixture('es', { listGoSize }).render().props.footer;
    const button = nodes(tree, n => n.type === 'Pressable' && nodes(n, x => x.type === 'MaterialCommunityIcons').length === 1)[0];
    const actual = nodes(button, n => n.type === 'MaterialCommunityIcons')[0];
    assert.equal(actual.props.name, attrs.name);
    assert.equal(String(actual.props.size), attrs.size);
    assert.equal(actual.props.color, attrs.color);
    assert.equal(button.props.style({ pressed: false }).width, size);
    assert.equal(button.props.style({ pressed: false }).height, size);
  }
});

test('expanded cards and their notes use ES/EN labels while preserving accept/reject and user content', () => {
  for (const lang of ['es', 'en']) {
    const f = fixture(lang, { allExpanded: true, goLog: [{ ...entries[0], estado: 'pendiente', changeProposal: undefined }], goChats: { food: [{ messageId: 'own-message', text: 'Contenido propio', senderName: 'Cliente propio', senderType: 'cliente', createdAt: Date.now() }] } });
    f.context.calFlow.open = args => f.calls.push(['calendarOpen', args]);
    const tree = f.render(), card = nodes(tree, n => n.type === 'SwipeableRow')[0].props.children[0];
    const labels = texts(card);
    for (const k of ['tasks_chat', 'tasks_note_message']) assert.ok(!labels.includes(translations[lang][k].toUpperCase()), k);
    for (const k of ['tasks_propose', 'tasks_change_noun']) assert.ok(labels.includes(translations[lang][k].toUpperCase()), k);
    assert.ok(!labels.includes('Contenido propio'));
    assert.equal(f.context.goChats.food[0].text, 'Contenido propio');
    const accept = nodes(card, n => n.props.accessibilityLabel === translations[lang].accept.toUpperCase())[0];
    const reject = nodes(card, n => n.props.accessibilityLabel === translations[lang].reject.toUpperCase())[0];
    accept.props.onPress({ stopPropagation() {} });
    assert.ok(f.calls.some(c => c[0] === 'updateLogStatus' && c[1] === 'food' && c[2] === 'aceptado'));
    reject.props.onPress({ stopPropagation() {} });
    assert.ok(f.calls.some(c => c[0] === 'updateLogStatus' && c[1] === 'food' && c[2] === 'rechazado'));
    nodes(card, n => n.props.accessibilityLabel === translations[lang].tasks_propose_change.toUpperCase())[0].props.onPress({ stopPropagation() {} });
    assert.equal(f.calls.at(-1)[0], 'calendarOpen');
    assert.equal(f.calls.at(-1)[1].initialDateISO, entries[0].dateISO);
    assert.equal(f.calls.at(-1)[1].initialTime, entries[0].time);
  }
});

for(const lang of ['es','en'])for(const size of ['compacto','medio','grande'])test('Mis reservas / '+lang+' / '+size+': canonical bookings only, all statuses, original card renderer',()=>{
 const booking={id:'go_booking_booking',customerBooking:true,type:'GO_BOOKING',kind:'received',reservationId:'booking',contactName:'GO PELUQUERÍA',intentLabel:'Corte',notes:'Corte',dateISO:'2030-01-07',date:'07/01/2030',time:'10:00',estado:'aceptado',bookingStatus:'confirmada'},cancelled={...booking,id:'go_booking_cancelled',reservationId:'cancelled',deleted:true,estado:'rechazado',bookingStatus:'cancelada'};
 const f=fixture(lang,{listFilter:'reservas',listGoSize:size,goLog:[...entries,booking,cancelled],customerBookings:{entries:[booking,cancelled],loading:false,error:''}}),tree=f.render();assert.equal(tree.props.title,translations[lang].tasks_my_bookings.toUpperCase());
 const rows=nodes(tree,n=>n.type==='SwipeableRow');assert.equal(rows.length,2);assert.ok(texts(tree).includes('GO PELUQUERÍA'));assert.ok(!texts(tree).includes('COMIDA'));assert.ok(!texts(tree).includes('DEPORTE'));
 assert.ok(nodes(tree.props.footer,n=>n.props.accessibilityLabel===translations[lang].tasks_my_bookings).length);assert.equal(f.context.listGoSize,size);
});

test('Mis reservas is operable only in USER while ADMIN and BUSINESS retain the original filters',()=>{
  for(const view of ['USER','ADMIN','BUSINESS']){
    const f=fixture('es',{goView:{view},isUserMode:view==='USER',isBusinessMode:view==='BUSINESS'});
    const footer=f.render().props.footer;
    const findControl=key=>nodes(footer,n=>n.type==='Pressable'&&n.props.accessibilityLabel===translations.es[key])[0];
    const reservations=findControl('tasks_my_bookings');
    assert.equal(!!reservations,view==='USER',view+' reservation filter visibility');
    for(const [label,key] of [['filter_todos','todos'],['status_accepted','aceptado'],['status_pending_label','pendiente'],['tasks_proposals','propuesta'],['tasks_trash','papelera']]){
      const control=findControl(label);assert.ok(control,view+' retains '+key);
      f.context.listFilter=key==='todos'?'aceptado':'todos';control.props.onPress();assert.equal(f.context.listFilter,key,view+' operates '+key);
    }
    if(reservations){
      f.context.listFilter='todos';f.context.typeFilter='TAREA_INTERNA';f.context.activityFilter='comida';f.context.llamadasListOpen=true;
      reservations.props.onPress();
      assert.equal(f.context.listFilter,'reservas');assert.equal(f.context.typeFilter,'todos');assert.equal(f.context.activityFilter,'todas');assert.equal(f.context.llamadasListOpen,false);
    }
  }
});

test('three real Listados task cards place the complete actions below their headers in both hands', () => {
  const detailsSource = readFileSync('components/GoEntryDetails.tsx', 'utf8');
  const details = ts.createSourceFile('GoEntryDetails.tsx', detailsSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const component = find(details, node => ts.isFunctionDeclaration(node) && node.name?.text === 'GoEntryMicroActions');
  const adapter = find(home, node => ts.isVariableDeclaration(node) && node.name.getText(home) === 'renderEntryMicroActions');
  assert.ok(component && adapter);
  const tasks = ['pendiente', 'aceptado', 'pendiente'].map((estado, index) => ({
    id: 'task-' + index, kind: 'sent', type: 'TAREA_INTERNA', intentKey: 'nota_interna',
    intentLabel: 'Tarea de prueba con título largo ' + index, notes: 'Contenido sintético ' + index,
    estado, localResolutionStatus: index === 1 ? 'done' : 'pending',
  }));
  const flatten = style => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));
  for (const handedness of ['left', 'right']) for (const listGoSize of ['compacto', 'medio', 'grande']) {
    const f = fixture('es', { goLog: tasks, handedness, listGoSize, canResolveEntry: () => true });
    Object.assign(f.context, {
      exports: {}, C: policyContext.exports.GO_ENTRY_COLORS, useLanguage: () => ({ lang: 'es' }), useState: initial => [initial, () => {}],
      followedEntry: entry => entry, resolveEntry: (entry, status) => f.calls.push([entry.id, status]),
    });
    f.context.actionCompletion.isSaving = () => false;
    vm.runInNewContext(compile(component.getText(details) + '\nglobalThis.GoEntryMicroActions = GoEntryMicroActions;\nglobalThis.renderEntryMicroActions = ' + adapter.initializer.getText(home)), f.context);
    const cards = nodes(f.render(), n => n.type === 'Pressable' && n.props.testID?.startsWith('list-entry-card-task-'));
    assert.equal(cards.length, 3);
    for (const card of cards) {
      const children=card.props.children.filter(Boolean); const index = children.findIndex(node => node?.type === f.context.GoEntryMicroActions);
      assert.equal(index, 2, 'actions follow the header and readable content');
      assert.equal(nodes(children[0], node => node.type === 'Feather' && node.props.name === 'circle').length, 0);
      const mounted = children[index];
      assert.equal(mounted.props.layout, 'list');
      assert.equal(mounted.props.handedness, handedness);
      const rowMount = mounted.type(mounted.props);
      assert.equal(rowMount.type, f.context.GoListActionRow);
      assert.equal(rowMount.props.scale, listGoSize === 'compacto' ? .8 : listGoSize === 'grande' ? 1.25 : 1);
      const row = rowMount.type(rowMount.props);
      assert.equal(flatten(row.props.style).flexWrap, undefined);
      assert.equal(flatten(row.props.style).alignSelf, 'stretch');
      const buttons = nodes(row, node => node.type === 'TouchableOpacity');
      const labels = handedness === 'right' ? ['ELIMINAR', 'PENDIENTE', 'REALIZADA'] : ['REALIZADA', 'PENDIENTE', 'ELIMINAR'];
      assert.deepEqual(buttons.map(node => node.props.accessibilityLabel), labels);
      assert.equal(nodes(row, node => node.type === 'Feather').length, 0);
      buttons.forEach((button, position) => {
        const style = flatten(button.props.style);
        const label = nodes(button, node => node.type === 'Text')[0];
        assert.equal(label.props.numberOfLines, undefined);
        assert.equal(flatten(label.props.style).flexShrink, 1);
        assert.equal(style.flexBasis, 0);
        assert.ok(style.minHeight >= 44);
        assert.equal(style.flex, 1);
        assert.ok(style.backgroundColor.startsWith('rgba('));
        button.props.onPress({ stopPropagation() {} });
      });
      assert.deepEqual(f.calls.slice(-3), (handedness === 'right' ? ['discard', 'pending', 'done'] : ['done', 'pending', 'discard']).map(status => [mounted.props.entry.id, status]));
    }
    f.context.listOpen = false;
    f.render();
    f.context.listOpen = true;
    const reopened = listCard(f.render(), 'task-0');
    const reopenedActions = nodes(reopened, node => node.type === f.context.GoEntryMicroActions)[0];
    assert.equal(reopenedActions.props.handedness, handedness);
    f.context.handedness = handedness === 'right' ? 'left' : 'right';
    const switched = nodes(listCard(f.render(), 'task-0'), node => node.type === f.context.GoEntryMicroActions)[0];
    const switchedRow = switched.type(switched.props);
    assert.deepEqual(nodes(switchedRow.type(switchedRow.props), node => node.type === 'TouchableOpacity').map(node => node.props.accessibilityLabel),
      handedness === 'right' ? ['REALIZADA', 'PENDIENTE', 'ELIMINAR'] : ['ELIMINAR', 'PENDIENTE', 'REALIZADA']);
  }
});

test('three Listados reservations show one real state and open the Calendar detail inside their native host', () => {
  const rows = [
    { estado: 'aceptado', bookingStatus: 'confirmada', label: 'CONFIRMADA' },
    { estado: 'aceptado', bookingStatus: 'pendiente', label: 'PENDIENTE DE ACEPTACIÓN' },
    { estado: 'aceptado', bookingStatus: 'confirmada', bookingServerStatus: 'COMPLETED', label: 'COMPLETADA' },
  ].map((row, i) => ({ ...row, id: 'reservation-' + i, type: i === 1 ? 'GO_RESERVA' : 'GO_BOOKING',
    kind: 'received', customerBooking: true, reservationId: 'booking-' + i, contactName: 'Cliente ' + i,
    professionalName: 'Profesional', dateISO: '2030-01-07', date: '07/01/2030', time: '10:00' }));
  const calendar = ts.createSourceFile('Calendar', readFileSync('components/AgendaOperativa.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const calendarDetail = find(calendar, n => ts.isJsxOpeningElement(n) && n.tagName.getText(calendar) === 'GoEntryDetailsSheet');
  const renderer = find(home, n => ts.isFunctionDeclaration(n) && n.name?.text === 'renderListBookingDetail');
  const select = find(home, n => ts.isVariableDeclaration(n) && n.name.getText(home) === 'listBookingDetail');
  assert.ok(calendarDetail && renderer && select);
  for (const handedness of ['left', 'right']) for (const listGoSize of ['compacto', 'grande']) {
    const f = fixture('es', { goLog: rows, handedness, listGoSize, calBookingDetailEntry: null });
    Object.assign(f.context, {
      exports: {}, GoEntryDetailsSheet: calendarDetail.tagName.getText(calendar), renderEntryQuickActions: () => null,
      goDirectlyToLanding() {}, renderEntryMessageScreen: entry => 'message-screen-' + entry.id,
      openEntryMessage: (...args) => f.calls.push(['message', ...args]),
    });
    const refresh = () => vm.runInNewContext(compile('globalThis.listBookingDetail = ' + select.initializer.getText(home)), f.context);
    vm.runInNewContext(compile(renderer.getText(home) + '\nglobalThis.renderListBookingDetail = renderListBookingDetail;'), f.context);
    for (const entry of rows) {
      const card = nodes(f.render(), n => n.props.testID === 'list-entry-card-' + entry.id)[0];
      const state = nodes(card, n => n.props.testID === 'list-reservation-status-' + entry.id);
      assert.equal(state.length, 1);
      const statusRow = nodes(card, n => n.props.testID === 'list-reservation-status-row-' + entry.id)[0];
      assert.equal(statusRow.props.style.marginLeft, 'auto');assert.equal(statusRow.props.style.alignItems, 'flex-end');assert.equal(statusRow.props.style.position, undefined);
      assert.ok(nodes(card.props.children.filter(Boolean)[0], n => n === statusRow).length, 'reservation state belongs to the header');
      assert.equal(texts(state[0]), 'RESERVA · ' + entry.label);
      assert.ok(!texts(card).split(' | ').includes('ACEPTADO'));
      for (const target of [card, nodes(card, n => n.props.testID === 'list-entry-title-' + entry.id)[0]]) {
        target.props.onPress();
        refresh();
        const list = f.render();
        assert.equal(list.props.blockPan, true);
        assert.equal(list.props.modalOverlay.type, 'GoScreenHost');
        const detail = nodes(list.props.modalOverlay, n => n.type === 'GoEntryDetailsSheet')[0];
        assert.equal(detail.props.entry, entry);
        assert.equal(detail.props.handedness, handedness);
        detail.props.onMessage();
        assert.equal(f.calls.at(-1)[0], 'message');
        assert.equal(f.calls.at(-1)[1], entry);
        assert.equal(f.calls.at(-1)[3], true);
        assert.equal(detail.props.renderMessageScreen(), 'message-screen-' + entry.id);
        detail.props.onClose();
        refresh();
        assert.equal(f.context.listOpen, true);
        assert.equal(f.render().props.modalOverlay, undefined);
      }
    }
  }
});

test('premium reservation cards keep their category and place all personal actions in one handed row',()=>{
 const details=ts.createSourceFile('details.tsx',readFileSync('components/GoEntryDetails.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 const component=find(details,n=>ts.isFunctionDeclaration(n)&&n.name?.text==='GoEntryMicroActions');
 const adapter=find(home,n=>ts.isVariableDeclaration(n)&&n.name.getText(home)==='renderEntryMicroActions');
 const base={id:'hair',intentKey:'generico',intentLabel:'Corte',notes:'Lavado + Corte',color:'#16a34a',type:'GO_RESERVA',kind:'sent',customerBooking:true,reservationId:'original-booking',contactName:'Salón de prueba',professionalName:'Profesional',date:'07/01/2030',dateISO:'2030-01-07',time:'10:00',estado:'aceptado',bookingStatus:'confirmada',bookingCategory:'peluqueria'};
 for(const handedness of ['left','right'])for(const listGoSize of ['compacto','medio','grande'])for(const localResolutionStatus of ['pending','done']){
  const hair={...base,localResolutionStatus},sport={...base,id:'sport-reservation',bookingCategory:'padel'},task={...base,id:'ordinary-task',type:'TAREA_INTERNA',customerBooking:false,reservationId:undefined};
  const f=fixture('es',{goLog:[hair,sport,task],handedness,listGoSize,canResolveEntry:()=>true});
  Object.assign(f.context,{exports:{},C:policyContext.exports.GO_ENTRY_COLORS,useLanguage:()=>({lang:'es'}),useState:initial=>[initial,()=>{}],followedEntry:e=>e,resolveEntry:(e,status)=>f.calls.push([e.id,status])});f.context.actionCompletion.isSaving=()=>false;
  vm.runInNewContext(compile(component.getText(details)+'\nglobalThis.GoEntryMicroActions=GoEntryMicroActions;globalThis.renderEntryMicroActions='+adapter.initializer.getText(home)),f.context);
  const tree=f.render(),card=listCard(tree,'hair'),accent=nodes(card,n=>n.props.testID==='list-category-accent-hair')[0];
  assert.equal(accent.props.style.backgroundColor,'#eab308');assert.equal(accent.props.style.height,24);assert.equal(accent.props.style.width,3);assert.equal(card.props.style.borderLeftWidth,1);
  assert.equal(nodes(listCard(tree,'sport-reservation'),n=>n.props.testID?.startsWith('list-category-accent')).length,0);assert.equal(nodes(listCard(tree,'ordinary-task'),n=>n.props.testID?.startsWith('list-category-accent')).length,0);assert.equal(listCard(tree,'ordinary-task').props.style.borderLeftWidth,4);
  const actionMounts=nodes(card,n=>n.type===f.context.GoEntryMicroActions);assert.equal(actionMounts.length,1);assert.equal(nodes(card,n=>n.props.testID==='list-card-trash-hair').length,0);
  const rowMount=actionMounts[0].type(actionMounts[0].props),row=rowMount.type(rowMount.props),buttons=nodes(row,n=>n.type==='TouchableOpacity');assert.equal(buttons.length,3);
  assert.deepEqual(buttons.map(b=>texts(b)),handedness==='right'?['ELIMINAR','PENDIENTE','REALIZADA']:['REALIZADA','PENDIENTE','ELIMINAR']);
  assert.equal(nodes(row,n=>n.type==='Feather').length,0);assert.equal(buttons.filter(b=>b.props.accessibilityState.selected).length,1);assert.ok(buttons.every(b=>b.props.style.minHeight>=44&&b.props.style.backgroundColor.startsWith('rgba(')));
  for(const label of ['REALIZADA','PENDIENTE','ELIMINAR'])buttons.find(b=>texts(b)===label).props.onPress({stopPropagation(){}});
  assert.deepEqual(f.calls.slice(-3),[['hair','done'],['hair','pending'],['hair','discard']]);assert.equal(hair.reservationId,'original-booking');assert.equal(hair.bookingStatus,'confirmada');
 }
});

test('list trash uses the unchanged real confirmation before discarding only the personal card',async()=>{
 const resolve=find(home,n=>ts.isVariableDeclaration(n)&&n.name.getText(home)==='resolveEntry');const calls=[],alerts=[];const entry={id:'reservation',reservationId:'same-booking'};
 const context={canResolveEntry:()=>true,goLog:[entry],lang:'es',Alert:{alert:(...args)=>alerts.push(args)},actionCompletion:{discard:async(e,read)=>{calls.push([e.id,read().reservationId]);}},setLandingDetailsId(){}};
 vm.runInNewContext(compile('globalThis.resolve='+resolve.initializer.getText(home)),context);context.resolve(entry,'discard');assert.equal(calls.length,0);assert.equal(alerts.length,1);assert.equal(alerts[0][2][1].style,'destructive');alerts[0][2][1].onPress();await new Promise(setImmediate);assert.deepEqual(calls,[['reservation','same-booking']]);
});

test('Listados shows an archived note from the current scope and excludes foreign and discarded notes', () => {
  const scope = { userId: 'tasks-fixture', context: 'live:USER' };
  const entry = noteModel.buildNoteEntry({ ...noteModel.noteDraft(), content: 'Nota del archivo', destination: 'archive' }, scope);
  const foreign = { ...entry, id: 'foreign-note', ownerUserId: 'other' };
  const discarded = { ...entry, id: 'discarded-note' };
  const f = fixture('es', {
    goLog: [], personalGoLog: [entry, foreign, discarded], noteIdentity: { ready: true, scope },
    isArchivedNote: noteModel.isArchivedNote, canReadBoardTask: () => true,
    actionCompletion: { candidates: [], status: () => undefined, isDiscarded: row => row.id === discarded.id },
  });
  const cards = nodes(f.render(), n => n.props.testID?.startsWith('list-entry-card-'));
  assert.deepEqual(cards.map(card => card.props.testID), ['list-entry-card-' + entry.id]);
  cards[0].props.onPress();
  assert.equal(f.context.unifiedNoteInitial.id, entry.id);
});

test('only verified ADMIN gets the two classic GO menus at every list size and handedness', () => {
  const labels = translations.es;
  for (const handedness of ['left', 'right']) for (const listGoSize of ['compacto', 'medio', 'grande']) {
    for (const [view, allowed, checking] of [
      ['USER', false, false], ['USER', true, false], ['BUSINESS', false, false],
      ['ADMIN', false, false], ['ADMIN', true, true], ['ADMIN', true, false],
    ]) {
      const f = fixture('es', { handedness, listGoSize, goView: { view }, adminAccess: { allowed, checking },
        typeFilter: 'GO', activityFilter: 'comida', llamadasListOpen: true });
      const tree = f.render();
      const classic = view === 'ADMIN' && allowed && !checking;
      const footer = texts(tree.props.footer);
      for (const label of ['GO', labels.cat_coffee, labels.cat_food, labels.tasks_calls, labels.tasks_go_internal, labels.label_task_internal]) {
        assert.equal(footer.split(' | ').includes(label), classic, label);
      }
      assert.equal(!!tree.props.swipeStepDown, classic);
      assert.equal(tree.props.floatingClose.label,labels.tasks_close_list);assert.equal(tree.props.floatingClose.handedness,handedness);assert.equal(tree.props.expandToSafeTop,true);
      assert.ok(listControl(tree, labels.status_pending_label));
      assert.ok(listControl(tree, labels.filter_todos));
      assert.ok(listControl(tree, 'Notas'));
      assert.equal(!!listControl(tree, labels.tasks_my_bookings), view === 'USER');
      if (!classic) assert.ok(listCard(tree, 'food'), 'stored classic filters cannot hide records in V1');
      if (classic) {
        assert.equal(tree.props.title, labels.tasks_call_log.toUpperCase());
        listControl(tree, labels.filter_todos).props.onPress();
        assert.equal(f.context.activityFilter, 'todas');
        assert.equal(f.context.typeFilter, 'todos');
        assert.equal(f.context.llamadasListOpen, false);
        assert.ok(listCard(f.render(), 'food'));
      }
    }
  }
});

test('notes saved through the shared editor from all three entry points reopen from both Listados filters', async () => {
  const disk = await notesFixture.diskFixture();
  try {
    const f = fixture('es', { noteIdentity: { ready: true, scope: disk.scope },
      noteIdentityRef: { current: { ready: true, scope: disk.scope } }, goLog: [],
      actionCompletion: { candidates: [], status: entry => entry.id === 'done' ? 'done' : undefined, isDiscarded: () => false } });
    const labels = translations.es;
    const routes = [
      ['Landing', 'pending', () => f.context.openUnifiedNoteComposer()],
      ['Calendario', 'calendar', () => f.context.openCalendarNote()],
      ['Listados', 'pending', () => nodes(f.render().props.footer, n => n.props.testID === 'list-notes-open')[0].props.onPress()],
    ];
    for (const [origin, destination, open] of routes) {
      open();
      assert.equal(f.context.notesOpen, true);
      const ui = await notesFixture.editorFixture({ scope: disk.scope, seed: f.context.unifiedNoteSeed,
        onSave: draft => disk.api().saveUnifiedNote(draft, disk.scope, disk.active) });
      try {
        await ui.run(() => ui.hosts.get('note-title').onChangeText('Nota de ' + origin));
        await ui.run(() => ui.hosts.get('note-content').onChangeText('Contenido de ' + origin));
        await ui.destination(destination);
        if (destination === 'calendar') await ui.pickTime('18', '37');
        await ui.tap('unified-note-save');
        await ui.idle();
        assert.equal(disk.rows.filter(entry => entry.note.title === 'Nota de ' + origin).length, 1);
      } finally { await ui.close(); }
    }
    const rows = await disk.reopen();
    const scheduled = rows.find(entry => entry.note.destination === 'calendar');
    assert.equal(scheduled.dateISO, '2027-01-15');
    assert.equal(scheduled.time, '18:37');
    const archive = (await disk.api().saveUnifiedNote(disk.draft({ content: 'Nota archivada' }), disk.scope, disk.active)).entry;
    const legacy = { ...scheduled, id: 'legacy-note', note: undefined };
    const done = { ...scheduled, id: 'done' };
    const booking = { ...scheduled, id: 'scheduled-booking', note: undefined, type: 'GO_RESERVA', intentKey: 'generico' };
    f.context.personalGoLog = [...rows, archive];
    f.context.goLog = [...rows, legacy, done, booking];
    Object.assign(f.context, { notesOpen: false, typeFilter: 'GO', activityFilter: 'comida', llamadasListOpen: true });
    let tree = f.render();
    listControl(tree, labels.filter_todos).props.onPress();
    tree = f.render();
    assert.equal(f.context.itemCount, 7);
    assert.ok(listCard(tree, archive.id));
    assert.ok(listCard(tree, 'done'));
    for (const entry of rows) assert.ok(listCard(tree, entry.id));

    listControl(tree, labels.status_pending_label).props.onPress();
    tree = f.render();
    assert.equal(f.context.itemCount, 4);
    for (const excluded of [archive.id, 'done', 'scheduled-booking']) assert.equal(listCard(tree, excluded), undefined);
    assert.ok(listCard(tree, legacy.id));
    for (const entry of rows) {
      listCard(tree, entry.id).props.onPress();
      assert.equal(f.context.unifiedNoteInitial.id, entry.id);
      assert.equal(f.context.unifiedNoteOriginRef.current, 'list');
    }
    listCard(tree, scheduled.id).props.onPress();
    const editor = await notesFixture.editorFixture({ scope: disk.scope, initial: f.context.unifiedNoteInitial,
      onSave: draft => disk.api().saveUnifiedNote(draft, disk.scope, disk.active) });
    try {
      await editor.run(() => editor.hosts.get('note-content').onChangeText('Editada desde Listados'));
      await editor.tap('unified-note-save');
      await editor.idle();
      const reopened = await disk.reopen();
      assert.equal(reopened.length, 4);
      const edited = reopened.find(entry => entry.id === scheduled.id);
      assert.equal(edited.note.content, 'Editada desde Listados');
      assert.equal(edited.time, '18:37');
      assert.equal(edited.estado, 'pendiente');
    } finally { await editor.close(); }
  } finally { disk.close(); }
});
