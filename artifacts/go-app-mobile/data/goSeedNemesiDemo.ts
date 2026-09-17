/**
 * goSeedNemesiDemo
 * ══════════════════════════════════════════════════════════════════════════════
 * Empresa demo persistente: "Nemesi de Molina" (Belleza / Peluquería)
 *
 * Esta función se ejecuta en cada arranque de la app.
 *
 * REGLAS DE PROTECCIÓN (inmutables):
 *  1. Si el businessId ya es "nemesi_molina" → JAMÁS tocar ningún campo.
 *  2. Si hay businessId legado "nemesi-demo-v1" → migrar IDs sin tocar datos.
 *  3. Si existe businessName guardado → JAMÁS sobreescribir la config.
 *  4. Solo en primera instalación (sin datos) → sembrar el template completo.
 *  5. ensureBookingRecord (en el contexto) se encarga de sincronizar
 *     staff/servicios/horarios; este seed no lo repite ni lo interfiere.
 *
 * Sobrevive a:
 *  ✅ Reinicio de Expo Go / workflow
 *  ✅ Cambio de agente
 *  ✅ Refactorizaciones
 *  ✅ Recargas de la app (AsyncStorage persiste)
 *  ✅ businessName vacío temporal (guard por businessId, no por nombre)
 * ══════════════════════════════════════════════════════════════════════════════
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusinessConfig }  from "@/contexts/GoBusinessConfigContext";
import type { FloorPlan }       from "@/data/floorPlan";

// ── IDs canónicos ────────────────────────────────────────────────────────────

export const NEMESI_BUSINESS_ID   = "nemesi_molina";
export const NEMESI_FLOOR_PLAN_ID = "fp-nemesi-molina";

/** ID usado en versiones anteriores — solo para migración. */
const LEGACY_NEMESI_ID = "nemesi-demo-v1";

// ── AsyncStorage keys ──────────────────────────────────────────────────────

const CONFIG_KEY     = "go_business_config_v1";
const FLOOR_KEY      = `go_floor_plan_v1_${NEMESI_BUSINESS_ID}`;
const BUSINESSES_KEY = "go_businesses_v1";
const ITEMS_KEY      = "go_bookable_items_v1";
const WINDOWS_KEY    = "go_availability_windows_v1";
const STAFF_KEY      = "go_staff_v1";

// ── Datos de la empresa demo ────────────────────────────────────────────────

const NEMESI_CONFIG: BusinessConfig = {
  businessId:       NEMESI_BUSINESS_ID,
  businessName:     "Nemesi de Molina",
  address:          "Calle Gran Vía 12, 28013 Madrid",
  cartaUrl:         "",
  sectorId:         "belleza",
  subId:            "peluqueria",
  activeDays:       [0, 1, 2, 3, 4, 5],
  openFrom:         "09:00",
  openTo:           "20:00",
  daySchedules: {
    "0": { shift1: { from: "09:00", to: "20:00", active: true }, shift2: { from: "16:00", to: "20:00", active: false } },
    "1": { shift1: { from: "09:00", to: "20:00", active: true }, shift2: { from: "16:00", to: "20:00", active: false } },
    "2": { shift1: { from: "09:00", to: "20:00", active: true }, shift2: { from: "16:00", to: "20:00", active: false } },
    "3": { shift1: { from: "09:00", to: "20:00", active: true }, shift2: { from: "16:00", to: "20:00", active: false } },
    "4": { shift1: { from: "09:00", to: "20:00", active: true }, shift2: { from: "16:00", to: "20:00", active: false } },
    "5": { shift1: { from: "09:00", to: "14:00", active: true }, shift2: { from: "16:00", to: "20:00", active: false } },
    "6": { shift1: { from: "09:00", to: "20:00", active: false }, shift2: { from: "16:00", to: "20:00", active: false } },
  } as any,
  services: [
    { name: "Corte",             duration: 30, price: 15 },
    { name: "Lavado",            duration: 15, price: 8  },
    { name: "Tinte",             duration: 90, price: 45 },
    { name: "Peinado",           duration: 30, price: 20 },
    { name: "Corte + Afeitado",  duration: 60, price: 30 },
  ],
  plantillaItems: [
    { id: "pi_0", emoji: "💺", label: "Puestos de trabajo", count: 3,
      staffNames: ["Carmen", "Lucía", "Isa"],
      staffServices: [
        ["Corte", "Tinte", "Lavado"],
        ["Lavado", "Peinado", "Corte + Afeitado"],
        ["Lavado", "Tinte", "Peinado"],
      ],
    },
  ],
  phone:            "",
  whatsapp:         "",
  paymentPolicy:    0,
  approvalPolicy:   0,
  cancelPolicy:     0,
  bookingEnabled:   true,
  completedSteps:   [0, 1, 2, 3, 4, 5, 6, 7],
  paymentMethod:    null,
  isBusinessActive: true,
};

const NEMESI_FLOOR_PLAN: FloorPlan = {
  id:         NEMESI_FLOOR_PLAN_ID,
  businessId: NEMESI_BUSINESS_ID,
  updatedAt:  1700000000000,
  elements: [
    {
      id: "el-puesto-1", type: "silla", label: "Lucía",         number: "1",
      capacity: 1, x: 40,  y: 60,  width: 110, height: 70,
      status: "disponible", reservable: true, color: "#4A80BD",
    },
    {
      id: "el-puesto-2", type: "silla", label: "Rosa",          number: "2",
      capacity: 1, x: 162, y: 60,  width: 110, height: 70,
      status: "disponible", reservable: true, color: "#4A80BD",
    },
    {
      id: "el-puesto-3", type: "silla", label: "Antonio",       number: "3",
      capacity: 1, x: 40,  y: 142, width: 110, height: 70,
      status: "disponible", reservable: true, color: "#4A80BD",
    },
    {
      id: "el-puesto-4", type: "silla", label: "María del Mar", number: "4",
      capacity: 1, x: 162, y: 142, width: 130, height: 70,
      status: "disponible", reservable: true, color: "#4A80BD",
    },
  ],
};

const NEMESI_BUSINESS_RECORD = {
  id:            NEMESI_BUSINESS_ID,
  name:          "Nemesi de Molina",
  category:      "peluqueria",
  location:      "Calle Gran Vía 12, 28013 Madrid",
  phone:         "",
  bookingActive: true,
  bookingColor:  "#eab308",
  timezone:      "Europe/Madrid",
  createdAt:     "2024-01-01T00:00:00.000Z",
};

const NEMESI_BOOKABLE_ITEMS = [
  { id: "bi-corte",      businessId: NEMESI_BUSINESS_ID, title: "Corte",             type: "peluqueria", durationMinutes: 30, customerCapacity: 1, unitQuantity: 1, price: 15, paymentRequired: false, active: true, visible: true },
  { id: "bi-lavado",     businessId: NEMESI_BUSINESS_ID, title: "Lavado",            type: "peluqueria", durationMinutes: 15, customerCapacity: 1, unitQuantity: 1, price: 8,  paymentRequired: false, active: true, visible: true },
  { id: "bi-tinte",      businessId: NEMESI_BUSINESS_ID, title: "Tinte",             type: "peluqueria", durationMinutes: 90, customerCapacity: 1, unitQuantity: 1, price: 45, paymentRequired: false, active: true, visible: true },
  { id: "bi-peinado",    businessId: NEMESI_BUSINESS_ID, title: "Peinado",           type: "peluqueria", durationMinutes: 30, customerCapacity: 1, unitQuantity: 1, price: 20, paymentRequired: false, active: true, visible: true },
  { id: "bi-corteafeit", businessId: NEMESI_BUSINESS_ID, title: "Corte + Afeitado", type: "peluqueria", durationMinutes: 60, customerCapacity: 1, unitQuantity: 1, price: 30, paymentRequired: false, active: true, visible: true },
];

const NEMESI_STAFF = [
  { id: "st-carmen", businessId: NEMESI_BUSINESS_ID, name: "Carmen", emoji: "💺", serviceIds: ["bi-corte", "bi-tinte", "bi-lavado"],        active: true },
  { id: "st-lucia",  businessId: NEMESI_BUSINESS_ID, name: "Lucía",  emoji: "💺", serviceIds: ["bi-lavado", "bi-peinado", "bi-corteafeit"], active: true },
  { id: "st-isa",    businessId: NEMESI_BUSINESS_ID, name: "Isa",    emoji: "💺", serviceIds: ["bi-lavado", "bi-tinte", "bi-peinado"],      active: true },
];

// Ventanas: lunes (1) a sábado (6), domingo (0) cerrado
const NEMESI_WINDOWS = [1, 2, 3, 4, 5, 6].map((weekday) => ({
  id:                 `aw-nemesi-${weekday}`,
  businessId:         NEMESI_BUSINESS_ID,
  weekday,
  visibleStartHour:   9,
  visibleStartMinute: 0,
  visibleEndHour:     weekday === 6 ? 14 : 20,
  visibleEndMinute:   0,
  active:             true,
}));

// ── IDs antiguos a purgar — empresa "Nemesi" del seed paralelo ───────────────

/** IDs de empresas demo antiguas que deben eliminarse definitivamente. */
const PURGE_OLD_IDS = ["nemesi-peluqueria-demo"];

/**
 * Elimina de TODOS los storage keys cualquier dato asociado a los IDs de
 * empresa antiguos (PURGE_OLD_IDS). También resetea la config si apunta a uno
 * de esos IDs, para que el seed principal de "Nemesi de Molina" se aplique.
 *
 * Se ejecuta en cada arranque, antes de leer/escribir nada más.
 * Operación idempotente: si ya no hay datos viejos, no hace nada.
 */
async function _purgeOldDemoBusinesses(): Promise<void> {
  for (const oldId of PURGE_OLD_IDS) {
    // go_businesses_v1
    const bizRaw = await AsyncStorage.getItem(BUSINESSES_KEY);
    if (bizRaw) {
      const all: any[] = JSON.parse(bizRaw);
      const filtered = all.filter((b: any) => b.id !== oldId);
      if (filtered.length !== all.length) {
        await AsyncStorage.setItem(BUSINESSES_KEY, JSON.stringify(filtered));
        console.log(`[GO] ✂️ Empresa antigua '${oldId}' eliminada de go_businesses_v1`);
      }
    }

    // go_bookable_items_v1
    const itemsRaw = await AsyncStorage.getItem(ITEMS_KEY);
    if (itemsRaw) {
      const all: any[] = JSON.parse(itemsRaw);
      const filtered = all.filter((i: any) => i.businessId !== oldId);
      if (filtered.length !== all.length) {
        await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(filtered));
        console.log(`[GO] ✂️ Items de '${oldId}' eliminados de go_bookable_items_v1`);
      }
    }

    // go_availability_windows_v1
    const winRaw = await AsyncStorage.getItem(WINDOWS_KEY);
    if (winRaw) {
      const all: any[] = JSON.parse(winRaw);
      const filtered = all.filter((w: any) => w.businessId !== oldId);
      if (filtered.length !== all.length) {
        await AsyncStorage.setItem(WINDOWS_KEY, JSON.stringify(filtered));
        console.log(`[GO] ✂️ Ventanas de '${oldId}' eliminadas de go_availability_windows_v1`);
      }
    }

    // go_bookings_v1
    const bookRaw = await AsyncStorage.getItem("go_bookings_v1");
    if (bookRaw) {
      const all: any[] = JSON.parse(bookRaw);
      const filtered = all.filter((b: any) => b.businessId !== oldId);
      if (filtered.length !== all.length) {
        await AsyncStorage.setItem("go_bookings_v1", JSON.stringify(filtered));
        console.log(`[GO] ✂️ Reservas de '${oldId}' eliminadas de go_bookings_v1`);
      }
    }

    // go_staff_v1
    const staffRaw = await AsyncStorage.getItem(STAFF_KEY);
    if (staffRaw) {
      const all: any[] = JSON.parse(staffRaw);
      const filtered = all.filter((s: any) => s.businessId !== oldId);
      if (filtered.length !== all.length) {
        await AsyncStorage.setItem(STAFF_KEY, JSON.stringify(filtered));
        console.log(`[GO] ✂️ Staff de '${oldId}' eliminado de go_staff_v1`);
      }
    }
  }

  // Config: si businessId apunta a empresa antigua → resetear para que el seed
  // principal de "Nemesi de Molina" pueda escribir los datos correctos.
  const rawConfig = await AsyncStorage.getItem(CONFIG_KEY);
  if (rawConfig) {
    try {
      const cfg = JSON.parse(rawConfig) as { businessId?: string; businessName?: string };
      if (cfg.businessId && PURGE_OLD_IDS.includes(cfg.businessId)) {
        await AsyncStorage.removeItem(CONFIG_KEY);
        console.log(`[GO] ✂️ Config antigua (businessId: '${cfg.businessId}') eliminada — se sembrará Nemesi de Molina`);
      }
    } catch { /* config corrupta, ignorar */ }
  }

  // go_demo_seed_flag ya no es necesario
  await AsyncStorage.removeItem("go_demo_seed_flag");
}

// ── Función principal ────────────────────────────────────────────────────────

/**
 * Siembra o migra la empresa demo "Nemesi de Molina".
 *
 * Garantías absolutas:
 *   • PASO 0: elimina empresas demo antiguas ("nemesi-peluqueria-demo") de TODOS
 *     los storage keys antes de cualquier otra operación.
 *   • Si businessId === "nemesi_molina" ya existe → NO escribe nada en config.
 *   • Si businessId es el legado "nemesi-demo-v1" → migra IDs sin tocar datos.
 *   • Si businessName existe → NO sobreescribe nada (guard de nombre como fallback).
 *   • Solo escribe en primera instalación (sin datos).
 *   • ensureBookingRecord (contexto) sincroniza staff/items/horarios en cada carga;
 *     este seed no duplica esa labor.
 */
export async function seedNemesiDemoIfNeeded(): Promise<void> {
  try {
    // ── PASO 0: limpiar empresa antigua "nemesi-peluqueria-demo" ─────────────
    // Debe ejecutarse ANTES de leer la config, ya que si la config apunta al ID
    // antiguo la purga la borra para que el seed principal pueda escribir la correcta.
    await _purgeOldDemoBusinesses();

    const raw = await AsyncStorage.getItem(CONFIG_KEY);

    if (raw) {
      let parsed: Partial<BusinessConfig>;
      try { parsed = JSON.parse(raw); }
      catch { parsed = {}; }

      // ── MIGRACIÓN: businessId legado → nuevo canónico ─────────────────────
      if (parsed.businessId === LEGACY_NEMESI_ID) {
        await _migrateBusinessId(parsed);
        return;
      }

      // ── GUARD: cualquier businessId o businessName presente → no es primera instalación ──
      // Esto protege al usuario que creó su propia empresa aunque después
      // borrara el nombre, y también protege el businessId canónico de Nemesi.
      if (parsed.businessId || (parsed.businessName && parsed.businessName.trim() !== "")) {
        return;
      }
    }

    // ── PRIMERA INSTALACIÓN: sembrar template completo ────────────────────────
    await _writeInitialDemoData();
    console.log("[GO] Empresa 'Nemesi de Molina' sembrada correctamente");
  } catch (e) {
    console.warn("[GO] seedNemesiDemoIfNeeded error:", e);
  }
}

/**
 * 🛠️ SOLO USO INTERNO DE DESARROLLO — nunca llamar en producción.
 * Restaura los datos de booking (staff, items, horarios) de Nemesi
 * sin tocar la config del negocio (businessName, teléfonos, etc.)
 * que el usuario haya modificado.
 */
export async function restoreNemesiDemo(): Promise<void> {
  if (!__DEV__) {
    console.warn("[GO] restoreNemesiDemo: ignorado fuera de modo desarrollo");
    return;
  }
  try {
    // Solo restaurar datos de booking — NUNCA la config principal
    await _restoreBookingData();
    console.log("[GO] ✅ Datos de booking de Nemesi restaurados");
  } catch (e) {
    console.warn("[GO] restoreNemesiDemo error:", e);
    throw e;
  }
}

// ── Migración de businessId legado ──────────────────────────────────────────

/**
 * Migra todos los datos de "nemesi-demo-v1" a "nemesi_molina" en caliente,
 * preservando TODOS los campos que el usuario haya modificado.
 */
async function _migrateBusinessId(parsed: Partial<BusinessConfig>): Promise<void> {
  try {
    // 1. Config principal: cambiar businessId, conservar TODOS los demás campos
    const migratedConfig = { ...parsed, businessId: NEMESI_BUSINESS_ID };
    await AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(migratedConfig));

    // 2. go_businesses_v1
    const bizRaw = await AsyncStorage.getItem(BUSINESSES_KEY);
    if (bizRaw) {
      const bizAll: any[] = JSON.parse(bizRaw);
      const migrated = bizAll.map((b: any) =>
        b.id === LEGACY_NEMESI_ID ? { ...b, id: NEMESI_BUSINESS_ID } : b
      );
      await AsyncStorage.setItem(BUSINESSES_KEY, JSON.stringify(migrated));
    }

    // 3. go_staff_v1
    const staffRaw = await AsyncStorage.getItem(STAFF_KEY);
    if (staffRaw) {
      const staffAll: any[] = JSON.parse(staffRaw);
      const migrated = staffAll.map((s: any) =>
        s.businessId === LEGACY_NEMESI_ID
          ? { ...s, businessId: NEMESI_BUSINESS_ID }
          : s
      );
      await AsyncStorage.setItem(STAFF_KEY, JSON.stringify(migrated));
    }

    // 4. go_bookable_items_v1
    const itemsRaw = await AsyncStorage.getItem(ITEMS_KEY);
    if (itemsRaw) {
      const itemsAll: any[] = JSON.parse(itemsRaw);
      const migrated = itemsAll.map((i: any) =>
        i.businessId === LEGACY_NEMESI_ID
          ? { ...i, businessId: NEMESI_BUSINESS_ID }
          : i
      );
      await AsyncStorage.setItem(ITEMS_KEY, JSON.stringify(migrated));
    }

    // 5. go_availability_windows_v1
    const winRaw = await AsyncStorage.getItem(WINDOWS_KEY);
    if (winRaw) {
      const winAll: any[] = JSON.parse(winRaw);
      const migrated = winAll.map((w: any) =>
        w.businessId === LEGACY_NEMESI_ID
          ? { ...w, businessId: NEMESI_BUSINESS_ID }
          : w
      );
      await AsyncStorage.setItem(WINDOWS_KEY, JSON.stringify(migrated));
    }

    // 6. Floor plan: copiar de key legada a key nueva y eliminar legada
    const legacyFloorKey = `go_floor_plan_v1_${LEGACY_NEMESI_ID}`;
    const floorRaw = await AsyncStorage.getItem(legacyFloorKey);
    if (floorRaw) {
      const floor = JSON.parse(floorRaw);
      const migratedFloor = { ...floor, businessId: NEMESI_BUSINESS_ID };
      await AsyncStorage.setItem(FLOOR_KEY, JSON.stringify(migratedFloor));
      await AsyncStorage.removeItem(legacyFloorKey);
    }

    console.log(`[GO] Migrado businessId: ${LEGACY_NEMESI_ID} → ${NEMESI_BUSINESS_ID}`);
  } catch (e) {
    console.warn("[GO] _migrateBusinessId error:", e);
  }
}

// ── Primera instalación ──────────────────────────────────────────────────────

/**
 * Escribe todos los datos de la empresa demo en AsyncStorage.
 * Solo se llama en PRIMERA INSTALACIÓN (cuando no hay datos guardados).
 * No preserve nada porque no hay nada que preservar.
 */
async function _writeInitialDemoData(): Promise<void> {
  const writes: Promise<void>[] = [
    AsyncStorage.setItem(CONFIG_KEY, JSON.stringify(NEMESI_CONFIG)),
    AsyncStorage.setItem(FLOOR_KEY, JSON.stringify(NEMESI_FLOOR_PLAN)),
  ];

  // go_businesses_v1 — upsert por ID
  const bizRaw = await AsyncStorage.getItem(BUSINESSES_KEY);
  const bizAll: typeof NEMESI_BUSINESS_RECORD[] = bizRaw ? JSON.parse(bizRaw) : [];
  const bizFiltered = bizAll.filter((b) => b.id !== NEMESI_BUSINESS_ID);
  writes.push(
    AsyncStorage.setItem(BUSINESSES_KEY, JSON.stringify([...bizFiltered, NEMESI_BUSINESS_RECORD]))
  );

  // go_bookable_items_v1 — upsert por ID
  const itemsRaw = await AsyncStorage.getItem(ITEMS_KEY);
  const itemsAll: typeof NEMESI_BOOKABLE_ITEMS[0][] = itemsRaw ? JSON.parse(itemsRaw) : [];
  const itemsFiltered = itemsAll.filter((i) => !NEMESI_BOOKABLE_ITEMS.some((d) => d.id === i.id));
  writes.push(
    AsyncStorage.setItem(ITEMS_KEY, JSON.stringify([...itemsFiltered, ...NEMESI_BOOKABLE_ITEMS]))
  );

  // go_availability_windows_v1 — upsert por ID
  const winRaw = await AsyncStorage.getItem(WINDOWS_KEY);
  const winAll: typeof NEMESI_WINDOWS[0][] = winRaw ? JSON.parse(winRaw) : [];
  const winFiltered = winAll.filter((w) => !NEMESI_WINDOWS.some((d) => d.id === w.id));
  writes.push(
    AsyncStorage.setItem(WINDOWS_KEY, JSON.stringify([...winFiltered, ...NEMESI_WINDOWS]))
  );

  // go_staff_v1 — upsert por ID
  const staffRaw = await AsyncStorage.getItem(STAFF_KEY);
  const staffAll: typeof NEMESI_STAFF[0][] = staffRaw ? JSON.parse(staffRaw) : [];
  const staffFiltered = staffAll.filter((s) => !NEMESI_STAFF.some((d) => d.id === s.id));
  writes.push(
    AsyncStorage.setItem(STAFF_KEY, JSON.stringify([...staffFiltered, ...NEMESI_STAFF]))
  );

  await Promise.all(writes);
}

// ── Restauración de datos de booking (modo dev) ──────────────────────────────

/**
 * Restaura solo los datos de booking derivados (staff, items, ventanas)
 * sin tocar la config principal. ensureBookingRecord regenerará el staff
 * correcto al arrancar el contexto.
 */
async function _restoreBookingData(): Promise<void> {
  const writes: Promise<void>[] = [];

  writes.push(AsyncStorage.setItem(FLOOR_KEY, JSON.stringify(NEMESI_FLOOR_PLAN)));

  // Staff: reemplazar solo los de Nemesi
  const staffRaw = await AsyncStorage.getItem(STAFF_KEY);
  const staffAll: any[] = staffRaw ? JSON.parse(staffRaw) : [];
  const staffFiltered = staffAll.filter((s) => s.businessId !== NEMESI_BUSINESS_ID);
  writes.push(
    AsyncStorage.setItem(STAFF_KEY, JSON.stringify([...staffFiltered, ...NEMESI_STAFF]))
  );

  // Bookable items: reemplazar solo los de Nemesi
  const itemsRaw = await AsyncStorage.getItem(ITEMS_KEY);
  const itemsAll: any[] = itemsRaw ? JSON.parse(itemsRaw) : [];
  const itemsFiltered = itemsAll.filter((i) => i.businessId !== NEMESI_BUSINESS_ID);
  writes.push(
    AsyncStorage.setItem(ITEMS_KEY, JSON.stringify([...itemsFiltered, ...NEMESI_BOOKABLE_ITEMS]))
  );

  // Availability windows: reemplazar solo las de Nemesi
  const winRaw = await AsyncStorage.getItem(WINDOWS_KEY);
  const winAll: any[] = winRaw ? JSON.parse(winRaw) : [];
  const winFiltered = winAll.filter((w) => w.businessId !== NEMESI_BUSINESS_ID);
  writes.push(
    AsyncStorage.setItem(WINDOWS_KEY, JSON.stringify([...winFiltered, ...NEMESI_WINDOWS]))
  );

  await Promise.all(writes);
}
