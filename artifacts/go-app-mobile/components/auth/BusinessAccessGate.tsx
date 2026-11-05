import React from "react";
import { ActivityIndicator, View, Text, KeyboardAvoidingView, Platform, Alert } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";
import { useGoMode } from "@/contexts/GoModeContext";
import { BusinessDossierWorkspace } from "./BusinessDossierWorkspace";
import { clearAuthSession } from "@/lib/authSession";

export function BusinessAccessGate({ children, ownerPresentation = false }: { children: React.ReactNode; ownerPresentation?: boolean }) {
  const mode = useGoMode();
  const access = useBusinessAccess();
  const insets = useSafeAreaInsets();
  const { syncModeFromRole } = mode;
  const logout = async () => {
    try { await clearAuthSession(); syncModeFromRole(null); }
    catch { Alert.alert("No se pudo cerrar sesión", "Vuelve a intentarlo."); }
  };
  if (ownerPresentation) return <>{children}</>;
  if (!mode.loaded || mode.isBusinessMode && access.loading) {
    return <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}><ActivityIndicator /><Text>Comprobando acceso…</Text></View>;
  }
  if (mode.isBusinessMode && (access.error || access.snapshot?.userId && !access.allowed)) {
    return <KeyboardAvoidingView style={{ flex: 1, paddingTop: insets.top }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <BusinessDossierWorkspace onClose={() => mode.setActiveMode("USER")} onLogout={logout} />
    </KeyboardAvoidingView>;
  }
  return <>{children}</>;
}
