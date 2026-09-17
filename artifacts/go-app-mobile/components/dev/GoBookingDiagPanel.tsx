/**
 * GoBookingDiagPanel.tsx  — TEMPORAL, solo debug
 * Acceso: pulsación larga (800 ms) en botón "RESERVAR" del calendario.
 * Solo lectura. Eliminar cuando se confirme/corrija el bug de staffId.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  PanResponder,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";

// ── Tipos mínimos ─────────────────────────────────────────────────────────────

interface RawBooking {
  id?: string;
  businessId?: string;
  staffId?: string;
  startDatetime?: string;
  status?: string;
  [k: string]: unknown;
}

interface DiagCall {
  proId: string | null;
  timestamp: number;   // Date.now() — el REAL capturado antes del filtro
}

interface DiagData {
  lastBooking: RawBooking | null;   // último objeto en go_bookings_v1
  lastCall:    DiagCall | null;     // último bookingsForPro() registrado
  loadedAt:    string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function dateISO(dt?: string)  { return dt ? dt.slice(0, 10)  : "(sin fecha)"; }
function timeHHMM(dt?: string) { return dt ? dt.slice(11, 16) : "(sin hora)";  }

// ── Componente ────────────────────────────────────────────────────────────────

export function GoBookingDiagPanel({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<DiagData | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const reload = useCallback(async () => {
    try {
      const [rawBookings, rawDebugProId] = await Promise.all([
        AsyncStorage.getItem("go_bookings_v1"),
        AsyncStorage.getItem("GO_BOOKINGS_DEBUG_PROID"),
      ]);

      const all: RawBooking[] = rawBookings ? JSON.parse(rawBookings) : [];

      // Último guardado = el que tiene el startDatetime más reciente
      const sorted = [...all].sort((a, b) =>
        (b.startDatetime ?? "").localeCompare(a.startDatetime ?? "")
      );

      // GO_BOOKINGS_DEBUG_PROID: { proId, timestamp } — capturado ANTES del filtro
      const lastCall: DiagCall | null = rawDebugProId ? JSON.parse(rawDebugProId) : null;

      setData({
        lastBooking: sorted[0] ?? null,
        lastCall,
        loadedAt: new Date().toISOString().slice(11, 19),
      });
    } catch {
      setData({ lastBooking: null, lastCall: null, loadedAt: "ERROR" });
    }
  }, []);

  useEffect(() => { if (visible) reload(); }, [visible, reload]);

  // Swipe-down para cerrar
  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => g.dy > 8,
      onPanResponderRelease: (_, g) => {
        if (g.dy > 60) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onCloseRef.current();
        }
      },
    })
  ).current;

  // ── Valores clave ─────────────────────────────────────────────────────────
  const savedStaffId = data?.lastBooking?.staffId ?? null;   // lo que está en storage
  const proId        = data?.lastCall?.proId ?? null;         // lo que recibió bookingsForPro

  // La comparación central:
  //   • si proId es null: bookingsForPro aún no fue llamado con profesional específico
  //   • si coinciden → slot debería bloquearse
  //   • si no → ese es el bug
  const compared: "match" | "mismatch" | "pending" =
    proId === null
      ? "pending"
      : savedStaffId === proId
        ? "match"
        : "mismatch";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <View style={[s.root, { paddingTop: insets.top + 6 }]}>

        {/* Header — drag para cerrar */}
        <View style={s.header} {...pan.panHandlers}>
          <View style={s.pill} />
          <Text style={s.title}>🔍 Diag Booking</Text>
          <TouchableOpacity onPress={() => { reload(); Haptics.selectionAsync().catch(() => {}); }}
            style={s.iconBtn} hitSlop={12}>
            <Feather name="refresh-cw" size={14} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={s.iconBtn} hitSlop={12}>
            <Feather name="x" size={16} color="#94a3b8" />
          </TouchableOpacity>
        </View>
        <Text style={s.loadedAt}>Leído a las {data?.loadedAt ?? "…"}</Text>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll}>

          {/* ━━ 1 · ÚLTIMA RESERVA GUARDADA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <Text style={s.sectionTitle}>1 · Última reserva en go_bookings_v1</Text>

          {data?.lastBooking ? (
            <View style={s.block}>
              <Row label="businessId" value={data.lastBooking.businessId ?? "(undefined)"} />
              <Row label="staffId"    value={savedStaffId ?? "(undefined — Indistinto)"} highlight />
              <Row label="dateISO"    value={dateISO(data.lastBooking.startDatetime)} />
              <Row label="time"       value={timeHHMM(data.lastBooking.startDatetime)} />
              <Row label="status"     value={data.lastBooking.status ?? "?"} />
            </View>
          ) : (
            <View style={s.block}>
              <Text style={s.empty}>go_bookings_v1 vacío — haz una reserva primero</Text>
            </View>
          )}

          {/* ━━ 2 · proId RECIBIDO POR bookingsForPro() ━━━━━━━━━━━━━━━━━━━ */}
          <Text style={s.sectionTitle}>2 · proId recibido por bookingsForPro()</Text>

          <View style={s.block}>
            {data?.lastCall ? (
              <>
                <Row label="proId REAL" value={proId ?? "(undefined)"} highlight />
                <Row label="capturado a las"
                  value={new Date(data.lastCall.timestamp).toISOString().slice(11, 19)} />
              </>
            ) : (
              <Text style={s.empty}>
                GO_BOOKINGS_DEBUG_PROID vacío.{"\n"}
                Abre el selector de citas con un profesional concreto elegido y recarga.
              </Text>
            )}
          </View>

          {/* ━━ 3 · COMPARACIÓN ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
          <Text style={s.sectionTitle}>3 · Comparación staffId === proId</Text>

          {compared === "pending" && (
            <View style={[s.result, s.resultPending]}>
              <Text style={s.resultIcon}>⏳</Text>
              <Text style={s.resultMain}>Esperando llamada a bookingsForPro()</Text>
              <Text style={s.resultSub}>Haz una reserva con profesional específico y recarga</Text>
            </View>
          )}

          {compared === "match" && (
            <View style={[s.result, s.resultMatch]}>
              <Text style={s.resultIcon}>🟢</Text>
              <Text style={[s.resultMain, { color: "#22c55e" }]}>COINCIDE</Text>
              <Text style={s.resultSub}>"El slot debería bloquearse"</Text>
              <View style={s.compareRow}>
                <Text style={s.compareLabel}>staffId guardado</Text>
                <Text style={[s.compareValue, { color: "#22c55e" }]} selectable>{savedStaffId ?? "null"}</Text>
              </View>
              <View style={s.compareRow}>
                <Text style={s.compareLabel}>proId buscado</Text>
                <Text style={[s.compareValue, { color: "#22c55e" }]} selectable>{proId ?? "null"}</Text>
              </View>
            </View>
          )}

          {compared === "mismatch" && (
            <View style={[s.result, s.resultMismatch]}>
              <Text style={s.resultIcon}>🔴</Text>
              <Text style={[s.resultMain, { color: "#ef4444" }]}>NO COINCIDE</Text>
              <Text style={s.resultSub}>"Este es el origen del bug"</Text>
              <View style={s.compareRow}>
                <Text style={s.compareLabel}>staffId guardado</Text>
                <Text style={[s.compareValue, { color: "#ef4444" }]} selectable>{savedStaffId ?? "null"}</Text>
              </View>
              <View style={s.compareRow}>
                <Text style={s.compareLabel}>proId buscado</Text>
                <Text style={[s.compareValue, { color: "#fbbf24" }]} selectable>{proId ?? "null"}</Text>
              </View>
            </View>
          )}

        </ScrollView>
      </View>
    </Modal>
  );
}

// ── Fila de dato ──────────────────────────────────────────────────────────────
function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={r.row}>
      <Text style={r.label}>{label}</Text>
      <Text style={[r.value, highlight && r.valueHL]} selectable numberOfLines={3}>{value}</Text>
    </View>
  );
}

const r = StyleSheet.create({
  row:     { flexDirection: "row", paddingVertical: 5, borderBottomWidth: 1, borderBottomColor: "#1e293b" },
  label:   { width: 110, fontSize: 10, color: "#64748b", fontFamily: "monospace", paddingTop: 1 },
  value:   { flex: 1, fontSize: 10, color: "#cbd5e1", fontFamily: "monospace" },
  valueHL: { color: "#f1f5f9", fontWeight: "700" },
});

// ── Estilos ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root:       { flex: 1, backgroundColor: "#0f172a" },
  header:     { flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
                paddingBottom: 6, gap: 8 },
  pill:       { position: "absolute", top: -4, left: "50%", marginLeft: -18,
                width: 36, height: 4, borderRadius: 2, backgroundColor: "#334155" },
  title:      { flex: 1, fontSize: 15, fontWeight: "700", color: "#f1f5f9" },
  iconBtn:    { padding: 6, borderRadius: 8, backgroundColor: "#1e293b" },
  loadedAt:   { fontSize: 10, color: "#475569", textAlign: "right", paddingRight: 16, marginBottom: 4 },
  scroll:     { padding: 14, paddingBottom: 60 },

  sectionTitle: { fontSize: 10, fontWeight: "800", color: "#64748b", letterSpacing: 1,
                  textTransform: "uppercase", marginTop: 20, marginBottom: 8 },
  block:      { backgroundColor: "#1e293b", borderRadius: 10, padding: 12,
                borderWidth: 1, borderColor: "#334155" },
  empty:      { fontSize: 12, color: "#475569", fontStyle: "italic", lineHeight: 18 },

  result:     { borderRadius: 12, padding: 16, marginTop: 4, alignItems: "center", gap: 6,
                borderWidth: 1.5 },
  resultPending:  { backgroundColor: "#1e293b", borderColor: "#334155" },
  resultMatch:    { backgroundColor: "rgba(34,197,94,0.08)", borderColor: "#22c55e" },
  resultMismatch: { backgroundColor: "rgba(239,68,68,0.08)", borderColor: "#ef4444" },
  resultIcon:     { fontSize: 32 },
  resultMain:     { fontSize: 22, fontWeight: "800", color: "#94a3b8" },
  resultSub:      { fontSize: 12, color: "#64748b", fontStyle: "italic" },

  compareRow:   { width: "100%", flexDirection: "row", alignItems: "flex-start",
                  marginTop: 8, gap: 8 },
  compareLabel: { width: 110, fontSize: 10, color: "#64748b", fontFamily: "monospace", paddingTop: 2 },
  compareValue: { flex: 1, fontSize: 10, fontFamily: "monospace", fontWeight: "700" },
});
