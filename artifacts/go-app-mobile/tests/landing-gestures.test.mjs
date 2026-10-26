import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import vm from 'node:vm';

const require = createRequire(path.join(process.cwd(), 'package.json'));
const ts = require('typescript');
const source = readFileSync('app/index.tsx', 'utf8');
const home = ts.createSourceFile('index.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(node, predicate) {
  if (predicate(node)) return node;
  let found;
  ts.forEachChild(node, child => { if (!found) found = find(child, predicate); });
  return found;
}
function variable(name) {
  return find(home, node => ts.isVariableDeclaration(node) && node.name.getText(home) === name);
}
function responder(name, bindings) {
  const create = find(variable(name), node => ts.isCallExpression(node)
    && node.expression.getText(home) === 'PanResponder.create');
  assert.ok(create);
  return vm.runInNewContext(`(${create.arguments[0].getText(home)})`, bindings);
}

for (const kind of ['next', 'changes']) {
  test(`${kind}: horizontal swipes navigate once, respect bounds and read current indices`, () => {
    const index = { current: 0 }, total = { current: 3 }, selected = [];
    const select = value => { selected.push(value); index.current = value; };
    const bindings = {
      nextCardIdxRef: index, nextCardTotalRef: total, nextCardSetIdxRef: { current: select },
      cambiosCardIdxRef: index, cambiosCardTotalRef: total, setCambiosCardIdx: select,
      nextCardSlideAnim: { stopAnimation() {}, setValue() {} },
      Animated: { timing() {}, sequence: () => ({ start: fn => fn() }) },
      LayoutAnimation: { configureNext() {}, Presets: { easeInEaseOut: {} } },
      Haptics: { selectionAsync: () => Promise.resolve() },
    };
    const config = responder(kind === 'next' ? 'nextCardPanRef' : 'cambiosCardPanRef', bindings);
    for (const key of ['onMoveShouldSetPanResponder', 'onMoveShouldSetPanResponderCapture']) {
      assert.equal(config[key]({}, { dx: 12, dy: 1 }), true);
      assert.equal(config[key]({}, { dx: -12, dy: 1 }), true);
      for (const gesture of [{ dx: 0, dy: 0 }, { dx: 2, dy: 1 }, { dx: 10, dy: 30 }]) {
        assert.equal(config[key]({}, gesture), false, 'leave taps and vertical movement untouched');
      }
      total.current = 1;
      assert.equal(config[key]({}, { dx: -50, dy: 0 }), false);
      total.current = 3;
    }
    assert.equal(config.onStartShouldSetPanResponder, undefined, 'never capture a tap on touch-down');
    const release = dx => config.onPanResponderRelease({}, { dx, dy: 0 });
    release(50); // already first
    release(-50); release(-50); release(-50); // next, next, already last
    release(50); release(50); release(50); // previous, previous, already first
    release(-5); // too short
    assert.deepEqual(selected, [1, 2, 1, 0]);
    selected.length = 0;
    total.current = 1;
    release(-50); release(50);
    assert.deepEqual(selected, [], 'one item never navigates');
  });
}

test('indicator and card retain the same horizontal responder across the fixed header boundary', () => {
  function all(node, predicate, result = []) {
    if (predicate(node)) result.push(node);
    ts.forEachChild(node, child => { all(child, predicate, result); });
    return result;
  }
  for (const [name, header, card, expectedHosts] of [
    ['nextCardPanRef', '{ordinal}', 'Tarjeta próxima cita', 3],
    ['cambiosCardPanRef', '{_ordinal}', '{cardTitle}', 1],
  ]) {
    const hosts = all(home, node => ts.isJsxElement(node)
      && node.openingElement.attributes.properties.some(attr => ts.isJsxSpreadAttribute(attr)
        && attr.expression.getText(home) === name + '.panHandlers'));
    assert.equal(hosts.length, expectedHosts);
    assert.equal(hosts.filter(node => node.getText(home).includes(header)).length, name === 'nextCardPanRef' ? 2 : 1);
    assert.equal(hosts.filter(node => node.getText(home).includes(card)).length, name === 'nextCardPanRef' ? 2 : 1);
    if (name === 'nextCardPanRef') {
      const slot = node => { for (let p = node.parent; p; p = p.parent) if (ts.isJsxAttribute(p)) return p.name.getText(home); };
      const fixed = hosts.find(node => slot(node) === 'header');
      const body = hosts.find(node => slot(node) === 'bodyFrame');
      assert.ok(fixed && body, 'header and fixed border share the horizontal responder outside vertical scrolling');
      assert.equal(body.openingElement.getText(home).replace('flexShrink: 0, minHeight: 0, ', ''), fixed.openingElement.getText(home), 'only vertical sizing changes; original animation and responder are identical');
    }
  }
});

test('the installed native recognizer at the shared ancestor retains horizontal navigation and yields vertical scroll', () => {
  const { nativePanResponder, touchStream } = require('./tests/helpers/native-pan-responder.cjs');
  for (const name of ['nextCardPanRef', 'cambiosCardPanRef']) {
    const index={current:0},total={current:3},selected=[],select=value=>{index.current=value;selected.push(value)};
    const config=responder(name,{nextCardIdxRef:index,nextCardTotalRef:total,nextCardSetIdxRef:{current:select},cambiosCardIdxRef:index,cambiosCardTotalRef:total,setCambiosCardIdx:select,
      nextCardSlideAnim:{stopAnimation(){},setValue(){}},Animated:{timing(){},sequence:()=>({start:fn=>fn()})},LayoutAnimation:{configureNext(){},Presets:{easeInEaseOut:{}}},Haptics:{selectionAsync:()=>Promise.resolve()}});
    const pan=nativePanResponder().create(config).panHandlers;
    for (const direction of [-1,1]) {
      const stream=touchStream({x:200,y:200,historyEnumerable:false});pan.onStartShouldSetResponderCapture(stream.event());
      const move=stream.event(direction*20,1,30);assert.equal(pan.onMoveShouldSetResponderCapture(move),true);pan.onResponderGrant(move);
      pan.onResponderMove(stream.event(direction*65,2,60));const end=stream.event(direction*65,2,10,true);pan.onResponderRelease(end);pan.onResponderRelease(end);
    }
    assert.deepEqual(selected,[1,0]);
    const vertical=touchStream();pan.onStartShouldSetResponderCapture(vertical.event());const move=vertical.event(2,70,70);
    assert.equal(pan.onMoveShouldSetResponderCapture(move),false);assert.equal(pan.onMoveShouldSetResponder(move),false,'native vertical scroll keeps its contact');
  }
});

test('global vertical recognizer has a downward threshold, not an interval that activates at Y=0', () => {
  const call = find(variable('universalSwipeGesture'), node => ts.isCallExpression(node)
    && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'activeOffsetY');
  assert.ok(call);
  const offset = vm.runInNewContext(call.arguments[0].getText(home));
  assert.equal(offset, 40); // Positive scalar configures only activeOffsetYEnd in RNGH.
  for (const dy of [0, 1, -30, 39]) assert.equal(dy > offset, false);
  assert.equal(41 > offset, true);
});

test('calendar header remains laid out but invisible and untouchable throughout Nueva reserva', () => {
  const opening = find(home, node => ts.isJsxOpeningElement(node)
    && node.attributes.properties.some(attr => ts.isJsxAttribute(attr)
      && attr.name.getText(home) === 'pointerEvents'
      && attr.initializer?.getText(home) === '{showBookingFromCal ? "none" : "auto"}'));
  assert.ok(opening);
  const attribute = name => opening.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === name).initializer.expression.getText(home);
  const selector = find(opening.parent, node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(home) === "GoCalendarViewSelector");
  assert.ok(selector, "the existing view selector stays inside the protected calendar header");
  assert.ok(selector.attributes.properties.some(attr => attr.name?.getText(home) === "value"
    && attr.initializer?.getText(home) === "{calBgViewMode}"));
  assert.ok(opening.parent.getText(home).includes('setCalConfigVisible(true)'));
  for (const showBookingFromCal of [false, true, false]) {
    const context = { showBookingFromCal, insets: { top: 44 } };
    const style = vm.runInNewContext(`(${attribute('style')})`, context);
    assert.equal(vm.runInNewContext(attribute('pointerEvents'), context), showBookingFromCal ? 'none' : 'auto');
    assert.equal(style.opacity, showBookingFromCal ? 0 : 1);
    assert.equal(style.paddingTop, 44, 'compact calendar geometry does not change during reservations');
    assert.equal(style.paddingBottom, 0, 'opening reservations does not add an empty margin');
  }
  const overlay = find(home, node => ts.isJsxSelfClosingElement(node)
    && node.tagName.getText(home) === 'BookingSearchOverlay');
  const visible = overlay.attributes.properties.find(attr => ts.isJsxAttribute(attr)
    && attr.name.getText(home) === 'visible').initializer.expression.getText(home);
  for (const [showBookingFromCal, checking, demoInitialBusinessId, demoBookingRepository, expected] of [
    [true, false, null, null, true],
    [false, false, null, null, false],
    [true, true, null, null, false],
    [true, false, 'demo-owner', null, false],
    [true, false, 'demo-owner', {}, true],
  ]) {
    assert.equal(vm.runInNewContext(visible, {
      showBookingFromCal, adminAccess: { checking }, demoInitialBusinessId, demoBookingRepository,
    }), expected, 'opening keeps the calendar handoff and requires a live authorized DEMO adapter');
  }
});
