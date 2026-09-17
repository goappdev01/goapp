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
 * Si businessName está presente, existe siempre un registro vinculado en
 * go_businesses_v1 con bookingActive: true. El campo businessId en este
 * config es el enlace permanente entre los dos sistemas.
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
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  initPlantillaItems,
  SECTORS,
  SUGGESTED_SERVICES,
  type PlantillaItem,
} from "@/data/goSectorData";
import {
  createAvailabilityWindow,
  createBusiness,
  createBookableItem,
  deleteAvailabilityWindow,
  deleteBookableItem,
  getAvailabilityWindows,
  getBookableItems,
  getBusinesses,
  saveAvailabilityWindow,
  saveBookableItem,
  saveBusiness,
  getStaff,
  saveStaff,
  deleteStaff,
  type CancellationPolicy,
  type Staff,
} from "@/data/booking";

// ─── Storage keys ─────────────────────────────────────────────────────────────

export const BUSINESS_CONFIG_KEY    = "go_business_config_v1";
const LEGACY_SETUP_KEY      = "go_empresa_setup_v2";
const LEGACY_PLANTILLA_KEY  = "go_plantilla_items_v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export type SavedService = {
  name:      string;
  duration:  number;
  price:     number;
  capacity?: number;
};

export type DayShift = { from: string; to: string; active: boolean };
export type DaySchedule = { shift1: DayShift; shift2: DayShift };

export type StaffScheduleConfig = {
  useCompanySchedule: boolean;
  daySchedules: Record<string, DaySchedule>; // keyed "0"=Mon…"6"=Sun
};

export type PaymentMethodId = "card" | "bank" | "stripe" | "tpv" | "other";

export type BusinessConfig = {
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
  phone?:           string; // Teléfono fijo de contacto
  whatsapp?:        string; // Número WhatsApp de contacto
  staffSchedules?:  Record<string, StaffScheduleConfig>; // keyed by stable staff ID
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

type GoBusinessConfigContextType = {
  config:             BusinessConfig;
  loaded:             boolean;
  updateConfig:       (patch: Partial<BusinessConfig>) => void;
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
    if (validStableIds.size === 0 || validStableIds.has(k)) cleanSchedules[k] = v;
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
// Garantiza que existe un registro en go_businesses_v1 vinculado al config,
// siembra go_bookable_items_v1 con TODOS los servicios del config (dedup por
// título — no borra ítems existentes, solo añade los que faltan), y siembra
// go_availability_windows_v1 desde activeDays/openFrom/openTo si está vacío.
//
// Se ejecuta en cada arranque de la app (prevSigRef resetea a "" en cada mount).
// Devuelve el businessId definitivo (existente o recién creado).

async function ensureBookingRecord(cfg: BusinessConfig): Promise<string | null> {
  const name = cfg.businessName?.trim();
  if (!name) return cfg.businessId ?? null;

  const category = cfg.subId ?? cfg.sectorId ?? "";
  const location = cfg.address?.trim() ?? "";
  const sectorColor =
    SECTORS.find((s) => s.id === cfg.sectorId)?.color ?? "#3B82F6";

  let resolvedId: string;

  const cancellationPolicy = deriveCancellationPolicy(cfg);

  if (cfg.businessId) {
    const all = await getBusinesses();
    const existing = all.find((b) => b.id === cfg.businessId);
    if (existing) {
      await saveBusiness({
        ...existing,
        name,
        category,
        location,
        bookingColor: sectorColor,
        bookingActive: true,
        cancellationPolicy,
        phone:    cfg.phone    ?? existing.phone ?? "",
        whatsapp: cfg.whatsapp ?? existing.whatsapp,
      });
      resolvedId = cfg.businessId;
    } else {
      // Registro no encontrado pero businessId ya existe (p.ej. go_businesses_v1
      // fue borrado manualmente). Reusar el ID fijo para no romper la referencia.
      await saveBusiness({
        id:            cfg.businessId,
        name,
        category,
        location,
        phone:         cfg.phone    ?? "",
        whatsapp:      cfg.whatsapp,
        bookingActive: true,
        bookingColor:  sectorColor,
        timezone:      "Europe/Madrid",
        createdAt:     new Date().toISOString(),
        cancellationPolicy,
      });
      resolvedId = cfg.businessId;
    }
  } else {
    const created = await createBusiness({
      name, category, location,
      phone:    cfg.phone    ?? "",
      whatsapp: cfg.whatsapp,
      bookingActive: true,
      bookingColor: sectorColor,
      timezone: "Europe/Madrid",
      cancellationPolicy,
    });
    resolvedId = created.id;
  }

  // ── Sincronizar BookableItems — reemplazo completo por título ──────────────
  // Operación full-replace: la lista config.services es la fuente de verdad.
  //   • Ítems eliminados del config → se borran de go_bookable_items_v1.
  //   • Ítems modificados (precio/duración/capacidad) → se actualizan.
  //   • Ítems nuevos → se crean.
  // Nunca restaura ítems borrados por el usuario.
  {
    const existingItems  = await getBookableItems(resolvedId);
    const desiredTitles  = new Set(
      cfg.services.map((s) => s.name.toLowerCase().trim()).filter(Boolean)
    );

    // Delete items whose title is no longer in config.services — sequential to
    // avoid the read-modify-write race condition on go_bookable_items_v1.
    const toDeleteItems = existingItems.filter(
      (i) => !desiredTitles.has(i.title.toLowerCase().trim())
    );
    for (const item of toDeleteItems) {
      await deleteBookableItem(item.id);
    }

    // Re-fetch after deletions to build an accurate title→item map
    const remainingItems = existingItems.filter(
      (i) => desiredTitles.has(i.title.toLowerCase().trim())
    );
    const titleToItem = new Map(
      remainingItems.map((i) => [i.title.toLowerCase().trim(), i])
    );

    // Create missing items; update changed items — sequential to avoid
    // read-modify-write race: parallel calls on the same key each read the
    // same stale snapshot and the last write wipes earlier creates.
    for (const svc of cfg.services.filter((s) => s.name.trim())) {
      const key      = svc.name.toLowerCase().trim();
      const existing = titleToItem.get(key);
      if (existing) {
        const changed =
          existing.durationMinutes  !== svc.duration          ||
          existing.price            !== svc.price             ||
          existing.customerCapacity !== (svc.capacity ?? 1);
        if (changed) {
          await saveBookableItem({
            ...existing,
            durationMinutes:  svc.duration,
            price:            svc.price,
            customerCapacity: svc.capacity ?? 1,
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
          active:           true,
          visible:          true,
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
    const allItems = await getBookableItems(resolvedId);
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
        if (seenStaffNorm.has(normName)) continue;
        seenStaffNorm.add(normName);
        // Reusar ID existente por nombre normalizado para no huerfanar reservas.
        // Solo si no existe previo, calcular el stableId determinista.
        const existingMatch = existingByNormName.get(normName);
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
          active:     true,
        });
      }
    }

    // Upsert: guardar staff deseado + eliminar el que ya no existe en config.
    // Sequential to avoid the read-modify-write race on go_staff_v1: parallel
    // saveStaff calls each read the same snapshot → last write wins → earlier
    // serviceIds updates are silently lost.
    const desiredIds = new Set(desiredStaff.map((s) => s.id));
    for (const s of existingStaff.filter((s) => !desiredIds.has(s.id))) {
      await deleteStaff(s.id);
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
        const { hour: startH, minute: startM } = fromTimeStr(shiftData.from);
        const { hour: endH,   minute: endM   } = fromTimeStr(shiftData.to);
        const existing = windowByKey.get(key);
        if (existing) {
          const changed =
            existing.visibleStartHour          !== startH ||
            (existing.visibleStartMinute ?? 0) !== startM ||
            existing.visibleEndHour            !== endH   ||
            (existing.visibleEndMinute ?? 0)   !== endM   ||
            !existing.active;
          if (changed) {
            await saveAvailabilityWindow({
              ...existing,
              visibleStartHour: startH, visibleStartMinute: startM,
              visibleEndHour:   endH,   visibleEndMinute:   endM,
              active: true,
            });
          }
        } else {
          await createAvailabilityWindow({
            businessId: resolvedId, weekday: jsWeekday, shiftIndex: shiftIdx,
            visibleStartHour: startH, visibleStartMinute: startM,
            visibleEndHour:   endH,   visibleEndMinute:   endM,
            active: true,
          });
        }
      }
    }
    for (const w of existingWindows.filter((w) => !w.staffId && !desiredBizKeys.has(winKey(undefined, w.weekday, w.shiftIndex ?? 0)))) {
      await deleteAvailabilityWindow(w.id);
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
      const schedCfg = staffSchedulesCfg[stableId];
      if (!schedCfg || schedCfg.useCompanySchedule) {
        for (const w of existingWindows.filter((w) => w.staffId === stableId)) {
          await deleteAvailabilityWindow(w.id);
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
            const { hour: startH, minute: startM } = fromTimeStr(shiftData.from);
            const { hour: endH,   minute: endM   } = fromTimeStr(shiftData.to);
            const existing = windowByKey.get(key);
            if (existing) {
              const changed =
                existing.visibleStartHour          !== startH ||
                (existing.visibleStartMinute ?? 0) !== startM ||
                existing.visibleEndHour            !== endH   ||
                (existing.visibleEndMinute ?? 0)   !== endM   ||
                !existing.active;
              if (changed) {
                await saveAvailabilityWindow({
                  ...existing,
                  visibleStartHour: startH, visibleStartMinute: startM,
                  visibleEndHour:   endH,   visibleEndMinute:   endM,
                  active: true,
                });
              }
            } else {
              await createAvailabilityWindow({
                businessId: resolvedId, staffId: stableId, weekday: jsWeekday, shiftIndex: shiftIdx,
                visibleStartHour: startH, visibleStartMinute: startM,
                visibleEndHour:   endH,   visibleEndMinute:   endM,
                active: true,
              });
            }
          }
        }
        for (const w of existingWindows.filter((w) => w.staffId === stableId && !desiredStaffKeys.has(winKey(stableId, w.weekday, w.shiftIndex ?? 0)))) {
          await deleteAvailabilityWindow(w.id);
        }
      }
    }
    for (const w of existingWindows.filter((w) => w.staffId && !allStaffIds.has(w.staffId!))) {
      await deleteAvailabilityWindow(w.id);
    }
  }

  return resolvedId;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function GoBusinessConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<BusinessConfig>(DEFAULT_BUSINESS_CONFIG);
  const [loaded, setLoaded]   = useState(false);

  // Firma de los campos que controlan la sincronización. Evita escrituras
  // redundantes cuando config cambia por motivos ajenos (servicios, pasos, etc.).
  const lastSyncSigRef = useRef<string>("");

  // ── Carga inicial ────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(BUSINESS_CONFIG_KEY);
        if (raw) {
          const parsed = JSON.parse(raw) as Partial<BusinessConfig>;
          let needsWrite = false;

          // Migrate old { from, to } daySchedules to new { shift1, shift2 } format
          if (parsed.daySchedules) {
            const migrated = migrateDaySchedules(parsed.daySchedules as any);
            if (JSON.stringify(migrated) !== JSON.stringify(parsed.daySchedules)) {
              parsed.daySchedules = migrated;
              needsWrite = true;
            }
          }

          // ── MIGRACIÓN: corregir activeDays corruptos del bug de race condition ──
          // Patrón: [1,2,3,4,5,6] = Mar–Dom en convenio 0=Lun (lunes cerrado, domingo abierto).
          // Ocurría cuando seedDemoBusinessIfNeeded ganaba la carrera a seedNemesiDemoIfNeeded
          // en la primera instalación. Corrección: restar 1 a todos los índices → [0,1,2,3,4,5].
          if (
            Array.isArray(parsed.activeDays) &&
            parsed.activeDays.length === 6 &&
            parsed.activeDays.includes(6) &&
            !parsed.activeDays.includes(0)
          ) {
            parsed.activeDays = parsed.activeDays.map((d: number) => d - 1);
            if (parsed.daySchedules) {
              const fixedDs: Record<string, typeof parsed.daySchedules[string]> = {};
              for (const [k, v] of Object.entries(parsed.daySchedules)) {
                const num = parseInt(k, 10);
                fixedDs[num >= 1 && num <= 6 ? String(num - 1) : k] = v;
              }
              parsed.daySchedules = fixedDs;
            }
            needsWrite = true;
          }

          // ── Sanitizar plantillaItems: eliminar nombres parciales o inválidos ──
          if (Array.isArray(parsed.plantillaItems)) {
            const before = JSON.stringify(parsed.plantillaItems);
            const sanitized = sanitizePlantillaItems(
              parsed.plantillaItems,
              parsed.businessId,
              parsed.staffSchedules ?? {},
            );
            parsed.plantillaItems = sanitized.plantillaItems;
            parsed.staffSchedules = sanitized.staffSchedules;
            if (JSON.stringify(sanitized.plantillaItems) !== before) needsWrite = true;
          }

          // Solo escribir a AsyncStorage si algo cambió (migración o sanitizado)
          if (needsWrite) {
            await AsyncStorage.setItem(BUSINESS_CONFIG_KEY, JSON.stringify({ ...DEFAULT_BUSINESS_CONFIG, ...parsed }));
          }

          setConfig({ ...DEFAULT_BUSINESS_CONFIG, ...parsed });
          setLoaded(true);
          return;
        }
        // ── Migración desde keys anteriores ──
        const [rawSetup, rawPlantilla] = await Promise.all([
          AsyncStorage.getItem(LEGACY_SETUP_KEY),
          AsyncStorage.getItem(LEGACY_PLANTILLA_KEY),
        ]);
        let migrated: BusinessConfig = { ...DEFAULT_BUSINESS_CONFIG };
        if (rawSetup) {
          try {
            const s = JSON.parse(rawSetup);
            migrated = {
              ...migrated,
              sectorId:       s.sectorId       ?? null,
              subId:          s.subId           ?? null,
              activeDays:     s.activeDays      ?? migrated.activeDays,
              openFrom:       s.openFrom        ?? migrated.openFrom,
              openTo:         s.openTo          ?? migrated.openTo,
              services:       Array.isArray(s.services) ? s.services : [],
              paymentPolicy:  s.paymentPolicy   ?? 0,
              approvalPolicy: s.approvalPolicy  ?? 0,
              cancelPolicy:   s.cancelPolicy    ?? 0,
            };
          } catch {}
        }
        if (rawPlantilla) {
          try {
            const p = JSON.parse(rawPlantilla);
            if (Array.isArray(p.items)) migrated.plantillaItems = p.items;
          } catch {}
        }
        if (migrated.subId && migrated.plantillaItems.length === 0) {
          migrated.plantillaItems = initPlantillaItems(migrated.subId);
        }
        setConfig(migrated);
        AsyncStorage.setItem(BUSINESS_CONFIG_KEY, JSON.stringify(migrated)).catch(() => {});
      } catch {}
      setLoaded(true);
    })();
  }, []);

  // ── Sincronización automática con go_businesses_v1 ──────────────────────────
  //
  // Se ejecuta cada vez que config cambia (después de la carga inicial).
  // Solo actúa cuando la firma de los campos relevantes cambia, y solo
  // cuando existe businessName.
  //
  // Flujo:
  //   1. businessName vacío → no hay nada que sincronizar.
  //   2. businessId presente → actualizar el registro existente en go_businesses_v1.
  //   3. businessId ausente → crear registro, guardar el nuevo ID en config
  //      (go_business_config_v1 y estado). Esto disparará el efecto una vez más,
  //      que entrará en el caso 2 y terminará estable.

  useEffect(() => {
    if (!loaded) return;

    const name = config.businessName?.trim();
    if (!name) return;

    // Incluye campos de horario y pago para que cambios en activeDays/openFrom/openTo/
    // daySchedules, paymentMethod o cancelPolicy disparen re-sincronización completa.
    const schedSig = JSON.stringify({
      days:     [...(config.activeDays ?? [])].sort(),
      from:     config.openFrom,
      to:       config.openTo,
      overrides: config.daySchedules,
    });
    // Incluye firma del staff para que cambios en profesionales/especialidades
    // disparen ensureBookingRecord y sincronicen go_staff_v1.
    // Solo se incluyen nombres válidos (>= 3 chars) para evitar disparos por parciales.
    const staffSig = JSON.stringify(
      (config.plantillaItems ?? []).flatMap((item) =>
        (Array.isArray(item.staffNames) ? item.staffNames : [])
          .map((n, i) => ({ n: typeof n === "string" ? n.trim() : "", svcs: (item.staffServices ?? [])[i] ?? [] }))
          .filter(({ n }) => n.length >= 3)
      )
    );
    const servicesSig = JSON.stringify(
      (config.services ?? []).map((s) => `${s.name}|${s.duration}|${s.price}|${s.capacity ?? 1}`)
    );
    const staffSchedulesSig = JSON.stringify(config.staffSchedules ?? {});
    const sig = `${config.businessId ?? ""}|${name}|${config.address ?? ""}|${config.subId ?? ""}|${config.sectorId ?? ""}|${schedSig}|${config.paymentMethod ?? "none"}|${config.cancelPolicy ?? 0}|${config.phone ?? ""}|${config.whatsapp ?? ""}|${staffSig}|${servicesSig}|${staffSchedulesSig}`;
    if (sig === lastSyncSigRef.current) return;
    lastSyncSigRef.current = sig;

    (async () => {
      try {
        const resolvedId = await ensureBookingRecord(config);
        if (resolvedId && resolvedId !== config.businessId) {
          // Primer sync: se creó un registro nuevo. Persistir el ID en config.
          const updated: BusinessConfig = { ...config, businessId: resolvedId };
          setConfig(updated);
          await AsyncStorage.setItem(BUSINESS_CONFIG_KEY, JSON.stringify(updated));
        }
      } catch {}
    })();
  }, [config, loaded]);

  // ── updateConfig ─────────────────────────────────────────────────────────────
  //
  // Punto único de escritura de go_business_config_v1.
  // La sincronización con go_businesses_v1 la gestiona el useEffect de arriba,
  // que se activa automáticamente cuando el estado cambia.

  const updateConfig = useCallback((patch: Partial<BusinessConfig>) => {
    setConfig(prev => {
      const next = { ...prev, ...patch };
      AsyncStorage.setItem(BUSINESS_CONFIG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── resetToSubActivity ───────────────────────────────────────────────────────

  const resetToSubActivity = useCallback((sectorId: string, subId: string) => {
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
      AsyncStorage.setItem(BUSINESS_CONFIG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  // ── resetConfig ─────────────────────────────────────────────────────────────
  // "Nueva empresa": borra toda la configuración activa y vuelve al estado vacío.
  // El wizard arrancará desde cero con un objeto completamente limpio.
  // No confundir con resetToSubActivity (que solo limpia profesionales/servicios).
  const resetConfig = useCallback(async () => {
    const fresh: BusinessConfig = { ...DEFAULT_BUSINESS_CONFIG };
    // Limpiar ambos keys para evitar herencia de datos de la empresa anterior
    await Promise.all([
      AsyncStorage.setItem(BUSINESS_CONFIG_KEY, JSON.stringify(fresh)),
      AsyncStorage.removeItem('go_empresa_setup_v2'),
    ]);
    // Resetear la firma de sincronización para que el próximo save
    // cree un registro nuevo en go_businesses_v1 en lugar de actualizar el anterior.
    lastSyncSigRef.current = "";
    setConfig(fresh);
  }, []);

  return (
    <GoBusinessConfigContext.Provider value={{ config, loaded, updateConfig, resetToSubActivity, resetConfig }}>
      {children}
    </GoBusinessConfigContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBusinessConfig(): GoBusinessConfigContextType {
  return useContext(GoBusinessConfigContext);
}
