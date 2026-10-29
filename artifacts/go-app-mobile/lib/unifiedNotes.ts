import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";

export type NoteDestination = "pending" | "calendar" | "archive";
export type NoteAttachment = { id: string; name: string; kind: "file" | "link"; uri: string; mime?: string; size?: number };
export type NoteSchedule = { dateISO: string; time: string; duration: string };
export type NoteDocument = {
  version: 1; revision: number; operationId: string; destination: NoteDestination;
  title: string; content: string; schedule: NoteSchedule; reminderMinutes: number | null;
  reminderOffsets?: number[]; notificationsMuted?: boolean;
  attachments: NoteAttachment[]; location?: { latitude: number; longitude: number };
  history: { at: number; from: NoteDestination; to: NoteDestination; schedule: NoteSchedule }[];
};
export type UnifiedNoteDraft = {
  id: string; operationId: string; title: string; content: string; destination: NoteDestination | null;
  dateISO: string; time: string; duration: string; place: string; reminderMinutes: number | null;
  attachments: NoteAttachment[]; location?: NoteDocument["location"]; original?: GoEntry; security?: boolean;
};
export const noteId = () => "note_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2);
export const noteDocument = (entry?: GoEntry | null): NoteDocument | undefined => entry?.note?.version === 1 ? entry.note : undefined;
export const isArchivedNote = (entry: GoEntry) => noteDocument(entry)?.destination === "archive";
export const noteInScope = (entry: GoEntry, scope: TaskScope) => entry.ownerUserId === scope.userId
  && (entry.taskContext ?? entry.actionContext ?? "live:USER") === scope.context;
export const validNoteTime=(value:string)=>/^([01]?\d|2[0-3]):[0-5]?\d$/.test(value);
// Canonical durations from the optional four-digit hour / two-digit minute form.
export const NOTE_MAX_DURATION_MINUTES=9999*60+59;
export function validCustomNoteDuration(value:string){
  const match=/^([1-9]\d*)(m|h)$/.exec(value);if(!match)return false;
  const minutes=Number(match[1])*(match[2]==="h"?60:1);
  return Number.isSafeInteger(minutes)&&minutes>0&&minutes<=NOTE_MAX_DURATION_MINUTES;
}
export function validNoteDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+"T12:00:00"),[year,month,day]=value.split("-").map(Number);
  return date.getFullYear()===year&&date.getMonth()+1===month&&date.getDate()===day;
}
export function noteDraft(entry?: GoEntry | null): UnifiedNoteDraft {
  const n = entry && noteDocument(entry);
  return { id: entry?.id || noteId(), operationId: noteId(), title: n ? n.title : entry?.notes || "",
    content: n ? n.content : entry?.detail || "", destination: n?.destination || (entry ? entry.dateISO ? "calendar" : "pending" : null),
    dateISO: n?.schedule.dateISO ?? entry?.dateISO ?? "", time: n?.schedule.time ?? entry?.time ?? "", duration: n?.schedule.duration ?? entry?.duration ?? "",
    place: entry?.place || "", reminderMinutes: n?.reminderMinutes ?? entry?.reminders?.[0] ?? null,
    attachments: n?.attachments || [], location: n?.location, original: entry || undefined };
}
export function validateNote(draft: UnifiedNoteDraft): asserts draft is UnifiedNoteDraft & {destination:NoteDestination} {
  if (draft.security) throw new Error("Las notas de seguridad no están activadas. No se ha guardado contenido protegido.");
  if (!draft.title.trim() && !draft.content.trim() && !draft.attachments.length) throw new Error("Escribe una nota o adjunta un archivo antes de guardar.");
  if (!draft.destination || !["pending", "calendar", "archive"].includes(draft.destination)) throw new Error("Selecciona CALENDARIO, PENDIENTES o ARCHIVO antes de guardar.");
  if(draft.dateISO&&!validNoteDate(draft.dateISO))throw new Error("La fecha no es válida.");
  if(draft.time&&!validNoteTime(draft.time))throw new Error("Introduce una hora entre 00:00 y 23:59.");
  if (draft.destination === "calendar" && (!draft.dateISO || !draft.time)) throw new Error("Para CALENDARIO, selecciona fecha y hora. Duración y aviso son opcionales.");
  if(draft.destination==="calendar") {
    const [hours,minutes]=draft.time.split(":").map(Number),local=new Date(draft.dateISO+"T00:00:00");local.setHours(hours,minutes,0,0);
    if(local.getHours()!==hours||local.getMinutes()!==minutes)throw new Error("Esa hora no existe en la fecha y zona horaria seleccionadas.");
  }
  if (draft.duration && !validCustomNoteDuration(draft.duration) && draft.duration !== draft.original?.duration && draft.duration !== noteDocument(draft.original)?.schedule.duration)
    throw new Error("Selecciona una duración válida.");
  if (draft.reminderMinutes !== null && (!Number.isInteger(draft.reminderMinutes) || draft.reminderMinutes < 1 || draft.reminderMinutes > 525600)) throw new Error("El intervalo del aviso no es válido.");
  if (draft.location && (!Number.isFinite(draft.location.latitude) || !Number.isFinite(draft.location.longitude)
    || Math.abs(draft.location.latitude)>90 || Math.abs(draft.location.longitude)>180)) throw new Error("La ubicación no es válida.");
}
export function buildNoteEntry(draft: UnifiedNoteDraft, scope: TaskScope, previous?: GoEntry): GoEntry {
  validateNote(draft);
  const exactTime=draft.time?draft.time.split(":").map(n=>n.padStart(2,"0")).join(":"):"";
  const old = previous && noteDocument(previous), schedule = {dateISO:draft.dateISO,time:exactTime,duration:draft.duration};
  const priorOffset=old?old.reminderMinutes:previous?.reminders?.[0]??null;
  const priorOffsets=old?.reminderOffsets??previous?.reminders??[];
  const reminderOffsets=draft.reminderMinutes===null?[]:[...new Set([...priorOffsets.filter(offset=>offset!==priorOffset),draft.reminderMinutes])];
  const notificationsMuted=old?.notificationsMuted??(previous?.notificationsEnabled===false);
  const history = old?.history || [];
  const note: NoteDocument = { version:1,revision:(old?.revision || 0)+1,operationId:draft.operationId,destination:draft.destination,
    title:draft.title,content:draft.content,schedule,reminderMinutes:draft.reminderMinutes,reminderOffsets,notificationsMuted,attachments:draft.attachments.map(a=>({...a})),location:draft.location,
    history:old && old.destination!==draft.destination ? [...history,{at:Date.now(),from:old.destination,to:draft.destination,schedule:old.schedule}] : history };
  return { ...previous, id:draft.id,kind:"sent",type:previous?.type || "TAREA_INTERNA",intentKey:previous?.intentKey || "nota_interna",intentLabel:previous?.intentLabel || "Nota",
    color:previous?.color || "#7c3aed",estado:previous?.estado || "pendiente",createdAt:previous?.createdAt || Date.now(),
    ownerUserId:scope.userId,taskContext:scope.context,actionContext:previous?.actionContext || scope.context,
    notes:draft.title.trim() || draft.content.trim().split("\n")[0].slice(0,80) || "Nota adjunta",detail:draft.content,place:draft.place,
    contactName:previous?.contactName || "",phone:previous?.phone || "",isGeneric:previous?.isGeneric ?? true,
    dateISO:draft.destination==="calendar"?draft.dateISO:"",date:draft.destination==="calendar"?draft.dateISO:"",
    time:draft.destination==="calendar"?exactTime:"",duration:draft.destination==="calendar"?draft.duration:"",
    reminders:draft.destination==="calendar"?reminderOffsets:[],
    notificationsEnabled:draft.destination==="calendar" && reminderOffsets.length>0 && !notificationsMuted,
    goNoteReminder:true,note };
}
