import type { GoEntry } from "@/components/AgendaOperativa";
export type CompletionScope = { userId: string; context: string };
export type Resolution = "done" | "pending";
export type CompletionEntry = GoEntry & {
  ownerUserId?: string; taskContext?: string; actionContext?: string; demoLocal?: boolean;
  startDatetime?: string; endDatetime?: string; localResolutionStatus?: Resolution;
};
export type CompletionPreferences = { defaultDurationMinutes: number; reminderMinutes: number; pendingAlerts: boolean };
export type Decision = { status: Resolution; schedule: string; at: number };
export type CompletionRecord = {
  decision?: Decision; history: Decision[]; reminderMinutes?: number; remindAt?: number; alerts?: boolean;
};
export type CompletionDocument = {
  version: 1; scope: CompletionScope; preferences: CompletionPreferences; records: Record<string, CompletionRecord>;
};
export const COMPLETION_DEFAULTS: CompletionPreferences = { defaultDurationMinutes: 60, reminderMinutes: 1440, pendingAlerts: true };
export const COMPLETION_GRACE_MS = 30 * 60000;
export const sameCompletionScope = (a: CompletionScope | null, b: CompletionScope | null) =>
  !!a && !!b && a.userId === b.userId && a.context === b.context;
export const completionStorageKey = (s: CompletionScope) => "go_action_completion_v1:" + encodeURIComponent(JSON.stringify([s.userId,s.context]));
export function emptyCompletionDocument(scope: CompletionScope): CompletionDocument {
  return {version:1,scope:{...scope},preferences:{...COMPLETION_DEFAULTS},records:{}};
}
export function positiveMinutes(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 && value * 60000 < 8.64e15 - Date.now();
}
function current(entry: CompletionEntry): CompletionEntry {
  const p = entry.changeProposal;
  return p ? {...entry,dateISO:p.originalDateISO,time:p.originalTime,duration:p.originalDuration ?? entry.duration} : entry;
}
export function completionKey(entry: CompletionEntry): string {
  return entry.reservationId ? JSON.stringify(["reservation",entry.businessId || "",entry.reservationId]) : JSON.stringify(["go",entry.id]);
}
/** The current projection wins; no fields or ownership are borrowed from a candidate. */
export function mergeCompletionEntries(base: readonly CompletionEntry[], candidates: readonly CompletionEntry[]): CompletionEntry[] {
  const seen=new Set<string>(),result:CompletionEntry[]=[];
  for(const entry of [...base,...candidates]){
    const key=entry.reservationId
      ?JSON.stringify(["reservation",entry.businessId ?? null,entry.reservationId,entry.ownerUserId ?? null])
      :JSON.stringify(["go",entry.id]);
    if(seen.has(key))continue;
    seen.add(key);result.push(entry);
  }
  return result;
}
export function completionSchedule(entry: CompletionEntry): string {
  const e=current(entry);
  return JSON.stringify([e.dateISO,e.time,e.duration,e.startDatetime || "",e.endDatetime || "",e.endTime || ""]);
}
export function durationMinutes(value: string): number | null {
  const raw=value.trim().toLowerCase().replace(",",".");
  if (!raw) return null;
  if (/^\d+(\.\d+)?$/.test(raw)) return Number(raw)>0?Number(raw):null;
  if (/^\d+:\d{2}$/.test(raw)) {const [h,m]=raw.split(":").map(Number);return m<60 && h*60+m>0?h*60+m:null;}
  const matches=[...raw.matchAll(/(\d+(?:\.\d+)?)\s*(horas?|hours?|h|minutos?|minutes?|mins?|m)\b/g)];
  if (!matches.length || raw.replace(/(\d+(?:\.\d+)?)\s*(horas?|hours?|h|minutos?|minutes?|mins?|m)\b/g,"").trim()) return null;
  const total=matches.reduce((n,m)=>n+Number(m[1])*(m[2].startsWith("h")?60:1),0);
  return total>0 && Number.isFinite(total)?total:null;
}
function localInstant(date: string,time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]?\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const [y,m,d]=date.split("-").map(Number),[h,min]=time.split(":").map(Number),at=new Date(y,m-1,d,h,min,0,0);
  const matches=(x:Date)=>x.getFullYear()===y && x.getMonth()===m-1 && x.getDate()===d && x.getHours()===h && x.getMinutes()===min;
  if(!matches(at) || [30,60,120].some(shift=>matches(new Date(at.getTime()+shift*60000))))return null;
  return at.getTime();
}
export function plannedActionEnd(entry: CompletionEntry, fallbackMinutes=60): number | null {
  const e=current(entry);
  const start=e.startDatetime ? Date.parse(e.startDatetime) : localInstant(e.dateISO || "",e.time || "");
  if (start===null || !Number.isFinite(start)) return null;
  if (e.endDatetime) {const end=Date.parse(e.endDatetime);return Number.isFinite(end)&&end>start?end:null;}
  if (e.endTime) {
    let end=localInstant(e.dateISO || "",e.endTime);
    if (end===null) return null;
    if (end===start) return null;
    if (end<start) {
      // Reparse the following local date: adding 24h is incorrect across a DST change.
      const next=new Date(start);next.setDate(next.getDate()+1);
      const date=[next.getFullYear(),String(next.getMonth()+1).padStart(2,"0"),String(next.getDate()).padStart(2,"0")].join("-");
      end=localInstant(date,e.endTime);if(end===null)return null;
    }
    return end;
  }
  const duration=e.duration?.trim()?durationMinutes(e.duration):fallbackMinutes;
  return duration!==null && positiveMinutes(duration)?start+duration*60000:null;
}
export function completionEligible(entry: CompletionEntry): boolean {
  return !entry.deleted && entry.estado!=="rechazado" && entry.bookingStatus!=="cancelada"
    && !(entry as GoEntry & {scheduled?:boolean}).scheduled;
}
export function completionDecision(entry: CompletionEntry, doc: CompletionDocument): Decision | undefined {
  const d=doc.records[completionKey(entry)]?.decision;
  return d?.schedule===completionSchedule(entry)?d:undefined;
}
export function awaitingCompletion(entry: CompletionEntry, doc: CompletionDocument, now: number): boolean {
  const end=plannedActionEnd(entry,doc.preferences.defaultDurationMinutes);
  return completionEligible(entry) && !entry.changeProposal && !entry.proposal && end!==null
    && now>=end+COMPLETION_GRACE_MS && !completionDecision(entry,doc);
}
export function pendingCompletion(entry: CompletionEntry, doc: CompletionDocument): boolean {
  return completionEligible(entry) && completionDecision(entry,doc)?.status==="pending";
}
export function ownedCompletionEntry(e: CompletionEntry,s: CompletionScope): boolean {
  if (e.ownerUserId!==s.userId) return false;
  const context=e.actionContext || e.taskContext;
  if(context)return context===s.context;
  if(e.demoLocal)return s.context==="demo:USER" || !!e.businessId && s.context==="demo:BUSINESS:"+e.businessId;
  return s.context==="live:USER";
}
export function nextCompletionReminder(entry: CompletionEntry,doc: CompletionDocument,now:number): number | null {
  if (!completionEligible(entry) || entry.changeProposal || entry.proposal) return null;
  const record=doc.records[completionKey(entry)],decision=completionDecision(entry,doc);
  if (decision?.status==="done" || record?.alerts===false || decision?.status==="pending" && !doc.preferences.pendingAlerts) return null;
  const end=plannedActionEnd(entry,doc.preferences.defaultDurationMinutes);
  if (end===null) return null;
  const interval=(record?.reminderMinutes || doc.preferences.reminderMinutes)*60000;
  if (record?.remindAt && record.remindAt>now) return Math.max(record.remindAt,end+COMPLETION_GRACE_MS);
  const first=decision?.status==="pending"?decision.at+interval:end+COMPLETION_GRACE_MS;
  return first>now?first:first+(Math.floor((now-first)/interval)+1)*interval;
}
export function recordCompletion(doc: CompletionDocument,e: CompletionEntry,status: Resolution,now: number,explicit = false): CompletionDocument {
  if (!completionEligible(e)) throw new Error("La acción ya no está disponible.");
  const key=completionKey(e),old=doc.records[key] || {history:[]},schedule=completionSchedule(e);
  if(explicit && (!ownedCompletionEntry(e,doc.scope) || e.changeProposal || e.proposal))throw new Error("Esta acción no permite confirmar su seguimiento en este contexto.");
  if (old.decision?.schedule===schedule && old.decision.status===status) return doc;
  if(!explicit && !awaitingCompletion(e,doc,now) && !pendingCompletion(e,doc))throw new Error("La acción todavía no necesita confirmación.");
  const decision={status,schedule,at:now};
  return {...doc,records:{...doc.records,[key]:{...old,decision,history:[...old.history,decision],remindAt:undefined}}};
}
