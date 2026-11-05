/** Prepared contract only. No guest endpoint or directory is deployed/registered here. */
import type { AvailableSlot, Booking, BookableItem, Business, Staff } from "./booking";
import { getTimelineAvailability } from "./booking";
import type { CatalogQuote } from "./catalogAssociations";
import type { BookingService } from "./bookingServices";
import { isStableBookingId } from "./serviceTiming";
import { validateCalendarDate } from "./calendarExceptions";
import { createDirectEntryCommitter, type DirectEntryReceipt } from "./businessDirectEntry";

export type FastCalendarEntry = { businessId: string; staffId: string; dateISO: string; timeHHMM: string };
export type PrivateBusinessCustomer = { id: string; businessId: string; name: string; phone: string | null };
export type FastGuest = { name: string; phone: string; contactId: string | null; remember: boolean };
export type FastContext = { business: Business; professional: Staff; identity: string };
export type FastReview = { context: FastContext; entry: FastCalendarEntry; slot: AvailableSlot; services: BookingService[]; quote: CatalogQuote; item: BookableItem };
export type FastCommand = { kind: "booking"; businessId: string; staffId: string; startInstant: string; endInstant: string;
  services: BookingService[]; expectedPlan: NonNullable<AvailableSlot["timingSnapshot"]>; quote: CatalogQuote;
  customer: { name: string; phone: string | null; contactId: string | null; remember: boolean }; source: "business" };
export type FastBooking = Omit<Booking, "customerId"> & { customerId: null; source: "business"; guestName: string };
export type FastReceipt = DirectEntryReceipt & { booking: FastBooking };
export type BusinessFastGateway = {
  currentIdentity: () => Promise<string | null>;
  /** Must verify effective business/staff access server-side, not an account role. */
  resolveContext: (entry: FastCalendarEntry) => Promise<{ business: Business; professional: Staff }>;
  /** Private directory: server business scope, no global user/phone identity lookup. */
  findCustomers: (businessId: string, query: string) => Promise<PrivateBusinessCustomer[]>;
  /** Same authoritative booking engine; guest/contact write must be atomic and idempotent. */
  commit: (command: FastCommand, requestId: string) => Promise<FastReceipt>;
};
const changed = () => new Error("La sesión o la empresa ha cambiado. Abre de nuevo la reserva.");
function validateEntry(entry: FastCalendarEntry) {
  if (!isStableBookingId(entry.businessId) || !isStableBookingId(entry.staffId)) throw new Error("Selecciona un calendario profesional autorizado.");
  validateCalendarDate(entry.dateISO);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(entry.timeHHMM)) throw new Error("Selecciona una franja horaria válida.");
}
export async function resolveFastContext(gateway: BusinessFastGateway, entry: FastCalendarEntry): Promise<FastContext> {
  validateEntry(entry);
  const identity = await gateway.currentIdentity(); if (!identity) throw new Error("Inicia sesión para gestionar tu empresa.");
  const result = await gateway.resolveContext(entry);
  if (identity !== await gateway.currentIdentity()) throw changed();
  if (result.business.id !== entry.businessId || result.professional.id !== entry.staffId
    || result.professional.businessId !== entry.businessId || !result.professional.active) throw changed();
  return { ...result, identity };
}

/** Uses existing server availability; never creates a local HOLD for a guest. */
export async function prepareFastReview(context: FastContext, entry: FastCalendarEntry, services: BookingService[], quote: CatalogQuote,
  item: BookableItem, availability: typeof getTimelineAvailability = getTimelineAvailability): Promise<FastReview> {
  validateEntry(entry);
  if (entry.businessId !== context.business.id || context.professional.id !== entry.staffId || !quote.ready
    || quote.businessId !== entry.businessId || !services.length || quote.serviceIds.join(",") !== services.map(service => service.id).join(",")) throw changed();
  const result = await availability(entry.businessId, services.map(service => service.id), entry.dateISO, entry.staffId, { days: 1, visualStepMinutes: 1 });
  const slot = result.slots.find(value => value.startDatetime.slice(0, 16) === `${entry.dateISO}T${entry.timeHHMM}` && value.staffId === entry.staffId);
  if (!slot?.isAvailable || !slot.startInstant || !slot.endInstant || !slot.timingSnapshot) throw new Error("Esa franja ya no está disponible para estos servicios. Elige otra hora.");
  if (slot.timingSnapshot.serviceIds.join(",") !== services.map(service => service.id).join(",")
    || slot.timingSnapshot.startsAt !== slot.startInstant || slot.timingSnapshot.endsAt !== slot.endInstant) throw new Error("No se pudo comprobar el plan completo de la reserva.");
  return { context, entry: { ...entry }, services, quote, item, slot };
}

export async function findFastCustomers(gateway: BusinessFastGateway, context: FastContext, query: string): Promise<PrivateBusinessCustomer[]> {
  const value = query.trim(); if (value.length < 2) return [];
  if (context.identity !== await gateway.currentIdentity()) throw changed();
  const rows = await gateway.findCustomers(context.business.id, value);
  if (context.identity !== await gateway.currentIdentity()) throw changed();
  if (!Array.isArray(rows) || rows.length > 30 || rows.some(row => !isStableBookingId(row.id) || row.businessId !== context.business.id
    || typeof row.name !== "string" || !row.name.trim() || row.name.length > 120 || row.phone !== null && typeof row.phone !== "string")) throw new Error("No se pudo comprobar la agenda privada de esta empresa.");
  return rows;
}

export function fastCommand(review: FastReview, guest: FastGuest): FastCommand {
  const name = guest.name.trim(), phone = guest.phone.trim();
  if (!name || name.length > 120) throw new Error("Indica el nombre del cliente.");
  if (phone.length > 40 || guest.contactId !== null && !isStableBookingId(guest.contactId)) throw new Error("Revisa los datos del cliente.");
  return { kind: "booking", businessId: review.entry.businessId, staffId: review.entry.staffId,
    startInstant: review.slot.startInstant!, endInstant: review.slot.endInstant!, services: review.services,
    expectedPlan: review.slot.timingSnapshot!, quote: review.quote,
    customer: { name, phone: phone || null, contactId: guest.contactId, remember: guest.remember }, source: "business" };
}

export function createFastCommitter(gateway: BusinessFastGateway, nextRequestId: () => string) {
  return createDirectEntryCommitter<FastCommand, FastReceipt>(gateway, nextRequestId, (command, receipt) => {
    const booking = receipt.booking;
    if (!booking || booking.id !== receipt.id || booking.businessId !== command.businessId || booking.staffId !== command.staffId
      || booking.startInstant !== command.startInstant || booking.endInstant !== command.endInstant || booking.status !== "CONFIRMED"
      || booking.customerId !== null || booking.source !== "business" || booking.guestName !== command.customer.name
      || booking.timingSnapshot?.serviceIds.join(",") !== command.services.map(service => service.id).join(",")
      || booking.catalogSnapshot?.totalPrice !== command.quote.totalPrice || booking.catalogSnapshot?.currency !== command.quote.currency)
      throw new Error("No se pudo confirmar la reserva. Reintenta con la misma referencia.");
  });
}
