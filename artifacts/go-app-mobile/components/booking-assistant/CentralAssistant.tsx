import React,{useEffect,useMemo,useReducer,useRef,useState} from "react";
import {AppState,Text,TouchableOpacity,View} from "react-native";
import {centralConversationFor} from "@/lib/centralConversationRuntime";
import {requestCentralConsent} from "@/lib/centralConsent";
import {CentralVoiceSettings} from "./CentralVoiceSettings";
import {centralAssistantApi} from "@/lib/centralAssistant";
import {onSessionChanged} from "@/lib/sessionEvents";
import {useLanguage} from "@/contexts/LanguageContext";
import {createDeviceSpeechRecognition} from "@/lib/deviceSpeechRecognition";
import {BookingAssistantScreen,type BookingAssistantProps} from "./BookingAssistantScreen";

/** Reuses the existing chat/composer/voice lifecycle in read-only consultation mode. */
export function CentralAssistant({userId,...props}:BookingAssistantProps&{userId:string}){
  const {locale}=useLanguage();
  const [cancelRequest,setCancelRequest]=useState(0);
  const [,render]=useReducer(n=>n+1,0),[cloudError,setCloudError]=useState("");
  const model=useMemo(()=>centralConversationFor(userId,locale),[userId,locale]);
  const active=useRef({model,visible:props.visible});active.current={model,visible:props.visible};
  const recognitionLocale=model.speech.locale??locale;
  const localRecognition=useMemo(()=>createDeviceSpeechRecognition(recognitionLocale),[model,recognitionLocale]);
  function requestConsent(){return requestCentralConsent(model,()=>active.current.model===model&&active.current.visible);}
  useEffect(()=>model.subscribe(render),[model]);
  useEffect(()=>{if(!props.visible){model.interrupt();return;}let current=true;
    void (model.ready?Promise.resolve():model.restore()).then(()=>{if(current&&!model.consentReviewed)void requestConsent().catch(()=>{});return centralAssistantApi<{conversation:boolean;history:string;actions:boolean}>(userId,"/capabilities");}).then(c=>{
      if(!current)return;
      if(c.actions){const revision=model.revision;void centralAssistantApi<{proposal:unknown}>(userId,"/proposal/current").then(result=>{if(current)model.restoreProposal(result.proposal,revision);}).catch(()=>{if(current)setCloudError("No se pudo recuperar la propuesta pendiente. No se confirma ninguna reserva.");});}
      if(c.history==="account-opt-in")void model.restoreCloudPreference();
    }).catch(error=>{if(current)setCloudError("No se pudo comprobar la disponibilidad de GO IA. Inténtalo de nuevo.");});
    return()=>{current=false;model.interrupt();localRecognition.abort();};
  },[model,props.visible,userId]);
  useEffect(()=>{const off=onSessionChanged(()=>model.interrupt()),app=AppState.addEventListener("change",state=>{if(state!=="active")model.interrupt();});return()=>{off();app.remove();model.interrupt();};},[model]);
  const interrupt=()=>{model.interrupt();setCancelRequest(n=>n+1);};
  const settings=<CentralVoiceSettings model={model}/>;
  const conversationActions=(model.busy||model.speaking)?<TouchableOpacity testID="central-ai-interrupt" accessibilityRole="button" onPress={interrupt} style={{minHeight:44,paddingHorizontal:16,paddingVertical:10,alignItems:"center",backgroundColor:"#F1F5F9"}}><Text style={{fontSize:14,color:"#183955",flexShrink:1}}>Interrumpir respuesta</Text></TouchableOpacity>:null;
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
  return <BookingAssistantScreen {...props} consultation={{scopeKey:"central:"+userId,cancelRequest,title:"Conversa con GO",introduction:"Conversa sobre cualquier tema. Las reservas requieren revisar y confirmar su propuesta.",navigationKey:"central-assistant",sourceText:"",controls,conversationActions,settings,compactConversation:true,speaking:model.speaking,completed:model.completed,
    messages:[{id:"intro",role:"assistant",text:"Puedes escribir, corregir o continuar una conversación. Tus preferencias están en el engranaje."},...model.messages.map((m,i)=>({...m,id:i}))],
    respond:text=>model.respond(text),errorMessage:error=>error instanceof Error?error.message:"No se pudo completar la consulta. Conservamos el texto.",onInterrupt:()=>model.interrupt(),
    voiceOptions:{localRecognition,beforeStart:requestConsent},
  }}/>;
}
