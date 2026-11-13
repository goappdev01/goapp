import React, { useRef, useState } from "react";
import { View, Text, PanResponder, StyleSheet } from "react-native";
import { GoCloseButton } from "./GoCloseButton";
import { useNavigationOpacity, setNavigationOpacity, clampNavigationOpacity } from "./goNavigationAppearance";

export function GoNavigationAppearanceControl() {
  const opacity = useNavigationOpacity();
  const width = useRef(1);
  const current = useRef(opacity);
  const [error, setError] = useState(false);
  current.current = opacity;

  const update = (value: number) => {
    void setNavigationOpacity(value).then(() => setError(false)).catch(() => setError(true));
  };
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: e => update(11 + 88 * e.nativeEvent.locationX / width.current),
    onPanResponderMove: e => update(11 + 88 * e.nativeEvent.locationX / width.current),
  })).current;

  return (
    <View style={s.control}>
      <View testID="navigation-opacity-header" style={s.header}>
        <Text style={s.label} numberOfLines={1} adjustsFontSizeToFit>Opacidad</Text>
        <View style={s.previews}>
          {(["panel", "container", "settings"] as const).map((level, i) => (
            <GoCloseButton
              key={level}
              level={level}
              touchSize={44}
              preserveTouchSize
              accessibilityLabel={["Vista previa de Atrás", "Vista previa de Salir", "Vista previa de Configuración"][i]}
              onPress={() => {}}
            />
          ))}
        </View>
        <Text style={s.value} numberOfLines={1}>{opacity}%</Text>
      </View>
      <View
        accessibilityRole="adjustable"
        accessibilityLabel="Opacidad de botones de navegación"
        accessibilityValue={{ min: 11, max: 99, now: opacity, text: opacity + "%" }}
        accessibilityActions={[{ name: "increment" }, { name: "decrement" }]}
        onAccessibilityAction={e => update(clampNavigationOpacity(current.current + (e.nativeEvent.actionName === "increment" ? 1 : -1)))}
        onLayout={e => { width.current = e.nativeEvent.layout.width; }}
        {...pan.panHandlers}
        style={s.slider}
      >
        <View pointerEvents="none" style={s.track} />
        <View pointerEvents="none" style={[s.thumb, { left: ((opacity - 11) / 88 * 100) + "%" }]} />
      </View>
      {error && <Text accessibilityRole="alert" style={s.error}>No se pudo conservar la preferencia. Vuelve a ajustarla.</Text>}
    </View>
  );
}

// Herramientas has a fixed light surface, including when iOS uses dark mode.
const s = StyleSheet.create({
  control: { paddingHorizontal: 4, paddingVertical: 4, gap: 4 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  label: { color: "#17212B", fontSize: 14, flexShrink: 1 },
  previews: { flexDirection: "row", gap: 6 },
  value: { color: "#17212B", fontSize: 14, textAlign: "right", minWidth: 34 },
  slider: { height: 44, justifyContent: "center" },
  track: { height: 5, borderRadius: 3, backgroundColor: "#77818C" },
  thumb: { position: "absolute", marginLeft: -10, width: 20, height: 20, borderRadius: 10, backgroundColor: "#17212B" },
  error: { color: "#9B1C1C" },
});
