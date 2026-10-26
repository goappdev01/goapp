import React from "react";
import { View } from "react-native";
import { DraggableFAB } from "@/components/DraggableFAB";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
export function AssistantCloseControls({ panel = false, disabled, onClose, onGoToLanding, viewport, protectedBottom, topInset = 0 }: {
  panel?: boolean;
  disabled: boolean;
  onClose: () => void;
  onGoToLanding?: () => void;
  viewport: { width: number; height: number };
  protectedBottom: number;
  topInset?: number;
}) {
  // Overlay only the content area: never cover the composer, send action or GO dock.
  const height = viewport.height - protectedBottom;
  const paired = !panel && !!onGoToLanding;
  if (height < 60) return null;
  return <View pointerEvents="box-none" style={{ position: "absolute", top: topInset, left: 0, width: viewport.width, height }}>
    <DraggableFAB screenKey="booking-assistant" buttonKey={panel ? "panel-close" : "close"}
      initialBottom={12} initialRight={20} maxH={44} buttonWidth={paired ? 96 : 44}
      bounds={{ width: viewport.width, height }}>
      <View style={{ flexDirection: "row", gap: 8 }}>
        <GoCloseButton level="panel" disabled={disabled}
          accessibilityLabel={panel ? "Cerrar panel" : "Volver a la pantalla anterior"} onPress={onClose} />
        {paired && <GoCloseButton level="container" disabled={disabled} accessibilityLabel="Ir directamente al Landing" onPress={onGoToLanding!} />}
      </View>
    </DraggableFAB>
  </View>;
}