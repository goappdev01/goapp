import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { validNoteTime } from "@/lib/unifiedNotes";
const pad=(value:number)=>String(value).padStart(2,"0");
export const noteDurationLabel=(value:string)=>/^\d+m$/.test(value)?`${parseInt(value)} minutos`:/^\d+h$/.test(value)?`${parseInt(value)} ${parseInt(value)===1?"hora":"horas"}`:value;

/** Independent tactile columns. Only APLICAR HORA changes the note's draft. */
export function GoNoteTimePicker({value,onApply,onClear,disabled=false}:{value:string;onApply:(value:string)=>void;onClear:()=>void;disabled?:boolean}){
 const initial=validNoteTime(value)?value.split(":").map(Number):[0,0], [hour,setHour]=useState(initial[0]),[minute,setMinute]=useState(initial[1]);
 const exact=`${pad(hour)}:${pad(minute)}`;
 return <View testID="note-time-picker" style={{flex:1,gap:10,minHeight:0}}>
  <View style={{flexDirection:"row",alignItems:"center",gap:8}}><Text testID="note-time-preview" accessibilityLiveRegion="polite" style={{flex:1,color:"#17212b",fontSize:24,fontWeight:"700",textAlign:"center"}}>{exact}</Text><TouchableOpacity testID="note-time-clear" accessibilityRole="button" disabled={disabled} onPress={onClear} style={s.button}><Text style={s.label}>SIN HORA</Text></TouchableOpacity></View>
  <View style={{flexDirection:"row",gap:12,flex:1,minHeight:88,maxHeight:176}}>
   {([{key:"hour",label:"HORAS",count:24,value:hour,set:setHour},{key:"minute",label:"MINUTOS",count:60,value:minute,set:setMinute}]).map(column=><View key={column.key} style={{flex:1,gap:6,minHeight:0}}>
    <Text style={s.label}>{column.label}</Text>
    <ScrollView testID={"note-time-"+column.key+"-list"} style={{flex:1}} contentOffset={{x:0,y:(column.key==="hour"?initial[0]:initial[1])*44}} nestedScrollEnabled bounces={false} overScrollMode="never" snapToInterval={44} decelerationRate="fast" keyboardShouldPersistTaps="handled">
     {Array.from({length:column.count},(_,number)=><TouchableOpacity key={number} testID={`note-time-${column.key}-${pad(number)}`} accessibilityRole="radio" accessibilityLabel={`${column.label}: ${pad(number)}`} accessibilityState={{checked:column.value===number}} disabled={disabled} onPress={()=>column.set(number)} style={[s.number,column.value===number&&s.selected]}><Text style={{color:"#17212b",fontSize:18,textAlign:"center"}}>{pad(number)}</Text></TouchableOpacity>)}
    </ScrollView>
   </View>)}
  </View>
  <TouchableOpacity testID="note-time-apply" accessibilityRole="button" disabled={disabled} onPress={()=>{if(validNoteTime(exact))onApply(exact);}} style={[s.button,s.selected]}><Text style={s.label}>APLICAR HORA</Text></TouchableOpacity>
 </View>;
}
export function GoNoteDurationPicker({value,onApply,onClear,disabled=false}:{value:string;onApply:(value:string)=>void;onClear:()=>void;disabled?:boolean}){
 const [selected,setSelected]=useState(value),options=["15m","30m","1h","2h"];
 if(value&&!options.includes(value))options.push(value);
 return <View testID="note-duration-picker" style={{flex:1,gap:10,minHeight:0}}>
  <ScrollView testID="note-duration-options" style={{flex:1}} contentContainerStyle={{gap:10}} bounces={false} overScrollMode="never" keyboardShouldPersistTaps="handled">
  {options.map(option=><TouchableOpacity key={option} testID={"note-duration-"+option} accessibilityRole="radio" accessibilityState={{checked:selected===option}} disabled={disabled} onPress={()=>setSelected(option)} style={[s.button,selected===option&&s.selected]}><Text style={s.label}>{noteDurationLabel(option)}</Text></TouchableOpacity>)}
  </ScrollView>
  <TouchableOpacity testID="note-duration-apply" accessibilityRole="button" disabled={disabled||!selected} onPress={()=>{if(selected)onApply(selected);}} style={[s.button,s.selected]}><Text style={s.label}>APLICAR DURACIÓN</Text></TouchableOpacity>
  <TouchableOpacity testID="note-duration-clear" accessibilityRole="button" disabled={disabled} onPress={onClear} style={s.button}><Text style={s.label}>SIN DURACIÓN</Text></TouchableOpacity>
 </View>;
}
const s=StyleSheet.create({label:{color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center"},number:{height:44,justifyContent:"center",borderRadius:10,borderWidth:1,borderColor:"#bec8cf",backgroundColor:"#f1f4f6"},button:{minHeight:44,padding:10,borderRadius:12,borderWidth:1,borderColor:"#a5b0b8",backgroundColor:"#eef3f5",alignItems:"center",justifyContent:"center"},selected:{backgroundColor:"#d6f1df",borderColor:"#16834a"}});
