import React,{useEffect,useState} from "react";
import {Text,View} from "react-native";
import {getBookingDayAnalysis,type BookingDayAnalysis} from "@/data/booking";
import {useLanguage} from "@/contexts/LanguageContext";

/** Pull-only end-of-day analysis: no background interruptions or automatic changes. */
export function BookingDaySummary({businessId,timezone="Europe/Madrid"}:{businessId?:string;timezone?:string}){
 const {lang}=useLanguage(),[report,setReport]=useState<BookingDayAnalysis|null>(null),[error,setError]=useState("");
 useEffect(()=>{
  let active=true;setReport(null);setError("");if(!businessId)return;
  void(async()=>{
   try{
    const parts=new Intl.DateTimeFormat("en-GB",{timeZone:timezone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(new Date());
    const part=(key:string)=>parts.find(p=>p.type===key)!.value,today=part("year")+"-"+part("month")+"-"+part("day");
    let result=await getBookingDayAnalysis(businessId,today);
    if(!result.finished){const previous=new Date(today+"T12:00:00Z");previous.setUTCDate(previous.getUTCDate()-1);result=await getBookingDayAnalysis(businessId,previous.toISOString().slice(0,10));}
    if(active&&result.finished)setReport(result);
   }catch{if(active)setError(lang==="en"?"The daily booking summary is not available on this server yet.":"El resumen de reservas de la jornada todavía no está disponible en este servidor.");}
  })();return()=>{active=false;};
 },[businessId,timezone,lang]);
 if(!businessId)return null;
 return <View testID="booking-day-summary" style={{padding:16,gap:8}}>
  <Text style={{color:"#111827",fontWeight:"700",fontSize:15}}>{lang==="en"?"End-of-day reservations":"Reservas al finalizar la jornada"}{report?" · "+report.dateISO:""}</Text>
  {!!error&&<Text style={{color:"#6B7280",fontSize:12}}>{error}</Text>}
  {report?.professionals.map(p=><View key={p.staffId} style={{gap:4}}>
   <Text style={{color:"#111827",fontWeight:"700"}}>{p.name}{p.minimumMinutes?" · M = "+p.minimumMinutes+" min":""}</Text>
   <Text style={{color:"#6B7280",fontSize:12}}>{lang==="en"?"Ordinary / exception / earlier: ":"Ordinarias / excepción / anteriores: "}{p.ordinaryBookings} / {p.exceptionBookings} / {p.legacyBookings}</Text>
   <Text style={{color:"#6B7280",fontSize:12}}>{lang==="en"?"Scheduled occupation: ":"Ocupación programada: "}{p.occupiedMinutes} / {p.availableMinutes} min · {lang==="en"?"Free: ":"Libre: "}{p.freeMinutes} min · {p.remainingGaps.length}{lang==="en"?" gaps":" huecos"}</Text>
   {!!p.freeMinutes&&<Text style={{color:"#6B7280",fontSize:12}}>{lang==="en"?"Review the free intervals when planning future days. This is an estimate, not proof of lost sales. Authorizations remain unchanged.":"Revisa los intervalos libres al preparar jornadas futuras. Es una estimación, no una prueba de ventas perdidas. Las autorizaciones se mantienen."}</Text>}
  </View>)}
 </View>;
}
