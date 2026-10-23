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
  return ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React } }).outputText;
}
const compactFormatter = find(home, node => ts.isFunctionDeclaration(node) && node.name?.text === 'formatCompactProposalSlot');
assert.ok(compactFormatter, 'use the actual compact slot formatter');
const listCode = compile(`${compactFormatter.getText(home)}\ntree = (${sheet('listOpen').getText(home)});`);
const notesCode = compile(`tree = (${sheet('notesOpen').getText(home)});`);
const translationsContext = { exports: {} };
vm.runInNewContext(compile(readFileSync('i18n/translations.ts', 'utf8')), translationsContext);
const translations = translationsContext.exports.translations;
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
  const React = { Fragment: 'Fragment', createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }) };
  const hosts = Object.fromEntries(['BottomSheet', 'View', 'Text', 'TextInput', 'TouchableOpacity', 'Pressable', 'ScrollView', 'SwipeableRow', 'Feather', 'MaterialCommunityIcons', 'LinearGradient', 'Image'].map(x => [x, x]));
  const context = { ...hosts, React, Date, Math, goView:{view:"USER"},customerBookings:{entries:[],loading:false,error:""}, console,
    t: key => { assert.equal(typeof translations[lang][key], 'string', key); return translations[lang][key]; },
    listOpen: true, listSwipeStepAllowed: true, llamadasListOpen: false, listMinimized: false, listFiltersHidden: false, listFilter: 'todos', typeFilter: 'todos', activityFilter: 'todas',
    quickCreateOpen: false, quickCreateKbVisible: false, quickCreateText: '', paddingBottom: 34, screenBgColors: {}, listGoSize: 'medio', goSortOrder: 'asc',
    goLog: entries, handedness: 'right', allExpanded: false, expandedId: null, isBusinessMode: false, isUserMode: true, altSlotsEntry: null,
    INTENTS: [{ key: 'comida', color: '#f97316', icon: 'disc' }, { key: 'deporte', color: '#22c55e', icon: 'activity' }], TRASH_DISPLAY_LIMIT: 50,
    slotOf: e => e.deleted || e.estado === 'rechazado' ? 'papelera' : e.estado === 'aceptado' ? 'aceptado' : 'pendiente',
    noTranslate: {}, localizeLabel: x => x, displayContact: name => name || '', getGoActivityKey: g => g.intentKey,
    StyleSheet: { absoluteFill: {} }, styles: {}, Platform: { OS: 'ios' }, catScrollRef: { current: null }, typeScrollRef: { current: null },
    noteInputGoId: null, noteInputDraft: '', pendingUndos: {}, goChats: {}, speakingMsgId: null, place: '', sharedChatKey: g => g.id, currentReceivedIdRef: { current: null }, proposalReturnRef: { current: null }, calFlow: {}, marketplacePedidos: [], lastTapRef: { current: { id: null, t: 0 } }, quickNoteAlarm: false,
    Keyboard: { dismiss: () => calls.push(['dismiss']) }, AsyncStorage: { setItem: (...args) => { calls.push(['store', ...args]); return Promise.resolve(); } },
    Haptics: { selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(), NotificationFeedbackType: { Warning: 'warning' } },
    date: '', time: '', notesOpen: true, notaDateISO: null, notaTime: '', quickNoteText: '', quickNoteDetail: '', notaAudioRecording: false, notaAudioUri: null,
    notaKbVisible: false, notaSaving: false, notaTextRef: { current: null },
    ...overrides,
  };
  const setterNames = new Set();
  const collect = n => { if (ts.isIdentifier(n) && /^set[A-Z]/.test(n.text) && !['setTimeout', 'setInterval'].includes(n.text)) setterNames.add(n.text); ts.forEachChild(n, collect); };
  for (const name of ['listOpen', 'notesOpen']) collect(sheet(name));
  for (const name of setterNames) context[name] = value => { calls.push([name, value]); const field = name.slice(3, 4).toLowerCase() + name.slice(4); context[field] = typeof value === 'function' ? value(context[field]) : value; };
  for (const name of ['updateGoStatus', 'acceptProposal', 'rejectProposal', 'openProposalFromList', 'openFieldSelector', 'showToast', 'scheduleUndo', 'rejectGo', 'toggleGoSortOrder', 'sendExpandedNote', 'toggleNotaRecording', 'resetNotaAudio', 'saveGoNoteOnly', 'sendGoNote', 'applyAlternativeSlot', 'sendSuggestChangeFromCal', 'speakMsg', 'undoStatusChange', 'updateLogStatus']) context[name] = (...args) => calls.push([name, ...args]);
  context.cycleGoSlot = (id, direction) => { calls.push(['cycleGoSlot', id, direction]); return direction === 'advance' ? 'aceptado' : 'pendiente'; };
  return { context, calls, render: (name = 'listOpen') => { vm.runInNewContext(name === 'listOpen' ? listCode : notesCode, context); return context.tree; } };
}

for (const lang of ['es', 'en']) {
  test(`Tasks menus, titles and existing note creation follow ${lang}`, () => {
    const f = fixture(lang), tree = f.render(), footer = tree.props.footer;
    assert.equal(tree.props.title, lang === 'es' ? 'GO · TAREAS' : 'GO · TASKS');
    const labels = texts(footer);
    for (const k of ['tasks_calls', 'label_task_internal', 'stat_tasks_label', 'tasks_go_internal', 'filter_todos']) assert.ok(labels.includes(translations[lang][k]), k);
    const noteButton = nodes(footer, n => n.type === 'Pressable' && nodes(n, x => x.type === 'MaterialCommunityIcons' && x.props.name === 'note-edit-outline').length === 1)[0];
    assert.ok(noteButton);
    noteButton.props.onPress();
    assert.equal(f.context.quickCreateOpen, true);
    const next = f.render().props.footer;
    assert.ok(texts(next).includes(translations[lang].new_task_label.toUpperCase()));
    childWith(next, translations[lang].label_task_internal.toUpperCase()).props.onPress();
    assert.deepEqual(f.calls.at(-1), ['openFieldSelector', 'NOTA_INTERNA', '']);
    f.context.quickCreateOpen = true; f.context.quickCreateText = 'Título propio';
    childWith(f.render().props.footer, translations[lang].label_task_external.toUpperCase()).props.onPress();
    assert.deepEqual(f.calls.at(-1), ['openFieldSelector', 'NOTA_EXTERNA', 'Título propio']);
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
      assert.equal(orange.props.style.backgroundColor, '#f97316');
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
  test(`Notes labels and audio/reminder actions follow ${lang}`, () => {
    const f = fixture(lang), tree = f.render('notesOpen'), labels = texts(tree);
    for (const k of ['board_title_label', 'label_task_internal', 'tasks_internal_short', 'tasks_external_short']) assert.ok(labels.includes(translations[lang][k].toUpperCase()), k);
    const a11y = nodes(tree, n => n.props?.accessibilityLabel).map(n => n.props.accessibilityLabel);
    assert.ok(a11y.includes(translations[lang].tasks_record_audio));
    assert.ok(a11y.includes(translations[lang].tasks_enable_reminder));
    assert.ok(a11y.includes(translations[lang].close));
  });
}

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
