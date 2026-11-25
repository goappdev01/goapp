import type { BookableItem } from "./booking";

// Bundled DEMO-only resources. Production catalogue images need an authorized
// company-scoped storage contract; no URL from this map is sent to a server.
const photos = {
  "corte-caballero": () => require("../assets/catalog-demo/corte-caballero.jpg"),
  "corte-senora": () => require("../assets/catalog-demo/corte-senora.jpg"),
  "tinte-coloracion": () => require("../assets/catalog-demo/tinte-coloracion.jpg"),
  "peinado-secado": () => require("../assets/catalog-demo/peinado-secado.jpg"),
  "mechas-tratamiento": () => require("../assets/catalog-demo/mechas-tratamiento.jpg"),
  "paella-valenciana": () => require("../assets/catalog-demo/paella-valenciana.jpg"),
  "tortilla-patatas": () => require("../assets/catalog-demo/tortilla-patatas.jpg"),
  croquetas: () => require("../assets/catalog-demo/croquetas.jpg"),
  "patatas-bravas": () => require("../assets/catalog-demo/patatas-bravas.jpg"),
  gazpacho: () => require("../assets/catalog-demo/gazpacho.jpg"),
  "churros-chocolate": () => require("../assets/catalog-demo/churros-chocolate.jpg"),
  "bravas-burgos": () => require("../assets/catalog-demo/bravas-burgos.jpg"),
  "croquetas-plato": () => require("../assets/catalog-demo/croquetas-plato.jpg"),
  "tapas-variadas": () => require("../assets/catalog-demo/tapas-variadas.jpg"),
  "calamares-fritos": () => require("../assets/catalog-demo/calamares-fritos.jpg"),
  "calamares-salsas": () => require("../assets/catalog-demo/calamares-salsas.jpg"),
  "empanada-carne": () => require("../assets/catalog-demo/empanada-carne.jpg"),
  "ensalada-citrica": () => require("../assets/catalog-demo/ensalada-citrica.jpg"),
  "ensalada-mediterranea": () => require("../assets/catalog-demo/ensalada-mediterranea.jpg"),
  "ensalada-rusa": () => require("../assets/catalog-demo/ensalada-rusa.jpg"),
  "arroz-pollo": () => require("../assets/catalog-demo/arroz-pollo.jpg"),
  "arroz-verduras": () => require("../assets/catalog-demo/arroz-verduras.jpg"),
  "paella-tradicional": () => require("../assets/catalog-demo/paella-tradicional.jpg"),
  "paella-marisco": () => require("../assets/catalog-demo/paella-marisco.jpg"),
  "entrecot-parrilla": () => require("../assets/catalog-demo/entrecot-parrilla.jpg"),
  "carne-verduras": () => require("../assets/catalog-demo/carne-verduras.jpg"),
  "carne-asada": () => require("../assets/catalog-demo/carne-asada.jpg"),
  "salmon-plancha": () => require("../assets/catalog-demo/salmon-plancha.jpg"),
  "pescado-rebozado": () => require("../assets/catalog-demo/pescado-rebozado.jpg"),
  "gambas-ajillo": () => require("../assets/catalog-demo/gambas-ajillo.jpg"),
  "pulpo-gallega": () => require("../assets/catalog-demo/pulpo-gallega.jpg"),
  "mariscada": () => require("../assets/catalog-demo/mariscada.jpg"),
  "estofado-ternera": () => require("../assets/catalog-demo/estofado-ternera.jpg"),
  "sandwiches-variados": () => require("../assets/catalog-demo/sandwiches-variados.jpg"),
  "tostada-desayuno": () => require("../assets/catalog-demo/tostada-desayuno.jpg"),
  "desayuno-ingles": () => require("../assets/catalog-demo/desayuno-ingles.jpg"),
  "tarta-chocolate": () => require("../assets/catalog-demo/tarta-chocolate.jpg"),
  "tarta-queso-vasca": () => require("../assets/catalog-demo/tarta-queso-vasca.jpg"),
  "tarta-queso": () => require("../assets/catalog-demo/tarta-queso.jpg"),
  "flan": () => require("../assets/catalog-demo/flan.jpg"),
  "hamburguesa-vegetal": () => require("../assets/catalog-demo/hamburguesa-vegetal.jpg"),
  "salon-corte-09": () => require("../assets/catalog-demo/salon-corte-09.jpg"),
  "salon-trenza": () => require("../assets/catalog-demo/salon-trenza.jpg"),
  "salon-sillones": () => require("../assets/catalog-demo/salon-sillones.jpg"),
  "sopa-lentejas": () => require("../assets/catalog-demo/sopa-lentejas.jpg"),
  "guiso-alubias": () => require("../assets/catalog-demo/guiso-alubias.jpg"),
  "bocadillo-variado": () => require("../assets/catalog-demo/bocadillo-variado.jpg"),
  "salon-interior": () => require("../assets/catalog-demo/salon-interior.jpg"),
  "salon-sillon": () => require("../assets/catalog-demo/salon-sillon.jpg"),
  "salon-planchas": () => require("../assets/catalog-demo/salon-planchas.jpg"),
  "ratatouille-plato": () => require("../assets/catalog-demo/ratatouille-plato.jpg"),
  "verduras-plato": () => require("../assets/catalog-demo/verduras-plato.jpg"),
  "verduras-sarten": () => require("../assets/catalog-demo/verduras-sarten.jpg"),
  "salon-rulos": () => require("../assets/catalog-demo/salon-rulos.jpg"),
  "tapas-surtidas": () => require("../assets/catalog-demo/tapas-surtidas.jpg"),
  "arroz-marisco": () => require("../assets/catalog-demo/arroz-marisco.jpg"),
  "pescado-parrilla": () => require("../assets/catalog-demo/pescado-parrilla.jpg"),
  "pescado-gourmet": () => require("../assets/catalog-demo/pescado-gourmet.jpg"),
  "ostras-limon": () => require("../assets/catalog-demo/ostras-limon.jpg"),
  "cangrejo-plato": () => require("../assets/catalog-demo/cangrejo-plato.jpg"),
  "marisco-gourmet": () => require("../assets/catalog-demo/marisco-gourmet.jpg"),
  "ajo-blanco": () => require("../assets/catalog-demo/ajo-blanco.jpg"),
  "bullit-ibiza": () => require("../assets/catalog-demo/bullit-ibiza.jpg"),
  "guiso-carrero": () => require("../assets/catalog-demo/guiso-carrero.jpg"),
  "desayuno-barcelona": () => require("../assets/catalog-demo/desayuno-barcelona.jpg"),
  "desayuno-sevilla": () => require("../assets/catalog-demo/desayuno-sevilla.jpg"),
  "desayuno-espanol": () => require("../assets/catalog-demo/desayuno-espanol.jpg"),
  "roscon": () => require("../assets/catalog-demo/roscon.jpg"),
  "dulces-bandeja": () => require("../assets/catalog-demo/dulces-bandeja.jpg"),
  "pastel-platano": () => require("../assets/catalog-demo/pastel-platano.jpg"),
  "verduras-salteadas": () => require("../assets/catalog-demo/verduras-salteadas.jpg"),
  "arroz-gourmet": () => require("../assets/catalog-demo/arroz-gourmet.jpg"),
  "corte-bob-espalda": () => require("../assets/catalog-demo/corte-bob-espalda.jpg"),
  "corte-bob-clasico": () => require("../assets/catalog-demo/corte-bob-clasico.jpg"),
  "corte-bob-corto": () => require("../assets/catalog-demo/corte-bob-corto.jpg"),
  "trenza-cabello": () => require("../assets/catalog-demo/trenza-cabello.jpg"),
  "corte-tijera": () => require("../assets/catalog-demo/corte-tijera.jpg"),
  "corte-detalle": () => require("../assets/catalog-demo/corte-detalle.jpg"),
  "corte-maquina": () => require("../assets/catalog-demo/corte-maquina.jpg"),
  "alisado-plancha": () => require("../assets/catalog-demo/alisado-plancha.jpg"),
} as const;
type ExampleId = keyof typeof photos;

/** Stable references stored only in the isolated DEMO configuration. */
const EXAMPLE_PREFIX = "demo-catalog:";
export const demoCatalogPhotoExamples: ReadonlyArray<{ id: ExampleId; title: string; group: "Peluquerías" | "Restaurantes"; category: string }> = [
  { id: "corte-caballero", title: "Corte caballero", group: "Peluquerías", category: "Cortes" },
  { id: "corte-senora", title: "Corte señora", group: "Peluquerías", category: "Cortes" },
  { id: "tinte-coloracion", title: "Tinte / coloración", group: "Peluquerías", category: "Tintes" },
  { id: "peinado-secado", title: "Peinado y secado", group: "Peluquerías", category: "Peinados" },
  { id: "mechas-tratamiento", title: "Mechas / tratamiento", group: "Peluquerías", category: "Tratamientos" },
  { id: "paella-valenciana", title: "Paella valenciana", group: "Restaurantes", category: "Paellas" },
  { id: "tortilla-patatas", title: "Tortilla de patatas", group: "Restaurantes", category: "Tapas" },
  { id: "croquetas", title: "Croquetas", group: "Restaurantes", category: "Tapas" },
  { id: "patatas-bravas", title: "Patatas bravas", group: "Restaurantes", category: "Tapas" },
  { id: "gazpacho", title: "Gazpacho", group: "Restaurantes", category: "Entrantes" },
  { id: "churros-chocolate", title: "Churros con chocolate", group: "Restaurantes", category: "Desayunos" },
  { id: "bravas-burgos", title: "Patatas bravas", group: "Restaurantes", category: "Tapas" },
  { id: "croquetas-plato", title: "Croquetas", group: "Restaurantes", category: "Tapas" },
  { id: "tapas-variadas", title: "Tapas variadas", group: "Restaurantes", category: "Tapas" },
  { id: "calamares-fritos", title: "Calamares fritos", group: "Restaurantes", category: "Entrantes" },
  { id: "calamares-salsas", title: "Calamares con salsas", group: "Restaurantes", category: "Entrantes" },
  { id: "empanada-carne", title: "Empanada de carne", group: "Restaurantes", category: "Entrantes" },
  { id: "ensalada-citrica", title: "Ensalada cítrica", group: "Restaurantes", category: "Ensaladas" },
  { id: "ensalada-mediterranea", title: "Ensalada mediterránea", group: "Restaurantes", category: "Ensaladas" },
  { id: "ensalada-rusa", title: "Ensaladilla rusa", group: "Restaurantes", category: "Ensaladas" },
  { id: "arroz-pollo", title: "Arroz con pollo", group: "Restaurantes", category: "Arroces" },
  { id: "arroz-verduras", title: "Arroz con verduras", group: "Restaurantes", category: "Arroces" },
  { id: "paella-tradicional", title: "Paella tradicional", group: "Restaurantes", category: "Paellas" },
  { id: "paella-marisco", title: "Paella de marisco", group: "Restaurantes", category: "Paellas" },
  { id: "entrecot-parrilla", title: "Entrecot a la parrilla", group: "Restaurantes", category: "Carnes" },
  { id: "carne-verduras", title: "Carne con verduras", group: "Restaurantes", category: "Carnes" },
  { id: "carne-asada", title: "Carne asada", group: "Restaurantes", category: "Carnes" },
  { id: "salmon-plancha", title: "Salmón a la plancha", group: "Restaurantes", category: "Pescados" },
  { id: "pescado-rebozado", title: "Pescado rebozado", group: "Restaurantes", category: "Pescados" },
  { id: "gambas-ajillo", title: "Gambas al ajillo", group: "Restaurantes", category: "Mariscos" },
  { id: "pulpo-gallega", title: "Pulpo a la gallega", group: "Restaurantes", category: "Mariscos" },
  { id: "mariscada", title: "Pescado y marisco", group: "Restaurantes", category: "Mariscos" },
  { id: "estofado-ternera", title: "Estofado de ternera", group: "Restaurantes", category: "Guisos" },
  { id: "sandwiches-variados", title: "Sándwiches variados", group: "Restaurantes", category: "Bocadillos" },
  { id: "tostada-desayuno", title: "Tostada", group: "Restaurantes", category: "Desayunos" },
  { id: "desayuno-ingles", title: "Desayuno inglés", group: "Restaurantes", category: "Desayunos" },
  { id: "tarta-chocolate", title: "Tarta de chocolate", group: "Restaurantes", category: "Postres" },
  { id: "tarta-queso-vasca", title: "Tarta de queso vasca", group: "Restaurantes", category: "Postres" },
  { id: "tarta-queso", title: "Tarta de queso", group: "Restaurantes", category: "Postres" },
  { id: "flan", title: "Flan", group: "Restaurantes", category: "Postres" },
  { id: "hamburguesa-vegetal", title: "Hamburguesa vegetal", group: "Restaurantes", category: "Otros" },
  { id: "salon-corte-09", title: "Corte profesional", group: "Peluquerías", category: "Cortes" },
  { id: "salon-trenza", title: "Peinado trenzado", group: "Peluquerías", category: "Peinados" },
  { id: "salon-sillones", title: "Sillones de barbería", group: "Peluquerías", category: "Otros" },
  { id: "sopa-lentejas", title: "Sopa de lentejas", group: "Restaurantes", category: "Guisos" },
  { id: "guiso-alubias", title: "Guiso de alubias con pollo", group: "Restaurantes", category: "Guisos" },
  { id: "bocadillo-variado", title: "Bocadillo variado", group: "Restaurantes", category: "Bocadillos" },
  { id: "salon-interior", title: "Interior de peluquería", group: "Peluquerías", category: "Otros" },
  { id: "salon-sillon", title: "Sillón de barbería", group: "Peluquerías", category: "Otros" },
  { id: "salon-planchas", title: "Planchas de pelo", group: "Peluquerías", category: "Alisados" },
  { id: "ratatouille-plato", title: "Ratatouille de verduras", group: "Restaurantes", category: "Verduras" },
  { id: "verduras-plato", title: "Verduras variadas", group: "Restaurantes", category: "Verduras" },
  { id: "verduras-sarten", title: "Verduras salteadas", group: "Restaurantes", category: "Verduras" },
  { id: "salon-rulos", title: "Rulos de peluquería", group: "Peluquerías", category: "Peinados" },
  { id: "tapas-surtidas", title: "Tapas surtidas", group: "Restaurantes", category: "Tapas" },
  { id: "arroz-marisco", title: "Arroz con marisco", group: "Restaurantes", category: "Arroces" },
  { id: "pescado-parrilla", title: "Pescado a la parrilla", group: "Restaurantes", category: "Pescados" },
  { id: "pescado-gourmet", title: "Pescado con guarnición", group: "Restaurantes", category: "Pescados" },
  { id: "ostras-limon", title: "Ostras con limón", group: "Restaurantes", category: "Mariscos" },
  { id: "cangrejo-plato", title: "Cangrejo preparado", group: "Restaurantes", category: "Mariscos" },
  { id: "marisco-gourmet", title: "Marisco con guarnición", group: "Restaurantes", category: "Mariscos" },
  { id: "ajo-blanco", title: "Ajo blanco", group: "Restaurantes", category: "Entrantes" },
  { id: "bullit-ibiza", title: "Bullit de Ibiza", group: "Restaurantes", category: "Guisos" },
  { id: "guiso-carrero", title: "Guiso casero", group: "Restaurantes", category: "Guisos" },
  { id: "desayuno-barcelona", title: "Desayuno en Barcelona", group: "Restaurantes", category: "Desayunos" },
  { id: "desayuno-sevilla", title: "Desayuno en Sevilla", group: "Restaurantes", category: "Desayunos" },
  { id: "desayuno-espanol", title: "Desayuno español", group: "Restaurantes", category: "Desayunos" },
  { id: "roscon", title: "Roscón", group: "Restaurantes", category: "Postres" },
  { id: "dulces-bandeja", title: "Dulces variados", group: "Restaurantes", category: "Postres" },
  { id: "pastel-platano", title: "Pastel de plátano", group: "Restaurantes", category: "Postres" },
  { id: "verduras-salteadas", title: "Verduras salteadas", group: "Restaurantes", category: "Verduras" },
  { id: "arroz-gourmet", title: "Arroz con guarnición", group: "Restaurantes", category: "Arroces" },
  { id: "corte-bob-espalda", title: "Corte bob visto por detrás", group: "Peluquerías", category: "Cortes" },
  { id: "corte-bob-clasico", title: "Corte bob clásico", group: "Peluquerías", category: "Cortes" },
  { id: "corte-bob-corto", title: "Corte bob corto", group: "Peluquerías", category: "Cortes" },
  { id: "trenza-cabello", title: "Trenza de cabello", group: "Peluquerías", category: "Peinados" },
  { id: "corte-tijera", title: "Corte con tijera", group: "Peluquerías", category: "Cortes" },
  { id: "corte-detalle", title: "Corte de precisión", group: "Peluquerías", category: "Cortes" },
  { id: "corte-maquina", title: "Corte de cabello", group: "Peluquerías", category: "Cortes" },
  { id: "alisado-plancha", title: "Alisado con plancha", group: "Peluquerías", category: "Alisados" },
];
export type DemoCatalogPhotoGroup = "Todas" | "Peluquerías" | "Restaurantes";
export function demoCatalogPhotoCategories(group: DemoCatalogPhotoGroup): string[] {
  return [...new Set(demoCatalogPhotoExamples.filter(example => group === "Todas" || example.group === group).map(example => example.category))];
}
export function filterDemoCatalogPhotoExamples(group: DemoCatalogPhotoGroup, category: string, query: string) {
  const needle = normalize(query);
  return demoCatalogPhotoExamples.filter(example =>
    (group === "Todas" || example.group === group) &&
    (category === "Todas" || example.category === category) &&
    (!needle || normalize(`${example.title} ${example.category}`).includes(needle)));
}
export const demoCatalogExampleSource = (id: ExampleId): number => photos[id]();
export const demoCatalogExampleReference = (id: ExampleId): string => `${EXAMPLE_PREFIX}${id}`;
/** Bundled references are shared by DEMO and real businesses; never a remote URL. */
export function isSharedCatalogPhotoReference(value: unknown): value is `demo-catalog:${string}` {
  return typeof value === "string" && value.startsWith(EXAMPLE_PREFIX)
    && Object.prototype.hasOwnProperty.call(photos, value.slice(EXAMPLE_PREFIX.length));
}

const demoTitlePhoto: Record<string, keyof typeof photos> = {
  "corte caballero": "corte-caballero", "corte senora": "corte-senora",
  "tinte": "tinte-coloracion", "tinte / coloracion": "tinte-coloracion",
  "peinado": "peinado-secado", "peinado y secado": "peinado-secado",
  "mechas": "mechas-tratamiento", "mechas / tratamiento": "mechas-tratamiento",
  "paella valenciana": "paella-valenciana", "tortilla de patatas": "tortilla-patatas",
  "croquetas": "croquetas", "patatas bravas": "patatas-bravas",
  "gazpacho": "gazpacho", "churros con chocolate": "churros-chocolate",
};
const demoSeedPhoto: Record<string, keyof typeof photos> = {
  "bi-tinte": "tinte-coloracion", "bi-peinado": "peinado-secado",
};
const normalize = (title: string) => title.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();

export function catalogPhotoSource(item: Pick<BookableItem, "id" | "businessId" | "title" | "type" | "photoUri">): number | { uri: string } | undefined {
  const ownerDemo = item.businessId.startsWith("demo_business_");
  const bundledDemo = item.businessId.startsWith("demo_biz_") || item.businessId === "nemesi_molina";
  if (item.photoUri === "none") return undefined;
  if (isSharedCatalogPhotoReference(item.photoUri)) {
    const id = item.photoUri.slice(EXAMPLE_PREFIX.length);
    return photos[id as ExampleId]();
  }
  if (ownerDemo && item.photoUri?.startsWith("data:image/jpeg;base64,")) return { uri: item.photoUri };
  if (ownerDemo && item.photoUri?.startsWith("data:image/png;base64,")) return { uri: item.photoUri };
  if (item.photoUri) return undefined;
  if (!ownerDemo && !bundledDemo) return undefined;
  const photo = demoSeedPhoto[item.id] ?? (ownerDemo ? demoTitlePhoto[normalize(item.title)] : undefined);
  return photo ? photos[photo]() : undefined;
}
/** Compatibility for existing screens and stored DEMO references. */
export const demoCatalogPhotoSource = catalogPhotoSource;
