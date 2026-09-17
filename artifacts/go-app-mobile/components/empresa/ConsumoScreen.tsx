import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { METRICAS_VOLUMEN, BLOQUES_VOLUMEN } from "@/data/mockEconomia";
import { useLanguage } from "@/contexts/LanguageContext";

const LIGHT = { BG: "#F7F8FA", CARD: "#FFFFFF", BORD: "rgba(0,0,0,0.08)", TEXT: "#111827", GRAY: "#6B7280", DIM: "#9CA3AF", AVATAR_BG: "#EFF6FF", AVATAR_TXT: "#4A80BD" };
const DARK  = { BG: "#0D0E11", CARD: "#1A1B1F", BORD: "rgba(255,255,255,0.08)", TEXT: "#FFFFFF", GRAY: "rgba(255,255,255,0.50)", DIM: "rgba(255,255,255,0.28)", AVATAR_BG: "rgba(74,128,189,0.20)", AVATAR_TXT: "#6aabff" };

const MOCK_POR_USUARIO = [
  { nombre: "Carlos M.",  go: 312, tareas: 890,  mensajes: 2140 },
  { nombre: "Ana R.",     go: 278, tareas: 760,  mensajes: 1890 },
  { nombre: "Pedro J.",   go: 201, tareas: 430,  mensajes: 980  },
  { nombre: "Lucía F.",   go: 189, tareas: 560,  mensajes: 1340 },
  { nombre: "Marcos G.",  go: 154, tareas: 340,  mensajes: 780  },
  { nombre: "Sara B.",    go: 113, tareas: 260,  mensajes: 640  },
];

const MOCK_POR_DEPT = [
  { depto: "Logistics",      go: 487, color: "#3D9A84" },
  { depto: "Administration", go: 312, color: "#4A80BD" },
  { depto: "Operations",     go: 278, color: "#7C69BE" },
  { depto: "HR",             go: 170, color: "#C25A5A" },
];

const MOCK_POR_DEPT_ES = [
  { depto: "Logística",      go: 487, color: "#3D9A84" },
  { depto: "Administración", go: 312, color: "#4A80BD" },
  { depto: "Operaciones",    go: 278, color: "#7C69BE" },
  { depto: "RRHH",           go: 170, color: "#C25A5A" },
];

export function ConsumoScreen({ guidanceLevel: _g = 5, dark = false }: { guidanceLevel?: number; dark?: boolean }) {
  const { lang } = useLanguage();
  const C = dark ? DARK : LIGHT;
  const v = METRICAS_VOLUMEN;
  const pct = Math.min(100, Math.round((v.usoTotal / v.limiteIncluido) * 100));
  const depts = lang === "en" ? MOCK_POR_DEPT : MOCK_POR_DEPT_ES;

  return (
    <ScrollView style={[s.container, { backgroundColor: C.BG }]} showsVerticalScrollIndicator={false}>
      <View style={[s.heroCard, { backgroundColor: C.CARD, borderColor: C.BORD }]}>
        <Text style={[s.heroLabel, { color: C.DIM }]}>{lang === "en" ? "GO used this month" : "GO usados este mes"}</Text>
        <Text style={[s.heroVal, { color: C.TEXT }]}>{v.goCreados.toLocaleString()}</Text>
        <Text style={[s.heroSub, { color: C.GRAY }]}>
          {lang === "en" ? `of ${v.limiteIncluido.toLocaleString()} included in plan` : `de ${v.limiteIncluido.toLocaleString()} incluidos en el plan`}
        </Text>
        <View style={[s.progressBg, { backgroundColor: C.BORD }]}>
          <View style={[s.progressFill, { width: `${pct}%` as any, backgroundColor: pct > 85 ? "#ef4444" : "#3D9A84" }]} />
        </View>
        <Text style={[s.pctTxt, { color: C.GRAY }]}>{pct}% {lang === "en" ? "used" : "utilizado"}</Text>
      </View>

      <View style={s.grid}>
        <KpiCard icon="send"           label={lang === "en" ? "Sent"          : "Enviados"}         value={v.goEnviados.toLocaleString()}       color="#4A80BD" C={C} />
        <KpiCard icon="check-circle"   label={lang === "en" ? "Completed"     : "Completados"}      value={v.goCompletados.toLocaleString()}    color="#3D9A84" C={C} />
        <KpiCard icon="check-square"   label={lang === "en" ? "Tasks"         : "Tareas"}           value={v.tareasCreadas.toLocaleString()}    color="#7C69BE" C={C} />
        <KpiCard icon="message-circle" label={lang === "en" ? "Messages"      : "Mensajes"}         value={v.mensajesEnviados.toLocaleString()} color="#f59e0b" C={C} />
        <KpiCard icon="users"          label={lang === "en" ? "Active users"  : "Usuarios activos"} value={v.usuariosActivos.toString()}        color="#C4883A" C={C} />
        <KpiCard icon="activity"       label={lang === "en" ? "Total usage"   : "Total uso"}        value={v.usoTotal.toLocaleString()}         color="#C97040" C={C} />
      </View>

      <Text style={[s.sectionTitle, { color: C.DIM }]}>{lang === "en" ? "Additional volume blocks" : "Bloques de volumen adicional"}</Text>
      <View style={s.bloques}>
        {BLOQUES_VOLUMEN.map((b) => (
          <View key={b.bloqueId} style={[s.bloqueCard, { backgroundColor: C.CARD, borderColor: C.BORD }]}>
            <Text style={[s.bloqueGO, { color: C.TEXT }]}>+{b.cantidadGO.toLocaleString()}</Text>
            <Text style={[s.bloqueDesc, { color: C.DIM }]}>GO</Text>
            <Text style={s.bloquePrecio}>{b.precio} €</Text>
          </View>
        ))}
      </View>

      <Text style={[s.sectionTitle, { color: C.DIM }]}>{lang === "en" ? "GO per user" : "GO por usuario"}</Text>
      {MOCK_POR_USUARIO.map((u, i) => {
        const maxGO = MOCK_POR_USUARIO[0].go;
        const pctU = Math.round((u.go / maxGO) * 100);
        return (
          <View key={i} style={[s.userRow, { backgroundColor: C.CARD, borderColor: C.BORD }]}>
            <View style={[s.userAvatar, { backgroundColor: C.AVATAR_BG }]}>
              <Text style={[s.userAvatarTxt, { color: C.AVATAR_TXT }]}>{u.nombre.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <View style={s.userTopRow}>
                <Text style={[s.userName, { color: C.TEXT }]}>{u.nombre}</Text>
                <Text style={[s.userGO, { color: "#4A80BD" }]}>{u.go} GO</Text>
              </View>
              <View style={[s.progressBgSm, { backgroundColor: C.BORD }]}>
                <View style={[s.progressFillSm, { width: `${pctU}%` as any }]} />
              </View>
              <View style={s.userStats}>
                <Text style={[s.userStat, { color: C.GRAY }]}>{u.tareas} {lang === "en" ? "tasks" : "tareas"}</Text>
                <Text style={[s.userStat, { color: C.GRAY }]}>{u.mensajes} {lang === "en" ? "messages" : "mensajes"}</Text>
              </View>
            </View>
          </View>
        );
      })}

      <Text style={[s.sectionTitle, { color: C.DIM }]}>{lang === "en" ? "GO per department" : "GO por departamento"}</Text>
      {depts.map((d, i) => {
        const maxGO = depts[0].go;
        const pctD = Math.round((d.go / maxGO) * 100);
        return (
          <View key={i} style={[s.deptRow, { backgroundColor: C.CARD, borderColor: C.BORD }]}>
            <View style={[s.deptDot, { backgroundColor: d.color }]} />
            <View style={{ flex: 1 }}>
              <View style={s.userTopRow}>
                <Text style={[s.userName, { color: C.TEXT }]}>{d.depto}</Text>
                <Text style={[s.userGO, { color: d.color }]}>{d.go} GO</Text>
              </View>
              <View style={[s.progressBgSm, { backgroundColor: C.BORD }]}>
                <View style={[s.progressFillSm, { width: `${pctD}%` as any, backgroundColor: d.color }]} />
              </View>
            </View>
          </View>
        );
      })}

      <Text style={[s.sectionTitle, { color: C.DIM }]}>{lang === "en" ? "AI & suggestions" : "IA y sugerencias"}</Text>
      <View style={s.iaGrid}>
        <IaChip icon="cpu"     label={lang === "en" ? "AI queries"   : "Consultas IA"}   value="87"  color="#7C69BE" C={C} />
        <IaChip icon="zap"     label={lang === "en" ? "Suggestions"  : "Sugerencias"}    value="234" color="#f59e0b" C={C} />
        <IaChip icon="link"    label={lang === "en" ? "Leads sent"   : "Leads enviados"} value="18"  color="#C25A5A" C={C} />
        <IaChip icon="percent" label={lang === "en" ? "Conversions"  : "Conversiones"}   value="6"   color="#4A80BD" C={C} />
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

type Theme = typeof LIGHT;

function KpiCard({ icon, label, value, color, C }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string; C: Theme }) {
  return (
    <View style={[s.kpiCard, { borderColor: color + "35", backgroundColor: C.CARD }]}>
      <Feather name={icon} size={16} color={color} />
      <Text style={[s.kpiVal, { color }]}>{value}</Text>
      <Text style={[s.kpiLabel, { color: C.GRAY }]}>{label}</Text>
    </View>
  );
}

function IaChip({ icon, label, value, color, C }: { icon: keyof typeof Feather.glyphMap; label: string; value: string; color: string; C: Theme }) {
  return (
    <View style={[s.iaChip, { borderColor: color + "35", backgroundColor: C.CARD }]}>
      <Feather name={icon} size={20} color={color} />
      <Text style={[s.iaVal, { color }]}>{value}</Text>
      <Text style={[s.iaLabel, { color: C.GRAY }]}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container:      { flex: 1, padding: 16 },
  heroCard:       { borderRadius: 18, padding: 20, marginBottom: 16, borderWidth: 1, alignItems: "center",
                    shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 10, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  heroLabel:      { fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 },
  heroVal:        { fontSize: 44, fontWeight: "900", marginBottom: 4 },
  heroSub:        { fontSize: 12, marginBottom: 14 },
  progressBg:     { width: "100%", height: 6, borderRadius: 3, overflow: "hidden", marginBottom: 6 },
  progressFill:   { height: 6, borderRadius: 3 },
  pctTxt:         { fontSize: 12, fontWeight: "600" },
  grid:           { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  kpiCard:        { width: "47%", flexGrow: 1, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: "center", gap: 4,
                    shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  kpiVal:         { fontSize: 22, fontWeight: "900" },
  kpiLabel:       { fontSize: 10, fontWeight: "600", textTransform: "uppercase", textAlign: "center" },
  sectionTitle:   { fontSize: 11, fontWeight: "700", letterSpacing: 1, textTransform: "uppercase", marginBottom: 10, marginTop: 4 },
  bloques:        { flexDirection: "row", gap: 8, marginBottom: 20 },
  bloqueCard:     { flex: 1, borderRadius: 12, padding: 12, borderWidth: 1, alignItems: "center" },
  bloqueGO:       { fontSize: 16, fontWeight: "800" },
  bloqueDesc:     { fontSize: 10, marginBottom: 4 },
  bloquePrecio:   { fontSize: 14, color: "#3D9A84", fontWeight: "700" },
  userRow:        { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 10, borderRadius: 12, padding: 12, borderWidth: 1 },
  userAvatar:     { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  userAvatarTxt:  { fontSize: 14, fontWeight: "800" },
  userTopRow:     { flexDirection: "row", justifyContent: "space-between", marginBottom: 5 },
  userName:       { fontSize: 13, fontWeight: "600" },
  userGO:         { fontSize: 13, fontWeight: "700" },
  userStats:      { flexDirection: "row", gap: 12, marginTop: 4 },
  userStat:       { fontSize: 10 },
  progressBgSm:   { height: 3, borderRadius: 2, overflow: "hidden" },
  progressFillSm: { height: 3, borderRadius: 2, backgroundColor: "#4A80BD" },
  deptRow:        { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10, borderRadius: 12, padding: 12, borderWidth: 1 },
  deptDot:        { width: 8, height: 8, borderRadius: 4 },
  iaGrid:         { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  iaChip:         { width: "47%", flexGrow: 1, borderRadius: 14, padding: 14, borderWidth: 1, alignItems: "center", gap: 5 },
  iaVal:          { fontSize: 28, fontWeight: "900" },
  iaLabel:        { fontSize: 10, fontWeight: "600", textTransform: "uppercase", textAlign: "center" },
});
