import React,{useEffect,useState} from "react";
import {Text,View} from "react-native";
import {useLanguage} from "@/contexts/LanguageContext";
import {getProfessionalReleasedCapacity,isCloudId,subscribeBookingUpdates,type ProfessionalReleasedCapacity} from "@/data/booking";
import type {GoEntry} from "@/components/AgendaOperativa";

/** Read projection of the SAME SQL occupation used to offer booking times. */
export function BookingPhaseAvailability({entry,professionalId,color="#111827",fontSize=12}:{entry:GoEntry;professionalId?:string;color?:string;fontSize?:number}){
 const {lang}=useLanguage(),[capacity,setCapacity]=useState<ProfessionalReleasedCapacity|null>(null),[unavailable,setUnavailable]=useState(false);
 const timeline=entry.bookingTimeline,staffId=professionalId??entry.staffId,businessId=entry.businessId;
 const business=!!(entry.businessBooking||entry.bookingPerspective==="business"),hasWait=!!timeline?.waitMinutes;
 const bookingId=entry.bookingId??entry.reservationId;
 useEffect(()=>{
  let active=true,request=0;setCapacity(null);setUnavailable(false);
  if(!business||!hasWait)return;
  if(!isCloudId(businessId)||!isCloudId(staffId)||!entry.dateISO){setUnavailable(true);return;}
  const refresh=async()=>{const current=++request;try{const result=await getProfessionalReleasedCapacity(String(businessId),String(staffId),entry.dateISO!);if(active&&current===request){setCapacity(result);setUnavailable(false);}}catch{if(active&&current===request){setCapacity(null);setUnavailable(true);}}};
  void refresh();const stop=subscribeBookingUpdates(()=>void refresh());return()=>{active=false;stop();};
 },[business,hasWait,businessId,staffId,entry.dateISO,entry]);
 if(!business||!hasWait||!timeline)return null;
 const rows=capacity?.releasedCapacity.filter(row=>row.bookingId===bookingId&&row.staffId===staffId)??[];
 const format=(value:string)=>new Intl.DateTimeFormat(lang==="en"?"en-GB":"es-ES",{timeZone:timeline.timezone,hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(new Date(value));
 return <View testID="calendar-released-wait-capacity" pointerEvents="none" style={{gap:3}}>
  <Text style={{color,fontSize,fontWeight:"600"}}>{lang==="en"?"Work / wait: ":"Trabajo / espera: "}{timeline.workMinutes} / {timeline.waitMinutes} min</Text>
  {rows.map((row,index)=><Text key={row.phaseId+"_"+index} style={{color,fontSize,fontWeight:"700"}}>{lang==="en"?"Professional free: ":"Profesional libre: "}{format(row.startsAt)}–{format(row.endsAt)}</Text>)}
  {capacity&&!rows.length&&<Text style={{color,fontSize}}>{lang==="en"?"No free wait remains.":"Sin espera libre restante."}</Text>}
  {!capacity&&<Text style={{color,fontSize}}>{timeline.releasedWaitMinutes===0?(lang==="en"?"Wait remains occupied.":"La espera permanece ocupada."):unavailable?(lang==="en"?"Wait availability cannot be checked on this server yet.":"Este servidor aún no permite comprobar la espera disponible."):(lang==="en"?"Checking remaining availability…":"Consultando disponibilidad restante…")}</Text>}
  {!!rows.length&&<Text style={{color,fontSize}}>{lang==="en"?"Facilities depend on the selected service.":"Las instalaciones dependen del servicio elegido."}</Text>}
 </View>;
}
