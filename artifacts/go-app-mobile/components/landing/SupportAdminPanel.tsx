import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Keyboard, KeyboardAvoidingView, Linking, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { newSupportRequestKey } from "@/lib/supportRequests";
import type { SupportGateway, SupportKind, SupportReceipt, SupportStatus } from "@/lib/supportRequests";
import {useSupportRefresh} from "@/hooks/useSupportRefresh";

export type SupportAdminView = "received"|"incident"|"improvement"|"help"|"all"|"pending"|"archive";
const titles:Record<SupportAdminView,string>={received:"Solicitudes recibidas",incident:"Incidencias",improvement:"Propuestas de mejora",
  help:"Consultas de ayuda",all:"Listados de AYUDA",pending:"En revisión / Pendientes",archive:"Historial / Archivo"};
const labels:Record<SupportStatus,string>={received:"RECIBIDA",in_review:"EN REVISIÓN",pending:"PENDIENTE",solved:"SOLUCIONADA",rejected:"RECHAZADA"};
const kinds:Record<SupportKind,string>={incident:"Incidencia",improvement:"Mejora",help:"Consulta"};

export function SupportAdminPanel({visible,onClose,view,gateway,backendReady=true,handedness="right"}:{
  visible:boolean;onClose:()=>void;view:SupportAdminView;gateway:SupportGateway;backendReady?:boolean;handedness?:"left"|"right";
}) {
  const insets=useSafeAreaInsets();
  const [statusTab,setStatusTab]=useState<"in_review"|"pending">("in_review");
  const [rows,setRows]=useState<SupportReceipt[]>([]),[total,setTotal]=useState(0);
  const [selected,setSelected]=useState<SupportReceipt|null>(null);
  const [reply,setReply]=useState(""),[reason,setReason]=useState(""),[internal,setInternal]=useState(false);
  const [from,setFrom]=useState(""),[to,setTo]=useState(""),[sender,setSender]=useState("");
  const [applied,setApplied]=useState({from:"",to:"",sender:""});
  const [loading,setLoading]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [keyboardVisible,setKeyboardVisible]=useState(false);
  const flight=useRef(false),revision=useRef(0),pendingCommand=useRef<{fingerprint:string;key:string}|null>(null);
  const active=useRef({visible,gateway,view,statusTab,applied});
  if(active.current.visible!==visible||active.current.gateway!==gateway||active.current.view!==view||active.current.statusTab!==statusTab||active.current.applied!==applied)active.current={visible,gateway,view,statusTab,applied};
  useEffect(()=>{revision.current++;flight.current=false;setBusy(false);},[visible,view,statusTab,applied,gateway]);
  useEffect(()=>{const shown=Keyboard.addListener("keyboardDidShow",()=>setKeyboardVisible(true));
    const hidden=Keyboard.addListener("keyboardDidHide",()=>setKeyboardVisible(false));
    return()=>{shown.remove();hidden.remove();};},[]);
  const back=()=>{if(keyboardVisible||Keyboard.isVisible?.()){Keyboard.dismiss();return;}
    if(backendReady&&selected){setSelected(null);return;}onClose();};
  const navigation=<GoNavigationFloating screenKey="support-admin" safeArea={false} handedness={handedness}
    keyboardResponsive protectedTop={insets.top+72} protectedBottom={insets.bottom+12} initialBottom={0}>
    <GoCloseButton level={backendReady&&selected?"panel":"container"} appearance="light" keyboardVisible={keyboardVisible}
      accessibilityLabel={keyboardVisible?"Ocultar teclado":backendReady&&selected?"Volver a la bandeja":"Volver a AYUDA"} onPress={back}/>
  </GoNavigationFloating>;
  const filter=useCallback((offset=0)=>({offset,limit:30,archived:view==="archive",
    ...(applied.from?{from:applied.from}:{}),...(applied.to?{to:applied.to}:{}),...(applied.sender?{sender:applied.sender}:{}),
    ...(view==="received"?{status:"received" as SupportStatus}:{}),
    ...(view==="pending"?{status:statusTab as SupportStatus}:{}),
    ...(["incident","improvement","help"].includes(view)?{kind:view as SupportKind}:{})}),[view,statusTab,applied]);
  const applyFilters=()=>{const date=/^\d{4}-\d{2}-\d{2}$/;
    if((from&&!date.test(from))||(to&&!date.test(to))||(from&&to&&from>to)){setError("Utiliza fechas AAAA-MM-DD válidas.");return;}
    setApplied({from:from.trim(),to:to.trim(),sender:sender.trim()});};
  const load=useCallback(async(more=false)=>{
    if(!gateway.listAdmin)return;const stamp=++revision.current;setLoading(true);setError("");
    try{const page=await gateway.listAdmin(filter(more?rows.length:0));if(stamp!==revision.current)return;
      setRows(current=>more?[...current,...page.items.filter(item=>!current.some(old=>old.id===item.id))]:page.items);setTotal(page.total);}
    catch{if(stamp===revision.current)setError("No se pudo cargar la bandeja de AYUDA.");}
    finally{if(stamp===revision.current)setLoading(false);}
  },[gateway,filter,rows.length]);
  useEffect(()=>{if(!visible||!backendReady)return;setSelected(null);setRows([]);setTotal(0);
    if(view==="archive"&&gateway.purgeExpired)void gateway.purgeExpired().then(()=>load()).catch(()=>{setError("La limpieza de solicitudes vencidas está pendiente.");void load();});
    else void load();return()=>{revision.current++;};},[visible,view,statusTab,gateway,applied,backendReady]);
  useSupportRefresh(visible&&backendReady,()=>{
    if(flight.current)return;void load();
    if(selected&&gateway.detail){const stamp=revision.current;void gateway.detail(selected.id).then(row=>{if(stamp===revision.current&&active.current.visible)setSelected(current=>current?.id===row.id?row:current);}).catch(()=>{});}
  },()=>{active.current={...active.current};revision.current++;flight.current=false;setBusy(false);setRows([]);setTotal(0);setSelected(null);setReply("");setReason("");pendingCommand.current=null;});
  const open=async(row:SupportReceipt)=>{if(!gateway.detail)return;const stamp=++revision.current;setError("");setSelected(row);setReply("");setReason("");
    try{const latest=await gateway.detail(row.id);if(stamp===revision.current&&active.current.visible)setSelected(current=>current?.id===row.id?latest:current);}catch{if(stamp===revision.current)setError("No se pudo abrir la solicitud.");}};
  const perform=async(row:SupportReceipt,action:"reply"|"internal_note"|"status"|"archive"|"reopen",body?:string,status?:SupportStatus)=>{
    if(!gateway.act||!row.revision||flight.current)return;const owner=active.current;flight.current=true;setBusy(true);setError("");
    const fingerprint=JSON.stringify({id:row.id,action,body,status,revision:row.revision});
    if(pendingCommand.current?.fingerprint!==fingerprint)pendingCommand.current={fingerprint,key:newSupportRequestKey()};
    try{const updated=await gateway.act(row.id,{key:pendingCommand.current.key,action,body,status,revision:row.revision});
      if(active.current!==owner)return;
      pendingCommand.current=null;
      setSelected(current=>current?.id===updated.id?updated:current);setRows(current=>current.map(item=>item.id===updated.id?updated:item));
      setReply("");setReason("");void load();}
    catch{if(active.current!==owner)return;setError("No se confirmó el cambio. Recarga el hilo antes de repetirlo.");
      if(gateway.detail)try{const latest=await gateway.detail(row.id);if(active.current===owner)setSelected(current=>current?.id===latest.id?latest:current);}catch{}}
    finally{if(active.current===owner){flight.current=false;setBusy(false);}}
  };
  const status=(row:SupportReceipt,next:SupportStatus)=>{
    if(next==="solved"||next==="rejected"){
      if(Platform.OS==="ios")Alert.prompt(next==="solved"?"Registrar resolución":"Motivo del rechazo",
        "Escribe un motivo visible para el remitente.",value=>{if(value?.trim())void perform(row,"status",value.trim(),next);},"plain-text");
      else{setSelected(row);setError("Escribe el motivo en el detalle antes de cambiar el estado.");}
    }else void perform(row,"status",undefined,next);
  };
  const swipe=(row:SupportReceipt,direction:"right"|"left")=>{
    const positive=handedness==="right"?direction==="right":direction==="left";
    const next=positive?"solved":"rejected";
    Alert.alert(positive?"Marcar solucionada":"Marcar rechazada",`¿Quieres cambiar ${row.reference}?`,[
      {text:"Cancelar",style:"cancel"},{text:"Continuar",onPress:()=>status(row,next)}]);
  };
  const openFile=async(id:string)=>{if(!gateway.fileUrl)return;try{await Linking.openURL(await gateway.fileUrl(id));}
    catch{setError("No se pudo abrir el adjunto privado.");}};
  const rowCard=(row:SupportReceipt)=>{let x=0,y=0,swiped=false;return <View key={row.id} style={styles.card}
    onTouchStart={event=>{x=event.nativeEvent.pageX;y=event.nativeEvent.pageY;}}
    onTouchEnd={event=>{const dx=event.nativeEvent.pageX-x,dy=event.nativeEvent.pageY-y;
      if(Math.abs(dx)>75&&Math.abs(dy)<35){swiped=true;setTimeout(()=>{swiped=false;},400);swipe(row,dx>0?"right":"left");}}}>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Abrir ${row.reference}`} onPress={()=>{if(swiped){swiped=false;return;}void open(row);}}>
      <View style={styles.line}><Text style={styles.heading}>{row.reference} · {kinds[row.kind!]??"AYUDA"}</Text><Text style={styles.badge}>{labels[row.status]}</Text></View>
      <Text style={styles.body} numberOfLines={2}>{row.detail}</Text>
      <Text style={styles.meta}>{row.createdAt?new Date(row.createdAt).toLocaleString("es-ES"):""} · {row.businessId?row.businessName??"Empresa":"Particular"} · {row.senderName??row.senderId?.slice(0,8)??""}{row.hasResponse?" · Respondida":""}</Text>
      {row.archivedAt&&<Text style={styles.meta}>Archivada</Text>}
    </TouchableOpacity>
    <View style={styles.actions}><TouchableOpacity accessibilityRole="button" accessibilityLabel={`Solucionar ${row.reference}`} onPress={()=>status(row,"solved")} style={styles.action}><Text style={styles.actionText}>SOLUCIONAR</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={`Rechazar ${row.reference}`} onPress={()=>status(row,"rejected")} style={styles.action}><Text style={styles.actionText}>RECHAZAR</Text></TouchableOpacity></View>
  </View>;};
  if(!backendReady)return <Modal visible={visible} animationType="slide" onRequestClose={back}><View style={[styles.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{titles[view]}</Text></View>
    <Text accessibilityRole="alert" style={[styles.body,{paddingHorizontal:18,paddingTop:24}]}>La recepción de solicitudes está pendiente de conexión al servidor.</Text>
    {navigation}
  </View></Modal>;
  return <Modal visible={visible} animationType="slide" onRequestClose={back}><KeyboardAvoidingView style={[styles.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==="ios"?"padding":"height"}>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>{titles[view]}</Text></View>
    {view==="pending"&&<View style={styles.actions}>{(["in_review","pending"] as const).map(value=><TouchableOpacity key={value} accessibilityRole="button" accessibilityState={{selected:statusTab===value}} onPress={()=>setStatusTab(value)} style={[styles.filter,statusTab===value&&styles.active]}><Text style={styles.body}>{labels[value]}</Text></TouchableOpacity>)}</View>}
    <View style={styles.filterRow}><TextInput accessibilityLabel="Desde fecha" placeholder="Desde AAAA-MM-DD" value={from} onChangeText={setFrom} style={styles.filterInput}/><TextInput accessibilityLabel="Hasta fecha" placeholder="Hasta AAAA-MM-DD" value={to} onChangeText={setTo} style={styles.filterInput}/><TextInput accessibilityLabel="Filtrar remitente" placeholder="Remitente" value={sender} onChangeText={setSender} style={styles.filterInput}/><TouchableOpacity accessibilityRole="button" onPress={applyFilters} style={styles.action}><Text style={styles.actionText}>FILTRAR</Text></TouchableOpacity></View>
    {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
      {selected?<View style={styles.card}>
        <TouchableOpacity accessibilityRole="button" onPress={()=>setSelected(null)}><Text style={styles.link}>‹ Volver a la bandeja</Text></TouchableOpacity>
        <Text style={styles.heading}>{selected.reference} · {kinds[selected.kind!]}</Text><Text style={styles.badge}>{labels[selected.status]}</Text>
        <Text style={styles.body}>{selected.detail}</Text>
        {selected.messages?.map(message=><View key={message.id} style={styles.message}><Text style={styles.meta}>{message.internal?"NOTA INTERNA":"MENSAJE"} · {new Date(message.createdAt).toLocaleString("es-ES")}</Text><Text style={styles.body}>{message.body}</Text></View>)}
        {selected.attachments?.map(file=><TouchableOpacity key={file.id} accessibilityRole="button" accessibilityLabel={`Abrir ${file.name}`} onPress={()=>void openFile(file.id)}><Text style={styles.link}>{file.name}</Text></TouchableOpacity>)}
        {!!selected.history?.length&&<View style={styles.message}><Text style={styles.heading}>Historial</Text>{selected.history.map(event=><Text key={event.id} style={styles.meta}>{new Date(event.createdAt).toLocaleString("es-ES")} · {event.action}{event.toStatus?` · ${labels[event.toStatus]}`:""}{event.reason?` · ${event.reason}`:""}</Text>)}</View>}
        {!selected.archivedAt&&<><TextInput accessibilityLabel="Respuesta o nota interna" placeholder={internal?"Nota solo para ADMIN":"Respuesta al remitente"} multiline value={reply} onChangeText={setReply} style={styles.input}/>
          <View style={styles.actions}><TouchableOpacity accessibilityRole="button" accessibilityState={{selected:internal}} onPress={()=>setInternal(value=>!value)} style={styles.action}><Text style={styles.actionText}>{internal?"NOTA INTERNA":"RESPUESTA PÚBLICA"}</Text></TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" disabled={busy||!reply.trim()} onPress={()=>void perform(selected,internal?"internal_note":"reply",reply.trim())} style={styles.action}><Text style={styles.actionText}>ENVIAR</Text></TouchableOpacity></View>
          <TextInput accessibilityLabel="Motivo de resolución o rechazo" placeholder="Motivo de resolución o rechazo" value={reason} onChangeText={setReason} style={styles.input}/>
          <View style={styles.actions}>{(["in_review","pending","solved","rejected"] as const).map(value=><TouchableOpacity key={value} accessibilityRole="button" disabled={busy||selected.status===value||(["solved","rejected"].includes(value)&&!reason.trim())} onPress={()=>void perform(selected,"status",reason.trim()||undefined,value)} style={styles.action}><Text style={styles.actionText}>{labels[value]}</Text></TouchableOpacity>)}</View></>}
        <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={()=>void perform(selected,selected.archivedAt?"reopen":"archive")} style={styles.action}><Text style={styles.actionText}>{selected.archivedAt?"REABRIR":"ARCHIVAR"}</Text></TouchableOpacity>
      </View>:<>
        {rows.map(rowCard)}
        {!loading&&rows.length===0&&<Text style={styles.meta}>No hay solicitudes en esta bandeja.</Text>}
        {rows.length<total&&<TouchableOpacity accessibilityRole="button" disabled={loading} onPress={()=>void load(true)} style={styles.action}><Text style={styles.actionText}>CARGAR MÁS</Text></TouchableOpacity>}
      </>}
      {loading&&<Text style={styles.meta}>Cargando…</Text>}
    </ScrollView>
    {navigation}
  </KeyboardAvoidingView></Modal>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:"#fff"},header:{minHeight:66,paddingHorizontal:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},title:{fontSize:21,fontWeight:"700",color:"#17212b",flexShrink:1},content:{padding:16,gap:12,paddingBottom:112},card:{padding:14,borderWidth:1,borderColor:"#d2d8de",borderRadius:16,gap:10,backgroundColor:"#fff"},line:{flexDirection:"row",justifyContent:"space-between",gap:8,alignItems:"center"},heading:{color:"#17212b",fontSize:16,fontWeight:"700",flexShrink:1},body:{color:"#17212b",fontSize:15,lineHeight:21},meta:{color:"#59636e",fontSize:12},badge:{color:"#343d47",fontSize:11,fontWeight:"700",backgroundColor:"#eef0f3",paddingHorizontal:8,paddingVertical:5,borderRadius:10},actions:{flexDirection:"row",flexWrap:"wrap",gap:8,paddingHorizontal:14},action:{minHeight:44,minWidth:90,alignItems:"center",justifyContent:"center",borderRadius:11,borderWidth:1,borderColor:"#b4bdc6",paddingHorizontal:10,paddingVertical:6},actionText:{fontSize:12,fontWeight:"700",color:"#17212b"},filter:{minHeight:44,borderRadius:10,borderWidth:1,borderColor:"#b4bdc6",padding:10},filterRow:{paddingHorizontal:14,flexDirection:"row",flexWrap:"wrap",gap:6},filterInput:{minHeight:44,minWidth:120,flexGrow:1,borderWidth:1,borderColor:"#b4bdc6",borderRadius:10,paddingHorizontal:9,color:"#17212b"},active:{backgroundColor:"#e6eef5"},message:{borderTopWidth:1,borderColor:"#d2d8de",paddingTop:8,gap:4},input:{minHeight:50,borderWidth:1,borderColor:"#b4bdc6",borderRadius:10,padding:10,color:"#17212b",fontSize:16},link:{color:"#225fb0",fontSize:15,paddingVertical:8},error:{color:"#a1232e",paddingHorizontal:16,paddingVertical:4}});
