import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";
import { useGoCalendarFlow } from "@/hooks/useGoCalendarFlow";
import { GoTimeField } from "@/components/ui/GoTimePicker";
import { isCloudId } from "@/data/booking";
import { calendarMinuteLabel, calendarToday, resolveCalendarExceptionBusiness } from "@/data/calendarExceptions";
import { manageBookingDiscount, parseDiscountPercent, type BookingDiscount, type BookingDiscountList } from "@/data/bookingDiscounts";
import { captureAuthIdentity, isAuthIdentityCurrent, type AuthIdentity } from "@/lib/authSession";
import { onSessionChanged } from "@/lib/sessionEvents";
import { formatISODate } from "@/lib/time";

const toMinute = (text: string) => Number(text.slice(0, 2)) * 60 + Number(text.slice(3, 5));
const describeError = (error: unknown) => error instanceof Error ? error.message : "No se pudo comprobar la promoción.";
type Editor = { row?: BookingDiscount; from: number; to: number; percent: string; services: string[] | null; active: boolean };

export function BookingDiscountSection({ sourceId, color }: { sourceId: string; color: string }) {
  const { lang } = useLanguage();
  const l = (es: string, en: string) => lang === "en" ? en : es;
  const calendar = useGoCalendarFlow();
  const [data, setData] = useState<BookingDiscountList>();
  const [date, setDate] = useState<string>();
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const scope = useRef<{ businessId: string; identity: AuthIdentity } | null>(null);
  const mutation = useRef(false);

  useEffect(() => onSessionChanged(() => {
    scope.current = null; setData(undefined); setEditor(undefined); setDate(undefined);
    setRevision(value => value + 1);
  }), []);
  useEffect(() => {
    let active = true;
    scope.current = null; setBusy(true); setData(undefined); setError("");
    void (async () => {
      try {
        const identity = await captureAuthIdentity();
        if (!identity) throw Error(l("Inicia sesión.", "Sign in."));
        const businessId = isCloudId(sourceId) ? sourceId : (await resolveCalendarExceptionBusiness(sourceId, identity.userId)).businessId;
        const result = await manageBookingDiscount<BookingDiscountList>(businessId, "list", identity.userId);
        if (!active || !await isAuthIdentityCurrent(identity) || !active) return;
        scope.current = { businessId, identity };
        setData(result); setDate(previous => previous ?? calendarToday(result.timezone));
      } catch (cause) { if (active) setError(describeError(cause)); }
      finally { if (active) setBusy(false); }
    })();
    return () => { active = false; scope.current = null; };
  }, [sourceId, revision]);

  const change = (patch: Partial<Editor>) => setEditor(previous => previous && ({ ...previous, ...patch }));
  const save = async (action: "create" | "update" | "delete", input: object) => {
    const current = scope.current;
    if (!current || mutation.current) return;
    mutation.current = true; setBusy(true); setError("");
    try {
      await manageBookingDiscount(current.businessId, action, current.identity.userId, input);
      if (scope.current !== current || !await isAuthIdentityCurrent(current.identity) || scope.current !== current) return;
      const updated = await manageBookingDiscount<BookingDiscountList>(current.businessId, "list", current.identity.userId);
      if (scope.current === current) { setData(updated); setEditor(undefined); }
    } catch (cause) { if (scope.current === current) setError(describeError(cause)); }
    finally { mutation.current = false; if (scope.current === current) setBusy(false); }
  };
  const saveEditor = () => {
    if (!editor || !date) return;
    const basisPoints = parseDiscountPercent(editor.percent);
    if (basisPoints === null || editor.to <= editor.from || editor.services?.length === 0) {
      setError(l("Indica una franja válida, un porcentaje entre 0 y 100 y al menos un servicio si no eliges todos.",
        "Choose a valid interval, a percentage between 0 and 100, and at least one service if not applying to all.")); return;
    }
    void save(editor.row ? "update" : "create", {
      ...(editor.row && { id: editor.row.id, revision: editor.row.revision }),
      dateISO: date, startMinute: editor.from, endMinute: editor.to, basisPoints, serviceIds: editor.services, active: editor.active,
    });
  };
  const button = (title: string, onPress: () => void, disabled = busy) =>
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={[s.button, { borderColor: color, opacity: disabled ? .5 : 1 }]}>
      <Text style={s.text}>{title}</Text>
    </TouchableOpacity>;
  const year = calendar.monthGridYear, month = calendar.monthGridMonth;
  const dates = Array.from({ length: new Date(year, month + 1, 0).getDate() },
    (_, index) => formatISODate(new Date(year, month, index + 1, 12)));
  const all = l("Todos los servicios", "All services");
  const rows = data?.promotions.filter(row => row.dateISO === date) ?? [];
  return <View style={[s.panel, { borderColor: color }]} testID="booking-discounts-panel">
    <Text style={s.title}>{l("Descuentos por fecha y horario", "Discounts by date and time")}</Text>
    <Text style={s.text}>{l("Se aplica un solo descuento por servicio. Para guardar una franja que coincide, desactiva o modifica la promoción anterior.",
      "One discount applies per service. Edit or deactivate the previous promotion before saving an overlapping one.")}</Text>
    {!!error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    {!data && !busy && button(l("Volver a cargar", "Reload"), () => setRevision(value => value + 1))}
    {data && date && <>
      <Text style={s.title}>{l("FECHA", "DATE")} · {data.timezone}</Text>
      {button(date.split("-").reverse().join("/"), () => calendar.openForNav({
        initialDateISO: date, onDaySelect: next => { setDate(next); if (editor?.row) setEditor(undefined); setError(""); },
      }))}
      {calendar.monthGridOpen && <View style={s.calendar}>
        <View style={s.row}>{button("‹", () => calendar.navigateMonth(-1))}
          <Text style={s.text}>{String(month + 1).padStart(2, "0")} / {year}</Text>
          {button("›", () => calendar.navigateMonth(1))}</View>
        <View style={s.days}>{dates.map((day, i) => <TouchableOpacity key={day} accessibilityRole="button" accessibilityLabel={day}
          accessibilityState={{ selected: date === day }} onPress={() => calendar.handleDayTap(day)}
          style={[s.day, date === day && { borderColor: color, borderWidth: 2 }]}><Text style={s.text}>{i + 1}</Text></TouchableOpacity>)}</View>
        {button(l("Cerrar calendario", "Close calendar"), calendar.closeMonthGridManual)}
      </View>}
      {rows.map(row => <View key={row.id} style={s.entry}>
        <Text style={s.title}>{calendarMinuteLabel(row.startMinute)}–{calendarMinuteLabel(row.endMinute)} · {row.basisPoints / 100} %</Text>
        <Text style={s.text}>{row.serviceIds?.map(id => data.services.find(service => service.id === id)?.name ?? l("Servicio no disponible", "Unavailable service")).join(" · ") ?? all}</Text>
        <Text style={s.text}>{row.active ? l("Activa", "Active") : l("Inactiva", "Inactive")}</Text>
        <View style={s.row}>{button(l("Editar", "Edit"), () => setEditor({row,from:row.startMinute,to:row.endMinute,
          percent:String(row.basisPoints / 100),services:row.serviceIds,active:row.active}))}
          {button(l("Eliminar", "Delete"), () => Alert.alert(l("Eliminar promoción", "Delete promotion"),
            l("Dejará de aplicarse a nuevas reservas.", "It will stop applying to new bookings."), [
              {text:l("Cancelar", "Cancel"),style:"cancel"},
              {text:l("Eliminar", "Delete"),style:"destructive",onPress:()=>void save("delete",{id:row.id,revision:row.revision})},
            ]))}</View>
      </View>)}
      {!rows.length && <Text style={s.text}>{l("Sin promociones para esta fecha.", "No promotions on this date.")}</Text>}
      {!editor && button(l("Nueva promoción", "New promotion"), () => setEditor({from:540,to:780,percent:"",services:null,active:true}))}
      {editor && <View style={s.entry}>
        <Text style={s.title}>{l("HORARIO", "TIME")}</Text>
        <GoTimeField label={l("Inicio", "Start")} value={calendarMinuteLabel(editor.from)} minuteStep={1} accentColor={color} onConfirm={v => change({ from: toMinute(v) })} />
        <GoTimeField label={l("Fin", "End")} value={calendarMinuteLabel(Math.min(editor.to, 1439))} minuteStep={1} accentColor={color} onConfirm={v => change({ to: toMinute(v) })} />
        {button(editor.to === 1440 ? l("Fin seleccionado: 24:00", "Selected end: 24:00") : l("Terminar a las 24:00", "End at 24:00"), () => change({ to: 1440 }))}
        <Text style={s.title}>{l("DESCUENTO (%)", "DISCOUNT (%)")}</Text>
        <TextInput accessibilityLabel={l("Porcentaje de descuento", "Discount percentage")} value={editor.percent}
          onChangeText={percent => change({percent})} keyboardType="decimal-pad" maxLength={6} style={s.input} />
        <Text style={s.title}>{l("SERVICIOS AFECTADOS", "ELIGIBLE SERVICES")}</Text>
        <View style={s.row}><Text style={s.text}>{all}</Text><Switch accessibilityLabel={all} value={editor.services === null}
          onValueChange={value => change({services:value ? null : []})} /></View>
        {editor.services && data.services.map(service => <View key={service.id} style={s.row}>
          <Text style={[s.text, {flex:1}]}>{service.name}</Text>
          <Switch accessibilityLabel={service.name} value={editor.services?.includes(service.id)} onValueChange={value =>
            change({ services:value ? [...editor.services!, service.id] : editor.services!.filter(id => id !== service.id) })} />
        </View>)}
        <View style={s.row}><Text style={s.text}>{l("Promoción activa", "Active promotion")}</Text>
          <Switch accessibilityLabel={l("Promoción activa", "Active promotion")} value={editor.active} onValueChange={active => change({active})} /></View>
        <View style={s.row}>{button(l("Cancelar", "Cancel"), () => setEditor(undefined))}
          {button(l("Guardar promoción", "Save promotion"), saveEditor)}</View>
      </View>}
    </>}
  </View>;
}

const s = StyleSheet.create({
  panel:{borderWidth:1,borderRadius:14,padding:12,gap:10,backgroundColor:"#fff"},
  title:{color:"#182033",fontSize:15,fontWeight:"700"},text:{color:"#27344a",fontSize:14},
  error:{color:"#b91c1c"},button:{minHeight:44,paddingHorizontal:10,paddingVertical:6,borderWidth:1,borderRadius:8,justifyContent:"center"},
  row:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8,flexWrap:"wrap"},
  entry:{borderWidth:1,borderColor:"#d9dfeb",borderRadius:10,padding:10,gap:8},
  calendar:{gap:8},days:{flexDirection:"row",flexWrap:"wrap"},day:{minWidth:44,minHeight:44,borderRadius:8,alignItems:"center",justifyContent:"center"},
  input:{minHeight:44,borderWidth:1,borderColor:"#64748b",borderRadius:8,color:"#182033",paddingHorizontal:10},
});
