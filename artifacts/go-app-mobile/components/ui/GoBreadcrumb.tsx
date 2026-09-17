/**
 * GoBreadcrumb
 * ─────────────────────────────────────────────────────────────────────────────
 * Indicador informativo de posición dentro de pantallas de configuración.
 * Solo informa — no añade botones, no genera navegación paralela.
 *
 * Uso:
 *   <GoBreadcrumb crumbs={["Empresa", "Configuración", "Horario"]} />
 */
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface GoBreadcrumbProps {
  crumbs: string[];
  color?: string;
}

export function GoBreadcrumb({ crumbs, color }: GoBreadcrumbProps) {
  if (crumbs.length < 2) return null;

  return (
    <View style={s.row}>
      {crumbs.map((crumb, i) => {
        const isLast = i === crumbs.length - 1;
        return (
          <React.Fragment key={i}>
            <Text
              style={[
                s.crumb,
                isLast && s.crumbActive,
                isLast && color ? { color } : undefined,
              ]}
              numberOfLines={1}
            >
              {crumb}
            </Text>
            {!isLast && <Text style={s.sep}>›</Text>}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "nowrap",
    paddingHorizontal: 16,
    paddingVertical: 5,
    gap: 3,
  },
  crumb: {
    fontSize: 10,
    fontWeight: "500",
    color: "#9CA3AF",
    letterSpacing: 0.1,
  },
  crumbActive: {
    fontWeight: "700",
    color: "#6B7280",
  },
  sep: {
    fontSize: 10,
    color: "#C5C9D0",
    lineHeight: 14,
  },
});
