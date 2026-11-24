import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const react = { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children }) };
const compile = (file, jsx = false) => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS,
  jsx: jsx ? ts.JsxEmit.React : undefined, esModuleInterop: true,
} }).outputText;
function load(file, jsx = false) {
  const exports = {};
  vm.runInNewContext(compile(file, jsx), { exports, require: name => {
    if (name === 'react') return react;
    if (name === 'react-native') return { Text: 'Text', View: 'View' };
    throw Error(`Unexpected import ${name}`);
  } }, { filename: file });
  return exports;
}
const { bookingPaymentTerms } = load('data/bookingServices.ts');
const { PartialPaymentSummary } = load('components/booking/PartialPaymentSummary.tsx', true);
const nodes = node => node && typeof node === 'object' ? [node, ...node.children.flatMap(nodes)] : [];

test('partial reservation review has one gold rectangle, two amounts and a thin separator', () => {
  for (const [booking, venue, bookingAmount, venueAmount] of [
    [10, 90, '5,50 €', '49,50 €'],
    [30, 70, '16,50 €', '38,50 €'],
    [50, 50, '27,50 €', '27,50 €'],
  ]) {
    const terms = bookingPaymentTerms(55, 2, booking);
    const tree = PartialPaymentSummary({ terms, lang: 'es' });
    const lines = nodes(tree).filter(node => node.type === 'Text');
    const bookingRow = nodes(tree).find(node => node.props.testID === 'partial-payment-booking-row');
    const venueRow = nodes(tree).find(node => node.props.testID === 'partial-payment-venue-row');
    assert.equal(tree.props.testID, 'partial-payment-summary');
    assert.equal(tree.props.style.borderWidth, 1);
    assert.equal(lines.length, 4);
    assert.equal(bookingRow.props.accessibilityLabel, `Al reservar · ${booking} % · ${bookingAmount}`);
    assert.equal(venueRow.props.accessibilityLabel, `En el establecimiento · ${venue} % · ${venueAmount}`);
    assert.equal(bookingRow.props.style.flexDirection, 'row');
    assert.equal(venueRow.props.style.flexDirection, 'column');
    assert.equal(venueRow.children[0].props.numberOfLines, 1, 'the full venue label stays on its own line');
    assert.equal(terms.dueAtBookingCents + terms.dueAtVenueCents, terms.totalCents);
    assert.ok(lines.every(line => line.props.style.color === '#FACC15'));
    assert.equal(nodes(tree).filter(node => node.type === 'View' && node.props.style.height === 1).length, 1);
    assert.doesNotMatch([bookingRow, venueRow].map(row => row.props.accessibilityLabel).join(' '), /Previsto|Pago solicitado|Pago confirmado|Total pendiente|no disponible/i);
    assert.equal(terms.confirmedCents, 0);
  }
});
