/** Configuration contract only. Availability and resource allocation belong to the server. */
export type BookingResource = { id: string; name: string; capacity: number; active?: boolean };
export type BookingBlock = { startsAt: string; endsAt: string };
export type ServiceResourceRequirement = {
  resourceId: string;
  quantity: number;
  occupancy: "phase" | "booking";
};
export type ServicePhase = {
  id: string;
  name: string;
  durationMinutes: number;
  kind: "work" | "wait";
  /** Omitted means the professional selected for the appointment. */
  staffId?: string;
  resources: ServiceResourceRequirement[];
};
export type ServiceTiming = {
  version: 1;
  mode: "simple" | "phases";
  phases: ServicePhase[];
  resourcesConfigured: boolean;
};
export type ServiceTimingValidation = {
  durationMinutes?: number;
  staffIds?: readonly string[];
  resources?: readonly BookingResource[];
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isStableBookingId = (value: unknown): value is string => typeof value === "string" && uuid.test(value);
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const positive = (value: unknown, maximum: number): value is number => Number.isInteger(value) && Number(value) > 0 && Number(value) <= maximum;

export function validateBookingResources(value: unknown): BookingResource[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error("Revisa los recursos del negocio.");
  const seen = new Set<string>();
  return value.map(resource => {
    if (!record(resource) || !isStableBookingId(resource.id) || seen.has(resource.id.toLowerCase())
      || typeof resource.name !== "string" || !resource.name.trim() || resource.name.trim().length > 120
      || !positive(resource.capacity, 1000) || resource.active !== undefined && typeof resource.active !== "boolean")
      throw new Error("Cada recurso necesita identidad estable, nombre y capacidad entera positiva.");
    seen.add(resource.id.toLowerCase());
    return { id: resource.id, name: resource.name.trim(), capacity: resource.capacity,
      ...(resource.active !== undefined ? { active: resource.active } : {}) };
  });
}

/** Validate and copy metadata without deriving availability or inventing resources. */
export function validateServiceTiming(value: unknown, options: ServiceTimingValidation = {}): ServiceTiming {
  if (!record(value) || value.version !== 1 || !["simple", "phases"].includes(String(value.mode))
    || typeof value.resourcesConfigured !== "boolean" || !Array.isArray(value.phases) || !value.phases.length || value.phases.length > 32)
    throw new Error("Revisa la distribución del tiempo del servicio.");
  if (value.mode === "phases" && !value.resourcesConfigured)
    throw new Error("Declara los recursos de las fases, también si no necesitan ninguno.");
  const resources = options.resources && validateBookingResources(options.resources);
  const phaseIds = new Set<string>();
  const phases: ServicePhase[] = value.phases.map(raw => {
    if (!record(raw) || typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 128 || phaseIds.has(raw.id)
      || typeof raw.name !== "string" || !raw.name.trim() || raw.name.trim().length > 120
      || !positive(raw.durationMinutes, 1440) || raw.kind !== "work" && raw.kind !== "wait"
      || !Array.isArray(raw.resources) || raw.resources.length > 100)
      throw new Error("Cada fase necesita nombre, minutos enteros positivos y tipo de trabajo o espera.");
    phaseIds.add(raw.id);
    if (raw.staffId !== undefined && (!isStableBookingId(raw.staffId) || options.staffIds && !options.staffIds.includes(raw.staffId)))
      throw new Error("Selecciona un profesional activo del negocio para la fase.");
    const used = new Set<string>();
    const requirements = raw.resources.map(requirement => {
      if (!record(requirement) || !isStableBookingId(requirement.resourceId) || used.has(requirement.resourceId.toLowerCase())
        || !positive(requirement.quantity, 1000) || requirement.occupancy !== "phase" && requirement.occupancy !== "booking")
        throw new Error("Revisa la cantidad y ocupación de los recursos de cada fase.");
      used.add(requirement.resourceId.toLowerCase());
      const configured = resources?.find(resource => resource.id === requirement.resourceId && resource.active !== false);
      if (resources && (!configured || Number(requirement.quantity) > configured.capacity))
        throw new Error("El recurso no está activo o su cantidad supera la capacidad configurada.");
      if (!value.resourcesConfigured) throw new Error("Confirma la declaración de recursos del servicio.");
      return { resourceId: requirement.resourceId, quantity: requirement.quantity,
        occupancy: requirement.occupancy } as ServiceResourceRequirement;
    });
    return { id: raw.id, name: raw.name.trim(), durationMinutes: raw.durationMinutes, kind: raw.kind,
      ...(raw.staffId ? { staffId: raw.staffId as string } : {}), resources: requirements };
  });
  if (value.mode === "simple" && (phases.length !== 1 || phases[0].kind !== "work"))
    throw new Error("Un servicio simple tiene una sola fase de trabajo.");
  const duration = serviceTimingDuration({ phases });
  if (duration > 1440 || options.durationMinutes !== undefined && options.durationMinutes !== duration)
    throw new Error("La duración del servicio debe coincidir con la suma exacta de sus fases.");
  return { version: 1, mode: value.mode as ServiceTiming["mode"], phases, resourcesConfigured: value.resourcesConfigured };
}

export const serviceTimingDuration = (timing: Pick<ServiceTiming, "phases">): number =>
  timing.phases.reduce((total, phase) => total + phase.durationMinutes, 0);

export type ServiceConfiguration = { name: string; description?: string; duration: number; price: number; capacity?: number; timing?: ServiceTiming };
/** Keep timing in the existing service save path; phases define the scalar total. */
export function serializeServiceConfiguration(services: readonly ServiceConfiguration[], options: Omit<ServiceTimingValidation, "durationMinutes"> = {}): ServiceConfiguration[] {
  return services.filter(service => service.name.trim()).map(({ name, description, duration, price, capacity, timing }) => {
    const checked = timing && validateServiceTiming(timing, options);
    if (!checked && (!Number.isInteger(duration) || duration <= 0))
      throw new Error("Indica una duración en minutos enteros positivos.");
    return { name, duration: checked ? serviceTimingDuration(checked) : duration, price, capacity,
      ...(description?.trim() ? { description: description.trim() } : {}),
      ...(checked ? { timing: checked } : {}) };
  });
}

export function validateBusinessTimezone(value: string): string {
  const timezone = value.trim();
  if (!timezone) throw new Error("Indica la zona horaria del negocio, por ejemplo Europe/Madrid.");
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0); }
  catch { throw new Error("La zona horaria del negocio no es válida."); }
  return timezone;
}

/** Wall-clock configuration, independent of any device date, UTC offset or DST epoch. */
export function validateScheduleRange(from: string, to: string): {
  startHour: number; startMinute: number; endHour: number; endMinute: number; endNextDay: boolean;
} {
  const valid = (value: string) => typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
  if (!valid(from) || !valid(to)) throw new Error("Indica horas válidas entre 00:00 y 23:59.");
  if (from === to) throw new Error("La apertura y el cierre deben ser distintos. Un cierre anterior termina al día siguiente.");
  return { startHour: Number(from.slice(0, 2)), startMinute: Number(from.slice(3, 5)),
    endHour: Number(to.slice(0, 2)), endMinute: Number(to.slice(3, 5)), endNextDay: to < from };
}

export type BookingGapPolicy = { allowLastMinuteGaps: boolean; lastMinuteMinutes: number };
export function validateBookingGapPolicy(value: unknown): BookingGapPolicy {
  if(!record(value) || typeof value.allowLastMinuteGaps!=="boolean" || !positive(value.lastMinuteMinutes,525600))
    throw new Error("Indica un intervalo de excepción en minutos enteros, entre 1 y 525600.");
  return {allowLastMinuteGaps:value.allowLastMinuteGaps,lastMinuteMinutes:value.lastMinuteMinutes};
}
