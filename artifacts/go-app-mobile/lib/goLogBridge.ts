/**
 * Bridge that writes confirmed visits and bookings into the native go_log_v1
 * store so they appear automatically in the PRÓXIMA VISITA panel.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { GoEntry } from "@/components/AgendaOperativa";
import type { VisitaConfirmada } from "@/data/visitas";
import type { Contacto } from "@/data/contactos";
import { getBookingSlotKey } from "@/data/booking";
import type { Booking, Business, BookableItem } from "@/data/booking";

const GO_LOG_KEY = "go_log_v1";

async function loadGoLog(): Promise<GoEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(GO_LOG_KEY);
    return raw ? (JSON.parse(raw) as GoEntry[]) : [];
  } catch {
    return [];
  }
}

async function saveGoLog(entries: GoEntry[]): Promise<void> {
  console.log("[ASYNC_STORAGE_WRITE] goLogBridge.saveGoLog → go_log_v1", { count: entries.length });
  await AsyncStorage.setItem(GO_LOG_KEY, JSON.stringify(entries));
}

function visitaToGoEntry(
  visita: VisitaConfirmada,
  contacto: Contacto,
  goLogId: string
): GoEntry {
  const goEstado: GoEntry["estado"] =
    visita.estado === "cancelado"   ? "rechazado"
    : visita.estado === "realizado" ? "aceptado"
    : visita.estado === "en_ruta"   ? "aceptado"
    : visita.estado === "confirmado" ? "aceptado"
    : "pendiente";

  const lugar = [contacto.direccion, contacto.ciudad]
    .filter(Boolean)
    .join(", ");

  const dateLabel = (() => {
    try {
      return new Date(visita.fecha + "T12:00:00").toLocaleDateString("es-ES", {
        weekday: "short", day: "numeric", month: "short",
      });
    } catch {
      return visita.fecha;
    }
  })();

  return {
    id: goLogId,
    intentKey: "planificar_visita",
    intentLabel: "Visita",
    color: "#00ff88",
    place: lugar,
    date: dateLabel,
    dateISO: visita.fecha,
    time: visita.hora,
    duration: `${visita.duracionMin}min`,
    contactName: contacto.empresa || contacto.responsable || contacto.email,
    phone: contacto.telefono || "",
    estado: goEstado,
    deleted: visita.estado === "cancelado",
    notes: visita.notas || (visita.asignado ? `Asignado: ${visita.asignado}` : undefined),
    type: "GO_EXT",
    kind: "sent",
  };
}

/** Insert or update a VisitaConfirmada in the native goLog. Returns the goLogId. */
export async function syncVisitaToGoLog(
  visita: VisitaConfirmada,
  contacto: Contacto
): Promise<string> {
  const entries = await loadGoLog();
  const goLogId = visita.goLogId ?? `go_fase6_${visita.id}`;
  const entry = visitaToGoEntry(visita, contacto, goLogId);

  const idx = entries.findIndex((e) => e.id === goLogId);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }

  await saveGoLog(entries);
  return goLogId;
}

/** Remove a visita from goLog (soft-delete by marking deleted=true). */
export async function removeVisitaFromGoLog(goLogId: string): Promise<void> {
  const entries = await loadGoLog();
  const updated = entries.map((e) =>
    e.id === goLogId ? { ...e, deleted: true, estado: "rechazado" as GoEntry["estado"] } : e
  );
  await saveGoLog(updated);
}

// ── Booking → GO bridge ────────────────────────────────────────────────────────

/** Insert or update a confirmed Booking in the native goLog. Returns the goLogId. */
export async function syncBookingToGoLog(
  booking: Booking,
  business: Business,
  item: BookableItem,
  professionalName?: string,
  professionalId?: string,
): Promise<string> {
  const entries = await loadGoLog();
  const goLogId = `go_booking_${booking.id}`;

  const dateISO  = booking.startDatetime.slice(0, 10);
  const startD   = new Date(booking.startDatetime);
  const timeStr  = `${String(startD.getUTCHours()).padStart(2, "0")}:${String(startD.getUTCMinutes()).padStart(2, "0")}`;
  const durationMin = Math.round(
    (new Date(booking.endDatetime).getTime() - startD.getTime()) / 60_000
  );
  const dateLabel = (() => {
    try {
      return new Date(dateISO + "T12:00:00").toLocaleDateString("es-ES", {
        weekday: "short", day: "numeric", month: "short",
      });
    } catch { return dateISO; }
  })();

  const serviceName = item.title || "Servicio";
  const businessName = business.name || "Negocio";

  console.log("[BOOKING_BEFORE_TRANSFORM]", {
    sourceFile:     "goLogBridge.ts",
    functionName:   "syncBookingToGoLog",
    bookingId:      booking.id,
    staffId:        (booking as any).staffId    ?? undefined,
    professionalId: professionalId              ?? undefined,
    slotKey:        (booking as any).slotKey    ?? undefined,
    date:           booking.startDatetime?.slice(0, 10),
    time:           booking.startDatetime?.slice(11, 16),
  });

  const _computedSlotKey = booking.slotKey ?? getBookingSlotKey(booking);

  const entry: GoEntry = {
    id:           goLogId,
    intentKey:    "generico",
    intentLabel:  "Reserva",
    color:        business.bookingColor || "#00e5ff",
    place:        business.location || businessName,
    date:         dateLabel,
    dateISO,
    time:         timeStr,
    duration:     `${durationMin}min`,
    contactName:  businessName,
    phone:        business.phone || "",
    estado:       booking.status === "CANCELLED" ? "rechazado"
                : booking.status === "CONFIRMED"  ? "aceptado"
                : "pendiente",
    deleted:      booking.status === "CANCELLED",
    notes:        serviceName,
    type:         "GO_RESERVA",
    kind:         "sent",
    // Booking-critical fields — required for slot conflict detection
    staffId:      booking.staffId,
    slotKey:      _computedSlotKey,
    businessId:   booking.businessId,
    serviceId:    booking.bookableItemId,
    reservationId: booking.id,
    startTime:    booking.startDatetime.slice(11, 16),
    endTime:      booking.endDatetime.slice(11, 16),
    ...(professionalName ? { professionalName } : {}),
    ...(professionalId   ? { professionalId   } : {}),
  } as GoEntry;

  console.log("[BOOKING_AFTER_TRANSFORM]", {
    sourceFile:     "goLogBridge.ts",
    functionName:   "syncBookingToGoLog",
    bookingId:      booking.id,
    entryId:        goLogId,
    entryType:      "GO_RESERVA",
    staffId:        (entry as any).staffId      ?? undefined,
    professionalId: (entry as any).professionalId ?? undefined,
    slotKey:        (entry as any).slotKey      ?? undefined,
    date:           entry.dateISO,
    time:           entry.time,
  });
  if (!(entry as any).staffId || !(entry as any).slotKey) {
    console.warn("[MISSING_STAFF_OR_SLOT]", {
      sourceFile:       "goLogBridge.ts",
      functionName:     "syncBookingToGoLog",
      bookingId:        booking.id,
      entryId:          goLogId,
      staffId:          (entry as any).staffId  ?? undefined,
      professionalId:   (entry as any).professionalId ?? undefined,
      slotKey:          (entry as any).slotKey  ?? undefined,
      bookingHadStaffId:  !!(booking as any).staffId,
      bookingHadSlotKey:  !!(booking as any).slotKey,
    });
  }

  const idx = entries.findIndex(e => e.id === goLogId);
  if (idx >= 0) entries[idx] = entry;
  else entries.push(entry);

  console.log("[BOOKING_CARD_BUILD]", {
    sourceFile:     "goLogBridge.ts",
    functionName:   "syncBookingToGoLog",
    bookingId:      booking.id,
    entryId:        goLogId,
    entryType:      "GO_RESERVA",
    staffId:        (entry as any).staffId      ?? undefined,
    professionalId: (entry as any).professionalId ?? undefined,
    slotKey:        (entry as any).slotKey      ?? undefined,
    date:           entry.dateISO,
    time:           entry.time,
    action:         idx >= 0 ? "updated" : "inserted",
  });

  console.log("[WRITE_GO_LOG_SOURCE]", {
    sourceFile:     "goLogBridge.ts",
    functionName:   "syncBookingToGoLog",
    bookingId:      booking.id,
    businessId:     booking.businessId ?? undefined,
    staffId:        (booking as any).staffId    ?? undefined,
    professionalId: professionalId              ?? undefined,
    serviceId:      booking.itemId              ?? undefined,
    date:           booking.startDatetime?.slice(0, 10),
    startTime:      booking.startDatetime?.slice(11, 16),
    endTime:        booking.endDatetime?.slice(11, 16),
    slotKey:        (booking as any).slotKey    ?? undefined,
    status:         booking.status,
    entryId:        goLogId,
    entryType:      "GO_RESERVA",
  });
  if (!(booking as any).staffId || !(booking as any).slotKey) {
    console.warn("[BOOKING_CARD_MISSING_FIELDS]", {
      sourceFile:     "goLogBridge.ts",
      functionName:   "syncBookingToGoLog",
      bookingId:      booking.id,
      businessId:     booking.businessId ?? undefined,
      staffId:        (booking as any).staffId ?? undefined,
      professionalId: professionalId           ?? undefined,
      serviceId:      booking.itemId           ?? undefined,
      date:           booking.startDatetime?.slice(0, 10),
      startTime:      booking.startDatetime?.slice(11, 16),
      endTime:        booking.endDatetime?.slice(11, 16),
      slotKey:        (booking as any).slotKey ?? undefined,
      status:         booking.status,
      missingStaffId: !(booking as any).staffId,
      missingSlotKey: !(booking as any).slotKey,
    });
  }

  await saveGoLog(entries);
  return goLogId;
}

/** Sync all visitas for an agenda bulk-confirmation. */
export async function syncAllVisitasToGoLog(
  visitas: VisitaConfirmada[],
  contactoMap: Map<string, Contacto>
): Promise<Map<string, string>> {
  const entries = await loadGoLog();
  const result = new Map<string, string>();

  for (const visita of visitas) {
    const contacto = contactoMap.get(visita.contactoId);
    if (!contacto) continue;

    const goLogId = visita.goLogId ?? `go_fase6_${visita.id}`;
    const entry = visitaToGoEntry(visita, contacto, goLogId);
    const idx = entries.findIndex((e) => e.id === goLogId);
    if (idx >= 0) {
      entries[idx] = entry;
    } else {
      entries.push(entry);
    }
    result.set(visita.id, goLogId);
  }

  await saveGoLog(entries);
  return result;
}
