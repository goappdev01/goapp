/**
 * GoQualitySheet.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Control de Calidad Interno GO
 *
 * Pregunta simple: ¿Todo salió correctamente?
 *   🟢 Sí → guarda reporte positivo y cierra sin más pasos
 *   🔴 No → muestra causas seleccionables + comentario opcional
 *
 * Sin estrellas. Sin reseñas públicas. Sin ruido.
 * Los datos son internos y se usan para proteger al usuario.
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Animated,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  type GoQualityReport,
  type QualityProblemCause,
  QUALITY_CAUSE_LABELS,
  QUALITY_CAUSE_LIST,
  saveQualityReport,
} from "@/data/goQualityData";

// ── HELPERS ────────────────────────────────────────────────────────────────────

function makeUid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// ── PROPS ──────────────────────────────────────────────────────────────────────

export interface GoQualitySheetProps {
  visible: boolean;
  pedidoId: string;
  proveedor?: string;
  businessId?: string;
  onClose: () => void;
  onReportSaved?: (report: GoQualityReport) => void;
}

// ── STEP TYPE ─────────────────────────────────────────────────────────────────

type Step = "question" | "causes" | "done";

// ── COMPONENT ─────────────────────────────────────────────────────────────────

export function GoQualitySheet({
  visible,
  pedidoId,
  proveedor,
  businessId,
  onClose,
  onReportSaved,
}: GoQualitySheetProps) {
  const insets  = useSafeAreaInsets();
  const slideY  = useRef(new Animated.Value(600)).current;

  const [step,           setStep]           = useState<Step>("question");
  const [selectedCauses, setSelectedCauses] = useState<QualityProblemCause[]>([]);
  const [comment,        setComment]        = useState("");
  const [saving,         setSaving]         = useState(false);

  // ── Animación de entrada/salida ────────────────────────────────────────────

  useEffect(() => {
    if (visible) {
      setStep("question");
      setSelectedCauses([]);
      setComment("");
      Animated.spring(slideY, {
        toValue:         0,
        damping:         22,
        stiffness:       200,
        useNativeDriver: true,
      }).start();
    } else {
      slideY.setValue(600);
    }
  }, [visible]);

  const animClose = useCallback((cb?: () => void) => {
    Keyboard.dismiss();
    Animated.timing(slideY, {
      toValue:         600,
      duration:        220,
      useNativeDriver: true,
    }).start(() => {
      cb?.();
      onClose();
    });
  }, [onClose]);

  // ── Guardar reporte ────────────────────────────────────────────────────────

  const submitOk = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setSaving(true);
    const report: GoQualityReport = {
      id:        makeUid(),
      pedidoId,
      proveedor,
      businessId,
      result:    "ok",
      timestamp: Date.now(),
    };
    await saveQualityReport(report);
    setSaving(false);
    onReportSaved?.(report);
    setStep("done");
    setTimeout(() => animClose(), 1200);
  }, [pedidoId, proveedor, businessId, animClose, onReportSaved]);

  const submitProblem = useCallback(async () => {
    if (selectedCauses.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setSaving(true);
    const report: GoQualityReport = {
      id:        makeUid(),
      pedidoId,
      proveedor,
      businessId,
      result:    "problem",
      causes:    selectedCauses,
      comment:   comment.trim() || undefined,
      timestamp: Date.now(),
    };
    await saveQualityReport(report);
    setSaving(false);
    onReportSaved?.(report);
    setStep("done");
    setTimeout(() => animClose(), 1400);
  }, [pedidoId, proveedor, businessId, selectedCauses, comment, animClose, onReportSaved]);

  const toggleCause = useCallback((cause: QualityProblemCause) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedCauses((prev) =>
      prev.includes(cause) ? prev.filter((c) => c !== cause) : [...prev, cause]
    );
  }, []);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={() => animClose()}
    >
      {/* Backdrop */}
      <Pressable style={s.backdrop} onPress={() => animClose()} />

      {/* Sheet */}
      <Animated.View
        style={[
          s.sheet,
          { paddingBottom: insets.bottom + 20, transform: [{ translateY: slideY }] },
        ]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
        >
          {/* Handle */}
          <View style={s.handleZone}>
            <View style={s.handle} />
          </View>

          {/* ── STEP: PREGUNTA INICIAL ── */}
          {step === "question" && (
            <View style={s.body}>
              {/* Icono GO */}
              <View style={s.goChip}>
                <Text style={s.goChipTxt}>GO</Text>
              </View>

              <Text style={s.questionLabel}>Calidad del servicio</Text>
              <Text style={s.questionMain}>¿Todo salió correctamente?</Text>

              {proveedor && (
                <View style={s.proveedorRow}>
                  <Feather name="package" size={12} color="#9CA3AF" />
                  <Text style={s.proveedorTxt}>{proveedor}</Text>
                </View>
              )}

              <View style={s.btnRow}>
                {/* SÍ */}
                <TouchableOpacity
                  style={[s.answerBtn, s.answerBtnYes]}
                  activeOpacity={0.8}
                  onPress={submitOk}
                  disabled={saving}
                >
                  <View style={s.answerDot} />
                  <Text style={s.answerBtnYesTxt}>Sí</Text>
                </TouchableOpacity>

                {/* NO */}
                <TouchableOpacity
                  style={[s.answerBtn, s.answerBtnNo]}
                  activeOpacity={0.8}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setStep("causes");
                  }}
                  disabled={saving}
                >
                  <View style={[s.answerDot, { backgroundColor: "#EF4444" }]} />
                  <Text style={s.answerBtnNoTxt}>No</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.privacyNote}>
                Tu respuesta es privada y solo la usa GO para mejorar la calidad del servicio.
              </Text>
            </View>
          )}

          {/* ── STEP: CAUSAS ── */}
          {step === "causes" && (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={s.causesBody}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Back */}
              <TouchableOpacity
                style={s.backBtn}
                onPress={() => { setStep("question"); setSelectedCauses([]); }}
                hitSlop={10}
              >
                <Feather name="arrow-left" size={16} color="#6B7280" />
                <Text style={s.backTxt}>Volver</Text>
              </TouchableOpacity>

              <Text style={s.causesTitle}>¿Qué ocurrió?</Text>
              <Text style={s.causesSub}>Selecciona uno o varios motivos</Text>

              {/* Causes grid */}
              <View style={s.causesGrid}>
                {QUALITY_CAUSE_LIST.map((cause) => {
                  const active = selectedCauses.includes(cause);
                  return (
                    <TouchableOpacity
                      key={cause}
                      style={[s.causeChip, active && s.causeChipActive]}
                      activeOpacity={0.75}
                      onPress={() => toggleCause(cause)}
                    >
                      {active && (
                        <Feather name="check" size={12} color="#4A80BD" style={{ marginRight: 4 }} />
                      )}
                      <Text style={[s.causeChipTxt, active && s.causeChipTxtActive]}>
                        {QUALITY_CAUSE_LABELS[cause]}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Comentario opcional */}
              <View style={s.commentSection}>
                <Text style={s.commentLabel}>
                  Comentario <Text style={s.optional}>(opcional)</Text>
                </Text>
                <TextInput
                  style={s.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="Describe lo que ocurrió si quieres…"
                  placeholderTextColor="#9CA3AF"
                  multiline
                  numberOfLines={3}
                  textAlignVertical="top"
                  maxLength={400}
                />
                {comment.length > 300 && (
                  <Text style={s.charCount}>{comment.length}/400</Text>
                )}
              </View>

              {/* Enviar */}
              <TouchableOpacity
                style={[
                  s.submitBtn,
                  selectedCauses.length === 0 && s.submitBtnDisabled,
                ]}
                activeOpacity={selectedCauses.length === 0 ? 1 : 0.85}
                onPress={selectedCauses.length > 0 ? submitProblem : undefined}
                disabled={saving || selectedCauses.length === 0}
              >
                <Feather name="send" size={15} color="#FFFFFF" />
                <Text style={s.submitBtnTxt}>
                  {saving ? "Guardando…" : "Enviar reporte"}
                </Text>
              </TouchableOpacity>

              <Text style={s.privacyNote}>
                Tu reporte es privado y solo lo usa GO para mejorar el servicio.
              </Text>
            </ScrollView>
          )}

          {/* ── STEP: DONE ── */}
          {step === "done" && (
            <View style={[s.body, { alignItems: "center" }]}>
              <View style={s.doneCircle}>
                <Feather name="check" size={28} color="#16A34A" />
              </View>
              <Text style={s.doneTxt}>Gracias</Text>
              <Text style={s.doneSub}>Tu valoración ayuda a mantener la calidad en GO.</Text>
            </View>
          )}
        </KeyboardAvoidingView>
      </Animated.View>
    </Modal>
  );
}

// ── STYLES ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  sheet: {
    position:        "absolute",
    bottom:          0,
    left:            0,
    right:           0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    overflow:        "hidden",
    maxHeight:       "88%",
    shadowColor:     "#000",
    shadowOpacity:   0.18,
    shadowRadius:    20,
    shadowOffset:    { width: 0, height: -4 },
    elevation:       16,
  },
  handleZone: {
    paddingTop: 12, paddingBottom: 6,
    alignItems: "center",
  },
  handle: {
    width: 36, height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.12)",
  },

  // ── Question step
  body: {
    paddingHorizontal: 24,
    paddingTop:        8,
    paddingBottom:     24,
    alignItems:        "flex-start",
    gap:               10,
  },
  goChip: {
    backgroundColor: "#4A80BD",
    borderRadius:    6,
    paddingHorizontal: 10,
    paddingVertical:   4,
    marginBottom:    4,
  },
  goChipTxt: {
    color:       "#FFFFFF",
    fontWeight:  "900",
    fontSize:    12,
    letterSpacing: 1,
  },
  questionLabel: {
    fontSize:    11,
    color:       "#9CA3AF",
    fontWeight:  "600",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  questionMain: {
    fontSize:    24,
    fontWeight:  "900",
    color:       "#111827",
    letterSpacing: -0.3,
    lineHeight:  30,
  },
  proveedorRow: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            5,
    marginTop:      -2,
  },
  proveedorTxt: {
    fontSize:   13,
    color:      "#9CA3AF",
    fontWeight: "500",
  },
  btnRow: {
    flexDirection:  "row",
    gap:            12,
    marginTop:      16,
    width:          "100%",
  },
  answerBtn: {
    flex:           1,
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    paddingVertical: 16,
    borderRadius:   14,
    borderWidth:    1.5,
  },
  answerBtnYes: {
    backgroundColor: "#F0FDF4",
    borderColor:     "#16A34A40",
  },
  answerBtnNo: {
    backgroundColor: "#FEF2F2",
    borderColor:     "#EF444440",
  },
  answerDot: {
    width:        10,
    height:       10,
    borderRadius: 5,
    backgroundColor: "#16A34A",
  },
  answerBtnYesTxt: {
    fontSize:   18,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color:      "#16A34A",
  },
  answerBtnNoTxt: {
    fontSize:   18,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    color:      "#EF4444",
  },
  privacyNote: {
    fontSize:   11,
    color:      "#9CA3AF",
    lineHeight: 16,
    textAlign:  "center",
    width:      "100%",
    marginTop:  4,
  },

  // ── Causes step
  causesBody: {
    paddingHorizontal: 20,
    paddingBottom:     32,
    paddingTop:        4,
    gap:               14,
  },
  backBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    gap:            4,
    alignSelf:      "flex-start",
    paddingVertical: 4,
  },
  backTxt: {
    fontSize:   13,
    color:      "#6B7280",
    fontWeight: "500",
  },
  causesTitle: {
    fontSize:     22,
    fontWeight:   "900",
    color:        "#111827",
    letterSpacing: -0.2,
  },
  causesSub: {
    fontSize:   13,
    color:      "#6B7280",
    marginTop:  -8,
  },
  causesGrid: {
    flexDirection:  "row",
    flexWrap:       "wrap",
    gap:            8,
  },
  causeChip: {
    flexDirection:  "row",
    alignItems:     "center",
    paddingVertical:   9,
    paddingHorizontal: 14,
    borderRadius:   99,
    backgroundColor: "#F5F3EF",
    borderWidth:    1,
    borderColor:    "rgba(0,0,0,0.07)",
  },
  causeChipActive: {
    backgroundColor: "#EFF6FF",
    borderColor:     "#4A80BD40",
  },
  causeChipTxt: {
    fontSize:   13,
    color:      "#374151",
    fontWeight: "500",
  },
  causeChipTxtActive: {
    color:      "#4A80BD",
    fontWeight: "700",
  },
  commentSection: {
    gap: 8,
  },
  commentLabel: {
    fontSize:   13,
    fontWeight: "600",
    color:      "#374151",
  },
  optional: {
    fontWeight: "400",
    color:      "#9CA3AF",
  },
  commentInput: {
    backgroundColor: "#F9FAFB",
    borderWidth:     1,
    borderColor:     "rgba(0,0,0,0.1)",
    borderRadius:    12,
    padding:         12,
    fontSize:        14,
    color:           "#111827",
    minHeight:       80,
    lineHeight:      20,
  },
  charCount: {
    fontSize:   11,
    color:      "#9CA3AF",
    textAlign:  "right",
  },
  submitBtn: {
    flexDirection:  "row",
    alignItems:     "center",
    justifyContent: "center",
    gap:            8,
    backgroundColor: "#4A80BD",
    borderRadius:   14,
    paddingVertical: 15,
    marginTop:      4,
    shadowColor:    "#4A80BD",
    shadowOpacity:  0.35,
    shadowRadius:   10,
    shadowOffset:   { width: 0, height: 4 },
    elevation:      6,
  },
  submitBtnDisabled: {
    backgroundColor: "#D1D5DB",
    shadowOpacity:   0,
    elevation:       0,
  },
  submitBtnTxt: {
    color:      "#FFFFFF",
    fontFamily: "Inter_700Bold", fontWeight: "800",
    fontSize:   15,
  },

  // ── Done step
  doneCircle: {
    width:           72,
    height:          72,
    borderRadius:    36,
    backgroundColor: "#F0FDF4",
    borderWidth:     2,
    borderColor:     "#16A34A30",
    alignItems:      "center",
    justifyContent:  "center",
    alignSelf:       "center",
    marginBottom:    8,
    marginTop:       16,
  },
  doneTxt: {
    fontSize:     26,
    fontWeight:   "900",
    color:        "#111827",
    alignSelf:    "center",
  },
  doneSub: {
    fontSize:   14,
    color:      "#6B7280",
    textAlign:  "center",
    lineHeight: 20,
    alignSelf:  "center",
  },
});
