import { supabaseApiRequest, getAuthenticatedUserId, BookingApiError } from "./booking";
import { financialDocumentSchema, type FinancialDocument, type FinancialPlan } from "@workspace/api-zod";
const ROOT = "/supabase/admin/finance";
export type FinancialAccess = { canCreate: boolean; plans: { id: string; title: string; version: number; ownerUserId: string; canWrite: boolean }[] };
export type FinancialHistory = { version: number; actor_user_id: string; action: string; reason: string; details: Record<string, unknown>; created_at: string };
export type FinancialImportReceipt = { id: string; applied_version: number; reverted_version: number | null; created_at: string; summary: Record<string, unknown> };
export type FinancialPreview = { previewId: string; version: number; expiresInSeconds: number;
 preview: { rows: number; inserted: number; updated: number; unchanged: number; duplicates: number; errors: { row: number; message: string }[]; warnings: string[] };
 sample: FinancialDocument["markets"] };
export async function financialApi<T>(path: string, userId: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  try {
    const result = await supabaseApiRequest<T>(ROOT + path, { method, signal, cache: "no-store",
      ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/vnd.go.finance+json" } }),
    }, true, userId);
    if (await getAuthenticatedUserId() !== userId) throw new Error("FINANCE_SESSION_CHANGED");
    return result;
  } catch (error) {
    if (error instanceof BookingApiError) {
      if (error.status === 422) throw new Error("El archivo contiene datos incompatibles. Revísalo en la vista previa local antes de aplicar.");
      const safe:Record<number,string>={400:"Revisa los datos y referencias de la operación financiera.",401:"Inicia sesión de nuevo para acceder al plan.",403:"No tienes autorización expresa para este plan.",404:"El servicio financiero todavía no está disponible en este entorno.",409:"El plan ha cambiado. Recarga y revisa antes de guardar o revertir.",503:"La persistencia financiera todavía no está instalada en este entorno."};
      throw new Error(safe[error.status]||"No se pudo verificar la operación financiera. Inténtalo de nuevo.");
    }
    throw new Error("No se pudo verificar la operación financiera. Comprueba tu sesión y conexión antes de volver a intentarlo.");
  }
}
export function parseFinancialPlan(value: FinancialPlan): FinancialPlan {
  if (!value || typeof value.id !== "string" || typeof value.ownerUserId !== "string" || !Number.isSafeInteger(value.version) || value.version < 1 || typeof value.canWrite !== "boolean")
    throw new Error("No se pudo verificar la respuesta del plan financiero.");
  return { ...value, document: financialDocumentSchema.parse(value.document) };
}
