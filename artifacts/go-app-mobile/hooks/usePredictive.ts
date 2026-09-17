// ── usePredictive.ts ─────────────────────────────────────────────────────────
// BLOQUE 5 · Capa Predictiva — estructura lista para IA futura.
//
// hoy: heurísticas puras sobre datos existentes (weather, carga, horarios).
// futuro: sustituir / enriquecer computeDaySuggestions con un endpoint de IA
//         que devuelva CalSuggestion[] con source: "ai" y confidence real.
// ─────────────────────────────────────────────────────────────────────────────

// ── Types ─────────────────────────────────────────────────────────────────────

export type CalSuggestionType =
  | "tarde-hoy"         // hoy, tarde y quedan tareas sin hora
  | "retraso-riesgo"    // pendientes acumulados en un día ya avanzado
  | "saturacion"        // día futuro con demasiadas tareas
  | "lluvia-actividad"  // actividad exterior + lluvia prevista
  | "hueco-libre";      // brecha ≥ 90 min en día ocupado — ideal para mover algo

export type CalSuggestion = {
  id: string;
  type: CalSuggestionType;
  colDate: string;                  // dateISO de la columna afectada
  itemId?: string;                  // ítem específico (si aplica)
  message: string;                  // texto corto para el chip visual
  detail?: string;                  // texto extendido para futuros tooltips / IA
  severity: "info" | "warn" | "action";
  source: "heuristic" | "ai";      // "ai" reservado para integración futura
  confidence: number;              // 0–1; las heurísticas emiten ~0.75–0.85
  suggestedAction?: string;        // etiqueta de acción futura ("mover", "reagendar", ...)
  suggestedTime?: string;          // HH:MM — para huecos / reagendado
};

// ── Minimal item interface (no import circular) ───────────────────────────────

export interface PredictiveItem {
  id: string;
  time?: string;
  intentKey?: string;
  intentLabel?: string;
  notes?: string;
  estado?: string;     // "completado" | "pendiente" | ...
  dateISO?: string;
}

export interface PredictiveWeatherDay {
  weatherCode: number;
  precipMax?: number;
  windMax?: number;
  tempMax?: number;
}

export interface ComputeDaySuggestionsParams {
  colDate: string;
  isToday: boolean;
  isFuture: boolean;          // colDate > todayISO
  nowMinutes: number;         // minutes since midnight (for today checks)
  items: PredictiveItem[];
  weatherDay?: PredictiveWeatherDay;
  retrasadosCount: number;
  lang?: "es" | "en";
}

// ── Keyword list (mirrors AgendaOperativa WEATHER_SENSITIVE_KEYWORDS) ─────────
const WEATHER_KW = [
  "bicicleta","bike","bicycle","ciclismo",
  "caminar","walk","caminata",
  "correr","run","jogging",
  "deporte","sport","entreno","entrenamiento",
  "exterior","outdoor","afuera",
  "viaje","viajes","travel","excursion","excursión",
  "visita","visitas","visit",
  "entrega","entregas","delivery","reparto",
  "colegio","escuela","school","niños","ninos","kids",
  "senderismo","hiking","trekking",
  "playa","beach","parque","park",
  "obra","construcción",
];

function isSensitive(item: PredictiveItem): boolean {
  const combined = `${item.intentKey ?? ""} ${item.intentLabel ?? ""} ${item.notes ?? ""}`.toLowerCase();
  return WEATHER_KW.some((kw) => combined.includes(kw));
}

function isAdverseCode(code: number): boolean {
  return code >= 51; // drizzle and above
}

// Parse "HH:MM" → minutes since midnight, or null
function toMinutes(t?: string): number | null {
  if (!t) return null;
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

// Find largest consecutive gap (minutes) among timed items
function largestGapMinutes(items: PredictiveItem[]): { gap: number; startTime: string } {
  const times = items
    .map((i) => toMinutes(i.time))
    .filter((v): v is number => v !== null)
    .sort((a, b) => a - b);
  if (times.length < 2) return { gap: 0, startTime: "" };
  let maxGap = 0;
  let gapStart = 0;
  for (let i = 1; i < times.length; i++) {
    const gap = (times[i] as number) - (times[i - 1] as number);
    if (gap > maxGap) {
      maxGap = gap;
      gapStart = times[i - 1] as number;
    }
  }
  const h = Math.floor(gapStart / 60);
  const mn = gapStart % 60;
  return {
    gap: maxGap,
    startTime: `${String(h).padStart(2, "0")}:${String(mn).padStart(2, "0")}`,
  };
}

// ── Main computation function ─────────────────────────────────────────────────
// Pure — no side effects, no hooks. Call inside renderColumn or a useMemo.
// Replace or augment the return array with AI-produced suggestions in the future.
export function computeDaySuggestions(p: ComputeDaySuggestionsParams): CalSuggestion[] {
  const results: CalSuggestion[] = [];
  const { colDate, isToday, isFuture, nowMinutes, items, weatherDay, retrasadosCount, lang = "es" } = p;
  const en = lang === "en";

  // ── 1. TARDE-HOY: hoy, >17:00, hay tareas sin hora sin completar ──────────
  if (isToday && nowMinutes >= 17 * 60) {
    const untimedPending = items.filter(
      (i) => !i.time && i.estado !== "completado" && i.estado !== "rechazado"
    );
    if (untimedPending.length > 0) {
      results.push({
        id: `tarde-hoy-${colDate}`,
        type: "tarde-hoy",
        colDate,
        message: en ? "Possible late" : "Posible tarde",
        detail: en
          ? `${untimedPending.length} task${untimedPending.length > 1 ? "s" : ""} without time pending`
          : `${untimedPending.length} tarea${untimedPending.length > 1 ? "s" : ""} sin hora pendiente${untimedPending.length > 1 ? "s" : ""}`,
        severity: "action",
        source: "heuristic",
        confidence: 0.80,
        suggestedAction: "revisar",
      });
    }
  }

  // ── 2. RETRASO-RIESGO: pendientes acumulados y el día ya está avanzado ─────
  if (isToday && nowMinutes >= 14 * 60 && retrasadosCount >= 3) {
    results.push({
      id: `retraso-riesgo-${colDate}`,
      type: "retraso-riesgo",
      colDate,
      message: en ? "Check pending" : "Revisar pendientes",
      detail: en ? `${retrasadosCount} accumulated tasks unresolved` : `${retrasadosCount} tareas acumuladas sin resolver`,
      severity: "warn",
      source: "heuristic",
      confidence: 0.82,
      suggestedAction: "revisar-pendientes",
    });
  }

  // ── 3. SATURACION: día futuro con ≥5 tareas ───────────────────────────────
  if (isFuture && items.length >= 5) {
    results.push({
      id: `saturacion-${colDate}`,
      type: "saturacion",
      colDate,
      message: en ? "Busy day" : "Día saturado",
      detail: en ? `${items.length} tasks — consider moving some` : `${items.length} tareas — considera mover alguna`,
      severity: "warn",
      source: "heuristic",
      confidence: 0.78,
      suggestedAction: "redistribuir",
    });
  }

  // ── 4. LLUVIA-ACTIVIDAD: día futuro + clima adverso + actividad sensible ───
  if (isFuture && weatherDay) {
    const adverse =
      isAdverseCode(weatherDay.weatherCode) ||
      (weatherDay.precipMax != null && weatherDay.precipMax >= 40);
    if (adverse) {
      const sensitiveItem = items.find(isSensitive);
      if (sensitiveItem) {
        results.push({
          id: `lluvia-actividad-${colDate}-${sensitiveItem.id}`,
          type: "lluvia-actividad",
          colDate,
          itemId: sensitiveItem.id,
          message: en ? "Rain expected" : "Va a llover",
          detail: en
            ? `Check "${sensitiveItem.intentLabel ?? sensitiveItem.intentKey ?? "activity"}" — rain forecast`
            : `Revisa "${sensitiveItem.intentLabel ?? sensitiveItem.intentKey ?? "actividad"}" — lluvia prevista`,
          severity: "warn",
          source: "heuristic",
          confidence: 0.85,
          suggestedAction: "revisar-horario",
        });
      }
    }
  }

  // ── 5. HUECO-LIBRE: día futuro con ≥3 tareas y hueco ≥90 min ─────────────
  if (isFuture && items.length >= 3) {
    const { gap, startTime } = largestGapMinutes(items);
    if (gap >= 90 && startTime) {
      results.push({
        id: `hueco-libre-${colDate}`,
        type: "hueco-libre",
        colDate,
        message: en ? `Free slot at ${startTime}` : `Hueco a las ${startTime}`,
        detail: en ? `${gap} free min — ideal to move something here` : `${gap} min libres — ideal para mover algo aquí`,
        severity: "info",
        source: "heuristic",
        confidence: 0.75,
        suggestedAction: "usar-hueco",
        suggestedTime: startTime,
      });
    }
  }

  // Priority sort: action > warn > info
  const rank = { action: 0, warn: 1, info: 2 };
  results.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return results;
}

// ── Visual metadata for each suggestion type ──────────────────────────────────
// Used by AgendaOperativa to render the chip without coupling types to icons.
export type SuggestionChipMeta = {
  icon: string;   // Feather icon name
  color: string;  // chip text + icon tint
};

export function getSuggestionChipMeta(type: CalSuggestionType): SuggestionChipMeta {
  switch (type) {
    case "tarde-hoy":        return { icon: "clock",          color: "#f39c12" };
    case "retraso-riesgo":   return { icon: "alert-circle",   color: "#e17055" };
    case "saturacion":       return { icon: "alert-triangle",  color: "#ff9f43" };
    case "lluvia-actividad": return { icon: "cloud-rain",     color: "#64B5F6" };
    case "hueco-libre":      return { icon: "zap",            color: "#55efc4" };
  }
}
