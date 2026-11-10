import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthenticatedUserId } from "./booking";
import { moveSavedPlace, normalizePlace, samePlace, type PlaceDraft, type SavedPlace } from "./contactPlaces";

export type PlacesContact = { id: string; name: string; places: SavedPlace[] };
const writes = new Map<string, Promise<PlacesContact[]>>();
const storageKey = (owner: string) => "go_contact_places_v1:" + encodeURIComponent(owner);
const newId = () => Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 11);

async function requireOwner(owner: string) {
  if (!owner || await getAuthenticatedUserId() !== owner) throw Error("La sesión ha cambiado. Vuelve a abrir Contactos.");
}

async function read(owner: string): Promise<PlacesContact[]> {
  await requireOwner(owner);
  const raw = await AsyncStorage.getItem(storageKey(owner));
  await requireOwner(owner);
  return raw ? JSON.parse(raw) : [];
}

export async function readPlacesContacts(owner: string) {
  await writes.get(owner)?.catch(() => {});
  return read(owner);
}

function update(owner: string, edit: (contacts: PlacesContact[]) => PlacesContact[]) {
  const operation = (writes.get(owner) ?? Promise.resolve()).catch(() => {}).then(async () => {
    const next = edit(await read(owner));
    await requireOwner(owner);
    await AsyncStorage.setItem(storageKey(owner), JSON.stringify(next));
    await requireOwner(owner);
    return next;
  });
  writes.set(owner, operation);
  void operation.finally(() => { if (writes.get(owner) === operation) writes.delete(owner); }).catch(() => {});
  return operation;
}

export const privateContactId = () => "manual:" + newId();

export function saveContactPlace(owner: string, contact: Pick<PlacesContact,"id" | "name">, draft: PlaceDraft, id?: string) {
  const place = normalizePlace(draft), name = contact.name.trim().slice(0,100);
  if (!contact.id || !name) throw Error("Elige un contacto para guardar el lugar.");
  return update(owner, contacts => {
    const current = contacts.find(item => item.id === contact.id);
    const places = current?.places ?? [];
    if (id && !places.some(item => item.id === id)) throw Error("El lugar ya no existe.");
    if (places.some(item => item.id !== id && samePlace(item,place))) {
      if (!id) return contacts;
      throw Error("El contacto ya tiene este lugar.");
    }
    const next = id
      ? places.map(item => item.id === id ? { ...item, ...place } : item)
      : [...places, { ...place, id: newId(), createdAt: Date.now() }];
    const saved = { id: contact.id, name, places: next };
    return current ? contacts.map(item => item.id === contact.id ? saved : item) : [...contacts, saved];
  });
}

export const arrangeContactPlace = (owner: string, contactId: string, placeId: string, index: number) =>
  update(owner, contacts => contacts.map(item => item.id === contactId ? { ...item, places: moveSavedPlace(item.places,placeId,index) } : item));

export const deleteContactPlace = (owner: string, contactId: string, placeId: string) =>
  update(owner, contacts => contacts.map(item => item.id === contactId ? { ...item, places: item.places.filter(place => place.id !== placeId) } : item));

export const favoriteContactPlace = (owner: string, contactId: string, placeId: string) =>
  update(owner, contacts => contacts.map(item => item.id === contactId
    ? { ...item, places: item.places.map(place => place.id === placeId ? { ...place, favorite: !place.favorite } : place) } : item));
