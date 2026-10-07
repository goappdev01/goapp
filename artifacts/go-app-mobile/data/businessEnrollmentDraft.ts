import AsyncStorage from "@react-native-async-storage/async-storage";
import type { BusinessEnrollment } from "./businessAccess";

// Form fields only: a draft never represents permission or a session.
const writes = new Map<string, Promise<unknown>>();
export function businessEnrollmentDraftKey(userId: string, businessId?: string): string {
  return `go_business_enrollment_draft_v1:${userId}:${businessId ?? "new"}`;
}
function ordered<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const result = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
  writes.set(key, result);
  void result.finally(() => { if (writes.get(key) === result) writes.delete(key); }).catch(() => undefined);
  return result;
}
export function saveBusinessEnrollmentDraft(key: string, data: BusinessEnrollment): Promise<void> {
  const value = JSON.stringify({ legal_name: data.legal_name, tax_id: data.tax_id,
    trading_name: data.trading_name, address: data.address });
  return ordered(key, () => AsyncStorage.setItem(key, value));
}
export function loadBusinessEnrollmentDraft(key: string): Promise<BusinessEnrollment | null> {
  return ordered(key, async () => {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || ["legal_name", "tax_id", "trading_name", "address"].some(field => typeof value[field] !== "string")) {
      throw new Error("Invalid business enrollment draft");
    }
    return { legal_name: value.legal_name, tax_id: value.tax_id,
      trading_name: value.trading_name, address: value.address };
  });
}
export function clearBusinessEnrollmentDraft(key: string, submitted: BusinessEnrollment): Promise<void> {
  const expected = JSON.stringify({ legal_name: submitted.legal_name, tax_id: submitted.tax_id,
    trading_name: submitted.trading_name, address: submitted.address });
  return ordered(key, async () => {
    // A resumed screen may have newer edits while the submission was in flight.
    if (await AsyncStorage.getItem(key) === expected) await AsyncStorage.removeItem(key);
  });
}
export function logBusinessEnrollmentFailure(stage: string, cause: unknown): void {
  const error = cause as { name?: string; status?: number; code?: string } | null;
  console.warn("[business-enrollment]", { stage, name: error?.name, status: error?.status, code: error?.code });
}
