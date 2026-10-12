import React from "react";
import { View, Text } from "react-native";
import { Feather } from "@expo/vector-icons";
import { getOrbitVisualSurface, type LandingVisualTheme } from "./landingVisualThemes";

/** Paint only; the existing parent owns dimensions, gestures and accessibility. */
export function LandingActionSurface({ theme, icon, label, size, color, selected }: {
  theme: LandingVisualTheme;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  size: number;
  color: string;
  selected: boolean;
}) {
  const professional = theme.variant === "profesional";
  const surface = getOrbitVisualSurface(theme, color, selected)!;
  return (
    <View pointerEvents="none" style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <View style={{
        width: size * 0.82, height: size * 0.64,
        borderRadius: professional ? 12 : 4,
        backgroundColor: professional ? surface.colors[0] : selected ? "#FFFFFF" : "rgba(237,241,244,0.94)",
        borderWidth: selected ? 2 : professional ? 0.75 : 0,
        borderColor: surface.border,
        alignItems: "center", justifyContent: "center", gap: 3,
        paddingHorizontal: 3,
      }}>
        <Feather name={icon} size={size * 0.25} color={surface.icon} />
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{
          color: surface.label, fontFamily: "Inter_700Bold",
          fontSize: size * 0.115, lineHeight: size * 0.16, textAlign: "center",
        }}>{label}</Text>
      </View>
    </View>
  );
}
