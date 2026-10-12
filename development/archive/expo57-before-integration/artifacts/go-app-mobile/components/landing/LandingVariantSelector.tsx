import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  LANDING_VISUAL_VARIANTS,
  type LandingVisualVariant,
} from "./landingVariant";

interface LandingVariantSelectorProps {
  value: LandingVisualVariant;
  onChange: (value: LandingVisualVariant) => void;
  onPreview: () => void;
}

export function LandingVariantSelector({ value, onChange, onPreview }: LandingVariantSelectorProps) {
  if (!__DEV__) return null;

  return (
    <View style={s.section}>
      <View style={s.heading}>
        <Text style={s.headingText}>LANDING — PRUEBA VISUAL</Text>
        <Text style={s.badge}>INTERNA</Text>
      </View>
      <View style={s.card}>
        <Text style={s.intro}>Compara el aspecto de GO. Las acciones son las mismas.</Text>
        <View accessibilityRole="radiogroup" accessibilityLabel="Variante visual del Landing" style={s.options}>
          {LANDING_VISUAL_VARIANTS.map((option) => {
            const selected = value === option.key;
            return (
              <TouchableOpacity
                key={option.key}
                onPress={() => onChange(option.key)}
                activeOpacity={0.8}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${option.label}. ${option.description}`}
                accessibilityHint="Aplica esta variante visual al Landing"
                style={[s.option, selected && s.optionSelected]}
              >
                <View style={[s.radio, selected && s.radioSelected]}>
                  {selected && <View style={s.radioDot} />}
                </View>
                <View style={s.optionCopy}>
                  <Text style={s.optionTitle}>{option.label}</Text>
                  <Text style={s.optionDescription}>{option.description}</Text>
                </View>
                <View style={s.palette} accessible={false}>
                  {option.colors.map((color) => (
                    <View key={color} style={[s.swatch, { backgroundColor: color }]} />
                  ))}
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity
          onPress={onPreview}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Ver Landing con la variante seleccionada"
          style={s.previewButton}
        >
          <Feather name="eye" size={16} color="#FFFFFF" />
          <Text style={s.previewLabel}>Ver Landing</Text>
        </TouchableOpacity>
        <Text style={s.hint}>Puedes volver a Actual en cualquier momento.</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  section: { marginBottom: 16 },
  heading: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginBottom: 10, marginLeft: 2 },
  headingText: { color: "#6B7280", fontSize: 10, fontWeight: "900", letterSpacing: 1.2 },
  badge: { color: "#366590", backgroundColor: "rgba(74,128,189,0.10)", fontSize: 9, fontWeight: "800", paddingVertical: 4, paddingHorizontal: 7, borderRadius: 6 },
  card: { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 14, borderWidth: 1, borderColor: "rgba(74,128,189,0.25)" },
  intro: { color: "#4B5563", fontSize: 12, lineHeight: 18, marginBottom: 12 },
  options: { gap: 8 },
  option: { flexDirection: "row", alignItems: "center", minHeight: 76, padding: 12, gap: 10, borderRadius: 12, borderWidth: 1, borderColor: "#DDE3E9", backgroundColor: "#F7F8FA" },
  optionSelected: { borderColor: "#4A80BD", backgroundColor: "#EEF4FB" },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "#8B97A7", alignItems: "center", justifyContent: "center" },
  radioSelected: { borderColor: "#4A80BD" },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#4A80BD" },
  optionCopy: { flex: 1 },
  optionTitle: { color: "#111827", fontSize: 13, fontWeight: "700" },
  optionDescription: { color: "#586575", fontSize: 11, lineHeight: 16, marginTop: 3 },
  palette: { gap: 3 },
  swatch: { width: 17, height: 12, borderRadius: 3, borderWidth: 0.5, borderColor: "rgba(0,0,0,0.12)" },
  previewButton: { marginTop: 12, minHeight: 44, borderRadius: 11, backgroundColor: "#4A80BD", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 },
  previewLabel: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  hint: { color: "#6B7280", fontSize: 10, lineHeight: 15, textAlign: "center", marginTop: 10 },
});
