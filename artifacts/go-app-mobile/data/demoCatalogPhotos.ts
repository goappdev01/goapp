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
} as const;

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

export function demoCatalogPhotoSource(item: Pick<BookableItem, "id" | "businessId" | "title" | "type" | "photoUri">): number | { uri: string } | undefined {
  const ownerDemo = item.businessId.startsWith("demo_business_");
  const bundledDemo = item.businessId.startsWith("demo_biz_") || item.businessId === "nemesi_molina";
  if (!ownerDemo && !bundledDemo) return undefined;
  if (item.photoUri === "none") return undefined;
  if (ownerDemo && item.photoUri?.startsWith("data:image/jpeg;base64,")) return { uri: item.photoUri };
  if (ownerDemo && item.photoUri?.startsWith("data:image/png;base64,")) return { uri: item.photoUri };
  if (item.photoUri) return undefined;
  const photo = demoSeedPhoto[item.id] ?? (ownerDemo ? demoTitlePhoto[normalize(item.title)] : undefined);
  return photo ? photos[photo]() : undefined;
}
