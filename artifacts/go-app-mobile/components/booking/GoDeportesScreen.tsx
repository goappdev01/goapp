/**
 * GoDeportesScreen
 * Sports booking module — themed entry point to the GO reservas engine.
 * 34+ sport templates organized by category, each routing to GoBookingScreen.
 * Not a separate system: all reservas, horarios, aforos, pagos and planos
 * are handled by the existing booking engine.
 */
import React, { useRef } from "react";
import {
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoBreadcrumb } from "@/components/ui/GoBreadcrumb";

// ─── Visual tokens ────────────────────────────────────────────────────────────

const BG     = "#F7F8FA";
const CARD   = "#FFFFFF";
const BORDER = "rgba(0,0,0,0.07)";
const TEXT   = "#111827";
const GRAY   = "#6B7280";
const DIM    = "#9CA3AF";
const SPORT  = "#16A34A";

const { width: SW } = Dimensions.get("window");

// ─── Sport template definitions ──────────────────────────────────────────────

type SportDef = {
  id: string;
  emoji: string;
  name: string;
  desc: string;
  color: string;
};

type CategoryDef = {
  key: string;
  label: string;
  color: string;
  sports: SportDef[];
};

const SPORT_CATEGORIES: CategoryDef[] = [
  {
    key: "raqueta",
    label: "🎾 Raqueta",
    color: "#4A80BD",
    sports: [
      { id: "padel",       emoji: "🏓", name: "Pádel",       desc: "Pistas de pádel",        color: "#4A80BD" },
      { id: "tenis",       emoji: "🎾", name: "Tenis",       desc: "Pistas de tenis",         color: "#4A80BD" },
      { id: "pickleball",  emoji: "🏸", name: "Pickleball",  desc: "Pistas pickleball",       color: "#4A80BD" },
      { id: "badminton",   emoji: "🏸", name: "Bádminton",   desc: "Pistas bádminton",        color: "#4A80BD" },
      { id: "squash",      emoji: "🟡", name: "Squash",      desc: "Boxes de squash",         color: "#4A80BD" },
      { id: "ping_pong",   emoji: "🏓", name: "Ping Pong",   desc: "Mesas de ping pong",      color: "#4A80BD" },
    ],
  },
  {
    key: "futbol",
    label: "⚽ Fútbol",
    color: "#16A34A",
    sports: [
      { id: "futbol_sala", emoji: "⚽", name: "Fútbol sala", desc: "Cancha interior",          color: "#16A34A" },
      { id: "futbol_7",    emoji: "⚽", name: "Fútbol 7",    desc: "Campo reducido",           color: "#16A34A" },
      { id: "futbol_11",   emoji: "⚽", name: "Fútbol 11",   desc: "Campo reglamentario",      color: "#16A34A" },
    ],
  },
  {
    key: "colectivos",
    label: "🏀 Colectivos",
    color: "#7C69BE",
    sports: [
      { id: "baloncesto",    emoji: "🏀", name: "Baloncesto",            desc: "Cancha baloncesto",      color: "#7C69BE" },
      { id: "voleibol",      emoji: "🏐", name: "Voleibol",              desc: "Cancha voleibol",        color: "#7C69BE" },
      { id: "atletismo",     emoji: "🏃", name: "Atletismo",             desc: "Pista atletismo",        color: "#7C69BE" },
      { id: "polideportivo", emoji: "🏟️", name: "Cancha polideportiva",  desc: "Sala multiusos",         color: "#7C69BE" },
    ],
  },
  {
    key: "fitness",
    label: "💪 Fitness",
    color: "#F97316",
    sports: [
      { id: "gimnasio",    emoji: "🏋️", name: "Gimnasio",              desc: "Sala de musculación",        color: "#F97316" },
      { id: "crossfit",    emoji: "🔥", name: "Crossfit",              desc: "Box crossfit",               color: "#F97316" },
      { id: "yoga",        emoji: "🧘", name: "Yoga",                  desc: "Sala de yoga",               color: "#F97316" },
      { id: "pilates",     emoji: "🤸", name: "Pilates",               desc: "Estudio de pilates",         color: "#F97316" },
      { id: "ciclismo",    emoji: "🚴", name: "Ciclismo indoor",       desc: "Sala spinning",              color: "#F97316" },
      { id: "pt",          emoji: "🎯", name: "Entrenamiento personal", desc: "Puestos PT",                color: "#F97316" },
      { id: "sala_fitness",emoji: "🏃", name: "Sala fitness",          desc: "Cardio & pesas",             color: "#F97316" },
      { id: "funcional",   emoji: "⚡", name: "Func. Training",        desc: "Entrenamiento funcional",    color: "#F97316" },
    ],
  },
  {
    key: "acuatico_extremo",
    label: "🌊 Acuático & Extremo",
    color: "#0EA5E9",
    sports: [
      { id: "natacion",       emoji: "🏊", name: "Natación",        desc: "Carriles de piscina",   color: "#0EA5E9" },
      { id: "surf_indoor",    emoji: "🏄", name: "Surf indoor",     desc: "Ola artificial",        color: "#0EA5E9" },
      { id: "rocodomo",       emoji: "🧗", name: "Rocódromo",       desc: "Vías de escalada",      color: "#0EA5E9" },
      { id: "escalada",       emoji: "⛰️", name: "Escalada",        desc: "Bloques y vías",        color: "#0EA5E9" },
      { id: "skatepark",      emoji: "🛹", name: "Skatepark",       desc: "Pista y rampas",        color: "#0EA5E9" },
      { id: "patinaje",       emoji: "⛸️", name: "Patinaje",        desc: "Pista de patinaje",     color: "#0EA5E9" },
      { id: "boxeo",          emoji: "🥊", name: "Boxeo",           desc: "Sala de boxeo",         color: "#0EA5E9" },
      { id: "artes_marciales",emoji: "🥋", name: "Artes marciales", desc: "Tatami y sala",         color: "#0EA5E9" },
    ],
  },
  {
    key: "bienestar_otros",
    label: "💆 Bienestar & Otros",
    color: "#EC4899",
    sports: [
      { id: "spa",          emoji: "💆", name: "Spa",          desc: "Cabinas y piscina",      color: "#EC4899" },
      { id: "golf",         emoji: "⛳", name: "Golf",         desc: "Hoyos y driving range",  color: "#C4883A" },
      { id: "billar",       emoji: "🎱", name: "Billar",       desc: "Mesas de billar",        color: "#C4883A" },
      { id: "dardos",       emoji: "🎯", name: "Dardos",       desc: "Dianas y zonas",         color: "#C4883A" },
      { id: "sala_multiuso",emoji: "🏢", name: "Sala multiuso", desc: "Espacio polivalente",   color: "#C4883A" },
    ],
  },
];

// ─── Props ────────────────────────────────────────────────────────────────────

interface GoDeportesScreenProps {
  onClose: () => void;
  onOpenBooking: (id: string, label: string, emoji: string, color: string) => void;
  onOpenVerificacion?: () => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function GoDeportesScreen({ onClose, onOpenBooking, onOpenVerificacion }: GoDeportesScreenProps) {
  const insets    = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const handleSelectSport = (sport: SportDef) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onOpenBooking(sport.id, sport.name, sport.emoji, sport.color);
  };

  const handleCreateCustom = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onOpenBooking("deportes_custom", "Deporte personalizado", "➕", SPORT);
  };

  const scrollToTemplates = () => {
    Haptics.selectionAsync().catch(() => {});
    scrollRef.current?.scrollTo({ y: 300, animated: true });
  };

  const totalSports = SPORT_CATEGORIES.reduce((n, c) => n + c.sports.length, 0);

  return (
    <View style={g.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[g.content, { paddingBottom: insets.bottom + 40 }]}
      >

        {/* ── Breadcrumb ── */}
        <GoBreadcrumb crumbs={["Empresa", "Reservas", "Deportes"]} color="#15803d" />

        {/* ── Hero ── */}
        <View style={g.hero}>
          <View style={g.heroIconWrap}>
            <Text style={g.heroEmoji}>🏅</Text>
          </View>
          <Text style={g.heroTitle}>GO Deportes</Text>
          <Text style={g.heroSub}>Gestión deportiva para cualquier espacio</Text>
          <View style={g.heroBadge}>
            <Feather name="check-circle" size={11} color={SPORT} />
            <Text style={g.heroBadgeTxt}>Reservas · Horarios · Pagos · Planos incluidos</Text>
          </View>
        </View>

        {/* ── Action cards ── */}
        <View style={g.actionRow}>
          <TouchableOpacity
            style={[g.actionCard, { borderColor: SPORT + "44", backgroundColor: SPORT + "08" }]}
            activeOpacity={0.82}
            onPress={handleCreateCustom}
          >
            <View style={[g.actionIconBox, { backgroundColor: SPORT + "20" }]}>
              <Feather name="plus-circle" size={22} color={SPORT} />
            </View>
            <Text style={[g.actionTitle, { color: SPORT }]}>Crear espacio{"\n"}deportivo</Text>
            <Text style={g.actionSub}>Configura desde cero</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[g.actionCard, { borderColor: "#4A80BD44", backgroundColor: "#4A80BD08" }]}
            activeOpacity={0.82}
            onPress={scrollToTemplates}
          >
            <View style={[g.actionIconBox, { backgroundColor: "#4A80BD20" }]}>
              <Feather name="grid" size={22} color="#4A80BD" />
            </View>
            <Text style={[g.actionTitle, { color: "#4A80BD" }]}>Opciones{"\n"}deportivas</Text>
            <Text style={g.actionSub}>{totalSports}+ tipos de deporte</Text>
          </TouchableOpacity>
        </View>

        {/* ── Info strip ── */}
        <View style={g.infoStrip}>
          <Feather name="info" size={12} color={DIM} />
          <Text style={g.infoTxt}>
            Cada opción usa el motor de reservas GO. Sin duplicar sistemas: horarios, aforos, pagos y calendarios ya incluidos.
          </Text>
        </View>

        {/* ── Sport categories — square tile grid ── */}
        {SPORT_CATEGORIES.map(cat => {
          const rows: SportDef[][] = [];
          for (let i = 0; i < cat.sports.length; i += 2) {
            rows.push(cat.sports.slice(i, i + 2));
          }
          return (
            <View key={cat.key} style={g.category}>
              <Text style={g.catLabel}>{cat.label}</Text>
              {rows.map((row, ri) => (
                <View key={ri} style={g.tileRow}>
                  {row.map(sport => (
                    <TouchableOpacity
                      key={sport.id}
                      style={[g.tile, { borderColor: sport.color + "28" }]}
                      activeOpacity={0.78}
                      onPress={() => handleSelectSport(sport)}
                    >
                      <View style={[g.tileAccent, { backgroundColor: sport.color }]} />
                      <View style={[g.tileEmojiWrap, { backgroundColor: sport.color + "12" }]}>
                        <Text style={g.tileEmoji}>{sport.emoji}</Text>
                      </View>
                      <Text style={[g.tileLabel, { color: sport.color }]} numberOfLines={1}>
                        {sport.name}
                      </Text>
                      <Text style={g.tileDesc} numberOfLines={2}>
                        {sport.desc}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {row.length === 1 && <View style={g.tilePlaceholder} />}
                </View>
              ))}
            </View>
          );
        })}

        {/* ── OTRO DEPORTE — dashed custom card ── */}
        <View style={g.category}>
          <Text style={g.catLabel}>🔧 Personalizado</Text>
          <TouchableOpacity
            style={g.otroCard}
            activeOpacity={0.8}
            onPress={handleCreateCustom}
          >
            <View style={[g.otroEmojiBox, { backgroundColor: "#6B728014" }]}>
              <Text style={g.tileEmoji}>➕</Text>
            </View>
            <View style={g.otroInfo}>
              <Text style={[g.otroName, { color: GRAY }]}>OTRO DEPORTE</Text>
              <Text style={g.otroDesc}>Crea tu propio espacio personalizado</Text>
            </View>
            <Feather name="chevron-right" size={16} color={GRAY} />
          </TouchableOpacity>
        </View>

      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const g = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG,
  },

  content: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  // ── Hero ──
  hero: {
    alignItems: "center",
    paddingVertical: 24,
    marginBottom: 4,
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: SPORT + "14",
    borderWidth: 1.5,
    borderColor: SPORT + "30",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  heroEmoji: {
    fontSize: 36,
    lineHeight: 44,
  },
  heroTitle: {
    fontSize: 26,
    fontWeight: "900",
    color: TEXT,
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  heroSub: {
    fontSize: 14,
    color: GRAY,
    textAlign: "center",
    marginBottom: 12,
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: SPORT + "0C",
    borderWidth: 1,
    borderColor: SPORT + "28",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  heroBadgeTxt: {
    fontSize: 11,
    color: SPORT,
    fontWeight: "600",
  },

  // ── Action cards ──
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  actionCard: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    alignItems: "center",
    gap: 8,
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  actionIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: "center",
    justifyContent: "center",
  },
  actionTitle: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    lineHeight: 18,
  },
  actionSub: {
    fontSize: 11,
    color: DIM,
    textAlign: "center",
  },

  // ── Info strip ──
  infoStrip: {
    flexDirection: "row",
    gap: 7,
    backgroundColor: "#F0F4FF",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#C7D8F0",
    padding: 10,
    marginBottom: 20,
    alignItems: "flex-start",
  },
  infoTxt: {
    flex: 1,
    fontSize: 11,
    color: "#4A6B8A",
    lineHeight: 16,
  },

  // ── Category ──
  category: {
    marginBottom: 20,
  },
  catLabel: {
    fontSize: 12,
    fontWeight: "800",
    color: GRAY,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginBottom: 10,
  },

  // ── Square tile grid ──
  tileRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  tile: {
    flex: 1,
    backgroundColor: CARD,
    borderRadius: 20,
    borderWidth: 1.5,
    overflow: "hidden",
    alignItems: "center",
    paddingBottom: 14,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tilePlaceholder: { flex: 1 },
  tileAccent: {
    width: "100%",
    height: 4,
    marginBottom: 14,
  },
  tileEmojiWrap: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileEmoji: {
    fontSize: 26,
  },
  tileLabel: {
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    paddingHorizontal: 8,
    marginBottom: 4,
  },
  tileDesc: {
    fontSize: 10,
    fontWeight: "500",
    color: DIM,
    textAlign: "center",
    paddingHorizontal: 10,
    lineHeight: 14,
  },

  // ── OTRO DEPORTE dashed card ──
  otroCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: CARD,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.10)",
    borderStyle: "dashed",
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  otroEmojiBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  otroInfo: {
    flex: 1,
    gap: 2,
  },
  otroName: {
    fontSize: 14,
    fontWeight: "700",
  },
  otroDesc: {
    fontSize: 12,
    color: DIM,
  },
});
