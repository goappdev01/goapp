import React, { useEffect, useRef, useState } from "react";
import type { TextInputInstance } from "react-native";
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Keyboard, Platform, StyleSheet, Image, Linking } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import {createSupportAttachmentStore,type SupportAttachment} from "@/lib/supportAttachments";
import type { SupportGateway, SupportKind, SupportReceipt, SupportStatus } from "@/lib/supportRequests";
import { sendSupportRequest, SUPPORT_ORBIT_ACTIONS, newSupportRequestKey } from "@/lib/supportRequests";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import {GoNavigationFloating} from "@/components/ui/GoNavigationFloating";
import { GoScreenHost } from "@/components/ui/GoScreenModal";
import { GOChatScreen } from "@/components/GOChatScreen";
import { GoNoteAttachmentMenu } from "@/components/notes/GoNoteAttachmentMenu";
import { IconButton,GoAssistantButton,GoSendButton } from "@/components/booking-assistant/BookingAssistantUI";
import { SupportVoiceNotice } from "./SupportVoiceNotice";
import { useGoNoteVoice } from "@/hooks/useGoNoteVoice";

export function LandingSupport({ visible, onClose, scopeKey, gateway, businessId, kind="incident",handedness="right",assistanceResponder,initialAssistantRequest=0 }: {
  visible: boolean; onClose: () => void; scopeKey: string; gateway?: SupportGateway; businessId?:string|null; kind?: SupportKind | "mine";
  handedness?:"left"|"right";assistanceResponder?:(question:string,source:string)=>Promise<{answer:string;draft?:string}>;initialAssistantRequest?:number;
}) {
  const insets = useSafeAreaInsets();
  const [keyboardVisible,setKeyboardVisible]=useState(false);
  useEffect(()=>{const show=Keyboard.addListener(Platform.OS==="ios"?"keyboardWillShow":"keyboardDidShow",()=>setKeyboardVisible(true));
    const hide=Keyboard.addListener("keyboardDidHide",()=>setKeyboardVisible(false));return()=>{show.remove();hide.remove();};},[]);
  const editor=useRef<TextInputInstance|null>(null),nestedBack=useRef<(()=>boolean)|null>(null);
  const [toolsOpen,setToolsOpen]=useState(false),[bodyHeight,setBodyHeight]=useState(360),[textHeight,setTextHeight]=useState(96);
  const [voiceAttempt,setVoiceAttempt]=useState(0);
  const [composerDockHeight,setComposerDockHeight]=useState(200);
  const [aiSession,setAiSession]=useState<{key:string;kind:typeof kind;source:string}|null>(null),aiSequence=useRef(0);
  const liveAi=useRef(aiSession);liveAi.current=aiSession;
  const back=()=>{if(keyboardVisible||Keyboard.isVisible?.()){editor.current?.blur();Keyboard.dismiss();return;}if(nestedBack.current?.())return;voice.abort();setToolsOpen(false);onClose();};
  const [drafts, setDrafts] = useState({ incident: "", improvement: "", help: "" });
  const [busy,setBusy]=useState(false),[picking,setPicking]=useState(false);
  const [files,setFiles]=useState<Record<SupportKind,SupportAttachment[]>>({incident:[],improvement:[],help:[]});
  const [expanded,setExpanded]=useState<string|null>(null);
  const store=useRef<ReturnType<typeof createSupportAttachmentStore>|null>(null),pickerFlight=useRef(false);
  useEffect(()=>{const owned=createSupportAttachmentStore();store.current=owned;return()=>{store.current=null;void owned.dispose().catch(()=>{});};},[scopeKey]);
  const [error, setError] = useState(""), [receipt, setReceipt] = useState<SupportReceipt | null>(null);
  const [requests, setRequests] = useState<SupportReceipt[] | null>(null);
  const [ownTotal,setOwnTotal]=useState(0),[loadingMore,setLoadingMore]=useState(false);
  const [details,setDetails]=useState<Record<string,SupportReceipt>>({});
  const [replyText,setReplyText]=useState("");
  const replyKey=useRef<string|null>(null);
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
  const pendingSubmission=useRef<{key:string;message:string;businessId:string|null;fileIds:string}|null>(null);
  useEffect(() => {
    setDrafts({incident:"",improvement:"",help:""}); setFiles({incident:[],improvement:[],help:[]});setExpanded(null); setReceipt(null);
    setRequests(null);setOwnTotal(0);setLoadingMore(false);setDetails({});setReplyText("");replyKey.current=null; setError(""); setBusy(false);setAiSession(null);setToolsOpen(false); requestKey.current=null;pendingSubmission.current=null; flight.current=false;
  }, [scopeKey]);
  useEffect(()=>{setReceipt(null);setError("");setBusy(false);setToolsOpen(false);setAiSession(null);setVoiceAttempt(0);selection.current={start:0,end:0};flight.current=false;requestKey.current=null;pendingSubmission.current=null;},[kind,scopeKey]);
  useEffect(()=>{if(!visible)setVoiceAttempt(0);},[visible]);
  useEffect(() => {
    if (!visible || kind !== "mine" || !gateway) return;
    let active = true; const owner = identity.current;
    setRequests(null); setError("");
    (gateway.listOwnPage?gateway.listOwnPage(0,30):gateway.listOwn().then(items=>({items,total:items.length})))
      .then(page => { if (active && identity.current === owner){setRequests(page.items);setOwnTotal(page.total);} })
      .catch(() => { if (active && identity.current === owner) setError("No se pudieron consultar tus solicitudes. Inténtalo de nuevo."); });
    return () => { active=false; };
  }, [visible, kind, gateway, scopeKey]);
  const loadMore=async()=>{if(!gateway?.listOwnPage||!requests||loadingMore||requests.length>=ownTotal)return;
    const owner=identity.current;setLoadingMore(true);setError("");
    try{const page=await gateway.listOwnPage(requests.length,30);if(identity.current!==owner)return;
      setRequests(current=>current?[...current,...page.items.filter(item=>!current.some(old=>old.id===item.id))]:page.items);setOwnTotal(page.total);}
    catch{if(identity.current===owner)setError("No se pudieron cargar más solicitudes.");}
    finally{if(identity.current===owner)setLoadingMore(false);}
  };
  const submit = async () => {
    if (!gateway || kind === "mine" || flight.current || picking ||voice.status!=="idle"|| !drafts[kind].trim() || files[kind].length>0&&!gateway.supportsAttachments) return;
    const message=drafts[kind].trim(),fileIds=files[kind].map(file=>file.id).join("|"),target=businessId??null;
    if(pendingSubmission.current&&(pendingSubmission.current.message!==message||pendingSubmission.current.businessId!==target||pendingSubmission.current.fileIds!==fileIds)){
      setError("El envío anterior puede haberse recibido. Consulta Mis solicitudes antes de empezar otra solicitud; para descartarla, limpia el texto.");return;
    }
    flight.current=true; setBusy(true); setError(""); const owner=formIdentity.current;
    requestKey.current ??= newSupportRequestKey();
    pendingSubmission.current??={key:requestKey.current,message,businessId:target,fileIds};
    try {
      const saved=await sendSupportRequest(gateway,{kind,message:drafts[kind],requestKey:requestKey.current,businessId},files[kind]);
      if(formIdentity.current!==owner)return;
      setReceipt(saved); for(const file of files[kind])void store.current?.remove(file.id).catch(()=>{});setFiles(values=>({...values,[kind]:[]})); setDrafts(values=>({...values,[kind]:""})); requestKey.current=null;pendingSubmission.current=null;
    } catch { if(formIdentity.current===owner)setError("No se ha confirmado el envío. Conservamos tu texto y adjuntos."); }
    finally { if(formIdentity.current===owner){flight.current=false;setBusy(false);} }
  };
  const attach=async(photo:boolean)=>{
    if(kind==="mine"||pickerFlight.current||busy||!store.current)return;
    const owner=identity.current,owned=store.current,selectedKind=kind,imported:SupportAttachment[]=[];
    pickerFlight.current=true;setPicking(true);setError("");Keyboard.dismiss();
    try{const result=photo?await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true,selectionLimit:5}):await DocumentPicker.getDocumentAsync({type:["application/pdf","image/*"],copyToCacheDirectory:true,multiple:true});
      if(result.canceled||identity.current!==owner)return;
      for(const asset of result.assets){if(identity.current!==owner)break;imported.push(await owned.importAsset({uri:asset.uri,name:"name" in asset?asset.name:asset.fileName??undefined,mimeType:asset.mimeType,size:"fileSize" in asset?asset.fileSize:"size" in asset?asset.size:undefined}));}
      if(identity.current!==owner){await Promise.all(imported.map(f=>owned.remove(f.id)));return;}
      setFiles(current=>({...current,[selectedKind]:[...current[selectedKind],...imported]}));setToolsOpen(false);
    }catch(e){await Promise.all(imported.map(f=>owned.remove(f.id).catch(()=>{})));if(identity.current===owner)setError(e instanceof Error?e.message:"No se pudo adjuntar el archivo.");}
    finally{pickerFlight.current=false;setPicking(false);}
  };
  const remove=async(file:SupportAttachment)=>{if(kind==="mine"||!store.current)return;const owner=identity.current,selectedKind=kind;
    try{await store.current.remove(file.id);if(identity.current===owner){setFiles(current=>({...current,[selectedKind]:current[selectedKind].filter(f=>f.id!==file.id)}));}}
    catch{if(identity.current===owner)setError("No se pudo quitar el archivo. Reintenta.");}};
  const disabled=kind==="mine"||!gateway||busy||picking||voice.status!=="idle"||!drafts[kind].trim()||drafts[kind].length>4000||files[kind].length>0&&!gateway.supportsAttachments;
  const statusLabel:Record<SupportStatus,string>={received:"Recibida",in_review:"En revisión",pending:"Pendiente",solved:"Solucionada",rejected:"Rechazada"};
  const openRequest=(row:SupportReceipt)=>{if(expanded===row.id){setExpanded(null);return;}setExpanded(row.id);setReplyText("");replyKey.current=null;
    if(!gateway?.detail)return;void gateway.detail(row.id).then(value=>setDetails(current=>({...current,[row.id]:value})))
      .catch(()=>setError("No se pudo abrir la solicitud. Inténtalo de nuevo."));};
  const sendReply=async(row:SupportReceipt)=>{if(!gateway?.act||!replyText.trim()||busy||!row.revision)return;
    setBusy(true);setError("");replyKey.current??=newSupportRequestKey();try{const updated=await gateway.act(row.id,{key:replyKey.current,action:"reply",body:replyText,revision:row.revision});
      setDetails(current=>({...current,[row.id]:updated}));setRequests(current=>current?.map(item=>item.id===row.id?updated:item)??null);setReplyText("");replyKey.current=null;}
    catch{setError("No se confirmó la respuesta. Consulta el hilo antes de reintentar.");}finally{setBusy(false);}};
  const openFile=async(id:string)=>{if(!gateway?.fileUrl)return;try{await Linking.openURL(await gateway.fileUrl(id));}
    catch{setError("No se pudo abrir el adjunto privado.");}};
  const title=SUPPORT_ORBIT_ACTIONS.find(a=>a.kind===kind)!.title;
  const toggleVoice=()=>{if(kind==="mine"||busy||picking)return;if(voice.status==="idle"){setVoiceAttempt(value=>value+1);speechTarget.current={owner:formIdentity.current,kind,base:draftsRef.current[kind],end:selection.current.end};}voice.focus("detail");void voice.toggle();};
  const clearCurrentText=()=>{if(kind==="mine"||busy||picking||!draftsRef.current[kind])return;
    voice.abort();speechTarget.current=null;selection.current={start:0,end:0};
    draftsRef.current={...draftsRef.current,[kind]:""};setDrafts(current=>({...current,[kind]:""}));
    requestKey.current=null;pendingSubmission.current=null;setReceipt(null);
  };
  const openAI=()=>{if(busy||picking)return;voice.abort();editor.current?.blur();Keyboard.dismiss();setToolsOpen(false);setAiSession({key:scopeKey+":"+kind+":"+(++aiSequence.current),kind,source:kind==="mine"?"":draftsRef.current[kind]});};
  const handledAssistantRequest=useRef(0);
  useEffect(()=>{if(visible&&initialAssistantRequest>handledAssistantRequest.current){handledAssistantRequest.current=initialAssistantRequest;setAiSession({key:scopeKey+":help:"+(++aiSequence.current),kind:"help",source:""});}},[visible,initialAssistantRequest,scopeKey]);
  const compact=bodyHeight<220;
  const fileList=kind!=="mine"&&files[kind].map(file=><View key={file.id} style={s.file}>
    {file.mime.startsWith("image/")?<Image accessibilityLabel={file.name} source={{uri:file.uri}} style={s.preview}/>:<Feather name="file-text" size={24} color="#17212b"/>}
    <Text style={[s.text,{flex:1}]}>{file.name}</Text><TouchableOpacity accessibilityRole="button" accessibilityLabel={"Quitar "+file.name} disabled={busy||picking} onPress={()=>void remove(file)} style={s.remove}><Feather name="x" size={22} color="#a1232e"/></TouchableOpacity>
  </View>);
  const controlButtons=<View testID="support-thumb-controls" style={[s.controls,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>
    {kind!=="mine"&&<IconButton appearance="supportAction" icon="trash-2" label="Limpiar texto del borrador" disabled={busy||picking||!drafts[kind]} onPress={clearCurrentText}/>}
    {kind!=="mine"&&<IconButton appearance="supportAction" icon="paperclip" label={toolsOpen?"Ocultar adjuntos":"Adjuntar referencia"} disabled={busy||picking} onPress={()=>{editor.current?.blur();Keyboard.dismiss();setToolsOpen(open=>!open);}}/>}
    <GoAssistantButton size={kind==="mine"?64:56} onPress={openAI} disabled={busy||picking||voice.status==="transcribing"}/>
    <GoCloseButton level="panel" appearance="light" keyboardVisible={keyboardVisible} accessibilityLabel={keyboardVisible?"Ocultar teclado":"Volver a las órbitas de ayuda"} onPress={back}/>
  </View>;
  // Writing controls belong to the composer flow: no drag host, saved coordinates
  // or second keyboard displacement. Mis solicitudes keeps its existing navigation.
  const thumbControls=kind==="mine"?<GoNavigationFloating screenKey="support-mine" safeArea={false} handedness={handedness} keyboardVisible={keyboardVisible} keyboardResponsive width={136}>{controlButtons}</GoNavigationFloating>:controlButtons;
  return <Modal visible={visible} animationType="slide" onRequestClose={back}>
    <GoScreenHost registerBack={handler=>{nestedBack.current=handler;}}>
    <KeyboardAvoidingView style={[s.screen,{paddingTop:insets.top,paddingBottom:keyboardVisible?0:insets.bottom}]} behavior={Platform.OS==="ios"?"padding":"height"}>
      <View style={s.header}><Text accessibilityRole="header" style={s.title}>{title}</Text></View>
      {kind!=="mine"&&<SupportVoiceNotice key={kind+":"+scopeKey} message={voiceAttempt>0?voice.error||voice.notice:""} attempt={voiceAttempt}/>}
      <View testID="support-workspace" style={s.workspace} onLayout={event=>setBodyHeight(event.nativeEvent.layout.height)}>
      {kind==="mine"?<ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.history}>
        {gateway&&requests===null&&!error?<Text style={s.hint}>Cargando…</Text>:(!gateway||requests?.length===0)?<View testID="support-empty" style={s.empty}><Feather name="inbox" size={30} color="#535c66"/><Text style={s.text}>{gateway?"Tus solicitudes aparecerán aquí.":"La consulta de solicitudes está pendiente de conexión al servidor."}</Text></View>:null}
        {requests?.map(row=><View key={row.id} style={s.card}><TouchableOpacity accessibilityRole="button" accessibilityState={{expanded:expanded===row.id}} accessibilityLabel={row.summary||row.reference} onPress={()=>openRequest(row)}>
          <View style={s.row}><Text style={[s.text,{flex:1,fontWeight:"700"}]}>{row.summary||row.reference}</Text><Text style={s.badge}>{statusLabel[row.status]}</Text></View>
          <Text style={s.hint}>{[row.kind&&SUPPORT_ORBIT_ACTIONS.find(a=>a.kind===row.kind)?.title,row.createdAt&&Number.isFinite(Date.parse(row.createdAt))?new Date(row.createdAt).toLocaleDateString("es-ES"):null].filter(Boolean).join(" · ")}</Text>
          </TouchableOpacity>
          {expanded===row.id&&<><Text style={s.hint}>{row.reference}</Text><Text style={s.text}>{details[row.id]?.detail??row.detail}</Text>
            {details[row.id]?.messages?.map(message=><View key={message.id} style={s.message}><Text style={s.hint}>{message.authorId===scopeKey?"Tú":"ADMIN"} · {new Date(message.createdAt).toLocaleDateString("es-ES")}</Text><Text style={s.text}>{message.body}</Text></View>)}
            {details[row.id]?.attachments?.map(file=><TouchableOpacity key={file.id} accessibilityRole="button" accessibilityLabel={"Abrir adjunto "+file.name} onPress={()=>void openFile(file.id)}><Text style={s.fileLink}>{file.name}</Text></TouchableOpacity>)}
            {!!gateway?.act&&details[row.id]&&!details[row.id].archivedAt&&<View style={s.reply}><TextInput accessibilityLabel="Responder a AYUDA" placeholder="Escribe tu respuesta" multiline value={replyText} onChangeText={value=>{setReplyText(value);replyKey.current=null;}} style={s.replyInput}/><TouchableOpacity accessibilityRole="button" accessibilityLabel="Enviar respuesta" disabled={busy||!replyText.trim()} onPress={()=>void sendReply(details[row.id])} style={s.replyButton}><Text style={s.replyButtonText}>ENVIAR</Text></TouchableOpacity></View>}
          </>}
        </View>)}
        {requests&&requests.length<ownTotal&&<TouchableOpacity accessibilityRole="button" accessibilityLabel="Cargar más solicitudes" disabled={loadingMore} onPress={()=>void loadMore()} style={s.replyButton}><Text style={s.replyButtonText}>{loadingMore?"CARGANDO…":"CARGAR MÁS"}</Text></TouchableOpacity>}
      </ScrollView>:<>
        <ScrollView testID="support-writing-scroll" style={{flex:1,minHeight:0}} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.writing}>
          {fileList}
          {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
          {voice.status==="listening"&&<Text accessibilityLiveRegion="polite" style={s.activity}>● Escuchando</Text>}
          {(voice.status==="preparing"||voice.status==="transcribing")&&<Text accessibilityLiveRegion="polite" style={s.hint}>{voice.status==="transcribing"?"Transcribiendo…":"Preparando micrófono…"}</Text>}
          {!!receipt&&<Text accessibilityLiveRegion="polite" style={s.text}>Recibida · {receipt.reference}</Text>}
        </ScrollView>
        <View testID="support-composer-dock" style={s.composerDock} onLayout={event=>setComposerDockHeight(event.nativeEvent.layout.height)}>
          <View testID="support-fixed-controls" style={[s.fixedControls,{alignItems:handedness==="left"?"flex-start":"flex-end"}]}>{thumbControls}</View>
          <View testID="support-composer" style={[s.composer,{flexDirection:handedness==="left"?"row-reverse":"row"}]}>
            <TextInput ref={editor} testID="support-text" accessibilityLabel="Descripción de la solicitud" multiline scrollEnabled maxLength={4000} value={drafts[kind]} editable={!busy}
              style={[s.input,{height:compact?Math.max(44,Math.min(textHeight,88,bodyHeight-90)):Math.max(96,Math.min(textHeight,220,Math.max(96,bodyHeight-104)))}]}
              onFocus={()=>{setToolsOpen(false);voice.focus("detail");}} onContentSizeChange={event=>setTextHeight(event.nativeEvent.contentSize.height)}
              onSelectionChange={event=>{selection.current=event.nativeEvent.selection;}}
              onChangeText={value=>{setDrafts(current=>({...current,[kind]:value}));setReceipt(null);}}/>
            <View style={{alignSelf:"flex-end",gap:4,flexDirection:compact?(handedness==="left"?"row-reverse":"row"):"column"}}><IconButton appearance="note" icon={voice.status==="listening"?"square":"mic"} label={voice.status==="listening"?"Detener dictado":"Dictar solicitud"} disabled={busy||picking||voice.status==="preparing"||voice.status==="transcribing"} onPress={toggleVoice}/>
              <GoSendButton testID="support-send" disabled={disabled} busy={busy} onPress={submit}/>
            </View>
          </View>
          {!gateway&&<Text testID="support-send-unavailable" accessibilityLiveRegion="polite" style={s.sendUnavailable}>Envío temporalmente deshabilitado.</Text>}
        </View>
        {toolsOpen&&<View pointerEvents="box-none" style={{position:"absolute",left:0,right:0,bottom:composerDockHeight+18,top:0}}><GoNoteAttachmentMenu tray handedness={handedness} maxHeight={Math.max(80,Math.min(260,bodyHeight-composerDockHeight-18))} disabled={busy||picking} onFile={()=>void attach(false)} onPhotos={()=>void attach(true)}/></View>}
      </>}
      {kind==="mine"&&thumbControls}
      </View>
      {kind==="mine"&&!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
    </KeyboardAvoidingView>
    {aiSession&&visible&&<GOChatScreen key={aiSession.key} visible handedness={handedness} onClose={()=>setAiSession(null)} consultation={{scopeKey:aiSession.key,title:aiSession.kind==="help"?"AYUDA GO":title,sourceText:aiSession.source,respond:assistanceResponder,onAcceptDraft:aiSession.kind==="mine"?undefined:(proposal,baseline)=>{
      const target=aiSession.kind;if(target==="mine"||!identity.current.visible||liveAi.current?.key!==aiSession.key||formIdentity.current.key!==scopeKey||formIdentity.current.kind!==target)return;
      if(draftsRef.current[target]!==baseline){setError("El texto ha cambiado. Conservamos tu borrador.");return;}
      setDrafts(values=>({...values,[target]:proposal}));requestKey.current=null;
    }}}/>}
    </GoScreenHost>
  </Modal>;
}
const s=StyleSheet.create({
 screen:{flex:1,backgroundColor:"#ffffff"},workspace:{flex:1,minHeight:0,marginHorizontal:16,paddingBottom:10},header:{paddingHorizontal:18,paddingVertical:12},title:{color:"#17212b",fontSize:22,fontWeight:"700"},
 writing:{flexGrow:1,justifyContent:"flex-end",paddingTop:10,paddingBottom:10,gap:10},history:{paddingTop:12,paddingBottom:88,gap:14},text:{color:"#17212b",fontSize:16,lineHeight:23,flexShrink:1},hint:{color:"#515d69",fontSize:13,lineHeight:19,paddingHorizontal:16},
 composerDock:{flexShrink:0},fixedControls:{marginBottom:6,marginHorizontal:12},sendUnavailable:{color:"#515d69",fontSize:13,lineHeight:18,marginTop:6},
 composer:{borderWidth:1,borderColor:"#b4bdc6",borderRadius:16,backgroundColor:"#fafbfc",padding:6,gap:4,alignItems:"flex-end"},input:{flex:1,minWidth:0,color:"#17212b",padding:10,fontSize:18,lineHeight:25,textAlignVertical:"top"},
 row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:10},file:{flexDirection:"row",alignItems:"center",gap:8,padding:6,borderWidth:1,borderColor:"#d2d8de",borderRadius:12},preview:{width:44,height:44,borderRadius:8},remove:{minWidth:44,minHeight:44,alignItems:"center",justifyContent:"center"},
 controls:{alignItems:"flex-end",gap:8,flexShrink:0},
 empty:{alignItems:"center",paddingVertical:36,gap:14},card:{padding:16,gap:10,borderWidth:1,borderColor:"#d2d8de",borderRadius:16,backgroundColor:"#fff"},badge:{color:"#343d47",fontSize:12,fontWeight:"600",backgroundColor:"#eef0f3",paddingHorizontal:10,paddingVertical:6,borderRadius:12},error:{color:"#a1232e",fontSize:14,lineHeight:20,paddingHorizontal:16},activity:{color:"#a1232e",fontSize:13,paddingHorizontal:16},
 message:{borderTopWidth:1,borderColor:"#d2d8de",paddingTop:8,gap:4},fileLink:{color:"#225fb0",fontSize:15,paddingVertical:8},
 reply:{gap:8,paddingTop:8},replyInput:{minHeight:56,borderWidth:1,borderColor:"#b4bdc6",borderRadius:10,padding:10,fontSize:16,color:"#17212b"},
 replyButton:{alignSelf:"flex-end",minHeight:44,justifyContent:"center",paddingHorizontal:16,borderRadius:12,backgroundColor:"#15803d"},replyButtonText:{color:"#fff",fontWeight:"700"}
});
