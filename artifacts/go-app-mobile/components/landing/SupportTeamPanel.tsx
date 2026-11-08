import React, { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Keyboard, Modal, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import type { ScrollViewInstance } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoAssistantButton } from "@/components/booking-assistant/BookingAssistantUI";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoNavigationFloating } from "@/components/ui/GoNavigationFloating";
import { browsePeople, orbitalPeopleAvoidRects, orbitalPeopleLayout, orbitalPeopleSearchScrollOffset, peopleOrbitPage, type OrbitalPerson } from "@/lib/orbitalPeople";
import { createOrbitalDemoPerson, orbitalDemoStorageKey, parseOrbitalDemoDirectory,
  updateOrbitalDemoPerson, validVisibleName, type OrbitalDemoDirectory } from "@/lib/orbitalPeopleDemo";

/** Every real operation must enforce team scope and permission on the server again. */
export type SupportTeamSource = {
  list(): Promise<readonly OrbitalPerson[]>;
  canEditName?: (person: OrbitalPerson) => boolean;
  renameVisibleName?: (id: string, visibleName: string) => Promise<OrbitalPerson>;
  canEditRole?: (person: OrbitalPerson) => boolean;
  canSetActive?: (person: OrbitalPerson) => boolean;
  updateMember?: (id: string, changes: { name?: string; role?: string; active?: boolean }) => Promise<OrbitalPerson>;
  canCreateMember?: () => boolean;
  createMember?: (name: string, code?: string) => Promise<OrbitalPerson>;
};
export type OrbitalPeopleSource = SupportTeamSource;
export type TeamSatellite = { key: string; label: string; title: string; color: string; disabled: boolean; empty?: boolean; inactive?: boolean;
  onPress: () => void; onLongPress?: () => void };
const colors = ["#E87935", "#B26A5A", "#478F72", "#C34684", "#D5A932", "#537EBB", "#765FA7"];

/** One orbital browser can be supplied with a separately authorized directory from any team. */
export function SupportTeamPanel({ visible, onClose, onGoPress, source, renderSatellite, handedness = "right",
  directoryKey = "support", directoryLabel = "EQUIPO", nextLabel = "SOPORTE", accountScope = "anonymous",
  memberSingular = "trabajador", memberPlural = "trabajadores", originLabel = "AYUDA ADMIN" }: {
  visible: boolean; onClose: () => void; onGoPress: () => void; source?: SupportTeamSource;
  renderSatellite: (satellite: TeamSatellite, size: number) => React.ReactNode; handedness?: "left" | "right";
  directoryKey?: string; directoryLabel?: string; nextLabel?: string; accountScope?: string;
  memberSingular?: string; memberPlural?: string; originLabel?: string;
}) {
  const insets = useSafeAreaInsets(), window = useWindowDimensions();
  const [members, setMembers] = useState<readonly OrbitalPerson[]>([]), [query, setQuery] = useState("");
  const [page, setPage] = useState(0), [selected, setSelected] = useState<OrbitalPerson | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState("");
  const [demo, setDemo] = useState<OrbitalDemoDirectory | null>(null), [showInactive, setShowInactive] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [editing, setEditing] = useState<OrbitalPerson | null>(null), [nameDraft, setNameDraft] = useState("");
  const [roleDraft, setRoleDraft] = useState(""), [activeDraft, setActiveDraft] = useState(true);
  const [creating, setCreating] = useState(false), [codeDraft, setCodeDraft] = useState("");
  const [editError, setEditError] = useState(""), [saving, setSaving] = useState(false);
  const lastLongPress = useRef<{ id: string; at: number } | null>(null), scroll = useRef<ScrollViewInstance | null>(null);
  const writeBusy = useRef(false), session = useRef(0);
  const demoKey = orbitalDemoStorageKey(directoryKey, accountScope);
  useEffect(() => {
    const shown = Keyboard.addListener("keyboardDidShow", event => setKeyboardHeight(Math.max(0, event.endCoordinates?.height ?? 0)));
    const hiding = Keyboard.addListener("keyboardWillHide", () => setKeyboardHeight(0));
    const hidden = Keyboard.addListener("keyboardDidHide", () => setKeyboardHeight(0));
    return () => { shown.remove(); hiding.remove(); hidden.remove(); };
  }, []);
  useEffect(() => {
    if (!visible) return;
    let current = true;
    const currentSession = ++session.current;
    setQuery(""); setPage(0); setSelected(null); setEditing(null); setCreating(false);
    setNameDraft(""); setMembers([]); setDemo(null); setShowInactive(false); setError("");
    writeBusy.current = false; setSaving(false);
    setLoading(true);
    if (!source) {
      AsyncStorage.getItem(demoKey).then(raw => {
        if (current) setDemo(parseOrbitalDemoDirectory(raw));
      }).catch(() => { if (current) setError("No se pudo recuperar la demostración local."); })
        .finally(() => { if (current) setLoading(false); });
      return () => { current = false; if (session.current === currentSession) session.current++; };
    }
    source.list().then(rows => {
      if (!current) return;
      if (!Array.isArray(rows) || rows.some(row => !row || !row.id || !row.code || !row.name || !row.role || typeof row.active !== "boolean"))
        throw Error("Directorio inválido");
      setMembers(rows);
    }).catch(() => { if (current) setError(`No se pudo consultar el equipo de ${nextLabel}.`); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; if (session.current === currentSession) session.current++; };
  }, [visible, source, demoKey, nextLabel]);
  const demoMode = !source && demo?.enabled === true;
  const directory = demoMode ? demo.people : source ? members : [];
  const matching = useMemo(() => browsePeople(directory, query, showInactive), [directory, query, showInactive]);
  const slice = peopleOrbitPage(matching, page);
  const back = () => {
    if (keyboardHeight > 0 || Keyboard.isVisible?.()) { Keyboard.dismiss(); return; }
    if (creating) { setCreating(false); setEditError(""); return; }
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
    if (!visible || selected || editing || creating || typeof requestAnimationFrame !== "function") return;
    requestAnimationFrame(() => scroll.current?.scrollTo({ y: searchScrollOffset, animated: true }));
  }, [visible, selected, editing, creating, keyboardHeight, searchScrollOffset]);
  const canRename = (person: OrbitalPerson) => demoMode ||
    (!!(source?.renameVisibleName || source?.updateMember) && source?.canEditName?.(person) === true);
  const canEditRole = (person: OrbitalPerson) => demoMode || (!!source?.updateMember && source.canEditRole?.(person) === true);
  const canSetActive = (person: OrbitalPerson) => demoMode || (!!source?.updateMember && source.canSetActive?.(person) === true);
  const canCreate = demoMode || (!!source?.createMember && source.canCreateMember?.() === true);
  const openEditor = (person: OrbitalPerson) => {
    setEditing(person); setCreating(false); setNameDraft(person.name); setRoleDraft(person.role);
    setActiveDraft(person.active); setEditError("");
  };
  const satellites: TeamSatellite[] = Array.from({ length: 7 }, (_, slot) => {
    const person = slice.people[slot];
    if (!person) return { key: `empty:${slot}`, label: "", title: "", color: "#9ca3af", disabled: true, empty: true, onPress: () => {} };
    return { key: `person:${person.id}`, label: person.name,
      title: `${person.name}, código ${person.code}, ${person.active ? "activo" : "inactivo"}${demoMode ? ", demostración" : ""}`,
      color: person.active ? colors[slot] : "#748391", disabled: false, inactive: !person.active,
      onPress: () => {
        if (lastLongPress.current?.id === person.id && Date.now() - lastLongPress.current.at < 900) return;
        Keyboard.dismiss(); setSelected(person);
      },
      onLongPress: canRename(person) ? () => {
        lastLongPress.current = { id: person.id, at: Date.now() };
        openEditor(person);
      } : undefined };
  });
  satellites.push({ key: "team-next", label: nextLabel, title: slice.hasNext ? "Siguiente página del equipo" : "Fin del equipo",
    color: "#9ca3af", disabled: !slice.hasNext, onPress: () => setPage(slice.page + 1) });
  const storeDemo = async (next: OrbitalDemoDirectory, startedIn: number) => {
    await AsyncStorage.setItem(demoKey, JSON.stringify(next));
    if (session.current !== startedIn) return false;
    setDemo(next);
    return true;
  };
  const toggleDemo = async () => {
    if (source || !demo || writeBusy.current) return;
    writeBusy.current = true; setSaving(true); setEditError("");
    const startedIn = session.current;
    try {
      if (await storeDemo({ ...demo, enabled: !demo.enabled }, startedIn)) {
        setSelected(null); setQuery(""); setPage(0); setShowInactive(false);
      }
    } catch { if (session.current === startedIn) setError("No se pudo guardar el modo de demostración."); }
    finally { if (session.current === startedIn) { writeBusy.current = false; setSaving(false); } }
  };
  const validSaved = (saved: OrbitalPerson, original: OrbitalPerson, changes: { name: string; role: string; active: boolean }) =>
    !!saved && saved.id === original.id && saved.code === original.code &&
    saved.name === changes.name && saved.role === changes.role && saved.active === changes.active;
  const saveEdit = async () => {
    const person = editing, name = nameDraft.trim(), role = roleDraft.trim();
    if (!person || writeBusy.current) return;
    if (!validVisibleName(name) || !validVisibleName(role)) {
      setEditError("Comprueba el nombre y la función antes de guardar."); return;
    }
    const changes = { name, role, active: activeDraft };
    const nameChanged = name !== person.name, roleChanged = role !== person.role, activeChanged = activeDraft !== person.active;
    if ((nameChanged && !canRename(person)) || (roleChanged && !canEditRole(person)) ||
      (activeChanged && !canSetActive(person))) { setEditError("No tienes permiso para ese cambio."); return; }
    if (!nameChanged && !roleChanged && !activeChanged) { setEditing(null); Keyboard.dismiss(); return; }
    writeBusy.current = true; setSaving(true); setEditError("");
    const startedIn = session.current;
    try {
      let saved: OrbitalPerson;
      if (demoMode && demo) {
        const next = updateOrbitalDemoPerson(demo, person.id, changes);
        if (!await storeDemo(next, startedIn)) return;
        saved = next.people.find(row => row.id === person.id)!;
      } else if (source) {
        if ((roleChanged || activeChanged || !source.renameVisibleName) && source.updateMember)
          saved = await source.updateMember(person.id, {
            ...(nameChanged ? { name } : {}), ...(roleChanged ? { role } : {}), ...(activeChanged ? { active: activeDraft } : {}),
          });
        else if (nameChanged && source.renameVisibleName) saved = await source.renameVisibleName(person.id, name);
        else throw Error("Operación no disponible");
        if (session.current !== startedIn || !validSaved(saved, person, changes)) throw Error("Respuesta inválida");
        setMembers(current => current.map(row => row.id === person.id ? saved : row));
      } else throw Error("Directorio no disponible");
      setSelected(current => current?.id === person.id ? saved : current);
      setEditing(null); Keyboard.dismiss();
    } catch (reason) { if (session.current === startedIn)
      setEditError(demoMode && reason instanceof Error ? reason.message : "No se confirmó el cambio en el servidor."); }
    finally { if (session.current === startedIn) { writeBusy.current = false; setSaving(false); } }
  };
  const saveCreate = async () => {
    const name = nameDraft.trim(), code = codeDraft.trim();
    if (!creating || !canCreate || writeBusy.current) return;
    if (!validVisibleName(name)) { setEditError("Escribe un nombre visible de 2 a 80 caracteres."); return; }
    writeBusy.current = true; setSaving(true); setEditError("");
    const startedIn = session.current;
    try {
      let saved: OrbitalPerson, nextRows: readonly OrbitalPerson[];
      if (demoMode && demo) {
        const result = createOrbitalDemoPerson(demo, name, code);
        if (!await storeDemo(result.directory, startedIn)) return;
        saved = result.person; nextRows = result.directory.people;
      } else if (source?.createMember && source.canCreateMember?.() === true) {
        saved = await source.createMember(name, code || undefined);
        if (session.current !== startedIn || !saved || !saved.id || !saved.code || saved.name !== name ||
          !validVisibleName(saved.role) || saved.active !== true || members.some(row => row.id === saved.id || row.code === saved.code))
          throw Error("Respuesta inválida");
        nextRows = [...members, saved]; setMembers(nextRows);
      } else throw Error("Alta no autorizada");
      setQuery(""); setShowInactive(false);
      setPage(Math.floor(browsePeople(nextRows, "").findIndex(row => row.id === saved.id) / 7));
      setCreating(false); Keyboard.dismiss();
    } catch (reason) { if (session.current === startedIn)
      setEditError(demoMode && reason instanceof Error ? reason.message : "No se confirmó el alta en el servidor."); }
    finally { if (session.current === startedIn) { writeBusy.current = false; setSaving(false); } }
  };
  const navigation = <GoNavigationFloating screenKey="support-team" safeArea={false} handedness={handedness}
    protectedTop={insets.top + 72} protectedBottom={layout.navigationBottom} initialBottom={0} initialRight={8}
    avoidRects={avoidRects}>
    <GoCloseButton level="panel" keyboardVisible={keyboardHeight > 0} appearance="light" onPress={back}
      accessibilityLabel={keyboardHeight > 0 ? "Ocultar teclado" : editing || creating ? "Cancelar edición" :
        selected ? "Volver al equipo" : slice.page > 0 ? "Página anterior" : `Volver a ${originLabel}`}/>
  </GoNavigationFloating>;
  return <Modal visible={visible} animationType="fade" onRequestClose={back}>
    <View style={styles.screen}>
      <ScrollView ref={scroll} style={[styles.viewport, { bottom: layout.bottom }]}
        contentContainerStyle={{ minHeight: selected ? layout.viewportHeight : layout.contentHeight }}
        keyboardShouldPersistTaps="handled"
        onContentSizeChange={() => { if (keyboardHeight > 0 && !selected && !editing && !creating)
          scroll.current?.scrollTo({ y: searchScrollOffset, animated: true }); }}>
        <View style={{ minHeight: selected ? layout.viewportHeight : layout.contentHeight }}>
          <View style={[styles.heading, { marginTop: insets.top + 8 }]}>
            <Text accessibilityRole="header" style={styles.title}>{selected ? `${directoryLabel} · ${nextLabel}` : directoryLabel}</Text>
            <Text style={styles.meta}>{selected ? `Ficha de ${memberSingular}` : !source && !demoMode ?
              "Directorio real pendiente de conexión" : matching.length === 0 ?
              query ? `No se encontraron ${memberPlural}` : `No hay ${memberPlural} registrados` :
              `Página ${slice.page + 1} de ${slice.totalPages} · ${slice.total} ${memberPlural}`}</Text>
            {(!source && !!demo || !selected && directory.some(person => !person.active)) && <View style={styles.headingActions}>
              {!source && !!demo && <TouchableOpacity accessibilityRole="button" disabled={saving}
                onPress={() => void toggleDemo()} style={styles.modeButton}>
                <Text style={styles.modeButtonText}>{demoMode ? "DEMOSTRACIÓN LOCAL · SALIR" : "ACTIVAR DEMOSTRACIÓN"}</Text>
              </TouchableOpacity>}
              {!selected && directory.some(person => !person.active) && <TouchableOpacity accessibilityRole="button"
                onPress={() => { setShowInactive(value => !value); setPage(0); }} style={styles.inactiveButton}>
                <Text style={styles.inactiveText}>{showInactive ? "OCULTAR INACTIVOS" : "VER INACTIVOS"}</Text>
              </TouchableOpacity>}
            </View>}
            {!selected && (loading ? <ActivityIndicator color="#D5A932" /> : error ?
              <Text accessibilityRole="alert" style={styles.notice}>{error}</Text> : null)}
          </View>
          {selected ? <View style={styles.detail}>
            <Text style={styles.personName}>{selected.name}</Text>
            <Text style={styles.detailText}>Código: {selected.code}</Text>
            <Text style={styles.detailText}>Función: {selected.role}</Text>
            <Text style={styles.detailText}>Estado: {selected.active ? "ACTIVO" : "INACTIVO"}</Text>
            {demoMode && <Text style={styles.demoNotice}>FICHA DE DEMOSTRACIÓN</Text>}
            {selected.assignedRequests != null && <Text style={styles.detailText}>Solicitudes asignadas: {selected.assignedRequests}</Text>}
            {selected.pendingTasks != null && <Text style={styles.detailText}>Tareas pendientes: {selected.pendingTasks}</Text>}
            {selected.handledRequests != null && <Text style={styles.detailText}>Expedientes atendidos: {selected.handledRequests}</Text>}
            {selected.assignedRequests == null && selected.pendingTasks == null && selected.handledRequests == null &&
              <Text style={styles.meta}>La actividad individual todavía no está disponible.</Text>}
            {(canRename(selected) || canEditRole(selected) || canSetActive(selected)) &&
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Editar persona" onPress={() => openEditor(selected)}
                style={styles.detailAction}><Text style={styles.detailActionText}>EDITAR</Text></TouchableOpacity>}
          </View> : <View style={styles.dock}>
            <View style={styles.searchRow}>
              <TextInput accessibilityLabel="Buscar nombre o código" placeholder="Buscar nombre o código" placeholderTextColor="#81909E"
                value={query} onChangeText={value => { setQuery(value); setPage(0); }} returnKeyType="search" autoCorrect={false}
                clearButtonMode="while-editing" style={[styles.search,
                  { width: Math.min(window.width - insets.left - insets.right - 118, 280) }]}/>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Añadir persona" disabled={!canCreate || saving}
                onPress={() => { setCreating(true); setEditing(null); setNameDraft(""); setCodeDraft(""); setEditError(""); }}
                style={[styles.addButton, { right: insets.right + 12 }, !canCreate && styles.addDisabled]}>
                <Text style={styles.addText}>+</Text>
              </TouchableOpacity>
            </View>
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
      {(editing || creating) && <View style={[styles.editOverlay, { bottom: layout.bottom }]}>
        <ScrollView style={styles.editorScroll} contentContainerStyle={styles.editorScrollContent} keyboardShouldPersistTaps="handled">
          <View style={styles.editCard}>
            <Text style={styles.editTitle}>{creating ? "AÑADIR PERSONA" : "EDITAR PERSONA"}</Text>
            <Text style={styles.meta}>{creating ? demoMode ? "Alta local de demostración" : "Alta autorizada" : editing?.code}</Text>
            <TextInput accessibilityLabel="Nombre visible del trabajador" placeholder="Nombre o alias"
              value={nameDraft} onChangeText={setNameDraft} editable={creating || !!editing && canRename(editing)}
              maxLength={80} selectTextOnFocus style={styles.editInput}/>
            {creating ? <>
              <TextInput accessibilityLabel="Código identificador" placeholder="Código automático si se deja vacío"
                value={codeDraft} onChangeText={setCodeDraft} autoCapitalize="characters" maxLength={30} style={styles.editInput}/>
              {demoMode && <Text style={styles.demoNotice}>El código llevará el prefijo DEMO-.</Text>}
            </> : editing && <>
              <TextInput accessibilityLabel="Función del miembro" value={roleDraft} onChangeText={setRoleDraft}
                editable={canEditRole(editing)} maxLength={80} style={styles.editInput}/>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel="Cambiar estado del miembro"
                disabled={!canSetActive(editing)} onPress={() => setActiveDraft(value => !value)} style={styles.stateButton}>
                <Text style={styles.stateText}>Estado: {activeDraft ? "ACTIVO" : "INACTIVO"}</Text>
              </TouchableOpacity>
            </>}
            {!!editError && <Text accessibilityRole="alert" style={styles.editError}>{editError}</Text>}
            <View style={styles.editActions}>
              <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => {
                setEditing(null); setCreating(false); setEditError(""); Keyboard.dismiss();
              }} style={styles.editAction}>
                <Text style={styles.editActionText}>CANCELAR</Text>
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" disabled={saving} onPress={() => void (creating ? saveCreate() : saveEdit())}
                style={styles.editAction}>
                <Text style={styles.editActionText}>{saving ? "GUARDANDO…" : "GUARDAR"}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
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
  headingActions: { width: "100%", paddingHorizontal: 12, flexDirection: "row", justifyContent: "center", gap: 6 },
  modeButton: { minHeight: 34, borderWidth: 1, borderColor: "#D5A932", backgroundColor: "#243247",
    borderRadius: 11, justifyContent: "center", alignItems: "center", paddingHorizontal: 8, flexShrink: 1 },
  modeButtonText: { color: "#FFE7A3", fontSize: 11, fontWeight: "800", textAlign: "center" },
  inactiveButton: { minHeight: 34, borderWidth: 1, borderColor: "#81909E", borderRadius: 11,
    justifyContent: "center", alignItems: "center", paddingHorizontal: 6, flexShrink: 1 },
  inactiveText: { color: "#D5DEE8", fontSize: 10, fontWeight: "700", textAlign: "center" },
  demoNotice: { color: "#FFE7A3", fontSize: 12, textAlign: "center" },
  dock: { position: "absolute", bottom: 0, width: "100%", alignItems: "center", gap: 8 },
  searchRow: { width: "100%", height: 44, alignItems: "center", justifyContent: "center" },
  search: { minHeight: 44, backgroundColor: "#F7F9FB", color: "#17212B", borderRadius: 14,
    borderWidth: 1, borderColor: "#A6B3BF", paddingHorizontal: 13, fontSize: 15 },
  addButton: { position: "absolute", top: 0, width: 44, height: 44, borderRadius: 14, borderWidth: 1,
    borderColor: "#D5A932", backgroundColor: "#344252", alignItems: "center", justifyContent: "center" },
  addDisabled: { opacity: 0.35 },
  addText: { color: "#FFFFFF", fontSize: 28, fontWeight: "600", lineHeight: 32 },
  detail: { alignSelf: "stretch", marginHorizontal: 22, marginTop: 24, padding: 20, borderRadius: 18,
    borderWidth: 1, borderColor: "#566A7B", backgroundColor: "#18293B", gap: 10 },
  detailAction: { alignSelf: "center", minWidth: 120, minHeight: 44, borderRadius: 12,
    borderWidth: 1, borderColor: "#D5A932", alignItems: "center", justifyContent: "center" },
  detailActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  personName: { color: "#FFFFFF", fontSize: 23, fontWeight: "800" },
  detailText: { color: "#E2EAF2", fontSize: 16 },
  editOverlay: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(2,8,16,.72)",
    alignItems: "center", justifyContent: "center", zIndex: 50 },
  editorScroll: { width: "100%" },
  editorScrollContent: { flexGrow: 1, paddingVertical: 12, alignItems: "center", justifyContent: "center" },
  editCard: { width: "86%", maxWidth: 360, borderRadius: 18, backgroundColor: "#18293B", borderWidth: 1,
    borderColor: "#718394", padding: 18, gap: 8 },
  editTitle: { color: "#FFFFFF", fontSize: 18, fontWeight: "800", textAlign: "center" },
  editInput: { minHeight: 44, borderRadius: 12, backgroundColor: "#F7F9FB", color: "#17212B", paddingHorizontal: 12, fontSize: 16 },
  stateButton: { minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#9EAFBD",
    alignItems: "center", justifyContent: "center" },
  stateText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  editActions: { flexDirection: "row", gap: 8, marginTop: 8 },
  editAction: { flex: 1, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: "#9EAFBD",
    alignItems: "center", justifyContent: "center" },
  editActionText: { color: "#FFFFFF", fontSize: 13, fontWeight: "800" },
  editError: { color: "#FFB8BE", fontSize: 13 },
});

export const OrbitalPeoplePanel = SupportTeamPanel;
