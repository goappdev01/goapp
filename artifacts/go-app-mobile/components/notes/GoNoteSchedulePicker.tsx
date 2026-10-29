import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View, type TextInputProps } from "react-native";
import { validNoteTime, NOTE_MAX_DURATION_MINUTES } from "@/lib/unifiedNotes";
import { durationMinutes } from "@/lib/goActionCompletion";
const pad=(value:number)=>String(value).padStart(2,"0");
export const noteDurationLabel=(value:string)=>/^\d+m$/.test(value)?`${parseInt(value)} minutos`:/^\d+h$/.test(value)?`${parseInt(value)} ${parseInt(value)===1?"hora":"horas"}`:value;
type Props={value:string;onApply:(value:string)=>void;onClear:()=>void;disabled?:boolean;onInputFocus?:TextInputProps["onFocus"]};
function numbers(kind:"time"|"duration",hours:string,minutes:string,setHours:(value:string)=>void,setMinutes:(value:string)=>void,disabled:boolean,onFocus?:TextInputProps["onFocus"]){
 return <View style={s.row}>{[["HORAS",hours,setHours,kind==="time"?2:4,"hour"],["MINUTOS",minutes,setMinutes,2,"minute"]].map(([label,value,set,length,key])=><View key={key as string} style={{flex:1,gap:4}}>
  <Text style={s.label}>{label as string}</Text><TextInput testID={`note-${kind}-${key}`} accessibilityLabel={(kind==="time"?"Hora: ":"Duración: ")+label} value={value as string} onChangeText={set as (value:string)=>void} onFocus={onFocus} keyboardType="number-pad" inputMode="numeric" maxLength={length as number} selectTextOnFocus editable={!disabled} style={s.input}/>
 </View>)}</View>;
}
export function GoNoteTimePicker({value,onApply,onClear,disabled=false,onInputFocus}:Props){
 const initial=validNoteTime(value)?value.split(":").map(Number):[0,0], [hour,setHour]=useState(pad(initial[0])),[minute,setMinute]=useState(pad(initial[1])),[error,setError]=useState("");
 const exact=`${/^\d{1,2}$/.test(hour)?pad(Number(hour)):"--"}:${/^\d{1,2}$/.test(minute)?pad(Number(minute)):"--"}`;
 return <View testID="note-time-picker" style={s.form}>
  <Text testID="note-time-preview" accessibilityLiveRegion="polite" style={s.preview}>{exact}</Text>
  {numbers("time",hour,minute,setHour,setMinute,disabled,onInputFocus)}
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  <View style={s.row}>
   <TouchableOpacity testID="note-time-apply" accessibilityRole="button" disabled={disabled} onPress={()=>{if(!/^\d{1,2}$/.test(hour)||!/^\d{1,2}$/.test(minute)||!validNoteTime(exact)){setError("Introduce horas de 00 a 23 y minutos de 00 a 59.");return;}setError("");onApply(exact);}} style={[s.button,s.selected]}><Text style={s.label}>APLICAR HORA</Text></TouchableOpacity>
   <TouchableOpacity testID="note-time-clear" accessibilityRole="button" disabled={disabled} onPress={onClear} style={s.button}><Text style={s.label}>SIN HORA</Text></TouchableOpacity>
  </View>
 </View>;
}
export function GoNoteDurationPicker({value,onApply,onClear,disabled=false,onInputFocus}:Props){
 const initial=durationMinutes(value)||0,[hours,setHours]=useState(String(Math.floor(initial/60))),[minutes,setMinutes]=useState(pad(initial%60)),[error,setError]=useState("");
 const total=Number(hours||"0")*60+Number(minutes||"0"),valid=/^\d{0,4}$/.test(hours)&&/^\d{0,2}$/.test(minutes)&&Number(minutes||"0")<60&&total>0&&total<=NOTE_MAX_DURATION_MINUTES;
 return <View testID="note-duration-picker" style={s.form}>
  <View style={[s.row,{flexWrap:"wrap"}]}>{["15m","30m","1h","2h"].map(option=>{const amount=durationMinutes(option)!;return <TouchableOpacity key={option} testID={"note-duration-"+option} accessibilityRole="radio" accessibilityState={{checked:valid&&total===amount}} disabled={disabled} onPress={()=>{setHours(String(Math.floor(amount/60)));setMinutes(pad(amount%60));setError("");}} style={[s.shortcut,valid&&total===amount&&s.selected]}><Text style={s.label}>{option.replace("m"," min").replace("h"," h")}</Text></TouchableOpacity>;})}</View>
  {numbers("duration",hours,minutes,setHours,setMinutes,disabled,onInputFocus)}
  <Text testID="note-duration-preview" accessibilityLiveRegion="polite" style={s.label}>{valid?`${Math.floor(total/60)} h ${pad(total%60)} min`:"Elige una duración"}</Text>
  {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
  <View style={s.row}>
   <TouchableOpacity testID="note-duration-apply" accessibilityRole="button" disabled={disabled} onPress={()=>{if(!valid){setError("Introduce de 0 a 9999 horas y de 00 a 59 minutos; la duración debe ser mayor que cero.");return;}setError("");onApply(total%60===0?`${total/60}h`:`${total}m`);}} style={[s.button,s.selected]}><Text style={s.label}>APLICAR DURACIÓN</Text></TouchableOpacity>
   <TouchableOpacity testID="note-duration-clear" accessibilityRole="button" disabled={disabled} onPress={onClear} style={s.button}><Text style={s.label}>SIN DURACIÓN</Text></TouchableOpacity>
  </View>
 </View>;
}
const s=StyleSheet.create({form:{gap:8},row:{flexDirection:"row",gap:8},label:{color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center"},preview:{color:"#17212b",fontSize:20,fontWeight:"700",textAlign:"center"},input:{minHeight:52,fontSize:22,color:"#17212b",textAlign:"center",borderWidth:1,borderColor:"#a5b0b8",borderRadius:12,backgroundColor:"#ffffff",padding:8},button:{flex:1,minHeight:44,padding:8,borderRadius:12,borderWidth:1,borderColor:"#a5b0b8",backgroundColor:"#eef3f5",alignItems:"center",justifyContent:"center"},shortcut:{flexGrow:1,flexBasis:"22%",minWidth:62,minHeight:44,padding:6,borderRadius:12,borderWidth:1,borderColor:"#a5b0b8",backgroundColor:"#eef3f5",alignItems:"center",justifyContent:"center"},selected:{backgroundColor:"#d6f1df",borderColor:"#16834a"},error:{color:"#8a3d0a",fontSize:12}});
