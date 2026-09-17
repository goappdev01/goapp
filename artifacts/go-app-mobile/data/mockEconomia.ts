// ══════════════════════════════════════════════════════════════════════
// MOCK DATA — ARQUITECTURA ECONÓMICA GO
// Datos de demostración para todas las pantallas de empresa.
// Reemplazar por llamadas reales al backend cuando esté listo.
// ══════════════════════════════════════════════════════════════════════

import type {
  Empresa,
  PlanEmpresa,
  OrbitaDefinicion,
  OrbitaContratada,
  MetricasVolumen,
  BloqueVolumen,
  Sugerencia,
  Partner,
  EventoPartner,
  PricingZone,
  ZonePricingRule,
  AdCampaign,
  Factura,
} from "../types/economia";

// ── EMPRESA ───────────────────────────────────────────────────────────

export const MOCK_EMPRESA: Empresa = {
  empresaId: "emp_001",
  nombre: "Construcciones Rivera S.L.",
  sector: "Construcción",
  plan: "empresa",
  fechaRegistro: "2024-01-15",
  proximaRenovacion: "2025-06-15",
  usuariosActivos: 34,
  usuariosLicencia: 50,
  limiteAlerta: 45,
  costeEstimadoMes: 847.50,
};

// ── PLANES ────────────────────────────────────────────────────────────

export const PLANES: PlanEmpresa[] = [
  {
    tipo: "free",
    nombre: "GO Free",
    precioMensual: 0,
    moneda: "EUR",
    goIncluidos: 100,
    usuariosIncluidos: 3,
    orbitasIncluidas: 1,
    sugerenciasIncluidas: 10,
    iaIncluida: false,
    soporte: "basico",
    descripcion: "Para equipos pequeños que quieren probar GO.",
  },
  {
    tipo: "pro",
    nombre: "GO Pro",
    precioMensual: 29,
    moneda: "EUR",
    goIncluidos: 1000,
    usuariosIncluidos: 10,
    orbitasIncluidas: 3,
    sugerenciasIncluidas: 100,
    iaIncluida: true,
    soporte: "prioritario",
    descripcion: "Para equipos en crecimiento con necesidades avanzadas.",
  },
  {
    tipo: "empresa",
    nombre: "GO Empresa",
    precioMensual: 149,
    moneda: "EUR",
    goIncluidos: 10000,
    usuariosIncluidos: 50,
    orbitasIncluidas: 10,
    sugerenciasIncluidas: 1000,
    iaIncluida: true,
    soporte: "prioritario",
    descripcion: "Para empresas con operaciones complejas y múltiples departamentos.",
  },
  {
    tipo: "enterprise",
    nombre: "GO Enterprise",
    precioMensual: 499,
    moneda: "EUR",
    goIncluidos: 999999,
    usuariosIncluidos: 999999,
    orbitasIncluidas: 999999,
    sugerenciasIncluidas: 999999,
    iaIncluida: true,
    soporte: "dedicado",
    descripcion: "Solución completa para grandes corporaciones. Personalizable.",
  },
];

// ── ÓRBITAS DISPONIBLES ───────────────────────────────────────────────

export const ORBITAS_CATALOGO: OrbitaDefinicion[] = [
  { orbitId: "orb_comunicacion",  nombre: "Comunicación",  descripcion: "Mensajería, notificaciones y alertas internas.", icono: "message-circle", color: "#3b82f6", precioMensualBase: 29,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "core"       },
  { orbitId: "orb_calendario",    nombre: "Calendario Avanzado", descripcion: "Gestión de agenda, reuniones y disponibilidad.", icono: "calendar", color: "#8b5cf6", precioMensualBase: 19,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "core"       },
  { orbitId: "orb_prl",           nombre: "PRL",           descripcion: "Prevención de Riesgos Laborales y seguridad.", icono: "shield",         color: "#f59e0b", precioMensualBase: 49,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "industria"  },
  { orbitId: "orb_industria",     nombre: "Industria",     descripcion: "Producción, maquinaria y control de procesos.", icono: "tool",           color: "#6b7280", precioMensualBase: 69,  iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "industria"  },
  { orbitId: "orb_marketplace",   nombre: "Marketplace",   descripcion: "Compras, proveedores y gestión de pedidos.", icono: "shopping-bag",   color: "#f97316", precioMensualBase: 39,  iaIncluida: false, sugerenciasIncluidas: true,  categoria: "comercio"   },
  { orbitId: "orb_ia",            nombre: "IA",            descripcion: "Automatizaciones, predicciones y asistente IA.", icono: "cpu",          color: "#00ff88", precioMensualBase: 99,  iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "ia"         },
  { orbitId: "orb_rrhh",          nombre: "RRHH",          descripcion: "Recursos humanos, nóminas y evaluaciones.", icono: "users",          color: "#ec4899", precioMensualBase: 59,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "gestion"    },
  { orbitId: "orb_logistica",     nombre: "Logística",     descripcion: "Rutas, entregas y control de flota.", icono: "truck",              color: "#0d9488", precioMensualBase: 49,  iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "operaciones"},
  { orbitId: "orb_mantenimiento", nombre: "Mantenimiento", descripcion: "Órdenes de trabajo, preventivo y correctivo.", icono: "settings",      color: "#78350f", precioMensualBase: 39,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "operaciones"},
  { orbitId: "orb_transporte",    nombre: "Transporte",    descripcion: "Gestión de vehículos, conductores y viajes.", icono: "navigation",    color: "#1e40af", precioMensualBase: 59,  iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "operaciones"},
  { orbitId: "orb_viajes",        nombre: "Viajes",        descripcion: "Reservas, dietas y gestión de desplazamientos.", icono: "compass",      color: "#0891b2", precioMensualBase: 29,  iaIncluida: false, sugerenciasIncluidas: true,  categoria: "servicios"  },
  { orbitId: "orb_restauracion",  nombre: "Restauración",  descripcion: "Pedidos, menú del día y gestión de comedor.", icono: "coffee",        color: "#b45309", precioMensualBase: 39,  iaIncluida: false, sugerenciasIncluidas: true,  categoria: "servicios"  },
  { orbitId: "orb_sugerencias",   nombre: "Sugerencias",   descripcion: "Motor de sugerencias IA para operaciones.", icono: "zap",            color: "#f59e0b", precioMensualBase: 79,  iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "ia"         },
  { orbitId: "orb_automatizacion",nombre: "Automatizaciones", descripcion: "Flujos, reglas y triggers automáticos.", icono: "repeat",         color: "#7c3aed", precioMensualBase: 89,  iaIncluida: true,  sugerenciasIncluidas: false, categoria: "ia"         },
  { orbitId: "orb_almacen",       nombre: "Almacén",       descripcion: "Stock, inventario y control de entradas/salidas.", icono: "archive",  color: "#64748b", precioMensualBase: 49,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "operaciones"},
];

// ── ÓRBITAS CONTRATADAS (empresa actual) ──────────────────────────────

export const ORBITAS_CONTRATADAS: OrbitaContratada[] = [
  { orbitId: "orb_comunicacion",  empresaId: "emp_001", nombre: "Comunicación",   descripcion: "Mensajería interna.",         icono: "message-circle", color: "#3b82f6", precioMensual: 29,  estado: "activa",         fechaActivacion: "2024-01-15", fechaRenovacion: "2025-06-15", usuariosPermitidos: 50, limiteUsoMensual: 10000, usoActual: 6834,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "core"        },
  { orbitId: "orb_rrhh",          empresaId: "emp_001", nombre: "RRHH",           descripcion: "Recursos Humanos.",           icono: "users",          color: "#ec4899", precioMensual: 59,  estado: "activa",         fechaActivacion: "2024-02-01", fechaRenovacion: "2025-06-01", usuariosPermitidos: 50, limiteUsoMensual: 5000,  usoActual: 2210,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "gestion"     },
  { orbitId: "orb_logistica",     empresaId: "emp_001", nombre: "Logística",      descripcion: "Rutas y entregas.",           icono: "truck",          color: "#0d9488", precioMensual: 49,  estado: "activa",         fechaActivacion: "2024-03-10", fechaRenovacion: "2025-06-10", usuariosPermitidos: 20, limiteUsoMensual: 3000,  usoActual: 2890,  iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "operaciones" },
  { orbitId: "orb_mantenimiento", empresaId: "emp_001", nombre: "Mantenimiento",  descripcion: "Órdenes de trabajo.",         icono: "settings",       color: "#78350f", precioMensual: 39,  estado: "activa",         fechaActivacion: "2024-03-10", fechaRenovacion: "2025-06-10", usuariosPermitidos: 15, limiteUsoMensual: 2000,  usoActual: 1120,  iaIncluida: false, sugerenciasIncluidas: false, categoria: "operaciones" },
  { orbitId: "orb_ia",            empresaId: "emp_001", nombre: "IA",             descripcion: "Asistente e inteligencia.",   icono: "cpu",            color: "#00ff88", precioMensual: 99,  estado: "prueba",         fechaActivacion: "2025-05-01", fechaRenovacion: "2025-06-01", usuariosPermitidos: 5,  limiteUsoMensual: 500,   usoActual: 87,    iaIncluida: true,  sugerenciasIncluidas: true,  categoria: "ia"          },
  { orbitId: "orb_almacen",       empresaId: "emp_001", nombre: "Almacén",        descripcion: "Inventario.",                 icono: "archive",        color: "#64748b", precioMensual: 49,  estado: "pausada",        fechaActivacion: "2024-06-01", fechaRenovacion: "2025-06-01", usuariosPermitidos: 10, limiteUsoMensual: 2000,  usoActual: 0,     iaIncluida: false, sugerenciasIncluidas: false, categoria: "operaciones" },
  { orbitId: "orb_prl",           empresaId: "emp_001", nombre: "PRL",            descripcion: "Prevención riesgos.",         icono: "shield",         color: "#f59e0b", precioMensual: 49,  estado: "vencida",        fechaActivacion: "2024-01-01", fechaRenovacion: "2025-01-01", usuariosPermitidos: 50, limiteUsoMensual: 5000,  usoActual: 0,     iaIncluida: false, sugerenciasIncluidas: false, categoria: "industria"   },
];

// ── MÉTRICAS DE VOLUMEN ───────────────────────────────────────────────

export const METRICAS_VOLUMEN: MetricasVolumen = {
  empresaId: "emp_001",
  mes: "Mayo 2025",
  goCreados: 1247,
  goEnviados: 1189,
  goCompletados: 934,
  tareasCreadas: 3421,
  mensajesEnviados: 8904,
  usuariosActivos: 34,
  usoTotal: 7234,
  limiteIncluido: 10000,
  exceso: 0,
  costeExceso: 0,
};

export const BLOQUES_VOLUMEN: BloqueVolumen[] = [
  { bloqueId: "blq_1k",  descripcion: "1.000 GO adicionales",  cantidadGO: 1000,  precio: 9.90,  moneda: "EUR" },
  { bloqueId: "blq_5k",  descripcion: "5.000 GO adicionales",  cantidadGO: 5000,  precio: 39.90, moneda: "EUR" },
  { bloqueId: "blq_10k", descripcion: "10.000 GO adicionales", cantidadGO: 10000, precio: 69.90, moneda: "EUR" },
];

// ── SUGERENCIAS ────────────────────────────────────────────────────────

export const MOCK_SUGERENCIAS: Sugerencia[] = [
  { suggestionId: "sug_001", empresaId: "emp_001", usuarioId: "usr_001", categoria: "transporte", orbitId: "orb_logistica",  titulo: "Ruta optimizada zona norte",     descripcion: "Combina 3 entregas pendientes ahorrando 40 min.", origen: "ia",       costeUnitario: 0.05, estado: "seleccionada", fechaCreacion: "2025-05-18T08:30:00Z" },
  { suggestionId: "sug_002", empresaId: "emp_001", usuarioId: "usr_002", categoria: "comida",     orbitId: "orb_restauracion",titulo: "Menú del día disponible",        descripcion: "Restaurante La Pepita: 11,50 € menú ejecutivo.", origen: "partner",  costeUnitario: 0.02, estado: "convertida",  fechaCreacion: "2025-05-18T12:00:00Z", partnerId: "par_pepita"  },
  { suggestionId: "sug_003", empresaId: "emp_001", usuarioId: "usr_003", categoria: "operativa",  orbitId: "orb_mantenimiento", titulo: "Revisión preventiva vehículo 3", descripcion: "Vence en 5 días. Programar taller.", origen: "sistema",  costeUnitario: 0.01, estado: "mostrada",    fechaCreacion: "2025-05-17T16:00:00Z" },
  { suggestionId: "sug_004", empresaId: "emp_001", usuarioId: "usr_001", categoria: "viaje",      orbitId: "orb_viajes",     titulo: "Hotel Ibis Madrid",              descripcion: "Viaje previsto 24-26 junio. Precio desde 89 €.", origen: "partner",  costeUnitario: 0.08, estado: "mostrada",    fechaCreacion: "2025-05-18T09:00:00Z", partnerId: "par_booking" },
  { suggestionId: "sug_005", empresaId: "emp_001", usuarioId: "usr_004", categoria: "ia",         orbitId: "orb_ia",         titulo: "Automatizar parte de incidencias",descripcion: "Detecté 12 patrones repetitivos este mes.", origen: "ia",       costeUnitario: 0.10, estado: "ignorada",    fechaCreacion: "2025-05-16T11:00:00Z" },
  { suggestionId: "sug_006", empresaId: "emp_001", usuarioId: "usr_002", categoria: "transporte", orbitId: "orb_transporte", titulo: "Uber Business disponible",       descripcion: "Traslado aeropuerto mañana 07:15h.", origen: "partner",  costeUnitario: 0.05, estado: "convertida",  fechaCreacion: "2025-05-18T07:00:00Z", partnerId: "par_uber"    },
];

// ── PARTNERS ───────────────────────────────────────────────────────────

export const MOCK_PARTNERS: Partner[] = [
  { partnerId: "par_uber",     nombre: "Uber Business",  categoria: "transporte", logo: "navigation", color: "#000000", activo: true,  costeLead: 0.50, costeConversion: 2.50, porcentajeComision: 8,  descripcion: "Transporte ejecutivo bajo demanda." },
  { partnerId: "par_bolt",     nombre: "Bolt",           categoria: "transporte", logo: "zap",        color: "#34D186", activo: true,  costeLead: 0.30, costeConversion: 1.80, porcentajeComision: 7,  descripcion: "Transporte urbano económico." },
  { partnerId: "par_booking",  nombre: "Booking.com",    categoria: "viaje",      logo: "map-pin",    color: "#003580", activo: true,  costeLead: 1.00, costeConversion: 8.00, porcentajeComision: 4,  descripcion: "Hoteles y alojamientos en todo el mundo." },
  { partnerId: "par_airbnb",   nombre: "Airbnb",         categoria: "viaje",      logo: "home",       color: "#FF5A5F", activo: true,  costeLead: 0.80, costeConversion: 6.50, porcentajeComision: 3,  descripcion: "Alojamientos únicos y apartamentos." },
  { partnerId: "par_pepita",   nombre: "Rest. La Pepita",categoria: "comida",     logo: "coffee",     color: "#b45309", activo: true,  costeLead: 0.20, costeConversion: 0.80, porcentajeComision: 10, descripcion: "Restaurante local con menú ejecutivo." },
  { partnerId: "par_glovo",    nombre: "Glovo",          categoria: "comida",     logo: "package",    color: "#FFC244", activo: true,  costeLead: 0.25, costeConversion: 1.20, porcentajeComision: 12, descripcion: "Delivery express en toda la ciudad." },
  { partnerId: "par_amazon",   nombre: "Amazon Business",categoria: "marketplace",logo: "shopping-bag",color: "#FF9900",activo: false, costeLead: 0.60, costeConversion: 3.00, porcentajeComision: 5,  descripcion: "Compras B2B y material de oficina." },
];

export const MOCK_EVENTOS_PARTNER: EventoPartner[] = [
  { eventoId: "ev_001", partnerId: "par_uber",    empresaId: "emp_001", usuarioId: "usr_002", categoria: "transporte", tipoEvento: "conversion",       importe: 24.50, porcentaje: 8, costeLead: 0.50, costeConversion: 2.50, estadoConversion: "completada", fecha: "2025-05-18T07:45:00Z" },
  { eventoId: "ev_002", partnerId: "par_booking", empresaId: "emp_001", usuarioId: "usr_001", categoria: "viaje",      tipoEvento: "reserva_iniciada", importe: 89.00, porcentaje: 4, costeLead: 1.00, costeConversion: 0.00, estadoConversion: "pendiente",  fecha: "2025-05-18T09:10:00Z" },
  { eventoId: "ev_003", partnerId: "par_pepita",  empresaId: "emp_001", usuarioId: "usr_002", categoria: "comida",     tipoEvento: "compra_realizada", importe: 11.50, porcentaje: 10,costeLead: 0.20, costeConversion: 0.80, estadoConversion: "completada", fecha: "2025-05-18T13:20:00Z" },
  { eventoId: "ev_004", partnerId: "par_bolt",    empresaId: "emp_001", usuarioId: "usr_003", categoria: "transporte", tipoEvento: "clic",             importe: 0,     porcentaje: 0, costeLead: 0.30, costeConversion: 0.00, estadoConversion: "pendiente",  fecha: "2025-05-17T17:00:00Z" },
  { eventoId: "ev_005", partnerId: "par_glovo",   empresaId: "emp_001", usuarioId: "usr_004", categoria: "comida",     tipoEvento: "pedido_entregado", importe: 18.90, porcentaje: 12,costeLead: 0.25, costeConversion: 1.20, estadoConversion: "completada", fecha: "2025-05-17T14:00:00Z" },
];

// ── ZONAS DE PRECIOS ───────────────────────────────────────────────────

export const MOCK_ZONAS: PricingZone[] = [
  { zoneId: "zone_madrid_centro",   pais: "España", ciudad: "Madrid",     barrio: "Centro / Sol",     coordenadas: { lat: 40.4168, lng: -3.7038 }, radio: 1500, densidad: 98, nivelComercial: "premium", multiplicadorPrecio: 2.2, activa: true,  descripcion: "Centro premium de Madrid, máxima demanda." },
  { zoneId: "zone_madrid_norte",    pais: "España", ciudad: "Madrid",     barrio: "Chamartín / Norte",coordenadas: { lat: 40.4639, lng: -3.6919 }, radio: 3000, densidad: 72, nivelComercial: "alto",    multiplicadorPrecio: 1.6, activa: true,  descripcion: "Zona empresarial norte de Madrid." },
  { zoneId: "zone_bcn_eixample",    pais: "España", ciudad: "Barcelona",  barrio: "Eixample",         coordenadas: { lat: 41.3917, lng: 2.1648  }, radio: 2000, densidad: 90, nivelComercial: "premium", multiplicadorPrecio: 2.0, activa: true,  descripcion: "Núcleo comercial de Barcelona." },
  { zoneId: "zone_mad_periferia",   pais: "España", ciudad: "Madrid",     barrio: "Periferia",        coordenadas: { lat: 40.3500, lng: -3.7500 }, radio: 8000, densidad: 35, nivelComercial: "medio",   multiplicadorPrecio: 1.0, activa: true,  descripcion: "Zona residencial periférica." },
  { zoneId: "zone_aeropuerto_mad",  pais: "España", ciudad: "Madrid",     barrio: "Aeropuerto IFEMA", coordenadas: { lat: 40.4983, lng: -3.5676 }, radio: 2000, densidad: 85, nivelComercial: "premium", multiplicadorPrecio: 2.5, activa: true,  descripcion: "Aeropuerto Adolfo Suárez — alta demanda puntual." },
  { zoneId: "zone_rural_castilla",  pais: "España", ciudad: "Ávila",      barrio: "Zona rural",       coordenadas: { lat: 40.6565, lng: -4.6978 }, radio: 15000,densidad: 8,  nivelComercial: "bajo",    multiplicadorPrecio: 0.6, activa: true,  descripcion: "Área rural con baja densidad comercial." },
];

// ── REGLAS DE TARIFAS ─────────────────────────────────────────────────

export const MOCK_REGLAS: ZonePricingRule[] = [
  { ruleId: "rule_001", zoneId: "zone_madrid_centro",  orbitId: "orb_transporte", categoria: "transporte", tipoEvento: "conversion", precioBase: 2.50, multiplicadorZona: 2.2, precioFinal: 5.50, moneda: "EUR", activo: true },
  { ruleId: "rule_002", zoneId: "zone_aeropuerto_mad", orbitId: "orb_transporte", categoria: "transporte", tipoEvento: "lead",       precioBase: 1.00, multiplicadorZona: 2.5, precioFinal: 2.50, moneda: "EUR", activo: true },
  { ruleId: "rule_003", zoneId: "zone_bcn_eixample",   orbitId: "orb_restauracion",categoria: "comida",   tipoEvento: "conversion", precioBase: 0.80, multiplicadorZona: 2.0, precioFinal: 1.60, moneda: "EUR", activo: true },
  { ruleId: "rule_004", zoneId: "zone_rural_castilla", orbitId: "orb_logistica",  categoria: "operativa", tipoEvento: "sugerencia", precioBase: 0.05, multiplicadorZona: 0.6, precioFinal: 0.03, moneda: "EUR", activo: true },
  { ruleId: "rule_005", zoneId: "zone_madrid_norte",   orbitId: "orb_ia",         categoria: "ia",        tipoEvento: "conversion", precioBase: 3.00, multiplicadorZona: 1.6, precioFinal: 4.80, moneda: "EUR", activo: true },
];

// ── CAMPAÑAS PUBLICIDAD ───────────────────────────────────────────────

export const MOCK_CAMPANAS: AdCampaign[] = [
  { campaignId: "ad_001", partnerId: "par_uber",    titulo: "Uber Business Verano",    tipo: "sugerencia_patrocinada", presupuesto: 2000, gastado: 340,  fechaInicio: "2025-05-01", fechaFin: "2025-07-31", activa: false, zonas: ["zone_madrid_centro","zone_aeropuerto_mad"], orbitas: ["orb_transporte","orb_viajes"], frecuenciaMaxima: 3 },
  { campaignId: "ad_002", partnerId: "par_booking", titulo: "Hoteles Junio Booking",   tipo: "partner_destacado",      presupuesto: 1500, gastado: 0,    fechaInicio: "2025-06-01", fechaFin: "2025-06-30", activa: false, zonas: ["zone_bcn_eixample","zone_madrid_centro"],   orbitas: ["orb_viajes"],                 frecuenciaMaxima: 2 },
  { campaignId: "ad_003", partnerId: "par_glovo",   titulo: "Glovo Delivery Empresas", tipo: "recomendacion_premium",  presupuesto: 800,  gastado: 220,  fechaInicio: "2025-04-01", fechaFin: "2025-05-31", activa: false, zonas: ["zone_madrid_centro","zone_bcn_eixample"],   orbitas: ["orb_restauracion"],           frecuenciaMaxima: 5 },
];

// ── FACTURAS ───────────────────────────────────────────────────────────

export const MOCK_FACTURAS: Factura[] = [
  {
    facturaId: "fac_001",
    empresaId: "emp_001",
    numero: "GO-2025-0045",
    mes: "Mayo 2025",
    fechaEmision: "2025-05-01",
    fechaVencimiento: "2025-05-15",
    estado: "pagada",
    lineas: [
      { descripcion: "Plan GO Empresa",         cantidad: 1,    precioUnitario: 149.00, total: 149.00, tipo: "plan"       },
      { descripcion: "Órbita Comunicación",     cantidad: 1,    precioUnitario: 29.00,  total: 29.00,  tipo: "orbita"     },
      { descripcion: "Órbita RRHH",             cantidad: 1,    precioUnitario: 59.00,  total: 59.00,  tipo: "orbita"     },
      { descripcion: "Órbita Logística",        cantidad: 1,    precioUnitario: 49.00,  total: 49.00,  tipo: "orbita"     },
      { descripcion: "Órbita Mantenimiento",    cantidad: 1,    precioUnitario: 39.00,  total: 39.00,  tipo: "orbita"     },
      { descripcion: "GO adicionales (bloque)", cantidad: 1,    precioUnitario: 39.90,  total: 39.90,  tipo: "volumen"    },
      { descripcion: "Sugerencias IA (extra)",  cantidad: 200,  precioUnitario: 0.05,   total: 10.00,  tipo: "sugerencias"},
    ],
    subtotal: 374.90,
    iva: 78.73,
    total: 453.63,
    moneda: "EUR",
    metodoPago: "Tarjeta Visa ••4521",
  },
  {
    facturaId: "fac_002",
    empresaId: "emp_001",
    numero: "GO-2025-0039",
    mes: "Abril 2025",
    fechaEmision: "2025-04-01",
    fechaVencimiento: "2025-04-15",
    estado: "pagada",
    lineas: [
      { descripcion: "Plan GO Empresa",      cantidad: 1, precioUnitario: 149.00, total: 149.00, tipo: "plan"   },
      { descripcion: "Órbita Comunicación",  cantidad: 1, precioUnitario: 29.00,  total: 29.00,  tipo: "orbita" },
      { descripcion: "Órbita RRHH",          cantidad: 1, precioUnitario: 59.00,  total: 59.00,  tipo: "orbita" },
      { descripcion: "Órbita Logística",     cantidad: 1, precioUnitario: 49.00,  total: 49.00,  tipo: "orbita" },
      { descripcion: "Órbita Mantenimiento", cantidad: 1, precioUnitario: 39.00,  total: 39.00,  tipo: "orbita" },
    ],
    subtotal: 325.00,
    iva: 68.25,
    total: 393.25,
    moneda: "EUR",
    metodoPago: "Tarjeta Visa ••4521",
  },
  {
    facturaId: "fac_003",
    empresaId: "emp_001",
    numero: "GO-2025-0052",
    mes: "Junio 2025",
    fechaEmision: "2025-06-01",
    fechaVencimiento: "2025-06-15",
    estado: "pendiente",
    lineas: [
      { descripcion: "Plan GO Empresa",      cantidad: 1, precioUnitario: 149.00, total: 149.00, tipo: "plan"   },
      { descripcion: "Órbita Comunicación",  cantidad: 1, precioUnitario: 29.00,  total: 29.00,  tipo: "orbita" },
      { descripcion: "Órbita RRHH",          cantidad: 1, precioUnitario: 59.00,  total: 59.00,  tipo: "orbita" },
      { descripcion: "Órbita Logística",     cantidad: 1, precioUnitario: 49.00,  total: 49.00,  tipo: "orbita" },
      { descripcion: "Órbita Mantenimiento", cantidad: 1, precioUnitario: 39.00,  total: 39.00,  tipo: "orbita" },
      { descripcion: "Prueba Órbita IA",     cantidad: 1, precioUnitario: 0.00,   total: 0.00,   tipo: "orbita" },
    ],
    subtotal: 325.00,
    iva: 68.25,
    total: 393.25,
    moneda: "EUR",
  },
];
