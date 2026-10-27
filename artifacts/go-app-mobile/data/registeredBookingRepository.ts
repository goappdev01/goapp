import {
  supabaseApiRequest, getAuthenticatedUserId, getOwnedBookableItems, getOwnedStaff,
  getTimelineAvailability, createHold, claimSlot, getLiveBusinessBookings, changeBookingRequest,
  BookingApiError, type Booking,
} from "./booking";
import { quoteCatalog, type CatalogQuote } from "./catalogAssociations";
import type { BusinessDemoData, BusinessDemoStore, DemoBooking } from "./businessDemoStore";
import type { DemoBookingRepository } from "./demoBookingRepository";
import { businessDemoProfessionalElement } from "./businessDemoStore";
import { businessWallTime } from "./bookingTimeline";

type Link = { id: string; sourceId: string | null };
type Source = { businessId: string; sourceId: string; timezone: string; serviceLinks: Link[]; staffLinks: Link[]; bookingLinks: Link[] };
type Identity = Pick<BusinessDemoStore, "ownerUserId" | "businessId">;
const cloud = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
async function sourceFor(store: Identity): Promise<Source> {
  if (await getAuthenticatedUserId() !== store.ownerUserId) throw new Error("La cuenta ha cambiado. Vuelve a abrir la reserva.");
  const source = await supabaseApiRequest<Source>(`/supabase/booking-calendar-business?${new URLSearchParams({source_id:store.businessId})}`, {}, true, store.ownerUserId);
  if (source.sourceId !== store.businessId || !cloud(source.businessId) || !source.timezone ||
    [source.serviceLinks,source.staffLinks,source.bookingLinks].some(links => !Array.isArray(links) || links.some(l => !cloud(l.id))))
    throw new Error("El servidor debe actualizar el enlace de esta empresa antes de reservar. No se ha creado ninguna reserva.");
  return source;
}
function linked(links: Link[], value: string, remote: boolean): string {
  const found = links.find(l => l.id === value || l.sourceId === value);
  const result = remote ? found?.id : found?.sourceId;
  if (!result) throw new Error("El servicio o profesional no está sincronizado. No se ha creado ni modificado ninguna reserva.");
  return result;
}
function quoteIds(quote: CatalogQuote, source: Source, remote: boolean): CatalogQuote {
  const item = (id: string) => linked(source.serviceLinks, id, remote);
  // A product/association without an explicit persisted link must be synchronized;
  // never silently discard an accepted add-on or calculate its price locally.
  return {...quote, businessId:remote ? source.businessId : source.sourceId, rootIds:quote.rootIds.map(item),serviceIds:quote.serviceIds.map(item),
    lines:quote.lines.map(line=>({...line,itemId:item(line.itemId)})),
    options:quote.options.map(option=>({...option,sourceId:item(option.sourceId),itemId:item(option.itemId)}))};
}
function remoteInput<T extends Omit<Booking,"id"|"status"|"holdExpiresAt"|"paymentStatus">>(input:T, source:Source):T {
  if (input.businessId !== source.sourceId || input.customerId !== undefined && input.customerId !== "me" && !cloud(input.customerId)) throw new Error("La reserva no corresponde a esta empresa o participante.");
  return {...input,registeredSourceId:source.sourceId,businessId:source.businessId,bookableItemId:linked(source.serviceLinks,input.bookableItemId,true),
    staffId:input.staffId ? linked(source.staffLinks,input.staffId,true) : undefined,
    services:input.services?.map(service=>({...service,id:linked(source.serviceLinks,service.id,true)})),
    catalogSnapshot:input.catalogSnapshot ? quoteIds(input.catalogSnapshot,source,true) : undefined};
}
function localBooking(row: Booking, source:Source, data:BusinessDemoData):DemoBooking {
  if(row.businessId!==source.businessId||row.customerId!==data.ownerUserId)throw new Error("La reserva pertenece a otra empresa o participante. No se modifica su copia local.");
  const old=data.bookings.find(b=>b.id===row.id || source.bookingLinks.some(l=>l.id===row.id&&l.sourceId===b.id));
  const staffId=row.staffId ? linked(source.staffLinks,row.staffId,false) : undefined;
  const member=source.staffLinks.find(l=>l.id===row.staffId), element=member?.sourceId ? businessDemoProfessionalElement(data,{id:member.sourceId}) : undefined;
  if (!element) throw new Error("El profesional de la reserva no tiene su puesto vinculado. La reserva se conserva en el servidor.");
  const startDatetime=row.startInstant?businessWallTime(row.startInstant,source.timezone):row.startDatetime;
  const endDatetime=row.endInstant?businessWallTime(row.endInstant,source.timezone):row.endDatetime;
  return {...old,...row,startDatetime,endDatetime,id:old?.id ?? row.id,serverBookingId:row.id,businessId:source.sourceId,staffId,
    bookableItemId:linked(source.serviceLinks,row.bookableItemId,false),
    services:row.services?.map(service=>({...service,id:linked(source.serviceLinks,service.id,false)})),
    catalogSnapshot:row.catalogSnapshot ? quoteIds(row.catalogSnapshot,source,false) : old?.catalogSnapshot, paymentStatus:old?.paymentStatus ?? row.paymentStatus, receipt:{...row.receipt,...old?.receipt},
    professionalName:row.receipt?.staffName ?? old?.professionalName,serviceTitle:row.receipt?.serviceName ?? old?.serviceTitle,
    elementId:old?.elementId ?? element.id,source:old?.source ?? "customer",createdAt:old?.createdAt ?? Date.now(),
    slotKey:[source.sourceId,staffId ?? "any",startDatetime.slice(0,10),startDatetime.slice(11,16),endDatetime.slice(11,16)].join("|")};
}

/** Same catalog and calendar projection; all availability and commitments use
 * the existing server timeline/negotiation. Network failures never fall back. */
export function withRegisteredBookingAuthority(base:DemoBookingRepository, store:BusinessDemoStore,
  project:(data:BusinessDemoData,booking:DemoBooking)=>void):DemoBookingRepository {
  const save = async(row:Booking,source:Source) => {
    const snapshot=await store.load(),candidate=localBooking(row,source,snapshot),old=snapshot.bookings.find(b=>b.id===candidate.id);
    if(old&&JSON.stringify(old)===JSON.stringify(candidate))return old;
    return store.transactBookings(data=>{
    const next=localBooking(row,source,data),index=data.bookings.findIndex(b=>b.id===next.id);
    if(index<0)data.bookings.push(next);else data.bookings[index]=next;
    project(data,next);return next;
    });
  };
  const known = async(id:string,source:Source) => {
    const data=await store.load(),local=data.bookings.find(b=>b.id===id || b.serverBookingId===id || data.reservations.some(r=>r.id===id&&store.reservationBookingId(r)===b.id));
    const remote=local?.serverBookingId ?? source.bookingLinks.find(l=>l.sourceId===local?.id)?.id ?? (cloud(id)?id:undefined);
    if(!remote)throw new Error("Esta reserva anterior aún necesita sincronizarse. Se conserva sin cambios.");
    const row=(await getLiveBusinessBookings(source.businessId)).find(b=>b.id===remote);
    if(!row)throw new Error("No se pudo recuperar esta reserva del servidor. Se conserva sin cambios.");return row;
  };
  const change:DemoBookingRepository["changeBooking"]=async(id,businessId,actor,operation,input={})=>{
    if(businessId!==store.businessId)throw new Error("Reserva de otra empresa.");
    const source=await sourceFor(store),row=await known(id,source);
    return save(await changeBookingRequest(row.id,operation,{...input,expectedRevision:row.changeRevision},store.ownerUserId),source);
  };
  return {...base,
    getStaff:async id=>{
      if(id!==store.businessId)throw new Error("Empresa incorrecta.");const source=await sourceFor(store);
      return (await getOwnedStaff(source.businessId)).filter(p=>p.active).map(p=>({...p,businessId:id,id:linked(source.staffLinks,p.id,false),serviceIds:p.serviceIds?.map(value=>linked(source.serviceLinks,value,false))}));
    },
    getBookableItems:async id=>{
      if(id!==store.businessId)throw new Error("Empresa incorrecta.");const source=await sourceFor(store);
      return (await getOwnedBookableItems(source.businessId)).filter(s=>s.active&&s.visible).map(s=>({...s,businessId:id,id:linked(source.serviceLinks,s.id,false)}));
    },
    quoteCatalog:async(id,roots,selected=[])=>{
      if(id!==store.businessId)throw new Error("Empresa incorrecta.");const source=await sourceFor(store);
      return quoteIds(await quoteCatalog(source.businessId,roots.map(value=>linked(source.serviceLinks,value,true)),selected,source.sourceId),source,false);
    },
    getAllSlots:async(id,item,date,professional,services=[item])=>{
      if(id!==store.businessId||services[0]!==item)throw new Error("Selección incorrecta.");const source=await sourceFor(store);
      const result=await getTimelineAvailability(source.businessId,services.map(value=>linked(source.serviceLinks,value,true)),date,professional?linked(source.staffLinks,professional,true):undefined,{registeredSourceId:source.sourceId});
      return result.slots.map(slot=>({...slot,staffId:slot.staffId?linked(source.staffLinks,slot.staffId,false):undefined}));
    },
    getAvailableDates:async(id,services,date,professional,days)=>{
      if(id!==store.businessId)throw new Error("Empresa incorrecta.");const source=await sourceFor(store);
      return (await getTimelineAvailability(source.businessId,services.map(value=>linked(source.serviceLinks,value,true)),date,professional?linked(source.staffLinks,professional,true):undefined,{days,datesOnly:true,registeredSourceId:source.sourceId})).availableDates;
    },
    createHold:async input=>{
      const source=await sourceFor(store),candidate=remoteInput(input,source);
      const result=await createHold(candidate);
      if(!result.ok)return result;
      // Review only, no local or server commitment before explicit confirmation.
      return {ok:true,booking:{...input,id:result.booking.id,status:"HOLD",paymentStatus:"none",holdExpiresAt:result.booking.holdExpiresAt}};
    },
    claimSlot:async input=>{
      if(input.status!=="CONFIRMED")throw new Error("Revisa la reserva antes de confirmar.");
      const source=await sourceFor(store),candidate=remoteInput(input,source);
      if(!candidate.timingSnapshot || !candidate.startInstant || !candidate.endInstant)throw new BookingApiError("Vuelve a consultar los horarios disponibles.",409,"STALE_AVAILABILITY");
      const result=await claimSlot(candidate);
      if(!result.ok)return result;
      return {ok:true,booking:await save(result.booking,source)};
    },
    changeBooking:change,
    cancelBooking:async id=>{
      if(!cloud(id)&&!(await store.load()).bookings.some(b=>b.id===id))return; // Review-only HOLD has nothing to cancel.
      const source=await sourceFor(store),row=await known(id,source);
      await save(await changeBookingRequest(row.id,"cancel",{expectedRevision:row.changeRevision},store.ownerUserId),source);
    },
    cancelCustomerEntry:async(id,businessId=store.businessId)=>{
      if(businessId!==store.businessId)throw new Error("Reserva de otra empresa.");const source=await sourceFor(store),row=await known(id,source);
      await save(await changeBookingRequest(row.id,"cancel",{expectedRevision:row.changeRevision},store.ownerUserId),source);
    },
    getMyBookings:async(customer=store.ownerUserId)=>{
      if(customer!==store.ownerUserId)throw new Error("Participante incorrecto.");
      const existing=await store.load();if(!existing.config.services.length&&!existing.bookings.length)return [];
      let source:Source;
      try{source=await sourceFor(store);}catch(error){
        // Reading an old unregistered document is historical preservation only;
        // availability/confirmation never catch or fall back on this error.
        if(error instanceof BookingApiError&&error.code==="BOOKING_CALENDAR_BUSINESS_NOT_LINKED")return existing.bookings;
        throw error;
      }
      const rows=await getLiveBusinessBookings(source.businessId);
      // Preserve unresolved historical local records, never delete them on refresh.
      const snapshot=await store.load(),selected=rows.filter(b=>b.customerId===customer);
      const changed=selected.filter(row=>{const candidate=localBooking(row,source,snapshot),old=snapshot.bookings.find(b=>b.id===candidate.id);return !old||JSON.stringify(old)!==JSON.stringify(candidate);});
      if(changed.length)await store.transactBookings(data=>{for(const row of changed){const candidate=localBooking(row,source,data),index=data.bookings.findIndex(b=>b.id===candidate.id);if(index<0)data.bookings.push(candidate);else data.bookings[index]=candidate;project(data,candidate);}});
      return (await store.load()).bookings.filter(b=>b.status!=="EXPIRED"&&(b.status!=="HOLD"||b.source==="floor"));
    },
  };
}

/** Prevent manual/calendar writers bypassing server confirmation through the
 * shared local projection. Existing untouched historical bookings are retained. */
export async function validateRegisteredBookingChanges(store:Identity,before:BusinessDemoData,next:BusinessDemoData):Promise<void>{
  const key=(b:Booking)=>JSON.stringify([b.bookableItemId,b.services?.map(s=>s.id),b.staffId,b.startDatetime,b.endDatetime,b.status,b.unitsReserved,b.peopleCount]);
  const changed=next.bookings.filter(b=>{const old=before.bookings.find(a=>a.id===b.id);return !old||key(old)!==key(b);});
  const removed=before.bookings.filter(b=>!next.bookings.some(a=>a.id===b.id));
  if(removed.length)throw new Error("No se puede borrar una reserva del servidor desde su copia local.");
  if(!changed.length)return;
  const source=await sourceFor(store),rows=await getLiveBusinessBookings(source.businessId);
  for(const local of changed){
    const remoteId=local.serverBookingId ?? source.bookingLinks.find(l=>l.sourceId===local.id)?.id ?? local.id;
    const row=rows.find(b=>b.id===remoteId);
    if(!row||row.status!==local.status||(row.startInstant?businessWallTime(row.startInstant,source.timezone):row.startDatetime)!==local.startDatetime||(row.endInstant?businessWallTime(row.endInstant,source.timezone):row.endDatetime)!==local.endDatetime||
      linked(source.serviceLinks,row.bookableItemId,false)!==local.bookableItemId||row.unitsReserved!==local.unitsReserved||row.peopleCount!==local.peopleCount||JSON.stringify((row.services??[{id:row.bookableItemId}]).map(s=>linked(source.serviceLinks,s.id,false)))!==JSON.stringify((local.services??[{id:local.bookableItemId}]).map(s=>s.id))||
      (row.staffId?linked(source.staffLinks,row.staffId,false):undefined)!==local.staffId)
      throw new Error("La reserva debe confirmarse o modificarse en el servidor. Actualiza la disponibilidad; no se ha guardado una confirmación local.");
  }
}
