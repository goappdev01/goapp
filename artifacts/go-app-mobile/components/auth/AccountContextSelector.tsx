import React from "react";
import { StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Feather } from "@expo/vector-icons";

export interface ContextOption<T extends string> {
  id: T;
  label: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
  sublabel: string;
  description: string;
}

interface Props<T extends string> {
  options: readonly ContextOption<T>[];
  selected?: T;
  disabled?: boolean;
  testIDPrefix: string;
  onSelect: (id: T) => void;
}

/** Shared presentation only. Callers retain authentication and server permission checks. */
export function AccountContextSelector<T extends string>({ options, selected, disabled = false, testIDPrefix, onSelect }: Props<T>) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = (width - 40 - (options.length - 1) * 10) / options.length < 110 || fontScale > 1.25;
  return (
    <View style={[s.grid, stacked && s.stacked]}>
      {options.map(option => (
        <TouchableOpacity key={option.id} testID={testIDPrefix + "-" + option.id.toLowerCase()}
          accessibilityRole="button" accessibilityLabel={option.label}
          accessibilityState={{ selected: selected === option.id, disabled }}
          disabled={disabled} onPress={() => { if (!disabled) onSelect(option.id); }}
          activeOpacity={0.78}
          style={[s.card, stacked ? s.stackedCard : s.rowCard, { borderColor: selected === option.id ? option.color : option.color + "35" }]}>
          <View style={[s.icon, { backgroundColor: option.color + "14" }]}>
            <Feather name={option.icon} size={22} color={option.color} />
          </View>
          <Text style={s.label} numberOfLines={option.label.endsWith(" DEMO") ? 2 : 1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={2}>
            {option.label.toLocaleUpperCase()}
          </Text>
          <Text style={s.sub}>{option.sublabel}</Text>
          <Text style={s.description}>{option.description}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  grid: { flexDirection: "row", gap: 10, paddingHorizontal: 20 },
  stacked: { flexDirection: "column" },
  rowCard: { flex: 1, minWidth: 0 },
  stackedCard: { width: "100%" },
  card: { backgroundColor: "#FFFFFF", borderRadius: 20, borderWidth: 1.5, paddingHorizontal: 12,
    paddingVertical: 16, alignItems: "center", gap: 7 },
  icon: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  label: { width: "100%", color: "#111827", fontSize: 18, fontFamily: "Inter_700Bold",
    fontWeight: "800", textAlign: "center", letterSpacing: 0.2 },
  sub: { color: "#6B7280", fontSize: 11, fontWeight: "600", textAlign: "center" },
  description: { color: "#9CA3AF", fontSize: 11, lineHeight: 15, textAlign: "center" },
});
