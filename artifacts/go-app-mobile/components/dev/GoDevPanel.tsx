/**
 * GoDevPanel.tsx
 * ═══════════════════════════════════════════════════════════════════════════
 * PANEL DE LABORATORIO — SOLO USO INTERNO DE DESARROLLO
 *
 * Acceso: 5 toques rápidos sobre el título de HerramientasPanel.
 * Nunca visible en producción ni en la experiencia estándar de GO.
 * SOLO opera sobre DEMO_BUSINESS_ID — nunca toca datos reales.
 * ═══════════════════════════════════════════════════════════════════════════
 */
import React, { useRef, useState, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { DraggableFAB } from "@/components/DraggableFAB";
import { DEMO_BUSINESS_ID } from "@/data/seedDemoData";
import { restoreNemesiDemo } from "@/data/goSeedNemesiDemo";
import {
  getBookings,
  getBookableItems,
  claimSlotOrReject,
  runReservasDebugTest,
  type Booking,
} from "@/data/booking";

const SCREEN_W = Dimensions.get("window").width;

const DEV_ORANGE = "#f97316";
const DEV_ORANGE_BG = "rgba(249,115,22,0.10)";
const DEV_ORANGE_BDR = "rgba(249,115,22,0.30)";
const DANGER = "#ef4444";
const DANGER_BG = "rgba(239,68,68,0.08)";
const DANGER_BDR = "rgba(239,68,68,0.28)";
const GREEN = "#22c55e";
const GREEN_BG = "rgba(34,197,94,0.08)";
const GREEN_BDR = "rgba(34,197,94,0.28)";
const BLUE = "#4A80BD";
const BLUE_BG = "rgba(74,128,189,0.10)";

// ── Generador de ID simple ────────────────────────────────────────────────────
function devId(): string {
  return `dev_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ── Crear reservas de prueba (próximos 3 días) ────────────────────────────────
async function createTestBookings(): Promise<number> {
  const items = await getBookableItems(DEMO_BUSINESS_ID);
  if (items.length === 0) return 0;

  const now = new Date();
  let count = 0;

  // 3 reservas en los próximos 3 días laborables a las 10:00, 12:00 y 16:00
  const slots = [
    { dayOffset: 1, hour: 10 },
    { dayOffset: 2, hour: 12 },
    { dayOffset: 3, hour: 16 },
  ];

  for (const slot of slots) {
    const item = items[count % items.length];
    const start = new Date(now);
    start.setDate(start.getDate() + slot.dayOffset);
    start.setHours(slot.hour, 0, 0, 0);
    const end = new Date(start.getTime() + item.durationMinutes * 60_000);

    const booking: Booking = {
      id:              devId(),
      businessId:      DEMO_BUSINESS_ID,
      bookableItemId:  item.id,
      customerId:      "dev-client-test",
      startDatetime:   start.toISOString(),
      endDatetime:     end.toISOString(),
      unitsReserved:   1,
      peopleCount:     1,
      status:          "CONFIRMED",
      paymentStatus:   "none",
    };
    await claimSlotOrReject(booking);
    count++;
  }
  return count;
}

// ── Limpiar reservas de prueba ────────────────────────────────────────────────
async function clearTestBookings(): Promise<number> {
  const raw = await AsyncStorage.getItem("go_bookings_v1");
  const all: Booking[] = raw ? JSON.parse(raw) : [];
  const before = all.length;
  const kept = all.filter((b) => b.businessId !== DEMO_BUSINESS_ID);
  await AsyncStorage.setItem("go_bookings_v1", JSON.stringify(kept));
  return before - kept.length;
}

// ── Contar entorno ────────────────────────────────────────────────────────────
async function loadEnvStats(): Promise<{
  businesses: number;
  items: number;
  bookings: number;
  hasNemesi: boolean;
}> {
  const [rawBiz, rawItems, rawBkgs] = await Promise.all([
    AsyncStorage.getItem("go_businesses_v1"),
    AsyncStorage.getItem("go_bookable_items_v1"),
    AsyncStorage.getItem("go_bookings_v1"),
  ]);
  const businesses: { id: string }[] = rawBiz ? JSON.parse(rawBiz) : [];
  const items: { businessId: string }[] = rawItems ? JSON.parse(rawItems) : [];
  const bookings: Booking[] = rawBkgs ? JSON.parse(rawBkgs) : [];

  return {
    businesses: businesses.length,
    items:      items.filter((i) => i.businessId === DEMO_BUSINESS_ID).length,
    bookings:   bookings.filter((b) => b.businessId === DEMO_BUSINESS_ID).length,
    hasNemesi:  businesses.some((b) => b.id === DEMO_BUSINESS_ID),
  };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface GoDevPanelProps {
  visible: boolean;
  onClose: () => void;
}

// ── Componente principal ──────────────────────────────────────────────────────

export function GoDevPanel({ visible, onClose }: GoDevPanelProps) {
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState<string | null>(null);
  const [lastMsg, setLastMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [stats, setStats] = useState<Awaited<ReturnType<typeof loadEnvStats>> | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // Cierre por swipe-down desde zona derecha (≥75%)
  const lpArmedRef = useRef(false);
  const lpTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rightSwipePan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => {
        if (e.nativeEvent.pageX >= SCREEN_W * 0.75) {
          if (lpTimerRef.current) clearTimeout(lpTimerRef.current);
          lpTimerRef.current = setTimeout(() => {
            lpArmedRef.current = true;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          }, 700);
        } else {
          lpArmedRef.current = false;
        }
        return false;
      },
      onMoveShouldSetPanResponderCapture: (_e, g) => {
        if (!lpArmedRef.current) return false;
        return Math.abs(g.dy) > 20 && g.dy > Math.abs(g.dx);
      },
      onPanResponderRelease: (_e, g) => {
        lpArmedRef.current = false;
        if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
        if (g.dy > 100) onCloseRef.current();
      },
      onPanResponderTerminate: () => {
        lpArmedRef.current = false;
        if (lpTimerRef.current) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null; }
      },
    })
  ).current;

  const fabBottom = insets.bottom + 16;

  const msg = (text: string, ok: boolean) => {
    setLastMsg({ text, ok });
    setTimeout(() => setLastMsg(null), 4000);
  };

  const run = useCallback(async (
    key: string,
    label: string,
    action: () => Promise<string>,
  ) => {
    setLoading(key);
    setLastMsg(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    try {
      const result = await action();
      msg(result, true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch (err: unknown) {
      msg(`Error: ${err instanceof Error ? err.message : String(err)}`, false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    } finally {
      setLoading(null);
    }
  }, []);

  const refreshStats = useCallback(async () => {
    setLoadingStats(true);
    const s = await loadEnvStats();
    setStats(s);
    setLoadingStats(false);
  }, []);

  const handleRestoreNemesi = () => {
    run("restore", "Restaurar Nemesi", async () => {
      await restoreNemesiDemo();
      return "✅ Nemesi de Molina restaurada correctamente";
    });
  };

  const handleCreateBookings = () => {
    run("bookings", "Crear reservas", async () => {
      const count = await createTestBookings();
      return `✅ ${count} reservas de prueba creadas`;
    });
  };

  const handleClearBookings = () => {
    Alert.alert(
      "Limpiar historial",
      "Se eliminarán todas las reservas de Nemesi (solo datos de prueba). ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Limpiar", style: "destructive",
          onPress: () => {
            run("clear", "Limpiar historial", async () => {
              const deleted = await clearTestBookings();
              return `🗑 ${deleted} reservas eliminadas`;
            });
          },
        },
      ],
    );
  };

  const handleFullReset = () => {
    Alert.alert(
      "Reiniciar entorno",
      "Esto borrará todas las reservas de Nemesi y reinstalará los datos de demostración desde cero. ¿Continuar?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Reiniciar", style: "destructive",
          onPress: () => {
            run("reset", "Reiniciar entorno", async () => {
              await clearTestBookings();
              await AsyncStorage.multiRemove([
                "go_demo_seed_flag",
              ]);
              // Restaurar datos de booking de Nemesi de Molina
              await restoreNemesiDemo();
              return "♻️ Entorno reiniciado y Nemesi de Molina restaurada";
            });
          },
        },
      ],
    );
  };

  return (
    <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose}>
      <View style={d.root} {...rightSwipePan.panHandlers}>

        {/* Drag pill */}
        <View style={d.handleZone}>
          <View style={d.handlePill} />
        </View>

        {/* Header */}
        <View style={d.header}>
          <View style={d.headerIconWrap}>
            <Feather name="terminal" size={14} color={DEV_ORANGE} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={d.headerTitle}>LABORATORIO DEV</Text>
            <Text style={d.headerSub}>Solo datos de prueba · Nemesi</Text>
          </View>
          <View style={d.devBadge}>
            <Text style={d.devBadgeTxt}>DEV</Text>
          </View>
        </View>

        {/* Aviso de seguridad */}
        <View style={d.warningBanner}>
          <Feather name="shield" size={13} color={DEV_ORANGE} />
          <Text style={d.warningText}>
            Todas las acciones operan <Text style={{ fontWeight: "900" }}>exclusivamente</Text> sobre Nemesi (ID fijo de demo). Los datos reales no se ven afectados.
          </Text>
        </View>

        <ScrollView
          style={d.scroll}
          contentContainerStyle={{ paddingBottom: fabBottom + 64 }}
          showsVerticalScrollIndicator={false}
        >

          {/* Feedback */}
          {lastMsg && (
            <View style={[d.feedbackCard, { borderColor: lastMsg.ok ? GREEN_BDR : DANGER_BDR, backgroundColor: lastMsg.ok ? GREEN_BG : DANGER_BG }]}>
              <Feather name={lastMsg.ok ? "check-circle" : "alert-circle"} size={14} color={lastMsg.ok ? GREEN : DANGER} />
              <Text style={[d.feedbackTxt, { color: lastMsg.ok ? GREEN : DANGER }]}>{lastMsg.text}</Text>
            </View>
          )}

          {/* ── Sección 1: Nemesi ── */}
          <Text style={d.sectionLabel}>EMPRESA DEMO</Text>

          <ActionCard
            icon="refresh-cw"
            title="Restaurar Nemesi"
            sub="Reinstala todos los datos de la empresa demo si faltan o están corruptos."
            color={GREEN}
            colorBg={GREEN_BG}
            colorBdr={GREEN_BDR}
            loading={loading === "restore"}
            onPress={handleRestoreNemesi}
          />

          {/* ── Sección 1b: Debug Motor de Reservas ── */}
          <Text style={d.sectionLabel}>DEBUG MOTOR RESERVAS</Text>

          <ActionCard
            icon="activity"
            title="Ejecutar test Isa (Tinte + Lavado)"
            sub="Prueba el motor getAvailableReservationSlots con horario personalizado de Isa en lunes. Resultado en consola. ✅ = correcto, ❌ = fallo."
            color={DEV_ORANGE}
            colorBg={DEV_ORANGE_BG}
            colorBdr={DEV_ORANGE_BDR}
            loading={loading === "debugTest"}
            onPress={() => {
              run("debugTest", "Test motor reservas", async () => {
                await runReservasDebugTest();
                return "✅ Test ejecutado — ver consola para detalle";
              });
            }}
          />

          {/* ── Sección 2: Reservas ── */}
          <Text style={d.sectionLabel}>RESERVAS DE PRUEBA</Text>

          <ActionCard
            icon="calendar"
            title="Crear reservas de prueba"
            sub="Genera 3 reservas confirmadas en los próximos 3 días (10:00, 12:00 y 16:00) para los servicios de Nemesi."
            color={BLUE}
            colorBg={BLUE_BG}
            colorBdr="rgba(74,128,189,0.30)"
            loading={loading === "bookings"}
            onPress={handleCreateBookings}
          />

          <ActionCard
            icon="trash-2"
            title="Limpiar historial de pruebas"
            sub="Elimina todas las reservas vinculadas a Nemesi. No afecta reservas de otros negocios."
            color={DANGER}
            colorBg={DANGER_BG}
            colorBdr={DANGER_BDR}
            loading={loading === "clear"}
            onPress={handleClearBookings}
          />

          {/* ── Sección 3: Entorno ── */}
          <Text style={d.sectionLabel}>ENTORNO COMPLETO</Text>

          <ActionCard
            icon="rotate-ccw"
            title="Reiniciar entorno de pruebas"
            sub="Borra y recrea desde cero todos los datos de Nemesi: empresa, servicios, horarios y reservas."
            color={DEV_ORANGE}
            colorBg={DEV_ORANGE_BG}
            colorBdr={DEV_ORANGE_BDR}
            loading={loading === "reset"}
            onPress={handleFullReset}
          />

          {/* ── Sección 4: Estado ── */}
          <Text style={d.sectionLabel}>ESTADO DEL ENTORNO</Text>
          <View style={d.statsCard}>
            <View style={d.statsHeader}>
              <Feather name="activity" size={13} color="#6B7280" />
              <Text style={d.statsTitle}>Diagnóstico de datos</Text>
              <TouchableOpacity onPress={refreshStats} hitSlop={8} activeOpacity={0.7}>
                <Feather name="refresh-cw" size={13} color={loadingStats ? "#D1D5DB" : BLUE} />
              </TouchableOpacity>
            </View>

            {loadingStats ? (
              <ActivityIndicator size="small" color={DEV_ORANGE} style={{ marginTop: 12 }} />
            ) : stats ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <StatRow label="Nemesi presente" value={stats.hasNemesi ? "✅ Sí" : "❌ No"} ok={stats.hasNemesi} />
                <StatRow label="Negocios en storage" value={`${stats.businesses}`} />
                <StatRow label="Servicios de Nemesi" value={`${stats.items}`} ok={stats.items > 0} />
                <StatRow label="Reservas de Nemesi" value={`${stats.bookings}`} />
              </View>
            ) : (
              <TouchableOpacity onPress={refreshStats} activeOpacity={0.7} style={d.loadStatsBtn}>
                <Feather name="eye" size={13} color={BLUE} />
                <Text style={d.loadStatsTxt}>Ver estado del entorno</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Nota de identificación */}
          <View style={d.idCard}>
            <Feather name="key" size={11} color="#9CA3AF" />
            <Text style={d.idTxt}>
              ID fijo de demo:{"\n"}
              <Text style={{ fontFamily: "monospace", color: "#374151", fontWeight: "700" }}>{DEMO_BUSINESS_ID}</Text>
            </Text>
          </View>

        </ScrollView>

        {/* FAB cerrar */}
        <DraggableFAB
          screenKey="dev_panel"
          buttonKey="close"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={40}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={8}
            style={d.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

      </View>
    </Modal>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function ActionCard({
  icon, title, sub, color, colorBg, colorBdr, loading, onPress,
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  title: string;
  sub: string;
  color: string;
  colorBg: string;
  colorBdr: string;
  loading: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      style={[d.actionCard, { borderColor: colorBdr, backgroundColor: colorBg }]}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={loading}
    >
      <View style={[d.actionIcon, { backgroundColor: color + "22" }]}>
        {loading
          ? <ActivityIndicator size="small" color={color} />
          : <Feather name={icon} size={16} color={color} />
        }
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={[d.actionTitle, { color }]}>{title}</Text>
        <Text style={d.actionSub}>{sub}</Text>
      </View>
      {!loading && <Feather name="chevron-right" size={16} color={color + "80"} />}
    </TouchableOpacity>
  );
}

function StatRow({ label, value, ok }: { label: string; value: string; ok?: boolean }) {
  return (
    <View style={d.statRow}>
      <Text style={d.statLabel}>{label}</Text>
      <Text style={[d.statValue, ok === false && { color: DANGER }, ok === true && { color: GREEN }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Estilos ───────────────────────────────────────────────────────────────────

const d = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3EF" },

  handleZone: { paddingTop: 10, paddingBottom: 4, alignItems: "center" },
  handlePill: { width: 40, height: 4, backgroundColor: "rgba(0,0,0,0.12)", borderRadius: 2 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)",
    backgroundColor: "#FFFFFF",
  },
  headerIconWrap: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: DEV_ORANGE_BG, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: DEV_ORANGE_BDR,
  },
  headerTitle: { color: "#111827", fontSize: 15, fontWeight: "900", letterSpacing: 0.3 },
  headerSub:   { color: "#9CA3AF", fontSize: 10, marginTop: 1 },
  devBadge: {
    backgroundColor: DEV_ORANGE, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  devBadgeTxt: { color: "#ffffff", fontSize: 10, fontWeight: "900", letterSpacing: 1 },

  warningBanner: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    backgroundColor: DEV_ORANGE_BG, borderRadius: 12,
    borderWidth: 1, borderColor: DEV_ORANGE_BDR,
    padding: 12,
  },
  warningText: { flex: 1, color: "#92400e", fontSize: 12, lineHeight: 17 },

  scroll: { flex: 1, paddingHorizontal: 16, paddingTop: 16 },

  feedbackCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, padding: 12,
    marginBottom: 14,
  },
  feedbackTxt: { flex: 1, fontSize: 13, fontWeight: "700" },

  sectionLabel: {
    color: "#9CA3AF", fontSize: 10, fontWeight: "900", letterSpacing: 1.4,
    textTransform: "uppercase", marginBottom: 8, marginTop: 16, marginLeft: 2,
  },

  actionCard: {
    flexDirection: "row", alignItems: "center", gap: 14,
    borderRadius: 16, borderWidth: 1.5,
    padding: 14, marginBottom: 10,
  },
  actionIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  actionTitle: { fontSize: 14, fontWeight: "800" },
  actionSub:   { color: "#6B7280", fontSize: 11, lineHeight: 15 },

  statsCard: {
    backgroundColor: "#FFFFFF", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.07)",
    padding: 16, marginBottom: 10,
  },
  statsHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  statsTitle:  { flex: 1, color: "#374151", fontSize: 13, fontWeight: "700" },

  statRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  statLabel: { color: "#6B7280", fontSize: 12 },
  statValue: { color: "#111827", fontSize: 12, fontWeight: "700" },

  loadStatsBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 12, justifyContent: "center", paddingVertical: 8,
  },
  loadStatsTxt: { color: BLUE, fontSize: 13, fontWeight: "700" },

  idCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 8,
    backgroundColor: "#F9FAFB", borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.06)",
    padding: 12, marginBottom: 16,
  },
  idTxt: { color: "#9CA3AF", fontSize: 10, lineHeight: 16, flex: 1 },

  fabBtn: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40,
    shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },
});
