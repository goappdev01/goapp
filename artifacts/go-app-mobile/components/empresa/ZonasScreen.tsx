import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { MOCK_ZONAS, MOCK_REGLAS } from "@/data/mockEconomia";
import type { NivelComercial } from "@/types/economia";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

const LIGHT = {
  BG:   "#F7F8FA",
  CARD: "#FFFFFF",
  BORD: "rgba(0,0,0,0.08)",
  TEXT: "#111827",
  GRAY: "#6B7280",
  DIM:  "#9CA3AF",
  TAB_ACTIVE_BG:   "#EFF6FF",
  TAB_ACTIVE_BORD: "#4A80BD44",
  TAB_ACTIVE_TXT:  "#4A80BD",
  HINT:            "#6B7280",
  EXPANDED_BG:     "transparent",
};
const DARK = {
  BG:   "#0D0E11",
  CARD: "#1A1B1F",
  BORD: "rgba(255,255,255,0.08)",
  TEXT: "#FFFFFF",
  GRAY: "rgba(255,255,255,0.50)",
  DIM:  "rgba(255,255,255,0.28)",
  TAB_ACTIVE_BG:   "rgba(74,128,189,0.22)",
  TAB_ACTIVE_BORD: "rgba(74,128,189,0.40)",
  TAB_ACTIVE_TXT:  "#6aabff",
  HINT:            "rgba(255,255,255,0.40)",
  EXPANDED_BG:     "transparent",
};

type Tab = "zonas" | "reglas";

const ZONA_BARRIO_EN: Record<string, string> = {
  "Centro / Sol":      "Centre / Sol",
  "Chamartín / Norte": "Chamartín / North",
  "Eixample":          "Eixample",
  "Periferia":         "Outskirts",
  "Aeropuerto IFEMA":  "IFEMA Airport",
  "Zona rural":        "Rural Area",
};
const ZONA_PAIS_EN: Record<string, string> = {
  "España": "Spain",
};

const ZONA_DESC_EN: Record<string, string> = {
  zone_madrid_centro:  "Premium centre of Madrid, maximum demand.",
  zone_madrid_norte:   "Business zone north of Madrid.",
  zone_bcn_eixample:   "Commercial hub of Barcelona.",
  zone_mad_periferia:  "Peripheral residential area.",
  zone_aeropuerto_mad: "Adolfo Suárez Airport — high punctual demand.",
  zone_rural_castilla: "Rural area with low commercial density.",
};

const RULE_CAT_EN: Record<string, string> = {
  transporte: "transport",
  comida:     "food",
  operativa:  "operational",
  ia:         "ai",
};

const EVENT_TYPE_EN: Record<string, string> = {
  conversion: "conversion",
  lead:       "lead",
  sugerencia: "suggestion",
};

function translateZonaDesc(id: string, desc: string, lang: string) {
  return lang === "en" ? (ZONA_DESC_EN[id] ?? desc) : desc;
}
function translateRuleCat(cat: string, lang: string) {
  return lang === "en" ? (RULE_CAT_EN[cat] ?? cat) : cat;
}
function translateEventType(tipo: string, lang: string) {
  return lang === "en" ? (EVENT_TYPE_EN[tipo] ?? tipo) : tipo;
}

export function ZonasScreen({ guidanceLevel = 5, dark = false }: { guidanceLevel?: number; dark?: boolean }) {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<Tab>("zonas");
  const [expandida, setExpandida] = useState<string | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);
  const C = dark ? DARK : LIGHT;

  const NIVEL_CFG: Record<NivelComercial, { label: string; color: string }> = {
    bajo:    { label: lang === "en" ? "Low"     : "Bajo",    color: C.DIM     },
    medio:   { label: lang === "en" ? "Medium"  : "Medio",   color: "#4A80BD" },
    alto:    { label: lang === "en" ? "High"    : "Alto",    color: "#f59e0b" },
    premium: { label: "Premium",                              color: "#C4883A" },
  };

  return (
    <View style={[s.container, { backgroundColor: C.BG }]}>
      <View style={s.tabs}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTab("zonas")}
          style={[s.tab, { backgroundColor: C.CARD, borderColor: C.BORD },
            tab === "zonas" && { backgroundColor: C.TAB_ACTIVE_BG, borderColor: C.TAB_ACTIVE_BORD }]}
        >
          <Text style={[s.tabTxt, { color: C.DIM },
            tab === "zonas" && { color: C.TAB_ACTIVE_TXT, fontWeight: "700" }]}>
            {lang === "en" ? "Zones" : "Zonas"}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTab("reglas")}
          style={[s.tab, { backgroundColor: C.CARD, borderColor: C.BORD },
            tab === "reglas" && { backgroundColor: C.TAB_ACTIVE_BG, borderColor: C.TAB_ACTIVE_BORD }]}
        >
          <Text style={[s.tabTxt, { color: C.DIM },
            tab === "reglas" && { color: C.TAB_ACTIVE_TXT, fontWeight: "700" }]}>
            {lang === "en" ? "Rules" : "Reglas"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {tab === "zonas" ? (
          <>
            {guidanceCfg.hintMaxCount > 0 && (
              <Text style={[s.hint, { color: C.HINT }]}>
                {lang === "en"
                  ? "Zones allow automatic price adjustments based on commercial density and demand in each area."
                  : "Las zonas permiten ajustar precios automáticamente según la densidad comercial y demanda de cada área."}
              </Text>
            )}
            {MOCK_ZONAS.map((z) => {
              const nivel = NIVEL_CFG[z.nivelComercial];
              const isOpen = expandida === z.zoneId;
              return (
                <TouchableOpacity
                  key={z.zoneId}
                  activeOpacity={0.85}
                  onPress={() => setExpandida(isOpen ? null : z.zoneId)}
                  style={[s.card, { backgroundColor: C.CARD, borderColor: isOpen ? nivel.color + "55" : C.BORD }]}
                >
                  <View style={s.cardHeader}>
                    <View style={s.cardLeft}>
                      <View style={[s.nivelDot, { backgroundColor: nivel.color }]} />
                      <View>
                        <Text style={[s.zonaNombre, { color: C.TEXT }]}>{lang === "en" ? (ZONA_BARRIO_EN[z.barrio] ?? z.barrio) : z.barrio}</Text>
                        <Text style={[s.zonaSub, { color: C.GRAY }]}>{z.ciudad} · {lang === "en" ? (ZONA_PAIS_EN[z.pais] ?? z.pais) : z.pais}</Text>
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.multiplicador, { color: nivel.color }]}>×{z.multiplicadorPrecio.toFixed(1)}</Text>
                      <View style={[s.nivelBadge, { backgroundColor: nivel.color + "22", borderColor: nivel.color + "40" }]}>
                        <Text style={[s.nivelTxt, { color: nivel.color }]}>{nivel.label}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={s.densidadRow}>
                    <Text style={[s.densidadLabel, { color: C.GRAY }]}>{lang === "en" ? "Commercial density" : "Densidad comercial"}</Text>
                    <View style={[s.progressBg, { backgroundColor: C.BORD }]}>
                      <View style={[s.progressFill, { width: `${z.densidad}%` as any, backgroundColor: nivel.color }]} />
                    </View>
                    <Text style={[s.densidadVal, { color: nivel.color }]}>{z.densidad}%</Text>
                  </View>

                  {isOpen && (
                    <View style={[s.expanded, { borderTopColor: C.BORD }]}>
                      <Row label={lang === "en" ? "Radius"           : "Radio"}          value={`${z.radio.toLocaleString()} m`}    textColor={C.TEXT} labelColor={C.GRAY} />
                      <Row label="Coords"                                                  value={`${z.coordenadas.lat.toFixed(4)}, ${z.coordenadas.lng.toFixed(4)}`} textColor={C.TEXT} labelColor={C.GRAY} />
                      <Row label={lang === "en" ? "Commercial level" : "Nivel comercial"} value={nivel.label}                        textColor={nivel.color} labelColor={C.GRAY} />
                      <Row label={lang === "en" ? "Multiplier"       : "Multiplicador"}   value={`×${z.multiplicadorPrecio.toFixed(2)}`} textColor={nivel.color} labelColor={C.GRAY} />
                      <Row label={lang === "en" ? "Status"           : "Estado"}          value={z.activa ? (lang === "en" ? "Active" : "Activa") : (lang === "en" ? "Inactive" : "Inactiva")} textColor={z.activa ? "#3D9A84" : "#ef4444"} labelColor={C.GRAY} />
                      <Text style={[s.zonaDesc, { color: C.GRAY }]}>{translateZonaDesc(z.zoneId, z.descripcion, lang)}</Text>
                      <Text style={s.reglasEnZona}>
                        {MOCK_REGLAS.filter(r => r.zoneId === z.zoneId).length} {lang === "en" ? "active rules" : "reglas activas"}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <>
            {guidanceCfg.hintMaxCount > 0 && (
              <Text style={[s.hint, { color: C.HINT }]}>
                {lang === "en"
                  ? "Each rule calculates the final price by combining the orbit base price with the zone multiplier."
                  : "Cada regla calcula el precio final combinando el precio base de la órbita con el multiplicador de la zona."}
              </Text>
            )}
            {MOCK_REGLAS.map((r) => {
              const zona = MOCK_ZONAS.find(z => z.zoneId === r.zoneId);
              const nivel = zona ? NIVEL_CFG[zona.nivelComercial] : { label: "—", color: C.DIM };
              return (
                <View key={r.ruleId} style={[s.reglaCard, { backgroundColor: C.CARD, borderColor: C.BORD }]}>
                  <View style={s.reglaTop}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.reglaZona, { color: C.TEXT }]}>{lang === "en" ? (ZONA_BARRIO_EN[zona?.barrio ?? ""] ?? zona?.barrio ?? r.zoneId) : (zona?.barrio ?? r.zoneId)}</Text>
                      <Text style={[s.reglaOrbit, { color: C.GRAY }]}>{r.orbitId.replace("orb_", "")} · {translateRuleCat(r.categoria, lang)} · {translateEventType(r.tipoEvento, lang)}</Text>
                    </View>
                    <View style={[s.nivelBadge, { backgroundColor: nivel.color + "22", borderColor: nivel.color + "40" }]}>
                      <Text style={[s.nivelTxt, { color: nivel.color }]}>{nivel.label}</Text>
                    </View>
                  </View>
                  <View style={s.precioRow}>
                    <PrecioChip label={lang === "en" ? "Base"  : "Base"}  value={`${r.precioBase.toFixed(2)} €`}      color={C.GRAY}      cardBg={C.BG} bord={C.BORD} dim={C.DIM} />
                    <Text style={[s.times, { color: C.DIM }]}>×</Text>
                    <PrecioChip label={lang === "en" ? "Zone"  : "Zona"}  value={r.multiplicadorZona.toFixed(1)}       color={nivel.color} cardBg={C.BG} bord={C.BORD} dim={C.DIM} />
                    <Text style={[s.equals, { color: C.DIM }]}>=</Text>
                    <PrecioChip label={lang === "en" ? "Final" : "Final"} value={`${r.precioFinal.toFixed(2)} €`}      color="#3D9A84"     cardBg={C.BG} bord={C.BORD} dim={C.DIM} highlight />
                  </View>
                </View>
              );
            })}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Row({ label, value, textColor, labelColor }: { label: string; value: string; textColor?: string; labelColor?: string; color?: string }) {
  return (
    <View style={s.row}>
      <Text style={[s.rowLabel, labelColor ? { color: labelColor } : {}]}>{label}</Text>
      <Text style={[s.rowValue, textColor ? { color: textColor } : {}]}>{value}</Text>
    </View>
  );
}

function PrecioChip({ label, value, color, cardBg, bord, dim, highlight }: {
  label: string; value: string; color: string;
  cardBg: string; bord: string; dim: string; highlight?: boolean;
}) {
  return (
    <View style={[s.precioChip, { backgroundColor: highlight ? color + "20" : cardBg, borderColor: highlight ? color + "50" : bord }]}>
      <Text style={[s.precioVal, { color }]}>{value}</Text>
      <Text style={[s.precioLabel, { color: dim }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1 },
  tabs:          { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  tab:           { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: "center", borderWidth: 1 },
  tabTxt:        { fontSize: 13, fontWeight: "600" },
  hint:          { fontSize: 12, paddingHorizontal: 16, marginBottom: 12, lineHeight: 18 },
  card:          { marginHorizontal: 16, marginBottom: 10, borderRadius: 16, padding: 14, borderWidth: 1,
                   shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardHeader:    { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  cardLeft:      { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  nivelDot:      { width: 10, height: 10, borderRadius: 5 },
  zonaNombre:    { fontSize: 15, fontWeight: "700", marginBottom: 2 },
  zonaSub:       { fontSize: 11 },
  multiplicador: { fontSize: 20, fontWeight: "900", marginBottom: 4 },
  nivelBadge:    { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  nivelTxt:      { fontSize: 10, fontWeight: "700" },
  densidadRow:   { flexDirection: "row", alignItems: "center", gap: 8 },
  densidadLabel: { fontSize: 10, width: 110 },
  progressBg:    { flex: 1, height: 4, borderRadius: 2, overflow: "hidden" },
  progressFill:  { height: 4, borderRadius: 2 },
  densidadVal:   { fontSize: 11, fontWeight: "700", width: 32, textAlign: "right" },
  expanded:      { marginTop: 12, borderTopWidth: 1, paddingTop: 12, gap: 7 },
  row:           { flexDirection: "row", justifyContent: "space-between" },
  rowLabel:      { fontSize: 12 },
  rowValue:      { fontSize: 12, fontWeight: "600" },
  zonaDesc:      { fontSize: 12, marginTop: 6, lineHeight: 17 },
  reglasEnZona:  { fontSize: 11, color: "#4A80BD", marginTop: 4, fontWeight: "600" },
  reglaCard:     { marginHorizontal: 16, marginBottom: 10, borderRadius: 14, padding: 14, borderWidth: 1,
                   shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  reglaTop:      { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  reglaZona:     { fontSize: 14, fontWeight: "700", marginBottom: 3 },
  reglaOrbit:    { fontSize: 11, textTransform: "capitalize" },
  precioRow:     { flexDirection: "row", alignItems: "center", gap: 6 },
  times:         { fontSize: 16, fontWeight: "700" },
  equals:        { fontSize: 16, fontWeight: "700" },
  precioChip:    { alignItems: "center", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1 },
  precioVal:     { fontSize: 14, fontWeight: "800" },
  precioLabel:   { fontSize: 9, fontWeight: "600", textTransform: "uppercase" },
});
