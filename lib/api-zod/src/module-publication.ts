/** Release policy, separate from identity, RLS and business membership. No user data. */
export type GoModuleStage = "development" | "internal" | "pilot" | "public";
export type GoModuleAudience = "pilot" | "general";
export type GoModulePublication = {
  version: 1;
  audience: GoModuleAudience;
  stages: Record<string, GoModuleStage>;
};

export const GO_RESERVATION_SECTORS = ["belleza", "restauracion", "deportes", "salud", "actividades", "servicios", "hogar", "hoteles", "otros"] as const;
export const GO_BOOKING_ACTIVITY_GROUPS: Record<string, readonly string[]> = {
  belleza: ["peluqueria", "unas", "masajes", "estetica", "barberia", "spa", "maquillaje"],
  restauracion: ["restaurante", "cafeteria", "bar", "terraza", "comida_rapida", "confiteria", "heladeria"],
  deportes: ["padel", "tenis", "futbol", "futbol_7", "futbol_11", "gimnasio", "yoga", "pilates", "natacion", "squash", "badminton", "golf", "boxeo", "artes_marciales", "ciclismo", "atletismo", "escalada", "tiro_arco", "piscina", "multideporte"],
  salud: ["clinica", "psicologo", "fisioterapia", "dentista", "medico", "nutricionista", "optometria"],
  actividades: ["escape_room", "karting", "teatro", "concierto", "laser_tag", "cine", "realidad_vr"],
  servicios: ["taller", "consultoria", "academia", "sala_reuniones", "fotografia", "coworking"],
  hogar: ["fontanero", "electricista", "limpieza", "jardineria", "mudanzas", "reformas", "cerrajero", "pintor"],
  hoteles: ["hotel", "apartamento", "casa_rural", "hostal"], otros: ["personalizado"],
};
export const GO_MODULE_STAGES: readonly GoModuleStage[] = ["development", "internal", "pilot", "public"];
export const GO_MODULE_STAGE_LABELS: Record<GoModuleStage, string> = {
  development: "En desarrollo", internal: "Pruebas internas", pilot: "Habilitado para piloto", public: "Usuarios generales",
};
export function defaultGoModulePublication(): GoModulePublication {
  return { version: 1, audience: "pilot", stages: {
    ...Object.fromEntries(GO_RESERVATION_SECTORS.map(id => [`reservas.${id}`, "internal" as const])),
    "reservas.peluqueria": "pilot",
    "go.imprimir": "development",
  } };
}

/** Invalid/missing configuration closes unpublished modules; never enables everything. */
export function parseGoModulePublication(value: unknown): GoModulePublication {
  const fallback = defaultGoModulePublication();
  if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
  const input = value as Partial<GoModulePublication>;
  if (input.version !== 1 || !["pilot", "general"].includes(String(input.audience)) || !input.stages || typeof input.stages !== "object" || Array.isArray(input.stages)) return fallback;
  const stages: Record<string, GoModuleStage> = { ...fallback.stages };
  for (const [key, stage] of Object.entries(input.stages)) {
    if (/^(reservas\.[a-z0-9_]+|go\.imprimir)$/.test(key) && GO_MODULE_STAGES.includes(stage)) stages[key] = stage;
  }
  return { version: 1, audience: input.audience!, stages };
}

const canonical = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
/** Exact aliases only: a broad beauty category is not proof that a business is a hairdresser. */
export function canonicalBookingActivity(value: unknown): string {
  if (typeof value !== "string") return "";
  const key = canonical(value);
  const aliases: Record<string, string> = { "belleza peluqueria": "peluqueria", "belleza/peluqueria": "peluqueria", "peluqueria": "peluqueria", "peluquerias": "peluqueria", "restauracion restaurante": "restaurante", "restauracion/restaurante": "restaurante" };
  return aliases[key] ?? key;
}
export function goModuleStage(moduleId: string, publication = defaultGoModulePublication(), parentId?: string): GoModuleStage {
  return publication.stages[moduleId] ?? (parentId ? publication.stages[parentId] : undefined) ?? "development";
}
export function goModuleDecision(moduleId: string, options: {
  publication?: GoModulePublication; parentId?: string; internalAccess?: boolean; authorized?: boolean;
} = {}) {
  const publication = options.publication ?? defaultGoModulePublication();
  const stage = goModuleStage(moduleId, publication, options.parentId);
  const enabled = options.internalAccess === true || stage === "public" || stage === "pilot" && publication.audience === "pilot";
  return { stage, visible: enabled, operable: enabled, authorized: options.authorized === true,
    allowed: enabled && options.authorized === true };
}
export function bookingActivityEnabled(activity: unknown, publication = defaultGoModulePublication(), internalAccess = false): boolean {
  const id = canonicalBookingActivity(activity);
  const sector = Object.keys(GO_BOOKING_ACTIVITY_GROUPS).find(key => GO_BOOKING_ACTIVITY_GROUPS[key].includes(id));
  return !!id && goModuleDecision(`reservas.${id}`, { publication, internalAccess, parentId: sector ? `reservas.${sector}` : undefined }).operable;
}
/** Projection of the existing catalogue; never mutate or replace its full architecture. */
export function visibleBookingSectors<T extends { id: string; subs: { id: string }[] }>(sectors: T[], publication = defaultGoModulePublication(), internalAccess = false): T[] {
  return sectors.map(sector => ({ ...sector, subs: sector.subs.filter(sub => goModuleDecision(`reservas.${sub.id}`, {
    publication, internalAccess, parentId: `reservas.${sector.id}`,
  }).visible) })).filter(sector => sector.subs.length > 0) as T[];
}
