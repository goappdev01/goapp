import React, { useCallback, useSyncExternalStore } from "react";
import { Text } from "react-native";
import type { GoEntry } from "@/components/AgendaOperativa";
import { describeReminders, type TaskScope } from "@/lib/goTaskReminders";
import { subscribeNativeReminderReports, getNativeReminderReports } from "@/lib/goTaskReminderRuntime";

/** Receipts live only in memory and are rebuilt from the OS after a reload. */
export function GoAlarmStatus({ entry, scope }: { entry: GoEntry; scope: TaskScope | null }) {
  const snapshot = useCallback(() => getNativeReminderReports(scope), [scope?.userId, scope?.context]);
  const reports = useSyncExternalStore(subscribeNativeReminderReports, snapshot, () => getNativeReminderReports(null));
  return <Text testID="note-reminder-sync-status" accessibilityLiveRegion="polite" style={{ color: "#cbd5e1", fontSize: 12 }}>
    {describeReminders(entry, reports)}
  </Text>;
}
