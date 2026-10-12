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
function panelFixture({ view = { view: "USER", isOwner: false, isAdminView: false, isBusinessPreview: false }, access = { allowed: false, checking: false, userId: null }, select = async () => true, width = 390, fontScale = 1, authenticate } = {}) {
  const slots = [], accountChanges = [], storageCalls = [];
  let closeCalls = 0;
  let cursor = 0;
  const React = {
    createElement: (type, props, ...children) => { const fullProps = { ...props, children: children.flat(Infinity) }; return typeof type === 'function' ? type(fullProps) : { type, props: fullProps }; },
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
    useWindowDimensions: () => ({ width, height: 844, fontScale }),
    StyleSheet: { create: styles => styles },
    PanResponder: { create: callbacks => ({ panHandlers: callbacks }) },
  });
  const modules = {
    react: { __esModule: true, default: React, ...React },
    'react-native': native,
    '@/components/debug/OwnerContextIndicator': { OwnerContextModal: 'Modal' },
    '@react-native-async-storage/async-storage': { __esModule: true, default: new Proxy({}, { get: (_target, operation) => (...args) => { storageCalls.push([operation, ...args]); return Promise.resolve(null); } }) },
    'expo-linear-gradient': { LinearGradient: 'LinearGradient' },
    'expo-status-bar': { StatusBar: 'StatusBar' },
    '@expo/vector-icons': { Feather: 'Feather' },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }) },
    'expo-haptics': { ImpactFeedbackStyle: { Medium: 'Medium', Light: 'Light' }, impactAsync: () => Promise.resolve(), selectionAsync: () => Promise.resolve() },
    '../DraggableFAB': { DraggableFAB: 'DraggableFAB' },
    '@/contexts/LanguageContext': { useLanguage: () => ({ t: key => key }) },
    '@/contexts/GoAdminAccessContext': { useAdminAccess: () => access },
    '@/contexts/GoViewContext': { useGoView: () => view },
    '@/data/cuenta': { verificationColor: () => '#000' },
    '@/lib/sessionEvents': { notifySessionChanged() {} },
    '@/lib/registrationReturn': {},
  };
  const selectorContext = { exports: {}, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(readFileSync('components/auth/AccountContextSelector.tsx', 'utf8'), { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, selectorContext);
  modules['./AccountContextSelector'] = selectorContext.exports;
  const context = { exports: {}, process: { env: { EXPO_PUBLIC_API_URL: 'http://private.test/api' } }, fetch: authenticate, require: name => { assert.ok(name in modules, name); return modules[name]; } };
  vm.runInNewContext(ts.transpileModule(authSource, { compilerOptions: {
    target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true,
  } }).outputText, context);
  return {
    accountChanges, storageCalls,
    get closeCalls() { return closeCalls; },
    render(userAccountType = null) {
      cursor = 0;
      return context.exports.LoginRegisterPanel({ visible: true, userAccountType,
        onSetAccountType: role => accountChanges.push(role), onClose() { closeCalls++; }, onOpenPerfil() {}, onOpenEmpresa() {}, onSelectOwnerView: select });
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


function ownerFixture(select) {
  const view = { view: 'USER', isOwner: true, isAdminView: false, isBusinessPreview: false };
  const access = { allowed: true, checking: false, userId: 'fixture-owner' };
  return { ...panelFixture({ view, access, select }), view, access };
}
test('owner sees all three contexts in the shared welcome, without a second account dock', async () => {
  const selected=[]; const fixture=ownerFixture(async value=>{selected.push(value);return true;});
  for(const role of [null,'usuario','empresa']) {
    const tree=fixture.render(role);
    const cards=nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.testID?.startsWith('owner-view-'));
    assert.deepEqual(cards.map(n=>n.props.key),['ADMIN','BUSINESS','USER']);
    assert.equal(nodes(tree,n=>n.type==='Text'&&n.props.children.includes('welcome_go_title')).length,1);
    assert.equal(nodes(tree,n=>n.type==='TextInput').length,0);
    assert.equal(nodes(tree,n=>n.type==='Text'&&n.props.children.includes('quick_access_section')).length,0);
    for(const card of cards) { card.props.onPress(); await new Promise(resolve=>setImmediate(resolve)); }
  }
  assert.deepEqual(selected,['ADMIN','BUSINESS','USER','ADMIN','BUSINESS','USER','ADMIN','BUSINESS','USER']);
  assert.deepEqual(fixture.accountChanges,[]);assert.deepEqual(fixture.storageCalls,[]);
});
test('public, normal and technical accounts never receive owner selection controls',()=>{
  for(const role of [null,'usuario','empresa']) {
    const fixture=panelFixture();
    assert.equal(nodes(fixture.render(role),n=>n.props.testID?.startsWith('owner-view-')).length,0);
  }
  const tech=panelFixture({access:{allowed:true,checking:false,userId:'fixture-tech'}});
  assert.equal(nodes(tech.render('usuario'),n=>n.props.testID?.startsWith('owner-view-')).length,0);
  assert.equal(nodes(tech.render('usuario'),n=>n.type==='Text'&&n.props.children.includes('admin_internal_sub')).length,1);
});
test('owner credentials and welcome are mutually exclusive when permission resolves during login',()=>{
  const view={view:'USER',isOwner:false};const access={allowed:false,checking:false,userId:null};
  const fixture=panelFixture({view,access});
  nodes(fixture.render(),n=>n.type==='TouchableOpacity'&&n.props.key==='usuario')[0].props.onPress();
  assert.equal(nodes(fixture.render(),n=>n.type==='TextInput').length,2);
  view.isOwner=true;access.allowed=true;access.userId='fixture-owner';
  const resolved=fixture.render();
  assert.equal(nodes(resolved,n=>n.type==='TextInput').length,0);
  assert.equal(nodes(resolved,n=>n.props.testID?.startsWith('owner-view-')).length,3);
});
test('permission recheck keeps the same owner welcome disabled and revocation removes it',()=>{
  let finish;const request=new Promise(resolve=>finish=resolve);const fixture=ownerFixture(()=>request);
  nodes(fixture.render('usuario'),n=>n.props.testID==='owner-view-business')[0].props.onPress();
  fixture.view.isOwner=false;fixture.access.checking=true;
  const checking=fixture.render('usuario');const cards=nodes(checking,n=>n.props.testID?.startsWith('owner-view-'));
  assert.equal(cards.length,3);assert.ok(cards.every(card=>card.props.disabled));
  fixture.access.checking=false;fixture.access.allowed=false;
  assert.equal(nodes(fixture.render('usuario'),n=>n.props.testID?.startsWith('owner-view-')).length,0);
  finish(false);
});
test('different identity cannot retain the preceding owner selector',()=>{
  const fixture=ownerFixture();fixture.render('usuario');
  fixture.view.isOwner=false;fixture.access.checking=true;fixture.access.userId='fixture-other';
  assert.equal(nodes(fixture.render('usuario'),n=>n.props.testID?.startsWith('owner-view-')).length,0);
});

test('public cards remain reachable within the welcome scroll at narrow widths and large font sizes', () => {
  for (const dimensions of [{width: 320, fontScale: 1}, {width: 390, fontScale: 1.6}]) {
    const fixture = panelFixture(dimensions);
    const tree = fixture.render();
    const welcomeScroll = nodes(tree, node => node.type === 'ScrollView').find(scroll =>
      nodes(scroll, node => node.props?.testID === 'account-role-empresa').length);
    assert.ok(welcomeScroll, 'public selector must be within the scrollable welcome');
    assert.equal(nodes(welcomeScroll, node => ['account-role-empresa', 'account-role-usuario'].includes(node.props?.testID)).length, 2);
    const wrapper = nodes(welcomeScroll, node => node.type === 'View' && Array.isArray(node.props.style) && node.props.style[0]?.flexDirection === 'row')[0];
    assert.ok(wrapper, 'shared selector is inside the welcome scroll');
    const layout = Object.assign({}, ...wrapper.props.style.filter(Boolean));
    assert.equal(layout.flexDirection, dimensions.fontScale > 1.25 ? 'column' : 'row');
    for (const role of ['empresa', 'usuario']) {
      const card = nodes(welcomeScroll, node => node.props?.testID === 'account-role-' + role)[0];
      assert.equal(card.props.disabled, false);
    }
  }
});

 test('owner authenticates directly before selecting a public role and receives only verified owner contexts',async()=>{
  const id='11111111-1111-4111-8111-111111111111',requests=[],checks=[];
  const view={view:'USER',isOwner:false},access={allowed:false,checking:false,userId:null,refreshOwner:async expected=>{checks.push(expected);view.isOwner=true;access.allowed=true;access.userId=id;return true;}};
  const f=panelFixture({view,access,authenticate:async(url,options)=>{requests.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({access_token:'mock-session',user:{id}})};}});
  let tree=f.render();nodes(tree,n=>n.props?.testID==='owner-direct-login')[0].props.onPress();tree=f.render();
  assert.equal(nodes(tree,n=>n.props?.testID==='owner-view-admin').length,0);assert.equal(nodes(tree,n=>n.type==='TextInput').length,2);
  const inputs=nodes(tree,n=>n.type==='TextInput');inputs[0].props.onChangeText('owner@example.test');inputs[1].props.onChangeText('test-only-password');tree=f.render();
  await nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.onPress?.name==='handleAuthenticate')[0].props.onPress();
  assert.deepEqual(f.accountChanges,[]);assert.deepEqual(checks,[id]);assert.deepEqual(requests,[{url:'http://private.test/api/supabase/auth/login',body:{email:'owner@example.test',password:'test-only-password'}}]);
  tree=f.render();for(const context of ['admin','business','user'])assert.equal(nodes(tree,n=>n.props?.testID==='owner-view-'+context).length,1);
 });
 test('direct owner login cannot expose ADMIN when the server rejects owner authority',async()=>{
  const f=panelFixture({access:{allowed:false,checking:false,userId:null,refreshOwner:async()=>false},authenticate:async()=>({ok:true,json:async()=>({access_token:'mock-session',user:{id:'11111111-1111-4111-8111-111111111111'}})})});
  nodes(f.render(),n=>n.props?.testID==='owner-direct-login')[0].props.onPress();let tree=f.render(),inputs=nodes(tree,n=>n.type==='TextInput');inputs[0].props.onChangeText('ordinary@example.test');inputs[1].props.onChangeText('test-only-password');tree=f.render();await nodes(tree,n=>n.type==='TouchableOpacity'&&n.props.onPress?.name==='handleAuthenticate')[0].props.onPress();tree=f.render();assert.equal(nodes(tree,n=>n.props?.testID==='owner-view-admin').length,0);assert.deepEqual(f.accountChanges,[]);assert.ok(nodes(tree,n=>n.type==='Text').flatMap(n=>n.props.children).some(text=>String(text).includes('owner_login_denied')));
 });
