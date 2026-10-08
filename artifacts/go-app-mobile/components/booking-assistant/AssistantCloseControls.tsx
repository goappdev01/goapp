import React from "react";
import { View } from "react-native";
import { DraggableFAB } from "@/components/DraggableFAB";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
export function AssistantCloseControls({ panel = false, disabled, onClose, viewport, protectedBottom, topInset = 0 }: {
  panel?: boolean;
  disabled: boolean;
  onClose: () => void;
  viewport: { width: number; height: number };
  protectedBottom: number;
  topInset?: number;
}) {
  // Overlay only the content area: never cover the composer, send action or GO dock.
  const height = viewport.height - protectedBottom;
  if (height < 60) return null;
  return <View pointerEvents="box-none" style={{ position: "absolute", top: topInset, left: 0, width: viewport.width, height }}>
    <DraggableFAB screenKey="booking-assistant" buttonKey={panel ? "panel-close" : "close"}
      initialBottom={12} initialRight={20} maxH={44} buttonWidth={44}
      bounds={{ width: viewport.width, height }}>
      <GoCloseButton level={panel ? "panel" : "container"} disabled={disabled}
        accessibilityLabel={panel ? "Cerrar panel" : "Ir al Landing"} onPress={onClose} />
    </DraggableFAB>
  </View>;
}