import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { MOCK_CAMPANAS, MOCK_PARTNERS } from "@/data/mockEconomia";
import type { TipoPublicidad } from "@/types/economia";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

export function PublicidadScreen({ guidanceLevel = 5 }: { guidanceLevel?: number }) {
  const { lang } = useLanguage();
  const [globalActiva, setGlobalActiva] = useState(false);
  const [slots, setSlots] = useState(() => getSlots(lang).map(s => ({ ...s })));
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const TIPO_CFG: Record<TipoPublicidad, { label: string; color: string }> = {
    banner:                  { label: "Banner",                                                         color: "#3b82f6" },
    sugerencia_patrocinada:  { label: lang === 'en' ? "Sponsored suggestion" : "Sug. patrocinada",      color: "#f59e0b" },
    orbita_patrocinada:      { label: lang === 'en' ? "Sponsored orbit"      : "Órbita patrocinada",    color: "#8b5cf6" },
    recomendacion_premium:   { label: lang === 'en' ? "Premium rec."         : "Recom. premium",        color: "#f97316" },
    partner_destacado:       { label: lang === 'en' ? "Featured partner"     : "Partner destacado",     color: "#ec4899" },
    contextual:              { label: lang === 'en' ? "Contextual"           : "Contextual",            color: "#0891b2" },
    local_zona:              { label: lang === 'en' ? "Local by zone"        : "Local por zona",        color: "#3D9A84" },
  };

  const toggleSlot = (i: number) => {
    setSlots(prev => prev.map((s, idx) => idx === i ? { ...s, activo: !s.activo } : s));
  };

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      {guidanceCfg.hintMaxCount > 0 && (
        <View style={s.futuroBanner}>
          <Feather name="clock" size={16} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={s.futuroTitle}>{lang === 'en' ? "Module in preparation" : "Módulo en preparación"}</Text>
            <Text style={s.futuroDesc}>
              {lang === 'en'
                ? "The GO advertising architecture is ready to activate as soon as the monetisation model requires it. You can prepare the configuration here."
                : "La arquitectura publicitaria GO está lista para activarse en cuanto el modelo de monetización lo requiera. Aquí puedes preparar la configuración."}
            </Text>
          </View>
        </View>
      )}

      <View style={s.globalCard}>
        <View style={{ flex: 1 }}>
          <Text style={s.globalTitle}>{lang === 'en' ? "Advertising in GO" : "Publicidad en GO"}</Text>
          <Text style={s.globalDesc}>
            {lang === 'en'
              ? "Activate the contextual advertising system. Premium plan users will never see ads."
              : "Activa el sistema de publicidad contextual. Los usuarios con plan premium nunca verán anuncios."}
          </Text>
        </View>
        <Switch
          value={globalActiva}
          onValueChange={setGlobalActiva}
          trackColor={{ false: "#E5E7EB", true: "rgba(61,154,132,0.4)" }}
          thumbColor={globalActiva ? "#3D9A84" : "#9CA3AF"}
        />
      </View>

      <Text style={s.sectionTitle}>{lang === 'en' ? "Available positions" : "Posiciones disponibles"}</Text>
      {slots.map((slot, i) => {
        const cfg = TIPO_CFG[slot.tipo];
        return (
          <View key={i} style={[s.slotCard, !globalActiva && { opacity: 0.4 }]}>
            <View style={s.slotTop}>
              <View style={{ flex: 1 }}>
                <View style={[s.tipoBadge, { backgroundColor: cfg.color + "22", borderColor: cfg.color + "44" }]}>
                  <Text style={[s.tipoTxt, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
                <Text style={s.slotPos}>{slot.posicion}</Text>
                <Text style={s.slotDesc}>{slot.desc}</Text>
              </View>
              <Switch
                value={slot.activo && globalActiva}
                onValueChange={() => { if (globalActiva) toggleSlot(i); }}
                trackColor={{ false: "#E5E7EB", true: cfg.color + "66" }}
                thumbColor={slot.activo && globalActiva ? cfg.color : "#9CA3AF"}
              />
            </View>
          </View>
        );
      })}

      <Text style={s.sectionTitle}>{lang === 'en' ? "Prepared campaigns" : "Campañas preparadas"}</Text>
      {MOCK_CAMPANAS.map((c) => {
        const partner = MOCK_PARTNERS.find(p => p.partnerId === c.partnerId);
        const cfg = TIPO_CFG[c.tipo];
        const pct = Math.round((c.gastado / c.presupuesto) * 100);
        return (
          <View key={c.campaignId} style={s.campañaCard}>
            <View style={s.campañaTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.campañaNombre}>{c.titulo}</Text>
                <Text style={s.campañaPartner}>{partner?.nombre ?? c.partnerId}</Text>
              </View>
              <View style={[s.tipoBadge, { backgroundColor: cfg.color + "22", borderColor: cfg.color + "44" }]}>
                <Text style={[s.tipoTxt, { color: cfg.color }]}>{cfg.label}</Text>
              </View>
            </View>
            <View style={s.campañaMeta}>
              <MetaItem label={lang === 'en' ? "Budget"    : "Presupuesto"} value={`${c.presupuesto.toFixed(0)} €`} color="#fff" />
              <MetaItem label={lang === 'en' ? "Spent"     : "Gastado"}     value={`${c.gastado.toFixed(0)} €`}     color="#f59e0b" />
              <MetaItem label={lang === 'en' ? "Frequency" : "Frecuencia"}  value={`×${c.frecuenciaMaxima}`}          color="#3b82f6" />
              <MetaItem label={lang === 'en' ? "Zones"     : "Zonas"}       value={`${c.zonas.length}`}              color="#8b5cf6" />
            </View>
            <View style={s.campañaProgress}>
              <View style={s.progressBg}>
                <View style={[s.progressFill, { width: `${pct}%` as any, backgroundColor: pct > 80 ? "#ef4444" : cfg.color }]} />
              </View>
              <Text style={s.progressPct}>{pct}%</Text>
            </View>
            <View style={s.periodoRow}>
              <Feather name="calendar" size={11} color="#555" />
              <Text style={s.periodoTxt}>{c.fechaInicio} → {c.fechaFin}</Text>
              <View style={[s.estadoBadge, { backgroundColor: c.activa ? "rgba(61,154,132,0.1)" : "#F3F4F6", borderColor: c.activa ? "rgba(61,154,132,0.25)" : "rgba(0,0,0,0.08)" }]}>
                <Text style={[s.estadoTxt, { color: c.activa ? "#3D9A84" : "#9CA3AF" }]}>
                  {c.activa ? (lang === 'en' ? "Active" : "Activa") : (lang === 'en' ? "Inactive" : "Inactiva")}
                </Text>
              </View>
            </View>
          </View>
        );
      })}

      <Text style={s.sectionTitle}>{lang === 'en' ? "Available ad types" : "Tipos de publicidad disponibles"}</Text>
      <View style={s.tiposGrid}>
        {Object.entries(TIPO_CFG).map(([key, cfg]) => (
          <View key={key} style={[s.tipoCard, { borderColor: cfg.color + "33" }]}>
            <View style={[s.tipoDot, { backgroundColor: cfg.color }]} />
            <Text style={[s.tipoCardTxt, { color: cfg.color }]}>{cfg.label}</Text>
          </View>
        ))}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function getSlots(lang: string) {
  return [
    { tipo: "sugerencia_patrocinada" as TipoPublicidad, posicion: lang === 'en' ? "Main feed"           : "Feed principal",      activo: false, desc: lang === 'en' ? "Appears in the user's personal suggestions list."                          : "Aparece en el listado de sugerencias personales del usuario." },
    { tipo: "orbita_patrocinada"     as TipoPublicidad, posicion: lang === 'en' ? "Orbit selector"      : "Selector de órbitas", activo: false, desc: lang === 'en' ? "Highlights an orbit or partner in the intentions carousel."                 : "Destaca una órbita o partner en el carrusel de intenciones." },
    { tipo: "partner_destacado"      as TipoPublicidad, posicion: lang === 'en' ? "Commercial level"    : "Nivel comercial",     activo: false, desc: lang === 'en' ? "Appears on the second orbital level when long-pressing an intent."           : "Aparece en el segundo nivel orbital al pulsar largo un intent." },
    { tipo: "banner"                 as TipoPublicidad, posicion: lang === 'en' ? "Business panel"      : "Panel empresa",       activo: false, desc: lang === 'en' ? "Informational banner in the business management panel."                      : "Banner informativo en el panel de gestión de empresa." },
    { tipo: "local_zona"             as TipoPublicidad, posicion: lang === 'en' ? "By geographic zone"  : "Por zona geográfica", activo: false, desc: lang === 'en' ? "Hyperlocal advertising based on the work zone."                             : "Publicidad hiperlocalizada según la zona de trabajo." },
  ];
}

function MetaItem({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={s.metaItem}>
      <Text style={[s.metaVal, { color }]}>{value}</Text>
      <Text style={s.metaLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#F7F8FA", padding: 16 },
  futuroBanner:    { flexDirection: "row", gap: 10, backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "rgba(245,158,11,0.25)" },
  futuroTitle:     { fontSize: 13, color: "#C4883A", fontWeight: "700", marginBottom: 3 },
  futuroDesc:      { fontSize: 12, color: "#6B7280", lineHeight: 16 },
  globalCard:      { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  globalTitle:     { fontSize: 15, color: "#111827", fontWeight: "700", marginBottom: 3 },
  globalDesc:      { fontSize: 12, color: "#6B7280", lineHeight: 16 },
  sectionTitle:    { fontSize: 12, color: "#9CA3AF", fontWeight: "600", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10 },
  slotCard:        { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  slotTop:         { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  tipoBadge:       { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 6 },
  tipoTxt:         { fontSize: 10, fontWeight: "700" },
  slotPos:         { fontSize: 14, color: "#111827", fontWeight: "600", marginBottom: 3 },
  slotDesc:        { fontSize: 11, color: "#6B7280", lineHeight: 15 },
  campañaCard:     { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  campañaTop:      { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10 },
  campañaNombre:   { fontSize: 14, color: "#111827", fontWeight: "700", marginBottom: 3 },
  campañaPartner:  { fontSize: 11, color: "#6B7280" },
  campañaMeta:     { flexDirection: "row", marginBottom: 10 },
  metaItem:        { flex: 1, alignItems: "center" },
  metaVal:         { fontSize: 14, fontWeight: "800", marginBottom: 2 },
  metaLabel:       { fontSize: 9, color: "#9CA3AF", fontWeight: "600", textTransform: "uppercase" },
  campañaProgress: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  progressBg:      { flex: 1, height: 4, borderRadius: 2, backgroundColor: "#E5E7EB", overflow: "hidden" },
  progressFill:    { height: 4, borderRadius: 2 },
  progressPct:     { fontSize: 10, color: "#9CA3AF", fontWeight: "600", width: 30, textAlign: "right" },
  periodoRow:      { flexDirection: "row", alignItems: "center", gap: 6 },
  periodoTxt:      { fontSize: 10, color: "#9CA3AF", flex: 1 },
  estadoBadge:     { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  estadoTxt:       { fontSize: 9, fontWeight: "700" },
  tiposGrid:       { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  tipoCard:        { flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7, backgroundColor: "#FFFFFF" },
  tipoDot:         { width: 6, height: 6, borderRadius: 3 },
  tipoCardTxt:     { fontSize: 11, fontWeight: "600" },
});
