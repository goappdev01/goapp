/**
 * useGoCalendarFlow — Flujo universal de calendario GO.
 *
 * FLUJO ÚNICO para todos los módulos:
 *   open() → cuadrícula de días → reloj → (AM/PM?) → duración → onSave()
 *
 * Sin lógica de módulo: el caller decide qué hacer en onSave.
 * Las acciones posteriores (mover ficha, proponer cambio, crear GO, etc.)
 * son responsabilidad del caller, NO del calendario.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated } from "react-native";
import * as Haptics from "expo-haptics";
import { getToday, formatISODate, formatDayLabel } from "@/lib/time";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CalFlowResult = {
  dateISO: string;
  dateDraft: string;
  time: string;
  duration: string;
};

export type CalFlowStep = "idle" | "date" | "clock" | "ampm" | "duration" | "nav";

export type CalFlowOpenOpts = {
  /** "date" (default): empieza con cuadrícula de días.
   *  "clock": salta directamente al reloj (uso en drag-to-day). */
  startAt?: "date" | "clock";
  initialDateISO?: string;
  initialDateDraft?: string;
  initialTime?: string;
  initialDuration?: string;
  /** Cuando true, salta el paso de duración y finaliza directamente
   *  después de la selección de hora. La duración usada es initialDuration. */
  skipDuration?: boolean;
  /** Acción posterior específica del módulo — el calendario no la conoce. */
  onSave: (result: CalFlowResult) => void;
  onCancel?: () => void;
  /** Overrides el comportamiento por defecto de SALTAR HORA (ir a duración).
   *  Útil para flujos de quick-data que redirigen a otro selector. */
  onSkipTime?: () => void;
  /**
   * Validación opcional que se ejecuta ANTES de llamar onSave.
   * Recibe el resultado completo y devuelve:
   *   - null       → válido, el flujo finaliza normalmente.
   *   - string     → mensaje de error; el flujo se detiene, muestra el aviso
   *                  y mantiene el panel de duración abierto para que el
   *                  usuario pueda elegir una fecha/hora diferente.
   * El caller NO necesita reabrir el flujo: el hook lo gestiona internamente.
   */
  validate?: (result: CalFlowResult) => string | null;
};

export type CalFlowNavOpts = {
  initialDateISO?: string;
  /** Callback al seleccionar día — sin avanzar a reloj ni duración. */
  onDaySelect: (iso: string) => void;
};

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGoCalendarFlow() {
  // ── Estado lógico del flujo ─────────────────────────────────────────────
  const [step, setStep] = useState<CalFlowStep>("idle");
  /** Modo de la cuadrícula: flow (normal), correction (corrección de fecha
   *  desde el panel de duración), nav (solo navegación, sin reloj). */
  const [monthGridMode, setMonthGridMode] = useState<"flow" | "correction" | "nav">("flow");

  // ── Visibilidad (incluye animación de cierre) ────────────────────────────
  const [monthGridOpen, setMonthGridOpen] = useState(false);
  const [clockOpen, setClockOpen]         = useState(false);
  const [panelOpen, setPanelOpen]         = useState(false);

  // ── Borradores de fecha/hora/duración ───────────────────────────────────
  const [dateISO,   setDateISO]   = useState(() => formatISODate(getToday()));
  const [dateDraft, setDateDraft] = useState("");
  const [time,      setTime]      = useState("");
  const [duration,  setDuration]  = useState("");

  // ── Estado del reloj ─────────────────────────────────────────────────────
  const [clockH12,    setClockH12]    = useState(12);
  const [clockMins,   setClockMins]   = useState(0);
  const [clockPeriod, setClockPeriod] = useState<"AM" | "PM" | null>(null);
  const [clockPhase,  setClockPhase]  = useState<"hours" | "minutes">("hours");
  const clockLastHaptic = useRef(-1);

  // ── Estado de la cuadrícula mensual ─────────────────────────────────────
  const [monthGridYear,  setMonthGridYear]  = useState(() => getToday().getFullYear());
  const [monthGridMonth, setMonthGridMonth] = useState(() => getToday().getMonth());

  // ── Error ────────────────────────────────────────────────────────────────
  const [calError, setCalError] = useState<string | null>(null);

  // ── Animaciones ──────────────────────────────────────────────────────────
  const monthGridSlide = useRef(new Animated.Value(600)).current;
  const monthSlideX    = useRef(new Animated.Value(0)).current;
  const clockSlide     = useRef(new Animated.Value(600)).current;

  // ── Callbacks del caller ─────────────────────────────────────────────────
  const onSaveRef       = useRef<(r: CalFlowResult) => void>(() => {});
  const onCancelRef     = useRef<() => void>(() => {});
  const onSkipTimeRef   = useRef<(() => void) | null>(null);
  const onNavSelectRef  = useRef<(iso: string) => void>(() => {});
  const onValidateRef   = useRef<((r: CalFlowResult) => string | null) | null>(null);

  // ── skipDuration — cuando true, finaliza después de hora sin mostrar duración ─
  const skipDurationRef   = useRef(false);
  const flowSnapshotRef   = useRef<{ dateISO: string; dateDraft: string; duration: string }>({ dateISO: "", dateDraft: "", duration: "" });

  // ── Slide-in animations ──────────────────────────────────────────────────
  useEffect(() => {
    if (monthGridOpen) {
      monthGridSlide.setValue(600);
      Animated.timing(monthGridSlide, { toValue: 0, duration: 230, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthGridOpen]);

  useEffect(() => {
    if (clockOpen) {
      clockSlide.setValue(600);
      Animated.timing(clockSlide, { toValue: 0, duration: 230, useNativeDriver: true }).start();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clockOpen]);

  // ── Helpers privados ─────────────────────────────────────────────────────

  const _closeMonthGrid = useCallback((onDone?: () => void) => {
    Animated.timing(monthGridSlide, { toValue: 600, duration: 200, useNativeDriver: true })
      .start(() => { setMonthGridOpen(false); onDone?.(); });
  }, [monthGridSlide]);

  const _closeClock = useCallback((onDone?: () => void) => {
    Animated.timing(clockSlide, { toValue: 600, duration: 200, useNativeDriver: true })
      .start(() => { setClockOpen(false); onDone?.(); });
  }, [clockSlide]);

  const _initClock = useCallback((initialTime: string) => {
    const m = (initialTime || "").match(/^(\d{1,2}):(\d{2})$/);
    if (m) {
      const h = parseInt(m[1], 10);
      const p: "AM" | "PM" = h >= 12 ? "PM" : "AM";
      let h12 = h % 12;
      if (h12 === 0) h12 = 12;
      setClockH12(h12);
      setClockMins(parseInt(m[2], 10));
      setClockPeriod(p);
    } else {
      setClockH12(12);
      setClockMins(0);
      setClockPeriod(null);
    }
    setClockPhase("hours");
    clockLastHaptic.current = -1;
  }, []);

  // ── API pública ───────────────────────────────────────────────────────────

  /**
   * Intenta finalizar el flujo: ejecuta validate (si existe) y, si pasa,
   * llama onSave. Si falla: muestra el error y mantiene el panel abierto.
   * Uso interno de selectDuration y skip.
   */
  const _tryFinalize = useCallback((result: CalFlowResult) => {
    const err = onValidateRef.current ? onValidateRef.current(result) : null;
    if (err !== null) {
      // Validación fallida — mostrar aviso, NO cerrar el panel ni llamar onSave
      setCalError(err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      // Asegurar que el panel de duración siga visible
      setStep("duration");
      setPanelOpen(true);
      return;
    }
    // Validación ok — completar flujo normalmente
    setStep("idle");
    setPanelOpen(false);
    setCalError(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => onSaveRef.current(result), 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const open = useCallback((opts: CalFlowOpenOpts) => {
    onSaveRef.current     = opts.onSave;
    onCancelRef.current   = opts.onCancel ?? (() => {});
    onSkipTimeRef.current = opts.onSkipTime ?? null;
    onValidateRef.current = opts.validate ?? null;
    skipDurationRef.current = opts.skipDuration ?? false;

    const iso = opts.initialDateISO || formatISODate(getToday());
    const initDraft = opts.initialDateDraft ?? "";
    const initDur   = opts.initialDuration  ?? "";
    flowSnapshotRef.current = { dateISO: iso, dateDraft: initDraft, duration: initDur };

    setDateISO(iso);
    setDateDraft(initDraft);
    setTime(opts.initialTime ?? "");
    setDuration(initDur);
    setCalError(null);

    if (opts.startAt === "clock") {
      _initClock(opts.initialTime ?? "");
      setStep("clock");
      setClockOpen(true);
    } else {
      const base = new Date(iso + "T00:00:00");
      setMonthGridYear(base.getFullYear());
      setMonthGridMonth(base.getMonth());
      setMonthGridMode("flow");
      setStep("date");
      setMonthGridOpen(true);
    }
  }, [_initClock]);

  /** Abre solo la cuadrícula de días para navegación (no avanza a reloj ni duración).
   *  Uso: GO Reservas necesita navegar a un día sin flujo de creación. */
  const openForNav = useCallback((opts: CalFlowNavOpts) => {
    onNavSelectRef.current = opts.onDaySelect;
    const iso = opts.initialDateISO || formatISODate(getToday());
    const base = new Date(iso + "T00:00:00");
    setMonthGridYear(base.getFullYear());
    setMonthGridMonth(base.getMonth());
    setMonthGridMode("nav");
    setStep("nav");
    setMonthGridOpen(true);
  }, []);

  /** Cierra el flujo cancelando (revierte en el caller via onCancel). */
  const cancel = useCallback(() => {
    // Limpiar el callback ANTES de invocarlo para romper cualquier ciclo
    // de re-entrada (p.ej. cancelMoveFlow → cancel → onCancel → cancelMoveFlow).
    const cb = onCancelRef.current;
    onCancelRef.current = () => {};
    setStep("idle");
    setMonthGridOpen(false);
    setClockOpen(false);
    setPanelOpen(false);
    cb?.();
  }, []);

  /** Cierra la cuadrícula sin avanzar (botón X o swipe-down). */
  const closeMonthGridManual = useCallback(() => {
    _closeMonthGrid(() => {
      setStep("idle");
    });
  }, [_closeMonthGrid]);

  // ── Toque en día de la cuadrícula ────────────────────────────────────────

  /** Llamado cuando el usuario toca un día en la cuadrícula.
   *  Comportamiento según monthGridMode:
   *    nav        → cierra y llama onDaySelect
   *    correction → actualiza fecha y vuelve a duración
   *    flow       → actualiza fecha, cierra cuadrícula y ABRE RELOJ (flujo universal) */
  const handleDayTap = useCallback((iso: string) => {
    Haptics.selectionAsync().catch(() => {});
    const todayISO = formatISODate(getToday());
    const d = new Date(iso + "T00:00:00");
    const label = iso === todayISO ? "HOY" : formatDayLabel(d);

    if (monthGridMode === "nav") {
      _closeMonthGrid(() => {
        setStep("idle");
        onNavSelectRef.current(iso);
      });
      return;
    }

    setDateISO(iso);
    setDateDraft(label);
    setCalError(null);
    // Keep snapshot in sync so skipDuration paths (_tryFinalize via flowSnapshotRef)
    // always carry the date the user actually picked, not the initial date from open().
    flowSnapshotRef.current = { ...flowSnapshotRef.current, dateISO: iso, dateDraft: label };

    if (monthGridMode === "correction") {
      // El usuario corrigió la fecha desde el panel de duración
      _closeMonthGrid(() => {
        setMonthGridMode("flow");
        setStep("duration");
        setPanelOpen(true);
      });
      return;
    }

    // Modo flow: fecha seleccionada → cerrar cuadrícula → abrir reloj
    _closeMonthGrid(() => {
      _initClock(time);
      setStep("clock");
      setClockOpen(true);
    });
  }, [monthGridMode, time, _closeMonthGrid, _initClock]);

  // ── Navegación de mes ─────────────────────────────────────────────────────

  const navigateMonth = useCallback((delta: number) => {
    Haptics.selectionAsync().catch(() => {});
    const outX = delta > 0 ? -380 : 380;
    const inX  = delta > 0 ?  380 : -380;
    Animated.timing(monthSlideX, { toValue: outX, duration: 180, useNativeDriver: true }).start(() => {
      if (delta === 1) {
        if (monthGridMonth === 11) { setMonthGridMonth(0); setMonthGridYear(y => y + 1); }
        else setMonthGridMonth(m => m + 1);
      } else {
        if (monthGridMonth === 0) { setMonthGridMonth(11); setMonthGridYear(y => y - 1); }
        else setMonthGridMonth(m => m - 1);
      }
      monthSlideX.setValue(inX);
      Animated.spring(monthSlideX, { toValue: 0, useNativeDriver: true, tension: 130, friction: 15 }).start();
    });
  }, [monthGridMonth, monthSlideX]);

  // ── Interacción con el reloj ──────────────────────────────────────────────

  /** Procesa el toque en la esfera del reloj (hora y minutos). */
  const handleClockTouch = useCallback((relX: number, relY: number, isRelease: boolean, CLOCK_R: number) => {
    const dx = relX - CLOCK_R;
    const dy = relY - CLOCK_R;
    if (Math.sqrt(dx * dx + dy * dy) < 18) return;
    const angle = ((Math.atan2(dx, -dy) * 180 / Math.PI) + 360) % 360;

    if (clockPhase === "hours") {
      const rawH = Math.round(angle / 30);
      const h = rawH === 0 ? 12 : rawH;
      if (h !== clockLastHaptic.current) {
        Haptics.selectionAsync().catch(() => {});
        clockLastHaptic.current = h;
      }
      setClockH12(h);
      const h24 = (h % 12) + (clockPeriod === "PM" ? 12 : 0);
      setTime(`${String(h24).padStart(2, "0")}:${String(clockMins).padStart(2, "0")}`);
      if (isRelease) {
        clockLastHaptic.current = -1;
        setTimeout(() => setClockPhase("minutes"), 120);
      }
    } else {
      const rawMins = Math.round(angle / 6) % 60;
      if (rawMins !== clockLastHaptic.current) {
        Haptics.selectionAsync().catch(() => {});
        clockLastHaptic.current = rawMins;
      }
      setClockMins(rawMins);
      const h24 = (clockH12 % 12) + (clockPeriod === "PM" ? 12 : 0);
      const newTimeStr = `${String(h24).padStart(2, "0")}:${String(rawMins).padStart(2, "0")}`;
      setTime(newTimeStr);
      if (isRelease) {
        clockLastHaptic.current = -1;
        _closeClock(() => {
          if (clockPeriod !== null) {
            if (skipDurationRef.current) {
              const s = flowSnapshotRef.current;
              _tryFinalize({ dateISO: s.dateISO, dateDraft: s.dateDraft, time: newTimeStr, duration: s.duration });
            } else {
              setStep("duration");
              setPanelOpen(true);
            }
          } else {
            setStep("ampm");
            setPanelOpen(true);
          }
        });
      }
    }
  }, [clockPhase, clockH12, clockMins, clockPeriod, _closeClock, _tryFinalize]);

  /** Confirma la hora actual y cierra el reloj (tap en backdrop u OK). */
  const commitClock = useCallback(() => {
    const h24 = (clockH12 % 12) + (clockPeriod === "PM" ? 12 : 0);
    const newTimeStr = `${String(h24).padStart(2, "0")}:${String(clockMins).padStart(2, "0")}`;
    setTime(newTimeStr);
    _closeClock(() => {
      if (clockPeriod !== null) {
        if (skipDurationRef.current) {
          const s = flowSnapshotRef.current;
          _tryFinalize({ dateISO: s.dateISO, dateDraft: s.dateDraft, time: newTimeStr, duration: s.duration });
        } else {
          setStep("duration");
          setPanelOpen(true);
        }
      } else {
        setStep("ampm");
        setPanelOpen(true);
      }
    });
  }, [clockH12, clockMins, clockPeriod, _closeClock, _tryFinalize]);

  /** SALTAR HORA — omite la hora y avanza a duración (o callback personalizado). */
  const skipTime = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (onSkipTimeRef.current) {
      // El caller sobrescribe el comportamiento (flujo QD, etc.)
      setStep("idle");
      setClockOpen(false);
      onSkipTimeRef.current();
    } else {
      setTime("");
      _closeClock(() => {
        setStep("duration");
        setPanelOpen(true);
      });
    }
  }, [_closeClock]);

  /** Reabre el reloj desde el panel de duración para corregir la hora. */
  const reopenClock = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    setPanelOpen(false);
    _initClock(time);
    setStep("clock");
    setClockOpen(true);
  }, [time, _initClock]);

  // ── AM / PM ───────────────────────────────────────────────────────────────

  const selectAmPm = useCallback((p: "AM" | "PM") => {
    Haptics.selectionAsync().catch(() => {});
    setClockPeriod(p);
    const h24 = (clockH12 % 12) + (p === "PM" ? 12 : 0);
    const newTimeStr = `${String(h24).padStart(2, "0")}:${String(clockMins).padStart(2, "0")}`;
    setTime(newTimeStr);
    if (skipDurationRef.current) {
      const s = flowSnapshotRef.current;
      _tryFinalize({ dateISO: s.dateISO, dateDraft: s.dateDraft, time: newTimeStr, duration: s.duration });
    } else {
      setStep("duration");
    }
  }, [clockH12, clockMins, _tryFinalize]);

  // ── Duración ──────────────────────────────────────────────────────────────

  /** Abre la cuadrícula para CORREGIR la fecha desde el panel de duración. */
  const openDateCorrection = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const base = new Date(dateISO + "T00:00:00");
    setMonthGridYear(base.getFullYear());
    setMonthGridMonth(base.getMonth());
    setMonthGridMode("correction");
    setMonthGridOpen(true);
  }, [dateISO]);

  /** Elige una duración e intenta finalizar el flujo.
   *  Si hay `validate` registrado y falla, muestra el error y mantiene
   *  el panel abierto — onSave NO se llama. */
  const selectDuration = useCallback((dur: string) => {
    Haptics.selectionAsync().catch(() => {});
    setDuration(dur);
    const result: CalFlowResult = { dateISO, dateDraft, time, duration: dur };
    _tryFinalize(result);
  }, [dateISO, dateDraft, time, _tryFinalize]);

  /** SALTAR duración — guarda sin duración (pasa igualmente por validate). */
  const skip = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const result: CalFlowResult = { dateISO, dateDraft, time, duration };
    _tryFinalize(result);
  }, [dateISO, dateDraft, time, duration, _tryFinalize]);

  /**
   * Actualiza el período AM/PM durante la fase reloj SIN avanzar el flujo.
   * Permite que los botones AM/PM en la esfera del reloj sincronicen calFlow
   * para que al soltar en minutos el flujo vaya directo a duración (no al
   * panel AM/PM extra).
   */
  const setPeriodDraft = useCallback((p: "AM" | "PM" | null) => {
    setClockPeriod(p);
  }, []);

  /**
   * Vuelve a la fase de horas desde minutos — sincroniza calFlow para que
   * el siguiente toque/arrastre se procese correctamente como horas.
   */
  const goBackToHours = useCallback(() => {
    setClockPhase("hours");
    clockLastHaptic.current = -1;
  }, []);

  const isActive = step !== "idle";

  return {
    // ── Estado ──────────────────────────────────────────────────────────────
    step, monthGridMode, isActive,
    // Visibilidad (para controlar el montaje)
    monthGridOpen, clockOpen, panelOpen,
    // Borradores
    dateISO, dateDraft, time, duration,
    // Reloj
    clockH12, clockMins, clockPeriod, clockPhase,
    // Cuadrícula mensual
    monthGridYear, monthGridMonth,
    // Animaciones (refs, no disparan re-renders)
    monthGridSlide, monthSlideX, clockSlide,
    // Error
    calError, setCalError,
    // ── Métodos ─────────────────────────────────────────────────────────────
    open,
    openForNav,
    cancel,
    closeMonthGridManual,
    // Cuadrícula
    handleDayTap,
    navigateMonth,
    // Reloj
    handleClockTouch,
    commitClock,
    skipTime,
    reopenClock,
    setPeriodDraft,
    goBackToHours,
    // AM/PM
    selectAmPm,
    // Duración
    openDateCorrection,
    selectDuration,
    skip,
  };
}
