import React, { useState } from "react";
import { Alert, FlatList, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { demoCatalogExampleReference, demoCatalogExampleSource, demoCatalogPhotoCategories, catalogPhotoSource, filterDemoCatalogPhotoExamples, type DemoCatalogPhotoGroup } from "@/data/demoCatalogPhotos";

type Props = { id: string; businessId: string; title: string; type: string; photoUri?: string; demo: boolean; onChange: (value: string) => void | Promise<unknown> };

export function CatalogExampleGallery({ visible, onSelect, onClose, initialGroup = "Todas" }: {
  visible: boolean; onSelect: (reference: string) => void; onClose: () => void; initialGroup?: DemoCatalogPhotoGroup;
}) {
  const [group, setGroup] = useState<DemoCatalogPhotoGroup>(initialGroup);
  const [category, setCategory] = useState("Todas");
  const [query, setQuery] = useState("");
  const examples = filterDemoCatalogPhotoExamples(group, category, query);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} accessibilityViewIsModal>
    <View style={{ flex: 1, justifyContent: "center", backgroundColor: "#0009", paddingHorizontal: 16 }}>
      <View style={{ height: "82%", borderRadius: 16, backgroundColor: "#FFFFFF", padding: 16 }}>
        <Text accessibilityRole="header" style={{ color: "#172B4D", fontSize: 19, fontWeight: "700", marginBottom: 8 }}>Imágenes de ejemplo</Text>
        <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
          {(["Todas", "Peluquerías", "Restaurantes"] as const).map(value => <TouchableOpacity key={value} accessibilityRole="button"
            accessibilityState={{ selected: group === value }} onPress={() => { setGroup(value); setCategory("Todas"); }}
            style={{ flex: 1, minHeight: 42, borderRadius: 9, justifyContent: "center", backgroundColor: group === value ? "#CDE4FB" : "#EDF3FA" }}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={{ color: "#172B4D", textAlign: "center", fontWeight: "700", fontSize: 12 }}>{value}</Text>
          </TouchableOpacity>)}
        </View>
        <TextInput testID="catalog-examples-search" accessibilityLabel="Buscar imágenes de ejemplo" placeholder="Buscar plato o servicio"
          value={query} onChangeText={setQuery} autoCorrect={false}
          style={{ minHeight: 44, borderWidth: 1, borderColor: "#BCC8D8", borderRadius: 9, paddingHorizontal: 12, color: "#172B4D", marginBottom: 7 }} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0, marginBottom: 8 }}>
          {["Todas", ...demoCatalogPhotoCategories(group)].map(value => <TouchableOpacity key={value} accessibilityRole="button"
            accessibilityState={{ selected: category === value }} onPress={() => setCategory(value)}
            style={{ minHeight: 40, justifyContent: "center", paddingHorizontal: 11, marginRight: 6, borderRadius: 9, backgroundColor: category === value ? "#D7EAFE" : "#F0F3F6" }}>
            <Text style={{ color: "#172B4D", fontWeight: "600" }}>{value}</Text>
          </TouchableOpacity>)}
        </ScrollView>
        <FlatList data={examples} numColumns={3} keyExtractor={example => example.id} initialNumToRender={12} maxToRenderPerBatch={9} windowSize={5}
          columnWrapperStyle={{ justifyContent: "space-between" }} contentContainerStyle={{ paddingBottom: 8 }}
          ListEmptyComponent={<Text style={{ color: "#172B4D", padding: 12 }}>No hay imágenes con ese filtro.</Text>}
          renderItem={({ item: example }) => <TouchableOpacity testID={`catalog-example-${example.id}`} accessibilityRole="button"
                  accessibilityLabel={`Usar imagen de ejemplo: ${example.title}`} onPress={() => onSelect(demoCatalogExampleReference(example.id))}
                  style={{ width: "31%", minHeight: 118, alignItems: "center", paddingVertical: 5 }}>
                  <Image source={demoCatalogExampleSource(example.id)} style={{ width: 76, height: 76, borderRadius: 9 }} contentFit="cover" />
                  <Text numberOfLines={2} style={{ color: "#172B4D", fontSize: 12, textAlign: "center", marginTop: 4 }}>{example.title}</Text>
                </TouchableOpacity>} />
        <TouchableOpacity testID="catalog-examples-close" accessibilityRole="button" onPress={onClose}
          style={{ minHeight: 44, alignItems: "center", justifyContent: "center", borderRadius: 9, backgroundColor: "#E7EEF7", marginTop: 8 }}>
          <Text style={{ color: "#172B4D", fontWeight: "700" }}>Cerrar</Text>
        </TouchableOpacity>
      </View>
    </View>
  </Modal>;
}

/** Example references work for every company. Private files remain DEMO-only until secure storage exists. */
export function CatalogPhotoButton({ id, businessId, title, type, photoUri, demo, onChange }: Props) {
  const [examplesOpen, setExamplesOpen] = useState(false);
  const source = catalogPhotoSource({ id, businessId, title, type, photoUri });
  const applyPhoto = async (value: string) => {
    try { await onChange(value); }
    catch (error) { Alert.alert("Fotografía", error instanceof Error ? error.message : "No se pudo guardar la fotografía."); }
  };
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
      await applyPhoto(`data:${jpeg ? "image/jpeg" : "image/png"};base64,${encoded}`);
    } catch (error) { Alert.alert("Fotografía", error instanceof Error ? error.message : "No se pudo guardar la fotografía DEMO."); }
  };
  return <View style={{ width: 48, height: 48 }}><TouchableOpacity testID={`catalog-photo-${id}`} accessibilityRole="button" accessibilityLabel={source ? "Cambiar fotografía" : "Añadir fotografía"}
    onPress={() => Alert.alert("Fotografía", demo ? "Guardada solo en esta demostración" : "Las imágenes de ejemplo se guardan con este servicio. Las fotos propias necesitan almacenamiento empresarial seguro.", [
      { text: "Imágenes de ejemplo", onPress: () => setExamplesOpen(true) },
      ...(demo ? [
        { text: "Galería", onPress: () => { void pick(false); } },
        { text: "Cámara", onPress: () => { void pick(true); } },
      ] : []),
      ...(source ? [{ text: "Eliminar", style: "destructive" as const, onPress: () => { void applyPhoto("none"); } }] : []),
      { text: "Cancelar", style: "cancel" as const },
    ])}
    style={{ width: 48, height: 48, borderRadius: 9, borderWidth: 1, borderColor: "#BCC8D8", backgroundColor: "#EDF3FA", overflow: "hidden", alignItems: "center", justifyContent: "center" }}>
    {source ? <Image source={source} style={{ width: 46, height: 46 }} contentFit="cover" /> : <View><Feather name="camera" size={21} color="#54789E" /></View>}
  </TouchableOpacity>{examplesOpen && <CatalogExampleGallery visible initialGroup={type.toLowerCase().includes("peluquer") ? "Peluquerías" : type.toLowerCase().includes("restaur") ? "Restaurantes" : "Todas"} onSelect={reference => { setExamplesOpen(false); void applyPhoto(reference); }} onClose={() => setExamplesOpen(false)} />}</View>;
}
