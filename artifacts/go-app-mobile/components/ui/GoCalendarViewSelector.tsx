import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";

type CalendarView = "dia" | "semana" | "mes_lineal";
type Props = {
  value: CalendarView;
  onChange: (value: CalendarView) => void;
};

export function GoCalendarViewSelector({ value, onChange }: Props) {
  const { lang } = useLanguage();
  const [open, setOpen] = useState(false);
  const labels: Record<CalendarView, string> = lang === "en"
    ? { dia: "DAY", semana: "WEEK", mes_lineal: "MONTH" }
    : { dia: "DÍA", semana: "SEMANA", mes_lineal: "MES" };
  return (
    <View style={styles.root}>
      <TouchableOpacity
        onPress={event => { event.stopPropagation(); setOpen(current => !current); }}
        accessibilityRole="button"
        accessibilityLabel={lang === "en" ? `Calendar view: ${labels[value]}` : `Vista del calendario: ${labels[value]}`}
        accessibilityState={{ expanded: open }}
        style={styles.trigger}
      >
        <Text style={styles.label}>{labels[value]}</Text>
        <Feather name={open ? "chevron-up" : "chevron-down"} size={14} color="#ffffff" />
      </TouchableOpacity>
      {open && (
        <View style={styles.options}>
          {(["dia", "semana", "mes_lineal"] as const).map(view => (
            <TouchableOpacity
              key={view}
              accessibilityRole="button"
              accessibilityState={{ selected: value === view }}
              onPress={event => { event.stopPropagation(); onChange(view); setOpen(false); }}
              style={[styles.option, value === view && styles.selected]}
            >
              <Text style={styles.label}>{labels[view]}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { alignItems: "center" },
  trigger: { minHeight: 44, paddingHorizontal: 12, gap: 8, flexDirection: "row", alignItems: "center", borderRadius: 16, backgroundColor: "#0e0e10" },
  label: { color: "#ffffff", fontSize: 11, fontWeight: "700", letterSpacing: 0.8 },
  options: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, paddingTop: 6 },
  option: { minHeight: 44, paddingHorizontal: 10, justifyContent: "center", borderRadius: 14, backgroundColor: "#0e0e10", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  selected: { borderColor: "#00e5ff", backgroundColor: "#123542" },
});
