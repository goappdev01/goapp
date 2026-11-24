import React, { useMemo, useState } from "react";
import { ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import type { Booking } from "@/data/booking";
import { businessClientsFromBookings, searchBusinessClients } from "@/data/businessClients";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = { businessId?: string; bookings: Booking[]; authorized: boolean; loading: boolean; error: string; isDark: boolean };

export function BusinessClientsScreen({ businessId, bookings, authorized, loading, error, isDark }: Props) {
  const { lang } = useLanguage();
  const en = lang === "en";
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const text = isDark ? "#F5F7FA" : "#111827";
  const secondary = isDark ? "#C5CCD7" : "#4B5563";
  const card = isDark ? "#171B24" : "#FFFFFF";
  const border = isDark ? "#374151" : "#DDE3EB";
  const clients = useMemo(() => authorized && businessId && !error ? businessClientsFromBookings(bookings, businessId) : [], [authorized, businessId, bookings, error]);
  const visible = useMemo(() => searchBusinessClients(clients, query), [clients, query]);
  const selected = clients.find(client => client.id === selectedId);
  const fallback = (id: string) => `${en ? "Client" : "Cliente"} · ${id.slice(0, 8)}`;
  return <ScrollView testID="business-clients-screen" keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingBottom: 90, gap: 12 }}>
    <Text style={{ color: text, fontSize: 21, fontWeight: "800" }}>{en ? "Clients" : "Clientes"}</Text>
    {!businessId ? <Text style={{ color: secondary }}>{en ? "No linked business is selected." : "No hay una empresa vinculada seleccionada."}</Text>
    : loading && !authorized ? <Text style={{ color: secondary }}>{en ? "Loading clients…" : "Cargando clientes…"}</Text>
    : error ? <Text accessibilityRole="alert" style={{ color: text }}>{en ? "Clients could not be loaded. Try again from Reservations." : "No se pudieron cargar los clientes. Reintenta desde Reservas."}</Text>
    : !authorized ? <Text style={{ color: secondary }}>{en ? "No verified access to this business." : "No hay acceso verificado a esta empresa."}</Text>
    : loading && !bookings.length ? <Text style={{ color: secondary }}>{en ? "Loading clients…" : "Cargando clientes…"}</Text>
    : <>
      <TextInput testID="business-clients-search" accessibilityLabel={en ? "Search clients" : "Buscar clientes"} placeholder={en ? "Search clients" : "Buscar clientes"} placeholderTextColor={secondary} value={query} onChangeText={setQuery} autoCorrect={false} style={{ color: text, backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, minHeight: 46, paddingHorizontal: 14 }} />
      {!clients.length ? <Text style={{ color: secondary }}>{en ? "This business has no clients with real bookings yet." : "Esta empresa aún no tiene clientes con reservas reales."}</Text>
        : !visible.length ? <Text style={{ color: secondary }}>{en ? "No matching clients." : "No hay clientes coincidentes."}</Text>
        : visible.map(client => <TouchableOpacity key={client.id} testID={`business-client-${client.id}`} accessibilityRole="button" onPress={() => setSelectedId(client.id)} style={{ backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, padding: 14, minHeight: 52 }}>
          <Text style={{ color: text, fontWeight: "700", fontSize: 16 }}>{client.name || fallback(client.id)}</Text>
          <Text style={{ color: secondary, fontSize: 13 }}>{client.bookingCount} {en ? (client.bookingCount === 1 ? "booking" : "bookings") : (client.bookingCount === 1 ? "reserva" : "reservas")}</Text>
        </TouchableOpacity>)}
      {selected && <View testID="business-client-detail" style={{ backgroundColor: card, borderColor: border, borderWidth: 1, borderRadius: 12, padding: 14, gap: 8 }}>
        <Text style={{ color: text, fontWeight: "800", fontSize: 17 }}>{selected.name || fallback(selected.id)}</Text>
        <Text style={{ color: secondary }}>{selected.bookingCount} {en ? "real bookings" : "reservas reales"}</Text>
        <Text style={{ color: secondary, fontSize: 13 }}>{en ? "Favorites, business notes and service preferences require secure server storage before they can be edited." : "Favoritos, observaciones y preferencias requieren almacenamiento seguro en el servidor antes de poder editarse."}</Text>
        <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedId(null)} style={{ minHeight: 44, justifyContent: "center" }}><Text style={{ color: "#4A80BD", fontWeight: "700" }}>{en ? "Close" : "Cerrar"}</Text></TouchableOpacity>
      </View>}
    </>}
  </ScrollView>;
}
