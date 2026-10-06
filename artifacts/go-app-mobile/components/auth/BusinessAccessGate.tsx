import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";
import { useGoMode } from "@/contexts/GoModeContext";
import { submitBusinessEnrollment, type BusinessEnrollment } from "@/data/businessAccess";
import { businessEnrollmentDraftKey, clearBusinessEnrollmentDraft, loadBusinessEnrollmentDraft,
  logBusinessEnrollmentFailure, saveBusinessEnrollmentDraft } from "@/data/businessEnrollmentDraft";
import { notifySessionChanged } from "@/lib/sessionEvents";

const empty: BusinessEnrollment = { legal_name: "", tax_id: "", trading_name: "", address: "" };
const sendError = "No hemos podido enviar tu solicitud en este momento. Tus datos se han conservado. Inténtalo de nuevo más tarde.";
const draftError = "No hemos podido guardar tus datos en este dispositivo. Mantén el formulario abierto e inténtalo de nuevo.";

export function BusinessAccessGate({ children }: { children: React.ReactNode }) {
  const mode = useGoMode();
  const access = useBusinessAccess();
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
  const [error, setError] = useState<string | null>(null);
  const latest = useRef<{ key: string | null; data: BusinessEnrollment }>({ key: null, data: empty });
  const inputs = useRef<Partial<Record<keyof BusinessEnrollment, TextInput>>>({});
  const saving = useRef(false);
  const mounted = useRef(false);
  const ready = !!draftKey && readyKey === draftKey;

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
  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(["go_supabase_session_v1", "go_account_type_v1"]);
      syncModeFromRole(null);
      notifySessionChanged();
    } catch { Alert.alert("No se pudo cerrar sesión", "Vuelve a intentarlo."); }
  };
  return <KeyboardAvoidingView style={s.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]}
      keyboardShouldPersistTaps="handled" keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}>
      <Text style={s.title}>{access.error ? "No se pudo comprobar tu empresa"
        : status === "rechazada" ? "Empresa no aprobada"
        : status === "sin_empresa" ? "Alta de empresa" : "Empresa pendiente de verificación"}</Text>
      <Text style={s.description}>{access.error ? "Comprueba la conexión y vuelve a intentarlo." : status === "rechazada"
        ? business?.verification_request?.rejection_reason || "Revisa los datos y vuelve a enviar tu solicitud."
        : status === "sin_empresa" ? "Solicita el alta con tu misma cuenta GO. La verificación será revisada manualmente."
        : "Estamos comprobando los datos de tu empresa. Cuando sea verificada podrás acceder a GO Empresa."}</Text>
      {!access.error && (editing || status === "sin_empresa") && <View style={s.form}>
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
        <TouchableOpacity style={s.primary} disabled={!ready || busy} onPress={save}><Text style={s.primaryText}>{busy ? "Enviando…" : "Enviar para verificación"}</Text></TouchableOpacity>
      </View>}
      {!access.error && status !== "sin_empresa" && !editing && <TouchableOpacity style={s.secondary} disabled={busy} onPress={() => setEditing(true)}><Text>Completar / corregir datos</Text></TouchableOpacity>}
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
