import type { GoEntry } from "@/components/AgendaOperativa";
import type { Business, BookableItem, Staff, SlotWithStatus, Booking, BookingChangeChoice, BookingChangeProposal } from "./booking";
import type { BookingService } from "./bookingServices";
import type { BookingTimeline } from "./bookingTimeline";

/** Labels/scope from the existing reservation; never an authorization or availability source. */
export type BookingChangeSelection = {
  bookingId: string;
  business: Business; item: BookableItem; services: BookingService[]; staff?: Staff;
  peopleCount?: number;
  durationMinutes: number; timeline?: BookingTimeline;
  rootIds?: string[]; selectedAssociationIds?: string[]; totalPrice?: number;
};
export type BookingProposalDraft = { slot: SlotWithStatus; selection: BookingChangeChoice };

export function bookingProposalDescription(proposal: Pick<BookingChangeProposal,"selection">, lang:"es"|"en"):string {
  const choice=proposal.selection;
  if(!choice)return lang==="en"?"The existing payment is preserved. No charge or refund will be made.":"Se conserva el pago existente. No se realizará ningún cobro ni devolución.";
  return [choice.catalogSnapshot.lines.map(line=>line.name).join(" + "),
    choice.professionalName || (lang==="en"?"No preference":"Sin preferencia"),
    `${choice.durationMinutes} min · ${choice.catalogSnapshot.totalPrice.toFixed(2)} ${choice.catalogSnapshot.currency}`,
    lang==="en"?"Accepting applies this selection. Recorded payments are preserved; no charge or refund is made.":"Aceptar aplica esta selección. Los pagos registrados se conservan; no se realiza ningún cobro ni devolución."].join("\n");
}

/** The published remote negotiation contract accepts time only. Never silently drop a changed choice. */
export function timeOnlyBookingProposal(original: BookingChangeSelection, draft: BookingProposalDraft): boolean {
  const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
  return same(original.services.map(service=>service.id),draft.selection.serviceIds)
    && original.staff?.id===draft.selection.staffId && original.durationMinutes===draft.selection.durationMinutes
    && same(original.rootIds ?? original.services.map(service=>service.id),draft.selection.catalogSnapshot.rootIds)
    && same(original.selectedAssociationIds ?? [],draft.selection.catalogSnapshot.selectedAssociationIds)
    && (original.totalPrice===undefined || original.totalPrice===draft.selection.catalogSnapshot.totalPrice)
    && (!original.timeline || bookingChangeSlots(original,[draft.slot]).length===1);
}

export function bookingChangeSelection(entry: GoEntry, original?: Partial<Booking>): BookingChangeSelection {
  const timeline = entry.bookingTimeline ?? original?.timingSnapshot;
  const ids = entry.bookingServices?.length ? entry.bookingServices.map(service=>service.id) : original?.services?.length ? original.services.map(service=>service.id) : entry.serviceId ? [entry.serviceId] : original?.bookableItemId ? [original.bookableItemId] : timeline?.serviceIds ?? [];
  const elapsed = timeline?.totalDurationMinutes ?? (Date.parse(entry.endDatetime || original?.endInstant || original?.endDatetime || "") - Date.parse(entry.startDatetime || original?.startInstant || original?.startDatetime || "")) / 60000;
  // Unknown legacy metadata never drives availability: Services resolves the actual selection first.
  const minutes = Number.isFinite(elapsed)&&elapsed>0?elapsed:0;
  if (!entry.businessId)
    throw Error("No se puede consultar la disponibilidad de esta reserva. Actualízala e inténtalo de nuevo.");
  const services = ids.map(id => entry.bookingServices?.find(service => service.id === id)
    ?? original?.services?.find(service=>service.id===id)
    ?? timeline?.serviceDetails.find(service => service.id === id)
    ?? { id, title: entry.intentLabel || "Reserva", durationMinutes: minutes, price: 0 });
  const staffId = entry.staffId ?? entry.professionalId ?? original?.staffId ?? timeline?.staffId ?? undefined;
  return {
    bookingId: String(entry.reservationId ?? entry.bookingId ?? original?.id ?? ""),
    business: { id: entry.businessId, name: entry.contactName || "", location: entry.place || "", phone: "",
      category: entry.bookingCategory || "peluqueria", bookingActive: true, bookingColor: entry.color || "#4A80BD",
      timezone: timeline?.timezone || "", createdAt: "" },
    item: { id: ids[0], businessId: entry.businessId, title: services.map(service => service.title).join(" + "),
      type: "service", durationMinutes: minutes, customerCapacity: 1, unitQuantity: 1, price: 0,
      paymentRequired: false, active: true, visible: true },
    services: services.map(service => ({ ...service, price: service.price ?? 0 })),
    staff: staffId ? { id: staffId, businessId: entry.businessId, name: entry.professionalName || "Profesional asignado", active: true } : undefined,
    durationMinutes: minutes, timeline, peopleCount: original?.peopleCount,
    rootIds: entry.bookingCatalog?.rootIds?.length ? entry.bookingCatalog.rootIds : original?.catalogSnapshot?.rootIds?.length ? original.catalogSnapshot.rootIds : ids,
    selectedAssociationIds: entry.bookingCatalog?.selectedAssociationIds ?? original?.catalogSnapshot?.selectedAssociationIds,
    totalPrice: entry.bookingCatalog?.totalPrice ?? entry.bookingTotalPrice ?? original?.catalogSnapshot?.totalPrice ?? original?.totalPrice ?? timeline?.totalPrice,
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
