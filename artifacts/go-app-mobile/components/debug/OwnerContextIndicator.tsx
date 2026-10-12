import React, { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Modal as NativeModal, Platform, View, Text, Image, StyleSheet, type ModalProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { FullWindowOverlay } from "react-native-screens";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useGoView } from "@/contexts/GoViewContext";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";

// Presentation only: extend the Landing behind the owner label's existing gutter.
const LandingBackground = createContext({ show: (_visible: boolean) => {}, topInset: 0 });
export function useOwnerLandingBackground(visible: boolean) {
  const { show, topInset } = useContext(LandingBackground);
  useLayoutEffect(() => {
    show(visible);
    return () => show(false);
  }, [visible, show]);
  return visible ? topInset : 0;
}
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
  const [landingVisible, setLandingVisible] = useState(false);
  return <LandingBackground.Provider value={{ show: setLandingVisible, topInset: label ? 22 : 0 }}><ModalLayers.Provider value={{ count, change: delta => setCount(value => Math.max(0, value + delta)) }}>
    <View style={[styles.surface, label ? { paddingTop: 22 } : undefined]}>
      {label && landingVisible && <View pointerEvents="none" style={StyleSheet.absoluteFill}
        testID="landing-safe-area-background" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={require("../../assets/images/earth_bg.png")} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(2,4,12,0.51)" }]} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(3,6,22,0.12)" }]} />
        <LinearGradient colors={["rgba(2,4,12,0.72)", "transparent"]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.22 }} style={StyleSheet.absoluteFill} />
      </View>}
      {children}
      {label && (Platform.OS === "ios"
        ? <FullWindowOverlay unstable_accessibilityContainerViewIsModal={false}><Indicator label={label} /></FullWindowOverlay>
        : count === 0 ? <Indicator label={label} /> : null)}
    </View>
  </ModalLayers.Provider></LandingBackground.Provider>;
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
