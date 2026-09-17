// ─────────────────────────────────────────────────────────────────────────────
// Motor de guía visual GO/TESO — fuente única de verdad (1–9 niveles)
// Importar desde aquí en cualquier componente que necesite reaccionar al nivel.
// ─────────────────────────────────────────────────────────────────────────────

export const GUIDANCE_NAMES: Record<number, string> = {
  1: "Minimalista",
  2: "Muy ligero",
  3: "Ligero",
  4: "Normal",
  5: "Equilibrado",
  6: "Guiado",
  7: "Muy guiado",
  8: "Aprendizaje completo",
  9: "Máxima ayuda visual",
};

export const GUIDANCE_NAMES_EN: Record<number, string> = {
  1: "Minimalist",
  2: "Very light",
  3: "Light",
  4: "Normal",
  5: "Balanced",
  6: "Guided",
  7: "Highly guided",
  8: "Full learning",
  9: "Maximum visual aid",
};

export interface GuidanceConfig {
  /** Flechas orbitales visibles mientras rutasGuideCount < este umbral */
  arrowThreshold: number;
  /** Brillo máximo de las flechas orbitales (se desvanece progresivamente) */
  arrowMaxOpacity: number;
  /** Mostrar texto explicativo sobre las flechas orbitales */
  showArrowText: boolean;
  /** Pulso del satélite mapa activo mientras rutasGuideCount < este umbral */
  pulseThreshold: number;
  /** Máx. veces que se muestra el hint de pulsación larga en órbita/contactos */
  hintMaxCount: number;
  /** Banner de guía de contactos visible mientras contactsHintCount < este umbral */
  hintBannerThreshold: number;
  /** Hint del mapa visible mientras rutasGuideCount < este umbral */
  mapHintThreshold: number;
  /** Opacidad del texto de los satélites según su contador de uso */
  labelOpacity: (count: number) => number;
}

export function getGuidanceConfig(level: number): GuidanceConfig {
  const cfgs: GuidanceConfig[] = [
    // Nivel 1 — Minimalista: experiencia casi limpia total
    { arrowThreshold: 0,   arrowMaxOpacity: 0.00, showArrowText: false,
      pulseThreshold: 0,   hintMaxCount: 0, hintBannerThreshold: 0,  mapHintThreshold: 0,
      labelOpacity: () => 0 },
    // Nivel 2 — Muy ligero: ayudas mínimas y muy temporales
    { arrowThreshold: 2,   arrowMaxOpacity: 0.18, showArrowText: false,
      pulseThreshold: 2,   hintMaxCount: 1, hintBannerThreshold: 2,  mapHintThreshold: 0,
      labelOpacity: (c) => c < 1 ? 1 : c < 3  ? 0.35 : 0 },
    // Nivel 3 — Ligero: pequeños pulsos contextuales
    { arrowThreshold: 5,   arrowMaxOpacity: 0.24, showArrowText: false,
      pulseThreshold: 5,   hintMaxCount: 2, hintBannerThreshold: 4,  mapHintThreshold: 1,
      labelOpacity: (c) => c < 2 ? 1 : c < 5  ? 0.42 : 0 },
    // Nivel 4 — Normal: textos cortos de orientación
    { arrowThreshold: 9,   arrowMaxOpacity: 0.30, showArrowText: true,
      pulseThreshold: 9,   hintMaxCount: 3, hintBannerThreshold: 6,  mapHintThreshold: 2,
      labelOpacity: (c) => c < 3 ? 1 : c < 8  ? 0.50 : c < 14 ? 0.20 : 0 },
    // Nivel 5 — Equilibrado: sugerencias visuales (por defecto)
    { arrowThreshold: 14,  arrowMaxOpacity: 0.38, showArrowText: true,
      pulseThreshold: 14,  hintMaxCount: 4, hintBannerThreshold: 8,  mapHintThreshold: 3,
      labelOpacity: (c) => c < 5 ? 1 : c < 12 ? 0.60 : c < 22 ? 0.28 : 0 },
    // Nivel 6 — Guiado: flechas suaves y ayudas de flujo
    { arrowThreshold: 20,  arrowMaxOpacity: 0.46, showArrowText: true,
      pulseThreshold: 20,  hintMaxCount: 5, hintBannerThreshold: 10, mapHintThreshold: 4,
      labelOpacity: (c) => c < 8 ? 1 : c < 18 ? 0.65 : c < 32 ? 0.35 : 0.12 },
    // Nivel 7 — Muy guiado: guiado visual frecuente
    { arrowThreshold: 30,  arrowMaxOpacity: 0.55, showArrowText: true,
      pulseThreshold: 30,  hintMaxCount: 7, hintBannerThreshold: 14, mapHintThreshold: 5,
      labelOpacity: (c) => c < 13 ? 1 : c < 26 ? 0.70 : c < 45 ? 0.40 : 0.18 },
    // Nivel 8 — Aprendizaje completo: ayudas persistentes importantes
    { arrowThreshold: 50,  arrowMaxOpacity: 0.65, showArrowText: true,
      pulseThreshold: 50,  hintMaxCount: 10, hintBannerThreshold: 20, mapHintThreshold: 8,
      labelOpacity: (c) => c < 20 ? 1 : c < 38 ? 0.75 : 0.40 },
    // Nivel 9 — Máxima ayuda visual: acompañamiento visual completo
    { arrowThreshold: 999, arrowMaxOpacity: 0.75, showArrowText: true,
      pulseThreshold: 999, hintMaxCount: 999, hintBannerThreshold: 999, mapHintThreshold: 999,
      labelOpacity: () => 1 },
  ];
  return cfgs[Math.max(0, Math.min(8, level - 1))];
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-boost silencioso — motor de adaptación progresiva por uso real.
// Deriva el nivel efectivo desde contadores ya existentes, sin preguntar
// al usuario ni guardar nada nuevo en AsyncStorage.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Umbrales de acciones totales de experiencia para subir el boost 0→1→2→3→4.
 * Ajustados para sentirse naturales: primer boost al cabo de unos pocos días
 * de uso casual; cuarto boost solo para usuarios muy habituales.
 */
export const AUTO_BOOST_MILESTONES = [20, 60, 150, 350] as const;

/**
 * Dado el total de acciones de experiencia (suma de todos los contadores),
 * devuelve cuántos niveles extra añade el sistema silenciosamente (0–4).
 */
export function computeAutoBoost(totalActions: number): number {
  let boost = 0;
  for (const milestone of AUTO_BOOST_MILESTONES) {
    if (totalActions >= milestone) boost++;
    else break;
  }
  return boost;
}

/**
 * Calcula la opacidad máxima de cualquier guía de swipe/panel
 * usando el mismo motor 1–9, sin lógica nueva.
 * Aplicable a: swipe universal, swipes de calendario, swipe-down de paneles.
 */
export function swipeGuideMaxOpacity(count: number, cfg: GuidanceConfig): number {
  if (cfg.arrowThreshold <= 0) return 0;
  const fadeStart = Math.max(1, Math.floor(cfg.arrowThreshold * 0.5));
  const fadeEnd   = cfg.arrowThreshold;
  const peak      = Math.min(0.9, cfg.arrowMaxOpacity + 0.28);
  if (count <= fadeStart) return peak;
  if (count >= fadeEnd)   return 0;
  return ((fadeEnd - count) / (fadeEnd - fadeStart)) * peak;
}
