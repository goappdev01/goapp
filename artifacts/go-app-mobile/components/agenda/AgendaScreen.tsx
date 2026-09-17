import React, { useCallback, useEffect, useRef, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  optimizarRuta,
  DEFAULT_PARAMS,
  eficienciaColor,
  eficienciaLabel,
  formatKm,
  formatMinutos,
  DESPLAZAMIENTO_COLOR,
  type CandidatoVisita,
  type DiaRuta,
  type OptimizerParams,
  type ResultadoOptimizacion,
  type VisitaRuta,
  type TipoDesplazamiento,
} from "@/lib/optimizador";
import { loadInterpretaciones } from "@/data/interpretaciones";
import { loadSolicitudes, type SolicitudDisponibilidad } from "@/data/disponibilidad";
import { loadContactos, type Contacto } from "@/data/contactos";
import { loadIntenciones } from "@/data/intenciones";
import {
  confirmarAgenda,
  guardarAgenda,
  loadAgendas,
  type AgendaGuardada,
} from "@/data/agenda";
import { crearVisita } from "@/data/visitas";
import { syncAllVisitasToGoLog } from "@/lib/goLogBridge";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

const DESPLAZAMIENTO_LABEL_EN: Record<TipoDesplazamiento, string> = {
  mismo_lugar:  "Same location",
  misma_ciudad: "Same city",
  provincia:    "Same province",
  otro:         "Other zone",
};
const DESPLAZAMIENTO_LABEL_ES: Record<TipoDesplazamiento, string> = {
  mismo_lugar:  "Mismo lugar",
  misma_ciudad: "Misma ciudad",
  provincia:    "Misma provincia",
  otro:         "Otra zona",
};

type Pestaña = "ruta" | "zonas" | "historial";

interface Props {
  onBack: () => void;
  guidanceLevel?: number;
}

export function AgendaScreen({ onBack, guidanceLevel = 5 }: Props) {
  const { lang, t } = useLanguage();
  const [pestaña, setPestaña] = useState<Pestaña>("ruta");
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<ResultadoOptimizacion | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);
  const [agendaGuardadaId, setAgendaGuardadaId] = useState<string | null>(null);
  const [agendas, setAgendas] = useState<AgendaGuardada[]>([]);
  const [params, setParams] = useState<OptimizerParams>(DEFAULT_PARAMS);
  const [candidatos, setCandidatos] = useState<CandidatoVisita[]>([]);
  const [contactoMap, setContactoMap] = useState<Map<string, Contacto>>(new Map());
  const [expandedDia, setExpandedDia] = useState<string | null>(null);
  const spinAnim = useRef(new Animated.Value(0)).current;

  const DESPLAZAMIENTO_LABEL = lang === "en" ? DESPLAZAMIENTO_LABEL_EN : DESPLAZAMIENTO_LABEL_ES;
  const locale = lang === "en" ? "en-GB" : "es-ES";

  const startSpin = () => {
    spinAnim.setValue(0);
    Animated.loop(
      Animated.timing(spinAnim, { toValue: 1, duration: 900, useNativeDriver: false })
    ).start();
  };
  const stopSpin = () => spinAnim.stopAnimation();

  const buildCandidatos = useCallback(async (): Promise<CandidatoVisita[]> => {
    const [interpretaciones, solicitudes, contactos, intenciones] = await Promise.all([
      loadInterpretaciones(),
      loadSolicitudes(),
      loadContactos(),
      loadIntenciones(),
    ]);

    const cMap = new Map(contactos.map((c) => [c.id, c]));
    setContactoMap(cMap);

    const solicitudMap = new Map(solicitudes.map((s) => [s.id, s]));
    const confirmed = interpretaciones.filter((i) => i.confirmadoPorUsuario);
    const candidates: CandidatoVisita[] = [];

    for (const interp of confirmed) {
      const contacto = cMap.get(interp.contactoId);
      if (!contacto) continue;

      const solicitud = solicitudMap.get(interp.solicitudId);
      if (!solicitud) continue;

      const slotIds = interp.slotsAceptadosManual ?? interp.parseResult.slotsAceptados;
      const slotsCompatibles = solicitud.slots.filter((s) => slotIds.includes(s.id));
      if (slotsCompatibles.length === 0) continue;

      let duracionMin = 45;
      if (contacto.duracionVisita) {
        const parsed = parseInt(contacto.duracionVisita, 10);
        if (!isNaN(parsed)) duracionMin = parsed;
      } else if (solicitud.intencionId) {
        const int = intenciones.find((i) => i.id === solicitud.intencionId);
        if (int?.duracionMin) duracionMin = int.duracionMin;
      }

      const urgente = interp.parseResult.urgente;
      const necesitaLlamada = interp.parseResult.necesitaLlamada;
      const asignado = contacto.tecnicoAsignado || contacto.comercialAsignado || "";
      const prioridad = urgente ? 3 : 2;

      const existing = candidates.find((c) => c.contactoId === interp.contactoId);
      if (existing) {
        const existingIds = new Set(existing.slotsCompatibles.map((s) => s.id));
        for (const s of slotsCompatibles) {
          if (!existingIds.has(s.id)) existing.slotsCompatibles.push(s);
        }
      } else {
        candidates.push({
          contactoId: interp.contactoId,
          contacto,
          slotsCompatibles,
          duracionMin,
          prioridad,
          urgente,
          necesitaLlamada,
          asignado,
        });
      }
    }

    return candidates;
  }, []);

  const runOptimizer = useCallback(async (p?: OptimizerParams) => {
    setLoading(true);
    startSpin();
    try {
      const cands = await buildCandidatos();
      setCandidatos(cands);
      await new Promise((r) => setTimeout(r, 600));
      const result = optimizarRuta(cands, p ?? params);
      setResultado(result);
      setAgendaGuardadaId(null);
      if (result.dias.length > 0) setExpandedDia(result.dias[0].fecha);
    } finally {
      setLoading(false);
      stopSpin();
    }
  }, [buildCandidatos, params]);

  const loadHistorial = useCallback(async () => {
    const ags = await loadAgendas();
    setAgendas(ags.filter((a) => a.estado !== "archivada"));
  }, []);

  useEffect(() => { loadHistorial(); }, [loadHistorial]);

  const handleGuardarYConfirmar = async () => {
    if (!resultado) return;
    Alert.alert(
      t('confirm_schedule_title'),
      t('confirm_schedule_body')
        .replace('__N__', String(resultado.totalVisitas))
        .replace('__D__', String(resultado.dias.length)),
      [
        { text: t('cancel'), style: "cancel" },
        {
          text: t('confirm'),
          onPress: async () => {
            const saved = await guardarAgenda({
              nombre: `${t('schedule_label_noun')} ${new Date().toLocaleDateString(locale)}`,
              estado: "confirmada",
              resultado,
              solicitudIds: [],
              confirmadaEn: new Date().toISOString(),
            });

            const visitasCreadas = await Promise.all(
              resultado.dias.flatMap((dia) =>
                dia.visitas.map((v) =>
                  crearVisita({
                    contactoId: v.contactoId,
                    fecha: v.slot.fecha,
                    hora: v.slot.hora,
                    diaSemana: v.slot.diaSemana,
                    duracionMin: v.duracionMin,
                    asignado: v.asignado,
                    estado: "pendiente_confirmacion",
                    slotId: v.slot.id,
                    solicitudId: "",
                    agendaId: saved.id,
                    emailConfirmacionEnviado: false,
                    recordatorioActivado: false,
                    notas: "",
                    motivoCancelacion: null,
                    goLogId: null,
                  })
                )
              )
            );

            const cMap = contactoMap;
            const goLogIds = await syncAllVisitasToGoLog(visitasCreadas, cMap);

            setAgendaGuardadaId(saved.id);
            await loadHistorial();
            Alert.alert(
              t('confirm_schedule_saved'),
              t('confirm_schedule_saved_body').replace('__N__', String(visitasCreadas.length))
            );
          },
        },
      ]
    );
  };

  const toggleMaxVisitas = (delta: number) => {
    const next = Math.max(1, Math.min(12, params.maxVisitasPorDia + delta));
    const p = { ...params, maxVisitasPorDia: next };
    setParams(p);
    if (resultado) runOptimizer(p);
  };

  const spinDeg = spinAnim.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "360deg"] });

  // ── LOADING ───────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={s.loadingWrap}>
        <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
          <Feather name="cpu" size={42} color="#6ee7b7" />
        </Animated.View>
        <Text style={s.loadingTitle}>
          {t('optimising_routes')}
        </Text>
        {guidanceCfg.hintMaxCount > 0 && (
          <Text style={s.loadingSub}>
            {t('optimising_routes_sub')}
          </Text>
        )}
        {guidanceCfg.hintMaxCount > 0 && (
          <View style={s.loadingSteps}>
            {[t('loading_step_1'), t('loading_step_2'), t('loading_step_3'), t('loading_step_4')].map((step) => (
              <View key={step} style={s.loadingStep}>
                <ActivityIndicator size="small" color="#6ee7b744" />
                <Text style={s.loadingStepTxt}>{step}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  // ── MAIN ───────────────────────────────────────────────────────────────
  const r = resultado;
  const eColor = r ? eficienciaColor(r.eficienciaGlobal) : "#6ee7b7";

  return (
    <View style={s.root}>
      {/* ── GENERATE / RECALCULATE BUTTON — always at top ── */}
      {!r ? (
        <TouchableOpacity style={s.btnGenerar} onPress={() => runOptimizer()}>
          <Feather name="cpu" size={15} color="#000" />
          <Text style={s.btnGenerarTxt}>
            {t('generate_schedule')}
          </Text>
        </TouchableOpacity>
      ) : (
        <>
          {/* ── SUMMARY STRIP ── */}
          <View style={s.summaryStrip}>
            <View style={[s.effBadge, { backgroundColor: eColor + "22", borderColor: eColor + "44" }]}>
              <Text style={[s.effPct, { color: eColor }]}>{r.eficienciaGlobal}%</Text>
              <Text style={[s.effLabel, { color: eColor }]}>{eficienciaLabel(r.eficienciaGlobal)}</Text>
            </View>
            <MetricPill icon="map-pin"  value={formatKm(r.totalKm)}           label={t('metric_estimated')}    />
            <MetricPill icon="calendar" value={`${r.dias.length}d`}            label={t('metric_days_short')}   />
            <MetricPill icon="users"    value={`${r.totalVisitas}v`}           label={t('metric_visits_short')} />
            <MetricPill icon="clock"    value={formatMinutos(r.totalMinViaje)} label={t('metric_travel')}       />
            <TouchableOpacity style={s.regenBtn} onPress={() => runOptimizer()}>
              <Feather name="refresh-cw" size={13} color="#555" />
            </TouchableOpacity>
          </View>

          {/* ── PARAMS BAR ── */}
          <View style={s.paramsBar}>
            <Text style={s.paramsLabel}>
              {t('visits_per_day')}
            </Text>
            <TouchableOpacity style={s.paramsBtn} onPress={() => toggleMaxVisitas(-1)}>
              <Feather name="minus" size={12} color="#888" />
            </TouchableOpacity>
            <Text style={s.paramsVal}>{params.maxVisitasPorDia}</Text>
            <TouchableOpacity style={s.paramsBtn} onPress={() => toggleMaxVisitas(1)}>
              <Feather name="plus" size={12} color="#888" />
            </TouchableOpacity>
            <View style={s.paramsZoneSep} />
            <TouchableOpacity
              style={[s.paramsToggle, params.prioritizeZones && s.paramsToggleOn]}
              onPress={() => {
                const p = { ...params, prioritizeZones: !params.prioritizeZones };
                setParams(p);
                runOptimizer(p);
              }}
            >
              <Feather name="layers" size={11} color={params.prioritizeZones ? "#6ee7b7" : "#555"} />
              <Text style={[s.paramsToggleTxt, params.prioritizeZones && { color: "#6ee7b7" }]}>
                {t('prioritize_zones')}
              </Text>
            </TouchableOpacity>
            {r.sinAsignar.length > 0 && (
              <View style={s.sinAsignarBadge}>
                <Text style={s.sinAsignarTxt}>
                  {r.sinAsignar.length} {t('no_slot')}
                </Text>
              </View>
            )}
          </View>
        </>
      )}

      {/* ── TABS ── */}
      {r && (
        <>
          <View style={s.tabs}>
            {(["ruta", "zonas", "historial"] as Pestaña[]).map((tab) => (
              <TouchableOpacity key={tab} style={[s.tab, pestaña === tab && s.tabActive]} onPress={() => setPestaña(tab)}>
                <Text style={[s.tabTxt, pestaña === tab && s.tabTxtActive]}>
                  {tab === "ruta"
                    ? t('tab_daily_route')
                    : tab === "zonas"
                      ? t('tab_by_zone')
                      : t('tab_history')}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* ── RUTA TAB ── */}
          {pestaña === "ruta" && (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {r.dias.map((dia) => (
                <DiaCard
                  key={dia.fecha}
                  dia={dia}
                  contactoMap={contactoMap}
                  desplazamientoLabel={DESPLAZAMIENTO_LABEL}
                  expanded={expandedDia === dia.fecha}
                  onToggle={() => setExpandedDia(expandedDia === dia.fecha ? null : dia.fecha)}
                  visitasLabel={t('metric_visits_short')}
                />
              ))}
              {r.sinAsignar.length > 0 && (
                <View style={s.sinAsignarBox}>
                  <View style={s.sinAsignarHeader}>
                    <Feather name="alert-circle" size={14} color="#f59e0b" />
                    <Text style={s.sinAsignarTitle}>
                      {t('no_slot_available')} ({r.sinAsignar.length})
                    </Text>
                  </View>
                  {r.sinAsignar.map((c) => (
                    <View key={c.contactoId} style={s.sinAsignarRow}>
                      <Text style={s.sinAsignarEmpresa} numberOfLines={1}>
                        {c.contacto.empresa || c.contacto.responsable}
                      </Text>
                      <Text style={s.sinAsignarCiudad}>{c.contacto.ciudad}</Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>
          )}

          {/* ── ZONAS TAB ── */}
          {pestaña === "zonas" && (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              <ZonaView dias={r.dias} contactoMap={contactoMap} />
            </ScrollView>
          )}

          {/* ── HISTORIAL TAB ── */}
          {pestaña === "historial" && (
            <ScrollView style={s.scroll} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
              {agendas.length === 0 ? (
                <View style={s.empty}>
                  <Text style={s.emptyTitle}>
                    {t('no_confirmed_schedules')}
                  </Text>
                </View>
              ) : (
                agendas.map((ag) => (
                  <View key={ag.id} style={s.historialCard}>
                    <View style={s.historialTop}>
                      <Text style={s.historialNombre}>{ag.nombre}</Text>
                      <View style={[s.historialEstado, { backgroundColor: ag.estado === "confirmada" ? "#6ee7b722" : "#f59e0b22" }]}>
                        <Text style={[s.historialEstadoTxt, { color: ag.estado === "confirmada" ? "#6ee7b7" : "#f59e0b" }]}>
                          {ag.estado === "confirmada"
                            ? t('status_confirmed')
                            : t('status_draft')}
                        </Text>
                      </View>
                    </View>
                    <Text style={s.historialMeta}>
                      {ag.resultado.dias.length} {t('metric_days_short')} · {ag.resultado.totalVisitas} {t('metric_visits_short')} · {formatKm(ag.resultado.totalKm)}
                    </Text>
                    <Text style={s.historialFecha}>
                      {ag.confirmadaEn
                        ? `${t('confirmed_on')} ${new Date(ag.confirmadaEn).toLocaleDateString(locale)}`
                        : `${t('created_on')} ${new Date(ag.creadaEn).toLocaleDateString(locale)}`}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          )}

          {/* ── CONFIRM CTA ── */}
          {pestaña === "ruta" && r.dias.length > 0 && !agendaGuardadaId && (
            <View style={s.ctaBar}>
              <TouchableOpacity style={s.ctaBtn} onPress={handleGuardarYConfirmar}>
                <Feather name="check-circle" size={16} color="#000" />
                <Text style={s.ctaBtnTxt}>
                  {t('confirm_cta').replace('__N__', String(r.totalVisitas))}
                </Text>
              </TouchableOpacity>
            </View>
          )}
          {agendaGuardadaId && (
            <View style={[s.ctaBar, { backgroundColor: "#6ee7b711" }]}>
              <Feather name="check-circle" size={14} color="#6ee7b7" />
              <Text style={[s.ctaBtnTxt, { color: "#6ee7b7", fontWeight: "700" }]}>
                {t('schedule_confirmed_saved')}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

// ── DiaCard ───────────────────────────────────────────────────────────

function DiaCard({
  dia,
  contactoMap,
  desplazamientoLabel,
  expanded,
  onToggle,
  visitasLabel,
}: {
  dia: DiaRuta;
  contactoMap: Map<string, Contacto>;
  desplazamientoLabel: Record<TipoDesplazamiento, string>;
  expanded: boolean;
  onToggle: () => void;
  visitasLabel: string;
}) {
  const { lang, t } = useLanguage();
  const eColor = eficienciaColor(dia.eficienciaZona);

  return (
    <View style={s.diaCard}>
      <TouchableOpacity style={s.diaHeader} onPress={onToggle} activeOpacity={0.8}>
        <View style={s.diaLeft}>
          <Text style={s.diaSemana}>{dia.diaSemana}</Text>
          <Text style={s.diaFecha}>{formatFecha(dia.fecha, lang)}</Text>
        </View>
        <View style={s.diaZonas}>
          {dia.ciudades.slice(0, 2).map((c) => (
            <View key={c} style={s.ciudadTag}>
              <Text style={s.ciudadTagTxt} numberOfLines={1}>{c}</Text>
            </View>
          ))}
          {dia.ciudades.length > 2 && (
            <View style={s.ciudadTag}>
              <Text style={s.ciudadTagTxt}>+{dia.ciudades.length - 2}</Text>
            </View>
          )}
        </View>
        <View style={s.diaRight}>
          <View style={[s.diaEff, { backgroundColor: eColor + "22" }]}>
            <Text style={[s.diaEffTxt, { color: eColor }]}>{dia.eficienciaZona}%</Text>
          </View>
          <Text style={s.diaCount}>{dia.visitas.length} {visitasLabel}</Text>
          <Feather name={expanded ? "chevron-up" : "chevron-down"} size={14} color="#555" />
        </View>
      </TouchableOpacity>

      <View style={s.diaMetrics}>
        <DiaMetric icon="clock"   value={formatMinutos(dia.totalMinVisitas)} label={t('dia_visits_label')} />
        <DiaMetric icon="map"     value={formatKm(dia.totalKm)}              label={t('dia_distance')}     />
        <DiaMetric icon="compass" value={formatMinutos(dia.totalMinViaje)}   label={t('dia_en_route')}     />
      </View>

      {expanded && (
        <View style={s.visitasList}>
          {dia.visitas.map((v, i) => (
            <VisitaRow
              key={v.contactoId}
              visita={v}
              contacto={contactoMap.get(v.contactoId)}
              isLast={i === dia.visitas.length - 1}
              desplazamientoLabel={desplazamientoLabel}
            />
          ))}
        </View>
      )}
    </View>
  );
}

function VisitaRow({
  visita,
  contacto,
  isLast,
  desplazamientoLabel,
}: {
  visita: VisitaRuta;
  contacto: Contacto | undefined;
  isLast: boolean;
  desplazamientoLabel: Record<TipoDesplazamiento, string>;
}) {
  const desp = visita.desplazamientoDesdeAnterior;
  const despColor = desp ? DESPLAZAMIENTO_COLOR[desp.tipo] : "#444";

  return (
    <View>
      {desp && (
        <View style={s.despRow}>
          <View style={[s.despLine, { backgroundColor: despColor + "44" }]} />
          <View style={[s.despPill, { backgroundColor: despColor + "18", borderColor: despColor + "33" }]}>
            <Feather name="navigation" size={9} color={despColor} />
            <Text style={[s.despTxt, { color: despColor }]}>
              {formatMinutos(desp.minutos)} · {desp.km} km · {desplazamientoLabel[desp.tipo]}
            </Text>
          </View>
          <View style={[s.despLine, { backgroundColor: despColor + "44" }]} />
        </View>
      )}

      <View style={s.visitaCard}>
        <View style={s.visitaNumWrap}>
          <Text style={s.visitaNum}>{visita.ordenEnDia}</Text>
        </View>
        <View style={s.visitaInfo}>
          <Text style={s.visitaEmpresa} numberOfLines={1}>
            {contacto?.empresa || contacto?.responsable || visita.contactoId}
          </Text>
          <View style={s.visitaMetaRow}>
            {contacto?.ciudad ? (
              <View style={s.visitaCiudadTag}>
                <Feather name="map-pin" size={9} color="#555" />
                <Text style={s.visitaCiudadTxt}>{contacto.ciudad}</Text>
              </View>
            ) : null}
            {visita.asignado ? (
              <View style={s.visitaAsignadoTag}>
                <Feather name="user" size={9} color="#3b82f6" />
                <Text style={s.visitaAsignadoTxt}>{visita.asignado}</Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={s.visitaRight}>
          <Text style={s.visitaHora}>{visita.slot.hora}</Text>
          <Text style={s.visitaDur}>{formatMinutos(visita.duracionMin)}</Text>
        </View>
      </View>
    </View>
  );
}

// ── Zona view ──────────────────────────────────────────────────────────

function ZonaView({
  dias,
  contactoMap,
}: {
  dias: DiaRuta[];
  contactoMap: Map<string, Contacto>;
}) {
  const { lang, t } = useLanguage();
  const zonaMap = new Map<string, { visitas: VisitaRuta[]; dias: string[] }>();

  for (const dia of dias) {
    for (const v of dia.visitas) {
      const c = contactoMap.get(v.contactoId);
      const zona = c?.ciudad || t('no_city');
      if (!zonaMap.has(zona)) zonaMap.set(zona, { visitas: [], dias: [] });
      zonaMap.get(zona)!.visitas.push(v);
      if (!zonaMap.get(zona)!.dias.includes(dia.fecha)) {
        zonaMap.get(zona)!.dias.push(dia.fecha);
      }
    }
  }

  const zonas = [...zonaMap.entries()].sort((a, b) => b[1].visitas.length - a[1].visitas.length);
  const totalVisitas = dias.reduce((a, d) => a + d.visitas.length, 0);

  return (
    <>
      <View style={s.zonaLeyenda}>
        <Text style={s.zonaLeyendaTxt}>
          {zonas.length} {t('word_zone') + (zonas.length !== 1 ? "s" : "")} · {totalVisitas} {t('word_total_visits')}
        </Text>
      </View>
      {zonas.map(([zona, data]) => (
        <View key={zona} style={s.zonaCard}>
          <View style={s.zonaCardHeader}>
            <View style={s.zonaIconWrap}>
              <Feather name="map-pin" size={14} color="#6ee7b7" />
            </View>
            <View style={s.zonaCardLeft}>
              <Text style={s.zonaNombre}>{zona}</Text>
              <Text style={s.zonaMeta}>
                {data.visitas.length} {t('word_visit') + (data.visitas.length !== 1 ? "s" : "")} · {data.dias.length} {t('word_day_short') + (data.dias.length !== 1 ? "s" : "")}
              </Text>
            </View>
            <View style={[s.zonaCountBadge, { backgroundColor: "#6ee7b722" }]}>
              <Text style={[s.zonaCountTxt, { color: "#6ee7b7" }]}>{data.visitas.length}</Text>
            </View>
          </View>
          <View style={s.zonaVisitas}>
            {data.visitas.map((v) => {
              const c = contactoMap.get(v.contactoId);
              return (
                <View key={v.contactoId} style={s.zonaVisitaRow}>
                  <Text style={s.zonaVisitaEmpresa} numberOfLines={1}>
                    {c?.empresa || c?.responsable || v.contactoId}
                  </Text>
                  <Text style={s.zonaVisitaHora}>{v.slot.diaSemana} {v.slot.hora}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ))}
    </>
  );
}

// ── Small helpers ──────────────────────────────────────────────────────

function MetricPill({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={s.metricPill}>
      <Text style={s.metricVal}>{value}</Text>
      <Text style={s.metricLbl}>{label}</Text>
    </View>
  );
}

function DiaMetric({ icon, value, label }: { icon: string; value: string; label: string }) {
  return (
    <View style={s.diaMetric}>
      <Feather name={icon as any} size={10} color="#444" />
      <Text style={s.diaMetricVal}>{value}</Text>
      <Text style={s.diaMetricLbl}>{label}</Text>
    </View>
  );
}

function formatFecha(fecha: string, lang: string): string {
  try {
    return new Date(fecha + "T12:00:00").toLocaleDateString(lang === "en" ? "en-GB" : "es-ES", {
      day: "numeric",
      month: "short",
    });
  } catch {
    return fecha;
  }
}

// ── Styles ─────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:            { flex: 1 },
  scroll:          { flex: 1, paddingHorizontal: 12 },

  loadingWrap:     { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  loadingTitle:    { fontSize: 18, fontWeight: "800", color: "#111827", marginTop: 20, marginBottom: 8 },
  loadingSub:      { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 24 },
  loadingSteps:    { gap: 10, width: "100%" },
  loadingStep:     { flexDirection: "row", alignItems: "center", gap: 10 },
  loadingStepTxt:  { fontSize: 12, color: "#9CA3AF" },

  emptyWrap:       { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  emptyIcon:       { width: 88, height: 88, borderRadius: 44, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  emptyTitle:      { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8, textAlign: "center" },
  emptySub:        { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 20 },
  emptyStats:      { width: "100%", gap: 8, marginBottom: 24, backgroundColor: "#F7F8FA", borderRadius: 14, padding: 14, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  emptyStatRow:    { flexDirection: "row", alignItems: "center", gap: 10 },
  emptyStatTxt:    { fontSize: 13, color: "#6B7280" },
  btnGenerar:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#3D9A84", borderRadius: 14, paddingHorizontal: 22, paddingVertical: 14 },
  btnGenerarTxt:   { fontSize: 15, fontWeight: "800", color: "#FFFFFF" },
  btnHistorial:    { marginTop: 14 },
  btnHistorialTxt: { fontSize: 13, color: "#9CA3AF", textDecorationLine: "underline" },
  empty:           { alignItems: "center", padding: 32 },

  summaryStrip:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)", flexWrap: "wrap" },
  effBadge:        { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, alignItems: "center", minWidth: 58 },
  effPct:          { fontSize: 16, fontWeight: "900" },
  effLabel:        { fontSize: 8, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  metricPill:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#F3F4F6", alignItems: "center" },
  metricVal:       { fontSize: 11, fontWeight: "800", color: "#374151" },
  metricLbl:       { fontSize: 8, color: "#9CA3AF", textTransform: "uppercase" },
  regenBtn:        { width: 30, height: 30, borderRadius: 8, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginLeft: "auto" as any },

  paramsBar:       { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.06)" },
  paramsLabel:     { fontSize: 11, color: "#9CA3AF" },
  paramsBtn:       { width: 24, height: 24, borderRadius: 6, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
  paramsVal:       { fontSize: 13, fontWeight: "800", color: "#374151", minWidth: 18, textAlign: "center" },
  paramsZoneSep:   { width: 1, height: 18, backgroundColor: "#E5E7EB", marginHorizontal: 4 },
  paramsToggle:    { flexDirection: "row", alignItems: "center", gap: 5, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  paramsToggleOn:  { borderColor: "rgba(61,154,132,0.3)", backgroundColor: "rgba(61,154,132,0.08)" },
  paramsToggleTxt: { fontSize: 10, color: "#6B7280", fontWeight: "600" },
  sinAsignarBadge: { marginLeft: "auto" as any, backgroundColor: "rgba(196,136,58,0.12)", borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3 },
  sinAsignarTxt:   { fontSize: 10, color: "#C4883A", fontWeight: "700" },

  tabs:            { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  tab:             { flex: 1, paddingVertical: 10, alignItems: "center" },
  tabActive:       { borderBottomWidth: 2, borderBottomColor: "#3D9A84" },
  tabTxt:          { fontSize: 12, color: "#9CA3AF", fontWeight: "600" },
  tabTxtActive:    { color: "#3D9A84" },

  diaCard:         { backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", overflow: "hidden", marginTop: 8 },
  diaHeader:       { flexDirection: "row", alignItems: "center", gap: 8, padding: 12 },
  diaLeft:         { minWidth: 60 },
  diaSemana:       { fontSize: 13, fontWeight: "800", color: "#111827" },
  diaFecha:        { fontSize: 11, color: "#9CA3AF" },
  diaZonas:        { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  ciudadTag:       { borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, backgroundColor: "#F3F4F6", maxWidth: 90 },
  ciudadTagTxt:    { fontSize: 9, color: "#6B7280", fontWeight: "600" },
  diaRight:        { alignItems: "flex-end", gap: 2 },
  diaEff:          { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  diaEffTxt:       { fontSize: 10, fontWeight: "800" },
  diaCount:        { fontSize: 10, color: "#9CA3AF" },
  diaMetrics:      { flexDirection: "row", gap: 12, paddingHorizontal: 12, paddingBottom: 10, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: 8 },
  diaMetric:       { flexDirection: "row", alignItems: "center", gap: 4 },
  diaMetricVal:    { fontSize: 11, fontWeight: "700", color: "#6B7280" },
  diaMetricLbl:    { fontSize: 9, color: "#9CA3AF" },

  visitasList:     { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", paddingTop: 4 },
  despRow:         { flexDirection: "row", alignItems: "center", gap: 6, marginVertical: 4 },
  despLine:        { flex: 1, height: 1 },
  despPill:        { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  despTxt:         { fontSize: 9, fontWeight: "600" },
  visitaCard:      { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#F7F8FA", borderRadius: 10, padding: 10 },
  visitaNumWrap:   { width: 26, height: 26, borderRadius: 8, backgroundColor: "#E5E7EB", alignItems: "center", justifyContent: "center" },
  visitaNum:       { fontSize: 11, fontWeight: "800", color: "#9CA3AF" },
  visitaInfo:      { flex: 1, gap: 3 },
  visitaEmpresa:   { fontSize: 13, fontWeight: "700", color: "#111827" },
  visitaMetaRow:   { flexDirection: "row", gap: 6 },
  visitaCiudadTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  visitaCiudadTxt: { fontSize: 9, color: "#9CA3AF" },
  visitaAsignadoTag: { flexDirection: "row", alignItems: "center", gap: 3 },
  visitaAsignadoTxt: { fontSize: 9, color: "#4A80BD" },
  visitaRight:     { alignItems: "flex-end", gap: 2 },
  visitaHora:      { fontSize: 13, fontWeight: "800", color: "#3D9A84" },
  visitaDur:       { fontSize: 9, color: "#9CA3AF" },

  sinAsignarBox:   { backgroundColor: "rgba(196,136,58,0.06)", borderRadius: 14, padding: 12, borderWidth: 1, borderColor: "rgba(196,136,58,0.2)", marginTop: 4 },
  sinAsignarHeader:{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  sinAsignarTitle: { fontSize: 13, fontWeight: "700", color: "#C4883A" },
  sinAsignarRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, borderTopWidth: 1, borderTopColor: "rgba(196,136,58,0.15)" },
  sinAsignarEmpresa: { fontSize: 12, color: "#6B7280", flex: 1 },
  sinAsignarCiudad:{ fontSize: 11, color: "#9CA3AF" },

  zonaLeyenda:     { paddingVertical: 10 },
  zonaLeyendaTxt:  { fontSize: 11, color: "#9CA3AF" },
  zonaCard:        { backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  zonaCardHeader:  { flexDirection: "row", alignItems: "center", gap: 10, padding: 12 },
  zonaIconWrap:    { width: 32, height: 32, borderRadius: 10, backgroundColor: "rgba(61,154,132,0.1)", alignItems: "center", justifyContent: "center" },
  zonaCardLeft:    { flex: 1 },
  zonaNombre:      { fontSize: 14, fontWeight: "800", color: "#111827", marginBottom: 1 },
  zonaMeta:        { fontSize: 11, color: "#9CA3AF" },
  zonaCountBadge:  { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5 },
  zonaCountTxt:    { fontSize: 15, fontWeight: "900" },
  zonaVisitas:     { paddingHorizontal: 12, paddingBottom: 10, gap: 4 },
  zonaVisitaRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 4, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)" },
  zonaVisitaEmpresa: { fontSize: 12, color: "#6B7280", flex: 1 },
  zonaVisitaHora:  { fontSize: 11, color: "#9CA3AF", fontWeight: "600" },

  historialCard:   { backgroundColor: "#FFFFFF", borderRadius: 14, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  historialTop:    { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
  historialNombre: { flex: 1, fontSize: 13, fontWeight: "700", color: "#111827" },
  historialEstado: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  historialEstadoTxt: { fontSize: 10, fontWeight: "700" },
  historialMeta:   { fontSize: 11, color: "#9CA3AF", marginBottom: 2 },
  historialFecha:  { fontSize: 10, color: "#9CA3AF" },

  ctaBar:          { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.08)" },
  ctaBtn:          { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#3D9A84", borderRadius: 14, paddingVertical: 14 },
  ctaBtnTxt:       { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
