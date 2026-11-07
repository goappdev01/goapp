import React, { useEffect } from "react";
import { Modal, KeyboardAvoidingView, Platform, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import { DraggableFAB } from "@/components/DraggableFAB";
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
    <View style={{ flex: 1 }}>
      <KeyboardAvoidingView style={{ flex: 1, paddingTop: insets.top }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <BusinessDossierWorkspace onClose={onClose} showBackButton={false} />
      </KeyboardAvoidingView>
      <DraggableFAB navigation screenKey="verificacion-empresa" buttonKey="main"
        initialRight={20} initialBottom={insets.bottom + 24} maxH={64} buttonWidth={64}>
        <GoCloseButton level="container" onPress={onClose} activeOpacity={0.8} hitSlop={8} accessibilityLabel="Salir" />
      </DraggableFAB>
    </View>
  </Modal>;
}
