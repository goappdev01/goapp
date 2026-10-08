import { AssistantCloseControls } from "./AssistantCloseControls";
import React, { useState } from "react";
import {
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useBookingAssistant } from "@/hooks/useBookingAssistant";
import {
  Action,
  Choice,
  bookingDate,
  canCancel,
  s,
  z,
} from "./BookingAssistantUI";

import { GO_TASK_CREATION_ONLY, type useGoActions } from "@/hooks/useGoActions";
type Assistant = ReturnType<typeof useBookingAssistant>;
export function BookingAssistantPanels({
  a,
  go,
  bottom,
  dock,
  viewport,
  voiceStatus,
  saving,
  onClosePanel,
  attach,
  viewReservation,
}: {
  a: Assistant;
  go: ReturnType<typeof useGoActions>;
  bottom: number;
  dock: React.ReactNode;
  viewport: { width: number; height: number };
  voiceStatus: string;
  saving: boolean;
  onClosePanel: () => void;
  attach: (kind: "camera" | "photos" | "file") => void;
  viewReservation: () => void;
}) {
  const title =
    a.panel === "zone"
      ? "Zona de búsqueda"
      : a.panel === "menu"
        ? "Menú"
        : a.panel === "attach"
          ? "Adjuntar referencia"
          : a.panel === "actions"
            ? "Acciones"
              : a.panel === "bookings"
                ? "Mis reservas"
                : a.panel === "staff"
                  ? "Profesional"
                  : a.panel === "cancel"
                    ? "Cancelar reserva"
                    : "Ayuda de GO";
  const disabled = !!a.busy;
  const [dockHeight, setDockHeight] = useState(84);
  return (
    <View style={s.scrim}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Cerrar panel"
        onPress={() => !saving && onClosePanel()}
      />
      <View style={[s.sheet, { paddingBottom: Math.max(16, bottom) }]}>
        <View style={s.sheetHeader}>
          <Text style={a.panel === "zone" ? z.sectionTitle : s.sectionTitle}>{title}</Text>
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          {a.panel === "menu" && (
            <>
              <Action text="Nueva conversación" onPress={a.reset} />
              <Action
                text="Mis reservas"
                onPress={() => void a.showBookings()}
              />
              <Action
                text="Ayuda de GO"
                onPress={() => a.setPanel("help")}
              />
            </>
          )}
          {a.panel === "help" && (
            <Text style={s.body}>
              Di o escribe qué necesitas reservar o qué tarea quieres crear, consultar, cambiar o eliminar. Las tareas pueden quedar sin fecha ni hora. Revisa los cambios y confirma antes de eliminar. Zona permite
              elegir el centro y la distancia de búsqueda. Toca GO para hablar y
              vuelve a tocar para enviar. Selecciona una opción y confirma su
              resumen para crear la reserva. Si la voz no está disponible,
              puedes escribir. Las reservas ya creadas se conservan al iniciar
              una nueva conversación.
            </Text>
          )}
          {a.panel === "attach" && (
            <>
              {Platform.OS !== "web" && (
                <Action text="Cámara" onPress={() => attach("camera")} />
              )}
              <Action text="Fotos" onPress={() => attach("photos")} />
              <Action text="Archivo" onPress={() => attach("file")} />
              <Text style={s.caption}>
                Puedes guardar referencias en esta conversación. GO aún no
                interpreta su contenido; describe la información que debe
                utilizar.
              </Text>
            </>
          )}
          {a.panel === "zone" && (
            <>
              <Text style={z.sectionTitle}>¿Dónde quieres buscar?</Text>
              <Text style={z.caption}>
                Población, código postal, dirección o zona. Tú eliges el
                destino.
              </Text>
              <TextInput
                accessibilityLabel="Centro de búsqueda"
                editable={!disabled}
                value={a.placeText}
                onChangeText={a.setPlaceQuery}
                placeholder="Ej. Cieza o Gran Vía, Madrid"
                placeholderTextColor="#6B7280"
                style={z.field}
                maxLength={200}
              />
              <Action tools
                text={a.placeBusy ? "Buscando ubicación…" : "Buscar ubicación"}
                onPress={() => void a.searchPlaces()}
                disabled={disabled || a.placeBusy || a.placeText.trim().length < 2}
              />
              <Action tools
                text="Mi ubicación actual"
                onPress={() =>
                  void a.work("Obteniendo ubicación…", async (token) => {
                    const gps = await a.gpsZone(true);
                    a.check(token);
                    if (!gps)
                      throw new Error(
                        "No hay permiso de ubicación. Puedes escribir la zona.",
                      );
                    a.pickPlace(gps, "gps");
                  })
                }
                disabled={disabled}
              />
              {!!(a.placeBusy || a.placeNotice) && <Text accessibilityLiveRegion="polite" style={z.caption}>
                {a.placeBusy ? "Buscando ubicaciones…" : a.placeNotice}
              </Text>}
              {a.places.map((place, index) => <Choice tools key={place.label + index}
                title={place.label} onPress={() => a.pickPlace(place)} disabled={disabled} />)}
              {a.pendingPlace && <>
                <Text style={z.sectionTitle}>Pendiente de aplicar: {a.pendingPlace.label}</Text>
                <Action tools primary text="Aplicar a esta búsqueda" disabled={disabled}
                  onPress={() => void a.chooseZone(a.pendingPlace!, a.pendingPlace!.source)} />
              </>}
              {a.zone && <Text style={z.caption}>Zona aplicada: {a.zone.label} · {a.zone.radiusKm} km</Text>}
              <Text style={z.sectionTitle}>¿Hasta qué distancia?</Text>
              <View style={s.chips}>
                {[0.5, 1, 2, 5, 10, 25].map((value) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: Number(a.radiusText) === value,
                    }}
                    key={value}
                    style={[
                      s.chip, z.chip,
                      Number(a.radiusText) === value && z.activeChip,
                    ]}
                    onPress={() => a.setRadiusText(String(value))}
                  >
                    <Text style={z.chipText}>
                      {value === 0.5 ? "500 m" : value + " km"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={z.caption}>Personalizado (km)</Text>
              <TextInput
                accessibilityLabel="Distancia personalizada en kilómetros"
                value={a.radiusText}
                onChangeText={a.setRadiusText}
                keyboardType="decimal-pad"
                style={z.field}
                placeholder="Personalizado (km)"
              />
              <Action tools
                text={
                  (a.saveZone ? "✓ " : "") + "Recordar como mi zona habitual"
                }
                onPress={() => a.setSaveZone((value) => !value)}
                disabled={disabled}
              />
            </>
          )}
          {a.panel === "actions" && (
            <>
              {go.active === "task" || go.active === "event" ? (
                <>
                  <Action text={go.active === "task" ? "Crear otra tarea" : "Añadir otra actividad"}
                    onPress={() => go.start(go.active as "task" | "event")} />
                  <Text style={s.caption}>Tus acciones se encuentran en Tareas y, si tienen fecha, en Calendario.</Text>
                </>
              ) : go.active === "list" ? (
                <>
                  {!GO_TASK_CREATION_ONLY && <Action text="Abrir lista" onPress={() => void go.showLists()} />}
                  <Action text="Crear otra lista" onPress={() => go.start("list")} />
                  <Text style={s.caption}>Di qué elementos quieres añadir o quitar y el nombre de la lista.</Text>
                </>
              ) : go.active === null ? (
                <>
                  <Action text="Crear tarea" onPress={() => go.start("task")} />
                  <Action text="Añadir al calendario" onPress={() => go.start("event")} />
                  {!GO_TASK_CREATION_ONLY && <Action text="Crear lista" onPress={() => go.start("list")} />}
                  {!GO_TASK_CREATION_ONLY && <Action text="Abrir lista" onPress={() => void go.showLists()} />}
                  <Action text="Buscar una reserva" onPress={() => go.start("booking")} />
                </>
              ) : a.phase === "confirmed" && a.created ? (
                <>
                  <Action text="Ver reserva" onPress={viewReservation} />
                  {canCancel(a.created) && (
                    <Action
                      text="Cancelar reserva"
                      onPress={() => {
                        a.setCancelTarget(a.created);
                        a.setPanel("cancel");
                      }}
                    />
                  )}
                  {a.option?.business.phone && (
                    <Action
                      text={"Contactar con " + a.option.business.name}
                      onPress={() =>
                        void Linking.openURL(
                          "tel:" +
                            a.option!.business.phone.replace(/[^\d+]/g, ""),
                        )
                      }
                    />
                  )}
                </>
              ) : a.phase !== "idle" || a.request.serviceQuery ? (
                <>
                  <Action
                    text="Cambiar fecha/hora"
                    onPress={() =>
                      a.changeField(
                        "date",
                        "Dime la nueva fecha o franja horaria.",
                      )
                    }
                  />
                  {!!a.selection.current.service && a.staff.length > 0 && (
                    <Action
                      text="Cambiar profesional"
                      onPress={() => a.setPanel("staff")}
                    />
                  )}
                  <Action
                    text="Cambiar servicio"
                    onPress={() =>
                      a.changeField(
                        "serviceQuery",
                        "¿Qué servicio quieres buscar ahora?",
                      )
                    }
                  />
                  <Action text="Cancelar búsqueda" onPress={a.reset} />
                </>
              ) : (
                <Action
                  text="Buscar una reserva"
                  onPress={() => {
                    a.setPanel(null);
                    a.changeField("serviceQuery", "¿Qué quieres reservar?");
                  }}
                />
              )}
              <Action
                text="Ver mis reservas"
                onPress={() => void a.showBookings()}
              />
            </>
          )}
          {a.panel === "staff" && (
            <>
              <Action
                text="Cualquier profesional disponible"
                onPress={() => a.chooseStaff()}
              />
              {a.staff.map((person) => (
                <Choice
                  key={person.id}
                  title={person.name}
                  onPress={() => a.chooseStaff(person)}
                />
              ))}
            </>
          )}
          {a.panel === "bookings" && (
            <>
              {!disabled && !a.bookings.length && !a.notice && (
                <Text style={s.body}>No hay reservas que mostrar.</Text>
              )}
              {a.bookings.map((booking) => (
                <View key={booking.id} style={s.card}>
                  <Text style={s.sectionTitle}>
                    {a.names.businesses.find((b) => b.id === booking.businessId)
                      ?.name || "Reserva GO"}
                  </Text>
                  <Text style={s.body}>
                    {a.names.services.find(
                      (service) => service.id === booking.bookableItemId,
                    )?.title || "Servicio de la reserva"}
                  </Text>
                  <Text style={s.body}>
                    {bookingDate(booking.startDatetime)}
                  </Text>
                  <Text style={s.caption}>
                    {booking.status === "CONFIRMED"
                      ? "Confirmada"
                      : booking.status === "CANCELLED"
                        ? "Cancelada"
                        : booking.status === "HOLD"
                          ? "Pendiente"
                          : booking.status === "COMPLETED"
                            ? "Completada"
                            : booking.status}
                  </Text>
                  {canCancel(booking) && (
                    <Action
                      text="Cancelar esta reserva"
                      onPress={() => {
                        a.setCancelTarget(booking);
                        a.setPanel("cancel");
                      }}
                      disabled={disabled}
                    />
                  )}
                </View>
              ))}
            </>
          )}
          {a.panel === "cancel" && a.cancelTarget && (
            <>
              <Text style={s.body}>
                ¿Quieres cancelar la reserva del{" "}
                {bookingDate(a.cancelTarget.startDatetime)}? Se aplicarán las
                condiciones del negocio.
              </Text>
              <Action
                text="Confirmar cancelación"
                primary
                disabled={disabled}
                onPress={() => void a.confirmCancel()}
              />
              <Action
                text="Conservar reserva"
                onPress={() => a.setPanel(null)}
                disabled={disabled}
              />
            </>
          )}
        </ScrollView>
        {!!(a.busy || a.notice || voiceStatus) && (
          <Text accessibilityLiveRegion="polite" style={s.statusText}>
            {a.busy || voiceStatus || a.notice}
          </Text>
        )}
      </View>
      <View onLayout={event => setDockHeight(event.nativeEvent.layout.height)}>{dock}</View>
      <AssistantCloseControls panel disabled={saving} onClose={onClosePanel} viewport={viewport} protectedBottom={dockHeight} />
    </View>
  );
}
