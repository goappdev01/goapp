import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { GO_SIZES, GoSizeConfig } from "../constants/goSizes";

const SATELLITE_ICONS: Array<keyof typeof Feather.glyphMap> = [
  "users",
  "coffee",
  "compass",
  "music",
  "activity",
  "shopping-bag",
];

const SATELLITE_COLORS = [
  "#1e40af",
  "#f97316",
  "#0d9488",
  "#c026d3",
  "#15803d",
  "#eab308",
];

const DRAG_PER_STEP = 70;

type Props = {
  visible: boolean;
  onClose: () => void;
};

function GoVisual({ cfg }: { cfg: GoSizeConfig }) {
  const { goSize, orbitRadius, orbitBtnSize } = cfg;
  const wrapSize = (orbitRadius + orbitBtnSize / 2) * 2 + 12;

  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop1 = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse1, {
          toValue: 1,
          duration: 4600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse1, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    const loop2 = Animated.loop(
      Animated.sequence([
        Animated.delay(2300),
        Animated.timing(pulse2, {
          toValue: 1,
          duration: 4600,
          useNativeDriver: true,
        }),
        Animated.timing(pulse2, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ]),
    );
    loop1.start();
    loop2.start();
    return () => {
      loop1.stop();
      loop2.stop();
    };
  }, []);

  const satellites = SATELLITE_ICONS.map((icon, i) => {
    const angle = (i / SATELLITE_ICONS.length) * 2 * Math.PI - Math.PI / 2;
    const x =
      wrapSize / 2 + Math.cos(angle) * orbitRadius - orbitBtnSize / 2;
    const y =
      wrapSize / 2 + Math.sin(angle) * orbitRadius - orbitBtnSize / 2;
    return { icon, color: SATELLITE_COLORS[i], x, y };
  });

  return (
    <Animated.View
      style={{ width: wrapSize, height: wrapSize, position: "relative" }}
    >
      {/* Pulse rings */}
      {[pulse1, pulse2].map((anim, idx) => (
        <Animated.View
          key={idx}
          pointerEvents="none"
          style={{
            position: "absolute",
            width: goSize,
            height: goSize,
            borderRadius: goSize / 2,
            borderWidth: 1.2,
            borderColor: "rgba(110,231,183,0.95)",
            top: wrapSize / 2 - goSize / 2,
            left: wrapSize / 2 - goSize / 2,
            opacity: anim.interpolate({
              inputRange: [0, 0.2, 1],
              outputRange: [0, 0.3, 0],
            }),
            transform: [
              {
                scale: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [1, 1.38],
                }),
              },
            ],
          }}
        />
      ))}

      {/* Orbit ring */}
      <View
        pointerEvents="none"
        style={{
          position: "absolute",
          width: orbitRadius * 2,
          height: orbitRadius * 2,
          borderRadius: orbitRadius,
          borderWidth: 1,
          borderColor: "rgba(255,255,255,0.12)",
          top: wrapSize / 2 - orbitRadius,
          left: wrapSize / 2 - orbitRadius,
        }}
      />

      {/* GO circle */}
      <View
        style={{
          position: "absolute",
          width: goSize,
          height: goSize,
          borderRadius: goSize / 2,
          backgroundColor: "#6ee7b7",
          top: wrapSize / 2 - goSize / 2,
          left: wrapSize / 2 - goSize / 2,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#6ee7b7",
          shadowOpacity: 0.55,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: 0 },
          elevation: 12,
        }}
      >
        <Text
          style={{
            color: "#0a0a0a",
            fontWeight: "900",
            fontSize: Math.round(goSize * 0.28),
            letterSpacing: 4,
          }}
        >
          GO
        </Text>
        <Text
          style={{
            color: "#0a0a0a",
            fontWeight: "700",
            fontSize: Math.round(goSize * 0.08),
            letterSpacing: 2,
            opacity: 0.6,
            marginTop: 1,
          }}
        >
          REUNIÓN
        </Text>
      </View>

      {/* Satellite buttons */}
      {satellites.map((sat, i) => (
        <View
          key={i}
          style={{
            position: "absolute",
            left: sat.x,
            top: sat.y,
            width: orbitBtnSize,
            height: orbitBtnSize,
            borderRadius: orbitBtnSize / 2,
            backgroundColor: sat.color,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: "rgba(0,0,0,0.2)",
            shadowColor: sat.color,
            shadowOpacity: 0.5,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 0 },
            elevation: 6,
          }}
        >
          <Feather
            name={sat.icon}
            size={Math.round(orbitBtnSize * 0.35)}
            color="#ffffff"
          />
        </View>
      ))}
    </Animated.View>
  );
}

export function ResiduosPanel({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const screen = Dimensions.get("window");

  const [sizeIndex, setSizeIndex] = useState(0);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const dragAcc = useRef(0);

  const cfg = GO_SIZES[sizeIndex];

  const goToIndex = (idx: number) => {
    const clamped = Math.max(0, Math.min(GO_SIZES.length - 1, idx));
    if (clamped === sizeIndex) return;
    Haptics.selectionAsync().catch(() => {});
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.88,
        duration: 80,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
    setSizeIndex(clamped);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragAcc.current = 0;
      },
      onPanResponderMove: (_, gs) => {
        const dy = gs.dy;
        const steps = Math.floor(Math.abs(dy - dragAcc.current) / DRAG_PER_STEP);
        if (steps === 0) return;
        const dir = dy > dragAcc.current ? -1 : 1;
        dragAcc.current = dy;
        setSizeIndex((prev) => {
          const next = Math.max(0, Math.min(GO_SIZES.length - 1, prev + dir * steps));
          if (next !== prev) Haptics.selectionAsync().catch(() => {});
          return next;
        });
      },
      onPanResponderRelease: () => {
        dragAcc.current = 0;
      },
    }),
  ).current;

  useEffect(() => {
    if (visible) {
      setSizeIndex(0);
      dragAcc.current = 0;
    }
  }, [visible]);

  const dots = GO_SIZES.map((_, i) => i);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={[styles.root, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>RESIDUOS</Text>
            <Text style={styles.headerSub}>Prueba de tamaños GO</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={8} activeOpacity={0.8} accessibilityLabel="Cerrar">
            <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>
        </View>

        {/* Size name label */}
        <View style={styles.sizeNameRow}>
          <Text style={styles.sizeName}>{cfg.key}</Text>
          <Text style={styles.sizeHint}>
            GO {cfg.goSize}px · órbita {cfg.orbitRadius}px · satélite {cfg.orbitBtnSize}px
          </Text>
        </View>

        {/* Drag area */}
        <View style={styles.dragArea} {...panResponder.panHandlers}>
          {/* Drag hint top */}
          <View style={styles.arrowHint}>
            <Feather
              name="chevron-up"
              size={18}
              color={sizeIndex < GO_SIZES.length - 1 ? "#6ee7b7" : "rgba(255,255,255,0.15)"}
            />
            <Text style={[styles.arrowLabel, { color: sizeIndex < GO_SIZES.length - 1 ? "#6ee7b7" : "rgba(255,255,255,0.2)" }]}>
              tamaño mayor
            </Text>
          </View>

          {/* GO visual */}
          <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
            <GoVisual cfg={cfg} />
          </Animated.View>

          {/* Drag hint bottom */}
          <View style={styles.arrowHint}>
            <Text style={[styles.arrowLabel, { color: sizeIndex > 0 ? "#94a3b8" : "rgba(255,255,255,0.2)" }]}>
              tamaño menor
            </Text>
            <Feather
              name="chevron-down"
              size={18}
              color={sizeIndex > 0 ? "#94a3b8" : "rgba(255,255,255,0.15)"}
            />
          </View>
        </View>

        {/* Dot indicators */}
        <View style={styles.dots}>
          {dots.map((i) => (
            <TouchableOpacity key={i} onPress={() => goToIndex(i)} hitSlop={8}>
              <View
                style={[
                  styles.dot,
                  i === sizeIndex && styles.dotActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Size selector row */}
        <View style={styles.sizeRow}>
          {GO_SIZES.map((s, i) => (
            <TouchableOpacity key={s.key} onPress={() => goToIndex(i)} hitSlop={4}>
              <View style={[styles.sizeChip, i === sizeIndex && styles.sizeChipActive]}>
                <Text style={[styles.sizeChipText, i === sizeIndex && styles.sizeChipTextActive]}>
                  {i + 1}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Temporal warning */}
        <View style={styles.warning}>
          <Feather name="alert-triangle" size={12} color="#f59e0b" />
          <Text style={styles.warningText}>Botón y pantalla TEMPORALES — se eliminarán</Text>
        </View>

        {/* Drag instruction */}
        <Text style={styles.instruction}>
          Arrastra arriba / abajo para cambiar de tamaño
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    alignItems: "center",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "900",
    letterSpacing: 3,
  },
  headerSub: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 1,
    marginTop: 2,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  sizeNameRow: {
    alignItems: "center",
    paddingVertical: 10,
  },
  sizeName: {
    color: "#3D9A84",
    fontSize: 26,
    fontWeight: "900",
    letterSpacing: 4,
  },
  sizeHint: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 4,
  },
  dragArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    gap: 18,
  },
  arrowHint: {
    alignItems: "center",
    gap: 4,
  },
  arrowLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  dots: {
    flexDirection: "row",
    gap: 8,
    paddingVertical: 12,
    alignItems: "center",
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#E5E7EB",
  },
  dotActive: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#3D9A84",
  },
  sizeRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sizeChip: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  sizeChipActive: {
    backgroundColor: "#3D9A84",
    borderColor: "#3D9A84",
    shadowColor: "#3D9A84",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  sizeChipText: {
    color: "#6B7280",
    fontSize: 12,
    fontWeight: "900",
  },
  sizeChipTextActive: {
    color: "#FFFFFF",
  },
  warning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(245,158,11,0.08)",
    borderWidth: 1,
    borderColor: "rgba(245,158,11,0.25)",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginHorizontal: 20,
    marginBottom: 8,
  },
  warningText: {
    color: "#C4883A",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  instruction: {
    color: "#6B7280",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    marginBottom: 16,
  },
});
