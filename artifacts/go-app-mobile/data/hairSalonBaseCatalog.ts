/** Starting point for a new hair salon. Existing businesses are never migrated to it. */
export const HAIR_SALON_BASE_CATALOG = [
  { name: "Corte caballero", category: "Cortes", duration: 30, price: 15, photoId: "corte-caballero" },
  { name: "Corte señora", category: "Cortes", duration: 45, price: 0, photoId: "corte-senora" },
  { name: "Corte infantil", category: "Cortes", duration: 25, price: 0, photoId: "corte-infantil" },
  { name: "Lavado", category: "Lavado y peinado", duration: 15, price: 8, photoId: "lavado" },
  { name: "Peinado y secado", category: "Lavado y peinado", duration: 30, price: 20, photoId: "peinado-secado" },
  { name: "Tinte / coloración", category: "Color", duration: 90, price: 45, photoId: "tinte-coloracion" },
  { name: "Mechas", category: "Color", duration: 120, price: 0, photoId: "mechas" },
  { name: "Tratamiento capilar", category: "Tratamientos", duration: 45, price: 30, photoId: "tratamiento-capilar" },
  { name: "Ampolla / mascarilla", category: "Tratamientos", duration: 15, price: 0, photoId: "ampolla-mascarilla" },
  { name: "Alisado", category: "Alisados", duration: 120, price: 0, photoId: "alisado" },
  { name: "Plancha", category: "Alisados", duration: 30, price: 0, photoId: "alisado-plancha" },
  { name: "Rizos / ondas", category: "Lavado y peinado", duration: 30, price: 0, photoId: "rizos-ondas" },
  { name: "Arreglo de barba", category: "Barbería", duration: 15, price: 0, photoId: "arreglo-barba" },
  { name: "Corte + barba", category: "Barbería", duration: 45, price: 0, photoId: "corte-barba" },
] as const;

export const hairSalonBaseServices = () => HAIR_SALON_BASE_CATALOG.map(({ photoId, ...service }) => ({
  ...service, capacity: 1, photoUri: `demo-catalog:${photoId}`,
}));
