import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Contacto } from "./contactos";
import type { Intencion } from "./intenciones";
import { INTENCION_MAP } from "./intenciones";

// ── Tipos ─────────────────────────────────────────────────────────────

export interface SlotOpcion {
  id: string;
  fecha: string;    // "2026-05-27"
  hora: string;     // "09:00"
  diaSemana: string; // "Martes"
}

export type EstadoSolicitud =
  | "borrador"
  | "enviada"
  | "con_respuesta"
  | "confirmada";

export interface RespuestaContacto {
  contactoId: string;
  slotIds: string[];
  notaRespuesta: string;
  recibidaEn: string;
}

export interface SolicitudDisponibilidad {
  id: string;
  intencionId: string | null;
  contactoIds: string[];
  slots: SlotOpcion[];
  asunto: string;
  cuerpoTemplate: string;
  estado: EstadoSolicitud;
  respuestas: RespuestaContacto[];
  creadaEn: string;
  enviadaEn: string | null;
}

// ── Storage ───────────────────────────────────────────────────────────

const STORAGE_KEY = "go_disponibilidad_v1";

export async function loadSolicitudes(): Promise<SolicitudDisponibilidad[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SolicitudDisponibilidad[]) : [];
  } catch {
    return [];
  }
}

async function persistSolicitudes(items: SolicitudDisponibilidad[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function crearSolicitud(
  data: Omit<SolicitudDisponibilidad, "id" | "creadaEn" | "enviadaEn" | "respuestas" | "estado">
): Promise<SolicitudDisponibilidad> {
  const existing = await loadSolicitudes();
  const nueva: SolicitudDisponibilidad = {
    ...data,
    id: `sol_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    estado: "borrador",
    respuestas: [],
    creadaEn: new Date().toISOString(),
    enviadaEn: null,
  };
  await persistSolicitudes([nueva, ...existing]);
  return nueva;
}

export async function marcarEnviada(id: string): Promise<void> {
  const existing = await loadSolicitudes();
  await persistSolicitudes(
    existing.map((s) =>
      s.id === id ? { ...s, estado: "enviada" as EstadoSolicitud, enviadaEn: new Date().toISOString() } : s
    )
  );
}

export async function registrarRespuesta(
  solicitudId: string,
  respuesta: RespuestaContacto
): Promise<void> {
  const existing = await loadSolicitudes();
  await persistSolicitudes(
    existing.map((s) => {
      if (s.id !== solicitudId) return s;
      const respuestas = [...s.respuestas.filter((r) => r.contactoId !== respuesta.contactoId), respuesta];
      const estado: EstadoSolicitud = respuestas.length >= s.contactoIds.length ? "con_respuesta" : s.estado;
      return { ...s, respuestas, estado };
    })
  );
}

export async function deleteSolicitud(id: string): Promise<void> {
  const existing = await loadSolicitudes();
  await persistSolicitudes(existing.filter((s) => s.id !== id));
}

// ── Slot generator ────────────────────────────────────────────────────

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

function pad(n: number) { return String(n).padStart(2, "0"); }

function isoFecha(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parsearHora(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm ?? 0);
}

function minutosAHora(m: number) {
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
}

export function generarSlots(opts: {
  fechaInicio: Date;
  margenDias: number;
  horarioDesde: string;
  horarioHasta: string;
  duracionMin: number;
  slotsPerDay?: number;
}): SlotOpcion[] {
  const { fechaInicio, margenDias, horarioDesde, horarioHasta, duracionMin, slotsPerDay = 3 } = opts;
  const slots: SlotOpcion[] = [];
  const inicioMin = parsearHora(horarioDesde);
  const finMin = parsearHora(horarioHasta);
  const rango = finMin - inicioMin;
  if (rango <= 0) return [];

  for (let d = 1; d <= margenDias; d++) {
    const fecha = new Date(fechaInicio);
    fecha.setDate(fecha.getDate() + d);
    const dow = fecha.getDay();
    if (dow === 0 || dow === 6) continue; // skip weekends

    const step = Math.floor(rango / (slotsPerDay + 1));
    for (let i = 1; i <= slotsPerDay; i++) {
      const minutos = inicioMin + step * i;
      if (minutos >= finMin) break;
      slots.push({
        id: `slot_${isoFecha(fecha)}_${minutosAHora(minutos)}`,
        fecha: isoFecha(fecha),
        hora: minutosAHora(minutos),
        diaSemana: DIAS[dow].charAt(0).toUpperCase() + DIAS[dow].slice(1),
      });
    }
  }
  return slots;
}

// ── Email template generator ──────────────────────────────────────────

export function formatSlotLabel(slot: SlotOpcion): string {
  const [year, month, day] = slot.fecha.split("-").map(Number);
  const d = new Date(year, month - 1, day);
  return `${DIAS_CORTO[d.getDay()]} ${day}/${pad(month)} · ${slot.hora}`;
}

export function generarAsunto(intencion: Intencion | null, contacto: Contacto): string {
  const tipo = intencion ? INTENCION_MAP[intencion.tipo].label : "Visita";
  return `${tipo} — Solicitud de disponibilidad · ${contacto.empresa || contacto.responsable}`;
}

export function generarCuerpo(opts: {
  contacto: Contacto;
  intencion: Intencion | null;
  slots: SlotOpcion[];
  firmante?: string;
}): string {
  const { contacto, intencion, slots, firmante = "El equipo de GO" } = opts;
  const responsable = contacto.responsable || contacto.empresa || "cliente";
  const empresa = contacto.empresa || "";
  const tipoVisita = intencion ? INTENCION_MAP[intencion.tipo].label.toLowerCase() : "visita";
  const duracion = intencion ? `${intencion.duracionMin} minutos` : "aproximadamente 1 hora";
  const tecnico = intencion?.tecnicoAsignado || "";
  const slotLines = slots
    .map((s, i) => `  • Opción ${i + 1} — ${formatSlotLabel(s)}`)
    .join("\n");

  return [
    `Estimado/a ${responsable},`,
    "",
    `Me pongo en contacto desde nuestra empresa para coordinar ${tipoVisita}${empresa ? ` con ${empresa}` : ""}.`,
    "",
    `La duración estimada es de ${duracion}${tecnico ? ` y será atendida por ${tecnico}` : ""}.`,
    "",
    "Por favor, indíquenos cuáles de las siguientes opciones le vienen bien (mínimo 2):",
    "",
    slotLines,
    "",
    "Puede responder directamente a este correo indicando las opciones que le vienen mejor. Nosotros confirmaremos la fecha definitiva teniendo en cuenta su disponibilidad y nuestra planificación de ruta.",
    "",
    "Muchas gracias por su colaboración.",
    "",
    `Un saludo,`,
    firmante,
  ].join("\n");
}

// ── Status helpers ────────────────────────────────────────────────────

export const ESTADO_LABEL: Record<EstadoSolicitud, string> = {
  borrador:      "Borrador",
  enviada:       "Enviada",
  con_respuesta: "Con respuesta",
  confirmada:    "Confirmada",
};

export const ESTADO_COLOR: Record<EstadoSolicitud, string> = {
  borrador:      "#6b7280",
  enviada:       "#3b82f6",
  con_respuesta: "#f59e0b",
  confirmada:    "#00ff88",
};
