/**
 * PREPARATION ONLY: no production gateway or calendar consumer is registered.
 * Server transactions remain the only authority for availability and permissions.
 * Do not wire this to local FloorReservation/ManualBlock storage or to the owner
 * as a substitute customer. See docs/business-direct-readiness.md at repo root.
 */
import { validateCalendarDate } from "./calendarExceptions";
import { isStableBookingId, validateBusinessTimezone } from "./serviceTiming";

export type DirectService = { id: string; name: string; durationMinutes: number; staffIds?: readonly string[] };
export type DirectProfessional = { id: string; name: string };
export type DirectEntryDraft = {
  kind: "booking" | "block";
  dateISO: string;
  startTime: string;
  endTime: string;
  durationMinutes: string;
  customerName: string;
  phone: string;
  notes: string;
  serviceId: string;
  concept: string;
  staffId: string;
};
export type DirectEntryContext = {
  businessId: string;
  timezone: string;
  services: readonly DirectService[];
  professionals: readonly DirectProfessional[];
  requireProfessional: boolean;
  /** A UI hint supplied from the server, never an authorization grant. */
  allowDurationOverride: boolean;
  allowConcept: boolean;
};
export type DirectEntryCommand = {
  businessId: string;
  timezone: string;
  dateISO: string;
  startTime: string;
  durationMinutes: number;
  staffId: string | null;
} & ({ kind: "booking"; source: "phone" | "walk_in"; customerName: string; phone: string | null;
       notes: string | null; serviceId: string | null; concept: string | null }
  | { kind: "block"; endTime: string; reason: string });
export type DirectEntryReceipt = { id: string; businessId: string; requestId: string; kind: "booking" | "block" };

/** Contract port, deliberately NOT an implementation or a network endpoint. */
export type DirectEntryGateway = {
  currentIdentity: () => Promise<string | null>;
  /** Must use server ownership/employee checks and the SAME transactional engine. */
  commit: (command: DirectEntryCommand, requestId: string) => Promise<DirectEntryReceipt>;
};

function minute(value: string): number {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw new Error("Indica una hora válida de 00:00 a 23:59.");
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3));
}
const text = (value: string, max: number, label: string, required = false) => {
  const result = value.trim();
  if ((required && !result) || result.length > max) throw new Error(`Revisa ${label}.`);
  return result;
};

export function newDirectEntry(dateISO: string, startTime: string, staffId = ""): DirectEntryDraft {
  validateCalendarDate(dateISO); minute(startTime);
  return { kind: "booking", dateISO, startTime, endTime: "", durationMinutes: "", customerName: "", phone: "", notes: "", serviceId: "", concept: "", staffId };
}

export function selectDirectService(draft: DirectEntryDraft, service: DirectService): DirectEntryDraft {
  if (!isStableBookingId(service.id) || !Number.isInteger(service.durationMinutes) || service.durationMinutes < 1 || service.durationMinutes > 1440)
    throw new Error("El servicio todavía no tiene una duración válida.");
  return { ...draft, serviceId: service.id, durationMinutes: String(service.durationMinutes),
    staffId: service.staffIds && !service.staffIds.includes(draft.staffId) ? "" : draft.staffId };
}

export function buildDirectEntry(context: DirectEntryContext, draft: DirectEntryDraft, source: "phone" | "walk_in" = "phone"): DirectEntryCommand {
  if (!isStableBookingId(context.businessId)) throw new Error("Selecciona una empresa sincronizada.");
  const timezone = validateBusinessTimezone(context.timezone);
  const dateISO = validateCalendarDate(draft.dateISO), start = minute(draft.startTime);
  if (draft.staffId && !context.professionals.some(person => person.id === draft.staffId)
    || context.requireProfessional && !draft.staffId) throw new Error("Selecciona un profesional de esta empresa.");
  const base = { businessId: context.businessId, timezone, dateISO, startTime: draft.startTime, staffId: draft.staffId || null };
  if (draft.kind === "block") {
    const end = draft.endTime === "24:00" ? 1440 : minute(draft.endTime);
    if (end <= start) throw new Error("El final del bloqueo debe ser posterior al inicio.");
    return { ...base, kind: "block", durationMinutes: end - start, endTime: draft.endTime,
      reason: text(draft.concept, 120, "el motivo del bloqueo", true) };
  }
  if (draft.kind !== "booking" || !["phone", "walk_in"].includes(source)) throw new Error("Tipo de cita no válido.");
  const service = context.services.find(value => value.id === draft.serviceId);
  if (draft.serviceId && !service || !service && !context.allowConcept) throw new Error("Selecciona un servicio de esta empresa.");
  if (service?.staffIds && (!draft.staffId || !service.staffIds.includes(draft.staffId))) throw new Error("El profesional no realiza este servicio.");
  if (!/^\d{1,4}$/.test(draft.durationMinutes)) throw new Error("Indica una duración entera en minutos.");
  const durationMinutes = Number(draft.durationMinutes);
  if (durationMinutes < 1 || durationMinutes > 1440 || start + durationMinutes > 1440) throw new Error("Revisa la duración de la cita.");
  if (service && !context.allowDurationOverride && durationMinutes !== service.durationMinutes) throw new Error("Este servicio conserva su duración configurada.");
  return { ...base, kind: "booking", source, durationMinutes,
    customerName: text(draft.customerName, 120, "el nombre del cliente", true),
    phone: text(draft.phone, 40, "el teléfono") || null, notes: text(draft.notes, 4000, "las observaciones") || null,
    serviceId: service?.id ?? null, concept: service ? null : text(draft.concept, 120, "el concepto", true) };
}

/** Single-flight and retry identity only; does not confirm or calculate availability. */
export function createDirectEntryCommitter<C extends { businessId: string; kind: "booking" | "block" } = DirectEntryCommand,
  R extends DirectEntryReceipt = DirectEntryReceipt>(gateway: { currentIdentity: () => Promise<string | null>; commit: (command: C, requestId: string) => Promise<R> } | null,
  nextRequestId: () => string, validateReceipt: (command: C, receipt: R) => void = () => {}) {
  let pending: { signature: string; promise: Promise<R> } | null = null;
  const operations = new Map<string, { requestId: string; receipt?: R }>();
  return function commit(command: C): Promise<R> {
    // Capture an immutable value before the async boundary; callers may keep editing.
    const snapshot: C = JSON.parse(JSON.stringify(command));
    const signature = JSON.stringify(snapshot);
    if (pending) return pending.signature === signature ? pending.promise : Promise.reject(new Error("Espera a comprobar la operación anterior."));
    const promise = (async () => {
      if (!gateway) throw new Error("Las citas directas requieren activar el contrato revisado del servidor. No se ha guardado ningún cambio.");
      const identity = await gateway.currentIdentity();
      if (!identity) throw new Error("Inicia sesión para gestionar tu empresa.");
      const key = identity + "\n" + signature;
      let operation = operations.get(key);
      if (!operation) {
        const requestId = nextRequestId();
        if (!/^[A-Za-z0-9_-]{1,128}$/.test(requestId)) throw new Error("Referencia de operación no válida.");
        operation = { requestId }; operations.set(key, operation);
      }
      if (operation.receipt) return operation.receipt;
      const receipt = await gateway.commit(snapshot, operation.requestId);
      if (identity !== await gateway.currentIdentity()) throw new Error("La sesión ha cambiado. Vuelve a consultar la agenda de tu cuenta.");
      if (!receipt || !isStableBookingId(receipt.id) || receipt.businessId !== snapshot.businessId
        || receipt.requestId !== operation.requestId || receipt.kind !== snapshot.kind) throw new Error("No se pudo confirmar el resultado. Reintenta sin cambiar los datos.");
      validateReceipt(snapshot, receipt);
      operation.receipt = receipt;
      return receipt;
    })();
    const flight = { signature, promise }; pending = flight;
    void promise.finally(() => { if (pending === flight) pending = null; }).catch(() => {});
    return promise;
  };
}
