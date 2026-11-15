import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const { build } = createRequire(path.resolve('../api-server/package.json'))('esbuild');
const out = path.resolve('../../tmp/finance-demo-model-' + process.pid + '.mjs');
await build({ entryPoints: ['../../lib/api-zod/src/index.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm' });
const model = await import(pathToFileURL(out));

function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, console, require(name) {
    if (name in modules) return modules[name];
    throw Error('Unexpected import ' + name);
  } });
  return exports;
}
const calculator = load('data/financialRevenueCalculator.ts', { '@workspace/api-zod': model });
const demo = load('data/financialDemo.ts', { '@workspace/api-zod': model, './financialRevenueCalculator': calculator });
const rows = doc => calculator.revenueCalculatorRows(doc, 'REAL');
const esHair = doc => rows(doc).find(row => row.countryCode === 'ES' && row.activityId === 'go_peluquerias');

test('DEMO starts with clearly synthetic local inputs and the existing eight-column calculations', () => {
  let doc = demo.createFinancialDemoDocument(2026);
  assert.equal(doc.countries.length, 20);
  assert.equal(doc.activities.length, 5);
  assert.equal(doc.markets.length, 100);
  assert.match(doc.title, /DEMO/);
  assert.ok(doc.sources.every(source => source.organization.includes('FICTICIOS')));
  assert.deepEqual([esHair(doc).companies, esHair(doc).monthly, esHair(doc).annual], [95, 2755, 33060]);
  doc = calculator.updateRevenueCalculator(doc, 'go_peluquerias', 'ES', 'REAL', 'share', 10);
  doc = calculator.updateRevenueCalculator(doc, 'go_peluquerias', 'ES', 'REAL', 'fee', 30);
  assert.deepEqual([esHair(doc).companies, esHair(doc).monthly, esHair(doc).annual], [190, 5700, 68400]);
  assert.equal(esHair(demo.createFinancialDemoDocument(2026)).monthly, 2755, 'a new DEMO has no persistent copy');
});

test('ADMIN can enter DEMO despite a failed finance access check without calling save endpoints', async () => {
  const slots = [], effects = [], calls = [];
  let index = 0, effectIndex = 0, pending = [], tree;
  const admin = { userId: 'admin-synthetic', allowed: true, checking: false };
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    Fragment: 'Fragment',
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useMemo: fn => fn(),
    useEffect(fn, deps) { const i = effectIndex++, previous = effects[i]; if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) { const item = { deps, cleanup: null }; effects[i] = item; pending.push(() => { previous?.cleanup?.(); item.cleanup = fn(); }); } },
  };
  const screen = load('components/financial/FinancialPlanScreen.tsx', {
    react: { ...react, default: react },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator' },
    'expo-router': { useNavigation: () => ({ setOptions() {} }) },
    '@/contexts/GoAdminAccessContext': { useAdminAccess: () => admin },
    '@/lib/sessionEvents': { onSessionChanged: () => () => {} },
    '@/data/financialCalculatorSession': { openRevenueCalculator: async () => { calls.push('access'); throw Error('La persistencia financiera todavía no está instalada en este entorno.'); } },
    '@/data/financialDemo': demo,
    './FinancialRevenueTable': { FinancialRevenueTable: 'RevenueTable' },
    './FinancialUI': { FinanceButton: 'Button', financeStyles: { root: {}, content: {}, note: {}, error: {} } },
  }).FinancialPlanScreen;
  const render = () => { index = effectIndex = 0; tree = screen(); while (pending.length) pending.shift()(); return tree; };
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(all)];
  const find = predicate => { const node = all(render()).find(predicate); assert.ok(node); return node; };
  render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 1);
  find(node => node.props.label === 'Probar calculadora DEMO').props.onPress();
  let table = find(node => node.type === 'RevenueTable');
  assert.equal(table.props.demo, true);
  table.props.update(doc => calculator.updateRevenueCalculator(doc, 'go_peluquerias', 'ES', 'REAL', 'fee', 30));
  table = find(node => node.type === 'RevenueTable');
  assert.equal(esHair(table.props.doc).monthly, 2850);
  assert.equal(calls.length, 1, 'DEMO edits and calculation cannot call finance API');
  admin.allowed = false;
  assert.equal(all(render()).some(node => node.type === 'RevenueTable' || node.props.label === 'Probar calculadora DEMO'), false);
  effects.forEach(effect => effect.cleanup?.());
});
