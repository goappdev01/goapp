import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  Animated,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { DraggableFAB } from "@/components/DraggableFAB";

const GO_GOLD = "#C8A037";
const GO_BLUE = "#4A80BD";
const BG_ROOT = "#F5F3EF";
const CARD_BG = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.07)";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
  ts: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: "m1",
    role: "assistant",
    text: "¡Hola! Soy GO, tu asistente inteligente. Puedo ayudarte a gestionar citas, tareas, contactos y mucho más. ¿En qué te ayudo hoy?",
    ts: "10:00",
  },
];

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Si se pasa, aparece un segundo FAB de una sola flecha para retroceder un paso */
  onBack?: () => void;
}

export function GOChatScreen({ visible, onClose, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const fabBottom = insets.bottom + 24;

  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [inputText, setInputText] = useState("");
  const [isListening, setIsListening] = useState(false);
  const flatRef = useRef<FlatList<Message>>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const nowStr = () =>
    new Date().toLocaleTimeString("es-ES", {
      hour: "2-digit",
      minute: "2-digit",
    });

  const startPulse = () => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.18,
          duration: 600,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 600,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const stopPulse = () => {
    pulseAnim.stopAnimation();
    Animated.timing(pulseAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  };

  const sendMessage = () => {
    const trimmed = inputText.trim();
    if (!trimmed) return;
    Haptics.selectionAsync();

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      text: trimmed,
      ts: nowStr(),
    };

    const mockReplies = [
      "Entendido. Déjame gestionar eso para ti.",
      "Perfecto, ya he anotado tu solicitud.",
      "Consultando disponibilidad… un momento.",
      "He encontrado varias opciones para ti. ¿Cuál prefieres?",
      "Hecho. ¿Necesitas algo más?",
    ];

    const replyMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      text: mockReplies[Math.floor(Math.random() * mockReplies.length)],
      ts: nowStr(),
    };

    setMessages((prev) => [...prev, userMsg, replyMsg]);
    setInputText("");
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 120);
  };

  const toggleMic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsListening((v) => {
      if (!v) startPulse();
      else stopPulse();
      return !v;
    });
  };

  const handleClose = () => {
    stopPulse();
    setIsListening(false);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <SafeAreaView style={styles.root}>
        {/* ── Messages ── */}
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => m.id}
            contentContainerStyle={styles.msgList}
            showsVerticalScrollIndicator={false}
            onContentSizeChange={() =>
              flatRef.current?.scrollToEnd({ animated: false })
            }
            renderItem={({ item }) => <MessageBubble msg={item} />}
          />

          {/* ── Input bar ── */}
          <View style={styles.inputBar}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.textInput}
                placeholder="Escribe a GO…"
                placeholderTextColor="rgba(0,0,0,0.3)"
                value={inputText}
                onChangeText={setInputText}
                multiline
                maxLength={500}
                returnKeyType="send"
                blurOnSubmit={false}
                onSubmitEditing={sendMessage}
              />
              {inputText.length > 0 && (
                <TouchableOpacity onPress={sendMessage} style={styles.sendBtn}>
                  <Feather name="send" size={17} color="#fff" />
                </TouchableOpacity>
              )}
            </View>

            {/* ── Dock ── */}
            <View style={styles.dock}>
              <DockButton icon="menu" label="Menú" />
              <DockButton icon="paperclip" label="Adjuntar" />

              {/* GO MIC — botón central */}
              <Animated.View
                style={[
                  styles.goMicWrap,
                  { transform: [{ scale: pulseAnim }] },
                ]}
              >
                <TouchableOpacity
                  onPress={toggleMic}
                  style={[
                    styles.goMicBtn,
                    isListening && styles.goMicBtnActive,
                  ]}
                  activeOpacity={0.85}
                >
                  <Feather
                    name="mic"
                    size={20}
                    color={isListening ? "#fff" : "#0a0a0a"}
                  />
                  <Text
                    style={[
                      styles.goMicLabel,
                      isListening && styles.goMicLabelActive,
                    ]}
                  >
                    GO
                  </Text>
                </TouchableOpacity>
              </Animated.View>

              <DockButton icon="zap" label="Acciones" />
              <DockButton icon="more-horizontal" label="Más" />
            </View>
          </View>
        </KeyboardAvoidingView>

        {/* ── FABs flotantes — misma lógica que el resto del sistema GO ── */}

        {/* FAB doble flecha — ir al Landing Page */}
        <DraggableFAB
          screenKey="go_chat"
          buttonKey="landing"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={90}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleClose}
            hitSlop={8}
            accessibilityLabel="Ir al Landing"
            style={styles.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

        {/* FAB flecha simple — retroceder un paso (solo si se abrió desde un panel más profundo) */}
        {onBack && (
          <DraggableFAB
            screenKey="go_chat"
            buttonKey="back"
            initialRight={20}
            initialBottom={fabBottom + 64}
            maxH={90}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { stopPulse(); setIsListening(false); onBack(); }}
              hitSlop={8}
              accessibilityLabel="Retroceder un paso"
              style={styles.fabBtn}
            >
              <Feather name="chevron-down" size={16} color="rgba(255,255,255,0.90)" />
            </TouchableOpacity>
          </DraggableFAB>
        )}

      </SafeAreaView>
    </Modal>
  );
}

function MessageBubble({ msg }: { msg: Message }) {
  const isUser = msg.role === "user";
  return (
    <View
      style={[
        styles.msgRow,
        isUser ? styles.msgRowUser : styles.msgRowAssistant,
      ]}
    >
      <View
        style={[styles.bubble, isUser ? styles.bubbleUser : styles.bubbleAssistant]}
      >
        <Text
          style={[
            styles.bubbleText,
            isUser ? styles.bubbleTextUser : styles.bubbleTextAssistant,
          ]}
        >
          {msg.text}
        </Text>
        <Text
          style={[
            styles.bubbleTs,
            isUser ? styles.bubbleTsUser : styles.bubbleTsAssistant,
          ]}
        >
          {msg.ts}
        </Text>
      </View>
    </View>
  );
}

function DockButton({ icon, label }: { icon: string; label: string }) {
  return (
    <TouchableOpacity
      style={styles.dockBtn}
      onPress={() => Haptics.selectionAsync()}
      hitSlop={6}
    >
      <Feather name={icon as any} size={19} color={GO_BLUE} />
      <Text style={styles.dockLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BG_ROOT },
  flex: { flex: 1 },

  header: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: CARD_BG,
    borderBottomWidth: 1,
    borderBottomColor: BORDER,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  headerIconBtn: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  goChip: {
    backgroundColor: GO_GOLD,
    borderRadius: 7,
    paddingHorizontal: 9,
    paddingVertical: 2,
  },
  goChipText: {
    color: "#fff",
    fontFamily: "Inter_700Bold", fontWeight: "800",
    fontSize: 12,
    letterSpacing: 1.2,
  },
  headerTitle: { fontSize: 16, fontWeight: "600", color: "#0a0a0a" },

  msgList: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 8,
    gap: 10,
  },
  msgRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  msgRowUser: { justifyContent: "flex-end" },
  msgRowAssistant: { justifyContent: "flex-start" },

  goAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: GO_GOLD,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  goAvatarText: { color: "#fff", fontFamily: "Inter_700Bold", fontWeight: "800", fontSize: 13 },

  bubble: {
    maxWidth: "76%",
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  bubbleUser: {
    backgroundColor: GO_BLUE,
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: CARD_BG,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: BORDER,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  bubbleText: { fontSize: 14.5, lineHeight: 21 },
  bubbleTextUser: { color: "#fff" },
  bubbleTextAssistant: { color: "#0a0a0a" },
  bubbleTs: { fontSize: 9.5, marginTop: 4 },
  bubbleTsUser: { color: "rgba(255,255,255,0.55)", textAlign: "right" },
  bubbleTsAssistant: { color: "rgba(0,0,0,0.3)" },

  inputBar: {
    backgroundColor: CARD_BG,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    gap: 8,
  },
  textInput: {
    flex: 1,
    minHeight: 38,
    maxHeight: 110,
    backgroundColor: BG_ROOT,
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 14.5,
    color: "#0a0a0a",
    borderWidth: 1,
    borderColor: BORDER,
  },
  sendBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GO_BLUE,
    alignItems: "center",
    justifyContent: "center",
  },

  dock: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-around",
    paddingHorizontal: 6,
    paddingBottom: Platform.OS === "ios" ? 10 : 8,
    paddingTop: 4,
  },
  dockBtn: {
    alignItems: "center",
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flex: 1,
  },
  dockLabel: {
    fontSize: 9,
    color: GO_BLUE,
    fontWeight: "500",
    letterSpacing: 0.2,
  },

  goMicWrap: { alignItems: "center", flex: 1 },
  goMicBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: BG_ROOT,
    borderWidth: 2,
    borderColor: GO_GOLD,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    marginBottom: 0,
    shadowColor: GO_GOLD,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  goMicBtnActive: {
    backgroundColor: GO_GOLD,
    borderColor: GO_GOLD,
  },
  goMicLabel: {
    fontSize: 8,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color: "#0a0a0a",
    letterSpacing: 0.8,
  },
  goMicLabelActive: { color: "#fff" },

  fabBtn: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.40,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 10,
  },
});
