import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Types ──────────────────────────────────────────────────────────────────────

export type FloorElementType =
  | "mesa"
  | "habitacion"
  | "sala"
  | "plaza"
  | "zona"
  | "silla"
  | "custom";

export type FloorElementStatus =
  | "disponible"
  | "reservado"
  | "ocupado"
  | "bloqueado"
  | "mantenimiento"
  | "pendiente";

export type FloorElement = {
  id: string;
  type: FloorElementType;
  label: string;
  number?: string;
  capacity?: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: FloorElementStatus;
  reservable: boolean;
  color?: string;
};

export type FloorPlan = {
  id: string;
  businessId: string;
  backgroundImage?: string;
  elements: FloorElement[];
  updatedAt: number;
};

export type FloorReservation = {
  id: string;
  planId: string;
  elementId: string;
  customerName: string;
  date: string;
  time: string;
  notes?: string;
  status: "pendiente" | "confirmada" | "cancelada";
  createdAt: number;
};

// ── Defaults ───────────────────────────────────────────────────────────────────

export const STATUS_COLORS: Record<FloorElementStatus, string> = {
  disponible:   "#22C55E",
  reservado:    "#3B82F6",
  ocupado:      "#EF4444",
  bloqueado:    "#6B7280",
  mantenimiento:"#F59E0B",
  pendiente:    "#A78BFA",
};

export const STATUS_LABELS: Record<FloorElementStatus, string> = {
  disponible:   "Free",
  reservado:    "Reserved",
  ocupado:      "Occupied",
  bloqueado:    "Blocked",
  mantenimiento:"Manten.",
  pendiente:    "Pendiente",
};

export const ELEMENT_DEFAULTS: Record<FloorElementType, Partial<FloorElement>> = {
  mesa:       { width: 72,  height: 72,  capacity: 4  },
  habitacion: { width: 110, height: 80,  capacity: 2  },
  sala:       { width: 130, height: 95,  capacity: 10 },
  plaza:      { width: 90,  height: 55,  capacity: 1  },
  zona:       { width: 150, height: 110, capacity: 20 },
  silla:      { width: 48,  height: 48,  capacity: 1  },
  custom:     { width: 90,  height: 72,  capacity: 2  },
};

export const ELEMENT_ICONS: Record<FloorElementType, string> = {
  mesa:       "utensils",
  habitacion: "home",
  sala:       "grid",
  plaza:      "square",
  zona:       "map",
  silla:      "user",
  custom:     "star",
};

export const ELEMENT_LABELS: Record<FloorElementType, string> = {
  mesa:       "Mesa",
  habitacion: "Habitación",
  sala:       "Sala",
  plaza:      "Plaza",
  zona:       "Zona",
  silla:      "Silla",
  custom:     "Custom",
};

// ── Storage ────────────────────────────────────────────────────────────────────

const STORAGE_KEY = "go_floor_plan_v1";
const RESERVATIONS_KEY = "go_floor_reservations_v1";

export const loadFloorPlan = async (businessId: string): Promise<FloorPlan | null> => {
  try {
    const raw = await AsyncStorage.getItem(`${STORAGE_KEY}_${businessId}`);
    if (!raw) return null;
    return JSON.parse(raw) as FloorPlan;
  } catch { return null; }
};

export const saveFloorPlan = async (plan: FloorPlan): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${STORAGE_KEY}_${plan.businessId}`, JSON.stringify(plan));
  } catch { /* silent */ }
};

export const loadReservations = async (planId: string): Promise<FloorReservation[]> => {
  try {
    const raw = await AsyncStorage.getItem(`${RESERVATIONS_KEY}_${planId}`);
    if (!raw) return [];
    return JSON.parse(raw) as FloorReservation[];
  } catch { return []; }
};

export const saveReservations = async (planId: string, reservations: FloorReservation[]): Promise<void> => {
  try {
    await AsyncStorage.setItem(`${RESERVATIONS_KEY}_${planId}`, JSON.stringify(reservations));
  } catch { /* silent */ }
};

export const makeFloorId = () => `fp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
export const makeElementId = () => `el_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
export const makeReservationId = () => `rv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
