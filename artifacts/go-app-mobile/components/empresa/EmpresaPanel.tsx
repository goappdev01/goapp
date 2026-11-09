import {GoNavigationFloating} from "@/components/ui/GoNavigationFloating";
import {GoCloseButton} from "@/components/ui/GoCloseButton";
import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  PanResponder,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Alert,
} from "react-native";
import { OwnerContextModal as Modal } from "@/components/debug/OwnerContextIndicator";
import { DraggableFAB } from "../DraggableFAB";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGuidanceConfig, swipeGuideMaxOpacity } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { DemoCompanyManager } from "./DemoCompanyManager";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";
import { useGoView } from "@/contexts/GoViewContext";
import { getBusinessDemoSetupState } from "@/data/businessDemoStore";
import { isBusinessPreviewModule } from "@/data/businessPreviewPolicy";

import { PlanScreen }        from "./PlanScreen";
import { OrbitasScreen }     from "./OrbitasScreen";
import { FacturacionScreen } from "./FacturacionScreen";
import { ConsumoScreen }     from "./ConsumoScreen";
import { ZonasScreen }       from "./ZonasScreen";
import { SugerenciasScreen } from "./SugerenciasScreen";
import { PartnersScreen }    from "./PartnersScreen";
import { PublicidadScreen }  from "./PublicidadScreen";
import { AdminScreen }       from "./AdminScreen";
import { ContactosScreen }     from "@/components/contactos/ContactosScreen";
import { IntencionesScreen }     from "@/components/intenciones/IntencionesScreen";
import { DisponibilidadScreen }   from "@/components/disponibilidad/DisponibilidadScreen";
import { InterpretacionScreen }   from "@/components/interpretacion/InterpretacionScreen";
import { AgendaScreen }           from "@/components/agenda/AgendaScreen";
import { OperativoScreen }        from "@/components/visitas/OperativoScreen";
import { useVerification }   from "@/hooks/useVerification";
import { VerifGateScreen }   from "@/components/auth/VerifGate";
import { GoReservasConfigScreen, GoReservasDemoScreen } from "@/components/booking/GoReservasConfigScreen";
import { GoDeportesScreen }       from "@/components/booking/GoDeportesScreen";
import { EmpresaConfigScreen }    from "@/components/empresa/EmpresaConfigScreen";
import { ActivacionCobrosScreen }  from "@/components/empresa/ActivacionCobrosScreen";
import { SuscripcionGoScreen }     from "@/components/empresa/SuscripcionGoScreen";

type ModuloKey =
  | "home"
  | "contactos"
  | "intenciones"
  | "disponibilidad"
  | "interpretacion"
  | "agenda"
  | "operativo"
  | "plan"
  | "orbitas"
  | "facturacion"
  | "consumo"
  | "zonas"
  | "sugerencias"
  | "partners"
  | "publicidad"
  | "admin"
  | "reservas_config"
  | "empresa_config"
  | "deportes_screen"
  | "suscripcion";

interface ModuloDef {
  key: ModuloKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  desc: string;
  badge?: string;
}

const getModulos = (t: (k: import("@/i18n/translations").TranslationKey) => string): ModuloDef[] => [
  { key: "empresa_config",  label: t("biz_panel_setup"),             icon: "sliders",   color: "#4A80BD", desc: t("biz_panel_setup_desc") },
  { key: "reservas_config", label: t('mod_booking_label'),        icon: "calendar",  color: "#3D9A84", desc: t("biz_panel_booking_desc") },
  { key: "contactos",      label: t('mod_contactos_label'),      icon: "users",     color: "#3D9A84", desc: t('mod_contactos_desc')       },
  { key: "intenciones",    label: t('mod_intenciones_label'),    icon: "target",    color: "#7C69BE", desc: t('mod_intenciones_desc')     },
  { key: "disponibilidad", label: t('mod_disponibilidad_label'), icon: "send",      color: "#4A80BD", desc: t('mod_disponibilidad_desc')  },
  { key: "interpretacion", label: t('mod_interpretacion_label'), icon: "zap",       color: "#C4883A", desc: t('mod_interpretacion_desc')  },
  { key: "agenda",         label: t('mod_agenda_label'),         icon: "map",       color: "#3D9A84", desc: t('mod_agenda_desc')          },
  { key: "operativo",      label: t('mod_operativo_label'),      icon: "activity",  color: "#3D9A84", desc: t('mod_operativo_desc')       },
  { key: "suscripcion",    label: t("biz_panel_subscription"),      icon: "credit-card",color: "#3D9A84", desc: t("biz_panel_subscription_desc") },
  { key: "plan",           label: t('mod_plan_label'),           icon: "star",      color: "#C4883A", desc: t('mod_plan_desc')            },
  { key: "orbitas",        label: t("biz_panel_module_label"),                  icon: "layers",    color: "#7C69BE", desc: t('mod_orbitas_desc'),         badge: "7" },
  { key: "facturacion",    label: t('mod_facturacion_label'),    icon: "file-text", color: "#4A80BD", desc: t('mod_facturacion_desc'),     badge: "1" },
  { key: "consumo",        label: t('mod_consumo_label'),        icon: "bar-chart-2",color: "#C97040",desc: t('mod_consumo_desc')         },
  { key: "zonas",          label: t('mod_zonas_label'),          icon: "map-pin",   color: "#C4883A", desc: t('mod_zonas_desc')           },
  { key: "sugerencias",    label: t('mod_sugerencias_label'),    icon: "cpu",       color: "#7C69BE", desc: t('mod_sugerencias_desc')     },
  { key: "partners",       label: t('mod_partners_label'),       icon: "link",      color: "#4A80BD", desc: t('mod_partners_desc')        },
  { key: "publicidad",     label: t('mod_publicidad_label'),     icon: "radio",     color: "#8A9BB5", desc: t('mod_publicidad_desc'),      badge: "Beta" },
  { key: "admin",          label: t('mod_admin_label'),          icon: "settings",  color: "#C25A5A", desc: t('mod_admin_desc')           },
];

// ─── Bloques madre — hoja de ruta interna (área ADMIN) ───────────────────────
// NOTA: estos bloques pertenecen al área ADMIN y representan la arquitectura
// interna del ecosistema GO. NO se muestran en GO Empresa.

type BloqueMadreDef = {
  key: string;
  emoji: string;
  label: string;
  color: string;
  desc: string;
  progress: number;
  chips: string[];
};

const BLOQUES_MADRE: BloqueMadreDef[] = [
  {
    key: "social",
    emoji: "🌍",
    label: "GO SOCIAL",
    color: "#f97316",
    desc: "Marketplace social y actividades cotidianas.",
    progress: 40,
    chips: ["Comida", "Reservas", "Marketplace", "+5"],
  },
  {
    key: "comunicacion",
    emoji: "💬",
    label: "GO COMUNICACIÓN",
    color: "#4A80BD",
    desc: "Chat, contactos, notas y reuniones.",
    progress: 35,
    chips: ["Chat", "Notas", "Contacto", "+2"],
  },
  {
    key: "humanity",
    emoji: "🤝",
    label: "GO HUMANITY",
    color: "#3D9A84",
    desc: "Sociedad colaborativa y ayuda ciudadana.",
    progress: 10,
    chips: ["Vecinos", "Compartir", "Alertas", "+3"],
  },
  {
    key: "empresa",
    emoji: "🏢",
    label: "GO EMPRESA",
    color: "#7C69BE",
    desc: "Gestión integral empresarial.",
    progress: 20,
    chips: ["Reservas", "Rutas", "IA", "+6"],
  },
  {
    key: "industry",
    emoji: "🏭",
    label: "GO INDUSTRY",
    color: "#C4883A",
    desc: "Producción, mantenimiento e industria.",
    progress: 8,
    chips: ["Producción", "Mantenimiento", "Logística", "+3"],
  },
  {
    key: "prl",
    emoji: "🦺",
    label: "GO PRL",
    color: "#C25A5A",
    desc: "Seguridad y prevención.",
    progress: 5,
    chips: ["Extintores", "EPI", "Auditorías", "+3"],
  },
];


interface EmpresaPanelProps {
  visible: boolean;
  bookingChangeReturnDate?:string;
  onOpenMessage?: (entry:import("@/components/AgendaOperativa").GoEntry,returnTo?:()=>void)=>void;
  onResolveEntry?: (entry:import("@/components/AgendaOperativa").GoEntry,status:"done"|"pending"|"discard",current?:()=>import("@/components/AgendaOperativa").GoEntry|undefined)=>void;
  canResolveEntry?: (entry:import("@/components/AgendaOperativa").GoEntry)=>boolean;
  handedness?: "left"|"right";
  onProposeBookingChange?: (entry:import("@/components/AgendaOperativa").GoEntry,destination?:{dateISO:string;time:string})=>void;
  onClose: () => void;
  initialModulo?: ModuloKey;
  onModuloChange?: () => void;
  guidanceLevel?: number;
  onOpenVerificacion?: () => void;
  /** Llamado al finalizar el wizard de 8 pasos.
   *  Si se proporciona, ActivacionCobrosScreen se renderiza desde el caller
   *  (fuera de este Modal) para evitar el problema de Modales anidados en iOS. */
  onFinalizarWizard?: () => void;
  /** Owner-only isolated context; configuration/bookings use the DEMO adapter when available. */
  previewReadOnly?: boolean;
  onOpenContext?: () => void;
  initialCompaniesOpen?: boolean;
  onDemoNavigate?: (route: "home" | "configuration" | "companies" | "reservations") => void;
}

// Modules that require Empresa Verificada to access.
// Empresa Básica can still explore home, contactos, intenciones, agenda, etc.
const GATED_MODULES = new Set<ModuloKey>([
  "facturacion",  // cobros y pagos reales
  "admin",        // administración y precios reales
  "partners",     // partners y marketplace
  "publicidad",   // publicación visible
  "sugerencias",  // automatizaciones avanzadas
  "operativo",    // panel operativo real
]);

const getGateLabels = (t: (key: import("@/i18n/translations").TranslationKey) => string): Partial<Record<ModuloKey, { feature: string; desc: string }>> => ({
  facturacion: { feature: t("biz_gate_billing"),    desc: t("biz_gate_billing_desc") },
  admin:       { feature: t("biz_gate_admin"),           desc: t("biz_gate_admin_desc") },
  partners:    { feature: t("biz_gate_partners"),   desc: t("biz_gate_partners_desc") },
  publicidad:  { feature: t("biz_gate_publication"), desc: t("biz_gate_publication_desc") },
  sugerencias: { feature: t("biz_gate_automation"),         desc: t("biz_gate_automation_desc") },
  operativo:   { feature: t("biz_gate_operations"),          desc: t("biz_gate_operations_desc") },
});

// ─── Config progress helper ────────────────────────────────────────────────────

function computeConfigProgress(cfg: typeof import("@/contexts/GoBusinessConfigContext").DEFAULT_BUSINESS_CONFIG, plan?: import("@/data/floorPlan").FloorPlan | null) {
  const progress = getBusinessDemoSetupState(cfg, plan);
  const statusColor = progress.ready ? "#3D9A84" : progress.completed >= 4 ? "#F59E0B" : "#EF4444";
  const statusDot = progress.ready ? "🟢" : progress.completed >= 4 ? "🟡" : "🔴";
  return { ...progress, statusColor, statusDot };
}

export function EmpresaPanel({ visible, onClose, initialModulo, onModuloChange, guidanceLevel = 5, onOpenVerificacion, onFinalizarWizard, previewReadOnly = false, bookingChangeReturnDate, onProposeBookingChange,onOpenMessage,onResolveEntry,canResolveEntry,handedness, onOpenContext, initialCompaniesOpen = false, onDemoNavigate }: EmpresaPanelProps) {
  const insets  = useSafeAreaInsets();
  const { t, lang } = useLanguage();
  const GATE_LABELS = useMemo(() => getGateLabels(t), [t]);
  const adminAccess = useAdminAccess();
  const { isBusinessPreview, isAdminView, isOwner } = useGoView();
  const preview = previewReadOnly && isBusinessPreview;
  const panelVisible = visible && (!previewReadOnly || isBusinessPreview);
  const canOpenAdmin = !previewReadOnly && isAdminView && adminAccess.allowed;
  const { config: businessConfig, resetConfig, demo: businessDemo } = useBusinessConfig();
  const demo = preview && Boolean(businessDemo);
  const { locationReturn, clearLocationReturn } = useOwnerBusinessDemo();
  const closePanel = () => { if (demo) clearLocationReturn(); onClose(); };
  const demoTitle = "GO Empresa";
  const showPreviewUnavailable = () => Alert.alert(demo ? demoTitle : t("biz_preview_title"),
    demo ? (lang === "en" ? "This module is not available in this context yet." : "Este módulo todavía no está disponible en este contexto.") : t("biz_preview_unavailable"));
  const verification = useVerification();
  const [modulo, setModulo] = useState<ModuloKey>(() => demo && locationReturn ? "empresa_config" : "home");
  const slideAnim = useRef(new Animated.Value(0)).current;

  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);
  const [empresaOpenCount, setEmpresaOpenCount] = useState(0);
  const [swipeDownOpacity, setSwipeDownOpacity] = useState(0);
  const swipeDownAnim = useRef(new Animated.Value(0)).current;
  const swipeDownLoop = useRef<Animated.CompositeAnimation | null>(null);

  const [configInitialStep,  setConfigInitialStep]  = useState(0);
  const [exceptionCalendarDate, setExceptionCalendarDate] = useState<string | null>(null);
  useEffect(() => { if (modulo !== "reservas_config") setExceptionCalendarDate(null); }, [modulo]);
  const [activacionVisible,  setActivacionVisible]  = useState(false);
  // Clave que cambia con cada «Nueva empresa» — fuerza remontaje limpio del wizard
  const [newEmpresaKey, setNewEmpresaKey] = useState(0);
  const [demoManagerOpen, setDemoManagerOpen] = useState(initialCompaniesOpen);
  const [openSelectedConfig, setOpenSelectedConfig] = useState(demo && initialModulo === "empresa_config");
  const [configKeyboardVisible, setConfigKeyboardVisible] = useState(false);
  useEffect(() => {
    if (!panelVisible || !(modulo === "empresa_config" || demo && modulo === "home" && demoManagerOpen)) { setConfigKeyboardVisible(false); return; }
    setConfigKeyboardVisible(Keyboard.isVisible());
    const show = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", () => setConfigKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => setConfigKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, [panelVisible, modulo, demo, demoManagerOpen]);

  const MODULOS = useMemo(() => getModulos(t).filter(m => m.key !== "admin" || canOpenAdmin), [t, canOpenAdmin]);

  useEffect(() => {
    if (!panelVisible || previewReadOnly) return;
    let active = true;
    AsyncStorage.getItem("go_empresa_open_count_v1").then((raw) => {
      if (!active) return;
      const count = raw ? parseInt(raw, 10) + 1 : 1;
      AsyncStorage.setItem("go_empresa_open_count_v1", String(count)).catch(() => {});
      setEmpresaOpenCount(count);
    });
    return () => { active = false; };
  }, [panelVisible, previewReadOnly]);

  useEffect(() => {
    setSwipeDownOpacity(swipeGuideMaxOpacity(empresaOpenCount, guidanceCfg));
  }, [empresaOpenCount, guidanceCfg]);

  useEffect(() => {
    swipeDownLoop.current?.stop();
    if (swipeDownOpacity <= 0 || !panelVisible) {
      swipeDownAnim.setValue(0);
      return;
    }
    swipeDownLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(swipeDownAnim, { toValue: 1, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(swipeDownAnim, { toValue: 0, duration: 600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    swipeDownLoop.current.start();
    return () => { swipeDownLoop.current?.stop(); };
  }, [swipeDownOpacity, panelVisible]);

  React.useEffect(() => {
    if (panelVisible) {
      // Read the breadcrumb only on an opening edge. Consuming it must not reset the restored module.
      const requested = demo && locationReturn && locationReturn.userId === businessDemo?.getSnapshot().ownerUserId
        ? locationReturn.module : initialModulo ?? "home";
      const targetModulo = (requested === "admin" && !canOpenAdmin) || (previewReadOnly && !isBusinessPreviewModule(requested)) ? "home" : requested;
      setModulo(targetModulo);
    } else {
      setModulo("home");
    }
  }, [panelVisible, initialModulo, previewReadOnly, canOpenAdmin]);

  useEffect(() => {
    if ((modulo === "admin" && !canOpenAdmin) || (previewReadOnly && !isBusinessPreviewModule(modulo))) setModulo("home");
    if (previewReadOnly) setActivacionVisible(false);
  }, [modulo, canOpenAdmin, previewReadOnly]);

  // Refs para que el PanResponder acceda siempre al estado más reciente
  const moduloRef       = useRef(modulo);
  const onCloseRef      = useRef(closePanel);
  const goHomeRef       = useRef<() => void>(() => {});
  // Ref que EmpresaConfigScreen registra con su goPrev interno.
  // El FAB de una flecha lo llama para respetar la ruta real.
  const modulePrevRef   = useRef<(() => void) | null>(null);
  moduloRef.current       = modulo;
  onCloseRef.current      = closePanel;

  // ── ZONA DERECHA (≥75% del ancho) ────────────────────────────────────────
  // Cierre DELIBERADO: requiere pulsación prolongada (1000 ms) ANTES del arrastre.
  // DESACTIVADO completamente cuando el asistente de configuración está abierto
  // (modulo === "empresa_config") para evitar cierres accidentales durante la edición.
  //   • Cualquier movimiento antes del long press → timer cancelado (scroll libre).
  //   • Tras pulsación larga + drag > 140 px  → volver al home del módulo.
  //   • Tras pulsación larga + drag > 250 px  → cerrar GO Empresa completamente.
  const screenW = Dimensions.get("window").width;
  const longPressArmedRef  = useRef(false);
  const longPressTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const _cancelLongPress = () => {
    longPressArmedRef.current = false;
    if (longPressTimerRef.current !== null) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const rightSwipePan = useRef(
    PanResponder.create({
      // Registramos el toque inicial en la zona derecha para iniciar el timer.
      // Devolvemos false → NO reclamamos el responder todavía (scroll sigue libre).
      // Ignorado por completo si el asistente de configuración está activo.
      onStartShouldSetPanResponder: (e, _gs) => {
        if (moduloRef.current === "empresa_config") { _cancelLongPress(); return false; }
        if (e.nativeEvent.pageX >= screenW * 0.75) {
          longPressArmedRef.current = false;
          if (longPressTimerRef.current !== null) clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = setTimeout(() => {
            longPressArmedRef.current = true;
            longPressTimerRef.current = null;
          }, 1000);
        } else {
          _cancelLongPress();
        }
        return false;
      },
      // Solo reclamamos el responder si: (a) la pulsación larga ya se armó,
      // (b) el drag es claramente vertical y (c) estamos en la zona derecha.
      // Cualquier movimiento ≥ 8 px antes de armarse cancela el timer.
      onMoveShouldSetPanResponder: (e, gs) => {
        if (moduloRef.current === "empresa_config") { _cancelLongPress(); return false; }
        if (!longPressArmedRef.current) {
          if (Math.abs(gs.dy) > 8 || Math.abs(gs.dx) > 8) _cancelLongPress();
          return false;
        }
        if (Math.abs(gs.dy) <= 30 || Math.abs(gs.dy) <= Math.abs(gs.dx) * 1.5) return false;
        return e.nativeEvent.pageX >= screenW * 0.75;
      },
      onPanResponderRelease: (_e, gs) => {
        _cancelLongPress();
        if (moduloRef.current === "empresa_config") return;
        if (gs.dy > 250) {
          onCloseRef.current();
        } else if (gs.dy > 140) {
          if (moduloRef.current !== "home") {
            goHomeRef.current(); // módulo → GO Reservas
          } else {
            onCloseRef.current();
          }
        }
      },
      onPanResponderTerminate: () => {
        _cancelLongPress();
      },
    })
  ).current;

  const goToModulo = (key: ModuloKey) => {
    if (demo && key !== "empresa_config") clearLocationReturn();
    if (!panelVisible) return;
    if (previewReadOnly && (!isBusinessPreviewModule(key) || (!demo && (key === "empresa_config" || key === "reservas_config")))) { showPreviewUnavailable(); return; }
    if (key === "admin" && !canOpenAdmin) return;
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setModulo(key);
      slideAnim.setValue(0);
      if (demo && key === "empresa_config") onDemoNavigate?.("configuration");
      if (demo && key === "reservas_config") onDemoNavigate?.("reservations");
      try { if (!previewReadOnly) onModuloChange?.(); } catch { /* silencioso */ }
    });
  };

  const goHome = () => {
    if (demo) clearLocationReturn();
    if (modulo !== "home") {
      // Return to the existing two-path GO Reservas home.
      setModulo("home");
      setDemoManagerOpen(false);
      onDemoNavigate?.("home");
    } else if (demoManagerOpen) {
      setDemoManagerOpen(false);
      onDemoNavigate?.("home");
    } else {
      closePanel();
    }
    try { if (!previewReadOnly) onModuloChange?.(); } catch { /* silencioso */ }
  };
  const openDemoConfiguration = () => {
    setDemoManagerOpen(false); setConfigInitialStep(0); setOpenSelectedConfig(true);
    setNewEmpresaKey(key => key + 1);
    if (onDemoNavigate) { setModulo("empresa_config"); slideAnim.setValue(0); onDemoNavigate("configuration"); }
    else goToModulo("empresa_config");
  };
  const openDemoBusinesses = () => {
    clearLocationReturn(); setModulo("home"); setDemoManagerOpen(true);
    onDemoNavigate?.("companies");
  };
  goHomeRef.current = goHome;

  const moduloActual = MODULOS.find(m => m.key === modulo);

  const fabBottom = insets.bottom + 24;
  const hasPrevious = modulo !== "home" || demoManagerOpen;
  const contentPadBottom = fabBottom + (hasPrevious ? 152 : 80);
  const fabButtons = (
    <>
          {/* Botón 1: volver un paso atrás en la ruta real
               – Si EmpresaConfigScreen tiene registrado su goPrev → lo llama
                 (navega por la ruta interna: paso→paso, activity→sector, etc.)
               – Si no → goHome (módulo → GO Reservas) */}
          {hasPrevious && (
            <GoCloseButton level="panel" activeOpacity={0.8} onPress={() => {
                if (modulo === "empresa_config" && modulePrevRef.current) {
                  modulePrevRef.current();
                } else {
                  goHome();
                }
              }} hitSlop={8} accessibilityLabel={t("biz_panel_back")} style={s.fabBtn}/>
          )}
          {/* Botón 2: cerrar todo el panel — doble flecha para distinguirlo */}
          <GoCloseButton level="container" activeOpacity={0.8} onPress={closePanel} hitSlop={8} accessibilityLabel={t("biz_panel_close")} style={s.fabBtn}/>
    </>
  );

  if (previewReadOnly && !isBusinessPreview) return null;
  const contextNavigation = isOwner && onOpenContext ? (
    <TouchableOpacity onPress={() => { if (demo) clearLocationReturn(); onOpenContext(); }} accessibilityLabel={t("context_change")} style={{ paddingHorizontal: 18, paddingVertical: 12, alignSelf: "flex-start" }}>
      <Text style={[{ color: "#4A80BD", fontWeight: "700" }, demo && modulo === "empresa_config" ? { textAlign: "right" } : undefined]}>{t("context_change")}</Text>
    </TouchableOpacity>
  ) : null;

  return (
    <Modal
      visible={panelVisible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={closePanel}
    >
      <StatusBar style="dark" />
      <KeyboardAvoidingView style={[s.root, { paddingTop: insets.top }]} {...rightSwipePan.panHandlers}
        testID="empresa-keyboard-frame" enabled={modulo === "empresa_config" || demo && demoManagerOpen}
        behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>

        {/* ── Drag handle — purely visual, no gesture ── */}
        <View style={s.handleZone}>
          <View style={s.handlePill} />
        </View>

        {preview && !demo && <Text style={[s.headerSub, { textAlign: "center", color: "#4A80BD", fontWeight: "700" }]}>{t("biz_preview_title")}</Text>}


        {modulo !== "home" && modulo !== "empresa_config" && (
          <View style={s.header}>
            <View style={s.headerCenter}>
              <Text style={s.headerTitle}>{moduloActual?.label ?? ""}</Text>
              <Text style={s.headerSub}>{moduloActual?.desc ?? ""}</Text>
            </View>
          </View>
        )}

        {/* ── Content area ── */}
        {modulo === "home" ? (
          <ScrollView
            style={s.homeScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: contentPadBottom }}
          >
            {contextNavigation}
            {demo ? (
              <DemoCompanyManager compact open={demoManagerOpen} onOpenChange={setDemoManagerOpen} onOpenConfiguration={openDemoConfiguration} />
            ) : (
              <View style={s.header}>
                <TouchableOpacity testID="empresa-business-toggle" accessibilityRole="button"
                  accessibilityLabel={lang === "en" ? "Manage businesses" : "Gestionar negocios"}
                  accessibilityState={{ expanded: demoManagerOpen }} onPress={() => setDemoManagerOpen(!demoManagerOpen)}
                  style={{ paddingVertical: 12 }}>
                  <Text style={s.headerTitle}>{businessConfig.businessName || t("mod_booking_label")} {demoManagerOpen ? "▴" : "▾"}</Text>
                </TouchableOpacity>
                {demoManagerOpen && <TouchableOpacity accessibilityRole="button" onPress={() => {
                  if (previewReadOnly) { showPreviewUnavailable(); return; }
                  Alert.alert(t("biz_panel_new"), t("biz_panel_reset_warning"), [
                    { text: t("cancel"), style: "cancel" },
                    { text: t("biz_panel_create_new"), style: "destructive", onPress: async () => {
                      try { await resetConfig(); } catch (error) { Alert.alert(demoTitle, String(error)); return; }
                      setNewEmpresaKey(key => key + 1); setConfigInitialStep(0); setDemoManagerOpen(false);
                      goToModulo("empresa_config");
                    } },
                  ]);
                }} style={{ paddingVertical: 12 }}>
                  <Text style={{ color: "#4A80BD", fontWeight: "700" }}>{t("biz_panel_new")}</Text>
                </TouchableOpacity>}
              </View>
            )}
            {/* Existing GO Reservas home: configuration and daily operations. */}
            {(() => {
                const { completed, total, nextStep, statusColor, statusDot } = computeConfigProgress(businessConfig, demo ? businessDemo?.getSnapshot().plan : undefined);
                const isAllDone = completed === total;
                const progressFraction = completed / total;
                return (
                  <>
                    <Text style={s.secTitle}>{t("biz_panel_bookings")}</Text>
                    <View style={{ gap: 10 }}>

                      {/* ── Configuración ── */}
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => {
                          if (previewReadOnly && !demo) { showPreviewUnavailable(); return; }
                          setOpenSelectedConfig(demo && Boolean(businessConfig.sectorId && businessConfig.subId));
                          setConfigInitialStep(nextStep >= 0 ? nextStep : 0);
                          goToModulo("empresa_config");
                        }}
                        style={[s.suiteCard, { borderWidth: 2.5, borderColor: statusColor + "50", paddingBottom: 12 }]}
                      >
                        <View style={s.suiteCardTop}>
                          <View style={[s.suiteCardIcon, { backgroundColor: statusColor + "18" }]}>
                            <Feather name="sliders" size={22} color={statusColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.suiteLabel, { color: statusColor }]}>{t("biz_panel_configuration")}</Text>
                            <Text style={s.suiteDesc}>
                              {statusDot} {t("biz_panel_steps_done").replace("__DONE__", String(completed)).replace("__TOTAL__", String(total))}
                            </Text>
                          </View>
                          <Feather name="chevron-right" size={16} color={statusColor + "80"} />
                        </View>
                        {/* Barra de progreso */}
                        <View style={{ width: "100%", height: 4, borderRadius: 2, backgroundColor: statusColor + "20", marginTop: 6 }}>
                          <View style={{ width: `${Math.round(progressFraction * 100)}%`, height: 4, borderRadius: 2, backgroundColor: statusColor }} />
                        </View>
                        {/* Lista informativa en 2 columnas — sin apariencia de botón */}
                        {(() => {
                          const validSteps = getBusinessDemoSetupState(businessConfig, demo ? businessDemo?.getSnapshot().plan : undefined).steps;
                          const done = new Set(validSteps.flatMap((valid, i) => valid ? [i] : []));
                          // Entrelazado: col izq = pasos 1-4, col dcha = pasos 5-8
                          // Row 1: Nombre   | Servicios
                          // Row 2: Ubicación | Reservas
                          // Row 3: Horarios  | Plano
                          // Row 4: Espacios  | Publicación
                          const items: { label: string; step: number }[] = [
                            { label: t("biz_panel_name"),       step: 0 },
                            { label: t("biz_panel_services"),   step: 3 },
                            { label: t("biz_panel_location"),   step: 1 },
                            { label: t("biz_panel_booking_step"),   step: 5 },
                            { label: t("biz_panel_schedule"),   step: 2 },
                            { label: t("biz_panel_floor_plan"), step: 6 },
                            { label: t("biz_panel_spaces"),     step: 4 },
                            { label: t("biz_panel_publishing"), step: 7 },
                          ];
                          return (
                            <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
                              {items.map(({ label, step }) => {
                                const isDone = done.has(step);
                                return (
                                  <View key={label} style={{ width: "50%", flexDirection: "row", alignItems: "center", paddingVertical: 2.5 }}>
                                    <Text style={{ fontSize: 12, color: isDone ? "#3D9A84" : "#C4C9D4", marginRight: 6, width: 12 }}>
                                      {isDone ? "✓" : "·"}
                                    </Text>
                                    <Text style={{ fontSize: 12, color: isDone ? "#3D9A84" : "#6B7280" }}>{label}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })()}
                        <Text style={[s.suiteDesc, { marginTop: 8, color: statusColor, fontWeight: "700" }]}>
                          {isAllDone ? t("biz_panel_ready_review") : t("biz_panel_continue_step").replace("__STEP__", String((nextStep >= 0 ? nextStep : 0) + 1))}
                        </Text>
                      </TouchableOpacity>

                      {/* ── Daily operations ── */}
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => goToModulo("reservas_config")}
                        style={[s.suiteCard, { borderWidth: 1.5, borderColor: "#3D9A8440" }]}
                      >
                        <View style={s.suiteCardTop}>
                          <View style={[s.suiteCardIcon, { backgroundColor: "#3D9A8418" }]}>
                            <Feather name="calendar" size={22} color="#3D9A84" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.suiteLabel, { color: "#3D9A84" }]}>{t("biz_panel_daily")}</Text>
                            <Text style={s.suiteDesc}>{t("biz_panel_daily_desc")}</Text>
                          </View>
                          <Feather name="chevron-right" size={16} color="#3D9A8480" />
                        </View>
                        <View style={s.suiteChipsRow}>
                          {[t("biz_panel_floor_plan"),t("biz_panel_calendar"),t("biz_panel_booking_step"),t("biz_panel_occupancy"),t("biz_panel_tables")].map(label => (
                            <View key={label} style={[s.suiteChip, { borderColor: "#3D9A8430" }]}>
                              <Text style={[s.suiteChipTxt, { color: "#3D9A84" }]}>{label}</Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>

                    </View>
                  </>
                );
              })()}
          </ScrollView>
        ) : (!previewReadOnly || isBusinessPreviewModule(modulo)) ? (
          <Animated.View
            style={[s.moduloView, {
              opacity:   slideAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
              transform: [{ translateX: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 30] }) }],
            }]}
          >
            {/* Free modules — Empresa Básica has full access */}
            {modulo === "contactos"       && <ContactosScreen      onBack={goHome} guidanceLevel={guidanceLevel} />}
            {modulo === "intenciones"     && <IntencionesScreen    onBack={goHome} guidanceLevel={guidanceLevel} />}
            {modulo === "disponibilidad"  && <DisponibilidadScreen onBack={goHome} guidanceLevel={guidanceLevel} />}
            {modulo === "interpretacion"  && <InterpretacionScreen onBack={goHome} guidanceLevel={guidanceLevel} />}
            {modulo === "agenda"          && <AgendaScreen         onBack={goHome} guidanceLevel={guidanceLevel} />}
            {modulo === "suscripcion"      && <SuscripcionGoScreen guidanceLevel={guidanceLevel} />}
            {modulo === "plan"            && <PlanScreen        guidanceLevel={guidanceLevel} />}
            {modulo === "orbitas"         && <OrbitasScreen     guidanceLevel={guidanceLevel} />}
            {modulo === "consumo"         && <ConsumoScreen     guidanceLevel={guidanceLevel} />}
            {modulo === "zonas"           && <ZonasScreen       guidanceLevel={guidanceLevel} />}
            {modulo === "empresa_config"   && <EmpresaConfigScreen onManageCalendarConflicts={dateISO => { setExceptionCalendarDate(dateISO); goToModulo("reservas_config"); }} key={`ec-${businessDemo?.businessId ?? "live"}-${newEmpresaKey}`} keyboardManagedByParent startAtSteps={demo && openSelectedConfig} onOpenCompanies={demo ? openDemoBusinesses : undefined} contextNavigation={contextNavigation} onBack={goHome} onOpenVerificacion={previewReadOnly ? undefined : onOpenVerificacion} onFinalizarConfig={() => { goHome(); if (previewReadOnly) return; if (onFinalizarWizard) { onFinalizarWizard(); } else { setActivacionVisible(true); } }} initialStep={configInitialStep} goPrevRef={modulePrevRef} />}
            {modulo === "reservas_config"  && (demo ? <GoReservasDemoScreen onClose={goHome} onOpenMessage={onOpenMessage} onResolveEntry={onResolveEntry} canResolveEntry={canResolveEntry} handedness={handedness} onProposeBookingChange={onProposeBookingChange} navigateToDayISO={exceptionCalendarDate ?? bookingChangeReturnDate} hideFAB={true} /> : <GoReservasConfigScreen onClose={goHome} onOpenMessage={onOpenMessage} onResolveEntry={onResolveEntry} canResolveEntry={canResolveEntry} handedness={handedness} onProposeBookingChange={onProposeBookingChange} navigateToDayISO={exceptionCalendarDate ?? bookingChangeReturnDate} onOpenVerificacion={previewReadOnly ? undefined : onOpenVerificacion} hideFAB={true} />)}
            {modulo === "deportes_screen"  && <GoDeportesScreen onClose={goHome} onOpenBooking={(_id, _label, _emoji, _color) => { goToModulo("reservas_config"); }} onOpenVerificacion={onOpenVerificacion} />}

            {/* Gated modules — require Empresa Verificada */}
            {GATED_MODULES.has(modulo) && (
              (verification.status === "verified" || (preview && isBusinessPreviewModule(modulo))) ? (
                <>
                  {modulo === "facturacion" && <FacturacionScreen guidanceLevel={guidanceLevel} />}
                  {modulo === "admin" && canOpenAdmin && <AdminScreen guidanceLevel={guidanceLevel} />}
                  {modulo === "partners"    && <PartnersScreen    guidanceLevel={guidanceLevel} />}
                  {modulo === "publicidad"  && <PublicidadScreen  guidanceLevel={guidanceLevel} />}
                  {modulo === "sugerencias" && <SugerenciasScreen guidanceLevel={guidanceLevel} />}
                  {modulo === "operativo"   && <OperativoScreen   onBack={goHome} guidanceLevel={guidanceLevel} onIrAgenda={() => goToModulo("agenda")} />}
                </>
              ) : (
                <VerifGateScreen
                  feature={GATE_LABELS[modulo]?.feature ?? modulo}
                  description={GATE_LABELS[modulo]?.desc}
                  onOpenVerificacion={onOpenVerificacion}
                />
              )
            )}
          </Animated.View>
        ) : null}

        {/* ── FABs flotantes — arrastrable con long-press ──────────────────── */}
        {!configKeyboardVisible && (previewReadOnly ? (
          <GoNavigationFloating screenKey="empresa-demo" width={hasPrevious ? 136 : 64}>{fabButtons}</GoNavigationFloating>
        ) : (
          <DraggableFAB navigation screenKey="empresa" buttonKey="main" initialRight={20} initialBottom={fabBottom} maxH={hasPrevious ? 138 : 64} buttonWidth={64}>
            {fabButtons}
          </DraggableFAB>
        ))}

        {/* ── GUÍA GESTUAL DERECHA — indica zona de cerrar/minimizar ──────
            pointerEvents="none": puramente decorativa, nunca bloquea toques.
            LinearGradient horizontal: opaco en el borde, transparente hacia
            el centro. Ocupa el 25% derecho y la mitad inferior de la pantalla. */}
        <LinearGradient
          colors={["transparent", "rgba(255,255,255,0.18)"]}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          pointerEvents="none"
          style={{
            position: "absolute",
            right: 0,
            top: "50%",
            bottom: 0,
            width: "25%",
          }}
        />

      </KeyboardAvoidingView>

      {/* ── Fase de activación y cobros — independiente del asistente ── */}
      {!previewReadOnly && <ActivacionCobrosScreen
        visible={activacionVisible}
        onClose={() => setActivacionVisible(false)}
      />}

    </Modal>
  );
}

function MetricCard({
  label, value, sub, warn,
}: { label: string; value: string; sub: string; color?: string; warn?: boolean }) {
  return (
    <View style={[s.metricCard, warn && { borderColor: "#f59e0b55" }]}>
      {warn && <Feather name="alert-triangle" size={10} color="#f59e0b" style={{ marginBottom: 2 }} />}
      <Text style={s.metricVal}>{value}</Text>
      <Text style={s.metricSub}>{sub}</Text>
      <Text style={s.metricLabel}>{label}</Text>
    </View>
  );
}

function QuickBtn({
  icon, label, color, onPress,
}: { icon: keyof typeof Feather.glyphMap; label: string; color: string; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={s.quickBtn}>
      <View style={[s.quickIcon, { backgroundColor: color + "22" }]}>
        <Feather name={icon} size={16} color={color} />
      </View>
      <Text style={s.quickLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  root:            { flex: 1, backgroundColor: "#F7F8FA" },

  handleZone:      { paddingTop: 10, paddingBottom: 4, alignItems: "center" },
  handlePill:      { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 2 },

  header:          { alignItems: "center", paddingHorizontal: 16, paddingVertical: 14,
                     borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)",
                     backgroundColor: "#FFFFFF" },
  headerCenter:    { alignItems: "center" },
  headerTitle:     { fontSize: 16, color: "#111827", fontFamily: "Inter_700Bold", fontWeight: "800", marginBottom: 1 },
  headerSub:       { fontSize: 11, color: "#9CA3AF", fontWeight: "500" },
  verifBadge:      { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 8,
                     paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20,
                     borderWidth: 1 },
  verifDot:        { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  verifTexts:      { flexDirection: "column", gap: 1 },
  verifTxt:        { fontSize: 11, fontWeight: "700", letterSpacing: 0.2 },
  verifSubTxt:     { fontSize: 9, fontWeight: "500", letterSpacing: 0.1 },

  homeScroll:      { flex: 1, padding: 16 },

  empresaHero:     { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 18, marginBottom: 20,
                     borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
                     shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
                     shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  empresaHeroTop:  { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  planPill:        { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1,
                     borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  planPillTxt:     { fontSize: 12, fontWeight: "700" },
  renovacionTxt:   { fontSize: 11, color: "#9CA3AF" },
  metricsRow:      { flexDirection: "row", gap: 8 },
  metricCard:      { flex: 1, backgroundColor: "#F9FAFB", borderRadius: 12, padding: 10,
                     alignItems: "center", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  metricVal:       { fontSize: 18, fontFamily: "Inter_900Black", fontWeight: "900", marginBottom: 1, color: "#111827" },
  metricSub:       { fontSize: 9, color: "#9CA3AF", fontWeight: "500", marginBottom: 2 },
  metricLabel:     { fontSize: 9, color: "#6B7280", fontWeight: "600", textTransform: "uppercase" },

  secTitle:        { fontSize: 11, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1,
                     textTransform: "uppercase", marginBottom: 10 },

  quickRow:        { flexDirection: "row", gap: 8, marginBottom: 24 },
  quickBtn:        { flex: 1, alignItems: "center", gap: 6 },
  quickIcon:       { width: 48, height: 48, borderRadius: 14, alignItems: "center",
                     justifyContent: "center" },
  quickLabel:      { fontSize: 8, color: "#6B7280", fontWeight: "600",
                     textTransform: "uppercase", textAlign: "center" },

  modulosGrid:     { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20 },
  moduloCard:      {
    width:           "47%",
    flexGrow:        1,
    backgroundColor: "#FFFFFF",
    borderRadius:    16,
    padding:         14,
    borderWidth:     1,
    borderColor:     "rgba(0,0,0,0.08)",
    gap:             6,
    shadowColor:     "#000",
    shadowOpacity:   0.03,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 1 },
    elevation:       1,
  },
  moduloIcon:      { width: 44, height: 44, borderRadius: 13, alignItems: "center",
                     justifyContent: "center" },
  moduloBadge:     { position: "absolute", top: -4, right: -4, minWidth: 16, height: 16,
                     borderRadius: 8, alignItems: "center", justifyContent: "center",
                     paddingHorizontal: 3 },
  moduloBadgeTxt:  { fontSize: 8, color: "#fff", fontFamily: "Inter_900Black", fontWeight: "900" },
  moduloLabel:     { fontSize: 13, color: "#111827", fontWeight: "700" },
  moduloDesc:      { fontSize: 11, color: "#6B7280", lineHeight: 15 },

  infoBox:         { flexDirection: "row", gap: 8, backgroundColor: "rgba(59,130,246,0.05)",
                     borderRadius: 12, padding: 12, borderWidth: 1,
                     borderColor: "rgba(59,130,246,0.15)", marginTop: 4 },
  infoTxt:         { fontSize: 11, color: "#4B5563", lineHeight: 16, flex: 1 },

  moduloView:      { flex: 1 },

  // Suite header icon
  suiteHeaderIcon: { width: 36, height: 36, borderRadius: 11, alignItems: "center",
                     justifyContent: "center", marginBottom: 2 },

  // Suite selector cards
  suitesGrid:      { gap: 10, marginBottom: 20 },
  suiteCard:       { backgroundColor: "#FFFFFF", borderRadius: 18, padding: 16,
                     borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", gap: 12,
                     shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 8,
                     shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  suiteCardTop:    { flexDirection: "row", alignItems: "center", gap: 12 },
  suiteCardIcon:   { width: 48, height: 48, borderRadius: 15, alignItems: "center",
                     justifyContent: "center", flexShrink: 0 },
  suiteLabel:      { fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", marginBottom: 2 },
  suiteDesc:       { fontSize: 12, color: "#6B7280", lineHeight: 16 },
  suiteChipsRow:   { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  suiteChip:       { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 99,
                     borderWidth: 1, backgroundColor: "rgba(0,0,0,0.02)" },
  suiteChipTxt:    { fontSize: 10, fontWeight: "600" },

  // Two primary action buttons
  twoBtnRow: {
    flexDirection: "row", gap: 10, marginBottom: 18,
  },
  twoBtn: {
    flex: 1, backgroundColor: "#FFFFFF",
    borderRadius: 18, borderWidth: 1.5,
    padding: 14, gap: 8,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
    alignItems: "flex-start",
  },
  twoBtnIcon: {
    width: 44, height: 44, borderRadius: 14,
    alignItems: "center", justifyContent: "center",
  },
  twoBtnTitle:  { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800" },
  twoBtnSub:    { fontSize: 11, color: "#6B7280", lineHeight: 15 },

  // Setup guide banner
  setupBanner: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(74,128,189,0.25)",
    gap: 10,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  setupBannerTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  setupBannerIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: "rgba(74,128,189,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  setupBannerTitle: {
    fontSize: 13,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color: "#111827",
    marginBottom: 2,
  },
  setupBannerSub: {
    fontSize: 11,
    color: "#6B7280",
  },
  setupProgressTrack: {
    flexDirection: "row",
    gap: 5,
    height: 5,
  },
  setupProgressSeg: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: "rgba(0,0,0,0.10)",
  },

  fabCluster:      {
    position:        "absolute",
    alignItems:      "center",
    gap:             10,
    zIndex:          99,
  },
  fabBtn:          {
    width:           44,
    height:          44,
    borderRadius:    13,
    backgroundColor: "#0F0F0F",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.18)",
    alignItems:      "center",
    justifyContent:  "center",
    shadowColor:     "#000",
    shadowOpacity:   0.40,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       10,
  },
});
