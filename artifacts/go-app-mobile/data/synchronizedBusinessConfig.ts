import type { BusinessConfig, DaySchedule, StaffScheduleConfig } from "@/contexts/GoBusinessConfigContext";
import { getAuthenticatedUserId, getCloudConfiguration, getOwnedBusinesses, getOwnedBookableItems,
  getOwnedStaff, getOwnedAvailabilityWindows, type AvailabilityWindow } from "./booking";
import { validateBusinessTimezone } from "./serviceTiming";
import { SECTORS } from "@/data/goSectorData";

/** Rehydrate the selected owner's existing records. Loading never synchronizes a
 * default/empty form back to the server, including after a partial read failure. */
export async function loadSynchronizedBusinessConfig(businessId: string, userId: string, defaults: BusinessConfig, settings?: BusinessConfig | null): Promise<BusinessConfig> {
  const [businesses, saved] = await Promise.all([getOwnedBusinesses(userId), settings === undefined ? getCloudConfiguration<BusinessConfig>(businessId, userId) : settings]);
  const business = businesses.find(row => row.id === businessId);
  if (!business) throw new Error("Esta empresa no está disponible para esta cuenta.");
  const timezone = validateBusinessTimezone(business.timezone);
  let config: BusinessConfig;
  if (saved) {
    if (typeof saved.businessName !== "string" || !Array.isArray(saved.services) || !Array.isArray(saved.plantillaItems)
      || !Array.isArray(saved.activeDays) || saved.activeDays.some(day => !Number.isInteger(day) || day < 0 || day > 6))
      throw new Error("La configuración recibida está incompleta. Reintenta antes de editar; los horarios y las reservas se conservan.");
    config = { ...defaults, ...saved, businessId, timezone };
  } else {
    const [items, staff, windows] = await Promise.all([getOwnedBookableItems(businessId, userId), getOwnedStaff(businessId, userId), getOwnedAvailabilityWindows(businessId, userId)]);
    if ([...items, ...staff, ...windows].some(row => row.businessId !== businessId)) throw new Error("La configuración recibida pertenece a otra empresa.");
    const schedules = (rows: AvailabilityWindow[]) => {
      const activeDays: number[] = [], daySchedules: Record<string, DaySchedule> = {};
      for (const row of rows.filter(row => row.active)) {
        const day = (row.weekday + 6) % 7, shift = row.shiftIndex ?? 0;
        if (row.bookableItemId || !Number.isInteger(row.weekday) || row.weekday < 0 || row.weekday > 6 || ![0, 1].includes(shift))
          throw new Error("Este horario necesita su configuración guardada antes de editarse. Los horarios existentes se conservan.");
        const key = shift === 0 ? "shift1" : "shift2";
        const schedule = daySchedules[String(day)] ?? { shift1: { from: "09:00", to: "20:00", active: false }, shift2: { from: "16:00", to: "20:00", active: false } };
        if (schedule[key].active) throw new Error("Hay varios horarios para el mismo turno. Recupera la configuración guardada antes de editar.");
        const time = (hour: number, minute = 0) => `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
        schedule[key] = { from: time(row.visibleStartHour, row.visibleStartMinute), to: time(row.visibleEndHour, row.visibleEndMinute), active: true };
        daySchedules[String(day)] = schedule;
        if (!activeDays.includes(day)) activeDays.push(day);
      }
      return { activeDays: activeDays.sort(), daySchedules };
    };
    const companyHours = schedules(windows.filter(row => !row.staffId));
    const staffSchedules: Record<string, StaffScheduleConfig> = {};
    for (const member of staff) {
      const own = windows.filter(row => row.staffId === member.id && row.active);
      const hours = schedules(own);
      staffSchedules[member.id] = { useCompanySchedule: !own.length, daySchedules: hours.daySchedules, gapPolicy: member.gapPolicy };
    }
    const sector = SECTORS.find(row => row.id === business.category || row.subs.some(sub => sub.id === business.category));
    const services = items.filter(row => row.catalogKind !== "product");
    config = { ...defaults, businessId, businessName: business.name, address: business.location,
      phone: business.phone, whatsapp: business.whatsapp, timezone, sectorId: sector?.id ?? null,
      subId: sector?.subs.find(sub => sub.id === business.category)?.id ?? null,
      ...companyHours, staffSchedules, bookingEnabled: business.bookingActive,
      bookingResources: business.bookingResources, bookingBlocks: business.bookingBlocks,
      catalogProducts: items.filter(row => row.catalogKind === "product"),
      services: services.map(row => ({ name: row.title, description: row.description, duration: row.durationMinutes, price: row.price,
        capacity: row.customerCapacity, timing: row.timing })),
      plantillaItems: staff.length ? [{ id: "synchronized-staff", label: "Profesionales", emoji: "", count: staff.length,
        staffIds: staff.map(row => row.id), staffNames: staff.map(row => row.name),
        staffServices: staff.map(row => services.filter(service => row.serviceIds?.includes(service.id)).map(service => service.title)) }] : [],
    };
  }
  if (await getAuthenticatedUserId() !== userId) throw new Error("La cuenta ha cambiado. Vuelve a cargar tu empresa.");
  return config;
}
