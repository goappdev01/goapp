/**
 * GoTimePicker — Sistema universal de selección de hora para GO.
 *
 * USO:
 *   <GoTimeField
 *     label="Apertura"
 *     value="09:00"
 *     onConfirm={(t) => setApertura(t)}
 *     minuteStep={30}
 *   />
 *
 * El campo dispara el reloj al pulsarse. El reloj es siempre el mismo
 * bottom-sheet oscuro que usa GO para fichas y citas.
 *
 * minuteStep:
 *   30  → fase de minutos muestra solo :00 / :30 (uso de horarios de negocio)
 *   5   → reloj estándar 12 posiciones (uso general)
 *   1   → arrastre libre (uso avanzado)
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOCK_R = 108;
const NUM_R   = 82;
const FACE    = CLOCK_R * 2;

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function parseTime(t: string): { h12: number; mins: number; period: "AM" | "PM" } {
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { h12: 9, mins: 0, period: "AM" };
  let h = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;
  return { h12, mins, period };
}

export function formatTime(h12: number, mins: number, period: "AM" | "PM"): string {
  const h24 = (h12 % 12) + (period === "PM" ? 12 : 0);
  return `${String(h24).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface GoTimeFieldProps {
  value: string;
  onConfirm: (t: string) => void;
  label?: string;
  minuteStep?: 1 | 5 | 15 | 30;
  accentColor?: string;
  fieldStyle?: object;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GoTimeField({
  value,
  onConfirm,
  label,
  minuteStep = 5,
  accentColor = "#4A80BD",
  fieldStyle,
}: GoTimeFieldProps) {
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);

  const [phase, setPhase]   = useState<"hours" | "minutes">("hours");
  const [h12, setH12]       = useState(9);
  const [mins, setMins]     = useState(0);
  const [period, setPeriod] = useState<"AM" | "PM">("AM");

  const h12Ref    = useRef(h12);
  const minsRef   = useRef(mins);
  const periodRef = useRef(period);
  h12Ref.current    = h12;
  minsRef.current   = mins;
  periodRef.current = period;

  const lastHaptic = useRef(-1);
  const slideAnim  = useRef(new Animated.Value(600)).current;

  const openPicker = useCallback(() => {
    const p = parseTime(value);
    setH12(p.h12);
    setMins(p.mins);
    setPeriod(p.period);
    setPhase("hours");
    lastHaptic.current = -1;
    setOpen(true);
    slideAnim.setValue(600);
    Animated.timing(slideAnim, { toValue: 0, duration: 230, useNativeDriver: true }).start();
  }, [value, slideAnim]);

  const closePicker = useCallback((cb?: () => void) => {
    Animated.timing(slideAnim, { toValue: 600, duration: 200, useNativeDriver: true })
      .start(() => { setOpen(false); cb?.(); });
  }, [slideAnim]);

  const commit = useCallback((finalH12: number, finalMins: number, finalPeriod: "AM" | "PM") => {
    const t = formatTime(finalH12, finalMins, finalPeriod);
    closePicker(() => onConfirm(t));
  }, [closePicker, onConfirm]);

  const snapMins = (raw: number): number => {
    if (minuteStep === 1) return raw;
    const snapped = Math.round(raw / minuteStep) * minuteStep;
    return snapped >= 60 ? 0 : snapped;
  };

  const handleTouch = useCallback((relX: number, relY: number, isRelease: boolean) => {
    const dx = relX - CLOCK_R;
    const dy = relY - CLOCK_R;
    if (Math.sqrt(dx * dx + dy * dy) < 18) return;

    const angle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;

    if (phase === "hours") {
      const rawH = Math.round(angle / 30);
      const h = rawH === 0 ? 12 : rawH;
      if (h !== lastHaptic.current) {
        Haptics.selectionAsync().catch(() => {});
        lastHaptic.current = h;
      }
      setH12(h);
      if (isRelease) {
        lastHaptic.current = -1;
        setTimeout(() => setPhase("minutes"), 120);
      }
    } else {
      const rawMins = Math.round(angle / 6) % 60;
      const snapped = snapMins(rawMins);
      if (snapped !== lastHaptic.current) {
        Haptics.selectionAsync().catch(() => {});
        lastHaptic.current = snapped;
      }
      setMins(snapped);
      if (isRelease) {
        commit(h12Ref.current, snapped, periodRef.current);
      }
    }
  }, [phase, commit, snapMins]);

  // Number positions on the clock face
  const positions = Array.from({ length: 12 }, (_, i) => {
    const n = i + 1;
    const angle = n * 30 * Math.PI / 180;
    const x = CLOCK_R + NUM_R * Math.sin(angle) - 18;
    const y = CLOCK_R - NUM_R * Math.cos(angle) - 18;
    return { n, x, y };
  });

  const handAngle  = phase === "hours" ? h12 * 30 : mins * 6;
  const handLength = phase === "hours" ? 62 : 72;
  const displayTime = `${String(h12).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;

  return (
    <>
      {/* ── Field trigger ────────────────────────────────────────────── */}
      <TouchableOpacity
        activeOpacity={0.75}
        onPress={openPicker}
        style={[tp.field, { borderColor: accentColor + "50" }, fieldStyle]}
      >
        {label && <Text style={[tp.fieldLabel, { color: accentColor }]}>{label}</Text>}
        <Text style={[tp.fieldValue, { color: value ? "#111827" : "#9CA3AF" }]}>
          {value || "--:--"}
        </Text>
      </TouchableOpacity>

      {/* ── Clock bottom sheet ────────────────────────────────────────── */}
      <Modal
        visible={open}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => commit(h12Ref.current, minsRef.current, periodRef.current)}
      >
        <View style={{ flex: 1 }}>

          {/* Backdrop */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => commit(h12Ref.current, minsRef.current, periodRef.current)}
            accessible={false}
          />

          {/* Sheet */}
          <Animated.View style={[tp.sheet, { transform: [{ translateY: slideAnim }] }]}>
            <View style={[tp.sheetInner, { paddingBottom: insets.bottom + 20 }]}>

              {/* Handle */}
              <View style={tp.handle} />

              {/* Time display */}
              <View style={tp.timeDisplay}>
                <Text style={tp.timeText}>{displayTime}</Text>
                <TouchableOpacity
                  hitSlop={12}
                  onPress={() => phase === "minutes" ? setPhase("hours") : undefined}
                  style={tp.phaseRow}
                >
                  {phase === "minutes" && (
                    <Feather name="chevron-left" size={12} color="rgba(255,255,255,0.5)" />
                  )}
                  <Text style={tp.phaseLabel}>
                    {phase === "hours" ? "HORA" : "MINUTOS"}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Lower zone */}
              <View style={tp.lowerZone}>

                {/* Left: OK / skip */}
                <View style={{ alignItems: "flex-start", justifyContent: "flex-end", paddingBottom: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => commit(h12Ref.current, minsRef.current, periodRef.current)}
                    style={tp.okBtn}
                  >
                    <Text style={tp.okTxt}>OK</Text>
                  </TouchableOpacity>
                </View>

                {/* Right: AM/PM + clock or half-hour buttons */}
                <View style={{ alignItems: "flex-end" }}>

                  {/* AM / PM */}
                  <View style={tp.ampmRow}>
                    {(["AM", "PM"] as const).map((p) => {
                      const active = period === p;
                      return (
                        <TouchableOpacity
                          key={p}
                          activeOpacity={0.75}
                          onPress={() => {
                            Haptics.selectionAsync().catch(() => {});
                            setPeriod(p);
                          }}
                          style={[tp.ampmBtn, active && tp.ampmBtnActive]}
                        >
                          <Text style={[tp.ampmTxt, active && tp.ampmTxtActive]}>{p}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* ── Minute phase: :00 / :30 buttons OR standard clock ── */}
                  {phase === "minutes" && minuteStep === 30 ? (
                    <View style={tp.halfRow}>
                      {[0, 30].map((m) => (
                        <TouchableOpacity
                          key={m}
                          activeOpacity={0.8}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            commit(h12Ref.current, m, periodRef.current);
                          }}
                          style={[
                            tp.halfBtn,
                            mins === m && { backgroundColor: accentColor, borderColor: accentColor },
                          ]}
                        >
                          <Text style={[tp.halfTxt, mins === m && { color: "#fff" }]}>
                            :{String(m).padStart(2, "0")}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : (
                    <View
                      onStartShouldSetResponder={() => true}
                      onMoveShouldSetResponder={() => true}
                      onResponderGrant={e => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY, false)}
                      onResponderMove={e => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY, false)}
                      onResponderRelease={e => handleTouch(e.nativeEvent.locationX, e.nativeEvent.locationY, true)}
                      style={{ width: FACE, height: FACE, position: "relative" }}
                    >
                      {/* Face */}
                      <View style={tp.clockFace} />

                      {/* Numbers */}
                      {positions.map(({ n, x, y }) => {
                        const isActive = phase === "hours"
                          ? h12 === n
                          : mins === (n === 12 ? 0 : n * 5);
                        const lbl = phase === "hours"
                          ? String(n)
                          : `:${String(n === 12 ? 0 : n * 5).padStart(2, "0")}`;
                        return (
                          <View
                            key={n}
                            pointerEvents="none"
                            style={[
                              tp.numSlot,
                              { left: x, top: y },
                              isActive && { backgroundColor: accentColor },
                            ]}
                          >
                            <Text style={[
                              tp.numTxt,
                              { fontSize: phase === "hours" ? 13 : 11 },
                              isActive && { color: "#fff", fontWeight: "700" },
                            ]}>
                              {lbl}
                            </Text>
                          </View>
                        );
                      })}

                      {/* Hand */}
                      <View
                        pointerEvents="none"
                        style={{
                          position: "absolute",
                          width: 2,
                          height: handLength * 2,
                          left: CLOCK_R - 1,
                          top: CLOCK_R - handLength,
                          transform: [{ rotate: `${handAngle}deg` }],
                        }}
                      >
                        <View style={{ width: 2, height: handLength, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 1 }} />
                      </View>

                      {/* Center dot */}
                      <View pointerEvents="none" style={tp.centerDot} />
                    </View>
                  )}
                </View>
              </View>
            </View>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const tp = StyleSheet.create({
  field: {
    borderWidth: 1.5,
    borderRadius: 14,
    backgroundColor: "#FFFFFF",
    padding: 13,
    gap: 5,
    alignItems: "center",
  },
  fieldLabel: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  fieldValue: {
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: 1.5,
  },

  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
  },
  sheetInner: {
    backgroundColor: "#0a0a0a",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignSelf: "center",
    marginBottom: 14,
  },
  timeDisplay: {
    alignItems: "center",
    marginBottom: 6,
  },
  timeText: {
    color: "#ffffff",
    fontSize: 52,
    fontWeight: "100",
    letterSpacing: 4,
  },
  phaseRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginTop: 4,
  },
  phaseLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.6,
  },
  lowerZone: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 14,
  },
  okBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  okTxt: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  ampmRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 10,
  },
  ampmBtn: {
    width: 52,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    backgroundColor: "#0e0e10",
  },
  ampmBtnActive: {
    borderWidth: 2,
    borderColor: "#ffffff",
    backgroundColor: "#ffffff",
  },
  ampmTxt: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  ampmTxtActive: {
    color: "#0e0e10",
  },
  halfRow: {
    width: FACE,
    gap: 10,
  },
  halfBtn: {
    width: FACE,
    paddingVertical: 18,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
  },
  halfTxt: {
    color: "rgba(255,255,255,0.85)",
    fontSize: 28,
    fontWeight: "200",
    letterSpacing: 2,
  },
  clockFace: {
    position: "absolute",
    top: 0,
    left: 0,
    width: FACE,
    height: FACE,
    borderRadius: CLOCK_R,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  numSlot: {
    position: "absolute",
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  numTxt: {
    color: "rgba(255,255,255,0.82)",
    fontWeight: "400",
  },
  centerDot: {
    position: "absolute",
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ffffff",
    left: CLOCK_R - 4,
    top: CLOCK_R - 4,
  },
});
