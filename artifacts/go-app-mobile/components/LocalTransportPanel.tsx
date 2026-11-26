import React, { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoScreenModal } from "@/components/ui/GoScreenModal";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { locateTransportLocality, openLocalTransport, resolveLocalTransport, transportLocality, type LocalTransportKind } from "@/data/localTransport";

/** Locality-only handoff to the existing browser mechanism. No booking is made. */
export function LocalTransportPanel({ kind, onClose, scopeKey, lang = "es", handedness = "right" }: {
  kind: LocalTransportKind | null; onClose: () => void; scopeKey: string;
  lang?: string; handedness?: "left" | "right";
}) {
  const insets = useSafeAreaInsets(), en = lang === "en";
  const label = (es: string, english: string) => en ? english : es;
  const [city, setCity] = useState(""), [country, setCountry] = useState("");
  const [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const generation = useRef(0), locked = useRef(false);
  const identity = `${scopeKey}|${kind ?? ""}`, active = useRef(identity); active.current = identity;
  useEffect(() => { generation.current++; locked.current = false; setBusy(false); setNotice(""); }, [identity]);
  // Reuse the locality chosen during this session, without a new storage contract.
  // Every opening still shows it for review; switching account/context clears it.
  useEffect(() => { setCity(""); setCountry(""); }, [scopeKey]);
  useEffect(() => () => { generation.current++; }, []);
  const invalidate = () => { generation.current++; locked.current = false; setBusy(false); setNotice(""); };
  const edit = (value: string, field: "city" | "country") => { invalidate(); (field === "city" ? setCity : setCountry)(value); };
  const valid = (token: number, owner: string) => token === generation.current && owner === active.current;
  const locate = async () => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setNotice("");
    const token = ++generation.current, owner = identity;
    try {
      const locality = await locateTransportLocality(Location, true, () => valid(token, owner));
      if (!valid(token, owner)) return;
      if (locality) { setCity(locality.city); setCountry(locality.country); setNotice(label("Comprueba la localidad antes de abrir el servicio.", "Check the locality before opening the service.")); }
      else setNotice(label("Ubicación no disponible o no autorizada. Escribe la localidad y el país.", "Location unavailable or not authorized. Enter the locality and country."));
    } catch { if (valid(token, owner)) setNotice(label("No se pudo obtener la localidad. Puedes escribirla manualmente.", "Could not obtain the locality. You can enter it manually.")); }
    finally { if (valid(token, owner)) { locked.current = false; setBusy(false); } }
  };
  const locality = transportLocality(city, country);
  const target = kind && locality ? resolveLocalTransport(kind, locality) : null;
  const open = async (search = false) => {
    if (!kind || !locality || locked.current) return;
    locked.current = true; setBusy(true); setNotice("");
    const token = ++generation.current, owner = identity;
    try {
      const next = search ? resolveLocalTransport(kind, locality, []) : target!;
      await openLocalTransport(next, url => Linking.openURL(url));
      // Stay available for locality changes and retries; never claim a reservation.
    } catch { if (valid(token, owner)) setNotice(label("No se pudo abrir el enlace. Puedes reintentar, cambiar de localidad o abrir la búsqueda externa.", "Could not open the link. Retry, change locality or open the external search.")); }
    finally { if (valid(token, owner)) { locked.current = false; setBusy(false); } }
  };
  const text = { color: "#ffffff", fontSize: 15 };
  const action = (title: string, onPress: () => void, disabled = false) => <TouchableOpacity accessibilityRole="button" accessibilityLabel={title} accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={{ minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: "#94a3b8", padding: 12, justifyContent: "center", opacity: disabled ? 0.45 : 1 }}><Text style={{ ...text, textAlign: "center", fontWeight: "700" }}>{title}</Text></TouchableOpacity>;
  return <GoScreenModal visible={!!kind} transparent animationType="fade" onRequestClose={onClose}>
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "flex-end", paddingTop: insets.top + 8 }}>
      <View style={{ backgroundColor: "#0e1624", borderRadius: 20, marginHorizontal: Math.max(12, insets.left, insets.right), marginBottom: insets.bottom + 8, maxHeight: "100%", padding: 16, gap: 8 }}>
        <View style={{ flexDirection: handedness === "left" ? "row-reverse" : "row", alignItems: "center", gap: 12 }}>
          <Text accessibilityRole="header" style={{ ...text, flex: 1, fontSize: 20, fontWeight: "700" }}>{kind === "taxi" ? "Taxi" : label("Transporte público", "Public transport")}</Text>
          <GoCloseButton level="panel" accessibilityLabel={label("Cerrar transporte", "Close transport")} onPress={onClose} touchSize={48} preserveTouchSize />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={{ gap: 10, paddingBottom: 8 }}>
          <Text style={text}>{label("Indica solo localidad y país, sin dirección personal.", "Enter only locality and country, without a personal address.")}</Text>
          <TextInput accessibilityLabel={label("Localidad", "Locality")} placeholder={label("Localidad", "Locality")} value={city} onChangeText={value => edit(value, "city")} maxLength={80} placeholderTextColor="#94a3b8" style={{ ...text, minHeight: 48, padding: 12, borderWidth: 1, borderColor: "#64748b", borderRadius: 12 }} />
          <TextInput accessibilityLabel={label("País", "Country")} placeholder={label("País", "Country")} value={country} onChangeText={value => edit(value, "country")} maxLength={80} placeholderTextColor="#94a3b8" style={{ ...text, minHeight: 48, padding: 12, borderWidth: 1, borderColor: "#64748b", borderRadius: 12 }} />
          <Text style={{ ...text, fontSize: 13 }}>{label("Opcional: al usar ubicación, autorizas enviar una posición aproximada al geocodificador del sistema para obtener la localidad. Solo funciona con el permiso de ubicación ya concedido. No se envían coordenadas al operador ni al buscador.", "Optional: using location authorizes sending an approximate position to the system geocoder to obtain the locality. Requires location permission already granted. No coordinates are sent to the operator or search engine.")}</Text>
          {action(label("Usar ubicación autorizada", "Use authorized location"), () => void locate(), busy)}
          {!!target && <>
            <Text style={text}>{target.name}</Text>
            <Text style={{ ...text, fontSize: 13 }}>{target.official
              ? label("Web oficial. La disponibilidad y cualquier reserva se confirman con el operador.", "Official website. Availability and any booking must be confirmed with the operator.")
              : label("Sin operador verificado para esta localidad. Se abrirá una búsqueda externa; comprueba la fuente antes de contratar.", "No verified operator for this locality. An external search will open; check the source before booking.")}</Text>
          </>}
          {action(target?.official ? label("Abrir web oficial", "Open official website") : label("Buscar externamente por localidad", "Search externally by locality"), () => void open(), busy || !target)}
          {!!target?.official && action(label("Buscar otra opción por localidad", "Search another option by locality"), () => void open(true), busy)}
          {!!notice && <Text accessibilityLiveRegion="polite" style={{ ...text, color: "#facc15" }}>{notice}</Text>}
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  </GoScreenModal>;
}
