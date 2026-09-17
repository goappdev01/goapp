import React, { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  Booking,
  getAuthenticatedUserId,
  getMyBookings,
} from "@/data/booking";

function formatBookingDate(booking: Booking): string {
  const date = booking.startDatetime.slice(0, 10);
  const time = booking.startDatetime.slice(11, 16);
  return `${date.split("-").reverse().join("/")} · ${time}`;
}

function statusLabel(status: Booking["status"]): string {
  switch (status) {
    case "CONFIRMED":
      return "Confirmada";
    case "HOLD":
      return "Pendiente";
    case "COMPLETED":
      return "Completada";
    case "CANCELLED":
      return "Cancelada";
    default:
      return status;
  }
}

export function MyBookingsList({ visible }: { visible: boolean }) {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const customerId = await getAuthenticatedUserId();
      if (!customerId) {
        if (!cancelled) {
          setBookings([]);
          setLoading(false);
        }
        return;
      }
      try {
        const result = await getMyBookings(customerId);
        if (!cancelled) setBookings(result.slice(0, 3));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })().catch(() => {
      if (!cancelled) {
        setBookings([]);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [visible]);

  if (!visible || (!loading && bookings.length === 0)) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.heading}>
        <Feather name="calendar" size={14} color="#8AD8FF" />
        <Text style={styles.headingText}>MIS RESERVAS</Text>
      </View>
      {loading ? (
        <ActivityIndicator color="#8AD8FF" size="small" />
      ) : (
        bookings.map((booking) => (
          <View key={booking.id} style={styles.card}>
            <View style={styles.cardIcon}>
              <Feather name="clock" size={14} color="#8AD8FF" />
            </View>
            <View style={styles.cardBody}>
              <Text style={styles.date}>{formatBookingDate(booking)}</Text>
              <Text style={styles.meta} numberOfLines={1}>
                {statusLabel(booking.status)}
              </Text>
            </View>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 8,
    marginBottom: 14,
    paddingHorizontal: 20,
  },
  heading: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 2,
  },
  headingText: {
    color: "rgba(255,255,255,0.62)",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.5,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderColor: "rgba(138,216,255,0.20)",
    backgroundColor: "rgba(138,216,255,0.06)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  cardIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(138,216,255,0.10)",
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  date: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "800",
  },
  meta: {
    color: "rgba(255,255,255,0.46)",
    fontSize: 11,
    fontWeight: "600",
  },
});