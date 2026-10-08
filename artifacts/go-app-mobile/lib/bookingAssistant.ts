import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  bookingRequestSchema,
  parseBookingRequest,
  normalizeBookingText,
  distanceKm,
  type BookingRequest,
  type AwaitingField,
  type SearchZone,
} from "@workspace/api-zod";
import {
  getActivebusinesses,
  getBookableItems,
  getStaff,
  getAvailableSlots,
  claimSlot,
  cancelBooking,
  getAuthenticatedUserId,
  getLiveCustomerBookings,
  isCloudId,
  type Business,
  type BookableItem,
  type Staff,
  type AvailableSlot,
  type Booking,
} from "@/data/booking";
import { syncBookingToGoLog, updatePersonalGoLog } from "./goLogBridge";
import { expandSearchTerms, normalize } from "@/data/goSearchAliases";

export type Place = { label: string; latitude: number; longitude: number };
export type BusinessResult = {
  business: Business;
  distance?: number;
  explicit: boolean;
};
export type ReservationOption = {
  business: Business;
  service: BookableItem;
  staff?: Staff;
  slot: AvailableSlot;
};
export type AssistantCapabilities = {
  interpretation: boolean;
  transcription: boolean;
};
const apiBase = () =>
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? "https://" + process.env.EXPO_PUBLIC_DOMAIN + "/api"
    : "/api");
export async function assistantApi<T>(
  path: string,
  body?: unknown,
): Promise<T> {
  const base = apiBase();
  if (Platform.OS !== "web" && !/^https?:\/\//i.test(base))
    throw new Error("Falta configurar EXPO_PUBLIC_API_URL con la URL del backend de GO para Expo Go.");
  let session: { access_token?: string } | null = null;
  try {
    session = JSON.parse(
      (await AsyncStorage.getItem("go_supabase_session_v1")) || "null",
    );
  } catch {}
  const response = await fetch(base + "/booking-assistant" + path, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(session?.access_token
        ? { Authorization: "Bearer " + session.access_token }
        : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(35000),
  }).catch(() => {
    throw new Error(
      "No se pudo conectar con GO. Revisa tu conexión e inténtalo de nuevo.",
    );
  });
  if (response.status === 404)
    throw new Error("La API configurada no ofrece este servicio de GO (HTTP 404). Revisa la URL y la versión del backend.");
  const data = await response.json().catch(() => {
    throw new Error("GO no está disponible ahora. Inténtalo de nuevo.");
  });
  if (!response.ok)
    throw new Error(
      data.error || "GO no está disponible ahora. Inténtalo de nuevo.",
    );
  return data as T;
}
export const localToday = () => {
  const d = new Date();
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
};
export async function interpretRequest(
  text: string,
  context: BookingRequest,
  awaiting: AwaitingField,
  useAI: boolean,
): Promise<BookingRequest> {
  const today = localToday();
  if (useAI && (await getAuthenticatedUserId())) {
    try {
      const result = await assistantApi<{ request: unknown }>("/interpret", {
        text,
        context,
        awaiting,
        today,
      });
      const parsed = bookingRequestSchema.safeParse(result.request);
      if (parsed.success) return parsed.data;
    } catch {
      /* Offline extraction preserves known fields. */
    }
  }
  return parseBookingRequest(text, context, today, awaiting);
}
const placeCache = new Map<string, Place[]>();
export async function resolvePlaces(query: string): Promise<Place[]> {
  const key = normalizeBookingText(query);
  if (placeCache.has(key)) return placeCache.get(key)!;
  const data = await assistantApi<Place[]>(
    "/places?q=" + encodeURIComponent(query),
  );
  const places = data.filter(
    (p) =>
      typeof p.label === "string" &&
      Number.isFinite(p.latitude) &&
      Number.isFinite(p.longitude),
  );
  placeCache.set(key, places);
  return places;
}
type Catalogue = {
  businesses: Business[];
  services: BookableItem[];
  expires: number;
};
let catalogue: Catalogue | null = null;
let loadingCatalogue: Promise<Catalogue> | null = null;
export async function getAssistantCatalogue(): Promise<Catalogue> {
  if (catalogue && catalogue.expires > Date.now()) return catalogue;
  if (!loadingCatalogue)
    loadingCatalogue = Promise.all([
      getActivebusinesses(),
      getBookableItems(undefined, true),
    ])
      .then(
        ([businesses, services]) =>
          (catalogue = {
            businesses,
            services: services.filter(
              (s) => s.active && s.visible && isCloudId(s.id),
            ),
            expires: Date.now() + 60000,
          }),
      )
      .finally(() => {
        loadingCatalogue = null;
      });
  return loadingCatalogue;
}
export function matchingServices(
  items: BookableItem[],
  query: string | null,
): BookableItem[] {
  if (!query) return items;
  const terms = expandSearchTerms(query);
  const exact = items.filter((s) =>
    normalize(s.title).includes(normalize(query)),
  );
  return exact.length
    ? exact
    : items.filter((s) =>
        terms.some((term) => normalize(s.title + " " + s.type).includes(term)),
      );
}
export async function findAssistantBusinesses(
  request: BookingRequest,
  zone: SearchZone | null,
) {
  const data = await getAssistantCatalogue();
  const query = normalize(request.businessQuery || request.serviceQuery || "");
  // An identified business takes precedence over the radius, without web discovery.
  const explicit = data.businesses.filter(
    (b) =>
      !!normalize(b.name) &&
      (query === normalize(b.name) || query.includes(normalize(b.name))),
  );
  if (request.businessQuery && !explicit.length)
    return { results: [], unresolved: 0, needsZone: false };
  let candidates = explicit;
  if (!candidates.length) {
    const terms = expandSearchTerms(request.serviceQuery || "");
    const serviceIds = new Set(
      matchingServices(data.services, request.serviceQuery).map(
        (s) => s.businessId,
      ),
    );
    candidates = data.businesses.filter(
      (b) =>
        serviceIds.has(b.id) ||
        terms.some((t) => normalize(b.name + " " + b.category).includes(t)),
    );
  }
  if (explicit.length)
    return {
      results: explicit.map(
        (business) => ({ business, explicit: true }) as BusinessResult,
      ),
      unresolved: 0,
      needsZone: false,
    };
  if (!zone) return { results: [], unresolved: 0, needsZone: true };
  const results: BusinessResult[] = [];
  let unresolved = 0;
  for (const business of candidates) {
    if (!business.location) {
      unresolved++;
      continue;
    }
    try {
      const coordinates = (await resolvePlaces(business.location))[0];
      if (!coordinates) {
        unresolved++;
        continue;
      }
      const distance = distanceKm(zone, coordinates);
      if (distance <= zone.radiusKm)
        results.push({ business, distance, explicit: false });
    } catch {
      unresolved++;
    }
  }
  return {
    results: results.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0)),
    unresolved,
    needsZone: false,
  };
}
export async function servicesForBusiness(
  business: Business,
  query: string | null,
) {
  const services = (await getAssistantCatalogue()).services.filter(
    (s) => s.businessId === business.id,
  );
  const matching = matchingServices(services, query);
  // A category (e.g. hair salon) can identify a business without naming its service.
  return matching.length ? matching : services;
}
export async function staffForService(
  business: Business,
  service: BookableItem,
): Promise<Staff[]> {
  return (await getStaff(business.id)).filter(
    (s) =>
      s.active &&
      isCloudId(s.id) &&
      (!s.serviceIds?.length || s.serviceIds.includes(service.id)),
  );
}
export async function slotsForRequest(
  option: { business: Business; service: BookableItem; staff?: Staff },
  request: BookingRequest,
) {
  if (!request.date) return [];
  // The same availability engine as manual Reservas. Never synthesize slots.
  const slots = await getAvailableSlots(
    option.business.id,
    option.service.id,
    request.date,
    option.staff?.id,
  );
  return slots.filter((slot) => {
    const time = slot.startDatetime.slice(11, 16);
    return (
      new Date(slot.startDatetime).getTime() > Date.now() &&
      (!request.timeFrom || time >= request.timeFrom) &&
      (!request.timeTo || time <= request.timeTo)
    );
  });
}
export async function confirmAssistantOption(
  option: ReservationOption,
  explicitlyConfirmed: boolean,
): Promise<Booking> {
  if (!explicitlyConfirmed)
    throw new Error("Confirma el resumen para crear la reserva.");
  if (
    !isCloudId(option.business.id) ||
    !isCloudId(option.service.id) ||
    (option.staff && !isCloudId(option.staff.id))
  )
    throw new Error("La opción no pertenece al catálogo real de GO.");
  // Refresh live service data, then use exactly the manual flow's sole write gate.
  const live = (await getBookableItems(option.business.id, true)).find(
    (s) => s.id === option.service.id && s.active && s.visible,
  );
  if (!live)
    throw new Error("El servicio ya no está disponible. Vuelve a buscar.");
  if (
    live.price !== option.service.price ||
    live.priceKnown !== option.service.priceKnown ||
    live.currency !== option.service.currency ||
    live.durationMinutes !== option.service.durationMinutes
  )
    throw new Error(
      "El servicio ha cambiado. Vuelve a revisar sus datos antes de confirmar.",
    );
  const businesses = await getActivebusinesses();
  if (!businesses.some((b) => b.id === option.business.id))
    throw new Error("La empresa ya no acepta reservas. Vuelve a buscar.");
  if (
    option.staff &&
    !(await staffForService(option.business, live)).some(
      (s) => s.id === option.staff!.id,
    )
  )
    throw new Error("El profesional ya no está disponible para este servicio.");
  const available = await getAvailableSlots(
    option.business.id,
    live.id,
    option.slot.startDatetime.slice(0, 10),
    option.staff?.id,
  );
  if (
    !available.some(
      (slot) =>
        slot.startDatetime === option.slot.startDatetime &&
        slot.endDatetime === option.slot.endDatetime,
    )
  )
    throw new Error("Ese horario ya no está disponible. Elige otra hora.");
  const result = await claimSlot({
    businessId: option.business.id,
    bookableItemId: option.service.id,
    staffId: option.staff?.id,
    customerId: "me",
    startDatetime: option.slot.startDatetime,
    endDatetime: option.slot.endDatetime,
    unitsReserved: 1,
    peopleCount: 1,
    status: "CONFIRMED",
    paymentStatus: "none",
  });
  if (!result.ok)
    throw new Error("Ese horario ya no está disponible. Elige otra hora.");
  // Calendar projection only; failure cannot turn a successful server write into a retry.
  try {
    await syncBookingToGoLog(
      result.booking,
      option.business,
      live,
      option.staff?.name,
      option.staff?.id,
    );
  } catch (error) {
    console.warn("[assistant] No se pudo actualizar la agenda local", error);
  }
  return result.booking;
}
export async function loadAssistantBookings(): Promise<Booking[]> {
  const id = await getAuthenticatedUserId();
  if (!id)
    throw new Error("Inicia sesión desde tu perfil para ver tus reservas.");
  return (await getLiveCustomerBookings())
    .filter((b) => isCloudId(b.id))
    .sort((a, b) => b.startDatetime.localeCompare(a.startDatetime));
}

export async function cancelAssistantBooking(booking: Booking): Promise<void> {
  await cancelBooking(booking.id);
  // Keep the existing calendar projection in sync without another booking write.
  try {
    await updatePersonalGoLog(entries => ({
      entries: entries.map(entry => entry.reservationId === booking.id
        ? { ...entry, deleted: true, estado: "rechazado", bookingStatus: "cancelada" }
        : entry),
      result: undefined,
    }));
  } catch (error) {
    console.warn("[assistant] No se pudo actualizar la agenda local", error);
  }
}
