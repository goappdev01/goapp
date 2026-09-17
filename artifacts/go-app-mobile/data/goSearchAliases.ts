/**
 * goSearchAliases.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tabla central de alias de búsqueda para GO.
 *
 * ARQUITECTURA
 * ─────────────────────────────────────────────────────────────────────────────
 * Cada entrada define:
 *   · keywords  — palabras que el usuario puede escribir (vida real)
 *   · expands   — términos internos que se añaden a la búsqueda al coincidir
 *
 * Para ampliar: añadir entradas aquí. El motor de búsqueda no necesita cambios.
 *
 * REGLAS
 * ─────────────────────────────────────────────────────────────────────────────
 * · Todo en minúsculas y sin tildes en keywords (el motor normaliza la entrada)
 * · expands pueden llevar tildes (se comparan con los datos reales del negocio)
 * · Un keyword puede pertenecer a varios grupos si tiene sentido semántico
 * · No inventar relaciones forzadas — solo alias que el usuario esperaría
 */

export type SearchAlias = {
  keywords: string[];
  expands:  string[];
};

export const SEARCH_ALIASES: SearchAlias[] = [

  // ── Restauración ──────────────────────────────────────────────────────────

  {
    keywords: ["italiano", "pizza", "pizzeria", "pizzeria"],
    expands:  ["restaurante", "restauración", "italiano", "pizza"],
  },
  {
    keywords: ["sushi", "japones", "ramen", "udon", "tempura", "teriyaki"],
    expands:  ["restaurante", "restauración", "japonés", "sushi"],
  },
  {
    keywords: ["burger", "hamburguesa", "fast food", "comida rapida"],
    expands:  ["restaurante", "restauración", "comida rápida"],
  },
  {
    keywords: ["chino", "china", "asiatico", "chifa", "wok"],
    expands:  ["restaurante", "restauración"],
  },
  {
    keywords: ["tapas", "pintxos", "pinchos", "taberna", "bodega"],
    expands:  ["restaurante", "restauración", "bar"],
  },
  {
    keywords: ["cafe", "coffee", "brunch", "desayuno"],
    expands:  ["restaurante", "restauración", "cafetería"],
  },
  {
    keywords: ["helado", "heladeria", "sorbet", "gelato"],
    expands:  ["restaurante", "restauración", "heladería"],
  },
  {
    keywords: ["pastel", "dulce", "panaderia", "pasteleria", "bolleria", "tarta"],
    expands:  ["restaurante", "restauración", "confitería"],
  },
  {
    keywords: ["mexicano", "tacos", "burritos", "tex-mex"],
    expands:  ["restaurante", "restauración"],
  },
  {
    keywords: ["vegano", "vegetariano", "veggie", "saludable", "organico"],
    expands:  ["restaurante", "restauración"],
  },

  // ── Salud ─────────────────────────────────────────────────────────────────

  {
    keywords: ["masaje", "masajes", "masajista"],
    expands:  ["spa", "masajes", "salud", "bienestar"],
  },
  {
    keywords: ["fisio", "fisioterapia", "fisioterapeuta", "rehabilitacion"],
    expands:  ["salud", "fisioterapia"],
  },
  {
    keywords: ["medico", "doctor", "medicina", "consulta medica"],
    expands:  ["salud", "clínica"],
  },
  {
    keywords: ["dentista", "dental", "ortodoncia", "implantes"],
    expands:  ["salud", "odontología"],
  },
  {
    keywords: ["psicologo", "psiquiatra", "terapeuta", "terapia"],
    expands:  ["salud"],
  },
  {
    keywords: ["nutricion", "nutricionista", "dieta", "dietista"],
    expands:  ["salud"],
  },
  {
    keywords: ["optico", "optica", "gafas", "lentillas"],
    expands:  ["salud"],
  },
  {
    keywords: ["osteopata", "osteoptia", "quiromasaje", "quiropractico"],
    expands:  ["salud", "fisioterapia"],
  },
  {
    keywords: ["acupuntura", "medicina china", "medicina natural"],
    expands:  ["salud", "bienestar"],
  },

  // ── Belleza ───────────────────────────────────────────────────────────────

  {
    keywords: ["peluqueria", "pelo", "corte", "tinte", "mechas", "peinado"],
    expands:  ["belleza", "peluquería"],
  },
  {
    keywords: ["unas", "manicura", "pedicura", "nail", "gel"],
    expands:  ["belleza", "uñas"],
  },
  {
    keywords: ["barberia", "barba", "afeitado", "barber"],
    expands:  ["belleza", "barbería"],
  },
  {
    keywords: ["maquillaje", "makeup", "artista de maquillaje"],
    expands:  ["belleza", "maquillaje"],
  },
  {
    keywords: ["depilacion", "cera", "laser", "fotodepilacion"],
    expands:  ["belleza", "estética"],
  },
  {
    keywords: ["estetica", "facial", "tratamiento", "piel", "dermatologo"],
    expands:  ["belleza", "estética"],
  },
  {
    keywords: ["spa", "wellness", "bienestar", "relajacion", "circuito termal"],
    expands:  ["belleza", "spa", "salud"],
  },
  {
    keywords: ["cejas", "micropigmentacion", "tatuaje"],
    expands:  ["belleza", "estética"],
  },

  // ── Deportes ──────────────────────────────────────────────────────────────

  {
    keywords: ["padel", "pista de padel"],
    expands:  ["deportes", "pádel"],
  },
  {
    keywords: ["tenis", "pista de tenis"],
    expands:  ["deportes", "tenis"],
  },
  {
    keywords: ["futbol", "futbol sala", "fronton", "cancha"],
    expands:  ["deportes", "fútbol sala"],
  },
  {
    keywords: ["gimnasio", "gym", "musculacion", "pesas", "fitness"],
    expands:  ["deportes", "gimnasio"],
  },
  {
    keywords: ["yoga", "pilates", "meditacion", "mindfulness"],
    expands:  ["deportes", "yoga"],
  },
  {
    keywords: ["crossfit", "hiit", "funcional", "entrenamiento funcional"],
    expands:  ["deportes", "gimnasio", "crossfit"],
  },
  {
    keywords: ["natacion", "piscina", "aqua", "waterpolo"],
    expands:  ["deportes", "natación"],
  },
  {
    keywords: ["boxeo", "muay thai", "kickboxing", "artes marciales", "judo", "karate"],
    expands:  ["deportes"],
  },
  {
    keywords: ["ciclismo", "bicicleta", "spinning", "cycling"],
    expands:  ["deportes"],
  },
  {
    keywords: ["golf", "hoyo", "campo de golf"],
    expands:  ["deportes", "golf"],
  },
  {
    keywords: ["baloncesto", "basket"],
    expands:  ["deportes"],
  },

  // ── Actividades / Ocio ────────────────────────────────────────────────────

  {
    keywords: ["escape room", "sala de escape", "juego de escape"],
    expands:  ["actividades", "ocio", "escape room"],
  },
  {
    keywords: ["karting", "kart", "circuito"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["bolera", "bolos", "bowling"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["laser", "laser tag", "paintball"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["cine", "pelicula", "sala de cine"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["teatro", "obra de teatro", "musical"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["museo", "exposicion", "galeria"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["concierto", "musica en directo", "recital"],
    expands:  ["actividades", "ocio"],
  },
  {
    keywords: ["clases", "taller", "curso", "academia"],
    expands:  ["actividades"],
  },

  // ── Hogar y Servicios ─────────────────────────────────────────────────────

  {
    keywords: ["fontanero", "fontaneria", "lampista", "tuberia"],
    expands:  ["hogar", "servicios"],
  },
  {
    keywords: ["electricista", "electricidad", "instalacion electrica"],
    expands:  ["hogar", "servicios"],
  },
  {
    keywords: ["pintor", "pintura", "pintado"],
    expands:  ["hogar", "servicios"],
  },
  {
    keywords: ["limpieza", "limpiador", "servicio de limpieza", "hogar limpio"],
    expands:  ["hogar", "servicios"],
  },
  {
    keywords: ["mudanza", "transportista", "traslado"],
    expands:  ["hogar", "servicios"],
  },
  {
    keywords: ["reformas", "obra", "construccion", "albañil", "carpintero"],
    expands:  ["hogar", "servicios"],
  },
  {
    keywords: ["jardinero", "jardineria", "plantas"],
    expands:  ["hogar", "servicios"],
  },

  // ── Hoteles / Alojamiento ─────────────────────────────────────────────────

  {
    keywords: ["hotel", "hostal", "alojamiento", "habitacion"],
    expands:  ["hoteles"],
  },
  {
    keywords: ["rural", "casa rural", "agroturismo"],
    expands:  ["hoteles"],
  },
  {
    keywords: ["apartamento", "aparthotel", "suite"],
    expands:  ["hoteles"],
  },

];

// ─── Motor de expansión ───────────────────────────────────────────────────────

/**
 * Dado un término de búsqueda normalizado (minúsculas, sin tildes),
 * devuelve el conjunto de términos de búsqueda extendido con los alias.
 * Siempre incluye el término original.
 */
export function expandSearchTerms(rawQuery: string): string[] {
  const q = normalize(rawQuery);
  const terms = new Set<string>([q]);

  for (const alias of SEARCH_ALIASES) {
    const matched = alias.keywords.some(
      (k) => normalize(k).includes(q) || q.includes(normalize(k))
    );
    if (matched) {
      alias.expands.forEach((e) => terms.add(normalize(e)));
      // También añadir la versión sin normalizar para comparar con datos reales
      alias.expands.forEach((e) => terms.add(e.toLowerCase()));
    }
  }

  return Array.from(terms);
}

/** Elimina tildes y pasa a minúsculas */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}
