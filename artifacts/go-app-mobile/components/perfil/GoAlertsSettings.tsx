import React, { useState } from "react";
import { Platform, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { GoAlertModePicker, useGoNotification } from "@/contexts/GoNotificationContext";
import { GO_ALERT_CATEGORIES, type GoAlertSettings } from "@/lib/goAlertPreferences";
import { scheduleGoTestNotification } from "@/lib/goNativeNotificationAdapter";

const labels: Record<(typeof GO_ALERT_CATEGORIES)[number], string> = {
  booking: "Reservas", solicitud: "Solicitudes", go: "Mensajes GO",
  pedido: "Pedidos", visita: "Visitas", task: "Tareas y alarmas",
};
const heading = { color: "#111827", fontSize: 14, fontWeight: "700" as const, marginTop: 18, marginBottom: 8 };
const row = { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const,
  minHeight: 48, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: "#E5E7EB" };

export function GoAlertsSettings() {
  const { settings, settingsReady, settingsSaving, settingsError, updateSettings, deviceHaptics, setDeviceHaptics } = useGoNotification();
  const [saving, setSaving] = useState(false);
  const [probe, setProbe] = useState("");
  const [start, setStart] = useState(settings.quietHours.start);
  const [end, setEnd] = useState(settings.quietHours.end);
  React.useEffect(() => { setStart(settings.quietHours.start); setEnd(settings.quietHours.end); }, [settings.quietHours.start, settings.quietHours.end]);
  const save = async (next: GoAlertSettings) => {
    setSaving(true);
    try { await updateSettings(next); } finally { setSaving(false); }
  };
  const time = /^([01]\d|2[0-3]):[0-5]\d$/;
  const saveHours = () => {
    if (!time.test(start) || !time.test(end)) { setProbe("Usa horas de 00:00 a 23:59."); return; }
    void save({ ...settings, quietHours: { ...settings.quietHours, start, end } });
    setProbe("");
  };
  const choice = (label: string, active: boolean, onPress: () => void) => (
    <TouchableOpacity accessibilityRole="radio" accessibilityState={{ selected: active, disabled: saving || settingsSaving }}
      disabled={saving || settingsSaving} onPress={onPress} key={label}
      style={{ minHeight: 44, minWidth: 54, paddingHorizontal: 12, justifyContent: "center", alignItems: "center",
        borderRadius: 10, borderWidth: 1, borderColor: active ? "#4A80BD" : "#CBD5E1",
        backgroundColor: active ? "#EAF3FF" : "#fff" }}>
      <Text style={{ color: "#111827", fontWeight: active ? "700" : "500" }}>{label}</Text>
    </TouchableOpacity>
  );
  if (!settingsReady) return <Text accessibilityRole="alert" style={{ color: "#6B7280", padding: 16 }}>
    {settingsError || "Cargando preferencias de tu cuenta…"}</Text>;
  return <View style={{ paddingHorizontal: 16, paddingBottom: 28 }}>
    <Text style={{ color: "#475569", fontSize: 12 }}>Preferencias guardadas en tu cuenta. Permisos y entrega dependen del dispositivo.</Text>
    {!!settingsError && <Text accessibilityRole="alert" style={{ color: "#B91C1C", marginTop: 8 }}>{settingsError}</Text>}
    <Text style={heading}>Aviso general</Text>
    <GoAlertModePicker />
    <Text style={heading}>Categorías activas</Text>
    <View style={{ backgroundColor: "#fff", borderRadius: 12, overflow: "hidden" }}>
      {GO_ALERT_CATEGORIES.map(category => <View key={category} style={row}>
        <Text style={{ color: "#111827", flex: 1 }}>{labels[category]}</Text>
        <Switch accessibilityLabel={labels[category]} value={settings.categories[category]} disabled={saving || settingsSaving}
          onValueChange={value => void save({ ...settings, categories: { ...settings.categories, [category]: value } })} />
      </View>)}
    </View>
    <Text style={heading}>Recordatorios de avisos en la aplicación</Text>
    <Text style={{ color: "#475569", fontSize: 12, marginBottom: 8 }}>Intervalo entre repeticiones</Text>
    <View style={{ flexDirection: "row", gap: 7, flexWrap: "wrap" }}>
      {([0, 15, 30, 60] as const).map(value => choice(value === 0 ? "Sin repetir" : `${value} min`, settings.intervalMinutes === value,
        () => void save({ ...settings, intervalMinutes: value, repeats: value === 0 ? 0 : Math.max(settings.repeats, 1) as 1 | 2 | 3 })))}
    </View>
    {settings.intervalMinutes > 0 && <View style={{ flexDirection: "row", gap: 7, marginTop: 9 }}>
      {([1, 2, 3] as const).map(value => choice(`${value} vez${value === 1 ? "" : "es"}`, settings.repeats === value,
        () => void save({ ...settings, repeats: value })))}
    </View>}
    <Text style={heading}>Horas de silencio</Text>
    <View style={row}><Text style={{ color: "#111827" }}>Activar horario</Text>
      <Switch accessibilityLabel="Horas de silencio" value={settings.quietHours.enabled} disabled={saving || settingsSaving}
        onValueChange={enabled => void save({ ...settings, quietHours: { ...settings.quietHours, enabled } })} /></View>
    <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
      {([ ["Desde", start, setStart], ["Hasta", end, setEnd] ] as const).map(([label, value, setter]) =>
        <View key={label} style={{ flex: 1 }}><Text style={{ color: "#475569" }}>{label}</Text>
          <TextInput accessibilityLabel={`Silencio ${label.toLowerCase()}`} value={value} onChangeText={setter}
            onBlur={saveHours} onSubmitEditing={saveHours} keyboardType="numbers-and-punctuation" maxLength={5}
            style={{ minHeight: 44, backgroundColor: "#fff", borderWidth: 1, borderColor: "#CBD5E1", borderRadius: 9,
              textAlign: "center", color: "#111827", fontSize: 16 }} /></View>)}
    </View>
    <Text style={{ color: "#475569", fontSize: 12, marginTop: 5 }}>Hora local del dispositivo. El sistema puede retrasar la entrega.</Text>
    <Text style={heading}>Este dispositivo</Text>
    <View style={row}><Text style={{ color: "#111827", flex: 1 }}>Háptica</Text>
      <Switch accessibilityLabel="Vibración de avisos GO" value={deviceHaptics}
        onValueChange={value => void setDeviceHaptics(value).catch(() => setProbe("No se pudo guardar la háptica en este dispositivo."))} />
    </View>
    {Platform.OS === "android" && <><Text style={heading}>Prioridad Android</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {choice("Normal", settings.priority === "standard", () => void save({ ...settings, priority: "standard" }))}
        {choice("Alta", settings.priority === "high", () => void save({ ...settings, priority: "high" }))}
      </View></>}
    <Text style={{ color: "#475569", fontSize: 12, marginTop: 12 }}>
      Sonido del sistema o silencio; no se controla el volumen ni se garantiza la entrega. Las alarmas de cada tarea se ajustan en su propia ficha.
    </Text>
    <Text style={{ color: "#475569", fontSize: 12, marginTop: 5 }}>
      Expo Go permite comprobar avisos locales compatibles. La entrega remota y el comportamiento final requieren una build nativa.
    </Text>
    <TouchableOpacity accessibilityRole="button" accessibilityLabel="Probar notificación local" disabled={settings.mode === "silent"}
      onPress={async () => {
        try { const result = await scheduleGoTestNotification(settings.mode === "sound");
          setProbe(result === "scheduled" ? "Prueba programada en este dispositivo para dentro de 5 segundos."
            : result === "denied" ? "Permiso de notificaciones denegado en el sistema." : "Prueba nativa no disponible aquí."); }
        catch { setProbe("No se pudo programar la notificación de prueba."); }
      }} style={{ marginTop: 16, minHeight: 48, borderRadius: 12, backgroundColor: "#4A80BD", alignItems: "center", justifyContent: "center",
        opacity: settings.mode === "silent" ? 0.5 : 1 }}>
      <Text style={{ color: "#fff", fontWeight: "700" }}>Probar notificación</Text>
    </TouchableOpacity>
    {!!probe && <Text accessibilityRole="alert" style={{ color: "#111827", marginTop: 8 }}>{probe}</Text>}
  </View>;
}
