import { useEffect, useState } from "react";
import { getAuthenticatedUserId, isCloudId, supabaseApiRequest } from "./booking";
import { captureAuthIdentity, ensureAuthSession, getAuthApiBase, isAuthIdentityCurrent } from "@/lib/authSession";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";

// Existing public HTTPS service; a Metro or Tailscale address must never be printed.
export const COMMERCIAL_QR_ORIGIN = "https://goapp-api-production.up.railway.app";

type Resolution = { state: string; businessId?: string };
export type CommercialQrStatus =
  | { state: "unavailable" | "checking" | "not_published"; url: null }
  | { state: "published"; url: string };

export async function resolveCommercialCode(code: string): Promise<string | null> {
  if (!isCloudId(code) && !/^[0-9a-f]{64}$/i.test(code)) return null;
  try {
    const result = await supabaseApiRequest<Resolution>(`/commercial/resolve/${code}`);
    return result.state === "published" && isCloudId(result.businessId) ? result.businessId! : null;
  } catch { return null; }
}

export async function claimCommercialAcquisition(reference: string, expectedUserId: string): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/i.test(reference)) return false;
  try {
    if (await getAuthenticatedUserId() !== expectedUserId) return false;
    await supabaseApiRequest("/commercial/acquisition/claim", {
      method: "POST", body: JSON.stringify({ token: reference }),
    }, true, expectedUserId);
    return true;
  } catch { return false; }
}

export type PhysicalQrPreview = { inventoryId: string; state: string; canAssign: boolean; assignedHere: boolean };
export async function previewPhysicalQr(businessId: string, reference: string, userId: string): Promise<PhysicalQrPreview> {
  if (!isCloudId(businessId) || !/^(?:[0-9a-f]{64}|GO-\d{8,})$/i.test(reference)) throw Error("Código QR no válido");
  return supabaseApiRequest(`/commercial/businesses/${businessId}/physical/preview`, {
    method: "POST", body: JSON.stringify({ reference }),
  }, true, userId);
}
export async function assignPhysicalQr(businessId: string, reference: string, userId: string): Promise<PhysicalQrPreview> {
  if (!isCloudId(businessId) || !/^(?:[0-9a-f]{64}|GO-\d{8,})$/i.test(reference)) throw Error("Código QR no válido");
  return supabaseApiRequest(`/commercial/businesses/${businessId}/physical/assign`, {
    method: "POST", body: JSON.stringify({ reference }),
  }, true, userId);
}

export type CommercialQrBatch = {
  batchId: string; quantity: number; createdAt?: string;
  codes: { inventoryId: string; code: string; state?: string; businessId?: string | null }[];
};
export async function createCommercialQrBatch(quantity: number, requestId: string, userId: string): Promise<CommercialQrBatch> {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000 || !isCloudId(requestId)) throw Error("Cantidad o solicitud no válida");
  return supabaseApiRequest("/commercial/admin/batches", {
    method: "POST", body: JSON.stringify({ quantity, requestId }),
  }, true, userId);
}
export async function getCommercialQrBatch(batchId: string, userId: string): Promise<CommercialQrBatch> {
  if (!isCloudId(batchId)) throw Error("Lote no válido");
  return supabaseApiRequest(`/commercial/admin/batches/${batchId}`, {}, true, userId);
}
export async function authorizePhysicalQr(reference: string, businessId: string, reason: string, userId: string) {
  if (!isCloudId(businessId) || !/^(?:[0-9a-f]{64}|GO-\d{8,})$/i.test(reference)) throw Error("Código no válido");
  return supabaseApiRequest("/commercial/admin/physical/authorize", {
    method: "POST", body: JSON.stringify({ reference, businessId, reason }),
  }, true, userId);
}
export async function revokePhysicalQr(reference: string, reason: string, userId: string) {
  if (!/^(?:[0-9a-f]{64}|GO-\d{8,})$/i.test(reference)) throw Error("Código no válido");
  return supabaseApiRequest("/commercial/admin/physical/revoke", {
    method: "POST", body: JSON.stringify({ reference, reason }),
  }, true, userId);
}

export async function getCommercialSupplierUrl(): Promise<string | null> {
  try {
    const result = await supabaseApiRequest<{ url: string | null }>("/commercial/supplier");
    const parsed = new URL(result.url ?? "");
    return parsed.protocol === "https:" && !parsed.username && !parsed.password ? parsed.toString() : null;
  } catch { return null; }
}
export async function getAdminCommercialSupplier(userId: string): Promise<{ url: string; enabled: boolean }> {
  return supabaseApiRequest("/commercial/admin/supplier", {}, true, userId);
}
export async function setCommercialSupplierUrl(url: string, enabled: boolean, userId: string): Promise<void> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password) throw Error("URL no válida");
  await supabaseApiRequest("/commercial/admin/supplier", {
    method: "PUT", body: JSON.stringify({ url: parsed.toString(), enabled }),
  }, true, userId);
}

export async function shareCommercialPoster(kind: "business" | "batch", id: string, userId: string): Promise<void> {
  if (!isCloudId(id) || Platform.OS === "web" || !FileSystem.cacheDirectory || !await Sharing.isAvailableAsync())
    throw Error("No se puede compartir este cartel en el dispositivo.");
  const identity = await captureAuthIdentity();
  const session = await ensureAuthSession();
  if (!identity || identity.userId !== userId || session?.user.id !== userId) throw Error("Sesión no disponible");
  const path = kind === "business"
    ? `/commercial/businesses/${id}/poster.pdf`
    : `/commercial/admin/batches/${id}/poster.pdf`;
  const file = `${FileSystem.cacheDirectory}go-qr-${kind}-${id}.pdf`;
  try {
    const response = await FileSystem.downloadAsync(`${getAuthApiBase()}${path}`, file, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (response.status !== 200 || !/application\/pdf/i.test(String(response.headers?.["content-type"] ?? response.headers?.["Content-Type"] ?? ""))
      || !await isAuthIdentityCurrent(identity)) throw Error("El cartel no está disponible");
    await Sharing.shareAsync(response.uri, { mimeType: "application/pdf", UTI: "com.adobe.pdf" });
  } finally {
    await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {});
  }
}

export async function resolveCommercialBusinessLink(businessId: string): Promise<CommercialQrStatus> {
  if (!isCloudId(businessId)) return { state: "unavailable", url: null };
  try {
    const result = await supabaseApiRequest<Resolution>(`/commercial/resolve/${businessId}`);
    if (result.state !== "published" || result.businessId?.toLowerCase() !== businessId.toLowerCase()) {
      return { state: result.state === "not_published" ? "not_published" : "unavailable", url: null };
    }
    return { state: "published", url: `${COMMERCIAL_QR_ORIGIN}/api/commercial/b/${businessId.toLowerCase()}` };
  } catch {
    return { state: "unavailable", url: null };
  }
}

export function useCommercialBusinessLink(businessId: string | undefined, demo: boolean): CommercialQrStatus {
  const [status, setStatus] = useState<CommercialQrStatus>({ state: "checking", url: null });
  useEffect(() => {
    let current = true;
    if (demo || !businessId) { setStatus({ state: "unavailable", url: null }); return; }
    setStatus({ state: "checking", url: null });
    void resolveCommercialBusinessLink(businessId).then(result => { if (current) setStatus(result); });
    return () => { current = false; };
  }, [businessId, demo]);
  return status;
}
