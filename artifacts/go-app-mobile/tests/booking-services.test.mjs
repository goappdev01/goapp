import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const ts=createRequire(import.meta.url)('typescript'),scope={exports:{}};
vm.runInNewContext(ts.transpileModule(readFileSync('data/bookingServices.ts','utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const {summarizeBookingServices,bookingServiceIds,staffSupportsBookingServices}=scope.exports;
const item=(id,patch={})=>({id,businessId:'company',title:id,type:'service',durationMinutes:30,customerCapacity:1,unitQuantity:1,price:10,currency:'EUR',active:true,visible:true,paymentRequired:false,...patch});
const plain=v=>JSON.parse(JSON.stringify(v));
test('one service preserves its identity, configured price and duration',()=>{const a=item('corte');const result=summarizeBookingServices([a],['corte']);assert.deepEqual(plain(result.item),{...a,priceKnown:true});assert.equal(result.services.length,1);});
test('three services accumulate duration and exact cents without synthetic service IDs',()=>{const catalog=[item('corte',{price:0.1,durationMinutes:15}),item('tinte',{price:0.2,durationMinutes:60}),item('tratamiento',{price:10,durationMinutes:30})];const result=summarizeBookingServices(catalog,catalog.map(s=>s.id));assert.equal(result.item.id,'corte');assert.equal(result.item.title,'corte + tinte + tratamiento');assert.equal(result.item.durationMinutes,105);assert.equal(result.item.price,10.3);assert.deepEqual(plain(result.services.map(s=>s.id)),catalog.map(s=>s.id));});
test('a selection cannot duplicate, omit, hide or mix businesses',()=>{const catalog=[item('a'),item('b',{businessId:'other'}),item('inactive',{active:false}),item('hidden',{visible:false})];for(const ids of [[],['a','a'],['missing'],['a','b'],['inactive'],['hidden']])assert.throws(()=>summarizeBookingServices(catalog,ids));});
test('unknown prices are never presented as free or as a configured total',()=>{const result=summarizeBookingServices([item('a'),item('b',{price:0,priceKnown:false})],['a','b']);assert.equal(result.item.priceKnown,false);assert.equal(result.services[1].priceKnown,false);});
test('unknown duration and mixed currencies cannot create an invented interval or total',()=>{for(const value of [0,-1,NaN,Infinity])assert.throws(()=>summarizeBookingServices([item('a',{durationMinutes:value})],['a']));assert.throws(()=>summarizeBookingServices([item('a'),item('b',{currency:'USD'})],['a','b']));});
test('professional must cover every selected service; missing assignments cannot borrow the whole business catalogue',()=>{assert.equal(staffSupportsBookingServices({active:true,serviceIds:['a']},['a','b']),false);assert.equal(staffSupportsBookingServices({active:true,serviceIds:['a','b']},['a','b']),true);assert.equal(staffSupportsBookingServices({active:false,serviceIds:[]},['a']),false);assert.equal(staffSupportsBookingServices({active:true,serviceIds:[]},['a','b']),false);assert.equal(staffSupportsBookingServices({active:true},['a']),false);});
test('legacy single-service records still resolve and multi-service identity is strict',()=>{assert.deepEqual(plain(bookingServiceIds({bookableItemId:'a'})),['a']);assert.deepEqual(plain(bookingServiceIds({bookableItemId:'a',services:[item('a'),item('b')]})),['a','b']);for(const services of [[],[item('b')],[item('a'),item('a')]])assert.throws(()=>bookingServiceIds({bookableItemId:'a',services}));});

// Exercise the production footer JSX and callbacks. Native layout/drag remains a
// separate adapter; these tests do not claim a physical iPhone rendering.
const overlaySource = readFileSync('components/booking/BookingSearchOverlay.tsx', 'utf8');
const overlayAst = ts.createSourceFile('overlay.tsx', overlaySource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const astNodes = [];
(function visit(node) { astNodes.push(node); ts.forEachChild(node, visit); })(overlayAst);
const declaration = name => astNodes.find(node => ts.isVariableDeclaration(node) && node.initializer && node.name.getText(overlayAst) === name);
const jsx = id => astNodes.find(node => ts.isJsxElement(node) && node.openingElement.attributes.properties.some(prop => prop.name?.getText(overlayAst) === 'testID' && prop.initializer?.text === id));
const evaluate = (code, context = {}) => {
  vm.runInNewContext(ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React } }).outputText, context);
  return context;
};
const { exports: { translations } } = evaluate(readFileSync('i18n/translations.ts', 'utf8'), { exports: {} });
const { exports: catalog } = evaluate(readFileSync('data/catalogAssociations.ts', 'utf8'), { exports: {}, require: () => ({}) });
const nodes = node => !node || typeof node !== 'object' ? [] : [node, ...(node.children ?? []).flatMap(nodes)];
const control = (tree, id) => nodes(tree).find(node => node.props.testID === id);
const flatStyle = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(Boolean));
const label = node => typeof node === 'string' ? node : (node?.children ?? []).map(label).join('');

function footerFixture({ hand = 'right', fontScale = 1, selected = true, compact = true, keyboard = false } = {}) {
  const selectedServiceIds = selected ? ['corte'] : [];
  const serviceSelection = selected ? summarizeBookingServices([item('corte')], selectedServiceIds) : null;
  const calls = [];
  const context = {
    exports: {}, Math, JSON, SCREEN_W: 390, SCREEN_H: 844, React: { createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat(Infinity) }) },
    View: 'View', Text: 'Text', TouchableOpacity: 'TouchableOpacity', LinearGradient: 'LinearGradient', GoCloseButton: 'GoCloseButton', GoNavigationFloating: 'GoNavigationFloating',
    StyleSheet: { create: value => value }, Platform: { OS: 'ios' }, t: key => translations.es[key], lang: 'es', handedness: hand, fontScale,
    compactServices: compact, servicesFooterVisible: compact, servicesGuideBottom: 96,
    servicesLayout: { current: { sheetHeight: 487, headerBottom: 70, footerTop: 321, scrollOffset: 0 } },
    setServicesGuideBottom: value => { context.servicesGuideBottom = value; },
    keyboardVisible: keyboard, keyboardHeight: keyboard ? 260 : 0, insets: { top: 47, bottom: 34, left: 0, right: 0 }, accentColor: '#eab308',
    serviceSelection, selectedServiceIds, selectedBusiness: { id: 'company' }, catalogBookingServices: catalog.catalogBookingServices,
    catalogQuote: selected ? { ready: true, businessId: 'company', rootIds: selectedServiceIds, totalPrice: 10, lines: [{ itemId: 'corte', name: 'Corte', kind: 'service', durationMinutes: 30, charge: 10, currency: 'EUR' }] } : null,
    step: 'item', activeHold: null, demoRepository: undefined,
    Keyboard: { isVisible: () => keyboard, dismiss: () => calls.push('keyboard') }, Haptics: { selectionAsync: async () => {} },
    goToStep: (step, direction) => { context.step = step; calls.push([step, direction]); },
    onProviderSelected: value => calls.push(['provider', value]), onClose: () => calls.push('close'), onDismissAll: () => calls.push('exit'),
  };
  for (const name of ['Step', 'Query', 'SelectedCategory', 'SelectedSubCategory', 'Results', 'Searching', 'SelectedBusiness', 'SelectedItem', 'SelectedServiceIds', 'SelectedServices', 'Slots', 'AvailableDates', 'StaffList', 'SelectedStaff', 'ActiveHold', 'ConfirmedBooking', 'Confirming']) {
    const key = name[0].toLowerCase() + name.slice(1);
    context['set' + name] = value => { context[key] = value; };
  }
  for (const name of ['slideAnim', 'dragAnim', 'stepAnim']) context[name] = { stopAnimation() {}, setValue() {} };
  const code = ['s', 'updateServicesLayout', 'handleClose', 'handleSaveServices', 'handleBackOneLevel', 'handleDismissAll', 'navigationControls', 'saveServicesControl'].map(name => 'var ' + declaration(name).getText(overlayAst) + ';').join('\n');
  const guide = astNodes.find(node => ts.isJsxElement(node) && node.openingElement.tagName.getText(overlayAst) === 'TouchableOpacity' && node.getText(overlayAst).includes('<LinearGradient'));
  evaluate(code + ';exports.render=()=>(' + jsx('booking-services-footer').getText(overlayAst) + ');exports.guide=()=>(' + guide.getText(overlayAst) + ');', context);
  return { calls, context, render: context.exports.render, guide: context.exports.guide };
}

test('hairdresser Save reads exactly Guardar, uses confirmation green and has a compact accessible touch target', () => {
  const save = control(footerFixture().render(), 'booking-save-services'), style = flatStyle(save);
  assert.equal(label(save), 'Guardar'); assert.equal(style.backgroundColor, '#22c55e');
  assert.ok(style.minHeight >= 44); assert.equal(style.width, undefined); assert.equal(style.height, undefined);
  assert.equal(style.alignItems, 'center'); assert.equal(style.justifyContent, 'center'); assert.ok(style.paddingVertical < 18);
  const text = save.children[0]; assert.equal(flatStyle(text).textAlign, 'center'); assert.equal(text.props.numberOfLines, undefined);
  const luminance = hex => hex.match(/[a-f\d]{2}/gi).map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4).reduce((sum, value, index) => sum + value * [.2126, .7152, .0722][index], 0);
  assert.ok((luminance(style.backgroundColor) + .05) / (luminance(flatStyle(text).color) + .05) >= 7);
});

for (const hand of ['left', 'right']) for (const fontScale of [1, 2, 3.1]) test(`Services footer reserves separate touch/drag space for ${hand} hand and text scale ${fontScale}`, () => {
  const f = footerFixture({ hand, fontScale }), tree = f.render(), footer = flatStyle(tree);
  assert.equal(footer.flexDirection, hand === 'left' ? 'row-reverse' : 'row'); assert.equal(footer.flexWrap, 'wrap'); assert.ok(footer.gap >= 8);
  const saveLane = control(tree, 'booking-services-save-lane'), navigationLane = control(tree, 'booking-services-navigation-lane');
  assert.ok(control(saveLane, 'booking-save-services')); assert.equal(control(navigationLane, 'booking-save-services'), undefined);
  assert.ok(flatStyle(saveLane).flexBasis >= 112 * fontScale); assert.equal(flatStyle(navigationLane).flexShrink, 0);
  const floating = navigationLane.children[0]; assert.equal(floating.props.protectedBottom, 0); assert.equal(floating.props.protectedTop, 0); assert.equal(floating.props.safeArea, false);
  assert.ok(flatStyle(navigationLane).width >= floating.props.width + 16); assert.ok(flatStyle(navigationLane).height >= 64 + 16);
  assert.deepEqual(nodes(tree).filter(node => node.type === 'GoCloseButton').map(node => node.props.testID), ['booking-back', 'booking-exit']);
  assert.equal(flatStyle(f.guide()).bottom, 96); tree.props.onLayout({ nativeEvent: { layout: { y: 249 } } });
  assert.equal(flatStyle(f.guide()).bottom, 168, 'the right-side Back hitbox ends above the whole measured footer');
  f.context.updateServicesLayout({ scrollOffset: 80 }); assert.equal(flatStyle(f.guide()).bottom, 248, 'scrolling cannot expose a Back hitbox over Save or the navigation lane');
});

for (const selected of [false, true]) test(`Guardar, Back and Close keep independent actions with selection=${selected}`, () => {
  const saveFixture = footerFixture({ selected }), save = control(saveFixture.render(), 'booking-save-services');
  assert.equal(save.props.disabled, !selected); assert.equal(save.props.accessibilityState.disabled, !selected);
  save.props.onPress(); assert.deepEqual(saveFixture.calls, selected ? [['professional', 'forward']] : []);
  if (selected) { assert.equal(saveFixture.context.selectedItem.price, 10); assert.equal(saveFixture.context.selectedItem.durationMinutes, 30); }
  const backFixture = footerFixture({ selected }); control(backFixture.render(), 'booking-back').props.onPress();
  assert.deepEqual(backFixture.calls, [['search', 'back'], ['provider', null]]); assert.deepEqual(plain(backFixture.context.selectedServiceIds), selected ? ['corte'] : []);
  const exitFixture = footerFixture({ selected }); control(exitFixture.render(), 'booking-exit').props.onPress();
  assert.deepEqual(exitFixture.calls, [['provider', null], 'exit']); assert.deepEqual(plain(exitFixture.context.selectedServiceIds), []);
});

test('Back still dismisses a visible keyboard without saving or closing; other sectors retain their original Save style', () => {
  const f = footerFixture({ keyboard: true }); control(f.render(), 'booking-back').props.onPress(); assert.deepEqual(f.calls, ['keyboard']);
  const normal = footerFixture({ compact: false }), save = control(normal.render(), 'booking-save-services');
  assert.equal(flatStyle(save).borderColor, '#eab308'); assert.equal(flatStyle(save).paddingVertical, 18);
});
