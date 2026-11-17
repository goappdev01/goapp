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
const out = path.resolve('../../tmp/financial-simple-demo-model-' + process.pid + '.mjs');
await build({ entryPoints: ['../../lib/api-zod/src/index.ts'], outfile: out, bundle: true, platform: 'node', format: 'esm' });
const model = await import(pathToFileURL(out));

function load(file, modules) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React },
  }).outputText;
  vm.runInNewContext(code, { exports, Date, Intl, console, Map, Set, Promise, JSON, require(name) {
    if (name in modules) return modules[name];
    throw Error('Unexpected import ' + name);
  } });
  return exports;
}

const calc = load('data/financialRevenueCalculator.ts', { '@workspace/api-zod': model });
const demo = load('data/financialDemo.ts', { '@workspace/api-zod': model, './financialRevenueCalculator': calc });
const tools = load('data/financialCalculatorTools.ts', { '@workspace/api-zod': model, './financialRevenueCalculator': calc });
const storageData = new Map();
let failWrite = false;
const storage = { getItem: async key => storageData.get(key) ?? null, setItem: async (key, value) => {
  if (failWrite) throw Error('Almacenamiento local no disponible');
  storageData.set(key, value);
} };
const openStore = () => load('data/financialDemoStore.ts', {
  '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  '@workspace/api-zod': model,
  './financialDemo': demo,
  './financialRevenueCalculator': calc,
});
const row = (doc, countryCode = 'ES', activityId = 'go_peluquerias') =>
  calc.revenueCalculatorRows(doc, 'REAL').find(item => item.countryCode === countryCode && item.activityId === activityId);

test('local DEMO persists complete user state across a fresh module, isolates owners and reports write failure', async () => {
  storageData.clear();
  const store = openStore();
  const original = await store.loadFinancialDemo('admin-one');
  assert.equal(original.state.doc.markets[0].companies, 46086);
  assert.equal(calc.calculatorCatalog(original.state.doc).countries.find(item => item.code === 'ES').name, 'España');
  assert.equal(calc.calculatorCatalog(original.state.doc).countries.find(item => item.code === 'FR').name, 'Francia');
  let doc = demo.updateFinancialDemoMarket(original.state.doc, 'go_peluquerias', 'ES', 46086);
  doc = calc.updateRevenueCalculator(doc, 'go_peluquerias', 'ES', 'REAL', 'share', 5);
  doc = calc.updateRevenueCalculator(doc, 'go_peluquerias', 'ES', 'REAL', 'fee', 30);
  doc = tools.saveCalculatorActivity(doc, { name: 'Actividad local', unit: 'empresa', enabled: true });
  const activityId = doc.activities.find(item => item.name === 'Actividad local').id;
  const state = { doc, countryCode: 'FR', activityId };
  await store.saveFinancialDemo('admin-one', state);
  const restarted = await openStore().loadFinancialDemo('admin-one');
  assert.equal(restarted.state.countryCode, 'FR');
  assert.equal(restarted.state.activityId, activityId);
  assert.equal(row(restarted.state.doc).monthly, 69120);
  assert.equal((await store.loadFinancialDemo('admin-two')).state.doc.activities.some(item => item.id === activityId), false);
  failWrite = true;
  await assert.rejects(store.saveFinancialDemo('admin-one', { ...state, countryCode: 'ES' }), /Almacenamiento local/);
  assert.equal((await store.loadFinancialDemo('admin-one')).unsaved, true);
  failWrite = false;
  await store.saveFinancialDemo('admin-one', { ...state, countryCode: 'ES' });
  assert.equal((await openStore().loadFinancialDemo('admin-one')).state.countryCode, 'ES');
  const zeroShare = calc.updateRevenueCalculator(state.doc, 'go_peluquerias', 'ES', 'REAL', 'share', 0);
  const cleared = calc.updateRevenueCalculator(zeroShare, 'go_peluquerias', 'ES', 'REAL', 'fee', 0);
  await store.saveFinancialDemo('admin-one', { ...state, doc: cleared });
  const afterRestart = (await openStore().loadFinancialDemo('admin-one')).state.doc;
  assert.equal(row(afterRestart).market, 46086, 'LIMPIAR does not erase the base count');
  assert.equal(row(afterRestart).monthly, 0, 'restart does not restore a cleared revenue');
});

test('local DEMO refuses a corrupt saved document without overwriting it', async () => {
  const key = 'go_finance_demo_v1:corrupt-user';
  storageData.set(key, '{broken');
  await assert.rejects(openStore().loadFinancialDemo('corrupt-user'), /No se pudo leer/);
  assert.equal(storageData.get(key), '{broken');
});

test('compact DEMO edits a pair, recalculates, creates an activity and clears only its scenario', () => {
  let state = { doc: demo.createFinancialDemoDocument(2026), countryCode: 'ES', activityId: 'go_peluquerias' };
  const pessimistic = model.newFinancialAssumption('pessimistic', 'go_peluquerias', 'ES', 'PESIMISTA', 2026);
  state.doc = { ...state.doc, assumptions: [...state.doc.assumptions, pessimistic] };
  let width = 390, calculations = 0, stateIndex = 0, tree;
  const slots = [];
  const react = {
    createElement: (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity) }),
    useState(initial) { const i = stateIndex++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial; return [slots[i], next => { slots[i] = typeof next === 'function' ? next(slots[i]) : next; }]; },
    useMemo: fn => fn(),
  };
  const screen = load('components/financial/FinancialSimpleDemoTable.tsx', {
    react: { ...react, default: react },
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'Button', StyleSheet: { create: value => value }, Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ width, height: width > 600 ? 390 : 844 }) },
    '@/data/financialCalculatorTools': tools,
    '@/data/financialDemo': demo,
    '@/data/financialRevenueCalculator': calc,
    './FinancialUI': { FinanceChoice: 'Choice', FinanceNumber: 'Number', FinanceTable: 'Table', financeStyles: { input: {}, text: {}, note: {}, heading: {}, planBar: {}, error: {} }, financialCount: value => value === null ? 'Sin dato' : String(value), financialMoney: value => value === null ? 'Sin dato' : value + ' EUR' },
  }).FinancialSimpleDemoTable;
  const render = () => { stateIndex = 0; tree = screen({ state, update: edit => { state = edit(state); }, onCalculate: () => calculations++ }); return tree; };
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(all)];
  const find = predicate => { const found = all(render()).find(predicate); assert.ok(found, 'expected visible control'); return found; };

  assert.equal(find(node => node.type === 'Choice' && node.props.label === 'País').props.options.find(item => item.value === 'FR').label, 'Francia');
  assert.equal(find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.value, 46086);
  assert.equal(find(node => node.type === 'Table').props.rows[0][0], 'España', 'country totals use complete names');
  find(node => node.type === 'Number' && node.props.label === 'Cuota mensual (€)').props.onChange(30);
  assert.equal(row(state.doc).monthly, 69120);
  find(node => node.props.accessibilityLabel === 'CALCULAR').props.onPress();
  assert.equal(calculations, 1);
  assert.ok(all(render()).some(node => node.children?.includes('69120 EUR')));
  find(node => node.props.accessibilityLabel === 'LIMPIAR').props.onPress();
  assert.equal(row(state.doc).share, 0);
  assert.equal(row(state.doc).fee, 0);
  assert.equal(row(state.doc).monthly, 0);
  assert.equal(row(state.doc).market, 46086);
  assert.deepEqual(state.doc.assumptions.find(item => item.scenario === 'PESIMISTA'), pessimistic);
  find(node => node.props.accessibilityLabel === 'Nueva actividad').props.onPress();
  find(node => node.props.accessibilityLabel === 'Nombre de la nueva actividad').props.onChangeText('Nuevo servicio');
  find(node => node.props.accessibilityLabel === 'GUARDAR ACTIVIDAD').props.onPress();
  assert.equal(state.doc.activities.find(item => item.id === state.activityId).name, 'Nuevo servicio');
  assert.equal(find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.value, null);
  find(node => node.props.accessibilityLabel === 'LIMPIAR').props.onPress();
  assert.equal(row(state.doc, 'ES', state.activityId).market, null);
  assert.ok(all(render()).some(node => node.children?.includes('0 EUR')), 'a cleared scenario reports zero even without a market count');
  find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.onChange(250);
  assert.equal(row(state.doc, 'ES', state.activityId).market, 250);
  find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.onChange(Number.NaN);
  assert.equal(row(state.doc, 'ES', state.activityId).market, 250, 'invalid text cannot erase the last valid count');
  width = 320;
  assert.equal(all(render()).some(node => [node.props.style].flat().some(style => style?.flexDirection === 'column')), true, 'narrow portrait layout stacks fields');
  width = 844;
  assert.equal(all(render()).some(node => [node.props.style].flat().some(style => style?.flexDirection === 'column')), false, 'landscape uses the available width');
});
