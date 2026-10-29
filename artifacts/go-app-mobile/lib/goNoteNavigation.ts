import type { GoEntry } from "@/components/AgendaOperativa";
import type { TaskScope } from "./goTaskReminders";
import { noteDocument, noteInScope, validNoteDate, validNoteTime, type NoteDestination } from "./unifiedNotes";
export type NoteRevealTarget={destination:NoteDestination;entryId:string;dateISO:string;timeHHMM:string;token:number};
export function savedNoteTarget(entry:GoEntry,scope:TaskScope,token:number):NoteRevealTarget {
 const note=noteDocument(entry);
 if(!note||!noteInScope(entry,scope)||entry.deleted||!["calendar","pending","archive"].includes(note.destination))throw new Error("La nota guardada no está disponible en este contexto.");
 if(note.destination==="calendar"&&(!validNoteDate(entry.dateISO)||!validNoteTime(entry.time)))throw new Error("No se ha podido localizar la fecha y hora guardadas.");
 return {destination:note.destination,entryId:entry.id,dateISO:note.destination==="calendar"?entry.dateISO:"",timeHHMM:note.destination==="calendar"?entry.time:"",token};
}
export const noteRevealColumn=(target:Pick<NoteRevealTarget,"destination"|"dateISO">)=>target.destination==="archive"?"notes":target.destination==="pending"?"retrasados":"day_"+target.dateISO;
