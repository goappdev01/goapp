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
  children: React.ReactNode;
}

export function DraggableFAB({
  screenKey,
  buttonKey,
  initialRight = 20,
  initialBottom,
  initialTop,
  maxH = FAB_BTN,
  children,
}: DraggableFABProps) {
  const { width: SW, height: SH } = Dimensions.get("window");
  const insets = useSafeAreaInsets();
  const storageKey = `fab_pos:${screenKey}:${buttonKey}`;

  // ── Compute initial (left, top) ──────────────────────────────────────────
  const initLeft = SW - initialRight - FAB_BTN;
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

  // ── Safe area clamp bounds ───────────────────────────────────────────────
  const minL = insets.left + EDGE;
  const maxL = SW - insets.right - EDGE - FAB_BTN;
  const minT = insets.top + EDGE;
  const maxT = SH - insets.bottom - EDGE - maxH;

  // ── Persist ──────────────────────────────────────────────────────────────
  useEffect(() => {
    AsyncStorage.getItem(storageKey).then((raw) => {
      if (!raw) return;
      try {
        const { l, t } = JSON.parse(raw) as { l: number; t: number };
        posL.value = Math.max(minL, Math.min(maxL, l));
        posT.value = Math.max(minT, Math.min(maxT, t));
      } catch {
        // ignore corrupt data
      }
    });
  }, [storageKey]);

  const savePos = useCallback(
    (l: number, t: number) => {
      AsyncStorage.setItem(storageKey, JSON.stringify({ l, t }));
    },
    [storageKey]
  );

  // ── Gesture ──────────────────────────────────────────────────────────────
  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(500)
        .onStart(() => {
          "worklet";
          isDragging.value = true;
          startL.value = posL.value;
          startT.value = posT.value;
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
    left: posL.value,
    top: posT.value,
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
