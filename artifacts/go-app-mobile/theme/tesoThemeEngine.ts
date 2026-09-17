/**
 * TESO Visual Theme Engine
 * ════════════════════════════════════════════════════════════════════
 * Every module declares { category, targetAge, targetGender }.
 * The engine returns a complete, deterministic TesoTheme — no random
 * colors, no hand-tweaking per module.
 *
 * CATEGORIES
 *   BEAUTY      pink · fuchsia · white · light blue · soft rounded
 *   WELLNESS    light blue · white · pastel green
 *   HEALTH      green · white · medical blue
 *   TECHNOLOGY  black · red · yellow · sharp shapes
 *
 * AGE MODIFIERS
 *   YOUNG   higher contrast · faster motion · heavier weight
 *   ADULT   balanced defaults
 *   OLDER   calmer palette · +15% text scale · slower motion
 *   ALL     same as ADULT
 *
 * GENDER MODIFIERS
 *   FEMALE   warmer shift within the category palette
 *   MALE     cooler shift within the category palette
 *   NEUTRAL  no shift
 * ════════════════════════════════════════════════════════════════════
 */

// ─── Module Declaration ───────────────────────────────────────────────────────

export type TesoCategory   = "BEAUTY" | "WELLNESS" | "HEALTH" | "TECHNOLOGY";
export type TesoTargetAge  = "YOUNG" | "ADULT" | "OLDER" | "ALL";
export type TesoTargetGender = "FEMALE" | "MALE" | "NEUTRAL";

/** Every module must declare these three fields. */
export type TesoModuleConfig = {
  category:     TesoCategory;
  targetAge:    TesoTargetAge;
  targetGender: TesoTargetGender;
};

// ─── Theme Output Shape ───────────────────────────────────────────────────────

export type TesoColorScale = {
  primary:    string;
  secondary:  string;
  accent:     string;
  success:    string;
  warning:    string;
  error:      string;
  background: string;
  surface:    string;
  surfaceAlt: string;
  border:     string;
  borderActive: string;
  text: {
    primary:   string;
    secondary: string;
    muted:     string;
    inverse:   string;
  };
  overlay:    string;
  shadow:     string;
};

export type TesoShapeScale = {
  /** Extra-small pill — tags, badges */
  xs:   number;
  /** Small — inputs, chips */
  sm:   number;
  /** Medium — cards, buttons */
  md:   number;
  /** Large — panels, sheets */
  lg:   number;
  /** Extra-large — modals */
  xl:   number;
  /** Full — circular avatars */
  full: number;
};

export type TesoTypographyScale = {
  /** Base font size multiplier applied to every size token. */
  scale:   number;
  /** Default font weight for body text. */
  body:    "400" | "500";
  /** Font weight for labels and headings. */
  label:   "600" | "700" | "800";
  /** Font weight for primary CTAs and key numbers. */
  display: "700" | "800" | "900";
  /** Letter-spacing for section headers (em units). */
  tracking: number;
};

export type TesoMotionScale = {
  /** Transition duration for micro-interactions (ms). */
  fast:   number;
  /** Transition duration for panels and cards (ms). */
  normal: number;
  /** Transition duration for full-screen transitions (ms). */
  slow:   number;
  /** Spring damping — higher = less bounce. */
  damping: number;
  /** Spring stiffness. */
  stiffness: number;
};

export type TesoTheme = {
  /** The module config this theme was generated from — useful for debugging. */
  source:     TesoModuleConfig;
  colors:     TesoColorScale;
  shapes:     TesoShapeScale;
  typography: TesoTypographyScale;
  motion:     TesoMotionScale;
  /**
   * Convenience: whether the background is dark-dominant.
   * Consumers use this to pick icon/overlay variants without extra logic.
   */
  isDark: boolean;
};

// ─── Base Palettes ────────────────────────────────────────────────────────────
// Each entry is the neutral-gender, adult starting point.
// Gender and age modifiers are applied on top.

type BasePalette = Omit<TesoColorScale, "overlay" | "shadow"> & {
  overlay: string;
  shadow:  string;
};

const BASE_PALETTES: Record<TesoCategory, BasePalette> = {
  BEAUTY: {
    primary:      "#F472B6", // pink-400
    secondary:    "#BAE6FD", // sky-200
    accent:       "#D946EF", // fuchsia-500
    success:      "#34D399", // emerald-400
    warning:      "#FBBF24", // amber-400
    error:        "#FB7185", // rose-400
    background:   "#FFFFFF",
    surface:      "#FFF0F8", // blush white
    surfaceAlt:   "#FCE7F3", // pink-100
    border:       "#FBCFE8", // pink-200
    borderActive: "#F472B6", // pink-400
    text: {
      primary:   "#500724", // pink-950
      secondary: "#9D174D", // pink-800
      muted:     "#DB2777", // pink-600
      inverse:   "#FFFFFF",
    },
    overlay: "rgba(244, 114, 182, 0.12)",
    shadow:  "rgba(217, 70, 239, 0.18)",
  },

  WELLNESS: {
    primary:      "#38BDF8", // sky-400
    secondary:    "#86EFAC", // green-300
    accent:       "#6EE7B7", // emerald-300
    success:      "#4ADE80", // green-400
    warning:      "#FDE68A", // amber-200
    error:        "#FCA5A5", // red-300
    background:   "#FFFFFF",
    surface:      "#F0F9FF", // sky-50
    surfaceAlt:   "#ECFDF5", // emerald-50
    border:       "#E0F2FE", // sky-100
    borderActive: "#38BDF8", // sky-400
    text: {
      primary:   "#082F49", // sky-950
      secondary: "#0369A1", // sky-700
      muted:     "#7DD3FC", // sky-300
      inverse:   "#FFFFFF",
    },
    overlay: "rgba(56, 189, 248, 0.10)",
    shadow:  "rgba(110, 231, 183, 0.20)",
  },

  HEALTH: {
    primary:      "#22C55E", // green-500
    secondary:    "#BFDBFE", // blue-200
    accent:       "#2563EB", // blue-600 (medical)
    success:      "#16A34A", // green-600
    warning:      "#F59E0B", // amber-500
    error:        "#DC2626", // red-600
    background:   "#FFFFFF",
    surface:      "#F0FDF4", // green-50
    surfaceAlt:   "#EFF6FF", // blue-50
    border:       "#DCFCE7", // green-100
    borderActive: "#22C55E", // green-500
    text: {
      primary:   "#052E16", // green-950
      secondary: "#166534", // green-800
      muted:     "#4ADE80", // green-400
      inverse:   "#FFFFFF",
    },
    overlay: "rgba(34, 197, 94, 0.10)",
    shadow:  "rgba(37, 99, 235, 0.15)",
  },

  TECHNOLOGY: {
    primary:      "#EF4444", // red-500
    secondary:    "#FACC15", // yellow-400
    accent:       "#FCA5A5", // red-300
    success:      "#4ADE80", // green-400
    warning:      "#FACC15", // yellow-400
    error:        "#EF4444", // red-500
    background:   "#09090B", // zinc-950
    surface:      "#18181B", // zinc-900
    surfaceAlt:   "#27272A", // zinc-800
    border:       "#27272A", // zinc-800
    borderActive: "#EF4444", // red-500
    text: {
      primary:   "#FAFAFA", // zinc-50
      secondary: "#A1A1AA", // zinc-400
      muted:     "#52525B", // zinc-600
      inverse:   "#09090B",
    },
    overlay: "rgba(239, 68, 68, 0.14)",
    shadow:  "rgba(250, 204, 21, 0.14)",
  },
};

// ─── Base Shape Sets ──────────────────────────────────────────────────────────

const BASE_SHAPES: Record<TesoCategory, TesoShapeScale> = {
  BEAUTY:     { xs: 6,  sm: 12, md: 20, lg: 28, xl: 36, full: 9999 },
  WELLNESS:   { xs: 6,  sm: 10, md: 16, lg: 22, xl: 30, full: 9999 },
  HEALTH:     { xs: 4,  sm:  8, md: 13, lg: 18, xl: 24, full: 9999 },
  TECHNOLOGY: { xs: 2,  sm:  4, md:  7, lg: 11, xl: 16, full: 9999 },
};

// ─── Gender Shifts ────────────────────────────────────────────────────────────
// Adjusts only primary + accent hex toward warmer / cooler variants.
// Values are alternative swaps from the same design system palette.

type GenderShift = Partial<Pick<TesoColorScale, "primary" | "secondary" | "accent" | "border" | "borderActive">>;

const GENDER_SHIFTS: Record<TesoCategory, Record<TesoTargetGender, GenderShift>> = {
  BEAUTY: {
    FEMALE:  { primary: "#EC4899", accent: "#C026D3" }, // deeper pink/purple
    MALE:    { primary: "#818CF8", accent: "#6366F1" }, // indigo shift
    NEUTRAL: {},
  },
  WELLNESS: {
    FEMALE:  { primary: "#67E8F9", accent: "#A7F3D0" }, // softer cyan/mint
    MALE:    { primary: "#2563EB", accent: "#0EA5E9" }, // stronger blue
    NEUTRAL: {},
  },
  HEALTH: {
    FEMALE:  { secondary: "#DDD6FE", accent: "#7C3AED" }, // violet medical
    MALE:    { secondary: "#BFDBFE", accent: "#1D4ED8" }, // deeper blue
    NEUTRAL: {},
  },
  TECHNOLOGY: {
    FEMALE:  { secondary: "#C084FC", accent: "#E879F9" }, // neon purple accent
    MALE:    { primary:   "#EF4444", secondary: "#FACC15" }, // default (no shift)
    NEUTRAL: {},
  },
};

// ─── Age Modifiers ────────────────────────────────────────────────────────────

type AgeModifiers = {
  typographyScale:  number;
  typographyBody:   TesoTypographyScale["body"];
  typographyLabel:  TesoTypographyScale["label"];
  typographyDisplay:TesoTypographyScale["display"];
  typographyTracking: number;
  motionFast:   number;
  motionNormal: number;
  motionSlow:   number;
  motionDamping:    number;
  motionStiffness:  number;
  /** Lighten (positive) or darken (negative) primary by mixing with white/black. 0 = no change. */
  primaryLighten: number;
};

const AGE_MODIFIERS: Record<TesoTargetAge, AgeModifiers> = {
  YOUNG: {
    typographyScale:   1.0,
    typographyBody:    "500",
    typographyLabel:   "800",
    typographyDisplay: "900",
    typographyTracking: 0.08,
    motionFast:    140,
    motionNormal:  200,
    motionSlow:    300,
    motionDamping: 14,
    motionStiffness: 180,
    primaryLighten: 0,
  },
  ADULT: {
    typographyScale:   1.0,
    typographyBody:    "400",
    typographyLabel:   "700",
    typographyDisplay: "800",
    typographyTracking: 0.06,
    motionFast:    180,
    motionNormal:  260,
    motionSlow:    380,
    motionDamping: 18,
    motionStiffness: 140,
    primaryLighten: 0,
  },
  OLDER: {
    typographyScale:   1.15,
    typographyBody:    "400",
    typographyLabel:   "700",
    typographyDisplay: "700",
    typographyTracking: 0.04,
    motionFast:    240,
    motionNormal:  340,
    motionSlow:    500,
    motionDamping: 24,
    motionStiffness: 100,
    primaryLighten: 12, // slightly softer primary for comfort
  },
  ALL: {
    typographyScale:   1.0,
    typographyBody:    "400",
    typographyLabel:   "700",
    typographyDisplay: "800",
    typographyTracking: 0.06,
    motionFast:    180,
    motionNormal:  260,
    motionSlow:    380,
    motionDamping: 18,
    motionStiffness: 140,
    primaryLighten: 0,
  },
};

// ─── Color Helpers ────────────────────────────────────────────────────────────

/** Mix a hex color toward white by `amount` (0–100). */
function lightenHex(hex: string, amount: number): string {
  if (amount === 0) return hex;
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >>  8) & 0xff;
  const b =  n        & 0xff;
  const f = amount / 100;
  const nr = Math.round(r + (255 - r) * f);
  const ng = Math.round(g + (255 - g) * f);
  const nb = Math.round(b + (255 - b) * f);
  return `#${nr.toString(16).padStart(2, "0")}${ng.toString(16).padStart(2, "0")}${nb.toString(16).padStart(2, "0")}`;
}

/** Convert hex to rgba string with given opacity. */
export function hexAlpha(hex: string, alpha: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 0xff;
  const g = (n >>  8) & 0xff;
  const b =  n        & 0xff;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

/**
 * Generate a complete, deterministic TesoTheme from a module config.
 *
 * @example
 * const theme = generateTesoTheme({
 *   category:     "BEAUTY",
 *   targetAge:    "YOUNG",
 *   targetGender: "FEMALE",
 * });
 */
export function generateTesoTheme(config: TesoModuleConfig): TesoTheme {
  const { category, targetAge, targetGender } = config;

  // 1. Base palette
  const base = { ...BASE_PALETTES[category] };

  // 2. Gender shift
  const gShift = GENDER_SHIFTS[category][targetGender];
  const shifted: BasePalette = {
    ...base,
    primary:      gShift.primary      ?? base.primary,
    secondary:    gShift.secondary    ?? base.secondary,
    accent:       gShift.accent       ?? base.accent,
    border:       gShift.border       ?? base.border,
    borderActive: gShift.borderActive ?? (gShift.primary ?? base.borderActive),
  };

  // 3. Age modifier
  const age = AGE_MODIFIERS[targetAge];
  const finalPrimary = lightenHex(shifted.primary, age.primaryLighten);

  const colors: TesoColorScale = {
    ...shifted,
    primary:      finalPrimary,
    borderActive: finalPrimary,
    overlay: hexAlpha(finalPrimary, category === "TECHNOLOGY" ? 0.16 : 0.10),
    shadow:  hexAlpha(shifted.accent, category === "TECHNOLOGY" ? 0.16 : 0.18),
  };

  // 4. Shapes — YOUNG audience gets slightly crisper, OLDER gets slightly softer
  const base_shapes = BASE_SHAPES[category];
  const shapeScale  = targetAge === "YOUNG" ? 0.9 : targetAge === "OLDER" ? 1.15 : 1.0;
  const shapes: TesoShapeScale = {
    xs:   Math.round(base_shapes.xs   * shapeScale),
    sm:   Math.round(base_shapes.sm   * shapeScale),
    md:   Math.round(base_shapes.md   * shapeScale),
    lg:   Math.round(base_shapes.lg   * shapeScale),
    xl:   Math.round(base_shapes.xl   * shapeScale),
    full: 9999,
  };

  // 5. Typography
  const typography: TesoTypographyScale = {
    scale:    age.typographyScale,
    body:     age.typographyBody,
    label:    age.typographyLabel,
    display:  age.typographyDisplay,
    tracking: age.typographyTracking,
  };

  // 6. Motion
  const motion: TesoMotionScale = {
    fast:      age.motionFast,
    normal:    age.motionNormal,
    slow:      age.motionSlow,
    damping:   age.motionDamping,
    stiffness: age.motionStiffness,
  };

  return {
    source:     config,
    colors,
    shapes,
    typography,
    motion,
    isDark: category === "TECHNOLOGY",
  };
}

// ─── Convenience: pre-built theme catalog ────────────────────────────────────
// Common combinations ready to import by name — zero config required.

export const TESO_THEMES = {
  beautyYoungFemale:  generateTesoTheme({ category: "BEAUTY",     targetAge: "YOUNG",  targetGender: "FEMALE"  }),
  beautyAdultFemale:  generateTesoTheme({ category: "BEAUTY",     targetAge: "ADULT",  targetGender: "FEMALE"  }),
  beautyOlderFemale:  generateTesoTheme({ category: "BEAUTY",     targetAge: "OLDER",  targetGender: "FEMALE"  }),
  wellnessYoung:      generateTesoTheme({ category: "WELLNESS",   targetAge: "YOUNG",  targetGender: "NEUTRAL" }),
  wellnessAdult:      generateTesoTheme({ category: "WELLNESS",   targetAge: "ADULT",  targetGender: "NEUTRAL" }),
  wellnessOlder:      generateTesoTheme({ category: "WELLNESS",   targetAge: "OLDER",  targetGender: "NEUTRAL" }),
  healthAdult:        generateTesoTheme({ category: "HEALTH",     targetAge: "ADULT",  targetGender: "NEUTRAL" }),
  healthOlder:        generateTesoTheme({ category: "HEALTH",     targetAge: "OLDER",  targetGender: "NEUTRAL" }),
  techYoungMale:      generateTesoTheme({ category: "TECHNOLOGY", targetAge: "YOUNG",  targetGender: "MALE"    }),
  techAdult:          generateTesoTheme({ category: "TECHNOLOGY", targetAge: "ADULT",  targetGender: "NEUTRAL" }),
} as const satisfies Record<string, TesoTheme>;
