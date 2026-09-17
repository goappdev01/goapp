import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { Feather } from "@expo/vector-icons";
import {
  crearSolicitud,
  deleteSolicitud,
  ESTADO_COLOR,
  formatSlotLabel,
  generarAsunto,
  generarCuerpo,
  generarSlots,
  loadSolicitudes,
  marcarEnviada,
  registrarRespuesta,
  type SlotOpcion,
  type SolicitudDisponibilidad,
  type RespuestaContacto,
} from "@/data/disponibilidad";
import { loadContactos, type Contacto } from "@/data/contactos";
import { loadIntenciones, INTENCION_MAP, type Intencion } from "@/data/intenciones";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";
import { intencionLabel } from "@/utils/intencionI18n";

type EstadoSolicitud = "borrador" | "enviada" | "con_respuesta" | "confirmada";

const ESTADO_LABEL_EN: Record<EstadoSolicitud, string> = {
  borrador:      "Draft",
  enviada:       "Sent",
  con_respuesta: "Responded",
  confirmada:    "Confirmed",
};
const ESTADO_LABEL_ES: Record<EstadoSolicitud, string> = {
  borrador:      "Borrador",
  enviada:       "Enviada",
  con_respuesta: "Con respuesta",
  confirmada:    "Confirmada",
};

type Step =
  | "list"
  | "step_contactos"
  | "step_slots"
  | "step_email"
  | "step_send"
  | "step_done"
  | "step_respuesta";

interface Props {
  onBack: () => void;
  guidanceLevel?: number;
}

export function DisponibilidadScreen({ onBack, guidanceLevel = 5 }: Props) {
  const { lang, t } = useLanguage();
  const [solicitudes, setSolicitudes]   = useState<SolicitudDisponibilidad[]>([]);
  const [contactos, setContactos]       = useState<Contacto[]>([]);
  const [intenciones, setIntenciones]   = useState<Intencion[]>([]);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const ESTADO_LABEL = lang === "en" ? ESTADO_LABEL_EN : ESTADO_LABEL_ES;

  const [step, setStep]                 = useState<Step>("list");
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>([]);
  const [selectedIntencionId, setSelectedIntencionId] = useState<string | null>(null);
  const [slots, setSlots]               = useState<SlotOpcion[]>([]);
  const [activeSlotIds, setActiveSlotIds] = useState<Set<string>>(new Set());
  const [asunto, setAsunto]             = useState("");
  const [cuerpo, setCuerpo]             = useState("");
  const [contactoSearch, setContactoSearch] = useState("");
  const [sendIdx, setSendIdx]           = useState(0);
  const [sentCount, setSentCount]       = useState(0);

  const [respuestaSolicitud, setRespuestaSolicitud] = useState<SolicitudDisponibilidad | null>(null);
  const [respuestaContactoId, setRespuestaContactoId] = useState<string | null>(null);
  const [respuestaSlotIds, setRespuestaSlotIds] = useState<Set<string>>(new Set());
  const [respuestaNota, setRespuestaNota] = useState("");

  const load = useCallback(async () => {
    const [sols, cons, ints] = await Promise.all([
      loadSolicitudes(),
      loadContactos(),
      loadIntenciones(),
    ]);
    setSolicitudes(sols);
    setContactos(cons);
    setIntenciones(ints);
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedIntencion = intenciones.find((i) => i.id === selectedIntencionId) ?? null;

  const resetWizard = () => {
    setStep("list");
    setSelectedContactIds([]);
    setSelectedIntencionId(null);
    setSlots([]);
    setActiveSlotIds(new Set());
    setAsunto("");
    setCuerpo("");
    setSendIdx(0);
    setSentCount(0);
    setContactoSearch("");
  };

  const goToList = () => { resetWizard(); load(); };

  const handleContactosNext = () => {
    if (selectedContactIds.length === 0) {
      Alert.alert(t("dispon_alert_no_contacts"), t("dispon_alert_sel_contact"));
      return;
    }
    const int = selectedIntencion;
    const generated = generarSlots({
      fechaInicio: new Date(),
      margenDias: int?.margenDias ?? 14,
      horarioDesde: int?.horario.desde ?? "09:00",
      horarioHasta: int?.horario.hasta ?? "18:00",
      duracionMin: int?.duracionMin ?? 60,
      slotsPerDay: 3,
    });
    setSlots(generated);
    setActiveSlotIds(new Set(generated.slice(0, 6).map((s) => s.id)));
    setStep("step_slots");
  };

  const handleSlotsNext = () => {
    const active = slots.filter((s) => activeSlotIds.has(s.id));
    if (active.length < 2) {
      Alert.alert(t("dispon_alert_min2_title"), t("dispon_alert_min2_body"));
      return;
    }
    const refContacto = contactos.find((c) => c.id === selectedContactIds[0]) ?? {
      empresa: "[Empresa]",
      responsable: "[Responsable]",
      email: "",
      telefono: "",
      direccion: "",
      ciudad: "",
      codigoPostal: "",
      provincia: "",
      pais: "",
      tipo: "cliente" as const,
      tecnicoAsignado: "",
      comercialAsignado: "",
      frecuenciaVisita: "",
      duracionVisita: "",
      observaciones: "",
      id: "",
      importadoEn: "",
      loteId: "",
    };
    const int = selectedIntencion;
    const generatedAsunto = generarAsunto(int, refContacto);
    const generatedCuerpo = generarCuerpo({ contacto: refContacto, intencion: int, slots: active });
    setAsunto(generatedAsunto);
    setCuerpo(generatedCuerpo);
    setStep("step_email");
  };

  const handleEmailNext = async () => {
    const activeSlots = slots.filter((s) => activeSlotIds.has(s.id));
    await crearSolicitud({
      intencionId: selectedIntencionId,
      contactoIds: selectedContactIds,
      slots: activeSlots,
      asunto,
      cuerpoTemplate: cuerpo,
    });
    setSendIdx(0);
    setSentCount(0);
    setStep("step_send");
  };

  const sendToContact = async (contacto: Contacto) => {
    const activeSlots = slots.filter((s) => activeSlotIds.has(s.id));
    const personalizedBody = generarCuerpo({
      contacto,
      intencion: selectedIntencion,
      slots: activeSlots,
    });
    const mailtoUrl = `mailto:${encodeURIComponent(contacto.email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(personalizedBody)}`;
    try {
      await Linking.openURL(mailtoUrl);
    } catch {
      Alert.alert(
        t("dispon_alert_no_mail"),
        lang === "en" ? `Copy the email manually: ${contacto.email}` : `Copia el email manualmente: ${contacto.email}`
      );
    }
  };

  const handleSentContact = () => {
    const next = sendIdx + 1;
    setSentCount((c) => c + 1);
    if (next >= selectedContactIds.length) {
      load().then(async () => {
        const sols = await loadSolicitudes();
        const latest = sols[0];
        if (latest) await marcarEnviada(latest.id);
        await load();
        setStep("step_done");
      });
    } else {
      setSendIdx(next);
    }
  };

  const openRespuesta = (sol: SolicitudDisponibilidad, contactoId: string) => {
    setRespuestaSolicitud(sol);
    setRespuestaContactoId(contactoId);
    const existing = sol.respuestas.find((r) => r.contactoId === contactoId);
    setRespuestaSlotIds(new Set(existing?.slotIds ?? []));
    setRespuestaNota(existing?.notaRespuesta ?? "");
    setStep("step_respuesta");
  };

  const handleGuardarRespuesta = async () => {
    if (!respuestaSolicitud || !respuestaContactoId) return;
    if (respuestaSlotIds.size < 1) {
      Alert.alert(t("dispon_alert_no_selection"), t("dispon_alert_1_option"));
      return;
    }
    const respuesta: RespuestaContacto = {
      contactoId: respuestaContactoId,
      slotIds: Array.from(respuestaSlotIds),
      notaRespuesta: respuestaNota,
      recibidaEn: new Date().toISOString(),
    };
    await registrarRespuesta(respuestaSolicitud.id, respuesta);
    await load();
    setRespuestaSolicitud(null);
    setRespuestaContactoId(null);
    setStep("list");
  };

  // ── RENDER ────────────────────────────────────────────────────────────

  if (step === "list") {
    const pendientes = solicitudes.filter((s) => s.estado === "borrador" || s.estado === "enviada");
    const conRespuesta = solicitudes.filter((s) => s.estado === "con_respuesta" || s.estado === "confirmada");

    return (
      <View style={s.root}>
        <TouchableOpacity
          style={s.createBtn}
          onPress={() => setStep("step_contactos")}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={14} color="#fff" />
          <Text style={s.createBtnTxt}>{t("dispon_new_request")}</Text>
        </TouchableOpacity>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {solicitudes.length === 0 ? (
            <View style={s.emptyInline}>
              <Feather name="mail" size={28} color="#9CA3AF" />
              <Text style={s.emptyInlineTitle}>{t("dispon_no_reqs_title")}</Text>
              <Text style={s.emptyInlineSub}>{t("dispon_no_reqs_sub")}</Text>
            </View>
          ) : (
            <>
              {pendientes.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>{t("dispon_in_progress")} · {pendientes.length}</Text>
                  {pendientes.map((sol) => (
                    <SolicitudCard
                      key={sol.id}
                      solicitud={sol}
                      contactos={contactos}
                      estadoLabel={ESTADO_LABEL}
                      onSendPending={async () => {
                        const contactoIds = sol.contactoIds;
                        setSelectedContactIds(contactoIds);
                        setSlots(sol.slots);
                        setActiveSlotIds(new Set(sol.slots.map((s) => s.id)));
                        setAsunto(sol.asunto);
                        setCuerpo(sol.cuerpoTemplate);
                        setSendIdx(0);
                        setSentCount(0);
                        setStep("step_send");
                      }}
                      onRegistrarRespuesta={(cId) => openRespuesta(sol, cId)}
                      onDelete={async () => {
                        await deleteSolicitud(sol.id);
                        load();
                      }}
                    />
                  ))}
                </>
              )}
              {conRespuesta.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: 20 }]}>{t("dispon_with_response")} · {conRespuesta.length}</Text>
                  {conRespuesta.map((sol) => (
                    <SolicitudCard
                      key={sol.id}
                      solicitud={sol}
                      contactos={contactos}
                      estadoLabel={ESTADO_LABEL}
                      onRegistrarRespuesta={(cId) => openRespuesta(sol, cId)}
                      onDelete={async () => {
                        await deleteSolicitud(sol.id);
                        load();
                      }}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>

        <TouchableOpacity style={s.fab} onPress={() => setStep("step_contactos")} activeOpacity={0.85}>
          <Feather name="send" size={18} color="#000" />
          <Text style={s.fabTxt}>{t("dispon_new_request")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── STEP: CONTACTOS ───────────────────────────────────────────────────
  if (step === "step_contactos") {
    const filtered = contactos.filter((c) => {
      if (!contactoSearch) return true;
      const q = contactoSearch.toLowerCase();
      return c.empresa.toLowerCase().includes(q) || c.responsable.toLowerCase().includes(q) || c.email.toLowerCase().includes(q);
    });
    const contactosConEmail = filtered.filter((c) => c.email);
    const contactosSinEmail = filtered.filter((c) => !c.email);
    const allSelected = contactosConEmail.length > 0 && contactosConEmail.every((c) => selectedContactIds.includes(c.id));

    const toggleContacto = (id: string) => {
      setSelectedContactIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
    };

    const toggleAll = () => {
      if (allSelected) {
        setSelectedContactIds([]);
      } else {
        setSelectedContactIds(contactosConEmail.map((c) => c.id));
      }
    };

    return (
      <View style={s.root}>
        <View style={s.stepHeaderBox}>
          <Text style={s.stepNum}>{lang === "en" ? "Step 1 of 3" : "Paso 1 de 3"}</Text>
          <Text style={s.stepTitle}>{t("dispon_who_to_send")}</Text>
          <Text style={s.stepSub}>{t("dispon_email_contacts_sub")}</Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.intencionRow}
          contentContainerStyle={{ paddingHorizontal: 14, gap: 8 }}
        >
          <TouchableOpacity
            style={[s.intencionPill, !selectedIntencionId && s.intencionPillActive]}
            onPress={() => setSelectedIntencionId(null)}
          >
            <Text style={[s.intencionPillTxt, !selectedIntencionId && { color: "#3b82f6" }]}>
              {t("dispon_no_intention")}
            </Text>
          </TouchableOpacity>
          {intenciones.filter((i) => i.activa).map((int) => {
            const def = INTENCION_MAP[int.tipo];
            const active = selectedIntencionId === int.id;
            return (
              <TouchableOpacity
                key={int.id}
                style={[s.intencionPill, active && { borderColor: def.color + "88", backgroundColor: def.color + "18" }]}
                onPress={() => setSelectedIntencionId(active ? null : int.id)}
              >
                <Feather name={def.icon as any} size={11} color={active ? def.color : "#666"} />
                <Text style={[s.intencionPillTxt, active && { color: def.color }]}>{intencionLabel(int.tipo, lang)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <View style={s.searchBox}>
          <Feather name="search" size={14} color="#555" />
          <TextInput
            style={s.searchInput}
            placeholder={t("dispon_search_contact")}
            placeholderTextColor="#555"
            value={contactoSearch}
            onChangeText={setContactoSearch}
          />
        </View>

        {contactos.length === 0 ? (
          <View style={s.emptySmall}>
            <Text style={s.emptySmallTxt}>{t("dispon_no_contacts_yet")}</Text>
          </View>
        ) : (
          <KeyboardAwareScrollViewCompat style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }} bottomOffset={16}>
            {contactosConEmail.length > 0 && (
              <>
                <TouchableOpacity style={s.selectAllRow} onPress={toggleAll}>
                  <View style={[s.checkbox, allSelected && s.checkboxOn]}>
                    {allSelected && <Feather name="check" size={10} color="#000" />}
                  </View>
                  <Text style={s.selectAllTxt}>
                    {allSelected
                      ? (lang === "en" ? "Deselect all" : "Deseleccionar todos")
                      : (lang === "en" ? `Select all (${contactosConEmail.length})` : `Seleccionar todos (${contactosConEmail.length})`)}
                  </Text>
                </TouchableOpacity>
                {contactosConEmail.map((c) => {
                  const checked = selectedContactIds.includes(c.id);
                  return (
                    <TouchableOpacity key={c.id} style={[s.contactRow, checked && s.contactRowOn]} onPress={() => toggleContacto(c.id)} activeOpacity={0.8}>
                      <View style={[s.checkbox, checked && s.checkboxOn]}>
                        {checked && <Feather name="check" size={10} color="#000" />}
                      </View>
                      <View style={s.contactInfo}>
                        <Text style={s.contactEmpresa} numberOfLines={1}>{c.empresa || c.responsable || "—"}</Text>
                        <Text style={s.contactEmail} numberOfLines={1}>{c.email}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
            {contactosSinEmail.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { marginTop: 14, color: "#333" }]}>
                  {t("dispon_no_email_sect")} · {contactosSinEmail.length}
                </Text>
                {contactosSinEmail.map((c) => (
                  <View key={c.id} style={[s.contactRow, { opacity: 0.35 }]}>
                    <View style={s.checkbox} />
                    <View style={s.contactInfo}>
                      <Text style={s.contactEmpresa} numberOfLines={1}>{c.empresa || c.responsable || "—"}</Text>
                      <Text style={s.contactEmail}>{t("dispon_no_email_registered")}</Text>
                    </View>
                  </View>
                ))}
              </>
            )}
          </KeyboardAwareScrollViewCompat>
        )}

        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={goToList}>
            <Text style={s.btnSecondaryTxt}>{t("cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, selectedContactIds.length === 0 && { opacity: 0.4 }]}
            onPress={handleContactosNext}
          >
            <Text style={s.btnPrimaryTxt}>
              {selectedContactIds.length > 0
                ? (lang === "en" ? `Continue (${selectedContactIds.length})` : `Continuar (${selectedContactIds.length})`)
                : t("dispon_select_contacts_btn")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STEP: SLOTS ───────────────────────────────────────────────────────
  if (step === "step_slots") {
    const activeCount = activeSlotIds.size;
    const grouped: Record<string, SlotOpcion[]> = {};
    for (const slot of slots) {
      const key = `${slot.diaSemana} ${slot.fecha}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(slot);
    }

    const toggleSlot = (id: string) => {
      setActiveSlotIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id); else next.add(id);
        return next;
      });
    };

    return (
      <View style={s.root}>
        <View style={s.stepHeaderBox}>
          <Text style={s.stepNum}>{lang === "en" ? "Step 2 of 3" : "Paso 2 de 3"}</Text>
          <Text style={s.stepTitle}>{t("dispon_what_options")}</Text>
          <Text style={s.stepSub}>
            {lang === "en"
              ? `Select at least 2 slots · ${activeCount} selected`
              : `Selecciona mínimo 2 franjas · ${activeCount} seleccionadas`}
          </Text>
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {slots.length === 0 ? (
            <View style={s.emptySmall}>
              <Text style={s.emptySmallTxt}>{t("dispon_no_slots_range")}</Text>
            </View>
          ) : (
            Object.entries(grouped).map(([dayLabel, daySlots]) => (
              <View key={dayLabel} style={s.slotDayGroup}>
                <Text style={s.slotDayLabel}>{dayLabel}</Text>
                <View style={s.slotRow}>
                  {daySlots.map((slot) => {
                    const on = activeSlotIds.has(slot.id);
                    return (
                      <TouchableOpacity
                        key={slot.id}
                        style={[s.slotChip, on && s.slotChipOn]}
                        onPress={() => toggleSlot(slot.id)}
                      >
                        <Feather name="clock" size={11} color={on ? "#000" : "#555"} />
                        <Text style={[s.slotChipTxt, on && { color: "#000" }]}>{slot.hora}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))
          )}
        </ScrollView>

        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep("step_contactos")}>
            <Text style={s.btnSecondaryTxt}>{t("intent_back")}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.btnPrimary, activeCount < 2 && { opacity: 0.4 }]}
            onPress={handleSlotsNext}
          >
            <Text style={s.btnPrimaryTxt}>
              {activeCount >= 2
                ? (lang === "en" ? `Draft email (${activeCount} options)` : `Redactar correo (${activeCount} opciones)`)
                : (lang === "en" ? "At least 2 options" : "Mínimo 2 opciones")}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STEP: EMAIL ───────────────────────────────────────────────────────
  if (step === "step_email") {
    return (
      <View style={s.root}>
        <View style={s.stepHeaderBox}>
          <Text style={s.stepNum}>{lang === "en" ? "Step 3 of 3" : "Paso 3 de 3"}</Text>
          <Text style={s.stepTitle}>{t("dispon_review_email")}</Text>
          <Text style={s.stepSub}>{t("dispon_email_edit_sub")}</Text>
        </View>

        <KeyboardAwareScrollViewCompat style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }} bottomOffset={16}>
          <Text style={s.emailFieldLabel}>{t("dispon_subject_lbl")}</Text>
          <TextInput
            style={s.emailAsunto}
            value={asunto}
            onChangeText={setAsunto}
            placeholderTextColor="#555"
          />

          <Text style={[s.emailFieldLabel, { marginTop: 14 }]}>{t("dispon_body_lbl")}</Text>
          {guidanceCfg.hintMaxCount > 0 && (
            <View style={s.emailBodyNote}>
              <Feather name="info" size={11} color="#3b82f6" />
              <Text style={s.emailBodyNoteTxt}>{t("dispon_each_personalized")}</Text>
            </View>
          )}
          <TextInput
            style={s.emailBody}
            value={cuerpo}
            onChangeText={setCuerpo}
            multiline
            placeholderTextColor="#555"
            textAlignVertical="top"
          />

          <View style={s.emailStats}>
            <StatPill icon="users"    label={lang === "en" ? `${selectedContactIds.length} contacts` : `${selectedContactIds.length} contactos`} />
            <StatPill icon="calendar" label={lang === "en" ? `${activeSlotIds.size} options` : `${activeSlotIds.size} opciones`} />
            {selectedIntencion && (
              <StatPill icon="target" label={intencionLabel(selectedIntencion.tipo, lang)} />
            )}
          </View>
        </KeyboardAwareScrollViewCompat>

        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep("step_slots")}>
            <Text style={s.btnSecondaryTxt}>{t("intent_back")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={handleEmailNext}>
            <Feather name="send" size={15} color="#000" />
            <Text style={s.btnPrimaryTxt}>{t("dispon_prepare_send")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STEP: SEND ────────────────────────────────────────────────────────
  if (step === "step_send") {
    const contactoActual = contactos.find((c) => c.id === selectedContactIds[sendIdx]);
    const total = selectedContactIds.length;
    const progress = sendIdx / total;

    return (
      <View style={s.root}>
        <View style={s.stepHeaderBox}>
          <Text style={s.stepNum}>
            {lang === "en" ? `Sending ${sendIdx + 1} of ${total}` : `Enviando ${sendIdx + 1} de ${total}`}
          </Text>
          <Text style={s.stepTitle}>{contactoActual?.empresa || contactoActual?.responsable || "—"}</Text>
          <Text style={s.stepSub}>
            {contactoActual?.email || t("dispon_no_email_short")}
          </Text>
        </View>

        <View style={s.progressBar}>
          <View style={[s.progressFill, { width: `${Math.round(progress * 100)}%` as any }]} />
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
          {contactoActual && (
            <View style={s.emailPreviewBox}>
              <Text style={s.emailPreviewLabel}>{t("dispon_preview_lbl")}</Text>
              <Text style={s.emailPreviewAsunto}>{asunto}</Text>
              <Text style={s.emailPreviewBody}>
                {generarCuerpo({
                  contacto: contactoActual,
                  intencion: selectedIntencion,
                  slots: slots.filter((sl) => activeSlotIds.has(sl.id)),
                })}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={s.sendActions}>
          <TouchableOpacity
            style={s.btnSendMail}
            activeOpacity={0.85}
            onPress={async () => {
              if (contactoActual) await sendToContact(contactoActual);
              handleSentContact();
            }}
          >
            <Feather name="mail" size={18} color="#000" />
            <Text style={s.btnSendMailTxt}>{t("dispon_open_mail")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnSkip} onPress={handleSentContact}>
            <Text style={s.btnSkipTxt}>{t("dispon_skip_btn")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STEP: DONE ────────────────────────────────────────────────────────
  if (step === "step_done") {
    return (
      <View style={[s.root, s.doneRoot]}>
        <View style={s.doneIcon}>
          <Feather name="check-circle" size={52} color="#6ee7b7" />
        </View>
        <Text style={s.doneTitle}>{t("dispon_requests_sent")}</Text>
        <View style={s.doneStats}>
          <DoneStat num={sentCount}                             label={t("dispon_sent_lbl")}    color="#6ee7b7" />
          <DoneStat num={selectedContactIds.length - sentCount} label={t("dispon_skipped_lbl")} color="#6b7280" />
        </View>
        <Text style={s.doneSub}>{t("dispon_respond_hint")}</Text>
        <TouchableOpacity style={s.btnPrimary} onPress={goToList}>
          <Text style={s.btnPrimaryTxt}>{t("dispon_view_requests")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── STEP: REGISTRAR RESPUESTA ─────────────────────────────────────────
  if (step === "step_respuesta" && respuestaSolicitud) {
    const contacto = contactos.find((c) => c.id === respuestaContactoId);

    return (
      <View style={s.root}>
        <View style={s.stepHeaderBox}>
          <Text style={s.stepNum}>{t("dispon_record_response")}</Text>
          <Text style={s.stepTitle}>{contacto?.empresa || contacto?.responsable || t("word_contact")}</Text>
          <Text style={s.stepSub}>{t("dispon_mark_options")}</Text>
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
          <Text style={s.sectionLabel}>{t("dispon_options_offered")}</Text>
          {respuestaSolicitud.slots.map((slot, i) => {
            const on = respuestaSlotIds.has(slot.id);
            return (
              <TouchableOpacity
                key={slot.id}
                style={[s.respSlot, on && s.respSlotOn]}
                onPress={() => {
                  setRespuestaSlotIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(slot.id)) next.delete(slot.id); else next.add(slot.id);
                    return next;
                  });
                }}
              >
                <View style={[s.respSlotNum, on && { backgroundColor: "#6ee7b7" }]}>
                  <Text style={[s.respSlotNumTxt, on && { color: "#000" }]}>{i + 1}</Text>
                </View>
                <Text style={[s.respSlotLabel, on && { color: "#fff" }]}>{formatSlotLabel(slot)}</Text>
                {on && <Feather name="check" size={14} color="#6ee7b7" />}
              </TouchableOpacity>
            );
          })}

          <Text style={[s.sectionLabel, { marginTop: 16 }]}>{t("dispon_note_optional")}</Text>
          <TextInput
            style={[s.textField, { height: 68 }]}
            value={respuestaNota}
            onChangeText={setRespuestaNota}
            placeholder={lang === "en" ? "E.g.: prefers mornings, on holiday next week…" : "Ej: prefiere mañanas, tiene vacaciones la semana siguiente…"}
            placeholderTextColor="#555"
            multiline
            textAlignVertical="top"
          />
        </ScrollView>

        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep("list")}>
            <Text style={s.btnSecondaryTxt}>{t("cancel")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.btnPrimary} onPress={handleGuardarRespuesta}>
            <Feather name="save" size={15} color="#000" />
            <Text style={s.btnPrimaryTxt}>{t("dispon_save_response")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────

function SolicitudCard({
  solicitud: sol,
  contactos,
  estadoLabel,
  onSendPending,
  onRegistrarRespuesta,
  onDelete,
}: {
  solicitud: SolicitudDisponibilidad;
  contactos: Contacto[];
  estadoLabel: Record<string, string>;
  onSendPending?: () => void;
  onRegistrarRespuesta: (contactoId: string) => void;
  onDelete: () => void;
}) {
  const { lang, t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const color = ESTADO_COLOR[sol.estado as EstadoSolicitud];
  const sinRespuesta = sol.contactoIds.filter(
    (id) => !sol.respuestas.find((r) => r.contactoId === id)
  );

  return (
    <TouchableOpacity
      style={[s.card, { borderLeftColor: color }]}
      onPress={() => setExpanded((p) => !p)}
      activeOpacity={0.85}
    >
      <View style={s.cardHeader}>
        <View style={s.cardMain}>
          <Text style={s.cardAsunto} numberOfLines={1}>{sol.asunto}</Text>
          <View style={s.cardMeta}>
            <View style={[s.estadoPill, { backgroundColor: color + "22", borderColor: color + "55" }]}>
              <Text style={[s.estadoPillTxt, { color }]}>
                {estadoLabel[sol.estado] ?? sol.estado}
              </Text>
            </View>
            <Text style={s.cardMetaTxt}>
              {sol.contactoIds.length} {lang === "en" ? "contacts" : "contactos"} · {sol.slots.length} {lang === "en" ? "options" : "opciones"}
            </Text>
          </View>
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={s.cardActionBtn}>
            <Feather name="trash-2" size={13} color="#ef444455" />
          </TouchableOpacity>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={13} color="#444" />
        </View>
      </View>

      {expanded && (
        <View style={s.cardDetail}>
          <Text style={s.detailSectionLabel}>{t("dispon_offered_slots")}</Text>
          <View style={s.slotsWrap}>
            {sol.slots.slice(0, 6).map((sl) => (
              <View key={sl.id} style={s.slotTag}>
                <Text style={s.slotTagTxt}>{formatSlotLabel(sl)}</Text>
              </View>
            ))}
            {sol.slots.length > 6 && (
              <View style={s.slotTag}>
                <Text style={s.slotTagTxt}>+{sol.slots.length - 6} {t("dispon_more")}</Text>
              </View>
            )}
          </View>

          {sol.respuestas.length > 0 && (
            <>
              <Text style={[s.detailSectionLabel, { marginTop: 10 }]}>{t("dispon_resp_received")}</Text>
              {sol.respuestas.map((r) => {
                const c = contactos.find((x) => x.id === r.contactoId);
                return (
                  <View key={r.contactoId} style={s.respRow}>
                    <Feather name="check-circle" size={12} color="#6ee7b7" />
                    <Text style={s.respTxt} numberOfLines={1}>
                      {c?.empresa || c?.responsable || r.contactoId} — {r.slotIds.length} {lang === "en" ? "option(s)" : "opción(es)"}
                    </Text>
                  </View>
                );
              })}
            </>
          )}

          {sinRespuesta.length > 0 && (
            <>
              <Text style={[s.detailSectionLabel, { marginTop: 10 }]}>{t("dispon_pending_resp")}</Text>
              {sinRespuesta.map((id) => {
                const c = contactos.find((x) => x.id === id);
                return (
                  <TouchableOpacity key={id} style={s.pendingRow} onPress={() => onRegistrarRespuesta(id)}>
                    <Feather name="clock" size={12} color="#f59e0b" />
                    <Text style={s.pendingTxt} numberOfLines={1}>
                      {c?.empresa || c?.responsable || id}
                    </Text>
                    <Feather name="plus-circle" size={12} color="#3b82f6" />
                    <Text style={s.pendingAddTxt}>{t("dispon_record_btn")}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          )}

          {onSendPending && sol.estado === "borrador" && (
            <TouchableOpacity style={s.sendPendingBtn} onPress={onSendPending}>
              <Feather name="send" size={13} color="#3b82f6" />
              <Text style={s.sendPendingTxt}>{t("dispon_continue_send")}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyDisponibilidad({ onNew }: { onNew: () => void }) {
  const { t } = useLanguage();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Feather name="mail" size={36} color="#2a2a2a" />
      </View>
      <Text style={s.emptyTitle}>{t("dispon_no_reqs_title")}</Text>
      <Text style={s.emptySub}>{t("dispon_no_reqs_sub")}</Text>
      <TouchableOpacity style={s.emptyBtn} onPress={onNew} activeOpacity={0.85}>
        <Feather name="send" size={16} color="#000" />
        <Text style={s.emptyBtnTxt}>{t("dispon_create_first")}</Text>
      </TouchableOpacity>
    </View>
  );
}

function StatPill({ icon, label }: { icon: string; label: string }) {
  return (
    <View style={s.statPill}>
      <Feather name={icon as any} size={11} color="#555" />
      <Text style={s.statPillTxt}>{label}</Text>
    </View>
  );
}

function DoneStat({ num, label, color }: { num: number; label: string; color: string }) {
  return (
    <View style={s.doneStat}>
      <Text style={[s.doneStatNum, { color }]}>{num}</Text>
      <Text style={s.doneStatLabel}>{label}</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:            { flex: 1 },
  scroll:          { flex: 1, paddingHorizontal: 14 },

  sectionLabel:    { fontSize: 10, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8, marginTop: 8, paddingHorizontal: 2 },

  fab:             { position: "absolute", bottom: 20, left: 16, right: 16, backgroundColor: "#4A80BD", borderRadius: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 15 },
  fabTxt:          { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },

  stepHeaderBox:   { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  stepNum:         { fontSize: 10, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 2 },
  stepTitle:       { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 2 },
  stepSub:         { fontSize: 12, color: "#6B7280" },

  intencionRow:    { flexGrow: 0, paddingVertical: 10 },
  intencionPill:   { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#FFFFFF" },
  intencionPillActive: { borderColor: "rgba(74,128,189,0.3)", backgroundColor: "rgba(74,128,189,0.08)" },
  intencionPillTxt:{ fontSize: 11, color: "#6B7280", fontWeight: "600" },

  searchBox:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F7F8FA", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, marginHorizontal: 14, marginBottom: 6, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  searchInput:     { flex: 1, fontSize: 13, color: "#111827" },

  selectAllRow:    { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)", marginBottom: 4 },
  selectAllTxt:    { fontSize: 12, color: "#6B7280", fontWeight: "600" },
  contactRow:      { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  contactRowOn:    { },
  contactInfo:     { flex: 1 },
  contactEmpresa:  { fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 1 },
  contactEmail:    { fontSize: 11, color: "#9CA3AF" },
  checkbox:        { width: 20, height: 20, borderRadius: 6, borderWidth: 1.5, borderColor: "#D1D5DB", alignItems: "center", justifyContent: "center" },
  checkboxOn:      { backgroundColor: "#3D9A84", borderColor: "#3D9A84" },

  emptySmall:      { padding: 32, alignItems: "center" },
  emptySmallTxt:   { fontSize: 13, color: "#9CA3AF", textAlign: "center" },

  slotDayGroup:    { marginBottom: 14 },
  slotDayLabel:    { fontSize: 12, fontWeight: "700", color: "#6B7280", marginBottom: 8 },
  slotRow:         { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  slotChip:        { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#FFFFFF" },
  slotChipOn:      { backgroundColor: "#3D9A84", borderColor: "#3D9A84" },
  slotChipTxt:     { fontSize: 13, fontWeight: "600", color: "#6B7280" },

  emailFieldLabel: { fontSize: 10, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  emailAsunto:     { backgroundColor: "#F7F8FA", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: "#111827", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", marginBottom: 4 },
  emailBodyNote:   { flexDirection: "row", alignItems: "flex-start", gap: 6, backgroundColor: "#EFF6FF", borderRadius: 8, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: "rgba(59,130,246,0.15)" },
  emailBodyNoteTxt:{ fontSize: 11, color: "#3B82F6", flex: 1, lineHeight: 16 },
  emailBody:       { backgroundColor: "#F7F8FA", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 12, color: "#6B7280", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", height: 280, lineHeight: 19 },
  emailStats:      { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 14 },
  statPill:        { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  statPillTxt:     { fontSize: 11, color: "#6B7280" },

  progressBar:     { height: 3, backgroundColor: "#E5E7EB", marginHorizontal: 14, marginBottom: 12, borderRadius: 2 },
  progressFill:    { height: 3, backgroundColor: "#4A80BD", borderRadius: 2 },
  emailPreviewBox: { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 16, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  emailPreviewLabel:{ fontSize: 9, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 },
  emailPreviewAsunto:{ fontSize: 13, fontWeight: "700", color: "#111827", marginBottom: 12 },
  emailPreviewBody:{ fontSize: 12, color: "#6B7280", lineHeight: 19 },
  sendActions:     { padding: 14, gap: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  btnSendMail:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "#4A80BD", borderRadius: 14, paddingVertical: 15 },
  btnSendMailTxt:  { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  btnSkip:         { alignItems: "center", paddingVertical: 8 },
  btnSkipTxt:      { fontSize: 13, color: "#9CA3AF", fontWeight: "600" },

  doneRoot:        { alignItems: "center", justifyContent: "center", padding: 32 },
  doneIcon:        { marginBottom: 24 },
  doneTitle:       { fontSize: 22, fontWeight: "800", color: "#111827", marginBottom: 20, textAlign: "center" },
  doneStats:       { flexDirection: "row", gap: 32, marginBottom: 16 },
  doneStat:        { alignItems: "center" },
  doneStatNum:     { fontSize: 40, fontWeight: "900" },
  doneStatLabel:   { fontSize: 11, color: "#9CA3AF", fontWeight: "600", marginTop: 2 },
  doneSub:         { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 28 },

  card:            { backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", borderLeftWidth: 3 },
  cardHeader:      { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  cardMain:        { flex: 1, gap: 6 },
  cardAsunto:      { fontSize: 13, fontWeight: "700", color: "#111827" },
  cardMeta:        { flexDirection: "row", alignItems: "center", gap: 8 },
  cardMetaTxt:     { fontSize: 11, color: "#9CA3AF" },
  estadoPill:      { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  estadoPillTxt:   { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },
  cardActions:     { flexDirection: "row", alignItems: "center", gap: 6 },
  cardActionBtn:   { padding: 4 },
  cardDetail:      { paddingHorizontal: 14, paddingBottom: 14, paddingTop: 4, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" },
  detailSectionLabel: { fontSize: 9, color: "#9CA3AF", fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  slotsWrap:       { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  slotTag:         { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: "#F3F4F6" },
  slotTagTxt:      { fontSize: 11, color: "#6B7280" },
  respRow:         { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 3 },
  respTxt:         { fontSize: 12, color: "#3D9A84", flex: 1 },
  pendingRow:      { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 },
  pendingTxt:      { fontSize: 12, color: "#9CA3AF", flex: 1 },
  pendingAddTxt:   { fontSize: 11, color: "#4A80BD", fontWeight: "600" },
  sendPendingBtn:  { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, alignSelf: "flex-start", paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: "#EFF6FF", borderWidth: 1, borderColor: "rgba(59,130,246,0.15)" },
  sendPendingTxt:  { fontSize: 12, color: "#4A80BD", fontWeight: "600" },

  respSlot:        { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", backgroundColor: "#FFFFFF", marginBottom: 8 },
  respSlotOn:      { borderColor: "rgba(61,154,132,0.3)", backgroundColor: "rgba(61,154,132,0.08)" },
  respSlotNum:     { width: 28, height: 28, borderRadius: 8, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  respSlotNumTxt:  { fontSize: 12, fontWeight: "800", color: "#9CA3AF" },
  respSlotLabel:   { flex: 1, fontSize: 13, fontWeight: "600", color: "#6B7280" },
  textField:       { backgroundColor: "#F7F8FA", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13, color: "#111827", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },

  navRow:          { flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  btnPrimary:      { flex: 1, backgroundColor: "#4A80BD", borderRadius: 12, paddingVertical: 13, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  btnPrimaryTxt:   { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
  btnSecondary:    { borderRadius: 12, paddingVertical: 13, paddingHorizontal: 16, alignItems: "center", justifyContent: "center", backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  btnSecondaryTxt: { fontSize: 14, fontWeight: "700", color: "#6B7280" },

  createBtn:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#4A80BD", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 16, marginHorizontal: 14, marginTop: 10, marginBottom: 4, alignSelf: "flex-start" },
  createBtnTxt:    { fontSize: 13, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
  emptyInline:     { alignItems: "center", paddingVertical: 48, paddingHorizontal: 28, gap: 10 },
  emptyInlineTitle:{ fontSize: 15, fontWeight: "700", color: "#374151", textAlign: "center" },
  emptyInlineSub:  { fontSize: 12, color: "#9CA3AF", textAlign: "center", lineHeight: 18 },

  empty:           { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, marginTop: 60 },
  emptyIcon:       { width: 80, height: 80, borderRadius: 40, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  emptyTitle:      { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8, textAlign: "center" },
  emptySub:        { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 24 },
  emptyBtn:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#4A80BD", borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  emptyBtnTxt:     { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
