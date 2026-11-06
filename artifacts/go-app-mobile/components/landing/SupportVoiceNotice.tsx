import React,{useState} from "react";
import {View,Text,TouchableOpacity} from "react-native";
import {Feather} from "@expo/vector-icons";

export function supportVoiceMessage(message:string){
 if(/permiso|permite|acceso al micrófono/i.test(message))return "Revisa el permiso del micrófono.";
 if(/sesión|identif/i.test(message))return "Inicia sesión para dictar.";
 if(/no he oído|sin voz|vacío/i.test(message))return "No se ha detectado voz. Inténtalo de nuevo.";
 return "Dictado no disponible. Puedes escribir.";
}
/** An opt-in, dismissible summary. Native voice validation and errors remain intact. */
export function SupportVoiceNotice({message,attempt}:{message:string;attempt:number}){
 const [dismissed,setDismissed]=useState("");const key=attempt+":"+message;
 if(!message||dismissed===key)return null;
 return <View testID="support-voice-notice" accessibilityLiveRegion="polite" style={{flexDirection:"row",alignItems:"center",gap:6,paddingLeft:12,marginHorizontal:16,backgroundColor:"#f1f3f4",borderRadius:12}}>
  <Text style={{flex:1,minWidth:0,color:"#46534c",fontSize:13,lineHeight:18}}>{supportVoiceMessage(message)}</Text>
  <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar aviso de dictado" onPress={()=>setDismissed(key)} style={{width:44,height:44,alignItems:"center",justifyContent:"center"}}><Feather name="x" size={18} color="#46534c"/></TouchableOpacity>
 </View>;
}
