import React from "react";
import { StyleSheet, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";

type Props = {
  disabled?: boolean;
  level: "panel" | "container";
  onPress: () => void;
  accessibilityLabel: string;
  hitSlop?: number;
  touchSize?: number;
  appearance?: "default" | "light";
};

/** ↓ closes one open panel; ⇓ exits its containing screen. */
export function GoCloseButton({ level, onPress, accessibilityLabel, disabled = false, hitSlop = 2, touchSize = 44, appearance = "default" }: Props) {
  const size = Math.max(44, touchSize);
  const buttonStyle = appearance === "light" ? [styles.button, styles.light] : styles.button;
  const icon = <Feather name={level === "panel" ? "chevron-down" : "chevrons-down"} size={20} color={appearance === "light" ? "#17212b" : "#ffffff"} />;
  return (
    <TouchableOpacity
      onPress={event => { event?.stopPropagation(); onPress(); }}
      disabled={disabled}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.75}
      hitSlop={hitSlop}
      delayPressIn={0}
      style={size === 44 ? buttonStyle : { width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      {size === 44 ? icon : <View pointerEvents="none" style={buttonStyle}>{icon}</View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  light: { backgroundColor: "rgba(238,244,248,0.96)", borderColor: "#91a4b1", borderWidth: 1, shadowColor: "#314955", shadowOpacity: 0.14, shadowRadius: 5, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  button: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: "#0e0e10",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.50)",
    alignItems: "center",
    justifyContent: "center",
  },
});
