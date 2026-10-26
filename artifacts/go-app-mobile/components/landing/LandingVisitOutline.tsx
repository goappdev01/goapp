import React from "react";
import { StyleSheet, View } from "react-native";

/** Approved Admin yellow; module identity is independent of role, business and booking state. */
export const LANDING_VISIT_VISUAL = Object.freeze({ color: "#eab308" });

/** Shared global frame: decoration never constrains or intercepts its contents. */
export const LANDING_VISIT_FRAME = Object.freeze({ bottomGap: 8, outset: 8, borderWidth: 1.5, radius: 14 });
export const LANDING_ENTRY_FRAME = LANDING_VISIT_FRAME;

export function LandingEntryOutline({ color, scale, testID = "landing-entry-outline", shadowColor = color, shadowOpacity = 0.35, shadowRadius = 10 }: {
  color: string; scale: number; testID?: string; shadowColor?: string; shadowOpacity?: number; shadowRadius?: number;
}) {
  return <View testID={testID} pointerEvents="none" accessibilityElementsHidden
    importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, {
      left: -Math.round(LANDING_VISIT_FRAME.outset * scale), right: -Math.round(LANDING_VISIT_FRAME.outset * scale),
      borderRadius: Math.round(LANDING_VISIT_FRAME.radius * scale), borderWidth: LANDING_VISIT_FRAME.borderWidth,
      borderColor: color, shadowColor, shadowOpacity, shadowRadius,
      shadowOffset: { width: 0, height: 0 },
    }]} />;
}

/** Keep the approved visit presentation exactly on the common structure. */
export function LandingVisitOutline(props: { color: string; scale: number }) {
  return <LandingEntryOutline {...props} testID="landing-visit-outline" />;
}
