import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { useGoNotification } from "@/contexts/GoNotificationContext";
import { useAssistantZoneScope } from "@/hooks/useAssistantZoneScope";
import { subscribeGoLog } from "@/lib/goLogStore";
import { onSessionChanged } from "@/lib/sessionEvents";
import { refreshNativeTaskReminders, setNativeTaskReminderScope, suspendNativeTaskReminders,
  openNativeReminderTask, isNativeTaskScopeActive, pauseNativeTaskReminderRuntime } from "@/lib/goTaskReminderRuntime";

/** Invisible lifecycle bridge; the OS delivers scheduled alerts without this process. */
export function GoTaskReminderInitializer() {
  const identity = useAssistantZoneScope();
  const { alertMode } = useGoNotification();
  const current = useRef(identity.ready ? identity.scope : null);
  current.current = identity.ready ? identity.scope : null;
  const activationReady = useRef(false);
  const activationRevision = useRef(0);
  const activationKey = useRef("");
  const nextKey = JSON.stringify([identity.ready, current.current?.userId, current.current?.context, alertMode]);
  if (activationKey.current !== nextKey) { activationKey.current = nextKey; activationReady.current = false; }
  const pendingTap = useRef<Notifications.NotificationResponse | null>(null);
  const consumedTap = useRef<string | null>(null);
  const receivedLiveTap = useRef(false);
  const openingTap = useRef(false);
  const clearedTap = useRef<string | null>(null);
  const clearTap = async (key: string): Promise<void> => {
    if (clearedTap.current === key) return;
    await Notifications.clearLastNotificationResponseAsync();
    clearedTap.current = key;
  };
  const handleTap = async (): Promise<void> => {
    const response = pendingTap.current;
    if (!response || !current.current || !activationReady.current || !isNativeTaskScopeActive(current.current)) return;
    const data = response.notification.request.content.data ?? {};
    if (data.goTaskReminder !== true) { pendingTap.current = null; return; }
    if (data.userId !== current.current.userId || data.context !== current.current.context) {
      pendingTap.current = null; await Notifications.clearLastNotificationResponseAsync(); return;
    }
    const key = response.notification.request.identifier + ":" + response.notification.date;
    if (consumedTap.current === key) { pendingTap.current = null; await clearTap(key); return; }
    if (openingTap.current) return;
    openingTap.current = true;
    try {
      const opened = await openNativeReminderTask(data);
      if (opened) consumedTap.current = key;
      if (pendingTap.current !== response) return;
      if (opened) {
        pendingTap.current = null;
        await clearTap(key);
      } else if (current.current) pendingTap.current = null;
    } finally {
      openingTap.current = false;
      if (pendingTap.current && pendingTap.current !== response) safe(handleTap());
    }
  };
  const safe = (operation: Promise<unknown>) => { void operation.catch(() => console.warn("[GO reminders] Local notification operation failed.")); };
  useEffect(() => {
    const revision = ++activationRevision.current, setupKey = activationKey.current;
    activationReady.current = false;
    safe(setNativeTaskReminderScope(current.current, alertMode).then(report => {
      if (activationRevision.current !== revision || activationKey.current !== setupKey) return;
      if (report.some(item => item.status === "failed")) console.warn("[GO reminders] Native scheduling or cancellation incomplete.");
      activationReady.current = true;
      return handleTap();
    }));
    return () => { ++activationRevision.current; activationReady.current = false; };
  }, [identity.ready, identity.scope?.userId, identity.scope?.context, alertMode]);
  useEffect(() => {
    if (Platform.OS === "web") return;
    const refresh = () => { const scope = current.current; if (scope) safe(refreshNativeTaskReminders(scope)); };
    const unsubscribe = subscribeGoLog(refresh);
    const unsubscribeSession = onSessionChanged(() => {
      ++activationRevision.current; activationReady.current = false;
      current.current = null; pendingTap.current = null;
      safe(suspendNativeTaskReminders());
    });
    const app = AppState.addEventListener("change", state => {
      if (state === "active") { refresh(); safe(handleTap()); }
    });
    const tap = Notifications.addNotificationResponseReceivedListener(response => {
      if (response.notification.request.content.data?.goTaskReminder !== true) return;
      receivedLiveTap.current = true; pendingTap.current = response; safe(handleTap());
    });
    safe(Notifications.getLastNotificationResponseAsync().then(response => {
      if (!receivedLiveTap.current && response?.notification.request.content.data?.goTaskReminder === true) { pendingTap.current = response; return handleTap(); }
    }));
    return () => {
      ++activationRevision.current; activationReady.current = false; pendingTap.current = null;
      unsubscribe(); unsubscribeSession(); app.remove(); tap.remove(); pauseNativeTaskReminderRuntime();
    };
    // Cleanup removes JS listeners, never OS reminders on a normal app closure.
  }, []);
  return null;
}
