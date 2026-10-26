import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detailFixture, detailEntry } from './helpers/calendar-detail-lifecycle.mjs';
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

for (const hand of ['right', 'left']) test(`${hand}: native whole-sheet responder and temporary scroll handoff recover after an incomplete or cancelled contact`, async () => {
  const f = await detailFixture({ handedness: hand }); let closed = 0;
  const {touchStream} = (await import('./helpers/native-pan-responder.cjs')).default;
  try {
    await f.render({ onClose: () => closed++ }); const initial=f.props.get('entry-details-sheet').onResponderRelease;
    for(let i=0;i<10;i++)await f.render({entry:{...detailEntry},onClose:()=>{closed+=2;}});
    assert.equal(f.panCreations,1);const pan=f.props.get('entry-details-sheet');assert.equal(pan.onResponderRelease,initial);
    assert.equal(f.props.get('entry-details-gesture-body').onResponderRelease,undefined,'one responder on the full sheet includes the footer without duplication');
    let time=1000;const stream=(x=hand==='right'?380:10)=>touchStream({x,y:400,time:time+=1000});
    const start=s=>{pan.onStartShouldSetResponderCapture(s.event());const move=s.event(0,13);assert.equal(pan.onMoveShouldSetResponderCapture(move),true);assert.equal(pan.onMoveShouldSetResponder(move),true);pan.onResponderGrant(move);};
    for(const dy of[13,40,50]){const s=stream();await f.settle(()=>{start(s);assert.equal(f.nativeScroll.enabled,false);pan.onResponderMove(s.event(0,dy,600));pan.onResponderRelease(s.event(0,dy,10,true));});assert.equal(f.nativeScroll.enabled,true);assert.equal(f.props.get('entry-details-modal').visible,true);}
    const cancel=stream();start(cancel);pan.onResponderTerminate(cancel.event(0,25));assert.equal(f.nativeScroll.enabled,true);assert.equal(pan.onResponderTerminationRequest(),false);
    const center=stream(195);pan.onStartShouldSetResponderCapture(center.event());const move=center.event(0,160);pan.onMoveShouldSetResponderCapture(move);assert.equal(pan.onMoveShouldSetResponder(move),false);assert.equal(f.nativeScroll.enabled,true);
    const valid=stream();await f.settle(()=>{start(valid);pan.onResponderMove(valid.event(0,160,600));const up=valid.event(0,160,10,true);pan.onResponderRelease(up);pan.onResponderRelease(up);});
    assert.equal(f.props.get('entry-details-modal').visible,false);assert.equal(f.nativeScroll.enabled,true);assert.equal(closed,0);await f.nativeDismiss();await f.nativeDismiss();assert.equal(closed,2);
    await f.render({entry:null});await f.render({entry:detailEntry});assert.equal(f.props.get('entry-details-modal').visible,true);
  }finally{await f.dispose();}
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

test('Calendar and detail use one real responder factory and preserve the original white fade', () => {
  const source = fs.readFileSync('app/index.tsx', 'utf8'), detail = fs.readFileSync('components/GoEntryDetails.tsx', 'utf8');
  assert.ok(source.includes('createCalendarCloseResponder({'));
  assert.ok(detail.includes('<GoScreenCloseSurface'));assert.ok(fs.readFileSync('lib/screenCloseGesture.ts','utf8').includes('createCalendarCloseResponder({'));
  assert.ok(!detail.includes('PanResponder.create'));
  assert.ok(!detail.includes('flingDistance'));
  assert.ok(source.includes('<CalendarCloseGuide />'));
  assert.ok(detail.includes('<GoScreenCloseGuide testID="entry-detail-swipe-guide" />'));
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
