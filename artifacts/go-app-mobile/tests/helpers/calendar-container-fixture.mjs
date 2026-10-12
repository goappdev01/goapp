import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import vm from "node:vm";
const require = createRequire(path.join(process.cwd(), "package.json"));
const ts = require("typescript");
const source = readFileSync('app/index.tsx', 'utf8');
export const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
export function find(predicate, root = ast) {
  let result;
  function visit(node) { if (!result && predicate(node)) result = node; ts.forEachChild(node, visit); }
  visit(root); assert.ok(result, 'Expected calendar implementation'); return result;
}
export const declaration = name => find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === name).initializer.getText(ast);
export const transpile = code => ts.transpileModule(code, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
}).outputText;
function evaluate(code, globals = {}) {
  const scope = { exports: {}, ...globals }; vm.runInNewContext(transpile(code), scope); return scope.exports;
}
export function fixture() {
  const calls = [];
  const scope = vm.createContext({
    exports: {}, Date, Set, Math, JSON,
    calOpen: true, fieldSelectorOpen: false, calQuickCreateOpen: false, calConfigVisible: false, calReservasOpen: false,
    dateISODraft: '2027-02-28', dateDraft: 'Dom 28/02', calBgViewMode: 'mes_lineal', calBgViewMonth: '2027-02',
    calendarSlotSavingRef: { current: false }, calendarSlotDraftRef: { current: null }, fieldSelectorSaveBusyRef: { current: false }, calendarTaskContextRef: { current: null }, qdReturnTimerRef: { current: null }, qdFlowActiveRef: { current: false },
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
