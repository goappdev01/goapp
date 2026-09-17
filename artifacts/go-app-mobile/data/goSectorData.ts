/**
 * goSectorData.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * ÚNICA FUENTE DE VERDAD para sectores, sub-actividades, colores, emojis,
 * servicios sugeridos, estructuras de espacios y el hook compartido de
 * elementos de plantilla.
 *
 * Consume:
 *   · EmpresaSetupGuide   — asistente rápido de 4 pasos
 *   · GoReservasConfigScreen — configuración general de reservas
 *   · GoBookingScreen     — edición posterior de la plantilla
 *   · Cualquier otro contexto que necesite acceso al catálogo de sectores
 *
 * Colores semánticos fijos (nunca cambiar por sector):
 *   Belleza      → #eab308   Restauración → #f97316
 *   Servicios    → #78350f   Salud        → #1e40af
 *   Actividades  → #c026d3   Deportes     → #15803d
 *   Hogar        → #d97706   Hoteles      → #7c3aed
 *   Otros        → #6B7280
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useRef, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Lang } from "@/i18n/translations";
import { trSector } from "@/data/goSectorTranslations";

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "go_plantilla_items_v1";

// ─── Unified types ────────────────────────────────────────────────────────────

export type SubActivity = {
  id: string;
  emoji: string;
  name: string;
  desc: string;
};

export type Sector = {
  id: string;
  emoji: string;
  label: string;
  desc: string;
  color: string;
  isDeportes?: boolean;
  subs: SubActivity[];
};

// ─── Master sector catalogue ──────────────────────────────────────────────────
// Cambiar aquí → se propaga automáticamente a todas las pantallas.

export const SECTORS: Sector[] = [
  {
    id: "belleza", emoji: "💇", label: "Belleza", color: "#eab308",
    desc: "Peluquerías, estética y bienestar personal",
    subs: [
      { id: "peluqueria",  emoji: "💇", name: "Peluquería",  desc: "Cortes, tintes y peinados" },
      { id: "unas",        emoji: "💅", name: "Uñas",        desc: "Manicura y pedicura" },
      { id: "masajes",     emoji: "💆", name: "Masajes",     desc: "Relajación y terapéuticos" },
      { id: "estetica",    emoji: "✨", name: "Estética",    desc: "Tratamientos faciales y corporales" },
      { id: "barberia",    emoji: "💈", name: "Barbería",    desc: "Cortes y afeitado masculino" },
      { id: "spa",         emoji: "🧖", name: "Spa",         desc: "Circuitos y tratamientos wellness" },
      { id: "maquillaje",  emoji: "💄", name: "Maquillaje",  desc: "Artístico y para eventos" },
    ],
  },
  {
    id: "restauracion", emoji: "🍽️", label: "Restauración", color: "#f97316",
    desc: "Restaurantes, bares y espacios de hostelería",
    subs: [
      { id: "restaurante",   emoji: "🍽️", name: "Restaurante",   desc: "Mesas y reservas de sala" },
      { id: "cafeteria",     emoji: "☕",  name: "Cafetería",     desc: "Mesas y terrazas" },
      { id: "bar",           emoji: "🍺",  name: "Bar",           desc: "Zonas y mesas de barra" },
      { id: "terraza",       emoji: "🌿",  name: "Terraza",       desc: "Espacio exterior" },
      { id: "comida_rapida", emoji: "🍔",  name: "Comida rápida", desc: "Servicio y mesas rápidas" },
      { id: "confiteria",    emoji: "🧁",  name: "Confitería",    desc: "Pasteles y dulces" },
      { id: "heladeria",     emoji: "🍦",  name: "Heladería",     desc: "Helados y bebidas" },
    ],
  },
  {
    id: "deportes", emoji: "🏅", label: "Deportes", color: "#15803d",
    desc: "Pistas, canchas y espacios deportivos",
    isDeportes: true,
    subs: [
      { id: "padel",           emoji: "🏓", name: "Pádel",              desc: "Pistas de pádel" },
      { id: "tenis",           emoji: "🎾", name: "Tenis",              desc: "Pistas de tenis" },
      { id: "futbol",          emoji: "⚽", name: "Fútbol sala",        desc: "Canchas de fútbol sala" },
      { id: "futbol_7",        emoji: "⚽", name: "Fútbol 7",           desc: "Campos de fútbol 7" },
      { id: "futbol_11",       emoji: "⚽", name: "Fútbol 11",          desc: "Campos de fútbol 11" },
      { id: "gimnasio",        emoji: "🏋️", name: "Gimnasio",           desc: "Sala de musculación" },
      { id: "yoga",            emoji: "🧘", name: "Yoga",               desc: "Sala de yoga" },
      { id: "pilates",         emoji: "🤸", name: "Pilates",            desc: "Salas de pilates" },
      { id: "natacion",        emoji: "🏊", name: "Natación",           desc: "Carriles de piscina" },
      { id: "squash",          emoji: "🟡", name: "Squash",             desc: "Boxes de squash" },
      { id: "badminton",       emoji: "🏸", name: "Bádminton",          desc: "Pistas de bádminton" },
      { id: "golf",            emoji: "⛳", name: "Golf",               desc: "Hoyos y driving range" },
      { id: "boxeo",           emoji: "🥊", name: "Boxeo",              desc: "Ring y entrenamiento" },
      { id: "artes_marciales", emoji: "🥋", name: "Artes marciales",    desc: "Tatami y clases" },
      { id: "ciclismo",        emoji: "🚴", name: "Ciclismo / Spinning", desc: "Pistas y clases indoor" },
      { id: "atletismo",       emoji: "🏃", name: "Atletismo",          desc: "Pista de atletismo" },
      { id: "escalada",        emoji: "🧗", name: "Escalada",           desc: "Rocódromo y vías" },
      { id: "tiro_arco",       emoji: "🏹", name: "Tiro con arco",      desc: "Pistas y sesiones" },
      { id: "piscina",         emoji: "💧", name: "Piscina / Aqua",     desc: "Actividades acuáticas" },
      { id: "multideporte",    emoji: "🏅", name: "Multideporte",       desc: "Instalación polideportiva" },
    ],
  },
  {
    id: "salud", emoji: "🏥", label: "Salud", color: "#1e40af",
    desc: "Clínicas, consultas y profesionales sanitarios",
    subs: [
      { id: "clinica",       emoji: "🏥",  name: "Clínica",       desc: "Consultas médicas" },
      { id: "psicologo",     emoji: "🧠",  name: "Psicólogo",     desc: "Sesiones terapéuticas" },
      { id: "fisioterapia",  emoji: "🤸",  name: "Fisioterapia",  desc: "Rehabilitación y tratamientos" },
      { id: "dentista",      emoji: "🦷",  name: "Dentista",      desc: "Consultas odontológicas" },
      { id: "medico",        emoji: "👨‍⚕️", name: "Médico",        desc: "Consultas generales y especialistas" },
      { id: "nutricionista", emoji: "🥗",  name: "Nutricionista", desc: "Planes y consultas nutricionales" },
      { id: "optometria",    emoji: "👁️",  name: "Optometría",    desc: "Revisiones visuales" },
    ],
  },
  {
    id: "actividades", emoji: "🎭", label: "Actividades", color: "#c026d3",
    desc: "Ocio, entretenimiento y experiencias",
    subs: [
      { id: "escape_room", emoji: "🔐", name: "Escape Room",  desc: "Salas de escape temáticas" },
      { id: "karting",     emoji: "🏎️", name: "Karting",      desc: "Circuitos y sesiones" },
      { id: "teatro",      emoji: "🎭", name: "Teatro",       desc: "Entradas y reservas de butaca" },
      { id: "concierto",   emoji: "🎵", name: "Concierto",    desc: "Entradas y palcos" },
      { id: "laser_tag",   emoji: "🎯", name: "Laser Tag",    desc: "Sesiones y grupos" },
      { id: "cine",        emoji: "🎬", name: "Cine",         desc: "Entradas y salas privadas" },
      { id: "realidad_vr", emoji: "🥽", name: "Realidad VR",  desc: "Experiencias de realidad virtual" },
    ],
  },
  {
    id: "servicios", emoji: "💼", label: "Servicios", color: "#78350f",
    desc: "Talleres, consultas, academias y espacios",
    subs: [
      { id: "taller",         emoji: "🔧", name: "Taller",         desc: "Reparaciones y mantenimiento" },
      { id: "consultoria",    emoji: "💼", name: "Consultoría",    desc: "Reuniones y asesoramiento" },
      { id: "academia",       emoji: "📚", name: "Academia",       desc: "Clases y formación" },
      { id: "sala_reuniones", emoji: "🖥️", name: "Sala reuniones", desc: "Espacios de trabajo" },
      { id: "fotografia",     emoji: "📷", name: "Fotografía",     desc: "Estudios y sesiones" },
      { id: "coworking",      emoji: "🏢", name: "Coworking",      desc: "Puestos y salas" },
    ],
  },
  {
    id: "hogar", emoji: "🏠", label: "Hogar", color: "#d97706",
    desc: "Profesionales a domicilio: fontanero, electricista y más",
    subs: [
      { id: "fontanero",    emoji: "🔧", name: "Fontanero",    desc: "Reparaciones de fontanería" },
      { id: "electricista", emoji: "⚡", name: "Electricista", desc: "Instalaciones eléctricas" },
      { id: "limpieza",     emoji: "🧹", name: "Limpieza",     desc: "Hogar, oficinas y locales" },
      { id: "jardineria",   emoji: "🌿", name: "Jardinería",   desc: "Mantenimiento de jardines" },
      { id: "mudanzas",     emoji: "📦", name: "Mudanzas",     desc: "Transporte y embalaje" },
      { id: "reformas",     emoji: "🏗️", name: "Reformas",     desc: "Reformas integrales y parciales" },
      { id: "cerrajero",    emoji: "🔑", name: "Cerrajero",    desc: "Apertura y cambio de cerraduras" },
      { id: "pintor",       emoji: "🎨", name: "Pintor",       desc: "Pintura interior y exterior" },
    ],
  },
  {
    id: "hoteles", emoji: "🏨", label: "Hoteles & Alojamientos", color: "#7c3aed",
    desc: "Hoteles, apartamentos y casas rurales",
    subs: [
      { id: "hotel",       emoji: "🏨", name: "Hotel",       desc: "Habitaciones y servicios" },
      { id: "apartamento", emoji: "🏠", name: "Apartamento", desc: "Alquiler vacacional" },
      { id: "casa_rural",  emoji: "🏡", name: "Casa rural",  desc: "Turismo rural" },
      { id: "hostal",      emoji: "🏯", name: "Hostal",      desc: "Alojamiento económico" },
    ],
  },
  {
    id: "otros", emoji: "✨", label: "Otros", color: "#6B7280",
    desc: "Configura cualquier tipo de reserva personalizada",
    subs: [
      { id: "personalizado", emoji: "➕", name: "Configurar desde cero", desc: "Define tus propios espacios y servicios" },
    ],
  },
];

// ─── Suggested services per sub-activity ─────────────────────────────────────
// Usado en EmpresaSetupGuide Step 2 para precargar los servicios del asistente.

export type SuggestedServiceDef = { name: string; duration: number; price: number };

export const SUGGESTED_SERVICES: Record<string, SuggestedServiceDef[]> = {
  // ── Belleza ──
  peluqueria:   [{ name: "Corte", duration: 30, price: 15 }, { name: "Lavado", duration: 15, price: 8 }, { name: "Tinte", duration: 90, price: 45 }, { name: "Peinado", duration: 30, price: 20 }, { name: "Tratamiento", duration: 45, price: 30 }],
  unas:         [{ name: "Manicura", duration: 45, price: 20 }, { name: "Pedicura", duration: 60, price: 25 }, { name: "Uñas acrílicas", duration: 90, price: 45 }, { name: "Nail art", duration: 30, price: 15 }],
  masajes:      [{ name: "Masaje 30 min", duration: 30, price: 30 }, { name: "Masaje 60 min", duration: 60, price: 55 }, { name: "Masaje 90 min", duration: 90, price: 75 }, { name: "Masaje deportivo", duration: 60, price: 60 }],
  estetica:     [{ name: "Facial básico", duration: 60, price: 45 }, { name: "Limpieza facial", duration: 45, price: 35 }, { name: "Tratamiento antiedad", duration: 75, price: 65 }, { name: "Peeling", duration: 45, price: 40 }],
  barberia:     [{ name: "Corte", duration: 30, price: 15 }, { name: "Afeitado", duration: 30, price: 20 }, { name: "Corte + afeitado", duration: 60, price: 30 }, { name: "Arreglo barba", duration: 15, price: 10 }],
  spa:          [{ name: "Tratamiento facial", duration: 60, price: 65 }, { name: "Envoltura corporal", duration: 90, price: 80 }, { name: "Aromaterapia", duration: 60, price: 55 }, { name: "Exfoliación", duration: 45, price: 50 }],
  maquillaje:   [{ name: "Maquillaje evento", duration: 60, price: 55 }, { name: "Maquillaje novia", duration: 90, price: 120 }, { name: "Maquillaje artístico", duration: 60, price: 70 }, { name: "Prueba maquillaje", duration: 60, price: 45 }],
  // ── Restauración ──
  restaurante:  [{ name: "Comida", duration: 90, price: 0 }, { name: "Cena", duration: 120, price: 0 }, { name: "Menú grupo", duration: 120, price: 0 }, { name: "Desayuno", duration: 60, price: 0 }],
  cafeteria:    [{ name: "Desayuno", duration: 30, price: 0 }, { name: "Brunch", duration: 60, price: 0 }, { name: "Merienda", duration: 30, price: 0 }],
  bar:          [{ name: "Mesa interior", duration: 120, price: 0 }, { name: "Mesa terraza", duration: 120, price: 0 }],
  terraza:      [{ name: "Mesa exterior", duration: 120, price: 0 }, { name: "Mesa interior", duration: 60, price: 0 }],
  comida_rapida:[{ name: "Mesa rápida", duration: 30, price: 0 }, { name: "Menú del día", duration: 30, price: 0 }],
  confiteria:   [{ name: "Mesa degustación", duration: 45, price: 0 }, { name: "Taller repostería", duration: 120, price: 40 }],
  heladeria:    [{ name: "Mesa interior", duration: 30, price: 0 }, { name: "Mesa exterior", duration: 30, price: 0 }],
  // ── Deportes ──
  padel:           [{ name: "Pista 1h", duration: 60, price: 18 }, { name: "Pista 1.5h", duration: 90, price: 25 }, { name: "Pista 2h", duration: 120, price: 32 }, { name: "Clase individual", duration: 60, price: 35 }],
  tenis:           [{ name: "Pista 1h", duration: 60, price: 15 }, { name: "Pista 2h", duration: 120, price: 25 }, { name: "Clase individual", duration: 60, price: 40 }, { name: "Clase grupo", duration: 60, price: 20 }],
  futbol:          [{ name: "Campo 1h", duration: 60, price: 40 }, { name: "Campo 1.5h", duration: 90, price: 55 }, { name: "Campo 2h", duration: 120, price: 70 }],
  futbol_7:        [{ name: "Campo 1h", duration: 60, price: 50 }, { name: "Campo 1.5h", duration: 90, price: 65 }, { name: "Campo 2h", duration: 120, price: 80 }],
  futbol_11:       [{ name: "Campo 1h", duration: 60, price: 70 }, { name: "Campo 1.5h", duration: 90, price: 95 }, { name: "Campo 2h", duration: 120, price: 120 }],
  gimnasio:        [{ name: "Clase yoga", duration: 60, price: 12 }, { name: "Clase spinning", duration: 45, price: 10 }, { name: "Clase pilates", duration: 55, price: 12 }, { name: "Entrenamiento personal", duration: 60, price: 45 }],
  yoga:            [{ name: "Clase yoga", duration: 60, price: 12 }, { name: "Clase meditación", duration: 45, price: 10 }, { name: "Clase prenatal", duration: 60, price: 15 }, { name: "Sesión privada", duration: 60, price: 50 }],
  pilates:         [{ name: "Clase grupal", duration: 55, price: 12 }, { name: "Clase individual", duration: 55, price: 45 }, { name: "Bono 10 clases", duration: 55, price: 100 }],
  natacion:        [{ name: "Carril 1h", duration: 60, price: 8 }, { name: "Clase adultos", duration: 45, price: 15 }, { name: "Clase infantil", duration: 30, price: 12 }, { name: "Entrenamiento personal", duration: 60, price: 40 }],
  squash:          [{ name: "Pista 30 min", duration: 30, price: 10 }, { name: "Pista 1h", duration: 60, price: 18 }, { name: "Clase individual", duration: 60, price: 35 }],
  badminton:       [{ name: "Pista 1h", duration: 60, price: 12 }, { name: "Pista 2h", duration: 120, price: 20 }, { name: "Clase individual", duration: 60, price: 30 }],
  golf:            [{ name: "Ronda 9 hoyos", duration: 120, price: 25 }, { name: "Ronda 18 hoyos", duration: 240, price: 45 }, { name: "Clase individual", duration: 60, price: 50 }, { name: "Driving range 1h", duration: 60, price: 15 }],
  boxeo:           [{ name: "Clase grupal", duration: 60, price: 12 }, { name: "Entrenamiento personal", duration: 60, price: 45 }, { name: "Sparring 1h", duration: 60, price: 30 }],
  artes_marciales: [{ name: "Clase grupal", duration: 60, price: 12 }, { name: "Clase individual", duration: 60, price: 40 }, { name: "Bono mensual", duration: 60, price: 80 }],
  ciclismo:        [{ name: "Clase spinning 45 min", duration: 45, price: 10 }, { name: "Clase spinning 1h", duration: 60, price: 12 }, { name: "Entrenamiento personal", duration: 60, price: 40 }],
  atletismo:       [{ name: "Pista 1h", duration: 60, price: 10 }, { name: "Sesión entrenamiento", duration: 90, price: 20 }, { name: "Entrenador personal", duration: 60, price: 45 }],
  escalada:        [{ name: "Sesión libre", duration: 120, price: 15 }, { name: "Sesión con guía", duration: 120, price: 35 }, { name: "Curso iniciación", duration: 90, price: 25 }],
  tiro_arco:       [{ name: "Sesión 1h", duration: 60, price: 20 }, { name: "Clase individual", duration: 60, price: 40 }, { name: "Curso iniciación", duration: 90, price: 30 }],
  piscina:         [{ name: "Entrada sesión", duration: 90, price: 6 }, { name: "Clase aquagym", duration: 45, price: 10 }, { name: "Clase bebés", duration: 30, price: 12 }],
  multideporte:    [{ name: "Uso instalaciones 1h", duration: 60, price: 8 }, { name: "Uso instalaciones día", duration: 480, price: 20 }, { name: "Bono mensual", duration: 480, price: 60 }],
  // ── Salud ──
  clinica:      [{ name: "Consulta general", duration: 30, price: 60 }, { name: "Revisión", duration: 15, price: 30 }, { name: "Seguimiento", duration: 20, price: 40 }],
  psicologo:    [{ name: "Sesión individual", duration: 60, price: 70 }, { name: "Sesión de pareja", duration: 90, price: 90 }, { name: "Primera consulta", duration: 60, price: 60 }],
  fisioterapia: [{ name: "Sesión 60 min", duration: 60, price: 50 }, { name: "Sesión 30 min", duration: 30, price: 30 }, { name: "Drenaje linfático", duration: 60, price: 55 }, { name: "Taping", duration: 30, price: 25 }],
  dentista:     [{ name: "Revisión", duration: 30, price: 50 }, { name: "Limpieza", duration: 45, price: 60 }, { name: "Empaste", duration: 60, price: 80 }, { name: "Ortodoncia revisión", duration: 20, price: 40 }],
  medico:       [{ name: "Consulta general", duration: 20, price: 55 }, { name: "Revisión", duration: 15, price: 35 }, { name: "Consulta especialista", duration: 30, price: 80 }],
  nutricionista:[{ name: "Primera consulta", duration: 60, price: 70 }, { name: "Seguimiento", duration: 30, price: 45 }, { name: "Plan nutricional", duration: 60, price: 80 }],
  optometria:   [{ name: "Revisión visual", duration: 30, price: 40 }, { name: "Examen completo", duration: 60, price: 70 }, { name: "Adaptación lentillas", duration: 45, price: 55 }],
  // ── Actividades ──
  escape_room:  [{ name: "Sala 60 min", duration: 60, price: 20 }, { name: "Sala 90 min", duration: 90, price: 25 }, { name: "Sala privada (grupo)", duration: 60, price: 100 }],
  karting:      [{ name: "Sesión 10 min", duration: 10, price: 12 }, { name: "Sesión 20 min", duration: 20, price: 20 }, { name: "Karting + foto", duration: 20, price: 25 }],
  teatro:       [{ name: "Obra principal", duration: 120, price: 20 }, { name: "Función infantil", duration: 60, price: 12 }, { name: "Taller de teatro", duration: 90, price: 25 }],
  concierto:    [{ name: "Entrada general", duration: 120, price: 25 }, { name: "Entrada VIP", duration: 120, price: 60 }, { name: "Palco privado", duration: 120, price: 200 }],
  laser_tag:    [{ name: "Sesión individual", duration: 20, price: 10 }, { name: "Sesión grupo (6)", duration: 20, price: 50 }, { name: "Bono 3 sesiones", duration: 60, price: 25 }],
  cine:         [{ name: "Sesión estándar", duration: 120, price: 9 }, { name: "Sesión VIP", duration: 120, price: 15 }, { name: "Maratón cine", duration: 240, price: 20 }],
  realidad_vr:  [{ name: "Experiencia 15 min", duration: 15, price: 12 }, { name: "Experiencia 30 min", duration: 30, price: 20 }, { name: "Sesión privada 1h", duration: 60, price: 45 }],
  // ── Servicios ──
  taller:       [{ name: "Diagnóstico", duration: 60, price: 50 }, { name: "Reparación básica", duration: 120, price: 80 }, { name: "Mantenimiento", duration: 90, price: 65 }],
  consultoria:  [{ name: "Consulta inicial", duration: 60, price: 100 }, { name: "Sesión estrategia", duration: 90, price: 150 }, { name: "Mentoría", duration: 60, price: 80 }],
  academia:     [{ name: "Clase individual", duration: 60, price: 40 }, { name: "Clase grupo", duration: 60, price: 20 }, { name: "Intensivo", duration: 120, price: 70 }],
  sala_reuniones:[{ name: "Sala pequeña 1h", duration: 60, price: 20 }, { name: "Sala grande 1h", duration: 60, price: 40 }, { name: "Sala día completo", duration: 480, price: 150 }],
  fotografia:   [{ name: "Sesión retrato", duration: 60, price: 80 }, { name: "Sesión producto", duration: 120, price: 150 }, { name: "Reportaje evento", duration: 180, price: 300 }],
  coworking:    [{ name: "Puesto día completo", duration: 480, price: 25 }, { name: "Sala reunión 1h", duration: 60, price: 20 }, { name: "Sala reunión 2h", duration: 120, price: 35 }],
  // ── Hogar ──
  fontanero:    [{ name: "Visita diagnóstico", duration: 60, price: 50 }, { name: "Reparación urgente", duration: 120, price: 120 }, { name: "Instalación", duration: 180, price: 150 }],
  electricista: [{ name: "Visita diagnóstico", duration: 60, price: 50 }, { name: "Reparación", duration: 120, price: 100 }, { name: "Instalación", duration: 180, price: 140 }],
  limpieza:     [{ name: "Limpieza hogar", duration: 120, price: 60 }, { name: "Limpieza oficina", duration: 120, price: 80 }, { name: "Limpieza a fondo", duration: 240, price: 120 }],
  jardineria:   [{ name: "Mantenimiento básico", duration: 120, price: 60 }, { name: "Poda y limpieza", duration: 180, price: 90 }, { name: "Diseño jardín", duration: 240, price: 150 }],
  mudanzas:     [{ name: "Mudanza piso", duration: 240, price: 200 }, { name: "Traslado muebles", duration: 120, price: 100 }, { name: "Embalaje y transporte", duration: 180, price: 150 }],
  reformas:     [{ name: "Visita presupuesto", duration: 60, price: 0 }, { name: "Reforma baño", duration: 4800, price: 2500 }, { name: "Reforma cocina", duration: 4800, price: 3000 }],
  cerrajero:    [{ name: "Apertura urgente", duration: 30, price: 80 }, { name: "Cambio cerradura", duration: 60, price: 100 }, { name: "Duplicado llave", duration: 30, price: 20 }],
  pintor:       [{ name: "Habitación", duration: 240, price: 150 }, { name: "Piso completo", duration: 960, price: 500 }, { name: "Local comercial", duration: 480, price: 300 }],
  // ── Hoteles ──
  hotel:        [{ name: "Habitación individual", duration: 1440, price: 80 }, { name: "Habitación doble", duration: 1440, price: 110 }, { name: "Suite", duration: 1440, price: 180 }],
  apartamento:  [{ name: "Apartamento 1 noche", duration: 1440, price: 90 }, { name: "Fin de semana", duration: 4320, price: 220 }],
  casa_rural:   [{ name: "Habitación 1 noche", duration: 1440, price: 70 }, { name: "Casa completa", duration: 1440, price: 200 }],
  hostal:       [{ name: "Cama individual", duration: 1440, price: 25 }, { name: "Habitación doble", duration: 1440, price: 45 }, { name: "Habitación privada", duration: 1440, price: 55 }],
};

// ─── Pre-loaded space/zone structures per sub-activity ─────────────────────────

export const SECTOR_STRUCTURES: Record<string, { emoji: string; label: string }[]> = {
  // Belleza
  peluqueria:   [{ emoji: "💺", label: "Puestos de trabajo" }],
  unas:         [{ emoji: "💅", label: "Puestos de manicura" }],
  masajes:      [{ emoji: "🛏️", label: "Cabinas de masaje" }],
  barberia:     [{ emoji: "💺", label: "Sillas de barbero" }],
  spa:          [{ emoji: "🧖", label: "Salas de tratamiento" }],
  estetica:     [{ emoji: "✨", label: "Cabinas de estética" }],
  maquillaje:   [{ emoji: "💄", label: "Puestos de maquillaje" }],
  // Restauración
  restaurante:  [{ emoji: "🪑", label: "Mesas interiores" }, { emoji: "🌿", label: "Terraza" }, { emoji: "🍺", label: "Barra" }],
  cafeteria:    [{ emoji: "🪑", label: "Mesas" }, { emoji: "☕", label: "Barra" }, { emoji: "🌿", label: "Zona exterior" }],
  bar:          [{ emoji: "🍺", label: "Barra" }, { emoji: "🪑", label: "Mesas" }, { emoji: "🌿", label: "Terraza" }],
  terraza:      [{ emoji: "🌿", label: "Terraza exterior" }, { emoji: "🪑", label: "Zona interior" }],
  comida_rapida:[{ emoji: "🍔", label: "Mesas" }, { emoji: "🥡", label: "Mostrador / barra" }],
  confiteria:   [{ emoji: "🧁", label: "Mesas de degustación" }, { emoji: "🏪", label: "Mostrador" }],
  heladeria:    [{ emoji: "🍦", label: "Mesas interiores" }, { emoji: "🌿", label: "Mesas exteriores" }],
  // Deportes
  padel:           [{ emoji: "🏓", label: "Pistas de pádel" }],
  tenis:           [{ emoji: "🎾", label: "Pistas de tenis" }],
  futbol:          [{ emoji: "⚽", label: "Canchas de fútbol sala" }],
  futbol_sala:     [{ emoji: "⚽", label: "Canchas de fútbol sala" }],
  futbol_7:        [{ emoji: "⚽", label: "Campos de fútbol 7" }],
  futbol_11:       [{ emoji: "⚽", label: "Campos de fútbol 11" }],
  gimnasio:        [{ emoji: "🏋️", label: "Sala de musculación" }, { emoji: "🧘", label: "Sala de clases" }],
  yoga:            [{ emoji: "🧘", label: "Salas de yoga" }],
  pilates:         [{ emoji: "🤸", label: "Salas de pilates" }],
  natacion:        [{ emoji: "🏊", label: "Carriles de piscina" }, { emoji: "💧", label: "Zona acuática" }],
  squash:          [{ emoji: "🟡", label: "Boxes de squash" }],
  badminton:       [{ emoji: "🏸", label: "Pistas de bádminton" }],
  golf:            [{ emoji: "⛳", label: "Hoyos / driving range" }],
  boxeo:           [{ emoji: "🥊", label: "Ring de boxeo" }, { emoji: "🏋️", label: "Zona de entrenamiento" }],
  artes_marciales: [{ emoji: "🥋", label: "Tatami" }, { emoji: "🏃", label: "Zona libre" }],
  ciclismo:        [{ emoji: "🚴", label: "Bicicletas spinning" }],
  atletismo:       [{ emoji: "🏃", label: "Pista de atletismo" }],
  escalada:        [{ emoji: "🧗", label: "Vías de escalada" }, { emoji: "🏔️", label: "Boulder" }],
  tiro_arco:       [{ emoji: "🏹", label: "Pistas de tiro" }],
  piscina:         [{ emoji: "🏊", label: "Carriles de natación" }, { emoji: "💧", label: "Zona recreativa" }],
  multideporte:    [{ emoji: "🏅", label: "Polideportivo" }, { emoji: "🎯", label: "Salas multiusos" }],
  // Salud
  clinica:      [{ emoji: "🏥", label: "Consultas" }],
  fisioterapia: [{ emoji: "🛏️", label: "Cabinas de fisio" }],
  dentista:     [{ emoji: "🦷", label: "Sillones dentales" }],
  psicologo:    [{ emoji: "🧠", label: "Consultas" }],
  medico:       [{ emoji: "🏥", label: "Consultas médicas" }],
  nutricionista:[{ emoji: "🥗", label: "Consultas" }],
  optometria:   [{ emoji: "👁️", label: "Consultas de optometría" }],
  // Hogar
  fontanero:    [{ emoji: "🔧", label: "Servicios a domicilio" }, { emoji: "🚐", label: "Desplazamientos" }],
  electricista: [{ emoji: "⚡", label: "Servicios a domicilio" }, { emoji: "🚐", label: "Desplazamientos" }],
  limpieza:     [{ emoji: "🧹", label: "Servicios de limpieza" }, { emoji: "🚐", label: "Desplazamientos" }],
  cerrajero:    [{ emoji: "🔑", label: "Servicios a domicilio" }, { emoji: "🚐", label: "Desplazamientos" }],
  jardineria:   [{ emoji: "🌿", label: "Servicios de jardinería" }],
  mudanzas:     [{ emoji: "📦", label: "Servicios de mudanza" }],
  reformas:     [{ emoji: "🏗️", label: "Proyectos de reforma" }],
  pintor:       [{ emoji: "🎨", label: "Servicios de pintura" }],
  // Actividades
  escape_room:  [{ emoji: "🔐", label: "Salas de escape" }],
  karting:      [{ emoji: "🏎️", label: "Circuito principal" }],
  teatro:       [{ emoji: "🎭", label: "Sala principal" }],
  cine:         [{ emoji: "🎬", label: "Salas de proyección" }],
  concierto:    [{ emoji: "🎵", label: "Sala de conciertos" }, { emoji: "🎤", label: "Palcos / zonas VIP" }],
  laser_tag:    [{ emoji: "🎯", label: "Arenas de juego" }],
  realidad_vr:  [{ emoji: "🥽", label: "Cabinas VR" }],
  // Servicios
  taller:       [{ emoji: "🔧", label: "Puestos de taller" }],
  consultoria:  [{ emoji: "💼", label: "Salas de reunión" }, { emoji: "🏢", label: "Oficinas" }],
  academia:     [{ emoji: "📚", label: "Aulas" }],
  sala_reuniones:[{ emoji: "🖥️", label: "Salas pequeñas" }, { emoji: "🏢", label: "Salas grandes" }],
  fotografia:   [{ emoji: "📷", label: "Estudio fotográfico" }, { emoji: "🌿", label: "Sets exteriores" }],
  coworking:    [{ emoji: "🏢", label: "Puestos de trabajo" }, { emoji: "🎯", label: "Salas de reunión" }],
  // Hoteles
  hotel:        [{ emoji: "🛏️", label: "Habitaciones" }],
  apartamento:  [{ emoji: "🏠", label: "Apartamentos" }],
  casa_rural:   [{ emoji: "🏡", label: "Habitaciones" }, { emoji: "🌿", label: "Zonas exteriores" }],
  hostal:       [{ emoji: "🏯", label: "Camas / habitaciones" }],
};

// ─── Contextual add-button label per sector ───────────────────────────────────

export const ADD_ELEMENT_LABEL: Record<string, string> = {
  restauracion: "Añadir zona / mesa / espacio",
  belleza:      "Añadir puesto / profesional",
  hogar:        "Añadir servicio",
  deportes:     "Añadir pista / recurso",
  hoteles:      "Añadir habitación / espacio",
  salud:        "Añadir consulta / espacio",
  actividades:  "Añadir sala / recurso",
  servicios:    "Añadir espacio / servicio",
  otros:        "Añadir elemento",
};

// ─── Sub-activity → sector mapping ───────────────────────────────────────────

export const SUB_TO_SECTOR: Record<string, string> = {
  restaurante: "restauracion", cafeteria: "restauracion", bar: "restauracion",
  terraza: "restauracion", comida_rapida: "restauracion", confiteria: "restauracion",
  heladeria: "restauracion",
  peluqueria: "belleza", unas: "belleza", masajes: "belleza", estetica: "belleza",
  barberia: "belleza", spa: "belleza", maquillaje: "belleza",
  padel: "deportes", tenis: "deportes", futbol: "deportes", futbol_sala: "deportes",
  futbol_7: "deportes", futbol_11: "deportes", gimnasio: "deportes", yoga: "deportes",
  pilates: "deportes", natacion: "deportes", squash: "deportes", badminton: "deportes",
  golf: "deportes",
  clinica: "salud", fisioterapia: "salud", dentista: "salud", psicologo: "salud",
  medico: "salud", nutricionista: "salud", optometria: "salud",
  fontanero: "hogar", electricista: "hogar", limpieza: "hogar", cerrajero: "hogar",
  jardineria: "hogar", mudanzas: "hogar", reformas: "hogar", pintor: "hogar",
  escape_room: "actividades", karting: "actividades", teatro: "actividades",
  cine: "actividades", concierto: "actividades", laser_tag: "actividades",
  realidad_vr: "actividades",
  taller: "servicios", consultoria: "servicios", academia: "servicios",
  sala_reuniones: "servicios", fotografia: "servicios", coworking: "servicios",
  hotel: "hoteles", apartamento: "hoteles", casa_rural: "hoteles", hostal: "hoteles",
};

// ─── Emoji palette for custom items ──────────────────────────────────────────

export const EMOJI_PALETTE = [
  "🪑","🌿","🍺","🏓","🛏️","🚪","🎭","🏋️","📚","💼","🔧","⚡","🏊","✨","➕",
  "🍽️","☕","🧁","🍔","🏥","📷","🏢","🎯","🔐","💈","🛋️","🎤","🏄","🚿","🪞",
];

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export type PlantillaItem = {
  id: string;
  emoji: string;
  label: string;
  count: number;
  staffNames?: string[];      // nombre de cada profesional/puesto (length == count)
  staffServices?: string[][]; // servicios seleccionados por slot (length == count)
  staffEmojis?: string[];     // icono individual por slot (length == count)
};

/** Emoji del sub-sector activo (para asignar por defecto a cada profesional) */
export function getDefaultStaffEmoji(subId: string | null | undefined): string {
  if (!subId) return "👤";
  for (const sector of SECTORS) {
    const sub = sector.subs.find(s => s.id === subId);
    if (sub) return sub.emoji;
  }
  return "👤";
}

/**
 * Paleta de emojis relevante para el sector activo.
 * Prioriza los emojis de todos los subs del sector → luego el EMOJI_PALETTE genérico.
 */
export function getStaffEmojiPalette(subId: string | null | undefined): string[] {
  const sectorId = subId ? (SUB_TO_SECTOR[subId] ?? "") : "";
  const sector   = SECTORS.find(s => s.id === sectorId);
  const sectorEmojis = sector ? [...new Set(sector.subs.map(s => s.emoji))] : [];
  const rest = EMOJI_PALETTE.filter(e => !sectorEmojis.includes(e));
  return [...sectorEmojis, ...rest];
}

// Sectores donde los puestos representan personas (se pueden nombrar individualmente)
export const PEOPLE_SECTORS = new Set(["belleza", "salud"]);

export function initPlantillaItems(subId: string | null | undefined): PlantillaItem[] {
  if (!subId) return [];
  const structures = SECTOR_STRUCTURES[subId] ?? [];
  return structures.map((s, i) => ({ id: `pi_${i}`, emoji: s.emoji, label: s.label, count: 1 }));
}

export function getAddLabel(subId: string | null | undefined, lang: Lang = "es"): string {
  if (!subId) return trSector("Añadir elemento", lang);
  const sectorId = SUB_TO_SECTOR[subId] ?? "otros";
  return trSector(ADD_ELEMENT_LABEL[sectorId] ?? "Añadir elemento", lang);
}

// ─── Localized accessors ──────────────────────────────────────────────────────
// Spanish fields on SECTORS / SECTOR_STRUCTURES remain the single source of
// truth; these helpers translate them at render time via trSector() so
// Spanish output never changes and English is always correctly localized.

export function getSectorLabel(sector: Pick<Sector, "label">, lang: Lang): string {
  return trSector(sector.label, lang);
}

export function getSectorDesc(sector: Pick<Sector, "desc">, lang: Lang): string {
  return trSector(sector.desc, lang);
}

export function getSubName(sub: Pick<SubActivity, "name">, lang: Lang): string {
  return trSector(sub.name, lang);
}

export function getSubDesc(sub: Pick<SubActivity, "desc">, lang: Lang): string {
  return trSector(sub.desc, lang);
}

export function getStructureLabel(label: string, lang: Lang): string {
  return trSector(label, lang);
}

export function getLocalizedStructures(subId: string | null | undefined, lang: Lang): { emoji: string; label: string }[] {
  const structures = subId ? (SECTOR_STRUCTURES[subId] ?? []) : [];
  return structures.map(s => ({ emoji: s.emoji, label: trSector(s.label, lang) }));
}

export function getSuggestedServices(subId: string | null | undefined, lang: Lang): SuggestedServiceDef[] {
  const services = subId ? (SUGGESTED_SERVICES[subId] ?? []) : [];
  return services.map(s => ({ ...s, name: trSector(s.name, lang) }));
}

// ─── Shared persistent hook ──────────────────────────────────────────────────
// Both EmpresaSetupGuide and GoBookingScreen call usePlantillaItems() with
// the same subId. Changes persist in AsyncStorage so they are immediately
// visible across both screens.

type StoredData = { subId: string; items: PlantillaItem[] };

export function usePlantillaItems(subId: string | null | undefined) {
  const [items, setItemsRaw] = useState<PlantillaItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const prevSubId = useRef<string | null | undefined>(undefined);
  const persistRef = useRef(false);

  const save = useCallback((nextItems: PlantillaItem[], id: string) => {
    const data: StoredData = { subId: id, items: nextItems };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(data)).catch(() => {});
  }, []);

  const setItems = useCallback((updater: PlantillaItem[] | ((prev: PlantillaItem[]) => PlantillaItem[])) => {
    setItemsRaw(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      if (subId) save(next, subId);
      return next;
    });
  }, [subId, save]);

  useEffect(() => {
    if (!subId) {
      setItemsRaw([]);
      setLoaded(true);
      prevSubId.current = subId;
      return;
    }
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      if (cancelled) return;
      if (raw) {
        try {
          const stored: StoredData = JSON.parse(raw);
          if (stored.subId === subId && Array.isArray(stored.items)) {
            setItemsRaw(stored.items);
            setLoaded(true);
            prevSubId.current = subId;
            return;
          }
        } catch {}
      }
      const defaults = initPlantillaItems(subId);
      setItemsRaw(defaults);
      save(defaults, subId);
      setLoaded(true);
      prevSubId.current = subId;
    }).catch(() => {
      const defaults = initPlantillaItems(subId);
      setItemsRaw(defaults);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [subId, save]);

  return { items, setItems, loaded };
}
