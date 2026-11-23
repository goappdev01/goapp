import React,{useEffect,useMemo,useReducer,useState} from "react";
import {AppState,Platform,Text,TouchableOpacity,View} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import {CentralConversation} from "@/lib/centralConversation";
import {centralAssistantApi} from "@/lib/centralAssistant";
import {onSessionChanged} from "@/lib/sessionEvents";
import {BookingAssistantScreen,type BookingAssistantProps} from "./BookingAssistantScreen";

/** Reuses the existing chat/composer/voice lifecycle in read-only consultation mode. */
export function CentralAssistant({userId,...props}:BookingAssistantProps&{userId:string}){
  const [cancelRequest,setCancelRequest]=useState(0);
  const [,render]=useReducer(n=>n+1,0),[capability,setCapability]=useState("Comprobando conexión…");
  const model=useMemo(()=>new CentralConversation(userId,{
    read:key=>AsyncStorage.getItem(key),write:(key,value)=>AsyncStorage.setItem(key,value),remove:key=>AsyncStorage.removeItem(key),
    respond:(messages,signal)=>centralAssistantApi(userId,"/respond",{messages,consent:true},signal),
    speak:(text,onStart,onDone,onError)=>{try{Speech.speak(text,{language:"es-ES",onStart,onDone,onStopped:onDone,onError});}catch{onError();}},stop:()=>{void Speech.stop().catch(()=>{});},
  }),[userId]);
  useEffect(()=>model.subscribe(render),[model]);
  useEffect(()=>{if(!props.visible){model.setConsent(false);return;}if(!model.ready)void model.restore();let current=true;
    centralAssistantApi<{conversation:boolean}>(userId,"/capabilities").then(c=>{if(current)setCapability(c.conversation?"OpenAI disponible · solo conversación":"OpenAI pendiente de habilitación. No se han realizado llamadas al modelo.");}).catch(error=>{if(current)setCapability(error instanceof Error?error.message:"No se pudo comprobar la IA.");});
    return()=>{current=false;model.setConsent(false);};
  },[model,props.visible,userId]);
  useEffect(()=>{const off=onSessionChanged(()=>model.setConsent(false)),app=AppState.addEventListener("change",state=>{if(state!=="active")model.setConsent(false);});return()=>{off();app.remove();model.interrupt();};},[model]);
  const interrupt=()=>{model.interrupt();setCancelRequest(n=>n+1);};
  const toggle=(id:string,label:string,checked:boolean,press:()=>void)=><TouchableOpacity testID={id} accessibilityRole="checkbox" accessibilityState={{checked}} onPress={press} style={{minHeight:44,padding:8,justifyContent:"center"}}><Text style={{fontSize:14,color:"#183955"}}>{checked?"☑":"☐"} {label}</Text></TouchableOpacity>;
  const controls=<View testID="central-ai-privacy" style={{paddingHorizontal:12,gap:2}}>
    <Text accessibilityLiveRegion="polite" style={{fontSize:12,color:"#41556b"}}>{capability}</Text>
    <Text style={{fontSize:12,color:"#41556b"}}>Solo se envían a OpenAI los mensajes de este chat. No se consultan ni modifican tus datos de GO.</Text>
    {toggle("central-ai-consent","Permitir envío a OpenAI en esta sesión",model.consent,()=>{if(model.consent)interrupt();model.setConsent(!model.consent);})}
    <View style={{flexDirection:"row",flexWrap:"wrap"}}>
      {toggle("central-ai-remember","Recordar este chat en este dispositivo",model.remember,()=>model.setRemember(!model.remember))}
      {toggle("central-ai-speak","Leer respuestas en voz alta",model.voice,()=>model.setVoice(!model.voice))}
    </View>
    {model.remember&&<Text style={{fontSize:12,color:"#41556b"}}>Historial local de esta cuenta, sin sincronización remota. Puedes borrarlo aquí.</Text>}
    <View style={{flexDirection:"row",gap:12}}>
      <TouchableOpacity testID="central-ai-interrupt" onPress={interrupt} style={{minHeight:44,padding:8}}><Text>Interrumpir respuesta</Text></TouchableOpacity>
      <TouchableOpacity testID="central-ai-clear" onPress={()=>{interrupt();model.clear();}} style={{minHeight:44,padding:8}}><Text>Borrar conversación</Text></TouchableOpacity>
    </View>
    {!!model.notice&&<Text accessibilityLiveRegion="polite">{model.notice}</Text>}
  </View>;
  return <BookingAssistantScreen {...props} consultation={{scopeKey:"central:"+userId,cancelRequest,title:"Conversa con GO",introduction:"Conversa sobre cualquier tema. Esta fase no ejecuta acciones.",navigationKey:"central-assistant",sourceText:"",controls,speaking:model.speaking,completed:model.completed,
    messages:[{id:"intro",role:"assistant",text:"Puedes escribir, corregir o continuar una conversación. Autoriza el envío antes de usar OpenAI."},...model.messages.map((m,i)=>({...m,id:i}))],
    respond:text=>model.respond(text),errorMessage:error=>error instanceof Error?error.message:"No se pudo completar la consulta. Conservamos el texto.",onInterrupt:()=>model.interrupt(),
    voiceOptions:{requireTranscriptionReady:true,beforeStart:async()=>{if(Platform.OS==="web")throw Error("El dictado central no está habilitado en este navegador. Puedes escribir.");if(!model.consent)throw Error("Autoriza el envío a OpenAI antes de utilizar el dictado. Puedes escribir.");},
      capabilities:()=>centralAssistantApi(userId,"/capabilities"),transcribe:body=>{if(!model.consent)return Promise.reject(Error("No has autorizado enviar audio."));return centralAssistantApi(userId,"/transcribe",{...body,consent:true});}},
  }}/>;
}
