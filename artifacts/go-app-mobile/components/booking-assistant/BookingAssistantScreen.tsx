import { GoScreenCloseSurface, GoScreenCloseGuide } from "@/components/ui/GoScreenCloseSurface";
import { GoScreenModal as Modal } from "@/components/ui/GoScreenModal";
import type { ScrollViewInstance } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { AssistantCloseControls } from "./AssistantCloseControls";
import { GoCloseButton } from "@/components/ui/GoCloseButton";
import {GoNavigationFloating} from "@/components/ui/GoNavigationFloating";
import { SupportVoiceNotice } from "@/components/landing/SupportVoiceNotice";
import { GoToolAction, GoToolPanel, GoToolRailToggle } from "@/components/ui/GoToolRail";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Keyboard,
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
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";
import { StatusBar } from "expo-status-bar";
import { assistantApi, localToday } from "@/lib/bookingAssistant";
import {
  useBookingAssistant,
  type AssistantPanel,
} from "@/hooks/useBookingAssistant";
import { useGoActions } from "@/hooks/useGoActions";
import { useAssistantZoneScope } from "@/hooks/useAssistantZoneScope";
import { useBookingVoice } from "@/hooks/useBookingVoice";
import { ListeningIndicator, listeningPlacement } from "./ListeningIndicator";
import { BookingAssistantPanels } from "./BookingAssistantPanels";
import {
  Action,
  Choice,
  Detail,
  IconButton,
  GoSendButton,
  bookingDate,
  money,
  s,
} from "./BookingAssistantUI";

export interface BookingAssistantProps {
  /** Read-only consultation; no booking/task dispatcher or automatic draft replacement. */
  consultation?:{scopeKey:string;title:string;sourceText:string;respond?:(question:string,source:string)=>Promise<{answer:string;draft?:string}>;onAcceptDraft?:(draft:string,baseline:string)=>void};
  uiScale?: "compacto" | "estandar" | "grande";
  visible: boolean;
  listenRequest?: number;
  onClose: () => void;
  onGoToLanding?: () => void;
  onBack?: () => void;
  handedness?: "left" | "right";
  onHandednessChange?: (value: "left" | "right") => void;
}
type Attachment = { name: string; uri: string; image: boolean };

export function BookingAssistantScreen({
  visible,
  listenRequest,
  onClose,
  onGoToLanding,
  onBack,
  handedness = "right",
  uiScale = "estandar",
  onHandednessChange,
  consultation,
}: BookingAssistantProps) {
  const consumedListenRequest = useRef<number | undefined>(undefined);
  const insets = useSafeAreaInsets();
  const goSize = uiScale === "compacto" ? 48 : uiScale === "grande" ? 72 : 64;
  const window = useWindowDimensions();
  const [viewport, setViewport] = useState({ width: window.width, height: window.height - insets.top - insets.bottom - 68 });
  const [footerHeight, setFooterHeight] = useState(consultation?78:144);
  const [headerHeight, setHeaderHeight] = useState(68);
  const zoneIdentity = useAssistantZoneScope();
  const a = useBookingAssistant({ visible, scope: consultation?null:zoneIdentity.scope, scopeReady: !consultation&&zoneIdentity.ready,
    introduction:consultation?"Consulta sobre "+consultation.title.toLowerCase()+". Tu borrador permanece en AYUDA.":undefined });
  const go = useGoActions(a, !consultation&&zoneIdentity.ready ? zoneIdentity.scope : null);
  const [consultationDraft,setConsultationDraft]=useState<string|null>(null),consultationFlight=useRef(false),consultationEpoch=useRef(0);
  const consultationCurrent=useRef({visible,key:consultation?.scopeKey});consultationCurrent.current={visible,key:consultation?.scopeKey};
  const [input, setInput] = useState("");
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [voiceAttempt,setVoiceAttempt]=useState(0);
  const followEnd = useRef(true);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [slotCount, setSlotCount] = useState(8);
  const scroll = useRef<ScrollViewInstance>(null);
  const panelScroll = useRef<ScrollViewInstance>(null);
  const [conversationLayout, setConversationLayout] = useState({ width: 0, height: 0 });
  const [conversationMeasurement, setConversationMeasurement] = useState({ height: 0, messages: -1 });
  const voice = useBookingVoice((text, isZone) => {
    if(consultation){setInput(text);void consult(text);}
    else if (isZone) {
      a.setPlaceQuery(text);
      a.setPanel("zone");
      void a.searchPlaces(text);
    } else {
      setInput("");
      void go.dispatch(text, aiEnabled);
    }
  },{requireTranscriptionReady:!!consultation});
  useEffect(()=>{if(!consultation)return;consultationEpoch.current++;consultationFlight.current=false;setConsultationDraft(null);return()=>{consultationEpoch.current++;};},[visible,consultation?.scopeKey]);
  useEffect(() => {
    if (!visible) {
      a.invalidate();
      voice.abort();
      return;
    }
    let cancelled = false;
    assistantApi<{ interpretation: boolean }>("/capabilities")
      .then((c) => {
        if (!cancelled) setAiEnabled(c.interpretation);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      a.invalidate();
      voice.abort();
    };
    // Capabilities load on opening; zone hydration belongs to the scoped assistant hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (!visible) { setKeyboardVisible(false); return; }
    setKeyboardVisible(Keyboard.isVisible());
    const update = (shown: boolean) => (event: Parameters<typeof Keyboard.scheduleLayoutAnimation>[0]) => {
      if (event.duration > 0) Keyboard.scheduleLayoutAnimation(event);
      setKeyboardVisible(shown);
    };
    const subscriptions = [
      Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", update(true)),
      Keyboard.addListener("keyboardDidHide", update(false)),
    ];
    return () => subscriptions.forEach(subscription => subscription.remove());
  }, [visible]);
  function reset() {
    voice.abort();
    setAttachments([]);
    setInput("");
    go.reset();
    a.reset();
  }
  useEffect(() => { if (!visible) setToolsOpen(false); }, [visible]);
  useEffect(() => { if (a.panel) setToolsOpen(true); }, [a.panel]);
  function openPanel(panel: AssistantPanel) {
    Keyboard.dismiss();
    setToolsOpen(true);
    voice.abort();
    a.setNotice("");
    if (panel === "zone") { a.openZonePanel(); return; }
    a.setPanel(panel);
  }
  function send() {
    if (!input.trim() || a.busy) return;
    voice.abort();
    Keyboard.dismiss();
    const text = input;
    if(consultation){void consult(text);return;}
    setInput("");void go.dispatch(text, aiEnabled);
  }
  async function consult(text:string){
    if(!consultation||consultationFlight.current||!text.trim())return;
    if(!consultation.respond){a.setNotice("GO no puede procesar esta consulta ahora. Tu borrador sigue intacto.");return;}
    const key=consultation.scopeKey,source=consultation.sourceText,epoch=++consultationEpoch.current;
    consultationFlight.current=true;a.setBusy("Consultando GO…");a.setNotice("");
    try{const result=await consultation.respond(text,source);
      if(epoch!==consultationEpoch.current||!consultationCurrent.current.visible||consultationCurrent.current.key!==key)return;
      if(typeof result.answer!=="string"||!result.answer.trim()||result.answer.length>8000||result.draft!==undefined&&(typeof result.draft!=="string"||result.draft.length>4000))throw Error("Respuesta inválida");
      a.say(text,"user");a.say(result.answer);setConsultationDraft(consultation.onAcceptDraft?result.draft??null:null);setInput("");
    }catch{if(epoch===consultationEpoch.current&&consultationCurrent.current.visible)a.setNotice("No se pudo completar la consulta. Conservamos el texto.");}
    finally{if(epoch===consultationEpoch.current){consultationFlight.current=false;a.setBusy("");}}
  }
  function close(toLanding = false) {
    if (a.busy === "Guardando en GO…" || a.busy === "Confirmando reserva…" || a.busy === "Cancelando reserva…")
      return;
    a.invalidate();
    if(consultation){consultationEpoch.current++;consultationFlight.current=false;setConsultationDraft(null);}
    voice.abort();
    if (toLanding && onGoToLanding) onGoToLanding();
    else onClose();
  }
  function consultationBack(){
    if(keyboardVisible||Keyboard.isVisible()){Keyboard.dismiss();return;}
    close();
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
  const indicatorActive = visible && listening && !voice.error && !a.busy && !a.panel;
  const indicatorPlacement = conversationMeasurement.messages === a.messages.length
    ? listeningPlacement(conversationLayout.width, conversationLayout.height, conversationMeasurement.height, keyboardVisible) : null;
  const voiceText = listening
    ? voice.transcript || "GO está escuchando… Toca GO para terminar."
    : voice.status === "preparing"
      ? "Preparando micrófono…"
      : voice.status === "transcribing"
        ? "Transcribiendo…"
        : "";
  const micDisabled =
    !listening && (!!a.busy || voice.status === "preparing" || voice.status === "transcribing");
  const saving = ["Guardando en GO…", "Confirmando reserva…", "Cancelando reserva…"].includes(a.busy);
  const panelState = { ...a, reset };
  const dock = (
    <View style={consultation?{flexDirection:"row",alignItems:"center"}:[s.dock,{justifyContent:"center"}]}>
                <TouchableOpacity
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
                      if(consultation)setVoiceAttempt(value=>value+1);
                      const isZone = a.panel === "zone";
                      if (!isZone) a.setPanel(null);
                      void voice.start(isZone);
                    }
                  }}
                  style={[s.dockButton, s.goButton, { width: goSize, minWidth: goSize, maxWidth: goSize, minHeight: goSize, height: goSize, borderRadius: goSize / 2, paddingVertical: goSize === 48 ? 2 : 6, gap: goSize === 48 ? 2 : 4 },consultation&&{marginHorizontal:0}, listening && s.listening]}
                >
                  <Feather
                    name={listening ? "square" : "mic"}
                    size={goSize === 48 ? 18 : 25}
                    color="#FFFFFF"
                  />
                  <Text style={[s.dockLabel, s.goLabel]}>
                    {listening ? "Parar" : "GO"}
                  </Text>
                </TouchableOpacity>

      {!consultation&&(voice.status === "preparing" || voice.status === "transcribing") && <TouchableOpacity
        accessibilityRole="button" accessibilityLabel="Parar captura de micrófono" onPress={() => voice.abort()}
        style={{minWidth:64,minHeight:48,padding:10,justifyContent:"center"}}><Text style={s.dockLabel}>PARAR</Text></TouchableOpacity>}
    </View>
  );
  const navigationHeight=conversationLayout.height>=208?80:0;
  const toolBounds = { width: Math.max(0, conversationLayout.width - 24), height: Math.max(0,conversationLayout.height-navigationHeight) };
  const closeTools = () => { if (!saving) { a.setPanel(null); setToolsOpen(false); } };
  return (
    <Modal
      visible={visible}
      onShow={() => {
        if (!visible || listenRequest === undefined || consumedListenRequest.current === listenRequest) return;
        consumedListenRequest.current = listenRequest;
        void voice.start();
      }}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={() => consultation?consultationBack():(toolsOpen ? closeTools() : close())}
    >
      <StatusBar style="dark" />
      <GoScreenCloseSurface as={GestureHandlerRootView} testID="assistant-close-surface" handedness={handedness} enabled={visible && !saving} onClose={() => consultation?consultationBack():close()} scrollRefs={[scroll, panelScroll]}
        style={[
          s.root,
          consultation&&{backgroundColor:"#ffffff"},
          { paddingTop: insets.top, paddingBottom: keyboardVisible ? 0 : insets.bottom },
        ]}
      >
        <View style={s.header} onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
          <View style={{ flex: 1 }}>
            <Text style={s.eyebrow}>GO · ASISTENTE</Text>
            <Text style={s.title}>{consultation?.title??"¿Qué necesitas hacer?"}</Text>
          </View>
          {!a.panel && (a.phase === "review" || onBack) && (
            <GoCloseButton
              level="panel"
              accessibilityLabel="Retroceder un paso"
              onPress={back}
              disabled={!!a.busy}
            />
          )}
          {!consultation&&keyboardVisible&&<IconButton icon="chevron-down" label="Ocultar teclado" onPress={()=>Keyboard.dismiss()}/>}
          {!consultation&&!navigationHeight&&<GoCloseButton level="panel" accessibilityLabel="Volver a la pantalla anterior" onPress={()=>close()} disabled={saving}/>}
        </View>
        {consultation&&<SupportVoiceNotice key={consultation.scopeKey} message={voiceAttempt>0?voice.error:""} attempt={voiceAttempt}/>}
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={{ flex: 1 }} onLayout={event => setViewport(event.nativeEvent.layout)}>
          <View testID="assistant-conversation-viewport" style={{ flex: 1 }} onLayout={event => {
            const { width, height } = event.nativeEvent.layout;
            setConversationLayout(previous => previous.width === width && previous.height === height ? previous : { width, height });
          }}>
          <ScrollView
            ref={scroll}
            style={{ flex: 1 }}
            contentContainerStyle={[s.conversation, { flexGrow: 1 },!consultation&&[{paddingBottom:navigationHeight+20},handedness==="right"?{paddingRight:68}:{paddingLeft:68}]]}
            bounces={false}
            keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
            keyboardShouldPersistTaps="handled"
            scrollEventThrottle={16}
            onScroll={event => {
              const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
              followEnd.current = contentSize.height - layoutMeasurement.height - contentOffset.y < 48;
            }}
            onLayout={() => {
              if (followEnd.current) scroll.current?.scrollToEnd({ animated: false });
            }}
            onContentSizeChange={() => {
              if (followEnd.current) scroll.current?.scrollToEnd({ animated: true });
            }}
          >
            <View testID="assistant-conversation-content" style={{ gap: s.conversation.gap,paddingBottom:consultation?82:0 }} onLayout={event => {
              const height = event.nativeEvent.layout.height + s.conversation.padding + s.conversation.paddingBottom;
              setConversationMeasurement(previous => previous.height === height && previous.messages === a.messages.length
                ? previous : { height, messages: a.messages.length });
            }}>
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
            {consultation&&<>
              {consultationDraft!==null&&<View testID="assistant-draft-review" style={{padding:12,gap:8}}><Text style={s.body}>{consultationDraft}</Text><Action text="Usar propuesta en AYUDA" onPress={()=>{consultation.onAcceptDraft?.(consultationDraft,consultation.sourceText);setConsultationDraft(null);close();}}/></View>}
              {!!(a.busy||voiceText||a.notice)&&<Text accessibilityLiveRegion="polite" style={s.statusText}>{a.busy||voiceText||a.notice}</Text>}
            </>}
            </View>
          </ScrollView>
          {indicatorPlacement && (
            <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: indicatorPlacement.top, alignItems: "center" }}>
              <ListeningIndicator active={indicatorActive} diameter={indicatorPlacement.diameter} />
            </View>
          )}
          {visible&&!consultation && <View pointerEvents="box-none" style={{position:"absolute",left:12,right:12,top:0,bottom:navigationHeight}}>
            {toolsOpen && <GoToolPanel handedness={handedness} testID="assistant-tools-panel"
              style={{width:a.panel?Math.min(toolBounds.width,Math.max(288,Math.ceil(toolBounds.width*.78))):Math.ceil(toolBounds.width*.56),height:a.panel?toolBounds.height:Math.min(toolBounds.height,Math.max(144,Math.round(toolBounds.height*.60)))}}>
              {a.panel ? <BookingAssistantPanels embedded handedness={handedness} scrollRef={panelScroll} a={panelState} go={go} bottom={0} dock={null}
                viewport={toolBounds} saving={saving} onClosePanel={() => { if (!saving) a.setPanel(null); }}
                voiceStatus={voiceText || voice.error} attach={kind => void attach(kind)}
                viewReservation={() => { a.setPanel(null);setToolsOpen(false);scroll.current?.scrollToEnd({animated:true}); }}/>
              : <ScrollView keyboardShouldPersistTaps="handled" bounces={false} contentContainerStyle={handedness==="right"?{paddingRight:44}:{paddingLeft:44}}>
                <GoToolAction label="Menú" icon="menu" disabled={!!a.busy} onPress={() => openPanel("menu")}/>
                <GoToolAction label="Adjuntar" icon="paperclip" disabled={!!a.busy} onPress={() => openPanel("attach")}/>
                <GoToolAction label="Acciones" icon="zap" disabled={!!a.busy} onPress={() => openPanel("actions")}/>
                <GoToolAction label="Zona" icon="map-pin" disabled={!!a.busy} onPress={() => openPanel("zone")}/>
              </ScrollView>}
            </GoToolPanel>}
            <GoToolRailToggle bounds={toolBounds} handedness={handedness} open={toolsOpen} testID="assistant-tools-toggle"
              accessibilityLabel={toolsOpen?"Ocultar herramientas de GO":"Mostrar herramientas de GO"} disabled={saving}
              onPress={() => { if(toolsOpen)closeTools();else setToolsOpen(true); }}/>
          </View>}
          </View>
          {!consultation&&!!(a.busy || voiceText || a.notice || voice.error) && (
            <View style={s.status} accessibilityLiveRegion="polite">
              {!indicatorPlacement && <ListeningIndicator active={indicatorActive} compact />}
              {!!a.busy && <ActivityIndicator size="small" color="#174D3C" />}
              <Text style={s.statusText}>
                {a.busy || voice.error || (indicatorActive && !indicatorPlacement ? "Habla" : voiceText) || a.notice}
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
          <View onLayout={event => setFooterHeight(event.nativeEvent.layout.height)}>
          <View testID={consultation?"support-assistant-composer":undefined} style={consultation?{marginHorizontal:16,marginBottom:10,padding:6,gap:6,flexDirection:handedness==="left"?"row-reverse":"row",alignItems:"flex-end",borderWidth:1,borderColor:"#b4bdc6",borderRadius:18,backgroundColor:"#fafbfc"}:s.composer}>
            <TextInput
              accessibilityLabel="Solicitud a GO"
              value={input}
              onChangeText={setInput}
              placeholder="Escribe a GO…"
              placeholderTextColor="#56686B"
              style={consultation?[s.input,{minHeight:44,maxHeight:Math.max(44,Math.min(144,viewport.height-goSize-40)),borderWidth:0,borderRadius:12,backgroundColor:"#fafbfc"}]:s.input}
              scrollEnabled
              multiline
              maxLength={2000}
              onFocus={() => voice.abort()}
              editable={!a.busy}
            />
            {consultation?<GoSendButton testID="support-assistant-send" onPress={send} disabled={!input.trim()||!!a.busy||!consultation.respond}/>:<IconButton
              icon="send"
              label="Enviar solicitud"
              onPress={send}
              disabled={!input.trim() || !!a.busy}
            />}
          </View>
          {!consultation && dock}
          </View>
          {consultation&&<GoNavigationFloating screenKey="support-assistant" safeArea={false} handedness={handedness} keyboardVisible={keyboardVisible} keyboardResponsive protectedBottom={footerHeight+(keyboardVisible?10:0)} width={goSize+72} height={Math.max(64,goSize)}><View testID="support-assistant-thumb-controls" style={{flexDirection:handedness==="left"?"row-reverse":"row",alignItems:"flex-end",gap:8}}>
            {dock}<GoCloseButton level="panel" appearance="light" keyboardVisible={keyboardVisible} disabled={saving} accessibilityLabel={keyboardVisible?"Ocultar teclado":"Volver a AYUDA"} onPress={consultationBack}/>
          </View></GoNavigationFloating>}
          </View>
        </KeyboardAvoidingView>
        {!consultation&&navigationHeight>0 && <AssistantCloseControls disabled={saving} onClose={() => close()} onGoToLanding={onGoToLanding ? () => close(true) : undefined}
          viewport={{ width: viewport.width, height: viewport.height + headerHeight }}
          protectedBottom={footerHeight} topInset={insets.top} />}
        <GoScreenCloseGuide testID="assistant-swipe-guide" />
      </GoScreenCloseSurface>
    </Modal>
  );
}
