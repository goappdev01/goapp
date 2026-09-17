/**
 * GoReservasConfigScreen — Panel Operativo GO Reservas
 * ═══════════════════════════════════════════════════════════════════════════
 * Panel de gestión de reservas en tiempo real. Tres vistas:
 *
 *   PLANO      → PlanoEmpresaScreen en pantalla completa
 *   DIVIDIDO   → Plano arriba + lista de reservas abajo (divisor arrastrable)
 *   CALENDARIO → AgendaBoard real (el mismo calendario de GO, sin duplicar)
 *                + selector de profesional: Todos · Empresa · Isa · Rosa · Juani · Antonio · Personal
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type LayoutChangeEvent,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PlanoEmpresaScreen } from "./PlanoEmpresaScreen";
import { DraggableFAB } from "@/components/DraggableFAB";
import { AgendaBoard } from "@/components/AgendaOperativa";
import type { GoEntry, DensityKey, CalDayNightMode } from "@/components/AgendaOperativa";
import { GoCalConfigPanel } from "@/components/GoCalConfigPanel";
import type { CalSizeKey } from "@/constants/goSizes";
import {
  loadReservations,
  loadFloorPlan,
  STATUS_COLORS,
  STATUS_LABELS,
  type FloorReservation,
  type FloorElement,
} from "@/data/floorPlan";
import { formatISODate, getToday } from "@/lib/time";

// ─── Visual tokens ─────────────────────────────────────────────────────────────

const BG     = "#F7F8FA";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.08)";
const TEXT   = "#111827";
const GRAY   = "#6B7280";
const DIM    = "#9CA3AF";
const BLUE   = "#4A80BD";
const GREEN  = "#3D9A84";
const GOLD   = "#C4883A";

// ─── Date helpers ─────────────────────────────────────────────────────────────

const CFG_DAY_KEYS   = ["day_sun","day_mon","day_tue","day_wed","day_thu","day_fri","day_sat"] as const;
const CFG_MONTH_KEYS = ["month_jan","month_feb","month_mar","month_apr","month_may","month_jun","month_jul","month_aug","month_sep","month_oct","month_nov","month_dec"] as const;

function formatTodayLabel(tFn: (key: string) => string): string {
  const d = getToday();
  return `${tFn(CFG_DAY_KEYS[d.getDay()])} ${d.getDate()} ${tFn(CFG_MONTH_KEYS[d.getMonth()]).slice(0, 3)}`;
}

function todayISO(): string {
  return formatISODate(getToday());
}

function getCurrentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Professionals ────────────────────────────────────────────────────────────
// Derived dynamically from config.plantillaItems — no hardcoded names.

// ─── View modes ───────────────────────────────────────────────────────────────

type ViewMode = "plano" | "split" | "calendario";

const VIEW_MODES: { key: ViewMode; icon: keyof typeof Feather.glyphMap; label: string }[] = [
  { key: "plano",      icon: "map",      label: "Plano"      },
  { key: "split",      icon: "layout",   label: "Dividido"   },
  { key: "calendario", icon: "calendar", label: "Calendario" },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface GoReservasConfigScreenProps {
  onClose:                () => void;
  onOpenVerificacion?:    () => void;
  onOpenCalendarPanel?:   () => void;
  onGoToLanding?:         () => void;
  dayNightMode?:          "claro" | "oscuro" | "mixto";
  onDayNightModeChange?:  (m: CalDayNightMode) => void;
  handedness?:            "right" | "left";
  hideFAB?:               boolean;
  navigateToDayISO?:      string | null;
  onNavigateDayConsumed?: () => void;
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────

function computeIsDark(mode?: "claro" | "oscuro" | "mixto"): boolean {
  if (mode === "oscuro") return true;
  if (mode === "claro")  return false;
  const h = new Date().getHours();
  return h < 7 || h >= 20;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GoReservasConfigScreen({ onClose, onOpenVerificacion, onOpenCalendarPanel, onGoToLanding, dayNightMode, onDayNightModeChange, handedness = "right", hideFAB = false, navigateToDayISO, onNavigateDayConsumed }: GoReservasConfigScreenProps) {
  const insets    = useSafeAreaInsets();
  const { config } = useBusinessConfig();
  const { lang, t }  = useLanguage();

  // ── Professional list — built from real plantillaItems, no hardcoded names ──
  const professionals = useMemo<string[]>(() => {
    const names: string[] = ["Todos", "Sin asignar"];
    for (const item of config.plantillaItems) {
      if (item.staffNames && item.staffNames.length > 0) {
        for (const name of item.staffNames) {
          if (name && !names.includes(name)) names.push(name);
        }
      }
    }
    return names;
  }, [config.plantillaItems]);

  const isDark = computeIsDark(dayNightMode);
  const tk = isDark ? {
    bg:     "#0a0a0f",
    card:   "#16161e",
    border: "rgba(255,255,255,0.10)",
    text:   "#f0f0f5",
    gray:   "rgba(255,255,255,0.55)",
    dim:    "rgba(255,255,255,0.30)",
  } : {
    bg:     BG,
    card:   CARD,
    border: BORDER,
    text:   TEXT,
    gray:   GRAY,
    dim:    DIM,
  };

  // ── Gesto de cierre horizontal — misma zona pulgar que el calendario ────────
  const handednessRef = useRef(handedness);
  const onCloseRef    = useRef(onClose);
  useEffect(() => { handednessRef.current = handedness; }, [handedness]);
  useEffect(() => { onCloseRef.current    = onClose;    }, [onClose]);
  const screenWRef = useRef(Dimensions.get("window").width);

  const swipeGestureRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, g) => {
        const h  = handednessRef.current;
        const sw = screenWRef.current;
        const tx = e.nativeEvent.pageX;
        // Sólo captura movimiento claramente horizontal
        if (Math.abs(g.dx) < 8 || Math.abs(g.dx) <= Math.abs(g.dy)) return false;
        // Diestro: zona derecha 25% + dirección derecha
        if (h === "right") return tx >= sw * 0.75 && g.dx > 0;
        // Zurdo: zona izquierda 25% + dirección izquierda
        return tx <= sw * 0.25 && g.dx < 0;
      },
      onPanResponderRelease: (_e, g) => {
        const h = handednessRef.current;
        const triggered =
          (h === "right" && g.dx >  120) ||
          (h === "left"  && g.dx < -120);
        if (triggered) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onCloseRef.current();
        }
      },
      onPanResponderTerminationRequest: () => false,
    })
  ).current;

  const [viewMode, setViewMode] = useState<ViewMode>("split");
  const [calInnerView, setCalInnerView] = useState<"semana" | "mes_lineal" | "dia">("semana");
  // Día seleccionado en el calendario de Reservas (navegación pura, sin flujo GO)
  const [reservasNavSelectedDay, setReservasNavSelectedDay] = useState<string | null>(null);

  // ── Month picker — self-contained Modal (evita conflictos z-order con calOpen) ──
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [pickerYear,  setPickerYear]  = useState(() => new Date().getFullYear());
  const [pickerMonth, setPickerMonth] = useState(() => new Date().getMonth());
  const pickerSlide = useRef(new Animated.Value(700)).current;

  const openMonthPicker = useCallback(() => {
    const [y, m] = calViewMonth.split("-").map(Number);
    setPickerYear(y);
    setPickerMonth(m - 1);
    setMonthPickerOpen(true);
    pickerSlide.setValue(700);
    Animated.timing(pickerSlide, { toValue: 0, duration: 260, useNativeDriver: true }).start();
  }, [calViewMonth, pickerSlide]);

  const closeMonthPicker = useCallback((onDone?: () => void) => {
    Animated.timing(pickerSlide, { toValue: 700, duration: 200, useNativeDriver: true }).start(() => {
      setMonthPickerOpen(false);
      onDone?.();
    });
  }, [pickerSlide]);

  const handlePickerDayTap = useCallback((dayNum: number) => {
    Haptics.selectionAsync().catch(() => {});
    const iso = `${pickerYear}-${String(pickerMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    closeMonthPicker(() => {
      setCalViewMonth(iso.slice(0, 7));
      setCalInnerView("semana");
      setReservasNavSelectedDay(iso);
    });
  }, [pickerYear, pickerMonth, closeMonthPicker]);

  const navigatePickerMonth = useCallback((delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setPickerMonth(prev => {
      let m = prev + delta;
      let y = pickerYear;
      if (m < 0)  { m = 11; y -= 1; }
      if (m > 11) { m = 0;  y += 1; }
      setPickerYear(y);
      return m;
    });
  }, [pickerYear]);

  useEffect(() => {
    if (!navigateToDayISO) return;
    setViewMode("calendario");
    setCalViewMonth(navigateToDayISO.slice(0, 7));
    onNavigateDayConsumed?.();
  }, [navigateToDayISO]);

  // ── Floor plan data ───────────────────────────────────────────────────────
  const [reservas,  setReservas]  = useState<FloorReservation[]>([]);
  const [elements,  setElements]  = useState<FloorElement[]>([]);
  const [loading,   setLoading]   = useState(true);

  const businessId   = "my_business";
  const businessName = config.businessName?.trim() || "Mi negocio";
  const templateId   = config.subId ?? undefined;

  useEffect(() => {
    let active = true;
    setLoading(true);
    Promise.all([
      loadReservations(businessId).catch(() => [] as FloorReservation[]),
      loadFloorPlan(businessId).then(p => p?.elements ?? []).catch(() => [] as FloorElement[]),
    ]).then(([res, els]) => {
      if (!active) return;
      setReservas(res);
      setElements(els);
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [businessId]);

  // ── Calendar data — mismo key que AgendaOperativa (sin duplicar) ──────────
  const [goLog, setGoLog] = useState<GoEntry[]>([]);
  const [calViewMonth, setCalViewMonth] = useState<string>(getCurrentYearMonth);

  // ── Config panel — mismos controles que el Calendario normal ──────────────
  const [configVisible, setConfigVisible] = useState<boolean>(false);
  const [calDensity,    setCalDensity]    = useState<DensityKey>("auto");
  const [calShowHours,  setCalShowHours]  = useState<boolean>(true);
  const [calSize,       setCalSize]       = useState<CalSizeKey>("GO_CAL_SMALL");

  // Carga desde los mismos keys que usa el Calendario (configuración compartida)
  useEffect(() => {
    AsyncStorage.getItem("cal_density").then(v => {
      if (v && (["auto","1h","30min","15min"] as const).includes(v as DensityKey)) setCalDensity(v as DensityKey);
    }).catch(() => {});
    AsyncStorage.getItem("cal_show_hours").then(v => {
      if (v !== null) setCalShowHours(v !== "false");
    }).catch(() => {});
    AsyncStorage.getItem("go_cal_size_v1").then(v => {
      if (v && (["GO_CAL_SMALL","GO_CAL_MEDIUM","GO_CAL_LARGE"] as const).includes(v as CalSizeKey)) setCalSize(v as CalSizeKey);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    AsyncStorage.getItem("go_log_v1").then(raw => {
      if (!raw) return;
      const all: GoEntry[] = JSON.parse(raw);
      // Empresa calendar: each booking generates two go_log_v1 entries (cli + prv).
      // Keep only ONE card per reservationId — prefer kind="sent" (provider card).
      const seenById = new Map<string, { idx: number; isSent: boolean }>();
      const deduped: GoEntry[] = [];
      for (const e of all) {
        const rid = (e as any).reservationId as string | undefined;
        if (e.type === "GO_BOOKING" && rid) {
          const existing = seenById.get(rid);
          if (!existing) {
            seenById.set(rid, { idx: deduped.length, isSent: e.kind === "sent" });
            deduped.push(e);
          } else if (e.kind === "sent" && !existing.isSent) {
            // Upgrade: replace received card with the provider (sent) card
            deduped[existing.idx] = e;
            seenById.set(rid, { idx: existing.idx, isSent: true });
          }
          // else: skip duplicate
        } else {
          deduped.push(e);
        }
      }
      setGoLog(deduped);
    }).catch(() => {});
  }, []);

  // ── Professional selector ─────────────────────────────────────────────────
  const [selectedPro, setSelectedPro] = useState<string>("Todos");

  // ── Booking action handlers — persisten en go_log_v1 ──────────────────────
  const handleChangeEstado = useCallback(async (id: string, estado: GoEntry["estado"]) => {
    setGoLog(prev => {
      const next = prev.map(e => e.id === id ? { ...e, estado } : e);
      AsyncStorage.setItem("go_log_v1", JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const handleDeleteItem = useCallback(async (id: string) => {
    setGoLog(prev => {
      const next = prev.filter(e => e.id !== id);
      AsyncStorage.setItem("go_log_v1", JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const filteredLog = useMemo<GoEntry[]>(() => {
    if (selectedPro === "Todos") return goLog;
    if (selectedPro === "Sin asignar") {
      return goLog.filter(e => {
        const entry = e as GoEntry & { assignedTo?: string };
        const hasProf = !!(entry.professionalName?.trim() || entry.assignedTo?.trim());
        return !hasProf;
      });
    }
    return goLog.filter(e => {
      const entry = e as GoEntry & { assignedTo?: string };
      // professionalName se guarda con emoji prefix ("👤 Isa") pero el pill usa
      // el nombre plano de staffNames ("Isa") — normalizamos antes de comparar.
      const rawName = (entry.professionalName ?? "").replace(/^[\p{Emoji}\s]+/u, "").trim();
      return (
        rawName                  === selectedPro ||
        entry.professionalName   === selectedPro ||
        entry.assignedTo         === selectedPro
      );
    });
  }, [goLog, selectedPro]);

  // ── Split drag handle ─────────────────────────────────────────────────────
  const containerH     = useRef(0);
  const topFlexRef     = useRef(0.45);
  const startFlexRef   = useRef(0.45);
  const [topFlex, setTopFlex] = useState(0.45);

  const panRef = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        startFlexRef.current = topFlexRef.current;
      },
      onPanResponderMove: (_, gs) => {
        if (containerH.current <= 0) return;
        const next = Math.max(0.2, Math.min(0.75,
          startFlexRef.current + gs.dy / containerH.current
        ));
        topFlexRef.current = next;
        setTopFlex(next);
      },
      onPanResponderRelease: () => {
        startFlexRef.current = topFlexRef.current;
      },
    })
  );

  const onContainerLayout = useCallback((e: LayoutChangeEvent) => {
    containerH.current = e.nativeEvent.layout.height;
  }, []);

  const selectMode = (m: ViewMode) => {
    Haptics.selectionAsync().catch(() => {});
    setViewMode(m);
  };

  return (
    <View style={[g.root, { backgroundColor: tk.bg }]} {...swipeGestureRef.panHandlers}>

      {/* ── Header — same safe area top + CONFIG button as the normal Calendar ── */}
      <View style={[g.header, { backgroundColor: tk.card, borderBottomColor: tk.border, paddingTop: insets.top + 8 }]}>
        <View style={g.backBtn} />
        <View style={g.headerCenter}>
          <Text style={[g.headerTitle, { color: tk.text }]}>{lang === "en" ? "GO Bookings" : "GO Reservas"}</Text>
          <Text style={[g.headerSub, { color: tk.dim }]}>{formatTodayLabel(t)} · {lang === "en" ? "live" : "en tiempo real"}</Text>
        </View>
        {/* CONFIG button — exact same style as the normal Calendar */}
        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); setConfigVisible(v => !v); }}
          activeOpacity={0.7}
          hitSlop={10}
          style={{
            flexDirection: "row", alignItems: "center", gap: 4,
            paddingHorizontal: 9, paddingVertical: 5, borderRadius: 9,
            backgroundColor: configVisible ? "rgba(74,128,189,0.18)" : "rgba(0,0,0,0.05)",
            borderWidth: 1,
            borderColor: configVisible ? "rgba(74,128,189,0.55)" : "rgba(0,0,0,0.10)",
          }}
        >
          <Feather
            name={configVisible ? "chevron-up" : "settings"}
            size={9}
            color={configVisible ? "#4A80BD" : tk.gray}
          />
          {!configVisible && (
            <Text style={{ color: tk.gray, fontSize: 8, fontWeight: "700", letterSpacing: 0.8 }}>
              CONFIG
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* ── Panel de config — mismos controles que el Calendario normal ── */}
      {configVisible && (
        <View style={{ backgroundColor: tk.card, borderBottomWidth: 1, borderBottomColor: tk.border, paddingHorizontal: 12, paddingBottom: 10 }}>
          <GoCalConfigPanel
            density={calDensity}
            onDensityChange={(d) => { setCalDensity(d); AsyncStorage.setItem("cal_density", d).catch(() => {}); }}
            timedTaskCount={goLog.filter(e => !e.deleted && e.estado !== "rechazado" && !!e.time).length}
            showHours={calShowHours}
            onShowHoursChange={(v) => { setCalShowHours(v); AsyncStorage.setItem("cal_show_hours", String(v)).catch(() => {}); }}
            dayNightMode={(dayNightMode ?? "mixto") as CalDayNightMode}
            onDayNightModeChange={(m) => { onDayNightModeChange?.(m); AsyncStorage.setItem("cal_day_night_mode_v1", m).catch(() => {}); }}
            calSize={calSize}
            onCalSizeChange={(s) => { setCalSize(s); AsyncStorage.setItem("go_cal_size_v1", s).catch(() => {}); }}
            viewMode={calInnerView === "semana" ? "semana" : "dia"}
            onViewModeChange={(v) => setCalInnerView(v)}
            monthGridOpen={monthPickerOpen}
            onToggleMonthGrid={() => monthPickerOpen ? closeMonthPicker() : openMonthPicker()}
          />
        </View>
      )}

      {/* ── View mode tabs ── */}
      <View style={[g.modeTabs, { backgroundColor: tk.card, borderBottomColor: tk.border }]}>
        {VIEW_MODES.map(m => {
          const active = m.key === viewMode;
          return (
            <TouchableOpacity
              key={m.key}
              activeOpacity={0.8}
              onPress={() => selectMode(m.key)}
              style={[g.modeTab, { backgroundColor: tk.bg, borderColor: tk.border }, active && { backgroundColor: BLUE, borderColor: BLUE }]}
            >
              <Feather name={m.icon} size={14} color={active ? "#fff" : tk.gray} />
              <Text style={[g.modeTabTxt, { color: tk.gray }, active && { color: "#fff" }]}>
                {m.key === "plano" ? t("view_mode_plano") : m.key === "split" ? t("view_mode_dividido") : t("view_mode_calendario")}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Professional selector — solo visible en Calendario ── */}
      {viewMode === "calendario" && (
        <View style={[g.proBar, { backgroundColor: tk.card, borderBottomColor: tk.border }]}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={g.proScroll}
          >
            {professionals.map(pro => {
              const active = pro === selectedPro;
              return (
                <TouchableOpacity
                  key={pro}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setSelectedPro(pro);
                  }}
                  style={[g.proChip, { backgroundColor: tk.bg, borderColor: tk.border }, active && { backgroundColor: GREEN, borderColor: GREEN }]}
                >
                  <Text style={[g.proChipTxt, { color: tk.gray }, active && { color: "#fff" }]}>
                    {pro === "Todos" ? t("filter_todos") : pro === "Sin asignar" ? t("biz_unassigned_filter") : pro}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ── Content area ── */}
      <View style={g.contentArea} onLayout={onContainerLayout}>

        {viewMode === "plano" && (
          <PlanoEmpresaScreen
            businessId={businessId}
            businessName={businessName}
            templateId={templateId}
            onClose={onClose}
            hideFAB
          />
        )}

        {viewMode === "split" && (
          <>
            <View style={{ flex: topFlex }}>
              <PlanoEmpresaScreen
                businessId={businessId}
                businessName={businessName}
                templateId={templateId}
                onClose={() => selectMode("calendario")}
                hideFAB
              />
            </View>

            {/* Drag handle */}
            <View {...panRef.current.panHandlers} style={[g.dragHandle, { backgroundColor: tk.card, borderColor: tk.border }]}>
              <View style={[g.dragBar, { backgroundColor: tk.dim }]} />
            </View>

            <View style={{ flex: 1 - topFlex }}>
              <ReservasList
                reservas={reservas}
                elements={elements}
                loading={loading}
                compact
                isDark={isDark}
              />
            </View>
          </>
        )}

        {viewMode === "calendario" && (
          <AgendaBoard
            goLog={filteredLog}
            embedded
            viewMode={calInnerView}
            calViewMonth={calViewMonth}
            selectedDateISO={reservasNavSelectedDay ?? undefined}
            density={calDensity}
            showHours={calShowHours}
            calSizeKey={calSize}
            calDayNightMode={(dayNightMode ?? "mixto") as CalDayNightMode}
            onChangeEstado={handleChangeEstado}
            onChangeMonth={dir => {
              setCalViewMonth(prev => {
                const [y, m] = prev.split("-").map(Number);
                const d = new Date(y, m - 1 + dir, 1);
                return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
              });
            }}
            onSelectDay={(iso) => {
              // Navegación pura: ir al día en vista semanal (nunca inicia flujo GO)
              setCalViewMonth(iso.slice(0, 7));
              setCalInnerView("semana");
              setReservasNavSelectedDay(iso);
            }}
          />
        )}

      </View>

      {/* ── Franja gestual — misma sombra blanca que el calendario ── */}
      <LinearGradient
        colors={
          handedness === "left"
            ? ["rgba(255,255,255,0.18)", "transparent"]
            : ["transparent", "rgba(255,255,255,0.18)"]
        }
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        pointerEvents="none"
        style={{
          position: "absolute",
          [handedness === "left" ? "left" : "right"]: 0,
          top: "40%",
          bottom: 0,
          width: "25%",
        }}
      />

      {/* ── FABs flotantes — botones redondos, mismo sistema visual que el calendario ── */}
      {!hideFAB && (
        <DraggableFAB
          screenKey="go_reservas"
          buttonKey="main"
          initialRight={20}
          initialBottom={insets.bottom + 24}
          maxH={140}
        >
          {/* ↑ Abre el selector mensual — solo en pestaña Calendario.
               Usa Modal propio para evitar conflictos z-order con el Modal padre. */}
          {viewMode === "calendario" && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); openMonthPicker(); }}
              hitSlop={10}
              accessibilityLabel="Abrir calendario mensual"
              style={g.fabBtn}
            >
              <Feather name="calendar" size={15} color="rgba(255,255,255,0.85)" />
            </TouchableOpacity>
          )}
          {/* ↓ Cerrar un nivel */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onClose(); }}
            hitSlop={10}
            accessibilityLabel={lang === "en" ? "Close GO Bookings" : "Cerrar GO Reservas"}
            style={g.fabBtn}
          >
            <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.80)" />
          </TouchableOpacity>
          {/* ↓↓ Volver al Landing GO */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); onGoToLanding ? onGoToLanding() : onClose(); }}
            hitSlop={10}
            accessibilityLabel="Volver al landing"
            style={g.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.80)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.80)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>
      )}

      {/* ── Month Picker Modal — self-contained, evita conflictos z-order ───────── */}
      <Modal
        visible={monthPickerOpen}
        transparent
        animationType="none"
        onRequestClose={() => closeMonthPicker()}
      >
        {(() => {
          // El picker mensual es SIEMPRE oscuro — coherencia visual con el
          // resto de calendarios de la app (independiente de la hora del día).
          const isDark     = true;
          const MONTHS_ES = CFG_MONTH_KEYS.map(k => t(k).slice(0, 3));
          const DAY_NAMES  = [t("day_mon"),t("day_tue"),t("day_wed"),t("day_thu"),t("day_fri"),t("day_sat"),t("day_sun")];
          const todayStr   = formatISODate(getToday());
          const daysInMonth = new Date(pickerYear, pickerMonth + 1, 0).getDate();
          const firstDow    = new Date(pickerYear, pickerMonth, 1).getDay();
          const offset      = (firstDow + 6) % 7;
          const cells: Array<number | null> = [
            ...Array(offset).fill(null),
            ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
          ];
          while (cells.length % 7 !== 0) cells.push(null);

          return (
            <>
              {/* Dark backdrop */}
              <Pressable
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)" }}
                onPress={() => closeMonthPicker()}
              />

              {/* Sliding panel */}
              <Animated.View
                style={{
                  position: "absolute",
                  left: 0, right: 0, bottom: 0,
                  backgroundColor: isDark ? "#1a1a1f" : "#ffffff",
                  borderTopLeftRadius: 22,
                  borderTopRightRadius: 22,
                  paddingBottom: insets.bottom + 104,
                  transform: [{ translateY: pickerSlide }],
                  shadowColor: "#000",
                  shadowOpacity: 0.4,
                  shadowRadius: 20,
                  shadowOffset: { width: 0, height: -4 },
                }}
              >
                {/* Handle */}
                <View style={{ alignItems: "center", paddingTop: 20, paddingBottom: 4 }}>
                  <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: isDark ? "rgba(255,255,255,0.18)" : "rgba(0,0,0,0.15)" }} />
                </View>

                {/* Month header */}
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 14 }}>
                  <TouchableOpacity onPress={() => navigatePickerMonth(-1)} hitSlop={12} activeOpacity={0.7}>
                    <Feather name="chevron-left" size={22} color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"} />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: isDark ? "#ffffff" : "#111111", letterSpacing: 0.3 }}>
                    {MONTHS_ES[pickerMonth]} {pickerYear}
                  </Text>
                  <TouchableOpacity onPress={() => navigatePickerMonth(1)} hitSlop={12} activeOpacity={0.7}>
                    <Feather name="chevron-right" size={22} color={isDark ? "rgba(255,255,255,0.7)" : "rgba(0,0,0,0.6)"} />
                  </TouchableOpacity>
                </View>

                {/* Day name row */}
                <View style={{ flexDirection: "row", paddingHorizontal: 12, marginBottom: 4 }}>
                  {DAY_NAMES.map(d => (
                    <View key={d} style={{ flex: 1, alignItems: "center" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color: isDark ? "rgba(255,255,255,0.35)" : "rgba(0,0,0,0.35)", letterSpacing: 0.5 }}>{d}</Text>
                    </View>
                  ))}
                </View>

                {/* Day grid */}
                <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                  {Array.from({ length: Math.ceil(cells.length / 7) }, (_, row) => (
                    <View key={row} style={{ flexDirection: "row" }}>
                      {cells.slice(row * 7, row * 7 + 7).map((dayNum, col) => {
                        if (!dayNum) return <View key={col} style={{ flex: 1, height: 40 }} />;
                        const dayISO = `${pickerYear}-${String(pickerMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
                        const isToday    = dayISO === todayStr;
                        const isSelected = dayISO === reservasNavSelectedDay;
                        const isWeekend  = col >= 5;
                        return (
                          <TouchableOpacity
                            key={col}
                            onPress={() => handlePickerDayTap(dayNum)}
                            activeOpacity={0.7}
                            style={{
                              flex: 1, height: 40, alignItems: "center", justifyContent: "center",
                              borderRadius: 20,
                              backgroundColor: isSelected ? "#4A80BD" : isToday ? (isDark ? "rgba(74,128,189,0.22)" : "rgba(74,128,189,0.12)") : "transparent",
                            }}
                          >
                            <Text style={{
                              fontSize: 14,
                              fontWeight: isToday || isSelected ? "800" : "500",
                              color: isSelected
                                ? "#ffffff"
                                : isToday
                                  ? "#4A80BD"
                                  : isWeekend
                                    ? (isDark ? "rgba(255,255,255,0.45)" : "rgba(0,0,0,0.35)")
                                    : (isDark ? "rgba(255,255,255,0.85)" : "rgba(0,0,0,0.80)"),
                            }}>
                              {dayNum}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ))}
                </View>

                {/* ── Botones flotantes de cierre — esquina inferior derecha ─── */}
                <View style={{
                  position: "absolute",
                  bottom: insets.bottom + 20,
                  right: 20,
                  gap: 8,
                  alignItems: "center",
                }}>
                  {/* ↓ Cerrar solo el calendario mensual → vuelve a GO Reservas */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={8}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); closeMonthPicker(); }}
                    accessibilityLabel="Cerrar calendario mensual"
                    style={g.fabBtn}
                  >
                    <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.80)" />
                  </TouchableOpacity>
                  {/* ↓↓ Salir directamente a Landing/Home */}
                  <TouchableOpacity
                    activeOpacity={0.7}
                    hitSlop={8}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      closeMonthPicker(() => { onGoToLanding ? onGoToLanding() : onClose(); });
                    }}
                    accessibilityLabel="Volver al inicio"
                    style={g.fabBtn}
                  >
                    <View style={{ alignItems: "center" }}>
                      <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.80)" />
                      <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.80)" style={{ marginTop: -5 }} />
                    </View>
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </>
          );
        })()}
      </Modal>

    </View>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RESERVAS LIST
// ═══════════════════════════════════════════════════════════════════════════════

function ReservasList({
  reservas,
  elements,
  loading,
  compact = false,
  isDark  = false,
}: {
  reservas:  FloorReservation[];
  elements:  FloorElement[];
  loading:   boolean;
  compact?:  boolean;
  isDark?:   boolean;
}) {
  const insets    = useSafeAreaInsets();
  const { t }     = useLanguage();
  const today     = todayISO();

  const todayReservas = useMemo(() =>
    reservas
      .filter(r => r.date === today && r.status !== "cancelada")
      .sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [reservas, today]
  );

  const upcomingReservas = useMemo(() =>
    reservas
      .filter(r => r.date > today && r.status !== "cancelada")
      .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))
      .slice(0, 8),
    [reservas, today]
  );

  const getElementById = (id: string) => elements.find(e => e.id === id);

  const byStatus = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const el of elements) {
      counts[el.status] = (counts[el.status] ?? 0) + 1;
    }
    return counts;
  }, [elements]);

  if (loading) {
    return (
      <View style={rl.centered}>
        <Text style={rl.dimTxt}>Cargando reservas…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[rl.content, { paddingBottom: compact ? 8 : insets.bottom + 24 }]}
    >

      {/* Espacios overview — solo en vista completa dentro del split */}
      {!compact && elements.length > 0 && (
        <>
          <Text style={rl.sectionTitle}>ESPACIOS HOY</Text>

          <View style={rl.statusRow}>
            {Object.entries(byStatus).map(([st, count]) => (
              <View key={st} style={[rl.statusPill, { borderColor: STATUS_COLORS[st as keyof typeof STATUS_COLORS] + "50" }]}>
                <View style={[rl.statusDot, { backgroundColor: STATUS_COLORS[st as keyof typeof STATUS_COLORS] }]} />
                <Text style={[rl.statusPillTxt, { color: STATUS_COLORS[st as keyof typeof STATUS_COLORS] }]}>
                  {count} {STATUS_LABELS[st as keyof typeof STATUS_LABELS]}
                </Text>
              </View>
            ))}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={rl.elementsScroll}
          >
            {elements.map(el => (
              <View key={el.id} style={[rl.elementChip, { borderColor: STATUS_COLORS[el.status] + "40" }]}>
                <View style={[rl.elementDot, { backgroundColor: STATUS_COLORS[el.status] }]} />
                <Text style={rl.elementLabel}>{el.label}</Text>
                <Text style={[rl.elementStatus, { color: STATUS_COLORS[el.status] }]}>
                  {STATUS_LABELS[el.status]}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      )}

      <Text style={rl.sectionTitle}>
        {t("status_today").toUpperCase()} — {formatTodayLabel(t).toUpperCase()}
        {todayReservas.length > 0 && (
          <Text style={[rl.sectionTitle, { color: BLUE }]}> · {todayReservas.length}</Text>
        )}
      </Text>

      {todayReservas.length === 0 ? (
        <View style={rl.emptyCard}>
          <Feather name="calendar" size={compact ? 18 : 24} color={DIM} />
          <Text style={rl.emptyCardTxt}>
            {compact ? t("biz_no_bookings_today_short") : t("biz_no_bookings_today_long")}
          </Text>
        </View>
      ) : (
        todayReservas.map(r => (
          <ReservaRow
            key={r.id}
            reserva={r}
            element={getElementById(r.elementId)}
            compact={compact}
            isDark={isDark}
          />
        ))
      )}

      {!compact && upcomingReservas.length > 0 && (
        <>
          <Text style={[rl.sectionTitle, { marginTop: 16 }]}>PRÓXIMAS RESERVAS</Text>
          {upcomingReservas.map(r => (
            <ReservaRow
              key={r.id}
              reserva={r}
              element={getElementById(r.elementId)}
              showDate
              isDark={isDark}
            />
          ))}
        </>
      )}

    </ScrollView>
  );
}

// ─── Single reserva row ───────────────────────────────────────────────────────

const STATUS_ROW_COLORS: Record<string, string> = {
  confirmada:       "#3D9A84",
  pendiente:        "#C4883A",
  cancelada:        "#EF4444",
  completada:       "#6B7280",
  cambio_pendiente: "#f97316",
};

function ReservaRow({
  reserva,
  element,
  showDate = false,
  compact  = false,
  isDark   = false,
}: {
  reserva:   FloorReservation;
  element:   FloorElement | undefined;
  showDate?: boolean;
  compact?:  boolean;
  isDark?:   boolean;
}) {
  const color = STATUS_ROW_COLORS[reserva.status] ?? DIM;
  const dateShort = reserva.date.slice(5).replace("-", "/");

  const rowBg      = isDark ? "#1e1e2e" : CARD;
  const rowBorder  = isDark ? "rgba(255,255,255,0.10)" : BORDER;
  const timeColor  = isDark ? "#f0f0f5" : TEXT;
  const guestColor = isDark ? "rgba(255,255,255,0.70)" : GRAY;
  const dimColor   = isDark ? "rgba(255,255,255,0.38)" : DIM;

  return (
    <View style={[rl.row, { backgroundColor: rowBg, borderColor: rowBorder }]}>
      <View style={[rl.rowAccent, { backgroundColor: color }]} />
      <View style={rl.rowBody}>
        <View style={rl.rowTopLine}>
          <Text style={[rl.rowTime, { color: timeColor }]}>{reserva.startTime}–{reserva.endTime}</Text>
          {showDate && <Text style={[rl.rowDate, { color: dimColor }]}>{dateShort}</Text>}
          <View style={[rl.statusBadge, { backgroundColor: color + "22", borderColor: color + "55" }]}>
            <Text style={[rl.statusBadgeTxt, { color }]}>{reserva.status}</Text>
          </View>
        </View>
        <Text style={[rl.rowGuest, { color: guestColor }]}>{reserva.guestName || "Cliente"}</Text>
        {element && !compact && (
          <Text style={[rl.rowElement, { color: dimColor }]}>📍 {element.label}</Text>
        )}
        {reserva.notes ? (
          <Text style={[rl.rowNotes, { color: dimColor }]} numberOfLines={1}>{reserva.notes}</Text>
        ) : null}
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root:         { flex: 1, backgroundColor: BG },

  header:       {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: BORDER, backgroundColor: CARD,
  },
  backBtn:      { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerCenter: { flex: 1, alignItems: "center" },
  headerTitle:  { fontSize: 15, fontWeight: "800", color: TEXT },
  headerSub:    { fontSize: 11, fontWeight: "500", color: DIM, marginTop: 1 },

  modeTabs: {
    flexDirection: "row", gap: 8, backgroundColor: CARD,
    paddingHorizontal: 14, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  modeTab: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 5, paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: 10, borderWidth: 1, borderColor: BORDER, backgroundColor: BG,
  },
  modeTabTxt:    { fontSize: 12, fontWeight: "700", color: GRAY },

  proBar: {
    backgroundColor: CARD,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
  },
  proScroll: {
    flexDirection: "row",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  proChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 99,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: BG,
  },
  proChipTxt: {
    fontSize: 12,
    fontWeight: "700",
    color: GRAY,
  },

  contentArea:   { flex: 1 },

  dragHandle: {
    height: 28, backgroundColor: CARD,
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: BORDER,
  },
  dragBar: { width: 36, height: 4, borderRadius: 2, backgroundColor: DIM + "50" },

  fabBtn: {
    width:           36,
    height:          36,
    borderRadius:    10,
    backgroundColor: "#0e0e10",
    borderWidth:     1.5,
    borderColor:     "rgba(255,255,255,0.40)",
    alignItems:      "center",
    justifyContent:  "center",
    shadowColor:     "#000",
    shadowOpacity:   0.40,
    shadowRadius:    10,
    shadowOffset:    { width: 0, height: 4 },
    elevation:       10,
  },

});

const rl = StyleSheet.create({
  content:     { padding: 14 },
  centered:    { flex: 1, alignItems: "center", justifyContent: "center" },
  dimTxt:      { fontSize: 13, color: DIM },

  sectionTitle: {
    fontSize: 10, fontWeight: "900", color: DIM,
    letterSpacing: 1.8, marginBottom: 10,
  },

  statusRow:    { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 10 },
  statusPill:   {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderRadius: 99, borderWidth: 1,
    paddingHorizontal: 9, paddingVertical: 4,
    backgroundColor: CARD,
  },
  statusDot:    { width: 7, height: 7, borderRadius: 4 },
  statusPillTxt:{ fontSize: 11, fontWeight: "700" },

  elementsScroll: { gap: 8, paddingBottom: 12 },
  elementChip: {
    alignItems: "center", gap: 4,
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1,
    padding: 10, minWidth: 72,
  },
  elementDot:    { width: 8, height: 8, borderRadius: 4 },
  elementLabel:  { fontSize: 11, fontWeight: "700", color: TEXT, textAlign: "center" },
  elementStatus: { fontSize: 10, fontWeight: "600", textAlign: "center" },

  emptyCard: {
    flexDirection: "row", alignItems: "center", gap: 10,
    padding: 16, backgroundColor: CARD, borderRadius: 14,
    borderWidth: 1, borderColor: BORDER, marginBottom: 10,
  },
  emptyCardTxt:  { fontSize: 13, color: DIM },

  row: {
    flexDirection: "row", alignItems: "stretch",
    backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER,
    marginBottom: 8, overflow: "hidden",
  },
  rowAccent:   { width: 4, flexShrink: 0 },
  rowBody:     { flex: 1, padding: 10, gap: 3 },
  rowTopLine:  { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  rowTime:     { fontSize: 13, fontWeight: "700", color: TEXT },
  rowDate:     { fontSize: 11, fontWeight: "600", color: DIM },
  rowGuest:    { fontSize: 13, fontWeight: "600", color: GRAY },
  rowElement:  { fontSize: 11, color: DIM },
  rowNotes:    { fontSize: 11, color: DIM, fontStyle: "italic" },

  statusBadge: {
    borderRadius: 6, borderWidth: 1,
    paddingHorizontal: 6, paddingVertical: 2,
    marginLeft: "auto",
  },
  statusBadgeTxt: { fontSize: 10, fontWeight: "700" },
});
