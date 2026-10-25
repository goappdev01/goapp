import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Alert, Dimensions, Linking, Modal, PanResponder, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, type GestureResponderEvent, type PanResponderGestureState } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import type { GoEntry } from "./AgendaOperativa";
import { entryCommunication, entryHeading, entryIdentity, entryIsInternal, entryProposalPending } from "@/data/goEntryPresentation";
import { reservationCardPolicy, GO_ENTRY_COLORS as C } from "@/data/reservationCardPolicy";
import { GoCloseButton } from "./ui/GoCloseButton";
import { CalendarCloseGuide } from "./ui/CalendarCloseGuide";
import { landingCurrentEntry } from "./landing/landingPanels";
import { calendarGestureOwnership } from "@/lib/calendarGestureOwnership";

export function GoEntryCommunication({ entry }: { entry: GoEntry }) {
  const { lang } = useLanguage();
  const links = entryCommunication(entry);
  if (!links.call && !links.whatsapp) return null;
  const open = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert("GO", lang === "en" ? "Could not open this contact." : "No se pudo abrir este contacto.")); };
  return <View testID="entry-communication" style={s.actions}>
    {links.whatsapp && <TouchableOpacity accessibilityRole="button" accessibilityLabel="WhatsApp" onPress={() => open(links.whatsapp!)} style={s.contact}><Text style={s.contactText}>WhatsApp</Text></TouchableOpacity>}
    {links.call && <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === "en" ? "Call" : "Llamar"} onPress={() => open(links.call!)} style={s.contact}><Text style={s.contactText}>{lang === "en" ? "Call" : "Llamar"}</Text></TouchableOpacity>}
  </View>;
}

export type GoEntryActionCallbacks = {
  onCancel?: () => void; onPropose?: () => void; onEdit?: () => void;
  onAccept?: () => void; onReject?: () => void; onConfirm?: () => void;
};

/** Personal follow-up never writes the contractual acceptance or completion of a reservation. */
export function GoEntryMicroActions({entry,onDone,onPending,onDiscard,disabled=false,inline=false}:{entry:GoEntry;onDone?:()=>void;onPending?:()=>void;onDiscard?:()=>void;disabled?:boolean;inline?:boolean}){
  const {lang}=useLanguage(),personal=!!(entry.reservationId||entry.customerBooking||entry.businessBooking);
  const label=(es:string,en:string)=>lang==="en"?en:es;
  const actions=[
    {key:"done",text:label("REALIZADA","DONE"),color:C.done,icon:"check-circle" as const,run:onDone},
    {key:"pending",text:label("PENDIENTE","PENDING"),color:C.pending,icon:"clock" as const,run:onPending},
    {key:"discard",text:label("ELIMINAR","DELETE"),color:C.destructive,icon:"trash-2" as const,run:onDiscard},
  ].filter(action=>action.run);
  if(!actions.length)return null;
  return <View testID="entry-micro-actions" pointerEvents="box-none" style={{flexDirection:"row",flexShrink:0,gap:4,padding:0}}>
    {actions.map(action=><TouchableOpacity key={action.key} accessibilityRole="button"
      accessibilityLabel={personal?label("Mi seguimiento: ","My follow-up: ")+action.text:action.text}
      accessibilityHint={action.key==="discard"?label("Oculta solo tu ficha. No cancela el compromiso.","Hides only your card. Does not cancel the commitment."):undefined}
      disabled={disabled} accessibilityState={{disabled,selected:entry.localResolutionStatus===action.key}}
      hitSlop={{top:inline?4:0,bottom:inline?4:0,left:0,right:0}} activeOpacity={0.7}
      onPress={event=>{event?.stopPropagation();action.run?.();}}
      style={{flex:1,minWidth:0,minHeight:inline?36:44,paddingHorizontal:4,paddingVertical:6,borderRadius:8,borderWidth:1,borderColor:action.color,backgroundColor:action.color+"12",flexDirection:"row",gap:3,alignItems:"center",justifyContent:"center"}}>
      <Feather name={action.icon} size={inline?12:14} color={action.color}/>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}
        style={{color:action.color,fontSize:inline?10:12,fontWeight:"800",textAlign:"center",flexShrink:1}}>{action.text}</Text>
    </TouchableOpacity>)}
  </View>;
}

/** Callers supply the same existing commands used in Calendar. This component never mutates a record. */
export function GoEntryQuickActions({ entry, showState = true, compact = false, ...actions }: { entry: GoEntry; showState?: boolean; compact?: boolean } & GoEntryActionCallbacks) {
  const { lang, t } = useLanguage(), policy = reservationCardPolicy(entry);
  const canonical = policy.canonical;
  const active = canonical ? policy.active : !entry.deleted && entry.estado !== "rechazado" && entry.localResolutionStatus !== "done";
  const received = canonical ? policy.received : entryProposalPending(entry) && entry.estado === "propuesto";
  const internal = entryIsInternal(entry);
  const accepted = entry.estado === "aceptado" || entry.bookingStatus === "confirmada" || ["CONFIRMED","ACCEPTED"].includes(entry.bookingServerStatus ?? "");
  const state = canonical ? t(policy.stateKey as any) : entry.localResolutionStatus === "done" ? (lang === "en" ? "DONE" : "REALIZADA")
    : entry.localResolutionStatus === "pending" ? (lang === "en" ? "PENDING" : "PENDIENTE")
    : accepted ? (lang === "en" ? "ACCEPTED" : "ACEPTADA") : entry.estado === "rechazado" ? (lang === "en" ? "CANCELLED" : "CANCELADA") : (lang === "en" ? "PENDING" : "PENDIENTE");
  const pending = entryProposalPending(entry);
  const button = (label: string, color: string, callback?: () => void) => callback && <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={event => { event?.stopPropagation(); callback(); }} style={[s.action, compact && s.compactAction, { borderColor: color }]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color, fontSize: compact ? 10 : 12, fontWeight: "700", textAlign: "center" }}>{label}</Text></TouchableOpacity>;
  return <View testID="entry-quick-actions" style={{ gap: compact ? 4 : 8 }}>
    {showState && <Text numberOfLines={1} style={{ color: canonical ? policy.stateColor : entry.localResolutionStatus==="done"?C.done:entry.localResolutionStatus==="pending"?C.pending:accepted?C.accepted:entry.estado==="rechazado"?C.destructive:C.pending, fontSize: compact ? 10 : 13, fontWeight: "800" }}>{pending ? "Original: " : ""}{state}</Text>}
    {canonical&&entry.localResolutionStatus&&<Text style={{color:entry.localResolutionStatus==="done"?C.done:C.pending,fontSize:compact?10:13}}>{lang==="en"?"My follow-up: ":"Mi seguimiento: "}{entry.localResolutionStatus==="done"?(lang==="en"?"DONE":"REALIZADA"):(lang==="en"?"PENDING":"PENDIENTE")}</Text>}
    {pending && <Text numberOfLines={1} style={{color:"#FF8C00",fontSize:compact?10:13,fontWeight:"700"}}>{received ? (lang === "en" ? "Change received · pending" : "Cambio recibido · pendiente") : (lang === "en" ? "Change · awaiting response" : "Cambio · esperando respuesta")}</Text>}
    {active && <View style={[s.actions, compact && {flexWrap:"nowrap",gap:6}]}>
      {button(received ? (lang === "en" ? "REJECT" : "RECHAZAR") : (lang === "en" ? "CANCEL" : "CANCELAR"), C.destructive, received ? actions.onReject : actions.onCancel)}
      {button(internal ? (lang === "en" ? "EDIT" : "MODIFICAR") : received ? (lang === "en" ? "PROPOSE" : "PROPONER") : (lang === "en" ? "PROPOSE CHANGE" : "PROPONER CAMBIO"), "#FF8C00", internal ? actions.onEdit : actions.onPropose)}
      {(received || canonical && policy.canConfirm || !canonical && !internal && entry.kind === "received" && entry.estado === "pendiente")
        && button(lang === "en" ? "ACCEPT" : "ACEPTAR", "#22c55e", received ? actions.onAccept : canonical ? actions.onConfirm : actions.onAccept)}
    </View>}
  </View>;
}

export function GoEntrySummary({ entry }: { entry: GoEntry }) {
  const { lang, t } = useLanguage();
  const policy = reservationCardPolicy(entry);
  const unknown = entry.businessBooking || entry.bookingPerspective === "business" ? t("booking_customer_unknown") : lang === "en" ? "Reservation" : "Reserva";
  const professional = entry.professionalName === "Sin preferencia" ? "" : entryIdentity(entry.professionalName);
  return <View testID="entry-summary" style={{ gap: 8 }}>
    <Text style={s.title}>{entryHeading(entry, unknown)}</Text>
    {policy.canonical && <Text style={{ color: policy.stateColor, fontWeight: "800" }}>{entryProposalPending(entry) ? (lang === "en" ? "Original reservation: " : "Reserva original: ") : ""}{t(policy.stateKey as any)}</Text>}
    <Text style={s.text}>{[entry.date || entry.dateISO, entry.time, entry.duration].filter(Boolean).join(" · ")}</Text>
    {!!professional && <Text style={s.text}>{lang === "en" ? "Professional: " : "Profesional: "}{professional}</Text>}
    {!!entry.place && <Text style={s.secondary}>{entry.place}</Text>}
  </View>;
}

/** Historical receipt values, not today's catalogue or prices recomputed by the UI. */
export function GoEntryContract({ entry }: { entry: GoEntry }) {
  const { lang } = useLanguage();
  const quote = entry.bookingCatalog;
  const services = entry.bookingServices ?? entry.bookingTimeline?.serviceDetails;
  const money = (amount: number, currency?: string) => `${amount.toFixed(2)} ${currency || ""}`.trim();
  const total = quote?.totalPrice ?? entry.bookingTimeline?.totalPrice ?? entry.bookingTotalPrice;
  const currency = quote?.currency ?? entry.bookingTimeline?.currency ?? entry.bookingCurrency;
  return <View testID="entry-contract" style={{ gap: 8 }}>
    {(entry.customerBooking || entry.businessBooking || entry.bookingPerspective || services?.length || quote) && <Text style={s.label}>{lang === "en" ? "Booked services" : "Servicios contratados"}</Text>}
    {quote ? quote.lines.map(line => <Text key={line.itemId} style={s.text}>{line.name} · {line.included ? (lang === "en" ? "Included" : "Incluido") : money(line.charge, line.currency)}</Text>)
      : services?.length ? services.map((service, index) => <Text key={`${service.id}-${index}`} style={s.text}>{service.title}{(!("priceKnown" in service) || service.priceKnown !== false) && service.price != null ? " · " + money(service.price, service.currency) : ""}</Text>)
      : !!entryIdentity(entry.notes || entry.intentLabel) && <Text style={s.text}>{entryIdentity(entry.notes || entry.intentLabel)}</Text>}
    {total != null && Number.isFinite(total) && <Text style={s.label}>{lang === "en" ? "Total: " : "Total: "}{money(total, currency)}</Text>}
    {!!entry.detail && <Text selectable style={s.text}>{entry.detail}</Text>}
    {!!entry.bookingMessageToStaff && <Text style={s.secondary}>{entry.bookingMessageToStaff}</Text>}
    {!!entry.bookingTimeline && <View style={{ gap: 5 }}>
      <Text style={s.secondary}>{lang === "en" ? "Work / processing" : "Intervención / espera"} · {entry.bookingTimeline.workMinutes} / {entry.bookingTimeline.waitMinutes} min</Text>
      {entry.bookingTimeline.phases.map((phase, i) => <Text key={i} style={s.secondary}>{new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { timeZone: entry.bookingTimeline!.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(phase.startsAt))} · {phase.name}
        {phase.resources?.length ? " · " + phase.resources.map(r => `${entry.bookingResourceNames?.[r.resourceId] || (lang === "en" ? "Resource" : "Recurso")} ×${r.quantity}`).join(" · ") : ""}</Text>)}
    </View>}
  </View>;
}

// Same activation, side-control lane and full-dismiss distance as Calendar's calTopSwipeRef.
export const ENTRY_DETAIL_CLOSE = Object.freeze({ activation: 12, sideFraction: 0.25, distance: 140, flingDistance: 48, velocity: 0.65, headerHeight: 44, touchSize: 56 });

type EntryDetailsProps = {
  entry: GoEntry | null; onClose: () => void; onMessage?: () => void; handedness?: "right" | "left"; children?: React.ReactNode;
};

export function GoEntryDetailsSheet(props: EntryDetailsProps) {
  // A new selection owns a new native-modal session. Old responders cannot close it.
  return props.entry ? <GoEntryDetailsSession key={props.entry.id} {...props} entry={props.entry} /> : null;
}

function GoEntryDetailsSession({ entry, onClose, onMessage, handedness = "right", children }: EntryDetailsProps & { entry: GoEntry }) {
  const insets = useSafeAreaInsets(), { lang } = useLanguage();
  const [closing, setClosing] = useState(false);
  const phase = useRef<"open" | "dismissing" | "closed">("open");
  const touch = useRef<{ identifier: string | number; timestamp: number; x: number; y: number; granted: boolean } | null>(null);
  const live = useRef({ onClose, handedness, headerBottom: 0 });
  live.current = { onClose, handedness, headerBottom: insets.top + 8 + ENTRY_DETAIL_CLOSE.headerHeight };
  const finishDismiss = useCallback(() => {
    if (phase.current !== "dismissing") return;
    phase.current = "closed";
    // iOS has now removed the native touch-blocking modal before selection/navigation changes.
    live.current.onClose();
  }, []);
  const dismiss = useCallback(() => {
    if (phase.current !== "open") return;
    phase.current = "dismissing";
    setClosing(true);
  }, []);
  useLayoutEffect(() => {
    phase.current = "open";
    const release = calendarGestureOwnership.openDetail();
    return () => { phase.current = "closed"; touch.current = null; release(); };
  }, []);
  useEffect(() => {
    // React Native only emits Modal.onDismiss on iOS; other platforms finish after hiding.
    if (closing && Platform.OS !== "ios") finishDismiss();
  }, [closing, finishDismiss]);
  const pan = useMemo(() => {
    const shouldClaim = (event: GestureResponderEvent, g: PanResponderGestureState) => {
      const origin = touch.current;
      if (phase.current !== "open" || !origin) return false;
      if (g.dy <= ENTRY_DETAIL_CLOSE.activation || Math.abs(g.dy) <= Math.abs(g.dx)) return false;
      const width = Dimensions.get("window").width;
      const inSide = live.current.handedness === "left"
        ? origin.x <= width * ENTRY_DETAIL_CLOSE.sideFraction
        : origin.x >= width * (1 - ENTRY_DETAIL_CLOSE.sideFraction);
      return inSide || origin.y <= live.current.headerBottom;
    };
    const matches = (event: GestureResponderEvent) => !!touch.current && event?.nativeEvent.identifier === touch.current.identifier
      && event.nativeEvent.timestamp >= touch.current.timestamp;
    return PanResponder.create({
      onStartShouldSetPanResponderCapture: event => {
        const e = event.nativeEvent;
        touch.current = phase.current === "open" && e.touches.length === 1
          ? { identifier: e.identifier, timestamp: e.timestamp, x: e.pageX, y: e.pageY, granted: false } : null;
        return false; // Taps and central scrolling keep their existing handlers.
      },
      onMoveShouldSetPanResponder: shouldClaim,
      onMoveShouldSetPanResponderCapture: shouldClaim,
      onPanResponderGrant: () => { if (touch.current) touch.current.granted = true; },
      onPanResponderRelease: (event, g) => {
        const origin = touch.current;
        if (phase.current !== "open" || !origin?.granted || !matches(event)) return;
        touch.current = null;
        event.stopPropagation();
        const e = event.nativeEvent;
        // RN resets dy on responder grant. Measure from touch-down, not that reset.
        const dy = e.pageY - origin.y, dx = e.pageX - origin.x;
        if (dy > Math.abs(dx) && (dy > ENTRY_DETAIL_CLOSE.distance
          || dy >= ENTRY_DETAIL_CLOSE.flingDistance && g.vy > ENTRY_DETAIL_CLOSE.velocity)) dismiss();
      },
      onPanResponderTerminate: event => { if (matches(event)) touch.current = null; },
      onPanResponderReject: event => { if (matches(event)) touch.current = null; },
      onPanResponderTerminationRequest: () => false,
    });
  }, [dismiss]);
  const current = landingCurrentEntry(entry);
  const pending = entryProposalPending(entry);
  return <Modal testID="entry-details-modal" visible={!closing} transparent animationType="none" onRequestClose={dismiss} onDismiss={finishDismiss}>
    <View testID="entry-details-overlay" style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingHorizontal: Math.max(insets.left, insets.right, 8), backgroundColor: "rgba(0,0,0,0.62)" }}>
      <View testID="entry-details-sheet" pointerEvents={closing ? "none" : "auto"} onAccessibilityEscape={dismiss} style={[s.sheet, { borderColor: pending ? "#FF8C00" : entry.color || "#4A80BD" }]}>
        <View testID="entry-details-gesture-body" {...pan.panHandlers} style={{ flex: 1, minHeight: 0 }}>
        <View testID="entry-detail-close-gesture" style={{ height: ENTRY_DETAIL_CLOSE.headerHeight, alignItems: "center", justifyContent: "center" }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" }} /></View>
        <ScrollView testID="entry-details-scroll" style={{ flex: 1 }} keyboardShouldPersistTaps="handled" bounces={false} alwaysBounceVertical={false} overScrollMode="never" directionalLockEnabled contentContainerStyle={{ flexGrow:1, paddingHorizontal: 18, paddingBottom: 12, gap: 12 }}>
          <GoEntrySummary entry={current} />
          <GoEntryContract entry={current} />
          {pending && <View testID="entry-proposal" style={{ borderColor: "#FF8C00", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}>
            <Text style={{ color: "#FF8C00", fontWeight: "800" }}>{entry.estado === "propuesto" ? (lang === "en" ? "CHANGE RECEIVED" : "CAMBIO RECIBIDO") : (lang === "en" ? "AWAITING RESPONSE" : "ESPERANDO RESPUESTA")}</Text>
            <Text style={s.text}>{lang === "en" ? "Proposed: " : "Propuesto: "}{[entry.changeProposal!.date || entry.changeProposal!.dateISO, entry.changeProposal!.time].filter(Boolean).join(" · ")}</Text>
            {!!entry.changeProposal!.note && <Text style={s.secondary}>{entry.changeProposal!.note}</Text>}
          </View>}
          <View testID="entry-details-actions" style={{marginTop:"auto",paddingTop:12,gap:12}}>
          <GoEntryCommunication entry={entry} />
          {onMessage&&!entryIsInternal(entry)&&<TouchableOpacity testID="entry-message-go" accessibilityRole="button" accessibilityLabel="MENSAJE GO" onPress={onMessage}
            style={{alignSelf:handedness==="left"?"flex-start":"flex-end",minHeight:44,paddingHorizontal:14,paddingVertical:10,borderWidth:1,borderRadius:10,borderColor:"#93c5fd"}}>
            <Text numberOfLines={1} style={{color:"#93c5fd",fontWeight:"700",fontSize:12}}>MENSAJE GO</Text>
          </TouchableOpacity>}
          {children}
          </View>
        </ScrollView>
        <CalendarCloseGuide handedness={handedness} testID="entry-detail-swipe-guide" />
        </View>
        <View testID="entry-detail-close-footer" style={{ flexShrink: 0, flexDirection: "row", justifyContent: handedness === "left" ? "flex-start" : "flex-end", paddingHorizontal: 6, paddingTop: 4, paddingBottom: 6 }}>
          <GoCloseButton level="panel" touchSize={ENTRY_DETAIL_CLOSE.touchSize} hitSlop={0} accessibilityLabel={lang === "en" ? "Close details" : "Cerrar detalle"} onPress={dismiss} />
        </View>
      </View>
    </View>
  </Modal>;
}

const s = StyleSheet.create({
  sheet: { flex: 1, width: "100%", backgroundColor: "#0e0e10", borderWidth: 1.5, borderRadius: 18, overflow: "hidden" },
  title: { color: "#fff", fontSize: 20, fontWeight: "700" },
  text: { color: "rgba(255,255,255,0.9)", fontSize: 15, lineHeight: 22 },
  secondary: { color: "rgba(255,255,255,0.65)", fontSize: 14, lineHeight: 21 },
  label: { color: "#fff", fontWeight: "700", fontSize: 16 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  action: { flexGrow: 1, flexBasis: 90, minHeight: 44, padding: 10, borderWidth: 1, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  compactAction: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 36, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8 },
  contact: { flex: 1, minHeight: 44, padding: 10, borderWidth: 1, borderColor: "#4ade80", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  contactText: { color: "#4ade80", fontWeight: "700" },
});
