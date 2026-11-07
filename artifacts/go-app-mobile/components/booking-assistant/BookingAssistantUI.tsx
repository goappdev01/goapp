import { GO_ASSISTANT_GOLD, GO_ASSISTANT_LABEL } from "@/theme/goAssistantColors";
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import type { BookableItem, Booking } from "@/data/booking";
export const bookingDate = (value: string) =>
  value.slice(0, 10).split("-").reverse().join("/") +
  " · " +
  value.slice(11, 16);
export const money = (item: BookableItem) =>
  item.priceKnown === false
    ? "Precio a consultar"
    : new Intl.NumberFormat("es-ES", {
        style: "currency",
        currency: item.currency || "EUR",
      }).format(item.price);
export const canCancel = (booking: Booking) =>
  ["CONFIRMED", "HOLD"].includes(booking.status) &&
  new Date(booking.startDatetime).getTime() > Date.now();
export function IconButton({
  icon,
  label,
  onPress,
  disabled = false,
  appearance = "default",
}: {
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  onPress: () => void;
  disabled?: boolean;
  appearance?:"default"|"note"|"supportAction";
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={[s.iconButton,appearance==="note"&&{backgroundColor:"#f4f6f8",borderColor:"#b4bdc6"},appearance==="supportAction"&&s.supportAction, disabled && s.disabled]}
    >
      <Feather name={icon} size={22} color={appearance==="supportAction"&&icon==="trash-2"?"#b4232f":appearance==="note"||appearance==="supportAction"?"#17212b":"#163F60"} />
    </TouchableOpacity>
  );
}
/** Approved GO gold surface/white label, without coupling its action to dictation. */
export function GoAssistantButton({onPress,disabled=false,size=56}:{onPress:()=>void;disabled?:boolean;size?:number}){
 return <TouchableOpacity accessibilityRole="button" accessibilityLabel="Consultar a GO IA" accessibilityState={{disabled}} disabled={disabled} activeOpacity={0.78} onPress={onPress}
  style={[s.goButton,{width:size,minWidth:size,maxWidth:size,height:size,minHeight:size,borderRadius:size/2,marginHorizontal:0,alignItems:"center",justifyContent:"center"},disabled&&s.disabled]}>
  <Text style={[s.goLabel,{fontSize:size>64?Math.round(size*.34):19,fontWeight:"900"}]}>GO</Text>
 </TouchableOpacity>;
}
/** Compact paper plane; disabled transport is explicit and never implies delivery. */
export function GoSendButton({onPress,disabled,busy=false,label="Enviar solicitud",testID}:{onPress:()=>void;disabled:boolean;busy?:boolean;label?:string;testID?:string}){
 return <TouchableOpacity testID={testID} accessibilityRole="button" accessibilityLabel={busy?"Enviando…":label} accessibilityState={{disabled,busy}} accessibilityHint={disabled?"Envío no disponible":undefined} disabled={disabled} onPress={onPress} activeOpacity={0.75}
  style={{width:44,height:44,alignItems:"center",justifyContent:"center",borderRadius:14,backgroundColor:disabled?"#edf0ee":"#e7f3eb",borderWidth:1,borderColor:disabled?"#d2d9d4":"#9bc6ac"}}>
  <Feather name="send" size={22} color={disabled?"#728578":"#16834a"}/>
 </TouchableOpacity>;
}
export function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.detail}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}
export function Action({
  text,
  onPress,
  primary = false,
  tools = false,
  disabled = false,
}: {
  text: string;
  onPress: () => void;
  primary?: boolean;
  tools?: boolean;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.action, tools && z.action, primary && (tools ? z.primary : s.primary), disabled && s.disabled]}
    >
      <Text style={[s.actionText, tools && z.actionText, primary && { color: "#FFF" }]}>{text}</Text>
    </TouchableOpacity>
  );
}
export function Choice({
  title,
  subtitle,
  tools = false,
  onPress,
  disabled = false,
}: {
  title: string;
  subtitle?: string;
  tools?: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={[s.choice, tools && z.choice, disabled && s.disabled]}
    >
      <View style={{ flex: 1 }}>
        <Text style={[s.choiceTitle, tools && z.sectionTitle]}>{title}</Text>
        {!!subtitle && <Text style={[s.caption, tools && z.caption]}>{subtitle}</Text>}
      </View>
      <Feather name="chevron-right" size={21} color="#163F60" />
    </TouchableOpacity>
  );
}
export const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#E6EBE7" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: "#F7FAF7",
    borderBottomWidth: 1,
    borderBottomColor: "#B7C8BD",
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.4,
    color: "#376055",
  },
  title: { fontSize: 18, fontWeight: "700", color: "#163F35", marginTop: 3 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  supportAction:{backgroundColor:"#f4f6f8",borderColor:"#b4bdc6",borderWidth:1,borderRadius:12,shadowColor:"#18202A",shadowOffset:{width:0,height:2},shadowOpacity:.12,shadowRadius:3,elevation:2,flexShrink:0},
  conversation: { padding: 16, gap: 12, paddingBottom: 20 },
  bubble: {
    maxWidth: "88%",
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
  },
  goBubble: {
    alignSelf: "flex-start",
    backgroundColor: "#F7FFF8",
    borderColor: "#B0C6B5",
    borderBottomLeftRadius: 4,
  },
  userBubble: {
    alignSelf: "flex-end",
    backgroundColor: "#173F65",
    borderColor: "#173F65",
    borderBottomRightRadius: 4,
  },
  role: {
    fontSize: 10,
    letterSpacing: 1,
    fontWeight: "800",
    color: "#174D3C",
    marginBottom: 5,
  },
  body: { fontSize: 16, lineHeight: 24, color: "#174D3C" },
  userText: { color: "#FFF" },
  card: {
    backgroundColor: "#FFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ACBEB1",
    padding: 15,
    gap: 10,
    marginVertical: 3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: "#183F35",
    marginVertical: 6,
  },
  detail: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailLabel: {
    width: 78,
    fontSize: 13,
    lineHeight: 21,
    color: "#4B625A",
    fontWeight: "600",
  },
  detailValue: {
    flex: 1,
    fontSize: 14,
    lineHeight: 21,
    color: "#193D32",
    fontWeight: "600",
  },
  caption: { fontSize: 13, lineHeight: 20, color: "#40584D" },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#FFF",
    borderWidth: 1,
    borderColor: "#ADBFB3",
    padding: 15,
    borderRadius: 14,
    minHeight: 60,
    marginVertical: 4,
  },
  choiceTitle: {
    fontSize: 16,
    lineHeight: 22,
    color: "#193F35",
    fontWeight: "600",
  },
  action: {
    minHeight: 48,
    padding: 13,
    justifyContent: "center",
    borderRadius: 12,
    marginVertical: 4,
    backgroundColor: "#ECF2EE",
  },
  primary: { backgroundColor: "#174D3C" },
  actionText: { color: "#163F60", fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.45 },
  status: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 9,
    backgroundColor: "#F7FAF7",
  },
  statusText: { flexShrink: 1, fontSize: 13, lineHeight: 19, color: "#244F40" },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingTop: 10,
    backgroundColor: "#FFF",
    borderTopWidth: 1,
    borderTopColor: "#BCCBC1",
  },
  input: {
    flex: 1,
    minHeight: 46,
    maxHeight: 112,
    backgroundColor: "#EFF3F0",
    borderWidth: 1,
    borderColor: "#AFBFB5",
    paddingVertical: 11,
    paddingHorizontal: 14,
    borderRadius: 23,
    fontSize: 15,
    lineHeight: 21,
    color: "#193F35",
  },
  dock: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFF",
    paddingHorizontal: 8,
    paddingTop: 9,
    paddingBottom: 8,
    minHeight: 84,
  },
  dockButton: {
    flex: 1,
    minWidth: 44,
    minHeight: 64,
    paddingVertical: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
  },
  dockLabel: { fontSize: 11, fontWeight: "700", color: "#163F60" },
  goLabel: GO_ASSISTANT_LABEL,
  radiusLabel: { fontSize: 10, color: "#39574B" },
  goButton: {
    flex: 0,
    flexGrow: 0,
    flexShrink: 0,
    width: 64,
    minWidth: 64,
    aspectRatio: 1,
    overflow: "hidden",
    borderRadius: 32,
    borderWidth: 2,
    borderColor: "#967018",
    maxWidth: 64,
    height: 64,
    backgroundColor: GO_ASSISTANT_GOLD,
    marginHorizontal: 4,
  },
  listening: { backgroundColor: "#C62828", borderColor: "#C62828" },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(11,31,24,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    maxHeight: "85%",
    flexShrink: 1,
    backgroundColor: "#FFF",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 8,
  },
  field: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: "#9DB3A4",
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: "#193F35",
    marginVertical: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 8 },
  chip: {
    minHeight: 44,
    minWidth: 54,
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#EDF2EE",
    borderWidth: 1,
    borderColor: "#A7B9AD",
  },
  activeChip: {
    backgroundColor: "#D2E7D9",
    borderColor: "#174D3C",
    borderWidth: 2,
  },
  chipText: { color: "#193F35", fontWeight: "700" },
  attachment: {
    flexDirection: "row",
    alignItems: "center",
    maxWidth: 220,
    gap: 6,
    borderWidth: 1,
    borderColor: "#AFBFB5",
    borderRadius: 10,
  },
  attachmentHint: {
    paddingHorizontal: 14,
    paddingBottom: 8,
    color: "#40584D",
    fontSize: 11,
    backgroundColor: "#FFF",
  },
});

// HERRAMIENTAS typography, colors and form geometry.
export const z = StyleSheet.create({
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#111827", marginVertical: 8 },
  caption: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, color: "#6B7280" },
  field: { minHeight: 48, padding: 12, borderRadius: 12, borderWidth: 1,
    borderColor: "rgba(0,0,0,0.07)", backgroundColor: "#F7F8FA", fontFamily: "Inter_400Regular", fontSize: 15, color: "#111827", marginVertical: 8 },
  action: { backgroundColor: "#F7F8FA", borderRadius: 12, borderWidth: 1, borderColor: "rgba(0,0,0,0.07)", padding: 16 },
  actionText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#4A80BD" },
  primary: { backgroundColor: "#4A80BD" },
  choice: { borderColor: "rgba(0,0,0,0.07)", borderRadius: 16, padding: 16 },
  chip: { backgroundColor: "#F7F8FA", borderColor: "rgba(0,0,0,0.07)" },
  activeChip: { backgroundColor: "rgba(74,128,189,0.10)", borderColor: "#4A80BD" },
  chipText: { fontFamily: "Inter_600SemiBold", color: "#111827" },
});
