import AsyncStorage from "@react-native-async-storage/async-storage";

export type TipoContacto =
  | "cliente"
  | "proveedor"
  | "tecnico"
  | "comercial"
  | "otro";

export interface Contacto {
  id: string;
  empresa: string;
  responsable: string;
  email: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  codigoPostal: string;
  provincia: string;
  pais: string;
  tipo: TipoContacto;
  tecnicoAsignado: string;
  comercialAsignado: string;
  frecuenciaVisita: string;
  duracionVisita: string;
  observaciones: string;
  importadoEn: string;
  loteId: string;
}

export type ContactoRaw = Partial<Omit<Contacto, "id" | "importadoEn" | "loteId">>;

const STORAGE_KEY = "go_contactos_v1";

export async function loadContactos(): Promise<Contacto[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Contacto[]) : [];
  } catch {
    return [];
  }
}

export async function saveContactos(contactos: Contacto[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(contactos));
}

export async function importarLote(rows: ContactoRaw[]): Promise<{
  importados: number;
  duplicados: number;
  loteId: string;
}> {
  const existing = await loadContactos();
  const loteId = `lote_${Date.now()}`;
  const importadoEn = new Date().toISOString();

  let importados = 0;
  let duplicados = 0;

  const merged = [...existing];

  for (const row of rows) {
    const email = (row.email ?? "").toLowerCase().trim();
    const empresa = (row.empresa ?? "").toLowerCase().trim();

    const isDup = existing.some(
      (c) =>
        (email && c.email.toLowerCase() === email) ||
        (empresa && c.empresa.toLowerCase() === empresa && !email)
    );

    if (isDup) {
      duplicados++;
      continue;
    }

    merged.push({
      id: `c_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      empresa: row.empresa ?? "",
      responsable: row.responsable ?? "",
      email: row.email ?? "",
      telefono: row.telefono ?? "",
      direccion: row.direccion ?? "",
      ciudad: row.ciudad ?? "",
      codigoPostal: row.codigoPostal ?? "",
      provincia: row.provincia ?? "",
      pais: row.pais ?? "",
      tipo: row.tipo ?? "cliente",
      tecnicoAsignado: row.tecnicoAsignado ?? "",
      comercialAsignado: row.comercialAsignado ?? "",
      frecuenciaVisita: row.frecuenciaVisita ?? "",
      duracionVisita: row.duracionVisita ?? "",
      observaciones: row.observaciones ?? "",
      importadoEn,
      loteId,
    });
    importados++;
  }

  await saveContactos(merged);
  return { importados, duplicados, loteId };
}

export async function deleteContacto(id: string): Promise<void> {
  const existing = await loadContactos();
  await saveContactos(existing.filter((c) => c.id !== id));
}

// ── Column auto-detection ─────────────────────────────────────────────

const COLUMN_MAP: Record<string, keyof ContactoRaw> = {
  empresa: "empresa",
  "empresa cliente": "empresa",
  "nombre empresa": "empresa",
  company: "empresa",
  compania: "empresa",
  compañia: "empresa",
  organization: "empresa",
  organización: "empresa",

  responsable: "responsable",
  "persona de contacto": "responsable",
  contacto: "responsable",
  nombre: "responsable",
  name: "responsable",
  "nombre contacto": "responsable",

  email: "email",
  mail: "email",
  "e-mail": "email",
  correo: "email",
  "correo electronico": "email",
  "correo electrónico": "email",
  "email address": "email",

  telefono: "telefono",
  teléfono: "telefono",
  tel: "telefono",
  phone: "telefono",
  movil: "telefono",
  móvil: "telefono",
  celular: "telefono",
  mobile: "telefono",

  direccion: "direccion",
  dirección: "direccion",
  address: "direccion",
  domicilio: "direccion",

  ciudad: "ciudad",
  city: "ciudad",
  poblacion: "ciudad",
  población: "ciudad",

  "codigo postal": "codigoPostal",
  "código postal": "codigoPostal",
  cp: "codigoPostal",
  "zip code": "codigoPostal",
  zip: "codigoPostal",
  postal: "codigoPostal",

  provincia: "provincia",
  region: "provincia",
  región: "provincia",
  state: "provincia",

  pais: "pais",
  país: "pais",
  country: "pais",

  tipo: "tipo",
  type: "tipo",
  categoria: "tipo",
  categoría: "tipo",
  "tipo cliente": "tipo",

  "tecnico asignado": "tecnicoAsignado",
  "técnico asignado": "tecnicoAsignado",
  tecnico: "tecnicoAsignado",
  técnico: "tecnicoAsignado",

  "comercial asignado": "comercialAsignado",
  comercial: "comercialAsignado",

  "frecuencia visita": "frecuenciaVisita",
  frecuencia: "frecuenciaVisita",
  "frecuencia de visita": "frecuenciaVisita",

  "duracion visita": "duracionVisita",
  "duración visita": "duracionVisita",
  duracion: "duracionVisita",
  duración: "duracionVisita",
  "duracion de visita": "duracionVisita",

  observaciones: "observaciones",
  notas: "observaciones",
  notes: "observaciones",
  comentarios: "observaciones",
  remarks: "observaciones",
};

export function detectarColumna(header: string): keyof ContactoRaw | null {
  const clean = header
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "");
  return COLUMN_MAP[clean] ?? null;
}

export const TIPO_OPTIONS: TipoContacto[] = [
  "cliente",
  "proveedor",
  "tecnico",
  "comercial",
  "otro",
];

export const FIELD_LABELS: Record<keyof ContactoRaw, string> = {
  empresa: "Empresa",
  responsable: "Responsable",
  email: "Email",
  telefono: "Teléfono",
  direccion: "Dirección",
  ciudad: "Ciudad",
  codigoPostal: "Código postal",
  provincia: "Provincia",
  pais: "País",
  tipo: "Tipo",
  tecnicoAsignado: "Técnico asignado",
  comercialAsignado: "Comercial asignado",
  frecuenciaVisita: "Frecuencia de visita",
  duracionVisita: "Duración de visita",
  observaciones: "Observaciones",
};
