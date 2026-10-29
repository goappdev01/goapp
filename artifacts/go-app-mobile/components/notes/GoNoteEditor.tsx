import React, { useCallback, useEffect, useRef, useState } from "react";
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
import { useGoNoteVoice } from "@/hooks/useGoNoteVoice";
import { useGoNoteKeyboard } from "@/hooks/useGoNoteKeyboard";
import { s as assistantStyles } from "@/components/booking-assistant/BookingAssistantUI";
import { prepareGoNote } from "@/lib/goNotePreparation";
import { appendNoteDictation } from "@/lib/goNoteTools";
import { importNoteFile } from "@/lib/goNoteFiles";
import { noteDraft, noteId, validNoteDate, validNoteTime, validateNote, type NoteDestination, type UnifiedNoteDraft } from "@/lib/unifiedNotes";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "@/lib/goTaskReminders";

type Props = { visible:boolean; initial?:GoEntry|null; seed?:{title?:string;content?:string;destination?:NoteDestination;dateISO?:string;time?:string};
  scope:TaskScope|null; ready:boolean; handedness:"left"|"right"; cached?:UnifiedNoteDraft; onClose:(state?:{draft:UnifiedNoteDraft;saved:boolean})=>void;
  onSave:(draft:UnifiedNoteDraft)=>Promise<{entry:GoEntry;message:string}> };
const destinations: [NoteDestination,string][]=[["calendar","CALENDARIO"],["pending","PENDIENTES"],["archive","ARCHIVO"]];

/** One ordinary-note editor, one native presenter, and one acknowledged save operation. */
export function GoNoteEditor({visible,initial,seed,scope,ready,handedness,onClose,onSave,cached}:Props) {
  const insets=useSafeAreaInsets(),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),keyboard=useGoNoteKeyboard(visible);
  const [draft,setDraft]=useState<UnifiedNoteDraft>(()=>cached||noteDraft(initial)),[panel,setPanel]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [busy,setBusy]=useState(false),[attachmentBusy,setAttachmentBusy]=useState(false),[link,setLink]=useState("");
  const [toolsOpen,setToolsOpen]=useState(false),[writingHeight,setWritingHeight]=useState(240);
  const toolsScroll=useRef<React.ElementRef<typeof ScrollView>>(null);
  const workspaceView=useRef<React.ElementRef<typeof View>>(null);
  const [openingTool,setOpeningTool]=useState(""),[awaitingTool,setAwaitingTool]=useState<{key:string;epoch:number;id:string}|null>(null);
  const [frameHeight,setFrameHeight]=useState(0),[footerBottom,setFooterBottom]=useState(0);
  const keyboardVisible=keyboard.visible;
  const toolRequest=useRef(0),footerHeight=useRef(106),focusedToolTarget=useRef<Parameters<React.ElementRef<typeof ScrollView>["scrollResponderScrollNativeHandleToKeyboard"]>[0]|null>(null);
  const viewport=useWindowDimensions(),[workspaceBounds,setWorkspaceBounds]=useState({x:0,y:0,width:0,height:0});
  const usableWidth=workspaceBounds.width||Math.max(0,viewport.width-2*Math.max(12,insets.left,insets.right));
  // Two readable columns expose all ten tools together; large text falls back to one.
  const twoToolColumns=usableWidth>=2*(104*viewport.fontScale+24)+32;
  const toolsWidth=panel?usableWidth:Math.min(usableWidth,Math.ceil(Math.max(usableWidth*.72,(twoToolColumns?2:1)*(104*viewport.fontScale+24)+32)));
  const toolsHeight=panel&&workspaceBounds.height?workspaceBounds.height:undefined;
  const toggleTop=Math.max(8,Math.min(workspaceBounds.height-56,Math.round(workspaceBounds.height*.74)));
  const suppressToggle=useRef(false),markToggleDrag=useCallback(()=>{suppressToggle.current=true;},[]);
  const toggleLeft=handedness==="right"?usableWidth-44:0;
  const writingInset=handedness==="right"?{paddingRight:56}:{paddingLeft:56};
  const [locations,setLocations]=useState<{latitude:number;longitude:number;label:string}[]>([]);
  const [preparing,setPreparing]=useState(false),[preparedNotice,setPreparedNotice]=useState(""),[floatingNotice,setFloatingNotice]=useState("");
  const preparation=useRef(0),draftRef=useRef(draft);draftRef.current=draft;
  const saveLock=useRef(false),workLock=useRef(false),session=useRef(""),latest=useRef({scope,ready,visible,id:draft.id});latest.current={scope,ready,visible,id:draft.id};
  const saved=useRef(false),wasVisible=useRef(false),operation=useRef({value:"",id:noteId()});
  const lastScope=useRef(scope);
  const revealToolInput=useCallback(()=>{if(focusedToolTarget.current)toolsScroll.current?.scrollResponderScrollNativeHandleToKeyboard(focusedToolTarget.current,footerHeight.current+16,true);},[]);
  const focusToolInput:NonNullable<TextInputProps["onFocus"]>=event=>{focusedToolTarget.current=event.target??event.nativeEvent.target??null;revealToolInput();};
  useEffect(()=>{
    if(!visible||!keyboardVisible||!focusedToolTarget.current)return;
    const frame=requestAnimationFrame(revealToolInput);
    return()=>cancelAnimationFrame(frame);
  },[visible,keyboardVisible,workspaceBounds.height,revealToolInput]);
  useEffect(()=>{if(!visible){toolRequest.current++;setOpeningTool("");setAwaitingTool(null);}return()=>{toolRequest.current++;};},[visible]);
  const hideKeyboard=async()=>{const epoch=toolRequest.current,id=latest.current.id;focusedToolTarget.current=null;const hidden=await keyboard.dismiss();if(!hidden&&epoch===toolRequest.current&&latest.current.visible&&latest.current.id===id)setFloatingNotice("No se ha confirmado el cierre del teclado. Tu nota sigue abierta; vuelve a pulsar la flecha inferior.");return hidden;};
  const openTool=async(key:string)=>{
    const epoch=++toolRequest.current,id=latest.current.id;
    focusedToolTarget.current=null;setToolsOpen(true);setOpeningTool(key||"tools");
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
        if(width&&height)setWorkspaceBounds(current=>({...current,width,height}));setPanel(awaitingTool.key);setOpeningTool("");setAwaitingTool(null);
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
        setDraft(next);setPanel("");setToolsOpen(false);setLocations([]);setError("");setMessage("");setPreparedNotice("");saved.current=false;}
      session.current=key;voice.focus("detail");
    }
    wasVisible.current=visible;
  },[visible,initial?.id]);
  useEffect(()=>{const previous=lastScope.current;lastScope.current=scope;
    if(previous && (previous.userId!==scope?.userId || previous.context!==scope?.context)){
      preparation.current++;toolRequest.current++;setOpeningTool("");setAwaitingTool(null);setPreparing(false);setFloatingNotice("");voice.abort();setDraft(noteDraft());setPanel("");setLocations([]);setError("");setMessage("");session.current="";if(visible)onClose();
    }
    return()=>voice.abort();
  },[scope?.userId,scope?.context]);
  const change=(patch:Partial<UnifiedNoteDraft>)=>{setDraft(d=>({...d,...patch}));setMessage("");saved.current=false;};
  const close=()=>{if(saveLock.current||workLock.current)return;preparation.current++;setPreparing(false);voice.abort();Keyboard.dismiss();onClose({draft,saved:saved.current});};
  const back=()=>{if(keyboard.isActive()){void hideKeyboard();return;}if(!openingTool)close();};
  const work=async(fn:()=>Promise<void>)=>{if(workLock.current||saveLock.current)return;workLock.current=true;setAttachmentBusy(true);setError("");try{await fn();}catch(e){if(latest.current.visible)setError(e instanceof Error?e.message:"No se ha podido completar la selección.");}finally{workLock.current=false;setAttachmentBusy(false);}};
  const attach=async(kind:"file"|"image")=>work(async()=>{
    const expected=latest.current.scope,expectedId=draft.id;if(!expected || !latest.current.ready)throw new Error("Espera a que se verifique tu cuenta para adjuntar archivos.");
    if(!await hideKeyboard())return;
    if(!latest.current.visible||latest.current.id!==expectedId||latest.current.scope?.userId!==expected.userId||latest.current.scope?.context!==expected.context)return;
    const assets=kind==="file"?await DocumentPicker.getDocumentAsync({copyToCacheDirectory:true,multiple:true})
      :await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true});
    if(assets.canceled)return;
    const added=[];
    for(const asset of assets.assets){if(!latest.current.visible || latest.current.id!==expectedId || latest.current.scope?.userId!==expected.userId || latest.current.scope?.context!==expected.context)return;
      added.push(await importNoteFile(expected,draft.id,{uri:asset.uri,name:"name" in asset?asset.name:asset.fileName||"Fotografía.jpg",mimeType:asset.mimeType,size:"size" in asset?asset.size:"fileSize" in asset?asset.fileSize:undefined}));}
    if(latest.current.visible && latest.current.id===expectedId && latest.current.scope?.userId===expected.userId && latest.current.scope?.context===expected.context){change({attachments:[...draft.attachments,...added]});if(added.length)setFloatingNotice("Archivo incorporado al borrador. Pulsa GUARDAR para conservar la nota.");}
  });
  const locate=async(search:boolean)=>work(async()=>{
    const expected=latest.current.scope,expectedId=draft.id;
    if(!expected||!latest.current.ready)throw new Error("Espera a que se verifique tu cuenta para seleccionar la ubicación.");
    if(!search||Platform.OS==="android"){const permission=await Location.requestForegroundPermissionsAsync();if(permission.status!=="granted")throw new Error("Permite el acceso a ubicación o escribe la dirección manualmente.");}
    const coordinates=search?await Location.geocodeAsync(draft.place):[(await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced})).coords];
    if(!coordinates.length)throw new Error("No se ha encontrado esa ubicación. Puedes conservar la dirección escrita.");
    const results=[];for(const point of coordinates.slice(0,5)){const address=(await Location.reverseGeocodeAsync(point))[0];results.push({latitude:point.latitude,longitude:point.longitude,label:[address?.street,address?.streetNumber,address?.city].filter(Boolean).join(", ")||draft.place||`${point.latitude}, ${point.longitude}`});}
    if(latest.current.visible&&latest.current.id===expectedId&&latest.current.scope?.userId===expected.userId&&latest.current.scope?.context===expected.context){
      if(search)setLocations(results);else{const {label,...location}=results[0];change({location,place:label});setLocations([]);}
    }
  });
  const save=async()=>{
    if(saveLock.current || workLock.current || preparing || voice.status!=="idle")return;
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
      const value=JSON.stringify({...draft,original:undefined,operationId:undefined});
      if(operation.current.value!==value)operation.current={value,id:noteId()};
      const expected=latest.current.scope;
      const result=await onSave({...draft,operationId:operation.current.id});
      if(!latest.current.visible || latest.current.scope?.userId!==expected?.userId || latest.current.scope?.context!==expected?.context)return;
      setDraft(noteDraft(result.entry));setMessage(result.message);saved.current=true;
    }catch(e){setError(e instanceof Error?e.message:"No se ha podido guardar. Tu nota sigue en el editor.");}
    finally{saveLock.current=false;setBusy(false);}
  };
  const input=(id:string,label:string,value:string,onChangeText:(value:string)=>void,extra:object={})=><View style={[s.field,id.startsWith("note-exact-")&&{flex:1,minWidth:100}]}>
    <Text style={[s.label,(id==="note-title"||id==="note-content")&&handedness==="left"&&{paddingLeft:44}]}>{label}</Text><TextInput testID={id} accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!busy}
      onFocus={focusToolInput} placeholderTextColor="#626974" style={[s.input,(id==="note-title"||id==="note-content")&&writingInset]} {...extra}/></View>;
  const menuCell=twoToolColumns?{width:"47%" as const,flexGrow:1}:{width:"100%" as const};
  const choice=(label:string,action:()=>void,selected=false,id?:string,menu=false)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled:busy||attachmentBusy}}
    disabled={busy||attachmentBusy} activeOpacity={0.78} onPress={action} style={[s.choice,selected&&s.configured,menu&&menuCell]}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,s.buttonSheen]}/><Text style={[s.text,s.choiceText]}>{label}</Text></TouchableOpacity>;
  const controlRow=[s.row,{flexDirection:handedness==="left"?"row" as const:"row-reverse" as const}];
  const options=(keys:string[])=>keys.map(key=>{
    const item:{[key:string]:[string,boolean]}={date:["FECHA",validNoteDate(draft.dateISO)],time:["HORA",validNoteTime(draft.time)],duration:["DURACIÓN",!!draft.duration],place:["UBICACIÓN",!!draft.place.trim()],reminder:["RECORDATORIO",draft.reminderMinutes!==null],attachments:["ADJUNTAR",!!draft.attachments.length]};
    return <React.Fragment key={key}>{choice(item[key][0],()=>void openTool(key),item[key][1],"note-option-"+key,true)}</React.Fragment>;
  });
  const toolBack=(inHeader=false,compact=false)=><TouchableOpacity testID="note-tool-back" accessibilityRole="button" accessibilityLabel="Volver a herramientas" onPress={()=>void openTool("")} style={inHeader?[s.keyboardBack,handedness==="right"?{left:0}:{right:0}]:{minWidth:compact?44:64,minHeight:compact?44:48,alignItems:"center",justifyContent:"center",...(compact?{borderRadius:10,backgroundColor:"#eaf0f3"}:{})}}><Feather name="chevron-left" size={18} color="#17212b"/>{!inHeader&&!compact&&<Text style={{color:"#17212b",fontSize:10,fontWeight:"700"}}>VOLVER</Text>}</TouchableOpacity>;
  if(!visible)return null;
  return <GoScreenModal visible animationType="slide" onRequestClose={back}>
    <View testID="note-editor-root" style={s.root} onLayout={event=>setFrameHeight(event.nativeEvent.layout.height)}>
    <GoScreenCloseSurface testID="unified-note-screen" handedness={handedness} onClose={close} enabled={!busy&&!attachmentBusy} scrollRefs={[scroll,toolsScroll]} style={s.root}>
      <KeyboardAvoidingView testID="KeyboardFrame" behavior="padding" style={{flex:1,paddingTop:insets.top+8,paddingHorizontal:Math.max(12,insets.left,insets.right)}}>
        <View style={s.header}><Text testID="note-heading" accessibilityRole="header" onPress={()=>void hideKeyboard()} style={s.heading}>NOTA</Text>{keyboardVisible&&!!panel&&toolBack(true)}</View>
        <View ref={workspaceView} collapsable={false} testID="note-writing-workspace" style={s.workspace} onLayout={event=>{const {x,y,width,height}=event.nativeEvent.layout;setWorkspaceBounds(current=>Math.abs(current.width-width)<=1&&Math.abs(current.height-height)<=1&&Math.abs(current.x-x)<=1&&Math.abs(current.y-y)<=1?current:{x,y,width,height});}}>
        <ScrollView ref={scroll} testID="unified-note-scroll" style={s.writing}
          onLayout={event=>{const height=Math.max(120,Math.floor(event.nativeEvent.layout.height-110));setWritingHeight(current=>Math.abs(current-height)<=2?current:height);}}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bounces={false} alwaysBounceVertical={false} overScrollMode="never" automaticallyAdjustKeyboardInsets={false} automaticallyAdjustContentInsets={false} contentInsetAdjustmentBehavior="never" removeClippedSubviews={false} contentContainerStyle={{paddingBottom:12,gap:12}}>
          {input("note-title","TÍTULO (OPCIONAL)",draft.title,title=>change({title}),{onFocus:()=>{focusedToolTarget.current=null;voice.focus("title");},maxLength:200})}
          {input("note-content","CONTENIDO",draft.content,content=>change({content}),{onFocus:()=>{focusedToolTarget.current=null;voice.focus("detail");},multiline:true,textAlignVertical:"top",scrollEnabled:true,
            style:[s.input,s.content,writingInset,{height:writingHeight}]})}
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
          <TouchableOpacity testID="unified-note-save" accessibilityRole="button" disabled={busy||attachmentBusy||preparing||voice.status!=="idle"} activeOpacity={0.78} onPress={()=>void save()} style={s.save}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.58)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,{borderRadius:18}]}/><Text style={s.saveText}>{busy?"GUARDANDO…":"GUARDAR"}</Text></TouchableOpacity>
          <TouchableOpacity testID="note-microphone" accessibilityRole="button" accessibilityLabel={voice.status==="listening"?"Detener escucha de GO":"Hablar con GO para preparar la nota"} accessibilityState={{selected:voice.status==="listening",disabled:busy||attachmentBusy||preparing||voice.status==="preparing"||voice.status==="transcribing"}}
            disabled={busy||attachmentBusy||preparing||voice.status==="preparing"||voice.status==="transcribing"} activeOpacity={0.78} onPress={()=>{if(draftRef.current.security){setFloatingNotice("Las notas de seguridad no están activadas y no se envían a la IA.");return;}if(!latest.current.ready){setFloatingNotice("Espera a que se verifique tu cuenta para hablar con GO.");return;}void voice.toggle();}} style={[assistantStyles.goButton,s.go,voice.status==="listening"&&assistantStyles.listening]}>
            <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.50)","rgba(255,255,255,0.00)"]} style={[StyleSheet.absoluteFill,{borderRadius:32}]}/><Feather name={voice.status==="listening"?"square":"mic"} size={22} color={voice.status==="listening"?"#ffffff":"#142D2A"}/><Text style={[s.goText,voice.status==="listening"&&{color:"#ffffff"}]}>{voice.status==="listening"?"Parar":"GO"}</Text></TouchableOpacity>
          <GoCloseButton level="panel" touchSize={56} hitSlop={0} onPress={back} accessibilityLabel={keyboardVisible||keyboard.dismissing?"Ocultar teclado":"Cerrar nota"} disabled={busy} appearance="light"/>
        </View>
      </KeyboardAvoidingView>
    </GoScreenCloseSurface>
    <View testID="note-tools-floating-layer" pointerEvents="box-none" style={{position:"absolute",left:workspaceBounds.x,top:workspaceBounds.y,width:workspaceBounds.width,height:workspaceBounds.height,zIndex:40}}>
        <View testID="note-tools-panel" pointerEvents={toolsOpen?"auto":"none"} accessibilityElementsHidden={!toolsOpen} importantForAccessibility={toolsOpen?"auto":"no-hide-descendants"}
          style={[s.tools,handedness==="right"?{right:0}:{left:0},{width:toolsWidth,height:toolsHeight,maxHeight:workspaceBounds.height||"100%",display:toolsOpen?"flex":"none"}]}>
          {!!openingTool&&<View style={{padding:16}}><Text accessibilityLiveRegion="polite" style={s.text}>Preparando herramienta…</Text></View>}
          <View style={{flex:panel?1:undefined,flexShrink:1,minHeight:0,display:openingTool?"none":"flex"}}>
          {!!panel&&panel!=="date"&&!keyboardVisible&&<View testID="note-tool-header" style={{flexDirection:handedness==="right"?"row":"row-reverse",alignItems:"center",gap:8,paddingHorizontal:8,paddingVertical:6}}>
            {toolBack()}
            <Text accessibilityRole="header" style={{flex:1,color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center"}}>{{date:"FECHA",time:"HORA",duration:"DURACIÓN",reminder:"RECORDATORIO",place:"UBICACIÓN",attachments:"ADJUNTAR",destinations:"DESTINO"}[panel]}</Text>
          </View>}
          {panel==="date"?<View style={{flex:1,minHeight:0,padding:4}}><GoNoteDatePicker value={draft.dateISO} disabled={busy} light navigationAccessory={toolBack(false,true)} clearControl={<View style={{flex:1}}>{choice("SIN FECHA",()=>{change({dateISO:""});setError("");setPanel("");},false,"note-date-clear")}</View>} onChange={dateISO=>{if(!validNoteDate(dateISO)){setError("La fecha no es válida.");return;}change({dateISO});setError("");setPanel("");}}/></View>
          :panel==="time"?<View style={{flex:1,minHeight:0,padding:12}}><GoNoteTimePicker value={draft.time} disabled={busy} onApply={time=>{change({time});setError("");setPanel("");}} onClear={()=>{change({time:""});setError("");setPanel("");}}/></View>
          :panel==="duration"?<View style={{flex:1,minHeight:0,padding:12}}><GoNoteDurationPicker value={draft.duration} disabled={busy} onApply={duration=>{change({duration});setError("");setPanel("");}} onClear={()=>{change({duration:""});setError("");setPanel("");}}/></View>
          :<ScrollView ref={toolsScroll} key={panel||"tools"} testID="note-tools-scroll" style={panel?{flex:1}:{flexGrow:0,flexShrink:1}} keyboardShouldPersistTaps="handled" keyboardDismissMode="interactive" bounces={false} alwaysBounceVertical={false} overScrollMode="never" contentInsetAdjustmentBehavior="never" automaticallyAdjustContentInsets={false} automaticallyAdjustKeyboardInsets={false} contentContainerStyle={{gap:10,padding:12}}>
          {!panel&&<>
            <View testID="note-primary-controls" style={controlRow}>{options(["date","time","duration","reminder"])}</View>
            <View testID="note-secondary-controls" style={controlRow}>{options(["place","attachments"])}</View>
          </>}
          {(!panel||panel==="destinations")&&<><Text style={s.label}>DESTINO</Text><View testID="note-destinations" style={[s.destinationList,!panel&&controlRow]}>{destinations.map(([value,label])=><TouchableOpacity key={value} testID={"note-destination-"+value}
            accessibilityRole="radio" accessibilityLabel={label} accessibilityState={{checked:draft.destination===value}} disabled={busy} activeOpacity={0.78} onPress={()=>{change({destination:value});setError("");if(panel==="destinations")setPanel("");}}
            style={[s.choice,s.destination,!panel&&menuCell,{calendar:s.calendar,pending:s.pending,archive:s.archive}[value],draft.destination===value&&s.selectedDestination]}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.55)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,s.buttonSheen]}/><Text style={s.destinationText}>{label}</Text></TouchableOpacity>)}</View></>}
          {!panel&&<>
            <TouchableOpacity testID="note-security-info" accessibilityRole="button" accessibilityLabel="NOTA DE SEGURIDAD, no disponible, información" activeOpacity={0.78} onPress={()=>setFloatingNotice("Aún no disponible: falta validar el cifrado y el acceso seguro de las notas.")} style={[s.choice,s.security]}><LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,s.buttonSheen]}/><Feather name="lock" color="#323b44" size={16}/><View style={{flex:1}}><Text style={s.securityText}>NOTA DE SEGURIDAD</Text><Text style={[s.hint,{fontSize:11,textAlign:"center"}]}>No disponible</Text></View></TouchableOpacity>
            {!!(draft.dateISO||draft.time||draft.duration||draft.place)&&<Text testID="note-summary" style={s.hint}>{[validNoteDate(draft.dateISO)?noteDateLabel(draft.dateISO):draft.dateISO?"Fecha no válida":"",draft.time,noteDurationLabel(draft.duration),draft.place].filter(Boolean).join(" · ")}</Text>}
          </>}
          {panel==="place"&&<View style={s.section}>{input("note-place","DIRECCIÓN O LUGAR",draft.place,place=>{change({place,location:undefined});setLocations([]);})}<View style={controlRow}>{choice("Buscar ubicación",()=>void locate(true))}{choice("Ubicación actual",()=>void locate(false))}</View>
            {locations.map((result,index)=><React.Fragment key={index}>{choice(result.label,()=>{const {label,...location}=result;change({location,place:label});setLocations([]);},false,"note-location-result-"+index)}</React.Fragment>)}
            {draft.location&&<Text style={s.hint}>{draft.location.latitude.toFixed(5)}, {draft.location.longitude.toFixed(5)}</Text>}</View>}
          {panel==="reminder"&&<GoNoteReminderPicker value={draft.reminderMinutes} onChange={reminderMinutes=>{change({reminderMinutes});setError("");void openTool("");}} onInputFocus={focusToolInput} dateISO={draft.dateISO} time={draft.time} busy={busy} light/>}
          {panel==="attachments"&&<View style={s.section}><View style={controlRow}>{choice("Fotografías",()=>void attach("image"))}{choice("PDF o documento",()=>void attach("file"))}</View>
            {input("note-link","ENLACE O UBICACIÓN COMPARTIDA",link,setLink,{autoCapitalize:"none",keyboardType:"url",placeholder:"https://…"})}
            {choice("Añadir enlace",()=>{if(!/^https?:\/\//i.test(link.trim())){setError("Escribe un enlace http:// o https:// válido.");return;}change({attachments:[...draft.attachments,{id:noteId(),kind:"link",name:link.trim(),uri:link.trim()}]});setLink("");setFloatingNotice("Enlace incorporado al borrador. Pulsa GUARDAR para conservar la nota.");})}
          </View>}
          {(!panel||panel==="attachments")&&draft.attachments.map(a=><View key={a.id} style={s.attachment}><TouchableOpacity accessibilityRole="button" disabled={busy||attachmentBusy} style={{flex:1,minHeight:44,justifyContent:"center"}} onPress={()=>void (a.kind==="link"?Linking.openURL(a.uri):Share.share({url:a.uri,title:a.name})).catch(()=>setError("No se ha podido abrir el adjunto."))}><Text style={s.text}>{a.name}</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Quitar "+a.name} disabled={busy||attachmentBusy} style={s.icon} onPress={()=>change({attachments:draft.attachments.filter(b=>b.id!==a.id)})}><Feather name="x" size={20} color="#242b34"/></TouchableOpacity></View>)}
          </ScrollView>}
          </View>
        </View>
      {workspaceBounds.width>=44&&workspaceBounds.height>=64&&
      <DraggableFAB screenKey="note-editor" buttonKey="tools-toggle" bounds={{width:workspaceBounds.width,height:workspaceBounds.height}} buttonWidth={44} maxH={48} initialTop={toggleTop} fixedLeft={toggleLeft} onDragStart={markToggleDrag}>
        <TouchableOpacity testID="note-tools-toggle" accessibilityRole="button" accessibilityLabel={toolsOpen?"Ocultar herramientas de la nota":"Mostrar herramientas de la nota"} accessibilityHint="Mantén pulsado medio segundo para mover la flecha verticalmente" accessibilityState={{expanded:toolsOpen}}
          delayLongPress={500} onPressIn={()=>{suppressToggle.current=false;}} onLongPress={markToggleDrag} activeOpacity={0.78} onPress={()=>{if(suppressToggle.current)return;if(!toolsOpen){void openTool(panel);return;}toolRequest.current++;setOpeningTool("");setAwaitingTool(null);if(focusedToolTarget.current)void hideKeyboard();setToolsOpen(false);}} style={s.toolsToggle}>
          <LinearGradient pointerEvents="none" colors={["rgba(255,255,255,0.65)","rgba(255,255,255,0.02)"]} style={[StyleSheet.absoluteFill,{borderRadius:14}]}/><Feather name={handedness==="right"?(toolsOpen?"chevron-right":"chevron-left"):(toolsOpen?"chevron-left":"chevron-right")} size={22} color="#202830"/>
        </TouchableOpacity>
      </DraggableFAB>}
    </View>
    </View>
  </GoScreenModal>;
}
const s=StyleSheet.create({keyboardBack:{position:"absolute",width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:10,backgroundColor:"#eaf0f3"},root:{flex:1,backgroundColor:"#FAFAF7"},header:{justifyContent:"center",alignItems:"center",minHeight:44},heading:{color:"#18212a",fontSize:20,fontWeight:"800",textAlign:"center",width:"100%"},
  workspace:{flex:1,minHeight:0},writing:{flex:1},field:{gap:6,flexShrink:0},label:{color:"#424b55",fontSize:12,fontWeight:"700"},input:{minHeight:48,color:"#17212b",fontSize:16,borderWidth:1.5,borderColor:"#9aa3ad",backgroundColor:"rgba(255,255,255,0.86)",borderRadius:12,padding:12},content:{borderColor:"#b8bfc5",fontSize:17},
  number:{fontSize:28,textAlign:"center",minHeight:64},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8},choice:{minHeight:44,paddingVertical:8,paddingHorizontal:10,borderWidth:1,borderColor:"#adbac3",borderTopColor:"#ffffff",borderBottomColor:"#a0afb9",backgroundColor:"rgba(231,237,242,0.96)",borderRadius:12,justifyContent:"center",width:"100%",shadowColor:"#2b3d45",shadowOpacity:0.13,shadowRadius:5,shadowOffset:{width:0,height:3},elevation:3},buttonSheen:{borderRadius:12},choiceText:{textAlign:"center",fontWeight:"500"},configured:{borderColor:"#16834a",backgroundColor:"rgba(212,243,222,0.90)"},destinationList:{gap:8},destination:{width:"100%"},calendar:{backgroundColor:"rgba(199,236,224,0.90)",borderColor:"#84ab9e"},pending:{backgroundColor:"rgba(255,239,168,0.90)",borderColor:"#b5a15c"},archive:{backgroundColor:"rgba(211,229,255,0.90)",borderColor:"#93adc9"},selectedDestination:{borderColor:"#16834a",borderWidth:1.75},destinationText:{color:"#17212b",fontSize:13,fontWeight:"700",textAlign:"center"},
  text:{color:"#17212b",fontSize:13,flexShrink:1},hint:{color:"#515d69",fontSize:12},warning:{color:"#8a3d0a",fontSize:13,paddingVertical:6},success:{color:"#146339",fontSize:13,paddingVertical:6},section:{gap:10,padding:8,borderWidth:1.5,borderColor:"#aeb8bf",borderRadius:12},
  tools:{position:"absolute",bottom:0,maxHeight:"100%",borderWidth:1,borderColor:"#b2bdc5",borderRadius:20,backgroundColor:"rgba(249,252,251,0.97)",zIndex:5,shadowColor:"#2b3d45",shadowOpacity:0.17,shadowRadius:16,shadowOffset:{width:0,height:6},elevation:5},toolsToggle:{width:44,height:48,alignItems:"center",justifyContent:"center",borderRadius:14,borderWidth:1,borderColor:"#a5b0b8",backgroundColor:"rgba(233,239,243,0.94)",zIndex:6,shadowColor:"#2b3d45",shadowOpacity:0.14,shadowRadius:6,shadowOffset:{width:0,height:3},elevation:3},
  icon:{width:44,height:44,alignItems:"center",justifyContent:"center"},attachment:{flexDirection:"row",alignItems:"center",gap:8,borderWidth:1.5,borderColor:"#aeb8bf",paddingHorizontal:10,borderRadius:10},
  security:{flexDirection:"row",alignItems:"center",gap:6},securityText:{color:"#323b44",fontSize:11,fontWeight:"600",textAlign:"center",flexShrink:1},floating:{position:"absolute",left:12,right:12,padding:14,borderRadius:14,borderWidth:1.5,borderColor:"#89949d",backgroundColor:"#eef2f4",zIndex:20},
  go:{marginHorizontal:0,alignItems:"center",justifyContent:"center",gap:2,backgroundColor:"rgba(211,241,224,0.94)",borderColor:"#86a895",borderWidth:1,shadowColor:"#2b3d45",shadowOpacity:0.16,shadowRadius:7,shadowOffset:{width:0,height:4},elevation:4},goText:{color:"#142D2A",fontSize:13,fontWeight:"800"},
  footer:{flexDirection:"row",alignItems:"center",gap:10,paddingTop:8},save:{flex:1,minHeight:52,borderRadius:18,borderWidth:1,borderColor:"#86a895",backgroundColor:"rgba(193,235,211,0.94)",alignItems:"center",justifyContent:"center",shadowColor:"#2b3d45",shadowOpacity:0.14,shadowRadius:6,shadowOffset:{width:0,height:3},elevation:3},saveText:{color:"#17212b",fontSize:15,fontWeight:"800"}});
