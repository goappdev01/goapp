import AsyncStorage from "@react-native-async-storage/async-storage";
import type { TipoContacto } from "./contactos";

// ── Tipos ─────────────────────────────────────────────────────────────

export type TipoIntencion =
  | "solicitar_disponibilidad"
  | "planificar_visita"
  | "confirmar_revision"
  | "seguimiento_comercial"
  | "solicitar_documentacion"
  | "organizar_mantenimiento"
  | "entrega_recogida"
  | "renovacion"
  | "revision_prl"
  | "inspeccion"
  | "reunion"
  | "otro";

export type Prioridad = "alta" | "media" | "baja";
export type TipoDesplazamiento = "presencial" | "remoto" | "mixto";
export type AlcanceContactos = "todos" | "por_tipo" | "seleccion";

export interface HorarioPreferente {
  desde: string;
  hasta: string;
}

export interface Intencion {
  id: string;
  tipo: TipoIntencion;
  alcance: AlcanceContactos;
  tiposContacto: TipoContacto[];
  contactoIds: string[];
  duracionMin: number;
  prioridad: Prioridad;
  margenDias: number;
  horario: HorarioPreferente;
  tecnicoAsignado: string;
  comercialAsignado: string;
  frecuencia: string;
  tipoDesplazamiento: TipoDesplazamiento;
  notas: string;
  creadaEn: string;
  activa: boolean;
}

// ── Metadata de tipos ─────────────────────────────────────────────────

export interface IntencionDef {
  tipo: TipoIntencion;
  label: string;
  icon: string;
  color: string;
  desc: string;
  duracionDefecto: number;
  desplazamientoDefecto: TipoDesplazamiento;
}

export const INTENCIONES_DEF: IntencionDef[] = [
  { tipo: "planificar_visita",         label: "Planificar visita",         icon: "map-pin",        color: "#00ff88", desc: "Agendar visita presencial al cliente",         duracionDefecto: 60,  desplazamientoDefecto: "presencial" },
  { tipo: "solicitar_disponibilidad",  label: "Solicitar disponibilidad",  icon: "calendar",       color: "#3b82f6", desc: "Preguntar cuándo están disponibles",            duracionDefecto: 30,  desplazamientoDefecto: "remoto"     },
  { tipo: "confirmar_revision",        label: "Confirmar revisión",        icon: "check-circle",   color: "#8b5cf6", desc: "Validar que se realizó una revisión",           duracionDefecto: 20,  desplazamientoDefecto: "mixto"      },
  { tipo: "seguimiento_comercial",     label: "Seguimiento comercial",     icon: "trending-up",    color: "#f97316", desc: "Retomar contacto o propuesta comercial",        duracionDefecto: 45,  desplazamientoDefecto: "remoto"     },
  { tipo: "solicitar_documentacion",   label: "Solicitar documentación",   icon: "file-text",      color: "#f59e0b", desc: "Pedir documentos, contratos o archivos",        duracionDefecto: 15,  desplazamientoDefecto: "remoto"     },
  { tipo: "organizar_mantenimiento",   label: "Organizar mantenimiento",   icon: "tool",           color: "#ec4899", desc: "Coordinar mantenimiento técnico",               duracionDefecto: 90,  desplazamientoDefecto: "presencial" },
  { tipo: "entrega_recogida",          label: "Entrega / recogida",        icon: "package",        color: "#0891b2", desc: "Gestionar entrega o recogida de material",      duracionDefecto: 30,  desplazamientoDefecto: "presencial" },
  { tipo: "renovacion",                label: "Renovación",                icon: "refresh-cw",     color: "#6366f1", desc: "Renovar contrato, servicio o suscripción",      duracionDefecto: 30,  desplazamientoDefecto: "remoto"     },
  { tipo: "revision_prl",              label: "Revisión PRL",              icon: "shield",         color: "#ef4444", desc: "Inspección de prevención de riesgos",           duracionDefecto: 60,  desplazamientoDefecto: "presencial" },
  { tipo: "inspeccion",                label: "Inspección",                icon: "search",         color: "#10b981", desc: "Revisión técnica o de calidad",                 duracionDefecto: 60,  desplazamientoDefecto: "presencial" },
  { tipo: "reunion",                   label: "Reunión",                   icon: "users",          color: "#a78bfa", desc: "Reunión general con el contacto",               duracionDefecto: 60,  desplazamientoDefecto: "mixto"      },
  { tipo: "otro",                      label: "Otro",                      icon: "more-horizontal", color: "#6b7280", desc: "Intención personalizada",                      duracionDefecto: 30,  desplazamientoDefecto: "mixto"      },
];

export const INTENCION_MAP = Object.fromEntries(
  INTENCIONES_DEF.map((d) => [d.tipo, d])
) as Record<TipoIntencion, IntencionDef>;

export const PRIORIDAD_LABEL: Record<Prioridad, string> = {
  alta:  "Alta",
  media: "Media",
  baja:  "Baja",
};

export const PRIORIDAD_COLOR: Record<Prioridad, string> = {
  alta:  "#ef4444",
  media: "#f59e0b",
  baja:  "#6b7280",
};

export const DESPLAZAMIENTO_LABEL: Record<TipoDesplazamiento, string> = {
  presencial: "Presencial",
  remoto:     "Remoto",
  mixto:      "Mixto",
};

export const FRECUENCIA_OPTIONS = [
  "Única vez",
  "Semanal",
  "Quincenal",
  "Mensual",
  "Bimestral",
  "Trimestral",
  "Semestral",
  "Anual",
];

// ── Storage ───────────────────────────────────────────────────────────

const STORAGE_KEY = "go_intenciones_v1";

export async function loadIntenciones(): Promise<Intencion[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Intencion[]) : [];
  } catch {
    return [];
  }
}

export async function saveIntenciones(items: Intencion[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function crearIntencion(
  data: Omit<Intencion, "id" | "creadaEn" | "activa">
): Promise<Intencion> {
  const existing = await loadIntenciones();
  const nueva: Intencion = {
    ...data,
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    creadaEn: new Date().toISOString(),
    activa: true,
  };
  await saveIntenciones([nueva, ...existing]);
  return nueva;
}

export async function toggleIntencion(id: string): Promise<void> {
  const existing = await loadIntenciones();
  await saveIntenciones(
    existing.map((i) => (i.id === id ? { ...i, activa: !i.activa } : i))
  );
}

export async function deleteIntencion(id: string): Promise<void> {
  const existing = await loadIntenciones();
  await saveIntenciones(existing.filter((i) => i.id !== id));
}

// ── Helpers ───────────────────────────────────────────────────────────

export function defaultIntencion(tipo: TipoIntencion): Omit<Intencion, "id" | "creadaEn" | "activa"> {
  const def = INTENCION_MAP[tipo];
  return {
    tipo,
    alcance: "todos",
    tiposContacto: [],
    contactoIds: [],
    duracionMin: def.duracionDefecto,
    prioridad: "media",
    margenDias: 7,
    horario: { desde: "09:00", hasta: "18:00" },
    tecnicoAsignado: "",
    comercialAsignado: "",
    frecuencia: "Única vez",
    tipoDesplazamiento: def.desplazamientoDefecto,
    notas: "",
  };
}
