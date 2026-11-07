import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoAssistantButton } from "@/components/booking-assistant/BookingAssistantUI";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { browsePeople, peopleOrbitPage, type OrbitalPerson } from "@/lib/orbitalPeople";

/** Bind only to a server-scoped SOPORTE membership query; ADMIN membership alone is not team membership. */
export type SupportTeamSource = { list(): Promise<readonly OrbitalPerson[]> };
export type TeamSatellite = { key: string; label: string; title: string; color: string; disabled: boolean; onPress: () => void };
const colors = ["#E87935", "#B26A5A", "#478F72", "#C34684", "#D5A932", "#537EBB", "#765FA7"];

/** The browser is reusable: only its data source and satellite renderer belong to SOPORTE. */
export function SupportTeamPanel({ visible, onClose, onGoPress, source, renderSatellite, handedness = "right" }: {
  visible: boolean; onClose: () => void; onGoPress: () => void; source?: SupportTeamSource;
  renderSatellite: (satellite: TeamSatellite, size: number) => React.ReactNode; handedness?: "left" | "right";
}) {
  const insets = useSafeAreaInsets(), window = useWindowDimensions();
  const [members, setMembers] = useState<readonly OrbitalPerson[]>([]), [query, setQuery] = useState("");
  const [page, setPage] = useState(0), [selected, setSelected] = useState<OrbitalPerson | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => { shown.remove(); hidden.remove(); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    setQuery(""); setPage(0); setSelected(null); setMembers([]); setError("");
    if (!source) { setLoading(false); setError("El directorio de SOPORTE está pendiente de conexión."); return; }
    setLoading(true);
    source.list().then(rows => {
      if (!current) return;
      if (!Array.isArray(rows) || rows.some(row => !row || !row.id || !row.code || !row.name || !row.role || typeof row.active !== "boolean"))
        throw Error("Directorio inválido");
      setMembers(rows);
    }).catch(() => { if (current) setError("No se pudo consultar el equipo de SOPORTE."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [visible, source]);
  const matching = useMemo(() => browsePeople(members, query), [members, query]);
  const slice = peopleOrbitPage(matching, page);
  const back = () => {
    if (keyboardVisible || Keyboard.isVisible?.()) { Keyboard.dismiss(); return; }
    if (selected) { setSelected(null); return; }
    if (slice.page > 0) { setPage(slice.page - 1); return; }
    onClose();
  };
  const scale = keyboardVisible ? 0.76 : Math.min(1.08, Math.max(0.76, Math.min((window.width - insets.left - insets.right - 28) / 280,
    (window.height - insets.top - insets.bottom - 270) / 280)));
  const orbitSize = Math.round(65 * scale), radius = Math.round(99 * scale), wrap = 2 * (radius + orbitSize / 2) + 12;
  const satellites: TeamSatellite[] = slice.people.map(person => ({ key: `person:${person.id}`, label: person.name,
    title: `${person.name}, código ${person.code}`, color: colors[slice.people.indexOf(person) % colors.length],
    disabled: false, onPress: () => { Keyboard.dismiss(); setSelected(person); } }));
  satellites.push({ key: "support-next", label: "SOPORTE", title: slice.hasNext ? "Siguiente página del equipo" : "Fin del equipo",
    color: "#9ca3af", disabled: !slice.hasNext, onPress: () => setPage(slice.page + 1) });
  const navigation = <GoNavigationFloating screenKey="support-team" safeArea={false} handedness={handedness}
    keyboardResponsive protectedTop={insets.top + 72} protectedBottom={insets.bottom + 12} initialBottom={0}>
    <GoCloseButton level="panel" keyboardVisible={keyboardVisible} appearance="light" onPress={back}
      accessibilityLabel={keyboardVisible ? "Ocultar teclado" : selected ? "Volver al equipo" : slice.page > 0 ? "Página anterior" : "Volver a AYUDA ADMIN"}/>
  </GoNavigationFloating>;
  return <Modal visible={visible} animationType="fade" onRequestClose={back}>
    <KeyboardAvoidingView style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView style={{ alignSelf: "stretch", flex: 1 }} contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <View style={styles.heading}>
        <Text accessibilityRole="header" style={styles.title}>{selected ? "EQUIPO · SOPORTE" : "EQUIPO"}</Text>
        <Text style={styles.meta}>{selected ? "Ficha de trabajador" : `Página ${slice.page + 1} de ${slice.totalPages} · ${slice.total} trabajadores`}</Text>
      </View>
      {selected ? <View style={styles.detail}>
        <Text style={styles.personName}>{selected.name}</Text>
        <Text style={styles.detailText}>Código: {selected.code}</Text>
        <Text style={styles.detailText}>Función: {selected.role}</Text>
        {selected.assignedRequests != null && <Text style={styles.detailText}>Solicitudes asignadas: {selected.assignedRequests}</Text>}
        {selected.pendingTasks != null && <Text style={styles.detailText}>Tareas pendientes: {selected.pendingTasks}</Text>}
        {selected.handledRequests != null && <Text style={styles.detailText}>Expedientes atendidos: {selected.handledRequests}</Text>}
        {selected.assignedRequests == null && selected.pendingTasks == null && selected.handledRequests == null &&
          <Text style={styles.meta}>La actividad individual todavía no está disponible.</Text>}
      </View> : <>
        <TextInput accessibilityLabel="Buscar nombre o código" placeholder="Buscar nombre o código" placeholderTextColor="#81909E"
          value={query} onChangeText={value => { setQuery(value); setPage(0); }} returnKeyType="search" autoCorrect={false}
          clearButtonMode="while-editing" style={styles.search}/>
        <View style={styles.orbitArea}>
          <View style={{ width: wrap, height: wrap }}>
            {satellites.map((satellite, index) => {
              const slot = index === satellites.length - 1 ? 7 : index;
              const angle = -Math.PI / 2 + slot * Math.PI / 4;
              return <View key={satellite.key} pointerEvents={satellite.disabled ? "none" : "auto"}
                style={{ position: "absolute", left: wrap / 2 + Math.cos(angle) * radius - orbitSize / 2,
                  top: wrap / 2 + Math.sin(angle) * radius - orbitSize / 2 }}>
                {renderSatellite(satellite, orbitSize)}
              </View>;
            })}
            <View style={{ position: "absolute", left: (wrap - 112) / 2, top: (wrap - 112) / 2 }}>
              <GoAssistantButton size={112} onPress={onGoPress}/>
            </View>
          </View>
        </View>
        {loading ? <ActivityIndicator color="#D5A932"/> : !!error ? <Text accessibilityRole="alert" style={styles.meta}>{error}</Text>
          : matching.length === 0 ? <Text style={styles.meta}>{query ? "No se encontraron trabajadores" : "No hay trabajadores de SOPORTE registrados."}</Text>
          : !slice.hasNext ? <Text style={styles.meta}>Fin del equipo</Text> : null}
      </>}
      </ScrollView>
      {navigation}
    </KeyboardAvoidingView>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#071626", alignItems: "center" },
  scroll: { flexGrow: 1, alignItems: "center", paddingBottom: 76 },
  heading: { alignItems: "center", minHeight: 58, justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  meta: { color: "#C9D3DD", fontSize: 13, textAlign: "center", paddingHorizontal: 22, paddingVertical: 8 },
  search: { width: "82%", minHeight: 44, backgroundColor: "#F7F9FB", color: "#17212B", borderRadius: 14,
    borderWidth: 1, borderColor: "#A6B3BF", paddingHorizontal: 13, fontSize: 15 },
  orbitArea: { flexGrow: 1, width: "100%", alignItems: "center", justifyContent: "center" },
  detail: { alignSelf: "stretch", marginHorizontal: 22, marginTop: 24, padding: 20, borderRadius: 18,
    borderWidth: 1, borderColor: "#566A7B", backgroundColor: "#18293B", gap: 10 },
  personName: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" },
  detailText: { color: "#E2EAF2", fontSize: 16 },
});
