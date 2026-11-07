import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import type { ScrollViewInstance } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoAssistantButton } from "@/components/booking-assistant/BookingAssistantUI";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { browsePeople, orbitalPeopleAvoidRects, orbitalPeopleLayout, orbitalPeopleSearchScrollOffset, peopleOrbitPage, type OrbitalPerson } from "@/lib/orbitalPeople";

/** Bind only to a server-scoped SOPORTE membership query; ADMIN membership alone is not team membership. */
export type SupportTeamSource = {
  list(): Promise<readonly OrbitalPerson[]>;
  /** The source may expose this only after an authorized server response; the write must recheck permission. */
  canEditName?: (person: OrbitalPerson) => boolean;
  renameVisibleName?: (id: string, visibleName: string) => Promise<OrbitalPerson>;
};
export type TeamSatellite = { key: string; label: string; title: string; color: string; disabled: boolean; empty?: boolean;
  onPress: () => void; onLongPress?: () => void };
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [editing, setEditing] = useState<OrbitalPerson | null>(null), [nameDraft, setNameDraft] = useState("");
  const [editError, setEditError] = useState(""), [saving, setSaving] = useState(false);
  const lastLongPress = useRef<{ id: string; at: number } | null>(null), scroll = useRef<ScrollViewInstance | null>(null);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", event => setKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0)));
    const hiding = Keyboard.addListener("keyboardWillHide", () => setKeyboardHeight(0));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { shown.remove(); hiding.remove(); hidden.remove(); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    setQuery(""); setPage(0); setSelected(null); setEditing(null); setNameDraft(""); setMembers([]); setError("");
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
    if (keyboardHeight > 0 || Keyboard.isVisible?.()) { Keyboard.dismiss(); return; }
    if (editing) { setEditing(null); setEditError(""); return; }
    if (selected) { setSelected(null); return; }
    if (slice.page > 0) { setPage(slice.page - 1); return; }
    onClose();
  };
  const layout = orbitalPeopleLayout(window.width, window.height, insets, keyboardHeight);
  const showOrbit = keyboardHeight === 0 || !layout.scrollNeeded;
  const searchScrollOffset = orbitalPeopleSearchScrollOffset(layout, insets);
  const avoidRects = selected ? [] : orbitalPeopleAvoidRects(window.width, window.height, insets, layout, showOrbit);
  useEffect(() => {
    if (!visible || selected || editing || typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: searchScrollOffset, animated: true }));
  }, [visible, selected, editing, keyboardHeight, searchScrollOffset]);
  const editable = (person: OrbitalPerson) => !!source?.renameVisibleName && source.canEditName?.(person) === true;
  const satellites: TeamSatellite[] = Array.from({ length: 7 }, (_, slot) => {
    const person = slice.people[slot];
    if (!person) return { key: `empty:${slot}`, label: "", title: "", color: "#9ca3af", disabled: true, empty: true, onPress: () => {} };
    return { key: `person:${person.id}`, label: person.name, title: `${person.name}, código ${person.code}`,
      color: colors[slot], disabled: false,
      onPress: () => {
        if (lastLongPress.current?.id === person.id && Date.now() - lastLongPress.current.at < 900) return;
        Keyboard.dismiss(); setSelected(person);
      },
      onLongPress: editable(person) ? () => {
        lastLongPress.current = { id: person.id, at: Date.now() };
        setEditing(person); setNameDraft(person.name); setEditError("");
      } : undefined };
  });
  satellites.push({ key: "support-next", label: "SOPORTE", title: slice.hasNext ? "Siguiente página del equipo" : "Fin del equipo",
    color: "#9ca3af", disabled: !slice.hasNext, onPress: () => setPage(slice.page + 1) });
  const saveName = async () => {
    const person = editing, name = nameDraft.trim();
    if (!person || !editable(person) || saving) return;
    if (name.length < 2 || name.length > 80 || /[\u0000-\u001f\u007f]/.test(name)) {
      setEditError("Escribe un nombre visible de 2 a 80 caracteres."); return;
    }
    if (name === person.name) { setEditing(null); return; }
    setSaving(true); setEditError("");
    try {
      const saved = await source!.renameVisibleName!(person.id, name);
      if (!saved || saved.id !== person.id || saved.code !== person.code || saved.role !== person.role
        || typeof saved.name !== "string" || !saved.name.trim()) throw Error("Respuesta inválida");
      setMembers(current => current.map(row => row.id === person.id ? { ...row, name: saved.name.trim() } : row));
      setEditing(null); Keyboard.dismiss();
    } catch { setEditError("No se confirmó el cambio en el servidor."); }
    finally { setSaving(false); }
  };
  const navigation = <GoNavigationFloating screenKey="support-team" safeArea={false} handedness={handedness}
    protectedTop={insets.top + 72} protectedBottom={layout.navigationBottom} initialBottom={0} initialRight={8}
    avoidRects={avoidRects}>
    <GoCloseButton level="panel" keyboardVisible={keyboardHeight > 0} appearance="light" onPress={back}
      accessibilityLabel={keyboardHeight > 0 ? "Ocultar teclado" : editing ? "Cancelar edición" : selected ? "Volver al equipo" : slice.page > 0 ? "Página anterior" : "Volver a AYUDA ADMIN"}/>
  </GoNavigationFloating>;
  return <Modal visible={visible} animationType="fade" onRequestClose={back}>
    <View style={styles.screen}>
      <ScrollView ref={scroll} style={[styles.viewport, { bottom: layout.bottom }]}
        contentContainerStyle={{ minHeight: selected ? layout.viewportHeight : layout.contentHeight }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => { if (keyboardHeight > 0 && !selected && !editing)
          scroll.current?.scrollTo({ y: searchScrollOffset, animated: true }); }}>
        <View style={{ minHeight: selected ? layout.viewportHeight : layout.contentHeight }}>
          <View style={[styles.heading, { marginTop: insets.top + 8 }]}>
            <Text accessibilityRole="header" style={styles.title}>{selected ? "EQUIPO · SOPORTE" : "EQUIPO"}</Text>
            <Text style={styles.meta}>{selected ? "Ficha de trabajador" : `Página ${slice.page + 1} de ${slice.totalPages} · ${slice.total} trabajadores`}</Text>
            {!selected && (loading ? <ActivityIndicator color="#D5A932" /> : error ?
              <Text accessibilityRole="alert" style={styles.notice}>{error}</Text> : matching.length === 0 ?
              <Text style={styles.notice}>{query ? "No se encontraron trabajadores" : "No hay trabajadores de SOPORTE registrados."}</Text> : null)}
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
          </View> : <View style={styles.dock}>
            <TextInput accessibilityLabel="Buscar nombre o código" placeholder="Buscar nombre o código" placeholderTextColor="#81909E"
              value={query} onChangeText={value => { setQuery(value); setPage(0); }} returnKeyType="search" autoCorrect={false}
              clearButtonMode="while-editing" style={[styles.search, { width: Math.min(window.width - insets.left - insets.right - 36, 320) }]}/>
            <View pointerEvents={showOrbit ? "auto" : "none"}
              style={{ width: layout.wrap, height: layout.wrap, opacity: showOrbit ? 1 : 0 }}>
              {satellites.map((satellite, slot) => {
                const angle = -Math.PI / 2 + slot * Math.PI / 4;
                return <View key={satellite.key} pointerEvents={satellite.disabled ? "none" : "auto"}
                  style={{ position: "absolute", left: layout.wrap / 2 + Math.cos(angle) * layout.radius - layout.orbitSize / 2,
                    top: layout.wrap / 2 + Math.sin(angle) * layout.radius - layout.orbitSize / 2 }}>
                  {renderSatellite(satellite, layout.orbitSize)}
                </View>;
              })}
              <View style={{ position: "absolute", left: (layout.wrap - layout.goSize) / 2, top: (layout.wrap - layout.goSize) / 2 }}>
                <GoAssistantButton size={layout.goSize} onPress={onGoPress}/>
              </View>
            </View>
          </View>}
        </View>
      </ScrollView>
      {editing && <View style={[styles.editOverlay, { bottom: layout.bottom }]}>
        <View style={styles.editCard}>
          <Text style={styles.editTitle}>Nombre visible</Text>
          <Text style={styles.meta}>{editing.code}</Text>
          <TextInput accessibilityLabel="Nombre visible del trabajador" value={nameDraft} onChangeText={setNameDraft}
            maxLength={80} selectTextOnFocus style={styles.editInput}/>
          {!!editError && <Text accessibilityRole="alert" style={styles.editError}>{editError}</Text>}
          <View style={styles.editActions}>
            <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => { setEditing(null); setEditError(""); Keyboard.dismiss(); }} style={styles.editAction}>
              <Text style={styles.editActionText}>CANCELAR</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => void saveName()} style={styles.editAction}>
              <Text style={styles.editActionText}>{saving ? "GUARDANDO…" : "GUARDAR"}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>}
      {navigation}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#071626" },
  viewport: { position: "absolute", top: 0, left: 0, right: 0 },
  heading: { alignItems: "center", minHeight: 58, justifyContent: "center" },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  meta: { color: "#C9D3DD", fontSize: 13, textAlign: "center", paddingHorizontal: 22, paddingVertical: 8 },
  notice: { color: "#AEBCC9", fontSize: 12, textAlign: "center", paddingHorizontal: 22, marginTop: 2 },
  dock: { position: "absolute", bottom: 0, width: "100%", alignItems: "center", gap: 8 },
  search: { minHeight: 44, backgroundColor: "#F7F9FB", color: "#17212B", borderRadius: 14,
    borderWidth: 1, borderColor: "#A6B3BF", paddingHorizontal: 13, fontSize: 15 },
  detail: { alignSelf: "stretch", marginHorizontal: 22, marginTop: 24, padding: 20, borderRadius: 18,
    borderWidth: 1, borderColor: "#566A7B", backgroundColor: "#18293B", gap: 10 },
  personName: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" },
  detailText: { color: "#E2EAF2", fontSize: 16 },
  editOverlay: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(2,8,16,.72)",
    alignItems: "center", justifyContent: "center", zIndex: 50 },
  editCard: { width: "86%", maxWidth: 360, borderRadius: 18, backgroundColor: "#18293B", borderWidth: 1,
    borderColor: "#718394", padding: 18, gap: 8 },
  editTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", textAlign: "center" },
  editInput: { minHeight: 44, borderRadius: 12, backgroundColor: "#F7F9FB", color: "#17212B", paddingHorizontal: 12, fontSize: 16 },
  editActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  editAction: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#9EAFBD",
    alignItems: "center", justifyContent: "center" },
  editActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  editError: { color: "#FFB8BE", fontSize: 13 },
});
