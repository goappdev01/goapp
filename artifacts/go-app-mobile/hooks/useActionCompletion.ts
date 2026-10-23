import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { useAssistantZoneScope } from "@/hooks/useAssistantZoneScope";
import { useOwnerBusinessDemo } from "@/contexts/OwnerBusinessDemoContext";
import { createDemoBookingRepository, createDemoCatalogBookingRepository } from "@/data/demoBookingRepository";
import type { GoEntry } from "@/components/AgendaOperativa";
import { subscribeCompletions,getCompletionDocument,readCompletionDocument,updateCompletionDocument,
 setCompletionSource,clearCompletionSource,getCompletionSource,decideCompletion,onCompletionFocus } from "@/lib/goActionCompletionStore";
import { awaitingCompletion,pendingCompletion,completionDecision,completionKey,ownedCompletionEntry,positiveMinutes,
 completionStorageKey,completionSchedule,sameCompletionScope as sameScope,type CompletionEntry,type CompletionScope,type CompletionPreferences } from "@/lib/goActionCompletion";
import { refreshActiveNativeTaskReminders,refreshNativeTaskReminders,registerActionCompletionRuntime } from "@/lib/goTaskReminderRuntime";
import { completionNotificationPolicy } from "@/lib/goActionCompletionNotifications";

type CompletionWrite = {
 id:string; scope:CompletionScope; entry:CompletionEntry; status:"done"|"pending";
 at:number; phase:"saving"|"failed"; message:string; promise?:Promise<void>;
};
const writeKey=(scope:CompletionScope,entry:CompletionEntry)=>JSON.stringify([completionStorageKey(scope),completionKey(entry),completionSchedule(entry)]);

/** Scope is presentation + verified identity, never a new permission system. */
export function useCompletionDocument() {
 const identity=useAssistantZoneScope(),scope=identity.ready?identity.scope:null;
 const [error,setError]=useState("");
 const key=JSON.stringify(scope),active=useRef(key);active.current=key;
 const doc=useSyncExternalStore(subscribeCompletions,()=>scope?getCompletionDocument(scope):null,()=>null);
 useEffect(()=>{setError("");if(scope)void readCompletionDocument(scope).catch(e=>{if(active.current===key)setError(String(e.message));});},[key]);
 return {scope,doc,error,active:(expected:CompletionScope)=>active.current===JSON.stringify(expected)};
}
export function useActionCompletion(entries:GoEntry[]) {
 const state=useCompletionDocument(),demo=useOwnerBusinessDemo();
 const [revision,render]=useState(0),[now,setNow]=useState(Date.now),[selected,setSelected]=useState<string|null>(null);
 const [feedback,setFeedback]=useState(""),[busy,setBusy]=useState(false);
 // UI transitions are per action. The existing store still commits before publishing.
 const writes=useRef(new Map<string,CompletionWrite>());
 const [writeRevision,renderWrites]=useState(0);
 const repo=useMemo(()=>state.scope?.context==="demo:USER" && demo.demo?.ownerUserId===state.scope.userId
   ?demo.catalog?createDemoCatalogBookingRepository(demo.catalog):createDemoBookingRepository(demo.demo):null,
   [state.scope?.userId,state.scope?.context,demo.demo,demo.catalog]);
 useEffect(()=>{
   const subscriptions=[repo?.store.subscribe(()=>render(n=>n+1)),demo.demo?.subscribe(()=>render(n=>n+1))];
   return()=>subscriptions.forEach(fn=>fn?.());
 },[repo,demo.demo]);
 const candidates=useMemo(()=>{
   const s=state.scope;if(!s)return [];
   const extras:GoEntry[]=s.context==="demo:USER"?repo?.getCustomerEntries() || []
    :s.context.startsWith("demo:BUSINESS:") && demo.demo?.ownerUserId===s.userId
      && s.context==="demo:BUSINESS:"+demo.demo.businessId?demo.demo.getSnapshot().entries:[];
   const owned=entries.filter(e=>ownedCompletionEntry(e as CompletionEntry,s));
   const byKey=new Map<string,CompletionEntry>();
   for(const e of [...owned,...extras]){
    if(!e.id || !e.dateISO || !e.time)continue;
    if(!ownedCompletionEntry(e,s))continue;
    const key=completionKey(e);if(!byKey.has(key))byKey.set(key,e);
   }
   return [...byKey.values()];
 },[entries,state.scope?.userId,state.scope?.context,repo,demo.demo,revision]);
 useEffect(()=>{
   const s=state.scope;if(!s)return;
   setCompletionSource(s,candidates);
   void refreshNativeTaskReminders(s).then(reports=>{
     if(!state.active(s))return;
     const failures=reports.filter(r=>r.minutes===0 && ["denied","failed","capacity","unsupported","inactive","invalid"].includes(r.status));
     if(failures.length)setFeedback("GO conserva tu solicitud. No se han podido confirmar todos los avisos del teléfono; revisa los permisos y la capacidad de notificaciones.");
   }).catch(()=>{if(state.active(s))setFeedback("No se han podido verificar los avisos del teléfono. La solicitud permanece en GO.");});
   return()=>clearCompletionSource(s);
 },[state.scope?.userId,state.scope?.context,candidates]);
 useEffect(()=>registerActionCompletionRuntime(completionNotificationPolicy),[]);
 useEffect(()=>{
   const tick=()=>{setNow(Date.now());void refreshActiveNativeTaskReminders().catch(()=>{});};const timer=setInterval(tick,30000);
   const app=AppState.addEventListener("change",s=>{if(s==="active")tick();});
   const stop=onCompletionFocus(id=>setSelected(id));
   return()=>{clearInterval(timer);app.remove();stop();};
 },[]);
 useEffect(()=>{setSelected(null);setFeedback("");},[state.scope?.userId,state.scope?.context]);
 const scopeKey=state.scope?completionStorageKey(state.scope):null;
 const currentWrites=[...writes.current.values()].filter(job=>scopeKey===completionStorageKey(job.scope));
 const jobFor=(entry:CompletionEntry)=>state.scope?writes.current.get(writeKey(state.scope,entry)):undefined;
 const unresolved=state.doc?candidates.filter(e=>awaitingCompletion(e,state.doc!,now) && !jobFor(e)):[];
 const pending=state.doc?candidates.filter(e=>pendingCompletion(e,state.doc!) || jobFor(e)?.phase==="saving" && jobFor(e)?.status==="pending"):[];
 const decide=(entry:CompletionEntry,status:"done"|"pending"):Promise<void>=>{
   const scope=state.scope;if(!scope || !state.active(scope))return Promise.resolve();
   const id=writeKey(scope,entry),previous=writes.current.get(id);
   if(previous?.phase==="saving")return previous.promise!;
   const job:CompletionWrite={id,scope:{...scope},entry:{...entry},status,at:previous?.at ?? Date.now(),phase:"saving",message:""};
   writes.current.set(id,job);renderWrites(n=>n+1);
   // Capture the task, participant and schedule before any asynchronous work.
   const rows=unresolved.some(row=>row.id===entry.id)?unresolved:pending;
   const index=rows.findIndex(row=>row.id===entry.id);
   if(index>=0)setSelected(rows.length>1?rows[(index+1)%rows.length].id:null);
   job.promise=decideCompletion(job.scope,job.entry,status,()=>state.active(job.scope),job.at).then(()=>{
     if(writes.current.get(id)===job)writes.current.delete(id);
   }).catch(error=>{
     if(writes.current.get(id)===job){job.phase="failed";job.message=error instanceof Error?error.message:"No se pudo guardar la decisión.";}
   }).finally(()=>{
     renderWrites(n=>n+1);
     // One notification refresh after the current batch drains. It never blocks the next action.
     if(state.active(job.scope) && ![...writes.current.values()].some(other=>sameScope(other.scope,job.scope) && other.phase==="saving")){
       void refreshActiveNativeTaskReminders().catch(()=>{
         if(state.active(job.scope))setFeedback([...writes.current.values()].some(other=>sameScope(other.scope,job.scope) && other.phase==="failed")
           ?"No se han podido verificar los avisos del teléfono. Las decisiones no guardadas siguen disponibles para reintento."
           :"Decisiones guardadas. No se han podido verificar todos los avisos del teléfono.");
       });
     }
   });
   return job.promise;
 };
 const retryDecision=(id:string)=>{
   const job=writes.current.get(id);
   return job?.phase==="failed" && state.scope && sameScope(job.scope,state.scope)?decide(job.entry,job.status):Promise.resolve();
 };
 const isSaving=(entry:CompletionEntry)=>jobFor(entry)?.phase==="saving";
 const failedDecisions=currentWrites.filter(job=>job.phase==="failed");
 const savingCount=currentWrites.filter(job=>job.phase==="saving").length;
 const configure=async(preferences:Partial<CompletionPreferences>,entry?:CompletionEntry,minutes?:number,alerts?:boolean)=>{
   const s=state.scope;if(!s)return;setBusy(true);setFeedback("");
   try{
    if(minutes!==undefined && !positiveMinutes(minutes))throw new Error("Indica un intervalo positivo en horas o minutos.");
    await updateCompletionDocument(s,()=>state.active(s),doc=>{
     const prefs={...doc.preferences,...preferences};
     if(!positiveMinutes(prefs.defaultDurationMinutes)||!positiveMinutes(prefs.reminderMinutes))throw new Error("Indica una duración y un intervalo válidos.");
     const key=entry?completionKey(entry):null,old=key?doc.records[key] || {history:[]}:null;
     return {...doc,preferences:prefs,records:key?{...doc.records,[key]:{...old!,...(minutes!==undefined?{reminderMinutes:minutes,remindAt:Date.now()+minutes*60000}:{}),...(alerts!==undefined?{alerts}:{})}}:doc.records};
    });
    const reports=await refreshNativeTaskReminders(s,true);
    const relevant=reports.filter(r=>r.minutes===0);
    setFeedback(relevant.some(r=>["failed","denied","unsupported","capacity"].includes(r.status))
      ?"Configuración guardada. El teléfono no ha confirmado todos los avisos; GO conserva las solicitudes."
      :relevant.some(r=>r.status==="muted")?"Avisos silenciados; las acciones permanecen registradas."
      :relevant.some(r=>r.status==="quiet")?"Avisos programados según el modo discreto del teléfono."
      :relevant.length?"Avisos verificados en el teléfono.":"Configuración guardada. Los avisos desactivados no eliminan las acciones; la programación se verificará en este calendario.");
   }catch(e){setFeedback(e instanceof Error?e.message:"No se pudo guardar la configuración.");}
   finally{setBusy(false);}
 };
 const status=useCallback((e:GoEntry)=>{
   const job=state.scope?writes.current.get(writeKey(state.scope,e)):undefined;
   return job?.phase==="saving"?job.status:state.doc?completionDecision(e,state.doc)?.status:undefined;
 },[state.doc,scopeKey,writeRevision]);
 return {...state,now,candidates,unresolved,pending,selected,setSelected,decide,configure,status,busy,feedback,isSaving,savingCount,failedDecisions,retryDecision};
}
