import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useEffect, useRef } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Props ────────────────────────────────────────────────────────────────────

type HumanityScreenProps = {
  visible: boolean;
  onClose: () => void;
};

// ─── Minimal GO back button ───────────────────────────────────────────────────

function GoBackButton({ onPress }: { onPress: () => void }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={onPress}
      hitSlop={8}
      accessibilityLabel="Volver"
      style={styles.goBackBtn}
    >
      <Feather name="chevron-down" size={18} color="#6B7280" />
    </TouchableOpacity>
  );
}

// ─── Web iframe component ─────────────────────────────────────────────────────
// On Expo web (react-native-web) we can inject a real <iframe> via createElement.

function HumanityIframe({ url }: { url: string }) {
  if (Platform.OS !== "web") return null;
  return React.createElement("iframe", {
    src: url,
    style: {
      width: "100%",
      height: "100%",
      border: "none",
      display: "block",
      backgroundColor: "#080812",
    } as React.CSSProperties,
    allow: "geolocation; camera; microphone",
    title: "TESO Humanity",
  });
}

// ─── Main screen ──────────────────────────────────────────────────────────────

export function HumanityScreen({ visible, onClose }: HumanityScreenProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(Dimensions.get("window").height)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // Build the teso_humanity URL.
  // EXPO_PUBLIC_DOMAIN is set to $REPLIT_DEV_DOMAIN in the dev command — the shared
  // workspace domain where Replit's edge proxy routes /teso → TESO Humanity (port 5173).
  // We must NOT use window.location.origin here because the GO app runs on its own
  // expo-domain subdomain which does NOT serve the /teso path.
  const tesoOrigin = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}`
    : "http://localhost:5173";
  const humanityUrl = `${tesoOrigin}/teso`;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 18, bounciness: 3 }),
        Animated.timing(fadeAnim, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, { toValue: Dimensions.get("window").height, duration: 260, useNativeDriver: true }),
        Animated.timing(fadeAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]).start();
    }
  }, [visible, slideAnim, fadeAnim]);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onClose();
  };

  // ── Zona derecha (≥75%) — mismo sistema que Calendario ───────────────
  const screenW = Dimensions.get("window").width;
  const closePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) => {
        if (Math.abs(g.dy) <= 12 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
        return e.nativeEvent.pageX >= screenW * 0.75;
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 120) onCloseRef.current();
      },
      onPanResponderTerminate: () => {},
    }),
  ).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]} />
      <Animated.View
        style={[styles.container, { transform: [{ translateY: slideAnim }] }]}
        {...closePan.panHandlers}
      >

        {/* iframe with real teso_humanity system */}
        <View style={styles.iframeWrap}>
          <HumanityIframe url={humanityUrl} />
        </View>

        {/* GO back button — floating bottom-right */}
        <View style={[styles.backRow, { bottom: insets.bottom + 20 }]}>
          <GoBackButton onPress={handleClose} />
        </View>

      </Animated.View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.85)",
  },
  container: {
    position: "absolute",
    left: 0, right: 0, top: 0, bottom: 0,
    backgroundColor: "#080812",
  },
  iframeWrap: {
    flex: 1,
  },
  backRow: {
    position: "absolute",
    right: 20,
  },
  goBackBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
});
