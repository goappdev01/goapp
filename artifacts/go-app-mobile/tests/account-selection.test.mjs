import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const authSource = readFileSync('components/auth/LoginRegisterPanel.tsx', 'utf8');
const home = ts.createSourceFile('home.tsx', readFileSync('app/index.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

function find(node, predicate) {
  if (predicate(node)) return node;
  let result;
  ts.forEachChild(node, child => { if (!result) result = find(child, predicate); });
  return result;
}

function nodes(tree, predicate) {
  if (tree == null || typeof tree !== 'object') return [];
  if (Array.isArray(tree)) return tree.flatMap(child => nodes(child, predicate));
  return [...(predicate(tree) ? [tree] : []), ...nodes(tree.props?.children, predicate)];
}

// Execute the actual panel and its rendered card callbacks, with native hosts
// mocked. Authentication/network operations are deliberately not exercised here.
function panelFixture() {
  const slots = [], accountChanges = [], storageCalls = [];
  let closeCalls = 0;
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } }),
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial;
      return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }];
    },
    useRef(initial) { const index = cursor++; return slots[index] ??= { current: initial }; },
    useEffect() {},
  };
  const native = Object.fromEntries(['ActivityIndicator', 'Modal', 'ScrollView', 'Text', 'TextInput', 'TouchableOpacity', 'View'].map(name => [name, name]));
  Object.assign(native, {
    Animated: { Value: class {}, View: 'Animated.View' },
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    StyleSheet: { create: styles => styles },
    PanResponder: { create: callbacks => ({ panHandlers: callbacks }) },
  });
  const modules = {
    react: { __esModule: true, default: React, ...React },
    'react-native': native,
    '@react-native-async-storage/async-storage': { __esModule: true, default: new Proxy({}, { get: (_target, operation) => (...args) => { storageCalls.push([operation, ...args]); return Promise.resolve(null); } }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    'expo-haptics': { ImpactFeedbackStyle: { Medium: 'Medium' }, impactAsync: () => Promise.resolve() },
    '../DraggableFAB': { DraggableFAB: 'DraggableFAB' },
    '@/contexts/LanguageContext': { useLanguage: () => ({ t: key => key }) },
    '@/contexts/GoAdminAccessContext': { useAdminAccess: () => ({ allowed: false }) },
    '@/data/cuenta': { verificationColor: () => '#000' },
    '@/lib/sessionEvents': {},
    '@/lib/registrationReturn': {},
  };
  const context = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(authSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, context);
  return {
    accountChanges, storageCalls,
    get closeCalls() { return closeCalls; },
    render(userAccountType = null) {
      cursor = 0;
      return context.exports.LoginRegisterPanel({ visible: true, userAccountType,
        onSetAccountType: role => accountChanges.push(role), onClose() { closeCalls++; }, onOpenPerfil() {}, onOpenEmpresa() {} });
    },
  };
}

for (const role of ['empresa', 'usuario']) {
  test(`public ${role} card opens its existing credentials flow without granting an account`, () => {
    const fixture = panelFixture();
    const tree = fixture.render();
    const cards = nodes(tree, node => node.type === 'TouchableOpacity' && ['empresa', 'usuario'].includes(node.props.key));
    assert.deepEqual(cards.map(card => card.props.key), ['empresa', 'usuario']);
    assert.equal(nodes(tree, node => node.type === 'TouchableOpacity' && node.props.key === 'admin').length, 0);
    cards.find(card => card.props.key === role).props.onPress();
    const next = fixture.render();
    const texts = nodes(next, node => node.type === 'Text').flatMap(node => node.props.children);
    assert.ok(texts.includes('Inicia sesión en GO'));
    assert.ok(texts.includes(role === 'empresa' ? 'Cuenta Empresa' : 'Cuenta Usuario'));
    assert.equal(nodes(next, node => node.type === 'TextInput').length, 2);
    assert.deepEqual(fixture.accountChanges, []);
    assert.deepEqual(fixture.storageCalls, []);
  });
}

test('the account modal is outside the Landing gesture boundary', () => {
  const panel = find(home, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(home) === 'LoginRegisterPanel');
  assert.ok(panel);
  for (let parent = panel.parent; parent; parent = parent.parent) {
    if (!ts.isJsxElement(parent)) continue;
    assert.notEqual(parent.openingElement.tagName.getText(home), 'GestureDetector', 'Landing recognizers must not contain the authentication modal');
  }
});

test('the Landing recognizer is disabled during access and resumes when it closes', () => {
  const gesture = find(home, node => ts.isVariableDeclaration(node) && node.name.getText(home) === 'universalSwipeGesture');
  const callback = gesture.initializer.arguments[0];
  const dependencyList = gesture.initializer.arguments[1];
  assert.ok(dependencyList.elements.some(element => element.getText(home) === 'goAuthOpen'), 'opening/closing access must update the recognizer');
  for (const goAuthOpen of [true, false, true]) {
    const config = {};
    const chain = new Proxy({}, { get: (_target, key) => (...args) => { config[key] = args; return chain; } });
    vm.runInNewContext(`(${callback.getText(home)})()`, { goAuthOpen, Gesture: { Pan: () => chain } });
    assert.equal(config.enabled?.[0], !goAuthOpen);
    assert.equal(config.activeOffsetY[0], 40, 'preserve the validated Landing swipe threshold');
  }
});


function closeButtons(tree) {
  return nodes(tree, node => node.type === 'DraggableFAB' && node.props.screenKey === 'login-register');
}

test('welcome and the welcome after an account is cleared have no close button', () => {
  const fixture = panelFixture();
  assert.equal(closeButtons(fixture.render()).length, 0);
  assert.equal(closeButtons(fixture.render('usuario')).length, 1);
  assert.equal(closeButtons(fixture.render(null)).length, 0);
});

for (const role of ['empresa', 'usuario']) {
  test(role + ' login and registration retain their forms without an outer close button', () => {
    const fixture = panelFixture();
    const welcome = fixture.render();
    nodes(welcome, node => node.type === 'TouchableOpacity' && node.props.key === role)[0].props.onPress();
    const login = fixture.render();
    assert.equal(closeButtons(login).length, 0);
    assert.equal(nodes(login, node => node.type === 'TextInput').length, 2);
    const registerLink = nodes(login, node => node.type === 'TouchableOpacity' &&
      nodes(node, child => child.type === 'Text' && child.props.children.includes('¿No tienes cuenta? Regístrate')).length)[0];
    assert.ok(registerLink);
    registerLink.props.onPress();
    const register = fixture.render();
    assert.equal(closeButtons(register).length, 0);
    assert.equal(nodes(register, node => node.type === 'TextInput').length, 3);
    assert.ok(nodes(register, node => node.type === 'Text' && node.props.children.includes('Crea tu cuenta GO')).length);
    assert.deepEqual(fixture.accountChanges, []);
    assert.deepEqual(fixture.storageCalls, []);
  });

  test(role + ' account panel retains its working close button', () => {
    const fixture = panelFixture();
    const buttons = closeButtons(fixture.render(role));
    assert.equal(buttons.length, 1);
    const touchable = nodes(buttons[0], node => node.type === 'TouchableOpacity')[0];
    touchable.props.onPress();
    assert.equal(fixture.closeCalls, 1);
  });
}

test('the real parent onClose still prevents exit without an account', () => {
  const panel = find(home, node => ts.isJsxSelfClosingElement(node) && node.tagName.getText(home) === 'LoginRegisterPanel');
  const attr = panel.attributes.properties.find(prop => prop.name?.getText(home) === 'onClose');
  const callback = attr.initializer.expression.getText(home);
  for (const userAccountType of [null, 'empresa', 'usuario']) {
    const closes = [];
    vm.runInNewContext('(' + callback + ')()', { userAccountType, setGoAuthOpen: value => closes.push(value) });
    assert.deepEqual(closes, userAccountType === null ? [] : [false]);
  }
});
