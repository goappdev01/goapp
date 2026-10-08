import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AssistantCloseControls } from "./AssistantCloseControls";
import { useGoDockPreference } from "@/hooks/useGoDockPreference";
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
  useWindowDimensions,
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
  uiScale?: "compacto" | "estandar" | "grande";
  visible: boolean;
  onClose: () => void;
  onBack?: () => void;
  handedness?: "left" | "right";
  onHandednessChange?: (value: "left" | "right") => void;
}
type Attachment = { name: string; uri: string; image: boolean };

export function BookingAssistantScreen({
  visible,
  onClose,
  onBack,
  handedness = "right",
  uiScale = "estandar",
  onHandednessChange,
}: BookingAssistantProps) {
  const insets = useSafeAreaInsets();
  const goSize = uiScale === "compacto" ? 48 : uiScale === "grande" ? 72 : 64;
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: window.width, height: window.height - insets.top - insets.bottom - 68 });
  const [footerHeight, setFooterHeight] = useState(144);
  const [headerHeight, setHeaderHeight] = useState(68);
  const a = useBookingAssistant();
  const go = useGoActions(a);
  const [input, setInput] = useState("");
  const { position } = useGoDockPreference(handedness, visible);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [slotCount, setSlotCount] = useState(8);
  const hydrated = useRef(false);
  const scroll = useRef<ScrollView>(null);
  const voice = useBookingVoice((text, isZone) => {
    if (isZone) {
      a.setPlaceQuery(text);
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
      const savedZone = await AsyncStorage.getItem(ASSISTANT_ZONE_KEY);
      if (cancelled) return;
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
      a.setPlaceQuery(a.zone?.label || "");
      if (a.zone) a.pickPlace(a.zone, a.zone.source);
      a.setRadiusText(String(a.zone?.radiusKm || a.request.radiusKm || 5));
      a.setPlaces([]);
      a.setSaveZone(false);
    }
    a.setPanel(panel);
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
  const saving = ["Guardando en GO…", "Confirmando reserva…", "Cancelando reserva…"].includes(a.busy);
  const panelState = { ...a, reset };
  const dock = (
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
                    if (listening) void voice.stop();
                    else {
                      const isZone = a.panel === "zone";
                      if (!isZone) a.setPanel(null);
                      void voice.start(isZone);
                    }
                  }}
                  style={[s.dockButton, s.goButton, { width: goSize, minWidth: goSize, maxWidth: goSize, minHeight: goSize, height: goSize, borderRadius: goSize / 2, paddingVertical: goSize === 48 ? 2 : 6, gap: goSize === 48 ? 2 : 4 }, listening && s.listening]}
                >
                  <Feather
                    name={listening ? "square" : "mic"}
                    size={goSize === 48 ? 18 : 25}
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
  );
  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => (a.panel ? back() : close())}
    >
      <StatusBar style="dark" />
      <GestureHandlerRootView
        style={[
          s.root,
          { paddingTop: insets.top, paddingBottom: insets.bottom },
        ]}
      >
        <View style={s.header} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>GO · ASISTENTE</Text>
            <Text style={s.title}>¿Qué necesitas hacer?</Text>
          </View>
          {!a.panel && (a.phase === "review" || onBack) && (
            <IconButton
              icon="chevron-down"
              label="Retroceder un paso"
              onPress={back}
              disabled={!!a.busy}
            />
          )}
        </View>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={{ flex: 1 }} onLayout={event => setViewport(event.nativeEvent.layout)}>
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
            {go.manager.state && (
              <View style={s.card}>
                <Text style={s.sectionTitle}>{go.manager.state.command.operation === "delete" ? "Eliminar tarea" : "Modificar tarea"}</Text>
                {!go.manager.state.selected ? go.manager.state.entries.map((entry, i) => (
                  <Choice key={entry.id} title={(i + 1) + ". " + (entry.notes || "Sin título")}
                    subtitle={(entry.dateISO || "Sin fecha") + " · " + (entry.time || "Sin hora") + " · " + entry.estado}
                    disabled={!!a.busy} onPress={() => { voice.abort(); void go.manager.choose(entry.id); }} />
                )) : (
                  <>
                    <Detail label="Tarea" value={go.manager.state.selected.notes || "Sin título"} />
                    <Detail label="Día actual" value={go.manager.state.selected.dateISO || "Sin fecha"} />
                    <Detail label="Hora actual" value={go.manager.state.selected.time || "Sin hora"} />
                    {go.manager.state.command.operation === "update" && (
                      <>
                        <Detail label="Día después del cambio" value={go.manager.state.command.clearDate ? "Sin fecha"
                          : go.manager.state.command.date || go.manager.state.selected.dateISO || "Sin fecha"} />
                        <Detail label="Hora después del cambio" value={go.manager.state.command.times.length ? "Por confirmar"
                          : go.manager.state.command.clearTime ? "Sin hora"
                          : go.manager.state.command.time || go.manager.state.selected.time || "Sin hora"} />
                      </>
                    )}
                    {go.manager.state.command.question ? <Text style={s.body}>{go.manager.state.command.question}</Text>
                      : go.manager.state.command.times.length ? go.manager.state.command.times.map(time => (
                        <Action key={time} text={"Confirmar cambio a las " + time} disabled={!!a.busy}
                          onPress={() => { voice.abort(); void go.manager.confirm(time); }} />
                      )) : (
                        <Action text={go.manager.state.command.operation === "delete" ? "Confirmar eliminación" : "Confirmar cambios"}
                          disabled={!!a.busy} onPress={() => { voice.abort(); void go.manager.confirm(); }} />
                      )}
                  </>
                )}
                <Text style={s.caption}>Puedes decir «cancelar» para descartar esta acción.</Text>
              </View>
            )}
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
          {!a.panel && <View onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}>
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
          {dock}
          </View>}
        {a.panel && (
          <BookingAssistantPanels
            a={panelState}
            go={go}
            bottom={0}
            dock={dock}
            viewport={viewport}
            saving={saving}
            onClosePanel={() => { voice.abort(); a.invalidate(); a.setPanel(null); }}
            voiceStatus={voiceText || voice.error}
            attach={(kind) => void attach(kind)}
            viewReservation={() => {
              a.setPanel(null);
              scroll.current?.scrollToEnd({ animated: true });
            }}
          />
        )}
          </View>
        </KeyboardAvoidingView>
        {!a.panel && <AssistantCloseControls disabled={saving} onClose={close}
          viewport={{ width: viewport.width, height: viewport.height + headerHeight }}
          protectedBottom={footerHeight} topInset={insets.top} />}
      </GestureHandlerRootView>
    </Modal>
  );
}
