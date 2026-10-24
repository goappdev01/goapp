import {useCallback,useEffect,useRef,useState} from "react";
import {AppState} from "react-native";
import type {GoEntry} from "@/components/AgendaOperativa";
import {getAuthenticatedUserId,getOwnedBusinesses,getLiveBusinessBookings,changeBookingRequest,subscribeBookingUpdates,type Booking,type Business} from "@/data/booking";
import {customerBookingEntry} from "@/data/customerBookingProjection";
import {onSessionChanged} from "@/lib/sessionEvents";

/** Another authorized view of the SAME server booking, never a persisted copy. */
export function businessBookingEntry(booking:Booking,business:Business,ownerId:string):GoEntry {
  const base=customerBookingEntry(booking,business,{id:booking.bookableItemId,businessId:business.id,
    title:booking.receipt?.serviceName ?? "Reserva",type:"service",durationMinutes:0,price:0,
    customerCapacity:1,unitQuantity:1,paymentRequired:false,active:true,visible:true},booking.receipt?.staffName);
  return {...base,id:"go_booking_prv_"+booking.id,type:"GO_BOOKING",kind:"sent",customerBooking:false,businessBooking:true,
    bookingResourceNames:Object.fromEntries((business.bookingResources ?? []).map(resource=>[resource.id,resource.name])),
    ownerUserId:ownerId,contactName:booking.receipt?.customerName?.trim() === "Cliente DEMO local" ? "" : booking.receipt?.customerName?.trim() || "",estado:base.deleted?"rechazado":booking.changeProposal?
      booking.changeProposal.proposedBy==="business"?"propuesta_pendiente":"propuesto":base.estado};
}
export function mergeBusinessBookingEntries(personal:GoEntry[],entries:GoEntry[]):GoEntry[]{
  // A legacy cache cannot supply authoritative real reservations from another
  // business/account or retain a cancelled booking. Keep other GO functions.
  return [...personal.filter(entry=>!(entry.businessBooking ||
    ((entry.type==="GO_BOOKING" || entry.type==="GO_RESERVA") &&
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(entry.reservationId ?? entry.bookingId ?? ""))))),...entries];
}
export function useBusinessBookings(businessId:string|undefined,enabled:boolean){
  const [state,setState]=useState<{entries:GoEntry[];ownerId:string|null;businessId?:string;error:string}>({entries:[],ownerId:null,error:""});
  const generation=useRef(0),active=useRef({businessId,enabled});active.current={businessId,enabled};
  const refresh=useCallback(async()=>{
    const token=++generation.current;
    const current=()=>generation.current===token && active.current.businessId===businessId && active.current.enabled===enabled;
    if(!enabled || !businessId){setState({entries:[],ownerId:null,error:""});return;}
    try{
      const user=await getAuthenticatedUserId();if(!current())return;
      if(!user){setState({entries:[],ownerId:null,error:""});return;}
      const owned=await getOwnedBusinesses(),business=owned.find(item=>item.id===businessId);
      if(!current())return;
      if(!business){setState({entries:[],ownerId:null,error:"No hay acceso a esta empresa."});return;}
      const bookings=await getLiveBusinessBookings(businessId);
      const finalUser=await getAuthenticatedUserId();
      if(current() && finalUser===user)setState({entries:bookings.map(booking=>businessBookingEntry(booking,business,user)),ownerId:user,businessId,error:""});
    }catch(error){if(current())setState(old=>({...old,error:error instanceof Error?error.message:"No se pudieron leer las reservas."}));}
  },[businessId,enabled]);
  useEffect(()=>{
    void refresh();
    const session=onSessionChanged(()=>{generation.current++;setState({entries:[],ownerId:null,error:""});void refresh();});
    const updates=subscribeBookingUpdates(()=>void refresh());
    const foreground=AppState.addEventListener("change",value=>{if(value==="active")void refresh();});
    const timer=enabled?setInterval(()=>void refresh(),30000):undefined;
    return()=>{generation.current++;session();updates();foreground.remove();if(timer)clearInterval(timer);};
  },[refresh,enabled]);
  const mutate=async(entry:GoEntry,operation:"propose"|"accept"|"reject"|"cancel"|"confirm",input:{proposalId?:string;acceptFinancialTerms?:boolean;dateISO?:string;time?:string}={})=>{
    const user=state.ownerId;
    if(!enabled || !active.current.enabled || active.current.businessId!==businessId || !user || entry.ownerUserId!==user
      || entry.businessId!==businessId || await getAuthenticatedUserId()!==user)throw new Error("La identidad o la empresa han cambiado.");
    try{await changeBookingRequest(String(entry.reservationId),operation,{...input,expectedRevision:entry.bookingChangeRevision??0,
      proposalId:input.proposalId??entry.changeProposal?.id},user);}finally{await refresh();}
  };
  return {...state,entries:enabled && state.businessId===businessId?state.entries:[],refresh,mutate};
}
