import React, { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { Booking } from "@/data/booking";
import type { DemoBusinessClient } from "@/data/businessDemoStore";
import { businessClientsFromBookings, searchBusinessClients } from "@/data/businessClients";
import { useLanguage } from "@/contexts/LanguageContext";

type RealProps = { mode: "real"; businessId?: string; bookings: Booking[]; authorized: boolean; loading: boolean; error: string; isDark: boolean };
type DemoProps = { mode: "demo"; demoClients: DemoBusinessClient[]; onUpdateDemoClient: (id: string, patch: Partial<Pick<DemoBusinessClient, "favorite" | "observations" | "servicePreferences">>) => Promise<void>; isDark: boolean };
type ClientRow = { id: string; name: string; bookingCount?: number; favorite?: boolean; observations?: string; servicePreferences?: string };

export function BusinessClientsScreen(props: RealProps | DemoProps) {
  const { lang } = useLanguage();
  const en = lang === "en", demo = props.mode === "demo";
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [observations, setObservations] = useState("");
  const [preferences, setPreferences] = useState("");
  const [saveError, setSaveError] = useState("");
  const text = props.isDark ? "#F5F7FA" : "#111827";
  const secondary = props.isDark ? "#C5CCD7" : "#4B5563";
  const card = props.isDark ? "#171B24" : "#FFFFFF";
  const border = props.isDark ? "#374151" : "#DDE3EB";
  const clients = useMemo<ClientRow[]>(() => props.mode === "demo" ? props.demoClients
    : props.authorized && props.businessId && !props.error ? businessClientsFromBookings(props.bookings, props.businessId) : [], [props]);
  const visible = useMemo(() => searchBusinessClients(clients, query).filter(client => !demo || !favoritesOnly || client.favorite), [clients, query, demo, favoritesOnly]);
  const selected = clients.find(client => client.id === selectedId);
  const fallback = (id: string) => `${en ? "Client" : "Cliente"} · ${id.slice(0, 8)}`;
  const select = (client: ClientRow) => { setSelectedId(client.id); setObservations(client.observations ?? ""); setPreferences(client.servicePreferences ?? ""); setSaveError(""); };
  const update = async (id: string, patch: Partial<Pick<DemoBusinessClient, "favorite" | "observations" | "servicePreferences">>): Promise<boolean> => {
    if (props.mode !== "demo") return false;
    try { await props.onUpdateDemoClient(id, patch); setSaveError(""); return true; }
    catch { setSaveError(en ? "Could not save the DEMO changes." : "No se pudieron guardar los cambios DEMO."); return false; }
  };
  const button = (label: string, testID: string, onPress: () => void | Promise<unknown>, color = "#4A80BD") =>
    <TouchableOpacity testID={testID} accessibilityRole="button" onPress={onPress} style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: "center" }}><Text style={{ color, fontWeight: "700" }}>{label}</Text></TouchableOpacity>;
  return <ScrollView testID="business-clients-screen" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 110, gap: 12 }}>
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Text style={{ color: text, fontSize: 21, fontWeight: "800", flexShrink: 1 }}>{en ? "Clients" : "Clientes"}{demo ? " · DEMO" : ""}</Text>
      {demo && <TouchableOpacity testID="business-clients-favorites-filter" accessibilityRole="button" accessibilityState={{ selected: favoritesOnly }} onPress={() => setFavoritesOnly(value => !value)} style={{ minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderColor: border, borderWidth: 1, borderRadius: 12, backgroundColor: favoritesOnly ? "#C4883A" : card }}>
        <Text style={{ color: favoritesOnly ? "#FFFFFF" : text, fontWeight: "700" }}>{en ? "Favorites" : "Favoritos"}</Text>
      </TouchableOpacity>}
    </View>
    {props.mode === "real" && !props.businessId ? <Text style={{ color: secondary }}>{en ? "No linked business is selected." : "No hay una empresa vinculada seleccionada."}</Text>
    : props.mode === "real" && props.loading && !props.authorized ? <Text style={{ color: secondary }}>{en ? "Loading clients…" : "Cargando clientes…"}</Text>
    : props.mode === "real" && props.error ? <Text accessibilityRole="alert" style={{ color: text }}>{en ? "Clients could not be loaded. Try again from Reservations." : "No se pudieron cargar los clientes. Reintenta desde Reservas."}</Text>
    : props.mode === "real" && !props.authorized ? <Text style={{ color: secondary }}>{en ? "No verified access to this business." : "No hay acceso verificado a esta empresa."}</Text>
    : props.mode === "real" && props.loading && !props.bookings.length ? <Text style={{ color: secondary }}>{en ? "Loading clients…" : "Cargando clientes…"}</Text>
    : <>
      {demo && <Text style={{ color: secondary, fontSize: 13 }}>{en ? "Fictional clients saved only in this DEMO." : "Clientes ficticios guardados solo en esta DEMO."}</Text>}
      <TextInput testID="business-clients-search" accessibilityLabel={en ? "Search clients" : "Buscar clientes"} placeholder={en ? "Search clients" : "Buscar clientes"} placeholderTextColor={secondary} value={query} onChangeText={setQuery} autoCorrect={false} style={{ color: text, backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 14 }} />
      {!clients.length ? <Text style={{ color: secondary }}>{en ? "This business has no clients with real bookings yet." : "Esta empresa aún no tiene clientes con reservas reales."}</Text>
        : !visible.length ? <Text style={{ color: secondary }}>{favoritesOnly ? (en ? "No favorite clients match." : "No hay favoritos coincidentes.") : (en ? "No matching clients." : "No hay clientes coincidentes.")}</Text>
        : visible.map(client => <View key={client.id} style={{ backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, flexDirection: "row", alignItems: "center", minHeight: 52 }}>
          <TouchableOpacity testID={`business-client-${client.id}`} accessibilityRole="button" onPress={() => select(client)} style={{ flex: 1, minHeight: 52, padding: 12, justifyContent: "center" }}>
            <Text style={{ color: text, fontWeight: "700", fontSize: 16 }}>{client.name || fallback(client.id)}</Text>
            {!demo && <Text style={{ color: secondary, fontSize: 13 }}>{client.bookingCount} {en ? (client.bookingCount === 1 ? "booking" : "bookings") : (client.bookingCount === 1 ? "reserva" : "reservas")}</Text>}
          </TouchableOpacity>
          {demo && <TouchableOpacity testID={`business-client-favorite-${client.id}`} accessibilityRole="button" accessibilityLabel={client.favorite ? (en ? "Remove favorite" : "Quitar favorito") : (en ? "Add favorite" : "Añadir favorito")} accessibilityState={{ selected: !!client.favorite }} onPress={() => update(client.id, { favorite: !client.favorite })} style={{ width: 48, height: 52, alignItems: "center", justifyContent: "center" }}><Feather name="star" size={23} color={client.favorite ? "#C4883A" : secondary} /></TouchableOpacity>}
        </View>)}
      {selected && <View testID="business-client-detail" style={{ backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 10 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
          <Text style={{ color: text, fontWeight: "800", fontSize: 17, flexShrink: 1 }}>{selected.name || fallback(selected.id)}</Text>
          {demo && <TouchableOpacity testID="business-client-detail-favorite" accessibilityRole="button" accessibilityLabel={selected.favorite ? (en ? "Remove favorite" : "Quitar favorito") : (en ? "Add favorite" : "Añadir favorito")} accessibilityState={{ selected: !!selected.favorite }} onPress={() => update(selected.id, { favorite: !selected.favorite })} style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}><Feather name="star" size={24} color={selected.favorite ? "#C4883A" : secondary} /></TouchableOpacity>}
        </View>
        {demo ? <>
          <Text style={{ color: secondary, fontSize: 13 }}>{en ? "Do not enter real or sensitive information." : "No introduzcas datos reales ni sensibles."}</Text>
          <Text style={{ color: text, fontWeight: "700" }}>{en ? "Business observations" : "Observaciones"}</Text>
          <TextInput testID="business-client-observations" accessibilityLabel={en ? "Business observations" : "Observaciones"} multiline maxLength={500} value={observations} onChangeText={setObservations} placeholder={en ? "Optional" : "Opcional"} placeholderTextColor={secondary} style={{ color: text, backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 10, minHeight: 54, padding: 10, textAlignVertical: "top" }} />
          <Text style={{ color: text, fontWeight: "700" }}>{en ? "Service preferences" : "Preferencias de servicio"}</Text>
          <TextInput testID="business-client-preferences" accessibilityLabel={en ? "Service preferences" : "Preferencias de servicio"} multiline maxLength={500} value={preferences} onChangeText={setPreferences} placeholder={en ? "Optional" : "Opcional"} placeholderTextColor={secondary} style={{ color: text, backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 10, minHeight: 54, padding: 10, textAlignVertical: "top" }} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {button(en ? "Save" : "Guardar", "business-client-save", () => update(selected.id, { observations: observations.trim(), servicePreferences: preferences.trim() }), "#3D9A84")}
            {button(en ? "Clear observations" : "Borrar observaciones", "business-client-clear-observations", async () => { if (await update(selected.id, { observations: "" })) setObservations(""); }, "#C25A5A")}
            {button(en ? "Clear preferences" : "Borrar preferencias", "business-client-clear-preferences", async () => { if (await update(selected.id, { servicePreferences: "" })) setPreferences(""); }, "#C25A5A")}
          </View>
          {!!saveError && <Text accessibilityRole="alert" style={{ color: "#C25A5A" }}>{saveError}</Text>}
        </> : <>
          <Text style={{ color: secondary }}>{selected.bookingCount} {en ? "real bookings" : "reservas reales"}</Text>
          <Text style={{ color: secondary, fontSize: 13 }}>{en ? "Favorites, business notes and service preferences require secure server storage before they can be edited." : "Favoritos, observaciones y preferencias requieren almacenamiento seguro en el servidor antes de poder editarse."}</Text>
        </>}
        {button(en ? "Close" : "Cerrar", "business-client-detail-close", () => setSelectedId(null))}
      </View>}
    </>}
  </ScrollView>;
}
