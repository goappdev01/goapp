import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuthenticatedUserId, isCloudId, supabaseApiRequest } from "./booking";

export type BusinessVerificationStatus = "sin_empresa" | "pendiente_verificacion" | "rechazada" | "verificada";
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
  verification_request?: Partial<BusinessEnrollment> & { status?: "pending" | "rejected"; rejection_reason?: string | null };
};
export type BusinessAccessSnapshot = {
  userId: string | null;
  business: OwnedBusinessAccess | null;
  status: BusinessVerificationStatus;
};

// Called only with the authenticated owner's server response. Neither roles,
// demo businesses nor local verification metadata can authorize GO Empresa.
export function resolveBusinessAccess(rows: OwnedBusinessAccess[], userId: string): BusinessAccessSnapshot {
  const business = rows.find(row => row.verified === true) ?? rows[0] ?? null;
  return {
    userId,
    business,
    status: !business ? "sin_empresa" : business.verified === true ? "verificada"
      : business.verification_request?.status === "rejected" ? "rechazada" : "pendiente_verificacion",
  };
}

export async function getBusinessAccess(): Promise<BusinessAccessSnapshot> {
  const sessionBefore = await AsyncStorage.getItem("go_supabase_session_v1");
  const userId = await getAuthenticatedUserId();
  if (!userId) return { userId: null, business: null, status: "sin_empresa" };
  const rows = await supabaseApiRequest<OwnedBusinessAccess[]>("/supabase/manage/businesses", {}, true, userId);
  if (await AsyncStorage.getItem("go_supabase_session_v1") !== sessionBefore) {
    throw new Error("La sesión ha cambiado. Vuelve a comprobar tu empresa.");
  }
  if (!Array.isArray(rows) || rows.some(row => !row || !isCloudId(row.id))) {
    throw new Error("No se pudo comprobar la verificación de tu empresa.");
  }
  return resolveBusinessAccess(rows, userId);
}

export async function submitBusinessEnrollment(data: BusinessEnrollment, businessId?: string): Promise<void> {
  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Inicia sesión para solicitar el alta de tu empresa.");
  await supabaseApiRequest("/supabase/manage/enrollment", {
    method: "POST",
    body: JSON.stringify({ ...data, ...(businessId ? { business_id: businessId } : {}) }),
  }, true, userId);
}
