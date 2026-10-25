import React from "react";
import { StyleSheet, View } from "react-native";

/** Stable visit frame: decoration never constrains or intercepts its contents. */
export const LANDING_VISIT_FRAME = Object.freeze({ bottomGap: 8, outset: 8, borderWidth: 1.5, radius: 14 });

export function LandingVisitOutline({ color, scale }: { color: string; scale: number }) {
  return <View testID="landing-visit-outline" pointerEvents="none" accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, {
      left: -Math.round(LANDING_VISIT_FRAME.outset * scale), right: -Math.round(LANDING_VISIT_FRAME.outset * scale),
      borderRadius: Math.round(LANDING_VISIT_FRAME.radius * scale), borderWidth: LANDING_VISIT_FRAME.borderWidth,
      borderColor: color, shadowColor: color, shadowOpacity: 0.35, shadowRadius: 10,
      shadowOffset: { width: 0, height: 0 },
    }]} />;
}
