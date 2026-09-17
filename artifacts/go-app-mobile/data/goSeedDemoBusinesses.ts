/**
 * goSeedDemoBusinesses.ts
 * ═══════════════════════════════════════════════════════════════════════════
 * Demo businesses for every major booking category.
 * Ensures all orbital-reservas routes return results from the first launch.
 *
 * Categories seeded:
 *   Deportes     → padel, tenis
 *   Restauración → restaurante, cafeteria
 *   Salud        → fisioterapia, psicologo  (+ staff)
 *   Actividades  → escape_room, karting
 *   Servicios    → academia, coworking
 *   Hogar        → fontanero, electricista  (+ staff)
 *   Hoteles      → hotel, apartamento
 *   Otros        → personalizado
 *
 * Idempotent: guarded by a single AsyncStorage flag.
 * Fixed IDs (prefix "demo_biz_") so checks and purges are reliable.
 * ═══════════════════════════════════════════════════════════════════════════
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Business, BookableItem, AvailabilityWindow, Staff } from "./booking";

// ── Storage keys ─────────────────────────────────────────────────────────────

const KEY_BIZ      = "go_businesses_v1";
const KEY_ITEMS    = "go_bookable_items_v1";
const KEY_WINDOWS  = "go_availability_windows_v1";
const KEY_STAFF    = "go_staff_v1";
const SEED_FLAG    = "go_demo_businesses_seeded_v3";

// ── Helper: read / merge / write a storage list ───────────────────────────────

async function mergeIntoList<T extends { id: string }>(
  key: string,
  newItems: T[],
): Promise<void> {
  const raw = await AsyncStorage.getItem(key);
  const existing: T[] = raw ? JSON.parse(raw) : [];
  const existingIds = new Set(existing.map((x) => x.id));
  const toAdd = newItems.filter((x) => !existingIds.has(x.id));
  if (toAdd.length === 0) return;
  await AsyncStorage.setItem(key, JSON.stringify([...existing, ...toAdd]));
}

// ── Availability window factory ───────────────────────────────────────────────
// weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

function win(
  id: string,
  businessId: string,
  weekday: number,
  startH: number,
  endH: number,
): AvailabilityWindow {
  return {
    id,
    businessId,
    weekday,
    visibleStartHour: startH,
    visibleEndHour: endH,
    active: true,
  };
}

/** Mon–Fri 09:00–20:00 + Sat 09:00–14:00 */
function weekWindows(bizId: string, prefix: string): AvailabilityWindow[] {
  const days = [
    { d: 1, sh: 9, eh: 20 },
    { d: 2, sh: 9, eh: 20 },
    { d: 3, sh: 9, eh: 20 },
    { d: 4, sh: 9, eh: 20 },
    { d: 5, sh: 9, eh: 20 },
    { d: 6, sh: 9, eh: 14 },
  ];
  return days.map(({ d, sh, eh }) =>
    win(`${prefix}_w${d}`, bizId, d, sh, eh)
  );
}

/** Tue–Sun: midday shift 13–16 + evening 20–23 (restaurants) */
function restaurantWindows(bizId: string, prefix: string): AvailabilityWindow[] {
  const tueSun = [2, 3, 4, 5, 6, 0]; // Tue Wed Thu Fri Sat Sun
  const result: AvailabilityWindow[] = [];
  tueSun.forEach((d) => {
    result.push(win(`${prefix}_lunch_w${d}`,   bizId, d, 13, 16));
    result.push(win(`${prefix}_dinner_w${d}`,  bizId, d, 20, 23));
  });
  return result;
}

// ── Staff factory ─────────────────────────────────────────────────────────────

function makeStaff(id: string, businessId: string, name: string, emoji: string): Staff {
  return { id, businessId, name, emoji, active: true };
}

// ── Bookable item factory ─────────────────────────────────────────────────────

function item(
  id: string,
  businessId: string,
  title: string,
  durationMinutes: number,
  price: number,
  unitQuantity = 1,
): BookableItem {
  return {
    id,
    businessId,
    title,
    type: "servicio",
    durationMinutes,
    customerCapacity: 1,
    unitQuantity,
    price,
    paymentRequired: false,
    active: true,
    visible: true,
  };
}

// ── Business factory ──────────────────────────────────────────────────────────

function biz(
  id: string,
  name: string,
  category: string,
  location: string,
  phone: string,
  bookingColor: string,
): Business {
  return {
    id,
    name,
    category,
    location,
    phone,
    bookingActive: true,
    bookingColor,
    timezone: "Europe/Madrid",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEMO DATA — one or two businesses per major category
// ═══════════════════════════════════════════════════════════════════════════════

const DEMO_BUSINESSES: Business[] = [
  // ── DEPORTES ──────────────────────────────────────────────────────────────
  biz("demo_biz_padel_norte",  "Club Pádel Norte",   "padel",  "Av. Deporte 12, 28010 Madrid",    "600 100 200", "#15803d"),
  biz("demo_biz_padel_oeste",  "Pádel Oeste Club",   "padel",  "Calle Raqueta 4, 28020 Madrid",   "611 200 300", "#15803d"),
  biz("demo_biz_tenis",        "Club de Tenis Sol",  "tenis",  "Paseo del Tenis 1, 28040 Madrid", "622 300 400", "#16a34a"),
  biz("demo_biz_futbol",       "Fútbol Sala Arena",  "futbol", "Calle Campo 8, 28030 Madrid",     "633 400 500", "#22c55e"),
  biz("demo_biz_natacion",     "Piscina Municipal",  "natacion","Av. Piscina 3, 28005 Madrid",    "644 500 600", "#16a34a"),
  biz("demo_biz_gimnasio",     "Gym GO Fitness",     "gimnasio","Calle Gym 20, 28015 Madrid",     "655 600 700", "#15803d"),

  // ── RESTAURACIÓN ──────────────────────────────────────────────────────────
  biz("demo_biz_restaurante_1","La Terraza del Centro","restaurante","Gran Vía 45, 28013 Madrid", "666 700 800", "#f97316"),
  biz("demo_biz_restaurante_2","Restaurante El Patio",  "restaurante","Calle Mayor 7, 28012 Madrid","677 800 900","#f97316"),
  biz("demo_biz_cafeteria",    "Café & Brunch Go",   "cafeteria","Calle Velázquez 12, 28001 Madrid","688 900 000","#fb923c"),
  biz("demo_biz_bar",          "Bar Los Amigos",     "bar",      "Calle Huertas 30, 28012 Madrid", "699 100 200","#ea580c"),
  biz("demo_biz_terraza",      "Terraza Sky Lounge",  "terraza",  "Paseo Castellana 100, 28046 Madrid","700 200 300","#f97316"),

  // ── SALUD ─────────────────────────────────────────────────────────────────
  biz("demo_biz_fisio_1",      "Fisio Madrid Clinic","fisioterapia","Calle Salud 8, 28010 Madrid", "710 300 400", "#1e40af"),
  biz("demo_biz_fisio_2",      "PhysioPlus Center",  "fisioterapia","Av. Medicina 5, 28020 Madrid", "720 400 500","#1d4ed8"),
  biz("demo_biz_psicologo",    "Psicólogo Dr. García","psicologo","Calle Bienestar 3, 28015 Madrid","730 500 600","#2563eb"),
  biz("demo_biz_dentista",     "Clínica Dental GO",  "dentista",  "Calle Diente 11, 28001 Madrid",  "740 600 700","#1e40af"),
  biz("demo_biz_nutricion",    "Nutrición & Vida",   "nutricionista","Calle Verde 7, 28004 Madrid", "750 700 800","#1e40af"),

  // ── ACTIVIDADES ───────────────────────────────────────────────────────────
  biz("demo_biz_escape_1",     "Escape World Madrid","escape_room","Calle Misterio 5, 28004 Madrid","760 800 900","#c026d3"),
  biz("demo_biz_escape_2",     "Lock & Keys Escape", "escape_room","Gran Vía 60, 28013 Madrid",     "770 900 100","#a21caf"),
  biz("demo_biz_karting",      "Karting City",       "karting",   "Av. Velocidad 1, 28050 Madrid",  "780 100 200","#c026d3"),
  biz("demo_biz_laser",        "Laser Tag Arena",    "laser_tag", "Calle Disparo 3, 28033 Madrid",  "790 200 300","#86198f"),
  biz("demo_biz_cine",         "Cine GO Premium",    "cine",      "Calle Cinema 20, 28007 Madrid",  "800 300 400","#c026d3"),

  // ── SERVICIOS ─────────────────────────────────────────────────────────────
  biz("demo_biz_academia",     "Academia GO",        "academia",  "Calle Estudio 14, 28010 Madrid", "810 400 500","#78350f"),
  biz("demo_biz_academia_2",   "Idiomas Express",    "academia",  "Calle Lengua 2, 28004 Madrid",   "820 500 600","#92400e"),
  biz("demo_biz_coworking",    "Cowork Hub Madrid",  "coworking", "Paseo Empresa 9, 28046 Madrid",  "830 600 700","#78350f"),
  biz("demo_biz_foto",         "Estudio Fotografía","fotografia", "Calle Imagen 5, 28014 Madrid",   "840 700 800","#92400e"),
  biz("demo_biz_consultoria",  "Consultoría Pro",    "consultoria","Av. Empresa 30, 28046 Madrid",   "850 800 900","#78350f"),

  // ── HOGAR ─────────────────────────────────────────────────────────────────
  biz("demo_biz_fontanero",    "Fontanería 24h",     "fontanero",    "Calle Agua 7, 28020 Madrid",  "860 900 100","#d97706"),
  biz("demo_biz_fontanero_2",  "Plomería Express",   "fontanero",    "Av. Tubería 3, 28030 Madrid", "870 100 200","#b45309"),
  biz("demo_biz_electrico",    "Electricidad Rápida","electricista","Calle Luz 12, 28010 Madrid",   "880 200 300","#d97706"),
  biz("demo_biz_limpieza",     "Limpieza GO",        "limpieza",     "Calle Limpia 4, 28007 Madrid","890 300 400","#b45309"),
  biz("demo_biz_reformas",     "Reformas Integrales","reformas",     "Av. Obra 15, 28050 Madrid",   "900 400 500","#d97706"),

  // ── HOTELES & ALOJAMIENTOS ───────────────────────────────────────────────
  biz("demo_biz_hotel_1",      "Hotel GO Madrid",    "hotel",      "Gran Vía 30, 28013 Madrid",    "910 500 600","#7c3aed"),
  biz("demo_biz_hotel_2",      "Hotel Boutique Sol", "hotel",      "Puerta del Sol 4, 28012 Madrid","920 600 700","#6d28d9"),
  biz("demo_biz_apart",        "Apartamentos Centro","apartamento", "Calle Alojamiento 8, 28001 Madrid","930 700 800","#7c3aed"),
  biz("demo_biz_rural",        "Casa Rural La Paz",  "casa_rural", "Camino Rural 1, 28600 Navalcarnero","940 800 900","#6d28d9"),

  // ── OTROS ─────────────────────────────────────────────────────────────────
  biz("demo_biz_otros",        "Reserva Personalizada","personalizado","Tu dirección, Madrid",      "950 900 100","#6B7280"),
];

// ── BookableItems ─────────────────────────────────────────────────────────────

const DEMO_ITEMS: BookableItem[] = [
  // Pádel Norte
  item("demo_item_padel_norte_1", "demo_biz_padel_norte", "Pista 1h",        60, 18, 4),
  item("demo_item_padel_norte_2", "demo_biz_padel_norte", "Pista 1.5h",      90, 25, 4),
  item("demo_item_padel_norte_3", "demo_biz_padel_norte", "Clase individual", 60, 35, 1),
  // Pádel Oeste
  item("demo_item_padel_oeste_1", "demo_biz_padel_oeste", "Pista 1h",        60, 16, 3),
  item("demo_item_padel_oeste_2", "demo_biz_padel_oeste", "Pista 2h",       120, 28, 3),
  item("demo_item_padel_oeste_3", "demo_biz_padel_oeste", "Clase grupo",     60, 20, 1),
  // Tenis
  item("demo_item_tenis_1", "demo_biz_tenis", "Pista 1h",         60, 15, 6),
  item("demo_item_tenis_2", "demo_biz_tenis", "Pista 2h",        120, 25, 6),
  item("demo_item_tenis_3", "demo_biz_tenis", "Clase individual", 60, 40, 1),
  // Fútbol Sala
  item("demo_item_futbol_1", "demo_biz_futbol", "Campo 1h",  60, 40, 3),
  item("demo_item_futbol_2", "demo_biz_futbol", "Campo 1.5h",90, 55, 3),
  item("demo_item_futbol_3", "demo_biz_futbol", "Campo 2h", 120, 70, 3),
  // Natación
  item("demo_item_natacion_1", "demo_biz_natacion", "Carril 1h",     60, 8, 8),
  item("demo_item_natacion_2", "demo_biz_natacion", "Clase adultos", 45,15, 1),
  item("demo_item_natacion_3", "demo_biz_natacion", "Aquagym 45min", 45,10, 1),
  // Gimnasio
  item("demo_item_gym_1", "demo_biz_gimnasio", "Clase yoga 1h",      60, 12, 1),
  item("demo_item_gym_2", "demo_biz_gimnasio", "Clase spinning 45m", 45, 10, 1),
  item("demo_item_gym_3", "demo_biz_gimnasio", "Entrenamiento pers.",60, 45, 1),

  // Restaurante 1
  item("demo_item_rest1_1", "demo_biz_restaurante_1", "Comida",       90, 0, 20),
  item("demo_item_rest1_2", "demo_biz_restaurante_1", "Cena",        120, 0, 20),
  item("demo_item_rest1_3", "demo_biz_restaurante_1", "Menú grupo",  120, 0,  5),
  // Restaurante 2
  item("demo_item_rest2_1", "demo_biz_restaurante_2", "Comida",       90, 0, 15),
  item("demo_item_rest2_2", "demo_biz_restaurante_2", "Cena",        120, 0, 15),
  item("demo_item_rest2_3", "demo_biz_restaurante_2", "Brunch",       60, 0, 10),
  // Cafetería
  item("demo_item_cafe_1", "demo_biz_cafeteria", "Desayuno",  30, 0, 12),
  item("demo_item_cafe_2", "demo_biz_cafeteria", "Brunch",    60, 0, 12),
  item("demo_item_cafe_3", "demo_biz_cafeteria", "Merienda",  30, 0, 12),
  // Bar
  item("demo_item_bar_1", "demo_biz_bar", "Mesa interior", 120, 0, 10),
  item("demo_item_bar_2", "demo_biz_bar", "Mesa terraza",  120, 0,  8),
  item("demo_item_bar_3", "demo_biz_bar", "Reserva privada",180, 0, 2),
  // Terraza
  item("demo_item_terraza_1", "demo_biz_terraza", "Mesa exterior",  120, 0, 15),
  item("demo_item_terraza_2", "demo_biz_terraza", "Mesa VIP",       120, 0,  4),
  item("demo_item_terraza_3", "demo_biz_terraza", "Evento privado", 240, 0,  1),

  // Fisio 1
  item("demo_item_fisio1_1", "demo_biz_fisio_1", "Sesión 60 min",       60, 50, 1),
  item("demo_item_fisio1_2", "demo_biz_fisio_1", "Sesión 30 min",       30, 30, 1),
  item("demo_item_fisio1_3", "demo_biz_fisio_1", "Drenaje linfático",   60, 55, 1),
  // Fisio 2
  item("demo_item_fisio2_1", "demo_biz_fisio_2", "Sesión 60 min",       60, 50, 1),
  item("demo_item_fisio2_2", "demo_biz_fisio_2", "Sesión 30 min",       30, 30, 1),
  item("demo_item_fisio2_3", "demo_biz_fisio_2", "Taping deportivo",    30, 25, 1),
  // Psicólogo
  item("demo_item_psico_1", "demo_biz_psicologo", "Sesión individual",  60, 70, 1),
  item("demo_item_psico_2", "demo_biz_psicologo", "Sesión de pareja",   90, 90, 1),
  item("demo_item_psico_3", "demo_biz_psicologo", "Primera consulta",   60, 60, 1),
  // Dentista
  item("demo_item_dentista_1", "demo_biz_dentista", "Revisión",         30, 50, 1),
  item("demo_item_dentista_2", "demo_biz_dentista", "Limpieza",         45, 60, 1),
  item("demo_item_dentista_3", "demo_biz_dentista", "Blanqueamiento",   60, 150,1),
  // Nutrición
  item("demo_item_nutri_1", "demo_biz_nutricion", "Primera consulta",   60, 70, 1),
  item("demo_item_nutri_2", "demo_biz_nutricion", "Seguimiento",        30, 45, 1),
  item("demo_item_nutri_3", "demo_biz_nutricion", "Plan nutricional",   60, 80, 1),

  // Escape 1
  item("demo_item_escape1_1", "demo_biz_escape_1", "Sala 60 min",        60,  20, 3),
  item("demo_item_escape1_2", "demo_biz_escape_1", "Sala 90 min",        90,  25, 3),
  item("demo_item_escape1_3", "demo_biz_escape_1", "Sala privada grupo", 60, 100, 1),
  // Escape 2
  item("demo_item_escape2_1", "demo_biz_escape_2", "Sala 60 min",        60,  22, 4),
  item("demo_item_escape2_2", "demo_biz_escape_2", "Sala VIP 90 min",    90,  30, 2),
  item("demo_item_escape2_3", "demo_biz_escape_2", "Aventura 2h",       120,  40, 2),
  // Karting
  item("demo_item_kart_1", "demo_biz_karting", "Sesión 10 min",   10, 12, 10),
  item("demo_item_kart_2", "demo_biz_karting", "Sesión 20 min",   20, 20, 10),
  item("demo_item_kart_3", "demo_biz_karting", "Karting + foto",  20, 25, 10),
  // Laser Tag
  item("demo_item_laser_1", "demo_biz_laser", "Sesión individual",  20, 10, 20),
  item("demo_item_laser_2", "demo_biz_laser", "Sesión grupo (6)",   20, 50,  4),
  item("demo_item_laser_3", "demo_biz_laser", "Bono 3 sesiones",    60, 25, 10),
  // Cine
  item("demo_item_cine_1", "demo_biz_cine", "Sesión estándar", 120,  9, 30),
  item("demo_item_cine_2", "demo_biz_cine", "Sesión VIP",      120, 15,  8),
  item("demo_item_cine_3", "demo_biz_cine", "Sala privada",    120, 80,  1),

  // Academia 1
  item("demo_item_acad1_1", "demo_biz_academia",   "Clase individual", 60, 40, 1),
  item("demo_item_acad1_2", "demo_biz_academia",   "Clase grupo",      60, 20, 8),
  item("demo_item_acad1_3", "demo_biz_academia",   "Intensivo",       120, 70, 1),
  // Academia 2
  item("demo_item_acad2_1", "demo_biz_academia_2", "Clase inglés",     60, 35, 1),
  item("demo_item_acad2_2", "demo_biz_academia_2", "Clase francés",    60, 35, 1),
  item("demo_item_acad2_3", "demo_biz_academia_2", "Clase grupo",      60, 18, 6),
  // Coworking
  item("demo_item_cow_1", "demo_biz_coworking", "Puesto día",     480, 25, 20),
  item("demo_item_cow_2", "demo_biz_coworking", "Sala reunión 1h",  60, 20,  4),
  item("demo_item_cow_3", "demo_biz_coworking", "Sala reunión 2h", 120, 35,  4),
  // Fotografía
  item("demo_item_foto_1", "demo_biz_foto", "Sesión retrato",   60,  80, 1),
  item("demo_item_foto_2", "demo_biz_foto", "Sesión producto", 120, 150, 1),
  item("demo_item_foto_3", "demo_biz_foto", "Reportaje evento",180, 300, 1),
  // Consultoría
  item("demo_item_consul_1", "demo_biz_consultoria", "Consulta inicial", 60, 100, 1),
  item("demo_item_consul_2", "demo_biz_consultoria", "Sesión estrategia",90, 150, 1),
  item("demo_item_consul_3", "demo_biz_consultoria", "Mentoría",         60,  80, 1),

  // Fontanero 1
  item("demo_item_font1_1", "demo_biz_fontanero",   "Visita diagnóstico",  60,  50, 1),
  item("demo_item_font1_2", "demo_biz_fontanero",   "Reparación urgente", 120, 120, 1),
  item("demo_item_font1_3", "demo_biz_fontanero",   "Instalación",        180, 150, 1),
  // Fontanero 2
  item("demo_item_font2_1", "demo_biz_fontanero_2", "Visita diagnóstico",  60,  50, 1),
  item("demo_item_font2_2", "demo_biz_fontanero_2", "Reparación",         120, 100, 1),
  item("demo_item_font2_3", "demo_biz_fontanero_2", "Presupuesto",         60,   0, 1),
  // Electricista
  item("demo_item_elec_1", "demo_biz_electrico", "Visita diagnóstico",  60,  50, 1),
  item("demo_item_elec_2", "demo_biz_electrico", "Reparación",         120, 100, 1),
  item("demo_item_elec_3", "demo_biz_electrico", "Instalación",        180, 140, 1),
  // Limpieza
  item("demo_item_limp_1", "demo_biz_limpieza", "Limpieza hogar",    120,  60, 1),
  item("demo_item_limp_2", "demo_biz_limpieza", "Limpieza oficina",  120,  80, 1),
  item("demo_item_limp_3", "demo_biz_limpieza", "Limpieza a fondo",  240, 120, 1),
  // Reformas
  item("demo_item_reform_1", "demo_biz_reformas", "Visita presupuesto", 60,    0, 1),
  item("demo_item_reform_2", "demo_biz_reformas", "Reforma baño",     4800, 2500, 1),
  item("demo_item_reform_3", "demo_biz_reformas", "Reforma cocina",   4800, 3000, 1),

  // Hotel 1
  item("demo_item_hotel1_1", "demo_biz_hotel_1", "Hab. individual",  1440,  80, 20),
  item("demo_item_hotel1_2", "demo_biz_hotel_1", "Hab. doble",       1440, 110, 30),
  item("demo_item_hotel1_3", "demo_biz_hotel_1", "Suite",            1440, 200,  5),
  // Hotel 2
  item("demo_item_hotel2_1", "demo_biz_hotel_2", "Hab. individual",  1440,  90, 15),
  item("demo_item_hotel2_2", "demo_biz_hotel_2", "Hab. doble",       1440, 130, 20),
  item("demo_item_hotel2_3", "demo_biz_hotel_2", "Suite junior",     1440, 180,  3),
  // Apartamento
  item("demo_item_apart_1", "demo_biz_apart", "Estudio 1 noche",  1440,  75, 5),
  item("demo_item_apart_2", "demo_biz_apart", "1 dormitorio",     1440,  95, 5),
  item("demo_item_apart_3", "demo_biz_apart", "Fin de semana",    4320, 220, 5),
  // Casa Rural
  item("demo_item_rural_1", "demo_biz_rural", "Hab. doble",      1440,  65, 5),
  item("demo_item_rural_2", "demo_biz_rural", "Casa completa",   1440, 200, 1),
  item("demo_item_rural_3", "demo_biz_rural", "Fin de semana",   4320, 380, 1),

  // Otros
  item("demo_item_otros_1", "demo_biz_otros", "Reserva 30 min", 30, 0, 1),
  item("demo_item_otros_2", "demo_biz_otros", "Reserva 1h",     60, 0, 1),
  item("demo_item_otros_3", "demo_biz_otros", "Sesión",         90, 0, 1),
];

// ── Availability windows ──────────────────────────────────────────────────────

const DEMO_WINDOWS: AvailabilityWindow[] = [
  // Deportes (Mon–Sat 09:00–21:00)
  ...["demo_biz_padel_norte","demo_biz_padel_oeste","demo_biz_tenis","demo_biz_futbol"].flatMap((id) =>
    [1,2,3,4,5].map((d) => win(`${id}_w${d}`, id, d, 9, 21)).concat([win(`${id}_w6`, id, 6, 9, 16)])
  ),
  // Natación & Gimnasio
  ...["demo_biz_natacion","demo_biz_gimnasio"].flatMap((id) =>
    [1,2,3,4,5].map((d) => win(`${id}_w${d}`, id, d, 9, 20)).concat([win(`${id}_w6`, id, 6, 9, 14)])
  ),

  // Restauración: lunch + dinner Tue–Sun
  ...restaurantWindows("demo_biz_restaurante_1","demo_biz_restaurante_1"),
  ...restaurantWindows("demo_biz_restaurante_2","demo_biz_restaurante_2"),
  // Cafetería Mon–Sat 07–20
  ...[1,2,3,4,5,6].map((d) => win(`demo_biz_cafeteria_w${d}`, "demo_biz_cafeteria", d, 7, 20)),
  // Bar & Terraza: afternoon + evening
  ...[2,3,4,5,6,0].flatMap((d) => [
    win(`demo_biz_bar_pm_w${d}`,     "demo_biz_bar",     d, 13, 16),
    win(`demo_biz_bar_eve_w${d}`,    "demo_biz_bar",     d, 19, 23),
  ]),
  ...[2,3,4,5,6,0].flatMap((d) => [
    win(`demo_biz_terraza_pm_w${d}`,  "demo_biz_terraza", d, 13, 16),
    win(`demo_biz_terraza_eve_w${d}`, "demo_biz_terraza", d, 19, 23),
  ]),

  // Salud Mon–Fri 09–20
  ...["demo_biz_fisio_1","demo_biz_fisio_2","demo_biz_psicologo","demo_biz_dentista","demo_biz_nutricion"].flatMap((id) =>
    weekWindows(id, id)
  ),

  // Actividades Tue–Sun 10–22
  ...["demo_biz_escape_1","demo_biz_escape_2","demo_biz_karting","demo_biz_laser"].flatMap((id) =>
    [2,3,4,5,6,0].map((d) => win(`${id}_w${d}`, id, d, 10, 22))
  ),
  // Cine Tue–Sun 15–23
  ...[2,3,4,5,6,0].map((d) => win(`demo_biz_cine_w${d}`, "demo_biz_cine", d, 15, 23)),

  // Servicios Mon–Sat 09–20
  ...["demo_biz_academia","demo_biz_academia_2","demo_biz_coworking","demo_biz_foto","demo_biz_consultoria"].flatMap((id) =>
    weekWindows(id, id)
  ),

  // Hogar Mon–Sat 08–20
  ...["demo_biz_fontanero","demo_biz_fontanero_2","demo_biz_electrico","demo_biz_limpieza","demo_biz_reformas"].flatMap((id) =>
    [1,2,3,4,5].map((d) => win(`${id}_w${d}`, id, d, 8, 20)).concat([win(`${id}_w6`, id, 6, 9, 14)])
  ),

  // Hoteles & Alojamientos: 24/7 check-in window 14–21
  ...["demo_biz_hotel_1","demo_biz_hotel_2","demo_biz_apart","demo_biz_rural"].flatMap((id) =>
    [0,1,2,3,4,5,6].map((d) => win(`${id}_w${d}`, id, d, 14, 21))
  ),

  // Otros Mon–Fri 09–18
  ...[1,2,3,4,5].map((d) => win(`demo_biz_otros_w${d}`, "demo_biz_otros", d, 9, 18)),
];

// ── Staff: only for people-sector businesses (Salud + some Servicios) ─────────

const DEMO_STAFF: Staff[] = [
  // Fisio 1
  makeStaff("demo_staff_fisio1_laura",  "demo_biz_fisio_1",  "Laura García",    "🤸"),
  makeStaff("demo_staff_fisio1_carlos", "demo_biz_fisio_1",  "Carlos Ruiz",     "🏋️"),
  // Fisio 2
  makeStaff("demo_staff_fisio2_ana",    "demo_biz_fisio_2",  "Ana Martínez",    "🤸"),
  makeStaff("demo_staff_fisio2_pedro",  "demo_biz_fisio_2",  "Pedro Sánchez",   "🏋️"),
  // Psicólogo
  makeStaff("demo_staff_psico_garcia",  "demo_biz_psicologo","Dr. García",      "🧠"),
  // Dentista
  makeStaff("demo_staff_dent_1",        "demo_biz_dentista", "Dra. López",      "🦷"),
  makeStaff("demo_staff_dent_2",        "demo_biz_dentista", "Dr. Fernández",   "🦷"),
  // Nutrición
  makeStaff("demo_staff_nutri_1",       "demo_biz_nutricion","Elena Ramos",     "🥗"),
  // Hogar — staff assigned to jobs
  makeStaff("demo_staff_font1_jose",    "demo_biz_fontanero","José Fontanero",  "🔧"),
  makeStaff("demo_staff_font1_miguel",  "demo_biz_fontanero","Miguel Roca",     "🔧"),
  makeStaff("demo_staff_font2_pedro",   "demo_biz_fontanero_2","Pedro Obras",   "🔧"),
  makeStaff("demo_staff_elec_1",        "demo_biz_electrico","Luis Electricista","⚡"),
  makeStaff("demo_staff_elec_2",        "demo_biz_electrico","Raúl Currents",   "⚡"),
  // Servicios (consultores, fotógrafos)
  makeStaff("demo_staff_foto_1",        "demo_biz_foto",     "Sara Fotógrafa",  "📷"),
  makeStaff("demo_staff_consul_1",      "demo_biz_consultoria","Marc Consultor", "💼"),
  makeStaff("demo_staff_consul_2",      "demo_biz_consultoria","Paula Estratega","💼"),
];

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Seeds demo businesses for all major booking categories.
 * Idempotent: runs once per install via a storage flag.
 * Safe to call on every app boot — returns early if already seeded.
 */
export async function seedDemoBusinessesIfNeeded(): Promise<void> {
  try {
    const flag = await AsyncStorage.getItem(SEED_FLAG);
    if (flag) return;

    await mergeIntoList<Business>(KEY_BIZ, DEMO_BUSINESSES);
    await mergeIntoList<BookableItem>(KEY_ITEMS, DEMO_ITEMS);
    await mergeIntoList<AvailabilityWindow>(KEY_WINDOWS, DEMO_WINDOWS);
    await mergeIntoList<Staff>(KEY_STAFF, DEMO_STAFF);

    await AsyncStorage.setItem(SEED_FLAG, "1");
    console.log("[SEED] Demo businesses seeded —", DEMO_BUSINESSES.length, "empresas");
  } catch (e) {
    console.warn("[SEED] seedDemoBusinessesIfNeeded error:", e);
  }
}
