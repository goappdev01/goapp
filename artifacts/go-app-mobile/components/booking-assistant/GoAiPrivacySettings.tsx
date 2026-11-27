import React,{useEffect,useReducer,useRef,useState} from "react";
import {Alert,Text,TouchableOpacity,View} from "react-native";
import {useGoAiPrivacyModel} from "@/hooks/useGoAiPrivacyModel";
import {requestCentralConsent,CENTRAL_PRIVACY_DISCLOSURE} from "@/lib/centralConsent";
import {CentralHistoryConflict} from "@/lib/centralConversation";
import {centralAssistantApi} from "@/lib/centralAssistant";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {useLanguage} from "@/contexts/LanguageContext";

export function GoAiPrivacySettings({visible}:{visible:boolean}){
  const identity=useGoAiPrivacyModel(visible),[,render]=useReducer(n=>n+1,0),[historyAvailable,setHistoryAvailable]=useState(false),[historyReady,setHistoryReady]=useState(false),[error,setError]=useState("");
  const admin=useAdminAccess(),{t}=useLanguage(),active=useRef(identity);active.current=identity;
  useEffect(()=>()=>{active.current=null;},[]);
  useEffect(()=>identity?.model.subscribe(render),[identity]);
  const verifiedAdmin=!!identity&&admin.allowed&&!admin.checking&&!admin.unavailable&&admin.userId===identity.userId;
  useEffect(()=>{let current=true;setHistoryAvailable(false);setHistoryReady(!verifiedAdmin);
    if(verifiedAdmin&&identity)void centralAssistantApi<{history:string}>(identity.userId,"/capabilities").then(async c=>{
      if(!current)return;setHistoryAvailable(c.history==="account-opt-in");
      if(c.history==="account-opt-in")await identity.model.restoreCloudPreference();
      if(current)setHistoryReady(true);
    }).catch(()=>{if(current)setError("No se pudo comprobar el historial de la cuenta. Vuelve a abrir Privacidad antes de borrarlo.");});
    return()=>{current=false;};},[identity,verifiedAdmin]);
  if(!visible)return null;
  if(!identity)return <Text style={{fontSize:14,color:"#475569"}}>Inicia sesión para consultar la privacidad de GO IA de tu cuenta.</Text>;
  const {model}=identity;
  const action=(id:string,label:string,press:()=>void,checked?:boolean)=>{const disabled=!model.ready||(id==="central-ai-clear"&&!historyReady);return <TouchableOpacity key={id} testID={id} accessibilityRole={checked===undefined?"button":"checkbox"} accessibilityState={{checked,disabled}} disabled={disabled} onPress={press} style={{minHeight:48,padding:10,borderWidth:1,borderColor:"#CBD5E1",borderRadius:12,backgroundColor:"#FFF",opacity:disabled?.6:1}}><Text style={{fontSize:14,color:id==="central-ai-clear"?"#B4232F":"#183955",flexShrink:1}}>{checked===undefined?"":checked?"☑ ":"☐ "}{label}</Text></TouchableOpacity>;};
  const toggleCloud=()=>{setError("");if(model.cloudEnabled){void model.disableCloud().catch(()=>setError("No se pudo desactivar la sincronización."));return;}
    void model.enableCloud().catch(e=>{if(e instanceof CentralHistoryConflict)Alert.alert("Historial de la cuenta","Hay otra conversación guardada. ¿Quieres recuperarla en este dispositivo?",[{text:"Cancelar",style:"cancel"},{text:"Recuperar",onPress:()=>{if(active.current!==identity)return;void model.enableCloud(true).catch(()=>setError("No se pudo recuperar el historial."));}}]);else setError("No se pudo sincronizar el historial.");});};
  return <View testID="go-ai-general-privacy" style={{gap:10,minWidth:0,backgroundColor:"#F8FAFC",padding:12,borderRadius:14}}>
    <Text accessibilityRole="header" style={{fontSize:17,fontWeight:"700",color:"#183955"}}>Privacidad de GO IA</Text>
    <Text style={{fontSize:13,lineHeight:19,color:"#475569"}}>{CENTRAL_PRIVACY_DISCLOSURE}</Text>
    {action("central-ai-consent","Permitir envío a OpenAI",()=>{if(model.consent)model.setConsent(false);else void requestCentralConsent(model,()=>active.current===identity).catch(()=>{});},model.consent)}
    {action("central-ai-remember","Conservar historial en este dispositivo",()=>model.cloudEnabled?setError("Desactiva primero la sincronización para dejar de conservar la copia local."):model.setRemember(!model.remember),model.remember)}
    {(historyAvailable||model.cloudEnabled)&&action("central-ai-cloud","Sincronizar historial de esta cuenta",toggleCloud,model.cloudEnabled)}
    {action("central-ai-clear",model.cloudEnabled?"Borrar conversación de esta cuenta":"Borrar conversación de este dispositivo",()=>{model.clear();setError("");})}
    <Text style={{fontSize:13,color:"#475569"}}>Estas preferencias pertenecen a tu cuenta en este dispositivo. Borrar la conversación no revoca la autorización de envío. Puedes desactivarla arriba.</Text>
    <Text accessibilityRole="header" style={{fontSize:15,fontWeight:"700",color:"#183955"}}>Condiciones y limitaciones</Text>
    <Text style={{fontSize:14,lineHeight:20,color:"#183955"}}>{t("go_ai_limit_notice")}</Text>
    <Text style={{fontSize:13,lineHeight:19,color:"#475569"}}>Las respuestas pueden contener información incorrecta o incompleta. Las operaciones que requieran autorización mantienen revisión y confirmación expresa. Condiciones pendientes de validación jurídica; este aviso no es una exención general de responsabilidad ni una garantía de cumplimiento legal.</Text>
    {!!(error||model.notice)&&<Text accessibilityLiveRegion="polite" style={{fontSize:13,color:"#B4232F"}}>{error||model.notice}</Text>}
  </View>;
}

/** Display and request are both gated by the real ADMIN identity. No role input from a dropdown. */
export function GoAiAdminStatus({visible}:{visible:boolean}){
  type Status={conversation:boolean;actions:boolean;model:string;budget?:{limitMicroUsd:number;chargedMicroUsd:number;remainingMicroUsd:number}};
  const identity=useGoAiPrivacyModel(visible),admin=useAdminAccess(),[result,setResult]=useState<{userId:string;value:Status}|null>(null);
  const status=result?.userId===identity?.userId?result?.value??null:null;
  const [,render]=useReducer(n=>n+1,0),allowed=!!identity&&admin.allowed&&!admin.checking&&!admin.unavailable&&admin.userId===identity.userId;
  useEffect(()=>identity?.model.subscribe(render),[identity]);
  useEffect(()=>{let current=true;setResult(null);if(visible&&allowed&&identity)void centralAssistantApi<Status>(identity.userId,"/capabilities").then(value=>{if(current)setResult({userId:identity.userId,value});}).catch(()=>{});return()=>{current=false;};},[visible,identity,allowed]);
  if(!visible||!allowed)return null;
  return <View testID="go-ai-admin-status" style={{gap:6,padding:12,borderRadius:12,backgroundColor:"#F1F5F9"}}>
    <Text style={{fontWeight:"700",color:"#183955"}}>GO IA · Administración</Text>
    <Text style={{color:"#475569",fontSize:13}}>Proveedor: OpenAI · Modelo: {status?.model??"sin comprobar"}</Text>
    <Text style={{color:"#475569",fontSize:13}}>Conversación: {status?.conversation?"disponible":"sin disponibilidad confirmada"} · Reservas: {status===null?"sin comprobar":status.actions?"habilitadas":"deshabilitadas"}</Text>
    {status?.budget&&<Text style={{color:"#475569",fontSize:13}}>Límite acumulado: {(status.budget.limitMicroUsd/1e6).toFixed(2)} USD · contabilizado: {(status.budget.chargedMicroUsd/1e6).toFixed(6)} USD · disponible seguro: {(status.budget.remainingMicroUsd/1e6).toFixed(6)} USD</Text>}
    {identity?.model.budget&&<Text style={{color:"#475569",fontSize:13}}>Último turno: {(identity.model.budget.actualMicroUsd/1e6).toFixed(6)} USD</Text>}
  </View>;
}
