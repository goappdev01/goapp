import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { MarketplacePedido, OrderStatus } from "@/components/OrderTrackingScreen";

// ── TYPES ─────────────────────────────────────────────────────────────────────

export interface RepeatExtras {
  items:        string;
  notes:        string;
  deliveryMode: "domicilio" | "recogida";
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

type FilterTab = "todos" | "activos" | "entregados" | "cancelados";

const FILTER_TABS: { key: FilterTab; label: string }[] = [
  { key: "todos",       label: "Todos"       },
  { key: "activos",     label: "En curso"    },
  { key: "entregados",  label: "Entregados"  },
  { key: "cancelados",  label: "Cancelados"  },
];

const TERMINAL_STATUSES: OrderStatus[] = ["entregado", "cancelado", "incidencia"];
const ACTIVE_STATUSES:   OrderStatus[] = ["recibido", "aceptado", "preparando", "listo", "en_reparto", "cerca"];

function isActive(p: MarketplacePedido) { return ACTIVE_STATUSES.includes(p.status); }
function isDelivered(p: MarketplacePedido) { return p.status === "entregado"; }
function isCancelled(p: MarketplacePedido) { return p.status === "cancelado" || p.status === "incidencia"; }

function filterPedidos(pedidos: MarketplacePedido[], tab: FilterTab): MarketplacePedido[] {
  switch (tab) {
    case "activos":    return pedidos.filter(isActive);
    case "entregados": return pedidos.filter(isDelivered);
    case "cancelados": return pedidos.filter(isCancelled);
    default:           return pedidos;
  }
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const day   = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year  = d.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

function deliveryDuration(p: MarketplacePedido): string | null {
  if (!p.deliveredAt) return null;
  const mins = Math.round((p.deliveredAt - p.createdAt) / 60000);
  if (mins < 1) return null;
  return `${mins} min`;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ── STATUS BADGE ─────────────────────────────────────────────────────────────

type BadgeVariant = "active" | "delivered" | "cancelled" | "incident";

function statusBadge(status: OrderStatus): { label: string; variant: BadgeVariant } {
  switch (status) {
    case "recibido":   return { label: "Recibido",     variant: "active"     };
    case "aceptado":   return { label: "Aceptado",     variant: "active"     };
    case "preparando": return { label: "Preparando",   variant: "active"     };
    case "listo":      return { label: "Listo",        variant: "active"     };
    case "en_reparto": return { label: "En camino",    variant: "active"     };
    case "cerca":      return { label: "Llegando",     variant: "active"     };
    case "entregado":  return { label: "Entregado",    variant: "delivered"  };
    case "cancelado":  return { label: "Cancelado",    variant: "cancelled"  };
    case "incidencia": return { label: "Incidencia",   variant: "incident"   };
  }
}

const BADGE_COLORS: Record<BadgeVariant, { bg: string; text: string; border: string }> = {
  active:    { bg: "#EFF6FF", text: "#4A80BD", border: "#4A80BD30" },
  delivered: { bg: "#F0FDF4", text: "#16A34A", border: "#16A34A30" },
  cancelled: { bg: "#FEF2F2", text: "#DC2626", border: "#DC262630" },
  incident:  { bg: "#FFF7ED", text: "#C4883A", border: "#C4883A30" },
};

// ── PEDIDO CARD ───────────────────────────────────────────────────────────────

interface PedidoCardProps {
  pedido: MarketplacePedido;
  onOpenTracking: (id: string) => void;
  onRepeat: (pedido: MarketplacePedido) => void;
  onRate?: (pedido: MarketplacePedido) => void;
}

function PedidoCard({ pedido, onOpenTracking, onRepeat, onRate }: PedidoCardProps) {
  const [expanded, setExpanded] = useState(false);
  const badge = statusBadge(pedido.status);
  const colors = BADGE_COLORS[badge.variant];
  const duration = deliveryDuration(pedido);
  const active = isActive(pedido);

  return (
    <Pressable
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        setExpanded(e => !e);
      }}
      style={s.card}
    >
      {/* ── ROW 1: ICON + INFO + BADGE ── */}
      <View style={s.cardRow}>
        <View style={[s.brandCircle, { backgroundColor: pedido.brandColor + "18", borderColor: pedido.brandColor + "44" }]}>
          <Feather name={pedido.brandIcon} size={18} color={pedido.brandColor} />
        </View>

        <View style={{ flex: 1 }}>
          <Text style={s.brandLabel} numberOfLines={1}>{pedido.brandLabel}</Text>
          <Text style={s.orderMeta}>
            {formatDate(pedido.createdAt)} · {formatTime(pedido.createdAt)}
          </Text>
          <Text style={s.orderNumber}>{pedido.orderNumber}</Text>
        </View>

        <View style={{ alignItems: "flex-end", gap: 4 }}>
          <View style={[s.badge, { backgroundColor: colors.bg, borderColor: colors.border }]}>
            <Text style={[s.badgeText, { color: colors.text }]}>{badge.label}</Text>
          </View>
          {pedido.totalAmount != null && (
            <Text style={s.totalAmount}>{pedido.totalAmount.toFixed(2)} €</Text>
          )}
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={14}
            color="rgba(0,0,0,0.3)"
          />
        </View>
      </View>

      {duration && !expanded && (
        <View style={s.durationRow}>
          <Feather name="clock" size={11} color="#16A34A" />
          <Text style={s.durationText}>Entregado en {duration}</Text>
        </View>
      )}

      {expanded && (
        <View style={s.expandedSection}>
          <View style={s.infoGrid}>
            <InfoRow icon="calendar" label="Fecha" value={formatDate(pedido.createdAt)} />
            <InfoRow icon="clock"    label="Hora"   value={formatTime(pedido.createdAt)} />
            {pedido.proveedor && <InfoRow icon="user" label="Proveedor" value={pedido.proveedor} />}
            {duration && <InfoRow icon="zap" label="Tiempo entrega" value={duration} />}
            {pedido.totalAmount != null && (
              <InfoRow icon="credit-card" label="Importe" value={`${pedido.totalAmount.toFixed(2)} €`} />
            )}
            {pedido.items && <InfoRow icon="shopping-cart" label="Artículos" value={pedido.items} />}
          </View>

          <View style={s.historySection}>
            <Text style={s.historyTitle}>Seguimiento</Text>
            {[...pedido.statusHistory].reverse().map((entry, idx) => {
              const b = statusBadge(entry.status);
              const bc = BADGE_COLORS[b.variant];
              return (
                <View key={idx} style={s.historyRow}>
                  <View style={[s.historyDot, { backgroundColor: bc.text }]} />
                  <Text style={s.historyStatus}>{b.label}</Text>
                  <Text style={s.historyTime}>{formatTime(entry.timestamp)}</Text>
                  {entry.note && <Text style={s.historyNote}>{entry.note}</Text>}
                </View>
              );
            })}
          </View>

          <View style={s.actionRow}>
            {active && (
              <TouchableOpacity
                style={[s.actionBtn, s.actionBtnPrimary]}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onOpenTracking(pedido.id);
                }}
              >
                <Feather name="map-pin" size={13} color="#FFFFFF" />
                <Text style={s.actionBtnPrimaryText}>Ver seguimiento</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[s.actionBtn, s.actionBtnRepeat]}
              activeOpacity={0.8}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                onRepeat(pedido);
              }}
            >
              <Feather name="refresh-cw" size={13} color="#4A80BD" />
              <Text style={s.actionBtnText}>Repetir pedido</Text>
            </TouchableOpacity>

            {/* Valorar — solo para pedidos entregados sin valoración previa */}
            {pedido.status === "entregado" && !pedido.qualitySubmitted && onRate && (
              <TouchableOpacity
                style={s.actionBtn}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  onRate(pedido);
                }}
              >
                <Feather name="shield" size={13} color="#6B7280" />
                <Text style={s.actionBtnText}>Valorar</Text>
              </TouchableOpacity>
            )}

            {/* Valorado — badge discreto si ya fue valorado */}
            {pedido.status === "entregado" && pedido.qualitySubmitted && (
              <View style={s.ratedBadge}>
                <Feather name="check-circle" size={11} color="#16A34A" />
                <Text style={s.ratedBadgeTxt}>Valorado</Text>
              </View>
            )}

            {pedido.brandUrl && (
              <TouchableOpacity
                style={s.actionBtn}
                activeOpacity={0.8}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  Linking.openURL(pedido.brandUrl!).catch(() => {});
                }}
              >
                <Feather name="message-circle" size={13} color="#6B7280" />
                <Text style={s.actionBtnText}>Contactar</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

function InfoRow({ icon, label, value }: { icon: keyof typeof Feather.glyphMap; label: string; value: string }) {
  return (
    <View style={s.infoRow}>
      <Feather name={icon} size={12} color="#9CA3AF" />
      <Text style={s.infoLabel}>{label}</Text>
      <Text style={s.infoValue}>{value}</Text>
    </View>
  );
}

// ── REPETIR REVIEW SHEET ──────────────────────────────────────────────────────
// Slide-up overlay dentro del mismo Modal. Muestra datos precargados del pedido
// anterior y permite editarlos antes de confirmar el nuevo pedido.

interface RepetirReviewSheetProps {
  pedido:   MarketplacePedido;
  onClose:  () => void;
  onConfirm: (extras: RepeatExtras) => void;
}

function RepetirReviewSheet({ pedido, onClose, onConfirm }: RepetirReviewSheetProps) {
  const insets = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(900)).current;

  const [items,        setItems]        = useState(pedido.items ?? "");
  const [notes,        setNotes]        = useState("");
  const [deliveryMode, setDeliveryMode] = useState<"domicilio" | "recogida">("domicilio");

  const providerUnavailable = !pedido.brandUrl;
  const isOldOrder          = Date.now() - pedido.createdAt > SEVEN_DAYS_MS;

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue:         0,
      damping:         22,
      stiffness:       200,
      useNativeDriver: true,
    }).start();
  }, []);

  const handleClose = () => {
    Animated.timing(slideAnim, {
      toValue:         900,
      duration:        220,
      useNativeDriver: true,
    }).start(onClose);
  };

  const handleConfirm = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onConfirm({ items, notes, deliveryMode });
  };

  return (
    <Animated.View style={[r.overlay, { transform: [{ translateY: slideAnim }] }]}>
      {/* Drag handle */}
      <View style={r.overlayHandle}>
        <View style={r.overlayHandleBar} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header compacto: marca + título */}
        <View style={r.header}>
          <View style={[r.brandIcon, { backgroundColor: pedido.brandColor + "18" }]}>
            <Feather name={pedido.brandIcon} size={18} color={pedido.brandColor} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[r.brandName, { color: pedido.brandColor, fontSize: 14 }]}>{pedido.brandLabel}</Text>
            <Text style={r.title}>Repetir pedido</Text>
          </View>
          {providerUnavailable && (
            <View style={{ backgroundColor: "#FEF2F2", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: "#DC2626", fontSize: 11, fontWeight: "700" }}>No disponible</Text>
            </View>
          )}
          {isOldOrder && !providerUnavailable && (
            <View style={{ backgroundColor: "#FFFBEB", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: "#D97706", fontSize: 11, fontWeight: "700" }}>+7 días</Text>
            </View>
          )}
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={r.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Artículos */}
          <View style={r.section}>
            <View style={r.sectionHeader}>
              <Feather name="shopping-cart" size={14} color="#6B7280" />
              <Text style={r.sectionTitle}>Artículos</Text>
            </View>
            <TextInput
              style={r.textArea}
              value={items}
              onChangeText={setItems}
              placeholder="¿Qué quieres pedir?"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </View>

          {/* Entrega */}
          <View style={r.section}>
            <View style={r.sectionHeader}>
              <Feather name="truck" size={14} color="#6B7280" />
              <Text style={r.sectionTitle}>Entrega</Text>
            </View>
            <View style={r.deliveryToggle}>
              <TouchableOpacity
                style={[r.deliveryOption, deliveryMode === "domicilio" && r.deliveryOptionActive]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setDeliveryMode("domicilio"); }}
                activeOpacity={0.8}
              >
                <Feather name="home" size={14} color={deliveryMode === "domicilio" ? "#4A80BD" : "#9CA3AF"} />
                <Text style={[r.deliveryOptionText, deliveryMode === "domicilio" && r.deliveryOptionTextActive]}>
                  Domicilio
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[r.deliveryOption, deliveryMode === "recogida" && r.deliveryOptionActive]}
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setDeliveryMode("recogida"); }}
                activeOpacity={0.8}
              >
                <Feather name="map-pin" size={14} color={deliveryMode === "recogida" ? "#4A80BD" : "#9CA3AF"} />
                <Text style={[r.deliveryOptionText, deliveryMode === "recogida" && r.deliveryOptionTextActive]}>
                  Recogida
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Nota (opcional) */}
          <View style={r.section}>
            <View style={r.sectionHeader}>
              <Feather name="edit-3" size={14} color="#6B7280" />
              <Text style={r.sectionTitle}>Nota</Text>
              <Text style={r.optional}>opcional</Text>
            </View>
            <TextInput
              style={[r.textArea, { minHeight: 56 }]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Sin cebolla, timbre 3B…"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={2}
              textAlignVertical="top"
            />
          </View>

          {/* Enviar */}
          <TouchableOpacity
            style={[r.confirmBtn, providerUnavailable && r.confirmBtnDisabled]}
            activeOpacity={providerUnavailable ? 1 : 0.85}
            onPress={providerUnavailable ? undefined : handleConfirm}
          >
            <Feather name="send" size={16} color="#FFFFFF" />
            <Text style={r.confirmBtnText}>Enviar</Text>
          </TouchableOpacity>

          {/* Cierre flotante inferior */}
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.75}
            style={[r.floatingClose, { marginTop: 8 }]}
          >
            <Feather name="chevron-down" size={16} color="#9CA3AF" />
            <Text style={r.floatingCloseLabel}>Cancelar</Text>
          </TouchableOpacity>

          <View style={{ height: insets.bottom + 16 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Animated.View>
  );
}

// ── MAIN SCREEN ───────────────────────────────────────────────────────────────

interface MarketplaceHistorialScreenProps {
  visible: boolean;
  pedidos: MarketplacePedido[];
  onClose: () => void;
  onOpenTracking: (pedidoId: string) => void;
  onRepeatOrder: (pedido: MarketplacePedido, extras: RepeatExtras) => void;
  /** Abre el sheet de calidad GO para un pedido entregado sin valorar */
  onRateOrder?: (pedido: MarketplacePedido) => void;
  bottomReserved?: number;
}

export function MarketplaceHistorialScreen({
  visible,
  pedidos,
  onClose,
  onOpenTracking,
  onRepeatOrder,
  onRateOrder,
  bottomReserved = 0,
}: MarketplaceHistorialScreenProps) {
  const insets = useSafeAreaInsets();
  const [activeTab,    setActiveTab]    = useState<FilterTab>("todos");
  const [reviewPedido, setReviewPedido] = useState<MarketplacePedido | null>(null);
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        damping: 22,
        stiffness: 180,
        useNativeDriver: true,
      }).start();
    } else {
      slideAnim.setValue(0);
      setActiveTab("todos");
      setReviewPedido(null);
    }
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => g.dy > 10 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onClose();
        }
      },
    }),
  ).current;

  const filteredPedidos = filterPedidos(pedidos, activeTab);
  const sortedPedidos   = [...filteredPedidos].sort((a, b) => b.createdAt - a.createdAt);

  const handleOpenTracking = useCallback((id: string) => {
    onClose();
    setTimeout(() => onOpenTracking(id), 220);
  }, [onClose, onOpenTracking]);

  const handleRepeat = useCallback((pedido: MarketplacePedido) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setReviewPedido(pedido);
  }, []);

  const handleConfirmRepeat = useCallback((extras: RepeatExtras) => {
    if (!reviewPedido) return;
    const pedido = reviewPedido;
    setReviewPedido(null);
    onClose();
    setTimeout(() => onRepeatOrder(pedido, extras), 280);
  }, [reviewPedido, onClose, onRepeatOrder]);

  const translateY = slideAnim.interpolate({ inputRange: [0, 1], outputRange: [900, 0] });

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      {/* Backdrop */}
      <Pressable style={s.backdrop} onPress={reviewPedido ? undefined : onClose} />

      {/* Main panel */}
      <Animated.View style={[s.panel, { paddingBottom: 0, marginBottom: bottomReserved, transform: [{ translateY }] }]}>

        {/* Drag handle */}
        <View {...panResponder.panHandlers} style={s.handleZone}>
          <View style={s.handle} />
        </View>

        {/* Header — sin X superior */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Mis Pedidos</Text>
            <Text style={s.headerSub}>{pedidos.length} pedido{pedidos.length !== 1 ? "s" : ""} en total</Text>
          </View>
        </View>

        {/* Filter tabs */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabsContainer}
        >
          {FILTER_TABS.map((tab) => {
            const count      = filterPedidos(pedidos, tab.key).length;
            const isSelected = activeTab === tab.key;
            return (
              <TouchableOpacity
                key={tab.key}
                onPress={() => {
                  Haptics.selectionAsync().catch(() => {});
                  setActiveTab(tab.key);
                }}
                style={[s.tab, isSelected && s.tabActive]}
                activeOpacity={0.75}
              >
                <Text style={[s.tabText, isSelected && s.tabTextActive]}>
                  {tab.label}
                </Text>
                {count > 0 && (
                  <View style={[s.tabBadge, isSelected && s.tabBadgeActive]}>
                    <Text style={[s.tabBadgeText, isSelected && s.tabBadgeTextActive]}>
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* List */}
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
        >
          {sortedPedidos.length === 0 ? (
            <View style={s.emptyState}>
              <View style={s.emptyIconCircle}>
                <Feather name="shopping-bag" size={28} color="#9CA3AF" />
              </View>
              <Text style={s.emptyTitle}>
                {activeTab === "todos" ? "Sin pedidos todavía" : "Sin pedidos en esta categoría"}
              </Text>
              <Text style={s.emptySub}>
                {activeTab === "todos"
                  ? "Tus compras en el Marketplace aparecerán aquí."
                  : "Prueba otro filtro o realiza un nuevo pedido."}
              </Text>
            </View>
          ) : (
            sortedPedidos.map((pedido) => (
              <PedidoCard
                key={pedido.id}
                pedido={pedido}
                onOpenTracking={handleOpenTracking}
                onRate={onRateOrder}
                onRepeat={handleRepeat}
              />
            ))
          )}
        </ScrollView>

        {/* Cierre flotante inferior */}
        <TouchableOpacity
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
            onClose();
          }}
          activeOpacity={0.75}
          style={s.floatingClose}
        >
          <Feather name="chevron-down" size={18} color="#6B7280" />
          <Text style={s.floatingCloseLabel}>Cerrar</Text>
        </TouchableOpacity>
        <View style={{ height: insets.bottom + 8 }} />

        {/* Review overlay — slides up over the historial panel */}
        {reviewPedido && (
          <RepetirReviewSheet
            pedido={reviewPedido}
            onClose={() => setReviewPedido(null)}
            onConfirm={handleConfirmRepeat}
          />
        )}

      </Animated.View>
    </Modal>
  );
}

// ── STYLES: historial ─────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  panel: {
    position: "absolute",
    bottom: 0, left: 0, right: 0,
    height: "88%",
    backgroundColor: "#F5F3EF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  handleZone: {
    paddingVertical: 14,
    alignItems: "center",
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    fontSize: 22,
    fontFamily: "Inter_900Black", fontWeight: "900",
    color: "#111827",
    letterSpacing: -0.3,
  },
  headerSub: {
    fontSize: 12,
    color: "#9CA3AF",
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0,0,0,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  tabsContainer: {
    paddingHorizontal: 16,
    gap: 8,
    paddingBottom: 12,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 99,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
  },
  tabActive: {
    backgroundColor: "#4A80BD",
    borderColor: "#4A80BD",
  },
  tabText: {
    fontSize: 13,
    fontWeight: "700",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#FFFFFF",
  },
  tabBadge: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 99,
    minWidth: 18,
    height: 18,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  tabBadgeActive: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  tabBadgeText: {
    fontSize: 10,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color: "#6B7280",
  },
  tabBadgeTextActive: {
    color: "#FFFFFF",
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 24,
    gap: 10,
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
    padding: 14,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  brandCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    flexShrink: 0,
  },
  brandLabel: {
    fontSize: 14,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color: "#111827",
  },
  orderMeta: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 2,
  },
  orderNumber: {
    fontSize: 10,
    fontWeight: "700",
    color: "#9CA3AF",
    marginTop: 2,
    letterSpacing: 0.5,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 99,
    borderWidth: 1,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  totalAmount: {
    fontSize: 14,
    fontFamily: "Inter_900Black", fontWeight: "900",
    color: "#111827",
  },
  durationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
  },
  durationText: {
    fontSize: 11,
    color: "#16A34A",
    fontWeight: "600",
  },
  expandedSection: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.05)",
    gap: 12,
  },
  infoGrid: { gap: 6 },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoLabel: {
    fontSize: 12,
    color: "#9CA3AF",
    width: 88,
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    flex: 1,
  },
  historySection: { gap: 8 },
  historyTitle: {
    fontSize: 11,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color: "#9CA3AF",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  historyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  historyDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    flexShrink: 0,
  },
  historyStatus: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
    flex: 1,
  },
  historyTime: {
    fontSize: 11,
    color: "#9CA3AF",
  },
  historyNote: {
    fontSize: 11,
    color: "#9CA3AF",
    fontStyle: "italic",
  },
  actionRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  actionBtnRepeat: {
    backgroundColor: "#EFF6FF",
    borderColor: "#4A80BD30",
  },
  actionBtnPrimary: {
    backgroundColor: "#4A80BD",
    borderColor: "#4A80BD",
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#4A80BD",
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  ratedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 99,
    backgroundColor: "#F0FDF4",
    borderWidth: 1,
    borderColor: "#16A34A25",
  },
  ratedBadgeTxt: {
    fontSize: 12,
    fontWeight: "600",
    color: "#16A34A",
  },
  floatingClose: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 20,
    marginTop: 4,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
  },
  floatingCloseLabel: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  emptyState: {
    alignItems: "center",
    paddingTop: 60,
    gap: 12,
  },
  emptyIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(0,0,0,0.05)",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontSize: 16,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color: "#374151",
  },
  emptySub: {
    fontSize: 13,
    color: "#9CA3AF",
    textAlign: "center",
    lineHeight: 18,
    paddingHorizontal: 24,
  },
});

// ── STYLES: review sheet ──────────────────────────────────────────────────────

const r = StyleSheet.create({
  overlay: {
    position:        "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "#F5F3EF",
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
  },
  overlayHandle: {
    paddingTop: 12,
    paddingBottom: 4,
    alignItems: "center",
  },
  overlayHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
  },
  header: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            12,
    paddingHorizontal: 20,
    paddingTop:     14,
    paddingBottom:  14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#FFFFFF",
  },
  title: {
    fontSize:   17,
    fontFamily: "Inter_900Black", fontWeight: "900",
    color:      "#111827",
    letterSpacing: -0.2,
  },
  sub: {
    fontSize: 11,
    color:    "#9CA3AF",
    marginTop: 1,
  },
  scroll: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               12,
  },
  brandCard: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            12,
    backgroundColor: "#FFFFFF",
    borderRadius:   14,
    padding:        14,
    borderLeftWidth: 3,
    borderWidth:    1,
    borderColor:    "rgba(0,0,0,0.07)",
  },
  brandIcon: {
    width:          46,
    height:         46,
    borderRadius:   14,
    alignItems:     "center",
    justifyContent: "center",
    flexShrink:     0,
  },
  brandName: {
    fontSize:   15,
    fontFamily: "Inter_900Black", fontWeight: "900",
  },
  brandMeta: {
    fontSize:  12,
    color:     "#6B7280",
    marginTop:  2,
  },
  warning: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    gap:            8,
    padding:        12,
    borderRadius:   12,
    borderWidth:    1,
  },
  warningText: {
    flex:       1,
    fontSize:   12,
    fontWeight: "600",
    lineHeight: 17,
  },
  section: {
    backgroundColor: "#FFFFFF",
    borderRadius:    14,
    padding:         14,
    borderWidth:     1,
    borderColor:     "rgba(0,0,0,0.07)",
    gap:             10,
  },
  sectionHeader: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            6,
  },
  sectionTitle: {
    fontSize:   13,
    fontWeight: "700",
    color:      "#374151",
  },
  optional: {
    fontSize: 11,
    color:    "#9CA3AF",
  },
  textArea: {
    backgroundColor: "#F9FAFB",
    borderRadius:    10,
    borderWidth:     1,
    borderColor:     "rgba(0,0,0,0.08)",
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:        13,
    color:           "#111827",
    minHeight:       72,
  },
  fieldHint: {
    fontSize: 11,
    color:    "#9CA3AF",
    fontStyle: "italic",
    marginTop: -4,
  },
  deliveryToggle: {
    flexDirection: "row",
    gap:           8,
  },
  deliveryOption: {
    flex:           1,
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            6,
    paddingVertical: 11,
    borderRadius:   10,
    borderWidth:    1.5,
    borderColor:    "rgba(0,0,0,0.08)",
    backgroundColor: "#F9FAFB",
  },
  deliveryOptionActive: {
    borderColor:     "#4A80BD",
    backgroundColor: "#EFF6FF",
  },
  deliveryOptionText: {
    fontSize:   13,
    fontWeight: "700",
    color:      "#9CA3AF",
  },
  deliveryOptionTextActive: {
    color: "#4A80BD",
  },
  infoFooter: {
    flexDirection:  "row",
    alignItems:     "flex-start",
    gap:            8,
    paddingHorizontal: 4,
  },
  infoFooterText: {
    flex:       1,
    fontSize:   12,
    color:      "#6B7280",
    lineHeight: 17,
  },
  confirmBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    backgroundColor: "#4A80BD",
    borderRadius:   16,
    paddingVertical: 16,
    marginTop:       4,
  },
  confirmBtnDisabled: {
    backgroundColor: "#9CA3AF",
  },
  confirmBtnText: {
    fontSize:   16,
    fontFamily: "Inter_900Black", fontWeight: "900",
    color:      "#FFFFFF",
    letterSpacing: -0.2,
  },
  floatingClose: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)",
  },
  floatingCloseLabel: {
    color: "#9CA3AF",
    fontSize: 13,
    fontWeight: "600",
  },
});
