import { useEffect, useRef, useState, useCallback } from "react";
import * as Haptics from "expo-haptics";
import { Platform } from "react-native";
import { getBookings } from "@/data/booking";

const POLL_INTERVAL_MS = 3 * 60 * 1000; // 3 minutes

function playAlertSound() {
  try {
    if (Platform.OS !== "web") return;
    const ACtx: typeof AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!ACtx) return;
    const ctx = new ACtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    // Two-tone ding: C6 → E6
    osc.frequency.setValueAtTime(1046.5, ctx.currentTime);
    osc.frequency.setValueAtTime(1318.5, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.4);
    setTimeout(() => { try { ctx.close(); } catch {} }, 1000);
  } catch {}
}

export function usePendingBookingsAlert(opts: { isActive: boolean; soundEnabled?: boolean }) {
  const { isActive, soundEnabled = true } = opts;
  const [pendingCount, setPendingCount] = useState(0);
  const prevCountRef = useRef<number>(0);
  const soundCooldownRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;

  const refresh = useCallback(async () => {
    if (!isActive) {
      setPendingCount(0);
      prevCountRef.current = 0;
      return;
    }
    try {
      const bookings = await getBookings({ status: ["HOLD"] });
      const count = bookings.length;
      const prev = prevCountRef.current;

      if (count > prev && !soundCooldownRef.current && soundEnabledRef.current) {
        soundCooldownRef.current = true;
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        playAlertSound();
        setTimeout(() => { soundCooldownRef.current = false; }, 8000);
      }

      prevCountRef.current = count;
      setPendingCount(count);
    } catch {}
  }, [isActive]);

  useEffect(() => {
    if (!isActive) {
      setPendingCount(0);
      prevCountRef.current = 0;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    refresh();
    intervalRef.current = setInterval(refresh, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, refresh]);

  return { pendingCount, refresh };
}
