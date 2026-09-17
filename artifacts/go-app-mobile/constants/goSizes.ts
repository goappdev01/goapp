export type GoSizeKey =
  | "GO_SIZE_1"
  | "GO_SIZE_2"
  | "GO_SIZE_3"
  | "GO_SIZE_4"
  | "GO_SIZE_5"
  | "GO_SIZE_6"
  | "GO_SIZE_7"
  | "GO_SIZE_8"
  | "GO_SIZE_9";

export type GoSizeConfig = {
  key: GoSizeKey;
  goSize: number;
  sideBtnSize: number;
  smallBtnSize: number;
  orbitRadius: number;
  orbitBtnSize: number;
  orbitWrapSize: number;
};

function makeSize(
  key: GoSizeKey,
  goSize: number,
  orbitRadius: number,
  orbitBtnSize: number,
): GoSizeConfig {
  return {
    key,
    goSize,
    sideBtnSize: Math.round(goSize * 0.37),
    smallBtnSize: Math.round(goSize * 0.32),
    orbitRadius,
    orbitBtnSize,
    orbitWrapSize: (orbitRadius + orbitBtnSize / 2) * 2 + 12,
  };
}

// Escala lineal uniforme: goSize +11px por paso (58 → 148)
// orbitRadius ≈ goSize × 0.86 | orbitBtnSize paso +4px (36 → 68)
// orbitWrapSize resultante: ~146px (SIZE_1) → ~324px (SIZE_9)
// — cabe en pantalla sin invadir bordes ni título.

export const GO_SIZE_1 = makeSize("GO_SIZE_1",  58,  50, 36);
export const GO_SIZE_2 = makeSize("GO_SIZE_2",  69,  59, 40);
export const GO_SIZE_3 = makeSize("GO_SIZE_3",  80,  68, 44);
export const GO_SIZE_4 = makeSize("GO_SIZE_4",  91,  77, 48);
export const GO_SIZE_5 = makeSize("GO_SIZE_5", 102,  86, 52);
export const GO_SIZE_6 = makeSize("GO_SIZE_6", 113,  95, 56);
export const GO_SIZE_7 = makeSize("GO_SIZE_7", 124, 104, 60);
export const GO_SIZE_8 = makeSize("GO_SIZE_8", 135, 113, 64);
export const GO_SIZE_9 = makeSize("GO_SIZE_9", 140, 118, 65);

export const GO_SIZES: GoSizeConfig[] = [
  GO_SIZE_1,
  GO_SIZE_2,
  GO_SIZE_3,
  GO_SIZE_4,
  GO_SIZE_5,
  GO_SIZE_6,
  GO_SIZE_7,
  GO_SIZE_8,
  GO_SIZE_9,
];

// ── SISTEMA DE TAMAÑOS DE CALENDARIO ────────────────────────────────
// GO_CAL_SMALL  → 2 días visibles (176 px fijo, comportamiento actual)
// GO_CAL_MEDIUM → 1 día completo + parte del siguiente (~67% pantalla)
// GO_CAL_LARGE  → 1 día ocupa todo el ancho (máxima legibilidad)

export type CalSizeKey = "GO_CAL_SMALL" | "GO_CAL_MEDIUM" | "GO_CAL_LARGE";

export const CAL_SIZE_LABELS: Record<CalSizeKey, string> = {
  GO_CAL_SMALL:  "Pequeño",
  GO_CAL_MEDIUM: "Mediano",
  GO_CAL_LARGE:  "Grande",
};

/** Devuelve el ancho de columna (px) para el tamaño elegido. */
export function getCalColumnW(key: CalSizeKey, screenWidth: number): number {
  switch (key) {
    case "GO_CAL_LARGE":  return Math.round(screenWidth - 20);
    case "GO_CAL_MEDIUM": return Math.round(screenWidth * 0.67);
    default:              return 176;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PRESET GLOBAL DE RENDERIZADO DE TARJETAS GO
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// REGLA: Ningún agente o instrucción debe improvisar tamaños o posiciones.
// Todo valor inicial de renderizado de tarjetas GO debe referenciar
// DEFAULT_GO_RENDER_PRESET o las constantes GO_CARD_* de este bloque.
//
// Jerarquía semántica de tamaños de tarjeta (list view):
//   GO_CARD_SMALL  → "compacto"  (mínima altura, solo título)
//   GO_CARD_MEDIUM → "medio"     ← DEFAULT obligatorio
//   GO_CARD_LARGE  → "grande"    (máxima información visible)
//   GO_CARD_XL     → "grande"    (alias futuro para pantallas grandes)
//
// Jerarquía semántica para calendario:
//   GO_CAL_SMALL   = columna 176 px  ← DEFAULT (2 días visibles)
//   GO_CAL_MEDIUM  = columna ~67% pantalla
//   GO_CAL_LARGE   = columna ancho completo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/** Tamaño semántico de tarjeta GO en vista de lista. */
export type GoCardListSize = "compacto" | "medio" | "grande";

export const GO_CARD_SMALL:  GoCardListSize = "compacto";
export const GO_CARD_MEDIUM: GoCardListSize = "medio";     // ← DEFAULT
export const GO_CARD_LARGE:  GoCardListSize = "grande";
export const GO_CARD_XL:     GoCardListSize = "grande";    // alias futuro

/**
 * Padding interno base de tarjeta GO (puntos, a escala 1.0 = GO_CAL_SMALL).
 * En el calendario se multiplica por `calScale` para adaptarse al ancho de columna.
 * NUNCA cambiar este valor para un caso concreto — ajusta `calSizeKey` en su lugar.
 */
export const GO_DEFAULT_CARD_PAD    = 10;

/**
 * Margen entre tarjetas GO dentro del mismo slot o lista.
 * Valor en puntos, independiente de escala.
 */
export const GO_DEFAULT_CARD_MARGIN = 5;

/**
 * Alineación vertical de tarjeta GO dentro de su bloque horario.
 * "start" = la tarjeta inicia en el borde superior del slot → referencia
 * temporal clara. No usar "center" ni "end" en el preset global.
 */
export const GO_DEFAULT_VERTICAL_ALIGNMENT = "start" as const;

/**
 * Preset global de renderizado de tarjetas GO.
 *
 * Usar este objeto como única fuente de verdad para valores iniciales.
 * Si necesitas cambiar el comportamiento por defecto de toda la app,
 * modifica SOLO este objeto — el resto del código lo refleja automáticamente.
 */
export const DEFAULT_GO_RENDER_PRESET = {
  /** Tamaño de tarjeta en vista lista. */
  listSize:           GO_CARD_MEDIUM       as GoCardListSize,
  /** Tamaño de columna en vista calendario. */
  calSize:            "GO_CAL_SMALL"       as CalSizeKey,
  /** Padding interno base de tarjeta (pts, antes de escalar por calScale). */
  cardPad:            GO_DEFAULT_CARD_PAD,
  /** Margen entre tarjetas (pts). */
  cardMargin:         GO_DEFAULT_CARD_MARGIN,
  /** Alineación vertical dentro del slot horario. */
  verticalAlignment:  GO_DEFAULT_VERTICAL_ALIGNMENT,
} as const;
