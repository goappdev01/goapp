/**
 * ActivacionCobrosScreen
 * ════════════════════════════════════════════════════════════════════════════
 * Fase posterior al asistente de 8 pasos. Independiente del wizard.
 *
 * Pantalla 1 — Tu negocio está listo
 * Pantalla 2 — Método de cobro
 * Pantalla 3 — Verificación y activación
 * ════════════════════════════════════════════════════════════════════════════
 */
import React, { useEffect, useState } from "react";
import {
  Animated,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBusinessConfig, type PaymentMethodId } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Visual tokens ────────────────────────────────────────────────────────────

const BG      = "#F5F3EF";
const CARD    = "#FFFFFF";
const BORDER  = "rgba(0,0,0,0.07)";
const TEXT    = "#111827";
const GRAY    = "#6B7280";
const DIM     = "#9CA3AF";
const BLUE    = "#4A80BD";
const GREEN   = "#3D9A84";
const GOLD    = "#C4883A";
const RED     = "#EF4444";

// ─── Payment method definitions ───────────────────────────────────────────────

type PaymentOption = {
  id:       PaymentMethodId;
  icon:     keyof typeof Feather.glyphMap;
  label:    string;
  sub:      string;
  color:    string;
  soon?:    boolean;
};

// PAYMENT_OPTIONS is built inside the component so it can use t() for labels.

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  visible:       boolean;
  onClose:       () => void;
  initialScreen?: 1 | 2 | 3;
};

type Screen = 1 | 2 | 3;

// ─── Main component ───────────────────────────────────────────────────────────

export function ActivacionCobrosScreen({ visible, onClose, initialScreen = 1 }: Props) {
  const insets = useSafeAreaInsets();
  const { config, updateConfig } = useBusinessConfig();
  const { t } = useLanguage();

  const PAYMENT_OPTIONS: PaymentOption[] = [
    { id: "card",   icon: "credit-card",     label: t("pay_card_label"),  sub: t("pay_card_sub"),  color: BLUE     },
    { id: "bank",   icon: "dollar-sign",     label: t("pay_bank_label"),  sub: t("pay_bank_sub"),  color: GREEN    },
    { id: "stripe", icon: "zap",             label: "Stripe",             sub: t("pay_stripe_sub"), color: "#635BFF" },
    { id: "tpv",    icon: "monitor",         label: t("pay_tpv_label"),   sub: t("pay_tpv_sub"),   color: GOLD     },
    { id: "other",  icon: "more-horizontal", label: t("pay_other_label"), sub: t("pay_other_sub"), color: DIM, soon: true },
  ];

  const [screen,          setScreen]          = useState<Screen>(initialScreen);
  const [selectedMethod,  setSelectedMethod]  = useState<PaymentMethodId | null>(config.paymentMethod);
  const [activated,       setActivated]       = useState(config.isBusinessActive);

  // Reset state each time the modal opens so initialScreen is honoured on re-open
  useEffect(() => {
    if (visible) {
      setScreen(initialScreen);
      setSelectedMethod(config.paymentMethod);
      setActivated(config.isBusinessActive);
    }
  }, [visible]);

  const hasCobro   = selectedMethod !== null;
  const isComplete = hasCobro;

  const handleContinueScreen1 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setScreen(2);
  };

  const handleContinueScreen2 = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (selectedMethod) {
      updateConfig({ paymentMethod: selectedMethod });
    }
    setScreen(3);
  };

  const handleActivar = () => {
    if (!hasCobro) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    updateConfig({ paymentMethod: selectedMethod, isBusinessActive: true, bookingEnabled: true });
    setActivated(true);
  };

  const handleClose = () => {
    setScreen(1);
    onClose();
  };

  if (!visible) return null;

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <StatusBar barStyle="dark-content" />
      <View style={{ flex: 1, backgroundColor: BG }}>

        {/* ── Header ── */}
        <View style={{
          backgroundColor: CARD,
          borderBottomWidth: 1, borderBottomColor: BORDER,
          paddingTop: insets.top + 10, paddingBottom: 14,
          paddingHorizontal: 18,
          flexDirection: "row", alignItems: "center", gap: 12,
        }}>
          {screen > 1 && !activated ? (
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setScreen((s) => (s - 1) as Screen); }}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="arrow-left" size={20} color={GRAY} />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 36 }} />
          )}

          <View style={{ flex: 1, alignItems: "center" }}>
            {/* Step dots */}
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 4 }}>
              {([1, 2, 3] as Screen[]).map((s) => (
                <View
                  key={s}
                  style={{
                    width:  screen >= s ? 20 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: screen >= s ? BLUE : "rgba(0,0,0,0.10)",
                  }}
                />
              ))}
            </View>
            <Text style={{ fontSize: 11, color: DIM, fontWeight: "600" }}>
              {screen === 1 ? t("act_screen_business_ready") : screen === 2 ? t("act_screen_payment_method") : t("act_screen_activation")}
            </Text>
          </View>

          <TouchableOpacity
            onPress={handleClose}
            style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
          >
            <Feather name="x" size={20} color={GRAY} />
          </TouchableOpacity>
        </View>

        {/* ── Screen content ── */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 120, paddingHorizontal: 20, paddingTop: 32 }}
        >

          {/* ══ PANTALLA 1 — Tu negocio está listo ══ */}
          {screen === 1 && (
            <View style={{ alignItems: "center" }}>
              {/* Icon */}
              <View style={{
                width: 100, height: 100, borderRadius: 50,
                backgroundColor: GREEN + "14",
                borderWidth: 2.5, borderColor: GREEN + "40",
                alignItems: "center", justifyContent: "center",
                marginBottom: 28,
              }}>
                <Feather name="check-circle" size={46} color={GREEN} />
              </View>

              <Text style={{ fontSize: 26, fontWeight: "900", color: TEXT, textAlign: "center", marginBottom: 14, letterSpacing: -0.3 }}>
                Tu negocio está listo
              </Text>
              <Text style={{ fontSize: 15, color: GRAY, textAlign: "center", lineHeight: 24, marginBottom: 40, maxWidth: 300 }}>
                La configuración ha finalizado correctamente.{"\n\n"}
                Solo falta activar los cobros para comenzar a recibir reservas.
              </Text>

              {/* Checklist */}
              {[
                { icon: "briefcase" as const,  label: "Negocio configurado",         ok: true  },
                { icon: "clock"     as const,  label: "Horarios definidos",           ok: true  },
                { icon: "list"      as const,  label: "Servicios añadidos",           ok: config.services.length > 0 },
                { icon: "credit-card" as const,label: "Método de cobro",              ok: hasCobro },
              ].map((item) => (
                <View
                  key={item.label}
                  style={{
                    flexDirection: "row", alignItems: "center", gap: 12,
                    backgroundColor: CARD,
                    borderRadius: 14, padding: 14, marginBottom: 8,
                    borderWidth: 1, borderColor: BORDER,
                    alignSelf: "stretch",
                  }}
                >
                  <View style={{
                    width: 36, height: 36, borderRadius: 10,
                    backgroundColor: (item.ok ? GREEN : DIM) + "14",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    <Feather name={item.icon} size={16} color={item.ok ? GREEN : DIM} />
                  </View>
                  <Text style={{ flex: 1, fontSize: 14, fontWeight: "600", color: item.ok ? TEXT : DIM }}>
                    {item.label}
                  </Text>
                  <Feather name={item.ok ? "check-circle" : "circle"} size={18} color={item.ok ? GREEN : DIM} />
                </View>
              ))}

              {/* ── Aviso modo demo ── */}
              <View style={{
                alignSelf: "stretch", marginTop: 18,
                backgroundColor: GOLD + "0C",
                borderRadius: 16, padding: 16,
                borderWidth: 1.5, borderColor: GOLD + "35",
                flexDirection: "row", alignItems: "flex-start", gap: 12,
              }}>
                <View style={{
                  width: 32, height: 32, borderRadius: 10,
                  backgroundColor: GOLD + "18",
                  alignItems: "center", justifyContent: "center",
                  marginTop: 1,
                }}>
                  <Feather name="alert-triangle" size={15} color={GOLD} />
                </View>
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 7 }}>
                    <Text style={{ fontSize: 12, fontWeight: "900", color: GOLD, letterSpacing: 0.4 }}>
                      {t("act_demo_mode_title")}
                    </Text>
                    <View style={{
                      backgroundColor: GOLD + "22", borderRadius: 5,
                      paddingHorizontal: 6, paddingVertical: 1,
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: "800", color: GOLD }}>{t("act_demo_mode_badge")}</Text>
                    </View>
                  </View>
                  <Text style={{ fontSize: 12, color: GRAY, lineHeight: 18 }}>
                    {t("act_prod_step_intro")}
                  </Text>
                  {[
                    t("act_plan_selection"),
                    t("act_monthly_cost_renewal"),
                    t("act_billing_data"),
                    t("act_subscription_payment"),
                    t("act_contract_confirm"),
                  ].map((line) => (
                    <View key={line} style={{ flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 2 }}>
                      <Feather name="chevron-right" size={12} color={GOLD} style={{ marginTop: 2 }} />
                      <Text style={{ flex: 1, fontSize: 12, color: GRAY, lineHeight: 18 }}>{line}</Text>
                    </View>
                  ))}
                  <Text style={{ fontSize: 11, color: DIM, marginTop: 4, lineHeight: 16 }}>
                    {t("act_go_platform_charges")}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* ══ PANTALLA 2 — Método de cobro ══ */}
          {screen === 2 && (
            <View>
              <View style={{ marginBottom: 28 }}>
                <Text style={{ fontSize: 24, fontWeight: "900", color: TEXT, marginBottom: 8, letterSpacing: -0.3 }}>
                  Método de cobro
                </Text>
                <Text style={{ fontSize: 14, color: GRAY, lineHeight: 22 }}>
                  Elige cómo quieres recibir los pagos de tus reservas. Podrás cambiar esto más adelante.
                </Text>
              </View>

              <View style={{ gap: 10 }}>
                {PAYMENT_OPTIONS.map((opt) => {
                  const active = selectedMethod === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      activeOpacity={opt.soon ? 1 : 0.82}
                      disabled={opt.soon}
                      onPress={() => {
                        if (opt.soon) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedMethod(active ? null : opt.id);
                      }}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 14,
                        backgroundColor: active ? opt.color + "0A" : CARD,
                        borderRadius: 18, padding: 16,
                        borderWidth: 1.5,
                        borderColor: active ? opt.color : BORDER,
                        opacity: opt.soon ? 0.45 : 1,
                        shadowColor: active ? opt.color : "#000",
                        shadowOpacity: active ? 0.12 : 0.04,
                        shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
                        elevation: active ? 4 : 1,
                      }}
                    >
                      {/* Left accent bar */}
                      {active && (
                        <View style={{
                          position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                          backgroundColor: opt.color,
                          borderTopLeftRadius: 18, borderBottomLeftRadius: 18,
                        }} />
                      )}

                      <View style={{
                        width: 44, height: 44, borderRadius: 14,
                        backgroundColor: opt.color + (active ? "20" : "14"),
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Feather name={opt.icon} size={20} color={opt.color} />
                      </View>

                      <View style={{ flex: 1, paddingLeft: active ? 4 : 0 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                          <Text style={{ fontSize: 15, fontWeight: "800", color: active ? opt.color : TEXT }}>
                            {opt.label}
                          </Text>
                          {opt.soon && (
                            <View style={{ backgroundColor: DIM + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                              <Text style={{ fontSize: 9, fontWeight: "800", color: DIM, letterSpacing: 0.5 }}>PRÓXIMO</Text>
                            </View>
                          )}
                        </View>
                        <Text style={{ fontSize: 12, color: GRAY, marginTop: 2, lineHeight: 18 }}>
                          {opt.sub}
                        </Text>
                      </View>

                      <View style={{
                        width: 22, height: 22, borderRadius: 11,
                        backgroundColor: active ? opt.color : "rgba(0,0,0,0.06)",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        {active && <Feather name="check" size={12} color="#fff" />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{
                flexDirection: "row", alignItems: "flex-start", gap: 10,
                backgroundColor: BLUE + "08",
                borderRadius: 14, padding: 14, marginTop: 20,
                borderWidth: 1, borderColor: BLUE + "20",
              }}>
                <Feather name="info" size={16} color={BLUE} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12, color: BLUE, lineHeight: 19 }}>
                  Sin método de cobro puedes gestionar tu negocio, pero no podrás publicarlo ni recibir reservas.
                </Text>
              </View>
            </View>
          )}

          {/* ══ PANTALLA 3 — Verificación ══ */}
          {screen === 3 && (
            <View style={{ alignItems: "center" }}>
              {activated ? (
                /* ── Estado activado ── */
                <>
                  <View style={{
                    width: 110, height: 110, borderRadius: 55,
                    backgroundColor: GREEN + "14",
                    borderWidth: 3, borderColor: GREEN + "50",
                    alignItems: "center", justifyContent: "center",
                    marginBottom: 28,
                  }}>
                    <Feather name="zap" size={50} color={GREEN} />
                  </View>
                  <Text style={{ fontSize: 26, fontWeight: "900", color: TEXT, textAlign: "center", marginBottom: 10, letterSpacing: -0.3 }}>
                    Business activated!
                  </Text>
                  <Text style={{ fontSize: 15, color: GRAY, textAlign: "center", lineHeight: 24, marginBottom: 36, maxWidth: 300 }}>
                    You can now receive bookings from your clients.{"\n"}Everything is ready to operate.
                  </Text>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={handleClose}
                    style={{
                      backgroundColor: GREEN, borderRadius: 18,
                      paddingHorizontal: 36, paddingVertical: 16,
                      flexDirection: "row", alignItems: "center", gap: 10,
                      shadowColor: GREEN, shadowOpacity: 0.3, shadowRadius: 14, elevation: 6,
                    }}
                  >
                    <Feather name="arrow-right" size={18} color="#fff" />
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
                      Go to my business
                    </Text>
                  </TouchableOpacity>
                </>
              ) : (
                /* ── Estado pendiente ── */
                <>
                  <Text style={{ fontSize: 24, fontWeight: "900", color: TEXT, textAlign: "center", marginBottom: 8, letterSpacing: -0.3, alignSelf: "stretch" }}>
                    {t("act_verification_title")}
                  </Text>
                  <Text style={{ fontSize: 14, color: GRAY, textAlign: "left", lineHeight: 22, marginBottom: 28, alignSelf: "stretch" }}>
                    {t("act_check_before_activate")}
                  </Text>

                  {/* Checklist */}
                  {[
                    {
                      label: t("act_business_configured_label"),
                      sub:   config.businessName?.trim() || t("no_name"),
                      ok:    true,
                      icon:  "briefcase" as const,
                    },
                    {
                      label: t("act_payment_method_label"),
                      sub:   selectedMethod
                        ? (PAYMENT_OPTIONS.find(o => o.id === selectedMethod)?.label ?? selectedMethod)
                        : t("act_not_configured_fallback"),
                      ok:    !!selectedMethod,
                      icon:  "credit-card" as const,
                    },
                  ].map((item) => (
                    <View
                      key={item.label}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        borderRadius: 14, padding: 14, marginBottom: 10,
                        borderWidth: 1.5,
                        borderColor: item.ok ? GREEN + "30" : RED + "25",
                        backgroundColor: item.ok ? GREEN + "04" : RED + "04",
                        alignSelf: "stretch",
                      }}
                    >
                      <View style={{
                        width: 38, height: 38, borderRadius: 11,
                        backgroundColor: (item.ok ? GREEN : RED) + "14",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Feather name={item.icon} size={17} color={item.ok ? GREEN : RED} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontWeight: "700", color: TEXT }}>{item.label}</Text>
                        <Text style={{ fontSize: 11, color: GRAY, marginTop: 2 }}>{item.sub}</Text>
                      </View>
                      <Feather
                        name={item.ok ? "check-circle" : "alert-circle"}
                        size={20}
                        color={item.ok ? GREEN : RED}
                      />
                    </View>
                  ))}

                  {/* Estado global */}
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 10,
                    backgroundColor: isComplete ? GREEN + "0A" : GOLD + "0A",
                    borderRadius: 16, padding: 16, marginTop: 10,
                    borderWidth: 1.5,
                    borderColor: isComplete ? GREEN + "35" : GOLD + "35",
                    alignSelf: "stretch",
                  }}>
                    <View style={{
                      width: 12, height: 12, borderRadius: 6,
                      backgroundColor: isComplete ? GREEN : GOLD,
                    }} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "800", color: isComplete ? GREEN : GOLD }}>
                      {isComplete
                        ? "🟢 Listo para recibir reservas"
                        : "🟡 Pendiente: configura un método de cobro"}
                    </Text>
                  </View>

                  {!isComplete && (
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); setScreen(2); }}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 8,
                        marginTop: 14, alignSelf: "stretch",
                        backgroundColor: CARD, borderRadius: 14, padding: 14,
                        borderWidth: 1, borderColor: BORDER,
                      }}
                    >
                      <Feather name="edit-2" size={15} color={BLUE} />
                      <Text style={{ fontSize: 13, fontWeight: "700", color: BLUE }}>
                        Configurar método de cobro
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Feather name="chevron-right" size={15} color={BLUE} />
                    </TouchableOpacity>
                  )}
                </>
              )}
            </View>
          )}

        </ScrollView>

        {/* ── Botón de acción flotante ──
            Visible siempre en pantallas 1 y 2.
            En pantalla 3 se oculta una vez que el usuario pulsa "Activar"
            (activated=true) para no solapar la pantalla de éxito. */}
        {(!activated || screen < 3) && (
          <View style={{
            position: "absolute", bottom: 0, left: 0, right: 0,
            backgroundColor: CARD,
            borderTopWidth: 1, borderTopColor: BORDER,
            paddingHorizontal: 20, paddingTop: 14,
            paddingBottom: insets.bottom + 12,
            shadowColor: "#000", shadowOpacity: 0.07, shadowRadius: 10, elevation: 6,
          }}>
            {screen === 1 && (
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleContinueScreen1}
                style={{
                  backgroundColor: BLUE, borderRadius: 18, paddingVertical: 16,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                  shadowColor: BLUE, shadowOpacity: 0.28, shadowRadius: 12, elevation: 5,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
                  Continuar
                </Text>
                <Feather name="arrow-right" size={18} color="#fff" />
              </TouchableOpacity>
            )}

            {screen === 2 && (
              <TouchableOpacity
                activeOpacity={selectedMethod ? 0.88 : 1}
                onPress={selectedMethod ? handleContinueScreen2 : undefined}
                style={{
                  backgroundColor: selectedMethod ? BLUE : "rgba(0,0,0,0.07)",
                  borderRadius: 18, paddingVertical: 16,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                  shadowColor: BLUE,
                  shadowOpacity: selectedMethod ? 0.28 : 0,
                  shadowRadius: 12, elevation: selectedMethod ? 5 : 0,
                }}
              >
                <Text style={{ color: selectedMethod ? "#fff" : DIM, fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
                  {selectedMethod ? t("act_confirm_method_btn") : t("act_select_method_hint")}
                </Text>
                {selectedMethod && <Feather name="arrow-right" size={18} color="#fff" />}
              </TouchableOpacity>
            )}

            {screen === 3 && (
              <TouchableOpacity
                activeOpacity={isComplete ? 0.88 : 1}
                onPress={isComplete ? handleActivar : undefined}
                style={{
                  backgroundColor: isComplete ? GREEN : "rgba(0,0,0,0.07)",
                  borderRadius: 18, paddingVertical: 16,
                  flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                  shadowColor: GREEN,
                  shadowOpacity: isComplete ? 0.3 : 0,
                  shadowRadius: 14, elevation: isComplete ? 6 : 0,
                }}
              >
                <Feather name="zap" size={18} color={isComplete ? "#fff" : DIM} />
                <Text style={{ color: isComplete ? "#fff" : DIM, fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
                  Activar negocio
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )}

      </View>
    </Modal>
  );
}
