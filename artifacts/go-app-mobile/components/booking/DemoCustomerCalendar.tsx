import React, { useEffect, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";
import { AgendaBoard, type GoEntry } from "@/components/AgendaOperativa";
import { GoCalendarViewSelector } from "@/components/ui/GoCalendarViewSelector";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLanguage } from "@/contexts/LanguageContext";
import type { DemoBookingRepository } from "@/data/demoBookingRepository";

/** Customer projection of the owner-local repository; never mounted with the personal agenda hooks. */
export function DemoCustomerCalendar({ repository, focus, onPersonal, entries: suppliedEntries, onProposeChange, onAcceptProposal, onRejectProposal }: {
  repository: DemoBookingRepository;
  entries?: GoEntry[];
  onProposeChange?: (entry:GoEntry)=>void;
  onAcceptProposal?: (id:string)=>void;
  onRejectProposal?: (id:string)=>void;
  focus?: { dateISO: string; timeHHMM: string; entryId: string; token: number };
  onPersonal: () => void;
}) {
  const { lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const [entries, setEntries] = useState<GoEntry[]>(() => repository.getCustomerEntries());
  const [view, setView] = useState<"semana" | "mes_lineal" | "dia">("semana");
  const [month, setMonth] = useState(() => (focus?.dateISO ?? new Date().toISOString()).slice(0, 7));
  useEffect(() => {
    let active = true;
    const refresh = () => { if (active) setEntries(repository.getCustomerEntries()); };
    refresh();
    const unsubscribe = repository.store.subscribe(refresh);
    return () => { active = false; unsubscribe(); };
  }, [repository]);
  useEffect(() => { if (focus) setMonth(focus.dateISO.slice(0, 7)); }, [focus?.token]);
  const cancel = async (id: string) => {
    const entry = repository.getCustomerEntries().find(value => value.id === id);
    if (!entry?.reservationId) return;
    try { await repository.cancelCustomerEntry(String(entry.reservationId), String(entry.businessId)); }
    catch { Alert.alert(lang === "en" ? "Could not cancel" : "No se pudo cancelar", lang === "en" ? "The reservation was not changed." : "La reserva no se ha modificado."); }
  };
  return <View style={{ flex: 1 }} testID="demo-customer-calendar">
    <View style={{ paddingHorizontal: 16, paddingBottom: 8, paddingTop: insets.top + 8, gap: 8 }}>
      <Text style={{ color: "#ff7474", fontSize: 12, fontWeight: "700" }}>{lang === "en" ? "Customer calendar" : "Calendario cliente"}</Text>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <GoCalendarViewSelector value={view} onChange={setView} />
        <TouchableOpacity onPress={onPersonal} accessibilityRole="button" style={{ padding: 8 }}>
          <Text style={{ color: "#ffffff", fontSize: 12 }}>{lang === "en" ? "Personal calendar" : "Calendario personal"}</Text>
        </TouchableOpacity>
      </View>
    </View>
    <AgendaBoard goLog={suppliedEntries ?? entries} embedded viewMode={view} calViewMonth={month} showHours density="30min"
      selectedDateISO={focus?.dateISO} scrollToDateToken={focus} highlightEntryId={focus?.entryId}
      onChangeMonth={direction => { const [year, value] = month.split("-").map(Number); const date = new Date(year, value - 1 + direction, 1, 12); setMonth(String(date.getFullYear()) + "-" + String(date.getMonth() + 1).padStart(2, "0")); }}
      onDeleteItem={cancel} onProposeItem={id=>{const entry=(suppliedEntries ?? entries).find(e=>e.id===id);if(entry)onProposeChange?.(entry);}}
      onAcceptProposal={onAcceptProposal} onRejectProposal={onRejectProposal} onProposeProposal={id=>{const entry=(suppliedEntries ?? entries).find(e=>e.id===id);if(entry)onProposeChange?.(entry);}} />
  </View>;
}
