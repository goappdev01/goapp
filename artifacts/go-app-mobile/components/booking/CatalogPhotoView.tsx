import React, { useEffect, useState } from "react";
import { Alert, Modal, Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { catalogPhotoSource } from "@/data/demoCatalogPhotos";
import { onSessionChanged } from "@/lib/sessionEvents";
import { getAuthenticatedUserId, getCatalogPhotoPreference, getCatalogPhotoUrl,
  isCatalogStorageReference, saveCatalogPhotoPreference, type BookableItem } from "@/data/booking";

const PREFERENCE = "go_customer_catalog_photos_v1";
type PhotoItem = Pick<BookableItem, "id" | "businessId" | "title" | "type" | "photoUri">;
const signedUrls = new Map<string, { url: string; until: number }>();

export function hasCatalogPhoto(item: PhotoItem): boolean {
  return !!catalogPhotoSource(item) || isCatalogStorageReference(item.photoUri);
}

export function useCatalogPhotoSource(item: PhotoItem, enabled = true): number | { uri: string } | undefined {
  const bundled = enabled ? catalogPhotoSource(item) : undefined;
  const remote = enabled && isCatalogStorageReference(item.photoUri) ? item.photoUri : undefined;
  const [sessionRevision, setSessionRevision] = useState(0);
  const [resolved, setResolved] = useState<{ ref: string; uri: string; revision: number } | null>(null);
  useEffect(() => onSessionChanged(() => { setResolved(null); setSessionRevision(value => value + 1); }), []);
  useEffect(() => {
    if (!remote) return;
    let active = true;
    void getAuthenticatedUserId().then(async userId => {
      if (!userId) return;
      const key = `${userId}:${remote}`, cached = signedUrls.get(key);
      const url = cached && cached.until > Date.now() ? cached.url : await getCatalogPhotoUrl(remote, userId);
      if (!cached || cached.until <= Date.now()) signedUrls.set(key, { url, until: Date.now() + 8 * 60_000 });
      if (active) setResolved({ ref: remote, uri: url, revision: sessionRevision });
    }).catch(() => { if (active) setResolved(null); });
    return () => { active = false; };
  }, [remote, sessionRevision]);
  return bundled ?? (remote && resolved?.ref === remote && resolved.revision === sessionRevision ? { uri: resolved.uri } : undefined);
}

export function useCatalogPhotoPreference(demo = false) {
  const [showPhotos, setShowPhotos] = useState(false);
  const [ready, setReady] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [sessionRevision, setSessionRevision] = useState(0);
  useEffect(() => onSessionChanged(() => { setReady(false); setShowPhotos(false); setUserId(null); setSessionRevision(value => value + 1); }), []);
  useEffect(() => {
    let active = true;
    setReady(false);
    const load = demo ? AsyncStorage.getItem(PREFERENCE).then(value => ({ value: value === "yes", user: null }))
      : getAuthenticatedUserId().then(async user => {
        if (!user) throw new Error("Inicia sesión para recuperar la vista del catálogo.");
        return { value: await getCatalogPhotoPreference(user), user };
      });
    void load.then(result => { if (active) { setShowPhotos(result.value); setUserId(result.user); setReady(true); } })
      .catch(() => { if (active) { setShowPhotos(false); setReady(false); } });
    return () => { active = false; };
  }, [demo, sessionRevision]);
  const choose = (value: boolean) => {
    if (!ready) { Alert.alert("Catálogo", "No se pudo recuperar la preferencia de esta cuenta."); return; }
    const previous = showPhotos;
    setShowPhotos(value);
    const write = demo ? AsyncStorage.setItem(PREFERENCE, value ? "yes" : "no")
      : userId ? saveCatalogPhotoPreference(value, userId) : Promise.reject(new Error("Sesión no disponible"));
    void write.catch(() => { setShowPhotos(previous); Alert.alert("Catálogo", "No se pudo guardar la vista de fotos."); });
  };
  return { showPhotos, choose, ready };
}

export function CatalogPhotoToggle({ showPhotos, choose, ready = true }: { showPhotos: boolean; choose: (value: boolean) => void; ready?: boolean }) {
  return <View testID="catalog-photo-toggle" style={{ flexDirection: "row", alignSelf: "flex-end", gap: 6, paddingVertical: 6 }}>
    {([true, false] as const).map(value => <TouchableOpacity key={String(value)} accessibilityRole="button" accessibilityState={{ selected: showPhotos === value, disabled: !ready }}
      disabled={!ready} testID={value ? "catalog-with-photos" : "catalog-without-photos"} onPress={() => choose(value)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: showPhotos === value ? "#D4A32B" : "#596475" }}>
      <Text style={{ color: showPhotos === value ? "#EEC54D" : "#FFFFFF", fontWeight: "700", fontSize: 12 }}>{value ? "Con fotos" : "Sin fotos"}</Text>
    </TouchableOpacity>)}
  </View>;
}

export function CatalogItemPhoto({ item, enabled, absolute = false, size = 54 }: { item: BookableItem; enabled: boolean; absolute?: boolean; size?: number }) {
  const source = useCatalogPhotoSource(item, enabled);
  const [expanded, setExpanded] = useState(false);
  if (!source) return null;
  return <>
    <TouchableOpacity testID={`catalog-photo-${item.id}`} accessibilityRole="button" accessibilityLabel={`Ampliar fotografía de ${item.title}`}
      onPress={event => { event?.stopPropagation?.(); setExpanded(true); }}
      style={[{ width: size, height: size, borderRadius: 9, overflow: "hidden", minWidth: 44, minHeight: 44 }, absolute && { position: "absolute", left: 8, top: 8, zIndex: 2 }]}>
      <Image source={source} style={{ width: size, height: size }} contentFit="cover" accessibilityLabel={`Fotografía de ${item.title}`} />
    </TouchableOpacity>
    <Modal visible={expanded} transparent animationType="fade" onRequestClose={() => setExpanded(false)}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.94)", justifyContent: "center", padding: 20 }}>
        <Image source={source} contentFit="contain" style={{ width: "100%", height: "72%" }} accessibilityLabel={`Fotografía ampliada de ${item.title}`} />
        <TouchableOpacity testID="catalog-photo-close" accessibilityRole="button" accessibilityLabel="Cerrar fotografía y volver al catálogo"
          onPress={() => setExpanded(false)} style={{ minHeight: 48, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: "#FFFFFF", fontSize: 17, fontWeight: "700" }}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    </Modal>
  </>;
}
