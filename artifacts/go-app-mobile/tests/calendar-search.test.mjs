import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { fixture } from './helpers/calendar-fixture.mjs';
import { ast, find, transpile } from './helpers/calendar-container-fixture.mjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), ts = require('typescript');
const nodes = (tree, predicate) => tree && typeof tree === 'object'
  ? [...(predicate(tree) ? [tree] : []), ...(tree.children ?? []).flatMap(child => nodes(child, predicate))] : [];
const byId = (tree, id) => nodes(tree, node => node.props?.testID === id)[0];
const entry = (id, extra = {}) => ({ id, kind: 'sent', type: 'TAREA', notes: 'Preparar reunión', detail: '',
  contactName: '', professionalName: '', intentKey: 'task', intentLabel: 'Tarea', dateISO: '2030-12-12',
  date: '', time: '09:30', estado: 'pendiente', color: '#22c55e', place: '', duration: '', phone: '', ...extra });
const note = (id, destination, extra = {}) => entry(id, { type: 'TAREA_INTERNA', intentKey: 'nota_interna', notes: 'Información médica',
  note: { version: 1, title: 'Información médica', content: 'Revisión de análisis', destination,
    schedule: { dateISO: '', time: '', duration: '' }, attachments: [], history: [], reminderMinutes: null }, ...extra });
const sample = [
  entry('task', { localResolutionStatus: 'pending' }),
  entry('done', { localResolutionStatus: 'done', notes: 'Última revisión', dateISO: '2020-01-02' }),
  entry('booking', { type: 'GO_BOOKING', customerBooking: true, contactName: 'Clínica Álvarez', professionalName: 'José Pérez',
    notes: 'Consulta', detail: 'Preparación especial', bookingStatus: 'confirmada', localResolutionStatus: 'done',
    bookingMessageToStaff: 'Alergía al látex', bookingServices: [{ id: 'svc', title: 'Revisión anual', durationMinutes: 30, price: 20 }] }),
  note('note', 'calendar'),
  entry('event', { type: 'GO', notes: 'Encuentro cultural', estado: 'aceptado' }),
  entry('deleted', { deleted: true }), entry('rejected', { estado: 'rechazado' }), note('linked', 'go'),
];
const archive = [note('archive', 'archive', { dateISO: '', time: '', notes: 'Documento antiguo' })];

test('partial search reuses accent/case normalization across loaded dates and visible fields without mutating records', () => {
  const api = fixture().load('data/calendarSearch.ts'), before = JSON.stringify([sample, archive]);
  const index = api.indexCalendarSearch(sample, [...archive, sample[0]]);
  const ids = (...args) => api.filterCalendarSearch(index, ...args).map(item => item.entry.id).join(',');
  assert.equal(ids('REUN'), 'task');
  assert.equal(ids('última'), 'done'); assert.equal(ids('ULTIMA'), 'done');
  assert.equal(ids('alvarez'), 'booking'); assert.equal(ids('jose per'), 'booking');
  assert.equal(ids('preparacion'), 'booking'); assert.equal(ids('analisis'), 'note');
  assert.equal(ids('revision anual'), 'booking'); assert.equal(ids('alergia'), 'booking');
  assert.equal(ids('medica'), 'note'); assert.equal(ids('Encuentro'), 'event');
  assert.equal(ids(''), 'task,done,booking,note,event');
  assert.equal(ids('zz-no-match'), ''); assert.equal(ids('   '), ids(''));
  assert.equal(ids('', 'all', 'all', 'archive'), 'archive');
  assert.equal(ids('reunion'), 'task', 'No deleted, rejected or linked-only records appear');
  assert.equal(JSON.stringify([sample, archive]), before);
});

test('type/archive filters combine with text; personal completion never interprets acceptance or booking contracts as done', () => {
  const api = fixture().load('data/calendarSearch.ts'), index = api.indexCalendarSearch(sample, archive);
  const ids = (...args) => api.filterCalendarSearch(index, ...args).map(item => item.entry.id).join(',');
  assert.equal(ids('', 'task', 'pending'), 'task'); assert.equal(ids('revision', 'task', 'done'), 'done');
  assert.equal(ids('', 'all', 'done'), 'done'); assert.equal(ids('', 'booking', 'done'), '');
  assert.equal(ids('', 'event', 'done'), ''); assert.equal(ids('', 'booking'), 'booking');
  assert.equal(ids('', 'note'), 'note'); assert.equal(ids('', 'event'), 'event');
  assert.equal(ids('medica', 'note', 'all', 'archive'), 'archive');
  assert.equal(ids('medica', 'task', 'all', 'archive'), '');
  const meta = api.calendarSearchMeta(sample[2], 'es', key => key);
  assert.match(meta, /Reserva.*12\/12\/2030.*09:30.*booking_state_accepted/);
  assert.doesNotMatch(meta, /Realizada/);
  assert.equal(api.calendarSearchTitle(sample[3], 'es'), 'Información médica');
});

function mountSheet({ lang = 'es', handedness = 'right', viewport = { width: 390, height: 844 } } = {}) {
  const app = fixture({ viewport, platform: 'ios', insets: { top: 47, bottom: 34, left: 0, right: 0 } });
  app.setLanguage(lang);
  const { CalendarSearchSheet } = app.load('components/CalendarSearchSheet.tsx');
  const opened = [], props = { entries: sample, archiveNotes: archive, handedness, onOpenEntry: item => opened.push(item), onClose: () => opened.push('close') };
  let tree;
  const render = () => tree = app.render(CalendarSearchSheet, props);
  render();
  const list = () => byId(tree, 'calendar-search-results');
  const press = id => {
    const header = list().props.ListHeaderComponent;
    (byId(tree, id) ?? byId(header, id)).props.onPress(); render();
  };
  return { app, props, opened, render, list, press, get tree() { return tree; },
    query(text) { byId(tree, 'calendar-search-input').props.onChangeText(text); render(); },
    ids() { return list().props.data.map(item => item.entry.id).join(','); } };
}

test('sheet supports empty text, filters, no results, clear, live updates and language without calendar mutations', () => {
  const m = mountSheet(), snapshot = JSON.stringify(sample);
  assert.equal(m.ids(), 'task,done,booking,note,event');
  m.query('ULTIMA'); m.press('calendar-search-type-task'); m.press('calendar-search-status-done');
  assert.equal(m.ids(), 'done');
  m.query('not-found'); assert.equal(m.ids(), ''); assert.equal(m.list().props.ListEmptyComponent.children[0], 'Sin resultados');
  m.press('calendar-search-clear'); assert.equal(m.ids(), 'task,done,booking,note,event');
  m.press('calendar-search-type-booking');
  assert.equal(byId(m.list().props.ListHeaderComponent, 'calendar-search-status'), undefined);
  m.list().props.renderItem({ item: m.list().props.data[0] }).props.onPress();
  assert.equal(m.opened[0], sample[2]);
  m.press('calendar-search-type-note'); m.press('calendar-search-archive-archive'); assert.equal(m.ids(), 'archive');
  m.props.archiveNotes = []; m.render(); assert.equal(m.ids(), '');
  m.press('calendar-search-clear'); assert.equal(m.ids(), 'task,done,booking,note,event');
  m.press('calendar-search-close'); assert.equal(m.opened.at(-1), 'close');
  m.app.setLanguage('en'); m.query('not-found');
  assert.equal(m.list().props.ListEmptyComponent.children[0], 'No results');
  assert.equal(JSON.stringify(sample), snapshot);
});

for (const viewMode of ['dia', 'semana', 'mes_lineal']) test(`${viewMode}: results open existing current details and archive notes; closing preserves original board/navigation`, () => {
  const app = fixture(), { AgendaBoard } = app.load('components/AgendaOperativa.tsx');
  const selectedDays = [], openedNotes = [], props = { goLog: sample, archiveNotes: archive, searchable: true,
    selectedDateISO: '2026-11-16', calViewMonth: '2026-11', viewMode, onSelectDay: day => selectedDays.push(day),
    onOpenNote: item => openedNotes.push(item), renderHeader: navigation => navigation };
  let tree = app.render(AgendaBoard, props);
  const scrollRef = nodes(tree, n => n.type === 'GHScrollView' && n.props.horizontal)[0].props.ref;
  byId(tree, 'calendar-search-open').props.onPress({ stopPropagation() {} }); tree = app.render(AgendaBoard, props);
  const sheet = () => nodes(tree, n => n.type?.name === 'CalendarSearchSheet')[0];
  const staleOpen = sheet().props.onOpenEntry;
  props.goLog = sample.map(item => item.id === 'booking' ? { ...item, detail: 'Newest booking' } : item);
  tree = app.render(AgendaBoard, props); staleOpen(sample[2]); tree = app.render(AgendaBoard, props);
  const detail = byId(tree, 'entry-details-modal'); assert.ok(detail?.props.visible);
  assert.equal(byId(tree, 'calendar-search-sheet'), undefined, 'The board delegates its sheet to the reusable component');
  assert.ok(sheet(), 'Search stays mounted under the existing detail');
  const detailBody = nodes(detail, n => n.type === 'Text').flatMap(n => n.children).join(' ');
  assert.match(detailBody, /Newest booking/);
  const closedDetail = nodes(tree, n => n.type?.name === 'GoCloseButton' && n.props.accessibilityLabel === 'Cerrar detalle')[0];
  assert.ok(closedDetail); closedDetail.props.onPress(); tree = app.render(AgendaBoard, props);
  assert.ok(sheet()); sheet().props.onOpenEntry(archive[0]); assert.equal(openedNotes[0], archive[0]);
  props.goLog = []; props.archiveNotes = []; tree = app.render(AgendaBoard, props);
  staleOpen(sample[2]); tree = app.render(AgendaBoard, props);
  assert.equal(byId(tree, 'entry-details-modal'), undefined, 'Removed/unauthorized results cannot reopen a stale detail');
  sheet().props.onClose(); tree = app.render(AgendaBoard, props);
  assert.equal(sheet(), undefined);
  assert.equal(nodes(tree, n => n.type === 'GHScrollView' && n.props.horizontal)[0].props.ref, scrollRef);
  assert.equal(props.selectedDateISO, '2026-11-16'); assert.equal(props.calViewMonth, '2026-11'); assert.equal(props.viewMode, viewMode);
  assert.equal(selectedDays.length, 0);
});

test('search opt-in uses the existing authorized projection and scoped archive, with no new storage/network sources', () => {
  const source = readFileSync('components/AgendaOperativa.tsx', 'utf8');
  assert.match(source, /const goLog = useGoCalendarEntries\(calendarEntries\)/);
  assert.match(source, /CalendarSearchSheet entries=\{goLog\} archiveNotes=\{archiveNotes\}/);
  const component = find(n => ts.isJsxSelfClosingElement(n) && n.tagName.getText(ast) === 'AgendaBoard' && n.attributes.properties.some(p => p.name?.getText(ast) === 'searchable'));
  const archiveProp = component.attributes.properties.find(p => p.name?.getText(ast) === 'archiveNotes');
  assert.match(archiveProp.getText(ast), /noteInScope\(entry,completionIdentity.scope!\)/);
  for (const file of ['data/calendarSearch.ts', 'components/CalendarSearchSheet.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /\bfetch\s*\(|AsyncStorage|supabase|useQuery|setGoLog/);
  }
});

test('real calendar ownership hook and scoped note archive clear previous-user matches while identity changes', async () => {
  const { React, createRoot, document, evaluate } = require('./helpers/react-lifecycle.cjs');
  const completion = evaluate('lib/goActionCompletion.ts');
  let scope = { userId: 'owner-a', context: 'live:USER' }, identity = Promise.resolve('owner-a'), sessionChanged;
  const taskAccess = evaluate('lib/goTaskAccess.ts', { '@/data/booking': { getAuthenticatedUserId: () => identity } });
  const { useGoCalendarEntries } = evaluate('hooks/useGoCalendarEntries.ts', {
    './useActionCompletion': { useCompletionDocument: () => ({ doc: completion.emptyCompletionDocument(scope) }) },
    '@/lib/goActionCompletion': completion, '@/lib/goTaskAccess': taskAccess,
    '@/lib/sessionEvents': { onSessionChanged: callback => { sessionChanged = callback; return () => {}; } },
  });
  const app = fixture(), api = app.load('data/calendarSearch.ts'), { noteInScope } = app.load('lib/unifiedNotes.ts');
  const entries = [entry('private-a', { ownerUserId: 'owner-a' }), entry('private-b', { ownerUserId: 'owner-b' })];
  const notes = [note('archive-a', 'archive', { ownerUserId: 'owner-a', taskContext: 'live:USER' }),
    note('archive-other-company', 'archive', { ownerUserId: 'owner-b', taskContext: 'live:BUSINESS:other' })];
  let index;
  function Probe() {
    index = api.indexCalendarSearch(useGoCalendarEntries(entries), notes.filter(item => noteInScope(item, scope)));
    return null;
  }
  const root = createRoot(document.createElement('div'));
  const settle = async action => React.act(async () => { action(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  try {
    await settle(() => root.render(React.createElement(Probe)));
    assert.equal(api.filterCalendarSearch(index, 'reunion').map(item => item.entry.id).join(','), 'private-a');
    assert.equal(api.filterCalendarSearch(index, '', 'all', 'all', 'archive').map(item => item.entry.id).join(','), 'archive-a');
    let resolveIdentity;
    identity = new Promise(resolve => { resolveIdentity = resolve; }); scope = { userId: 'owner-b', context: 'live:USER' };
    await settle(() => sessionChanged());
    assert.equal(index.length, 0, 'No prior account data remains searchable during identity refresh');
    await settle(() => resolveIdentity('owner-b'));
    assert.equal(api.filterCalendarSearch(index, 'reunion').map(item => item.entry.id).join(','), 'private-b');
    assert.equal(api.filterCalendarSearch(index, '', 'all', 'all', 'archive').length, 0, 'Other-company archives remain excluded');
  } finally { await settle(() => root.unmount()); }
});

test('real screen host keeps the search under details and preserves query/filters; typing reuses the normalized index', async () => {
  const { React, createRoot, document, evaluate, rn } = require('./helpers/react-lifecycle.cjs');
  const controls = new Map();
  const Native = props => {
    if (props.testID) controls.set(props.testID, props);
    return React.createElement('div', { 'data-testid': props.testID }, props.children);
  };
  const native = { ...rn, View: Native, TouchableOpacity: Native, TextInput: Native, Text: Native, KeyboardAvoidingView: Native,
    Keyboard: { dismiss() {} }, FlatList: props => {
      controls.set(props.testID, props);
      return React.createElement(Native, null, props.ListHeaderComponent, props.data.length
        ? props.data.map(item => React.createElement(React.Fragment, { key: item.entry.id }, props.renderItem({ item }))) : props.ListEmptyComponent);
    } };
  const host = evaluate('components/ui/GoScreenModal.tsx', { 'react-native': native });
  const api = fixture().load('data/calendarSearch.ts'); let indexed = 0, back;
  const { CalendarSearchSheet } = evaluate('components/CalendarSearchSheet.tsx', {
    'react-native': native, '@expo/vector-icons': { Feather: () => null },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: 'es', t: key => key }) },
    './ui/GoScreenModal': host, './ui/GoCloseButton': { GoCloseButton: Native },
    '../data/calendarSearch': { ...api, indexCalendarSearch: (...args) => { indexed++; return api.indexCalendarSearch(...args); } },
  });
  function Probe() {
    const [search, setSearch] = React.useState(true), [selected, setSelected] = React.useState(null);
    return React.createElement(host.GoScreenHost, { registerBack: value => { back = value; } },
      React.createElement(Native, { testID: 'original-calendar' }, 'Calendar'),
      search && React.createElement(CalendarSearchSheet, { entries: sample, archiveNotes: archive, onClose: () => setSearch(false), onOpenEntry: setSelected }),
      selected && React.createElement(host.GoScreenModal, { onRequestClose: () => setSelected(null) },
        React.createElement(Native, { testID: 'selected-detail' }, selected.notes)));
  }
  const container = document.createElement('div'), root = createRoot(container);
  const settle = async action => React.act(async () => { action(); for (let i = 0; i < 12; i++) await Promise.resolve(); });
  try {
    await settle(() => root.render(React.createElement(Probe)));
    for (const text of ['u', 'ul', 'ULTIMA']) await settle(() => controls.get('calendar-search-input').onChangeText(text));
    await settle(() => controls.get('calendar-search-type-task').onPress());
    await settle(() => controls.get('calendar-search-status-done').onPress());
    assert.equal(indexed, 1, 'No per-keystroke rebuilding of the normalized index');
    await settle(() => controls.get('calendar-search-result-done').onPress());
    assert.ok(container.textContent.includes('Última revisión'));
    assert.equal(controls.get('calendar-search-input').value, 'ULTIMA');
    await settle(() => assert.equal(back(), true));
    assert.equal(controls.get('calendar-search-input').value, 'ULTIMA');
    assert.equal(controls.get('calendar-search-type-task').accessibilityState.selected, true);
    assert.equal(controls.get('calendar-search-status-done').accessibilityState.selected, true);
    assert.equal(indexed, 1);
    await settle(() => controls.get('calendar-search-close').onPress());
    assert.equal(container.textContent, 'Calendar');
    assert.equal(back(), false);
  } finally { await settle(() => root.unmount()); }
});

test('320/375/390/430 iPhone sheets keep the input/close reachable, safe areas and scrollable filters above results in both hands', () => {
  for (const width of [320, 375, 390, 430]) for (const handedness of ['left', 'right']) {
    const m = mountSheet({ handedness, viewport: { width, height: 667 } });
    const overlay = byId(m.tree, 'calendar-search-sheet');
    assert.equal(overlay.props.behavior, 'padding'); assert.equal(overlay.props.style[1].paddingTop, 47);
    const input = byId(m.tree, 'calendar-search-input'); assert.equal(input.props.style.minWidth, 0);
    const close = byId(m.tree, 'calendar-search-close'); assert.equal(close.props.touchSize, 44);
    const headingRow = nodes(m.tree, n => n.props?.style?.[1]?.flexDirection)[0];
    assert.equal(headingRow.props.style[1].flexDirection, handedness === 'left' ? 'row-reverse' : 'row');
    assert.equal(m.list().props.keyboardShouldPersistTaps, 'handled');
    assert.ok(m.list().props.ListHeaderComponent, 'Filters can scroll with the list when the keyboard reduces height');
  }
  const header = find(n => ts.isJsxAttribute(n) && n.name.getText(ast) === 'testID' && n.initializer?.text === 'calendar-header').parent.parent.parent;
  const scope = { exports: {}, React: { createElement: (type, props, ...children) => ({ type, props, children: children.flat(Infinity) }) },
    View: 'View', GoCalendarViewSelector: 'Selector', TouchableOpacity: 'Button', Feather: 'Icon', GoCloseButton: 'Close',
    showBookingFromCal: false, insets: { top: 47, left: 0, right: 0 }, calBgViewMode: 'mes_lineal', changeCalendarView() {},
    demoBookingRepository: true, lang: 'es', monthNavigation: null };
  vm.runInNewContext(transpile('exports.tree = (' + header.getText(ast) + ')'), scope);
  const settings = nodes(scope.exports.tree, n => n.type === 'Close')[0]; assert.equal(settings.props.touchSize, 44);
  // Even with the optional customer shortcut, leave space for the existing month arrows and two-line title.
  const reserved = 16 + 3 * 4 + 60 + 44 + 44 + 44 + 2 * 32;
  assert.ok(320 - reserved >= 32);
});
