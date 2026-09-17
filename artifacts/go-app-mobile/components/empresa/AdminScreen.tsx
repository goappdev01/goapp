import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Switch,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { ORBITAS_CATALOGO, MOCK_ZONAS, MOCK_PARTNERS } from "@/data/mockEconomia";
import { useLanguage } from "@/contexts/LanguageContext";
import { orbitName } from "@/utils/orbitI18n";

const NIVEL_COMERCIAL_EN: Record<string, string> = {
  bajo:    "low",
  medio:   "medium",
  alto:    "high",
  premium: "premium",
};
const PARTNER_CAT_EN: Record<string, string> = {
  transporte:  "transport",
  comida:      "food",
  viaje:       "travel",
  marketplace: "marketplace",
  servicios:   "services",
};

type Seccion =
  | "precios_orbitas"
  | "precios_zonas"
  | "precios_volumen"
  | "precios_sugerencias"
  | "precios_conversiones"
  | "partners"
  | "limites"
  | "promociones";

const MOCK_PRECIOS_SUGERENCIAS = [
  { categoria: "AI",         precioBase: 0.10, activo: true  },
  { categoria: "Partner",    precioBase: 0.05, activo: true  },
  { categoria: "History",    precioBase: 0.02, activo: true  },
  { categoria: "System",     precioBase: 0.01, activo: true  },
  { categoria: "Transport",  precioBase: 0.05, activo: true  },
  { categoria: "Food",       precioBase: 0.03, activo: false },
];

const MOCK_PRECIOS_SUGERENCIAS_ES = [
  { categoria: "IA",         precioBase: 0.10, activo: true  },
  { categoria: "Partner",    precioBase: 0.05, activo: true  },
  { categoria: "Historial",  precioBase: 0.02, activo: true  },
  { categoria: "Sistema",    precioBase: 0.01, activo: true  },
  { categoria: "Transporte", precioBase: 0.05, activo: true  },
  { categoria: "Comida",     precioBase: 0.03, activo: false },
];

const MOCK_PROMOS = [
  { codigo: "PRIMERA3",   desc_en: "3 months first plan",    desc_es: "3 meses primer plan",     dto: "30%", activo: true,  vence: "2025-12-31" },
  { codigo: "ORBITA50",   desc_en: "50% new orbit",          desc_es: "50% órbita nueva",         dto: "50%", activo: false, vence: "2025-07-01" },
  { codigo: "ENTERPRISE", desc_en: "Enterprise discount",    desc_es: "Descuento enterprise",     dto: "20%", activo: true,  vence: "2026-01-01" },
];

export function AdminScreen({ guidanceLevel: _g = 5 }: { guidanceLevel?: number }) {
  const { lang } = useLanguage();
  const [seccionAbierta, setSeccionAbierta] = useState<Seccion | null>("precios_orbitas");

  const SECCIONES: Array<{ key: Seccion; label: string; icon: keyof typeof Feather.glyphMap; color: string }> = [
    { key: "precios_orbitas",      label: lang === 'en' ? "Orbit prices"        : "Precios órbitas",     icon: "layers",      color: "#8b5cf6" },
    { key: "precios_zonas",        label: lang === 'en' ? "Prices by zone"      : "Precios por zona",    icon: "map-pin",     color: "#f97316" },
    { key: "precios_volumen",      label: lang === 'en' ? "Volume & blocks"     : "Volumen y bloques",   icon: "bar-chart-2", color: "#3b82f6" },
    { key: "precios_sugerencias",  label: lang === 'en' ? "Suggestions"         : "Sugerencias",         icon: "zap",         color: "#f59e0b" },
    { key: "precios_conversiones", label: lang === 'en' ? "Conversions"         : "Conversiones",        icon: "percent",     color: "#3D9A84" },
    { key: "partners",             label: "Partners",                                                     icon: "link",        color: "#ec4899" },
    { key: "limites",              label: lang === 'en' ? "Limits & alerts"     : "Límites y alertas",   icon: "shield",      color: "#ef4444" },
    { key: "promociones",          label: lang === 'en' ? "Discounts & promos"  : "Descuentos y promos", icon: "tag",         color: "#0891b2" },
  ];

  const MOCK_LIMITES = [
    { nombre: lang === 'en' ? "Monthly cost alert"      : "Alerta coste mensual",     valor: "500 €",   activo: true  },
    { nombre: lang === 'en' ? "GO limit per user"       : "Límite GO por usuario",    valor: "500/mo",  activo: true  },
    { nombre: lang === 'en' ? "Max. suggestions/day"    : "Máx. sugerencias/día",     valor: "50",      activo: true  },
    { nombre: lang === 'en' ? "Block when limit reached": "Bloqueo al superar límite",valor: lang === 'en' ? "No" : "No", activo: false },
    { nombre: lang === 'en' ? "Volume excess notif."    : "Notif. exceso volumen",    valor: "85%",     activo: true  },
  ];

  const preciosSugerencias = lang === 'en' ? MOCK_PRECIOS_SUGERENCIAS : MOCK_PRECIOS_SUGERENCIAS_ES;

  return (
    <ScrollView style={s.container} showsVerticalScrollIndicator={false}>
      <View style={s.adminBanner}>
        <Feather name="lock" size={14} color="#ef4444" />
        <Text style={s.adminBannerTxt}>
          {lang === 'en'
            ? "GO internal panel — Visible only to system administrators"
            : "Panel interno GO — Solo visible para administradores del sistema"}
        </Text>
      </View>

      {SECCIONES.map((sec) => {
        const isOpen = seccionAbierta === sec.key;
        return (
          <View key={sec.key} style={s.seccion}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSeccionAbierta(isOpen ? null : sec.key)}
              style={[s.secHeader, isOpen && { borderColor: sec.color + "44" }]}
            >
              <View style={[s.secIcon, { backgroundColor: sec.color + "22" }]}>
                <Feather name={sec.icon} size={16} color={sec.color} />
              </View>
              <Text style={s.secLabel}>{sec.label}</Text>
              <Feather name={isOpen ? "chevron-up" : "chevron-down"} size={16} color="#555" />
            </TouchableOpacity>

            {isOpen && (
              <View style={s.secBody}>
                {sec.key === "precios_orbitas" && (
                  <>
                    <Row2 h1={lang === 'en' ? "Orbit" : "Órbita"} h2={lang === 'en' ? "Base €/mo" : "Base €/mes"} h3={lang === 'en' ? "AI +" : "IA +"} h4={lang === 'en' ? "Sug. +" : "Sug. +"} header />
                    {ORBITAS_CATALOGO.slice(0, 8).map((o) => (
                      <Row2 key={o.orbitId}
                        h1={orbitName(o.orbitId, o.nombre, lang)}
                        h2={`${o.precioMensualBase}`}
                        h3={o.iaIncluida ? "+15" : "—"}
                        h4={o.sugerenciasIncluidas ? "+10" : "—"}
                        color={o.color}
                      />
                    ))}
                    <AdminNote>
                      {lang === 'en'
                        ? "Base prices are automatically adjusted with the zone multiplier."
                        : "Los precios base se ajustan automáticamente con el multiplicador de zona."}
                    </AdminNote>
                  </>
                )}

                {sec.key === "precios_zonas" && (
                  <>
                    <Row2 h1={lang === 'en' ? "Zone" : "Zona"} h2={lang === 'en' ? "Level" : "Nivel"} h3={lang === 'en' ? "Multiplier" : "Multiplicador"} h4={lang === 'en' ? "Status" : "Estado"} header />
                    {MOCK_ZONAS.map((z) => (
                      <Row2 key={z.zoneId}
                        h1={z.barrio}
                        h2={lang === 'en' ? (NIVEL_COMERCIAL_EN[z.nivelComercial] ?? z.nivelComercial) : z.nivelComercial}
                        h3={`×${z.multiplicadorPrecio.toFixed(1)}`}
                        h4={z.activa ? (lang === 'en' ? "Active" : "Activa") : (lang === 'en' ? "Inactive" : "Inactiva")}
                        color={z.activa ? "#3D9A84" : "#C25A5A"}
                      />
                    ))}
                    <AdminNote>
                      {lang === 'en'
                        ? "Multipliers affect leads, suggestions and conversions in real time."
                        : "Los multiplicadores afectan a leads, sugerencias y conversiones en tiempo real."}
                    </AdminNote>
                  </>
                )}

                {sec.key === "precios_volumen" && (
                  <>
                    <Row2 h1={lang === 'en' ? "Block" : "Bloque"} h2="GO" h3={lang === 'en' ? "Price" : "Precio"} h4="€/GO" header />
                    <Row2 h1={lang === 'en' ? "Block S" : "Bloque S"}  h2="1,000"  h3="€9.90"  h4="0.0099" color="#3b82f6" />
                    <Row2 h1={lang === 'en' ? "Block M" : "Bloque M"}  h2="5,000"  h3="€39.90" h4="0.0080" color="#3b82f6" />
                    <Row2 h1={lang === 'en' ? "Block L" : "Bloque L"}  h2="10,000" h3="€69.90" h4="0.0070" color="#3b82f6" />
                    <Row2 h1={lang === 'en' ? "Per active user" : "Por usuario activo"} h2="—" h3="€2.50" h4="—" color="#8b5cf6" />
                    <AdminNote>
                      {lang === 'en'
                        ? "The per-active-user price applies when the plan limit is exceeded."
                        : "El precio por usuario activo se aplica cuando supera el límite del plan."}
                    </AdminNote>
                  </>
                )}

                {sec.key === "precios_sugerencias" && (
                  <>
                    <Row2 h1={lang === 'en' ? "Type" : "Tipo"} h2={lang === 'en' ? "€/unit" : "€/unidad"} h3="" h4={lang === 'en' ? "Active" : "Activo"} header />
                    {preciosSugerencias.map((p, i) => (
                      <Row2 key={i}
                        h1={p.categoria}
                        h2={`${p.precioBase.toFixed(2)} €`}
                        h3=""
                        h4={p.activo ? (lang === 'en' ? "Yes" : "Sí") : "No"}
                        color={p.activo ? "#f59e0b" : "#555"}
                      />
                    ))}
                    <AdminNote>
                      {lang === 'en'
                        ? "Partner suggestions include an additional commission when activated."
                        : "Las sugerencias de partners incluyen comisión adicional al activarse."}
                    </AdminNote>
                  </>
                )}

                {sec.key === "precios_conversiones" && (
                  <>
                    <Row2 h1="Partner" h2={lang === 'en' ? "Lead €" : "Lead €"} h3={lang === 'en' ? "Conv. €" : "Conv. €"} h4={lang === 'en' ? "Commission" : "Comisión"} header />
                    {MOCK_PARTNERS.filter(p => p.activo).map((p) => (
                      <Row2 key={p.partnerId}
                        h1={p.nombre}
                        h2={`${p.costeLead.toFixed(2)} €`}
                        h3={`${p.costeConversion.toFixed(2)} €`}
                        h4={`${p.porcentajeComision}%`}
                        color={p.color === "#000000" ? "#fff" : p.color}
                      />
                    ))}
                    <AdminNote>
                      {lang === 'en'
                        ? "Commission percentages apply to the net transaction amount."
                        : "Los porcentajes de comisión se aplican sobre el importe neto de la transacción."}
                    </AdminNote>
                  </>
                )}

                {sec.key === "partners" && (
                  <>
                    {MOCK_PARTNERS.map((p) => (
                      <View key={p.partnerId} style={s.partnerRow}>
                        <View style={[s.partnerDot, { backgroundColor: p.color === "#000000" ? "#fff" : p.color }]} />
                        <Text style={s.partnerNombre}>{p.nombre}</Text>
                        <Text style={s.partnerCat}>{lang === 'en' ? (PARTNER_CAT_EN[p.categoria] ?? p.categoria) : p.categoria}</Text>
                        <View style={[s.activoSwitch, { backgroundColor: p.activo ? "rgba(61,154,132,0.12)" : "#F3F4F6", borderColor: p.activo ? "rgba(61,154,132,0.3)" : "rgba(0,0,0,0.08)" }]}>
                          <Text style={[s.activoTxt, { color: p.activo ? "#3D9A84" : "#9CA3AF" }]}>
                            {p.activo ? (lang === 'en' ? "Active" : "Activo") : (lang === 'en' ? "Inactive" : "Inactivo")}
                          </Text>
                        </View>
                      </View>
                    ))}
                    <AdminNote>
                      {lang === 'en'
                        ? "Inactive partners do not generate suggestions or conversions."
                        : "Los partners inactivos no generan sugerencias ni conversiones."}
                    </AdminNote>
                  </>
                )}

                {sec.key === "limites" && (
                  <>
                    {MOCK_LIMITES.map((l, i) => (
                      <View key={i} style={s.limiteRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={s.limiteNombre}>{l.nombre}</Text>
                          <Text style={s.limiteVal}>{l.valor}</Text>
                        </View>
                        <Switch
                          value={l.activo}
                          trackColor={{ false: "#E5E7EB", true: "rgba(61,154,132,0.4)" }}
                          thumbColor={l.activo ? "#3D9A84" : "#9CA3AF"}
                        />
                      </View>
                    ))}
                  </>
                )}

                {sec.key === "promociones" && (
                  <>
                    {MOCK_PROMOS.map((p) => (
                      <View key={p.codigo} style={[s.promoCard, { borderColor: p.activo ? "rgba(61,154,132,0.3)" : "rgba(0,0,0,0.08)" }]}>
                        <View style={s.promoTop}>
                          <View style={[s.promoDtoBlock, { backgroundColor: p.activo ? "rgba(61,154,132,0.12)" : "#F3F4F6" }]}>
                            <Text style={[s.promoDtoPct, { color: p.activo ? "#3D9A84" : "#9CA3AF" }]}>{p.dto}</Text>
                            <Text style={s.promoOff}>OFF</Text>
                          </View>
                          <View style={{ flex: 1 }}>
                            <View style={s.codigoBox}>
                              <Text style={s.codigoTxt}>{p.codigo}</Text>
                            </View>
                            <Text style={s.promoDesc}>{lang === 'en' ? p.desc_en : p.desc_es}</Text>
                            <Text style={s.promoVence}>{lang === 'en' ? "Expires" : "Vence"} · {p.vence}</Text>
                          </View>
                        </View>
                      </View>
                    ))}
                    <AdminNote>
                      {lang === 'en'
                        ? "Promotional codes apply to the first billing cycle."
                        : "Los códigos promocionales se aplican al primer ciclo de facturación."}
                    </AdminNote>
                  </>
                )}
              </View>
            )}
          </View>
        );
      })}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Row2({ h1, h2, h3, h4, header, color }: { h1: string; h2: string; h3: string; h4: string; header?: boolean; color?: string }) {
  return (
    <View style={[s.row2, header && s.row2Header]}>
      <Text style={[s.row2h1, header ? s.headerTxt : { color: color ?? "#ccc" }]} numberOfLines={1}>{h1}</Text>
      <Text style={[s.row2h2, header ? s.headerTxt : { color: color ?? "#888" }]}>{h2}</Text>
      {h3 !== "" && <Text style={[s.row2h3, header ? s.headerTxt : { color: color ?? "#888" }]}>{h3}</Text>}
      <Text style={[s.row2h4, header ? s.headerTxt : { color: color ?? "#888" }]}>{h4}</Text>
    </View>
  );
}

function AdminNote({ children }: { children: string }) {
  return (
    <View style={s.noteBox}>
      <Feather name="info" size={11} color="#3b82f6" />
      <Text style={s.noteTxt}>{children}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, backgroundColor: "#F7F8FA", padding: 16 },
  adminBanner:    { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#FFF5F5", borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: "rgba(239,68,68,0.2)" },
  adminBannerTxt: { fontSize: 11, color: "#C25A5A", fontWeight: "600", flex: 1, lineHeight: 16 },
  seccion:        { marginBottom: 6 },
  secHeader:      { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  secIcon:        { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  secLabel:       { flex: 1, fontSize: 14, color: "#111827", fontWeight: "700", letterSpacing: 0.2 },
  secBody:        { backgroundColor: "#F3F4F6", borderWidth: 1, borderTopWidth: 0, borderColor: "rgba(0,0,0,0.06)", borderBottomLeftRadius: 13, borderBottomRightRadius: 13, padding: 14, gap: 2 },
  row2:           { flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  row2Header:     { borderBottomColor: "rgba(0,0,0,0.08)", paddingBottom: 6, marginBottom: 4 },
  headerTxt:      { color: "#9CA3AF", fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  row2h1:         { flex: 2, fontSize: 12, fontWeight: "600" },
  row2h2:         { flex: 1, fontSize: 12, textAlign: "center" },
  row2h3:         { flex: 1, fontSize: 12, textAlign: "center" },
  row2h4:         { flex: 1, fontSize: 12, textAlign: "right", fontWeight: "700" },
  partnerRow:     { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  partnerDot:     { width: 9, height: 9, borderRadius: 5 },
  partnerNombre:  { flex: 2, fontSize: 13, color: "#111827", fontWeight: "700" },
  partnerCat:     { flex: 1, fontSize: 11, color: "#9CA3AF", textTransform: "capitalize" },
  activoSwitch:   { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 3 },
  activoTxt:      { fontSize: 10, fontWeight: "700" },
  limiteRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  limiteNombre:   { fontSize: 13, color: "#111827", fontWeight: "600", marginBottom: 3 },
  limiteVal:      { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  promoCard:      { borderWidth: 1, borderRadius: 13, padding: 14, marginBottom: 8, backgroundColor: "#FFFFFF" },
  promoTop:       { flexDirection: "row", alignItems: "center", gap: 14 },
  promoDtoBlock:  { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center", minWidth: 60 },
  codigoBox:      { backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, alignSelf: "flex-start", marginBottom: 5 },
  codigoTxt:      { fontSize: 10, color: "#6B7280", fontWeight: "800", fontFamily: "monospace" as any, letterSpacing: 1 },
  promoDesc:      { fontSize: 13, color: "#111827", fontWeight: "600", marginBottom: 3 },
  promoVence:     { fontSize: 10, color: "#9CA3AF", letterSpacing: 0.3 },
  promoDtoPct:    { fontSize: 30, fontWeight: "900", lineHeight: 32 },
  promoOff:       { fontSize: 9, fontWeight: "800", color: "#9CA3AF", letterSpacing: 1, marginTop: 1 },
  noteBox:        { flexDirection: "row", gap: 7, alignItems: "flex-start", marginTop: 8, backgroundColor: "#EFF6FF", borderRadius: 9, padding: 10 },
  noteTxt:        { fontSize: 11, color: "#3B82F6", lineHeight: 15, flex: 1 },
});
