import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import type { SupportGateway, SupportKind, SupportReceipt } from "@/lib/supportRequests";
import { sendSupportRequest, SUPPORT_ORBIT_ACTIONS } from "@/lib/supportRequests";

/** No production gateway is configured until receipt, privacy and authorization are verified. */
export function LandingSupport({ visible, onClose, scopeKey, gateway, kind="incident" }: {
  visible: boolean; onClose: () => void; scopeKey: string; gateway?: SupportGateway; kind?: SupportKind | "mine";
}) {
  const insets = useSafeAreaInsets();
  const [drafts, setDrafts] = useState({ incident: "", improvement: "", help: "" });
  const [context, setContext] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [receipt, setReceipt] = useState<SupportReceipt | null>(null);
  const [requests, setRequests] = useState<SupportReceipt[] | null>(null);
  const identity = useRef({key:scopeKey,kind});
  if(identity.current.key!==scopeKey||identity.current.kind!==kind)identity.current={key:scopeKey,kind};
  const flight = useRef(false), requestKey = useRef<string | null>(null);
  useEffect(() => {
    setDrafts({incident:"",improvement:"",help:""}); setContext(false); setReceipt(null);
    setRequests(null); setError(""); setBusy(false); requestKey.current=null; flight.current=false;
  }, [scopeKey]);
  useEffect(()=>{setReceipt(null);setError("");setBusy(false);flight.current=false;requestKey.current=null;},[kind]);
  useEffect(() => {
    if (!visible || kind !== "mine" || !gateway) return;
    let active = true; const owner = identity.current;
    setRequests(null); setError("");
    gateway.listOwn().then(rows => { if (active && identity.current === owner) setRequests(rows); })
      .catch(() => { if (active && identity.current === owner) setError("No se pudieron consultar tus solicitudes. Inténtalo de nuevo."); });
    return () => { active=false; };
  }, [visible, kind, gateway, scopeKey]);
  const submit = async () => {
    if (!gateway || kind === "mine" || flight.current || !drafts[kind].trim()) return;
    flight.current=true; setBusy(true); setError(""); const owner=identity.current;
    requestKey.current ??= "support_"+Date.now().toString(36)+Math.random().toString(36).slice(2);
    try {
      const saved=await sendSupportRequest(gateway,{kind,message:drafts[kind],context:context?"Landing":undefined,requestKey:requestKey.current});
      if(identity.current!==owner)return;
      setReceipt(saved); setDrafts(values=>({...values,[kind]:""})); requestKey.current=null;
    } catch { if(identity.current===owner)setError("No se ha confirmado la recepción. Conservamos el texto; reintenta para comprobar el resultado."); }
    finally { if(identity.current===owner){flight.current=false;setBusy(false);} }
  };
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={[s.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==="ios"?"padding":undefined}>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>{SUPPORT_ORBIT_ACTIONS.find(action=>action.kind===kind)?.title}</Text>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cerrar ayuda" onPress={onClose} style={s.close}><Feather name="x" size={24} color="#fff"/></TouchableOpacity></View>
      <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
        {!gateway&&<Text accessibilityRole="alert" style={s.notice}>La recepción de solicitudes todavía no está disponible. No se enviará ningún texto ni archivo.</Text>}
        {kind==="mine" ? <>{!gateway?<Text style={s.dim}>Tus solicitudes podrán consultarse aquí cuando el servicio esté habilitado.</Text>
          : requests===null?<Text style={s.dim}>Consultando…</Text>:requests.length===0?<Text style={s.dim}>No tienes solicitudes registradas.</Text>
          :requests.map(row=><View key={row.id} style={s.option}><Text style={s.text}>{row.reference} · {row.status}</Text>{!!row.response&&<Text style={s.dim}>{row.response}</Text>}</View>)}</>
          : <><Text style={s.dim}>{kind==="incident"?"Describe qué falla y dónde ocurre.":kind==="improvement"?"Cuéntanos qué mejorarías en GO.":"¿En qué necesitas ayuda?"}</Text>
            <TextInput accessibilityLabel="Descripción de la solicitud" multiline maxLength={4000} value={drafts[kind]} editable={!busy}
              onChangeText={value=>{setDrafts(current=>({...current,[kind]:value}));requestKey.current=null;setReceipt(null);}}
              placeholder="Escribe aquí. Puedes usar el dictado del teclado." placeholderTextColor="#94a3b8" style={s.input}/>
            <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{checked:context,disabled:busy}} disabled={busy} style={s.option} onPress={()=>{setContext(!context);requestKey.current=null;}}>
              <Text style={s.text}>{context?"☑":"☐"} Incluir contexto: Landing</Text></TouchableOpacity>
            <Text style={s.dim}>No incluyas contraseñas ni datos sensibles. No se capturan pantallas ni datos de sesión.</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled:!gateway||busy||!drafts[kind].trim()}} disabled={!gateway||busy||!drafts[kind].trim()} onPress={submit}
              style={[s.send,(!gateway||busy||!drafts[kind].trim())&&{opacity:0.45}]}><Text style={s.sendText}>{busy?"Enviando…":"ENVIAR"}</Text></TouchableOpacity>
          </>}
        {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
        {!!receipt&&<Text accessibilityLiveRegion="polite" style={s.notice}>Solicitud recibida · {receipt.reference} · {receipt.status}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  </Modal>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:"#090e18"},header:{flexDirection:"row",alignItems:"center",paddingHorizontal:18,paddingVertical:12,gap:12},title:{flex:1,color:"#fff",fontSize:18,fontWeight:"800"},close:{width:44,height:44,alignItems:"center",justifyContent:"center"},content:{padding:18,gap:12,paddingBottom:28},option:{minHeight:48,padding:14,borderRadius:16,borderWidth:1,borderColor:"#475569",backgroundColor:"#162032"},selected:{borderColor:"#7dd3fc",backgroundColor:"#17334b"},text:{color:"#f8fafc",fontSize:16},dim:{color:"#cbd5e1",fontSize:14,lineHeight:21},notice:{color:"#bae6fd",fontSize:15,lineHeight:22},input:{minHeight:140,maxHeight:260,borderWidth:1,borderColor:"#64748b",borderRadius:16,color:"#fff",padding:14,fontSize:17,textAlignVertical:"top"},send:{minHeight:50,borderRadius:16,backgroundColor:"#7dd3fc",alignItems:"center",justifyContent:"center"},sendText:{color:"#082f49",fontWeight:"800",fontSize:16},error:{color:"#fca5a5",fontSize:15}});
