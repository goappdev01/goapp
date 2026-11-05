import React, { type ReactElement } from "react";
import { View, type ViewProps } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { useLanguage } from "@/contexts/LanguageContext";

type Props = {
  dateISO: string;
  timeHHMM: string;
  disabled?: boolean;
  onLayout?: ViewProps["onLayout"];
  onPress?: (dateISO: string, timeHHMM: string) => void;
  onLongPress?: (dateISO: string, timeHHMM: string) => void;
  children: ReactElement;
};

/** Empty-slot actions only. Movement cancels recognition before a scroll/drag. */
export function GoCalendarSlot({ dateISO, timeHHMM, disabled = false, onLayout, onPress, onLongPress, children }: Props) {
  const { t } = useLanguage();
  const tap = Gesture.Tap()
    .enabled(!disabled && !!onPress)
    .maxDuration(250)
    .maxDistance(8)
    .runOnJS(true)
    .onEnd((_event, success) => {
      if (success && !disabled) onPress?.(dateISO, timeHHMM);
    });
  const gesture = onLongPress ? Gesture.Exclusive(
    Gesture.LongPress().enabled(!disabled).minDuration(500).maxDistance(8).runOnJS(true)
      .onEnd((_event, success) => { if (success && !disabled) onLongPress(dateISO, timeHHMM); }),
    tap,
  ) : tap;
  return (
    <GestureDetector gesture={gesture}>
      <View
        onLayout={onLayout}
        accessibilityRole="button"
        accessibilityLabel={(onPress ? t("new_task_label") : t("biz_book_btn")) + ": " + dateISO + " " + timeHHMM}
        accessibilityState={{ disabled }}
        accessibilityActions={onLongPress ? [{ name: "longpress", label: t("biz_book_btn") }] : undefined}
        onAccessibilityAction={onLongPress ? event => {
          if (!disabled && event.nativeEvent.actionName === "longpress") onLongPress(dateISO, timeHHMM);
        } : undefined}
      >
        {children}
      </View>
    </GestureDetector>
  );
}
