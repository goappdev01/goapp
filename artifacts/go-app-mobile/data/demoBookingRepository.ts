import { summarizeBookingServices, bookingServiceIds, staffSupportsBookingServices } from "./bookingServices";
import { localCatalogQuote } from "./bookingServices";
import type { CatalogAssociation, CatalogQuote } from "./catalogAssociations";
import type { BusinessConfig } from "@/contexts/GoBusinessConfigContext";
import type { Business, BookableItem, Staff, SlotWithStatus, Booking } from "./booking";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { BusinessDemoStore, BusinessDemoData, DemoBooking, DemoReservation } from "./businessDemoStore";
import { getBusinessDemoSetupState, isValidDemoLocalDate, isValidDemoLocalInterval, getBusinessDemoProfessionals, getBusinessDemoShifts, businessDemoProfessionalElement, businessDemoElementRequiresReview } from "./businessDemoStore";

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const token = (value: string) => Array.from(value.normalize("NFKC").trim().toLowerCase()).map(char => char.codePointAt(0)!.toString(16)).join("_");
const normalized = (value: string) => value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const minutes = (time: string) => { const [h,m] = time.split(":").map(Number); return h * 60 + m; };
const time = (value: number) => `${String(Math.floor(value / 60)).padStart(2,"0")}:${String(value % 60).padStart(2,"0")}`;
const iso = (dateISO: string, value: number) => `${dateISO}T${time(value)}:00`;
const overlap = (a: { startDatetime: string; endDatetime: string }, b: { startDatetime: string; endDatetime: string }) => a.startDatetime < b.endDatetime && a.endDatetime > b.startDatetime;
const blocks = (booking: Booking, now: number) => ["CONFIRMED", "ACCEPTED", "COMPLETED", "BLOCKED"].includes(booking.status)
  || booking.status === "HOLD" && (!booking.holdExpiresAt || Date.parse(booking.holdExpiresAt) > now);
const dateValid = isValidDemoLocalDate;
type ClaimResult = { ok: true; booking: DemoBooking } | { ok: false; conflict: DemoBooking };
type BookingInput = Omit<Booking, "id" | "status" | "holdExpiresAt" | "paymentStatus">;

/** Local-only facade for the existing customer booking screen. Nothing delegates to a live repository. */
type RepositoryDisplayOptions = { now?: () => number; customerIdentity?: () => Promise<{id:string;name:string;phone:string}> };
export function createDemoBookingRepository(store: BusinessDemoStore, options: RepositoryDisplayOptions = {}) {
  const now = options.now ?? Date.now;
  const serviceId = (name: string) => `${store.businessId}_service_${token(name)}`;
  const servicesFor = (config: BusinessConfig): BookableItem[] => {
    const seen = new Set<string>();
    return config.services.filter(service => service.name.trim() && service.duration > 0 && Number.isFinite(service.duration) && service.price >= 0).filter(service => {
      const id = serviceId(service.name); if (seen.has(id)) return false; seen.add(id); return true;
    }).map(service => ({ id: serviceId(service.name), businessId: store.businessId, title: service.name,
      ...(service.description ? { description: service.description } : {}),
      type: config.subId ?? config.sectorId ?? "demo", durationMinutes: service.duration, customerCapacity: service.capacity ?? 1,
      unitQuantity: 1, price: service.price, currency: "EUR", priceKnown: true, paymentRequired: false, active: true, visible: true }));
  };
  const staffFor = (config: BusinessConfig): Staff[] => getBusinessDemoProfessionals(config,store.businessId);
  const catalogFor = (config: BusinessConfig) => [...servicesFor(config), ...(config.catalogProducts ?? []).filter(item => item.businessId === store.businessId)];
  const quoteFor = (config: BusinessConfig, roots: string[], selected: string[] = []) => localCatalogQuote(store.businessId, catalogFor(config), config.catalogAssociations ?? [], roots, selected);
  const companyShifts = (config: BusinessConfig, dateISO: string) => getBusinessDemoShifts(config,dateISO);
  const professionalShifts = (config: BusinessConfig, dateISO: string, member?: Staff) => getBusinessDemoShifts(config,dateISO,member);
  const businessFor = (data: BusinessDemoData): Business | null => getBusinessDemoSetupState(data.config, data.plan).ready ? ({
    id: store.businessId, name: data.config.businessName, category: data.config.subId ?? data.config.sectorId ?? "demo",
    location: data.config.address || (data.config.coordinates ? `${data.config.coordinates.latitude}, ${data.config.coordinates.longitude}` : ""),
    phone: data.config.phoneE164 ?? data.config.phone ?? "", whatsapp: data.config.whatsappE164 ?? data.config.whatsapp,
    bookingActive: true, bookingColor: "#3D9A84", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid", createdAt: "",
  }) : null;
  const requireBusiness = (id: string) => { if (id !== store.businessId) throw new Error("DEMO no puede consultar empresas reales."); };
  const resourceOptions = (data: BusinessDemoData, service: BookableItem, member?: Staff, serviceIds = [service.id]) => {
    const allElements = data.plan?.elements ?? [];
    const elements = allElements.filter(element => !element.demoArchived && !(data.config.sectorId && businessDemoElementRequiresReview(element)) && element.reservable && !["bloqueado", "ocupado", "mantenimiento"].includes(element.status));
    const allStaff = staffFor(data.config);
    const staff = member ? [member] : allStaff.filter(p => staffSupportsBookingServices(p, serviceIds));
    if (member && !staffSupportsBookingServices(member, serviceIds)) return [];
    if (!staff.length) return member || allStaff.length ? [] : elements.map(element => ({ elementId: element.id, staff: undefined as Staff | undefined }));
    return staff.flatMap(person => {
      const element = businessDemoProfessionalElement(data, person);
      return element && elements.some(value => value.id === element.id) ? [{ elementId: element.id, staff: person }] : [];
    });
  };
  const freeResource = (data: BusinessDemoData, service: BookableItem, candidate: { startDatetime: string; endDatetime: string }, member?: Staff, excludeId?: string, elementId?: string, serviceIds = [service.id]) => {
    const dateISO = candidate.startDatetime.slice(0,10), start = minutes(candidate.startDatetime.slice(11,16)), end = minutes(candidate.endDatetime.slice(11,16));
    return resourceOptions(data, service, member, serviceIds).find(resource => {
      if (elementId && resource.elementId !== elementId) return false;
      const shifts = professionalShifts(data.config, dateISO, resource.staff);
      if (!shifts.some(shift => start >= shift.from && end <= shift.to)) return false;
      return !data.bookings.some(booking => booking.id !== excludeId && blocks(booking, now()) && overlap(booking, candidate)
        && (booking.elementId === resource.elementId || resource.staff && booking.staffId === resource.staff.id));
    });
  };
  const slotsFor = (data: BusinessDemoData, itemId: string, dateISO: string, id?: string, serviceIds = [itemId]): SlotWithStatus[] => {
    if (!dateValid(dateISO) || !businessFor(data)) return [];
    if (serviceIds[0] !== itemId) return [];
    let item: BookableItem;
    try { item = summarizeBookingServices(servicesFor(data.config), serviceIds).item; } catch { return []; }
    const member = id ? staffFor(data.config).find(person => person.id === id) : undefined; if (id && !member) return [];
    const shifts = companyShifts(data.config, dateISO), slots: SlotWithStatus[] = [], seen = new Set<string>();
    for (const shift of shifts) for (let start=shift.from; start+item.durationMinutes<=shift.to; start+=item.durationMinutes) {
      const candidate = { startDatetime: iso(dateISO,start), endDatetime: iso(dateISO,start+item.durationMinutes) };
      if (!isValidDemoLocalInterval(candidate.startDatetime, candidate.endDatetime, item.durationMinutes) || Date.parse(candidate.startDatetime) <= now() || seen.has(candidate.startDatetime)) continue; seen.add(candidate.startDatetime);
      const available = resourceOptions(data,item,member,serviceIds).filter(resource => freeResource(data,item,candidate,resource.staff,undefined,resource.elementId,serviceIds));
      slots.push({ ...candidate, availableUnits: available.length, totalUnits: resourceOptions(data,item,member,serviceIds).length,
        isAvailable: available.length > 0, isBlocked: false });
    }
    return slots;
  };
  const syncReservation = (data: BusinessDemoData, booking: DemoBooking) => {
    // Interactive HOLDs do not appear as confirmed company requests or consume the entire floor forever.
    if (booking.status === "HOLD" || booking.status === "EXPIRED") return;
    const index = data.reservations.findIndex(reservation => (store.reservationBookingId(reservation)) === booking.id);
    if (!booking.elementId || !data.plan?.elements.some(element => element.id === booking.elementId)) throw new Error("La reserva necesita un puesto DEMO persistido.");
    const reservation: DemoReservation = {
      ...(index >= 0 ? data.reservations[index] : {}), id: index >= 0 ? data.reservations[index].id : booking.id,
      planId: store.planId, elementId: booking.elementId, bookingId: booking.id, customerId: store.ownerUserId,
      customerName: booking.receipt?.customerName || (index >= 0 ? data.reservations[index].customerName : ""), date: booking.startDatetime.slice(0,10), dateISO: booking.startDatetime.slice(0,10),
      time: booking.startDatetime.slice(11,16), endDatetime: booking.endDatetime,
      durationMinutes: (Date.parse(booking.endDatetime)-Date.parse(booking.startDatetime))/60000,
      serviceId: booking.bookableItemId, services: booking.services && clone(booking.services), staffId: booking.staffId, professionalName: booking.professionalName,
      status: ["CANCELLED", "REJECTED"].includes(booking.status) ? "cancelada" : "confirmada", createdAt: booking.createdAt ?? now(), notes: booking.notes,
    };
    if (index >= 0) data.reservations[index] = reservation; else data.reservations.push(reservation);
  };
  const claim = async (input: Partial<DemoBooking> & BookingInput & { status: Booking["status"] }): Promise<ClaimResult> => {
    const participant = input.status === "CONFIRMED" ? await options.customerIdentity?.() : undefined;
    if (participant && participant.id !== store.ownerUserId) throw new Error("La cuenta ha cambiado. Vuelve a confirmar la reserva.");
    return store.transactBookings(data => {
    requireBusiness(input.businessId);
    if (input.customerId !== store.ownerUserId) throw new Error("La reserva DEMO requiere el UUID de su propietario.");
    const existing = input.id ? data.bookings.find(booking => booking.id === input.id) : undefined;
    if (existing && (existing.bookableItemId !== input.bookableItemId || JSON.stringify(bookingServiceIds(existing)) !== JSON.stringify(bookingServiceIds(input)) || existing.startDatetime !== input.startDatetime || existing.endDatetime !== input.endDatetime
      || existing.staffId !== input.staffId || existing.elementId !== input.elementId || existing.unitsReserved !== input.unitsReserved
      || existing.peopleCount !== input.peopleCount || (existing.notes ?? "") !== (input.notes ?? "")))
      throw new Error("No se puede sustituir una reserva DEMO por otra selección.");
    if (existing?.status === "CONFIRMED" && input.status === "CONFIRMED") return { ok: true, booking: clone(existing) };
    if (!businessFor(data)) throw new Error("Completa la configuración DEMO antes de reservar.");
    const serviceIds = bookingServiceIds(input);
    let selection: ReturnType<typeof summarizeBookingServices>;
    try { selection = summarizeBookingServices(servicesFor(data.config), serviceIds); } catch { throw new Error("Servicio DEMO no disponible."); }
    let acceptedQuote: CatalogQuote | undefined;
    if (input.catalogSnapshot) {
      acceptedQuote = quoteFor(data.config, input.catalogSnapshot.rootIds, input.catalogSnapshot.selectedAssociationIds);
      if (JSON.stringify(acceptedQuote) !== JSON.stringify(input.catalogSnapshot) || JSON.stringify(acceptedQuote.serviceIds) !== JSON.stringify(serviceIds)) throw Error("El catálogo ha cambiado. Revisa la selección antes de confirmar.");
      selection.services = acceptedQuote.lines.filter(line => line.kind === "service").map(line => ({ id: line.itemId, title: line.name, durationMinutes: line.durationMinutes, price: line.charge, priceKnown: true, currency: line.currency }));
    } else if ((data.config.catalogAssociations ?? []).some(edge => edge.active && serviceIds.includes(edge.source_id))) throw Error("Revisa las opciones del servicio antes de reservar.");
    const item = selection.item;
    if (existing?.services && JSON.stringify(existing.services) !== JSON.stringify(selection.services)) throw new Error("Los servicios han cambiado. Vuelve a seleccionarlos antes de confirmar.");
    if (input.unitsReserved !== 1 || !Number.isInteger(input.peopleCount) || input.peopleCount < 1 || input.peopleCount > item.customerCapacity || (input.notes?.length ?? 0) > 4000)
      throw new Error("Cantidad de personas o notas DEMO no válidas.");
    const dateISO = input.startDatetime.slice(0,10), startDate = Date.parse(input.startDatetime);
    if (!dateValid(dateISO) || !isValidDemoLocalInterval(input.startDatetime, input.endDatetime, item.durationMinutes) || startDate <= now()
      || input.endDatetime.slice(0,10) !== dateISO)
      throw new Error("Elige una fecha futura y un horario válido para el servicio.");
    if (!["HOLD", "CONFIRMED"].includes(input.status)) throw new Error("Estado DEMO no permitido.");
    if (input.id && (!existing || existing.status !== "HOLD" || !blocks(existing,now()))) throw new Error("La selección de hora ha caducado. Elige otra vez.");

    const member = input.staffId ? staffFor(data.config).find(person => person.id === input.staffId) : undefined;
    if (input.staffId && !member) throw new Error("Profesional DEMO no disponible.");
    const resource = freeResource(data,item,input,member,input.id,existing?.elementId,serviceIds);
    if (!resource) {
      const conflict = data.bookings.find(booking => booking.id !== input.id && blocks(booking,now()) && overlap(booking,input));
      if (conflict) return { ok:false, conflict:clone(conflict) };
      throw new Error("Esta hora o puesto no está disponible en el horario configurado.");
    }
    const id = existing?.id ?? `demo_booking_${store.businessId}_${now()}_${Math.random().toString(36).slice(2,10)}`;
    const booking: DemoBooking = { ...clone(input), ...(participant ? {receipt:{...input.receipt,customerName:participant.name,customerPhone:participant.phone}} : {}), id, customerId:store.ownerUserId, paymentStatus:"none", elementId:existing?.elementId ?? resource.elementId,
      staffId:existing?.staffId ?? resource.staff?.id, professionalName:existing?.professionalName ?? resource.staff?.name,
      ...(serviceIds.length > 1 || acceptedQuote ? { services: clone(selection.services) } : {}),
      ...(acceptedQuote ? { catalogSnapshot: clone(acceptedQuote) } : {}),
      serviceTitle:item.title, source:"customer", createdAt:existing?.createdAt ?? now(), holdExpiresAt:input.status === "HOLD" ? new Date(now()+300000).toISOString() : undefined,
      goEntryId:`demo_customer_${id}`, slotKey:`${store.businessId}|${resource.staff?.id ?? "any"}|${dateISO}|${input.startDatetime.slice(11,16)}|${input.endDatetime.slice(11,16)}` };
    const index = data.bookings.findIndex(value => value.id === id); if (index>=0) data.bookings[index]=booking; else data.bookings.push(booking);
    syncReservation(data,booking); return { ok:true, booking:clone(booking) };
    });
  };
  // Negotiation is metadata on the existing booking, never another booking or occupied slot.
  const changeBooking = (id:string, businessId:string, actor:"customer"|"business", operation:"propose"|"accept"|"reject", input:{dateISO?:string;date?:string;time?:string;proposalId?:string;acceptFinancialTerms?:boolean} = {}) => store.transactBookings(data => {
    requireBusiness(businessId);
    if(actor!=="customer" && actor!=="business")throw new Error("Participante no válido.");
    const reservation=data.reservations.find(r=>r.id===id || store.reservationBookingId(r)===id);
    const booking=data.bookings.find(b=>b.id===(reservation?store.reservationBookingId(reservation):id));
    if(!booking || booking.customerId!==store.ownerUserId || booking.businessId!==businessId || !["CONFIRMED","ACCEPTED"].includes(booking.status))throw new Error("Reserva confirmada no disponible.");
    const previous=booking.changeProposal;
    const history=(outcome:"accepted"|"rejected"|"countered")=>{
      if(previous)booking.changeHistory=[...(booking.changeHistory ?? []),{proposal:clone(previous),outcome,actor,at:now()}];
    };
    if(operation!=="propose"){
      if(!previous || previous.id!==input.proposalId){
        const completed=booking.changeHistory?.find(e=>e.proposal.id===input.proposalId && e.outcome===(operation==="accept"?"accepted":"rejected") && e.actor===actor);
        if(!previous && completed)return clone(booking);
        throw new Error("La propuesta ha cambiado. Actualiza la reserva.");
      }
      if(previous.proposedBy===actor)throw new Error("La otra parte debe responder a la propuesta.");
      if(previous.originalStartDatetime!==booking.startDatetime || previous.originalEndDatetime!==booking.endDatetime)throw new Error("La reserva original ha cambiado.");
      if(operation==="reject"){
        history("rejected");delete booking.changeProposal;syncReservation(data,booking);return clone(booking);
      }
      if(previous.financialAcceptanceRequired && (!previous.proposerAcceptedFinancialTerms || !input.acceptFinancialTerms))throw new Error("Las condiciones económicas requieren aceptación expresa. No se ha modificado el pago.");
    }
    const dateISO=operation==="propose"?input.dateISO:previous!.dateISO,timeHHMM=operation==="propose"?input.time:previous!.time;
    const duration=(Date.parse(booking.endDatetime)-Date.parse(booking.startDatetime))/60000;
    if(!dateISO || !dateValid(dateISO) || !timeHHMM || !/^([01]\d|2[0-3]):[0-5]\d$/.test(timeHHMM))throw new Error("Elige una fecha y hora válidas.");
    const startDatetime=dateISO+"T"+timeHHMM+":00",end=new Date(Date.parse(startDatetime)+duration*60000);
    const endDatetime=end.getFullYear()+"-"+String(end.getMonth()+1).padStart(2,"0")+"-"+String(end.getDate()).padStart(2,"0")+"T"+String(end.getHours()).padStart(2,"0")+":"+String(end.getMinutes()).padStart(2,"0")+":00";
    if(!isValidDemoLocalInterval(startDatetime,endDatetime,duration) || Date.parse(startDatetime)<=now() || endDatetime.slice(0,10)!==dateISO)throw new Error("Elige una hora futura válida.");
    const serviceIds=bookingServiceIds(booking),item=summarizeBookingServices(servicesFor(data.config),serviceIds).item,member=staffFor(data.config).find(person=>person.id===booking.staffId);
    if(!item || item.durationMinutes!==duration || booking.staffId && !member || !freeResource(data,item,{startDatetime,endDatetime},member,booking.id,booking.elementId,serviceIds))throw new Error("Esta hora no está disponible para el servicio y profesional originales.");
    if(operation==="propose"){
      const financialAcceptanceRequired=booking.paymentStatus!=="none";
      if(financialAcceptanceRequired && !input.acceptFinancialTerms)throw new Error("Confirma las condiciones económicas. No se ha realizado ningún cobro ni devolución.");
      if(previous?.proposedBy===actor && previous.dateISO===dateISO && previous.time===timeHHMM)return clone(booking);
      history("countered");
      booking.changeProposal={id:"demo_change_"+now()+"_"+Math.random().toString(36).slice(2),proposedBy:actor,dateISO,date:input.date ?? dateISO,time:timeHHMM,duration:String(duration),proposedAt:now(),
        originalDateISO:booking.startDatetime.slice(0,10),originalDate:reservation?.date ?? booking.startDatetime.slice(0,10),originalTime:booking.startDatetime.slice(11,16),originalDuration:String(duration),
        originalStartDatetime:booking.startDatetime,originalEndDatetime:booking.endDatetime,financialAcceptanceRequired,proposerAcceptedFinancialTerms:!!input.acceptFinancialTerms};
    }else{
      history("accepted");booking.startDatetime=startDatetime;booking.endDatetime=endDatetime;
      booking.slotKey=store.businessId+"|"+(booking.staffId ?? "any")+"|"+dateISO+"|"+timeHHMM+"|"+endDatetime.slice(11,16);
      delete booking.changeProposal;
    }
    syncReservation(data,booking);return clone(booking);
  });
  return {
    ownerUserId:store.ownerUserId, businessId:store.businessId, store,
    getActiveBusinesses: async () => { const data=await store.load(), business=businessFor(data); return business ? [business] : []; },
    searchBusinesses: async (query:string) => { const data=await store.load(), business=businessFor(data); if (!business) return [];
      const text=normalized([business.name,business.category,data.config.sectorId,data.config.address,...data.config.services.map(service=>service.name)].join(" "));
      return !query.trim() || normalized(query.trim()).split(/\s+/).every(term=>text.includes(term)) ? [business] : []; },
    getBookableItems: async (id:string) => { requireBusiness(id); return servicesFor((await store.load()).config); },
    getCatalogItems: async (id:string) => { requireBusiness(id); return catalogFor((await store.load()).config); },
    quoteCatalog: async (id:string, roots:string[], selected:string[] = []) => { requireBusiness(id); return quoteFor((await store.load()).config, roots, selected); },
    manageAssociations: async (operation: "list" | "create" | "update" | "delete", input: Partial<CatalogAssociation> & { sourceId?: string; targetId?: string } = {}) => {
      if (operation === "list") return clone((await store.load()).config.catalogAssociations ?? []);
      await store.transformConfig(config => {
        const rows = clone(config.catalogAssociations ?? []), previous = rows.find(row => row.id === input.id);
        if (input.mode && !["included", "optional", "recommended"].includes(input.mode)) throw Error("Tipo de asociación no válido.");
        if (operation !== "create" && (!previous || previous.revision !== input.revision)) throw Error("La asociación ha cambiado. Actualiza el catálogo.");
        if (operation === "delete") return { ...config, catalogAssociations: rows.filter(row => row.id !== input.id) };
        const edge: CatalogAssociation = operation === "create" ? { id: `${store.businessId}_association_${now()}_${Math.random().toString(36).slice(2)}`, business_id: store.businessId, source_id: input.sourceId!, target_id: input.targetId!, mode: input.mode!, revision: 1, active: true }
          : { ...previous!, mode: input.mode ?? previous!.mode, active: input.active ?? previous!.active, revision: previous!.revision + 1 };
        const catalog = catalogFor(config);
        if (!catalog.some(item => item.id === edge.source_id) || !catalog.some(item => item.id === edge.target_id) || edge.source_id === edge.target_id || rows.some(row => row.id !== edge.id && row.source_id === edge.source_id && row.target_id === edge.target_id)) throw Error("Asociación no válida para esta empresa.");
        const graph = [...rows.filter(row => row.id !== edge.id), edge], reached = new Set([edge.target_id]);
        for (let pass = 0; pass < graph.length; pass++) for (const row of graph) if (reached.has(row.source_id)) reached.add(row.target_id);
        if (reached.has(edge.source_id)) throw Error("Las asociaciones no pueden formar un ciclo.");
        return { ...config, catalogAssociations: graph };
      });
      return clone(store.getSnapshot().config.catalogAssociations ?? []);
    },
    saveCatalogProduct: (item: BookableItem) => store.transformConfig(config => {
      requireBusiness(item.businessId);
      if (!item.id.startsWith(store.businessId + "_product_") || !item.title.trim() || !Number.isFinite(item.price) || item.price < 0 || item.durationMinutes !== 0 || item.catalogKind !== "product") throw Error("Producto no válido.");
      return { ...config, catalogProducts: [...(config.catalogProducts ?? []).filter(row => row.id !== item.id), clone(item)] };
    }),
    getStaff: async (id:string) => { requireBusiness(id); return staffFor((await store.load()).config).filter(person => person.active); },
    getAllSlots: async (id:string,item:string,date:string,professional?:string,serviceIds?:string[]) => { requireBusiness(id); return slotsFor(await store.load(),item,date,professional,serviceIds); },
    changeBooking,
    createHold: (input:BookingInput) => claim({...input,status:"HOLD"}),
    claimSlot: (input:DemoBooking) => claim(input),
    cancelBooking: (id:string) => store.transactBookings(data=> { const booking=data.bookings.find(value=>value.id===id);
      if (!booking) return; if(booking.changeProposal)booking.changeHistory=[...(booking.changeHistory ?? []),{proposal:clone(booking.changeProposal),outcome:"cancelled",actor:"customer",at:now()}]; delete booking.changeProposal; booking.status="CANCELLED"; syncReservation(data,booking); }),
    cancelCustomerEntry: (reservationId:string, businessId = store.businessId) => store.transactBookings(data => {
      requireBusiness(businessId);
      const reservation = data.reservations.find(value => value.id === reservationId);
      if (!reservation) throw new Error("Reserva DEMO no disponible.");
      const id = store.reservationBookingId(reservation);
      const booking = data.bookings.find(value => value.id === id);
      if (!booking) throw new Error("Reserva DEMO no disponible.");
      if(booking.changeProposal)booking.changeHistory=[...(booking.changeHistory ?? []),{proposal:clone(booking.changeProposal),outcome:"cancelled",actor:"customer",at:now()}];
      delete booking.changeProposal;booking.status = "CANCELLED"; syncReservation(data,booking);
    }),
    getMyBookings: async (customerId=store.ownerUserId) => { if (customerId!==store.ownerUserId) throw new Error("Identidad DEMO diferente.");
      return (await store.load()).bookings.filter(booking=>booking.status!=="EXPIRED" && (booking.status!=="HOLD" || booking.source==="floor")).map(clone); },
    getCustomerEntries: () => store.getSnapshot().entries.filter(entry=>!entry.deleted).map(entry=> ({ ...entry,
      id:`demo_customer_${entry.reservationId}`, type:"GO_BOOKING", kind:"received", businessBooking:false, bookingPerspective:"customer", contactName:store.getSnapshot().config.businessName,
      phone:store.getSnapshot().config.phoneE164 || store.getSnapshot().config.mobileE164 || store.getSnapshot().config.phone || store.getSnapshot().config.mobile || "", whatsapp:store.getSnapshot().config.whatsappE164 || store.getSnapshot().config.whatsapp,
      place:store.getSnapshot().config.address, intentKey:"generico", customerBooking:true, bookingStartsAt:store.getSnapshot().bookings.find(b=>b.id===store.reservationBookingId(store.getSnapshot().reservations.find(r=>r.id===entry.reservationId)!))?.startDatetime, bookingId:store.reservationBookingId(store.getSnapshot().reservations.find(r=>r.id===entry.reservationId)!),
      estado:entry.changeProposal ? (entry.changeProposal as import("./booking").BookingChangeProposal).proposedBy==="customer"?"propuesta_pendiente":"propuesto" : entry.estado, demoLocal:true } as GoEntry)),
  };
}
export type DemoBookingRepository = ReturnType<typeof createDemoBookingRepository>;





/** Aggregate the existing repositories; every mutation dispatches to an isolated DEMO document. */
export function createDemoCatalogBookingRepository(catalog: import("./businessDemoCatalog").BusinessDemoCatalog, options: RepositoryDisplayOptions = {}): DemoBookingRepository {
  const repositories = () => catalog.getStores().map(store => createDemoBookingRepository(store, options));
  const forBusiness = (id: string) => { const repo = repositories().find(value => value.businessId === id); if (!repo) throw new Error("Empresa ajena al catálogo DEMO."); return repo; };
  const forBooking = async (id: string) => {
    const candidates = [];
    for (const repo of repositories()) if ((await repo.store.load()).bookings.some(booking => booking.id === id)) candidates.push(repo);
    if (candidates.length !== 1) throw new Error("Reserva DEMO no disponible o ambigua."); return candidates[0];
  };
  const selected = createDemoBookingRepository(catalog.getSelectedStore(), options);
  return { ...selected, store: { ...selected.store, subscribe: catalog.subscribe },
    getActiveBusinesses: async () => (await Promise.all(repositories().map(repo => repo.getActiveBusinesses()))).flat(),
    searchBusinesses: async query => (await Promise.all(repositories().map(repo => repo.searchBusinesses(query)))).flat(),
    getBookableItems: id => forBusiness(id).getBookableItems(id), getStaff: id => forBusiness(id).getStaff(id),
    getCatalogItems: id => forBusiness(id).getCatalogItems(id),
    quoteCatalog: (id, roots, selected) => forBusiness(id).quoteCatalog(id, roots, selected),
    getAllSlots: (id, item, date, professional, serviceIds) => forBusiness(id).getAllSlots(id, item, date, professional, serviceIds),
    changeBooking: (id,businessId,actor,operation,input) => forBusiness(businessId).changeBooking(id,businessId,actor,operation,input),
    createHold: input => forBusiness(input.businessId).createHold(input), claimSlot: input => forBusiness(input.businessId).claimSlot(input),
    cancelBooking: async id => (await forBooking(id)).cancelBooking(id),
    cancelCustomerEntry: async (id, businessId) => {
      const candidates = repositories().filter(value => (!businessId || value.businessId === businessId) && value.store.getSnapshot().reservations.some(reservation => reservation.id === id));
      if (candidates.length !== 1) throw new Error("Reserva DEMO no disponible o ambigua. Selecciona su empresa.");
      await candidates[0].cancelCustomerEntry(id);
    },
    getMyBookings: async (customerId = catalog.ownerUserId) => (await Promise.all(repositories().map(repo => repo.getMyBookings(customerId)))).flat(),
    getCustomerEntries: () => repositories().flatMap(repo => repo.getCustomerEntries().map(entry => ({ ...entry, id: entry.id + "@" + repo.businessId }))),
  };
}
