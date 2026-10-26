import path from 'node:path';
import { createRequire } from 'node:module';
import { screenCloseSurface } from './screen-close-surface.mjs';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, rn, evaluate } = require('./tests/helpers/react-lifecycle.cjs');
const actualResponder = require('./tests/helpers/native-pan-responder.cjs').nativePanResponder();
export const detailEntry = { id: 'r1', type: 'GO_BOOKING', kind: 'sent', customerBooking: true, reservationId: 'r1', estado: 'aceptado', contactName: 'Salón', date: '26/10/30', time: '12:00' };

/** Real React lifecycle; native layout and dismissal acknowledgements are explicit adapters. */
export async function detailFixture({ handedness = 'right', platform = 'ios', strict = false, width = 390, insets = { top: 47, bottom: 34, left: 0, right: 0 }, responder } = {}) {
  const props = new Map(); let panCreations = 0;
  const nativeScroll = { enabled: true, updates: [] };
  const ownership = evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership;
  const View = p => {
    React.useImperativeHandle(p.ref,()=>({measureInWindow(callback){callback(9.5,insets.top+9.5,width-19,844-insets.top-insets.bottom-16-3-66);}}),[]);
    if (p.testID) props.set(p.testID, p); return React.createElement('div', { 'data-testid': p.testID }, p.children);
  };
  const TouchableOpacity = p => { props.set(p.accessibilityLabel, p); return React.createElement('button', { 'aria-label': p.accessibilityLabel }, p.children); };
  const NativeScroll = p => { React.useLayoutEffect(()=>{nativeScroll.enabled=true;},[]); React.useImperativeHandle(p.ref, () => ({ setNativeProps(update) { nativeScroll.enabled=update.scrollEnabled;nativeScroll.updates.push(update.scrollEnabled); } }), []); return React.createElement(View,p); };
  const native = { ...rn, StyleSheet:{...rn.StyleSheet,absoluteFill:{position:'absolute',top:0,right:0,bottom:0,left:0}}, View, TouchableOpacity, ScrollView: NativeScroll, Modal: View, Platform: { OS: platform }, Dimensions: { get: () => ({ width, height: 844 }) },
    PanResponder: { create: config => { panCreations++; return (responder || actualResponder).create(config); } } };
  const close = evaluate('components/ui/GoCloseButton.tsx', { 'react-native': native, '@expo/vector-icons': { Feather: () => null } });
  const calendarCloseResponder = evaluate('lib/calendarCloseResponder.ts', { 'react-native': native, './calendarGestureOwnership': { calendarGestureOwnership: ownership } });
  const guide = evaluate('components/ui/CalendarCloseGuide.tsx', { 'expo-linear-gradient': { LinearGradient: View } });
  const surface = screenCloseSurface(native,ownership,guide);
  const api = evaluate('components/GoEntryDetails.tsx', { 'react-native': native, '@expo/vector-icons': { Feather: () => null },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: 'es', t: k => k }) },
    '@/data/goEntryPresentation': evaluate('data/goEntryPresentation.ts'), '@/data/reservationCardPolicy': evaluate('data/reservationCardPolicy.ts'),
    '@/lib/calendarGestureOwnership': { calendarGestureOwnership: ownership },
    '@/lib/calendarCloseResponder': calendarCloseResponder,
    '@/lib/entryDetailTouchDelivery': evaluate('lib/entryDetailTouchDelivery.ts'),
    '@/components/ui/GoScreenCloseSurface':surface,
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets }, './ui/GoCloseButton': close, './ui/CalendarCloseGuide': guide,
    './landing/landingPanels': evaluate('components/landing/landingPanels.ts') });
  const container = document.createElement('div'), root = createRoot(container);
  const settle = async fn => React.act(async () => { fn?.(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  return { props, api, close, guide, ownership, calendarCloseResponder, nativeScroll, container, settle, get panCreations() { return panCreations; },
    render: extra => settle(() => { const child = React.createElement(api.GoEntryDetailsSheet, { entry: detailEntry, handedness, onClose() {}, ...extra }); root.render(strict ? React.createElement(React.StrictMode, null, child) : child); }),
    nativeDismiss: () => settle(() => props.get('entry-details-modal').onDismiss()),
    pressClose: () => settle(() => props.get('Cerrar detalle').onPress({ stopPropagation() {} })), dispose: () => settle(() => root.unmount()) };
}
