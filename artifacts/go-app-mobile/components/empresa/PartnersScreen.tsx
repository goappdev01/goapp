import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { MOCK_PARTNERS, MOCK_EVENTOS_PARTNER } from "@/data/mockEconomia";
import type { PartnerCategoria, EventoConversion } from "@/types/economia";
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
  KPI_BG:          "#FFFFFF",
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
  KPI_BG:          "#222328",
};

type Tab = "partners" | "eventos";

const PARTNER_DESC_EN: Record<string, string> = {
  par_uber:    "Executive transport on demand.",
  par_bolt:    "Affordable urban transport.",
  par_booking: "Hotels and accommodation worldwide.",
  par_airbnb:  "Unique accommodations and apartments.",
  par_pepita:  "Local restaurant with executive menu.",
  par_glovo:   "Express delivery across the city.",
  par_amazon:  "B2B purchases and office supplies.",
};

const CONV_ESTADO_EN: Record<string, string> = {
  completada: "completed",
  pendiente:  "pending",
  rechazada:  "rejected",
};

function translatePartnerDesc(id: string, desc: string, lang: string) {
  return lang === "en" ? (PARTNER_DESC_EN[id] ?? desc) : desc;
}
function translateConvEstado(estado: string, lang: string) {
  return lang === "en" ? (CONV_ESTADO_EN[estado] ?? estado) : estado;
}

export function PartnersScreen({ guidanceLevel: _g = 5, dark = false }: { guidanceLevel?: number; dark?: boolean }) {
  const { lang } = useLanguage();
  const [tab, setTab] = useState<Tab>("partners");
  const C = dark ? DARK : LIGHT;

  const CAT_CFG: Record<PartnerCategoria, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
    transporte:  { label: lang === "en" ? "Transport"   : "Transporte", color: "#4A80BD", icon: "navigation"  },
    comida:      { label: lang === "en" ? "Food"        : "Comida",     color: "#C97040", icon: "coffee"       },
    viaje:       { label: lang === "en" ? "Travel"      : "Viaje",      color: "#3D9A84", icon: "compass"      },
    marketplace: { label: "Marketplace",                                 color: "#f59e0b", icon: "shopping-bag" },
    servicios:   { label: lang === "en" ? "Services"    : "Servicios",  color: "#7C69BE", icon: "briefcase"    },
  };

  const EVENTO_CFG: Record<EventoConversion, { label: string; color: string }> = {
    clic:               { label: "Click",                                             color: C.GRAY    },
    lead:               { label: "Lead",                                              color: "#4A80BD" },
    apertura:           { label: lang === "en" ? "Open"              : "Apertura",   color: "#7C69BE" },
    reserva_iniciada:   { label: lang === "en" ? "Booking started"   : "Reserva inic.", color: "#f59e0b" },
    reserva_confirmada: { label: lang === "en" ? "Booking confirmed" : "Reserva conf.", color: "#C4883A" },
    compra_realizada:   { label: lang === "en" ? "Purchase"          : "Compra",     color: "#C25A5A" },
    pedido_entregado:   { label: lang === "en" ? "Delivered"         : "Entregado",  color: "#3D9A84" },
    conversion:         { label: lang === "en" ? "Conversion"        : "Conversión", color: "#3D9A84" },
    comision:           { label: lang === "en" ? "Commission"        : "Comisión",   color: "#f59e0b" },
  };

  const totalComisiones = MOCK_EVENTOS_PARTNER
    .filter(e => e.estadoConversion === "completada")
    .reduce((acc, e) => acc + (e.importe * e.porcentaje / 100), 0);

  const totalLeads = MOCK_EVENTOS_PARTNER.filter(e => e.tipoEvento === "lead" || e.tipoEvento === "clic").length;
  const totalConversiones = MOCK_EVENTOS_PARTNER.filter(e => e.estadoConversion === "completada").length;

  return (
    <View style={[s.container, { backgroundColor: C.BG }]}>
      <View style={s.kpisRow}>
        <KpiChip label={lang === "en" ? "Commissions" : "Comisiones"}  value={`${totalComisiones.toFixed(2)} €`} color="#3D9A84" bg={C.KPI_BG} bord={C.BORD} dim={C.DIM} />
        <KpiChip label="Leads"                                           value={totalLeads.toString()}             color="#4A80BD" bg={C.KPI_BG} bord={C.BORD} dim={C.DIM} />
        <KpiChip label={lang === "en" ? "Conversions" : "Conversiones"} value={totalConversiones.toString()}      color="#f59e0b" bg={C.KPI_BG} bord={C.BORD} dim={C.DIM} />
      </View>

      <View style={s.kpisRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTab("partners")}
          style={[s.tab, { backgroundColor: C.CARD, borderColor: C.BORD },
            tab === "partners" && { backgroundColor: C.TAB_ACTIVE_BG, borderColor: C.TAB_ACTIVE_BORD }]}
        >
          <Text style={[s.tabTxt, { color: C.DIM },
            tab === "partners" && { color: C.TAB_ACTIVE_TXT, fontWeight: "700" }]}>Partners</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setTab("eventos")}
          style={[s.tab, { backgroundColor: C.CARD, borderColor: C.BORD },
            tab === "eventos" && { backgroundColor: C.TAB_ACTIVE_BG, borderColor: C.TAB_ACTIVE_BORD }]}
        >
          <Text style={[s.tabTxt, { color: C.DIM },
            tab === "eventos" && { color: C.TAB_ACTIVE_TXT, fontWeight: "700" }]}>
            {lang === "en" ? "Events" : "Eventos"}
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }}>
        {tab === "partners" ? (
          <>
            {MOCK_PARTNERS.map((p) => {
              const cat = CAT_CFG[p.categoria];
              const eventosPart = MOCK_EVENTOS_PARTNER.filter(e => e.partnerId === p.partnerId);
              const comisionPart = eventosPart
                .filter(e => e.estadoConversion === "completada")
                .reduce((a, e) => a + (e.importe * e.porcentaje / 100), 0);
              return (
                <View key={p.partnerId} style={[s.partnerCard, { backgroundColor: C.CARD, borderColor: C.BORD }, !p.activo && { opacity: 0.55 }]}>
                  <View style={s.partnerTop}>
                    <View style={[s.partnerIcon, { backgroundColor: cat.color + "22" }]}>
                      <Feather name={p.logo as any} size={18} color={cat.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.partnerNombre, { color: C.TEXT }]}>{p.nombre}</Text>
                      <Text style={[s.partnerDesc, { color: C.GRAY }]}>{translatePartnerDesc(p.partnerId, p.descripcion, lang)}</Text>
                    </View>
                    <View>
                      <View style={[s.catBadge, { backgroundColor: cat.color + "22", borderColor: cat.color + "40" }]}>
                        <Feather name={cat.icon} size={10} color={cat.color} />
                        <Text style={[s.catTxt, { color: cat.color }]}>{cat.label}</Text>
                      </View>
                      {!p.activo && (
                        <View style={[s.inactivoBadge, { borderColor: C.BORD }]}>
                          <Text style={[s.inactivoTxt, { color: C.GRAY }]}>{lang === "en" ? "Inactive" : "Inactivo"}</Text>
                        </View>
                      )}
                    </View>
                  </View>

                  <View style={[s.tarifasRow, { borderTopColor: C.BORD }]}>
                    <Tarifa label="Lead"                                              value={`${p.costeLead.toFixed(2)} €`}       color="#4A80BD" bord={C.BORD} dim={C.DIM} />
                    <Tarifa label={lang === "en" ? "Conversion" : "Conversión"}      value={`${p.costeConversion.toFixed(2)} €`} color="#f59e0b" bord={C.BORD} dim={C.DIM} />
                    <Tarifa label={lang === "en" ? "Commission" : "Comisión"}        value={`${p.porcentajeComision}%`}          color="#3D9A84" bord={C.BORD} dim={C.DIM} />
                    <Tarifa label={lang === "en" ? "Generated"  : "Generado"}        value={`${comisionPart.toFixed(2)} €`}      color="#C25A5A" bord={C.BORD} dim={C.DIM} last />
                  </View>

                  {eventosPart.length > 0 && (
                    <Text style={[s.eventosCount, { color: C.DIM }]}>
                      {eventosPart.length} {lang === "en" ? "registered events" : "eventos registrados"}
                    </Text>
                  )}
                </View>
              );
            })}
          </>
        ) : (
          <>
            {MOCK_EVENTOS_PARTNER.map((ev) => {
              const partner = MOCK_PARTNERS.find(p => p.partnerId === ev.partnerId);
              const evCfg = EVENTO_CFG[ev.tipoEvento];
              const cat = CAT_CFG[ev.categoria];
              const comision = ev.importe > 0 && ev.porcentaje > 0 ? (ev.importe * ev.porcentaje / 100) : 0;
              return (
                <View key={ev.eventoId} style={[s.eventoCard, { backgroundColor: C.CARD, borderColor: C.BORD }]}>
                  <View style={s.eventoTop}>
                    <View style={[s.eventoBadge, { backgroundColor: evCfg.color + "22", borderColor: evCfg.color + "40" }]}>
                      <Text style={[s.eventoBadgeTxt, { color: evCfg.color }]}>{evCfg.label}</Text>
                    </View>
                    <Text style={[s.eventoPartner, { color: C.TEXT }]}>{partner?.nombre ?? ev.partnerId}</Text>
                    <View style={[s.catBadge, { backgroundColor: cat.color + "22", borderColor: cat.color + "40" }]}>
                      <Text style={[s.catTxt, { color: cat.color }]}>{cat.label}</Text>
                    </View>
                  </View>
                  <View style={s.eventoMeta}>
                    {ev.importe > 0 && <Text style={[s.eventoImporte, { color: C.TEXT }]}>{ev.importe.toFixed(2)} €</Text>}
                    {comision > 0 && (
                      <Text style={[s.eventoComision, { color: "#3D9A84" }]}>
                        +{comision.toFixed(2)} € {lang === "en" ? "commission" : "comisión"}
                      </Text>
                    )}
                    <View style={[s.convEstado, {
                      backgroundColor: ev.estadoConversion === "completada" ? "#3D9A8425" : ev.estadoConversion === "rechazada" ? "#ef444425" : "#f59e0b25",
                      borderColor:     ev.estadoConversion === "completada" ? "#3D9A8450" : ev.estadoConversion === "rechazada" ? "#ef444450" : "#f59e0b50",
                    }]}>
                      <Text style={[s.convEstadoTxt, {
                        color: ev.estadoConversion === "completada" ? "#3D9A84" : ev.estadoConversion === "rechazada" ? "#ef4444" : "#f59e0b",
                      }]}>{translateConvEstado(ev.estadoConversion, lang)}</Text>
                    </View>
                    <Text style={[s.eventoFecha, { color: C.DIM }]}>{ev.fecha.slice(11, 16)}</Text>
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

function KpiChip({ label, value, color, bg, bord, dim }: { label: string; value: string; color: string; bg: string; bord: string; dim: string }) {
  return (
    <View style={[s.kpiChip, { borderColor: color + "35", backgroundColor: bg }]}>
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
      <Text style={[s.kpiLabel, { color: dim }]}>{label}</Text>
    </View>
  );
}

function Tarifa({ label, value, color, bord, dim, last }: { label: string; value: string; color: string; bord: string; dim: string; last?: boolean }) {
  return (
    <View style={[s.tarifaItem, last ? { borderRightWidth: 0 } : { borderRightColor: bord }]}>
      <Text style={[s.tarifaVal, { color }]}>{value}</Text>
      <Text style={[s.tarifaLabel, { color: dim }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1 },
  kpisRow:        { flexDirection: "row", gap: 8, padding: 16, paddingBottom: 10 },
  kpiChip:        { flex: 1, borderWidth: 1, borderRadius: 14, padding: 12, alignItems: "center" },
  kpiVal:         { fontSize: 19, fontWeight: "900", marginBottom: 3 },
  kpiLabel:       { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  tab:            { flex: 1, paddingVertical: 10, borderRadius: 11, alignItems: "center", borderWidth: 1 },
  tabTxt:         { fontSize: 13, fontWeight: "600" },
  partnerCard:    { borderRadius: 18, padding: 16, marginBottom: 10, borderWidth: 1,
                    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  partnerTop:     { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 14 },
  partnerIcon:    { width: 44, height: 44, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  partnerNombre:  { fontSize: 15, fontWeight: "800", marginBottom: 3 },
  partnerDesc:    { fontSize: 11, lineHeight: 15 },
  catBadge:       { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 4, alignSelf: "flex-start" },
  catTxt:         { fontSize: 9, fontWeight: "700" },
  inactivoBadge:  { marginTop: 5, borderWidth: 1, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 2, alignSelf: "flex-end" },
  inactivoTxt:    { fontSize: 9, fontWeight: "600" },
  tarifasRow:     { flexDirection: "row", borderTopWidth: 1, paddingTop: 12 },
  tarifaItem:     { flex: 1, alignItems: "center", paddingVertical: 4, borderRightWidth: 1 },
  tarifaVal:      { fontSize: 15, fontWeight: "800", marginBottom: 3 },
  tarifaLabel:    { fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  eventosCount:   { fontSize: 10, marginTop: 10, textAlign: "right" },
  eventoCard:     { borderRadius: 13, padding: 14, marginBottom: 8, borderWidth: 1 },
  eventoTop:      { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" },
  eventoBadge:    { borderWidth: 1, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4 },
  eventoBadgeTxt: { fontSize: 10, fontWeight: "700" },
  eventoPartner:  { fontSize: 13, fontWeight: "700", flex: 1 },
  eventoMeta:     { flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" },
  eventoImporte:  { fontSize: 15, fontWeight: "800" },
  eventoComision: { fontSize: 12, fontWeight: "700" },
  convEstado:     { borderWidth: 1, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  convEstadoTxt:  { fontSize: 9, fontWeight: "700", textTransform: "capitalize" },
  eventoFecha:    { fontSize: 10, marginLeft: "auto" },
});
