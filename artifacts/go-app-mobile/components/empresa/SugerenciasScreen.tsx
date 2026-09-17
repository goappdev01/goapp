import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { MOCK_SUGERENCIAS } from "@/data/mockEconomia";
import type { SugerenciaEstado, SugerenciaCategoria, SugerenciaOrigen } from "@/types/economia";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

const BG   = "#F7F8FA";
const CARD = "#FFFFFF";
const BORD = "rgba(0,0,0,0.08)";
const TEXT = "#111827";
const GRAY = "#6B7280";
const DIM  = "#9CA3AF";

const CAT_ICON: Record<SugerenciaCategoria, keyof typeof Feather.glyphMap> = {
  transporte: "navigation",
  comida:     "coffee",
  viaje:      "compass",
  operativa:  "tool",
  partner:    "link",
  ia:         "cpu",
};

const SUG_TITULO_EN: Record<string, string> = {
  sug_001: "Optimised northern zone route",
  sug_002: "Daily menu available",
  sug_003: "Preventive check vehicle 3",
  sug_004: "Hotel Ibis Madrid",
  sug_005: "Automate incident reports",
  sug_006: "Uber Business available",
};

const SUG_DESC_EN: Record<string, string> = {
  sug_001: "Combines 3 pending deliveries saving 40 min.",
  sug_002: "Restaurant La Pepita: €11.50 executive menu.",
  sug_003: "Due in 5 days. Schedule workshop.",
  sug_004: "Planned trip 24–26 June. From €89.",
  sug_005: "I detected 12 repetitive patterns this month.",
  sug_006: "Airport transfer tomorrow 07:15h.",
};

const CAT_EN: Record<string, string> = {
  transporte: "transport",
  comida:     "food",
  operativa:  "operational",
  viaje:      "travel",
  ia:         "ai",
  partner:    "partner",
};

function translateSugTitulo(id: string, titulo: string, lang: string) {
  return lang === "en" ? (SUG_TITULO_EN[id] ?? titulo) : titulo;
}
function translateSugDesc(id: string, desc: string, lang: string) {
  return lang === "en" ? (SUG_DESC_EN[id] ?? desc) : desc;
}
function translateCat(cat: string, lang: string) {
  return lang === "en" ? (CAT_EN[cat] ?? cat) : cat;
}

export function SugerenciasScreen({ guidanceLevel = 5 }: { guidanceLevel?: number }) {
  const { lang } = useLanguage();
  const [filtro, setFiltro] = useState<SugerenciaEstado | "todas">("todas");
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const ESTADO_CFG: Record<SugerenciaEstado, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
    mostrada:     { label: lang === "en" ? "Shown"     : "Mostrada",    color: GRAY,      icon: "eye"          },
    seleccionada: { label: lang === "en" ? "Selected"  : "Seleccionada",color: "#4A80BD", icon: "check"        },
    convertida:   { label: lang === "en" ? "Converted" : "Convertida",  color: "#3D9A84", icon: "check-circle"  },
    ignorada:     { label: lang === "en" ? "Ignored"   : "Ignorada",    color: DIM,       icon: "minus-circle"  },
    cancelada:    { label: lang === "en" ? "Cancelled" : "Cancelada",   color: "#ef4444", icon: "x-circle"      },
  };

  const ORIGEN_CFG: Record<SugerenciaOrigen, { label: string; color: string }> = {
    ia:       { label: lang === "en" ? "AI"      : "IA",       color: "#7C69BE" },
    historial:{ label: lang === "en" ? "History" : "Historial",color: "#4A80BD" },
    partner:  { label: "Partner",                               color: "#f59e0b" },
    sistema:  { label: lang === "en" ? "System"  : "Sistema",  color: GRAY      },
  };

  const FILTROS: Array<{ key: SugerenciaEstado | "todas"; label: string }> = [
    { key: "todas",        label: lang === "en" ? "All"       : "Todas"         },
    { key: "convertida",   label: lang === "en" ? "Converted" : "Convertidas"   },
    { key: "seleccionada", label: lang === "en" ? "Selected"  : "Seleccionadas" },
    { key: "mostrada",     label: lang === "en" ? "Shown"     : "Mostradas"     },
    { key: "ignorada",     label: lang === "en" ? "Ignored"   : "Ignoradas"     },
  ];

  const sugerencias = filtro === "todas"
    ? MOCK_SUGERENCIAS
    : MOCK_SUGERENCIAS.filter(s => s.estado === filtro);

  const totalConvertidas = MOCK_SUGERENCIAS.filter(s => s.estado === "convertida").length;
  const totalMostradas   = MOCK_SUGERENCIAS.length;
  const tasaConversion   = Math.round((totalConvertidas / totalMostradas) * 100);
  const costeTotal       = MOCK_SUGERENCIAS.reduce((a, s) => a + s.costeUnitario, 0);

  return (
    <View style={s.container}>
      <View style={s.resumenRow}>
        <StatChip label={lang === "en" ? "Shown"      : "Mostradas"}   value={totalMostradas.toString()}   color={GRAY}      />
        <StatChip label={lang === "en" ? "Converted"  : "Convertidas"} value={totalConvertidas.toString()} color="#3D9A84"   />
        <StatChip label={lang === "en" ? "Conv. rate" : "Conversión"}  value={`${tasaConversion}%`}        color="#4A80BD"   />
        <StatChip label={lang === "en" ? "Total cost" : "Coste total"} value={`${costeTotal.toFixed(2)} €`} color="#f59e0b"  />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filtrosScroll}
        contentContainerStyle={s.filtrosCont}
      >
        {FILTROS.map((f) => (
          <TouchableOpacity
            key={f.key}
            activeOpacity={0.8}
            onPress={() => setFiltro(f.key as any)}
            style={[s.filtroBtn, filtro === f.key && s.filtroBtnActive]}
          >
            <Text style={[s.filtroTxt, filtro === f.key && s.filtroTxtActive]}>{f.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {sugerencias.map((sug) => {
          const estado = ESTADO_CFG[sug.estado];
          const origen = ORIGEN_CFG[sug.origen];
          return (
            <View key={sug.suggestionId} style={s.card}>
              <View style={s.cardTop}>
                <View style={[s.catIcon, { backgroundColor: origen.color + "18" }]}>
                  <Feather name={CAT_ICON[sug.categoria]} size={16} color={origen.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.titulo}>{translateSugTitulo(sug.suggestionId, sug.titulo, lang)}</Text>
                  <Text style={s.desc}>{translateSugDesc(sug.suggestionId, sug.descripcion, lang)}</Text>
                </View>
                <View style={[s.estadoBadge, { backgroundColor: estado.color + "15", borderColor: estado.color + "35" }]}>
                  <Feather name={estado.icon} size={10} color={estado.color} />
                  <Text style={[s.estadoTxt, { color: estado.color }]}>{estado.label}</Text>
                </View>
              </View>

              <View style={s.metaRow}>
                <View style={[s.origenBadge, { backgroundColor: origen.color + "15", borderColor: origen.color + "35" }]}>
                  <Text style={[s.origenTxt, { color: origen.color }]}>{origen.label}</Text>
                </View>
                <Text style={s.categoria}>{translateCat(sug.categoria, lang)}</Text>
                <Text style={s.coste}>{sug.costeUnitario.toFixed(2)} €</Text>
                <Text style={s.fecha}>{sug.fechaCreacion.slice(0, 10)}</Text>
              </View>
            </View>
          );
        })}

        {sugerencias.length === 0 && (
          <View style={s.empty}>
            <Feather name="inbox" size={32} color={DIM} />
            <Text style={s.emptyTxt}>{lang === "en" ? "No suggestions in this state" : "Sin sugerencias en este estado"}</Text>
          </View>
        )}

        {guidanceCfg.hintMaxCount > 0 && (
          <View style={s.infoBox}>
            <Feather name="info" size={14} color="#4A80BD" />
            <Text style={s.infoTxt}>
              {lang === "en"
                ? "Suggestions can come from AI, usage history, integrated partners or the GO system itself. Each category has a configurable unit cost."
                : "Las sugerencias pueden provenir de IA, historial de uso, partners integrados o el propio sistema GO. Cada categoría tiene un coste unitario configurable."}
            </Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={[s.statChip, { borderColor: color + "30" }]}>
      <Text style={[s.statVal, { color }]}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: BG },
  resumenRow:     { flexDirection: "row", gap: 6, padding: 16, paddingBottom: 10 },
  statChip:       { flex: 1, borderWidth: 1, borderRadius: 12, padding: 10, alignItems: "center", backgroundColor: CARD },
  statVal:        { fontSize: 16, fontWeight: "900", marginBottom: 3 },
  statLabel:      { fontSize: 9, color: DIM, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  filtrosScroll:  { maxHeight: 50 },
  filtrosCont:    { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  filtroBtn:      { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 99, backgroundColor: CARD, borderWidth: 1, borderColor: BORD },
  filtroBtnActive:{ backgroundColor: "#EFF6FF", borderColor: "#4A80BD40" },
  filtroTxt:      { fontSize: 12, color: GRAY, fontWeight: "600" },
  filtroTxtActive:{ color: "#4A80BD", fontWeight: "700" },
  card:           { backgroundColor: CARD, borderRadius: 15, padding: 15, marginBottom: 9, borderWidth: 1, borderColor: BORD,
                    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardTop:        { flexDirection: "row", alignItems: "flex-start", gap: 11, marginBottom: 11 },
  catIcon:        { width: 38, height: 38, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  titulo:         { fontSize: 14, color: TEXT, fontWeight: "800", marginBottom: 4 },
  desc:           { fontSize: 12, color: GRAY, lineHeight: 17 },
  estadoBadge:    { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4 },
  estadoTxt:      { fontSize: 9, fontWeight: "700" },
  metaRow:        { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  origenBadge:    { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  origenTxt:      { fontSize: 10, fontWeight: "700" },
  categoria:      { fontSize: 11, color: GRAY, textTransform: "capitalize", flex: 1 },
  coste:          { fontSize: 12, color: "#f59e0b", fontWeight: "700" },
  fecha:          { fontSize: 10, color: DIM },
  empty:          { alignItems: "center", paddingVertical: 48, gap: 12 },
  emptyTxt:       { fontSize: 14, color: GRAY },
  infoBox:        { flexDirection: "row", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 12, padding: 12, borderWidth: 1, borderColor: "#4A80BD25", marginTop: 8 },
  infoTxt:        { fontSize: 11, color: "#4A80BD", lineHeight: 16, flex: 1 },
});
