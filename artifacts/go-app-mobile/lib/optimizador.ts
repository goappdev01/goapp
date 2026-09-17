/**
 * GO Route Optimizer — FASE 5
 * Greedy zone-clustering algorithm with nearest-neighbor ordering.
 * No external API needed. Runs fully client-side.
 */

import type { Contacto } from "@/data/contactos";
import type { SlotOpcion } from "@/data/disponibilidad";

// ── Tipos ──────────────────────────────────────────────────────────────

export interface CandidatoVisita {
  contactoId: string;
  contacto: Contacto;
  slotsCompatibles: SlotOpcion[];   // all slots the contact accepted
  duracionMin: number;               // visit duration in minutes
  prioridad: number;                 // 3=alta 2=media 1=baja
  urgente: boolean;
  necesitaLlamada: boolean;
  asignado: string;                  // technician/commercial name
}

export type TipoDesplazamiento = "mismo_lugar" | "misma_ciudad" | "provincia" | "otro";

export interface Desplazamiento {
  km: number;
  minutos: number;
  tipo: TipoDesplazamiento;
}

export interface VisitaRuta {
  contactoId: string;
  slot: SlotOpcion;
  duracionMin: number;
  ordenEnDia: number;
  asignado: string;
  desplazamientoDesdeAnterior: Desplazamiento | null;
}

export interface DiaRuta {
  fecha: string;       // "2026-05-27"
  diaSemana: string;  // "Martes"
  visitas: VisitaRuta[];
  ciudades: string[];  // unique cities this day
  totalKm: number;
  totalMinViaje: number;
  totalMinVisitas: number;
  eficienciaZona: number; // 0–100
}

export interface OptimizerParams {
  maxVisitasPorDia: number;
  inicioJornada: string;   // "09:00"
  finJornada: string;      // "18:00"
  margenEntreVisitasMin: number;
  prioritizeZones: boolean;
}

export const DEFAULT_PARAMS: OptimizerParams = {
  maxVisitasPorDia: 6,
  inicioJornada: "09:00",
  finJornada: "18:00",
  margenEntreVisitasMin: 15,
  prioritizeZones: true,
};

export interface ResultadoOptimizacion {
  dias: DiaRuta[];
  totalVisitas: number;
  totalKm: number;
  totalMinViaje: number;
  eficienciaGlobal: number;  // 0–100
  sinAsignar: CandidatoVisita[];
  generadaEn: string;
  params: OptimizerParams;
}

// ── Helpers ────────────────────────────────────────────────────────────

function norm(s: string): string {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function horaToMin(h: string): number {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + (mm || 0);
}

// ── Distance estimation ────────────────────────────────────────────────

export function distanciaEstimada(a: Contacto, b: Contacto): Desplazamiento {
  const cidA = norm(a.ciudad);
  const cidB = norm(b.ciudad);
  const provA = norm(a.provincia);
  const provB = norm(b.provincia);

  if (!cidA || !cidB) return { km: 30, minutos: 35, tipo: "otro" };
  if (cidA === cidB) return { km: 8, minutos: 15, tipo: "misma_ciudad" };
  if (provA && provB && provA === provB) return { km: 38, minutos: 42, tipo: "provincia" };
  return { km: 92, minutos: 85, tipo: "otro" };
}

function distanciaFromBase(c: Contacto): Desplazamiento {
  // first visit of the day — assume 20 min from base/home
  return { km: 20, minutos: 20, tipo: "otro" };
}

// ── Zone score: how well does a candidate fit an existing day ──────────

function zonaScore(
  candidato: CandidatoVisita,
  visitasEnDia: string[], // contactoIds already in that day
  contactoMap: Map<string, Contacto>
): number {
  if (visitasEnDia.length === 0) return 0;
  const cid = norm(candidato.contacto.ciudad);
  const prov = norm(candidato.contacto.provincia);
  let score = 0;
  for (const id of visitasEnDia) {
    const c = contactoMap.get(id);
    if (!c) continue;
    if (norm(c.ciudad) === cid && cid) score += 10;
    else if (norm(c.provincia) === prov && prov) score += 3;
  }
  return score;
}

// ── Nearest-neighbor sort within a day ────────────────────────────────

function sortVisitasByZone(
  visitas: Array<{ contactoId: string; slot: SlotOpcion; duracionMin: number; asignado: string }>,
  contactoMap: Map<string, Contacto>
): typeof visitas {
  if (visitas.length <= 1) return visitas;

  // Group by city first, then sort groups by slot time
  const byCiudad = new Map<string, typeof visitas>();
  for (const v of visitas) {
    const c = contactoMap.get(v.contactoId);
    const cid = norm(c?.ciudad || "");
    if (!byCiudad.has(cid)) byCiudad.set(cid, []);
    byCiudad.get(cid)!.push(v);
  }

  // Sort each city group by hora
  for (const group of byCiudad.values()) {
    group.sort((a, b) => horaToMin(a.slot.hora) - horaToMin(b.slot.hora));
  }

  // Sort city groups by the earliest slot in each group
  const groups = [...byCiudad.entries()].sort(([, ga], [, gb]) => {
    const minA = Math.min(...ga.map((v) => horaToMin(v.slot.hora)));
    const minB = Math.min(...gb.map((v) => horaToMin(v.slot.hora)));
    return minA - minB;
  });

  return groups.flatMap(([, g]) => g);
}

// ── Main optimizer ─────────────────────────────────────────────────────

export function optimizarRuta(
  candidatos: CandidatoVisita[],
  params: OptimizerParams = DEFAULT_PARAMS
): ResultadoOptimizacion {
  const contactoMap = new Map(candidatos.map((c) => [c.contactoId, c.contacto]));

  // Sort candidates: urgente → most constrained (fewest slots) → highest prioridad
  const sorted = [...candidatos].sort((a, b) => {
    if (a.urgente !== b.urgente) return a.urgente ? -1 : 1;
    if (a.slotsCompatibles.length !== b.slotsCompatibles.length)
      return a.slotsCompatibles.length - b.slotsCompatibles.length;
    return b.prioridad - a.prioridad;
  });

  // Day buckets: fecha → list of assigned (contactoId, slot, duracionMin, asignado)
  const diasMap = new Map<string, Array<{ contactoId: string; slot: SlotOpcion; duracionMin: number; asignado: string }>>();
  const sinAsignar: CandidatoVisita[] = [];

  for (const candidato of sorted) {
    if (candidato.slotsCompatibles.length === 0) {
      sinAsignar.push(candidato);
      continue;
    }

    let bestFecha: string | null = null;
    let bestSlot: SlotOpcion | null = null;
    let bestScore = -Infinity;

    for (const slot of candidato.slotsCompatibles) {
      const dia = diasMap.get(slot.fecha) || [];
      if (dia.length >= params.maxVisitasPorDia) continue;

      // Check time feasibility
      const slotMin = horaToMin(slot.hora);
      const inicioMin = horaToMin(params.inicioJornada);
      const finMin = horaToMin(params.finJornada);
      if (slotMin < inicioMin || slotMin + candidato.duracionMin > finMin) continue;

      const zScore = params.prioritizeZones
        ? zonaScore(candidato, dia.map((v) => v.contactoId), contactoMap)
        : 0;

      const loadScore = params.maxVisitasPorDia - dia.length; // prefer less-loaded days
      const urgScore = candidato.urgente ? 50 : 0;
      const score = zScore * 2 + loadScore + urgScore;

      if (score > bestScore) {
        bestScore = score;
        bestFecha = slot.fecha;
        bestSlot = slot;
      }
    }

    if (bestFecha && bestSlot) {
      if (!diasMap.has(bestFecha)) diasMap.set(bestFecha, []);
      diasMap.get(bestFecha)!.push({
        contactoId: candidato.contactoId,
        slot: bestSlot,
        duracionMin: candidato.duracionMin,
        asignado: candidato.asignado,
      });
    } else {
      sinAsignar.push(candidato);
    }
  }

  // Build DiaRuta[] with route order + metrics
  const dias: DiaRuta[] = [];
  const sortedFechas = [...diasMap.keys()].sort();

  for (const fecha of sortedFechas) {
    const raw = diasMap.get(fecha)!;
    const ordered = sortVisitasByZone(raw, contactoMap);

    const visitas: VisitaRuta[] = [];
    let totalKm = 0;
    let totalMinViaje = 0;
    let totalMinVisitas = 0;

    for (let i = 0; i < ordered.length; i++) {
      const v = ordered[i];
      let desp: Desplazamiento | null = null;

      if (i === 0) {
        desp = distanciaFromBase(contactoMap.get(v.contactoId)!);
      } else {
        const prev = ordered[i - 1];
        const cPrev = contactoMap.get(prev.contactoId)!;
        const cCurr = contactoMap.get(v.contactoId)!;
        desp = distanciaEstimada(cPrev, cCurr);
      }

      totalKm += desp?.km ?? 0;
      totalMinViaje += desp?.minutos ?? 0;
      totalMinVisitas += v.duracionMin;

      visitas.push({
        contactoId: v.contactoId,
        slot: v.slot,
        duracionMin: v.duracionMin,
        ordenEnDia: i + 1,
        asignado: v.asignado,
        desplazamientoDesdeAnterior: desp,
      });
    }

    // Efficiency: % of consecutive visits in same city
    const ciudades = [...new Set(
      visitas.map((v) => contactoMap.get(v.contactoId)?.ciudad || "").filter(Boolean)
    )];

    let sameCiudadPairs = 0;
    for (let i = 1; i < visitas.length; i++) {
      const ca = norm(contactoMap.get(visitas[i - 1].contactoId)?.ciudad || "");
      const cb = norm(contactoMap.get(visitas[i].contactoId)?.ciudad || "");
      if (ca && cb && ca === cb) sameCiudadPairs++;
    }
    const eficienciaZona =
      visitas.length > 1 ? Math.round((sameCiudadPairs / (visitas.length - 1)) * 100) : 100;

    const firstSlot = visitas[0]?.slot;
    dias.push({
      fecha,
      diaSemana: firstSlot?.diaSemana || "",
      visitas,
      ciudades,
      totalKm,
      totalMinViaje,
      totalMinVisitas,
      eficienciaZona,
    });
  }

  // Global metrics
  const totalVisitas = dias.reduce((s, d) => s + d.visitas.length, 0);
  const totalKm = dias.reduce((s, d) => s + d.totalKm, 0);
  const totalMinViaje = dias.reduce((s, d) => s + d.totalMinViaje, 0);

  const eficienciaGlobal =
    dias.length > 0
      ? Math.round(dias.reduce((s, d) => s + d.eficienciaZona, 0) / dias.length)
      : 0;

  return {
    dias,
    totalVisitas,
    totalKm,
    totalMinViaje,
    eficienciaGlobal,
    sinAsignar,
    generadaEn: new Date().toISOString(),
    params,
  };
}

// ── Recalculate helper ─────────────────────────────────────────────────

export function recalcularSinContacto(
  resultado: ResultadoOptimizacion,
  contactoId: string,
  candidatos: CandidatoVisita[],
  params: OptimizerParams
): ResultadoOptimizacion {
  const restantes = candidatos.filter((c) => c.contactoId !== contactoId);
  return optimizarRuta(restantes, params);
}

// ── Formatting helpers ─────────────────────────────────────────────────

export function formatMinutos(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

export function formatKm(km: number): string {
  return km >= 1000 ? `${(km / 1000).toFixed(1)}k km` : `${km} km`;
}

export function eficienciaLabel(val: number): string {
  if (val >= 80) return "Excelente";
  if (val >= 60) return "Buena";
  if (val >= 40) return "Aceptable";
  return "Mejorable";
}

export function eficienciaColor(val: number): string {
  if (val >= 80) return "#00ff88";
  if (val >= 60) return "#a3e635";
  if (val >= 40) return "#f59e0b";
  return "#ef4444";
}

export const DESPLAZAMIENTO_COLOR: Record<TipoDesplazamiento, string> = {
  mismo_lugar:  "#00ff88",
  misma_ciudad: "#3b82f6",
  provincia:    "#f59e0b",
  otro:         "#ef4444",
};

export const DESPLAZAMIENTO_LABEL: Record<TipoDesplazamiento, string> = {
  mismo_lugar:  "Mismo lugar",
  misma_ciudad: "Misma ciudad",
  provincia:    "Misma provincia",
  otro:         "Otra zona",
};
