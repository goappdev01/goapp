import React, { createContext, useContext, useLayoutEffect, useRef, useState } from "react";
import { Modal as NativeModal, View, Image, StyleSheet, type ModalProps } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";

// Preserve the existing Landing background for contexts that still have a gutter.
const LandingBackground = createContext({ show: (_visible: boolean) => {}, topInset: 0 });
export function useOwnerLandingBackground(visible: boolean) {
  const { show, topInset } = useContext(LandingBackground);
  useLayoutEffect(() => {
    show(visible);
    return () => show(false);
  }, [visible, show]);
  return visible ? topInset : 0;
}
function useOwnerPresentation() {
  const admin = useAdminAccess();
  const ownerId = useRef<string | null>(null);
  if (admin.isOwner) ownerId.current = admin.userId;
  if (!admin.checking && !admin.isOwner) ownerId.current = null;
  // Retained presentation during revalidation never authorizes an operation.
  const presentation = admin.isOwner || (admin.checking && !!admin.userId && ownerId.current === admin.userId);
  return __DEV__ && presentation;
}
/** Preserve the original background without environment badges or reserved rows. */
export function OwnerContextSurface({ children }: { children: React.ReactNode }) {
  const ownerPresentation = useOwnerPresentation();
  const [landingVisible, setLandingVisible] = useState(false);
  return <LandingBackground.Provider value={{ show: setLandingVisible, topInset: 0 }}>
    <View style={styles.surface}>
      {ownerPresentation && landingVisible && <View pointerEvents="none" style={StyleSheet.absoluteFill}
        testID="landing-safe-area-background" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Image source={require("../../assets/images/earth_bg.png")} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(2,4,12,0.51)" }]} />
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(3,6,22,0.12)" }]} />
        <LinearGradient colors={["rgba(2,4,12,0.72)", "transparent"]}
          start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 0.22 }} style={StyleSheet.absoluteFill} />
      </View>}
      {children}
    </View>
  </LandingBackground.Provider>;
}
/** Existing modal behavior and background, without decorative environment layers. */
export function OwnerContextModal({ children, calendarWatermark: _calendarWatermark = false, ...props }: ModalProps & { calendarWatermark?: boolean }) {
  const ownerPresentation = useOwnerPresentation();
  if (!ownerPresentation) return <NativeModal {...props}>{children}</NativeModal>;
  return <NativeModal {...props}><View style={styles.surface}>
    {children}
  </View></NativeModal>;
}
const styles = StyleSheet.create({
  surface: { flex: 1, backgroundColor: "#0a0a0f" },
});
