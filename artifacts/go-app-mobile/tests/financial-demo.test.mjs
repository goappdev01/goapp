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
  assert.equal(doc.markets.length, 1, 'no market statistics are invented for other selections');
  assert.match(doc.title, /DEMO/);
  assert.ok(doc.sources.every(source => source.organization.includes('FICTICIOS')));
  assert.deepEqual([esHair(doc).companies, esHair(doc).monthly, esHair(doc).annual], [2304, 66816, 801792]);
  assert.equal(rows(doc).find(row => row.countryCode === 'FR' && row.activityId === 'go_restaurantes').market, null);
  doc = calculator.updateRevenueCalculator(doc, 'go_peluquerias', 'ES', 'REAL', 'fee', 30);
  assert.deepEqual([esHair(doc).companies, esHair(doc).monthly, esHair(doc).annual], [2304, 69120, 829440]);
  doc = demo.updateFinancialDemoMarket(doc, 'go_peluquerias', 'ES', 1000);
  assert.equal(esHair(doc).companies, 50);
  doc = demo.updateFinancialDemoMarket(doc, 'go_peluquerias', 'ES', Number.NaN);
  assert.equal(esHair(doc).monthly, 1500, 'invalid drafts preserve the last valid number');
  assert.equal(doc.markets[0].sourceId, 'go_demo_local', 'user-entered figures remain unverified local inputs');
  assert.equal(model.financialDocumentSchema.safeParse(doc).success, true);
  assert.equal(esHair(demo.createFinancialDemoDocument(2026)).monthly, 66816, 'a new DEMO has no persistent copy');
});

test('ADMIN can enter persistent local DEMO despite a failed finance access check without calling save endpoints', async () => {
  const slots = [], refs = [], effects = [], calls = [], saves = [], scrolls = [];
  let dimensions = { width: 390, height: 844 };
  let index = 0, refIndex = 0, effectIndex = 0, pending = [], tree;
  const admin = { userId: 'admin-synthetic', allowed: true, checking: false };
  const react = {
    createElement: (type, props, ...children) => { if (type === 'ScrollView' && props?.ref) props.ref.current = { scrollTo: value => scrolls.push(value) }; return { type, props: props || {}, children: children.flat(Infinity) }; },
    Fragment: 'Fragment',
    useState(initial) { const i = index++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useMemo: fn => fn(),
    useRef(value) { const i = refIndex++; return refs[i] ||= { current: value }; },
    useEffect(fn, deps) { const i = effectIndex++, previous = effects[i]; if (!previous || deps.some((value, j) => !Object.is(value, previous.deps[j]))) { const item = { deps, cleanup: null }; effects[i] = item; pending.push(() => { previous?.cleanup?.(); item.cleanup = fn(); }); } },
  };
  const screen = load('components/financial/FinancialPlanScreen.tsx', {
    react: { ...react, default: react },
    'react-native': { View: 'View', Text: 'Text', ScrollView: 'ScrollView', ActivityIndicator: 'ActivityIndicator', useWindowDimensions: () => dimensions },
    'expo-router': { useNavigation: () => ({ setOptions() {} }) },
    '@/contexts/GoAdminAccessContext': { useAdminAccess: () => admin },
    '@/lib/sessionEvents': { onSessionChanged: () => () => {} },
    '@/data/financialCalculatorSession': { openRevenueCalculator: async () => { calls.push('access'); throw Object.assign(Error('La persistencia financiera todavía no está instalada en este entorno.'), { code: 'FINANCE_SETUP_REQUIRED' }); } },
    '@/data/financialDemoStore': { loadFinancialDemo: async () => ({ state: { doc: demo.createFinancialDemoDocument(2026), countryCode: 'ES', activityId: 'go_peluquerias' }, unsaved: false }), saveFinancialDemo: async (_owner, state) => { saves.push(state); } },
    '@/components/ui/GoNavigationRail': { GO_NAVIGATION_OVERLAY_CLEARANCE: 178 },
    './FinancialRevenueTable': { FinancialRevenueTable: 'RevenueTable' },
    './FinancialSimpleDemoTable': { FinancialSimpleDemoTable: 'SimpleDemoTable' },
    './FinancialUI': { FinanceButton: 'Button', financeStyles: { root: {}, content: {}, note: {}, error: {} } },
  }).FinancialPlanScreen;
  const render = () => { index = refIndex = effectIndex = 0; tree = screen(); while (pending.length) pending.shift()(); return tree; };
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(all)];
  const find = predicate => { const node = all(render()).find(predicate); assert.ok(node); return node; };
  render();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(render().type, 'View', 'the local calculator fills the available panel');
  dimensions = { width: 844, height: 390 }; render();
  dimensions = { width: 390, height: 844 }; render();
  assert.equal(calls.length, 0, 'opening the local calculator does not consult hosted finance');
  assert.equal(all(render()).some(node => node.props.accessibilityRole === 'alert'), false, 'setup absence is not a red error screen');
  assert.equal(all(render()).some(node => node.props.label === 'Probar calculadora DEMO'), false);
  let table = find(node => node.type === 'SimpleDemoTable');
  table.props.update(current => ({ ...current, doc: calculator.updateRevenueCalculator(current.doc, 'go_peluquerias', 'ES', 'REAL', 'fee', 30) }));
  table = find(node => node.type === 'SimpleDemoTable');
  assert.equal(esHair(table.props.state.doc).monthly, 69120);
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(saves.length >= 1, 'local device save is requested');
  assert.equal(calls.length, 0, 'local edits cannot call finance API');
  admin.allowed = false;
  assert.equal(all(render()).some(node => node.type === 'SimpleDemoTable' || node.props.label === 'Probar calculadora DEMO'), false);
  effects.forEach(effect => effect.cleanup?.());
});
