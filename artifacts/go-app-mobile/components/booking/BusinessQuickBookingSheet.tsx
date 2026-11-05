import React, { useMemo, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GoTimeField } from "@/components/ui/GoTimePicker";
import { buildDirectEntry, createDirectEntryCommitter, newDirectEntry, selectDirectService,
  type DirectEntryContext, type DirectEntryDraft, type DirectEntryGateway, type DirectEntryReceipt } from "@/data/businessDirectEntry";

type Props = {
  context: DirectEntryContext;
  dateISO: string;
  startTime: string;
  staffId?: string;
  source?: "phone" | "walk_in";
  gateway: DirectEntryGateway | null;
  nextRequestId: () => string;
  onSaved: (receipt: DirectEntryReceipt) => void;
  onClose: () => void;
  onPickDate: (selected: string, onSelect: (dateISO: string) => void) => void;
  bottomInset?: number;
};

/**
 * Isolated preparation. Intentionally not mounted in any production route.
 * Reuses GO time controls. A future authorized adapter must supply the EXISTING
 * server engine, not a local reservation store. No customers or slots are invented.
 * Mount one instance per business/identity; never retarget a mounted draft.
 */
export function BusinessQuickBookingSheet({ context, dateISO, startTime, staffId, source = "phone", gateway,
  nextRequestId, onSaved, onClose, onPickDate, bottomInset = 0 }: Props) {
  const [draft, setDraft] = useState(() => newDirectEntry(dateISO, startTime, staffId));
  const [saving, setSaving] = useState(false), [error, setError] = useState("");
  const busy = useRef(false);
  const commit = useMemo(() => createDirectEntryCommitter(gateway, nextRequestId), [gateway, nextRequestId]);
  const patch = (update: Partial<DirectEntryDraft>) => { if (!busy.current) { setDraft(value => ({ ...value, ...update })); setError(""); } };
  const field = (key: keyof DirectEntryDraft, label: string, numeric = false) => <View style={s.field}>
    <Text style={s.label}>{label}</Text>
    <TextInput testID={`direct-${key}`} accessibilityLabel={label} editable={!saving} style={s.input}
      keyboardType={numeric ? "number-pad" : key === "phone" ? "phone-pad" : "default"}
      value={draft[key]} onChangeText={value => patch({ [key]: value })}
      maxLength={key === "notes" ? 4000 : key === "phone" ? 40 : numeric ? 4 : 120} />
  </View>;
  const submit = async () => {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    try {
      const command = buildDirectEntry(context, draft, source);
      const receipt = await commit(command);
      onSaved(receipt);
    } catch (cause) { setError(cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
      ? cause.message : "No se pudo guardar. Se conservan los datos de la ficha."); }
    finally { busy.current = false; setSaving(false); }
  };
  return <KeyboardAvoidingView testID="business-direct-sheet" behavior={Platform.OS === "ios" ? "padding" : undefined} style={s.sheet}>
    <Text style={s.title}>{draft.kind === "block" ? "BLOQUEAR HORARIO" : "NUEVA RESERVA"}</Text>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={s.content}>
      <View style={s.row}>
        {(["booking", "block"] as const).map(kind => <TouchableOpacity key={kind} testID={`direct-kind-${kind}`} disabled={saving}
          accessibilityRole="button" accessibilityState={{ selected: draft.kind === kind }} onPress={() => patch({ kind })}
          style={[s.choice, draft.kind === kind && s.selected]}><Text style={s.choiceText}>{kind === "booking" ? "Reserva" : "Bloquear horario"}</Text></TouchableOpacity>)}
      </View>
      <TouchableOpacity testID="direct-date" accessibilityLabel="Cambiar fecha" disabled={saving}
        onPress={() => onPickDate(draft.dateISO, value => patch({ dateISO: value }))} style={s.choice}>
        <Text style={s.choiceText}>Fecha · {draft.dateISO.split("-").reverse().join("/")}</Text>
      </TouchableOpacity>
      {draft.kind === "booking" ? <>
        {field("customerName", "Nombre del cliente")}
        <Text style={s.label}>Servicio</Text>
        {context.services.map(service => <TouchableOpacity key={service.id} testID={`direct-service-${service.id}`} disabled={saving}
          accessibilityRole="button" accessibilityState={{ selected: draft.serviceId === service.id }}
          onPress={() => { if (!busy.current) { setDraft(value => selectDirectService(value, service)); setError(""); } }}
          style={[s.choice, draft.serviceId === service.id && s.selected]}><Text style={s.choiceText}>{service.name} · {service.durationMinutes} min</Text></TouchableOpacity>)}
        {context.allowConcept && !draft.serviceId && field("concept", "Concepto")}
      </> : field("concept", "Motivo del bloqueo")}
      {!!context.professionals.length && <>
        <Text style={s.label}>Profesional</Text>
        {!context.requireProfessional && <TouchableOpacity testID="direct-staff-any" disabled={saving} onPress={() => patch({ staffId: "" })}
          accessibilityState={{ selected: !draft.staffId }} style={[s.choice, !draft.staffId && s.selected]}><Text style={s.choiceText}>{draft.kind === "block" ? "Empresa" : "Sin preferencia"}</Text></TouchableOpacity>}
        {context.professionals.map(person => <TouchableOpacity key={person.id} testID={`direct-staff-${person.id}`} disabled={saving}
          accessibilityRole="button" accessibilityState={{ selected: draft.staffId === person.id }} onPress={() => patch({ staffId: person.id })}
          style={[s.choice, draft.staffId === person.id && s.selected]}><Text style={s.choiceText}>{person.name}</Text></TouchableOpacity>)}
      </>}
      <GoTimeField label="Hora inicial" value={draft.startTime} onConfirm={value => patch({ startTime: value })} minuteStep={1} accentColor="#3D9A84" />
      {draft.kind === "block" ? <GoTimeField label="Hora final" value={draft.endTime} onConfirm={value => patch({ endTime: value })} minuteStep={1} accentColor="#3D9A84" />
        : context.allowDurationOverride || !draft.serviceId ? field("durationMinutes", "Duración en minutos", true)
          : <Text style={s.summary}>Duración · {draft.durationMinutes || "—"} min</Text>}
      {draft.kind === "booking" && <>{field("phone", "Teléfono (opcional)")}{field("notes", "Observaciones (opcional)")}</>}
      {!!error && <Text testID="direct-error" accessibilityRole="alert" style={s.error}>{error}</Text>}
    </ScrollView>
    <View style={[s.footer, { paddingBottom: Math.max(12, bottomInset) }]}>
      <TouchableOpacity testID="direct-cancel" disabled={saving} onPress={onClose} style={[s.action, s.cancel]}><Text style={s.darkText}>CANCELAR</Text></TouchableOpacity>
      <TouchableOpacity testID="direct-save" disabled={saving} accessibilityRole="button" accessibilityState={{ busy: saving, disabled: saving }}
        onPress={() => void submit()} style={[s.action, s.save, saving && { opacity: 0.65 }]}><Text style={s.whiteText}>{saving ? "Guardando…" : "GUARDAR"}</Text></TouchableOpacity>
    </View>
  </KeyboardAvoidingView>;
}

const s = StyleSheet.create({
  sheet: { alignSelf: "center", width: "100%", maxWidth: 520, maxHeight: "90%", backgroundColor: "#F7F8FA", borderRadius: 20, overflow: "hidden" },
  title: { fontSize: 18, fontWeight: "700", color: "#111827", textAlign: "center", padding: 16 },
  content: { paddingHorizontal: 16, gap: 10, paddingBottom: 12 },
  row: { flexDirection: "row", gap: 8 },
  field: { gap: 5 }, label: { fontSize: 14, color: "#374151", fontWeight: "600" },
  input: { minHeight: 44, borderWidth: 1, borderColor: "#BCC6D0", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16, color: "#111827", backgroundColor: "#FFFFFF" },
  choice: { minHeight: 44, flexShrink: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#BCC6D0", backgroundColor: "#FFFFFF" },
  selected: { backgroundColor: "#DEF0E9", borderColor: "#3D9A84", borderWidth: 2 },
  choiceText: { color: "#111827", fontSize: 15, fontWeight: "600" }, summary: { fontSize: 16, color: "#111827" },
  error: { color: "#A32121", fontSize: 14 }, footer: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingTop: 10 },
  action: { minHeight: 48, flex: 1, minWidth: 0, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 8 },
  cancel: { backgroundColor: "#E5E7EB" }, save: { backgroundColor: "#3D9A84" },
  darkText: { color: "#111827", fontSize: 15, fontWeight: "700" }, whiteText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
});
