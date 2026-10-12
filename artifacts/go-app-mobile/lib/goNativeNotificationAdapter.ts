import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { NativeReminderPorts } from "./goNativeReminderScheduler";

/** Local notifications only: no Expo push token, backend or network request. */
export function createExpoReminderPorts(base: Pick<NativeReminderPorts, "readTasks" | "scopeValid" | "now">): NativeReminderPorts {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  const channel = (sound: boolean) => sound ? "go-task-reminders-sound" : "go-task-reminders-visual";
  return {
    ...base, platform,
    async permissions(request) {
      if (platform === "web") return "denied";
      // Android 13 must have a channel before requesting notification permission.
      if (platform === "android") {
        for (const sound of [true, false]) await Notifications.setNotificationChannelAsync(channel(sound), {
          name: sound ? "GO · Recordatorios" : "GO · Recordatorios sin sonido",
          importance: Notifications.AndroidImportance.HIGH,
          sound: sound ? "default" : null,
          vibrationPattern: sound ? [0, 250, 250, 250] : [0],
        });
      }
      let permission = await Notifications.getPermissionsAsync();
      const allowed = (p: Notifications.NotificationPermissionsStatus) => p.ios
        ? [Notifications.IosAuthorizationStatus.AUTHORIZED, Notifications.IosAuthorizationStatus.PROVISIONAL,
          Notifications.IosAuthorizationStatus.EPHEMERAL].includes(p.ios.status) : p.granted;
      if (!allowed(permission) && request && permission.canAskAgain) {
        permission = await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } });
      }
      if (!allowed(permission)) return "denied";
      if (permission.ios?.allowsAlert === false && permission.ios.allowsDisplayInNotificationCenter === false
        && permission.ios.allowsDisplayOnLockScreen === false) return "denied";
      if (permission.ios && (permission.ios.status !== Notifications.IosAuthorizationStatus.AUTHORIZED
        || permission.ios.allowsSound === false || permission.ios.allowsAlert === false)) return "quiet";
      return "allowed";
    },
    async pending() {
      return (await Notifications.getAllScheduledNotificationsAsync()).map(request => ({
        identifier: request.identifier, data: request.content.data ?? {},
      }));
    },
    async delivered() {
      return (await Notifications.getPresentedNotificationsAsync()).map(notification => ({
        identifier: notification.request.identifier, data: notification.request.content.data ?? {},
      }));
    },
    async schedule(input) {
      return Notifications.scheduleNotificationAsync({
        identifier: input.identifier,
        content: {
          title: "Recordatorio GO", body: input.title,
          sound: input.sound ? "default" : false,
          data: { goTaskReminder: true, taskId: input.taskId, minutes: input.minutes,
            userId: input.scope.userId, context: input.scope.context, signature: input.signature },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.at,
          ...(platform === "android" ? { channelId: channel(input.sound) } : {}) },
      });
    },
    cancel: identifier => Notifications.cancelScheduledNotificationAsync(identifier),
    dismiss: identifier => Notifications.dismissNotificationAsync(identifier),
  };
}
