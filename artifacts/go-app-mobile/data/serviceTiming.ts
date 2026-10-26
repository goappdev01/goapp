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
  /** Only an explicitly authorized wait frees the professional. */
  releaseProfessional?: boolean;
  /** Omitted means the professional selected for the appointment. */
  staffId?: string;
  resources: ServiceResourceRequirement[];
};
export type ServiceTiming = {
  version: 1;
  mode: "simple" | "phases";
  phases: ServicePhase[];
  resourcesConfigured: boolean;
  /** A saved configuration, never authorization to offer or confirm a booking. */
  configurationStatus?: "pending";
  professionalTimings?: Record<string, Omit<ServiceTiming, "professionalTimings"> & { durationMinutes: number }>;
};
export type ServiceTimingValidation = {
  /** Only the settings writer may preserve incomplete resource verification. */
  purpose?: "configuration";
  durationMinutes?: number;
  /** Internal recursion guard: an override cannot contain other overrides. */
  allowOverrides?: boolean;
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
  const configuration = options.purpose === "configuration";
  if (value.configurationStatus !== undefined && value.configurationStatus !== "pending") throw new Error("Estado de configuración no válido.");
  let pending = value.configurationStatus === "pending";
  if (pending && !configuration) throw new Error("Los tiempos todavía no están habilitados para reservas.");
  if (value.mode === "phases" && !value.resourcesConfigured) {
    if (!configuration) throw new Error("Declara los recursos de las fases, también si no necesitan ninguno.");
    pending = true;
  }
  const resources = options.resources && validateBookingResources(options.resources);
  const phaseIds = new Set<string>();
  const phases: ServicePhase[] = value.phases.map(raw => {
    if (!record(raw) || typeof raw.id !== "string" || !raw.id.trim() || raw.id.length > 128 || phaseIds.has(raw.id)
      || raw.name !== undefined && (typeof raw.name !== "string" || raw.name.trim().length > 120)
      || !positive(raw.durationMinutes, 1440) || raw.kind !== "work" && raw.kind !== "wait"
      || !Array.isArray(raw.resources) || raw.resources.length > 100)
      throw new Error("Cada fase necesita minutos enteros positivos y tipo de trabajo o espera.");
    if (raw.releaseProfessional !== undefined && typeof raw.releaseProfessional !== "boolean" || raw.kind === "work" && raw.releaseProfessional === true)
      throw new Error("Solo una espera autorizada puede liberar al profesional.");
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
      if (resources && (!configured || Number(requirement.quantity) > configured.capacity)) {
        if (!configuration) throw new Error("El recurso no está activo o su cantidad supera la capacidad configurada.");
        pending = true;
      }
      if (!value.resourcesConfigured) {
        if (!configuration) throw new Error("Confirma la declaración de recursos del servicio.");
        pending = true;
      }
      return { resourceId: requirement.resourceId, quantity: requirement.quantity,
        occupancy: requirement.occupancy } as ServiceResourceRequirement;
    });
    return { id: raw.id, name: typeof raw.name === "string" ? raw.name.trim() : "", durationMinutes: raw.durationMinutes, kind: raw.kind,
      ...(raw.kind === "wait" ? { releaseProfessional: raw.releaseProfessional === true } : {}),
      ...(raw.staffId ? { staffId: raw.staffId as string } : {}), resources: requirements };
  });
  if (value.mode === "simple" && (phases.length !== 1 || phases[0].kind !== "work"))
    throw new Error("Un servicio simple tiene una sola fase de trabajo.");
  if (!phases.some(phase => phase.kind === "work" || phase.releaseProfessional !== true))
    throw new Error("El servicio necesita al menos una fase que ocupe al profesional.");
  const duration = serviceTimingDuration({ phases });
  if (duration > 1440 || options.durationMinutes !== undefined && options.durationMinutes !== duration)
    throw new Error("La duración del servicio debe coincidir con la suma exacta de sus fases.");
  let professionalTimings: ServiceTiming["professionalTimings"];
  if (value.professionalTimings !== undefined) {
    if (options.allowOverrides === false || !record(value.professionalTimings) || Object.keys(value.professionalTimings).length > 100)
      throw new Error("Revisa los tiempos de cada profesional.");
    professionalTimings = {};
    for (const [staffId, override] of Object.entries(value.professionalTimings)) {
      if (!isStableBookingId(staffId) || options.staffIds && !options.staffIds.includes(staffId) || !record(override) || !positive(override.durationMinutes,1440))
        throw new Error("Los tiempos propios necesitan un profesional activo y una duración válida.");
      const checked = validateServiceTiming(override,{...options,durationMinutes:override.durationMinutes,allowOverrides:false});
      professionalTimings[staffId] = {...checked,durationMinutes:override.durationMinutes};
      if (checked.configurationStatus === "pending") pending = true;
    }
  }
  return { version: 1, mode: value.mode as ServiceTiming["mode"], phases, resourcesConfigured: value.resourcesConfigured,
    ...(pending ? {configurationStatus: "pending" as const} : {}),
    ...(professionalTimings && Object.keys(professionalTimings).length ? {professionalTimings} : {}) };
}

export const serviceTimingDuration = (timing: Pick<ServiceTiming, "phases">): number =>
  timing.phases.reduce((total, phase) => total + phase.durationMinutes, 0);

export type ServiceConfiguration = { name: string; description?: string; duration: number; price: number; capacity?: number; timing?: ServiceTiming };
/** Preserve the configured duration; a mismatch must be corrected explicitly. */
export function serializeServiceConfiguration(services: readonly ServiceConfiguration[], options: Omit<ServiceTimingValidation, "durationMinutes"> = {}): ServiceConfiguration[] {
  return services.filter(service => service.name.trim()).map(({ name, description, duration, price, capacity, timing }) => {
    const checked = timing && validateServiceTiming(timing, {...options,durationMinutes:duration,purpose:"configuration"});
    if (!checked && (!Number.isInteger(duration) || duration <= 0))
      throw new Error("Indica una duración en minutos enteros positivos.");
    return { name, duration, price, capacity,
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

/** Configuration totals only; admission still belongs to the canonical server. */
export function serviceTimingTotals(phases: readonly ServicePhase[]) {
 const total=phases.reduce((sum,p)=>sum+p.durationMinutes,0),work=phases.filter(p=>p.kind==="work").reduce((sum,p)=>sum+p.durationMinutes,0);
 const wait=total-work,released=phases.filter(p=>p.kind==="wait"&&p.releaseProfessional===true).reduce((sum,p)=>sum+p.durationMinutes,0);
 return {total,work,wait,released,occupied:total-released};
}

/** Pending settings stay out of all booking/catalogue publication paths. */
export function isServiceTimingPending(timing: ServiceTiming | undefined): boolean {
  return timing?.configurationStatus === "pending" || Object.values(timing?.professionalTimings ?? {}).some(value => value.configurationStatus === "pending");
}
