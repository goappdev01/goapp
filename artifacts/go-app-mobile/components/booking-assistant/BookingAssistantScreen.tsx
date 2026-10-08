import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import {
  bookingDockOrder,
  searchZoneSchema,
  type DockPosition,
} from "@workspace/api-zod";
import { assistantApi, localToday } from "@/lib/bookingAssistant";
import {
  ASSISTANT_ZONE_KEY,
  useBookingAssistant,
  type AssistantPanel,
} from "@/hooks/useBookingAssistant";
import { useGoActions } from "@/hooks/useGoActions";
import { useBookingVoice } from "@/hooks/useBookingVoice";
import { BookingAssistantPanels } from "./BookingAssistantPanels";
import {
  Action,
  Choice,
  Detail,
  IconButton,
  bookingDate,
  money,
  s,
} from "./BookingAssistantUI";

export interface BookingAssistantProps {
  visible: boolean;
  onClose: () => void;
  onBack?: () => void;
  handedness?: "left" | "right";
  onHandednessChange?: (value: "left" | "right") => void;
}
type Attachment = { name: string; uri: string; image: boolean };
const DOCK_KEY = "go_booking_assistant_dock_v1";
export function BookingAssistantScreen({
  visible,
  onClose,
  onBack,
  handedness = "right",
  onHandednessChange,
}: BookingAssistantProps) {
  const insets = useSafeAreaInsets();
  const a = useBookingAssistant();
  const go = useGoActions(a);
  const [input, setInput] = useState("");
  const [position, setPosition] = useState<DockPosition>(handedness);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [slotCount, setSlotCount] = useState(8);
  const hydrated = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const voice = useBookingVoice((text, isZone) => {
    if (isZone) {
      a.setPlaceText(text);
      a.setPanel("zone");
      void a.searchPlaces(text);
    } else {
      setInput("");
      void go.dispatch(text, aiEnabled);
    }
  });
  useEffect(() => {
    if (!visible) {
      a.invalidate();
      voice.abort();
      return;
    }
    let cancelled = false;
    (async () => {
      const [savedDock, savedZone] = await Promise.all([
        AsyncStorage.getItem(DOCK_KEY),
        AsyncStorage.getItem(ASSISTANT_ZONE_KEY),
      ]);
      if (cancelled) return;
      try {
        const dock = JSON.parse(savedDock || "null");
        setPosition(
          dock &&
            dock.base === handedness &&
            ["left", "center", "right"].includes(dock.position)
            ? dock.position
            : handedness,
        );
      } catch {
        setPosition(handedness);
      }
      if (!hydrated.current) {
        try {
          const parsed = searchZoneSchema.safeParse(
            JSON.parse(savedZone || "null"),
          );
          if (parsed.success) {
            a.updateZone(parsed.data);
            a.setRadiusText(String(parsed.data.radiusKm));
            a.lastPlace.current = parsed.data.label;
          }
        } catch {}
        hydrated.current = true;
      }
      assistantApi<{ interpretation: boolean }>("/capabilities")
        .then((c) => {
          if (!cancelled) setAiEnabled(c.interpretation);
        })
        .catch(() => {});
      if (
        !cancelled &&
        !a.panel &&
        a.phase !== "review" &&
        a.phase !== "confirmed"
      )
        await voice.start();
    })().catch(() => {
      if (!cancelled) void voice.start();
    });
    return () => {
      cancelled = true;
      a.invalidate();
      voice.abort();
    };
    // Auto-listen only when the existing screen is opened from Landing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    AsyncStorage.getItem(DOCK_KEY)
      .then((saved) => {
        try {
          const dock = JSON.parse(saved || "null");
          setPosition(dock?.base === handedness ? dock.position : handedness);
        } catch {
          setPosition(handedness);
        }
      })
      .catch(() => {});
  }, [handedness]);
  function reset() {
    voice.abort();
    setAttachments([]);
    setInput("");
    go.reset();
    a.reset();
  }
  function openPanel(panel: AssistantPanel) {
    voice.abort();
    a.setNotice("");
    if (panel === "zone") {
      a.setPlaceText(a.zone?.label || "");
      a.setRadiusText(String(a.zone?.radiusKm || a.request.radiusKm || 5));
      a.setPlaces([]);
      a.setSaveZone(false);
    }
    a.setPanel(panel);
  }
  function changePosition(value: DockPosition) {
    setPosition(value);
    const base = value === "center" ? handedness : value;
    if (value !== "center") onHandednessChange?.(value);
    void AsyncStorage.setItem(
      DOCK_KEY,
      JSON.stringify({ position: value, base }),
    );
    a.setPanel(null);
  }
  function send() {
    if (!input.trim() || a.busy) return;
    voice.abort();
    const text = input;
    setInput("");
    void go.dispatch(text, aiEnabled);
  }
  function close() {
    if (a.busy === "Guardando en GO…" || a.busy === "Confirmando reserva…" || a.busy === "Cancelando reserva…")
      return;
    a.invalidate();
    voice.abort();
    onClose();
  }
  function back() {
    if (a.busy) return;
    if (a.panel) a.setPanel(null);
    else if (a.phase === "review") {
      a.setOption(null);
      a.setPhase("slots");
    } else onBack?.();
  }
  async function attach(kind: "camera" | "photos" | "file") {
    voice.abort();
    a.setPanel(null);
    await a.work("Abriendo adjuntos…", async (token) => {
      if (attachments.length >= 5)
        throw new Error("Puedes adjuntar hasta cinco referencias.");
      if (kind === "file") {
        const result = await DocumentPicker.getDocumentAsync({
          copyToCacheDirectory: true,
        });
        a.check(token);
        if (!result.canceled)
          setAttachments((prev) => [
            ...prev,
            {
              name: result.assets[0].name,
              uri: result.assets[0].uri,
              image: result.assets[0].mimeType?.startsWith("image/") || false,
            },
          ]);
      } else {
        if (kind === "camera") {
          const permission = await ImagePicker.requestCameraPermissionsAsync();
          a.check(token);
          if (!permission.granted)
            throw new Error(
              "Permite el acceso a la cámara para hacer una foto.",
            );
        }
        const result = await (kind === "camera"
          ? ImagePicker.launchCameraAsync({ quality: 0.6 })
          : ImagePicker.launchImageLibraryAsync({
              mediaTypes: ["images"],
              quality: 0.6,
            }));
        a.check(token);
        if (!result.canceled)
          setAttachments((prev) => [
            ...prev,
            {
              name: result.assets[0].fileName || "Foto",
              uri: result.assets[0].uri,
              image: true,
            },
          ]);
      }
    });
  }
  const listening = voice.status === "listening";
  const voiceText = listening
    ? voice.transcript || "GO está escuchando… Toca GO para terminar."
    : voice.status === "preparing"
      ? "Preparando micrófono…"
      : voice.status === "transcribing"
        ? "Transcribiendo…"
        : "";
  const micDisabled =
    !!a.busy || voice.status === "preparing" || voice.status === "transcribing";
  const panelState = { ...a, reset };
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => (a.panel ? back() : close())}
    >
      <StatusBar style="dark" />
      <View
        style={[
          s.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>GO · ASISTENTE</Text>
            <Text style={s.title}>¿Qué necesitas hacer?</Text>
          </View>
          <IconButton
            icon="sliders"
            label="Posición del botón GO"
            onPress={() => openPanel("ergonomics")}
            disabled={!!a.busy}
          />
          {(a.panel || a.phase === "review" || onBack) && (
            <IconButton
              icon="chevron-down"
              label="Retroceder un paso"
              onPress={back}
              disabled={!!a.busy}
            />
          )}
          <IconButton
            icon="chevrons-down"
            label="Ir al Landing"
            onPress={close}
            disabled={
              a.busy === "Guardando en GO…" || a.busy === "Confirmando reserva…" ||
              a.busy === "Cancelando reserva…"
            }
          />
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <ScrollView
            ref={scroll}
            contentContainerStyle={s.conversation}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() =>
              scroll.current?.scrollToEnd({ animated: true })
            }
          >
            {a.messages.map((message) => (
              <View
                key={message.id}
                style={[
                  s.bubble,
                  message.role === "user" ? s.userBubble : s.goBubble,
                ]}
              >
                <Text style={[s.role, message.role === "user" && s.userText]}>
                  {message.role === "user" ? "TÚ" : "GO"}
                </Text>
                <Text
                  style={[s.body, message.role === "user" && s.userText]}
                  selectable
                >
                  {message.text}
                </Text>
              </View>
            ))}
            {go.review && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Revisa la tarea</Text>
                <Detail label="Título" value={go.review.action.title || ""} />
                <Detail label="Tipo" value={go.review.action.kind === "event" ? "Actividad en calendario" : "Tarea interna"} />
                <Detail label="Día" value={go.review.action.date?.split("-").reverse().join("/") || "Sin fecha"} />
                <Detail label="Hora" value={go.review.times.length ? "Por confirmar" : go.review.action.time || "Sin hora"} />
                {!!go.review.action.detail && <Text style={s.caption}>{go.review.action.detail}</Text>}
                <Text style={s.body}>{go.review.reason}</Text>
                {go.review.times.length ? go.review.times.map(time => (
                  <Action key={time} text={"Guardar a las " + time} disabled={!!a.busy}
                    onPress={() => { voice.abort(); void go.confirmTask(time); }} />
                )) : (
                  <Action text="Confirmar y guardar tarea" primary disabled={!!a.busy}
                    onPress={() => { voice.abort(); void go.confirmTask(); }} />
                )}
                <Text style={s.caption}>Puedes aclararlo escribiendo o hablando con GO. Di «cancelar» para descartarlo.</Text>
              </View>
            )}
            {go.choices.map(entry => (
              <Choice key={entry.id} title={entry.notes || "Lista"}
                subtitle={entry.detail || "Lista vacía"} disabled={!!a.busy}
                onPress={() => void go.chooseList(entry)} />
            ))}
            {go.result && go.active !== "booking" && (
              <Text style={s.caption}>
                Guardado en GO en este dispositivo. {go.result.kind === "list"
                  ? "Puedes consultar y editar la lista desde tus notas."
                  : "Las acciones con fecha aparecen en tu calendario; las demás, en tus tareas."}
              </Text>
            )}
            {go.active !== "booking" && !!(a.request.serviceQuery || a.created) && (
              <Action text="Volver a la reserva" onPress={go.resumeBooking} disabled={!!a.busy} />
            )}
            {go.active === "booking" && <>
            {!!(a.request.serviceQuery || a.zone) && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>Tu búsqueda</Text>
                {a.request.serviceQuery && (
                  <Detail
                    label="Servicio"
                    value={
                      a.selection.current.service?.title ||
                      a.request.serviceQuery
                    }
                  />
                )}
                {a.selection.current.business && (
                  <Detail
                    label="Empresa"
                    value={a.selection.current.business.name}
                  />
                )}
                {(a.zone || a.request.placeQuery) && (
                  <Detail
                    label="Zona"
                    value={
                      a.zone?.label || a.request.placeQuery + " · por localizar"
                    }
                  />
                )}
                {(a.request.radiusKm || a.zone) && (
                  <Detail
                    label="Radio"
                    value={
                      (a.request.radiusKm || a.zone?.radiusKm) +
                      " km · distancia aproximada"
                    }
                  />
                )}
                {a.request.date && (
                  <Detail
                    label="Día"
                    value={a.request.date.split("-").reverse().join("/")}
                  />
                )}
                {a.request.timeFrom && (
                  <Detail
                    label="Franja"
                    value={
                      a.request.timeFrom === a.request.timeTo
                        ? a.request.timeFrom
                        : a.request.timeFrom +
                          "–" +
                          (a.request.timeTo || "23:59")
                    }
                  />
                )}
              </View>
            )}
            {a.phase === "businesses" &&
              a.businesses.map((result) => (
                <Choice
                  key={result.business.id}
                  title={result.business.name}
                  subtitle={
                    result.business.location +
                    (result.distance !== undefined
                      ? " · ~" + result.distance.toFixed(1) + " km"
                      : "") +
                    (result.explicit ? " · Empresa solicitada" : "")
                  }
                  disabled={!!a.busy}
                  onPress={() => {
                    a.selection.current = { business: result.business };
                    void a.work("Consultando servicios…", (token) =>
                      a.advance(a.request, token),
                    );
                  }}
                />
              ))}
            {a.phase === "services" &&
              a.services.map((service) => (
                <Choice
                  key={service.id}
                  title={service.title}
                  subtitle={
                    service.durationMinutes + " min · " + money(service)
                  }
                  disabled={!!a.busy}
                  onPress={() => {
                    a.selection.current.service = service;
                    void a.work("Consultando disponibilidad…", (token) =>
                      a.advance(a.request, token),
                    );
                  }}
                />
              ))}
            {a.phase === "slots" && !a.request.date && (
              <Choice
                title="Elegir fecha"
                subtitle="Escribe el día, por ejemplo «mañana por la tarde»."
                onPress={() => {
                  voice.abort();
                  setInput(localToday());
                }}
                disabled={!!a.busy}
              />
            )}
            {a.phase === "slots" &&
              a.slots.slice(0, slotCount).map((slot) => (
                <Choice
                  key={slot.slot.startDatetime + (slot.staff?.id || "")}
                  title={bookingDate(slot.slot.startDatetime)}
                  subtitle={[
                    slot.service.title,
                    slot.staff?.name,
                    money(slot.service),
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  disabled={!!a.busy}
                  onPress={() => {
                    voice.abort();
                    a.setOption(slot);
                    a.setPhase("review");
                  }}
                />
              ))}
            {a.phase === "slots" && a.slots.length > slotCount && (
              <Action
                text="Ver más horarios"
                onPress={() => setSlotCount((count) => count + 8)}
              />
            )}
            {(a.phase === "review" || a.phase === "confirmed") && a.option && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>
                  {a.phase === "confirmed"
                    ? a.created?.status === "CANCELLED"
                      ? "Reserva cancelada"
                      : "Reserva confirmada"
                    : "Revisa tu reserva"}
                </Text>
                <Detail label="Empresa" value={a.option.business.name} />
                <Detail label="Servicio" value={a.option.service.title} />
                {a.option.staff && (
                  <Detail label="Profesional" value={a.option.staff.name} />
                )}
                <Detail
                  label="Cuándo"
                  value={bookingDate(a.option.slot.startDatetime)}
                />
                <Detail label="Precio" value={money(a.option.service)} />
                {a.option.business.cancellationPolicy?.label && (
                  <Text style={s.caption}>
                    {a.option.business.cancellationPolicy.label}
                  </Text>
                )}
                {a.phase === "review" ? (
                  <>
                    <Text style={s.caption}>
                      Revisa los datos. La reserva se creará cuando la
                      confirmes.
                    </Text>
                    <Action
                      text={a.busy || "Confirmar reserva"}
                      primary
                      onPress={() => {
                        voice.abort();
                        void a.confirm();
                      }}
                      disabled={!!a.busy}
                    />
                    <Action
                      text="Elegir otro horario"
                      onPress={() => {
                        a.setOption(null);
                        a.setPhase("slots");
                      }}
                      disabled={!!a.busy}
                    />
                  </>
                ) : (
                  <Action
                    text="Ver mis reservas"
                    onPress={() => void a.showBookings()}
                    disabled={!!a.busy}
                  />
                )}
              </View>
            )}
            </>}
          </ScrollView>
          {!!(a.busy || voiceText || a.notice || voice.error) && (
            <View style={s.status} accessibilityLiveRegion="polite">
              {!!a.busy && <ActivityIndicator size="small" color="#174D3C" />}
              <Text style={s.statusText}>
                {a.busy || a.notice || voiceText || voice.error}
              </Text>
            </View>
          )}
          {attachments.length > 0 && (
            <>
              <ScrollView
                horizontal
                style={{ maxHeight: 72, backgroundColor: "#FFF" }}
                contentContainerStyle={{ gap: 8, padding: 10 }}
              >
                {attachments.map((item, i) => (
                  <View key={item.uri + i} style={s.attachment}>
                    {item.image && (
                      <Image
                        source={{ uri: item.uri }}
                        style={{ width: 36, height: 36, borderRadius: 6 }}
                      />
                    )}
                    <Text style={s.caption} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <IconButton
                      icon="x"
                      label={"Quitar " + item.name}
                      onPress={() =>
                        setAttachments((prev) => prev.filter((_, j) => j !== i))
                      }
                    />
                  </View>
                ))}
              </ScrollView>
              <Text style={s.attachmentHint}>
                Referencia adjunta. Describe qué necesitas hacer a partir de
                ella.
              </Text>
            </>
          )}
          <View style={s.composer}>
            <TextInput
              accessibilityLabel="Solicitud a GO"
              value={input}
              onChangeText={setInput}
              placeholder="Escribe a GO…"
              placeholderTextColor="#56686B"
              style={s.input}
              multiline
              maxLength={2000}
              onFocus={() => voice.abort()}
              editable={!a.busy}
            />
            <IconButton
              icon="send"
              label="Enviar solicitud"
              onPress={send}
              disabled={!input.trim() || !!a.busy}
            />
          </View>
          <View style={s.dock}>
            {bookingDockOrder(position).map((key) =>
              key === "go" ? (
                <TouchableOpacity
                  key={key}
                  accessibilityRole="button"
                  accessibilityLabel={
                    listening ? "Detener escucha y enviar" : "Escuchar con GO"
                  }
                  accessibilityState={{
                    selected: listening,
                    disabled: micDisabled,
                  }}
                  disabled={micDisabled}
                  onPress={() => {
                    a.setPanel(null);
                    void voice.toggle();
                  }}
                  style={[s.dockButton, s.goButton, listening && s.listening]}
                >
                  <Feather
                    name={listening ? "square" : "mic"}
                    size={25}
                    color={listening ? "#FFF" : "#142D2A"}
                  />
                  <Text style={[s.dockLabel, listening && { color: "#FFF" }]}>
                    {listening ? "Parar" : "GO"}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  key={key}
                  accessibilityRole="button"
                  disabled={!!a.busy}
                  onPress={() => openPanel(key as AssistantPanel)}
                  style={s.dockButton}
                >
                  <Feather
                    name={
                      key === "menu"
                        ? "menu"
                        : key === "attach"
                          ? "paperclip"
                          : key === "actions"
                            ? "zap"
                            : "map-pin"
                    }
                    size={22}
                    color="#163F60"
                  />
                  <Text style={s.dockLabel}>
                    {key === "menu"
                      ? "Menú"
                      : key === "attach"
                        ? "Adjuntar"
                        : key === "actions"
                          ? "Acciones"
                          : "Zona"}
                  </Text>
                  {key === "zone" && a.zone && (
                    <Text style={s.radiusLabel}>{a.zone.radiusKm} km</Text>
                  )}
                </TouchableOpacity>
              ),
            )}
          </View>
        </KeyboardAvoidingView>
        {a.panel && (
          <BookingAssistantPanels
            a={panelState}
            go={go}
            bottom={insets.bottom}
            position={position}
            setPosition={changePosition}
            attach={(kind) => void attach(kind)}
            voicePlace={() => {
              a.setPanel(null);
              void voice.start(true);
            }}
            viewReservation={() => {
              a.setPanel(null);
              scroll.current?.scrollToEnd({ animated: true });
            }}
          />
        )}
      </View>
    </Modal>
  );
}
