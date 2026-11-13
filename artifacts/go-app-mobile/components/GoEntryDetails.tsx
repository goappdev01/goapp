import {GoNavigationFloating} from "@/components/ui/GoNavigationFloating";
import { GoScreenModal as Modal } from "@/components/ui/GoScreenModal";
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Alert, Linking, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLanguage } from "@/contexts/LanguageContext";
import type { GoEntry } from "./AgendaOperativa";
import { entryCommunication, entryDurationLabel, entryHeading, entryIdentity, entryIsInternal, entryIsReservation, entryProposalPending, formatBookingLocalDate } from "@/data/goEntryPresentation";
import { reservationCardPolicy, GO_ENTRY_COLORS as C } from "@/data/reservationCardPolicy";
import { GoCloseButton } from "./ui/GoCloseButton";
import { landingCurrentEntry } from "./landing/landingPanels";
import { GoScreenCloseSurface, GoScreenCloseGuide } from "@/components/ui/GoScreenCloseSurface";

const pressedSurface = {transform:[{translateY:1}],elevation:0,shadowOpacity:0.06,opacity:0.88};

export function GoEntryCommunication({ entry }: { entry: GoEntry }) {
  const { lang } = useLanguage();
  const [pressed,setPressed]=useState<string|null>(null);
  const links = entryCommunication(entry);
  if (!links.call && !links.whatsapp) return null;
  const open = (url: string) => { void Linking.openURL(url).catch(() => Alert.alert("GO", lang === "en" ? "Could not open this contact." : "No se pudo abrir este contacto.")); };
  return <View testID="entry-communication" style={s.actions}>
    {links.whatsapp && <TouchableOpacity accessibilityRole="button" accessibilityLabel="WhatsApp" activeOpacity={0.82} onPressIn={()=>setPressed("whatsapp")} onPressOut={()=>setPressed(null)} onPress={() => open(links.whatsapp!)} style={[s.contact,pressed==="whatsapp"&&pressedSurface]}><Text style={s.contactText}>WhatsApp</Text></TouchableOpacity>}
    {links.call && <TouchableOpacity accessibilityRole="button" accessibilityLabel={lang === "en" ? "Call" : "Llamar"} activeOpacity={0.82} onPressIn={()=>setPressed("call")} onPressOut={()=>setPressed(null)} onPress={() => open(links.call!)} style={[s.contact,pressed==="call"&&pressedSurface]}><Text style={s.contactText}>{lang === "en" ? "Call" : "Llamar"}</Text></TouchableOpacity>}
  </View>;
}

export type GoEntryActionCallbacks = {
  onCancel?: () => void; onPropose?: () => void; onEdit?: () => void;
  onAccept?: () => void; onReject?: () => void; onConfirm?: () => void;
};

export type GoListAction = {
  key: string;
  label: string;
  tone: "negative" | "intermediate" | "positive";
  onPress: () => void;
  selected?: boolean;
  selectable?: boolean;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
};

/** Shared visual language for Listados and opened entry actions. */
const GO_ACTION_PALETTE = {
  negative:{base:"#D63443",muted:"#D63443"},
  intermediate:{base:"#CC4D00",muted:"#B75000"},
  positive:{base:"#00865D",muted:"#087D53"},
};
function goActionVisual(tone:GoListAction["tone"],selected=false,inactive=false,pressed=false){
  const color=GO_ACTION_PALETTE[tone];
  return {borderRadius:8,borderWidth:1,borderColor:selected?"rgba(255,255,255,0.38)":"rgba(255,255,255,0.22)",
    backgroundColor:inactive?color.muted:color.base,shadowColor:color.base,shadowOffset:{width:0,height:2},
    shadowOpacity:pressed?0.06:selected?0.22:0.14,shadowRadius:3,elevation:pressed?0:1,
    opacity:pressed?0.88:1,transform:[{translateY:pressed?1:0}]};
}

/** The same footer geometry serves personal follow-up and contractual proposals. */
export function GoListActionRow({actions,handedness="right",scale=1,testID="list-action-row"}:{actions:GoListAction[];handedness?:"left"|"right";scale?:number;testID?:string}){
  if(!actions.length)return null;
  const ordered=handedness==="left"?[...actions].reverse():actions;
  return <View testID={testID} pointerEvents="box-none" style={{flexDirection:"row",alignSelf:"stretch",gap:6,marginTop:6,marginBottom:4}}>
    {ordered.map(action=>{
      const inactive=action.selectable&&!action.selected;
      return <TouchableOpacity key={action.key} accessibilityRole="button" accessibilityLabel={action.accessibilityLabel??action.label}
        accessibilityHint={action.accessibilityHint} accessibilityState={{disabled:!!action.disabled,selected:!!action.selected}}
        disabled={action.disabled} activeOpacity={0.7}
        onPress={event=>{event?.stopPropagation?.();action.onPress();}}
        style={{flex:1,flexBasis:0,flexShrink:1,minWidth:0,minHeight:Math.max(44,Math.round(44*scale)),paddingHorizontal:4,paddingVertical:8,
          ...goActionVisual(action.tone,!!action.selected,!!inactive),alignItems:"center",justifyContent:"center"}}>
        <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.5} maxFontSizeMultiplier={1.8}
          style={{color:"#FFFFFF",fontSize:Math.max(12,Math.round(13*scale)),fontWeight:"800",textAlign:"center",alignSelf:"stretch",width:"100%",minWidth:0}}>{action.label}</Text>
      </TouchableOpacity>;
    })}
  </View>;
}

/** Personal follow-up never writes the contractual acceptance or completion of a reservation. */
export function GoEntryMicroActions({entry,onDone,onPending,onDiscard,disabled=false,inline=false,layout,handedness="right",listScale=1}:{entry:GoEntry;onDone?:()=>void;onPending?:()=>void;onDiscard?:()=>void;disabled?:boolean;inline?:boolean;layout?:"list";handedness?:"left"|"right";listScale?:number}){
  const {lang}=useLanguage(),personal=!!(entry.reservationId||entry.customerBooking||entry.businessBooking);
  const [pressed,setPressed]=useState<string|null>(null);
  const list = layout === "list";
  const label=(es:string,en:string)=>lang==="en"?en:es;
  const selected=(key:string)=>key==="pending"?entry.localResolutionStatus!=="done":entry.localResolutionStatus==="done";
  const actions=[
    {key:"done",text:label("REALIZADA","DONE"),tone:"positive" as const,run:onDone},
    {key:"pending",text:label("PENDIENTE","PENDING"),tone:"intermediate" as const,run:onPending},
    {key:"discard",text:label("ELIMINAR","DELETE"),tone:"negative" as const,run:onDiscard},
  ].filter(action=>action.run);
  if(!actions.length)return null;
  if(list){
    const listActions:GoListAction[]=[];
    if(onDiscard)listActions.push({key:"discard",label:label("ELIMINAR","DELETE"),tone:"negative",onPress:onDiscard,disabled,
      accessibilityLabel:personal?label("Mi seguimiento: ","My follow-up: ")+label("ELIMINAR","DELETE"):label("ELIMINAR","DELETE"),
      accessibilityHint:label("Oculta solo tu ficha. No cancela el compromiso.","Hides only your card. Does not cancel the commitment.")});
    if(onPending)listActions.push({key:"pending",label:label("PENDIENTE","PENDING"),tone:"intermediate",onPress:onPending,disabled,selectable:!!onDone,selected:selected("pending"),
      accessibilityLabel:personal?label("Mi seguimiento: ","My follow-up: ")+label("PENDIENTE","PENDING"):label("PENDIENTE","PENDING")});
    if(onDone)listActions.push({key:"done",label:label("REALIZADA","DONE"),tone:"positive",onPress:onDone,disabled,selectable:!!onPending,selected:selected("done"),
      accessibilityLabel:personal?label("Mi seguimiento: ","My follow-up: ")+label("REALIZADA","DONE"):label("REALIZADA","DONE")});
    return <GoListActionRow testID="entry-micro-actions" handedness={handedness} scale={listScale} actions={listActions}/>;
  }
  return <View testID="entry-micro-actions" pointerEvents="box-none" style={{flexDirection:"row",flexShrink:0,gap:4,padding:0}}>
    {actions.map(action=><TouchableOpacity key={action.key} accessibilityRole="button"
      accessibilityLabel={personal?label("Mi seguimiento: ","My follow-up: ")+action.text:action.text}
      accessibilityHint={action.key==="discard"?label("Oculta solo tu ficha. No cancela el compromiso.","Hides only your card. Does not cancel the commitment."):undefined}
      disabled={disabled} accessibilityState={{disabled,selected:action.key==="discard"?false:selected(action.key)}}
      hitSlop={{top:inline?4:0,bottom:inline?4:0,left:0,right:0}} activeOpacity={0.7}
      onPressIn={()=>setPressed(action.key)} onPressOut={()=>setPressed(null)}
      onPress={event=>{event?.stopPropagation();action.run?.();}}
      style={{flex:1,minWidth:0,minHeight:inline?36:44,paddingHorizontal:4,paddingVertical:6,...goActionVisual(action.tone,action.key==="discard"?false:selected(action.key),
        action.key!=="discard"&&!!onDone&&!!onPending&&!selected(action.key),pressed===action.key),
        opacity:disabled?0.48:pressed===action.key?0.88:1,alignItems:"center",justifyContent:"center"}}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}
        style={{color:"#FFFFFF",fontSize:inline?10:12,fontWeight:"800",textAlign:"center",flexShrink:1}}>{action.text}</Text>
    </TouchableOpacity>)}
  </View>;
}

/** Callers supply the same existing commands used in Calendar. This component never mutates a record. */
export function GoEntryQuickActions({ entry, showState = true, compact = false, ...actions }: { entry: GoEntry; showState?: boolean; compact?: boolean } & GoEntryActionCallbacks) {
  const { lang, t } = useLanguage(), policy = reservationCardPolicy(entry);
  const [pressed,setPressed]=useState<string|null>(null);
  const canonical = policy.canonical;
  const active = canonical ? policy.active : !entry.deleted && entry.estado !== "rechazado" && entry.localResolutionStatus !== "done";
  const received = canonical ? policy.received : entryProposalPending(entry) && entry.estado === "propuesto";
  const internal = entryIsInternal(entry);
  const accepted = entry.estado === "aceptado" || entry.bookingStatus === "confirmada" || ["CONFIRMED","ACCEPTED"].includes(entry.bookingServerStatus ?? "");
  const state = canonical ? t(policy.stateKey as any) : entry.localResolutionStatus === "done" ? (lang === "en" ? "DONE" : "REALIZADA")
    : entry.localResolutionStatus === "pending" ? (lang === "en" ? "PENDING" : "PENDIENTE")
    : accepted ? (lang === "en" ? "ACCEPTED" : "ACEPTADA") : entry.estado === "rechazado" ? (lang === "en" ? "CANCELLED" : "CANCELADA") : (lang === "en" ? "PENDING" : "PENDIENTE");
  const pending = entryProposalPending(entry);
  const button = (label: string, tone: GoListAction["tone"], callback?: () => void) => callback && <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} activeOpacity={compact?0.72:0.82} onPressIn={compact?undefined:()=>setPressed(label)} onPressOut={compact?undefined:()=>setPressed(null)} onPress={event => { event?.stopPropagation(); callback(); }} style={[s.action, compact && s.compactAction, goActionVisual(tone,false,false,pressed===label)]}><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ color:"#FFFFFF", fontSize: compact ? 10 : 12, fontWeight: "800", textAlign: "center" }}>{label}</Text></TouchableOpacity>;
  return <View testID="entry-quick-actions" style={{ gap: compact ? 4 : 8 }}>
    {showState && <Text numberOfLines={1} style={{ color: canonical ? policy.stateColor : entry.localResolutionStatus==="done"?C.done:entry.localResolutionStatus==="pending"?C.pending:accepted?C.accepted:entry.estado==="rechazado"?C.destructive:C.pending, fontSize: compact ? 10 : 13, fontWeight: "800" }}>{pending ? "Original: " : ""}{state}</Text>}
    {canonical&&entry.localResolutionStatus&&<Text style={{color:entry.localResolutionStatus==="done"?C.done:C.pending,fontSize:compact?10:13}}>{lang==="en"?"My follow-up: ":"Mi seguimiento: "}{entry.localResolutionStatus==="done"?(lang==="en"?"DONE":"REALIZADA"):(lang==="en"?"PENDING":"PENDIENTE")}</Text>}
    {pending && <Text numberOfLines={1} style={{color:"#FF8C00",fontSize:compact?10:13,fontWeight:"700"}}>{received ? (lang === "en" ? "Change received · pending" : "Cambio recibido · pendiente") : (lang === "en" ? "Change · awaiting response" : "Cambio · esperando respuesta")}</Text>}
    {active && <View style={[s.actions, compact && {flexWrap:"nowrap",gap:6}]}>
      {button(received ? (lang === "en" ? "REJECT" : "RECHAZAR") : (lang === "en" ? "CANCEL" : "CANCELAR"), "negative", received ? actions.onReject : actions.onCancel)}
      {button(internal ? (lang === "en" ? "EDIT" : "MODIFICAR") : received ? (lang === "en" ? "PROPOSE" : "PROPONER") : (lang === "en" ? "PROPOSE CHANGE" : "PROPONER CAMBIO"), "intermediate", internal ? actions.onEdit : actions.onPropose)}
      {(received || canonical && policy.canConfirm || !canonical && !internal && entry.kind === "received" && entry.estado === "pendiente")
        && button(lang === "en" ? "ACCEPT" : "ACEPTAR", "positive", received ? actions.onAccept : canonical ? actions.onConfirm : actions.onAccept)}
    </View>}
  </View>;
}

export function GoEntrySummary({ entry }: { entry: GoEntry }) {
  const { lang, t } = useLanguage();
  const policy = reservationCardPolicy(entry);
  const unknown = entry.businessBooking || entry.bookingPerspective === "business" ? t("booking_customer_unknown") : lang === "en" ? "Reservation" : "Reserva";
  const professional = entry.professionalName === "Sin preferencia" ? "" : entryIdentity(entry.professionalName);
  return <View testID="entry-summary" style={{ gap: 6 }}>
    <Text style={s.title}>{entryHeading(entry, unknown)}</Text>
    {policy.canonical && <Text style={{ color: policy.stateColor, fontWeight: "800" }}>{entryProposalPending(entry) ? (lang === "en" ? "Original reservation: " : "Reserva original: ") : ""}{t(policy.stateKey as any)}</Text>}
    <Text testID="entry-original-date-time" style={s.text}>{[entryIsReservation(entry) ? formatBookingLocalDate(entry.dateISO, entry.date, lang, entry.bookingTimeline?.timezone, entry.bookingStartsAt || entry.startDatetime) : entry.date || entry.dateISO, entry.time, entryIsReservation(entry) ? entryDurationLabel(entry.duration,lang) : entry.duration].filter(Boolean).join(" · ")}</Text>
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
      <Text style={s.secondary}>{lang === "en" ? "Work / processing" : "Trabajo / espera"} · {entry.bookingTimeline.workMinutes} / {entry.bookingTimeline.waitMinutes} min</Text>
      {entry.bookingTimeline.phases.map((phase, i) => <Text key={i} style={s.secondary}>{new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { timeZone: entry.bookingTimeline!.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(phase.startsAt))}–{new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "es-ES", { timeZone: entry.bookingTimeline!.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(phase.endsAt))} · {phase.name || (phase.kind === "work" ? (lang === "en" ? "Work" : "Trabajo") : (lang === "en" ? "Wait" : "Espera"))}
        {phase.kind === "wait" ? " · " + (phase.releaseProfessional === true ? (lang === "en" ? "Available wait" : "Espera disponible") : phase.releaseProfessional === false ? (lang === "en" ? "Occupied wait" : "Espera ocupada") : (lang === "en" ? "Original wait" : "Espera original")) : ""}
        {phase.resources?.length ? " · " + phase.resources.map(r => `${entry.bookingResourceNames?.[r.resourceId] || (lang === "en" ? "Resource" : "Recurso")} ×${r.quantity}`).join(" · ") : ""}</Text>)}
    </View>}
  </View>;
}

// Same activation, side-control lane and full-dismiss distance as Calendar's calTopSwipeRef.
export const ENTRY_DETAIL_CLOSE = Object.freeze({ headerHeight: 44, touchSize: 64 });

type EntryDetailsProps = {
  closeRequested?: boolean;
  renderNote?:(entry:GoEntry,onClose:()=>void,navigation?:{onGoToLanding?:()=>void;closeRequested?:boolean})=>React.ReactNode;
  entry: GoEntry | null; onClose: () => void; onMessage?: () => void; onGoToLanding?: () => void; renderMessageScreen?: () => React.ReactNode; handedness?: "right" | "left"; children?: React.ReactNode | ((dismissThen: (action: () => void) => void) => React.ReactNode);
};

export function GoEntryDetailsSheet(props: EntryDetailsProps) {
  // Ordinary notes share their creation editor/tools throughout their lifetime.
  // Reservations and every other detail retain the existing native presenter.
  const note=props.entry&&(props.entry.note?.version===1||props.entry.kind==="sent"&&["TAREA","TAREA_INTERNA"].includes(props.entry.type||"")&&(props.entry.goNoteReminder===true||["nota_interna","nota_externa"].includes(props.entry.intentKey)));
  if(note&&props.entry&&props.renderNote)return props.renderNote(props.entry,props.onClose,{onGoToLanding:props.onGoToLanding,closeRequested:props.closeRequested});
  // A new selection owns a new native-modal session. Old responders cannot close it.
  return props.entry ? <GoEntryDetailsSession key={props.entry.id} {...props} entry={props.entry} /> : null;
}

function GoEntryDetailsSession({ entry, onClose, onMessage, onGoToLanding, renderMessageScreen, handedness = "right", children, closeRequested = false }: EntryDetailsProps & { entry: GoEntry }) {
  const insets = useSafeAreaInsets(), window = useWindowDimensions(), { lang } = useLanguage();
  const [closing, setClosing] = useState(false);
  const [messagePressed,setMessagePressed]=useState(false);
  const [navigationGeometry, setNavigationGeometry] = useState({ y: 0, height: 0, summaryEnd: 0, actionsTop: 0, offset: 0 });
  const gapStart = Math.max(navigationGeometry.y, navigationGeometry.y + navigationGeometry.summaryEnd - navigationGeometry.offset + 12);
  const gapEnd = Math.min(navigationGeometry.y + navigationGeometry.height, navigationGeometry.y + navigationGeometry.actionsTop - navigationGeometry.offset - 12);
  const navigationTop = navigationGeometry.height > 0 && navigationGeometry.summaryEnd > 0 && navigationGeometry.actionsTop > 0 && gapEnd - gapStart >= ENTRY_DETAIL_CLOSE.touchSize ? gapEnd - ENTRY_DETAIL_CLOSE.touchSize : undefined;
  const phase = useRef<"open" | "dismissing" | "closed">("open");
  const scroll = useRef<React.ElementRef<typeof ScrollView>>(null);
  const messageAfterDismiss = useRef(false);
  const actionAfterDismiss = useRef<(() => void) | null>(null);
  const live = useRef({ onClose, onMessage, handedness });
  live.current = { onClose, onMessage, handedness };
  const finishDismiss = useCallback(() => {
    if (phase.current !== "dismissing") return;
    phase.current = "closed";
    // iOS has now removed the native touch-blocking modal before selection/navigation changes.
    const message = messageAfterDismiss.current ? live.current.onMessage : undefined;
    const action = actionAfterDismiss.current;
    messageAfterDismiss.current = false;
    actionAfterDismiss.current = null;
    live.current.onClose();
    message?.();
    action?.();
  }, []);
  const dismiss = useCallback(() => {
    if (phase.current !== "open") return;
    phase.current = "dismissing";
    setClosing(true);
  }, []);
  const dismissThen = useCallback((action: () => void) => {
    if (phase.current !== "open") return;
    actionAfterDismiss.current = action;
    dismiss();
  }, [dismiss]);
  // A note editor may open only after this native presenter has released its touches.
  useEffect(() => { if (closeRequested) dismiss(); }, [closeRequested, dismiss]);
  useLayoutEffect(() => {
    phase.current = "open";
    return () => { phase.current = "closed"; };
  }, []);
  useEffect(() => {
    // React Native only emits Modal.onDismiss on iOS; other platforms finish after hiding.
    if (closing && Platform.OS !== "ios") finishDismiss();
  }, [closing, finishDismiss]);
  const current = landingCurrentEntry(entry);
  const pending = entryProposalPending(entry);
  const hasMessage = !!onMessage && !entryIsInternal(entry);
  const closeButtonCount = onGoToLanding ? 2 : 1;
  const navigationGapWidth = (closeButtonCount + (hasMessage ? 1 : 0) - 1) * 8;
  const navigationAvailableWidth = Math.max(0, window.width - Math.max(insets.left, insets.right, 8) * 2);
  const messageButtonWidth = hasMessage ? Math.max(52, Math.min(132, navigationAvailableWidth - closeButtonCount * ENTRY_DETAIL_CLOSE.touchSize - navigationGapWidth)) : 0;
  const navigationWidth = closeButtonCount * ENTRY_DETAIL_CLOSE.touchSize + navigationGapWidth + messageButtonWidth;
  const messageButton = hasMessage && <TouchableOpacity testID="entry-message-go" accessibilityRole="button" accessibilityLabel="MENSAJE GO" activeOpacity={0.82} onPressIn={()=>setMessagePressed(true)} onPressOut={()=>setMessagePressed(false)} onPress={() => { if (phase.current !== "open") return; if (renderMessageScreen) { onMessage?.(); return; } messageAfterDismiss.current = true; dismiss(); }}
    style={{width:messageButtonWidth,height:ENTRY_DETAIL_CLOSE.touchSize,paddingHorizontal:7,paddingVertical:4,borderWidth:1.5,borderRadius:20,borderColor:"#93c5fd",backgroundColor:"rgba(147,197,253,0.14)",shadowColor:"#93c5fd",shadowOffset:{width:0,height:2},shadowOpacity:messagePressed?0.06:0.2,shadowRadius:3,elevation:messagePressed?0:2,transform:[{translateY:messagePressed?1:0}],opacity:messagePressed?0.88:1,alignItems:"center",justifyContent:"center"}}>
    <Text numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={2} style={{color:"#93c5fd",fontWeight:"800",fontSize:12,textAlign:"center"}}>MENSAJE GO</Text>
  </TouchableOpacity>;
  const panelClose = <GoCloseButton level="panel" touchSize={ENTRY_DETAIL_CLOSE.touchSize} hitSlop={0} accessibilityLabel={lang === "en" ? "Close details" : "Cerrar detalle"} onPress={dismiss} />;
  const landingClose = onGoToLanding && <GoCloseButton level="container" touchSize={ENTRY_DETAIL_CLOSE.touchSize} hitSlop={0} accessibilityLabel={lang === "en" ? "Go directly to Landing" : "Ir directamente al Landing"} onPress={onGoToLanding} />;
  return <Modal testID="entry-details-modal" visible={!closing} transparent animationType="none" onRequestClose={dismiss} onDismiss={finishDismiss}>
    <View testID="entry-details-overlay" style={{ position: "absolute", top: 0, right: 0, bottom: 0, left: 0, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingHorizontal: Math.max(insets.left, insets.right, 8), backgroundColor: "#0e0e10" }}>
      <GoScreenCloseSurface testID="entry-details-sheet" handedness={handedness} enabled={!closing} onClose={dismiss} scrollRefs={[scroll]} pointerEvents={closing ? "none" : "auto"} onAccessibilityEscape={dismiss} style={[s.sheet, { borderColor: pending ? "#FF8C00" : entry.color || "#4A80BD" }]}>
        <View testID="entry-details-gesture-body" style={{ flex: 1, minHeight: 0 }}>
        <View testID="entry-detail-close-gesture" style={{ height: ENTRY_DETAIL_CLOSE.headerHeight, alignItems: "center", justifyContent: "center" }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" }} /></View>
        <ScrollView ref={scroll} testID="entry-details-scroll" style={{ flex: 1 }} onLayout={event => { const { y, height } = event.nativeEvent.layout; setNavigationGeometry(value => ({ ...value, y, height })); }} onScroll={event => setNavigationGeometry(value => ({ ...value, offset: event.nativeEvent.contentOffset.y }))} scrollEventThrottle={32} keyboardShouldPersistTaps="handled" bounces={false} alwaysBounceVertical={false} overScrollMode="never" directionalLockEnabled contentContainerStyle={{ flexGrow:1, paddingHorizontal: 18, paddingBottom: 8, gap: 8 }}>
          <View testID="entry-details-information" onLayout={event => { const { y, height } = event.nativeEvent.layout; setNavigationGeometry(value => ({ ...value, summaryEnd: y + height })); }} style={{ gap: 8 }}>
          <GoEntrySummary entry={current} />
          <GoEntryContract entry={current} />
          {pending && <View testID="entry-proposal" style={{ borderColor: "rgba(209,161,102,0.42)", borderWidth: 1, borderRadius: 12, padding: 10, gap: 6, backgroundColor:"#171512" }}>
            <Text style={{ color: "#D1A166", fontWeight: "800" }}>{entry.estado === "propuesto" ? (lang === "en" ? "CHANGE RECEIVED" : "CAMBIO RECIBIDO") : (lang === "en" ? "AWAITING RESPONSE" : "ESPERANDO RESPUESTA")}</Text>
            <Text testID="entry-proposed-date-time" style={s.text}>{lang === "en" ? "Proposed: " : "Propuesto: "}{[entryIsReservation(entry) ? formatBookingLocalDate(entry.changeProposal!.dateISO, entry.changeProposal!.date, lang, entry.bookingTimeline?.timezone) : entry.changeProposal!.date || entry.changeProposal!.dateISO, entry.changeProposal!.time].filter(Boolean).join(" · ")}</Text>
            {!!entry.changeProposal!.note && <Text style={s.secondary}>{entry.changeProposal!.note}</Text>}
          </View>}
          </View>
          <View testID="entry-details-actions" onLayout={event => setNavigationGeometry(value => ({ ...value, actionsTop: event.nativeEvent.layout.y }))} style={{marginTop:"auto",paddingTop:8,gap:8}}>
          <GoEntryCommunication entry={entry} />
          {typeof children === "function" ? children(dismissThen) : children}
          </View>
        </ScrollView>
        <GoScreenCloseGuide testID="entry-detail-swipe-guide" />
        </View>
        {/* The 64-point controls sit inside this reserved footer, 11 points above its border. */}
        <View testID="entry-detail-close-footer" pointerEvents="none" style={{ flexShrink: 0, height: 76, flexDirection: "row", justifyContent: handedness === "left" ? "flex-start" : "flex-end", paddingHorizontal: 6, paddingTop: 1, paddingBottom: 11 }} />
        <GoNavigationFloating testID="entry-detail-floating-navigation" screenKey="entry-details" buttonKey={hasMessage ? "navigation-with-message-inset" : "navigation-inset"} width={navigationWidth} safeArea={false} handedness={handedness} initialBottom={11} boundsVerticalInset={11} initialTop={hasMessage ? undefined : navigationTop}>
          {messageButton}{panelClose}{landingClose}
        </GoNavigationFloating>
      </GoScreenCloseSurface>
      {renderMessageScreen?.()}
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
  action: { flexGrow: 1, flexBasis: 90, minHeight: 44, padding: 10, borderWidth: 1.5, borderRadius: 10, alignItems: "center", justifyContent: "center", shadowOffset:{width:0,height:2}, shadowOpacity:0.18, shadowRadius:4, elevation:2 },
  compactAction: { flex: 1, flexBasis: 0, minWidth: 0, minHeight: 36, paddingVertical: 7, paddingHorizontal: 4, borderRadius: 8 },
  contact: { flex: 1, minHeight: 44, padding: 10, borderWidth: 1.5, borderColor: "#4ade80", backgroundColor:"rgba(74,222,128,0.12)", borderRadius: 10, alignItems: "center", justifyContent: "center", shadowColor:"#4ade80", shadowOffset:{width:0,height:2}, shadowOpacity:0.2, shadowRadius:3, elevation:2 },
  contactText: { color: "#4ade80", fontWeight: "700" },
});
