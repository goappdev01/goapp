import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { assertTaskUser } from "./goTaskAccess";
import { getGoLogSnapshot, updateGoLog } from "./goLogStore";
import { refreshNativeTaskReminders } from "./goTaskReminderRuntime";
import { describeReminders } from "./goTaskReminders";
import { assertNoteAttachments, verifyNoteFiles } from "./goNoteFiles";
import { buildNoteEntry, noteDocument, noteDraft, noteInScope, validateNote, type NoteDestination, type UnifiedNoteDraft } from "./unifiedNotes";
import { notePerformanceNow, startNoteSaveTrace, setNoteReminderProgress, noteReminderOperationCurrent, type NoteReminderReceipt } from "./goNoteSaveProgress";

/** Ordinary notes use GO's existing committed store; saving is independent of IA and HTTP availability. */
export async function saveUnifiedNote(draft: UnifiedNoteDraft, scope: TaskScope, active: () => boolean) {
  const now=notePerformanceNow,started=now();
  const previousDraft=draft.original?noteDraft(draft.original):null;
  const kind=previousDraft?["title","content","destination","dateISO","time","duration","reminderMinutes","place","location","attachments"].filter(key=>JSON.stringify(draft[key as keyof UnifiedNoteDraft])!==JSON.stringify(previousDraft[key as keyof UnifiedNoteDraft])).join("+")||"unchanged":"create";
  const performance=startNoteSaveTrace(kind);let identityCheckMs=0;
  validateNote(draft);assertNoteAttachments(scope,draft.id,draft.attachments);
  const check=async()=>{const start=now();try{await assertTaskUser(scope.userId);if(!active())throw new Error("La cuenta o el contexto ha cambiado. La nota sigue en el editor.");}finally{identityCheckMs+=now()-start;}};
  await check();
  const validated=now();await verifyNoteFiles(scope,draft.id,draft.attachments);await check();const filesVerified=now();
  const saved=await updateGoLog(async rows=>{
    await check();const matches=rows.filter(row=>row.id===draft.id),previous=matches[0];
    if(matches.length>1 || previous && (!noteInScope(previous,scope) || previous.deleted || previous.estado==="rechazado"))throw new Error("No puedes modificar esta nota en este contexto.");
    if(previous && noteDocument(previous)?.operationId===draft.operationId){
      const committed=noteDraft(previous),incoming={...draft,time:draft.time?draft.time.split(":").map(n=>n.padStart(2,"0")).join(":"):""};
      const fields=["title","content","destination","dateISO","time","duration","place","reminderMinutes","attachments","location"] as const;
      if(fields.some(key=>JSON.stringify(committed[key])!==JSON.stringify(incoming[key])))throw new Error("La operación ya guardada contiene otros datos. Vuelve a abrir la nota antes de modificarla.");
      return {entries:rows,result:previous};
    }
    if(previous && !draft.original || !previous && draft.original)throw new Error("La nota ha cambiado o ya no está disponible. Vuelve a abrirla.");
    if(previous && draft.original) {
      const keys=["note","notes","detail","dateISO","time","duration","place","estado","reminders"] as const;
      if(keys.some(k=>JSON.stringify(previous[k])!==JSON.stringify(draft.original![k])))throw new Error("La nota se modificó durante la edición. Tus cambios siguen en el editor.");
    }
    const entry=buildNoteEntry(draft,scope,previous);
    return {entries:previous?rows.map(row=>row.id===entry.id?entry:row):[entry,...rows],result:entry};
  },()=>{if(!active())throw new Error("El contexto ha cambiado. No se ha confirmado el guardado.");});
  const persisted=now();
  await check();
  // Read the native storage itself, rather than treating the in-memory snapshot as persistence proof.
  const disk:unknown=JSON.parse(await AsyncStorage.getItem("go_log_v1") || "null");
  const verified=Array.isArray(disk)?disk.filter(row=>row?.id===saved.id):[];
  if(verified.length!==1 || !noteInScope(verified[0],scope) || noteDocument(verified[0])?.operationId!==draft.operationId
    || ["note","notes","detail","place"].some(k=>JSON.stringify(verified[0][k])!==JSON.stringify(saved[k as keyof GoEntry])))
    throw new Error("No se ha podido verificar el guardado en el teléfono. Conserva la nota y vuelve a pulsar GUARDAR.");
  await check();
  const verifiedAt=now();performance.duration("identityChecksMs",identityCheckMs);performance.duration("attachmentsMs",filesVerified-validated);performance.duration("writeAndQueueMs",persisted-filesVerified);performance.duration("readbackMs",verifiedAt-persisted);performance.mark("dataReady");
  let message="Nota guardada en "+({pending:"PENDIENTES",calendar:"CALENDARIO",archive:"ARCHIVO"}[draft.destination])+".";
  if(draft.reminderMinutes!==null&&draft.destination!=="calendar")message+=" El aviso se conserva sin programar hasta elegir CALENDARIO, fecha y hora.";
  const hasReminderEffect=!!(saved.reminders?.length||draft.original?.reminders?.length||draft.reminderMinutes!==null);
  setNoteReminderProgress(scope,saved.id,{operationId:draft.operationId,phase:"pending",message:hasReminderEffect?"Nota guardada · comprobando avisos…":""});
  const current=()=>active()&&noteReminderOperationCurrent(scope,saved.id,draft.operationId)
    &&noteDocument(getGoLogSnapshot().find(row=>row.id===saved.id))?.operationId===draft.operationId;
  // Storage and readback are already acknowledged. OS reconciliation continues
  // in the existing serialized queue and cannot hold the editor for 15–20 s.
  const reminderSync:Promise<NoteReminderReceipt>=Promise.resolve().then(async()=>{
    const start=now();let warning=false,feedback="Avisos comprobados.",details=message;
    try{
      const reports=await refreshNativeTaskReminders(scope,draft.destination==="calendar"&&!!draft.time&&draft.reminderMinutes!==null);
      await check();
      const own=reports.filter(report=>!report.taskId||report.taskId===saved.id);
      warning=own.some(report=>["failed","denied","capacity","unsupported","invalid","inactive"].includes(report.status));
      if(draft.destination==="calendar"&&draft.reminderMinutes!==null){
        warning ||= !draft.time||!own.some(report=>report.minutes===draft.reminderMinutes&&["scheduled","quiet","muted","past"].includes(report.status));
        // Detailed receipt remains available to callers that need it; no long report in the editor.
        details+=" "+describeReminders(saved,reports);
      }
      if(warning)feedback="Nota guardada. No se ha confirmado el aviso; puedes revisarlo en la nota.";
    }catch{warning=true;feedback="Nota guardada. No se han podido comprobar los avisos del teléfono.";}
    const elapsedMs=now()-start;performance.duration("notificationMs",elapsedMs);performance.mark("notificationsSettled");
    if(!current())return {phase:"superseded",message:"",elapsedMs};
    const phase=warning?"warning":"ready";
    setNoteReminderProgress(scope,saved.id,{operationId:draft.operationId,phase,message:warning?feedback:""});
    return {phase,message:warning?feedback:"",elapsedMs,details};
  });
  const notice="Guardada en "+({pending:"Pendientes",calendar:"Calendario",archive:"Archivo"}[draft.destination])+(hasReminderEffect?" · comprobando avisos":"");
  return {entry:saved,message,notice,reminderSync,performance,timings:{validationMs:validated-started,attachmentsMs:filesVerified-validated,persistenceMs:persisted-filesVerified,verificationMs:verifiedAt-persisted,totalMs:verifiedAt-started,identityCheckMs}};
}
export async function moveUnifiedNote(entry:GoEntry,destination:NoteDestination,scope:TaskScope,active:()=>boolean, schedule?:{dateISO:string;time:string;duration?:string}) {
  const draft=noteDraft(entry);draft.destination=destination;
  if(schedule){draft.dateISO=schedule.dateISO;draft.time=schedule.time;if(schedule.duration!==undefined)draft.duration=schedule.duration;}
  return saveUnifiedNote(draft,scope,active);
}
