import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { detailFixture, detailEntry } from './calendar-detail-lifecycle.mjs';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { ts } = require('./tests/helpers/react-lifecycle.cjs');
const { nativePanResponder, touchStream } = require('./tests/helpers/native-pan-responder.cjs');

/** Both real Home recognizers plus the real mounted detail and installed RN responder. */
export async function nestedCalendarFixture({ hand = 'right', homeSource = fs.readFileSync('app/index.tsx', 'utf8') } = {}) {
  const responder = nativePanResponder(), detail = await detailFixture({ handedness: hand, responder });
  const ast = ts.createSourceFile('home.tsx', homeSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX), declarations = new Map();
  function visit(n) { if (ts.isVariableDeclaration(n)) declarations.set(n.name.getText(ast), n); ts.forEachChild(n, visit); } visit(ast);
  const counters = { calendarCloses: 0, globalCloses: 0, resetFields: 0, detailCloses: 0, collapsed: 0, monthOpened: 0 };
  const calendarOpenRef = { current: true }, nativeConfigs = [];
  const scope = { useRef: x => ({ current: x }), useMemo: fn => fn(), PanResponder: responder, calendarOpenRef,
    calendarTouchRef: { current: null }, calendarGestureGrantedRef: { current: false }, monthGridOpenRef: { current: false }, calScreenWRef: { current: 390 },
    calendarGestureOwnership: detail.ownership, calCloseRef: { current: () => { counters.calendarCloses++; calendarOpenRef.current = false; } },
    calPanelCollapseRef: { current: () => counters.collapsed++ }, calOpenMonthGridRef: { current: () => counters.monthOpened++ },
    goAuthOpen: false, calOpen: true, detailGestureOpen: false, swipeStartZoneRef: { current: { valid: false, ticket: null } },
    swipeHandlersRef: { current: { closeAllOverlays: () => { counters.globalCloses++; calendarOpenRef.current = false; }, resetContactFields: () => counters.resetFields++, setOtrosOpen() {} } },
    Dimensions: { get: () => ({ width: 390, height: 844 }) }, Haptics: { impactAsync() {}, ImpactFeedbackStyle: { Light: 'light' } } };
  scope.Gesture = { Pan: () => {
    const config = {}; const chain = new Proxy({}, { get: (_, method) => (...args) => { config[method] = args[0]; return chain; } });
    nativeConfigs.push(config); return chain;
  } };
  vm.createContext(scope);
  const run = text => vm.runInContext(ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, alwaysStrict: false } }).outputText, scope);
  run('calendarPan = (' + declarations.get('calTopSwipeRef').initializer.getText(ast) + ').panHandlers;');
  let root;
  const refreshRoot = () => {
    scope.calOpen = calendarOpenRef.current; scope.detailGestureOpen = detail.ownership.detailOpen();
    run('rootGesture = (' + declarations.get('universalSwipeGesture').initializer.getText(ast) + ');');
    root = nativeConfigs.at(-1);
  };
  let selected = false, time = 1000;
  const render = async entry => {
    selected = !!entry;
    await detail.render({ entry, onClose: () => { counters.detailCloses++; } }); refreshRoot();
  };
  await render(null);
  return { detail, counters, calendarOpenRef, scope, refreshRoot, get root() { return root; }, get calendarPan() { return scope.calendarPan; },
    async open(entry = detailEntry) { if (!calendarOpenRef.current) throw Error('Calendar is not open'); await render(entry); },
    async acknowledge() { await detail.nativeDismiss(); await render(null); },
    async reopenCalendar() { calendarOpenRef.current = true; refreshRoot(); },
    stream(x = hand === 'right' ? 380 : 10, y = 450) { time += 1000; return touchStream({ x, y, time }); },
    rootDown() { root.onTouchesDown?.({}); },
    rootStart() { root.onStart?.({ absoluteX: 380, absoluteY: 600 }); },
    rootEnd(dy = 180, success = true) { root.onEnd?.({ translationY: dy }, success); root.onFinalize?.(); },
    async releaseDetail(stream, distance = 145, duration = 600) {
      const pan = detail.props.get('entry-details-gesture-body');
      const down = stream.event(); pan.onStartShouldSetResponderCapture(down);
      const activation = stream.event(0, 13, 40), claim = pan.onMoveShouldSetResponderCapture(activation);
      if (!claim) return { claimed: false, down };
      pan.onResponderGrant(activation); pan.onResponderMove(stream.event(0, distance, duration));
      const up = stream.event(0, distance, 10, true);
      await detail.settle(() => pan.onResponderRelease(up));
      return { claimed: true, down, up, pan };
    },
    async dispose() { await detail.dispose(); if (detail.ownership.detailOpen()) throw Error('Detail ownership leaked'); } };
}
