import React from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { LandingVisualTheme } from "./landingVisualThemes";

/** Decorative content only: the parent retains its gestures and original hit area. */
export function LandingSatelliteSurface({ theme, icon, label, size }: {
  theme: LandingVisualTheme;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  size: number;
}) {
  const professional = theme.variant === "profesional";
  return (
    <View pointerEvents="none" style={{
      width: size * 0.94,
      height: size * 0.68,
      borderRadius: professional ? size * 0.23 : 4,
      backgroundColor: theme.satelliteBackground,
      borderWidth: professional ? 0.75 : 0,
      borderColor: theme.satelliteBorder,
      alignItems: "center", justifyContent: "center",
      gap: size * 0.035, paddingHorizontal: 2,
    }}>
      <Feather name={icon} size={size * 0.25} color={theme.satelliteIcon} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{
        color: theme.satelliteText, fontFamily: "Inter_700Bold",
        fontSize: size * 0.16, lineHeight: size * 0.20,
        textAlign: "center", maxWidth: "100%", letterSpacing: 0,
      }}>{label}</Text>
    </View>
  );
}
