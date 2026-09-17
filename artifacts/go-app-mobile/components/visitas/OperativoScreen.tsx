import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  actualizarEstado,
  deleteVisita,
  formatFechaVisita,
  getAccionesDisponibles,
  isToday,
  isFuture,
  loadVisitas,
  marcarEmailEnviado,
  ACCION_COLOR,
  ESTADO_VISITA_COLOR,
  ESTADO_VISITA_ICON,
  type AccionVisita,
  type EstadoVisita,
  type MotivoCancel,
  type VisitaConfirmada,
} from "@/data/visitas";
import { loadContactos, type Contacto } from "@/data/contactos";
import { syncVisitaToGoLog, removeVisitaFromGoLog } from "@/lib/goLogBridge";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

type Pestaña = "hoy" | "proximas" | "historial";
type FiltroEstado = "todos" | EstadoVisita;

interface Props {
  onBack: () => void;
  onIrAgenda?: () => void;
  guidanceLevel?: number;
}

export function OperativoScreen({ onBack, onIrAgenda, guidanceLevel = 5 }: Props) {
  const { lang, t } = useLanguage();
  const [pestaña, setPestaña] = useState<Pestaña>("proximas");
  const [visitas, setVisitas] = useState<VisitaConfirmada[]>([]);
  const [contactos, setContactos] = useState<Map<string, Contacto>>(new Map());
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const ESTADO_LABEL = useMemo<Record<EstadoVisita, string>>(() => ({
    pendiente_confirmacion: t("estado_pendiente_conf"),
    confirmado:             t("estado_confirmado_v"),
    en_ruta:                t("estado_en_ruta"),
    realizado:              t("estado_realizado"),
    retrasado:              t("estado_retrasado"),
    cancelado:              t("estado_cancelado_v"),
    reprogramado:           t("estado_reprogramado"),
  }), [t]);

  const ACCION_LABEL = useMemo<Record<AccionVisita, string>>(() => ({
    enviar_confirmacion: t("accion_enviar_conf"),
    confirmar:           t("accion_confirmar"),
    iniciar_ruta:        t("accion_iniciar_ruta"),
    marcar_realizado:    t("accion_marcar_realizado"),
    marcar_retrasado:    t("accion_marcar_retrasado"),
    cancelar:            t("accion_cancelar_visita"),
    reprogramar:         t("accion_reprogramar"),
  }), [t]);

  const MOTIVO_LABEL = useMemo<Record<string, string>>(() => ({
    cliente_cancela: t("motivo_cliente_cancela"),
    cambio_fecha:    t("motivo_cambio_fecha"),
    incidencia:      t("motivo_incidencia"),
    otro:            t("motivo_otro"),
  }), [t]);

  const load = useCallback(async () => {
    const [vs, cs] = await Promise.all([loadVisitas(), loadContactos()]);
    setVisitas(vs);
    setContactos(new Map(cs.map((c) => [c.id, c])));
  }, []);

  useEffect(() => { load(); }, [load]);

  const hoy = new Date().toISOString().split("T")[0];

  const visitasHoy = useMemo(
    () => visitas.filter((v) => v.fecha === hoy && v.estado !== "cancelado"),
    [visitas, hoy]
  );
  const visitasProximas = useMemo(
    () =>
      visitas
        .filter((v) => v.fecha > hoy && v.estado !== "realizado")
        .sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    [visitas, hoy]
  );
  const visitasHistorial = useMemo(
    () =>
      visitas
        .filter((v) => v.estado === "realizado" || v.estado === "cancelado" || v.fecha < hoy)
        .sort((a, b) => (a.fecha < b.fecha ? 1 : -1)),
    [visitas, hoy]
  );

  const visitasActivas =
    pestaña === "hoy"      ? visitasHoy
    : pestaña === "proximas" ? visitasProximas
    : visitasHistorial;

  const visitasFiltradas = filtro === "todos"
    ? visitasActivas
    : visitasActivas.filter((v) => v.estado === filtro);

  const stats = useMemo(() => ({
    hoy:        visitasHoy.length,
    confirmadas: visitas.filter((v) => v.estado === "confirmado").length,
    en_ruta:    visitas.filter((v) => v.estado === "en_ruta").length,
    realizadas: visitas.filter((v) => v.estado === "realizado").length,
    pendientes: visitas.filter((v) => v.estado === "pendiente_confirmacion").length,
    canceladas: visitas.filter((v) => v.estado === "cancelado").length,
  }), [visitas]);

  const handleAccion = async (visita: VisitaConfirmada, accion: AccionVisita) => {
    const c = contactos.get(visita.contactoId);

    switch (accion) {
      case "enviar_confirmacion": {
        if (!c?.email) {
          Alert.alert(t("alert_no_email_title"), t("alert_no_email_msg"));
          return;
        }
        const fechaStr = formatFechaVisita(visita.fecha);
        const asunto = encodeURIComponent(
          lang === "en"
            ? `Visit confirmation — ${fechaStr}`
            : `Confirmación de visita — ${fechaStr}`
        );
        const cuerpo = lang === "en"
          ? encodeURIComponent(
              `Dear ${c.responsable || c.empresa},\n\n` +
              `We confirm your scheduled visit for ${fechaStr} at ${visita.hora}` +
              `${visita.duracionMin ? ` (estimated duration: ${visita.duracionMin} min)` : ""}.` +
              `${c.direccion ? `\n\nAddress: ${c.direccion}, ${c.ciudad}.` : ""}` +
              `${visita.asignado ? `\n\nYour contact: ${visita.asignado}.` : ""}` +
              `\n\nDo not hesitate to contact us.\n\nBest regards.`
            )
          : encodeURIComponent(
              `Estimado/a ${c.responsable || c.empresa},\n\n` +
              `Le confirmamos su visita programada para el ${fechaStr} a las ${visita.hora}` +
              `${visita.duracionMin ? ` (duración estimada: ${visita.duracionMin} min)` : ""}.` +
              `${c.direccion ? `\n\nDirección: ${c.direccion}, ${c.ciudad}.` : ""}` +
              `${visita.asignado ? `\n\nAtenderá: ${visita.asignado}.` : ""}` +
              `\n\nQuedo a su disposición para cualquier consulta.\n\nUn saludo.`
            );
        await Linking.openURL(`mailto:${c.email}?subject=${asunto}&body=${cuerpo}`);
        await marcarEmailEnviado(visita.id);
        await actualizarEstado(visita.id, "confirmado");
        if (c) {
          const updated = { ...visita, estado: "confirmado" as EstadoVisita, emailConfirmacionEnviado: true };
          await syncVisitaToGoLog(updated, c);
        }
        await load();
        break;
      }

      case "confirmar": {
        await actualizarEstado(visita.id, "confirmado");
        if (c) await syncVisitaToGoLog({ ...visita, estado: "confirmado" }, c);
        await load();
        break;
      }

      case "iniciar_ruta": {
        await actualizarEstado(visita.id, "en_ruta");
        if (c) await syncVisitaToGoLog({ ...visita, estado: "en_ruta" }, c);
        if (c?.direccion || c?.ciudad) {
          const addr = encodeURIComponent(`${c.direccion || ""} ${c.ciudad || ""}`.trim());
          Linking.openURL(`https://maps.google.com/?q=${addr}`).catch(() => {});
        }
        await load();
        break;
      }

      case "marcar_realizado": {
        await actualizarEstado(visita.id, "realizado");
        if (c) await syncVisitaToGoLog({ ...visita, estado: "realizado" }, c);
        await load();
        setExpandedId(null);
        break;
      }

      case "marcar_retrasado": {
        await actualizarEstado(visita.id, "retrasado");
        if (c) await syncVisitaToGoLog({ ...visita, estado: "retrasado" }, c);
        await load();
        break;
      }

      case "cancelar": {
        const contactName = c?.empresa || c?.responsable || t("this_contact");
        Alert.alert(
          t("alert_cancel_visit_title"),
          lang === "en"
            ? `Cancel the visit with ${contactName}?`
            : `¿Cancelar la visita con ${contactName}?`,
          [
            { text: t("cancel"), style: "cancel" },
            {
              text: t("accion_cancelar_visita"),
              style: "destructive",
              onPress: async () => {
                await actualizarEstado(visita.id, "cancelado", { motivoCancelacion: "cliente_cancela" });
                if (visita.goLogId) await removeVisitaFromGoLog(visita.goLogId);
                await load();
                Alert.alert(
                  t("alert_visit_cancelled_title"),
                  t("alert_visit_cancelled_msg"),
                  [
                    { text: t("alert_not_now") },
                    { text: t("alert_recalculate"), onPress: () => onIrAgenda?.() },
                  ]
                );
              },
            },
          ]
        );
        break;
      }

      case "reprogramar": {
        await actualizarEstado(visita.id, "reprogramado");
        await load();
        Alert.alert(
          t("alert_rescheduled_title"),
          t("alert_rescheduled_msg"),
          [
            { text: t("close") },
            { text: t("alert_go_to_schedule"), onPress: () => onIrAgenda?.() },
          ]
        );
        break;
      }
    }
  };

  return (
    <View style={s.root}>
      {/* ── STATS BAR ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.statsScroll}
        contentContainerStyle={{ paddingHorizontal: 12, gap: 6, paddingVertical: 8 }}
      >
        <StatPill icon="sun"          label={t("status_today")}       value={stats.hoy}         color="#f59e0b" onPress={() => setPestaña("hoy")} />
        <StatPill icon="clock"        label={t("stat_pendientes")}    value={stats.pendientes}   color="#6b7280" onPress={() => { setPestaña("proximas"); setFiltro("pendiente_confirmacion"); }} />
        <StatPill icon="check-circle" label={t("stat_confirmadas")}   value={stats.confirmadas}  color="#3b82f6" onPress={() => { setPestaña("proximas"); setFiltro("confirmado"); }} />
        <StatPill icon="navigation"   label={t("stat_en_ruta_label")} value={stats.en_ruta}      color="#6ee7b7" onPress={() => { setPestaña("hoy"); setFiltro("en_ruta"); }} />
        <StatPill icon="check-square" label={t("stat_realizadas")}    value={stats.realizadas}   color="#6ee7b7" onPress={() => { setPestaña("historial"); setFiltro("realizado"); }} />
        <StatPill icon="x-circle"     label={t("stat_canceladas")}    value={stats.canceladas}   color="#ef4444" onPress={() => { setPestaña("historial"); setFiltro("cancelado"); }} />
      </ScrollView>

      {/* ── TODAY BANNER ── */}
      {visitasHoy.length > 0 && pestaña !== "hoy" && (
        <TouchableOpacity style={s.todayBanner} onPress={() => { setPestaña("hoy"); setFiltro("todos"); }}>
          <View style={s.todayDot} />
          <Text style={s.todayBannerTxt}>
            {visitasHoy.length} {visitasHoy.length !== 1 ? t("visits_today_suffix_plural") : t("visits_today_suffix")}
          </Text>
          <Feather name="arrow-right" size={12} color="#f59e0b" />
        </TouchableOpacity>
      )}

      {/* ── TABS ── */}
      <View style={s.tabs}>
        {(["hoy", "proximas", "historial"] as Pestaña[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, pestaña === tab && s.tabActive]}
            onPress={() => { setPestaña(tab); setFiltro("todos"); }}
          >
            <Text style={[s.tabTxt, pestaña === tab && s.tabTxtActive]}>
              {tab === "hoy"
                ? `${t("status_today")}${visitasHoy.length ? ` (${visitasHoy.length})` : ""}`
                : tab === "proximas"
                  ? t("tab_proximas")
                  : t("tab_historial")}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ── FILTER STRIP ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterScroll} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
        {(["todos", "pendiente_confirmacion", "confirmado", "en_ruta", "retrasado", "cancelado", "reprogramado"] as FiltroEstado[]).map((f) => {
          const label = f === "todos" ? t("filter_todos") : ESTADO_LABEL[f as EstadoVisita];
          const color = f === "todos" ? "#555" : ESTADO_VISITA_COLOR[f as EstadoVisita];
          const active = filtro === f;
          return (
            <TouchableOpacity
              key={f}
              style={[s.filterPill, active && { backgroundColor: color + "22", borderColor: color + "55" }]}
              onPress={() => setFiltro(f)}
            >
              <Text style={[s.filterTxt, active && { color }]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── LIST ── */}
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
        {visitasFiltradas.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyLabel}>
              {filtro !== "todos"
                ? (lang === "en"
                    ? `No visits with status "${ESTADO_LABEL[filtro as EstadoVisita]}"`
                    : `Sin visitas en estado "${ESTADO_LABEL[filtro as EstadoVisita]}"`)
                : pestaña === "hoy"
                  ? t("empty_no_visits_today")
                  : pestaña === "proximas"
                    ? t("empty_no_upcoming")
                    : t("empty_no_history")}
            </Text>
          </View>
        ) : (
          groupByFecha(visitasFiltradas).map(({ fecha, items }) => (
            <View key={fecha}>
              <View style={s.fechaHeader}>
                <Text style={s.fechaHeaderTxt}>{formatFechaVisita(fecha)}</Text>
                {isToday(fecha) && (
                  <View style={s.hoyBadge}>
                    <Text style={s.hoyBadgeTxt}>{t("label_hoy_badge")}</Text>
                  </View>
                )}
              </View>
              {items.map((v) => (
                <VisitaCard
                  key={v.id}
                  visita={v}
                  contacto={contactos.get(v.contactoId)}
                  expanded={expandedId === v.id}
                  onToggle={() => setExpandedId(expandedId === v.id ? null : v.id)}
                  onAccion={(accion) => handleAccion(v, accion)}
                  estadoLabel={ESTADO_LABEL}
                  accionLabel={ACCION_LABEL}
                  motivoLabel={MOTIVO_LABEL}
                />
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

// ── VisitaCard ─────────────────────────────────────────────────────────

function VisitaCard({
  visita,
  contacto,
  expanded,
  onToggle,
  onAccion,
  estadoLabel,
  accionLabel,
  motivoLabel,
}: {
  visita: VisitaConfirmada;
  contacto: Contacto | undefined;
  expanded: boolean;
  onToggle: () => void;
  onAccion: (a: AccionVisita) => void;
  estadoLabel: Record<EstadoVisita, string>;
  accionLabel: Record<AccionVisita, string>;
  motivoLabel: Record<string, string>;
}) {
  const { t } = useLanguage();
  const estadoColor = ESTADO_VISITA_COLOR[visita.estado];
  const estadoIcon  = ESTADO_VISITA_ICON[visita.estado];
  const acciones    = getAccionesDisponibles(visita.estado);

  return (
    <View style={[s.card, { borderLeftColor: estadoColor }]}>
      <TouchableOpacity style={s.cardHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={s.cardTimeWrap}>
          <Text style={[s.cardHora, { color: estadoColor }]}>{visita.hora}</Text>
          <Text style={s.cardDur}>{visita.duracionMin}m</Text>
        </View>

        <View style={s.cardInfo}>
          <Text style={s.cardEmpresa} numberOfLines={1}>
            {contacto?.empresa || contacto?.responsable || visita.contactoId}
          </Text>
          <View style={s.cardMeta}>
            {contacto?.ciudad ? (
              <View style={s.cardMetaItem}>
                <Feather name="map-pin" size={9} color="#555" />
                <Text style={s.cardMetaTxt}>{contacto.ciudad}</Text>
              </View>
            ) : null}
            {visita.asignado ? (
              <View style={s.cardMetaItem}>
                <Feather name="user" size={9} color="#3b82f6" />
                <Text style={[s.cardMetaTxt, { color: "#3b82f6" }]}>{visita.asignado}</Text>
              </View>
            ) : null}
            {visita.emailConfirmacionEnviado && (
              <View style={s.cardMetaItem}>
                <Feather name="mail" size={9} color="#6ee7b7" />
                <Text style={[s.cardMetaTxt, { color: "#6ee7b7" }]}>
                  {t("label_email_sent")}
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={[s.estadoBadge, { backgroundColor: estadoColor + "22", borderColor: estadoColor + "44" }]}>
          <Feather name={estadoIcon as any} size={10} color={estadoColor} />
          <Text style={[s.estadoBadgeTxt, { color: estadoColor }]}>
            {estadoLabel[visita.estado]}
          </Text>
        </View>

        <Feather name={expanded ? "chevron-up" : "chevron-down"} size={13} color="#444" style={{ marginLeft: 4 }} />
      </TouchableOpacity>

      {expanded && (
        <View style={s.cardExpanded}>
          {(contacto?.direccion || contacto?.telefono || contacto?.email) && (
            <View style={s.contactInfo}>
              {contacto.direccion ? (
                <View style={s.contactInfoRow}>
                  <Feather name="map-pin" size={11} color="#555" />
                  <Text style={s.contactInfoTxt}>{contacto.direccion}, {contacto.ciudad}</Text>
                </View>
              ) : null}
              {contacto.telefono ? (
                <TouchableOpacity
                  style={s.contactInfoRow}
                  onPress={() => Linking.openURL(`tel:${contacto.telefono}`).catch(() => {})}
                >
                  <Feather name="phone" size={11} color="#3b82f6" />
                  <Text style={[s.contactInfoTxt, { color: "#3b82f6" }]}>{contacto.telefono}</Text>
                </TouchableOpacity>
              ) : null}
              {contacto.email ? (
                <View style={s.contactInfoRow}>
                  <Feather name="mail" size={11} color="#555" />
                  <Text style={s.contactInfoTxt}>{contacto.email}</Text>
                </View>
              ) : null}
            </View>
          )}

          {acciones.length > 0 && (
            <View style={s.accionesGrid}>
              {acciones.map((accion) => (
                <TouchableOpacity
                  key={accion}
                  style={[s.accionBtn, { backgroundColor: ACCION_COLOR[accion] + "22", borderColor: ACCION_COLOR[accion] + "44" }]}
                  onPress={() => onAccion(accion)}
                >
                  <Feather name={accionIcon(accion)} size={12} color={ACCION_COLOR[accion]} />
                  <Text style={[s.accionBtnTxt, { color: ACCION_COLOR[accion] }]}>
                    {accionLabel[accion]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {visita.estado === "realizado" && (
            <View style={s.realizadoBox}>
              <Feather name="check-square" size={14} color="#6ee7b7" />
              <Text style={s.realizadoTxt}>{t("label_visit_completed")}</Text>
            </View>
          )}
          {visita.estado === "cancelado" && (
            <View style={s.canceladoBox}>
              <Text style={s.canceladoTxt}>
                {t("label_visit_cancelled_tag")} · {visita.motivoCancelacion ? motivoLabel[visita.motivoCancelacion] : ""}
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────

function StatPill({
  icon, label, value, color, onPress
}: {
  icon: string; label: string; value: number; color: string; onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[s.statPill, { backgroundColor: color + "18", borderColor: color + "33" }]}
      onPress={onPress}
    >
      <Feather name={icon as any} size={11} color={color} />
      <Text style={[s.statPillVal, { color }]}>{value}</Text>
      <Text style={s.statPillLbl}>{label}</Text>
    </TouchableOpacity>
  );
}

function groupByFecha(visitas: VisitaConfirmada[]): { fecha: string; items: VisitaConfirmada[] }[] {
  const map = new Map<string, VisitaConfirmada[]>();
  for (const v of visitas) {
    if (!map.has(v.fecha)) map.set(v.fecha, []);
    map.get(v.fecha)!.push(v);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([fecha, items]) => ({
      fecha,
      items: items.sort((a, b) => (a.hora < b.hora ? -1 : 1)),
    }));
}

function accionIcon(accion: AccionVisita): any {
  const map: Record<AccionVisita, string> = {
    enviar_confirmacion: "mail",
    confirmar:           "check-circle",
    iniciar_ruta:        "navigation",
    marcar_realizado:    "check-square",
    marcar_retrasado:    "clock",
    cancelar:            "x-circle",
    reprogramar:         "refresh-cw",
  };
  return map[accion] ?? "circle";
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: "#F5F3EF" },
  statsScroll:    { flexShrink: 0 },
  statPill:       { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  statPillVal:    { fontSize: 14, fontWeight: "800" },
  statPillLbl:    { fontSize: 10, color: "#555", fontWeight: "500" },
  todayBanner:    { flexDirection: "row", alignItems: "center", gap: 6, marginHorizontal: 12, marginBottom: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "#f59e0b18", borderWidth: 1, borderColor: "#f59e0b33" },
  todayDot:       { width: 6, height: 6, borderRadius: 3, backgroundColor: "#f59e0b" },
  todayBannerTxt: { flex: 1, color: "#f59e0b", fontSize: 12, fontWeight: "700" },
  tabs:           { flexDirection: "row", marginHorizontal: 12, marginBottom: 6, borderRadius: 10, overflow: "hidden", backgroundColor: "#e5e7eb" },
  tab:            { flex: 1, paddingVertical: 7, alignItems: "center" },
  tabActive:      { backgroundColor: "#fff" },
  tabTxt:         { fontSize: 11, color: "#555", fontWeight: "600" },
  tabTxtActive:   { color: "#111" },
  filterScroll:   { flexShrink: 0, marginBottom: 6 },
  filterPill:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", backgroundColor: "#fff" },
  filterTxt:      { fontSize: 11, color: "#555", fontWeight: "500" },
  scroll:         { flex: 1 },
  empty:          { alignItems: "center", paddingTop: 40 },
  emptyLabel:     { color: "#9ca3af", fontSize: 13, textAlign: "center" },
  fechaHeader:    { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 12, marginTop: 10, marginBottom: 4 },
  fechaHeaderTxt: { fontSize: 11, color: "#555", fontWeight: "700", letterSpacing: 0.5 },
  hoyBadge:       { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6, backgroundColor: "#f59e0b" },
  hoyBadgeTxt:    { fontSize: 9, color: "#fff", fontWeight: "800" },
  card:           { marginHorizontal: 12, marginBottom: 6, backgroundColor: "#fff", borderRadius: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)", borderLeftWidth: 3, overflow: "hidden" },
  cardHeader:     { flexDirection: "row", alignItems: "center", padding: 12, gap: 10 },
  cardTimeWrap:   { alignItems: "center", minWidth: 36 },
  cardHora:       { fontSize: 14, fontWeight: "800" },
  cardDur:        { fontSize: 9, color: "#9ca3af" },
  cardInfo:       { flex: 1 },
  cardEmpresa:    { fontSize: 13, fontWeight: "700", color: "#111" },
  cardMeta:       { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 2 },
  cardMetaItem:   { flexDirection: "row", alignItems: "center", gap: 3 },
  cardMetaTxt:    { fontSize: 10, color: "#555" },
  estadoBadge:    { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
  estadoBadgeTxt: { fontSize: 9, fontWeight: "700" },
  cardExpanded:   { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  contactInfo:    { gap: 4, backgroundColor: "#f9fafb", borderRadius: 8, padding: 10 },
  contactInfoRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  contactInfoTxt: { fontSize: 12, color: "#374151" },
  accionesGrid:   { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  accionBtn:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  accionBtnTxt:   { fontSize: 11, fontWeight: "600" },
  realizadoBox:   { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#6ee7b718", borderRadius: 8, padding: 8 },
  realizadoTxt:   { fontSize: 12, color: "#6ee7b7", fontWeight: "600" },
  canceladoBox:   { backgroundColor: "#ef444418", borderRadius: 8, padding: 8 },
  canceladoTxt:   { fontSize: 12, color: "#ef4444" },
});
