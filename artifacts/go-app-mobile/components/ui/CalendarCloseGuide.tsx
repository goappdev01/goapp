import React from "react";
import { LinearGradient } from "expo-linear-gradient";

/** Calendar's thumb-side close lane. Decoration never captures touches. */
export function CalendarCloseGuide({ handedness = "right", testID = "calendar-close-guide" }: {
  handedness?: "left" | "right"; testID?: string;
}) {
  return <LinearGradient testID={testID}
    colors={handedness === "right" ? ["transparent", "rgba(255,255,255,0.18)"] : ["rgba(255,255,255,0.18)", "transparent"]}
    start={{ x: 0, y: 0.5 }} end={{ x: 1, y: 0.5 }}
    pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ position: "absolute", [handedness]: 0, top: "50%", bottom: 0, width: "25%" }} />;
}
