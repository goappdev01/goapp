import React from "react";
import { Switch, Text, View } from "react-native";
import type { CalendarWorkHoursPreference } from "@/contexts/GoBusinessConfigContext";

export function BusinessWorkHoursSwitch({ preference, lang, color }: {
  preference: CalendarWorkHoursPreference; lang: string; color: string;
}) {
  const label = lang === "en" ? "Show working hours only" : "Mostrar solo horario de trabajo";
  return <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 }}>
    <View style={{ flex: 1 }}>
      <Text style={{ color, fontSize: 14 }}>{label}</Text>
      <Text style={{ color, opacity: 0.75, fontSize: 12 }}>
        {preference.value ? (lang === "en" ? "Show working shifts" : "Mostrar franjas laborales")
          : (lang === "en" ? "Show 24 hours" : "Mostrar 24 horas")}
      </Text>
    </View>
    <Switch testID="business-calendar-work-hours" accessibilityLabel={label}
      value={preference.value} disabled={!preference.ready} onValueChange={preference.setValue} />
  </View>;
}
