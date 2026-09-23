import React, { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { LinearGradient } from "expo-linear-gradient";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  Keyboard,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  SlotWithStatus,
  AvailableSlot,
  BookableItem,
  Booking,
  BookingApiError,
  Business,
  Staff,
  cancelBooking,
  claimSlot,
  computeRefundInfo,
  createHold,
  getAllSlots,
  getActivebusinesses,
  getBookableItems,
  getStaff,
  searchBusinesses,
} from "@/data/booking";
import {
  getRecentBusinessIds,
  recordBusinessVisit,
} from "@/data/goRecentBusinesses";
import { SECTORS } from "@/data/goSectorData";
import { trSector } from "@/data/goSectorTranslations";
import { syncBookingToGoLog } from "@/lib/goLogBridge";
import { formatISODate, getToday } from "@/lib/time";
import { useLanguage } from "@/contexts/LanguageContext";
import { MyBookingsList } from "@/components/booking/MyBookingsList";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

// ── Staff schedule helpers ──────────────────────────────────────────────────────
//
// Reads `go_business_config_v1` and returns the custom shifts for a specific staff
// member on a given JS weekday (0=Sun…6=Sat).
//
// Returns:
//   null  → staff has no custom schedule (or useCompanySchedule=true) → show all slots
//   []    → staff works CUSTOM schedule but this day is closed → no slots
//   [{fromMin, toMin}, …] → allowed shift windows for this day
//
async function getStaffShiftsForDay(
  businessId: string,
  staffName: string,
  weekdayJS: number,
): Promise<{ fromMin: number; toMin: number }[] | null> {
  try {
    const raw = await AsyncStorage.getItem("go_business_config_v1");
    if (!raw) return null;
    const cfg = JSON.parse(raw) as {
      staffSchedules?: Record<string, {
        useCompanySchedule: boolean;
        daySchedules?: Record<string, {
          shift1?: { active?: boolean; from?: string; to?: string };
          shift2?: { active?: boolean; from?: string; to?: string };
        }>;
      }>;
    };
    // Stable key used by GoBusinessConfigContext: businessId_staff_normalized_name
    const stableKey = `${businessId}_staff_${staffName.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;
    const staffSched = cfg.staffSchedules?.[stableKey];
    if (!staffSched || staffSched.useCompanySchedule) return null; // fallback to company
    // configDay: GoBusinessConfigContext uses Mon=0…Sun=6
    const configDay = (weekdayJS + 6) % 7;
    const ds = staffSched.daySchedules?.[String(configDay)];
    // Custom schedule: missing day key = closed for this professional (never fall back to company)
    if (!ds) return [];
    const parseMin = (t: string) => {
      const [h, m] = t.split(":").map(Number);
      return h * 60 + (m || 0);
    };
    const shifts: { fromMin: number; toMin: number }[] = [];
    if (ds.shift1?.active !== false && ds.shift1?.from && ds.shift1?.to) {
      shifts.push({ fromMin: parseMin(ds.shift1.from), toMin: parseMin(ds.shift1.to) });
    }
    if (ds.shift2?.active && ds.shift2?.from && ds.shift2?.to) {
      shifts.push({ fromMin: parseMin(ds.shift2.from), toMin: parseMin(ds.shift2.to) });
    }
    // Custom schedule: no active shifts on this day = closed (never fall back to company hours)
    if (shifts.length === 0) return [];
    return shifts;
  } catch {
    return null;
  }
}

/** Filter slots to only those that fit entirely within one of the given shift windows. */
function filterSlotsByShifts<T extends { startDatetime: string; endDatetime: string }>(
  slots: T[],
  shifts: { fromMin: number; toMin: number }[],
): T[] {
  if (shifts.length === 0) return [];
  return slots.filter((slot) => {
    const sH = parseInt(slot.startDatetime.slice(11, 13), 10);
    const sM = parseInt(slot.startDatetime.slice(14, 16), 10);
    const eH = parseInt(slot.endDatetime.slice(11, 13), 10);
    const eM = parseInt(slot.endDatetime.slice(14, 16), 10);
    const startMin = sH * 60 + sM;
    const endMin   = eH * 60 + eM;
    return shifts.some((sh) => startMin >= sh.fromMin && endMin <= sh.toMin);
  });
}

const RESULT_CARD_H     = 80;  // paddingVertical 32 + content ~40 + marginBottom 8
const MAX_VISIBLE_RESULTS = 4; // más de 4 → scroll interno

// ── Display helpers ────────────────────────────────────────────────────────────

/** Extract city from a Spanish address: "Calle X, 30500 Molina de Segura, Murcia" → "Molina de Segura" */
function extractCity(location: string): string {
  if (!location) return "";
  // Skip raw GPS coordinates
  if (/^[-\d.]+,\s*[-\d.]+$/.test(location)) return "";
  const postalMatch = location.match(/\d{5}\s+([^,]+)/);
  if (postalMatch) return postalMatch[1].trim();
  const parts = location.split(",").map(s => s.trim()).filter(Boolean);
  // If the first part looks like a street, return the second; else return the first
  return parts.length > 1 ? parts[1] : parts[0] || "";
}

/** Human-readable label for a sector or sub-sector id, translated when lang==="en" */
function catLabel(id: string, lang: string): string {
  for (const s of SECTORS) {
    if (s.id === id) return trSector(s.label, lang as any);
    for (const sub of s.subs) {
      if (sub.id === id) return trSector(sub.name, lang as any);
    }
  }
  return trSector(id, lang as any);
}

function formatTime(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const DATE_DAY_KEYS   = ["day_sun","day_mon","day_tue","day_wed","day_thu","day_fri","day_sat"] as const;
const DATE_MONTH_KEYS = ["month_jan","month_feb","month_mar","month_apr","month_may","month_jun","month_jul","month_aug","month_sep","month_oct","month_nov","month_dec"] as const;

function formatDateLabel(dateISO: string, t: ReturnType<typeof useLanguage>["t"]): string {
  const today = formatISODate(getToday());
  const tomorrow = formatISODate(new Date(getToday().getTime() + 86_400_000));
  if (dateISO === today) return t("status_today");
  if (dateISO === tomorrow) return t("status_tomorrow");
  const d = new Date(dateISO + "T00:00:00");
  return `${t(DATE_DAY_KEYS[d.getDay()])} ${d.getDate()} ${t(DATE_MONTH_KEYS[d.getMonth()]).slice(0, 3).toLowerCase()}`;
}

function getDaysRange(count = 21): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(getToday().getTime() + i * 86_400_000);
    days.push(formatISODate(d));
  }
  return days;
}

// ── Hold Countdown ─────────────────────────────────────────────────────────────

function HoldCountdown({
  expiresAt,
  onExpire,
  accentColor,
}: {
  expiresAt: string;
  onExpire: () => void;
  accentColor: string;
}) {
  const [remaining, setRemaining] = useState(0);
  const barAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const tick = () => {
      const secs = Math.max(
        0,
        Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)
      );
      setRemaining(secs);
      if (secs === 0) onExpire();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [expiresAt, onExpire]);

  const pct = remaining / 15;
  const color = remaining > 8 ? accentColor : remaining > 4 ? "#f59e0b" : "#ef4444";

  // V1: timer is silent — it only fires onExpire, no visual countdown shown
  return null;
}

const hc = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 4,
  },
  track: {
    height: 3,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderRadius: 2,
    overflow: "hidden",
  },
  bar: {
    height: 3,
    borderRadius: 2,
  },
  text: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textAlign: "center",
    textTransform: "uppercase",
  },
});

// ── Breadcrumb strip ────────────────────────────────────────────────────────────

function BreadcrumbStrip({
  business,
  item,
  date,
  accentColor,
}: {
  business: Business | null;
  item: BookableItem | null;
  date?: string;
  accentColor: string;
}) {
  const { t, lang } = useLanguage();
  if (!business) return null;
  return (
    <View style={bc.row}>
      <View style={[bc.pill, { borderColor: `${accentColor}40`, backgroundColor: `${accentColor}12` }]}>
        <Text style={[bc.text, { color: accentColor }]} numberOfLines={1}>
          {business.name}
        </Text>
      </View>
      {item && (
        <>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.20)" />
          <View style={bc.pillDim}>
            <Text style={bc.textDim} numberOfLines={1}>{trSector(item.title, lang)}</Text>
          </View>
        </>
      )}
      {item && date && (
        <>
          <Feather name="chevron-right" size={12} color="rgba(255,255,255,0.20)" />
          <View style={bc.pillDim}>
            <Text style={bc.textDim}>{formatDateLabel(date, t)}</Text>
          </View>
        </>
      )}
    </View>
  );
}

const bc = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 20,
    paddingBottom: 14,
    flexWrap: "wrap",
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 140,
  },
  pillDim: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    maxWidth: 120,
  },
  text: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  textDim: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 12,
    fontWeight: "600",
  },
});

// ── Main overlay ───────────────────────────────────────────────────────────────

export type BookingSearchOverlayProps = {
  visible: boolean;
  onClose: () => void;
  /** ↓↓ Cierra TODO el flujo y vuelve al Landing directamente (sin pasos intermedios). */
  onDismissAll?: () => void;
  onBookingConfirmed?: (booking: Booking, business: Business, item: BookableItem, professionalName?: string) => void;
  externalBorderColor?: string;
  onProviderSelected?: (business: Business | null) => void;
  /** Llamado inmediatamente cuando se crea un HOLD — permite refrescar contadores sin esperar al polling */
  onHoldCreated?: () => void;
  /** Llamado al pulsar OK en RESERVA CONFIRMADA — cierra el overlay y navega al calendario */
  onGoToBooking?: (dateISO: string, timeHHMM: string, entryId: string) => void;
};

type Step = "search" | "item" | "professional" | "slots" | "hold" | "confirmed";

const STEP_ORDER: Step[] = ["search", "item", "professional", "slots", "hold", "confirmed"];

export function BookingSearchOverlay({
  visible,
  onClose,
  onDismissAll,
  onBookingConfirmed,
  onProviderSelected,
  onHoldCreated,
  onGoToBooking,
}: BookingSearchOverlayProps) {
  const { t, lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(SCREEN_H)).current;
  const dragAnim  = useRef(new Animated.Value(0)).current;
  const stepAnim  = useRef(new Animated.Value(0)).current;
  const prevStep  = useRef<Step>("search");

  const handleCloseRef   = useRef<() => void>(() => {});
  const handleBackRef    = useRef<() => void>(() => {});
  const dismissAllRef    = useRef<() => void>(() => {});

  // ── PanResponder botón "retroceder un nivel" (flecha simple) ─────────────
  const closePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {},
      onPanResponderRelease: () => { handleBackRef.current(); },
      onPanResponderTerminate: () => {},
    })
  ).current;

  // ── PanResponder botón "ir al Landing" (doble flecha) ────────────────────
  const landingPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponderCapture: () => true,
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {},
      onPanResponderRelease: () => { dismissAllRef.current(); },
      onPanResponderTerminate: () => {},
    })
  ).current;

  const dragHandlePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 4 && g.dy > Math.abs(g.dx),
      onPanResponderMove: (_, g) => {
        if (g.dy > 0) dragAnim.setValue(g.dy);
      },
      onPanResponderRelease: (_, g) => {
        if (g.dy > 80 || g.vy > 0.8) {
          handleCloseRef.current();
          dragAnim.setValue(0);
        } else {
          Animated.spring(dragAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(dragAnim, { toValue: 0, useNativeDriver: true, damping: 20, stiffness: 200 }).start();
      },
    })
  ).current;

  // ── Gesto derecho de cierre ─────────────────────────────────────────────
  // Usa onMoveShouldSetPanResponder (NO Capture) para que el sheet NO pueda
  // robar el responder del botón de cierre cuando closePan ya lo tiene.
  const rightSwipePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (e, g) => {
        if (Math.abs(g.dy) <= 12 || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
        return e.nativeEvent.pageX >= SCREEN_W * 0.75;
      },
      onPanResponderRelease: (_e, g) => {
        if (g.dy > 80) handleCloseRef.current();
      },
      onPanResponderTerminate: () => {},
    })
  ).current;

  // ── Keyboard awareness ────────────────────────────────────────────────────
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = Keyboard.addListener(showEvt, (e) => {
      setKeyboardVisible(true);
      setKeyboardHeight(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      setKeyboardVisible(false);
      setKeyboardHeight(0);
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  const [step, setStep] = useState<Step>("search");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [selectedSubCategory, setSelectedSubCategory] = useState<string | null>(null);
  const [results, setResults] = useState<Business[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [recentBizs, setRecentBizs] = useState<Business[]>([]);
  const [items, setItems] = useState<BookableItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<BookableItem | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [selectedStaff, setSelectedStaff] = useState<Staff | null | "none">(null);
  const [selectedDate, setSelectedDate] = useState(formatISODate(getToday()));
  const [slots, setSlots] = useState<SlotWithStatus[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [activeHold, setActiveHold] = useState<Booking | null>(null);
  const [confirmedBooking, setConfirmedBooking] = useState<Booking | null>(null);
  const [confirming, setConfirming] = useState(false);
  // Anti-doble-reserva: true cuando claimSlot o isSlotOccupied detectan conflicto
  const [slotTakenError, setSlotTakenError] = useState(false);

  const days = getDaysRange(21);

  const goToStep = (next: Step, direction: "forward" | "back" = "forward") => {
    const offset = direction === "forward" ? SCREEN_W : -SCREEN_W;
    stepAnim.setValue(offset);
    setStep(next);
    Animated.spring(stepAnim, {
      toValue: 0,
      useNativeDriver: true,
      damping: 26,
      stiffness: 260,
      mass: 0.8,
    }).start();
    prevStep.current = next;
  };

  useEffect(() => {
    if (visible) {
      setStep("search");
      setQuery("");
      setSelectedCategory(null);
      setSelectedSubCategory(null);
      setResults([]);
      setSelectedBusiness(null);
      setSelectedItem(null);
      setStaffList([]);
      setSelectedStaff(null);
      setActiveHold(null);
      setConfirmedBooking(null);
      dragAnim.setValue(0);
      stepAnim.setValue(0);
      // Cargar negocios recientes
      getRecentBusinessIds(5).then(async (ids) => {
        if (ids.length === 0) { setRecentBizs([]); return; }
        const all = await getActivebusinesses();
        const ordered = ids
          .map((id) => all.find((b) => b.id === id))
          .filter((b): b is Business => !!b);
        setRecentBizs(ordered);
      }).catch(() => {});
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        damping: 24,
        stiffness: 220,
        mass: 0.85,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: SCREEN_H,
        duration: 260,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || step !== "search") return;
    // Search triggers with ≥1 char typed OR a subcategory selected.
    // Browsing categories (madre) only shows subcategories — no search yet.
    if (query.length < 1 && !selectedSubCategory) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const timer = setTimeout(async () => {
      const r = await searchBusinesses(query);
      // Client-side sub-category filter
      const filtered = selectedSubCategory
        ? r.filter(b => {
            if (b.category === selectedSubCategory) return true;
            // Also match businesses whose category is the parent sector id
            const parentSector = SECTORS.find(s => s.subs.some(sub => sub.id === selectedSubCategory));
            return !!(parentSector && b.category === parentSector.id);
          })
        : r;
      setResults(filtered);
      setSearching(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, visible, step, selectedSubCategory]);

  useEffect(() => {
    if (!selectedBusiness) return;
    getBookableItems(selectedBusiness.id).then((its) =>
      setItems(its.filter((i) => i.active && i.visible))
    );
    getStaff(selectedBusiness.id).then((all) => {
      // ── Limpieza defensiva antes de pintar profesionales ──────────────────
      // 1. Eliminar registros sin id o con nombre < 3 chars (parciales legacy)
      // 2. Deduplicar por nombre normalizado
      const seenNorm = new Set<string>();
      const clean = all.filter((s) => {
        if (!s.id) return false;
        const name = (s.name ?? "").trim();
        if (name.length < 3) return false;
        const norm = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (seenNorm.has(norm)) return false;
        seenNorm.add(norm);
        return true;
      });
      console.log("PROFESSIONALS_SOURCE = go_staff_v1 businessId=" + selectedBusiness.id);
      console.log("PROFESSIONALS_RENDERED =", clean.map((s) => s.name));
      setStaffList(clean);
    }).catch(() => {});
  }, [selectedBusiness]);

  const loadSlots = useCallback(async () => {
    if (!selectedBusiness || !selectedItem) return;
    setLoadingSlots(true);
    // Pass staffId so the slot engine uses staff-specific AvailabilityWindows when
    // they exist (created by syncWithBookingSystem). Falls back to business-level
    // windows automatically when no staff windows are found for that day.
    const staffId = selectedStaff && selectedStaff !== "none" ? selectedStaff.id : undefined;
    console.log("[loadSlots] businessId →", selectedBusiness.id,
      "| itemId →", selectedItem.id,
      "| date →", selectedDate,
      "| staffId usado →", staffId ?? "(sin profesional)");
    const raw = await getAllSlots(
      selectedBusiness.id,
      selectedItem.id,
      selectedDate,
      staffId,
    );
    console.log("[loadSlots] slots totales →", raw.length,
      "| disponibles →", raw.filter(s => s.isAvailable).length,
      "| bloqueados →", raw.filter(s => !s.isAvailable).length);
    console.log("[loadSlots] slots bloqueados (ocupados):",
      raw.filter(s => !s.isAvailable).map(s => s.startDatetime.substring(11, 16)));

    // ── Horario personalizado del profesional ──────────────────────────────
    // Si el cliente seleccionó un profesional concreto (no "Sin preferencia"),
    // y ese profesional tiene horario propio (useCompanySchedule=false),
    // filtramos los slots para que solo aparezcan los que caben dentro de
    // sus turnos. Los slots fuera de esos turnos no se muestran.
    if (selectedStaff && selectedStaff !== "none") {
      const weekdayJS = new Date(selectedDate + "T00:00:00").getDay();
      const staffShifts = await getStaffShiftsForDay(
        selectedBusiness.id,
        selectedStaff.name,
        weekdayJS,
      );
      if (staffShifts !== null) {
        // staffShifts is a non-empty array of valid shift windows → filter slots to those windows
        setSlots(filterSlotsByShifts(raw, staffShifts));
        setLoadingSlots(false);
        return;
      }
    }

    setSlots(raw);
    setLoadingSlots(false);
  }, [selectedBusiness, selectedItem, selectedDate, selectedStaff]);

  useEffect(() => {
    if (step === "slots") loadSlots();
  }, [step, loadSlots]);

  const handleSelectBusiness = (b: Business) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedBusiness(b);
    onProviderSelected?.(b);
    recordBusinessVisit(b.id).catch(() => {});
    goToStep("item", "forward");
  };

  const handleSelectItem = (item: BookableItem) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedItem(item);
    setSelectedStaff(null);
    // Siempre muestra el paso de profesional (incluye "Sin preferencia" aunque no haya staff)
    goToStep("professional", "forward");
  };

  const handleSelectStaff = (staff: Staff | "none") => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedStaff(staff);
    goToStep("slots", "forward");
  };

  const handleSelectSlot = async (slot: AvailableSlot) => {
    if (!selectedBusiness || !selectedItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const staffId = selectedStaff && selectedStaff !== "none" ? selectedStaff.id : undefined;
      console.log("[BOOKING_CHECK_INPUT] handleSelectSlot →", {
        businessId:    selectedBusiness.id,
        staffId,
        selectedStaffRaw: selectedStaff === null ? "null" : selectedStaff === "none" ? "none" : `${(selectedStaff as any).id} (${(selectedStaff as any).name})`,
        startDatetime: slot.startDatetime,
        endDatetime:   slot.endDatetime,
        serviceId:     selectedItem.id,
        serviceTitle:  selectedItem.title,
      });
      setSlotTakenError(false);
      // createHold llama a claimSlotOrReject internamente — READ→CHECK→WRITE atómico.
      // No hay pre-check por UI: el bloqueo vive en la capa de storage.
      const result = await createHold({
        businessId: selectedBusiness.id,
        bookableItemId: selectedItem.id,
        customerId: "me",
        staffId,
        startDatetime: slot.startDatetime,
        endDatetime: slot.endDatetime,
        unitsReserved: 1,
        peopleCount: 1,
      });
      if (!result.ok) {
        // El slot ya estaba ocupado en el momento de escribir el HOLD
        setSlotTakenError(true);
        loadSlots();
        return;
      }
      setActiveHold(result.booking);
      goToStep("hold", "forward");
      // Notifica inmediatamente — sin esperar al polling de 3 min
      onHoldCreated?.();
    } catch {
      loadSlots();
    }
  };

  const handleConfirm = async () => {
    console.log("[ENTER_FUNCTION] BookingSearchOverlay.handleConfirm ENTERED", {
      hasActiveHold: !!activeHold,
      holdId:        activeHold?.id,
      holdStatus:    activeHold?.status,
      businessId:    selectedBusiness?.id,
      itemId:        selectedItem?.id,
      step,
    });
    console.log("[CONFIRM_PATH_REACHED] BookingSearchOverlay.handleConfirm ENTERED", {
      hasActiveHold: !!activeHold,
      hasSelectedBusiness: !!selectedBusiness,
      hasSelectedItem: !!selectedItem,
    });
    if (!activeHold || !selectedBusiness || !selectedItem) return;
    setConfirming(true);
    setSlotTakenError(false);

    console.log("[BOOKING_CHECK_INPUT] handleConfirm (HOLD→CONFIRMED) →", {
      holdId:        activeHold.id,
      businessId:    activeHold.businessId,
      staffId:       activeHold.staffId,
      startDatetime: activeHold.startDatetime,
      endDatetime:   activeHold.endDatetime,
    });

    // ── BLOQUEO ATÓMICO: claimSlot con self-replace (HOLD → CONFIRMED) ────────
    // Pasa el mismo ID del HOLD → claimSlot lo salta en el check de conflictos
    // y lo reemplaza en storage (upsert). Si otro booking coincide, devuelve ok:false.
    let result;
    try {
      result = await claimSlot({
        ...activeHold,
        status: "CONFIRMED",
        holdExpiresAt: undefined,
      });
    } catch (error) {
      setConfirming(false);
      if (
        error instanceof BookingApiError &&
        (error.status === 409 || error.code === "23P01" || error.code === "BOOKING_CONFLICT")
      ) {
        cancelBooking(activeHold.id).catch(() => {});
        setActiveHold(null);
        setSlotTakenError(true);
        goToStep("slots", "back");
        loadSlots();
        return;
      }
      if (error instanceof Error) {
        Alert.alert("No se pudo confirmar", error.message);
      } else {
        Alert.alert("No se pudo confirmar", "Inicia sesión e inténtalo de nuevo.");
      }
      return;
    }

    setConfirming(false);

    if (!result.ok) {
      // Slot ya ocupado por otra reserva — mostrar error, cancelar HOLD y volver a slots
      cancelBooking(activeHold.id).catch(() => {});
      setActiveHold(null);
      setSlotTakenError(true);
      goToStep("slots", "back");
      loadSlots();
      return;
    }

    const confirmed = result.booking;
    setConfirmedBooking(confirmed);
    // Derive professional info BEFORE callback so caller also receives it
    const proNameForLog =
      selectedStaff === null   ? undefined :
      selectedStaff === "none" ? t("biz_no_preference") :
      `${selectedStaff.emoji ?? "👤"} ${selectedStaff.name}`;
    const proIdForLog =
      selectedStaff === null || selectedStaff === "none" ? undefined :
      selectedStaff.id;
    onBookingConfirmed?.(confirmed, selectedBusiness, selectedItem, proNameForLog);
    // Auto-sync confirmed booking to GO log (with professional info)
    syncBookingToGoLog(confirmed, selectedBusiness, selectedItem, proNameForLog, proIdForLog).catch(() => {});
    goToStep("confirmed", "forward");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handleHoldExpired = () => {
    if (activeHold) cancelBooking(activeHold.id);
    setActiveHold(null);
    goToStep("slots", "back");
    loadSlots();
  };

  const handleBack = () => {
    if (step === "item") { goToStep("search", "back"); onProviderSelected?.(null); }
    else if (step === "slots") goToStep("item", "back");
    else if (step === "hold") {
      if (activeHold) cancelBooking(activeHold.id);
      setActiveHold(null);
      goToStep("slots", "back");
    }
  };

  const handleBackToCategories = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setResults([]);
  };

  const handleBackToSubcategories = () => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedSubCategory(null);
    setResults([]);
  };

  const handleClose = () => {
    if (activeHold) cancelBooking(activeHold.id);
    onProviderSelected?.(null);
    onClose();
  };
  handleCloseRef.current = handleClose;

  // ↓↓ Ir al Landing — cierre total del flujo.
  // 1. Para cualquier animación en curso para evitar callbacks pendientes.
  // 2. Cancela hold activo.
  // 3. Resetea todo el estado interno de este overlay.
  // 4. Llama onDismissAll (el caller secuencia el cierre del modal exterior).
  // Si no se proveyó onDismissAll, cae a handleClose como fallback.
  const handleDismissAll = () => {
    // Parar animaciones en curso
    slideAnim.stopAnimation();
    dragAnim.stopAnimation();
    stepAnim.stopAnimation();
    // Cancelar hold activo si existe
    if (activeHold) cancelBooking(activeHold.id);
    onProviderSelected?.(null);
    // Reset completo de estado interno para no dejar nada bloqueante en memoria
    setStep("search");
    setQuery("");
    setSelectedCategory(null);
    setSelectedSubCategory(null);
    setResults([]);
    setSearching(false);
    setSelectedBusiness(null);
    setSelectedItem(null);
    setStaffList([]);
    setSelectedStaff(null);
    setActiveHold(null);
    setConfirmedBooking(null);
    setConfirming(false);
    dragAnim.setValue(0);
    stepAnim.setValue(0);
    if (onDismissAll) { onDismissAll(); } else { onClose(); }
  };
  dismissAllRef.current = handleDismissAll;

  // ── Retroceso de un nivel — estado-máquina del flujo ─────────────────────
  // confirmed            → cerrar overlay
  // hold                 → cancelar hold + volver a slots
  // slots                → volver a item
  // item                 → volver a search
  // search + subcat      → limpiar subcategoría
  // search + categoria   → limpiar categoría
  // search raíz / con query → cerrar overlay
  //   (el estado de resultados es el mismo nivel conceptual que "Nueva Reserva raíz";
  //    no existe un paso intermedio "limpiar búsqueda")
  const handleBackOneLevel = () => {
    Haptics.selectionAsync().catch(() => {});
    if (step === "confirmed") { handleClose(); return; }
    if (step === "hold") {
      if (activeHold) cancelBooking(activeHold.id);
      setActiveHold(null);
      goToStep("slots", "back");
      return;
    }
    if (step === "slots") {
      // Volver al paso de profesional si hubo staff disponible, si no al de servicio
      const eligible = selectedItem
        ? staffList.filter((s) => !s.serviceIds || s.serviceIds.length === 0 || s.serviceIds.includes(selectedItem.id))
        : [];
      goToStep(eligible.length > 0 ? "professional" : "item", "back");
      return;
    }
    if (step === "professional") { goToStep("item", "back"); return; }
    if (step === "item") { goToStep("search", "back"); onProviderSelected?.(null); return; }
    // step === "search"
    if (selectedSubCategory) { setSelectedSubCategory(null); setResults([]); return; }
    if (selectedCategory)    { setSelectedCategory(null); setSelectedSubCategory(null); setResults([]); return; }
    // Sin navegación de categorías activa → cierra siempre (incluido estado de resultados)
    handleClose();
  };
  handleBackRef.current = handleBackOneLevel;

  const accentColor = selectedBusiness?.bookingColor || "#00e5ff";

  // Sheet compacto (sin flex:1) siempre en el paso "search" y cuando el teclado está visible.
  // El paso "search" se autoajusta a su contenido real (categorías + recientes + buscador).
  // Los pasos post-selección (item, professional, slots, hold, confirmed) usan flex:1.
  const isCompactSheet = keyboardVisible || step === "search";

  // Profesionales elegibles para el servicio seleccionado
  const eligibleStaff = selectedItem
    ? staffList.filter((s) => !s.serviceIds || s.serviceIds.length === 0 || s.serviceIds.includes(selectedItem.id))
    : staffList;

  // Etiqueta del profesional elegido — siempre definida cuando hay selección
  const proLabel: string | null =
    selectedStaff === null   ? null :
    selectedStaff === "none" ? t("biz_no_preference") :
    `${selectedStaff.emoji ?? "👤"} ${selectedStaff.name}`;

  // Nombre corto para el paso CONFIRMED (sin emoji si hay nombre)
  const proShortName: string | null =
    selectedStaff === null   ? null :
    selectedStaff === "none" ? t("biz_no_preference") :
    selectedStaff.name;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
      <View style={[s.overlay, { paddingTop: insets.top, paddingBottom: keyboardHeight }]}>
        <Animated.View
          style={[
            s.sheet,
            { flex: 1 },
            { transform: [{ translateY: Animated.add(slideAnim, dragAnim) }] },
          ]}
          {...rightSwipePan.panHandlers}
        >
          {/* Accent glow border — softer intensity */}
          <View
            style={[s.glowBorder, { borderColor: accentColor + "99", shadowColor: accentColor }]}
            pointerEvents="none"
          />

          {/* Drag handle */}
          <View style={s.handleZone} {...dragHandlePan.panHandlers}>
            <View style={s.handlePill} />
          </View>

          {/* Header — también recibe dragHandlePan para que el arrastre hacia abajo
              funcione desde aquí (los navBtn son Views de layout, sin toques) */}
          <View style={s.header} {...dragHandlePan.panHandlers}>
            <View style={s.navBtn} />

            <View style={s.headerCenter}>
              {step === "search" && (
                <Text style={s.headerTitle}>{t("biz_new_booking").toUpperCase()}</Text>
              )}
              {step === "item" && (
                <Text style={s.headerTitle}>{t("biz_step_service_label").toUpperCase()}</Text>
              )}
              {step === "professional" && (
                <Text style={s.headerTitle}>{t("biz_step_professional_label").toUpperCase()}</Text>
              )}
              {step === "slots" && (
                <Text style={s.headerTitle}>{t("biz_step_datetime_label").toUpperCase()}</Text>
              )}
              {step === "hold" && (
                <Text style={[s.headerTitle, { color: "#f59e0b" }]}>{t("accion_confirmar").toUpperCase()}</Text>
              )}
              {step === "confirmed" && (
                <Text style={[s.headerTitle, { color: accentColor }]}>{"✓ " + t("biz_booked_label").toUpperCase()}</Text>
              )}
            </View>

            <View style={s.navBtn} />
          </View>

          {/* Animated step content */}
          <Animated.View
            style={[s.stepContainer, { flex: 1 }, { transform: [{ translateX: stepAnim }] }]}
          >
            {/* ── STEP: SEARCH ── */}
            {step === "search" && (
              <View style={[s.stepWrap, s.searchStepInner]}>

                {/* ── Dock de interacción — primero en DOM → fondo visual con column-reverse ── */}
                <View style={[s.actionDock, { paddingBottom: keyboardVisible ? 8 : Math.max(insets.bottom, 16) }]}>

                  <MyBookingsList
                    visible={
                      !keyboardVisible &&
                      query.length === 0 &&
                      !selectedCategory &&
                      !selectedSubCategory
                    }
                  />

                  {/* Grid de categorías / subcategorías — prioridad principal */}
                  {!keyboardVisible && query.length === 0 && (
                    <>
                      {/* ── Vista de subcategorías (categoría madre seleccionada) ── */}
                      {selectedCategory ? (() => {
                        const sector = SECTORS.find(s => s.id === selectedCategory)!;
                        const subs = sector.subs;
                        // Build rows of 3
                        const rows: (typeof subs[0])[][] = [];
                        for (let i = 0; i < subs.length; i += 3) rows.push(subs.slice(i, i + 3));
                        return (
                          <View style={{ gap: 8 }}>
                            {/* Cabecera de subcategorías — sin botón volver (la navegación es por el FAB inferior) */}
                            <View style={s.subCatHeader}>
                              <View style={[s.subCatTitleRow]}>
                                <Text style={s.subCatEmoji}>{sector.emoji}</Text>
                                <Text style={[s.subCatTitle, { color: "#FFFFFF" }]}>{sector.label}</Text>
                              </View>
                            </View>
                            {/* Grid de subcategorías */}
                            <View style={s.categoryGrid}>
                              {rows.map((row, rowIdx) => (
                                <View key={rowIdx} style={s.categoryRow}>
                                  {row.map((sub) => {
                                    const active = selectedSubCategory === sub.id;
                                    return (
                                      <TouchableOpacity
                                        key={sub.id}
                                        activeOpacity={0.72}
                                        onPress={() => {
                                          Haptics.selectionAsync().catch(() => {});
                                          setSelectedSubCategory(sub.id);
                                        }}
                                        style={[
                                          s.categoryChip,
                                          {
                                            borderColor:     active ? sector.color : sector.color + "90",
                                            backgroundColor: active ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.04)",
                                          },
                                        ]}
                                      >
                                        <Text style={s.categoryChipEmoji}>{sub.emoji}</Text>
                                        <Text style={[
                                          s.categoryChipLabel,
                                          { color: active ? "#FFFFFF" : "rgba(255,255,255,0.72)" },
                                        ]} numberOfLines={2}>
                                          {trSector(sub.name, lang)}
                                        </Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                  {/* Rellena celdas vacías para mantener el grid */}
                                  {row.length < 3 && Array.from({ length: 3 - row.length }).map((_, i) => (
                                    <View key={`empty-${i}`} style={[s.categoryChip, { opacity: 0 }]} />
                                  ))}
                                </View>
                              ))}
                            </View>
                          </View>
                        );
                      })() : (
                        /* ── Vista de categorías madre (9 sectores) ── */
                        <View style={s.categoryGrid}>
                          {[0, 1, 2].map((rowIdx) => (
                            <View key={rowIdx} style={s.categoryRow}>
                              {SECTORS.slice(rowIdx * 3, rowIdx * 3 + 3).map((sector) => (
                                <TouchableOpacity
                                  key={sector.id}
                                  activeOpacity={0.72}
                                  onPress={() => {
                                    Haptics.selectionAsync().catch(() => {});
                                    setSelectedCategory(sector.id);
                                    setSelectedSubCategory(null);
                                  }}
                                  style={[
                                    s.categoryChip,
                                    { borderColor: sector.color + "90" },
                                  ]}
                                >
                                  <Text style={s.categoryChipEmoji}>{sector.emoji}</Text>
                                  <Text style={[s.categoryChipLabel, { color: "#FFFFFF" }]}>
                                    {trSector(sector.label, lang)}
                                  </Text>
                                </TouchableOpacity>
                              ))}
                            </View>
                          ))}
                        </View>
                      )}
                    </>
                  )}

                  {/* Accesos rápidos — negocios recientes (acceso secundario, debajo de categorías) */}
                  {!keyboardVisible && query.length === 0 && recentBizs.length > 0 && (
                    <View style={s.recentSection}>
                      <Text style={s.recentLabel}>{t("biz_recent_label")}</Text>
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={s.recentList}
                        keyboardShouldPersistTaps="handled"
                      >
                        {recentBizs.map((b) => (
                          <TouchableOpacity
                            key={b.id}
                            style={s.recentPill}
                            onPress={() => handleSelectBusiness(b)}
                            activeOpacity={0.72}
                          >
                            <View style={[s.recentDot, { backgroundColor: b.bookingColor || "#00e5ff" }]} />
                            <Text style={s.recentPillText} numberOfLines={1}>{b.name}</Text>
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}

                  {/* Buscador — siempre visible al fondo del dock */}
                  <View style={s.searchBar}>
                    <Feather name="search" size={16} color="rgba(255,255,255,0.35)" />
                    <TextInput
                      style={s.searchInput}
                      placeholder={t("biz_search_business_service_ph")}
                      placeholderTextColor="rgba(255,255,255,0.25)"
                      value={query}
                      onChangeText={setQuery}
                      returnKeyType="search"
                      onSubmitEditing={() => Keyboard.dismiss()}
                    />
                    {query.length > 0 && (
                      <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
                        <Feather name="x" size={16} color="rgba(255,255,255,0.35)" />
                      </TouchableOpacity>
                    )}
                  </View>

                </View>

                {/* Resultados — segundo en DOM → aparece ENCIMA del dock con column-reverse */}
                {(query.length >= 1 || !!selectedSubCategory) && (
                  <View style={s.resultsZone}>
                    {searching ? (
                      <View style={s.loaderWrap}>
                        <ActivityIndicator color="rgba(255,255,255,0.4)" />
                      </View>
                    ) : results.length === 0 ? (
                      <View style={s.emptyWrap}>
                        <Feather name="search" size={28} color="rgba(255,255,255,0.08)" />
                        <Text style={s.emptyText}>
                          {query.length >= 1
                            ? t("biz_no_results_for").replace("__Q__", query)
                            : t("biz_no_businesses_subcategory")}
                        </Text>
                      </View>
                    ) : (
                      <ScrollView
                        style={[
                          s.listResults,
                          {
                            // Altura exacta al número de tarjetas (máx 4), luego scroll
                            maxHeight: Math.min(results.length, MAX_VISIBLE_RESULTS) * RESULT_CARD_H + 36,
                          },
                        ]}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 8, paddingHorizontal: 20 }}
                        keyboardShouldPersistTaps="handled"
                      >
                        <Text style={s.resultsLabel}>
                          {results.length} {results.length !== 1 ? t("biz_business_plural") : t("biz_business_singular")}
                        </Text>
                        {results.map((b) => {
                          const city = extractCity(b.location);
                          const cat  = catLabel(b.category, lang);
                          return (
                            <TouchableOpacity
                              key={b.id}
                              style={s.businessCard}
                              onPress={() => handleSelectBusiness(b)}
                              activeOpacity={0.72}
                            >
                              <View style={[s.bizColorDot, { backgroundColor: b.bookingColor || "#00e5ff" }]} />
                              <View style={{ flex: 1 }}>
                                <Text style={s.businessName}>{b.name}</Text>
                                <Text style={s.businessMeta}>
                                  {cat}{city ? ` · ${city}` : ""}
                                </Text>
                              </View>
                              <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.20)" />
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                )}

              </View>
            )}

            {/* ── STEP: SELECT ITEM ── */}
            {step === "item" && (
              <View style={s.stepWrap}>
                <BreadcrumbStrip business={selectedBusiness} item={null} accentColor={accentColor} />
                {items.length === 0 ? (
                  <View style={s.emptyWrap}>
                    <Feather name="package" size={32} color="rgba(255,255,255,0.08)" />
                    <Text style={s.emptyText}>{t("biz_no_active_services")}</Text>
                  </View>
                ) : (
                  <ScrollView style={s.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
                    {items.map((item) => (
                      <TouchableOpacity
                        key={item.id}
                        style={[s.serviceCard, { borderColor: `${accentColor}30` }]}
                        onPress={() => handleSelectItem(item)}
                        activeOpacity={0.72}
                      >
                        <View style={{ flex: 1, gap: 8 }}>
                          <Text style={s.serviceTitle}>{trSector(item.title, lang)}</Text>
                          <View style={s.serviceMetaRow}>
                            <View style={s.metaBadge}>
                              <Feather name="clock" size={11} color="rgba(255,255,255,0.40)" />
                              <Text style={s.metaBadgeText}>{item.durationMinutes} min</Text>
                            </View>
                            {item.customerCapacity > 1 && (
                              <View style={s.metaBadge}>
                                <Feather name="users" size={11} color="rgba(255,255,255,0.40)" />
                                <Text style={s.metaBadgeText}>{item.customerCapacity} pers.</Text>
                              </View>
                            )}
                            {item.type ? (
                              <View style={s.metaBadge}>
                                <Text style={s.metaBadgeText}>{trSector(item.type, lang)}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                        <View style={{ alignItems: "flex-end", gap: 6 }}>
                          {item.price > 0 ? (
                            <Text style={[s.servicePrice, { color: accentColor }]}>
                              {item.price}€
                            </Text>
                          ) : (
                            <Text style={s.servicePriceFree}>{t("biz_free")}</Text>
                          )}
                          <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.20)" />
                        </View>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}
              </View>
            )}

            {/* ── STEP: PROFESSIONAL ── */}
            {step === "professional" && (
              <View style={s.stepWrap}>
                <BreadcrumbStrip business={selectedBusiness} item={selectedItem} accentColor={accentColor} />
                <ScrollView style={s.list} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>

                  {/* Opción Sin preferencia */}
                  <TouchableOpacity
                    style={[s.serviceCard, { borderColor: `${accentColor}30` }]}
                    onPress={() => handleSelectStaff("none")}
                    activeOpacity={0.72}
                  >
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={s.serviceTitle}>{t("biz_no_preference")}</Text>
                      <Text style={[s.metaBadgeText, { opacity: 0.5, fontSize: 12 }]}>
                        {t("biz_any_professional_available")}
                      </Text>
                    </View>
                    <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.20)" />
                  </TouchableOpacity>

                  {/* Staff elegibles */}
                  {eligibleStaff.length === 0 && (
                    <View style={[s.emptyWrap, { marginTop: 24 }]}>
                      <Feather name="user-x" size={28} color="rgba(255,255,255,0.08)" />
                      <Text style={s.emptyText}>{t("biz_no_professionals_available")}</Text>
                    </View>
                  )}
                  {eligibleStaff.map((member) => {
                    // Nombres de servicios que puede realizar este profesional
                    const svcNames = (member.serviceIds ?? [])
                      .map((id) => items.find((it) => it.id === id)?.title)
                      .filter((title): title is string => !!title)
                      .map((title) => trSector(title, lang));
                    return (
                      <TouchableOpacity
                        key={member.id}
                        style={[s.serviceCard, { borderColor: `${accentColor}30` }]}
                        onPress={() => handleSelectStaff(member)}
                        activeOpacity={0.72}
                      >
                        <View style={s.staffAvatar}>
                          <Text style={{ fontSize: 18 }}>{member.emoji ?? "👤"}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 4, marginLeft: 12 }}>
                          <Text style={s.serviceTitle}>{member.name}</Text>
                          {svcNames.length > 0 && (
                            <Text style={[s.metaBadgeText, { opacity: 0.5, fontSize: 12 }]} numberOfLines={2}>
                              {svcNames.join(" · ")}
                            </Text>
                          )}
                        </View>
                        <Feather name="chevron-right" size={18} color="rgba(255,255,255,0.20)" />
                      </TouchableOpacity>
                    );
                  })}

                </ScrollView>
              </View>
            )}

            {/* ── STEP: SLOTS ── */}
            {step === "slots" && (
              <View style={s.stepWrap}>
                <BreadcrumbStrip business={selectedBusiness} item={selectedItem} accentColor={accentColor} />

                {/* ── ERROR: slot ya reservado — claimSlot o isSlotOccupied detectaron conflicto ── */}
                {slotTakenError && (
                  <View style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                    backgroundColor: "rgba(239,68,68,0.12)",
                    borderWidth: 1,
                    borderColor: "rgba(239,68,68,0.45)",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    marginHorizontal: 16,
                    marginBottom: 8,
                  }}>
                    <Feather name="alert-circle" size={15} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 12, fontWeight: "700", flex: 1 }}>
                      {t("biz_slot_taken_error")}
                    </Text>
                    <TouchableOpacity hitSlop={8} onPress={() => setSlotTakenError(false)}>
                      <Feather name="x" size={14} color="rgba(239,68,68,0.7)" />
                    </TouchableOpacity>
                  </View>
                )}

                {/* Day selector */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={s.dayScroll}
                  contentContainerStyle={s.dayScrollContent}
                >
                  {days.map((d) => {
                    const isActive = d === selectedDate;
                    const dateObj = new Date(d + "T00:00:00");
                    const dayNames = DATE_DAY_KEYS.map(k => t(k));
                    return (
                      <TouchableOpacity
                        key={d}
                        onPress={() => {
                          Haptics.selectionAsync().catch(() => {});
                          setSelectedDate(d);
                        }}
                        style={[
                          s.dayChip,
                          isActive && {
                            borderColor: accentColor,
                            backgroundColor: `${accentColor}18`,
                          },
                        ]}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.dayChipWeekday, isActive && { color: accentColor }]}>
                          {dayNames[dateObj.getDay()]}
                        </Text>
                        <Text style={[s.dayChipNum, isActive && { color: "#ffffff" }]}>
                          {dateObj.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {loadingSlots ? (
                  <View style={s.loaderWrap}>
                    <ActivityIndicator color={accentColor} />
                  </View>
                ) : ((): React.ReactElement => {
                  const available = slots.filter((sl) => sl.isAvailable);

                  if (available.length === 0) {
                    return (
                      <View style={s.emptyWrap}>
                        <Feather name="calendar" size={32} color="rgba(255,255,255,0.08)" />
                        <Text style={s.emptyText}>{t("biz_no_availability_day")}</Text>
                      </View>
                    );
                  }

                  // Single slot left — show it large and centred
                  if (available.length === 1) {
                    const sl = available[0];
                    const isPartial = sl.availableUnits < sl.totalUnits && sl.totalUnits > 1;
                    return (
                      <View style={s.singleSlotWrap}>
                        <Text style={s.singleSlotLabel}>{t("biz_only_slot")}</Text>
                        <TouchableOpacity
                          style={[s.singleSlotBtn, { borderColor: accentColor, backgroundColor: `${accentColor}18` }]}
                          onPress={() => handleSelectSlot(sl)}
                          activeOpacity={0.75}
                        >
                          <Text style={[s.singleSlotTime, { color: accentColor }]}>
                            {formatTime(sl.startDatetime)}
                          </Text>
                          {isPartial && (
                            <Text style={[s.singleSlotUnits, { color: `${accentColor}BB` }]}>
                              {sl.availableUnits === 1
                                ? t("biz_units_free_one")
                                : t("biz_units_free_other").replace("__N__", String(sl.availableUnits))}
                            </Text>
                          )}
                          <View style={[s.singleSlotPill, { backgroundColor: accentColor }]}>
                            <Text style={s.singleSlotPillTxt}>{t("biz_book_btn").toUpperCase()}</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    );
                  }

                  // Multiple available slots — grid of available only
                  return (
                    <ScrollView
                      style={s.list}
                      showsVerticalScrollIndicator={false}
                      contentContainerStyle={{ paddingBottom: 32 }}
                    >
                      <View style={s.slotsGrid}>
                        {available.map((sl, idx) => {
                          const isPartial = sl.availableUnits < sl.totalUnits && sl.totalUnits > 1;
                          return (
                            <TouchableOpacity
                              key={idx}
                              style={[s.slotChipAvail, { borderColor: `${accentColor}60`, backgroundColor: "rgba(255,255,255,0.09)" }]}
                              onPress={() => handleSelectSlot(sl)}
                              activeOpacity={0.7}
                            >
                              <Text style={[s.slotTimeAvail, { color: "#FFFFFF" }]}>
                                {formatTime(sl.startDatetime)}
                              </Text>
                              {isPartial && (
                                <Text style={[s.slotUnitsAvail, { color: `${accentColor}CC` }]}>
                                  {sl.availableUnits === 1
                                    ? t("biz_units_free_one")
                                    : t("biz_units_free_other").replace("__N__", String(sl.availableUnits))}
                                </Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </ScrollView>
                  );
                })()}
              </View>
            )}

            {/* ── STEP: HOLD ── */}
            {step === "hold" && activeHold && selectedBusiness && selectedItem && (
              <View style={s.stepWrap}>
                <ScrollView
                  style={{ flex: 1 }}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 16 }}
                >
                  <View style={s.promptWrap}>
                    <Text style={s.promptText}>{t("biz_confirm_booking_title")}</Text>
                  </View>

                  {/* Summary card */}
                  <View style={[s.summaryCard, { borderColor: `${accentColor}30` }]}>
                    <View style={[s.summaryAccentBar, { backgroundColor: accentColor }]} />
                    <View style={s.summaryBody}>
                      <Text style={[s.summaryBizLabel, { color: accentColor }]}>
                        {selectedBusiness.name}
                      </Text>
                      <Text style={s.summaryServiceName}>{trSector(selectedItem.title, lang)}</Text>
                      {/* Profesional — siempre visible si fue elegido */}
                      {proLabel && (
                        <View style={[s.summaryRow, { marginTop: 6 }]}>
                          <Feather name="user" size={15} color="rgba(255,255,255,0.40)" />
                          <Text style={s.summaryRowText}>{proLabel}</Text>
                        </View>
                      )}
                      <View style={s.summaryDivider} />
                      <View style={s.summaryRow}>
                        <Feather name="calendar" size={15} color="rgba(255,255,255,0.40)" />
                        <Text style={s.summaryRowText}>
                          {formatDateLabel(activeHold.startDatetime.slice(0, 10), t)}
                        </Text>
                      </View>
                      <View style={s.summaryRow}>
                        <Feather name="clock" size={15} color="rgba(255,255,255,0.40)" />
                        <Text style={s.summaryRowText}>
                          {formatTime(activeHold.startDatetime)} — {formatTime(activeHold.endDatetime)}
                          {"  ·  "}{selectedItem.durationMinutes} min
                        </Text>
                      </View>
                      {selectedItem.price > 0 && (
                        <View style={s.summaryRow}>
                          <Feather name="tag" size={15} color="rgba(255,255,255,0.40)" />
                          <Text style={[s.summaryRowText, { color: accentColor, fontWeight: "800" }]}>
                            {selectedItem.price}€
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {/* Cancellation Policy — solo si el negocio tiene una política explícita */}
                  {selectedBusiness.cancellationPolicy ? (() => {
                    const policy = selectedBusiness.cancellationPolicy;
                    const price  = selectedItem.price;
                    const info   = computeRefundInfo(policy, activeHold, price);
                    return (
                      <View style={[
                        s.policyCard,
                        { borderColor: info.isFree ? "rgba(34,197,94,0.25)" : "rgba(245,158,11,0.22)" },
                      ]}>
                        <View style={s.policyRow}>
                          <Feather
                            name={info.isFree ? "check-circle" : "alert-circle"}
                            size={13}
                            color={info.isFree ? "#22C55E" : "#f59e0b"}
                          />
                          <Text style={[s.policyLabel, { color: info.isFree ? "#22C55E" : "#f59e0b" }]}>
                            {info.isFree
                              ? (policy.freeUntilHours > 0
                                  ? t("biz_refund_free_until").replace("__H__", String(policy.freeUntilHours))
                                  : t("biz_refund_always_free"))
                              : policy.refundType === "full"    ? t("biz_refund_full")
                              : policy.refundType === "half"    ? t("biz_refund_half")
                              : policy.refundType === "partial" ? t("biz_refund_partial").replace("__PCT__", String(policy.refundPercent ?? 0))
                              : policy.refundType === "fixed_fee" ? t("biz_refund_fixed_fee").replace("__FEE__", String(policy.fixedFee ?? 0)).replace("__REFUND__", Math.max(0, (selectedItem.price ?? 0) - (policy.fixedFee ?? 0)).toFixed(0))
                              : t("biz_refund_none")}
                          </Text>
                        </View>
                        {policy.freeUntilHours > 0 && (
                          <Text style={s.policyNote}>
                            {info.isFree
                              ? t("biz_refund_free_until").replace("__H__", String(policy.freeUntilHours))
                              : t("biz_refund_cancel_window_passed").replace("__H__", String(policy.freeUntilHours))
                            }
                          </Text>
                        )}
                      </View>
                    );
                  })() : (
                    <View style={[s.policyCard, { borderColor: "rgba(34,197,94,0.20)" }]}>
                      <View style={s.policyRow}>
                        <Feather name="check-circle" size={13} color="#22C55E" />
                        <Text style={[s.policyLabel, { color: "#22C55E" }]}>
                          {t("biz_no_advance_payment")}
                        </Text>
                      </View>
                      <Text style={s.policyNote}>
                        {t("biz_cancel_modify_free")}
                      </Text>
                    </View>
                  )}

                  {/* Silent hold expiry watcher — no visual countdown in V1 */}
                  {activeHold.holdExpiresAt && (
                    <HoldCountdown
                      expiresAt={activeHold.holdExpiresAt}
                      onExpire={handleHoldExpired}
                      accentColor={accentColor}
                    />
                  )}
                </ScrollView>

                <View style={s.holdActions}>
                  <TouchableOpacity
                    style={[s.confirmBtn, { backgroundColor: `${accentColor}15`, borderColor: accentColor }]}
                    onPress={handleConfirm}
                    activeOpacity={0.8}
                    disabled={confirming}
                  >
                    {confirming ? (
                      <ActivityIndicator color={accentColor} />
                    ) : (
                      <Text style={[s.confirmBtnText, { color: accentColor }]}>
                        {t("biz_confirm_booking_btn").toUpperCase()}
                      </Text>
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={handleBack} activeOpacity={0.7}>
                    <Text style={s.cancelBtnText}>{t("biz_change_time")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {/* ── STEP: CONFIRMED ── */}
            {step === "confirmed" && confirmedBooking && selectedBusiness && selectedItem && (
              <View style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                paddingHorizontal: 28,
                paddingBottom: 28,
                backgroundColor: "#050505",
              }}>
                {/* Aro de confirmación — VERDE: correcto/hecho */}
                <View style={{
                  width: 100, height: 100, borderRadius: 50,
                  borderWidth: 2.5, borderColor: "#22c55e",
                  backgroundColor: "#22c55e12",
                  alignItems: "center", justifyContent: "center",
                  marginBottom: 26,
                  shadowColor: "#22c55e", shadowOpacity: 0.35, shadowRadius: 24, elevation: 10,
                }}>
                  <Feather name="check" size={48} color="#22c55e" />
                </View>

                {/* RESERVA CONFIRMADA — VERDE */}
                <Text style={{ fontSize: 11, fontWeight: "900", letterSpacing: 3.5, color: "#22c55e", marginBottom: 14 }}>
                  {t("biz_booking_confirmed").toUpperCase()}
                </Text>

                {/* Nombre del negocio — blanco */}
                <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFFFFF", textAlign: "center", marginBottom: 6 }}>
                  {selectedBusiness.name}
                </Text>

                {/* Servicio contratado — blanco puro + check de estado */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: proShortName ? 10 : 22 }}>
                  <Feather name="check" size={14} color="#FFFFFF" />
                  <Text style={{ fontSize: 15, color: "#FFFFFF", textAlign: "center", fontWeight: "600" }}>
                    {trSector(selectedItem.title, lang)}
                  </Text>
                </View>

                {/* Profesional — siempre visible debajo del servicio */}
                {proShortName && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 22 }}>
                    <Feather name="user" size={13} color="rgba(255,255,255,0.50)" />
                    <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", fontWeight: "700" }}>
                      {t("biz_with_pro")}{proShortName}
                    </Text>
                  </View>
                )}

                {/* Píldora de fecha/hora */}
                <View style={{
                  borderRadius: 14, borderWidth: 1, borderColor: `${accentColor}45`,
                  backgroundColor: `${accentColor}10`,
                  paddingHorizontal: 22, paddingVertical: 11,
                  marginBottom: 20,
                }}>
                  <Text style={{ color: accentColor, fontWeight: "800", fontSize: 15, letterSpacing: 0.3 }}>
                    {formatDateLabel(confirmedBooking.startDatetime.slice(0, 10), t)}
                    {"  ·  "}
                    {formatTime(confirmedBooking.startDatetime)}
                  </Text>
                </View>

                {/* GO badge */}
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 7,
                  backgroundColor: "rgba(0,229,255,0.07)", borderRadius: 10,
                  paddingHorizontal: 14, paddingVertical: 8,
                  borderWidth: 1, borderColor: "rgba(0,229,255,0.18)",
                  marginBottom: 40,
                }}>
                  <Feather name="zap" size={12} color="#00e5ff" />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.60)" }}>
                    {t("biz_saved_to_go_calendar")}
                  </Text>
                </View>

                {/* Botón OK / Ver en calendario — único botón, hace todo */}
                <TouchableOpacity
                  style={{
                    width: "100%",
                    backgroundColor: accentColor,
                    borderRadius: 20, paddingVertical: 18,
                    alignItems: "center",
                    shadowColor: accentColor, shadowOpacity: 0.45, shadowRadius: 20, elevation: 10,
                  }}
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
                    if (confirmedBooking && onGoToBooking) {
                      const dateISO   = confirmedBooking.startDatetime.slice(0, 10);
                      const timeHHMM  = confirmedBooking.startDatetime.slice(11, 16);
                      const entryId   = `go_booking_cli_${confirmedBooking.id}`;
                      onGoToBooking(dateISO, timeHHMM, entryId);
                    }
                    handleClose();
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={{ color: "#fff", fontWeight: "900", fontSize: 18, letterSpacing: 1 }}>
                    {t("biz_ok_view_calendar")}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

          </Animated.View>

          {/* ── Guía gestual derecha — igual que EmpresaPanel/PerfilPanel ──────
              Degradado horizontal transparente→blanco en el 25% derecho,
              mitad inferior del sheet. Tap = retroceder un nivel;
              swipe-down = close (capturado por rightSwipePan en el sheet).
              Oculta en paso "confirmed" para no interferir con el botón OK. */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={handleBackOneLevel}
            style={{ position: "absolute", right: 0, top: "50%", bottom: 0, width: "25%", opacity: step === "confirmed" ? 0 : 1 }}
            disabled={step === "confirmed"}
          >
            <LinearGradient
              colors={["transparent", "rgba(255,255,255,0.18)"]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{ flex: 1 }}
            />
          </TouchableOpacity>

        </Animated.View>

        {/* ── Botones de navegación flotantes — inferior derecho ───────────────
            Disposición vertical idéntica al resto de GO (memoria muscular):
            • Arriba  (flecha simple):  retrocede un nivel
            • Abajo   (doble flecha):   cierra el panel → Landing           */}
        {!keyboardVisible && step !== "confirmed" && (
          <View style={[s.fabNavStack, { bottom: insets.bottom + 24 }]}>
            {/* ↓  Retroceder un nivel — ARRIBA */}
            <TouchableOpacity style={s.fabClose} onPress={handleBackOneLevel} activeOpacity={0.7}>
              <Feather name="chevron-down" size={22} color="rgba(255,255,255,0.90)" />
            </TouchableOpacity>
            {/* ↓↓  Landing — ABAJO */}
            <TouchableOpacity style={s.fabClose} onPress={handleDismissAll} activeOpacity={0.7}>
              <View style={{ alignItems: "center" }}>
                <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
                <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
              </View>
            </TouchableOpacity>
          </View>
        )}

      </View>
    </Modal>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#070B12",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    maxHeight: SCREEN_H * 0.92,
    overflow: "hidden",
  },
  glowBorder: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 28,
    borderWidth: 1.5,
    shadowOpacity: 0.24,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    pointerEvents: "none",
  } as any,
  handleZone: {
    alignItems: "center",
    paddingTop: 10,
    paddingBottom: 4,
  },
  handlePill: {
    width: 32,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 14,
  },
  navBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
  },
  headerTitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 11,
    fontWeight: "900",
    letterSpacing: 2.5,
  },
  dotRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    width: 44,
    justifyContent: "center",
  },
  dot: {
    height: 5,
    width: 5,
    borderRadius: 3,
  },
  stepContainer: {
  },
  stepWrap: {
    flex: 1,
  },
  // Prompt
  promptWrap: {
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  promptText: {
    color: "#ffffff",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 28,
  },
  // Search
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginHorizontal: 20,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  searchInput: {
    flex: 1,
    color: "#ffffff",
    fontSize: 16,
    fontWeight: "600",
  },
  list: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // ScrollView de resultados en el paso SEARCH: sin flex:1 para que no expanda el contenedor
  listResults: {
    paddingHorizontal: 20,
    // maxHeight se aplica dinámicamente en JSX según el número de resultados
  },
  loaderWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyWrap: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 32,
    paddingTop: 36,
    paddingBottom: 16,
  },
  emptyText: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 15,
    fontWeight: "600",
    textAlign: "center",
    lineHeight: 22,
  },
  // Business card
  businessCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 8,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.07)",
  },
  bizColorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  businessName: {
    color: "#ffffff",
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  businessMeta: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 3,
  },
  // Service card
  serviceCard: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 18,
    paddingHorizontal: 18,
    marginBottom: 10,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
  },
  staffAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  serviceTitle: {
    color: "#ffffff",
    fontSize: 18,
    fontWeight: "800",
    letterSpacing: 0.1,
  },
  serviceMetaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  metaBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  metaBadgeText: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  servicePrice: {
    fontSize: 19,
    fontWeight: "900",
    letterSpacing: 0.3,
  },
  servicePriceFree: {
    color: "rgba(255,255,255,0.25)",
    fontSize: 13,
    fontWeight: "600",
  },
  // Day selector — vertical cards
  dayScroll: {
    maxHeight: 80,
    marginBottom: 4,
  },
  dayScrollContent: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  dayChip: {
    width: 52,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.08)",
    backgroundColor: "rgba(255,255,255,0.03)",
    alignItems: "center",
    gap: 4,
  },
  dayChipWeekday: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  dayChipNum: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 18,
    fontWeight: "800",
  },
  slotsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingTop: 6,
    paddingBottom: 20,
  },
  // Available slot — strong, tappable, high contrast
  slotChipAvail: {
    width: (SCREEN_W - 40 - 20) / 3,
    paddingVertical: 18,
    borderRadius: 16,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  slotTimeAvail: {
    fontSize: 21,
    fontWeight: "800",
    letterSpacing: 0.5,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  slotUnitsAvail: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  // Single available slot — large centred CTA
  singleSlotWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    gap: 16,
  },
  singleSlotLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  singleSlotBtn: {
    width: "100%",
    paddingVertical: 28,
    borderRadius: 24,
    borderWidth: 2,
    alignItems: "center",
    gap: 10,
  },
  singleSlotTime: {
    fontSize: 48,
    fontWeight: "900",
    letterSpacing: 1,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  singleSlotUnits: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  singleSlotPill: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 20,
    marginTop: 4,
  },
  singleSlotPillTxt: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "900",
    letterSpacing: 2,
  },
  // Hold / Summary
  holdTimerWrap: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 8,
  },
  summaryCard: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 16,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    flexDirection: "row",
    overflow: "hidden",
  },
  summaryAccentBar: {
    width: 4,
    borderRadius: 2,
  },
  summaryBody: {
    flex: 1,
    padding: 20,
    gap: 8,
  },
  summaryBizLabel: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  summaryServiceName: {
    color: "#ffffff",
    fontSize: 24,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: "rgba(255,255,255,0.07)",
    marginVertical: 6,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  summaryRowText: {
    color: "rgba(255,255,255,0.65)",
    fontSize: 15,
    fontWeight: "600",
  },
  holdActions: {
    paddingTop: 8,
    paddingBottom: 16,
    gap: 4,
  },
  confirmBtn: {
    marginHorizontal: 20,
    paddingVertical: 18,
    borderRadius: 18,
    borderWidth: 1.5,
    alignItems: "center",
    marginBottom: 6,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "900",
    letterSpacing: 2,
  },
  cancelBtn: {
    paddingVertical: 12,
    alignItems: "center",
  },
  cancelBtnText: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.3,
  },
  // Confirmed
  confirmedWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    paddingBottom: 20,
  },
  confirmedRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  confirmedRingInner: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  confirmedTitle: {
    fontSize: 32,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  confirmedBusiness: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.5,
    textTransform: "uppercase",
    marginTop: 2,
  },
  confirmedItem: {
    color: "#ffffff",
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  confirmedTimePill: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 30,
    borderWidth: 1,
    marginTop: 6,
  },
  confirmedTimeText: {
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  confirmedNote: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 13,
    fontWeight: "600",
    textAlign: "center",
    marginTop: 4,
  },
  // ── Pila vertical de botones flotantes (norma GO: simple arriba, doble abajo)
  fabNavStack: {
    position: "absolute",
    right: 20,
    flexDirection: "column",
    alignItems: "center",
    gap: 8,
    zIndex: 200,
  },
  // FAB close — rounded square management style (V2 norm)
  fabClose: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#0E0E0E",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.40)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.40,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
  // ── Prompt sub ─────────────────────────────────────────────────────────
  promptSub: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 13,
    fontWeight: "500",
    marginTop: 4,
  },

  // ── Category chips ──────────────────────────────────────────────────────
  chipScroll: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 190,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 20,
    paddingBottom: 6,
    paddingTop: 2,
  },
  // ── Grid de categorías 3×3 ──────────────────────────────────────────
  categoryGrid: {
    flexDirection: "column",
    paddingHorizontal: 12,
    gap: 8,
  },
  categoryRow: {
    flexDirection: "row",
    gap: 8,
  },
  categoryChip: {
    flex: 1,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 14,
    paddingHorizontal: 4,
    borderRadius: 18,
    borderWidth: 2,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  categoryChipEmoji: {
    fontSize: 22,
  },
  categoryChipLabel: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.1,
    textAlign: "center",
    lineHeight: 14,
  },

  // ── Results count label ─────────────────────────────────────────────────
  resultsLabel: {
    color: "rgba(255,255,255,0.22)",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // ── Cancellation Policy card (hold step) ──────────────────────────────
  policyCard: {
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderWidth: 1,
    gap: 4,
  },
  policyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  policyLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.1,
  },
  policyNote: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 11,
    fontWeight: "500",
    marginLeft: 19,
  },

  // ── GO entry badge (confirmed step) ───────────────────────────────────
  goEntryBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: "rgba(0,229,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.22)",
    marginTop: 10,
    marginBottom: 4,
  },
  goEntryBadgeText: {
    color: "#00e5ff",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },

  // ── Zona superior de resultados ─────────────────────────────────────
  // Sin flex, sin minHeight: envuelve exactamente el contenido.
  // Con column-reverse en el padre, queda pegado al actionDock sin hueco.
  resultsZone: {
    paddingTop: 4,
  },

  // ── Contenedor del paso SEARCH — column-reverse: actionDock anclado abajo,
  // resultados crecen hacia arriba desde él, espacio libre siempre encima.
  searchStepInner: {
    flexDirection: "column-reverse",
  },

  // ── Recientes ────────────────────────────────────────────────────────────
  recentSection: {
    gap: 8,
    marginBottom: 4,
    paddingHorizontal: 12,
  },
  recentLabel: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 2,
  },
  recentList: {
    gap: 8,
    paddingRight: 4,
  },
  recentPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "rgba(255,255,255,0.06)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: 160,
  },
  recentDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  recentPillText: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Dock de interacción inferior ─────────────────────────────────────
  actionDock: {
    paddingTop: 10,
    paddingBottom: 12,
    gap: 8,
  },

  // ── Cabecera de subcategorías ─────────────────────────────────────────
  subCatHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    gap: 10,
  },
  subCatBackBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
  },
  subCatTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    flex: 1,
  },
  subCatEmoji: {
    fontSize: 18,
  },
  subCatTitle: {
    fontSize: 15,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
});
