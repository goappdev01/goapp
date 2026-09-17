/**
 * SuscripcionGoScreen
 * ═══════════════════════════════════════════════════════════════════════════
 * Módulo independiente de contratación de GO Empresa / GO Reservas.
 *
 * Flujo empresa → plataforma GO (≠ cliente → empresa).
 *
 * Secciones:
 *   1. Estado actual de suscripción
 *   2. Selección de plan GO
 *   3. Ciclo de facturación (mensual / anual)
 *   4. Datos de facturación (NIF, razón social, email)
 *   5. CTA — Contratar / Cambiar plan
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { useLanguage } from "@/contexts/LanguageContext";

// ─── Visual tokens ────────────────────────────────────────────────────────────

const BG    = "#F5F3EF";
const CARD  = "#FFFFFF";
const BORD  = "rgba(0,0,0,0.07)";
const TEXT  = "#111827";
const GRAY  = "#6B7280";
const DIM   = "#9CA3AF";
const BLUE  = "#4A80BD";
const GREEN = "#3D9A84";
const GOLD  = "#C4883A";
const PURP  = "#7C69BE";

// ─── Plan definitions ─────────────────────────────────────────────────────────

type PlanId = "basico" | "pro" | "plus" | "enterprise";
type Ciclo  = "mensual" | "anual";

type PlanDef = {
  id:           PlanId;
  nombre:       string;
  color:        string;
  precioMes:    number;
  precioAnual:  number;  // precio total por año (con descuento)
  desc:         string;
  badge?:       string;
  features:     { label: string; included: boolean }[];
  limite?:      string;
};

const PLANES_GO: PlanDef[] = [
  {
    id:          "basico",
    nombre:      "GO Básico",
    color:       "#8A9BB5",
    precioMes:   0,
    precioAnual: 0,
    desc:        "Para empezar. Funcionalidades esenciales sin coste.",
    features: [
      { label: "Hasta 50 reservas/mes",          included: true  },
      { label: "1 profesional",                   included: true  },
      { label: "Ficha pública en GO",             included: true  },
      { label: "Notificaciones básicas",          included: true  },
      { label: "Calendario operativo",            included: false },
      { label: "GO Rutas y agenda de campo",      included: false },
      { label: "Módulos GO avanzados",            included: false },
      { label: "Soporte prioritario",             included: false },
    ],
    limite: "50 reservas/mes",
  },
  {
    id:          "pro",
    nombre:      "GO Pro",
    color:       BLUE,
    precioMes:   29,
    precioAnual: 290,
    desc:        "Para negocios en crecimiento con varios profesionales.",
    badge:       "MÁS POPULAR",
    features: [
      { label: "Reservas ilimitadas",             included: true  },
      { label: "Hasta 5 profesionales",           included: true  },
      { label: "Ficha pública destacada",         included: true  },
      { label: "Notificaciones avanzadas",        included: true  },
      { label: "Calendario operativo",            included: true  },
      { label: "GO Rutas y agenda de campo",      included: false },
      { label: "Módulos GO avanzados",            included: false },
      { label: "Soporte prioritario",             included: false },
    ],
  },
  {
    id:          "plus",
    nombre:      "GO Plus",
    color:       GREEN,
    precioMes:   79,
    precioAnual: 790,
    desc:        "Para negocios consolidados. Acceso total a la plataforma.",
    features: [
      { label: "Reservas ilimitadas",             included: true  },
      { label: "Profesionales ilimitados",        included: true  },
      { label: "Ficha pública destacada",         included: true  },
      { label: "Notificaciones avanzadas",        included: true  },
      { label: "Calendario operativo",            included: true  },
      { label: "GO Rutas y agenda de campo",      included: true  },
      { label: "Módulos GO avanzados",            included: true  },
      { label: "Soporte prioritario",             included: true  },
    ],
  },
  {
    id:          "enterprise",
    nombre:      "GO Enterprise",
    color:       GOLD,
    precioMes:   0,
    precioAnual: 0,
    desc:        "Para franquicias y cadenas. Precio a medida.",
    features: [
      { label: "Todo lo de GO Plus",              included: true  },
      { label: "Multi-sede y franquicias",        included: true  },
      { label: "SLA y soporte dedicado",          included: true  },
      { label: "Integraciones personalizadas",    included: true  },
      { label: "Panel de administración central", included: true  },
      { label: "Formación y onboarding",          included: true  },
      { label: "Facturación centralizada",        included: true  },
      { label: "Acceso a API GO",                 included: true  },
    ],
  },
];

// ─── Component ────────────────────────────────────────────────────────────────

export function SuscripcionGoScreen({ guidanceLevel: _g = 5 }: { guidanceLevel?: number }) {
  const { config } = useBusinessConfig();

  const [planElegido, setPlanElegido] = useState<PlanId>("pro");
  const [ciclo,       setCiclo]       = useState<Ciclo>("mensual");
  const [nif,         setNif]         = useState("");
  const [razonSocial, setRazonSocial] = useState(config.businessName ?? "");
  const [emailFact,   setEmailFact]   = useState("");

  const planActual = PLANES_GO.find(p => p.id === planElegido)!;
  const precioVis  = ciclo === "anual"
    ? planActual.precioAnual
    : planActual.precioMes;
  const ahorro     = ciclo === "anual" && planActual.precioMes > 0
    ? planActual.precioMes * 12 - planActual.precioAnual
    : 0;

  const puedeContratar = planElegido !== "enterprise" && nif.trim().length >= 5 && razonSocial.trim().length >= 2 && emailFact.trim().includes("@");

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: BG }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 48, paddingTop: 4 }}
    >

      {/* ── Banner MODO DEMO ── */}
      <View style={{
        margin: 16, marginBottom: 8,
        backgroundColor: GOLD + "0C",
        borderRadius: 16, padding: 14,
        borderWidth: 1.5, borderColor: GOLD + "35",
        flexDirection: "row", alignItems: "flex-start", gap: 10,
      }}>
        <Feather name="alert-triangle" size={16} color={GOLD} style={{ marginTop: 1 }} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: "900", color: GOLD, letterSpacing: 0.4 }}>
              MODO DEMO
            </Text>
            <View style={{ backgroundColor: GOLD + "22", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 1 }}>
              <Text style={{ fontSize: 9, fontWeight: "800", color: GOLD }}>DESARROLLO</Text>
            </View>
          </View>
          <Text style={{ fontSize: 12, color: GRAY, lineHeight: 17 }}>
            Esta pantalla es funcional en diseño pero no procesa pagos reales. En producción conectará con el sistema de facturación de GO.
          </Text>
        </View>
      </View>

      {/* ── 1. Estado actual ── */}
      <SectionLabel icon="star" label="SUSCRIPCIÓN ACTUAL" />
      <View style={{
        marginHorizontal: 16, marginBottom: 20,
        backgroundColor: CARD, borderRadius: 18,
        borderWidth: 1, borderColor: BORD,
        padding: 18,
      }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <View style={{
            width: 44, height: 44, borderRadius: 14,
            backgroundColor: "#8A9BB5" + "18",
            borderWidth: 1.5, borderColor: "#8A9BB5" + "40",
            alignItems: "center", justifyContent: "center",
          }}>
            <Feather name="package" size={20} color="#8A9BB5" />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ fontSize: 16, fontWeight: "900", color: TEXT }}>GO Básico</Text>
              <View style={{ backgroundColor: "#8A9BB5" + "18", borderRadius: 7, paddingHorizontal: 8, paddingVertical: 2 }}>
                <Text style={{ fontSize: 9, fontWeight: "800", color: "#8A9BB5", letterSpacing: 0.5 }}>PLAN ACTUAL</Text>
              </View>
            </View>
            <Text style={{ fontSize: 12, color: DIM, marginTop: 2 }}>Demo · Sin renovación activa</Text>
          </View>
          <Text style={{ fontSize: 20, fontWeight: "900", color: TEXT }}>0 €</Text>
        </View>

        <View style={{
          marginTop: 14, flexDirection: "row", alignItems: "center", gap: 8,
          backgroundColor: GOLD + "08", borderRadius: 12,
          padding: 10, borderWidth: 1, borderColor: GOLD + "25",
        }}>
          <Feather name="info" size={13} color={GOLD} />
          <Text style={{ flex: 1, fontSize: 11, color: GRAY, lineHeight: 16 }}>
            Para activar un plan de pago selecciona una opción a continuación y completa los datos de facturación.
          </Text>
        </View>
      </View>

      {/* ── 2. Ciclo de facturación ── */}
      <SectionLabel icon="refresh-cw" label="CICLO DE FACTURACIÓN" />
      <View style={{ marginHorizontal: 16, marginBottom: 20 }}>
        <View style={{
          flexDirection: "row",
          backgroundColor: "rgba(0,0,0,0.05)",
          borderRadius: 14, padding: 4, gap: 4,
        }}>
          {(["mensual", "anual"] as Ciclo[]).map((c) => {
            const active = ciclo === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setCiclo(c); }}
                activeOpacity={0.82}
                style={{
                  flex: 1, flexDirection: "row", alignItems: "center",
                  justifyContent: "center", gap: 6, paddingVertical: 11,
                  backgroundColor: active ? CARD : "transparent",
                  borderRadius: 11,
                  shadowColor: "#000", shadowOpacity: active ? 0.07 : 0,
                  shadowRadius: 6, elevation: active ? 2 : 0,
                }}
              >
                <Text style={{ fontSize: 13, fontWeight: "700", color: active ? TEXT : DIM }}>
                  {c === "mensual" ? "Mensual" : "Anual"}
                </Text>
                {c === "anual" && (
                  <View style={{ backgroundColor: GREEN + "18", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 9, fontWeight: "800", color: GREEN }}>−2 MESES</Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* ── 3. Selección de plan ── */}
      <SectionLabel icon="layers" label="ELIGE TU PLAN GO" />
      <View style={{ marginHorizontal: 16, marginBottom: 20, gap: 10 }}>
        {PLANES_GO.map((plan) => {
          const active = planElegido === plan.id;
          const precio = ciclo === "anual" ? plan.precioAnual : plan.precioMes;
          const esEnterprise = plan.id === "enterprise";
          return (
            <TouchableOpacity
              key={plan.id}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); setPlanElegido(plan.id); }}
              activeOpacity={0.82}
              style={{
                backgroundColor: active ? plan.color + "08" : CARD,
                borderRadius: 20, padding: 16,
                borderWidth: 1.5,
                borderColor: active ? plan.color : BORD,
                shadowColor: active ? plan.color : "#000",
                shadowOpacity: active ? 0.12 : 0.04,
                shadowRadius: 10, shadowOffset: { width: 0, height: 2 },
                elevation: active ? 4 : 1,
              }}
            >
              {/* Accent bar */}
              {active && (
                <View style={{
                  position: "absolute", left: 0, top: 0, bottom: 0, width: 4,
                  backgroundColor: plan.color,
                  borderTopLeftRadius: 20, borderBottomLeftRadius: 20,
                }} />
              )}

              {/* Cabecera del plan */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", paddingLeft: active ? 6 : 0 }}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: active ? plan.color : TEXT }}>
                      {plan.nombre}
                    </Text>
                    {plan.badge && (
                      <View style={{ backgroundColor: plan.color + "20", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontWeight: "900", color: plan.color, letterSpacing: 0.5 }}>
                          {plan.badge}
                        </Text>
                      </View>
                    )}
                  </View>
                  <Text style={{ fontSize: 12, color: GRAY, lineHeight: 17 }}>{plan.desc}</Text>
                </View>

                {/* Precio */}
                <View style={{ alignItems: "flex-end", marginLeft: 12 }}>
                  {esEnterprise ? (
                    <Text style={{ fontSize: 13, fontWeight: "800", color: plan.color }}>A medida</Text>
                  ) : plan.id === "basico" ? (
                    <Text style={{ fontSize: 22, fontWeight: "900", color: plan.color }}>Gratis</Text>
                  ) : (
                    <>
                      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 2 }}>
                        <Text style={{ fontSize: 22, fontWeight: "900", color: active ? plan.color : TEXT }}>
                          {precio}€
                        </Text>
                        <Text style={{ fontSize: 11, color: DIM }}>
                          {ciclo === "mensual" ? "/mes" : "/año"}
                        </Text>
                      </View>
                      {ciclo === "anual" && (
                        <Text style={{ fontSize: 10, color: GREEN, fontWeight: "700" }}>
                          {(precio / 12).toFixed(0)}€/mes
                        </Text>
                      )}
                    </>
                  )}
                </View>
              </View>

              {/* Features — solo cuando el plan está activo */}
              {active && (
                <View style={{ marginTop: 14, gap: 6, paddingLeft: 6 }}>
                  {plan.features.map((f) => (
                    <View key={f.label} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <Feather
                        name={f.included ? "check-circle" : "circle"}
                        size={14}
                        color={f.included ? plan.color : DIM}
                      />
                      <Text style={{ fontSize: 12, color: f.included ? TEXT : DIM, flex: 1 }}>{f.label}</Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Radio */}
              <View style={{ position: "absolute", right: 16, top: 16 }}>
                <View style={{
                  width: 22, height: 22, borderRadius: 11,
                  borderWidth: 2, borderColor: active ? plan.color : "rgba(0,0,0,0.15)",
                  backgroundColor: active ? plan.color : "transparent",
                  alignItems: "center", justifyContent: "center",
                }}>
                  {active && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" }} />}
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Resumen de precio ── */}
      {planElegido !== "basico" && planElegido !== "enterprise" && (
        <View style={{
          marginHorizontal: 16, marginBottom: 20,
          backgroundColor: planActual.color + "08",
          borderRadius: 16, padding: 16,
          borderWidth: 1, borderColor: planActual.color + "30",
          flexDirection: "row", alignItems: "center",
        }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 13, fontWeight: "700", color: TEXT }}>
              {planActual.nombre} · {ciclo === "mensual" ? "facturación mensual" : "facturación anual"}
            </Text>
            {ahorro > 0 && (
              <Text style={{ fontSize: 11, color: GREEN, marginTop: 3, fontWeight: "700" }}>
                Ahorro anual: {ahorro}€ respecto al plan mensual
              </Text>
            )}
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 22, fontWeight: "900", color: planActual.color }}>
              {precioVis}€
            </Text>
            <Text style={{ fontSize: 10, color: DIM }}>
              {ciclo === "mensual" ? "al mes · IVA no incl." : "al año · IVA no incl."}
            </Text>
          </View>
        </View>
      )}

      {/* ── 4. Datos de facturación ── */}
      {planElegido !== "basico" && (
        <>
          <SectionLabel icon="file-text" label="DATOS DE FACTURACIÓN" />
          <View style={{ marginHorizontal: 16, marginBottom: 20, gap: 10 }}>
            <FactField
              label="Razón social / Nombre"
              value={razonSocial}
              onChange={setRazonSocial}
              placeholder="Nombre de empresa o autónomo"
              icon="briefcase"
            />
            <FactField
              label="NIF / CIF"
              value={nif}
              onChange={setNif}
              placeholder="B12345678 o 12345678A"
              icon="hash"
              autoCapitalize="characters"
            />
            <FactField
              label="Email de facturación"
              value={emailFact}
              onChange={setEmailFact}
              placeholder="facturacion@tuempresa.com"
              icon="mail"
              keyboardType="email-address"
            />

            <View style={{
              flexDirection: "row", alignItems: "flex-start", gap: 8,
              backgroundColor: BLUE + "08", borderRadius: 12,
              padding: 12, borderWidth: 1, borderColor: BLUE + "20",
            }}>
              <Feather name="info" size={13} color={BLUE} style={{ marginTop: 1 }} />
              <Text style={{ flex: 1, fontSize: 11, color: GRAY, lineHeight: 16 }}>
                Las facturas se emitirán mensual o anualmente a nombre de la razón social indicada. El NIF/CIF es obligatorio para empresas con domicilio en España.
              </Text>
            </View>
          </View>
        </>
      )}

      {/* ── 5. CTA — Contratar plan ── */}
      <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
        {planElegido === "enterprise" ? (
          <TouchableOpacity
            activeOpacity={0.88}
            style={{
              backgroundColor: GOLD, borderRadius: 18, paddingVertical: 16,
              flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
              shadowColor: GOLD, shadowOpacity: 0.28, shadowRadius: 12, elevation: 5,
            }}
          >
            <Feather name="phone" size={18} color="#fff" />
            <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
              Contactar con ventas
            </Text>
          </TouchableOpacity>
        ) : planElegido === "basico" ? (
          <View style={{
            backgroundColor: "#F3F4F6", borderRadius: 18, paddingVertical: 16,
            alignItems: "center",
          }}>
            <Text style={{ color: DIM, fontWeight: "700", fontSize: 13 }}>
              GO Básico está activo — sin coste
            </Text>
          </View>
        ) : (
          <>
            <TouchableOpacity
              activeOpacity={puedeContratar ? 0.88 : 1}
              style={{
                backgroundColor: puedeContratar ? planActual.color : "rgba(0,0,0,0.07)",
                borderRadius: 18, paddingVertical: 16,
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                shadowColor: planActual.color,
                shadowOpacity: puedeContratar ? 0.28 : 0,
                shadowRadius: 12, elevation: puedeContratar ? 5 : 0,
              }}
            >
              <Feather name="zap" size={18} color={puedeContratar ? "#fff" : DIM} />
              <Text style={{ color: puedeContratar ? "#fff" : DIM, fontWeight: "900", fontSize: 15, letterSpacing: 0.4 }}>
                {puedeContratar ? `Contratar ${planActual.nombre}` : "Completa los datos de facturación"}
              </Text>
            </TouchableOpacity>

            {/* Nota demo bajo el CTA */}
            <View style={{
              flexDirection: "row", alignItems: "center", justifyContent: "center",
              gap: 6, marginTop: 10,
            }}>
              <Feather name="lock" size={11} color={DIM} />
              <Text style={{ fontSize: 11, color: DIM }}>
                En demo — no se procesará ningún cargo
              </Text>
            </View>
          </>
        )}
      </View>

      {/* ── Renovación y condiciones ── */}
      {planElegido !== "basico" && planElegido !== "enterprise" && (
        <View style={{ marginHorizontal: 16, marginTop: 8 }}>
          <View style={{
            backgroundColor: CARD, borderRadius: 16, padding: 14,
            borderWidth: 1, borderColor: BORD, gap: 8,
          }}>
            {[
              { icon: "refresh-cw" as const, text: `Renovación automática ${ciclo === "mensual" ? "mensual" : "anual"}. Cancela cuando quieras.` },
              { icon: "file-text" as const,  text: "Factura disponible en el panel de Facturación dentro de GO Empresa." },
              { icon: "shield"    as const,  text: "Puedes cambiar o cancelar tu plan en cualquier momento desde este módulo." },
            ].map((item) => (
              <View key={item.text} style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
                <Feather name={item.icon} size={13} color={BLUE} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, fontSize: 11, color: GRAY, lineHeight: 17 }}>{item.text}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

    </ScrollView>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: keyof typeof Feather.glyphMap; label: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginHorizontal: 16, marginBottom: 10 }}>
      <Feather name={icon} size={12} color={DIM} />
      <Text style={{ fontSize: 11, fontWeight: "800", color: DIM, letterSpacing: 1.3 }}>{label}</Text>
    </View>
  );
}

function FactField({
  label, value, onChange, placeholder, icon, autoCapitalize, keyboardType,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  icon: keyof typeof Feather.glyphMap;
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  keyboardType?: "default" | "email-address" | "numeric";
}) {
  return (
    <View style={{
      backgroundColor: CARD, borderRadius: 14,
      borderWidth: 1.5, borderColor: value.trim() ? BLUE + "40" : BORD,
      padding: 14, flexDirection: "row", alignItems: "center", gap: 10,
    }}>
      <View style={{
        width: 32, height: 32, borderRadius: 9,
        backgroundColor: (value.trim() ? BLUE : DIM) + "12",
        alignItems: "center", justifyContent: "center",
      }}>
        <Feather name={icon} size={15} color={value.trim() ? BLUE : DIM} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontWeight: "700", color: DIM, marginBottom: 3 }}>{label.toUpperCase()}</Text>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderTextColor={DIM}
          autoCapitalize={autoCapitalize ?? "words"}
          keyboardType={keyboardType ?? "default"}
          style={{ fontSize: 14, fontWeight: "600", color: TEXT, padding: 0 }}
        />
      </View>
      {value.trim().length > 0 && (
        <Feather name="check-circle" size={16} color={BLUE} />
      )}
    </View>
  );
}
