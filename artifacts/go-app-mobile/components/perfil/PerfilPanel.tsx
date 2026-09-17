import React, { useState, useRef, useEffect } from "react";
import {
  Alert,
  Animated,
  View,
  Text,
  Modal,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
} from "react-native";
import { restoreNemesiDemo } from "@/data/goSeedNemesiDemo";
import { DraggableFAB } from "../DraggableFAB";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { useLanguage } from "@/contexts/LanguageContext";
import { useGoNotification, GoAlertModePicker } from "@/contexts/GoNotificationContext";

// ─── Types ─────────────────────────────────────────────────────────────────────

type SubScreen =
  | "perfil_hub"       // hub de ajustes de perfil (muestra los 5 sub-ítems)
  | "plan"
  | "consumo"
  | "facturacion"
  | "privacidad"
  | "ajustes";

interface PerfilPanelProps {
  visible: boolean;
  onClose: () => void;
  onOpenEmpresa?: () => void;
  onOpenHistorial?: () => void;
  onSwitchMode?: () => void;
  onResetTutorial?: () => void;
}

// ─── 🛠️ Dev-only component ────────────────────────────────────────────────────
// Nunca visible en producción (__DEV__ === false en builds de release).

function DevRestoreNemesi() {
  const [loading, setLoading] = React.useState(false);

  const handleRestore = () => {
    Alert.alert(
      "🛠️ Restaurar Nemesi Demo",
      "Esto sobreescribirá la empresa actual con los datos de prueba de \"Nemesi Demo\".\n\nSolo usar en desarrollo.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Restaurar",
          style: "destructive",
          onPress: async () => {
            setLoading(true);
            try {
              await restoreNemesiDemo();
              Alert.alert("✅ Listo", "Nemesi Demo restaurada. Recarga la app para ver los cambios.");
            } catch {
              Alert.alert("Error", "No se pudo restaurar la empresa demo.");
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{
      marginTop: 28,
      marginHorizontal: 0,
      borderRadius: 16,
      borderWidth: 1.5,
      borderColor: "rgba(251,146,60,0.35)",
      backgroundColor: "rgba(255,237,213,0.50)",
      overflow: "hidden",
    }}>
      {/* Cabecera de zona dev */}
      <View style={{
        flexDirection: "row", alignItems: "center", gap: 7,
        paddingHorizontal: 14, paddingVertical: 10,
        borderBottomWidth: 1, borderBottomColor: "rgba(251,146,60,0.20)",
        backgroundColor: "rgba(251,146,60,0.08)",
      }}>
        <Text style={{ fontSize: 13 }}>🛠️</Text>
        <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#92400E", letterSpacing: 0.8 }}>
          ZONA DE DESARROLLO
        </Text>
        <View style={{
          marginLeft: "auto", paddingHorizontal: 7, paddingVertical: 2,
          borderRadius: 999, backgroundColor: "rgba(251,146,60,0.18)",
        }}>
          <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#B45309", letterSpacing: 0.5 }}>
            DEV
          </Text>
        </View>
      </View>

      {/* Botón restaurar */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={handleRestore}
        disabled={loading}
        style={{
          flexDirection: "row", alignItems: "center", gap: 12,
          paddingHorizontal: 14, paddingVertical: 14,
          opacity: loading ? 0.6 : 1,
        }}
      >
        <View style={{
          width: 36, height: 36, borderRadius: 10,
          backgroundColor: "rgba(251,146,60,0.15)",
          alignItems: "center", justifyContent: "center",
        }}>
          <Feather name="refresh-cw" size={16} color="#D97706" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 13, fontWeight: "700", color: "#92400E" }}>
            {loading ? "Restaurando…" : "Restaurar Nemesi Demo"}
          </Text>
          <Text style={{ fontSize: 11, color: "#B45309", marginTop: 1 }}>
            Peluquería · Belleza · 4 profesionales
          </Text>
        </View>
        <Feather name="chevron-right" size={15} color="#D97706" />
      </TouchableOpacity>
    </View>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function PerfilPanel({ visible, onClose, onOpenEmpresa, onOpenHistorial, onSwitchMode, onResetTutorial }: PerfilPanelProps) {
  const insets = useSafeAreaInsets();
  const { lang, t } = useLanguage();
  const { alertMode } = useGoNotification();
  const [subScreen, setSubScreen] = useState<SubScreen | null>(null);

  useEffect(() => {
    if (!visible) setSubScreen(null);
  }, [visible]);

  const subScreenRef = useRef(subScreen);
  const onCloseRef   = useRef(onClose);
  subScreenRef.current = subScreen;
  onCloseRef.current   = onClose;

  const screenW = Dimensions.get("window").width;

  // Long-press guard + edge glow — cierre deliberado, evita cierres accidentales
  const longPressArmedRef = useRef(false);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const edgeChargeAnim    = useRef(new Animated.Value(0)).current;
  const edgeArmedAnim     = useRef(new Animated.Value(0)).current;

  const _resetEdge = () => {
    edgeChargeAnim.stopAnimation();
    Animated.timing(edgeChargeAnim, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    Animated.timing(edgeArmedAnim,  { toValue: 0, duration: 200, useNativeDriver: true }).start();
  };
  const _cancelLP = () => {
    longPressArmedRef.current = false;
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    _resetEdge();
  };

  const rightSwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        if (e.nativeEvent.pageX >= screenW * 0.75) {
          longPressArmedRef.current = false;
          if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
          edgeChargeAnim.stopAnimation();
          Animated.timing(edgeChargeAnim, { toValue: 1, duration: 700, useNativeDriver: true }).start();
          longPressTimerRef.current = setTimeout(() => {
            longPressArmedRef.current = true;
            longPressTimerRef.current = null;
            Animated.spring(edgeArmedAnim, { toValue: 1, useNativeDriver: true }).start();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }, 700);
        } else {
          _cancelLP();
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: (e, g) => {
        if (!longPressArmedRef.current) {
          if (Math.abs(g.dy) > 15 || Math.abs(g.dx) > 15) _cancelLP();
          return false;
        }
        if (Math.abs(g.dy) <= 20 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
        return e.nativeEvent.pageX >= screenW * 0.75;
      },
      onPanResponderRelease: (_e, g) => {
        _cancelLP();
        if (g.dy > 120) {
          if (subScreenRef.current !== null) setSubScreen(null);
          else onCloseRef.current();
        } else if (g.dy > 60 && subScreenRef.current !== null) {
          setSubScreen(null);
        }
      },
      onPanResponderTerminate: () => { _cancelLP(); },
    }),
  ).current;

  const fabBottom       = insets.bottom + 24;
  const dockPadBottom   = fabBottom + 68;

  const subScreenTitle: Record<SubScreen, string> = {
    perfil_hub:  t("account_profile"),
    plan:        t("account_plan"),
    consumo:     t("account_usage"),
    facturacion: t("account_billing"),
    privacidad:  t("account_privacy"),
    ajustes:     t("account_settings_label"),
  };

  // ─── Hub menu items (visible inside perfil_hub sub-screen) ─────────────────

  const hubItems = ([
    { icon: "credit-card", label: t("account_plan"),           sub: t("account_plan_sub"),       color: "#C4883A", screen: "plan"        },
    { icon: "bar-chart-2", label: t("account_usage"),          sub: t("account_usage_sub"),      color: "#4A80BD", screen: "consumo"     },
    { icon: "file-text",   label: t("account_billing"),        sub: t("account_billing_sub"),    color: "#3D9A84", screen: "facturacion" },
    { icon: "shield",      label: t("account_privacy"),        sub: t("account_privacy_sub"),    color: "#7C69BE", screen: "privacidad"  },
    { icon: "settings",    label: t("account_settings_label"), sub: t("notifications_language"), color: "#8A9BB5", screen: "ajustes"     },
  ] as Array<{ icon: keyof typeof Feather.glyphMap; label: string; sub: string; color: string; screen: SubScreen }>);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[s.root, { paddingTop: insets.top }]} {...rightSwipePan.panHandlers}>

        {/* Zona de cierre — brillo derecho durante long-press */}
        <Animated.View pointerEvents="none" style={{
          position: "absolute", right: 0, top: 0, bottom: 0, width: 72,
          opacity: edgeChargeAnim,
        }}>
          <LinearGradient
            colors={["transparent", "rgba(74,128,189,0.38)"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
        <Animated.View pointerEvents="none" style={{
          position: "absolute", right: 14, top: 0, bottom: 0,
          alignItems: "center", justifyContent: "center",
          opacity: edgeArmedAnim, transform: [{ scale: edgeArmedAnim }],
        }}>
          <View style={{ width: 36, height: 36, borderRadius: 18,
            backgroundColor: "#4A80BD", borderWidth: 2.5, borderColor: "#fff",
            alignItems: "center", justifyContent: "center",
            shadowColor: "#4A80BD", shadowOpacity: 0.5, shadowRadius: 8, elevation: 8,
          }}>
            <Feather name="chevron-down" size={16} color="#fff" />
          </View>
        </Animated.View>

        {/* ── Handle pill ──────────────────────────────────────────── */}
        <View style={s.handleZone}>
          <View style={s.handlePill} />
        </View>

        {/* ══════════════════════════════════════════════════════════
            HOME — TESO: identidad arriba · acción abajo
            ══════════════════════════════════════════════════════════ */}
        {!subScreen && (
          <View style={{ flex: 1 }}>

            {/* ── TOP: identidad compacta (visual, sin interacción) ── */}
            <View style={s.topIdent}>

              {/* GO badge */}
              <View style={s.goPill}>
                <Text style={s.goPillTxt}>GO</Text>
              </View>

              {/* Nombre + plan */}
              <View style={{ flex: 1 }}>
                <Text style={s.identName}>Nelson</Text>
                <Text style={s.identPlan}>GO Free</Text>
              </View>

              {/* ACTIVO badge */}
              <View style={s.activePill}>
                <View style={s.activeDot} />
                <Text style={s.activeTxt}>ACTIVO</Text>
              </View>

            </View>

            {/* ── EMPRESA sub-label ── */}
            <View style={s.empresaBar}>
              <Feather name="briefcase" size={12} color="#9CA3AF" />
              <Text style={s.empresaBarTxt}>Empresa vinculada</Text>
            </View>

            {/* ── Spacer: empuja el dock al fondo ── */}
            <View style={{ flex: 1 }} />

            {/* ════════════════════════════════════════════════════
                BOTTOM DOCK — zona del pulgar
                ════════════════════════════════════════════════════ */}
            <View style={[s.dock, { paddingBottom: dockPadBottom }]}>

              {/* Mi perfil */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setSubScreen("perfil_hub")}
                style={s.dockRow}
              >
                <View style={[s.dockIcon, { backgroundColor: "#4A80BD15" }]}>
                  <Feather name="user" size={18} color="#4A80BD" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dockLabel}>Mi perfil</Text>
                  <Text style={s.dockSub}>Plan, facturación, ajustes</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Mis Pedidos */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  onClose();
                  setTimeout(() => onOpenHistorial?.(), 180);
                }}
                style={s.dockRow}
              >
                <View style={[s.dockIcon, { backgroundColor: "#4A80BD15" }]}>
                  <Feather name="shopping-bag" size={18} color="#4A80BD" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dockLabel}>Mis Pedidos</Text>
                  <Text style={s.dockSub}>Historial del Marketplace</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Mi empresa */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  onClose();
                  setTimeout(() => onOpenEmpresa?.(), 180);
                }}
                style={s.dockRow}
              >
                <View style={[s.dockIcon, { backgroundColor: "#3D9A8415" }]}>
                  <Feather name="briefcase" size={18} color="#3D9A84" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dockLabel}>Mi empresa</Text>
                  <Text style={s.dockSub}>Reservas, horario, servicios</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Cambiar contexto Usuario / Empresa */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  onClose();
                  setTimeout(() => onSwitchMode?.(), 180);
                }}
                style={s.dockRow}
              >
                <View style={[s.dockIcon, { backgroundColor: "#C4883A15" }]}>
                  <Feather name="refresh-cw" size={18} color="#C4883A" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.dockLabel}>Cambiar contexto</Text>
                  <Text style={s.dockSub}>Usuario ↔ Empresa</Text>
                </View>
                <Feather name="chevron-right" size={16} color="#D1D5DB" />
              </TouchableOpacity>

              {/* Divisor */}
              <View style={s.dockDivider} />

              {/* Cerrar sesión */}
              <TouchableOpacity activeOpacity={0.75} style={s.signOutBtn}>
                <Feather name="log-out" size={14} color="#C25A5A" />
                <Text style={s.signOutTxt}>{t("sign_out")}</Text>
              </TouchableOpacity>

            </View>
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════
            SUB-SCREENS
            ══════════════════════════════════════════════════════════ */}
        {subScreen && (
          <>
            {/* Sub-screen header */}
            <View style={s.subHeader}>
              <TouchableOpacity
                onPress={() => setSubScreen(subScreen === "perfil_hub" ? null : "perfil_hub")}
                hitSlop={10}
                style={s.backBtn}
              >
                <Feather name="chevron-left" size={18} color="#6B7280" />
              </TouchableOpacity>
              <Text style={s.subTitle}>{subScreenTitle[subScreen]}</Text>
              <View style={{ width: 32 }} />
            </View>

            <ScrollView
              style={s.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: fabBottom + 80 }}
            >

              {/* ── HUB: lista de sub-opciones de perfil ── */}
              {subScreen === "perfil_hub" && (
                <>
                  {hubItems.map((item) => (
                    <TouchableOpacity
                      key={item.screen}
                      activeOpacity={0.75}
                      onPress={() => setSubScreen(item.screen)}
                      style={s.menuRow}
                    >
                      <View style={[s.menuIcon, { backgroundColor: item.color + "15" }]}>
                        <Feather name={item.icon} size={16} color={item.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.menuLabel}>{item.label}</Text>
                        <Text style={s.menuSub}>{item.sub}</Text>
                      </View>
                      <Feather name="chevron-right" size={15} color="#D1D5DB" />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── PLAN ── */}
              {subScreen === "plan" && (
                <>
                  <View style={s.card}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                      <View style={{ backgroundColor: "#C4883A18", borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: "#C4883A30" }}>
                        <Text style={{ color: "#C4883A", fontSize: 12, fontFamily: "Inter_700Bold", fontWeight: "800" }}>GO Free</Text>
                      </View>
                      <Text style={{ color: "#9CA3AF", fontSize: 11 }}>{t("renews_label")} 1 Jun 2025</Text>
                    </View>
                    <Text style={{ color: "#111827", fontSize: 28, fontFamily: "Inter_900Black", fontWeight: "900", marginBottom: 4 }}>
                      0 €<Text style={{ fontSize: 13, color: "#9CA3AF", fontWeight: "400" }}> /{t("month_abbr")}</Text>
                    </Text>
                    <Text style={{ color: "#6B7280", fontSize: 12, lineHeight: 18 }}>
                      {t("plan_free_desc")}
                    </Text>
                  </View>
                  {([
                    { name: "GO Pro",        price: "29 €",                     color: "#4A80BD", desc: t("plan_pro_desc")        },
                    { name: "GO Empresa",    price: "89 €",                     color: "#3D9A84", desc: t("plan_empresa_desc")    },
                    { name: "GO Enterprise", price: t("plan_enterprise_price"), color: "#C4883A", desc: t("plan_enterprise_desc") },
                  ]).map((plan) => (
                    <TouchableOpacity key={plan.name} activeOpacity={0.8} style={s.listRow}>
                      <View style={[s.listIcon, { backgroundColor: plan.color + "15" }]}>
                        <Feather name="star" size={14} color={plan.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listLabel}>{plan.name}</Text>
                        <Text style={s.listSub}>{plan.desc}</Text>
                      </View>
                      <Text style={{ color: plan.color, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" }}>{plan.price}</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── CONSUMO ── */}
              {subScreen === "consumo" && (
                <>
                  <View style={[s.card, { alignItems: "center" }]}>
                    <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>
                      {t("usage_this_month")}
                    </Text>
                    <Text style={{ color: "#111827", fontSize: 42, fontFamily: "Inter_900Black", fontWeight: "900", marginBottom: 4 }}>847</Text>
                    <Text style={{ color: "#6B7280", fontSize: 12, marginBottom: 14 }}>
                      {t("usage_of_plan")}
                    </Text>
                    <View style={{ width: "100%", height: 6, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.08)", overflow: "hidden" }}>
                      <View style={{ width: "84%", height: 6, borderRadius: 3, backgroundColor: "#f59e0b" }} />
                    </View>
                    <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 6 }}>84% {t("used_label")}</Text>
                  </View>
                  {([
                    { icon: "send",           label: t("stat_sent"),           value: "312", color: "#4A80BD" },
                    { icon: "check-circle",   label: t("stat_completed"),       value: "289", color: "#3D9A84" },
                    { icon: "check-square",   label: t("stat_tasks_label"),     value: "156", color: "#7C69BE" },
                    { icon: "message-circle", label: t("stat_messages_label"),  value: "90",  color: "#C4883A" },
                  ] as Array<{ icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string }>).map((item) => (
                    <View key={item.label} style={s.listRow}>
                      <View style={[s.listIcon, { backgroundColor: item.color + "15" }]}>
                        <Feather name={item.icon} size={14} color={item.color} />
                      </View>
                      <Text style={{ flex: 1, color: "#111827", fontSize: 13, fontWeight: "600" }}>{item.label}</Text>
                      <Text style={{ color: item.color, fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "800" }}>{item.value}</Text>
                    </View>
                  ))}
                </>
              )}

              {/* ── FACTURACIÓN ── */}
              {subScreen === "facturacion" && (
                <>
                  <View style={s.card}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <Feather name="credit-card" size={18} color="#4A80BD" />
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#111827", fontSize: 14, fontWeight: "700" }}>
                          {t("billing_visa_label")}
                        </Text>
                        <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>
                          {t("billing_next_charge")}
                        </Text>
                      </View>
                      <TouchableOpacity activeOpacity={0.8}
                        style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#4A80BD30" }}>
                        <Text style={{ color: "#4A80BD", fontSize: 11, fontWeight: "700" }}>{t("change")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                  <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>
                    {t("recent_invoices")}
                  </Text>
                  {([
                    { num: "GO-2025-003", mes: `${t("month_may")} 2025`,   total: "0.00",  estado: t("invoice_free"), color: "#9CA3AF" },
                    { num: "GO-2025-002", mes: `${t("month_apr")} 2025`,   total: "0.00",  estado: t("invoice_free"), color: "#9CA3AF" },
                    { num: "GO-2025-001", mes: `${t("month_mar")} 2025`,   total: "29.00", estado: t("invoice_paid"), color: "#3D9A84" },
                  ]).map((f) => (
                    <View key={f.num} style={[s.listRow, { alignItems: "center" }]}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: "#111827", fontSize: 13, fontWeight: "700", marginBottom: 2 }}>{f.num}</Text>
                        <Text style={{ color: "#9CA3AF", fontSize: 11 }}>{f.mes}</Text>
                      </View>
                      <Text style={{ color: "#111827", fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", marginRight: 10 }}>{f.total} €</Text>
                      <View style={{ backgroundColor: f.color + "18", borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: f.color + "35" }}>
                        <Text style={{ color: f.color, fontSize: 10, fontWeight: "700" }}>{f.estado}</Text>
                      </View>
                    </View>
                  ))}
                </>
              )}

              {/* ── PRIVACIDAD ── */}
              {subScreen === "privacidad" && (
                <>
                  {([
                    { icon: "eye-off",  label: t("privacy_visibility"), sub: t("privacy_visibility_sub"), danger: false },
                    { icon: "map-pin",  label: t("privacy_location"),   sub: t("privacy_location_sub"),   danger: false },
                    { icon: "bell-off", label: t("privacy_analytics"),  sub: t("privacy_analytics_sub"),  danger: false },
                    { icon: "lock",     label: t("privacy_data"),       sub: t("privacy_data_sub"),       danger: false },
                    { icon: "trash-2",  label: t("privacy_delete_acct"),sub: t("privacy_delete_sub"),     danger: true  },
                  ] as Array<{ icon: keyof typeof Feather.glyphMap; label: string; sub: string; danger: boolean }>).map((item) => (
                    <TouchableOpacity key={item.label} activeOpacity={0.75}
                      style={[s.listRow, item.danger && { borderColor: "rgba(194,90,90,0.15)" }]}>
                      <View style={[s.listIcon, { backgroundColor: item.danger ? "#FEF2F2" : "#F3F4F6" }]}>
                        <Feather name={item.icon} size={15} color={item.danger ? "#C25A5A" : "#6B7280"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.listLabel, item.danger && { color: "#C25A5A" }]}>{item.label}</Text>
                        <Text style={s.listSub}>{item.sub}</Text>
                      </View>
                      <Feather name="chevron-right" size={15} color="#D1D5DB" />
                    </TouchableOpacity>
                  ))}
                </>
              )}

              {/* ── AJUSTES ── */}
              {subScreen === "ajustes" && (
                <>
                  {/* Datos personales y preferencias */}
                  {([
                    { icon: "user",  label: t("settings_name_photo"),    sub: "Nelson"                     },
                    { icon: "mail",  label: t("settings_email_label"),   sub: "nelson@go.app"              },
                    { icon: "phone", label: t("settings_phone_item"),    sub: "+34 600 000 000"            },
                    { icon: "globe", label: t("settings_language_label"),sub: t("settings_language_sub")   },
                    { icon: "moon",  label: t("settings_appearance"),    sub: t("settings_appearance_sub") },
                  ] as Array<{ icon: keyof typeof Feather.glyphMap; label: string; sub: string }>).map((item) => (
                    <TouchableOpacity key={item.label} activeOpacity={0.75} style={s.listRow}>
                      <View style={[s.listIcon, { backgroundColor: "#F3F4F6" }]}>
                        <Feather name={item.icon} size={15} color="#6B7280" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.listLabel}>{item.label}</Text>
                        <Text style={s.listSub}>{item.sub}</Text>
                      </View>
                      <Feather name="chevron-right" size={15} color="#D1D5DB" />
                    </TouchableOpacity>
                  ))}

                  {/* ── Notificaciones — 3 estados ───────────────────── */}
                  <View style={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 6 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <View style={{
                        width: 28, height: 28, borderRadius: 8,
                        backgroundColor: "#4A80BD18",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Feather
                          name={alertMode === "sound" ? "bell" : alertMode === "visual" ? "eye" : "bell-off"}
                          size={14}
                          color="#4A80BD"
                        />
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>
                        {t("settings_notifs_label")}
                      </Text>
                      <View style={{
                        marginLeft: "auto",
                        paddingHorizontal: 8, paddingVertical: 3,
                        borderRadius: 999,
                        backgroundColor: alertMode === "silent" ? "rgba(156,163,175,0.12)" : "rgba(74,128,189,0.10)",
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: "700",
                          color: alertMode === "silent" ? "#9CA3AF" : "#4A80BD",
                          letterSpacing: 0.3,
                        }}>
                          {alertMode === "sound" ? "SONIDO" : alertMode === "visual" ? "VISUAL" : "SILENCIO"}
                        </Text>
                      </View>
                    </View>
                    <GoAlertModePicker />
                  </View>

                  {/* ── Mostrar ayudas otra vez ───────────────────────── */}
                  {onResetTutorial && (
                    <View style={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}>
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          onResetTutorial();
                        }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          paddingVertical: 11,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          backgroundColor: "rgba(74,128,189,0.08)",
                          borderWidth: 1,
                          borderColor: "rgba(74,128,189,0.18)",
                        }}
                      >
                        <View style={{
                          width: 28, height: 28, borderRadius: 8,
                          backgroundColor: "rgba(74,128,189,0.12)",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <Feather name="help-circle" size={14} color="#4A80BD" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: "700", color: "#111827" }}>
                            {"Mostrar ayudas otra vez"}
                          </Text>
                          <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 1 }}>
                            {"Reinicia el tutorial de la pantalla principal"}
                          </Text>
                        </View>
                        <Feather name="refresh-cw" size={14} color="#4A80BD" />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* ── 🛠️ ZONA DE DESARROLLO — solo visible en __DEV__ ── */}
                  {__DEV__ && <DevRestoreNemesi />}
                </>
              )}

            </ScrollView>
          </>
        )}

        {/* ── FABs flotantes ──────────────────────────────────────── */}
        <DraggableFAB
          screenKey="perfil"
          buttonKey="main"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={90}
        >
          {subScreen !== null && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSubScreen(
                subScreen === "perfil_hub" ? null : "perfil_hub"
              )}
              hitSlop={8}
              accessibilityLabel="Volver"
              style={s.fabBtn}
            >
              <Feather name="chevron-down" size={22} color="rgba(255,255,255,0.90)" />
            </TouchableOpacity>
          )}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Cerrar Mi Perfil"
            style={s.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

        {/* ── Guía gestual derecha ─────────────────────────────────── */}
        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.06)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={{ position: "absolute", right: 0, top: "50%", bottom: 0, width: "25%" }}
        />

      </View>
    </Modal>
  );
}

// ─── Styles ────────────────────────────────────────────────────────────────────

const BORDER = "rgba(0,0,0,0.08)";
const TEXT   = "#111827";
const DIM    = "#9CA3AF";

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3EF" },

  // ── Handle ──────────────────────────────────────────────────────────────────
  handleZone: { paddingTop: 10, paddingBottom: 4, alignItems: "center" },
  handlePill: { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 2 },

  // ── TOP: identidad compacta ──────────────────────────────────────────────────
  topIdent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  goPill: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  goPillTxt: {
    color: "#ffffff",
    fontSize: 14,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 1,
  },
  identName: {
    color: TEXT,
    fontSize: 15,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    letterSpacing: 0.1,
  },
  identPlan: {
    color: DIM,
    fontSize: 11,
    fontWeight: "500",
    marginTop: 1,
  },
  activePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderColor: "#3D9A8440",
    backgroundColor: "#3D9A8410",
    borderRadius: 99,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#3D9A84" },
  activeTxt: { color: "#3D9A84", fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: 0.4 },

  // ── Empresa bar ─────────────────────────────────────────────────────────────
  empresaBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 8,
    marginTop: 2,
  },
  empresaBarTxt: { color: DIM, fontSize: 11, fontWeight: "400" },

  // ── BOTTOM DOCK ─────────────────────────────────────────────────────────────
  dock: {
    paddingHorizontal: 16,
    paddingTop: 4,
    backgroundColor: "#F5F3EF",
  },
  dockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 15,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  dockIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  dockLabel: { color: TEXT, fontSize: 14, fontWeight: "700" },
  dockSub:   { color: DIM, fontSize: 11, marginTop: 1 },

  dockDivider: { height: 1, backgroundColor: BORDER, marginBottom: 10, marginHorizontal: 4 },

  signOutBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 15,
    borderRadius: 16,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "rgba(194,90,90,0.20)",
  },
  signOutTxt: { color: "#C25A5A", fontSize: 13, fontWeight: "700", letterSpacing: 0.3 },

  // ── Sub-screen header ───────────────────────────────────────────────────────
  subHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    backgroundColor: "#FFFFFF",
  },
  backBtn:  { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  subTitle: { flex: 1, textAlign: "center", color: TEXT, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },

  // ── Hub menu rows ────────────────────────────────────────────────────────────
  menuRow: {
    flexDirection: "row", alignItems: "center", gap: 14,
    paddingHorizontal: 16, paddingVertical: 13,
    borderRadius: 14, marginBottom: 8,
    backgroundColor: "#FFFFFF",
    borderWidth: 1, borderColor: BORDER,
    shadowColor: "#000", shadowOpacity: 0.03,
    shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  menuIcon:  { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  menuLabel: { color: TEXT, fontSize: 13, fontWeight: "700" },
  menuSub:   { color: DIM, fontSize: 11, marginTop: 1, fontWeight: "400" },

  // ── Sub-screen content ───────────────────────────────────────────────────────
  scroll:   { flex: 1, padding: 16 },
  card:     { backgroundColor: "#FFFFFF", borderRadius: 16, padding: 18, borderWidth: 1, borderColor: BORDER, marginBottom: 12 },
  listRow:  { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: BORDER, flexDirection: "row", alignItems: "center", gap: 12 },
  listIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  listLabel:{ color: TEXT, fontSize: 13, fontWeight: "700" },
  listSub:  { color: DIM, fontSize: 11, marginTop: 1 },

  // ── FABs ─────────────────────────────────────────────────────────────────────
  fabBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
});
