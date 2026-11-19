import type { GoEntry } from "@/components/AgendaOperativa";
import type { Business, BookableItem, Staff, SlotWithStatus, Booking } from "./booking";
import type { BookingService } from "./bookingServices";
import type { BookingTimeline } from "./bookingTimeline";

/** Labels/scope from the existing reservation; never an authorization or availability source. */
export type BookingChangeSelection = {
  business: Business; item: BookableItem; services: BookingService[]; staff?: Staff;
  durationMinutes: number; timeline?: BookingTimeline;
};

export function bookingChangeSelection(entry: GoEntry, original?: Pick<Booking, "timingSnapshot">): BookingChangeSelection {
  const timeline = entry.bookingTimeline ?? original?.timingSnapshot;
  const ids = timeline?.serviceIds ?? entry.bookingServices?.map(service => service.id) ?? (entry.serviceId ? [entry.serviceId] : []);
  const minutes = timeline?.totalDurationMinutes ?? (Date.parse(entry.endDatetime ?? "") - Date.parse(entry.startDatetime ?? "")) / 60000;
  if (!entry.businessId || !ids.length || ids.some(id => !id) || !Number.isFinite(minutes) || minutes <= 0)
    throw Error("No se puede consultar la disponibilidad de esta reserva. Actualízala e inténtalo de nuevo.");
  const services = ids.map(id => entry.bookingServices?.find(service => service.id === id)
    ?? timeline?.serviceDetails.find(service => service.id === id)
    ?? { id, title: entry.intentLabel || "Reserva", durationMinutes: minutes, price: 0 });
  const staffId = entry.staffId ?? entry.professionalId ?? timeline?.staffId ?? undefined;
  return {
    business: { id: entry.businessId, name: entry.contactName || "", location: entry.place || "", phone: "",
      category: entry.bookingCategory || "peluqueria", bookingActive: true, bookingColor: entry.color || "#4A80BD",
      timezone: timeline?.timezone || "", createdAt: "" },
    item: { id: ids[0], businessId: entry.businessId, title: services.map(service => service.title).join(" + "),
      type: "service", durationMinutes: minutes, customerCapacity: 1, unitQuantity: 1, price: 0,
      paymentRequired: false, active: true, visible: true },
    services: services.map(service => ({ ...service, price: service.price ?? 0 })),
    staff: staffId ? { id: staffId, businessId: entry.businessId, name: entry.professionalName || "Profesional asignado", active: true } : undefined,
    durationMinutes: minutes, timeline,
  };
}

/** Restrict authoritative results to the saved service contract. Never manufacture free slots.
 * The existing availability endpoint cannot plan with a frozen reservation snapshot or exclude
 * its original interval. If the catalogue/timing changed, fail closed rather than offer false slots.
 */
export function bookingChangeSlots(selection: BookingChangeSelection, slots: SlotWithStatus[]): SlotWithStatus[] {
  const shape = (plan: BookingTimeline) => JSON.stringify(plan.phases.map(phase => ({
    serviceId: phase.serviceId, kind: phase.kind, durationMinutes: phase.durationMinutes,
    offsetMinutes: phase.offsetMinutes, staffId: phase.staffId, releaseProfessional: !!phase.releaseProfessional,
    resources: phase.resources,
  })));
  return slots.filter(slot => {
    const plan = slot.timingSnapshot;
    return slot.isAvailable && !slot.isBlocked && (!selection.staff || slot.staffId === selection.staff.id)
      && (Date.parse(slot.endInstant ?? slot.endDatetime) - Date.parse(slot.startInstant ?? slot.startDatetime)) / 60000 === selection.durationMinutes
      && (!selection.timeline || !!plan && JSON.stringify(plan.serviceIds) === JSON.stringify(selection.timeline.serviceIds)
        && shape(plan) === shape(selection.timeline));
  });
}
