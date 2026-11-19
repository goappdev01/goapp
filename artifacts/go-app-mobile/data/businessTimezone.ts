import { validateBusinessTimezone } from "./serviceTiming";

type Coordinates = { latitude: number; longitude: number };
export type BusinessTimezoneLocation = { coordinates?: Coordinates; address?: string };
export type BusinessTimezoneDetection = { status: "resolved"; timezone: string } | { status: "missing" | "ambiguous" | "unavailable" | "invalid" };
type Geocoder = {
  geocodeAsync(address: string): Promise<Coordinates[]>;
  reverseGeocodeAsync(coordinates: Coordinates): Promise<Array<{ timezone?: string | null }>>;
};
export function businessTimezone(value?: string | null): string | undefined {
  if (!value) return;
  try {
    const zone = validateBusinessTimezone(value);
    if (!/^[A-Za-z_]+(?:\/[A-Za-z0-9_+.-]+)*$/.test(zone)) return;
    return new Intl.DateTimeFormat("en", { timeZone: zone }).resolvedOptions().timeZone;
  } catch { return; }
}
export function deviceTimezone(): string | undefined {
  try { return businessTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone); } catch { return; }
}
const validCoordinates = (point: Coordinates) => Number.isFinite(point.latitude) && Number.isFinite(point.longitude)
  && Math.abs(point.latitude) <= 90 && Math.abs(point.longitude) <= 180;

/** Uses the business location only, never GPS permission, country, language or the travelling owner's zone.
 * Native iOS geocoding supplies IANA identifiers; other platforms/providers may return no timezone.
 * A missing native result remains unresolved rather than inventing a geographic lookup or UTC offset.
 */
export async function detectBusinessTimezone(geocoder: Geocoder, location: BusinessTimezoneLocation): Promise<BusinessTimezoneDetection> {
  try {
    let point = location.coordinates;
    if (point && !validCoordinates(point)) return { status: "invalid" };
    if (!point) {
      if (!location.address?.trim()) return { status: "missing" };
      const points = await geocoder.geocodeAsync(location.address.trim());
      if (!points.length) return { status: "unavailable" };
      if (points.some(point => !validCoordinates(point))) return { status: "invalid" };
      const unique = [...new Map(points.map(point => [point.latitude + "|" + point.longitude, point])).values()];
      if (unique.length !== 1) return { status: "ambiguous" };
      point = unique[0];
    }
    const places = await geocoder.reverseGeocodeAsync(point);
    const zones = [...new Set(places.map(place => businessTimezone(place.timezone)).filter((zone): zone is string => !!zone))];
    if (zones.length > 1) return { status: "ambiguous" };
    return zones.length ? { status: "resolved", timezone: zones[0] } : { status: "unavailable" };
  } catch { return { status: "unavailable" }; }
}
