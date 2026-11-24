import React from "react";
import { Text, View } from "react-native";
import type { BookingPaymentTerms } from "@/data/bookingServices";

/** An agreed split, never a receipt or confirmation that money was collected. */
export function PartialPaymentSummary({ terms, lang }: { terms: BookingPaymentTerms; lang: string }) {
  const money = (cents: number) => `${(cents / 100).toLocaleString(lang === "en" ? "en-GB" : "es-ES", {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })} €`;
  const line = (label: string, percent: number, cents: number) => `${label} · ${percent} % · ${money(cents)}`;
  const gold = "#FACC15";
  return <View testID="partial-payment-summary" style={{ marginTop: 6, borderWidth: 1, borderColor: "#B89B2C",
    borderRadius: 12, backgroundColor: "rgba(0,0,0,0.18)", paddingHorizontal: 12, paddingVertical: 9 }}>
    <Text style={{ color: gold, fontSize: 14, fontWeight: "700", lineHeight: 21, flexShrink: 1 }}>
      {line(lang === "en" ? "At booking" : "Al reservar", terms.bookingPercent, terms.dueAtBookingCents)}
    </Text>
    <View style={{ height: 1, backgroundColor: "#B89B2C", marginVertical: 8 }} />
    <Text style={{ color: gold, fontSize: 14, fontWeight: "700", lineHeight: 21, flexShrink: 1 }}>
      {line(lang === "en" ? "At the venue" : "En el establecimiento", terms.venuePercent, terms.dueAtVenueCents)}
    </Text>
  </View>;
}
