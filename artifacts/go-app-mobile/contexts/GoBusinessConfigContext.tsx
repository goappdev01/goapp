/**
 * GoBusinessConfigContext
 * ═══════════════════════════════════════════════════════════════════════════
 * ÚNICA FUENTE DE VERDAD para toda la configuración del negocio en GO.
 *
 * Un solo key de AsyncStorage: go_business_config_v1
 * Un solo estado en memoria compartido por todos los módulos.
 * Cualquier cambio desde cualquier pantalla se refleja inmediatamente en todas.
 *
 * Sincronización estructural con go_businesses_v1 (booking system):
 * La empresa verificada seleccionada conserva su ID de Supabase. La
 * activación pública se escribe solo tras sincronizar catálogo y horarios.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { Alert, AppState } from "react-native";
import { onSessionChanged } from "@/lib/sessionEvents";
import { loadSynchronizedBusinessConfig } from "@/data/synchronizedBusinessConfig";
import { useBusinessAccess } from "./GoBusinessAccessContext";
import { useGoView } from "./GoViewContext";
import { useAdminAccess } from "./GoAdminAccessContext";
import type { BusinessDemoStore } from "@/data/businessDemoStore";
import { BUSINESS_WORK_HOURS_PREFERENCE, businessWorkHoursKey } from "@/data/businessCalendarWorkHours";
import { useOwnerBusinessDemo } from "./OwnerBusinessDemoContext";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { serializeServiceConfiguration, isServiceTimingPending, validateBookingResources, validateBusinessTimezone, validateScheduleRange,
  type BookingGapPolicy, type BookingResource, type BookingBlock, type ServiceTiming } from "@/data/serviceTiming";
import {
  initPlantillaItems,
  SECTORS,
  SUGGESTED_SERVICES,
  type PlantillaItem,
} from "@/data/goSectorData";
import {
  createAvailabilityWindow,
  createBookableItem,
  deleteAvailabilityWindow,
  deleteBookableItem,
  getOwnedAvailabilityWindows as getAvailabilityWindows,
  getOwnedBookableItems as getBookableItems,
  getOwnedBusinesses as getBusinesses,
  saveAvailabilityWindow,
  saveBookableItem,
  saveBusiness,
  getOwnedStaff as getStaff,
  getAuthenticatedUserId,
  getCloudConfiguration,
  saveCloudConfiguration,
  isCloudId,
  saveStaff,
  deleteStaff,
  type CancellationPolicy,
  type Business,
  type Staff,
} from "@/data/booking";

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const BUSINESS_CONFIG_KEY    = "go_business_config_v1";
const LEGACY_SETUP_KEY      = "go_empresa_setup_v2";
const LEGACY_PLANTILLA_KEY  = "go_plantilla_items_v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SavedService = {
  description?: string;
  name:      string;
  duration:  number;
  price:     number;
  capacity?: number;
  timing?: ServiceTiming;
};

export type DayShift = { from: string; to: string; active: boolean };
export type DaySchedule = { shift1: DayShift; shift2: DayShift };

export type StaffScheduleConfig = {
  gapPolicy?: BookingGapPolicy;
  useCompanySchedule: boolean;
  daySchedules: Record<string, DaySchedule>; // keyed "0"=Mon…"6"=Sun
};

export type PaymentMethodId = "card" | "bank" | "stripe" | "tpv" | "other";

export type BusinessConfig = {
  catalogProducts?: import("@/data/booking").BookableItem[];
  catalogAssociations?: import("@/data/catalogAssociations").CatalogAssociation[];
  businessName:     string;
  address:          string;
  cartaUrl:         string;
  sectorId:         string | null;
  subId:            string | null;
  plantillaItems:   PlantillaItem[];
  activeDays:       number[];
  openFrom:         string;
  openTo:           string;
  daySchedules:     Record<string, DaySchedule>;
  services:         SavedService[];
  paymentPolicy:    number;
  approvalPolicy:   number;
  cancelPolicy:     number;
  bookingEnabled:   boolean;
  completedSteps:   number[];
  paymentMethod:    PaymentMethodId | null;
  isBusinessActive: boolean;
  businessId?:      string; // ID del registro vinculado en go_businesses_v1
  countryCode?:     string;
  mobile?:          string;
  coordinates?:     { latitude: number; longitude: number };
  phoneE164?:       string;
  mobileE164?:      string;
  whatsappE164?:    string;
  phone?:           string; // Teléfono fijo de contacto
  whatsapp?:        string; // Número WhatsApp de contacto
  staffSchedules?:  Record<string, StaffScheduleConfig>; // keyed by stable staff ID
  timezone?: string; // Explicit IANA zone; an existing business keeps its server zone.
  bookingResources?: BookingResource[];
  bookingBlocks?: BookingBlock[];
};

export const DEFAULT_BUSINESS_CONFIG: BusinessConfig = {
  businessName:     "",
  address:          "",
  cartaUrl:         "",
  sectorId:         null,
  subId:            null,
  plantillaItems:   [],
  activeDays:       [0, 1, 2, 3, 4],
  openFrom:         "09:00",
  openTo:           "20:00",
  daySchedules:     {},
  services:         [],
  paymentPolicy:    0,
  approvalPolicy:   0,
  cancelPolicy:     0,
  bookingEnabled:   false,
  completedSteps:   [],
  paymentMethod:    null,
  isBusinessActive: false,
  businessId:       undefined,
  phone:            undefined,
  whatsapp:         undefined,
  staffSchedules:   {},
};

// ─── Context ──────────────────────────────────────────────────────────────────

export type CalendarWorkHoursPreference = {
  value: boolean;
  ready: boolean;
  setValue: (value: boolean) => void;
};

type GoBusinessConfigContextType = {
  demo?: BusinessDemoStore;
  calendarWorkHours?: CalendarWorkHoursPreference;
  config:             BusinessConfig;
  loaded:             boolean;
  loadError?:         string;
  reloadConfig?:      () => void;
  updateConfig:       (patch: Partial<BusinessConfig>, expectedBusinessId?: string) => void;
  resetToSubActivity: (sectorId: string, subId: string) => void;
  resetConfig:        () => Promise<void>;
};

const GoBusinessConfigContext = createContext<GoBusinessConfigContextType>({
  config:             DEFAULT_BUSINESS_CONFIG,
  loaded:             false,
  updateConfig:       () => {},
  resetToSubActivity: () => {},
  resetConfig:        async () => {},
});

// This display preference uses the existing device storage, never updateConfig's booking sync.
function useCalendarWorkHoursPreference(
  scope: string | undefined,
  storage: Pick<typeof AsyncStorage, "getItem" | "setItem">,
  key = scope,
): CalendarWorkHoursPreference {
  const [stored, setStored] = useState<{ scope: string; value: boolean }>();
  const currentScope = useRef(scope);
  currentScope.current = scope;
  const revision = useRef(0);
  useEffect(() => {
    if (!scope || !key) return;
    let active = true;
    void storage.getItem(key).then(raw => {
      if (active) setStored({ scope, value: raw !== "false" });
    }).catch(() => { /* Keep the default without overwriting an unread preference. */ });
    return () => { active = false; };
  }, [scope, storage, key]);
  const ready = !!scope && stored?.scope === scope;
  const setValue = (value: boolean) => {
    if (!ready || !scope || !key || currentScope.current !== scope) return;
    const edit = ++revision.current;
    setStored({ scope, value });
    void storage.setItem(key, String(value)).catch(async () => {
      if (currentScope.current !== scope || revision.current !== edit) return;
      const raw = await storage.getItem(key).catch(() => null);
      if (currentScope.current !== scope || revision.current !== edit) return;
      setStored({ scope, value: raw !== "false" });
      Alert.alert("Calendario", "No se pudo guardar la preferencia de visualización.");
    });
  };
  return { ready, value: ready ? stored!.value : true, setValue };
}

/** Functional local DEMO, available only inside the currently authorized owner context. */
export function GoBusinessPreviewProvider({ children }: { children: React.ReactNode }) {
  const { isBusinessPreview } = useGoView();
  const admin = useAdminAccess();
  const { demo, loaded, config } = useOwnerBusinessDemo();
  const calendarWorkHours = useCalendarWorkHoursPreference(demo?.businessId, demo?.preferences ?? AsyncStorage, BUSINESS_WORK_HOURS_PREFERENCE);
  const report = useCallback((operation: Promise<void>) => {
    void operation.catch(error => Alert.alert("Empresa", String(error)));
  }, []);
  const updateConfig = useCallback((patch: Partial<BusinessConfig>) => { if (demo) report(demo.updateConfig(patch)); }, [demo, report]);
  const resetToSubActivity = useCallback((sectorId: string, subId: string) => {
    if (!demo) return;
    report(demo.transformConfig(prev => {
      const changed = prev.subId !== subId;
      return { ...prev, sectorId, subId,
        plantillaItems: changed || prev.plantillaItems.length === 0 ? initPlantillaItems(subId) : prev.plantillaItems,
        services: changed || prev.services.length === 0 ? (SUGGESTED_SERVICES[subId] ?? []).map(service => ({
          name: service.name, duration: service.duration, price: service.price,
        })) : prev.services,
      };
    }));
  }, [demo, report]);
  const resetConfig = useCallback(async () => { if (demo) await demo.reset(); }, [demo]);
  if (!isBusinessPreview || !admin.isOwner || admin.checking || !demo || !loaded || !config) return null;
  return <GoBusinessConfigContext.Provider value={{
    config, loaded: true, updateConfig, resetToSubActivity, resetConfig, demo, calendarWorkHours,
  }}>{children}</GoBusinessConfigContext.Provider>;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fromTimeStr(s: string): { hour: number; minute: number } {
  const [h, m] = (s || "09:00").split(":").map(Number);
  return { hour: isNaN(h) ? 9 : h, minute: isNaN(m) ? 0 : m };
}

// ── Migración de DaySchedule ──────────────────────────────────────────────────
// Convierte el formato anterior { from, to } al nuevo { shift1, shift2 }.
// Aplicado en la carga inicial para garantizar compatibilidad.
function migrateDayScheduleEntry(raw: any): DaySchedule {
  if (!raw) return {
    shift1: { from: "09:00", to: "18:00", active: true },
    shift2: { from: "16:00", to: "20:00", active: false },
  };
  if ("shift1" in raw) return raw as DaySchedule;
  return {
    shift1: { from: raw.from ?? "09:00", to: raw.to ?? "18:00", active: true },
    shift2: { from: "16:00", to: "20:00", active: false },
  };
}

function migrateDaySchedules(raw: Record<string, any>): Record<string, DaySchedule> {
  const out: Record<string, DaySchedule> = {};
  for (const [k, v] of Object.entries(raw ?? {})) out[k] = migrateDayScheduleEntry(v);
  return out;
}

/**
 * Sanitiza los plantillaItems para eliminar profesionales inválidos:
 *   - nombres de 0-2 caracteres (parciales de tipado: "I", "Is")
 *   - valores que no son strings (protección ante JSON malformado)
 *   - duplicados por nombre normalizado
 *
 * Actualiza `count` para que coincida con el array limpio.
 * Elimina también las claves huérfanas de staffSchedules que ya no tienen
 * un profesional válido en plantillaItems.
 *
 * Regla: un nombre es válido si y solo si tiene >= 3 caracteres tras trim().
 */
function sanitizePlantillaItems(
  items: PlantillaItem[],
  businessId?: string,
  staffSchedules?: Record<string, StaffScheduleConfig>,
): {
  plantillaItems: PlantillaItem[];
  staffSchedules: Record<string, StaffScheduleConfig>;
} {
  // Dedup por nombre normalizado a través de TODOS los items
  const seenNormalized = new Set<string>();

  const cleanItems = items.map(item => {
    // Guard: staffNames debe ser siempre un array de strings
    const rawNames: unknown[] = Array.isArray(item.staffNames) ? item.staffNames : [];
    const rawServices: string[][] = Array.isArray(item.staffServices) ? item.staffServices : [];

    // Índices con nombres válidos (>= 3 chars tras trim, no duplicados)
    const validIdx: number[] = [];
    rawNames.forEach((n, i) => {
      if (typeof n !== "string") return;
      const trimmed = n.trim();
      if (trimmed.length < 3) return;
      const norm = trimmed.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (seenNormalized.has(norm)) return;
      seenNormalized.add(norm);
      validIdx.push(i);
    });

    // Sin cambios necesarios
    if (validIdx.length === rawNames.length && rawNames.length > 0) return item;

    if (validIdx.length === 0) {
      // Todos los nombres eran inválidos — resetear a slot vacío
      return { ...item, count: 1, staffNames: [""], staffServices: [[]] };
    }

    const cleanNames    = validIdx.map(i => (rawNames[i] as string).trim());
    const cleanServices = validIdx.map(i => rawServices[i] ?? []);
    return { ...item, count: cleanNames.length, staffNames: cleanNames, staffServices: cleanServices };
  });

  // Eliminar claves huérfanas de staffSchedules (staff con IDs que ya no existen)
  const validStableIds = new Set<string>(
    cleanItems.flatMap(item =>
      (item.staffNames ?? []).flatMap(n => {
        const t = n?.trim();
        if (!t || t.length < 2 || !businessId) return [];
        return [`${businessId}_staff_${t.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}`];
      })
    )
  );
  const cleanSchedules: Record<string, StaffScheduleConfig> = {};
  for (const [k, v] of Object.entries(staffSchedules ?? {})) {
    if (isCloudId(k) || validStableIds.size === 0 || validStableIds.has(k)) cleanSchedules[k] = v;
  }

  return { plantillaItems: cleanItems, staffSchedules: cleanSchedules };
}

/**
 * Deriva la CancellationPolicy del negocio desde la configuración.
 * Regla: si no hay método de pago configurado → sin política (sin cobro por adelantado).
 * Si hay método de pago → la política depende de cancelPolicy:
 *   0 = Flexible (cancelación siempre gratuita)
 *   1 = Moderada (gratuita hasta 24h antes)
 *   2 = Estricta (sin reembolso)
 */
function deriveCancellationPolicy(cfg: BusinessConfig): CancellationPolicy | undefined {
  if (!cfg.paymentMethod) return undefined;
  if (cfg.cancelPolicy === 2) {
    return { paymentRequired: true, refundType: "none", freeUntilHours: 0, autoRefund: false };
  }
  if (cfg.cancelPolicy === 1) {
    return { paymentRequired: true, refundType: "full", freeUntilHours: 24, autoRefund: false };
  }
  // Default: cancelPolicy 0 → free cancellation
  return { paymentRequired: true, refundType: "free", freeUntilHours: 0, autoRefund: true };
}

// ─── Booking sync helper ───────────────────────────────────────────────────────
//
// Verifica el registro empresarial ya vinculado al config,
// siembra go_bookable_items_v1 con TODOS los servicios del config (dedup por
// título — no borra ítems existentes, solo añade los que faltan), y siembra
// go_availability_windows_v1 desde activeDays/openFrom/openTo si está vacío.
//
// Se ejecuta en cada arranque de la app (prevSigRef resetea a "" en cada mount).
// Devuelve el businessId verificado; nunca crea otro registro durante el guardado.

async function ensureBookingRecord(cfg: BusinessConfig, onResolved: (id: string) => Promise<void>, userId: string, selectedBusinessId: string): Promise<string | null> {
  if (!isCloudId(selectedBusinessId) || cfg.businessId !== selectedBusinessId) {
    throw new Error("La empresa seleccionada ha cambiado. Vuelve a cargar la configuración.");
  }
  const name = cfg.businessName?.trim();
  if (!name) return selectedBusinessId;
  const bookingResources = cfg.bookingResources === undefined ? undefined : validateBookingResources(cfg.bookingResources);
  const services = serializeServiceConfiguration(cfg.services, { resources: bookingResources ?? [] });
  // Validate before any remote write; an earlier closing time explicitly means next day.
  for (const day of cfg.activeDays) {
    const schedule = migrateDayScheduleEntry(cfg.daySchedules?.[String(day)] ?? { from: cfg.openFrom, to: cfg.openTo });
    for (const shift of [schedule.shift1, schedule.shift2]) if (shift?.active) validateScheduleRange(shift.from, shift.to);
  }
  for (const schedule of Object.values(cfg.staffSchedules ?? {})) if (!schedule.useCompanySchedule) {
    for (const day of Object.values(schedule.daySchedules ?? {}))
      for (const shift of [day.shift1, day.shift2]) if (shift?.active) validateScheduleRange(shift.from, shift.to);
  }

  const category = cfg.subId ?? cfg.sectorId ?? "";
  const location = cfg.address?.trim() ?? "";
  const sectorColor =
    SECTORS.find((s) => s.id === cfg.sectorId)?.color ?? "#3B82F6";

  const resolvedId = selectedBusinessId;
  let activateAfterSync: Business | null = null;

  const cancellationPolicy = deriveCancellationPolicy(cfg);

  {
    const all = await getBusinesses(userId);
    const existing = all.find((b) => b.id === selectedBusinessId);
    if (existing) {
      const updated: Business = {
        ...existing,
        name,
        category,
        location,
        bookingColor: sectorColor,
        // Deactivate immediately; publish an activation only after the full
        // catalogue, staff and hours have synchronized successfully.
        bookingActive: cfg.bookingEnabled === false ? false : existing.bookingActive,
        cancellationPolicy,
        phone:    cfg.phone    ?? existing.phone ?? "",
        whatsapp: cfg.whatsapp ?? existing.whatsapp,
        timezone: cfg.timezone ? validateBusinessTimezone(cfg.timezone) : existing.timezone,
        bookingResources: bookingResources ?? existing.bookingResources,
        bookingBlocks: cfg.bookingBlocks ?? existing.bookingBlocks,
      };
      await saveBusiness(updated);
      if (cfg.bookingEnabled === true && !existing.bookingActive) activateAfterSync = updated;
    } else {
      throw new Error("El negocio configurado no pertenece a esta cuenta. Vuelve a cargar la configuración.");
    }
  }

  await onResolved(resolvedId);

  // ── Sincronizar BookableItems — reemplazo completo por título ──────────────
  // Operación full-replace: la lista config.services es la fuente de verdad.
  //   • Ítems eliminados del config → se borran de go_bookable_items_v1.
  //   • Ítems modificados (precio/duración/capacidad) → se actualizan.
  //   • Ítems nuevos → se crean.
  // Nunca restaura ítems borrados por el usuario.
  {
    const existingItems  = await getBookableItems(resolvedId);
    const desiredTitles  = new Set(
      services.map((s) => s.name.toLowerCase().trim()).filter(Boolean)
    );

    // Delete items whose title is no longer in config.services — sequential to
    // avoid the read-modify-write race condition on go_bookable_items_v1.
    const toDeleteItems = existingItems.filter(
      (i) => i.catalogKind !== "product" && !desiredTitles.has(i.title.toLowerCase().trim())
    );
    for (const item of toDeleteItems) {
      await deleteBookableItem(item.id, resolvedId);
    }

    // Re-fetch after deletions to build an accurate title→item map
    const remainingItems = existingItems.filter(
      (i) => i.catalogKind !== "product" && desiredTitles.has(i.title.toLowerCase().trim())
    );
    const titleToItem = new Map(
      remainingItems.map((i) => [i.title.toLowerCase().trim(), i])
    );

    // Create missing items; update changed items — sequential to avoid
    // read-modify-write race: parallel calls on the same key each read the
    // same stale snapshot and the last write wipes earlier creates.
    for (const svc of services) {
      const key      = svc.name.toLowerCase().trim();
      const existing = titleToItem.get(key);
      const pendingTiming = isServiceTimingPending(svc.timing);
      // Full times are persisted in business_settings. A pending plan never
      // reaches the booking compiler and the catalogue entry remains inactive.
      const catalogueTiming = pendingTiming ? undefined : svc.timing;
      const catalogueMetadata = { ...existing?.catalogMetadata };
      if (pendingTiming) catalogueMetadata.timingConfigurationPending = true;
      else delete catalogueMetadata.timingConfigurationPending;
      const metadataPatch = pendingTiming || existing?.catalogMetadata?.timingConfigurationPending ? {catalogMetadata: catalogueMetadata} : {};
      if (existing) {
        const changed =
          existing.active !== !pendingTiming ||
          Boolean(existing.catalogMetadata?.timingConfigurationPending) !== pendingTiming ||
          existing.durationMinutes  !== svc.duration          ||
          existing.price            !== svc.price             ||
          existing.customerCapacity !== (svc.capacity ?? 1) ||
          JSON.stringify(existing.timing) !== JSON.stringify(catalogueTiming) || existing.description !== svc.description;
        if (changed) {
          await saveBookableItem({
            ...existing,
            active: !pendingTiming,
            ...metadataPatch,
            durationMinutes:  svc.duration,
            price:            svc.price,
            customerCapacity: svc.capacity ?? 1,
            timing: catalogueTiming,
            description: svc.description,
          });
        }
      } else {
        await createBookableItem({
          businessId:       resolvedId,
          title:            svc.name,
          type:             cfg.subId ?? cfg.sectorId ?? "",
          durationMinutes:  svc.duration,
          customerCapacity: svc.capacity ?? 1,
          unitQuantity:     1,
          price:            svc.price,
          paymentRequired:  false,
          active:           !pendingTiming,
          ...metadataPatch,
          visible:          true,
          timing:           catalogueTiming,
          description:      svc.description,
        });
      }
    }
  }

  // ── Sincronizar Staff desde plantillaItems → go_staff_v1 ────────────────────
  // Upsert completo: convierte plantillaItems (staffNames + staffServices) en
  // registros Staff con serviceIds reales (IDs de BookableItem por título).
  // Elimina staff que ya no existen en config. Sin esto, el paso PROFESIONAL
  // del flujo de reserva muestra lista vacía aunque el usuario haya configurado staff.
  {
    // Re-fetch items para incluir los recién creados arriba
    const allItems = (await getBookableItems(resolvedId)).filter(item => item.catalogKind !== "product");
    const titleToId = new Map(
      allItems.map((it) => [it.title.toLowerCase().trim(), it.id])
    );

    // CRÍTICO: leer staff existente ANTES de construir desiredStaff para poder
    // reusar IDs por nombre. Si no se reutiliza el ID existente, ensureBookingRecord
    // genera un ID nuevo → borra el viejo → las reservas ya creadas quedan huérfanas
    // con un staffId que ya no existe → el conflict-check las ignora → doble reserva.
    const existingStaff = await getStaff(resolvedId);
    const existingByNormName = new Map(
      existingStaff.map((s) => [
        s.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""),
        s,
      ])
    );

    // Construir staff deseado desde plantillaItems
    // Solo nombres VÁLIDOS (>= 3 chars): nunca se crean registros para parciales como "I", "Is".
    // Dedup por nombre normalizado para evitar registros duplicados.
    const seenStaffNorm = new Set<string>();
    const desiredStaff: Staff[] = [];
    for (const plantItem of cfg.plantillaItems ?? []) {
      const names         = Array.isArray(plantItem.staffNames)    ? plantItem.staffNames    : [];
      const servicesBySlot = Array.isArray(plantItem.staffServices) ? plantItem.staffServices : [];
      for (let i = 0; i < names.length; i++) {
        const name = names[i]?.trim();
        if (!name || name.length < 3) continue;
        const normName = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const selectedId = plantItem.staffIds?.[i];
        const selectedStaff = selectedId ? existingStaff.find(member => member.id === selectedId) : undefined;
        if (!selectedStaff && seenStaffNorm.has(normName)) continue;
        if (!selectedStaff) seenStaffNorm.add(normName);
        // Reusar ID existente por nombre normalizado para no huerfanar reservas.
        // Solo si no existe previo, calcular el stableId determinista.
        const existingMatch = selectedStaff ?? existingByNormName.get(normName);
        const stableId = existingMatch
          ? existingMatch.id
          : `${resolvedId}_staff_${name
              .toLowerCase()
              .replace(/\s+/g, "_")
              .replace(/[^a-z0-9_]/g, "")}`;
        const serviceNames: string[] = servicesBySlot[i] ?? [];
        const serviceIds = serviceNames
          .map((sn) => titleToId.get(sn.toLowerCase().trim()))
          .filter((id): id is string => !!id);
        desiredStaff.push({
          id:         stableId,
          businessId: resolvedId,
          name,
          emoji:      plantItem.emoji ?? "👤",
          serviceIds,
          bookingBlocks: existingMatch?.bookingBlocks,
          gapPolicy: (cfg.staffSchedules?.[stableId] ?? Object.entries(cfg.staffSchedules ?? {}).find(([key])=>key.endsWith(`_staff_${normName.replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"")}`))?.[1])?.gapPolicy ?? existingMatch?.gapPolicy,
          active:     existingMatch?.active ?? true,
        });
      }
    }

    // Upsert: guardar staff deseado + eliminar el que ya no existe en config.
    // Sequential to avoid the read-modify-write race on go_staff_v1: parallel
    // saveStaff calls each read the same snapshot → last write wins → earlier
    // serviceIds updates are silently lost.
    const desiredIds = new Set(desiredStaff.map((s) => s.id));
    for (const s of existingStaff.filter((s) => !desiredIds.has(s.id))) {
      await deleteStaff(s.id, resolvedId);
    }
    for (const s of desiredStaff) {
      await saveStaff(s);
    }
  }

  // ── Sincronizar AvailabilityWindows — 2 turnos + horarios de profesionales ──
  // Clave de ventana: "(staffId|weekday|shiftIndex)". Upsert completo.
  {
    const existingWindows = await getAvailabilityWindows(resolvedId);
    const winKey = (sId: string | undefined, wd: number, si: number) =>
      `${sId ?? ""}|${wd}|${si}`;
    const windowByKey = new Map(
      existingWindows.map((w) => [winKey(w.staffId, w.weekday, w.shiftIndex ?? 0), w])
    );

    // ── Ventanas de empresa (sin staffId) ────────────────────────────────────
    // Sequential to avoid the same read-modify-write race on go_availability_windows_v1.
    const desiredBizKeys = new Set<string>();
    for (const day of cfg.activeDays) {
      const jsWeekday = (day + 1) % 7;
      const rawSched = (cfg.daySchedules as any)?.[String(day)];
      const sched = migrateDayScheduleEntry(rawSched ?? { from: cfg.openFrom, to: cfg.openTo });
      const shifts: [number, DayShift][] = [[0, sched.shift1], [1, sched.shift2]];
      for (const [shiftIdx, shiftData] of shifts) {
        if (!shiftData?.active) continue;
        const key = winKey(undefined, jsWeekday, shiftIdx);
        desiredBizKeys.add(key);
        const { startHour: startH, startMinute: startM, endHour: endH, endMinute: endM, endNextDay } = validateScheduleRange(shiftData.from, shiftData.to);
        const existing = windowByKey.get(key);
        if (existing) {
          const changed =
            existing.visibleStartHour          !== startH ||
            (existing.visibleStartMinute ?? 0) !== startM ||
            existing.visibleEndHour            !== endH   ||
            (existing.visibleEndMinute ?? 0)   !== endM   ||
            (existing.endNextDay ?? false) !== endNextDay ||
            !existing.active;
          if (changed) {
            await saveAvailabilityWindow({
              ...existing,
              visibleStartHour: startH, visibleStartMinute: startM,
              visibleEndHour:   endH,   visibleEndMinute:   endM,
              endNextDay,
              active: true,
            });
          }
        } else {
          await createAvailabilityWindow({
            businessId: resolvedId, weekday: jsWeekday, shiftIndex: shiftIdx,
            visibleStartHour: startH, visibleStartMinute: startM,
            visibleEndHour:   endH,   visibleEndMinute:   endM,
            endNextDay,
            active: true,
          });
        }
      }
    }
    for (const w of existingWindows.filter((w) => !w.staffId && !desiredBizKeys.has(winKey(undefined, w.weekday, w.shiftIndex ?? 0)))) {
      await deleteAvailabilityWindow(w.id, resolvedId);
    }

    // ── Ventanas de profesionales (staffId) ──────────────────────────────────
    const staffSchedulesCfg = cfg.staffSchedules ?? {};
    // CRÍTICO: leer IDs REALES desde go_staff_v1 (recién sincronizado arriba).
    // Antes se calculaban por patrón de nombre ("biz_staff_name"), lo que diverge
    // del ID seedado ("st-isa"). Esa divergencia hace que:
    //   1. La limpieza de ventanas huérfanas (línea abajo) use la clave incorrecta
    //      → borra ventanas reales o no limpia las generadas con ID incorrecto.
    //   2. staffSchedulesCfg[stableId] nunca coincide → horarios personalizados ignorados.
    //   3. La UI fija lockedStaffId con el ID calculado mientras el booking real
    //      tiene el ID seedado → conflict-check los trata como dos personas distintas
    //      → doble reserva permitida.
    const freshStaffForWindows = await getStaff(resolvedId);
    const allStaffIds = new Set<string>(freshStaffForWindows.map(s => s.id));
    console.log("[ensureBookingRecord] allStaffIds reales (go_staff_v1) →", [...allStaffIds]);
    for (const stableId of allStaffIds) {
      const member = freshStaffForWindows.find(s => s.id === stableId);
      const suffix = member ? `_staff_${member.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "")}` : "";
      const legacyKey = suffix ? Object.keys(staffSchedulesCfg).find(k => k.endsWith(suffix)) : undefined;
      const schedCfg = staffSchedulesCfg[stableId] ?? (legacyKey ? staffSchedulesCfg[legacyKey] : undefined);
      if (!schedCfg || schedCfg.useCompanySchedule) {
        for (const w of existingWindows.filter((w) => w.staffId === stableId)) {
          await deleteAvailabilityWindow(w.id, resolvedId);
        }
      } else {
        const desiredStaffKeys = new Set<string>();
        for (const [dayStr, ds] of Object.entries(schedCfg.daySchedules ?? {})) {
          const day = parseInt(dayStr);
          const jsWeekday = (day + 1) % 7;
          const shifts: [number, DayShift][] = [[0, ds.shift1], [1, ds.shift2]];
          for (const [shiftIdx, shiftData] of shifts) {
            if (!shiftData?.active) continue;
            const key = winKey(stableId, jsWeekday, shiftIdx);
            desiredStaffKeys.add(key);
            const { startHour: startH, startMinute: startM, endHour: endH, endMinute: endM, endNextDay } = validateScheduleRange(shiftData.from, shiftData.to);
            const existing = windowByKey.get(key);
            if (existing) {
              const changed =
                existing.visibleStartHour          !== startH ||
                (existing.visibleStartMinute ?? 0) !== startM ||
                existing.visibleEndHour            !== endH   ||
                (existing.visibleEndMinute ?? 0)   !== endM   ||
                (existing.endNextDay ?? false) !== endNextDay ||
                !existing.active;
              if (changed) {
                await saveAvailabilityWindow({
                  ...existing,
                  visibleStartHour: startH, visibleStartMinute: startM,
                  visibleEndHour:   endH,   visibleEndMinute:   endM,
                  endNextDay,
                  active: true,
                });
              }
            } else {
              await createAvailabilityWindow({
                businessId: resolvedId, staffId: stableId, weekday: jsWeekday, shiftIndex: shiftIdx,
                visibleStartHour: startH, visibleStartMinute: startM,
                visibleEndHour:   endH,   visibleEndMinute:   endM,
                endNextDay,
                active: true,
              });
            }
          }
        }
        for (const w of existingWindows.filter((w) => w.staffId === stableId && !desiredStaffKeys.has(winKey(stableId, w.weekday, w.shiftIndex ?? 0)))) {
          await deleteAvailabilityWindow(w.id, resolvedId);
        }
      }
    }
    for (const w of existingWindows.filter((w) => w.staffId && !allStaffIds.has(w.staffId!))) {
      await deleteAvailabilityWindow(w.id, resolvedId);
    }
  }

  if (activateAfterSync) {
    if (await getAuthenticatedUserId() !== userId) throw new Error("La cuenta ha cambiado. Vuelve a cargar tu empresa.");
    await saveBusiness({ ...activateAfterSync, bookingActive: true });
  }
  return resolvedId;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GoBusinessConfigProvider({ children }: { children: React.ReactNode }) {
  const enterprise = useBusinessAccess();
  const permission = useRef(false);
  const [config, setConfig] = useState<BusinessConfig>(DEFAULT_BUSINESS_CONFIG);
  const [loaded, setLoaded]   = useState(false);
  const [loadedScope, setLoadedScope] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [sessionVersion, setSessionVersion] = useState(0);
  const selectedBusinessId = enterprise.snapshot?.business?.id;
  const selectedScope = `${enterprise.snapshot?.userId ?? ""}:${selectedBusinessId ?? ""}`;
  const ready = loaded && loadedScope === selectedScope;
  permission.current = enterprise.allowed && ready;
  const calendarAccount = enterprise.snapshot?.userId;
  const calendarBusiness = config.businessId;
  const calendarWorkHours = useCalendarWorkHoursPreference(
    enterprise.allowed && ready && calendarAccount && calendarBusiness
      ? businessWorkHoursKey(calendarAccount, calendarBusiness) : undefined,
    AsyncStorage,
  );
  const dirty = useRef(false);
  const revision = useRef(0);
  const configRef = useRef(config);
  configRef.current = config;
  const syncQueue = useRef(Promise.resolve());
  const generation = useRef(0);
  const storageKey = useRef(BUSINESS_CONFIG_KEY);
  useEffect(() => onSessionChanged(() => { generation.current++; dirty.current = false; setLoaded(false); setConfig({ ...DEFAULT_BUSINESS_CONFIG }); setSessionVersion(v => v + 1); }), []);

  // Firma de los campos que controlan la sincronización. Evita escrituras
  // redundantes cuando config cambia por motivos ajenos (servicios, pasos, etc.).
  const lastSyncSigRef = useRef<string>("");

  // ── Carga inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    const version = ++generation.current;
    dirty.current = false;
    setLoaded(false);
    setLoadError("");
    if (!enterprise.allowed) {
      setConfig({ ...DEFAULT_BUSINESS_CONFIG });
      setLoadedScope(selectedScope);
      setLoaded(true);
      return;
    }
    if (!selectedBusinessId) { setLoadError("No hay una empresa seleccionada en esta cuenta."); return; }
    void (async () => {
      try {
        const userId = await getAuthenticatedUserId();
        if (version !== generation.current) return;
        if (!userId || userId !== enterprise.snapshot?.userId) throw new Error("La cuenta ha cambiado. Vuelve a consultar tu empresa.");
        let cloud = await getCloudConfiguration<BusinessConfig>(selectedBusinessId, userId);
        const scopedKey = `${BUSINESS_CONFIG_KEY}:${userId}:${selectedBusinessId}`;
        if (!cloud) {
          const raw = await AsyncStorage.getItem(scopedKey) ?? await AsyncStorage.getItem(`${BUSINESS_CONFIG_KEY}:${userId}`);
          const draft = raw ? JSON.parse(raw) as BusinessConfig : null;
          if (draft?.businessId === selectedBusinessId) cloud = draft;
        }
        if (version !== generation.current) return;
        const next = await loadSynchronizedBusinessConfig(selectedBusinessId, userId, DEFAULT_BUSINESS_CONFIG, cloud);
        if (version !== generation.current) return;
        storageKey.current = scopedKey;
        configRef.current = next;
        setConfig(next);
        setLoadedScope(selectedScope);
        setLoaded(true);
      } catch (error) {
        if (version === generation.current) setLoadError(error instanceof Error ? error.message : "No se pudo consultar tu empresa. Comprueba la conexión y reintenta; tus datos se conservan.");
      }
    })();
    return () => { if (generation.current === version) generation.current++; };
  }, [sessionVersion, enterprise.allowed, selectedBusinessId, selectedScope, loadAttempt]);

  // Debounce edits and serialize synchronizations. Never upload an old draft on login.
  useEffect(() => {
    if (!permission.current || !ready || !dirty.current || !config.businessName?.trim()) return;
    // Keep an unfinished new business draft local until its timezone is chosen
    // in Horarios; don't issue repeated failing writes while entering its name.
    if (!config.businessId && !config.timezone?.trim()) return;
    const version = generation.current;
    const timer = setTimeout(() => {
      syncQueue.current = syncQueue.current.then(async () => {
        if (!permission.current || version !== generation.current || !dirty.current) return;
        const snapshot = configRef.current;
        const snapshotRevision = revision.current;
        const userId = await getAuthenticatedUserId();
        if (!userId) throw new Error("Inicia sesión para guardar la configuración de reservas.");
        const resolvedId = await ensureBookingRecord(snapshot, async id => {
          if (version !== generation.current) throw new Error("La cuenta ha cambiado.");
          configRef.current = { ...configRef.current, businessId: id };
          setConfig(prev => ({ ...prev, businessId: id }));
          await AsyncStorage.setItem(storageKey.current, JSON.stringify(configRef.current));
        }, userId, selectedBusinessId!);
        if (version !== generation.current || !resolvedId) return;
        const updated = { ...snapshot, businessId: resolvedId };
        await saveCloudConfiguration(resolvedId, updated);
        if (version !== generation.current) return;
        setConfig(prev => ({ ...prev, businessId: resolvedId }));
        configRef.current = { ...configRef.current, businessId: resolvedId };
        await AsyncStorage.setItem(storageKey.current, JSON.stringify(configRef.current));
        if (revision.current === snapshotRevision) dirty.current = false;
      }).catch(error => {
        if (version === generation.current) Alert.alert("No se guardaron todos los cambios", error instanceof Error ? error.message : "Comprueba tu conexión y vuelve a intentarlo.", [{ text: "Cerrar" }, { text: "Reintentar", onPress: () => setConfig(prev => ({ ...prev })) }]);
      });
    }, 800);
    return () => clearTimeout(timer);
  }, [config, ready]);

  // ── updateConfig ─────────────────────────────────────────────────────────────
  //
  // Punto único de escritura de go_business_config_v1.
  // La sincronización con go_businesses_v1 la gestiona el useEffect de arriba,
  // que se activa automáticamente cuando el estado cambia.

  const updateConfig = useCallback((patch: Partial<BusinessConfig>, expectedBusinessId?: string) => {
    if (expectedBusinessId !== undefined && (configRef.current.businessId ?? "") !== expectedBusinessId) throw new Error("La empresa seleccionada ha cambiado.");
    if (!permission.current) { if (expectedBusinessId !== undefined) throw new Error("No tienes permiso para guardar esta configuración."); return; }
    const key = storageKey.current, version = generation.current;
    dirty.current = true;
    revision.current++;
    setConfig(prev => {
      if (version !== generation.current || !permission.current) return prev;
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(key, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── resetToSubActivity ───────────────────────────────────────────────────────

  const resetToSubActivity = useCallback((sectorId: string, subId: string) => {
    if (!permission.current) return;
    dirty.current = true;
    revision.current++;
    setConfig(prev => {
      // Only wipe plantillaItems and services when the user actually picks a
      // DIFFERENT sub-activity.  When confirming the same sub (e.g. re-opening
      // the config screen), we must preserve the existing professionals and
      // services — otherwise they disappear every time the screen is visited.
      const subChanged = prev.subId !== subId;

      const plantillaItems =
        subChanged || prev.plantillaItems.length === 0
          ? initPlantillaItems(subId)
          : prev.plantillaItems;

      const services =
        subChanged || prev.services.length === 0
          ? (SUGGESTED_SERVICES[subId] ?? []).map(s => ({
              name: s.name, duration: s.duration, price: s.price,
            }))
          : prev.services;

      const next: BusinessConfig = {
        ...prev,
        sectorId,
        subId,
        plantillaItems,
        services,
      };
      AsyncStorage.setItem(storageKey.current, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── resetConfig ─────────────────────────────────────────────────────────────
  // "Nueva empresa": borra toda la configuración activa y vuelve al estado vacío.
  // El wizard arrancará desde cero con un objeto completamente limpio.
  // No confundir con resetToSubActivity (que solo limpia profesionales/servicios).
  const resetConfig = useCallback(async () => {
    if (!permission.current) return;
    generation.current++;
    dirty.current = false;
    const fresh: BusinessConfig = { ...DEFAULT_BUSINESS_CONFIG };
    // Limpiar ambos keys para evitar herencia de datos de la empresa anterior
    await Promise.all([
      AsyncStorage.setItem(storageKey.current, JSON.stringify(fresh)),
      AsyncStorage.removeItem('go_empresa_setup_v2'),
    ]);
    // Resetear la firma de sincronización para que el próximo save
    // cree un registro nuevo en go_businesses_v1 en lugar de actualizar el anterior.
    lastSyncSigRef.current = "";
    setConfig(fresh);
  }, []);

  return (
    <GoBusinessConfigContext.Provider value={{ config: ready ? config : DEFAULT_BUSINESS_CONFIG, loaded: ready, loadError,
      reloadConfig: () => setLoadAttempt(value => value + 1), updateConfig, resetToSubActivity, resetConfig, calendarWorkHours }}>
      {children}
    </GoBusinessConfigContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBusinessConfig(): GoBusinessConfigContextType {
  return useContext(GoBusinessConfigContext);
}
