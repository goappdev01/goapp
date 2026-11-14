import { captureAuthIdentity, isAuthIdentityCurrent } from "@/lib/authSession";
import { BookingApiError, isCloudId, supabaseApiRequest } from "./booking";

export type BusinessVerificationStatus = "sin_empresa" | "pendiente_verificacion" | "rechazada" | "verificada" | "trial_expirada";
export type BusinessTrial = {
  status: "documents_pending" | "pending_review" | "needs_changes" | "rejected" | "approved";
  accepted_at: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  review_notes?: string | null;
};
export type BusinessDocument = { id: string; kind: string; file_name: string; mime_type: string; byte_size: number };
export type BusinessEnrollment = {
  legal_name: string;
  tax_id: string;
  trading_name: string;
  address: string;
};
export type OwnedBusinessAccess = {
  id: string;
  name: string;
  address?: string | null;
  verified?: boolean;
  trial?: BusinessTrial | null;
  documents?: BusinessDocument[];
  verification_request?: Partial<BusinessEnrollment> & { status?: "pending" | "rejected"; rejection_reason?: string | null };
};
export type BusinessAccessSnapshot = {
  userId: string | null;
  business: OwnedBusinessAccess | null;
  status: BusinessVerificationStatus;
};

// Neither roles, demos nor local verification metadata authorize GO Empresa.
export function resolveBusinessAccess(rows: OwnedBusinessAccess[], userId: string): BusinessAccessSnapshot {
  const business = rows.find(row => row.verified === true) ?? rows[0] ?? null;
  return {
    userId,
    business,
    status: !business ? "sin_empresa" : business.verified === true
      ? business.trial && (!business.trial.trial_ends_at || Date.parse(business.trial.trial_ends_at) <= Date.now()) ? "trial_expirada" : "verificada"
      : business.verification_request?.status === "rejected" ? "rechazada" : "pendiente_verificacion",
  };
}

export async function getBusinessAccess(): Promise<BusinessAccessSnapshot> {
  const identity = await captureAuthIdentity();
  const userId = identity?.userId;
  if (!identity || !userId) return { userId: null, business: null, status: "sin_empresa" };
  const rows = await supabaseApiRequest<OwnedBusinessAccess[]>("/supabase/manage/businesses", {}, true, userId);
  if (!await isAuthIdentityCurrent(identity)) {
    throw new Error("La sesión ha cambiado. Vuelve a comprobar tu empresa.");
  }
  if (!Array.isArray(rows) || rows.some(row => !row || !isCloudId(row.id))) {
    throw new Error("No se pudo comprobar la verificación de tu empresa.");
  }
  return resolveBusinessAccess(rows, userId);
}

export async function submitBusinessEnrollment(data: BusinessEnrollment, businessId?: string): Promise<OwnedBusinessAccess> {
  const identity = await captureAuthIdentity();
  const userId = identity?.userId;
  if (!identity || !userId) throw new Error("Inicia sesión para solicitar el alta de tu empresa.");
  const rows = await supabaseApiRequest<OwnedBusinessAccess[]>("/supabase/manage/enrollment", {
    method: "POST",
    body: JSON.stringify({ legal_name: data.legal_name, tax_id: data.tax_id,
      trading_name: data.trading_name, address: data.address, ...(businessId ? { business_id: businessId } : {}) }),
  }, true, userId);
  // A 2xx/HTML/empty response is not confirmation that the request was stored.
  if (!Array.isArray(rows) || rows.length !== 1 || !rows[0] || !isCloudId(rows[0].id)
    || rows[0].verified !== false || (businessId && rows[0].id !== businessId)) {
    throw new BookingApiError("Invalid enrollment acknowledgement", 502, "ENROLLMENT_NOT_CONFIRMED");
  }
  if (!await isAuthIdentityCurrent(identity)) {
    throw new BookingApiError("Enrollment session changed", 401, "ENROLLMENT_SESSION_CHANGED");
  }
  return rows[0];
}

export async function acceptBusinessTrial(): Promise<OwnedBusinessAccess> {
  const identity = await captureAuthIdentity();
  if (!identity?.userId) throw new Error("Inicia sesión.");
  const rows = await supabaseApiRequest<OwnedBusinessAccess[]>("/supabase/manage/trial/accept", {
    method: "POST", body: JSON.stringify({ terms_version: "go-trial-v1" }),
  }, true, identity.userId);
  if (!Array.isArray(rows) || rows.length !== 1 || !isCloudId(rows[0]?.id) || rows[0].verified !== false
    || !await isAuthIdentityCurrent(identity)) throw new Error("No pudimos confirmar la prueba gratuita.");
  return rows[0];
}

export async function uploadBusinessDocument(businessId: string, data: {
  kind: string; name: string; mime_type: string; content_base64: string;
}): Promise<void> {
  const identity = await captureAuthIdentity();
  if (!identity?.userId || !isCloudId(businessId)) throw new Error("Sesión o empresa inválida.");
  const rows = await supabaseApiRequest<BusinessDocument[]>("/supabase/manage/trial/documents", {
    method: "POST", body: JSON.stringify({ business_id: businessId, ...data }),
  }, true, identity.userId);
  if (!Array.isArray(rows) || rows.length !== 1 || !isCloudId(rows[0]?.id)
    || !await isAuthIdentityCurrent(identity)) throw new Error("No se confirmó el archivo privado.");
}

export async function getTrialCapabilities(): Promise<boolean> {
  const identity = await captureAuthIdentity();
  if (!identity?.userId) throw new Error("Inicia sesión.");
  const payload = await supabaseApiRequest<{ enabled: boolean }>("/supabase/manage/trial/capabilities", {}, true, identity.userId);
  if (typeof payload?.enabled !== "boolean" || !await isAuthIdentityCurrent(identity)) throw new Error("No se pudo comprobar el alta de empresas.");
  return payload.enabled;
}
