import React from "react";
import { Alert, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { demoCatalogPhotoSource } from "@/data/demoCatalogPhotos";

type Props = { id: string; businessId: string; title: string; type: string; photoUri?: string; demo: boolean; onChange: (value: string) => void | Promise<unknown> };

/** DEMO images remain in the existing isolated company document, never in the live API. */
export function CatalogPhotoButton({ id, businessId, title, type, photoUri, demo, onChange }: Props) {
  const source = demoCatalogPhotoSource({ id, businessId, title, type, photoUri });
  const pick = async (camera: boolean) => {
    try {
      const permission = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert("Fotografía", "Se necesita permiso para acceder a la cámara o a la galería."); return; }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ["images"], base64: true, quality: 0.35, allowsEditing: true, aspect: [1, 1] };
      const result = camera ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled) return;
      const asset = result.assets?.[0], encoded = asset?.base64;
      const jpeg = !!encoded?.startsWith("/9j/"), png = !!encoded?.startsWith("iVBOR");
      if (!encoded || !((jpeg && asset?.mimeType === "image/jpeg") || (png && asset?.mimeType === "image/png")) || encoded.length > 360_000)
        throw new Error("Elige una imagen JPEG o PNG de menos de 270 KB tras la compresión.");
      await onChange(`data:${jpeg ? "image/jpeg" : "image/png"};base64,${encoded}`);
    } catch (error) { Alert.alert("Fotografía", error instanceof Error ? error.message : "No se pudo guardar la fotografía DEMO."); }
  };
  return <TouchableOpacity testID={`catalog-photo-${id}`} accessibilityRole="button" accessibilityLabel={source ? "Cambiar fotografía DEMO" : "Añadir fotografía DEMO"} accessibilityState={{ disabled: !demo }} disabled={!demo}
    onPress={() => Alert.alert("Fotografía DEMO", "Guardada solo en esta demostración", [
      { text: "Galería", onPress: () => { void pick(false); } },
      { text: "Cámara", onPress: () => { void pick(true); } },
      ...(source ? [{ text: "Eliminar", style: "destructive" as const, onPress: () => { void onChange("none"); } }] : []),
      { text: "Cancelar", style: "cancel" as const },
    ])}
    style={{ width: 48, height: 48, borderRadius: 9, borderWidth: 1, borderColor: "#BCC8D8", backgroundColor: "#EDF3FA", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
    {source ? <Image source={source} style={{ width: 46, height: 46 }} contentFit="cover" /> : <View><Feather name="camera" size={21} color="#54789E" /></View>}
  </TouchableOpacity>;
}
