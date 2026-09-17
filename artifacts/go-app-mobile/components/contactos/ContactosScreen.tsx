import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import {
  loadContactos,
  deleteContacto,
  type Contacto,
  type TipoContacto,
} from "@/data/contactos";
import { ImportacionScreen } from "./ImportacionScreen";
import { getGuidanceConfig } from "@/utils/guidance";
import { useLanguage } from "@/contexts/LanguageContext";

const TIPO_COLOR: Record<TipoContacto, string> = {
  cliente:    "#6ee7b7",
  proveedor:  "#3b82f6",
  tecnico:    "#8b5cf6",
  comercial:  "#f97316",
  otro:       "#6b7280",
};

interface Props {
  onBack: () => void;
  guidanceLevel?: number;
}

export function ContactosScreen({ onBack, guidanceLevel = 5 }: Props) {
  const { lang } = useLanguage();
  const [contactos, setContactos]           = useState<Contacto[]>([]);
  const [query, setQuery]                   = useState("");
  const [filtroTipo, setFiltroTipo]         = useState<TipoContacto | "todos">("todos");
  const [showImport, setShowImport]         = useState(false);
  const [expandedId, setExpandedId]         = useState<string | null>(null);
  const guidanceCfg = useMemo(() => getGuidanceConfig(guidanceLevel), [guidanceLevel]);

  const TIPO_FILTER: { key: TipoContacto | "todos"; label: string }[] = lang === "en"
    ? [
        { key: "todos",     label: "All" },
        { key: "cliente",   label: "Clients" },
        { key: "proveedor", label: "Suppliers" },
        { key: "tecnico",   label: "Technicians" },
        { key: "comercial", label: "Sales Reps" },
        { key: "otro",      label: "Others" },
      ]
    : [
        { key: "todos",     label: "Todos" },
        { key: "cliente",   label: "Clientes" },
        { key: "proveedor", label: "Proveedores" },
        { key: "tecnico",   label: "Técnicos" },
        { key: "comercial", label: "Comerciales" },
        { key: "otro",      label: "Otros" },
      ];

  const fetchContactos = useCallback(async () => {
    const data = await loadContactos();
    setContactos(data);
  }, []);

  useEffect(() => {
    fetchContactos();
  }, [fetchContactos]);

  const filtered = contactos.filter((c) => {
    if (filtroTipo !== "todos" && c.tipo !== filtroTipo) return false;
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      c.empresa.toLowerCase().includes(q) ||
      c.responsable.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.ciudad.toLowerCase().includes(q)
    );
  });

  const handleDelete = (c: Contacto) => {
    const name = c.empresa || c.responsable || (lang === "en" ? "this contact" : "este contacto");
    Alert.alert(
      lang === "en" ? "Delete contact" : "Eliminar contacto",
      lang === "en" ? `Delete ${name}?` : `¿Eliminar a ${name}?`,
      [
        { text: lang === "en" ? "Cancel" : "Cancelar", style: "cancel" },
        {
          text: lang === "en" ? "Delete" : "Eliminar",
          style: "destructive",
          onPress: async () => {
            await deleteContacto(c.id);
            fetchContactos();
          },
        },
      ]
    );
  };

  if (showImport) {
    return (
      <View style={s.importWrapper}>
        <View style={s.importHeader}>
          <TouchableOpacity
            onPress={() => setShowImport(false)}
            hitSlop={8}
            activeOpacity={0.8}
            accessibilityLabel="Volver"
            style={s.backBtn}
          >
            <Feather name="chevron-down" size={18} color="rgba(255,255,255,0.70)" />
          </TouchableOpacity>
          <Text style={s.importTitle}>
            {lang === "en" ? "Import file" : "Importar archivo"}
          </Text>
          <View style={{ width: 36 }} />
        </View>
        <ImportacionScreen
          onClose={() => {
            setShowImport(false);
            fetchContactos();
          }}
          onImportado={fetchContactos}
        />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* ── Search + import ── */}
      <View style={s.topBar}>
        <View style={s.searchBox}>
          <Feather name="search" size={14} color="#555" />
          <TextInput
            style={s.searchInput}
            placeholder={lang === "en" ? "Search company, email, city…" : "Buscar empresa, email, ciudad…"}
            placeholderTextColor="#555"
            value={query}
            onChangeText={setQuery}
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => setQuery("")} hitSlop={8}>
              <Feather name="x" size={14} color="#555" />
            </TouchableOpacity>
          )}
        </View>
        <TouchableOpacity
          style={s.importBtn}
          onPress={() => setShowImport(true)}
          activeOpacity={0.85}
        >
          <Feather name="upload-cloud" size={16} color="#000" />
        </TouchableOpacity>
      </View>

      {/* ── Tipo filter ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.filterScroll}
        contentContainerStyle={s.filterContent}
      >
        {TIPO_FILTER.map((f) => (
          <TouchableOpacity
            key={f.key}
            style={[
              s.filterPill,
              filtroTipo === f.key && s.filterPillActive,
            ]}
            onPress={() => setFiltroTipo(f.key)}
          >
            <Text
              style={[
                s.filterPillTxt,
                filtroTipo === f.key && { color: "#3D9A84" },
              ]}
            >
              {f.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── Stats bar ── */}
      <View style={s.statsBar}>
        <Text style={s.statsText}>
          {lang === "en"
            ? `${filtered.length} of ${contactos.length} contacts`
            : `${filtered.length} de ${contactos.length} contactos`}
        </Text>
        {contactos.length > 0 && (
          <View style={s.typeDots}>
            {(["cliente","proveedor","tecnico","comercial","otro"] as TipoContacto[]).map((t) => {
              const n = contactos.filter(c => c.tipo === t).length;
              if (!n) return null;
              return (
                <View key={t} style={s.typeDot}>
                  <View style={[s.dot, { backgroundColor: TIPO_COLOR[t] }]} />
                  <Text style={s.dotTxt}>{n}</Text>
                </View>
              );
            })}
          </View>
        )}
      </View>

      {/* ── List ── */}
      {contactos.length === 0 ? (
        <EmptyState onImport={() => setShowImport(true)} showHint={guidanceCfg.hintMaxCount > 0} />
      ) : filtered.length === 0 ? (
        <View style={s.noResults}>
          <Feather name="search" size={32} color="#2a2a2a" />
          <Text style={s.noResultsTxt}>
            {lang === "en" ? `No results for "${query}"` : `Sin resultados para "${query}"`}
          </Text>
        </View>
      ) : (
        <ScrollView
          style={s.list}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 30 }}
        >
          {filtered.map((c) => (
            <ContactCard
              key={c.id}
              contacto={c}
              expanded={expandedId === c.id}
              onToggle={() =>
                setExpandedId((prev) => (prev === c.id ? null : c.id))
              }
              onDelete={() => handleDelete(c)}
            />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────

const TIPO_LABEL_EN: Record<TipoContacto, string> = {
  cliente:   "client",
  proveedor: "supplier",
  tecnico:   "tech",
  comercial: "sales",
  otro:      "other",
};

function ContactCard({
  contacto: c,
  expanded,
  onToggle,
  onDelete,
}: {
  contacto: Contacto;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const { lang } = useLanguage();
  const color = TIPO_COLOR[c.tipo] ?? "#6b7280";
  return (
    <TouchableOpacity
      style={[s.card, expanded && { borderColor: color + "44" }]}
      activeOpacity={0.85}
      onPress={onToggle}
    >
      <View style={s.cardHeader}>
        <View style={[s.cardAccent, { backgroundColor: color }]} />
        <View style={s.cardMain}>
          <Text style={s.cardEmpresa} numberOfLines={1}>
            {c.empresa || <Text style={{ color: "#555" }}>{lang === "en" ? "No company" : "Sin empresa"}</Text>}
          </Text>
          <Text style={s.cardSub} numberOfLines={1}>
            {[c.responsable, c.ciudad].filter(Boolean).join(" · ") || c.email || "—"}
          </Text>
        </View>
        <View style={s.cardRight}>
          <View style={[s.tipoPill, { backgroundColor: color + "22" }]}>
            <Text style={[s.tipoPillTxt, { color }]}>
              {lang === "en" ? TIPO_LABEL_EN[c.tipo] : c.tipo}
            </Text>
          </View>
          <Feather
            name={expanded ? "chevron-up" : "chevron-down"}
            size={13}
            color="#444"
          />
        </View>
      </View>

      {expanded && (
        <View style={s.cardDetail}>
          {[
            { icon: "mail" as const,     val: c.email },
            { icon: "phone" as const,    val: c.telefono },
            { icon: "map-pin" as const,  val: [c.direccion, c.ciudad, c.provincia, c.pais].filter(Boolean).join(", ") },
            { icon: "user" as const,     val: c.responsable },
            { icon: "clock" as const,    val: c.frecuenciaVisita ? `${lang === "en" ? "Visit" : "Visita"}: ${c.frecuenciaVisita}` : "" },
            { icon: "message-square" as const, val: c.observaciones },
          ]
            .filter((r) => r.val)
            .map((r, i) => (
              <View key={i} style={s.detailRow}>
                <Feather name={r.icon} size={12} color="#555" />
                <Text style={s.detailTxt} numberOfLines={2}>
                  {r.val}
                </Text>
              </View>
            ))}

          <TouchableOpacity style={s.deleteBtn} onPress={onDelete}>
            <Feather name="trash-2" size={12} color="#ef4444" />
            <Text style={s.deleteBtnTxt}>
              {lang === "en" ? "Delete contact" : "Eliminar contacto"}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </TouchableOpacity>
  );
}

function EmptyState({ onImport, showHint = true }: { onImport: () => void; showHint?: boolean }) {
  const { lang } = useLanguage();
  return (
    <View style={s.empty}>
      <View style={s.emptyIcon}>
        <Feather name="users" size={36} color="#2a2a2a" />
      </View>
      <Text style={s.emptyTitle}>
        {lang === "en" ? "No contacts yet" : "Sin contactos todavía"}
      </Text>
      {showHint && (
        <Text style={s.emptySub}>
          {lang === "en"
            ? "Import clients, suppliers or contacts from a CSV or Excel to start planning visits and routes."
            : "Importa clientes, proveedores o contactos desde un CSV o Excel para empezar a planificar visitas y rutas."}
        </Text>
      )}
      <TouchableOpacity style={s.emptyBtn} onPress={onImport} activeOpacity={0.85}>
        <Feather name="upload-cloud" size={16} color="#000" />
        <Text style={s.emptyBtnTxt}>
          {lang === "en" ? "Import first file" : "Importar primer archivo"}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:            { flex: 1 },

  importWrapper:   { flex: 1 },
  importHeader:    { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" },
  backBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: "#F7F8FA", borderWidth: 1, borderColor: "rgba(0,0,0,0.1)", alignItems: "center", justifyContent: "center" },
  importTitle:     { flex: 1, fontSize: 15, fontWeight: "800", color: "#111827", textAlign: "center" },

  topBar:          { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  searchBox:       { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: "#F7F8FA", borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  searchInput:     { flex: 1, fontSize: 13, color: "#111827" },
  importBtn:       { width: 40, height: 40, borderRadius: 12, backgroundColor: "#3D9A84", alignItems: "center", justifyContent: "center" },

  filterScroll:    { flexGrow: 0, marginBottom: 4 },
  filterContent:   { paddingHorizontal: 14, gap: 6 },
  filterPill:      { borderRadius: 99, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: "#FFFFFF", borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  filterPillActive:{ borderColor: "rgba(61,154,132,0.3)", backgroundColor: "rgba(61,154,132,0.08)" },
  filterPillTxt:   { fontSize: 11, color: "#6B7280", fontWeight: "600" },

  statsBar:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 6 },
  statsText:       { fontSize: 11, color: "#9CA3AF", fontWeight: "600" },
  typeDots:        { flexDirection: "row", gap: 8 },
  typeDot:         { flexDirection: "row", alignItems: "center", gap: 3 },
  dot:             { width: 6, height: 6, borderRadius: 3 },
  dotTxt:          { fontSize: 10, color: "#9CA3AF" },

  list:            { flex: 1, paddingHorizontal: 14 },

  card:            { backgroundColor: "#FFFFFF", borderRadius: 14, marginBottom: 8, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)", overflow: "hidden" },
  cardHeader:      { flexDirection: "row", alignItems: "center", padding: 12 },
  cardAccent:      { width: 3, height: 36, borderRadius: 2, marginRight: 10 },
  cardMain:        { flex: 1 },
  cardEmpresa:     { fontSize: 14, fontWeight: "700", color: "#111827", marginBottom: 2 },
  cardSub:         { fontSize: 11, color: "#9CA3AF" },
  cardRight:       { flexDirection: "row", alignItems: "center", gap: 6 },
  tipoPill:        { borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3 },
  tipoPillTxt:     { fontSize: 9, fontWeight: "700", textTransform: "uppercase" },

  cardDetail:      { paddingHorizontal: 14, paddingBottom: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: "rgba(0,0,0,0.06)", gap: 7 },
  detailRow:       { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  detailTxt:       { fontSize: 12, color: "#6B7280", flex: 1, lineHeight: 17 },
  deleteBtn:       { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, alignSelf: "flex-start" },
  deleteBtnTxt:    { fontSize: 11, color: "#C25A5A", fontWeight: "600" },

  noResults:       { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  noResultsTxt:    { fontSize: 13, color: "#9CA3AF" },

  empty:           { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  emptyIcon:       { width: 80, height: 80, borderRadius: 40, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", marginBottom: 20, borderWidth: 1, borderColor: "rgba(0,0,0,0.08)" },
  emptyTitle:      { fontSize: 18, fontWeight: "800", color: "#111827", marginBottom: 8, textAlign: "center" },
  emptySub:        { fontSize: 13, color: "#6B7280", textAlign: "center", lineHeight: 19, marginBottom: 24 },
  emptyBtn:        { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#3D9A84", borderRadius: 14, paddingHorizontal: 22, paddingVertical: 13 },
  emptyBtnTxt:     { fontSize: 14, fontWeight: "800", color: "#FFFFFF" },
});
