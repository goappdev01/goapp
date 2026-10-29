import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Keyboard, KeyboardAvoidingView, Linking, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, useWindowDimensions, View, type TextInputProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { LinearGradient } from "expo-linear-gradient";
import { DraggableFAB } from "@/components/DraggableFAB";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GoScreenCloseGuide, GoScreenCloseSurface } from "@/components/ui/GoScreenCloseSurface";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNoteReminderPicker } from "./GoNoteReminderPicker";
import { GoNoteDatePicker, noteDateLabel } from "./GoNoteDatePicker";
import { GoNoteTimePicker, GoNoteDurationPicker, noteDurationLabel } from "./GoNoteSchedulePicker";
import { GoNoteToolFooter, type NoteToolEdit } from "./GoNoteToolFooter";
import { useGoNoteVoice } from "@/hooks/useGoNoteVoice";
import { useGoNoteKeyboard } from "@/hooks/useGoNoteKeyboard";
import { s as assistantStyles } from "@/components/booking-assistant/BookingAssistantUI";
import { prepareGoNote } from "@/lib/goNotePreparation";
import { appendNoteDictation, noteReminderLabel } from "@/lib/goNoteTools";
import { importNoteFile } from "@/lib/goNoteFiles";
import { noteDraft, noteId, validNoteDate, validNoteTime, validateNote, type NoteDestination, type UnifiedNoteDraft } from "@/lib/unifiedNotes";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "@/lib/goTaskReminders";
import { getNoteReminderProgress, subscribeNoteReminderProgress, startNoteSaveTrace, type NoteSaveTrace } from "@/lib/goNoteSaveProgress";

type Props = { visible:boolean; initial?:GoEntry|null; seed?:{title?:string;content?:string;destination?:NoteDestination;dateISO?:string;time?:string};
  scope:TaskScope|null; ready:boolean; handedness:"left"|"right"; cached?:UnifiedNoteDraft; onClose:(state?:{draft:UnifiedNoteDraft;saved:boolean})=>void;
  onSave:(draft:UnifiedNoteDraft)=>Promise<{entry:GoEntry;message:string;notice?:string;performance?:NoteSaveTrace}>;
  onSaved?:(entry:GoEntry,notice:string)=>void;
  onGoToLanding?:()=>void; closeRequested?:boolean; initialToolsOpen?:boolean;
  renderActions?:(entry:GoEntry,onEdit:()=>void)=>React.ReactNode };
const destinations: [NoteDestination,string][]=[["calendar","CALENDARIO"],["pending","PENDIENTES"],["archive","ARCHIVO"]];
const configurationKeys=["destination","dateISO","time","duration","place","location","reminderMinutes","attachments"] as const;
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);

/** One ordinary-note editor, one native presenter, and one acknowledged save operation. */
export function GoNoteEditor({visible,initial,seed,scope,ready,handedness,onClose,onSave,onSaved,cached,renderActions,onGoToLanding,closeRequested=false,initialToolsOpen=false}:Props) {
  const insets=useSafeAreaInsets(),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),keyboard=useGoNoteKeyboard(visible);
  const [draft,setDraft]=useState<UnifiedNoteDraft>(()=>cached||noteDraft(initial)),[panel,setPanel]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [busy,setBusy]=useState(false),[attachmentBusy,setAttachmentBusy]=useState(false),[link,setLink]=useState("");
  const [toolDraft,setToolDraft]=useState<UnifiedNoteDraft|null>(null),toolDraftRef=useRef(toolDraft);toolDraftRef.current=toolDraft;
  const pendingTool=useRef<NoteToolEdit<Partial<UnifiedNoteDraft>>|null>(null),persistedEntry=useRef(cached?.original&&cached.id===initial?.id?cached.original:initial||null);
  const toolCloseLock=useRef(false),[toolFinishing,setToolFinishing]=useState(false);
  const pendingCommit=useRef<Partial<UnifiedNoteDraft>|null>(null);
  const [locationSource,setLocationSource]=useState<"current"|"manual"|null>(null);
  const [toolsOpen,setToolsOpen]=useState(initialToolsOpen),[writingHeight,setWritingHeight]=useState(240);
  const toolsScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const workspaceView=useRef<React.ElementRef<typeof View>>(null);
  const [openingTool,setOpeningTool]=useState(""),[awaitingTool,setAwaitingTool]=useState<{key:string;epoch:number;id:string}|null>(null);
  const [frameHeight,setFrameHeight]=useState(0),[footerBottom,setFooterBottom]=useState(0);
  const [dateContentHeight,setDateContentHeight]=useState(400),[closingSaved,setClosingSaved]=useState(false);
  const savedExit=useRef<{entry:GoEntry;notice:string;scope:TaskScope;afterClose?:()=>void;draft?:UnifiedNoteDraft;saved?:boolean;performance?:NoteSaveTrace}|null>(null),exitLock=useRef(false);
  const keyboardVisible=keyboard.visible;
  const toolRequest=useRef(0),footerHeight=useRef(106),focusedToolTarget=useRef<Parameters<React.ElementRef<typeof ScrollView>["scrollResponderScrollNativeHandleToKeyboard"]>[0]|null>(null);
  const focusedWritingTarget=useRef<Parameters<React.ElementRef<typeof ScrollView>["scrollResponderScrollNativeHandleToKeyboard"]>[0]|null>(null);
  const viewport=useWindowDimensions(),[workspaceBounds,setWorkspaceBounds]=useState({x:0,y:0,width:0,height:0});
  const usableWidth=workspaceBounds.width||Math.max(0,viewport.width-2*Math.max(12,insets.left,insets.right));
  // Restore the approved lateral band; only a selected form may temporarily widen.
  const toolsWidth=!panel?Math.ceil(usableWidth*.56):panel==="date"?usableWidth:Math.min(usableWidth,Math.max(288,Math.ceil(usableWidth*.78)));
  const menuHeight=workspaceBounds.height?Math.min(workspaceBounds.height,Math.max(144,Math.round(workspaceBounds.height*.60))):undefined;
  const toolsHeight=panel==="date"?Math.min(workspaceBounds.height||dateContentHeight,dateContentHeight):!panel?menuHeight:undefined;
  const toggleBoundsHeight=panel?Math.max(48,workspaceBounds.height-88):workspaceBounds.height;
  const toggleTop=Math.max(8,Math.min(toggleBoundsHeight-56,Math.round(workspaceBounds.height*.74)));
  const suppressToggle=useRef(false),markToggleDrag=useCallback(()=>{suppressToggle.current=true;},[]);
  const toggleLeft=handedness==="right"?usableWidth-44:0;
  const writingInset=handedness==="right"?{paddingRight:56}:{paddingLeft:56};
  const [locations,setLocations]=useState<{latitude:number;longitude:number;label:string}[]>([]);
  const [preparing,setPreparing]=useState(false),[preparedNotice,setPreparedNotice]=useState(""),[floatingNotice,setFloatingNotice]=useState("");
  const preparation=useRef(0),draftRef=useRef(draft);draftRef.current=draft;
  const saveLock=useRef(false),workLock=useRef(false),session=useRef(""),latest=useRef({scope,ready,visible,id:draft.id});latest.current={scope,ready,visible,id:draft.id};
  const readReminderProgress=useCallback(()=>scope&&draft.original?.note?getNoteReminderProgress(scope,draft.id,draft.original.note.operationId):null,[scope?.userId,scope?.context,draft.id,draft.original?.note?.operationId]);
  const reminderProgress=useSyncExternalStore(subscribeNoteReminderProgress,readReminderProgress,()=>null);
  const saved=useRef(false),wasVisible=useRef(false),operation=useRef({value:"",id:noteId()});
  const lastScope=useRef(scope);
  const revealToolInput=useCallback(()=>{if(focusedToolTarget.current)toolsScroll.current?.scrollResponderScrollNativeHandleToKeyboard(focusedToolTarget.current,footerHeight.current+16,true);},[]);
  const focusToolInput:NonNullable<TextInputProps["onFocus"]>=event=>{focusedWritingTarget.current=null;focusedToolTarget.current=event.target??event.nativeEvent.target??null;revealToolInput();};
  const revealWritingInput=useCallback(()=>{if(focusedWritingTarget.current)scroll.current?.scrollResponderScrollNativeHandleToKeyboard(focusedWritingTarget.current,footerHeight.current+12,true);},[]);
  useEffect(()=>{if(!visible||!keyboardVisible||!focusedWritingTarget.current)return;const frame=requestAnimationFrame(revealWritingInput);return()=>cancelAnimationFrame(frame);},[visible,keyboardVisible,workspaceBounds.height,writingHeight,revealWritingInput]);
  useEffect(()=>{
    if(!visible||!keyboardVisible||!focusedToolTarget.current)return;
    const frame=requestAnimationFrame(revealToolInput);
    return()=>cancelAnimationFrame(frame);
  },[visible,keyboardVisible,workspaceBounds.height,revealToolInput]);
  useEffect(()=>{if(!visible){toolRequest.current++;setOpeningTool("");setAwaitingTool(null);}return()=>{toolRequest.current++;};},[visible]);
  const hideKeyboard=async()=>{const epoch=toolRequest.current,id=latest.current.id;focusedToolTarget.current=null;focusedWritingTarget.current=null;const hidden=await keyboard.dismiss();if(!hidden&&epoch===toolRequest.current&&latest.current.visible&&latest.current.id===id)setFloatingNotice("No se ha confirmado el cierre del teclado. Tu nota sigue abierta; vuelve a pulsar la flecha inferior.");return hidden;};
  const openTool=async(key:string)=>{
    const epoch=++toolRequest.current,id=latest.current.id;
    focusedToolTarget.current=null;if(key)setToolsOpen(true);setOpeningTool(key||"tools");
    const hidden=await hideKeyboard();
    if(epoch!==toolRequest.current||!latest.current.visible||latest.current.id!==id)return;
    if(!hidden){setOpeningTool("");return;}
    setAwaitingTool({key,epoch,id});
  };
  useEffect(()=>{
    if(!awaitingTool||keyboardVisible||keyboard.dismissing||!frameHeight||Math.abs(frameHeight-footerBottom)>2)return;
    let active=true;
    const frame=requestAnimationFrame(()=>{
      const finish=(width?:number,height?:number)=>{
        if(!active||keyboard.isActive()||awaitingTool.epoch!==toolRequest.current||!latest.current.visible||latest.current.id!==awaitingTool.id)return;
        if(width&&height)setWorkspaceBounds(current=>({...current,width,height}));
        const next=awaitingTool.key?{...draftRef.current,attachments:[...draftRef.current.attachments]}:null;
        toolDraftRef.current=next;setToolDraft(next);pendingTool.current=null;pendingCommit.current=null;setLink("");setLocations([]);setLocationSource(null);
        setPanel(awaitingTool.key);setToolsOpen(true);setOpeningTool("");setAwaitingTool(null);
      };
      if(workspaceView.current?.measure)workspaceView.current.measure((_x,_y,width,height)=>finish(width,height));else finish();
    });
    return()=>{active=false;cancelAnimationFrame(frame);};
  },[awaitingTool,keyboardVisible,keyboard.dismissing,keyboard.isActive,frameHeight,footerBottom,workspaceBounds.height]);
  useEffect(()=>{
    if(!awaitingTool)return;
    const timer=setTimeout(()=>{if(awaitingTool.epoch!==toolRequest.current)return;setAwaitingTool(null);setOpeningTool("");setError("No se ha recuperado el espacio del teclado. Tu nota se conserva; vuelve a abrir la herramienta.");},1200);
    return()=>clearTimeout(timer);
  },[awaitingTool]);
  const voice=useGoNoteVoice({visible,identity:JSON.stringify(scope),title:draft.title,setTitle:value=>{saved.current=false;setMessage("");setDraft(d=>({...d,title:typeof value==="function"?value(d.title):value}));},
    setDetail:value=>{saved.current=false;setMessage("");setDraft(d=>({...d,content:typeof value==="function"?value(d.content):value}));},english:false,titleLimit:200,onPreparedText:text=>void prepare(text)});
  useEffect(()=>{const feedback=voice.error||voice.notice;if(visible&&feedback)setFloatingNotice(feedback);},[visible,voice.error,voice.notice]);
  useEffect(()=>{if(!floatingNotice)return;const timer=setTimeout(()=>setFloatingNotice(""),6000);return()=>clearTimeout(timer);},[floatingNotice]);
  useEffect(()=>{if(!visible){preparation.current++;setPreparing(false);setFloatingNotice("");}},[visible]);
  async function prepare(text:string){
    const base=draftRef.current,expected=latest.current.scope,epoch=++preparation.current;
    if(base.security){setFloatingNotice("Las notas de seguridad no están activadas y no se envían a la IA.");return;}
    const captured=appendNoteDictation(base.content,text);change({content:captured});setPreparing(true);setPreparedNotice("");
    if(!expected||!latest.current.ready){setPreparing(false);setFloatingNotice("Dictado conservado. Espera a que se verifique tu cuenta para interpretarlo.");return;}
    try{const result=await prepareGoNote(text);
      if(epoch!==preparation.current||!latest.current.visible||latest.current.id!==base.id||latest.current.scope?.userId!==expected?.userId||latest.current.scope?.context!==expected?.context)return;
      setDraft(current=>{
        const next={...current},keys=["title","dateISO","time","duration","place","reminderMinutes"] as const;
        for(const key of keys)if(result.patch[key]!==undefined&&current[key]===base[key]&&(key!=="title"||!base.title))Object.assign(next,{[key]:result.patch[key]});
        if(current.content===captured)next.content=appendNoteDictation(base.content,result.patch.content??text);
        if(next.place!==current.place)next.location=undefined;
        return next;
      });setPreparedNotice(result.notice);
    }catch{if(epoch===preparation.current&&latest.current.visible)setFloatingNotice("He conservado el dictado. No se ha podido interpretar; puedes completar la nota manualmente.");}
    finally{if(epoch===preparation.current)setPreparing(false);}
  }
  useEffect(()=>{
    if(visible && (!wasVisible.current || session.current!==(initial?.id||"new"))) {
      const key=initial?.id||"new";
      if(session.current!==key || saved.current || initial){const next=cached||noteDraft(initial);if(!initial&&!cached){next.title=seed?.title||"";next.content=seed?.content||"";}
        if(seed?.destination)next.destination=seed.destination;if(seed?.dateISO)next.dateISO=seed.dateISO;if(seed?.time!==undefined)next.time=seed.time;
        setDraft(next);draftRef.current=next;persistedEntry.current=initial&&cached?.id===initial.id?cached.original||initial:initial||null;toolDraftRef.current=null;setToolDraft(null);pendingTool.current=null;pendingCommit.current=null;setLink("");setLocationSource(null);setPanel("");setToolsOpen(initialToolsOpen);setClosingSaved(false);savedExit.current=null;setLocations([]);setError("");setMessage("");setPreparedNotice("");saved.current=false;}
      session.current=key;voice.focus("detail");
    }
    wasVisible.current=visible;
  },[visible,initial?.id]);
  useEffect(()=>{const previous=lastScope.current;lastScope.current=scope;
    if(previous && (previous.userId!==scope?.userId || previous.context!==scope?.context)){
      preparation.current++;toolRequest.current++;savedExit.current=null;persistedEntry.current=null;pendingTool.current=null;pendingCommit.current=null;toolDraftRef.current=null;setToolDraft(null);setClosingSaved(false);setOpeningTool("");setAwaitingTool(null);setPreparing(false);setFloatingNotice("");voice.abort();setDraft(noteDraft());setPanel("");setLocations([]);setError("");setMessage("");session.current="";if(visible)onClose();
    }
    return()=>voice.abort();
  },[scope?.userId,scope?.context]);
  const change=(patch:Partial<UnifiedNoteDraft>)=>{const next={...draftRef.current,...patch};draftRef.current=next;setDraft(next);setMessage("");saved.current=false;};
  const stage=(patch:Partial<UnifiedNoteDraft>)=>{pendingCommit.current=null;const next={...(toolDraftRef.current||draftRef.current),...patch};toolDraftRef.current=next;setToolDraft(next);};
  const close=()=>{if(saveLock.current||workLock.current||toolCloseLock.current)return;preparation.current++;setPreparing(false);voice.abort();Keyboard.dismiss();onClose({draft:draftRef.current,saved:saved.current});};
  const back=()=>{
    if(saveLock.current||workLock.current||toolCloseLock.current||savedExit.current)return;
    if(keyboard.isActive()){void hideKeyboard();return;}
    if(openingTool){toolRequest.current++;setOpeningTool("");setAwaitingTool(null);return;}
    if(toolsOpen&&!!panel){void finishTool();return;}
    if(toolsOpen){setToolsOpen(false);return;}close();
  };
  const finishSaved=()=>{
    const result=savedExit.current;if(!result)return;savedExit.current=null;
    if(!latest.current.visible||latest.current.scope?.userId!==result.scope.userId||latest.current.scope?.context!==result.scope.context)return;
    result.performance?.mark("presenterDismissed");onClose({draft:result.draft||noteDraft(result.entry),saved:result.saved??true});
    if(result.afterClose)result.afterClose();else onSaved?.(result.entry,result.notice);
  };
  useEffect(()=>()=>{savedExit.current=null;},[]);
  const work=async(kind:"attachments"|"location",fn:()=>Promise<void>)=>{if(workLock.current||saveLock.current||toolCloseLock.current)return;const trace=startNoteSaveTrace("selection:"+kind);workLock.current=true;setAttachmentBusy(true);setError("");try{await fn();}catch(e){if(latest.current.visible)setError(e instanceof Error?e.message:"No se ha podido completar la selección.");}finally{trace.mark("selectionFinished");workLock.current=false;setAttachmentBusy(false);}};
  const attach=async(kind:"file"|"image")=>work("attachments",async()=>{
    const expected=latest.current.scope,expectedId=draftRef.current.id;if(!expected || !latest.current.ready)throw new Error("Espera a que se verifique tu cuenta para adjuntar archivos.");
    if(!await hideKeyboard())return;
    if(!latest.current.visible||latest.current.id!==expectedId||latest.current.scope?.userId!==expected.userId||latest.current.scope?.context!==expected.context)return;
    const assets=kind==="file"?await DocumentPicker.getDocumentAsync({copyToCacheDirectory:true,multiple:true})
      :await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true});
    if(assets.canceled)return;
    const added=[];
    for(const asset of assets.assets){if(!latest.current.visible || latest.current.id!==expectedId || latest.current.scope?.userId!==expected.userId || latest.current.scope?.context!==expected.context)return;
      added.push(await importNoteFile(expected,expectedId,{uri:asset.uri,name:"name" in asset?asset.name:asset.fileName||"Fotografía.jpg",mimeType:asset.mimeType,size:"size" in asset?asset.size:"fileSize" in asset?asset.fileSize:undefined}));}
    if(latest.current.visible && latest.current.id===expectedId && latest.current.scope?.userId===expected.userId && latest.current.scope?.context===expected.context){stage({attachments:[...(toolDraftRef.current||draftRef.current).attachments,...added]});if(added.length)setFloatingNotice("Archivo seleccionado.");}
  });
  const locate=async(search:boolean)=>work("location",async()=>{
    const expected=latest.current.scope,expectedId=draftRef.current.id,place=(toolDraftRef.current||draftRef.current).place;
    if(!expected||!latest.current.ready)throw new Error("Espera a que se verifique tu cuenta para seleccionar la ubicación.");
    if(!search||Platform.OS==="android"){const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=="granted")throw new Error("Permite el acceso a ubicación o escribe la dirección manualmente.");}
    const coordinates=search?await Location.geocodeAsync(place):[(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced})).coords];
    if(!coordinates.length)throw new Error("No se ha encontrado esa ubicación. Puedes conservar la dirección escrita.");
    const results=[];for(const point of coordinates.slice(0,5)){if(!Number.isFinite(point.latitude)||!Number.isFinite(point.longitude)||Math.abs(point.latitude)>90||Math.abs(point.longitude)>180)throw new Error("No se ha obtenido una ubicación válida.");const address=(await Location.reverseGeocodeAsync(point))[0];results.push({latitude:point.latitude,longitude:point.longitude,label:[address?.street,address?.streetNumber,address?.city].filter(Boolean).join(", ")||`${point.latitude}, ${point.longitude}`});}
    if(latest.current.visible&&latest.current.id===expectedId&&latest.current.scope?.userId===expected.userId&&latest.current.scope?.context===expected.context){
      if(search)setLocations(results);else{const {label,...location}=results[0];stage({location,place:label});setLocationSource("current");setLocations([]);}
    }
  });
  const operationDraft=(next:UnifiedNoteDraft)=>{
    const value=JSON.stringify({...next,original:undefined,operationId:undefined});
    if(operation.current.value!==value)operation.current={value,id:noteId()};
    return {...next,operationId:operation.current.id};
  };
  async function persistConfiguration(patch:Partial<UnifiedNoteDraft>):Promise<boolean>{
    if(saveLock.current||workLock.current||savedExit.current)return false;
    const next={...draftRef.current,...patch};
    if(!persistedEntry.current){change(patch);return true;} // Creation changes only its draft, never creates a row.
    const original=persistedEntry.current,base=noteDraft(original),configured={...base};
    for(const key of configurationKeys)Object.assign(configured,{[key]:next[key]});
    if(configurationKeys.every(key=>same(base[key],configured[key])))return true;
    if(!latest.current.ready||!latest.current.scope){setError("Espera a que se verifique tu cuenta. Los cambios siguen aquí.");return false;}
    try{validateNote(configured);}catch(e){pendingCommit.current=null;setError(e instanceof Error?e.message:"Revisa la configuración.");return false;}
    const expected={...latest.current.scope},id=next.id;
    saveLock.current=true;setBusy(true);setError("");
    try{
      const result=await onSave(operationDraft(configured));
      if(!latest.current.visible||latest.current.id!==id||latest.current.scope?.userId!==expected.userId||latest.current.scope?.context!==expected.context)return false;
      persistedEntry.current=result.entry;
      change({...patch,original:result.entry});
      requestAnimationFrame(()=>result.performance?.mark("visible"));
      saved.current=same(draftRef.current.title,noteDraft(result.entry).title)&&same(draftRef.current.content,noteDraft(result.entry).content);
      setFloatingNotice(result.notice?.includes("revisa")?result.notice:"Configuración guardada.");return true;
    }catch(e){if(latest.current.visible&&latest.current.id===id&&latest.current.scope?.userId===expected.userId&&latest.current.scope?.context===expected.context)setError(e instanceof Error?e.message:"No se ha podido guardar. Los cambios siguen aquí.");return false;}
    finally{saveLock.current=false;setBusy(false);}
  }
  function attachmentPatch():Partial<UnifiedNoteDraft>{
    const current=toolDraftRef.current||draftRef.current;
    if(!link.trim())return {attachments:current.attachments};
    let url:URL;try{url=new URL(link.trim());}catch{throw new Error("Escribe un enlace http:// o https:// válido.");}
    if(!["http:","https:"].includes(url.protocol)||!url.hostname)throw new Error("Escribe un enlace http:// o https:// válido.");
    const attachments=current.attachments.some(a=>a.kind==="link"&&a.uri===link.trim())?current.attachments:[...current.attachments,{id:noteId(),kind:"link" as const,name:link.trim(),uri:link.trim()}];
    stage({attachments});setLink("");return {attachments};
  }
  async function finishTool(explicit?:Partial<UnifiedNoteDraft>,hide=false,saveWholeNote=false):Promise<boolean>{
    if(toolCloseLock.current||saveLock.current||workLock.current||savedExit.current||openingTool)return false;
    toolCloseLock.current=true;setToolFinishing(true);
    const id=latest.current.id,expected=latest.current.scope;
    try{
      let patch=explicit||pendingCommit.current||undefined;
      if(explicit)pendingCommit.current=explicit;
      if(!patch){
        const edit=pendingTool.current;
        if(edit?.changed){if(edit.error||!edit.value)throw new Error(edit.error||"Completa la configuración.");patch=edit.value;}
        else if(panel==="place"){
          const place=toolDraftRef.current||draftRef.current;
          if(!place.place.trim()&&(draftRef.current.place||draftRef.current.location))throw new Error("Para eliminar la ubicación utiliza QUITAR UBICACIÓN.");
          patch={place:place.place,location:place.location};
        }else if(panel==="attachments")patch=attachmentPatch();
      }
      // The main GUARDAR commits text and the open tool together, in one write.
      if(saveWholeNote){if(patch)change(patch);}
      else if((patch||persistedEntry.current)&&!await persistConfiguration(patch||{}))return false;
      if(!await hideKeyboard())return false;
      if(!latest.current.visible||latest.current.id!==id||latest.current.scope?.userId!==expected?.userId||latest.current.scope?.context!==expected?.context)return false;
      toolRequest.current++;pendingTool.current=null;pendingCommit.current=null;toolDraftRef.current=null;setToolDraft(null);setPanel("");setLink("");setLocations([]);setError("");setOpeningTool("");setAwaitingTool(null);
      if(hide)setToolsOpen(false);return true;
    }catch(e){setError(e instanceof Error?e.message:"Revisa la configuración.");return false;}
    finally{toolCloseLock.current=false;setToolFinishing(false);}
  }
  async function requestNoteExit(afterClose:()=>void){
    if(exitLock.current||saveLock.current||workLock.current||toolCloseLock.current||savedExit.current)return;
    const expected=latest.current.scope,id=latest.current.id;if(!expected||!persistedEntry.current)return;
    exitLock.current=true;
    try{
      if(panel&&!await finishTool())return;
      if(!await hideKeyboard())return;
      if(!latest.current.visible||latest.current.id!==id||latest.current.scope?.userId!==expected.userId||latest.current.scope?.context!==expected.context)return;
      savedExit.current={entry:persistedEntry.current,notice:"",scope:expected,afterClose,draft:draftRef.current,saved:saved.current};setClosingSaved(true);
    }finally{exitLock.current=false;}
  }
  useEffect(()=>{if(closeRequested&&!busy&&!attachmentBusy)void requestNoteExit(()=>{});},[closeRequested,busy,attachmentBusy]);
  const save=async()=>{
    if(saveLock.current || workLock.current || toolCloseLock.current || savedExit.current || preparing || voice.status!=="idle")return;
    if(panel&&!await finishTool(undefined,false,true))return;
    const draft=draftRef.current;
    setError("");setMessage("");
    if(!draft.destination){setError("Selecciona CALENDARIO, PENDIENTES o ARCHIVO antes de guardar.");void openTool("destinations");return;}
    if(!latest.current.ready || !latest.current.scope){setError("No se ha podido verificar tu cuenta y contexto. La nota permanece aquí; puedes volver a intentarlo cuando se recupere la sesión.");return;}
    try{validateNote(draft);}catch(e){setError(draft.destination==="calendar"&&!draft.dateISO?"Selecciona una fecha.":draft.destination==="calendar"&&!draft.time?"Selecciona una hora.":e instanceof Error?e.message:"Revisa los datos de la nota.");
      if((draft.dateISO&&!validNoteDate(draft.dateISO))||(draft.destination==="calendar"&&!draft.dateISO))void openTool("date");
      else if((draft.time&&!validNoteTime(draft.time))||(draft.destination==="calendar"&&!draft.time)||(e instanceof Error&&/hora/i.test(e.message)))void openTool("time");
      else if(e instanceof Error&&/duración/i.test(e.message))void openTool("duration");
      return;
    }
    saveLock.current=true;setBusy(true);
    try {
      const expected=latest.current.scope;
      const result=await onSave(operationDraft(draft));
      if(!latest.current.visible || latest.current.scope?.userId!==expected?.userId || latest.current.scope?.context!==expected?.context)return;
      const notice=result.notice||"Nota guardada.";persistedEntry.current=result.entry;const committed=noteDraft(result.entry);draftRef.current=committed;setDraft(committed);setMessage(notice);saved.current=true;
      requestAnimationFrame(()=>result.performance?.mark("visible"));
      if(onSaved&&expected){
        if(!await hideKeyboard()){setMessage("Nota guardada. Oculta el teclado y vuelve a pulsar GUARDAR para abrir su destino.");return;}
        if(!latest.current.visible||latest.current.scope?.userId!==expected.userId||latest.current.scope?.context!==expected.context)return;
        result.performance?.mark("keyboardHidden");savedExit.current={entry:result.entry,notice,scope:expected,performance:result.performance};setClosingSaved(true);
      }
    }catch(e){setError(e instanceof Error?e.message:"No se ha podido guardar. Tu nota sigue en el editor.");}
    finally{saveLock.current=false;setBusy(false);}
  };
  const input=(id:string,label:string,value:string,onChangeText:(value:string)=>void,extra:object={})=><View style={[s.field,id.startsWith("note-exact-")&&{flex:1,minWidth:100}]}>
    <Text style={[s.label,(id==="note-title"||id==="note-content")&&handedness==="left"&&{paddingLeft:44}]}>{label}</Text><TextInput testID={id} accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!busy&&!toolFinishing}
      onFocus={focusToolInput} placeholderTextColor="#626974" style={[s.input,(id==="note-title"||id==="note-content")&&writingInset]} {...extra}/></View>;
  const choice=(label:string,action:()=>void,selected=false,id?:string,menu=false)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled:busy||toolFinishing||attachmentBusy}}
    disabled={busy||toolFinishing||attachmentBusy} activeOpacity={0.78} onPress={action} style={[s.choice,selected&&s.configured,menu&&{paddingHorizontal:8}]}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,s.buttonSheen]}/><Text maxFontSizeMultiplier={menu?1.3:undefined} style={[s.text,s.choiceText]}>{label}</Text></TouchableOpacity>;
  const controlRow=[s.row,{flexDirection:handedness==="left"?"row" as const:"row-reverse" as const}];
  const options=(keys:string[])=>keys.map(key=>{
    const item:{[key:string]:[string,boolean]}={date:["FECHA",validNoteDate(draft.dateISO)],time:["HORA",validNoteTime(draft.time)],duration:["DURACIÓN",!!draft.duration],place:["UBICACIÓN",!!draft.place.trim()],reminder:["RECORDATORIO",draft.reminderMinutes!==null],attachments:["ADJUNTAR",!!draft.attachments.length]};
    return <React.Fragment key={key}>{choice(item[key][0],()=>void openTool(key),item[key][1],"note-option-"+key,true)}</React.Fragment>;
  });
  const applyTool=(patch:Partial<UnifiedNoteDraft>)=>{void finishTool(patch);};
  const working=toolDraft||draft;
  const recordPending=(key:"time"|"duration"|"reminderMinutes",edit:NoteToolEdit<string|number>)=>{const next={changed:edit.changed,error:edit.error,value:edit.value===undefined?undefined:{[key]:edit.value}};if(pendingTool.current&&!same(pendingTool.current,next))pendingCommit.current=null;pendingTool.current=next;};
  if(!visible)return null;
  return <GoScreenModal visible={!closingSaved} animationType="slide" onRequestClose={back} onDismiss={finishSaved}>
    <View testID="note-editor-root" style={s.root} onLayout={event=>setFrameHeight(event.nativeEvent.layout.height)}>
    <GoScreenCloseSurface testID="unified-note-screen" handedness={handedness} onClose={back} enabled={!busy&&!toolFinishing&&!attachmentBusy&&!closingSaved} scrollRefs={[scroll,toolsScroll]} style={s.root}>
      <KeyboardAvoidingView testID="KeyboardFrame" behavior="padding" style={{flex:1,paddingTop:insets.top+8,paddingHorizontal:Math.max(12,insets.left,insets.right)}}>
        <View style={s.header}><Text testID="note-heading" accessibilityRole="header" onPress={()=>void hideKeyboard()} style={s.heading}>NOTA</Text></View>
        <View ref={workspaceView} collapsable={false} testID="note-writing-workspace" style={s.workspace} onLayout={event=>{const {x,y,width,height}=event.nativeEvent.layout;setWorkspaceBounds(current=>Math.abs(current.width-width)<=1&&Math.abs(current.height-height)<=1&&Math.abs(current.x-x)<=1&&Math.abs(current.y-y)<=1?current:{x,y,width,height});}}>
        <ScrollView ref={scroll} testID="unified-note-scroll" style={s.writing}
          onLayout={event=>{const height=Math.max(120,Math.floor(event.nativeEvent.layout.height-110));setWritingHeight(current=>Math.abs(current-height)<=2?current:height);}}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bounces={false} alwaysBounceVertical={false} overScrollMode="never" automaticallyAdjustKeyboardInsets={false} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" removeClippedSubviews={false} contentContainerStyle={{paddingBottom:12,gap:12}}>
          {input("note-title","TÍTULO (OPCIONAL)",draft.title,title=>change({title}),{onFocus:(event:Parameters<NonNullable<TextInputProps["onFocus"]>>[0])=>{focusedToolTarget.current=null;focusedWritingTarget.current=event.target??event.nativeEvent.target??null;voice.focus("title");},maxLength:200})}
          {input("note-content","CONTENIDO",draft.content,content=>change({content}),{onFocus:(event:Parameters<NonNullable<TextInputProps["onFocus"]>>[0])=>{focusedToolTarget.current=null;focusedWritingTarget.current=event.target??event.nativeEvent.target??null;voice.focus("detail");},multiline:true,textAlignVertical:"top",scrollEnabled:true,
            style:[s.input,s.content,writingInset,{height:writingHeight}]})}
          {!!initial&&<View testID="note-current-settings" style={{gap:6}}>
            <Text style={s.hint}>{[draft.destination&&destinations.find(([key])=>key===draft.destination)?.[1],validNoteDate(draft.dateISO)&&noteDateLabel(draft.dateISO),draft.time,noteDurationLabel(draft.duration)].filter(Boolean).join(" · ")}</Text>
            {draft.reminderMinutes!==null&&<Text style={s.hint}>{noteReminderLabel(draft.reminderMinutes,false)}</Text>}
            {!!draft.place&&<Text style={s.hint}>{draft.place}</Text>}
            {!!draft.attachments.length&&<Text style={s.hint}>{draft.attachments.map(a=>a.name).join(" · ")}</Text>}
            {renderActions&&<View testID="note-existing-actions" pointerEvents={busy||toolFinishing?"none":"auto"} style={{backgroundColor:"#0e0e10",padding:10,borderRadius:12,gap:10}}>{renderActions(initial,()=>setToolsOpen(true))}</View>}
            {onGoToLanding&&<View style={{alignItems:handedness==="right"?"flex-end":"flex-start"}}><GoCloseButton level="container" touchSize={56} hitSlop={0} appearance="light" accessibilityLabel="Ir directamente al Landing" disabled={busy||toolFinishing||closingSaved} onPress={()=>void requestNoteExit(onGoToLanding)}/></View>}
          </View>}
          {!!reminderProgress?.message&&<Text testID="note-reminder-sync-status" accessibilityLiveRegion="polite" style={reminderProgress.phase==="warning"?s.warning:s.hint}>{reminderProgress.message}</Text>}
          {voice.status!=="idle"&&<Text style={s.hint}>{voice.status==="listening"?"Escuchando…":voice.status==="transcribing"?"Transcribiendo…":"Comprobando dictado…"}</Text>}
          {preparing&&<Text accessibilityLiveRegion="polite" style={s.hint}>Preparando borrador…</Text>}
          {!!preparedNotice&&<Text accessibilityLiveRegion="polite" style={s.hint}>{preparedNotice}</Text>}
        </ScrollView>

        </View>
        {!!error&&<Text testID="note-save-error" accessibilityRole="alert" style={s.warning}>{error}</Text>}
        {!!message&&<Text testID="note-save-confirmation" accessibilityLiveRegion="polite" style={s.success}>{message}</Text>}
        <GoScreenCloseGuide/>
        {!!floatingNotice&&<View testID="note-floating-notice" pointerEvents="none" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.floating,{top:insets.top+64}]}><Text style={s.text}>{floatingNotice}</Text></View>}
        <View testID="note-editor-footer" onLayout={event=>{const {height,y}=event.nativeEvent.layout;footerHeight.current=height;if(Number.isFinite(y))setFooterBottom(y+height);}} style={[s.footer,{paddingBottom:Math.max(insets.bottom,12),flexDirection:handedness==="left"?"row-reverse":"row"}]}>
          <TouchableOpacity testID="unified-note-save" accessibilityRole="button" disabled={busy||toolFinishing||closingSaved||attachmentBusy||preparing||voice.status!=="idle"} activeOpacity={0.78} onPress={()=>void save()} style={s.save}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.58)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,{borderRadius:18}]}/><Text style={s.saveText}>{busy?"GUARDANDO…":"GUARDAR"}</Text></TouchableOpacity>
          <TouchableOpacity testID="note-microphone" accessibilityRole="button" accessibilityLabel={voice.status==="listening"?"Detener escucha de GO":"Hablar con GO para preparar la nota"} accessibilityState={{selected:voice.status==="listening",disabled:busy||attachmentBusy||preparing||voice.status==="preparing"||voice.status==="transcribing"}}
            disabled={busy||attachmentBusy||preparing||voice.status==="preparing"||voice.status==="transcribing"} activeOpacity={0.78} onPress={()=>{if(draftRef.current.security){setFloatingNotice("Las notas de seguridad no están activadas y no se envían a la IA.");return;}if(!latest.current.ready){setFloatingNotice("Espera a que se verifique tu cuenta para hablar con GO.");return;}void voice.toggle();}} style={[assistantStyles.goButton,s.go,voice.status==="listening"&&assistantStyles.listening]}>
            <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.50)","rgba(255,255,255,0.00)"]} style={[StyleSheet.absoluteFill,{borderRadius:32}]}/><Feather name={voice.status==="listening"?"square":"mic"} size={22} color={voice.status==="listening"?"#ffffff":"#142D2A"}/><Text style={[s.goText,voice.status==="listening"&&{color:"#ffffff"}]}>{voice.status==="listening"?"Parar":"GO"}</Text></TouchableOpacity>
          <GoCloseButton level="panel" touchSize={56} hitSlop={0} onPress={back} accessibilityLabel={keyboardVisible||keyboard.dismissing?"Ocultar teclado":toolsOpen&&!!panel?"Volver a herramientas":toolsOpen?"Ocultar herramientas":"Cerrar nota"} disabled={busy||toolFinishing||closingSaved} appearance="light"/>
        </View>
      </KeyboardAvoidingView>
    </GoScreenCloseSurface>
    <View testID="note-tools-floating-layer" pointerEvents="box-none" style={{position:"absolute",left:workspaceBounds.x,top:workspaceBounds.y,width:workspaceBounds.width,height:workspaceBounds.height,zIndex:40}}>
        <View testID="note-tools-panel" pointerEvents={toolsOpen?"auto":"none"} accessibilityElementsHidden={!toolsOpen} importantForAccessibility={toolsOpen?"auto":"no-hide-descendants"}
          style={[s.tools,handedness==="right"?{right:0}:{left:0},{width:toolsWidth,height:toolsHeight,maxHeight:workspaceBounds.height||"100%",display:toolsOpen?"flex":"none"}]}>
          {!!openingTool&&<View style={{padding:16}}><Text accessibilityLiveRegion="polite" style={s.text}>Preparando herramienta…</Text></View>}
          <View style={{flex:panel==="date"?1:undefined,flexShrink:1,minHeight:0,display:openingTool?"none":"flex"}}>
          {!!panel&&panel!=="date"&&!keyboardVisible&&<View testID="note-tool-header" style={{paddingHorizontal:8,paddingVertical:4}}>
            <Text accessibilityRole="header" style={{flex:1,color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center"}}>{{date:"FECHA",time:"HORA",duration:"DURACIÓN",reminder:"RECORDATORIO",place:"UBICACIÓN",attachments:"ADJUNTAR",destinations:"DESTINO"}[panel]}</Text>
          </View>}
          {panel==="date"?<View style={{flex:1,minHeight:0,padding:4}}><GoNoteDatePicker value={draft.dateISO} disabled={busy||toolFinishing} light compact onPreferredHeight={setDateContentHeight} clearControl={<View style={{flex:1}}><GoNoteToolFooter testID="note-date-save" removeID="note-date-clear" besideHandle={false} handedness={handedness} disabled={busy||toolFinishing} onSave={()=>void finishTool()} onRemove={draft.dateISO?()=>applyTool({dateISO:""}):undefined} removeLabel="QUITAR FECHA"/></View>} onChange={dateISO=>{if(!validNoteDate(dateISO)){setError("La fecha no es válida.");return;}applyTool({dateISO});}}/></View>
          :<ScrollView ref={toolsScroll} key={panel||"tools"} testID="note-tools-scroll" style={{flexGrow:0,flexShrink:1}} showsVerticalScrollIndicator={!!panel} onLayout={()=>{if(keyboardVisible)revealToolInput();}} keyboardShouldPersistTaps="always" keyboardDismissMode="none" bounces={false} alwaysBounceVertical={false} overScrollMode="never" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} automaticallyAdjustKeyboardInsets={false} contentContainerStyle={{gap:10,padding:panel?12:8,paddingBottom:panel?4:8}}>
          {panel==="time"&&<GoNoteTimePicker value={draft.time} disabled={busy||toolFinishing} handedness={handedness} onPendingChange={edit=>recordPending("time",edit)} onInputFocus={focusToolInput} onApply={time=>applyTool({time})} onClear={()=>applyTool({time:""})}/>}
          {panel==="duration"&&<GoNoteDurationPicker value={draft.duration} disabled={busy||toolFinishing} handedness={handedness} onPendingChange={edit=>recordPending("duration",edit)} onInputFocus={focusToolInput} onApply={duration=>applyTool({duration})} onClear={()=>applyTool({duration:""})}/>}
          {!panel&&<>
            <View testID="note-primary-controls" style={controlRow}>{options(["date","time","duration","reminder"])}</View>
            <View testID="note-secondary-controls" style={controlRow}>{options(["place","attachments"])}</View>
          </>}
          {(!panel||panel==="destinations")&&<><Text style={s.label}>DESTINO</Text><View testID="note-destinations" style={s.destinationList}>{destinations.map(([value,label])=><TouchableOpacity key={value} testID={"note-destination-"+value}
            accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:draft.destination===value,selected:draft.destination===value}} disabled={busy} activeOpacity={0.78} onPress={()=>{setError("");void persistConfiguration({destination:value}).then(ok=>{if(ok&&panel==="destinations")setPanel("");});}}
            style={[s.choice,s.destination,{calendar:s.calendar,pending:s.pending,archive:s.archive}[value],draft.destination===value&&[s.selectedDestination,{backgroundColor:{calendar:"#23674f",pending:"#806017",archive:"#315f9c"}[value]}]]}><LinearGradient pointerEvents="none" colors={draft.destination===value?["rgba(255,255,255,0.08)","rgba(0,0,0,0.07)"]:["rgba(255,255,255,0.55)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,s.buttonSheen]}/><Text testID={"note-destination-label-"+value} maxFontSizeMultiplier={1.3} style={[s.destinationText,draft.destination===value&&s.destinationActiveText]}>{label}</Text>{draft.destination===value&&<Text testID="note-destination-selected" maxFontSizeMultiplier={1.3} style={{color:"#ffffff",fontSize:11,fontWeight:"800",textAlign:"center",marginTop:3}}>✓ SELECCIONADO</Text>}</TouchableOpacity>)}</View></>}
          {panel==="destinations"&&<GoNoteToolFooter testID="note-destination-save" disabled={busy||toolFinishing} handedness={handedness} onSave={()=>{if(!draftRef.current.destination){setError("Selecciona CALENDARIO, PENDIENTES o ARCHIVO.");return;}void finishTool({destination:draftRef.current.destination});}}/>}
          {!panel&&<>
            <TouchableOpacity testID="note-security-info" accessibilityRole="button" accessibilityLabel="NOTA DE SEGURIDAD, no disponible, información" activeOpacity={0.78} onPress={()=>setFloatingNotice("Aún no disponible: falta validar el cifrado y el acceso seguro de las notas.")} style={[s.choice,s.security]}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,s.buttonSheen]}/><Feather name="lock" color="#323b44" size={16}/><View style={{flex:1}}><Text maxFontSizeMultiplier={1.5} style={s.securityText}>NOTA DE SEGURIDAD</Text><Text maxFontSizeMultiplier={1.5} style={[s.hint,{fontSize:11,textAlign:"center"}]}>No disponible</Text></View></TouchableOpacity>
            {!!(draft.dateISO||draft.time||draft.duration||draft.place)&&<Text testID="note-summary" style={s.hint}>{[validNoteDate(draft.dateISO)?noteDateLabel(draft.dateISO):draft.dateISO?"Fecha no válida":"",draft.time,noteDurationLabel(draft.duration),draft.place].filter(Boolean).join(" · ")}</Text>}
          </>}
          {panel==="place"&&<View testID="note-place-form" style={{gap:8}}>{input("note-place","DIRECCIÓN O LUGAR",working.place,place=>{stage({place,location:undefined});setLocationSource("manual");setLocations([]);})}<View style={controlRow}>{choice("Buscar ubicación",()=>void locate(true))}{choice(locationSource==="current"?"✓ Ubicación actual":"Ubicación actual",()=>void locate(false),locationSource==="current","note-location-current")}</View>
            {locations.map((result,index)=><React.Fragment key={index}>{choice(result.label,()=>{const {label,...location}=result;stage({location,place:label});setLocationSource("manual");setLocations([]);},false,"note-location-result-"+index)}</React.Fragment>)}
            {!!(working.place||working.location)&&<View testID="note-location-selection" accessibilityLiveRegion="polite" style={[s.configured,{padding:8,borderWidth:1,borderRadius:10}]}><Text style={s.text}>{locationSource?"✓ Seleccionada: ":"Ubicación guardada: "}{working.place}</Text>{working.location&&<Text style={s.hint}>{working.location.latitude.toFixed(5)}, {working.location.longitude.toFixed(5)}</Text>}</View>}
            <GoNoteToolFooter testID="note-place-save" removeID="note-place-clear" disabled={busy||toolFinishing||attachmentBusy} handedness={handedness} onSave={()=>void finishTool()} onRemove={draft.place||draft.location?()=>applyTool({place:"",location:undefined}):undefined} removeLabel="QUITAR" removeAccessibilityLabel="Quitar ubicación"/>
          </View>}
          {panel==="reminder"&&<GoNoteReminderPicker value={draft.reminderMinutes} onChange={reminderMinutes=>applyTool({reminderMinutes})} onInputFocus={focusToolInput} onPendingChange={edit=>recordPending("reminderMinutes",edit)} handedness={handedness} unified dateISO={draft.dateISO} time={draft.time} busy={busy||toolFinishing} light/>}
          {panel==="attachments"&&<View style={s.section}>
            {input("note-link","ENLACE O UBICACIÓN COMPARTIDA",link,value=>{pendingCommit.current=null;setLink(value);},{autoCapitalize:"none",keyboardType:"url",placeholder:"https://…"})}
            {choice("Añadir enlace",()=>{try{attachmentPatch();setError("");}catch(e){setError((e as Error).message);}})}
            {choice("PDF o documento",()=>void attach("file"))}
            {choice("Fotografías",()=>void attach("image"))}
          </View>}
          {(!panel||panel==="attachments")&&(panel==="attachments"?working:draft).attachments.map(a=><View key={a.id} style={s.attachment}><TouchableOpacity accessibilityRole="button" disabled={busy||toolFinishing||attachmentBusy} style={{flex:1,minHeight:44,justifyContent:"center"}} onPress={()=>void (a.kind==="link"?Linking.openURL(a.uri):Share.share({url:a.uri,title:a.name})).catch(()=>setError("No se ha podido abrir el adjunto."))}><Text style={s.text}>{a.name}</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Quitar "+a.name} disabled={busy||toolFinishing||attachmentBusy} style={s.icon} onPress={()=>{if(panel==="attachments")stage({attachments:(toolDraftRef.current||draftRef.current).attachments.filter(b=>b.id!==a.id)});else void persistConfiguration({attachments:draftRef.current.attachments.filter(b=>b.id!==a.id)});}}><Feather name="x" size={20} color="#242b34"/></TouchableOpacity></View>)}
          {panel==="attachments"&&<GoNoteToolFooter testID="note-attachments-save" disabled={busy||toolFinishing||attachmentBusy} handedness={handedness} onSave={()=>void finishTool()}/>}
          </ScrollView>}
          </View>
        </View>
      {workspaceBounds.width>=44&&workspaceBounds.height>=64&&
      <DraggableFAB screenKey="note-editor" buttonKey="tools-toggle" bounds={{width:workspaceBounds.width,height:toggleBoundsHeight}} boundsVerticalInset={panel?0:8} buttonWidth={44} maxH={48} initialTop={toggleTop} fixedLeft={toggleLeft} onDragStart={markToggleDrag}>
        <TouchableOpacity testID="note-tools-toggle" accessibilityRole="button" accessibilityLabel={toolsOpen?"Ocultar herramientas de la nota":"Mostrar herramientas de la nota"} accessibilityHint="Mantén pulsado medio segundo para mover la flecha verticalmente" accessibilityState={{expanded:toolsOpen}}
          delayLongPress={500} disabled={busy||toolFinishing||attachmentBusy||closingSaved} onPressIn={()=>{suppressToggle.current=false;}} onLongPress={markToggleDrag} activeOpacity={0.78} onPress={()=>{if(suppressToggle.current||saveLock.current||workLock.current)return;if(!toolsOpen){void openTool("");return;}if(panel){void finishTool(undefined,true);return;}toolRequest.current++;setOpeningTool("");setAwaitingTool(null);if(focusedToolTarget.current)void hideKeyboard();setToolsOpen(false);}} style={s.toolsToggle}>
          <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,{borderRadius:14}]}/><Feather name={handedness==="right"?(toolsOpen?"chevron-right":"chevron-left"):(toolsOpen?"chevron-left":"chevron-right")} size={22} color="#202830"/>
        </TouchableOpacity>
      </DraggableFAB>}
    </View>
    </View>
  </GoScreenModal>;
}
const s=StyleSheet.create({keyboardBack:{position:"absolute",width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"#eaf0f3"},root:{flex:1,backgroundColor:"#FAFAF7"},header:{justifyContent:"center",alignItems:"center",minHeight:44},heading:{color:"#18212a",fontSize:20,fontWeight:"800",textAlign:"center",width:"100%"},
  workspace:{flex:1,minHeight:0},writing:{flex:1},field:{gap:6,flexShrink:0},label:{color:"#424b55",fontSize:12,fontWeight:"700"},input:{minHeight:48,color:"#17212b",fontSize:16,borderWidth:1.5,borderColor:"#9aa3ad",backgroundColor:"rgba(255,255,255,0.86)",borderRadius:12,padding:12},content:{borderColor:"#b8bfc5",fontSize:17},
  number:{fontSize:28,textAlign:"center",minHeight:64},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8},choice:{minHeight:44,paddingVertical:8,paddingHorizontal:10,borderWidth:1,borderColor:"#adbac3",borderTopColor:"#ffffff",borderBottomColor:"#a0afb9",backgroundColor:"rgba(231,237,242,0.96)",borderRadius:12,justifyContent:"center",width:"100%",shadowColor:"#2b3d45",shadowOpacity:0.13,shadowRadius:5,shadowOffset:{width:0,height:3},elevation:3},buttonSheen:{borderRadius:12},choiceText:{textAlign:"center",fontWeight:"500"},configured:{borderColor:"#16834a",backgroundColor:"rgba(212,243,222,0.90)"},destinationList:{gap:8},destination:{width:"100%"},calendar:{backgroundColor:"rgba(199,236,224,0.90)",borderColor:"#84ab9e"},pending:{backgroundColor:"rgba(255,239,168,0.90)",borderColor:"#b5a15c"},archive:{backgroundColor:"rgba(211,229,255,0.90)",borderColor:"#93adc9"},selectedDestination:{borderColor:"#446657",borderWidth:2.5,shadowOpacity:0.24,shadowRadius:7,shadowOffset:{width:0,height:4},elevation:6,transform:[{translateY:-1}]},destinationText:{color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center"},destinationActiveText:{color:"#ffffff"},
  text:{color:"#17212b",fontSize:13,flexShrink:1},hint:{color:"#515d69",fontSize:12},warning:{color:"#8a3d0a",fontSize:13,paddingVertical:6},success:{color:"#146339",fontSize:13,paddingVertical:6},section:{gap:10,padding:8,borderWidth:1.5,borderColor:"#aeb8bf",borderRadius:12},
  tools:{position:"absolute",bottom:0,maxHeight:"100%",borderWidth:1,borderColor:"#b2bdc5",borderRadius:20,backgroundColor:"rgba(249,252,251,0.97)",zIndex:5,shadowColor:"#2b3d45",shadowOpacity:0.17,shadowRadius:16,shadowOffset:{width:0,height:6},elevation:5},toolsToggle:{width:44,height:48,alignItems:"center",justifyContent:"center",borderRadius:14,borderWidth:1,borderColor:"#a5b0b8",backgroundColor:"rgba(233,239,243,0.94)",zIndex:6,shadowColor:"#2b3d45",shadowOpacity:0.14,shadowRadius:6,shadowOffset:{width:0,height:3},elevation:3},
  icon:{width:44,height:44,alignItems:"center",justifyContent:"center"},attachment:{flexDirection:"row",alignItems:"center",gap:8,borderWidth:1.5,borderColor:"#aeb8bf",paddingHorizontal:10,borderRadius:10},
  security:{flexDirection:"row",alignItems:"center",gap:6},securityText:{color:"#323b44",fontSize:11,fontWeight:"600",textAlign:"center",flexShrink:1},floating:{position:"absolute",left:12,right:12,padding:14,borderRadius:14,borderWidth:1.5,borderColor:"#89949d",backgroundColor:"#eef2f4",zIndex:20},
  go:{marginHorizontal:0,alignItems:"center",justifyContent:"center",gap:2,backgroundColor:"rgba(211,241,224,0.94)",borderColor:"#86a895",borderWidth:1,shadowColor:"#2b3d45",shadowOpacity:0.16,shadowRadius:7,shadowOffset:{width:0,height:4},elevation:4},goText:{color:"#142D2A",fontSize:13,fontWeight:"800"},
  footer:{flexDirection:"row",alignItems:"center",gap:10,paddingTop:8},save:{flex:1,minHeight:52,borderRadius:18,borderWidth:1,borderColor:"#86a895",backgroundColor:"rgba(193,235,211,0.94)",alignItems:"center",justifyContent:"center",shadowColor:"#2b3d45",shadowOpacity:0.14,shadowRadius:6,shadowOffset:{width:0,height:3},elevation:3},saveText:{color:"#17212b",fontSize:15,fontWeight:"800"}});
