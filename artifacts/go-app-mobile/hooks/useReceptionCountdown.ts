import { useState, useEffect, useMemo } from "react";

// Keywords that identify reception-type activities — anything that is
// coming TO the user (delivery, visit, repair, pickup, order, etc.)
const RECEPTION_PATTERNS = [
  "entrega", "delivery", "recogida", "pedido", "uber", "visita",
  "técnico", "tecnico", "paquete", "recepcion", "recepción",
  "llegada", "courier", "envio", "envío", "reparto",
  "instalacion", "instalación", "reparacion", "reparación",
  "cita", "pickup", "compra", "domicilio", "fontanero", "electricista",
];

export type ReceptionStatus = "en-camino" | "proximo" | "retrasado" | "completado";

export type ReceptionItem = {
  id: string;
  g: any;
  dt: Date;
  minutesLeft: number;
  status: ReceptionStatus;
  label: string;
  shortLabel: string;
};

export function isReceptionActivity(
  intentKey?: string,
  intentLabel?: string,
): boolean {
  const haystack = `${intentKey || ""} ${intentLabel || ""}`.toLowerCase();
  return RECEPTION_PATTERNS.some((kw) => haystack.includes(kw));
}

export function getReceptionStatus(minutesLeft: number): ReceptionStatus {
  if (minutesLeft > 10)  return "en-camino";
  if (minutesLeft >= 0)  return "proximo";
  if (minutesLeft > -90) return "retrasado";
  return "completado";
}

export function getReceptionStatusColor(status: ReceptionStatus): string {
  switch (status) {
    case "en-camino":  return "#64B5F6";
    case "proximo":    return "#f5a623";
    case "retrasado":  return "#e17055";
    case "completado": return "#55efc4";
  }
}

export function formatCountdownLabel(
  minutesLeft: number,
  status: ReceptionStatus,
): { label: string; shortLabel: string } {
  if (status === "completado") return { label: "Pasado", shortLabel: "Pasado" };
  const abs = Math.abs(minutesLeft);
  if (status === "retrasado")
    return { label: `Retrasado ${abs} min`, shortLabel: `+${abs} min` };
  if (status === "proximo") {
    if (minutesLeft === 0) return { label: "Llega ahora", shortLabel: "Ahora" };
    return { label: `Llega en ${minutesLeft} min`, shortLabel: `${minutesLeft} min` };
  }
  // en-camino
  if (minutesLeft >= 60) {
    const h = Math.floor(minutesLeft / 60);
    const m = minutesLeft % 60;
    const t = m > 0 ? `${h}h ${m}min` : `${h}h`;
    return { label: `En ${t}`, shortLabel: t };
  }
  return { label: `En ${minutesLeft} min`, shortLabel: `${minutesLeft} min` };
}

// Main hook — returns reception-type items sorted by urgency + nowMs tick
// so parent components can compute custom countdowns for non-reception items.
export function useReceptionCountdown(
  appointments: Array<{ g: any; dt: Date }>,
): { items: ReceptionItem[]; nowMs: number } {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo<ReceptionItem[]>(() => {
    return appointments
      .filter((apt) => {
        if (!apt.g.time) return false;
        if (!isReceptionActivity(apt.g.intentKey, apt.g.intentLabel)) return false;
        const mLeft = Math.round((apt.dt.getTime() - nowMs) / 60_000);
        return mLeft > -90;
      })
      .map((apt) => {
        const minutesLeft = Math.round((apt.dt.getTime() - nowMs) / 60_000);
        const status = getReceptionStatus(minutesLeft);
        const { label, shortLabel } = formatCountdownLabel(minutesLeft, status);
        return { id: apt.g.id, g: apt.g, dt: apt.dt, minutesLeft, status, label, shortLabel };
      })
      .sort((a, b) => a.minutesLeft - b.minutesLeft);
  }, [appointments, nowMs]);

  return { items, nowMs };
}
