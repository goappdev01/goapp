export type Coordinates = { latitude: number; longitude: number };
export type PlaceDestination = { address?: string; coordinates?: Coordinates; mapUrl?: string };
export type PlaceDraft = PlaceDestination & { title: string; source: "manual" | "received" | "link" | "current"; approximate?: boolean };
export type SavedPlace = PlaceDraft & { id: string; createdAt: number; favorite?: boolean };

export function readCoordinates(value: string): Coordinates | undefined {
  const match = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(value);
  if (!match) return;
  const latitude = Number(match[1]), longitude = Number(match[2]);
  if (Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180) return { latitude, longitude };
}

export const coordinateLabel = (point: Coordinates) => `${point.latitude}, ${point.longitude}`;

/** A map viewport (@lat,lng) is not evidence of a place pin. */
export function readMapsLink(value: string): PlaceDestination | undefined {
  const mapUrl = value.trim();
  if (mapUrl.length > 1800 || /[\\\s\x00-\x1f]/.test(mapUrl)) return;
  try {
    const url = new URL(mapUrl);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return;
    const path = decodeURIComponent(url.pathname);
    if (url.hostname === "maps.app.goo.gl" || url.hostname === "goo.gl") {
      const format = url.hostname === "goo.gl" ? /^\/maps\/[a-z0-9_-]+\/?$/i : /^\/[a-z0-9_-]+\/?$/i;
      return format.test(path) ? { mapUrl } : undefined;
    }
    const legacy = url.hostname === "maps.google.com";
    if (!legacy && url.hostname !== "www.google.com" && url.hostname !== "google.com") return;
    const mapsPath = /^(?:\/maps)?(?:\/?$|\/(?:place|search|dir)(?:\/|$)|\/@)/;
    if ((!legacy && !/^\/maps(?:\/|$)/.test(path)) || !mapsPath.test(path) || /[\x00-\x1f\\]/.test(path)) return;
    const query = url.searchParams.get("destination") || url.searchParams.get("query") || url.searchParams.get("q");
    const pin = path.includes("/place/") && path.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
    const coordinates = (query ? readCoordinates(query) : pin && readCoordinates(pin[1]+","+pin[2])) || undefined;
    const place = path.match(/\/place\/([^/]+)/)?.[1]?.replace(/\+/g," ");
    const address = (query || place || "").trim();
    return { mapUrl, ...(coordinates ? { coordinates } : address && address.length <= 240 && !/[\x00-\x1f]/.test(address) ? { address } : {}) };
  } catch { return undefined; }
}

export function routeForPlace(place: PlaceDestination): string | undefined {
  const target = place.coordinates ? coordinateLabel(place.coordinates) : place.address?.trim();
  if (target) return "https://www.google.com/maps/dir/?api=1&dir_action=navigate&destination="+encodeURIComponent(target);
  const safe = place.mapUrl ? readMapsLink(place.mapUrl) : undefined;
  if (!safe?.mapUrl) return;
  const original = new URL(safe.mapUrl);
  // Open only a recognized Maps path. Drop arbitrary query parameters on unresolved URLs.
  return original.origin + original.pathname;
}

const text = (value: unknown, limit: number) =>
  typeof value === "string" && value.trim().length <= limit && !/[\x00-\x1f]/.test(value) ? value.trim() : "";

export function normalizePlace(input: PlaceDraft): PlaceDraft {
  const title = text(input.title, 80), address = text(input.address, 240);
  const map = input.mapUrl ? readMapsLink(input.mapUrl) : undefined;
  if (input.mapUrl && !map) throw Error("Enlace de Google Maps no válido.");
  const coordinates = input.coordinates && readCoordinates(coordinateLabel(input.coordinates));
  if (input.coordinates && !coordinates) throw Error("Coordenadas no válidas.");
  if (!title || (!address && !coordinates && !map)) throw Error("Indica el nombre y una dirección, coordenadas o enlace de Google Maps.");
  return { title, source: input.source, address: address || map?.address, coordinates: coordinates || map?.coordinates,
    mapUrl: map?.mapUrl, approximate: input.approximate === true || undefined };
}

export function samePlace(left: PlaceDraft, right: PlaceDraft) {
  if (left.mapUrl && right.mapUrl && left.mapUrl === right.mapUrl) return true;
  const key = (place: PlaceDraft) => {
    if (place.mapUrl) {
      return routeForPlace(readMapsLink(place.mapUrl) || {});
    }
    return routeForPlace({...place,address:place.address?.trim().toLocaleLowerCase().replace(/\s+/g," ")});
  };
  const expected = key(left);
  return !!expected && expected === key(right);
}

export function moveSavedPlace(items: SavedPlace[], id: string, to: number) {
  const from = items.findIndex(item => item.id === id);
  if (from < 0 || to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

const MESSAGE_PREFIX = "GO-LOCATION:1 ";

export function locationMessage(input: PlaceDraft): string {
  const { title, address, coordinates, mapUrl, approximate } = normalizePlace(input);
  const body = MESSAGE_PREFIX + JSON.stringify({ title, address, coordinates, mapUrl: coordinates || address ? undefined : mapUrl, approximate });
  if (body.length > 1000) throw Error("El enlace es demasiado largo para compartirlo en este chat.");
  return body;
}

export function readLocationMessage(body: string): PlaceDraft | undefined {
  if (!body.startsWith(MESSAGE_PREFIX) || body.length > 1000) return;
  try {
    const { title, address, coordinates, mapUrl, approximate } = JSON.parse(body.slice(MESSAGE_PREFIX.length));
    return normalizePlace({ title, address, coordinates, mapUrl, approximate, source: "received" });
  } catch { return undefined; }
}
