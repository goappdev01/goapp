/**
 * VerificacionEmpresaPanel
 * Full-screen panel for business verification flow.
 * Architecture ready for future OCR auto-validation.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { DraggableFAB } from "../DraggableFAB";
import * as DocumentPicker from "expo-document-picker";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CuentaVerification,
  REQUIRED_DOC_SLOTS,
  REQUIRED_COUNT,
  VerificationStatus,
  countUploadedRequired,
  loadVerification,
  resetVerification,
  submitDocumentSlot,
  verificationColor,
  verificationLabel,
} from "@/data/cuenta";

// ── Visual tokens ──────────────────────────────────────────────────────────────

const BG     = "#F5F3EF";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.07)";
const TEXT   = "#111827";
const DIM    = "#9CA3AF";
const GRAY   = "#6B7280";
const BLUE   = "#4A80BD";
const GREEN  = "#22C55E";

// ── Features that unlock with verification ─────────────────────────────────────

const LOCKED_FEATURES = [
  { icon: "calendar",       label: "Reservas públicas reales",        sub: "Clientes pueden reservar externamente" },
  { icon: "shopping-bag",   label: "Marketplace GO",                  sub: "Vende productos y servicios en el mercado" },
  { icon: "credit-card",    label: "Cobros y pagos",                  sub: "Procesa transacciones reales" },
  { icon: "globe",          label: "Publicación visible",             sub: "Tu negocio aparece en GO públicamente" },
  { icon: "zap",            label: "Automatizaciones avanzadas",      sub: "Workflows y triggers operativos" },
  { icon: "users",          label: "Trabajadores y equipos",          sub: "Invita empleados y asigna roles" },
  { icon: "bar-chart-2",    label: "Paneles operativos reales",       sub: "Métricas de negocio en tiempo real" },
];

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  onVerificationChange: (v: CuentaVerification) => void;
}

// ── Progress bar ───────────────────────────────────────────────────────────────
// Muestra progreso mientras falta algo. Desaparece al completar.

function VerifProgressBar({ uploaded, total }: { uploaded: number; total: number }) {
  const allDone = uploaded >= total && total > 0;
  const pct     = total === 0 ? 0 : Math.round((uploaded / total) * 100);

  // Al 100%: reemplaza la barra con el estado final. La información
  // útil desaparece cuando deja de ser útil.
  if (allDone) {
    return (
      <View style={pb.verifiedRow}>
        <Feather name="check-circle" size={15} color={GREEN} />
        <Text style={pb.verifiedTxt}>Empresa verificada</Text>
      </View>
    );
  }

  const fillPct = `${pct}%` as any;

  return (
    <View style={pb.wrap}>
      <View style={pb.topRow}>
        <Text style={pb.label}>Documentos requeridos</Text>
        <Text style={pb.count}>
          {uploaded}/{total}
          <Text style={pb.pct}>  {pct}%</Text>
        </Text>
      </View>
      <View style={pb.track}>
        <View style={[pb.fill, { width: fillPct }]} />
      </View>
    </View>
  );
}

const pb = StyleSheet.create({
  wrap:        { marginHorizontal: 16, marginTop: 16, marginBottom: 4 },
  topRow:      { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  label:       { color: GRAY, fontSize: 12, fontWeight: "600" },
  count:       { fontSize: 13, fontWeight: "800", color: BLUE },
  pct:         { fontSize: 11, fontWeight: "600", color: GRAY },
  track:       { height: 5, borderRadius: 3, backgroundColor: "rgba(0,0,0,0.07)", overflow: "hidden" },
  fill:        { height: 5, borderRadius: 3, backgroundColor: BLUE },
  verifiedRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    marginHorizontal: 16, marginTop: 14, marginBottom: 2,
  },
  verifiedTxt: { color: GREEN, fontSize: 13, fontWeight: "700" },
});

// ── Component ──────────────────────────────────────────────────────────────────

export function VerificacionEmpresaPanel({ visible, onClose, onVerificationChange }: Props) {
  const insets = useSafeAreaInsets();
  const [verification, setVerification] = useState<CuentaVerification>({ status: "none" });
  const [loading, setLoading]           = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const load = useCallback(async () => {
    setLoading(true);
    const v = await loadVerification();
    setVerification(v);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (visible) load();
  }, [visible, load]);


  const handlePickDocument = async (slotId: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/pdf", "image/*", "application/msword",
               "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
        copyToCacheDirectory: false,
      });
      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      setUploadingSlot(slotId);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

      const updated = await submitDocumentSlot(
        slotId,
        asset.name,
        asset.mimeType ?? "application/octet-stream",
        verification,
      );
      setVerification(updated);
      onVerificationChange(updated);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert("Error", "No se pudo seleccionar el documento. Inténtalo de nuevo.");
    } finally {
      setUploadingSlot(null);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Cancelar solicitud",
      "¿Seguro que quieres cancelar la solicitud de verificación?",
      [
        { text: "Mantener", style: "cancel" },
        {
          text: "Cancelar solicitud",
          style: "destructive",
          onPress: async () => {
            await resetVerification();
            const empty = { status: "none" as VerificationStatus };
            setVerification(empty);
            onVerificationChange(empty);
            Haptics.selectionAsync().catch(() => {});
          },
        },
      ]
    );
  };

  const color      = verificationColor(verification.status);
  const label      = verificationLabel(verification.status);
  const isVerified = verification.status === "verified";
  const isPending  = verification.status === "pending";
  const isNone     = verification.status === "none";
  const isRejected = verification.status === "rejected";

  const uploadedRequired = countUploadedRequired(verification);
  const showChecklist    = isNone || isRejected || isPending;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={false}
      onRequestClose={onClose}
    >
      <View style={[s.root, { paddingTop: insets.top }]}>

        {/* Handle */}
        <View style={s.handleZone}>
          <View style={s.handlePill} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>Verificación{"\n"}de empresa</Text>
          <View style={[s.statusPill, { backgroundColor: `${color}12`, borderColor: `${color}35` }]}>
            <View style={[s.statusDot, { backgroundColor: color }]} />
            <Text style={[s.statusTxt, { color }]}>{label.toUpperCase()}</Text>
          </View>
        </View>

        {/* Progress bar — visible cuando hay checklist activo */}
        {showChecklist && !loading && (
          <VerifProgressBar uploaded={uploadedRequired} total={REQUIRED_COUNT} />
        )}

        {loading ? (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
            <ActivityIndicator color={BLUE} />
          </View>
        ) : (
          <ScrollView
            style={s.scroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: insets.bottom + 60 }}
          >

            {/* ── Current status card ── */}
            <View style={[s.statusCard, { borderColor: `${color}30` }]}>
              <View style={[s.statusIconWrap, { backgroundColor: `${color}12` }]}>
                <Feather
                  name={
                    isVerified  ? "check-circle"
                    : isPending  ? "clock"
                    : isRejected ? "x-circle"
                    : "shield"
                  }
                  size={26}
                  color={color}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.statusCardTitle}>{label}</Text>
                <Text style={s.statusCardSub}>
                  {isVerified  ? "Tu empresa está verificada. Tienes acceso completo a GO."
                  : isPending  ? "Hemos recibido tu documentación. La revisaremos pronto."
                  : isRejected ? verification.rejectionReason ?? "Tu solicitud fue rechazada. Puedes volver a intentarlo."
                  : "Verifica tu empresa para acceder a todas las funciones de GO."}
                </Text>
                {isPending && verification.submittedAt && (
                  <Text style={s.statusMeta}>
                    Enviado el {new Date(verification.submittedAt).toLocaleDateString("es-ES", {
                      day: "numeric", month: "long", year: "numeric",
                    })}
                  </Text>
                )}
              </View>
            </View>

            {/* ── Document checklist ── */}
            {showChecklist && (
              <>
                <Text style={s.sectionLabel}>DOCUMENTACIÓN REQUERIDA</Text>
                <View style={s.checklistCard}>
                  {REQUIRED_DOC_SLOTS.map((slot, i) => {
                    const uploaded = verification.uploadedDocs?.[slot.id];
                    const isUploading = uploadingSlot === slot.id;
                    const isLast = i === REQUIRED_DOC_SLOTS.length - 1;
                    return (
                      <View
                        key={slot.id}
                        style={[s.checklistRow, !isLast && s.checklistRowBorder]}
                      >
                        {/* State indicator */}
                        <View style={[
                          s.checkDot,
                          uploaded
                            ? { backgroundColor: GREEN }
                            : slot.required
                              ? { backgroundColor: "rgba(0,0,0,0.08)" }
                              : { backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: BORDER },
                        ]}>
                          {uploaded
                            ? <Feather name="check" size={11} color="#fff" />
                            : <Feather name={slot.icon as any} size={11} color={slot.required ? GRAY : DIM} />}
                        </View>

                        {/* Text */}
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                            <Text style={[s.checkLabel, uploaded && { color: TEXT }]}>{slot.label}</Text>
                            {!slot.required && (
                              <View style={s.optionalBadge}>
                                <Text style={s.optionalTxt}>opcional</Text>
                              </View>
                            )}
                          </View>
                          {uploaded ? (
                            <Text style={s.checkUploaded} numberOfLines={1}>{uploaded.name}</Text>
                          ) : (
                            <Text style={s.checkSub}>{slot.sub}</Text>
                          )}
                        </View>

                        {/* Action */}
                        {!isPending && (
                          <TouchableOpacity
                            onPress={() => handlePickDocument(slot.id)}
                            disabled={isUploading}
                            activeOpacity={0.75}
                            style={[
                              s.slotBtn,
                              uploaded ? s.slotBtnDone : s.slotBtnPending,
                            ]}
                          >
                            {isUploading
                              ? <ActivityIndicator size="small" color={uploaded ? GREEN : BLUE} />
                              : <Feather
                                  name={uploaded ? "refresh-cw" : "upload"}
                                  size={13}
                                  color={uploaded ? GREEN : BLUE}
                                />}
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>

                {!isPending && (
                  <Text style={s.uploadHint}>
                    La revisión suele completarse en 1–3 días hábiles.{"\n"}
                    Tus datos se procesan de forma segura.
                  </Text>
                )}
              </>
            )}

            {/* ── What unlocks ── */}
            {!isVerified && (
              <>
                <Text style={s.sectionLabel}>QUÉ ACTIVA LA VERIFICACIÓN</Text>
                <View style={s.featureCard}>
                  {LOCKED_FEATURES.map((f, i) => (
                    <View
                      key={f.icon}
                      style={[s.featureRow, i < LOCKED_FEATURES.length - 1 && s.featureRowBorder]}
                    >
                      <View style={s.featureIcon}>
                        <Feather name={f.icon as any} size={16} color={BLUE} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.featureLabel}>{f.label}</Text>
                        <Text style={s.featureSub}>{f.sub}</Text>
                      </View>
                      <Feather name="lock" size={13} color="rgba(0,0,0,0.18)" />
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Verified success ── */}
            {isVerified && (
              <>
                <Text style={s.sectionLabel}>FUNCIONES ACTIVAS</Text>
                <View style={s.featureCard}>
                  {LOCKED_FEATURES.map((f, i) => (
                    <View
                      key={f.icon}
                      style={[s.featureRow, i < LOCKED_FEATURES.length - 1 && s.featureRowBorder]}
                    >
                      <View style={[s.featureIcon, { backgroundColor: "rgba(34,197,94,0.10)" }]}>
                        <Feather name={f.icon as any} size={16} color={GREEN} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={s.featureLabel}>{f.label}</Text>
                        <Text style={s.featureSub}>{f.sub}</Text>
                      </View>
                      <Feather name="check" size={13} color={GREEN} />
                    </View>
                  ))}
                </View>
              </>
            )}

            {/* ── Pending: cancel option ── */}
            {isPending && (
              <TouchableOpacity
                style={s.cancelSolicitudBtn}
                onPress={handleReset}
                activeOpacity={0.75}
              >
                <Feather name="x" size={14} color="#EF4444" />
                <Text style={s.cancelSolicitudTxt}>Cancelar solicitud</Text>
              </TouchableOpacity>
            )}

            {/* ── Info footer ── */}
            <Text style={s.infoFooter}>
              GO verifica empresas para garantizar la confianza en la plataforma.
              Los datos enviados son tratados según la política de privacidad de GO.
            </Text>

          </ScrollView>
        )}

        {/* Floating close button */}
        <DraggableFAB
          screenKey="verificacion-empresa"
          buttonKey="main"
          initialRight={20}
          initialBottom={insets.bottom + 24}
          maxH={46}
        >
          <TouchableOpacity onPress={onClose} activeOpacity={0.8} hitSlop={8} style={s.floatingClose}>
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

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },

  handleZone:  { alignItems: "center", paddingTop: 10, paddingBottom: 4 },
  handlePill:  { width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(0,0,0,0.12)" },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14,
    backgroundColor: CARD,
    borderBottomWidth: 1, borderBottomColor: BORDER,
    gap: 12,
  },
  headerTitle:  { color: TEXT, fontSize: 20, fontWeight: "800", lineHeight: 26, flex: 1 },
  statusPill:   { flexDirection: "row", alignItems: "center", gap: 5,
                  paddingHorizontal: 10, paddingVertical: 5,
                  borderRadius: 20, borderWidth: 1 },
  statusDot:    { width: 6, height: 6, borderRadius: 3 },
  statusTxt:    { fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },

  floatingClose: {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },

  scroll: { flex: 1 },

  // Status card
  statusCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 14,
    margin: 16, marginBottom: 8,
    backgroundColor: CARD, borderRadius: 20, borderWidth: 1.5,
    padding: 18,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  statusIconWrap: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  statusCardTitle: { color: TEXT, fontSize: 17, fontWeight: "800", marginBottom: 4 },
  statusCardSub:   { color: GRAY, fontSize: 13, lineHeight: 19 },
  statusMeta:      { color: DIM, fontSize: 11, marginTop: 6 },

  // Section label
  sectionLabel: {
    color: DIM, fontSize: 10, fontWeight: "900", letterSpacing: 1.8,
    marginHorizontal: 16, marginTop: 20, marginBottom: 10,
  },

  // Checklist
  checklistCard: {
    marginHorizontal: 16,
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  checklistRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 14,
  },
  checklistRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  checkDot: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  checkLabel:    { color: GRAY, fontSize: 13, fontWeight: "600" },
  checkSub:      { color: DIM, fontSize: 11, marginTop: 2 },
  checkUploaded: { color: GREEN, fontSize: 11, marginTop: 2, fontWeight: "600" },
  optionalBadge: {
    paddingHorizontal: 6, paddingVertical: 2,
    backgroundColor: "rgba(0,0,0,0.05)", borderRadius: 6,
  },
  optionalTxt: { color: DIM, fontSize: 9, fontWeight: "700" },
  slotBtn: {
    width: 34, height: 34, borderRadius: 10,
    alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  slotBtnPending: { backgroundColor: `${BLUE}12` },
  slotBtnDone:    { backgroundColor: `${GREEN}12` },

  uploadHint: {
    color: DIM, fontSize: 12, lineHeight: 18,
    marginHorizontal: 16, marginTop: 12, marginBottom: 4,
    textAlign: "center",
  },

  // Feature list card
  featureCard: {
    marginHorizontal: 16,
    backgroundColor: CARD, borderRadius: 18, borderWidth: 1, borderColor: BORDER,
    overflow: "hidden",
    shadowColor: "#000", shadowOpacity: 0.03, shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 }, elevation: 1,
  },
  featureRow:       { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
  featureRowBorder: { borderBottomWidth: 1, borderBottomColor: BORDER },
  featureIcon:      {
    width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(74,128,189,0.09)", flexShrink: 0,
  },
  featureLabel:     { color: TEXT, fontSize: 13, fontWeight: "600" },
  featureSub:       { color: DIM, fontSize: 11, marginTop: 1 },

  cancelSolicitudBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    marginHorizontal: 16, marginTop: 20,
    paddingVertical: 14,
    borderRadius: 14, borderWidth: 1, borderColor: "rgba(239,68,68,0.22)",
    backgroundColor: "rgba(239,68,68,0.04)",
  },
  cancelSolicitudTxt: { color: "#EF4444", fontSize: 14, fontWeight: "600" },

  infoFooter: {
    color: "rgba(0,0,0,0.20)", fontSize: 11, lineHeight: 17,
    marginHorizontal: 24, marginTop: 24, textAlign: "center",
  },
});
