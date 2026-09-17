/**
 * goQualityData.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Sistema de Control de Calidad Interno GO
 *
 * FILOSOFÍA
 * ─────────────────────────────────────────────────────────────────────────────
 * GO no valora si la pizza estaba rica o no.
 * GO detecta si el usuario fue tratado correctamente.
 *
 * Los datos son internos — nunca se muestran como reseñas públicas.
 * Se usan para detectar proveedores problemáticos y proteger al usuario.
 *
 * ESTRUCTURA FUTURA
 * ─────────────────────────────────────────────────────────────────────────────
 * Con suficientes reportes GO puede:
 *   · reducir visibilidad de proveedores con muchas incidencias
 *   · marcar proveedor para revisión interna
 *   · solicitar explicación al proveedor
 *   · bloquear temporalmente si el abuso es reiterado
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ── STORAGE KEY ────────────────────────────────────────────────────────────────

const QUALITY_STORAGE_KEY = "go_quality_reports_v1";

// ── TYPES ─────────────────────────────────────────────────────────────────────

export type QualityResult = "ok" | "problem";

export type QualityProblemCause =
  | "no_se_presento"
  | "cancelo_tarde"
  | "retraso_importante"
  | "mala_atencion"
  | "producto_incorrecto"
  | "servicio_incorrecto"
  | "precio_distinto"
  | "problema_entrega"
  | "otro";

export type GoQualityReport = {
  /** ID único del reporte */
  id: string;
  /** ID del pedido/reserva evaluado */
  pedidoId: string;
  /** Nombre del proveedor (para análisis interno) */
  proveedor?: string;
  /** ID del negocio si disponible (para análisis futuro) */
  businessId?: string;
  /** Resultado: ok = todo bien; problem = hubo incidencia */
  result: QualityResult;
  /** Causas seleccionadas (solo si result = "problem") */
  causes?: QualityProblemCause[];
  /** Comentario libre opcional */
  comment?: string;
  /** Timestamp Unix ms */
  timestamp: number;
};

// ── CAUSA LABELS — para UI ─────────────────────────────────────────────────────

export const QUALITY_CAUSE_LABELS: Record<QualityProblemCause, string> = {
  no_se_presento:     "No se presentó",
  cancelo_tarde:      "Canceló tarde",
  retraso_importante: "Retraso importante",
  mala_atencion:      "Mala atención",
  producto_incorrecto: "Producto incorrecto",
  servicio_incorrecto: "Servicio incorrecto",
  precio_distinto:    "Precio distinto al esperado",
  problema_entrega:   "Problema con la entrega",
  otro:               "Otro",
};

export const QUALITY_CAUSE_LIST: QualityProblemCause[] = [
  "no_se_presento",
  "cancelo_tarde",
  "retraso_importante",
  "mala_atencion",
  "producto_incorrecto",
  "servicio_incorrecto",
  "precio_distinto",
  "problema_entrega",
  "otro",
];

// ── STORAGE FUNCTIONS ──────────────────────────────────────────────────────────

export async function loadQualityReports(): Promise<GoQualityReport[]> {
  try {
    const raw = await AsyncStorage.getItem(QUALITY_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as GoQualityReport[];
  } catch {
    return [];
  }
}

export async function saveQualityReport(report: GoQualityReport): Promise<void> {
  try {
    const existing = await loadQualityReports();
    // Evitar duplicados por pedidoId — un pedido, un reporte
    const filtered = existing.filter((r) => r.pedidoId !== report.pedidoId);
    const next = [report, ...filtered].slice(0, 1000);
    await AsyncStorage.setItem(QUALITY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // silencioso — no bloquear la app por fallos de storage
  }
}

/** Devuelve true si ya existe un reporte para este pedidoId */
export async function hasQualityReport(pedidoId: string): Promise<boolean> {
  const reports = await loadQualityReports();
  return reports.some((r) => r.pedidoId === pedidoId);
}

// ── ANÁLISIS INTERNO (preparado para uso futuro) ───────────────────────────────

export type ProviderQualityStats = {
  proveedor: string;
  total: number;
  ok: number;
  problems: number;
  /** Tasa de incidencias 0-1 */
  problemRate: number;
  /** Causas más frecuentes */
  topCauses: QualityProblemCause[];
  /** Flag: requiere revisión interna */
  flaggedForReview: boolean;
};

/**
 * Genera estadísticas internas por proveedor.
 * Uso: panel de administración GO (futuro).
 * Un proveedor se marca para revisión si:
 *   · problemRate > 0.3 con al menos 5 reportes, O
 *   · tiene 3 o más reportes de "no_se_presento" o "mala_atencion"
 */
export function computeProviderStats(reports: GoQualityReport[]): ProviderQualityStats[] {
  const byProvider = new Map<string, GoQualityReport[]>();

  for (const r of reports) {
    const key = r.proveedor ?? "desconocido";
    const arr = byProvider.get(key) ?? [];
    arr.push(r);
    byProvider.set(key, arr);
  }

  const result: ProviderQualityStats[] = [];

  for (const [proveedor, items] of byProvider.entries()) {
    const total    = items.length;
    const problems = items.filter((r) => r.result === "problem").length;
    const ok       = total - problems;
    const problemRate = total > 0 ? problems / total : 0;

    // Conteo de causas
    const causeCount = new Map<QualityProblemCause, number>();
    for (const r of items) {
      for (const c of r.causes ?? []) {
        causeCount.set(c, (causeCount.get(c) ?? 0) + 1);
      }
    }
    const topCauses = [...causeCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([cause]) => cause);

    // Flag para revisión
    const seriousCauses = (causeCount.get("no_se_presento") ?? 0) + (causeCount.get("mala_atencion") ?? 0);
    const flaggedForReview =
      (total >= 5 && problemRate > 0.3) ||
      seriousCauses >= 3;

    result.push({ proveedor, total, ok, problems, problemRate, topCauses, flaggedForReview });
  }

  return result.sort((a, b) => b.problemRate - a.problemRate);
}
