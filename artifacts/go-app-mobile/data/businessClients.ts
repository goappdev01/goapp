import type { Booking } from "./booking";

export type BusinessClient = { id: string; name: string; bookingCount: number; lastBookingAt: string };

/** Derive clients only from receipts already authorized for this business. */
export function businessClientsFromBookings(bookings: Booking[], businessId: string): BusinessClient[] {
  const clients = new Map<string, BusinessClient>();
  for (const booking of bookings) {
    if (booking.businessId !== businessId || !booking.customerId) continue;
    const name = booking.receipt?.customerName?.trim() ?? "";
    const lastBookingAt = booking.startInstant ?? booking.startDatetime;
    const current = clients.get(booking.customerId);
    if (!current) {
      clients.set(booking.customerId, { id: booking.customerId, name, bookingCount: 1, lastBookingAt });
    } else {
      current.bookingCount++;
      if (lastBookingAt > current.lastBookingAt) {
        current.lastBookingAt = lastBookingAt;
        if (name) current.name = name;
      } else if (!current.name && name) current.name = name;
    }
  }
  return [...clients.values()].sort((a, b) => b.lastBookingAt.localeCompare(a.lastBookingAt) || a.id.localeCompare(b.id));
}

export function searchBusinessClients<T extends { id: string; name: string }>(clients: T[], query: string): T[] {
  const term = query.trim().toLocaleLowerCase();
  return term ? clients.filter(client => client.name.toLocaleLowerCase().includes(term) || client.id.toLowerCase().includes(term)) : clients;
}
