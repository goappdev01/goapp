import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Modal as NativeModal, Platform, View, Text, StyleSheet, type ModalProps } from "react-native";
import { FullWindowOverlay } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGoView } from "@/contexts/GoViewContext";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";

const ModalLayers = createContext({ count: 0, change: (_delta: number) => {} });
function useLabel() {
  const view = useGoView();
  const admin = useAdminAccess();
  const ownerId = useRef<string | null>(null);
  const { demo } = useOwnerBusinessDemo();
  if (admin.isOwner) ownerId.current = admin.userId;
  if (!admin.checking && !admin.isOwner) ownerId.current = null;
  // Retained presentation during revalidation never authorizes an operation.
  const presentation = admin.isOwner || (admin.checking && !!admin.userId && ownerId.current === admin.userId);
  if (!__DEV__ || !presentation) return null;
  const context = view.view === "BUSINESS" ? "EMPRESA DEMO" : view.view === "ADMIN" ? "ADMIN" : "USUARIO";
  const local = view.view === "BUSINESS" || (view.view === "USER" && !!demo?.getSnapshot().config.businessName.trim());
  return context + (local ? " · DEMO LOCAL" : "");
}
function Indicator({ label }: { label: string }) {
  const insets = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.badge, { top: insets.top + 2 }]}
    accessibilityRole="text" accessibilityLabel={label} testID="owner-context-indicator">
    <Text style={styles.text}>{label}</Text>
  </View>;
}
/** iOS window overlay keeps ONE passive label above native modals and deep screens. */
export function OwnerContextSurface({ children }: { children: React.ReactNode }) {
  const label = useLabel();
  const [count, setCount] = useState(0);
  return <ModalLayers.Provider value={{ count, change: delta => setCount(value => Math.max(0, value + delta)) }}>
    <View style={[styles.surface, label ? { paddingTop: 22 } : undefined]}>
      {children}
      {label && (Platform.OS === "ios"
        ? <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}><Indicator label={label} /></FullWindowOverlay>
        : count === 0 ? <Indicator label={label} /> : null)}
    </View>
  </ModalLayers.Provider>;
}
/** Native modal and callbacks unchanged; reserve room for the passive owner label. */
export function OwnerContextModal({ children, ...props }: ModalProps) {
  const label = useLabel();
  const layers = useContext(ModalLayers);
  const change = useRef(layers.change);
  change.current = layers.change;
  useEffect(() => {
    if (!props.visible || !label || Platform.OS === "ios") return;
    change.current(1);
    return () => change.current(-1);
  }, [props.visible, !!label]);
  if (!label) return <NativeModal {...props}>{children}</NativeModal>;
  return <NativeModal {...props}><View style={[styles.surface, { paddingTop: 22 }]}>
    {children}
    {Platform.OS !== "ios" && <Indicator label={label} />}
  </View></NativeModal>;
}
const styles = StyleSheet.create({
  surface: { flex: 1 },
  badge: { position: "absolute", alignSelf: "center", maxWidth: "86%", backgroundColor: "#b91c1c",
    borderRadius: 5, paddingHorizontal: 8, paddingVertical: 2, zIndex: 2147483647, elevation: 100 },
  text: { color: "#ffffff", fontSize: 10, fontWeight: "800", textAlign: "center" },
});
