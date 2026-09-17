/**
 * Interpretador de respuestas en español.
 * Analiza texto libre y extrae disponibilidad horaria detectada.
 */

import type { SlotOpcion } from "@/data/disponibilidad";

// ── Tipos ─────────────────────────────────────────────────────────────

export type FranjaDia = "mañana" | "tarde" | "mediodía" | "noche" | "cualquiera";
export type PolaridadDeteccion = "positivo" | "negativo" | "neutro";

export interface DeteccionDia {
  diaOriginal: string;     // "jueves"
  diaNormalizado: string;  // "Jueves"
  polaridad: PolaridadDeteccion;
  franja: FranjaDia | null;
  horaEspecifica: string | null; // "09:00"
}

export type EstadoCompatibilidad =
  | "compatible"
  | "parcialmente_compatible"
  | "rechazado"
  | "revision_manual"
  | "pendiente";

export interface ParseResult {
  detecciones: DeteccionDia[];
  todosAceptados: boolean;
  todosRechazados: boolean;
  necesitaLlamada: boolean;
  urgente: boolean;
  peticionEspecial: string;
  slotsAceptados: string[];    // slot IDs
  slotsRechazados: string[];   // slot IDs
  estadoCalculado: EstadoCompatibilidad;
  resumen: string;
  textoOriginal: string;
}

// ── Diccionarios ──────────────────────────────────────────────────────

const DIAS_ES: Record<string, string> = {
  lunes: "Lunes",
  martes: "Martes",
  "miércoles": "Miércoles",
  miercoles: "Miércoles",
  jueves: "Jueves",
  viernes: "Viernes",
  sábado: "Sábado",
  sabado: "Sábado",
  domingo: "Domingo",
};

const NEGACION_PATTERNS = [
  /no puedo/i,
  /no me viene/i,
  /no me va/i,
  /no me queda/i,
  /no estaré/i,
  /no estare/i,
  /no estoy/i,
  /no voy a poder/i,
  /imposible/i,
  /de viaje/i,
  /vacaciones/i,
  /ocupado/i,
  /ocupada/i,
  /tengo (una )?reunión/i,
  /tengo compromiso/i,
  /no disponible/i,
  /ese día no/i,
  /esa (fecha|opción|opcion) no/i,
  /tampoco/i,
  /ni el/i,
  /ni la/i,
];

const AFIRMACION_PATTERNS = [
  /sí puedo/i,
  /si puedo/i,
  /me viene bien/i,
  /me va bien/i,
  /me va perfecto/i,
  /me vendría bien/i,
  /me vendria bien/i,
  /perfecto/i,
  /\bok\b/i,
  /de acuerdo/i,
  /podría/i,
  /podria/i,
  /estaré disponible/i,
  /estare disponible/i,
  /disponible/i,
  /sí\b/i,
  /si\b/i,
  /estará/i,
  /puedo ese/i,
  /ese día (sí|si)/i,
  /esa opción/i,
  /mejor el/i,
  /prefiero el/i,
  /puede ser el/i,
];

const TODO_ACEPTADO = [
  /cualquier (día|dia|fecha|opción|opcion)/i,
  /lo que (sea|queráis|querais)/i,
  /cuando (quieran|queráis|querais|podáis|podais|os venga)/i,
  /todos los días/i,
  /cualquiera me va/i,
  /me adapto/i,
  /sin problema cualquier/i,
  /todas (las opciones|me vienen)/i,
];

const TODO_RECHAZADO = [
  /ninguno/i,
  /ningún (día|dia)/i,
  /imposible esa semana/i,
  /no puedo ninguno/i,
  /no puedo en esas fechas/i,
  /estoy de baja/i,
  /no estaré en toda/i,
  /no voy a poder ninguno/i,
];

const FRANJA_TARDE = [
  /por la tarde/i,
  /\btarde\b/i,
  /después de comer/i,
  /despues de comer/i,
  /después del mediodía/i,
  /a partir de las 14/i,
  /a partir de las 15/i,
  /a partir de las 16/i,
];

const FRANJA_MANANA = [
  /por la mañana/i,
  /por la manana/i,
  /\bmañana\b/i,
  /\bmanana\b/i,
  /a primera hora/i,
  /temprano/i,
  /antes de (comer|las 12|las 13)/i,
];

const FRANJA_MEDIODIA = [
  /\bmediodía\b/i,
  /\bmediodia\b/i,
  /a mediodía/i,
  /a mediodia/i,
  /al mediodía/i,
];

const FRANJA_NOCHE = [
  /por la noche/i,
  /\btarde-noche\b/i,
  /a partir de las 18/i,
  /a partir de las 19/i,
  /después de las 18/i,
];

const LLAMADA_PATTERNS = [
  /llamar/i,
  /llámame/i,
  /llamame/i,
  /por teléfono/i,
  /por telefono/i,
  /necesito llamada/i,
  /prefiero llamada/i,
  /hablamos por/i,
];

const URGENTE_PATTERNS = [
  /urgente/i,
  /urgencia/i,
  /lo antes posible/i,
  /cuanto antes/i,
  /con urgencia/i,
  /inmediatamente/i,
  /esta semana sí o sí/i,
];

const PETICION_PATTERNS: { pattern: RegExp; label: string }[] = [
  { pattern: /prefiero (mañana|tarde|noche)/i,          label: "Franja preferida indicada" },
  { pattern: /por favor (confirmar|confirme)/i,         label: "Solicita confirmación" },
  { pattern: /¿(podéis|podeis|pueden) (ser|venir)/i,   label: "Propone cambio de fecha" },
  { pattern: /otra (fecha|opción|opcion)/i,             label: "Solicita otra opción" },
  { pattern: /¿(hay|tiene) algo (antes|más pronto)/i,  label: "Prefiere fecha anterior" },
  { pattern: /necesito (saber|confirmar)/i,             label: "Necesita confirmación previa" },
];

// ── Hora específica ───────────────────────────────────────────────────

function extractHoraEspecifica(text: string): string | null {
  const patterns = [
    /a las (\d{1,2})(?::(\d{2}))?/i,
    /(\d{1,2})h(?:(\d{2}))?/i,
    /(\d{1,2}):(\d{2})/,
    /las (\d{1,2})(?::(\d{2}))?/i,
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) {
      const h = parseInt(m[1], 10);
      const min = m[2] ? parseInt(m[2], 10) : 0;
      if (h >= 6 && h <= 22) {
        return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
      }
    }
  }
  return null;
}

function detectFranja(text: string): FranjaDia | null {
  if (FRANJA_MANANA.some((p) => p.test(text))) return "mañana";
  if (FRANJA_TARDE.some((p) => p.test(text))) return "tarde";
  if (FRANJA_MEDIODIA.some((p) => p.test(text))) return "mediodía";
  if (FRANJA_NOCHE.some((p) => p.test(text))) return "noche";
  return null;
}

// ── Normalizer ────────────────────────────────────────────────────────

function normalizar(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

// ── Clause splitter ───────────────────────────────────────────────────

function splitClauses(text: string): string[] {
  return text
    .split(/[.,;!?\n]|\bpero\b|\baunque\b|\bsin embargo\b|\by\b|\bporque\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 2);
}

// ── Polarity per clause ───────────────────────────────────────────────

function detectarPolaridad(clause: string): PolaridadDeteccion {
  if (NEGACION_PATTERNS.some((p) => p.test(clause))) return "negativo";
  if (AFIRMACION_PATTERNS.some((p) => p.test(clause))) return "positivo";
  return "neutro";
}

// ── Main parser ───────────────────────────────────────────────────────

export function interpretarRespuesta(
  texto: string,
  slotsOfrecidos: SlotOpcion[]
): ParseResult {
  const detecciones: DeteccionDia[] = [];

  // ── Global signals ──────────────────────────────────────────────────
  const todosAceptados = TODO_ACEPTADO.some((p) => p.test(texto));
  const todosRechazados = TODO_RECHAZADO.some((p) => p.test(texto));
  const necesitaLlamada = LLAMADA_PATTERNS.some((p) => p.test(texto));
  const urgente = URGENTE_PATTERNS.some((p) => p.test(texto));

  const peticionMatch = PETICION_PATTERNS.find((pp) => pp.pattern.test(texto));
  const peticionEspecial = peticionMatch?.label ?? "";

  // ── Per-clause day detection ────────────────────────────────────────
  if (!todosAceptados && !todosRechazados) {
    const clauses = splitClauses(texto);
    for (const clause of clauses) {
      const polaridad = detectarPolaridad(clause);
      const franja = detectFranja(clause);
      const horaEspecifica = extractHoraEspecifica(clause);
      const clauseNorm = normalizar(clause);

      for (const [key, diaNorm] of Object.entries(DIAS_ES)) {
        if (clauseNorm.includes(key)) {
          // avoid duplicates for the same day+polaridad
          const existing = detecciones.find(
            (d) => d.diaNormalizado === diaNorm && d.polaridad === polaridad
          );
          if (!existing) {
            detecciones.push({
              diaOriginal: key,
              diaNormalizado: diaNorm,
              polaridad: polaridad === "neutro" ? "positivo" : polaridad,
              franja,
              horaEspecifica,
            });
          }
        }
      }
    }
  }

  // ── Cross-reference with offered slots ─────────────────────────────
  const slotsAceptados: string[] = [];
  const slotsRechazados: string[] = [];

  if (todosAceptados) {
    slotsOfrecidos.forEach((s) => slotsAceptados.push(s.id));
  } else if (todosRechazados) {
    slotsOfrecidos.forEach((s) => slotsRechazados.push(s.id));
  } else {
    for (const slot of slotsOfrecidos) {
      const deteccion = detecciones.find(
        (d) => d.diaNormalizado === slot.diaSemana
      );
      if (!deteccion) continue;

      // Check franja compatibility
      if (deteccion.franja && deteccion.franja !== "cualquiera") {
        const slotHour = parseInt(slot.hora.split(":")[0], 10);
        const franjaOk =
          (deteccion.franja === "mañana"   && slotHour < 13) ||
          (deteccion.franja === "mediodía" && slotHour >= 12 && slotHour < 14) ||
          (deteccion.franja === "tarde"    && slotHour >= 13 && slotHour < 19) ||
          (deteccion.franja === "noche"    && slotHour >= 18);
        if (!franjaOk) continue;
      }

      // Check specific hour
      if (deteccion.horaEspecifica) {
        if (deteccion.horaEspecifica !== slot.hora) continue;
      }

      if (deteccion.polaridad === "positivo") {
        slotsAceptados.push(slot.id);
      } else {
        slotsRechazados.push(slot.id);
      }
    }
  }

  // ── Calculate state ─────────────────────────────────────────────────
  let estadoCalculado: EstadoCompatibilidad;

  if (todosRechazados || (slotsRechazados.length === slotsOfrecidos.length && slotsOfrecidos.length > 0)) {
    estadoCalculado = "rechazado";
  } else if (todosAceptados || slotsAceptados.length >= 2) {
    estadoCalculado = "compatible";
  } else if (slotsAceptados.length === 1) {
    estadoCalculado = "parcialmente_compatible";
  } else if (detecciones.length === 0 && !necesitaLlamada && !peticionEspecial) {
    estadoCalculado = "revision_manual";
  } else {
    estadoCalculado = "revision_manual";
  }

  // ── Resumen legible ─────────────────────────────────────────────────
  let resumen = "";
  if (todosAceptados) {
    resumen = "Acepta cualquier franja";
  } else if (todosRechazados) {
    resumen = "Rechaza todas las opciones";
  } else if (slotsAceptados.length > 0 || slotsRechazados.length > 0) {
    const partes: string[] = [];
    const diasAceptados = [...new Set(detecciones.filter((d) => d.polaridad === "positivo").map((d) => d.diaNormalizado))];
    const diasRechazados = [...new Set(detecciones.filter((d) => d.polaridad === "negativo").map((d) => d.diaNormalizado))];
    if (diasAceptados.length) partes.push(`✓ ${diasAceptados.join(", ")}`);
    if (diasRechazados.length) partes.push(`✗ ${diasRechazados.join(", ")}`);
    resumen = partes.join(" · ");
  } else if (necesitaLlamada) {
    resumen = "Solicita contacto por llamada";
  } else {
    resumen = "Sin coincidencias claras — requiere revisión";
  }

  if (urgente) resumen = "⚡ Urgente · " + resumen;
  if (peticionEspecial) resumen += ` · ${peticionEspecial}`;

  return {
    detecciones,
    todosAceptados,
    todosRechazados,
    necesitaLlamada,
    urgente,
    peticionEspecial,
    slotsAceptados,
    slotsRechazados,
    estadoCalculado,
    resumen,
    textoOriginal: texto,
  };
}
