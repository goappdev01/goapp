import AsyncStorage from "@react-native-async-storage/async-storage";
import { BookingApiError, getAuthenticatedUserId, isCloudId, supabaseApiRequest } from "./booking";

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

// Neither roles, demos nor local verification metadata authorize GO Empresa.
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

export async function submitBusinessEnrollment(data: BusinessEnrollment, businessId?: string): Promise<OwnedBusinessAccess> {
  const userId = await getAuthenticatedUserId();
  if (!userId) throw new Error("Inicia sesión para solicitar el alta de tu empresa.");
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
  if (await getAuthenticatedUserId() !== userId) {
    throw new BookingApiError("Enrollment session changed", 401, "ENROLLMENT_SESSION_CHANGED");
  }
  return rows[0];
}
