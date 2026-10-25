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
};

/** ↓ closes one open panel; ⇓ exits its containing screen. */
export function GoCloseButton({ level, onPress, accessibilityLabel, disabled = false, hitSlop = 2, touchSize = 44 }: Props) {
  const size = Math.max(44, touchSize);
  const icon = <Feather name={level === "panel" ? "chevron-down" : "chevrons-down"} size={20} color="#ffffff" />;
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
      style={size === 44 ? styles.button : { width: size, height: size, alignItems: "center", justifyContent: "center" }}
    >
      {size === 44 ? icon : <View pointerEvents="none" style={styles.button}>{icon}</View>}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
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
