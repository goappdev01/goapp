import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { MOCK_FACTURAS } from "@/data/mockEconomia";
import type { EstadoFactura, LineaFactura } from "@/types/economia";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

const BG    = "#F7F8FA";
const CARD  = "#FFFFFF";
const BORD  = "rgba(0,0,0,0.08)";
const TEXT  = "#111827";
const GRAY  = "#6B7280";
const DIM   = "#9CA3AF";

const LINE_DESC_EN: Record<string, string> = {
  "Plan GO Empresa":         "GO Business Plan",
  "Órbita Comunicación":     "Communication Orbit",
  "Órbita RRHH":             "HR Orbit",
  "Órbita Logística":        "Logistics Orbit",
  "Órbita Mantenimiento":    "Maintenance Orbit",
  "GO adicionales (bloque)": "Additional GO (block)",
  "Sugerencias IA (extra)":  "AI Suggestions (extra)",
  "Prueba Órbita IA":        "AI Orbit Trial",
};

const MONTH_EN: Record<string, string> = {
  "Mayo 2025":  "May 2025",
  "Abril 2025": "April 2025",
  "Junio 2025": "June 2025",
};

function translateLineDesc(desc: string, lang: string) {
  return lang === "en" ? (LINE_DESC_EN[desc] ?? desc) : desc;
}

export function FacturacionScreen({ guidanceLevel = 5 }: { guidanceLevel?: number }) {
  const { lang } = useLanguage();
  const [facturaAbierta, setFacturaAbierta] = useState<string | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const ESTADO_CFG: Record<EstadoFactura, { label: string; color: string; icon: keyof typeof Feather.glyphMap }> = {
    pendiente: { label: lang === "en" ? "Pending"   : "Pendiente", color: "#f59e0b", icon: "clock"        },
    pagada:    { label: lang === "en" ? "Paid"      : "Pagada",    color: "#3D9A84", icon: "check-circle"  },
    vencida:   { label: lang === "en" ? "Overdue"   : "Vencida",   color: "#ef4444", icon: "alert-circle"  },
    cancelada: { label: lang === "en" ? "Cancelled" : "Cancelada", color: "#9CA3AF", icon: "x-circle"      },
  };

  const TIPO_COLOR: Record<LineaFactura["tipo"], string> = {
    plan:        "#4A80BD",
    orbita:      "#7C69BE",
    volumen:     "#C97040",
    sugerencias: "#f59e0b",
    leads:       "#C25A5A",
    ia:          "#3D9A84",
  };

  const totalPagado = MOCK_FACTURAS
    .filter((f) => f.estado === "pagada")
    .reduce((acc, f) => acc + f.total, 0);

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.resumen}>
        <View style={s.resumenItem}>
          <Text style={s.resumenVal}>{totalPagado.toFixed(2)} €</Text>
          <Text style={s.resumenLabel}>{lang === "en" ? "Paid this year" : "Pagado este año"}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.resumenItem}>
          <Text style={[s.resumenVal, { color: "#f59e0b" }]}>
            {MOCK_FACTURAS.find((f) => f.estado === "pendiente")?.total.toFixed(2) ?? "0.00"} €
          </Text>
          <Text style={s.resumenLabel}>{lang === "en" ? "Pending" : "Pendiente"}</Text>
        </View>
        <View style={s.divider} />
        <View style={s.resumenItem}>
          <Text style={s.resumenVal}>{MOCK_FACTURAS.length}</Text>
          <Text style={s.resumenLabel}>{lang === "en" ? "Invoices" : "Facturas"}</Text>
        </View>
      </View>

      <View style={s.metodoCard}>
        <View style={s.metodoRow}>
          <Feather name="credit-card" size={18} color="#4A80BD" />
          <View style={{ flex: 1 }}>
            <Text style={s.metodoTxt}>{lang === "en" ? "Visa card ••4521" : "Tarjeta Visa ••4521"}</Text>
            <Text style={s.metodoSub}>{lang === "en" ? "Next charge: 15 Jun 2025" : "Próximo cargo: 15 Jun 2025"}</Text>
          </View>
          <TouchableOpacity activeOpacity={0.8} style={s.metodoBtn}>
            <Text style={s.metodoBtnTxt}>{lang === "en" ? "Change" : "Cambiar"}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Text style={s.sectionTitle}>{lang === "en" ? "Invoice history" : "Historial de facturas"}</Text>

      {MOCK_FACTURAS.map((f) => {
        const cfg = ESTADO_CFG[f.estado];
        const abierta = facturaAbierta === f.facturaId;
        return (
          <TouchableOpacity
            key={f.facturaId}
            activeOpacity={0.85}
            onPress={() => setFacturaAbierta(abierta ? null : f.facturaId)}
            style={[s.facCard, abierta && { borderColor: cfg.color + "44" }]}
          >
            <View style={s.facHeader}>
              <View>
                <Text style={s.facNumero}>{f.numero}</Text>
                <Text style={s.facMes}>{lang === "en" ? (MONTH_EN[f.mes] ?? f.mes) : f.mes}</Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={s.facTotal}>{f.total.toFixed(2)} €</Text>
                <View style={[s.estadoBadge, { backgroundColor: cfg.color + "18", borderColor: cfg.color + "40" }]}>
                  <Feather name={cfg.icon} size={10} color={cfg.color} />
                  <Text style={[s.estadoTxt, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              </View>
            </View>

            {abierta && (
              <View style={s.desglose}>
                <Text style={s.desgloseTitle}>{lang === "en" ? "Breakdown" : "Desglose"}</Text>
                {f.lineas.map((l, i) => (
                  <View key={i} style={s.lineaRow}>
                    <View style={[s.lineaDot, { backgroundColor: TIPO_COLOR[l.tipo] }]} />
                    <Text style={s.lineaDesc} numberOfLines={1}>{translateLineDesc(l.descripcion, lang)}</Text>
                    <Text style={s.lineaTotal}>{l.total.toFixed(2)} €</Text>
                  </View>
                ))}
                <View style={s.linea} />
                <View style={s.lineaRow}>
                  <Text style={[s.lineaDesc, { color: GRAY }]}>Subtotal</Text>
                  <Text style={s.lineaTotal}>{f.subtotal.toFixed(2)} €</Text>
                </View>
                <View style={s.lineaRow}>
                  <Text style={[s.lineaDesc, { color: GRAY }]}>{lang === "en" ? "VAT (21%)" : "IVA (21%)"}</Text>
                  <Text style={s.lineaTotal}>{f.iva.toFixed(2)} €</Text>
                </View>
                <View style={[s.lineaRow, { marginTop: 4 }]}>
                  <Text style={[s.lineaDesc, { color: TEXT, fontWeight: "700" }]}>Total</Text>
                  <Text style={[s.lineaTotal, { color: TEXT, fontWeight: "800", fontSize: 15 }]}>{f.total.toFixed(2)} €</Text>
                </View>
                <View style={s.facActions}>
                  <FacBtn icon="download"    label={lang === "en" ? "Download PDF" : "Descargar PDF"} color="#4A80BD" />
                  {f.estado === "pendiente" && <FacBtn icon="credit-card" label={lang === "en" ? "Pay now" : "Pagar ahora"} color="#3D9A84" />}
                </View>
              </View>
            )}
          </TouchableOpacity>
        );
      })}

      {guidanceCfg.hintMaxCount > 0 && (
        <View style={s.alertCard}>
          <Feather name="bell" size={14} color="#f59e0b" />
          <View style={{ flex: 1 }}>
            <Text style={s.alertTitle}>{lang === "en" ? "Spending alerts" : "Alertas de gasto"}</Text>
            <Text style={s.alertSub}>{lang === "en" ? "Notify me if monthly cost exceeds €500" : "Avísame si el coste mensual supera 500 €"}</Text>
          </View>
          <TouchableOpacity style={s.alertBtn} activeOpacity={0.8}>
            <Text style={s.alertBtnTxt}>{lang === "en" ? "Configure" : "Configurar"}</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function FacBtn({ icon, label, color }: { icon: keyof typeof Feather.glyphMap; label: string; color: string }) {
  return (
    <TouchableOpacity activeOpacity={0.8} style={[s.facActionBtn, { borderColor: color + "55" }]}>
      <Feather name={icon} size={13} color={color} />
      <Text style={[s.facActionTxt, { color }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1, backgroundColor: BG, padding: 16 },
  resumen:       { flexDirection: "row", backgroundColor: CARD, borderRadius: 18, padding: 20, marginBottom: 14, borderWidth: 1, borderColor: BORD,
                   shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  resumenItem:   { flex: 1, alignItems: "center" },
  resumenVal:    { fontSize: 22, color: TEXT, fontWeight: "900", marginBottom: 4 },
  resumenLabel:  { fontSize: 9, color: DIM, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4 },
  divider:       { width: 1, backgroundColor: BORD, marginHorizontal: 6 },
  metodoCard:    { backgroundColor: CARD, borderRadius: 14, padding: 14, marginBottom: 20, borderWidth: 1, borderColor: BORD,
                   shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  metodoRow:     { flexDirection: "row", alignItems: "center", gap: 12 },
  metodoTxt:     { fontSize: 14, color: TEXT, fontWeight: "700", marginBottom: 2 },
  metodoSub:     { fontSize: 11, color: DIM },
  metodoBtn:     { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 9, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "#4A80BD30" },
  metodoBtnTxt:  { fontSize: 12, color: "#4A80BD", fontWeight: "700" },
  sectionTitle:  { fontSize: 11, color: DIM, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase", marginBottom: 10 },
  facCard:       { backgroundColor: CARD, borderRadius: 14, padding: 16, marginBottom: 8, borderWidth: 1, borderColor: BORD,
                   shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  facHeader:     { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  facNumero:     { fontSize: 14, color: TEXT, fontWeight: "800", marginBottom: 4 },
  facMes:        { fontSize: 12, color: GRAY },
  facTotal:      { fontSize: 20, color: TEXT, fontWeight: "900", marginBottom: 5, textAlign: "right" },
  estadoBadge:   { flexDirection: "row", alignItems: "center", gap: 4, borderWidth: 1, borderRadius: 99, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-end" },
  estadoTxt:     { fontSize: 10, fontWeight: "700" },
  desglose:      { marginTop: 14, borderTopWidth: 1, borderTopColor: BORD, paddingTop: 14, gap: 9 },
  desgloseTitle: { fontSize: 10, color: DIM, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  lineaRow:      { flexDirection: "row", alignItems: "center", gap: 9 },
  lineaDot:      { width: 6, height: 6, borderRadius: 3 },
  lineaDesc:     { flex: 1, fontSize: 12, color: GRAY },
  lineaTotal:    { fontSize: 12, color: TEXT, fontWeight: "700" },
  linea:         { height: 1, backgroundColor: BORD, marginVertical: 5 },
  facActions:    { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap" },
  facActionBtn:  { flexDirection: "row", gap: 6, alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, borderWidth: 1, backgroundColor: BG },
  facActionTxt:  { fontSize: 12, fontWeight: "700" },
  alertCard:     { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FFFBEB", borderRadius: 14, padding: 14, marginTop: 8, borderWidth: 1, borderColor: "#f59e0b25" },
  alertTitle:    { fontSize: 13, color: "#B45309", fontWeight: "700", marginBottom: 2 },
  alertSub:      { fontSize: 11, color: GRAY },
  alertBtn:      { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 9, backgroundColor: "#FEF3C7", borderWidth: 1, borderColor: "#f59e0b40" },
  alertBtnTxt:   { fontSize: 11, color: "#B45309", fontWeight: "700" },
});
