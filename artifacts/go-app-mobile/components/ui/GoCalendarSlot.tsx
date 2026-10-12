import React, { type ReactElement } from "react";
import { View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  dateISO: string;
  timeHHMM: string;
  disabled?: boolean;
  onPress: (dateISO: string, timeHHMM: string) => void;
  children: ReactElement;
};

/** Attach only to empty slots; a hold or a scroll must never create a task. */
export function GoCalendarSlot({ dateISO, timeHHMM, disabled = false, onPress, children }: Props) {
  const { t } = useLanguage();
  const tap = Gesture.Tap()
    .enabled(!disabled)
    .maxDuration(250)
    .maxDistance(8)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success && !disabled) onPress(dateISO, timeHHMM);
    });
  return (
    <GestureDetector gesture={tap}>
      <View
        accessibilityRole="button"
        accessibilityLabel={t("new_task_label") + ": " + dateISO + " " + timeHHMM}
        accessibilityState={{ disabled }}
      >
        {children}
      </View>
    </GestureDetector>
  );
}
