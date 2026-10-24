import type { BookableItem, Booking, Staff } from "./booking";
import type { CatalogAssociation, CatalogQuote } from "./catalogAssociations";

export type BookingService = Pick<BookableItem, "id" | "title" | "durationMinutes" | "price" | "currency" | "priceKnown">;
/** Storage-independent rules for the existing local catalogue adapter. */
export function localCatalogQuote(businessId: string, catalog: BookableItem[], relations: CatalogAssociation[], roots: string[], selected: string[] = []): CatalogQuote {
  if (!roots.length || roots.length > 32 || new Set(roots).size !== roots.length || new Set(selected).size !== selected.length) throw Error("Selección de catálogo no válida.");
  const ids = [...roots], included = new Set<string>(), used = new Set<string>(), options: CatalogQuote["options"] = [];
  const find = (id: string) => {
    const item = catalog.find(row => row.id === id && row.businessId === businessId && row.active && row.visible);
    if (!item || item.priceKnown === false || !Number.isFinite(item.price) || item.price < 0) throw Error("Elemento del catálogo no disponible.");
    return item;
  };
  for (let i = 0; i < ids.length; i++) {
    if (ids.length > 64) throw Error("Selección demasiado extensa.");
    find(ids[i]);
    for (const edge of relations.filter(row => row.business_id === businessId && row.source_id === ids[i] && row.active)) {
      const mode = (edge.mode as string) === "required" ? "included" : edge.mode;
      let item: BookableItem;
      try { item = find(edge.target_id); } catch (error) { if (mode === "included" || selected.includes(edge.id)) throw error; continue; }
      const chosen = mode === "included" || selected.includes(edge.id);
      options.push({ associationId: edge.id, sourceId: edge.source_id, itemId: item.id, name: item.title, kind: item.catalogKind === "product" ? "product" : "service", price: item.price, currency: item.currency ?? "EUR", mode, selected: chosen });
      if (chosen) { used.add(edge.id); if (mode === "included") included.add(item.id); if (!ids.includes(item.id)) ids.push(item.id); }
    }
  }
  if (selected.some(id => !used.has(id))) throw Error("La opción ya no pertenece a la selección.");
  const lines = ids.map(id => { const item = find(id); return { itemId: id, name: item.title, kind: item.catalogKind === "product" ? "product" as const : "service" as const, durationMinutes: item.durationMinutes, quantity: 1, unitPrice: item.price, charge: included.has(id) ? 0 : item.price, included: included.has(id), currency: item.currency ?? "EUR" }; });
  if (new Set(lines.map(line => line.currency)).size !== 1) throw Error("Monedas incompatibles.");
  return { version: 1, businessId, rootIds: [...roots], selectedAssociationIds: [...selected], ready: true, missingRequired: [], lines, options, serviceIds: lines.filter(line => line.kind === "service").map(line => line.itemId), totalPrice: lines.reduce((cents, line) => cents + Math.round(line.charge * 100), 0) / 100, currency: lines[0].currency };
}

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
