/**
 * VerifGate — reusable verification gate components.
 *
 * VerifGateBanner  — compact inline amber banner (non-blocking, goes at the top
 *                    of a screen so the user can still configure/draft).
 *                    When onPress is provided the whole bar becomes a CTA.
 * VerifGateScreen  — full-height empty state that replaces a gated module
 *                    in EmpresaPanel.
 */
import React from "react";
import { StyleSheet, Text, View, TouchableOpacity } from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

const BG    = "#F5F3EF";
const CARD  = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.07)";
const TEXT  = "#111827";
const DIM   = "#9CA3AF";

// ── Banner ─────────────────────────────────────────────────────────────────────
// Non-blocking notice shown at the top of a configurable screen.
// When onPress is supplied the bar becomes a full-width CTA with haptic feedback.

interface BannerProps {
  message?: string;
  onPress?: () => void;
}

export function VerifGateBanner({ message, onPress }: BannerProps) {
  const content = (
    <>
      <View style={b.iconWrap}>
        <Feather name="shield" size={13} color="#B45309" />
      </View>
      <Text style={b.txt} numberOfLines={2}>
        {message ?? "Configura y verifica tu empresa para activar las reservas públicas."}
      </Text>
      {onPress && (
        <View style={b.arrowWrap}>
          <Feather name="chevron-right" size={15} color="#B45309" />
        </View>
      )}
    </>
  );

  if (onPress) {
    return (
      <TouchableOpacity
        style={[b.wrap, b.wrapTappable]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress();
        }}
        activeOpacity={0.72}
      >
        {content}
      </TouchableOpacity>
    );
  }

  return <View style={b.wrap}>{content}</View>;
}

const b = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: "#FFFBEB",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#FDE68A",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  wrapTappable: {
    borderColor: "#F59E0B",
    shadowColor: "#F59E0B",
    shadowOpacity: 0.18,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  iconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  txt: {
    flex: 1,
    color: "#92400E",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  arrowWrap: {
    width: 22,
    height: 22,
    borderRadius: 7,
    backgroundColor: "#FEF3C7",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────────
// Full-height replacement for a gated module. Shows what the feature does
// and a clear message explaining verification is needed.

interface ScreenProps {
  feature: string;          // e.g. "Facturación y cobros"
  description?: string;     // what this feature does
  onOpenVerificacion?: () => void;
}

export function VerifGateScreen({ feature, description, onOpenVerificacion }: ScreenProps) {
  return (
    <View style={sc.root}>
      {/* Lock icon */}
      <View style={sc.iconWrap}>
        <Feather name="lock" size={28} color="#6B7280" />
      </View>

      {/* Feature name */}
      <Text style={sc.title}>{feature}</Text>

      {/* Gate message */}
      <View style={sc.msgCard}>
        <View style={sc.msgRow}>
          <View style={sc.msgIconWrap}>
            <Feather name="shield" size={16} color="#4A80BD" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={sc.msgTitle}>Función bloqueada</Text>
            <Text style={sc.msgSub}>
              Verifica tu empresa para desbloquear esta función.
            </Text>
          </View>
        </View>
      </View>

      {/* Feature description */}
      {description && (
        <Text style={sc.desc}>{description}</Text>
      )}

      {/* CTA button — only shown when onOpenVerificacion is wired */}
      {onOpenVerificacion ? (
        <TouchableOpacity
          style={sc.ctaBtn}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
            onOpenVerificacion();
          }}
          activeOpacity={0.78}
        >
          <Feather name="shield" size={15} color="#ffffff" />
          <Text style={sc.ctaTxt}>Verificar empresa</Text>
          <Feather name="chevron-right" size={15} color="rgba(255,255,255,0.7)" />
        </TouchableOpacity>
      ) : (
        /* How to verify hint — fallback when no callback */
        <View style={sc.hintCard}>
          <Feather name="info" size={13} color={DIM} style={{ flexShrink: 0 }} />
          <Text style={sc.hintTxt}>
            Abre tu cuenta GO → Empresa → Verificar empresa para subir tu documentación.
          </Text>
        </View>
      )}
    </View>
  );
}

const sc = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
    paddingVertical: 40,
    gap: 16,
  },

  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 22,
    backgroundColor: CARD,
    borderWidth: 1.5,
    borderColor: BORDER,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  title: {
    color: TEXT,
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.3,
    textAlign: "center",
  },

  msgCard: {
    width: "100%",
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "rgba(74,128,189,0.22)",
    padding: 14,
  },
  msgRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  msgIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "rgba(74,128,189,0.09)",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  msgTitle: { color: "#4A80BD", fontSize: 13, fontWeight: "800", marginBottom: 2 },
  msgSub:   { color: "#6B7280", fontSize: 12, lineHeight: 17 },

  desc: {
    color: DIM,
    fontSize: 13,
    textAlign: "center",
    lineHeight: 19,
  },

  ctaBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "#4A80BD",
    shadowColor: "#4A80BD",
    shadowOpacity: 0.32,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 4,
    width: "100%",
    justifyContent: "center",
  },
  ctaTxt: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },

  hintCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: CARD,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    width: "100%",
  },
  hintTxt: {
    flex: 1,
    color: DIM,
    fontSize: 11,
    lineHeight: 16,
  },
});
