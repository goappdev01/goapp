import type { LandingVisualVariant } from "./landingVariant";

// Presentation only: no sizes, coordinates, gestures, routes or category state.
// `actual` deliberately has no theme: the original values remain the control.
export interface LandingVisualTheme {
  variant: Exclude<LandingVisualVariant, "actual">;
  background: string;
  earthOpacity: number;
  veil: string;
  tint: string;
  topFade: string;
  bottomFade: string;
  spaceOpacity: number;
  shadowOpacity: number;
  shadowRadius: number;
  glowOpacity: number;
  shineOuter: string;
  shineInner: string;
  coreBorder: string;
  coreText: string;
  satelliteBackground: string;
  satelliteBorder: string;
  satelliteText: string;
  satelliteIcon: string;
  satelliteGradient: [string, string, string, string];
  humanityRing: string;
  humanityLimb: string;
}

const PROFESSIONAL: LandingVisualTheme = {
  variant: "profesional",
  background: "#0D1725",
  earthOpacity: 0.60,
  veil: "rgba(8,18,31,0.34)",
  tint: "rgba(16,32,48,0.24)",
  topFade: "rgba(8,17,29,0.86)",
  bottomFade: "rgba(8,17,29,0.68)",
  spaceOpacity: 0.035,
  shadowOpacity: 0.12,
  shadowRadius: 7,
  glowOpacity: 0,
  shineOuter: "transparent",
  shineInner: "transparent",
  coreBorder: "#8596A7",
  coreText: "#FFFFFF",
  satelliteBackground: "rgba(23,38,53,0.96)",
  satelliteBorder: "#536373",
  satelliteText: "#EFF4FA",
  satelliteIcon: "#C4D3DF",
  satelliteGradient: ["#24364B", "#203146", "#1C2C40", "#18283A"],
  humanityRing: "rgba(152,182,208,0.24)",
  humanityLimb: "rgba(139,169,194,0.07)",
};

const CONFIDENCE: LandingVisualTheme = {
  variant: "confianza",
  background: "#152333",
  earthOpacity: 0.22,
  veil: "rgba(16,30,45,0.28)",
  tint: "rgba(26,45,61,0.28)",
  topFade: "rgba(17,31,46,0.76)",
  bottomFade: "rgba(17,31,46,0.62)",
  spaceOpacity: 0,
  shadowOpacity: 0,
  shadowRadius: 0,
  glowOpacity: 0,
  shineOuter: "transparent",
  shineInner: "transparent",
  coreBorder: "#B9C8D4",
  coreText: "#172638",
  satelliteBackground: "rgba(15,28,41,0.38)",
  satelliteBorder: "#ADBCCB",
  satelliteText: "#FFFFFF",
  satelliteIcon: "#E1EBF3",
  satelliteGradient: ["#EBF0F6", "#E7EDF4", "#E3EAF1", "#DFE7EF"],
  humanityRing: "rgba(172,190,209,0.22)",
  humanityLimb: "transparent",
};

export function getLandingVisualTheme(variant: LandingVisualVariant): LandingVisualTheme | undefined {
  if (variant === "profesional") return PROFESSIONAL;
  if (variant === "confianza") return CONFIDENCE;
  return undefined;
}

// The original semantic category color is an input; GO_COLORS stays unchanged.
function mixHex(color: string, target: string, amount: number): string {
  const channels = [1, 3, 5].map(offset => {
    const from = parseInt(color.slice(offset, offset + 2), 16);
    const to = parseInt(target.slice(offset, offset + 2), 16);
    return Math.round(from + (to - from) * amount).toString(16).padStart(2, "0");
  });
  return `#${channels.join("")}`;
}

export function getOrbitVisualSurface(theme: LandingVisualTheme | undefined, color: string, selected: boolean) {
  if (!theme) return undefined;
  const professional = theme.variant === "profesional";
  const ink = mixHex(color, "#172638", 0.55);
  const surface = professional ? (selected ? "#26394A" : "#172635") : (selected ? "#FFFFFF" : "#EDF1F4");
  const colors: [string, string, string, string] = [surface, surface, surface, surface];
  return {
    colors,
    icon: professional ? mixHex(color, "#FFFFFF", 0.38) : ink,
    label: professional ? "#E6EDF3" : "#182B3A",
    border: selected ? (professional ? "#FFFFFF" : ink) : (professional ? "#536373" : "#A9BAC7"),
  };
}

export function getCoreVisualGradient(theme: LandingVisualTheme, color: string): [string, string, string] {
  // Keep the intent hue recognizable without glossy or saturated surfaces.
  if (theme.variant === "confianza") {
    const surface = mixHex(color, "#E7EDF1", 0.91);
    return [surface, surface, surface];
  }
  const base = mixHex(color, "#283341", 0.78);
  return [mixHex(base, "#FFFFFF", 0.04), base, base];
}
