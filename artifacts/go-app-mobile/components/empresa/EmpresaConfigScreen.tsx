/**
 * EmpresaConfigScreen
 * ═══════════════════════════════════════════════════════════════════════════
 * Configuración guiada en 8 pasos — única ruta de configuración del negocio.
 *
 * Paso 1: Nombre
 * Paso 2: Ubicación (dirección del negocio)
 * Paso 3: Horarios  (cuándo abre el negocio)
 * Paso 4: Servicios (nombre, duración, precio, capacidad)
 * Paso 5: Espacios/Profesionales (pistas, mesas, cabinas… + servicios por profesional)
 * Paso 6: Reservas  (pago previo, cancelaciones)
 * Paso 7: Plano     (editor visual del local — módulo real)
 * Paso 8: Publicar  (resumen + QR + compartir)
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { PlanoEmpresaScreen } from "@/components/booking/PlanoEmpresaScreen";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import QRCode from "react-native-qrcode-svg";
import { GoOcrImportSheet } from "@/components/empresa/GoOcrImportSheet";
import { Step0Actividad } from "@/components/empresa/EmpresaSetupGuide";

import { GoTimeField } from "@/components/ui/GoTimePicker";
import {
  EMOJI_PALETTE,
  PEOPLE_SECTORS,
  SECTORS,
  SUB_TO_SECTOR,
  getAddLabel,
  getDefaultStaffEmoji,
  getStaffEmojiPalette,
  getSectorLabel,
  getSubName,
  type PlantillaItem,
  type Sector,
} from "@/data/goSectorData";
import { trSector } from "@/data/goSectorTranslations";
import {
  useBusinessConfig,
  type SavedService,
  type DayShift,
  type DaySchedule,
  type StaffScheduleConfig,
} from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Visual tokens ────────────────────────────────────────────────────────────

const BG     = "#F7F8FA";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.08)";
const TEXT   = "#111827";
const GRAY   = "#6B7280";
const DIM    = "#9CA3AF";
const BLUE   = "#4A80BD";
const GREEN  = "#3D9A84";
const GOLD   = "#C4883A";
const PURPLE = "#7C69BE";
const RED    = "#EF4444";

const MOCK_LINK  = "https://go.teso.app/b/mi-negocio";

// ─── Step definitions ─────────────────────────────────────────────────────────

type StepKey = "nombre" | "ubicacion" | "horario" | "espacios" | "servicios" | "reservas" | "plano" | "publicar";

type StepDefCfg = {
  key:      StepKey;
  icon:     keyof typeof Feather.glyphMap;
  label:    string;
  title:    string;
  subtitle: string;
  color:    string;
};

function buildStepsCfg(t: (k: any) => string): StepDefCfg[] {
  return [
    { key: "nombre",    icon: "briefcase", label: t("biz_cfg_step_name"),      title: t("biz_cfg_name_title"),      subtitle: t("biz_cfg_name_subtitle"),      color: BLUE   },
    { key: "ubicacion", icon: "map-pin",   label: t("biz_cfg_step_location"),  title: t("biz_cfg_location_title"),  subtitle: t("biz_cfg_location_subtitle"),  color: GREEN  },
    { key: "horario",   icon: "clock",     label: t("biz_cfg_step_schedule"),  title: t("biz_cfg_schedule_title"),  subtitle: t("biz_cfg_schedule_subtitle"),  color: PURPLE },
    { key: "servicios", icon: "list",      label: t("biz_cfg_step_services"),  title: t("biz_cfg_services_title"),  subtitle: t("biz_cfg_services_subtitle"),  color: BLUE   },
    { key: "espacios",  icon: "layers",    label: t("biz_cfg_step_staff"),     title: t("biz_cfg_staff_title"),     subtitle: t("biz_cfg_staff_subtitle"),     color: GREEN  },
    { key: "reservas",  icon: "shield",    label: t("biz_cfg_step_bookings"),  title: t("biz_cfg_bookings_title"),  subtitle: t("biz_cfg_bookings_subtitle"),  color: GOLD   },
    { key: "plano",     icon: "map",       label: t("biz_cfg_step_plan"),      title: t("biz_cfg_plan_title"),      subtitle: t("biz_cfg_plan_subtitle"),      color: PURPLE },
    { key: "publicar",  icon: "share-2",   label: t("biz_cfg_step_publish"),   title: t("biz_cfg_publish_title"),   subtitle: t("biz_cfg_publish_subtitle"),   color: GOLD   },
  ];
}

function buildPaymentOptsCfg(t: (k: any) => string) {
  return [
    { label: t("biz_free_booking"), sub: t("biz_no_prepay"),       icon: "gift"        },
    { label: t("biz_prepay"),       sub: t("biz_prepay_required"), icon: "credit-card" },
  ] as const;
}

function buildCancelOptsCfg(t: (k: any) => string) {
  return [
    { label: t("biz_flexible"),        sub: t("biz_flexible_24h"),            icon: "refresh-cw" },
    { label: t("biz_strict"),          sub: t("biz_strict_48h"),              icon: "shield"      },
    { label: t("biz_no_cancellation"), sub: t("biz_no_cancellation_allowed"), icon: "x-circle"    },
  ] as const;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface EmpresaConfigScreenProps {
  onBack:              () => void;
  onOpenVerificacion?: () => void;
  onFinalizarConfig?:  () => void;
  initialStep?:        number;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function EmpresaConfigScreen({ onBack, onOpenVerificacion, onFinalizarConfig, initialStep = 0, goPrevRef }: EmpresaConfigScreenProps & { goPrevRef?: React.MutableRefObject<(() => void) | null> }) {
  const insets = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const STEPS = buildStepsCfg(t);
  const { config, updateConfig, resetToSubActivity } = useBusinessConfig();

  // ── Fase previa de selección de actividad ────────────────────────────────────
  // Siempre arranca en "activity" para que el usuario elija (o confirme) su
  // sector y actividad antes de acceder a los 8 pasos.  Si sectorId/subId ya
  // existen de una sesión anterior aparecen pre-seleccionados, pero el flujo
  // nunca salta directamente al paso 1 sin pasar por el selector.
  const [phase, setPhase] = useState<"activity" | "steps">("activity");
  const [localSector, setLocalSector] = useState<Sector | null>(null);

  const [currentStep,    setCurrentStep]    = useState(() => Math.min(Math.max(initialStep, 0), STEPS.length - 1));
  const [planoEditorOpen, setPlanoEditorOpen] = useState(false);
  // Paso Ubicación — protección: el botón Siguiente solo se activa cuando
  // el usuario ha visto la sección CONTACTO o ha rellenado al menos un campo.
  const [contactSectionSeen, setContactSectionSeen] = useState(false);
  const scrollRef   = useRef<ScrollView>(null);
  const slideAnim   = useRef(new Animated.Value(0)).current;
  const headerAnim  = useRef(new Animated.Value(1)).current;

  const currentSector = SECTORS.find(s => s.id === config.sectorId) ?? null;
  const currentSub    = currentSector?.subs.find(s => s.id === config.subId) ?? null;
  const step   = STEPS[currentStep];
  const isLast = currentStep === STEPS.length - 1;

  const animateToStep = (next: number) => {
    Haptics.selectionAsync().catch(() => {});
    // Al cambiar de paso, reiniciar la guardia de sección contacto
    if (next !== 1) setContactSectionSeen(false);
    Animated.sequence([
      Animated.timing(slideAnim, { toValue: 1, duration: 160, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
    ]).start(() => {
      setCurrentStep(next);
      setTimeout(() => scrollRef.current?.scrollTo({ y: 0, animated: false }), 40);
    });
  };

  // Paso Ubicación (1) — el botón Siguiente se activa cuando:
  //   a) el usuario tiene al menos un campo de contacto relleno, o
  //   b) ha desplazado la pantalla lo suficiente para ver CONTACTO (~80 px)
  const hasContact = !!(config.phone?.trim() || config.whatsapp?.trim());
  const canProceed = currentStep !== 1 || hasContact || contactSectionSeen;

  const advanceStep = () => {
    const alreadyDone = Array.isArray(config.completedSteps) ? config.completedSteps : [];
    if (!alreadyDone.includes(currentStep)) {
      updateConfig({ completedSteps: [...alreadyDone, currentStep] });
    }
    if (isLast) { onFinalizarConfig ? onFinalizarConfig() : onBack(); } else { animateToStep(currentStep + 1); }
  };

  const goNext = () => {
    // Paso 4 (espacios/profesionales) — sector de personas: avisar si hay puestos sin nombre
    if (currentStep === 4) {
      const sectorId = SUB_TO_SECTOR[config.subId ?? ""] ?? "";
      if (PEOPLE_SECTORS.has(sectorId)) {
        const totalSlots  = config.plantillaItems.reduce((s, it) => s + it.count, 0);
        const namedSlots  = config.plantillaItems.reduce((s, it) =>
          s + (it.staffNames?.filter(n => n.trim()).length ?? 0), 0);
        if (namedSlots < totalSlots) {
          Alert.alert(
            t("biz_unnamed_slots_title"),
            t("biz_unnamed_slots_msg"),
            [
              { text: t("biz_add_names"), style: "cancel" },
              { text: t("biz_continue_anyway"), onPress: advanceStep },
            ]
          );
          return;
        }
      }
    }
    advanceStep();
  };

  // ── goPrev unificado — gestiona todos los niveles de la ruta real ─────────
  // Activity / sector vista       → onBack() (suite home)
  // Activity / subsector vista    → volver a sectores
  // Steps / paso 0                → volver a activity (selección de actividad)
  // Steps / paso N>0              → paso N-1
  const goPrev = () => {
    if (phase === "activity") {
      if (localSector !== null) {
        setLocalSector(null);
        updateConfig({ sectorId: null, subId: null, plantillaItems: [] });
      } else {
        onBack();
      }
    } else {
      if (currentStep === 0) { setPhase("activity"); }
      else { animateToStep(currentStep - 1); }
    }
  };

  // Registrar goPrev en el ref externo (EmpresaPanel FAB) — se mantiene al día
  const goPrevLatest = useRef(goPrev);
  goPrevLatest.current = goPrev;
  useEffect(() => {
    if (goPrevRef) {
      goPrevRef.current = () => goPrevLatest.current();
      return () => { if (goPrevRef) goPrevRef.current = null; };
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Cabecera adaptativa — colapsa al abrir teclado ───────────────────────────
  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvent, () => {
      Animated.timing(headerAnim, { toValue: 0, duration: 200, useNativeDriver: false }).start();
    });
    const onHide = Keyboard.addListener(hideEvent, () => {
      Animated.timing(headerAnim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
    });
    return () => { onShow.remove(); onHide.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fase previa: selección de sector y actividad ────────────────────────────
  if (phase === "activity") {
    const canContinue = !!(config.sectorId && config.subId);
    const activeSector = localSector;
    const activeSub = activeSector?.subs.find(s => s.id === config.subId) ?? null;

    return (
      <View style={c.root}>
        {/* Header — sin flecha top-left; navegación via FAB flotante */}
        <View style={c.header}>
          <View style={{ width: 36 }} />
          <View style={c.headerCenter}>
            <Text style={c.headerTitle}>{t("biz_my_business")}</Text>
            {activeSector && (
              <Text style={[c.headerSub, { color: activeSector.color }]}>
                {activeSector.emoji} {activeSector.label}{activeSub ? ` · ${activeSub.name}` : ""}
              </Text>
            )}
          </View>
          <View style={{ width: 36 }} />
        </View>

        {/* Pantalla original de selección de sector/actividad — sin cambios */}
        <ScrollView
          style={{ flex: 1, backgroundColor: BG }}
          contentContainerStyle={{ paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Step0Actividad
            sector={localSector}
            setSector={(s) => {
              setLocalSector(s);
              if (!s) updateConfig({ sectorId: null, subId: null, plantillaItems: [] });
              else updateConfig({ sectorId: s.id });
            }}
            subId={config.subId ?? null}
            setSubId={(id) => {
              if (id && localSector) {
                resetToSubActivity(localSector.id, id);
              } else {
                updateConfig({ subId: null });
              }
            }}
            onSubConfirmed={() => { setCurrentStep(0); setPhase("steps"); }}
          />
        </ScrollView>

        {/* Footer — solo Cancelar; Continuar es automático al tocar la actividad */}
        <View style={[c.footer, { paddingBottom: insets.bottom + 12, justifyContent: "flex-start" }]}>
          <TouchableOpacity activeOpacity={0.7} onPress={onBack} style={c.backFooterBtn}>
            <Text style={c.backFooterTxt}>{t("biz_cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={c.root}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={insets.top}
    >

      {/* ── Animated step area — header + steps bar scroll with content ── */}
      <Animated.View style={[c.contentWrap, {
        opacity:   slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
        transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 24] }) }],
      }]}>
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: insets.bottom + 100 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          scrollEventThrottle={60}
          onScroll={(e) => {
            if (currentStep === 1 && !contactSectionSeen) {
              if (e.nativeEvent.contentOffset.y >= 80) {
                setContactSectionSeen(true);
              }
            }
          }}
        >
          {/* Header — colapsa con teclado y al hacer scroll */}
          <Animated.View style={{
            opacity:   headerAnim,
            maxHeight: headerAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 80] }),
            overflow:  "hidden",
          }}>
            <View style={c.header}>
              <View style={{ width: 36 }} />
              <View style={c.headerCenter}>
                <Text style={c.headerTitle}>{t("biz_my_business")}</Text>
                {currentSector && (
                  <Text style={[c.headerSub, { color: currentSector.color }]}>
                    {currentSector.emoji} {getSectorLabel(currentSector, lang)}{currentSub ? ` · ${getSubName(currentSub, lang)}` : ""}
                  </Text>
                )}
              </View>
              <View style={{ width: 36 }} />
            </View>
          </Animated.View>

          {/* Step progress pills — desplazables */}
          <View style={c.stepsBar}>
            {STEPS.map((s, i) => {
              const isDone   = i < currentStep;
              const isActive = i === currentStep;
              const dotColor = isDone ? GREEN : (isActive ? s.color : "rgba(0,0,0,0.10)");
              return (
                <TouchableOpacity
                  key={s.key}
                  activeOpacity={0.7}
                  onPress={() => animateToStep(i)}
                  style={c.stepPill}
                >
                  <View style={[c.stepDot, { backgroundColor: dotColor }]}>
                    {isDone
                      ? <Feather name="check" size={9} color="#fff" />
                      : <Text style={c.stepDotNum}>{i + 1}</Text>
                    }
                  </View>
                  <Text
                    style={[c.stepPillLabel, { color: isDone ? GREEN : (isActive ? s.color : DIM) }]}
                    numberOfLines={1}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Step header card — desplazable */}
          <View style={[c.stepHeader, { borderLeftColor: step.color }]}>
            <View style={[c.stepIconCircle, { backgroundColor: step.color + "18" }]}>
              <Feather name={step.icon} size={24} color={step.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={c.stepTitle}>{step.title}</Text>
            </View>
          </View>

          {/* Step content */}
          <View style={c.content}>
            {currentStep === 0 && <StepNombre />}
            {currentStep === 1 && <StepUbicacion />}
            {currentStep === 2 && <StepHorario currentSector={currentSector} />}
            {currentStep === 3 && <StepServicios currentSector={currentSector} />}
            {currentStep === 4 && <StepEspacios currentSector={currentSector} />}
            {currentStep === 5 && <StepReservas />}
            {currentStep === 6 && <StepPlano currentSector={currentSector} onOpenEditor={() => setPlanoEditorOpen(true)} />}
            {currentStep === 7 && (
              <StepPublicar
                onOpenVerificacion={onOpenVerificacion}
                onGoToStep={animateToStep}
                onGoToActivity={() => setPhase("activity")}
              />
            )}
          </View>
        </ScrollView>
      </Animated.View>

      {/* ── Footer navigation — solo avance; retroceso via FAB flotante ── */}
      <View style={[c.footer, { paddingBottom: insets.bottom + 12, justifyContent: "flex-end" }]}>
        <TouchableOpacity
          activeOpacity={canProceed ? 0.88 : 1}
          onPress={canProceed ? goNext : undefined}
          style={[c.nextBtn, {
            backgroundColor: canProceed ? GREEN : "rgba(0,0,0,0.10)",
            borderWidth: canProceed ? 0 : 1,
            borderColor: "rgba(0,0,0,0.10)",
          }]}
        >
          <Text style={[c.nextBtnTxt, { color: canProceed ? "#fff" : "rgba(0,0,0,0.30)" }]}>
            {isLast ? t("biz_finish_config") : t("biz_next")}
          </Text>
          <Feather
            name={isLast ? "check-circle" : "arrow-right"}
            size={17}
            color={canProceed ? "#fff" : "rgba(0,0,0,0.25)"}
          />
        </TouchableOpacity>
      </View>

      {/* ── PlanoEmpresaScreen — modal overlay for step 7 ── */}
      <Modal
        visible={planoEditorOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setPlanoEditorOpen(false)}
      >
        <PlanoEmpresaScreen
          businessId="my_business"
          businessName={config.businessName?.trim() || t("biz_my_business")}
          templateId={config.subId ?? undefined}
          onClose={() => setPlanoEditorOpen(false)}
          onNext={() => { setPlanoEditorOpen(false); setTimeout(() => advanceStep(), 120); }}
        />
      </Modal>

    </KeyboardAvoidingView>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 1 — NOMBRE
// ═══════════════════════════════════════════════════════════════════════════════

function StepNombre() {
  const { t } = useLanguage();
  const { config, updateConfig } = useBusinessConfig();
  return (
    <View>
      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{t("biz_visible_name_go")}</Text>
        <TextInput
          style={c.nameInput}
          value={config.businessName ?? ""}
          onChangeText={v => updateConfig({ businessName: v })}
          placeholder={t("biz_name_placeholder")}
          placeholderTextColor={DIM}
          returnKeyType="done"
          autoFocus
          maxLength={60}
        />
        {(config.businessName?.length ?? 0) > 0 && (
          <Text style={c.charCount}>{config.businessName!.length}/60</Text>
        )}
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 2 — UBICACIÓN
// ═══════════════════════════════════════════════════════════════════════════════

function StepUbicacion() {
  const { t } = useLanguage();
  const { config, updateConfig } = useBusinessConfig();

  const handleGPS = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = pos.coords;
      const [geo] = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geo) {
        const parts = [geo.street, geo.streetNumber, geo.city, geo.region].filter(Boolean);
        updateConfig({ address: parts.join(", ") });
      } else {
        updateConfig({ address: `${latitude.toFixed(5)}, ${longitude.toFixed(5)}` });
      }
    } catch { /* ignore */ }
  };

  return (
    <View>
      <View style={c.sectionCard}>
        <TextInput
          style={c.nameInput}
          value={config.address ?? ""}
          onChangeText={v => updateConfig({ address: v })}
          placeholder={t("biz_address_placeholder")}
          placeholderTextColor={DIM}
          returnKeyType="done"
          autoFocus
          maxLength={120}
        />
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={handleGPS} style={c.gpsBtn}>
        <Feather name="navigation" size={15} color={GREEN} />
        <Text style={c.gpsBtnTxt}>{t("biz_use_current_location")}</Text>
      </TouchableOpacity>

      {/* ── Contacto de empresa ─────────────────────────────────────────── */}
      <Text style={[c.sectionLabel, { marginBottom: 8 }]}>{t("biz_contact")}</Text>

      <View style={c.sectionCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#4A80BD18", alignItems: "center", justifyContent: "center" }}>
            <Feather name="phone" size={14} color="#4A80BD" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={c.sectionLabel}>{t("biz_landline")}</Text>
            <TextInput
              style={[c.nameInput, { marginTop: 2 }]}
              value={config.phone ?? ""}
              onChangeText={v => updateConfig({ phone: v })}
              placeholder={t("biz_phone_placeholder")}
              placeholderTextColor={DIM}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </View>
        </View>
      </View>

      <View style={c.sectionCard}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: "#25D36618", alignItems: "center", justifyContent: "center" }}>
            <Feather name="message-circle" size={14} color="#25D366" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={c.sectionLabel}>{t("biz_whatsapp_business")}</Text>
            <TextInput
              style={[c.nameInput, { marginTop: 2 }]}
              value={config.whatsapp ?? ""}
              onChangeText={v => updateConfig({ whatsapp: v })}
              placeholder={t("biz_whatsapp_placeholder")}
              placeholderTextColor={DIM}
              keyboardType="phone-pad"
              returnKeyType="done"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 3 — HORARIOS (day-by-day, copy to other days)
// ═══════════════════════════════════════════════════════════════════════════════

const SCHED_DAYS_SHORT = ["L", "M", "X", "J", "V", "S", "D"];
const SCHED_DAYS_FULL  = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function buildDaysShortT(t: (k: any) => string): string[] {
  return [t("biz_day_mon_short"), t("biz_day_tue_short"), t("biz_day_wed_short"), t("biz_day_thu_short"), t("biz_day_fri_short"), t("biz_day_sat_short"), t("biz_day_sun_short")];
}

function buildDefaultSchedules(openFrom: string, openTo: string): Record<number, DaySchedule> {
  const result: Record<number, DaySchedule> = {};
  for (let i = 0; i < 7; i++) {
    result[i] = {
      shift1: { from: openFrom, to: openTo, active: true },
      shift2: { from: "16:00", to: "20:00", active: false },
    };
  }
  return result;
}

function buildDefaultStaffSchedules(cfg: { daySchedules: Record<string, DaySchedule>; openFrom: string; openTo: string }): Record<string, DaySchedule> {
  const result: Record<string, DaySchedule> = {};
  for (let i = 0; i < 7; i++) {
    const raw = (cfg.daySchedules as any)?.[String(i)];
    if (raw && "shift1" in raw) { result[String(i)] = raw as DaySchedule; continue; }
    result[String(i)] = {
      shift1: { from: cfg.openFrom ?? "09:00", to: cfg.openTo ?? "20:00", active: true },
      shift2: { from: "16:00", to: "20:00", active: false },
    };
  }
  return result;
}

function StepHorario({ currentSector }: { currentSector: Sector | null }) {
  const { t } = useLanguage();
  const SCHED_DAYS_FULL_T  = [t("biz_day_mon_full"), t("biz_day_tue_full"), t("biz_day_wed_full"), t("biz_day_thu_full"), t("biz_day_fri_full"), t("biz_day_sat_full"), t("biz_day_sun_full")];
  const SCHED_DAYS_SHORT_T = buildDaysShortT(t);
  const { config, updateConfig } = useBusinessConfig();
  const color = currentSector?.color ?? PURPLE;
  const [selectedDay, setSelectedDay] = useState(0);

  const [daySchedules, setDaySchedules] = useState<Record<number, DaySchedule>>(() => {
    const stored  = config.daySchedules ?? {};
    const defaults = buildDefaultSchedules(config.openFrom, config.openTo);
    const result: Record<number, DaySchedule> = {};
    for (let i = 0; i < 7; i++) {
      const raw = (stored as Record<string, any>)[String(i)];
      if (!raw) { result[i] = defaults[i]; continue; }
      if ("shift1" in raw) { result[i] = raw as DaySchedule; continue; }
      result[i] = {
        shift1: { from: raw.from ?? config.openFrom, to: raw.to ?? config.openTo, active: true },
        shift2: { from: "16:00", to: "20:00", active: false },
      };
    }
    return result;
  });

  const isActive = (day: number) => config.activeDays.includes(day);

  const saveDaySchedules = (ds: Record<number, DaySchedule>, activeDays: number[]) => {
    const rec: Record<string, DaySchedule> = {};
    let minFrom = "23:59";
    let maxTo   = "00:00";
    for (const day of activeDays) {
      const s = ds[day];
      if (!s) continue;
      if (s.shift1.active) {
        if (s.shift1.from < minFrom) minFrom = s.shift1.from;
        if (s.shift1.to   > maxTo)   maxTo   = s.shift1.to;
      }
      if (s.shift2.active) {
        if (s.shift2.from < minFrom) minFrom = s.shift2.from;
        if (s.shift2.to   > maxTo)   maxTo   = s.shift2.to;
      }
    }
    if (minFrom === "23:59") minFrom = "09:00";
    if (maxTo   === "00:00") maxTo   = "20:00";
    for (let i = 0; i < 7; i++) rec[String(i)] = ds[i];
    updateConfig({ daySchedules: rec, openFrom: minFrom, openTo: maxTo });
  };

  const toggleDay = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    const next = isActive(day)
      ? config.activeDays.filter(d => d !== day)
      : [...config.activeDays, day];
    updateConfig({ activeDays: next });
    saveDaySchedules(daySchedules, next);
  };

  const patchShift = (day: number, shift: "shift1" | "shift2", patch: Partial<DayShift>) => {
    const s = daySchedules[day];
    const upd = { ...daySchedules, [day]: { ...s, [shift]: { ...s[shift], ...patch } } };
    setDaySchedules(upd);
    saveDaySchedules(upd, config.activeDays);
  };

  const copyTo = (days: number[]) => {
    const src = daySchedules[selectedDay];
    if (!src) return;
    const upd = { ...daySchedules };
    for (const d of days) { if (d !== selectedDay) upd[d] = { ...src }; }
    setDaySchedules(upd);
    const newActive = [...new Set([...config.activeDays, ...days])];
    updateConfig({ activeDays: newActive });
    saveDaySchedules(upd, newActive);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleCopy = () => {
    if (!isActive(selectedDay)) return;
    const src = daySchedules[selectedDay];
    const t1s = `${src.shift1.from}–${src.shift1.to}`;
    const t2s = src.shift2.active ? ` · ${src.shift2.from}–${src.shift2.to}` : "";
    Alert.alert(
      t("biz_copy_schedule"),
      `${t("biz_copy_prefix")} ${SCHED_DAYS_FULL_T[selectedDay]} (${t1s}${t2s}) ${t("biz_copy_to_suffix")}`,
      [
        { text: t("biz_weekdays_mon_fri"), onPress: () => copyTo([0, 1, 2, 3, 4]) },
        { text: t("biz_all_days"),         onPress: () => copyTo([0, 1, 2, 3, 4, 5, 6]) },
        { text: t("biz_cancel"), style: "cancel" },
      ]
    );
  };

  const sel       = daySchedules[selectedDay];
  const selActive = isActive(selectedDay);

  return (
    <View>
      <View style={c.sectionCard}>
        {/* Day pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {SCHED_DAYS_SHORT.map((d, idx) => {
              const active = isActive(idx);
              const isSel  = selectedDay === idx;
              return (
                <TouchableOpacity
                  key={d}
                  activeOpacity={0.75}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedDay(idx); }}
                  style={[c.dayPill2, isSel && { backgroundColor: color, borderColor: color }]}
                >
                  <Text style={[c.dayPillTxt2, isSel && { color: "#fff", fontWeight: "700" }]}>{d}</Text>
                  <View style={[c.dayDot, active ? c.dayDotOn : c.dayDotOff]} />
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>

        {/* Selected day title */}
        <Text style={{ fontSize: 18, fontWeight: "700", color: TEXT, marginBottom: 14 }}>
          {SCHED_DAYS_FULL_T[selectedDay]}
        </Text>

        {/* Open / closed toggle */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderTopWidth: 1, borderTopColor: BORDER, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: "600", color: TEXT }}>
              {selActive ? t("biz_open") : t("biz_closed")}
            </Text>
            <Text style={{ fontSize: 12, color: DIM, marginTop: 2 }}>
              {selActive ? t("biz_day_accepts_bookings") : t("biz_day_no_bookings")}
            </Text>
          </View>
          <Switch
            value={selActive}
            onValueChange={() => toggleDay(selectedDay)}
            trackColor={{ false: "#E5E7EB", true: color }}
            thumbColor={Platform.OS === "android" ? (selActive ? "#fff" : "#f4f3f4") : undefined}
            ios_backgroundColor="#E5E7EB"
          />
        </View>

        {/* Shift pickers */}
        {selActive && sel && (
          <>
            {/* Turno 1 */}
            <View style={{ marginTop: 4 }}>
              <Text style={c.shiftLabel}>{t("biz_shift_1")}</Text>
              <View style={[c.timeRow, { paddingTop: 6 }]}>
                <View style={{ flex: 1 }}>
                  <GoTimeField
                    label={t("biz_opening")}
                    value={sel.shift1.from}
                    onConfirm={v => patchShift(selectedDay, "shift1", { from: v })}
                    minuteStep={30}
                    accentColor={color}
                  />
                </View>
                <View style={{ alignItems: "center", paddingTop: 20 }}>
                  <Feather name="arrow-right" size={18} color={DIM} />
                </View>
                <View style={{ flex: 1 }}>
                  <GoTimeField
                    label={t("biz_closing")}
                    value={sel.shift1.to}
                    onConfirm={v => patchShift(selectedDay, "shift1", { to: v })}
                    minuteStep={30}
                    accentColor={color}
                  />
                </View>
              </View>
            </View>

            {/* Turno 2 */}
            {sel.shift2.active ? (
              <View style={{ marginTop: 12 }}>
                <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                  <Text style={[c.shiftLabel, { flex: 1 }]}>{t("biz_shift_2")}</Text>
                  <TouchableOpacity
                    onPress={() => patchShift(selectedDay, "shift2", { active: false })}
                    hitSlop={8}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, color: RED, fontWeight: "600" }}>{t("biz_remove")}</Text>
                  </TouchableOpacity>
                </View>
                <View style={c.timeRow}>
                  <View style={{ flex: 1 }}>
                    <GoTimeField
                      label={t("biz_opening")}
                      value={sel.shift2.from}
                      onConfirm={v => patchShift(selectedDay, "shift2", { from: v })}
                      minuteStep={30}
                      accentColor={color}
                    />
                  </View>
                  <View style={{ alignItems: "center", paddingTop: 20 }}>
                    <Feather name="arrow-right" size={18} color={DIM} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <GoTimeField
                      label={t("biz_closing")}
                      value={sel.shift2.to}
                      onConfirm={v => patchShift(selectedDay, "shift2", { to: v })}
                      minuteStep={30}
                      accentColor={color}
                    />
                  </View>
                </View>
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => patchShift(selectedDay, "shift2", { active: true })}
                activeOpacity={0.75}
                style={c.addShiftBtn}
              >
                <Feather name="plus-circle" size={14} color={color} />
                <Text style={[c.addShiftTxt, { color }]}>{t("biz_add_second_shift")}</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity onPress={handleCopy} activeOpacity={0.75} style={c.copyBtn}>
              <Feather name="copy" size={14} color={color} />
              <Text style={[c.copyBtnTxt, { color }]}>{t("biz_copy_schedule_to_others")}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Weekly summary */}
        <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: BORDER, gap: 8 }}>
          {SCHED_DAYS_SHORT.map((d, idx) => {
            const open  = isActive(idx);
            const times = daySchedules[idx];
            let summary = t("biz_closed");
            if (open && times) {
              const parts: string[] = [];
              if (times.shift1.active) parts.push(`${times.shift1.from}–${times.shift1.to}`);
              if (times.shift2.active) parts.push(`${times.shift2.from}–${times.shift2.to}`);
              summary = parts.join(" · ") || t("biz_open");
            }
            return (
              <View key={d} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: open ? TEXT : DIM, width: 30 }}>{d}</Text>
                <Text style={{ fontSize: 13, color: open ? GRAY : "#FCA5A5" }}>{summary}</Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 4 — ESPACIOS / PROFESIONALES (helpers)
// ═══════════════════════════════════════════════════════════════════════════════

function ProfessionalScheduleSection({
  staffName,
  businessId,
  color,
}: {
  staffName: string;
  businessId: string;
  color: string;
}) {
  const { t } = useLanguage();
  const SCHED_DAYS_FULL_T  = [t("biz_day_mon_full"), t("biz_day_tue_full"), t("biz_day_wed_full"), t("biz_day_thu_full"), t("biz_day_fri_full"), t("biz_day_sat_full"), t("biz_day_sun_full")];
  const SCHED_DAYS_SHORT_T = buildDaysShortT(t);
  const { config, updateConfig } = useBusinessConfig();
  const [expanded,    setExpanded]    = useState(false);
  const [selectedDay, setSelectedDay] = useState(0);

  const stableId = `${businessId}_staff_${staffName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;

  const schedCfg: StaffScheduleConfig = (config.staffSchedules ?? {})[stableId] ?? {
    useCompanySchedule: true,
    daySchedules: {},
  };

  const isCompany = schedCfg.useCompanySchedule;

  // ── Estado local para los turnos — mismo patrón que StepHorario ──────────────
  // Leer el switch directamente del contexto causaba lag visible porque React
  // batching retrasaba el re-render. Estado local hace la UI inmediatamente reactiva.
  const [localDs, setLocalDs] = useState<Record<string, DaySchedule>>(() => {
    // Inicializar con datos guardados del profesional si existen
    const savedCfg = (config.staffSchedules ?? {})[stableId];
    if (savedCfg && !savedCfg.useCompanySchedule && Object.keys(savedCfg.daySchedules ?? {}).length > 0) {
      const result: Record<string, DaySchedule> = {};
      for (let i = 0; i < 7; i++) {
        const saved = (savedCfg.daySchedules as any)?.[String(i)];
        if (saved && "shift1" in saved) { result[String(i)] = saved; continue; }
        const company = (config.daySchedules as any)?.[String(i)];
        result[String(i)] = (company && "shift1" in company) ? company : {
          shift1: { from: config.openFrom ?? "09:00", to: config.openTo ?? "20:00", active: true },
          shift2: { from: "16:00", to: "20:00", active: false },
        };
      }
      return result;
    }
    return buildDefaultStaffSchedules(config as any);
  });

  const getDs = (day: number): DaySchedule =>
    localDs[String(day)] ?? {
      shift1: { from: config.openFrom ?? "09:00", to: config.openTo ?? "20:00", active: true },
      shift2: { from: "16:00", to: "20:00", active: false },
    };

  const saveDs = (ds: Record<string, DaySchedule>) => {
    const next: StaffScheduleConfig = { useCompanySchedule: false, daySchedules: ds };
    updateConfig({ staffSchedules: { ...(config.staffSchedules ?? {}), [stableId]: next } });
  };

  const setMode = (useCompany: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    if (!useCompany) {
      const built = buildDefaultStaffSchedules(config as any);
      setLocalDs(built);
      const next: StaffScheduleConfig = { useCompanySchedule: false, daySchedules: built };
      updateConfig({ staffSchedules: { ...(config.staffSchedules ?? {}), [stableId]: next } });
    } else {
      const next: StaffScheduleConfig = { useCompanySchedule: true, daySchedules: {} };
      updateConfig({ staffSchedules: { ...(config.staffSchedules ?? {}), [stableId]: next } });
    }
  };

  const isDayActive = (day: number) => {
    const ds = getDs(day);
    return ds.shift1.active || ds.shift2.active;
  };

  const toggleDayActive = (day: number) => {
    Haptics.selectionAsync().catch(() => {});
    const ds     = getDs(day);
    const active = ds.shift1.active || ds.shift2.active;
    const nextDs: DaySchedule = active
      ? { shift1: { ...ds.shift1, active: false }, shift2: { ...ds.shift2, active: false } }
      : { shift1: { ...ds.shift1, active: true  }, shift2: ds.shift2 };
    const next = { ...localDs, [String(day)]: nextDs };
    setLocalDs(next);
    saveDs(next);
  };

  const patchDayShift = (day: number, shift: "shift1" | "shift2", patch: Partial<DayShift>) => {
    const ds = getDs(day);
    const nextDs: DaySchedule = { ...ds, [shift]: { ...ds[shift], ...patch } };
    const next = { ...localDs, [String(day)]: nextDs };
    setLocalDs(next);
    saveDs(next);
  };

  const copyToStaffDays = (days: number[]) => {
    const src = getDs(selectedDay);
    const next = { ...localDs };
    for (const d of days) { if (d !== selectedDay) next[String(d)] = { ...src }; }
    setLocalDs(next);
    saveDs(next);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleCopyStaff = () => {
    if (!isDayActive(selectedDay)) return;
    const src = getDs(selectedDay);
    const t1 = `${src.shift1.from}–${src.shift1.to}`;
    const t2 = src.shift2.active ? ` · ${src.shift2.from}–${src.shift2.to}` : "";
    Alert.alert(
      t("biz_copy_schedule"),
      `${t("biz_copy_prefix")} ${SCHED_DAYS_FULL_T[selectedDay]} (${t1}${t2}) ${t("biz_copy_to_suffix")}`,
      [
        { text: t("biz_weekdays_mon_fri"), onPress: () => copyToStaffDays([0, 1, 2, 3, 4]) },
        { text: t("biz_all_days"),         onPress: () => copyToStaffDays([0, 1, 2, 3, 4, 5, 6]) },
        { text: t("biz_cancel"), style: "cancel" },
      ]
    );
  };

  const sel = getDs(selectedDay);

  return (
    <View style={[c.proSchedWrapper, { borderColor: color + "25" }]}>
      <TouchableOpacity
        onPress={() => setExpanded(e => !e)}
        activeOpacity={0.8}
        style={c.proSchedHeader}
      >
        <Feather name="clock" size={12} color={color} />
        <Text style={[c.proSchedHeaderTxt, { color }]}>
          {t("biz_schedule_colon")} {isCompany ? t("biz_company_schedule") : t("biz_custom_schedule")}
        </Text>
        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={12} color={color} />
      </TouchableOpacity>

      {expanded && (
        <View style={{ paddingHorizontal: 4, paddingBottom: 12, gap: 8 }}>
          {/* Mode toggle */}
          <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
            {([t("biz_company_schedule"), t("biz_custom_schedule")] as const).map((label, idx) => {
              const sel2 = idx === 0 ? isCompany : !isCompany;
              return (
                <TouchableOpacity
                  key={label}
                  onPress={() => setMode(idx === 0)}
                  activeOpacity={0.8}
                  style={[c.proSchedModeChip, sel2 && { borderColor: color, backgroundColor: color + "12" }]}
                >
                  <Text style={[c.proSchedModeChipTxt, sel2 && { color, fontWeight: "700" }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {!isCompany && (
            <>
              {/* Day pills */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={{ flexDirection: "row", gap: 5 }}>
                  {SCHED_DAYS_SHORT.map((d, idx) => {
                    const active = isDayActive(idx);
                    const isSel  = selectedDay === idx;
                    return (
                      <TouchableOpacity
                        key={d}
                        activeOpacity={0.75}
                        onPress={() => setSelectedDay(idx)}
                        style={[
                          c.proSchedDayPill,
                          isSel && { backgroundColor: color, borderColor: color },
                          !active && !isSel && { opacity: 0.35 },
                        ]}
                      >
                        <Text style={[c.proSchedDayTxt, isSel && { color: "#fff", fontWeight: "700" }]}>{d}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>

              {/* Day active toggle */}
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{ flex: 1, fontSize: 12, fontWeight: "600", color: TEXT }}>
                  {SCHED_DAYS_FULL_T[selectedDay]}: {isDayActive(selectedDay) ? t("biz_active") : t("biz_free")}
                </Text>
                <Switch
                  value={isDayActive(selectedDay)}
                  onValueChange={() => toggleDayActive(selectedDay)}
                  trackColor={{ false: "#E5E7EB", true: color }}
                  thumbColor={Platform.OS === "android" ? "#fff" : undefined}
                  ios_backgroundColor="#E5E7EB"
                  style={{ transform: [{ scale: 0.8 }] }}
                />
              </View>

              {/* Shift pickers */}
              {isDayActive(selectedDay) && (
                <>
                  <View style={[c.timeRow, { paddingTop: 0 }]}>
                    <View style={{ flex: 1 }}>
                      <GoTimeField label={t("biz_shift_1_start")} value={sel.shift1.from}
                        onConfirm={v => patchDayShift(selectedDay, "shift1", { from: v })} minuteStep={30} accentColor={color} />
                    </View>
                    <View style={{ alignItems: "center", paddingTop: 20 }}>
                      <Feather name="arrow-right" size={14} color={DIM} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <GoTimeField label={t("biz_shift_1_end")} value={sel.shift1.to}
                        onConfirm={v => patchDayShift(selectedDay, "shift1", { to: v })} minuteStep={30} accentColor={color} />
                    </View>
                  </View>

                  {sel.shift2.active ? (
                    <View>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                        <Text style={[c.shiftLabel, { flex: 1, fontSize: 11 }]}>{t("biz_shift_2")}</Text>
                        <TouchableOpacity onPress={() => patchDayShift(selectedDay, "shift2", { active: false })} hitSlop={8}>
                          <Text style={{ fontSize: 11, color: RED, fontWeight: "600" }}>{t("biz_remove")}</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={c.timeRow}>
                        <View style={{ flex: 1 }}>
                          <GoTimeField label={t("biz_shift_2_start")} value={sel.shift2.from}
                            onConfirm={v => patchDayShift(selectedDay, "shift2", { from: v })} minuteStep={30} accentColor={color} />
                        </View>
                        <View style={{ alignItems: "center", paddingTop: 20 }}>
                          <Feather name="arrow-right" size={14} color={DIM} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <GoTimeField label={t("biz_shift_2_end")} value={sel.shift2.to}
                            onConfirm={v => patchDayShift(selectedDay, "shift2", { to: v })} minuteStep={30} accentColor={color} />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <TouchableOpacity
                      onPress={() => patchDayShift(selectedDay, "shift2", { active: true })}
                      activeOpacity={0.75}
                      style={c.addShiftBtn}
                    >
                      <Feather name="plus-circle" size={11} color={color} />
                      <Text style={[c.addShiftTxt, { color, fontSize: 11 }]}>{t("biz_add_2nd_shift")}</Text>
                    </TouchableOpacity>
                  )}

                  {/* Copiar horario a otros días */}
                  <TouchableOpacity
                    onPress={handleCopyStaff}
                    activeOpacity={0.75}
                    style={c.copyBtn}
                  >
                    <Feather name="copy" size={14} color={color} />
                    <Text style={[c.copyBtnTxt, { color }]}>{t("biz_copy_schedule_to_others")}</Text>
                  </TouchableOpacity>
                </>
              )}
            </>
          )}
        </View>
      )}
    </View>
  );
}

function StepEspacios({ currentSector }: { currentSector: Sector | null }) {
  const { t, lang } = useLanguage();
  const { config, updateConfig } = useBusinessConfig();
  const [addingNew,    setAddingNew]    = useState(false);
  const [newLabel,     setNewLabel]     = useState("");
  const [newEmoji,     setNewEmoji]     = useState("🪑");

  // Sustitución inline: qué slot se está sustituyendo y nombre temporal
  const [substituting, setSubstituting] = useState<{
    itemId: string;
    slotIdx: number;
    tempName: string;
  } | null>(null);

  // Picker de emoji por slot individual
  const [staffEmojiPicker, setStaffEmojiPicker] = useState<{
    itemId: string;
    slotIdx: number;
  } | null>(null);

  // Draft names: while the user is typing, we only update this local map.
  // The real patchStaffName is only called on blur / submit to avoid creating
  // partial-name professionals on every keystroke.
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});

  // ── LOCAL state for items — avoids stale-closure bugs on remove→add cycles ──
  const [items, setItemsLocal] = useState<PlantillaItem[]>(() => config.plantillaItems);

  // Tracks whether the latest items change came from a local user interaction
  // (vs. a sync from the context). Only local changes should write back to config.
  const localChangedRef = useRef(false);

  // setItems marks the change as local, then updates state.
  // NOTE: updateConfig is NOT called here (inside the updater) to avoid the
  // React anti-pattern of triggering a second setState from inside a state
  // updater, which in React 18 concurrent mode can fire multiple times.
  const setItems = useCallback((fn: PlantillaItem[] | ((prev: PlantillaItem[]) => PlantillaItem[])) => {
    localChangedRef.current = true;
    setItemsLocal(fn);
  }, []);

  // After every render, if items changed locally, persist to config.
  // This runs AFTER the render, outside any updater, so it is safe.
  useEffect(() => {
    if (!localChangedRef.current) return;
    localChangedRef.current = false;
    updateConfig({ plantillaItems: items });
  }, [items, updateConfig]);

  // If context is reset externally (e.g. resetToSubActivity), pull the latest
  // value in. Mark as NOT local so the above effect does not write it back.
  const prevConfigItems = useRef(config.plantillaItems);
  useEffect(() => {
    if (config.plantillaItems !== prevConfigItems.current) {
      prevConfigItems.current = config.plantillaItems;
      // localChangedRef.current stays false → the save effect will be a no-op
      setItemsLocal(config.plantillaItems);
    }
  }, [config.plantillaItems]);

  const color    = currentSector?.color ?? BLUE;
  const addLabel = getAddLabel(config.subId);
  const sectorId = SUB_TO_SECTOR[config.subId ?? ""] ?? "";
  const isPeople = PEOPLE_SECTORS.has(sectorId);

  // Services defined in the previous step
  const availableServices = (config.services ?? []).filter(s => s.name.trim());

  const removeItem = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.filter(it => it.id !== id));
  };

  // Elimina un slot individual (una persona) dentro de un ítem
  const removeSlot = (itemId: string, slotIdx: number) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setItems(prev => prev.flatMap(it => {
      if (it.id !== itemId) return [it];
      const newCount      = it.count - 1;
      if (newCount <= 0) {
        // For people sectors, keep the container so "Add professional" stays visible.
        if (isPeople) return [{ ...it, count: 0, staffNames: [], staffServices: [], staffEmojis: [] }];
        return [];
      }
      const staffNames    = [...(it.staffNames ?? [])];
      staffNames.splice(slotIdx, 1);
      const staffServices = [...(it.staffServices ?? [])];
      staffServices.splice(slotIdx, 1);
      const staffEmojis   = [...(it.staffEmojis ?? [])];
      staffEmojis.splice(slotIdx, 1);
      return [{ ...it, count: newCount, staffNames, staffServices, staffEmojis }];
    }));
  };

  // Añade un slot vacío a un ítem existente (sólo sectores de personas)
  const addSlot = (itemId: string) => {
    Haptics.selectionAsync().catch(() => {});
    const defaultEmoji = getDefaultStaffEmoji(config.subId);
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      return {
        ...it,
        count:        it.count + 1,
        staffNames:   [...(it.staffNames ?? []), ""],
        staffServices:[...(it.staffServices ?? []), []],
        staffEmojis:  [...(it.staffEmojis ?? []), defaultEmoji],
      };
    }));
  };

  // Actualiza el emoji individual de un slot
  const patchStaffEmoji = (itemId: string, slotIdx: number, emoji: string) => {
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const staffEmojis = [...(it.staffEmojis ?? Array.from({ length: it.count }, () => getDefaultStaffEmoji(config.subId)))];
      staffEmojis[slotIdx] = emoji;
      return { ...it, staffEmojis };
    }));
  };

  // Confirma la sustitución: solo cambia el nombre, todo lo demás se mantiene
  const commitSubstitution = () => {
    if (!substituting) return;
    const { itemId, slotIdx, tempName } = substituting;
    // Aplicar mismo guard que patchStaffName: no persistir si < 3 chars
    const committed = tempName.trim().length >= 3 ? tempName.trim() : "";
    setItems(prev => prev.map(it => {
      if (it.id !== itemId) return it;
      const names = [...(it.staffNames ?? Array.from({ length: it.count }, () => ""))];
      names[slotIdx] = committed;
      return { ...it, staffNames: names };
    }));
    setSubstituting(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const patchCount = (id: string, delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const newCount   = Math.max(1, it.count + delta);
      const staffNames = delta > 0
        ? [...(it.staffNames ?? []), ...Array.from({ length: newCount - (it.staffNames?.length ?? 0) }, () => "")]
        : (it.staffNames ?? []).slice(0, newCount);
      const staffServices = delta > 0
        ? [...(it.staffServices ?? []), ...Array.from({ length: newCount - (it.staffServices?.length ?? 0) }, () => [] as string[])]
        : (it.staffServices ?? []).slice(0, newCount);
      return { ...it, count: newCount, staffNames, staffServices };
    }));
  };

  const patchLabel = (id: string, label: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, label } : it));

  const patchStaffName = (id: string, index: number, name: string) => {
    // Solo persistir el nombre si tiene >= 3 chars tras trim.
    // Si el usuario borra todo o deja <= 2 chars, se guarda cadena vacía
    // (slot vacío, se puede re-editar). Esto evita que parciales de tipado
    // como "I" o "Is" se almacenen como profesionales reales.
    const committed = name.trim().length >= 3 ? name.trim() : "";
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const names = [...(it.staffNames ?? Array.from({ length: it.count }, () => ""))];
      names[index] = committed;
      return { ...it, staffNames: names };
    }));
  };

  const toggleStaffService = (id: string, slotIdx: number, serviceName: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const allSlots: string[][] = it.staffServices
        ? it.staffServices.map(s => [...s])
        : Array.from({ length: it.count }, () => []);
      while (allSlots.length < it.count) allSlots.push([]);
      const slot = allSlots[slotIdx] ?? [];
      allSlots[slotIdx] = slot.includes(serviceName)
        ? slot.filter(s => s !== serviceName)
        : [...slot, serviceName];
      return { ...it, staffServices: allSlots };
    }));
  };

  const cycleEmoji = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const idx = EMOJI_PALETTE.indexOf(it.emoji);
      return { ...it, emoji: EMOJI_PALETTE[(idx + 1) % EMOJI_PALETTE.length] };
    }));
  };

  const commitNew = () => {
    if (!newLabel.trim()) return;
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => [
      ...prev,
      {
        id:           `pi_${Date.now()}`,
        emoji:        newEmoji,
        label:        newLabel.trim(),
        count:        1,
        staffNames:   [""],
        staffServices: [[]],
      },
    ]);
    setNewLabel("");
    setNewEmoji("🪑");
    setAddingNew(false);
  };

  return (
    <View>
      {currentSector && (
        <View style={[c.sectionCard, { borderLeftWidth: 3, borderLeftColor: color }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text style={{ fontSize: 20 }}>{currentSector.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text style={[c.sectionLabel, { color }]}>
                {(() => { const sub = currentSector.subs.find(s => s.id === config.subId); return sub ? getSubName(sub, lang) : getSectorLabel(currentSector, lang); })()}
              </Text>
            </View>
          </View>
        </View>
      )}

      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{isPeople ? t("biz_professionals") : t("biz_spaces_zones")}</Text>

        {items.length === 0 && !addingNew && (
          <View style={c.emptyRow}>
            <Feather name="inbox" size={18} color={DIM} />
            <Text style={c.emptyTxt}>
              {isPeople
                ? t("biz_no_professionals_hint")
                : t("biz_no_spaces_hint")}
            </Text>
          </View>
        )}

        {items.length === 0 && !addingNew && isPeople && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              const defaultEmoji = getDefaultStaffEmoji(config.subId);
              setItems([{
                id:            `pi_${Date.now()}`,
                emoji:         defaultEmoji,
                label:         "",
                count:         1,
                staffNames:    [""],
                staffServices: [[]],
                staffEmojis:   [defaultEmoji],
              }]);
            }}
            style={[c.addSlotBtn, { borderColor: color + "40", marginTop: 4 }]}
          >
            <Feather name="user-plus" size={13} color={color} />
            <Text style={[c.addSlotTxt, { color }]}>{t("biz_add_professional")}</Text>
          </TouchableOpacity>
        )}

        {items.map(item => (
          <View key={item.id}>
            {/* ── Item header row ── */}
            <View style={[c.itemRow, { borderColor: color + "25", backgroundColor: color + "04" }]}>
              <TouchableOpacity onPress={() => cycleEmoji(item.id)} hitSlop={8} activeOpacity={0.6}>
                <Text style={{ fontSize: 20, minWidth: 28, textAlign: "center" }}>{item.emoji}</Text>
              </TouchableOpacity>
              <TextInput
                style={[c.itemInput, { flex: 1 }]}
                value={item.label}
                onChangeText={v => patchLabel(item.id, v)}
                placeholder={t("biz_space_name_placeholder")}
                placeholderTextColor={DIM}
                returnKeyType="done"
                multiline
              />
              {/* Sectores de espacios: contador con + y -. Personas: solo la ❌ del ítem. */}
              {!isPeople && (
                <View style={c.counter}>
                  <TouchableOpacity
                    onPress={() => patchCount(item.id, -1)}
                    hitSlop={8}
                    activeOpacity={0.7}
                    style={[c.counterBtn, item.count <= 1 && { opacity: 0.3 }]}
                    disabled={item.count <= 1}
                  >
                    <Feather name="minus" size={12} color={BLUE} />
                  </TouchableOpacity>
                  <Text style={c.counterNum}>{item.count}</Text>
                  <TouchableOpacity onPress={() => patchCount(item.id, 1)} hitSlop={8} activeOpacity={0.7} style={c.counterBtn}>
                    <Feather name="plus" size={12} color={BLUE} />
                  </TouchableOpacity>
                </View>
              )}
              <TouchableOpacity onPress={() => removeItem(item.id)} hitSlop={10} activeOpacity={0.7} style={c.deleteBtn}>
                <Feather name="x" size={15} color={DIM} />
              </TouchableOpacity>
            </View>

            {/* ── Botón ÚNICO "Añadir profesional" justo debajo de la cabecera ── */}
            {isPeople && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => addSlot(item.id)}
                style={[c.addSlotBtn, { borderColor: color + "40" }]}
              >
                <Feather name="user-plus" size={13} color={color} />
                <Text style={[c.addSlotTxt, { color }]}>{t("biz_add_professional")}</Text>
              </TouchableOpacity>
            )}

            {/* ── Slots individuales de profesionales (isPeople only) ── */}
            {isPeople && Array.from({ length: item.count }, (_, i) => {
              const nameVal      = item.staffNames?.[i] ?? "";
              const isEmpty      = !nameVal.trim();
              const slotServices = item.staffServices?.[i] ?? [];
              const isSub        = substituting?.itemId === item.id && substituting.slotIdx === i;

              const askRemoveOrSubstitute = () => {
                const displayName = nameVal.trim() || (lang === "en" ? `Professional ${i + 1}` : `Profesional ${i + 1}`);
                Haptics.selectionAsync().catch(() => {});
                Alert.alert(
                  lang === "en" ? `What to do with "${displayName}"?` : `¿Qué hacer con "${displayName}"?`,
                  t("biz_slot_action_title"),
                  [
                    { text: t("biz_cancel"), style: "cancel" },
                    {
                      text: t("biz_replace_person"),
                      onPress: () => setSubstituting({ itemId: item.id, slotIdx: i, tempName: "" }),
                    },
                    {
                      text: t("biz_delete_slot"),
                      style: "destructive",
                      onPress: () => {
                        Alert.alert(
                          lang === "en" ? `Delete "${displayName}"` : `Eliminar "${displayName}"`,
                          t("biz_delete_slot_confirm"),
                          [
                            { text: t("biz_cancel"), style: "cancel" },
                            { text: t("biz_delete_slot"), style: "destructive", onPress: () => removeSlot(item.id, i) },
                          ]
                        );
                      },
                    },
                  ]
                );
              };

              return (
                <View
                  key={`${item.id}_slot_${i}`}
                  style={[
                    c.staffSlot,
                    isSub
                      ? { borderColor: BLUE + "70", backgroundColor: BLUE + "05" }
                      : isEmpty
                        ? { borderColor: GOLD + "70", backgroundColor: GOLD + "06" }
                        : { borderColor: color + "30", backgroundColor: color + "04" },
                  ]}
                >
                  {/* ── Modo sustitución: reemplazar nombre manteniendo todo lo demás ── */}
                  {isSub ? (
                    <View style={{ gap: 10 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <Text style={{ fontSize: 20 }}>{item.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={[c.staffNameLabel, { color: BLUE }]}>
                            {lang === "en" ? `Substitute ${nameVal.trim() || `Professional ${i + 1}`}` : `Sustituir a ${nameVal.trim() || `Profesional ${i + 1}`}`}
                          </Text>
                          <TextInput
                            style={[c.staffNameInput, { borderColor: BLUE + "60", backgroundColor: BLUE + "06" }]}
                            value={substituting!.tempName}
                            onChangeText={v => setSubstituting(s => s ? { ...s, tempName: v } : s)}
                            placeholder={t("biz_new_professional_ph")}
                            placeholderTextColor={BLUE + "88"}
                            returnKeyType="done"
                            onSubmitEditing={commitSubstitution}
                            autoFocus
                            autoCorrect={false}
                          />
                        </View>
                      </View>
                      <Text style={{ fontSize: 11, color: DIM, paddingLeft: 30 }}>
                        {t("biz_keep_specialties_hint")}
                      </Text>
                      <View style={{ flexDirection: "row", gap: 10, paddingLeft: 30 }}>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={commitSubstitution}
                          style={[c.subConfirmBtn, { backgroundColor: BLUE }]}
                        >
                          <Feather name="check" size={13} color="#fff" />
                          <Text style={c.subConfirmTxt}>{t("biz_confirm_substitution")}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => setSubstituting(null)}
                          style={c.subCancelBtn}
                        >
                          <Text style={c.subCancelTxt}>{t("biz_cancel")}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  ) : (
                    <>
                      {/* ── Nombre del profesional + ❌ ── */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setStaffEmojiPicker({ itemId: item.id, slotIdx: i });
                          }}
                          style={{
                            width: 36, height: 36, borderRadius: 10,
                            borderWidth: 1.5, borderColor: color + "40",
                            backgroundColor: color + "08",
                            alignItems: "center", justifyContent: "center",
                          }}
                        >
                          <Text style={{ fontSize: 20 }}>
                            {(item.staffEmojis?.[i]) || getDefaultStaffEmoji(config.subId)}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          style={[
                            c.staffNameBig,
                            isEmpty
                              ? { borderColor: GOLD + "60", backgroundColor: GOLD + "08", color: GOLD }
                              : { borderColor: "transparent", backgroundColor: "transparent" },
                          ]}
                          value={draftNames[`${item.id}_${i}`] ?? nameVal}
                          onChangeText={v => setDraftNames(prev => ({ ...prev, [`${item.id}_${i}`]: v }))}
                          onBlur={() => {
                            const draft = draftNames[`${item.id}_${i}`];
                            if (draft !== undefined) {
                              patchStaffName(item.id, i, draft);
                              setDraftNames(prev => { const n = { ...prev }; delete n[`${item.id}_${i}`]; return n; });
                            }
                          }}
                          onSubmitEditing={() => {
                            const draft = draftNames[`${item.id}_${i}`];
                            if (draft !== undefined) {
                              patchStaffName(item.id, i, draft);
                              setDraftNames(prev => { const n = { ...prev }; delete n[`${item.id}_${i}`]; return n; });
                            }
                          }}
                          placeholder={t("biz_professional_name_ph")}
                          placeholderTextColor={DIM}
                          returnKeyType="done"
                          autoCorrect={false}
                        />
                        <TouchableOpacity
                          onPress={askRemoveOrSubstitute}
                          hitSlop={10}
                          activeOpacity={0.7}
                          style={c.slotDeleteBtn}
                        >
                          <Feather name="x" size={14} color={DIM} />
                        </TouchableOpacity>
                      </View>

                      {/* ── Especialidades ── */}
                      {availableServices.length > 0 && (
                        <View style={{ paddingLeft: 32 }}>
                          <Text style={c.staffSvcLabel}>{t("biz_specialties")}</Text>
                          <View style={c.staffSvcList}>
                            {availableServices.map(svc => {
                              const checked = slotServices.includes(svc.name);
                              return (
                                <TouchableOpacity
                                  key={svc.name}
                                  activeOpacity={0.75}
                                  onPress={() => toggleStaffService(item.id, i, svc.name)}
                                  style={[c.staffSvcChip, checked && { borderColor: color, backgroundColor: color + "10" }]}
                                >
                                  <View style={[c.staffSvcCheck, checked && { backgroundColor: color, borderColor: color }]}>
                                    {checked && <Feather name="check" size={9} color="#fff" />}
                                  </View>
                                  <Text style={[c.staffSvcName, checked && { color, fontWeight: "700" }]} numberOfLines={1}>
                                    {trSector(svc.name, lang)}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      )}

                      {/* ── Horario personalizado del profesional ── */}
                      {!isEmpty && config.businessId && (
                        <View style={{ marginTop: 8 }}>
                          <ProfessionalScheduleSection
                            staffName={nameVal.trim()}
                            businessId={config.businessId}
                            color={color}
                          />
                        </View>
                      )}
                    </>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {/* Para sectores de espacios: formulario para añadir un nuevo tipo de espacio */}
        {!isPeople && (addingNew ? (
          <View style={[c.itemRow, { flexDirection: "column", alignItems: "stretch", borderColor: BLUE + "40", backgroundColor: BLUE + "04", gap: 10 }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {EMOJI_PALETTE.map(em => (
                  <TouchableOpacity
                    key={em}
                    activeOpacity={0.7}
                    onPress={() => setNewEmoji(em)}
                    style={[c.emojiChip, newEmoji === em && { borderColor: BLUE, backgroundColor: BLUE + "12" }]}
                  >
                    <Text style={{ fontSize: 18 }}>{em}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <TextInput
              style={c.itemInput}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder={t("biz_space_name_placeholder")}
              placeholderTextColor={DIM}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={commitNew}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity activeOpacity={0.8} onPress={commitNew} style={c.addBtn}>
                <Feather name="check" size={14} color={BLUE} />
                <Text style={c.addBtnTxt}>{t("biz_add")}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => { setAddingNew(false); setNewLabel(""); setNewEmoji("🪑"); }}
                style={{ paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center" }}
              >
                <Text style={{ fontSize: 13, color: DIM, fontWeight: "600" }}>{t("biz_cancel")}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setAddingNew(true); }}
            style={c.addBtn}
          >
            <Feather name="plus" size={14} color={BLUE} />
            <Text style={c.addBtnTxt}>{addLabel}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── Picker de emoji por profesional ── */}
      <Modal
        visible={!!staffEmojiPicker}
        transparent
        animationType="slide"
        onRequestClose={() => setStaffEmojiPicker(null)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.35)" }}
          activeOpacity={1}
          onPress={() => setStaffEmojiPicker(null)}
        />
        <View style={{
          backgroundColor: "#fff",
          borderTopLeftRadius: 20, borderTopRightRadius: 20,
          paddingTop: 14, paddingBottom: 32, paddingHorizontal: 16,
        }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: "#111", letterSpacing: 0.3 }}>
              {t("biz_staff_icon")}
            </Text>
            <TouchableOpacity onPress={() => setStaffEmojiPicker(null)} hitSlop={10}>
              <Feather name="x" size={18} color="#6B7280" />
            </TouchableOpacity>
          </View>
          <Text style={{ fontSize: 11, color: "#9CA3AF", marginBottom: 10 }}>
            {t("biz_staff_icon_hint")}
          </Text>
          <ScrollView horizontal={false} showsVerticalScrollIndicator={false} style={{ maxHeight: 220 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {getStaffEmojiPalette(config.subId).map(em => {
                const isSelected = staffEmojiPicker
                  ? (items.find(it => it.id === staffEmojiPicker.itemId)?.staffEmojis?.[staffEmojiPicker.slotIdx] ?? getDefaultStaffEmoji(config.subId)) === em
                  : false;
                return (
                  <TouchableOpacity
                    key={em}
                    activeOpacity={0.7}
                    onPress={() => {
                      if (!staffEmojiPicker) return;
                      Haptics.selectionAsync().catch(() => {});
                      patchStaffEmoji(staffEmojiPicker.itemId, staffEmojiPicker.slotIdx, em);
                      setStaffEmojiPicker(null);
                    }}
                    style={[
                      c.emojiChip,
                      { width: 44, height: 44, borderRadius: 12 },
                      isSelected && { borderColor: color, backgroundColor: color + "15" },
                    ]}
                  >
                    <Text style={{ fontSize: 22 }}>{em}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </ScrollView>
        </View>
      </Modal>

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 4 — SERVICIOS
// ═══════════════════════════════════════════════════════════════════════════════

function StepServicios({ currentSector }: { currentSector: Sector | null }) {
  const { config, updateConfig } = useBusinessConfig();
  const { t, lang } = useLanguage();
  const color = currentSector?.color ?? BLUE;

  type LocalSvc = SavedService & { id: string };
  const [localSvcs, setLocalSvcs] = useState<LocalSvc[]>(() =>
    config.services.length > 0
      ? config.services.map((s, i) => ({ ...s, id: `svc_${i}_${s.name}`, capacity: s.capacity ?? 1 }))
      : [{ id: "svc_0", name: "", duration: 30, price: 0, capacity: 1 }]
  );

  // ── OCR import state ────────────────────────────────────────────────────────
  const [ocrVisible,   setOcrVisible]   = useState(false);
  const [ocrSourceUri, setOcrSourceUri] = useState<string | null>(null);
  const [ocrIsPdf,     setOcrIsPdf]     = useState(false);
  const [ocrIsUrl,     setOcrIsUrl]     = useState(false);

  const flush = useCallback((svcs: LocalSvc[]) => {
    updateConfig({
      services: svcs
        .filter(s => s.name.trim())
        .map(({ name, duration, price, capacity }) => ({ name, duration, price, capacity })),
    });
  }, [updateConfig]);

  const patchSvc = (id: string, patch: Partial<SavedService>) =>
    setLocalSvcs(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));

  const removeSvc = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setLocalSvcs(prev => { const next = prev.filter(s => s.id !== id); flush(next); return next; });
  };
  const addSvc = () => {
    Haptics.selectionAsync().catch(() => {});
    setLocalSvcs(prev => [...prev, { id: `svc_${Date.now()}`, name: "", duration: 30, price: 0, capacity: 1 }]);
  };

  // ── OCR: launch image picker ────────────────────────────────────────────────
  const launchImagePicker = async (useCamera: boolean) => {
    try {
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Necesitamos acceso a la cámara para fotografiar tu tarifa.");
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== "granted") {
          Alert.alert("Permiso denegado", "Necesitamos acceso a la galería para seleccionar tu tarifa.");
          return;
        }
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ["images"],
            quality: 0.85,
            allowsEditing: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ["images"],
            quality: 0.85,
            allowsEditing: false,
          });

      if (!result.canceled && result.assets[0]) {
        setOcrSourceUri(result.assets[0].uri);
        setOcrIsPdf(false);
        setOcrVisible(true);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir la cámara. Inténtalo de nuevo.");
    }
  };

  const handleImageImport = () => {
    Haptics.selectionAsync().catch(() => {});
    Alert.alert(
      "Importar tarifa",
      "¿Cómo quieres obtener la imagen de tu tarifa?",
      [
        { text: "📷  Cámara",  onPress: () => launchImagePicker(true)  },
        { text: "🖼️  Galería", onPress: () => launchImagePicker(false) },
        { text: t("biz_cancel"), style: "cancel" },
      ]
    );
  };

  // ── OCR: launch PDF picker ──────────────────────────────────────────────────
  const handlePdfImport = async () => {
    Haptics.selectionAsync().catch(() => {});
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });
      if (!result.canceled && result.assets?.[0]) {
        setOcrIsUrl(false);
        setOcrSourceUri(result.assets[0].uri);
        setOcrIsPdf(true);
        setOcrVisible(true);
      }
    } catch {
      Alert.alert("Error", "No se pudo abrir el selector de archivos.");
    }
  };

  // ── OCR: launch URL import ──────────────────────────────────────────────────
  const handleUrlImport = () => {
    Haptics.selectionAsync().catch(() => {});
    setOcrSourceUri(null);
    setOcrIsPdf(false);
    setOcrIsUrl(true);
    setOcrVisible(true);
  };

  // ── OCR: import confirmed services ──────────────────────────────────────────
  const handleOcrImport = (newServices: SavedService[]) => {
    const existing = localSvcs.filter(s => s.name.trim());
    const merged: LocalSvc[] = [
      ...existing,
      ...newServices.map((s, i) => ({
        ...s,
        id:       `ocr_${Date.now()}_${i}`,
        capacity: s.capacity ?? 1,
      })),
    ];
    setLocalSvcs(merged);
    flush(merged);
    setOcrIsUrl(false);
    setOcrVisible(false);
  };

  return (
    <View>
      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{t("biz_services_offered")}</Text>

        {localSvcs.map((svc, idx) => (
          <View key={svc.id} style={c.svcRow}>
            <TextInput
              style={c.svcNameInput}
              value={trSector(svc.name, lang)}
              onChangeText={v => patchSvc(svc.id, { name: v })}
              onBlur={() => flush(localSvcs)}
              placeholder={idx === 0 ? t("biz_service_placeholder_first") : t("biz_service_placeholder")}
              placeholderTextColor={DIM}
              returnKeyType="done"
            />
            <View style={c.svcMeta}>
              <View style={c.numBox}>
                <TextInput
                  style={c.numInput}
                  value={String(svc.duration)}
                  onChangeText={v => patchSvc(svc.id, { duration: parseInt(v) || 0 })}
                  onBlur={() => flush(localSvcs)}
                  selectTextOnFocus
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <Text style={c.numUnit}>min</Text>
              </View>
              <View style={c.numBox}>
                <TextInput
                  style={c.numInput}
                  value={svc.price ? String(svc.price) : ""}
                  onChangeText={v => patchSvc(svc.id, { price: parseFloat(v) || 0 })}
                  onBlur={() => flush(localSvcs)}
                  selectTextOnFocus
                  keyboardType="numeric"
                  returnKeyType="done"
                  placeholder="0"
                  placeholderTextColor={DIM}
                />
                <Text style={c.numUnit}>€</Text>
              </View>
              <View style={c.numBox}>
                <TextInput
                  style={c.numInput}
                  value={String(svc.capacity ?? 1)}
                  onChangeText={v => patchSvc(svc.id, { capacity: parseInt(v) || 1 })}
                  onBlur={() => flush(localSvcs)}
                  selectTextOnFocus
                  keyboardType="numeric"
                  returnKeyType="done"
                />
                <Text style={c.numUnit}>cap</Text>
              </View>
              {localSvcs.length > 1 && (
                <TouchableOpacity onPress={() => removeSvc(svc.id)} hitSlop={8} activeOpacity={0.7}>
                  <Feather name="x" size={16} color={DIM} />
                </TouchableOpacity>
              )}
            </View>
          </View>
        ))}

        <TouchableOpacity onPress={addSvc} activeOpacity={0.8} style={c.addBtn}>
          <Feather name="plus" size={14} color={BLUE} />
          <Text style={c.addBtnTxt}>{t("biz_add_service_btn")}</Text>
        </TouchableOpacity>
      </View>

      {/* ── OCR Import section ───────────────────────────────────────────────── */}
      <View style={c.importCard}>
        {/* Divider */}
        <View style={c.importDividerRow}>
          <View style={c.importDividerLine} />
          <Text style={c.importDividerTxt}>{t("biz_import_from_price_list")}</Text>
          <View style={c.importDividerLine} />
        </View>

        {/* Import buttons */}
        <View style={c.importBtnsRow}>
          {/* Image */}
          <TouchableOpacity
            onPress={handleImageImport}
            activeOpacity={0.8}
            style={c.importBtn}
          >
            <View style={[c.importBtnIconWrap, { backgroundColor: BLUE + "12" }]}>
              <Feather name="camera" size={20} color={BLUE} />
            </View>
            <Text style={c.importBtnLabel}>{t("biz_import_image_label")}</Text>
            <Text style={c.importBtnSub}>{t("biz_import_image_sub")}</Text>
          </TouchableOpacity>

          <View style={c.importBtnSep} />

          {/* PDF */}
          <TouchableOpacity
            onPress={handlePdfImport}
            activeOpacity={0.8}
            style={c.importBtn}
          >
            <View style={[c.importBtnIconWrap, { backgroundColor: PURPLE + "12" }]}>
              <Feather name="file-text" size={20} color={PURPLE} />
            </View>
            <Text style={c.importBtnLabel}>{t("biz_import_pdf_label")}</Text>
            <Text style={c.importBtnSub}>{t("biz_import_pdf_sub")}</Text>
          </TouchableOpacity>
        </View>

        {/* URL import — ancho completo */}
        <TouchableOpacity
          onPress={handleUrlImport}
          activeOpacity={0.8}
          style={c.importUrlBtn}
        >
          <View style={[c.importBtnIconWrap, { backgroundColor: GREEN + "12", width: 36, height: 36, borderRadius: 10 }]}>
            <Feather name="globe" size={17} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={c.importBtnLabel}>{t("biz_import_link_label")}</Text>
            <Text style={c.importBtnSub}>{t("biz_import_link_sub")}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={GREEN} />
        </TouchableOpacity>

        {/* Helper text */}
        <View style={c.importHelperRow}>
          <Feather name="zap" size={11} color={GOLD} />
          <Text style={c.importHelperTxt}>
            GO detectará nombres, precios y duraciones automáticamente. Podrás revisar y corregir antes de guardar.
          </Text>
        </View>
      </View>

      {/* OCR Review Sheet */}
      <GoOcrImportSheet
        visible={ocrVisible}
        sourceUri={ocrSourceUri}
        isPdf={ocrIsPdf}
        isUrl={ocrIsUrl}
        onClose={() => { setOcrVisible(false); setOcrIsUrl(false); }}
        onImport={handleOcrImport}
      />
    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 5 — RESERVAS
// ═══════════════════════════════════════════════════════════════════════════════

function StepReservas() {
  const { t } = useLanguage();
  const { config, updateConfig } = useBusinessConfig();
  const PAYMENT_OPTS = buildPaymentOptsCfg(t);
  const CANCEL_OPTS  = buildCancelOptsCfg(t);
  const sinPago = config.paymentPolicy === 0;

  return (
    <View>
      <PolicySection
        title={t("biz_booking_type")}
        opts={PAYMENT_OPTS}
        value={config.paymentPolicy}
        onChange={v => updateConfig({ paymentPolicy: v })}
        color={GOLD}
      />

      {sinPago ? (
        <View style={[c.sectionCard, { flexDirection: "row", alignItems: "center", gap: 12 }]}>
          <View style={[c.policyIcon, { backgroundColor: GREEN + "15" }]}>
            <Feather name="check-circle" size={18} color={GREEN} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[c.policyLabel, { color: GREEN }]}>{t("biz_free_cancellation")}</Text>
            <Text style={c.policySub}>{t("biz_no_prepay_no_refund")}</Text>
          </View>
        </View>
      ) : (
        <PolicySection
          title={t("biz_cancellations")}
          opts={CANCEL_OPTS}
          value={config.cancelPolicy}
          onChange={v => updateConfig({ cancelPolicy: v })}
          color={GREEN}
        />
      )}

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 7 — PLANO (abre módulo real PlanoEmpresaScreen)
// ═══════════════════════════════════════════════════════════════════════════════

function StepPlano({
  currentSector,
  onOpenEditor,
}: {
  currentSector: Sector | null;
  onOpenEditor:  () => void;
}) {
  const { t } = useLanguage();
  const color = currentSector?.color ?? PURPLE;

  return (
    <View style={{ paddingTop: 4 }}>
      <TouchableOpacity
        activeOpacity={0.88}
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onOpenEditor(); }}
        style={[c.bigBtn, { backgroundColor: color }]}
      >
        <Feather name="map" size={20} color="#fff" />
        <Text style={c.bigBtnTxt}>{t("biz_layout_btn")}</Text>
      </TouchableOpacity>

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PASO 7 — PUBLICAR
// ═══════════════════════════════════════════════════════════════════════════════

function StepPublicar({
  onOpenVerificacion,
  onGoToStep,
  onGoToActivity,
}: {
  onOpenVerificacion?: () => void;
  onGoToStep?:         (step: number) => void;
  onGoToActivity?:     () => void;
}) {
  const { config } = useBusinessConfig();
  const { t, lang } = useLanguage();
  const [copied, setCopied] = useState(false);

  const currentSector = SECTORS.find(s => s.id === config.sectorId);
  const currentSub    = currentSector?.subs.find(s => s.id === config.subId);

  const handleShare = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({ message: `Reserva en mi negocio a través de GO:\n${MOCK_LINK}`, url: MOCK_LINK, title: "Reservar en GO" });
    } catch {}
  };
  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(MOCK_LINK);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  // step: número del paso al que navega al pulsar (-1 = actividad, null = no navega)
  const summaryItems: {
    icon:    keyof typeof Feather.glyphMap;
    label:   string;
    value:   string;
    ok:      boolean;
    step:    number | "activity" | null;
  }[] = [
    {
      icon:  "briefcase",
      label: t("biz_cfg_step_name"),
      value: config.businessName?.trim() || t("no_name"),
      ok:    !!(config.businessName?.trim()),
      step:  0,
    },
    {
      icon:  "tag",
      label: t("biz_step_actividad_label"),
      value: currentSector
        ? `${currentSector.emoji} ${getSectorLabel(currentSector, lang)}${currentSub ? ` · ${getSubName(currentSub, lang)}` : ""}`
        : t("biz_no_sector"),
      ok:    !!config.sectorId,
      step:  "activity",
    },
    {
      icon:  "clock",
      label: t("biz_cfg_step_schedule"),
      value: `${config.activeDays.length} ${config.activeDays.length !== 1 ? t("biz_days") : t("biz_day")} · ${config.openFrom}–${config.openTo}`,
      ok:    config.activeDays.length > 0,
      step:  2,
    },
    {
      icon:  "list",
      label: t("biz_cfg_step_services"),
      value: config.services.length > 0
        ? config.services.slice(0, 3).map(s => trSector(s.name, lang)).join(", ") + (config.services.length > 3 ? ` +${config.services.length - 3}` : "")
        : t("biz_no_services"),
      ok:    config.services.length > 0,
      step:  3,
    },
    {
      icon:  "layers",
      label: t("biz_cfg_spaces"),
      value: (() => {
        const n = config.plantillaItems.reduce((s, it) => s + it.count, 0);
        return config.plantillaItems.length > 0
          ? `${n} ${n !== 1 ? t("biz_stations") : t("biz_station")}`
          : t("biz_no_spaces");
      })(),
      ok:    config.plantillaItems.length > 0,
      step:  4,
    },
    ...(PEOPLE_SECTORS.has(SUB_TO_SECTOR[config.subId ?? ""] ?? "") ? [{
      icon:  "users" as const,
      label: t("biz_staff_label"),
      value: (() => {
        const names = config.plantillaItems.flatMap(it => it.staffNames?.filter(n => n.trim()) ?? []);
        if (names.length > 0) {
          return names.length <= 3
            ? names.join(", ")
            : `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
        }
        const total = config.plantillaItems.reduce((s, it) => s + it.count, 0);
        return total > 0 ? `${total} ${total !== 1 ? t("biz_professionals_pl") : t("biz_professional")}` : t("biz_no_professionals");
      })(),
      ok:    config.plantillaItems.flatMap(it => it.staffNames?.filter(n => n.trim()) ?? []).length > 0,
      step:  4 as number | "activity" | null,
    }] : []),
    {
      icon:  "shield",
      label: t("biz_cfg_step_bookings"),
      value: ([t("biz_free_booking"), t("biz_prepay")] as const)[config.paymentPolicy ?? 0] ?? t("biz_not_configured"),
      ok:    true,
      step:  5,
    },
    {
      icon:  "map",
      label: t("biz_cfg_step_plan"),
      value: t("biz_view_edit_layout"),
      ok:    true,
      step:  6,
    },
  ];

  const handleSummaryTap = (step: number | "activity" | null) => {
    Haptics.selectionAsync().catch(() => {});
    if (step === "activity") { onGoToActivity?.(); }
    else if (typeof step === "number") { onGoToStep?.(step); }
  };

  return (
    <View>
      {/* Summary — cada fila es navegable */}
      <View style={c.sectionCard}>
        <Text style={c.sectionLabel}>{t("biz_summary_review_title")}</Text>
        <Text style={{ fontSize: 11, color: DIM, marginBottom: 12 }}>
          {t("biz_summary_review_hint")}
        </Text>
        {summaryItems.map(item => (
          <TouchableOpacity
            key={item.label}
            activeOpacity={item.step !== null ? 0.75 : 1}
            onPress={() => handleSummaryTap(item.step)}
            style={[
              c.summaryRow,
              { borderColor: item.ok ? GREEN + "30" : RED + "25", backgroundColor: item.ok ? GREEN + "04" : RED + "04" },
            ]}
          >
            <View style={[c.policyIcon, { backgroundColor: (item.ok ? GREEN : RED) + "14", width: 36, height: 36, borderRadius: 10 }]}>
              <Feather name={item.icon} size={15} color={item.ok ? GREEN : RED} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[c.sectionLabel, { color: GRAY, marginBottom: 1 }]}>{item.label}</Text>
              <Text style={[c.policyLabel, { fontSize: 13 }]} numberOfLines={1}>{item.value}</Text>
            </View>
            {item.step !== null
              ? <Feather name="chevron-right" size={16} color={item.ok ? GREEN + "99" : RED + "99"} />
              : <Feather name={item.ok ? "check-circle" : "alert-circle"} size={18} color={item.ok ? GREEN : RED} />
            }
          </TouchableOpacity>
        ))}
      </View>

      {/* QR GO */}
      <View style={[c.sectionCard, { alignItems: "center", paddingVertical: 24 }]}>
        <View style={c.qrWrapper}>
          <QRCode value={MOCK_LINK} size={150} backgroundColor="#FFFFFF" color="#111827" />
        </View>
        <Text style={c.qrLink}>{MOCK_LINK}</Text>
      </View>

      <TouchableOpacity activeOpacity={0.85} onPress={handleShare} style={[c.bigBtn, { backgroundColor: GOLD }]}>
        <Feather name="share-2" size={18} color="#fff" />
        <Text style={c.bigBtnTxt}>{t("biz_share_whatsapp")}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        activeOpacity={0.85}
        onPress={handleCopy}
        style={[c.bigBtn, { backgroundColor: copied ? GREEN : CARD, borderWidth: 1, borderColor: copied ? GREEN : BORDER }]}
      >
        <Feather name={copied ? "check" : "copy"} size={18} color={copied ? "#fff" : BLUE} />
        <Text style={[c.bigBtnTxt, { color: copied ? "#fff" : BLUE }]}>
          {copied ? t("biz_link_copied") : t("biz_copy_link")}
        </Text>
      </TouchableOpacity>

      {onOpenVerificacion && (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => { Haptics.selectionAsync().catch(() => {}); onOpenVerificacion(); }}
          style={[c.sectionCard, { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 }]}
        >
          <View style={[c.policyIcon, { backgroundColor: GOLD + "18" }]}>
            <Feather name="alert-circle" size={18} color={GOLD} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[c.policyLabel, { color: GOLD }]}>{t("biz_verify_business_btn")}</Text>
            <Text style={c.policySub}>{t("biz_verify_business_hint")}</Text>
          </View>
          <Feather name="chevron-right" size={16} color={GOLD + "99"} />
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Shared: PolicySection ────────────────────────────────────────────────────

function PolicySection({
  title, opts, value, onChange, color,
}: {
  title:  string;
  opts:   readonly { label: string; sub: string; icon: keyof typeof Feather.glyphMap }[];
  value:  number;
  onChange: (i: number) => void;
  color:  string;
}) {
  return (
    <View style={c.sectionCard}>
      <Text style={c.sectionLabel}>{title}</Text>
      <View style={{ gap: 8 }}>
        {opts.map((o, i) => {
          const active = value === i;
          return (
            <TouchableOpacity
              key={o.label}
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onChange(i); }}
              style={[c.policyCard, active && { borderColor: color, backgroundColor: color + "08" }]}
            >
              <View style={[c.policyIcon, { backgroundColor: color + (active ? "20" : "10") }]}>
                <Feather name={o.icon} size={18} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[c.policyLabel, active && { color, fontWeight: "700" }]}>{o.label}</Text>
                <Text style={c.policySub}>{o.sub}</Text>
              </View>
              {active && <Feather name="check-circle" size={18} color={color} />}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const { width: SW } = Dimensions.get("window");

const c = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },

  header:       {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    backgroundColor: CARD,
  },
  backBtn:      { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT },
  headerSub:    { fontSize: 11, fontWeight: "600", marginTop: 1 },

  stepsBar:     {
    flexDirection: "row",
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  stepPill:     { flex: 1, alignItems: "center", gap: 4 },
  stepDot:      { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  stepDotNum:   { fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#fff" },
  stepPillLabel:{ fontSize: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3, textAlign: "center" },

  contentWrap:  { flex: 1 },
  stepHeader:   {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    padding: 14,
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, borderLeftWidth: 4,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  stepIconCircle:{ width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  stepTitle:    { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT, marginBottom: 2 },
  stepSubtitle: { fontSize: 12, color: GRAY, lineHeight: 16 },

  content:      { paddingHorizontal: 16, paddingTop: 12 },

  sectionCard:  {
    backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionLabel: { fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: GRAY, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 4 },
  sectionSub:   { fontSize: 12, color: DIM, lineHeight: 16, marginBottom: 8 },

  nameInput:    {
    backgroundColor: "#F3F4F6", borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 13,
    fontSize: 16, color: TEXT, fontWeight: "500",
    marginTop: 4,
  },
  charCount:    { fontSize: 11, color: DIM, textAlign: "right", marginTop: 4 },

  // GPS button (Ubicación)
  gpsBtn:       {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 11, paddingHorizontal: 16, borderRadius: 12,
    borderWidth: 1, borderColor: GREEN + "40",
    backgroundColor: GREEN + "0A", marginBottom: 12,
  },
  gpsBtnTxt:    { fontSize: 14, fontWeight: "600", color: GREEN },

  // Day picker pills (Horario)
  dayPill2:     {
    alignItems: "center", paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, backgroundColor: "#F3F4F6",
    borderWidth: 1, borderColor: BORDER, gap: 4,
  },
  dayPillTxt2:  { color: GRAY, fontSize: 13, fontWeight: "500" },
  dayDot:       { width: 6, height: 6, borderRadius: 3 },
  dayDotOn:     { backgroundColor: "#22C55E" },
  dayDotOff:    { backgroundColor: "#D1D5DB" },

  // Copy schedule button
  copyBtn:      {
    flexDirection: "row", alignItems: "center", gap: 7,
    marginTop: 14, alignSelf: "flex-start",
    paddingVertical: 8, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1,
    borderColor: PURPLE + "40", backgroundColor: PURPLE + "08",
  },
  copyBtnTxt:   { fontSize: 13, fontWeight: "500" },

  // Shift labels and add-shift button
  shiftLabel:   { fontSize: 12, fontWeight: "700", color: DIM, marginBottom: 2, letterSpacing: 0.5, textTransform: "uppercase" },
  addShiftBtn:  {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginTop: 10, alignSelf: "flex-start",
    paddingVertical: 7, paddingHorizontal: 12,
    borderRadius: 9, borderWidth: 1,
    borderColor: PURPLE + "35", backgroundColor: PURPLE + "07",
  },
  addShiftTxt:  { fontSize: 13, fontWeight: "500" },

  // Professional per-staff schedule section
  proSchedWrapper:    {
    borderWidth: 1, borderRadius: 10,
    overflow: "hidden",
  },
  proSchedHeader:     {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingHorizontal: 10,
    backgroundColor: "transparent",
  },
  proSchedHeaderTxt:  { fontSize: 12, fontWeight: "600", flex: 1 },
  proSchedModeChip:   {
    flex: 1,
    paddingVertical: 5, paddingHorizontal: 8,
    borderRadius: 8, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: CARD,
    alignItems: "center",
  },
  proSchedModeChipTxt: { fontSize: 12, color: GRAY },
  proSchedDayPill:    {
    width: 28, height: 28, borderRadius: 8, borderWidth: 1.5,
    borderColor: BORDER, backgroundColor: CARD,
    alignItems: "center", justifyContent: "center",
  },
  proSchedDayTxt:     { fontSize: 12, fontWeight: "600", color: GRAY },

  chipRow:      { flexDirection: "row", gap: 8, flexWrap: "wrap", marginTop: 4 },
  timeRow:      { flexDirection: "row", gap: 6, marginTop: 4 },

  itemRow:      {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },
  itemInput:    { fontSize: 14, color: TEXT, fontWeight: "500", paddingVertical: 2 },
  counter:      { flexDirection: "row", alignItems: "center", gap: 4 },
  counterBtn:   { width: 26, height: 26, borderRadius: 8, backgroundColor: BLUE + "12", alignItems: "center", justifyContent: "center" },
  counterNum:   { fontSize: 13, fontWeight: "700", color: TEXT, minWidth: 18, textAlign: "center" },
  deleteBtn:    { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
  emojiChip:    { width: 36, height: 36, borderRadius: 10, borderWidth: 1.5, borderColor: BORDER, alignItems: "center", justifyContent: "center" },

  addBtn:       { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 4, alignSelf: "flex-start" },
  addBtnTxt:    { fontSize: 13, fontWeight: "700", color: BLUE },
  emptyRow:     { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 12 },
  emptyTxt:     { fontSize: 13, color: DIM, flex: 1 },

  countBadge:   {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  countBadgeTxt:{ fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800" },

  staffSlot:    {
    marginTop: 6, marginBottom: 4,
    borderRadius: 14, borderWidth: 1.5,
    padding: 12, gap: 10,
  },

  slotDeleteBtn:{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },

  subConfirmBtn:{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10 },
  subConfirmTxt:{ fontSize: 13, fontWeight: "700", color: "#fff" },
  subCancelBtn: { paddingVertical: 9, paddingHorizontal: 12, justifyContent: "center" },
  subCancelTxt: { fontSize: 13, fontWeight: "600", color: DIM },

  addSlotBtn:   {
    flexDirection: "row", alignItems: "center", gap: 7,
    marginTop: 6, marginBottom: 10,
    paddingVertical: 9, paddingHorizontal: 14,
    borderRadius: 10, borderWidth: 1.5,
    alignSelf: "flex-start",
  },
  addSlotTxt:   { fontSize: 13, fontWeight: "700" },
  staffNameBig: {
    flex: 1, fontSize: 13, fontWeight: "700", color: "#111",
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
  },
  staffNameLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", color: GRAY,
    letterSpacing: 0.7, textTransform: "uppercase", marginBottom: 4,
  },
  staffNameInput: {
    borderWidth: 1.5, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 15, fontWeight: "600", color: TEXT,
  },
  staffSvcLabel: {
    fontSize: 10, fontFamily: "Inter_700Bold", fontWeight: "800", color: DIM,
    letterSpacing: 0.7, textTransform: "uppercase",
    marginBottom: 6, marginTop: 2,
  },
  staffSvcList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  staffSvcChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingVertical: 5, paddingHorizontal: 9,
    borderRadius: 20, borderWidth: 1.5, borderColor: BORDER,
    backgroundColor: "#F3F4F6",
  },
  staffSvcCheck:{
    width: 16, height: 16, borderRadius: 4, borderWidth: 1.5, borderColor: DIM,
    alignItems: "center", justifyContent: "center", backgroundColor: "transparent",
  },
  staffSvcName: { fontSize: 12, fontWeight: "600", color: GRAY, maxWidth: 120 },

  svcRow:       { marginBottom: 10 },
  svcNameInput: {
    backgroundColor: "#F3F4F6", borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 9,
    fontSize: 14, color: TEXT, fontWeight: "500", marginBottom: 6,
  },
  svcMeta:      { flexDirection: "row", alignItems: "center", gap: 6 },
  numBox:       {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "#F3F4F6", borderRadius: 10,
    paddingHorizontal: 8, paddingVertical: 8,
  },
  numInput:     { flex: 1, fontSize: 13, fontWeight: "600", color: TEXT, textAlign: "center" },
  numUnit:      { fontSize: 11, color: DIM, fontWeight: "600" },

  policyCard:   { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 14, borderWidth: 1.5, borderColor: BORDER, padding: 12 },
  policyIcon:   { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  policyLabel:  { fontSize: 14, fontWeight: "600", color: TEXT },
  policySub:    { fontSize: 12, color: DIM, marginTop: 1 },

  summaryRow:   {
    flexDirection: "row", alignItems: "center", gap: 10,
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 12, marginBottom: 8,
  },

  qrWrapper:    { padding: 16, backgroundColor: "#fff", borderRadius: 16, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 8, elevation: 3 },
  qrLink:       { fontSize: 12, color: DIM, fontWeight: "500", textAlign: "center", marginBottom: 8 },

  bigBtn:       { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15, paddingHorizontal: 24, borderRadius: 16, marginBottom: 10 },
  bigBtnTxt:    { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#fff" },

  infoRow:      { flexDirection: "row", alignItems: "flex-start", gap: 6, paddingHorizontal: 4, marginBottom: 12 },
  infoTxt:      { fontSize: 11, color: DIM, flex: 1, lineHeight: 16 },

  // ── OCR Import card (Paso 5) ──────────────────────────────────────────────
  importCard: {
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingTop: 16,
    paddingBottom: 14,
    marginBottom: 12,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  importDividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  importDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: BORDER,
  },
  importDividerTxt: {
    fontSize: 11,
    color: DIM,
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  importBtnsRow: {
    flexDirection: "row",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    overflow: "hidden",
    marginBottom: 12,
  },
  importBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
    gap: 6,
    backgroundColor: "#FAFAFA",
  },
  importBtnSep: {
    width: 1,
    backgroundColor: BORDER,
  },
  importBtnIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  importBtnLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT,
    textAlign: "center",
  },
  importBtnSub: {
    fontSize: 11,
    color: DIM,
    textAlign: "center",
    lineHeight: 15,
  },
  importUrlBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: GREEN + "30",
    backgroundColor: GREEN + "06",
    marginBottom: 12,
  },
  importHelperRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 5,
  },
  importHelperTxt: {
    fontSize: 11,
    color: DIM,
    flex: 1,
    lineHeight: 16,
  },

  footer:       {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 20, paddingTop: 12,
    backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER,
  },
  backFooterBtn:{ flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 10 },
  backFooterTxt:{ fontSize: 14, fontWeight: "600", color: GRAY },
  nextBtn:      { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 13, paddingHorizontal: 24, borderRadius: 14 },
  nextBtnTxt:   { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#fff" },
});
