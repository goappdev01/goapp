// Reuses the Herramientas selector seam from the b8254e5 visual experiment.
import React from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { LANDING_VISUAL_VARIANTS, type LandingVisualVariant } from "./landingVariant";
import type { LandingVisualState } from "./landingVisualPreference";

type Props = {
  visual: LandingVisualState & { startPreview: (v: LandingVisualVariant) => boolean;
    cancelPreview: () => void; confirm: () => Promise<boolean> };
  onPreviewLanding: () => void;
  canPreviewLanding?: boolean;
  lang: string;
};
export function LandingVariantSelector({ visual, onPreviewLanding, canPreviewLanding = true, lang }: Props) {
  const english = lang === "en";
  const name = (key: LandingVisualVariant) => LANDING_VISUAL_VARIANTS.find(v => v.key === key)!.label;
  const disabled = !visual.ready || visual.busy;
  const button = (label: string, action: () => void, unavailable = disabled) =>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label} disabled={unavailable}
      accessibilityState={{ disabled: unavailable }} onPress={action}
      style={{ minHeight: 44, justifyContent: "center", padding: 10, borderRadius: 10,
        borderWidth: 1, borderColor: "#c8d6e6", backgroundColor: "#eef3f9", opacity: unavailable ? 0.5 : 1 }}>
      <Text style={{ color: "#225484", fontSize: 13, fontWeight: "700", flexShrink: 1 }}>{label}</Text>
    </TouchableOpacity>;
  const confirm = () => {
    if (disabled || !visual.preview) return;
    Alert.alert(english ? "Activate Landing variant" : "Activar variante del Landing",
      name(visual.preview), [{ text: english ? "Cancel" : "Cancelar", style: "cancel" },
        { text: english ? "Activate" : "Activar", onPress: () => { void visual.confirm(); } }]);
  };
  return <View testID="user-landing-variant-selector" style={{ gap: 10, padding: 16, marginVertical: 14,
    borderRadius: 16, backgroundColor: "#fff", borderWidth: 1, borderColor: "#dce5ef" }}>
    <Text style={{ fontSize: 16, color: "#172638", fontWeight: "800" }}>
      {english ? "User Landing variants" : "Variantes del Landing USUARIO"}
    </Text>
    <Text style={{ fontSize: 13, color: "#34465b" }}>{english ? "Active: " : "Activa: "}{name(visual.active)}</Text>
    <Text style={{ fontSize: 12, lineHeight: 18, color: "#526477" }}>
      {english ? "Preview is temporary. Return here to confirm activation or cancel. A always preserves the current presentation."
        : "La vista previa es temporal. Vuelve aquí para confirmar la activación o cancelar. A conserva siempre la presentación actual."}
    </Text>
    {LANDING_VISUAL_VARIANTS.map(item => <TouchableOpacity key={item.key}
      accessibilityRole="button" accessibilityLabel={(english ? "Preview " : "Previsualizar ") + item.label}
      accessibilityState={{ selected: visual.preview === item.key, disabled }} disabled={disabled}
      onPress={() => visual.startPreview(item.key)}
      style={{ padding: 12, minHeight: 60, borderRadius: 12, borderWidth: 1,
        borderColor: visual.preview === item.key ? "#4A80BD" : "#dce5ef" }}>
      <Text style={{ fontSize: 14, fontWeight: "700", color: "#172638" }}>{item.label}</Text>
      <Text style={{ fontSize: 12, lineHeight: 17, color: "#526477", marginTop: 3 }}>{item.description}</Text>
      {visual.active === item.key && <Text style={{ color: "#225484", fontSize: 11, marginTop: 4 }}>{english ? "ACTIVE" : "ACTIVA"}</Text>}
    </TouchableOpacity>)}
    {visual.preview && <Text accessibilityLiveRegion="polite" style={{ color: "#225484", fontSize: 13 }}>
      {english ? "Preview: " : "Vista previa: "}{name(visual.preview)}
    </Text>}
    {button(english ? "View preview on Landing" : "Ver vista previa en el Landing", onPreviewLanding, disabled || !visual.preview || !canPreviewLanding)}
    {button(english ? "Confirm activation" : "Confirmar activación", confirm, disabled || !visual.preview)}
    {button(english ? "Cancel preview" : "Cancelar vista previa", visual.cancelPreview, disabled || !visual.preview)}
    {button(english ? "Preview previous presentation" : "Volver a la anterior · previsualizar", () => { visual.startPreview(visual.previous); })}
    {button(english ? "Recover A · preserved Landing" : "Recuperar A · Landing conservado", () => { visual.startPreview("actual"); })}
    {visual.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: "#a12626", fontSize: 13 }}>{visual.error}</Text>}
  </View>;
}
