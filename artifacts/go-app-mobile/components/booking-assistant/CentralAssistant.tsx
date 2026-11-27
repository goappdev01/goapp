import React,{useEffect,useMemo,useReducer,useRef,useState} from "react";
import {Alert,AppState,Text,TouchableOpacity,View} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Speech from "expo-speech";
import {CentralConversation,CentralHistoryConflict,type CentralReply} from "@/lib/centralConversation";
import {centralAssistantApi} from "@/lib/centralAssistant";
import {onSessionChanged} from "@/lib/sessionEvents";
import {useLanguage} from "@/contexts/LanguageContext";
import {createDeviceSpeechRecognition} from "@/lib/deviceSpeechRecognition";
import {BookingAssistantScreen,type BookingAssistantProps} from "./BookingAssistantScreen";

/** Reuses the existing chat/composer/voice lifecycle in read-only consultation mode. */
export function CentralAssistant({userId,...props}:BookingAssistantProps&{userId:string}){
  const {locale,t}=useLanguage();
  const [cancelRequest,setCancelRequest]=useState(0);
  const [,render]=useReducer(n=>n+1,0),[capability,setCapability]=useState("Comprobando conexión…");
  const [historyAvailable,setHistoryAvailable]=useState(false),[cloudError,setCloudError]=useState("");
  const model=useMemo(()=>new CentralConversation(userId,{
    read:key=>AsyncStorage.getItem(key),write:(key,value)=>AsyncStorage.setItem(key,value),remove:key=>AsyncStorage.removeItem(key),
    respond:(messages,signal)=>centralAssistantApi<CentralReply>(userId,"/respond",{messages,requestId:globalThis.crypto?.randomUUID?.(),consent:true},signal),
    confirm:id=>centralAssistantApi(userId,"/proposal/confirm",{id,confirmed:true,consent:true}),
    cancelProposal:()=>centralAssistantApi(userId,"/proposal/cancel",{consent:true}),
    cloud:{read:()=>centralAssistantApi(userId,"/history"),
      write:(revision,messages)=>centralAssistantApi(userId,"/history",{consent:true,revision,messages},undefined,"PUT")},
    speak:(text,onStart,onDone,onError)=>{try{Speech.speak(text,{language:locale,onStart,onDone,onStopped:onDone,onError});}catch{onError();}},stop:()=>{void Speech.stop().catch(()=>{});},
  }),[userId,locale]);
  const active=useRef({model,visible:props.visible});active.current={model,visible:props.visible};
  const consentPrompt=useRef<Promise<void>|null>(null);
  const localRecognition=useMemo(()=>createDeviceSpeechRecognition(locale),[model,locale]);
  function requestConsent():Promise<void>{
    if(!model.ready)return Promise.reject(Error("Espera a que se recuperen tus preferencias."));
    if(model.consent)return Promise.resolve();
    if(consentPrompt.current)return consentPrompt.current;
    const valid=()=>active.current.model===model&&active.current.visible;
    consentPrompt.current=new Promise<void>((resolve,reject)=>Alert.alert("Permitir envío a OpenAI",
      "OpenAI recibirá los mensajes que escribas o que transcribas localmente para responderte. Evita datos personales innecesarios. No se envía audio a OpenAI ni se solicita guardar sus respuestas, aunque esto no acredita retención cero. Las reservas están deshabilitadas. La prueba tiene un límite acumulado de 4 USD. Puedes revocar esta autorización en el engranaje.",[
        {text:"Ahora no",style:"cancel",onPress:()=>{if(valid())model.setConsent(false);reject(Error("Puedes autorizar el envío a OpenAI desde configuración."));}},
        {text:"Permitir",onPress:()=>{if(!valid()){reject(Error("La sesión ha cambiado."));return;}model.setConsent(true);resolve();}},
      ],{cancelable:false})).finally(()=>{consentPrompt.current=null;});
    return consentPrompt.current;
  }
  useEffect(()=>model.subscribe(render),[model]);
  useEffect(()=>{if(!props.visible){model.interrupt();return;}let current=true;
    void (model.ready?Promise.resolve():model.restore()).then(()=>{if(current&&!model.consentReviewed)void requestConsent().catch(()=>{});return centralAssistantApi<{conversation:boolean;history:string;actions:boolean}>(userId,"/capabilities");}).then(c=>{
      if(!current)return;setCapability(c.conversation?"OpenAI · gpt-5.4-mini · prueba con presupuesto limitado"+(c.actions?" · reservas con confirmación":" · conversación") :"OpenAI pendiente de verificar cuenta, saldo y presupuesto. No se hará ninguna llamada.");
      if(c.actions){const revision=model.revision;void centralAssistantApi<{proposal:unknown}>(userId,"/proposal/current").then(result=>{if(current)model.restoreProposal(result.proposal,revision);}).catch(()=>{if(current)setCloudError("No se pudo recuperar la propuesta pendiente. No se confirma ninguna reserva.");});}
      setHistoryAvailable(c.history==="account-opt-in");if(c.history==="account-opt-in")void model.restoreCloudPreference();
    }).catch(error=>{if(current)setCapability(error instanceof Error?error.message:"No se pudo comprobar la IA.");});
    return()=>{current=false;model.interrupt();localRecognition.abort();};
  },[model,props.visible,userId]);
  useEffect(()=>{const off=onSessionChanged(()=>model.interrupt()),app=AppState.addEventListener("change",state=>{if(state!=="active")model.interrupt();});return()=>{off();app.remove();model.interrupt();};},[model]);
  const interrupt=()=>{model.interrupt();setCancelRequest(n=>n+1);};
  const toggleCloud=()=>{
    setCloudError("");if(model.cloudEnabled){void model.disableCloud().catch(()=>setCloudError("No se pudo cambiar la preferencia de sincronización."));return;}
    void model.enableCloud().catch(error=>{
      if(error instanceof CentralHistoryConflict)Alert.alert("Historial de la cuenta","Ya existe una conversación diferente. Al recuperarla se sustituirá la copia de este dispositivo.",[
        {text:"Cancelar",style:"cancel"},{text:"Usar historial de la cuenta",onPress:()=>{void model.enableCloud(true).catch(()=>setCloudError("No se pudo recuperar el historial de la cuenta."));}},
      ]);
      else setCloudError(error instanceof Error?error.message:"No se pudo activar la sincronización.");
    });
  };
  const toggle=(id:string,label:string,checked:boolean,press:()=>void)=><TouchableOpacity testID={id} disabled={!model.ready} accessibilityRole="checkbox" accessibilityState={{checked,disabled:!model.ready}} onPress={press} style={{minHeight:44,padding:8,justifyContent:"center"}}><Text style={{fontSize:14,color:"#183955"}}>{checked?"☑":"☐"} {label}</Text></TouchableOpacity>;
  const settings=<View testID="central-ai-privacy" style={{paddingHorizontal:12,gap:6}}>
    <Text accessibilityLiveRegion="polite" style={{fontSize:12,color:"#41556b"}}>{capability}</Text>
    <Text style={{fontSize:13,color:"#41556b"}}>OpenAI recibe solo los mensajes de este chat. El reconocimiento local, cuando esté disponible, no envía audio a OpenAI. No se solicita guardar la respuesta en OpenAI; esto no acredita retención cero. Las reservas permanecen deshabilitadas.</Text>
    {toggle("central-ai-consent","Permitir envío a OpenAI",model.consent,()=>{if(model.consent){interrupt();model.setConsent(false);}else void requestConsent().catch(()=>{});})}
    <View style={{flexDirection:"row",flexWrap:"wrap"}}>
      {toggle("central-ai-remember","Recordar este chat en este dispositivo",model.remember,()=>model.cloudEnabled?Alert.alert("Historial sincronizado","Desactiva primero la sincronización si quieres quitar la copia de este dispositivo."):model.setRemember(!model.remember))}
      {toggle("central-ai-speak","Leer respuestas en voz alta",model.voice,()=>model.setVoice(!model.voice))}
    </View>
    {historyAvailable&&toggle("central-ai-cloud","Sincronizar este chat entre mis dispositivos",model.cloudEnabled,toggleCloud)}
    {model.remember&&!model.cloudEnabled&&<Text style={{fontSize:12,color:"#41556b"}}>Historial local de esta cuenta, sin sincronización remota. Puedes borrarlo aquí.</Text>}
    {model.cloudEnabled&&<Text style={{fontSize:12,color:"#41556b"}}>Historial de esta cuenta. Cada mensaje se guarda para recuperarlo en otro dispositivo autorizado.</Text>}
    <View style={{flexDirection:"row",gap:12}}>
      <TouchableOpacity testID="central-ai-interrupt" onPress={interrupt} style={{minHeight:44,padding:8}}><Text>Interrumpir respuesta</Text></TouchableOpacity>
      <TouchableOpacity testID="central-ai-clear" onPress={()=>{interrupt();model.clear();}} style={{minHeight:44,padding:8}}><Text>Borrar conversación</Text></TouchableOpacity>
    </View>
    <Text style={{fontSize:13,color:"#41556b"}}>Preferencias de esta cuenta guardadas en este dispositivo. Borrar la conversación no revoca tu autorización ni cambia estas preferencias.</Text>
    <Text style={{fontSize:14,fontWeight:"700",color:"#183955"}}>Limitaciones y condiciones de GO IA</Text>
    <Text style={{fontSize:13,lineHeight:19,color:"#41556b"}}>{t("go_ai_limit_notice")}</Text>
    <Text style={{fontSize:13,color:"#41556b"}}>El texto de condiciones está pendiente de validación jurídica. Las operaciones que requieran autorización mantienen revisión y confirmación expresa.</Text>
    {model.budget&&<Text style={{fontSize:12,color:"#41556b"}}>Último turno: máximo reservado {(model.budget.estimatedMaximumMicroUsd/1000000).toFixed(4)} USD · consumo {(model.budget.actualMicroUsd/1000000).toFixed(6)} USD. Acumulado {(model.budget.chargedMicroUsd/1000000).toFixed(6)} USD · disponible seguro {(model.budget.remainingMicroUsd/1000000).toFixed(6)} USD.</Text>}
    {model.usage.measuredCalls>0&&<Text style={{fontSize:12,color:"#41556b"}}>Esta sesión: {model.usage.inputTokens} tokens de entrada · {model.usage.outputTokens} de salida</Text>}
  </View>;
  const controls=<View testID="central-ai-conversation-status">
    {!!model.notice&&<Text accessibilityLiveRegion="polite">{model.notice}</Text>}
    {!!cloudError&&<Text accessibilityLiveRegion="polite">{cloudError}</Text>}
    {model.proposal&&<View testID="central-ai-booking-proposal" style={{padding:10,gap:8,borderWidth:1,borderColor:"#90adc0",borderRadius:12}}>
      <Text style={{fontWeight:"700"}}>{model.proposal.state==="submitting"?"Envío pendiente de comprobar · conserva la misma referencia":"Revisar propuesta · aún sin enviar"}</Text>
      <Text>{model.proposal.summary.business} · {model.proposal.summary.services.join(", ")}</Text>
      <Text>{new Date(model.proposal.summary.startsAt).toLocaleString("es-ES",{timeZone:model.proposal.summary.timezone})} · {model.proposal.summary.timezone}</Text>
      <Text>Hasta {new Date(model.proposal.summary.endsAt).toLocaleTimeString("es-ES",{timeZone:model.proposal.summary.timezone,hour:"2-digit",minute:"2-digit"})} · {model.proposal.summary.total.toFixed(2)} {model.proposal.summary.currency}</Text>
      <Text>Puedes corregir los datos escribiendo. La corrección invalida esta propuesta.</Text>
      <View style={{flexDirection:"row",flexWrap:"wrap",gap:10}}>
        <TouchableOpacity testID="central-ai-booking-confirm" accessibilityRole="button" disabled={!model.consent||model.busy||model.submitting}
          onPress={()=>{void model.confirmProposal().catch(()=>{});}} style={{minHeight:48,padding:10,backgroundColor:"#d9f0df",borderRadius:10}}><Text>{model.submitting?"Comprobando en GO…":model.proposal.state==="submitting"?"Comprobar resultado":"Confirmar reserva"}</Text></TouchableOpacity>
        <TouchableOpacity testID="central-ai-booking-cancel" accessibilityRole="button" disabled={model.submitting||model.busy}
          onPress={()=>{void model.cancelProposal().catch(error=>setCloudError(error instanceof Error?error.message:"No se pudo retirar la propuesta."));}} style={{minHeight:48,padding:10}}><Text>Descartar propuesta</Text></TouchableOpacity>
      </View>
    </View>}
  </View>;
  return <BookingAssistantScreen {...props} consultation={{scopeKey:"central:"+userId,cancelRequest,title:"Conversa con GO",introduction:"Conversa sobre cualquier tema. Las reservas requieren revisar y confirmar su propuesta.",navigationKey:"central-assistant",sourceText:"",controls,settings,compactConversation:true,speaking:model.speaking,completed:model.completed,
    messages:[{id:"intro",role:"assistant",text:"Puedes escribir, corregir o continuar una conversación. Tus preferencias están en el engranaje."},...model.messages.map((m,i)=>({...m,id:i}))],
    respond:text=>model.respond(text),errorMessage:error=>error instanceof Error?error.message:"No se pudo completar la consulta. Conservamos el texto.",onInterrupt:()=>model.interrupt(),
    voiceOptions:{localRecognition,beforeStart:requestConsent},
  }}/>;
}
