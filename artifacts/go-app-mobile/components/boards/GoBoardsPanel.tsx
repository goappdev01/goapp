import React, { useEffect, useRef, useState } from "react";
import { Alert, FlatList, Image, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { boardDatePatch, canUseGoBoards, type BoardCard, type BoardDocument, type BoardSummary, type BoardView } from "@workspace/api-zod";
import { OwnerContextModal as Modal } from "@/components/debug/OwnerContextIndicator";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { GoTimeField } from "@/components/ui/GoTimePicker";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { useAdminAccess } from "@/contexts/GoAdminAccessContext";
import { useGoView } from "@/contexts/GoViewContext";
import { useGoBoards } from "@/hooks/useGoBoards";
import { newBoard, newBoardTask, duplicateBoardStructure, moveBoardCardDate, updateBoard } from "@/lib/goBoards";
import { updateGoLog } from "@/lib/goLogStore";
import { completionKey, completionSchedule } from "@/lib/goActionCompletion";
import { updateCompletionDocument } from "@/lib/goActionCompletionStore";
import { BoardDragSurface, BoardDragItem, useBoardDragging, type DropTarget } from "./BoardDragSurface";

const id = () => globalThis.crypto?.randomUUID?.() || "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
  const n = Math.floor(Math.random() * 16); return (c === "x" ? n : (n & 3) | 8).toString(16);
});
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const shift = (date: string, days: number) => { const d = new Date(date + "T12:00:00"); d.setDate(d.getDate()+days); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; };
const views: Array<[BoardView, string]> = [["columns","Columnas"],["days","Días"],["week","Semana"],["month","Mes"],["undated","Sin fecha"]];
const Appearance = React.createContext({ scale: 1, handedness: "right" as "right" | "left" });
function Button({ label, onPress, danger = false, disabled = false }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { scale } = React.useContext(Appearance);
  return <TouchableOpacity accessibilityRole="button" disabled={disabled} onPress={onPress}
    style={[styles.button, { opacity: disabled ? 0.4 : 1, borderColor: danger ? "#e87979" : "#47556c" }]}><Text style={{ color: danger ? "#ffaaaa" : "#eef1fa", fontSize: Math.max(14, 15 * scale) }}>{label}</Text></TouchableOpacity>;
}
function Field({ label, value, onChangeText, multiline = false, placeholder }: {
  label: string; value: string; onChangeText: (value: string) => void; multiline?: boolean; placeholder?: string;
}) { const { scale } = React.useContext(Appearance); return <View style={{ gap: 5 }}><Text style={styles.muted}>{label}</Text><TextInput accessibilityLabel={label}
  value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#8690a3" multiline={multiline}
  style={[styles.input, { fontSize: Math.max(15, 16 * scale) }, multiline && { minHeight: 100, textAlignVertical: "top" }]} /></View>; }

type Manager = ReturnType<typeof useGoBoards>;
export function GoBoardsPanel({ visible, onClose, manager, fontScale = 1, handedness = "right" }: {
  visible: boolean; onClose: () => void; manager: Manager; fontScale?: number; handedness?: "right" | "left";
}) {
  const admin = useAdminAccess(), view = useGoView();
  if (!visible || !canUseGoBoards(view.view, admin.allowed && !admin.checking, admin.userId)) return null;
  return <Appearance.Provider value={{ scale: Math.max(0.8, Math.min(1.5, fontScale)), handedness }}><BoardsContent onClose={onClose} manager={manager} /></Appearance.Provider>;
}
function BoardsContent({ onClose, manager }: { onClose: () => void; manager: Manager }) {
  const { state, store, allowed, open } = manager, admin = useAdminAccess(), insets = useSafeAreaInsets();
  const appearance = React.useContext(Appearance);
  const [search, setSearch] = useState(""), [archive, setArchive] = useState("false");
  const [grid, setGrid] = useState(false), [prefsReady, setPrefsReady] = useState(false);
  const [taskSearch, setTaskSearch] = useState(""), [taskFilter, setTaskFilter] = useState("active");
  const [taskDateFilter, setTaskDateFilter] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [editor, setEditor] = useState<BoardCard | null>(null), [boardEditor, setBoardEditor] = useState<BoardDocument | null>(null);
  const [columnEditor, setColumnEditor] = useState<{ id: string; title: string; archived: boolean } | null>(null);
  const [transfer, setTransfer] = useState<BoardCard | null>(null), [transferBoard, setTransferBoard] = useState<BoardDocument | null>(null);
  const [transferSearch, setTransferSearch] = useState("");
  const [notice, setNotice] = useState(""), lock = useRef(false), valid = useRef(allowed); valid.current = allowed;
  const doc = state.selected;
  useEffect(() => {
    let active = true; void AsyncStorage.getItem(`go_boards_list_preferences:ADMIN:${admin.userId}`).then(raw => {
      if (!active || !raw) return; const prefs = JSON.parse(raw); if (typeof prefs.grid === "boolean") setGrid(prefs.grid);
      if (["false","true","all"].includes(prefs.archive)) setArchive(prefs.archive);
    }).catch(() => {}).finally(() => { if (active) setPrefsReady(true); }); return () => { active = false; };
  }, [admin.userId]);
  useEffect(() => { if (prefsReady && allowed) void AsyncStorage.setItem(`go_boards_list_preferences:ADMIN:${admin.userId}`,
    JSON.stringify({ grid, archive })).catch(() => {}); }, [prefsReady, allowed, grid, archive, admin.userId]);
  const work = async (operation: () => Promise<unknown>) => {
    if (lock.current || !valid.current) return;
    lock.current = true; try { await operation(); if (valid.current) setNotice(""); }
    catch (e) { if (valid.current) setNotice((e as Error).message); }
    finally { lock.current = false; }
  };
  useEffect(() => { const timer = setTimeout(() => { if (allowed) void work(() => store.list(search, archive)); }, 300); return () => clearTimeout(timer); }, [search, archive]);
  const confirm = (title: string, operation: () => Promise<unknown>) => Alert.alert(title, "Esta acción necesita tu confirmación.", [
    { text: "Cancelar", style: "cancel" }, { text: "Eliminar", style: "destructive", onPress: () => void work(operation) }]);
  const addTask = (columnId: string) => { if (doc) setEditor({ entry: newBoardTask(`go_board_${id()}`, doc.ownerUserId, ""), columnId, calendarLinked: false, archived: false }); };
  const archiveColumn = async (column: { id: string; title: string; archived: boolean }) => { await store.change({ type: "column", ...column }); setColumnEditor(null); };
  async function complete(card: BoardCard) {
    if (!doc) return;
    const status: "pending" | "done" = card.entry.localResolutionStatus === "done" ? "pending" : "done";
    await updateCompletionDocument({ userId: doc.ownerUserId, context: "ADMIN" }, () => valid.current, document => {
      const key = completionKey(card.entry), previous = document.records[key] || { history: [] };
      const decision = { status, schedule: completionSchedule(card.entry), at: Date.now() };
      return { ...document, records: { ...document.records, [key]: { ...previous, decision, history: [...previous.history, decision] } } };
    });
    await store.change({ type: "card", card: { ...card, entry: { ...card.entry, localResolutionStatus: status } } });
  }
  async function removeTask(card: BoardCard) {
    await store.change({ type: "removeCard", id: card.entry.id });
    if (card.calendarLinked) await updateGoLog(entries => ({ entries: entries.map(e => e.id === card.entry.id ? { ...e, deleted: true } : e), result: undefined }));
    setEditor(null);
  }
  async function drop(from: DropTarget, to: DropTarget) {
    if (from.kind === "board") {
      const target = state.boards.find(b => b.id === to.id); if (!target) return;
      await open(from.id); const source = store.snapshot().selected; if (!source) return;
      const fromIndex = state.boards.findIndex(b => b.id === from.id), toIndex = state.boards.findIndex(b => b.id === to.id);
      const neighbor = state.boards[toIndex + (fromIndex < toIndex ? 1 : -1)];
      const position = neighbor ? (neighbor.position + target.position) / 2 : target.position + (fromIndex < toIndex ? 1 : -1);
      await store.change({ type: "settings", patch: { position } }); store.close(); await store.list(search, archive); return;
    }
    if (!doc) return;
    if (from.kind === "column") { await store.change({ type: "columnOrder", id: from.id, target: to.id }); return; }
    const card = doc.cards.find(c => c.entry.id === from.id); if (!card) return;
    if (to.kind === "board") {
      await open(to.id); const target = store.snapshot().selected; await open(doc.id);
      const column = target?.columns.find(c => !c.archived); if (!target || !column) throw new Error("Añade una columna activa al tablero destino.");
      await store.transfer(card.entry.id, target, column.id); return;
    }
    if (to.kind === "day") { await store.change({ type: "card", card: moveBoardCardDate(card, to.date || "") }); return; }
    if (to.kind === "card") {
      const dated = doc.view === "columns" ? doc : updateBoard(doc, { type: "card", card: moveBoardCardDate(card, to.date || "") });
      await store.save(updateBoard(dated, { type: "cardOrder", id: card.entry.id, target: to.id, columnId: to.columnId || card.columnId })); return;
    }
    await store.change({ type: "card", card: { ...card, columnId: to.columnId || to.id } });
  }
  const close = () => { if (editor) setEditor(null); else if (boardEditor) setBoardEditor(null); else if (columnEditor) setColumnEditor(null);
    else if (transfer) { setTransfer(null); setTransferBoard(null); } else if (doc) { store.close(); void work(() => store.list(search, archive)); } else onClose(); };
  if (!allowed) return null;
  return <Modal visible animationType="slide" onRequestClose={close}>
    <View style={[styles.screen, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 8), paddingLeft: insets.left, paddingRight: insets.right }]}>
      <View style={[styles.header, { flexDirection: appearance.handedness === "left" ? "row-reverse" : "row" }]}><TouchableOpacity accessibilityLabel="Volver a Calendario y Reservas" onPress={close} style={{ padding: 12 }}><Feather name="chevron-left" size={23} color="white" /></TouchableOpacity>
        <View style={{ flex: 1 }}><Text style={styles.title}>{editor ? "Ficha de tarea" : boardEditor ? "Editar tablero" : columnEditor ? "Columna" : transfer ? "Mover tarea" : doc?.name || "GO Tableros"}</Text>
          <Text style={styles.muted}>{state.pending ? `${state.pending} cambio(s) guardados en este dispositivo, pendientes de sincronizar` : "ADMIN · Tu organización privada"}</Text></View>
        <GoCloseButton level="container" accessibilityLabel="Cerrar Tablero" onPress={onClose} /></View>
      {!!(notice || state.error) && <View style={styles.banner}><Text style={styles.text}>{notice || state.error}</Text><View style={styles.row}>
        <Button label="Reintentar sincronización" onPress={() => void work(() => store.sync())} />
        {state.error.includes("cambiado") && <Button label="Resolver conflicto" onPress={() => Alert.alert("Conflicto entre dispositivos", "La copia local se conserva. Elige qué versión utilizar.", [
          { text: "Cancelar", style: "cancel" }, { text: "Usar servidor", onPress: () => void work(() => store.resolveConflict(false)) },
          { text: "Conservar mi copia", onPress: () => void work(() => store.resolveConflict(true)) }])} />}</View></View>}
      {editor && doc ? <TaskEditor card={editor} board={doc} onChange={setEditor}
        onSave={card => void work(async () => { await store.change({ type: "card", card }); setEditor(null); })}
        onDelete={() => confirm("¿Eliminar tarea?", () => removeTask(editor))}
        onComplete={() => void work(async () => { await complete(editor); setEditor(null); })}
        onTransfer={() => { setTransfer(editor); setEditor(null); }} />
      : boardEditor ? <BoardEditor board={boardEditor} setBoard={setBoardEditor} onSave={() => void work(async () => {
          await store.save(boardEditor); setBoardEditor(null);
        })} />
      : columnEditor ? <KeyboardAwareScrollViewCompat contentContainerStyle={styles.form}>
          <Field label="Nombre de columna" value={columnEditor.title} onChangeText={title => setColumnEditor({ ...columnEditor, title })} />
          <View style={styles.row}><Text style={styles.text}>Archivada</Text><Switch value={columnEditor.archived} onValueChange={archived => setColumnEditor({ ...columnEditor, archived })} /></View>
          <Button label="Guardar columna" onPress={() => void work(() => archiveColumn(columnEditor))} />
        </KeyboardAwareScrollViewCompat>
      : transfer ? <ScrollView contentContainerStyle={styles.form}>
          <Text style={styles.text}>La tarea conserva su identificador, notas, fecha y vinculación con Calendario.</Text>
          <Field label="Buscar tablero destino" value={transferSearch} onChangeText={value => { setTransferSearch(value); void work(() => store.list(value, "false")); }} />
          {!transferBoard ? <>{state.boards.filter(b => b.id !== doc?.id).map(board => <Button key={board.id} label={board.name} onPress={() => void work(async () => {
            const source = doc; await open(board.id); const target = store.snapshot().selected; if (source) await open(source.id); setTransferBoard(target);
          })} />)}{state.more && <Button label="Cargar más" onPress={() => void work(() => store.list(transferSearch, "false", true))} />}</>
          : <>{transferBoard.columns.filter(c => !c.archived).map(c => <Button key={c.id} label={c.title} onPress={() => void work(async () => {
            await store.transfer(transfer.entry.id, transferBoard, c.id); setTransfer(null); setTransferBoard(null);
          })} />)}<Button label="Otro tablero" onPress={() => setTransferBoard(null)} /></>}
        </ScrollView>
      : <BoardDragSurface onDrop={(from, to) => void work(() => drop(from, to))}>
        {!doc ? <BoardList boards={state.boards} more={state.more} busy={state.busy} search={search} setSearch={setSearch} archive={archive} setArchive={setArchive}
          grid={grid} setGrid={setGrid}
          onOpen={board => void work(() => open(board.id))} onMore={() => void work(() => store.list(search, archive, true))}
          onCreate={() => setBoardEditor(newBoard(id(), admin.userId!, "Nuevo tablero", id(), today()))} />
        : <><ScrollView horizontal style={{ maxHeight: 62 }} contentContainerStyle={{ gap: 8, padding: 10 }}>
          <Button label="Editar tablero" onPress={() => setBoardEditor(doc)} />
          <Button label={doc.archived ? "Recuperar" : "Archivar"} onPress={() => void work(() => store.change({ type: "settings", patch: { archived: !doc.archived } }))} />
          <Button label="Duplicar estructura" onPress={() => setBoardEditor(duplicateBoardStructure(doc, id(), `${doc.name} · copia`, id))} />
          <Button label="Eliminar" danger onPress={() => confirm("¿Eliminar tablero? Las tareas ya vinculadas permanecen en Calendario.", () => store.remove(doc))} />
        </ScrollView>
        {!!doc.cover && <Image source={{ uri: doc.cover }} style={{ width: "100%", height: 80 }} resizeMode="cover" />}
        <View style={{ paddingHorizontal: 12, gap: 8 }}><Button label="Buscar y filtrar tareas" onPress={() => setFiltersOpen(!filtersOpen)} />
        {filtersOpen && <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8 }}><Field label="Buscar tareas" value={taskSearch} onChangeText={setTaskSearch} />
          <Field label="Filtrar fecha (AAAA-MM-DD, vacío: todas)" value={taskDateFilter} onChangeText={setTaskDateFilter} />
          <View style={styles.row}>{[["active","Pendientes"],["done","Completadas"],["all","Todas"],["archived","Archivadas"]].map(([key,label]) => <Button key={key} label={(taskFilter===key?"✓ ":"")+label} onPress={() => setTaskFilter(key)} />)}</View></ScrollView>}
          <ScrollView horizontal style={{ maxHeight: 48 }} contentContainerStyle={{ gap: 8 }}>{views.map(([view,label]) => <Button key={view} label={(doc.view===view?"✓ ":"")+label} onPress={() => void work(() => store.change({ type: "settings", patch: { view } }))} />)}</ScrollView></View>
        <ScrollView horizontal style={{ maxHeight: 50 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 12 }}>
          {state.boards.filter(b => b.id !== doc.id && !b.archived).map(b => <BoardDragItem key={b.id} draggable={false}
            target={{ kind: "board", id: b.id }} label={b.name} style={styles.button}><Text style={styles.muted}>Mover aquí · {b.name}</Text></BoardDragItem>)}
        </ScrollView>
        <BoardContents board={doc} search={taskSearch} filter={taskFilter} dateFilter={taskDateFilter} onOpen={setEditor} onAdd={addTask}
          onColumn={setColumnEditor} onAddColumn={() => setColumnEditor({ id: id(), title: "Nueva columna", archived: false })}
          onDate={anchorDate => void work(() => store.change({ type: "settings", patch: { anchorDate } }))} />
        </>}
      </BoardDragSurface>}
    </View>
  </Modal>;
}

function BoardList({ boards, busy, more, search, setSearch, archive, setArchive, onOpen, onMore, onCreate, grid, setGrid }: {
  boards: BoardSummary[]; busy: boolean; more: boolean; search: string; setSearch: (s: string) => void;
  archive: string; setArchive: (s: string) => void; onOpen: (b: BoardSummary) => void; onMore: () => void; onCreate: () => void;
  grid: boolean; setGrid: (value: boolean) => void;
}) {
  const dragging = useBoardDragging();
  return <><View style={styles.form}><Field label="Buscar tableros" value={search} onChangeText={setSearch} />
    <View style={styles.row}>{[["false","Activos"],["true","Archivados"],["all","Todos"]].map(([key,label]) => <Button key={key} label={(archive===key?"✓ ":"")+label} onPress={() => setArchive(key)} />)}
      <Button label="Crear tablero" onPress={onCreate} /><Button label={grid ? "Vista lista" : "Vista mosaico"} onPress={() => setGrid(!grid)} /></View><Text style={styles.muted}>Mantén pulsado para arrastrar y ordenar.</Text></View>
    <FlatList key={String(grid)} numColumns={grid ? 2 : 1} scrollEnabled={!dragging} data={boards} keyExtractor={item => item.id} contentContainerStyle={{ padding: 12, gap: 12 }}
      renderItem={({ item }) => <BoardDragItem target={{ kind: "board", id: item.id }} label={item.name} style={{ flex: 1, margin: grid ? 4 : 0 }}>
        <TouchableOpacity onPress={() => onOpen(item)} style={[styles.board, { minHeight: 100 }]}>
          {!!item.cover && <Image source={{ uri: item.cover }} style={{ width: "100%", height: 90, borderRadius: 10, marginBottom: 8 }} resizeMode="cover" />}
          <Text style={[styles.title, { marginBottom: 10 }]}>{item.name}</Text><Text style={styles.muted} numberOfLines={2}>{item.description}</Text>
        </TouchableOpacity></BoardDragItem>}
      ListEmptyComponent={<Text style={styles.muted}>{busy ? "Cargando…" : "No hay tableros con este filtro."}</Text>}
      ListFooterComponent={more ? <Button label="Cargar más tableros" onPress={onMore} /> : null} />
  </>;
}
function BoardContents({ board, search, filter, dateFilter, onOpen, onAdd, onColumn, onAddColumn, onDate }: {
  board: BoardDocument; search: string; filter: string; dateFilter: string; onOpen: (card: BoardCard) => void; onAdd: (column: string) => void;
  onColumn: (column: BoardDocument["columns"][number]) => void; onAddColumn: () => void; onDate: (date: string) => void;
}) {
  const dragging = useBoardDragging();
  const cards = board.cards.filter(c => (filter === "archived" ? c.archived : !c.archived)
    && (!dateFilter || c.entry.dateISO === dateFilter)
    && (filter === "done" ? c.entry.localResolutionStatus === "done" : filter === "active" ? c.entry.localResolutionStatus !== "done" : true)
    && `${c.entry.notes} ${c.entry.detail || ""}`.toLowerCase().includes(search.toLowerCase()));
  const card = (c: BoardCard) => <BoardDragItem key={c.entry.id} target={{ id: c.entry.id, kind: "card", columnId: c.columnId, date: c.entry.dateISO }} label={c.entry.notes}>
    <TouchableOpacity onPress={() => onOpen(c)} style={styles.card}>
      <Text style={styles.text}>{c.entry.localResolutionStatus === "done" ? "✓ " : ""}{c.entry.notes}</Text>
      <Text style={styles.muted}>{c.entry.dateISO || "Sin fecha"}{c.entry.time ? ` · ${c.entry.time}` : " · Sin hora"}</Text>
      {!!c.entry.detail && <Text style={styles.muted} numberOfLines={2}>{c.entry.detail}</Text>}
      <Text style={styles.muted}>{c.calendarLinked ? "Vinculada con Calendario" : "Privada en Tablero"}</Text>
    </TouchableOpacity></BoardDragItem>;
  if (board.view === "columns") return <ScrollView horizontal scrollEnabled={!dragging} contentContainerStyle={{ padding: 12, gap: 12 }}>
    {board.columns.map(column => <BoardDragItem key={column.id} target={{ id: column.id, kind: "column", columnId: column.id }} label={column.title}
      style={{ width: 270, backgroundColor: "#121b2b", borderRadius: 12, padding: 10 }}>
      <TouchableOpacity onPress={() => onColumn(column)} style={{ padding: 8 }}><Text style={styles.title}>{column.title} · {cards.filter(c => c.columnId === column.id).length}{column.archived ? " · Archivada" : ""}</Text></TouchableOpacity>
      {!column.archived && <><ScrollView scrollEnabled={!dragging} contentContainerStyle={{ gap: 8 }}>{cards.filter(c => c.columnId === column.id).map(card)}</ScrollView>
        <Button label="Añadir tarea" onPress={() => onAdd(column.id)} /></>}
    </BoardDragItem>)}<Button label="Añadir columna" onPress={onAddColumn} /></ScrollView>;
  const anchor = board.anchorDate, monthStart = anchor.slice(0, 7) + "-01";
  const monday = shift(anchor, -(new Date(anchor + "T12:00:00").getDay() + 6) % 7);
  const count = board.view === "month" ? new Date(Number(anchor.slice(0, 4)), Number(anchor.slice(5, 7)), 0).getDate() : board.view === "week" ? 7 : 14;
  const dates = board.view === "undated" ? [""] : Array.from({ length: count }, (_, i) => shift(board.view === "month" ? monthStart : board.view === "week" ? monday : anchor, i));
  return <View style={{ flex: 1 }}><View style={[styles.row, { padding: 10 }]}>
    {board.view !== "undated" && <><Button label="Anterior" onPress={() => onDate(shift(anchor, board.view === "month" ? -new Date(Number(anchor.slice(0,4)), Number(anchor.slice(5,7))-1, 0).getDate() : -7))} />
      <Text style={styles.text}>{anchor.slice(0,7)}</Text><Button label="Siguiente" onPress={() => onDate(shift(anchor, board.view === "month" ? count : 7))} />
      <Button label="Hoy" onPress={() => onDate(today())} /></>}
  </View><ScrollView scrollEnabled={!dragging} contentContainerStyle={{ padding: 12, gap: 12 }}>
    {dates.map(date => <BoardDragItem draggable={false} key={date} target={{ id: `day:${date}`, kind: "day", date }} label={date} style={styles.day}>
      <Text style={styles.title}>{date ? new Date(date+"T12:00:00").toLocaleDateString("es-ES",{weekday:"long",day:"numeric",month:"short"}) : "Sin fecha"}</Text>
      {cards.filter(c => c.entry.dateISO === date).map(card)}
      <Text style={styles.muted}>{cards.filter(c => c.entry.dateISO === date).length} tareas</Text>
    </BoardDragItem>)}
    {board.view !== "undated" && <BoardDragItem draggable={false} target={{ id:"day:",kind:"day",date:"" }} label="Sin fecha" style={styles.day}>
      <Text style={styles.title}>Sin fecha</Text>{cards.filter(c => !c.entry.dateISO).map(card)}</BoardDragItem>}
  </ScrollView></View>;
}
function BoardEditor({ board, setBoard, onSave }: { board: BoardDocument; setBoard: (b: BoardDocument) => void; onSave: () => void }) {
  const [error, setError] = useState("");
  async function photo() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [16,9], quality: 0.35, base64: true });
      if (result.canceled) return;
      const asset = result.assets[0]; if (!asset.base64 || asset.base64.length > 850000) throw new Error("La portada es demasiado grande. Recorta la imagen o elige una de menor tamaño.");
      const mime = asset.mimeType?.includes("png") ? "png" : "jpeg";
      setBoard({ ...board, cover: `data:image/${mime};base64,${asset.base64}` }); setError("");
    } catch (e) { setError((e as Error).message); }
  }
  return <KeyboardAwareScrollViewCompat contentContainerStyle={styles.form}>
    {board.cover ? <Image source={{ uri: board.cover }} style={{ width: "100%", height: 170, borderRadius: 16 }} resizeMode="cover" />
      : <View style={[styles.board, { height: 140, justifyContent: "center" }]}><Text style={styles.title}>GO · Tableros</Text></View>}
    <View style={styles.row}><Button label="Elegir fotografía" onPress={() => void photo()} /><Button label="Portada GO" onPress={() => setBoard({ ...board, cover: null })} /></View>
    {!!error && <Text style={{ color: "#ffb0b0" }}>{error}</Text>}
    <Field label="Nombre del tablero" value={board.name} onChangeText={name => setBoard({ ...board, name })} />
    <Field label="Descripción (opcional)" value={board.description} multiline onChangeText={description => setBoard({ ...board, description })} />
    <Button label="Guardar tablero" disabled={!board.name.trim()} onPress={onSave} />
  </KeyboardAwareScrollViewCompat>;
}
function TaskEditor({ card, board, onChange, onSave, onDelete, onComplete, onTransfer }: {
  card: BoardCard; board: BoardDocument; onChange: (card: BoardCard) => void; onSave: (card: BoardCard) => void; onDelete: () => void; onComplete: () => void; onTransfer: () => void;
}) {
  const [note, setNote] = useState(""), [error, setError] = useState("");
  const saved = board.cards.some(c => c.entry.id === card.entry.id);
  return <KeyboardAwareScrollViewCompat contentContainerStyle={styles.form} bottomOffset={20}>
    <Field label="Título de la tarea" value={card.entry.notes} onChangeText={notes => onChange({ ...card, entry: { ...card.entry, notes } })} />
    <Field label="Descripción" multiline value={card.entry.detail || ""} onChangeText={detail => onChange({ ...card, entry: { ...card.entry, detail } })} />
    <Field label="Fecha opcional (AAAA-MM-DD)" value={card.entry.dateISO} onChangeText={dateISO => onChange({ ...card, entry: { ...card.entry, dateISO, ...(dateISO ? {} : { time: "" }) } })} />
    <View style={styles.row}><Button label="Sin fecha" onPress={() => onChange(moveBoardCardDate(card, ""))} />
      <Button label="Sin hora" onPress={() => onChange({ ...card, entry: { ...card.entry, time: "" } })} /></View>
    {!!card.entry.dateISO && <GoTimeField label="Hora (solo si la eliges)" value={card.entry.time} onConfirm={time => onChange({ ...card, entry: { ...card.entry, time } })} />}
    <Text style={styles.muted}>Columna</Text><View style={styles.row}>{board.columns.filter(c => !c.archived).map(c => <Button key={c.id} label={(card.columnId===c.id?"✓ ":"")+c.title} onPress={() => onChange({ ...card, columnId: c.id })} />)}</View>
    <View style={styles.row}><Text style={styles.text}>Vincular explícitamente con Calendario GO</Text><Switch value={card.calendarLinked} onValueChange={calendarLinked => onChange({ ...card, calendarLinked })} /></View>
    <View style={styles.row}><Text style={styles.text}>Archivada</Text><Switch value={card.archived} onValueChange={archived => onChange({ ...card, archived })} /></View>
    {(card.entry.messages || []).map(message => <View key={message.id} style={styles.card}><Text style={styles.text}>{message.text}</Text></View>)}
    <Field label="Añadir nota interna" value={note} multiline onChangeText={setNote} />
    <Button label="Añadir nota" disabled={!note.trim()} onPress={() => { onChange({ ...card, entry: { ...card.entry, messages: [...(card.entry.messages || []), {
      id: id(), goId: card.entry.id, senderId: "yo", text: note.trim(), createdAt: Date.now(), deliveryMode: "internal" }] } }); setNote(""); }} />
    {!!error && <Text style={{ color: "#ffb0b0" }}>{error}</Text>}
    <Button label="Guardar tarea" disabled={!card.entry.notes.trim()} onPress={() => { try { const patch = boardDatePatch(card.entry.dateISO, card.entry.time);
      setError(""); onSave({ ...card, entry: { ...card.entry, ...patch } }); } catch (e) { setError((e as Error).message); } }} />
    {saved && <View style={styles.row}><Button label={card.entry.localResolutionStatus === "done" ? "Marcar pendiente" : "Marcar completada"} onPress={onComplete} />
      <Button label="Mover a otro tablero" onPress={onTransfer} /><Button label="Eliminar tarea" danger onPress={onDelete} /></View>}
  </KeyboardAwareScrollViewCompat>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#090f1d" }, header: { flexDirection: "row", alignItems: "center", padding: 8, gap: 8, borderBottomWidth: 1, borderColor: "#2d3547" },
  title: { color: "#f0f2fc", fontWeight: "700", fontSize: 17 }, text: { color: "#eef1fa", fontSize: 15 }, muted: { color: "#aeb9cd", fontSize: 12 },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 }, form: { padding: 16, gap: 14, paddingBottom: 30 },
  button: { padding: 10, minHeight: 44, justifyContent: "center", borderRadius: 10, borderWidth: 1, backgroundColor: "#162237", borderColor: "#47556c" },
  input: { borderWidth: 1, borderColor: "#47556c", borderRadius: 10, minHeight: 46, padding: 12, color: "white", backgroundColor: "#111b2d", fontSize: 16 },
  board: { borderRadius: 16, padding: 18, borderWidth: 1, borderColor: "#58658b", backgroundColor: "#273b65" },
  card: { padding: 12, borderRadius: 10, backgroundColor: "#243047", borderWidth: 1, borderColor: "#45516b", gap: 6, marginVertical: 3 },
  day: { borderRadius: 12, borderWidth: 1, borderColor: "#45516b", backgroundColor: "#121b2b", padding: 12, gap: 8 },
  banner: { backgroundColor: "#473b22", padding: 12, gap: 8 },
});
