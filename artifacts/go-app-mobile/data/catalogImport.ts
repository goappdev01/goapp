import { getAuthenticatedUserId, isCloudId, supabaseApiRequest } from "./booking";

export type CatalogImportCandidate = { name: string; price: number | null; duration: number | null; description: string };
export type CatalogImportService = { name: string; price: number; duration: number; capacity: 1; description: string };

async function identity(businessId: string): Promise<string> {
  if (!isCloudId(businessId)) throw new Error("Selecciona una empresa real para importar.");
  const user = await getAuthenticatedUserId();
  if (!user) throw new Error("Inicia sesión para importar al catálogo de tu empresa.");
  return user;
}

export async function extractPublicCatalog(businessId: string, url: string): Promise<CatalogImportCandidate[]> {
  const user = await identity(businessId);
  const result = await supabaseApiRequest<{ ok: boolean; services: CatalogImportCandidate[] }>(
    `/supabase/manage/businesses/${businessId}/catalog-import/extract`,
    { method: "POST", body: JSON.stringify({ source: "url", url }) }, true, user);
  if (result?.ok !== true || !Array.isArray(result.services)) throw new Error("No se pudo comprobar la extracción del catálogo.");
  return result.services;
}

export async function confirmCatalogImport(businessId: string, services: CatalogImportService[]): Promise<{ imported: number; services: CatalogImportService[] }> {
  const user = await identity(businessId);
  const result = await supabaseApiRequest<{ imported: number; services: CatalogImportService[] }>(
    `/supabase/manage/businesses/${businessId}/catalog-import/confirm`,
    { method: "POST", body: JSON.stringify({ services }) }, true, user);
  if (!Number.isInteger(result?.imported) || !Array.isArray(result?.services)) throw new Error("No se confirmó la importación. Comprueba el catálogo antes de repetirla.");
  return result;
}
