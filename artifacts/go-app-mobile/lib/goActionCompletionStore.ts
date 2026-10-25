import AsyncStorage from "@react-native-async-storage/async-storage";
import { getTaskUser } from "./goTaskAccess";
import { completionStorageKey, emptyCompletionDocument, positiveMinutes, sameCompletionScope, completionKey,
  completionSchedule, recordCompletion, discardCompletion, ownedCompletionEntry, type CompletionScope, type CompletionDocument, type CompletionEntry, type Resolution } from "./goActionCompletion";
const snapshots=new Map<string,CompletionDocument>(),queues=new Map<string,Promise<unknown>>(),listeners=new Set<()=>void>();
let source: {scope:CompletionScope; entries:CompletionEntry[]} | null=null;
const focusListeners=new Set<(id:string)=>void>();
export const subscribeCompletions=(fn:()=>void)=>{listeners.add(fn);return()=>{listeners.delete(fn);};};
const emit=()=>{for(const fn of listeners)fn();};
export const getCompletionDocument=(scope:CompletionScope)=>snapshots.get(completionStorageKey(scope)) || null;
export function setCompletionSource(scope:CompletionScope,entries:CompletionEntry[]) {source={scope:{...scope},entries:entries.filter(e=>ownedCompletionEntry(e,scope))};}
export function clearCompletionSource(scope:CompletionScope) {if(sameCompletionScope(source?.scope || null,scope))source=null;}
export const getCompletionSource=(scope:CompletionScope):CompletionEntry[]=>sameCompletionScope(source?.scope || null,scope)?source!.entries:[];
export function onCompletionFocus(fn:(id:string)=>void){focusListeners.add(fn);return()=>{focusListeners.delete(fn);};}
export function focusCompletion(id:string){for(const fn of focusListeners)fn(id);}
export async function readCompletionDocument(scope:CompletionScope):Promise<CompletionDocument> {
  const key=completionStorageKey(scope),cached=snapshots.get(key);if(cached)return cached;
  const raw=await AsyncStorage.getItem(key);
  const doc=raw===null?emptyCompletionDocument(scope):JSON.parse(raw) as CompletionDocument;
  const validDecision=(d:unknown)=>!!d && typeof d==="object" && ["done","pending"].includes((d as {status:string}).status)
    && typeof (d as {schedule:string}).schedule==="string" && Number.isFinite((d as {at:number}).at);
  if(doc.version!==1 || !sameCompletionScope(doc.scope,scope) || !doc.records || Array.isArray(doc.records)
    || !positiveMinutes(doc.preferences?.defaultDurationMinutes) || !positiveMinutes(doc.preferences?.reminderMinutes)
    || typeof doc.preferences.pendingAlerts!=="boolean"
    || Object.values(doc.records).some(r=>!r || !Array.isArray(r.history) || r.history.some(d=>!validDecision(d))
      || r.discarded!==undefined && (!r.discarded || typeof r.discarded.schedule!=="string" || !Number.isFinite(r.discarded.at))
      || r.decision!==undefined && !validDecision(r.decision)
      || r.reminderMinutes!==undefined && !positiveMinutes(r.reminderMinutes)
      || r.remindAt!==undefined && (!Number.isFinite(r.remindAt) || r.remindAt<=0)
      || r.alerts!==undefined && typeof r.alerts!=="boolean"))
    throw new Error("No se pudo leer la confirmación de acciones. Se conserva sin sobrescribir.");
  if(!snapshots.has(key)){snapshots.set(key,doc);emit();}
  return snapshots.get(key)!;
}
export function updateCompletionDocument(scope:CompletionScope,active:()=>boolean,
  update:(doc:CompletionDocument)=>CompletionDocument):Promise<CompletionDocument> {
  const key=completionStorageKey(scope);
  const next=(queues.get(key) || Promise.resolve()).catch(()=>{}).then(async()=>{
    if(!active() || await getTaskUser()!==scope.userId || !active())throw new Error("La cuenta o el calendario han cambiado.");
    const previous=await readCompletionDocument(scope),doc=update(previous);
    if(!sameCompletionScope(doc.scope,scope))throw new Error("Contexto de confirmación no válido.");
    if(!active() || await getTaskUser()!==scope.userId || !active())throw new Error("La cuenta o el calendario han cambiado.");
    if(doc!==previous){await AsyncStorage.setItem(key,JSON.stringify(doc));snapshots.set(key,doc);emit();}
    return doc;
  });
  queues.set(key,next);return next;
}
export function decideCompletion(scope:CompletionScope,entry:CompletionEntry,status:Resolution,active:()=>boolean,at=Date.now(),explicit = false,currentEntry?:()=>CompletionEntry|undefined):Promise<CompletionDocument>{
  return updateCompletionDocument(scope,active,doc=>{
    const rendered=explicit?currentEntry?.():undefined;
    const matches=(explicit&&currentEntry?(rendered?[rendered].filter(e=>ownedCompletionEntry(e,scope)):[]):getCompletionSource(scope)).filter(e=>completionKey(e)===completionKey(entry));
    const current=matches[0];
    if(matches.length!==1 || !current || completionSchedule(current)!==completionSchedule(entry))throw new Error("La acción ha cambiado. Revisa sus datos.");
    return recordCompletion(doc,current,status,at,explicit);
  });
}

export function discardCompletionEntry(scope:CompletionScope,entry:CompletionEntry,active:()=>boolean,currentEntry:()=>CompletionEntry|undefined):Promise<CompletionDocument>{
  return updateCompletionDocument(scope,active,doc=>{
    const current=currentEntry();
    if(!current || !ownedCompletionEntry(current,scope) || completionKey(current)!==completionKey(entry) || completionSchedule(current)!==completionSchedule(entry))throw new Error("La ficha ha cambiado. Revisa sus datos.");
    return discardCompletion(doc,current,Date.now());
  });
}
