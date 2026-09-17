import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { PLANES, MOCK_EMPRESA } from "@/data/mockEconomia";
import type { PlanTipo } from "@/types/economia";
import { useLanguage } from "@/contexts/LanguageContext";

const BG   = "#F7F8FA";
const CARD = "#FFFFFF";
const BORD = "rgba(0,0,0,0.08)";
const TEXT = "#111827";
const GRAY = "#6B7280";
const DIM  = "#9CA3AF";

const PLAN_COLORS: Record<PlanTipo, string> = {
  free:       "#8A9BB5",
  pro:        "#4A80BD",
  empresa:    "#3D9A84",
  enterprise: "#C4883A",
};

export function PlanScreen({ guidanceLevel: _g = 5 }: { guidanceLevel?: number }) {
  const { lang } = useLanguage();
  const [planSeleccionado, setPlanSeleccionado] = useState<PlanTipo>(MOCK_EMPRESA.plan);

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.empresaCard}>
        <View style={s.empresaRow}>
          <View style={[s.planBadge, { backgroundColor: PLAN_COLORS[MOCK_EMPRESA.plan] + "18", borderColor: PLAN_COLORS[MOCK_EMPRESA.plan] + "40" }]}>
            <Text style={[s.planBadgeTxt, { color: PLAN_COLORS[MOCK_EMPRESA.plan] }]}>
              {PLANES.find(p => p.tipo === MOCK_EMPRESA.plan)?.nombre ?? "—"}
            </Text>
          </View>
          <Text style={s.renewTxt}>
            {lang === "en" ? "Renews" : "Renueva"} {MOCK_EMPRESA.proximaRenovacion}
          </Text>
        </View>
        <Text style={s.empresaNombre}>{MOCK_EMPRESA.nombre}</Text>
        <View style={s.statsRow}>
          <StatChip label={lang === "en" ? "Users"        : "Usuarios"}  value={`${MOCK_EMPRESA.usuariosActivos}/${MOCK_EMPRESA.usuariosLicencia}`} color="#4A80BD" />
          <StatChip label={lang === "en" ? "Monthly cost" : "Coste mes"} value={`${MOCK_EMPRESA.costeEstimadoMes.toFixed(2)} €`}                   color="#3D9A84" />
        </View>
      </View>

      <Text style={s.sectionTitle}>{lang === "en" ? "Available plans" : "Planes disponibles"}</Text>

      {PLANES.map((plan) => {
        const activo = plan.tipo === MOCK_EMPRESA.plan;
        const color  = PLAN_COLORS[plan.tipo];
        const seleccionado = planSeleccionado === plan.tipo;
        const currentPrice = PLANES.find(p => p.tipo === MOCK_EMPRESA.plan)?.precioMensual ?? 0;
        return (
          <TouchableOpacity
            key={plan.tipo}
            activeOpacity={0.8}
            onPress={() => setPlanSeleccionado(plan.tipo)}
            style={[s.planCard, seleccionado && { borderColor: color, borderWidth: 1.5 }]}
          >
            <View style={s.planHeader}>
              <View>
                <Text style={s.planNombre}>{plan.nombre}</Text>
                <Text style={s.planDesc}>{
                  lang === "en" ? ({
                    free:       "For small teams looking to try GO.",
                    pro:        "For growing teams with advanced needs.",
                    empresa:    "For companies with complex operations and multiple departments.",
                    enterprise: "Complete solution for large corporations. Customisable.",
                  } as Record<string, string>)[plan.tipo] ?? plan.descripcion : plan.descripcion
                }</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.planPrecio, { color }]}>
                  {plan.precioMensual === 0 ? (lang === "en" ? "Free" : "Gratis") : `${plan.precioMensual} €`}
                </Text>
                {plan.precioMensual > 0 && <Text style={s.planPeriodo}>{lang === "en" ? "/mo" : "/mes"}</Text>}
              </View>
            </View>

            <View style={s.planFeatures}>
              <Feature icon="zap"        label={`${plan.goIncluidos >= 999999 ? "∞" : plan.goIncluidos.toLocaleString()} GO ${lang === "en" ? "included" : "incluidos"}`}                                                   color={color} />
              <Feature icon="users"      label={`${plan.usuariosIncluidos >= 999999 ? "∞" : plan.usuariosIncluidos} ${lang === "en" ? "users" : "usuarios"}`}                                                               color={color} />
              <Feature icon="layers"     label={`${plan.orbitasIncluidas >= 999999 ? "∞" : plan.orbitasIncluidas} ${lang === "en" ? "orbits" : "órbitas"}`}                                                                 color={color} />
              <Feature icon="cpu"        label={plan.iaIncluida ? (lang === "en" ? "AI included" : "IA incluida") : (lang === "en" ? "No AI" : "Sin IA")}                                                                   color={plan.iaIncluida ? color : DIM} />
              <Feature icon="headphones" label={`${lang === "en" ? "Support" : "Soporte"} ${lang === "en" ? ({ basico: "basic", prioritario: "priority", dedicado: "dedicated" } as Record<string, string>)[plan.soporte] ?? plan.soporte : plan.soporte}`} color={color} />
            </View>

            {activo && (
              <View style={[s.activoBadge, { backgroundColor: color + "15", borderColor: color + "40" }]}>
                <Feather name="check-circle" size={12} color={color} />
                <Text style={[s.activoTxt, { color }]}>{lang === "en" ? "Current plan" : "Plan actual"}</Text>
              </View>
            )}

            {!activo && seleccionado && (
              <TouchableOpacity style={[s.upgradeBtn, { backgroundColor: color }]} activeOpacity={0.8}>
                <Text style={s.upgradeBtnTxt}>
                  {plan.precioMensual < currentPrice
                    ? (lang === "en" ? "Switch to this plan" : "Cambiar a este plan")
                    : (lang === "en" ? "Upgrade plan" : "Actualizar plan")}
                </Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Feature({ icon, label, color }: { icon: keyof typeof Feather.glyphMap; label: string; color: string }) {
  return (
    <View style={s.feature}>
      <Feather name={icon} size={13} color={color} />
      <Text style={s.featureTxt}>{label}</Text>
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.statChip, { borderColor: color + "30" }]}>
      <Text style={[s.statValue, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: BG, padding: 16 },
  empresaCard:   { backgroundColor: CARD, borderRadius: 18, padding: 20, marginBottom: 22, borderWidth: 1, borderColor: BORD,
                   shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  empresaRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  planBadge:     { borderWidth: 1, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 4 },
  planBadgeTxt:  { fontSize: 11, fontWeight: "800", letterSpacing: 0.5 },
  renewTxt:      { fontSize: 11, color: DIM, fontWeight: "500" },
  empresaNombre: { fontSize: 19, color: TEXT, fontWeight: "800", marginBottom: 16, letterSpacing: -0.3 },
  statsRow:      { flexDirection: "row", gap: 10 },
  statChip:      { flex: 1, borderWidth: 1, borderRadius: 13, padding: 12, alignItems: "center", backgroundColor: BG },
  statValue:     { fontSize: 16, fontWeight: "900", marginBottom: 3 },
  statLabel:     { fontSize: 9, color: DIM, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  sectionTitle:  { fontSize: 11, color: DIM, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 12 },
  planCard:      { backgroundColor: CARD, borderRadius: 18, padding: 18, marginBottom: 10, borderWidth: 1, borderColor: BORD,
                   shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  planHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  planNombre:    { fontSize: 17, color: TEXT, fontWeight: "800", marginBottom: 4, letterSpacing: -0.2 },
  planDesc:      { fontSize: 12, color: GRAY, maxWidth: 200, lineHeight: 17 },
  planPrecio:    { fontSize: 26, fontWeight: "900", lineHeight: 28 },
  planPeriodo:   { fontSize: 11, color: DIM, textAlign: "right", marginTop: 2 },
  planFeatures:  { gap: 9 },
  feature:       { flexDirection: "row", alignItems: "center", gap: 9 },
  featureTxt:    { fontSize: 13, color: GRAY },
  activoBadge:   { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 9, borderWidth: 1, alignSelf: "flex-start" },
  activoTxt:     { fontSize: 11, fontWeight: "800" },
  upgradeBtn:    { marginTop: 16, borderRadius: 11, paddingVertical: 12, alignItems: "center" },
  upgradeBtnTxt: { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
