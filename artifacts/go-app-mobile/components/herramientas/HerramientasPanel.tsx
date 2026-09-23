import React, { useRef, useState, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Dimensions,
} from "react-native";
import { GoDevPanel } from "@/components/dev/GoDevPanel";
import { DraggableFAB } from "../DraggableFAB";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANG_META, type Lang } from "@/i18n/translations";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GUIDANCE_NAMES, GUIDANCE_NAMES_EN } from "../../utils/guidance";
import { COUNTRY_CONFIGS, MARKET_STORAGE_KEY, REGION_STORAGE_KEY, type Market } from "../../utils/countryConfig";

const GO_GOLD = "#C8A037";
const BLUE    = "#4A80BD";
const BLUE_BG = "rgba(74,128,189,0.10)";
const BLUE_BDR= "rgba(74,128,189,0.35)";
const GOLD_BG = "rgba(196,136,58,0.10)";
const GOLD_BDR= "rgba(196,136,58,0.35)";

interface HerramientasPanelProps {
  visible: boolean;
  onClose: () => void;
  handedness: "left" | "right";
  toggleHandedness: () => void;
  uiScale: "compacto" | "estandar" | "grande";
  setUiScale: (k: "compacto" | "estandar" | "grande") => void;
  userGoPhoneDraft: string;
  setUserGoPhoneDraft: (v: string) => void;
  phoneGoSaved: boolean;
  commitUserPhone: () => void;
  demoSelfSend: boolean;
  setDemoSelfSend: (v: boolean) => void;
  shakeAiEnabled: boolean;
  setShakeAiEnabled: (v: boolean) => void;
  shakeAiSensitivity: "baja" | "media" | "alta";
  setShakeAiSensitivity: (v: "baja" | "media" | "alta") => void;
  shakeAiAction: "abrir" | "abrir_voz";
  setShakeAiAction: (v: "abrir" | "abrir_voz") => void;
  calBgDensity: "auto" | "1h" | "30min" | "15min";
  setCalBgDensity: (v: "auto" | "1h" | "30min" | "15min") => void;
  calBgDayNightMode: "claro" | "oscuro" | "mixto";
  setCalBgDayNightMode: (v: "claro" | "oscuro" | "mixto") => void;
  calConfigVisible: boolean;
  setCalConfigVisible: (v: boolean) => void;
  guidanceLevel: number;
  setGuidanceLevel: (v: number) => void;
  effectiveGuidanceLevel: number;
  autoBoost: number;
  showToast: (text: string, type?: "success" | "error" | "warning" | "info") => void;
  userMarket: Market;
  setUserMarket: (m: Market) => void;
  userRegion: string;
  setUserRegion: (r: string) => void;
}

export function HerramientasPanel({
  visible, onClose,
  handedness, toggleHandedness,
  uiScale, setUiScale,
  userGoPhoneDraft, setUserGoPhoneDraft,
  phoneGoSaved, commitUserPhone,
  demoSelfSend, setDemoSelfSend,
  shakeAiEnabled, setShakeAiEnabled,
  shakeAiSensitivity, setShakeAiSensitivity,
  shakeAiAction, setShakeAiAction,
  calBgDensity, setCalBgDensity,
  calBgDayNightMode, setCalBgDayNightMode,
  calConfigVisible, setCalConfigVisible,
  guidanceLevel, setGuidanceLevel,
  effectiveGuidanceLevel, autoBoost,
  showToast,
  userMarket, setUserMarket,
  userRegion, setUserRegion,
}: HerramientasPanelProps) {
  const insets = useSafeAreaInsets();
  const { lang, setLang, t } = useLanguage();

  // Dropdown states
  const [langOpen,    setLangOpen]    = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // ── Secret 5-tap trigger → DevPanel ──────────────────────────────────────
  const [devPanelVisible, setDevPanelVisible] = useState(false);
  const devTapCount  = useRef(0);
  const devTapTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSecretTap = useCallback(() => {
    devTapCount.current += 1;
    if (devTapTimer.current) clearTimeout(devTapTimer.current);
    if (devTapCount.current >= 5) {
      devTapCount.current = 0;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      setDevPanelVisible(true);
    } else {
      devTapTimer.current = setTimeout(() => { devTapCount.current = 0; }, 1500);
    }
  }, []);

  const screenW = Dimensions.get("window").width;
  const rightSwipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (e, g) => {
        if (Math.abs(g.dy) <= 12 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
        return e.nativeEvent.pageX >= screenW * 0.75;
      },
      onPanResponderRelease: (_e, g) => { if (g.dy > 120) onCloseRef.current(); },
      onPanResponderTerminate: () => {},
    }),
  ).current;

  const fabBottom        = insets.bottom + 24;
  const contentPadBottom = fabBottom + 80;

  const currentLang    = LANG_META.find(m => m.code === lang);
  const currentCountry = COUNTRY_CONFIGS[userMarket];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={[s.root, { paddingTop: insets.top }]} {...rightSwipePan.panHandlers}>

        <View style={s.handleZone}>
          <View style={s.handlePill} />
        </View>

        <TouchableOpacity
          style={s.header}
          onPress={handleSecretTap}
          activeOpacity={1}
          accessible={false}
        >
          <View style={s.headerIconWrap}>
            <Feather name="settings" size={16} color={BLUE} />
          </View>
          <Text style={s.headerTitle}>{t('tools')}</Text>
        </TouchableOpacity>

        <ScrollView
          style={s.scroll}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: contentPadBottom }}
          keyboardShouldPersistTaps="handled"
        >

          {/* ══════════════════════════════════════════════════════════
              1 · PERSONALIZACIÓN
          ══════════════════════════════════════════════════════════ */}
          <Text style={s.familyLabel}>PERSONALIZACIÓN</Text>
          <View style={s.card}>

            {/* Lateralidad */}
            <View style={s.rowHeader}>
              <View style={s.rowIconWrap}>
                <Text style={{ fontSize: 13 }}>✋</Text>
              </View>
              <Text style={s.rowTitle}>{t("handedness")}</Text>
            </View>
            <View style={[s.segRow, { marginTop: 10 }]}>
              {([
                { k: "left"  as const, label: t("left_handed"),  icon: "←" },
                { k: "right" as const, label: t("right_handed"), icon: "→" },
              ]).map(({ k, label, icon }) => {
                const active = handedness === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => {
                      if (handedness !== k) {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        toggleHandedness();
                      }
                    }}
                    activeOpacity={0.7}
                    style={[s.segBtn, active && s.segBtnActive]}
                  >
                    <Text style={[s.segIcon, active && s.segIconActive]}>{icon}</Text>
                    <Text style={[s.segLabel, active && s.segLabelActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.divider} />

            {/* Tamaño GO */}
            <View style={s.rowHeader}>
              <View style={s.rowIconWrap}>
                <Feather name="maximize-2" size={13} color={BLUE} />
              </View>
              <Text style={s.rowTitle}>{t("go_size")}</Text>
            </View>
            <View style={[s.segRow, { marginTop: 10 }]}>
              {([
                { k: "grande"   as const, label: t("large")  },
                { k: "estandar" as const, label: t("medium") },
                { k: "compacto" as const, label: t("small")  },
              ] as const).map(({ k, label }) => {
                const active = uiScale === k;
                return (
                  <TouchableOpacity
                    key={k}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                      setUiScale(k);
                      AsyncStorage.setItem("go_ui_scale_v1", k).catch(() => {});
                    }}
                    activeOpacity={0.7}
                    style={[s.segBtn, active && s.segBtnActive]}
                  >
                    <Text style={[s.segLabel, active && s.segLabelActive]}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════
              2 · INTERNACIONAL
          ══════════════════════════════════════════════════════════ */}
          <Text style={s.familyLabel}>INTERNACIONAL</Text>
          <View style={s.card}>

            {/* País — compact row + dropdown */}
            <TouchableOpacity
              style={s.compactRow}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setCountryOpen(o => !o);
                setLangOpen(false);
              }}
              activeOpacity={0.75}
            >
              <View style={s.compactIconWrap}>
                <Text style={{ fontSize: 20 }}>{currentCountry.flag}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.compactTitle}>{currentCountry.countryName}</Text>
                <Text style={s.compactSub}>
                  {currentCountry.currency} · {currentCountry.currencySymbol} · {currentCountry.distanceUnit.toUpperCase()}
                </Text>
              </View>
              <Feather
                name={countryOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={countryOpen ? BLUE : "#9CA3AF"}
              />
            </TouchableOpacity>

            {countryOpen && (
              <View style={s.dropdown}>
                {(Object.values(COUNTRY_CONFIGS) as typeof COUNTRY_CONFIGS[Market][]).map((cfg) => {
                  const active = userMarket === cfg.market;
                  return (
                    <TouchableOpacity
                      key={cfg.market}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setUserMarket(cfg.market);
                        AsyncStorage.setItem(MARKET_STORAGE_KEY, cfg.market).catch(() => {});
                        setCountryOpen(false);
                      }}
                      activeOpacity={0.7}
                      style={[s.dropdownRow, active && s.dropdownRowActive]}
                    >
                      <Text style={{ fontSize: 18 }}>{cfg.flag}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.dropdownTxt, active && { color: BLUE, fontFamily: "Inter_700Bold", fontWeight: "800" }]}>
                          {cfg.countryName}
                        </Text>
                        <Text style={s.dropdownSub}>
                          {cfg.currency} · {cfg.currencySymbol} · {cfg.distanceUnit.toUpperCase()}
                        </Text>
                      </View>
                      {active && <Feather name="check" size={14} color={BLUE} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={s.divider} />

            {/* Idioma — compact row + dropdown */}
            <TouchableOpacity
              style={s.compactRow}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setLangOpen(o => !o);
                setCountryOpen(false);
              }}
              activeOpacity={0.75}
            >
              <View style={s.compactIconWrap}>
                <Feather name="globe" size={16} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.compactTitle}>{currentLang?.nativeLabel ?? lang}</Text>
                <Text style={s.compactSub}>{t("language")}</Text>
              </View>
              <Feather
                name={langOpen ? "chevron-up" : "chevron-down"}
                size={16}
                color={langOpen ? BLUE : "#9CA3AF"}
              />
            </TouchableOpacity>

            {langOpen && (
              <View style={s.dropdown}>
                {LANG_META.map(({ code, nativeLabel, implemented }) => {
                  const active = lang === code;
                  return (
                    <TouchableOpacity
                      key={code}
                      onPress={() => {
                        if (!implemented) return;
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setLang(code as Lang);
                        setLangOpen(false);
                      }}
                      activeOpacity={implemented ? 0.7 : 1}
                      style={[
                        s.dropdownRow,
                        active && s.dropdownRowActive,
                        !implemented && { opacity: 0.32 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[s.dropdownTxt, active && { color: BLUE, fontFamily: "Inter_700Bold", fontWeight: "800" }]}>
                          {nativeLabel}
                        </Text>
                        {!implemented && (
                          <Text style={s.dropdownSub}>Próximamente</Text>
                        )}
                      </View>
                      {active && <Feather name="check" size={14} color={BLUE} />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            <View style={s.divider} />

            {/* Región / Ciudad */}
            <View style={s.compactRow}>
              <View style={s.compactIconWrap}>
                <Feather name="map-pin" size={15} color={BLUE} />
              </View>
              <TextInput
                value={userRegion}
                onChangeText={setUserRegion}
                onBlur={() => AsyncStorage.setItem(REGION_STORAGE_KEY, userRegion).catch(() => {})}
                onSubmitEditing={() => AsyncStorage.setItem(REGION_STORAGE_KEY, userRegion).catch(() => {})}
                placeholder={lang === "en" ? "Region, city…" : "Región, ciudad…"}
                placeholderTextColor="#9CA3AF"
                returnKeyType="done"
                style={[s.inlineInput, userRegion.trim() && s.inlineInputFilled]}
              />
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════
              3 · ASISTENCIA GO
          ══════════════════════════════════════════════════════════ */}
          <Text style={s.familyLabel}>ASISTENCIA GO</Text>

          {/* Guía visual */}
          <View style={s.card}>
            <View style={s.rowHeader}>
              <View style={s.rowIconWrap}>
                <Feather name="eye" size={13} color={BLUE} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.rowTitle}>{t("tools_guidance_title")}</Text>
                <Text style={s.rowSub}>
                  {autoBoost > 0
                    ? `${(lang === "en" ? GUIDANCE_NAMES_EN : GUIDANCE_NAMES)[effectiveGuidanceLevel]} · ${t("tools_guidance_adapted")} ${guidanceLevel}`
                    : `${(lang === "en" ? GUIDANCE_NAMES_EN : GUIDANCE_NAMES)[guidanceLevel]} — ${t("tools_guidance_native")}`}
                </Text>
              </View>
            </View>
            <View style={{ gap: 8, marginTop: 12 }}>
              {([[1, 2, 3, 4, 5], [6, 7, 8, 9]] as number[][]).map((row, ri) => (
                <View key={ri} style={{ flexDirection: "row", gap: 6 }}>
                  {row.map((lvl) => {
                    const active = guidanceLevel === lvl;
                    return (
                      <TouchableOpacity
                        key={lvl}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setGuidanceLevel(lvl);
                          AsyncStorage.setItem("go_guidance_level_v1", String(lvl)).catch(() => {});
                        }}
                        activeOpacity={0.7}
                        style={[s.numBtn, active && s.numBtnActive]}
                      >
                        <Text style={[s.numBtnTxt, active && s.numBtnTxtActive]}>{lvl}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
            </View>
            <Text style={s.hintTxt}>{t('guidance_hint')}</Text>
          </View>

          {/* Gestos rápidos IA */}
          <View style={[s.card, shakeAiEnabled && s.cardGold]}>
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <View style={[s.rowIconWrap, { marginRight: 10 }]}>
                <View style={[s.shakeIcon, shakeAiEnabled && s.shakeIconOn]}>
                  <Feather name="zap" size={11} color={shakeAiEnabled ? "#FFFFFF" : "#9CA3AF"} />
                </View>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.rowTitle, shakeAiEnabled && { color: "#C4883A" }]}>
                  {t("gesto_rapido_ia")}
                </Text>
                <Text style={s.rowSub}>
                  {shakeAiEnabled ? t("shake_ai_hint_on") : t("shake_ai_hint_off")}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  const next = !shakeAiEnabled;
                  setShakeAiEnabled(next);
                  AsyncStorage.setItem(
                    "go_shake_ai_v1",
                    JSON.stringify({ enabled: next, sensitivity: shakeAiSensitivity, action: shakeAiAction }),
                  ).catch(() => {});
                }}
                activeOpacity={0.8}
                style={[s.toggleSwitch, shakeAiEnabled && s.toggleSwitchGold]}
              >
                <View style={[s.toggleThumb, { alignSelf: shakeAiEnabled ? "flex-end" : "flex-start" }]} />
              </TouchableOpacity>
            </View>

            {shakeAiEnabled && (
              <>
                <View style={s.divider} />
                <Text style={s.subLabel}>{t("sensitivity_label")}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                  {(["baja", "media", "alta"] as const).map((sv) => {
                    const active = shakeAiSensitivity === sv;
                    const labels = { baja: t("sensitivity_soft"), media: t("sensitivity_normal"), alta: t("sensitivity_precise") };
                    return (
                      <TouchableOpacity
                        key={sv}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setShakeAiSensitivity(sv);
                          AsyncStorage.setItem("go_shake_ai_v1", JSON.stringify({ enabled: shakeAiEnabled, sensitivity: sv, action: shakeAiAction })).catch(() => {});
                        }}
                        activeOpacity={0.7}
                        style={[s.subBtn, active && s.subBtnGoldActive]}
                      >
                        <Text style={[s.subBtnTxt, active && { color: "#C4883A", fontFamily: "Inter_700Bold", fontWeight: "800" }]}>{labels[sv]}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <Text style={s.subLabel}>{t("tools_shake_label")}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
                  {([
                    { k: "abrir"     as const, label: t("tools_shake_open_ai"), icon: "zap" as const },
                    { k: "abrir_voz" as const, label: t("tools_shake_ai_mic"),  icon: "mic" as const },
                  ]).map(({ k, label, icon }) => {
                    const active = shakeAiAction === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setShakeAiAction(k);
                          AsyncStorage.setItem("go_shake_ai_v1", JSON.stringify({ enabled: shakeAiEnabled, sensitivity: shakeAiSensitivity, action: k })).catch(() => {});
                        }}
                        activeOpacity={0.7}
                        style={[s.subBtn, { flex: 1, alignItems: "center", gap: 5, paddingVertical: 12 }, active && s.subBtnGoldActive]}
                      >
                        <Feather name={icon} size={14} color={active ? "#C4883A" : "#9CA3AF"} />
                        <Text style={[s.subBtnTxt, active && { color: "#C4883A", fontFamily: "Inter_700Bold", fontWeight: "800" }]}>{label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <Text style={s.hintTxt}>{t("tools_shake_hint")}</Text>
              </>
            )}
          </View>

          {/* Automatización / Calendario */}
          <View style={s.card}>
            <View style={s.rowHeader}>
              <View style={s.rowIconWrap}>
                <Feather name="calendar" size={13} color={BLUE} />
              </View>
              <Text style={s.rowTitle}>{t("tools_calendar_section")}</Text>
            </View>

            <View style={{ marginTop: 12 }}>
              <Text style={s.subLabel}>{t("tools_density_label")}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {(["auto", "1h", "30min", "15min"] as const).map((d) => {
                  const active = calBgDensity === d;
                  const label = d === "auto" ? "AUTO" : d === "1h" ? "1H" : d === "30min" ? "30 MIN" : "15 MIN";
                  return (
                    <TouchableOpacity
                      key={d}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setCalBgDensity(d);
                        AsyncStorage.setItem("cal_density", d).catch(() => {});
                      }}
                      activeOpacity={0.7}
                      style={[s.subBtn, active && s.subBtnActive]}
                    >
                      <Text style={[s.subBtnTxt, active && s.subBtnTxtActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={s.subLabel}>{t("tools_light_mode")}</Text>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 14 }}>
                {([
                  { key: "claro"  as const, icon: "sun",    label: t("tools_light_clear") },
                  { key: "mixto"  as const, icon: "circle", label: t("tools_light_mixed") },
                  { key: "oscuro" as const, icon: "moon",   label: t("tools_light_dark")  },
                ]).map(({ key, icon, label }) => {
                  const active = calBgDayNightMode === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        setCalBgDayNightMode(key);
                        AsyncStorage.setItem("cal_day_night_mode_v1", key).catch(() => {});
                      }}
                      activeOpacity={0.7}
                      style={[s.subBtn, { flex: 1, alignItems: "center", gap: 5, paddingVertical: 10 }, active && s.subBtnActive]}
                    >
                      <Feather name={icon as any} size={13} color={active ? BLUE : "#9CA3AF"} />
                      <Text style={[s.subBtnTxt, active && s.subBtnTxtActive]}>{label}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text style={s.subRowTitle}>{t("tools_show_controls")}</Text>
                  <Text style={s.subRowSub}>
                    {calConfigVisible ? t("tools_controls_visible_desc") : t("tools_controls_hidden_desc")}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setCalConfigVisible(!calConfigVisible);
                  }}
                  activeOpacity={0.8}
                  style={[s.toggleSwitch, calConfigVisible && s.toggleSwitchOn]}
                >
                  <View style={[s.toggleThumb, { alignSelf: calConfigVisible ? "flex-end" : "flex-start" }]} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════
              4 · CUENTA / TELÉFONO
          ══════════════════════════════════════════════════════════ */}
          <Text style={s.familyLabel}>CUENTA</Text>

          {/* Mi número GO */}
          <View style={s.card}>
            <View style={s.rowHeader}>
              <View style={s.rowIconWrap}>
                <Feather name="phone" size={13} color={BLUE} />
              </View>
              <Text style={s.rowTitle}>{t("my_go_phone")}</Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10 }}>
              <TextInput
                value={userGoPhoneDraft}
                onChangeText={setUserGoPhoneDraft}
                onBlur={commitUserPhone}
                onSubmitEditing={commitUserPhone}
                placeholder={t("phone_placeholder")}
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
                returnKeyType="done"
                style={[s.inlineInput, userGoPhoneDraft.trim() ? s.inlineInputFilled : undefined, { flex: 1 }]}
              />
              {phoneGoSaved && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name="check" size={12} color="#3D9A84" />
                  <Text style={{ color: "#3D9A84", fontSize: 10, fontWeight: "700" }}>{t("saved")}</Text>
                </View>
              )}
            </View>
            {!phoneGoSaved && !!userGoPhoneDraft.trim() && (
              <Text style={{ color: "rgba(61,154,132,0.7)", fontSize: 10, marginTop: 8 }}>
                {t("go_direct_to_number")}
              </Text>
            )}
          </View>

          {/* Autoenvío demo */}
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              const next = !demoSelfSend;
              setDemoSelfSend(next);
              AsyncStorage.setItem("go_demo_self_send_enabled", next ? "true" : "false").catch(() => {});
            }}
            activeOpacity={0.8}
            style={[s.card, s.demoRow, demoSelfSend && s.demoRowActive]}
          >
            <View style={[s.rowIconWrap, { marginRight: 12 }]}>
              <Feather name="send" size={13} color={demoSelfSend ? "#C4883A" : BLUE} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.rowTitle, demoSelfSend && { color: "#C4883A" }]}>{t("demo_mode")}</Text>
              <Text style={s.rowSub}>{demoSelfSend ? t("demo_mode_on") : t("demo_mode_off")}</Text>
            </View>
            <View style={[s.toggleSwitch, demoSelfSend && { backgroundColor: "#C4883A" }]}>
              <View style={[s.toggleThumb, { alignSelf: demoSelfSend ? "flex-end" : "flex-start" }]} />
            </View>
          </TouchableOpacity>

        </ScrollView>

        {/* FAB cerrar — arrastrable con long-press */}
        <DraggableFAB
          screenKey="herramientas"
          buttonKey="close"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={40}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel={t('close_tools')}
            style={s.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

        <LinearGradient
          colors={["transparent", "rgba(0,0,0,0.06)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={{ position: "absolute", right: 0, top: "50%", bottom: 0, width: "25%" }}
        />
      </View>

      {/* ── Panel de Laboratorio Dev (trigger: 5 toques en el header) ────── */}
      <GoDevPanel
        visible={devPanelVisible}
        onClose={() => setDevPanelVisible(false)}
      />

    </Modal>
  );
}

const s = StyleSheet.create({
  root:         { flex: 1, backgroundColor: "#F5F3EF" },

  handleZone:   { paddingTop: 10, paddingBottom: 4, alignItems: "center" },
  handlePill:   { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 2 },

  header:       {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#FFFFFF", gap: 8,
  },
  headerIconWrap: { width: 32, height: 32, borderRadius: 10, backgroundColor: BLUE_BG, alignItems: "center", justifyContent: "center" },
  headerTitle:  { fontSize: 16, color: "#111827", fontFamily: "Inter_700Bold", fontWeight: "800" },

  scroll:       { flex: 1, paddingHorizontal: 16, paddingTop: 18 },

  // Section family label
  familyLabel:  {
    color: "#6B7280", fontSize: 10, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.4,
    textTransform: "uppercase", marginBottom: 10, marginLeft: 2,
    marginTop: 4,
  },

  card:         {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
    shadowColor: "#000",
    shadowOpacity: 0.03,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    marginBottom: 10,
  },
  cardGold:     { borderColor: GOLD_BDR },

  divider:      { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginVertical: 14 },

  // Row header inside card
  rowHeader:    { flexDirection: "row", alignItems: "center", gap: 10 },
  rowIconWrap:  { width: 28, height: 28, borderRadius: 8, backgroundColor: BLUE_BG, alignItems: "center", justifyContent: "center" },
  rowTitle:     { color: "#111827", fontSize: 13, fontWeight: "700" },
  rowSub:       { color: "#9CA3AF", fontSize: 10, lineHeight: 14, marginTop: 2 },

  // Segment controls (replacing big toggle buttons)
  segRow:       { flexDirection: "row", gap: 8 },
  segBtn:       {
    flex: 1, paddingVertical: 11, borderRadius: 11, alignItems: "center", gap: 3,
    backgroundColor: "#F7F8FA",
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
  },
  segBtnActive: {
    backgroundColor: BLUE_BG,
    borderWidth: 2, borderColor: BLUE,
    shadowColor: BLUE, shadowOpacity: 0.12, shadowRadius: 6, shadowOffset: { width: 0, height: 0 },
  },
  segIcon:      { color: "#9CA3AF", fontSize: 13, fontWeight: "300" },
  segIconActive:{ color: BLUE },
  segLabel:     { color: "#6B7280", fontSize: 11, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1 },
  segLabelActive: { color: "#111827" },

  // Compact row (for country, language, region)
  compactRow:   { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 4 },
  compactIconWrap: { width: 36, height: 36, borderRadius: 10, backgroundColor: BLUE_BG, alignItems: "center", justifyContent: "center" },
  compactTitle: { color: "#111827", fontSize: 14, fontWeight: "700" },
  compactSub:   { color: "#9CA3AF", fontSize: 10, marginTop: 1 },

  // Dropdown (country/lang list)
  dropdown:     {
    marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#FAFBFF", overflow: "hidden",
  },
  dropdownRow:  { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)" },
  dropdownRowActive: { backgroundColor: BLUE_BG },
  dropdownTxt:  { color: "#374151", fontSize: 13, fontWeight: "600" },
  dropdownSub:  { color: "#9CA3AF", fontSize: 10, marginTop: 1 },

  // Inline input (region, phone)
  inlineInput:  { height: 40, flex: 1, borderRadius: 10, backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.10)", color: "#111827", fontSize: 14, fontWeight: "600", paddingHorizontal: 12 },
  inlineInputFilled: { borderWidth: 2, borderColor: "rgba(61,154,132,0.55)", backgroundColor: "rgba(61,154,132,0.04)" },

  // Demo row
  demoRow:      { flexDirection: "row", alignItems: "center" },
  demoRowActive:{ borderColor: GOLD_BDR, backgroundColor: GOLD_BG },

  // Toggle switch
  toggleSwitch: { width: 48, height: 28, borderRadius: 14, backgroundColor: "#E5E7EB", justifyContent: "center", paddingHorizontal: 3 },
  toggleSwitchOn:  { backgroundColor: BLUE },
  toggleSwitchGold:{ backgroundColor: GO_GOLD },
  toggleThumb:  { width: 22, height: 22, borderRadius: 11, backgroundColor: "#FFFFFF" },

  // Shake icon
  shakeIcon:    { width: 22, height: 22, borderRadius: 11, backgroundColor: "#F3F4F6", borderWidth: 1.5, borderColor: "rgba(0,0,0,0.10)", alignItems: "center", justifyContent: "center" },
  shakeIconOn:  { backgroundColor: GO_GOLD, borderColor: GO_GOLD },

  // Sub controls
  subLabel:     { color: "#9CA3AF", fontSize: 10, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  subRowTitle:  { color: "#111827", fontSize: 12, fontWeight: "700", marginBottom: 2 },
  subRowSub:    { color: "#9CA3AF", fontSize: 10, lineHeight: 14 },

  subBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  subBtnActive: { backgroundColor: BLUE_BG, borderWidth: 1.5, borderColor: BLUE_BDR },
  subBtnTxt:    { color: "#6B7280", fontSize: 10, fontWeight: "700", letterSpacing: 0.6 },
  subBtnTxtActive: { color: BLUE, fontFamily: "Inter_700Bold", fontWeight: "800" },
  subBtnGoldActive:{ backgroundColor: GOLD_BG, borderWidth: 1.5, borderColor: GOLD_BDR },

  // Guidance
  numBtn:       { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  numBtnActive: { backgroundColor: BLUE_BG, borderWidth: 2, borderColor: BLUE },
  numBtnTxt:    { color: "#9CA3AF", fontSize: 13, fontFamily: "Inter_900Black", fontWeight: "900" },
  numBtnTxtActive: { color: BLUE },

  hintTxt:      { color: "#C4C9D4", fontSize: 9, marginTop: 10, textAlign: "center", letterSpacing: 0.4, lineHeight: 13 },

  fabCluster:   { position: "absolute", right: 20, alignItems: "center", gap: 10, zIndex: 99 },
  fabBtn:       {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
});
