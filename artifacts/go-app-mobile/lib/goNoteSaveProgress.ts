import type { TaskScope } from "./goTaskReminders";

export type NoteReminderReceipt={phase:"ready"|"warning"|"superseded";message:string;elapsedMs:number;details?:string};
export type NoteReminderProgress={operationId:string;phase:"pending"|"ready"|"warning";message:string};
const progress=new Map<string,NoteReminderProgress>(),listeners=new Set<()=>void>();
const key=(scope:TaskScope,id:string)=>JSON.stringify([scope.userId,scope.context,id]);
export const subscribeNoteReminderProgress=(listener:()=>void)=>{listeners.add(listener);return()=>{listeners.delete(listener);};};
export const getNoteReminderProgress=(scope:TaskScope,id:string,operationId?:string)=>{const value=progress.get(key(scope,id));return value&&(!operationId||value.operationId===operationId)?value:null;};
export function setNoteReminderProgress(scope:TaskScope,id:string,value:NoteReminderProgress){progress.set(key(scope,id),value);for(const listener of listeners)listener();}
export const noteReminderOperationCurrent=(scope:TaskScope,id:string,operationId:string)=>progress.get(key(scope,id))?.operationId===operationId;

/** Volatile timings only: no note text, IDs, credentials, addresses, audio or file paths. */
export type NoteSaveMeasurement={sequence:number;kind:string;marks:Record<string,number>};
export type NoteSaveTrace={mark:(phase:string)=>void;duration:(phase:string,ms:number)=>void};
let sequence=0;const measurements:NoteSaveMeasurement[]=[];
export const notePerformanceNow=()=>typeof performance!=="undefined"?performance.now():Date.now();
export const getNoteSaveMeasurements=()=>measurements.map(item=>({...item,marks:{...item.marks}}));
export function startNoteSaveTrace(kind:string):NoteSaveTrace{
  const started=notePerformanceNow(),item:NoteSaveMeasurement={sequence:++sequence,kind,marks:{}};
  measurements.push(item);if(measurements.length>40)measurements.shift();
  const log=()=>{if(typeof __DEV__!=="undefined"&&__DEV__)console.info("[GO NOTA tiempos]",{sequence:item.sequence,kind:item.kind,...item.marks});};
  return {mark(phase){item.marks[phase]=notePerformanceNow()-started;if(["dataReady","visible","notificationsSettled","presenterDismissed","selectionFinished"].includes(phase))log();},duration(phase,ms){item.marks[phase]=ms;}};
}
