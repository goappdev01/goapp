/**
 * GoNotificationContext — Motor unificado de alertas GO
 *
 * Tres modos globales simples (ON/OFF toggles):
 *   sound  → globo flotante + sonido + vibración
 *   visual → solo globo flotante (sin sonido)
 *   silent → silencio total
 *
 * Cadena de recordatorios automáticos por evento:
 *   t=0      → aviso inmediato
 *   t=+15min → segundo aviso (si sigue pendiente)
 *   t=+60min → tercer aviso (si sigue pendiente)
 *   t=+60min+N → avisos periódicos cada 3 min (intervalRef existente)
 *
 * Al resolver un evento → se cancelan TODOS los recordatorios.
 * fireEvent() sólo arranca nuevos timers si el evento no estaba ya pendiente.
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  Animated,
  Platform,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Types ─────────────────────────────────────────────────────────────────────

export type AlertMode = "sound" | "visual" | "silent";

export type GoAlertEventKind =
  | "booking"    // reserva de cliente
  | "solicitud"  // solicitud de reunión / disponibilidad
  | "go"         // GO entre usuarios
  | "pedido"     // pedido de marketplace
  | "visita";    // visita comercial

export interface GoAlertEvent {
  id:        string;
  kind:      GoAlertEventKind;
  title:     string;
  count:     number;
  createdAt: number;
}

interface FireEventInput {
  kind:   GoAlertEventKind;
  title:  string;
  count?: number;
}

interface GoNotificationContextValue {
  alertMode:      AlertMode;
  setAlertMode:   (m: AlertMode) => void;
  // notify — actualiza contadores, no arranca recordatorios
  notify:         (event: FireEventInput) => void;
  // fireEvent — notifica INMEDIATAMENTE + programa recordatorios +15min/+60min
  fireEvent:      (event: FireEventInput) => void;
  pendingEvents:  GoAlertEvent[];
  // resolveByKind — solo limpia el estado (sin cancelar timers)
  resolveByKind:  (kind: GoAlertEventKind) => void;
  // resolveEvent — limpia estado + cancela todos los recordatorios del evento
  resolveEvent:   (kind: GoAlertEventKind) => void;
  resolveAll:     () => void;
  totalPending:   number;
  soundEnabled:   boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ALERT_MODE_KEY     = "go_alert_mode_v1";
const REMINDER_INTERVAL  = 3 * 60 * 1000;        // 3 min — avisos periódicos
const REMINDER_15MIN     = 15 * 60 * 1000;
const REMINDER_60MIN     = 60 * 60 * 1000;

// ── Sound ─────────────────────────────────────────────────────────────────────

function playGoAlertSound() {
  try {
    if (Platform.OS !== "web") return;
    const ACtx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!ACtx) return;
    const ctx  = new ACtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
    osc.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.12);
    gain.gain.setValueAtTime(0.22, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.48);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.48);
    setTimeout(() => { try { ctx.close(); } catch {} }, 1200);
  } catch {}
}

// ── Context ───────────────────────────────────────────────────────────────────

const GoNotificationContext = createContext<GoNotificationContextValue>({
  alertMode:     "sound",
  setAlertMode:  () => {},
  notify:        () => {},
  fireEvent:     () => {},
  pendingEvents: [],
  resolveByKind: () => {},
  resolveEvent:  () => {},
  resolveAll:    () => {},
  totalPending:  0,
  soundEnabled:  true,
});

// ── Provider ──────────────────────────────────────────────────────────────────

export function GoNotificationProvider({ children }: { children: React.ReactNode }) {
  const [alertMode,     setAlertModeState] = useState<AlertMode>("sound");
  const [pendingEvents, setPendingEvents]  = useState<GoAlertEvent[]>([]);

  const alertModeRef     = useRef<AlertMode>("sound");
  alertModeRef.current   = alertMode;

  // Ref que espeja el estado para uso dentro de timeouts (evita stale closure)
  const pendingEventsRef = useRef<GoAlertEvent[]>([]);
  useEffect(() => { pendingEventsRef.current = pendingEvents; }, [pendingEvents]);

  // Timers de recordatorios por kind: kind → [timeout15, timeout60]
  const reminderTimers  = useRef<Map<GoAlertEventKind, ReturnType<typeof setTimeout>[]>>(new Map());

  const soundCooldownRef = useRef(false);
  const intervalRef      = useRef<ReturnType<typeof setInterval> | null>(null);

  // Carga el modo guardado al arrancar
  useEffect(() => {
    AsyncStorage.getItem(ALERT_MODE_KEY).then(raw => {
      if (raw === "sound" || raw === "visual" || raw === "silent") {
        setAlertModeState(raw);
      }
    }).catch(() => {});
  }, []);

  const setAlertMode = useCallback((m: AlertMode) => {
    setAlertModeState(m);
    AsyncStorage.setItem(ALERT_MODE_KEY, m).catch(() => {});
  }, []);

  // Dispara el aviso sensorial (sonido + vibración) respetando el modo actual
  const triggerAlert = useCallback(() => {
    const mode = alertModeRef.current;
    if (mode === "silent") return;
    if (mode === "sound" && !soundCooldownRef.current) {
      soundCooldownRef.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
      playGoAlertSound();
      setTimeout(() => { soundCooldownRef.current = false; }, 8_000);
    }
  }, []);

  // notify — actualiza el estado del evento, dispara aviso si hay novedad
  const notify = useCallback((event: FireEventInput) => {
    const count = event.count ?? 1;
    if (count <= 0) {
      setPendingEvents(prev => prev.filter(e => e.kind !== event.kind));
      return;
    }
    setPendingEvents(prev => {
      const existing = prev.find(e => e.kind === event.kind);
      if (existing) {
        const isNew = count > existing.count;
        if (isNew) triggerAlert();
        return prev.map(e =>
          e.kind === event.kind
            ? { ...e, title: event.title, count, createdAt: isNew ? Date.now() : e.createdAt }
            : e,
        );
      }
      triggerAlert();
      return [
        ...prev,
        { id: `${event.kind}-${Date.now()}`, kind: event.kind, title: event.title, count, createdAt: Date.now() },
      ];
    });
  }, [triggerAlert]);

  // fireEvent — notifica + arranca cadena de recordatorios (solo si no había uno previo)
  const fireEvent = useCallback((event: FireEventInput) => {
    const count = event.count ?? 1;
    if (count <= 0) {
      // Count cayó a 0 → resolver sin timers nuevos
      return;
    }

    const alreadyPending = pendingEventsRef.current.some(e => e.kind === event.kind);

    // Siempre actualizar la burbuja (el count puede haber subido)
    notify(event);

    if (!alreadyPending) {
      // Primera ocurrencia → arrancar cadena 15min → 60min
      const kind = event.kind;
      const scheduleReminder = (delay: number) => {
        return setTimeout(() => {
          // Solo avisar si el evento sigue pendiente
          if (pendingEventsRef.current.some(e => e.kind === kind)) {
            triggerAlert();
          }
        }, delay);
      };

      const t15 = scheduleReminder(REMINDER_15MIN);
      const t60 = scheduleReminder(REMINDER_60MIN);
      reminderTimers.current.set(kind, [t15, t60]);
    }
  }, [notify, triggerAlert]);

  const resolveByKind = useCallback((kind: GoAlertEventKind) => {
    setPendingEvents(prev => prev.filter(e => e.kind !== kind));
  }, []);

  // resolveEvent — limpia estado + cancela todos los recordatorios
  const resolveEvent = useCallback((kind: GoAlertEventKind) => {
    resolveByKind(kind);
    const timers = reminderTimers.current.get(kind) ?? [];
    timers.forEach(t => clearTimeout(t));
    reminderTimers.current.delete(kind);
  }, [resolveByKind]);

  const resolveAll = useCallback(() => {
    setPendingEvents([]);
    reminderTimers.current.forEach(timers => timers.forEach(t => clearTimeout(t)));
    reminderTimers.current.clear();
  }, []);

  const totalPending = pendingEvents.reduce((acc, e) => acc + e.count, 0);

  // Recordatorio periódico cada 3 min — solo para eventos que requieren acción real.
  // Los pedidos ya están cubiertos por push + toast: pingear cada 3 min por un
  // pedido "en preparación" viola la filosofía GO (no interrumpir sin valor real).
  const pendingLen = pendingEvents.length;
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const actionEvents = pendingEventsRef.current.filter(e => e.kind !== "pedido");
      if (actionEvents.length > 0) triggerAlert();
    }, REMINDER_INTERVAL);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [pendingLen, triggerAlert]);

  return (
    <GoNotificationContext.Provider value={{
      alertMode,
      setAlertMode,
      notify,
      fireEvent,
      pendingEvents,
      resolveByKind,
      resolveEvent,
      resolveAll,
      totalPending,
      soundEnabled: alertMode === "sound",
    }}>
      {children}
    </GoNotificationContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useGoNotification() {
  return useContext(GoNotificationContext);
}

// ── Kind metadata ─────────────────────────────────────────────────────────────

const KIND_META: Record<GoAlertEventKind, { icon: string; color: string; label: string }> = {
  booking:   { icon: "calendar",  color: "#4A80BD", label: "Reserva"  },
  solicitud: { icon: "clock",     color: "#7C69BE", label: "Reunión"  },
  go:        { icon: "send",      color: "#3D9A84", label: "GO"       },
  pedido:    { icon: "package",   color: "#C4883A", label: "Pedido"   },
  visita:    { icon: "home",      color: "#f97316", label: "Visita"   },
};

// ── GoAlertBubble ─────────────────────────────────────────────────────────────
// Globo flotante — aparece cuando hay eventos pendientes en modo no silencioso.
// No requiere interacción; desaparece cuando todos los eventos se resuelven.

export function GoAlertBubble() {
  const { pendingEvents, alertMode, totalPending } = useGoNotification();
  const insets    = useSafeAreaInsets();
  const slideAnim = useRef(new Animated.Value(-80)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const loopRef   = useRef<ReturnType<typeof Animated.loop> | null>(null);

  const visible = pendingEvents.length > 0 && alertMode !== "silent";

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: visible ? 0 : -80,
      useNativeDriver: true, tension: 72, friction: 11,
    }).start();

    if (loopRef.current) { loopRef.current.stop(); loopRef.current = null; }
    if (visible) {
      loopRef.current = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.035, duration: 1000, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0,   duration: 1000, useNativeDriver: true }),
        ]),
      );
      loopRef.current.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => { if (loopRef.current) { loopRef.current.stop(); loopRef.current = null; } };
  }, [visible]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[bs.wrapper, { top: insets.top + 8, transform: [{ translateY: slideAnim }, { scale: pulseAnim }] }]}
    >
      <View style={bs.pill}>
        <View style={bs.kindsRow}>
          {pendingEvents.map(ev => {
            const m = KIND_META[ev.kind];
            return (
              <View key={ev.kind} style={[bs.kindChip, { backgroundColor: m.color + "18", borderColor: m.color + "45" }]}>
                <Feather name={m.icon as any} size={10} color={m.color} />
                <Text style={[bs.kindCount, { color: m.color }]}>{ev.count > 9 ? "9+" : ev.count}</Text>
              </View>
            );
          })}
        </View>
        <View style={bs.sep} />
        <View style={bs.totalRow}>
          <View style={bs.totalBadge}>
            <Text style={bs.totalTxt}>{totalPending > 99 ? "99+" : totalPending}</Text>
          </View>
          <Feather name={alertMode === "sound" ? "bell" : "eye"} size={11} color="rgba(0,0,0,0.28)" />
        </View>
      </View>
    </Animated.View>
  );
}

// ── GoAlertModePicker — 3 toggles ON/OFF ─────────────────────────────────────
// Diseño simple: cada toggle controla uno de los tres estados de alerta.
// Sin opciones complejas. Configurable en < 5 segundos.

function ToggleRow({
  icon, label, sub, value, color, disabled, onToggle,
}: {
  icon: string; label: string; sub: string;
  value: boolean; color: string; disabled?: boolean;
  onToggle: () => void;
}) {
  return (
    <View style={[mp.row, disabled && { opacity: 0.40 }]}>
      <View style={[mp.iconWrap, { backgroundColor: value && !disabled ? color + "18" : "rgba(0,0,0,0.04)" }]}>
        <Feather name={icon as any} size={16} color={value && !disabled ? color : "#9CA3AF"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[mp.label, value && !disabled && { color, fontWeight: "700" }]}>{label}</Text>
        <Text style={mp.sub}>{sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={disabled ? undefined : onToggle}
        thumbColor={"#fff"}
        trackColor={{ false: "rgba(0,0,0,0.12)", true: color }}
        ios_backgroundColor="rgba(0,0,0,0.10)"
        disabled={disabled}
      />
    </View>
  );
}

export function GoAlertModePicker() {
  const { alertMode, setAlertMode } = useGoNotification();
  const BLUE = "#4A80BD";
  const RED  = "#EF4444";

  const visualOn = alertMode !== "silent";
  const soundOn  = alertMode === "sound";
  const silentOn = alertMode === "silent";

  const toggleVisual = () => {
    Haptics.selectionAsync().catch(() => {});
    // ON → modo visual mínimo; OFF → silencio total
    setAlertMode(visualOn ? "silent" : (soundOn ? "sound" : "visual"));
  };

  const toggleSound = () => {
    Haptics.selectionAsync().catch(() => {});
    if (soundOn) setAlertMode("visual");
    else setAlertMode("sound");
  };

  const toggleSilent = () => {
    Haptics.selectionAsync().catch(() => {});
    setAlertMode(silentOn ? "visual" : "silent");
  };

  return (
    <View style={mp.wrap}>

      {/* 🔔 Alertas visuales */}
      <ToggleRow
        icon="eye"
        label="Alertas visuales"
        sub="Muestra el globo de avisos"
        value={visualOn}
        color={BLUE}
        onToggle={toggleVisual}
      />

      <View style={mp.divider} />

      {/* 🔊 Sonidos */}
      <ToggleRow
        icon="bell"
        label="Sonidos"
        sub={visualOn ? "Sonido + vibración en cada aviso" : "Activa alertas visuales primero"}
        value={soundOn}
        color={BLUE}
        disabled={!visualOn}
        onToggle={toggleSound}
      />

      <View style={mp.divider} />

      {/* 🔕 Silenciar todo */}
      <ToggleRow
        icon="bell-off"
        label="Silenciar todo"
        sub="Sin globos, sin sonido, sin vibración"
        value={silentOn}
        color={RED}
        onToggle={toggleSilent}
      />

    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const bs = StyleSheet.create({
  wrapper: {
    position: "absolute", left: 0, right: 0, alignItems: "center", zIndex: 9999,
  },
  pill: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 12, paddingVertical: 7,
    backgroundColor: "#FFFFFF", borderRadius: 28,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)",
    shadowColor: "#000", shadowOpacity: 0.10, shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 }, elevation: 7,
  },
  kindsRow:  { flexDirection: "row", alignItems: "center", gap: 5 },
  kindChip:  { flexDirection: "row", alignItems: "center", gap: 3, paddingHorizontal: 7, paddingVertical: 4, borderRadius: 9, borderWidth: 1 },
  kindCount: { fontSize: 10, fontWeight: "800" },
  sep:       { width: 1, height: 16, backgroundColor: "rgba(0,0,0,0.08)" },
  totalRow:  { flexDirection: "row", alignItems: "center", gap: 5 },
  totalBadge: { backgroundColor: "#111827", borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 22, alignItems: "center" },
  totalTxt:   { color: "#fff", fontSize: 10, fontWeight: "900", letterSpacing: 0.3 },
});

const mp = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF", borderRadius: 16,
    borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", overflow: "hidden",
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 14, paddingVertical: 13,
  },
  divider: { height: 1, backgroundColor: "rgba(0,0,0,0.06)", marginHorizontal: 14 },
  iconWrap: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  label:    { fontSize: 13, fontWeight: "600", color: "#111827" },
  sub:      { fontSize: 11, color: "#9CA3AF", marginTop: 1 },
});
