import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { detailFixture, detailEntry } from './helpers/calendar-detail-lifecycle.mjs';
const require = createRequire(path.join(process.cwd(), 'package.json')), ts = require('typescript');
const nodes = n => n ? [n, ...n.childNodes.flatMap(nodes)] : [];
const byId = (root, id) => nodes(root).find(n => n.attributes?.['data-testid'] === id);

for (const hand of ['right', 'left']) test(`${hand}: a single real 56-point close target has its own safe footer outside actions and gestures`, async () => {
  const f = await detailFixture({ handedness: hand }); let closed = 0;
  try {
    await f.render({ onClose: () => closed++ });
    const footer = f.props.get('entry-detail-close-footer'), target = f.props.get('Cerrar detalle');
    assert.equal(footer.style.position, undefined); assert.equal(footer.style.flexShrink, 0);
    assert.equal(footer.style.justifyContent, hand === 'left' ? 'flex-start' : 'flex-end'); assert.equal(footer.style.paddingBottom, 6);assert.equal(footer.style.height, 66, "The original panel footer height is preserved; controls are overlays");
    assert.equal(target.style.width, 56); assert.equal(target.style.height, 56); assert.equal(target.children.props.style.width, 44); assert.equal(target.children.props.style.borderRadius, 16);
    assert.equal(target.hitSlop, 0); assert.equal(target.delayPressIn, 0);
    for (const id of ['entry-details-scroll', 'entry-details-gesture-body']) assert.equal(byId(byId(f.container, id), 'entry-detail-close-footer'), undefined);
    assert.equal(f.props.has('Salir del calendario'), false); assert.equal(f.props.has('entry-detail-floating-close'), false);
    assert.equal(f.props.get('entry-details-overlay').style.paddingBottom, 42);
    await f.pressClose(); assert.equal(f.props.get('entry-details-modal').visible, false, 'first press hides the native modal');
    assert.equal(closed, 0, 'selection and parent navigation wait for native iOS dismissal');
    await f.nativeDismiss(); assert.equal(closed, 1);
    await f.nativeDismiss(); await f.pressClose(); assert.equal(closed, 1);
    assert.equal(f.close.GoCloseButton({ level: 'panel', onPress() {}, accessibilityLabel: 'default' }).props.style.width, 44);
  } finally { await f.dispose(); }
});

for (const hand of ['right', 'left']) test(`${hand}: incomplete and interrupted gestures leave scrolling usable and permit a later single close`, async () => {
  const f = await detailFixture({ handedness: hand }); let closed = 0;
  try {
    await f.render({ onClose: () => closed++ }); const initial = f.props.get('entry-details-gesture-body').onPanResponderRelease;
    for (let i = 0; i < 10; i++) await f.render({ entry: { ...detailEntry }, onClose: () => { closed += 2; } });
    assert.equal(f.panCreations, 1); const pan = f.props.get('entry-details-gesture-body'); assert.equal(pan.onPanResponderRelease, initial);
    const point = (x, y, timestamp = 200) => ({ nativeEvent: { pageX: x, pageY: y, identifier: 0, timestamp, touches: [{}] }, stopPropagation() {} });
    const x = hand === 'right' ? 380 : 10, event = point(x, 413), gesture = { dy: 13, dx: 0, y0: 0, vy: 0.1 };
    const down = (sx = x, sy = 400) => pan.onStartShouldSetPanResponderCapture(point(sx, sy, 100));
    down();
    assert.equal(pan.onMoveShouldSetPanResponderCapture(event, gesture), true);
    const boundary = 390 * (hand === 'right' ? .75 : .25);
    down(boundary); assert.equal(pan.onMoveShouldSetPanResponderCapture(point(boundary, 413), gesture), true);
    down(boundary + (hand === 'right' ? -1 : 1)); assert.equal(pan.onMoveShouldSetPanResponderCapture(point(boundary, 413), gesture), false);
    down();
    for (const g of [{ ...gesture, dy: 12 }, { ...gesture, dy: -160 }, { ...gesture, dx: 30 }]) assert.equal(pan.onMoveShouldSetPanResponderCapture(event, g), false);
    down(195); assert.equal(pan.onMoveShouldSetPanResponderCapture(point(195, 413), gesture), false, 'native pre-grant y0=0 cannot capture central scrolling');
    down(195, 70); assert.equal(pan.onMoveShouldSetPanResponderCapture(point(195, 83), gesture), true);
    for (const dy of [13, 50, 139, 140]) await f.settle(() => { down(); pan.onPanResponderGrant(event); pan.onPanResponderRelease(point(x, 400 + dy), { ...gesture, dy }); });
    assert.equal(f.props.get('entry-details-modal').visible, true); assert.equal(closed, 0);
    pan.onPanResponderTerminate(); assert.equal(pan.onPanResponderTerminationRequest(), false);
    assert.equal(f.props.get('entry-details-sheet').style.some(s => s.transform), false, 'no displaced controls or unfinished animation');
    await f.settle(() => { down(); pan.onPanResponderGrant(event); pan.onPanResponderRelease(point(x, 560), { ...gesture, dy: 160 }); pan.onPanResponderRelease(point(x, 600), { ...gesture, dy: 200 }); f.props.get('Cerrar detalle').onPress({ stopPropagation() {} }); });
    assert.equal(f.props.get('entry-details-modal').visible, false); assert.equal(closed, 0); assert.equal(pan.onMoveShouldSetPanResponderCapture(event, gesture), false);
    await f.nativeDismiss(); await f.nativeDismiss(); assert.equal(closed, 2, 'current callback runs exactly once after native dismissal');
    await f.render({ entry: null }); await f.render({ entry: detailEntry }); assert.equal(f.props.get('entry-details-modal').visible, true);
  } finally { await f.dispose(); }
});

for (const platform of ['android', 'web']) test(`${platform}: closing completes once without waiting for iOS-only onDismiss`, async () => {
  const f = await detailFixture({ platform }); let closed = 0;
  try { await f.render({ onClose: () => closed++ }); await f.pressClose(); assert.equal(closed, 1); await f.pressClose(); await f.nativeDismiss(); assert.equal(closed, 1); }
  finally { await f.dispose(); }
});

test('StrictMode replay and stale callbacks from an unmounted record cannot close a different session', async () => {
  const f = await detailFixture({ strict: true }); let old = 0, current = 0;
  try {
    await f.render({ onClose: () => old++ }); const stale = f.props.get('entry-details-modal');
    await f.pressClose(); assert.equal(f.props.get('entry-details-modal').visible, false);
    await f.render({ entry: { ...detailEntry, id: 'new' }, onClose: () => current++ });
    await f.settle(() => { stale.onDismiss(); stale.onRequestClose(); });
    assert.equal(old, 0); assert.equal(current, 0); assert.equal(f.props.get('entry-details-modal').visible, true);
    await f.pressClose(); await f.nativeDismiss(); assert.equal(current, 1);
  } finally { await f.dispose(); }
});

test('detail thresholds match Calendar and both views reuse its actual white fade', () => {
  const source = fs.readFileSync('app/index.tsx', 'utf8'), ast = ts.createSourceFile('home.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX); let node;
  function visit(n) { if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'calTopSwipeRef') node = n; ts.forEachChild(n, visit); } visit(ast);
  const code = ts.transpileModule('(' + node.initializer.getText(ast) + ')', { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const native = vm.runInNewContext(code, { useRef: x => ({ current: x }), PanResponder: { create: c => c }, monthGridOpenRef: { current: false }, calScreenWRef: { current: 390 }, calCloseRef: { current() {} }, calPanelCollapseRef: { current() {} }, calOpenMonthGridRef: { current() {} }, calendarOpenRef: { current: true }, calendarTouchRef: { current: null }, calendarGestureGrantedRef: { current: false }, calendarGestureOwnership: { canUseParentTouch: () => true } });
  assert.equal(native.onMoveShouldSetPanResponder({ nativeEvent: { pageX: 380 } }, { dy: 13, dx: 0 }), true);
  assert.ok(node.getText(ast).includes('dy > 140')); assert.ok(source.includes('<CalendarCloseGuide />'), 'existing Calendar lane stays on its original side; detail mirrors its own lane for handedness');
  const detail = fs.readFileSync('components/GoEntryDetails.tsx', 'utf8'); assert.ok(detail.includes('<CalendarCloseGuide handedness={handedness} testID="entry-detail-swipe-guide" />'));
  assert.ok(!detail.includes('Animated.timing')); assert.ok(!detail.includes('onExit'));
});

for (const hand of ['left', 'right']) test(`${hand}: fade matches Calendar's placement and intensity without covering footer targets`, async () => {
  const f = await detailFixture({ handedness: hand });
  try {
    await f.render(); const guide = f.props.get('entry-detail-swipe-guide');
    assert.equal(guide.pointerEvents, 'none'); assert.equal(guide.style[hand], 0); assert.equal(guide.style.top, '50%'); assert.equal(guide.style.bottom, 0); assert.equal(guide.style.width, '25%');
    assert.deepEqual(Array.from(guide.colors), hand === 'right' ? ['transparent', 'rgba(255,255,255,0.18)'] : ['rgba(255,255,255,0.18)', 'transparent']);
    assert.ok(byId(byId(f.container, 'entry-details-gesture-body'), 'entry-detail-swipe-guide'));
    assert.equal(byId(byId(f.container, 'entry-detail-close-footer'), 'entry-detail-swipe-guide'), undefined);
  } finally { await f.dispose(); }
});
