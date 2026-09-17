/**
 * GoCartaScreen — Herramienta de cliente
 * ════════════════════════════════════════════════════════════════════
 * Flujo del cliente:
 *   1. Escanear o abrir la carta del restaurante.
 *   2. Seleccionar platos y cantidades.
 *   3. Generar resumen del pedido.
 *   4. Compartir con el camarero por WhatsApp o copiar.
 *
 * NO incluye:
 *   · Edición de URL de carta (eso vive en GO Empresa → Configuración).
 *   · Gestión de platos, precios ni categorías.
 *   · PDF / OCR / fotografía de menú.
 * ════════════════════════════════════════════════════════════════════
 */
import React, { useState } from "react";
import {
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Tokens ───────────────────────────────────────────────────────────────────
const BG     = "#F7F8FA";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.08)";
const TEXT   = "#111827";
const GRAY   = "#6B7280";
const DIM    = "#9CA3AF";
const ORANGE = "#E8762C";
const BLUE   = "#4A80BD";
const GREEN  = "#22C55E";
const RED    = "#EF4444";

// ─── Types ────────────────────────────────────────────────────────────────────
type OrderItem = {
  id:   string;
  name: string;
  qty:  number;
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface GoCartaScreenProps {
  onClose:       () => void;
  cartaUrl?:     string;   // URL de la carta — configurable por el empresario en GO Empresa
  businessName?: string;
}

// ─── Main component ───────────────────────────────────────────────────────────
export function GoCartaScreen({
  onClose,
  cartaUrl     = "",
  businessName = "Restaurante",
}: GoCartaScreenProps) {
  const insets = useSafeAreaInsets();

  const [items,    setItems]    = useState<OrderItem[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [newName,  setNewName]  = useState("");
  const [copied,   setCopied]   = useState(false);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const totalUnits = items.reduce((a, it) => a + it.qty, 0);

  const addItem = () => {
    if (!newName.trim()) return;
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => [...prev, { id: `item_${Date.now()}`, name: newName.trim(), qty: 1 }]);
    setNewName("");
    setIsAdding(false);
  };

  const patchQty = (id: string, delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev =>
      prev
        .map(it => it.id === id ? { ...it, qty: Math.max(0, it.qty + delta) } : it)
        .filter(it => it.qty > 0),
    );
  };

  const buildSummaryText = () => {
    const lines: string[] = [];
    lines.push(`🍽️ PEDIDO — ${businessName}`);
    lines.push("─".repeat(28));
    for (const it of items) {
      lines.push(`${it.qty}x  ${it.name}`);
    }
    lines.push("─".repeat(28));
    lines.push(`${totalUnits} plato${totalUnits !== 1 ? "s" : ""} en total`);
    lines.push("Vía GO app · go.teso.app");
    return lines.join("\n");
  };

  const handleOpenCarta = () => {
    if (!cartaUrl.trim()) return;
    const url = cartaUrl.startsWith("http") ? cartaUrl : `https://${cartaUrl}`;
    Linking.openURL(url).catch(() => {});
  };

  const handleShare = async () => {
    if (items.length === 0) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await Share.share({ message: buildSummaryText() });
    } catch {}
  };

  const handleCopy = async () => {
    if (items.length === 0) return;
    try {
      await Clipboard.setStringAsync(buildSummaryText());
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Header ── */}
      <View style={s.header}>
        <View style={s.headerIcon}>
          <Feather name="grid" size={18} color={ORANGE} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>Carta & Pedido</Text>
          <Text style={s.headerSub} numberOfLines={1}>{businessName}</Text>
        </View>
        <TouchableOpacity onPress={onClose} hitSlop={10} activeOpacity={0.7} style={s.closeBtn}>
          <Feather name="x" size={20} color={GRAY} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* ── 1. ACCESO A LA CARTA ── */}
        <SectionLabel icon="book-open" label="Carta del restaurante" color={ORANGE} />

        {cartaUrl.trim() ? (
          /* Carta URL disponible */
          <View style={s.cartaCard}>
            <View style={s.cartaUrlRow}>
              <Feather name="link" size={13} color={ORANGE} />
              <Text style={s.cartaUrlTxt} numberOfLines={1}>{cartaUrl}</Text>
            </View>
            <TouchableOpacity activeOpacity={0.85} onPress={handleOpenCarta} style={s.abrirBtn}>
              <Feather name="external-link" size={15} color="#fff" />
              <Text style={s.abrirBtnTxt}>Abrir carta</Text>
            </TouchableOpacity>
          </View>
        ) : (
          /* Sin carta configurada */
          <View style={s.noCarta}>
            <Text style={{ fontSize: 26, marginBottom: 8 }}>📋</Text>
            <Text style={s.noCartaTxt}>
              El restaurante aún no ha configurado su carta digital.{"\n"}
              Consulta al camarero para ver el menú.
            </Text>
          </View>
        )}

        {/* ── Separador ── */}
        <Divider label="PREPARAR PEDIDO" />

        {/* ── 2. COMPONER PEDIDO ── */}
        <SectionLabel icon="list" label="Platos que quiero pedir" color={BLUE} />

        <View style={s.section}>
          {items.length === 0 && !isAdding && (
            <View style={s.emptyRow}>
              <Text style={{ fontSize: 26, marginBottom: 8 }}>🍽️</Text>
              <Text style={s.emptyTxt}>
                Añade los platos de la carta que quieres pedir.{"\n"}
                GO genera un resumen para enviarlo al camarero.
              </Text>
            </View>
          )}

          {items.map(item => (
            <View key={item.id} style={s.itemRow}>
              <Text style={s.itemName}>{item.name}</Text>
              <View style={s.stepper}>
                <TouchableOpacity
                  onPress={() => patchQty(item.id, -1)}
                  hitSlop={8}
                  activeOpacity={0.7}
                  style={s.stepperBtn}
                >
                  <Feather
                    name={item.qty === 1 ? "trash-2" : "minus"}
                    size={13}
                    color={item.qty === 1 ? RED : BLUE}
                  />
                </TouchableOpacity>
                <Text style={s.stepperNum}>{item.qty}</Text>
                <TouchableOpacity
                  onPress={() => patchQty(item.id, 1)}
                  hitSlop={8}
                  activeOpacity={0.7}
                  style={s.stepperBtn}
                >
                  <Feather name="plus" size={13} color={BLUE} />
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Formulario de añadir */}
          {isAdding ? (
            <View style={s.addForm}>
              <TextInput
                style={s.formInput}
                value={newName}
                onChangeText={setNewName}
                placeholder="Nombre del plato…"
                placeholderTextColor={DIM}
                returnKeyType="done"
                autoFocus
                onSubmitEditing={addItem}
              />
              <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
                <TouchableOpacity activeOpacity={0.85} onPress={addItem} style={s.addConfirmBtn}>
                  <Feather name="check" size={15} color="#fff" />
                  <Text style={s.addConfirmTxt}>Añadir</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => { setIsAdding(false); setNewName(""); }}
                >
                  <Text style={{ fontSize: 13, color: DIM, paddingVertical: 11, fontWeight: "600" }}>
                    Cancelar
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); setIsAdding(true); }}
              style={s.addItemBtn}
            >
              <Feather name="plus" size={15} color={ORANGE} />
              <Text style={s.addItemTxt}>Añadir plato</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── 3. RESUMEN & ENVÍO ── */}
        {items.length > 0 && (
          <>
            <Divider label="RESUMEN Y ENVÍO" />

            <View style={s.summaryCard}>
              <Feather name="file-text" size={14} color={ORANGE} />
              <Text style={s.summaryTxt}>
                {items.length} plato{items.length !== 1 ? "s" : ""},{"  "}
                {totalUnits} unidad{totalUnits !== 1 ? "es" : ""}
              </Text>
            </View>

            <View style={s.section}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleShare}
                style={[s.actionBtn, { backgroundColor: ORANGE }]}
              >
                <Feather name="share-2" size={17} color="#fff" />
                <Text style={s.actionBtnTxt}>Compartir pedido por WhatsApp</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleCopy}
                style={[
                  s.actionBtn,
                  copied
                    ? { backgroundColor: GREEN }
                    : { backgroundColor: CARD, borderWidth: 1, borderColor: BORDER },
                ]}
              >
                <Feather name={copied ? "check" : "copy"} size={17} color={copied ? "#fff" : BLUE} />
                <Text style={[s.actionBtnTxt, { color: copied ? "#fff" : BLUE }]}>
                  {copied ? "¡Copiado!" : "Copiar resumen del pedido"}
                </Text>
              </TouchableOpacity>

              <View style={s.hintRow}>
                <Feather name="info" size={11} color={DIM} />
                <Text style={s.hintTxt}>
                  El camarero recibe el resumen y confirma el pedido.
                </Text>
              </View>
            </View>
          </>
        )}

      </ScrollView>
    </View>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function SectionLabel({
  icon,
  label,
  color,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  color: string;
}) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 10 }}>
      <View style={[s.sectionIcon, { backgroundColor: color + "18" }]}>
        <Feather name={icon} size={13} color={color} />
      </View>
      <Text style={[s.sectionLabel, { color }]}>{label.toUpperCase()}</Text>
    </View>
  );
}

function Divider({ label }: { label: string }) {
  return (
    <View style={s.divider}>
      <View style={s.dividerLine} />
      <Text style={s.dividerLabel}>{label}</Text>
      <View style={s.dividerLine} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: BG },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: CARD,
    borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  headerIcon: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: ORANGE + "18",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontSize: 16, fontWeight: "800", color: TEXT },
  headerSub:   { fontSize: 11, color: GRAY, marginTop: 1 },
  closeBtn:    { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  content: { padding: 16, gap: 4 },

  section: {
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER,
    padding: 16, marginBottom: 12,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  sectionIcon:  { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionLabel: { fontSize: 10, fontWeight: "800", letterSpacing: 1 },

  // Carta card
  cartaCard: {
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER,
    padding: 14, marginBottom: 16, gap: 10,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cartaUrlRow: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "#F3F4F6", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
  },
  cartaUrlTxt: { flex: 1, fontSize: 12, color: GRAY, fontWeight: "500" },
  abrirBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    backgroundColor: ORANGE, borderRadius: 12, paddingVertical: 13,
  },
  abrirBtnTxt: { color: "#fff", fontSize: 14, fontWeight: "700" },

  // No carta
  noCarta: {
    alignItems: "center", paddingVertical: 24,
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER,
    marginBottom: 16,
  },
  noCartaTxt: { fontSize: 13, color: DIM, textAlign: "center", lineHeight: 19 },

  // Order items
  emptyRow: { alignItems: "center", paddingVertical: 20 },
  emptyTxt: { fontSize: 13, color: DIM, textAlign: "center", lineHeight: 19 },

  itemRow: {
    flexDirection: "row", alignItems: "center",
    paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: BORDER,
  },
  itemName: { flex: 1, fontSize: 14, fontWeight: "600", color: TEXT },

  stepper:    { flexDirection: "row", alignItems: "center", gap: 10 },
  stepperBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: BLUE + "12", alignItems: "center", justifyContent: "center",
  },
  stepperNum: { fontSize: 14, fontWeight: "700", color: TEXT, minWidth: 20, textAlign: "center" },

  // Add form
  addForm: {
    marginTop: 10, backgroundColor: "#F9FAFB", borderRadius: 12,
    padding: 12, borderWidth: 1, borderColor: BORDER,
  },
  formInput: {
    backgroundColor: CARD, borderRadius: 10, borderWidth: 1, borderColor: BORDER,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: TEXT,
  },
  addConfirmBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: ORANGE, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10,
  },
  addConfirmTxt: { color: "#fff", fontSize: 13, fontWeight: "700" },

  addItemBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 10, paddingHorizontal: 4, alignSelf: "flex-start", marginTop: 6,
  },
  addItemTxt: { fontSize: 13, fontWeight: "700", color: ORANGE },

  // Summary
  summaryCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: ORANGE + "10", borderRadius: 14,
    borderWidth: 1, borderColor: ORANGE + "30",
    paddingHorizontal: 14, paddingVertical: 11, marginBottom: 10,
  },
  summaryTxt: { fontSize: 13, fontWeight: "700", color: ORANGE },

  // Hint
  hintRow: { flexDirection: "row", alignItems: "flex-start", gap: 6, marginTop: 4 },
  hintTxt: { fontSize: 11, color: DIM, flex: 1, lineHeight: 15 },

  // Divider
  divider:      { flexDirection: "row", alignItems: "center", gap: 10, marginVertical: 12 },
  dividerLine:  { flex: 1, height: 1, backgroundColor: BORDER },
  dividerLabel: { fontSize: 9, fontWeight: "800", color: DIM, letterSpacing: 1.5 },

  // Action buttons
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    borderRadius: 14, paddingVertical: 14, marginBottom: 10,
  },
  actionBtnTxt: { fontSize: 14, fontWeight: "700", color: "#fff" },
});
