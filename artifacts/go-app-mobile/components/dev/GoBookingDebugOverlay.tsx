/**
 * GoBookingDebugOverlay
 * ════════════════════════════════════════════════════════════════════
 * On-screen audit panel for the full booking availability pipeline.
 * 7 steps shown in order:
 *   1. SERVICE_SELECTED
 *   2. STAFF_WITH_SERVICE
 *   3. CUSTOM_SCHEDULE_FOR_DAY
 *   4. GO_BUSY_INTERVALS
 *   5. BOOKED_INTERVALS
 *   6. GENERATED_SLOTS
 *   7. FINAL_AVAILABLE_SLOTS
 * ════════════════════════════════════════════════════════════════════
 */
import React from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BookingEngineTrace } from "@/data/booking";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DebugStaffEntry = {
  name: string;
  id: string;
  eligible: boolean;
  matchMethod: "id" | "name_fallback" | "no_restriction" | "not_matched";
  hasCustomSchedule: boolean;
  scheduleSource: string;
  worksThisDay: boolean;
  shifts: { from: string; to: string }[];
};

type Props = {
  visible: boolean;
  onClose: () => void;
  serviceTitle: string;
  serviceDuration: number;
  serviceItemId: string | null;
  date: string;
  dayOfWeek: string;
  staffEntries: DebugStaffEntry[];
  goBusyIntervals: { start: string; end: string }[];
  engineTrace: BookingEngineTrace | null;
  finalSlots: { time: string; professional: string }[];
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function methodLabel(m: DebugStaffEntry["matchMethod"]): string {
  switch (m) {
    case "id":            return "by ID ✅";
    case "name_fallback": return "by name (fallback)";
    case "no_restriction":return "no restriction (all)";
    case "not_matched":   return "NOT matched ❌";
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

type SectionProps = { color: string; label: string; children: React.ReactNode };
function Section({ color, label, children }: SectionProps) {
  return (
    <View style={[s.section, { borderColor: color + "44" }]}>
      <View style={[s.sectionHead, { backgroundColor: color + "22", borderBottomColor: color + "44" }]}>
        <Text style={[s.sectionLabel, { color }]}>{label}</Text>
      </View>
      <View style={s.sectionBody}>{children}</View>
    </View>
  );
}

type RowProps = {
  label?: string;
  value: string;
  state?: "ok" | "warn" | "neutral";
  indent?: boolean;
  mono?: boolean;
};
function Row({ label, value, state = "neutral", indent = false, mono = false }: RowProps) {
  const valueColor =
    state === "ok"   ? "#22C55E" :
    state === "warn" ? "#EF4444" :
                       "rgba(255,255,255,0.72)";
  return (
    <View style={[s.row, indent && { paddingLeft: 16 }]}>
      {label != null && (
        <Text style={s.rowLabel}>{label}</Text>
      )}
      <Text style={[s.rowValue, { color: valueColor }, mono && s.mono]} selectable>
        {value}
      </Text>
    </View>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GoBookingDebugOverlay({
  visible, onClose,
  serviceTitle, serviceDuration, serviceItemId, date, dayOfWeek,
  staffEntries, goBusyIntervals, engineTrace, finalSlots,
}: Props) {
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const eligibleStaff   = staffEntries.filter(e => e.eligible);
  const traceSlots      = engineTrace?.generatedSlots ?? [];
  const blockedSlots    = traceSlots.filter(s => s.blocked);
  const freeSlots       = traceSlots.filter(s => !s.blocked);
  const bookedIntervals = engineTrace?.bookedIntervals ?? [];

  return (
    <View style={[StyleSheet.absoluteFillObject, { zIndex: 9999 }]}>
      <View style={{ flex: 1, backgroundColor: "#050505" }}>

        {/* ── Header ── */}
        <View style={[s.header, { paddingTop: insets.top + 10 }]}>
          <Text style={s.headerEmoji}>🔬</Text>
          <Text style={s.headerTitle}>BOOKING AUDIT</Text>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Feather name="x" size={18} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

          {/* ══ 1. SERVICE_SELECTED ══════════════════════════════════════════ */}
          <Section color="#4A80BD" label="1 · SERVICE_SELECTED">
            <Row label="TÍTULO"   value={serviceTitle || "(ninguno)"}              state={serviceTitle ? "neutral" : "warn"} />
            <Row label="DURACIÓN" value={serviceDuration ? `${serviceDuration} min` : "—"} />
            <Row label="ITEM ID"  value={serviceItemId ?? "⚠️  sin ID — motor no puede validar por ID"} state={serviceItemId ? "neutral" : "warn"} mono />
            <Row label="FECHA"    value={date || "—"} />
            <Row label="DÍA"      value={dayOfWeek || "—"} />
          </Section>

          {/* ══ 2. STAFF_WITH_SERVICE ════════════════════════════════════════ */}
          <Section color="#8B5CF6" label={`2 · STAFF_WITH_SERVICE  (${eligibleStaff.length} elegibles / ${staffEntries.length} total)`}>
            {staffEntries.length === 0 ? (
              <Row value="sin profesionales configurados" state="warn" />
            ) : (
              staffEntries.map(e => (
                <Row
                  key={e.id}
                  label={e.eligible ? "✅" : "❌"}
                  value={`${e.name}  ·  ${methodLabel(e.matchMethod)}`}
                  state={e.eligible ? "ok" : "warn"}
                />
              ))
            )}
          </Section>

          {/* ══ 3. CUSTOM_SCHEDULE_FOR_DAY ═══════════════════════════════════ */}
          <Section color="#F59E0B" label="3 · CUSTOM_SCHEDULE_FOR_DAY">
            {eligibleStaff.length === 0 ? (
              <Row value="sin profesionales elegibles para verificar horario" state="warn" />
            ) : (
              eligibleStaff.map(e => (
                <View key={e.id} style={{ marginBottom: 8 }}>
                  <Row
                    label={e.name}
                    value={`${e.hasCustomSchedule ? "HORARIO PROPIO" : "HORARIO EMPRESA"}  —  ${e.worksThisDay ? `✅ trabaja (${e.shifts.length} turno${e.shifts.length !== 1 ? "s" : ""})` : `❌ CERRADO el ${dayOfWeek}`}`}
                    state={e.worksThisDay ? "ok" : "warn"}
                  />
                  {e.worksThisDay
                    ? e.shifts.map((sh, i) => (
                        <Row key={i} label={`  T${i + 1}`} value={`${sh.from} → ${sh.to}`} indent />
                      ))
                    : <Row value="  ↳ no hay turnos configurados para este día" state="warn" indent />
                  }
                </View>
              ))
            )}
          </Section>

          {/* ══ 4. GO_BUSY_INTERVALS ═════════════════════════════════════════ */}
          <Section color="#EF4444" label={`4 · GO_BUSY_INTERVALS  (${goBusyIntervals.length})`}>
            {goBusyIntervals.length === 0 ? (
              <Row value="sin bloqueos en agenda GO" state="ok" />
            ) : (
              goBusyIntervals.map((g, i) => (
                <Row key={i} label={`bloqueo ${i + 1}`} value={`${g.start} → ${g.end}`} state="warn" mono />
              ))
            )}
          </Section>

          {/* ══ 5. BOOKED_INTERVALS ═══════════════════════════════════════════ */}
          <Section color="#EF4444" label={`5 · BOOKED_INTERVALS  (${engineTrace === null ? "?" : bookedIntervals.length})`}>
            {engineTrace === null ? (
              <Row value="elige servicio + profesional + día para ver reservas" />
            ) : bookedIntervals.length === 0 ? (
              <Row value="sin reservas activas (HOLD/CONFIRMED) para este servicio y día" state="ok" />
            ) : (
              bookedIntervals.map((b, i) => (
                <Row key={i} label={`reserva ${i + 1}`} value={`${b.start} → ${b.end}`} state="warn" mono />
              ))
            )}
          </Section>

          {/* ══ 6. GENERATED_SLOTS ════════════════════════════════════════════ */}
          <Section color="#14B8A6" label={`6 · GENERATED_SLOTS  (${traceSlots.length} total  ·  ${freeSlots.length} libres  ·  ${blockedSlots.length} bloqueados)`}>
            {engineTrace === null ? (
              <Row value="elige servicio + profesional + día para ver slots" />
            ) : traceSlots.length === 0 ? (
              <Row value="ningún slot generado — día cerrado o sin turnos configurados" state="warn" />
            ) : (
              traceSlots.map((sl, i) => (
                <Row
                  key={i}
                  label={sl.blocked ? "❌" : "✅"}
                  value={`${sl.time}–${sl.endTime}  [T${sl.shiftNumber}] ${sl.professional}${sl.blocked ? `  →  ${sl.blockReason}` : ""}`}
                  state={sl.blocked ? "warn" : "ok"}
                  mono
                />
              ))
            )}
          </Section>

          {/* ══ 7. FINAL_AVAILABLE_SLOTS ══════════════════════════════════════ */}
          <Section color="#22C55E" label={`7 · FINAL_AVAILABLE_SLOTS  (${finalSlots.length})`}>
            {finalSlots.length === 0 ? (
              <Row value="0 slots disponibles tras todos los filtros" state="warn" />
            ) : (
              <>
                <Row value={finalSlots.map(s => s.time).join("  ·  ")} state="ok" mono />
                {finalSlots.length > 0 && (
                  <Row label="PRO" value={finalSlots[0]?.professional ?? ""} />
                )}
              </>
            )}
          </Section>

        </ScrollView>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: "#0A0A0A",
    borderBottomWidth: 1,
    borderBottomColor: "#1C1C2E",
  },
  headerEmoji: { fontSize: 16 },
  headerTitle: {
    flex: 1,
    color: "#FFFFFF",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  scroll: {
    padding: 12,
    paddingBottom: 48,
    gap: 10,
  },
  section: {
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    marginBottom: 0,
  },
  sectionHead: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1,
  },
  sectionBody: {
    backgroundColor: "#0A0A0A",
    padding: 10,
    gap: 4,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    alignItems: "flex-start",
  },
  rowLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "rgba(255,255,255,0.32)",
    textTransform: "uppercase",
    minWidth: 68,
    paddingTop: 1,
  },
  rowValue: {
    fontSize: 11,
    flex: 1,
  },
  mono: {
    fontVariant: ["tabular-nums"],
  },
});
