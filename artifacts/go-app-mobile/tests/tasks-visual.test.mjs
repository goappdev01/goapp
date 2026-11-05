import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
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
assert.ok(compactFormatter, 'use the actual compact slot formatter');
const listCode = compile(`${compactFormatter.getText(home)}\ntree = (${sheet('listOpen').getText(home)});`);
const routeNames = ['openUnifiedNote', 'openUnifiedNoteComposer', 'openQuickNoteFrom', 'openListNote', 'openListSavedNote'];
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
const entries = [
  { id: 'food', intentKey: 'comida', intentLabel: 'COMIDA', notes: 'COMIDA', type: 'GO', estado: 'propuesta_pendiente', dateISO: '2030-06-03', date: '03/06/2030', time: '12:00', changeProposal: { date: '04/06/2030', time: '13:00' } },
  { id: 'sport', intentKey: 'deporte', intentLabel: 'DEPORTE', notes: 'DEPORTE', type: 'GO', estado: 'propuesto', dateISO: '2030-06-05', date: '05/06/2030', time: '18:00', changeProposal: { date: '06/06/2030', time: '19:00' } },
];
function fixture(lang = 'es', overrides = {}) {
  const calls = [];
  const completionDocument = completionModel.emptyCompletionDocument({ userId: 'tasks-fixture', context: 'live:USER' });
  const React = { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }) };
  const hosts = Object.fromEntries(['BottomSheet', 'GoScreenHost', 'View', 'Text', 'TextInput', 'TouchableOpacity', 'Pressable', 'ScrollView', 'SwipeableRow', 'Feather', 'MaterialCommunityIcons', 'LinearGradient', 'Image'].map(x => [x, x]));
  const context = { ...hosts, React, Date, Math, goView:{view:"USER"},customerBookings:{entries:[],loading:false,error:""}, console,
    t: key => { assert.equal(typeof translations[lang][key], 'string', key); return translations[lang][key]; },
    listOpen: true, listSwipeStepAllowed: true, llamadasListOpen: false, listMinimized: false, listFiltersHidden: false, listFilter: 'todos', typeFilter: 'todos', activityFilter: 'todas',
    quickCreateOpen: false, quickCreateKbVisible: false, quickCreateText: '', paddingBottom: 34, screenBgColors: {}, listGoSize: 'medio', goSortOrder: 'asc',
    calAddOpen: false, calQuickCreateOpen: false, fieldSelectorOpen: false, isActivelyCreating: false, categorySelected: false,
    unifiedNoteOriginRef: { current: 'landing' }, unifiedNoteInitial: null, unifiedNoteSeed: {}, listNoteLayerBackRef: { current: null },
    noteIdentityRef: { current: { ready: true, scope: { userId: 'tasks-fixture', context: 'live:USER' } } },
    noteDocument: noteModel.noteDocument, noteInScope: noteModel.noteInScope, isGoNoteReminderTarget: toolsContext.exports.isGoNoteReminderTarget,
    goLog: entries, handedness: 'right', allExpanded: false, expandedId: null, isBusinessMode: false, isUserMode: true, altSlotsEntry: null,
    mergeCompletionEntries: completionModel.mergeCompletionEntries,
    actionCompletion: { candidates: [], status: entry => completionModel.completionDecision(entry, completionDocument)?.status },
    ...presentationContext.exports, reservationCardPolicy: policyContext.exports.reservationCardPolicy, ENTRY_COLORS: policyContext.exports.GO_ENTRY_COLORS,
    canResolveEntry: () => false, renderEntryMicroActions: entry => ({ type: 'MicroActions', props: { entry, children: [] } }),
    INTENTS: [{ key: 'comida', color: '#f97316', icon: 'disc' }, { key: 'deporte', color: '#22c55e', icon: 'activity' }], TRASH_DISPLAY_LIMIT: 50,
    slotOf: e => e.deleted || e.estado === 'rechazado' ? 'papelera' : e.estado === 'aceptado' ? 'aceptado' : 'pendiente',
    noTranslate: {}, localizeLabel: x => x, displayContact: name => name || '', getGoActivityKey: g => g.intentKey,
    StyleSheet: { absoluteFill: {} }, styles: {}, Platform: { OS: 'ios' }, catScrollRef: { current: null }, typeScrollRef: { current: null },
    noteInputGoId: null, noteInputDraft: '', pendingUndos: {}, goChats: {}, speakingMsgId: null, place: '', sharedChatKey: g => g.id, currentReceivedIdRef: { current: null }, proposalReturnRef: { current: null }, calFlow: {}, marketplacePedidos: [], lastTapRef: { current: { id: null, t: 0 } }, quickNoteAlarm: false,
    Keyboard: { dismiss: () => calls.push(['dismiss']) }, AsyncStorage: { setItem: (...args) => { calls.push(['store', ...args]); return Promise.resolve(); } },
    Haptics: { selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), NotificationFeedbackType: { Warning: 'warning' } },
    date: '', time: '', notesOpen: false, lang,
    ...overrides,
  };
  const setterNames = new Set();
  const collect = n => { if (ts.isIdentifier(n) && /^set[A-Z]/.test(n.text) && !['setTimeout', 'setInterval'].includes(n.text)) setterNames.add(n.text); ts.forEachChild(n, collect); };
  collect(sheet('listOpen'));
  for (const route of routes) collect(route.node);
  for (const name of setterNames) context[name] = value => { calls.push([name, value]); const field = name.slice(3, 4).toLowerCase() + name.slice(4); context[field] = typeof value === 'function' ? value(context[field]) : value; };
  for (const name of ['updateGoStatus', 'acceptProposal', 'rejectProposal', 'openProposalFromList', 'openFieldSelector', 'showToast', 'scheduleUndo', 'rejectGo', 'toggleGoSortOrder', 'sendExpandedNote', 'toggleNotaRecording', 'resetNotaAudio', 'saveGoNoteOnly', 'sendGoNote', 'applyAlternativeSlot', 'sendSuggestChangeFromCal', 'speakMsg', 'undoStatusChange', 'updateLogStatus']) context[name] = (...args) => calls.push([name, ...args]);
  context.cycleGoSlot = (id, direction) => { calls.push(['cycleGoSlot', id, direction]); return direction === 'advance' ? 'aceptado' : 'pendiente'; };
  context.renderUnifiedNoteEditor = () => ({ type: 'SharedNoteEditor', props: { children: [], visible: context.notesOpen, initial: context.unifiedNoteInitial, seed: context.unifiedNoteSeed } });
  for (const route of routes) vm.runInNewContext(compile(`globalThis.${route.name} = ${route.code};`), context);
  return { context, calls, render: () => { vm.runInNewContext(listCode, context); return context.tree; } };
}

for (const lang of ['es', 'en']) {
  test(`Tasks menus keep ${lang} labels and their real note button opens the shared editor directly`, () => {
    const f = fixture(lang), tree = f.render(), footer = tree.props.footer;
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
      const card = swipes[0].props.children[0], top = card.props.children[0], info = card.props.children[1];
      const label = translations[lang].biz_change_proposed;
      assert.equal(texts(top).split(label).length - 1, 1);
      assert.ok(!texts(info).includes(label));
      const upperButtons = top.props.children.filter(n => n?.type === 'TouchableOpacity');
      const indicatorIndex = upperButtons.findIndex(n => texts(n) === label);
      assert.ok(indicatorIndex >= 0);
      const orange = upperButtons[indicatorIndex + 1];
      assert.equal(orange.props.style.backgroundColor, policyContext.exports.GO_ENTRY_COLORS.change);
      orange.props.onPress({ stopPropagation() {} });
      assert.deepEqual(f.calls.at(-1), ['updateGoStatus', 'food']);
      assert.equal(card.props.style.paddingVertical, 4);
      const body = texts(card);
      for (const value of ['03/06/30', '12:00', '04/06/2030', '13:00', translations[lang].biz_booking_awaiting]) assert.ok(body.includes(value), value);
      const proposal = nodes(card, n => n.props?.testID === 'go-proposal-dates-food')[0];
      assert.ok(proposal);
      assert.equal(proposal.props.children.filter(n => n && typeof n === 'object').length, 3);
      assert.ok(!texts(proposal).includes(translations[lang].biz_booking_awaiting));
      assert.ok(texts(top).includes(translations[lang].biz_booking_awaiting));
      assert.equal(proposal.props.style.paddingHorizontal, 8);
      assert.equal(proposal.props.style.paddingVertical, 2);
      assert.equal(proposal.props.style.marginTop, 3);
      assert.equal(proposal.props.style.gap, 3);
      assert.equal(proposal.props.style.height, undefined);
      const received = swipes[1].props.children[0];
      childWith(received, '🟢 ' + translations[lang].accept).props.onPress({ stopPropagation() {} });
      assert.deepEqual(f.calls.at(-1), ['acceptProposal', 'sport']);
      childWith(received, '🔴 ' + translations[lang].reject).props.onPress({ stopPropagation() {} });
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
    for (const k of ['tasks_chat', 'tasks_note_message', 'tasks_propose', 'tasks_change_noun']) assert.ok(labels.includes(translations[lang][k].toUpperCase()), k);
    assert.ok(labels.includes('Contenido propio'));
    assert.ok(labels.includes(translations[lang].tasks_internal_short));
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
      exports: {}, C: policyContext.exports.GO_ENTRY_COLORS, useLanguage: () => ({ lang: 'es' }),
      followedEntry: entry => entry, resolveEntry: (entry, status) => f.calls.push([entry.id, status]),
    });
    f.context.actionCompletion.isSaving = () => false;
    vm.runInNewContext(compile(component.getText(details) + '\nglobalThis.GoEntryMicroActions = GoEntryMicroActions;\nglobalThis.renderEntryMicroActions = ' + adapter.initializer.getText(home)), f.context);
    const cards = nodes(f.render(), n => n.type === 'Pressable' && n.props.testID?.startsWith('list-entry-card-task-'));
    assert.equal(cards.length, 3);
    for (const card of cards) {
      const index = card.props.children.findIndex(node => node?.type === f.context.GoEntryMicroActions);
      assert.equal(index, 1, 'actions own a row directly beneath the header');
      assert.equal(nodes(card.props.children[0], node => node.type === 'Feather' && node.props.name === 'circle').length, 0);
      const mounted = card.props.children[index];
      assert.equal(mounted.props.layout, 'list');
      const row = mounted.type(mounted.props);
      assert.equal(flatten(row.props.style).flexWrap, 'wrap');
      assert.equal(flatten(row.props.style).alignSelf, 'stretch');
      const buttons = nodes(row, node => node.type === 'TouchableOpacity');
      assert.deepEqual(buttons.map(node => node.props.accessibilityLabel), ['REALIZADA', 'PENDIENTE', 'ELIMINAR']);
      buttons.forEach((button, position) => {
        const style = flatten(button.props.style);
        const label = nodes(button, node => node.type === 'Text')[0];
        assert.equal(label.props.numberOfLines, undefined);
        assert.equal(style.minHeight, 44);
        assert.equal(style.maxWidth, '100%');
        assert.equal(style.borderColor, [f.context.C.done, f.context.C.pending, f.context.C.destructive][position]);
        button.props.onPress({ stopPropagation() {} });
      });
      assert.deepEqual(f.calls.slice(-3), ['done', 'pending', 'discard'].map(status => [mounted.props.entry.id, status]));
    }
  }
});
