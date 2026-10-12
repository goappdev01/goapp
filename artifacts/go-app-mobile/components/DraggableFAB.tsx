/**
 * DraggableFAB
 * ────────────
 * Envuelve cualquier botón flotante y lo hace arrastrable mediante
 * long-press (500ms). Guarda la posición por pantalla en AsyncStorage.
 *
 * Props:
 *   screenKey   — clave única de la pantalla (ej: "perfil", "plano")
 *   buttonKey   — clave única del botón dentro de la pantalla (ej: "main", "close")
 *   initialRight  — distancia inicial al borde derecho (px)
 *   initialBottom — distancia inicial al borde inferior (px); usa esto O initialTop
 *   initialTop    — distancia inicial al borde superior (px)
 *   maxH          — altura máxima del cluster (para clamping); default 40
 *
 * Comportamiento:
 *   • Long-press 500ms → modo arrastre (escala + sombra)
 *   • Soltar → guarda posición + haptic + spring de vuelta a scale=1
 *   • Posición clampeada a safe areas en todo momento
 *   • Taps cortos pasan a los hijos normalmente (TouchableOpacity funciona)
 */
import React, { useCallback, useEffect, useMemo } from "react";
import { Dimensions, StyleSheet } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const FAB_BTN = 40;
const EDGE = 8;

interface DraggableFABProps {
  screenKey: string;
  buttonKey: string;
  initialRight?: number;
  initialBottom?: number;
  initialTop?: number;
  maxH?: number;
  bounds?: { width: number; height: number };
  buttonWidth?: number;
  children: React.ReactNode;
}

export function DraggableFAB({
  screenKey,
  buttonKey,
  initialRight = 20,
  initialBottom,
  initialTop,
  maxH = FAB_BTN,
  bounds,
  buttonWidth = FAB_BTN,
  children,
}: DraggableFABProps) {
  const { width: SW, height: SH } = bounds || Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const storageKey = `fab_pos:${screenKey}:${buttonKey}`;

  // ── Compute initial (left, top) ──────────────────────────────────────────
  const initLeft = SW - initialRight - buttonWidth;
  const initTop =
    initialTop !== undefined
      ? initialTop
      : initialBottom !== undefined
      ? SH - initialBottom - maxH
      : SH - 120 - maxH;

  // ── Shared values ────────────────────────────────────────────────────────
  const posL = useSharedValue(initLeft);
  const posT = useSharedValue(initTop);
  const startL = useSharedValue(initLeft);
  const startT = useSharedValue(initTop);
  const scale = useSharedValue(1);
  const shadowOp = useSharedValue(0.18);
  const isDragging = useSharedValue(false);
  const hasDragged = useSharedValue(false);

  // ── Safe area clamp bounds ───────────────────────────────────────────────
  const minL = (bounds ? 0 : insets.left) + EDGE;
  const maxL = Math.max(minL, SW - (bounds ? 0 : insets.right) - EDGE - buttonWidth);
  const minT = (bounds ? 0 : insets.top) + EDGE;
  const maxT = Math.max(minT, SH - (bounds ? 0 : insets.bottom) - EDGE - maxH);

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (!raw) return;
      try {
        const { l, t } = JSON.parse(raw) as { l: number; t: number };
        if (!Number.isFinite(l) || !Number.isFinite(t) || hasDragged.value) return;
        posL.value = bounds ? l : Math.max(minL, Math.min(maxL, l));
        posT.value = bounds ? t : Math.max(minT, Math.min(maxT, t));
      } catch {
        // ignore corrupt data
      }
    }).catch(() => console.info("[fab-preference]", { code: "READ_FAILED" }));
  }, [storageKey]);

  useEffect(() => {
    if (bounds) return; // Keep the chosen position while the keyboard temporarily clamps its display.
    posL.value = Math.max(minL, Math.min(maxL, posL.value));
    posT.value = Math.max(minT, Math.min(maxT, posT.value));
  }, [minL, maxL, minT, maxT]);

  const savePos = useCallback(
    (l: number, t: number) => {
      AsyncStorage.setItem(storageKey, JSON.stringify({ l, t })).catch(() => console.info("[fab-preference]", { code: "WRITE_FAILED" }));
    },
    [storageKey]
  );

  // ── Gesture ──────────────────────────────────────────────────────────────
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(500)
        .onStart((event) => {
          "worklet";
          isDragging.value = true;
          hasDragged.value = true;
          startL.value = Math.max(minL, Math.min(maxL, posL.value)) - event.translationX;
          startT.value = Math.max(minT, Math.min(maxT, posT.value)) - event.translationY;
          scale.value = withSpring(1.1, { damping: 10, stiffness: 180 });
          shadowOp.value = 0.42;
          runOnJS(Haptics.selectionAsync)();
        })
        .onUpdate((e) => {
          "worklet";
          posL.value = Math.max(minL, Math.min(maxL, startL.value + e.translationX));
          posT.value = Math.max(minT, Math.min(maxT, startT.value + e.translationY));
        })
        .onEnd(() => {
          "worklet";
          isDragging.value = false;
          scale.value = withSpring(1, { damping: 14, stiffness: 160 });
          shadowOp.value = 0.18;
          runOnJS(savePos)(posL.value, posT.value);
          runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
        })
        .onFinalize(() => {
          "worklet";
          isDragging.value = false;
          scale.value = withSpring(1);
          shadowOp.value = 0.18;
        }),
    [minL, maxL, minT, maxT, savePos]
  );

  // ── Animated style ───────────────────────────────────────────────────────
  const animStyle = useAnimatedStyle(() => ({
    left: bounds ? Math.max(minL, Math.min(maxL, posL.value)) : posL.value,
    top: bounds ? Math.max(minT, Math.min(maxT, posT.value)) : posT.value,
    transform: [{ scale: scale.value }],
    zIndex: isDragging.value ? 300 : 99,
    shadowOpacity: shadowOp.value,
    shadowRadius: isDragging.value ? 18 : 6,
    elevation: isDragging.value ? 20 : 4,
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.cluster, animStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  cluster: {
    position: "absolute",
    alignItems: "center",
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
  },
});
