import React, { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, StyleSheet, Text, View } from "react-native";

export function listeningPlacement(width: number, height: number, contentHeight: number, keyboard: boolean) {
  if (keyboard || ![width, height, contentHeight].every(Number.isFinite) || width < 180) return null;
  const diameter = Math.min(128, width - 48);
  const indicatorHeight = diameter + 32;
  const available = height - Math.max(0, contentHeight);
  if (available < indicatorHeight + 16) return null;
  return { diameter, top: Math.max(0, contentHeight) + (available - indicatorHeight) / 2 };
}

/** Passive feedback: never captures audio or intercepts touches. */
export function ListeningIndicator({ active, compact = false, diameter = 128 }: {
  active: boolean; compact?: boolean; diameter?: number;
}) {
  const [rendered, setRendered] = useState(active);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const wave = useRef(new Animated.Value(0)).current;
  const transition = useRef(0);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => {
      if (alive) setReducedMotion(value);
    }).catch(() => { if (alive) setReducedMotion(true); });
    const listener = AccessibilityInfo.addEventListener("reduceMotionChanged", setReducedMotion);
    return () => { alive = false; listener.remove(); };
  }, []);
  useEffect(() => {
    const token = ++transition.current;
    pulse.stopAnimation(); pulse.setValue(0);
    wave.stopAnimation(); wave.setValue(0);
    let heartbeat: Animated.CompositeAnimation | undefined;
    let waves: Animated.CompositeAnimation | undefined;
    if (active) {
      setRendered(true);
      if (reducedMotion === false) {
        heartbeat = Animated.loop(Animated.sequence([
          Animated.timing(pulse, { toValue: 1, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 0, duration: 1100, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ]));
        heartbeat.start();
        // One native cycle expands and contracts the rings without a jump on repeat.
        waves = Animated.loop(Animated.timing(wave, {
          toValue: 1, duration: 1040,
          easing: progress => (1 - Math.cos(progress * Math.PI * 2)) / 2,
          useNativeDriver: true, isInteraction: false,
        }), { iterations: -1 });
        waves.start();
      }
    }
    const fade = Animated.timing(opacity, { toValue: active ? 1 : 0, duration: reducedMotion ? 0 : 180, useNativeDriver: true });
    fade.start(({ finished }) => {
      if (finished && !active && transition.current === token) setRendered(false);
    });
    return () => {
      ++transition.current; heartbeat?.stop(); waves?.stop(); fade.stop();
      pulse.stopAnimation(); wave.stopAnimation();
    };
  }, [active, reducedMotion, opacity, pulse, wave]);
  if (!rendered) return null;
  const size = compact ? 28 : diameter;
  return (
    <Animated.View pointerEvents="none" accessible accessibilityRole="image"
      accessibilityLabel={active ? "GO está escuchando. Habla" : ""}
      style={[styles.indicator, { opacity, width: size, height: compact ? size : size + 32 }]}
    >
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
        {[1, 0.82, 0.64].map((ratio, index) => (
          <Animated.View key={ratio} style={[styles.ring, {
            position: "absolute", width: size * ratio * 0.92, height: size * ratio * 0.92,
            borderRadius: size,
            opacity: reducedMotion === false
              ? wave.interpolate({ inputRange: [0, 1], outputRange: [0.3 + index * 0.1, 0.58 + index * 0.1] })
              : 0.22 + index * 0.1,
            transform: [{ scale: reducedMotion === false
              ? wave.interpolate({ inputRange: [0, 1], outputRange: [0.72 + index * 0.06, 1.08 + index * 0.08] })
              : 1 }],
          }]} />
        ))}
        <Animated.View style={[styles.core, { width: size * 0.43, height: size * 0.43, borderRadius: size,
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.03] }) }],
        }]}>
          <Text style={[styles.identity, { fontSize: compact ? 7 : 21 }]}>GO</Text>
        </Animated.View>
      </View>
      {!compact && active && <Text style={styles.prompt}>Habla</Text>}
    </Animated.View>
  );
}
const styles = StyleSheet.create({
  indicator: { alignItems: "center", justifyContent: "flex-start" },
  ring: { borderWidth: 1.5, borderColor: "#C9A22E", backgroundColor: "rgba(201,162,46,0.04)" },
  core: { backgroundColor: "#D8B64E", alignItems: "center", justifyContent: "center" },
  identity: { color: "#2D2718", fontWeight: "700" },
  prompt: { color: "#80641A", fontSize: 18, fontWeight: "600", marginTop: 8 },
});
