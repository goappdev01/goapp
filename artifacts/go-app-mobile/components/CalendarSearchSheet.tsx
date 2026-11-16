import React, { useMemo, useState } from "react";
import { FlatList, Keyboard, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";
import { GoScreenModal } from "./ui/GoScreenModal";
import { GoCloseButton } from "./ui/GoCloseButton";
import type { GoEntry } from "./AgendaOperativa";
import { calendarSearchMeta, calendarSearchTitle, filterCalendarSearch, indexCalendarSearch,
  type CalendarSearchArchive, type CalendarSearchStatus, type CalendarSearchType } from "../data/calendarSearch";

type Props = {
  entries: GoEntry[];
  archiveNotes?: GoEntry[];
  handedness?: "left" | "right";
  onClose: () => void;
  onOpenEntry: (entry: GoEntry) => void;
};

/** Local sheet state leaves the mounted calendar and its scroll positions untouched. */
export function CalendarSearchSheet({ entries, archiveNotes, handedness, onClose, onOpenEntry }: Props) {
  const { lang, t } = useLanguage(), insets = useSafeAreaInsets(), en = lang === "en";
  const [query, setQuery] = useState("");
  const [type, setType] = useState<CalendarSearchType>("all");
  const [status, setStatus] = useState<CalendarSearchStatus>("all");
  const [archive, setArchive] = useState<CalendarSearchArchive>("active");
  const index = useMemo(() => indexCalendarSearch(entries, archiveNotes), [entries, archiveNotes]);
  const results = useMemo(() => filterCalendarSearch(index, query, type, status, archive), [index, query, type, status, archive]);
  const hasStatus = status !== "all" || index.some(item => item.archived === (archive === "archive") && (type === "all" || item.type === type) && !!item.status);
  const close = () => { Keyboard.dismiss(); onClose(); };
  const clear = () => { setQuery(""); setType("all"); setStatus("all"); setArchive("active"); };
  const chooseType = (value: CalendarSearchType) => { setType(value); setStatus("all"); };
  const chooseArchive = (value: CalendarSearchArchive) => { setArchive(value); setStatus("all"); };
  const chips = <T extends string,>(id: string, values: [T, string][], selected: T, select: (value: T) => void) => (
    <View testID={id} style={s.filters}>{values.map(([value, label]) => (
      <TouchableOpacity key={value} testID={id + "-" + value} accessibilityRole="button" accessibilityLabel={label}
        accessibilityState={{ selected: selected === value }} onPress={() => select(value)}
        style={[s.chip, selected === value && s.selected]}><Text style={s.label}>{label}</Text></TouchableOpacity>
    ))}</View>
  );
  return <GoScreenModal transparent animationType="fade" onRequestClose={close}>
    <KeyboardAvoidingView testID="calendar-search-sheet" style={[s.overlay, { paddingTop: Math.max(insets.top, 12), paddingLeft: insets.left, paddingRight: insets.right }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <TouchableOpacity style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel={en ? "Close calendar search" : "Cerrar búsqueda del Calendario"} onPress={close} />
      <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <View style={[s.row, { flexDirection: handedness === "left" ? "row-reverse" : "row" }]}>
          <Text accessibilityRole="header" style={s.heading}>{en ? "Search calendar" : "Buscar en Calendario"}</Text>
          <GoCloseButton testID="calendar-search-close" level="panel" touchSize={44} preserveTouchSize iconSize={22}
            accessibilityLabel={en ? "Close calendar search" : "Cerrar búsqueda del Calendario"} onPress={close} />
        </View>
        <View style={s.row}>
          <TextInput testID="calendar-search-input" autoFocus accessibilityLabel={en ? "Search calendar entries" : "Buscar entradas del Calendario"}
            placeholder={en ? "Title, note or contact" : "Título, nota o contacto"} placeholderTextColor="#aeb7c6"
            value={query} onChangeText={setQuery} autoCorrect={false} returnKeyType="search" onSubmitEditing={Keyboard.dismiss} style={s.input} />
          <TouchableOpacity testID="calendar-search-clear" accessibilityRole="button" accessibilityLabel={en ? "Clear search and filters" : "Borrar búsqueda y filtros"}
            onPress={clear} style={s.clear}><Feather name="x-circle" size={21} color="#ffffff" /></TouchableOpacity>
        </View>
        <FlatList testID="calendar-search-results" style={s.list} data={results} keyExtractor={item => item.entry.id}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={s.results}
          ListHeaderComponent={<View style={s.searchOptions}>
        {chips<CalendarSearchType>("calendar-search-type", [["all", en ? "All" : "Todos"], ["task", en ? "Tasks" : "Tareas"], ["note", en ? "Notes" : "Notas"], ["booking", en ? "Bookings" : "Reservas"],
          ...(index.some(item => item.type === "event") ? [["event", en ? "Events" : "Eventos"] as [CalendarSearchType, string]] : [])], type, chooseType)}
        {(archive === "archive" || index.some(item => item.archived)) && chips<CalendarSearchArchive>("calendar-search-archive", [["active", en ? "Calendar" : "Calendario"], ["archive", en ? "Notes archive" : "Notas Archivo"]], archive, chooseArchive)}
        {hasStatus && <>
          <Text style={s.hint}>{en ? "Personal follow-up" : "Seguimiento personal"}</Text>
          {chips<CalendarSearchStatus>("calendar-search-status", [["all", en ? "All" : "Todos"], ["pending", en ? "Pending" : "Pendientes"], ["done", en ? "Done" : "Realizadas"]], status, setStatus)}
        </>}
        <Text style={s.hint}>{!query.trim() && type === "all" && status === "all" ? (en ? "Loaded entries · enter text or choose a type" : "Entradas cargadas · escribe o elige un tipo") : `${results.length} ${en ? "results" : "resultados"}`}</Text>
          </View>}
          ListEmptyComponent={<Text accessibilityLiveRegion="polite" style={s.empty}>{en ? "No results" : "Sin resultados"}</Text>}
          renderItem={({ item }) => <TouchableOpacity testID={"calendar-search-result-" + item.entry.id} accessibilityRole="button"
            accessibilityLabel={[calendarSearchTitle(item.entry, lang), calendarSearchMeta(item.entry, lang, t)].join(". ")}
            onPress={() => { Keyboard.dismiss(); onOpenEntry(item.entry); }} style={s.result}>
            <Text numberOfLines={2} style={s.title}>{calendarSearchTitle(item.entry, lang)}</Text>
            <Text style={s.meta}>{calendarSearchMeta(item.entry, lang, t)}</Text>
          </TouchableOpacity>} />
      </View>
    </KeyboardAvoidingView>
  </GoScreenModal>;
}

const s = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" },
  sheet: { height: "85%", backgroundColor: "#111822", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 12, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  heading: { color: "#ffffff", fontSize: 16, fontWeight: "700", flex: 1 },
  input: { color: "#ffffff", backgroundColor: "#202c3d", borderWidth: 1, borderColor: "#7f90a8", borderRadius: 10, minHeight: 44, paddingHorizontal: 10, fontSize: 16, flex: 1, minWidth: 0 },
  clear: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  filters: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, justifyContent: "center", borderWidth: 1, borderColor: "#7f90a8", borderRadius: 10 },
  selected: { backgroundColor: "#123542", borderColor: "#00e5ff" },
  label: { color: "#ffffff", fontSize: 13 },
  hint: { color: "#b8c4d5", fontSize: 12 },
  list: { flex: 1 },
  searchOptions: { gap: 8, paddingBottom: 8 },
  results: { paddingBottom: 12, gap: 8 },
  result: { minHeight: 58, padding: 12, borderRadius: 10, backgroundColor: "#202c3d", gap: 5 },
  title: { color: "#ffffff", fontSize: 15, fontWeight: "700" },
  meta: { color: "#c2cedf", fontSize: 12 },
  empty: { color: "#ffffff", padding: 20, textAlign: "center" },
});
