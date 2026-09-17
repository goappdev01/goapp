import AsyncStorage from "@react-native-async-storage/async-storage";
import type { ResultadoOptimizacion, OptimizerParams } from "@/lib/optimizador";

// ── Tipos ──────────────────────────────────────────────────────────────

export type EstadoAgenda = "provisional" | "confirmada" | "archivada";

export interface AgendaGuardada {
  id: string;
  nombre: string;
  estado: EstadoAgenda;
  resultado: ResultadoOptimizacion;
  solicitudIds: string[];  // source solicituds
  creadaEn: string;
  confirmadaEn: string | null;
}

// ── Storage ────────────────────────────────────────────────────────────

const KEY = "go_agenda_v1";

export async function loadAgendas(): Promise<AgendaGuardada[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as AgendaGuardada[]) : [];
  } catch {
    return [];
  }
}

async function persist(items: AgendaGuardada[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(items));
}

export async function guardarAgenda(
  data: Omit<AgendaGuardada, "id" | "creadaEn">
): Promise<AgendaGuardada> {
  const items = await loadAgendas();
  const item: AgendaGuardada = {
    ...data,
    id: `agenda_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    creadaEn: new Date().toISOString(),
  };
  await persist([item, ...items]);
  return item;
}

export async function confirmarAgenda(id: string): Promise<void> {
  const items = await loadAgendas();
  await persist(
    items.map((a) =>
      a.id === id
        ? { ...a, estado: "confirmada" as EstadoAgenda, confirmadaEn: new Date().toISOString() }
        : a
    )
  );
}

export async function archivarAgenda(id: string): Promise<void> {
  const items = await loadAgendas();
  await persist(items.map((a) => (a.id === id ? { ...a, estado: "archivada" as EstadoAgenda } : a)));
}

export async function deleteAgenda(id: string): Promise<void> {
  const items = await loadAgendas();
  await persist(items.filter((a) => a.id !== id));
}
