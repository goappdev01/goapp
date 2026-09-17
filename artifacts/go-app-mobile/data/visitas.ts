import AsyncStorage from "@react-native-async-storage/async-storage";

// ── Estado machine ─────────────────────────────────────────────────────

export type EstadoVisita =
  | "pendiente_confirmacion"
  | "confirmado"
  | "en_ruta"
  | "realizado"
  | "retrasado"
  | "cancelado"
  | "reprogramado";

export type MotivoCancel =
  | "cliente_cancela"
  | "cambio_fecha"
  | "incidencia"
  | "otro";

export interface VisitaConfirmada {
  id: string;
  contactoId: string;
  fecha: string;          // "2026-05-27"
  hora: string;           // "09:00"
  diaSemana: string;      // "Martes"
  duracionMin: number;
  asignado: string;
  estado: EstadoVisita;
  slotId: string;
  solicitudId: string;
  agendaId: string | null;
  emailConfirmacionEnviado: boolean;
  recordatorioActivado: boolean;
  notas: string;
  motivoCancelacion: MotivoCancel | null;
  creadaEn: string;
  actualizadaEn: string;
  goLogId: string | null;   // reference into go_log_v1
}

// ── Storage ────────────────────────────────────────────────────────────

const KEY = "go_visitas_v1";

export async function loadVisitas(): Promise<VisitaConfirmada[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as VisitaConfirmada[]) : [];
  } catch {
    return [];
  }
}

async function persist(items: VisitaConfirmada[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function crearVisita(
  data: Omit<VisitaConfirmada, "id" | "creadaEn" | "actualizadaEn">
): Promise<VisitaConfirmada> {
  const items = await loadVisitas();
  const now = new Date().toISOString();
  const visita: VisitaConfirmada = {
    ...data,
    id: `vis_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    creadaEn: now,
    actualizadaEn: now,
  };
  // upsert by slotId + contactoId to avoid duplicates
  const idx = items.findIndex(
    (v) => v.slotId === data.slotId && v.contactoId === data.contactoId
  );
  if (idx >= 0) {
    items[idx] = visita;
  } else {
    items.unshift(visita);
  }
  await persist(items);
  return visita;
}

export async function actualizarEstado(
  id: string,
  estado: EstadoVisita,
  extra?: Partial<VisitaConfirmada>
): Promise<void> {
  const items = await loadVisitas();
  await persist(
    items.map((v) =>
      v.id === id
        ? { ...v, ...extra, estado, actualizadaEn: new Date().toISOString() }
        : v
    )
  );
}

export async function marcarEmailEnviado(id: string): Promise<void> {
  await actualizarEstado(id, undefined as any, { emailConfirmacionEnviado: true } as any);
  const items = await loadVisitas();
  await persist(items.map((v) => (v.id === id ? { ...v, emailConfirmacionEnviado: true } : v)));
}

export async function actualizarGoLogId(id: string, goLogId: string): Promise<void> {
  const items = await loadVisitas();
  await persist(items.map((v) => (v.id === id ? { ...v, goLogId } : v)));
}

export async function deleteVisita(id: string): Promise<void> {
  const items = await loadVisitas();
  await persist(items.filter((v) => v.id !== id));
}

// ── State machine helpers ──────────────────────────────────────────────

export const ESTADO_VISITA_LABEL: Record<EstadoVisita, string> = {
  pendiente_confirmacion: "Pendiente",
  confirmado:             "Confirmado",
  en_ruta:                "En ruta",
  realizado:              "Realizado",
  retrasado:              "Retrasado",
  cancelado:              "Cancelado",
  reprogramado:           "Reprogramado",
};

export const ESTADO_VISITA_COLOR: Record<EstadoVisita, string> = {
  pendiente_confirmacion: "#6b7280",
  confirmado:             "#3b82f6",
  en_ruta:                "#00ff88",
  realizado:              "#22c55e",
  retrasado:              "#f59e0b",
  cancelado:              "#ef4444",
  reprogramado:           "#a78bfa",
};

export const ESTADO_VISITA_ICON: Record<EstadoVisita, string> = {
  pendiente_confirmacion: "clock",
  confirmado:             "check-circle",
  en_ruta:                "navigation",
  realizado:              "check-square",
  retrasado:              "alert-triangle",
  cancelado:              "x-circle",
  reprogramado:           "refresh-cw",
};

export type AccionVisita =
  | "enviar_confirmacion"
  | "confirmar"
  | "iniciar_ruta"
  | "marcar_realizado"
  | "marcar_retrasado"
  | "cancelar"
  | "reprogramar";

export function getAccionesDisponibles(estado: EstadoVisita): AccionVisita[] {
  switch (estado) {
    case "pendiente_confirmacion":
      return ["enviar_confirmacion", "confirmar", "cancelar"];
    case "confirmado":
      return ["enviar_confirmacion", "iniciar_ruta", "cancelar", "reprogramar"];
    case "en_ruta":
      return ["marcar_realizado", "marcar_retrasado", "cancelar"];
    case "retrasado":
      return ["marcar_realizado", "cancelar", "reprogramar"];
    case "realizado":
      return [];
    case "cancelado":
      return ["reprogramar"];
    case "reprogramado":
      return ["confirmar", "cancelar"];
    default:
      return [];
  }
}

export const ACCION_LABEL: Record<AccionVisita, string> = {
  enviar_confirmacion: "Enviar confirmación",
  confirmar:           "Confirmar",
  iniciar_ruta:        "Iniciar ruta",
  marcar_realizado:    "Marcar realizado",
  marcar_retrasado:    "Marcar retrasado",
  cancelar:            "Cancelar visita",
  reprogramar:         "Reprogramar",
};

export const ACCION_COLOR: Record<AccionVisita, string> = {
  enviar_confirmacion: "#3b82f6",
  confirmar:           "#00ff88",
  iniciar_ruta:        "#00ff88",
  marcar_realizado:    "#22c55e",
  marcar_retrasado:    "#f59e0b",
  cancelar:            "#ef4444",
  reprogramar:         "#a78bfa",
};

// ── Today helper ───────────────────────────────────────────────────────

export function getToday(): string {
  return new Date().toISOString().split("T")[0];
}

export function isToday(fecha: string): boolean {
  return fecha === getToday();
}

export function isFuture(fecha: string): boolean {
  return fecha >= getToday();
}

export function formatFechaVisita(fecha: string): string {
  try {
    return new Date(fecha + "T12:00:00").toLocaleDateString("es-ES", {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return fecha;
  }
}
