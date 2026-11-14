import type { TextInputInstance } from "react-native";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";
import { useGoMode } from "@/contexts/GoModeContext";
import * as DocumentPicker from "expo-document-picker";
import * as FileSystem from "expo-file-system/legacy";
import { acceptBusinessTrial, getTrialCapabilities, submitBusinessEnrollment, uploadBusinessDocument, type BusinessEnrollment } from "@/data/businessAccess";
import { businessEnrollmentDraftKey, clearBusinessEnrollmentDraft, loadBusinessEnrollmentDraft,
  logBusinessEnrollmentFailure, saveBusinessEnrollmentDraft } from "@/data/businessEnrollmentDraft";
import { clearAuthSession } from "@/lib/authSession";

const empty: BusinessEnrollment = { legal_name: "", tax_id: "", trading_name: "", address: "" };
const sendError = "No hemos podido enviar tu solicitud en este momento. Tus datos se han conservado. Inténtalo de nuevo más tarde.";
const draftError = "No hemos podido guardar tus datos en este dispositivo. Mantén el formulario abierto e inténtalo de nuevo.";

export function BusinessAccessGate({ children, ownerPresentation = false }: { children: React.ReactNode; ownerPresentation?: boolean }) {
  const mode = useGoMode();
  const access = useBusinessAccess();
  // Same owner presentation exception as Home previously used outside this gate.
  // ADMIN/DEMO operations still require their current server-checked permissions.
  if (ownerPresentation) return <>{children}</>;
  if (!mode.loaded || (mode.isBusinessMode && access.loading)) {
    return <View style={s.wait}><ActivityIndicator /><Text>Comprobando acceso…</Text></View>;
  }
  // Do not mount private modules or their effects before server permission.
  if (mode.isBusinessMode && (access.error || (access.snapshot?.userId && !access.allowed))) {
    return <BusinessVerificationScreen />;
  }
  return <>{children}</>;
}

function BusinessVerificationScreen() {
  const insets = useSafeAreaInsets();
  const access = useBusinessAccess();
  const { setActiveMode, syncModeFromRole } = useGoMode();
  const business = access.snapshot?.business;
  const status = access.snapshot?.status;
  const userId = access.snapshot?.userId;
  const draftKey = userId ? businessEnrollmentDraftKey(userId, business?.id) : null;
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<BusinessEnrollment>(empty);
  const [readyKey, setReadyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [trialConsent, setTrialConsent] = useState(false);
  const [trialFeature, setTrialFeature] = useState<boolean | null>(null);
  const [documentKind, setDocumentKind] = useState<"identidad" | "fiscal" | "actividad">("fiscal");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<{ key: string | null; data: BusinessEnrollment }>({ key: null, data: empty });
  const inputs = useRef<Partial<Record<keyof BusinessEnrollment, TextInputInstance>>>({});
  const saving = useRef(false);
  const mounted = useRef(false);
  const ready = !!draftKey && readyKey === draftKey;
  const trial = business?.trial;
  const needsDocuments = trialFeature === true && !!business && trial?.status !== "approved"
    && (!trial || ["documents_pending", "needs_changes", "rejected"].includes(trial.status));

  useEffect(() => {
    let cancelled = false;
    mounted.current = true;
    setReadyKey(null);
    const initial = { legal_name: business?.verification_request?.legal_name ?? business?.name ?? "",
      tax_id: business?.verification_request?.tax_id ?? "", trading_name: business?.verification_request?.trading_name ?? "",
      address: business?.verification_request?.address ?? business?.address ?? "" };
    latest.current = { key: draftKey, data: initial };
    setData(initial);
    if (draftKey) void loadBusinessEnrollmentDraft(draftKey).then(saved => {
      if (cancelled) return;
      const restored = saved ?? initial;
      latest.current = { key: draftKey, data: restored };
      setData(restored);
      setEditing(!!saved);
      setReadyKey(draftKey);
    }).catch(cause => {
      logBusinessEnrollmentFailure("restore-draft", cause);
      if (!cancelled) setError("No hemos podido recuperar tus datos. Vuelve a abrir el formulario para intentarlo de nuevo.");
    });
    return () => { cancelled = true; mounted.current = false; };
    // Server refresh must not replace edits. Rehydrate only for a new owner/business.
  }, [draftKey]);

  useEffect(() => {
    let cancelled = false;
    setTrialFeature(null);
    if (userId) void getTrialCapabilities().then(enabled => {
      if (!cancelled) setTrialFeature(enabled);
    }).catch(() => {
      if (!cancelled) setError("No se pudo comprobar si el alta está disponible. Comprueba tu conexión.");
    });
    return () => { cancelled = true; };
  }, [userId]);

  const change = (field: keyof BusinessEnrollment, value: string) => {
    if (!ready || !draftKey || saving.current) return;
    const next = { ...latest.current.data, [field]: value };
    latest.current = { key: draftKey, data: next };
    setData(next);
    setError(null);
    // Enqueue immediately, before any background/access refresh can unmount us.
    void saveBusinessEnrollmentDraft(draftKey, next).catch(cause => {
      logBusinessEnrollmentFailure("save-draft", cause);
      if (mounted.current && latest.current.key === draftKey && latest.current.data === next) setError(draftError);
    });
  };
  const save = async () => {
    if (!ready || !draftKey || saving.current) return;
    const submitted = { ...latest.current.data };
    if (submitted.legal_name.trim().length < 2 || submitted.tax_id.trim().length < 3 || !submitted.address.trim()) {
      setError("Completa la razón social, el NIF/CIF y la dirección."); return;
    }
    if (trialFeature === true && (!business?.id || !trial || !business.documents?.some(doc => doc.kind === "identidad")
      || !business.documents?.some(doc => doc.kind === "fiscal"))) {
      setError("Acepta la prueba y adjunta al menos un documento de identidad y uno fiscal."); return;
    }
    saving.current = true;
    setBusy(true); setError(null);
    let preserved = false;
    try {
      await saveBusinessEnrollmentDraft(draftKey, submitted);
      preserved = true;
      await submitBusinessEnrollment(submitted, business?.id);
      // Clear only after the backend confirms a real, unverified record.
      try { await clearBusinessEnrollmentDraft(draftKey, submitted); }
      catch (cause) { logBusinessEnrollmentFailure("clear-submitted-draft", cause); }
      if (mounted.current) setEditing(false);
      await access.refresh();
    } catch (cause) {
      logBusinessEnrollmentFailure(preserved ? "submit" : "save-before-submit", cause);
      if (mounted.current) setError(preserved ? sendError : draftError);
    } finally {
      saving.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const acceptTrial = async () => {
    if (!trialConsent || busy) return;
    setBusy(true); setError(null);
    try { await acceptBusinessTrial(); setEditing(true); await access.refresh(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo aceptar la prueba."); }
    finally { setBusy(false); }
  };
  const addDocument = async () => {
    if (!business?.id || !trial || !needsDocuments || busy) return;
    const result = await DocumentPicker.getDocumentAsync({ type: ["application/pdf", "image/jpeg", "image/png"],
      copyToCacheDirectory: true, multiple: false });
    if (result.canceled || !result.assets?.[0]) return;
    const file = result.assets[0];
    if (!file.size || file.size > 5 * 1024 * 1024) { setError("El documento debe pesar entre 1 byte y 5 MB."); return; }
    const mime = file.mimeType || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf"
      : file.name.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg");
    if (!["application/pdf", "image/jpeg", "image/png"].includes(mime)) { setError("Solo PDF, JPG o PNG."); return; }
    setBusy(true); setError(null);
    try {
      const content_base64 = await FileSystem.readAsStringAsync(file.uri, { encoding: FileSystem.EncodingType.Base64 });
      await uploadBusinessDocument(business.id, { kind: documentKind, name: file.name, mime_type: mime, content_base64 });
      await access.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el documento privado."); }
    finally {
      await FileSystem.deleteAsync(file.uri, { idempotent: true }).catch(() => {});
      setBusy(false);
    }
  };
  const logout = async () => {
    try {
      await clearAuthSession();
      syncModeFromRole(null);
    } catch { Alert.alert("No se pudo cerrar sesión", "Vuelve a intentarlo."); }
  };
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
      <Text style={s.title}>{access.error ? "No se pudo comprobar tu empresa"
        : status === "trial_expirada" ? "Prueba gratuita finalizada"
        : status === "rechazada" ? "Empresa no aprobada"
        : status === "sin_empresa" || !trial ? "Alta de empresa" : "Empresa pendiente de verificación"}</Text>
      <Text style={s.description}>{access.error ? "Comprueba la conexión y vuelve a intentarlo." : trialFeature === null
        ? "Comprobando disponibilidad del alta…"
        : trialFeature === false ? "Solicita el alta con tu misma cuenta GO. La verificación será revisada manualmente."
        : status === "trial_expirada"
        ? "Los 30 días han terminado. Tu configuración se conserva. GO comunicará los pasos para continuar cuando esté disponible el servicio comercial."
        : trial?.status === "pending_review" ? "GO está revisando la documentación. No podrás entrar en los ocho pasos hasta recibir la aprobación."
        : trial?.status === "needs_changes" ? trial.review_notes || "Debes corregir la documentación indicada por GO."
        : status === "rechazada"
        ? business?.verification_request?.rejection_reason || "Revisa los datos y vuelve a enviar tu solicitud."
        : !trial ? "Antes de configurar tu empresa debes aceptar la prueba gratuita y presentar la documentación."
        : "Adjunta tus documentos y envía tu solicitud. Al aprobarla GO empezarán los 30 días gratuitos."}</Text>
      {!!error && trialFeature === null && <Text style={s.error}>{error}</Text>}
      {!access.error && trialFeature === true && !trial && status !== "trial_expirada" && <View style={s.form}>
        <Text style={s.label}>Prueba gratuita: 30 días, sin cargo ni renovación automática. Comienza solo tras la aprobación de GO.</Text>
        <TouchableOpacity accessibilityRole="checkbox" accessibilityState={{ checked: trialConsent }}
          style={s.secondary} disabled={busy} onPress={() => setTrialConsent(v => !v)}>
          <Text>{trialConsent ? "☑" : "☐"} Acepto las condiciones de la prueba gratuita de 30 días.</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.primary} disabled={!trialConsent || busy} onPress={acceptTrial}>
          <Text style={s.primaryText}>{busy ? "Guardando…" : "Aceptar prueba gratuita"}</Text>
        </TouchableOpacity>
      </View>}
      {!access.error && needsDocuments && !!trial && <View style={s.form}>
        <Text style={s.label}>Documentación privada (PDF, JPG o PNG; máximo 5 MB por archivo).</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          {(["identidad", "fiscal", "actividad"] as const).map(kind => <TouchableOpacity key={kind}
            style={[s.secondary, { padding: 10, backgroundColor: documentKind === kind ? "#CBECE2" : "#FFFFFF" }]}
            onPress={() => setDocumentKind(kind)} disabled={busy}>
            <Text>{kind === "identidad" ? "Identidad" : kind === "fiscal" ? "Fiscal" : "Actividad"}</Text>
          </TouchableOpacity>)}
        </View>
        <TouchableOpacity onPress={() => { void addDocument(); }} disabled={busy} style={s.primary}>
          <Text style={s.primaryText}>{busy ? "Guardando…" : "Adjuntar documento"}</Text>
        </TouchableOpacity>
        {business.documents?.map(doc => <Text key={doc.id} style={s.label}>✓ {doc.kind}: {doc.file_name}</Text>)}
      </View>}
      {!access.error && ((trialFeature === true && !!trial && (editing || needsDocuments && !business?.verification_request))
        || (trialFeature === false && (editing || status === "sin_empresa"))) && <View style={s.form}>
        {!ready && !error && <ActivityIndicator accessibilityLabel="Recuperando datos" />}
        {([['legal_name', 'Nombre o razón social'], ['tax_id', 'NIF/CIF'], ['trading_name', 'Nombre comercial (opcional)'], ['address', 'Dirección']] as const).map(([key, label], index, fields) => <View key={key}>
          <Text style={s.label}>{label}</Text>
          <TextInput ref={input => { inputs.current[key] = input ?? undefined; }} accessibilityLabel={label} value={data[key]}
            editable={ready && !busy} maxLength={key === 'tax_id' ? 32 : key === 'address' ? 4000 : 200}
            returnKeyType={key === "address" ? "done" : "next"} blurOnSubmit={key === "address"}
            onSubmitEditing={() => { const next = fields[index + 1]?.[0]; if (next) inputs.current[next]?.focus(); }}
            onChangeText={value => change(key, value)} style={s.input} />
        </View>)}
        {error && <Text style={s.error}>{error}</Text>}
        <TouchableOpacity style={s.primary} disabled={!ready || busy} onPress={save}><Text style={s.primaryText}>{busy ? "Enviando…" : "Enviar documentos y solicitud"}</Text></TouchableOpacity>
      </View>}
      {!access.error && !editing && (needsDocuments && !!trial || trialFeature === false && status !== "sin_empresa")
        && <TouchableOpacity style={s.secondary} disabled={busy} onPress={() => setEditing(true)}><Text>Completar / corregir datos</Text></TouchableOpacity>}
      {access.error && <TouchableOpacity style={s.secondary} onPress={() => { void access.refresh(); }}><Text>Volver a comprobar</Text></TouchableOpacity>}
      <TouchableOpacity style={s.secondary} disabled={busy} onPress={() => setActiveMode("USER")}><Text>Volver al modo Usuario</Text></TouchableOpacity>
      <TouchableOpacity style={s.secondary} disabled={busy} onPress={logout}><Text style={s.error}>Cerrar sesión</Text></TouchableOpacity>
    </ScrollView>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3EF" }, content: { flexGrow: 1, paddingHorizontal: 24, gap: 18 },
  wait: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#F5F3EF" },
  title: { color: "#111827", fontSize: 24, fontWeight: "700" }, description: { color: "#4B5563", fontSize: 16, lineHeight: 24 },
  form: { gap: 16 }, label: { color: "#374151", marginBottom: 6 }, input: { minHeight: 48, padding: 12, backgroundColor: "#FFFFFF", borderRadius: 10, color: "#111827" },
  primary: { padding: 16, borderRadius: 12, backgroundColor: "#3D9A84", alignItems: "center" }, primaryText: { color: "#FFFFFF", fontWeight: "700" },
  secondary: { padding: 16, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center" }, error: { color: "#C25A5A" },
});
