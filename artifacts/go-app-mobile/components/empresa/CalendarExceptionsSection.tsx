import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import { captureAuthIdentity, isAuthIdentityCurrent, type AuthIdentity } from "@/lib/authSession";
import { onSessionChanged } from "@/lib/sessionEvents";
import { useGoCalendarFlow } from "@/hooks/useGoCalendarFlow";
import { formatISODate } from "@/lib/time";
import { getOwnedStaff, isCloudId, type Staff } from "@/data/booking";
import { businessWallTime } from "@/data/bookingTimeline";
import { calendarMinuteLabel, calendarRangeLabel, calendarToday, deleteCalendarException, getCalendarExceptions, saveCalendarException,
  validateCalendarIntervals, type CalendarExceptionInterval, type CalendarExceptionResult } from "@/data/calendarExceptions";
import { GoTimeField } from "@/components/ui/GoTimePicker";

type Props = { businessId?: string; timezone?: string; color: string; onManageConflicts?: (dateISO: string) => void };
const message = (error: unknown) => error instanceof Error ? error.message : "No se pudo comprobar la disponibilidad.";
const requestKey = () => `calendar_${Date.now()}_${Math.random().toString(36).slice(2)}`;
const minute = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

/** A dated override editor, not another agenda. All persisted/effective windows come from the server. */
export function CalendarExceptionsSection({ businessId, timezone, color, onManageConflicts }: Props) {
  const { lang } = useLanguage();
  const label = (es: string, en: string) => lang === "en" ? en : es;
  const [dateISO, setDateISO] = useState(() => calendarToday(timezone || "UTC"));
  const [staffId, setStaffId] = useState<string | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [data, setData] = useState<CalendarExceptionResult | null>(null);
  const [draft, setDraft] = useState<CalendarExceptionInterval[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [sessionRevision, setSessionRevision] = useState(0);
  const scope = useRef(0), identity = useRef<AuthIdentity | null>(null), busy = useRef(false);
  const operation = useRef<{ signature: string; requestId: string } | null>(null);
  const calendar = useGoCalendarFlow();
  const cloud = isCloudId(businessId);
  useEffect(() => onSessionChanged(() => { scope.current++; identity.current = null; setData(null); setDraft([]); setStaff([]); setSessionRevision(r => r + 1); }), []);
  useEffect(() => { setStaffId(null); setStaff([]); setDateISO(calendarToday(timezone || "UTC")); calendar.cancel(); }, [businessId, sessionRevision]);
  useEffect(() => {
    const token = ++scope.current;
    busy.current = false; operation.current = null; setSaving(false); setData(null); setDraft([]); setError("");
    if (!cloud || !businessId) { setLoading(false); return; }
    setLoading(true);
    void (async () => {
      try {
        const who = await captureAuthIdentity();
        if (!who) throw new Error(label("Inicia sesión para gestionar las excepciones.", "Sign in to manage calendar exceptions."));
        const [result, professionals] = await Promise.all([getCalendarExceptions(businessId, dateISO, staffId, calendarToday(timezone || "UTC"), who.userId), getOwnedStaff(businessId)]);
        if (scope.current !== token || !await isAuthIdentityCurrent(who)) return;
        identity.current = who; setStaff(professionals.filter(s => s.active)); setData(result);
        setDraft(result.exceptions.find(e => e.dateISO === dateISO && e.staffId === staffId)?.intervals.map(i => ({ ...i })) ?? []);
      } catch (cause) { if (scope.current === token) setError(message(cause)); }
      finally { if (scope.current === token) setLoading(false); }
    })();
    return () => { if (scope.current === token) scope.current++; };
  }, [businessId, dateISO, staffId, reload, sessionRevision, timezone]);
  const readyData = data?.day.dateISO === dateISO && data.day.staffId === staffId ? data : null;
  const current = readyData?.exceptions.find(e => e.dateISO === dateISO && e.staffId === staffId);
  const disabled = loading || saving || !readyData;
  const zone = readyData?.timezone || timezone || "UTC";
  const edit = (index: number, patch: Partial<CalendarExceptionInterval>) => setDraft(rows => rows.map((row, i) => i === index ? { ...row, ...patch } : row));
  const add = (preset: "day" | "morning" | "afternoon" | "hours") => {
    const open = data?.day.openIntervals ?? [];
    const actual = open.map(r => ({ start: minute(businessWallTime(r.startsAt, zone).slice(11, 16)), end: businessWallTime(r.endsAt, zone).slice(0, 10) > dateISO ? 1440 : minute(businessWallTime(r.endsAt, zone).slice(11, 16)) }));
    const first = actual[0], last = actual.at(-1);
    const startMinute = preset === "day" ? 0 : preset === "morning" ? first?.start ?? 0 : preset === "afternoon" ? actual.length > 1 ? last!.start : Math.max(first?.start ?? 720, 720) : first?.start ?? 540;
    const endMinute = preset === "day" ? 1440 : preset === "morning" ? actual.length > 1 ? first.end : Math.min(first?.end ?? 720, 720) : preset === "afternoon" ? last?.end ?? 1440 : first?.end ?? 780;
    if (endMinute <= startMinute) { setError(label("No hay un tramo para ese período. Añade un intervalo de horas.", "No interval exists in that period. Choose custom hours.")); return; }
    setError(""); setDraft(rows => [...rows, { kind: "closed", startMinute, endMinute }]);
  };
  const persist = async (deleting = false) => {
    if (busy.current || !businessId || !readyData || !identity.current) return;
    const token = scope.current, who = identity.current;
    busy.current = true; setSaving(true); setError("");
    try {
      if (!await isAuthIdentityCurrent(who)) throw new Error(label("La cuenta ha cambiado. Recarga la configuración.", "The account changed. Reload settings."));
      const intervals = deleting ? [] : validateCalendarIntervals(draft);
      const expectedRevision = current?.revision ?? 0;
      const signature = JSON.stringify({ businessId, staffId, dateISO, intervals, expectedRevision, deleting });
      if (operation.current?.signature !== signature) operation.current = { signature, requestId: requestKey() };
      const command = { businessId, staffId, dateISO, expectedRevision, requestId: operation.current.requestId };
      const result = deleting ? await deleteCalendarException(command, who.userId) : await saveCalendarException({ ...command, intervals }, who.userId);
      if (scope.current !== token || !await isAuthIdentityCurrent(who)) return;
      setData(result); const saved = result.exceptions.find(e => e.dateISO === dateISO && e.staffId === staffId);
      setDraft(saved?.intervals.map(i => ({ ...i })) ?? []); operation.current = null;
      if (saved?.conflicts.length) Alert.alert(label("Reservas afectadas", "Affected bookings"), label(`${saved.conflicts.length} reservas coinciden con el cierre. Se conservan; gestiona su cambio o cancelación desde el Calendario.`, `${saved.conflicts.length} bookings overlap this closure. They remain unchanged; manage changes or cancellations in Calendar.`), [
        { text: label("Cerrar", "Close"), style: "cancel" }, ...(onManageConflicts ? [{ text: label("Ver en Calendario", "View in Calendar"), onPress: () => onManageConflicts(dateISO) }] : []),
      ]);
    } catch (cause) { if (scope.current === token) setError(message(cause)); }
    finally { if (scope.current === token) { busy.current = false; setSaving(false); } }
  };
  const selectDate = (date: string) => { setDateISO(date); setError(""); };
  const button = (title: string, onPress: () => void, testID?: string, selected = false, blocked = false) => <TouchableOpacity key={testID ?? title} testID={testID} accessibilityRole="button" accessibilityState={{ selected, disabled: blocked }} disabled={blocked} onPress={onPress} style={[s.button, { borderColor: selected ? color : "#D1D5DB", backgroundColor: selected ? "#F3F0FA" : "#fff" }]}><Text style={s.buttonText}>{title}</Text></TouchableOpacity>;
  const year = calendar.monthGridYear, month = calendar.monthGridMonth;
  const firstWeekday = (new Date(year, month, 1, 12).getDay() + 6) % 7, days = new Date(year, month + 1, 0, 12).getDate();
  return <View testID="calendar-exceptions-section" style={s.section}>
    <Text accessibilityRole="header" style={s.title}>{label("EXCEPCIONES DEL CALENDARIO", "CALENDAR EXCEPTIONS")}</Text>
    <Text style={s.description}>{label("Aperturas y cierres solo para las fechas elegidas. El horario semanal no cambia.", "Openings and closures only on selected dates. Weekly hours stay unchanged.")}</Text>
    {!cloud ? <Text style={s.description}>{label("Guarda y sincroniza primero la empresa para gestionar sus excepciones reales.", "Save and synchronize this business before managing its calendar exceptions.")}</Text> : <>
      {button(dateISO.split("-").reverse().join("/"), () => calendar.openForNav({ initialDateISO: dateISO, onDaySelect: selectDate }), "calendar-exception-date", false, saving)}
      {calendar.monthGridOpen && <View testID="calendar-exception-picker" style={s.picker}>
        <View style={s.row}>
          {button("‹", () => calendar.navigateMonth(-1), "calendar-exception-previous-month")}
          <Text accessibilityRole="header" style={[s.buttonText, { flex: 1, textAlign: "center" }]}>{new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { month: "long", year: "numeric" }).format(new Date(year, month, 1, 12))}</Text>
          {button("›", () => calendar.navigateMonth(1), "calendar-exception-next-month")}
        </View>
        <View style={s.grid}>{(lang === "en" ? ["M", "T", "W", "T", "F", "S", "S"] : ["L", "M", "X", "J", "V", "S", "D"]).map((day, i) => <Text key={`weekday-${i}`} style={[s.day, s.buttonText]}>{day}</Text>)}
          {Array.from({ length: firstWeekday }, (_, i) => <View key={`blank-${i}`} style={s.day} />)}
          {Array.from({ length: days }, (_, i) => { const iso = formatISODate(new Date(year, month, i + 1, 12)); return <TouchableOpacity key={iso} testID={`calendar-exception-day-${iso}`} accessibilityRole="button" accessibilityLabel={iso} accessibilityState={{ selected: iso === dateISO }} onPress={() => calendar.handleDayTap(iso)} style={[s.day, { backgroundColor: iso === dateISO ? "#EDE9FE" : "transparent" }]}><Text style={s.buttonText}>{i + 1}</Text></TouchableOpacity>; })}
        </View>
        {button(label("Cerrar calendario", "Close calendar"), calendar.closeMonthGridManual)}
      </View>}
      <Text style={s.label}>{label("A quién afecta", "Applies to")}</Text>
      <View style={s.wrap}>{button(label("Toda la empresa", "Whole business"), () => setStaffId(null), "calendar-exception-business", staffId === null, saving)}
        {staff.map(person => button(person.name, () => setStaffId(person.id), `calendar-exception-staff-${person.id}`, staffId === person.id, saving))}</View>
      {loading && <Text accessibilityRole="progressbar" style={s.description}>{label("Consultando disponibilidad…", "Loading availability…")}</Text>}
      {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {button(label("Recargar", "Reload"), () => setReload(r => r + 1), "calendar-exception-reload", false, loading || saving)}
      {readyData && <>
        <Text style={s.label}>{label("Disponibilidad de esta fecha", "Availability on this date")}</Text>
        <Text testID="calendar-exception-open-summary" style={s.summary}>{label("Abierto: ", "Open: ")}{readyData.day.openIntervals.map(r => calendarRangeLabel(r, zone, dateISO)).join(" · ") || label("ningún intervalo", "no intervals")}</Text>
        <Text testID="calendar-exception-closed-summary" style={s.summary}>{label("Cerrado: ", "Closed: ")}{readyData.day.closedIntervals.map(r => calendarRangeLabel(r, zone, dateISO)).join(" · ") || label("ningún intervalo", "no intervals")}</Text>
        <View style={s.wrap}>{button(label("Día completo", "Full day"), () => add("day"), "calendar-exception-add-day", false, disabled)}{button(label("Mañana", "Morning"), () => add("morning"), "calendar-exception-add-morning", false, disabled)}{button(label("Tarde", "Afternoon"), () => add("afternoon"), "calendar-exception-add-afternoon", false, disabled)}{button(label("Otras horas", "Custom hours"), () => add("hours"), "calendar-exception-add-hours", false, disabled)}</View>
        {draft.map((row, index) => <View key={index} testID={`calendar-exception-interval-${index}`} style={s.interval}>
          <View style={s.wrap}>{button(label("Cierre", "Closure"), () => edit(index, { kind: "closed" }), `calendar-exception-close-${index}`, row.kind === "closed", disabled)}{button(label("Apertura excepcional", "Exceptional opening"), () => edit(index, { kind: "open" }), `calendar-exception-open-${index}`, row.kind === "open", disabled)}</View>
          <View pointerEvents={disabled ? "none" : "auto"} style={s.row}>
            <View style={s.time}><GoTimeField label={label("Desde", "From")} value={calendarMinuteLabel(row.startMinute)} onConfirm={value => edit(index, { startMinute: minute(value) })} minuteStep={1} accentColor={color} /></View>
            <View style={s.time}>{row.endMinute === 1440 ? button(label("Hasta 24:00", "Until 24:00"), () => edit(index, { endMinute: 1380 })) : <GoTimeField label={label("Hasta", "Until")} value={calendarMinuteLabel(row.endMinute)} onConfirm={value => edit(index, { endMinute: minute(value) })} minuteStep={1} accentColor={color} />}</View>
          </View>
          <View style={s.wrap}>{row.endMinute !== 1440 && button(label("Hasta fin del día (24:00)", "Until end of day (24:00)"), () => edit(index, { endMinute: 1440 }), undefined, false, disabled)}{button(label("Quitar intervalo", "Remove interval"), () => setDraft(rows => rows.filter((_, i) => i !== index)), `calendar-exception-remove-${index}`, false, disabled)}</View>
        </View>)}
        {button(saving ? label("Guardando…", "Saving…") : label("Guardar excepción", "Save exception"), () => { void persist(); }, "calendar-exception-save", true, disabled || !draft.length)}
        {!!current && button(label("Eliminar excepción y recuperar horario habitual", "Delete exception and restore weekly hours"), () => Alert.alert(label("Eliminar excepción", "Delete exception"), label("Se recuperará el horario habitual solo para esta fecha. Las reservas se conservan.", "Restore weekly hours for this date only. Existing bookings remain unchanged."), [{ text: label("Volver", "Back"), style: "cancel" }, { text: label("Eliminar", "Delete"), style: "destructive", onPress: () => { void persist(true); } }]), "calendar-exception-delete", false, disabled)}
        {!!current?.conflicts.length && <View testID="calendar-exception-conflicts" style={s.conflicts}><Text style={s.label}>{label("Reservas afectadas: no se cancelan automáticamente", "Affected bookings: no automatic cancellations")}</Text>
          {current.conflicts.map(booking => <Text key={booking.bookingId} style={s.summary}>{booking.customerName || label("Reserva", "Booking")} · {booking.serviceName} · {calendarRangeLabel(booking, zone, dateISO)}{booking.staffName ? ` · ${booking.staffName}` : ""}</Text>)}
          {onManageConflicts && button(label("Gestionar en Calendario", "Manage in Calendar"), () => onManageConflicts(dateISO), "calendar-exception-manage-conflicts")}
        </View>}
        <Text accessibilityRole="header" style={s.label}>{label("Próximas excepciones", "Upcoming exceptions")}</Text>
        {readyData.exceptions.filter(e => e.dateISO >= calendarToday(zone)).map(exception => <TouchableOpacity key={exception.id} testID={`calendar-exception-saved-${exception.id}`} accessibilityRole="button" disabled={saving} onPress={() => { setStaffId(exception.staffId); selectDate(exception.dateISO); }} style={s.interval}>
          <Text style={s.label}>{exception.dateISO.split("-").reverse().join("/")} · {exception.staffId ? staff.find(person => person.id === exception.staffId)?.name || label("Profesional", "Professional") : label("Toda la empresa", "Whole business")}</Text>
          {exception.intervals.map((i, n) => <Text key={n} style={s.summary}>{i.kind === "open" ? label("Abierto", "Open") : label("Cerrado", "Closed")} {calendarMinuteLabel(i.startMinute)}–{calendarMinuteLabel(i.endMinute)}</Text>)}
        </TouchableOpacity>)}
        {!readyData.exceptions.some(e => e.dateISO >= calendarToday(zone)) && <Text style={s.description}>{label("Sin excepciones futuras.", "No upcoming exceptions.")}</Text>}
      </>}
    </>}
  </View>;
}
const s = StyleSheet.create({
  section: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#E5E7EB", borderRadius: 16, padding: 16, marginTop: 16, gap: 10 },
  title: { color: "#111827", fontWeight: "700", fontSize: 15 }, label: { color: "#1F2937", fontWeight: "600", fontSize: 13 },
  description: { color: "#4B5563", fontSize: 13, lineHeight: 19 }, summary: { color: "#374151", fontSize: 13, lineHeight: 19 },
  button: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  buttonText: { color: "#1F2937", fontSize: 13, fontWeight: "600", textAlign: "center" },
  row: { flexDirection: "row", alignItems: "center", gap: 8 }, wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  time: { flex: 1, minWidth: 0 }, interval: { borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 12, padding: 10, gap: 8 },
  error: { color: "#B91C1C", fontSize: 13, lineHeight: 19 }, picker: { gap: 8 }, grid: { flexDirection: "row", flexWrap: "wrap" },
  day: { width: "14.285714%", minHeight: 44, alignItems: "center", justifyContent: "center", textAlign: "center", textAlignVertical: "center" },
  conflicts: { borderWidth: 1, borderColor: "#D97706", borderRadius: 10, padding: 10, gap: 8 },
});
