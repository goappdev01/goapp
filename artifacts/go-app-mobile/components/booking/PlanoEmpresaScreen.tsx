import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Keyboard,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { GestureDetector, Gesture } from "react-native-gesture-handler";
import { DraggableFAB } from "../DraggableFAB";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDecay,
  withTiming,
} from "react-native-reanimated";
import { Feather, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GoTimeField } from "@/components/ui/GoTimePicker";
import { formatISODate, getToday, WEEKDAY_LETTERS_ES } from "@/lib/time";
import {
  FloorElement,
  FloorElementStatus,
  FloorElementType,
  FloorPlan,
  FloorReservation,
  STATUS_COLORS,
  STATUS_LABELS,
  ELEMENT_DEFAULTS,
  ELEMENT_ICONS,
  ELEMENT_LABELS,
  loadFloorPlan,
  saveFloorPlan,
  loadReservations,
  saveReservations,
  makeFloorId,
  makeElementId,
  makeReservationId,
} from "@/data/floorPlan";
import { useBusinessConfig } from "@/contexts/GoBusinessConfigContext";
import { type PlantillaItem } from "@/data/goSectorData";
import { getBusinessIcon } from "@/lib/businessIcons";

// ── Native-only gesture helper ─────────────────────────────────────────────────
// blocksExternalGestureHandlers() is unavailable on web — guard it safely.
function blockExternal<T>(g: T): T {
  if (typeof (g as any).blocksExternalGestureHandlers === "function") {
    return (g as any).blocksExternalGestureHandlers() as T;
  }
  return g;
}

// ── Visual tokens ──────────────────────────────────────────────────────────────

const BG       = "#F7F8FA";
const CARD     = "#FFFFFF";
const BORDER   = "rgba(0,0,0,0.09)";
const TEXT     = "#111827";
const GRAY     = "#6B7280";
const DIM      = "#9CA3AF";
const ACCENT   = "#4A80BD";
const DANGER   = "#EF4444";
const GRID_COL = "rgba(74,128,189,0.10)";

const { width: SW, height: SH } = Dimensions.get("window");

const CANVAS_W  = 900;
const CANVAS_H  = 1200;
const MIN_SCALE = 0.28;
const MAX_SCALE = 2.5;
const MIN_EL_W  = 40;
const MIN_EL_H  = 40;

// ── Helpers ────────────────────────────────────────────────────────────────────

// "mesa" keeps the full circle. "silla" (profesionales) usa cápsula adaptativa.
const isCircle = (type: FloorElementType) => type === "mesa";
const isPill   = (type: FloorElementType) => type === "silla";
const isDashed = (type: FloorElementType) => type === "zona";

const elementTypeItems: Array<{ type: FloorElementType; icon: string; label: string; color: string }> = [
  { type: "mesa",       icon: "utensils", label: "Mesa",        color: "#3D9A84" },
  { type: "habitacion", icon: "home",     label: "Habitación",  color: "#4A80BD" },
  { type: "sala",       icon: "grid",     label: "Sala",        color: "#7C69BE" },
  { type: "plaza",      icon: "square",   label: "Plaza",       color: "#C4883A" },
  { type: "zona",       icon: "map",      label: "Zona",        color: "#64748B" },
  { type: "silla",      icon: "user",     label: "Silla",       color: "#C25A5A" },
  { type: "custom",     icon: "star",     label: "Otro",        color: "#9CA3AF" },
];

// ── Business templates ─────────────────────────────────────────────────────────

type TemplateKind = "resource" | "human" | "hybrid";

interface BusinessTemplate {
  id: string;
  emoji: string;
  name: string;
  summary: string;
  kind: TemplateKind;
  color: string;
  elements: Omit<FloorElement, "id">[];
}

// ── Template layout note ────────────────────────────────────────────────────────
// All coordinates use 12 px gaps starting at (10,10) so that fitToElements
// zooms in tightly and elements fill ~85 % of the viewport on first load.
// Large gaps (the old 60 px style) produced tiny-element bounding boxes that
// forced a very low zoom factor — this compact layout inverts that behaviour.

const BUSINESS_TEMPLATES: BusinessTemplate[] = [
  {
    id: "restaurante", emoji: "🍽️", name: "Restaurante",
    summary: "7 mesas + barra + terraza",
    kind: "resource", color: "#E07B4F",
    elements: [
      // row 1 — 3 mesas + VIP (right)
      { type: "mesa", label: "Mesa 1", x: 10,  y: 10,  width: 80, height: 80, capacity: 4,  status: "disponible", reservable: true },
      { type: "mesa", label: "Mesa 2", x: 102, y: 10,  width: 80, height: 80, capacity: 4,  status: "disponible", reservable: true },
      { type: "mesa", label: "Mesa 3", x: 194, y: 10,  width: 80, height: 80, capacity: 4,  status: "disponible", reservable: true },
      { type: "mesa", label: "VIP",    x: 286, y: 10,  width: 120, height: 120, capacity: 8, status: "disponible", reservable: true },
      // row 2 — 3 mesas below row 1
      { type: "mesa", label: "Mesa 4", x: 10,  y: 102, width: 80, height: 80, capacity: 4,  status: "disponible", reservable: true },
      { type: "mesa", label: "Mesa 5", x: 102, y: 102, width: 80, height: 80, capacity: 4,  status: "disponible", reservable: true },
      { type: "mesa", label: "Mesa 6", x: 194, y: 102, width: 80, height: 80, capacity: 4,  status: "disponible", reservable: true },
      // ground floor strips
      { type: "zona", label: "Barra",   x: 10, y: 206, width: 396, height: 50, capacity: 8,  status: "disponible", reservable: true },
      { type: "zona", label: "Terraza", x: 10, y: 268, width: 396, height: 90, capacity: 16, status: "disponible", reservable: true },
    ],
  },
  {
    id: "peluqueria", emoji: "💈", name: "Peluquería",
    summary: "4 puestos + 2 lavabos",
    kind: "human", color: "#7C69BE",
    elements: [
      { type: "silla", label: "Puesto 1", x: 10,  y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "silla", label: "Puesto 2", x: 102, y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "silla", label: "Puesto 3", x: 194, y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "silla", label: "Puesto 4", x: 286, y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "sala",  label: "Lavado 1", x: 10,  y: 102, width: 110, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "sala",  label: "Lavado 2", x: 132, y: 102, width: 110, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "zona",  label: "Recepción", x: 10, y: 194, width: 356, height: 60, capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "unas", emoji: "💅", name: "Uñas / Belleza",
    summary: "3 mesas manicura + 2 camillas",
    kind: "human", color: "#E8629A",
    elements: [
      { type: "mesa", label: "Manicura 1", x: 10,  y: 10,  width: 100, height: 70, capacity: 1, status: "disponible", reservable: true },
      { type: "mesa", label: "Manicura 2", x: 122, y: 10,  width: 100, height: 70, capacity: 1, status: "disponible", reservable: true },
      { type: "mesa", label: "Manicura 3", x: 234, y: 10,  width: 100, height: 70, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Camilla 1",  x: 10,  y: 92,  width: 120, height: 70, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Camilla 2",  x: 142, y: 92,  width: 120, height: 70, capacity: 1, status: "disponible", reservable: true },
      { type: "zona", label: "Recepción",  x: 10,  y: 174, width: 324, height: 60, capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "spa", emoji: "💆", name: "Masajes / Spa",
    summary: "3 cabinas + 2 camillas",
    kind: "hybrid", color: "#3D9A84",
    elements: [
      { type: "habitacion", label: "Cabina 1", x: 10,  y: 10,  width: 120, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "habitacion", label: "Cabina 2", x: 142, y: 10,  width: 120, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "habitacion", label: "Cabina 3", x: 274, y: 10,  width: 120, height: 100, capacity: 2, status: "disponible", reservable: true },
      { type: "sala",       label: "Camilla A", x: 10,  y: 122, width: 130, height: 80,  capacity: 1, status: "disponible", reservable: true },
      { type: "sala",       label: "Camilla B", x: 152, y: 122, width: 130, height: 80,  capacity: 1, status: "disponible", reservable: true },
      { type: "zona",       label: "Recepción", x: 10,  y: 214, width: 384, height: 60,  capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "hotel", emoji: "🏨", name: "Hotel",
    summary: "5 habitaciones + 1 suite",
    kind: "resource", color: "#4A80BD",
    elements: [
      { type: "habitacion", label: "Hab. 101", x: 10,  y: 10,  width: 110, height: 90, capacity: 2, status: "disponible", reservable: true },
      { type: "habitacion", label: "Hab. 102", x: 132, y: 10,  width: 110, height: 90, capacity: 2, status: "disponible", reservable: true },
      { type: "habitacion", label: "Hab. 103", x: 254, y: 10,  width: 110, height: 90, capacity: 2, status: "disponible", reservable: true },
      { type: "habitacion", label: "Hab. 201", x: 10,  y: 112, width: 110, height: 90, capacity: 2, status: "disponible", reservable: true },
      { type: "habitacion", label: "Hab. 202", x: 132, y: 112, width: 110, height: 90, capacity: 2, status: "disponible", reservable: true },
      { type: "habitacion", label: "Suite",    x: 254, y: 112, width: 160, height: 120, capacity: 4, status: "disponible", reservable: true },
      { type: "zona",       label: "Recepción", x: 10, y: 244, width: 404, height: 60,  capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "dentista", emoji: "🦷", name: "Dentista",
    summary: "4 boxes dentales",
    kind: "human", color: "#5AAFCF",
    elements: [
      { type: "sala", label: "Box 1", x: 10,  y: 10,  width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Box 2", x: 152, y: 10,  width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Box 3", x: 10,  y: 122, width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Box 4", x: 152, y: 122, width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "zona", label: "Recepción / Espera", x: 10, y: 234, width: 272, height: 60, capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "clinica", emoji: "🏥", name: "Clínica",
    summary: "3 consultas médicas",
    kind: "human", color: "#E05A5A",
    elements: [
      { type: "sala", label: "Consulta 1",  x: 10,  y: 10,  width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Consulta 2",  x: 152, y: 10,  width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Consulta 3",  x: 294, y: 10,  width: 130, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Sala espera", x: 10,  y: 122, width: 200, height: 100, capacity: 8, status: "disponible", reservable: false },
      { type: "zona", label: "Recepción",   x: 10,  y: 234, width: 414, height: 60,  capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "dietista", emoji: "🥗", name: "Dietista",
    summary: "2 despachos + sala de consultas",
    kind: "human", color: "#5AAF7A",
    elements: [
      { type: "sala", label: "Despacho 1",   x: 10,  y: 10,  width: 140, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Despacho 2",   x: 162, y: 10,  width: 140, height: 100, capacity: 1, status: "disponible", reservable: true },
      { type: "sala", label: "Sala consult.", x: 10,  y: 122, width: 200, height: 100, capacity: 4, status: "disponible", reservable: true },
      { type: "zona", label: "Recepción",    x: 10,  y: 234, width: 292, height: 60,  capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "gimnasio", emoji: "🏋️", name: "Gimnasio",
    summary: "2 pistas + 2 salas + entrenador",
    kind: "hybrid", color: "#C4883A",
    elements: [
      { type: "plaza", label: "Pista 1",     x: 10,  y: 10,  width: 180, height: 130, capacity: 10, status: "disponible", reservable: true },
      { type: "plaza", label: "Pista 2",     x: 202, y: 10,  width: 180, height: 130, capacity: 10, status: "disponible", reservable: true },
      { type: "sala",  label: "Sala yoga",   x: 10,  y: 152, width: 150, height: 100, capacity: 15, status: "disponible", reservable: true },
      { type: "sala",  label: "Sala cardio", x: 172, y: 152, width: 150, height: 100, capacity: 20, status: "disponible", reservable: true },
      { type: "silla", label: "Entrenador",  x: 334, y: 152, width: 80,  height: 80,  capacity: 1,  status: "disponible", reservable: true },
      { type: "zona",  label: "Recepción",   x: 10,  y: 264, width: 404, height: 60,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },

  // ── Deportes ────────────────────────────────────────────────────────────────

  {
    id: "padel", emoji: "🏓", name: "Pádel",
    summary: "2 pistas de pádel + vestuarios",
    kind: "resource", color: "#4A80BD",
    elements: [
      { type: "plaza", label: "Pista 1",       x: 10,  y: 10,  width: 190, height: 150, capacity: 4,  status: "disponible", reservable: true },
      { type: "plaza", label: "Pista 2",       x: 212, y: 10,  width: 190, height: 150, capacity: 4,  status: "disponible", reservable: true },
      { type: "sala",  label: "Vestuario M",   x: 10,  y: 172, width: 120, height: 80,  capacity: 8,  status: "disponible", reservable: false },
      { type: "sala",  label: "Vestuario F",   x: 142, y: 172, width: 120, height: 80,  capacity: 8,  status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción",     x: 10,  y: 264, width: 392, height: 60,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "tenis", emoji: "🎾", name: "Tenis",
    summary: "2 pistas de tenis + vestuarios",
    kind: "resource", color: "#4A80BD",
    elements: [
      { type: "plaza", label: "Pista 1",       x: 10,  y: 10,  width: 200, height: 160, capacity: 4,  status: "disponible", reservable: true },
      { type: "plaza", label: "Pista 2",       x: 222, y: 10,  width: 200, height: 160, capacity: 4,  status: "disponible", reservable: true },
      { type: "sala",  label: "Vestuario M",   x: 10,  y: 182, width: 130, height: 80,  capacity: 8,  status: "disponible", reservable: false },
      { type: "sala",  label: "Vestuario F",   x: 152, y: 182, width: 130, height: 80,  capacity: 8,  status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción",     x: 10,  y: 274, width: 272, height: 60,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "futbol_sala", emoji: "⚽", name: "Fútbol sala",
    summary: "Cancha + banquillos + vestuarios",
    kind: "resource", color: "#16A34A",
    elements: [
      { type: "plaza", label: "Cancha",           x: 10,  y: 10,  width: 380, height: 220, capacity: 12, status: "disponible", reservable: true },
      { type: "zona",  label: "Banquillo Local",  x: 10,  y: 242, width: 120, height: 50,  capacity: 10, status: "disponible", reservable: false },
      { type: "zona",  label: "Banquillo Visit.", x: 142, y: 242, width: 120, height: 50,  capacity: 10, status: "disponible", reservable: false },
      { type: "sala",  label: "Vestuarios",       x: 274, y: 242, width: 116, height: 50,  capacity: 16, status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción",        x: 10,  y: 304, width: 380, height: 55,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "baloncesto", emoji: "🏀", name: "Baloncesto",
    summary: "Cancha + banquillos + recepción",
    kind: "resource", color: "#7C69BE",
    elements: [
      { type: "plaza", label: "Cancha",           x: 10,  y: 10,  width: 360, height: 200, capacity: 10, status: "disponible", reservable: true },
      { type: "zona",  label: "Banquillo A",      x: 10,  y: 222, width: 110, height: 55,  capacity: 10, status: "disponible", reservable: false },
      { type: "zona",  label: "Banquillo B",      x: 132, y: 222, width: 110, height: 55,  capacity: 10, status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción",        x: 254, y: 222, width: 116, height: 55,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "natacion", emoji: "🏊", name: "Natación / Piscina",
    summary: "4 carriles + zona spa + recepción",
    kind: "resource", color: "#0EA5E9",
    elements: [
      { type: "plaza", label: "Carril 1",   x: 10,  y: 10,  width: 80, height: 200, capacity: 1, status: "disponible", reservable: true },
      { type: "plaza", label: "Carril 2",   x: 102, y: 10,  width: 80, height: 200, capacity: 1, status: "disponible", reservable: true },
      { type: "plaza", label: "Carril 3",   x: 194, y: 10,  width: 80, height: 200, capacity: 1, status: "disponible", reservable: true },
      { type: "plaza", label: "Carril 4",   x: 286, y: 10,  width: 80, height: 200, capacity: 1, status: "disponible", reservable: true },
      { type: "zona",  label: "Zona spa",   x: 10,  y: 222, width: 160, height: 80,  capacity: 6, status: "disponible", reservable: true },
      { type: "zona",  label: "Recepción",  x: 182, y: 222, width: 184, height: 80,  capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "boxeo", emoji: "🥊", name: "Boxeo / Artes marciales",
    summary: "Ring + zona sacos + tatami",
    kind: "resource", color: "#0EA5E9",
    elements: [
      { type: "plaza", label: "Ring",          x: 10,  y: 10,  width: 180, height: 180, capacity: 2,  status: "disponible", reservable: true },
      { type: "zona",  label: "Zona sacos",    x: 202, y: 10,  width: 180, height: 88,  capacity: 6,  status: "disponible", reservable: true },
      { type: "plaza", label: "Tatami",        x: 202, y: 110, width: 180, height: 80,  capacity: 8,  status: "disponible", reservable: true },
      { type: "sala",  label: "Vestuarios",    x: 10,  y: 202, width: 160, height: 80,  capacity: 10, status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción",     x: 182, y: 202, width: 200, height: 80,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "yoga_pilates", emoji: "🧘", name: "Yoga / Pilates",
    summary: "Sala principal + sala pequeña + vestuarios",
    kind: "hybrid", color: "#F97316",
    elements: [
      { type: "sala",  label: "Sala principal", x: 10,  y: 10,  width: 240, height: 160, capacity: 20, status: "disponible", reservable: true },
      { type: "sala",  label: "Sala pequeña",   x: 262, y: 10,  width: 140, height: 160, capacity: 10, status: "disponible", reservable: true },
      { type: "sala",  label: "Vestuarios",     x: 10,  y: 182, width: 160, height: 80,  capacity: 12, status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción",      x: 182, y: 182, width: 220, height: 80,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "crossfit", emoji: "🔥", name: "Crossfit / Funcional",
    summary: "Zona WOD + barras + cardio + vestuarios",
    kind: "resource", color: "#F97316",
    elements: [
      { type: "plaza", label: "Zona WOD",     x: 10,  y: 10,  width: 360, height: 160, capacity: 20, status: "disponible", reservable: true },
      { type: "zona",  label: "Zona barras",  x: 10,  y: 182, width: 160, height: 100, capacity: 8,  status: "disponible", reservable: true },
      { type: "zona",  label: "Zona cardio",  x: 182, y: 182, width: 188, height: 100, capacity: 10, status: "disponible", reservable: true },
      { type: "zona",  label: "Recepción",    x: 10,  y: 294, width: 360, height: 55,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },
  {
    id: "squash", emoji: "🟡", name: "Squash / Bádminton",
    summary: "3 boxes de squash + recepción",
    kind: "resource", color: "#4A80BD",
    elements: [
      { type: "plaza", label: "Box 1",     x: 10,  y: 10,  width: 120, height: 130, capacity: 2, status: "disponible", reservable: true },
      { type: "plaza", label: "Box 2",     x: 142, y: 10,  width: 120, height: 130, capacity: 2, status: "disponible", reservable: true },
      { type: "plaza", label: "Box 3",     x: 274, y: 10,  width: 120, height: 130, capacity: 2, status: "disponible", reservable: true },
      { type: "sala",  label: "Vestuario", x: 10,  y: 152, width: 160, height: 80,  capacity: 8, status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción", x: 182, y: 152, width: 212, height: 80,  capacity: 0, status: "disponible", reservable: false },
    ],
  },
  {
    id: "polideportivo", emoji: "🏟️", name: "Cancha polideportiva",
    summary: "Cancha + 2 salas + recepción",
    kind: "resource", color: "#7C69BE",
    elements: [
      { type: "plaza", label: "Cancha principal", x: 10,  y: 10,  width: 380, height: 200, capacity: 20, status: "disponible", reservable: true },
      { type: "sala",  label: "Sala A",           x: 10,  y: 222, width: 160, height: 90,  capacity: 15, status: "disponible", reservable: true },
      { type: "sala",  label: "Sala B",           x: 182, y: 222, width: 160, height: 90,  capacity: 15, status: "disponible", reservable: true },
      { type: "zona",  label: "Recepción",        x: 10,  y: 324, width: 380, height: 55,  capacity: 0,  status: "disponible", reservable: false },
    ],
  },

  // ── (fin deportes) ───────────────────────────────────────────────────────────

  {
    id: "barberia", emoji: "💈", name: "Barbería",
    summary: "3 sillas de barbero + espera",
    kind: "human", color: "#8B6240",
    elements: [
      { type: "silla", label: "Barbero 1", x: 10,  y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "silla", label: "Barbero 2", x: 102, y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "silla", label: "Barbero 3", x: 194, y: 10,  width: 80, height: 80, capacity: 1, status: "disponible", reservable: true },
      { type: "sala",  label: "Espera",    x: 10,  y: 102, width: 160, height: 80, capacity: 6, status: "disponible", reservable: false },
      { type: "zona",  label: "Recepción", x: 10,  y: 194, width: 264, height: 60, capacity: 0, status: "disponible", reservable: false },
    ],
  },
];

// ── Mapa booking-template-id → plano-template-id ────────────────────────────
// Permite que al abrir el Plano desde una actividad concreta (ej. "masajes")
// se cargue automáticamente el plano más apropiado (ej. "spa").
const BOOKING_TO_PLANO_ID: Record<string, string> = {
  // Belleza
  peluqueria: "peluqueria",
  unas: "unas",
  masajes: "spa",
  estetica: "unas",
  barberia: "barberia",
  spa: "spa",
  maquillaje: "unas",
  // Restauración
  restaurante: "restaurante",
  cafeteria: "restaurante",
  bar: "restaurante",
  terraza: "restaurante",
  comida_rapida: "restaurante",
  confiteria: "restaurante",
  heladeria: "restaurante",
  // Salud
  clinica: "clinica",
  psicologo: "clinica",
  fisioterapia: "clinica",
  dentista: "dentista",
  medico: "clinica",
  nutricionista: "dietista",
  optometria: "clinica",
  // Hoteles & Alojamientos
  hotel: "hotel",
  apartamento: "hotel",
  casa_rural: "hotel",
  hostal: "hotel",
  // Deportes
  padel: "padel",
  tenis: "tenis",
  pickleball: "squash",
  badminton: "squash",
  squash: "squash",
  ping_pong: "squash",
  futbol_sala: "futbol_sala",
  futbol_7: "futbol_sala",
  futbol_11: "futbol_sala",
  baloncesto: "baloncesto",
  voleibol: "baloncesto",
  atletismo: "polideportivo",
  polideportivo: "polideportivo",
  gimnasio: "gimnasio",
  crossfit: "crossfit",
  yoga: "yoga_pilates",
  pilates: "yoga_pilates",
  ciclismo: "gimnasio",
  pt: "gimnasio",
  sala_fitness: "gimnasio",
  funcional: "crossfit",
  natacion: "natacion",
  surf_indoor: "natacion",
  rocodomo: "gimnasio",
  escalada: "gimnasio",
  skatepark: "polideportivo",
  patinaje: "polideportivo",
  boxeo: "boxeo",
  artes_marciales: "boxeo",
  golf: "polideportivo",
  billar: "polideportivo",
  dardos: "polideportivo",
  sala_multiuso: "polideportivo",
  // Servicios
  taller: "gimnasio",
  consultoria: "clinica",
  academia: "clinica",
  sala_reuniones: "clinica",
  fotografia: "clinica",
  coworking: "clinica",
};

// ── Adaptive floor plan: build elements from real user-configured spaces ──────
// Priority over hardcoded BUSINESS_TEMPLATES. Maps each PlantillaItem (label +
// count) to count floor elements, choosing element type from the sector.

const SECTOR_TO_FLOOR_TYPE: Record<string, FloorElementType> = {
  belleza:      "silla",
  restauracion: "mesa",
  deportes:     "plaza",
  salud:        "sala",
  hoteles:      "habitacion",
  servicios:    "sala",
  hogar:        "custom",
  actividades:  "plaza",
};

// Calcula el ancho mínimo de una cápsula para que el texto quede con margen.
// ~9 px por carácter + 28 px de padding horizontal, mínimo 72 px.
function pillWidthForLabel(label: string): number {
  return Math.max(72, label.length * 9 + 28);
}

function buildElementsFromPlantilla(
  items: PlantillaItem[],
  sectorId?: string | null
): FloorElement[] {
  const elType: FloorElementType =
    (sectorId && SECTOR_TO_FLOOR_TYPE[sectorId]) ? SECTOR_TO_FLOOR_TYPE[sectorId] : "custom";
  const defs        = ELEMENT_DEFAULTS[elType];
  const isPillType  = isPill(elType);
  const GAP         = 12;
  const MAX_ROW_W   = 380;

  // ── Tamaño uniforme para cápsulas ──────────────────────────────────────────
  // El nombre más largo de TODOS los elementos del plano define el ancho global.
  // Así todos los elementos quedan alineados visualmente.
  let uniformPillW = defs.width ?? 80;
  if (isPillType) {
    for (const item of items) {
      if (item.count <= 0) continue;
      for (let i = 0; i < item.count; i++) {
        const staffName = item.staffNames?.[i]?.trim();
        const slotEmoji = item.staffEmojis?.[i] ?? item.emoji;
        const label = staffName
          ? staffName
          : item.count > 1 ? `${slotEmoji} ${i + 1}` : slotEmoji;
        uniformPillW = Math.max(uniformPillW, pillWidthForLabel(label));
      }
    }
  }

  const elW   = isPillType ? uniformPillW : (defs.width  ?? 80);
  const baseH = isPillType ? 52           : (defs.height ?? 80);

  const elements: FloorElement[] = [];
  let curX = 10;
  let curY = 10;
  let firstGroup = true;

  for (const item of items) {
    if (item.count <= 0) continue;
    if (!firstGroup) {
      curX = 10;
      curY += baseH + GAP;
    }
    firstGroup = false;

    for (let i = 0; i < item.count; i++) {
      if (i > 0 && curX + elW > MAX_ROW_W + 10) {
        curX = 10;
        curY += baseH + GAP;
      }

      const staffName = item.staffNames?.[i]?.trim();
      const slotEmoji = item.staffEmojis?.[i] ?? item.emoji;
      const label = staffName
        ? staffName
        : item.count > 1 ? `${slotEmoji} ${i + 1}` : slotEmoji;

      elements.push({
        id: makeElementId(),
        type: elType,
        label,
        capacity: defs.capacity ?? 1,
        x: curX,
        y: curY,
        width:  elW,
        height: baseH,
        status:    "disponible",
        reservable: true,
      });
      curX += elW + GAP;
    }
  }

  return elements;
}

const statusOptions: FloorElementStatus[] = [
  "disponible", "reservado", "ocupado", "bloqueado", "mantenimiento", "pendiente",
];

function countByType(elements: FloorElement[], type: FloorElementType) {
  return elements.filter(e => e.type === type).length + 1;
}

// ── Grid background — adapts to the live canvas dimensions ────────────────────

function GridBackground({ w, h }: { w: number; h: number }) {
  const cols = Math.ceil(w / 60);
  const rows = Math.ceil(h / 60);
  return (
    <View style={{ position: "absolute", width: w, height: h }} pointerEvents="none">
      {Array.from({ length: cols + 1 }).map((_, i) => (
        <View key={`c${i}`} style={{ position: "absolute", left: i * 60, top: 0, width: 1, height: h, backgroundColor: GRID_COL }} />
      ))}
      {Array.from({ length: rows + 1 }).map((_, i) => (
        <View key={`r${i}`} style={{ position: "absolute", top: i * 60, left: 0, height: 1, width: w, backgroundColor: GRID_COL }} />
      ))}
    </View>
  );
}

// ── Floor element view ─────────────────────────────────────────────────────────

interface FloorElementViewProps {
  el: FloorElement;
  selected: boolean;
  isEditorMode: boolean;
  canvasScale: import("react-native-reanimated").SharedValue<number>;
  canvasMaxW: import("react-native-reanimated").SharedValue<number>;
  canvasMaxH: import("react-native-reanimated").SharedValue<number>;
  onSelect: (id: string) => void;
  onDoubleTap: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
  onResizeEnd: (id: string, w: number, h: number) => void;
  businessIcon?: string;
}

function FloorElementView({
  el, selected, isEditorMode, canvasScale, canvasMaxW, canvasMaxH,
  onSelect, onDoubleTap, onDragEnd, onResizeEnd, businessIcon,
}: FloorElementViewProps) {
  const posX      = useSharedValue(el.x);
  const posY      = useSharedValue(el.y);
  const elW       = useSharedValue(el.width);
  const elH       = useSharedValue(el.height);
  const isDragging   = useSharedValue(false);
  const isResizing   = useSharedValue(false);
  const startX    = useSharedValue(el.x);
  const startY    = useSharedValue(el.y);
  const startW    = useSharedValue(el.width);
  const startH    = useSharedValue(el.height);

  // Sync from props when not actively interacting
  useEffect(() => {
    if (!isDragging.value) {
      posX.value = el.x;
      posY.value = el.y;
    }
  }, [el.x, el.y]);

  useEffect(() => {
    if (!isResizing.value) {
      elW.value = el.width;
      elH.value = el.height;
    }
  }, [el.width, el.height]);

  // Double-tap detection in JS
  const tapTimer   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stableSelect     = useCallback((id: string) => onSelect(id), [onSelect]);
  const stableDoubleTap  = useCallback((id: string) => onDoubleTap(id), [onDoubleTap]);
  const stableDragEnd    = useCallback((id: string, x: number, y: number) => onDragEnd(id, x, y), [onDragEnd]);
  const stableResizeEnd  = useCallback((id: string, w: number, h: number) => onResizeEnd(id, w, h), [onResizeEnd]);

  const handleTap = useCallback(() => {
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      if (isEditorMode) stableDoubleTap(el.id);
    } else {
      tapTimer.current = setTimeout(() => {
        tapTimer.current = null;
        stableSelect(el.id);
      }, 280);
    }
  }, [isEditorMode, el.id, stableSelect, stableDoubleTap]);

  // Drag gesture (long press to start in editor, immediate in client)
  const panGesture = useMemo(() =>
    blockExternal(
      Gesture.Pan()
        .enabled(isEditorMode)
        .activateAfterLongPress(280)
    )
      .onStart(() => {
        "worklet";
        isDragging.value = true;
        startX.value = posX.value;
        startY.value = posY.value;
        runOnJS(Haptics.selectionAsync)();
      })
      .onUpdate((e) => {
        "worklet";
        const s = canvasScale.value;
        // No upper-bound clamp — the canvas expands automatically when the element
        // is placed beyond the current boundary (canvasDims recomputes on drag end).
        // Only prevent dragging into negative coordinates.
        const nx = Math.max(0, startX.value + e.translationX / s);
        const ny = Math.max(0, startY.value + e.translationY / s);
        posX.value = nx;
        posY.value = ny;
      })
      .onEnd(() => {
        "worklet";
        isDragging.value = false;
        runOnJS(stableDragEnd)(el.id, posX.value, posY.value);
        runOnJS(Haptics.impactAsync)(Haptics.ImpactFeedbackStyle.Light);
      })
      .onFinalize(() => {
        "worklet";
        isDragging.value = false;
      }),
  [isEditorMode, el.id, canvasScale, canvasMaxW, canvasMaxH, stableDragEnd]);

  // Tap gesture
  const tapGesture = useMemo(() =>
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((_, success) => {
        if (success) handleTap();
      }),
  [handleTap]);

  // Combined element gesture: drag wins over tap
  const elementGesture = useMemo(() =>
    Gesture.Exclusive(panGesture, tapGesture),
  [panGesture, tapGesture]);

  // Resize gesture (on corner handle, editor only)
  const resizeGesture = useMemo(() =>
    blockExternal(
      Gesture.Pan()
        .enabled(isEditorMode && selected)
    )
      .onStart(() => {
        "worklet";
        isResizing.value = true;
        startW.value = elW.value;
        startH.value = elH.value;
        runOnJS(Haptics.selectionAsync)();
      })
      .onUpdate((e) => {
        "worklet";
        const s = canvasScale.value;
        elW.value = Math.max(MIN_EL_W, startW.value + e.translationX / s);
        elH.value = Math.max(MIN_EL_H, startH.value + e.translationY / s);
      })
      .onEnd(() => {
        "worklet";
        isResizing.value = false;
        runOnJS(stableResizeEnd)(el.id, elW.value, elH.value);
      })
      .onFinalize(() => {
        "worklet";
        isResizing.value = false;
      }),
  [isEditorMode, selected, el.id, canvasScale, stableResizeEnd]);

  // Animated styles
  const containerStyle = useAnimatedStyle(() => ({
    position: "absolute",
    left: posX.value,
    top: posY.value,
    width: elW.value,
    height: elH.value,
  }));

  const statusColor = STATUS_COLORS[el.status];
  const circle  = isCircle(el.type);
  const pill    = isPill(el.type);
  const dashed  = isDashed(el.type);

  // Cápsula: radio = la mitad del lado más corto → forma de pastilla
  const pillRadius = Math.min(el.width, el.height) / 2;
  const borderRad  = circle ? el.width / 2 : pill ? pillRadius : 10;

  // Iconos: los elementos cápsula (profesionales) muestran sólo el nombre
  const showIcon  = !pill;
  const iconSz    = Math.min(el.width, el.height) * 0.28;
  // Para cápsulas: texto un poco más grande y ajustado al ancho
  const labelSz   = pill
    ? Math.max(10, Math.min(el.width * 0.16, 15))
    : Math.max(7, Math.min(el.width, el.height) * 0.155);

  return (
    <GestureDetector gesture={elementGesture}>
      <Animated.View
        style={[
          containerStyle,
          {
            borderRadius:      borderRad,
            backgroundColor:   selected ? statusColor + "44" : statusColor + "28",
            borderWidth:       selected ? 2.5 : 1.5,
            borderStyle:       dashed ? "dashed" : "solid",
            borderColor:       selected ? statusColor : statusColor + "99",
            alignItems:        "center",
            justifyContent:    "center",
            shadowColor:       statusColor,
            shadowOpacity:     selected ? 0.5 : 0.22,
            shadowRadius:      selected ? 10 : 5,
            shadowOffset:      { width: 0, height: 0 },
            elevation:         selected ? 8 : 3,
          },
        ]}
      >
        {/* Status dot */}
        <View style={{
          position:    "absolute",
          top:         circle ? el.width * 0.1 : pill ? 6 : 5,
          right:       circle ? el.width * 0.1 : pill ? 8 : 5,
          width:       7, height: 7, borderRadius: 4,
          backgroundColor: statusColor,
          borderWidth: 1.5, borderColor: "#fff",
        }} />

        {/* Cápsulas de profesional: emoji de sector + nombre centrado */}
        {pill ? (
          <View style={{ alignItems: "center", gap: 1 }}>
            <Text style={{ fontSize: Math.max(14, Math.min(el.width, el.height) * 0.22) }}>{businessIcon ?? "🏢"}</Text>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.55}
              style={{
                color:             "#111827",
                fontSize:          labelSz,
                fontWeight:        "800",
                textAlign:         "center",
                paddingHorizontal: 8,
                letterSpacing:     0.1,
              }}
            >
              {el.label}
            </Text>
          </View>
        ) : (
          /* Otros elementos: icono + label */
          <View style={{
            alignItems:  "center",
            marginTop:   (el.capacity ?? 0) > 0 ? -10 : 0,
          }}>
            {showIcon && (el.type === "mesa" ? (
              <MaterialCommunityIcons
                name="silverware-fork-knife"
                size={iconSz}
                color={statusColor}
              />
            ) : (
              <Feather
                name={(ELEMENT_ICONS[el.type] ?? "star") as any}
                size={iconSz}
                color={statusColor}
              />
            ))}
            <Text
              numberOfLines={2}
              style={{
                color:             "#111827",
                fontSize:          labelSz,
                fontWeight:        "700",
                textAlign:         "center",
                marginTop:         2,
                paddingHorizontal: 3,
                lineHeight:        Math.max(9, labelSz * 1.2),
              }}
            >
              {el.label}
            </Text>
          </View>
        )}

        {/* Capacity badge — sólo para elementos no-cápsula */}
        {!pill && (el.capacity ?? 0) > 0 && (
          <View style={{
            position:   "absolute",
            bottom:     circle ? el.height * 0.04 : 2,
            left:       0,
            right:      0,
            alignItems: "center",
          }}>
            <View style={{
              backgroundColor:   "rgba(255,255,255,0.92)",
              borderRadius:      7,
              paddingHorizontal: 5,
              paddingVertical:   2,
            }}>
              <Text style={{ fontSize: 9, fontWeight: "600", color: GRAY }}>
                {el.capacity}p
              </Text>
            </View>
          </View>
        )}

        {/* Selection ring */}
        {selected && (
          <View
            style={{
              position:    "absolute",
              top:   -5, left:   -5, right:   -5, bottom:   -5,
              borderRadius: circle ? (el.width / 2) + 5 : pill ? pillRadius + 5 : 14,
              borderWidth:  2,
              borderColor:  ACCENT,
              borderStyle:  "dashed",
            }}
            pointerEvents="none"
          />
        )}

        {/* Resize handle — bottom-right corner, editor + selected only */}
        {isEditorMode && selected && (
          <GestureDetector gesture={resizeGesture}>
            <View style={{
              position:        "absolute",
              right:           -18, bottom:          -18,
              width:           44,  height:           44,
              borderRadius:    22,
              backgroundColor: ACCENT,
              borderWidth:     3,
              borderColor:     "#fff",
              alignItems:      "center",
              justifyContent:  "center",
              elevation:       12,
              shadowColor:     ACCENT,
              shadowOpacity:   0.5,
              shadowRadius:    8,
            }}>
              <Feather name="maximize-2" size={18} color="#fff" />
            </View>
          </GestureDetector>
        )}
      </Animated.View>
    </GestureDetector>
  );
}

// ── Element type selector ──────────────────────────────────────────────────────

function ElementTypeSelector({ visible, onSelect, onClose }: {
  visible: boolean;
  onSelect: (type: FloorElementType) => void;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <View style={sel.overlay} pointerEvents="box-none">
      <TouchableOpacity style={sel.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={sel.sheet}>
        <View style={sel.handleBar} />
        <Text style={sel.title}>ADD ELEMENT</Text>
        <Text style={sel.sub}>What type of bookable space?</Text>
        <View style={sel.grid}>
          {elementTypeItems.map(item => (
            <TouchableOpacity
              key={item.type}
              style={[sel.typeCard, { borderColor: item.color + "55" }]}
              activeOpacity={0.8}
              onPress={() => { Haptics.selectionAsync().catch(() => {}); onSelect(item.type); }}
            >
              <View style={[sel.typeIcon, { backgroundColor: item.color + "22" }]}>
                {item.type === "mesa" ? (
                  <MaterialCommunityIcons name="silverware-fork-knife" size={22} color={item.color} />
                ) : (
                  <Feather name={item.icon as any} size={22} color={item.color} />
                )}
              </View>
              <Text style={[sel.typeLabel, { color: item.color }, item.type === "habitacion" && { fontSize: 9.5 }]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={sel.cancelBtn} onPress={onClose}>
          <Text style={sel.cancelTxt}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Element editor ─────────────────────────────────────────────────────────────

function ElementEditor({ el, visible, onSave, onDelete, onDuplicate, onMassDuplicate, onClose }: {
  el: FloorElement | null;
  visible: boolean;
  onSave: (updated: FloorElement) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onMassDuplicate: (id: string) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<FloorElement | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const kbOffset = useSharedValue(0);

  useEffect(() => { if (el) setDraft({ ...el }); }, [el]);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow = (e: any) => {
      kbOffset.value = withTiming(e.endCoordinates.height, { duration: 250 });
    };
    const onHide = () => {
      kbOffset.value = withTiming(0, { duration: 200 });
    };
    const s1 = Keyboard.addListener(showEvent, onShow);
    const s2 = Keyboard.addListener(hideEvent, onHide);
    return () => { s1.remove(); s2.remove(); };
  }, []);

  const sheetAnim = useAnimatedStyle(() => ({
    transform: [{ translateY: -kbOffset.value }],
  }));

  if (!visible || !draft) return null;

  const statusColor = STATUS_COLORS[draft.status];

  return (
    <View style={ed.overlay} pointerEvents="box-none">
      <TouchableOpacity style={ed.backdrop} activeOpacity={1} onPress={() => { Keyboard.dismiss(); onClose(); }} />
      <Animated.View style={[{ position: "absolute", bottom: 0, left: 0, right: 0 }, sheetAnim]}>
        <View style={ed.sheet}>
          <View style={ed.handleBar} />

          <ScrollView
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            bounces={false}
            contentContainerStyle={{ paddingBottom: 8 }}
          >
            <View style={ed.headerRow}>
              <View style={[ed.typePill, { backgroundColor: ACCENT + "22" }]}>
                {draft.type === "mesa" ? (
                  <MaterialCommunityIcons name="silverware-fork-knife" size={13} color={ACCENT} />
                ) : (
                  <Feather name={(ELEMENT_ICONS[draft.type] ?? "star") as any} size={13} color={ACCENT} />
                )}
                <Text style={[ed.typePillTxt, { color: ACCENT }]}>{ELEMENT_LABELS[draft.type]}</Text>
              </View>
              <Text style={ed.editorHint}>Edición rápida</Text>
            </View>

            <View style={ed.fieldRow}>
              <Text style={ed.fieldLabel}>Nombre</Text>
              <TextInput
                style={ed.input}
                value={draft.label}
                onChangeText={v => setDraft(d => d ? { ...d, label: v } : d)}
                placeholder="Ej: Mesa 1, VIP, Terraza…"
                placeholderTextColor={DIM}
                returnKeyType="done"
                autoFocus
              />
            </View>

            <View style={ed.fieldRow}>
              <Text style={ed.fieldLabel}>Capacidad (personas)</Text>
              <View style={ed.numRow}>
                <TouchableOpacity style={ed.numBtn} onPress={() => setDraft(d => d ? { ...d, capacity: Math.max(1, (d.capacity ?? 1) - 1) } : d)}>
                  <Feather name="minus" size={16} color={ACCENT} />
                </TouchableOpacity>
                <Text style={ed.numVal}>{draft.capacity ?? 1}</Text>
                <TouchableOpacity style={ed.numBtn} onPress={() => setDraft(d => d ? { ...d, capacity: (d.capacity ?? 1) + 1 } : d)}>
                  <Feather name="plus" size={16} color={ACCENT} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Status */}
            <View style={ed.fieldRow}>
              <Text style={ed.fieldLabel}>Estado</Text>
              <TouchableOpacity
                style={[ed.statusPicker, { borderColor: statusColor + "88", backgroundColor: statusColor + "18" }]}
                onPress={() => setStatusOpen(s => !s)}
              >
                <View style={[ed.statusDot, { backgroundColor: statusColor }]} />
                <Text style={[ed.statusTxt, { color: statusColor }]}>{STATUS_LABELS[draft.status]}</Text>
                <Feather name={statusOpen ? "chevron-up" : "chevron-down"} size={14} color={statusColor} />
              </TouchableOpacity>
            </View>

            {statusOpen && (
              <View style={ed.statusDropdown}>
                {statusOptions.map(s => (
                  <TouchableOpacity
                    key={s}
                    style={[ed.statusOption, draft.status === s && { backgroundColor: STATUS_COLORS[s] + "22" }]}
                    onPress={() => { setDraft(d => d ? { ...d, status: s } : d); setStatusOpen(false); }}
                  >
                    <View style={[ed.statusDot, { backgroundColor: STATUS_COLORS[s] }]} />
                    <Text style={[ed.statusOptionTxt, { color: STATUS_COLORS[s] }]}>{STATUS_LABELS[s]}</Text>
                    {draft.status === s && <Feather name="check" size={13} color={STATUS_COLORS[s]} />}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <View style={ed.actions}>
              <TouchableOpacity style={[ed.actionBtn, { borderColor: "#F59E0B44", backgroundColor: "#F59E0B11" }]}
                onPress={() => { onDuplicate(draft.id); onClose(); }}
              >
                <Feather name="copy" size={14} color="#F59E0B" />
                <Text style={[ed.actionTxt, { color: "#F59E0B" }]}>Duplicar</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ed.actionBtn, { borderColor: "#8B5CF644", backgroundColor: "#8B5CF611" }]}
                onPress={() => { onMassDuplicate(draft.id); onClose(); }}
              >
                <Feather name="layers" size={14} color="#8B5CF6" />
                <Text style={[ed.actionTxt, { color: "#8B5CF6" }]}>× Varios</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[ed.actionBtn, { borderColor: DANGER + "44", backgroundColor: DANGER + "11" }]}
                onPress={() => { onDelete(draft.id); onClose(); }}
              >
                <Feather name="trash-2" size={14} color={DANGER} />
                <Text style={[ed.actionTxt, { color: DANGER }]}>Eliminar</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={ed.saveBtn} onPress={() => { onSave(draft); onClose(); }}>
              <Feather name="check" size={16} color="#fff" />
              <Text style={ed.saveTxt}>SAVE CHANGES</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
}

// ── Mass duplicate modal ───────────────────────────────────────────────────────

function MassDuplicateModal({ el, visible, onConfirm, onClose }: {
  el: FloorElement | null;
  visible: boolean;
  onConfirm: (id: string, count: number) => void;
  onClose: () => void;
}) {
  const [countStr, setCountStr] = useState("10");

  useEffect(() => { if (visible) setCountStr("10"); }, [visible]);

  if (!visible || !el) return null;

  const count = Math.max(1, Math.min(200, parseInt(countStr, 10) || 1));
  const baseName = el.label.replace(/\s*\(copia\)$/i, "").replace(/\s+\d+$/, "").trim();

  return (
    <View style={md.overlay} pointerEvents="box-none">
      <TouchableOpacity style={md.backdrop} activeOpacity={1} onPress={onClose} />
      <View style={md.sheet}>
        <View style={md.handleBar} />

        <View style={md.titleRow}>
          <View style={md.titleIcon}>
            <Feather name="layers" size={18} color="#8B5CF6" />
          </View>
          <View>
            <Text style={md.title}>DUPLICAR EN MASA</Text>
            <Text style={md.sub}>"{el.label}"</Text>
          </View>
        </View>

        <Text style={md.fieldLabel}>¿CUÁNTAS COPIAS?</Text>
        <View style={md.countRow}>
          <TouchableOpacity
            style={md.countBtn}
            onPress={() => setCountStr(String(Math.max(1, count - 1)))}
            activeOpacity={0.7}
          >
            <Feather name="minus" size={20} color="#8B5CF6" />
          </TouchableOpacity>
          <TextInput
            style={md.countInput}
            value={countStr}
            onChangeText={v => setCountStr(v.replace(/[^0-9]/g, ""))}
            keyboardType="number-pad"
            maxLength={3}
            selectTextOnFocus
          />
          <TouchableOpacity
            style={md.countBtn}
            onPress={() => setCountStr(String(Math.min(200, count + 1)))}
            activeOpacity={0.7}
          >
            <Feather name="plus" size={20} color="#8B5CF6" />
          </TouchableOpacity>
        </View>

        <View style={md.previewBox}>
          <Text style={md.previewLabel}>SE CREARÁN</Text>
          <Text style={md.previewNames} numberOfLines={2}>
            {baseName} 1, {baseName} 2
            {count > 2 ? `, … ${baseName} ${count}` : ""}
          </Text>
          <Text style={md.previewHint}>
            Distribuidas en cuadrícula · numeradas automáticamente
          </Text>
        </View>

        <TouchableOpacity
          style={md.confirmBtn}
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onConfirm(el.id, count); onClose(); }}
          activeOpacity={0.85}
        >
          <Feather name="copy" size={16} color="#fff" />
          <Text style={md.confirmTxt}>CREAR {count} COPIA{count !== 1 ? "S" : ""}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={md.cancelBtn} onPress={onClose}>
          <Text style={md.cancelTxt}>Cancelar</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Selected element action bar ────────────────────────────────────────────────

function SelectedElementBar({ el, mode, onEdit, onBook, onDeselect }: {
  el: FloorElement | null;
  mode: "editor" | "cliente" | "split";
  onEdit: () => void;
  onBook: () => void;
  onDeselect: () => void;
}) {
  if (!el) return null;
  const statusColor = STATUS_COLORS[el.status];
  const canBook = el.status === "disponible";

  return (
    <View style={seb.bar}>
      {/* Left: name + status */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={seb.name} numberOfLines={1}>{el.label}</Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 }}>
          <View style={[seb.dot, { backgroundColor: statusColor }]} />
          <Text style={[seb.status, { color: statusColor }]}>{STATUS_LABELS[el.status]}</Text>
          {(el.capacity ?? 0) > 0 && (
            <Text style={seb.cap}>· {el.capacity}p</Text>
          )}
        </View>
      </View>

      {/* Right: actions */}
      <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
        {canBook && mode === "cliente" && (
          <TouchableOpacity style={seb.bookBtn} onPress={onBook} activeOpacity={0.85}>
            <Feather name="calendar" size={13} color="#fff" />
            <Text style={seb.bookTxt}>Reservar</Text>
          </TouchableOpacity>
        )}
        {mode === "editor" && (
          <TouchableOpacity style={seb.editBtn} onPress={onEdit} activeOpacity={0.85}>
            <Feather name="edit-2" size={13} color={ACCENT} />
          </TouchableOpacity>
        )}
        <TouchableOpacity style={seb.closeBtn} onPress={onDeselect} activeOpacity={0.8}>
          <Feather name="x" size={14} color={GRAY} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Booking date helpers ───────────────────────────────────────────────────────

function getBookingDays(count = 14): string[] {
  const days: string[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(getToday().getTime() + i * 86_400_000);
    days.push(formatISODate(d));
  }
  return days;
}

const BOOKING_MONTH_SHORT = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];

function formatBookingDateLabel(isoDate: string): string {
  const today    = formatISODate(getToday());
  const tomorrow = formatISODate(new Date(getToday().getTime() + 86_400_000));
  if (isoDate === today)    return "Hoy";
  if (isoDate === tomorrow) return "Mañana";
  const d = new Date(isoDate + "T00:00:00");
  return `${["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"][d.getDay()]} ${d.getDate()} ${BOOKING_MONTH_SHORT[d.getMonth()]}`;
}

// ── Client booking sheet ───────────────────────────────────────────────────────

function ClientBookingSheet({ el, planId, visible, onClose, onBooked }: {
  el: FloorElement | null;
  planId: string;
  visible: boolean;
  onClose: () => void;
  onBooked: (r: FloorReservation) => void;
}) {
  const [name, setName]   = useState("");
  const [time, setTime]   = useState("");
  const [notes, setNotes] = useState("");
  const todayISO    = formatISODate(getToday());
  const [selectedDateISO, setSelectedDateISO] = useState(todayISO);
  const bookingDays = useMemo(() => getBookingDays(14), []);

  // ── Keyboard offset — sheet rises to stay above the keyboard ────────────
  const [kbOffset, setKbOffset] = useState(0);
  useEffect(() => {
    const showEvt = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvt = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const onShow  = Keyboard.addListener(showEvt, e => setKbOffset(e.endCoordinates.height));
    const onHide  = Keyboard.addListener(hideEvt, () => setKbOffset(0));
    return () => { onShow.remove(); onHide.remove(); };
  }, []);

  // Reset keyboard offset when sheet closes
  useEffect(() => { if (!visible) setKbOffset(0); }, [visible]);

  if (!visible || !el) return null;

  const canBook     = el.status === "disponible";
  const statusColor = STATUS_COLORS[el.status];

  const handleConfirm = () => {
    if (!name.trim()) { Alert.alert("Falta nombre", "Escribe tu nombre para reservar."); return; }
    const r: FloorReservation = {
      id: makeReservationId(),
      planId,
      elementId:    el.id,
      customerName: name.trim(),
      date:         formatBookingDateLabel(selectedDateISO),
      time:         time.trim(),
      notes:        notes.trim() || undefined,
      status:       "pendiente",
      createdAt:    Date.now(),
    };
    onBooked(r);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setName(""); setSelectedDateISO(todayISO); setTime(""); setNotes("");
    onClose();
  };

  return (
    <View style={cb.overlay} pointerEvents="box-none">
      <TouchableOpacity style={cb.backdrop} activeOpacity={1} onPress={() => { Keyboard.dismiss(); onClose(); }} />

      {/* Sheet shifts up by keyboard height — same pattern used in notes/editor panels */}
      <View style={[cb.sheet, { bottom: kbOffset, maxHeight: SH * 0.82 }]}>
        <View style={cb.handleBar} />

        {/* ScrollView keeps every field visible when keyboard is open */}
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: kbOffset > 0 ? 12 : 0 }}
          bounces={false}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <View style={[cb.statusDot, { backgroundColor: statusColor }]} />
            <Text style={cb.title}>{el.label}</Text>
            <View style={[cb.statusPill, { backgroundColor: statusColor + "22" }]}>
              <Text style={[cb.statusLbl, { color: statusColor }]}>{STATUS_LABELS[el.status]}</Text>
            </View>
          </View>
          <Text style={cb.sub}>
            {ELEMENT_LABELS[el.type]} · {el.capacity ?? 1} persona{(el.capacity ?? 1) !== 1 ? "s" : ""}
          </Text>

          {!canBook && (
            <View style={[cb.banner, { backgroundColor: statusColor + "22", borderColor: statusColor + "55" }]}>
              <Feather name="alert-circle" size={14} color={statusColor} />
              <Text style={[cb.bannerTxt, { color: statusColor }]}>
                This space is currently {STATUS_LABELS[el.status].toLowerCase()}.
              </Text>
            </View>
          )}

          {canBook && (
            <>
              <View style={cb.field}>
                <Text style={cb.label}>Tu nombre</Text>
                <TextInput style={cb.input} value={name} onChangeText={setName}
                  placeholder="Ana García" placeholderTextColor={DIM} returnKeyType="next" />
              </View>
              {/* Fecha — strip de días */}
              <View style={cb.field}>
                <Text style={cb.label}>Fecha</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={cb.dateStripContent}
                >
                  {bookingDays.map((d) => {
                    const active  = d === selectedDateISO;
                    const dateObj = new Date(d + "T00:00:00");
                    return (
                      <TouchableOpacity
                        key={d}
                        activeOpacity={0.7}
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); setSelectedDateISO(d); }}
                        style={[cb.dateChip, active && cb.dateChipActive]}
                      >
                        <Text style={[cb.dateChipWeekday, active && cb.dateChipActiveTxt]}>
                          {WEEKDAY_LETTERS_ES[dateObj.getDay()]}
                        </Text>
                        <Text style={[cb.dateChipNum, active && cb.dateChipActiveTxt]}>
                          {dateObj.getDate()}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>

              {/* Hora — reloj visual GO */}
              <View style={cb.field}>
                <Text style={cb.label}>Hora</Text>
                <GoTimeField
                  label=""
                  value={time}
                  onConfirm={setTime}
                  minuteStep={5}
                  accentColor="#22C55E"
                  fieldStyle={cb.input}
                />
              </View>
              <View style={cb.field}>
                <Text style={cb.label}>Nota (opcional)</Text>
                <TextInput style={[cb.input, { height: 56 }]} value={notes} onChangeText={setNotes}
                  placeholder="Cumpleaños, celíaco…" placeholderTextColor={DIM}
                  multiline returnKeyType="done" />
              </View>
              <TouchableOpacity style={cb.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
                <Feather name="check-circle" size={16} color="#fff" />
                <Text style={cb.confirmTxt}>CONFIRMAR RESERVA</Text>
              </TouchableOpacity>
            </>
          )}

          <TouchableOpacity style={cb.closeBtn} onPress={() => { Keyboard.dismiss(); onClose(); }}>
            <Text style={cb.closeTxt}>Cancelar</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </View>
  );
}

// ── Reservations list ──────────────────────────────────────────────────────────

function ReservationsList({ reservations, elements, visible, onClose }: {
  reservations: FloorReservation[];
  elements: FloorElement[];
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: SH * 0.75 }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10, marginBottom: 14 }} />
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 10 }}>
            <Text style={{ flex: 1, fontSize: 16, fontWeight: "800", color: TEXT }}>Reservas del plano</Text>
            <TouchableOpacity onPress={onClose} hitSlop={8}>
              <Feather name="x" size={20} color={GRAY} />
            </TouchableOpacity>
          </View>
          {reservations.length === 0 ? (
            <View style={{ alignItems: "center", paddingVertical: 40 }}>
              <Feather name="calendar" size={32} color={DIM} />
              <Text style={{ color: DIM, fontSize: 14, marginTop: 10 }}>Sin reservas aún</Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30 }}>
              {reservations.map(r => {
                const el = elements.find(e => e.id === r.elementId);
                return (
                  <View key={r.id} style={{ backgroundColor: CARD, borderRadius: 12, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 10 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 4 }}>
                      <Text style={{ flex: 1, fontWeight: "700", fontSize: 14, color: TEXT }}>{r.customerName}</Text>
                      <View style={{ backgroundColor: "#22C55E22", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ color: "#22C55E", fontSize: 10, fontWeight: "700" }}>{r.status.toUpperCase()}</Text>
                      </View>
                    </View>
                    <Text style={{ color: GRAY, fontSize: 12 }}>{el?.label ?? "—"} · {r.date} {r.time}</Text>
                    {r.notes ? <Text style={{ color: DIM, fontSize: 11, marginTop: 3 }}>{r.notes}</Text> : null}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

// ── Templates sheet ────────────────────────────────────────────────────────────

function TemplatesSheet({ visible, onApply, onClose }: {
  visible: boolean;
  onApply: (tpl: BusinessTemplate) => void;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.48)", justifyContent: "flex-end" }}>
        <View style={{ backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: SH * 0.82 }}>
          <View style={{ width: 38, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10 }} />

          {/* Header */}
          <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: BORDER }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 17, fontWeight: "900", color: TEXT, letterSpacing: 0.3 }}>📋 Plantillas</Text>
              <Text style={{ fontSize: 12, color: GRAY, marginTop: 2 }}>Elige tu negocio y empieza ya</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={10}>
              <Feather name="x" size={20} color={GRAY} />
            </TouchableOpacity>
          </View>

          {/* Template list */}
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 30, paddingTop: 14 }}>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
              {BUSINESS_TEMPLATES.map(tpl => (
                <TouchableOpacity
                  key={tpl.id}
                  style={{
                    width: (SW - 52) / 2,
                    backgroundColor: "#FAFBFF",
                    borderRadius: 18,
                    borderWidth: 1.5,
                    borderColor: tpl.color + "44",
                    paddingVertical: 20,
                    paddingHorizontal: 12,
                    gap: 10,
                    alignItems: "center",
                  }}
                  activeOpacity={0.78}
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}); onApply(tpl); }}
                >
                  <View style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: tpl.color + "18",
                    borderWidth: 1,
                    borderColor: tpl.color + "40",
                    alignItems: "center",
                    justifyContent: "center",
                  }}>
                    <Text style={{ fontSize: 26, lineHeight: 32 }}>{tpl.emoji}</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: "900", color: TEXT, textAlign: "center", letterSpacing: 0.1 }}>{tpl.name}</Text>
                  <Text style={{ fontSize: 11, color: GRAY, lineHeight: 16, textAlign: "center" }}>{tpl.summary}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export interface PlanoEmpresaPanelProps {
  businessId: string;
  businessName?: string;
  templateId?: string;
  onClose: () => void;
  /** Wizard: avanza al paso siguiente (Paso 7 → Paso 8) desde dentro del plano */
  onNext?: () => void;
  /** Oculta el FAB flotante interno (usar cuando el padre ya tiene el suyo propio) */
  hideFAB?: boolean;
}

// ── Inline reservations panel for split mode ────────────────────────────────

const RESERVATION_STATUS_COLORS: Record<"pendiente" | "confirmada" | "cancelada", string> = {
  pendiente:  "#F59E0B",
  confirmada: "#22C55E",
  cancelada:  "#EF4444",
};

function SplitReservationsPanel({
  reservations, elements, flex,
}: { reservations: FloorReservation[]; elements: FloorElement[]; flex: number }) {
  const elementLabel = (id: string) =>
    elements.find(e => e.id === id)?.label ?? "Espacio";

  return (
    <View style={[sp.root, { flex }]}>
      <View style={sp.header}>
        <Feather name="calendar" size={14} color={ACCENT} />
        <Text style={sp.headerTxt}>RESERVAS ACTIVAS</Text>
        <Text style={sp.count}>{reservations.length}</Text>
      </View>
      {reservations.length === 0 ? (
        <View style={sp.empty}>
          <Feather name="check-circle" size={24} color={DIM} />
          <Text style={sp.emptyTxt}>Sin reservas activas</Text>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 12, paddingBottom: 8 }}>
          {reservations.map(r => (
            <View key={r.id} style={sp.row}>
              <View style={[sp.dot, { backgroundColor: RESERVATION_STATUS_COLORS[r.status] }]} />
              <View style={{ flex: 1 }}>
                <Text style={sp.name} numberOfLines={1}>{r.customerName}</Text>
                <Text style={sp.sub} numberOfLines={1}>{elementLabel(r.elementId)} · {r.date}{r.time ? ` · ${r.time}` : ""}</Text>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

export function PlanoEmpresaScreen({ businessId, businessName, templateId, onClose, onNext, hideFAB = false }: PlanoEmpresaPanelProps) {
  const insets = useSafeAreaInsets();
  const { config: bizConfig } = useBusinessConfig();

  const [mode, setMode]                 = useState<"editor" | "cliente" | "split">("editor");
  const [splitRatio, setSplitRatio]     = useState(0.5);
  const [plan, setPlan]                 = useState<FloorPlan>({
    id: makeFloorId(), businessId, elements: [], updatedAt: Date.now(),
  });
  const [reservations, setReservations] = useState<FloorReservation[]>([]);
  const [selectedId, setSelectedId]     = useState<string | null>(null);
  const [showTypeSelector, setShowTypeSelector] = useState(false);
  const [showEditor, setShowEditor]     = useState(false);
  const [clientBookEl, setClientBookEl] = useState<FloorElement | null>(null);
  const [showResList, setShowResList]   = useState(false);
  const [saving, setSaving]             = useState(false);
  const [hasChanges, setHasChanges]     = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [massDupEl, setMassDupEl]       = useState<FloorElement | null>(null);

  // ── Canvas transform shared values ──────────────────────────────────────────
  const canvasScale     = useSharedValue(0.72);
  const canvasPanX      = useSharedValue(0);
  const canvasPanY      = useSharedValue(8);
  const savedScale      = useSharedValue(0.72);
  const savedPanX       = useSharedValue(0);
  const savedPanY       = useSharedValue(8);
  const canvasAreaHeight = useSharedValue(SH); // measured via onLayout
  // Dynamic canvas size (born from elements, not fixed).
  // Initialize to 320 (empty plan default) — useEffect below keeps them in sync.
  const sharedCW = useSharedValue(320);
  const sharedCH = useSharedValue(320);
  // For focal-point zooming (saves panX/panY at pinch start)
  const savedOffsetX = useSharedValue(0);
  const savedOffsetY = useSharedValue(0);

  // ── Canvas dimensions: born from elements + padding ─────────────────────────
  const CANVAS_PAD = 56;
  const canvasDims = useMemo(() => {
    const els = plan.elements;
    if (els.length === 0) return { w: 320, h: 320 };
    let maxX = 0, maxY = 0;
    for (const el of els) {
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    return { w: maxX + CANVAS_PAD, h: maxY + CANVAS_PAD };
  }, [plan.elements]);

  // Sync canvas dims to shared values for worklet access
  useEffect(() => {
    sharedCW.value = canvasDims.w;
    sharedCH.value = canvasDims.h;
  }, [canvasDims]);


  // ── fitToElements — auto-fit the canvas so elements fill ~85 % of the screen ─
  // FILL_TARGET: fraction of the visible viewport the element bounding-box
  // should occupy.  0.85 → elements fill 85 %, leaving a comfortable 7.5 % margin
  // on each side.  The scale is NOT lower-clamped so the view always zooms IN
  // enough to make the content large and readable.
  const FILL_TARGET = 0.88;

  const fitToElements = useCallback((elements: FloorElement[]) => {
    const areaH = canvasAreaHeight.value > 0 ? canvasAreaHeight.value : SH * 0.70;

    if (elements.length === 0) {
      // Empty canvas — 320×320 working area centered on screen.
      // screen_x = px * s + panX → canvas center at SW/2: panX = SW/2 - cw/2 * s
      const cw = 320, ch = 320;
      const s    = Math.min(MAX_SCALE, Math.min(SW / cw, areaH / ch) * 0.80);
      const panX = SW    / 2 - (cw / 2) * s;
      const panY = areaH / 2 - (ch / 2) * s;
      canvasScale.value = withTiming(s,    { duration: 380 });
      canvasPanX.value  = withTiming(panX, { duration: 380 });
      canvasPanY.value  = withTiming(panY, { duration: 380 });
      savedScale.value  = s;
      savedPanX.value   = panX;
      savedPanY.value   = panY;
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of elements) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      maxX = Math.max(maxX, el.x + el.width);
      maxY = Math.max(maxY, el.y + el.height);
    }
    const bboxW  = Math.max(maxX - minX, 60);
    const bboxH  = Math.max(maxY - minY, 60);
    // Scale so the bounding-box fills FILL_TARGET of the visible area.
    // Correct centering formula: screen_x = px * s + panX
    // → panX = screenCenterX - bboxCX * s
    const s      = Math.min(MAX_SCALE, Math.min(SW / bboxW, areaH / bboxH) * FILL_TARGET);
    const bboxCX = (minX + maxX) / 2;
    const bboxCY = (minY + maxY) / 2;
    const panX   = SW    / 2 - bboxCX * s;
    const panY   = areaH / 2 - bboxCY * s;
    canvasScale.value = withTiming(s,    { duration: 380 });
    canvasPanX.value  = withTiming(panX, { duration: 380 });
    canvasPanY.value  = withTiming(panY, { duration: 380 });
    savedScale.value  = s;
    savedPanX.value   = panX;
    savedPanY.value   = panY;
  }, [canvasScale, canvasPanX, canvasPanY, savedScale, savedPanX, savedPanY, canvasAreaHeight]);

  // ── Canvas gestures ──────────────────────────────────────────────────────────
  // clampPan — worklet that computes pan bounds dynamically from current scale.
  // Rule: at least MARGIN px of the canvas must remain visible on every side.
  // Visual math (derived from the transform formula in canvasAnimStyle):
  //   canvas left  = panX            canvas right  = CANVAS_W * scale + panX
  //   canvas top   = panY            canvas bottom = CANVAS_H * scale + panY
  // So clamping is simply:
  //   panX ∈ [MARGIN - CANVAS_W * s,  SW - MARGIN]
  //   panY ∈ [MARGIN - CANVAS_H * s,  SH - MARGIN]
  const CLAMP_MARGIN = 120; // px of canvas that must stay on-screen

  const clampPan = (px: number, py: number, s: number): [number, number] => {
    "worklet";
    const minX = CLAMP_MARGIN - sharedCW.value * s;
    const maxX = SW - CLAMP_MARGIN;
    const minY = CLAMP_MARGIN - sharedCH.value * s;
    const maxY = canvasAreaHeight.value - CLAMP_MARGIN;
    return [
      Math.max(minX, Math.min(maxX, px)),
      Math.max(minY, Math.min(maxY, py)),
    ];
  };

  const pinchGesture = useMemo(() =>
    Gesture.Pinch()
      .onStart(() => {
        "worklet";
        savedScale.value   = canvasScale.value;
        // Save panX/panY at start (not TX) — correct focal-point calculation
        // uses: canvas_coord = (screen_coord - panX) / scale
        savedOffsetX.value = canvasPanX.value;
        savedOffsetY.value = canvasPanY.value;
      })
      .onUpdate((e) => {
        "worklet";
        const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
        // Canvas coordinate of focal point must stay fixed
        const cx      = (e.focalX - savedOffsetX.value) / savedScale.value;
        const cy      = (e.focalY - savedOffsetY.value) / savedScale.value;
        // New panX so focal canvas point stays at same screen position
        const rawPanX = e.focalX - cx * newScale;
        const rawPanY = e.focalY - cy * newScale;
        canvasScale.value = newScale;
        const [cpx, cpy] = clampPan(rawPanX, rawPanY, newScale);
        canvasPanX.value  = cpx;
        canvasPanY.value  = cpy;
      }),
  []);

  const canvasPanGesture = useMemo(() =>
    Gesture.Pan()
      .minPointers(1)
      .maxPointers(2)
      .onStart(() => {
        "worklet";
        savedPanX.value = canvasPanX.value;
        savedPanY.value = canvasPanY.value;
      })
      .onUpdate((e) => {
        "worklet";
        const [cx, cy] = clampPan(
          savedPanX.value + e.translationX,
          savedPanY.value + e.translationY,
          canvasScale.value,
        );
        canvasPanX.value = cx;
        canvasPanY.value = cy;
      })
      .onEnd((e) => {
        "worklet";
        // Decay with reduced velocity (0.42×) and faster deceleration for a
        // premium "heavy" feel. Clamped bounds prevent overshooting the canvas edge.
        const s    = canvasScale.value;
        const minX = CLAMP_MARGIN - sharedCW.value * s;
        const maxX = SW - CLAMP_MARGIN;
        const minY = CLAMP_MARGIN - sharedCH.value * s;
        const maxY = canvasAreaHeight.value - CLAMP_MARGIN;
        canvasPanX.value = withDecay({ velocity: e.velocityX * 0.42, deceleration: 0.982, clamp: [minX, maxX] });
        canvasPanY.value = withDecay({ velocity: e.velocityY * 0.42, deceleration: 0.982, clamp: [minY, maxY] });
      }),
  []);

  const bgTapGesture = useMemo(() =>
    Gesture.Tap()
      .runOnJS(true)
      .onEnd((_, success) => {
        if (success) { setSelectedId(null); }
      }),
  []);

  const canvasComposed = useMemo(() =>
    Gesture.Simultaneous(pinchGesture, canvasPanGesture),
  [pinchGesture, canvasPanGesture]);

  // Canvas animated style
  // Transform model: scale(s) around element center, then translate(TX, TY).
  // Net effect: screen_x = px * s + panX  (canvasPanX is the pure offset).
  // TX = -(cw*(1-s))/2 + panX cancels the scale-around-center shift so that
  // the translate term in screen space equals panX exactly.
  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: -(sharedCW.value * (1 - canvasScale.value)) / 2 + canvasPanX.value },
      { translateY: -(sharedCH.value * (1 - canvasScale.value)) / 2 + canvasPanY.value },
      { scale: canvasScale.value },
    ],
  }));

  // ── Data ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    loadFloorPlan(businessId).then(saved => {
      if (saved && saved.elements.length > 0) {
        // ── 1. Migrate pill widths so long names always fit ────────────────
        const migrated = saved.elements.map(el =>
          isPill(el.type)
            ? { ...el, width: Math.max(el.width, pillWidthForLabel(el.label)) }
            : el
        );

        // ── 2. Merge any puestos from plantillaItems not yet in the plan ──
        const plantillaItems = bizConfig.plantillaItems;
        const sectorId       = bizConfig.sectorId;
        const elType: FloorElementType =
          (sectorId && SECTOR_TO_FLOOR_TYPE[sectorId]) ? SECTOR_TO_FLOOR_TYPE[sectorId] : "silla";

        if (isPill(elType) && plantillaItems && plantillaItems.length > 0) {
          const existingLabels = new Set(
            migrated.filter(e => isPill(e.type)).map(e => e.label.trim().toLowerCase())
          );
          const missing: string[] = [];
          for (const item of plantillaItems) {
            for (let i = 0; i < item.count; i++) {
              const staffName = item.staffNames?.[i]?.trim();
              const slotEmoji = item.staffEmojis?.[i] ?? item.emoji;
              const label = staffName
                ? staffName
                : item.count > 1 ? `${slotEmoji} ${i + 1}` : slotEmoji;
              if (!existingLabels.has(label.trim().toLowerCase())) missing.push(label);
            }
          }

          if (missing.length > 0) {
            const GAP    = 12;
            const elH    = 52;
            let newPillW = 90;
            for (const lbl of missing) newPillW = Math.max(newPillW, pillWidthForLabel(lbl));
            let maxY = 0;
            for (const el of migrated) maxY = Math.max(maxY, el.y + el.height);
            let curX = 10;
            let curY = maxY + GAP * 2;
            const MAX_ROW_W = 380;

            const extraEls: FloorElement[] = missing.map(label => {
              if (curX > 10 && curX + newPillW > MAX_ROW_W + 10) { curX = 10; curY += elH + GAP; }
              const el: FloorElement = {
                id: makeElementId(), type: "silla", label,
                capacity: 1, x: curX, y: curY,
                width: newPillW, height: elH,
                status: "disponible", reservable: true,
              };
              curX += newPillW + GAP;
              return el;
            });

            const merged = [...migrated, ...extraEls];
            setPlan({ ...saved, elements: merged });
            setHasChanges(true);
            setTimeout(() => fitToElements(merged), 350);
            return;
          }
        }

        setPlan({ ...saved, elements: migrated });
        setTimeout(() => fitToElements(migrated), 350);
        return;
      }

      // Plan vacío (nuevo negocio) → prioridad 1: espacios configurados por el usuario
      const plantillaItems = bizConfig.plantillaItems;
      const sectorId       = bizConfig.sectorId;
      if (plantillaItems && plantillaItems.length > 0) {
        const autoElements = buildElementsFromPlantilla(plantillaItems, sectorId);
        if (autoElements.length > 0) {
          setPlan(p => ({ ...p, elements: autoElements }));
          setTimeout(() => fitToElements(autoElements), 350);
          return;
        }
      }

      // Prioridad 2: plantilla genérica por actividad (fallback)
      if (templateId) {
        const planoId = BOOKING_TO_PLANO_ID[templateId];
        const tpl = planoId ? BUSINESS_TEMPLATES.find(t => t.id === planoId) : undefined;
        if (tpl) {
          const autoElements: FloorElement[] = tpl.elements.map(e => ({
            ...e,
            id: makeElementId(),
          }));
          setPlan(p => ({ ...p, elements: autoElements }));
          setTimeout(() => fitToElements(autoElements), 350);
          return;
        }
      }

      // Sin plantilla → plan vacío centrado
      setTimeout(() => fitToElements([]), 350);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessId]);

  useEffect(() => {
    loadReservations(plan.id).then(setReservations);
  }, [plan.id]);

  const selectedEl = plan.elements.find(e => e.id === selectedId) ?? null;

  const updatePlan = useCallback((updater: (p: FloorPlan) => FloorPlan) => {
    setPlan(p => {
      const next = updater({ ...p, updatedAt: Date.now() });
      setHasChanges(true);
      return next;
    });
  }, []);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true);
    await saveFloorPlan(plan);
    await saveReservations(plan.id, reservations);
    setSaving(false);
    setHasChanges(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      updatePlan(p => ({ ...p, backgroundImage: result.assets[0].uri }));
    }
  };

  const handleClearBackground = () => {
    Alert.alert("Quitar imagen", "¿Quitar la imagen de fondo del plano?", [
      { text: "Cancelar", style: "cancel" },
      { text: "Quitar", style: "destructive", onPress: () => updatePlan(p => ({ ...p, backgroundImage: undefined })) },
    ]);
  };

  const addElement = useCallback((type: FloorElementType) => {
    const defaults = ELEMENT_DEFAULTS[type];
    const n   = countByType(plan.elements, type);
    const elW = defaults.width  ?? 80;
    const elH = defaults.height ?? 80;

    // ── Smart placement: cluster near existing elements ──────────────────────
    // First element → canvas centre. Subsequent ones → orbit around the
    // centroid of the existing cluster (90–140 px away, random angle) so the
    // bounding-box stays compact and fitToElements zooms in tightly.
    let x: number, y: number;
    if (plan.elements.length === 0) {
      // Start compact — canvas is born from elements, not a fixed 900×1200 space
      x = 20;
      y = 20;
    } else {
      const centX = plan.elements.reduce((acc, e) => acc + e.x + e.width  / 2, 0) / plan.elements.length;
      const centY = plan.elements.reduce((acc, e) => acc + e.y + e.height / 2, 0) / plan.elements.length;
      const dist  = 90 + Math.random() * 50;
      const angle = Math.random() * Math.PI * 2;
      x = Math.max(10, centX - elW / 2 + Math.cos(angle) * dist);
      y = Math.max(10, centY - elH / 2 + Math.sin(angle) * dist);
    }

    const el: FloorElement = {
      id: makeElementId(), type,
      label:    `${ELEMENT_LABELS[type]} ${n}`,
      capacity: defaults.capacity ?? 2,
      x, y,
      width:    elW,
      height:   elH,
      status:   "disponible",
      reservable: true,
    };
    const nextElements = [...plan.elements, el];
    updatePlan(p => ({ ...p, elements: nextElements }));
    setSelectedId(el.id);
    setShowTypeSelector(false);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    // Auto-refit so the new element is always large and centred
    setTimeout(() => fitToElements(nextElements), 120);
  }, [plan.elements, updatePlan, fitToElements]);

  const handleDragEnd = useCallback((id: string, x: number, y: number) => {
    updatePlan(p => ({
      ...p,
      elements: p.elements.map(e => e.id === id ? { ...e, x, y } : e),
    }));
  }, [updatePlan]);

  const handleResizeEnd = useCallback((id: string, width: number, height: number) => {
    updatePlan(p => ({
      ...p,
      elements: p.elements.map(e => e.id === id ? { ...e, width, height } : e),
    }));
    Haptics.selectionAsync().catch(() => {});
  }, [updatePlan]);

  // Single tap → select
  const handleSelect = useCallback((id: string) => {
    setSelectedId(prev => {
      if (prev === id) return null;
      return id;
    });
  }, []);

  // Double tap → open editor (editor mode only)
  const handleDoubleTap = useCallback((id: string) => {
    setSelectedId(id);
    setShowEditor(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const handleSaveElement = useCallback((updated: FloorElement) => {
    updatePlan(p => ({
      ...p,
      elements: p.elements.map(e => e.id === updated.id ? updated : e),
    }));
    setSelectedId(null);
  }, [updatePlan]);

  const handleDeleteElement = useCallback((id: string) => {
    const nextElements = plan.elements.filter(e => e.id !== id);
    updatePlan(p => ({ ...p, elements: nextElements }));
    setSelectedId(null);
    // Refit so remaining elements fill the screen after a deletion
    setTimeout(() => fitToElements(nextElements), 120);
  }, [plan.elements, updatePlan, fitToElements]);

  const handleDuplicateElement = useCallback((id: string) => {
    const src = plan.elements.find(e => e.id === id);
    if (!src) return;
    const dup: FloorElement = { ...src, id: makeElementId(), label: `${src.label} (copia)`, x: src.x + 20, y: src.y + 20 };
    const next = [...plan.elements, dup];
    updatePlan(p => ({ ...p, elements: next }));
    Haptics.selectionAsync().catch(() => {});
    setTimeout(() => fitToElements(next), 120);
  }, [plan.elements, updatePlan, fitToElements]);

  const handleMassDuplicateElement = useCallback((id: string, count: number) => {
    const src = plan.elements.find(e => e.id === id);
    if (!src || count < 1) return;

    // Strip trailing number or "(copia)" to get the clean base name
    const baseName = src.label
      .replace(/\s*\(copia\)$/i, "")
      .replace(/\s+\d+$/, "")
      .trim();

    // Grid geometry: square-ish layout
    const cols  = Math.ceil(Math.sqrt(count));
    const GAP   = 14;
    const stepX = src.width  + GAP;
    const stepY = src.height + GAP;

    // Start row: just below the lowest existing element
    let maxY = 0;
    for (const el of plan.elements) maxY = Math.max(maxY, el.y + el.height);
    const startX = 30;
    const startY = maxY + GAP * 3;

    const newElements: FloorElement[] = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      newElements.push({
        ...src,
        id:     makeElementId(),
        label:  `${baseName} ${i + 1}`,
        x:      Math.max(10, Math.min(CANVAS_W - src.width  - 10, startX + col * stepX)),
        y:      Math.max(10, startY + row * stepY),
      });
    }

    const nextElements = [...plan.elements, ...newElements];
    updatePlan(p => ({ ...p, elements: nextElements }));
    setSelectedId(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => fitToElements(nextElements), 150);
  }, [plan.elements, updatePlan, fitToElements]);

  const handleApplyTemplate = useCallback((tpl: BusinessTemplate) => {
    const doApply = () => {
      const newElements: FloorElement[] = tpl.elements.map(e => ({
        ...e,
        id: makeElementId(),
      }));
      updatePlan(p => ({ ...p, elements: newElements }));
      setSelectedId(null);
      setShowTemplates(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      // Auto-fit canvas to the new template elements
      setTimeout(() => fitToElements(newElements), 80);
    };
    if (plan.elements.length > 0) {
      Alert.alert(
        "Aplicar plantilla",
        `Se reemplazarán los ${plan.elements.length} elemento${plan.elements.length !== 1 ? "s" : ""} actuales con la plantilla «${tpl.name}». ¿Continuar?`,
        [
          { text: "Cancelar", style: "cancel" },
          { text: "Aplicar", style: "destructive", onPress: doApply },
        ]
      );
    } else {
      doApply();
    }
  }, [plan.elements, updatePlan]);

  const handleBooked = useCallback((r: FloorReservation) => {
    const next = [r, ...reservations];
    setReservations(next);
    saveReservations(plan.id, next);
    updatePlan(p => ({
      ...p,
      elements: p.elements.map(e =>
        e.id === r.elementId ? { ...e, status: "reservado" as FloorElementStatus } : e
      ),
    }));
  }, [reservations, plan.id, updatePlan]);

  const handleBook = useCallback(() => {
    if (selectedEl) setClientBookEl(selectedEl);
  }, [selectedEl]);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>

      {/* ── Title strip (minimal, top) ── */}
      <View style={s.titleStrip} pointerEvents="none">
        <Text style={s.titleTxt}>PLANO</Text>
        <Text style={s.subtitleTxt}>{businessName ?? "Mi Negocio"}</Text>
      </View>

      {/* ── Canvas area (+ inline reservations panel en modo dividido) ── */}
      <View style={{ flex: 1 }}>
      <GestureDetector gesture={canvasComposed}>
        <View
          style={[
            { overflow: "hidden", backgroundColor: BG },
            mode === "split" ? { flex: Math.round(splitRatio * 10) } : { flex: 1 },
          ]}
          onLayout={(e) => { canvasAreaHeight.value = e.nativeEvent.layout.height; }}
        >
          {/* Canvas surface — sized to the element bounding-box + padding */}
          <Animated.View
            style={[
              {
                position:        "absolute",
                width:           canvasDims.w,
                height:          canvasDims.h,
                backgroundColor: "#FAFBFF",
                borderRadius:    12,
                borderWidth:     1,
                borderColor:     BORDER,
                overflow:        "hidden",
              },
              canvasAnimStyle,
            ]}
          >
            {/* Background */}
            {plan.backgroundImage ? (
              <Image
                source={{ uri: plan.backgroundImage }}
                style={{ position: "absolute", width: canvasDims.w, height: canvasDims.h }}
                contentFit="contain"
              />
            ) : (
              <GridBackground w={canvasDims.w} h={canvasDims.h} />
            )}

            {/* Tap empty canvas → deselect */}
            <GestureDetector gesture={bgTapGesture}>
              <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
            </GestureDetector>

            {/* Elements */}
            {(mode === "cliente"
              ? plan.elements.filter(e => e.status === "disponible" && e.reservable)
              : plan.elements.filter(e => e.reservable !== false)
            ).map(el => (
              <FloorElementView
                key={el.id}
                el={el}
                selected={selectedId === el.id}
                isEditorMode={mode === "editor"}
                canvasScale={canvasScale}
                canvasMaxW={sharedCW}
                canvasMaxH={sharedCH}
                onSelect={handleSelect}
                onDoubleTap={handleDoubleTap}
                onDragEnd={handleDragEnd}
                onResizeEnd={handleResizeEnd}
                businessIcon={getBusinessIcon(templateId)}
              />
            ))}

            {/* Empty state */}
            {(mode === "cliente"
              ? !plan.elements.some(e => e.status === "disponible" && e.reservable)
              : !plan.elements.some(e => e.reservable !== false)
            ) && (
              <View style={s.emptyCanvas}>
                <Feather name={mode === "cliente" ? "check-circle" : "map"} size={36} color={DIM} />
                <Text style={s.emptyTxt}>
                  {mode === "cliente" ? "No availability now" : "Your floor plan is empty"}
                </Text>
                <Text style={s.emptySub}>
                  {mode === "cliente"
                    ? "All spaces are occupied or reserved. Contact the business."
                    : "Tap «+ ELEMENT» below to add tables, rooms or any bookable space."
                  }
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
      </GestureDetector>
      {mode === "split" && (
        <SplitReservationsPanel
          reservations={reservations}
          elements={plan.elements}
          flex={Math.round((1 - splitRatio) * 10)}
        />
      )}
      </View>

      {/* ── Status legend ── */}
      <View style={s.legend}>
        {(mode === "cliente"
          ? (["disponible"] as FloorElementStatus[])
          : (["disponible", "reservado", "ocupado", "bloqueado"] as FloorElementStatus[])
        ).map(st => (
          <View key={st} style={s.legendItem}>
            <View style={[s.legendDot, { backgroundColor: STATUS_COLORS[st] }]} />
            <Text style={s.legendTxt}>{mode === "cliente" && st === "disponible" ? "Available spaces" : STATUS_LABELS[st]}</Text>
          </View>
        ))}
      </View>

      {/* ── Selected element bar ── */}
      <SelectedElementBar
        el={selectedEl}
        mode={mode}
        onEdit={() => setShowEditor(true)}
        onBook={handleBook}
        onDeselect={() => setSelectedId(null)}
      />

      {/* ── GO close FAB — arrastrable con long-press ── */}
      {!hideFAB && (
        <DraggableFAB
          screenKey="plano"
          buttonKey="close"
          initialRight={20}
          initialBottom={insets.bottom + 165}
          maxH={40}
        >
          <TouchableOpacity
            style={s.goFab}
            onPress={onClose}
            activeOpacity={0.85}
            hitSlop={6}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>
      )}

      {/* ── Bottom toolbar ── */}
      <View style={[s.bottomBar, { paddingBottom: insets.bottom + 8 }]}>
        {/* Row 1: mode toggle — EMPRESA | CLIENTE | DIVIDIDO */}
        <View style={s.modeRow}>
          <View style={s.modeBtnGroup}>
            {(["editor", "cliente", "split"] as const).map(m => (
              <TouchableOpacity
                key={m}
                style={[s.modeBtn, mode === m && s.modeBtnActive]}
                onPress={() => {
                  setMode(m);
                  setSelectedId(null);
                  setShowEditor(false);
                  const els = m === "cliente"
                    ? plan.elements.filter(e => e.status === "disponible" && e.reservable)
                    : plan.elements.filter(e => e.reservable !== false);
                  setTimeout(() => fitToElements(els), 80);
                }}
                activeOpacity={0.8}
              >
                <Feather
                  name={m === "editor" ? "briefcase" : m === "cliente" ? "eye" : "columns"}
                  size={13}
                  color={mode === m ? "#fff" : GRAY}
                />
                <Text style={[s.modeTxt, mode === m && s.modeTxtActive]} numberOfLines={1}>
                  {m === "editor" ? "BUSINESS" : m === "cliente" ? "CLIENT" : "SPLIT"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Reservations count badge (client mode) */}
          {mode === "cliente" && (
            <TouchableOpacity style={s.resListBtn} onPress={() => setShowResList(true)}>
              <Feather name="list" size={14} color={ACCENT} />
              <Text style={s.resListTxt}>{reservations.length}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Row 2 (editor): primary action — full-width + ELEMENTO */}
        {mode === "editor" && (
          <TouchableOpacity
            style={s.addBtnFull}
            onPress={() => { setShowTypeSelector(true); setSelectedId(null); setShowEditor(false); }}
            activeOpacity={0.85}
          >
            <Feather name="plus" size={18} color="#fff" />
            <Text style={s.addTxtFull}>+ ELEMENT</Text>
          </TouchableOpacity>
        )}

        {/* Row 3 (editor): secondary tools */}
        {mode === "editor" && (
          <View style={s.toolsRow}>
            {/* Image background */}
            <TouchableOpacity style={s.toolBtn} onPress={handlePickImage} activeOpacity={0.8}>
              <Feather name="image" size={15} color={ACCENT} />
            </TouchableOpacity>
            {plan.backgroundImage && (
              <TouchableOpacity style={s.toolBtn} onPress={handleClearBackground} activeOpacity={0.8}>
                <Feather name="x-circle" size={15} color={DANGER} />
              </TouchableOpacity>
            )}

            {/* Templates */}
            {(() => {
              // Si hay actividad seleccionada, buscamos su plano específico
              const planoId = templateId ? BOOKING_TO_PLANO_ID[templateId] : undefined;
              const contextTpl = planoId ? BUSINESS_TEMPLATES.find(t => t.id === planoId) : undefined;
              if (contextTpl) {
                // Actividad conocida → botón singular que aplica directo
                return (
                  <TouchableOpacity
                    style={s.tplBtn}
                    onPress={() => {
                      setSelectedId(null);
                      setShowEditor(false);
                      handleApplyTemplate(contextTpl);
                    }}
                    activeOpacity={0.85}
                  >
                    <Text style={{ fontSize: 14, lineHeight: 18 }}>{contextTpl.emoji}</Text>
                    <Text style={s.tplTxt}>TEMPLATE</Text>
                  </TouchableOpacity>
                );
              }
              // Sin actividad → listado general
              return (
                <TouchableOpacity
                  style={s.tplBtn}
                  onPress={() => { setShowTemplates(true); setSelectedId(null); setShowEditor(false); }}
                  activeOpacity={0.85}
                >
                  <Feather name="layers" size={14} color="#7C69BE" />
                  <Text style={s.tplTxt}>TEMPLATES</Text>
                </TouchableOpacity>
              );
            })()}

            <View style={{ flex: 1 }} />

            {/* Save */}
            <TouchableOpacity
              style={[s.saveBtn, !hasChanges && { opacity: 0.45 }]}
              onPress={handleSave}
              disabled={saving || !hasChanges}
              activeOpacity={0.85}
            >
              <Feather name={saving ? "loader" : "save"} size={15} color={hasChanges ? "#fff" : GRAY} />
              <Text style={[s.saveTxt, !hasChanges && { color: GRAY }]}>
                {saving ? "…" : "SAVE"}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Row 2: client mode hint */}
        {mode === "cliente" && plan.elements.some(e => e.status === "disponible") && (
          <View style={s.clientHint}>
            <Feather name="map-pin" size={12} color={ACCENT} />
            <Text style={s.clientHintTxt}>Tap a free space · double tap for more info</Text>
          </View>
        )}

        {/* SIGUIENTE — solo visible en el asistente de configuración (Paso 7 → Paso 8) */}
        {onNext && (
          <TouchableOpacity
            style={s.nextStepBtn}
            onPress={() => { if (hasChanges) handleSave(); onNext(); }}
            activeOpacity={0.88}
          >
            <Text style={s.nextStepTxt}>NEXT</Text>
            <Feather name="arrow-right" size={17} color="#fff" />
          </TouchableOpacity>
        )}
      </View>

      {/* ── Overlays ── */}
      <ElementTypeSelector
        visible={showTypeSelector}
        onSelect={addElement}
        onClose={() => setShowTypeSelector(false)}
      />

      <ElementEditor
        el={selectedEl}
        visible={showEditor}
        onSave={handleSaveElement}
        onDelete={handleDeleteElement}
        onDuplicate={handleDuplicateElement}
        onMassDuplicate={(id) => {
          const el = plan.elements.find(e => e.id === id);
          if (el) { setMassDupEl(el); setShowEditor(false); }
        }}
        onClose={() => { setShowEditor(false); }}
      />

      <MassDuplicateModal
        el={massDupEl}
        visible={massDupEl !== null}
        onConfirm={handleMassDuplicateElement}
        onClose={() => setMassDupEl(null)}
      />

      <ClientBookingSheet
        el={clientBookEl}
        planId={plan.id}
        visible={clientBookEl !== null}
        onClose={() => setClientBookEl(null)}
        onBooked={handleBooked}
      />

      <ReservationsList
        reservations={reservations}
        elements={plan.elements}
        visible={showResList}
        onClose={() => setShowResList(false)}
      />

      <TemplatesSheet
        visible={showTemplates}
        onApply={handleApplyTemplate}
        onClose={() => setShowTemplates(false)}
      />
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:        { flex: 1, backgroundColor: BG },

  // Title strip
  titleStrip:  { position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, alignItems: "center", paddingTop: 10 },
  titleTxt:    { fontSize: 11, fontWeight: "900", color: TEXT, letterSpacing: 2, opacity: 0.55 },
  subtitleTxt: { fontSize: 10, color: GRAY, marginTop: 1, opacity: 0.7 },

  // GO close FAB — posicionado por DraggableFAB, solo estilo visual
  goFab:       {
    width: 44, height: 44, borderRadius: 13,
    backgroundColor: "#0F0F0F",
    borderWidth: 1, borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOpacity: 0.40, shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 }, elevation: 10,
  },

  // Canvas
  emptyCanvas: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 60 },
  emptyTxt:    { fontSize: 16, fontWeight: "800", color: DIM, marginTop: 12 },
  emptySub:    { fontSize: 12, color: DIM, textAlign: "center", marginTop: 6, lineHeight: 18 },

  // Status legend
  legend:      { flexDirection: "row", backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingVertical: 7, gap: 14, flexWrap: "wrap" },
  legendItem:  { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot:   { width: 8, height: 8, borderRadius: 4 },
  legendTxt:   { fontSize: 10, color: GRAY, fontWeight: "600" },

  // Bottom toolbar
  bottomBar:   { backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, paddingHorizontal: 14 },
  modeRow:       { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 8 },
  modeBtnGroup:  { flex: 1, flexDirection: "row", gap: 6 },
  modeBtn:       { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: BORDER },
  modeBtnActive: { backgroundColor: ACCENT, borderColor: ACCENT },
  modeTxt:       { fontSize: 11, fontWeight: "700", color: GRAY, letterSpacing: 0.5, flexShrink: 1 },
  modeTxtActive: { color: "#fff" },
  resListBtn:    { flexShrink: 0, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 11, backgroundColor: ACCENT + "18", borderWidth: 1, borderColor: ACCENT + "44" },
  resListTxt:    { fontSize: 12, fontWeight: "700", color: ACCENT },

  // Editor: primary row — full-width "+ ELEMENTO"
  addBtnFull:  { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13, marginBottom: 8 },
  addTxtFull:  { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.8 },
  // Editor: secondary row — tools + save
  toolsRow:    { flexDirection: "row", gap: 8, alignItems: "center", marginBottom: 4 },
  toolBtn:     { width: 38, height: 38, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: BORDER },
  tplBtn:      { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 9, borderRadius: 11, borderWidth: 1.5, borderColor: "#7C69BE44", backgroundColor: "#7C69BE11" },
  tplTxt:      { color: "#7C69BE", fontWeight: "800", fontSize: 11, letterSpacing: 0.4 },
  saveBtn:     { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 16, paddingVertical: 9, backgroundColor: "#22C55E", borderRadius: 11 },
  saveTxt:     { color: "#fff", fontWeight: "900", fontSize: 13, letterSpacing: 0.6 },
  clientHint:  { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 6, paddingHorizontal: 4, marginBottom: 4 },
  clientHintTxt: { color: ACCENT, fontSize: 12, fontWeight: "600", flex: 1 },

  nextStepBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: ACCENT, borderRadius: 14, paddingVertical: 13, marginTop: 8, marginBottom: 2 },
  nextStepTxt: { color: "#fff", fontWeight: "900", fontSize: 15, letterSpacing: 0.8 },
});

// Element type selector styles
const sel = StyleSheet.create({
  overlay:   { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  backdrop:  { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.38)" },
  sheet:     { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 28 },
  handleBar: { width: 38, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10, marginBottom: 14 },
  title:     { fontSize: 15, fontWeight: "900", color: TEXT, textAlign: "center", letterSpacing: 0.8, marginBottom: 2 },
  sub:       { fontSize: 12, color: GRAY, textAlign: "center", marginBottom: 16 },
  grid:      { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "center" },
  typeCard:  { width: (SW - 64) / 3, alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1.5, backgroundColor: "#FAFBFF" },
  typeIcon:  { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  typeLabel: { fontSize: 12, fontWeight: "700", textAlign: "center" },
  cancelBtn: { marginTop: 16, alignItems: "center", padding: 12 },
  cancelTxt: { fontSize: 14, color: GRAY, fontWeight: "600" },
});

// Element editor styles
const ed = StyleSheet.create({
  overlay:     { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  backdrop:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.25)" },
  sheet:       { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 28 },
  handleBar:   { width: 38, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10, marginBottom: 12 },
  headerRow:   { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 14 },
  editorHint:  { fontSize: 11, color: DIM, fontWeight: "600" },
  typePill:    { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  typePillTxt: { fontSize: 12, fontWeight: "700" },
  fieldRow:    { marginBottom: 12 },
  fieldLabel:  { fontSize: 11, fontWeight: "700", color: GRAY, marginBottom: 5, letterSpacing: 0.4 },
  input:       { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, color: TEXT, backgroundColor: "#FAFBFF" },
  numRow:      { flexDirection: "row", alignItems: "center", gap: 12 },
  numBtn:      { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: ACCENT + "55", backgroundColor: ACCENT + "12", alignItems: "center", justifyContent: "center" },
  numVal:      { fontSize: 16, fontWeight: "800", color: TEXT, minWidth: 32, textAlign: "center" },
  statusPicker:{ flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 10, borderWidth: 1.5 },
  statusDot:   { width: 10, height: 10, borderRadius: 5 },
  statusTxt:   { flex: 1, fontSize: 13, fontWeight: "700" },
  statusDropdown: { borderWidth: 1, borderColor: BORDER, borderRadius: 12, overflow: "hidden", marginBottom: 12 },
  statusOption:   { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: BORDER },
  statusOptionTxt: { flex: 1, fontSize: 13, fontWeight: "600" },
  actions:     { flexDirection: "row", gap: 10, marginBottom: 12 },
  actionBtn:   { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5 },
  actionTxt:   { fontSize: 12, fontWeight: "700" },
  saveBtn:     { backgroundColor: ACCENT, borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14 },
  saveTxt:     { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.8 },
});

// Selected element bar styles
const seb = StyleSheet.create({
  bar:     { flexDirection: "row", alignItems: "center", backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER, paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
  name:    { fontSize: 14, fontWeight: "800", color: TEXT },
  dot:     { width: 8, height: 8, borderRadius: 4 },
  status:  { fontSize: 11, fontWeight: "700" },
  cap:     { fontSize: 11, color: DIM, fontWeight: "600" },
  bookBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: "#22C55E", borderRadius: 10 },
  bookTxt: { color: "#fff", fontWeight: "800", fontSize: 12 },
  editBtn: { width: 34, height: 34, borderRadius: 10, backgroundColor: ACCENT + "18", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: ACCENT + "33" },
  closeBtn:{ width: 30, height: 30, borderRadius: 10, backgroundColor: "#F3F4F6", alignItems: "center", justifyContent: "center" },
});

// Mass duplicate modal styles
const md = StyleSheet.create({
  overlay:      { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 300 },
  backdrop:     { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.40)" },
  sheet:        { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 32 },
  handleBar:    { width: 38, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10, marginBottom: 18 },
  titleRow:     { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 20 },
  titleIcon:    { width: 42, height: 42, borderRadius: 13, backgroundColor: "#8B5CF611", borderWidth: 1.5, borderColor: "#8B5CF644", alignItems: "center", justifyContent: "center" },
  title:        { fontSize: 14, fontWeight: "900", color: TEXT, letterSpacing: 0.8 },
  sub:          { fontSize: 13, color: GRAY, fontWeight: "600", marginTop: 1 },
  fieldLabel:   { fontSize: 10, fontWeight: "900", color: GRAY, letterSpacing: 1.5, marginBottom: 10 },
  countRow:     { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: 20 },
  countBtn:     { width: 50, height: 50, borderRadius: 14, borderWidth: 1.5, borderColor: "#8B5CF644", backgroundColor: "#8B5CF611", alignItems: "center", justifyContent: "center" },
  countInput:   { fontSize: 42, fontWeight: "900", color: TEXT, minWidth: 90, textAlign: "center", borderBottomWidth: 2.5, borderBottomColor: "#8B5CF6", paddingBottom: 2 },
  previewBox:   { backgroundColor: "#F3F4F6", borderRadius: 14, padding: 14, marginBottom: 20, gap: 4 },
  previewLabel: { fontSize: 10, fontWeight: "800", color: GRAY, letterSpacing: 1.2 },
  previewNames: { fontSize: 14, fontWeight: "700", color: TEXT },
  previewHint:  { fontSize: 11, color: DIM, fontWeight: "500", marginTop: 2 },
  confirmBtn:   { backgroundColor: "#8B5CF6", borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 15, marginBottom: 8 },
  confirmTxt:   { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.8 },
  cancelBtn:    { alignItems: "center", paddingVertical: 10 },
  cancelTxt:    { color: GRAY, fontSize: 13, fontWeight: "600" },
});

// Split reservations panel styles
const sp = StyleSheet.create({
  root:      { backgroundColor: CARD, borderTopWidth: 1, borderTopColor: BORDER },
  header:    { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: BORDER },
  headerTxt: { flex: 1, fontSize: 11, fontWeight: "900", color: TEXT, letterSpacing: 1.2 },
  count:     { fontSize: 12, fontWeight: "800", color: ACCENT, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: ACCENT + "18", borderRadius: 8 },
  empty:     { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 16 },
  emptyTxt:  { fontSize: 12, color: DIM, fontWeight: "600" },
  row:       { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#FAFBFF", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: BORDER },
  dot:       { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  name:      { fontSize: 13, fontWeight: "700", color: TEXT },
  sub:       { fontSize: 11, color: GRAY, fontWeight: "500", marginTop: 1 },
});

// Client booking sheet styles
const cb = StyleSheet.create({
  overlay:    { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  backdrop:   { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.38)" },
  sheet:      { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingHorizontal: 16, paddingBottom: 32 },
  handleBar:  { width: 38, height: 4, borderRadius: 2, backgroundColor: "#ddd", alignSelf: "center", marginTop: 10, marginBottom: 14 },
  title:      { fontSize: 17, fontWeight: "900", color: TEXT },
  sub:        { fontSize: 12, color: GRAY, marginBottom: 14 },
  statusDot:  { width: 10, height: 10, borderRadius: 5 },
  statusPill: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  statusLbl:  { fontSize: 10, fontWeight: "700" },
  banner:     { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 16 },
  bannerTxt:  { fontSize: 13, fontWeight: "600", flex: 1 },
  field:      { marginBottom: 10 },
  label:      { fontSize: 11, fontWeight: "700", color: GRAY, marginBottom: 4 },
  input:      { borderWidth: 1.5, borderColor: BORDER, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 14, color: TEXT },
  confirmBtn:        { backgroundColor: "#22C55E", borderRadius: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 14, marginTop: 6 },
  confirmTxt:        { color: "#fff", fontWeight: "900", fontSize: 14, letterSpacing: 0.8 },
  closeBtn:          { alignItems: "center", paddingVertical: 12 },
  closeTxt:          { fontSize: 13, color: GRAY, fontWeight: "600" },
  dateStripContent:  { gap: 8, paddingVertical: 4, paddingHorizontal: 2 },
  dateChip:          { width: 46, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1.5, borderColor: BORDER, backgroundColor: "#F9F9F9" },
  dateChipActive:    { borderColor: "#22C55E", backgroundColor: "#22C55E18" },
  dateChipWeekday:   { fontSize: 10, fontWeight: "600", color: GRAY, marginBottom: 4 },
  dateChipNum:       { fontSize: 16, fontWeight: "800", color: TEXT },
  dateChipActiveTxt: { color: "#22C55E" },
});
