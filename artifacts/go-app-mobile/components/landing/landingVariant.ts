// Adapted from the isolated visual registry in b8254e5. Presentation only.
export type LandingVisualVariant = "actual" | "marca" | "identidad" | "planeta";
export const LANDING_VISUAL_VARIANTS = [
  { key: "actual", label: "A · Landing actual", description: "Presentación conservada, con sus textos y colores." },
  { key: "marca", label: "B · GO con marca de agua", description: "Fondo oscuro y marca GO; órbitas minimalistas." },
  { key: "identidad", label: "C · Identidad orbital", description: "Marca geométrica orbital; órbitas minimalistas." },
  { key: "planeta", label: "D · Landing planeta", description: "Planeta y espacio actuales; órbitas minimalistas." },
] as const;
export function isLandingVisualVariant(value: unknown): value is LandingVisualVariant {
  return LANDING_VISUAL_VARIANTS.some(item => item.key === value);
}
export function resolveUserLandingVariant(view: unknown, ready: boolean, onLanding: boolean,
  active: LandingVisualVariant, preview: LandingVisualVariant | null): LandingVisualVariant {
  if (view !== "USER" || !ready || !onLanding) return "actual";
  return isLandingVisualVariant(preview) ? preview : isLandingVisualVariant(active) ? active : "actual";
}
