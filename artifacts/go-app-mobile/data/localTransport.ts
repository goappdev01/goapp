export type LocalTransportKind = "taxi" | "public";
export type TransportLocality = { city: string; country: string };
type OfficialLink = { name: string; url: string; purpose: "booking" | "planner" | "contact"; evidence: string };
export type TransportSource = { city: string; country: string; taxi?: OfficialLink; public?: OfficialLink };
export type TransportTarget = { url: string; name: string; official: boolean; purpose: OfficialLink["purpose"] | "search" };

// Primary operator/authority pages checked on 2026-11-26. Exact municipality and
// country matching only: these are verified entry points, not universal coverage
// or live vehicle availability. Never infer coverage from a neighbouring city.
export const OFFICIAL_LOCAL_TRANSPORT: readonly TransportSource[] = [
  { city: "Molina de Segura", country: "ES",
    taxi: { name: "Radio Taxi Molina de Segura", url: "https://radiotaximolina.com/", purpose: "contact", evidence: "https://radiotaximolina.com/" },
    public: { name: "Autocares de Molina · Horarios urbanos", url: "https://www.autocaresdemolina.com/horarios/", purpose: "planner", evidence: "https://www.autocaresdemolina.com/" } },
  { city: "Murcia", country: "ES",
    taxi: { name: "Radio Taxi Murcia", url: "https://www.radiotaximurcia.com/", purpose: "contact", evidence: "https://www.radiotaximurcia.com/" } },
  { city: "Madrid", country: "ES",
    taxi: { name: "Radioteléfono Taxi · Pedir taxi", url: "https://www.radiotelefono-taxi.com/pedir-taxi", purpose: "booking", evidence: "https://www.radiotelefono-taxi.com/" },
    public: { name: "Consorcio Regional de Transportes de Madrid", url: "https://www.crtm.es/", purpose: "planner", evidence: "https://www.crtm.es/" } },
  { city: "Barcelona", country: "ES",
    taxi: { name: "AMB · Picmi Taxi", url: "https://taxi.amb.cat/es/usuaris/picmi-taxi", purpose: "booking", evidence: "https://taxi.amb.cat/es/usuaris/picmi-taxi" },
    public: { name: "TMB · Cómo llegar", url: "https://www.tmb.cat/es/barcelona/como-llegar?operador=bus", purpose: "planner", evidence: "https://www.tmb.cat/es/barcelona/como-llegar?operador=bus" } },
];

const normalized = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, " ");
const countryKey = (value: string) => ["es", "espana", "spain", "espanya"].includes(normalized(value)) ? "es" : normalized(value);
export function transportLocality(city: string, country: string): TransportLocality | null {
  const clean = (value: string) => value.trim().replace(/\s+/g, " ");
  const name = /^[\p{L}\p{M}][\p{L}\p{M}\s.'’()\-]{0,79}$/u;
  const result = { city: clean(city), country: clean(country) };
  // No coordinates, street numbers, URLs or arbitrary query parameters leave here.
  return name.test(result.city) && name.test(result.country) ? result : null;
}
export function safeTransportUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !!url.hostname && !url.username && !url.password && !url.port && !url.hash;
  } catch { return false; }
}
export function resolveLocalTransport(kind: LocalTransportKind, locality: TransportLocality,
  sources: readonly TransportSource[] = OFFICIAL_LOCAL_TRANSPORT): TransportTarget {
  const place = transportLocality(locality.city, locality.country);
  if (!place) throw Error("TRANSPORT_LOCALITY_REQUIRED");
  const source = sources.find(source => normalized(source.city) === normalized(place.city)
    && countryKey(source.country) === countryKey(place.country))?.[kind];
  if (source && safeTransportUrl(source.url)) return { ...source, official: true };
  const query = `${kind === "taxi" ? "taxi servicio oficial contacto reserva" : "transporte público operador oficial rutas horarios"} ${place.city} ${place.country}`;
  return { name: `${place.city} · ${place.country}`, official: false, purpose: "search",
    url: "https://www.google.com/search?q=" + encodeURIComponent(query) };
}
export async function openLocalTransport(target: TransportTarget, openURL: (url: string) => Promise<unknown>): Promise<void> {
  if (!safeTransportUrl(target.url)) throw Error("TRANSPORT_UNSAFE_URL");
  await openURL(target.url);
}

type LocationAdapter = {
  getForegroundPermissionsAsync: () => Promise<{ status: string }>;
  getCurrentPositionAsync: (options: { accuracy: number }) => Promise<{ coords: { latitude: number; longitude: number } }>;
  reverseGeocodeAsync: (point: { latitude: number; longitude: number }) => Promise<Array<{ city?: string | null; isoCountryCode?: string | null; country?: string | null }>>;
  Accuracy: { Lowest: number };
};
/** Only call after the dedicated geocoding disclosure was explicitly accepted.
 * Reuse existing native location APIs, with no new permission request, server,
 * stored coordinates, background tracking or operator/browsing location payload.
 */
export async function locateTransportLocality(adapter: LocationAdapter, geocoderConsent: boolean,
  isActive: () => boolean = () => true): Promise<TransportLocality | null> {
  if (!geocoderConsent) throw Error("TRANSPORT_GEOCODER_CONSENT_REQUIRED");
  if (!isActive() || (await adapter.getForegroundPermissionsAsync()).status !== "granted" || !isActive()) return null;
  const { coords } = await adapter.getCurrentPositionAsync({ accuracy: adapter.Accuracy.Lowest });
  if (!isActive()) return null;
  if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || Math.abs(coords.latitude) > 90 || Math.abs(coords.longitude) > 180) return null;
  // City resolution needs no street-level precision. Ask for a fresh coarse fix
  // on each voluntary lookup, then discard it; do not reuse a stale travel fix.
  const [address] = await adapter.reverseGeocodeAsync({ latitude: Number(coords.latitude.toFixed(2)), longitude: Number(coords.longitude.toFixed(2)) });
  return isActive() && address?.city ? transportLocality(address.city, address.isoCountryCode || address.country || "") : null;
}
