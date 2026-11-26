import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = fs.readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const compile = source => ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
} }).outputText;
function load(path) {
  const context = { exports: {} };
  vm.runInNewContext(compile(fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8')), context);
  return context.exports;
}
const core = load('lib/goActionCompletion.ts');
const selection = load('data/bookingChangeAvailability.ts');
const panels = load('components/landing/landingPanels.ts');
function handler(name) {
  let value;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) value = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(value, name);
  return `const ${name} = ${value};`;
}
const S = { userId: 'owner', context: 'live:USER' };
const plain = value => JSON.parse(JSON.stringify(value));
const booking = (patch = {}) => ({ id: 'display', ownerUserId: S.userId, actionContext: S.context,
  kind: 'sent', type: 'GO_RESERVA', customerBooking: true, reservationId: 'reservation', bookingId: 'reservation',
  businessId: 'company', dateISO: '2035-01-09', date: '9 enero', time: '11:30', duration: '45min',
  bookingStatus: 'confirmada', bookingServerStatus: 'CONFIRMED', estado: 'aceptado',
  contactName: 'Empresa original', serviceId: 'cut', professionalId: 'professional', professionalName: 'Profesional',
  bookingServices: [{ id: 'cut', title: 'Corte', durationMinutes: 45, price: 20 }],
  bookingCatalog: { rootIds: ['cut'], selectedAssociationIds: [], totalPrice: 20 }, ...patch });

test('the actual ACCIONES button is wired to the shared entry dispatcher', () => {
  const render = handler('renderLandingActionCompletion');
  assert.match(render, /onPropose=\{openCompletionChange\}/);
  assert.doesNotMatch(render, /calFlow\.open|openBookingProposal\(/);
});

function fixture(entry, overrides = {}) {
  const calls = [], errors = [], drafts = [], calendars = [], writes = [];
  const context = {
    ...core, ...selection, ...panels, lang: 'es',
    actionCompletion: { scope: S, active: () => true, candidates: [entry], status: () => undefined },
    personalVisibilitySource: { current: { candidates: [entry] } },
    customerBookings: { bookings: [], entries: [entry] }, ownerDemo: {}, bCfg: {},
    proposalRepository: () => undefined,
    setBookingProposal: draft => drafts.push(draft),
    setLandingActionsOpen: value => calls.push(['actions', value]),
    setLandingDetailsId: value => calls.push(['detail', value]), landingDetailsId: null,
    entryIsInternal: e => e.type === 'TAREA_INTERNA',
    isGoNoteReminderTarget: e => e.intentKey === 'nota_interna',
    noteEditAfterDetailsRef: { current: null }, setNoteDetailCloseRequested: () => {},
    noteIdentityRef: { current: { ready: true, scope: S } },
    openUnifiedNote: e => calls.push(['note', e]),
    setCalOpen: value => calls.push(['calendar', value]),
    calFlow: { open: opts => calendars.push(opts) },
    currentReceivedIdRef: { current: null }, proposalReturnRef: { current: null },
    _validateProposalSlot: () => ({ valid: true }), internalEntryCommand: (...args) => args,
    changeTask: async (...args) => writes.push(args),
    sendSuggestChangeFromCal: result => writes.push(result),
    persistBookingProposal: async (...args) => writes.push(args),
    showToast: message => errors.push(message),
    showBookingChangeError: error => errors.push(error.message),
    Alert: { alert: (_title, message) => errors.push(message) },
    formatISODate: () => '2035-01-01', getToday: () => new Date('2035-01-01'),
    setTimeout: fn => fn(), bookingReturnDateRef: { current: null }, setEmpresaOpen: () => {},
    ...overrides,
  };
  const names = ['openBookingProposal', 'openEntryChange', 'openCompletionChange', 'confirmBookingDraft'];
  vm.runInNewContext(compile(names.map(handler).join('\n') + '\nglobalThis.handlers={' + names.join(',') + '};'), context);
  return { ...context.handlers, calls, errors, drafts, calendars, writes, context };
}

for (const dateISO of ['2035-01-09', '2020-01-09']) test(`ACCIONES and visit details share the services flow: ${dateISO}`, () => {
  const e = booking({ dateISO }), before = JSON.stringify(e), f = fixture(e);
  assert.equal(f.openCompletionChange(e), true);
  assert.equal(f.calendars.length, 0, 'reservations must not enter a time-only calendar');
  assert.equal(f.drafts.length, 1);
  assert.equal(f.drafts[0].entry, e);
  assert.equal(f.drafts[0].dateISO, dateISO);
  assert.equal(f.drafts[0].selection.business.id, e.businessId);
  assert.equal(f.drafts[0].selection.staff.id, e.professionalId);
  assert.deepEqual(plain(f.drafts[0].selection.services), e.bookingServices);
  assert.equal(f.openEntryChange(e), true);
  assert.deepEqual(plain(f.drafts[0]), plain(f.drafts[1]));
  assert.deepEqual(f.calls.filter(c => c[0] === 'actions'), [['actions', false]]);
  assert.equal(JSON.stringify(e), before);
  assert.equal(f.writes.length, 0, 'opening/cancelling a draft does not persist a proposal');
});

test('resolve current reservation by canonical identity, retaining current services and revision', () => {
  const e = booking(), current = { ...e, id: 'canonical-projection', bookingChangeRevision: 4,
    bookingServices: [{ id: 'cut', title: 'Corte actualizado', durationMinutes: 45, price: 20 }] };
  const f = fixture(current);
  assert.equal(f.openCompletionChange(e), true);
  assert.equal(f.drafts[0].entry, current);
  assert.equal(f.drafts[0].entry.bookingChangeRevision, 4);
  assert.equal(f.drafts[0].selection.services[0].title, 'Corte actualizado');
});

for (const scenario of ['foreign', 'scope', 'changed', 'missing', 'done', 'cancelled', 'completed', 'metadata']) {
  test(`an impediment is reported without dismissing ACCIONES: ${scenario}`, () => {
    const e = booking(), f = fixture(e), model = f.context.actionCompletion;
    if (scenario === 'foreign') e.ownerUserId = 'someone-else';
    if (scenario === 'scope') model.active = () => false;
    if (scenario === 'changed') model.candidates = [{ ...e, time: '12:00' }];
    if (scenario === 'missing') model.candidates = [];
    if (scenario === 'done') model.status = () => 'done';
    if (scenario === 'cancelled') e.bookingStatus = 'cancelada';
    if (scenario === 'completed') e.bookingServerStatus = 'COMPLETED';
    if (scenario === 'metadata') e.businessId = undefined;
    assert.equal(f.openCompletionChange(e), false);
    assert.equal(f.errors.length, 1);
    assert.equal(f.drafts.length + f.calendars.length + f.writes.length, 0);
    assert.equal(f.calls.filter(c => c[0] === 'actions').length, 0);
  });
}

test('business reservations keep the business actor, company and services', () => {
  const scope = { ...S, context: 'live:BUSINESS:company' };
  const e = booking({ customerBooking: false, businessBooking: true, actionContext: scope.context });
  const f = fixture(e, { actionCompletion: { scope, active: () => true, candidates: [e], status: () => undefined }, bCfg: { businessName: 'Empresa' } });
  assert.equal(f.openCompletionChange(e), true);
  assert.equal(f.drafts[0].actor, 'business');
  assert.equal(f.drafts[0].selection.business.id, e.businessId);
});

test('notes and internal tasks use their existing editor/update path; cancellation writes nothing', async () => {
  const note = { id: 'note', kind: 'sent', type: 'TAREA', ownerUserId: S.userId, actionContext: S.context,
    intentKey: 'nota_interna', dateISO: '2020-01-09', time: '11:30' };
  const n = fixture(note);
  assert.equal(n.openCompletionChange(note), true);
  assert.equal(n.calls.find(c => c[0] === 'note')[1], note);
  assert.equal(n.calendars.length + n.writes.length, 0);
  const task = { ...note, type: 'TAREA_INTERNA', intentKey: 'generico' }, f = fixture(task);
  assert.equal(f.openCompletionChange(task), true);
  assert.equal(f.calendars[0].initialTime, task.time);
  f.calendars[0].onCancel();
  assert.equal(f.writes.length, 0);
  f.openCompletionChange(task);
  f.calendars[1].onSave({ dateISO: '2035-01-09', time: '12:00' });
  await Promise.resolve();
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][1], task);
});

test('an ordinary activity keeps its original identity, time and existing proposal callback', () => {
  const e = { id: 'activity', ownerUserId: S.userId, actionContext: S.context, kind: 'sent',
    type: 'GO', estado: 'aceptado', dateISO: '2020-01-09', date: '9 enero', time: '11:30', duration: '45min' };
  const f = fixture(e);
  assert.equal(f.openCompletionChange(e), true);
  assert.equal(f.context.currentReceivedIdRef.current, e.id);
  assert.equal(f.context.proposalReturnRef.current, 'landing');
  assert.equal(f.calendars[0].initialDateISO, e.dateISO);
  assert.equal(f.calendars[0].initialTime, e.time);
  assert.equal(f.calendars[0].initialDuration, e.duration);
  f.calendars[0].onCancel();
  assert.equal(f.writes.length, 0);
});

test('switching account or changing the action during a calendar draft cannot write through a stale callback', () => {
  for (const type of ['GO', 'TAREA_INTERNA']) {
    const e = { id: 'activity', ownerUserId: S.userId, actionContext: S.context, kind: 'sent',
      type, estado: 'aceptado', dateISO: '2020-01-09', time: '11:30', duration: '45min' };
    for (const reason of ['account', 'schedule']) {
      const f = fixture(e);
      f.openCompletionChange(e);
      if (reason === 'account') f.context.actionCompletion.active = () => false;
      else f.context.personalVisibilitySource.current.candidates = [{ ...e, time: '12:00' }];
      const draft = { dateISO: '2035-01-09', time: '12:30' };
      assert.ok(f.calendars[0].validate(draft));
      f.calendars[0].onSave(draft);
      assert.equal(f.writes.length, 0);
      assert.equal(f.errors.length, 1);
    }
  }
});

test('changed services and future date submit via the existing proposal contract without mutating original', async () => {
  const e = booking({ dateISO: '2020-01-09' }), before = JSON.stringify(e), f = fixture(e);
  f.openCompletionChange(e);
  const draft = { slot: { startDatetime: '2035-01-09T12:00:00', startInstant: '2035-01-09T11:00:00Z' },
    selection: { serviceIds: ['cut', 'wash'], staffId: 'professional', durationMinutes: 60,
      catalogSnapshot: { rootIds: ['cut', 'wash'], selectedAssociationIds: [], totalPrice: 30 } } };
  await f.confirmBookingDraft(e, draft);
  assert.equal(f.writes.length, 1);
  const [original, input, actor] = f.writes[0];
  assert.equal(original, e); assert.equal(actor, 'customer');
  assert.equal(input.dateISO, '2035-01-09'); assert.equal(input.time, '12:00');
  assert.equal(input.selection, draft.selection);
  assert.equal(JSON.stringify(e), before);
});
