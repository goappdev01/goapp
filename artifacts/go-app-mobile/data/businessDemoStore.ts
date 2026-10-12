import type { BusinessConfig } from "@/contexts/GoBusinessConfigContext";
import type { FloorElement, FloorPlan, FloorReservation } from "./floorPlan";
import type { Booking, Staff } from "./booking";
import type { GoEntry } from "@/components/AgendaOperativa";

export type DemoReservation = FloorReservation & {
  dateISO?: string; durationMinutes?: number; endDatetime?: string; serviceId?: string; staffId?: string;
  bookingId?: string; customerId?: string; professionalName?: string;
};
export type DemoBooking = Booking & { elementId?: string; professionalName?: string; serviceTitle?: string; createdAt?: number; source?: "floor" | "customer" };
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void> };
export type BusinessDemoData = {
  version: 1; ownerUserId: string; config: BusinessConfig; plan: FloorPlan | null;
  reservations: DemoReservation[]; bookings: DemoBooking[]; entries: GoEntry[]; preferences: Record<string, string>;
};
const queues = new Map<string, Promise<unknown>>();
const revisions = new Map<string, number>();
const preferenceKeys = new Set(["cal_density", "cal_show_hours", "go_cal_size_v1", "cal_day_night_mode_v1"]);
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const stamp = (dateISO: string, time: string) => `${dateISO}T${time}:00`;
const overlaps = (a: Booking, b: Booking) => a.startDatetime < b.endDatetime && a.endDatetime > b.startDatetime;
const blocking = (booking: Booking) => ["CONFIRMED", "ACCEPTED", "BLOCKED", "COMPLETED"].includes(booking.status)
  || booking.status === "HOLD" && (!booking.holdExpiresAt || Date.parse(booking.holdExpiresAt) > Date.now());
const addMinutes = (start: string, minutes: number) => {
  const date = new Date(start); date.setMinutes(date.getMinutes() + minutes);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}T${String(date.getHours()).padStart(2,"0")}:${String(date.getMinutes()).padStart(2,"0")}:00`;
};
/** Local wall-clock dates must survive parsing unchanged, including on DST transition days. */
export function isValidDemoLocalDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`), [year,month,day] = value.split("-").map(Number);
  return date.getFullYear() === year && date.getMonth() === month-1 && date.getDate() === day;
}
export function isValidDemoLocalInterval(start: string, end: string, durationMinutes: number): boolean {
  const validStamp = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d:00$/.test(value) || !isValidDemoLocalDate(value.slice(0,10))) return false;
    const date = new Date(value);
    return date.getHours() === Number(value.slice(11,13)) && date.getMinutes() === Number(value.slice(14,16));
  };
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || !validStamp(start) || !validStamp(end)) return false;
  const from = new Date(start), to = new Date(end);
  // No ambiguous clock transition is advertised as an ordinary local test slot.
  return to.getTime()-from.getTime() === durationMinutes*60000 && from.getTimezoneOffset() === to.getTimezoneOffset();
}
const normalizedDemoName = (value: string) => value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const demoNamedId = (businessId: string, kind: "staff" | "service", name: string) => businessId + "_" + kind + "_" + Array.from(name.normalize("NFKC").trim().toLowerCase()).map(char => char.codePointAt(0)!.toString(16)).join("_");

let staffSequence = 0;
/** Adopt legacy identities once; every later slot keeps its own persisted ID. */
export function ensureBusinessDemoStaffIds(items: BusinessConfig["plantillaItems"], businessId: string): BusinessConfig["plantillaItems"] {
  const used = new Set<string>(), prefix = businessId + "_staff_";
  return items.map(item => ({ ...item, staffIds: Array.from({ length: item.count }, (_, index) => {
    let id = item.staffIds?.[index];
    if (id && !id.startsWith(prefix)) throw new Error("Profesional DEMO de otra empresa.");
    if (!id && !item.staffIds) id = item.staffNames?.[index]?.trim()
      ? demoNamedId(businessId, "staff", item.staffNames[index])
      : prefix + "legacy_slot_" + encodeURIComponent(item.id) + "_" + index;
    if (!id || used.has(id)) id = prefix + "id_" + Date.now().toString(36) + "_" + (++staffSequence).toString(36) + "_" + Math.random().toString(36).slice(2);
    used.add(id); return id;
  }) }));
}

export const businessDemoElementRequiresReview = (element: FloorElement) => !element.demoKind && !element.demoStaffId && element.type === "silla" && element.height === 52;
export const visibleBusinessDemoElements = (plan: FloorPlan): FloorElement[] => plan.elements.filter(element => !element.demoArchived);
export function businessDemoProfessionalElement(data: BusinessDemoData, professional: { id: string }): FloorElement | undefined {
  return data.plan?.elements.find(element => !element.demoArchived && element.demoStaffId === professional.id);
}
/** Reconcile identifiable representations; keep ambiguous legacy/physical elements and all history. */
export function reconcileBusinessDemoProfessionalPlan(data: BusinessDemoData, createMissing = false): void {
  if (!data.plan) return;
  const people = getBusinessDemoProfessionals(data.config, data.plan.businessId), ids = new Map(people.map(person => [person.id, person]));
  const elements = data.plan.elements.map(element => ({ ...element }));
  const claimed = new Set(elements.filter(element => element.demoStaffId && ids.has(element.demoStaffId)).map(element => element.demoStaffId));
  for (const element of elements) {
    if (element.demoStaffId && !element.demoStaffId.startsWith(data.plan.businessId + "_staff_")) throw new Error("Vínculo del plano DEMO de otra empresa.");
    if (element.demoStaffId || element.demoKind === "physical" || element.demoArchived) continue;
    const history = data.bookings.filter(booking => booking.elementId === element.id && booking.staffId);
    const historyIds = [...new Set(history.map(booking => booking.staffId!).filter(id => id.startsWith(data.plan!.businessId + "_staff_")))];
    let id = historyIds.length === 1 ? historyIds[0] : undefined;
    // Name matching is a one-time legacy bridge only, never the ongoing identity.
    if (!id) {
      const candidates = people.filter(person => !claimed.has(person.id) && normalizedDemoName(person.name) === normalizedDemoName(element.label));
      if (candidates.length === 1 && elements.filter(value => !value.demoStaffId && normalizedDemoName(value.label) === normalizedDemoName(element.label)).length === 1) id = candidates[0].id;
    }
    if (id) {
      element.demoStaffId = id;
      const historicalName = history.find(booking => booking.staffId === id)?.professionalName;
      element.demoKind = element.type === "silla" && element.height === 52
        && (ids.has(id) || historicalName && normalizedDemoName(historicalName) === normalizedDemoName(element.label)) ? "professional" : "physical";
      claimed.add(id);
    }
  }
  const assigned = new Set<string>();
  for (const element of elements) {
    if (!element.demoStaffId) continue;
    const person = ids.get(element.demoStaffId);
    if (!person || assigned.has(element.demoStaffId)) {
      if (element.demoKind === "professional") { element.demoArchived = true; element.reservable = false; }
      else { delete element.demoStaffId; }
      continue;
    }
    assigned.add(person.id);
    if (element.demoKind === "professional") { element.label = person.name; element.demoArchived = false; }
  }
  if (createMissing) {
    let y = Math.max(0, ...elements.filter(element => !element.demoArchived).map(element => element.y + element.height)) + 24;
    let x = 10;
    for (const person of people) if (!assigned.has(person.id)) {
      const width = Math.max(90, person.name.length * 8 + 30);
      if (x > 10 && x + width > 390) { x = 10; y += 64; }
      const id = "demo_professional_element_" + person.id;
      elements.push({ id, type: "silla", label: person.name, capacity: 1, x, y, width, height: 52,
        status: "disponible", reservable: true, demoStaffId: person.id, demoKind: "professional", demoArchived: false });
      assigned.add(person.id); x += width + 12;
    }
  }
  data.plan = { ...data.plan, elements };
}

/** Shared company/professional rules used by both DEMO entry paths. */
export function getBusinessDemoProfessionals(config: BusinessConfig, businessId: string): Staff[] {
  const result: Staff[] = [], seen = new Set<string>();
  const services = config.services.filter(service => service.name.trim() && service.duration > 0 && Number.isFinite(service.duration) && service.price >= 0);
  for (const item of config.plantillaItems) for (let index = 0; index < Math.min(item.count, item.staffNames?.length ?? 0); index++) {
    const name = item.staffNames![index]?.trim();
    const id = item.staffIds?.[index] ?? demoNamedId(businessId, "staff", name ?? "");
    if (!name || seen.has(id)) continue;
    seen.add(id);
    const assigned = item.staffServices?.[index] ?? [];
    const serviceIds = assigned.length ? services.filter(service => assigned.some(value => normalizedDemoName(value) === normalizedDemoName(service.name))).map(service => demoNamedId(businessId, "service", service.name)) : [];
    result.push({ id, businessId, name, emoji: item.emoji,
      serviceIds, active: assigned.length === 0 || serviceIds.length > 0 });
  }
  return result;
}
export function getBusinessDemoShifts(config: BusinessConfig, dateISO: string, professional?: { id: string; name: string }): { from: number; to: number }[] {
  if (!isValidDemoLocalDate(dateISO)) return [];
  const day = String((new Date(dateISO + "T12:00:00").getDay() + 6) % 7);
  if (!config.activeDays.includes(Number(day))) return [];
  const parseMinutes = (value: string) => Number(value.slice(0,2))*60 + Number(value.slice(3,5));
  const validShifts = (source: Array<{ from: string; to: string; active: boolean }>) => source
    .filter(shift => shift?.active && /^([01]\d|2[0-3]):[0-5]\d$/.test(shift.from) && /^([01]\d|2[0-3]):[0-5]\d$/.test(shift.to))
    .map(shift => ({ from: parseMinutes(shift.from), to: parseMinutes(shift.to) })).filter(shift => shift.from < shift.to);
  const schedule = config.daySchedules?.[day];
  const company = validShifts(schedule ? [schedule.shift1, schedule.shift2] : [{ from: config.openFrom, to: config.openTo, active: true }]);
  if (!professional) return company;
  const legacyId = config.businessId + "_staff_" + professional.name.toLowerCase().replace(/\s+/g,"_").replace(/[^a-z0-9_]/g,"");
  const individual = config.staffSchedules?.[professional.id] ?? config.staffSchedules?.[legacyId];
  if (!individual || individual.useCompanySchedule) return company;
  const shifts = individual.daySchedules?.[day];
  if (!shifts) return [];
  return validShifts([shifts.shift1, shifts.shift2]).flatMap(shift => company
    .map(window => ({ from: Math.max(shift.from, window.from), to: Math.min(shift.to, window.to) }))).filter(shift => shift.from < shift.to);
}

export function businessDemoStorageKey(ownerUserId: string, companyId?: string): string {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ownerUserId))
    throw new Error("La prueba DEMO requiere una identidad autenticada válida.");
  if (companyId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) throw new Error("Identificador de empresa DEMO no válido.");
  return `go_owner_business_demo_v1:${ownerUserId.toLowerCase()}${companyId ? ":" + companyId.toLowerCase() : ""}`;
}
/** One owner-scoped local document. No live repositories, tokens or network fallbacks. */
export function createBusinessDemoStore(options: { ownerUserId: string; storage: Storage; canUse: () => boolean; initialConfig: BusinessConfig; companyId?: string; keepBackup?: boolean }) {
  const { ownerUserId, storage, canUse } = options;
  const key = businessDemoStorageKey(ownerUserId, options.companyId);
  const suffix = ownerUserId.toLowerCase() + (options.companyId ? "_" + options.companyId.toLowerCase() : "");
  const businessId = `demo_business_${suffix}`, planId = `demo_plan_${suffix}`;
  const configKeys = ["businessName", "address", "cartaUrl", "sectorId", "subId", "plantillaItems", "activeDays", "openFrom", "openTo", "daySchedules", "services", "paymentPolicy", "approvalPolicy", "cancelPolicy", "bookingEnabled", "completedSteps", "paymentMethod", "phone", "whatsapp", "staffSchedules", "countryCode", "mobile", "coordinates", "phoneE164", "mobileE164", "whatsappE164"] as const;
  const freshConfig = (): BusinessConfig => ({ ...clone(options.initialConfig), businessId, isBusinessActive: false });
  const fresh = (): BusinessDemoData => ({ version: 1, ownerUserId, config: freshConfig(), plan: null, reservations: [], bookings: [], entries: [], preferences: {} });
  let snapshot = fresh(), loaded = false, observedRevision = -1;
  const listeners = new Set<() => void>();
  const assertAllowed = () => { if (!canUse()) throw new Error("El contexto DEMO ya no está autorizado. Vuelve a seleccionar EMPRESA o USUARIO."); };
  const assertBusiness = (id: string) => { if (id !== businessId) throw new Error("La prueba DEMO no puede acceder a una empresa real."); };
  const assertPlan = (id: string) => { if (id !== planId) throw new Error("La prueba DEMO no puede acceder a un plano ajeno."); };
  const publish = (next: BusinessDemoData) => { snapshot = next; observedRevision = (revisions.get(key) ?? 0) + 1; revisions.set(key, observedRevision); for (const listener of listeners) listener(); };
  const enqueue = <T,>(operation: () => Promise<T>): Promise<T> => {
    const next = (queues.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => { assertAllowed(); return operation(); });
    queues.set(key, next.then(() => undefined, () => undefined)); return next;
  };
  const cleanConfig = (raw: Partial<BusinessConfig>): BusinessConfig => {
    if (raw.businessId !== undefined && raw.businessId !== businessId) assertBusiness(raw.businessId);
    const result = freshConfig();
    for (const field of configKeys) if (field in raw) Object.assign(result, { [field]: clone((raw as Record<string, unknown>)[field] ?? null) });
    result.businessId = businessId; result.isBusinessActive = false;
    result.plantillaItems = ensureBusinessDemoStaffIds(result.plantillaItems, businessId);
    // Preserve individual schedules stored under the older name-derived UI key.
    for (const person of getBusinessDemoProfessionals(result, businessId)) {
      const legacy = businessId + "_staff_" + person.name.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
      if (result.staffSchedules?.[legacy] && !result.staffSchedules[person.id]) result.staffSchedules[person.id] = clone(result.staffSchedules[legacy]);
    }
    return result;
  };
  const reservationBookingId = (reservation: DemoReservation) => reservation.bookingId ?? `demo_floor_booking_${options.companyId ? businessId + "_" : ""}${reservation.id}`;
  const bookingForReservation = (reservation: DemoReservation): DemoBooking => {
    const start = stamp(reservation.dateISO ?? "", reservation.time), duration = reservation.durationMinutes ?? 30;
    return { id: reservationBookingId(reservation), businessId,
      bookableItemId: reservation.serviceId ?? "demo_floor_service", customerId: reservation.customerId ?? ownerUserId,
      staffId: reservation.staffId, elementId: reservation.elementId, professionalName: reservation.professionalName,
      startDatetime: start, endDatetime: reservation.endDatetime ?? addMinutes(start, duration), unitsReserved: 1, peopleCount: 1,
      status: reservation.status === "cancelada" ? "CANCELLED" : reservation.status === "confirmada" ? "CONFIRMED" : "HOLD",
      // A manual pending request is not an expiring interactive HOLD.
      ...(reservation.status === "pendiente" ? { holdExpiresAt: "9999-12-31T23:59:59.000Z" } : {}),
      paymentStatus: "none", notes: reservation.notes, createdAt: reservation.createdAt, source: "floor" };
  };
  const entryFor = (reservation: DemoReservation, data: BusinessDemoData): GoEntry => {
    const booking = data.bookings.find(item => item.id === reservation.bookingId || item.elementId === reservation.elementId && item.id === reservationBookingId(reservation));
    return { id: `demo_booking_${reservation.id}`, reservationId: reservation.id, type: "GO_RESERVA", kind: "received", intentKey: "reservas",
      intentLabel: booking?.serviceTitle ?? data.plan?.elements.find(element => element.id === reservation.elementId)?.label ?? "Reserva DEMO",
      color: "#3D9A84", place: data.config.address, date: reservation.date, dateISO: reservation.dateISO ?? "", time: reservation.time,
      endTime: (reservation.endDatetime ?? booking?.endDatetime)?.slice(11,16), duration: String(reservation.durationMinutes ?? 30),
      contactName: reservation.customerName, phone: "", estado: reservation.status === "confirmada" ? "aceptado" : reservation.status === "cancelada" ? "rechazado" : "pendiente",
      bookingStatus: reservation.status, createdAt: reservation.createdAt, notes: reservation.notes, businessId, ownerUserId,
      serviceId: reservation.serviceId ?? booking?.bookableItemId, staffId: reservation.staffId ?? booking?.staffId,
      professionalName: reservation.professionalName ?? booking?.professionalName, demoLocal: true } as GoEntry;
  };
  const refreshPlanStatuses = (data: BusinessDemoData) => {
    if (!data.plan) return;
    // Overview status only. Temporal availability is computed from dated intervals by the DEMO repository.
    data.plan.elements = data.plan.elements.map(element => {
      const booked = data.reservations.some(reservation => reservation.elementId === element.id && reservation.status !== "cancelada");
      return booked && ["disponible", "reservado"].includes(element.status) ? { ...element, status: "reservado" } : !booked && element.status === "reservado" ? { ...element, status: "disponible" } : element;
    });
  };
  const decode = (raw: string): BusinessDemoData => {
      const parsed = JSON.parse(raw) as BusinessDemoData;
      if (parsed.version !== 1 || parsed.ownerUserId !== ownerUserId || !parsed.config || !Array.isArray(parsed.config.services)
        || !Array.isArray(parsed.config.plantillaItems) || !Array.isArray(parsed.config.activeDays) || !Array.isArray(parsed.config.completedSteps)
        || !Array.isArray(parsed.reservations) || !Array.isArray(parsed.entries) || !parsed.preferences || typeof parsed.preferences !== "object"
        || parsed.bookings !== undefined && !Array.isArray(parsed.bookings)) throw new Error("Los datos DEMO no se pueden leer. Se conservan sin sobrescribir.");
      if (parsed.plan) { assertBusiness(parsed.plan.businessId); assertPlan(parsed.plan.id); }
      for (const reservation of parsed.reservations) { assertPlan(reservation.planId); if (reservation.customerId !== undefined && reservation.customerId !== ownerUserId) throw new Error("Reserva DEMO de otra identidad."); }
      for (const entry of parsed.entries) { const value = entry as GoEntry & { ownerUserId?: string }; if (value.ownerUserId !== undefined && value.ownerUserId !== ownerUserId || value.businessId !== undefined && value.businessId !== businessId) throw new Error("Ficha DEMO de otra empresa o identidad."); }
      // Preserve IDs already persisted by earlier builds of the same DEMO company.
      if (options.companyId && parsed.bookings) for (const reservation of parsed.reservations) {
        const existing = parsed.bookings.find(booking => booking.id === `demo_floor_booking_${reservation.id}`);
        if (!reservation.bookingId && existing) reservation.bookingId = existing.id;
      }
      const bookings = parsed.bookings ?? parsed.reservations.filter(r => r.dateISO).map(bookingForReservation);
      for (const booking of bookings) { assertBusiness(booking.businessId); if (booking.customerId !== ownerUserId) throw new Error("Reserva DEMO de otra identidad."); }
      const data = { ...parsed, bookings, config: cleanConfig(parsed.config) };
      reconcileBusinessDemoProfessionalPlan(data);
      return data;
  };
  const ensureLoaded = async (refresh = false) => {
    if (loaded && (!refresh || observedRevision === (revisions.get(key) ?? 0))) return;
    const raw = await storage.getItem(key); assertAllowed();
    if (raw !== null) {
      snapshot = decode(raw);
    } else if (refresh) snapshot = fresh();
    loaded = true; observedRevision = revisions.get(key) ?? 0;
  };
  const change = <T,>(update: (data: BusinessDemoData) => { data: BusinessDemoData; result: T }) => enqueue(async () => {
    // Refresh inside the per-owner queue: another mounted adapter cannot overwrite a newer committed document.
    await ensureLoaded(true); const { data: next, result } = update(clone(snapshot)); assertAllowed();
    if (options.keepBackup) { await storage.setItem(key + ":backup", JSON.stringify(snapshot)); assertAllowed(); }
    await storage.setItem(key, JSON.stringify(next)); assertAllowed(); publish(next); return result;
  });
  const simpleChange = (update: (data: BusinessDemoData) => BusinessDemoData) => change(data => ({ data: update(data), result: undefined }));
  const syncEntries = (data: BusinessDemoData) => { data.entries = data.reservations.map(reservation => entryFor(reservation, data)); refreshPlanStatuses(data); };
  const api = {
    ownerUserId, businessId, planId, reservationBookingId,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    load: () => enqueue(async () => { await ensureLoaded(true); assertAllowed(); return clone(snapshot); }),
    updateConfig: (patch: Partial<BusinessConfig>) => simpleChange(data => { data.config = cleanConfig({ ...data.config, ...patch }); reconcileBusinessDemoProfessionalPlan(data, true); syncEntries(data); return data; }),
    transformConfig: (update: (config: BusinessConfig) => BusinessConfig) => simpleChange(data => { data.config = cleanConfig(update(data.config)); reconcileBusinessDemoProfessionalPlan(data, true); syncEntries(data); return data; }),
    reset: () => simpleChange(() => fresh()),
    importSnapshot: (value: BusinessDemoData) => simpleChange(() => { const next = decode(JSON.stringify(value)); syncEntries(next); return next; }),
    restoreBackup: () => enqueue(async () => {
      const raw = await storage.getItem(key + ":backup"); assertAllowed();
      if (!raw) throw new Error("No hay una versión anterior guardada.");
      const previous = decode(raw); assertAllowed();
      await storage.setItem(key, JSON.stringify(previous)); assertAllowed(); publish(previous);
    }),
    loadFloorPlan: (id: string) => enqueue(async () => { assertBusiness(id); await ensureLoaded(true); assertAllowed(); return clone(snapshot.plan); }),
    saveFloorPlan: (plan: FloorPlan) => simpleChange(data => {
      assertBusiness(plan.businessId); assertPlan(plan.id);
      const retained = data.plan?.elements.filter(element => element.demoArchived && !plan.elements.some(next => next.id === element.id)) ?? [];
      data.plan = { ...clone(plan), elements: [...clone(plan.elements), ...retained] };
      reconcileBusinessDemoProfessionalPlan(data, true); syncEntries(data); return data;
    }),
    reconcileProfessionalPlan: () => change(data => {
      data.plan ??= { id: planId, businessId, elements: [], updatedAt: Date.now() };
      reconcileBusinessDemoProfessionalPlan(data, true); syncEntries(data); return { data, result: clone(data.plan) };
    }),
    classifyLegacyElement: (elementId: string, kind: "professional" | "physical") => simpleChange(data => {
      const element = data.plan?.elements.find(value => value.id === elementId);
      if (!["professional", "physical"].includes(kind) || !element || element.demoStaffId) throw new Error("El elemento ya tiene una identidad asignada o no existe.");
      element.demoKind = kind;
      if (kind === "professional") { element.demoArchived = true; element.reservable = false; }
      syncEntries(data); return data;
    }),
    loadReservations: (id: string) => enqueue(async () => { assertPlan(id); await ensureLoaded(true); assertAllowed(); return clone(snapshot.reservations); }),
    saveReservations: (id: string, reservations: DemoReservation[]) => simpleChange(data => {
      assertPlan(id);
      const professionals = getBusinessDemoProfessionals(data.config, businessId);
      const normalizedReservations = reservations.map(reservation => {
        if (reservation.customerId !== undefined && reservation.customerId !== ownerUserId) throw new Error("Reserva DEMO de otra identidad.");
        const previous = data.reservations.find(value => value.id === reservation.id);
        const element = data.plan?.elements.find(value => value.id === reservation.elementId);
        const professional = professionals.find(person => businessDemoProfessionalElement(data, person)?.id === element?.id);
        return { ...clone(reservation), customerId: ownerUserId, durationMinutes: reservation.durationMinutes ?? previous?.durationMinutes ?? 30,
          staffId: reservation.staffId ?? previous?.staffId ?? (previous ? undefined : professional?.id),
          professionalName: reservation.professionalName ?? previous?.professionalName ?? (previous ? undefined : professional?.name) };
      });
      for (const reservation of normalizedReservations) {
        assertPlan(reservation.planId);
        if (!data.plan?.elements.some(element => element.id === reservation.elementId)) throw new Error("La reserva DEMO necesita un espacio guardado en su plano.");
        const proposed = bookingForReservation(reservation);
        if (!isValidDemoLocalInterval(proposed.startDatetime, proposed.endDatetime, reservation.durationMinutes ?? 30)) throw new Error("La reserva DEMO necesita una fecha y duración válidas.");
        const previous = data.reservations.find(existing => existing.id === reservation.id);
        const previousBooking = previous && bookingForReservation(previous);
        const selectionChanged = !previousBooking || proposed.startDatetime !== previousBooking.startDatetime || proposed.endDatetime !== previousBooking.endDatetime
          || proposed.bookableItemId !== previousBooking.bookableItemId || proposed.staffId !== previousBooking.staffId || proposed.elementId !== previousBooking.elementId;
        if (reservation.status !== "cancelada" && selectionChanged) {
          if (Date.parse(proposed.startDatetime) <= Date.now()) throw new Error("Elige una hora futura para la nueva reserva DEMO.");
          const element = data.plan!.elements.find(value => value.id === reservation.elementId)!;
          if (data.config.sectorId && businessDemoElementRequiresReview(element)) throw new Error("Revisa este elemento antiguo del plano antes de asignar nuevas reservas.");
          if (element.demoArchived || !element.reservable || ["bloqueado","ocupado","mantenimiento"].includes(element.status)) throw new Error("Este puesto DEMO no admite una nueva reserva.");
          const professional = proposed.staffId ? professionals.find(person => person.id === proposed.staffId)
            : professionals.find(person => businessDemoProfessionalElement(data, person)?.id === element.id);
          if (proposed.staffId && !professional || professional && !professional.active) throw new Error("Profesional DEMO no disponible para una nueva reserva.");
          if (professional) {
            // Bind old unassigned appointments only when their interval/resource changes, never for a state-only edit.
            reservation.staffId ??= professional.id;
            reservation.professionalName ??= professional.name;
            proposed.staffId = reservation.staffId;
            const assigned = businessDemoProfessionalElement(data, professional);
            if (assigned?.id !== element.id) throw new Error("El profesional no corresponde a este puesto DEMO.");
          }
          if (reservation.serviceId && reservation.serviceId !== "demo_floor_service") {
            const service = data.config.services.find(value => demoNamedId(businessId,"service",value.name) === reservation.serviceId);
            if (!service || service.duration !== reservation.durationMinutes || service.price < 0
              || professional && professional.serviceIds?.length && !professional.serviceIds.includes(reservation.serviceId))
              throw new Error("Servicio o duración DEMO no disponible para este profesional.");
          }
          const start = Number(reservation.time.slice(0,2))*60 + Number(reservation.time.slice(3,5));
          const end = Number(proposed.endDatetime.slice(11,13))*60 + Number(proposed.endDatetime.slice(14,16));
          if (proposed.startDatetime.slice(0,10) !== proposed.endDatetime.slice(0,10)
            || !getBusinessDemoShifts(data.config,reservation.dateISO!,professional).some(shift => start >= shift.from && end <= shift.to))
            throw new Error("Esta hora no está dentro del turno configurado de la empresa y del profesional.");
        }
        if (reservation.status !== "cancelada") {
          const other = data.bookings.find(booking => booking.id !== proposed.id && blocking(booking)
            && (booking.elementId === proposed.elementId || proposed.staffId && booking.staffId === proposed.staffId) && overlaps(booking, proposed));
          if (other) throw new Error("Este espacio o profesional ya está reservado a esa hora.");
        }
      }
      const proposedBookings = normalizedReservations.filter(reservation => reservation.status !== "cancelada").map(bookingForReservation);
      for (let index = 0; index < proposedBookings.length; index++) for (const other of proposedBookings.slice(index + 1)) {
        const candidate = proposedBookings[index];
        if ((candidate.elementId === other.elementId || candidate.staffId && candidate.staffId === other.staffId) && overlaps(candidate, other))
          throw new Error("Este espacio o profesional ya está reservado a esa hora.");
      }
      // Preserve reservations committed concurrently through the customer adapter.
      const concurrent = data.reservations.filter(r => !normalizedReservations.some(next => next.id === r.id));
      data.reservations = [...normalizedReservations, ...concurrent];
      for (const reservation of data.reservations) {
        const proposed = bookingForReservation(reservation), index = data.bookings.findIndex(booking => booking.id === proposed.id);
        if (index < 0) data.bookings.push(proposed); else data.bookings[index] = { ...data.bookings[index], ...proposed };
      }
      syncEntries(data); return data;
    }),
    transactBookings: <T,>(update: (data: BusinessDemoData) => T) => change(data => {
      const result = update(data);
      for (const booking of data.bookings) { assertBusiness(booking.businessId); if (booking.customerId !== ownerUserId) throw new Error("Reserva DEMO de otra identidad."); }
      for (const reservation of data.reservations) assertPlan(reservation.planId);
      syncEntries(data); return { data, result };
    }),
    updateEntries: (update: GoEntry[] | ((entries: GoEntry[]) => GoEntry[])) => simpleChange(data => {
      const entries = typeof update === "function" ? update(clone(data.entries)) : update;
      const existing = new Set(data.entries.map(entry => entry.id));
      if (entries.some(entry => !existing.has(entry.id))) throw new Error("La agenda DEMO solo admite sus reservas locales.");
      data.reservations = data.reservations.map(reservation => {
        const entry = entries.find(item => item.reservationId === reservation.id);
        const status = !entry || entry.deleted || entry.estado === "rechazado" ? "cancelada" : entry.estado === "aceptado" ? "confirmada" : "pendiente";
        const id = reservationBookingId(reservation);
        data.bookings = data.bookings.map(booking => booking.id === id ? { ...booking, status: status === "cancelada" ? "CANCELLED" : status === "confirmada" ? "CONFIRMED" : "HOLD" } : booking);
        return { ...reservation, status };
      });
      syncEntries(data); return data;
    }),
    preferences: {
      getItem: (name: string) => enqueue(async () => { if (!preferenceKeys.has(name)) throw new Error("Preferencia ajena al entorno DEMO."); await ensureLoaded(true); assertAllowed(); return snapshot.preferences[name] ?? null; }),
      setItem: (name: string, value: string) => simpleChange(data => { if (!preferenceKeys.has(name)) throw new Error("Preferencia ajena al entorno DEMO."); data.preferences[name] = value; return data; }),
    },
  };
  return api;
}
export type BusinessDemoStore = ReturnType<typeof createBusinessDemoStore>;


/** Valid persisted setup, shared by Landing, company UI and the private DEMO catalogue. */
export function getBusinessDemoSetupState(config: BusinessConfig, plan?: FloorPlan | null) {
  const marked = new Set(config.completedSteps ?? []);
  const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const validShift = (shift?: { from: string; to: string; active: boolean }) => !!shift?.active && validTime(shift.from) && validTime(shift.to) && shift.from < shift.to;
  const coordinates = config.coordinates;
  const located = !!config.address?.trim() || !!coordinates && Number.isFinite(coordinates.latitude) && Number.isFinite(coordinates.longitude)
    && Math.abs(coordinates.latitude) <= 90 && Math.abs(coordinates.longitude) <= 180;
  const schedule = !!config.activeDays?.length && config.activeDays.every(day => {
    if (!Number.isInteger(day) || day < 0 || day > 6) return false;
    const entry = config.daySchedules?.[String(day)];
    return entry ? [entry.shift1,entry.shift2].filter(shift=>shift?.active).length > 0 && [entry.shift1,entry.shift2].filter(shift=>shift?.active).every(validShift) : validTime(config.openFrom) && validTime(config.openTo) && config.openFrom < config.openTo;
  });
  const validSteps = [
    !!config.businessName?.trim() && !!config.sectorId && !!config.subId,
    located,
    schedule,
    !!config.services?.length && config.services.every(service => !!service.name?.trim() && Number.isFinite(service.duration) && service.duration > 0 && Number.isFinite(service.price) && service.price >= 0 && (service.capacity === undefined || Number.isInteger(service.capacity) && service.capacity > 0)),
    !!config.plantillaItems?.some(item => item.count > 0),
    marked.has(5) && [config.paymentPolicy,config.approvalPolicy,config.cancelPolicy].every((value,index) => Number.isInteger(value) && value >= 0 && value <= (index === 2 ? 2 : 1)),
    plan === undefined ? marked.has(6) : !!plan?.elements.length && plan.businessId === config.businessId,
    marked.has(7),
  ];
  // Suggested defaults are not completed work: each DEMO step must be reviewed
  // and saved for this business. A checkmark alone never makes invalid data ready.
  const steps = validSteps.map((valid, index) => valid && (!config.businessId?.startsWith("demo_business_") || marked.has(index)));
  const completed = steps.filter(Boolean).length;
  return { steps, completed, total: 8, ready: completed === 8, nextStep: Math.max(0, steps.findIndex(value => !value)) };
}
