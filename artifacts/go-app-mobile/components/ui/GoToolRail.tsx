import React, { useCallback, useRef } from "react";
import { StyleSheet, Text, TouchableOpacity, View, type ViewProps } from "react-native";
import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { DraggableFAB } from "@/components/DraggableFAB";

/** The approved NOTA rail owns the gesture and preference for all three editors.
 * Keep its original storage keys: temporary keyboard clamping never overwrites them. */
export function GoToolRailToggle({ bounds, handedness, open, onPress, disabled, testID,
  accessibilityLabel, buttonKey = "tools-toggle", freeMovement = false, verticalInset = 8, initialTop,
}: {
  bounds: { width: number; height: number }; handedness: "left" | "right"; open: boolean;
  onPress: () => void; disabled?: boolean; testID?: string; accessibilityLabel: string;
  buttonKey?: string; freeMovement?: boolean; verticalInset?: number; initialTop?: number;
}) {
  const press = useRef({ dragging: false, suppress: false });
  const start = useCallback(() => { press.current = { dragging: true, suppress: true }; }, []);
  const end = useCallback(() => { press.current.dragging = false; }, []);
  if (bounds.width < 44 || bounds.height < 48 + verticalInset * 2) return null;
  return <DraggableFAB screenKey="note-editor" buttonKey={buttonKey} bounds={bounds}
    boundsVerticalInset={verticalInset} buttonWidth={44} maxH={48}
    initialTop={initialTop ?? Math.max(8, Math.min(bounds.height - 56, Math.round(bounds.height * .74)))}
    initialRight={handedness === "right" ? 0 : Math.max(0, bounds.width - 44)}
    fixedLeft={freeMovement ? undefined : handedness === "right" ? bounds.width - 44 : 0}
    onDragStart={start} onDragEnd={end}>
    <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
      accessibilityHint={freeMovement ? "Mantén pulsado medio segundo para mover la flecha" : "Mantén pulsado medio segundo para mover la flecha verticalmente"}
      accessibilityState={{ expanded: open, disabled: !!disabled }} disabled={disabled} delayLongPress={500}
      onPressIn={() => { if (!press.current.dragging) press.current.suppress = false; }}
      onLongPress={() => { press.current.suppress = true; }}
      onPress={() => { if (!press.current.suppress && !press.current.dragging) onPress(); }}
      activeOpacity={.78} style={goToolRailStyles.toggle}>
      <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)", "rgba(255,255,255,0.02)"]}
        style={[StyleSheet.absoluteFill, { borderRadius: 14 }]} />
      <Feather name={handedness === "right" ? (open ? "chevron-right" : "chevron-left") : (open ? "chevron-left" : "chevron-right")} size={22} color="#202830" />
    </TouchableOpacity>
  </DraggableFAB>;
}

export function GoToolPanel({ handedness, style, ...props }: ViewProps & { handedness: "left" | "right" }) {
  return <View {...props} style={[goToolRailStyles.panel, handedness === "right" ? { right: 0 } : { left: 0 }, style]} />;
}

export function GoToolAction({ label, icon, onPress, disabled = false }: {
  label: string; icon: React.ComponentProps<typeof Feather>["name"]; onPress: () => void; disabled?: boolean;
}) {
  return <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled }}
    disabled={disabled} onPress={onPress} style={[goToolRailStyles.action, disabled && { opacity: .45 }]}>
    <Feather name={icon} size={18} color="#273e4b" /><Text style={goToolRailStyles.label}>{label}</Text>
  </TouchableOpacity>;
}

export const goToolRailStyles = StyleSheet.create({
  panel: { position: "absolute", bottom: 0, maxHeight: "100%", borderWidth: 1, borderColor: "#b2bdc5", borderRadius: 20,
    backgroundColor: "rgba(249,252,251,0.97)", zIndex: 5, shadowColor: "#2b3d45", shadowOpacity: .17,
    shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 5 },
  toggle: { width: 44, height: 48, alignItems: "center", justifyContent: "center", borderRadius: 14, borderWidth: 1,
    borderColor: "#a5b0b8", backgroundColor: "rgba(233,239,243,0.94)", zIndex: 6, shadowColor: "#2b3d45",
    shadowOpacity: .14, shadowRadius: 6, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  action: { minHeight: 48, padding: 10, flexDirection: "row", alignItems: "center", gap: 8 },
  label: { color: "#273e4b", fontSize: 13, fontWeight: "700", flexShrink: 1 },
});
