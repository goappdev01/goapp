import { supabaseApiRequest, type BookableItem } from "./booking";
export type AssociationMode = "included" | "optional" | "required";
export type CatalogAssociation = { id: string; business_id: string; source_id: string; target_id: string; mode: AssociationMode; active: boolean; revision: number };
export type CatalogLine = { itemId: string; name: string; kind: "service" | "product"; durationMinutes: number; quantity: number; unitPrice: number; charge: number; included: boolean; currency: string };
export type CatalogOption = { associationId: string; sourceId: string; itemId: string; name: string; kind: "service" | "product"; price: number; currency: string; mode: AssociationMode; selected: boolean };
export type CatalogQuote = { version: 1; businessId: string; rootIds: string[]; selectedAssociationIds: string[]; serviceIds: string[]; ready: boolean;
  lines: CatalogLine[]; options: CatalogOption[]; missingRequired: string[]; totalPrice: number; currency: string };
export async function manageAssociations<T = CatalogAssociation[]>(businessId: string, operation: "list" | "create" | "update" | "delete", input: object = {}): Promise<T> {
  return supabaseApiRequest<T>("/supabase/catalog/associations", { method: "POST", body: JSON.stringify({ businessId, operation, input }) }, true);
}
export async function quoteCatalog(businessId: string, rootIds: string[], selectedIds: string[] = []): Promise<CatalogQuote> {
  const quote = await supabaseApiRequest<CatalogQuote>("/supabase/catalog/quote", { method: "POST", body: JSON.stringify({ businessId, rootIds, selectedIds }) }, true);
  if (quote.version !== 1 || quote.businessId !== businessId || !Array.isArray(quote.lines) || !Array.isArray(quote.options)
    || JSON.stringify(quote.rootIds) !== JSON.stringify(rootIds) || !Number.isFinite(quote.totalPrice)) throw Error("Respuesta de catálogo no válida.");
  return quote;
}
export function catalogBookingServices(quote: CatalogQuote): { id: string; title: string; durationMinutes: number; price: number; currency: string }[] {
  return quote.lines.filter(line => line.kind === "service").map(line => ({ id: line.itemId, title: line.name, durationMinutes: line.durationMinutes, price: line.charge, currency: line.currency }));
}
// Removing a parent must also discard unreachable choices, never reselect them later.
export function toggleCatalogOption(quote: CatalogQuote, associationId: string): string[] {
  const selected = new Set(quote.selectedAssociationIds);
  if (selected.has(associationId)) selected.delete(associationId); else selected.add(associationId);
  const reachable = new Set(quote.rootIds);
  let changed = true;
  while (changed) { changed = false; for (const option of quote.options) if (reachable.has(option.sourceId) && (option.mode === "included" || selected.has(option.associationId)) && !reachable.has(option.itemId)) { reachable.add(option.itemId); changed = true; } }
  return [...selected].filter(id => quote.options.some(option => option.associationId === id && reachable.has(option.sourceId)));
}
export const isCatalogService = (item: BookableItem) => item.catalogKind !== "product";
