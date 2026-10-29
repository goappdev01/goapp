import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { isNoteReminderMinutes, noteReminderLabel } from "@/lib/goNoteTools";
import { GoNoteToolFooter, type NoteToolEdit } from "./GoNoteToolFooter";

/** Only the current note's offset; opening never focuses an input or edits other notes. */
export function GoNoteReminderPicker({ value, onChange, english = false, busy = false, dateISO, time, light = false, onInputFocus, unified=false, handedness="right", onPendingChange }: {
  value: number | null; onChange: (minutes: number | null) => void; english?: boolean; busy?: boolean;
  dateISO?: string; time?: string; light?: boolean; onInputFocus?: TextInputProps["onFocus"];
  unified?:boolean; handedness?:"left"|"right"; onPendingChange?:(edit:NoteToolEdit<number>)=>void;
}) {
  const foreground = light ? "#17212b" : "#ffffff", border = light ? "#89949d" : "rgba(255,255,255,0.35)", warning = light ? "#8a3d0a" : "#fbbf24";
  const [hours, setHours] = useState(String(Math.floor((value || 0) / 60)));
  const [minutes, setMinutes] = useState(String((value || 0) % 60));
  const [error, setError] = useState("");
  const [touched,setTouched]=useState(false);
  useEffect(() => { setHours(String(Math.floor((value || 0) / 60))); setMinutes(String((value || 0) % 60)); setError("");setTouched(false); }, [value]);
  const total = Number(hours || "0") * 60 + Number(minutes || "0");
  const valid = /^\d{0,4}$/.test(hours) && /^\d{0,2}$/.test(minutes) && Number(minutes || "0") < 60
    && (total === 0 || isNoteReminderMinutes(total));
  const toolValid=valid&&/^\d{1,4}$/.test(hours)&&/^\d{1,2}$/.test(minutes)&&total>0;
  const invalid="Introduce un aviso entre un minuto y un año, con minutos de 00 a 59.";
  useEffect(()=>{onPendingChange?.({changed:touched&&(!toolValid||total!==value),value:toolValid?total:undefined,error:toolValid?undefined:invalid});},[hours,minutes,touched,value,onPendingChange]);
  const at = dateISO && time ? Date.parse(`${dateISO}T${time}:00`) : NaN;
  return <View testID="note-reminder-picker" style={{ marginTop: 10, gap: 10, padding: 12,
    borderRadius: 12, backgroundColor: light ? "rgba(240,243,245,0.94)" : "#1a1a1c", borderWidth: 1, borderColor: light ? border : "rgba(251,191,36,0.40)" }}>
    <Text style={{ color: foreground, fontSize: 13, fontWeight: "700" }}>{english ? "REMIND ME BEFORE" : "AVISARME ANTES"}</Text>
    <View style={{ flexDirection: "row", gap: 12 }}>
      {[[english ? "HOURS" : "HORAS", hours, setHours, 4], [english ? "MINUTES" : "MINUTOS", minutes, setMinutes, 2]].map(([label, text, setter, length]) =>
        <View key={label as string} style={{ flex: 1, gap: 5 }}>
          <Text style={{ color: foreground, fontSize: 12 }}>{label as string}</Text>
          <TextInput testID={length === 4 ? "note-reminder-hours" : "note-reminder-minutes"}
            accessibilityLabel={label as string} value={text as string} onChangeText={text=>{(setter as (text:string)=>void)(text);setTouched(true);}}
            onFocus={onInputFocus} keyboardType="number-pad" maxLength={length as number} selectTextOnFocus editable={!busy}
            style={{ minHeight: 48, borderRadius: 8, borderWidth: 1, borderColor: border,
              color: foreground, fontSize: 22, textAlign: "center", paddingHorizontal: 10 }} />
        </View>)}
    </View>
    <Text accessibilityLiveRegion="polite" style={{ color: warning, fontSize: 12 }}>{valid
      ? total ? noteReminderLabel(total, english) : english ? "No reminder" : "Sin aviso"
      : english ? "Enter valid hours and minutes from 00 to 59." : "Introduce horas válidas y minutos entre 00 y 59."}</Text>
    {(!unified||!Number.isFinite(at)||at<=Date.now())&&<Text style={{ color: light ? "#515d69" : "rgba(255,255,255,0.75)", fontSize: 12 }}>{!Number.isFinite(at)
      ? english ? "Choose a date and time to schedule it. Your interval is retained." : "Elige fecha y hora para programar el aviso. El intervalo se conserva."
      : at <= Date.now() ? english ? "Choose a future date and time to schedule it." : "Elige una fecha y hora futuras para programar el aviso."
        : english ? "The notification also requires permission on this phone." : "La notificación también requiere permiso en este teléfono."}</Text>}
    {!!error && <Text accessibilityRole="alert" style={{ color: warning, fontSize: 12 }}>{error}</Text>}
    {unified?<View style={{marginHorizontal:-12}}><GoNoteToolFooter testID="note-reminder-confirm" removeID="note-reminder-none" handedness={handedness} disabled={busy} onSave={()=>{if(!toolValid){setError(invalid);return;}onChange(total);}} onRemove={value!==null?()=>onChange(null):undefined} removeLabel="QUITAR AVISO"/></View>:<View style={{ flexDirection: "row", gap: 10, flexWrap: light ? "wrap" : undefined }}>
      <TouchableOpacity testID="note-reminder-none" accessibilityRole="button" disabled={busy} onPress={() => onChange(null)}
        style={{ flex: 1, minWidth: light ? 140 : undefined, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 8, borderWidth: 1, borderColor: border }}>
        <Text style={{ color: foreground, fontSize: 12 }}>{english ? "NO REMINDER" : "SIN AVISO"}</Text>
      </TouchableOpacity>
      <TouchableOpacity testID="note-reminder-confirm" accessibilityRole="button" disabled={busy} onPress={() => {
        if (!valid) { setError(english ? "Invalid interval." : "El intervalo no es válido."); return; }
        onChange(total || null);
      }} style={{ flex: 1, minWidth: light ? 140 : undefined, minHeight: 44, justifyContent: "center", alignItems: "center", borderRadius: 8, backgroundColor: "#fbbf24" }}>
        <Text style={{ color: "#0e0e10", fontSize: 12, fontWeight: "700" }}>{english ? "CONFIRM" : "CONFIRMAR"}</Text>
      </TouchableOpacity>
    </View>}
  </View>;
}
