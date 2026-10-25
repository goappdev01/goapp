import React, {useState} from "react";
import {Alert, Switch, Text, TextInput, TouchableOpacity, View} from "react-native";
import {useLanguage} from "@/contexts/LanguageContext";
import {validateBookingGapPolicy,type BookingGapPolicy} from "@/data/serviceTiming";

/** Authorization only. The minimum and admission decision always belong to SQL. */
export function ProfessionalGapPolicy({value,onChange,color}:{value?:BookingGapPolicy;onChange:(value:BookingGapPolicy)=>void;color:string}){
 const {lang}=useLanguage(),label=(es:string,en:string)=>lang==="en"?en:es;
 const policy=value??{allowLastMinuteGaps:false,lastMinuteMinutes:1440};
 const [hours,setHours]=useState("");
 const save=(minutes:number,enabled=policy.allowLastMinuteGaps)=>{
  try{onChange(validateBookingGapPolicy({allowLastMinuteGaps:enabled,lastMinuteMinutes:minutes}));}
  catch(error){Alert.alert("GO",error instanceof Error?error.message:label("Revisa el intervalo.","Check the interval."));}
 };
 return <View testID="professional-gap-policy" style={{gap:8,paddingVertical:8}}>
  <Text style={{color:"#aaa",fontSize:12}}>{label("El mínimo se calcula automáticamente con los servicios asignados y reservables.","The minimum is calculated automatically from assigned, bookable services.")}</Text>
  <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
   <Text style={{color:"#eee",fontSize:12,flex:1}}>{label("PERMITIR HUECOS EXCEPCIONALES DE ÚLTIMA HORA","ALLOW LAST-MINUTE EXCEPTIONAL GAPS")}</Text>
   <Switch testID="professional-gap-enabled" accessibilityLabel={label("Permitir huecos excepcionales de última hora","Allow last-minute exceptional gaps")} value={policy.allowLastMinuteGaps} onValueChange={enabled=>save(policy.lastMinuteMinutes,enabled)}/>
  </View>
  {policy.allowLastMinuteGaps&&<>
   <View style={{flexDirection:"row",gap:6}}>{[24,12,6,3].map(h=><TouchableOpacity key={h} accessibilityRole="button" accessibilityState={{selected:policy.lastMinuteMinutes===h*60}}
    accessibilityLabel={h+label(" horas antes"," hours before")} onPress={()=>{setHours("");save(h*60);}}
    style={{flex:1,minHeight:44,borderWidth:1,borderColor:policy.lastMinuteMinutes===h*60?color:"#555",borderRadius:8,alignItems:"center",justifyContent:"center"}}>
    <Text style={{color:"#eee",fontSize:12}}>{h} h</Text></TouchableOpacity>)}</View>
   <TextInput testID="professional-gap-custom" keyboardType="decimal-pad" accessibilityLabel={label("Otro intervalo de excepción en horas","Other exception interval in hours")}
    placeholder={label("Otro intervalo (horas)","Other interval (hours)")} placeholderTextColor="#999" value={hours}
    onChangeText={setHours} onEndEditing={()=>{if(hours.trim())save(Number(hours.replace(",","."))*60);}}
    style={{color:"#eee",minHeight:44,borderWidth:1,borderColor:"#555",borderRadius:8,paddingHorizontal:10}}/>
   <Text style={{color:"#aaa",fontSize:12}}>{label("Autorizado hasta ","Authorized up to ")}{policy.lastMinuteMinutes/60}{label(" h antes del inicio. Se mantienen horarios, descansos, disponibilidad y confirmaciones."," h before the start. Working hours, breaks, availability and confirmations still apply.")}</Text>
  </>}
 </View>;
}
