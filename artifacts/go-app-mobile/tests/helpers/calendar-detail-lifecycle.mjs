import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(path.join(process.cwd(), 'package.json'));
const { React, createRoot, document, rn, evaluate } = require('./tests/helpers/react-lifecycle.cjs');
export const detailEntry = { id: 'r1', type: 'GO_BOOKING', kind: 'sent', customerBooking: true, reservationId: 'r1', estado: 'aceptado', contactName: 'Salón', date: '26/10/30', time: '12:00' };

/** Real React lifecycle; native layout and dismissal acknowledgements are explicit adapters. */
export async function detailFixture({ handedness = 'right', platform = 'ios', strict = false, width = 390, insets = { top: 47, bottom: 34, left: 0, right: 0 }, responder } = {}) {
  const props = new Map(); let panCreations = 0;
  const ownership = evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership;
  const View = p => { if (p.testID) props.set(p.testID, p); return React.createElement('div', { 'data-testid': p.testID }, p.children); };
  const TouchableOpacity = p => { props.set(p.accessibilityLabel, p); return React.createElement('button', { 'aria-label': p.accessibilityLabel }, p.children); };
  const native = { ...rn, View, TouchableOpacity, ScrollView: View, Modal: View, Platform: { OS: platform }, Dimensions: { get: () => ({ width, height: 844 }) },
    PanResponder: { create: config => { panCreations++; return responder ? responder.create(config) : { panHandlers: config }; } } };
  const close = evaluate('components/ui/GoCloseButton.tsx', { 'react-native': native, '@expo/vector-icons': { Feather: () => null } });
  const calendarCloseResponder = evaluate('lib/calendarCloseResponder.ts', { 'react-native': native, './calendarGestureOwnership': { calendarGestureOwnership: ownership } });
  const guide = evaluate('components/ui/CalendarCloseGuide.tsx', { 'expo-linear-gradient': { LinearGradient: View } });
  const api = evaluate('components/GoEntryDetails.tsx', { 'react-native': native, '@expo/vector-icons': { Feather: () => null },
    '@/contexts/LanguageContext': { useLanguage: () => ({ lang: 'es', t: k => k }) },
    '@/data/goEntryPresentation': evaluate('data/goEntryPresentation.ts'), '@/data/reservationCardPolicy': evaluate('data/reservationCardPolicy.ts'),
    '@/lib/calendarGestureOwnership': { calendarGestureOwnership: ownership },
    '@/lib/calendarCloseResponder': calendarCloseResponder,
    'react-native-safe-area-context': { useSafeAreaInsets: () => insets }, './ui/GoCloseButton': close, './ui/CalendarCloseGuide': guide,
    './landing/landingPanels': evaluate('components/landing/landingPanels.ts') });
  const container = document.createElement('div'), root = createRoot(container);
  const settle = async fn => React.act(async () => { fn?.(); for (let i = 0; i < 10; i++) await Promise.resolve(); });
  return { props, api, close, guide, ownership, calendarCloseResponder, container, settle, get panCreations() { return panCreations; },
    render: extra => settle(() => { const child = React.createElement(api.GoEntryDetailsSheet, { entry: detailEntry, handedness, onClose() {}, ...extra }); root.render(strict ? React.createElement(React.StrictMode, null, child) : child); }),
    nativeDismiss: () => settle(() => props.get('entry-details-modal').onDismiss()),
    pressClose: () => settle(() => props.get('Cerrar detalle').onPress({ stopPropagation() {} })), dispose: () => settle(() => root.unmount()) };
}
