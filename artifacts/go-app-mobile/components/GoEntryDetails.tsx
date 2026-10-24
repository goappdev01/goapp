import React, { useMemo } from "react";
import { Alert, Linking, Modal, PanResponder, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";
import type { GoEntry } from "./AgendaOperativa";
import { entryCommunication, entryHeading, entryIdentity, entryIsInternal, entryProposalPending } from "@/data/goEntryPresentation";
import { reservationCardPolicy } from "@/data/reservationCardPolicy";
import { GoCloseButton } from "./ui/GoCloseButton";
import { landingCurrentEntry } from "./landing/landingPanels";

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

/** Callers supply the same existing commands used in Calendar. This component never mutates a record. */
export function GoEntryQuickActions({ entry, showState = true, ...actions }: { entry: GoEntry; showState?: boolean } & GoEntryActionCallbacks) {
  const { lang, t } = useLanguage(), policy = reservationCardPolicy(entry);
  const canonical = policy.canonical;
  const active = canonical ? policy.active : !entry.deleted && entry.estado !== "rechazado" && entry.localResolutionStatus !== "done";
  const received = canonical ? policy.received : entryProposalPending(entry) && entry.estado === "propuesto";
  const internal = entryIsInternal(entry);
  const state = canonical ? t(policy.stateKey as any) : entry.localResolutionStatus === "done" ? (lang === "en" ? "DONE" : "REALIZADA")
    : entry.estado === "aceptado" ? (lang === "en" ? "ACCEPTED" : "ACEPTADA") : entry.estado === "rechazado" ? (lang === "en" ? "CANCELLED" : "CANCELADA") : (lang === "en" ? "PENDING" : "PENDIENTE");
  const button = (label: string, color: string, callback?: () => void) => callback && <TouchableOpacity key={label} accessibilityRole="button" accessibilityLabel={label} onPress={callback} style={[s.action, { borderColor: color }]}><Text style={{ color, fontSize: 12, fontWeight: "700", textAlign: "center" }}>{label}</Text></TouchableOpacity>;
  return <View testID="entry-quick-actions" style={{ gap: 8 }}>
    {showState && <Text style={{ color: canonical ? policy.stateColor : entry.estado === "aceptado" ? "#22c55e" : "#FF8C00", fontWeight: "800" }}>{state}</Text>}
    {active && <View style={s.actions}>
      {button(received ? (lang === "en" ? "REJECT" : "RECHAZAR") : (lang === "en" ? "CANCEL" : "CANCELAR"), "#f87171", received ? actions.onReject : actions.onCancel)}
      {button(internal ? (lang === "en" ? "EDIT" : "MODIFICAR") : (lang === "en" ? "PROPOSE CHANGE" : "PROPONER CAMBIO"), "#FF8C00", internal ? actions.onEdit : actions.onPropose)}
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
    {policy.canonical && <Text style={{ color: policy.stateColor, fontWeight: "800" }}>{t(policy.stateKey as any)}</Text>}
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

export function GoEntryDetailsSheet({ entry, onClose, onExit, children }: {
  entry: GoEntry | null; onClose: () => void; onExit?: () => void; children?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets(), { lang } = useLanguage();
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_event, g) => g.dy > 18 && Math.abs(g.dx) < 18,
    onPanResponderRelease: (_event, g) => { if (g.dy > 70) onClose(); },
  }), [onClose]);
  if (!entry) return null;
  const current = landingCurrentEntry(entry);
  const pending = entryProposalPending(entry);
  return <Modal visible transparent animationType="fade" onRequestClose={onClose}>
    <View testID="entry-details-overlay" style={{ flex: 1, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8, paddingHorizontal: Math.max(insets.left, insets.right, 8), backgroundColor: "rgba(0,0,0,0.62)" }}>
      <View testID="entry-details-sheet" style={[s.sheet, { borderColor: pending ? "#FF8C00" : entry.color || "#4A80BD" }]}>
        <View testID="entry-detail-close-gesture" {...pan.panHandlers} style={{ height: 24, alignItems: "center", justifyContent: "center" }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.35)" }} /></View>
        <ScrollView testID="entry-details-scroll" style={{ flex: 1 }} bounces={false} alwaysBounceVertical={false} overScrollMode="never" directionalLockEnabled contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 128, gap: 16 }}>
          <GoEntrySummary entry={current} />
          <GoEntryContract entry={current} />
          {pending && <View testID="entry-proposal" style={{ borderColor: "#FF8C00", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 }}>
            <Text style={{ color: "#FF8C00", fontWeight: "800" }}>{entry.estado === "propuesto" ? (lang === "en" ? "CHANGE RECEIVED" : "CAMBIO RECIBIDO") : (lang === "en" ? "AWAITING RESPONSE" : "ESPERANDO RESPUESTA")}</Text>
            <Text style={s.text}>{lang === "en" ? "Proposed: " : "Propuesto: "}{[entry.changeProposal!.date || entry.changeProposal!.dateISO, entry.changeProposal!.time].filter(Boolean).join(" · ")}</Text>
            {!!entry.changeProposal!.note && <Text style={s.secondary}>{entry.changeProposal!.note}</Text>}
          </View>}
          <GoEntryCommunication entry={entry} />
          {children}
        </ScrollView>
        <View style={{ position: "absolute", right: 12, bottom: 12, gap: 8 }}>
          {onExit && <GoCloseButton level="container" accessibilityLabel={lang === "en" ? "Exit calendar" : "Salir del calendario"} onPress={onExit} />}
          <GoCloseButton level="panel" accessibilityLabel={lang === "en" ? "Close details" : "Cerrar detalle"} onPress={onClose} />
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
  contact: { flex: 1, minHeight: 44, padding: 10, borderWidth: 1, borderColor: "#4ade80", borderRadius: 10, alignItems: "center", justifyContent: "center" },
  contactText: { color: "#4ade80", fontWeight: "700" },
});
