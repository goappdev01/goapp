export type LandingVisualVariant = "actual" | "profesional" | "confianza";

export const LANDING_VISUAL_VARIANTS: ReadonlyArray<{
  key: LandingVisualVariant;
  label: string;
  description: string;
  colors: readonly [string, string, string];
}> = [
  {
    key: "actual",
    label: "Actual",
    description: "Control · aspecto original de GO",
    colors: ["#0B1120", "#D4AA3F", "#427ACC"],
  },
  {
    key: "profesional",
    label: "Profesional",
    description: "Tierra tenue, superficies sobrias y acentos contenidos",
    colors: ["#101B2C", "#263B50", "#BAA46D"],
  },
  {
    key: "confianza",
    label: "Máxima confianza",
    description: "Fondo oscuro, contraste definido y acabado mate",
    colors: ["#EDF2F5", "#16384A", "#3C7F87"],
  },
];

export function isLandingVisualVariant(value: unknown): value is LandingVisualVariant {
  return value === "actual" || value === "profesional" || value === "confianza";
}
