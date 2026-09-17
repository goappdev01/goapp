/**
 * Cuenta — verificación de empresa
 * Persiste el estado de verificación empresarial en AsyncStorage.
 * Arquitectura preparada para OCR automático futuro.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

const VERIFICATION_KEY = "go_verification_v1";

// ── Types ──────────────────────────────────────────────────────────────────────

export type VerificationStatus =
  | "none"      // sin solicitud
  | "pending"   // documentación enviada, en revisión
  | "verified"  // empresa verificada
  | "rejected"; // rechazada (con motivo)

export type VerifDocSlot = {
  name: string;
  type: string;
  uploadedAt: string;
};

export type CuentaVerification = {
  status: VerificationStatus;
  // Documento enviado (legacy — slot principal)
  documentName?: string;
  documentType?: string;
  submittedAt?: string;
  // Checklist de documentos por slot
  uploadedDocs?: Record<string, VerifDocSlot>;
  // Resolución
  verifiedAt?: string;
  rejectionReason?: string;
  // Campos listos para OCR futuro (pre-rellenados por IA)
  empresaNombre?: string;
  cifVat?: string;
  direccion?: string;
  pais?: string;
};

// ── Required doc slots ─────────────────────────────────────────────────────────

export type DocSlotDef = {
  id: string;
  label: string;
  sub: string;
  icon: string;
  required: boolean;
};

export const REQUIRED_DOC_SLOTS: DocSlotDef[] = [
  { id: "cif",       label: "CIF / NIF",                icon: "file-text",  sub: "Identificación fiscal de la empresa",     required: true  },
  { id: "identidad", label: "Identidad del responsable", icon: "user",       sub: "DNI, NIE o pasaporte del titular",         required: true  },
  { id: "direccion", label: "Dirección fiscal",           icon: "map-pin",    sub: "Contrato de alquiler o justificante",      required: true  },
  { id: "banco",     label: "Cuenta bancaria",            icon: "credit-card",sub: "IBAN o extracto bancario reciente",        required: false },
];

export const REQUIRED_COUNT = REQUIRED_DOC_SLOTS.filter(d => d.required).length;

// ── Storage ────────────────────────────────────────────────────────────────────

export const EMPTY_VERIFICATION: CuentaVerification = {
  status: "none",
};

export async function loadVerification(): Promise<CuentaVerification> {
  try {
    const raw = await AsyncStorage.getItem(VERIFICATION_KEY);
    return raw ? (JSON.parse(raw) as CuentaVerification) : EMPTY_VERIFICATION;
  } catch {
    return EMPTY_VERIFICATION;
  }
}

export async function saveVerification(v: CuentaVerification): Promise<void> {
  await AsyncStorage.setItem(VERIFICATION_KEY, JSON.stringify(v));
}

/** Submits a document to a specific slot. Sets status to "pending" if required slots filled. */
export async function submitDocumentSlot(
  slotId: string,
  documentName: string,
  documentType: string,
  current: CuentaVerification,
): Promise<CuentaVerification> {
  const uploadedDocs: Record<string, VerifDocSlot> = {
    ...(current.uploadedDocs ?? {}),
    [slotId]: { name: documentName, type: documentType, uploadedAt: new Date().toISOString() },
  };

  const requiredIds = REQUIRED_DOC_SLOTS.filter(d => d.required).map(d => d.id);
  const allRequiredDone = requiredIds.every(id => !!uploadedDocs[id]);

  const updated: CuentaVerification = {
    ...current,
    uploadedDocs,
    status: allRequiredDone ? "pending" : current.status === "none" ? "none" : current.status,
    submittedAt: allRequiredDone && !current.submittedAt ? new Date().toISOString() : current.submittedAt,
    // keep legacy field for the first required slot uploaded
    documentName: uploadedDocs["cif"]?.name ?? current.documentName,
    documentType: uploadedDocs["cif"]?.type ?? current.documentType,
  };
  await saveVerification(updated);
  return updated;
}

/** Submits document metadata → sets status to "pending" (legacy single-doc path). */
export async function submitVerificationDocument(
  documentName: string,
  documentType: string
): Promise<CuentaVerification> {
  const updated: CuentaVerification = {
    status: "pending",
    documentName,
    documentType,
    submittedAt: new Date().toISOString(),
  };
  await saveVerification(updated);
  return updated;
}

/** Resets verification state (e.g. after rejection or for testing). */
export async function resetVerification(): Promise<void> {
  await AsyncStorage.removeItem(VERIFICATION_KEY);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function verificationLabel(status: VerificationStatus): string {
  switch (status) {
    case "none":     return "Empresa Básica";
    case "pending":  return "En verificación";
    case "verified": return "Verificada";
    case "rejected": return "Rechazada";
  }
}

export function verificationColor(status: VerificationStatus): string {
  switch (status) {
    case "none":     return "#6B7280";
    case "pending":  return "#F59E0B";
    case "verified": return "#22C55E";
    case "rejected": return "#EF4444";
  }
}

/** Returns how many required slots have been uploaded. */
export function countUploadedRequired(v: CuentaVerification): number {
  if (!v.uploadedDocs) return 0;
  return REQUIRED_DOC_SLOTS.filter(d => d.required && !!v.uploadedDocs![d.id]).length;
}
