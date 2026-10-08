import { useRef, useState } from "react";
import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  emptyBookingRequest,
  normalizeBookingText,
  type BookingRequest,
  type SearchZone,
  type AwaitingField,
} from "@workspace/api-zod";
import {
  type Business,
  type BookableItem,
  type Staff,
  type Booking,
} from "@/data/booking";
import {
  confirmAssistantOption,
  cancelAssistantBooking,
  findAssistantBusinesses,
  interpretRequest,
  localToday,
  resolvePlaces,
  servicesForBusiness,
  staffForService,
  slotsForRequest,
  loadAssistantBookings,
  getAssistantCatalogue,
  type BusinessResult,
  type Place,
  type ReservationOption,
} from "@/lib/bookingAssistant";

export type AssistantPanel =
  | "menu"
  | "attach"
  | "actions"
  | "zone"
  | "ergonomics"
  | "bookings"
  | "help"
  | "staff"
  | "cancel"
  | null;
const INTRO =
  "¿Qué necesitas hacer?\nPuedo ayudarte con reservas y gestionar tareas o actividades para tu calendario. Dímelo o escríbelo aquí.";
export const ASSISTANT_ZONE_KEY = "go_booking_assistant_zone_v1";
export function useBookingAssistant() {
  const [messages, setMessages] = useState([
    { id: 0, role: "assistant", text: INTRO },
  ]);
  const [request, setRequest] = useState<BookingRequest>(emptyBookingRequest);
  const [zone, setZone] = useState<SearchZone | null>(null);
  const [panel, setPanel] = useState<AssistantPanel>(null);
  const [phase, setPhase] = useState<
    "idle" | "businesses" | "services" | "slots" | "review" | "confirmed"
  >("idle");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [businesses, setBusinesses] = useState<BusinessResult[]>([]);
  const [services, setServices] = useState<BookableItem[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [slots, setSlots] = useState<ReservationOption[]>([]);
  const [option, setOption] = useState<ReservationOption | null>(null);
  const [created, setCreated] = useState<Booking | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [names, setNames] = useState<{
    businesses: Business[];
    services: BookableItem[];
  }>({ businesses: [], services: [] });
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [placeText, setPlaceText] = useState("");
  const [places, setPlaces] = useState<Place[]>([]);
  const [radiusText, setRadiusText] = useState("5");
  const [saveZone, setSaveZone] = useState(false);
  const awaiting = useRef<AwaitingField>(null);
  const selection = useRef<{
    business?: Business;
    service?: BookableItem;
    staff?: Staff;
  }>({});
  const generation = useRef(0);
  const lock = useRef(false);
  const req = useRef(request);
  const zoneRef = useRef(zone);
  const lastPlace = useRef<string | null>(null);
  const id = useRef(1);
  const say = (text: string, role = "assistant") =>
    setMessages((prev) => [
      ...prev.slice(-59),
      { id: id.current++, role, text },
    ]);
  const updateRequest = (value: BookingRequest) => {
    req.current = value;
    setRequest(value);
  };
  const updateZone = (value: SearchZone | null) => {
    zoneRef.current = value;
    setZone(value);
  };
  function check(token: number) {
    if (token !== generation.current) throw new Error("REQUEST_CANCELLED");
  }
  function invalidate() {
    generation.current++;
    lock.current = false;
    setBusy("");
  }
  async function work(
    label: string,
    operation: (token: number) => Promise<void>,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(label);
    setNotice("");
    const token = generation.current;
    try {
      await operation(token);
    } catch (e) {
      if (
        token === generation.current &&
        e instanceof Error &&
        e.message !== "REQUEST_CANCELLED"
      )
        setNotice(e.message);
    } finally {
      if (token === generation.current) {
        lock.current = false;
        setBusy("");
      }
    }
  }
  const ask = (field: AwaitingField, text: string) => {
    awaiting.current = field;
    say(text);
  };
  async function gpsZone(askPermission: boolean) {
    let permission = await Location.getForegroundPermissionsAsync();
    if (!permission.granted && askPermission)
      permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const result =
      (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ||
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    return {
      label: "Mi ubicación actual",
      latitude: result.coords.latitude,
      longitude: result.coords.longitude,
      radiusKm: zoneRef.current?.radiusKm || req.current.radiusKm || 5,
      source: "gps" as const,
    };
  }
  async function advance(next: BookingRequest, token: number) {
    if (!next.serviceQuery && !next.businessQuery) {
      ask("serviceQuery", "¿Qué servicio o actividad quieres reservar?");
      return;
    }
    awaiting.current = null;
    if (
      next.placeQuery &&
      normalizeBookingText(next.placeQuery) !==
        normalizeBookingText(lastPlace.current || "")
    ) {
      setBusy("Resolviendo zona…");
      const resolved = await resolvePlaces(next.placeQuery);
      check(token);
      if (!resolved.length) {
        ask(
          "placeQuery",
          "No he podido resolver esa zona. Escribe una población, código postal o dirección.",
        );
        return;
      }
      if (resolved.length > 1) {
        setSaveZone(false);
        setPlaceText(next.placeQuery);
        setPlaces(resolved);
        setRadiusText(String(next.radiusKm || zoneRef.current?.radiusKm || 5));
        setPanel("zone");
        say("He localizado estas zonas. Elige el centro de búsqueda.");
        return;
      }
      updateZone({
        ...resolved[0],
        radiusKm: next.radiusKm || zoneRef.current?.radiusKm || 5,
        source: "conversation",
      });
      lastPlace.current = next.placeQuery;
    }
    if (next.radiusKm && zoneRef.current) {
      updateZone({ ...zoneRef.current, radiusKm: next.radiusKm });
      setRadiusText(String(next.radiusKm));
    }
    if (!selection.current.business) {
      setBusy("Buscando…");
      let result = await findAssistantBusinesses(next, zoneRef.current);
      check(token);
      if (result.needsZone && !zoneRef.current) {
        const gps = await gpsZone(false).catch(() => null);
        check(token);
        if (gps) {
          updateZone(gps);
          result = await findAssistantBusinesses(next, gps);
          check(token);
        }
      }
      if (result.needsZone) {
        ask(
          "placeQuery",
          "¿Dónde quieres buscar? Dime una población, código postal o dirección, o elige Zona.",
        );
        return;
      }
      setBusinesses(result.results);
      if (!result.results.length) {
        setPhase("businesses");
        say(
          "No he encontrado opciones reservables en GO para esta búsqueda." +
            (result.unresolved
              ? " No se pudo comprobar la distancia de algunos negocios."
              : "") +
            " Puedes cambiar el servicio o la Zona.",
        );
        return;
      }
      if (result.unresolved)
        setNotice(
          "Algunos negocios se han omitido porque no se pudo comprobar su distancia.",
        );
      if (result.results.length > 1) {
        setPhase("businesses");
        say("Elige una empresa para consultar sus servicios y horarios.");
        return;
      }
      selection.current.business = result.results[0].business;
    }
    const business = selection.current.business!;
    if (!selection.current.service) {
      const list = await servicesForBusiness(business, next.serviceQuery);
      check(token);
      setServices(list);
      if (!list.length) {
        setPhase("services");
        say("Esta empresa no tiene servicios reservables disponibles en GO.");
        return;
      }
      if (list.length > 1) {
        setPhase("services");
        say("¿Qué servicio quieres en " + business.name + "?");
        return;
      }
      selection.current.service = list[0];
    }
    if (!next.date || next.date < localToday()) {
      setPhase("slots");
      setSlots([]);
      ask(
        "date",
        next.date
          ? "Esa fecha ya ha pasado. ¿Qué día prefieres?"
          : "¿Para qué día quieres reservar?",
      );
      return;
    }
    setBusy("Consultando disponibilidad…");
    const service = selection.current.service!;
    const list = await staffForService(business, service);
    check(token);
    setStaff(list);
    let professionals: (Staff | undefined)[] = selection.current.staff
      ? [selection.current.staff]
      : list.length
        ? list
        : [undefined];
    if (next.staffQuery) {
      professionals = list.filter((s) =>
        normalizeBookingText(s.name).includes(
          normalizeBookingText(next.staffQuery!),
        ),
      );
      if (!professionals.length) {
        setPanel("staff");
        ask(
          "staffQuery",
          "Elige un profesional disponible para este servicio.",
        );
        return;
      }
    }
    const result = (
      await Promise.all(
        professionals.map(async (person) =>
          (
            await slotsForRequest({ business, service, staff: person }, next)
          ).map((slot) => ({ business, service, staff: person, slot })),
        ),
      )
    ).flat();
    check(token);
    setSlots(
      result.sort((a, b) =>
        a.slot.startDatetime.localeCompare(b.slot.startDatetime),
      ),
    );
    setOption(null);
    setPhase("slots");
    say(
      result.length
        ? "Elige un horario para revisar la reserva."
        : "No hay horarios disponibles en esa fecha o franja. Puedes cambiar la fecha, la hora o el profesional.",
    );
  }
  function reset() {
    invalidate();
    selection.current = {};
    awaiting.current = null;
    setPhase("idle");
    setOption(null);
    setCreated(null);
    setBusinesses([]);
    setServices([]);
    setSlots([]);
    setStaff([]);
    setPanel(null);
    setNotice("");
    updateRequest({
      ...emptyBookingRequest(),
      placeQuery: zoneRef.current?.label || null,
      radiusKm: zoneRef.current?.radiusKm || null,
    });
    lastPlace.current = zoneRef.current?.label || null;
    setMessages([{ id: id.current++, role: "assistant", text: INTRO }]);
  }
  async function send(text: string, useAI: boolean, echo = true) {
    if (!text.trim() || lock.current) return;
    if (echo) say(text.trim(), "user");
    const n = normalizeBookingText(text);
    if (/^(mis reservas|ver mis reservas)$/.test(n)) {
      await showBookings();
      return;
    }
    if (/^(cancelar busqueda|nueva conversacion)$/.test(n)) {
      reset();
      return;
    }
    if (phase === "review") {
      say(
        "Revisa el resumen y pulsa «Confirmar reserva». Para cambiarlo, abre Acciones.",
      );
      return;
    }
    await work("Entendiendo tu solicitud…", async (token) => {
      const next = await interpretRequest(
        text.trim(),
        req.current,
        awaiting.current,
        useAI,
      );
      check(token);
      if (
        next.serviceQuery !== req.current.serviceQuery ||
        next.businessQuery !== req.current.businessQuery ||
        next.placeQuery !== req.current.placeQuery ||
        next.radiusKm !== req.current.radiusKm
      ) {
        selection.current = {};
        setCreated(null);
      }
      updateRequest(next);
      setOption(null);
      setSlots([]);
      setBusinesses([]);
      setServices([]);
      await advance(next, token);
    });
  }
  async function searchPlaces(text = placeText) {
    await work("Resolviendo zona…", async (token) => {
      const resolved = await resolvePlaces(text);
      check(token);
      setPlaces(resolved);
      if (!resolved.length)
        setNotice(
          "No se encontraron zonas. Prueba con una población o código postal.",
        );
    });
  }
  async function chooseZone(
    place: Place,
    source: SearchZone["source"] = "manual",
  ) {
    if (lock.current) return;
    const radius = Number(radiusText.replace(",", "."));
    if (!Number.isFinite(radius) || radius <= 0) {
      setNotice("Introduce una distancia mayor que cero.");
      return;
    }
    const selected: SearchZone = { ...place, radiusKm: radius, source };
    updateZone(selected);
    lastPlace.current = place.label;
    const next = {
      ...req.current,
      placeQuery: place.label.slice(0, 200),
      radiusKm: radius,
    };
    updateRequest(next);
    selection.current = {};
    setOption(null);
    setSlots([]);
    setCreated(null);
    setPanel(null);
    if (saveZone)
      await AsyncStorage.setItem(ASSISTANT_ZONE_KEY, JSON.stringify(selected));
    if (next.serviceQuery || next.businessQuery)
      await work("Buscando…", (token) => advance(next, token));
  }
  async function confirm() {
    if (!option || phase !== "review") return;
    await work("Confirmando reserva…", async (token) => {
      try {
        const booking = await confirmAssistantOption(option, true);
        check(token);
        setCreated(booking);
        setPhase("confirmed");
        say("Reserva confirmada. Puedes consultarla en Mis reservas.");
      } catch (error) {
        check(token);
        setOption(null);
        setSlots([]);
        setPhase("slots");
        say(
          "No se ha podido confirmar esta opción. Revisa Mis reservas antes de reintentar si se interrumpió la conexión. Puedes consultar otros horarios desde Acciones.",
        );
        throw error;
      }
    });
  }
  async function showBookings() {
    setPanel("bookings");
    setBookings([]);
    await work("Cargando reservas…", async (token) => {
      const rows = await loadAssistantBookings();
      check(token);
      setBookings(rows);
      const data = await getAssistantCatalogue().catch(() => null);
      check(token);
      if (data) setNames(data);
    });
  }
  function changeField(field: AwaitingField, text: string) {
    setPanel(null);
    setOption(null);
    setSlots([]);
    setCreated(null);
    setPhase("idle");
    awaiting.current = field;
    if (field === "serviceQuery") {
      selection.current = {};
      updateRequest({
        ...req.current,
        serviceQuery: null,
        businessQuery: null,
        staffQuery: null,
      });
    }

    say(text);
  }
  function chooseStaff(person?: Staff) {
    selection.current.staff = person;
    const next = { ...req.current, staffQuery: person?.name || null };
    updateRequest(next);
    setPanel(null);
    void work("Consultando disponibilidad…", (token) => advance(next, token));
  }
  async function confirmCancel() {
    if (!cancelTarget) return;
    await work("Cancelando reserva…", async (token) => {
      await cancelAssistantBooking(cancelTarget);
      check(token);
      setBookings((prev) =>
        prev.map((b) =>
          b.id === cancelTarget.id ? { ...b, status: "CANCELLED" } : b,
        ),
      );
      if (created?.id === cancelTarget.id)
        setCreated({ ...created, status: "CANCELLED" });
      setPanel(null);
      say("Reserva cancelada.");
    });
  }
  return {
    messages,
    request,
    zone,
    panel,
    phase,
    busy,
    notice,
    businesses,
    services,
    staff,
    slots,
    option,
    created,
    bookings,
    names,
    cancelTarget,
    placeText,
    places,
    radiusText,
    saveZone,
    selection,
    lock,
    lastPlace,
    setPanel,
    setPhase,
    setNotice,
    setBusy,
    setOption,
    setCancelTarget,
    setPlaceText,
    setPlaces,
    setRadiusText,
    setSaveZone,
    updateZone,
    updateRequest,
    say,
    work,
    check,
    invalidate,
    reset,
    send,
    advance,
    searchPlaces,
    chooseZone,
    confirm,
    showBookings,
    changeField,
    chooseStaff,
    confirmCancel,
    gpsZone,
  };
}
