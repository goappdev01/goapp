import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { getAuthenticatedUserId, getLiveCustomerBookings, getBusinesses, getBookableItems, getStaff, changeBookingRequest, subscribeBookingUpdates, type Booking } from "@/data/booking";
type GoEntryWithBooking = {
    bookingId: string;
};
import type { DemoBookingRepository } from "@/data/demoBookingRepository";
import { customerBookingEntry, type CustomerBookingEntry } from "@/data/customerBookingProjection";
import { onSessionChanged } from "@/lib/sessionEvents";
/** DEMO and live use their existing repositories; this hook holds only read projections. */
export function useCustomerBookings(repository: DemoBookingRepository | undefined, enabled: boolean) {
    const [state, setState] = useState<{
        entries: CustomerBookingEntry[];
        bookings: Booking[];
        ownerId: string | null;
        loading: boolean;
        error: string;
    }>({ entries: [], bookings: [], ownerId: null, loading: false, error: "" });
    const [publishedSource, setPublishedSource] = useState<DemoBookingRepository | undefined | null>(null);
    const generation = useRef(0), active = useRef({ repository, enabled });
    active.current = { repository, enabled };
    const refresh = useCallback(async () => {
        const token = ++generation.current;
        const current = () => generation.current === token && active.current.enabled === enabled && active.current.repository === repository;
        if (!enabled) {
            setState({ entries: [], bookings: [], ownerId: null, loading: false, error: "" });
            return;
        }
        setState(old => ({ ...old, loading: true, error: "" }));
        try {
            const userId = await getAuthenticatedUserId();
            if (!current())
                return;
            if (!userId || repository && repository.ownerUserId !== userId) {
                setState({ entries: [], bookings: [], ownerId: null, loading: false, error: "" });
                return;
            }
            const bookings = await (repository ? repository.getMyBookings(userId) : getLiveCustomerBookings());
            if (repository) {
                const entries = repository.getCustomerEntries().filter(entry => bookings.some(b => b.id === (entry as GoEntryWithBooking).bookingId && b.customerId === userId)).map(entry => ({ ...entry, customerBooking: true as const, bookingId: (entry as GoEntryWithBooking).bookingId, ownerUserId: userId }));
                const finalUser = await getAuthenticatedUserId();
                if (current() && finalUser === userId) {
                    setPublishedSource(repository);
                    setState({ entries, bookings, ownerId: userId, loading: false, error: "" });
                }
                return;
            }
            const businesses = await getBusinesses(), entries: CustomerBookingEntry[] = [];
            for (const businessId of new Set(bookings.map(b => b.businessId))) {
                const receipt = bookings.find(b=>b.businessId===businessId)?.receipt;
                const business = businesses.find(b => b.id === businessId) ?? {
                    id: businessId, name: receipt?.businessName ?? "Establecimiento no disponible", category: "", location: receipt?.address ?? "", phone: receipt?.businessPhone ?? "", whatsapp:receipt?.businessWhatsapp,
                    bookingActive: false, bookingColor: "#00e5ff", timezone: receipt?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, createdAt: "",
                };
                const [items, staff] = await Promise.all([getBookableItems(businessId), getStaff(businessId)]);
                for (const booking of bookings.filter(b => b.businessId === businessId && b.customerId === userId)) {
                    const item = items.find(i => i.id === booking.bookableItemId) ?? { id: booking.bookableItemId, businessId, title: (booking as Booking & {
                            serviceTitle?: string;
                        }).serviceTitle ?? booking.receipt?.serviceName ?? "Reserva", type: "", durationMinutes: 0, customerCapacity: 1, unitQuantity: 1, price: 0, paymentRequired: false, active: false, visible: true };
                    entries.push({ ...customerBookingEntry(booking, business, item, staff.find(p => p.id === booking.staffId)?.name ?? booking.receipt?.staffName), type: "GO_BOOKING", kind: "received" });
                }
            }
            const finalUser = await getAuthenticatedUserId();
                if (current() && finalUser === userId) {
                setPublishedSource(repository);
                setState({ entries, bookings, ownerId: userId, loading: false, error: "" });
            }
        }
        catch (error) {
            if (current())
                setState(old => ({ ...old, loading: false, error: error instanceof Error ? error.message : "No se pudieron leer tus reservas." }));
        }
    }, [repository, enabled]);
    useEffect(() => {
        void refresh();
        const session = onSessionChanged(() => { generation.current++; setState({ entries: [], bookings: [], ownerId: null, loading: true, error: "" }); void refresh(); });
        const unsubscribe = repository?.store.subscribe(() => void refresh()), updates = subscribeBookingUpdates(() => void refresh());
        const foreground = AppState.addEventListener("change", value => { if (value === "active")
            void refresh(); });
        const timer = enabled ? setInterval(() => void refresh(), 30000) : undefined;
        return () => { generation.current++; session(); unsubscribe?.(); updates(); foreground.remove(); if (timer)
            clearInterval(timer); };
    }, [refresh, repository, enabled]);
    const mutate = async (entry: CustomerBookingEntry, operation: "cancel" | "propose" | "accept" | "reject", input: {
        dateISO?: string;
        date?: string;
        time?: string;
        proposalId?: string;
        acceptFinancialTerms?: boolean;
    } = {}) => {
        const userId = state.ownerId;
        if (!enabled || !active.current.enabled || !userId || entry.ownerUserId !== userId || await getAuthenticatedUserId() !== userId || active.current.repository !== repository)
            throw new Error("La identidad o el contexto han cambiado.");
        try { if (repository) {
            if (operation === "cancel")
                await repository.cancelBooking(entry.bookingId);
            else
                await repository.changeBooking(entry.bookingId, String(entry.businessId), "customer", operation, input);
        }
        else
            await changeBookingRequest(entry.bookingId, operation, { ...input, proposalId:input.proposalId ?? entry.changeProposal?.id, expectedRevision:entry.bookingChangeRevision ?? 0 }, userId);
        } finally { await refresh(); }
    };
    const visible = enabled && publishedSource === repository;
    return { ...state, entries: visible ? state.entries : [], bookings: visible ? state.bookings : [], ownerId: visible ? state.ownerId : null, loading: enabled && state.loading, error: enabled ? state.error : "", refresh, mutate };
}
