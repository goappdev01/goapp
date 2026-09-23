import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { interpretarRespuesta, type ParseResult } from "@/lib/interpretador";
import {
  buildAgendaProvisional,
  confirmarInterpretacion,
  deleteInterpretacion,
  ESTADO_COMPAT_COLOR,
  guardarInterpretacion,
  loadInterpretaciones,
  type InterpretacionItem,
  type AgendaProvisionalItem,
} from "@/data/interpretaciones";
import { loadSolicitudes, formatSlotLabel, type SolicitudDisponibilidad } from "@/data/disponibilidad";
import { loadContactos, type Contacto } from "@/data/contactos";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

type EstadoCompatibilidad = "compatible" | "parcialmente_compatible" | "rechazado" | "revision_manual" | "pendiente";

const ESTADO_COMPAT_LABEL_EN: Record<EstadoCompatibilidad, string> = {
  compatible:              "Compatible",
  parcialmente_compatible: "Partial",
  rechazado:               "Rejected",
  revision_manual:         "Review",
  pendiente:               "Pending",
};
const ESTADO_COMPAT_LABEL_ES: Record<EstadoCompatibilidad, string> = {
  compatible:              "Compatible",
  parcialmente_compatible: "Parcial",
  rechazado:               "Rechazado",
  revision_manual:         "Revisar",
  pendiente:               "Pendiente",
};

type Pestaña = "pendientes" | "provisional";
type PanelStep = "list" | "interpretar" | "revisar";

interface Props {
  onBack: () => void;
  guidanceLevel?: number;
}

export function InterpretacionScreen({ onBack, guidanceLevel = 5 }: Props) {
  const { lang, t } = useLanguage();
  const [pestaña, setPestaña] = useState<Pestaña>("pendientes");
  const [step, setStep] = useState<PanelStep>("list");

  const [solicitudes, setSolicitudes] = useState<SolicitudDisponibilidad[]>([]);
  const [contactos, setContactos] = useState<Contacto[]>([]);
  const [interpretaciones, setInterpretaciones] = useState<InterpretacionItem[]>([]);

  const [solicitudActual, setSolicitudActual] = useState<SolicitudDisponibilidad | null>(null);
  const [contactoActual, setContactoActual] = useState<Contacto | null>(null);
  const [textoRespuesta, setTextoRespuesta] = useState("");
  const [parseResult, setParseResult] = useState<ParseResult | null>(null);
  const [manualSlots, setManualSlots] = useState<Set<string>>(new Set());

  const [agendaItems, setAgendaItems] = useState<AgendaProvisionalItem[]>([]);
  const [solicitudProvisional, setSolicitudProvisional] = useState<SolicitudDisponibilidad | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const ESTADO_COMPAT_LABEL = lang === "en" ? ESTADO_COMPAT_LABEL_EN : ESTADO_COMPAT_LABEL_ES;

  const load = useCallback(async () => {
    const [sols, cons, ints] = await Promise.all([
      loadSolicitudes(),
      loadContactos(),
      loadInterpretaciones(),
    ]);
    setSolicitudes(sols);
    setContactos(cons);
    setInterpretaciones(ints);
  }, []);

  useEffect(() => { load(); }, [load]);

  const getContacto = (id: string) => contactos.find((c) => c.id === id);

  const pendientesBySolicitud = solicitudes
    .filter((s) => s.estado === "enviada" || s.estado === "con_respuesta")
    .map((sol) => {
      const pending = sol.contactoIds.filter((cId) => {
        const interp = interpretaciones.find(
          (i) => i.solicitudId === sol.id && i.contactoId === cId && i.confirmadoPorUsuario
        );
        return !interp;
      });
      return { sol, pending };
    })
    .filter((x) => x.pending.length > 0);

  const totalPendientes = pendientesBySolicitud.reduce((acc, x) => acc + x.pending.length, 0);

  const abrirInterpretacion = (sol: SolicitudDisponibilidad, contactoId: string) => {
    const c = getContacto(contactoId);
    if (!c) return;
    setSolicitudActual(sol);
    setContactoActual(c);
    setTextoRespuesta("");
    setParseResult(null);
    setManualSlots(new Set());
    setStep("interpretar");
  };

  const handleInterpretar = () => {
    if (!textoRespuesta.trim() || !solicitudActual) return;
    const result = interpretarRespuesta(textoRespuesta, solicitudActual.slots);
    setParseResult(result);
    setManualSlots(new Set(result.slotsAceptados));
    setStep("revisar");
  };

  const handleConfirmar = async () => {
    if (!solicitudActual || !contactoActual || !parseResult) return;
    const item = await guardarInterpretacion({
      solicitudId: solicitudActual.id,
      contactoId: contactoActual.id,
      textoRespuesta,
      parseResult,
      estadoFinal: parseResult.estadoCalculado,
      slotsAceptadosManual: null,
      confirmadoPorUsuario: true,
    });
    await confirmarInterpretacion(item.id, Array.from(manualSlots));
    await load();
    setStep("list");
  };

  const handleSaltarRevisión = () => {
    setStep("list");
    setParseResult(null);
  };

  const verProvisional = (sol: SolicitudDisponibilidad) => {
    setSolicitudProvisional(sol);
    const agenda = buildAgendaProvisional(interpretaciones, sol.id, sol.slots);
    setAgendaItems(agenda);
    setPestaña("provisional");
  };

  // ── RENDER ────────────────────────────────────────────────────────────

  if (step === "interpretar" && solicitudActual && contactoActual) {
    return (
      <View style={s.root}>
        <View style={s.stepHeader}>
          <Text style={s.stepSup}>{t("interp_interpret_title")}</Text>
          <Text style={s.stepTitle}>
            {contactoActual.empresa || contactoActual.responsable}
          </Text>
          <Text style={s.stepSub}>{contactoActual.email}</Text>
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <View style={s.slotsOfrecidosBox}>
            <Text style={s.miniLabel}>{t("interp_options_offered")}</Text>
            <View style={s.slotsRow}>
              {solicitudActual.slots.slice(0, 8).map((sl, i) => (
                <View key={sl.id} style={s.slotTag}>
                  <Text style={s.slotTagTxt}>{i + 1}. {formatSlotLabel(sl)}</Text>
                </View>
              ))}
            </View>
          </View>

          <Text style={s.miniLabel}>{t("interp_response_recv")}</Text>
          {guidanceCfg.hintMaxCount > 0 && (
            <Text style={s.pasteHint}>{t("interp_paste_hint")}</Text>
          )}
          <TextInput
            style={s.textareaRespuesta}
            value={textoRespuesta}
            onChangeText={setTextoRespuesta}
            placeholder={t("interp_resp_placeholder")}
            placeholderTextColor="#444"
            multiline
            textAlignVertical="top"
            autoFocus
          />

          {guidanceCfg.hintMaxCount > 0 && (
            <View style={s.ejemplosBox}>
              <Text style={s.miniLabel}>{t("interp_detect_examples")}</Text>
              {lang === "en" ? [
                ["✓", "«Thursday works for me in the afternoon»", "#6ee7b7"],
                ["✓", "«Tuesday impossible, Friday better»", "#6ee7b7"],
                ["✓", "«Any day works for me»", "#6ee7b7"],
                ["✓", "«I prefer Wednesday morning»", "#6ee7b7"],
                ["⚡", "«Urgent, as soon as possible»", "#f59e0b"],
                ["📞", "«Better call me to coordinate»", "#3b82f6"],
              ].map(([icon, text, color]) => (
                <View key={text} style={s.ejemploRow}>
                  <Text style={[s.ejemploIcon, { color }]}>{icon}</Text>
                  <Text style={s.ejemploTxt}>{text}</Text>
                </View>
              )) : [
                ["✓", "«El jueves sí puedo por la tarde»", "#6ee7b7"],
                ["✓", "«Martes imposible, viernes mejor»", "#6ee7b7"],
                ["✓", "«Cualquier día me va bien»", "#6ee7b7"],
                ["✓", "«Prefiero la mañana del miércoles»", "#6ee7b7"],
                ["⚡", "«Urgente, lo antes posible»", "#f59e0b"],
                ["📞", "«Mejor llamadme para coordinar»", "#3b82f6"],
              ].map(([icon, text, color]) => (
                <View key={text} style={s.ejemploRow}>
                  <Text style={[s.ejemploIcon, { color }]}>{icon}</Text>
                  <Text style={s.ejemploTxt}>{text}</Text>
                </View>
              ))}
            </View>
          )}
        </ScrollView>

        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep("list")}>
            <Text style={s.btnSecondaryTxt}>{t("cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, !textoRespuesta.trim() && { opacity: 0.4 }]}
            disabled={!textoRespuesta.trim()}
            onPress={handleInterpretar}
          >
            <Feather name="zap" size={15} color="#000" />
            <Text style={s.btnPrimaryTxt}>{t("interp_interpret_btn")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (step === "revisar" && parseResult && solicitudActual && contactoActual) {
    const estado = parseResult.estadoCalculado;
    const estadoColor = ESTADO_COMPAT_COLOR[estado];

    return (
      <View style={s.root}>
        <View style={[s.interpretHeader, { borderBottomColor: estadoColor + "44" }]}>
          <View style={[s.interpretEstadoPill, { backgroundColor: estadoColor + "22", borderColor: estadoColor + "55" }]}>
            <Text style={[s.interpretEstadoTxt, { color: estadoColor }]}>
              {ESTADO_COMPAT_LABEL[estado as EstadoCompatibilidad] ?? estado}
            </Text>
          </View>
          <Text style={s.interpretTitle}>
            {contactoActual.empresa || contactoActual.responsable}
          </Text>
          <Text style={s.interpretResumen}>{parseResult.resumen}</Text>
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          <View style={s.signalsRow}>
            {parseResult.todosAceptados    && <SignalPill icon="check-circle"   label={t("interp_accepts_all")} color="#6ee7b7" />}
            {parseResult.todosRechazados   && <SignalPill icon="x-circle"       label={t("interp_rejects_all")} color="#ef4444" />}
            {parseResult.urgente           && <SignalPill icon="zap"            label={t("interp_urgent")}      color="#f59e0b" />}
            {parseResult.necesitaLlamada   && <SignalPill icon="phone"          label={t("interp_call_needed")} color="#3b82f6" />}
            {parseResult.peticionEspecial  && <SignalPill icon="message-square" label={parseResult.peticionEspecial}                    color="#a78bfa" />}
          </View>

          {parseResult.detecciones.length > 0 && (
            <>
              <Text style={s.miniLabel}>{t("interp_detected_days")}</Text>
              {parseResult.detecciones.map((d, i) => (
                <View key={i} style={s.deteccionRow}>
                  <View style={[s.polDot, { backgroundColor: d.polaridad === "positivo" ? "#6ee7b7" : "#ef4444" }]} />
                  <Text style={[s.deteccionDia, { color: d.polaridad === "positivo" ? "#6ee7b7" : "#ef4444" }]}>
                    {d.diaNormalizado}
                  </Text>
                  {d.franja && <Text style={s.deteccionFranja}>{d.franja}</Text>}
                  {d.horaEspecifica && <Text style={s.deteccionHora}>{d.horaEspecifica}</Text>}
                  <View style={s.deteccionPolaridad}>
                    <Text style={[s.deteccionPolaridadTxt, { color: d.polaridad === "positivo" ? "#6ee7b7" : "#ef4444" }]}>
                      {d.polaridad === "positivo" ? t("interp_accepts") : t("interp_rejects")}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}

          <Text style={[s.miniLabel, { marginTop: 16 }]}>{t("interp_adjust_slots")}</Text>
          <Text style={s.slotMatchHint}>{t("interp_tap_hint")}</Text>
          {solicitudActual.slots.map((slot, i) => {
            const aceptado = parseResult.slotsAceptados.includes(slot.id);
            const rechazado = parseResult.slotsRechazados.includes(slot.id);
            const manual = manualSlots.has(slot.id);

            return (
              <TouchableOpacity
                key={slot.id}
                style={[
                  s.slotRow,
                  manual && s.slotRowOn,
                  rechazado && !manual && s.slotRowRej,
                ]}
                onPress={() => {
                  setManualSlots((prev) => {
                    const next = new Set(prev);
                    if (next.has(slot.id)) next.delete(slot.id);
                    else next.add(slot.id);
                    return next;
                  });
                }}
              >
                <View style={[
                  s.slotNum,
                  manual && { backgroundColor: "#6ee7b7" },
                  rechazado && !manual && { backgroundColor: "#ef444422" },
                ]}>
                  <Text style={[s.slotNumTxt, manual && { color: "#000" }]}>{i + 1}</Text>
                </View>
                <Text style={[
                  s.slotLabel,
                  manual && { color: "#fff" },
                  rechazado && !manual && { color: "#555" },
                ]}>
                  {formatSlotLabel(slot)}
                </Text>
                {manual && <Feather name="check" size={14} color="#6ee7b7" />}
                {rechazado && !manual && <Feather name="x" size={14} color="#ef4444" />}
                {!aceptado && !rechazado && !manual && (
                  <Text style={s.slotNeutral}>{t("interp_no_data")}</Text>
                )}
              </TouchableOpacity>
            );
          })}

          <Text style={[s.miniLabel, { marginTop: 16 }]}>{t("interp_original_text")}</Text>
          <View style={s.textoOriginalBox}>
            <Text style={s.textoOriginalTxt}>{parseResult.textoOriginal}</Text>
          </View>
        </ScrollView>

        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={handleSaltarRevisión}>
            <Text style={s.btnSecondaryTxt}>{t("interp_discard_btn")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={handleConfirmar}>
            <Feather name="check" size={15} color="#000" />
            <Text style={s.btnPrimaryTxt}>{t("interp_confirm_save")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── MAIN LIST ─────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      {/* Tabs */}
      <View style={s.tabs}>
        <TouchableOpacity
          style={[s.tab, pestaña === "pendientes" && s.tabActive]}
          onPress={() => { setPestaña("pendientes"); setStep("list"); }}
        >
          <Text style={[s.tabTxt, pestaña === "pendientes" && s.tabTxtActive]}>
            {t("stat_pendientes")} {totalPendientes > 0 ? `(${totalPendientes})` : ""}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.tab, pestaña === "provisional" && s.tabActive]}
          onPress={() => setPestaña("provisional")}
        >
          <Text style={[s.tabTxt, pestaña === "provisional" && s.tabTxtActive]}>
            {t("interp_draft_tab")}
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── PENDIENTES TAB ── */}
      {pestaña === "pendientes" && (
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          {pendientesBySolicitud.length === 0 ? (
            <EmptyPendientes onProvisional={() => setPestaña("provisional")} />
          ) : (
            pendientesBySolicitud.map(({ sol, pending }) => (
              <View key={sol.id} style={s.solicitudBlock}>
                <Text style={s.solicitudAsunto} numberOfLines={1}>{sol.asunto}</Text>
                <Text style={s.solicitudMeta}>
                  {sol.slots.length} {t("interp_options_count")}
                </Text>

                {pending.map((cId) => {
                  const c = getContacto(cId);
                  const interp = interpretaciones.find(
                    (i) => i.solicitudId === sol.id && i.contactoId === cId
                  );
                  return (
                    <ContactoPendienteRow
                      key={cId}
                      contacto={c}
                      interpretacion={interp}
                      estadoCompatLabel={ESTADO_COMPAT_LABEL}
                      onInterpretar={() => abrirInterpretacion(sol, cId)}
                      onVerProvisional={() => verProvisional(sol)}
                    />
                  );
                })}

                {(() => {
                  const confirmados = sol.contactoIds.filter((cId) =>
                    interpretaciones.find(
                      (i) => i.solicitudId === sol.id && i.contactoId === cId && i.confirmadoPorUsuario
                    )
                  );
                  if (!confirmados.length) return null;
                  return (
                    <TouchableOpacity style={s.verProvisionalBtn} onPress={() => verProvisional(sol)}>
                      <Feather name="calendar" size={12} color="#6ee7b7" />
                      <Text style={s.verProvisionalTxt}>
                        {confirmados.length} {t("interp_confirmed_draft")}
                      </Text>
                      <Feather name="arrow-right" size={12} color="#6ee7b7" />
                    </TouchableOpacity>
                  );
                })()}
              </View>
            ))
          )}

          {interpretaciones.filter((i) => i.confirmadoPorUsuario).length > 0 && pendientesBySolicitud.length === 0 && (
            <TouchableOpacity style={s.verProvisionalBtn} onPress={() => setPestaña("provisional")}>
              <Feather name="calendar" size={12} color="#6ee7b7" />
              <Text style={s.verProvisionalTxt}>{t("interp_view_draft")}</Text>
              <Feather name="arrow-right" size={12} color="#6ee7b7" />
            </TouchableOpacity>
          )}
        </ScrollView>
      )}

      {/* ── PROVISIONAL TAB ── */}
      {pestaña === "provisional" && (
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.solSelectorScroll}
            contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
          >
            {solicitudes
              .filter((s) => interpretaciones.some((i) => i.solicitudId === s.id && i.confirmadoPorUsuario))
              .map((sol) => (
                <TouchableOpacity
                  key={sol.id}
                  style={[s.solPill, solicitudProvisional?.id === sol.id && s.solPillActive]}
                  onPress={() => {
                    setSolicitudProvisional(sol);
                    setAgendaItems(buildAgendaProvisional(interpretaciones, sol.id, sol.slots));
                  }}
                >
                  <Text style={[s.solPillTxt, solicitudProvisional?.id === sol.id && { color: "#6ee7b7" }]} numberOfLines={1}>
                    {sol.asunto.replace(/—.*/, "").trim()}
                  </Text>
                </TouchableOpacity>
              ))}
          </ScrollView>

          {agendaItems.length === 0 ? (
            <EmptyProvisional onPendientes={() => setPestaña("pendientes")} />
          ) : (
            <>
              <View style={s.agendaLegend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: "#6ee7b7" }]} />
                  <Text style={s.legendTxt}>{t("interp_compat_multi")}</Text>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: "#f59e0b" }]} />
                  <Text style={s.legendTxt}>{t("interp_single_client")}</Text>
                </View>
              </View>
              {agendaItems.map((item) => {
                const isStrong = item.contactoIds.length >= 2;
                const color = isStrong ? "#6ee7b7" : "#f59e0b";
                return (
                  <View key={item.slotId} style={[s.agendaCard, { borderLeftColor: color }]}>
                    <View style={s.agendaCardTop}>
                      <View style={[s.agendaSlotBadge, { backgroundColor: color + "22" }]}>
                        <Feather name="clock" size={12} color={color} />
                        <Text style={[s.agendaSlotTxt, { color }]}>{formatSlotLabel(item.slot)}</Text>
                      </View>
                      <View style={[s.agendaCountBadge, { backgroundColor: color + "22" }]}>
                        <Text style={[s.agendaCountTxt, { color }]}>
                          {item.contactoIds.length} {lang === "en" ? `client${item.contactoIds.length !== 1 ? "s" : ""}` : `cliente${item.contactoIds.length !== 1 ? "s" : ""}`}
                        </Text>
                      </View>
                    </View>
                    <View style={s.agendaContacts}>
                      {item.contactoIds.map((cId) => {
                        const c = getContacto(cId);
                        return (
                          <View key={cId} style={s.agendaContact}>
                            <Feather name="user" size={10} color="#555" />
                            <Text style={s.agendaContactTxt} numberOfLines={1}>
                              {c?.empresa || c?.responsable || cId}
                            </Text>
                            {c?.ciudad && <Text style={s.agendaCiudad}>· {c.ciudad}</Text>}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })}
              {guidanceCfg.hintMaxCount > 0 && (
                <View style={s.agendaInfoBox}>
                  <Feather name="info" size={12} color="#3b82f6" />
                  <Text style={s.agendaInfoTxt}>{t("interp_agenda_info")}</Text>
                </View>
              )}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

function ContactoPendienteRow({
  contacto,
  interpretacion,
  estadoCompatLabel,
  onInterpretar,
  onVerProvisional,
}: {
  contacto: Contacto | undefined;
  interpretacion: InterpretacionItem | undefined;
  estadoCompatLabel: Record<string, string>;
  onInterpretar: () => void;
  onVerProvisional: () => void;
}) {
  const { t } = useLanguage();
  if (!contacto) return null;
  const hasInterp = !!interpretacion;
  const estado = interpretacion?.estadoFinal ?? "pendiente";
  const color = ESTADO_COMPAT_COLOR[estado];

  return (
    <View style={s.contactPendRow}>
      <View style={s.contactPendLeft}>
        <Text style={s.contactPendEmpresa} numberOfLines={1}>
          {contacto.empresa || contacto.responsable}
        </Text>
        <Text style={s.contactPendEmail} numberOfLines={1}>{contacto.email}</Text>
        {hasInterp && (
          <Text style={[s.contactPendResumen, { color }]} numberOfLines={1}>
            {interpretacion?.parseResult.resumen}
          </Text>
        )}
      </View>
      <View style={s.contactPendRight}>
        {hasInterp ? (
          <View style={[s.estadoPill, { backgroundColor: color + "22", borderColor: color + "44" }]}>
            <Text style={[s.estadoPillTxt, { color }]}>
              {estadoCompatLabel[estado] ?? estado}
            </Text>
          </View>
        ) : (
          <TouchableOpacity style={s.interpretBtn} onPress={onInterpretar}>
            <Feather name="zap" size={12} color="#000" />
            <Text style={s.interpretBtnTxt}>{t("interp_interpret_btn")}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

function SignalPill({ icon, label, color }: { icon: string; label: string; color: string }) {
  return (
    <View style={[s.signalPill, { backgroundColor: color + "18", borderColor: color + "44" }]}>
      <Feather name={icon as any} size={11} color={color} />
      <Text style={[s.signalPillTxt, { color }]}>{label}</Text>
    </View>
  );
}

function EmptyPendientes({ onProvisional }: { onProvisional: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Feather name="inbox" size={36} color="#2a2a2a" />
      </View>
      <Text style={s.emptyTitle}>{t("interp_no_pending_title")}</Text>
      <Text style={s.emptySub}>{t("interp_no_pending_sub")}</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={onProvisional}>
        <Text style={s.emptyBtnTxt}>{t("interp_view_draft")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function EmptyProvisional({ onPendientes }: { onPendientes: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Feather name="calendar" size={36} color="#2a2a2a" />
      </View>
      <Text style={s.emptyTitle}>{t("interp_draft_empty_title")}</Text>
      <Text style={s.emptySub}>{t("interp_draft_empty_sub")}</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={onPendientes}>
        <Text style={s.emptyBtnTxt}>{t("interp_go_to_pending")}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:            { flex: 1 },
  scroll:          { flex: 1, paddingHorizontal: 14 },

  tabs:            { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  tab:             { flex: 1, paddingVertical: 12, alignItems: "center" },
  tabActive:       { borderBottomWidth: 2, borderBottomColor: "#3D9A84" },
  tabTxt:          { fontSize: 13, color: "#9CA3AF", fontWeight: "600" },
  tabTxtActive:    { color: "#3D9A84" },

  stepHeader:      { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  stepSup:         { fontSize: 10, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  stepTitle:       { fontSize: 17, fontWeight: "800", color: "#111827", marginBottom: 2 },
  stepSub:         { fontSize: 12, color: "#6B7280" },

  interpretHeader: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12, borderBottomWidth: 1, alignItems: "flex-start", gap: 4 },
  interpretEstadoPill: { borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, marginBottom: 4 },
  interpretEstadoTxt:  { fontSize: 10, fontWeight: "700", textTransform: "uppercase" },
  interpretTitle:  { fontSize: 16, fontWeight: "800", color: "#111827" },
  interpretResumen:{ fontSize: 12, color: "#6B7280", lineHeight: 17 },

  miniLabel:       { fontSize: 9, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 14 },
  pasteHint:       { fontSize: 12, color: "#6B7280", marginBottom: 8, lineHeight: 17 },

  slotsOfrecidosBox: { backgroundColor: "#F3F4F6", borderRadius: 12, padding: 12, marginTop: 10, marginBottom: 4 },
  slotsRow:        { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slotTag:         { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  slotTagTxt:      { fontSize: 11, color: "#6B7280" },

  textareaRespuesta: { backgroundColor: "#F7F8FA", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: "#111827", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", height: 160, lineHeight: 21 },

  ejemplosBox:     { backgroundColor: "#F3F4F6", borderRadius: 12, padding: 12, marginTop: 4, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  ejemploRow:      { flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 5 },
  ejemploIcon:     { fontSize: 13, width: 18 },
  ejemploTxt:      { fontSize: 12, color: "#6B7280", flex: 1, fontStyle: "italic" },

  signalsRow:      { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6, marginBottom: 4 },
  signalPill:      { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
  signalPillTxt:   { fontSize: 11, fontWeight: "600" },

  deteccionRow:    { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  polDot:          { width: 8, height: 8, borderRadius: 4 },
  deteccionDia:    { fontSize: 14, fontWeight: "700", minWidth: 80 },
  deteccionFranja: { fontSize: 11, color: "#6B7280", backgroundColor: "#F3F4F6", borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
  deteccionHora:   { fontSize: 11, color: "#6B7280", fontWeight: "700" },
  deteccionPolaridad: { marginLeft: "auto" as any },
  deteccionPolaridadTxt: { fontSize: 11, fontWeight: "600" },

  slotMatchHint:   { fontSize: 11, color: "#6B7280", marginBottom: 8 },
  slotRow:         { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  slotRowOn:       { },
  slotRowRej:      { opacity: 0.4 },
  slotNum:         { width: 28, height: 28, borderRadius: 8, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  slotNumTxt:      { fontSize: 12, fontWeight: "800", color: "#9CA3AF" },
  slotLabel:       { flex: 1, fontSize: 13, fontWeight: "600", color: "#6B7280" },
  slotNeutral:     { fontSize: 10, color: "#9CA3AF" },

  textoOriginalBox:{ backgroundColor: "#F7F8FA", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  textoOriginalTxt:{ fontSize: 12, color: "#6B7280", lineHeight: 19, fontStyle: "italic" },

  solicitudBlock:  { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  solicitudAsunto: { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 2 },
  solicitudMeta:   { fontSize: 11, color: "#9CA3AF", marginBottom: 10 },

  contactPendRow:  { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  contactPendLeft: { flex: 1, gap: 1 },
  contactPendEmpresa: { fontSize: 13, fontWeight: "700", color: "#111827" },
  contactPendEmail:{ fontSize: 11, color: "#9CA3AF" },
  contactPendResumen: { fontSize: 11, lineHeight: 15 },
  contactPendRight:{ alignItems: "flex-end" },
  interpretBtn:    { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#3D9A84", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  interpretBtnTxt: { fontSize: 11, fontWeight: "800", color: "#FFFFFF" },
  estadoPill:      { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  estadoPillTxt:   { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },

  verProvisionalBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" },
  verProvisionalTxt: { flex: 1, fontSize: 11, color: "#3D9A84", fontWeight: "600" },

  solSelectorScroll: { flexGrow: 0, paddingVertical: 10 },
  solPill:         { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#F7F8FA", maxWidth: 200 },
  solPillActive:   { borderColor: "rgba(61,154,132,0.3)", backgroundColor: "rgba(61,154,132,0.08)" },
  solPillTxt:      { fontSize: 11, color: "#6B7280", fontWeight: "600" },

  agendaLegend:    { flexDirection: "row", gap: 16, marginBottom: 10, marginTop: 4 },
  legendItem:      { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot:       { width: 8, height: 8, borderRadius: 4 },
  legendTxt:       { fontSize: 11, color: "#6B7280" },

  agendaCard:      { backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", borderLeftWidth: 3, padding: 12 },
  agendaCardTop:   { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  agendaSlotBadge: { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  agendaSlotTxt:   { fontSize: 12, fontWeight: "700" },
  agendaCountBadge:{ borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5 },
  agendaCountTxt:  { fontSize: 11, fontWeight: "700" },
  agendaContacts:  { gap: 4 },
  agendaContact:   { flexDirection: "row", alignItems: "center", gap: 5 },
  agendaContactTxt:{ fontSize: 12, color: "#6B7280", flex: 1 },
  agendaCiudad:    { fontSize: 10, color: "#9CA3AF" },
  agendaInfoBox:   { flexDirection: "row", gap: 8, backgroundColor: "#EFF6FF", borderRadius: 10, padding: 12, borderWidth: 1, borderColor: "rgba(59,130,246,0.15)", marginTop: 12 },
  agendaInfoTxt:   { fontSize: 11, color: "#3B82F6", flex: 1, lineHeight: 16 },

  navRow:          { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  btnPrimary:      { flex: 1, backgroundColor: "#3D9A84", borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnPrimaryTxt:   { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  btnSecondary:    { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  btnSecondaryTxt: { fontSize: 14, fontWeight: "700", color: "#6B7280" },

  empty:           { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, marginTop: 40 },
  emptyIcon:       { width: 80, height: 80, borderRadius: 40, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  emptyTitle:      { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8, textAlign: "center" },
  emptySub:        { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 24 },
  emptyBtn:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#3D9A84", borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  emptyBtnTxt:     { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
