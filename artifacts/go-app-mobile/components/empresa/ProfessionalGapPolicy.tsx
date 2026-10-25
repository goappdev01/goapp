import React, {useRef,useState} from "react";
import {Feather} from "@expo/vector-icons";
import {Alert, Switch, Text, TextInput, TouchableOpacity, View} from "react-native";
import {useLanguage} from "@/contexts/LanguageContext";
import {validateBookingGapPolicy,type BookingGapPolicy} from "@/data/serviceTiming";

/** Authorization only. The minimum and admission decision always belong to SQL. */
export function ProfessionalGapPolicy({value,onChange,color}:{value?:BookingGapPolicy;onChange:(value:BookingGapPolicy)=>void;color:string}){
 const {lang}=useLanguage(),label=(es:string,en:string)=>lang==="en"?en:es;
 const policy=value??{allowLastMinuteGaps:false,lastMinuteMinutes:1440};
 const enabled=policy.allowLastMinuteGaps;
 const [hours,setHours]=useState<string|null>(null);
 const [expanded,setExpanded]=useState(false);
 const expandedRef=useRef(false);
 const presets=[24,12,6,3];
 const custom=!presets.some(h=>policy.lastMinuteMinutes===h*60);
 const savedHours=String(policy.lastMinuteMinutes/60);
 const save=(minutes:number,active=enabled)=>{
  try{onChange(validateBookingGapPolicy({allowLastMinuteGaps:active,lastMinuteMinutes:minutes}));}
  catch(error){Alert.alert("GO",error instanceof Error?error.message:label("Revisa el intervalo.","Check the interval."));}
 };
 return <View testID="professional-gap-policy" style={{gap:10,padding:10,borderWidth:1,borderColor:"#D1D5DB",borderRadius:10,backgroundColor:"#FFFFFF"}}>
  <TouchableOpacity testID="professional-gap-toggle" accessibilityRole="button"
   accessibilityLabel={label("HUECOS EXCEPCIONALES","EXCEPTIONAL GAPS")} accessibilityState={{expanded}}
   activeOpacity={0.8} onPress={()=>{expandedRef.current=!expanded;setExpanded(!expanded);}}
   style={{flexDirection:"row",alignItems:"center",minHeight:44,gap:8}}>
   <Text accessibilityRole="header" style={{color:"#111827",fontWeight:"700",fontSize:12,flex:1}}>{label("HUECOS EXCEPCIONALES","EXCEPTIONAL GAPS")}</Text>
   <Feather name={expanded?"chevron-up":"chevron-down"} size={12} color="#374151"/>
  </TouchableOpacity>
  {expanded&&<View testID="professional-gap-options" style={{gap:10}}>
  <Text style={{color:"#374151",fontSize:12}}>{label("Permite ofrecer más horarios cuando se acerca la cita, aunque queden pequeños huecos libres.","Offers more times as the appointment approaches, even if small free gaps remain.")}</Text>
  <View style={{flexDirection:"row",alignItems:"center",gap:8}}>
   <Text style={{color:"#111827",fontSize:12,fontWeight:"600",flex:1}}>{enabled?label("Activado","Enabled"):label("Desactivado","Disabled")}</Text>
   <Switch testID="professional-gap-enabled" accessibilityLabel={label("Permitir huecos excepcionales de última hora","Allow last-minute exceptional gaps")}
    value={enabled} onValueChange={active=>save(policy.lastMinuteMinutes,active)} trackColor={{false:"#9CA3AF",true:color}} ios_backgroundColor="#9CA3AF"/>
  </View>
  <View style={{flexDirection:"row",gap:6}}>{presets.map(h=>{
   const selected=policy.lastMinuteMinutes===h*60;
   return <TouchableOpacity key={h} testID={"professional-gap-preset-"+h} accessibilityRole="button"
    accessibilityState={{selected,disabled:!enabled}} disabled={!enabled} activeOpacity={0.75}
    accessibilityLabel={h+label(" horas antes"," hours before")} onPress={()=>{if(!enabled)return;setHours(null);save(h*60);}}
    style={{flex:1,minHeight:44,paddingHorizontal:3,borderWidth:selected?2:1,borderColor:selected?"#374151":"#9CA3AF",backgroundColor:selected&&enabled?color+"18":"#FFFFFF",borderRadius:8,alignItems:"center",justifyContent:"center"}}>
    <Text style={{color:"#111827",fontSize:12,fontWeight:selected?"700":"400",textAlign:"center"}}>{h}{label(" horas"," hours")}</Text>
   </TouchableOpacity>;
  })}</View>
  <Text style={{color:"#374151",fontSize:12,fontWeight:"600"}}>{label("Otro intervalo personalizado (horas)","Other custom interval (hours)")}</Text>
  <TextInput testID="professional-gap-custom" keyboardType="decimal-pad" editable={enabled} accessibilityState={{disabled:!enabled}}
   accessibilityLabel={label("Otro intervalo de excepción en horas","Other exception interval in hours")}
   placeholder={label("Introduce las horas","Enter hours")} placeholderTextColor="#4B5563" value={hours??(custom?savedHours:"")}
   onChangeText={setHours} onEndEditing={()=>{if(expandedRef.current&&enabled&&hours!==null&&hours.trim())save(Number(hours.replace(",","."))*60);}}
   style={{color:"#111827",backgroundColor:"#FFFFFF",minHeight:44,borderWidth:custom?2:1,borderColor:custom?"#374151":"#9CA3AF",borderRadius:8,paddingHorizontal:10}}/>
  <Text testID="professional-gap-selected" style={{color:"#111827",fontSize:12,fontWeight:"600"}}>{enabled?label("Seleccionado: ","Selected: "):label("Intervalo guardado: ","Saved interval: ")}{savedHours}{label(" horas antes del inicio."," hours before the start.")}</Text>
  <Text style={{color:"#374151",fontSize:12}}>{enabled?label("Se mantienen horarios, descansos, disponibilidad y confirmaciones.","Working hours, breaks, availability and confirmations still apply."):label("Activa el interruptor para aplicar este intervalo. Los horarios y demás validaciones se mantienen.","Enable the switch to apply this interval. Working hours and other validations still apply.")}</Text>
  </View>}
 </View>;
}
