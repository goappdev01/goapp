/**
 * clientCalendar.ts
 * Calendario personal del cliente — fuente de sus intervalos ocupados.
 *
 * Combina tres fuentes:
 *   1. Reservas confirmadas/hold del cliente en go_bookings_v1 (como customer)
 *   2. Entradas GO_BOOKING en go_log_v1 (kind="received") — misma fuente
 *      que _checkProposalOverlap; garantiza que cualquier reserva confirmada
 *      en el goLog bloquea el slot aunque go_bookings_v1 tenga desajustes.
 *   3. Bloques manuales ("estoy ocupado 10:00–12:00")
 *
 * El resultado se pasa a crossCalendars() para obtener huecos compatibles
 * con el proveedor. No crea un sistema separado — alimenta el motor único.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBookings, BLOCKING_STATUSES, type ClientBusyInterval } from "./booking";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type ClientBusySource = "manual" | "booking" | "go_entry";

export type ClientBusyBlock = {
  id: string;
  ownerId: string;       // customerId o "local_user"
  startISO: string;      // ISO completo
  endISO: string;        // ISO completo
  label?: string;        // "Reunión", "Médico", etc.
  source: ClientBusySource;
};

// ── Storage ───────────────────────────────────────────────────────────────────

const KEY = "go_client_busy_v1";

async function loadBlocks(): Promise<ClientBusyBlock[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ClientBusyBlock[]) : [];
  } catch {
    return [];
  }
}

async function saveBlocks(blocks: ClientBusyBlock[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(blocks));
}

function uid(): string {
  return `cb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── CRUD de bloques manuales ──────────────────────────────────────────────────

export async function addClientBusyBlock(
  data: Omit<ClientBusyBlock, "id" | "source">,
): Promise<ClientBusyBlock> {
  const block: ClientBusyBlock = { ...data, id: uid(), source: "manual" };
  const all = await loadBlocks();
  all.push(block);
  await saveBlocks(all);
  return block;
}

export async function removeClientBusyBlock(id: string): Promise<void> {
  const all = await loadBlocks();
  await saveBlocks(all.filter((b) => b.id !== id));
}

export async function getClientBusyBlocksForDate(
  ownerId: string,
  dateISO: string,
): Promise<ClientBusyBlock[]> {
  const all = await loadBlocks();
  return all.filter((b) => b.ownerId === ownerId && b.startISO.startsWith(dateISO));
}

// ── Motor de cruce: recopilación de intervalos ocupados del cliente ────────────
//
// Devuelve ClientBusyInterval[] listo para pasar a crossCalendars().
// Incluye TODAS las fuentes:
//   • Reservas confirmadas y en hold (él como cliente)
//   • Bloques manuales ("indisponible 10:00–11:00")
//
// Extensible: en el futuro añadir eventos de GO log, reuniones, etc.

// ── Fuente 2: go_log_v1 — entradas GO_BOOKING del cliente (kind="received") ────
//
// Las reservas confirmadas por el cliente se graban en go_log_v1 como entradas
// con type="GO_BOOKING" y kind="received" (go_booking_cli_*).
// Esta función las lee directamente (sin pasar por go_bookings_v1) para ofrecer
// un segundo vector de bloqueo robusto frente a desajustes de staffId u otros
// problemas de sincronización. Usa la MISMA regla de estados que _checkProposalOverlap:
//   NO bloquear: rechazado | cancelado | propuesto
//   SÍ bloquear: aceptado | pendiente | propuesta_pendiente | cualquier otro

async function _getGoLogClientBusy(
  dateISO: string,
): Promise<ClientBusyInterval[]> {
  try {
    const raw = await AsyncStorage.getItem("go_log_v1");
    if (!raw) return [];
    const entries: Array<{
      type?:     string;
      kind?:     string;
      dateISO?:  string;
      time?:     string;
      duration?: string;
      deleted?:  boolean;
      estado?:   string;
    }> = JSON.parse(raw);

    const result: ClientBusyInterval[] = [];
    for (const e of entries) {
      // Sin filtro de type ni kind — misma lógica que _checkProposalOverlap:
      // cualquier entrada en go_log_v1 del mismo día bloquea si su estado no es excluido.
      if (e.dateISO !== dateISO) continue;
      if (e.deleted) continue;
      // misma regla que _checkProposalOverlap
      if (e.estado === "rechazado" || e.estado === "cancelado" || e.estado === "propuesto") continue;
      if (!e.time || typeof e.time !== "string") continue;

      const parts    = e.time.split(":");
      const h        = parseInt(parts[0] ?? "0", 10);
      const m        = parseInt(parts[1] ?? "0", 10);
      const startMin = h * 60 + m;
      const durMatch = (e.duration ?? "").match(/^(\d+)min$/);
      const durMin   = durMatch ? parseInt(durMatch[1], 10) : 60;
      const endMin   = startMin + durMin;
      const startISO = `${dateISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`;
      const endISO   = `${dateISO}T${String(Math.floor(endMin/60)).padStart(2,"0")}:${String(endMin%60).padStart(2,"0")}:00`;
      result.push({ start: startISO, end: endISO, reason: "Reserva GO confirmada" });
    }
    return result;
  } catch {
    return [];
  }
}

export async function getClientBusyIntervals(
  customerId: string,
  dateISO: string,
): Promise<ClientBusyInterval[]> {
  const [bookings, manualBlocks, fromGoLog] = await Promise.all([
    getBookings({ customerId, status: BLOCKING_STATUSES }),
    getClientBusyBlocksForDate(customerId, dateISO),
    _getGoLogClientBusy(dateISO),
  ]);

  const fromBookings: ClientBusyInterval[] = bookings
    .filter((b) => b.startDatetime.startsWith(dateISO))
    .map((b) => ({
      start:  b.startDatetime,
      end:    b.endDatetime,
      reason: "Reserva confirmada",
    }));

  const fromBlocks: ClientBusyInterval[] = manualBlocks.map((b) => ({
    start:  b.startISO,
    end:    b.endISO,
    reason: b.label ?? "Ocupado",
  }));

  return [...fromBookings, ...fromGoLog, ...fromBlocks];
}
