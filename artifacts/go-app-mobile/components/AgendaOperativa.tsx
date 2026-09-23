import AsyncStorage from "@react-native-async-storage/async-storage";
import { useLanguage } from "@/contexts/LanguageContext";
import { Feather } from "@expo/vector-icons";
import { Business } from "@/data/booking";
import {
  WeatherContextData,
  WeatherDayData,
  getWeatherColor,
  getWeatherFeatherIcon,
  getWeatherForHour,
  isAdverseWeather,
  useWeatherContext,
} from "../hooks/useWeatherContext";
import {
  computeDaySuggestions,
  getSuggestionChipMeta,
} from "../hooks/usePredictive";
import {
  isReceptionActivity,
  getReceptionStatus,
  getReceptionStatusColor,
  formatCountdownLabel,
} from "../hooks/useReceptionCountdown";
import * as Haptics from "expo-haptics";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ViewStyle,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView as GHScrollView,
} from "react-native-gesture-handler";
import ReAnimated, {
  interpolateColor,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatDayLabel, formatISODate, getDayOffset, getToday } from "../lib/time";
import { CalSizeKey, getCalColumnW, DEFAULT_GO_RENDER_PRESET } from "../constants/goSizes";
import { trSector } from "@/data/goSectorTranslations";

export type GoEntry = {
  id: string;
  kind: "sent" | "received";
  intentKey: string;
  intentLabel: string;
  color: string;
  place: string;
  date: string;
  // Fecha canónica YYYY-MM-DD. SOURCE OF TRUTH para programar,
  // ordenar y transmitir el GO. El campo `date` (string humano)
  // queda solo para visualizar en la UI clásica.
  dateISO: string;
  time: string;
  duration: string;
  contactName: string;
  phone: string;
  estado: "pendiente" | "aceptado" | "rechazado" | "propuesto" | "propuesta_pendiente";
  createdAt?: number;
  // Soft-delete: cuando es true el GO se mueve a la vista
  // "Eliminados" del listado en lugar de borrarse de verdad. Desde
  // ahí el usuario puede recuperarlo (volver a "pendiente") o
  // aceptarlo (queda como "aceptado" y se restaura).
  deleted?: boolean;
  // ── ENVÍO MÚLTIPLE + CUPO LIMITADO ─────────────────────────────
  // Cuando el GO se envía a varias personas, cada destinatario
  // queda registrado aquí con su propio estado. Si `recipients` no
  // está definido o es vacío, el GO se comporta como un GO normal
  // de un solo destinatario (compatibilidad con entries antiguos).
  recipients?: Array<{
    name: string;
    phone: string;
    estado: "pending" | "accepted" | "rejected" | "blocked_by_limit";
  }>;
  // Tope opcional de aceptados. Si está definido, en cuanto los
  // `accepted` igualen este número, los pendientes restantes pasan
  // a `blocked_by_limit` automáticamente y `cupoCerrado` se marca.
  maxAccepted?: number;
  // Marca interna que indica que el cupo está cerrado y no se
  // aceptan más respuestas (para mostrar "Cupo completo").
  cupoCerrado?: boolean;
  // ── ACCIONES AVANZADAS ─────────────────────────────────────────
  // Tipo de acción. Si no está definido, equivale a "GO" (compat).
  //   · GO       → mensaje WhatsApp con fecha/hora y respuesta
  //   · TAREA    → solo se registra, sin envío (no abre WhatsApp)
  //   · LLAMADA  → abre el marcador del teléfono (tel:)
  //   · WHATSAPP → idéntico a GO; alias para chats puntuales
  type?: "GO" | "TAREA" | "LLAMADA" | "WHATSAPP" | "GO_BOOKING" | "GO_INTERNO" | "GO_EXT" | "TAREA_INTERNA" | "GO_RESERVA";
  // Quién creó el GO. Si no está, se asume "Yo" (auto-creado).
  createdBy?: string;
  // A quién está asignada la EJECUCIÓN del GO. Si difiere del
  // creador, el GO se considera "para terceros" y se muestra una
  // etiqueta en la tarjeta. Si no está, se asume el ejecutor = creador.
  assignedTo?: string;
  // Programación: si `sendAt` existe y `scheduled === true`, el GO
  // NO se envía hasta que `Date.now() >= sendAt`. El motor de envío
  // (`scheduleGoSend`) se encarga de disparar el envío real cuando
  // llega el momento, marcando `scheduled = false` y `sentAt`.
  sendAt?: number;
  sentAt?: number;
  scheduled?: boolean;
  // ── NOTAS LIBRES + GO GENÉRICO + PROPONER CAMBIO ───────────────
  // Título operativo corto (máx 1 línea visual en tarjeta).
  // Se muestra en la tarjeta y viaja en el mensaje al receptor.
  notes?: string;
  // Nota interna — texto largo, contextual, no viaja con el GO salvo
  // que sea NOTA_INTERNA. Solo visible en la ficha expandida.
  detail?: string;
  // Visibilidad del GO — controla quién puede ver esta entrada.
  // 'publico': cualquier usuario.  'clientes': solo clientes autorizados.
  // 'proveedores': solo proveedores.  'interno': solo miembros internos.
  // 'privado': solo el creador (invisible para el resto).
  visibility?: 'publico' | 'clientes' | 'proveedores' | 'interno' | 'privado';
  // Sugerencia/recomendación seleccionada en el panel "Sugerir opciones".
  // Viaja con el mensaje y queda guardada en la tarjeta del GO.
  sugerencia?: string;
  // Mensajes/notas asociados a este GO. Cada mensaje incluye quién
  // lo envió, cuándo, y por qué canal. Nunca existe una nota sin goId.
  messages?: Array<{
    id: string;
    text: string;
    goId: string;
    senderId: "yo" | string;
    createdAt: number;
    deliveryMode: "internal" | "whatsapp";
  }>;
  // ID compartido del chat interno de reserva. Vincula entradas de
  // cliente y empresa que representan la misma reserva para que ambos
  // lados lean y escriban en la misma conversación compartida.
  sharedChatId?: string;
  // Marca un GO sin categoría concreta. Cuando es true, el
  // intentLabel se persiste como "GENÉRICO" y el color es neutro.
  // Las `notes` actúan como descripción principal del GO.
  isGeneric?: boolean;
  // Propuesta de cambio del receptor. Si está poblada, el GO
  // queda en estado funcional "proposed_change" (que se mapea al
  // estado existente "propuesto" del modelo de aceptación, sin
  // romper la lógica). El creador puede aceptar o rechazar la
  // propuesta desde la tarjeta.
  proposal?: {
    date?: string;
    dateISO?: string;
    time?: string;
    duration?: string;
    place?: string;
    note?: string;
    proposedAt: number;
  };
  // Propuesta de cambio bilateral: guarda el nuevo slot sin mover la tarjeta.
  // La entrada permanece en su hueco original; aparece un ghost naranja en el
  // slot propuesto en ambos calendarios. Emisor → "Esperando respuesta".
  // Receptor → botones Aceptar / Rechazar.
  // Al aceptar: dateISO/date/time se actualizan al nuevo slot, se borra changeProposal.
  // Al rechazar: se restauran los valores originales, se borra changeProposal.
  changeProposal?: {
    dateISO: string;
    date: string;
    time: string;
    duration?: string;
    place?: string;
    note?: string;
    proposedAt: number;
    originalDateISO: string;
    originalDate: string;
    originalTime: string;
    originalDuration?: string;
  };
  // Vincula dos entries (cliente + empresa) a la misma reserva compartida.
  reservationId?: string;
  // Estado compartido de la reserva GO_BOOKING — se sincroniza entre
  // la entrada de cliente (go_booking_cli_<id>) y la de empresa
  // (go_booking_prv_<id>) y con el registro en go_bookings_v1.
  // Independiente del `estado` general del GO (pendiente/aceptado/rechazado).
  bookingStatus?: "pendiente" | "confirmada" | "cancelada" | "cambio_pendiente" | "completada";
  // ── TELEFONÍA BILATERAL ─────────────────────────────────────────
  // Para GOs coordinados (enviados o recibidos) guardamos ambos extremos
  // y la dirección desde el punto de vista del usuario actual.
  // Esto permite calcular a quién enviar una propuesta de cambio sin
  // depender de la lógica "sender ↔ receiver" del backend.
  senderPhone?: string;
  receiverPhone?: string;
  direction?: "incoming" | "outgoing" | "self";
  // ── ALERTAS Y RECORDATORIOS (BLOQUE 4) ────────────────────────
  // `reminders` = lista de minutos antes del GO en los que se debe
  // disparar una alerta. Por defecto [60, 15] (1h y 15min antes).
  // Se permiten hasta 3 entradas. El motor (poll cada 30s) compara
  // estos offsets con `dateISO + time` y dispara cuando llega el
  // momento. Persistido tal cual.
  reminders?: number[];
  // Flag por GO. Si false, las alertas de este GO se silencian sin
  // borrar la configuración (útil para un mute puntual).
  notificationsEnabled?: boolean;
  // Histórico de qué offsets ya se han disparado para este GO en
  // esta instalación; evita re-disparar la misma alerta si el motor
  // hace varios ticks dentro de la ventana de disparo.
  firedReminderMins?: number[];
  // Snooze: cuando el usuario pospone, guardamos un timestamp UNIX
  // ms a partir del cual debe sonar UNA vez más, indistintamente
  // de la fecha real del GO. Se limpia tras dispararse.
  snoozeUntil?: number;

  whatsapp?: string;
  professionalName?: string;
  professionalId?: string;
  bookingMessageToStaff?: string;
  staffId?: string;
  slotKey?: string;
  businessId?: string;
  serviceId?: string;
  startTime?: string;
  endTime?: string;
};

// ── Badge label + color for each card type ─────────────────────────
export function getCardBadge(item: GoEntry): { label: string; color: string } {
  const t = item.type || "";
  if (t === "GO_INTERNO")    return { label: "GO.INT",   color: "#00e5ff" };
  if (t === "TAREA_INTERNA") return { label: "TAREA.INT",color: "#fb923c" };
  if (t === "TAREA")         return { label: "TAREA.EXT",color: "#fb923c" };
  if (t === "LLAMADA")       return { label: "LLAM",     color: "#a78bfa" };
  if (t === "WHATSAPP")      return { label: "WA",       color: "#25D366" };
  if (item.isGeneric)        return { label: "TAREA",    color: "#94a3b8" };
  if (item.kind === "received") return { label: "GO↙EXT",color: "#FFD700" };
  return { label: "GO.EXT", color: "#00e5ff" };
}

type Column = {
  id: string;
  label: string;
  dayName?: string;
  dayDate?: string;
  dateISO?: string;
  isRetrasados?: boolean;
  isCustom?: boolean;
  isEliminados?: boolean;
};

export type CalDayNightMode = "claro" | "oscuro" | "mixto";

export type BookingChatMessage = {
  messageId: string;
  senderType: "cliente" | "empresa";
  senderName: string;
  text: string;
  createdAt: number;
};

export type AgendaBoardProps = {
  selection?: {
    selectedIds: Set<string>;
    setSelectedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
    selectionMode: boolean;
    setSelectionMode: React.Dispatch<React.SetStateAction<boolean>>;
  };
  goLog: GoEntry[];
  selectedDateISO?: string;
  sortOrder?: "asc" | "desc";
  onToggleSortOrder?: () => void;
  onSelectDay?: (dateISO: string) => void;
  onAddEntry?: (dateISO: string) => void;
  onSelectItem?: (item: GoEntry) => void;
  onMoveItem?: (id: string, newDateISO: string, newTime: string) => void;
  onOpenMoveFlow?: (itemId: string, toDateISO: string, fromDateISO: string, itemTime: string, isExternal: boolean) => void;
  onCompleteItem?: (id: string) => void;
  onChangeEstado?: (id: string, estado: GoEntry["estado"]) => void;
  onDeleteItem?: (id: string) => void;
  onProposeItem?: (id: string) => void;
  onOpenMessage?: (item: GoEntry) => void;
  onSaveBookingMessage?: (id: string, msg: string) => void;
  goChats?: Record<string, BookingChatMessage[]>;
  onSendGoChat?: (entryId: string, chatKey: string, text: string, senderType: "cliente" | "empresa") => void;
  embedded?: boolean;
  style?: ViewStyle;
  calSizeKey?: CalSizeKey;
  viewMode?: "semana" | "mes_lineal" | "dia";
  calViewMonth?: string;
  onChangeMonth?: (dir: 1 | -1) => void;
  showHours?: boolean;
  density?: "auto" | "1h" | "30min" | "15min";
  weatherHours?: WeatherContextData["weatherHours"];
  weatherDays?: WeatherContextData["weatherDays"];
  /** false = GPS denied; shows subtle fallback indicator instead of weather data */
  hasLocation?: boolean;
  officeMode?: boolean;
  /** Modo visual día/noche: claro=siempre blanco, oscuro=siempre negro, mixto=automático por hora. */
  calDayNightMode?: CalDayNightMode;
  /** Incrementar este token fuerza un scroll inmediato a HOY (columna actual + hora). */
  scrollToTodayToken?: number;
  /** Saltar a una fecha y hora específica (cambiar token para disparar). */
  scrollToDateToken?: { dateISO: string; timeHHMM: string; token: number };
  /** ID de la entrada que debe iluminarse suavemente al llegar al calendario. */
  highlightEntryId?: string;
  onAcceptProposal?: (id: string) => void;
  onRejectProposal?: (id: string) => void;
  onProposeProposal?: (id: string) => void;
  onGoToLanding?: () => void;
};

type FullProps = AgendaBoardProps & {
  visible: boolean;
  onClose: () => void;
  calSizeKey?: CalSizeKey;
  initialView?: "semana" | "mes_lineal" | "dia";
  /** Controlled: el padre gestiona la densidad de franjas horarias y la persiste. */
  onDensityChange?: (d: DensityKey) => void;
  /** Controlled: el padre gestiona mostrar/ocultar franjas horarias y lo persiste. */
  onShowHoursChange?: (v: boolean) => void;
  /** Callback cuando el usuario cambia el modo día/noche dentro del modal. */
  onCalDayNightModeChange?: (mode: CalDayNightMode) => void;
};

const COLUMN_W = 176;

const SHORT_DAY_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
const SHORT_DAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

const MONTH_NAMES_EN = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export type DensityKey = "auto" | "1h" | "30min" | "15min";

function getEffectiveDensityMin(density: DensityKey, timedTaskCount: number): 60 | 30 | 15 {
  if (density === "1h") return 60;
  if (density === "30min") return 30;
  if (density === "15min") return 15;
  // AUTO: adapt based on task volume
  if (timedTaskCount <= 3) return 60;
  if (timedTaskCount <= 8) return 30;
  return 15;
}

// Returns 0 (full night) → 1 (full day) for a given slot start minute,
// with 45-minute smooth transitions around sunrise and sunset.
function getSlotDayNightProgress(slotMid: number, sunriseMin: number, sunsetMin: number): number {
  const T = 45;
  if (slotMid <= sunriseMin - T) return 0;
  if (slotMid >= sunsetMin  + T) return 0;
  if (slotMid >= sunriseMin + T && slotMid <= sunsetMin - T) return 1;
  if (slotMid < sunriseMin + T) return (slotMid - (sunriseMin - T)) / (T * 2);
  return 1 - (slotMid - (sunsetMin - T)) / (T * 2);
}

// CALENDARIO MIXTO POR HORAS:
// Cada franja tiene su propio fondo sólido según el momento del día.
// Noche = negro real. Día = blanco real. Sin capas ni simulaciones.
function slotDayNightStyle(progress: number): { backgroundColor: string } {
  if (progress <= 0.18) return { backgroundColor: "#060608" };  // noche: negro real
  if (progress >= 0.82) return { backgroundColor: "#ffffff" };  // día: blanco real
  // Transición suave: interpolación directa entre negro y blanco
  const v = Math.round(6 + progress * (255 - 6));
  return { backgroundColor: `rgb(${v},${v},${v})` };
}
// Texto se adapta al fondo: negro sobre blanco, blanco sobre negro.
function slotLabelColor(progress: number): string {
  if (progress >= 0.82) return "#1a1a1a"; // día: negro real
  if (progress <= 0.18) return "#f0f0f0"; // noche: blanco real
  // Transición: texto claro cuando el fondo es oscuro y viceversa
  return progress >= 0.5 ? "#1a1a1a" : "#f0f0f0";
}
// Línea separadora adaptada al fondo de la franja.
function slotLineColor(progress: number): string {
  if (progress >= 0.82) return "rgba(0,0,0,0.12)";        // día: línea oscura sutil
  if (progress <= 0.18) return "rgba(255,255,255,0.12)";  // noche: línea clara sutil
  return progress >= 0.5 ? "rgba(0,0,0,0.10)" : "rgba(255,255,255,0.10)";
}
// ── GO Card Contrast System ───────────────────────────────────────────────────
// Garantiza legibilidad absoluta en cualquier fondo (noche, amanecer, día).
// PROHIBIDO: gris sobre gris / gris sobre negro / gris sobre blanco.
// Elige automáticamente la combinación con mayor ratio de contraste WCAG.
//
// Política de color de check de servicio (global GO):
//   ● punto       = seleccionable
//   ✔ blanco      = contratado / pendiente de pago
//   ✔ verde       = pagado
//   ✔ rojo        = incidencia
// ─────────────────────────────────────────────────────────────────────────────
function _toLinear(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}
function _getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * _toLinear(r) + 0.7152 * _toLinear(g) + 0.0722 * _toLinear(b);
}
function _parseColor(bg: string): [number, number, number] {
  // rgb(r,g,b)
  const m = bg.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/);
  if (m) return [+m[1], +m[2], +m[3]];
  // #rrggbb or #rgb
  if (bg.startsWith("#")) {
    const h = bg.slice(1);
    if (h.length === 3)
      return [parseInt(h[0]+h[0],16), parseInt(h[1]+h[1],16), parseInt(h[2]+h[2],16)];
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  return [6, 6, 8]; // fallback near-black
}
function _contrastRatio(l1: number, l2: number): number {
  const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}
/**
 * getGoCardContrast — devuelve la tarjeta de máximo contraste para el fondo dado.
 * Las tarjetas GO JAMÁS serán grises. Solo blanco (#FFFFFF) o negro (#111111).
 */
function getGoCardContrast(slotBackground: string): {
  backgroundCard: string;
  textColor: string;
  textSecondary: string;
  textMuted: string;
  divider: string;
  isCardDark: boolean;
} {
  const [r, g, b] = _parseColor(slotBackground);
  const bgLum     = _getLuminance(r, g, b);
  const whiteLum  = 1.0;          // #FFFFFF
  const darkLum   = _getLuminance(17, 17, 17); // #111111

  const contrastWhite = _contrastRatio(bgLum, whiteLum);
  const contrastDark  = _contrastRatio(bgLum, darkLum);

  if (contrastDark > contrastWhite) {
    // Tarjeta oscura (#111111) contrasta más → fondo oscuro del slot
    return {
      backgroundCard: "#111111",
      textColor:      "#FFFFFF",
      textSecondary:  "rgba(255,255,255,0.82)",
      textMuted:      "rgba(255,255,255,0.52)",
      divider:        "rgba(255,255,255,0.12)",
      isCardDark:     true,
    };
  }
  // Tarjeta blanca (#FFFFFF) contrasta más → fondo claro del slot
  return {
    backgroundCard: "#FFFFFF",
    textColor:      "#111827",
    textSecondary:  "rgba(0,0,0,0.72)",
    textMuted:      "rgba(0,0,0,0.52)",
    divider:        "rgba(0,0,0,0.08)",
    isCardDark:     false,
  };
}

// Icono por franja: luna de noche con cielo despejado, clima real el resto.
function getSlotIcon(code: number, isNight: boolean): string {
  if (isNight && code <= 1) return "moon";
  return getWeatherFeatherIcon(code);
}
// Color natural del icono según clima y período.
function getSlotIconColor(code: number, isNight: boolean): string {
  if (isNight && code <= 1) return "#8899cc"; // luna: gris-azul frío
  return getWeatherColor(code);
}

// ── Weather-sensitive activities ─────────────────────────────────────────────
// Keywords matched against intentKey + intentLabel (lowercase, partial match).
const WEATHER_SENSITIVE_KEYWORDS = [
  "bicicleta", "bike", "bicycle", "ciclismo",
  "caminar", "walk", "caminata",
  "correr", "run", "jogging",
  "deporte", "sport", "entreno", "entrenamiento",
  "exterior", "outdoor", "afuera",
  "viaje", "viajes", "travel", "excursion", "excursión",
  "visita", "visitas", "visit",
  "entrega", "entregas", "delivery", "reparto",
  "colegio", "escuela", "school", "niños", "ninos", "kids",
  "senderismo", "hiking", "trekking",
  "playa", "beach", "parque", "park",
  "trabajo exterior", "obra", "construcción",
];

function isWeatherSensitiveActivity(intentKey: string, intentLabel: string): boolean {
  const combined = `${intentKey} ${intentLabel}`.toLowerCase();
  return WEATHER_SENSITIVE_KEYWORDS.some((kw) => combined.includes(kw));
}


interface DayColI18n {
  today: string;
  tomorrow: string;
  shortDays: readonly string[];
  deleted: string;
  pending: string;
}
const DAY_COL_ES: DayColI18n = { today: "HOY", tomorrow: "MAÑANA", shortDays: SHORT_DAY_ES, deleted: "ELIMINADOS", pending: "PENDIENTES" };
const DAY_COL_EN: DayColI18n = { today: "TODAY", tomorrow: "TMRW", shortDays: SHORT_DAY_EN, deleted: "DELETED", pending: "PENDING" };

function getDayColumns(i18n: DayColI18n = DAY_COL_ES): Column[] {
  const cols: Column[] = [
    { id: "retrasados", label: i18n.pending, isRetrasados: true },
  ];
  for (let i = 0; i <= 6; i++) {
    const d = getDayOffset(i);
    const iso = formatISODate(d);
    const dayNum = d.getDate();
    const monNum = d.getMonth() + 1;
    const dayDate = `${String(dayNum).padStart(2, "0")}/${String(monNum).padStart(2, "0")}`;
    const dayName = i === 0 ? i18n.today : i === 1 ? i18n.tomorrow : i18n.shortDays[d.getDay()];
    const label = i === 0 ? i18n.today : i === 1 ? i18n.tomorrow : `${i18n.shortDays[d.getDay()]} ${dayDate}`;
    cols.push({ id: `day_${iso}`, label, dayName, dayDate, dateISO: iso });
  }
  cols.push({ id: "eliminados", label: i18n.deleted, isEliminados: true });
  return cols;
}

function getMonthColumns(yearMonth: string, shortDays: readonly string[] = SHORT_DAY_ES, todayLabel = "HOY"): Column[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const todayISO = formatISODate(getToday());
  const cols: Column[] = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(year, month - 1, day);
    const iso = formatISODate(d);
    const dayDate = `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`;
    const dayName = iso === todayISO ? todayLabel : shortDays[d.getDay()];
    const label = iso === todayISO ? todayLabel : `${shortDays[d.getDay()]} ${dayDate}`;
    cols.push({ id: `day_${iso}`, label, dayName, dayDate, dateISO: iso });
  }
  return cols;
}

function getCurrentYearMonth(): string {
  const d = getToday();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const MONTH_NAMES_ES = [
  "Enero","Febrero","Marzo","Abril","Mayo","Junio",
  "Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre",
];

function isOverdue(g: GoEntry): boolean {
  if (g.deleted) return false;
  if (g.estado === "aceptado") return false;
  if (g.estado === "rechazado") return false;
  // Propuestas de cambio pendientes de confirmación → ya tienen fecha/hora asignada,
  // no deben aparecer en Pendientes aunque la hora haya pasado.
  if (g.estado === "propuesta_pendiente") return false;
  if (g.estado === "propuesto") return false;
  if (!g.dateISO) return true; // Sin fecha → pendiente de ubicar en el tiempo
  const todayISO = formatISODate(getToday());
  if (g.dateISO < todayISO) return true;   // fecha pasada → siempre vencida
  if (g.dateISO > todayISO) return false;  // fecha futura → nunca vencida
  // Mismo día: comparar hora exacta
  if (!g.time) return false;               // sin hora → no vencida (todo el día)
  const tm = g.time.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return false;
  const now = new Date();
  const goMinutes = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  return goMinutes < nowMinutes;
}

function isInDay(g: GoEntry, dateISO: string): boolean {
  if (g.deleted || g.estado === "rechazado") return false;
  if (g.dateISO === dateISO) return true;
  return false;
}

function isEliminated(g: GoEntry): boolean {
  if (!(g.deleted || g.estado === "rechazado")) return false;
  if (!g.dateISO) return true;
  const todayISO = formatISODate(getToday());
  const cutoff = new Date(todayISO + "T00:00:00");
  cutoff.setDate(cutoff.getDate() - 7);
  const cutoffISO = formatISODate(cutoff);
  return g.dateISO >= cutoffISO;
}

function sortByTime(items: GoEntry[], order: "asc" | "desc" = "asc"): GoEntry[] {
  const dir = order === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const aHasTime = !!a.time;
    const bHasTime = !!b.time;
    // Items with a scheduled time always come before items without one (in asc),
    // so the daily timeline stays at the top and untimed entries sit below it.
    if (aHasTime !== bHasTime) return aHasTime ? -dir : dir;
    // Both have time → sort by HH:MM string.
    if (aHasTime && bHasTime) {
      const timeCmp = a.time!.localeCompare(b.time!);
      if (timeCmp !== 0) return timeCmp * dir;
    }
    // Tiebreaker (same time or both without time): sort by creation date.
    // asc = oldest first (top), desc = newest first (top).
    const aTs = a.createdAt ?? 0;
    const bTs = b.createdAt ?? 0;
    return (aTs - bTs) * dir;
  });
}

function formatTimeDisplay(t: string): string {
  if (!t) return "";
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  const h = parseInt(m[1], 10);
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function estadoColor(estado: string): string {
  switch (estado) {
    case "aceptado": return "#6ee7b7";
    case "rechazado": return "#FF0000";
    case "propuesto":
    case "propuesta_pendiente": return "#FF8C00";
    default: return "#FFD700";
  }
}

function estadoLabel(estado: string, lang?: string): string {
  switch (estado) {
    case "aceptado": return "OK";
    case "rechazado": return "NO";
    case "propuesto":
    case "propuesta_pendiente": return lang === "en" ? "PRO" : "PROP";
    default: return lang === "en" ? "PND" : "PTE"; // uses status_prop / status_pte from t() where t is available
  }
}

const ESTADO_OPTIONS: Array<{ key: GoEntry["estado"]; icon: string; iconInactive: string; color: string }> = [
  { key: "rechazado", icon: "trash-2",      iconInactive: "trash-2",   color: "#FF0000" },
  { key: "propuesto", icon: "refresh-cw",   iconInactive: "circle",    color: "#FF8C00" },
  { key: "pendiente", icon: "mail",         iconInactive: "mail",      color: "#FFD700" },
  { key: "aceptado",  icon: "check-circle", iconInactive: "circle",    color: "#6ee7b7" },
];

function resolveEstado(
  current: GoEntry["estado"],
  requested: GoEntry["estado"],
): GoEntry["estado"] {
  // Rechazado → Aceptado requires re-negotiation → pass through Propuesto
  if (
    (current === "rechazado") &&
    requested === "aceptado"
  ) return "propuesto";
  return requested;
}

export function AgendaBoard({
  selection,
  goLog,
  selectedDateISO,
  sortOrder = "asc",
  onToggleSortOrder,
  onSelectDay,
  onAddEntry,
  onSelectItem,
  onMoveItem,
  onOpenMoveFlow,
  onCompleteItem,
  onChangeEstado,
  onDeleteItem,
  onProposeItem,
  onOpenMessage,
  onSaveBookingMessage,
  goChats,
  onSendGoChat,
  embedded = false,
  style,
  calSizeKey = DEFAULT_GO_RENDER_PRESET.calSize,
  viewMode = "semana",
  calViewMonth,
  onChangeMonth,
  showHours = true,
  density = "auto",
  weatherHours = {},
  weatherDays = {},
  hasLocation = true,
  officeMode = false,
  calDayNightMode = "mixto",
  scrollToTodayToken = 0,
  scrollToDateToken,
  highlightEntryId,
  onAcceptProposal,
  onRejectProposal,
  onProposeProposal,
  onGoToLanding,
}: AgendaBoardProps) {
  const todayISO = formatISODate(getToday());
  const { lang, t } = useLanguage();
  // Traduce intentKey estable ("comida", "viaje"…) → etiqueta localizada.
  // Cubre entradas antiguas que puedan tener intentLabel en otro idioma.
  const translateIntentKey = (key: string): string | null => {
    const map: Record<string, string> = {
      reunion:  t('intent_reunion'),
      comida:   t('intent_comida'),
      cafe:     t('intent_cafe'),
      viaje:    t('intent_viaje'),
      fiesta:   t('intent_fiesta'),
      deporte:  t('intent_deporte'),
      shopping: t('intent_shopping'),
    };
    return map[key] ?? null;
  };
  const dayColI18n = lang === "en" ? DAY_COL_EN : DAY_COL_ES;
  const monthNamesArr = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_ES;
  const dayColumns = useMemo(() => getDayColumns(dayColI18n), [lang]);

  // ── Booking chat modal (GO_BOOKING / GO_RESERVA entries) ─────────
  const [bookingMsgEntry, setBookingMsgEntry] = useState<GoEntry | null>(null);
  const [expandedBookingItem, setExpandedBookingItem] = useState<GoEntry | null>(null);
  const [bookingMsgDraft, setBookingMsgDraft] = useState("");
  const chatScrollRef = useRef<ScrollView>(null);
  // Optimistic local messages — always shown immediately on send; merged with goChats prop
  const [localChatMsgs, setLocalChatMsgs] = useState<Record<string, BookingChatMessage[]>>({});

  // chatKey = reservationId extracted from the goLog entry ID, same logic as sharedChatKey in index.tsx
  // IMPORTANT: must match bookingIdFromEntryId in index.tsx exactly (cli_ prefix stripped first)
  const bookingChatKey = (entry: GoEntry): string => {
    const id = entry.id;
    if (id.startsWith("go_booking_cli_")) return id.slice("go_booking_cli_".length);
    if (id.startsWith("go_booking_prv_")) return id.slice("go_booking_prv_".length);
    if (id.startsWith("go_booking_"))     return id.slice("go_booking_".length);
    return (entry as any).reservationId || id;
  };

  const handleOpenMessage = useCallback((item: GoEntry) => {
    if (item.type === "GO_BOOKING" || item.type === "GO_RESERVA") {
      setBookingMsgDraft("");
      setBookingMsgEntry(item);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: false }), 120);
    } else {
      onOpenMessage?.(item);
    }
  }, [onOpenMessage]);

  const sendGoChat = useCallback(() => {
    const text = bookingMsgDraft.trim();
    if (!bookingMsgEntry || !text) return;
    const chatKey = bookingChatKey(bookingMsgEntry);
    const senderType: "cliente" | "empresa" = bookingMsgEntry.kind === "received" ? "empresa" : "cliente";
    // 1. Build optimistic message
    const optimisticMsg: BookingChatMessage = {
      messageId: `local_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      senderType,
      senderName: senderType === "empresa" ? (bookingMsgEntry.contactName || "Empresa") : "Yo",
      text,
      createdAt: Date.now(),
    };
    // 2. Add to local state immediately — always visible regardless of backend
    setLocalChatMsgs((prev) => ({
      ...prev,
      [chatKey]: [...(prev[chatKey] || []), optimisticMsg],
    }));
    // 3. Clear input only AFTER message is staged
    setBookingMsgDraft("");
    // 4. Attempt to persist via parent (non-blocking — failure keeps optimistic msg visible)
    if (onSendGoChat) {
      onSendGoChat(bookingMsgEntry.id, chatKey, text, senderType);
    }
    setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [bookingMsgEntry, bookingMsgDraft, onSendGoChat]);

  // ── "NOW" indicator: current time in minutes, refreshed every 30s ─
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const n = new Date();
    return n.getHours() * 60 + n.getMinutes();
  });
  useEffect(() => {
    const id = setInterval(() => {
      const n = new Date();
      setNowMinutes(n.getHours() * 60 + n.getMinutes());
    }, 30000);
    return () => clearInterval(id);
  }, []);

  // Month columns for mes_lineal mode
  const activeMonth = calViewMonth ?? getCurrentYearMonth();
  const monthColumns = useMemo(
    () => getMonthColumns(activeMonth, dayColI18n.shortDays, dayColI18n.today),
    [activeMonth, lang]
  );

  // ── CALENDAR SIZE SYSTEM ─────────────────────────────────────────
  const screenW = Dimensions.get("window").width;
  // "dia" mode: single column at full screen width
  const columnW = viewMode === "dia"
    ? screenW - 24
    : getCalColumnW(calSizeKey, screenW);
  // Scale factor (capped at 2.0 to avoid oversized text on tablets)
  const calScale  = Math.min(columnW / 176, 2.0);
  const cardPad   = Math.round(DEFAULT_GO_RENDER_PRESET.cardPad * calScale);
  const titleFont = Math.round(12 * calScale);
  const titleLine = Math.round(16 * calScale);
  const timeFont  = Math.round(10 * calScale);
  const subFont   = Math.round(10 * calScale);
  const estadoH   = Math.round(30 * calScale);
  const estadoIcon= Math.round(13 * calScale);
  const hdrFont   = Math.round(13 * calScale);
  const hdrDateFt = Math.round(10 * calScale);
  const addBtnIcon= Math.round(13 * calScale);
  const addBtnFs  = Math.round(10 * calScale);
  const colGap    = Math.round(7  * calScale);
  // Shared value used inside Reanimated worklets for column centering
  const colWShared = useSharedValue(columnW);
  useEffect(() => { colWShared.value = columnW; }, [columnW]);

  // "dia" mode: derive single column for the selected day
  const diaColumn = useMemo(() => {
    if (viewMode !== "dia") return null;
    const iso = selectedDateISO || formatISODate(getToday());
    const existing = dayColumns.find((c) => c.dateISO === iso);
    if (existing) return existing;
    // Selected date may be outside the rolling 7-day window — build on the fly
    const d = new Date(iso + "T00:00:00");
    const todayISO2 = formatISODate(getToday());
    const label = iso === todayISO2 ? dayColI18n.today : formatDayLabel(d);
    return { id: iso, dateISO: iso, label } as Column;
  }, [viewMode, selectedDateISO, dayColumns, lang]);

  const allColumns = useMemo(() => {
    if (viewMode === "mes_lineal") {
      // Insert PENDIENTES column just before today so it stays close to HOY
      const pendientesCol: Column = { id: "retrasados", label: t("col_pendientes"), isRetrasados: true };
      const todayIdx = monthColumns.findIndex((c) => c.dateISO === todayISO);
      if (todayIdx <= 0) {
        return [pendientesCol, ...monthColumns];
      }
      const result = [...monthColumns];
      result.splice(todayIdx, 0, pendientesCol);
      return result;
    }
    if (viewMode === "dia" && diaColumn) return [diaColumn];
    return dayColumns;
  }, [viewMode, monthColumns, dayColumns, diaColumn, todayISO]);

  // ── Pulse animation for RETRASADOS dot ──────────────────────────
  const pulseAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 0, duration: 800, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // ── COMPACTACIÓN VISUAL INTELIGENTE ─────────────────────────────
  // Calcula carga promedio de tareas en días futuros visibles →
  // ajusta padding y separación de tarjetas automáticamente.
  const totalVisibleTasks = useMemo(() => {
    const todayForLoad = formatISODate(getToday());
    return allColumns
      .filter(c => !c.isRetrasados && !c.isEliminados && !c.isCustom && !!c.dateISO && c.dateISO >= todayForLoad)
      .reduce((sum, col) => {
        return sum + goLog.filter(g => !g.deleted && g.estado !== "rechazado" && g.dateISO === col.dateISO).length;
      }, 0);
  }, [allColumns, goLog]);
  const visibleFutureDayCols = useMemo(() =>
    allColumns.filter(c => !c.isRetrasados && !c.isEliminados && !c.isCustom && !!c.dateISO && c.dateISO >= formatISODate(getToday())).length,
  [allColumns]);
  const avgLoad = visibleFutureDayCols > 0 ? totalVisibleTasks / visibleFutureDayCols : 0;
  const visualLoad: "light" | "normal" | "dense" = avgLoad <= 0.8 ? "light" : avgLoad <= 3.5 ? "normal" : "dense";
  // Adjusted card padding: more air when sparse, tighter when dense
  const cardPadSmart = Math.round(DEFAULT_GO_RENDER_PRESET.cardPad * calScale * (
    visualLoad === "light" ? 1.30 : visualLoad === "dense" ? 0.88 : 1.0
  ));
  // Gap between cards in SIN HORA (compact) mode
  const compactGap = visualLoad === "light" ? 9 : visualLoad === "dense" ? 3 : 5;

  // ── EXPANDED CARD STATE ──────────────────────────────────────────
  const [expandedCardId, setExpandedCardId] = useState<string | null>(null);
  // Which card's place/dirección sub-section is open
  const [placeExpandedId, setPlaceExpandedId] = useState<string | null>(null);

  // ── MULTI-SELECTION STATE ─────────────────────────────────────────
  const [localSelectedIds, setLocalSelectedIds] = useState<Set<string>>(new Set());
  const selectedIds = selection?.selectedIds ?? localSelectedIds;
  const setSelectedIds = selection?.setSelectedIds ?? setLocalSelectedIds;
  const [bulkMovePicking, setBulkMovePicking] = useState(false);
  const [localSelectionMode, setLocalSelectionMode] = useState(false);
  const selectionMode = selection?.selectionMode ?? localSelectionMode;
  const setSelectionMode = selection?.setSelectionMode ?? setLocalSelectionMode;
  const isSelecting = selectionMode;
  useEffect(() => { if (!selectionMode) setBulkMovePicking(false); }, [selectionMode]);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, [setSelectedIds]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBulkMovePicking(false);
    setSelectionMode(false);
  }, [setSelectedIds, setSelectionMode]);

  const selectAllInCol = useCallback((items: GoEntry[]) => {
    Haptics.selectionAsync().catch(() => {});
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const allSel = items.every((i) => next.has(i.id));
      if (allSel) items.forEach((i) => next.delete(i.id));
      else items.forEach((i) => next.add(i.id));
      return next;
    });
  }, []);

  const handleBulkDelete = useCallback(() => {
    if (!onDeleteItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    selectedIds.forEach((id) => onDeleteItem(id));
    clearSelection();
  }, [selectedIds, onDeleteItem, clearSelection]);

  const handleBulkMove = useCallback((dateISO: string) => {
    if (!onMoveItem) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    selectedIds.forEach((id) => onMoveItem(id, dateISO, ""));
    clearSelection();
  }, [selectedIds, onMoveItem, clearSelection]);

  // ── DRAG & DROP STATE ────────────────────────────────────────────
  const [dragItem, setDragItem] = useState<GoEntry | null>(null);
  const [dragTargetColId, setDragTargetColId] = useState<string | null>(null);
  const dragItemRef = useRef<GoEntry | null>(null);
  useEffect(() => { dragItemRef.current = dragItem; }, [dragItem]);

  // ── MOVE FLOW REF (stores handler ref for cross-day drops) ──────

  // Reanimated shared values — updated on the UI thread for butter-smooth movement
  const floatL  = useSharedValue(0);
  const floatT  = useSharedValue(0);
  const floatOp = useSharedValue(0);
  const floatSc = useSharedValue(1);
  const floatRot = useSharedValue(0); // slight tilt à la Trello/iOS drag
  const lastAbsX = useSharedValue(0); // captured in onFinalize for drop detection
  // Captured once at long-press start: finger Y relative to the float card top,
  // so the card stays exactly under the finger with no vertical jump.
  const fingerOffsetY = useSharedValue(44);

  const floatCardStyle = useAnimatedStyle(() => ({
    position: "absolute" as const,
    left: floatL.value,
    top:  floatT.value,
    opacity: floatOp.value,
    transform: [
      { scale: floatSc.value },
      { rotate: `${floatRot.value}deg` },
    ],
    width: colWShared.value - 14,
    zIndex: 1000,
    pointerEvents: "none" as const,
    shadowColor: "#000",
    shadowOpacity: 0.55,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 18,
  }));

  // ── Layout refs (never trigger re-renders) ───────────────────────
  const boardViewRef  = useRef<View>(null);
  const boardX        = useRef(0); // board left edge in window coords
  const boardY        = useRef(0); // board top edge in window coords — needed to
                                    // convert absoluteY (screen) → board-local Y
  const scrollX       = useRef(0); // horizontal scroll offset
  const colLayouts    = useRef<Record<string, { x: number; w: number }>>({});
  const scrollViewRef = useRef<any>(null);
  // Refs for each column's inner vertical ScrollView (hourly mode)
  const colScrollRefs    = useRef<Record<string, any>>({});
  // Current vertical scroll offset per column (tracked via onScroll)
  const colScrollY       = useRef<Record<string, number>>({});
  // Visible height of each column's ScrollView (tracked via onLayout)
  const colScrollViewH   = useRef<Record<string, number>>({});
  // Animated scroll X for mini-map (no state re-renders, pure Animated)
  const scrollXAnim = useRef(new Animated.Value(0)).current;

  // ── Edge auto-scroll during drag ─────────────────────────────────
  const edgeScrollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const edgeScrollDir   = useRef<"left" | "right" | null>(null);

  const clearEdgeScroll = useCallback(() => {
    if (edgeScrollTimer.current !== null) {
      clearInterval(edgeScrollTimer.current);
      edgeScrollTimer.current = null;
    }
    edgeScrollDir.current = null;
  }, []);

  // useEffect cleanup on unmount
  useEffect(() => () => clearEdgeScroll(), [clearEdgeScroll]);

  // Always-latest refs for callbacks used inside gesture worklets
  const onMoveItemRef  = useRef(onMoveItem);
  const allColumnsRef  = useRef(allColumns);
  useEffect(() => { onMoveItemRef.current  = onMoveItem;   }, [onMoveItem]);
  useEffect(() => { allColumnsRef.current  = allColumns;   }, [allColumns]);

  // ── AUTO-SCROLL: horizontal → PENDIENTES/HOY on every mode switch ─
  // Doble intento (200ms + 700ms) para cubrir renders lentos en apertura inicial.
  useEffect(() => {
    if (viewMode !== "mes_lineal" && viewMode !== "semana") return;
    function doScroll(animated: boolean) {
      // 1. Horizontal scroll → PENDIENTES column (just before HOY)
      const lay = colLayouts.current["retrasados"];
      if (lay) {
        const x = Math.max(0, lay.x - 12);
        scrollViewRef.current?.scrollTo({ x, animated });
      }
      // 2. Vertical scroll inside today's column → current time (semana only)
      if (viewMode === "semana") {
        const todayColRef = colScrollRefs.current[`day_${formatISODate(getToday())}`];
        if (todayColRef) {
          const n = new Date();
          const mins = n.getHours() * 60 + n.getMinutes();
          const pixelY = Math.max(0, (mins / 60) * 50 - 120);
          todayColRef.scrollTo({ y: pixelY, animated });
        }
      }
    }
    const t1 = setTimeout(() => doScroll(true), 200);
    // Segundo intento para renders lentos (primera apertura, carga inicial)
    const t2 = setTimeout(() => doScroll(true), 750);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [viewMode, activeMonth]);

  // ── SCROLL A HOY: disparado por scrollToTodayToken desde el botón HOY ─
  useEffect(() => {
    if (scrollToTodayToken === 0) return;
    const t = setTimeout(() => {
      const lay = colLayouts.current["retrasados"];
      if (lay) {
        const x = Math.max(0, lay.x - 12);
        scrollViewRef.current?.scrollTo({ x, animated: true });
      } else {
        const todayLay = colLayouts.current[`day_${formatISODate(getToday())}`];
        if (todayLay) {
          const x = Math.max(0, todayLay.x - 12);
          scrollViewRef.current?.scrollTo({ x, animated: true });
        }
      }
      if (viewMode === "semana" || viewMode === "dia") {
        const todayColRef = colScrollRefs.current[`day_${formatISODate(getToday())}`];
        if (todayColRef) {
          const n = new Date();
          const mins = n.getHours() * 60 + n.getMinutes();
          const pixelY = Math.max(0, (mins / 60) * 50 - 120);
          todayColRef.scrollTo({ y: pixelY, animated: true });
        }
      }
    }, 100);
    return () => clearTimeout(t);
  }, [scrollToTodayToken]);

  // ── GLOW + BORDER PULSE: iluminar suavemente la tarjeta recién reservada ─
  const glowAnim   = useRef(new Animated.Value(0)).current;
  const borderAnim = useRef(new Animated.Value(0)).current;
  const [activeGlowId, setActiveGlowId] = useState<string | null>(null);
  useEffect(() => {
    if (!highlightEntryId) return;
    glowAnim.setValue(0);
    borderAnim.setValue(0);
    setActiveGlowId(highlightEntryId);
    // Glow overlay: fade in 350ms → hold 800ms → fade out 700ms (~1.85s)
    Animated.sequence([
      Animated.timing(glowAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
      Animated.delay(800),
      Animated.timing(glowAnim, { toValue: 0, duration: 700, useNativeDriver: true }),
    ]).start(() => setActiveGlowId(null));
    // Border strip: fade in 200ms → hold 200ms → fade out 200ms (600ms total, ≤1s)
    Animated.sequence([
      Animated.timing(borderAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
      Animated.delay(200),
      Animated.timing(borderAnim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start();
  }, [highlightEntryId]);

  // ── SCROLL A FECHA+HORA ESPECÍFICA: disparado por scrollToDateToken ─────
  useEffect(() => {
    if (!scrollToDateToken || scrollToDateToken.token === 0) return;
    const { dateISO, timeHHMM } = scrollToDateToken;
    const t = setTimeout(() => {
      // Scroll horizontal → columna del día reservado
      const dateLay = colLayouts.current[`day_${dateISO}`];
      if (dateLay) {
        const x = Math.max(0, dateLay.x - 12);
        scrollViewRef.current?.scrollTo({ x, animated: true });
      }
      // Scroll vertical inteligente → solo si la tarjeta no está completamente visible
      if (viewMode === "semana" || viewMode === "dia") {
        const colKey = `day_${dateISO}`;
        const colRef = colScrollRefs.current[colKey];
        if (colRef && timeHHMM) {
          const [hh, mm] = timeHHMM.split(":").map(Number);
          const totalMins  = (hh || 0) * 60 + (mm || 0);
          const HOUR_PX    = 50;     // píxeles por hora (igual que en scrollToTodayToken)
          const CARD_H     = 90;     // altura estimada de la tarjeta reserva
          const MARGIN     = 20;     // margen de seguridad visible
          const cardTop    = (totalMins / 60) * HOUR_PX;
          const cardBottom = cardTop + CARD_H;

          const currentY  = colScrollY.current[colKey] ?? -1;
          const visibleH  = colScrollViewH.current[colKey] ?? 0;

          // Si no tenemos datos de posición, o la tarjeta no está completamente visible → micro-scroll
          const alreadyVisible =
            currentY >= 0 &&
            visibleH > 0 &&
            cardTop   >= currentY + MARGIN &&
            cardBottom <= currentY + visibleH - MARGIN;

          if (!alreadyVisible) {
            // Centra la tarjeta al 38% desde el top del área visible
            const targetY = Math.max(0, cardTop - (visibleH > 0 ? visibleH * 0.38 : 120));
            colRef.scrollTo({ y: targetY, animated: true });
          }
        }
      }
    }, 150);
    return () => clearTimeout(t);
  }, [scrollToDateToken?.token]);

  // ── JS-thread drag callbacks (called via runOnJS) ────────────────

  // Called when long press fires — record which item is being dragged
  const jsStartDrag = useCallback((item: GoEntry) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
    setDragItem(item);
    setDragTargetColId(null);
  }, []);

  // Called on every finger move — determine which column is under the finger
  // Also triggers edge-auto-scroll when near screen edges during drag
  const jsUpdateTarget = useCallback((absX: number) => {
    // ── Edge auto-scroll ──────────────────────────────────────────
    const EDGE_ZONE = 60;
    const newDir: "left" | "right" | null =
      absX < EDGE_ZONE ? "left" : absX > screenW - EDGE_ZONE ? "right" : null;

    if (newDir !== edgeScrollDir.current) {
      // Direction changed — stop previous and start new if needed
      if (edgeScrollTimer.current !== null) {
        clearInterval(edgeScrollTimer.current);
        edgeScrollTimer.current = null;
      }
      edgeScrollDir.current = newDir;
      if (newDir !== null) {
        edgeScrollTimer.current = setInterval(() => {
          const step = newDir === "right" ? 10 : -10;
          const next = Math.max(0, scrollX.current + step);
          scrollViewRef.current?.scrollTo({ x: next, animated: false });
          scrollX.current = next;
        }, 16);
      }
    }

    // ── Column detection ──────────────────────────────────────────
    const relX = absX - boardX.current + scrollX.current;
    let found: string | null = null;
    for (const col of allColumnsRef.current) {
      const lay = colLayouts.current[col.id];
      if (lay && relX >= lay.x && relX <= lay.x + lay.w) {
        found = col.id;
        break;
      }
    }
    setDragTargetColId((prev) => {
      if (found !== prev && found !== null) {
        Haptics.selectionAsync().catch(() => {});
      }
      return found;
    });
  }, [screenW, clearEdgeScroll]);

  // Called on successful drop — compute final column and trigger onMoveItem
  const jsDropAt = useCallback((absX: number, itemId: string, itemTime: string) => {
    clearEdgeScroll();
    const relX = absX - boardX.current + scrollX.current;
    let targetCol: Column | undefined;
    for (const col of allColumnsRef.current) {
      const lay = colLayouts.current[col.id];
      if (lay && relX >= lay.x && relX <= lay.x + lay.w) {
        targetCol = col;
        break;
      }
    }
    floatOp.value = withTiming(0, { duration: 120 });
    floatSc.value = withSpring(1, { damping: 10, stiffness: 320 });

    if (targetCol?.dateISO) {
      const fromDateISO = dragItemRef.current?.dateISO ?? "";
      const isCrossDay = fromDateISO !== targetCol.dateISO;
      const item = dragItemRef.current;
      const isExternalMove = isCrossDay && item?.kind === "received";
      const currentSelectedIds = selectedIdsRef.current;
      const isDraggingSelected = itemId && currentSelectedIds.has(itemId);
      const isMultiDrag = isDraggingSelected && currentSelectedIds.size > 1;

      if (isMultiDrag && onMoveItemRef.current) {
        // Move all selected cards to the target column directly (no modal per card)
        currentSelectedIds.forEach((sid) => {
          onMoveItemRef.current!(sid, targetCol!.dateISO!, "");
        });
        setSelectedIds(new Set());
        setSelectionMode(false);
        setBulkMovePicking(false);
      } else if (onOpenMoveFlow) {
        // Delegate to the real system clock flow (skips the date step)
        onOpenMoveFlow(itemId, targetCol.dateISO, fromDateISO, itemTime, isExternalMove);
      } else if (onMoveItemRef.current) {
        // Fallback: direct move without time selection
        onMoveItemRef.current(itemId, targetCol.dateISO, itemTime);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }

    setDragItem(null);
    setDragTargetColId(null);
  }, [clearEdgeScroll]);

  // Called on cancelled/failed gesture
  const jsCancelDrag = useCallback(() => {
    clearEdgeScroll();
    floatOp.value = withTiming(0, { duration: 100 });
    floatSc.value = withSpring(1, { damping: 10, stiffness: 320 });
    setDragItem(null);
    setDragTargetColId(null);
  }, [clearEdgeScroll]);

  // Ref so jsDropAt can read selectedIds without stale closure
  const selectedIdsRef = useRef(selectedIds);
  useEffect(() => { selectedIdsRef.current = selectedIds; }, [selectedIds]);

  // Stable function refs so worklets always call the latest version
  const jsStartDragRef   = useRef(jsStartDrag);
  const jsUpdateTargetRef = useRef(jsUpdateTarget);
  const jsDropAtRef      = useRef(jsDropAt);
  const jsCancelDragRef  = useRef(jsCancelDrag);
  useEffect(() => { jsStartDragRef.current    = jsStartDrag;   }, [jsStartDrag]);
  useEffect(() => { jsUpdateTargetRef.current = jsUpdateTarget; }, [jsUpdateTarget]);
  useEffect(() => { jsDropAtRef.current       = jsDropAt;      }, [jsDropAt]);
  useEffect(() => { jsCancelDragRef.current   = jsCancelDrag;  }, [jsCancelDrag]);

  // ── DATA ─────────────────────────────────────────────────────────
  // Modo A (sortOrder "asc")  — fichas nacen desde abajo:
  //   sortByTime("desc") → array [18:31, 18:30, 18:19] + justifyContent:"flex-end"
  //   → el último elemento (18:19) queda en el fondo físico de la columna ✓
  //
  // Modo B (sortOrder "desc") — fichas nacen desde arriba:
  //   sortByTime("asc") → array [18:19, 18:30, 18:31] + justifyContent:"flex-start"
  //   → 18:19 arriba, 18:31 abajo ✓
  const dataSortDir = sortOrder === "asc" ? "desc" : "asc";

  const retrasadoItems = useMemo(
    () => sortByTime(goLog.filter(isOverdue), dataSortDir),
    [goLog, dataSortDir]
  );
  const eliminadosItems = useMemo(
    () => sortByTime(goLog.filter(isEliminated), dataSortDir),
    [goLog, dataSortDir]
  );
  const hasCriticalRetrasados = retrasadoItems.length > 0;
  const getItemsForDay = useCallback(
    (dateISO: string) =>
      sortByTime(goLog.filter((g) => isInDay(g, dateISO) && !isOverdue(g)), dataSortDir),
    [goLog, dataSortDir]
  );

  // ── CARD ─────────────────────────────────────────────────────────
  const renderItemCard = (item: GoEntry, dnProgress = 0, colMode: "stress" | "normal" | "relax" = "normal", colDateISO?: string) => {
    const hasProposal = !!(item.changeProposal);
    const isAcceptedProposal = hasProposal && item.estado === "aceptado";
    const _proposalColor   = isAcceptedProposal ? "#22c55e"               : "#FF8C00";
    const _proposalAlpha80 = isAcceptedProposal ? "rgba(34,197,94,0.80)" : "rgba(255,140,0,0.80)";
    const _proposalAlpha25 = isAcceptedProposal ? "rgba(34,197,94,0.25)" : "rgba(255,140,0,0.25)";
    const _proposalAlpha22 = isAcceptedProposal ? "rgba(34,197,94,0.22)" : "rgba(255,140,0,0.22)";
    const _proposalAlpha18 = isAcceptedProposal ? "rgba(34,197,94,0.18)" : "rgba(255,140,0,0.18)";
    // Contraste máximo WCAG: getGoCardContrast calcula el fondo real del slot
    // y elige la tarjeta (blanca o negra) con mayor ratio. NUNCA gris.
    const slotBgColor = slotDayNightStyle(dnProgress).backgroundColor;
    const {
      backgroundCard:  cardBg,
      textColor:       cardTextPrimary,
      textSecondary:   cardTextSecondary,
      textMuted:       cardTextMuted,
      divider:         cardDivider,
      isCardDark,
    } = getGoCardContrast(slotBgColor);
    const isLight = !isCardDark; // tarjeta clara → iconos/textos oscuros; tarjeta oscura → iconos/textos claros
    // Propuesta activa: siempre fondo oscuro para contraste uniforme
    // (evita la tarjeta partida blanca+negro en el segundo cambio propuesto)
    const _cardBg        = hasProposal ? "rgba(8,6,4,0.95)"        : cardBg;
    const _isLight       = hasProposal ? false                      : isLight;
    const _textPrimary   = hasProposal ? "rgba(255,255,255,0.92)"  : cardTextPrimary;
    const _textSecondary = hasProposal ? "rgba(255,255,255,0.70)"  : cardTextSecondary;
    const _textMuted     = hasProposal ? "rgba(255,255,255,0.45)"  : cardTextMuted;
    const _divider       = hasProposal ? _proposalAlpha22           : cardDivider;

    const isCompleted    = item.estado === "aceptado";
    const hasTime        = !!item.time;
    const isSelected     = embedded && selectedDateISO === item.dateISO;
    const isDragged      = dragItem?.id === item.id;
    const isExpanded     = expandedCardId === item.id;
    const hasMessage     = !!(item.notes || (item as any).message || (item as any).followUp);
    const isMultiSelected = selectedIds.has(item.id);

    // Capture stable copies of callbacks for this specific item
    const startThis  = () => jsStartDragRef.current(item);
    const dropThis   = (absX: number) => jsDropAtRef.current(absX, item.id, item.time || "");
    const cancelThis = () => jsCancelDragRef.current();
    const updateThis = (absX: number) => jsUpdateTargetRef.current(absX);
    const _bc = item as any;
    const _isRawBookingType = item.type === "GO_BOOKING" || item.type === "GO_RESERVA";
    const _hasRequiredSlotFields = !!_bc.staffId && !!_bc.slotKey;
    // A card is only treated as a valid bookable reservation if it carries
    // both staffId and slotKey — without them slot-conflict detection cannot work.
    const isBookingCard = _isRawBookingType && _hasRequiredSlotFields;

    if (_isRawBookingType) {
      if (!_hasRequiredSlotFields) {
        console.warn("[MISSING_STAFF_OR_SLOT_BLOCKED]", {
          sourceFile:     "AgendaOperativa.tsx",
          functionName:   "renderItem",
          bookingId:      _bc.reservationId ?? _bc.id,
          businessId:     _bc.businessId    ?? undefined,
          staffId:        _bc.staffId       ?? undefined,
          professionalId: _bc.professionalId ?? undefined,
          serviceId:      _bc.serviceId     ?? undefined,
          date:           _bc.dateISO       ?? undefined,
          startTime:      _bc.time          ?? undefined,
          endTime:        _bc.endTime       ?? undefined,
          slotKey:        _bc.slotKey       ?? undefined,
          status:         _bc.bookingStatus ?? _bc.estado ?? undefined,
          missingStaffId: !_bc.staffId,
          missingSlotKey: !_bc.slotKey,
        });
      } else {
        console.log("[BOOKING_CARD_SOURCE]", {
          sourceFile:     "AgendaOperativa.tsx",
          functionName:   "renderItem",
          bookingId:      _bc.reservationId ?? _bc.id,
          businessId:     _bc.businessId    ?? undefined,
          staffId:        _bc.staffId       ?? undefined,
          professionalId: _bc.professionalId ?? undefined,
          serviceId:      _bc.serviceId     ?? undefined,
          date:           _bc.dateISO       ?? undefined,
          startTime:      _bc.time          ?? undefined,
          endTime:        _bc.endTime       ?? undefined,
          slotKey:        _bc.slotKey       ?? undefined,
          status:         _bc.bookingStatus ?? _bc.estado ?? undefined,
          entryType:      _bc.type,
          entryId:        _bc.id,
        });
      }
    }
    const tapThis    = () => {
      Haptics.selectionAsync().catch(() => {});
      if (isSelecting) {
        toggleSelect(item.id);
      } else if (isBookingCard) {
        // Booking cards open a floating zoom Modal instead of expanding in-column
        if (expandedCardId === item.id) {
          setExpandedCardId(null);
          setExpandedBookingItem(null);
        } else {
          setExpandedCardId(item.id);
          setExpandedBookingItem(item);
        }
      } else {
        setExpandedCardId((prev) => (prev === item.id ? null : item.id));
      }
    };

    // Short tap opens the card
    const tapGesture = Gesture.Tap()
      .maxDuration(350)
      .onEnd(() => { runOnJS(tapThis)(); });

    // Long press (400ms) activates the drag; pan then tracks the finger
    const dragGesture = Gesture.Pan()
      .activateAfterLongPress(400)
      .onStart((e) => {
        // ── Coordinate space fix ────────────────────────────────────────
        // e.absoluteY is in SCREEN coords; the float card is positioned
        // inside the board View (which starts at boardY.current below the
        // screen top).  Subtracting boardY converts screen → board-local.
        //
        // e.y = finger Y relative to the card's own View at long-press
        // activation — this is the exact pick-up point within the card.
        // Result: float card top = card's board-local top → zero jump.
        fingerOffsetY.value = e.y;
        floatL.value  = e.absoluteX - (colWShared.value - 14) / 2;
        floatT.value  = e.absoluteY - e.y - boardY.current;
        floatOp.value = withSpring(1, { damping: 10, stiffness: 320 });
        floatSc.value = withSpring(1.06, { damping: 9, stiffness: 300 });
        // Start neutral — tilt builds dynamically in onUpdate
        floatRot.value = withSpring(0, { damping: 8, stiffness: 200 });
        lastAbsX.value = e.absoluteX;
        runOnJS(startThis)();
      })
      .onUpdate((e) => {
        // Track finger in board-local coords (absoluteY − boardY = board Y).
        floatL.value  = e.absoluteX - (colWShared.value - 14) / 2;
        floatT.value  = e.absoluteY - fingerOffsetY.value - boardY.current;
        lastAbsX.value = e.absoluteX;
        // Bidirectional tilt — increased to ±5° for a more physical feel.
        // velocityX threshold 50 px/s filters micro-jitter while staying responsive.
        // Intermediate speed (50–300): scale tilt proportionally for smoothness.
        const vx = e.velocityX;
        const maxTilt = 5;
        const tilt = vx > 300 ? maxTilt
          : vx < -300 ? -maxTilt
          : vx > 50   ? (vx / 300) * maxTilt
          : vx < -50  ? (vx / 300) * maxTilt
          : 0;
        floatRot.value = withSpring(tilt, { damping: 12, stiffness: 200 });
        // Column highlight runs on JS thread (acceptable ~1 frame lag)
        runOnJS(updateThis)(e.absoluteX);
      })
      .onFinalize((_e, success) => {
        // Snap rotation back to 0 on release
        floatRot.value = withSpring(0, { damping: 12, stiffness: 300 });
        if (success) {
          runOnJS(dropThis)(lastAbsX.value);
        } else {
          runOnJS(cancelThis)();
        }
      });

    const badge = getCardBadge(item);

    // ── Weather alert badge for climate-sensitive activities ──
    // Timed items: use hourly data for precise match.
    // Untimed items: fall back to daily weather code (day-level adverse check).
    const itemWeatherAlert = (() => {
      if (!item.dateISO) return null;
      const sensitive = isWeatherSensitiveActivity(item.intentKey || "", item.intentLabel || "");
      if (!sensitive) return null;
      // Try hourly first (timed items)
      if (item.time) {
        const tm = item.time.match(/^(\d{1,2}):(\d{2})$/);
        if (tm) {
          const itemH = parseInt(tm[1], 10);
          const wData = getWeatherForHour(weatherHours, item.dateISO, itemH);
          if (wData) {
            const adverse = isAdverseWeather(wData.weatherCode) || wData.precipProbability >= 40;
            return adverse ? wData : null;
          }
        }
      }
      // Fallback: daily weather for untimed activities
      const dayData = (weatherDays as Record<string, WeatherDayData>)[item.dateISO];
      if (!dayData) return null;
      const dayAdverse = isAdverseWeather(dayData.weatherCode) ||
        (dayData.precipMax != null && dayData.precipMax >= 40);
      if (!dayAdverse) return null;
      // Return a synthetic WeatherHourData-compatible object for display
      return {
        hour: 12,
        dateISO: item.dateISO,
        weatherCode: dayData.weatherCode,
        temperature: dayData.tempMax,
        precipProbability: dayData.precipMax ?? 0,
      };
    })();

    const isDeleted = !!(item.deleted || item.estado === "rechazado");
    const eColor = hasProposal ? _proposalColor : (isDeleted ? "#dc2626" : estadoColor(item.estado));
    const accentColor = hasProposal ? _proposalColor : (isDeleted ? "#dc2626" : (item.color || "#555"));

    return (
      // Only dragGesture here — tap is handled by the TouchableOpacity body below.
      // This ensures footer action buttons never accidentally trigger card open/close.
      <GestureDetector key={item.id} gesture={dragGesture}>
        <View
          style={[
            s.card,
            { padding: cardPadSmart, backgroundColor: _cardBg },
            { borderLeftColor: accentColor, borderColor: eColor + "77" },
            isSelected && { borderColor: "#00e5ff", borderLeftColor: accentColor },
            isDragged && s.cardGhost,
            isMultiSelected && s.cardMultiSelected,
            isExpanded && !isBookingCard && { zIndex: 999, elevation: 20, shadowColor: "#000", shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.30, shadowRadius: 14 },
            // Booking cards: altura mínima garantizada — hora + proveedor/cliente + profesional siempre visibles
            isBookingCard && { minHeight: 64 },
          ]}
        >
          {/* ── Completed overlay — darkens ONLY the background, not text/buttons ── */}
          {isCompleted && (
            <View
              pointerEvents="none"
              style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                backgroundColor: "rgba(0,0,0,0.32)",
                borderRadius: 11,
              }}
            />
          )}
          {/* ── Glow: iluminación suave al llegar desde RESERVA CONFIRMADA ── */}
          {activeGlowId === item.id && (
            <Animated.View
              style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 11,
                backgroundColor: accentColor,
                pointerEvents: "none",
                opacity: glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.38] }),
              }}
            />
          )}
          {/* ── Border pulse: strip brillante sobre el borde izquierdo, ≤600ms ── */}
          {activeGlowId === item.id && (
            <Animated.View
              style={{
                position: "absolute", top: 0, left: 0, bottom: 0,
                width: 5,
                borderTopLeftRadius: 11,
                borderBottomLeftRadius: 11,
                backgroundColor: accentColor,
                pointerEvents: "none",
                opacity: borderAnim.interpolate({ inputRange: [0, 1], outputRange: [0, 0.9] }),
              }}
            />
          )}
          {/* ── Multi-select checkbox — absolute top-right, always hittable in selection mode ── */}
          {isSelecting && (
            <TouchableOpacity
              onPress={() => toggleSelect(item.id)}
              hitSlop={8}
              activeOpacity={0.75}
              style={[s.multiCheckbox, isMultiSelected && s.multiCheckboxActive]}
            >
              {isMultiSelected && <Feather name="check" size={8} color="#000" />}
            </TouchableOpacity>
          )}
          {/* ── Tappable body: opens/closes card on tap.
              Lives outside the footer so button presses never bubble here. ── */}
          <TouchableOpacity onPress={tapThis} activeOpacity={0.85} style={{ gap: colMode === "stress" ? 2 : colMode === "relax" ? 7 : 4 }}>
            {/* Top row: time + badges right */}
            <View style={s.cardTopRow}>
              <View style={{ flexDirection: "row", alignItems: "center", flex: 1, flexWrap: "nowrap" }}>
                {hasTime && (
                  <Text style={[s.cardTime, { fontSize: timeFont, color: _textPrimary, flexShrink: 0 }]}>
                    {formatTimeDisplay(item.time)}
                  </Text>
                )}
                {/* Reception countdown badge — only for today's timed reception activities */}
                {(() => {
                  if (!hasTime || !item.dateISO) return null;
                  if (!isReceptionActivity(item.intentKey, item.intentLabel)) return null;
                  const tm = item.time.match(/^(\d{1,2}):(\d{2})$/);
                  if (!tm) return null;
                  const itemMins = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
                  const mLeft = itemMins - nowMinutes;
                  if (mLeft < -30 || mLeft > 120) return null;
                  const status = getReceptionStatus(mLeft);
                  const { shortLabel } = formatCountdownLabel(mLeft, status);
                  const chipColor = getReceptionStatusColor(status);
                  return (
                    <View style={{
                      flexDirection: "row", alignItems: "center", gap: 3,
                      paddingHorizontal: 5, paddingVertical: 2, marginLeft: 4,
                      borderRadius: 5,
                      backgroundColor: chipColor + "18",
                      borderWidth: 0.5,
                      borderColor: chipColor + "60",
                    }}>
                      <Feather name="clock" size={8} color={chipColor} />
                      <Text style={{ color: chipColor, fontSize: 9, fontWeight: "700" }}>{shortLabel}</Text>
                    </View>
                  );
                })()}
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                {!!itemWeatherAlert && (
                  <Feather
                    name={getWeatherFeatherIcon(itemWeatherAlert.weatherCode) as any}
                    size={10}
                    color={getWeatherColor(itemWeatherAlert.weatherCode)}
                  />
                )}
                {hasMessage && (
                  <Feather name="message-circle" size={11} color="rgba(96,165,250,0.85)" />
                )}
                <View style={[s.cardTypeBadge, { backgroundColor: badge.color + "22" }]}>
                  <Text style={[s.cardTypeBadgeText, { color: badge.color }]}>{badge.label}</Text>
                </View>
              </View>
            </View>

            {/* 1. CONTACTO — booking cards: empresa/cliente SIEMPRE visible antes del título. */}
            {!!item.contactName && isBookingCard && (
              <Text
                style={[s.cardSub, { fontSize: subFont, lineHeight: Math.max(16, Math.round(subFont * 1.45)), color: _textSecondary, fontWeight: "600" }]}
                numberOfLines={isExpanded ? 0 : 1}
              >
                {item.contactName}
              </Text>
            )}

            {/* 2. TÍTULO / SERVICIO — hidden for booking cards in compact (zoom Modal shows it) */}
            {!isBookingCard && (
              <Text
                style={[s.cardTitle, { fontSize: titleFont, lineHeight: titleLine, color: _textPrimary, fontWeight: colMode === "stress" ? "800" : "700" }]}
                numberOfLines={isExpanded ? 0 : (colMode === "relax" ? 2 : 1)}
                ellipsizeMode="tail"
              >
                {item.isGeneric
                  ? item.notes || t("task_type_label")
                  : (item.intentKey ? (translateIntentKey(item.intentKey) ?? item.intentLabel) : item.intentLabel) || "GO"}
              </Text>
            )}

            {/* 2b. CON QUIÉN — non-booking: SIEMPRE visible (compacto y expandido)
                Prioridad: nombre > teléfono > nada (ambos normalizados para evitar strings vacíos) */}
            {!isBookingCard && (() => {
              const _name  = item.contactName?.trim() ?? "";
              const _phone = item.phone?.trim() ?? "";
              const _label = _name  ? `Con ${_name}`
                           : _phone ? `Con ${_phone}`
                           : "";
              if (!_label) return null;
              return (
                <Text
                  style={[s.cardSub, { fontSize: subFont, lineHeight: Math.max(16, Math.round(subFont * 1.45)), color: _textSecondary, fontWeight: "600" }]}
                  numberOfLines={1}
                >
                  {_label}
                </Text>
              );
            })()}

            {/* Duration inline for non-booking types without time */}
            {!!item.duration && !isBookingCard && !hasTime && (
              <Text style={[s.cardDurationInline, { color: _isLight ? "rgba(0,0,0,0.50)" : "rgba(255,255,255,0.55)" }]}>{item.duration}</Text>
            )}

            {/* 3. PROFESIONAL — compact "Con Isa" for booking entries */}
            {isBookingCard && !!item.professionalName && (
              <Text
                style={[s.cardSub, { fontSize: subFont, lineHeight: Math.max(15, Math.round(subFont * 1.4)), color: _textSecondary, fontWeight: "700" }]}
                numberOfLines={1}
              >
                {item.professionalName === "Sin preferencia"
                  ? t('biz_no_preference')
                  : t('biz_with_pro').replace(/:\s*$/, ' ') + (item.professionalName.replace(/^[\p{Emoji}\s]+/u, "").trim() || item.professionalName)}
              </Text>
            )}

            {/* 4. EXPANDED DETAIL BLOCK — only for non-booking types; bookings use the zoom Modal */}
            {isExpanded && !isBookingCard && (
              <View style={{ marginTop: 8, gap: 6, paddingTop: 8, borderTopWidth: 1, borderTopColor: _divider }}>
                {!!item.notes && !item.isGeneric && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                    <Feather name="message-circle" size={Math.round(10 * calScale)} color="#60a5fa" style={{ marginTop: 2 }} />
                    <Text style={{ color: cardTextSecondary, fontSize: Math.max(10, Math.round(10 * calScale)), lineHeight: Math.max(14, Math.round(14 * calScale)), flex: 1 }}>
                      {item.notes}
                    </Text>
                  </View>
                )}
                {!!((item as any).message) && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                    <Feather name="message-circle" size={Math.round(10 * calScale)} color="#60a5fa" style={{ marginTop: 2 }} />
                    <Text style={{ color: cardTextSecondary, fontSize: Math.max(10, Math.round(10 * calScale)), lineHeight: Math.max(14, Math.round(14 * calScale)), flex: 1 }}>
                      {(item as any).message}
                    </Text>
                  </View>
                )}
                {!!((item as any).detail) && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                    <Feather name="file-text" size={Math.round(10 * calScale)} color="#a78bfa" style={{ marginTop: 2 }} />
                    <Text style={{ color: "rgba(200,185,255,0.85)", fontSize: Math.max(10, Math.round(10 * calScale)), lineHeight: Math.max(14, Math.round(14 * calScale)), flex: 1 }}>
                      {(item as any).detail}
                    </Text>
                  </View>
                )}
                {!!((item as any).followUp) && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                    <Feather name="clock" size={Math.round(10 * calScale)} color={cardTextMuted} style={{ marginTop: 2 }} />
                    <Text style={{ color: isLight ? "rgba(0,0,0,0.60)" : "rgba(255,255,255,0.60)", fontSize: Math.max(10, Math.round(10 * calScale)), lineHeight: Math.max(14, Math.round(14 * calScale)), flex: 1 }}>
                      {(item as any).followUp}
                    </Text>
                  </View>
                )}
                {!!item.duration && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                    <Feather name="clock" size={10} color={cardTextMuted} />
                    <Text style={{ color: isLight ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.55)", fontSize: 10 }}>{item.duration}</Text>
                  </View>
                )}
                {!!item.place && (
                  <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 5 }}>
                    <Feather name="map-pin" size={Math.round(10 * calScale)} color={cardTextMuted} style={{ marginTop: 2 }} />
                    <Text style={{ color: cardTextSecondary, fontSize: Math.max(10, Math.round(10 * calScale)), lineHeight: Math.max(15, Math.round(15 * calScale)), flex: 1 }}>
                      {item.place}
                    </Text>
                  </View>
                )}
              </View>
            )}
          </TouchableOpacity>

          {/* ── PROPUESTA DE CAMBIO — siempre visible cuando existe ── */}
          {hasProposal && (() => {
            const cp = item.changeProposal!;
            // Usar datos guardados directamente — nunca recalcular desde ISO ni sistema
            const _clean = (s: string) => (s || "").replace(/,\s*/g, " ").trim();
            const _origLabel = [_clean(cp.originalDate), cp.originalTime].filter(Boolean).join(" · ");
            const _propLabel  = [_clean(cp.date), cp.time].filter(Boolean).join(" · ");
            const f = Math.round(calScale);
            const _isReceived = item.estado === "propuesto";
            const _headerLabel = isAcceptedProposal
              ? t('biz_change_accepted')
              : _isReceived ? t('biz_change_received') : t('biz_change_proposed');
            const _headerIcon  = isAcceptedProposal ? "check-circle" : "refresh-cw";
            return (
              <View style={{ marginTop: Math.round(5 * calScale), borderRadius: 7, borderWidth: 1.5, borderColor: _proposalAlpha80, backgroundColor: "rgba(8,6,4,0.92)", padding: Math.round(8 * calScale), gap: Math.round(6 * calScale) }}>
                {/* Header */}
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                  <Feather name={_headerIcon} size={Math.round(7 * calScale)} color={_proposalColor} />
                  <Text style={{ color: _proposalColor, fontSize: Math.round(7 * calScale), fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.8 }}>{_headerLabel}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: _proposalAlpha25 }} />
                {/* Fecha reserva */}
                <View style={{ gap: Math.round(2 * f) }}>
                  <Text style={{ color: _proposalColor, fontSize: Math.round(7 * calScale), fontWeight: "700", letterSpacing: 0.6 }}>{t('biz_booking_date_orig').toUpperCase()}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.90)", fontSize: Math.round(10 * calScale), fontWeight: "700" }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{_origLabel || "—"}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: _proposalAlpha18 }} />
                {/* Fecha propuesta / nueva fecha */}
                <View style={{ gap: Math.round(2 * f) }}>
                  <Text style={{ color: _proposalColor, fontSize: Math.round(7 * calScale), fontWeight: "700", letterSpacing: 0.6 }}>{isAcceptedProposal ? t('biz_booking_date_new').toUpperCase() : t('biz_booking_date_proposed').toUpperCase()}</Text>
                  <Text style={{ color: "rgba(255,255,255,0.90)", fontSize: Math.round(10 * calScale), fontWeight: "700" }} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>{_propLabel || "—"}</Text>
                </View>
                <View style={{ height: 1, backgroundColor: _proposalAlpha18 }} />
                {/* Estado — esperando (solo propuesta enviada) o confirmado */}
                {isAcceptedProposal ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Feather name="check" size={Math.round(8 * calScale)} color={_proposalColor} />
                    <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: Math.round(8 * calScale), fontWeight: "700" }}>{t('biz_booking_updated')}</Text>
                  </View>
                ) : !_isReceived ? (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                    <Feather name="clock" size={Math.round(8 * calScale)} color={_proposalColor} />
                    <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: Math.round(8 * calScale), fontWeight: "700" }}>{t('biz_booking_awaiting')}</Text>
                  </View>
                ) : null}
                {/* Botones para quien recibe la propuesta */}
                {_isReceived && (onAcceptProposal || onRejectProposal || onProposeProposal) && (
                  <View style={{ gap: Math.round(4 * calScale), marginTop: Math.round(2 * calScale) }}>
                    <View style={{ flexDirection: "row", gap: Math.round(4 * calScale) }}>
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); onAcceptProposal?.(item.id); }}
                        activeOpacity={0.7}
                        style={{ flex: 1, alignItems: "center", paddingVertical: Math.round(5 * calScale), borderRadius: 6, backgroundColor: "#16a34a" }}
                      >
                        <Text style={{ color: "#fff", fontSize: Math.round(8 * calScale), fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.3 }}>🟢 Aceptar</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => { Haptics.selectionAsync().catch(() => {}); onRejectProposal?.(item.id); }}
                        activeOpacity={0.7}
                        style={{ flex: 1, alignItems: "center", paddingVertical: Math.round(5 * calScale), borderRadius: 6, backgroundColor: "#dc2626" }}
                      >
                        <Text style={{ color: "#fff", fontSize: Math.round(8 * calScale), fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.3 }}>🔴 Rechazar</Text>
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      onPress={() => { Haptics.selectionAsync().catch(() => {}); onProposeProposal?.(item.id); }}
                      activeOpacity={0.7}
                      style={{ alignItems: "center", paddingVertical: Math.round(5 * calScale), borderRadius: 6, backgroundColor: "rgba(249,115,22,0.15)", borderWidth: 1, borderColor: "rgba(249,115,22,0.45)" }}
                    >
                      <Text style={{ color: "#FF8C00", fontSize: Math.round(8 * calScale), fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.3 }}>🟠 Proponer</Text>
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            );
          })()}

          {/* ── Message quick-access row — only for non-booking expanded cards ── */}
          {isExpanded && !isBookingCard && !!onOpenMessage && (
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                handleOpenMessage(item);
              }}
              activeOpacity={0.75}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 7,
                paddingHorizontal: 8,
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: "rgba(96,165,250,0.08)",
                borderWidth: 1,
                borderColor: "rgba(96,165,250,0.22)",
              }}
            >
              <Feather name="message-circle" size={13} color="#60a5fa" />
              <Text
                style={{ color: "rgba(96,165,250,0.75)", fontSize: 10, fontWeight: "600", flex: 1 }}
                numberOfLines={1}
              >
                {item.notes
                  ? item.notes
                  : (item as any).message
                  ? (item as any).message
                  : t("agenda_write_msg")}
              </Text>
              <Feather name="chevron-right" size={10} color="rgba(96,165,250,0.40)" />
            </TouchableOpacity>
          )}

          {/* ── Footer: estado buttons + delete.
              Inner buttons claim their own touches; tapping the gap between them
              falls through to this wrapper which toggles the card open/closed. ── */}
          <TouchableOpacity activeOpacity={1} onPress={tapThis} style={s.cardFooter}>
            {onChangeEstado && (
              <View style={s.estadoRow}>
                {ESTADO_OPTIONS.map((opt) => {
                  const isActive =
                    item.estado === opt.key ||
                    (opt.key === "propuesto" &&
                      (item.estado === "propuesto" || item.estado === "propuesta_pendiente"));
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      onPress={() => {
                        if (isActive) return;
                        const resolved = resolveEstado(item.estado, opt.key);
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                        onChangeEstado(item.id, resolved);
                        if (opt.key === "propuesto" && onProposeItem) {
                          onProposeItem(item.id);
                        }
                      }}
                      style={[
                        s.estadoPill,
                        { height: estadoH },
                        isActive
                          ? {
                              backgroundColor: opt.color + "28",
                              borderColor: opt.color,
                              shadowColor: opt.color,
                              shadowOpacity: 0.65,
                              shadowRadius: 6,
                              elevation: 4,
                            }
                          : {
                              backgroundColor: "transparent",
                              borderColor: opt.color + "80",
                            },
                      ]}
                      activeOpacity={0.7}
                      hitSlop={4}
                    >
                      <Feather
                        name={(isActive ? opt.icon : opt.iconInactive) as any}
                        size={estadoIcon}
                        color={isActive ? opt.color : opt.color + "90"}
                      />
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {onDeleteItem && (
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                  onDeleteItem(item.id);
                }}
                hitSlop={8}
                style={s.deleteBtn}
              >
                <Feather name="trash-2" size={10} color="#FF0000" />
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </View>
      </GestureDetector>
    );
  };

  // ── COLUMN ───────────────────────────────────────────────────────
  const renderColumn = (col: Column) => {
    const items = col.isRetrasados
      ? retrasadoItems
      : col.isEliminados
      ? eliminadosItems
      : col.isCustom
      ? []
      : getItemsForDay(col.dateISO!);

    const isToday       = !col.isRetrasados && !col.isCustom && !col.isEliminados && col.dateISO === todayISO;
    const isSelectedDay = !col.isRetrasados && !col.isCustom && !col.isEliminados && col.dateISO === selectedDateISO;
    const isDragTarget  = col.id === dragTargetColId;
    const isEmpty       = items.length === 0;

    // ── MODO HUMANO: stress ≥5 tareas, relax ≤1 tarea, normal intermedio ──
    // Solo aplica a columnas de día real (no PENDIENTES, no ELIMINADOS)
    const colHumanMode: "stress" | "normal" | "relax" =
      (!col.isRetrasados && !col.isEliminados && !col.isCustom)
        ? items.length >= 5 ? "stress" : items.length <= 1 ? "relax" : "normal"
        : "normal";

    // ── PREDICTIVE: heurísticas por columna ─────────────────────────
    const colDateISO = col.dateISO ?? "";
    const colIsFuture = !col.isRetrasados && !col.isEliminados && !col.isCustom && colDateISO > todayISO;
    const daySuggestions = (!col.isRetrasados && !col.isEliminados && !col.isCustom && colDateISO)
      ? computeDaySuggestions({
          colDate: colDateISO,
          isToday,
          isFuture: colIsFuture,
          nowMinutes,
          items,
          weatherDay: (weatherDays as Record<string, { weatherCode: number; precipMax?: number; windMax?: number; tempMax?: number }>)[colDateISO],
          retrasadosCount: retrasadoItems.length,
          lang,
        })
      : [];
    // Show only the top-priority suggestion per column
    const topSuggestion = daySuggestions[0] ?? null;

    return (
      <View
        key={col.id}
        onLayout={(e) => {
          colLayouts.current[col.id] = {
            x: e.nativeEvent.layout.x,
            w: e.nativeEvent.layout.width,
          };
        }}
        style={[
          s.column,
          { width: columnW },
          col.isRetrasados && s.columnRetrasados,
          col.isEliminados && s.columnEliminados,
          !isEmpty && isToday && s.columnToday,
          !isEmpty && isSelectedDay && s.columnSelected,
          isDragTarget && s.columnDragTarget,
          // Modo humano: tinte sutil de fondo por carga del día
          colHumanMode === "stress" && !col.isRetrasados && !col.isEliminados && { backgroundColor: "rgba(255,107,53,0.04)" },
          colHumanMode === "relax"  && !col.isRetrasados && !col.isEliminados && { backgroundColor: "rgba(100,220,255,0.025)" },
        ]}
      >
        {/* Column header */}
        <View
          style={[
            s.colHeader,
            col.isRetrasados && s.colHeaderRetrasados,
            col.isEliminados && s.colHeaderEliminados,
            !isEmpty && isToday && s.colHeaderToday,
            !isEmpty && isSelectedDay && s.colHeaderSelected,
            isDragTarget && s.colHeaderDragTarget,
            // Modo humano: acento visual en cabecera — solo cuando hay eventos
            colHumanMode === "stress" && !col.isRetrasados && !col.isEliminados && items.length > 0 && { borderTopWidth: 2, borderTopColor: "rgba(255,107,53,0.55)" },
            colHumanMode === "relax"  && !col.isRetrasados && !col.isEliminados && items.length > 0 && { borderTopWidth: 1.5, borderTopColor: "rgba(100,220,255,0.30)" },
          ]}
        >
          {/* Alert dot — RETRASADOS only */}
          {col.isRetrasados && hasCriticalRetrasados && (
            <Animated.View
              style={[
                s.alertDot,
                {
                  opacity: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }),
                  transform: [{ scale: pulseAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.2] }) }],
                },
              ]}
            />
          )}

          {/* ── Day name + date + indicators ──────────────────────────────────
              colHeaderContent tiene flex:1 y alignItems:"center" para que el
              día quede SIEMPRE centrado respecto al ancho total de la columna.
              Los badges y indicadores usan position:"absolute" para no desplazar
              el contenido centrado.                                            */}
          <View style={s.colHeaderContent}>
            <Text
              style={[
                s.colHeaderDayName,
                { fontSize: hdrFont },
                !isEmpty && isSelectedDay && s.colHeaderTextSelected,
                col.isEliminados && s.colHeaderTextEliminados,
              ]}
              numberOfLines={1}
            >
              {col.dayName ?? col.label}
            </Text>
            {!!col.dayDate ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Text
                  style={[
                    s.colHeaderDayDate,
                    { fontSize: hdrDateFt },
                    !isEmpty && isSelectedDay && { color: "#00e5ff" },
                  ]}
                >
                  {col.dayDate}
                </Text>
                {!col.isRetrasados && !col.isEliminados && !!col.dateISO && !!weatherDays[col.dateISO] ? (() => {
                  const wd = weatherDays[col.dateISO] as WeatherDayData;
                  const wIcon  = getWeatherFeatherIcon(wd.weatherCode) as any;
                  const wColor = getWeatherColor(wd.weatherCode);
                  const sz = Math.max(9, Math.round(9 * calScale));
                  const ft = Math.max(8, Math.round(8 * calScale));
                  const showWind   = wd.windMax != null && wd.windMax >= 25;
                  const showRain   = wd.precipMax != null && wd.precipMax >= 40;
                  return (
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                      {/* weather icon + temp */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                        <Feather name={wIcon} size={sz} color={wColor} />
                        <Text style={{ color: "rgba(255,255,255,0.90)", fontSize: ft, fontWeight: "700" }}>
                          {wd.tempMax}°
                        </Text>
                      </View>
                      {/* wind indicator — only when >= 25 km/h */}
                      {showWind && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                          <Feather name="wind" size={sz} color="rgba(180,220,255,0.80)" />
                          <Text style={{ color: "rgba(180,220,255,0.75)", fontSize: Math.max(7, ft - 1), fontWeight: "600" }}>
                            {wd.windMax}
                          </Text>
                        </View>
                      )}
                      {/* rain probability — only when >= 40% */}
                      {showRain && (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 1 }}>
                          <Feather name="droplet" size={sz} color="rgba(100,180,255,0.80)" />
                          <Text style={{ color: "rgba(100,180,255,0.80)", fontSize: Math.max(7, ft - 1), fontWeight: "600" }}>
                            {wd.precipMax}%
                          </Text>
                        </View>
                      )}
                    </View>
                  );
                })() : (!col.isRetrasados && !col.isEliminados && !hasLocation && (
                  // No GPS permission — subtle fallback indicator
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 2, opacity: 0.35 }}>
                    <Feather name="map-pin" size={Math.max(8, Math.round(8 * calScale))} color="rgba(255,255,255,0.6)" />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={{ fontSize: hdrDateFt, opacity: 0 }} aria-hidden> </Text>
            )}

            {/* ── Indicador modo humano — solo cuando hay eventos ── */}
            {colHumanMode === "stress" && !col.isRetrasados && !col.isEliminados && items.length > 0 && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginTop: 3 }}>
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: "#ff6b35", opacity: 0.85 }} />
                <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: "#ff6b35", opacity: 0.55 }} />
                <View style={{ width: 3, height: 3, borderRadius: 1.5, backgroundColor: "#ff6b35", opacity: 0.30 }} />
              </View>
            )}
            {colHumanMode === "relax" && !col.isRetrasados && !col.isEliminados && items.length > 0 && (
              <View style={{ width: 22, height: 2, borderRadius: 1, backgroundColor: "rgba(100,220,255,0.40)", marginTop: 3 }} />
            )}

            {/* ── PREDICTIVE: chip de sugerencia inteligente ── */}
            {!!topSuggestion && (() => {
              const meta = getSuggestionChipMeta(topSuggestion.type);
              return (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 3,
                    marginTop: 4,
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: meta.color + "18",
                    borderWidth: 0.5,
                    borderColor: meta.color + "40",
                  }}
                >
                  <Feather name={meta.icon as any} size={8} color={meta.color} />
                  <Text
                    style={{
                      fontSize: Math.max(7, Math.round(7 * calScale)),
                      color: meta.color,
                      fontWeight: "700",
                      letterSpacing: 0.1,
                    }}
                    numberOfLines={1}
                  >
                    {topSuggestion.message}
                  </Text>
                </View>
              );
            })()}
          </View>

          {/* ── Badges — position absolute para no desplazar el contenido centrado ── */}
          {!col.isRetrasados && !col.isCustom && !col.isEliminados && items.length > 0 && (
            <View style={[s.colCountBadge, { position: "absolute", right: 5, top: 5 }]}>
              <Text style={s.colCount}>{items.length}</Text>
            </View>
          )}
          {col.isRetrasados && items.length > 0 && (
            <View style={[s.retrasadosBadge, { position: "absolute", right: 4, top: 4 }]}>
              <Text style={s.retrasadosBadgeText}>{items.length}</Text>
            </View>
          )}
          {col.isEliminados && items.length > 0 && (
            <View style={[s.retrasadosBadge, { backgroundColor: "#555", position: "absolute", right: 4, top: 4 }]}>
              <Text style={s.retrasadosBadgeText}>{items.length}</Text>
            </View>
          )}
        </View>

        {/* Card list — time-slot grid in CON HORA mode, compact stack in SIN HORA mode */}
        {showHours && !col.isRetrasados && !col.isEliminados && !col.isCustom ? (
          (() => {
            const colDnProgress = calDayNightMode === "claro" ? 1
              : calDayNightMode === "oscuro" ? 0
              : 0.5;
            const timedItems = items.filter((i) => !!i.time);
            const untimedItems = items.filter((i) => !i.time);
            console.log("[CALENDAR_RENDER_ITEMS]", items.length, items.map(i => ({ id: (i as any).id, source: (i as any).source, slotKey: (i as any).slotKey, time: (i as any).time, staffId: (i as any).staffId })));
            const slotIntervalMin = getEffectiveDensityMin(density, timedItems.length);
            const SLOT_H = slotIntervalMin === 60 ? 50 : slotIntervalMin === 30 ? 36 : 28;
            const START_H = 0, END_H = 24;
            const slots: number[] = [];
            for (let m = START_H * 60; m < END_H * 60; m += slotIntervalMin) slots.push(m);
            // Office mode: show only 08:00–18:00, hide the rest
            const OFFICE_S = 8 * 60, OFFICE_E = 18 * 60;
            const effectiveSlots = officeMode
              ? slots.filter(m => m >= OFFICE_S && m < OFFICE_E)
              : slots;
            const earlyOfficeItems = officeMode
              ? timedItems.filter(it => { const tm = it.time.match(/^(\d{1,2}):(\d{2})$/); if (!tm) return false; return parseInt(tm[1],10)*60+parseInt(tm[2],10) < OFFICE_S; })
              : [];
            const lateOfficeItems = officeMode
              ? timedItems.filter(it => { const tm = it.time.match(/^(\d{1,2}):(\d{2})$/); if (!tm) return false; return parseInt(tm[1],10)*60+parseInt(tm[2],10) >= OFFICE_E; })
              : [];
            // ── Day/Night: parse sunrise & sunset for this column's date ──
            // Falls back to 06:00–22:00 when no weather data or no location.
            let colSunriseMin = 6 * 60;
            let colSunsetMin  = 22 * 60;
            if (col.dateISO) {
              const dayData = (weatherDays as Record<string, { sunrise?: string; sunset?: string }>)[col.dateISO];
              if (dayData?.sunrise) {
                const sr = new Date(dayData.sunrise);
                colSunriseMin = sr.getHours() * 60 + sr.getMinutes();
              }
              if (dayData?.sunset) {
                const ss = new Date(dayData.sunset);
                colSunsetMin = ss.getHours() * 60 + ss.getMinutes();
              }
            }
            return (
              <ScrollView
                ref={(r) => { colScrollRefs.current[col.id] = r; }}
                style={s.colScroll}
                contentContainerStyle={{ paddingBottom: 12 }}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                scrollEnabled={!dragItem}
                scrollEventThrottle={50}
                onScroll={(e) => { colScrollY.current[col.id] = e.nativeEvent.contentOffset.y; }}
                onLayout={(e) => { colScrollViewH.current[col.id] = e.nativeEvent.layout.height; }}
              >
                {untimedItems.length > 0 && (
                  <View style={{ padding: 5, gap: 5, borderBottomWidth: 1, borderBottomColor: colDnProgress >= 0.5 ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)" }}>
                    {untimedItems.map((item) => renderItemCard(item, colDnProgress, colHumanMode, col.dateISO))}
                  </View>
                )}
                {/* ── Office mode: hidden early hours indicator ── */}
                {officeMode && (
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 5, opacity: 0.45 }}>
                    <Text style={{ color: "#94b4c8", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }}>
                      00:00–08:00
                    </Text>
                    {earlyOfficeItems.length > 0 && (
                      <Text style={{ color: "#60a5fa", fontSize: 9, marginLeft: 5 }}>
                        · {earlyOfficeItems.length}
                      </Text>
                    )}
                    <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(148,180,200,0.30)", marginLeft: 6 }} />
                  </View>
                )}
                {effectiveSlots.map((slotStart) => {
                  const h = Math.floor(slotStart / 60);
                  const m = slotStart % 60;
                  const label = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
                  const slotEnd = slotStart + slotIntervalMin;
                  const slotCards = timedItems.filter((item) => {
                    const tm = item.time?.match(/^(\d{1,2}):(\d{2})$/);
                    if (!tm) return false;
                    const iMin = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
                    return iMin >= slotStart && iMin < slotEnd;
                  });
                  const isCurrentSlot = isToday && nowMinutes >= slotStart && nowMinutes < slotEnd;
                  const slotWeather = col.dateISO
                    ? getWeatherForHour(weatherHours, col.dateISO, h)
                    : null;
                  const showWeatherAlert = slotWeather &&
                    (isAdverseWeather(slotWeather.weatherCode) || slotWeather.precipProbability >= 40);
                  const baseDnProgress = getSlotDayNightProgress(
                    slotStart + slotIntervalMin / 2,
                    colSunriseMin,
                    colSunsetMin,
                  );
                  const dnProgress = calDayNightMode === "claro" ? 1
                    : calDayNightMode === "oscuro" ? 0
                    : baseDnProgress;
                  const isNightSlot = dnProgress <= 0.18;
                  const txtColor = slotLabelColor(dnProgress);
                  const lineColor = slotLineColor(dnProgress);
                  // Icono: clima real si existe, luna si es noche sin datos
                  const wxIcon = slotWeather
                    ? getSlotIcon(slotWeather.weatherCode, isNightSlot)
                    : isNightSlot ? "moon" : null;
                  const wxColor = slotWeather
                    ? getSlotIconColor(slotWeather.weatherCode, isNightSlot)
                    : "#b8c8f0";
                  return (
                    <View key={slotStart} style={[
                      { minHeight: slotCards.length === 0 ? SLOT_H : undefined },
                      slotDayNightStyle(dnProgress),
                    ]}>
                      {/* ── "NOW" indicator line ── */}
                      {isCurrentSlot && (
                        <View style={{ flexDirection: "row", alignItems: "center", marginHorizontal: 5, marginBottom: 2 }}>
                          <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: "#00e5ff" }} />
                          <View style={{ flex: 1, height: 1.5, backgroundColor: "#00e5ff", opacity: 0.75 }} />
                        </View>
                      )}
                      <View style={s.slotRow}>
                        {/* Label + weather: flexShrink:0 so it sizes to content and line starts after */}
                        <View style={{ flexDirection: "column", alignItems: "flex-start", gap: 1, flexShrink: 0 }}>
                          {/* fontSize fixed at 10 — never scales with calScale so "00:00" never wraps */}
                          <Text style={[s.slotLabel, { color: txtColor }]}>{label}</Text>
                          {wxIcon && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
                              <Feather
                                name={wxIcon as any}
                                size={8}
                                color={wxColor}
                              />
                              {slotWeather && (
                                <Text style={{
                                  color: wxColor,
                                  fontSize: 8,
                                  fontWeight: "700",
                                  opacity: showWeatherAlert ? 1.0 : 0.92,
                                }}>
                                  {showWeatherAlert && slotWeather.precipProbability >= 40
                                    ? `${slotWeather.precipProbability}%`
                                    : `${slotWeather.temperature}°`}
                                </Text>
                              )}
                            </View>
                          )}
                        </View>
                        {/* Line starts exactly after the text content */}
                        <View style={[s.slotLine, { backgroundColor: lineColor }]} />
                      </View>
                      {slotCards.length > 0 && (
                        <View style={s.slotCards}>
                          {slotCards.map((item) => renderItemCard(item, dnProgress, colHumanMode, col.dateISO))}
                        </View>
                      )}
                    </View>
                  );
                })}
                {/* ── Office mode: hidden late hours indicator ── */}
                {officeMode && (
                  <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 7, paddingVertical: 5, opacity: 0.45 }}>
                    <Text style={{ color: "#94b4c8", fontSize: 9, fontWeight: "700", letterSpacing: 0.5 }}>
                      18:00–00:00
                    </Text>
                    {lateOfficeItems.length > 0 && (
                      <Text style={{ color: "#60a5fa", fontSize: 9, marginLeft: 5 }}>
                        · {lateOfficeItems.length}
                      </Text>
                    )}
                    <View style={{ flex: 1, height: 0.5, backgroundColor: "rgba(148,180,200,0.30)", marginLeft: 6 }} />
                  </View>
                )}
              </ScrollView>
            );
          })()
        ) : (
          (() => {
            // SIN HORA (compact) mode: keep items sorted by time so the user
            // never loses temporal reference. Timed items come first in
            // chronological order; untimed items follow.
            const colDnProgress = calDayNightMode === "claro" ? 1
              : calDayNightMode === "oscuro" ? 0
              : 0.5;
            const compactItems = [...items].sort((a, b) => {
              if (!a.time && !b.time) return 0;
              if (!a.time) return 1;
              if (!b.time) return -1;
              if (sortOrder === "desc") return b.time.localeCompare(a.time);
              return a.time.localeCompare(b.time);
            });
            return (
              <ScrollView
                style={s.colScroll}
                contentContainerStyle={[s.colContent, { justifyContent: "flex-start", gap: compactGap }]}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
                scrollEnabled={!dragItem}
              >
                {compactItems.map((item) => renderItemCard(item, colDnProgress, colHumanMode, col.dateISO))}
              </ScrollView>
            );
          })()
        )}

      </View>
    );
  };

  // ── FLOATING DRAG CARD ────────────────────────────────────────────
  const renderFloatCard = () => {
    if (!dragItem) return null;
    return (
      <ReAnimated.View style={floatCardStyle} pointerEvents="none">
        <View
          style={[
            s.card,
            s.cardFloat,
            { borderLeftColor: dragItem.color || "#555" },
          ]}
        >
          {dragItem.time ? (
            <Text style={s.cardTime}>{formatTimeDisplay(dragItem.time)}</Text>
          ) : null}
          <Text style={s.cardTitle} numberOfLines={2}>
            {dragItem.isGeneric
              ? dragItem.notes || "GO GENÉRICO"
              : dragItem.intentLabel || dragItem.intentKey || "GO"}
          </Text>
          <View style={s.cardFooter}>
            <View
              style={{
                borderRadius: 5,
                paddingHorizontal: 6,
                paddingVertical: 2,
                backgroundColor: estadoColor(dragItem.estado) + "30",
              }}
            >
              <Text
                style={{ fontSize: 9, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.5, color: estadoColor(dragItem.estado) }}
              >
                {estadoLabel(dragItem.estado, lang)}
              </Text>
            </View>
          </View>
        </View>
      </ReAnimated.View>
    );
  };

  // ── RENDER ────────────────────────────────────────────────────────
  return (
    <View
      ref={boardViewRef}
      style={[{ flex: 1 }, style]}
      onLayout={() => {
        boardViewRef.current?.measureInWindow((x, y) => {
          boardX.current = x;
          boardY.current = y;
        });
      }}
    >

      {/* Month navigation header — only for mes_lineal when NOT managed by outer bottom bar */}
      {viewMode === "mes_lineal" && onChangeMonth === undefined && (
        <View style={s.monthNavBar}>
          <TouchableOpacity onPress={() => {}} hitSlop={12} style={s.monthNavBtn} activeOpacity={0.7}>
            <Feather name="chevron-left" size={18} color="#ffffff" />
          </TouchableOpacity>
          <Text style={s.monthNavTitle}>
            {((): string => {
              const [y, m] = activeMonth.split("-").map(Number);
              return `${monthNamesArr[m - 1]} ${y}`;
            })()}
          </Text>
          <TouchableOpacity onPress={() => {}} hitSlop={12} style={s.monthNavBtn} activeOpacity={0.7}>
            <Feather name="chevron-right" size={18} color="#ffffff" />
          </TouchableOpacity>
        </View>
      )}

      <GHScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.colsScroll}
        contentContainerStyle={s.colsContent}
        decelerationRate="normal"
        directionalLockEnabled
        scrollEventThrottle={4}
        bounces
        scrollEnabled={!dragItem}
        onScroll={(e) => {
          const ox = e.nativeEvent.contentOffset.x;
          scrollX.current = ox;
          scrollXAnim.setValue(ox);
        }}
      >
        {allColumns.map(renderColumn)}
      </GHScrollView>

      {/* ── MINI MAPA TEMPORAL — indicador de posición en el mes ──
          Solo en mes_lineal. Barra fina centrada en la base del board.
          pointerEvents none: puramente visual, no interfiere con gestos. */}
      {viewMode === "mes_lineal" && (() => {
        const totalCols = allColumns.length;
        const totalContentW = totalCols * (columnW + colGap);
        const maxScrollX = Math.max(1, totalContentW - screenW);
        const BAR_W = 72;
        const thumbW = Math.max(10, Math.round((screenW / Math.max(screenW + 1, totalContentW)) * BAR_W));
        const thumbTravel = BAR_W - thumbW;
        const thumbX = scrollXAnim.interpolate({
          inputRange: [0, maxScrollX],
          outputRange: [0, thumbTravel],
          extrapolate: "clamp",
        });
        return (
          <Animated.View
            pointerEvents="none"
            style={{
              position: "absolute",
              bottom: 6,
              alignSelf: "center",
              width: BAR_W,
              height: 3,
              borderRadius: 2,
              backgroundColor: "rgba(255,255,255,0.10)",
              overflow: "hidden",
            }}
          >
            <Animated.View
              style={{
                position: "absolute",
                left: thumbX,
                width: thumbW,
                height: 3,
                borderRadius: 2,
                backgroundColor: "rgba(255,255,255,0.55)",
              }}
            />
          </Animated.View>
        );
      })()}

      {/* ── BULK ACTION BAR — appears when items are selected ──── */}
      {isSelecting && !bulkMovePicking && (
        <View style={s.bulkBar}>
          <View style={s.bulkBarLeft}>
            <Text style={s.bulkCount}>{selectedIds.size}</Text>
            <Text style={s.bulkCountLabel}> SELEC.</Text>
          </View>
          <TouchableOpacity
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setBulkMovePicking(true); }}
            style={s.bulkActionBtn}
            activeOpacity={0.75}
          >
            <Feather name="calendar" size={11} color="#00e5ff" />
            <Text style={[s.bulkActionText, { color: "#00e5ff" }]}>MOVER</Text>
          </TouchableOpacity>
          {onDeleteItem && (
            <TouchableOpacity
              onPress={handleBulkDelete}
              style={[s.bulkActionBtn, { borderColor: "rgba(255,50,50,0.30)" }]}
              activeOpacity={0.75}
            >
              <Feather name="trash-2" size={11} color="#ff4444" />
              <Text style={[s.bulkActionText, { color: "#ff4444" }]}>DELETE</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={clearSelection} hitSlop={10} style={s.bulkCancelBtn} activeOpacity={0.7}>
            <Feather name="x" size={15} color="rgba(255,255,255,0.50)" />
          </TouchableOpacity>
        </View>
      )}

      {/* ── BULK MOVE DAY PICKER ──────────────────────────────── */}
      {isSelecting && bulkMovePicking && (
        <View style={s.bulkBar}>
          <TouchableOpacity onPress={() => setBulkMovePicking(false)} hitSlop={10} style={s.bulkCancelBtn} activeOpacity={0.7}>
            <Feather name="arrow-left" size={14} color="rgba(255,255,255,0.55)" />
          </TouchableOpacity>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flex: 1 }}
            contentContainerStyle={{ gap: 6, paddingHorizontal: 4 }}
          >
            {allColumns
              .filter((col) => !col.isRetrasados && !col.isEliminados && !col.isCustom && !!col.dateISO)
              .map((col) => (
                <TouchableOpacity
                  key={col.id}
                  onPress={() => handleBulkMove(col.dateISO!)}
                  style={[s.bulkDayChip, col.dateISO === todayISO && s.bulkDayChipToday]}
                  activeOpacity={0.75}
                >
                  <Text style={s.bulkDayChipName}>{col.dayName ?? col.label}</Text>
                  {!!col.dayDate && <Text style={s.bulkDayChipDate}>{col.dayDate}</Text>}
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      )}

      {/* Float card lives outside the scroll view so it can move freely */}
      {renderFloatCard()}

      {/* ── BOOKING ZOOM MODAL — flotante, cubre el calendario ─────── */}
      <Modal
        visible={!!expandedBookingItem}
        transparent
        animationType="fade"
        onRequestClose={() => { setExpandedBookingItem(null); setExpandedCardId(null); }}
      >
        {/* Backdrop — tap outside sheet to close */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => { setExpandedBookingItem(null); setExpandedCardId(null); }}
          style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.62)", justifyContent: "flex-end" }}
        >
          {/* Bottom sheet card — View stops tap propagation to backdrop */}
          {!!expandedBookingItem && (
            <View
              style={{
                width: "100%",
                maxHeight: "78%",
                backgroundColor: "#0e0e10",
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
                borderTopWidth: 3,
                borderTopColor: expandedBookingItem.color || "#4A80BD",
                shadowColor: "#000",
                shadowOffset: { width: 0, height: -4 },
                shadowOpacity: 0.55,
                shadowRadius: 20,
                elevation: 24,
              }}
            >
              {/* Drag handle */}
              <View style={{ alignItems: "center", paddingTop: 12, paddingBottom: 4 }}>
                <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
              </View>

              <ScrollView
                showsVerticalScrollIndicator={false}
                bounces={false}
                contentContainerStyle={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, gap: 0 }}
              >
                {/* ─── TIME · RESERVA · DURACIÓN ─── */}
                <Text style={{ fontSize: 13, fontFamily: "Inter_700Bold", fontWeight: "800", color: "rgba(255,255,255,0.82)", letterSpacing: 0.5, marginBottom: 12 }}>
                  {[
                    expandedBookingItem.time ? expandedBookingItem.time : null,
                    t('biz_booking_intent_label'),
                    expandedBookingItem.duration || null,
                  ].filter(Boolean).join("  ·  ")}
                </Text>

                {/* ─── EMPRESA / CLIENTE ─── */}
                {!!expandedBookingItem.contactName && (
                  <Text style={{ fontSize: 20, fontWeight: "700", color: "#ffffff", marginBottom: 6 }}>
                    {expandedBookingItem.contactName}
                  </Text>
                )}

                {/* ─── SERVICIO · CON PROFESIONAL (merged) ─── */}
                {!!(expandedBookingItem.notes || expandedBookingItem.intentLabel || expandedBookingItem.professionalName) && (() => {
                  const servicio = trSector(expandedBookingItem.notes || expandedBookingItem.intentLabel || "", lang);
                  const profRaw = expandedBookingItem.professionalName || "";
                  const profClean = profRaw === "Sin preferencia" ? "" : profRaw.replace(/^[\p{Emoji}\s]+/u, "").trim() || profRaw;
                  const profPart = profClean ? t('biz_with_pro').replace(/:\s*$/, ' ') + profClean : "";
                  const merged = [servicio, profPart].filter(Boolean).join("  ·  ");
                  if (!merged) return null;
                  return (
                    <Text style={{ fontSize: 16, fontWeight: "600", color: "rgba(255,255,255,0.82)", marginBottom: 8 }}>
                      {merged}
                    </Text>
                  );
                })()}

                {/* ─── DIRECCIÓN ─── */}
                {!!expandedBookingItem.place && (
                  <Text style={{ fontSize: 14, color: "rgba(255,255,255,0.48)", marginBottom: 6, lineHeight: 21 }}>
                    {expandedBookingItem.place}
                  </Text>
                )}

                {/* ─── MENSAJE AL PROFESIONAL ─── */}
                {!!expandedBookingItem.bookingMessageToStaff && (
                  <Text style={{ fontSize: 14, color: "#93c5fd", marginBottom: 8, lineHeight: 21, fontStyle: "italic" }}>
                    {expandedBookingItem.bookingMessageToStaff}
                  </Text>
                )}

                {/* ─── CAMBIO PROPUESTO / ACEPTADO — visible cuando existe changeProposal ─── */}
                {!!(expandedBookingItem as any).changeProposal && (() => {
                  const cp = (expandedBookingItem as any).changeProposal;
                  const _expEstado = expandedBookingItem.estado;
                  const _expAccepted = _expEstado === "aceptado";
                  const _expColor   = _expAccepted ? "#22c55e" : "#FF8C00";
                  const _expAlpha70 = _expAccepted ? "rgba(34,197,94,0.70)"  : "rgba(255,140,0,0.70)";
                  const _expAlpha20 = _expAccepted ? "rgba(34,197,94,0.20)"  : "rgba(255,140,0,0.20)";
                  const _expAlpha16 = _expAccepted ? "rgba(34,197,94,0.16)"  : "rgba(255,140,0,0.16)";
                  // Usar datos guardados directamente — nunca recalcular desde ISO ni sistema
                  const _clean = (s: string) => (s || "").replace(/,\s*/g, " ").trim();
                  const _origLabel = [_clean(cp.originalDate), cp.originalTime].filter(Boolean).join(" · ");
                  const _propLabel  = [_clean(cp.date), cp.time].filter(Boolean).join(" · ");
                  const _isReceivedExp = _expEstado === "propuesto";
                  const _expHeaderLabel = _expAccepted
                    ? t('biz_change_accepted')
                    : _isReceivedExp ? t('biz_change_received') : t('biz_change_proposed');
                  const _expHeaderIcon = _expAccepted ? "check-circle" : "refresh-cw";
                  return (
                    <View style={{ marginTop: 12, marginBottom: 4, borderRadius: 12, borderWidth: 1.5, borderColor: _expAlpha70, backgroundColor: "rgba(8,6,4,0.92)", padding: 14, gap: 12 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: _expAlpha16, alignItems: "center", justifyContent: "center" }}>
                          <Feather name={_expHeaderIcon} size={11} color={_expColor} />
                        </View>
                        <Text style={{ color: _expColor, fontSize: 12, fontFamily: "Inter_900Black", fontWeight: "900", letterSpacing: 0.5 }}>{_expHeaderLabel}</Text>
                      </View>
                      <View style={{ height: 1, backgroundColor: _expAlpha20 }} />
                      <View style={{ flexDirection: "row", gap: 14 }}>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ color: _expColor, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>{t('biz_booking_date_orig')}</Text>
                          <Text style={{ color: "rgba(255,255,255,0.90)", fontSize: 13, fontWeight: "700", lineHeight: 18 }} numberOfLines={2}>{_origLabel || "—"}</Text>
                        </View>
                        <View style={{ flex: 1, gap: 3 }}>
                          <Text style={{ color: _expColor, fontSize: 9, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>{_expAccepted ? t('biz_booking_date_new') : t('biz_booking_date_proposed')}</Text>
                          <Text style={{ color: "rgba(255,255,255,0.90)", fontSize: 13, fontWeight: "700", lineHeight: 18 }} numberOfLines={2}>{_propLabel || "—"}</Text>
                        </View>
                      </View>
                      <View style={{ height: 1, backgroundColor: _expAlpha16 }} />
                      {_expAccepted ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Feather name="check" size={11} color={_expColor} />
                          <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "600" }}>{t('biz_booking_updated')}</Text>
                        </View>
                      ) : !_isReceivedExp ? (
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Feather name="clock" size={11} color={_expColor} />
                          <Text style={{ color: "rgba(255,255,255,0.82)", fontSize: 12, fontWeight: "600" }}>{t('biz_booking_awaiting')}</Text>
                        </View>
                      ) : null}
                    </View>
                  );
                })()}

                {/* ─── DIVIDER ─── */}
                <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginTop: 16, marginBottom: 16 }} />

                {/* ─── ESTADO PILLS ─── */}
                {onChangeEstado && (
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                    {ESTADO_OPTIONS.map((opt) => {
                      const isActive =
                        expandedBookingItem.estado === opt.key ||
                        (opt.key === "propuesto" &&
                          (expandedBookingItem.estado === "propuesto" || expandedBookingItem.estado === "propuesta_pendiente"));
                      return (
                        <TouchableOpacity
                          key={opt.key}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                            const resolved = resolveEstado(expandedBookingItem.estado, opt.key);
                            onChangeEstado(expandedBookingItem.id, resolved);
                            if (opt.key === "propuesto" && onProposeItem) onProposeItem(expandedBookingItem.id);
                            setExpandedBookingItem((prev) => prev ? { ...prev, estado: resolved } : prev);
                          }}
                          style={{
                            flex: 1, paddingVertical: 12,
                            borderRadius: 12, borderWidth: 1.5,
                            alignItems: "center", justifyContent: "center",
                            backgroundColor: isActive ? opt.color + "22" : "rgba(255,255,255,0.04)",
                            borderColor: isActive ? opt.color : opt.color + "55",
                          }}
                          activeOpacity={0.7}
                        >
                          <Feather
                            name={(isActive ? opt.icon : opt.iconInactive) as any}
                            size={18}
                            color={isActive ? opt.color : opt.color + "80"}
                          />
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                {/* ─── ACTION ROW: Mensaje + Eliminar ─── */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                  <TouchableOpacity
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      const item = expandedBookingItem;
                      setExpandedBookingItem(null);
                      setExpandedCardId(null);
                      setTimeout(() => handleOpenMessage(item), 80);
                    }}
                    style={{
                      flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center",
                      gap: 7, paddingVertical: 13, borderRadius: 12,
                      backgroundColor: "rgba(74,128,189,0.18)",
                      borderWidth: 1.5, borderColor: "rgba(74,128,189,0.55)",
                    }}
                    activeOpacity={0.75}
                  >
                    <Feather name="message-circle" size={16} color="#93c5fd" />
                    <Text style={{ color: "#93c5fd", fontSize: 14, fontWeight: "600" }}>{t('biz_message_btn')}</Text>
                  </TouchableOpacity>
                  {onDeleteItem && (
                    <TouchableOpacity
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                        onDeleteItem(expandedBookingItem.id);
                        setExpandedBookingItem(null);
                        setExpandedCardId(null);
                      }}
                      style={{
                        paddingHorizontal: 18, paddingVertical: 13, borderRadius: 12,
                        backgroundColor: "rgba(220,38,38,0.10)",
                        borderWidth: 1.5, borderColor: "rgba(220,38,38,0.35)",
                        alignItems: "center", justifyContent: "center",
                      }}
                      activeOpacity={0.75}
                    >
                      <Feather name="trash-2" size={16} color="#f87171" />
                    </TouchableOpacity>
                  )}
                </View>

              </ScrollView>

              {/* ─── FAB CLOSE BUTTONS — flotantes, bottom-right del sheet ─── */}
              <View style={{ position: "absolute", right: 16, bottom: 20, gap: 8, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => { onGoToLanding?.(); setExpandedBookingItem(null); setExpandedCardId(null); }}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#0E0E0E", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}
                  activeOpacity={0.8}
                  hitSlop={6}
                >
                  <Feather name="chevrons-down" size={15} color="rgba(255,255,255,0.50)" />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => { setExpandedBookingItem(null); setExpandedCardId(null); }}
                  style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: "#0E0E0E", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" }}
                  activeOpacity={0.8}
                  hitSlop={6}
                >
                  <Feather name="chevron-down" size={15} color="rgba(255,255,255,0.50)" />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </TouchableOpacity>
      </Modal>

      {/* ── Chat GO de la reserva — mismo sistema visual que el Chat GO ── */}
      <Modal
        visible={!!bookingMsgEntry}
        transparent
        animationType="slide"
        onRequestClose={() => { setBookingMsgEntry(null); setBookingMsgDraft(""); }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          style={{ flex: 1, justifyContent: "flex-end" }}
        >
          {/* Backdrop tap to close */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => { setBookingMsgEntry(null); setBookingMsgDraft(""); }}
            style={{ ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.72)" }}
          />

          <View style={{
            width: "100%",
            backgroundColor: "#0e0e10",
            borderTopLeftRadius: 22,
            borderTopRightRadius: 22,
            maxHeight: "92%",
            flexDirection: "column",
            shadowColor: "#000",
            shadowOpacity: 0.55,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -6 },
            elevation: 20,
          }}>
            {/* Drag handle */}
            <View style={{ alignItems: "center", paddingTop: 10, marginBottom: 2 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.15)" }} />
            </View>

            {/* Header — label only, no X */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 18, paddingTop: 10, paddingBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
                <Feather name="message-square" size={11} color="rgba(255,255,255,0.45)" />
                <Text style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, fontWeight: "700", letterSpacing: 0.5 }}>
                  CHAT GO
                </Text>
              </View>
              {!!bookingMsgEntry?.intentLabel && (
                <Text style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: "600", flex: 1 }} numberOfLines={1}>
                  · {bookingMsgEntry.intentLabel}
                </Text>
              )}
              {!!bookingMsgEntry?.professionalName && (
                <Text style={{ fontSize: 11, color: "rgba(255,255,255,0.40)", fontWeight: "600", flex: 1 }} numberOfLines={1}>
                  {t('biz_with_pro').replace(/:\s*$/, ' ') + (bookingMsgEntry.professionalName.replace(/^[\p{Emoji}\s]+/u, "").trim() || bookingMsgEntry.professionalName)}
                </Text>
              )}
            </View>

            {/* Booking ref chip — compact, auto-width */}
            {!!bookingMsgEntry && ((bookingMsgEntry as any).bookingDate || bookingMsgEntry.time) && (
              <View style={{ marginHorizontal: 18, marginBottom: 10, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.05)", borderWidth: 1, borderColor: "rgba(255,255,255,0.08)", flexDirection: "row", gap: 8, flexWrap: "wrap", alignSelf: "flex-start" }}>
                {!!(bookingMsgEntry as any).bookingDate && (
                  <Text style={{ color: "rgba(255,255,255,0.50)", fontSize: 11 }}>
                    <Text style={{ color: "rgba(255,255,255,0.28)", fontWeight: "700" }}>{t('biz_chat_date_lbl')}  </Text>
                    {(bookingMsgEntry as any).bookingDate}{(bookingMsgEntry as any).bookingTime ? `  ·  ${(bookingMsgEntry as any).bookingTime}` : ""}
                  </Text>
                )}
                {!(bookingMsgEntry as any).bookingDate && !!bookingMsgEntry.time && (
                  <Text style={{ color: "rgba(255,255,255,0.50)", fontSize: 11 }}>
                    <Text style={{ color: "rgba(255,255,255,0.28)", fontWeight: "700" }}>{t('biz_chat_time_lbl')}  </Text>
                    {bookingMsgEntry.time}{bookingMsgEntry.duration ? `  ·  ${bookingMsgEntry.duration}` : ""}
                  </Text>
                )}
              </View>
            )}

            {/* Chat thread */}
            {(() => {
              if (!bookingMsgEntry) return null;
              const chatKey = bookingChatKey(bookingMsgEntry);
              // Merge prop messages with local optimistic messages, dedup by messageId
              const _propMsgs  = goChats?.[chatKey] || [];
              const _localMsgs = localChatMsgs[chatKey] || [];
              const _propIds   = new Set(_propMsgs.map((m) => m.messageId));
              // Keep local msgs whose ID hasn't been absorbed by the prop yet
              const _pendingLocal = _localMsgs.filter((m) => !_propIds.has(m.messageId));
              const chatMessages = [..._propMsgs, ..._pendingLocal].sort((a, b) => a.createdAt - b.createdAt);
              const isEmpresaView = bookingMsgEntry.kind === "received";
              const now = Date.now();
              return (
                <ScrollView
                  ref={chatScrollRef}
                  style={{ flex: 1, paddingHorizontal: 18 }}
                  contentContainerStyle={{ paddingBottom: 12, gap: 6 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  onContentSizeChange={() => chatScrollRef.current?.scrollToEnd({ animated: false })}
                >
                  {chatMessages.length === 0 ? (
                    <View style={{ alignItems: "center", paddingVertical: 20 }}>
                      <Feather name="message-square" size={22} color="rgba(255,255,255,0.18)" />
                      <Text style={{ color: "rgba(255,255,255,0.28)", fontSize: 12, marginTop: 8 }}>
                        No hay mensajes aún
                      </Text>
                    </View>
                  ) : chatMessages.map((m) => {
                    const d = new Date(m.createdAt);
                    const timeStr = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
                    const isOnRight = isEmpresaView ? m.senderType === "empresa" : m.senderType === "cliente";
                    const isCliente = m.senderType === "cliente";
                    const bubbleBg = isOnRight
                      ? "rgba(74,128,189,0.22)"
                      : "rgba(255,255,255,0.07)";
                    const bubbleBorder = isOnRight
                      ? "rgba(74,128,189,0.50)"
                      : "rgba(255,255,255,0.10)";
                    // Double-check after 10s (simulated delivery), single check immediately
                    const isDelivered = (now - m.createdAt) > 10000;
                    return (
                      <View key={m.messageId} style={{ marginBottom: 6, alignItems: isOnRight ? "flex-end" : "flex-start" }}>
                        <Text style={{
                          color: isCliente ? "rgba(147,197,253,0.75)" : "rgba(110,231,183,0.75)",
                          fontSize: 9, fontWeight: "700", letterSpacing: 0.4,
                          marginBottom: 2, paddingHorizontal: 4,
                        }}>
                          {m.senderName.toUpperCase()}
                        </Text>
                        <View style={{
                          maxWidth: "78%",
                          backgroundColor: bubbleBg,
                          borderRadius: 10,
                          borderTopRightRadius: isOnRight ? 3 : 10,
                          borderTopLeftRadius: isOnRight ? 10 : 3,
                          borderWidth: 1,
                          borderColor: bubbleBorder,
                          paddingHorizontal: 11,
                          paddingTop: 8,
                          paddingBottom: 6,
                        }}>
                          <Text style={{ color: "#e5e7eb", fontSize: 13, lineHeight: 18 }}>{m.text}</Text>
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, justifyContent: "flex-end" }}>
                            <Text style={{ color: "rgba(255,255,255,0.38)", fontSize: 10 }}>{timeStr}</Text>
                            {isOnRight && (
                              isDelivered ? (
                                /* Double check — delivered */
                                <View style={{ flexDirection: "row", marginLeft: 1 }}>
                                  <Feather name="check" size={11} color="#4A80BD" style={{ marginRight: -5 }} />
                                  <Feather name="check" size={11} color="#4A80BD" />
                                </View>
                              ) : (
                                /* Single check — sent */
                                <Feather name="check" size={11} color="rgba(255,255,255,0.40)" />
                              )
                            )}
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </ScrollView>
              );
            })()}

            {/* Separator */}
            <View style={{ height: 1, backgroundColor: "rgba(255,255,255,0.07)", marginHorizontal: 18, marginVertical: 8 }} />

            {/* Input + botones — input ancho a la izquierda, columna de botones a la derecha */}
            <View style={{ paddingHorizontal: 14, paddingTop: 6, paddingBottom: 8, flexDirection: "row", alignItems: "flex-end", gap: 8 }}>
              {/* Campo de escritura — ocupa todo el espacio libre */}
              <TextInput
                value={bookingMsgDraft}
                onChangeText={setBookingMsgDraft}
                placeholder="Escribe tu mensaje…"
                placeholderTextColor="#9CA3AF"
                multiline
                autoFocus
                style={{
                  flex: 1,
                  color: "#111827",
                  fontSize: 14,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: "#F9FAFB",
                  borderWidth: 1.5,
                  borderColor: bookingMsgDraft.trim() ? "#4A80BD" : "rgba(0,0,0,0.12)",
                  minHeight: 44,
                  maxHeight: 120,
                  textAlignVertical: "top",
                }}
                onSubmitEditing={sendGoChat}
                blurOnSubmit={false}
              />
              {/* Columna derecha: Enviar encima, Cerrar debajo */}
              <View style={{ flexDirection: "column", gap: 6, alignItems: "center" }}>
                {/* Botón Enviar */}
                <TouchableOpacity
                  onPress={sendGoChat}
                  disabled={!bookingMsgDraft.trim()}
                  activeOpacity={0.8}
                  style={{
                    width: 40, height: 40,
                    borderRadius: 11,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: bookingMsgDraft.trim() ? "#4A80BD" : "rgba(255,255,255,0.08)",
                  }}
                >
                  <Feather name="send" size={16} color={bookingMsgDraft.trim() ? "#ffffff" : "rgba(255,255,255,0.25)"} />
                </TouchableOpacity>
                {/* Botón Cerrar */}
                <TouchableOpacity
                  onPress={() => { setBookingMsgEntry(null); setBookingMsgDraft(""); }}
                  activeOpacity={0.7}
                  style={{
                    width: 40, height: 40, borderRadius: 11,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.07)",
                    borderWidth: 1, borderColor: "rgba(255,255,255,0.12)",
                  }}
                >
                  <Feather name="chevron-down" size={17} color="rgba(255,255,255,0.55)" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

export function AgendaOperativa({
  visible,
  onClose,
  goLog,
  selectedDateISO,
  sortOrder,
  onToggleSortOrder,
  onSelectDay,
  onSelectItem,
  onMoveItem,
  onOpenMoveFlow,
  onCompleteItem,
  onDeleteItem,
  onProposeItem,
  onOpenMessage,
  onSaveBookingMessage,
  goChats,
  onSendGoChat,
  calSizeKey,
  initialView = "semana",
  // ── Props controlados: density y showHours vienen del padre (index.tsx).
  // Son la única fuente de verdad — el Calendario madre no duplica estado propio.
  density = "auto",
  showHours = true,
  onDensityChange,
  onShowHoursChange,
  onCalDayNightModeChange,
}: FullProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectionMode, setSelectionMode] = useState(false);
  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setSelectionMode(false);
  }, []);
  useEffect(() => { if (!visible) clearSelection(); }, [visible, clearSelection]);
  const { lang, t } = useLanguage();
  const monthNamesArr = lang === "en" ? MONTH_NAMES_EN : MONTH_NAMES_ES;
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;

  // Setters pasan cambios al padre (que persiste y gestiona el estado)
  const setDensity = (d: DensityKey) => { onDensityChange?.(d); };
  const setShowHours = (updater: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof updater === "function" ? updater(showHours) : updater;
    onShowHoursChange?.(next);
  };

  // ── Office mode (internal, persisted) ─────────────────────────────
  const [officeMode, setOfficeModeState] = useState(false);
  useEffect(() => {
    AsyncStorage.getItem("cal_office_mode_v1").then(v => { if (v === "1") setOfficeModeState(true); }).catch(() => {});
  }, []);
  const setOfficeMode = (next: boolean) => {
    setOfficeModeState(next);
    AsyncStorage.setItem("cal_office_mode_v1", next ? "1" : "0").catch(() => {});
  };

  // ── Modo día/noche (internal, persisted) ──────────────────────────
  const [calDayNightModeInternal, setCalDayNightModeInternal] = useState<CalDayNightMode>("mixto");
  useEffect(() => {
    AsyncStorage.getItem("cal_day_night_mode_v1").then(v => {
      if (v === "claro" || v === "oscuro" || v === "mixto") setCalDayNightModeInternal(v);
    }).catch(() => {});
  }, []);
  const setCalDayNightMode = (mode: CalDayNightMode) => {
    setCalDayNightModeInternal(mode);
    AsyncStorage.setItem("cal_day_night_mode_v1", mode).catch(() => {});
    onCalDayNightModeChange?.(mode);
  };

  // ── Panel de configuración abierto/cerrado ────────────────────────
  // Siempre cerrado al entrar: el usuario decide cuándo abrirlo.
  // El componente nunca se desmonta, así que el useEffect resetea
  // el estado cada vez que el Calendario se vuelve visible.
  const [configPanelOpen, setConfigPanelOpen] = useState(false);
  useEffect(() => {
    if (visible) setConfigPanelOpen(false);
  }, [visible]);

  // ── Token interno para scroll-to-HOY desde botón dentro del panel ──
  const [localTodayToken, setLocalTodayToken] = useState(0);

  const [selectedProvider, setSelectedProvider] = useState<Business | null>(null);

  // ── VIEW MODE STATE ──────────────────────────────────────────────────────────────
  type CalView = "semana" | "mes_lineal" | "dia";
  const [calView, setCalView] = useState<CalView>(initialView);
  // Sync view if the parent changes the initial view (e.g. re-opening from a different context)
  useEffect(() => { setCalView(initialView); }, [initialView]);
  const [calViewMonth, setCalViewMonth] = useState<string>(getCurrentYearMonth);

  // V1 NORMA: el calendario abre SIEMPRE en semana. El mensual solo se activa
  // desde el botón explícito del usuario, nunca se restaura automáticamente.
  useEffect(() => {
    AsyncStorage.getItem("cal_view").then((val) => {
      if (val === "semana") setCalView("semana");
      // "mes_lineal" NO se restaura: la vista mensual solo puede abrirse manualmente.
    }).catch(() => {});
  }, []);
  useEffect(() => {
    if (calView !== "dia") {
      AsyncStorage.setItem("cal_view", calView).catch(() => {});
    }
  }, [calView]);

  // ── Weather + real sunrise/sunset day/night cycle ────────────────
  const weather = useWeatherContext();

  const dayNightSV = useSharedValue(
    (() => { const p = weather.dayNightProgress; return 1 - p; })()
  );
  useEffect(() => {
    dayNightSV.value = withTiming(1 - weather.dayNightProgress, { duration: 4000 });
  }, [weather.dayNightProgress]);

  // Toggle between semana and mes_lineal
  const toggleBgView = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    if (calView !== "dia") {
      const next = calView === "mes_lineal" ? "semana" : "mes_lineal";
      setCalView(next);
    }
  }, [calView]);

  const handleChangeMonth = useCallback((dir: 1 | -1) => {
    setCalViewMonth((prev) => {
      const [y, m] = prev.split("-").map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    });
  }, []);

  // Mount management: keep rendered during the close animation so it plays fully
  const [mounted, setMounted] = useState(visible);
  // 3-state mode: "full" (open) | "peek" (minimised to handle+bar) | "closed"
  const [peekMode, setPeekMode] = useState(false);
  const translateY = useSharedValue(visible ? 0 : screenH);

  // How far down to slide for peek: just enough to hide the board but show handle + bottom bar
  const PEEK_Y = screenH * 0.87 - 130;

  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(dayNightSV.value, [0, 1], ["#0c1828", "#030305"]),
    transform: [{ translateY: translateY.value }],
  }));

  // Snap to peek position (JS-thread, called from worklet via runOnJS)
  const snapToPeek = useCallback(() => {
    setPeekMode(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
  }, []);
  const snapToFull = useCallback(() => {
    setPeekMode(false);
  }, []);
  const doClose = useCallback(() => {
    setPeekMode(false);
    onClose();
  }, [onClose]);

  // Handle-strip pan gesture — 3-stage:
  //   Short drag   (<120 px)  → snap back, no action
  //   Medium drag  (120–280)  → peek mode (minimise to bar)
  //   Long drag    (>280)     → close completely (only from peek mode feels intentional)
  const peekModeShared = useSharedValue(0); // 0 = full, 1 = peek (readable in worklet)
  useEffect(() => { peekModeShared.value = peekMode ? 1 : 0; }, [peekMode, peekModeShared]);


  const handlePan = useMemo(
    () =>
      Gesture.Pan()
        // Activate for both up (−) and down (+) swipes
        .activeOffsetY([-18, 18])
        .onUpdate((e) => {
          "worklet";
          const base = peekModeShared.value === 1 ? PEEK_Y : 0;
          const drag = e.translationY;
          if (drag > 0) {
            // Downward: rubber-band feel with 40px dead-zone
            const effective = Math.max(0, drag - 40);
            translateY.value = base + effective * 0.65;
          } else if (drag < 0 && peekModeShared.value === 1) {
            // Upward from peek → restore full
            const effective = Math.max(base + drag * 0.65, 0);
            translateY.value = effective;
          }
          // Upward from full: no visual movement (panel already at 0)
        })
        .onEnd((e) => {
          "worklet";
          const isPeek = peekModeShared.value === 1;
          const dist   = e.translationY;
          const vel    = e.velocityY;

          if (isPeek) {
            // From peek: long drag OR fast flick → close completely
            if (dist > 200 || vel > 1400) {
              translateY.value = withTiming(screenH, { duration: 220 }, (done) => {
                "worklet";
                if (done) runOnJS(doClose)();
              });
            } else if (dist < -60 || vel < -600) {
              // Swipe up from peek → restore full
              translateY.value = withSpring(0, { damping: 24, stiffness: 220, mass: 0.85 });
              runOnJS(snapToFull)();
            } else {
              // Snap back to peek
              translateY.value = withSpring(PEEK_Y, { damping: 24, stiffness: 220, mass: 0.85 });
            }
          } else if (!isPeek) {
            // Downward from full: medium drag → peek
            if (dist > 220 || vel > 1400) {
              translateY.value = withSpring(PEEK_Y, { damping: 22, stiffness: 200, mass: 0.9 });
              runOnJS(snapToPeek)();
            } else {
              // Short drag → stay full, spring back
              translateY.value = withSpring(0, { damping: 24, stiffness: 220, mass: 0.85 });
            }
          }
        }),
    [onClose, screenH, translateY, PEEK_Y, peekModeShared, snapToPeek, snapToFull, doClose]
  );

  const retrasadoItems = useMemo(
    () =>
      goLog.filter((g) => {
        if (g.deleted || g.estado === "aceptado" || g.estado === "rechazado") return false;
        if (!g.dateISO) return false; // sin fecha → no vence en la vista SEMANA
        const todayISO = formatISODate(getToday());
        if (g.dateISO < todayISO) return true;   // fecha pasada → siempre vencida
        if (g.dateISO > todayISO) return false;  // fecha futura → nunca vencida
        // Mismo día: comparar hora exacta
        if (!g.time) return false;
        const tm = g.time.match(/^(\d{1,2}):(\d{2})$/);
        if (!tm) return false;
        const now = new Date();
        const goMinutes = parseInt(tm[1], 10) * 60 + parseInt(tm[2], 10);
        const nowMinutes = now.getHours() * 60 + now.getMinutes();
        return goMinutes < nowMinutes;
      }),
    [goLog]
  );

  // Animate in / out and control mount state
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setPeekMode(false);
      translateY.value = withSpring(0, { damping: 24, stiffness: 220, mass: 0.85 });
    } else {
      // Timeout fallback: guarantee unmount even if animation callback fires with
      // done=false (e.g. a gesture interrupts the close animation mid-way).
      const cleanup = setTimeout(() => setMounted(false), 320);
      translateY.value = withTiming(
        screenH,
        { duration: 260 },
        (done) => {
          "worklet";
          if (done) runOnJS(setMounted)(false);
        }
      );
      return () => clearTimeout(cleanup);
    }
  }, [visible, screenH, translateY]);

  if (!mounted) return null;

  return (
    // box-none: the wrapper is invisible to touches; only the panel itself is interactive
    <View style={[StyleSheet.absoluteFillObject, { pointerEvents: "box-none" }]}>
      <ReAnimated.View
        style={[
          s.panel,
          animStyle,
          { paddingBottom: insets.bottom + 8 },
        ]}
        pointerEvents={visible ? "auto" : "none"}
      >
        {/* ── Handle strip — ONLY drag target for close gesture ── */}
        <GestureDetector gesture={handlePan}>
          <View style={s.handleZone}>
            {/* HOY button: visible cuando el panel está abierto */}
            {!peekMode && (
              <View style={s.handleQuickRow}>
                <TouchableOpacity
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setLocalTodayToken((t) => t + 1); }}
                  style={s.handleHoyBtn}
                  activeOpacity={0.75}
                  hitSlop={8}
                >
                  <Text style={s.handleHoyBtnText}>HOY</Text>
                </TouchableOpacity>
              </View>
            )}
            <Text style={[
              s.headerSub,
              !peekMode && retrasadoItems.length === 0 && calView === "mes_lineal" && { color: "#00e5ff" },
            ]}>
              {peekMode
                ? t("cal_header_peek")
                : retrasadoItems.length > 0
                  ? `${retrasadoItems.length} ${t("cal_header_delayed")}`
                  : calView === "mes_lineal"
                    ? t("cal_header_monthly")
                    : calView === "semana"
                      ? t("cal_header_weekly")
                      : t("cal_header_schedule")}
            </Text>
          </View>
        </GestureDetector>

        {/* ── Board — always visible in background ── */}
        <AgendaBoard
          selection={{ selectedIds, setSelectedIds, selectionMode, setSelectionMode }}
          goLog={goLog}
          selectedDateISO={selectedDateISO}
          sortOrder={sortOrder}
          onToggleSortOrder={onToggleSortOrder}
          onSelectDay={onSelectDay}
          onSelectItem={onSelectItem}
          onMoveItem={onMoveItem}
          onOpenMoveFlow={onOpenMoveFlow}
          onCompleteItem={onCompleteItem}
          onDeleteItem={onDeleteItem}
          onProposeItem={onProposeItem}
          onOpenMessage={onOpenMessage}
          onSaveBookingMessage={onSaveBookingMessage}
          goChats={goChats}
          onSendGoChat={onSendGoChat}
          embedded={false}
          calSizeKey={calSizeKey}
          viewMode={calView === "dia" ? "dia" : calView === "mes_lineal" ? "mes_lineal" : "semana"}
          calViewMonth={calViewMonth}
          onChangeMonth={handleChangeMonth}
          showHours={showHours}
          density={density}
          weatherHours={weather.weatherHours}
          weatherDays={weather.weatherDays}
          officeMode={officeMode}
          calDayNightMode={calDayNightModeInternal}
          scrollToTodayToken={localTodayToken}
        />


        {/* ── Panel de configuración del calendario (colapsable) ── */}
        {configPanelOpen && !peekMode && (
          <View style={s.configPanel}>
            {/* ── Fila 1: Vista + Horas ── */}
            <View style={s.configRow}>
              {(["dia", "semana", "mes_lineal"] as const).map((v) => {
                const label = v === "dia" ? "DÍA" : v === "semana" ? "SEM" : "MES↕";
                const isActive = calView === v;
                return (
                  <TouchableOpacity
                    key={v}
                    onPress={() => {
                      Haptics.selectionAsync().catch(() => {});
                      setCalView(v);
                    }}
                    style={[s.configBtn, isActive && s.configBtnActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.configBtnText, isActive && s.configBtnTextActive]} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
              {/* HORAS */}
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setShowHours((h) => !h); }}
                style={[s.configBtn, showHours && s.configBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={[s.configBtnText, showHours && s.configBtnTextActive]} numberOfLines={1}>HORAS</Text>
              </TouchableOpacity>
            </View>

            {/* ── Fila 2: Escala + Oficina ── */}
            <View style={s.configRow}>
              {(["auto", "1h", "30min", "15min"] as DensityKey[]).map((d) => (
                <TouchableOpacity
                  key={d}
                  onPress={() => { Haptics.selectionAsync().catch(() => {}); setDensity(d); }}
                  style={[s.configBtn, density === d && s.configBtnActive]}
                  activeOpacity={0.7}
                >
                  <Text style={[s.configBtnText, density === d && s.configBtnTextActive]} numberOfLines={1}>
                    {d === "auto" ? "AUTO" : d === "1h" ? "1H" : d === "30min" ? "30" : "15"}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setOfficeMode(!officeMode); }}
                style={[s.configBtn, officeMode && s.configBtnActive]}
                activeOpacity={0.7}
              >
                <Text style={[s.configBtnText, officeMode && s.configBtnTextActive]} numberOfLines={1}>OFIC.</Text>
              </TouchableOpacity>
            </View>

            {/* ── Fila 3: Tema ── */}
            <View style={s.configRow}>
              {([
                { key: "claro" as CalDayNightMode, label: "CLARO" },
                { key: "mixto" as CalDayNightMode, label: "MIXTO" },
                { key: "oscuro" as CalDayNightMode, label: "OSCURO" },
              ]).map(({ key, label }) => {
                const isActive = calDayNightModeInternal === key;
                return (
                  <TouchableOpacity
                    key={key}
                    onPress={() => { Haptics.selectionAsync().catch(() => {}); setCalDayNightMode(key); }}
                    style={[s.configBtn, isActive && s.configBtnActive]}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.configBtnText, isActive && s.configBtnTextActive]} numberOfLines={1}>{label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── Cierre del panel — zona pulgar derecho ── */}
            <View style={s.configCloseRow}>
              <TouchableOpacity
                onPress={() => { Haptics.selectionAsync().catch(() => {}); setConfigPanelOpen(false); }}
                style={s.configCloseBtn}
                activeOpacity={0.8}
                hitSlop={8}
                accessibilityLabel="Cerrar configuración"
              >
                <Feather name="chevron-down" size={11} color="rgba(255,255,255,0.55)" />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── Bottom action bar: sort toggle + LUPA (GO BOOKING) + close ── */}
        <View style={s.bottomBar}>
          {/* SELEC. — multi-select mode toggle */}
          <TouchableOpacity
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              if (selectionMode) {
                clearSelection();
              } else {
                setSelectionMode(true);
              }
            }}
            hitSlop={10}
            style={[s.selectModeBtn, selectionMode && s.selectModeBtnActive]}
            activeOpacity={0.7}
            accessibilityLabel="Activar selección múltiple de fichas"
          >
            <Feather
              name="check-square"
              size={13}
              color={selectionMode ? "#00e5ff" : "rgba(255,255,255,0.45)"}
            />
            <Text style={[s.selectModeBtnText, selectionMode && s.selectModeBtnTextActive]}>
              {selectionMode ? `${selectedIds.size > 0 ? selectedIds.size + " " : ""}SELEC.` : "SELEC."}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── Botón flotante de configuración — zona pulgar derecho ── */}
        {!peekMode && (
          <TouchableOpacity
            style={s.configToggleBtn}
            onPress={() => { Haptics.selectionAsync().catch(() => {}); setConfigPanelOpen(!configPanelOpen); }}
            activeOpacity={0.8}
            hitSlop={8}
            accessibilityLabel={configPanelOpen ? "Cerrar configuración" : "Abrir configuración"}
          >
            <Feather name="chevron-up" size={12} color={configPanelOpen ? "rgba(255,255,255,0.35)" : "rgba(255,255,255,0.70)"} />
            <Text style={[s.configToggleBtnText, configPanelOpen && { color: "rgba(255,255,255,0.30)" }]}>CONFIG.</Text>
          </TouchableOpacity>
        )}

        {/* ── Floating sort arrows — right side, above bottom bar ── */}
        {onToggleSortOrder && calView === "semana" && !peekMode && (
          <View style={s.floatSortWrap} pointerEvents="box-none">
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync().catch(() => {}); if (sortOrder !== "desc") onToggleSortOrder(); }}
              hitSlop={10}
              activeOpacity={0.7}
              accessibilityLabel="Ordenar desde arriba"
              style={[s.sortFab, sortOrder === "desc" && s.sortFabActive]}
            >
              <Feather
                name="chevron-up"
                size={14}
                color={sortOrder === "desc" ? "#00e5ff" : "rgba(255,255,255,0.45)"}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => { Haptics.selectionAsync().catch(() => {}); if (sortOrder !== "asc") onToggleSortOrder(); }}
              hitSlop={10}
              activeOpacity={0.7}
              accessibilityLabel="Ordenar desde abajo"
              style={[s.sortFab, sortOrder === "asc" && s.sortFabActive]}
            >
              <Feather
                name="chevron-down"
                size={14}
                color={sortOrder === "asc" ? "#00e5ff" : "rgba(255,255,255,0.45)"}
              />
            </TouchableOpacity>
          </View>
        )}

        {/* ── External provider border overlay ── */}
        {selectedProvider && (
          <View
            style={[
              s.externalBorder,
              {
                borderColor: selectedProvider.bookingColor,
                shadowColor: selectedProvider.bookingColor,
              },
            ]}
            pointerEvents="none"
          />
        )}

      </ReAnimated.View>
    </View>
  );
}


const s = StyleSheet.create({
  // ── Native bottom-sheet panel ──────────────────────────────────────
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "87%",
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1.5,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    shadowColor: "#000000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
    overflow: "hidden",
  },
  handleZone: {
    paddingTop: 10,
    paddingBottom: 8,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  handle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(0,0,0,0.15)",
    marginBottom: 7,
  },
  headerSub: {
    color: "#9CA3AF",
    fontSize: 10,
    letterSpacing: 1.2,
    fontWeight: "700",
    textAlign: "center",
  },
  // ── Calendar control bar (replaces old view selector strip) ─────
  calControlBarScroll: {
    marginHorizontal: 14,
    marginBottom: 6,
  },
  calControlBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingRight: 8,
  },
  // Month navigation
  calMonthNav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    borderRadius: 10,
    paddingVertical: 5,
    paddingHorizontal: 6,
    minWidth: 120,
  },
  calMonthNavText: {
    flex: 1,
    color: "#111827",
    fontSize: 10,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 1.2,
    textAlign: "center",
  },
  // Hours toggle
  calHoursBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 9,
    borderRadius: 10,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
  },
  calHoursBtnActive: {
    borderColor: "rgba(0,0,0,0.2)",
    backgroundColor: "#FFFFFF",
  },
  calHoursBtnText: {
    color: "#9CA3AF",
    fontSize: 9,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    letterSpacing: 1,
  },
  calHoursBtnTextActive: {
    color: "#111827",
  },

  // ── Month nav bar (inside AgendaBoard for mes_lineal) ─────────────
  monthNavBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(0,0,0,0.06)",
  },
  monthNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  monthNavTitle: {
    color: "#111827",
    fontSize: 13,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 1.2,
  },

  // ── Bottom action bar ────────────────────────────────────────────
  bottomBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 8,
    gap: 14,
    borderTopWidth: 1,
    borderTopColor: "rgba(0,0,0,0.08)",
  },
  // Calendar close button (bottom bar)
  calCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  // External provider border glow
  externalBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 22,
    borderWidth: 2,
    shadowOpacity: 0.40,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
    pointerEvents: "none",
  } as any,
  addGoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: "#3D9A84",
  },
  addGoBtnText: {
    color: "#FFFFFF",
    fontSize: 11,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 1.2,
  },
  closeBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  sortFab: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: "#0d1020",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
  },
  sortFabActive: {
    backgroundColor: "rgba(0,229,255,0.10)",
    borderColor: "rgba(0,229,255,0.55)",
  },
  floatSortWrap: {
    position: "absolute",
    right: 14,
    bottom: 58,
    flexDirection: "column",
    gap: 6,
    zIndex: 20,
  },
  // SEMANA/MES toggle button
  viewToggleBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.07,
    shadowRadius: 8,
  },
  viewToggleBtnActive: {
    borderColor: "rgba(74,128,189,0.45)",
    backgroundColor: "rgba(74,128,189,0.1)",
  },
  // ↑ Open front calendar button
  openCalBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000000",
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },

  // ── Board layout
  colsScroll: {
    flex: 1,
  },
  colsContent: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 10,
    alignItems: "stretch",
    flexGrow: 1,
  },

  // ── Column — black background always; only border changes per state
  column: {
    width: COLUMN_W,
    borderRadius: 16,
    backgroundColor: "#0d0d10",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    overflow: "hidden",
    flexShrink: 0,
    flex: 1,
    minHeight: 180,
  },
  columnRetrasados: {
    borderColor: "#d97706",
    borderWidth: 2,
    backgroundColor: "#0d0d10",
  },
  columnToday: {
    backgroundColor: "#0d0d10",
  },
  columnSelected: {
    borderColor: "#00e5ff",
    backgroundColor: "#0d0d10",
  },
  columnDragTarget: {
    borderColor: "#6ee7b7",
    backgroundColor: "#0d0d10",
  },

  // ── Column header — dark with white text; accent via bottom border only
  colHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 10,
    paddingVertical: 12,
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.12)",
    backgroundColor: "rgba(8,8,16,0.92)",
  },
  colHeaderContent: {
    flex: 1,
    alignItems: "center",
    gap: 2,
  },
  colHeaderRetrasados: {
    backgroundColor: "rgba(120,60,0,0.92)",
    borderBottomColor: "#d97706",
  },
  colHeaderToday: {
    backgroundColor: "rgba(30,30,50,0.95)",
    borderBottomColor: "rgba(255,255,255,0.55)",
  },
  colHeaderSelected: {
    backgroundColor: "rgba(0,40,60,0.95)",
    borderBottomColor: "#00e5ff",
  },
  colHeaderDragTarget: {
    backgroundColor: "rgba(20,60,40,0.95)",
    borderBottomColor: "#6ee7b7",
  },
  colHeaderDayName: {
    color: "#ffffff",
    fontSize: 13,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.8,
    textAlign: "center",
  },
  colHeaderDayDate: {
    color: "rgba(255,255,255,0.50)",
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    textAlign: "center",
  },
  colHeaderTextSelected: {
    color: "#00e5ff",
  },
  colCountBadge: {
    alignItems: "center",
    justifyContent: "center",
  },
  colCount: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  retrasadosBadge: {
    backgroundColor: "#d97706",
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  retrasadosBadgeText: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_900Black", fontWeight: "900",
  },
  alertDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: "#d97706",
  },

  // ── Column scroll
  colScroll: {
    flex: 1,
  },
  colContent: {
    padding: 7,
    gap: 7,
    paddingBottom: 12,
    // Ancla el bloque de fichas al borde inferior de cada columna.
    // flexGrow:1 → el contenedor ocupa al menos toda la altura del ScrollView.
    // justifyContent:"flex-end" → empuja las fichas hacia abajo.
    // Cuando hay más fichas de las que caben, el ScrollView sigue scrollando
    // normalmente hacia arriba para ver las más antiguas.
    flexGrow: 1,
    justifyContent: "flex-end",
  },

  // ── Empty slot
  emptySlot: {
    height: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  emptySlotText: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 0.5,
  },

  // ── Add button (inside columns — compact secondary)
  addCardBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 10,
    borderTopWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
    backgroundColor: "rgba(255,255,255,0.05)",
  },
  addCardBtnSelected: {
    borderColor: "#6ee7b7",
    backgroundColor: "rgba(110,231,183,0.08)",
  },
  addCardBtnText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    letterSpacing: 0.5,
  },

  // ── Card
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 11,
    padding: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.10)",
    borderLeftWidth: 3,
    borderLeftColor: "#555",
    gap: 4,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
  },
  cardTypeBadge: {
    borderRadius: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  cardTypeBadgeText: {
    fontSize: 8,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.6,
  },
  cardGhost: {
    opacity: 0.20,
    transform: [{ scale: 0.95 }],
  },
  // ── Multi-selection ────────────────────────────────────────────
  cardMultiSelected: {
    borderColor: "#00e5ff",
    backgroundColor: "rgba(0,229,255,0.06)",
  },
  multiCheckbox: {
    position: "absolute" as const,
    top: 6,
    right: 6,
    width: 17,
    height: 17,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "rgba(0,0,0,0.35)",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
  },
  multiCheckboxActive: {
    backgroundColor: "#00e5ff",
    borderColor: "#00e5ff",
  },
  colSelectAllBtn: {
    width: 22,
    height: 22,
    borderRadius: 5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginLeft: 4,
  },
  colSelectAllBtnActive: {
    backgroundColor: "rgba(0,229,255,0.12)",
    borderColor: "rgba(0,229,255,0.50)",
  },
  selectModeBtn: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  selectModeBtnActive: {
    backgroundColor: "rgba(0,229,255,0.10)",
    borderColor: "rgba(0,229,255,0.45)",
  },
  selectModeBtnText: {
    fontSize: 9,
    fontFamily: "Inter_900Black", fontWeight: "900" as const,
    letterSpacing: 0.8,
    color: "rgba(255,255,255,0.45)",
  },
  selectModeBtnTextActive: {
    color: "#00e5ff",
  },
  // ── Bulk action bar ────────────────────────────────────────────
  bulkBar: {
    flexDirection: "row" as const,
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 7,
    backgroundColor: "#0b0d16",
    borderTopWidth: 1,
    borderTopColor: "rgba(0,229,255,0.18)",
  },
  bulkBarLeft: {
    flexDirection: "row" as const,
    alignItems: "baseline",
    flex: 1,
  },
  bulkCount: {
    color: "#00e5ff",
    fontSize: 17,
    fontWeight: "900",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  bulkCountLabel: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 8,
    fontWeight: "700",
    letterSpacing: 0.8,
  },
  bulkActionBtn: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 9,
    borderRadius: 9,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,229,255,0.22)",
  },
  bulkActionText: {
    fontSize: 8,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.8,
  },
  bulkCancelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.07)",
    alignItems: "center",
    justifyContent: "center",
  },
  bulkDayChip: {
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.07)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.13)",
  },
  bulkDayChipToday: {
    backgroundColor: "rgba(0,229,255,0.10)",
    borderColor: "rgba(0,229,255,0.35)",
  },
  bulkDayChipName: {
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.4,
  },
  bulkDayChipDate: {
    color: "rgba(255,255,255,0.40)",
    fontSize: 7,
    fontWeight: "600",
    marginTop: 1,
  },
  cardFloat: {
    backgroundColor: "rgba(14,16,28,0.98)",
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.55)",
  },
  cardTime: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
  },
  cardTitle: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
  },
  cardSubRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  cardSub: {
    color: "#ffffff",
    fontSize: 10,
    lineHeight: 16,
    opacity: 0.75,
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  cardDurationInline: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 0.3,
    marginTop: 2,
    flexShrink: 0,
  },
  cardFooter: {
    flexDirection: "row",
    gap: 5,
    marginTop: 4,
    alignItems: "center",
  },
  estadoRow: {
    flexDirection: "row",
    flex: 1,
    gap: 4,
    marginRight: 4,
  },
  estadoPill: {
    flex: 1,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(255,0,0,0.15)",
    alignItems: "center",
    justifyContent: "center",
  },
  // ── ELIMINADOS column
  columnEliminados: {
    borderColor: "rgba(220,38,38,0.25)",
    opacity: 0.75,
  },
  colHeaderEliminados: {
    backgroundColor: "rgba(220,38,38,0.10)",
    borderBottomColor: "rgba(220,38,38,0.55)",
  },
  colHeaderTextEliminados: {
    color: "#dc2626",
  },

  // ── Time slot grid (CON HORA mode) ───────────────────────────────
  slotRow: {
    flexDirection: "row",
    flexWrap: "nowrap",
    alignItems: "center",
    paddingLeft: 5,
    paddingTop: 3,
    paddingRight: 5,
    gap: 4,
  },
  slotLabel: {
    color: "rgba(255,255,255,0.90)",
    fontSize: 10,
    fontWeight: "700",
    minWidth: 46,
    width: 46,
    flexShrink: 0,
    flexGrow: 0,
    letterSpacing: 0,
    lineHeight: 14,
  },
  slotLine: {
    flex: 1,
    height: 1,
    backgroundColor: "rgba(255,255,255,0.13)",
  },
  slotCards: {
    paddingHorizontal: 5,
    paddingBottom: 4,
    gap: 4,
  },

  // ── Density bar ──────────────────────────────────────────────────
  densityBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 6,
    gap: 6,
  },
  densityBarLabel: {
    color: "rgba(255,255,255,0.28)",
    fontSize: 8,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    letterSpacing: 1,
    marginRight: 2,
  },
  densityChip: {
    height: 26,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  densityChipActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: "rgba(255,255,255,0.45)",
  },
  densityChipText: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 10,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.8,
  },
  densityChipTextActive: {
    color: "#ffffff",
  },

  // Fila HOY + lupa en el handleZone
  handleQuickRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    marginBottom: 4,
  },
  handleHoyBtn: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
  },
  handleHoyBtnText: {
    color: "#ffffff",
    fontSize: 10,
    fontFamily: "Inter_700Bold", fontWeight: "800" as const,
    letterSpacing: 1.2,
  },

  // ── SEMANAL/MENSUAL toggle label ─────────────────────────────────
  viewToggleBtnLabel: {
    color: "#6B7280",
    fontSize: 14,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 0.8,
  },
  viewToggleBtnLabelActive: {
    color: "#4A80BD",
  },

  // ── Config panel colapsable ───────────────────────────────────────
  configPanel: {
    marginHorizontal: 0,
    marginBottom: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 8,
  },
  configRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
  },
  configBtn: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  configBtnActive: {
    backgroundColor: "rgba(255,255,255,0.14)",
    borderColor: "rgba(255,255,255,0.40)",
  },
  configBtnText: {
    color: "rgba(255,255,255,0.38)",
    fontSize: 9,
    fontFamily: "Inter_900Black", fontWeight: "900" as const,
    letterSpacing: 0.6,
  },
  configBtnTextActive: {
    color: "#ffffff",
  },
  // ── Cierre interno del panel de configuración ────────────────────
  configCloseRow: {
    flexDirection: "row" as const,
    justifyContent: "flex-end",
    paddingTop: 2,
  },
  configCloseBtn: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.18)",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },

  // ── Botón flotante de toggle configuración (pulgar derecho) ──────
  configToggleBtn: {
    position: "absolute" as const,
    right: 14,
    bottom: 114,
    flexDirection: "column" as const,
    alignItems: "center",
    gap: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "#0d1020",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.22)",
    zIndex: 20,
  },
  configToggleBtnText: {
    color: "rgba(255,255,255,0.45)",
    fontSize: 8,
    fontFamily: "Inter_900Black", fontWeight: "900" as const,
    letterSpacing: 0.8,
  },
});

// ── TIME PICKER STYLES ────────────────────────────────────────────────────────
const tp = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.1)",
    padding: 20,
    width: "100%",
    maxWidth: 360,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    flexShrink: 0,
  },
  itemTitle: {
    color: "#111827",
    fontSize: 15,
    fontFamily: "Inter_700Bold", fontWeight: "800",
    letterSpacing: 0.2,
  },
  dayLabel: {
    color: "#9CA3AF",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  sectionLabel: {
    color: "#9CA3AF",
    fontSize: 9,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 1.5,
    marginBottom: 12,
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 10,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    minWidth: 72,
  },
  chipActive: {
    backgroundColor: "rgba(74,128,189,0.1)",
    borderColor: "#4A80BD",
    shadowColor: "#4A80BD",
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  chipText: {
    color: "#6B7280",
    fontSize: 14,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 0.5,
  },
  chipTextActive: {
    color: "#4A80BD",
  },
  chipCustom: {
    paddingHorizontal: 10,
    minWidth: 72,
  },
  chipNoTime: {
    alignSelf: "flex-start",
    marginTop: 2,
    marginBottom: 16,
  },
  customRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
  },
  customInput: {
    flex: 1,
    backgroundColor: "#F7F8FA",
    borderWidth: 1,
    borderColor: "rgba(74,128,189,0.4)",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#111827",
    fontSize: 20,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    letterSpacing: 2,
    textAlign: "center",
  },
  customConfirmBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#4A80BD",
    alignItems: "center",
    justifyContent: "center",
  },
  customCancelBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
  },
  confirmBtn: {
    borderWidth: 1.5,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  confirmText: {
    fontSize: 14,
    fontFamily: "Inter_900Black", fontWeight: "900",
    letterSpacing: 2,
  },
});
