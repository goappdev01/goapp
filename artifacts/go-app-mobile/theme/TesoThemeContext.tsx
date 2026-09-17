/**
 * TesoThemeContext
 * ════════════════════════════════════════════════════════════════════
 * React context that provides a TesoTheme to any subtree.
 *
 * Usage — wrap a screen or module:
 *
 *   <TesoThemeProvider category="BEAUTY" targetAge="YOUNG" targetGender="FEMALE">
 *     <MyScreen />
 *   </TesoThemeProvider>
 *
 * Usage — consume inside any child component:
 *
 *   const theme = useTesoTheme();
 *   // theme.colors.primary, theme.shapes.md, theme.typography.scale …
 *
 * NOTE: This context is not applied to any module yet.
 *       It is ready to wrap any screen when needed.
 * ════════════════════════════════════════════════════════════════════
 */
import React, { createContext, useContext, useMemo } from "react";
import {
  generateTesoTheme,
  type TesoTheme,
  type TesoModuleConfig,
  type TesoCategory,
  type TesoTargetAge,
  type TesoTargetGender,
} from "./tesoThemeEngine";

// ─── Context ──────────────────────────────────────────────────────────────────

const TesoThemeContext = createContext<TesoTheme | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

type TesoThemeProviderProps = TesoModuleConfig & {
  children: React.ReactNode;
};

/**
 * Wrap any screen or module to inject a generated TesoTheme.
 * Children call `useTesoTheme()` to access it.
 */
export function TesoThemeProvider({
  category,
  targetAge,
  targetGender,
  children,
}: TesoThemeProviderProps) {
  const theme = useMemo(
    () => generateTesoTheme({ category, targetAge, targetGender }),
    [category, targetAge, targetGender],
  );

  return (
    <TesoThemeContext.Provider value={theme}>
      {children}
    </TesoThemeContext.Provider>
  );
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Returns the TesoTheme for the nearest enclosing TesoThemeProvider.
 * Throws if called outside a provider — this is intentional; modules
 * must explicitly declare their theme config.
 */
export function useTesoTheme(): TesoTheme {
  const ctx = useContext(TesoThemeContext);
  if (!ctx) {
    throw new Error(
      "[TesoTheme] useTesoTheme() must be called inside a <TesoThemeProvider>. " +
      "Every module must declare its category, targetAge, and targetGender.",
    );
  }
  return ctx;
}

/**
 * Returns the TesoTheme or null if no provider is in scope.
 * Use this in shared components that can live inside OR outside a provider.
 */
export function useTesoThemeOptional(): TesoTheme | null {
  return useContext(TesoThemeContext);
}

// ─── Re-export types for convenience ─────────────────────────────────────────

export type { TesoTheme, TesoModuleConfig, TesoCategory, TesoTargetAge, TesoTargetGender };
