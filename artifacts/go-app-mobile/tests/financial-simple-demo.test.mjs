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
  const state = { doc, countryCode: 'FR', activityId, selectedCountryCodes: ['ES','FR'], selectedActivityIds: ['go_peluquerias',activityId] };
  await store.saveFinancialDemo('admin-one', state);
  const restarted = await openStore().loadFinancialDemo('admin-one');
  assert.equal(restarted.state.countryCode, 'FR');
  assert.equal(restarted.state.activityId, activityId);
  assert.deepEqual(Array.from(restarted.state.selectedCountryCodes), ['ES','FR']);
  assert.deepEqual(Array.from(restarted.state.selectedActivityIds), ['go_peluquerias',activityId]);
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

test('Spanish grouped company counts survive a restart and use the existing financial engine', async () => {
  const ui = load('components/financial/FinancialUI.tsx', { react: {}, 'react-native': { StyleSheet: { create: value => value } } });
  assert.equal(ui.parseFinanceNumber('60.683', true), 60683);
  assert.equal(ui.parseFinanceNumber('60.000', true), 60000);
  assert.equal(Number.isNaN(ui.parseFinanceNumber('60.68', true)), true);
  let doc = demo.createFinancialDemoDocument(2026);
  doc = tools.saveCalculatorActivity(doc, { name: 'GO inmobiliarias', unit: 'empresa', enabled: true });
  const activityId = doc.activities.find(item => item.name === 'GO inmobiliarias').id;
  doc = demo.updateFinancialDemoMarket(doc, activityId, 'ES', ui.parseFinanceNumber('60.683', true));
  doc = calc.updateRevenueCalculator(doc, activityId, 'ES', 'REAL', 'share', 10);
  doc = calc.updateRevenueCalculator(doc, activityId, 'ES', 'REAL', 'fee', 49);
  assert.deepEqual([row(doc, 'ES', activityId).companies, row(doc, 'ES', activityId).monthly, row(doc, 'ES', activityId).annual], [6068, 297332, 3567984]);
  doc = demo.updateFinancialDemoMarket(doc, activityId, 'ES', ui.parseFinanceNumber('60.000', true));
  doc = calc.updateRevenueCalculator(doc, activityId, 'ES', 'REAL', 'share', 5);
  doc = calc.updateRevenueCalculator(doc, activityId, 'ES', 'REAL', 'fee', 100);
  assert.deepEqual([row(doc, 'ES', activityId).companies, row(doc, 'ES', activityId).monthly, row(doc, 'ES', activityId).annual], [3000, 300000, 3600000]);
  const owner = 'grouped-count-' + process.pid;
  await openStore().saveFinancialDemo(owner, { doc, countryCode: 'ES', activityId, selectedCountryCodes: ['ES'], selectedActivityIds: [activityId] });
  const restored = (await openStore().loadFinancialDemo(owner)).state;
  assert.equal(row(restored.doc, 'ES', activityId).market, 60000);
  assert.deepEqual(Array.from(restored.selectedActivityIds), [activityId]);
});

test('compact DEMO edits independent activity blocks, appends activities and restores selected pairs', async () => {
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
    'react-native': { View: 'View', Text: 'Text', TextInput: 'TextInput', TouchableOpacity: 'Button', ScrollView: 'ScrollView', StyleSheet: { create: value => value }, Keyboard: { dismiss() {} }, useWindowDimensions: () => ({ width, height: width > 600 ? 390 : 844 }) },
    '@/data/financialCalculatorTools': tools,
    '@/data/financialDemo': demo,
    '@/data/financialRevenueCalculator': calc,
    '@/components/ui/GoNavigationRail': { GO_NAVIGATION_OVERLAY_CLEARANCE: 104 },
    './FinancialUI': { FinanceChoice: 'Choice', FinanceMultiChoice:'MultiChoice', FinanceNumber: 'Number', FinanceTable: 'Table', financeStyles: { input: {}, text: {}, note: {}, heading: {}, planBar: {}, error: {} }, financialCount: value => value === null ? 'Sin dato' : String(value), financialMoney: value => value === null ? 'Sin dato' : value + ' EUR' },
  }).FinancialSimpleDemoTable;
  const render = () => { stateIndex = 0; tree = screen({ state, update: edit => { state = edit(state); }, onCalculate: () => calculations++ }); return tree; };
  const all = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children || []).flatMap(all)];
  const find = predicate => { const nodes=all(render()),active=nodes.find(n=>n.props.testID==='finance-pair-'+state.countryCode+'|'+state.activityId);const found=all(active).find(predicate)||nodes.find(predicate); assert.ok(found, 'expected visible control'); return found; };
  const block=(country,activity)=>find(n=>n.props.testID==='finance-pair-'+country+'|'+activity);
  const field=(country,activity,label)=>all(block(country,activity)).find(n=>n.type==='Number'&&n.props.label===label);
  const blocks=()=>all(render()).filter(n=>n.props.testID?.startsWith('finance-pair-'));

  assert.equal(find(node => node.type === 'MultiChoice' && node.props.label === 'Países incluidos').props.options.find(item => item.value === 'FR').label, 'Francia');
  assert.deepEqual(Array.from(find(node => node.type === 'MultiChoice' && node.props.label === 'Actividades incluidas').props.values), ['go_peluquerias']);
  assert.equal(find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.value, 46086);
  assert.equal(all(render()).filter(node=>node.type==='ScrollView').length,1,'form and results share one scroll');
  assert.ok(find(node=>node.props.testID==='finance-sticky-actions'));
  assert.ok(all(render()).filter(node=>node.type==='Table').every(node=>node.props.responsive),'breakdowns do not need horizontal scrolling');
  assert.equal(find(node => node.type === 'Table' && node.props.headers[0] === 'País').props.rows[0][0], 'España', 'country totals use complete names');
  find(node => node.type === 'Number' && node.props.label === 'Cuota mensual (€)').props.onChange(30);
  assert.equal(row(state.doc).monthly, 69120);
  find(node => node.props.accessibilityLabel === 'CALCULAR').props.onPress();
  assert.equal(calculations, 1);
  assert.ok(all(render()).some(node => node.children?.includes('69120 EUR')));
  assert.equal(blocks().length,1);
  find(n=>n.type==='MultiChoice'&&n.props.label==='Actividades incluidas').props.onChange(['go_peluquerias','go_restaurantes']);
  assert.equal(blocks().length,2);
  assert.equal(field('ES','go_restaurantes','Empresas existentes').props.value,79508);
  field('ES','go_restaurantes','Empresas existentes').props.onChange(60000);
  field('ES','go_restaurantes','Captación (%)').props.onChange(5);
  field('ES','go_restaurantes','Cuota mensual (€)').props.onChange(100);
  find(n=>n.props.accessibilityLabel==='CALCULAR').props.onPress();
  assert.equal(row(state.doc).monthly,69120);assert.equal(row(state.doc,'ES','go_restaurantes').monthly,300000);
  assert.ok(all(render()).some(n=>n.children?.includes('369120 EUR')));assert.ok(all(render()).some(n=>n.children?.includes('4429440 EUR')));
  find(n=>n.props.accessibilityLabel==='Nueva actividad').props.onPress();
  find(n=>n.type==='Choice'&&n.props.label==='Añadir actividad existente').props.onChange('go_unas');
  assert.equal(blocks().length,3);assert.equal(new Set(blocks().map(n=>n.props.testID)).size,3);
  field('ES','go_unas','Empresas existentes').props.onChange(100);field('ES','go_unas','Captación (%)').props.onChange(2);field('ES','go_unas','Cuota mensual (€)').props.onChange(10);
  assert.ok(all(render()).some(n=>n.children?.includes('369140 EUR')));
  find(n=>n.type==='MultiChoice'&&n.props.label==='Actividades incluidas').props.onChange(['go_peluquerias']);
  block('ES','go_peluquerias').props.onTouchStart();
  find(node => node.props.accessibilityLabel === 'LIMPIAR').props.onPress();
  assert.equal(row(state.doc,'ES','go_restaurantes').monthly,300000,'LIMPIAR preserves other pairs');
  assert.equal(row(state.doc).share, 0);
  assert.equal(row(state.doc).fee, 0);
  assert.equal(row(state.doc).monthly, 0);
  assert.equal(row(state.doc).market, 46086);
  assert.deepEqual(state.doc.assumptions.find(item => item.scenario === 'PESIMISTA'), pessimistic);
  find(node => node.props.accessibilityLabel === 'Nueva actividad').props.onPress();
  find(node => node.props.accessibilityLabel === 'Nombre de la nueva actividad').props.onChangeText('Nuevo servicio');
  find(node => node.props.accessibilityLabel === 'GUARDAR ACTIVIDAD').props.onPress();
  assert.equal(state.doc.activities.find(item => item.id === state.activityId).name, 'Nuevo servicio');
  assert.deepEqual(Array.from(state.selectedActivityIds), ['go_peluquerias',state.activityId], 'new activity appends without hiding prior blocks');
  assert.equal(find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.value, null);
  find(node => node.props.accessibilityLabel === 'LIMPIAR').props.onPress();
  assert.equal(row(state.doc, 'ES', state.activityId).market, null);
  assert.ok(all(render()).some(node => node.children?.includes('Sin dato')), 'a missing market remains unknown after clearing');
  find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.onChange(250);
  assert.equal(row(state.doc, 'ES', state.activityId).market, 250);
  find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.onChange(Number.NaN);
  assert.equal(row(state.doc, 'ES', state.activityId).market, 250, 'invalid text cannot erase the last valid count');
  const beforeInvalid=calculations;find(node=>node.props.accessibilityLabel==='CALCULAR').props.onPress();assert.equal(calculations,beforeInvalid,'invalid draft cannot calculate using a hidden previous value');assert.ok(all(render()).some(node=>node.props.accessibilityRole==='alert'));
  assert.equal(find(node=>node.type==='Table'&&node.props.headers[0]==='País').props.rows[0][2],'0 EUR','invalid pair is excluded while the cleared neighbouring pair remains valid');
  find(node => node.type === 'Number' && node.props.label === 'Empresas existentes').props.onChange(60000);
  find(node => node.type === 'Number' && node.props.label === 'Captación (%)').props.onChange(5);
  find(node => node.type === 'Number' && node.props.label === 'Cuota mensual (€)').props.onChange(100);
  assert.ok(all(render()).some(node => node.children?.includes('300000 EUR')), 'the new activity calculates without including unselected ones');
  state.doc = calc.updateRevenueCalculator(state.doc, 'go_peluquerias', 'ES', 'REAL', 'share', 5);
  state.doc = calc.updateRevenueCalculator(state.doc, 'go_peluquerias', 'ES', 'REAL', 'fee', 29);
  assert.ok(all(render()).some(node => node.children?.includes('366816 EUR')), 'previous included activities keep contributing independently');
  find(node => node.type === 'MultiChoice' && node.props.label === 'Países incluidos').props.onChange([]);
  assert.deepEqual(Array.from(state.selectedCountryCodes), []);
  assert.ok(all(render()).some(node => node.children?.includes('Sin selección')));
  find(node => node.type === 'MultiChoice' && node.props.label === 'Países incluidos').props.onChange(['ES', 'FR']);
  find(node => node.type === 'MultiChoice' && node.props.label === 'Actividades incluidas').props.onChange([state.activityId, 'go_peluquerias']);
  assert.equal(find(node => node.type === 'Table' && node.props.headers[0] === 'País').props.rows.length, 2);
  assert.ok(all(render()).some(node => node.children?.includes('366816 EUR')), 'selected pairs aggregate once');
  const previousEditor=find(node=>node.type==='Number'&&node.props.label==='Empresas existentes');
  const oldCountry=state.countryCode,oldActivity=state.activityId;
  block('FR',oldActivity).props.onTouchStart();
  previousEditor.props.onChange(61000);
  assert.equal(row(state.doc,oldCountry,oldActivity).market,61000,'late final text belongs to the pair that owned the input');
  assert.equal(row(state.doc,'FR',oldActivity).market,null,'changing country cannot redirect a late edit');
  const customId=oldActivity;
  field('FR',customId,'Empresas existentes').props.onChange(100);
  field('FR',customId,'Captación (%)').props.onChange(10);field('FR',customId,'Cuota mensual (€)').props.onChange(20);
  field('FR','go_peluquerias','Empresas existentes').props.onChange(1000);
  field('FR','go_peluquerias','Captación (%)').props.onChange(5);field('FR','go_peluquerias','Cuota mensual (€)').props.onChange(50);
  find(n=>n.props.accessibilityLabel==='CALCULAR').props.onPress();
  assert.equal(blocks().length,4);assert.ok(all(render()).some(n=>n.children?.includes('374516 EUR')));assert.ok(all(render()).some(n=>n.children?.includes('4494192 EUR')));
  find(n=>n.type==='MultiChoice'&&n.props.label==='Actividades incluidas').props.onChange(['go_peluquerias']);
  assert.equal(blocks().length,2);assert.ok(all(render()).some(n=>n.children?.includes('69316 EUR')));
  find(n=>n.type==='MultiChoice'&&n.props.label==='Actividades incluidas').props.onChange(['go_peluquerias',customId]);
  assert.equal(blocks().length,4);assert.equal(new Set(blocks().map(n=>n.props.testID)).size,4);assert.equal(field('FR',customId,'Empresas existentes').props.value,100);
  await openStore().saveFinancialDemo('multi-block-ui-owner',state);state=(await openStore().loadFinancialDemo('multi-block-ui-owner')).state;
  assert.equal(blocks().length,4);assert.equal(field('FR',customId,'Cuota mensual (€)').props.value,20);assert.ok(all(render()).some(n=>n.children?.includes('374516 EUR')));
  width = 320;
  assert.ok(all(render()).some(node => [node.props.style].flat().some(style => style?.flexDirection === 'column')), 'narrow portrait layout stacks fields');
  assert.ok(all(render()).some(node => [node.props.style].flat().some(style => style?.alignItems === 'stretch')), 'stacked selectors fill the narrow width');
  find(node=>node.type==='MultiChoice'&&node.props.label==='Países incluidos').props.onChange(['CH']);
  find(node=>node.type==='MultiChoice'&&node.props.label==='Actividades incluidas').props.onChange(['go_restaurantes']);
  assert.ok(all(render()).some(node=>node.children?.includes('Dato oficial · estimación Eurostat (e)')));
  width = 844;
  assert.ok(all(render()).some(node => [node.props.style].flat().some(style => style?.flexDirection === 'row')), 'landscape uses the available width');
});

const snapshotRow=(doc,countryCode='ES',activityId='go_restaurantes')=>calc.revenueCalculatorRows(doc,'REAL',true).find(r=>r.countryCode===countryCode&&r.activityId===activityId);
test('static owner-provided Eurostat 2024 snapshot covers only matching GO countries and scope',()=>{
 const d=demo.createFinancialDemoDocument(2026),before=JSON.stringify(d);
 const expected={BE:34565,CH:13049,DE:141777,ES:79508,FR:184484,IT:161871,NL:35390,PL:46581};
 const rows=calc.revenueCalculatorRows(d,'REAL',true).filter(r=>r.activityId==='go_restaurantes');
 assert.equal(rows.filter(r=>r.market!==null).length,8);
 for(const [code,value] of Object.entries(expected)){const r=rows.find(r=>r.countryCode===code);assert.equal(r.market,value);assert.equal(r.marketOrigin,'official');assert.equal(r.reference.source.year,2024);assert.equal(r.reference.estimated,code==='CH');}
 assert.equal(rows.some(r=>r.countryCode==='EU27'),false);assert.equal(rows.find(r=>r.countryCode==='GB').market,null);
 assert.equal(snapshotRow(d,'ES','go_imprimir').market,null,'GO Imprimir is not the whole of CNAE 18');
 assert.equal(snapshotRow(d,'ES','go_peluquerias').marketOrigin,'example','existing synthetic input is never labelled official');
 assert.equal(snapshotRow(d,'FR','go_peluquerias').market,null);assert.equal(JSON.stringify(d),before);
 assert.equal(calc.SPAIN_ALTERNATIVE_RESTAURANTS.companies,70997);
});
test('reference remains immutable when an old year differs or a manual simulation overrides it',()=>{
 let d=demo.createFinancialDemoDocument(2026);d.markets.push({...d.markets[0],activityId:'go_restaurantes',companies:999});
 assert.equal(snapshotRow(d).market,79508,'snapshot wins over a different-year nonmanual entry');
 d=demo.updateFinancialDemoMarket(d,'go_restaurantes','ES',60000);
 d=calc.updateRevenueCalculator(d,'go_restaurantes','ES','REAL','share',5);d=calc.updateRevenueCalculator(d,'go_restaurantes','ES','REAL','fee',100);
 const r=snapshotRow(d);assert.equal(r.marketOrigin,'manual');assert.equal(r.reference.companies,79508);assert.deepEqual([r.companies,r.monthly,r.annual],[3000,300000,3600000]);
 assert.equal(snapshotRow(d,'FR').market,184484);assert.equal(calc.RESTAURANTS_2024.ES,79508);
});
test('legacy Spain-only local state can add an existing catalog country and persist four distinct pairs',async()=>{
 const owner='catalog-pairs';let d=demo.createFinancialDemoDocument(2026);d.countries=d.countries.filter(c=>c.code==='ES');
 await openStore().saveFinancialDemo(owner,{doc:d,countryCode:'ES',activityId:'go_restaurantes'});
 let state=(await openStore().loadFinancialDemo(owner)).state;assert.ok(state.doc.countries.some(c=>c.code==='FR'));
 d=state.doc;for(const [country,activity,market,fee] of [['ES','go_restaurantes',60000,100],['FR','go_restaurantes',100,10],['ES','go_unas',40,29],['FR','go_unas',80,30]]){
 d=demo.updateFinancialDemoMarket(d,activity,country,market);d=calc.updateRevenueCalculator(d,activity,country,'REAL','share',5);d=calc.updateRevenueCalculator(d,activity,country,'REAL','fee',fee);}
 await openStore().saveFinancialDemo(owner,{doc:d,countryCode:'FR',activityId:'go_unas',selectedCountryCodes:['ES','FR'],selectedActivityIds:['go_restaurantes','go_unas']});
 state=(await openStore().loadFinancialDemo(owner)).state;const rows=calc.revenueCalculatorRows(state.doc,'REAL',true).filter(r=>state.selectedCountryCodes.includes(r.countryCode)&&state.selectedActivityIds.includes(r.activityId));
 assert.equal(rows.length,4);assert.equal(calc.revenueCalculatorTotals(rows).monthly,300228);assert.equal(calc.revenueCalculatorTotals(rows).annual,3602736);
 assert.deepEqual(Array.from(rows,r=>r.market).sort((a,b)=>a-b),[40,80,100,60000]);assert.equal(snapshotRow(state.doc).reference.companies,79508);
 const other=(await openStore().loadFinancialDemo('different-owner')).state;assert.equal(snapshotRow(other.doc).market,79508);
});
