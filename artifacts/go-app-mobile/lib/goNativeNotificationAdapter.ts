import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import type { NativeReminderPorts } from "./goNativeReminderScheduler";

/** Local notifications only: no Expo push token, backend or network request. */
export function createExpoReminderPorts(base: Pick<NativeReminderPorts, "readTasks" | "scopeValid" | "now" | "readCompletionRequests">): NativeReminderPorts {
  const platform = Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "web";
  const channel = (sound: boolean, haptics = true, priority: "standard" | "high" = "standard") =>
    `go-task-reminders-${sound ? "sound" : "visual"}${haptics && priority === "standard" ? "" : `-${haptics ? "haptic" : "quiet"}-${priority}`}`;
  const ensureChannel = async (sound: boolean, haptics = true, priority: "standard" | "high" = "standard") => {
    await Notifications.setNotificationChannelAsync(channel(sound, haptics, priority), {
      name: `GO · Recordatorios${sound ? "" : " sin sonido"}${haptics ? "" : " sin vibración"}`,
      importance: priority === "high" ? Notifications.AndroidImportance.HIGH : Notifications.AndroidImportance.DEFAULT,
      sound: sound ? "default" : null,
      vibrationPattern: haptics ? [0, 250, 250, 250] : [0],
    });
  };
  return {
    ...base, platform,
    async permissions(request) {
      if (platform === "web") return "denied";
      // Android 13 must have a channel before requesting notification permission.
      if (platform === "android") {
        for (const sound of [true, false]) await ensureChannel(sound);
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
      if (platform === "android" && (input.haptics === false || input.priority === "high"))
        await ensureChannel(input.sound, input.haptics, input.priority);
      return Notifications.scheduleNotificationAsync({
        identifier: input.identifier,
        content: {
          title: "Recordatorio GO", body: input.title,
          sound: input.sound ? "default" : false,
          data: { goTaskReminder: true, taskId: input.taskId, minutes: input.minutes,
            userId: input.scope.userId, context: input.scope.context, signature: input.signature,
            ...(input.completion ? { goActionCompletion: true, completionKey: input.completion.key,
              completionSchedule: input.completion.schedule } : {}) },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: input.at,
          ...(platform === "android" ? { channelId: channel(input.sound, input.haptics, input.priority) } : {}) },
      });
    },
    cancel: identifier => Notifications.cancelScheduledNotificationAsync(identifier),
    dismiss: identifier => Notifications.dismissNotificationAsync(identifier),
  };
}

/** A generic local probe; a returned ID proves scheduling, never OS delivery. */
export async function scheduleGoTestNotification(sound: boolean): Promise<"scheduled" | "denied" | "unsupported"> {
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "unsupported";
  const permission = await Notifications.getPermissionsAsync();
  let allowed = permission.ios ? permission.ios.status === Notifications.IosAuthorizationStatus.AUTHORIZED
    || permission.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL : permission.granted;
  if (!allowed && permission.canAskAgain) {
    const requested = await Notifications.requestPermissionsAsync();
    allowed = requested.ios ? requested.ios.status === Notifications.IosAuthorizationStatus.AUTHORIZED
      || requested.ios.status === Notifications.IosAuthorizationStatus.PROVISIONAL : requested.granted;
  }
  if (!allowed) return "denied";
  const identifier = "go-alert-test-v1";
  await Notifications.cancelScheduledNotificationAsync(identifier);
  await Notifications.scheduleNotificationAsync({ identifier,
    content: { title: "GO · Prueba de aviso", body: "Esta es una notificación local de prueba.",
      sound: sound ? "default" : false, data: { goAlertTest: true } },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: Date.now() + 5000 },
  });
  const pending = await Notifications.getAllScheduledNotificationsAsync();
  if (!pending.some(request => request.identifier === identifier)) throw new Error("No se pudo comprobar la programación de prueba.");
  return "scheduled";
}
