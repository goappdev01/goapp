/**
 * GoPushService
 * Push notifications reales para GO — obedece el AlertMode existente.
 *
 * Sin configuraciones nuevas. El usuario ya eligió su modo:
 *   "sound"  → OS notification con sonido + in-app bubble
 *   "visual" → OS notification sin sonido + in-app bubble
 *   "silent" → Todo suprimido
 *
 * Al arrancar registra el token Expo en el API server para que
 * el backend pueda disparar notificaciones desde cualquier evento
 * (reservas, pedidos, GOs, reuniones, visitas) sin sistemas separados.
 */

import React, { useEffect, useRef } from "react";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";

import {
  AlertMode,
  GoAlertEventKind,
  useGoNotification,
} from "@/contexts/GoNotificationContext";

// ── Config ────────────────────────────────────────────────────────────────────

const PUSH_TOKEN_KEY  = "go_push_token_v1";
const DEVICE_ID_KEY   = "go_device_id_v1";
const ALERT_MODE_KEY  = "go_alert_mode_v1";

// URL base del API server (proxy Replit enruta /api al api-server artifact)
const API_BASE = process.env.EXPO_PUBLIC_DOMAIN
  ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
  : "/api";

// ── Payload shape (compartido con el backend) ─────────────────────────────────

export interface GoPushPayload {
  kind:   GoAlertEventKind;
  title:  string;
  count?: number;
}

// ── Notification handler (OS level) ──────────────────────────────────────────
// En foreground suprimimos la notificación del SO — GoAlertBubble la maneja.
// En background/muerto el SO la entrega respetando el AlertMode guardado.

// En Expo Go SDK 53+ expo-notifications está parcialmente deshabilitado.
// Envolvemos en try-catch para evitar crash al inicializar el módulo.
try {
  Notifications.setNotificationHandler({
    handleNotification: async () => {
      const raw  = await AsyncStorage.getItem(ALERT_MODE_KEY);
      const mode: AlertMode =
        raw === "sound" || raw === "visual" || raw === "silent" ? raw : "sound";

      if (mode === "silent") {
        return { shouldShowAlert: false, shouldPlaySound: false, shouldSetBadge: false };
      }
      if (mode === "visual") {
        return { shouldShowAlert: true,  shouldPlaySound: false, shouldSetBadge: false };
      }
      return { shouldShowAlert: true, shouldPlaySound: true, shouldSetBadge: true };
    },
  });
} catch (_) {
  // expo-notifications no disponible en este entorno (ej. Expo Go SDK 53+)
}

// ── Device ID estable ─────────────────────────────────────────────────────────

async function getOrCreateDeviceId(): Promise<string> {
  const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
  if (stored) return stored;
  const id = `go-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await AsyncStorage.setItem(DEVICE_ID_KEY, id);
  return id;
}

// ── Registro en el API server ─────────────────────────────────────────────────

async function syncTokenWithServer(token: string): Promise<void> {
  try {
    const deviceId = await getOrCreateDeviceId();
    const res = await fetch(`${API_BASE}/notifications/register`, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ deviceId, token }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.warn("[GO Push] Registro fallido:", text);
    } else {
      console.log("[GO Push] Token sincronizado con el servidor");
    }
  } catch (err) {
    // Sin conexión — no es crítico, el push volverá cuando haya red
    console.warn("[GO Push] No se pudo sincronizar token:", err);
  }
}

// ── Registro del dispositivo ──────────────────────────────────────────────────

export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  if (!Device.isDevice) {
    console.log("[GO Push] Simulador — token omitido");
    return null;
  }

  try {
    const { status: existing } = await Notifications.getPermissionsAsync();
    let finalStatus = existing;

    if (existing !== "granted") {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== "granted") {
      console.log("[GO Push] Permiso denegado");
      return null;
    }

    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("go-alerts", {
        name:              "GO Alerts",
        importance:        Notifications.AndroidImportance.HIGH,
        vibrationPattern:  [0, 250, 250, 250],
        lightColor:        "#4A80BD",
        sound:             "default",
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
    const token     = tokenData.data;

    await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
    await syncTokenWithServer(token);

    return token;
  } catch (err) {
    console.log("[GO Push] Error al registrar:", err);
    return null;
  }
}

export async function getStoredPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(PUSH_TOKEN_KEY);
}

// ── Marketplace push notifications ────────────────────────────────────────────
// Fires a local OS notification for marketplace order status changes.
// Handles deduplication per order+status so the same event is never shown twice.
// On web (Expo web preview) this is a no-op — GoAlertBubble covers that case.

const _firedMktNotifs = new Set<string>();

export async function fireMarketplacePush(
  orderId:   string,
  status:    string,
  body:      string,
  alertMode: AlertMode,
): Promise<void> {
  if (alertMode === "silent") return;
  if (Platform.OS === "web")  return;

  const key = `${orderId}::${status}`;
  if (_firedMktNotifs.has(key)) return;
  _firedMktNotifs.add(key);

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("go-marketplace", {
        name:             "GO Pedidos",
        importance:       Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 200, 100, 200],
        lightColor:       "#C4883A",
        sound:            alertMode === "sound" ? "default" : undefined,
      });
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "GO Marketplace",
        body,
        sound:  alertMode === "sound" ? "default" : undefined,
        data:   { kind: "pedido", orderId, status },
        ...(Platform.OS === "android" ? { channelId: "go-marketplace" } : {}),
      },
      trigger: null,
    });
  } catch (err) {
    console.warn("[GO Push] Marketplace push failed:", err);
  }
}

export function clearMarketplacePushCache(orderId: string): void {
  for (const key of _firedMktNotifs) {
    if (key.startsWith(`${orderId}::`)) _firedMktNotifs.delete(key);
  }
}

// ── GoPushInitializer ─────────────────────────────────────────────────────────
// Componente invisible — debe estar DENTRO de GoNotificationProvider.
// Enruta pushes entrantes al notify() existente → GoAlertBubble.

export function GoPushInitializer() {
  const { notify, alertMode } = useGoNotification();
  const foregroundSub = useRef<Notifications.EventSubscription | null>(null);
  const responseSub   = useRef<Notifications.EventSubscription | null>(null);

  useEffect(() => {
    registerForPushNotifications().catch(() => {});

    // Foreground: push llega mientras la app está abierta
    foregroundSub.current = Notifications.addNotificationReceivedListener(
      (notification) => {
        if (alertMode === "silent") return;
        const data = notification.request.content.data as Partial<GoPushPayload>;
        if (!data?.kind) return;
        notify({
          kind:  data.kind,
          title: data.title ?? notification.request.content.title ?? "GO",
          count: data.count ?? 1,
        });
      },
    );

    // Tap en notificación de background → registrar evento en el sistema
    responseSub.current = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Partial<GoPushPayload>;
        if (!data?.kind) return;
        notify({
          kind:  data.kind,
          title: data.title ?? response.notification.request.content.title ?? "GO",
          count: data.count ?? 1,
        });
      },
    );

    return () => {
      foregroundSub.current?.remove();
      responseSub.current?.remove();
    };
  }, [alertMode, notify]);

  return null;
}
