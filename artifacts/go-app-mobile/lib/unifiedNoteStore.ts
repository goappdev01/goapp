import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { assertTaskUser } from "./goTaskAccess";
import { updateGoLog } from "./goLogStore";
import { refreshNativeTaskReminders } from "./goTaskReminderRuntime";
import { describeReminders } from "./goTaskReminders";
import { assertNoteAttachments, verifyNoteFiles } from "./goNoteFiles";
import { buildNoteEntry, noteDocument, noteDraft, noteInScope, validateNote, type NoteDestination, type UnifiedNoteDraft } from "./unifiedNotes";

/** Ordinary notes use GO's existing committed store; saving is independent of IA and HTTP availability. */
export async function saveUnifiedNote(draft: UnifiedNoteDraft, scope: TaskScope, active: () => boolean) {
  validateNote(draft);assertNoteAttachments(scope,draft.id,draft.attachments);
  const check=async()=>{await assertTaskUser(scope.userId);if(!active())throw new Error("La cuenta o el contexto ha cambiado. La nota sigue en el editor.");};
  await check();
  await verifyNoteFiles(scope,draft.id,draft.attachments);await check();
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
  await check();
  // Read the native storage itself, rather than treating the in-memory snapshot as persistence proof.
  const disk:unknown=JSON.parse(await AsyncStorage.getItem("go_log_v1") || "null");
  const verified=Array.isArray(disk)?disk.filter(row=>row?.id===saved.id):[];
  if(verified.length!==1 || !noteInScope(verified[0],scope) || noteDocument(verified[0])?.operationId!==draft.operationId
    || ["note","notes","detail","place"].some(k=>JSON.stringify(verified[0][k])!==JSON.stringify(saved[k as keyof GoEntry])))
    throw new Error("No se ha podido verificar el guardado en el teléfono. Conserva la nota y vuelve a pulsar GUARDAR.");
  await check();
  let message="Nota guardada en "+({pending:"PENDIENTES",calendar:"CALENDARIO",archive:"ARCHIVO"}[draft.destination])+".";
  try {const reports=await refreshNativeTaskReminders(scope,draft.destination==="calendar"&&draft.reminderMinutes!==null);
    if(draft.destination==="calendar"&&draft.reminderMinutes!==null)message+=" "+describeReminders(saved,reports);
    else if(draft.reminderMinutes!==null)message+=" El aviso se conserva sin programar hasta elegir CALENDARIO, fecha y hora.";
  }catch{message+=" El aviso no se ha podido confirmar. Revisa los permisos del teléfono.";}
  await check();return {entry:saved,message};
}
export async function moveUnifiedNote(entry:GoEntry,destination:NoteDestination,scope:TaskScope,active:()=>boolean, schedule?:{dateISO:string;time:string;duration?:string}) {
  const draft=noteDraft(entry);draft.destination=destination;
  if(schedule){draft.dateISO=schedule.dateISO;draft.time=schedule.time;if(schedule.duration!==undefined)draft.duration=schedule.duration;}
  return saveUnifiedNote(draft,scope,active);
}
