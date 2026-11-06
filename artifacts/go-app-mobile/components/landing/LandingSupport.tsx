import React, { useEffect, useRef, useState } from "react";
import type { TextInputInstance } from "react-native";
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Keyboard, Platform, StyleSheet, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {createSupportAttachmentStore,type SupportAttachment} from "@/lib/supportAttachments";
import type { SupportGateway, SupportKind, SupportReceipt } from "@/lib/supportRequests";
import { sendSupportRequest, SUPPORT_ORBIT_ACTIONS } from "@/lib/supportRequests";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoScreenHost } from "@/components/ui/GoScreenModal";
import { GOChatScreen } from "@/components/GOChatScreen";
import { GoNoteAttachmentMenu } from "@/components/notes/GoNoteAttachmentMenu";
import { IconButton,GoAssistantButton } from "@/components/booking-assistant/BookingAssistantUI";
import { useGoNoteVoice } from "@/hooks/useGoNoteVoice";

/** No production gateway is configured until receipt, privacy and authorization are verified. */
export function LandingSupport({ visible, onClose, scopeKey, gateway, kind="incident",handedness="right",assistanceResponder }: {
  visible: boolean; onClose: () => void; scopeKey: string; gateway?: SupportGateway; kind?: SupportKind | "mine";
  handedness?:"left"|"right";assistanceResponder?:(question:string,source:string)=>Promise<{answer:string;draft?:string}>;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible,setKeyboardVisible]=useState(false);
  useEffect(()=>{const show=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboardVisible(true));
    const hide=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillHide":"keyboardDidHide",()=>setKeyboardVisible(false));return()=>{show.remove();hide.remove();};},[]);
  const editor=useRef<TextInputInstance|null>(null),nestedBack=useRef<(()=>boolean)|null>(null);
  const [toolsOpen,setToolsOpen]=useState(false),[bodyHeight,setBodyHeight]=useState(360),[textHeight,setTextHeight]=useState(96);
  const [aiSession,setAiSession]=useState<{key:string;kind:typeof kind;source:string}|null>(null),aiSequence=useRef(0);
  const liveAi=useRef(aiSession);liveAi.current=aiSession;
  const back=()=>{if(nestedBack.current?.())return;if(keyboardVisible||Keyboard.isVisible?.()){editor.current?.blur();Keyboard.dismiss();return;}voice.abort();setToolsOpen(false);onClose();};
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
  const draftsRef=useRef(drafts);draftsRef.current=drafts;
  const selection=useRef({start:0,end:0}),speechTarget=useRef<{owner:typeof formIdentity.current;kind:SupportKind;base:string;end:number}|null>(null);
  const voice=useGoNoteVoice({visible:visible&&kind!=="mine"&&!aiSession,identity:scopeKey+":"+kind,title:"",setTitle:()=>{},setDetail:()=>{},english:false,
    onPreparedText:text=>{const target=speechTarget.current;speechTarget.current=null;if(!target||formIdentity.current!==target.owner)return;
      const current=draftsRef.current[target.kind],point=Math.max(0,Math.min(current.length,current===target.base?target.end:selection.current.end));
      const before=current.slice(0,point),after=current.slice(point),spoken=text.trim();if(!spoken)return;
      const inserted=(before&&!/\s$/.test(before)?" ":"")+spoken+(after&&!/^\s/.test(after)?" ":"");
      setDrafts(values=>({...values,[target.kind]:before+inserted+after}));selection.current={start:point+inserted.length,end:point+inserted.length};requestKey.current=null;
    }});
  const flight = useRef(false), requestKey = useRef<string | null>(null);
  useEffect(() => {
    setDrafts({incident:"",improvement:"",help:""}); setFiles({incident:[],improvement:[],help:[]});setExpanded(null); setReceipt(null);
    setRequests(null); setError(""); setBusy(false);setAiSession(null);setToolsOpen(false); requestKey.current=null; flight.current=false;
  }, [scopeKey]);
  useEffect(()=>{setReceipt(null);setError("");setBusy(false);setToolsOpen(false);setAiSession(null);selection.current={start:0,end:0};flight.current=false;requestKey.current=null;},[kind]);
  useEffect(() => {
    if (!visible || kind !== "mine" || !gateway) return;
    let active = true; const owner = identity.current;
    setRequests(null); setError("");
    gateway.listOwn().then(rows => { if (active && identity.current === owner) setRequests(rows); })
      .catch(() => { if (active && identity.current === owner) setError("No se pudieron consultar tus solicitudes. Inténtalo de nuevo."); });
    return () => { active=false; };
  }, [visible, kind, gateway, scopeKey]);
  const submit = async () => {
    if (!gateway || kind === "mine" || flight.current || picking ||voice.status!=="idle"|| !drafts[kind].trim() || files[kind].length>0&&!gateway.supportsAttachments) return;
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
      setFiles(current=>({...current,[selectedKind]:[...current[selectedKind],...imported]}));setToolsOpen(false);requestKey.current=null;
    }catch(e){await Promise.all(imported.map(f=>owned.remove(f.id).catch(()=>{})));if(identity.current===owner)setError(e instanceof Error?e.message:"No se pudo adjuntar el archivo.");}
    finally{pickerFlight.current=false;setPicking(false);}
  };
  const remove=async(file:SupportAttachment)=>{if(kind==="mine"||!store.current)return;const owner=identity.current,selectedKind=kind;
    try{await store.current.remove(file.id);if(identity.current===owner){setFiles(current=>({...current,[selectedKind]:current[selectedKind].filter(f=>f.id!==file.id)}));requestKey.current=null;}}
    catch{if(identity.current===owner)setError("No se pudo quitar el archivo. Reintenta.");}};
  const disabled=kind==="mine"||!gateway||busy||picking||voice.status!=="idle"||!drafts[kind].trim()||drafts[kind].length>4000||files[kind].length>0&&!gateway.supportsAttachments;
  const statusLabel={received:"Recibida",in_progress:"En revisión",answered:"Resuelta",closed:"Cerrada"};
  const title=SUPPORT_ORBIT_ACTIONS.find(a=>a.kind===kind)!.title;
  const toggleVoice=()=>{if(kind==="mine"||busy||picking)return;if(voice.status==="idle")speechTarget.current={owner:formIdentity.current,kind,base:draftsRef.current[kind],end:selection.current.end};voice.focus("detail");void voice.toggle();};
  const openAI=()=>{if(busy||picking)return;voice.abort();editor.current?.blur();Keyboard.dismiss();setToolsOpen(false);setAiSession({key:scopeKey+":"+kind+":"+(++aiSequence.current),kind,source:kind==="mine"?"":draftsRef.current[kind]});};
  const fileList=kind!=="mine"&&files[kind].map(file=><View key={file.id} style={s.file}>
    {file.mime.startsWith("image/")?<Image accessibilityLabel={file.name} source={{uri:file.uri}} style={s.preview}/>:<Feather name="file-text" size={24} color="#17212b"/>}
    <Text style={[s.text,{flex:1}]}>{file.name}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={"Quitar "+file.name} disabled={busy||picking} onPress={()=>void remove(file)} style={s.remove}><Feather name="x" size={22} color="#a1232e"/></TouchableOpacity>
  </View>);
  return <Modal visible={visible} animationType="slide" onRequestClose={back}>
    <GoScreenHost registerBack={handler=>{nestedBack.current=handler;}}>
    <KeyboardAvoidingView style={[s.screen,{paddingTop:insets.top,paddingBottom:keyboardVisible?0:insets.bottom}]} behavior={Platform.OS==="ios"?"padding":"height"}>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>{title}</Text></View>
      <View testID="support-workspace" style={s.workspace} onLayout={event=>setBodyHeight(event.nativeEvent.layout.height)}>
      {kind==="mine"?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.history}>
        {gateway&&requests===null&&!error?<Text style={s.hint}>Cargando…</Text>:(!gateway||requests?.length===0)?<View testID="support-empty" style={s.empty}><Feather name="inbox" size={30} color="#535c66"/><Text style={s.text}>Tus solicitudes aparecerán aquí.</Text></View>:null}
        {requests?.map(row=><TouchableOpacity key={row.id} accessibilityRole="button" accessibilityState={{expanded:expanded===row.id}} accessibilityLabel={row.summary||row.reference} onPress={()=>setExpanded(expanded===row.id?null:row.id)} style={s.card}>
          <View style={s.row}><Text style={[s.text,{flex:1,fontWeight:"700"}]}>{row.summary||row.reference}</Text><Text style={s.badge}>{statusLabel[row.status]}</Text></View>
          <Text style={s.hint}>{[row.kind&&SUPPORT_ORBIT_ACTIONS.find(a=>a.kind===row.kind)?.title,row.createdAt&&Number.isFinite(Date.parse(row.createdAt))?new Date(row.createdAt).toLocaleDateString("es-ES"):null].filter(Boolean).join(" · ")}</Text>
          {expanded===row.id&&<><Text style={s.hint}>{row.reference}</Text>{!!row.detail&&<Text style={s.text}>{row.detail}</Text>}{!!row.response&&<Text style={s.text}>{row.response}</Text>}</>}
        </TouchableOpacity>)}
      </ScrollView>:<>
        <ScrollView testID="support-writing-scroll" style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.writing}>
          {fileList}
          <View testID="support-composer" style={[s.composer,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>
            <TextInput ref={editor} testID="support-text" accessibilityLabel="Descripción de la solicitud" multiline scrollEnabled maxLength={4000} value={drafts[kind]} editable={!busy}
              style={[s.input,{height:Math.max(56,Math.min(textHeight,220,Math.max(56,bodyHeight-48)))}]}
              onFocus={()=>{setToolsOpen(false);voice.focus("detail");}} onContentSizeChange={event=>setTextHeight(event.nativeEvent.contentSize.height)}
              onSelectionChange={event=>{selection.current=event.nativeEvent.selection;}}
              onChangeText={value=>{setDrafts(current=>({...current,[kind]:value}));requestKey.current=null;setReceipt(null);}}/>
            <View style={{alignSelf:"flex-end"}}><IconButton appearance="note" icon={voice.status==="listening"?"square":"mic"} label={voice.status==="listening"?"Detener dictado":"Dictar solicitud"} disabled={busy||picking||voice.status==="preparing"||voice.status==="transcribing"} onPress={toggleVoice}/></View>
          </View>
        </ScrollView>
        {toolsOpen&&kind!=="help"&&<GoNoteAttachmentMenu tray handedness={handedness} maxHeight={Math.max(80,Math.min(260,bodyHeight-16))} disabled={busy||picking} onFile={()=>void attach(false)} onPhotos={()=>void attach(true)}/>}
      </>}
      </View>
      {!!(voice.error||voice.notice||error)&&<Text accessibilityRole="alert" style={s.error}>{error||voice.error||voice.notice}</Text>}
      {voice.status==="listening"&&<Text accessibilityLiveRegion="polite" style={s.activity}>● Escuchando</Text>}
      {(voice.status==="preparing"||voice.status==="transcribing")&&<Text accessibilityLiveRegion="polite" style={s.hint}>{voice.status==="transcribing"?"Transcribiendo…":"Preparando micrófono…"}</Text>}
      {!!receipt&&<Text accessibilityLiveRegion="polite" style={s.text}>Recibida · {receipt.reference}</Text>}
      <View testID="support-thumb-controls" style={[s.controls,{flexDirection:handedness==="left"?"row-reverse":"row",justifyContent:kind==="mine"?"flex-end":"space-between"}]}>
        {kind!=="mine"&&kind!=="help"&&<IconButton appearance="note" icon="paperclip" label={toolsOpen?"Ocultar adjuntos":"Adjuntar referencia"} disabled={busy||picking} onPress={()=>{editor.current?.blur();Keyboard.dismiss();setToolsOpen(open=>!open);}}/>}
        <GoAssistantButton onPress={openAI} disabled={busy||picking||voice.status==="transcribing"}/>
        {kind!=="mine"&&<TouchableOpacity testID="support-send" accessibilityRole="button" accessibilityState={{disabled}} accessibilityHint={!gateway?"Envío no disponible":undefined} disabled={disabled} onPress={submit} style={[s.send,disabled&&s.sendDisabled]}><Text style={[s.sendText,disabled&&s.sendTextDisabled]}>{busy?"Enviando…":"ENVIAR"}</Text></TouchableOpacity>}
        <GoCloseButton level="panel" appearance="light" accessibilityLabel={keyboardVisible?"Ocultar teclado":"Volver a las órbitas de ayuda"} onPress={back}/>
      </View>
    </KeyboardAvoidingView>
    {aiSession&&visible&&<GOChatScreen key={aiSession.key} visible handedness={handedness} onClose={()=>setAiSession(null)} consultation={{scopeKey:aiSession.key,title,sourceText:aiSession.source,respond:assistanceResponder,onAcceptDraft:aiSession.kind==="mine"?undefined:(proposal,baseline)=>{
      const target=aiSession.kind;if(target==="mine"||!identity.current.visible||liveAi.current?.key!==aiSession.key||formIdentity.current.key!==scopeKey||formIdentity.current.kind!==target)return;
      if(draftsRef.current[target]!==baseline){setError("El texto ha cambiado. Conservamos tu borrador.");return;}
      setDrafts(values=>({...values,[target]:proposal}));requestKey.current=null;
    }}}/>}
    </GoScreenHost>
  </Modal>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#ffffff"},workspace:{flex:1,minHeight:0,marginHorizontal:16},header:{paddingHorizontal:18,paddingVertical:12},title:{color:"#17212b",fontSize:22,fontWeight:"700"},
 writing:{flexGrow:1,justifyContent:"flex-end",paddingVertical:10,gap:10},history:{paddingVertical:12,gap:14},text:{color:"#17212b",fontSize:16,lineHeight:23,flexShrink:1},hint:{color:"#515d69",fontSize:13,lineHeight:19,paddingHorizontal:16},
 composer:{borderWidth:1,borderColor:"#b4bdc6",borderRadius:16,backgroundColor:"#fafbfc",padding:6,gap:4,alignItems:"flex-end"},input:{flex:1,minWidth:0,color:"#17212b",padding:10,fontSize:18,lineHeight:25,textAlignVertical:"top"},
 row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},file:{flexDirection:"row",alignItems:"center",gap:8,padding:6,borderWidth:1,borderColor:"#d2d8de",borderRadius:12},preview:{width:44,height:44,borderRadius:8},remove:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},
 controls:{paddingHorizontal:16,paddingTop:6,paddingBottom:10,alignItems:"center",gap:8,flexShrink:0},send:{width:"33%",maxWidth:140,minHeight:48,borderRadius:16,backgroundColor:"#16834a",alignItems:"center",justifyContent:"center"},sendDisabled:{backgroundColor:"#e7eaee",borderWidth:1,borderColor:"#c2cad2"},sendText:{color:"#ffffff",fontSize:14,fontWeight:"800"},sendTextDisabled:{color:"#515d69"},
 empty:{alignItems:"center",paddingVertical:36,gap:14},card:{padding:16,gap:10,borderWidth:1,borderColor:"#d2d8de",borderRadius:16,backgroundColor:"#fff"},badge:{color:"#343d47",fontSize:12,fontWeight:"600",backgroundColor:"#eef0f3",paddingHorizontal:10,paddingVertical:6,borderRadius:12},error:{color:"#a1232e",fontSize:14,lineHeight:20,paddingHorizontal:16},activity:{color:"#a1232e",fontSize:13,paddingHorizontal:16}
});
