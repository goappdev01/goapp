import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useLanguage } from "@/contexts/LanguageContext";

// ── TIPOS ────────────────────────────────────────────────────────────────────

export type TareaPrep = {
  id: string;
  title: string;
  notes?: string;
  color?: string;
  createdAt: number;
};

export type Tablero = {
  id: string;
  name: string;
  color: string;
  tareas: TareaPrep[];
  createdAt: number;
};

export type TablerosViewHandle = {
  triggerPlus: () => void;
};

// ── CONSTANTES ────────────────────────────────────────────────────────────────

const STORAGE_KEY = "go_tableros_v1";

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

const COLOR_OPTIONS = [
  "#3b82f6", "#8b5cf6", "#f59e0b", "#10b981",
  "#ef4444", "#f97316", "#ec4899", "#06b6d4",
  "#84cc16", "#6b7280",
];

type CardColorKey = "neutral" | "blue" | "violet" | "orange" | "green" | "red" | "gold";

const CARD_COLOR_VALUES: Array<{ key: CardColorKey; value: string | undefined }> = [
  { key: "neutral", value: undefined },
  { key: "blue",    value: "#3b82f6" },
  { key: "violet",  value: "#8b5cf6" },
  { key: "orange",  value: "#f97316" },
  { key: "green",   value: "#10b981" },
  { key: "red",     value: "#ef4444" },
  { key: "gold",    value: "#f59e0b" },
];

type ViewState = "boards" | "board" | "editBoard" | "editCard";

type Props = {
  onPromoteToCalendar: (tarea: TareaPrep, tableroName: string) => void;
};

// ── COMPONENTE ────────────────────────────────────────────────────────────────

export const TablerosView = forwardRef<TablerosViewHandle, Props>(
  ({ onPromoteToCalendar }, ref) => {
    const { t } = useLanguage();
    const [tableros, setTableros] = useState<Tablero[]>([]);
    const [view, setView] = useState<ViewState>("boards");
    const [activeBoardId, setActiveBoardId] = useState<string | null>(null);

    // Board edit
    const [boardDraft, setBoardDraft] = useState<Partial<Tablero>>({});
    const [editBoardId, setEditBoardId] = useState<string | null>(null);

    // Card edit
    const [cardDraft, setCardDraft] = useState<Partial<TareaPrep>>({});
    const [editCardBoardId, setEditCardBoardId] = useState<string | null>(null);
    const [editCardId, setEditCardId] = useState<string | null>(null);

    // Slide anim for view transitions
    const slideAnim = useRef(new Animated.Value(0)).current;
    const prevView = useRef<ViewState>("boards");

    const slide = useCallback(
      (toView: ViewState) => {
        const order: ViewState[] = ["boards", "board", "editBoard", "editCard"];
        const forward = order.indexOf(toView) > order.indexOf(prevView.current);
        slideAnim.setValue(forward ? 1 : -1);
        prevView.current = toView;
        setView(toView);
        Animated.spring(slideAnim, {
          toValue: 0,
          useNativeDriver: true,
          tension: 70,
          friction: 12,
        }).start();
      },
      [slideAnim],
    );

    // ── Persistence ──────────────────────────────────────────────────────────

    useEffect(() => {
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        if (raw) {
          try { setTableros(JSON.parse(raw)); } catch {}
        } else {
          setTableros([
            { id: makeId(), name: t("board_default_casa"),    color: "#3b82f6", tareas: [], createdAt: Date.now() },
            { id: makeId(), name: t("board_default_trabajo"), color: "#8b5cf6", tareas: [], createdAt: Date.now() },
            { id: makeId(), name: t("board_default_ideas"),   color: "#f59e0b", tareas: [], createdAt: Date.now() },
          ]);
        }
      });
    }, []);

    const persist = useCallback((next: Tablero[]) => {
      setTableros(next);
      AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
    }, []);

    // ── Board ops ─────────────────────────────────────────────────────────────

    const openNewBoard = () => {
      setBoardDraft({ name: "", color: COLOR_OPTIONS[0] });
      setEditBoardId(null);
      slide("editBoard");
    };

    const openEditBoard = (tb: Tablero) => {
      setBoardDraft({ name: tb.name, color: tb.color });
      setEditBoardId(tb.id);
      slide("editBoard");
    };

    const saveBoard = () => {
      if (!boardDraft.name?.trim()) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (editBoardId) {
        persist(tableros.map((tb) =>
          tb.id === editBoardId
            ? { ...tb, name: boardDraft.name!, color: boardDraft.color ?? tb.color }
            : tb,
        ));
      } else {
        const nb: Tablero = {
          id: makeId(),
          name: boardDraft.name!,
          color: boardDraft.color ?? COLOR_OPTIONS[0],
          tareas: [],
          createdAt: Date.now(),
        };
        persist([...tableros, nb]);
      }
      slide("boards");
    };

    const deleteBoard = (id: string) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      persist(tableros.filter((tb) => tb.id !== id));
      if (activeBoardId === id) setActiveBoardId(null);
      slide("boards");
    };

    const enterBoard = (id: string) => {
      setActiveBoardId(id);
      slide("board");
    };

    // ── Card ops ──────────────────────────────────────────────────────────────

    const openNewCard = (boardId?: string) => {
      const bid = boardId ?? activeBoardId;
      if (!bid) return;
      setCardDraft({ title: "", notes: "", color: undefined });
      setEditCardBoardId(bid);
      setEditCardId(null);
      slide("editCard");
    };

    const openEditCard = (boardId: string, card: TareaPrep) => {
      setCardDraft({ title: card.title, notes: card.notes, color: card.color });
      setEditCardBoardId(boardId);
      setEditCardId(card.id);
      slide("editCard");
    };

    const saveCard = () => {
      if (!cardDraft.title?.trim() || !editCardBoardId) return;
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      persist(tableros.map((tb) => {
        if (tb.id !== editCardBoardId) return tb;
        if (editCardId) {
          return {
            ...tb,
            tareas: tb.tareas.map((c) =>
              c.id === editCardId
                ? { ...c, title: cardDraft.title!, notes: cardDraft.notes, color: cardDraft.color }
                : c,
            ),
          };
        }
        const nc: TareaPrep = {
          id: makeId(),
          title: cardDraft.title!,
          notes: cardDraft.notes,
          color: cardDraft.color,
          createdAt: Date.now(),
        };
        return { ...tb, tareas: [...tb.tareas, nc] };
      }));
      slide(activeBoardId ? "board" : "boards");
    };

    const deleteCard = (boardId: string, cardId: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      persist(tableros.map((tb) =>
        tb.id === boardId
          ? { ...tb, tareas: tb.tareas.filter((c) => c.id !== cardId) }
          : tb,
      ));
    };

    const promoteCard = (boardId: string, card: TareaPrep) => {
      const tablero = tableros.find((tb) => tb.id === boardId);
      if (!tablero) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onPromoteToCalendar(card, tablero.name);
      persist(tableros.map((tb) =>
        tb.id === boardId
          ? { ...tb, tareas: tb.tareas.filter((c) => c.id !== card.id) }
          : tb,
      ));
      slide("board");
    };

    // ── Imperative handle ─────────────────────────────────────────────────────

    useImperativeHandle(ref, () => ({
      triggerPlus: () => {
        Haptics.selectionAsync();
        if (view === "boards") openNewBoard();
        else if (view === "board") openNewCard();
        else slide(view === "editCard" ? "board" : "boards");
      },
    }));

    // ── Helpers ───────────────────────────────────────────────────────────────

    const activeBoard = tableros.find((tb) => tb.id === activeBoardId) ?? null;

    const translateX = slideAnim.interpolate({
      inputRange: [-1, 0, 1],
      outputRange: [-320, 0, 320],
    });

    const cardColorLabel = (key: CardColorKey) => {
      const map: Record<CardColorKey, string> = {
        neutral: t("card_color_neutral"),
        blue:    t("card_color_blue"),
        violet:  t("card_color_violet"),
        orange:  t("card_color_orange"),
        green:   t("card_color_green"),
        red:     t("card_color_red"),
        gold:    t("card_color_gold"),
      };
      return map[key];
    };

    // ── Render ────────────────────────────────────────────────────────────────

    return (
      <Animated.View style={{ flex: 1, transform: [{ translateX }] }}>

        {/* ── VISTA: LISTA DE TABLEROS ───────────────────────────────────── */}
        {view === "boards" && (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {tableros.length === 0 && (
              <View style={{ alignItems: "center", paddingTop: 40, gap: 12 }}>
                <Feather name="layers" size={36} color="rgba(255,255,255,0.12)" />
                <Text style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, fontWeight: "600", letterSpacing: 0.5 }}>
                  {t("board_no_boards")}
                </Text>
                <Text style={{ color: "rgba(255,255,255,0.22)", fontSize: 11, textAlign: "center", lineHeight: 17 }}>
                  {t("board_create_hint")}
                </Text>
              </View>
            )}
            {tableros.map((tb) => (
              <TouchableOpacity
                key={tb.id}
                onPress={() => { Haptics.selectionAsync(); enterBoard(tb.id); }}
                activeOpacity={0.75}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  borderRadius: 14,
                  backgroundColor: "#FFFFFF",
                  borderWidth: 1,
                  borderColor: "rgba(0,0,0,0.08)",
                  gap: 14,
                }}
              >
                <View style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: tb.color,
                  shadowColor: tb.color, shadowOpacity: 0.8, shadowRadius: 6,
                }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#111827", fontSize: 14, fontWeight: "700", letterSpacing: 0.3 }}>
                    {tb.name}
                  </Text>
                  <Text style={{ color: "#9CA3AF", fontSize: 11, marginTop: 2 }}>
                    {tb.tareas.length === 0
                      ? t("board_sin_fichas")
                      : `${tb.tareas.length} ${tb.tareas.length !== 1 ? t("group_contact_plural") : t("group_contact_singular")}`}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync(); openEditBoard(tb); }}
                  hitSlop={10}
                >
                  <Feather name="edit-2" size={14} color="#D1D5DB" />
                </TouchableOpacity>
                <Feather name="chevron-right" size={16} color="#D1D5DB" />
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* ── VISTA: INTERIOR DE UN TABLERO ────────────────────────────── */}
        {view === "board" && activeBoard && (
          <View style={{ flex: 1 }}>
            <View style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 16,
              paddingTop: 8,
              paddingBottom: 10,
              gap: 10,
              borderBottomWidth: 1,
              borderBottomColor: "rgba(0,0,0,0.06)",
            }}>
              <TouchableOpacity onPress={() => slide("boards")} hitSlop={8} activeOpacity={0.8} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" }}>
                <Feather name="chevron-down" size={18} color="#6B7280" />
              </TouchableOpacity>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: activeBoard.color }} />
              <Text style={{ flex: 1, color: "#111827", fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800", letterSpacing: 1.2 }}>
                {activeBoard.name.toUpperCase()}
              </Text>
              <TouchableOpacity onPress={() => openEditBoard(activeBoard)} hitSlop={10}>
                <Feather name="edit-2" size={14} color="#9CA3AF" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 14, gap: 8, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {activeBoard.tareas.length === 0 && (
                <View style={{ alignItems: "center", paddingTop: 32, gap: 10 }}>
                  <Feather name="square" size={30} color="#D1D5DB" />
                  <Text style={{ color: "#9CA3AF", fontSize: 12, letterSpacing: 0.4 }}>
                    {t("board_no_cards")}
                  </Text>
                </View>
              )}
              {activeBoard.tareas.map((card) => (
                <TouchableOpacity
                  key={card.id}
                  onPress={() => openEditCard(activeBoard.id, card)}
                  activeOpacity={0.75}
                  style={{
                    paddingVertical: 13,
                    paddingHorizontal: 15,
                    borderRadius: 12,
                    backgroundColor: card.color ? card.color + "10" : "#F7F8FA",
                    borderWidth: 1,
                    borderLeftWidth: 3,
                    borderColor: card.color ? card.color + "30" : "rgba(0,0,0,0.07)",
                    borderLeftColor: card.color ?? activeBoard.color,
                    gap: 4,
                  }}
                >
                  <Text style={{ color: "#111827", fontSize: 13, fontWeight: "600" }}>
                    {card.title}
                  </Text>
                  {!!card.notes && (
                    <Text
                      style={{ color: "#9CA3AF", fontSize: 11, lineHeight: 16 }}
                      numberOfLines={2}
                    >
                      {card.notes}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── VISTA: EDITAR / CREAR TABLERO ────────────────────────────── */}
        {view === "editBoard" && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                onPress={() => slide(editBoardId && activeBoardId ? "board" : "boards")}
                hitSlop={8}
                activeOpacity={0.8}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }}
              >
                <Feather name="chevron-down" size={18} color="#6B7280" />
              </TouchableOpacity>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}>
                  {t("board_name_label")}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#F7F8FA",
                    borderWidth: 1,
                    borderColor: boardDraft.name?.trim() ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.08)",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: "#111827",
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                  value={boardDraft.name}
                  onChangeText={(v) => setBoardDraft((d) => ({ ...d, name: v }))}
                  placeholder={t("board_placeholder_name")}
                  placeholderTextColor="#D1D5DB"
                  autoFocus
                  maxLength={32}
                  returnKeyType="done"
                />
              </View>

              <View style={{ gap: 10 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}>
                  {t("board_color_label")}
                </Text>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
                  {COLOR_OPTIONS.map((c) => (
                    <TouchableOpacity
                      key={c}
                      onPress={() => setBoardDraft((d) => ({ ...d, color: c }))}
                      activeOpacity={0.75}
                      style={{
                        width: 28, height: 28, borderRadius: 14,
                        backgroundColor: c,
                        borderWidth: boardDraft.color === c ? 2.5 : 0,
                        borderColor: "rgba(0,0,0,0.2)",
                        shadowColor: c, shadowOpacity: boardDraft.color === c ? 0.9 : 0, shadowRadius: 6,
                        transform: [{ scale: boardDraft.color === c ? 1.15 : 1 }],
                      }}
                    />
                  ))}
                </View>
              </View>

              <View style={{ gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={saveBoard}
                  activeOpacity={0.8}
                  style={{
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: boardDraft.name?.trim() ? "#3D9A84" : "#F3F4F6",
                    borderWidth: 1,
                    borderColor: boardDraft.name?.trim() ? "#3D9A84" : "rgba(0,0,0,0.08)",
                    opacity: boardDraft.name?.trim() ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: boardDraft.name?.trim() ? "#FFFFFF" : "#9CA3AF", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 }}>
                    {editBoardId ? t("board_save_btn") : t("board_create_btn")}
                  </Text>
                </TouchableOpacity>
                {editBoardId && (
                  <TouchableOpacity
                    onPress={() => deleteBoard(editBoardId)}
                    activeOpacity={0.8}
                    style={{
                      paddingVertical: 12,
                      borderRadius: 12,
                      alignItems: "center",
                      flexDirection: "row",
                      justifyContent: "center",
                      gap: 8,
                      backgroundColor: "rgba(239,68,68,0.08)",
                      borderWidth: 1,
                      borderColor: "rgba(239,68,68,0.25)",
                    }}
                  >
                    <Feather name="trash-2" size={14} color="#ef4444" />
                    <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
                      {t("board_delete_btn")}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}

        {/* ── VISTA: EDITAR / CREAR FICHA ──────────────────────────────── */}
        {view === "editCard" && (
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={{ flex: 1 }}
          >
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, gap: 18, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              <TouchableOpacity
                onPress={() => slide("board")}
                hitSlop={8}
                activeOpacity={0.8}
                style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center", alignSelf: "flex-start" }}
              >
                <Feather name="chevron-down" size={18} color="#6B7280" />
              </TouchableOpacity>

              <View style={{
                flexDirection: "row", alignItems: "center", gap: 8,
                backgroundColor: "#F7F8FA",
                borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
                borderWidth: 1, borderColor: "rgba(0,0,0,0.06)",
              }}>
                <Feather name="clock" size={12} color="#9CA3AF" />
                <Text style={{ color: "#9CA3AF", fontSize: 11, lineHeight: 16 }}>
                  {t("board_card_no_date")}
                </Text>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}>
                  {t("board_title_label")}
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#F7F8FA",
                    borderWidth: 1,
                    borderColor: cardDraft.title?.trim() ? "rgba(0,0,0,0.2)" : "rgba(0,0,0,0.08)",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: "#111827",
                    fontSize: 15,
                    fontWeight: "600",
                  }}
                  value={cardDraft.title}
                  onChangeText={(v) => setCardDraft((d) => ({ ...d, title: v }))}
                  placeholder={t("board_placeholder_title")}
                  placeholderTextColor="#D1D5DB"
                  autoFocus
                  maxLength={80}
                  returnKeyType="next"
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}>
                  {t("board_notes_opt")}{" "}
                  <Text style={{ color: "#D1D5DB", fontWeight: "400" }}>
                    {t("board_notes_optional_hint")}
                  </Text>
                </Text>
                <TextInput
                  style={{
                    backgroundColor: "#F7F8FA",
                    borderWidth: 1,
                    borderColor: "rgba(0,0,0,0.08)",
                    borderRadius: 10,
                    paddingHorizontal: 14,
                    paddingVertical: 12,
                    color: "#111827",
                    fontSize: 13,
                    minHeight: 80,
                    textAlignVertical: "top",
                  }}
                  value={cardDraft.notes}
                  onChangeText={(v) => setCardDraft((d) => ({ ...d, notes: v }))}
                  placeholder={t("board_placeholder_notes")}
                  placeholderTextColor="#D1D5DB"
                  multiline
                  maxLength={400}
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ color: "#9CA3AF", fontSize: 10, fontWeight: "700", letterSpacing: 1.2 }}>
                  {t("board_color_label")}{" "}
                  <Text style={{ color: "#D1D5DB", fontWeight: "400" }}>
                    {t("board_color_opt_label")}
                  </Text>
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
                  {CARD_COLOR_VALUES.map((cc) => (
                    <TouchableOpacity
                      key={cc.key}
                      onPress={() => setCardDraft((d) => ({ ...d, color: cc.value }))}
                      activeOpacity={0.75}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: 20,
                        backgroundColor: cc.value ? cc.value + "12" : "#F3F4F6",
                        borderWidth: cardDraft.color === cc.value ? 1.5 : 1,
                        borderColor: cardDraft.color === cc.value
                          ? (cc.value ?? "rgba(0,0,0,0.2)")
                          : "rgba(0,0,0,0.08)",
                      }}
                    >
                      {cc.value && (
                        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: cc.value }} />
                      )}
                      <Text style={{
                        color: cardDraft.color === cc.value
                          ? (cc.value ?? "#111827")
                          : "#9CA3AF",
                        fontSize: 11,
                        fontWeight: "700",
                        letterSpacing: 0.5,
                      }}>
                        {cardColorLabel(cc.key).toUpperCase()}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={{ gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={saveCard}
                  activeOpacity={0.8}
                  style={{
                    paddingVertical: 14,
                    borderRadius: 12,
                    alignItems: "center",
                    backgroundColor: cardDraft.title?.trim() ? "#3D9A84" : "#F3F4F6",
                    borderWidth: 1,
                    borderColor: cardDraft.title?.trim() ? "#3D9A84" : "rgba(0,0,0,0.08)",
                    opacity: cardDraft.title?.trim() ? 1 : 0.5,
                  }}
                >
                  <Text style={{ color: cardDraft.title?.trim() ? "#FFFFFF" : "#9CA3AF", fontSize: 12, fontWeight: "900", letterSpacing: 1.5 }}>
                    {t("board_save_btn")}
                  </Text>
                </TouchableOpacity>

                {editCardId && editCardBoardId && (
                  <>
                    <TouchableOpacity
                      onPress={() => promoteCard(editCardBoardId, {
                        id: editCardId,
                        title: cardDraft.title ?? "",
                        notes: cardDraft.notes,
                        color: cardDraft.color,
                        createdAt: Date.now(),
                      })}
                      activeOpacity={0.8}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                        backgroundColor: "rgba(201,168,76,0.08)",
                        borderWidth: 1,
                        borderColor: "rgba(201,168,76,0.30)",
                      }}
                    >
                      <Feather name="arrow-up-right" size={14} color="#C9A84C" />
                      <Text style={{ color: "#C9A84C", fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
                        CONVERTIR EN GO
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => {
                        if (editCardBoardId && editCardId) {
                          deleteCard(editCardBoardId, editCardId);
                          slide("board");
                        }
                      }}
                      activeOpacity={0.8}
                      style={{
                        paddingVertical: 12,
                        borderRadius: 12,
                        alignItems: "center",
                        flexDirection: "row",
                        justifyContent: "center",
                        gap: 8,
                        backgroundColor: "rgba(239,68,68,0.08)",
                        borderWidth: 1,
                        borderColor: "rgba(239,68,68,0.25)",
                      }}
                    >
                      <Feather name="trash-2" size={14} color="#ef4444" />
                      <Text style={{ color: "#ef4444", fontSize: 11, fontWeight: "700", letterSpacing: 1 }}>
                        {t("swipe_delete")}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </Animated.View>
    );
  },
);

TablerosView.displayName = "TablerosView";
