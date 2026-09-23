import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { DraggableFAB } from "./DraggableFAB";
import * as Haptics from "expo-haptics";
import { useLanguage } from "@/contexts/LanguageContext";
import { LinearGradient } from "expo-linear-gradient";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  Easing,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

// ─── Types ───────────────────────────────────────────────────────────────────

export type GoDirectMessage = {
  id: string;
  text: string;
  senderId: "yo" | string;
  createdAt: number;
  channel: "go" | "whatsapp";
  linkedGoId?: string;
};

export type GoConversation = {
  id: string;
  contactName: string;
  contactPhone: string;
  isGoUser: boolean;
  messages: GoDirectMessage[];
  lastUpdated: number;
  unread: number;
};

type MessagesScreenProps = {
  visible: boolean;
  onClose: () => void;
  recentContacts: { name: string; phone: string }[];
  userGoPhone: string;
  onCreateGo: (params: {
    contactName: string;
    contactPhone: string;
    contextText: string;
  }) => void;
  onPickDeviceContact: () => Promise<{ name: string; phone: string } | null>;
  /** Cuando se provee, abre directamente el hilo de este contacto al abrir la pantalla. */
  initialContact?: { name: string; phone: string };
};

// ─── Design tokens ────────────────────────────────────────────────────────────

const STORAGE_KEY = "go_messages_v1";
const screen = Dimensions.get("window");

const C = {
  bg:           "#F7F8FA",
  surface:      "#FFFFFF",
  surface2:     "#F3F4F6",
  border:       "rgba(0,0,0,0.1)",
  border2:      "rgba(0,0,0,0.08)",
  text:         "#111827",
  textSub:      "#374151",
  textMuted:    "#9CA3AF",
  placeholder:  "#9CA3AF",
  icon:         "#374151",
  iconSub:      "#6B7280",
  green:        "#3D9A84",
  greenDim:     "rgba(61,154,132,0.1)",
  greenBorder:  "rgba(61,154,132,0.3)",
  whatsapp:     "#25d366",
  whatsappDim:  "rgba(37,211,102,0.1)",
  red:          "#C25A5A",
  sent:         "rgba(61,154,132,0.1)",
  received:     "#F3F4F6",
  bar:          "rgba(247,248,250,0.98)",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatTime(ts: number, lang = "es", yesterdayLabel = "Ayer"): string {
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString(lang === "en" ? "en-US" : "es-ES", { hour: "2-digit", minute: "2-digit" });
  }
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return yesterdayLabel;
  return d.toLocaleDateString(lang === "en" ? "en-US" : "es-ES", { day: "2-digit", month: "2-digit" });
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ─── SwipeToDelete Row ────────────────────────────────────────────────────────

function SwipeDeleteRow({
  children,
  onDelete,
}: {
  children: React.ReactNode;
  onDelete: () => void;
}) {
  const tx = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState<"normal" | "pending">("normal");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const clearTimer = () => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
  };

  const snapBack = useCallback(() => {
    clearTimer();
    setPhase("normal");
    Animated.spring(tx, { toValue: 0, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
  }, [tx]);

  const startPendingTimer = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(() => {
      if (phaseRef.current === "pending") snapBack();
    }, 2000);
  }, [snapBack]);

  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 8 && Math.abs(gs.dy) < 15,
      onPanResponderMove: (_, gs) => { if (gs.dx < 0) tx.setValue(Math.max(gs.dx, -100)); },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40 && phaseRef.current === "normal") {
          Animated.spring(tx, { toValue: -80, useNativeDriver: true, speed: 30, bounciness: 0 }).start();
          setPhase("pending");
          startPendingTimer();
        } else if (gs.dx > 10) {
          snapBack();
        } else {
          Animated.spring(tx, {
            toValue: phaseRef.current === "pending" ? -80 : 0,
            useNativeDriver: true, speed: 30, bounciness: 0,
          }).start();
        }
      },
      onPanResponderTerminate: () => snapBack(),
    })
  ).current;

  useEffect(() => () => clearTimer(), []);

  const bgOpacity = tx.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: "clamp" });

  return (
    <View style={{ position: "relative", overflow: "hidden" }}>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFillObject, {
          backgroundColor: C.red, opacity: bgOpacity,
          flexDirection: "row-reverse", alignItems: "center", paddingRight: 22,
        }]}
      >
        <Feather name="trash-2" size={18} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 11, fontFamily: "Inter_900Black", fontWeight: "900", marginRight: 6, letterSpacing: 0.5 }}>
          DELETE
        </Text>
      </Animated.View>
      {phase === "pending" && (
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onDelete(); }}
          style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 90, zIndex: 10 }}
        />
      )}
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: tx }] }}>
        {children}
      </Animated.View>
    </View>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, isGoUser, size = 44 }: { name: string; isGoUser: boolean; size?: number }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: isGoUser ? "rgba(0,200,83,0.15)" : "#222",
      borderWidth: 1.5,
      borderColor: isGoUser ? C.greenBorder : "rgba(255,255,255,0.22)",
      alignItems: "center", justifyContent: "center",
    }}>
      <Text style={{ color: isGoUser ? C.green : "#fff", fontSize: size * 0.33, fontWeight: "800" }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

// ─── ChannelBadge ─────────────────────────────────────────────────────────────

function ChannelBadge({ isGoUser }: { isGoUser: boolean }) {
  return (
    <View style={[s.badge, isGoUser ? s.badgeGo : s.badgeWa]}>
      <Text style={[s.badgeText, { color: isGoUser ? C.green : C.whatsapp }]} {...(Platform.OS === "web" ? { translate: "no" as const } : {})}>
        {isGoUser ? "GO" : "WA"}
      </Text>
    </View>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function MessagesScreen({
  visible,
  onClose,
  recentContacts,
  userGoPhone,
  onCreateGo,
  onPickDeviceContact,
  initialContact,
}: MessagesScreenProps) {
  const insets = useSafeAreaInsets();
  const { lang, t } = useLanguage();
  const yesterdayLabel = lang === "en" ? "Yesterday" : "Ayer";
  const ft = (ts: number) => formatTime(ts, lang, yesterdayLabel);
  const [conversations, setConversations] = useState<GoConversation[]>([]);
  const [view, setView] = useState<"list" | "thread" | "new">("list");
  const [activeConv, setActiveConv] = useState<GoConversation | null>(null);
  const [search, setSearch] = useState("");
  const [input, setInput] = useState("");
  const [inputKey, setInputKey] = useState(0);
  const threadScrollRef = useRef<ScrollView>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  // ── Persist ───────────────────────────────────────────────────────────────

  const persist = useCallback((convs: GoConversation[]) => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(convs)).catch(() => {});
  }, []);

  useEffect(() => {
    if (visible) {
      AsyncStorage.getItem(STORAGE_KEY).then((raw) => {
        let convs: GoConversation[] = [];
        if (raw) { try { convs = JSON.parse(raw); } catch {} }

        // Si viene un contacto inicial desde un GO, abrir directamente su hilo.
        if (initialContact?.phone || initialContact?.name) {
          const phone = initialContact.phone || "";
          const name  = initialContact.name  || phone;
          const existing = convs.find((c) => phone ? c.contactPhone === phone : c.contactName === name);
          if (existing) {
            // Hilo existente: marcar como leído y abrir
            const updated = convs.map((c) => c.id === existing.id ? { ...c, unread: 0 } : c);
            setConversations(updated);
            persist(updated);
            setActiveConv({ ...existing, unread: 0 });
            slideAnim.setValue(screen.width);
            setView("thread");
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 4 }).start();
          } else {
            // Hilo nuevo: crear conversación vacía y abrir
            const newConv: GoConversation = {
              id: makeId(), contactName: name, contactPhone: phone,
              isGoUser: false, messages: [], lastUpdated: Date.now(), unread: 0,
            };
            const updated = [newConv, ...convs];
            setConversations(updated);
            persist(updated);
            setActiveConv(newConv);
            slideAnim.setValue(screen.width);
            setView("thread");
            Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 4 }).start();
          }
        } else {
          // Apertura normal: mostrar lista
          setConversations(convs);
          setView("list");
        }
        setSearch("");
      });
    }
  }, [visible]);

  // ── Navigation ────────────────────────────────────────────────────────────

  const openThread = (conv: GoConversation) => {
    Haptics.selectionAsync();
    setConversations(prev => {
      const exists = prev.some((c) => c.id === conv.id);
      if (!exists) return prev;
      const updated = prev.map((c) => c.id === conv.id ? { ...c, unread: 0 } : c);
      persist(updated);
      return updated;
    });
    setActiveConv({ ...conv, unread: 0 });
    slideAnim.setValue(screen.width);
    setView("thread");
    Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, speed: 22, bounciness: 4 }).start();
  };

  const backToList = () => {
    Animated.timing(slideAnim, {
      toValue: screen.width, duration: 220,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start(() => setView("list"));
  };

  // ── Back swipe (thread) ───────────────────────────────────────────────────

  const swipeX = useSharedValue(0);
  const backGesture = Gesture.Pan()
    .activeOffsetX([6, 999]).failOffsetY([-22, 22]).runOnJS(true)
    .onUpdate((e) => { if (e.translationX > 0) swipeX.value = e.translationX; })
    .onEnd((e) => {
      if (e.translationX > 40 || e.velocityX > 350) { swipeX.value = withSpring(0); backToList(); }
      else swipeX.value = withSpring(0);
    })
    .onFinalize(() => { swipeX.value = withSpring(0); });

  const swipeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: swipeX.value }] }));

  // ── Send ──────────────────────────────────────────────────────────────────

  const sendMessage = () => {
    if (!input.trim() || !activeConv) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const msg: GoDirectMessage = {
      id: makeId(), text: input.trim(), senderId: "yo",
      createdAt: Date.now(), channel: activeConv.isGoUser ? "go" : "whatsapp",
    };
    const updatedConv = { ...activeConv, messages: [...activeConv.messages, msg], lastUpdated: Date.now() };
    setActiveConv(updatedConv);
    setInput("");
    setInputKey(k => k + 1);
    setConversations(prev => {
      const exists = prev.some((c) => c.id === activeConv.id);
      const next = exists
        ? prev.map((c) => c.id === activeConv.id ? updatedConv : c)
        : [updatedConv, ...prev];
      const sorted = [...next].sort((a, b) => b.lastUpdated - a.lastUpdated);
      persist(sorted);
      return sorted;
    });
    setTimeout(() => threadScrollRef.current?.scrollToEnd({ animated: true }), 60);
  };

  // ── Delete ────────────────────────────────────────────────────────────────

  const deleteConv = (id: string) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    const updated = conversations.filter((c) => c.id !== id);
    setConversations(updated); persist(updated);
  };

  // ── Create GO from context ────────────────────────────────────────────────

  const handleCreateGo = () => {
    if (!activeConv) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const last5 = activeConv.messages.slice(-5)
      .map((m) => `${m.senderId === "yo" ? "Yo" : activeConv.contactName}: ${m.text}`).join("\n");
    onCreateGo({ contactName: activeConv.contactName, contactPhone: activeConv.contactPhone, contextText: last5 });
  };

  // ── Start conversation ────────────────────────────────────────────────────

  const startNewConv = (contact: { name: string; phone: string }) => {
    Haptics.selectionAsync();
    const existing = conversations.find((c) => c.contactPhone === contact.phone);
    if (existing) { openThread(existing); return; }
    const conv: GoConversation = {
      id: makeId(), contactName: contact.name, contactPhone: contact.phone,
      isGoUser: false, messages: [], lastUpdated: Date.now(), unread: 0,
    };
    const updated = [conv, ...conversations];
    setConversations(updated); persist(updated);
    openThread(conv);
  };

  // ── Filtered lists ────────────────────────────────────────────────────────

  const filteredConvs = search.trim()
    ? conversations.filter((c) => c.contactName.toLowerCase().includes(search.toLowerCase()))
    : conversations;

  const pbBottom = Math.max(insets.bottom, 14);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top }]}>
        {/* Pure black background — no blue gradient */}
        <View style={[StyleSheet.absoluteFillObject, { backgroundColor: C.bg }]} pointerEvents="none" />

        {/* ═══ LIST VIEW ═══════════════════════════════════════════════════ */}
        {view === "list" && (
          <KeyboardAvoidingView
            style={s.flex}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {/* Title — no back button here */}
            <View style={s.titleRow}>
              <Text style={s.titleText} {...(Platform.OS === "web" ? { translate: "no" as const } : {})}>MESSAGES</Text>
              <View style={s.titleBadge}>
                <Text style={s.titleBadgeText} {...(Platform.OS === "web" ? { translate: "no" as const } : {})}>GO</Text>
              </View>
            </View>

            {/* Conversations list */}
            <FlatList
              data={filteredConvs}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: 110 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              ListEmptyComponent={
                <View style={s.empty}>
                  <Feather name="message-circle" size={44} color="#333" />
                  <Text style={s.emptyText}>{t("msg_no_conv_yet")}</Text>
                  <Text style={s.emptyHint}>{t("msg_tap_contacts_start")}</Text>
                </View>
              }
              renderItem={({ item: conv }) => (
                <SwipeDeleteRow onDelete={() => deleteConv(conv.id)}>
                  <TouchableOpacity activeOpacity={0.8} onPress={() => openThread(conv)} style={s.convRow}>
                    <Avatar name={conv.contactName} isGoUser={conv.isGoUser} />
                    <View style={s.convBody}>
                      <View style={s.convTop}>
                        <Text style={s.convName} numberOfLines={1}>{conv.contactName}</Text>
                        <Text style={s.convTime}>
                          {conv.messages.length > 0 ? ft(conv.lastUpdated) : ""}
                        </Text>
                      </View>
                      <View style={s.convBottom}>
                        <Text style={s.convPreview} numberOfLines={1}>
                          {conv.messages.length > 0
                            ? conv.messages[conv.messages.length - 1].text
                            : t("msg_tap_to_write")}
                        </Text>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          {conv.unread > 0 && (
                            <View style={s.unreadBadge}>
                              <Text style={s.unreadText}>{conv.unread}</Text>
                            </View>
                          )}
                          <ChannelBadge isGoUser={conv.isGoUser} />
                        </View>
                      </View>
                    </View>
                  </TouchableOpacity>
                </SwipeDeleteRow>
              )}
              ItemSeparatorComponent={() => <View style={s.sep} />}
            />

            {/* Bottom bar — sits just above keyboard */}
            <View style={[s.bottomBar, { paddingBottom: pbBottom }]}>
              {/* Search — left, flex */}
              <View style={s.searchBox}>
                <Feather name="search" size={15} color={C.iconSub} style={{ marginLeft: 12 }} />
                <TextInput
                  value={search}
                  onChangeText={setSearch}
                  placeholder={lang === "en" ? "Search conversation..." : "Buscar conversación..."}
                  placeholderTextColor={C.placeholder}
                  style={s.searchInput}
                  returnKeyType="search"
                />
              </View>

              {/* CONTACTOS button — icon only */}
              <TouchableOpacity
                onPress={async () => {
                  Haptics.selectionAsync();
                  const contact = await onPickDeviceContact();
                  if (contact) startNewConv(contact);
                }}
                style={s.contactsBtn}
                activeOpacity={0.8}
                accessibilityLabel="Contactos"
              >
                <Feather name="users" size={18} color="#111827" />
              </TouchableOpacity>

              {/* Close */}
              <TouchableOpacity onPress={onClose} style={s.iconBtn} activeOpacity={0.75}>
                <Feather name="chevron-down" size={20} color={C.icon} />
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        )}


        {/* ═══ THREAD VIEW ═════════════════════════════════════════════════ */}
        {view === "thread" && activeConv && (
          <GestureDetector gesture={backGesture}>
            <Reanimated.View style={[s.flex, swipeStyle]}>
              <Animated.View style={[s.flex, { transform: [{ translateX: slideAnim }] }]}>
                {/* Thread title — contact info only, no top buttons */}
                <View style={s.threadTitleRow}>
                  <Avatar name={activeConv.contactName} isGoUser={activeConv.isGoUser} size={36} />
                  <View style={{ flex: 1, marginLeft: 11 }}>
                    <Text style={s.threadName} numberOfLines={1}>
                      {activeConv.contactName
                        ? activeConv.contactName
                        : activeConv.isGoUser
                          ? (lang === "en" ? "GO User" : "Usuario GO")
                          : (lang === "en" ? "Contact" : "Contacto")}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      <ChannelBadge isGoUser={activeConv.isGoUser} />
                      {activeConv.contactPhone ? (
                        <Text style={{ color: C.textMuted, fontSize: 11 }}>
                          {activeConv.contactPhone}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Messages */}
                <KeyboardAvoidingView
                  behavior={Platform.OS === "ios" ? "padding" : "height"}
                  keyboardVerticalOffset={Platform.OS === "ios" ? 62 : 0}
                  style={s.flex}
                >
                  {/* Chat area container — distinct background */}
                  <View style={s.chatArea}>
                  <ScrollView
                    ref={threadScrollRef}
                    contentContainerStyle={{ flexGrow: 1, justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 14, paddingBottom: 14 }}
                    showsVerticalScrollIndicator={false}
                    onLayout={() => threadScrollRef.current?.scrollToEnd({ animated: false })}
                    onContentSizeChange={() => threadScrollRef.current?.scrollToEnd({ animated: true })}
                    keyboardShouldPersistTaps="handled"
                  >
                    {activeConv.messages.length === 0 && (
                      <View style={[s.empty, { paddingTop: 60 }]}>
                        <Feather name="message-circle" size={32} color="#2a2a2a" />
                        <Text style={s.emptyHint}>{t("msg_conv_start")}</Text>
                        {!activeConv.isGoUser && (
                          <Text style={[s.emptyHint, { color: "#555", marginTop: 6, textAlign: "center", paddingHorizontal: 30 }]}>
                            {lang === "en" ? "No GO — message will go via WhatsApp" : "Sin GO — el mensaje irá por WhatsApp"}
                          </Text>
                        )}
                      </View>
                    )}

                    {activeConv.messages.map((msg, i) => {
                      const mine = msg.senderId === "yo";
                      const showDate =
                        i === 0 ||
                        new Date(msg.createdAt).toDateString() !==
                          new Date(activeConv.messages[i - 1]?.createdAt).toDateString();
                      return (
                        <View key={msg.id}>
                          {showDate && (
                            <View style={s.dateDivider}>
                              <View style={s.dateLine} />
                              <Text style={s.dateLabel}>{ft(msg.createdAt)}</Text>
                              <View style={s.dateLine} />
                            </View>
                          )}
                          {mine ? (
                            <LinearGradient
                              colors={["#1e3d31", "#0c2019"]}
                              start={{ x: 0.15, y: 0 }}
                              end={{ x: 0.85, y: 1 }}
                              style={[s.bubble, s.bubbleMine]}
                            >
                              <Text style={[s.bubbleText, { color: "#FFFFFF" }]}>{msg.text}</Text>
                              <View style={s.bubbleMeta}>
                                <Text style={[s.bubbleTime, { color: "rgba(255,255,255,0.7)" }]}>
                                  {new Date(msg.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                                <>
                                  <Text style={[s.checkMark, { color: msg.channel === "go" ? C.green : C.whatsapp }]}>✓</Text>
                                  <View style={[s.channelDot, { backgroundColor: msg.channel === "go" ? C.green : C.whatsapp }]} />
                                </>
                              </View>
                            </LinearGradient>
                          ) : (
                            <View style={[s.bubble, s.bubbleTheirs]}>
                              <Text style={s.bubbleText}>{msg.text}</Text>
                              <View style={s.bubbleMeta}>
                                <Text style={s.bubbleTime}>
                                  {new Date(msg.createdAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
                                </Text>
                              </View>
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </ScrollView>
                  </View>{/* end chatArea */}

                  {/* Thread input area — big input LEFT, 3-button column RIGHT */}
                  <View style={[s.inputArea, { paddingBottom: Math.max(insets.bottom, 10) + 4 }]}>
                    {/* Text input — takes all available width */}
                    <TextInput
                      key={inputKey}
                      value={input}
                      onChangeText={setInput}
                      placeholder={lang === "en" ? "Write a message..." : "Escribe un mensaje..."}
                      placeholderTextColor="rgba(255,255,255,0.30)"
                      style={s.msgInput}
                      multiline
                      maxLength={1000}
                      returnKeyType="default"
                      textAlignVertical="top"
                    />

                    {/* Right column — GO (top) / ENVIAR (bottom) */}
                    <View style={s.actionCol}>
                      {/* GO — upper, used less often */}
                      <TouchableOpacity
                        onPress={handleCreateGo}
                        style={[s.actionBtn, s.actionBtnGo]}
                        activeOpacity={0.8}
                      >
                        <Text style={s.actionBtnLabelGo} {...(Platform.OS === "web" ? { translate: "no" as const } : {})}>GO</Text>
                      </TouchableOpacity>

                      {/* ENVIAR — lower, closest to thumb, most used */}
                      <TouchableOpacity
                        onPress={sendMessage}
                        style={[s.actionBtn, s.actionBtnSend, { opacity: input.trim() ? 1 : 0.35 }]}
                        activeOpacity={0.75}
                        disabled={!input.trim()}
                      >
                        <Feather name="send" size={18} color="#fff" />
                        <Text style={s.actionBtnLabel}>{t("msg_send_btn")}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </KeyboardAvoidingView>
              </Animated.View>

              {/* ── FAB volver — arrastrable con long-press ───────────── */}
              <DraggableFAB
                screenKey="messages"
                buttonKey="back"
                initialRight={20}
                initialBottom={insets.bottom + 24}
                maxH={40}
              >
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}); backToList(); }}
                  activeOpacity={0.8}
                  style={s.fabBack}
                  accessibilityLabel={lang === "en" ? "Back to conversations" : "Volver a conversaciones"}
                >
                  <Feather name="chevron-down" size={22} color="rgba(255,255,255,0.90)" />
                </TouchableOpacity>
              </DraggableFAB>

            </Reanimated.View>
          </GestureDetector>
        )}
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: C.bg },
  flex:       { flex: 1 },

  // Title row (replaces header — no back button)
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border2,
  },
  titleText: { color: C.text, fontSize: 17, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 2.5 },
  titleBadge: {
    marginLeft: 10,
    backgroundColor: C.greenDim,
    borderWidth: 1,
    borderColor: C.greenBorder,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  titleBadgeText: { color: C.green, fontSize: 10, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.2 },

  // Thread title row
  threadTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.border2,
  },
  threadName: { color: C.text, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800" },

  // Conversation list rows
  convRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: C.surface,
    borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 13,
    gap: 12,
    borderWidth: 1,
    borderColor: C.border2,
  },
  convBody:   { flex: 1 },
  convTop:    { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  convBottom: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName:   { color: C.text, fontSize: 14, fontWeight: "700", flex: 1, marginRight: 8 },
  convTime:   { color: C.textMuted, fontSize: 11 },
  convPreview:{ color: C.textSub, fontSize: 12, flex: 1, marginRight: 6 },
  sep:        { height: 6 },

  // Channel badge
  badge:      { borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1 },
  badgeGo:    { backgroundColor: C.greenDim, borderColor: C.greenBorder },
  badgeWa:    { backgroundColor: C.whatsappDim, borderColor: "rgba(37,211,102,0.3)" },
  badgeText:  { fontSize: 9, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.6 },

  // Unread
  unreadBadge:{ backgroundColor: C.green, borderRadius: 10, width: 19, height: 19, alignItems: "center", justifyContent: "center" },
  unreadText: { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_900Black", fontWeight: "900" },

  // Empty state
  empty:      { alignItems: "center", justifyContent: "center", paddingTop: 80, gap: 12 },
  emptyText:  { color: C.textMuted, fontSize: 14, fontWeight: "600" },
  emptyHint:  { color: "#9CA3AF", fontSize: 12 },

  // Bottom bar — anchored above keyboard
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingTop: 12,
    backgroundColor: C.bar,
    borderTopWidth: 1,
    borderTopColor: C.border2,
  },

  // Search field
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.surface2,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: C.border,
    height: 44,
  },
  searchInput: {
    flex: 1,
    color: C.text,
    fontSize: 14,
    paddingHorizontal: 10,
    height: "100%",
  },

  // CONTACTOS button — compact icon-only circle
  contactsBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C.border,
  },

  // FAB — back to conversation list; posicionado por DraggableFAB
  fabBack: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },

  // Generic icon button (close, back in list)
  iconBtn: {
    width: 44, height: 44,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: C.border,
    alignItems: "center",
    justifyContent: "center",
  },

  // Chat area — distinct background
  chatArea: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    marginHorizontal: 10,
    marginVertical: 8,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },

  // Thread input area — row: [TextInput flex:1] [actionCol]
  inputArea: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#F7F8FA",
    gap: 8,
  },
  msgInput: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.15)",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    color: "#111827",
    fontSize: 15,
    lineHeight: 21,
    maxHeight: Math.round(screen.height * 0.52),
    minHeight: 52,
  },
  // Right action column
  actionCol: {
    flexDirection: "column",
    gap: 6,
    alignItems: "stretch",
    width: 76,
  },
  actionBtn: {
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    gap: 4,
  },
  actionBtnSend: {
    backgroundColor: "#3D9A84",
    shadowColor: "#3D9A84",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  actionBtnGo: {
    backgroundColor: "rgba(61,154,132,0.08)",
    borderWidth: 1.5,
    borderColor: "rgba(61,154,132,0.35)",
  },
  actionBtnClose: {
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
  },
  actionBtnLabel:      { color: "#FFFFFF", fontSize: 10, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.8 },
  actionBtnLabelGo:    { color: "#3D9A84", fontSize: 13, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 1.5 },
  actionBtnLabelClose: { color: "#9CA3AF", fontSize: 9, fontWeight: "700", letterSpacing: 0.6 },

  // Messages
  dateDivider: { flexDirection: "row", alignItems: "center", marginVertical: 18, gap: 10 },
  dateLine:    { flex: 1, height: 1, backgroundColor: C.border2 },
  dateLabel:   { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4 },
  bubble: {
    maxWidth: "80%", borderRadius: 16,
    paddingHorizontal: 13, paddingVertical: 9, marginBottom: 4,
  },
  bubbleMine:  {
    alignSelf: "flex-end",
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: "rgba(61,154,132,0.2)",
    shadowColor: "#3D9A84",
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  bubbleTheirs:{ alignSelf: "flex-start", backgroundColor: C.received, borderBottomLeftRadius: 4 },
  bubbleText:  { color: C.text, fontSize: 14, lineHeight: 20 },
  bubbleMeta:  { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4, gap: 5 },
  bubbleTime:  { color: C.textMuted, fontSize: 10 },
  channelDot:  { width: 6, height: 6, borderRadius: 3 },
  checkMark:   { fontSize: 11, fontWeight: "700", lineHeight: 14 },
});
