/**
 * businessIcons.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Única fuente de verdad para el icono visual de cada tipo de negocio.
 *
 * Uso:
 *   import { getBusinessIcon } from "@/lib/businessIcons";
 *   const icon = getBusinessIcon(config.subId); // "⚽", "💅", "🍽️", ...
 *
 * Prioridad de resolución:
 *   1. Mapa de sub-actividades de SECTORS (fuente principal)
 *   2. Mapa de sector padre (fallback a categoría)
 *   3. BOOKING_TEMPLATES (complemento)
 *   4. "🏢" como último recurso
 */

import { SECTORS } from "@/data/goSectorData";
import { BOOKING_TEMPLATES } from "@/data/bookingTemplates";

const _subIcons:    Record<string, string> = {};
const _sectorIcons: Record<string, string> = {};

for (const sector of SECTORS) {
  _sectorIcons[sector.id] = sector.emoji;
  for (const sub of sector.subs) {
    _subIcons[sub.id] = sub.emoji;
  }
}

for (const [id, tpl] of Object.entries(BOOKING_TEMPLATES)) {
  if (!_subIcons[id]) _subIcons[id] = tpl.emoji;
}

const FALLBACK = "🏢";

/**
 * Devuelve el emoji que representa visualmente el tipo de empresa/actividad.
 *
 * @param subId  — id de sub-actividad (ej. "barberia", "restaurante", "padel")
 *                 o id de sector padre (ej. "belleza", "deportes")
 */
export function getBusinessIcon(subId?: string | null): string {
  if (!subId) return FALLBACK;
  return _subIcons[subId] ?? _sectorIcons[subId] ?? FALLBACK;
}
