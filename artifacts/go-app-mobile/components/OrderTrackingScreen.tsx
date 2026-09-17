import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Animated,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── TIPOS ────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "recibido"
  | "aceptado"
  | "preparando"
  | "listo"
  | "en_reparto"
  | "cerca"
  | "entregado"
  | "cancelado"
  | "incidencia";

export type OrderStatusHistoryEntry = {
  status: OrderStatus;
  timestamp: number;
  note?: string;
};

export type MarketplacePedido = {
  id: string;
  orderNumber: string;
  brandLabel: string;
  brandColor: string;
  brandIcon: keyof typeof Feather.glyphMap;
  brandUrl?: string;
  intentKey: string;
  items?: string;
  status: OrderStatus;
  statusHistory: OrderStatusHistoryEntry[];
  etaMinutes: number;
  etaAbsoluteMs: number;
  createdAt: number;
  deliveredAt?: number;
  repartidor?: string;
  proveedor?: string;
  goLogId?: string;
  delayMinutes?: number;
  totalAmount?: number;
  /** true cuando el usuario ya envió su reporte de calidad para este pedido */
  qualitySubmitted?: boolean;
};

// ── CONSTANTES ───────────────────────────────────────────────────────────

const STATUS_STEPS: { key: OrderStatus; label: string; icon: keyof typeof Feather.glyphMap }[] = [
  { key: "recibido",   label: "Pedido recibido",    icon: "inbox" },
  { key: "aceptado",   label: "Pedido aceptado",    icon: "thumbs-up" },
  { key: "preparando", label: "Preparando",          icon: "clock" },
  { key: "listo",      label: "Listo para enviar",  icon: "package" },
  { key: "en_reparto", label: "En reparto",          icon: "truck" },
  { key: "entregado",  label: "Entregado",           icon: "home" },
];

const STATUS_ORDER: OrderStatus[] = [
  "recibido", "aceptado", "preparando", "listo", "en_reparto", "entregado",
];

const PROVIDER_ACTIONS: { label: string; nextStatus: OrderStatus; icon: keyof typeof Feather.glyphMap; danger?: boolean }[] = [
  { label: "Aceptar pedido",    nextStatus: "aceptado",   icon: "thumbs-up" },
  { label: "Empezar preparación", nextStatus: "preparando", icon: "clock" },
  { label: "Listo para enviar", nextStatus: "listo",      icon: "package" },
  { label: "Salir a entregar",  nextStatus: "en_reparto", icon: "truck" },
  { label: "Entregado",         nextStatus: "entregado",  icon: "check-circle" },
  { label: "Cancelar pedido",   nextStatus: "cancelado",  icon: "x-circle", danger: true },
];

function getStatusIndex(s: OrderStatus): number {
  if (s === "incidencia" || s === "cancelado") return -1;
  return STATUS_ORDER.indexOf(s);
}

function isTerminalNegative(s: OrderStatus): boolean {
  return s === "cancelado" || s === "incidencia";
}

function formatCountdown(ms: number, arrivingSoon = "¡Ya llega!"): string {
  if (ms <= 0) return arrivingSoon;
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins >= 60) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${m}min`;
  }
  return `${mins}min ${secs < 10 ? "0" : ""}${secs}s`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h}:${m}`;
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────

type Props = {
  visible: boolean;
  pedido: MarketplacePedido | null;
  onClose: () => void;
  onStatusUpdate: (pedidoId: string, newStatus: OrderStatus, note?: string) => void;
  onDelayAdd?: (pedidoId: string, minutes: number) => void;
  bottomReserved?: number;
};

export function OrderTrackingScreen({ visible, pedido, onClose, onStatusUpdate, onDelayAdd, bottomReserved = 0 }: Props) {
  const insets = useSafeAreaInsets();
  const { t } = useLanguage();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [countdown, setCountdown] = useState(0);
  const [showProviderActions, setShowProviderActions] = useState(false);
  const [addingDelay, setAddingDelay] = useState(false);
  const [delayChoice, setDelayChoice] = useState<number>(15);

  const statusLabels: Record<OrderStatus, string> = {
    recibido:   "Pedido recibido",
    aceptado:   "Pedido aceptado",
    preparando: "En preparación",
    listo:      "Listo para enviar",
    en_reparto: "En reparto",
    cerca:      "Cerca de llegar",
    entregado:  "Entregado",
    cancelado:  "Pedido cancelado",
    incidencia: "Incidencia",
  };

  const dragPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, gs) => gs.dy > 8 && Math.abs(gs.dy) > Math.abs(gs.dx),
      onPanResponderRelease: (_e, gs) => {
        if (gs.dy > 80 || gs.vy > 0.5) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onClose();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
    }
  }, [visible]);

  // Countdown timer
  useEffect(() => {
    if (!pedido || !visible) return;
    const tick = () => {
      const remaining = pedido.etaAbsoluteMs - Date.now();
      setCountdown(Math.max(0, remaining));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pedido, visible]);

  const handleProviderAction = useCallback((action: typeof PROVIDER_ACTIONS[number]) => {
    if (!pedido) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onStatusUpdate(pedido.id, action.nextStatus, action.label);
  }, [pedido, onStatusUpdate]);

  const handleDelayAdd = useCallback(() => {
    if (!pedido || !onDelayAdd) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onDelayAdd(pedido.id, delayChoice);
    setAddingDelay(false);
  }, [pedido, onDelayAdd, delayChoice]);

  if (!pedido) return null;

  const currentIdx = getStatusIndex(pedido.status);
  const isTerminal = isTerminalNegative(pedido.status);
  const isIncidencia = pedido.status === "incidencia";
  const isCancelado = pedido.status === "cancelado";
  const isEntregado = pedido.status === "entregado";
  const isActive = !isEntregado && !isTerminal;
  const progressPct = isEntregado ? 1 : isTerminal ? 0 : Math.max(0, currentIdx / (STATUS_ORDER.length - 1));

  // Only show provider actions that make sense from the current status
  const currentStatusIdx = STATUS_ORDER.indexOf(pedido.status as any);
  const availableProviderActions = PROVIDER_ACTIONS.filter(a => {
    if (a.danger) return isActive;
    const aIdx = STATUS_ORDER.indexOf(a.nextStatus as any);
    return aIdx > currentStatusIdx || a.nextStatus === "cancelado";
  });

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [800, 0],
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: 0,
              marginBottom: bottomReserved,
              transform: [{ translateY }],
            },
          ]}
        >
          {/* Handle — drag down to close */}
          <View style={styles.handleZone} {...dragPan.panHandlers}>
            <View style={styles.handle} />
          </View>

          {/* Header — sin botón de cierre superior */}
          <View style={styles.header}>
            <View style={[styles.brandBadge, { backgroundColor: pedido.brandColor + "22", borderColor: pedido.brandColor + "55" }]}>
              <Feather name={pedido.brandIcon} size={18} color={pedido.brandColor} />
              <Text style={[styles.brandLabel, { color: pedido.brandColor }]}>{pedido.brandLabel}</Text>
            </View>
          </View>

          {/* ETA Banner */}
          <View style={[
            styles.etaBanner,
            isEntregado && styles.etaBannerDone,
            isTerminal && styles.etaBannerIncidencia,
          ]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.etaLabel}>
                {isEntregado ? "PEDIDO ENTREGADO" : isCancelado ? "PEDIDO CANCELADO" : isIncidencia ? "INCIDENCIA" : "ENTREGA ESTIMADA"}
              </Text>
              {isActive && (
                <Text style={styles.etaValue}>{formatCountdown(countdown, "¡Ya llega!")}</Text>
              )}
              {isActive && (
                <Text style={styles.etaTime}>Prevista a las {formatTime(pedido.etaAbsoluteMs)}</Text>
              )}
              {isActive && (pedido.delayMinutes ?? 0) > 0 && (
                <View style={styles.delayBadge}>
                  <Feather name="clock" size={11} color="#C4883A" />
                  <Text style={styles.delayBadgeText}>+{pedido.delayMinutes} min de retraso</Text>
                </View>
              )}
              {isEntregado && (
                <Text style={styles.etaTime}>
                  Entregado a las {formatTime(pedido.statusHistory.find(h => h.status === "entregado")?.timestamp ?? Date.now())}
                </Text>
              )}
              {isCancelado && (
                <Text style={[styles.etaTime, { color: "#fca5a5" }]}>Contacta con el proveedor para más info</Text>
              )}
              {isIncidencia && (
                <Text style={[styles.etaTime, { color: "#fca5a5" }]}>Contacta con el proveedor</Text>
              )}
            </View>
            {isActive && <Feather name="clock" size={36} color="rgba(59,130,246,0.25)" />}
            {isEntregado && <Feather name="check-circle" size={36} color="rgba(74,222,128,0.6)" />}
            {isTerminal && !isEntregado && <Feather name="x-circle" size={36} color="rgba(252,165,165,0.6)" />}
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {/* Progress bar */}
            {!isTerminal && (
              <View style={styles.progressWrap}>
                <View style={styles.progressTrack}>
                  <Animated.View
                    style={[
                      styles.progressFill,
                      {
                        width: `${Math.round(progressPct * 100)}%`,
                        backgroundColor: isEntregado ? "#4ade80" : "#3b82f6",
                      },
                    ]}
                  />
                </View>
              </View>
            )}

            {/* Status timeline */}
            <View style={styles.timeline}>
              {STATUS_STEPS.map((step, i) => {
                const stepIdx = getStatusIndex(step.key);
                const done = !isTerminal && currentIdx >= stepIdx;
                const active = !isTerminal && currentIdx === stepIdx;
                const historyEntry = pedido.statusHistory.find(h => h.status === step.key);

                return (
                  <View key={step.key} style={styles.timelineRow}>
                    {/* Dot + line */}
                    <View style={styles.timelineDotCol}>
                      <View style={[
                        styles.timelineDot,
                        done && styles.timelineDotDone,
                        active && styles.timelineDotActive,
                      ]}>
                        {done && <Feather name={step.icon} size={10} color="#fff" />}
                      </View>
                      {i < STATUS_STEPS.length - 1 && (
                        <View style={[
                          styles.timelineLine,
                          done && styles.timelineLineDone,
                        ]} />
                      )}
                    </View>
                    {/* Text */}
                    <View style={styles.timelineTextCol}>
                      <Text style={[
                        styles.timelineStepLabel,
                        !done && styles.timelineStepLabelDimmed,
                        active && styles.timelineStepLabelActive,
                      ]}>
                        {statusLabels[step.key]}
                      </Text>
                      {historyEntry && (
                        <Text style={styles.timelineTime}>{formatTime(historyEntry.timestamp)}</Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>

            {/* Info block */}
            <View style={styles.infoBlock}>
              {pedido.proveedor && (
                <View style={styles.infoRow}>
                  <Feather name="shopping-bag" size={14} color="#6b7280" />
                  <Text style={styles.infoLabel}>{t('provider')}</Text>
                  <Text style={styles.infoValue}>{pedido.proveedor}</Text>
                </View>
              )}
              {pedido.repartidor && (
                <View style={styles.infoRow}>
                  <Feather name="user" size={14} color="#6b7280" />
                  <Text style={styles.infoLabel}>{t('courier')}</Text>
                  <Text style={styles.infoValue}>{pedido.repartidor}</Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <Feather name="calendar" size={14} color="#6b7280" />
                <Text style={styles.infoLabel}>{t('order_placed')}</Text>
                <Text style={styles.infoValue}>{formatTime(pedido.createdAt)}</Text>
              </View>
              {pedido.items && (
                <View style={styles.infoRow}>
                  <Feather name="list" size={14} color="#6b7280" />
                  <Text style={styles.infoLabel}>{t('order_label')}</Text>
                  <Text style={[styles.infoValue, { flex: 1, textAlign: "right" }]} numberOfLines={2}>{pedido.items}</Text>
                </View>
              )}
              {pedido.goLogId && (
                <View style={[styles.infoRow, { marginTop: 4 }]}>
                  <Feather name="grid" size={14} color="#3b82f6" />
                  <Text style={[styles.infoLabel, { color: "#3b82f6" }]}>{t('go_in_calendar')}</Text>
                  <Text style={[styles.infoValue, { color: "#3b82f6" }]}>✓ {t('added_at')} {formatTime(pedido.etaAbsoluteMs)}</Text>
                </View>
              )}
            </View>

            {/* ── VISTA PROVEEDOR ─────────────────────────────────── */}
            {isActive && (
              <View style={styles.providerSection}>
                <TouchableOpacity
                  style={styles.providerToggle}
                  onPress={() => { setShowProviderActions(v => !v); setAddingDelay(false); }}
                  activeOpacity={0.7}
                >
                  <Feather name="settings" size={14} color="#4A80BD" />
                  <Text style={styles.providerToggleText}>Actualizar estado (proveedor)</Text>
                  <Feather name={showProviderActions ? "chevron-up" : "chevron-down"} size={14} color="#4A80BD" />
                </TouchableOpacity>

                {showProviderActions && (
                  <>
                    <View style={styles.providerActionsCol}>
                      {availableProviderActions.map((action) => (
                        <TouchableOpacity
                          key={action.nextStatus}
                          style={[
                            styles.providerActionBtn,
                            action.danger && styles.providerActionBtnDanger,
                            action.nextStatus === "entregado" && styles.providerActionBtnSuccess,
                          ]}
                          onPress={() => handleProviderAction(action)}
                          activeOpacity={0.75}
                        >
                          <Feather
                            name={action.icon}
                            size={16}
                            color={
                              action.danger ? "#f87171"
                              : action.nextStatus === "entregado" ? "#4ade80"
                              : "#4A80BD"
                            }
                          />
                          <Text style={[
                            styles.providerActionLabel,
                            action.danger && { color: "#f87171" },
                            action.nextStatus === "entregado" && { color: "#4ade80" },
                          ]}>
                            {action.label}
                          </Text>
                          <Feather name="chevron-right" size={14} color="rgba(0,0,0,0.2)" style={{ marginLeft: "auto" }} />
                        </TouchableOpacity>
                      ))}
                    </View>

                    {/* Añadir retraso */}
                    {onDelayAdd && !addingDelay && (
                      <TouchableOpacity
                        style={styles.delayToggleBtn}
                        onPress={() => setAddingDelay(true)}
                        activeOpacity={0.7}
                      >
                        <Feather name="clock" size={14} color="#C4883A" />
                        <Text style={styles.delayToggleText}>Avisar de retraso</Text>
                      </TouchableOpacity>
                    )}
                    {onDelayAdd && addingDelay && (
                      <View style={styles.delayPicker}>
                        <Text style={styles.delayPickerLabel}>¿Cuántos minutos de retraso?</Text>
                        <View style={styles.delayChoices}>
                          {[10, 15, 20, 30].map(min => (
                            <TouchableOpacity
                              key={min}
                              style={[styles.delayChoiceBtn, delayChoice === min && styles.delayChoiceBtnActive]}
                              onPress={() => setDelayChoice(min)}
                              activeOpacity={0.75}
                            >
                              <Text style={[styles.delayChoiceLabel, delayChoice === min && { color: "#C4883A" }]}>+{min} min</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                        <View style={{ flexDirection: "row", gap: 8 }}>
                          <TouchableOpacity style={styles.delayConfirmBtn} onPress={handleDelayAdd} activeOpacity={0.8}>
                            <Text style={styles.delayConfirmLabel}>Confirmar retraso</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.delayCancelBtn} onPress={() => setAddingDelay(false)} activeOpacity={0.7}>
                            <Text style={styles.delayCancelLabel}>Cancelar</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    )}
                  </>
                )}
              </View>
            )}
          </ScrollView>

          {/* ── Cierre flotante inferior ── */}
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
              onClose();
            }}
            activeOpacity={0.75}
            style={styles.floatingClose}
          >
            <Feather name="chevron-down" size={18} color="#6B7280" />
            <Text style={styles.floatingCloseLabel}>Cerrar</Text>
          </TouchableOpacity>
          <View style={{ height: insets.bottom + 8 }} />
        </Animated.View>
      </View>
    </Modal>
  );
}

// ── ESTILOS ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    maxHeight: "90%",
    borderTopWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.4,
        shadowRadius: 16,
      },
      android: { elevation: 24 },
    }),
  },
  handleZone: {
    paddingTop: 10,
    paddingBottom: 4,
    alignItems: "center",
  },
  handle: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(0,0,0,0.15)",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 4,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  brandBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  brandLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  etaBanner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#EFF6FF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(59,130,246,0.2)",
  },
  etaBannerDone: {
    backgroundColor: "rgba(61,154,132,0.08)",
    borderColor: "rgba(61,154,132,0.25)",
  },
  etaBannerIncidencia: {
    backgroundColor: "rgba(239,68,68,0.06)",
    borderColor: "rgba(239,68,68,0.2)",
  },
  etaLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  etaValue: {
    color: "#111827",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.5,
    lineHeight: 32,
  },
  etaTime: {
    color: "#9CA3AF",
    fontSize: 12,
    marginTop: 4,
  },
  progressWrap: {
    marginBottom: 20,
  },
  progressTrack: {
    height: 4,
    backgroundColor: "#E5E7EB",
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 2,
  },
  timeline: {
    marginBottom: 16,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    minHeight: 44,
  },
  timelineDotCol: {
    width: 28,
    alignItems: "center",
  },
  timelineDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.12)",
    alignItems: "center",
    justifyContent: "center",
  },
  timelineDotDone: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  timelineDotActive: {
    backgroundColor: "#1d4ed8",
    borderColor: "#60a5fa",
    borderWidth: 2,
  },
  timelineLine: {
    width: 1.5,
    flex: 1,
    backgroundColor: "#E5E7EB",
    marginVertical: 2,
    minHeight: 16,
  },
  timelineLineDone: {
    backgroundColor: "#3b82f6",
  },
  timelineTextCol: {
    flex: 1,
    paddingLeft: 12,
    paddingBottom: 16,
    paddingTop: 2,
  },
  timelineStepLabel: {
    color: "#9CA3AF",
    fontSize: 14,
    fontWeight: "500",
  },
  timelineStepLabelDimmed: {
    color: "#D1D5DB",
  },
  timelineStepLabelActive: {
    color: "#111827",
    fontWeight: "700",
  },
  timelineTime: {
    color: "#6b7280",
    fontSize: 11,
    marginTop: 2,
  },
  infoBlock: {
    backgroundColor: "#F7F8FA",
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    gap: 10,
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  infoLabel: {
    color: "#9CA3AF",
    fontSize: 13,
    flex: 1,
  },
  infoValue: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "600",
  },
  delayBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 6,
    backgroundColor: "rgba(196,136,58,0.12)",
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "rgba(196,136,58,0.3)",
  },
  delayBadgeText: {
    color: "#C4883A",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  providerSection: {
    backgroundColor: "#F7F8FA",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(74,128,189,0.15)",
    marginBottom: 8,
    overflow: "hidden",
  },
  providerToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  providerToggleText: {
    flex: 1,
    color: "#4A80BD",
    fontSize: 13,
    fontWeight: "600",
  },
  providerActionsCol: {
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
    gap: 1,
  },
  providerActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#FFFFFF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.05)",
  },
  providerActionBtnDanger: {
    backgroundColor: "rgba(239,68,68,0.04)",
  },
  providerActionBtnSuccess: {
    backgroundColor: "rgba(74,222,128,0.05)",
  },
  providerActionLabel: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "500",
    flex: 1,
  },
  delayToggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  delayToggleText: {
    color: "#C4883A",
    fontSize: 13,
    fontWeight: "500",
  },
  delayPicker: {
    padding: 16,
    gap: 12,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.06)",
  },
  delayPickerLabel: {
    color: "#374151",
    fontSize: 13,
    fontWeight: "600",
  },
  delayChoices: {
    flexDirection: "row",
    gap: 8,
  },
  delayChoiceBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
  },
  delayChoiceBtnActive: {
    borderColor: "#C4883A",
    backgroundColor: "rgba(196,136,58,0.08)",
  },
  delayChoiceLabel: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "600",
  },
  delayConfirmBtn: {
    flex: 1,
    backgroundColor: "#C4883A",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  delayConfirmLabel: {
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "700",
  },
  delayCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
  },
  delayCancelLabel: {
    color: "#6B7280",
    fontSize: 13,
    fontWeight: "500",
  },
  floatingClose: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    marginHorizontal: 20,
    marginTop: 8,
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
});
