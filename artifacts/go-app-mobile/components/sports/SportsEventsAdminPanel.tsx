import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { canUseSportsEvents, sportsEventRecordSchema, type SportsEventRecord } from "@workspace/api-zod";
import { supabaseApiRequest } from "@/data/booking";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";

const SPORTS = ["football", "basketball", "tennis", "padel", "motorsport", "rugby", "handball", "volleyball", "other"] as const;
const SPORT_LABEL: Record<string, string> = { football: "Fútbol", basketball: "Baloncesto", tennis: "Tenis", padel: "Pádel", motorsport: "Motor", rugby: "Rugby", handball: "Balonmano", volleyball: "Voleibol", other: "Otros" };
const MODES = ["sale", "exchange", "sale_or_exchange", "free", "share"] as const;
const MODE_LABEL: Record<string, string> = { sale: "Venta", exchange: "Intercambio", sale_or_exchange: "Venta o intercambio", free: "Ceder gratis", share: "Compartir" };
const EXCHANGE_MODES = ["ticket", "ticket_plus_cash", "cash_plus_ticket", "multiple"] as const;
const EXCHANGE_MODE_LABEL: Record<string, string> = { ticket: "Entrada por entrada", ticket_plus_cash: "Mi entrada + diferencia", cash_plus_ticket: "Entrada + diferencia a mi favor", multiple: "Varias entradas" };
const STATUS_LABEL: Record<string, string> = { draft: "Borrador privado", available: "Marcado para revisión interna ADMIN", paused: "Pausado en ADMIN", cancelled: "Retirado del espacio ADMIN" };
const id = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const n = Math.random()*16|0; return (c === "x" ? n : (n&3)|8).toString(16); });
type RecordRow = { id: string; record_type: string; version: number; document: SportsEventRecord };
type Kind = "offer" | "season_pass" | "saved_search";

export function SportsEventsAdminPanel({ visible, onClose, fontScale = 1 }: { visible: boolean; onClose: () => void; fontScale?: number }) {
  const admin = useAdminAccess(), view = useGoView();
  if (!visible || !canUseSportsEvents(view.view, admin.allowed && !admin.checking, admin.userId)) return null;
  return <SportsEventsContent key={admin.userId} onClose={onClose} fontScale={fontScale} />;
}

function SportsEventsContent({ onClose, fontScale }: { onClose: () => void; fontScale: number }) {
  const admin = useAdminAccess(), view = useGoView();
  const allowed = canUseSportsEvents(view.view, admin.allowed && !admin.checking, admin.userId);
  const [rows, setRows] = useState<RecordRow[]>([]), [busy, setBusy] = useState(false), [ready, setReady] = useState(false), [error, setError] = useState("");
  const [kind, setKind] = useState<Kind>("offer"), [editing, setEditing] = useState<SportsEventRecord | null>(null), [search, setSearch] = useState("");
  const [sport, setSport] = useState<typeof SPORTS[number]>("football"), [mode, setMode] = useState<typeof MODES[number]>("sale");
  const [eventTitle, setEventTitle] = useState(""), [eventKey, setEventKey] = useState(""), [competition, setCompetition] = useState(""), [teams, setTeams] = useState("");
  const [startsAt, setStartsAt] = useState(""), [timeZone, setTimeZone] = useState("Europe/Madrid"), [city, setCity] = useState(""), [venue, setVenue] = useState("");
  const [stand, setStand] = useState(""), [section, setSection] = useState(""), [row, setRow] = useState(""), [seat, setSeat] = useState(""), [quantity, setQuantity] = useState("1");
  const [price, setPrice] = useState(""), [faceValue, setFaceValue] = useState(""), [policyUrl, setPolicyUrl] = useState("");
  const [desiredSport, setDesiredSport] = useState<typeof SPORTS[number]>("football"), [desiredCompetition, setDesiredCompetition] = useState(""), [desiredTeam, setDesiredTeam] = useState(""), [desiredZones, setDesiredZones] = useState(""), [minDifference, setMinDifference] = useState(""), [maxDifference, setMaxDifference] = useState("");
  const [exchangeFromDate, setExchangeFromDate] = useState(""), [exchangeToDate, setExchangeToDate] = useState("");
  const [exchangeCompatibleModes, setExchangeCompatibleModes] = useState<(typeof EXCHANGE_MODES[number])[]>(["ticket"]);
  const [searchFromDate, setSearchFromDate] = useState(""), [searchToDate, setSearchToDate] = useState(""), [searchMaxPrice, setSearchMaxPrice] = useState("");
  const [searchModes, setSearchModes] = useState<(typeof MODES[number])[]>(["sale"]);
  const [passTitle, setPassTitle] = useState(""), [passSeason, setPassSeason] = useState(""), [passEvents, setPassEvents] = useState("");
  const scale = Math.max(0.85, Math.min(1.35, fontScale));
  const api = useCallback(<T,>(path: string, method = "GET", body?: unknown) => {
    if (!allowed || !admin.userId) return Promise.reject(new Error("El acceso ADMIN ya no está disponible."));
    return supabaseApiRequest<T>(`/supabase/sports-events${path}`, { method, headers: { "X-GO-Context": "ADMIN" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }, true, admin.userId);
  }, [allowed, admin.userId]);
  const load = useCallback(async (term = "") => {
    if (!allowed) { setRows([]); return; }
    setBusy(true); setError("");
    try {
      const result = await api<RecordRow[]>(`/records?offset=0&limit=100&search=${encodeURIComponent(term)}`);
      if (!allowed) return;
      setRows(Array.isArray(result) ? result : []); setReady(true);
    } catch (e) { if (allowed) { setRows([]); setReady(false); setError((e as Error).message || "El almacenamiento privado aún no está disponible."); } }
    finally { if (allowed) setBusy(false); }
  }, [allowed, api]);
  useEffect(() => { setRows([]); setReady(false); setEditing(null); void load(search); }, [load, search]);
  const filtered = useMemo(() => rows.filter(item => item.document.recordType === kind
    && (item.document.recordType === "offer" ? item.document.event.sport === sport
      : item.document.recordType === "season_pass" ? item.document.sport === sport
        : item.document.sport === undefined || item.document.sport === sport)), [rows, kind, sport]);
  const resetForm = () => { setEditing(null); setEventTitle(""); setEventKey(""); setCompetition(""); setTeams(""); setStartsAt(""); setCity(""); setVenue(""); setStand(""); setSection(""); setRow(""); setSeat(""); setQuantity("1"); setPrice(""); setFaceValue(""); setPolicyUrl(""); setDesiredCompetition(""); setDesiredTeam(""); setDesiredZones(""); setMinDifference(""); setMaxDifference(""); setExchangeFromDate(""); setExchangeToDate(""); setExchangeCompatibleModes(["ticket"]); setSearchFromDate(""); setSearchToDate(""); setSearchMaxPrice(""); setSearchModes(["sale"]); setPassTitle(""); setPassSeason(""); setPassEvents(""); };
  const edit = (record: SportsEventRecord) => {
    setEditing(record); setKind(record.recordType);
    if (record.recordType === "offer") {
      setSport(record.event.sport); setMode(record.mode); setEventTitle(record.event.title); setEventKey(record.event.key); setCompetition(record.event.competition); setTeams([record.event.homeTeam, record.event.awayTeam].filter(Boolean).join(" · "));
      setStartsAt(record.event.startsAt); setTimeZone(record.event.timeZone || "Europe/Madrid"); setCity(record.event.city); setVenue(record.event.venue);
      setStand(record.seat.stand); setSection(record.seat.section); setRow(record.seat.row); setSeat(record.seat.seat); setQuantity(String(record.seat.quantity));
      setPrice(record.price === undefined ? "" : String(record.price)); setFaceValue(record.faceValue === undefined ? "" : String(record.faceValue)); setPolicyUrl(record.policy.sourceUrl || "");
      setDesiredSport(record.exchange?.sport ?? "football"); setDesiredCompetition(record.exchange?.competition ?? ""); setDesiredTeam(record.exchange?.team ?? ""); setDesiredZones((record.exchange?.zones ?? []).join(", ")); setMinDifference(record.exchange?.minCashDifference === undefined ? "" : String(record.exchange.minCashDifference)); setMaxDifference(record.exchange?.maxCashDifference === undefined ? "" : String(record.exchange.maxCashDifference)); setExchangeFromDate(record.exchange?.fromDate ?? ""); setExchangeToDate(record.exchange?.toDate ?? ""); setExchangeCompatibleModes(record.exchange?.compatibleModes ?? ["ticket"]);
    } else if (record.recordType === "season_pass") {
      setSport(record.sport); setPassTitle(record.title); setPassSeason(record.season); setCompetition(record.competition); setVenue(record.venue);
      setStand(record.seat.stand); setSection(record.seat.section); setRow(record.seat.row); setSeat(record.seat.seat); setQuantity(String(record.seat.quantity));
      setPassEvents(record.coveredEvents.map(event => `${event.key}|${event.title}|${event.startsAt}|${event.attendance}`).join("\n"));
    } else { setPassTitle(record.title); setDesiredSport(record.sport ?? "football"); setCity(record.city); setDesiredCompetition(record.competition); setDesiredTeam(record.team); setVenue(record.venue); setSearchFromDate(record.fromDate); setSearchToDate(record.toDate); setSearchMaxPrice(record.maxPrice === undefined ? "" : String(record.maxPrice)); setSearchModes(record.modes); }
  };
  const buildRecord = () => {
    if (!admin.userId) throw new Error("Inicia sesión como administrador.");
    const base = { id: editing?.id ?? id(), ownerUserId: admin.userId, profile: "ADMIN" as const, version: editing?.version ?? 0,
      status: editing?.status ?? "draft" as const, accessStatus: "unverified" as const, policy: { status: "unverified" as const, sourceUrl: policyUrl.trim() } };
    let value: unknown;
    if (kind === "offer") {
      const [homeTeam = "", awayTeam = ""] = teams.split("·").map(v => v.trim());
      const amount = (raw: string) => raw.trim() === "" ? undefined : Number(raw.replace(",", "."));
      const needsExchange = mode === "exchange" || mode === "sale_or_exchange";
      value = { ...base, recordType: "offer", event: { key: eventKey.trim(), title: eventTitle.trim(), sport, competition: competition.trim(), homeTeam, awayTeam,
        startsAt: startsAt.trim(), timeZone: timeZone.trim(), city: city.trim(), venue: venue.trim(), region: "", officialEventUrl: "" },
        seat: { stand: stand.trim(), section: section.trim(), row: row.trim(), seat: seat.trim(), quantity: Number(quantity) }, mode,
        ...(!["free", "share"].includes(mode) && amount(price) !== undefined ? { price: amount(price) } : {}),
        ...(amount(faceValue) === undefined ? {} : { faceValue: amount(faceValue) }), currency: "EUR",
        ...(needsExchange ? { exchange: { sport: desiredSport, competition: desiredCompetition.trim(), team: desiredTeam.trim(), zones: desiredZones.split(",").map(v => v.trim()).filter(Boolean), compatibleModes: exchangeCompatibleModes, fromDate: exchangeFromDate.trim(), toDate: exchangeToDate.trim(),
          ...(minDifference.trim() ? { minCashDifference: Number(minDifference.replace(",", ".")) } : {}), ...(maxDifference.trim() ? { maxCashDifference: Number(maxDifference.replace(",", ".")) } : {}) } } : {}),
        ownerStatement: "self_declared" };
    } else if (kind === "season_pass") {
      const coveredEvents = passEvents.split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const [key = "", title = "", startsAt = "", attendance = "unknown"] = line.split("|").map(v => v.trim());
        return { key, title, startsAt, attendance: ["attend", "offer", "excluded", "unknown"].includes(attendance) ? attendance : "unknown" };
      });
      value = { ...base, recordType: "season_pass", title: passTitle.trim(), sport, competition: competition.trim(), season: passSeason.trim(), venue: venue.trim(),
        seat: { stand: stand.trim(), section: section.trim(), row: row.trim(), seat: seat.trim(), quantity: Number(quantity) }, coveredEvents, ownerStatement: "self_declared" };
    } else value = { ...base, recordType: "saved_search", title: passTitle.trim(), sport, city: city.trim(), region: "", team: desiredTeam.trim(), competition: desiredCompetition.trim(), venue: venue.trim(), fromDate: searchFromDate.trim(), toDate: searchToDate.trim(),
      ...(searchMaxPrice.trim() ? { maxPrice: Number(searchMaxPrice.replace(",", ".")) } : {}), modes: searchModes };
    const parsed = sportsEventRecordSchema.safeParse(value);
    if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Revisa los datos.");
    return parsed.data;
  };
  const save = async () => {
    try {
      if (!allowed || !ready) throw new Error("El servicio no está disponible para guardar.");
      const record = buildRecord(), expectedVersion = editing?.version ?? 0;
      const saved = await api<SportsEventRecord>(editing ? `/records/${record.id}` : "/records", editing ? "PUT" : "POST", { record, expectedVersion });
      setRows(old => [{ id: saved.id, record_type: saved.recordType, version: saved.version, document: saved }, ...old.filter(x => x.id !== saved.id)]);
      resetForm(); setError("");
    } catch (e) { setError((e as Error).message); }
  };
  const withdraw = (record: SportsEventRecord) => Alert.alert("Retirar registro", "Se archivará en tu espacio ADMIN. No se enviará a terceros ni se ejecutará ninguna operación externa.", [
    { text: "Cancelar", style: "cancel" }, { text: "Retirar", style: "destructive", onPress: () => void api(`/records/${record.id}?version=${record.version}`, "DELETE").then(() => load(search)).catch(e => setError((e as Error).message)) },
  ]);
  const field = (label: string, value: string, setter: (v: string) => void, placeholder = "", numeric = false, multiline = false) => <View style={s.field} key={label}>
    <Text style={s.label}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={setter} placeholder={placeholder} placeholderTextColor="#94a3b8"
      keyboardType={numeric ? "decimal-pad" : "default"} multiline={multiline} style={[s.input, { fontSize: 15 * scale }, multiline && { minHeight: 84, textAlignVertical: "top" }]} />
  </View>;
  const chip = (label: string, selected: boolean, onPress: () => void, key: string) => <TouchableOpacity key={key} accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress}
    style={[s.chip, selected && s.chipSelected]}><Text style={[s.chipText, selected && { color: "#052e16" }]}>{label}</Text></TouchableOpacity>;

  return <Modal visible transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
    <SafeAreaView style={s.safe}>
      <View style={s.panel}>
        <View style={s.header}><View style={{ flex: 1 }}><Text style={s.kicker}>ADMIN · DEPORTES</Text><Text style={s.title}>Eventos deportivos</Text></View>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar Eventos Deportivos" onPress={onClose} style={s.close}><Feather name="x" size={22} color="#fff" /></TouchableOpacity></View>
        <Text style={s.privacy}>Espacio privado de esta cuenta ADMIN. Las anotaciones no se publican ni son visibles para EMPRESA o USUARIO.</Text>
        {!!error && <View accessibilityRole="alert" style={s.error}><Feather name="alert-circle" size={16} color="#fecaca" /><Text style={s.errorText}>{error}</Text></View>}
        {!ready && !busy && <View style={s.blocked}><Feather name="database" size={24} color="#fbbf24" /><Text style={s.blockedTitle}>Almacenamiento todavía no activado</Text>
          <Text style={s.body}>{error || "El esquema privado no está disponible. No se ha guardado ningún dato. Esta vista no utiliza datos de demostración."}</Text></View>}
        <View style={s.tabs}>{(["offer", "season_pass", "saved_search"] as Kind[]).map(k => chip(k === "offer" ? "Ofertas" : k === "season_pass" ? "Abonos" : "Búsquedas", kind === k, () => { setKind(k); resetForm(); }, k))}</View>
        {ready && <>
          {field("Buscar evento, equipo o ciudad", search, setSearch, "Buscar en tus registros")}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, paddingVertical: 4 }}>{SPORTS.map(item => chip(SPORT_LABEL[item], sport === item, () => setSport(item), item))}</ScrollView>
          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 18 }} keyboardShouldPersistTaps="handled">
            <View style={s.rowBetween}><Text style={s.sectionTitle}>{editing ? "Editar registro" : kind === "offer" ? "Registrar entrada" : kind === "season_pass" ? "Registrar abono" : "Guardar filtros"}</Text>
              <TouchableOpacity accessibilityRole="button" disabled={!!editing} onPress={() => { setEditing(null); setPassTitle(""); }} style={[s.smallButton, !!editing && { opacity: .45 }]}><Text style={s.smallButtonText}>Nuevo</Text></TouchableOpacity></View>
            {kind === "offer" && <>
              <View style={s.wrap}>{MODES.map(m => chip(MODE_LABEL[m], mode === m, () => setMode(m), m))}</View>
              {field("Evento", eventTitle, setEventTitle, "Nombre oficial del evento")}{field("Clave del evento (referencia del organizador o combinación estable)", eventKey, setEventKey, "No inventes una referencia")}
              {field("Competición", competition, setCompetition)}{field("Equipos", teams, setTeams, "Local · visitante")}
              {field("Inicio (ISO con zona horaria)", startsAt, setStartsAt, "2026-11-11T20:00:00+01:00")}{field("Zona horaria IANA", timeZone, setTimeZone, "Europe/Madrid")}
              {field("Ciudad", city, setCity)}{field("Estadio / recinto", venue, setVenue)}
              {field("Grada", stand, setStand)}{field("Sector", section, setSection)}
              <View style={s.two}>{field("Fila", row, setRow)}{field("Asiento", seat, setSeat)}{field("Cantidad", quantity, setQuantity, "1", true)}</View>
              {mode !== "free" && mode !== "share" && field("Precio solicitado en EUR", price, setPrice, "Opcional salvo venta", true)}
              {field("Precio nominal conocido en EUR", faceValue, setFaceValue, "Opcional", true)}
              {(mode === "exchange" || mode === "sale_or_exchange") && <>
                <Text style={s.sectionTitle}>Preferencias de intercambio</Text><View style={s.wrap}>{SPORTS.map(item => chip(SPORT_LABEL[item], desiredSport === item, () => setDesiredSport(item), `want-${item}`))}</View>
                {field("Competición deseada", desiredCompetition, setDesiredCompetition)}{field("Equipo deseado", desiredTeam, setDesiredTeam)}
                {field("Zonas deseadas (separadas por comas)", desiredZones, setDesiredZones)}
                <View style={s.two}>{field("Desde (AAAA-MM-DD)", exchangeFromDate, setExchangeFromDate)}{field("Hasta (AAAA-MM-DD)", exchangeToDate, setExchangeToDate)}</View>
                <View style={s.two}>{field("Diferencia mínima EUR", minDifference, setMinDifference, "Sin mínimo", true)}{field("Diferencia máxima EUR", maxDifference, setMaxDifference, "Sin máximo", true)}</View>
                <Text style={s.label}>Combinaciones que estudiar (solo anotación)</Text><View style={s.wrap}>{EXCHANGE_MODES.map(m => chip(EXCHANGE_MODE_LABEL[m], exchangeCompatibleModes.includes(m), () => setExchangeCompatibleModes(old => old.includes(m) ? old.filter(x => x !== m) : [...old, m]), `exchange-${m}`))}</View>
              </>}
              {field("Fuente oficial para revisar condiciones", policyUrl, setPolicyUrl, "URL pública del organizador")}
              <Text style={s.warning}>Titularidad autodeclarada. Acceso no verificado. No añadas QR, códigos ni datos de pago. No se transfiere ni vende desde GO.</Text>
            </>}
            {kind === "season_pass" && <>
              {field("Nombre del abono", passTitle, setPassTitle)}{field("Deporte / temporada", passSeason, setPassSeason, "2026-2027")}{field("Competición", competition, setCompetition)}{field("Recinto", venue, setVenue)}
              <View style={s.wrap}>{SPORTS.map(item => chip(SPORT_LABEL[item], sport === item, () => setSport(item), `pass-${item}`))}</View>
              {field("Grada", stand, setStand)}{field("Sector", section, setSection)}<View style={s.two}>{field("Fila", row, setRow)}{field("Asiento", seat, setSeat)}{field("Asientos contiguos", quantity, setQuantity, "1", true)}</View>
              {field("Eventos incluidos: referencia | título | fecha con zona | estado (uno por línea)", passEvents, setPassEvents, "key|Partido|2026-11-11T20:00:00+01:00|unknown", false, true)}
              <Text style={s.warning}>La relación de partidos es aportada por ADMIN; GO no consulta calendarios oficiales ni comprueba derechos del abono.</Text>
            </>}
            {kind === "saved_search" && <>
              {field("Nombre de búsqueda", passTitle, setPassTitle)}{field("Ciudad o zona", city, setCity)}{field("Competición", desiredCompetition, setDesiredCompetition)}{field("Equipo", desiredTeam, setDesiredTeam)}{field("Estadio / recinto", venue, setVenue)}
              <View style={s.two}>{field("Desde (AAAA-MM-DD)", searchFromDate, setSearchFromDate)}{field("Hasta (AAAA-MM-DD)", searchToDate, setSearchToDate)}</View>
              {field("Precio máximo EUR", searchMaxPrice, setSearchMaxPrice, "Sin límite indicado", true)}
              <View style={s.wrap}>{MODES.map(m => chip(MODE_LABEL[m], searchModes.includes(m), () => setSearchModes(old => old.includes(m) ? old.filter(x => x !== m) : [...old, m]), `search-${m}`))}</View>
              <Text style={s.warning}>Guarda criterios para tus registros privados ADMIN. Todavía no consulta anuncios de otras cuentas ni de servicios externos.</Text>
            </>}
            <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => void save()} style={[s.primary, busy && { opacity: .5 }]}><Text style={s.primaryText}>{editing ? "GUARDAR CAMBIOS" : "GUARDAR EN ADMIN"}</Text></TouchableOpacity>
            <Text style={s.sectionTitle}>Registros guardados</Text>
            {filtered.length === 0 && <Text style={s.body}>No hay registros de este tipo.</Text>}
            {filtered.map(item => <View key={item.id} style={s.card}><View style={{ flex: 1, gap: 4 }}><Text style={s.cardTitle}>{item.document.recordType === "offer" ? item.document.event.title : item.document.recordType === "season_pass" ? item.document.title : item.document.title}</Text>
              <Text style={s.body}>{STATUS_LABEL[item.document.status] ?? item.document.status} · Acceso no verificado</Text>
              <Text style={s.body}>{item.document.recordType === "offer" ? `${SPORT_LABEL[item.document.event.sport]} · ${item.document.event.city || "Ciudad sin indicar"} · ${item.document.event.startsAt || "Fecha sin indicar"}` : item.document.recordType === "season_pass" ? `${SPORT_LABEL[item.document.sport]} · ${item.document.season} · ${item.document.coveredEvents.length} eventos declarados` : `Búsqueda guardada · ${SPORT_LABEL[item.document.sport ?? "other"]}`}</Text></View>
              <View style={{ gap: 6 }}><TouchableOpacity accessibilityLabel="Editar registro" onPress={() => edit(item.document)} style={s.iconButton}><Feather name="edit-2" size={16} color="#fff" /></TouchableOpacity><TouchableOpacity accessibilityLabel="Retirar registro" onPress={() => withdraw(item.document)} style={s.iconButton}><Feather name="archive" size={16} color="#fecaca" /></TouchableOpacity></View></View>)}
          </ScrollView>
        </>}
        {busy && <View style={s.loading}><ActivityIndicator color="#fbbf24" /><Text style={s.body}>Consultando almacenamiento privado…</Text></View>}
        <Text style={s.footer}>Solo ADMIN. Esta versión no publica ofertas ni ejecuta pagos, intercambios, cesiones o transferencias; el derecho de acceso no está verificado.</Text>
      </View>
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({ safe: { flex: 1, backgroundColor: "rgba(0,0,0,.88)", justifyContent: "center", padding: 8 }, panel: { flex: 1, maxHeight: 900, borderRadius: 22, borderWidth: 1, borderColor: "rgba(34,197,94,.4)", backgroundColor: "#09120e", padding: 16, gap: 11 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 }, kicker: { color: "#86efac", fontSize: 11, fontWeight: "800", letterSpacing: 1.4 }, title: { color: "#fff", fontSize: 24, fontWeight: "800" }, close: { width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: "#18251d", borderWidth: 1, borderColor: "#3f5947" },
  privacy: { color: "#bbf7d0", fontSize: 12, lineHeight: 17 }, blocked: { padding: 15, gap: 9, borderRadius: 13, borderWidth: 1, borderColor: "#86651a", backgroundColor: "#231d0d", alignItems: "center" }, blockedTitle: { color: "#fde68a", fontSize: 17, fontWeight: "800" },
  tabs: { flexDirection: "row", gap: 7, flexWrap: "wrap" }, chip: { minHeight: 42, paddingHorizontal: 11, borderRadius: 12, justifyContent: "center", alignItems: "center", backgroundColor: "#17231b", borderWidth: 1, borderColor: "#314439" }, chipSelected: { backgroundColor: "#86efac", borderColor: "#86efac" }, chipText: { color: "#d1d5db", fontSize: 12, fontWeight: "700" }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 7, paddingVertical: 4 },
  field: { flex: 1, minWidth: 105, gap: 5, marginVertical: 3 }, label: { color: "#cbd5e1", fontSize: 12, fontWeight: "700" }, input: { minHeight: 46, borderRadius: 11, borderWidth: 1, borderColor: "#35443a", backgroundColor: "#0e1912", color: "#fff", paddingHorizontal: 12, paddingVertical: 10 }, two: { flexDirection: "row", gap: 7 }, rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 5 }, sectionTitle: { color: "#f8fafc", fontSize: 16, fontWeight: "800", marginTop: 6 }, smallButton: { minHeight: 40, minWidth: 58, borderRadius: 10, borderWidth: 1, borderColor: "#597260", alignItems: "center", justifyContent: "center", paddingHorizontal: 10 }, smallButtonText: { color: "#d1fae5", fontWeight: "700" },
  primary: { minHeight: 48, borderRadius: 13, backgroundColor: "#22c55e", justifyContent: "center", alignItems: "center", marginTop: 7 }, primaryText: { color: "#052e16", fontSize: 14, fontWeight: "900", letterSpacing: .3 }, warning: { borderRadius: 11, borderWidth: 1, borderColor: "#765b24", backgroundColor: "#211b0d", color: "#fde68a", fontSize: 12, lineHeight: 18, padding: 11 }, error: { flexDirection: "row", gap: 8, backgroundColor: "#4b1515", borderWidth: 1, borderColor: "#7f1d1d", padding: 10, borderRadius: 10 }, errorText: { color: "#fecaca", flex: 1, fontSize: 12 }, body: { color: "#cbd5e1", fontSize: 12, lineHeight: 18 }, card: { flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginVertical: 5, borderWidth: 1, borderColor: "#29382e", borderRadius: 13, backgroundColor: "#0e1912" }, cardTitle: { color: "#fff", fontWeight: "800", fontSize: 15 }, iconButton: { width: 44, height: 44, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: "#243229" }, loading: { flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 9 }, footer: { color: "#94a3b8", fontSize: 11, textAlign: "center", lineHeight: 15 } });
