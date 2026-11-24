import React from "react";
import { Text, TextInput, View } from "react-native";
import { parsePartialBookingPercent } from "@/data/bookingServices";

/** Visual split only. The booking policy and its persisted value remain with the caller. */
export function BookingDepositSplitRow({ value, onChangeText, lang }: {
  value: string;
  onChangeText: (value: string) => void;
  lang: string;
}) {
  let venuePercent: number | null = null;
  try { venuePercent = 100 - parsePartialBookingPercent(value); } catch { /* Invalid draft is rejected by the existing save flow. */ }
  const bookingLabel = lang === "en" ? "At booking" : "Al reservar";
  const venueLabel = lang === "en" ? "At the venue" : "En el local";
  const field = { minHeight: 44, borderWidth: 1, borderColor: "#D1D5DB", borderRadius: 10,
    backgroundColor: "#FFFFFF", flexDirection: "row" as const, alignItems: "center" as const,
    justifyContent: "flex-end" as const, paddingHorizontal: 10 };
  return <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 10 }}>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text style={{ color: "#111827", fontSize: 13, fontWeight: "600" }}>{bookingLabel}</Text>
      <View style={field}>
        <TextInput testID="booking-deposit-percent" accessibilityLabel={lang === "en" ? "Percentage at booking" : "Porcentaje al reservar"}
          keyboardType="number-pad" value={value} onChangeText={onChangeText} maxLength={2}
          placeholder="1–99" placeholderTextColor="#6B7280"
          style={{ color: "#111827", fontSize: 17, fontWeight: "600", flex: 1, minWidth: 0,
            textAlign: "right", paddingVertical: 0 }} />
        <Text style={{ color: "#111827", fontSize: 16, marginLeft: 4 }}>%</Text>
      </View>
    </View>
    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
      <Text style={{ color: "#111827", fontSize: 13, fontWeight: "600" }}>{venueLabel}</Text>
      <View testID="booking-venue-percent" accessibilityLabel={`${venueLabel}: ${venuePercent === null ? "—" : `${venuePercent} %`}`}
        style={field}>
        <Text style={{ color: "#111827", fontSize: 17, fontWeight: "600" }}>
          {venuePercent === null ? "—" : `${venuePercent} %`}
        </Text>
      </View>
    </View>
  </View>;
}
