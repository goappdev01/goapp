import React, { useState, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  Modal,
  PanResponder,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
  Alert,
} from "react-native";
import { DraggableFAB } from "../DraggableFAB";
import { StatusBar } from "expo-status-bar";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getGuidanceConfig, swipeGuideMaxOpacity } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";

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
import { GoReservasConfigScreen } from "@/components/booking/GoReservasConfigScreen";
import { GoDeportesScreen }       from "@/components/booking/GoDeportesScreen";
import { EmpresaConfigScreen }    from "@/components/empresa/EmpresaConfigScreen";
import { ActivacionCobrosScreen }  from "@/components/empresa/ActivacionCobrosScreen";
import { SuscripcionGoScreen }     from "@/components/empresa/SuscripcionGoScreen";
import { MOCK_EMPRESA }            from "@/data/mockEconomia";

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
  { key: "empresa_config",  label: "Set up business",             icon: "sliders",   color: "#4A80BD", desc: "8-step guided wizard to configure your business" },
  { key: "reservas_config", label: t('mod_booking_label'),        icon: "calendar",  color: "#3D9A84", desc: "Floor plan + calendar · real-time bookings" },
  { key: "contactos",      label: t('mod_contactos_label'),      icon: "users",     color: "#3D9A84", desc: t('mod_contactos_desc')       },
  { key: "intenciones",    label: t('mod_intenciones_label'),    icon: "target",    color: "#7C69BE", desc: t('mod_intenciones_desc')     },
  { key: "disponibilidad", label: t('mod_disponibilidad_label'), icon: "send",      color: "#4A80BD", desc: t('mod_disponibilidad_desc')  },
  { key: "interpretacion", label: t('mod_interpretacion_label'), icon: "zap",       color: "#C4883A", desc: t('mod_interpretacion_desc')  },
  { key: "agenda",         label: t('mod_agenda_label'),         icon: "map",       color: "#3D9A84", desc: t('mod_agenda_desc')          },
  { key: "operativo",      label: t('mod_operativo_label'),      icon: "activity",  color: "#3D9A84", desc: t('mod_operativo_desc')       },
  { key: "suscripcion",    label: "Suscripción GO Empresa",      icon: "credit-card",color: "#3D9A84", desc: "Plan, facturación y pago a la plataforma GO" },
  { key: "plan",           label: t('mod_plan_label'),           icon: "star",      color: "#C4883A", desc: t('mod_plan_desc')            },
  { key: "orbitas",        label: "Módulos GO",                  icon: "layers",    color: "#7C69BE", desc: t('mod_orbitas_desc'),         badge: "7" },
  { key: "facturacion",    label: t('mod_facturacion_label'),    icon: "file-text", color: "#4A80BD", desc: t('mod_facturacion_desc'),     badge: "1" },
  { key: "consumo",        label: t('mod_consumo_label'),        icon: "bar-chart-2",color: "#C97040",desc: t('mod_consumo_desc')         },
  { key: "zonas",          label: t('mod_zonas_label'),          icon: "map-pin",   color: "#C4883A", desc: t('mod_zonas_desc')           },
  { key: "sugerencias",    label: t('mod_sugerencias_label'),    icon: "cpu",       color: "#7C69BE", desc: t('mod_sugerencias_desc')     },
  { key: "partners",       label: t('mod_partners_label'),       icon: "link",      color: "#4A80BD", desc: t('mod_partners_desc')        },
  { key: "publicidad",     label: t('mod_publicidad_label'),     icon: "radio",     color: "#8A9BB5", desc: t('mod_publicidad_desc'),      badge: "Beta" },
  { key: "admin",          label: t('mod_admin_label'),          icon: "settings",  color: "#C25A5A", desc: t('mod_admin_desc')           },
];

// ─── Suite architecture — 5 product modules ──────────────────────────────────

type SuiteKey = "reservas" | "rutas" | "ia" | "negocio" | "empresa_admin";

type SuiteDef = {
  key: SuiteKey;
  label: string;
  icon: keyof typeof Feather.glyphMap;
  color: string;
  desc: string;
  modules: ModuloKey[];
};

const SUITES: SuiteDef[] = [
  {
    key: "reservas",
    label: "GO Reservas",
    icon: "calendar",
    color: "#3D9A84",
    desc: "Booking configuration and real-time operations",
    modules: ["empresa_config", "reservas_config"],
  },
  {
    key: "rutas",
    label: "GO Rutas",
    icon: "navigation",
    color: "#4A80BD",
    desc: "Visits, routes and field agenda",
    modules: ["agenda", "operativo", "zonas", "disponibilidad"],
  },
  {
    key: "ia",
    label: "GO IA",
    icon: "cpu",
    color: "#7C69BE",
    desc: "Interpretación, sugerencias y automatizaciones",
    modules: ["interpretacion", "sugerencias", "intenciones"],
  },
  {
    key: "negocio",
    label: "GO Negocio",
    icon: "briefcase",
    color: "#C4883A",
    desc: "Pagos, suscripción y módulos contratados",
    modules: ["suscripcion", "plan", "orbitas", "facturacion", "consumo", "partners", "publicidad"],
  },
  {
    key: "empresa_admin",
    label: "GO Empresa",
    icon: "shield",
    color: "#C25A5A",
    desc: "Administración, contactos y verificación",
    modules: ["admin", "contactos"],
  },
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


const PLAN_COLORS: Record<string, string> = {
  free:       "#8A9BB5",
  pro:        "#4A80BD",
  empresa:    "#3D9A84",
  enterprise: "#C4883A",
};

interface EmpresaPanelProps {
  visible: boolean;
  onClose: () => void;
  initialModulo?: ModuloKey;
  onModuloChange?: () => void;
  guidanceLevel?: number;
  onOpenVerificacion?: () => void;
  /** Llamado al finalizar el wizard de 8 pasos.
   *  Si se proporciona, ActivacionCobrosScreen se renderiza desde el caller
   *  (fuera de este Modal) para evitar el problema de Modales anidados en iOS. */
  onFinalizarWizard?: () => void;
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

const GATE_LABELS: Partial<Record<ModuloKey, { feature: string; desc: string }>> = {
  facturacion: { feature: "Facturación y cobros",    desc: "Genera facturas reales y procesa cobros de clientes." },
  admin:       { feature: "Administración",           desc: "Gestiona precios, límites y configuración avanzada." },
  partners:    { feature: "Partners y marketplace",   desc: "Conecta con partners y publica en el marketplace GO." },
  publicidad:  { feature: "Publicidad y publicación", desc: "Publica tu empresa y servicios de forma visible en GO." },
  sugerencias: { feature: "Automatizaciones",         desc: "Activa flujos automáticos y acciones avanzadas." },
  operativo:   { feature: "Panel operativo",          desc: "Accede a métricas y paneles de operación en tiempo real." },
};

// ─── Config progress helper ────────────────────────────────────────────────────

function computeConfigProgress(cfg: typeof import("@/contexts/GoBusinessConfigContext").DEFAULT_BUSINESS_CONFIG) {
  const done = new Set<number>(Array.isArray(cfg.completedSteps) ? cfg.completedSteps : []);
  // Data-driven overrides: steps we can determine from existing data
  if (cfg.businessName?.trim())        done.add(0);
  if (cfg.address?.trim())             done.add(1);
  if (cfg.plantillaItems?.length > 0)  done.add(3);
  if (cfg.services?.length > 0)        done.add(4);
  if (cfg.bookingEnabled)              done.add(7);

  const ALL_STEPS = [0, 1, 2, 3, 4, 5, 6, 7];
  const completed = ALL_STEPS.filter(i => done.has(i)).length;
  const total     = ALL_STEPS.length;
  // Next pending step (first gap), or -1 if all done
  const nextStep  = ALL_STEPS.find(i => !done.has(i)) ?? -1;

  let statusColor: string;
  let statusDot:   string;
  if (completed === total) {
    statusColor = "#3D9A84";
    statusDot   = "🟢";
  } else if (completed >= 4) {
    statusColor = "#F59E0B";
    statusDot   = "🟡";
  } else {
    statusColor = "#EF4444";
    statusDot   = "🔴";
  }

  return { completed, total, nextStep, statusColor, statusDot };
}

export function EmpresaPanel({ visible, onClose, initialModulo, onModuloChange, guidanceLevel = 5, onOpenVerificacion, onFinalizarWizard }: EmpresaPanelProps) {
  const insets  = useSafeAreaInsets();
  const { lang, t } = useLanguage();
  const { config: businessConfig, updateConfig, resetConfig } = useBusinessConfig();
  const verification = useVerification();
  const [modulo, setModulo] = useState<ModuloKey>("home");
  const slideAnim = useRef(new Animated.Value(0)).current;

  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);
  const [empresaOpenCount, setEmpresaOpenCount] = useState(0);
  const [swipeDownOpacity, setSwipeDownOpacity] = useState(0);
  const swipeDownAnim = useRef(new Animated.Value(0)).current;
  const swipeDownLoop = useRef<Animated.CompositeAnimation | null>(null);

  const [currentSuite, setCurrentSuite] = useState<SuiteKey | null>(null);
  const [configInitialStep,  setConfigInitialStep]  = useState(0);
  const [activacionVisible,  setActivacionVisible]  = useState(false);
  // Clave que cambia con cada «Nueva empresa» — fuerza remontaje limpio del wizard
  const [newEmpresaKey, setNewEmpresaKey] = useState(0);

  const MODULOS = useMemo(() => getModulos(t), [t]);

  useEffect(() => {
    if (!visible) return;
    AsyncStorage.getItem("go_empresa_open_count_v1").then((raw) => {
      const count = raw ? parseInt(raw, 10) + 1 : 1;
      AsyncStorage.setItem("go_empresa_open_count_v1", String(count)).catch(() => {});
      setEmpresaOpenCount(count);
    });
  }, [visible]);

  useEffect(() => {
    setSwipeDownOpacity(swipeGuideMaxOpacity(empresaOpenCount, guidanceCfg));
  }, [empresaOpenCount, guidanceCfg]);

  useEffect(() => {
    swipeDownLoop.current?.stop();
    if (swipeDownOpacity <= 0 || !visible) {
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
  }, [swipeDownOpacity, visible]);

  const showBadges = guidanceCfg.labelOpacity(0) > 0;

  React.useEffect(() => {
    if (visible) {
      const targetModulo = initialModulo ?? "home";
      setModulo(targetModulo);
      if (targetModulo !== "home") {
        const suite = SUITES.find(s => s.modules.includes(targetModulo as ModuloKey));
        setCurrentSuite(suite?.key ?? null);
      }
    } else {
      setModulo("home");
      setCurrentSuite(null);
    }
  }, [visible, initialModulo]);

  // Refs para que el PanResponder acceda siempre al estado más reciente
  const moduloRef       = useRef(modulo);
  const currentSuiteRef = useRef<SuiteKey | null>(null);
  const onCloseRef      = useRef(onClose);
  const goHomeRef       = useRef<() => void>(() => {});
  // Ref que EmpresaConfigScreen registra con su goPrev interno.
  // El FAB de una flecha lo llama para respetar la ruta real.
  const modulePrevRef   = useRef<(() => void) | null>(null);
  moduloRef.current       = modulo;
  currentSuiteRef.current = currentSuite;
  onCloseRef.current      = onClose;

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
            goHomeRef.current(); // módulo → suite home
          } else if (currentSuiteRef.current !== null) {
            goHomeRef.current(); // suite home → suite selector
          } else {
            onCloseRef.current(); // suite selector → cerrar panel
          }
        }
      },
      onPanResponderTerminate: () => {
        _cancelLongPress();
      },
    })
  ).current;

  const goToModulo = (key: ModuloKey) => {
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setModulo(key);
      slideAnim.setValue(0);
      try { onModuloChange?.(); } catch { /* silencioso */ }
    });
  };

  const goHome = () => {
    if (modulo !== "home") {
      // Module → suite sub-grid
      setModulo("home");
    } else {
      // Suite sub-grid → suite selector
      setCurrentSuite(null);
    }
    try { onModuloChange?.(); } catch { /* silencioso */ }
  };
  goHomeRef.current = goHome;

  const moduloActual = MODULOS.find(m => m.key === modulo);
  const planColor    = PLAN_COLORS[MOCK_EMPRESA.plan] ?? "#6ee7b7";

  const fabBottom = insets.bottom + 24;
  const contentPadBottom = fabBottom + 80;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <StatusBar style="dark" translucent backgroundColor="transparent" />
      <View style={[s.root, { paddingTop: insets.top }]} {...rightSwipePan.panHandlers}>

        {/* ── Drag handle — purely visual, no gesture ── */}
        <View style={s.handleZone}>
          <View style={s.handlePill} />
        </View>

        {/* ── Centered header — oculto en empresa_config (el asistente tiene su propia cabecera) ── */}
        {modulo !== "empresa_config" ? (
        <View style={s.header}>
          <View style={s.headerCenter}>
            {modulo === "home" && currentSuite === null ? (
              <>
                <Text style={s.headerTitle}>GO Empresa</Text>
                <Text style={s.headerSub}>{MOCK_EMPRESA.nombre}</Text>
                {/* Verification badge — derived from businessConfig + verification status */}
                {(() => {
                  const st              = verification.status;
                  const isConfigured    = !!businessConfig.sectorId;
                  const isFullyConfigured = !!businessConfig.sectorId && businessConfig.services.length > 0;

                  let color: string;
                  let label: string;
                  let sub: string;

                  if (st === "verified") {
                    color = "#10B981";
                    label = "Empresa verificada";
                    sub   = "Todas las funciones activas";
                  } else if (st === "pending") {
                    color = "#F59E0B";
                    label = "Verification sent";
                    sub   = "Under review";
                  } else if (st === "rejected") {
                    color = "#EF4444";
                    label = "Verification rejected";
                    sub   = "Please resubmit your information";
                  } else if (isFullyConfigured) {
                    color = "#4A80BD";
                    label = "Ready to verify";
                    sub   = "Send your documents";
                  } else if (isConfigured) {
                    color = "#F59E0B";
                    label = "Configuration in progress";
                    sub   = "Complete the configuration steps";
                  } else {
                    color = "#9CA3AF";
                    label = "Business not configured";
                    sub   = "Configure your business to receive bookings";
                  }

                  return (
                    <TouchableOpacity
                      activeOpacity={st === "verified" ? 1 : 0.8}
                      onPress={st === "verified" ? undefined : () => {
                        if (isFullyConfigured && onOpenVerificacion) {
                          onOpenVerificacion();
                        } else {
                          const { nextStep } = computeConfigProgress(businessConfig);
                          setConfigInitialStep(nextStep >= 0 ? nextStep : 0);
                          goToModulo("empresa_config");
                        }
                      }}
                      style={[s.verifBadge, { borderColor: color + "40", backgroundColor: color + "0D" }]}
                    >
                      <View style={[s.verifDot, { backgroundColor: color }]} />
                      <View style={s.verifTexts}>
                        <Text style={[s.verifTxt, { color }]}>{label}</Text>
                        <Text style={[s.verifSubTxt, { color: color + "CC" }]}>{sub}</Text>
                      </View>
                      {st !== "verified" && (
                        <Feather name="chevron-right" size={11} color={color + "99"} />
                      )}
                    </TouchableOpacity>
                  );
                })()}

                {/* ── Nueva empresa — siempre desde cero, sin heredar datos ── */}
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => {
                    Alert.alert(
                      "New business",
                      "Current configuration will be deleted and you will start from scratch. Previous business data cannot be recovered.",
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Create new",
                          style: "destructive",
                          onPress: async () => {
                            await resetConfig();
                            setNewEmpresaKey(k => k + 1);
                            setConfigInitialStep(0);
                            goToModulo("empresa_config");
                          },
                        },
                      ]
                    );
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 5,
                    marginTop: 6,
                    paddingVertical: 5,
                    paddingHorizontal: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "rgba(74,128,189,0.25)",
                    backgroundColor: "rgba(74,128,189,0.06)",
                    alignSelf: "center",
                  }}
                >
                  <Feather name="plus" size={11} color="#4A80BD" />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "#4A80BD", letterSpacing: 0.5 }}>
                    New business
                  </Text>
                </TouchableOpacity>
              </>
            ) : modulo === "home" && currentSuite !== null ? (
              // Suite sub-home header
              (() => {
                const suite = SUITES.find(su => su.key === currentSuite)!;
                return (
                  <>
                    <View style={[s.suiteHeaderIcon, { backgroundColor: suite.color + "18" }]}>
                      <Feather name={suite.icon} size={18} color={suite.color} />
                    </View>
                    <Text style={[s.headerTitle, { marginTop: 4 }]}>{suite.label}</Text>
                    <Text style={s.headerSub}>{suite.desc}</Text>
                  </>
                );
              })()
            ) : (
              <>
                <Text style={s.headerTitle}>{moduloActual?.label ?? ""}</Text>
                {modulo !== "empresa_config" && (
                  <Text style={s.headerSub}>{moduloActual?.desc ?? ""}</Text>
                )}
              </>
            )}
          </View>
        </View>
        ) : null}

        {/* ── Content area ── */}
        {modulo === "home" ? (
          <ScrollView
            style={s.homeScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: contentPadBottom }}
          >
            <View style={s.empresaHero}>
              <View style={s.empresaHeroTop}>
                <View style={[s.planPill, { backgroundColor: planColor + "22", borderColor: planColor + "44" }]}>
                  <Feather name="star" size={11} color={planColor} />
                  <Text style={[s.planPillTxt, { color: planColor }]}>
                    GO {MOCK_EMPRESA.plan.charAt(0).toUpperCase() + MOCK_EMPRESA.plan.slice(1)}
                  </Text>
                </View>
                <Text style={s.renovacionTxt}>
                  {t('renews_label')} {MOCK_EMPRESA.proximaRenovacion}
                </Text>
              </View>

              <View style={s.metricsRow}>
                <MetricCard
                  label={t('users_label')}
                  value={`${MOCK_EMPRESA.usuariosActivos}`}
                  sub={`/${MOCK_EMPRESA.usuariosLicencia}`}
                  warn={MOCK_EMPRESA.usuariosActivos >= MOCK_EMPRESA.limiteAlerta}
                />
                <MetricCard
                  label={t('monthly_cost_label')}
                  value={`${MOCK_EMPRESA.costeEstimadoMes.toFixed(0)} €`}
                  sub={t('estimated_label')}
                />
                <MetricCard
                  label={t('orbits_label')}
                  value="4"
                  sub={t('active_label_sub')}
                />
              </View>
            </View>

            {currentSuite === null ? (
              // ── Suite selector ──────────────────────────────────────────
              <>
                <Text style={s.secTitle}>GO PLATFORM</Text>
                <View style={s.suitesGrid}>
                  {SUITES.map((suite) => {
                    const suiteModules = MODULOS.filter(m => suite.modules.includes(m.key));
                    const hasBadge = suiteModules.some(m => m.badge);
                    return (
                      <TouchableOpacity
                        key={suite.key}
                        activeOpacity={0.88}
                        onPress={() => {
                          if (suiteModules.length === 1) {
                            goToModulo(suiteModules[0].key);
                          } else {
                            setCurrentSuite(suite.key);
                          }
                        }}
                        style={s.suiteCard}
                      >
                        <View style={s.suiteCardTop}>
                          <View style={[s.suiteCardIcon, { backgroundColor: suite.color + "18" }]}>
                            <Feather name={suite.icon} size={22} color={suite.color} />
                            {hasBadge && showBadges && (
                              <View style={[s.moduloBadge, { backgroundColor: suite.color }]}>
                                <Text style={s.moduloBadgeTxt}>!</Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={[s.suiteLabel, { color: suite.color }]}>{suite.key === "reservas" ? t('mod_booking_label') : suite.label}</Text>
                            <Text style={s.suiteDesc} numberOfLines={2}>{suite.key === "reservas" ? "Booking configuration and real-time operations" : suite.desc}</Text>
                          </View>
                          <Feather name="chevron-right" size={16} color={suite.color + "80"} />
                        </View>
                        <View style={s.suiteChipsRow}>
                          {suiteModules.slice(0, 4).map(m => (
                            <View key={m.key} style={[s.suiteChip, { borderColor: suite.color + "30" }]}>
                              <Text style={[s.suiteChipTxt, { color: suite.color }]}>{m.label}</Text>
                            </View>
                          ))}
                          {suiteModules.length > 4 && (
                            <View style={[s.suiteChip, { borderColor: suite.color + "30" }]}>
                              <Text style={[s.suiteChipTxt, { color: suite.color }]}>+{suiteModules.length - 4}</Text>
                            </View>
                          )}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>

              </>
            ) : currentSuite === "reservas" ? (
              // ── GO Reservas sub-view: Configuración + Daily operations ──
              (() => {
                const { completed, total, nextStep, statusColor, statusDot } = computeConfigProgress(businessConfig);
                const isAllDone = completed === total;
                const progressFraction = completed / total;
                return (
                  <>
                    <Text style={s.secTitle}>GO BOOKINGS</Text>
                    <View style={{ gap: 10 }}>

                      {/* ── Configuración ── */}
                      <TouchableOpacity
                        activeOpacity={0.88}
                        onPress={() => {
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
                            <Text style={[s.suiteLabel, { color: statusColor }]}>Configuration</Text>
                            <Text style={s.suiteDesc}>
                              {statusDot} {completed}/{total} steps completed
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
                          const done = new Set(Array.isArray(businessConfig.completedSteps) ? businessConfig.completedSteps : []);
                          if (businessConfig.businessName?.trim()) done.add(0);
                          if (businessConfig.address?.trim()) done.add(1);
                          if (businessConfig.services?.length > 0) done.add(3);
                          if (businessConfig.plantillaItems?.length > 0) done.add(4);
                          if (businessConfig.bookingEnabled) done.add(7);
                          // Entrelazado: col izq = pasos 1-4, col dcha = pasos 5-8
                          // Row 1: Nombre   | Servicios
                          // Row 2: Ubicación | Reservas
                          // Row 3: Horarios  | Plano
                          // Row 4: Espacios  | Publicación
                          const items: { label: string; step: number }[] = [
                            { label: "Name",       step: 0 },
                            { label: "Services",   step: 3 },
                            { label: "Location",   step: 1 },
                            { label: "Bookings",   step: 5 },
                            { label: "Schedule",   step: 2 },
                            { label: "Floor plan", step: 6 },
                            { label: "Spaces",     step: 4 },
                            { label: "Publishing", step: 7 },
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
                          {isAllDone ? "All set · tap to review" : `Continue at step ${(nextStep >= 0 ? nextStep : 0) + 1} →`}
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
                            <Text style={[s.suiteLabel, { color: "#3D9A84" }]}>Daily operations</Text>
                            <Text style={s.suiteDesc}>Floor plan · calendar · real-time bookings</Text>
                          </View>
                          <Feather name="chevron-right" size={16} color="#3D9A8480" />
                        </View>
                        <View style={s.suiteChipsRow}>
                          {["Floor plan","Calendar","Bookings","Occupancy","Tables/Cabins"].map(label => (
                            <View key={label} style={[s.suiteChip, { borderColor: "#3D9A8430" }]}>
                              <Text style={[s.suiteChipTxt, { color: "#3D9A84" }]}>{label}</Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>

                      {/* ── GO Deportes — solo si el negocio es sector deportes ── */}
                      {businessConfig.sectorId === "deportes" && (
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => goToModulo("deportes_screen")}
                          style={[s.suiteCard, { borderWidth: 1.5, borderColor: "#15803d40" }]}
                        >
                          <View style={s.suiteCardTop}>
                            <View style={[s.suiteCardIcon, { backgroundColor: "#15803d18" }]}>
                              <Feather name="activity" size={22} color="#15803d" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[s.suiteLabel, { color: "#15803d" }]}>GO Deportes</Text>
                              <Text style={s.suiteDesc}>Gestión de espacios deportivos · 34+ tipos</Text>
                            </View>
                            <Feather name="chevron-right" size={16} color="#15803d80" />
                          </View>
                          <View style={s.suiteChipsRow}>
                            {["Pádel","Tenis","Fútbol","Fitness","Piscina"].map(label => (
                              <View key={label} style={[s.suiteChip, { borderColor: "#15803d30" }]}>
                                <Text style={[s.suiteChipTxt, { color: "#15803d" }]}>{label}</Text>
                              </View>
                            ))}
                          </View>
                        </TouchableOpacity>
                      )}

                    </View>
                  </>
                );
              })()
            ) : (
              // ── Suite sub-grid genérica ──────────────────────────────────
              (() => {
                const suite = SUITES.find(su => su.key === currentSuite)!;
                const suiteModules = MODULOS.filter(m => suite.modules.includes(m.key));
                return (
                  <>
                    <Text style={s.secTitle}>MÓDULOS</Text>
                    <View style={s.modulosGrid}>
                      {suiteModules.map((m) => (
                        <TouchableOpacity
                          key={m.key}
                          activeOpacity={0.85}
                          onPress={() => goToModulo(m.key)}
                          style={s.moduloCard}
                        >
                          <View style={[s.moduloIcon, { backgroundColor: m.color + "22" }]}>
                            <Feather name={m.icon} size={20} color={m.color} />
                            {m.badge && showBadges && (
                              <View style={[s.moduloBadge, { backgroundColor: m.color }]}>
                                <Text style={s.moduloBadgeTxt}>{m.badge}</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.moduloLabel}>{m.label}</Text>
                          <Text style={s.moduloDesc} numberOfLines={2}>{m.desc}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                );
              })()
            )}

            <View style={s.infoBox}>
              <Feather name="info" size={13} color="#3b82f6" />
              <Text style={s.infoTxt}>
                {t('empresa_info_text')}
              </Text>
            </View>
          </ScrollView>
        ) : (
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
            {modulo === "empresa_config"   && <EmpresaConfigScreen   key={`ec-${newEmpresaKey}`} onBack={goHome} onOpenVerificacion={onOpenVerificacion} onFinalizarConfig={() => { goHome(); if (onFinalizarWizard) { onFinalizarWizard(); } else { setActivacionVisible(true); } }} initialStep={configInitialStep} goPrevRef={modulePrevRef} />}
            {modulo === "reservas_config"  && <GoReservasConfigScreen onClose={goHome} onOpenVerificacion={onOpenVerificacion} hideFAB={true} />}
            {modulo === "deportes_screen"  && <GoDeportesScreen onClose={goHome} onOpenBooking={(_id, _label, _emoji, _color) => { goToModulo("reservas_config"); }} onOpenVerificacion={onOpenVerificacion} />}

            {/* Gated modules — require Empresa Verificada */}
            {GATED_MODULES.has(modulo) && (
              verification.status === "verified" ? (
                <>
                  {modulo === "facturacion" && <FacturacionScreen guidanceLevel={guidanceLevel} />}
                  {modulo === "admin"       && <AdminScreen       guidanceLevel={guidanceLevel} />}
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
        )}

        {/* ── FABs flotantes — arrastrable con long-press ──────────────────── */}
        <DraggableFAB
          screenKey="empresa"
          buttonKey="main"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={90}
        >
          {/* Botón 1: volver un paso atrás en la ruta real
               – Si EmpresaConfigScreen tiene registrado su goPrev → lo llama
                 (navega por la ruta interna: paso→paso, activity→sector, etc.)
               – Si no → goHome (módulo → suite home) */}
          {(modulo !== "home" || currentSuite !== null) && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (modulo === "empresa_config" && modulePrevRef.current) {
                  modulePrevRef.current();
                } else {
                  goHome();
                }
              }}
              hitSlop={8}
              accessibilityLabel="Volver al paso anterior"
              style={s.fabBtn}
            >
              <Feather name="chevron-down" size={22} color="rgba(255,255,255,0.90)" />
            </TouchableOpacity>
          )}
          {/* Botón 2: cerrar todo el panel — doble flecha para distinguirlo */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel="Cerrar todo"
            style={s.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

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

      </View>

      {/* ── Fase de activación y cobros — independiente del asistente ── */}
      <ActivacionCobrosScreen
        visible={activacionVisible}
        onClose={() => setActivacionVisible(false)}
      />

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
