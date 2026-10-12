import { Platform } from "react-native";
import { fetchWithAuth, AuthSessionRequiredError } from "./authSession";
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
export class AssistantApiError extends Error {
  constructor(readonly code: string, message: string, readonly status?: number) {
    super(message);
    this.name = "AssistantApiError";
  }
}
const apiBase = () =>
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ||
  (process.env.EXPO_PUBLIC_DOMAIN
    ? "https://" + process.env.EXPO_PUBLIC_DOMAIN + "/api"
    : "/api");
export async function assistantApi<T>(path: string, body?: unknown): Promise<T> {
  const operation = path.startsWith("/places") ? "places"
    : path === "/transcribe" ? "voice" : "assistant";
  const fail = (code: string, status?: number): never => {
    // Internal diagnostics deliberately exclude URLs, query text, bodies and tokens.
    console.info("[assistant-api]", { code, operation, ...(status ? { status } : {}) });
    const message = status === 401 ? "Inicia sesión para continuar con GO."
      : code === "REQUEST_TIMEOUT" ? (operation === "voice"
        ? "GO ha tardado demasiado en procesar tu voz. Puedes escribir o intentarlo de nuevo."
        : "GO está tardando en responder. Inténtalo de nuevo en unos momentos.")
      : status === 429 ? "GO está recibiendo muchas solicitudes. Inténtalo de nuevo en unos momentos."
      : operation === "places" ? "No he podido buscar esa ubicación ahora. Inténtalo de nuevo en unos momentos."
      : operation === "voice" ? "No he podido procesar tu voz ahora. Puedes escribir o intentarlo de nuevo."
      : "No he podido conectar con GO ahora. Inténtalo de nuevo en unos momentos.";
    throw new AssistantApiError(code, message, status);
  };
  const base = apiBase();
  if (Platform.OS !== "web" && !/^https?:\/\//i.test(base)) fail("API_URL_MISSING");
  // React Native's AbortSignal has no timeout() static method. Use the same
  // controller/timer pattern as GO's existing registration return flow.
  const controller = new AbortController();
  let timedOut = false;
  // Voice includes up to 15 s of server authentication and 30 s of transcription.
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, operation === "voice" ? 55000 : 35000);
  try {
    const response = await fetchWithAuth(base + "/booking-assistant" + path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "Content-Type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    }, false);
    if (!response.ok) fail("HTTP_FAILURE", response.status);
    const data = await response.json().catch(() => fail(timedOut ? "REQUEST_TIMEOUT" : "INVALID_RESPONSE"));
    return data as T;
  } catch (error) {
    if (error instanceof AssistantApiError) throw error;
    if (error instanceof AuthSessionRequiredError) return fail("AUTH_REQUIRED", 401);
    return fail(timedOut ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE");
  } finally {
    clearTimeout(timeout);
  }
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
  if (!Array.isArray(data)) {
    console.info("[assistant-api]", { code: "INVALID_PLACES_RESPONSE", operation: "places" });
    throw new Error("No he podido buscar esa ubicación ahora. Inténtalo de nuevo en unos momentos.");
  }
  const places = data.filter(
    (p) =>
      p && typeof p.label === "string" &&
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
