import { emptyGoAction, emptyGoContext, extractGoScheduleFields, extractGoPlace, parseTaskPatch, normalizeBookingText } from "@workspace/api-zod";
import { assistantApi, localToday } from "./bookingAssistant";
import { interpretGoActions } from "./goPersonalActions";
import { reminderIntervals } from "./goTaskReminders";
import { validNoteDate, validNoteTime, type UnifiedNoteDraft } from "./unifiedNotes";

/** Interpretation only: reuse GO voice/planning rules, with no task writer or navigation. */
export async function prepareGoNote(text:string){
  const today=localToday();let ai=false;
  try{ai=(await assistantApi<{interpretation:boolean}>("/capabilities")).interpretation===true;}catch{/* Existing local rules remain available. */}
  const plan=await interpretGoActions(text,{...emptyGoContext(),active:"note",pending:emptyGoAction(text,"task")},ai);
  const patch:Partial<UnifiedNoteDraft>={content:text};
  if(plan.actions.length!==1)return{patch,notice:"He conservado el dictado. Contiene varias acciones; revisa esta nota antes de guardar."};
  const action=plan.actions[0],schedule=extractGoScheduleFields(text,today),review=parseTaskPatch(text,today);
  if(["note","task","event"].includes(action.kind)&&action.operation==="create"){
    if(action.title)patch.title=action.title;
    if(action.detail)patch.content=action.detail;
  }
  const date=schedule.date;
  // Spoken ambiguity checks take precedence over an AI interpretation.
  if(date&&validNoteDate(date)&&!review.clearDate)patch.dateISO=date;
  if(!review.times.length&&!review.clearTime&&!review.question?.includes("hora")){
    const time=schedule.time;if(time&&validNoteTime(time))patch.time=time;
  }
  const duration=schedule.durationMinutes;
  const durations:Record<number,string>={15:"15m",30:"30m",60:"1h",120:"2h"};
  if(duration&&durations[duration])patch.duration=durations[duration];
  const proposedPlace=action.place&&normalizeBookingText(text).includes(normalizeBookingText(action.place))?action.place:null;
  const place=extractGoPlace(text)||proposedPlace;if(place)patch.place=place;
  const alarm=normalizeBookingText(text).match(/\b(?:avisame|avisar|recuerdame|recordatorio)\b([^.!?;]*?)\bantes\b/);
  if(alarm&&!/\b(?:o|entre|sin|no)\b/.test(alarm[1])){
    const offsets=reminderIntervals(alarm[1]);
    const combined=offsets.length===2&&/\bhoras?\b.*\bminutos?\b/.test(alarm[1]);
    const minutes=offsets.length===1?offsets[0]:combined?offsets.reduce((a,b)=>a+b,0):null;
    if(minutes&&Number.isInteger(minutes)&&minutes>0&&minutes<=525600)patch.reminderMinutes=minutes;
  }
  return{patch,notice:review.times.length?"He preparado el borrador. La hora es ambigua: revísala antes de guardar.":"Borrador preparado con la interpretación disponible de GO. Revisa los datos y elige el destino antes de GUARDAR."};
}
