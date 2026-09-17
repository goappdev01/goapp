import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ORBITAS_CONTRATADAS, ORBITAS_CATALOGO } from "@/data/mockEconomia";
import type { OrbitaEstado } from "@/types/economia";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";
import { orbitName, orbitDesc, orbitCat } from "@/utils/orbitI18n";

const BG   = "#F7F8FA";
const CARD = "#FFFFFF";
const BORD = "rgba(0,0,0,0.08)";
const TEXT = "#111827";
const GRAY = "#6B7280";
const DIM  = "#9CA3AF";

type Pestaña = "contratadas" | "catalogo";

export function OrbitasScreen({ guidanceLevel = 5 }: { guidanceLevel?: number }) {
  const { lang } = useLanguage();
  const [pestaña, setPestaña] = useState<Pestaña>("contratadas");
  const [expandida, setExpandida] = useState<string | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const ESTADO_CONFIG: Record<OrbitaEstado, { label: string; color: string }> = {
    no_contratada: { label: lang === "en" ? "Not contracted" : "No contratada", color: DIM      },
    prueba:        { label: lang === "en" ? "Trial"          : "Prueba",        color: "#f59e0b" },
    activa:        { label: lang === "en" ? "Active"         : "Activa",        color: "#3D9A84" },
    pausada:       { label: lang === "en" ? "Paused"         : "Pausada",       color: GRAY      },
    vencida:       { label: lang === "en" ? "Expired"        : "Vencida",       color: "#ef4444" },
    cancelada:     { label: lang === "en" ? "Cancelled"      : "Cancelada",     color: "#ef4444" },
    premium:       { label: "Premium",                                           color: "#7C69BE" },
  };

  return (
    <View style={s.container}>
      <View style={s.tabs}>
        <Tab
          label={lang === "en" ? "My orbits" : "Mis órbitas"}
          active={pestaña === "contratadas"}
          onPress={() => setPestaña("contratadas")}
        />
        <Tab
          label={lang === "en" ? "Catalogue" : "Catálogo"}
          active={pestaña === "catalogo"}
          onPress={() => setPestaña("catalogo")}
        />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
        {pestaña === "contratadas" ? (
          <>
            <SummaryRow
              lang={lang}
              total={ORBITAS_CONTRATADAS.filter((o) => o.estado === "activa").length}
              prueba={ORBITAS_CONTRATADAS.filter((o) => o.estado === "prueba").length}
              pausadas={ORBITAS_CONTRATADAS.filter((o) => o.estado === "pausada").length}
              vencidas={ORBITAS_CONTRATADAS.filter((o) => o.estado === "vencida").length}
            />
            {ORBITAS_CONTRATADAS.map((o) => {
              const cfg = ESTADO_CONFIG[o.estado];
              const pct = Math.min(100, Math.round((o.usoActual / o.limiteUsoMensual) * 100));
              const isOpen = expandida === o.orbitId;
              return (
                <TouchableOpacity
                  key={o.orbitId}
                  activeOpacity={0.85}
                  onPress={() => setExpandida(isOpen ? null : o.orbitId)}
                  style={[s.card, isOpen && { borderColor: cfg.color + "44" }]}
                >
                  <View style={s.cardRow}>
                    <View style={[s.orbitIcon, { backgroundColor: o.color + "18" }]}>
                      <Feather name={o.icono as any} size={18} color={o.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.orbitNombre}>{orbitName(o.orbitId, o.nombre, lang)}</Text>
                      <Text style={s.orbitDesc}>{orbitDesc(o.orbitId, o.descripcion, lang)}</Text>
                    </View>
                    <View style={{ alignItems: "flex-end", gap: 4 }}>
                      <View style={[s.estadoBadge, { backgroundColor: cfg.color + "15", borderColor: cfg.color + "30" }]}>
                        <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.label}</Text>
                      </View>
                      <Text style={s.precioTxt}>
                        {o.precioMensual} €<Text style={s.periodoTxt}>/{lang === "en" ? "mo" : "mes"}</Text>
                      </Text>
                    </View>
                  </View>

                  {(o.estado === "activa" || o.estado === "prueba") && (
                    <View style={s.usoBox}>
                      <View style={s.usoRow}>
                        <Text style={s.usoLabel}>{lang === "en" ? "Monthly usage" : "Uso mensual"}</Text>
                        <Text style={s.usoValor}>{o.usoActual.toLocaleString()} / {o.limiteUsoMensual.toLocaleString()}</Text>
                      </View>
                      <View style={s.progressBg}>
                        <View style={[s.progressFill, { width: `${pct}%` as any, backgroundColor: pct > 85 ? "#ef4444" : "#3D9A84" }]} />
                      </View>
                    </View>
                  )}

                  {isOpen && (
                    <View style={s.expanded}>
                      <Row label={lang === "en" ? "Activation" : "Activación"} value={o.fechaActivacion} />
                      <Row label={lang === "en" ? "Renewal"    : "Renovación"} value={o.fechaRenovacion} />
                      <Row label={lang === "en" ? "Users"      : "Usuarios"}   value={`${o.usuariosPermitidos} ${lang === "en" ? "allowed" : "permitidos"}`} />
                      <Row label={lang === "en" ? "AI included" : "IA incluida"} value={o.iaIncluida ? (lang === "en" ? "Yes" : "Sí") : "No"} />
                      <Row label={lang === "en" ? "Suggestions" : "Sugerencias"} value={o.sugerenciasIncluidas ? (lang === "en" ? "Yes" : "Sí") : "No"} />
                      <View style={s.actionRow}>
                        {o.estado === "activa" && (
                          <ActionBtn label={lang === "en" ? "Pause"      : "Pausar"}    color={GRAY}      icon="pause-circle" />
                        )}
                        {o.estado === "pausada" && (
                          <ActionBtn label={lang === "en" ? "Reactivate" : "Reactivar"} color="#3D9A84"   icon="play-circle"  />
                        )}
                        {o.estado === "vencida" && (
                          <ActionBtn label={lang === "en" ? "Renew"      : "Renovar"}   color="#f59e0b"   icon="refresh-cw"   />
                        )}
                        <ActionBtn label={lang === "en" ? "Cancel" : "Cancelar"} color="#ef4444" icon="x-circle" />
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        ) : (
          <>
            {guidanceCfg.hintMaxCount > 0 && (
              <Text style={s.catalogoHint}>
                {lang === "en" ? "Activate new orbits for your business" : "Activa nuevas órbitas para tu empresa"}
              </Text>
            )}
            {ORBITAS_CATALOGO.filter(
              (c) => !ORBITAS_CONTRATADAS.find(
                (cc) => cc.orbitId === c.orbitId && (cc.estado === "activa" || cc.estado === "prueba")
              )
            ).map((o) => (
              <View key={o.orbitId} style={s.card}>
                <View style={s.cardRow}>
                  <View style={[s.orbitIcon, { backgroundColor: o.color + "18" }]}>
                    <Feather name={o.icono as any} size={20} color={o.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.orbitNombre}>{orbitName(o.orbitId, o.nombre, lang)}</Text>
                    <Text style={s.orbitDesc}>{orbitDesc(o.orbitId, o.descripcion, lang)}</Text>
                    <View style={s.tagsRow}>
                      {o.iaIncluida && <Tag label={lang === "en" ? "AI" : "IA"} color="#7C69BE" />}
                      {o.sugerenciasIncluidas && <Tag label={lang === "en" ? "Suggestions" : "Sugerencias"} color={GRAY} />}
                      <Tag label={orbitCat(o.categoria, lang).toUpperCase()} color={GRAY} />
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <Text style={s.catalogoPrecio}>{o.precioMensualBase} €</Text>
                    <Text style={s.catalogoPeriodo}>/{lang === "en" ? "mo" : "mes"}</Text>
                  </View>
                </View>
                <View style={s.actionRow}>
                  <ActionBtn label={lang === "en" ? "Start trial"  : "Iniciar prueba"} color={GRAY}      icon="play-circle" />
                  <ActionBtn label={lang === "en" ? "Activate now" : "Activar ahora"}  color="#4A80BD"   icon="plus-circle"  primary />
                </View>
              </View>
            ))}
          </>
        )}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

function Tab({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={[s.tab, active && s.tabActive]}>
      <Text style={[s.tabTxt, active && s.tabTxtActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function Tag({ label, color }: { label: string; color: string }) {
  return (
    <View style={[s.tag, { backgroundColor: color + "15", borderColor: color + "30" }]}>
      <Text style={[s.tagTxt, { color }]}>{label}</Text>
    </View>
  );
}

function ActionBtn({ label, color, icon, primary }: { label: string; color: string; icon: keyof typeof Feather.glyphMap; primary?: boolean }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      style={[s.actionBtn, { borderColor: color + "40", backgroundColor: primary ? color + "12" : BG }]}
    >
      <Feather name={icon} size={13} color={color} />
      <Text style={[s.actionBtnTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

function SummaryRow({ total, prueba, pausadas, vencidas, lang }: { total: number; prueba: number; pausadas: number; vencidas: number; lang: string }) {
  return (
    <View style={s.summaryRow}>
      <SumChip label={lang === "en" ? "Active"  : "Activas"}  value={total}    color="#3D9A84" />
      <SumChip label={lang === "en" ? "Trial"   : "Prueba"}   value={prueba}   color="#f59e0b" />
      <SumChip label={lang === "en" ? "Paused"  : "Pausadas"} value={pausadas} color={GRAY}    />
      <SumChip label={lang === "en" ? "Expired" : "Vencidas"} value={vencidas} color="#ef4444" />
    </View>
  );
}

function SumChip({ label, value, color }: { label: string; value: number; color: string }) {
  const labelFs = label.length > 7 ? 7.5 : label.length > 5 ? 8.5 : 9;
  return (
    <View style={[s.sumChip, { borderColor: color + "30" }]}>
      <Text style={[s.sumVal, { color }]}>{value}</Text>
      <Text style={[s.sumLabel, { fontSize: labelFs }]} numberOfLines={1}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:       { flex: 1, backgroundColor: BG },
  tabs:            { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 8 },
  tab:             { flex: 1, paddingVertical: 9, borderRadius: 10, backgroundColor: CARD, alignItems: "center", borderWidth: 1, borderColor: BORD },
  tabActive:       { backgroundColor: "#EFF6FF", borderColor: "#4A80BD44" },
  tabTxt:          { fontSize: 13, color: DIM, fontWeight: "600" },
  tabTxtActive:    { color: "#4A80BD", fontWeight: "700" },
  summaryRow:      { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  sumChip:         { flex: 1, borderWidth: 1, borderRadius: 10, padding: 8, alignItems: "center", backgroundColor: CARD },
  sumVal:          { fontSize: 18, fontWeight: "900", marginBottom: 2 },
  sumLabel:        { fontSize: 9, color: DIM, fontWeight: "600", textTransform: "uppercase" },
  card:            { marginHorizontal: 16, marginBottom: 10, backgroundColor: CARD, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: BORD,
                     shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  cardRow:         { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  orbitIcon:       { width: 42, height: 42, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  orbitNombre:     { fontSize: 15, color: TEXT, fontWeight: "700", marginBottom: 3 },
  orbitDesc:       { fontSize: 12, color: GRAY, lineHeight: 17 },
  estadoBadge:     { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 2 },
  estadoTxt:       { fontSize: 10, fontWeight: "700" },
  precioTxt:       { fontSize: 13, color: TEXT, fontWeight: "700" },
  periodoTxt:      { fontSize: 11, color: DIM, fontWeight: "400" },
  catalogoPrecio:  { fontSize: 18, color: TEXT, fontWeight: "800" },
  catalogoPeriodo: { fontSize: 11, color: DIM, textAlign: "right" },
  usoBox:          { marginTop: 10 },
  usoRow:          { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  usoLabel:        { fontSize: 11, color: GRAY },
  usoValor:        { fontSize: 11, color: GRAY, fontWeight: "600" },
  progressBg:      { height: 3, borderRadius: 2, backgroundColor: BORD, overflow: "hidden" },
  progressFill:    { height: 3, borderRadius: 2 },
  expanded:        { marginTop: 12, gap: 6, borderTopWidth: 1, borderTopColor: BORD, paddingTop: 12 },
  row:             { flexDirection: "row", justifyContent: "space-between" },
  rowLabel:        { fontSize: 12, color: GRAY },
  rowValue:        { fontSize: 12, color: TEXT, fontWeight: "600" },
  actionRow:       { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  actionBtn:       { flex: 1, flexDirection: "row", gap: 5, alignItems: "center", justifyContent: "center", paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1 },
  actionBtnTxt:    { fontSize: 12, fontWeight: "600" },
  catalogoHint:    { fontSize: 12, color: DIM, marginHorizontal: 16, marginBottom: 12, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: "600" },
  tagsRow:         { flexDirection: "row", gap: 5, marginTop: 7, flexWrap: "wrap" },
  tag:             { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  tagTxt:          { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
});
