import React, { useEffect, useRef, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Keyboard, Platform, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {createSupportAttachmentStore,type SupportAttachment} from "@/lib/supportAttachments";
import type { SupportGateway, SupportKind, SupportReceipt } from "@/lib/supportRequests";
import { sendSupportRequest, SUPPORT_ORBIT_ACTIONS } from "@/lib/supportRequests";
import { GoCloseButton } from "@/components/ui/GoCloseButton";

/** No production gateway is configured until receipt, privacy and authorization are verified. */
export function LandingSupport({ visible, onClose, scopeKey, gateway, kind="incident" }: {
  visible: boolean; onClose: () => void; scopeKey: string; gateway?: SupportGateway; kind?: SupportKind | "mine";
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible,setKeyboardVisible]=useState(false);
  useEffect(()=>{const show=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboardVisible(true));
    const hide=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillHide":"keyboardDidHide",()=>setKeyboardVisible(false));return()=>{show.remove();hide.remove();};},[]);
  const back=()=>{if(keyboardVisible){Keyboard.dismiss();return;}onClose();};
  const [drafts, setDrafts] = useState({ incident: "", improvement: "", help: "" });
  const [busy,setBusy]=useState(false),[picking,setPicking]=useState(false);
  const [files,setFiles]=useState<Record<SupportKind,SupportAttachment[]>>({incident:[],improvement:[],help:[]});
  const [expanded,setExpanded]=useState<string|null>(null);
  const store=useRef<ReturnType<typeof createSupportAttachmentStore>|null>(null),pickerFlight=useRef(false);
  useEffect(()=>{const owned=createSupportAttachmentStore();store.current=owned;return()=>{store.current=null;void owned.dispose().catch(()=>{});};},[scopeKey]);
  const [error, setError] = useState(""), [receipt, setReceipt] = useState<SupportReceipt | null>(null);
  const [requests, setRequests] = useState<SupportReceipt[] | null>(null);
  const identity = useRef({key:scopeKey,kind,visible});
  if(identity.current.key!==scopeKey||identity.current.kind!==kind||identity.current.visible!==visible)identity.current={key:scopeKey,kind,visible};
  const formIdentity=useRef({key:scopeKey,kind});
  if(formIdentity.current.key!==scopeKey||formIdentity.current.kind!==kind)formIdentity.current={key:scopeKey,kind};
  const flight = useRef(false), requestKey = useRef<string | null>(null);
  useEffect(() => {
    setDrafts({incident:"",improvement:"",help:""}); setFiles({incident:[],improvement:[],help:[]});setExpanded(null); setReceipt(null);
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
    if (!gateway || kind === "mine" || flight.current || picking || !drafts[kind].trim() || files[kind].length>0&&!gateway.supportsAttachments) return;
    flight.current=true; setBusy(true); setError(""); const owner=formIdentity.current;
    requestKey.current ??= "support_"+Date.now().toString(36)+Math.random().toString(36).slice(2);
    try {
      const saved=await sendSupportRequest(gateway,{kind,message:drafts[kind],requestKey:requestKey.current},files[kind]);
      if(formIdentity.current!==owner)return;
      setReceipt(saved); for(const file of files[kind])void store.current?.remove(file.id).catch(()=>{});setFiles(values=>({...values,[kind]:[]})); setDrafts(values=>({...values,[kind]:""})); requestKey.current=null;
    } catch { if(formIdentity.current===owner)setError("No se ha confirmado el envío. Conservamos tu texto y adjuntos."); }
    finally { if(formIdentity.current===owner){flight.current=false;setBusy(false);} }
  };
  const attach=async(photo:boolean)=>{
    if(kind==="mine"||kind==="help"||pickerFlight.current||busy||!store.current)return;
    const owner=identity.current,owned=store.current,selectedKind=kind,imported:SupportAttachment[]=[];
    pickerFlight.current=true;setPicking(true);setError("");Keyboard.dismiss();
    try{const result=photo?await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true,selectionLimit:5}):await DocumentPicker.getDocumentAsync({type:["application/pdf","image/*"],copyToCacheDirectory:true,multiple:true});
      if(result.canceled||identity.current!==owner)return;
      for(const asset of result.assets){if(identity.current!==owner)break;imported.push(await owned.importAsset({uri:asset.uri,name:"name" in asset?asset.name:asset.fileName??undefined,mimeType:asset.mimeType,size:"fileSize" in asset?asset.fileSize:"size" in asset?asset.size:undefined}));}
      if(identity.current!==owner){await Promise.all(imported.map(f=>owned.remove(f.id)));return;}
      setFiles(current=>({...current,[selectedKind]:[...current[selectedKind],...imported]}));requestKey.current=null;
    }catch(e){await Promise.all(imported.map(f=>owned.remove(f.id).catch(()=>{})));if(identity.current===owner)setError(e instanceof Error?e.message:"No se pudo adjuntar el archivo.");}
    finally{pickerFlight.current=false;setPicking(false);}
  };
  const remove=async(file:SupportAttachment)=>{if(kind==="mine"||!store.current)return;const owner=identity.current,selectedKind=kind;
    try{await store.current.remove(file.id);if(identity.current===owner){setFiles(current=>({...current,[selectedKind]:current[selectedKind].filter(f=>f.id!==file.id)}));requestKey.current=null;}}
    catch{if(identity.current===owner)setError("No se pudo quitar el archivo. Reintenta.");}};
  const disabled=kind==="mine"||!gateway||busy||picking||!drafts[kind].trim()||files[kind].length>0&&!gateway.supportsAttachments;
  const statusLabel={received:"Recibida",in_progress:"En revisión",answered:"Resuelta",closed:"Cerrada"};
  return <Modal visible={visible} animationType="slide" onRequestClose={back}>
    <KeyboardAvoidingView style={[s.screen,{paddingTop:insets.top,paddingBottom:insets.bottom}]} behavior={Platform.OS==="ios"?"padding":undefined}>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>{SUPPORT_ORBIT_ACTIONS.find(a=>a.kind===kind)?.title}</Text></View>
      <View style={{flex:1}}><ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.content}>
        {kind==="mine"?<>
          {gateway&&requests===null&&!error?<Text style={s.hint}>Cargando…</Text>:(!gateway||requests?.length===0)?<View testID="support-empty" style={s.empty}><Feather name="inbox" size={30} color="#535c66"/><Text style={s.text}>Tus solicitudes aparecerán aquí.</Text></View>:null}
          {requests?.map(row=><TouchableOpacity key={row.id} accessibilityRole="button" accessibilityState={{expanded:expanded===row.id}} accessibilityLabel={row.summary||row.reference} onPress={()=>setExpanded(expanded===row.id?null:row.id)} style={s.card}>
            <View style={s.row}><Text style={[s.text,{flex:1,fontWeight:"700"}]}>{row.summary||row.reference}</Text><Text style={s.badge}>{statusLabel[row.status]}</Text></View>
            <Text style={s.hint}>{[row.kind&&SUPPORT_ORBIT_ACTIONS.find(a=>a.kind===row.kind)?.title,row.createdAt&&Number.isFinite(Date.parse(row.createdAt))?new Date(row.createdAt).toLocaleDateString("es-ES"):null].filter(Boolean).join(" · ")}</Text>
            {expanded===row.id&&<><Text style={s.hint}>{row.reference}</Text>{!!row.detail&&<Text style={s.text}>{row.detail}</Text>}{!!row.response&&<Text style={s.text}>{row.response}</Text>}</>}
          </TouchableOpacity>)}
        </>:<>
          <TextInput accessibilityLabel="Descripción de la solicitud" multiline maxLength={4000} value={drafts[kind]} editable={!busy} style={s.input} onChangeText={value=>{setDrafts(current=>({...current,[kind]:value}));requestKey.current=null;setReceipt(null);}}/>
          {kind!=="help"&&<View style={s.row}>
            <TouchableOpacity accessibilityRole="button" disabled={busy||picking} onPress={()=>void attach(true)} style={s.attachmentButton}><Feather name="image" size={21} color="#17212b"/><Text style={s.text}>Adjuntar fotografía</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={busy||picking} onPress={()=>void attach(false)} style={s.attachmentButton}><Feather name="paperclip" size={21} color="#17212b"/><Text style={s.text}>Adjuntar archivo</Text></TouchableOpacity>
          </View>}
          {files[kind].map(file=><View key={file.id} style={s.file}>
            {file.mime.startsWith("image/")?<Image accessibilityLabel={file.name} source={{uri:file.uri}} style={s.preview}/>:<Feather name="file-text" size={28} color="#17212b"/>}
            <Text style={[s.text,{flex:1}]}>{file.name}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={"Quitar "+file.name} disabled={busy||picking} onPress={()=>void remove(file)} style={s.remove}><Feather name="x" size={22} color="#a1232e"/></TouchableOpacity>
          </View>)}
          <TouchableOpacity accessibilityRole="button" accessibilityState={{disabled}} accessibilityHint={!gateway?"Envío todavía no disponible":undefined} disabled={disabled} onPress={submit} style={[s.send,disabled&&s.sendDisabled]}><Text style={[s.sendText,disabled&&s.sendTextDisabled]}>{busy?"Enviando…":"ENVIAR"}</Text></TouchableOpacity>
          {!gateway&&<Text style={s.hint}>Disponible próximamente</Text>}
        </>}
        {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!receipt&&<Text accessibilityLiveRegion="polite" style={s.text}>Recibida · {receipt.reference}</Text>}
      </ScrollView><View testID="support-floating-navigation" style={s.navigation}><GoCloseButton level="panel" appearance="light" accessibilityLabel="Volver a las órbitas de ayuda" onPress={back}/></View></View>
    </KeyboardAvoidingView>
  </Modal>;
}
const s=StyleSheet.create({screen:{flex:1,backgroundColor:"#ffffff"},header:{paddingHorizontal:18,paddingVertical:16},title:{color:"#17212b",fontSize:22,fontWeight:"700"},content:{padding:18,gap:14,paddingBottom:88},text:{color:"#17212b",fontSize:16,lineHeight:23,flexShrink:1},hint:{color:"#515d69",fontSize:13,lineHeight:19},input:{minHeight:180,maxHeight:320,borderWidth:1,borderColor:"#b4bdc6",borderRadius:16,color:"#17212b",backgroundColor:"#fafbfc",padding:16,fontSize:18,lineHeight:26,textAlignVertical:"top"},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},attachmentButton:{minHeight:48,flexDirection:"row",alignItems:"center",gap:8,padding:12,borderWidth:1,borderColor:"#b4bdc6",borderRadius:14,backgroundColor:"#f4f6f8"},file:{flexDirection:"row",alignItems:"center",gap:12,padding:10,borderWidth:1,borderColor:"#d2d8de",borderRadius:14},preview:{width:64,height:64,borderRadius:8},remove:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},send:{minHeight:52,borderRadius:18,backgroundColor:"#17212b",alignItems:"center",justifyContent:"center"},sendDisabled:{backgroundColor:"#e7eaee",borderWidth:1,borderColor:"#c2cad2"},sendText:{color:"#ffffff",fontSize:15,fontWeight:"800"},sendTextDisabled:{color:"#515d69"},navigation:{position:"absolute",right:18,bottom:12},empty:{alignItems:"center",paddingVertical:36,gap:14},card:{padding:16,gap:10,borderWidth:1,borderColor:"#d2d8de",borderRadius:16,backgroundColor:"#fff"},badge:{color:"#343d47",fontSize:12,fontWeight:"600",backgroundColor:"#eef0f3",paddingHorizontal:10,paddingVertical:6,borderRadius:12},error:{color:"#a1232e",fontSize:14,lineHeight:20}});
