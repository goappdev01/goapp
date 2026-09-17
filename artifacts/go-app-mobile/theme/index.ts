/**
 * TESO Visual Theme Engine — public API
 *
 * Engine + generation:
 *   import { generateTesoTheme, TESO_THEMES, hexAlpha } from "@/theme";
 *
 * React context:
 *   import { TesoThemeProvider, useTesoTheme, useTesoThemeOptional } from "@/theme";
 *
 * Types only:
 *   import type { TesoTheme, TesoModuleConfig, TesoCategory, TesoTargetAge, TesoTargetGender } from "@/theme";
 */
export {
  generateTesoTheme,
  hexAlpha,
  TESO_THEMES,
} from "./tesoThemeEngine";

export type {
  TesoTheme,
  TesoModuleConfig,
  TesoCategory,
  TesoTargetAge,
  TesoTargetGender,
  TesoColorScale,
  TesoShapeScale,
  TesoTypographyScale,
  TesoMotionScale,
} from "./tesoThemeEngine";

export {
  TesoThemeProvider,
  useTesoTheme,
  useTesoThemeOptional,
} from "./TesoThemeContext";
