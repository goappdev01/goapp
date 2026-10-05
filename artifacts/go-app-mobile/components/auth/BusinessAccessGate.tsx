import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";
import { useGoMode } from "@/contexts/GoModeContext";
import { submitBusinessEnrollment, type BusinessEnrollment } from "@/data/businessAccess";
import { BookingApiError } from "@/data/booking";
import { notifySessionChanged } from "@/lib/sessionEvents";

const empty: BusinessEnrollment = { legal_name: "", tax_id: "", trading_name: "", address: "" };

export function BusinessAccessGate({ children }: { children: React.ReactNode }) {
  const mode = useGoMode();
  const access = useBusinessAccess();
  if (!mode.loaded || (mode.isBusinessMode && access.loading)) {
    return <View style={s.wait}><ActivityIndicator /><Text>Comprobando acceso…</Text></View>;
  }
  // Do not mount the landing, private modules or their effects before permission.
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
  const [editing, setEditing] = useState(false);
  const [data, setData] = useState<BusinessEnrollment>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setData({ legal_name: business?.verification_request?.legal_name ?? business?.name ?? "",
      tax_id: business?.verification_request?.tax_id ?? "", trading_name: business?.verification_request?.trading_name ?? "",
      address: business?.verification_request?.address ?? business?.address ?? "" });
  }, [business]);
  const save = async () => {
    if (data.legal_name.trim().length < 2 || data.tax_id.trim().length < 3 || !data.address.trim()) {
      setError("Completa la razón social, el NIF/CIF y la dirección."); return;
    }
    setBusy(true); setError(null);
    try {
      await submitBusinessEnrollment(data, business?.id);
      setEditing(false);
      await access.refresh();
    } catch (cause) {
      setError(cause instanceof BookingApiError && cause.status === 404
        ? "El alta empresarial necesita la actualización del backend. Puedes continuar en modo Usuario."
        : cause instanceof Error ? cause.message : "No se pudo enviar el alta. Vuelve a intentarlo.");
    } finally { setBusy(false); }
  };
  const logout = async () => {
    try {
      await AsyncStorage.multiRemove(["go_supabase_session_v1", "go_account_type_v1"]);
      syncModeFromRole(null);
      notifySessionChanged();
    } catch { Alert.alert("No se pudo cerrar sesión", "Vuelve a intentarlo."); }
  };
  return <ScrollView style={s.root} contentContainerStyle={[s.content, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>{access.error ? "No se pudo comprobar tu empresa"
      : status === "rechazada" ? "Empresa no aprobada"
      : status === "sin_empresa" ? "Alta de empresa" : "Empresa pendiente de verificación"}</Text>
    <Text style={s.description}>{access.error ?? (status === "rechazada"
      ? business?.verification_request?.rejection_reason || "Revisa los datos y vuelve a enviar tu solicitud."
      : status === "sin_empresa" ? "Solicita el alta con tu misma cuenta GO. La verificación será revisada manualmente."
      : "Estamos comprobando los datos de tu empresa. Cuando sea verificada podrás acceder a GO Empresa.")}</Text>
    {!access.error && (editing || status === "sin_empresa") && <View style={s.form}>
      {([['legal_name', 'Nombre o razón social'], ['tax_id', 'NIF/CIF'], ['trading_name', 'Nombre comercial (opcional)'], ['address', 'Dirección']] as const).map(([key, label]) => <View key={key}>
        <Text style={s.label}>{label}</Text>
        <TextInput accessibilityLabel={label} value={data[key]} editable={!busy} maxLength={key === 'tax_id' ? 32 : key === 'address' ? 4000 : 200}
          onChangeText={value => { setData(previous => ({ ...previous, [key]: value })); setError(null); }} style={s.input} />
      </View>)}
      {error && <Text style={s.error}>{error}</Text>}
      <TouchableOpacity style={s.primary} disabled={busy} onPress={save}><Text style={s.primaryText}>{busy ? "Enviando…" : "Enviar para verificación"}</Text></TouchableOpacity>
    </View>}
    {!access.error && status !== "sin_empresa" && !editing && <TouchableOpacity style={s.secondary} disabled={busy} onPress={() => setEditing(true)}><Text>Completar / corregir datos</Text></TouchableOpacity>}
    {access.error && <TouchableOpacity style={s.secondary} onPress={() => { void access.refresh(); }}><Text>Volver a comprobar</Text></TouchableOpacity>}
    <TouchableOpacity style={s.secondary} disabled={busy} onPress={() => setActiveMode("USER")}><Text>Volver al modo Usuario</Text></TouchableOpacity>
    <TouchableOpacity style={s.secondary} disabled={busy} onPress={logout}><Text style={s.error}>Cerrar sesión</Text></TouchableOpacity>
  </ScrollView>;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#F5F3EF" }, content: { flexGrow: 1, paddingHorizontal: 24, gap: 18 },
  wait: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "#F5F3EF" },
  title: { color: "#111827", fontSize: 24, fontWeight: "700" }, description: { color: "#4B5563", fontSize: 16, lineHeight: 24 },
  form: { gap: 16 }, label: { color: "#374151", marginBottom: 6 }, input: { minHeight: 48, padding: 12, backgroundColor: "#FFFFFF", borderRadius: 10, color: "#111827" },
  primary: { padding: 16, borderRadius: 12, backgroundColor: "#3D9A84", alignItems: "center" }, primaryText: { color: "#FFFFFF", fontWeight: "700" },
  secondary: { padding: 16, borderRadius: 12, backgroundColor: "#FFFFFF", alignItems: "center" }, error: { color: "#C25A5A" },
});
