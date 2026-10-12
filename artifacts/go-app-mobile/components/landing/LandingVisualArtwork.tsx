import React from "react";
import { Text, View, StyleSheet, useWindowDimensions } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import type { LandingVisualVariant } from "./landingVariant";

/** Purely decorative layers. The preserved image and all touch targets stay mounted underneath. */
export function LandingVisualArtwork({ variant }: { variant: LandingVisualVariant }) {
  const { width, height } = useWindowDimensions();
  if (variant === "actual" || variant === "planeta") return null;
  return <View pointerEvents="none" accessible={false} accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: "#040813" }]}>
    {variant === "marca" ? <View style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
      <Text allowFontScaling={false} style={{ color: "#ffffff", opacity: 0.065, fontSize: Math.min(width * 0.62, height * 0.32),
        fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: -8 }}>GO</Text>
    </View> : <Svg width="100%" height="100%" viewBox="0 0 400 800" preserveAspectRatio="xMidYMid slice">
      <Circle cx="200" cy="350" r="126" fill="none" stroke="#d4aa3f" strokeWidth="1" opacity="0.13" />
      <Circle cx="200" cy="350" r="87" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.07" />
      <Path d="M200 211L322 280L322 420L200 490L78 420L78 280Z M78 280L322 420M322 280L78 420M200 211V490"
        fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.08" />
      <Circle cx="200" cy="211" r="4" fill="#d4aa3f" opacity="0.2" />
      <Circle cx="322" cy="420" r="4" fill="#d4aa3f" opacity="0.2" />
      <Circle cx="78" cy="420" r="4" fill="#d4aa3f" opacity="0.2" />
    </Svg>}
  </View>;
}

/** Hide only the ink. No wrapper changes native layout in A; hidden children retain their geometry. */
export function UserLandingInk({ minimal, children }: { minimal: boolean; children: React.ReactNode }) {
  if (!minimal) return <>{children}</>;
  return <>{React.Children.map(children, child => {
    if (!React.isValidElement(child)) return child;
    const element = child as React.ReactElement<{ style?: any; accessibilityElementsHidden?: boolean; importantForAccessibility?: string }>;
    return React.cloneElement(element, { style: [element.props.style, { opacity: 0 }],
      accessibilityElementsHidden: true, importantForAccessibility: "no-hide-descendants" });
  })}</>;
}
export class LandingVisualBoundary extends React.Component<
  { children: React.ReactNode; onFailure: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch() { this.props.onFailure(); }
  render() { return this.state.failed ? null : this.props.children; }
}
