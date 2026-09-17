import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  ActivityIndicator,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { KeyboardAwareScrollViewCompat } from "@/components/KeyboardAwareScrollViewCompat";
import { GoTimeField } from "@/components/ui/GoTimePicker";
import { PlanoEmpresaScreen } from "./PlanoEmpresaScreen";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as Location from "expo-location";
import { hapticToggle } from "@/utils/goHaptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useVerification } from "@/hooks/useVerification";
import { VerifGateBanner } from "@/components/auth/VerifGate";
import { BOOKING_TEMPLATES } from "@/data/bookingTemplates";
import { useBusinessConfig, type SavedService } from "@/contexts/GoBusinessConfigContext";
import {
  PlantillaItem,
  EMOJI_PALETTE,
  getAddLabel,
  usePlantillaItems,
} from "@/data/goSectorData";
import {
  AvailabilityWindow,
  BookableItem,
  Business,
  CancellationPolicy,
  CancellationRefundType,
  DEFAULT_CANCELLATION_POLICY,
  createAvailabilityWindow,
  createBookableItem,
  deleteAvailabilityWindow,
  deleteBookableItem,
  getAvailabilityWindows,
  getBookableItems,
  getBusinesses,
  saveBusiness,
  saveBookableItem,
  saveAvailabilityWindow,
  createBusiness,
} from "@/data/booking";

// ─── Tokens visuales ──────────────────────────────────────────────────────────

const BG          = "#F7F8FA";
const CARD        = "#FFFFFF";
const BORDER      = "rgba(0,0,0,0.08)";
const TEXT        = "#111827";
const GRAY        = "#6B7280";
const DIM         = "#9CA3AF";
const PLACEHOLDER = "#C0C4CC";
const ACCENT      = "#3B82F6";
const ON_COLOR    = "#22C55E";
const OFF_COLOR   = "#E5E7EB";

const DAYS        = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const DAYS_FULL   = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];

// ─── Switch con contraste visual claro ────────────────────────────────────────

function GoSwitch({ value, onValueChange }: { value: boolean; onValueChange: (v: boolean) => void }) {
  return (
    <Switch
      value={value}
      onValueChange={(v) => { hapticToggle(); onValueChange(v); }}
      trackColor={{ false: OFF_COLOR, true: ON_COLOR }}
      thumbColor={Platform.OS === "android" ? (value ? "#fff" : "#f4f3f4") : undefined}
      ios_backgroundColor={OFF_COLOR}
    />
  );
}

// ─── Tarjeta de servicio ───────────────────────────────────────────────────────

function ServiceCard({
  item, onPatch, onRemove,
}: {
  item: BookableItem;
  onPatch: (u: BookableItem) => void;
  onRemove: () => void;
}) {
  return (
    <View style={card.wrap}>
      <TextInput
        style={card.nameInput}
        value={item.title}
        onChangeText={v => onPatch({ ...item, title: v })}
        placeholder="Nombre del servicio"
        placeholderTextColor={PLACEHOLDER}
        returnKeyType="done"
      />

      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>Duración</Text>
          <Text style={card.sub}>¿Cuánto dura?</Text>
        </View>
        <View style={card.numBox}>
          <TextInput
            style={card.numInput}
            value={String(item.durationMinutes)}
            onChangeText={v => onPatch({ ...item, durationMinutes: parseInt(v) || 0 })}
            selectTextOnFocus
            keyboardType="numeric"
            returnKeyType="done"
          />
          <Text style={card.numUnit}>min</Text>
        </View>
      </View>

      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>Personas máximas</Text>
          <Text style={card.sub}>Por reserva</Text>
        </View>
        <View style={card.numBox}>
          <TextInput
            style={card.numInput}
            value={String(item.customerCapacity)}
            onChangeText={v => onPatch({ ...item, customerCapacity: parseInt(v) || 0 })}
            selectTextOnFocus
            keyboardType="numeric"
            returnKeyType="done"
          />
        </View>
      </View>

      <View style={card.row}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>Precio</Text>
          <Text style={card.sub}>0 si es gratuito</Text>
        </View>
        <View style={card.numBox}>
          <TextInput
            style={card.numInput}
            value={item.price ? String(item.price) : ""}
            onChangeText={v => onPatch({ ...item, price: parseFloat(v) || 0 })}
            selectTextOnFocus
            keyboardType="numeric"
            returnKeyType="done"
            placeholder="0"
            placeholderTextColor={PLACEHOLDER}
          />
          <Text style={card.numUnit}>€</Text>
        </View>
      </View>

      <View style={[card.row, { borderBottomWidth: 0 }]}>
        <View style={{ flex: 1 }}>
          <Text style={card.label}>Activo</Text>
          <Text style={card.sub}>Los clientes pueden reservarlo</Text>
        </View>
        <GoSwitch
          value={item.active}
          onValueChange={v => onPatch({ ...item, active: v })}
        />
      </View>

      <TouchableOpacity onPress={onRemove} activeOpacity={0.7} hitSlop={8} style={card.removeRow}>
        <Feather name="trash-2" size={13} color="#EF4444" />
        <Text style={card.removeTxt}>Eliminar servicio</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Helpers de tiempo ─────────────────────────────────────────────────────────

function toTimeStr(hour: number, minute?: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}

function fromTimeStr(t: string): { hour: number; minute: number } {
  const m = (t || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return { hour: 9, minute: 0 };
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10) };
}

// ─── Horario semanal unificado ─────────────────────────────────────────────────
//
// Un solo panel con 7 días arriba.
// Al pulsar un día → carga inmediatamente sus horas y estado guardados.
// Cada día tiene su propio AvailabilityWindow en BD.

function WeekSchedule({
  bizId,
  windows,
  onWindowsChange,
}: {
  bizId: string;
  windows: AvailabilityWindow[];
  onWindowsChange: (updated: AvailabilityWindow[]) => void;
}) {
  const [selectedDay, setSelectedDay] = useState<number>(1); // Lunes por defecto

  // Ventana del día actualmente seleccionado (undefined si no existe aún)
  const winForDay = windows.find(w => w.weekday === selectedDay);

  // Valores mostrados: los del día seleccionado, o defaults si no existe
  const startTime = toTimeStr(winForDay?.visibleStartHour ?? 9, winForDay?.visibleStartMinute ?? 0);
  const endTime   = toTimeStr(winForDay?.visibleEndHour   ?? 18, winForDay?.visibleEndMinute  ?? 0);
  const active    = winForDay?.active ?? false;

  // Crea o actualiza la ventana del día seleccionado
  const applyPatch = useCallback(async (patch: Partial<Pick<AvailabilityWindow, "visibleStartHour" | "visibleStartMinute" | "visibleEndHour" | "visibleEndMinute" | "active">>) => {
    if (winForDay) {
      const updated = { ...winForDay, ...patch };
      await saveAvailabilityWindow(updated);
      onWindowsChange(windows.map(w => w.id === updated.id ? updated : w));
    } else {
      const created = await createAvailabilityWindow({
        businessId: bizId,
        weekday: selectedDay,
        visibleStartHour:   patch.visibleStartHour   ?? 9,
        visibleStartMinute: patch.visibleStartMinute ?? 0,
        visibleEndHour:     patch.visibleEndHour     ?? 18,
        visibleEndMinute:   patch.visibleEndMinute   ?? 0,
        active:             patch.active             ?? false,
      });
      onWindowsChange([...windows, created]);
    }
    Haptics.selectionAsync().catch(() => {});
  }, [winForDay, windows, bizId, selectedDay, onWindowsChange]);

  // Copia el horario del día actual a los días destino
  const copyScheduleTo = useCallback(async (targetDays: number[]) => {
    const src = winForDay;
    if (!src) return;

    let updated = [...windows];

    for (const day of targetDays) {
      if (day === selectedDay) continue; // no copiarse a sí mismo
      const existing = updated.find(w => w.weekday === day);
      if (existing) {
        const patched = {
          ...existing,
          visibleStartHour:   src.visibleStartHour,
          visibleStartMinute: src.visibleStartMinute ?? 0,
          visibleEndHour:     src.visibleEndHour,
          visibleEndMinute:   src.visibleEndMinute ?? 0,
          active:             true,
        };
        await saveAvailabilityWindow(patched);
        updated = updated.map(w => w.id === patched.id ? patched : w);
      } else {
        const created = await createAvailabilityWindow({
          businessId: bizId,
          weekday: day,
          visibleStartHour:   src.visibleStartHour,
          visibleStartMinute: src.visibleStartMinute ?? 0,
          visibleEndHour:     src.visibleEndHour,
          visibleEndMinute:   src.visibleEndMinute ?? 0,
          active: true,
        });
        updated = [...updated, created];
      }
    }

    onWindowsChange(updated);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [winForDay, windows, bizId, selectedDay, onWindowsChange]);

  const handleCopy = useCallback(() => {
    if (!winForDay?.active) return;
    const fromStr = toTimeStr(winForDay.visibleStartHour, winForDay.visibleStartMinute ?? 0);
    const toStr   = toTimeStr(winForDay.visibleEndHour,   winForDay.visibleEndMinute   ?? 0);
    Alert.alert(
      "Copiar horario",
      `Copiar ${DAYS_FULL[selectedDay]} (${fromStr} – ${toStr}) a:`,
      [
        {
          text: "Días laborables (L–V)",
          onPress: () => copyScheduleTo([1, 2, 3, 4, 5]),
        },
        {
          text: "Todos los días",
          onPress: () => copyScheduleTo([0, 1, 2, 3, 4, 5, 6]),
        },
        { text: "Cancelar", style: "cancel" },
      ]
    );
  }, [winForDay, selectedDay, copyScheduleTo]);

  return (
    <View style={wk.card}>

      {/* Fila de días */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {DAYS.map((day, idx) => {
            const dayWin = windows.find(w => w.weekday === idx);
            const isSelected = selectedDay === idx;
            const isOpen     = dayWin?.active === true;
            const hasConfig  = dayWin !== undefined;

            return (
              <TouchableOpacity
                key={idx}
                onPress={() => setSelectedDay(idx)}
                activeOpacity={0.75}
                style={[
                  wk.dayPill,
                  isSelected && wk.dayPillSel,
                ]}
              >
                <Text style={[wk.dayTxt, isSelected && wk.dayTxtSel]}>{day}</Text>
                {/* Indicador de estado */}
                <View style={[
                  wk.dot,
                  !hasConfig && wk.dotNone,
                  hasConfig && !isOpen && wk.dotOff,
                  hasConfig && isOpen  && wk.dotOn,
                ]} />
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>

      {/* Nombre del día seleccionado */}
      <Text style={wk.dayName}>{DAYS_FULL[selectedDay]}</Text>

      {/* Activo / inactivo */}
      <View style={wk.activeRow}>
        <View style={{ flex: 1 }}>
          <Text style={wk.activeLabel}>
            {active ? "Abierto" : "Cerrado"}
          </Text>
          <Text style={wk.activeSub}>
            {active ? "Este día está disponible para reservas" : "Este día no acepta reservas"}
          </Text>
        </View>
        <GoSwitch
          value={active}
          onValueChange={v => applyPatch({ active: v })}
        />
      </View>

      {/* Horas (solo visibles si activo) */}
      {active && (
        <>
          <View style={wk.hoursRow}>
            <View style={{ flex: 1 }}>
              <GoTimeField
                label="Apertura"
                value={startTime}
                onConfirm={(t) => {
                  const { hour, minute } = fromTimeStr(t);
                  applyPatch({ visibleStartHour: hour, visibleStartMinute: minute });
                }}
                minuteStep={30}
                accentColor={ACCENT}
              />
            </View>

            <View style={wk.arrow}>
              <Feather name="arrow-right" size={18} color={DIM} />
            </View>

            <View style={{ flex: 1 }}>
              <GoTimeField
                label="Cierre"
                value={endTime}
                onConfirm={(t) => {
                  const { hour, minute } = fromTimeStr(t);
                  applyPatch({ visibleEndHour: hour, visibleEndMinute: minute });
                }}
                minuteStep={30}
                accentColor={ACCENT}
              />
            </View>
          </View>

          {/* Botón copiar horario */}
          <TouchableOpacity onPress={handleCopy} activeOpacity={0.75} style={wk.copyBtn}>
            <Feather name="copy" size={14} color={ACCENT} />
            <Text style={wk.copyBtnTxt}>Copiar este horario a otros días</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Resumen semanal */}
      <View style={wk.summary}>
        {DAYS.map((day, idx) => {
          const w = windows.find(x => x.weekday === idx);
          return (
            <View key={idx} style={wk.summaryRow}>
              <Text style={[wk.summaryDay, !w?.active && wk.summaryDayClosed]}>{day}</Text>
              <Text style={[wk.summaryHours, !w?.active && wk.summaryHoursClosed]}>
                {w?.active
                  ? `${toTimeStr(w.visibleStartHour, w.visibleStartMinute ?? 0)} – ${toTimeStr(w.visibleEndHour, w.visibleEndMinute ?? 0)}`
                  : "Cerrado"}
              </Text>
            </View>
          );
        })}
      </View>

    </View>
  );
}

// ─── Política de cancelación: editor ──────────────────────────────────────────

const REFUND_OPTIONS: { key: CancellationRefundType; label: string; sub: string; icon: keyof typeof Feather.glyphMap; tint: string }[] = [
  { key: "free",      label: "Siempre gratis",  sub: "100% reembolso siempre",   icon: "check-circle", tint: "#16A34A" },
  { key: "full",      label: "Reembolso total", sub: "100% si cancela a tiempo", icon: "refresh-cw",   tint: "#4A80BD" },
  { key: "half",      label: "50% reembolso",   sub: "La mitad del importe",     icon: "percent",      tint: "#D97706" },
  { key: "partial",   label: "% personalizado", sub: "Porcentaje que definas",   icon: "sliders",      tint: "#D97706" },
  { key: "fixed_fee", label: "Cargo fijo",      sub: "Retén una tarifa fija",    icon: "minus-circle", tint: "#7C69BE" },
  { key: "none",      label: "Sin reembolso",   sub: "Sin recuperar nada",       icon: "x-circle",     tint: "#DC2626" },
];

function CancellationPolicyEditor({
  policy,
  onChange,
}: {
  policy: CancellationPolicy;
  onChange: (p: CancellationPolicy) => void;
}) {
  const patch = (u: Partial<CancellationPolicy>) => onChange({ ...policy, ...u });
  const hasPay = policy.paymentRequired === true;

  return (
    <View style={cp.wrap}>

      {/* ── BLOQUE 1: ¿La reserva requiere pago? ── */}
      <Text style={cp.sectionLabel}>¿La reserva requiere pago?</Text>
      <View style={cp.payRow}>
        {/* Sin pago previo */}
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={() => patch({ paymentRequired: false })}
          style={[cp.payCell, !hasPay && cp.payCellActive]}
        >
          <View style={[cp.payRadio, !hasPay && cp.payRadioActive]}>
            {!hasPay && <View style={cp.payRadioDot} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[cp.payLabel, !hasPay && { color: "#111827", fontWeight: "700" }]}>
              Sin pago previo
            </Text>
            <Text style={cp.paySub}>Solo reserva de hora y espacio</Text>
          </View>
        </TouchableOpacity>

        {/* Con pago previo */}
        <TouchableOpacity
          activeOpacity={0.78}
          onPress={() => patch({ paymentRequired: true })}
          style={[cp.payCell, hasPay && cp.payCellActive]}
        >
          <View style={[cp.payRadio, hasPay && cp.payRadioActive]}>
            {hasPay && <View style={cp.payRadioDot} />}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[cp.payLabel, hasPay && { color: "#111827", fontWeight: "700" }]}>
              Con pago previo
            </Text>
            <Text style={cp.paySub}>El cliente paga al reservar</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── BLOQUE 2: opciones de reembolso (solo con pago previo) ── */}
      {hasPay && (
        <>
          <View style={cp.divider} />
          <Text style={cp.sectionLabel}>Tipo de reembolso</Text>

          {/* Grid simétrico 2 columnas — el estado activo NO cambia tamaño */}
          <View style={cp.refundGrid}>
            {[0, 2, 4].map((rowStart) => (
              <View key={rowStart} style={cp.refundRow}>
                {REFUND_OPTIONS.slice(rowStart, rowStart + 2).map((opt) => {
                  const active = policy.refundType === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => patch({ refundType: opt.key })}
                      activeOpacity={0.78}
                      style={[
                        cp.refundCell,
                        active && { borderColor: opt.tint, backgroundColor: `${opt.tint}0F` },
                      ]}
                    >
                      <View style={[cp.refundIconWrap, { backgroundColor: active ? `${opt.tint}22` : "#F3F4F6" }]}>
                        <Feather name={opt.icon} size={14} color={active ? opt.tint : DIM} />
                      </View>
                      <Text style={[cp.refundLabel, active && { color: opt.tint, fontWeight: "700" }]}>
                        {opt.label}
                      </Text>
                      <Text style={[cp.refundSub, active && { color: opt.tint, opacity: 0.75 }]}>
                        {opt.sub}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Extra: porcentaje */}
          {policy.refundType === "partial" && (
            <View style={cp.extraRow}>
              <Text style={cp.extraLabel}>Porcentaje devuelto</Text>
              <View style={cp.numBox}>
                <TextInput
                  style={cp.numInput}
                  value={String(policy.refundPercent ?? 0)}
                  onChangeText={v => patch({ refundPercent: Math.min(100, Math.max(0, parseInt(v) || 0)) })}
                  keyboardType="numeric"
                  returnKeyType="done"
                  selectTextOnFocus
                />
                <Text style={cp.numUnit}>%</Text>
              </View>
            </View>
          )}

          {/* Extra: cargo fijo */}
          {policy.refundType === "fixed_fee" && (
            <View style={cp.extraRow}>
              <Text style={cp.extraLabel}>Cargo por cancelación</Text>
              <View style={cp.numBox}>
                <TextInput
                  style={cp.numInput}
                  value={String(policy.fixedFee ?? 0)}
                  onChangeText={v => patch({ fixedFee: parseFloat(v) || 0 })}
                  keyboardType="numeric"
                  returnKeyType="done"
                  selectTextOnFocus
                />
                <Text style={cp.numUnit}>€</Text>
              </View>
            </View>
          )}

          {/* Ventana gratuita */}
          {policy.refundType !== "free" && (
            <View style={cp.extraRow}>
              <View style={{ flex: 1 }}>
                <Text style={cp.extraLabel}>Ventana de cancelación gratis</Text>
                <Text style={cp.extraSub}>
                  {policy.freeUntilHours === 0
                    ? "Sin ventana gratuita"
                    : `Gratis si cancela con ≥${policy.freeUntilHours}h de antelación`}
                </Text>
              </View>
              <View style={cp.numBox}>
                <TextInput
                  style={cp.numInput}
                  value={String(policy.freeUntilHours)}
                  onChangeText={v => patch({ freeUntilHours: Math.max(0, parseInt(v) || 0) })}
                  keyboardType="numeric"
                  returnKeyType="done"
                  selectTextOnFocus
                />
                <Text style={cp.numUnit}>h</Text>
              </View>
            </View>
          )}

          {/* Reembolso automático */}
          <View style={[cp.extraRow, { borderBottomWidth: 0 }]}>
            <View style={{ flex: 1 }}>
              <Text style={cp.extraLabel}>Reembolso automático</Text>
              <Text style={cp.extraSub}>
                {policy.autoRefund ? "Se procesa automáticamente" : "Debes procesarlo manualmente"}
              </Text>
            </View>
            <GoSwitch value={policy.autoRefund} onValueChange={v => patch({ autoRefund: v })} />
          </View>
        </>
      )}

    </View>
  );
}

// ─── Sección de plantilla y espacios editable ────────────────────────────────

function PlantillaSection({
  templateId,
  templateColor,
}: {
  templateId: string;
  templateColor: string;
}) {
  // ── Shared persistent state — same data as EmpresaSetupGuide ──────────────
  const { items, setItems } = usePlantillaItems(templateId);
  const [addingNew, setAddingNew] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newEmoji, setNewEmoji] = useState("🪑");
  const addLabel = getAddLabel(templateId);
  const color = templateColor;

  const patchCount = (id: string, delta: number) =>
    setItems(prev => prev.map(it =>
      it.id === id ? { ...it, count: Math.max(1, it.count + delta) } : it
    ));

  const patchLabel = (id: string, label: string) =>
    setItems(prev => prev.map(it => it.id === id ? { ...it, label } : it));

  const cycleEmoji = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setItems(prev => prev.map(it => {
      if (it.id !== id) return it;
      const idx = EMOJI_PALETTE.indexOf(it.emoji);
      const next = EMOJI_PALETTE[(idx + 1) % EMOJI_PALETTE.length];
      return { ...it, emoji: next };
    }));
  };

  const removeItem = (id: string) => setItems(prev => prev.filter(it => it.id !== id));

  const confirmAdd = () => {
    if (!newLabel.trim()) return;
    setItems(prev => [
      ...prev,
      { id: `custom_${Date.now()}`, emoji: newEmoji, label: newLabel.trim(), count: 1 },
    ]);
    setNewLabel("");
    setNewEmoji("🪑");
    setAddingNew(false);
    Haptics.selectionAsync().catch(() => {});
  };

  if (items.length === 0 && !addingNew) {
    return (
      <TouchableOpacity
        onPress={() => setAddingNew(true)}
        activeOpacity={0.8}
        style={[pt.addBtn, { borderColor: color + "40" }]}
      >
        <Feather name="plus" size={16} color={color} />
        <Text style={[pt.addBtnTxt, { color }]}>{addLabel}</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={pt.wrap}>
      {items.map(it => (
        <View key={it.id} style={pt.row}>
          {/* Emoji — tap to cycle */}
          <TouchableOpacity onPress={() => cycleEmoji(it.id)} hitSlop={8} activeOpacity={0.6}>
            <Text style={pt.rowEmoji}>{it.emoji}</Text>
          </TouchableOpacity>
          {/* Label — inline editable */}
          <TextInput
            style={pt.rowLabel}
            value={it.label}
            onChangeText={v => patchLabel(it.id, v)}
            placeholder="Nombre del espacio…"
            placeholderTextColor={PLACEHOLDER}
            returnKeyType="done"
          />
          <View style={pt.counter}>
            <TouchableOpacity onPress={() => patchCount(it.id, -1)} style={pt.cBtn} hitSlop={6}>
              <Text style={pt.cTxt}>−</Text>
            </TouchableOpacity>
            <Text style={pt.cNum}>{it.count}</Text>
            <TouchableOpacity onPress={() => patchCount(it.id, +1)} style={pt.cBtn} hitSlop={6}>
              <Text style={pt.cTxt}>+</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => removeItem(it.id)} style={pt.xBtn} hitSlop={8}>
            <Text style={pt.xTxt}>×</Text>
          </TouchableOpacity>
        </View>
      ))}

      {addingNew ? (
        <View style={pt.addForm}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={pt.emojiScroll}>
            <View style={{ flexDirection: "row", gap: 8, paddingBottom: 8 }}>
              {EMOJI_PALETTE.map(em => (
                <TouchableOpacity
                  key={em}
                  onPress={() => setNewEmoji(em)}
                  style={[pt.emojiChip, newEmoji === em && { backgroundColor: color + "22", borderColor: color + "60" }]}
                >
                  <Text style={{ fontSize: 18 }}>{em}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Text style={{ fontSize: 22 }}>{newEmoji}</Text>
            <TextInput
              style={pt.addInput}
              value={newLabel}
              onChangeText={setNewLabel}
              placeholder="Nombre del espacio…"
              placeholderTextColor={PLACEHOLDER}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmAdd}
            />
            <TouchableOpacity onPress={confirmAdd} style={[pt.confirmBtn, { backgroundColor: color }]}>
              <Feather name="check" size={14} color="#fff" />
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <TouchableOpacity
          onPress={() => setAddingNew(true)}
          activeOpacity={0.8}
          style={[pt.addBtn, { borderColor: color + "40" }]}
        >
          <Feather name="plus" size={16} color={color} />
          <Text style={[pt.addBtnTxt, { color }]}>{addLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ─── Pantalla principal ────────────────────────────────────────────────────────

export function GoBookingScreen({
  onClose,
  onOpenVerificacion,
  template,
}: {
  onClose: () => void;
  onOpenVerificacion?: () => void;
  template?: { id: string; label: string; emoji: string; color: string } | null;
}) {
  const insets = useSafeAreaInsets();
  const verification = useVerification();
  const { config, updateConfig } = useBusinessConfig();

  const [biz,        setBiz]        = useState<Business | null>(null);
  const [items,      setItems]      = useState<BookableItem[]>([]);
  const [windows,    setWindows]    = useState<AvailabilityWindow[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [locLoading, setLocLoading] = useState(false);
  const [showPlano,  setShowPlano]  = useState(false);

  const bizRef = useRef<Business | null>(null);
  bizRef.current = biz;

  // Keep a stable ref to template and config so load() can read without deps
  const templateRef = useRef(template);
  templateRef.current = template;
  const configRef = useRef(config);
  configRef.current = config;

  // Signatures of what WE last wrote to config — used to detect external changes
  const lastItemsSigRef    = useRef("");
  const lastScheduleSigRef = useRef("");

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function toSavedServices(its: BookableItem[]): SavedService[] {
    return its.map(i => ({ name: i.title, duration: i.durationMinutes, price: i.price }));
  }

  function deriveScheduleFromWindows(wins: AvailabilityWindow[]) {
    const active = wins.filter(w => w.active);
    // booking.ts weekday: 0=Sun (JS convention)
    // config activeDays:  0=Mon (EmpresaConfigScreen convention)
    // Convert back: configDay = (jsWeekday + 6) % 7
    const activeDays = active.map(w => (w.weekday + 6) % 7);
    if (active.length === 0) return { activeDays, openFrom: "09:00", openTo: "20:00" };
    const minStart = Math.min(...active.map(w => w.visibleStartHour * 60 + (w.visibleStartMinute ?? 0)));
    const maxEnd   = Math.max(...active.map(w => w.visibleEndHour   * 60 + (w.visibleEndMinute   ?? 0)));
    return {
      activeDays,
      openFrom: `${String(Math.floor(minStart / 60)).padStart(2, "0")}:${String(minStart % 60).padStart(2, "0")}`,
      openTo:   `${String(Math.floor(maxEnd   / 60)).padStart(2, "0")}:${String(maxEnd   % 60).padStart(2, "0")}`,
    };
  }

  function syncItemsToConfig(its: BookableItem[]) {
    const services = toSavedServices(its);
    lastItemsSigRef.current = JSON.stringify(services);
    updateConfig({ services });
  }

  function syncWindowsToConfig(_wins: AvailabilityWindow[]) {
    // INTENCIONALMENTE VACÍO:
    // La pantalla de disponibilidad (GO Reservas) es SOLO LECTURA respecto al
    // horario del negocio. El horario se configura en el asistente de empresa
    // (EmpresaConfigScreen) y se guarda en go_business_config_v1.
    // Escribir aquí de vuelta a config sobreescribiría silenciosamente el
    // horario configurado por el operador. Ver Bug #4.
  }

  const load = useCallback(async () => {
    setLoading(true);
    let all   = await getBusinesses();
    let found = all[0] ?? null;
    if (!found) {
      found = await createBusiness({
        name: "", category: "", location: "", phone: "",
        bookingActive: true,
        bookingColor: "#3B82F6",
        timezone: "Europe/Madrid",
      });
    }
    if (!found.bookingActive) {
      found = { ...found, bookingActive: true };
      await saveBusiness(found);
    }

    // ── Auto-seed from template on fresh setup ────────────────────────────────
    const tpl = templateRef.current;
    const tplData = tpl ? BOOKING_TEMPLATES[tpl.id] : null;
    const cfg = configRef.current;

    if (tpl && !found.category) {
      found = { ...found, category: tpl.label, bookingColor: tpl.color };
      await saveBusiness(found);
    }

    setBiz(found);

    const [its, wins] = await Promise.all([
      getBookableItems(found.id),
      getAvailabilityWindows(found.id),
    ]);

    // ── Seed services ────────────────────────────────────────────────────────
    let finalItems = its;
    if (its.length === 0) {
      if (tplData && tplData.services.length > 0) {
        // 1) Prefer BOOKING_TEMPLATES when a template is active
        const created = await Promise.all(
          tplData.services.map(svc =>
            createBookableItem({
              businessId: found!.id,
              title: svc.title,
              type: tplData.id,
              durationMinutes: svc.durationMinutes,
              customerCapacity: svc.customerCapacity,
              unitQuantity: 1,
              price: svc.price ?? 0,
              paymentRequired: false,
              active: true,
              visible: true,
            })
          )
        );
        finalItems = created;
      } else if (cfg.services.length > 0) {
        // 2) Fall back to GoBusinessConfigContext services
        const created = await Promise.all(
          cfg.services.map(svc =>
            createBookableItem({
              businessId: found!.id,
              title: svc.name,
              type: svc.name,
              durationMinutes: svc.duration,
              customerCapacity: 1,
              unitQuantity: 1,
              price: svc.price,
              paymentRequired: false,
              active: true,
              visible: true,
            })
          )
        );
        finalItems = created;
      }
    }

    // ── Seed schedule ────────────────────────────────────────────────────────
    let finalWindows = wins;
    if (wins.length === 0 && cfg.activeDays.length > 0) {
      const { hour: startH, minute: startM } = fromTimeStr(cfg.openFrom);
      const { hour: endH,   minute: endM   } = fromTimeStr(cfg.openTo);
      const created = await Promise.all(
        cfg.activeDays.map(day =>
          createAvailabilityWindow({
            businessId: found!.id,
            // Convert config 0=Mon to JS 0=Sun: (day+1)%7
            weekday: (day + 1) % 7,
            visibleStartHour:   startH,
            visibleStartMinute: startM,
            visibleEndHour:     endH,
            visibleEndMinute:   endM,
            active: true,
          })
        )
      );
      finalWindows = created;
    }

    setItems(finalItems);
    setWindows(finalWindows);

    // Record what we loaded so the config sync effects don't trigger unnecessarily
    const loadedServicesSig = JSON.stringify(toSavedServices(finalItems));
    const loadedSchedule    = deriveScheduleFromWindows(finalWindows);
    lastItemsSigRef.current    = loadedServicesSig;
    lastScheduleSigRef.current = JSON.stringify(loadedSchedule);

    // Sync ONLY services back to config — never schedule.
    // The business schedule is the source of truth in go_business_config_v1
    // (configured via the wizard / EmpresaConfigScreen). Reading windows here
    // and writing them back to config would silently overwrite the operator's
    // configured schedule every time this screen opens, which is a critical bug.
    updateConfig({ services: toSavedServices(finalItems) });

    setLoading(false);
  }, []);

  useEffect(() => { load(); }, []);

  // ── External config sync: when config changes from outside (EmpresaConfigScreen,
  // EmpresaSetupGuide), seed booking.ts if items/windows are empty ───────────
  useEffect(() => {
    if (loading || !biz) return;

    const configServicesSig = JSON.stringify(config.services);
    if (configServicesSig !== lastItemsSigRef.current && items.length === 0 && config.services.length > 0) {
      lastItemsSigRef.current = configServicesSig;
      (async () => {
        const created = await Promise.all(
          config.services.map(svc =>
            createBookableItem({
              businessId: biz.id,
              title: svc.name,
              type: svc.name,
              durationMinutes: svc.duration,
              customerCapacity: 1,
              unitQuantity: 1,
              price: svc.price,
              paymentRequired: false,
              active: true,
              visible: true,
            })
          )
        );
        setItems(created);
      })();
    }

    const configSched    = { activeDays: config.activeDays, openFrom: config.openFrom, openTo: config.openTo };
    const configSchedSig = JSON.stringify(configSched);
    if (configSchedSig !== lastScheduleSigRef.current && windows.length === 0 && config.activeDays.length > 0) {
      lastScheduleSigRef.current = configSchedSig;
      (async () => {
        const { hour: startH, minute: startM } = fromTimeStr(config.openFrom);
        const { hour: endH,   minute: endM   } = fromTimeStr(config.openTo);
        const created = await Promise.all(
          config.activeDays.map(day =>
            createAvailabilityWindow({
              businessId: biz.id,
              // Convert config 0=Mon to JS 0=Sun: (day+1)%7
              weekday: (day + 1) % 7,
              visibleStartHour:   startH,
              visibleStartMinute: startM,
              visibleEndHour:     endH,
              visibleEndMinute:   endM,
              active: true,
            })
          )
        );
        setWindows(created);
      })();
    }
  }, [config, biz, loading]);

  const saveBizField = async (field: keyof Business, value: any) => {
    const b = bizRef.current;
    if (!b) return;
    const updated = { ...b, [field]: value };
    setBiz(updated);
    await saveBusiness(updated);
  };

  const useCurrentLocation = async () => {
    setLocLoading(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Permisos necesarios", "Activa el acceso a la ubicación para usar esta función.");
        setLocLoading(false);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      if (place) {
        const parts = [place.street, place.streetNumber, place.city, place.region].filter(Boolean);
        const address = parts.join(", ");
        setBiz(b => b ? { ...b, location: address } : b);
        const b = bizRef.current;
        if (b) await saveBusiness({ ...b, location: address });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
    } catch {
      Alert.alert("Error", "No se pudo obtener la ubicación. Inténtalo de nuevo.");
    }
    setLocLoading(false);
  };

  const addItem = async () => {
    if (!biz) return;
    const item = await createBookableItem({
      businessId: biz.id, title: "", type: "",
      durationMinutes: 30, customerCapacity: 1, unitQuantity: 1,
      price: 0, paymentRequired: false, active: true, visible: true,
    });
    const newItems = [...items, item];
    setItems(newItems);
    syncItemsToConfig(newItems);
    Haptics.selectionAsync().catch(() => {});
  };

  const patchItem = async (updated: BookableItem) => {
    const newItems = items.map(i => i.id === updated.id ? updated : i);
    setItems(newItems);
    await saveBookableItem(updated);
    syncItemsToConfig(newItems);
  };

  const removeItem = (id: string) => {
    Alert.alert("Eliminar servicio", "¿Eliminar este servicio?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: async () => {
        await deleteBookableItem(id);
        const newItems = items.filter(i => i.id !== id);
        setItems(newItems);
        syncItemsToConfig(newItems);
      }},
    ]);
  };

  // Wrapper: windows change → update state AND sync schedule back to config
  const handleWindowsChange = useCallback((updated: AvailabilityWindow[]) => {
    setWindows(updated);
    syncWindowsToConfig(updated);
  }, [updateConfig]);

  // When template known: 1=nombre, 2=espacios, 3=ubicación, 4=servicios, 5=horarios, 6=política
  // When template unknown: 1=nombre, 2=actividad, 3=ubicación, 4=servicios, 5=horarios, 6=política
  const sn = (n: number) => String(n);

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {loading ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <ActivityIndicator color={ACCENT} />
        </View>
      ) : (
        <KeyboardAwareScrollViewCompat
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: 60 }}
          bottomOffset={16}
        >
          {/* Verificación banner — non-blocking, Empresa Básica can still configure */}
          {verification.status !== "verified" && (
            <VerifGateBanner
              message="Configura tus servicios y horarios. Verifica tu empresa para activar las reservas públicas."
              onPress={onOpenVerificacion}
            />
          )}

          {/* ── Template banner ── */}
          {template && (
            <View style={[s.tplBanner, { borderColor: template.color + "35", backgroundColor: template.color + "0C" }]}>
              <View style={[s.tplBannerDot, { backgroundColor: template.color }]} />
              <Text style={s.tplBannerEmoji}>{template.emoji}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[s.tplBannerTitle, { color: template.color }]}>
                  Configurado para: {template.label}
                </Text>
                <Text style={s.tplBannerSub}>Servicios y datos precargados. Personaliza lo que necesites.</Text>
              </View>
            </View>
          )}

          {/* PASO 1 */}
          <StepLabel n="1" title="¿Cómo se llama tu negocio?" />
          <View style={s.stepCard}>
            <TextInput
              style={s.bigInput}
              value={biz!.name}
              onChangeText={v => setBiz(b => b ? { ...b, name: v } : b)}
              onBlur={() => saveBizField("name", biz!.name)}
              placeholder="Nombre de tu negocio"
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
            />
          </View>

          {/* PASO 2 — Espacios y zonas (solo si la plantilla es conocida) */}
          {template && template.id && template.id !== "personalizado" && (
            <>
              <View style={s.sep} />
              <StepLabel n="2" title="Espacios y zonas" />
              <Text style={s.secHint}>
                GO ha precargado una estructura sugerida. Confirma, edita, elimina o añade lo que necesites.
              </Text>
              <View style={{ marginHorizontal: 16 }}>
                <PlantillaSection templateId={template.id} templateColor={template.color} />
              </View>
            </>
          )}

          {/* PASO 2 — Actividad (solo si no hay plantilla) */}
          {!template && (
            <>
              <StepLabel n="2" title="¿A qué te dedicas?" />
              <View style={s.stepCard}>
                <TextInput
                  style={s.bigInput}
                  value={biz!.category}
                  onChangeText={v => setBiz(b => b ? { ...b, category: v } : b)}
                  onBlur={() => saveBizField("category", biz!.category)}
                  placeholder="Ej: Peluquería, Restaurante, Clínica…"
                  placeholderTextColor={PLACEHOLDER}
                  returnKeyType="done"
                />
              </View>
            </>
          )}

          {/* PASO 3 — Ubicación */}
          <StepLabel n={sn(3)} title="¿Dónde estás?" />
          <View style={s.stepCard}>
            <TextInput
              style={s.bigInput}
              value={biz!.location}
              onChangeText={v => setBiz(b => b ? { ...b, location: v } : b)}
              onBlur={() => saveBizField("location", biz!.location)}
              placeholder="Calle, ciudad o dirección"
              placeholderTextColor={PLACEHOLDER}
              returnKeyType="done"
            />
          </View>

          <TouchableOpacity
            onPress={useCurrentLocation}
            activeOpacity={0.8}
            style={s.locationBtn}
            disabled={locLoading}
          >
            {locLoading
              ? <ActivityIndicator size="small" color={ACCENT} />
              : <Feather name="navigation" size={15} color={ACCENT} />
            }
            <Text style={s.locationBtnTxt}>
              {locLoading ? "Detectando ubicación…" : "Usar mi ubicación actual"}
            </Text>
          </TouchableOpacity>

          {/* PASO 4 — Servicios */}
          <View style={s.sep} />
          <StepLabel n={sn(4)} title="Tus servicios" />
          <Text style={s.secHint}>¿Qué ofreces? Corte, mesa, sala, sesión…</Text>

          {items.map(item => (
            <ServiceCard
              key={item.id}
              item={item}
              onPatch={patchItem}
              onRemove={() => removeItem(item.id)}
            />
          ))}

          <TouchableOpacity onPress={addItem} activeOpacity={0.8} style={s.addBtn}>
            <Feather name="plus" size={18} color={ACCENT} />
            <Text style={s.addBtnTxt}>
              {items.length === 0 ? "Añadir mi primer servicio" : "Añadir otro servicio"}
            </Text>
          </TouchableOpacity>

          {/* PASO 4/5 — Horarios */}
          <View style={s.sep} />
          <StepLabel n={sn(5)} title="Tus horarios" />
          <Text style={s.secHint}>Toca cada día para configurar su horario.</Text>

          <WeekSchedule
            bizId={biz!.id}
            windows={windows}
            onWindowsChange={handleWindowsChange}
          />

          {/* PASO 5/6 — Política de cancelación */}
          <View style={s.sep} />
          <StepLabel n={sn(6)} title="Política de cancelación" />
          <Text style={s.secHint}>
            ¿Tu reserva requiere pago previo? Define cómo gestionas las cancelaciones.
          </Text>

          <CancellationPolicyEditor
            policy={biz!.cancellationPolicy ?? DEFAULT_CANCELLATION_POLICY}
            onChange={async (p) => {
              const updated = { ...biz!, cancellationPolicy: p };
              setBiz(updated);
              await saveBusiness(updated);
              Haptics.selectionAsync().catch(() => {});
            }}
          />

          {/* ── PLANO EMPRESA ── */}
          <View style={{ height: 1, backgroundColor: "rgba(0,0,0,0.07)", marginHorizontal: 16, marginVertical: 20 }} />
          <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
            <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", fontWeight: "800", color: "#6B7280", letterSpacing: 1, marginBottom: 4 }}>
              PLANO Y ESPACIOS RESERVABLES
            </Text>
            <Text style={{ fontSize: 12, color: "#9CA3AF", marginBottom: 14 }}>
              Crea el plano visual de tu negocio y gestiona mesas, habitaciones, salas y cualquier espacio.
            </Text>
            <TouchableOpacity
              style={{
                flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
                backgroundColor: "#4A80BD", borderRadius: 14, paddingVertical: 16,
                shadowColor: "#4A80BD", shadowOpacity: 0.35, shadowRadius: 10,
                shadowOffset: { width: 0, height: 3 }, elevation: 4,
              }}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); setShowPlano(true); }}
              activeOpacity={0.85}
            >
              <Feather name="map" size={20} color="#fff" />
              <Text style={{ color: "#fff", fontFamily: "Inter_900Black", fontWeight: "900", fontSize: 15, letterSpacing: 1 }}>
                PLANO EMPRESA
              </Text>
              <View style={{ backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "700" }}>NUEVO</Text>
              </View>
            </TouchableOpacity>
          </View>

        </KeyboardAwareScrollViewCompat>
      )}

      {/* Plano Empresa — full screen modal */}
      <Modal
        visible={showPlano}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setShowPlano(false)}
      >
        <PlanoEmpresaScreen
          businessId={biz?.id ?? "default"}
          businessName={biz?.name || "Mi Negocio"}
          templateId={template?.id ?? undefined}
          onClose={() => setShowPlano(false)}
        />
      </Modal>
    </View>
  );
}

// ─── Auxiliar: etiqueta de paso ───────────────────────────────────────────────

function StepLabel({ n, title }: { n: string; title: string }) {
  return (
    <View style={s.stepRow}>
      <View style={s.badge}>
        <Text style={s.badgeNum}>{n}</Text>
      </View>
      <Text style={s.stepTitle}>{title}</Text>
    </View>
  );
}

// ─── Estilos: tarjeta de servicio ─────────────────────────────────────────────

const card = StyleSheet.create({
  wrap:       { marginHorizontal: 16, marginBottom: 10, borderRadius: 18,
                backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
                padding: 20,
                shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  nameInput:  { color: TEXT, fontSize: 18, fontWeight: "600",
                paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER, marginBottom: 2 },
  row:        { flexDirection: "row", alignItems: "center",
                paddingVertical: 13, gap: 12,
                borderBottomWidth: 1, borderBottomColor: BORDER },
  label:      { color: TEXT, fontSize: 15, fontWeight: "500" },
  sub:        { color: DIM, fontSize: 12, marginTop: 2 },
  numBox:     { flexDirection: "row", alignItems: "center",
                backgroundColor: "#F3F4F6",
                borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 4,
                flexShrink: 0 },
  numInput:   { color: TEXT, fontSize: 18, fontWeight: "600",
                minWidth: 36, textAlign: "center" },
  numUnit:    { color: GRAY, fontSize: 13 },
  removeRow:  { flexDirection: "row", alignItems: "center", gap: 6,
                marginTop: 14, paddingTop: 12,
                borderTopWidth: 1, borderTopColor: BORDER },
  removeTxt:  { color: "#EF4444", fontSize: 13 },
});

// ─── Estilos: horario semanal ──────────────────────────────────────────────────

const wk = StyleSheet.create({
  card:          { marginHorizontal: 16, borderRadius: 18,
                   backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
                   padding: 20,
                   shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
                   shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  dayPill:       { alignItems: "center", paddingHorizontal: 12, paddingVertical: 8,
                   borderRadius: 12, backgroundColor: "#F3F4F6",
                   borderWidth: 1, borderColor: BORDER, gap: 4 },
  dayPillSel:    { backgroundColor: ACCENT, borderColor: ACCENT },
  dayTxt:        { color: GRAY, fontSize: 13, fontWeight: "500" },
  dayTxtSel:     { color: "#fff", fontWeight: "700" },

  dot:           { width: 6, height: 6, borderRadius: 3 },
  dotNone:       { backgroundColor: "#D1D5DB" },
  dotOff:        { backgroundColor: "#F87171" },
  dotOn:         { backgroundColor: ON_COLOR },

  dayName:       { color: TEXT, fontSize: 20, fontWeight: "700", marginBottom: 16 },

  activeRow:     { flexDirection: "row", alignItems: "center",
                   paddingVertical: 14, borderTopWidth: 1, borderTopColor: BORDER, gap: 12 },
  activeLabel:   { color: TEXT, fontSize: 16, fontWeight: "600" },
  activeSub:     { color: DIM, fontSize: 12, marginTop: 2 },

  hoursRow:      { flexDirection: "row", alignItems: "center",
                   paddingTop: 16, gap: 12 },
  arrow:         { paddingTop: 20 },

  copyBtn:       { flexDirection: "row", alignItems: "center", gap: 7,
                   marginTop: 14, alignSelf: "flex-start",
                   paddingVertical: 8, paddingHorizontal: 14,
                   borderRadius: 10, borderWidth: 1,
                   borderColor: "rgba(59,130,246,0.25)",
                   backgroundColor: "rgba(59,130,246,0.06)" },
  copyBtnTxt:    { color: ACCENT, fontSize: 13, fontWeight: "500" },

  summary:       { marginTop: 20, paddingTop: 16,
                   borderTopWidth: 1, borderTopColor: BORDER, gap: 8 },
  summaryRow:    { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryDay:    { color: TEXT, fontSize: 13, fontWeight: "600", width: 36 },
  summaryDayClosed: { color: DIM },
  summaryHours:  { color: GRAY, fontSize: 13 },
  summaryHoursClosed: { color: "#FCA5A5" },
});

// ─── Estilos: pantalla ────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: BG },

  stepRow:        { flexDirection: "row", alignItems: "center", gap: 12,
                    paddingHorizontal: 16, marginTop: 28, marginBottom: 12 },
  badge:          { width: 28, height: 28, borderRadius: 14,
                    backgroundColor: ACCENT,
                    alignItems: "center", justifyContent: "center" },
  badgeNum:       { color: "#fff", fontSize: 14, fontWeight: "700" },
  stepTitle:      { color: TEXT, fontSize: 18, fontWeight: "600", flex: 1 },

  stepCard:       { marginHorizontal: 16, borderRadius: 16,
                    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
                    paddingHorizontal: 18,
                    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  bigInput:       { color: TEXT, fontSize: 18, paddingVertical: 14 },

  locationBtn:    { flexDirection: "row", alignItems: "center", gap: 8,
                    marginHorizontal: 16, marginTop: 10,
                    paddingVertical: 11, paddingHorizontal: 16,
                    borderRadius: 12, borderWidth: 1,
                    borderColor: "rgba(59,130,246,0.25)",
                    backgroundColor: "rgba(59,130,246,0.06)" },
  locationBtnTxt: { color: ACCENT, fontSize: 14, fontWeight: "500" },

  sep:            { height: 1, backgroundColor: BORDER,
                    marginHorizontal: 16, marginTop: 32, marginBottom: 4 },
  secHint:        { color: GRAY, fontSize: 14, paddingHorizontal: 16,
                    marginBottom: 14, marginTop: 4, lineHeight: 20 },

  addBtn:         { flexDirection: "row", alignItems: "center", gap: 10,
                    marginHorizontal: 16, marginTop: 4,
                    paddingVertical: 16, paddingHorizontal: 20,
                    borderRadius: 16, borderWidth: 1.5,
                    borderColor: "rgba(59,130,246,0.25)",
                    borderStyle: "dashed" },
  addBtnTxt:      { fontSize: 16, fontWeight: "600", color: ACCENT },

  tplBanner: {
    flexDirection: "row", alignItems: "center", gap: 10,
    marginHorizontal: 16, marginTop: 16, marginBottom: 4,
    borderRadius: 14, borderWidth: 1.5,
    paddingVertical: 12, paddingHorizontal: 14,
  },
  tplBannerDot: {
    width: 8, height: 8, borderRadius: 4, flexShrink: 0,
  },
  tplBannerEmoji: { fontSize: 22, flexShrink: 0 },
  tplBannerTitle: { fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800", marginBottom: 2 },
  tplBannerSub:   { fontSize: 11, color: "#6B7280", lineHeight: 15 },
});

// ─── Estilos: sección plantilla & espacios ────────────────────────────────────

const pt = StyleSheet.create({
  wrap: {
    backgroundColor: CARD, borderRadius: 16,
    borderWidth: 1, borderColor: BORDER,
    padding: 14,
    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.05)",
  },
  rowEmoji: { fontSize: 20, width: 26, textAlign: "center" },
  rowLabel: { flex: 1, color: TEXT, fontSize: 14, fontWeight: "500" },
  counter: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: "#F3F4F6", borderRadius: 10,
    overflow: "hidden",
  },
  cBtn: {
    paddingHorizontal: 10, paddingVertical: 7,
    alignItems: "center", justifyContent: "center",
  },
  cTxt: { color: GRAY, fontSize: 16, fontWeight: "700", lineHeight: 18 },
  cNum: {
    color: TEXT, fontSize: 14, fontWeight: "700",
    minWidth: 24, textAlign: "center",
  },
  xBtn: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(239,68,68,0.10)",
    alignItems: "center", justifyContent: "center",
  },
  xTxt: { color: "#EF4444", fontSize: 16, fontWeight: "700", lineHeight: 18 },
  addForm: {
    marginTop: 10, gap: 8,
  },
  emojiScroll: { maxHeight: 48 },
  emojiChip: {
    width: 40, height: 40, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1.5, borderColor: "rgba(0,0,0,0.07)",
    backgroundColor: "#F9FAFB",
  },
  addInput: {
    flex: 1, color: TEXT, fontSize: 15,
    backgroundColor: "#F3F4F6", borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
  },
  confirmBtn: {
    width: 38, height: 38, borderRadius: 12,
    alignItems: "center", justifyContent: "center",
    flexShrink: 0,
  },
  addBtn: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginTop: 8, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed",
  },
  addBtnTxt: { fontSize: 14, fontWeight: "600" },
});

// ─── Estilos: política de cancelación ─────────────────────────────────────────

const cp = StyleSheet.create({
  wrap:           { marginHorizontal: 16, borderRadius: 18,
                    backgroundColor: CARD, borderWidth: 1, borderColor: BORDER,
                    padding: 18,
                    shadowColor: "#000", shadowOpacity: 0.04, shadowRadius: 8,
                    shadowOffset: { width: 0, height: 2 }, elevation: 2 },

  sectionLabel:   { color: GRAY, fontSize: 11, fontWeight: "700",
                    letterSpacing: 0.8, marginBottom: 10, textTransform: "uppercase" },

  // ── Selector pago previo ────────────────────────────────────────────────
  payRow:         { gap: 8, marginBottom: 4 },
  payCell:        { flexDirection: "row", alignItems: "center", gap: 12,
                    paddingVertical: 14, paddingHorizontal: 14,
                    borderRadius: 14, backgroundColor: "#F9FAFB",
                    borderWidth: 1.5, borderColor: BORDER },
  payCellActive:  { borderColor: ACCENT, backgroundColor: `${ACCENT}0C` },
  payRadio:       { width: 20, height: 20, borderRadius: 10,
                    borderWidth: 2, borderColor: BORDER,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "#FFFFFF" },
  payRadioActive: { borderColor: ACCENT },
  payRadioDot:    { width: 10, height: 10, borderRadius: 5, backgroundColor: ACCENT },
  payLabel:       { color: GRAY, fontSize: 14, fontWeight: "500" },
  paySub:         { color: DIM, fontSize: 11, marginTop: 2 },

  // ── Divisor interno ─────────────────────────────────────────────────────
  divider:        { height: 1, backgroundColor: BORDER, marginVertical: 16 },

  // ── Grid de reembolso — 2 columnas simétricas ───────────────────────────
  refundGrid:     { gap: 8, marginBottom: 4 },
  refundRow:      { flexDirection: "row", gap: 8 },
  refundCell:     { flex: 1, paddingVertical: 12, paddingHorizontal: 12,
                    borderRadius: 14, backgroundColor: "#F9FAFB",
                    borderWidth: 1.5, borderColor: BORDER,
                    gap: 5 },
  refundIconWrap: { width: 28, height: 28, borderRadius: 9,
                    alignItems: "center", justifyContent: "center" },
  refundLabel:    { color: TEXT, fontSize: 12, fontWeight: "600", lineHeight: 15 },
  refundSub:      { color: DIM, fontSize: 10, lineHeight: 13 },

  extraRow:       { flexDirection: "row", alignItems: "center", gap: 12,
                    paddingVertical: 14,
                    borderTopWidth: 1, borderTopColor: BORDER },
  extraLabel:     { color: TEXT, fontSize: 14, fontWeight: "500" },
  extraSub:       { color: DIM, fontSize: 11, marginTop: 2 },

  numBox:         { flexDirection: "row", alignItems: "center",
                    backgroundColor: "#F3F4F6",
                    borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 4,
                    flexShrink: 0 },
  numInput:       { color: TEXT, fontSize: 18, fontWeight: "600",
                    minWidth: 36, textAlign: "center" },
  numUnit:        { color: GRAY, fontSize: 13 },
});
