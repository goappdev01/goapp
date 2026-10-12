import { useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { getAuthenticatedUserId } from "@/data/booking";
import {
  assistantZoneKey, readAssistantZonePreference, writeAssistantZonePreference, sameAssistantZonePreference,
  parseAssistantZonePreference, type AssistantZonePreference, type AssistantZoneScope,
} from "@/lib/assistantZonePreference";
export { ASSISTANT_ZONE_KEY } from "@/lib/assistantZonePreference";
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
  | "bookings"
  | "help"
  | "staff"
  | "cancel"
  | null;
const INTRO =
  "¿Qué necesitas hacer?\nPuedo ayudarte con reservas y gestionar tareas o actividades para tu calendario. Dímelo o escríbelo aquí.";
export function useBookingAssistant({ visible = true, scope = null, scopeReady = true }: {
  visible?: boolean; scope?: AssistantZoneScope | null; scopeReady?: boolean;
} = {}) {
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
  const [placeBusy, setPlaceBusy] = useState(false);
  const [placeNotice, setPlaceNotice] = useState("");
  const [pendingPlace, setPendingPlace] = useState<(Place & { source: SearchZone["source"] }) | null>(null);
  const placeGeneration = useRef(0);
  const pendingPlaceRef = useRef<typeof pendingPlace>(null);
  const placeQueryRef = useRef("");
  const [radiusText, setRadiusTextState] = useState("5");
  const [pendingCurrentLocation, setPendingCurrentLocation] = useState(false);
  const currentLocationRef = useRef(false);
  const [habitual, setHabitual] = useState<{ key: string | null; value: AssistantZonePreference | null }>({ key: null, value: null });
  const habitualRef = useRef<AssistantZonePreference | null>(null);
  const [zoneLoading, setZoneLoading] = useState(false);
  const [zoneSaving, setZoneSaving] = useState(false);
  const writingZone = useRef(false);
  const preferenceVersion = useRef(0);
  const draftVersion = useRef(0);
  const hydration = useRef<Promise<void>>(Promise.resolve());
  const scopeKey = scope ? assistantZoneKey(scope) : null;
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const readyScope = useRef(scopeReady);
  readyScope.current = scopeReady;
  const zoneScope = useRef(scopeKey);
  const presentation = useRef<{ visible: boolean; key: string | null }>({ visible: false, key: null });
  const mounted = useRef(true);
  const panelRef = useRef(panel);
  panelRef.current = panel;
  const habitualZone = scopeReady && habitual.key === scopeKey ? habitual.value : null;
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
  function rememberHabitual(key: string | null, value: AssistantZonePreference | null) { habitualRef.current = value; setHabitual({ key, value }); }
  function setRadiusText(text: string) { draftVersion.current++; setRadiusTextState(text); }
  function draftPreference(): AssistantZonePreference | null {
    const radiusKm = Number(radiusText.replace(",", "."));
    if (!Number.isFinite(radiusKm) || radiusKm <= 0) return null;
    if (currentLocationRef.current) return { mode: "current-location", radiusKm };
    const place = pendingPlaceRef.current || (zoneRef.current?.label === placeText ? zoneRef.current : null);
    return place ? parseAssistantZonePreference({ mode: "fixed", zone: { ...place, radiusKm } }) : null;
  }
  const saveZone = sameAssistantZonePreference(habitualZone, draftPreference());
  function prepareZoneDraft(preference: AssistantZonePreference | null) {
    cancelPlaceSearch();
    const fixed = preference?.mode === "fixed" ? preference.zone : preference ? null : zoneRef.current;
    const current = preference?.mode === "current-location" || (!preference && fixed?.source === "gps");
    currentLocationRef.current = !!current;
    setPendingCurrentLocation(!!current);
    pendingPlaceRef.current = fixed;
    setPendingPlace(fixed);
    placeQueryRef.current = fixed?.label || "";
    setPlaceText(fixed?.label || "");
    setPlaces([]);
    setPlaceNotice("");
    setRadiusTextState(String(preference?.mode === "current-location" ? preference.radiusKm : fixed?.radiusKm || 5));
  }
  function openZonePanel() {
    prepareZoneDraft(habitualZone);
    panelRef.current = "zone";
    setPanel("zone");
  }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; preferenceVersion.current++; }; }, []);
  useEffect(() => {
    if (!visible) presentation.current.visible = false;
    if (!scopeReady) { preferenceVersion.current++; if (zoneScope.current !== scopeKey) invalidate(); return; }
    if (zoneScope.current !== scopeKey) {
      zoneScope.current = scopeKey;
      invalidate(); updateZone(null); lastPlace.current = null;
      updateRequest({ ...req.current, placeQuery: null, radiusKm: null });
      rememberHabitual(scopeKey, null); prepareZoneDraft(null);
    }
    if (!visible) { preferenceVersion.current++; setZoneLoading(false); return; }
    const restoreDraft = !presentation.current.visible || presentation.current.key !== scopeKey;
    presentation.current = { visible: true, key: scopeKey };
    const version = ++preferenceVersion.current, draft = draftVersion.current;
    if (!scope) { rememberHabitual(null, null); setZoneLoading(false); return; }
    setZoneLoading(true);
    const valid = () => mounted.current && version === preferenceVersion.current && currentScope.current === scopeKey;
    hydration.current = readAssistantZonePreference(scope).then(preference => {
      if (!valid()) return;
      rememberHabitual(scopeKey, preference);
      if (restoreDraft && draft === draftVersion.current) {
        if (preference?.mode === "fixed" && !zoneRef.current && !req.current.placeQuery) {
          updateZone(preference.zone); lastPlace.current = preference.zone.label;
          updateRequest({ ...req.current, placeQuery: preference.zone.label.slice(0, 200), radiusKm: preference.zone.radiusKm });
        }
        if (panelRef.current === "zone") prepareZoneDraft(preference);
        else if (preference) setRadiusTextState(String(preference.mode === "fixed" ? preference.zone.radiusKm : preference.radiusKm));
      }
    }).catch(() => {
      if (valid()) { rememberHabitual(scopeKey, null); setNotice("No he podido recuperar tu zona habitual. Vuelve a abrir GO para intentarlo de nuevo."); }
    }).finally(() => { if (valid()) setZoneLoading(false); });
    return () => { preferenceVersion.current++; };
  }, [visible, scopeKey, scopeReady]);
  async function rememberZone() {
    if (writingZone.current || zoneLoading || !scopeReady) return;
    if (!scope) { setNotice("Inicia sesión para guardar tu zona habitual."); return; }
    const preference = draftPreference();
    if (!preference) { setNotice("Selecciona una ubicación válida y una distancia mayor que cero antes de guardarla."); return; }
    const key = scopeKey;
    writingZone.current = true; setZoneSaving(true); setNotice("");
    preferenceVersion.current++; // An earlier hydration must not replace this explicit save.
    try {
      const saved = await writeAssistantZonePreference(scope, preference, async () => {
        const user = await getAuthenticatedUserId();
        return readyScope.current && currentScope.current === key && user === scope.userId;
      });
      if (mounted.current && currentScope.current === key) {
        rememberHabitual(key, saved);
        setPlaceNotice("Zona habitual guardada. Aplicarla a una búsqueda es una acción independiente.");
      }
    } catch {
      if (mounted.current && currentScope.current === key)
        setNotice("No he podido guardar tu zona habitual. Comprueba tu sesión e inténtalo de nuevo.");
    } finally {
      writingZone.current = false;
      if (mounted.current) setZoneSaving(false);
    }
  }
  function check(token: number) {
    if (token !== generation.current) throw new Error("REQUEST_CANCELLED");
  }
  function invalidate() {
    cancelPlaceSearch();
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
    let result;
    try {
      result = (await Location.getLastKnownPositionAsync({ maxAge: 300000 })) ||
        await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    } catch { throw new Error("No se pudieron obtener coordenadas. Revisa la ubicación del dispositivo o escribe la zona."); }
    const { latitude, longitude } = result.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
      throw new Error("El dispositivo no ha devuelto coordenadas válidas. Puedes escribir la zona.");
    let label = `GPS: ${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
    if (askPermission) {
      try {
        const [address] = await Location.reverseGeocodeAsync({ latitude, longitude });
        const resolved = address && [address.street, address.streetNumber, address.postalCode, address.city || address.subregion, address.country].filter(Boolean).join(", ");
        if (resolved) label = resolved.slice(0, 200);
      } catch { /* Coordinates remain real and visible when reverse geocoding fails. */ }
    }
    return { label, latitude, longitude,
      radiusKm: zoneRef.current?.radiusKm || req.current.radiusKm || (habitualRef.current?.mode === "current-location" ? habitualRef.current.radiusKm : habitualRef.current?.zone.radiusKm) || 5,
      source: "gps" as const };
  }
  async function advance(next: BookingRequest, token: number) {
    await hydration.current;
    check(token);
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
  function cancelPlaceSearch() {
    placeGeneration.current++;
    setPlaceBusy(false);
  }
  function setPlaceQuery(text: string) {
    draftVersion.current++; currentLocationRef.current = false; setPendingCurrentLocation(false);
    cancelPlaceSearch();
    placeQueryRef.current = "";
    pendingPlaceRef.current = null;
    setPendingPlace(null);
    setPlaces([]);
    setPlaceNotice("");
    setPlaceText(text);
  }
  function pickPlace(place: Place, source: SearchZone["source"] = "manual") {
    draftVersion.current++; currentLocationRef.current = source === "gps"; setPendingCurrentLocation(source === "gps");
    cancelPlaceSearch();
    const selected = { ...place, source };
    pendingPlaceRef.current = selected;
    setPendingPlace(selected);
    setPlaceText(place.label);
    setPlaces([]);
    setPlaceNotice(source === "gps" && place.label.startsWith("GPS:")
      ? "Coordenadas obtenidas. No se pudo resolver la dirección; puedes aplicar estas coordenadas reales."
      : "Ubicación seleccionada. Pulsa Aplicar para usarla en la búsqueda.");
  }
  async function searchPlaces(text = placeText) {
    const token = ++placeGeneration.current;
    const query = text.trim();
    placeQueryRef.current = query;
    pendingPlaceRef.current = null;
    setPendingPlace(null);
    setPlaces([]);
    setPlaceNotice("");
    if (query.length < 2) {
      setPlaceBusy(false);
      setPlaceNotice("Escribe al menos dos caracteres para buscar una ubicación.");
      return;
    }
    setPlaceBusy(true);
    try {
      const resolved = await resolvePlaces(query);
      if (token !== placeGeneration.current) return;
      setPlaces(resolved);
      if (!resolved.length) setPlaceNotice("No se encontraron zonas. Prueba con una población, dirección o código postal.");
    } catch (error) {
      if (token === placeGeneration.current)
        setPlaceNotice(error instanceof Error ? error.message : "No se pudo buscar la ubicación. Inténtalo de nuevo.");
    } finally { if (token === placeGeneration.current) setPlaceBusy(false); }
  }
  useEffect(() => {
    if (panel !== "zone") { cancelPlaceSearch(); return; }
    if (pendingPlaceRef.current || placeQueryRef.current === placeText.trim() || placeText.trim().length < 2) return;
    const timer = setTimeout(() => { void searchPlaces(placeText); }, 400);
    return () => clearTimeout(timer);
  }, [placeText, panel]);
  useEffect(() => () => { placeGeneration.current++; }, []);
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
    zone: scopeReady && zoneScope.current === scopeKey ? zone : null,
    habitualZone,
    zoneLoading: !scopeReady || zoneLoading || (!!scope && habitual.key !== scopeKey),
    zoneSaving,
    pendingCurrentLocation: scopeReady && zoneScope.current === scopeKey && pendingCurrentLocation,
    rememberZone,
    openZonePanel,
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
    placeText: scopeReady && zoneScope.current === scopeKey ? placeText : "",
    placeBusy: scopeReady && zoneScope.current === scopeKey && placeBusy,
    placeNotice,
    pendingPlace: scopeReady && zoneScope.current === scopeKey ? pendingPlace : null,
    setPlaceQuery,
    pickPlace,
    places: scopeReady && zoneScope.current === scopeKey ? places : [],
    radiusText: scopeReady && zoneScope.current === scopeKey ? radiusText : "5",
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
