import React from "react";
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
import type { DockPosition } from "@workspace/api-zod";
import { useBookingAssistant } from "@/hooks/useBookingAssistant";
import {
  Action,
  Choice,
  IconButton,
  bookingDate,
  canCancel,
  s,
} from "./BookingAssistantUI";

import { GO_TASK_CREATION_ONLY, type useGoActions } from "@/hooks/useGoActions";
type Assistant = ReturnType<typeof useBookingAssistant>;
export function BookingAssistantPanels({
  a,
  go,
  bottom,
  position,
  setPosition,
  attach,
  voicePlace,
  viewReservation,
}: {
  a: Assistant;
  go: ReturnType<typeof useGoActions>;
  bottom: number;
  position: DockPosition;
  setPosition: (p: DockPosition) => void;
  attach: (kind: "camera" | "photos" | "file") => void;
  voicePlace: () => void;
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
            : a.panel === "ergonomics"
              ? "Posición de GO"
              : a.panel === "bookings"
                ? "Mis reservas"
                : a.panel === "staff"
                  ? "Profesional"
                  : a.panel === "cancel"
                    ? "Cancelar reserva"
                    : "Ayuda de GO";
  const disabled = !!a.busy;
  return (
    <View style={s.scrim}>
      <TouchableOpacity
        style={StyleSheet.absoluteFill}
        accessibilityLabel="Cerrar panel"
        onPress={() => !disabled && a.setPanel(null)}
      />
      <View style={[s.sheet, { paddingBottom: Math.max(16, bottom) }]}>
        <View style={s.sheetHeader}>
          <Text style={s.sectionTitle}>{title}</Text>
          <IconButton
            icon="x"
            label="Cerrar panel"
            disabled={disabled}
            onPress={() => a.setPanel(null)}
          />
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
          {a.panel === "ergonomics" &&
            (["right", "center", "left"] as DockPosition[]).map((value) => (
              <Choice
                key={value}
                title={
                  (value === "right"
                    ? "Diestro · GO a la derecha"
                    : value === "left"
                      ? "Zurdo · GO a la izquierda"
                      : "Central · GO en el centro") +
                  (position === value ? " ✓" : "")
                }
                onPress={() => setPosition(value)}
              />
            ))}
          {a.panel === "zone" && (
            <>
              <Text style={s.sectionTitle}>¿Dónde quieres buscar?</Text>
              <Text style={s.caption}>
                Población, código postal, dirección o zona. Tú eliges el
                destino.
              </Text>
              <TextInput
                accessibilityLabel="Centro de búsqueda"
                value={a.placeText}
                onChangeText={a.setPlaceText}
                placeholder="Ej. Cieza o Gran Vía, Madrid"
                placeholderTextColor="#56686B"
                style={s.field}
                maxLength={200}
              />
              <Action
                text="Buscar ubicación"
                onPress={() => void a.searchPlaces()}
                disabled={disabled || a.placeText.trim().length < 2}
              />
              <Action
                text="Decir el lugar por voz"
                onPress={voicePlace}
                disabled={disabled}
              />
              <Action
                text="Mi ubicación actual"
                onPress={() =>
                  void a.work("Obteniendo ubicación…", async (token) => {
                    const gps = await a.gpsZone(true);
                    a.check(token);
                    if (!gps)
                      throw new Error(
                        "No hay permiso de ubicación. Puedes escribir la zona.",
                      );
                    a.setPlaces([gps]);
                    a.setPlaceText(gps.label);
                  })
                }
                disabled={disabled}
              />
              <Text style={s.sectionTitle}>¿Hasta qué distancia?</Text>
              <View style={s.chips}>
                {[0.5, 1, 2, 5, 10, 25].map((value) => (
                  <TouchableOpacity
                    accessibilityRole="button"
                    accessibilityState={{
                      selected: Number(a.radiusText) === value,
                    }}
                    key={value}
                    style={[
                      s.chip,
                      Number(a.radiusText) === value && s.activeChip,
                    ]}
                    onPress={() => a.setRadiusText(String(value))}
                  >
                    <Text style={s.chipText}>
                      {value === 0.5 ? "500 m" : value + " km"}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={s.caption}>Personalizado (km)</Text>
              <TextInput
                accessibilityLabel="Distancia personalizada en kilómetros"
                value={a.radiusText}
                onChangeText={a.setRadiusText}
                keyboardType="decimal-pad"
                style={s.field}
                placeholder="Personalizado (km)"
              />
              <Action
                text={
                  (a.saveZone ? "✓ " : "") + "Recordar como mi zona habitual"
                }
                onPress={() => a.setSaveZone((value) => !value)}
                disabled={disabled}
              />
              {a.places.map((place, index) => (
                <Choice
                  key={place.label + index}
                  title={place.label}
                  onPress={() =>
                    void a.chooseZone(
                      place,
                      place.label === "Mi ubicación actual" ? "gps" : "manual",
                    )
                  }
                  disabled={disabled}
                />
              ))}
              {a.zone && !a.places.length && a.placeText === a.zone.label && (
                <Action
                  text="Aplicar a esta búsqueda"
                  primary
                  onPress={() => void a.chooseZone(a.zone!, a.zone!.source)}
                  disabled={disabled}
                />
              )}
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
        {!!(a.busy || a.notice) && (
          <Text accessibilityLiveRegion="polite" style={s.statusText}>
            {a.busy || a.notice}
          </Text>
        )}
      </View>
    </View>
  );
}
