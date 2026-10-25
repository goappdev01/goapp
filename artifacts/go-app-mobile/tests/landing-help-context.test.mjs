import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let result;
  ts.forEachChild(node, child => { if (!result) result = find(child, predicate); });
  return result;
}
const declaration = name => find(ast, node => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
const hints = find(ast, node => ts.isJsxElement(node) &&
  node.openingElement.tagName.getText(ast) === 'Animated.View' &&
  node.getText(ast).includes("t('biz_configure_hint')"));
assert.ok(hints, 'reuse the existing Landing hints block');
const hintExpression = ts.isParenthesizedExpression(hints.parent) ? hints.parent.parent : hints.parent;
assert.ok(ts.isBinaryExpression(hintExpression), 'guidance remains conditionally mounted');
assert.equal(hintExpression.left.getText(ast), '!anyOperationalPanelOpen && !actionCompletion.unresolved.length && !actionCompletion.pending.length',
  'guidance is structurally absent while an operational panel or the recovered completion information occupies its area');
const compile = value => ts.transpileModule(value, { compilerOptions: { esModuleInterop: false, alwaysStrict: false,
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React,
} }).outputText;
const translated = { exports: {} };
vm.runInNewContext(compile(readFileSync('i18n/translations.ts', 'utf8')), translated);
const policy = { exports: {} };
vm.runInNewContext(compile(readFileSync('components/landing/landingV1Visibility.ts', 'utf8')), policy);
const definitions = [
  'isBusinessMode', 'isUserMode', 'landingHelpReady', 'showBusinessLandingHelp',
  'showPersonalLandingHelp', 'isUserV1Surface', 'empresaConfigurada',
].map(name => {
  const node = declaration(name);
  assert.ok(node, name);
  return 'const ' + name + ' = ' + node.initializer.getText(ast) + ';';
}).join('\n');
const renderCode = compile(definitions + '\nmodule.exports = { tree: ' + hintExpression.getText(ast) +
  ', operationalBusiness: isBusinessMode, businessConfigured: empresaConfigurada };');
function render({
  view = 'USER', owner = false, adminAllowed = false, checking = false, loaded = true,
  requestedBusinessMode = false, businessAllowed = false, configured = false, completedSteps = [],
  workGuideDismissed = false, tutorialsCompleted = false, demoReady = false, panelOpen = false, unresolved = 0, pending = 0, lang = 'es',
} = {}) {
  const goView = {
    view, loaded,
    isAdminView: view === 'ADMIN' && adminAllowed && !checking,
    isBusinessPreview: view === 'BUSINESS' && owner && !checking,
  };
  const element = (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } });
  const context = {
    exports: {}, module: { exports: {} },
    React: { createElement: element }, Animated: { View: 'Animated.View' }, View: 'View', Text: 'Text',
    goView, adminAccess: { checking }, requestedBusinessMode, businessAccess: { allowed: businessAllowed },
    bCfg: { isBusinessActive: configured, completedSteps },
    ownerDemo: { loaded, config: {businessName: demoReady ? 'GO Prueba' : ''} },
    empresaDemoSetup: { ready: demoReady },
    isUserV1Landing: policy.exports.isUserV1Landing,
    anyOperationalPanelOpen: panelOpen, insets: { bottom: 34 }, SYSTEM_MARGIN_Y: 0, orbitWrapSize: 300,
    actionCompletion: { unresolved: Array(unresolved).fill({}), pending: Array(pending).fill({}) },
    nextAppointment: null, isActivelyCreating: false, anyOverlayOpen: false, nextAptMinimized: true,
    nextAptPanelH: 0, allPendientes: [], rutasMode: false, cambiosOpen: false, pendingPanelH: 0,
    contentBottom: bottom => bottom, landingHelpBottom: 354, setLandingHelpH() {},
    workGuideHideAnim: 1, orbitSecondLevel: null, lang,
    tutReservaRealizada: tutorialsCompleted, tutGoRealizado: tutorialsCompleted,
    tutMarketplaceRealizado: tutorialsCompleted, workGuideDismissed,
    t: key => translated.exports.translations[lang][key],
  };
  vm.runInNewContext(renderCode, context);
  return context.module.exports;
}
function texts(node) {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(texts).join(' ');
  return node?.props ? texts(node.props.children) : '';
}
const noUserHelp = tree => {
  const content = texts(tree);
  assert.doesNotMatch(content, /Pulsa Reservas|Ejecuta acción|Se abre Comprar/);
};

test('owner BUSINESS preview receives the existing company setup help without operational permission', () => {
  const result = render({ view: 'BUSINESS', owner: true, adminAllowed: true, configured: true });
  assert.match(texts(result.tree), /Configura tu empresa/);
  noUserHelp(result.tree);
  assert.equal(result.operationalBusiness, false);
  assert.equal(result.businessConfigured, false, 'unrelated real configuration must not complete preview setup');
});

test('normal pending BUSINESS uses company help only when real business access is authorized', () => {
  const granted = render({ view: 'BUSINESS', requestedBusinessMode: true, businessAllowed: true });
  assert.match(texts(granted.tree), /Configura tu empresa/);
  noUserHelp(granted.tree);
  const denied = render({ view: 'BUSINESS', requestedBusinessMode: true });
  assert.equal(texts(denied.tree), '');
  assert.equal(denied.operationalBusiness, false);
});

test('configured BUSINESS evolves to the existing management help for active or completed setup', () => {
  for (const configuration of [{ configured: true }, { completedSteps: [0,1,2,3,4,5,6,7] }]) {
    const result = render({ view: 'BUSINESS', requestedBusinessMode: true, businessAllowed: true, ...configuration });
    assert.match(texts(result.tree), /Gestiona tu negocio/);
    assert.match(texts(result.tree), /Añade servicios · Gestiona reservas/);
    assert.match(texts(result.tree), /Consulta estadísticas · Configura horarios/);
    assert.doesNotMatch(texts(result.tree), /Configura tu empresa/);
    noUserHelp(result.tree);
  }
});

test('existing completed business guide dismissal remains respected', () => {
  const result = render({ view: 'BUSINESS', requestedBusinessMode: true, businessAllowed: true,
    configured: true, workGuideDismissed: true });
  assert.equal(texts(result.tree), '');
});

test('USER context shows only the public reservation help even for an owner', () => {
  for (const owner of [false, true]) {
    const result = render({ view: 'USER', owner, adminAllowed: owner,
      requestedBusinessMode: true, businessAllowed: true, configured: true });
    assert.match(texts(result.tree), /1 · Reserva/);
    assert.match(texts(result.tree), /Pulsa GO para abrir el asistente de reservas/);
    assert.doesNotMatch(texts(result.tree), /Ejecuta acción|Se abre Comprar|Configura tu empresa|Gestiona tu negocio/);
    assert.equal(result.operationalBusiness, false);
  }
});

test('authorized ADMIN retains the full existing action, reservation and marketplace guidance', () => {
  const result = render({ view: 'ADMIN', owner: true, adminAllowed: true });
  assert.match(texts(result.tree), /1 · Ejecuta acción/);
  assert.match(texts(result.tree), /2 · Reserva/);
  assert.match(texts(result.tree), /3 · Comprar/);
  assert.equal(result.operationalBusiness, false);
  assert.equal(texts(render({ view: 'ADMIN', owner: false, adminAllowed: false }).tree), '');
});

test('context switch and foreground revalidation cannot display another contexts help', () => {
  const owner = { owner: true, adminAllowed: true };
  assert.match(texts(render({ ...owner, view: 'BUSINESS' }).tree), /Configura tu empresa/);
  for (const view of ['BUSINESS', 'USER', 'ADMIN']) {
    assert.equal(texts(render({ ...owner, view, checking: true }).tree), '');
    assert.equal(texts(render({ ...owner, view, loaded: false }).tree), '');
  }
  assert.match(texts(render({ ...owner, view: 'BUSINESS' }).tree), /Configura tu empresa/);
  assert.match(texts(render({ ...owner, view: 'USER' }).tree), /1 · Reserva/);
  assert.match(texts(render({ ...owner, view: 'ADMIN' }).tree), /3 · Comprar/);
});

test('normal reservation tutorial completion still hides its public help', () => {
  assert.equal(texts(render({ tutorialsCompleted: true }).tree), '');
});

test('recovered personal completion information suppresses only overlapping guidance in every authorized context', () => {
  for (const view of ['USER', 'BUSINESS', 'ADMIN']) {
    const props = { view, owner: true, adminAllowed: true };
    const before = texts(render(props).tree);
    assert.ok(before.length > 0);
    for (const state of [{ unresolved: 1 }, { pending: 1 }, { unresolved: 2, pending: 3 }]) {
      assert.equal(render({ ...props, ...state }).tree, false);
      assert.equal(texts(render({ ...props, ...state }).tree), '');
    }
    assert.equal(texts(render(props).tree), before);
  }
});


test("owner DEMO management comes from valid saved setup, never the visual counter or real company", () => {
  const ready = render({ view:"BUSINESS", owner:true, adminAllowed:true, demoReady:true });
  assert.equal(ready.businessConfigured,true);
  assert.match(texts(ready.tree), /GO Prueba.*Gestiona tu negocio/);
  assert.doesNotMatch(texts(ready.tree), /Configura tu empresa/);
  noUserHelp(ready.tree);
  const missing = render({ view:"BUSINESS", owner:true, adminAllowed:true, configured:true, completedSteps:[0,1,2,3,4,5,6,7] });
  assert.equal(missing.businessConfigured,false);
  assert.match(texts(missing.tree), /Configura tu empresa/);
  assert.equal(texts(render({view:"BUSINESS", owner:true, adminAllowed:true,demoReady:true,checking:true}).tree), "");
});

for (const view of ['USER', 'BUSINESS', 'ADMIN']) for (const lang of ['es','en']) for (const panel of ['visit','task','changes'])
 test(view+' / '+lang+' / '+panel+': hints unmount immediately even before fade-out, and recover after closing', () => {
  const props={view,lang,owner:true,adminAllowed:true};
  const before=texts(render(props).tree);assert.ok(before.length>0);
  const open=render({...props,panelOpen:true});assert.equal(open.tree,false);assert.equal(texts(open.tree),'');
  assert.equal(texts(render({...props,panelOpen:false}).tree),before,'existing contextual help returns unchanged');
 });

test('actual visit/task and changes state feed the shared visibility guard, including mixed open/closed states',()=>{
 const expression=declaration('anyOperationalPanelOpen').initializer;
 const identifiers=new Set();function collect(n){if(ts.isIdentifier(n))identifiers.add(n.text);ts.forEachChild(n,collect)}collect(expression);
 const initial=Object.fromEntries([...identifiers].map(name=>[name,false]));initial.nextAptMinimized=true;initial.goPhase='idle';
 const open=overrides=>vm.runInNewContext(expression.getText(ast),{...initial,...overrides});
 assert.equal(open({}),false);
 for(const overrides of [{nextAptMinimized:false},{cambiosOpen:true},{nextAptMinimized:false,cambiosOpen:true}])assert.equal(open(overrides),true);
 assert.equal(open({nextAptMinimized:true,cambiosOpen:false}),false);
});
