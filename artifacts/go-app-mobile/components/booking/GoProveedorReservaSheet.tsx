/**
 * GoProveedorReservaSheet
 * ════════════════════════════════════════════════════════════════════
 * Flujo OBLIGATORIO del cliente:
 *   1. Empresa   (ya elegida — proveedor prop)
 *   2. Servicio  (muestra todos los servicios de la empresa)
 *   3. Profesional (filtrado por el servicio seleccionado)
 *   4. Fecha y hora
 *   5. Confirmar reserva
 *   6. Modal RESERVA CONFIRMADA → pulsar OK
 *   7. Calendario abierto en el día y hora exactos
 *
 * Props:
 *   onBookingConfirmed(dateISO, time) → el padre navega al calendario
 * ════════════════════════════════════════════════════════════════════
 */
import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  ScrollView,
  StatusBar,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { BOOKING_TEMPLATES } from "@/data/bookingTemplates";
import { getAvailableReservationSlots, getBookableItems, getStaff, getStaffGoLogBusy, getBookings, crossCalendars, claimSlot, getBookingSlotKey, BLOCKING_STATUSES, type Booking, type BookableItem, type BookingEngineTrace, type ClientBusyInterval, type ReservationSlot, type StaffOption, type Staff } from "@/data/booking";
import type { DebugStaffEntry } from "@/components/dev/GoBookingDebugOverlay";
import { getClientBusyIntervals } from "@/data/clientCalendar";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { PEOPLE_SECTORS, SUB_TO_SECTOR } from "@/data/goSectorData";
import { getBusinessIcon } from "@/lib/businessIcons";

// ─── Types ────────────────────────────────────────────────────────────────────
export type ProveedorData = {
  name: string;
  rating: string;
  distance: string;
  slots: number;
  badge?: string;
  subId: string;
  subLabel: string;
  subColor: string;
  subIcon: string;
  businessId?: string;
  itemId?: string;
  phone?: string;
  whatsapp?: string;
};

type Props = {
  visible: boolean;
  proveedor: ProveedorData | null;
  onClose: () => void;
  onBookingConfirmed?: (dateISO: string, time: string) => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const PRV_DAY_KEYS   = ["day_sun","day_mon","day_tue","day_wed","day_thu","day_fri","day_sat"] as const;
const PRV_MONTH_KEYS = ["month_jan","month_feb","month_mar","month_apr","month_may","month_jun","month_jul","month_aug","month_sep","month_oct","month_nov","month_dec"] as const;

function buildDays(tFn: ReturnType<typeof useLanguage>["t"]) {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const yyyy = d.getFullYear();
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const dd   = String(d.getDate()).padStart(2, "0");
    const dayShort   = tFn(PRV_DAY_KEYS[d.getDay()]);
    const monthShort = tFn(PRV_MONTH_KEYS[d.getMonth()]).slice(0, 3).toLowerCase();
    return {
      label:     i === 0 ? tFn("status_today") : dayShort,
      isToday:   i === 0,
      num:       d.getDate(),
      month:     monthShort,
      fullLabel: `${dayShort} ${d.getDate()} ${monthShort}`,
      isoDate:   `${yyyy}-${mm}-${dd}`,
    };
  });
}

function addMinutesToTime(timeHHMM: string, minutes: number): string {
  const [h, m] = timeHHMM.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}`;
}

function applyClientCrossingToMockSlots(
  slots: { time: string; available: boolean }[],
  dateISO: string,
  durationMinutes: number,
  clientBusy: ClientBusyInterval[],
): { time: string; available: boolean }[] {
  if (clientBusy.length === 0) return slots;
  const asProviderSlots = slots
    .filter((s) => s.available)
    .map((s) => ({
      startDatetime: `${dateISO}T${s.time}:00`,
      endDatetime:   `${dateISO}T${addMinutesToTime(s.time, durationMinutes)}:00`,
    }));
  const crossed = crossCalendars(asProviderSlots as any, clientBusy);
  const crossedTimes = new Set(crossed.map((s) => s.startDatetime.substring(11, 16)));
  return slots.map((s) => ({
    ...s,
    available: s.available && crossedTimes.has(s.time),
  }));
}

/**
 * buildRealSlots — genera franjas horarias a partir del horario REAL de la empresa.
 * Todas las franjas dentro de [fromMin, toMin) se marcan disponibles.
 * NO usa semillas aleatorias — el horario de empresa es sagrado.
 */
function buildRealSlots(serviceMinutes: number, fromMin: number, toMin: number) {
  const result: { time: string; available: boolean }[] = [];
  for (let m = fromMin; m + serviceMinutes <= toMin; m += serviceMinutes) {
    const h   = Math.floor(m / 60);
    const min = m % 60;
    result.push({
      time:      `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`,
      available: true,
    });
  }
  return result;
}

/** @deprecated Solo se mantiene para no romper imports. Usar buildRealSlots. */
function buildMockSlots(serviceMinutes: number, _daySeed: number, fromMin = 9 * 60, toMin = 20 * 60) {
  return buildRealSlots(serviceMinutes, fromMin, toMin);
}

/** @deprecated Solo se mantiene para no romper imports. Usar buildRealSlots. */
function buildMockSlotsForPro(serviceMinutes: number, _daySeed: number, _proIndex: number, fromMin = 9 * 60, toMin = 20 * 60) {
  return buildRealSlots(serviceMinutes, fromMin, toMin);
}

// ─── Component ────────────────────────────────────────────────────────────────
export function GoProveedorReservaSheet({
  visible,
  proveedor,
  onClose,
  onBookingConfirmed,
}: Props) {
  const insets = useSafeAreaInsets();
  const { config } = useBusinessConfig();
  const { t } = useLanguage();

  // ── Refs para auto-scroll entre pasos ─────────────────────────────────────
  const scrollRef  = useRef<ScrollView>(null);
  const paso2Y     = useRef(0);
  const paso3Y     = useRef(0);

  // ── Flujo: Servicio → Profesional → Fecha → Hora ──────────────────────────
  // selectedService:      null = sin elegir | >= 0 = índice en allServices
  // selectedProfessional: null = sin elegir | -1 = Indistinto | >= 0 = índice en staffData
  const [selectedService,      setSelectedService]      = useState<number | null>(null);
  const [selectedProfessional, setSelectedProfessional] = useState<number | null>(null);
  // lockedStaffId: ID estable del profesional fijado en el momento de la selección.
  // CRÍTICO: no depende de staffForService (que puede reordenarse al cargar goStaffRecords).
  // Es la fuente de verdad para el motor y para saveBooking. Sin esto, un reordenamiento
  // asíncrono de la lista hace que selectedProfessional=0 apunte a otra persona, el booking
  // se guarda con el staffId equivocado y el slot nunca queda bloqueado en la 2ª reserva.
  const [lockedStaffId,        setLockedStaffId]        = useState<string | undefined>(undefined);
  const [selectedDay,          setSelectedDay]          = useState(0);
  const [selectedSlot,         setSelectedSlot]         = useState<string | null>(null);
  const [confirmed,            setConfirmed]            = useState(false);
  const [saving,               setSaving]               = useState(false);

  // ── Profesionales ─────────────────────────────────────────────────────────
  // Fuente A: si el proveedor es el propio negocio del usuario → plantillaItems
  // Fuente B: proveedor externo / mock → staff del BOOKING_TEMPLATES[subId]
  const sectorId       = SUB_TO_SECTOR[proveedor?.subId ?? ""] ?? "";
  const isPeopleSector = PEOPLE_SECTORS.has(sectorId);

  const staffData: { name: string; emoji: string; services: string[] }[] = useMemo(() => {
    let raw: { name: string; emoji: string; services: string[] }[] = [];
    let source = "none";

    // Propio negocio con businessId coincidente
    if (
      proveedor?.businessId &&
      proveedor.businessId === config.businessId &&
      isPeopleSector
    ) {
      source = `config.plantillaItems (businessId=${config.businessId})`;
      raw = config.plantillaItems
        .flatMap(item => {
          // Guard: staffNames DEBE ser un array de strings (no un string suelto)
          const names: unknown[] = Array.isArray(item.staffNames) ? item.staffNames : [];
          const services: string[][] = Array.isArray(item.staffServices) ? item.staffServices : [];
          return names.map((n, i) => ({
            name:     typeof n === "string" ? n.trim() : "",
            emoji:    item.emoji,
            services: services[i] ?? [],
          }));
        });
    } else {
      // Proveedor externo o mock: staff del template
      source = `BOOKING_TEMPLATES[${proveedor?.subId ?? ""}]`;
      const templateStaff = BOOKING_TEMPLATES[proveedor?.subId ?? ""]?.staff;
      raw = templateStaff ?? [];
    }

    // ── Limpieza y normalización ──────────────────────────────────────────────
    // 1. Eliminar nombres < 3 chars (parciales: "I", "Is")
    // 2. Eliminar profesionales sin nombre
    // 3. Deduplicar por nombre normalizado
    const seenNorm = new Set<string>();
    const cleaned = raw.filter(p => {
      if (!p.name || p.name.length < 3) return false;
      const norm = p.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (seenNorm.has(norm)) return false;
      seenNorm.add(norm);
      return true;
    });

    console.log("PROFESSIONALS_SOURCE =", source);
    console.log("PROFESSIONALS_RENDERED =", cleaned.map(p => p.name));

    return cleaned;
  }, [isPeopleSector, config.plantillaItems, config.businessId, proveedor?.businessId, proveedor?.subId]);

  // Station label per sector so the client feels they're booking a physical space
  const stationInfo = useMemo(() => {
    const sid = proveedor?.subId ?? "";
    const emoji = getBusinessIcon(sid);
    if (["peluqueria", "barberia"].includes(sid)) return { emoji, label: t("biz_station_chair") };
    if (["unas", "estetica"].includes(sid))        return { emoji, label: t("biz_station_stand") };
    if (["masajes", "spa"].includes(sid))          return { emoji, label: t("biz_station_cabin") };
    if (["dentista", "medico"].includes(sid))      return { emoji, label: t("biz_station_box") };
    return { emoji: emoji !== "🏢" ? emoji : "🪑", label: t("biz_station_stand") };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proveedor?.subId, t]);

  const hasPros = staffData.length > 0;

  // ── Servicios reales (si hay businessId) ──────────────────────────────────
  const [realItems, setRealItems] = useState<BookableItem[]>([]);
  useEffect(() => {
    if (!proveedor?.businessId) { setRealItems([]); return; }
    let cancelled = false;
    getBookableItems(proveedor.businessId).then(items => {
      if (!cancelled) setRealItems(items.filter(i => i.active && i.visible));
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [proveedor?.businessId]);

  // ── Todos los servicios — SIN filtrar por profesional ────────────────────
  // El profesional se elige DESPUÉS del servicio.
  const allServices = useMemo(() => {
    if (realItems.length > 0) {
      return realItems.map(item => ({
        title: item.title,
        durationMinutes: item.durationMinutes,
        customerCapacity: item.customerCapacity,
        price: item.price,
      }));
    }
    return BOOKING_TEMPLATES[proveedor?.subId ?? ""]?.services ?? [];
  }, [realItems, proveedor?.subId]);

  // El servicio actualmente elegido
  const service = selectedService !== null ? (allServices[selectedService] ?? null) : null;
  const selectedServiceTitle = service?.title ?? "";

  // ── go_staff_v1 — fuente de IDs de servicio por profesional ──────────────
  // Debe declararse ANTES del useMemo staffForService (evitar temporal dead zone)
  const [goStaffRecords, setGoStaffRecords] = useState<Staff[]>([]);
  useEffect(() => {
    if (!proveedor?.businessId) { setGoStaffRecords([]); return; }
    let cancelled = false;
    getStaff(proveedor.businessId).then(list => {
      if (!cancelled) setGoStaffRecords(list);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [proveedor?.businessId]);

  // ── Staff elegible para el servicio elegido (paso 2) ─────────────────────
  // Validación: ID (principal, vía go_staff_v1) > nombre (fallback, vía plantillaItems)
  const staffForService = useMemo(() => {
    if (staffData.length === 0) return [];
    if (!service) return staffData;
    const anyHasServices = staffData.some(p => p.services.length > 0);
    if (!anyHasServices) return staffData; // ninguno tiene restricciones → todos

    // Resolver el BookableItem ID del servicio elegido (mismo cálculo que selectedItemId)
    const serviceTitle  = service.title.toLowerCase().trim();
    const matchedItemId = proveedor?.businessId
      ? (realItems.find(i => i.title.toLowerCase().trim() === serviceTitle)?.id ?? null)
      : null;

    // Construir set de stableIds que tienen este servicio por ID en go_staff_v1
    const staffIdsByServiceId = new Set<string>(
      matchedItemId
        ? goStaffRecords
            .filter(s => (s.serviceIds ?? []).includes(matchedItemId))
            .map(s => s.id)
        : [],
    );

    return staffData.filter(p => {
      if (p.services.length === 0) return true; // sin restricción → apto para todo
      // Validación principal: ID vía go_staff_v1 (solo cuando los registros ya cargaron)
      if (proveedor?.businessId && matchedItemId && goStaffRecords.length > 0) {
        const stableId = `${proveedor.businessId}_staff_${p.name
          .toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;
        // Si está en el set de IDs → apto; si NO está → puede que no tenga el servicio aún
        // Solo bloquear si el profesional TIENE serviceIds en go_staff_v1 y NO incluye el servicio
        const goRec = goStaffRecords.find(r => r.id === stableId);
        if (goRec && (goRec.serviceIds ?? []).length > 0) {
          // Este profesional tiene restricciones por ID → usar solo IDs
          return staffIdsByServiceId.has(stableId);
        }
        // Sin serviceIds en go_staff_v1 → caer a comparación por nombre
      }
      // Fallback: nombre vía plantillaItems (insensible a mayúsculas y espacios)
      return p.services.some(sv =>
        sv.toLowerCase().trim() === service.title.toLowerCase().trim()
      );
    });
  }, [staffData, service, goStaffRecords, realItems, proveedor?.businessId]);

  // availWindows removed — el motor lee directo del config, no de AvailabilityWindows

  // ── selectedItemId ─────────────────────────────────────────────────────────
  const selectedItemId = useMemo(() => {
    if (!proveedor?.businessId || !service) return proveedor?.itemId ?? null;
    const title = service.title.toLowerCase().trim();
    const match = realItems.find(i => i.title.toLowerCase().trim() === title);
    return match?.id ?? proveedor?.itemId ?? null;
  }, [proveedor?.businessId, proveedor?.itemId, service, realItems]);

  const [loadingSlots, setLoadingSlots] = useState(false);

  // ── Debug overlay ─────────────────────────────────────────────────────────
  const [debugVisible,  setDebugVisible]  = useState(false);
  const [engineTrace,   setEngineTrace]   = useState<BookingEngineTrace | null>(null);

  // ── Ocupados del profesional en go_log_v1 ────────────────────────────────
  const [staffGoBusy, setStaffGoBusy] = useState<ClientBusyInterval[]>([]);

  const days = useMemo(() => buildDays(t), [t]);

  // ── selectedStaffId — id estable del profesional seleccionado ────────────
  // ÚNICA FUENTE DE VERDAD: lockedStaffId fijado en el momento exacto del tap.
  // El ID es el patrón computado por nombre (businessId_staff_nombre) y es
  // determinista: siempre el mismo valor para el mismo profesional, sin importar
  // si goStaffRecords está o no cargado. Esto garantiza que booking 1 y booking 2
  // usan siempre el mismo staffId → el conflict-check detecta el solapamiento.
  const selectedStaffId = useMemo<string | undefined>(() => {
    if (!proveedor?.businessId || selectedProfessional === null || selectedProfessional < 0) return undefined;
    return lockedStaffId;
  }, [proveedor?.businessId, selectedProfessional, lockedStaffId]);

  // ── dayInfos — solo para UI del selector de días (indicadores abierto/cerrado) ──
  const dayInfos = useMemo(() => {
    const staffSchedCfg = selectedStaffId ? (config.staffSchedules ?? {})[selectedStaffId] : undefined;
    const useStaffSched = staffSchedCfg && !staffSchedCfg.useCompanySchedule;

    return days.map((d) => {
      const jsDay     = new Date(d.isoDate + "T00:00:00").getDay();
      const configDay = (jsDay + 6) % 7;

      if (useStaffSched) {
        const ds = (staffSchedCfg.daySchedules as any)?.[String(configDay)];
        if (!ds) return { open: false };
        const s1ok = ds.shift1?.active !== false && ds.shift1?.from && ds.shift1?.to;
        const s2ok = ds.shift2?.active && ds.shift2?.from && ds.shift2?.to;
        return { open: Boolean(s1ok || s2ok) };
      }
      if (!config.activeDays.includes(configDay)) return { open: false };
      return { open: true };
    });
  }, [days, selectedStaffId, config.staffSchedules, config.activeDays]);

  // ── Agenda ocupada del cliente ────────────────────────────────────────────
  const [clientBusy, setClientBusy] = useState<ClientBusyInterval[]>([]);
  useEffect(() => {
    const dateISO = days[selectedDay]?.isoDate;
    if (!dateISO) return;
    let cancelled = false;
    getClientBusyIntervals("local_user", dateISO).then(intervals => {
      if (!cancelled) setClientBusy(intervals);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDay, days]);

  // ── Ocupados del profesional en go_log_v1 ─────────────────────────────────
  useEffect(() => {
    setStaffGoBusy([]);
    const dateISO = days[selectedDay]?.isoDate;
    if (!dateISO || !selectedStaffId) return;
    let cancelled = false;
    getStaffGoLogBusy(selectedStaffId, dateISO).then(intervals => {
      if (!cancelled) setStaffGoBusy(intervals);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [selectedDay, selectedStaffId, days]);

  // ── AllStaffOptions — para el modo "sin preferencia" ─────────────────────
  const allStaffOptions = useMemo<StaffOption[]>(() => {
    if (!proveedor?.businessId) return [];
    return staffForService.map((p) => {
      const normalized = p.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      const stableId   = `${proveedor.businessId}_staff_${normalized}`;
      const schedCfg   = (config.staffSchedules ?? {})[stableId] ?? null;
      // Incluir serviceIds reales desde go_staff_v1 para que el motor "any"
      // use validación por ID en lugar de solo por nombre.
      const goRec      = goStaffRecords.find(r => r.id === stableId);
      return {
        id:            stableId,
        name:          p.name,
        services:      p.services,
        serviceIds:    goRec?.serviceIds ?? [],
        scheduleConfig: schedCfg,
      };
    });
  }, [proveedor?.businessId, staffForService, config.staffSchedules, goStaffRecords]);

  // ── Debug staff entries — muestra cada profesional con método de match y horario ──
  const debugStaffEntries = useMemo<DebugStaffEntry[]>(() => {
    if (!staffData.length) return [];
    const dateISO   = days[selectedDay]?.isoDate ?? "";
    const jsDay     = dateISO ? new Date(dateISO + "T00:00:00").getDay() : -1;
    const cfgDay    = (jsDay + 6 + 7) % 7;

    const serviceTitle  = service?.title.toLowerCase().trim() ?? "";
    const matchedItemId = proveedor?.businessId && service
      ? (realItems.find(i => i.title.toLowerCase().trim() === serviceTitle)?.id ?? null)
      : null;

    return staffData.map(p => {
      const stableId = `${proveedor?.businessId}_staff_${p.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`;
      const goRec    = goStaffRecords.find(r => r.id === stableId);

      // ── match method ──────────────────────────────────────────────────────
      let matchMethod: DebugStaffEntry["matchMethod"];
      let eligible: boolean;
      if (p.services.length === 0) {
        matchMethod = "no_restriction";
        eligible    = true;
      } else if (proveedor?.businessId && matchedItemId && goStaffRecords.length > 0 && goRec && (goRec.serviceIds ?? []).length > 0) {
        const hasId = (goRec.serviceIds ?? []).includes(matchedItemId);
        matchMethod = hasId ? "id" : "not_matched";
        eligible    = hasId;
      } else {
        const hasName = p.services.some(sv => sv.toLowerCase().trim() === serviceTitle);
        matchMethod   = hasName ? "name_fallback" : "not_matched";
        eligible      = hasName;
      }

      // ── schedule for selected day ─────────────────────────────────────────
      const schedCfg         = proveedor?.businessId ? (config.staffSchedules ?? {})[stableId] ?? null : null;
      const hasCustomSchedule = !!(schedCfg && !schedCfg.useCompanySchedule);
      let scheduleSource      = "company";
      let worksThisDay        = false;
      const shifts: { from: string; to: string }[] = [];

      if (hasCustomSchedule && schedCfg?.daySchedules && jsDay >= 0) {
        scheduleSource = "custom";
        const ds = (schedCfg.daySchedules as any)[String(cfgDay)];
        if (ds) {
          if (ds.shift1?.active !== false && ds.shift1?.from && ds.shift1?.to) {
            shifts.push({ from: ds.shift1.from, to: ds.shift1.to });
          }
          if (ds.shift2?.active && ds.shift2?.from && ds.shift2?.to) {
            shifts.push({ from: ds.shift2.from, to: ds.shift2.to });
          }
          worksThisDay = shifts.length > 0;
        }
      } else if (jsDay >= 0) {
        scheduleSource = "company";
        worksThisDay   = config.activeDays.includes(cfgDay);
        if (worksThisDay) {
          const override = (config.daySchedules as any)?.[String(cfgDay)];
          if (override?.shift1?.active !== false) {
            shifts.push({ from: override?.shift1?.from ?? config.openFrom ?? "09:00", to: override?.shift1?.to ?? config.openTo ?? "20:00" });
          }
          if (override?.shift2?.active && override.shift2.from && override.shift2.to) {
            shifts.push({ from: override.shift2.from, to: override.shift2.to });
          }
        }
      }

      return { name: p.name, id: stableId, eligible, matchMethod, hasCustomSchedule, scheduleSource, worksThisDay, shifts };
    });
  }, [
    staffData, goStaffRecords, realItems, service, proveedor?.businessId,
    config.staffSchedules, config.activeDays, config.daySchedules, config.openFrom, config.openTo,
    days, selectedDay,
  ]);

  // ── MOTOR ÚNICO: getAvailableReservationSlots ─────────────────────────────
  // Recalcula desde cero en cada cambio de servicio / profesional / día.
  // Garantiza: horario correcto (custom vs empresa), duración completa en turno,
  // sin solapados con reservas, sin duplicados, sin restos de selección anterior.
  // CRÍTICO: debe declararse ANTES del useEffect que lo usa como dependencia.
  const [availableSlots, setAvailableSlots] = useState<ReservationSlot[]>([]);

  // ── OCUPACIÓN DE SLOTS — lectura fresca de go_bookings_v1 ───────────────────
  // Set de tiempos "HH:MM" bloqueados para el día/profesional activo.
  // Mientras se calcula, loadingOccupied=true: los botones no se muestran.
  const [occupiedSlotTimes, setOccupiedSlotTimes] = useState<Set<string>>(new Set());
  const [loadingOccupied,   setLoadingOccupied]   = useState(false);
  // Error "hora ya reservada" — activado por claimSlot cuando rechaza una reserva
  const [alreadyTakenError, setAlreadyTakenError] = useState(false);
  // Razón del conflicto: "staff" (profesional ocupado) | "client" (cliente ya tiene reserva) | null
  const [conflictReason, setConflictReason] = useState<"staff" | "client" | null>(null);

  useEffect(() => {
    if (!proveedor?.businessId) { setOccupiedSlotTimes(new Set()); setLoadingOccupied(false); return; }
    if (availableSlots.length === 0) { setOccupiedSlotTimes(new Set()); setLoadingOccupied(false); return; }

    const bizId = proveedor.businessId;
    const isAny = selectedProfessional === -1;
    const sId: string | undefined = isAny ? undefined : (lockedStaffId ?? selectedStaffId);

    let cancelled = false;
    setLoadingOccupied(true);
    (async () => {
      try {
        // Una sola lectura de go_bookings_v1 — solapamiento real de intervalo
        const bookings = await getBookings({ businessId: bizId, status: BLOCKING_STATUSES });

        console.log("[OCCUPIED_CHECK] ▶ filtro de display", {
          businessId: bizId,
          sId:        sId ?? "(undefined — modo Indistinto o sin staff)",
          sIdSource:  sId === lockedStaffId ? "lockedStaffId" : sId === selectedStaffId ? "selectedStaffId" : "otro",
          totalBookingsEnStorage: bookings.length,
          bookings: bookings.map(b => ({
            id:      b.id.slice(-8),
            staffId: b.staffId ?? "(sin staff)",
            start:   b.startDatetime,
            end:     b.endDatetime,
            status:  b.status,
          })),
        });

        // Nombre normalizado del profesional (para fallback con IDs legacy en OCCUPIED_CHECK)
        const _occNormN = (n: string) =>
          n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const _occProObj = !isAny && selectedProfessional !== null && selectedProfessional >= 0
          ? staffForService[selectedProfessional] ?? null
          : null;
        const _occProNormName = _occProObj?.name ? _occNormN(_occProObj.name) : null;
        const _occNameFromId = (id: string): string => {
          if (id.includes("_staff_")) return (id.split("_staff_").pop() ?? "").replace(/_/g, "");
          return (id.split("-").pop() ?? "").replace(/_/g, "");
        };

        const occupied = new Set<string>();
        for (const slot of availableSlots) {
          const blocked = bookings.some(b => {
            // CAPA CLIENTE: el mismo usuario no puede tener dos reservas solapadas,
            // independientemente del profesional. Bloquea el slot en el display.
            if (b.customerId === "local_user") {
              return b.startDatetime < slot.endDatetime && b.endDatetime > slot.startDatetime;
            }
            // CAPA STAFF: filtro de staffId:
            //   • b.staffId undefined (Indistinto) → bloquea a todos → no saltar
            //   • IDs iguales → no saltar
            //   • IDs distintos pero mismo nombre (legacy) → no saltar
            //   • IDs distintos y nombres distintos → saltar (otra persona)
            if (sId !== undefined && b.staffId !== undefined && b.staffId !== sId) {
              // Fallback por nombre: "st-isa" vs "nemesi_molina_staff_isa" → ambos "isa"
              if (_occProNormName) {
                const bNamePart = _occNormN(_occNameFromId(b.staffId));
                if (!bNamePart || bNamePart !== _occProNormName) return false;
              } else {
                return false;
              }
            }
            return b.startDatetime < slot.endDatetime && b.endDatetime > slot.startDatetime;
          });
          if (blocked) {
            occupied.add(slot.time);
            console.log("[OCCUPIED_CHECK] slot BLOQUEADO →", slot.time, slot.startDatetime);
          }
        }

        console.log("[OCCUPIED_CHECK] ◀ slots ocupados →", Array.from(occupied));

        if (!cancelled) setOccupiedSlotTimes(occupied);
      } finally {
        if (!cancelled) setLoadingOccupied(false);
      }
    })();
    return () => { cancelled = true; };
  }, [availableSlots, selectedDay, selectedProfessional, lockedStaffId, selectedStaffId,
      proveedor?.businessId]);

  useEffect(() => {
    // Reset inmediato — nunca acumular slots anteriores
    setAvailableSlots([]);
    setEngineTrace(null);

    if (!service || selectedProfessional === null) return;

    const dateISO = days[selectedDay]?.isoDate;
    if (!dateISO) return;

    // Para profesionales sin businessId usamos buildRealSlots del horario empresa (mock)
    if (!proveedor?.businessId) return;

    const proIsAny = selectedProfessional === -1;
    const proObj   = !proIsAny ? staffForService[selectedProfessional] ?? null : null;

    const staffSchedCfg = selectedStaffId
      ? (config.staffSchedules ?? {})[selectedStaffId] ?? null
      : null;

    let cancelled = false;
    setLoadingSlots(true);

    // ── DIAGNÓSTICO: capturar estado ESTABLE antes del await ─────────────────
    const capturedStaffId    = selectedStaffId;
    const capturedStaffName  = !proIsAny ? (staffForService[selectedProfessional] ?? null)?.name ?? "(sin nombre)" : "Indistinto";
    const capturedServiceTitle = service.title;
    const capturedBusinessId   = proveedor.businessId;

    (async () => {
      try {
        // ── LOG DIAGNÓSTICO ─────────────────────────────────────────────────
        console.log("SELECTED STAFF",   { id: capturedStaffId, name: capturedStaffName });
        console.log("SELECTED SERVICE", { title: capturedServiceTitle, itemId: selectedItemId });
        console.log("SELECTED DATE",    dateISO);

        const clientBusyNow = await getClientBusyIntervals("local_user", dateISO);

        // ── LOG DIAGNÓSTICO CRÍTICO: clientBusyNow ────────────────────────────
        console.log("[CLIENT_BUSY_NOW]", {
          total:     clientBusyNow.length,
          dateISO,
          intervals: clientBusyNow.map(b => ({ start: b.start, end: b.end, reason: b.reason })),
        });

        // staffServiceIds: IDs reales de BookableItem del profesional (validación principal)
        const proStaffRecord = !proIsAny && capturedStaffId
          ? goStaffRecords.find(s => s.id === capturedStaffId) ?? null
          : null;

        const slots = await getAvailableReservationSlots({
          businessId:            proveedor.businessId!,
          businessName:          config.businessName ?? proveedor.name ?? "",
          selectedDate:          dateISO,
          serviceId:             selectedItemId ?? "",
          serviceName:           service.title,
          durationMinutes:       service.durationMinutes,
          professionalId:        proIsAny ? "any" : (selectedStaffId ?? null),
          professionalName:      proIsAny ? t("biz_any_professional") : (proObj?.name ?? ""),
          staffServices:         proIsAny ? [] : (proObj?.services ?? []),
          staffServiceIds:       proIsAny ? [] : (proStaffRecord?.serviceIds ?? []),
          businessActiveDays:    config.activeDays,
          businessDaySchedules:  config.daySchedules as any,
          businessOpenFrom:      config.openFrom ?? "09:00",
          businessOpenTo:        config.openTo   ?? "20:00",
          staffScheduleConfig:   proIsAny ? null : staffSchedCfg,
          allStaffOptions:       proIsAny ? allStaffOptions : undefined,
          staffGoBusyIntervals:  proIsAny ? [] : staffGoBusy,
          onDebugTrace:          (trace) => { if (!cancelled) setEngineTrace(trace); },
        });

        // Cruzar con agenda del cliente
        const asProviderSlots = slots.map(s => ({
          startDatetime: s.startDatetime,
          endDatetime:   s.endDatetime,
          availableUnits: 1,
          totalUnits:     1,
        }));
        const crossed = crossCalendars(asProviderSlots, clientBusyNow);
        const crossedSet = new Set(crossed.map(s => s.startDatetime));
        // ── NOTA: `let` requerido — el scan directo de go_log_v1 puede reducir la lista ──
        let clientFilteredSlots = slots.filter(s => crossedSet.has(s.startDatetime));

        // ── BLOQUEO DIRECTO go_log_v1 (misma lógica exacta que _checkProposalOverlap) ──
        // Lee go_log_v1 raw y filtra cualquier slot solapado con entradas del mismo día.
        // Actúa como segundo nivel de bloqueo garantizado aunque clientBusyNow llegue vacío.
        // Regla idéntica a _checkProposalOverlap: rechazado|cancelado|propuesto no bloquean.
        try {
          const _rawLog = await AsyncStorage.getItem("go_log_v1");
          if (_rawLog) {
            const _logEntries: Array<{
              dateISO?: string; time?: string; duration?: string;
              deleted?: boolean; estado?: string;
            }> = JSON.parse(_rawLog);
            const _logForDate = _logEntries.filter(e => {
              if (e.dateISO !== dateISO) return false;
              if (e.deleted) return false;
              if (e.estado === "rechazado" || e.estado === "cancelado" || e.estado === "propuesto") return false;
              if (!e.time || typeof e.time !== "string") return false;
              return true;
            });
            if (_logForDate.length > 0) {
              console.log("[GO_LOG_DIRECT_SCAN] entradas activas en el día", dateISO, _logForDate.map(e => ({ time: e.time, estado: e.estado, duration: e.duration })));
              clientFilteredSlots = clientFilteredSlots.filter(slot => {
                const [sh, sm] = slot.time.split(":").map(Number);
                const slotStartMin = sh * 60 + sm;
                const slotEndMin   = slotStartMin + service.durationMinutes;
                for (const e of _logForDate) {
                  const [eh, em] = (e.time as string).split(":").map(Number);
                  const entryStartMin = eh * 60 + em;
                  const durMatch      = (e.duration ?? "").match(/^(\d+)min$/);
                  const durMin        = durMatch ? parseInt(durMatch[1]!, 10) : 60;
                  const entryEndMin   = entryStartMin + durMin;
                  if (slotStartMin < entryEndMin && slotEndMin > entryStartMin) {
                    console.log("[GO_LOG_DIRECT_BLOCK] slot bloqueado", { slot: slot.time, por: e.time, estado: e.estado });
                    return false; // bloqueado
                  }
                }
                return true;
              });
            }
          }
        } catch (_logScanErr) {
          console.warn("[GO_LOG_DIRECT_SCAN] error:", _logScanErr);
        }

        // ── LOG: slots antes del filtro defensivo ────────────────────────────
        console.log("SLOTS BEFORE DEFENSIVE FILTER", clientFilteredSlots.map(s => ({
          time: s.time, start: s.startDatetime, end: s.endDatetime,
          pro: s.professionalId,
        })));

        // ── Filtro defensivo: lectura directa de go_bookings_v1 ──────────────
        // Segunda comprobación independiente del motor. Garantiza que ningún
        // slot solapado con una reserva activa del profesional llegue a la UI,
        // incluso si el motor interno falla por datos desactualizados.
        // CRÍTICO: usamos capturedStaffId (fijado antes del primer await)
        // para evitar que un cambio asíncrono de estado corrompa el filtro.
        const allBusinessBookings = await getBookings({
          businessId: capturedBusinessId!,
          status:     BLOCKING_STATUSES,
        });

        // ── LOG DIAGNÓSTICO: TODAS las reservas en storage ───────────────────
        console.log("ALL BOOKINGS", allBusinessBookings.map(b => ({
          id: b.id,
          businessId: b.businessId,
          staffId: b.staffId ?? "(sin staff)",
          start: b.startDatetime,
          end: b.endDatetime,
          status: b.status,
        })));

        // Nombre normalizado del profesional seleccionado (para fallback por nombre).
        // Cubre el caso de IDs legacy ("st-isa") que no coinciden con el ID canónico
        // actual ("nemesi_molina_staff_isa") pero sí con el mismo nombre de persona.
        const _normN = (n: string) =>
          n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
        const _selectedProNormName = !proIsAny && proObj?.name
          ? _normN(proObj.name)
          : null;

        // Extrae la parte de nombre del staffId, manejando formatos legacy y canónico.
        const _nameFromStaffId = (id: string): string => {
          if (id.includes("_staff_")) return (id.split("_staff_").pop() ?? "").replace(/_/g, "");
          return (id.split("-").pop() ?? "").replace(/_/g, "");
        };

        const proBookingsToday = allBusinessBookings.filter(b => {
          if (!b.startDatetime.startsWith(dateISO)) return false;
          // Para "cualquiera" (Indistinto): todas las reservas del día participan
          if (proIsAny) return true;
          // REGLA: bloquea si la reserva es Indistinto (b.staffId undefined) → afecta a todos
          if (b.staffId === undefined) return true;
          // REGLA: coincidencia exacta por ID canónico
          if (b.staffId === capturedStaffId) return true;
          // FALLBACK por nombre: IDs legacy ("st-isa") vs canónico ("nemesi_molina_staff_isa").
          // Se extrae el nombre del staffId legacy y se compara normalizado.
          // Cubre el caso en que la migración aún no ha corrido o fue parcial.
          if (_selectedProNormName) {
            const bookingNamePart = _normN(_nameFromStaffId(b.staffId));
            if (bookingNamePart && bookingNamePart === _selectedProNormName) return true;
          }
          return false;
        });

        // ── LOG DIAGNÓSTICO: reservas que participan en el bloqueo ───────────
        console.log("ACTIVE BOOKINGS USED FOR BLOCKING", proBookingsToday.map(b => ({
          id: b.id,
          staffId: b.staffId ?? "(Indistinto)",
          start: b.startDatetime,
          end: b.endDatetime,
          status: b.status,
        })));
        console.log("BLOCKING FILTER: capturedStaffId =", capturedStaffId ?? "(undefined — modo Indistinto)");

        const finalSlots = clientFilteredSlots.filter(s => {
          const hasOverlap = proBookingsToday.some(b =>
            s.startDatetime < b.endDatetime && s.endDatetime > b.startDatetime
          );
          if (hasOverlap) {
            console.log("BLOCKED SLOT ✓", { time: s.time, start: s.startDatetime, end: s.endDatetime });
          } else if (proBookingsToday.length > 0) {
            // Slot is NOT blocked — emit [VISIBLE_SLOT_BUG] when there are bookings present
            // so we can investigate why none of them blocked this slot.
            const nearbyBooking = proBookingsToday.find(b => {
              const slotDate = s.startDatetime.slice(0, 10);
              const bookDate = b.startDatetime.slice(0, 10);
              return slotDate === bookDate; // same day
            });
            if (nearbyBooking) {
              console.warn("[VISIBLE_SLOT_BUG]", {
                slot: {
                  time: s.time, startDatetime: s.startDatetime, endDatetime: s.endDatetime,
                },
                businessId:      capturedBusinessId,
                staffId:         capturedStaffId ?? "(Indistinto)",
                professionalName: capturedStaffName,
                date:            dateISO,
                bookingsOnDay:   proBookingsToday.map(b => ({
                  id: b.id, staffId: b.staffId ?? "(any)",
                  start: b.startDatetime, end: b.endDatetime, status: b.status,
                })),
                reason: [
                  `slot ${s.startDatetime} < booking end ${nearbyBooking.endDatetime} → ${s.startDatetime < nearbyBooking.endDatetime}`,
                  `slot end ${s.endDatetime} > booking start ${nearbyBooking.startDatetime} → ${s.endDatetime > nearbyBooking.startDatetime}`,
                  `overlap = ${s.startDatetime < nearbyBooking.endDatetime && s.endDatetime > nearbyBooking.startDatetime}`,
                ].join(" | "),
              });
            }
          }
          return !hasOverlap;
        });

        console.log("SLOTS AFTER (final visible)", finalSlots.map(s => ({
          time: s.time, start: s.startDatetime, end: s.endDatetime,
        })));

        if (!cancelled) {
          // CRITICAL: set loadingOccupied=true BEFORE setAvailableSlots so both
          // land in the SAME React render. This closes the brief flash window
          // where slots appear before occupiedSlotTimes has verified them against
          // go_bookings_v1. Without this, there is one render where loadingSlots=false
          // and loadingOccupied=false but availableSlots includes unverified slots.
          if (finalSlots.length > 0) setLoadingOccupied(true);
          setAvailableSlots(finalSlots);
        }
      } catch (err) {
        console.error("[GoReservaSheet] Error en motor de disponibilidad:", err);
        if (!cancelled) {
          setLoadingOccupied(false);
          setAvailableSlots([]);
        }
      } finally {
        if (!cancelled) setLoadingSlots(false);
      }
    })();

    return () => { cancelled = true; };
  }, [
    visible,   // ← CRÍTICO: re-corre el motor cada vez que el sheet se abre (visible false→true)
               //   garantiza lectura fresca de go_bookings_v1 aunque ningún otro dep cambie
    service, selectedProfessional, selectedDay, days,
    proveedor?.businessId, selectedItemId, selectedStaffId,
    config.activeDays, config.daySchedules, config.openFrom, config.openTo, config.staffSchedules,
    staffForService, allStaffOptions, staffGoBusy, goStaffRecords,
  ]);

  // ── Slots para mostrar ────────────────────────────────────────────────────
  // Fuente única: availableSlots filtrada por occupiedSlotTimes.
  // occupiedSlotTimes se recalcula con lectura fresca de go_bookings_v1 en el
  // useEffect de arriba — solapamiento real de intervalo, no comparación de prefijo.
  const displaySlots: { time: string; available: boolean }[] =
    (service === null || selectedProfessional === null)
      ? []
      : availableSlots
          .filter(s => !occupiedSlotTimes.has(s.time))
          .map(s => ({ time: s.time, available: true }));

  const color = proveedor?.subColor ?? "#4A80BD";

  // ── Reset helpers ──────────────────────────────────────────────────────────
  const resetFromService = useCallback(() => {
    setSelectedProfessional(null);
    setLockedStaffId(undefined);
    setSelectedSlot(null);
    setAvailableSlots([]);
    setOccupiedSlotTimes(new Set());
    setLoadingOccupied(false);
    setAlreadyTakenError(false);
  }, []);

  const resetFromPro = useCallback(() => {
    setSelectedSlot(null);
    setAvailableSlots([]);
    setOccupiedSlotTimes(new Set());
    setLoadingOccupied(false);
    setAlreadyTakenError(false);
  }, []);

  const handleClose = useCallback(() => {
    setSelectedService(null);
    setSelectedProfessional(null);
    setLockedStaffId(undefined);
    setSelectedDay(0);
    setSelectedSlot(null);
    setConfirmed(false);
    setSaving(false);
    setAvailableSlots([]);
    setOccupiedSlotTimes(new Set());
    setLoadingOccupied(false);
    setAlreadyTakenError(false);
    onClose();
  }, [onClose]);

  if (!visible || !proveedor) return null;

  // ── Derived step flags ─────────────────────────────────────────────────────
  // El paso Profesional es SIEMPRE obligatorio, independientemente de si hay
  // profesionales configurados. Si no hay staff real, solo aparece Indistinto.
  const serviceChosen = selectedService !== null && service !== null;
  const proChosen     = selectedProfessional !== null; // -1=indistinto, >=0=specific
  const slotChosen    = selectedSlot !== null;
  const allChosen     = proChosen && serviceChosen && slotChosen;

  // ── Pro labels ─────────────────────────────────────────────────────────────
  const confirmedProObj =
    selectedProfessional !== null && selectedProfessional >= 0
      ? staffForService[selectedProfessional] ?? null
      : null;
  // proLabel is NEVER null when a professional has been chosen — ensures it
  // always appears in confirmation screens, calendar cards, and saved entries.
  const proLabel =
    selectedProfessional === null ? null :
    selectedProfessional === -1  ? t("biz_any_professional") :
    confirmedProObj              ? `${confirmedProObj.emoji} ${confirmedProObj.name}` :
                                   t("biz_professional_assigned"); // fallback for stale state

  // ── Guardar reserva ─────────────────────────────────────────────────────────
  // Usa claimSlot — operación READ→CHECK→WRITE atómica sobre go_bookings_v1.
  // Nunca hay un gap entre la verificación y la escritura.
  //
  // Devuelve:
  //   { saved: true }             — reserva creada y persistida.
  //   { saved: false, alreadyTaken: true }  — slot ya ocupado, no se escribió nada.
  //   { saved: false, alreadyTaken: false } — error inesperado.
  const saveBooking = async (): Promise<{ saved: boolean; alreadyTaken: boolean; conflictReason?: "staff" | "client" }> => {
    console.log("[CONFIRM_PATH_REACHED] GoProveedorReservaSheet.saveBooking ENTERED", {
      hasService: !!service,
      businessId: proveedor?.businessId ?? "(missing)",
      selectedDay,
      selectedSlot,
    });
    const NOPE = (alreadyTaken = false, reason?: "staff" | "client") => ({ saved: false, alreadyTaken, conflictReason: reason });

    if (!service || !proveedor?.businessId) {
      console.warn("[CONFIRM_PATH_REACHED] GoProveedorReservaSheet.saveBooking EARLY_RETURN_1 — missing service or businessId", { service, businessId: proveedor?.businessId });
      return NOPE();
    }
    const dayData = days[selectedDay];
    const dateISO = dayData?.isoDate ?? "";
    const time    = selectedSlot ?? "";
    if (!dateISO || !time) {
      console.warn("[CONFIRM_PATH_REACHED] GoProveedorReservaSheet.saveBooking EARLY_RETURN_2 — missing dateISO or time", { dateISO, time });
      return NOPE();
    }

    // ── staffId: única fuente de verdad = lockedStaffId ─────────────────────
    // lockedStaffId se fija al tocar el profesional con el ID computado por nombre
    // (businessId_staff_nombre). Es determinista: mismo valor en cualquier reserva
    // para el mismo profesional, sin importar el estado de carga de goStaffRecords.
    const resolvedStaffId: string | undefined =
      selectedProfessional === -1 ? undefined : (lockedStaffId ?? undefined);
    console.log("[saveBooking] staffId →", resolvedStaffId ?? "(Indistinto)");

    // Calcular endTime
    const [th, tm] = time.split(":").map(Number);
    const startMin = (th || 0) * 60 + (tm || 0);
    const endMin   = startMin + service.durationMinutes;
    const endTime  = `${String(Math.floor(endMin / 60)).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;

    // ── HARD CONFLICT GUARD ─────────────────────────────────────────────────────
    // Pre-write check: reads go_bookings_v1 directly before ANY write happens.
    // 5-condition normalized check (no slotKey reliance):
    //   same businessId + same staffId + active status + same date + time overlap
    // If conflict found → bail immediately; nothing is written anywhere.
    {
      const _rawBk  = await AsyncStorage.getItem("go_bookings_v1");
      const _allBk: Booking[] = _rawBk ? JSON.parse(_rawBk) : [];
      const _candidateStart = `${dateISO}T${time}:00`;
      const _candidateEnd   = `${dateISO}T${endTime}:00`;
      let _hardConflict: Booking | null = null;
      let _hardReason: "staff" | "client" = "staff";
      for (const b of _allBk) {
        // 1. Same business
        if (b.businessId !== proveedor.businessId) continue;
        // 2. Active status only
        if (!BLOCKING_STATUSES.includes(b.status)) continue;
        // 3. Same date
        if (!b.startDatetime.startsWith(dateISO)) continue;
        // 4. Time overlap
        const _overlap = _candidateStart < b.endDatetime && _candidateEnd > b.startDatetime;
        if (!_overlap) continue;
        // 5a. CLIENT conflict: same customer in two overlapping bookings (any staff)
        const _sameCustomer = !!(b.customerId) && b.customerId === "local_user";
        if (_sameCustomer) {
          _hardConflict = b;
          _hardReason = "client";
          break;
        }
        // 5b. STAFF conflict: skip only when BOTH sides have defined, differing staffIds
        if (
          resolvedStaffId !== undefined &&
          b.staffId       !== undefined &&
          b.staffId       !== resolvedStaffId
        ) continue;
        _hardConflict = b;
        _hardReason = "staff";
        break;
      }

      if (_hardConflict) {
        console.warn("[HARD_CONFLICT_GUARD] BLOCKED — duplicate slot detected before write", {
          reason: _hardReason,
          candidate: {
            businessId: proveedor.businessId,
            staffId:    resolvedStaffId ?? "(any)",
            date:       dateISO,
            startTime:  time,
            endTime,
          },
          conflict: {
            id:        _hardConflict.id,
            businessId: _hardConflict.businessId,
            staffId:   _hardConflict.staffId ?? "(any)",
            customerId: _hardConflict.customerId ?? "(none)",
            date:      _hardConflict.startDatetime.slice(0, 10),
            startTime: _hardConflict.startDatetime.slice(11, 16),
            endTime:   _hardConflict.endDatetime.slice(11, 16),
            status:    _hardConflict.status,
          },
        });
        setAlreadyTakenError(true);
        setConflictReason(_hardReason);
        return { saved: false, alreadyTaken: true, conflictReason: _hardReason };
      }
      console.log("[HARD_CONFLICT_GUARD] CLEAR — no conflict, proceeding to write");
    }

    const entryId = `go_booking_cli_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const bookingId = entryId.replace(/^go_booking_cli_/, "");

    const candidate: Omit<Booking, "id"> = {
      businessId:    proveedor.businessId,
      bookableItemId: selectedItemId ?? "",
      customerId:    "local_user",
      staffId:       resolvedStaffId,
      startDatetime: `${dateISO}T${time}:00`,
      endDatetime:   `${dateISO}T${endTime}:00`,
      unitsReserved: 1,
      peopleCount:   1,
      status:        "CONFIRMED",
      paymentStatus: "none",
      goEntryId:     entryId,
    };

    console.log("[claimSlot] INTENTANDO →", {
      businessId:    candidate.businessId,
      staffId:       candidate.staffId ?? "(Indistinto)",
      startDatetime: candidate.startDatetime,
      endDatetime:   candidate.endDatetime,
    });

    try {
      // ── ATÓMICO: verifica solapamiento y escribe en una sola operación ──────
      const result = await claimSlot({ ...candidate, id: bookingId });

      if (!result.ok) {
        const _claimReason = result.conflictReason ?? "staff";
        console.warn("[claimSlot] RECHAZADO — slot ya ocupado:", {
          reason:        _claimReason,
          conflictId:    result.conflict.id,
          conflictStaff: result.conflict.staffId ?? "(Indistinto)",
          conflictStart: result.conflict.startDatetime,
          conflictEnd:   result.conflict.endDatetime,
          conflictStatus: result.conflict.status,
        });
        setConflictReason(_claimReason);
        return { saved: false, alreadyTaken: true, conflictReason: _claimReason };
      }

      console.log("[claimSlot] ✓ RESERVA CREADA — id:", result.booking.id, "status:", result.booking.status);
      console.log("[SAVE_BOOKING]", result.booking.id, result.booking.businessId, result.booking.staffId, result.booking.startDatetime?.split("T")[0], result.booking.startDatetime?.split("T")[1]?.slice(0,5), result.booking.endDatetime?.split("T")[1]?.slice(0,5), result.booking.slotKey);
      console.log("[WRITE_GO_BOOKING_SOURCE]", {
        sourceFile:     "GoProveedorReservaSheet.tsx",
        functionName:   "saveBooking/claimSlot",
        bookingId:      result.booking.id,
        businessId:     result.booking.businessId,
        staffId:        result.booking.staffId      ?? undefined,
        professionalId: resolvedStaffId             ?? undefined,
        serviceId:      result.booking.bookableItemId       ?? undefined,
        date:           result.booking.startDatetime?.slice(0, 10),
        startTime:      result.booking.startDatetime?.slice(11, 16),
        endTime:        result.booking.endDatetime?.slice(11, 16),
        slotKey:        result.booking.slotKey      ?? undefined,
        status:         result.booking.status,
      });

      // ── go_log_v1 — UI visual (no crítico para disponibilidad) ───────────────
      try {
        const dateLbl = new Date(dateISO + "T00:00:00").toLocaleDateString("es-ES", {
          weekday: "short", day: "numeric", month: "short",
        });

        console.log("[BOOKING_BEFORE_TRANSFORM]", {
          sourceFile:     "GoProveedorReservaSheet.tsx",
          functionName:   "saveBooking → go_log_v1 entry build",
          bookingId:      result.booking.id,
          staffId:        result.booking.staffId      ?? undefined,
          professionalId: resolvedStaffId             ?? undefined,
          slotKey:        result.booking.slotKey      ?? undefined,
          date:           dateISO,
          time,
        });

        const _prv_slotKey = result.booking.slotKey ?? getBookingSlotKey(result.booking);

        const entry = {
          id:               entryId,
          intentKey:        "reserva",
          intentLabel:      t("biz_booking_intent_label"),
          color:            proveedor.subColor,
          place:            proveedor.name,
          date:             dateLbl,
          dateISO,
          time,
          duration:         `${service.durationMinutes}min`,
          contactName:      proveedor.name,
          phone:            proveedor.phone    ?? "",
          whatsapp:         proveedor.whatsapp ?? "",
          estado:           "aceptado",
          notes:            service.title,
          type:             "GO_BOOKING",
          kind:             "received",
          professionalName: proLabel ?? "",
          professionalId:   resolvedStaffId ?? "any",
          // Booking-critical fields — required for slot conflict detection
          staffId:          result.booking.staffId,
          slotKey:          _prv_slotKey,
          businessId:       result.booking.businessId,
          serviceId:        result.booking.bookableItemId,
          reservationId:    result.booking.id,
          bookingStatus:    "confirmada",
          startTime:        time,
          endTime:          result.booking.endDatetime?.slice(11, 16),
        };

        console.log("[BOOKING_AFTER_TRANSFORM]", {
          sourceFile:     "GoProveedorReservaSheet.tsx",
          functionName:   "saveBooking → go_log_v1 entry build",
          bookingId:      result.booking.id,
          entryId:        entry.id,
          staffId:        (entry as any).staffId      ?? undefined,
          professionalId: (entry as any).professionalId ?? undefined,
          slotKey:        (entry as any).slotKey      ?? undefined,
          date:           dateISO,
          time,
        });
        if (!(entry as any).staffId || !(entry as any).slotKey) {
          console.warn("[MISSING_STAFF_OR_SLOT]", {
            sourceFile:         "GoProveedorReservaSheet.tsx",
            functionName:       "saveBooking → go_log_v1 entry build",
            bookingId:          result.booking.id,
            entryId:            entry.id,
            staffId:            (entry as any).staffId  ?? undefined,
            professionalId:     (entry as any).professionalId ?? undefined,
            slotKey:            (entry as any).slotKey  ?? undefined,
            bookingHadStaffId:  !!result.booking.staffId,
            bookingHadSlotKey:  !!result.booking.slotKey,
            date:               dateISO,
            time,
          });
        }

        const raw = await AsyncStorage.getItem("go_log_v1");
        const log = raw ? JSON.parse(raw) : [];
        console.log("[WRITE_GO_LOG_SOURCE]", {
          sourceFile:     "GoProveedorReservaSheet.tsx",
          functionName:   "saveBooking → go_log_v1",
          bookingId:      result.booking.id,
          businessId:     result.booking.businessId,
          staffId:        result.booking.staffId      ?? undefined,
          professionalId: resolvedStaffId             ?? undefined,
          serviceId:      result.booking.bookableItemId       ?? undefined,
          date:           dateISO,
          startTime:      time,
          endTime:        undefined,
          slotKey:        result.booking.slotKey      ?? undefined,
          status:         result.booking.status,
          entryId:        entry.id,
          entryType:      "GO_BOOKING",
        });
        if (!result.booking.staffId || !result.booking.slotKey) {
          console.warn("[BOOKING_CARD_MISSING_FIELDS]", {
            sourceFile:     "GoProveedorReservaSheet.tsx",
            functionName:   "saveBooking → go_log_v1",
            bookingId:      result.booking.id,
            businessId:     result.booking.businessId,
            staffId:        result.booking.staffId      ?? undefined,
            professionalId: resolvedStaffId             ?? undefined,
            serviceId:      result.booking.bookableItemId       ?? undefined,
            date:           dateISO,
            startTime:      time,
            endTime:        undefined,
            slotKey:        result.booking.slotKey      ?? undefined,
            status:         result.booking.status,
            missingStaffId: !result.booking.staffId,
            missingSlotKey: !result.booking.slotKey,
          });
        }
        console.log("[BOOKING_CARD_BUILD]", {
          sourceFile:     "GoProveedorReservaSheet.tsx",
          functionName:   "saveBooking → go_log_v1",
          bookingId:      result.booking.id,
          entryId:        entry.id,
          entryType:      "GO_BOOKING",
          staffId:        (entry as any).staffId      ?? undefined,
          professionalId: (entry as any).professionalId ?? undefined,
          slotKey:        (entry as any).slotKey      ?? undefined,
          date:           dateISO,
          time,
          action:         "appended",
        });
        // ── WRITE-LEVEL DEDUPE ──────────────────────────────────────────────────
        // Slot fingerprint: businessId|staffId|dateISO|startTime|endTime
        // Evict any existing entry for the same slot before appending the new one.
        const _entryFp = `${(entry as any).businessId ?? ""}|${(entry as any).staffId ?? "any"}|${(entry as any).dateISO ?? ""}|${(entry as any).time ?? ""}|${(entry as any).endTime ?? ""}`;
        const _logDeduped = log.filter((e: any) => {
          const isBkType = e.type === "GO_BOOKING" || e.type === "GO_RESERVA";
          if (!isBkType) return true;
          const fp = `${e.businessId ?? ""}|${e.staffId ?? "any"}|${e.dateISO ?? ""}|${e.time ?? ""}|${e.endTime ?? ""}`;
          if (fp === _entryFp && e.id !== entry.id) {
            console.log("[WRITE_DEDUPE/GoProveedorReservaSheet] evicting duplicate entry", { id: e.id, fp });
            return false;
          }
          return true;
        });
        const _existsIdx = _logDeduped.findIndex((e: any) => e.id === entry.id);
        if (_existsIdx >= 0) _logDeduped[_existsIdx] = entry; else _logDeduped.push(entry);
        await AsyncStorage.setItem("go_log_v1", JSON.stringify(_logDeduped));
      } catch (logErr) {
        console.error("[SaveBooking] go_log_v1 error (no crítico):", logErr);
      }

      return { saved: true, alreadyTaken: false };

    } catch (err) {
      console.error("[claimSlot] ERROR:", err);
      return NOPE();
    }
  };

  // ── Etiquetas para la pantalla de confirmación ───────────────────────────
  const dayDataConfirm   = days[selectedDay];
  const durationLabel    = service
    ? service.durationMinutes < 60
      ? `${service.durationMinutes} min`
      : `${(service.durationMinutes / 60).toFixed(service.durationMinutes % 60 !== 0 ? 1 : 0)} h`
    : null;

  // ── PANTALLA PRINCIPAL (única Modal — confirmación dentro) ─────────────────
  const step1Done = serviceChosen;
  const step2Done = proChosen;
  const step3Done = slotChosen;

  // ── Day-of-week label for overlay ─────────────────────────────────────────
  const _DAY_NAMES_ES = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
  const _debugDateISO  = days[selectedDay]?.isoDate ?? "";
  const _debugJsDay    = _debugDateISO ? new Date(_debugDateISO + "T00:00:00").getDay() : -1;
  const _debugDayOfWeek = _debugJsDay >= 0 ? _DAY_NAMES_ES[_debugJsDay] : "—";

  return (
    <Modal visible animationType="slide" presentationStyle="fullScreen" onRequestClose={handleClose}>
      <StatusBar barStyle="light-content" />

      {/* ── Debug overlay — fullscreen, z-index 9999 (dev only) ── */}
      {__DEV__ && debugVisible && (() => {
        const { GoBookingDebugOverlay } = require("@/components/dev/GoBookingDebugOverlay");
        return (
          <GoBookingDebugOverlay
            visible={debugVisible}
            onClose={() => setDebugVisible(false)}
            serviceTitle={service?.title ?? ""}
            serviceDuration={service?.durationMinutes ?? 0}
            serviceItemId={selectedItemId}
            date={_debugDateISO}
            dayOfWeek={_debugDayOfWeek}
            staffEntries={debugStaffEntries}
            goBusyIntervals={staffGoBusy.map(g => ({
              start: g.start.substring(11, 16),
              end:   g.end.substring(11, 16),
            }))}
            engineTrace={engineTrace}
            finalSlots={availableSlots.map(s => ({ time: s.time, professional: s.professionalName }))}
          />
        );
      })()}

      {/* ════════════════════════════════════════════════════════════════
          PANTALLA DE CONFIRMACIÓN — se superpone al flujo principal
          ════════════════════════════════════════════════════════════════ */}
      {confirmed ? (
        <View style={{ flex: 1, backgroundColor: "#050505", alignItems: "center", justifyContent: "center", padding: 28 }}>

          {/* ── Icono ✅ ── */}
          <View style={{
            width: 88, height: 88, borderRadius: 44,
            backgroundColor: color + "15",
            borderWidth: 2.5, borderColor: color,
            alignItems: "center", justifyContent: "center", marginBottom: 20,
          }}>
            <Feather name="check" size={40} color={color} />
          </View>

          <Text style={{ fontSize: 11, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 2, color, marginBottom: 6 }}>
            RESERVA CONFIRMADA
          </Text>
          <Text style={{ fontSize: 22, fontFamily: "Inter_900Black", fontWeight: "900", color: "#FFFFFF", textAlign: "center", marginBottom: 28 }}>
            {proveedor.name}
          </Text>

          {/* ── Tarjeta de detalles ── */}
          <View style={{
            width: "100%", backgroundColor: "#0E0E0E",
            borderRadius: 22, padding: 20,
            borderWidth: 1, borderColor: "rgba(255,255,255,0.09)",
            shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 14, elevation: 4,
            gap: 0, marginBottom: 28,
          }}>
            <DetailRow icon="briefcase" label={t("biz_step_company_label").toUpperCase()}     value={proveedor.name}  color={color} last={false} />
            {service && (
              <DetailRow
                icon={proveedor.subIcon as any}
                label={t("biz_step_service_label").toUpperCase()}
                value={service.title}
                color={color}
                badge={durationLabel ?? undefined}
                last={!proLabel}
              />
            )}
            {proLabel && (
              <DetailRow icon="user" label={t("biz_step_professional_label").toUpperCase()} value={proLabel} color={color} last={false} />
            )}
            <DetailRow
              icon="calendar"
              label={t("biz_step_datetime_label").toUpperCase()}
              value={`${dayDataConfirm.isToday ? t("status_today") : dayDataConfirm.fullLabel}  ·  ${selectedSlot}`}
              color={color}
              last={true}
            />
          </View>

          {/* ── Indicador guardado ── */}
          <View style={{
            flexDirection: "row", alignItems: "center", gap: 7,
            backgroundColor: "rgba(0,229,255,0.08)", borderRadius: 10,
            paddingHorizontal: 14, paddingVertical: 8,
            borderWidth: 1, borderColor: "rgba(0,229,255,0.20)",
            marginBottom: 20,
          }}>
            <Feather name="zap" size={13} color="#00e5ff" />
            <Text style={{ fontSize: 12, fontWeight: "700", color: "rgba(255,255,255,0.75)" }}>
              Guardado en tu calendario GO
            </Text>
          </View>

          {/* ── Contacto rápido ── */}
          {(proveedor.phone || proveedor.whatsapp) && (
            <View style={{ flexDirection: "row", gap: 10, width: "100%", marginBottom: 24 }}>
              {proveedor.phone ? (
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => Linking.openURL(`tel:${proveedor.phone}`).catch(() => {})}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    gap: 8, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 14,
                    paddingVertical: 13, borderWidth: 1, borderColor: "rgba(255,255,255,0.10)",
                  }}
                >
                  <Feather name="phone" size={16} color="#FFFFFF" />
                  <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13 }}>Llamar</Text>
                </TouchableOpacity>
              ) : null}
              {proveedor.whatsapp ? (
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => Linking.openURL(`https://wa.me/${proveedor.whatsapp!.replace(/\D/g, "")}`).catch(() => {})}
                  style={{
                    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                    gap: 8, backgroundColor: "rgba(37,211,102,0.10)", borderRadius: 14,
                    paddingVertical: 13, borderWidth: 1, borderColor: "rgba(37,211,102,0.22)",
                  }}
                >
                  <Feather name="message-circle" size={16} color="#25D366" />
                  <Text style={{ color: "#25D366", fontWeight: "700", fontSize: 13 }}>WhatsApp</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          )}

          {/* ── Botón OK ── */}
          <TouchableOpacity
            activeOpacity={0.88}
            style={{
              width: "100%", backgroundColor: color,
              borderRadius: 18, paddingVertical: 16, alignItems: "center",
              shadowColor: color, shadowOpacity: 0.32, shadowRadius: 14, elevation: 6,
            }}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              const dateISO = days[selectedDay]?.isoDate ?? "";
              const time    = selectedSlot ?? "";
              onBookingConfirmed?.(dateISO, time);
              handleClose();
            }}
          >
            <Text style={{ color: "#fff", fontFamily: "Inter_900Black", fontWeight: "900", fontSize: 16, letterSpacing: 0.5 }}>
              OK — Ver en calendario
            </Text>
          </TouchableOpacity>

        </View>
      ) : (

      <View style={{ flex: 1, backgroundColor: "#050505" }}>

        {/* ── Header ── */}
        <View style={{
          backgroundColor: "#0E0E0E",
          borderBottomWidth: 1, borderBottomColor: "rgba(255,255,255,0.09)",
          paddingTop: insets.top + 12, paddingBottom: 18, paddingHorizontal: 18,
        }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <TouchableOpacity
              onPress={handleClose}
              style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center" }}
            >
              <Feather name="x" size={20} color="rgba(255,255,255,0.55)" />
            </TouchableOpacity>

            <View style={{
              width: 46, height: 46, borderRadius: 15,
              backgroundColor: color + "18",
              borderWidth: 1.5, borderColor: color + "44",
              alignItems: "center", justifyContent: "center",
            }}>
              <Feather name={proveedor.subIcon as any} size={20} color={color} />
            </View>

            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontFamily: "Inter_900Black", fontWeight: "900", color: "#FFFFFF" }} numberOfLines={1}>
                {proveedor.name}
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>⭐ {proveedor.rating}</Text>
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>📍 {proveedor.distance}</Text>
                <View style={{ backgroundColor: color + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_900Black", fontWeight: "900", color, letterSpacing: 0.5 }}>
                    {proveedor.subLabel.toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>

            {/* ── Debug toggle (🔬) — dev only ── */}
            {__DEV__ && (
              <TouchableOpacity
                onPress={() => setDebugVisible(v => !v)}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                style={{ width: 36, height: 36, alignItems: "center", justifyContent: "center",
                         borderRadius: 10, backgroundColor: debugVisible ? "#4A80BD22" : "transparent" }}
              >
                <Text style={{ fontSize: 16 }}>🔬</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* ── Indicador de pasos ── */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 14 }}>
            {[
              { label: t("biz_step_service_label"),      done: step1Done },
              { label: t("biz_step_professional_label"), done: step2Done },
              { label: t("biz_step_time_label"),         done: step3Done },
            ].map((step, i, arr) => (
              <React.Fragment key={step.label}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                  <View style={{
                    width: 20, height: 20, borderRadius: 10,
                    backgroundColor: step.done ? color : "rgba(255,255,255,0.12)",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {step.done
                      ? <Feather name="check" size={11} color="#fff" />
                      : <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", fontWeight: "800", color: "rgba(255,255,255,0.38)" }}>{i + 1}</Text>
                    }
                  </View>
                  <Text style={{ fontSize: 10, fontWeight: "700", color: step.done ? color : "rgba(255,255,255,0.38)" }}>
                    {step.label}
                  </Text>
                </View>
                {i < arr.length - 1 && (
                  <View style={{ flex: 1, height: 1, backgroundColor: step.done ? color + "50" : "rgba(255,255,255,0.12)" }} />
                )}
              </React.Fragment>
            ))}
          </View>
        </View>

        {/* ── Scroll body ── */}
        <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 160 }}>

          {/* ══════════════════════════════════════════════════════════════
              PASO 1 · SERVICIO — siempre visible, primer paso obligatorio
              ══════════════════════════════════════════════════════════════ */}
          <View style={{ margin: 16, marginTop: 16 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: "rgba(255,255,255,0.38)", letterSpacing: 1.4, marginBottom: 12 }}>
              1 · SERVICIO
            </Text>
            {allServices.length === 0 ? (
              <View style={{ backgroundColor: "#0E0E0E", borderRadius: 18, padding: 20, alignItems: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.09)" }}>
                <Text style={{ fontSize: 13, color: "rgba(255,255,255,0.38)", textAlign: "center" }}>
                  Este negocio aún no tiene servicios configurados.
                </Text>
              </View>
            ) : (
              <View style={{ gap: 8 }}>
                {allServices.map((svc, i) => {
                  const active = selectedService === i;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedService(active ? null : i);
                        resetFromService();
                        if (!active) {
                          setTimeout(() => scrollRef.current?.scrollTo({ y: paso2Y.current - 16, animated: true }), 280);
                        }
                      }}
                      activeOpacity={0.82}
                      style={{
                        flexDirection: "row", alignItems: "center",
                        backgroundColor: active ? "#141414" : "#0E0E0E",
                        borderRadius: 18, padding: 14,
                        borderWidth: 1.5,
                        borderColor: active ? color : "rgba(255,255,255,0.09)",
                        shadowColor: active ? color : "#000",
                        shadowOpacity: active ? 0.14 : 0.04,
                        shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
                        elevation: active ? 4 : 1,
                      }}
                    >
                      {active && (
                        <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 4, backgroundColor: color, borderTopLeftRadius: 18, borderBottomLeftRadius: 18 }} />
                      )}
                      <View style={{ flex: 1, gap: 3, paddingLeft: active ? 8 : 0 }}>
                        <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#FFFFFF" }}>{svc.title}</Text>
                        <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.50)" }}>
                          {svc.durationMinutes < 60
                            ? `${svc.durationMinutes} min`
                            : `${(svc.durationMinutes / 60).toFixed(svc.durationMinutes % 60 !== 0 ? 1 : 0)} h`}
                          {svc.customerCapacity > 1 ? ` · hasta ${svc.customerCapacity} personas` : " · 1 persona"}
                        </Text>
                      </View>
                      {svc.price !== undefined && svc.price > 0 && (
                        <Text style={{ fontSize: 16, fontWeight: "900", color: active ? color : "rgba(255,255,255,0.65)" }}>
                          {svc.price}€
                        </Text>
                      )}
                      {active && (
                        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: color, alignItems: "center", justifyContent: "center", marginLeft: 10 }}>
                          <Feather name="check" size={12} color="#fff" />
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              PASO 2 · PROFESIONAL — visible SIEMPRE tras elegir servicio.
              Si no hay profesionales configurados muestra únicamente Indistinto.
              ══════════════════════════════════════════════════════════════ */}
          {serviceChosen && (
            <View onLayout={(e) => { paso2Y.current = e.nativeEvent.layout.y; }} style={{ marginHorizontal: 16, marginBottom: 20 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: "rgba(255,255,255,0.38)", letterSpacing: 1.4 }}>
                  2 · PROFESIONAL
                </Text>
                {/* Badge del servicio elegido */}
                <View style={{ backgroundColor: color + "14", borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 1, borderColor: color + "30" }}>
                  <Text style={{ fontSize: 9, fontFamily: "Inter_700Bold", fontWeight: "800", color, letterSpacing: 0.3 }}>
                    {selectedServiceTitle.toUpperCase()}
                  </Text>
                </View>
              </View>

              {staffForService.length === 0 ? (
                /* Sin profesionales configurados → solo Indistinto */
                (() => {
                  const active = selectedProfessional === -1;
                  return (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedProfessional(active ? null : -1);
                        setLockedStaffId(undefined); // "cualquiera" no tiene ID fijo
                        resetFromPro();
                        if (!active) {
                          setTimeout(() => scrollRef.current?.scrollTo({ y: paso3Y.current - 16, animated: true }), 280);
                        }
                      }}
                      activeOpacity={0.82}
                      style={{
                        flexDirection: "row", alignItems: "center", gap: 12,
                        backgroundColor: active ? "#141414" : "#0E0E0E",
                        borderRadius: 16, padding: 14,
                        borderWidth: 1.5,
                        borderColor: active ? "#6B7280" : "rgba(255,255,255,0.09)",
                        shadowColor: "#000",
                        shadowOpacity: active ? 0.08 : 0.04,
                        shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
                        elevation: active ? 4 : 1,
                      }}
                    >
                      <View style={{
                        width: 42, height: 42, borderRadius: 21,
                        backgroundColor: active ? "rgba(107,114,128,0.12)" : "rgba(255,255,255,0.06)",
                        borderWidth: 1.5,
                        borderColor: active ? "#6B7280" : "transparent",
                        alignItems: "center", justifyContent: "center",
                      }}>
                        <Feather name="shuffle" size={18} color={active ? "#6B7280" : "rgba(255,255,255,0.38)"} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#FFFFFF" : "#6B7280" }}>
                          Sin preferencia
                        </Text>
                        <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
                          Cualquier profesional del servicio
                        </Text>
                      </View>
                      {active ? (
                        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#6B7280", alignItems: "center", justifyContent: "center" }}>
                          <Feather name="check" size={13} color="#fff" />
                        </View>
                      ) : (
                        <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
                      )}
                    </TouchableOpacity>
                  );
                })()
              ) : (
                <View style={{ gap: 8 }}>
                  {/* Profesionales disponibles para el servicio */}
                  {staffForService.map((pro, i) => {
                    const active = selectedProfessional === i;
                    return (
                      <TouchableOpacity
                        key={`${pro.name}_${i}`}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          if (active) {
                            // Deseleccionar — limpiar bloqueo
                            setSelectedProfessional(null);
                            setLockedStaffId(undefined);
                          } else {
                            // ID único y determinista: siempre el patrón computado por nombre.
                            // No depende de goStaffRecords → mismo valor en tap 1 y tap 2.
                            const norm = pro.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
                            const staffId = proveedor?.businessId
                              ? `${proveedor.businessId}_staff_${norm}`
                              : undefined;
                            console.log("[TAP_PROFESIONAL]", { nombre: pro.name, staffId: staffId ?? "(sin businessId)" });
                            setSelectedProfessional(i);
                            setLockedStaffId(staffId);
                          }
                          resetFromPro();
                          if (!active) {
                            setTimeout(() => scrollRef.current?.scrollTo({ y: paso3Y.current - 16, animated: true }), 280);
                          }
                        }}
                        activeOpacity={0.82}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 12,
                          backgroundColor: active ? "#141414" : "#0E0E0E",
                          borderRadius: 16, padding: 14,
                          borderWidth: 1.5,
                          borderColor: active ? color : "rgba(255,255,255,0.09)",
                          shadowColor: active ? color : "#000",
                          shadowOpacity: active ? 0.14 : 0.04,
                          shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
                          elevation: active ? 4 : 1,
                        }}
                      >
                        <View style={{
                          width: 42, height: 42, borderRadius: 21,
                          backgroundColor: active ? color + "18" : "rgba(255,255,255,0.06)",
                          borderWidth: 1.5,
                          borderColor: active ? color : "transparent",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <Text style={{ fontSize: 20 }}>{pro.emoji}</Text>
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 10, color: active ? color + "cc" : "rgba(255,255,255,0.38)", fontWeight: "700", letterSpacing: 0.5, marginBottom: 2 }}>
                            {stationInfo.emoji} {stationInfo.label} {i + 1}
                          </Text>
                          <Text style={{ fontSize: 14, fontWeight: "800", color: active ? color : "#FFFFFF" }}>
                            {pro.name}
                          </Text>
                          {pro.services.length > 0 && (
                            <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }} numberOfLines={1}>
                              {pro.services.slice(0, 3).join(" · ")}
                            </Text>
                          )}
                        </View>

                        {active ? (
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: color, alignItems: "center", justifyContent: "center" }}>
                            <Feather name="check" size={13} color="#fff" />
                          </View>
                        ) : (
                          <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
                        )}
                      </TouchableOpacity>
                    );
                  })}

                  {/* Indistinto */}
                  {(() => {
                    const active = selectedProfessional === -1;
                    return (
                      <TouchableOpacity
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                          setSelectedProfessional(active ? null : -1);
                          setLockedStaffId(undefined); // "cualquiera" no tiene ID fijo
                          resetFromPro();
                        }}
                        activeOpacity={0.82}
                        style={{
                          flexDirection: "row", alignItems: "center", gap: 12,
                          backgroundColor: "#0E0E0E",
                          borderRadius: 16, padding: 14,
                          borderWidth: 1.5,
                          borderColor: active ? "#6B7280" : "rgba(255,255,255,0.09)",
                          shadowColor: "#000",
                          shadowOpacity: active ? 0.08 : 0.04,
                          shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
                          elevation: active ? 4 : 1,
                        }}
                      >
                        <View style={{
                          width: 42, height: 42, borderRadius: 21,
                          backgroundColor: active ? "rgba(107,114,128,0.12)" : "rgba(255,255,255,0.06)",
                          borderWidth: 1.5,
                          borderColor: active ? "#6B7280" : "transparent",
                          alignItems: "center", justifyContent: "center",
                        }}>
                          <Feather name="shuffle" size={18} color={active ? "#6B7280" : "rgba(255,255,255,0.38)"} />
                        </View>

                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 14, fontWeight: "800", color: active ? "#FFFFFF" : "#6B7280" }}>
                            Sin preferencia
                          </Text>
                          <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.38)", marginTop: 2 }}>
                            Cualquier profesional del servicio
                          </Text>
                        </View>

                        {active ? (
                          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: "#6B7280", alignItems: "center", justifyContent: "center" }}>
                            <Feather name="check" size={13} color="#fff" />
                          </View>
                        ) : (
                          <Feather name="chevron-right" size={16} color="rgba(255,255,255,0.25)" />
                        )}
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              )}
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              PASO 3 · FECHA — visible tras elegir servicio Y profesional
              ══════════════════════════════════════════════════════════════ */}
          {serviceChosen && proChosen && (
            <>
              <View onLayout={(e) => { paso3Y.current = e.nativeEvent.layout.y; }} style={{ marginHorizontal: 16, marginBottom: 10 }}>
                <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: "rgba(255,255,255,0.38)", letterSpacing: 1.4 }}>
                  3 · FECHA
                </Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                style={{ marginBottom: 20 }}
              >
                {days.map((d, i) => {
                  const active  = selectedDay === i;
                  const dayInfo = dayInfos[i];
                  const closed  = dayInfo ? !dayInfo.open : false;
                  return (
                    <TouchableOpacity
                      key={i}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        setSelectedDay(i);
                        setSelectedSlot(null);
                      }}
                      activeOpacity={0.82}
                      style={{
                        width: 60, alignItems: "center", paddingVertical: 12,
                        backgroundColor: active ? (closed ? "#2A1A1A" : color) : "#1A1A1A",
                        borderRadius: 18,
                        borderWidth: 1.5,
                        borderColor: active
                          ? (closed ? "rgba(255,80,80,0.45)" : color)
                          : (closed ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.09)"),
                        shadowColor: active ? color : "#000",
                        shadowOpacity: active ? 0.18 : 0.04,
                        shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                        elevation: active ? 4 : 1,
                        opacity: closed ? 0.55 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 10, fontWeight: "700", color: active ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.38)", marginBottom: 4 }}>
                        {d.label}
                      </Text>
                      <Text style={{ fontSize: 20, fontWeight: "900", color: active ? "#fff" : "rgba(255,255,255,0.65)" }}>
                        {d.num}
                      </Text>
                      {closed ? (
                        <Text style={{ fontSize: 8, fontWeight: "800", color: active ? "rgba(255,100,100,0.85)" : "rgba(255,80,80,0.50)", marginTop: 3, letterSpacing: 0.3 }}>
                          CERRADO
                        </Text>
                      ) : (
                        <Text style={{ fontSize: 9, color: active ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.38)", marginTop: 2 }}>
                          {d.month}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* ── HORA DISPONIBLE ── */}
              <View style={{ marginHorizontal: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: "rgba(255,255,255,0.38)", letterSpacing: 1.4 }}>
                    HORA DISPONIBLE
                  </Text>
                  {/* Badge profesional activo */}
                  {confirmedProObj && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: color + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1, borderColor: color + "30" }}>
                      <Text style={{ fontSize: 11, fontWeight: "700", color }}>{confirmedProObj.name}</Text>
                    </View>
                  )}
                  {selectedProfessional === -1 && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(107,114,128,0.10)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(107,114,128,0.20)" }}>
                      <Feather name="shuffle" size={9} color="rgba(255,255,255,0.55)" />
                      <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.50)", letterSpacing: 0.3 }}>Sin preferencia</Text>
                    </View>
                  )}
                  {selectedServiceTitle ? (
                    <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "rgba(255,255,255,0.12)" }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: "rgba(255,255,255,0.50)", letterSpacing: 0.3 }}>{selectedServiceTitle}</Text>
                    </View>
                  ) : null}
                  {clientBusy.length > 0 && !loadingSlots && (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#4A80BD12", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: "#4A80BD28" }}>
                      <Feather name="calendar" size={9} color="#4A80BD" />
                      <Text style={{ fontSize: 9, fontWeight: "700", color: "#4A80BD", letterSpacing: 0.3 }}>Tu agenda</Text>
                    </View>
                  )}
                </View>

                {/* Día cerrado según horario del negocio/profesional */}
                {!loadingSlots && !(dayInfos[selectedDay]?.open ?? true) && (
                  <View style={{ alignItems: "center", paddingVertical: 28 }}>
                    <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,80,80,0.08)", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
                      <Feather name="moon" size={22} color="rgba(255,100,100,0.55)" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.65)", marginBottom: 4 }}>{t("biz_closed_today_label")}</Text>
                    <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.32)", textAlign: "center" }}>{t("biz_pick_another_day")}</Text>
                  </View>
                )}

                {/* Cargando — motor de slots o verificación de ocupación en curso */}
                {(loadingSlots || loadingOccupied) && (
                  <View style={{ alignItems: "center", paddingVertical: 32 }}>
                    <ActivityIndicator size="small" color={color} />
                    <Text style={{ marginTop: 10, fontSize: 12, color: "rgba(255,255,255,0.38)" }}>
                      {loadingOccupied ? t("biz_verifying_availability") : t("biz_searching_availability")}
                    </Text>
                  </View>
                )}

                {/* Sin slots disponibles */}
                {!loadingSlots && !loadingOccupied && (dayInfos[selectedDay]?.open ?? true) && availableSlots.length === 0 && service !== null && selectedProfessional !== null && (
                  <View style={{ alignItems: "center", paddingVertical: 24 }}>
                    <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.06)", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                      <Feather name="calendar" size={24} color="rgba(255,255,255,0.38)" />
                    </View>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: "rgba(255,255,255,0.75)", marginBottom: 4 }}>{t("biz_no_availability_day")}</Text>
                    <Text style={{ fontSize: 12, color: "rgba(255,255,255,0.38)", textAlign: "center" }}>{t("biz_try_another_day")}</Text>
                  </View>
                )}

                {/* Grid de slots — solo visible cuando AMBOS loaders han terminado */}
                {!loadingSlots && !loadingOccupied && displaySlots.length > 0 && (
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                    {displaySlots.map((slot) => {
                      const isSelected = selectedSlot === slot.time;
                      return (
                        <TouchableOpacity
                          key={slot.time}
                          disabled={!slot.available}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            setSelectedSlot(slot.time);
                            setAlreadyTakenError(false);
                          }}
                          activeOpacity={0.82}
                          style={{
                            paddingHorizontal: 14, paddingVertical: 10,
                            borderRadius: 14, borderWidth: 1.5,
                            backgroundColor: !slot.available ? "rgba(0,0,0,0.03)" : isSelected ? color : "#1A1A1A",
                            borderColor: !slot.available ? "rgba(255,255,255,0.06)" : isSelected ? color : "rgba(255,255,255,0.12)",
                            opacity: !slot.available ? 0.35 : 1,
                            shadowColor: color,
                            shadowOpacity: isSelected ? 0.22 : 0,
                            shadowRadius: 8, shadowOffset: { width: 0, height: 2 },
                            elevation: isSelected ? 4 : 0,
                          }}
                        >
                          <Text style={{
                            fontSize: 13, fontWeight: "700",
                            color: !slot.available ? "rgba(255,255,255,0.25)" : isSelected ? "#fff" : "rgba(255,255,255,0.85)",
                          }}>
                            {slot.time}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </>
          )}

        </ScrollView>

        {/* ── Botón de confirmación flotante ── */}
        <View style={{
          position: "absolute", bottom: 0, left: 0, right: 0,
          backgroundColor: "#0E0E0E",
          borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.09)",
          paddingHorizontal: 20,
          paddingTop: 14,
          paddingBottom: insets.bottom + 12,
          shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 12, elevation: 8,
          gap: 10,
        }}>
          {/* ── Resumen pre-confirmación (solo cuando todo elegido) ── */}
          {allChosen && (
            <View style={{
              flexDirection: "row", alignItems: "center", flexWrap: "wrap",
              gap: 6, paddingHorizontal: 2,
            }}>
              {/* Servicio */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: color + "12", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: color + "28" }}>
                <Feather name={proveedor.subIcon as any} size={10} color={color} />
                <Text style={{ fontSize: 11, fontWeight: "700", color }} numberOfLines={1}>{service?.title}</Text>
              </View>
              {/* Profesional */}
              {proLabel && (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" }}>
                  <Feather name="user" size={10} color="rgba(255,255,255,0.65)" />
                  <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.80)" }} numberOfLines={1}>{proLabel}</Text>
                </View>
              )}
              {/* Fecha + hora */}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "rgba(255,255,255,0.07)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: "rgba(255,255,255,0.13)" }}>
                <Feather name="clock" size={10} color="rgba(255,255,255,0.65)" />
                <Text style={{ fontSize: 11, fontWeight: "700", color: "rgba(255,255,255,0.80)" }}>
                  {days[selectedDay].isToday ? t("status_today") : days[selectedDay].fullLabel}  ·  {selectedSlot}
                </Text>
              </View>
            </View>
          )}
          {/* Error: hora ya ocupada — claimSlot rechazó la escritura */}
          {alreadyTakenError && (
            <View style={{
              flexDirection: "row", alignItems: "center", gap: 8,
              backgroundColor: "rgba(255,60,60,0.10)",
              borderWidth: 1, borderColor: "rgba(255,60,60,0.30)",
              borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
            }}>
              <Feather name="alert-circle" size={15} color="#FF5050" />
              <Text style={{ color: "#FF5050", fontWeight: "700", fontSize: 13, flex: 1 }}>
                {conflictReason === "client"
                  ? t("biz_conflict_client_time")
                  : t("biz_conflict_professional_time")}
              </Text>
            </View>
          )}
          {allChosen ? (
            <TouchableOpacity
              activeOpacity={0.88}
              disabled={saving}
              onPress={async () => {
                console.log("[ENTER_FUNCTION] GoProveedorReservaSheet → Confirmar button pressed", {
                  hasService: !!service,
                  businessId: proveedor?.businessId ?? "(missing)",
                  selectedDay,
                  selectedSlot,
                  selectedProfessional,
                  lockedStaffId,
                  allChosen,
                });
                setSaving(true);
                setAlreadyTakenError(false);
                setConflictReason(null);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});

                // claimSlot hace READ→CHECK→WRITE en una sola operación atómica.
                // Si el slot está ocupado, no escribe nada y devuelve alreadyTaken=true.
                const result = await saveBooking();
                setSaving(false);

                if (result.alreadyTaken) {
                  setAlreadyTakenError(true);
                  // Forzar recálculo de occupiedSlotTimes para reflejar el estado real
                  setAvailableSlots(prev => [...prev]);
                  return;
                }
                if (result.saved) setConfirmed(true);
              }}
              style={{
                backgroundColor: color,
                borderRadius: 18, paddingVertical: 16,
                alignItems: "center", justifyContent: "center",
                flexDirection: "row", gap: 10,
                shadowColor: color, shadowOpacity: 0.32, shadowRadius: 14, elevation: 6,
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving
                ? <ActivityIndicator size="small" color="#fff" />
                : <Feather name="check-circle" size={18} color="#fff" />
              }
              <Text style={{ color: "#fff", fontFamily: "Inter_900Black", fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
                {saving ? t("biz_saving_booking") : t("biz_confirm_booking_btn")}
              </Text>
            </TouchableOpacity>
          ) : (
            <View style={{ backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 18, paddingVertical: 16, alignItems: "center" }}>
              <Text style={{ color: "rgba(255,255,255,0.38)", fontWeight: "700", fontSize: 13 }}>
                {!serviceChosen
                  ? t("biz_choose_service_hint")
                  : !proChosen
                  ? t("biz_choose_professional_hint")
                  : t("biz_select_time_hint")}
              </Text>
            </View>
          )}
        </View>

        {/* ── Guía gestual ── */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleClose}
          style={{ position: "absolute", right: 0, top: "25%", bottom: 100, width: "22%" }}
        >
          <LinearGradient
            colors={["transparent", "rgba(255,255,255,0.06)"]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{ flex: 1 }}
          />
        </TouchableOpacity>

        {/* ── Botones de navegación flotantes ── */}
        <View style={{
          position: "absolute", right: 20, bottom: insets.bottom + 100,
          flexDirection: "column", alignItems: "center", gap: 8, zIndex: 200,
        }}>
          <TouchableOpacity onPress={handleClose} activeOpacity={0.75} style={navBtnStyle}>
            <Feather name="chevron-down" size={20} color="rgba(255,255,255,0.60)" />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} activeOpacity={0.75} style={navBtnStyle}>
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={12} color="rgba(255,255,255,0.60)" />
              <Feather name="chevron-down" size={12} color="rgba(255,255,255,0.60)" style={{ marginTop: -4 }} />
            </View>
          </TouchableOpacity>
        </View>

      </View>
      )}
    </Modal>
  );
}

// ── Componente auxiliar para filas de detalles ────────────────────────────────
function DetailRow({
  icon, label, value, color, badge, last,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
  color: string;
  badge?: string;
  last: boolean;
}) {
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 }}>
        <View style={{
          width: 32, height: 32, borderRadius: 16,
          backgroundColor: color + "14", alignItems: "center", justifyContent: "center",
        }}>
          <Feather name={icon} size={15} color={color} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: "rgba(255,255,255,0.38)", letterSpacing: 0.8 }}>{label}</Text>
          <Text style={{ fontSize: 14, fontWeight: "700", color: "#FFFFFF", marginTop: 2 }}>{value}</Text>
        </View>
        {badge && (
          <View style={{ backgroundColor: color + "14", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "700", color }}>{badge}</Text>
          </View>
        )}
      </View>
      {!last && <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.08)" }} />}
    </>
  );
}

// ── Shared nav button style ────────────────────────────────────────────────────
const navBtnStyle = {
  width: 36, height: 36, borderRadius: 10,
  backgroundColor: "#0E0E0E", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.14)" as const,
  alignItems: "center" as const, justifyContent: "center" as const,
  shadowColor: "#000", shadowOpacity: 0.10, shadowRadius: 8, elevation: 4,
} as const;
