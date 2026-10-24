import type { GoEntry } from "@/components/AgendaOperativa";
import type { Booking, Business, BookableItem } from "./booking";
export type CustomerBookingEntry = GoEntry & {
    customerBooking: true;
    bookingId: string;
    ownerUserId: string;
};
/** One read projection of the reservation. It never creates a task or stores another reservation. */
export function customerBookingEntry(booking: Booking, business: Business, item: BookableItem, professionalName?: string): CustomerBookingEntry {
    const timezone = booking.timingSnapshot?.timezone ?? booking.receipt?.timezone ?? business.timezone;
    const wall = (stamp: string) => {
        if (!/(?:Z|[+-]\d{2}:?\d{2})$/i.test(stamp))
            return { dateISO: stamp.slice(0, 10), time: stamp.slice(11, 16) };
        const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(stamp));
        const get = (key: string) => parts.find(p => p.type === key)!.value;
        return { dateISO: get("year") + "-" + get("month") + "-" + get("day"), time: get("hour") + ":" + get("minute") };
    };
    const start = wall(booking.startInstant ?? booking.startDatetime), end = wall(booking.endInstant ?? booking.endDatetime), cancelled = ["CANCELLED", "REJECTED", "EXPIRED"].includes(booking.status), proposal = booking.changeProposal;
    return { id: "go_booking_" + booking.id, bookingId: booking.id, reservationId: booking.id, businessId: booking.businessId, serviceId: booking.bookableItemId,
        staffId: booking.staffId, professionalId: booking.staffId, professionalName:professionalName || booking.receipt?.staffName, ownerUserId: booking.customerId, actionContext: "live:USER", startDatetime: booking.startInstant ?? booking.startDatetime, endDatetime: booking.endInstant ?? booking.endDatetime, customerBooking: true, bookingStartsAt: booking.startInstant ?? booking.startDatetime, bookingChangeRevision:booking.changeRevision ?? 0, bookingServerStatus:booking.serverStatus ?? booking.status, bookingTimeline: booking.timingSnapshot,
        type: "GO_RESERVA", kind: "sent", intentKey: "generico", intentLabel: booking.receipt?.serviceName || item.title || "Reserva", color: business.bookingColor || "#00e5ff", place: business.location,
        bookingCatalog: booking.catalogSnapshot,
        bookingServices: booking.services,
        bookingTotalPrice: booking.totalPrice, bookingCurrency: booking.currency,
        contactName: business.name || booking.receipt?.businessName || "", phone: business.phone || booking.receipt?.businessPhone || "", whatsapp:business.whatsapp || booking.receipt?.businessWhatsapp, date: start.dateISO, dateISO: start.dateISO, time: start.time, startTime: start.time, endTime: end.time,
        duration: String((Date.parse(booking.endInstant ?? booking.endDatetime) - Date.parse(booking.startInstant ?? booking.startDatetime)) / 60000) + "min", notes: booking.receipt?.serviceName || item.title,
        bookingStatus: cancelled ? "cancelada" : booking.status === "COMPLETED" ? "completada" : ["CONFIRMED", "ACCEPTED"].includes(booking.status) ? "confirmada" : "pendiente",
        estado: cancelled ? "rechazado" : proposal ? proposal.proposedBy === "customer" ? "propuesta_pendiente" : "propuesto" : ["CONFIRMED", "ACCEPTED", "COMPLETED"].includes(booking.status) ? "aceptado" : "pendiente",
        deleted: cancelled, changeProposal: proposal, slotKey: booking.slotKey ?? [booking.businessId, booking.staffId ?? "any", start.dateISO, start.time, end.time].join("|") };
}
export function mergeCustomerBookingEntries(personal: GoEntry[], customer: CustomerBookingEntry[], customerContext?: boolean): GoEntry[] {
    const byId = new Map(customer.map(e => [e.bookingId, e])), seen = new Set<string>(), result: GoEntry[] = [];
    const bookingId = (entry: GoEntry) => entry.reservationId || entry.id.replace(/^go_booking_(?:cli_|prv_)?/, "");
    for (const row of personal) {
        const id = (row.type === "GO_BOOKING" || row.type === "GO_RESERVA") ? bookingId(row) : undefined;
        const customerRow = row.customerBooking || row.type === "GO_RESERVA" && row.kind === "sent" || row.type === "GO_BOOKING" && row.kind === "received" && !row.id.startsWith("go_booking_prv_");
        if (customerContext === true && customerRow && (!id || !byId.has(id)))
            continue;
        if (customerContext === false && row.customerBooking)
            continue;
        if (id && byId.has(id)) {
            if (seen.has(id))
                continue;
            seen.add(id);
            const canonical = byId.get(id)!;
            result.push(row.ownerUserId === canonical.ownerUserId ? { ...row, ...canonical } : canonical);
        }
        else
            result.push(row);
    }
    for (const row of customer)
        if (!seen.has(row.bookingId)) {
            seen.add(row.bookingId);
            result.push(row);
        }
    return result;
}
