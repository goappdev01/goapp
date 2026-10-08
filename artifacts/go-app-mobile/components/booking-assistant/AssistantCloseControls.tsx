import React from "react";
import { View, useWindowDimensions } from "react-native";
import { DraggableFAB } from "@/components/DraggableFAB";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
// Reserved space inside KeyboardAvoidingView prevents overlap with form and keyboard.
export function AssistantCloseControls({ panel = false, disabled, onClose }: {
  panel?: boolean; disabled: boolean; onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  return <View style={{ height: 60, backgroundColor: "#FFF" }}>
    <DraggableFAB screenKey="booking-assistant" buttonKey={panel ? "panel-close" : "close"}
      initialTop={8} initialRight={20} maxH={44} buttonWidth={44}
      bounds={{ width, height: 60 }}>
      <GoCloseButton level={panel ? "panel" : "container"} disabled={disabled}
        accessibilityLabel={panel ? "Cerrar panel" : "Ir al Landing"} onPress={onClose} />
    </DraggableFAB>
  </View>;
}