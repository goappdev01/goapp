import React, { useCallback, useEffect, useRef, useMemo, useState } from "react";
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  INTENCIONES_DEF,
  INTENCION_MAP,
  PRIORIDAD_COLOR,
  FRECUENCIA_OPTIONS,
  crearIntencion,
  deleteIntencion,
  loadIntenciones,
  toggleIntencion,
  defaultIntencion,
  type Intencion,
  type TipoIntencion,
  type Prioridad,
  type TipoDesplazamiento,
  type AlcanceContactos,
} from "@/data/intenciones";
import { loadContactos, type TipoContacto } from "@/data/contactos";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";
import { intencionLabel, intencionDesc } from "@/utils/intencionI18n";

type Step = "list" | "pick" | "scope" | "config";

interface Props {
  onBack: () => void;
  guidanceLevel?: number;
}

export function IntencionesScreen({ onBack, guidanceLevel = 5 }: Props) {
  const { lang, t } = useLanguage();
  const [step, setStep] = useState<Step>("list");
  const [intenciones, setIntenciones] = useState<Intencion[]>([]);
  const [totalContactos, setTotalContactos] = useState(0);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoIntencion | null>(null);
  const [draft, setDraft] = useState<Omit<Intencion, "id" | "creadaEn" | "activa"> | null>(null);
  const [showConfig, setShowConfig] = useState(false);
  const configAnim = useRef(new Animated.Value(0)).current;

  const TIPO_CONTACTO_OPTS: { key: TipoContacto; label: string }[] = [
    { key: "cliente",   label: t("tipo_cliente") },
    { key: "proveedor", label: t("tipo_proveedor") },
    { key: "tecnico",   label: t("tipo_tecnico") },
    { key: "comercial", label: t("tipo_comercial") },
    { key: "otro",      label: t("tipo_otro") },
  ];

  const PRIORIDAD_LABEL = useMemo<Record<Prioridad, string>>(() => ({
    alta:  t("prioridad_alta"),
    media: t("prioridad_media"),
    baja:  t("prioridad_baja"),
  }), [t]);

  const DESPLAZAMIENTO_LABEL = useMemo<Record<TipoDesplazamiento, string>>(() => ({
    presencial: t("desp_presencial"),
    remoto:     t("desp_remoto"),
    mixto:      t("desp_mixto"),
  }), [t]);

  const FRECUENCIA_OPTS = useMemo(() => [
    t("frec_una_vez"),
    t("frec_semanal"),
    t("frec_quincenal"),
    t("frec_mensual"),
    t("frec_bimestral"),
    t("frec_trimestral"),
    t("frec_semestral"),
    t("frec_anual"),
  ], [t]);

  const load = useCallback(async () => {
    const [ints, contacts] = await Promise.all([loadIntenciones(), loadContactos()]);
    setIntenciones(ints);
    setTotalContactos(contacts.length);
  }, []);

  useEffect(() => { load(); }, [load]);

  const goToList = () => { setStep("list"); setShowConfig(false); setDraft(null); setTipoSeleccionado(null); };

  const selectTipo = (tipo: TipoIntencion) => {
    setTipoSeleccionado(tipo);
    setDraft(defaultIntencion(tipo));
    setStep("scope");
  };

  const toggleConfigPanel = () => {
    const next = !showConfig;
    setShowConfig(next);
    Animated.spring(configAnim, {
      toValue: next ? 1 : 0,
      useNativeDriver: false,
      friction: 8,
    }).start();
  };

  const handleSave = async () => {
    if (!draft) return;
    await crearIntencion(draft);
    await load();
    goToList();
  };

  const handleDelete = (id: string, label: string) => {
    Alert.alert(
      t("intent_delete_title"),
      lang === "en" ? `Delete "${label}"?` : `¿Eliminar "${label}"?`,
      [
        { text: t("cancel"), style: "cancel" },
        {
          text: t("delete"),
          style: "destructive",
          onPress: async () => { await deleteIntencion(id); load(); }
        },
      ]
    );
  };

  const handleToggle = async (id: string) => {
    await toggleIntencion(id);
    load();
  };

  type DraftType = NonNullable<typeof draft>;
  const patchDraft = <K extends keyof DraftType>(key: K, value: DraftType[K]) => {
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);
  };

  // ── STEP: LIST ────────────────────────────────────────────────────────
  if (step === "list") {
    const activas = intenciones.filter((i) => i.activa);
    const pausadas = intenciones.filter((i) => !i.activa);

    return (
      <View style={s.root}>
        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {intenciones.length === 0 ? (
            <EmptyIntenciones onNew={() => setStep("pick")} showHint={guidanceCfg.hintMaxCount > 0} />
          ) : (
            <>
              {activas.length > 0 && (
                <>
                  <Text style={s.sectionLabel}>
                    {t("intent_active_label")} · {activas.length}
                  </Text>
                  {activas.map((i) => (
                    <IntencionCard
                      key={i.id}
                      intencion={i}
                      prioridadLabel={PRIORIDAD_LABEL}
                      desplazamientoLabel={DESPLAZAMIENTO_LABEL}
                      onToggle={() => handleToggle(i.id)}
                      onDelete={() => handleDelete(i.id, INTENCION_MAP[i.tipo].label)}
                    />
                  ))}
                </>
              )}
              {pausadas.length > 0 && (
                <>
                  <Text style={[s.sectionLabel, { marginTop: 20 }]}>
                    {t("intent_paused_label")} · {pausadas.length}
                  </Text>
                  {pausadas.map((i) => (
                    <IntencionCard
                      key={i.id}
                      intencion={i}
                      prioridadLabel={PRIORIDAD_LABEL}
                      desplazamientoLabel={DESPLAZAMIENTO_LABEL}
                      onToggle={() => handleToggle(i.id)}
                      onDelete={() => handleDelete(i.id, INTENCION_MAP[i.tipo].label)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </ScrollView>

        <TouchableOpacity style={s.fab} onPress={() => setStep("pick")} activeOpacity={0.85}>
          <Feather name="plus" size={22} color="#000" />
          <Text style={s.fabTxt}>{t("intent_new_btn")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── STEP: PICK TIPO ───────────────────────────────────────────────────
  if (step === "pick") {
    return (
      <View style={s.root}>
        <View style={s.pickHeader}>
          <Text style={s.pickTitle}>{t("intent_what")}</Text>
          {guidanceCfg.hintMaxCount > 0 && (
            <Text style={s.pickSub}>{t("intent_select_purpose")}</Text>
          )}
        </View>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.pickGrid}>
          {INTENCIONES_DEF.map((def) => (
            <TouchableOpacity
              key={def.tipo}
              style={[s.pickCard, { borderColor: def.color + "33" }]}
              activeOpacity={0.8}
              onPress={() => selectTipo(def.tipo)}
            >
              <View style={[s.pickCardIcon, { backgroundColor: def.color + "18" }]}>
                <Feather name={def.icon as any} size={22} color={def.color} />
              </View>
              <Text style={s.pickCardLabel}>{intencionLabel(def.tipo, lang)}</Text>
              <Text style={s.pickCardDesc} numberOfLines={2}>{intencionDesc(def.tipo, lang)}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={goToList}>
            <Text style={s.btnSecondaryTxt}>{t("cancel")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── STEP: SCOPE + CONFIG ──────────────────────────────────────────────
  if ((step === "scope" || step === "config") && draft && tipoSeleccionado) {
    const def = INTENCION_MAP[tipoSeleccionado];

    return (
      <View style={s.root}>
        {/* Intent hero */}
        <View style={[s.intentHero, { borderColor: def.color + "33" }]}>
          <View style={[s.intentIconCircle, { backgroundColor: def.color + "18" }]}>
            <Feather name={def.icon as any} size={28} color={def.color} />
          </View>
          <View style={s.intentHeroText}>
            <Text style={s.intentLabel}>{intencionLabel(tipoSeleccionado, lang)}</Text>
            <Text style={s.intentDesc}>{intencionDesc(tipoSeleccionado, lang)}</Text>
          </View>
          <TouchableOpacity onPress={() => setStep("pick")} hitSlop={8}>
            <Feather name="edit-2" size={14} color="#555" />
          </TouchableOpacity>
        </View>

        <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>

          {/* ── Alcance ── */}
          <Text style={s.sectionLabel}>{t("intent_who")}</Text>
          <View style={s.alcanceRow}>
            {([
              { key: "todos",    label: `${t("intent_everyone")} (${totalContactos})`, icon: "users" },
              { key: "por_tipo", label: t("intent_by_type"),                           icon: "filter" },
            ] as { key: AlcanceContactos; label: string; icon: string }[]).map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[s.alcanceBtn, draft.alcance === opt.key && { borderColor: def.color, backgroundColor: def.color + "12" }]}
                onPress={() => patchDraft("alcance", opt.key)}
              >
                <Feather name={opt.icon as any} size={14} color={draft.alcance === opt.key ? def.color : "#555"} />
                <Text style={[s.alcanceBtnTxt, draft.alcance === opt.key && { color: def.color }]}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {draft.alcance === "por_tipo" && (
            <View style={s.tipoRow}>
              {TIPO_CONTACTO_OPTS.map((tp) => {
                const active = draft.tiposContacto.includes(tp.key);
                return (
                  <TouchableOpacity
                    key={tp.key}
                    style={[s.tipoPill, active && { borderColor: def.color + "88", backgroundColor: def.color + "18" }]}
                    onPress={() => {
                      const cur = draft.tiposContacto;
                      patchDraft("tiposContacto", active ? cur.filter((x) => x !== tp.key) : [...cur, tp.key]);
                    }}
                  >
                    <Text style={[s.tipoPillTxt, active && { color: def.color }]}>{tp.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Prioridad ── */}
          <Text style={s.sectionLabel}>{t("intent_priority_label")}</Text>
          <View style={s.priorityRow}>
            {(["alta", "media", "baja"] as Prioridad[]).map((p) => {
              const color = PRIORIDAD_COLOR[p];
              const active = draft.prioridad === p;
              return (
                <TouchableOpacity
                  key={p}
                  style={[s.priorityBtn, active && { borderColor: color, backgroundColor: color + "18" }]}
                  onPress={() => patchDraft("prioridad", p)}
                >
                  <View style={[s.priorityDot, { backgroundColor: active ? color : "#333" }]} />
                  <Text style={[s.priorityTxt, active && { color }]}>{PRIORIDAD_LABEL[p]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Desplazamiento ── */}
          <Text style={s.sectionLabel}>{t("intent_travel_type")}</Text>
          <View style={s.desplRow}>
            {(["presencial", "remoto", "mixto"] as TipoDesplazamiento[]).map((d) => {
              const active = draft.tipoDesplazamiento === d;
              const icon = d === "presencial" ? "map-pin" : d === "remoto" ? "monitor" : "shuffle";
              return (
                <TouchableOpacity
                  key={d}
                  style={[s.desplBtn, active && { borderColor: def.color + "88", backgroundColor: def.color + "12" }]}
                  onPress={() => patchDraft("tipoDesplazamiento", d)}
                >
                  <Feather name={icon as any} size={14} color={active ? def.color : "#555"} />
                  <Text style={[s.desplTxt, active && { color: def.color }]}>{DESPLAZAMIENTO_LABEL[d]}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Config avanzada ── */}
          <TouchableOpacity style={s.configToggle} onPress={toggleConfigPanel} activeOpacity={0.8}>
            <Feather name="sliders" size={14} color="#555" />
            <Text style={s.configToggleTxt}>{t("intent_adv_settings")}</Text>
            <Feather name={showConfig ? "chevron-up" : "chevron-down"} size={14} color="#555" />
          </TouchableOpacity>

          {showConfig && (
            <Animated.View style={{ opacity: configAnim }}>

              {/* Duración */}
              <View style={s.numRow}>
                <Text style={[s.sectionLabel, { flex: 1 }]}>{t("intent_duration_min")}</Text>
                <View style={s.numBox}>
                  <TextInput
                    style={s.numInput}
                    value={String(draft.duracionMin)}
                    onChangeText={v => patchDraft("duracionMin", parseInt(v) || 0)}
                    selectTextOnFocus
                    keyboardType="numeric"
                    returnKeyType="done"
                  />
                  <Text style={s.numUnit}>min</Text>
                </View>
              </View>

              {/* Margen días */}
              <Text style={s.sectionLabel}>{t("intent_days_margin")}</Text>
              <View style={s.durationRow}>
                {[3, 5, 7, 14, 21, 30].map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[s.durationBtn, draft.margenDias === d && { borderColor: def.color, backgroundColor: def.color + "18" }]}
                    onPress={() => patchDraft("margenDias", d)}
                  >
                    <Text style={[s.durationTxt, draft.margenDias === d && { color: def.color }]}>{d}d</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Horario */}
              <Text style={s.sectionLabel}>{t("intent_pref_schedule")}</Text>
              <View style={s.horarioRow}>
                <View style={s.horarioField}>
                  <Text style={s.horarioLabel}>{t("intent_from")}</Text>
                  <TextInput
                    style={s.horarioInput}
                    value={draft.horario.desde}
                    onChangeText={(v) => patchDraft("horario", { ...draft.horario, desde: v })}
                    placeholder="09:00"
                    placeholderTextColor="#555"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
                <Feather name="arrow-right" size={14} color="#444" style={{ marginTop: 20 }} />
                <View style={s.horarioField}>
                  <Text style={s.horarioLabel}>{t("intent_to")}</Text>
                  <TextInput
                    style={s.horarioInput}
                    value={draft.horario.hasta}
                    onChangeText={(v) => patchDraft("horario", { ...draft.horario, hasta: v })}
                    placeholder="18:00"
                    placeholderTextColor="#555"
                    keyboardType="numbers-and-punctuation"
                  />
                </View>
              </View>

              {/* Frecuencia */}
              <Text style={s.sectionLabel}>{t("intent_frequency")}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.frecRow}>
                {FRECUENCIA_OPTS.map((f, idx) => {
                  const originalF = FRECUENCIA_OPTIONS[idx];
                  const isActive = draft.frecuencia === originalF;
                  return (
                    <TouchableOpacity
                      key={f}
                      style={[s.frecPill, isActive && { borderColor: def.color + "88", backgroundColor: def.color + "18" }]}
                      onPress={() => patchDraft("frecuencia", originalF)}
                    >
                      <Text style={[s.frecPillTxt, isActive && { color: def.color }]}>{f}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Técnico */}
              <Text style={s.sectionLabel}>{t("intent_tech_label")}</Text>
              <TextInput
                style={s.textField}
                value={draft.tecnicoAsignado}
                onChangeText={(v) => patchDraft("tecnicoAsignado", v)}
                placeholder={t("intent_tech_placeholder")}
                placeholderTextColor="#555"
              />

              {/* Comercial */}
              <Text style={s.sectionLabel}>{t("intent_sales_label")}</Text>
              <TextInput
                style={s.textField}
                value={draft.comercialAsignado}
                onChangeText={(v) => patchDraft("comercialAsignado", v)}
                placeholder={t("intent_sales_placeholder")}
                placeholderTextColor="#555"
              />

              {/* Notas */}
              <Text style={s.sectionLabel}>{t("intent_notes_label")}</Text>
              <TextInput
                style={[s.textField, { height: 72, textAlignVertical: "top" }]}
                value={draft.notas}
                onChangeText={(v) => patchDraft("notas", v)}
                placeholder={t("intent_notes_placeholder")}
                placeholderTextColor="#555"
                multiline
              />
            </Animated.View>
          )}
        </ScrollView>

        {/* Bottom nav */}
        <View style={s.navRow}>
          <TouchableOpacity style={s.btnSecondary} onPress={() => setStep("pick")}>
            <Text style={s.btnSecondaryTxt}>{t("intent_back")}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.btnPrimary, { backgroundColor: def.color }]} onPress={handleSave}>
            <Feather name="check" size={16} color="#000" />
            <Text style={s.btnPrimaryTxt}>{t("intent_save_btn")}</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return null;
}

// ── Sub-components ────────────────────────────────────────────────────

function IntencionCard({
  intencion: i,
  prioridadLabel,
  desplazamientoLabel,
  onToggle,
  onDelete,
}: {
  intencion: Intencion;
  prioridadLabel: Record<Prioridad, string>;
  desplazamientoLabel: Record<TipoDesplazamiento, string>;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { lang } = useLanguage();
  const def = INTENCION_MAP[i.tipo];
  const prioColor = PRIORIDAD_COLOR[i.prioridad];
  const [expanded, setExpanded] = useState(false);

  return (
    <TouchableOpacity
      style={[s.card, !i.activa && s.cardPaused, { borderLeftColor: def.color }]}
      activeOpacity={0.85}
      onPress={() => setExpanded((p) => !p)}
    >
      <View style={s.cardHeader}>
        <View style={[s.cardIconBox, { backgroundColor: def.color + "18" }]}>
          <Feather name={def.icon as any} size={18} color={i.activa ? def.color : "#444"} />
        </View>
        <View style={s.cardMain}>
          <Text style={[s.cardLabel, !i.activa && { color: "#555" }]}>{intencionLabel(i.tipo, lang)}</Text>
          <View style={s.cardMeta}>
            <View style={[s.prioDot, { backgroundColor: prioColor }]} />
            <Text style={s.cardMetaTxt}>{prioridadLabel[i.prioridad]}</Text>
            <Text style={s.cardMetaDot}>·</Text>
            <Text style={s.cardMetaTxt}>{desplazamientoLabel[i.tipoDesplazamiento]}</Text>
            <Text style={s.cardMetaDot}>·</Text>
            <Text style={s.cardMetaTxt}>{i.duracionMin}'</Text>
          </View>
        </View>
        <View style={s.cardActions}>
          <TouchableOpacity onPress={onToggle} hitSlop={8} style={s.cardActionBtn}>
            <Feather name={i.activa ? "pause" : "play"} size={13} color={i.activa ? "#f59e0b" : "#6ee7b7"} />
          </TouchableOpacity>
          <TouchableOpacity onPress={onDelete} hitSlop={8} style={s.cardActionBtn}>
            <Feather name="trash-2" size={13} color="#ef444466" />
          </TouchableOpacity>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={13} color="#444" />
        </View>
      </View>

      {expanded && (
        <View style={s.cardDetail}>
          <Text style={s.cardDetailTxt}>{intencionDesc(i.tipo, lang)}</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyIntenciones({ onNew, showHint }: { onNew: () => void; showHint: boolean }) {
  const { t } = useLanguage();
  return (
    <View style={s.emptyWrap}>
      <Feather name="target" size={36} color="rgba(0,0,0,0.12)" />
      {showHint && (
        <Text style={s.emptyHint}>{t("intent_what")}</Text>
      )}
      <TouchableOpacity style={s.emptyBtn} onPress={onNew} activeOpacity={0.8}>
        <Feather name="plus" size={16} color="#fff" />
        <Text style={s.emptyBtnTxt}>{t("intent_new_btn")}</Text>
      </TouchableOpacity>
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: "#F5F3EF" },
  scroll:         { flex: 1 },
  sectionLabel:   { fontSize: 10, fontWeight: "700", color: "#555", letterSpacing: 1.2, marginHorizontal: 16, marginTop: 16, marginBottom: 6 },
  fab:            { position: "absolute", bottom: 20, alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#6ee7b7", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30, shadowColor: "#000", shadowOpacity: 0.15, shadowRadius: 12, elevation: 6 },
  fabTxt:         { fontSize: 14, fontWeight: "800", color: "#000" },
  pickHeader:     { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  pickTitle:      { fontSize: 20, fontWeight: "800", color: "#111" },
  pickSub:        { fontSize: 13, color: "#555", marginTop: 4 },
  pickGrid:       { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  pickCard:       { width: "47%", backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  pickCardIcon:   { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  pickCardLabel:  { fontSize: 14, fontWeight: "700", color: "#111" },
  pickCardDesc:   { fontSize: 11, color: "#555", lineHeight: 16 },
  navRow:         { flexDirection: "row", padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" },
  btnSecondary:   { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: "center", backgroundColor: "#f3f4f6", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  btnSecondaryTxt:{ fontSize: 14, fontWeight: "600", color: "#555" },
  btnPrimary:     { flex: 2, flexDirection: "row", paddingVertical: 12, borderRadius: 12, alignItems: "center", justifyContent: "center", gap: 6 },
  btnPrimaryTxt:  { fontSize: 14, fontWeight: "700", color: "#000" },
  intentHero:     { flexDirection: "row", alignItems: "center", gap: 12, margin: 16, padding: 14, borderRadius: 14, backgroundColor: "#fff", borderWidth: 1 },
  intentIconCircle:{ width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  intentHeroText: { flex: 1 },
  intentLabel:    { fontSize: 16, fontWeight: "800", color: "#111" },
  intentDesc:     { fontSize: 12, color: "#555", marginTop: 2 },
  alcanceRow:     { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  alcanceBtn:     { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  alcanceBtnTxt:  { fontSize: 13, fontWeight: "600", color: "#555" },
  tipoRow:        { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  tipoPill:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  tipoPillTxt:    { fontSize: 12, fontWeight: "600", color: "#555" },
  priorityRow:    { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  priorityBtn:    { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  priorityDot:    { width: 8, height: 8, borderRadius: 4 },
  priorityTxt:    { fontSize: 12, fontWeight: "600", color: "#555" },
  desplRow:       { flexDirection: "row", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  desplBtn:       { flex: 1, flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  desplTxt:       { fontSize: 12, fontWeight: "600", color: "#555" },
  configToggle:   { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginVertical: 12, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  configToggleTxt:{ flex: 1, fontSize: 13, fontWeight: "600", color: "#555" },
  durationRow:    { flexDirection: "row", flexWrap: "wrap", gap: 8, marginHorizontal: 16, marginBottom: 8 },
  durationBtn:    { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)" },
  durationTxt:    { fontSize: 13, fontWeight: "600", color: "#555" },
  numRow:         { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginBottom: 8 },
  numBox:         { flexDirection: "row", alignItems: "center", backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 4, flexShrink: 0 },
  numInput:       { color: "#111827", fontSize: 18, fontWeight: "600", minWidth: 36, textAlign: "center" },
  numUnit:        { color: "#6B7280", fontSize: 13 },
  horarioRow:     { flexDirection: "row", alignItems: "flex-start", gap: 12, marginHorizontal: 16, marginBottom: 8 },
  horarioField:   { flex: 1 },
  horarioLabel:   { fontSize: 11, fontWeight: "600", color: "#555", marginBottom: 6 },
  horarioInput:   { backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: "#111", fontSize: 16, fontWeight: "600" },
  frecRow:        { marginHorizontal: 16, marginBottom: 8 },
  frecPill:       { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", marginRight: 6 },
  frecPillTxt:    { fontSize: 12, fontWeight: "600", color: "#555" },
  textField:      { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, color: "#111", fontSize: 14 },
  card:           { marginHorizontal: 16, marginBottom: 8, backgroundColor: "#fff", borderRadius: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)", borderLeftWidth: 3 },
  cardPaused:     { opacity: 0.6 },
  cardHeader:     { flexDirection: "row", alignItems: "center", padding: 14, gap: 10 },
  cardIconBox:    { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardMain:       { flex: 1 },
  cardLabel:      { fontSize: 14, fontWeight: "700", color: "#111" },
  cardMeta:       { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 3 },
  prioDot:        { width: 6, height: 6, borderRadius: 3 },
  cardMetaTxt:    { fontSize: 11, color: "#555" },
  cardMetaDot:    { fontSize: 11, color: "#9ca3af" },
  cardActions:    { flexDirection: "row", alignItems: "center", gap: 8 },
  cardActionBtn:  { padding: 4 },
  cardDetail:     { paddingHorizontal: 14, paddingBottom: 12 },
  cardDetailTxt:  { fontSize: 12, color: "#555", lineHeight: 18 },
  emptyWrap:      { alignItems: "center", paddingTop: 60, gap: 16 },
  emptyHint:      { fontSize: 16, fontWeight: "600", color: "#9ca3af", textAlign: "center" },
  emptyBtn:       { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#4A80BD", paddingHorizontal: 20, paddingVertical: 12, borderRadius: 30 },
  emptyBtnTxt:    { fontSize: 14, fontWeight: "700", color: "#fff" },
});
