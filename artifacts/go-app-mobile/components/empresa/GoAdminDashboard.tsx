import React, { useState } from "react";
import {
  Dimensions,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StatusBar }        from "expo-status-bar";
import { DraggableFAB }     from "../DraggableFAB";
import { AdminScreen }      from "./AdminScreen";
import { PartnersScreen }   from "./PartnersScreen";
import { PublicidadScreen } from "./PublicidadScreen";
import { FacturacionScreen } from "./FacturacionScreen";
import { ZonasScreen }      from "./ZonasScreen";
import { ConsumoScreen }    from "./ConsumoScreen";
import { GoRoadmapScreen, RoadmapNode } from "./GoRoadmapScreen";
import { useLanguage } from "@/contexts/LanguageContext";

const { width: SW } = Dimensions.get("window");

const BG    = "#0D0E11";
const CARD  = "#1A1B1F";
const BORD  = "rgba(255,255,255,0.08)";
const TEXT  = "#FFFFFF";
const GRAY  = "rgba(255,255,255,0.50)";
const DIM   = "rgba(255,255,255,0.28)";
const DESC  = "rgba(255,255,255,0.78)";

const ESTADO_TERMINADO  = "#22c55e";
const ESTADO_DESARROLLO = "#3b82f6";
const ESTADO_DISENO     = "#a855f7";
const ESTADO_IDEA       = "#E2E8F0";
const ESTADO_CRITICO    = "#ef4444";

type AdminSection =
  | "overview"
  | "partners"
  | "zones_rates"
  | "consumos"
  | "publicidad"
  | "facturacion"
  | "sistema"
  | "metricas"
  | "empresas"
  | "roadmap"
  | "modulos_empresa"
  | "siguientes_modulos";

type ModuloEmpresaCategoria =
  | "maduros"
  | "sociales"
  | "rutas"
  | "empresa"
  | "inteligentes";

type SubModuloDef = {
  key: string;
  emoji: string;
  label: string;
  label_en?: string;
  desc: string;
  desc_en: string;
  info: string;
  info_en: string;
  chips: string[];
  chips_en: string[];
  accesoDirecto?: boolean;
};

type ModuloEmpresaDef = {
  key: string;
  emoji: string;
  label: string;
  label_en?: string;
  color: string;
  desc: string;
  desc_en: string;
  info: string;
  info_en: string;
  estado: string;
  estado_en: string;
  chips: string[];
  chips_en: string[];
  categoria: ModuloEmpresaCategoria;
  submodulos?: SubModuloDef[];
  nota?: string;
  nota_en?: string;
};

const CATEGORIA_LABEL: Record<ModuloEmpresaCategoria, string> = {
  maduros:      "MÓDULOS YA MADUROS / DEMOSTRABLES",
  sociales:     "MÓDULOS SOCIALES / HUMANOS",
  rutas:        "MÓDULOS DE RUTAS Y MOVILIDAD",
  empresa:      "MÓDULOS EMPRESA / OPERACIÓN",
  inteligentes: "MÓDULOS INTELIGENTES",
};
const CATEGORIA_LABEL_EN: Record<ModuloEmpresaCategoria, string> = {
  maduros:      "MATURE / DEMONSTRABLE MODULES",
  sociales:     "SOCIAL / HUMAN MODULES",
  rutas:        "ROUTES AND MOBILITY MODULES",
  empresa:      "BUSINESS / OPERATIONS MODULES",
  inteligentes: "INTELLIGENT MODULES",
};

const CATEGORIA_ORDEN: ModuloEmpresaCategoria[] = ["maduros", "sociales", "rutas", "empresa", "inteligentes"];

function getEstadoColor(estado: string): string {
  const e = estado.toLowerCase();
  if (e.includes("no tocar") || e.includes("requiere") || e.includes("crítica") || e.includes("critica"))
                                        return ESTADO_CRITICO;
  if (e.startsWith("terminado"))        return ESTADO_TERMINADO;
  if (e.includes("desarrollo") || e.includes("pruebas"))
                                        return ESTADO_DESARROLLO;
  if (e.includes("diseño") || e.includes("núcleo teso"))
                                        return ESTADO_DISENO;
  if (e.includes("idea"))               return ESTADO_IDEA;
  return ESTADO_IDEA;
}

const ESTADO_LEGEND: Array<{ label: string; label_en: string; color: string }> = [
  { label: "Terminado / Visible",   label_en: "Done / Visible",            color: ESTADO_TERMINADO  },
  { label: "En desarrollo",         label_en: "In development",            color: ESTADO_DESARROLLO },
  { label: "En diseño",             label_en: "In design",                 color: ESTADO_DISENO     },
  { label: "Idea",                  label_en: "Idea",                      color: ESTADO_IDEA       },
  { label: "Dependencia crítica",   label_en: "Critical dependency",       color: ESTADO_CRITICO    },
];

const MODULOS_EMPRESA_ROADMAP: ModuloEmpresaDef[] = [
  // ── MÓDULOS YA MADUROS / DEMOSTRABLES ──────────────────────────────
  {
    key: "the_go",
    emoji: "📍",
    label: "THE GO",
    color: "#4A80BD",
    desc: "Quedar, coordinar acciones humanas, lugar, hora, contacto, duración y calendario.",
    desc_en: "Meet, coordinate human actions, place, time, contact, duration and calendar.",
    info: "THE GO conecta personas, lugar, tiempo y calendario para convertir cualquier intención en una acción coordinada.",
    info_en: "THE GO connects people, place, time and calendar to turn any intention into a coordinated action.",
    estado: "Terminado / Demo activa",
    estado_en: "Done / Demo active",
    chips: ["Quedar", "Contacto", "Ubicación", "Calendario"],
    chips_en: ["Meet", "Contact", "Location", "Calendar"],
    categoria: "maduros",
  },
  {
    key: "reservas",
    emoji: "📅",
    label: "GO Reservas",
    label_en: "GO Bookings",
    color: "#22c55e",
    desc: "Citas y reservas para negocios, servicios y profesionales.",
    desc_en: "Appointments and bookings for businesses, services and professionals.",
    info: "GO Reservas permite a cualquier negocio configurar y gestionar citas y reservas desde un único sistema.",
    info_en: "GO Reservations allows any business to configure and manage appointments and bookings from one system.",
    estado: "Terminado / Visible en GO Empresa",
    estado_en: "Done / Visible in GO Enterprise",
    chips: ["Peluquería", "Clínica", "Gimnasio", "Hotel", "Servicios"],
    chips_en: ["Hairdresser", "Clinic", "Gym", "Hotel", "Services"],
    categoria: "maduros",
  },
  {
    key: "marketplace",
    emoji: "🛒",
    label: "GO Marketplace",
    color: "#b45309",
    desc: "Órbitas, categorías, proveedores, marcas y servicios externos.",
    desc_en: "Orbits, categories, suppliers, brands and external services.",
    info: "GO Marketplace conecta al usuario con productos, servicios y proveedores externos directamente desde GO.",
    info_en: "GO Marketplace connects users with products, services and external providers directly from GO.",
    estado: "Terminado visual / En desarrollo funcional",
    estado_en: "Visual done / In functional development",
    chips: ["Comida", "Viajes", "Compras", "Servicios", "Proveedores"],
    chips_en: ["Food", "Travel", "Shopping", "Services", "Suppliers"],
    categoria: "maduros",
  },
  {
    key: "etica_55",
    emoji: "🛡️",
    label: "GO Ética 55",
    label_en: "GO Ethics 55",
    color: "#0d9488",
    desc: "Capa ética, límites de uso, protección humana y reglas base del sistema.",
    desc_en: "Ethical layer, usage limits, human protection and base system rules.",
    info: "GO Ética 55 establece los límites que protegen a las personas y condicionan cómo puede utilizarse el sistema.",
    info_en: "GO Ethics 55 defines the limits that protect people and determine how the system may be used.",
    estado: "Terminado / No tocar lógica",
    estado_en: "Done / Do not touch logic",
    chips: ["Ética", "Seguridad", "Límites", "Protección"],
    chips_en: ["Ethics", "Security", "Limits", "Protection"],
    categoria: "maduros",
    nota: "No tocar lógica. Capa protegida — ver GO_LOCK_V1.md antes de modificar.",
    nota_en: "Do not touch logic. Protected layer — see GO_LOCK_V1.md before modifying.",
  },
  {
    key: "comunicacion",
    emoji: "💬",
    label: "GO Comunicación / Mensajería",
    label_en: "GO Communication / Messaging",
    color: "#3b82f6",
    desc: "Mensajes, contactos, coordinación y comunicación interna/externa.",
    desc_en: "Messages, contacts, coordination and internal/external communication.",
    info: "GO Comunicación conecta mensajes, contactos y coordinación interna y externa dentro del mismo ecosistema.",
    info_en: "GO Communication connects messages, contacts and internal and external coordination within the same ecosystem.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["Chat", "Contactos", "Notas", "IA"],
    chips_en: ["Chat", "Contacts", "Notes", "AI"],
    categoria: "maduros",
  },
  {
    key: "turnos_multienvio",
    emoji: "🎟️",
    label: "GO Turnos / Multi-envío",
    label_en: "GO Shifts / Multi-send",
    color: "#f97316",
    desc: "Enviar GO a varias personas con cupos, límites, confirmaciones y organización por grupos.",
    desc_en: "Send GO to multiple people with capacity limits, confirmations and group organisation.",
    info: "Permite enviar una acción a varias personas y organizar cupos, turnos, confirmaciones y grupos.",
    info_en: "It allows one action to be sent to multiple people while organizing capacity, shifts, confirmations and groups.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["Turnos", "Cupos", "Grupos", "Eventos", "Fábrica"],
    chips_en: ["Shifts", "Capacity", "Groups", "Events", "Factory"],
    categoria: "maduros",
  },

  // ── MÓDULOS SOCIALES / HUMANOS ──────────────────────────────────────
  {
    key: "humanity",
    emoji: "🌍",
    label: "GO Humanity",
    color: "#14b8a6",
    desc: "Necesidades humanas, ayuda, bienestar, comunidad y coordinación social.",
    desc_en: "Human needs, help, wellbeing, community and social coordination.",
    info: "GO Humanity conecta necesidades humanas con recursos, ayuda y personas capaces de aportar soluciones.",
    info_en: "GO Humanity connects human needs with resources, assistance and people able to provide solutions.",
    estado: "En diseño / Núcleo TESO",
    estado_en: "In design / TESO core",
    chips: ["Ayuda", "Necesidades", "Bienestar", "Comunidad"],
    chips_en: ["Help", "Needs", "Wellbeing", "Community"],
    categoria: "sociales",
  },
  {
    key: "vecinos",
    emoji: "🏘️",
    label: "GO Vecinos",
    label_en: "GO Neighbors",
    color: "#65a30d",
    desc: "Comunidad cercana, avisos, favores, incidencias y servicios vecinales.",
    desc_en: "Local community, notices, favours, incidents and neighbourhood services.",
    info: "GO Vecinos conecta comunidades cercanas para compartir avisos, favores, incidencias y servicios.",
    info_en: "GO Neighbors connects nearby communities to share notices, favors, incidents and services.",
    estado: "En diseño",
    estado_en: "In design",
    chips: ["Comunidad", "Avisos", "Favores", "Servicios"],
    chips_en: ["Community", "Notices", "Favours", "Services"],
    categoria: "sociales",
  },
  {
    key: "tengo_quiero_compartir",
    emoji: "🤝",
    label: "GO Tengo / Quiero / Compartir",
    label_en: "GO Have / Want / Share",
    color: "#a855f7",
    desc: "Compartir objetos, prestar, donar, pedir ayuda o intercambiar recursos.",
    desc_en: "Share objects, lend, donate, ask for help or exchange resources.",
    info: "Conecta lo que una persona tiene con lo que otra necesita: prestar, donar, compartir o intercambiar.",
    info_en: "It connects what one person has with what another needs: lending, donating, sharing or exchanging.",
    estado: "En diseño",
    estado_en: "In design",
    chips: ["Tengo", "Quiero", "Compartir", "Donar", "Prestar"],
    chips_en: ["Have", "Want", "Share", "Donate", "Lend"],
    categoria: "sociales",
  },
  {
    key: "emergencias",
    emoji: "🚨",
    label: "GO Emergencias",
    label_en: "GO Emergencies",
    color: "#ef4444",
    desc: "SOS, evacuación, ayuda rápida, localización y contactos críticos.",
    desc_en: "SOS, evacuation, quick help, location and critical contacts.",
    info: "GO Emergencias coordina alertas, evacuación, localización y contactos críticos cuando cada segundo importa.",
    info_en: "GO Emergencies coordinates alerts, evacuation, location and critical contacts when every second matters.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["SOS", "Evacuación", "Incendio", "Médico", "Localización"],
    chips_en: ["SOS", "Evacuation", "Fire", "Medical", "Location"],
    categoria: "sociales",
  },
  {
    key: "sport",
    emoji: "⚽",
    label: "GO Sport / Deportes",
    label_en: "GO Sport / Sports",
    color: "#84cc16",
    desc: "Equipos, entrenamientos, eventos, reservas deportivas y grupos.",
    desc_en: "Teams, training sessions, events, sports bookings and groups.",
    info: "GO Sport conecta equipos, entrenamientos, eventos, grupos y reservas deportivas.",
    info_en: "GO Sport connects teams, training, events, groups and sports bookings.",
    estado: "Idea / En diseño",
    estado_en: "Idea / In design",
    chips: ["Equipos", "Eventos", "Entrenos", "Reservas"],
    chips_en: ["Teams", "Events", "Training", "Bookings"],
    categoria: "sociales",
  },

  // ── MÓDULOS DE RUTAS Y MOVILIDAD ─────────────────────────────────────
  {
    key: "rutas",
    emoji: "🗺️",
    label: "GO Rutas",
    label_en: "GO Routes",
    color: "#38bdf8",
    desc: "Módulo padre de rutas, desplazamientos y coordinación de movimiento.",
    desc_en: "Parent module for routes, travel and movement coordination.",
    info: "GO Rutas coordina desplazamientos y conecta visitas, trabajo, movilidad y rutas compartidas.",
    info_en: "GO Routes coordinates travel and connects visits, work, mobility and shared routes.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["Rutas", "Visitas", "Agenda", "Movilidad"],
    chips_en: ["Routes", "Visits", "Schedule", "Mobility"],
    categoria: "rutas",
    submodulos: [
      {
        key: "rutas_operativas",
        emoji: "🧭",
        label: "GO Rutas Operativas",
        label_en: "GO Operational Routes",
        desc: "Visitas, rutas de campo, comerciales, técnicos, agenda y operativa.",
        desc_en: "Site visits, field routes, sales, technicians, schedule and operations.",
        info: "GO Rutas Operativas organiza visitas, rutas de campo, técnicos, agenda y trabajo operativo.",
        info_en: "GO Operational Routes organizes visits, field routes, technicians, scheduling and operational work.",
        chips: ["Visitas", "Técnicos", "Agenda", "Campo"],
        chips_en: ["Visits", "Technicians", "Schedule", "Field"],
      },
      {
        key: "go_trabajo",
        emoji: "🚗",
        label: "GO Trabajo",
        label_en: "GO Work",
        desc: "Compartir rutas para ir al trabajo entre personas con horarios y trayectos compatibles.",
        desc_en: "Share commute routes between people with compatible schedules and journeys.",
        info: "GO Trabajo conecta personas con horarios y trayectos compatibles para compartir desplazamientos al trabajo.",
        info_en: "GO Work connects people with compatible schedules and routes to share commuting journeys.",
        chips: ["Trabajo", "Coche compartido", "Horarios", "Ahorro"],
        chips_en: ["Work", "Carpooling", "Schedules", "Savings"],
      },
      {
        key: "transport_children",
        emoji: "🎒",
        label: "GO Transport Children",
        desc: "Recogidas y rutas compartidas para niños: colegio, actividades y entrenamientos.",
        desc_en: "Shared pickups and routes for children: school, activities and training.",
        info: "GO Transport Children coordina recogidas y rutas compartidas para colegios, actividades y entrenamientos.",
        info_en: "GO Transport Children coordinates pickups and shared routes for schools, activities and training.",
        chips: ["Niños", "Colegio", "Recogidas", "Padres", "Seguridad"],
        chips_en: ["Children", "School", "Pickups", "Parents", "Safety"],
        accesoDirecto: true,
      },
    ],
  },
  {
    key: "transport",
    emoji: "🚚",
    label: "GO Transport",
    color: "#64748b",
    desc: "Transporte general, vehículos, conductores, rutas e incidencias.",
    desc_en: "General transport, vehicles, drivers, routes and incidents.",
    info: "GO Transport coordina vehículos, conductores, rutas e incidencias dentro de una misma estructura.",
    info_en: "GO Transport coordinates vehicles, drivers, routes and incidents within one structure.",
    estado: "En diseño",
    estado_en: "In design",
    chips: ["Vehículos", "Conductores", "GPS", "Incidencias"],
    chips_en: ["Vehicles", "Drivers", "GPS", "Incidents"],
    categoria: "rutas",
  },

  // ── MÓDULOS EMPRESA / OPERACIÓN ──────────────────────────────────────
  {
    key: "industry",
    emoji: "🏭",
    label: "GO Industry",
    color: "#C4883A",
    desc: "Producción, mantenimiento, logística y calidad.",
    desc_en: "Production, maintenance, logistics and quality.",
    info: "GO Industry conecta producción, mantenimiento, logística y calidad para mejorar la operación industrial.",
    info_en: "GO Industry connects production, maintenance, logistics and quality to improve industrial operations.",
    estado: "En diseño",
    estado_en: "In design",
    chips: ["Producción", "Mantenimiento", "Logística", "Calidad"],
    chips_en: ["Production", "Maintenance", "Logistics", "Quality"],
    categoria: "empresa",
  },
  {
    key: "prl",
    emoji: "🦺",
    label: "GO PRL",
    color: "#ea580c",
    desc: "Prevención de riesgos laborales, EPI, auditorías y emergencias laborales.",
    desc_en: "Workplace risk prevention, PPE, audits and occupational emergencies.",
    info: "GO PRL centraliza prevención de riesgos, equipos de protección, auditorías y emergencias laborales.",
    info_en: "GO Occupational Risk Prevention centralizes risk prevention, protective equipment, audits and workplace emergencies.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["Extintores", "EPI", "Auditorías", "Emergencias"],
    chips_en: ["Fire extinguishers", "PPE", "Audits", "Emergencies"],
    categoria: "empresa",
  },
  {
    key: "pack_fast",
    emoji: "📦",
    label: "GO Pack Fast",
    color: "#fbbf24",
    desc: "Recogida, entrega rápida, paquetes, seguimiento y confirmación.",
    desc_en: "Collection, fast delivery, packages, tracking and confirmation.",
    info: "GO Pack Fast coordina recogidas, entregas, seguimiento y confirmación de paquetes.",
    info_en: "GO Pack Fast coordinates package collection, delivery, tracking and confirmation.",
    estado: "Idea / En diseño",
    estado_en: "Idea / In design",
    chips: ["Paquetes", "Entrega", "Recogida", "Tracking"],
    chips_en: ["Packages", "Delivery", "Collection", "Tracking"],
    categoria: "empresa",
  },
  {
    key: "taquillas",
    emoji: "🗄️",
    label: "GO Taquillas Inteligentes",
    label_en: "GO Smart Lockers",
    color: "#a78bfa",
    desc: "Taquillas, casilleros, códigos, recogidas, entregas y accesos.",
    desc_en: "Lockers, codes, collections, deliveries and access control.",
    info: "Las taquillas inteligentes conectan códigos, accesos, recogidas y entregas dentro del sistema.",
    info_en: "Smart lockers connect codes, access, collections and deliveries within the system.",
    estado: "Idea / En diseño",
    estado_en: "Idea / In design",
    chips: ["Taquillas", "Código", "Recogida", "Entrega"],
    chips_en: ["Lockers", "Code", "Collection", "Delivery"],
    categoria: "empresa",
  },
  {
    key: "negocio",
    emoji: "💼",
    label: "GO Negocio",
    label_en: "GO Business",
    color: "#eab308",
    desc: "Pagos, suscripciones, partners, facturación y activación de módulos.",
    desc_en: "Payments, subscriptions, partners, billing and module activation.",
    info: "GO Negocio gestiona pagos, suscripciones, partners, facturación y activación de módulos.",
    info_en: "GO Business manages payments, subscriptions, partners, billing and module activation.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["Pagos", "Suscripción", "Partners", "Facturación"],
    chips_en: ["Payments", "Subscription", "Partners", "Billing"],
    categoria: "empresa",
  },
  {
    key: "restauracion",
    emoji: "🍽️",
    label: "GO Restauración",
    label_en: "GO Restaurant",
    color: "#E07340",
    desc: "Gestión completa para hostelería y restaurantes.",
    desc_en: "Complete management for hospitality and restaurants.",
    info: "GO Restauración integra reservas, carta digital, pago en mesa y operación de cocina.",
    info_en: "GO Restaurants integrates bookings, digital menus, table payments and kitchen operations.",
    estado: "En desarrollo",
    estado_en: "In development",
    chips: ["Reservas", "Carta digital", "Pago en mesa", "Cocina"],
    chips_en: ["Bookings", "Digital menu", "Table payment", "Kitchen"],
    categoria: "empresa",
  },
  {
    key: "control_accesos",
    emoji: "🔐",
    label: "GO Control Accesos",
    label_en: "GO Access Control",
    color: "#7C69BE",
    desc: "Control de entrada, visitantes y seguridad del recinto.",
    desc_en: "Entry control, visitors and venue security.",
    info: "GO Control Accesos gestiona entradas, visitantes, horarios y seguridad de los recintos.",
    info_en: "GO Access Control manages entry, visitors, schedules and site security.",
    estado: "Idea",
    estado_en: "Idea",
    chips: ["QR", "Visitantes", "Horarios", "Seguridad"],
    chips_en: ["QR", "Visitors", "Schedules", "Security"],
    categoria: "empresa",
  },

  // ── MÓDULOS INTELIGENTES ──────────────────────────────────────────────
  {
    key: "ia",
    emoji: "🤖",
    label: "GO IA",
    label_en: "GO AI",
    color: "#7c3aed",
    desc: "Interpretación, sugerencias, automatizaciones y apoyo contextual.",
    desc_en: "Interpretation, suggestions, automations and contextual support.",
    info: "GO IA conecta el contexto de todos los módulos para interpretar, sugerir y automatizar acciones.",
    info_en: "GO AI connects the context of all modules to interpret, suggest and automate actions.",
    estado: "En diseño",
    estado_en: "In design",
    chips: ["IA", "Sugerencias", "Automatización", "Contexto"],
    chips_en: ["AI", "Suggestions", "Automation", "Context"],
    categoria: "inteligentes",
  },
  {
    key: "alarmas",
    emoji: "🔔",
    label: "GO Alarmas Inteligentes",
    label_en: "GO Smart Alarms",
    color: "#ef4444",
    desc: "Alertas inteligentes basadas en tablas 11–99, niveles, urgencias y prioridades.",
    desc_en: "Smart alerts based on 11–99 tables, levels, urgencies and priorities.",
    info: "Las alarmas inteligentes priorizan avisos según niveles, urgencia y contexto, utilizando las tablas 11–99.",
    info_en: "Smart alarms prioritize alerts by level, urgency and context using the 11–99 tables.",
    estado: "En diseño / Requiere tablas 11–99",
    estado_en: "In design / Requires 11–99 tables",
    chips: ["Alarmas", "11–99", "Urgencia", "Prioridad"],
    chips_en: ["Alarms", "11–99", "Urgency", "Priority"],
    categoria: "inteligentes",
    nota: "Depende de las tablas 11–99. No construir la lógica todavía — solo queda reflejado que necesita estructura numérica propia.",
    nota_en: "Depends on the 11–99 tables. Do not build the logic yet — only noted here that it needs its own numeric structure.",
  },
];

type SiguienteModulo = {
  key: string;
  emoji: string;
  label: string;
  label_en?: string;
  color: string;
  shortDesc: string;
  shortDesc_en: string;
  includes: string[];
  includes_en: string[];
  objetivo: string;
  objetivo_en: string;
  info: string;
  info_en?: string;
};

const SIGUIENTES_MODULOS: SiguienteModulo[] = [
  {
    key: "restaurantes",
    emoji: "🍽️",
    label: "Restaurantes",
    label_en: "Restaurants",
    color: "#E07340",
    shortDesc: "Sistema completo para restaurantes.",
    shortDesc_en: "Complete system for restaurants.",
    includes: ["Reservas", "Lectura OCR de cartas", "QR del restaurante", "Pedidos desde móvil", "Cambios de reserva", "Comunicación cliente ↔ restaurante", "Avisador camareros", "Estadísticas y gestión"],
    includes_en: ["Bookings", "OCR menu reading", "Restaurant QR", "Mobile orders", "Booking changes", "Client ↔ restaurant communication", "Waiter alert", "Statistics & management"],
    objetivo: "Hacer pedidos y reservas de forma rápida y sencilla.",
    objetivo_en: "Place orders and bookings quickly and easily.",
    info: "Restaurantes será un sistema completo para la gestión de reservas, pedidos y comunicación entre clientes y establecimientos.\n\nPermitirá organizar disponibilidad, cambios de reserva, lectura de menús mediante OCR, pedidos desde el móvil, códigos QR, avisos al camarero y estadísticas de gestión.\n\nSu objetivo es reducir esperas, simplificar la atención y conectar al restaurante con calendarios, pagos, rutas, clientes y otros módulos del ecosistema GO.",
  },
  {
    key: "prioridades",
    emoji: "⚡",
    label: "Prioridades",
    label_en: "Priorities",
    color: "#f97316",
    shortDesc: "Sistema universal de prioridades y turnos.",
    shortDesc_en: "Universal system for priorities and shifts.",
    includes: ["Asignación de tareas", "Niveles de prioridad", "Avisos automáticos", "Seguimiento", "Planificación"],
    includes_en: ["Task assignment", "Priority levels", "Automatic alerts", "Tracking", "Planning"],
    objetivo: "Organizar personas y tareas de forma eficiente.",
    objetivo_en: "Organise people and tasks efficiently.",
    info: "Prioridades será un sistema universal para organizar personas, tareas, turnos y niveles de importancia.\n\nPermitirá asignar acciones, establecer prioridades, realizar seguimiento, planificar y generar alertas automáticas cuando una situación requiera atención.\n\nSu objetivo es ayudar a decidir qué debe hacerse primero, por quién, cuándo y con qué nivel de urgencia.\n\nEn el futuro podrá relacionarse con las tablas 11–99, pero esa lógica todavía no debe implementarse.",
  },
  {
    key: "qr_accesos",
    emoji: "🔐",
    label: "QR de Accesos",
    label_en: "QR Access",
    color: "#7C69BE",
    shortDesc: "Sistema inteligente de accesos mediante QR.",
    shortDesc_en: "Smart access control system via QR.",
    includes: ["Generar QR automáticos", "Permisos por persona", "Control de zonas", "Registro de entradas/salidas", "Horarios de acceso"],
    includes_en: ["Generate automatic QR", "Permissions by person", "Zone control", "Entry/exit log", "Access schedules"],
    objetivo: "Controlar quién puede entrar, dónde y cuándo.",
    objetivo_en: "Control who can enter, where and when.",
    info: "Acceso QR será un sistema inteligente de control de entrada y salida mediante códigos QR.\n\nPermitirá generar códigos automáticos, asignar permisos por persona, controlar zonas, establecer horarios y registrar accesos.\n\nSu objetivo es saber quién puede entrar, dónde y cuándo, aumentando seguridad, trazabilidad y coordinación.\n\nPodrá aplicarse a empresas, eventos, instalaciones, taquillas inteligentes, servicios y otros módulos.",
  },
  {
    key: "tengo_quiero",
    emoji: "🤝",
    label: "Tengo / Quiero / Compartir",
    label_en: "Have / Want / Share",
    color: "#3D9A84",
    shortDesc: "Sistema para compartir recursos y necesidades.",
    shortDesc_en: "System for sharing resources and needs.",
    includes: ["Ofrecer objetos", "Pedir ayuda", "Compartir herramientas", "Intercambiar servicios", "Colaborar entre personas y empresas"],
    includes_en: ["Offer objects", "Ask for help", "Share tools", "Exchange services", "Collaborate between people and businesses"],
    objetivo: "Conectar necesidades con personas que pueden ayudar.",
    objetivo_en: "Connect needs with people who can help.",
    info: "Tengo / Quiero / Compartir será un sistema para conectar recursos disponibles con necesidades reales.\n\nPermitirá ofrecer objetos, pedir ayuda, compartir herramientas, intercambiar servicios y facilitar colaboración entre personas y empresas.\n\nSu objetivo es aprovechar mejor los recursos existentes, reducir desperdicio y conectar a quien necesita algo con quien puede ayudar.\n\nEste módulo funcionará de forma transversal entre GO Social, GO Humanity, GO Empresa y otros bloques.",
  },
  {
    key: "humanity",
    emoji: "🌍",
    label: "Humanity",
    color: "#4A80BD",
    shortDesc: "Módulo social y humano.",
    shortDesc_en: "Social and human module.",
    includes: ["Conectar personas", "Coordinar ayuda", "Detectar necesidades", "Acciones solidarias", "Colaboración entre comunidades"],
    includes_en: ["Connect people", "Coordinate help", "Detect needs", "Solidarity actions", "Community collaboration"],
    objetivo: "Utilizar GO para mejorar la vida de las personas.",
    objetivo_en: "Use GO to improve people's lives.",
    info: "Humanity será el conjunto de módulos sociales y humanos orientados a mejorar la calidad de vida, la cooperación y la ayuda entre personas y comunidades.\n\nPermitirá conectar necesidades, coordinar ayuda, organizar recursos, detectar situaciones de vulnerabilidad y facilitar respuestas útiles.\n\nSu objetivo es que la tecnología del ecosistema mantenga siempre una finalidad humana y convierta información protegida en acciones o sugerencias que puedan ayudar.\n\nHumanity no sustituye la decisión de las personas; busca ofrecer contexto, opciones y coordinación dentro de límites éticos estrictos.",
  },
];

const MOCK_METRICS = {
  ingresosHoy:  "€ 284",
  ingresosMes:  "€ 8.310",
  usosHoy:      "1.203",
  usosMes:      "34.560",
  ingresoTotal: "€ 41.820",
  partnerTop:   "Uber Eats",
};

const MOCK_EMPRESAS = [
  { nombre: "Nemesi de Molina", orbitas: 4, activa: true  },
  { nombre: "Café Berlín",       orbitas: 2, activa: true  },
  { nombre: "Hair Studio BCN",   orbitas: 3, activa: false },
  { nombre: "La Española",       orbitas: 1, activa: true  },
];

const MOCK_METRICAS = [
  { label: "CTR campañas",      label_en: "Campaign CTR",       valor: "3.8%",   icon: "trending-up" as const, color: "#4A80BD" },
  { label: "Conv. marketplace", label_en: "Marketplace conv.",  valor: "12.4%",  icon: "percent"     as const, color: "#3D9A84" },
  { label: "Coste/lead medio",  label_en: "Avg. cost/lead",     valor: "€ 0.32", icon: "tag"         as const, color: "#f97316" },
  { label: "Partners activos",  label_en: "Active partners",    valor: "18",      icon: "link"        as const, color: "#8b5cf6" },
  { label: "Impresiones/día",   label_en: "Impressions/day",    valor: "48.2K",   icon: "eye"         as const, color: "#ec4899" },
  { label: "Ingresos/órbita",   label_en: "Revenue/orbit",      valor: "€ 2.40", icon: "layers"      as const, color: "#f59e0b" },
];

const SECTIONS: Array<{
  key: AdminSection;
  label: string;
  label_en: string;
  sublabel: string;
  sublabel_en: string;
  icon: React.ComponentProps<typeof Feather>["name"];
  color: string;
}> = [
  { key: "roadmap",            label: "Roadmap GO",              label_en: "GO Roadmap",        sublabel: "Tablero maestro del ecosistema",          sublabel_en: "Ecosystem master board",                 icon: "map",         color: "#f59e0b" },
  { key: "modulos_empresa",    label: "Módulos empresariales",   label_en: "Business Modules",  sublabel: "Fases y estado de módulos contratables",  sublabel_en: "Phases and status of contractable modules", icon: "layers",    color: "#7C69BE" },
  { key: "siguientes_modulos", label: "Siguientes módulos",      label_en: "Next Modules",      sublabel: "Próximos desarrollos del ecosistema",     sublabel_en: "Upcoming system developments",           icon: "clock",       color: "#8b5cf6" },
  { key: "partners",    label: "Partners",       label_en: "Partners",      sublabel: "Comisiones, leads y conversiones",  sublabel_en: "Commissions, leads and conversions", icon: "link",        color: "#ec4899" },
  { key: "zones_rates", label: "Zonas y tarifas",  label_en: "Zones & Rates", sublabel: "Zonas, reglas y multiplicadores",   sublabel_en: "Zones, rules and multipliers",       icon: "map-pin",     color: "#f97316" },
  { key: "consumos",    label: "Consumos",        label_en: "Consumption",   sublabel: "Actividad, uso real y reservas",   sublabel_en: "Activity, real usage and bookings",  icon: "bar-chart-2", color: "#3D9A84" },
  { key: "publicidad",  label: "Publicidad",      label_en: "Advertising",   sublabel: "Campañas y anuncios",              sublabel_en: "Campaigns and ads",                  icon: "speaker",     color: "#f59e0b" },
  { key: "facturacion", label: "Facturación",     label_en: "Billing",       sublabel: "Facturas e ingresos",              sublabel_en: "Invoices and revenue",               icon: "file-text",   color: "#4A80BD" },
  { key: "metricas",    label: "Métricas",        label_en: "Metrics",       sublabel: "Campañas y conversión",            sublabel_en: "Campaigns and conversion",           icon: "activity",    color: "#7C69BE" },
  { key: "empresas",    label: "Empresas",        label_en: "Companies",     sublabel: "Negocios conectados",              sublabel_en: "Connected businesses",               icon: "briefcase",   color: "#8b5cf6" },
  { key: "sistema",     label: "Sistema",         label_en: "System",        sublabel: "Precios, límites y promos",        sublabel_en: "Prices, limits and promos",          icon: "settings",    color: "#ef4444" },
];

interface Props {
  visible:  boolean;
  onClose:  () => void;
}

export function GoAdminDashboard({ visible, onClose }: Props) {
  const insets  = useSafeAreaInsets();
  const { lang } = useLanguage();
  const [section, setSection]           = useState<AdminSection>("overview");
  const [roadmapStack, setRoadmapStack] = useState<RoadmapNode[]>([]);
  const [infoPanel, setInfoPanel]       = useState<{ title: string; desc: string } | null>(null);

  const fabBottom = insets.bottom + 24;

  const goSection = (sec: AdminSection) => {
    setRoadmapStack([]);
    setSection(sec);
  };

  const handleBack = () => {
    if (roadmapStack.length > 0) {
      setRoadmapStack(prev => prev.slice(0, -1));
    } else if (section !== "overview") {
      setSection("overview");
    } else {
      onClose();
    }
  };

  const currentSec = SECTIONS.find(s => s.key === section);

  const headerTitle =
    roadmapStack.length > 0   ? roadmapStack[roadmapStack.length - 1].label :
    section !== "overview"    ? (lang === 'en' ? (currentSec?.label_en ?? currentSec?.label ?? "") : (currentSec?.label ?? "")) :
                                (lang === 'en' ? "GO Admin" : "Admin GO");
  const headerSub =
    roadmapStack.length > 0   ? roadmapStack.map(n => n.label).join(" › ") :
    section !== "overview"    ? (lang === 'en' ? (currentSec?.sublabel_en ?? currentSec?.sublabel ?? "") : (currentSec?.sublabel ?? "")) :
                                (lang === 'en' ? "Internal system control" : "Control interno del sistema");

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <StatusBar style="light" translucent backgroundColor="transparent" />
      <SafeAreaView style={s.root}>

        {/* ── Header ── */}
        <View style={s.header}>
          <View style={[s.iconBadge, { backgroundColor: "rgba(239,68,68,0.15)" }]}>
            <Feather name="shield" size={14} color="#ef4444" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{headerTitle}</Text>
            <Text style={s.subtitle}>{headerSub}</Text>
          </View>
        </View>

        {/* ── Overview ── */}
        {section === "overview" && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>

            <View style={s.metricsGrid}>
              <MetricCard label={lang === 'en' ? "Revenue Today" : "Ingresos hoy"}  value={MOCK_METRICS.ingresosHoy}  color="#3D9A84" icon="trending-up" />
              <MetricCard label={lang === 'en' ? "Revenue / Month" : "Ingresos mes"}  value={MOCK_METRICS.ingresosMes}  color="#4A80BD" icon="dollar-sign" />
              <MetricCard label={lang === 'en' ? "Uses Today" : "Usos hoy"}      value={MOCK_METRICS.usosHoy}      color="#f97316" icon="zap"         />
              <MetricCard label={lang === 'en' ? "Uses / Month" : "Usos mes"}      value={MOCK_METRICS.usosMes}      color="#8b5cf6" icon="activity"    />
            </View>

            <View style={s.totalRow}>
              <View style={s.totalCard}>
                <Feather name="award" size={14} color="#f59e0b" />
                <Text style={s.totalLabel}>{lang === 'en' ? "Estimated total revenue" : "Ingreso total estimado"}</Text>
                <Text style={s.totalValue}>{MOCK_METRICS.ingresoTotal}</Text>
              </View>
              <View style={s.totalCard}>
                <Feather name="star" size={14} color="#ec4899" />
                <Text style={s.totalLabel}>{lang === 'en' ? "Most profitable partner" : "Partner más rentable"}</Text>
                <Text style={s.totalValue}>{MOCK_METRICS.partnerTop}</Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>{lang === 'en' ? "MODULES" : "MÓDULOS"}</Text>
            <View style={s.sectGrid}>
              {SECTIONS.map(sec => (
                <TouchableOpacity
                  key={sec.key}
                  style={s.sectCard}
                  activeOpacity={0.78}
                  onPress={() => goSection(sec.key as AdminSection)}
                >
                  <View style={[s.sectIcon, { backgroundColor: `${sec.color}20` }]}>
                    <Feather name={sec.icon} size={19} color={sec.color} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sectLabel}>{lang === 'en' ? sec.label_en : sec.label}</Text>
                    <Text style={s.sectSub}>{lang === 'en' ? sec.sublabel_en : sec.sublabel}</Text>
                  </View>
                  <Feather name="chevron-right" size={14} color={DIM} />
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* ── Sub-sections ── */}
        {section === "roadmap"     && (
          <GoRoadmapScreen
            navStack={roadmapStack}
            setNavStack={setRoadmapStack}
            onGoLanding={onClose}
          />
        )}

        {section === "modulos_empresa" && (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          >
            <View style={{ marginBottom: 18, backgroundColor: "rgba(124,105,190,0.10)", borderRadius: 14,
              padding: 14, borderWidth: 1, borderColor: "rgba(124,105,190,0.25)", flexDirection: "row",
              alignItems: "flex-start", gap: 10 }}>
              <Feather name="grid" size={13} color="#7C69BE" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 11, color: DESC, lineHeight: 16, flex: 1 }}>
                {lang === 'en' ? (
                  <>GO/TESO is a <Text style={{ color: "#7C69BE", fontWeight: "700" }}>modular</Text> platform. Each block can be activated, sold and evolved independently.</>
                ) : (
                  <>GO/TESO es una plataforma <Text style={{ color: "#7C69BE", fontWeight: "700" }}>modular</Text>. Cada bloque puede activarse, venderse y evolucionar de forma independiente.</>
                )}
              </Text>
            </View>

            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 20,
              backgroundColor: CARD, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: BORD }}>
              {ESTADO_LEGEND.map((it) => (
                <View key={it.label} style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: it.color }} />
                  <Text style={{ fontSize: 10, fontWeight: "600", color: DESC }}>{lang === 'en' ? it.label_en : it.label}</Text>
                </View>
              ))}
            </View>

            {CATEGORIA_ORDEN.map((cat) => {
              const modsInCat = MODULOS_EMPRESA_ROADMAP.filter(m => m.categoria === cat);
              if (modsInCat.length === 0) return null;
              return (
                <View key={cat} style={{ marginBottom: 22 }}>
                  <Text style={s.sectionTitle}>{lang === 'en' ? CATEGORIA_LABEL_EN[cat] : CATEGORIA_LABEL[cat]}</Text>
                  <View style={{ gap: 10, paddingHorizontal: 16 }}>
                    {modsInCat.map((mod) => {
                      const stColor = getEstadoColor(mod.estado);
                      const isTerminado = mod.estado.toLowerCase().startsWith("terminado");
                      const displayDesc   = lang === 'en' ? mod.desc_en   : mod.desc;
                      const displayEstado = lang === 'en' ? mod.estado_en : mod.estado;
                      const displayChips  = lang === 'en' ? mod.chips_en  : mod.chips;
                      const displayNota   = lang === 'en' ? (mod.nota_en ?? mod.nota) : mod.nota;
                      return (
                        <View
                          key={mod.key}
                          style={{
                            backgroundColor: CARD,
                            borderRadius: 16,
                            padding: 16,
                            borderWidth: 1,
                            borderColor: BORD,
                            gap: 10,
                            position: "relative",
                          }}
                        >
                          <InfoButton
                            onPress={() => setInfoPanel({
                              title: lang === 'en' ? (mod.label_en ?? mod.label) : mod.label,
                              desc: lang === 'en' ? (mod.info_en ?? mod.info) : mod.info,
                            })}
                          />
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                            <View style={{ width: 44, height: 44, borderRadius: 13, backgroundColor: mod.color + "18",
                              alignItems: "center", justifyContent: "center" }}>
                              <Text style={{ fontSize: 20 }}>{mod.emoji}</Text>
                            </View>
                            <View style={{ flex: 1, paddingRight: 24 }}>
                              <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT, marginBottom: 2 }}>{lang === 'en' ? (mod.label_en ?? mod.label) : mod.label}</Text>
                              <Text style={{ fontSize: 11, color: DESC, lineHeight: 15 }}>{displayDesc}</Text>
                            </View>
                          </View>

                          <View style={{ alignSelf: "flex-start", paddingHorizontal: 9, paddingVertical: 4, borderRadius: 20,
                            backgroundColor: stColor + "20", borderWidth: 1, borderColor: stColor + "50" }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: stColor, letterSpacing: 0.5 }}>
                              {displayEstado.toUpperCase()}
                            </Text>
                          </View>

                          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                            {displayChips.map((chip) => (
                              <View key={chip} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                                borderWidth: 1, borderColor: mod.color + "30", backgroundColor: mod.color + "0A" }}>
                                <Text style={{ fontSize: 10, fontWeight: "600", color: mod.color }}>{chip}</Text>
                              </View>
                            ))}
                          </View>

                          {displayNota && (
                            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6,
                              backgroundColor: stColor + "15", borderRadius: 8, padding: 8 }}>
                              <Feather name="alert-triangle" size={12} color={stColor} style={{ marginTop: 1 }} />
                              <Text style={{ fontSize: 10, fontWeight: "600", color: stColor, flex: 1, lineHeight: 14 }}>
                                {displayNota}
                              </Text>
                            </View>
                          )}

                          {isTerminado && !displayNota && (
                            <View style={{ flexDirection: "row", alignItems: "center", gap: 6,
                              backgroundColor: stColor + "15", borderRadius: 8, padding: 8 }}>
                              <Feather name="check-circle" size={12} color={stColor} />
                              <Text style={{ fontSize: 11, fontWeight: "700", color: stColor }}>
                                {lang === 'en' ? "Mature module · demo ready" : "Módulo maduro · listo para demo"}
                              </Text>
                            </View>
                          )}

                          {mod.submodulos && mod.submodulos.length > 0 && (
                            <View style={{ gap: 8, marginTop: 2, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: mod.color + "40" }}>
                              <Text style={{ fontSize: 9, fontWeight: "700", color: DIM, letterSpacing: 0.6, textTransform: "uppercase" }}>
                                {lang === 'en' ? "Submodules" : "Submódulos"}
                              </Text>
                              {mod.submodulos.map((sub) => {
                                const subDesc  = lang === 'en' ? sub.desc_en  : sub.desc;
                                const subChips = lang === 'en' ? sub.chips_en : sub.chips;
                                return (
                                  <View key={sub.key} style={{ backgroundColor: BG, borderRadius: 12, padding: 12, gap: 6,
                                    borderWidth: 1, borderColor: BORD, position: "relative" }}>
                                    <InfoButton
                                      size={18}
                                      onPress={() => setInfoPanel({
                                        title: lang === 'en' ? (sub.label_en ?? sub.label) : sub.label,
                                        desc: lang === 'en' ? (sub.info_en ?? sub.info) : sub.info,
                                      })}
                                    />
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingRight: 22 }}>
                                      <Text style={{ fontSize: 15 }}>{sub.emoji}</Text>
                                      <Text style={{ fontSize: 12, fontWeight: "700", color: TEXT, flex: 1 }}>{lang === 'en' ? (sub.label_en ?? sub.label) : sub.label}</Text>
                                      {sub.accesoDirecto && (
                                        <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                                          backgroundColor: "rgba(236,72,153,0.15)", borderWidth: 1, borderColor: "rgba(236,72,153,0.35)" }}>
                                          <Text style={{ fontSize: 8, fontWeight: "700", color: "#ec4899", letterSpacing: 0.4 }}>
                                            {lang === 'en' ? "DIRECT ACCESS" : "ACCESO DIRECTO"}
                                          </Text>
                                        </View>
                                      )}
                                    </View>
                                    <Text style={{ fontSize: 10, color: DESC, lineHeight: 14 }}>{subDesc}</Text>
                                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                                      {subChips.map((chip) => (
                                        <View key={chip} style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 99,
                                          borderWidth: 1, borderColor: mod.color + "30", backgroundColor: mod.color + "0A" }}>
                                          <Text style={{ fontSize: 9, fontWeight: "600", color: mod.color }}>{chip}</Text>
                                        </View>
                                      ))}
                                    </View>
                                  </View>
                                );
                              })}
                            </View>
                          )}
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })}

            <View style={{ marginTop: 4, backgroundColor: CARD, borderRadius: 14, padding: 14,
              borderWidth: 1, borderColor: BORD, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
              <Feather name="info" size={13} color="#4A80BD" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 11, color: DIM, lineHeight: 16, flex: 1 }}>
                {lang === 'en' ? (
                  <>Only modules with status <Text style={{ color: "#22c55e", fontWeight: "700" }}>DONE / VISIBLE IN GO ENTERPRISE</Text> appear on the GO Enterprise screen visible to the client. The rest remain in this internal roadmap.</>
                ) : (
                  <>Solo los módulos con estado <Text style={{ color: "#22c55e", fontWeight: "700" }}>TERMINADO / VISIBLE EN GO EMPRESA</Text> aparecen en la pantalla GO Empresa visible para el cliente. El resto permanece en este roadmap interno.</>
                )}
              </Text>
            </View>
          </ScrollView>
        )}

        {section === "siguientes_modulos" && (
          <ScrollView
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
          >
            <View style={{ marginBottom: 16, backgroundColor: "rgba(139,92,246,0.10)", borderRadius: 14,
              padding: 14, borderWidth: 1, borderColor: "rgba(139,92,246,0.25)", flexDirection: "row",
              alignItems: "flex-start", gap: 10 }}>
              <Feather name="info" size={13} color="#8b5cf6" style={{ marginTop: 1 }} />
              <Text style={{ fontSize: 11, color: DIM, lineHeight: 16, flex: 1 }}>
                {lang === 'en' ? (
                  <>Information only. These modules are planned but{" "}
                  <Text style={{ color: "#8b5cf6", fontWeight: "700" }}>not yet in development</Text>.
                  This section is only visible from ADMIN.</>
                ) : (
                  <>Solo informativo. Estos módulos están planificados pero{" "}
                  <Text style={{ color: "#8b5cf6", fontWeight: "700" }}>aún no están en desarrollo</Text>.
                  Esta sección es visible únicamente desde ADMIN.</>
                )}
              </Text>
            </View>

            <Text style={s.sectionTitle}>{lang === 'en' ? "NEXT MODULES — 5 IN PIPELINE" : "PRÓXIMOS MÓDULOS — 5 EN PIPELINE"}</Text>
            <View style={{ gap: 10 }}>
              {SIGUIENTES_MODULOS.map((mod) => {
                const displayShortDesc = lang === 'en' ? mod.shortDesc_en : mod.shortDesc;
                const displayIncludes  = lang === 'en' ? mod.includes_en  : mod.includes;
                const displayObjetivo  = lang === 'en' ? mod.objetivo_en  : mod.objetivo;
                return (
                  <View
                    key={mod.key}
                    style={{
                      backgroundColor: CARD,
                      borderRadius: 16,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: BORD,
                      gap: 12,
                      position: "relative",
                    }}
                  >
                    <InfoButton
                      onPress={() => setInfoPanel({
                        title: lang === 'en' ? (mod.label_en ?? mod.label) : mod.label,
                        desc: lang === 'en' ? (mod.info_en ?? mod.info) : mod.info,
                      })}
                    />
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                      <View style={{ width: 44, height: 44, borderRadius: 13,
                        backgroundColor: mod.color + "18", alignItems: "center", justifyContent: "center" }}>
                        <Text style={{ fontSize: 20 }}>{mod.emoji}</Text>
                      </View>
                      <View style={{ flex: 1, paddingRight: 24 }}>
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 }}>
                          <Text style={{ fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT }}>{lang === 'en' ? (mod.label_en ?? mod.label) : mod.label}</Text>
                          <View style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                            backgroundColor: "rgba(139,92,246,0.15)", borderWidth: 1,
                            borderColor: "rgba(139,92,246,0.30)" }}>
                            <Text style={{ fontSize: 9, fontWeight: "700", color: "#8b5cf6", letterSpacing: 0.6 }}>
                              {lang === 'en' ? "UPCOMING" : "PRÓXIMO"}
                            </Text>
                          </View>
                        </View>
                        <Text style={{ fontSize: 11, color: DIM, lineHeight: 15 }}>{displayShortDesc}</Text>
                      </View>
                    </View>

                    <View style={{ gap: 5 }}>
                      <Text style={{ fontSize: 9, fontWeight: "700", color: DIM, letterSpacing: 0.8,
                        textTransform: "uppercase", marginBottom: 2 }}>{lang === 'en' ? "Includes" : "Incluye"}</Text>
                      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
                        {displayIncludes.map((item) => (
                          <View key={item} style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 99,
                            borderWidth: 1, borderColor: mod.color + "30", backgroundColor: mod.color + "0A" }}>
                            <Text style={{ fontSize: 10, fontWeight: "600", color: mod.color }}>{item}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 6,
                      backgroundColor: mod.color + "0D", borderRadius: 10, padding: 10 }}>
                      <Feather name="target" size={11} color={mod.color} style={{ marginTop: 1 }} />
                      <Text style={{ fontSize: 11, color: mod.color + "CC", lineHeight: 15, flex: 1, fontWeight: "500" }}>
                        {displayObjetivo}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}

        {section === "partners"    && <PartnersScreen dark />}
        {section === "zones_rates" && <ZonasScreen dark />}
        {section === "consumos"    && <ConsumoScreen dark />}
        {section === "publicidad"  && <PublicidadScreen />}
        {section === "facturacion" && <FacturacionScreen />}
        {section === "sistema"     && <AdminScreen />}

        {section === "metricas" && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}>
            {MOCK_METRICAS.map((m, i) => (
              <View key={i} style={s.metRow}>
                <View style={[s.metIcon, { backgroundColor: `${m.color}20` }]}>
                  <Feather name={m.icon} size={16} color={m.color} />
                </View>
                <Text style={s.metLabel}>{lang === 'en' ? m.label_en : m.label}</Text>
                <Text style={[s.metVal, { color: m.color }]}>{m.valor}</Text>
              </View>
            ))}
          </ScrollView>
        )}

        {section === "empresas" && (
          <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: 120 }}>
            <Text style={s.sectionTitle}>{lang === 'en' ? "CONNECTED BUSINESSES" : "NEGOCIOS CONECTADOS"}</Text>
            {MOCK_EMPRESAS.map((e, i) => (
              <View key={i} style={s.empresaRow}>
                <View style={[s.empresaDot, { backgroundColor: e.activa ? "#3D9A84" : "#555" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={s.empresaNombre}>{e.nombre}</Text>
                  <Text style={s.empresaSub}>
                    {lang === 'en'
                      ? `${e.orbitas} active orbit${e.orbitas !== 1 ? "s" : ""}`
                      : `${e.orbitas} órbita${e.orbitas !== 1 ? "s" : ""} activa${e.orbitas !== 1 ? "s" : ""}`}
                  </Text>
                </View>
                <View style={[s.empresaStatus, {
                  backgroundColor: e.activa ? "rgba(61,154,132,0.15)" : "rgba(255,255,255,0.06)",
                  borderColor:     e.activa ? "rgba(61,154,132,0.30)" : "rgba(255,255,255,0.10)",
                }]}>
                  <Text style={[s.empresaStatusTxt, { color: e.activa ? "#3D9A84" : DIM }]}>
                    {e.activa ? (lang === 'en' ? "Active" : "Activa") : (lang === 'en' ? "Inactive" : "Inactiva")}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
        )}

        {/* ── FABs flotantes ────────────────────────────────────────────────── */}
        <DraggableFAB
          screenKey="admin_dashboard"
          buttonKey="main"
          initialRight={20}
          initialBottom={fabBottom}
          maxH={90}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleBack}
            hitSlop={8}
            accessibilityLabel={lang === 'en' ? "Go back one step" : "Volver al paso anterior"}
            style={s.fabBtn}
          >
            <Feather name="chevron-down" size={22} color="rgba(255,255,255,0.90)" />
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onClose}
            hitSlop={8}
            accessibilityLabel={lang === 'en' ? "Return to GO Landing" : "Volver al Landing GO"}
            style={s.fabBtn}
          >
            <View style={{ alignItems: "center" }}>
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" />
              <Feather name="chevron-down" size={13} color="rgba(255,255,255,0.90)" style={{ marginTop: -5 }} />
            </View>
          </TouchableOpacity>
        </DraggableFAB>

        {/* ── Info panel (module descriptions) ── */}
        <Modal
          visible={!!infoPanel}
          transparent
          animationType="fade"
          onRequestClose={() => setInfoPanel(null)}
        >
          <TouchableOpacity
            style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 28 }}
            activeOpacity={1}
            onPress={() => setInfoPanel(null)}
          >
            <TouchableOpacity
              activeOpacity={1}
              onPress={() => {}}
              style={{ width: "100%", maxWidth: 340, backgroundColor: CARD, borderRadius: 18,
                borderWidth: 1, borderColor: BORD, padding: 18, gap: 10 }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <Text style={{ flex: 1, fontSize: 15, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT }}>
                  {infoPanel?.title}
                </Text>
                <TouchableOpacity
                  onPress={() => setInfoPanel(null)}
                  hitSlop={8}
                  accessibilityLabel={lang === 'en' ? "Close" : "Cerrar"}
                  style={{ width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center",
                    backgroundColor: "rgba(255,255,255,0.08)" }}
                >
                  <Feather name="x" size={14} color={DESC} />
                </TouchableOpacity>
              </View>
              <Text style={{ fontSize: 13, color: DESC, lineHeight: 19 }}>
                {infoPanel?.desc}
              </Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>

      </SafeAreaView>
    </Modal>
  );
}

function InfoButton({ onPress, size = 20 }: { onPress: () => void; size?: number }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={8}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Info"
      style={{
        position: "absolute",
        top: -8,
        right: -8,
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1,
        borderColor: "#FFFFFF",
        backgroundColor: "rgba(0,0,0,0.35)",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 5,
      }}
    >
      <Text style={{ color: "#FFFFFF", fontSize: size * 0.6, fontWeight: "700", fontStyle: "italic", lineHeight: size * 0.7 }}>i</Text>
    </TouchableOpacity>
  );
}

function MetricCard({ label, value, color, icon }: {
  label: string; value: string; color: string;
  icon: React.ComponentProps<typeof Feather>["name"];
}) {
  return (
    <View style={[s.metCard, { borderColor: `${color}28` }]}>
      <Feather name={icon} size={13} color={color} />
      <Text style={s.metCardVal}>{value}</Text>
      <Text style={s.metCardLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root:           { flex: 1, backgroundColor: BG },
  header:         { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 14, backgroundColor: CARD, borderBottomWidth: 1, borderBottomColor: BORD },
  iconBadge:      { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  title:          { fontSize: 16, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT, letterSpacing: 0.1 },
  subtitle:       { fontSize: 11, color: DIM, fontWeight: "500", marginTop: 1 },
  metricsGrid:    { flexDirection: "row", flexWrap: "wrap", gap: 10, padding: 16, paddingBottom: 0 },
  metCard:        { flex: 1, minWidth: (SW - 52) / 2, backgroundColor: CARD, borderRadius: 14, padding: 14, alignItems: "flex-start", gap: 6, borderWidth: 1 },
  metCardVal:     { fontSize: 20, fontFamily: "Inter_900Black", fontWeight: "900", color: TEXT },
  metCardLabel:   { fontSize: 10, color: DIM, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  totalRow:       { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 10 },
  totalCard:      { flex: 1, backgroundColor: CARD, borderRadius: 14, padding: 14, gap: 4, borderWidth: 1, borderColor: BORD, flexDirection: "row", alignItems: "center", flexWrap: "wrap" },
  totalLabel:     { fontSize: 10, color: DIM, fontWeight: "600", flex: 1, textTransform: "uppercase", letterSpacing: 0.3 },
  totalValue:     { fontSize: 14, fontFamily: "Inter_700Bold", fontWeight: "800", color: TEXT, width: "100%" },
  sectionTitle:   { fontSize: 10, fontWeight: "700", color: DIM, letterSpacing: 0.8, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 8 },
  sectGrid:       { paddingHorizontal: 16, gap: 6 },
  sectCard:       { backgroundColor: CARD, borderRadius: 14, padding: 14, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 1, borderColor: BORD },
  sectIcon:       { width: 40, height: 40, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  sectLabel:      { fontSize: 14, fontWeight: "700", color: TEXT, marginBottom: 2 },
  sectSub:        { fontSize: 11, color: DIM, fontWeight: "500" },
  metRow:         { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD },
  metIcon:        { width: 36, height: 36, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  metLabel:       { flex: 1, fontSize: 13, fontWeight: "600", color: TEXT },
  metVal:         { fontSize: 16, fontFamily: "Inter_900Black", fontWeight: "900" },
  empresaRow:     { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: CARD, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: BORD },
  empresaDot:     { width: 10, height: 10, borderRadius: 5 },
  empresaNombre:  { fontSize: 14, fontWeight: "700", color: TEXT },
  empresaSub:     { fontSize: 11, color: DIM, marginTop: 2 },
  empresaStatus:  { borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  empresaStatusTxt: { fontSize: 10, fontWeight: "700" },
  fabBtn:         {
    width:           44,
    height:          44,
    borderRadius:    13,
    backgroundColor: "#0F0F0F",
    borderWidth:     1,
    borderColor:     "rgba(255,255,255,0.18)",
    alignItems:      "center",
    justifyContent:  "center",
    shadowColor:     "#000",
    shadowOpacity:   0.40,
    shadowRadius:    6,
    shadowOffset:    { width: 0, height: 3 },
    elevation:       6,
  },
});
