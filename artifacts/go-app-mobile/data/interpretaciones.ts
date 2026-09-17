import AsyncStorage from "@react-native-async-storage/async-storage";
import type { EstadoCompatibilidad, ParseResult } from "@/lib/interpretador";
import type { SlotOpcion } from "./disponibilidad";

export type { EstadoCompatibilidad };

// ── Tipos ─────────────────────────────────────────────────────────────

export interface InterpretacionItem {
  id: string;
  solicitudId: string;
  contactoId: string;
  textoRespuesta: string;
  parseResult: ParseResult;
  estadoFinal: EstadoCompatibilidad;
  slotsAceptadosManual: string[] | null;  // user override
  interpretadoEn: string;
  confirmadoPorUsuario: boolean;
}

export interface AgendaProvisionalItem {
  slotId: string;
  slot: SlotOpcion;
  contactoIds: string[];   // contacts compatible with this slot
  solicitudId: string;
}

// ── Storage ───────────────────────────────────────────────────────────

const KEY_INTERPRETACIONES = "go_interpretaciones_v1";

export async function loadInterpretaciones(): Promise<InterpretacionItem[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY_INTERPRETACIONES);
    return raw ? (JSON.parse(raw) as InterpretacionItem[]) : [];
  } catch {
    return [];
  }
}

async function persistInterpretaciones(items: InterpretacionItem[]): Promise<void> {
  await AsyncStorage.setItem(KEY_INTERPRETACIONES, JSON.stringify(items));
}

export async function guardarInterpretacion(
  data: Omit<InterpretacionItem, "id" | "interpretadoEn">
): Promise<InterpretacionItem> {
  const existing = await loadInterpretaciones();
  const item: InterpretacionItem = {
    ...data,
    id: `int_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    interpretadoEn: new Date().toISOString(),
  };
  // upsert by solicitudId + contactoId
  const idx = existing.findIndex(
    (i) => i.solicitudId === data.solicitudId && i.contactoId === data.contactoId
  );
  if (idx >= 0) {
    existing[idx] = item;
    await persistInterpretaciones(existing);
  } else {
    await persistInterpretaciones([item, ...existing]);
  }
  return item;
}

export async function confirmarInterpretacion(id: string, slotsManual?: string[]): Promise<void> {
  const existing = await loadInterpretaciones();
  await persistInterpretaciones(
    existing.map((i) =>
      i.id === id
        ? {
            ...i,
            confirmadoPorUsuario: true,
            slotsAceptadosManual: slotsManual ?? null,
            estadoFinal: slotsManual && slotsManual.length >= 2 ? "compatible"
              : slotsManual && slotsManual.length === 1 ? "parcialmente_compatible"
              : i.estadoFinal,
          }
        : i
    )
  );
}

export async function deleteInterpretacion(id: string): Promise<void> {
  const existing = await loadInterpretaciones();
  await persistInterpretaciones(existing.filter((i) => i.id !== id));
}

// ── Agenda provisional builder ────────────────────────────────────────

export function buildAgendaProvisional(
  interpretaciones: InterpretacionItem[],
  solicitudId: string,
  slotsOfrecidos: SlotOpcion[]
): AgendaProvisionalItem[] {
  const confirmed = interpretaciones.filter(
    (i) => i.solicitudId === solicitudId && i.confirmadoPorUsuario
  );

  const slotMap: Record<string, AgendaProvisionalItem> = {};

  for (const item of confirmed) {
    const slotIds = item.slotsAceptadosManual ?? item.parseResult.slotsAceptados;
    for (const slotId of slotIds) {
      const slot = slotsOfrecidos.find((s) => s.id === slotId);
      if (!slot) continue;
      if (!slotMap[slotId]) {
        slotMap[slotId] = { slotId, slot, contactoIds: [], solicitudId };
      }
      if (!slotMap[slotId].contactoIds.includes(item.contactoId)) {
        slotMap[slotId].contactoIds.push(item.contactoId);
      }
    }
  }

  return Object.values(slotMap).sort((a, b) => {
    if (a.slot.fecha !== b.slot.fecha) return a.slot.fecha < b.slot.fecha ? -1 : 1;
    return a.slot.hora < b.slot.hora ? -1 : 1;
  });
}

// ── Status metadata ───────────────────────────────────────────────────

export const ESTADO_COMPAT_LABEL: Record<EstadoCompatibilidad, string> = {
  compatible:             "Compatible",
  parcialmente_compatible:"Parcial",
  rechazado:              "Rechazado",
  revision_manual:        "Revisar",
  pendiente:              "Pendiente",
};

export const ESTADO_COMPAT_COLOR: Record<EstadoCompatibilidad, string> = {
  compatible:             "#00ff88",
  parcialmente_compatible:"#f59e0b",
  rechazado:              "#ef4444",
  revision_manual:        "#a78bfa",
  pendiente:              "#6b7280",
};
