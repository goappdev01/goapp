import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { NOTE_REMINDER_MINUTES, noteReminderLabel } from "@/lib/goNoteTools";

export function GoNoteReminderPicker({ value, onChange, english = false, savedNotes = [], onSelectNote, targetName, busy = false }: {
  value: number | null; onChange: (minutes: number | null) => void; english?: boolean;
  savedNotes?: Array<{ id: string; label: string }>; onSelectNote?: (id: string | null) => void; targetName?: string; busy?: boolean;
}) {
  return <View testID="note-reminder-picker" accessibilityRole="radiogroup"
    style={{ marginTop: 10, gap: 6, padding: 10, borderRadius: 12, backgroundColor: "#1a1a1c", borderWidth: 1, borderColor: "rgba(251,191,36,0.40)" }}>
    <Text style={{ color: "#ffffff", fontSize: 13, fontWeight: "700" }}>{english ? "Task reminder" : "Aviso de la tarea"}</Text>
    <Text style={{ color: "#ffffff", fontSize: 12 }}>{targetName || (english ? "New note/task" : "Nueva nota/tarea")}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
      {[null, ...NOTE_REMINDER_MINUTES].map(minutes => <TouchableOpacity key={String(minutes)} accessibilityRole="radio"
        disabled={busy} accessibilityState={{ checked: value === minutes, disabled: busy }} onPress={() => onChange(minutes)}
        style={{ minHeight: 44, minWidth: 72, justifyContent: "center", paddingHorizontal: 10, paddingVertical: 8,
          borderRadius: 8, borderWidth: 1, borderColor: value === minutes ? "#fbbf24" : "rgba(255,255,255,0.25)",
          backgroundColor: value === minutes ? "rgba(251,191,36,0.18)" : "transparent" }}>
        <Text style={{ color: value === minutes ? "#fbbf24" : "#ffffff", fontSize: 12 }}>{minutes === null
          ? (english ? "No reminder" : "Sin aviso") : noteReminderLabel(minutes, english)}</Text>
      </TouchableOpacity>)}
    </View>
    <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 12 }}>{english
      ? "Saved with the task. A notification needs a future date/time and notification permission."
      : "Se guarda con la tarea. El aviso necesita fecha y hora futuras y permiso de notificaciones."}</Text>
    {targetName && <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => onSelectNote?.(null)} style={{ minHeight: 44, justifyContent: "center" }}>
      <Text style={{ color: "#ffffff", fontSize: 12 }}>{english ? "Back to new note" : "Volver a nueva nota"}</Text>
    </TouchableOpacity>}
    {!targetName && savedNotes.length > 0 && <>
      <Text style={{ color: "#ffffff", fontSize: 12, fontWeight: "700" }}>{english ? "Change a saved note reminder" : "Cambiar aviso de una nota guardada"}</Text>
      {savedNotes.map(note => <TouchableOpacity key={note.id} accessibilityRole="button" disabled={busy} onPress={() => onSelectNote?.(note.id)}
        style={{ minHeight: 44, justifyContent: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.18)" }}>
        <Text style={{ color: "#ffffff", fontSize: 12 }}>{note.label}</Text>
      </TouchableOpacity>)}
    </>}
  </View>;
}
