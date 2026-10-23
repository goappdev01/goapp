import type { BookableItem, Booking, Staff } from "./booking";

export type BookingService = Pick<BookableItem, "id" | "title" | "durationMinutes" | "price" | "currency" | "priceKnown">;

/** Resolve IDs against the current establishment; never create synthetic services. */
export function summarizeBookingServices(catalog: readonly BookableItem[], ids: readonly string[]) {
  if (!ids.length) throw new Error("Selecciona al menos un servicio.");
  if (new Set(ids).size !== ids.length) throw new Error("La selección contiene servicios duplicados.");
  const items = ids.map(id => catalog.find(item => item.id === id));
  if (items.some(item => !item || !item.active || !item.visible)) throw new Error("Algún servicio ya no está disponible.");
  const selected = items as BookableItem[];
  if (selected.some(item => item.businessId !== selected[0].businessId)) throw new Error("Los servicios deben pertenecer al mismo negocio.");
  if (selected.some(item => !Number.isInteger(item.durationMinutes) || item.durationMinutes <= 0)) throw new Error("Confirma la duración de todos los servicios antes de reservar.");
  const currencies = new Set(selected.map(item => item.currency ?? "EUR"));
  if (currencies.size !== 1) throw new Error("No se pueden sumar servicios con monedas diferentes.");
  const priceKnown = selected.every(item => item.priceKnown !== false && Number.isFinite(item.price) && item.price >= 0);
  const services: BookingService[] = selected.map(({ id, title, durationMinutes, price, currency, priceKnown }) => ({ id, title, durationMinutes, price, currency: currency ?? "EUR", priceKnown: priceKnown !== false && Number.isFinite(price) && price >= 0 }));
  const item: BookableItem = { ...selected[0], title: selected.map(value => value.title).join(" + "),
    durationMinutes: selected.reduce((total, value) => total + value.durationMinutes, 0),
    price: priceKnown ? selected.reduce((total, value) => total + Math.round(value.price * 100), 0) / 100 : 0,
    priceKnown, currency: selected[0].currency ?? "EUR",
    customerCapacity: Math.min(...selected.map(value => value.customerCapacity)),
    unitQuantity: Math.min(...selected.map(value => value.unitQuantity)),
    paymentRequired: selected.some(value => value.paymentRequired) };
  return { item, services };
}

export function bookingServiceIds(booking: Pick<Booking, "bookableItemId" | "services">): string[] {
  if (booking.services !== undefined && (!Array.isArray(booking.services) || !booking.services.length)) throw new Error("Selección de servicios no válida.");
  const ids = booking.services?.map(service => service.id) ?? [booking.bookableItemId];
  if (ids[0] !== booking.bookableItemId || ids.some(id => typeof id !== "string" || !id) || new Set(ids).size !== ids.length) throw new Error("Selección de servicios no válida o duplicada.");
  return ids;
}

export function staffSupportsBookingServices(staff: Pick<Staff, "active" | "serviceIds">, ids: readonly string[]) {
  return staff.active && (!staff.serviceIds?.length || ids.every(id => staff.serviceIds!.includes(id)));
}
