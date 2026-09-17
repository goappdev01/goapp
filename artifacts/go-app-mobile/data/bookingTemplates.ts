/**
 * bookingTemplates.ts
 * Pre-seeded service templates per business type.
 * When a user picks Belleza → Peluquería, these services are auto-created
 * so GoBookingScreen opens already configured — not blank.
 *
 * Each template in a people sector (belleza, salud) also carries a `staff`
 * array used by GoProveedorReservaSheet when booking an external proveedor.
 */

export type TemplateService = {
  title: string;
  durationMinutes: number;
  customerCapacity: number;
  price?: number;
};

export type MockStaff = {
  name: string;
  emoji: string;
  services: string[]; // empty = all services of this template
};

export type BookingTemplate = {
  id: string;
  label: string;
  emoji: string;
  color: string;
  services: TemplateService[];
  staff?: MockStaff[];
};

const T = (
  id: string,
  label: string,
  emoji: string,
  color: string,
  services: TemplateService[],
  staff?: MockStaff[]
): BookingTemplate => ({ id, label, emoji, color, services, ...(staff ? { staff } : {}) });

export const BOOKING_TEMPLATES: Record<string, BookingTemplate> = {

  // ── Belleza ──────────────────────────────────────────────────────────────────
  peluqueria: T("peluqueria", "Peluquería", "💇", "#EC4899", [
    { title: "Corte de pelo", durationMinutes: 30, customerCapacity: 1, price: 18 },
    { title: "Tinte + corte", durationMinutes: 90, customerCapacity: 1, price: 55 },
    { title: "Tinte", durationMinutes: 60, customerCapacity: 1, price: 38 },
    { title: "Peinado", durationMinutes: 45, customerCapacity: 1, price: 25 },
    { title: "Lavado y marcado", durationMinutes: 30, customerCapacity: 1, price: 15 },
  ], [
    { name: "Lucía",   emoji: "💇", services: [] },
    { name: "Rosa",    emoji: "💇", services: [] },
    { name: "Antonio", emoji: "✂️", services: [] },
  ]),

  unas: T("unas", "Uñas", "💅", "#EC4899", [
    { title: "Manicura", durationMinutes: 45, customerCapacity: 1, price: 20 },
    { title: "Pedicura", durationMinutes: 60, customerCapacity: 1, price: 28 },
    { title: "Uñas acrílicas", durationMinutes: 90, customerCapacity: 1, price: 45 },
    { title: "Uñas de gel", durationMinutes: 75, customerCapacity: 1, price: 38 },
  ], [
    { name: "Carmen", emoji: "💅", services: [] },
    { name: "Elena",  emoji: "💅", services: [] },
  ]),

  masajes: T("masajes", "Masajes", "💆", "#EC4899", [
    { title: "Masaje relajante (60 min)", durationMinutes: 60, customerCapacity: 1, price: 50 },
    { title: "Masaje terapéutico", durationMinutes: 60, customerCapacity: 1, price: 60 },
    { title: "Masaje exprés (30 min)", durationMinutes: 30, customerCapacity: 1, price: 30 },
    { title: "Masaje de piedras calientes", durationMinutes: 75, customerCapacity: 1, price: 70 },
  ], [
    { name: "Diana",   emoji: "💆", services: [] },
    { name: "Roberto", emoji: "💆", services: [] },
    { name: "Sofía",   emoji: "💆", services: [] },
  ]),

  estetica: T("estetica", "Estética", "✨", "#EC4899", [
    { title: "Limpieza facial", durationMinutes: 60, customerCapacity: 1, price: 45 },
    { title: "Tratamiento antiedad", durationMinutes: 75, customerCapacity: 1, price: 70 },
    { title: "Depilación cejas", durationMinutes: 20, customerCapacity: 1, price: 12 },
    { title: "Depilación cera piernas", durationMinutes: 45, customerCapacity: 1, price: 30 },
  ], [
    { name: "Paula",  emoji: "✨", services: [] },
    { name: "Mónica", emoji: "✨", services: [] },
    { name: "Laura",  emoji: "✨", services: [] },
  ]),

  barberia: T("barberia", "Barbería", "💈", "#EC4899", [
    { title: "Corte de pelo", durationMinutes: 30, customerCapacity: 1, price: 18 },
    { title: "Afeitado clásico", durationMinutes: 30, customerCapacity: 1, price: 22 },
    { title: "Corte + arreglo barba", durationMinutes: 45, customerCapacity: 1, price: 30 },
    { title: "Arreglo de barba", durationMinutes: 20, customerCapacity: 1, price: 15 },
  ], [
    { name: "Carlos", emoji: "💈", services: [] },
    { name: "Javier", emoji: "💈", services: [] },
    { name: "Miguel", emoji: "💈", services: [] },
  ]),

  spa: T("spa", "Spa", "🧖", "#EC4899", [
    { title: "Circuito spa (2h)", durationMinutes: 120, customerCapacity: 2, price: 90 },
    { title: "Envoltura corporal", durationMinutes: 60, customerCapacity: 1, price: 65 },
    { title: "Ritual relajante", durationMinutes: 90, customerCapacity: 1, price: 85 },
    { title: "Circuito parejas", durationMinutes: 120, customerCapacity: 2, price: 160 },
  ], [
    { name: "Marina",    emoji: "🧖", services: [] },
    { name: "Alejandro", emoji: "🧖", services: [] },
    { name: "Claudia",   emoji: "🧖", services: [] },
  ]),

  maquillaje: T("maquillaje", "Maquillaje", "💄", "#EC4899", [
    { title: "Maquillaje de evento", durationMinutes: 60, customerCapacity: 1, price: 55 },
    { title: "Maquillaje de novia", durationMinutes: 90, customerCapacity: 1, price: 120 },
    { title: "Maquillaje artístico", durationMinutes: 60, customerCapacity: 1, price: 70 },
  ], [
    { name: "Valentina", emoji: "💄", services: [] },
    { name: "Natalia",   emoji: "💄", services: [] },
  ]),

  // ── Restauración ─────────────────────────────────────────────────────────────
  restaurante: T("restaurante", "Restaurante", "🍽️", "#C4883A", [
    { title: "Mesa interior (2 pax)", durationMinutes: 90, customerCapacity: 2 },
    { title: "Mesa interior (4 pax)", durationMinutes: 90, customerCapacity: 4 },
    { title: "Mesa terraza (2 pax)", durationMinutes: 90, customerCapacity: 2 },
    { title: "Mesa terraza (4 pax)", durationMinutes: 90, customerCapacity: 4 },
    { title: "Reserva privada (10+ pax)", durationMinutes: 180, customerCapacity: 12 },
  ]),
  cafeteria: T("cafeteria", "Cafetería", "☕", "#C4883A", [
    { title: "Mesa interior", durationMinutes: 60, customerCapacity: 4 },
    { title: "Mesa terraza", durationMinutes: 60, customerCapacity: 4 },
  ]),
  bar: T("bar", "Bar", "🍺", "#C4883A", [
    { title: "Mesa barra (2 pax)", durationMinutes: 60, customerCapacity: 2 },
    { title: "Mesa zona lounge", durationMinutes: 90, customerCapacity: 6 },
  ]),
  terraza: T("terraza", "Terraza", "🌿", "#C4883A", [
    { title: "Mesa terraza (2 pax)", durationMinutes: 90, customerCapacity: 2 },
    { title: "Mesa terraza (4 pax)", durationMinutes: 90, customerCapacity: 4 },
    { title: "Mesa terraza (6 pax)", durationMinutes: 90, customerCapacity: 6 },
  ]),
  comida_rapida: T("comida_rapida", "Comida rápida", "🍔", "#C4883A", [
    { title: "Mesa rápida (2 pax)", durationMinutes: 30, customerCapacity: 2 },
    { title: "Mesa rápida (4 pax)", durationMinutes: 30, customerCapacity: 4 },
  ]),
  confiteria: T("confiteria", "Confitería", "🧁", "#C4883A", [
    { title: "Mesa degustación (2 pax)", durationMinutes: 45, customerCapacity: 2 },
    { title: "Taller de repostería", durationMinutes: 120, customerCapacity: 6, price: 40 },
  ]),
  heladeria: T("heladeria", "Heladería", "🍦", "#C4883A", [
    { title: "Mesa interior", durationMinutes: 30, customerCapacity: 4 },
    { title: "Mesa exterior", durationMinutes: 30, customerCapacity: 4 },
  ]),

  // ── Salud ────────────────────────────────────────────────────────────────────
  clinica: T("clinica", "Clínica", "🏥", "#0EA5E9", [
    { title: "Consulta general", durationMinutes: 30, customerCapacity: 1, price: 40 },
    { title: "Revisión", durationMinutes: 20, customerCapacity: 1, price: 25 },
    { title: "Urgencia", durationMinutes: 45, customerCapacity: 1, price: 60 },
  ], [
    { name: "Dr. García", emoji: "🏥", services: [] },
    { name: "Dra. López", emoji: "🏥", services: [] },
    { name: "Dr. Romero", emoji: "🏥", services: [] },
  ]),

  psicologo: T("psicologo", "Psicólogo", "🧠", "#0EA5E9", [
    { title: "Sesión individual (50 min)", durationMinutes: 50, customerCapacity: 1, price: 60 },
    { title: "Sesión de pareja", durationMinutes: 60, customerCapacity: 2, price: 80 },
    { title: "Primera consulta", durationMinutes: 60, customerCapacity: 1, price: 70 },
  ], [
    { name: "Dra. Martínez",  emoji: "🧠", services: [] },
    { name: "Dr. Fernández",  emoji: "🧠", services: [] },
  ]),

  fisioterapia: T("fisioterapia", "Fisioterapia", "🤸", "#0EA5E9", [
    { title: "Sesión fisioterapia", durationMinutes: 45, customerCapacity: 1, price: 45 },
    { title: "Masaje terapéutico", durationMinutes: 30, customerCapacity: 1, price: 35 },
    { title: "Valoración inicial", durationMinutes: 60, customerCapacity: 1, price: 55 },
  ], [
    { name: "Pablo",  emoji: "🤸", services: [] },
    { name: "Isabel", emoji: "🤸", services: [] },
    { name: "Sergio", emoji: "🤸", services: [] },
  ]),

  dentista: T("dentista", "Dentista", "🦷", "#0EA5E9", [
    { title: "Revisión y limpieza", durationMinutes: 45, customerCapacity: 1, price: 60 },
    { title: "Empaste", durationMinutes: 60, customerCapacity: 1, price: 90 },
    { title: "Extracción", durationMinutes: 45, customerCapacity: 1, price: 80 },
    { title: "Ortodoncia (revisión)", durationMinutes: 30, customerCapacity: 1, price: 50 },
  ], [
    { name: "Dra. Ruiz",    emoji: "🦷", services: [] },
    { name: "Dr. Sánchez",  emoji: "🦷", services: [] },
  ]),

  medico: T("medico", "Médico", "👨‍⚕️", "#0EA5E9", [
    { title: "Consulta médica", durationMinutes: 20, customerCapacity: 1, price: 35 },
    { title: "Consulta especialista", durationMinutes: 30, customerCapacity: 1, price: 55 },
    { title: "Revisión analítica", durationMinutes: 20, customerCapacity: 1, price: 30 },
  ], [
    { name: "Dr. González", emoji: "👨‍⚕️", services: [] },
    { name: "Dra. Pérez",   emoji: "👨‍⚕️", services: [] },
    { name: "Dr. Molina",   emoji: "👨‍⚕️", services: [] },
  ]),

  nutricionista: T("nutricionista", "Nutricionista", "🥗", "#0EA5E9", [
    { title: "Primera consulta", durationMinutes: 60, customerCapacity: 1, price: 65 },
    { title: "Seguimiento mensual", durationMinutes: 30, customerCapacity: 1, price: 40 },
    { title: "Plan nutricional", durationMinutes: 45, customerCapacity: 1, price: 55 },
  ], [
    { name: "Elena",  emoji: "🥗", services: [] },
    { name: "Marcos", emoji: "🥗", services: [] },
  ]),

  optometria: T("optometria", "Optometría", "👁️", "#0EA5E9", [
    { title: "Revisión visual", durationMinutes: 30, customerCapacity: 1, price: 30 },
    { title: "Adaptación lentes de contacto", durationMinutes: 45, customerCapacity: 1, price: 45 },
  ], [
    { name: "Laura", emoji: "👁️", services: [] },
    { name: "José",  emoji: "👁️", services: [] },
  ]),

  // ── Hoteles & Alojamientos ───────────────────────────────────────────────────
  hotel: T("hotel", "Hotel", "🏨", "#7C69BE", [
    { title: "Habitación individual", durationMinutes: 1440, customerCapacity: 1, price: 80 },
    { title: "Habitación doble", durationMinutes: 1440, customerCapacity: 2, price: 120 },
    { title: "Suite", durationMinutes: 1440, customerCapacity: 2, price: 220 },
    { title: "Habitación familiar", durationMinutes: 1440, customerCapacity: 4, price: 160 },
  ]),
  apartamento: T("apartamento", "Apartamento", "🏠", "#7C69BE", [
    { title: "Apartamento estudio", durationMinutes: 1440, customerCapacity: 2, price: 90 },
    { title: "Apartamento 1 dormitorio", durationMinutes: 1440, customerCapacity: 3, price: 120 },
    { title: "Apartamento 2 dormitorios", durationMinutes: 1440, customerCapacity: 5, price: 150 },
  ]),
  casa_rural: T("casa_rural", "Casa rural", "🏡", "#7C69BE", [
    { title: "Casa completa", durationMinutes: 1440, customerCapacity: 8, price: 300 },
    { title: "Habitación privada", durationMinutes: 1440, customerCapacity: 2, price: 90 },
  ]),
  hostal: T("hostal", "Hostal", "🏯", "#7C69BE", [
    { title: "Cama en dormitorio compartido", durationMinutes: 1440, customerCapacity: 1, price: 25 },
    { title: "Habitación privada", durationMinutes: 1440, customerCapacity: 2, price: 60 },
  ]),

  // ── Servicios ────────────────────────────────────────────────────────────────
  taller: T("taller", "Taller", "🔧", "#3D9A84", [
    { title: "Revisión rápida", durationMinutes: 30, customerCapacity: 1, price: 20 },
    { title: "Reparación general", durationMinutes: 60, customerCapacity: 1 },
    { title: "Diagnóstico", durationMinutes: 45, customerCapacity: 1, price: 35 },
  ]),
  consultoria: T("consultoria", "Consultoría", "💼", "#3D9A84", [
    { title: "Reunión inicial (30 min)", durationMinutes: 30, customerCapacity: 4, price: 0 },
    { title: "Sesión de consultoría", durationMinutes: 60, customerCapacity: 4, price: 120 },
    { title: "Taller formativo", durationMinutes: 120, customerCapacity: 10, price: 200 },
  ]),
  academia: T("academia", "Academia", "📚", "#3D9A84", [
    { title: "Clase individual", durationMinutes: 60, customerCapacity: 1, price: 40 },
    { title: "Clase grupal (hasta 8)", durationMinutes: 60, customerCapacity: 8, price: 15 },
    { title: "Tutoría online", durationMinutes: 45, customerCapacity: 1, price: 35 },
  ]),
  sala_reuniones: T("sala_reuniones", "Sala reuniones", "🖥️", "#3D9A84", [
    { title: "Sala pequeña (hasta 6)", durationMinutes: 60, customerCapacity: 6, price: 25 },
    { title: "Sala grande (hasta 20)", durationMinutes: 60, customerCapacity: 20, price: 60 },
    { title: "Sala de videoconferencia", durationMinutes: 60, customerCapacity: 8, price: 40 },
  ]),
  fotografia: T("fotografia", "Fotografía", "📷", "#3D9A84", [
    { title: "Sesión retrato (1h)", durationMinutes: 60, customerCapacity: 2, price: 120 },
    { title: "Sesión producto (2h)", durationMinutes: 120, customerCapacity: 1, price: 200 },
    { title: "Sesión familiar", durationMinutes: 90, customerCapacity: 6, price: 180 },
  ]),
  coworking: T("coworking", "Coworking", "🏢", "#3D9A84", [
    { title: "Puesto flexible (día)", durationMinutes: 480, customerCapacity: 1, price: 15 },
    { title: "Sala privada (hora)", durationMinutes: 60, customerCapacity: 4, price: 20 },
    { title: "Sala privada (día)", durationMinutes: 480, customerCapacity: 4, price: 80 },
  ]),

  // ── Deportes ─────────────────────────────────────────────────────────────────
  padel: T("padel", "Pádel", "🏓", "#16A34A", [
    { title: "Pista de pádel (1h)", durationMinutes: 60, customerCapacity: 4, price: 20 },
    { title: "Pista de pádel (1.5h)", durationMinutes: 90, customerCapacity: 4, price: 28 },
  ]),
  tenis: T("tenis", "Tenis", "🎾", "#4A80BD", [
    { title: "Pista de tenis (1h)", durationMinutes: 60, customerCapacity: 4, price: 18 },
    { title: "Pista de tenis (2h)", durationMinutes: 120, customerCapacity: 4, price: 30 },
  ]),
  pickleball: T("pickleball", "Pickleball", "🏸", "#4A80BD", [
    { title: "Pista pickleball (1h)", durationMinutes: 60, customerCapacity: 4, price: 16 },
  ]),
  badminton: T("badminton", "Bádminton", "🏸", "#4A80BD", [
    { title: "Pista bádminton (1h)", durationMinutes: 60, customerCapacity: 4, price: 14 },
  ]),
  squash: T("squash", "Squash", "🟡", "#4A80BD", [
    { title: "Box de squash (45 min)", durationMinutes: 45, customerCapacity: 2, price: 12 },
  ]),
  ping_pong: T("ping_pong", "Ping Pong", "🏓", "#4A80BD", [
    { title: "Mesa ping pong (1h)", durationMinutes: 60, customerCapacity: 4, price: 10 },
  ]),
  futbol_sala: T("futbol_sala", "Fútbol sala", "⚽", "#16A34A", [
    { title: "Cancha fútbol sala (1h)", durationMinutes: 60, customerCapacity: 12, price: 50 },
  ]),
  futbol_7: T("futbol_7", "Fútbol 7", "⚽", "#16A34A", [
    { title: "Campo fútbol 7 (1h)", durationMinutes: 60, customerCapacity: 14, price: 70 },
  ]),
  futbol_11: T("futbol_11", "Fútbol 11", "⚽", "#16A34A", [
    { title: "Campo fútbol 11 (1h)", durationMinutes: 60, customerCapacity: 22, price: 100 },
  ]),
  baloncesto: T("baloncesto", "Baloncesto", "🏀", "#7C69BE", [
    { title: "Cancha baloncesto (1h)", durationMinutes: 60, customerCapacity: 10, price: 40 },
  ]),
  voleibol: T("voleibol", "Voleibol", "🏐", "#7C69BE", [
    { title: "Cancha voleibol (1h)", durationMinutes: 60, customerCapacity: 12, price: 35 },
  ]),
  atletismo: T("atletismo", "Atletismo", "🏃", "#7C69BE", [
    { title: "Pista atletismo (2h)", durationMinutes: 120, customerCapacity: 8, price: 20 },
  ]),
  polideportivo: T("polideportivo", "Cancha polideportiva", "🏟️", "#7C69BE", [
    { title: "Sala polideportiva (1h)", durationMinutes: 60, customerCapacity: 20, price: 60 },
    { title: "Sala polideportiva (2h)", durationMinutes: 120, customerCapacity: 20, price: 100 },
  ]),
  gimnasio: T("gimnasio", "Gimnasio", "🏋️", "#F97316", [
    { title: "Sesión musculación", durationMinutes: 60, customerCapacity: 1, price: 10 },
    { title: "Clase dirigida", durationMinutes: 45, customerCapacity: 15, price: 8 },
    { title: "Entrenamiento personal", durationMinutes: 60, customerCapacity: 1, price: 40 },
  ], [
    { name: "Sergio", emoji: "🏋️", services: ["Entrenamiento personal"] },
    { name: "Ana",    emoji: "🏋️", services: ["Entrenamiento personal", "Clase dirigida"] },
  ]),
  crossfit: T("crossfit", "Crossfit", "🔥", "#F97316", [
    { title: "WOD grupal", durationMinutes: 60, customerCapacity: 12, price: 12 },
    { title: "Open box", durationMinutes: 90, customerCapacity: 8, price: 10 },
  ], [
    { name: "Álvaro",  emoji: "🔥", services: [] },
    { name: "Natalia", emoji: "🔥", services: [] },
  ]),
  yoga: T("yoga", "Yoga", "🧘", "#F97316", [
    { title: "Clase de yoga (1h)", durationMinutes: 60, customerCapacity: 12, price: 12 },
    { title: "Yoga individual", durationMinutes: 60, customerCapacity: 1, price: 40 },
  ], [
    { name: "María",  emoji: "🧘", services: [] },
    { name: "Carlos", emoji: "🧘", services: [] },
  ]),
  pilates: T("pilates", "Pilates", "🤸", "#F97316", [
    { title: "Clase de pilates", durationMinutes: 50, customerCapacity: 8, price: 15 },
    { title: "Pilates individual", durationMinutes: 55, customerCapacity: 1, price: 50 },
  ], [
    { name: "Elena", emoji: "🤸", services: [] },
    { name: "Sofía", emoji: "🤸", services: [] },
  ]),
  ciclismo: T("ciclismo", "Ciclismo indoor", "🚴", "#F97316", [
    { title: "Clase spinning (45 min)", durationMinutes: 45, customerCapacity: 16, price: 10 },
  ]),
  pt: T("pt", "Entrenamiento personal", "🎯", "#F97316", [
    { title: "Sesión PT (1h)", durationMinutes: 60, customerCapacity: 1, price: 45 },
    { title: "Pack 5 sesiones PT", durationMinutes: 60, customerCapacity: 1, price: 200 },
  ], [
    { name: "Sergio", emoji: "🎯", services: [] },
    { name: "Ana",    emoji: "🎯", services: [] },
    { name: "Pablo",  emoji: "🎯", services: [] },
  ]),
  sala_fitness: T("sala_fitness", "Sala fitness", "🏃", "#F97316", [
    { title: "Acceso sala fitness", durationMinutes: 90, customerCapacity: 1, price: 8 },
  ]),
  funcional: T("funcional", "Func. Training", "⚡", "#F97316", [
    { title: "Sesión funcional grupal", durationMinutes: 50, customerCapacity: 10, price: 12 },
  ]),
  natacion: T("natacion", "Natación", "🏊", "#0EA5E9", [
    { title: "Carril libre (1h)", durationMinutes: 60, customerCapacity: 1, price: 8 },
    { title: "Clase natación adultos", durationMinutes: 45, customerCapacity: 8, price: 15 },
    { title: "Clase natación niños", durationMinutes: 30, customerCapacity: 6, price: 12 },
  ]),
  surf_indoor: T("surf_indoor", "Surf indoor", "🏄", "#0EA5E9", [
    { title: "Sesión surf indoor (30 min)", durationMinutes: 30, customerCapacity: 1, price: 35 },
  ]),
  rocodomo: T("rocodomo", "Rocódromo", "🧗", "#0EA5E9", [
    { title: "Sesión escalada libre", durationMinutes: 120, customerCapacity: 1, price: 12 },
    { title: "Clase iniciación", durationMinutes: 90, customerCapacity: 6, price: 20 },
  ]),
  escalada: T("escalada", "Escalada", "⛰️", "#0EA5E9", [
    { title: "Sesión escalada", durationMinutes: 120, customerCapacity: 2, price: 15 },
  ]),
  skatepark: T("skatepark", "Skatepark", "🛹", "#0EA5E9", [
    { title: "Sesión skate libre (2h)", durationMinutes: 120, customerCapacity: 1, price: 8 },
  ]),
  patinaje: T("patinaje", "Patinaje", "⛸️", "#0EA5E9", [
    { title: "Sesión patinaje (1h)", durationMinutes: 60, customerCapacity: 1, price: 10 },
    { title: "Clase patinaje", durationMinutes: 45, customerCapacity: 8, price: 14 },
  ]),
  boxeo: T("boxeo", "Boxeo", "🥊", "#0EA5E9", [
    { title: "Clase boxeo grupal", durationMinutes: 60, customerCapacity: 10, price: 12 },
    { title: "Sparring individual", durationMinutes: 60, customerCapacity: 2, price: 30 },
  ]),
  artes_marciales: T("artes_marciales", "Artes marciales", "🥋", "#0EA5E9", [
    { title: "Clase artes marciales", durationMinutes: 60, customerCapacity: 12, price: 10 },
  ]),
  golf: T("golf", "Golf", "⛳", "#C4883A", [
    { title: "Hoyo (18h, individual)", durationMinutes: 240, customerCapacity: 1, price: 60 },
    { title: "Driving range (1h)", durationMinutes: 60, customerCapacity: 1, price: 20 },
  ]),
  billar: T("billar", "Billar", "🎱", "#C4883A", [
    { title: "Mesa billar (1h)", durationMinutes: 60, customerCapacity: 4, price: 12 },
  ]),
  dardos: T("dardos", "Dardos", "🎯", "#C4883A", [
    { title: "Diana (1h)", durationMinutes: 60, customerCapacity: 2, price: 8 },
  ]),
  sala_multiuso: T("sala_multiuso", "Sala multiuso", "🏢", "#C4883A", [
    { title: "Sala multiuso (2h)", durationMinutes: 120, customerCapacity: 20, price: 50 },
    { title: "Sala multiuso (4h)", durationMinutes: 240, customerCapacity: 20, price: 90 },
  ]),

  // ── Fallback ─────────────────────────────────────────────────────────────────
  personalizado: T("personalizado", "Personalizado", "➕", "#6B7280", []),
  deportes_custom: T("deportes_custom", "Deporte personalizado", "➕", "#16A34A", []),
};
