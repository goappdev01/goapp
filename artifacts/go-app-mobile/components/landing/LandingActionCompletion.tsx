import React,{useEffect,useState} from "react";
import {useSafeAreaInsets} from "react-native-safe-area-context";
import {KeyboardAvoidingView,Modal,PixelRatio,Platform,ScrollView,Switch,Text,TextInput,TouchableOpacity,View} from "react-native";
import type {useActionCompletion} from "@/hooks/useActionCompletion";
import type {CompletionEntry} from "@/lib/goActionCompletion";
import {GoCloseButton} from "@/components/ui/GoCloseButton";
import {completionKey} from "@/lib/goActionCompletion";
type Model=ReturnType<typeof useActionCompletion>;
export type CompletionFrame={x:number;y:number;width:number;height:number};
/** Horizontal free header lane; vertical placement belongs to the actual panel, not a cached height. */
export function completionPanelFrame(input:{panelX:number;panelWidth:number;width:number;left:number;right:number;edgeWidth:number;controls:readonly CompletionFrame[]}):CompletionFrame{
 const left=input.left+input.edgeWidth,right=input.width-input.right-input.edgeWidth;
 let lanes=[{left,right}];
 for(const control of input.controls){
  const start=control.x-8,end=control.x+control.width+8;
  lanes=lanes.flatMap(lane=>end<=lane.left || start>=lane.right?[lane]:[
   {left:lane.left,right:Math.min(lane.right,start)},{left:Math.max(lane.left,end),right:lane.right},
  ].filter(part=>part.right-part.left>=44));
 }
 const overlap=(lane:{left:number;right:number})=>Math.max(0,Math.min(lane.right,input.panelX+input.panelWidth)-Math.max(lane.left,input.panelX));
 const lane=lanes.sort((a,b)=>overlap(b)-overlap(a)||(b.right-b.left)-(a.right-a.left))[0] ?? {left,right};
 const width=Math.min(input.panelWidth,Math.max(44,lane.right-lane.left));
 const x=Math.max(lane.left,Math.min(input.panelX+(input.panelWidth-width)/2,lane.right-width));
 return {x:x-input.panelX,y:0,width,height:44};
}
export function completionFrame(input:{width:number;safeTop:number;commandsTop:number;openHeight:number;open:boolean;left:number;right:number;header?:CompletionFrame}):CompletionFrame{
 const x=Math.max(18,input.left+18),width=Math.max(44,input.width-x-Math.max(18,input.right+18));
 const floor=Math.max(input.safeTop,input.commandsTop-8-(input.open?input.openHeight:0));
 const available=Math.max(0,floor-input.safeTop),height=Math.min(available,280);
 // An exceptionally tall open card may consume the information area. Reuse only
 // an independently measured free header lane; never overlap or resize that card.
 if(height<44 && input.header)return {...input.header,height:44};
 return {x,y:input.open?input.safeTop:floor-height,width,height};
}
/** Only the decision area adapts to large text; the surrounding Landing geometry stays fixed. */
export function completionDecisionLayout(width:number,fontScale=1){
 const scale=Math.max(1,fontScale),columns=Math.max(1,Math.min(3,Math.floor((width+8)/(78*scale+8))));
 return {columns,side:Math.max(44,Math.min(104*scale,(width-8*(columns-1))/columns))};
}
/** This is a separate absolute information layer. It never participates in orbital/card layout. */
export function LandingActionCompletion({model,frame,onPropose,onPendingList,lang="es",availableWidth,anchorAbove=false}:{
 model:Model;frame:CompletionFrame;onPropose:(e:CompletionEntry)=>void;onPendingList:()=>void;lang?:string;availableWidth?:number;anchorAbove?:boolean;
}){
 const insets=useSafeAreaInsets();
 const [tab,setTab]=useState<"unresolved"|"pending">("unresolved"),[settings,setSettings]=useState(false),[expanded,setExpanded]=useState(false);
 const [hours,setHours]=useState("24"),[actionHours,setActionHours]=useState("24"),[duration,setDuration]=useState("60");
 const en=lang==="en",label=(es:string,english:string)=>en?english:es;
 const rows=tab==="pending"?model.pending:model.unresolved;
 const index=Math.max(0,rows.findIndex(e=>e.id===model.selected)),entry=rows[index];
 useEffect(()=>{if(!model.unresolved.length && model.pending.length)setTab("pending");},[model.unresolved.length,model.pending.length]);
 useEffect(()=>{if(model.selected && model.pending.some(e=>e.id===model.selected))setTab("pending");},[model.selected]);
 useEffect(()=>{if(model.doc){setDuration(String(model.doc.preferences.defaultDurationMinutes));setHours(String(model.doc.preferences.reminderMinutes/60));}},[model.doc?.preferences]);
 useEffect(()=>{if(entry && model.doc)setActionHours(String((model.doc.records[completionKey(entry)]?.reminderMinutes ?? model.doc.preferences.reminderMinutes)/60));},[entry?.id,model.doc]);
 const document=model.doc;
 const position=anchorAbove?{bottom:"100%" as const,marginBottom:8}:{top:frame.y};
 if(model.scope && model.error && !document)return <View pointerEvents="box-none" style={{position:"absolute",left:frame.x,...position,width:frame.width,zIndex:90}}>
  <Text accessibilityLiveRegion="polite" style={{color:"#facc15",fontSize:12}}>{label("No se pudieron leer las confirmaciones. No se ha modificado ningún dato.","Confirmations could not be read. No data has been changed.")}</Text>
 </View>;
 if(!document || !model.scope || !model.unresolved.length && !model.pending.length && !model.savingCount && !model.failedDecisions?.length)return null;
 const compact=anchorAbove || frame.height<180;
 const {side}=completionDecisionLayout(expanded?(availableWidth ?? frame.width)-60:frame.width-16,PixelRatio?.getFontScale?.() ?? 1);
 const button={minHeight:44,paddingHorizontal:8,justifyContent:"center" as const};
 const text={color:"#ffffff",fontSize:12,fontWeight:"700" as const};
 const controls=()=> <View testID="action-completion-controls" style={{gap:8}}>
  <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:4}}>
   <TouchableOpacity style={button} onPress={()=>setTab("unresolved")}><Text style={{...text,color:tab==="unresolved"?"#ffffff":"#aeb7c6"}}>{label("Por confirmar","To confirm")} · {model.unresolved.length}</Text></TouchableOpacity>
   <TouchableOpacity style={button} onPress={()=>setTab("pending")}><Text style={{...text,color:tab==="pending"?"#facc15":"#aeb7c6"}}>{label("Pendientes","Pending")} · {model.pending.length}</Text></TouchableOpacity>
  </View>
  {entry?<><Text testID="completion-action-identity" style={{...text,fontSize:13}}>{entry.notes || entry.intentLabel || label("Acción","Action")}{entry.contactName?" · "+entry.contactName:""}</Text>
   <Text style={{color:"#cbd5e1",fontSize:12}}>{entry.dateISO} · {entry.time}{entry.professionalName?" · "+entry.professionalName:""}</Text>
   <View style={{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-between",gap:8}}>
    {([{status:"done",color:"#22c55e",es:"REALIZADO",en:"DONE"}, {status:"pending",color:"#facc15",es:"PENDIENTE",en:"PENDING"}, {status:"change",color:"#fb923c",es:"PROPONER\nCAMBIO",en:"PROPOSE\nCHANGE"}] as const).map(action=><TouchableOpacity key={action.status}
      accessibilityRole="button" accessibilityLabel={(en?action.en:action.es).replace("\n"," ")} disabled={model.isSaving?.(entry) ?? false}
      onPress={()=>{if(action.status==="change"){setExpanded(false);onPropose(entry);}else void model.decide(entry,action.status);}}
      style={{width:side,height:side,minWidth:44,minHeight:44,borderRadius:16,borderWidth:1,borderColor:action.color,
       backgroundColor:action.color+"28",alignItems:"center",justifyContent:"center",padding:4,opacity:model.isSaving?.(entry)?0.45:1}}>
      <Text numberOfLines={action.status==="change"?2:1} adjustsFontSizeToFit minimumFontScale={0.85} style={{width:"100%",color:action.color,fontSize:12,fontWeight:"900",textAlign:"center"}}>{en?action.en:action.es}</Text>
     </TouchableOpacity>)}
   </View>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}>
    <TouchableOpacity style={button} accessibilityLabel={label("Acción anterior","Previous action")} disabled={rows.length<2} onPress={()=>model.setSelected(rows[(index+rows.length-1)%rows.length].id)}><Text style={text}>‹</Text></TouchableOpacity>
    <Text style={{color:"#cbd5e1",fontSize:11}}>{index+1} / {rows.length}</Text>
    <TouchableOpacity style={button} accessibilityLabel={label("Acción siguiente","Next action")} disabled={rows.length<2} onPress={()=>model.setSelected(rows[(index+1)%rows.length].id)}><Text style={text}>›</Text></TouchableOpacity>
   </View>
  </>:<Text style={text}>{label("No hay acciones en este grupo.","No actions in this group.")}</Text>}
  <View style={{flexDirection:"row",justifyContent:"space-between"}}>
   <TouchableOpacity style={button} onPress={()=>{setSettings(!settings);if(compact)setExpanded(true);}}><Text style={text}>{label("Recordatorios y duración","Reminders and duration")}</Text></TouchableOpacity>
   <TouchableOpacity style={button} onPress={()=>{setExpanded(false);onPendingList();}}><Text style={text}>{label("Ver listado","Open list")}</Text></TouchableOpacity>
  </View>
  {settings&&<View style={{gap:8}}>
   <Text style={text}>{label("Siguiente aviso para esta acción","Next reminder for this action")}</Text>
   <View style={{flexDirection:"row",flexWrap:"wrap",gap:6}}>{[1,2,17,24].map(h=><TouchableOpacity key={h} style={{...button,borderWidth:1,borderColor:"#64748b",borderRadius:8}} onPress={()=>{if(entry)void model.configure({},entry,h*60);}}><Text style={text}>{h}h</Text></TouchableOpacity>)}</View>
   {!!entry&&<>
    <Text style={text}>{label("Siguiente aviso de esta acción (horas; admite decimales)","Next reminder for this action (hours; decimals allowed)")}</Text>
    <TextInput value={actionHours} onChangeText={setActionHours} keyboardType="decimal-pad" accessibilityLabel={label("Siguiente aviso en horas","Next reminder in hours")} style={{color:"#ffffff",borderWidth:1,borderColor:"#64748b",borderRadius:8,minHeight:44,padding:8}}/>
   </>}
   <Text style={text}>{label("Intervalo por defecto (horas; admite decimales)","Default interval (hours; decimals allowed)")}</Text>
   <TextInput value={hours} onChangeText={setHours} keyboardType="decimal-pad" accessibilityLabel={label("Intervalo de recordatorio en horas","Reminder interval in hours")} style={{color:"#ffffff",borderWidth:1,borderColor:"#64748b",borderRadius:8,minHeight:44,padding:8}}/>
   <Text style={text}>{label("Duración predeterminada sin duración (minutos)","Default unscheduled duration (minutes)")}</Text>
   <TextInput value={duration} onChangeText={setDuration} keyboardType="decimal-pad" accessibilityLabel={label("Duración predeterminada en minutos","Default duration in minutes")} style={{color:"#ffffff",borderWidth:1,borderColor:"#64748b",borderRadius:8,minHeight:44,padding:8}}/>
   <View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Text style={text}>{label("Avisar de acciones PENDIENTES","Remind me about PENDING actions")}</Text><Switch value={document.preferences.pendingAlerts} onValueChange={pendingAlerts=>void model.configure({pendingAlerts})}/></View>
   {entry&&<View style={{flexDirection:"row",alignItems:"center",justifyContent:"space-between"}}><Text style={text}>{label("Avisos de esta acción","Reminders for this action")}</Text><Switch value={document.records[completionKey(entry)]?.alerts!==false} onValueChange={alerts=>void model.configure({},entry,undefined,alerts)}/></View>}
   <TouchableOpacity disabled={model.busy} style={{...button,borderWidth:1,borderColor:"#ffffff",borderRadius:8}} onPress={()=>void model.configure({defaultDurationMinutes:Number(duration.replace(",",".")),reminderMinutes:Number(hours.replace(",","."))*60},entry,Number(actionHours.replace(",","."))*60)}><Text style={text}>{label("GUARDAR","SAVE")}</Text></TouchableOpacity>
   {!!entry && !!document.records[completionKey(entry)]?.history.length && <View style={{gap:4}}>
    <Text style={text}>{label("Historial personal","Your response history")}</Text>
    {document.records[completionKey(entry)].history.map((d,i)=><Text key={i} style={{color:"#cbd5e1",fontSize:11}}>
     {new Date(d.at).toLocaleString(en?"en-GB":"es-ES")} · {d.status==="done"?label("REALIZADO","DONE"):label("PENDIENTE","PENDING")}
    </Text>)}
   </View>}
   <Text style={{color:"#aeb7c6",fontSize:11}}>{label("Los avisos del teléfono requieren permiso. Su cola es limitada y se actualiza al volver a GO. La solicitud se conserva aquí aunque el sistema no pueda avisar.","Phone reminders require permission. The limited OS queue is replenished when GO opens. Requests remain here even when the OS cannot deliver.")}</Text>
  </View>}
  {!!model.savingCount&&<Text testID="completion-saving" accessibilityLiveRegion="polite" style={{color:"#cbd5e1",fontSize:12}}>{label("Guardando decisiones: ","Saving decisions: ")}{model.savingCount}</Text>}
  {!!model.failedDecisions?.length&&<View testID="completion-write-errors" style={{gap:6}}>
   {model.failedDecisions.map(failure=><View key={failure.id} style={{gap:4}}>
    <Text accessibilityLiveRegion="polite" style={{color:"#facc15",fontSize:12}}>{label("No se guardó: ","Not saved: ")}{failure.entry.notes || failure.entry.intentLabel || failure.entry.id}{" · "}{failure.entry.dateISO}{" · "}{failure.entry.time}{" · "}{failure.status==="done"?label("REALIZADO","DONE"):label("PENDIENTE","PENDING")}{". "}{failure.message}</Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={label("Reintentar guardado de ","Retry saving ")+(failure.entry.notes || failure.entry.intentLabel || failure.entry.id)} style={button} onPress={()=>void model.retryDecision(failure.id)}><Text style={text}>{label("Reintentar guardado","Retry save")}</Text></TouchableOpacity>
   </View>)}
  </View>}
  {!!(model.error || model.feedback)&&<Text accessibilityLiveRegion="polite" style={{color:"#facc15",fontSize:12}}>{model.error || model.feedback}</Text>}
 </View>;
 return <>
  <View testID="landing-action-completion" pointerEvents="box-none" style={{position:"absolute",left:frame.x,...position,width:frame.width,...(anchorAbove?{minHeight:44}:{height:Math.max(0,frame.height)}),zIndex:90}}>
   {compact?<TouchableOpacity accessibilityRole="button" style={{...button,minHeight:44,backgroundColor:"#141b29",borderColor:"#fb923c",borderWidth:1,borderRadius:12}}
     onPress={()=>setExpanded(true)}><Text style={text}>{label("Confirma tus acciones","Confirm your actions")} · {model.unresolved.length+model.pending.length}</Text></TouchableOpacity>
    :<ScrollView bounces={false} nestedScrollEnabled style={{maxHeight:frame.height,backgroundColor:"rgba(9,14,24,0.94)",borderRadius:14}} contentContainerStyle={{padding:8}}>{controls()}</ScrollView>}
  </View>
  <Modal transparent visible={expanded} animationType="fade" onRequestClose={()=>setExpanded(false)}>
   <KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={{flex:1,backgroundColor:"rgba(0,0,0,0.6)",justifyContent:"center",paddingHorizontal:Math.max(18,insets.left,insets.right),paddingTop:insets.top+8,paddingBottom:insets.bottom+8}}>
    <View style={{backgroundColor:"#0e1624",borderRadius:18,padding:12,maxHeight:"100%",gap:8}}>
     <GoCloseButton level="panel" accessibilityLabel={label("Cerrar confirmación","Close confirmation")} onPress={()=>setExpanded(false)}/>
     <ScrollView style={{flexGrow:0,flexShrink:1,minHeight:0}} keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={{paddingBottom:12}}>{controls()}</ScrollView>
    </View>
   </KeyboardAvoidingView>
  </Modal>
 </>;
}
