import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const h = require('./helpers/unified-note-fixture.cjs');
const source = fs.readFileSync('app/index.tsx', 'utf8');
const ast = h.ts.createSourceFile('app/index.tsx', source, h.ts.ScriptTarget.Latest, true, h.ts.ScriptKind.TSX);
const declaration = name => {
  let found;
  function visit(node) {
    if (h.ts.isFunctionDeclaration(node) && node.name?.text === name) found = node;
    h.ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `missing ${name}`);
  return found.getText(ast);
};

test('Calendar and Listados quick-note entrypoints use the shared composer and keep their source', () => {
  const text = source;
  assert.match(text, /handleCalQuickCreate[\s\S]*?openQuickNoteFrom\("calendar"/);
  assert.match(text, /handleQuickCreate[\s\S]*?openQuickNoteFrom\("list"/);
  assert.match(text, /openQuickNoteFrom\("calendar",o\.kind/);
  assert.match(text, /openCalendarSlotTask[\s\S]*?openFieldSelector\("NOTA_INTERNA"/,
    'time-slot task creation retains its exact scheduling workflow');
});

test('quick note access seeds the shared editor and preserves the external-note GO attachment exception', () => {
  const functions = [declaration('openUnifiedNoteComposer'), declaration('openQuickNoteFrom')].join('\n');
  const calls = [];
  const ctx = {
    unifiedNoteOriginRef: { current: 'landing' },
    setUnifiedNoteInitial: value => calls.push(['initial', value]),
    setUnifiedNoteSeed: value => calls.push(['seed', h.plain(value)]),
    setNotesOpen: value => calls.push(['visible', value]),
    openFieldSelector: (...args) => calls.push(['legacy-go-attachment', ...args]),
    isActivelyCreating: false,
    categorySelected: false,
  };
  vmRun(functions, ctx, ['openUnifiedNoteComposer', 'openQuickNoteFrom']);
  ctx.openQuickNoteFrom('calendar', 'NOTA_INTERNA', 'Revisar cita', '2026-11-20');
  assert.deepEqual(calls.slice(-3), [
    ['initial', null],
    ['seed', { title: 'Revisar cita', dateISO: '2026-11-20' }],
    ['visible', true],
  ]);
  assert.equal(ctx.unifiedNoteOriginRef.current, 'calendar');

  calls.length = 0;
  ctx.openQuickNoteFrom('list', 'NOTA_INTERNA', 'Llamar al taller');
  assert.equal(ctx.unifiedNoteOriginRef.current, 'list');
  assert.deepEqual(calls.find(call => call[0] === 'seed'), ['seed', { title: 'Llamar al taller' }]);

  calls.length = 0;
  ctx.isActivelyCreating = true;
  ctx.openQuickNoteFrom('list', 'NOTA_EXTERNA', 'Avisar al cliente');
  assert.deepEqual(calls, [['legacy-go-attachment', 'NOTA_EXTERNA', 'Avisar al cliente', '', undefined]]);
});

test('cancel returns to its mounted source; successful Listados save stays in Listados and Calendar uses its destination navigation', () => {
  assert.match(declaration('renderUnifiedNoteEditor'), /if\(!state\?\.saved\)unifiedNoteOriginRef\.current="landing"/);
  assert.doesNotMatch(declaration('renderUnifiedNoteEditor'), /setListOpen\(false\)|setCalOpen\(false\)/);
  const calls = [];
  const ctx = {
    unifiedNoteOriginRef: { current: 'list' },
    showToast: (...args) => calls.push(['toast', ...args]),
    openSavedNoteDestination: (...args) => calls.push(['destination', ...args]),
  };
  vmRun(declaration('handleUnifiedNoteSaved'), ctx, ['handleUnifiedNoteSaved']);
  ctx.handleUnifiedNoteSaved({ id: 'created-note' }, 'Nota guardada.');
  assert.deepEqual(calls, [['toast', 'Nota guardada.', 'success']]);
  assert.equal(ctx.unifiedNoteOriginRef.current, 'landing');

  calls.length = 0;
  ctx.unifiedNoteOriginRef.current = 'calendar';
  ctx.handleUnifiedNoteSaved({ id: 'created-note' }, 'Guardada en Calendario.');
  assert.deepEqual(calls, [['destination', { id: 'created-note' }, 'Guardada en Calendario.']]);
});

function vmRun(functions, context, names) {
  const vm = require('node:vm');
  const exports = names.map(name => `globalThis.${name}=${name};`).join('');
  vm.runInNewContext(h.compile(`${functions};${exports}`), context);
}
