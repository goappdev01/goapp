import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import {execFileSync} from 'node:child_process';
import path from 'node:path';

const require = createRequire(path.join(process.cwd(), 'package.json')), ts = require('typescript');
const source = fs.readFileSync('app/index.tsx', 'utf8');
const ast = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(n) { nodes.push(n); ts.forEachChild(n, visit); } visit(ast);
const attr = (n, key) => n.openingElement.attributes.properties.find(p => p.name?.getText(ast) === key)?.initializer?.expression;
const button = nodes.find(n => ts.isJsxElement(n) && n.openingElement.tagName.getText(ast) === 'TouchableOpacity'
  && attr(n, 'onPress')?.getText(ast) === 'handlePress');
assert.ok(button, 'test the real functional satellite renderer');
const definitions = nodes.find(n => ts.isVariableDeclaration(n) && n.name.getText(ast) === 'satellites'
  && ts.isConditionalExpression(n.initializer) && ts.isArrayLiteralExpression(n.initializer.whenFalse)).initializer.whenFalse.elements;
const compilerOptions = { alwaysStrict: false, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true };
const compile = text => ts.transpileModule(text, { compilerOptions }).outputText;
const react = {
  createElement(type, props, ...children) {
    props = { ...props, children: children.length === 1 ? children[0] : children };
    return typeof type === 'function' ? type(props) : { type, props };
  }, Fragment: 'Fragment', Component: class {},
  Children: { map: (children, fn) => (Array.isArray(children) ? children : [children]).map(fn) },
  isValidElement: n => !!n?.props,
  cloneElement: (n, props) => ({ ...n, props: { ...n.props, ...props } }),
};
function load(file, imports = {}) {
  const scope = { exports: {}, require: name => {
    if (!(name in imports)) throw Error('Unexpected import ' + name);
    return imports[name];
  }};
  vm.runInNewContext(compile(fs.readFileSync(file, 'utf8')), scope);
  return scope.exports;
}
const translations = load('i18n/translations.ts').translations;
const art = load('components/landing/LandingVisualArtwork.tsx', {
  react, 'react-native': {}, 'react-native-svg': {},
});
const treeNodes = n => Array.isArray(n) ? n.flatMap(treeNodes) : n && typeof n === 'object'
  ? [n, ...treeNodes(n.props?.children)] : [];
const text = n => Array.isArray(n) ? n.map(text).join('') : n && typeof n === 'object' ? text(n.props?.children) : n ?? '';
const style = value => Array.isArray(value) ? Object.assign({}, ...value.map(style)) : value || {};
const renderCode = compile('result = (' + button.getText(ast) + ');');

for (const profile of ['ADMIN', 'USER', 'BUSINESS']) for (const variant of ['actual', 'marca', 'identidad', 'planeta'])
for (const lang of ['es', 'en']) test(profile + ' / ' + variant + ' / ' + lang + ': satellite names and actions remain visible', () => {
  const labelScope = { t: key => {
    assert.equal(typeof translations[lang][key], 'string', key); return translations[lang][key];
  }, userAccountType: profile === 'BUSINESS' ? 'empresa' : 'usuario', isEmpresaRole: role => role === 'empresa' };
  for (const definition of definitions) {
    const property = key => definition.properties.find(p => p.name?.getText(ast) === key)?.initializer;
    const key = property('key').text;
    if (key === 'payment') continue; // only present inside its existing Marketplace context
    vm.runInNewContext(compile('label = ' + property('label').getText(ast)), labelScope);
    const displayLabel = labelScope.label;
    assert.ok(displayLabel.length > 0, key);
    let presses = 0, longPresses = 0;
    const handlePress = () => presses++, handleLongPress = key === 'calendar' ? undefined : () => longPresses++;
    const scope = {
      React: react, TouchableOpacity: 'TouchableOpacity', LinearGradient: 'LinearGradient', Text: 'Text',
      UserLandingInk: art.UserLandingInk, userLandingMinimal: variant !== 'actual',
      goView: { view: profile }, s: { key }, displayLabel, handlePress, handleLongPress,
      isContactBtn: key === 'contacts', isCalendarBtn: key === 'calendar', isMapBtn: key === 'map',
      isDimmed: false, isOrigin: false, ctxReplace: null, memActive: false,
      microSz: 43, bgColor: '#040813', borderColor: '#fff', shadowColor: '#fff', shadowOpacity: .2, shadowRadius: 6,
      _labelFs: 8, _isMasSat: false, _labelPadH: 3,
    };
    vm.runInNewContext(renderCode, scope);
    const rendered = scope.result, texts = treeNodes(rendered).filter(n => n.type === 'Text');
    assert.equal(text(texts[key==='calendar'?1:0]), displayLabel, key + ' visible name');
    if(key==='calendar'){assert.equal(text(texts[0]),'📅');assert.ok(style(texts[1].props.style).fontSize>style(texts[0].props.style).fontSize);assert.equal(texts[1].props.numberOfLines,1);}
    for (const node of texts) {
      assert.notEqual(style(node.props.style).opacity, 0, key + ' must not inherit minimal orbit ink hiding');
      assert.notEqual(node.props.accessibilityElementsHidden, true);
    }
    assert.equal(rendered.props.onPress, handlePress); rendered.props.onPress(); assert.equal(presses, 1);
    assert.equal(rendered.props.onLongPress, handleLongPress);
    if (handleLongPress) { rendered.props.onLongPress(); assert.equal(longPresses, 1); }
    assert.equal(rendered.props.style.width, 43); assert.equal(rendered.props.style.height, 43);
  }
});

test('satellite size, placement, hit areas, other labels and callbacks retain their approved baseline',()=>{
 const previous=execFileSync('git',['show','0070c51e8561164ec0990f547cf0965609540cc1:artifacts/go-app-mobile/app/index.tsx'],{encoding:'utf8',maxBuffer:8*1024*1024});
 const old=ts.createSourceFile('old.tsx',previous,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 function find(root,p){if(p(root))return root;let result;ts.forEachChild(root,n=>{if(!result)result=find(n,p)});return result;}
 const oldButton=find(old,n=>ts.isJsxElement(n)&&n.openingElement.tagName.getText(old)==='TouchableOpacity'&&n.openingElement.attributes.properties.some(a=>a.name?.getText(old)==='onPress'&&a.initializer?.expression?.getText(old)==='handlePress'));
 const calendar=find(button,n=>ts.isConditionalExpression(n)&&n.condition.getText(ast)==='isCalendarBtn'&&n.whenTrue.getText(ast).includes('<LinearGradient'));
 const oldCalendar=find(oldButton,n=>ts.isConditionalExpression(n)&&n.condition.getText(old)==='isCalendarBtn'&&n.whenTrue.getText(old).includes('<LinearGradient'));
 const normalized=button.getText(ast).replace(calendar.whenTrue.getText(ast),oldCalendar.whenTrue.getText(old)).replace('adjustsFontSizeToFit={s.key !== "mas"}','adjustsFontSizeToFit');
 assert.equal(createHash('sha256').update(normalized.replace(/\s+/g,'')).digest('hex'),'f97a1780c64ff860cf2825c4276411e23f2adafb04abcdda8d56c5a842e03cf0');
 const font=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='_labelFs').initializer.getText(ast);
 for(const uiScaleFactor of [.83,1,1.12])assert.equal(vm.runInNewContext(font,{Math,uiScaleFactor}),Math.max(8,Math.round(9*uiScaleFactor)));
});
