import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Modal as NativeModal, StyleSheet, View, type ModalProps } from "react-native";

type Layer = { id: number; children: React.ReactNode; onShow: () => void; onDismiss: () => void; onBack: () => void };
type Host = { put: (layer: Layer) => void; remove: (id: number) => void };
const ScreenHost = createContext<Host | null>(null);
export const GoScreenLayerActive = createContext(true);
let nextScreenId = 0;

function PresentedLayer({ layer, top }: { layer: Layer; top: boolean }) {
  const parentActive = useContext(GoScreenLayerActive);
  const current = useRef(layer); current.current = layer;
  useEffect(() => { current.current.onShow(); return () => current.current.onDismiss(); }, []);
  return <View testID="go-presented-layer" pointerEvents={top ? "auto" : "none"} accessibilityViewIsModal={top} accessibilityElementsHidden={!top} importantForAccessibility={top ? "auto" : "no-hide-descendants"} style={StyleSheet.absoluteFill}>
    <GoScreenLayerActive.Provider value={parentActive && top}>{layer.children}</GoScreenLayerActive.Provider>
  </View>;
}

/** One native presenter, with independent existing screens above it. No panel geometry is changed. */
export function GoScreenHost({ children, registerBack }: { children: React.ReactNode; registerBack?: (handler: (() => boolean) | null) => void }) {
  const parentActive = useContext(GoScreenLayerActive);
  const [layers, setLayers] = useState<Layer[]>([]);
  const live = useRef(layers); live.current = layers;
  const put = useCallback((layer: Layer) => setLayers(previous => {
    const index = previous.findIndex(value => value.id === layer.id);
    return index < 0 ? [...previous, layer] : previous.map(value => value.id === layer.id ? layer : value);
  }), []);
  const remove = useCallback((id: number) => setLayers(previous => previous.some(value => value.id === id) ? previous.filter(value => value.id !== id) : previous), []);
  const host = useMemo(() => ({ put, remove }), [put, remove]);
  const back = useCallback(() => { const top = live.current.at(-1); if (!top) return false; top.onBack(); return true; }, []);
  useEffect(() => { registerBack?.(back); return () => registerBack?.(null); }, [back, registerBack]);
  return <ScreenHost.Provider value={host}>
    <View testID="go-screen-host" style={{ flex: 1 }}>
      <View pointerEvents={layers.length ? "none" : "auto"} accessibilityElementsHidden={!!layers.length} importantForAccessibility={layers.length ? "no-hide-descendants" : "auto"} style={{ flex: 1 }}><GoScreenLayerActive.Provider value={parentActive && !layers.length}>{children}</GoScreenLayerActive.Provider></View>
      {layers.map((layer, index) => <PresentedLayer key={layer.id} layer={layer} top={index === layers.length - 1} />)}
    </View>
  </ScreenHost.Provider>;
}

/** Uses the current native host when available, otherwise preserves the ordinary RN Modal contract. */
export function GoScreenModal({ children, visible = true, onShow, onDismiss, onRequestClose, ...props }: ModalProps) {
  const host = useContext(ScreenHost);
  const [id] = useState(() => ++nextScreenId);
  const callbacks = useRef({ onShow, onDismiss, onRequestClose, visible }); callbacks.current = { onShow, onDismiss, onRequestClose, visible };
  const shown = useRef(false);
  const nestedBack = useRef<(() => boolean) | null>(null);
  const layer = useMemo<Layer>(() => ({ id, children,
    onShow: () => { if (!shown.current) { shown.current = true; if (callbacks.current.onShow) Reflect.apply(callbacks.current.onShow, undefined, [{ nativeEvent: {} }]); } },
    onDismiss: () => { if (!callbacks.current.visible) callbacks.current.onDismiss?.(); },
    onBack: () => { if (callbacks.current.onRequestClose) Reflect.apply(callbacks.current.onRequestClose, undefined, [{ nativeEvent: {} }]); },
  }), [id, children]);
  useLayoutEffect(() => {
    if (!host) return;
    if (visible) host.put(layer); else { shown.current = false; host.remove(id); }
  }, [host, id, layer, visible]);
  useLayoutEffect(() => () => { host?.remove(id); }, [host, id]);
  if (host) return null;
  return <NativeModal {...props} visible={visible} onShow={onShow} onDismiss={onDismiss} onRequestClose={event => { if (!nestedBack.current?.()) onRequestClose?.(event); }}>
    <GoScreenHost registerBack={handler => { nestedBack.current = handler; }}>{children}</GoScreenHost>
  </NativeModal>;
}
