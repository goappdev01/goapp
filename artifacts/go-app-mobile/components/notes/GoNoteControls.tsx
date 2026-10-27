import React from "react";
import { View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoCloseButton } from "@/components/ui/GoCloseButton";

/** Layout only: the existing note actions retain their own callbacks and state. */
export function GoNoteControls({ internal, external, microphone, reminder, handedness, onClose, closeLabel }: {
  internal: React.ReactNode; external: React.ReactNode;
  microphone: React.ReactNode; reminder: React.ReactNode;
  handedness: "left" | "right"; onClose: () => void; closeLabel: string;
}) {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const wide = width - insets.left - insets.right - 36 >= Math.max(440, 220 * fontScale + 220);
  return <View testID="note-controls" style={{ position: "relative" }}>
    <View style={{ flexDirection: wide ? "row" : "column", alignItems: "stretch", gap: 6,
      ...(wide ? handedness === "left" ? { paddingLeft: 60 } : { paddingRight: 60 } : {}) }}>
      <View testID="note-task-controls" style={{ flexDirection: "row", gap: 12, ...(wide ? { flex: 1 } : {}) }}>
        {internal}{external}
      </View>
      <View testID="note-tool-controls" style={{ flexDirection: "row", gap: 12,
        justifyContent: handedness === "left" ? "flex-start" : "flex-end",
        ...(!wide ? handedness === "left" ? { paddingLeft: 60 } : { paddingRight: 60 } : {}) }}>
        {microphone}{reminder}
      </View>
    </View>
    <View testID="note-floating-close" style={{ position: "absolute", bottom: 0,
      ...(handedness === "left" ? { left: 0 } : { right: 0 }), zIndex: 2 }}>
      <GoCloseButton level="panel" onPress={onClose} accessibilityLabel={closeLabel} />
    </View>
  </View>;
}
