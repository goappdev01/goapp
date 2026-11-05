import { captureAuthIdentity, isAuthIdentityCurrent } from "@/lib/authSession";
import { BookingApiError, isCloudId, supabaseApiRequest } from "./booking";

export type DossierState = "draft" | "documents_pending" | "pending" | "correction" | "rejected" | "authorized" | "suspended" | "revoked";
export const dossierStateLabels: Record<DossierState, string> = {
  draft: "Registro iniciado", documents_pending: "Documentación pendiente", pending: "En revisión",
  correction: "Requiere corrección", rejected: "Rechazada", authorized: "Autorizada", suspended: "Suspendida", revoked: "Revocada",
};
export type DocumentRequirement = { key: string; label: string; required: boolean };
export type RequirementPolicy = { activity: string; version: number; documents: DocumentRequirement[] };
export type BusinessDocument = { id: string; requirement_key: string; file_name: string; mime_type: string; byte_size: number;
  status: "uploading" | "provided" | "accepted" | "rejected" | "superseded"; rejection_reason?: string | null };
export type BusinessDossier = { business_id: string; name: string; verified: boolean; legal_name: string; tax_id: string;
  trading_name: string; address: string; activity: string; revision: number; status: DossierState; rejection_reason?: string | null;
  requirements: DocumentRequirement[] | null; documents: BusinessDocument[];
  history: { id: number; actor_id: string | null; operation: string; from_status: string; to_status: string; reason: string | null; created_at: string }[] };
export type VerificationCommand = { operation: "draft" | "submit" | "reserve_document" | "complete_document" | "decide" | "review_document" | "requirements";
  requestId: string; businessId?: string; expectedRevision?: number; data?: unknown; reason?: string; status?: DossierState };
const prefix = "/supabase/business-verification";
export class VerificationRequestError extends Error {
  constructor(message: string, public status?: number) { super(message); }
}
export async function verificationRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const identity = await captureAuthIdentity();
  if (!identity) throw new Error("Inicia sesión para consultar tu expediente.");
  let result: T;
  try { result = await supabaseApiRequest<T>(prefix + path, init, true, identity.userId); }
  catch (issue) {
    if (!await isAuthIdentityCurrent(identity)) throw new Error("La sesión ha cambiado. Vuelve a abrir el expediente.");
    if (issue instanceof BookingApiError && issue.status === 409) throw new VerificationRequestError("El expediente ha cambiado. Actualiza y vuelve a intentarlo.", 409);
    if (issue instanceof BookingApiError && issue.status === 403) throw new VerificationRequestError("No tienes permiso para esta operación.", 403);
    if (issue instanceof BookingApiError && issue.status === 400) throw new VerificationRequestError("Revisa los datos y la documentación pendiente.", 400);
    throw new VerificationRequestError("No se pudo completar la operación. Tus datos se han conservado. Vuelve a intentarlo.");
  }
  if (!await isAuthIdentityCurrent(identity)) throw new Error("La sesión ha cambiado. Vuelve a abrir el expediente.");
  return result;
}
function validDossier(value: unknown): value is BusinessDossier {
  const dossier = value as Partial<BusinessDossier> | null;
  return !!dossier && isCloudId(dossier.business_id) && Number.isInteger(dossier.revision)
    && typeof dossier.verified === "boolean" && typeof dossier.status === "string" && dossier.status in dossierStateLabels
    && [dossier.name, dossier.legal_name, dossier.tax_id, dossier.trading_name, dossier.address, dossier.activity].every(field => typeof field === "string")
    && Array.isArray(dossier.documents) && Array.isArray(dossier.history);
}
export async function getBusinessDossiers(admin = false): Promise<BusinessDossier[]> {
  const rows = await verificationRequest<unknown>(admin ? "/admin/dossiers" : "/dossiers");
  if (!Array.isArray(rows) || !rows.every(validDossier)) throw new Error("El servidor no confirmó los expedientes.");
  return rows;
}
export const getVerificationRequirements = () => verificationRequest<RequirementPolicy[]>("/requirements");
export async function executeVerification(command: VerificationCommand) {
  const result = await verificationRequest<{ dossier: BusinessDossier; documentId?: string; activity?: string }>("/command", {
    method: "POST", body: JSON.stringify(command),
  });
  if (command.operation === "requirements") {
    if (!result || result.activity !== (command.data as { activity?: string })?.activity) throw new Error("El servidor no confirmó los requisitos.");
  } else if (!validDossier(result?.dossier) || command.businessId && result.dossier.business_id !== command.businessId
    || command.operation === "reserve_document" && !isCloudId(result.documentId)) {
    throw new Error("El servidor no confirmó la operación. Conserva el borrador para reintentar.");
  }
  return result;
}
export async function uploadBusinessDocument(id: string, bytes: Uint8Array) {
  return verificationRequest(`/documents/${encodeURIComponent(id)}/content`, {
    method: "PUT", headers: { "Content-Type": "application/octet-stream" }, body: bytes as unknown as BodyInit,
  });
}
export async function businessDocumentLink(id: string) {
  return verificationRequest<{ url: string; expiresIn: number }>(`/documents/${encodeURIComponent(id)}/link`);
}
