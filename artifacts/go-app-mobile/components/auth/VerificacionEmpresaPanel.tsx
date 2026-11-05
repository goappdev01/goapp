import React, { useEffect } from "react";
import { Modal, KeyboardAvoidingView, Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";
import type { CuentaVerification } from "@/data/cuenta";
import { BusinessDossierWorkspace } from "./BusinessDossierWorkspace";

type Props = { visible: boolean; onClose: () => void; onVerificationChange: (value: CuentaVerification) => void };

export function VerificacionEmpresaPanel({ visible, onClose, onVerificationChange }: Props) {
  const access = useBusinessAccess();
  const insets = useSafeAreaInsets();
  const status = access.allowed ? "verified" : access.snapshot?.status === "rechazada" ? "rejected" : access.snapshot?.business ? "pending" : "none";
  useEffect(() => { if (visible) onVerificationChange({ status }); }, [visible, status]);
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <KeyboardAvoidingView style={{ flex: 1, paddingTop: insets.top }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <BusinessDossierWorkspace onClose={onClose} />
    </KeyboardAvoidingView>
  </Modal>;
}
