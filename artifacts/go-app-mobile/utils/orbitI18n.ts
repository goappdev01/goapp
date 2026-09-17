export const ORBIT_NAMES_EN: Record<string, string> = {
  orb_comunicacion:  "Communication",
  orb_calendario:    "Advanced Calendar",
  orb_prl:           "PRL",
  orb_industria:     "Industry",
  orb_marketplace:   "Marketplace",
  orb_ia:            "AI",
  orb_rrhh:          "HR",
  orb_logistica:     "Logistics",
  orb_mantenimiento: "Maintenance",
  orb_transporte:    "Transport",
  orb_viajes:        "Travel",
  orb_restauracion:  "Catering",
  orb_sugerencias:   "Suggestions",
  orb_automatizacion:"Automations",
  orb_almacen:       "Warehouse",
};

export const ORBIT_DESC_EN: Record<string, string> = {
  orb_comunicacion:  "Messaging, notifications and internal alerts.",
  orb_calendario:    "Agenda management, meetings and availability.",
  orb_prl:           "Occupational Risk Prevention and safety.",
  orb_industria:     "Production, machinery and process control.",
  orb_marketplace:   "Purchases, suppliers and order management.",
  orb_ia:            "Automations, predictions and AI assistant.",
  orb_rrhh:          "Human resources, payroll and evaluations.",
  orb_logistica:     "Routes, deliveries and fleet control.",
  orb_mantenimiento: "Work orders, preventive and corrective.",
  orb_transporte:    "Vehicle, driver and trip management.",
  orb_viajes:        "Bookings, expenses and travel management.",
  orb_restauracion:  "Orders, daily menu and canteen management.",
  orb_sugerencias:   "AI suggestions engine for operations.",
  orb_automatizacion:"Flows, rules and automatic triggers.",
  orb_almacen:       "Stock, inventory and entry/exit control.",
};

export const ORBIT_CAT_EN: Record<string, string> = {
  core:       "core",
  industria:  "industry",
  comercio:   "commerce",
  ia:         "ai",
  gestion:    "management",
  operaciones:"operations",
  servicios:  "services",
};

export function orbitName(id: string, nombre: string, lang: string) {
  return lang === "en" ? (ORBIT_NAMES_EN[id] ?? nombre) : nombre;
}

export function orbitDesc(id: string, descripcion: string, lang: string) {
  return lang === "en" ? (ORBIT_DESC_EN[id] ?? descripcion) : descripcion;
}

export function orbitCat(cat: string, lang: string) {
  return lang === "en" ? (ORBIT_CAT_EN[cat] ?? cat) : cat;
}
