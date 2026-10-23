import { completionKey,completionSchedule,nextCompletionReminder,completionDecision,pendingCompletion,plannedActionEnd,COMPLETION_GRACE_MS } from "./goActionCompletion";
import { getCompletionSource,readCompletionDocument,focusCompletion } from "./goActionCompletionStore";
import type { CompletionScope } from "./goActionCompletion";
import type { NativeReminderRequest } from "./goNativeReminderScheduler";
/** Uses the existing OS queue. No network, push token, task clone or status mutation. */
export const completionNotificationPolicy={
 async requests(scope:CompletionScope):Promise<NativeReminderRequest[]>{
  const doc=await readCompletionDocument(scope),now=Date.now(),result:NativeReminderRequest[]=[];
  const source=getCompletionSource(scope);
  for(const entry of source){
   if(source.filter(e=>completionKey(e)===completionKey(entry)).length!==1)continue;
   const at=nextCompletionReminder(entry,doc,now);if(at===null)continue;
   const key=completionKey(entry),record=doc.records[key],interval=(record?.reminderMinutes || doc.preferences.reminderMinutes)*60000;
   // Finite native queue, replenished on every foreground/change. Never claim infinite background execution.
   for(let i=0;i<8;i++){
    const fireAt=at+i*interval;if(!Number.isFinite(fireAt)||fireAt>8.64e15)continue;
    result.push({identifier:"go-task-reminder-v1:"+encodeURIComponent(JSON.stringify([scope.userId,scope.context,"completion:"+key,fireAt])),
     taskId:entry.id,minutes:0,at:fireAt,scope:{...scope},title:"GO · ¿Has finalizado esta acción?",sound:true,signature:"",
     completion:{key,schedule:completionSchedule(entry)}});
   }
  }
  return result;
 },
 async present(scope:CompletionScope,data:Record<string,unknown>):Promise<boolean>{
  const doc=await readCompletionDocument(scope);
  const entries=getCompletionSource(scope).filter(e=>completionKey(e)===data.completionKey);
  const entry=entries[0];if(entries.length!==1 || completionSchedule(entry)!==data.completionSchedule)return false;
  const decision=completionDecision(entry,doc),end=plannedActionEnd(entry,doc.preferences.defaultDurationMinutes);
  if(end===null || Date.now()<end+COMPLETION_GRACE_MS)return false;
  return decision?.status!=="done" && (pendingCompletion(entry,doc) || !decision)
    && nextCompletionReminder(entry,doc,Date.now())!==null;
 },
 async open(scope:CompletionScope,data:Record<string,unknown>):Promise<boolean>{
  if(!await this.present(scope,data))return false;
  const entry=getCompletionSource(scope).find(e=>completionKey(e)===data.completionKey);
  if(!entry)return false;focusCompletion(entry.id);return true;
 }
};
