/**
 * segmentThemes.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Arquitectura de temas por segmento — TESO Aesthetic Matrix V1.
 *
 * USO ACTUAL:  Solo definición de tokens. Ningún componente lo usa todavía.
 * USO FUTURO:  Pasar `getSegmentTheme(segment)` al renderizar marketplace,
 *              reservas y fichas de servicio para adaptar colores automáticamente.
 *
 * REGLA: No cambiar colores en producción hasta que Reservas V1 esté cerrado
 *        y los pilotos reales estén validados.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export type ServiceSegment =
  | "belleza"       // Peluquería, uñas, estética
  | "bienestar"     // Spa, relajación, masajes
  | "salud"         // Médicos, fisio, psicología
  | "restauracion"  // Restaurantes, catering, delivery
  | "tecnologia"    // Reparaciones, informática, electrónica
  | "deportes"      // Gimnasio, entrenador, pistas
  | "hoteles"       // Alojamiento, turismo rural
  | "jovenes"       // Ocio, eventos, entretenimiento
  | "mayores"       // Asistencia, cuidados, acompañamiento
  | "default";      // Fallback genérico cuando el segmento no aplica

export type SegmentTheme = {
  /** Color primario — botones activos, headers, CTA */
  primary: string;
  /** Color secundario — acentos, badges, bordes activos */
  secondary: string;
  /** Color de fondo base del módulo */
  background: string;
  /** Color de superficie (cards, sheets) */
  surface: string;
  /** Color de texto sobre fondo claro */
  onBackground: string;
  /** Color de texto sobre superficie */
  onSurface: string;
  /** Color de texto sobre color primario */
  onPrimary: string;
  /** Radio de borde base (px) — suave para wellness, angular para tech */
  borderRadius: number;
  /** Opacidad de efectos y animaciones — bajo para mayores/salud */
  effectIntensity: "none" | "low" | "medium" | "high";
};

const THEMES: Record<ServiceSegment, SegmentTheme> = {
  belleza: {
    primary:         "#E91E8C",  // Fucsia
    secondary:       "#F48FB1",  // Rosa claro
    background:      "#FFF0F6",  // Blanco rosado
    surface:         "#FFFFFF",
    onBackground:    "#1A0010",
    onSurface:       "#1A0010",
    onPrimary:       "#FFFFFF",
    borderRadius:    20,
    effectIntensity: "medium",
  },
  bienestar: {
    primary:         "#4DB6AC",  // Verde agua
    secondary:       "#B2DFDB",  // Verde agua claro
    background:      "#F5FAFA",  // Casi blanco
    surface:         "#FFFFFF",
    onBackground:    "#1A2E2D",
    onSurface:       "#1A2E2D",
    onPrimary:       "#FFFFFF",
    borderRadius:    18,
    effectIntensity: "low",
  },
  salud: {
    primary:         "#1976D2",  // Azul sanitario
    secondary:       "#64B5F6",  // Azul claro
    background:      "#F3F8FF",
    surface:         "#FFFFFF",
    onBackground:    "#0D1B2A",
    onSurface:       "#0D1B2A",
    onPrimary:       "#FFFFFF",
    borderRadius:    12,
    effectIntensity: "low",
  },
  restauracion: {
    primary:         "#E65100",  // Naranja quemado
    secondary:       "#FFCC80",  // Crema
    background:      "#FFF8F3",
    surface:         "#FFFFFF",
    onBackground:    "#1C0A00",
    onSurface:       "#1C0A00",
    onPrimary:       "#FFFFFF",
    borderRadius:    14,
    effectIntensity: "medium",
  },
  tecnologia: {
    primary:         "#D32F2F",  // Rojo
    secondary:       "#FFD600",  // Amarillo puntual
    background:      "#0D0D0D",  // Negro
    surface:         "#1A1A1A",
    onBackground:    "#F5F5F5",
    onSurface:       "#F5F5F5",
    onPrimary:       "#FFFFFF",
    borderRadius:    8,
    effectIntensity: "high",
  },
  deportes: {
    primary:         "#2E7D32",  // Verde deportivo
    secondary:       "#A5D6A7",  // Verde claro
    background:      "#F1F8F1",
    surface:         "#FFFFFF",
    onBackground:    "#0A1F0A",
    onSurface:       "#0A1F0A",
    onPrimary:       "#FFFFFF",
    borderRadius:    10,
    effectIntensity: "high",
  },
  hoteles: {
    primary:         "#6A1B9A",  // Morado
    secondary:       "#CE93D8",  // Morado claro
    background:      "#FAF5FF",
    surface:         "#FFFFFF",
    onBackground:    "#1A0033",
    onSurface:       "#1A0033",
    onPrimary:       "#FFFFFF",
    borderRadius:    16,
    effectIntensity: "medium",
  },
  jovenes: {
    primary:         "#7B1FA2",  // Morado eléctrico
    secondary:       "#E91E63",  // Magenta
    background:      "#0D0018",
    surface:         "#1A0030",
    onBackground:    "#FFFFFF",
    onSurface:       "#FFFFFF",
    onPrimary:       "#FFFFFF",
    borderRadius:    16,
    effectIntensity: "high",
  },
  mayores: {
    primary:         "#1565C0",  // Azul suave
    secondary:       "#81C784",  // Verde suave
    background:      "#FAFAFA",
    surface:         "#FFFFFF",
    onBackground:    "#111111",
    onSurface:       "#111111",
    onPrimary:       "#FFFFFF",
    borderRadius:    16,
    effectIntensity: "none",
  },
  default: {
    primary:         "#4A80BD",  // GO Blue — actual color del sistema
    secondary:       "#6ee7b7",  // Mint — GO accent
    background:      "#F5F3EF",  // GO root bg
    surface:         "#FFFFFF",
    onBackground:    "#111827",
    onSurface:       "#111827",
    onPrimary:       "#FFFFFF",
    borderRadius:    14,
    effectIntensity: "medium",
  },
};

/**
 * Devuelve el tema visual para un segmento dado.
 * Si el segmento no existe, devuelve el tema `default` (GO actual).
 *
 * @example
 *   const theme = getSegmentTheme("belleza");
 *   style={{ backgroundColor: theme.primary }}
 */
export function getSegmentTheme(segment: ServiceSegment | string): SegmentTheme {
  return THEMES[(segment as ServiceSegment)] ?? THEMES.default;
}

/**
 * Infiere el segmento a partir de palabras clave en el nombre del servicio/categoría.
 * Útil para categorización automática sin metadatos explícitos.
 */
export function inferSegment(text: string): ServiceSegment {
  const t = text.toLowerCase();
  if (/pelo|peluqu|uña|estéti|belleza|manicur|pedicur|depil|facial|maquill/.test(t)) return "belleza";
  if (/spa|masaj|relaj|bienestar|terapi|wellness/.test(t)) return "bienestar";
  if (/médic|doctor|fisio|psicolog|enferm|nutri|salud|clínic|dental/.test(t)) return "salud";
  if (/restaur|bar|café|catering|comida|gastro|pizz|hamburgues/.test(t)) return "restauracion";
  if (/informat|tecnolog|reparac|móvil|ordenad|electrón/.test(t)) return "tecnologia";
  if (/gimnasio|deport|entrenador|piscina|pádel|fútbol|tenis|yoga/.test(t)) return "deportes";
  if (/hotel|alojam|rural|apartament|hostal/.test(t)) return "hoteles";
  if (/ocio|evento|fiesta|concierto|escape|karaoke/.test(t)) return "jovenes";
  if (/asistenc|cuidado|acompañ|mayor|dependien/.test(t)) return "mayores";
  return "default";
}
