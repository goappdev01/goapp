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
export function createDemoBookingRepository(store: BusinessDemoStore, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  const serviceId = (name: string) => `${store.businessId}_service_${token(name)}`;
  const servicesFor = (config: BusinessConfig): BookableItem[] => {
    const seen = new Set<string>();
    return config.services.filter(service => service.name.trim() && service.duration > 0 && Number.isFinite(service.duration) && service.price >= 0).filter(service => {
      const id = serviceId(service.name); if (seen.has(id)) return false; seen.add(id); return true;
    }).map(service => ({ id: serviceId(service.name), businessId: store.businessId, title: service.name,
      type: config.subId ?? config.sectorId ?? "demo", durationMinutes: service.duration, customerCapacity: service.capacity ?? 1,
      unitQuantity: 1, price: service.price, currency: "EUR", priceKnown: true, paymentRequired: false, active: true, visible: true }));
  };
  const staffFor = (config: BusinessConfig): Staff[] => getBusinessDemoProfessionals(config,store.businessId);
  const companyShifts = (config: BusinessConfig, dateISO: string) => getBusinessDemoShifts(config,dateISO);
  const professionalShifts = (config: BusinessConfig, dateISO: string, member?: Staff) => getBusinessDemoShifts(config,dateISO,member);
  const businessFor = (data: BusinessDemoData): Business | null => getBusinessDemoSetupState(data.config, data.plan).ready ? ({
    id: store.businessId, name: data.config.businessName, category: data.config.subId ?? data.config.sectorId ?? "demo",
    location: data.config.address || (data.config.coordinates ? `${data.config.coordinates.latitude}, ${data.config.coordinates.longitude}` : ""),
    phone: data.config.phoneE164 ?? data.config.phone ?? "", whatsapp: data.config.whatsappE164 ?? data.config.whatsapp,
    bookingActive: true, bookingColor: "#3D9A84", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "Europe/Madrid", createdAt: "",
  }) : null;
  const requireBusiness = (id: string) => { if (id !== store.businessId) throw new Error("DEMO no puede consultar empresas reales."); };
  const resourceOptions = (data: BusinessDemoData, service: BookableItem, member?: Staff) => {
    const allElements = data.plan?.elements ?? [];
    const elements = allElements.filter(element => !element.demoArchived && !(data.config.sectorId && businessDemoElementRequiresReview(element)) && element.reservable && !["bloqueado", "ocupado", "mantenimiento"].includes(element.status));
    const allStaff = staffFor(data.config);
    const staff = member ? [member] : allStaff.filter(p => p.active && (!p.serviceIds?.length || p.serviceIds.includes(service.id)));
    if (member && (!member.active || member.serviceIds?.length && !member.serviceIds.includes(service.id))) return [];
    if (!staff.length) return member || allStaff.length ? [] : elements.map(element => ({ elementId: element.id, staff: undefined as Staff | undefined }));
    return staff.flatMap(person => {
      const element = businessDemoProfessionalElement(data, person);
      return element && elements.some(value => value.id === element.id) ? [{ elementId: element.id, staff: person }] : [];
    });
  };
  const freeResource = (data: BusinessDemoData, service: BookableItem, candidate: { startDatetime: string; endDatetime: string }, member?: Staff, excludeId?: string, elementId?: string) => {
    const dateISO = candidate.startDatetime.slice(0,10), start = minutes(candidate.startDatetime.slice(11,16)), end = minutes(candidate.endDatetime.slice(11,16));
    return resourceOptions(data, service, member).find(resource => {
      if (elementId && resource.elementId !== elementId) return false;
      const shifts = professionalShifts(data.config, dateISO, resource.staff);
      if (!shifts.some(shift => start >= shift.from && end <= shift.to)) return false;
      return !data.bookings.some(booking => booking.id !== excludeId && blocks(booking, now()) && overlap(booking, candidate)
        && (booking.elementId === resource.elementId || resource.staff && booking.staffId === resource.staff.id));
    });
  };
  const slotsFor = (data: BusinessDemoData, itemId: string, dateISO: string, id?: string): SlotWithStatus[] => {
    if (!dateValid(dateISO) || !businessFor(data)) return [];
    const item = servicesFor(data.config).find(service => service.id === itemId); if (!item || item.durationMinutes <= 0) return [];
    const member = id ? staffFor(data.config).find(person => person.id === id) : undefined; if (id && !member) return [];
    const shifts = companyShifts(data.config, dateISO), slots: SlotWithStatus[] = [], seen = new Set<string>();
    for (const shift of shifts) for (let start=shift.from; start+item.durationMinutes<=shift.to; start+=item.durationMinutes) {
      const candidate = { startDatetime: iso(dateISO,start), endDatetime: iso(dateISO,start+item.durationMinutes) };
      if (!isValidDemoLocalInterval(candidate.startDatetime, candidate.endDatetime, item.durationMinutes) || Date.parse(candidate.startDatetime) <= now() || seen.has(candidate.startDatetime)) continue; seen.add(candidate.startDatetime);
      const available = resourceOptions(data,item,member).filter(resource => freeResource(data,item,candidate,resource.staff,undefined,resource.elementId));
      slots.push({ ...candidate, availableUnits: available.length, totalUnits: resourceOptions(data,item,member).length,
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
      customerName: index >= 0 ? data.reservations[index].customerName : "Cliente DEMO local", date: booking.startDatetime.slice(0,10), dateISO: booking.startDatetime.slice(0,10),
      time: booking.startDatetime.slice(11,16), endDatetime: booking.endDatetime,
      durationMinutes: (Date.parse(booking.endDatetime)-Date.parse(booking.startDatetime))/60000,
      serviceId: booking.bookableItemId, staffId: booking.staffId, professionalName: booking.professionalName,
      status: ["CANCELLED", "REJECTED"].includes(booking.status) ? "cancelada" : "confirmada", createdAt: booking.createdAt ?? now(), notes: booking.notes,
    };
    if (index >= 0) data.reservations[index] = reservation; else data.reservations.push(reservation);
  };
  const claim = async (input: Partial<DemoBooking> & BookingInput & { status: Booking["status"] }): Promise<ClaimResult> => store.transactBookings(data => {
    requireBusiness(input.businessId);
    if (input.customerId !== store.ownerUserId) throw new Error("La reserva DEMO requiere el UUID de su propietario.");
    const existing = input.id ? data.bookings.find(booking => booking.id === input.id) : undefined;
    if (existing && (existing.bookableItemId !== input.bookableItemId || existing.startDatetime !== input.startDatetime || existing.endDatetime !== input.endDatetime
      || existing.staffId !== input.staffId || existing.elementId !== input.elementId || existing.unitsReserved !== input.unitsReserved
      || existing.peopleCount !== input.peopleCount || (existing.notes ?? "") !== (input.notes ?? "")))
      throw new Error("No se puede sustituir una reserva DEMO por otra selección.");
    if (existing?.status === "CONFIRMED" && input.status === "CONFIRMED") return { ok: true, booking: clone(existing) };
    if (!businessFor(data)) throw new Error("Completa la configuración DEMO antes de reservar.");
    const item = servicesFor(data.config).find(service => service.id === input.bookableItemId); if (!item) throw new Error("Servicio DEMO no disponible.");
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
    const resource = freeResource(data,item,input,member,input.id,existing?.elementId);
    if (!resource) {
      const conflict = data.bookings.find(booking => booking.id !== input.id && blocks(booking,now()) && overlap(booking,input));
      if (conflict) return { ok:false, conflict:clone(conflict) };
      throw new Error("Esta hora o puesto no está disponible en el horario configurado.");
    }
    const id = existing?.id ?? `demo_booking_${store.businessId}_${now()}_${Math.random().toString(36).slice(2,10)}`;
    const booking: DemoBooking = { ...clone(input), id, customerId:store.ownerUserId, paymentStatus:"none", elementId:existing?.elementId ?? resource.elementId,
      staffId:existing?.staffId ?? resource.staff?.id, professionalName:existing?.professionalName ?? resource.staff?.name,
      serviceTitle:item.title, source:"customer", createdAt:existing?.createdAt ?? now(), holdExpiresAt:input.status === "HOLD" ? new Date(now()+300000).toISOString() : undefined,
      goEntryId:`demo_customer_${id}`, slotKey:`${store.businessId}|${resource.staff?.id ?? "any"}|${dateISO}|${input.startDatetime.slice(11,16)}|${input.endDatetime.slice(11,16)}` };
    const index = data.bookings.findIndex(value => value.id === id); if (index>=0) data.bookings[index]=booking; else data.bookings.push(booking);
    syncReservation(data,booking); return { ok:true, booking:clone(booking) };
  });
  return {
    ownerUserId:store.ownerUserId, businessId:store.businessId, store,
    getActiveBusinesses: async () => { const data=await store.load(), business=businessFor(data); return business ? [business] : []; },
    searchBusinesses: async (query:string) => { const data=await store.load(), business=businessFor(data); if (!business) return [];
      const text=normalized([business.name,business.category,data.config.sectorId,data.config.address,...data.config.services.map(service=>service.name)].join(" "));
      return !query.trim() || normalized(query.trim()).split(/\s+/).every(term=>text.includes(term)) ? [business] : []; },
    getBookableItems: async (id:string) => { requireBusiness(id); return servicesFor((await store.load()).config); },
    getStaff: async (id:string) => { requireBusiness(id); return staffFor((await store.load()).config).filter(person => person.active); },
    getAllSlots: async (id:string,item:string,date:string,professional?:string) => { requireBusiness(id); return slotsFor(await store.load(),item,date,professional); },
    createHold: (input:BookingInput) => claim({...input,status:"HOLD"}),
    claimSlot: (input:DemoBooking) => claim(input),
    cancelBooking: (id:string) => store.transactBookings(data=> { const booking=data.bookings.find(value=>value.id===id);
      if (!booking) return; booking.status="CANCELLED"; syncReservation(data,booking); }),
    cancelCustomerEntry: (reservationId:string, businessId = store.businessId) => store.transactBookings(data => {
      requireBusiness(businessId);
      const reservation = data.reservations.find(value => value.id === reservationId);
      if (!reservation) throw new Error("Reserva DEMO no disponible.");
      const id = store.reservationBookingId(reservation);
      const booking = data.bookings.find(value => value.id === id);
      if (!booking) throw new Error("Reserva DEMO no disponible.");
      booking.status = "CANCELLED"; syncReservation(data,booking);
    }),
    getMyBookings: async (customerId=store.ownerUserId) => { if (customerId!==store.ownerUserId) throw new Error("Identidad DEMO diferente.");
      return (await store.load()).bookings.filter(booking=>booking.status!=="EXPIRED" && (booking.status!=="HOLD" || booking.source==="floor")).map(clone); },
    getCustomerEntries: () => store.getSnapshot().entries.filter(entry=>!entry.deleted).map(entry=> ({ ...entry,
      id:`demo_customer_${entry.reservationId}`, type:"GO_BOOKING", kind:"received", contactName:store.getSnapshot().config.businessName,
      place:store.getSnapshot().config.address, demoLocal:true } as GoEntry)),
  };
}
export type DemoBookingRepository = ReturnType<typeof createDemoBookingRepository>;





/** Aggregate the existing repositories; every mutation dispatches to an isolated DEMO document. */
export function createDemoCatalogBookingRepository(catalog: import("./businessDemoCatalog").BusinessDemoCatalog, options: { now?: () => number } = {}): DemoBookingRepository {
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
    getAllSlots: (id, item, date, professional) => forBusiness(id).getAllSlots(id, item, date, professional),
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
