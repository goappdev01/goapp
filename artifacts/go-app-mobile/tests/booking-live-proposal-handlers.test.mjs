import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../package.json', import.meta.url));
const ts = require('typescript');
const source = fs.readFileSync(new URL('../app/index.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function handler(name) {
  let initializer;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer?.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(initializer, `${name} exists`);
  return `const ${name} = ${initializer};`;
}

function fixture(entry) {
  const calls = [];
  const alerts = [];
  const context = {
    customerBookings: { entries: [] }, goLog: [entry], lang: 'es',
    Alert: { alert: (...args) => alerts.push(args) },
    bookingProposalDescription: () => 'Propuesta verificada',
    negotiateRealBooking: (...args) => { calls.push(args); return Promise.resolve(); },
    showToast: () => {}, showBookingChangeError: error => { throw error; },
    persistLog: () => { throw new Error('Una reserva real no debe guardarse solo en el registro local'); },
  };
  const js = ts.transpileModule(`${handler('acceptProposal')}\n${handler('rejectProposal')}\nglobalThis.handlers={acceptProposal,rejectProposal};`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  vm.runInNewContext(js, context);
  return { ...context.handlers, calls, alerts };
}

test('a live business proposal is accepted and rejected through the authenticated booking command', async () => {
  for (const action of ['accept', 'reject']) {
    const f = fixture({ id: 'entry-1', reservationId: 'booking-1', businessBooking: true,
      ownerUserId: 'owner-1', bookingChangeRevision: 3, changeProposal: { id: 'proposal-1' } });
    f[action === 'accept' ? 'acceptProposal' : 'rejectProposal']('entry-1');
    if (action === 'accept') {
      assert.equal(f.alerts.length, 1);
      f.alerts[0][2][1].onPress();
    }
    await Promise.resolve();
    assert.equal(f.calls.length, 1);
    assert.equal(f.calls[0][0], 'booking-1');
    assert.equal(f.calls[0][1], action);
    assert.equal(f.calls[0][2].proposalId, 'proposal-1');
    assert.equal(f.calls[0][2].expectedRevision, 3);
    assert.equal(f.calls[0][3], 'owner-1');
  }
});

test('a live proposal without verified ownership or proposal id cannot fall back to local acceptance', () => {
  const f = fixture({ id: 'entry-2', reservationId: 'booking-2', businessBooking: true });
  f.acceptProposal('entry-2');
  f.rejectProposal('entry-2');
  assert.equal(f.calls.length, 0);
  assert.equal(f.alerts.length, 2);
});
