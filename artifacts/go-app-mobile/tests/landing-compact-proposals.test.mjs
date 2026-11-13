import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = fs.readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let result;
  ts.forEachChild(node, child => { if (!result) result = find(child, predicate); });
  return result;
}
const sheet = find(ast, node => ts.isJsxElement(node)
  && node.openingElement.tagName.getText(ast) === 'BottomSheet'
  && node.openingElement.attributes.properties.some(p => p.name?.text === 'visible'
    && p.initializer?.getText(ast) === '{listOpen}'));
assert.ok(sheet, 'exercise the actual task-list renderer');
const formatter = find(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === 'formatCompactProposalSlot');
const details = ts.createSourceFile('details.tsx', fs.readFileSync('components/GoEntryDetails.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const actionRow = find(details, node => ts.isFunctionDeclaration(node) && node.name?.text === 'GoListActionRow');
const actionPalette = find(details, node => ts.isVariableDeclaration(node) && node.name?.getText(details) === 'GO_ACTION_PALETTE');
const actionVisual = find(details, node => ts.isFunctionDeclaration(node) && node.name?.text === 'goActionVisual');
function compile(text) {
  return ts.transpileModule(text, { compilerOptions: { esModuleInterop: false, alwaysStrict: false,
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
  } }).outputText;
}
const listFunctions = ['isEditableListNote', 'isPendingListEntry', 'clearClassicListFilters'].map(name =>
  find(ast, node => ts.isFunctionDeclaration(node) && node.name?.text === name));
const listState = ['showClassicListFilters', 'listTypeFilter', 'listActivityFilter', 'listCallsOpen', 'filteredListEntries'].map(name =>
  'const ' + find(ast, node => ts.isVariableDeclaration(node) && node.name?.getText(ast) === name).getText(ast) + ';');
const code = compile(['{', formatter.getText(ast), ...listFunctions.map(node => node.getText(ast)), "const "+find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==="RESERVAS_ORBITAL_CATS").getText(ast)+";", ...listState,
  `tree = (${sheet.getText(ast)});`, '}'].join('\n'));
const translationsContext = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('i18n/translations.ts', 'utf8')), translationsContext);
const translations = translationsContext.exports.translations;
const presentationContext={exports:{}},colorContext={exports:{}};
vm.runInNewContext(compile(fs.readFileSync('data/goEntryPresentation.ts','utf8')),presentationContext);
vm.runInNewContext(compile(fs.readFileSync('data/reservationCardPolicy.ts','utf8')),colorContext);
const completionContext = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('lib/goActionCompletion.ts', 'utf8')), completionContext);
const noteContext = { exports: {} }, toolsContext = { exports: {} };
vm.runInNewContext(compile(fs.readFileSync('lib/unifiedNotes.ts', 'utf8')), noteContext);
vm.runInNewContext(compile(fs.readFileSync('lib/goNoteTools.ts', 'utf8')), toolsContext);
const setterNames = new Set();
function setters(node) {
  if (ts.isIdentifier(node) && /^set[A-Z]/.test(node.text) && !['setTimeout', 'setInterval'].includes(node.text)) setterNames.add(node.text);
  ts.forEachChild(node, setters);
}
setters(sheet);
for (const fn of listFunctions) setters(fn);
function nodes(tree, predicate = () => true) {
  if (!tree || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}
const texts = tree => nodes(tree, node => node.type === 'Text')
  .flatMap(node => node.props.children).filter(value => typeof value === 'string').join(' | ');
const byId = (tree, id) => nodes(tree, node => node.props?.testID === id)[0];
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const sample = overrides => ({
  id: 'compact', kind: 'sent', type: 'GO', intentKey: 'deporte', intentLabel: 'DEPORTE',
  notes: 'Título propio', contactName: 'Contacto de prueba', phone: '+34600000001',
  date: 'Jueves, 15 octubre 2026', dateISO: '2026-10-15', time: '17:00', estado: 'propuesta_pendiente',
  changeProposal: { date: 'Viernes, 16 octubre 2026', dateISO: '2026-10-16', time: '12:45', note: '' },
  ...overrides,
});
function fixture(lang = 'es', overrides = {}) {
  const calls = [];
  const React = { Fragment: 'Fragment', createElement: (type, props, ...children) => ({
    type, props: { ...props, children: children.flat(Infinity) },
  }) };
  const hosts = Object.fromEntries(['BottomSheet', 'View', 'Text', 'TextInput', 'TouchableOpacity', 'Pressable',
    'ScrollView', 'SwipeableRow', 'Feather', 'MaterialCommunityIcons', 'LinearGradient', 'Image'].map(name => [name, name]));
  const context = { ...hosts, exports:{}, React, Date, Math,lang,ENTRY_COLORS:colorContext.exports.GO_ENTRY_COLORS,reservationCardPolicy:colorContext.exports.reservationCardPolicy,entryIsReservation:presentationContext.exports.entryIsReservation,entryHeading:presentationContext.exports.entryHeading,canResolveEntry:()=>false, goView:{view:"USER"},customerBookings:{entries:[],loading:false,error:""},
    mergeCompletionEntries: completionContext.exports.mergeCompletionEntries, useMemo: fn => fn(), adminAccess: { allowed: false, checking: false },
    noteDocument: noteContext.exports.noteDocument, isGoNoteReminderTarget: toolsContext.exports.isGoNoteReminderTarget,
    actionCompletion: { candidates: [], status: () => undefined }, noteIdentity: {ready:false}, personalGoLog: [], renderLinkedNotes: () => null, listBookingDetail: undefined, notesOpen: false, openListNote() {}, openListSavedNote: () => false,
    t: key => { assert.equal(typeof translations[lang][key], 'string', key); return translations[lang][key]; },
    listOpen: true, listSwipeStepAllowed: true, llamadasListOpen: false, listMinimized: false,
    listFiltersHidden: false, listFilter: 'todos', typeFilter: 'todos', activityFilter: 'todas',
    quickCreateOpen: false, quickCreateKbVisible: false, quickCreateText: '', paddingBottom: 34,
    screenBgColors: {}, listGoSize: 'medio', goSortOrder: 'asc', goLog: [freeze(sample())],
    handedness: 'right', allExpanded: false, expandedId: null, isBusinessMode: false, isUserMode: true,
    altSlotsEntry: null, INTENTS: [{ key: 'deporte', color: '#22c55e', icon: 'activity' }], TRASH_DISPLAY_LIMIT: 50,
    slotOf: entry => entry.deleted || entry.estado === 'rechazado' ? 'papelera' : entry.estado === 'aceptado' ? 'aceptado' : 'pendiente',
    noTranslate: {}, localizeLabel: value => value, displayContact: (name, phone) => name || phone || '',
    getGoActivityKey: entry => entry.intentKey, StyleSheet: { absoluteFill: {} }, styles: {}, Platform: { OS: 'ios' },
    catScrollRef: { current: null }, typeScrollRef: { current: null }, noteInputGoId: null, noteInputDraft: '',
    pendingUndos: {}, goChats: {}, speakingMsgId: null, place: '', sharedChatKey: entry => entry.id,
    currentReceivedIdRef: { current: null }, proposalReturnRef: { current: null }, calFlow: {},
    marketplacePedidos: [], lastTapRef: { current: { id: null, t: 0 } }, quickNoteAlarm: false, finishListBookingProposal: () => {},
    Keyboard: { dismiss: () => calls.push(['dismiss']) },
    AsyncStorage: { setItem: (...args) => { calls.push(['store', ...args]); return Promise.resolve(); } },
    Haptics: { selectionAsync: () => Promise.resolve(), notificationAsync: () => Promise.resolve(),
      NotificationFeedbackType: { Warning: 'warning' } },
    ...overrides,
  };
  for (const name of setterNames) context[name] = value => {
    calls.push([name, value]);
    const field = name.slice(3, 4).toLowerCase() + name.slice(4);
    context[field] = typeof value === 'function' ? value(context[field]) : value;
  };
  for (const name of ['updateGoStatus', 'acceptProposal', 'rejectProposal', 'openProposalFromList',
    'openFieldSelector', 'showToast', 'scheduleUndo', 'rejectGo', 'toggleGoSortOrder', 'sendExpandedNote',
    'applyAlternativeSlot', 'sendSuggestChangeFromCal', 'speakMsg', 'undoStatusChange', 'updateLogStatus']) {
    context[name] = (...args) => calls.push([name, ...args]);
  }
  context.cycleGoSlot = (id, direction) => { calls.push(['cycleGoSlot', id, direction]); return direction === 'advance' ? 'aceptado' : 'pendiente'; };
  vm.runInNewContext(compile('const '+actionPalette.getText(details)+';'+actionVisual.getText(details)+actionRow.getText(details) + '\nglobalThis.GoListActionRow = GoListActionRow;'), context);
  return { context, calls, render() { vm.runInNewContext(code, context); return context.tree; } };
}
const cardOf = tree => nodes(tree, node => node.type === 'SwipeableRow')[0]?.props.children[0];
const plain = value => JSON.parse(JSON.stringify(value));
const whiteContrast = hex => {const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return 1.05/(.2126*r+.7152*g+.0722*b+.05);};
test('shared Listados footer keeps equal accessible buttons with one, two or three valid actions', () => {
  const f=fixture('es'), calls=[];
  for(const scale of [.8,1,1.25])for(const count of [1,2,3])for(const handedness of ['left','right']){
    const actions=[
      {key:'remove',label:'ELIMINAR',tone:'negative',onPress:()=>calls.push('remove')},
      {key:'wait',label:'PENDIENTE',tone:'intermediate',onPress:()=>calls.push('wait')},
      {key:'done',label:'REALIZADA',tone:'positive',onPress:()=>calls.push('done')},
    ].slice(0,count);
    const row=f.context.GoListActionRow({actions,handedness,scale});
    const buttons=nodes(row,node=>node.type==='TouchableOpacity');
    assert.equal(buttons.length,count);
    assert.equal(row.props.style.flexWrap,undefined);
    assert.equal(nodes(row,node=>node.type==='Feather').length,0);
    assert.ok(buttons.every(button=>button.props.style.flexBasis===0 && button.props.style.minHeight>=44));
    assert.ok(buttons.every(button=>{const label=nodes(button,node=>node.type==='Text')[0];return label.props.numberOfLines===1&&label.props.adjustsFontSizeToFit===true&&label.props.style.width==='100%';}));
    assert.ok(buttons.every(button=>/^#[0-9A-F]{6}$/.test(button.props.style.backgroundColor)&&whiteContrast(button.props.style.backgroundColor)>=4.5));
    assert.ok(buttons.every(button=>nodes(button,node=>node.type==='Text')[0].props.style.color==='#FFFFFF'));
    assert.deepEqual(buttons.map(button=>texts(button)),(handedness==='right'?actions:[...actions].reverse()).map(action=>action.label));
    buttons[0].props.onPress({stopPropagation(){}});
    assert.equal(calls.at(-1),(handedness==='right'?actions[0]:actions.at(-1)).key);
  }
});
test('selected and unselected follow-up colors keep white text at AA contrast',()=>{
  const f=fixture('es');
  for(const tone of ['intermediate','positive'])for(const selected of [false,true]){
    const row=f.context.GoListActionRow({actions:[{key:tone,label:'ESTADO',tone,selectable:true,selected,onPress:()=>{}}]});
    const button=nodes(row,node=>node.type==='TouchableOpacity')[0];
    assert.ok(whiteContrast(button.props.style.backgroundColor)>=4.5);
    assert.equal(nodes(button,node=>node.type==='Text')[0].props.style.color,'#FFFFFF');
  }
});
test('personal follow-up omits only its duplicate pending header, never a booking contract state', () => {
  const followUpAccess={canResolveEntry:()=>true,renderEntryMicroActions:()=>null};
  const followUp=freeze(sample({estado:'pendiente',changeProposal:undefined}));
  const ordinary=cardOf(fixture('es',{...followUpAccess,goLog:[followUp]}).render());
  assert.equal(texts(byId(ordinary,'list-entry-header-status-compact')),'GO EXT');
  assert.ok(byId(byId(ordinary,'list-entry-header-status-compact'),'list-category-badge-compact'));
  const booking=freeze(sample({estado:'pendiente',changeProposal:undefined,type:'GO_BOOKING',reservationId:'real-booking',bookingStatus:'confirmada'}));
  const contractual=cardOf(fixture('es',{...followUpAccess,goLog:[booking]}).render());
  assert.equal(texts(byId(contractual,'list-reservation-status-compact')),'CONFIRMADA');
});
function dispatchNestedPress(button, parent) {
  let stopped = false;
  button.props.onPress({ stopPropagation() { stopped = true; } });
  // Model propagation explicitly so removing stopPropagation invokes the real card callback.
  if (!stopped) parent.props.onPress();
  assert.equal(stopped, true, 'the nested contact must stop the card press');
}

for (const lang of ['es', 'en']) for (const handedness of ['left', 'right']) {
  for (const listGoSize of ['compacto', 'medio', 'grande']) for (const estado of ['propuesto', 'propuesta_pendiente']) {
    test(`${lang}/${handedness}/${listGoSize}/${estado}: compact slots and isolated contact preserve proposal controls`, () => {
      const entry = freeze(sample({ estado })), before = JSON.stringify(entry);
      const f = fixture(lang, { handedness, listGoSize, goLog: [entry] }), tree = f.render(), card = cardOf(tree);
      assert.ok(card);
      const header = byId(card, 'go-proposal-header-compact');
      const contact = byId(header, 'go-proposal-contact-compact');
      assert.ok(header && contact, 'contact stays alongside the main title');
      assert.ok(contact.props.style.width >= 44 && contact.props.style.height >= 44);
      dispatchNestedPress(contact, card);
      assert.deepEqual(plain(f.calls), [
        ['setInitialMessagesContact', { name: entry.contactName, phone: entry.phone }], ['setMessagesOpen', true],
      ]);
      assert.equal(f.context.expandedId, null);
      assert.equal(f.context.lastTapRef.current.id, null, 'contact does not arm a title double tap');
      const body = texts(card);
      assert.ok(!body.includes('GO EXT'), 'remove the redundant metadata header');
      for (const time of [entry.time, entry.changeProposal.time]) assert.equal(body.split(time).length - 1, 1);
      for (const [id, label, date, time, color] of [
        ['go-proposal-current-compact', translations[lang].tasks_current_booking.toUpperCase(), '15/10/26', '17:00', '#ffffff'],
        ['go-proposal-next-compact', translations[lang].tasks_change_proposal.toUpperCase(), '16/10/26', '12:45', '#FF8C00'],
      ]) {
        const row = byId(card, id), values = nodes(row, node => node.type === 'Text');
        assert.ok(row);
        assert.equal(row.props.style.flexDirection, undefined);
        assert.equal(values.length, 2);
        assert.equal(texts(values[0]), label);
        assert.equal(texts(values[1]), `${date} · ${time}`);
        assert.ok(values.every(node => node.props.numberOfLines === undefined));
        assert.equal(values[1].props.style.color, color);
        assert.ok(values[1].props.style.fontSize >= 13);
      }
      const label = translations[lang][estado === 'propuesta_pendiente' ? 'biz_booking_awaiting' : 'biz_change_received'].toUpperCase();
      const buttons = nodes(header, node => node.type === 'TouchableOpacity');
      const pillIndex = buttons.findIndex(node => texts(node) === label);
      const checkboxIndex = buttons.findIndex(node => node.props.style?.backgroundColor === '#FF8C00');
      const titleIndex = buttons.findIndex(node => byId(node, 'go-proposal-title-compact'));
      const titleBlock = byId(header, 'go-proposal-title-block-compact');
      assert.equal(texts(byId(titleBlock, 'go-proposal-title-compact')), entry.notes);
      assert.equal(byId(header, 'list-entry-title-compact').props.style.flexShrink, 0, 'the state cannot squeeze the title');
      const waiting = byId(titleBlock, 'go-proposal-substatus-compact');
      assert.equal(waiting, undefined, 'the state lives once in the header pill, leaving title width free');
      assert.equal(texts(header).split(label).length - 1, 1, 'keep one localized state pill');
      assert.ok(pillIndex >= 0 && checkboxIndex >= 0 && titleIndex >= 0);
      assert.equal(nodes(buttons[pillIndex],node=>node.type==='Text')[0].props.numberOfLines,label.length>14?2:1);
      assert.ok(buttons[pillIndex].props.style.maxWidth<=170,'long state wraps inside a compact label');
      assert.ok(handedness === 'left' ? checkboxIndex < titleIndex && titleIndex < pillIndex
        : titleIndex < checkboxIndex && checkboxIndex < pillIndex, 'proposal state follows the title for both hands');
      const statusSlot = byId(header, 'list-entry-header-status-compact');
      assert.equal(statusSlot.props.style.marginLeft, 0);
      assert.equal(statusSlot.props.style.maxWidth, '100%');
      assert.equal(statusSlot.props.style.flexShrink, 0);
      assert.equal(statusSlot.props.style.width, '100%', 'proposal state starts on its own line below the title');
      assert.equal(statusSlot.props.style.alignSelf, 'flex-start');
      assert.equal(statusSlot.props.style.justifyContent, 'space-between');
      f.calls.length = 0;
      buttons[checkboxIndex].props.onPress({ stopPropagation() {} });
      assert.deepEqual(plain(f.calls), [['updateGoStatus', entry.id]]);
      const proposal = byId(card, 'go-proposal-dates-compact');
      const scale = listGoSize === 'compacto' ? .8 : listGoSize === 'grande' ? 1.25 : 1;
      assert.equal(card.props.style.paddingVertical, Math.round(8 * scale));
      assert.equal(proposal.props.style.marginTop, Math.round(4 * scale));
      assert.equal(proposal.props.style.paddingHorizontal, Math.round(9 * scale));
      assert.equal(proposal.props.style.paddingVertical, Math.round(7 * scale));
      assert.equal(proposal.props.style.gap, Math.round(5 * scale));
      if (estado === 'propuesto') for (const [word, handler] of [['accept', 'acceptProposal'], ['reject', 'rejectProposal']]) {
        f.calls.length = 0;
        const mounted = byId(card, 'go-proposal-responses-compact');
        const button = nodes(mounted.type(mounted.props), node => node.type === 'TouchableOpacity'
          && texts(node) === translations[lang][word].toUpperCase())[0];
        assert.ok(button);
        button.props.onPress({ stopPropagation() {} });
        assert.deepEqual(plain(f.calls), [[handler, entry.id]]);
      }
      if (estado === 'propuesto') {
        const mounted = byId(card, 'go-proposal-responses-compact');
        const row = mounted.type(mounted.props), buttons = nodes(row, node => node.type === 'TouchableOpacity');
        const expected = handedness === 'right' ? ['RECHAZAR', 'PROPONER', 'ACEPTAR'] : ['ACEPTAR', 'PROPONER', 'RECHAZAR'];
        const localized = lang === 'en' ? expected.map(word => ({RECHAZAR:'REJECT',PROPONER:'PROPOSE',ACEPTAR:'ACCEPT'})[word]) : expected;
        assert.deepEqual(buttons.map(button => texts(button)), localized);
        assert.equal(row.props.style.flexDirection, 'row');
        assert.equal(row.props.style.flexWrap, undefined);
        assert.equal(nodes(row, node => node.type === 'Feather').length, 0);
        assert.ok(buttons.every(button => button.props.style.flexBasis === 0 && button.props.style.minHeight >= 44));
        assert.ok(buttons.every(button => button.props.accessibilityState.selected === false), 'proposal decisions are never preselected');
        f.calls.length = 0;
        buttons.find(button => texts(button) === localized[1]).props.onPress({stopPropagation(){}});
        assert.deepEqual(plain(f.calls), [['openProposalFromList', {id:entry.id,time:entry.time,place:''}]]);
      }
      assert.equal(JSON.stringify(entry), before, 'render and touch preserve saved entry/proposal data');
    });
  }
}

test('ordinary cards and trash retain their date/contact/badge content for every size and language', () => {
  for (const lang of ['es', 'en']) for (const listGoSize of ['compacto', 'medio', 'grande']) {
    for (const estado of ['pendiente', 'aceptado', 'rechazado', 'propuesto', 'propuesta_pendiente']) {
      const entry = freeze(sample({ estado, changeProposal: undefined }));
      const card = cardOf(fixture(lang, { listGoSize, listFilter: estado === 'rechazado' ? 'papelera' : 'todos', goLog: [entry] }).render());
      assert.ok(card);
      assert.equal(byId(card, 'go-proposal-header-compact'), undefined);
      assert.equal(byId(card, 'go-proposal-contact-compact'), undefined);
      assert.ok(texts(card).includes(entry.date));
      assert.ok(texts(card).includes(entry.contactName));
      assert.ok(texts(card).includes('GO EXT'));
      const info=card.props.children.filter(Boolean)[1];
      assert.equal(nodes(info,node=>node.type==='Feather'&&['user','users'].includes(node.props.name)).length,0,'names keep their text without decorative person icons');
    }
    for (const estado of ['propuesto', 'propuesta_pendiente']) {
      const entry = freeze(sample({ estado, deleted: true }));
      const card = cardOf(fixture(lang, { listGoSize, listFilter: 'papelera', goLog: [entry] }).render());
      assert.ok(card);
      assert.equal(byId(card, 'go-proposal-header-compact'), undefined);
      assert.equal(byId(card, 'go-proposal-current-compact'), undefined);
      assert.ok(texts(card).includes(entry.date));
    }
  }
});

test('group contact uses its existing first participant and missing contact creates no touch target', () => {
  const group = freeze(sample({ contactName: '', phone: '', recipients: [
    { name: 'Primero', phone: '+34600000002' }, { name: 'Segundo', phone: '+34600000003' },
  ] }));
  const before = JSON.stringify(group), f = fixture('en', { goLog: [group] }), card = cardOf(f.render());
  const contact = byId(card, 'go-proposal-contact-compact');
  assert.ok(nodes(contact, node => node.type === 'Feather' && node.props.name === 'users').length);
  dispatchNestedPress(contact, card);
  assert.deepEqual(plain(f.calls), [
    ['setInitialMessagesContact', { name: 'Primero', phone: '+34600000002' }], ['setMessagesOpen', true],
  ]);
  assert.equal(JSON.stringify(group), before);
  const absent = freeze(sample({ contactName: '', phone: '', recipients: [] }));
  assert.equal(byId(cardOf(fixture('es', { goLog: [absent] }).render()), 'go-proposal-contact-compact'), undefined);
});

for (const [bookingStatus, labelKey, color] of [
  ['confirmada', 'status_confirmed', '#22c55e'],
  ['cambio_pendiente', 'floor_reservation_cambio_pendiente', '#FF8C00'],
  ['cancelada', 'booking_state_cancelled', '#FF0000'],
  [undefined, 'booking_state_pending', '#FFD700'],
]) test(`compact booking ${bookingStatus ?? 'default'} preserves professional/state and isolates its contact`, () => {
  for (const lang of ['es', 'en']) {
    const entry = freeze(sample({ type: 'GO_BOOKING', reservationId: 'booking-compact',
      professionalName: 'ProAna', bookingStatus, paymentStatus: 'pagada' }));
    const before = JSON.stringify(entry), f = fixture(lang, { goLog: [entry] }), card = cardOf(f.render());
    const contact = byId(card, 'go-proposal-contact-compact');
    assert.equal(nodes(card, node => node.props?.testID === 'go-proposal-contact-compact').length, 1);
    assert.equal(texts(card).split('ProAna').length - 1, 1, 'the original professional remains visible');
    const info=card.props.children.filter(Boolean)[1];
    assert.equal(nodes(info,node=>node.type==='Feather'&&['user','users'].includes(node.props.name)).length,0);
    const statusLabel = translations[lang][labelKey].toUpperCase();
    const status = nodes(card, node => node.type === 'Text' && texts(node) === statusLabel);
    assert.equal(status.length, 1, 'retain the existing localized booking-state pill and default');
    assert.equal(status[0].props.style.color, color);
    assert.equal(status[0].props.numberOfLines,statusLabel.length>14?2:1);
    const statusRow=byId(card,'list-reservation-status-row-compact');
    assert.equal(statusRow.props.style.width,undefined);
    assert.equal(statusRow.props.style.marginLeft,'auto');
    assert.ok(nodes(byId(card,'go-proposal-header-compact'),node=>node===statusRow).length,'original reservation and proposal states share the compact header');
    const proposalStates=byId(card,'list-entry-header-status-compact');
    assert.equal(proposalStates.props.style.marginLeft,0,'sent proposal stays flush left');
    assert.equal(proposalStates.props.style.width,'100%');
    assert.equal(texts(card).includes(translations[lang].biz_booking_intent_label.toUpperCase() + " · "), false, 'booking status has no redundant type prefix');
    for (const time of [entry.time, entry.changeProposal.time]) assert.equal(texts(card).split(time).length - 1, 1);
    dispatchNestedPress(contact, card);
    assert.deepEqual(plain(f.calls), [
      ['setInitialMessagesContact', { name: entry.contactName, phone: entry.phone }], ['setMessagesOpen', true],
    ]);
    assert.ok(!f.calls.some(call => ['setCalBookingDetailEntry', 'setExpandedId', 'updateGoStatus', 'store'].includes(call[0])));
    assert.equal(JSON.stringify(entry), before, 'reservation identity, status and payment stay untouched');
  }
});

test('dates without ISO values preserve the saved labels and full accessible date/time', () => {
  const entry = freeze(sample({ dateISO: undefined, date: 'Fecha actual guardada',
    changeProposal: { date: 'Fecha propuesta guardada', time: '12:45' } }));
  const card = cardOf(fixture('es', { goLog: [entry] }).render());
  for (const [id, value] of [['go-proposal-current-compact', 'Fecha actual guardada · 17:00'],
    ['go-proposal-next-compact', 'Fecha propuesta guardada · 12:45']]) {
    const row = byId(card, id), slot = nodes(row, node => node.type === 'Text')[1];
    assert.equal(texts(slot), value);
    assert.equal(slot.props.accessibilityLabel, value);
  }
});

// The comparison retains its two dates and divider, with readable text and a separate shared action footer.
for(const [size,scale] of [['compacto',.8],['medio',1],['grande',1.25]])
 for(const estado of ['propuesta_pendiente','propuesto'])for(const withNote of [false,true])
 test(size+' / '+estado+' / note '+withNote+': date-only frame, state in header, all actions retained',()=>{
  const entry=freeze(sample({estado,changeProposal:{...sample().changeProposal,note:withNote?'Nota conservada completa':''}}));
  const f=fixture('es',{listGoSize:size,goLog:[entry]}),card=cardOf(f.render()),header=byId(card,'go-proposal-header-compact');
  const box=byId(card,'go-proposal-dates-compact'),lv=n=>Math.round(n*scale);
  assert.equal(box.props.children.filter(n=>n&&typeof n==='object').length,3);
  assert.equal(box.props.style.paddingVertical,lv(7));assert.equal(box.props.style.marginTop,lv(4));assert.equal(box.props.style.gap,lv(5));
  assert.equal(card.props.style.paddingHorizontal,lv(14));assert.equal(box.props.style.paddingHorizontal,lv(9));
  assert.equal(card.props.style.paddingVertical,lv(8));assert.equal(header.props.style.marginBottom,lv(4));
  assert.ok(!texts(box).includes('Esperando respuesta')&&!texts(box).includes('CAMBIO RECIBIDO'));
  assert.equal(nodes(box,n=>n.type==='TouchableOpacity').length,0);
  for(const id of ['go-proposal-current-compact','go-proposal-next-compact']){
   const row=byId(box,id);assert.equal(row.props.style.flexDirection,undefined);
   for(const text of nodes(row,n=>n.type==='Text'))assert.equal(text.props.numberOfLines,undefined);
   assert.ok(nodes(row,n=>n.type==='Text')[1].props.style.fontSize>=13);
  }
  const note=byId(card,'go-proposal-note-compact');if(withNote){assert.ok(note);assert.equal(texts(note),'Nota conservada completa');assert.equal(note.props.numberOfLines,undefined);assert.ok(!nodes(box).includes(note));}else assert.equal(note,undefined);
  assert.equal(byId(header,'go-proposal-substatus-compact'),undefined);
  assert.equal(texts(header).split(estado==='propuesta_pendiente'?'ESPERANDO RESPUESTA':'CAMBIO RECIBIDO').length-1,1);
  const actions=byId(card,'go-proposal-responses-compact');assert.equal(!!actions,estado==='propuesto');
  if(actions){const row=actions.type(actions.props),buttons=nodes(row,n=>n.type==='TouchableOpacity');assert.equal(buttons.length,3);for(const button of buttons)assert.ok(button.props.style.minHeight>=44);
   f.calls.length=0;buttons[1].props.onPress({stopPropagation(){}});assert.deepEqual(plain(f.calls),[['openProposalFromList',{id:entry.id,time:entry.time,place:''}]]);}
  const contact=byId(card,'go-proposal-contact-compact');assert.ok(contact.props.style.width>=44&&contact.props.style.height>=44);
  assert.equal(box.props.style.borderColor,'rgba(255,140,0,0.35)');
 });

for(const lang of ['es','en'])for(const size of ['compacto','medio','grande'])for(const handedness of ['left','right'])
 test(lang+' / '+size+' / '+handedness+': long title/status and multiline note remain complete',()=>{
 const title='ACTIVIDAD PERSONALIZADA CON TÍTULO LARGO',note='Primera línea de la nota.\nSegunda línea.\nTercera línea conservada.';
 const entry=freeze(sample({notes:title,changeProposal:{...sample().changeProposal,note}})),card=cardOf(fixture(lang,{listGoSize:size,handedness,goLog:[entry]}).render());
 assert.equal(texts(byId(card,'go-proposal-title-compact')),title);assert.equal(byId(card,'go-proposal-title-compact').props.numberOfLines,undefined);
 assert.equal(byId(card,'go-proposal-substatus-compact'),undefined);assert.equal(texts(byId(card,'list-entry-header-status-compact')).split(translations[lang].biz_booking_awaiting.toUpperCase()).length-1,1);
 assert.equal(texts(byId(card,'go-proposal-note-compact')),note);assert.equal(byId(card,'go-proposal-note-compact').props.numberOfLines,undefined);
 });
