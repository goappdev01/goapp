import React from "react";
import { StyleSheet, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";

type Props = {
  disabled?: boolean;
  level: "panel" | "container";
  onPress: () => void;
  accessibilityLabel: string;
};

/** ↓ closes one open panel; ⇓ exits its containing screen. */
export function GoCloseButton({ level, onPress, accessibilityLabel, disabled = false }: Props) {
  return (
    <TouchableOpacity
      onPress={event => { event.stopPropagation(); onPress(); }}
      disabled={disabled}
      accessibilityState={{ disabled }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      activeOpacity={0.75}
      hitSlop={2}
      style={styles.button}
    >
      <Feather name={level === "panel" ? "chevron-down" : "chevrons-down"} size={20} color="#ffffff" />
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
