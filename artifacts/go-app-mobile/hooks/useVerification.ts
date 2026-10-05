import { type CuentaVerification } from "@/data/cuenta";
import { useBusinessAccess } from "@/contexts/GoBusinessAccessContext";

/**
 * Reflects server authority. Local document uploads never grant permissions.
 */
export function useVerification(): CuentaVerification {
  const access = useBusinessAccess();
  return { status: access.allowed ? "verified" : access.snapshot?.status === "rechazada" ? "rejected"
    : access.snapshot?.business ? "pending" : "none" };
}
