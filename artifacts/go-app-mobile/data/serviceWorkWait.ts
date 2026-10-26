import { validateServiceTiming, type BookingResource, type ServiceConfiguration, type ServicePhase } from "./serviceTiming";

/** Presentation adapter only. Booking admission and occupation stay in the existing engine. */
export type ServiceWorkWaitDraft = [string, string, string];
type Service = Pick<ServiceConfiguration, "duration" | "timing">;

function partsFor(service: Service): [ServicePhase | undefined, ServicePhase | undefined, ServicePhase | undefined] | null {
  const parts: [ServicePhase | undefined, ServicePhase | undefined, ServicePhase | undefined] = [undefined, undefined, undefined];
  if (!service.timing) return parts;
  for (const phase of service.timing.phases) {
    if (phase.kind === "wait") {
      if (parts[1] || parts[2]) return null;
      parts[1] = phase;
    } else if (!parts[0] && !parts[1]) parts[0] = phase;
    else if (!parts[2]) parts[2] = phase;
    else return null;
  }
  return parts;
}

export function readServiceWorkWait(service: Service): { editable: boolean; values: ServiceWorkWaitDraft } {
  const parts = partsFor(service);
  if (!parts) return { editable: false, values: ["", "", ""] };
  return { editable: true, values: parts.map((part, index) => String(part?.durationMinutes ?? (!service.timing && index === 0 ? service.duration : 0))) as ServiceWorkWaitDraft };
}

export function serviceWorkWaitTotal(values: ServiceWorkWaitDraft): number | null {
  if (values.some(value => value !== "" && !/^\d+$/.test(value))) return null;
  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  return Number.isSafeInteger(total) ? total : null;
}

/** Convert the three fields back to the same persisted configuration, retaining bindings and consent. */
export function updateServiceWorkWait(service: Service, values: ServiceWorkWaitDraft, resources: readonly BookingResource[], newId: () => string): Service {
  const parts = partsFor(service);
  if (!parts) throw new Error("La configuración guardada se conserva; no puede reducirse a estos tres tiempos.");
  const total = serviceWorkWaitTotal(values);
  if (total === null || total < 1 || total > 1440) throw new Error("Indica minutos enteros. El total debe estar entre 1 y 1440 min.");
  const minutes = values.map(value => Number(value || 0));
  const phases: ServicePhase[] = [];
  minutes.forEach((durationMinutes, index) => {
    const previous = parts[index];
    if (!durationMinutes) {
      if (previous?.staffId || previous?.resources.length) throw new Error("Este tiempo tiene un profesional o recursos guardados y debe conservar sus minutos.");
      return;
    }
    phases.push({ ...previous, id: previous?.id ?? newId(), name: previous?.name ?? "", kind: index === 1 ? "wait" : "work", durationMinutes,
      resources: previous?.resources.map(resource => ({ ...resource })) ?? [],
      ...(index === 1 ? { releaseProfessional: previous?.releaseProfessional === true } : {}) });
  });
  const mode = phases.length === 1 && phases[0].kind === "work" ? "simple" : "phases";
  if (!service.timing && mode === "simple") return { duration: total, timing: undefined };
  try {
    const timing = validateServiceTiming({ ...service.timing, configurationStatus: undefined, version: 1, mode, resourcesConfigured: service.timing?.resourcesConfigured ?? false, phases }, { durationMinutes: total, resources, purpose: "configuration" });
    return { duration: total, timing };
  } catch { throw new Error("Revisa los minutos y los recursos guardados de este servicio."); }
}
