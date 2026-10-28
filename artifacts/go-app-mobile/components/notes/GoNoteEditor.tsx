import React, { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Linking, Platform, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { KeyboardAvoidingView, KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GoScreenCloseGuide, GoScreenCloseSurface } from "@/components/ui/GoScreenCloseSurface";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNoteReminderPicker } from "./GoNoteReminderPicker";
import { GoNoteDatePicker } from "./GoNoteDatePicker";
import { useGoNoteVoice } from "@/hooks/useGoNoteVoice";
import { s as assistantStyles } from "@/components/booking-assistant/BookingAssistantUI";
import { prepareGoNote } from "@/lib/goNotePreparation";
import { appendNoteDictation } from "@/lib/goNoteTools";
import { importNoteFile } from "@/lib/goNoteFiles";
import { noteDraft, noteId, validNoteDate, validNoteTime, type NoteDestination, type UnifiedNoteDraft } from "@/lib/unifiedNotes";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "@/lib/goTaskReminders";

type Props = { visible:boolean; initial?:GoEntry|null; seed?:{title?:string;content?:string;destination?:NoteDestination;dateISO?:string;time?:string};
  scope:TaskScope|null; ready:boolean; handedness:"left"|"right"; cached?:UnifiedNoteDraft; onClose:(state?:{draft:UnifiedNoteDraft;saved:boolean})=>void;
  onSave:(draft:UnifiedNoteDraft)=>Promise<{entry:GoEntry;message:string}> };
const destinations: [NoteDestination,string][]=[["calendar","CALENDARIO"],["pending","PENDIENTES"],["archive","ARCHIVO"]];

/** One ordinary-note editor, one native presenter, and one acknowledged save operation. */
export function GoNoteEditor({visible,initial,seed,scope,ready,handedness,onClose,onSave,cached}:Props) {
  const insets=useSafeAreaInsets(),scroll=useRef<React.ElementRef<typeof KeyboardAwareScrollView>>(null);
  const [draft,setDraft]=useState<UnifiedNoteDraft>(()=>cached||noteDraft(initial)),[panel,setPanel]=useState(""),[error,setError]=useState(""),[message,setMessage]=useState("");
  const [busy,setBusy]=useState(false),[attachmentBusy,setAttachmentBusy]=useState(false),[link,setLink]=useState(""),[contentHeight,setContentHeight]=useState(120);
  const [locations,setLocations]=useState<{latitude:number;longitude:number;label:string}[]>([]);
  const [preparing,setPreparing]=useState(false),[preparedNotice,setPreparedNotice]=useState(""),[floatingNotice,setFloatingNotice]=useState("");
  const preparation=useRef(0),draftRef=useRef(draft);draftRef.current=draft;
  const saveLock=useRef(false),workLock=useRef(false),session=useRef(""),latest=useRef({scope,ready,visible,id:draft.id});latest.current={scope,ready,visible,id:draft.id};
  const saved=useRef(false),wasVisible=useRef(false),operation=useRef({value:"",id:noteId()});
  const lastScope=useRef(scope);
  const measureContent=useCallback((event:{nativeEvent:{contentSize:{height:number}}})=>{
    const next=Math.min(240,Math.max(120,Math.ceil(event.nativeEvent.contentSize.height)));
    // Native content size already includes padding. Ignore border rounding so
    // applying the measured height cannot feed another resize back into itself.
    setContentHeight(current=>Math.abs(next-current)<=2?current:next);
  },[]);
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
        setDraft(next);setPanel("");setLocations([]);setError("");setMessage("");setPreparedNotice("");saved.current=false;}
      session.current=key;voice.focus("detail");
    }
    wasVisible.current=visible;
  },[visible,initial?.id]);
  useEffect(()=>{const previous=lastScope.current;lastScope.current=scope;
    if(previous && (previous.userId!==scope?.userId || previous.context!==scope?.context)){
      preparation.current++;setPreparing(false);setFloatingNotice("");voice.abort();setDraft(noteDraft());setPanel("");setLocations([]);setError("");setMessage("");session.current="";if(visible)onClose();
    }
    return()=>voice.abort();
  },[scope?.userId,scope?.context]);
  const change=(patch:Partial<UnifiedNoteDraft>)=>{setDraft(d=>({...d,...patch}));setMessage("");saved.current=false;};
  const close=()=>{if(saveLock.current||workLock.current)return;preparation.current++;setPreparing(false);voice.abort();Keyboard.dismiss();onClose({draft,saved:saved.current});};
  const work=async(fn:()=>Promise<void>)=>{if(workLock.current||saveLock.current)return;workLock.current=true;setAttachmentBusy(true);setError("");try{await fn();}catch(e){if(latest.current.visible)setError(e instanceof Error?e.message:"No se ha podido completar la selección.");}finally{workLock.current=false;setAttachmentBusy(false);}};
  const attach=async(kind:"file"|"image")=>work(async()=>{
    const expected=latest.current.scope,expectedId=draft.id;if(!expected || !latest.current.ready)throw new Error("Espera a que se verifique tu cuenta para adjuntar archivos.");
    const assets=kind==="file"?await DocumentPicker.getDocumentAsync({copyToCacheDirectory:true,multiple:true})
      :await ImagePicker.launchImageLibraryAsync({mediaTypes:["images"],quality:0.9,allowsMultipleSelection:true});
    if(assets.canceled)return;
    const added=[];
    for(const asset of assets.assets){if(!latest.current.visible || latest.current.id!==expectedId || latest.current.scope?.userId!==expected.userId || latest.current.scope?.context!==expected.context)return;
      added.push(await importNoteFile(expected,draft.id,{uri:asset.uri,name:"name" in asset?asset.name:asset.fileName||"Fotografía.jpg",mimeType:asset.mimeType,size:"size" in asset?asset.size:"fileSize" in asset?asset.fileSize:undefined}));}
    if(latest.current.visible && latest.current.id===expectedId && latest.current.scope?.userId===expected.userId && latest.current.scope?.context===expected.context)change({attachments:[...draft.attachments,...added]});
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
    if(!draft.destination){setError("Selecciona CALENDARIO, PENDIENTES o ARCHIVO antes de guardar.");scroll.current?.scrollToEnd({animated:true});return;}
    if(!latest.current.ready || !latest.current.scope){setError("No se ha podido verificar tu cuenta y contexto. La nota permanece aquí; puedes volver a intentarlo cuando se recupere la sesión.");return;}
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
    <Text style={s.label}>{label}</Text><TextInput testID={id} accessibilityLabel={label} value={value} onChangeText={onChangeText} editable={!busy}
      placeholderTextColor="#a1a1aa" style={s.input} {...extra}/></View>;
  const choice=(label:string,action:()=>void,selected=false,id?:string)=><TouchableOpacity testID={id} accessibilityRole="button" accessibilityLabel={label} accessibilityState={{selected,disabled:busy||attachmentBusy}}
    disabled={busy||attachmentBusy} onPress={action} style={[s.choice,selected&&s.configured]}><Text style={s.text}>{label}</Text></TouchableOpacity>;
  const controlRow=[s.row,{flexDirection:handedness==="left"?"row" as const:"row-reverse" as const}];
  const options=(keys:string[])=>keys.map(key=>{
    const item:{[key:string]:[string,boolean]}={date:["FECHA",validNoteDate(draft.dateISO)],time:["HORA",validNoteTime(draft.time)],duration:["DURACIÓN",!!draft.duration],place:["UBICACIÓN",!!draft.place.trim()],reminder:["RECORDATORIO",draft.reminderMinutes!==null],attachments:["ADJUNTAR",!!draft.attachments.length]};
    return <React.Fragment key={key}>{choice(item[key][0],()=>setPanel(panel===key?"":key),item[key][1],"note-option-"+key)}</React.Fragment>;
  });
  if(!visible)return null;
  return <GoScreenModal visible animationType="slide" onRequestClose={close}>
    <GoScreenCloseSurface testID="unified-note-screen" handedness={handedness} onClose={close} enabled={!busy&&!attachmentBusy} scrollRefs={[scroll]} style={s.root}>
      <KeyboardAvoidingView testID="KeyboardFrame" behavior="height" style={{flex:1,paddingTop:insets.top+8,paddingHorizontal:Math.max(12,insets.left,insets.right)}}>
        <View style={s.header}><Text accessibilityRole="header" style={s.heading}>NOTA</Text>
          <TouchableOpacity testID="note-security-info" accessibilityRole="button" accessibilityLabel="NOTA DE SEGURIDAD, información" onPress={()=>setFloatingNotice("Aún no disponible: falta validar el cifrado y el acceso seguro de las notas.")} style={s.security}>
            <Feather name="lock" color="#c4c8d0" size={14}/><Text style={s.securityText}>NOTA DE SEGURIDAD</Text></TouchableOpacity></View>
        <KeyboardAwareScrollView ref={scroll} testID="unified-note-scroll" style={{flex:1}} keyboardShouldPersistTaps="handled" bottomOffset={90} contentContainerStyle={{flexGrow:1,paddingBottom:16,gap:12}}>
          {input("note-title","TÍTULO (OPCIONAL)",draft.title,title=>change({title}),{onFocus:()=>voice.focus("title"),maxLength:200})}
          {input("note-content","CONTENIDO",draft.content,content=>change({content}),{onFocus:()=>voice.focus("detail"),multiline:true,textAlignVertical:"top",scrollEnabled:contentHeight>=240,
            onContentSizeChange:measureContent,style:[s.input,{height:contentHeight,minHeight:120}]})}
          {voice.status!=="idle"&&<Text style={s.hint}>{voice.status==="listening"?"Escuchando…":voice.status==="transcribing"?"Transcribiendo…":"Comprobando dictado…"}</Text>}
          {preparing&&<Text accessibilityLiveRegion="polite" style={s.hint}>Preparando borrador…</Text>}
          {!!preparedNotice&&<Text accessibilityLiveRegion="polite" style={s.hint}>{preparedNotice}</Text>}
          <View testID="note-secondary-controls" style={controlRow}>{options(["attachments","place","duration"])}</View>
          {!!(draft.dateISO||draft.time||draft.duration||draft.place)&&<Text style={s.hint}>{[draft.dateISO,draft.time,draft.duration,draft.place].filter(Boolean).join(" · ")}</Text>}
          {panel==="date"&&<View style={s.section}><GoNoteDatePicker value={draft.dateISO} onChange={dateISO=>change({dateISO})} disabled={busy}/>{input("note-date","FECHA · AAAA-MM-DD",draft.dateISO,dateISO=>change({dateISO}),{keyboardType:"numbers-and-punctuation",placeholder:"2026-12-30",maxLength:10})}{choice("Sin fecha",()=>change({dateISO:""}))}</View>}
          {panel==="time"&&<View style={s.section}><View style={s.row}>
            {input("note-exact-hour","HORAS · 00–23",draft.time.split(":")[0]||"",hour=>change({time:hour+":"+(draft.time.split(":")[1]||"00")}),{keyboardType:"number-pad",maxLength:2,selectTextOnFocus:true,style:[s.input,s.number]})}
            {input("note-exact-minute","MINUTOS · 00–59",draft.time.split(":")[1]||"",minute=>change({time:(draft.time.split(":")[0]||"00")+":"+minute}),{keyboardType:"number-pad",maxLength:2,selectTextOnFocus:true,style:[s.input,s.number]})}
          </View>{choice("Sin hora",()=>change({time:""}))}</View>}
          {panel==="duration"&&<View style={s.section}><View style={controlRow}>{[["15m","15 minutos"],["30m","30 minutos"],["1h","1 hora"],["2h","2 horas"]].map(([value,label])=><React.Fragment key={value}>{choice(label,()=>change({duration:value}),draft.duration===value)}</React.Fragment>)}</View>{choice("Sin duración",()=>change({duration:""}))}</View>}
          {panel==="place"&&<View style={s.section}>{input("note-place","DIRECCIÓN O LUGAR",draft.place,place=>{change({place,location:undefined});setLocations([]);})}<View style={controlRow}>{choice("Buscar ubicación",()=>void locate(true))}{choice("Ubicación actual",()=>void locate(false))}</View>
            {locations.map((result,index)=><React.Fragment key={index}>{choice(result.label,()=>{const {label,...location}=result;change({location,place:label});setLocations([]);},false,"note-location-result-"+index)}</React.Fragment>)}
            {draft.location&&<Text style={s.hint}>{draft.location.latitude.toFixed(5)}, {draft.location.longitude.toFixed(5)}</Text>}</View>}
          {panel==="reminder"&&<GoNoteReminderPicker value={draft.reminderMinutes} onChange={reminderMinutes=>{change({reminderMinutes});setPanel("");}} dateISO={draft.dateISO} time={draft.time} busy={busy}/>}
          {panel==="attachments"&&<View style={s.section}><View style={controlRow}>{choice("Fotografías",()=>void attach("image"))}{choice("PDF o documento",()=>void attach("file"))}</View>
            {input("note-link","ENLACE O UBICACIÓN COMPARTIDA",link,setLink,{autoCapitalize:"none",keyboardType:"url",placeholder:"https://…"})}
            {choice("Añadir enlace",()=>{if(!/^https?:\/\//i.test(link.trim())){setError("Escribe un enlace http:// o https:// válido.");return;}change({attachments:[...draft.attachments,{id:noteId(),kind:"link",name:link.trim(),uri:link.trim()}]});setLink("");})}
          </View>}
          {draft.attachments.map(a=><View key={a.id} style={s.attachment}><TouchableOpacity accessibilityRole="button" disabled={busy} style={{flex:1,minHeight:44,justifyContent:"center"}} onPress={()=>void (a.kind==="link"?Linking.openURL(a.uri):Share.share({url:a.uri,title:a.name})).catch(()=>setError("No se ha podido abrir el adjunto."))}><Text style={s.text}>{a.name}</Text></TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={"Quitar "+a.name} disabled={busy} style={s.icon} onPress={()=>change({attachments:draft.attachments.filter(b=>b.id!==a.id)})}><Feather name="x" size={20} color="#ffffff"/></TouchableOpacity></View>)}
          <View style={s.primaryGroup}>
          <View testID="note-primary-controls" style={controlRow}>{options(["date","time","reminder"])}</View>
          <Text style={s.label}>DESTINO</Text><View testID="note-destinations" style={controlRow}>{destinations.map(([value,label])=><TouchableOpacity key={value} testID={"note-destination-"+value}
            accessibilityRole="radio" accessibilityState={{checked:draft.destination===value}} disabled={busy} onPress={()=>change({destination:value})} style={[s.choice,s.destination,draft.destination===value&&s.configured]}><Text style={s.text}>{label}</Text></TouchableOpacity>)}</View>
          {!!error&&<Text testID="note-save-error" accessibilityRole="alert" style={s.warning}>{error}</Text>}
          {!!message&&<Text testID="note-save-confirmation" accessibilityLiveRegion="polite" style={s.success}>{message}</Text>}
          </View>
        </KeyboardAwareScrollView>
        <GoScreenCloseGuide/>
        {!!floatingNotice&&<View testID="note-floating-notice" pointerEvents="none" accessibilityRole="alert" accessibilityLiveRegion="polite" style={[s.floating,{top:insets.top+64}]}><Text style={s.text}>{floatingNotice}</Text></View>}
        <View testID="note-editor-footer" style={[s.footer,{paddingBottom:Math.max(insets.bottom,12),flexDirection:handedness==="left"?"row-reverse":"row"}]}>
          <GoCloseButton level="panel" touchSize={56} hitSlop={0} onPress={close} accessibilityLabel="Cerrar nota" disabled={busy}/>
          <TouchableOpacity testID="unified-note-save" accessibilityRole="button" disabled={busy||attachmentBusy||preparing||voice.status!=="idle"} onPress={()=>void save()} style={s.save}><Text style={s.saveText}>{busy?"GUARDANDO…":"GUARDAR"}</Text></TouchableOpacity>
          <TouchableOpacity testID="note-microphone" accessibilityRole="button" accessibilityLabel={voice.status==="listening"?"Detener escucha de GO":"Hablar con GO para preparar la nota"} accessibilityState={{selected:voice.status==="listening",disabled:busy||attachmentBusy||preparing||voice.status==="preparing"||voice.status==="transcribing"}}
            disabled={busy||attachmentBusy||preparing||voice.status==="preparing"||voice.status==="transcribing"} onPress={()=>{if(draftRef.current.security){setFloatingNotice("Las notas de seguridad no están activadas y no se envían a la IA.");return;}if(!latest.current.ready){setFloatingNotice("Espera a que se verifique tu cuenta para hablar con GO.");return;}void voice.toggle();}} style={[assistantStyles.goButton,s.go,voice.status==="listening"&&assistantStyles.listening]}>
            <Feather name={voice.status==="listening"?"square":"mic"} size={22} color={voice.status==="listening"?"#ffffff":"#142D2A"}/><Text style={[s.goText,voice.status==="listening"&&{color:"#ffffff"}]}>{voice.status==="listening"?"Parar":"GO"}</Text></TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </GoScreenCloseSurface>
  </GoScreenModal>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:"#0e0e10"},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",minHeight:52},heading:{color:"#ffffff",fontSize:20,fontWeight:"800"},
  field:{gap:6,flexShrink:0},label:{color:"#d4d4d8",fontSize:12,fontWeight:"700"},input:{minHeight:48,color:"#ffffff",fontSize:16,borderWidth:1,borderColor:"rgba(255,255,255,0.35)",backgroundColor:"#1a1a1c",borderRadius:12,padding:12},
  number:{fontSize:28,textAlign:"center",minHeight:64},row:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:8},choice:{minHeight:48,paddingVertical:10,paddingHorizontal:12,borderWidth:2,borderColor:"#59616d",backgroundColor:"#23262b",borderRadius:14,justifyContent:"center"},configured:{borderColor:"#22c55e",backgroundColor:"#173c2a"},destination:{flexGrow:1,flexBasis:"30%",minWidth:88},
  text:{color:"#ffffff",fontSize:13,flexShrink:1},hint:{color:"#a1a1aa",fontSize:12},warning:{color:"#fbbf24",fontSize:13},success:{color:"#6ee7b7",fontSize:13},section:{gap:10,padding:12,borderWidth:1,borderColor:"rgba(255,255,255,0.15)",borderRadius:12},
  icon:{width:44,height:44,alignItems:"center",justifyContent:"center"},attachment:{flexDirection:"row",alignItems:"center",gap:8,borderWidth:1,borderColor:"rgba(255,255,255,0.2)",paddingHorizontal:10,borderRadius:10},
  security:{minHeight:44,flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:8,borderRadius:12,flexShrink:1},securityText:{color:"#c4c8d0",fontSize:10,fontWeight:"600",flexShrink:1},floating:{position:"absolute",left:12,right:12,padding:14,borderRadius:14,borderWidth:1,borderColor:"#59616d",backgroundColor:"#292d34",zIndex:20},
  primaryGroup:{marginTop:"auto",gap:12},go:{marginHorizontal:0,alignItems:"center",justifyContent:"center",gap:2},goText:{color:"#142D2A",fontSize:13,fontWeight:"800"},
  footer:{flexDirection:"row",alignItems:"center",gap:10,paddingTop:8},save:{flex:1,minHeight:52,borderRadius:16,backgroundColor:"#6ee7b7",alignItems:"center",justifyContent:"center"},saveText:{color:"#0e0e10",fontSize:15,fontWeight:"800"}});
