import React, { useEffect, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Image } from "expo-image";
import { demoCatalogPhotoSource } from "@/data/demoCatalogPhotos";
import type { BookableItem } from "@/data/booking";

const PREFERENCE = "go_customer_catalog_photos_v1";

export function useCatalogPhotoPreference() {
  const [showPhotos, setShowPhotos] = useState(false);
  useEffect(() => { let active = true; void AsyncStorage.getItem(PREFERENCE).then(value => { if (active) setShowPhotos(value === "yes"); }).catch(() => {}); return () => { active = false; }; }, []);
  const choose = (value: boolean) => { setShowPhotos(value); void AsyncStorage.setItem(PREFERENCE, value ? "yes" : "no").catch(() => {}); };
  return { showPhotos, choose };
}

export function CatalogPhotoToggle({ showPhotos, choose }: { showPhotos: boolean; choose: (value: boolean) => void }) {
  return <View testID="catalog-photo-toggle" style={{ flexDirection: "row", alignSelf: "flex-end", gap: 6, paddingVertical: 6 }}>
    {([true, false] as const).map(value => <TouchableOpacity key={String(value)} accessibilityRole="button" accessibilityState={{ selected: showPhotos === value }}
      testID={value ? "catalog-with-photos" : "catalog-without-photos"} onPress={() => choose(value)} style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 10, borderRadius: 9, borderWidth: 1, borderColor: showPhotos === value ? "#D4A32B" : "#596475" }}>
      <Text style={{ color: showPhotos === value ? "#EEC54D" : "#FFFFFF", fontWeight: "700", fontSize: 12 }}>{value ? "Con fotos" : "Sin fotos"}</Text>
    </TouchableOpacity>)}
  </View>;
}

export function CatalogItemPhoto({ item, enabled, absolute = false }: { item: BookableItem; enabled: boolean; absolute?: boolean }) {
  const source = enabled ? demoCatalogPhotoSource(item) : undefined;
  return source ? <Image testID={`catalog-photo-${item.id}`} source={source} style={[{ width: 54, height: 54, borderRadius: 9 }, absolute && { position: "absolute", left: 8, top: 8 }]} contentFit="cover" accessibilityLabel={`Fotografía de ${item.title}`} /> : null;
}
