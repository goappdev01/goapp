import AsyncStorage from "@react-native-async-storage/async-storage";
import { expandSearchTerms, normalize } from "./goSearchAliases";

// ── Types ──────────────────────────────────────────────────────────────────────

export type BookingStatus =
  | "FREE"
  | "HOLD"
  | "CONFIRMED"
  | "ACCEPTED"
  | "CANCELLED"
  | "REJECTED"
  | "EXPIRED"
  | "COMPLETED"
  | "BLOCKED";

export type Business = {
  id: string;
  name: string;
  category: string;
  location: string;
  phone: string;
  whatsapp?: string;
  bookingActive: boolean;
  bookingColor: string; // hex color for external calendar border
  timezone: string;
  createdAt: string;
  cancellationPolicy?: CancellationPolicy;
};

export type BookableItem = {
  id: string;
  businessId: string;
  title: string;
  type: string;
  durationMinutes: number;
  customerCapacity: number; // how many people per unit
  unitQuantity: number; // how many identical units exist
  price: number;
  paymentRequired: boolean;
  active: boolean;
  visible: boolean;
};

export type AvailabilityWindow = {
  id: string;
  businessId: string;
  bookableItemId?: string; // undefined = applies to all items of this business
  staffId?: string;        // undefined = business-level; set = applies to specific staff member
  weekday: number; // 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat
  shiftIndex?: number;     // 0 = first shift, 1 = second shift (defaults 0)
  visibleStartHour: number; // 0-23
  visibleStartMinute?: number; // 0-59, defaults 0
  visibleEndHour: number; // 0-23
  visibleEndMinute?: number; // 0-59, defaults 0
  active: boolean;
};

export type Booking = {
  id: string;
  businessId: string;
  bookableItemId: string;
  customerId: string;
  staffId?: string;      // ID del profesional asignado; undefined = sin preferencia / "cualquiera"
  startDatetime: string; // ISO
  endDatetime: string; // ISO
  unitsReserved: number;
  peopleCount: number;
  status: BookingStatus;
  holdExpiresAt?: string; // ISO — only for HOLD status
  paymentStatus: "none" | "pending" | "paid";
  goEntryId?: string; // linked GO entry id
  slotKey?: string;   // clave única: businessId|staffId|date|startTime|endTime
  notes?: string;
};

/**
 * Genera una clave única e inmutable para un slot de reserva.
 *
 * Formato: "businessId|staffId_normalizado|yyyy-mm-dd|HH:MM|HH:MM"
 *
 * - staffId undefined → "any"
 * - staffId siempre en minúsculas para evitar sensibilidad a mayúsculas
 *
 * Esta clave es la PRIMERA barrera contra duplicados: si dos bookings tienen
 * la misma slotKey, son el mismo slot y solo uno puede existir en CONFIRMED/HOLD.
 */
export function getBookingSlotKey(booking: {
  businessId: string;
  staffId?: string;
  startDatetime: string; // ISO: "2026-06-21T09:00:00"
  endDatetime: string;   // ISO: "2026-06-21T10:00:00"
}): string {
  const date      = booking.startDatetime.slice(0, 10);  // "2026-06-21"
  const startTime = booking.startDatetime.slice(11, 16); // "09:00"
  const endTime   = booking.endDatetime.slice(11, 16);   // "10:00"
  const staffPart = booking.staffId ? booking.staffId.toLowerCase() : "any";
  return `${booking.businessId}|${staffPart}|${date}|${startTime}|${endTime}`;
}

// ── Cancellation Policy ────────────────────────────────────────────────────────

export type CancellationRefundType =
  | "free"       // always free cancellation (100% refund)
  | "full"       // full refund, no free window
  | "half"       // 50% refund
  | "partial"    // custom % refund
  | "fixed_fee"  // keep a fixed fee, refund the rest
  | "none";      // no refund at all

export type CancellationPolicy = {
  paymentRequired: boolean; // false = no upfront payment; true = payment collected at booking
  refundType: CancellationRefundType;
  refundPercent?: number;   // 0-100, used when refundType = "partial"
  fixedFee?: number;        // € kept as fee, used when refundType = "fixed_fee"
  freeUntilHours: number;   // 0 = never free; ≥1 = free if cancelled ≥N h before start
  autoRefund: boolean;      // true = automatic processing
  label?: string;           // human-readable label e.g. "Cancelación gratuita 24h"
};

export const DEFAULT_CANCELLATION_POLICY: CancellationPolicy = {
  paymentRequired: false,
  refundType: "free",
  freeUntilHours: 24,
  autoRefund: true,
};

export type ManualBlock = {
  id: string;
  businessId: string;
  bookableItemId?: string; // undefined = blocks all items
  blockStartDatetime: string; // ISO
  blockEndDatetime: string; // ISO
  reason?: string;
  blockType: "vacation" | "maintenance" | "break" | "closed" | "custom";
  active: boolean;
};

export type AvailableSlot = {
  startDatetime: string; // ISO
  endDatetime: string; // ISO
  availableUnits: number;
  totalUnits: number;
};

export type Staff = {
  id: string;
  businessId: string;
  name: string;
  emoji?: string;
  /** IDs de BookableItem que este profesional puede realizar (vacío = todos) */
  serviceIds?: string[];
  active: boolean;
};

// ── Storage keys ───────────────────────────────────────────────────────────────

const KEY_BUSINESSES = "go_businesses_v1";
const KEY_BOOKABLE_ITEMS = "go_bookable_items_v1";
const KEY_AVAILABILITY_WINDOWS = "go_availability_windows_v1";
const KEY_BOOKINGS = "go_bookings_v1";
const KEY_MANUAL_BLOCKS = "go_manual_blocks_v1";
const KEY_STAFF = "go_staff_v1";
const KEY_SUPABASE_SESSION = "go_supabase_session_v1";

type StoredSupabaseSession = {
  access_token?: string;
  user?: { id?: string };
};

export class BookingApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BookingApiError";
    this.status = status;
    this.code = code;
  }
}

export class BookingAuthenticationError extends BookingApiError {
  constructor() {
    super("Inicia sesión para confirmar una reserva.", 401, "AUTH_REQUIRED");
    this.name = "BookingAuthenticationError";
  }
}

async function getStoredSession(): Promise<StoredSupabaseSession | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY_SUPABASE_SESSION);
    return raw ? (JSON.parse(raw) as StoredSupabaseSession) : null;
  } catch {
    return null;
  }
}

export async function getAuthenticatedUserId(): Promise<string | null> {
  const session = await getStoredSession();
  return session?.user?.id ?? null;
}

function getApiBase(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL.replace(/\/$/, "");
  return process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api`
    : "/api";
}

async function performSupabaseRequest<T>(
  path: string,
  init: RequestInit = {},
  requireToken = false,
  session: StoredSupabaseSession | null = null,
): Promise<T> {
  const token = session?.access_token;
  if (requireToken && !token) throw new BookingAuthenticationError();

  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body !== undefined && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const response = await fetch(`${getApiBase()}${path}`, { ...init, headers });
  const body = await response.text();
  let payload: unknown = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    payload = body;
  }
  if (!response.ok) {
    const errorBody = payload && typeof payload === "object"
      ? payload as { error?: unknown; message?: unknown; code?: unknown }
      : {};
    throw new BookingApiError(
      String(errorBody.message ?? errorBody.error ?? "No se pudo completar la operación de reservas."),
      response.status,
      errorBody.code ? String(errorBody.code) : undefined,
    );
  }
  return payload as T;
}

let managementWrites: Promise<unknown> = Promise.resolve();
async function supabaseApiRequest<T>(path: string, init: RequestInit = {}, requireToken = false, expectedUserId?: string): Promise<T> {
  const session = await getStoredSession();
  if (expectedUserId && session?.user?.id !== expectedUserId) throw new BookingAuthenticationError();
  const run = () => performSupabaseRequest<T>(path, init, requireToken, session);
  if (path.startsWith("/supabase/manage") && init.method && init.method !== "GET") {
    const result = managementWrites.then(run, run);
    managementWrites = result.catch(() => undefined);
    return result;
  }
  return run();
}

type RemoteBusiness = {
  ui_metadata?: Partial<Business>;
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  timezone?: string | null;
  booking_enabled?: boolean;
  verified?: boolean;
  created_at?: string;
};

type RemoteService = {
  ui_metadata?: Partial<BookableItem> & { archived?: boolean };
  id: string;
  business_id: string;
  name: string;
  description?: string | null;
  duration_minutes: number;
  price?: number | string | null;
  active?: boolean;
};

type RemoteBooking = {
  id: string;
  business_id: string;
  service_id: string;
  staff_id?: string | null;
  customer_id: string;
  starts_at: string;
  ends_at: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  notes?: string | null;
};

function mapRemoteBusiness(row: RemoteBusiness): Business {
  return {
    id: row.id,
    name: row.name,
    category: row.ui_metadata?.category ?? row.description ?? "",
    location: row.address ?? "",
    phone: row.ui_metadata?.phone ?? "",
    whatsapp: row.ui_metadata?.whatsapp,
    cancellationPolicy: row.ui_metadata?.cancellationPolicy,
    bookingActive: row.booking_enabled !== false,
    bookingColor: row.ui_metadata?.bookingColor ?? "#4A80BD",
    timezone: row.timezone ?? "UTC",
    createdAt: row.created_at ?? new Date(0).toISOString(),
  };
}

function mapRemoteService(row: RemoteService): BookableItem {
  return {
    id: row.id,
    businessId: row.business_id,
    title: row.name,
    type: row.ui_metadata?.type ?? "service",
    durationMinutes: row.duration_minutes,
    customerCapacity: row.ui_metadata?.customerCapacity ?? 1,
    unitQuantity: row.ui_metadata?.unitQuantity ?? 1,
    price: Number(row.price ?? 0),
    paymentRequired: row.ui_metadata?.paymentRequired ?? false,
    active: row.active !== false,
    visible: row.ui_metadata?.visible ?? row.active !== false,
  };
}

function mapRemoteBooking(row: RemoteBooking): Booking {
  const status: BookingStatus = row.status === "PENDING"
    ? "HOLD"
    : row.status === "NO_SHOW"
      ? "CANCELLED"
      : row.status;
  return {
    id: row.id,
    businessId: row.business_id,
    bookableItemId: row.service_id,
    customerId: row.customer_id,
    staffId: row.staff_id ?? undefined,
    startDatetime: row.starts_at,
    endDatetime: row.ends_at,
    unitsReserved: 1,
    peopleCount: 1,
    status,
    paymentStatus: "none",
    notes: row.notes ?? undefined,
    slotKey: getBookingSlotKey({
      businessId: row.business_id,
      staffId: row.staff_id ?? undefined,
      startDatetime: row.starts_at,
      endDatetime: row.ends_at,
    }),
  };
}

function remoteBookingPayload(candidate: Omit<Booking, "id"> & { id?: string }, customerId: string) {
  return {
    business_id: candidate.businessId,
    service_id: candidate.bookableItemId,
    staff_id: candidate.staffId ?? null,
    customer_id: customerId,
    starts_at: candidate.startDatetime,
    ends_at: candidate.endDatetime,
    status: candidate.status === "HOLD" ? "PENDING" : "CONFIRMED",
    notes: candidate.notes ?? null,
  };
}

async function createRemoteBooking(candidate: Omit<Booking, "id"> & { id?: string }): Promise<Booking> {
  const session = await getStoredSession();
  const customerId = session?.user?.id;
  if (!session?.access_token || !customerId) throw new BookingAuthenticationError();
  const payload = await supabaseApiRequest<RemoteBooking[] | RemoteBooking>(
    "/supabase/bookings",
    {
      method: "POST",
      body: JSON.stringify(remoteBookingPayload(candidate, customerId)),
    },
    true,
  );
  const row = Array.isArray(payload) ? payload[0] : payload;
  if (!row?.id) throw new BookingApiError("Supabase devolvió una reserva inválida.", 502);
  return mapRemoteBooking(row);
}

// ── Generic helpers ────────────────────────────────────────────────────────────

async function loadAll<T>(key: string): Promise<T[]> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

async function saveAll<T>(key: string, data: T[]): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(data));
}

function uid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

// Remote configuration is authoritative. Demo records keep their local IDs.
export const isCloudId = (id?: string): boolean => !!id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
const parents = new Map<string, string>();
function remember<T extends { id: string; businessId: string }>(rows: T[]): T[] {
  for (const row of rows) parents.set(row.id, row.businessId);
  return rows;
}
const management = "/supabase/manage";
function firstRow<T extends { id: string }>(rows: T[]): T {
  if (!rows[0]?.id) throw new BookingApiError("No se pudo guardar el registro.", 502);
  return rows[0];
}
export async function getOwnedBusinesses(): Promise<Business[]> {
  const rows = await supabaseApiRequest<RemoteBusiness[]>(`${management}/businesses`, {}, true);
  return rows.map(mapRemoteBusiness);
}
function businessBody(b: Omit<Business, "id" | "createdAt">) {
  return { name: b.name.trim(), address: b.location, timezone: b.timezone, booking_enabled: b.bookingActive,
    ui_metadata: { category: b.category, phone: b.phone, whatsapp: b.whatsapp, bookingColor: b.bookingColor, cancellationPolicy: b.cancellationPolicy } };
}
export async function createOwnedBusiness(data: Omit<Business, "id" | "createdAt">, expectedUserId?: string): Promise<Business> {
  const rows = await supabaseApiRequest<RemoteBusiness[]>(`${management}/businesses`, { method: "POST", body: JSON.stringify(businessBody(data)) }, true, expectedUserId);
  return mapRemoteBusiness(firstRow(rows));
}
export async function getCloudConfiguration<T>(): Promise<T | null> {
  const rows = await supabaseApiRequest<{ business_id: string; payload: T }[]>(`${management}/configuration`, {}, true);
  return rows[0] ? { ...rows[0].payload, businessId: rows[0].business_id } : null;
}
export async function saveCloudConfiguration(businessId: string, payload: unknown): Promise<void> {
  await supabaseApiRequest(`${management}/businesses/${businessId}/configuration`, { method: "PUT", body: JSON.stringify({ payload }) }, true);
}
function serviceBody(item: Omit<BookableItem, "id">) {
  return { name: item.title, duration_minutes: item.durationMinutes, price: item.price, currency: "EUR", active: item.active,
    ui_metadata: { type: item.type, customerCapacity: item.customerCapacity, unitQuantity: item.unitQuantity, paymentRequired: item.paymentRequired, visible: item.visible } };
}
type RemoteStaff = { id: string; business_id: string; display_name: string; active: boolean; ui_metadata?: Partial<Staff> & { archived?: boolean } };
const mapStaff = (r: RemoteStaff): Staff => ({ id: r.id, businessId: r.business_id, name: r.display_name, active: r.active, emoji: r.ui_metadata?.emoji, serviceIds: r.ui_metadata?.serviceIds });
type RemoteWindow = { id: string; business_id: string; staff_id: string | null; weekday: number; start_time: string; end_time: string; active: boolean; ui_metadata?: Partial<AvailabilityWindow> & { archived?: boolean } };
const mapWindow = (r: RemoteWindow): AvailabilityWindow => ({ id: r.id, businessId: r.business_id, staffId: r.staff_id ?? undefined, weekday: r.weekday, visibleStartHour: Number(r.start_time.slice(0, 2)), visibleStartMinute: Number(r.start_time.slice(3, 5)), visibleEndHour: Number(r.end_time.slice(0, 2)), visibleEndMinute: Number(r.end_time.slice(3, 5)), active: r.active, shiftIndex: r.ui_metadata?.shiftIndex ?? 0, bookableItemId: r.ui_metadata?.bookableItemId });
function windowBody(w: Omit<AvailabilityWindow, "id">) {
  const time = (h: number, m = 0) => `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  return { staff_id: w.staffId ?? null, weekday: w.weekday, start_time: time(w.visibleStartHour, w.visibleStartMinute), end_time: time(w.visibleEndHour, w.visibleEndMinute), active: w.active, ui_metadata: { shiftIndex: w.shiftIndex ?? 0, bookableItemId: w.bookableItemId } };
}
export async function getOwnedBookableItems(businessId: string): Promise<BookableItem[]> {
  const rows = await supabaseApiRequest<RemoteService[]>(`${management}/businesses/${businessId}/services`, {}, true);
  return remember(rows.filter(row => !row.ui_metadata?.archived).map(mapRemoteService));
}
export async function getOwnedStaff(businessId: string): Promise<Staff[]> {
  const rows = await supabaseApiRequest<RemoteStaff[]>(`${management}/businesses/${businessId}/staff`, {}, true);
  return remember(rows.filter(row => !row.ui_metadata?.archived).map(mapStaff));
}
export async function getOwnedAvailabilityWindows(businessId: string): Promise<AvailabilityWindow[]> {
  const rows = await supabaseApiRequest<RemoteWindow[]>(`${management}/businesses/${businessId}/availability`, {}, true);
  return remember(rows.filter(row => !row.ui_metadata?.archived).map(mapWindow));
}
async function deactivateRemote(resource: string, id: string, businessId?: string): Promise<void> {
  const parent = businessId ?? parents.get(id);
  if (!parent) throw new BookingApiError("Vuelve a cargar el negocio antes de eliminar este registro.", 400);
  const rows = await supabaseApiRequest<{ id: string; ui_metadata?: Record<string, unknown> }[]>(`${management}/businesses/${parent}/${resource}`, {}, true);
  const row = rows.find(r => r.id === id);
  if (!row) throw new BookingApiError("Registro no encontrado.", 404);
  await supabaseApiRequest(`${management}/businesses/${parent}/${resource}/${id}`, { method: "PATCH", body: JSON.stringify({ active: false, ui_metadata: { ...row.ui_metadata, archived: true } }) }, true);
}

// ── Businesses ─────────────────────────────────────────────────────────────────

export async function getBusinesses(): Promise<Business[]> {
  const local = await loadAll<Business>(KEY_BUSINESSES);
  try {
    const remote = await supabaseApiRequest<RemoteBusiness[]>("/supabase/businesses");
    if (remote.length > 0) return remote.map(mapRemoteBusiness);
  } catch (error) {
    console.warn("[booking] No se pudieron cargar negocios remotos:", error);
  }
  return local;
}

export async function getActivebusinesses(): Promise<Business[]> {
  const all = await getBusinesses();
  // Treat undefined/null bookingActive as active (legacy records may not have the field set)
  return all.filter((b) => b.bookingActive !== false);
}

export async function saveBusiness(b: Business): Promise<void> {
  if (isCloudId(b.id)) {
    await supabaseApiRequest(`${management}/businesses/${b.id}`, { method: "PATCH", body: JSON.stringify(businessBody(b)) }, true);
    return;
  }
  const all = await getBusinesses();
  const idx = all.findIndex((x) => x.id === b.id);
  if (idx >= 0) all[idx] = b;
  else all.push(b);
  await saveAll(KEY_BUSINESSES, all);
}

export async function createBusiness(
  data: Omit<Business, "id" | "createdAt">
): Promise<Business> {
  const b: Business = { ...data, id: uid(), createdAt: new Date().toISOString() };
  const all = await getBusinesses();
  all.push(b);
  await saveAll(KEY_BUSINESSES, all);
  return b;
}

export async function deleteBusiness(id: string): Promise<void> {
  if (isCloudId(id)) {
    await supabaseApiRequest(`${management}/businesses/${id}`, { method: "PATCH", body: JSON.stringify({ booking_enabled: false }) }, true); return;
  }
  const all = await getBusinesses();
  await saveAll(KEY_BUSINESSES, all.filter((b) => b.id !== id));
}

export async function searchBusinesses(query: string): Promise<Business[]> {
  const all = await getActivebusinesses();
  if (!query.trim()) return all;

  // Expandir con alias: "pizza" → ["pizza", "restaurante", "restauración", ...]
  const terms = expandSearchTerms(query);

  // Comprobar si algún campo del negocio contiene alguno de los términos
  const matchesBusiness = (b: Business) =>
    terms.some(
      (t) =>
        normalize(b.name).includes(t) ||
        normalize(b.category).includes(t) ||
        normalize(b.location).includes(t)
    );

  // Hacer lo mismo con los ítems reservables (servicios)
  const allItems = await getBookableItems();
  const itemMatchIds = new Set(
    allItems
      .filter((item) =>
        terms.some(
          (t) =>
            normalize(item.title).includes(t) ||
            normalize(item.type).includes(t)
        )
      )
      .map((item) => item.businessId)
  );

  return all.filter((b) => matchesBusiness(b) || itemMatchIds.has(b.id));
}

// ── Bookable items ─────────────────────────────────────────────────────────────

export async function getBookableItems(businessId?: string): Promise<BookableItem[]> {
  const local = await loadAll<BookableItem>(KEY_BOOKABLE_ITEMS);
  try {
    const path = businessId
      ? `/supabase/services?business_id=${encodeURIComponent(businessId)}`
      : "/supabase/services";
    const remote = await supabaseApiRequest<RemoteService[]>(path);
    if (remote.length > 0) {
      const mapped = remember(remote.map(mapRemoteService));
      return businessId ? mapped.filter((x) => x.businessId === businessId) : mapped;
    }
  } catch (error) {
    console.warn("[booking] No se pudieron cargar servicios remotos:", error);
  }
  const all = local;
  if (!businessId) return all;
  return all.filter((x) => x.businessId === businessId);
}

export async function saveBookableItem(item: BookableItem): Promise<void> {
  if (isCloudId(item.businessId)) {
    if (!isCloudId(item.id)) throw new BookingApiError("El servicio no tiene un identificador válido.", 400);
    await supabaseApiRequest(`${management}/businesses/${item.businessId}/services/${item.id}`, { method: "PATCH", body: JSON.stringify(serviceBody(item)) }, true); return;
  }
  const all = await loadAll<BookableItem>(KEY_BOOKABLE_ITEMS);
  const idx = all.findIndex((x) => x.id === item.id);
  if (idx >= 0) all[idx] = item;
  else all.push(item);
  await saveAll(KEY_BOOKABLE_ITEMS, all);
}

export async function createBookableItem(
  data: Omit<BookableItem, "id">
): Promise<BookableItem> {
  if (isCloudId(data.businessId)) {
    const rows = await supabaseApiRequest<RemoteService[]>(`${management}/businesses/${data.businessId}/services`, { method: "POST", body: JSON.stringify(serviceBody(data)) }, true);
    return remember([mapRemoteService(firstRow(rows))])[0];
  }
  const item: BookableItem = { ...data, id: uid() };
  const all = await loadAll<BookableItem>(KEY_BOOKABLE_ITEMS);
  all.push(item);
  await saveAll(KEY_BOOKABLE_ITEMS, all);
  return item;
}

export async function deleteBookableItem(id: string, businessId?: string): Promise<void> {
  if (isCloudId(id)) return deactivateRemote("services", id, businessId);
  const all = await loadAll<BookableItem>(KEY_BOOKABLE_ITEMS);
  await saveAll(KEY_BOOKABLE_ITEMS, all.filter((x) => x.id !== id));
}

// ── Staff ──────────────────────────────────────────────────────────────────────

export async function getStaff(businessId?: string): Promise<Staff[]> {
  if (businessId && isCloudId(businessId)) {
    const rows = await supabaseApiRequest<RemoteStaff[]>(`/supabase/staff?business_id=${encodeURIComponent(businessId)}`);
    return remember(rows.filter(row => !row.ui_metadata?.archived).map(mapStaff));
  }
  const all = await loadAll<Staff>(KEY_STAFF);
  if (!businessId) return all;
  return all.filter((s) => s.businessId === businessId && s.active);
}

export async function saveStaff(member: Staff): Promise<void> {
  if (isCloudId(member.businessId)) {
    const existing = isCloudId(member.id);
    const rows = await supabaseApiRequest<RemoteStaff[]>(`${management}/businesses/${member.businessId}/staff${existing ? `/${member.id}` : ""}`, { method: existing ? "PATCH" : "POST", body: JSON.stringify({ display_name: member.name, active: member.active, ui_metadata: { emoji: member.emoji, serviceIds: member.serviceIds } }) }, true);
    remember([mapStaff(firstRow(rows))]); return;
  }
  const all = await loadAll<Staff>(KEY_STAFF);
  const idx = all.findIndex((x) => x.id === member.id);
  if (idx >= 0) all[idx] = member;
  else all.push(member);
  await saveAll(KEY_STAFF, all);
}

export async function createStaff(data: Omit<Staff, "id">): Promise<Staff> {
  if (isCloudId(data.businessId)) {
    const rows = await supabaseApiRequest<RemoteStaff[]>(`${management}/businesses/${data.businessId}/staff`, { method: "POST", body: JSON.stringify({ display_name: data.name, active: data.active, ui_metadata: { emoji: data.emoji, serviceIds: data.serviceIds } }) }, true);
    return remember([mapStaff(firstRow(rows))])[0];
  }
  const member: Staff = { ...data, id: uid() };
  const all = await loadAll<Staff>(KEY_STAFF);
  all.push(member);
  await saveAll(KEY_STAFF, all);
  return member;
}

export async function deleteStaff(id: string, businessId?: string): Promise<void> {
  if (isCloudId(id)) return deactivateRemote("staff", id, businessId);
  const all = await loadAll<Staff>(KEY_STAFF);
  await saveAll(KEY_STAFF, all.filter((x) => x.id !== id));
}

// ── Availability windows ───────────────────────────────────────────────────────

export async function getAvailabilityWindows(
  businessId?: string
): Promise<AvailabilityWindow[]> {
  if (businessId && isCloudId(businessId)) {
    const rows = await supabaseApiRequest<RemoteWindow[]>(`/supabase/availability?business_id=${encodeURIComponent(businessId)}`);
    return remember(rows.filter(row => !row.ui_metadata?.archived).map(mapWindow));
  }
  const all = await loadAll<AvailabilityWindow>(KEY_AVAILABILITY_WINDOWS);
  if (!businessId) return all;
  return all.filter((w) => w.businessId === businessId);
}

export async function saveAvailabilityWindow(w: AvailabilityWindow): Promise<void> {
  if (isCloudId(w.businessId)) {
    await supabaseApiRequest(`${management}/businesses/${w.businessId}/availability/${w.id}`, { method: "PATCH", body: JSON.stringify(windowBody(w)) }, true); return;
  }
  const all = await loadAll<AvailabilityWindow>(KEY_AVAILABILITY_WINDOWS);
  const idx = all.findIndex((x) => x.id === w.id);
  if (idx >= 0) all[idx] = w;
  else all.push(w);
  await saveAll(KEY_AVAILABILITY_WINDOWS, all);
}

export async function createAvailabilityWindow(
  data: Omit<AvailabilityWindow, "id">
): Promise<AvailabilityWindow> {
  if (isCloudId(data.businessId)) {
    const rows = await supabaseApiRequest<RemoteWindow[]>(`${management}/businesses/${data.businessId}/availability`, { method: "POST", body: JSON.stringify(windowBody(data)) }, true);
    return remember([mapWindow(firstRow(rows))])[0];
  }
  const w: AvailabilityWindow = { ...data, id: uid() };
  const all = await loadAll<AvailabilityWindow>(KEY_AVAILABILITY_WINDOWS);
  all.push(w);
  await saveAll(KEY_AVAILABILITY_WINDOWS, all);
  return w;
}

export async function deleteAvailabilityWindow(id: string, businessId?: string): Promise<void> {
  if (isCloudId(id)) return deactivateRemote("availability", id, businessId);
  const all = await loadAll<AvailabilityWindow>(KEY_AVAILABILITY_WINDOWS);
  await saveAll(KEY_AVAILABILITY_WINDOWS, all.filter((x) => x.id !== id));
}

// ── Bookings ───────────────────────────────────────────────────────────────────

export async function getBookings(filters?: {
  businessId?: string;
  customerId?: string;
  status?: BookingStatus[];
}): Promise<Booking[]> {
  let all = await loadAll<Booking>(KEY_BOOKINGS);
  // Expire old HOLDs
  const now = new Date().toISOString();
  let changed = false;
  all = all.map((b) => {
    if (b.status === "HOLD" && b.holdExpiresAt && b.holdExpiresAt < now) {
      changed = true;
      return { ...b, status: "EXPIRED" as BookingStatus };
    }
    return b;
  });
  if (changed) await saveAll(KEY_BOOKINGS, all);

  // Las reservas confirmadas viven en Supabase. Los HOLD locales se mantienen
  // aquí porque son exclusivamente temporales y todavía no se han confirmado.
  const session = await getStoredSession();
  if (session?.access_token) {
    try {
      const remote = await supabaseApiRequest<RemoteBooking[]>("/supabase/bookings", {}, true);
      const remoteBookings = remote.map(mapRemoteBooking);
      const remoteIds = new Set(remoteBookings.map((booking) => booking.id));
      all = [
        ...all.filter((booking) => !remoteIds.has(booking.id)),
        ...remoteBookings,
      ];
    } catch (error) {
      console.warn("[booking] No se pudieron cargar reservas remotas:", error);
    }
  }

  if (filters?.businessId) all = all.filter((b) => b.businessId === filters.businessId);
  if (filters?.customerId) all = all.filter((b) => b.customerId === filters.customerId);
  if (filters?.status) all = all.filter((b) => filters.status!.includes(b.status));
  return all;
}

/**
 * Actualiza metadatos (goEntryId, notes, …) de una reserva EXISTENTE.
 *
 * GARANTÍAS DE SEGURIDAD:
 *  • NUNCA crea reservas nuevas (si el id no existe, no-op).
 *  • NUNCA modifica campos que afectan al slot (businessId, staffId,
 *    startDatetime, endDatetime, status, holdExpiresAt, bookableItemId).
 *
 * Para crear o confirmar una reserva usa claimSlotOrReject / createHold.
 */
export async function saveBooking(patch: Booking): Promise<void> {
  console.log("[CONFIRM_PATH_REACHED] data/booking.ts:saveBooking(patch) ENTERED — id:", patch.id);
  const all = await loadAll<Booking>(KEY_BOOKINGS);
  const idx = all.findIndex(x => x.id === patch.id);
  if (idx < 0) {
    // La reserva no existe — rechazamos silenciosamente para no crear duplicados
    console.warn("[saveBooking] IGNORADO — la reserva no existe en storage:", patch.id);
    return;
  }
  const existing = all[idx];
  // Sólo se actualizan campos de metadatos; los campos de slot quedan intactos
  all[idx] = {
    ...existing,
    goEntryId:  patch.goEntryId  ?? existing.goEntryId,
    notes:      patch.notes      ?? existing.notes,
  };
  await saveAll(KEY_BOOKINGS, all);
}

/**
 * Crea un HOLD pasando por claimSlotOrReject.
 * Si el slot ya está ocupado devuelve { ok: false, conflict }.
 * Nunca escribe en storage si hay conflicto.
 */
export async function createHold(
  data: Omit<Booking, "id" | "status" | "holdExpiresAt" | "paymentStatus">,
  holdSeconds = 300
): Promise<{ ok: true; booking: Booking } | { ok: false; conflict: Booking }> {
  const expires = new Date(Date.now() + holdSeconds * 1000);
  return checkAndClaimBookingSlot({
    ...data,
    status: "HOLD",
    holdExpiresAt: expires.toISOString(),
    paymentStatus: "none",
  });
}

/**
 * Confirma un HOLD existente pasando por claimSlotOrReject.
 * El HOLD se auto-reemplaza (self-replace por ID) — el check salta la propia
 * entrada y solo detecta conflictos con OTRAS reservas bloqueantes.
 *
 * Devuelve:
 *   { ok: true,  booking }        — HOLD confirmado con éxito.
 *   { ok: false, conflict }       — otra reserva ya ocupa ese slot.
 *   { ok: false, notFound: true } — HOLD no existe o ya no está en HOLD.
 *   { ok: false, expired: true }  — HOLD expirado.
 */
export async function confirmHold(
  holdId: string,
  goEntryId?: string
): Promise<
  | { ok: true;  booking: Booking }
  | { ok: false; conflict: Booking }
  | { ok: false; notFound: true }
  | { ok: false; expired: true }
> {
  const all = await loadAll<Booking>(KEY_BOOKINGS);
  const hold = all.find(x => x.id === holdId);
  if (!hold || hold.status !== "HOLD") return { ok: false, notFound: true };

  const now = new Date().toISOString();
  if (hold.holdExpiresAt && hold.holdExpiresAt < now) {
    // Persistir la expiración y rechazar
    await saveAll(KEY_BOOKINGS, all.map(b => b.id === holdId ? { ...b, status: "EXPIRED" as BookingStatus } : b));
    return { ok: false, expired: true };
  }

  return checkAndClaimBookingSlot({
    ...hold,
    id: holdId,
    status: "CONFIRMED",
    holdExpiresAt: undefined,
    goEntryId: goEntryId ?? hold.goEntryId,
  });
}

const isRemoteBookingId = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

export async function cancelBooking(id: string): Promise<void> {
  if (isRemoteBookingId(id)) {
    // Do not report a local success before the server accepts cancellation.
    await supabaseApiRequest(`/supabase/bookings/${id}/cancel`, { method: "PATCH" }, true);
  }
  const all = await loadAll<Booking>(KEY_BOOKINGS);
  await saveAll(KEY_BOOKINGS, all.map(b => b.id === id ? { ...b, status: "CANCELLED" as BookingStatus } : b));
}

export async function updateBookingStatus(id: string, status: BookingStatus): Promise<void> {
  if (status === "CANCELLED") return cancelBooking(id);
  if (isRemoteBookingId(id)) {
    throw new BookingApiError("Este cambio de estado todavía no está disponible para reservas remotas.", 400);
  }
  const all = await loadAll<Booking>(KEY_BOOKINGS);
  const idx = all.findIndex((x) => x.id === id);
  if (idx >= 0) {
    all[idx] = { ...all[idx], status };
    await saveAll(KEY_BOOKINGS, all);
  }
}

// ── Manual blocks ──────────────────────────────────────────────────────────────

export async function getManualBlocks(businessId?: string): Promise<ManualBlock[]> {
  const all = await loadAll<ManualBlock>(KEY_MANUAL_BLOCKS);
  if (!businessId) return all;
  return all.filter((b) => b.businessId === businessId && b.active);
}

export async function saveManualBlock(block: ManualBlock): Promise<void> {
  const all = await loadAll<ManualBlock>(KEY_MANUAL_BLOCKS);
  const idx = all.findIndex((x) => x.id === block.id);
  if (idx >= 0) all[idx] = block;
  else all.push(block);
  await saveAll(KEY_MANUAL_BLOCKS, all);
}

export async function createManualBlock(
  data: Omit<ManualBlock, "id">
): Promise<ManualBlock> {
  const block: ManualBlock = { ...data, id: uid() };
  const all = await loadAll<ManualBlock>(KEY_MANUAL_BLOCKS);
  all.push(block);
  await saveAll(KEY_MANUAL_BLOCKS, all);
  return block;
}

export async function deleteManualBlock(id: string): Promise<void> {
  const all = await loadAll<ManualBlock>(KEY_MANUAL_BLOCKS);
  await saveAll(KEY_MANUAL_BLOCKS, all.filter((x) => x.id !== id));
}

// ── Availability engine ────────────────────────────────────────────────────────

function toMinutes(h: number, m: number = 0): number {
  return h * 60 + m;
}

/**
 * addMinutesLocal — suma minutos a un ISO local SIN Z ("YYYY-MM-DDTHH:MM:SS").
 *
 * NO usa el constructor Date para evitar conversiones de zona horaria.
 * Toda la aritmética es en tiempo local puro.
 * Maneja desbordamiento de hora/día para franjas cerca de medianoche.
 */
function addMinutesLocal(localISO: string, minutes: number): string {
  const datePart = localISO.slice(0, 10);          // "YYYY-MM-DD"
  const hh       = parseInt(localISO.slice(11, 13), 10);
  const mm       = parseInt(localISO.slice(14, 16), 10);
  const total    = hh * 60 + mm + minutes;
  const newH     = Math.floor(total / 60);
  const newM     = total % 60;
  if (newH >= 24) {
    // Desbordamiento al día siguiente (raro en horarios reales, pero seguro)
    const base = new Date(datePart + "T12:00:00Z");
    base.setUTCDate(base.getUTCDate() + 1);
    const next = base.toISOString().slice(0, 10);
    return `${next}T${String(newH - 24).padStart(2, "0")}:${String(newM).padStart(2, "0")}:00`;
  }
  return `${datePart}T${String(newH).padStart(2, "0")}:${String(newM).padStart(2, "0")}:00`;
}

function overlaps(
  startA: string,
  endA: string,
  startB: string,
  endB: string
): boolean {
  return startA < endB && endA > startB;
}

/**
 * Estados que BLOQUEAN disponibilidad (activos/pendientes/completados).
 * EXPIRED, CANCELLED y REJECTED no bloquean — el slot vuelve a estar libre.
 */
export const BLOCKING_STATUSES: BookingStatus[] = ["HOLD", "CONFIRMED", "ACCEPTED", "BLOCKED", "COMPLETED"];

/**
 * Comprueba en tiempo real si un intervalo horario está ocupado.
 * Lee DIRECTAMENTE de go_bookings_v1 — nunca depende de React state.
 *
 * Regla de staff:
 *   staffId=undefined  → Indistinto: cualquier reserva del businessId que solape bloquea.
 *   staffId=definido   → Solo las reservas con el MISMO staffId bloquean.
 */
export async function isSlotOccupied({
  businessId,
  staffId,
  startDatetime,
  endDatetime,
}: {
  businessId: string;
  staffId: string | undefined;
  startDatetime: string;
  endDatetime: string;
}): Promise<boolean> {
  const bookings = await getBookings({ businessId, status: BLOCKING_STATUSES });
  return bookings.some(b => {
    if (staffId !== undefined && b.staffId !== staffId) return false;
    return b.startDatetime < endDatetime && b.endDatetime > startDatetime;
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * ÚNICA PUERTA DE ESCRITURA A go_bookings_v1
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Ninguna otra función puede crear o confirmar reservas sin pasar por aquí.
 *
 * Algoritmo — READ → EXPIRE → CHECK → WRITE (sin awaits intercalados):
 *
 *  1. Lee go_bookings_v1 fresco desde AsyncStorage.
 *  2. Expira HOLDs vencidos en memoria.
 *  3. Busca conflicto: misma businessId + mismo staffId + intervalo solapado
 *     + status bloqueante (HOLD | CONFIRMED | ACCEPTED | COMPLETED).
 *  4a. Si hay conflicto:
 *      - Persiste solo las expiraciones (si las hubo) y devuelve { ok:false }.
 *      - NO escribe ninguna reserva nueva.
 *  4b. Si no hay conflicto:
 *      - Escribe la reserva (upsert por id — permite HOLD→CONFIRMED self-replace).
 *      - Devuelve { ok:true, booking }.
 *
 * Regla de staff:
 *   staffId=undefined → cualquier reserva del businessId que solape bloquea.
 *   staffId=definido  → solo bloquean reservas con el MISMO staffId.
 */
export async function checkAndClaimBookingSlot(
  candidate: Omit<Booking, "id"> & { id?: string }
): Promise<{ ok: true; booking: Booking } | { ok: false; conflict: Booking; conflictReason: "staff" | "client" }> {
  // La confirmación del cliente es la única escritura real. El HOLD continúa
  // siendo local para que el usuario pueda revisar la reserva antes de enviarla.
  // Las reservas creadas por el panel de proveedor conservan el flujo local
  // hasta que ese panel tenga un endpoint de gestión propio.
  const currentUserId = await getAuthenticatedUserId();
  const isCustomerConfirmation =
    candidate.status === "CONFIRMED" &&
    (candidate.customerId === "me" || candidate.customerId === currentUserId);
  if (isCustomerConfirmation) {
    try {
      const booking = { ...await createRemoteBooking(candidate), goEntryId: candidate.goEntryId };
      // The remote booking replaces its local HOLD. Do not retry a successful
      // server write just because optional local cleanup failed.
      try {
        const local = await loadAll<Booking>(KEY_BOOKINGS);
        await saveAll(KEY_BOOKINGS, local.filter(b => b.id !== candidate.id));
      } catch (error) { console.warn("[booking] No se pudo limpiar el HOLD local", error); }
      return { ok: true, booking };
    } catch (error) {
      if (
        error instanceof BookingApiError &&
        (error.status === 409 || error.code === "23P01" || error.code === "BOOKING_CONFLICT")
      ) {
        return {
          ok: false,
          conflict: { ...candidate, id: candidate.id ?? "remote-conflict", status: "CONFIRMED" },
          conflictReason: "staff",
        };
      }
      throw error;
    }
  }

  // ── 1. READ ──────────────────────────────────────────────────────────────────
  const raw = await AsyncStorage.getItem(KEY_BOOKINGS);
  let all: Booking[] = raw ? (JSON.parse(raw) as Booking[]) : [];

  // ── 2. EXPIRE ────────────────────────────────────────────────────────────────
  const now = new Date().toISOString();
  let anyExpired = false;
  all = all.map(b => {
    if (b.status === "HOLD" && b.holdExpiresAt && b.holdExpiresAt < now) {
      anyExpired = true;
      return { ...b, status: "EXPIRED" as BookingStatus };
    }
    return b;
  });

  // ── 3. CHECK ─────────────────────────────────────────────────────────────────
  const candidateKey = getBookingSlotKey(candidate);

  // ── DIAGNÓSTICO — candidate + bookings activos ────────────────────────────
  const _diagBlocking = all.filter(
    b => BLOCKING_STATUSES.includes(b.status) && !(candidate.id && b.id === candidate.id)
  );
  console.log("═══════════════════════════════════════════════════");
  console.log("[DIAG] CANDIDATE →", {
    businessId: candidate.businessId,
    staffId:    candidate.staffId ?? "undefined",
    date:       candidate.startDatetime?.slice(0, 10),
    startTime:  candidate.startDatetime?.slice(11, 16),
    endTime:    candidate.endDatetime?.slice(11, 16),
    slotKey:    candidateKey,
  });
  console.log(`[DIAG] BOOKINGS ACTIVOS EN STORAGE: ${_diagBlocking.length}`);
  _diagBlocking.forEach((b, i) => {
    console.log(`  [booking ${i}]`, {
      id:         b.id,
      businessId: b.businessId,
      staffId:    b.staffId ?? "undefined",
      date:       b.startDatetime?.slice(0, 10),
      startTime:  b.startDatetime?.slice(11, 16),
      endTime:    b.endDatetime?.slice(11, 16),
      status:     b.status,
      slotKey:    b.slotKey ?? "(sin slotKey — legacy)",
    });
  });

  // BARRERA 1: slotKey — comprobación exacta por clave única.
  console.log("─── BARRERA 1: slotKey match ───────────────────────");
  const slotKeyConflict = all.find(b => {
    if (candidate.id && b.id === candidate.id) return false;
    if (!b.slotKey) {
      console.log(`  [B1] id=${b.id} status=${b.status} → sin slotKey → SKIP (irá a B2 si status bloqueante)`);
      return false;
    }
    const keyMatch   = b.slotKey === candidateKey;
    const statOk     = b.status === "CONFIRMED" || b.status === "HOLD";
    const resultado  = keyMatch && statOk;
    console.log(`  [B1] id=${b.id} | slotKey="${b.slotKey}" | candidateKey="${candidateKey}" | keyMatch=${keyMatch} | status=${b.status} | statOk=${statOk} → RESULTADO=${resultado}`);
    return resultado;
  });

  if (slotKeyConflict) {
    console.warn("[DIAG] ═══ BLOQUEADO por BARRERA 1 ═══", { candidateKey, conflictId: slotKeyConflict.id, conflictStatus: slotKeyConflict.status });
    if (anyExpired) await AsyncStorage.setItem(KEY_BOOKINGS, JSON.stringify(all));
    return { ok: false, conflict: slotKeyConflict, conflictReason: "staff" as const };
  }
  console.log("  [B1] Sin conflicto de slotKey → pasa a BARRERA 2");

  // BARRERA 2: solapamiento horario — red de seguridad universal (todos los bookings bloqueantes).
  // NOTA: NO saltar bookings que tienen slotKey — B1 sólo atrapa coincidencias exactas de clave.
  // Si dos bookings se crean con staffIds distintos (race condition) obtienen slotKeys distintas
  // y B1 las falla. B2 es el único bloqueo que atrapa esos solapamientos por rango de tiempo.
  //
  // DOS CAPAS DE CONFLICTO:
  //   "client" — mismo customerId: la misma persona no puede estar en dos reservas al mismo tiempo.
  //              Tiene prioridad sobre staffSkip — no importa si el profesional es distinto.
  //   "staff"  — mismo staffId: el mismo profesional no puede atender dos reservas al mismo tiempo.
  console.log("─── BARRERA 2: solapamiento horario (todos los bookings bloqueantes) ────");

  let conflict: Booking | null = null;
  let conflictReason: "staff" | "client" = "staff";

  for (const b of all) {
    if (candidate.id && b.id === candidate.id) continue;
    if (b.businessId !== candidate.businessId) {
      console.log(`  [B2] id=${b.id} → businessId diferente → SKIP`);
      continue;
    }
    if (!BLOCKING_STATUSES.includes(b.status)) {
      console.log(`  [B2] id=${b.id} → status=${b.status} no bloqueante → SKIP`);
      continue;
    }

    const timeOverlap = b.startDatetime < candidate.endDatetime && b.endDatetime > candidate.startDatetime;
    console.log(`  [B2] id=${b.id} slotKey=${b.slotKey ?? "(none)"} | existingStart=${b.startDatetime?.slice(11,16)} existingEnd=${b.endDatetime?.slice(11,16)} | candidateStart=${candidate.startDatetime?.slice(11,16)} candidateEnd=${candidate.endDatetime?.slice(11,16)} | overlap=${timeOverlap}`);

    // CAPA 1 — CLIENTE: misma persona no puede estar en dos reservas al mismo tiempo.
    // Prioridad sobre staffSkip: aunque el profesional sea distinto, el cliente es el mismo.
    const sameCustomer =
      !!(candidate.customerId && b.customerId) &&
      candidate.customerId === b.customerId;
    if (sameCustomer && timeOverlap) {
      console.log(`  [B2] id=${b.id} → CONFLICTO CLIENTE (customerId="${b.customerId}") → BLOQUEADO`);
      conflict = b;
      conflictReason = "client";
      break;
    }

    // CAPA 2 — STAFF: mismo profesional no puede atender dos reservas al mismo tiempo.
    const staffSkip =
      candidate.staffId !== undefined &&
      b.staffId !== undefined &&
      b.staffId !== candidate.staffId;
    if (staffSkip) {
      console.log(`  [B2] id=${b.id} → staffId diferente (existing="${b.staffId}" vs candidate="${candidate.staffId}") → SKIP`);
      continue;
    }

    if (timeOverlap) {
      console.log(`  [B2] id=${b.id} → CONFLICTO STAFF → BLOQUEADO`);
      conflict = b;
      conflictReason = "staff";
      break;
    }
  }

  // ── 4a. RECHAZAR ─────────────────────────────────────────────────────────────
  if (conflict) {
    if (anyExpired) await AsyncStorage.setItem(KEY_BOOKINGS, JSON.stringify(all));
    console.warn("[DIAG] ═══ BLOQUEADO por BARRERA 2 ═══", { conflictId: conflict.id, conflictStatus: conflict.status, conflictReason });
    return { ok: false, conflict, conflictReason };
  }

  console.log("[DIAG] ═══ SIN CONFLICTO → ESCRIBIENDO RESERVA ═══");
  console.log("[REAL_BOOKING_WRITE_PATH] checkAndClaimBookingSlot → WRITING to go_bookings_v1", {
    businessId:    candidate.businessId,
    staffId:       candidate.staffId ?? "(any)",
    startDatetime: candidate.startDatetime,
    endDatetime:   candidate.endDatetime,
    slotKey:       candidateKey,
    status:        candidate.status,
  });
  console.log("[WRITE_GO_BOOKING_SOURCE]", {
    sourceFile:     "data/booking.ts",
    functionName:   "checkAndClaimBookingSlot",
    bookingId:      candidate.id ?? "(pending)",
    businessId:     candidate.businessId,
    staffId:        candidate.staffId        ?? undefined,
    professionalId: candidate.staffId        ?? undefined,
    serviceId:      candidate.bookableItemId         ?? undefined,
    date:           candidate.startDatetime?.slice(0, 10),
    startTime:      candidate.startDatetime?.slice(11, 16),
    endTime:        candidate.endDatetime?.slice(11, 16),
    slotKey:        candidateKey,
    status:         candidate.status,
  });

  // ── 4b. ESCRIBIR — incluye slotKey para que futuras comprobaciones usen barrera 1 ──
  const booking: Booking = {
    ...candidate,
    id:      candidate.id ?? `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    slotKey: candidateKey,
  };
  const idx = all.findIndex(b => b.id === booking.id);
  if (idx >= 0) all[idx] = booking;
  else all.push(booking);
  await AsyncStorage.setItem(KEY_BOOKINGS, JSON.stringify(all));

  console.log("[BLOCKED_OR_CREATED] CREADO →", {
    id:     booking.id,
    status: booking.status,
    start:  booking.startDatetime,
    end:    booking.endDatetime,
    staff:  booking.staffId,
  });
  return { ok: true, booking };
}

/** Alias de compatibilidad — ambos nombres apuntan a la misma implementación */
export const claimSlot        = checkAndClaimBookingSlot;
export const claimSlotOrReject = checkAndClaimBookingSlot;

// ── Purga única de bookings de demo ────────────────────────────────────────────
//
// Se ejecuta UNA SOLA VEZ al arranque (controlado por la clave de versión).
// Borra go_bookings_v1 para que los datos de prueba anteriores no contaminen
// el filtro de slots disponibles. A partir de aquí, cada reserva nueva usa
// staffId canónico y queda correctamente bloqueada en el selector de horas.
//
const BOOKING_PURGE_V1_KEY = "go_booking_purge_v1_done";

export async function purgeBookingsOnce(): Promise<void> {
  try {
    const done = await AsyncStorage.getItem(BOOKING_PURGE_V1_KEY);
    if (done) return; // ya ejecutado — no tocar nada
    await AsyncStorage.removeItem(KEY_BOOKINGS);
    await AsyncStorage.setItem(BOOKING_PURGE_V1_KEY, "1");
    console.log("[PURGE_BOOKINGS] Reservas de demo eliminadas — slate limpio.");
  } catch (err) {
    console.error("[PURGE_BOOKINGS] Error:", err);
  }
}

// ── Migración de slotKey ────────────────────────────────────────────────────────
//
// Ejecutar UNA VEZ al arranque (antes de cualquier lectura de calendario).
//
// Pasos:
//  1. Lee go_bookings_v1.
//  2. Para cada booking sin slotKey → calcula y asigna getBookingSlotKey().
//  3. Detecta duplicados: bookings con el mismo slotKey en estado bloqueante.
//     → Conserva el más antiguo (menor timestamp en id o primero en array).
//     → Los duplicados se marcan como CANCELLED.
//  4. Si hubo cambios, guarda go_bookings_v1 limpio.
//
export async function migrateSlotKeys(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY_BOOKINGS);
    if (!raw) return;

    let all: Booking[] = JSON.parse(raw) as Booking[];
    let dirty = false;

    // ── Paso 1: backfill slotKey en bookings que no lo tienen ──
    all = all.map(b => {
      if (!b.slotKey) {
        dirty = true;
        return { ...b, slotKey: getBookingSlotKey(b) };
      }
      return b;
    });

    // ── Paso 2: deduplicar por slotKey dentro de estados bloqueantes ──
    // Agrupa por slotKey; dentro de cada grupo solo puede quedar UNO activo.
    // Criterio de "ganador": el booking más antiguo según el prefijo numérico del id,
    // o el primero en el array si el id no tiene prefijo numérico reconocible.
    const keyToWinner = new Map<string, string>(); // slotKey → id del ganador

    const blockingSet = new Set<BookingStatus>(BLOCKING_STATUSES);

    all.forEach(b => {
      if (!b.slotKey) return;
      if (!blockingSet.has(b.status)) return;

      if (!keyToWinner.has(b.slotKey)) {
        keyToWinner.set(b.slotKey, b.id);
        return;
      }

      // Hay dos bookings activos con el mismo slotKey → elegir el más antiguo
      const existingId = keyToWinner.get(b.slotKey)!;
      const existingTs = parseInt(existingId.split("_")[0], 10) || 0;
      const currentTs  = parseInt(b.id.split("_")[0], 10) || 0;

      if (currentTs < existingTs) {
        // el booking actual es más antiguo → pasa a ser el ganador
        keyToWinner.set(b.slotKey, b.id);
      }
      // si el existente ya era más antiguo, no cambia nada
    });

    // Ahora recorremos y cancelamos los perdedores
    all = all.map(b => {
      if (!b.slotKey) return b;
      if (!blockingSet.has(b.status)) return b;

      const winnerId = keyToWinner.get(b.slotKey);
      if (winnerId && winnerId !== b.id) {
        dirty = true;
        console.log("[MIGRATE_SLOTKEY] duplicado cancelado →", {
          id: b.id, slotKey: b.slotKey, status: b.status, ganador: winnerId,
        });
        return { ...b, status: "CANCELLED" as BookingStatus };
      }
      return b;
    });

    if (dirty) {
      await AsyncStorage.setItem(KEY_BOOKINGS, JSON.stringify(all));
      console.log("[MIGRATE_SLOTKEY] migración completada — bookings guardados:", all.length);
    } else {
      console.log("[MIGRATE_SLOTKEY] sin cambios — todos los bookings ya tenían slotKey.");
    }
  } catch (err) {
    console.error("[MIGRATE_SLOTKEY] error durante migración:", err);
  }
}

// ── Migración de staffId ────────────────────────────────────────────────────────
//
// Ejecutar al arranque, DESPUÉS de migrateSlotKeys.
//
// Problema: reservas antiguas pueden tener staffId en formato legacy
//   ("st-isa", "nemesi-demo-v1_staff_isa", etc.) que no coincide con
//   el formato canónico actual ("nemesi_molina_staff_isa").
// Resultado: el filtro defensivo del selector de horas no las encuentra
//   → el slot sigue visible aunque ya esté reservado.
//
// Estrategia:
//   1. Lee go_staff_v1 (IDs canónicos actuales).
//   2. Para cada booking cuyo staffId no está en los IDs canónicos:
//      a. Extrae la parte de nombre del staffId legacy (último segmento tras "_staff_" o "-").
//      b. Busca un staff canónico con el mismo nombre normalizado.
//      c. Si lo encuentra, reemplaza staffId y recalcula slotKey.
//   3. Guarda si hubo cambios.
//
export async function migrateBookingStaffIds(): Promise<void> {
  try {
    const allStaff = await loadAll<Staff>(KEY_STAFF);
    if (allStaff.length === 0) return;

    const canonicalIds = new Set(allStaff.map(s => s.id));

    // Nombre normalizado → ID canónico
    const normN = (n: string) =>
      n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const nameToCanonical = new Map(allStaff.map(s => [normN(s.name), s.id]));

    // Extrae la parte de nombre de un staffId legacy:
    //   "st-isa"                    → "isa"
    //   "nemesi-demo-v1_staff_isa"  → "isa"
    //   "nemesi_molina_staff_lucia" → "lucia" (ya canónico, nunca llega aquí)
    const nameFromLegacyId = (id: string): string => {
      if (id.includes("_staff_")) {
        return (id.split("_staff_").pop() ?? "").replace(/_/g, " ").trim();
      }
      return (id.split("-").pop() ?? "").replace(/_/g, " ").trim();
    };

    const raw = await AsyncStorage.getItem(KEY_BOOKINGS);
    if (!raw) return;
    let all: Booking[] = JSON.parse(raw) as Booking[];
    let dirty = false;

    all = all.map(b => {
      if (!b.staffId) return b;                  // Indistinto → sin staffId
      if (canonicalIds.has(b.staffId)) return b; // ya canónico

      const guessedName   = nameFromLegacyId(b.staffId);
      const canonicalId   = nameToCanonical.get(normN(guessedName));
      if (!canonicalId) return b;                // no se puede resolver

      dirty = true;
      const updated: Booking = {
        ...b,
        staffId: canonicalId,
        slotKey: getBookingSlotKey({ ...b, staffId: canonicalId }),
      };
      console.log("[MIGRATE_STAFF_ID]", b.staffId, "→", canonicalId, "(booking", b.id, ")");
      return updated;
    });

    if (dirty) {
      await AsyncStorage.setItem(KEY_BOOKINGS, JSON.stringify(all));
      console.log("[MIGRATE_STAFF_ID] migración completada — staffIds actualizados en go_bookings_v1");
    } else {
      console.log("[MIGRATE_STAFF_ID] sin cambios — todos los staffIds ya son canónicos");
    }
  } catch (err) {
    console.error("[MIGRATE_STAFF_ID] error:", err);
  }
}

/**
 * Deduplica reservas por clave funcional (staffId + franja horaria).
 * Evita que la "doble ficha" (cliente + empresa) cuente dos veces el mismo turno.
 */
function deduplicateBookings<T extends { staffId?: string; startDatetime: string; endDatetime: string }>(
  bookings: T[]
): T[] {
  const seen = new Set<string>();
  const removed: T[] = [];
  const kept: T[] = [];
  for (const b of bookings) {
    const key = `${b.staffId ?? "__any__"}_${b.startDatetime}_${b.endDatetime}`;
    if (seen.has(key)) {
      removed.push(b);
    } else {
      seen.add(key);
      kept.push(b);
    }
  }
  console.log("[deduplicateBookings] entrada:", bookings.length,
    "→ conservadas:", kept.length, "→ eliminadas:", removed.length);
  if (removed.length > 0) {
    console.log("[deduplicateBookings] ⚠️ ELIMINADAS:", (removed as any[]).map((b: any) => ({
      staffId: b.staffId ?? "(sin staff)", start: (b.startDatetime as string).substring(11, 16), status: (b as any).status,
    })));
  }
  console.log("[deduplicateBookings] CONSERVADAS:", (kept as any[]).map((b: any) => ({
    staffId: b.staffId ?? "(sin staff)", start: (b.startDatetime as string).substring(11, 16), status: (b as any).status,
  })));
  return kept;
}

export async function getAvailableSlots(
  businessId: string,
  bookableItemId: string,
  dateISO: string, // "YYYY-MM-DD"
  staffId?: string,
): Promise<AvailableSlot[]> {
  const item = (await getBookableItems(businessId)).find(
    (i) => i.id === bookableItemId
  );
  if (!item || !item.active || !item.visible) return [];

  const date = new Date(dateISO + "T00:00:00");
  const weekday = date.getDay();

  // Get applicable availability windows for this day
  const windows = await getAvailabilityWindows(businessId);

  // If staffId given, check if staff has custom windows on this day
  const staffWindowsForDay = staffId
    ? windows.filter((w) => w.staffId === staffId && w.weekday === weekday && w.active)
    : [];

  const applicableWindows = windows.filter(
    (w) =>
      w.weekday === weekday &&
      w.active &&
      (!w.bookableItemId || w.bookableItemId === bookableItemId) &&
      // Staff scope: custom windows for this staff if they exist, else business-level
      (staffId
        ? (staffWindowsForDay.length > 0 ? w.staffId === staffId : !w.staffId)
        : !w.staffId)
  );
  if (applicableWindows.length === 0) return [];

  // Reservas bloqueantes para este día
  const bookings = await getBookings({ businessId, status: BLOCKING_STATUSES });
  const dayBookings = deduplicateBookings(
    bookings.filter((b) => {
      if (!b.startDatetime.startsWith(dateISO)) return false;
      // Bloqueo por profesional: un profesional concreto no puede estar en dos
      // sitios a la vez — cualquier reserva suya (de cualquier servicio) bloquea
      // el slot. Sin profesional concreto: solo bloquea el mismo servicio (lógica
      // de unidades disponibles).
      if (staffId) return !b.staffId || b.staffId === staffId;
      return b.bookableItemId === bookableItemId;
    })
  );

  // Get manual blocks for this day
  const blocks = await getManualBlocks(businessId);
  const dayBlocks = blocks.filter((bl) => {
    const bStart = bl.blockStartDatetime.slice(0, 10);
    const bEnd = bl.blockEndDatetime.slice(0, 10);
    return bStart <= dateISO && dateISO <= bEnd;
  });

  const slots: AvailableSlot[] = [];

  for (const win of applicableWindows) {
    let slotStartMin = toMinutes(win.visibleStartHour, win.visibleStartMinute ?? 0);
    const winEndMin = toMinutes(win.visibleEndHour, win.visibleEndMinute ?? 0);

    while (slotStartMin + item.durationMinutes <= winEndMin) {
      const h = Math.floor(slotStartMin / 60);
      const m = slotStartMin % 60;
      // Hora local sin Z — evita desfase de zona horaria en la visualización
      const startISO = `${dateISO}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      const endISO = addMinutesLocal(startISO, item.durationMinutes);

      const isManuallyBlocked = dayBlocks.some((bl) =>
        overlaps(bl.blockStartDatetime, bl.blockEndDatetime, startISO, endISO)
      );

      // Bloqueo por profesional: si el cliente pidió un profesional concreto,
      // CUALQUIER solapamiento de ese profesional bloquea el slot (1 cita = 1 ocupado).
      // Sin profesional: lógica de unidades (varios sillones / mesas / etc.)
      let slotIsBlocked: boolean;
      if (staffId) {
        slotIsBlocked = isManuallyBlocked ||
          dayBookings.some(b => overlaps(b.startDatetime, b.endDatetime, startISO, endISO));
      } else {
        const occupiedUnits = dayBookings.reduce((sum, b) => {
          if (overlaps(b.startDatetime, b.endDatetime, startISO, endISO)) {
            return sum + b.unitsReserved;
          }
          return sum;
        }, 0);
        slotIsBlocked = isManuallyBlocked || occupiedUnits >= item.unitQuantity;
      }

      if (!slotIsBlocked) {
        const occupiedUnits = staffId ? 1 : dayBookings.reduce((sum, b) => {
          if (overlaps(b.startDatetime, b.endDatetime, startISO, endISO)) return sum + b.unitsReserved;
          return sum;
        }, 0);
        slots.push({
          startDatetime: startISO,
          endDatetime: endISO,
          availableUnits: item.unitQuantity - occupiedUnits,
          totalUnits: item.unitQuantity,
        });
      }

      slotStartMin += item.durationMinutes;
    }
  }

  return slots;
}

// ── getAllSlots — all slots (available + occupied) with status tag ───────────────
// Same logic as getAvailableSlots but NEVER filters by availability.
// Returns every slot in the day's windows tagged with `isAvailable`.
// Fully blocked slots (manual block) are tagged with `isBlocked`.

export type SlotWithStatus = AvailableSlot & {
  isAvailable: boolean; // false → fully occupied or manually blocked
  isBlocked: boolean;   // manual admin block (not a booking)
};

export async function getAllSlots(
  businessId: string,
  bookableItemId: string,
  dateISO: string,
  staffId?: string,
): Promise<SlotWithStatus[]> {
  const item = (await getBookableItems(businessId)).find(
    (i) => i.id === bookableItemId
  );
  if (!item || !item.active || !item.visible) return [];

  const date    = new Date(dateISO + "T00:00:00");
  const weekday = date.getDay();

  const windows = await getAvailabilityWindows(businessId);

  const staffWindowsForDay = staffId
    ? windows.filter((w) => w.staffId === staffId && w.weekday === weekday && w.active)
    : [];

  const applicableWindows = windows.filter(
    (w) =>
      w.weekday === weekday &&
      w.active &&
      (!w.bookableItemId || w.bookableItemId === bookableItemId) &&
      (staffId
        ? (staffWindowsForDay.length > 0 ? w.staffId === staffId : !w.staffId)
        : !w.staffId)
  );
  if (applicableWindows.length === 0) return [];

  const bookings = await getBookings({ businessId, status: BLOCKING_STATUSES });
  const dayBookings = deduplicateBookings(
    bookings.filter((b) => {
      if (!b.startDatetime.startsWith(dateISO)) return false;
      // Bloqueo cross-servicio: profesional concreto → cualquier reserva suya
      // bloquea el slot (un profesional no puede estar en dos sitios).
      // Sin profesional: solo el mismo servicio cuenta para unidades.
      if (staffId) return !b.staffId || b.staffId === staffId;
      return b.bookableItemId === bookableItemId;
    })
  );

  const blocks = await getManualBlocks(businessId);
  const dayBlocks = blocks.filter((bl) => {
    const bStart = bl.blockStartDatetime.slice(0, 10);
    const bEnd   = bl.blockEndDatetime.slice(0, 10);
    return bStart <= dateISO && dateISO <= bEnd;
  });

  const slots: SlotWithStatus[] = [];

  for (const win of applicableWindows) {
    let slotStartMin  = toMinutes(win.visibleStartHour, win.visibleStartMinute ?? 0);
    const winEndMin   = toMinutes(win.visibleEndHour, win.visibleEndMinute ?? 0);

    while (slotStartMin + item.durationMinutes <= winEndMin) {
      const h = Math.floor(slotStartMin / 60);
      const m = slotStartMin % 60;
      // Hora local sin Z — evita desfase de zona horaria en la visualización
      const startISO = `${dateISO}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
      const endISO   = addMinutesLocal(startISO, item.durationMinutes);

      const isManuallyBlocked = dayBlocks.some((bl) =>
        overlaps(bl.blockStartDatetime, bl.blockEndDatetime, startISO, endISO)
      );

      // Bloqueo por profesional: 1 cita de ese profesional = slot completo.
      // Sin profesional concreto: lógica de unidades (capacidad de negocio).
      let isAvailable: boolean;
      let occupiedUnits: number;
      if (staffId) {
        const hasOverlap = dayBookings.some(b => overlaps(b.startDatetime, b.endDatetime, startISO, endISO));
        isAvailable  = !isManuallyBlocked && !hasOverlap;
        occupiedUnits = hasOverlap ? item.unitQuantity : 0;
      } else {
        occupiedUnits = dayBookings.reduce((sum, b) => {
          if (overlaps(b.startDatetime, b.endDatetime, startISO, endISO)) return sum + b.unitsReserved;
          return sum;
        }, 0);
        isAvailable = !isManuallyBlocked && occupiedUnits < item.unitQuantity;
      }

      slots.push({
        startDatetime:  startISO,
        endDatetime:    endISO,
        availableUnits: Math.max(0, item.unitQuantity - occupiedUnits),
        totalUnits:     item.unitQuantity,
        isAvailable,
        isBlocked: isManuallyBlocked,
      });

      slotStartMin += item.durationMinutes;
    }
  }

  return slots;
}

// ── Motor de cruce de calendarios ─────────────────────────────────────────────
//
// Corazón del sistema de disponibilidad compatible GO.
// Regla única: solo se muestran huecos donde AMBAS partes están libres.
//
//   Proveedor libre + Cliente libre → HUECO COMPATIBLE ✓
//   Proveedor libre + Cliente ocupado → oculto
//   Proveedor ocupado → oculto (ya filtrado por getAvailableSlots)

export type ClientBusyInterval = {
  start:   string; // ISO
  end:     string; // ISO
  reason?: string; // "Reserva confirmada", "Reunión", etc.
};

/**
 * crossCalendars — función pura, sin IO.
 *
 * Recibe los huecos libres del proveedor y los intervalos ocupados del cliente.
 * Devuelve ÚNICAMENTE los huecos donde ambas partes están disponibles.
 *
 * Complejidad O(n × m). Para n,m < 100 (uso real de agenda diaria) es
 * instantáneo. Sin caché necesaria.
 *
 * @example
 * // Proveedor tiene: 09:00, 09:30, 10:00, 12:00, 15:00
 * // Cliente ocupado: 09:00–11:00
 * // Resultado: 12:00, 15:00
 */
export function crossCalendars(
  providerSlots: AvailableSlot[],
  clientBusy: ClientBusyInterval[],
): AvailableSlot[] {
  if (clientBusy.length === 0) return providerSlots;
  return providerSlots.filter(
    (slot) =>
      !clientBusy.some((busy) =>
        overlaps(slot.startDatetime, slot.endDatetime, busy.start, busy.end),
      ),
  );
}

/**
 * getCrossedAvailableSlots — motor completo de disponibilidad cruzada.
 *
 * Pipeline completo:
 *   1. getAvailableSlots() → huecos libres del proveedor
 *   2. crossCalendars()    → filtra los que chocan con el cliente
 *   3. Devuelve solo huecos compatibles
 *
 * Sin clientBusy = equivale a getAvailableSlots() (comportamiento anterior).
 * Compatible hacia atrás: ningún código existente se rompe.
 *
 * Cubre: peluquería, restaurante, pádel, clínica, visita comercial,
 * reunión, servicio a domicilio — cualquier actividad con hora.
 * Una visita comercial también es una reserva con hora.
 */
export async function getCrossedAvailableSlots(
  businessId:     string,
  bookableItemId: string,
  dateISO:        string,
  clientBusy:     ClientBusyInterval[] = [],
  staffId?:       string,
): Promise<AvailableSlot[]> {
  const providerSlots = await getAvailableSlots(businessId, bookableItemId, dateISO, staffId);
  return crossCalendars(providerSlots, clientBusy);
}

/**
 * getAllCrossedSlots — vista completa con estado de cruce.
 *
 * Como getAllSlots pero añade `clientConflict: boolean` para que la UI
 * de administración pueda mostrar por qué un hueco no está disponible
 * (si es por capacidad del proveedor o por agenda del cliente).
 */
export type CrossedSlot = SlotWithStatus & {
  clientConflict: boolean; // true → hueco libre para el proveedor pero ocupado para el cliente
};

export async function getAllCrossedSlots(
  businessId:     string,
  bookableItemId: string,
  dateISO:        string,
  clientBusy:     ClientBusyInterval[] = [],
  staffId?:       string,
): Promise<CrossedSlot[]> {
  const allSlots = await getAllSlots(businessId, bookableItemId, dateISO, staffId);
  return allSlots.map((slot) => ({
    ...slot,
    clientConflict:
      slot.isAvailable &&
      clientBusy.some((busy) =>
        overlaps(slot.startDatetime, slot.endDatetime, busy.start, busy.end),
      ),
  }));
}

// ── Unified Reservation Availability Engine ────────────────────────────────────
//
// getAvailableReservationSlots() — MOTOR ÚNICO DE DISPONIBILIDAD
//
// Fuente de verdad: config de empresa/staff pasado directamente desde
// GoBusinessConfigContext. NUNCA mezcla horario empresa con horario personalizado.
// Garantiza: slot cabe COMPLETO en el turno, sin duplicados, sin restos.
// ──────────────────────────────────────────────────────────────────────────────

export type DayShiftInput   = { from: string; to: string; active: boolean };
export type DayScheduleInput = { shift1: DayShiftInput; shift2: DayShiftInput };
export type StaffScheduleInput = {
  useCompanySchedule: boolean;
  daySchedules: Record<string, DayScheduleInput>; // "0"=Lun..."6"=Dom
};
export type StaffOption = {
  id:             string;
  name:           string;
  services:       string[];            // títulos de servicios — fallback por nombre
  serviceIds?:    string[];            // BookableItem IDs — validación principal
  scheduleConfig: StaffScheduleInput | null;
};
export type GetReservationSlotsParams = {
  businessId:           string;
  selectedDate:         string;        // "YYYY-MM-DD"
  serviceId:            string;        // BookableItem id (para cruzar con reservas)
  serviceName:          string;        // Para validar que el profesional hace el servicio
  durationMinutes:      number;
  professionalId:       string | "any" | null; // null=no elegido, "any"=sin preferencia
  professionalName?:    string;
  staffServices?:       string[];      // títulos de servicios — fallback si no hay IDs
  staffServiceIds?:     string[];      // BookableItem IDs del profesional — validación principal
  // Horario de empresa (configDay: 0=Lun...6=Dom)
  businessActiveDays:   number[];
  businessDaySchedules: Record<string, DayScheduleInput>;
  businessOpenFrom:     string;        // "HH:MM" fallback
  businessOpenTo:       string;        // "HH:MM" fallback
  // Horario personalizado del profesional — null = usar horario empresa
  staffScheduleConfig:  StaffScheduleInput | null;
  // Para "any": todos los profesionales que podrían hacer el servicio
  allStaffOptions?:     StaffOption[];
  // Audit — nombre visible de la empresa
  businessName?:        string;
  // Ocupados del profesional — entradas de go_log_v1
  staffGoBusyIntervals?: ClientBusyInterval[];
  // Debug overlay callback — recibe trace de reservas + slots generados
  onDebugTrace?:         (trace: BookingEngineTrace) => void;
};
export type ReservationSlot = {
  time:             string; // "HH:MM"
  startDatetime:    string; // "YYYY-MM-DDTHH:MM:00"
  endDatetime:      string; // "YYYY-MM-DDTHH:MM:00"
  professionalId:   string;
  professionalName: string;
};

export type BookingEngineTrace = {
  bookedIntervals: { start: string; end: string }[];
  generatedSlots: {
    time:         string;
    endTime:      string;
    professional: string;
    blocked:      boolean;
    blockReason:  string;
    shiftNumber:  number;
  }[];
};

// Parsea "HH:MM" → minutos desde medianoche
function parseTimeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

// Convierte minutos desde medianoche → "HH:MM"
function minutesToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// Genera todos los slots de inicio válidos dentro de un turno
// (el servicio debe caber COMPLETAMENTE: slotStart + dur <= turnoFin)
// Granularidad de slots: 15 min independientemente de la duración del servicio.
// El servicio completo debe CABER en el turno (startMin + durationMinutes <= toMin).
// El paso NUNCA es la duración — así "11:00, 11:15, 11:30..." para cualquier servicio.
const SLOT_STEP_MIN = 15;

function slotsForShift(
  dateISO:         string,
  fromMin:         number,
  toMin:           number,
  durationMinutes: number,
): Array<{ startISO: string; endISO: string }> {
  const result: Array<{ startISO: string; endISO: string }> = [];
  // El paso es siempre SLOT_STEP_MIN (15 min); el filtro es que el servicio complete
  // quepa antes de cerrar el turno: startMin + durationMinutes <= toMin.
  for (let s = fromMin; s + durationMinutes <= toMin; s += SLOT_STEP_MIN) {
    const h   = Math.floor(s / 60);
    const m   = s % 60;
    const startISO = `${dateISO}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
    const endISO   = addMinutesLocal(startISO, durationMinutes);
    result.push({ startISO, endISO });
  }
  return result;
}

// Resuelve los turnos activos para un día concreto, eligiendo horario correcto
// configDay: 0=Lun, 1=Mar, ..., 6=Dom
function resolveShiftsForDay(
  configDay:            number,
  staffScheduleConfig:  StaffScheduleInput | null,
  businessActiveDays:   number[],
  businessDaySchedules: Record<string, DayScheduleInput>,
  businessOpenFrom:     string,
  businessOpenTo:       string,
): Array<{ fromMin: number; toMin: number }> {
  if (staffScheduleConfig && !staffScheduleConfig.useCompanySchedule) {
    // Horario personalizado del profesional — SOLO éste, nunca empresa
    const ds = staffScheduleConfig.daySchedules?.[String(configDay)];
    if (!ds) return [];
    const shifts: Array<{ fromMin: number; toMin: number }> = [];
    if (ds.shift1?.active !== false && ds.shift1?.from && ds.shift1?.to) {
      const fromMin = parseTimeToMinutes(ds.shift1.from);
      const toMin   = parseTimeToMinutes(ds.shift1.to);
      if (toMin > fromMin) shifts.push({ fromMin, toMin });
    }
    if (ds.shift2?.active && ds.shift2?.from && ds.shift2?.to) {
      const fromMin = parseTimeToMinutes(ds.shift2.from);
      const toMin   = parseTimeToMinutes(ds.shift2.to);
      if (toMin > fromMin) shifts.push({ fromMin, toMin });
    }
    return shifts;
  }

  // Horario empresa — SOLO si el día está activo
  if (!businessActiveDays.includes(configDay)) return [];
  const override = businessDaySchedules?.[String(configDay)];
  const shifts: Array<{ fromMin: number; toMin: number }> = [];

  const s1Active = override?.shift1?.active !== false;
  if (s1Active) {
    const fromStr = override?.shift1?.from ?? businessOpenFrom ?? "09:00";
    const toStr   = override?.shift1?.to   ?? businessOpenTo   ?? "20:00";
    const fromMin = parseTimeToMinutes(fromStr);
    const toMin   = parseTimeToMinutes(toStr);
    if (toMin > fromMin) shifts.push({ fromMin, toMin });
  }
  if (override?.shift2?.active && override.shift2.from && override.shift2.to) {
    const fromMin = parseTimeToMinutes(override.shift2.from);
    const toMin   = parseTimeToMinutes(override.shift2.to);
    if (toMin > fromMin) shifts.push({ fromMin, toMin });
  }
  return shifts;
}

/**
 * getAvailableReservationSlots — Motor único de disponibilidad de reservas.
 *
 * Implementa las 12 reglas del spec:
 *  1. Datos base desde parámetros (sin IO parcial)
 *  2. Valida que el profesional realice el servicio
 *  3. Elige horario correcto: custom > empresa (nunca mezcla)
 *  4. Respeta días cerrados
 *  5. Respeta horario partido (turno1 / turno2, sin generar huecos intermedios)
 *  6. El servicio completo cabe en el turno (slotEnd <= turnoFin)
 *  7. Excluye slots solapados con reservas activas (HOLD/CONFIRMED)
 *  8. Elimina duplicados por clave única
 *  9. Recalcula desde cero en cada llamada
 * 10. Ordena por hora
 * 11. Soporta "any" (sin preferencia): recorre todos los profesionales elegibles
 * 12. Logs de debug temporales
 */
export async function getAvailableReservationSlots(
  params: GetReservationSlotsParams,
): Promise<ReservationSlot[]> {
  const {
    businessId,
    selectedDate,
    serviceId,
    serviceName,
    durationMinutes,
    professionalId,
    professionalName = "",
    staffServices = [],
    staffServiceIds = [],
    businessActiveDays,
    businessDaySchedules,
    businessOpenFrom,
    businessOpenTo,
    staffScheduleConfig,
    allStaffOptions = [],
    businessName = "",
    staffGoBusyIntervals = [],
  } = params;

  // ── DIAGNÓSTICO: fuente de datos y parámetros de entrada ─────────────────────
  console.log("[AVAILABLE_SLOTS_SOURCE]", {
    storageKey: "go_bookings_v1",
    readsFn:    "getBookings()",
    file:       "data/booking.ts",
    fn:         "getAvailableReservationSlots",
    note:       "slot engine reads REAL bookings — NOT go_log_v1",
  });
  console.log("[AVAILABLE_SLOTS_INPUT]", {
    businessId,
    staffId:  professionalId ?? "(any)",
    date:     selectedDate,
    serviceId,
  });

  // ── AUDITORÍA: EMPRESA ────────────────────────────────────────────────────────
  console.log("[AUDIT:EMPRESA]", { id: businessId, nombre: businessName || "(sin nombre)" });

  // ── AUDITORÍA: SERVICIO ───────────────────────────────────────────────────────
  console.log("[AUDIT:SERVICIO]", { id: serviceId, nombre: serviceName, duracion: `${durationMinutes}min` });

  // ── 1. Weekday (JS: 0=Dom; configDay: 0=Lun…6=Dom) ──────────────────────────
  const jsDay     = new Date(selectedDate + "T00:00:00").getDay();
  const configDay = (jsDay + 6) % 7;
  const DAY_NAMES = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
  console.log("[AUDIT:FECHA]", { fecha: selectedDate, diaSemana: DAY_NAMES[configDay] ?? configDay });

  // ── 2. Reservas bloqueantes (todos los estados activos) ──────────────────────
  const allBookings = await getBookings({ businessId, status: BLOCKING_STATUSES });
  // ── LOG EXACTO: objetos leídos de go_bookings_v1 para este businessId ────────
  console.log("[GO_BOOKINGS_V1:READ@SLOTS] businessId consultado →", businessId);
  console.log("[GO_BOOKINGS_V1:READ@SLOTS] TODOS los objetos leídos →", JSON.stringify(
    allBookings.map(b => ({
      id:            b.id,
      businessId:    b.businessId,
      staffId:       b.staffId,          // undefined = Indistinto
      startDatetime: b.startDatetime,
      endDatetime:   b.endDatetime,
      status:        b.status,
    })), null, 2
  ));
  // Todas las reservas bloqueantes para este día (todos los servicios).
  // El filtro por bookableItemId se suprimió intencionalmente: un profesional
  // concreto no puede atender dos servicios a la vez, por lo que cualquier
  // reserva suya bloquea el slot independientemente del servicio reservado.
  const allDayBookings = deduplicateBookings(
    allBookings.filter((b) => b.startDatetime.startsWith(selectedDate))
  );
  console.log("[GO_BOOKINGS_V1:READ@SLOTS] Reservas del día", selectedDate, "→", JSON.stringify(
    allDayBookings.map(b => ({ id: b.id, staffId: b.staffId, startDatetime: b.startDatetime, status: b.status })), null, 2
  ));
  console.log("[BOOKINGS_FOUND_FOR_DAY]", {
    date:       selectedDate,
    businessId,
    staffId:    professionalId ?? "(any)",
    totalBookingsInStorage: allBookings.length,
    bookingsThisDay: allDayBookings.map(b => ({
      id:         b.id,
      businessId: b.businessId,
      staffId:    b.staffId ?? "(any)",
      date:       b.startDatetime.slice(0, 10),
      startTime:  b.startDatetime.slice(11, 16),
      endTime:    b.endDatetime.slice(11, 16),
      status:     b.status,
      slotKey:    (b as any).slotKey ?? "(none)",
    })),
  });

  // ── NORMALIZED BLOCKING CHECK ──────────────────────────────────────────────
  // Explicit 5-condition check — does NOT rely on slotKey or pre-filtered closure.
  // Conditions: businessId + staffId + date + active status + time overlap.
  // Uses allBookings directly (already filtered by businessId+BLOCKING_STATUSES).
  // ── Name-normalizer helpers (scoped to the engine) ───────────────────────────
  // Used for legacy staffId fallback: "st-isa" and "nemesi_molina_staff_isa" both → "isa".
  const _engineNormN = (n: string): string =>
    n.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
  const _engineNameFromId = (id: string): string =>
    id.includes("_staff_")
      ? (id.split("_staff_").pop() ?? "").replace(/_/g, "")
      : (id.split("-").pop() ?? "").replace(/_/g, "");

  function bookingBlocksSlot(
    b:                 typeof allBookings[0],
    candidateStartISO: string,
    candidateEndISO:   string,
    proId:             string | null | undefined,
    proName?:          string, // optional name for legacy-ID fallback
  ): boolean {
    // businessId — guaranteed by getBookings() but explicit for safety
    if (b.businessId !== businessId) return false;
    // active status — guaranteed by getBookings(BLOCKING_STATUSES) but explicit
    if (!BLOCKING_STATUSES.includes(b.status as any)) return false;
    // date — booking must be on the same date as the candidate
    if (!b.startDatetime.startsWith(selectedDate)) return false;
    // staffId — when a specific professional is requested, only their bookings block.
    //   If proId is "any" or falsy → all day bookings block (business-wide).
    //   CRITICAL: skip ONLY when BOTH sides have a defined, differing staffId.
    //   If b.staffId is undefined (Indistinto booking), it blocks ALL specific professionals.
    if (proId && proId !== "any" && b.staffId !== undefined && b.staffId !== proId) {
      // Exact ID mismatch — try name-based fallback to catch legacy IDs.
      // e.g. "st-isa" vs "nemesi_molina_staff_isa": both normalise to "isa".
      const bName    = _engineNormN(_engineNameFromId(b.staffId));
      const proNorm  = proName
        ? _engineNormN(proName)
        : _engineNormN(_engineNameFromId(proId));
      if (!bName || bName !== proNorm) return false;
      // Names match → treat as same professional, fall through to overlap check.
      console.log("[ENGINE:STAFFID_NAME_FALLBACK]", {
        bookingStaffId: b.staffId, bookingName: bName,
        proId, proNorm, action: "treating as same professional",
      });
    }
    // time overlap: candidateStart < existingEnd AND candidateEnd > existingStart
    return candidateStartISO < b.endDatetime && candidateEndISO > b.startDatetime;
  }

  // isBlocked / blockReason accept an explicit proId so the "any"-path loop can
  // pass staff.id per iteration rather than relying on a shared closure variable.
  // proName is used for the name-based legacy-ID fallback inside bookingBlocksSlot.
  function isBlocked(startISO: string, endISO: string, proId?: string | null, proName?: string): boolean {
    const pid   = proId   !== undefined ? proId   : professionalId;
    const pname = proName !== undefined ? proName : professionalName;
    if (allBookings.some(b => bookingBlocksSlot(b, startISO, endISO, pid, pname))) return true;
    if (staffGoBusyIntervals.some(g => overlaps(startISO, endISO, g.start, g.end))) return true;
    return false;
  }

  function blockReason(startISO: string, endISO: string, proId?: string | null, proName?: string): string {
    const pid   = proId   !== undefined ? proId   : professionalId;
    const pname = proName !== undefined ? proName : professionalName;
    const byBook = allBookings.find(b => bookingBlocksSlot(b, startISO, endISO, pid, pname));
    if (byBook) {
      console.log("[SLOT_BLOCKED_BY_BOOKING]", {
        candidateStart: startISO.substring(11, 16),
        candidateEnd:   endISO.substring(11, 16),
        blockedBy: {
          id:         byBook.id,
          businessId: byBook.businessId,
          staffId:    byBook.staffId ?? "(any)",
          date:       byBook.startDatetime.slice(0, 10),
          startTime:  byBook.startDatetime.substring(11, 16),
          endTime:    byBook.endDatetime.substring(11, 16),
          status:     byBook.status,
        },
      });
      return `reserva ${byBook.startDatetime.substring(11,16)}-${byBook.endDatetime.substring(11,16)}`;
    }
    const byGo = staffGoBusyIntervals.find(g => overlaps(startISO, endISO, g.start, g.end));
    if (byGo) return `GO ${byGo.start.substring(11,16)}-${byGo.end.substring(11,16)}`;
    return "";
  }

  // ── 3. GO bloqueantes del profesional ────────────────────────────────────────
  console.log("[AUDIT:GO]", `(${staffGoBusyIntervals.length})`,
    staffGoBusyIntervals.map(g => `${g.start.substring(11,16)}-${g.end.substring(11,16)}`));

  // Trace data — booked intervals para el overlay (disponible en ambos paths)
  const _bookedIntervalsTrace = allDayBookings.map(b => ({
    start: b.startDatetime.substring(11, 16),
    end:   b.endDatetime.substring(11, 16),
  }));

  // ── "Sin preferencia" (any) ──────────────────────────────────────────────────
  if (professionalId === "any") {
    // Prioridad: ID (go_staff_v1) → nombre (plantillaItems) → sin restricción
    const eligible = allStaffOptions.filter((s) => {
      const hasIdRestriction   = s.serviceIds && s.serviceIds.length > 0;
      const hasNameRestriction = s.services.length > 0;
      if (!hasIdRestriction && !hasNameRestriction) return true; // sin restricción
      if (hasIdRestriction)   return s.serviceIds!.includes(serviceId);
      // Fallback nombre — insensible a mayúsculas y espacios
      return s.services.some(
        (sv) => sv.toLowerCase().trim() === serviceName.toLowerCase().trim(),
      );
    });

    console.log("[AUDIT:PROFESIONALES]", eligible.map(s => ({
      id:      s.id,
      nombre:  s.name,
      horario: (s.scheduleConfig && !s.scheduleConfig.useCompanySchedule) ? "personalizado" : "empresa",
    })));

    const slotMap = new Map<string, ReservationSlot>();
    const _traceSlots: BookingEngineTrace["generatedSlots"] = [];

    for (const staff of eligible) {
      const shifts = resolveShiftsForDay(
        configDay,
        staff.scheduleConfig,
        businessActiveDays,
        businessDaySchedules,
        businessOpenFrom,
        businessOpenTo,
      );
      const schedSource = (staff.scheduleConfig && !staff.scheduleConfig.useCompanySchedule)
        ? "professional_custom" : "business";
      console.log("[AUDIT:HORARIO_USADO]", {
        profesional:    staff.name,
        scheduleSource: schedSource,
        turnos: shifts.map((sh, i) => ({
          turno:  i + 1,
          desde:  minutesToHHMM(sh.fromMin),
          hasta:  minutesToHHMM(sh.toMin),
          active: true,
        })),
      });
      for (let si = 0; si < shifts.length; si++) {
        const sh = shifts[si];
        const shCandidates = slotsForShift(selectedDate, sh.fromMin, sh.toMin, durationMinutes);
        for (const c of shCandidates) {
          // Pass staff.id + staff.name explicitly so blockReason scopes to this professional
          // and can use name-based fallback for legacy IDs.
          const reason = blockReason(c.startISO, c.endISO, staff.id, staff.name);
          _traceSlots.push({
            time:         c.startISO.substring(11, 16),
            endTime:      c.endISO.substring(11, 16),
            professional: staff.name,
            blocked:      !!reason,
            blockReason:  reason,
            shiftNumber:  si + 1,
          });
          if (reason) {
            const code = reason.startsWith("reserva") ? "overlaps_existing_reservation" : "overlaps_professional_go";
            console.log(`[AUDIT:SLOT_ELIMINADO] ${c.startISO.substring(11,16)}-${c.endISO.substring(11,16)} → ${code} (${reason})`);
          } else if (!slotMap.has(c.startISO)) {
            slotMap.set(c.startISO, {
              time:             c.startISO.substring(11, 16),
              startDatetime:    c.startISO,
              endDatetime:      c.endISO,
              professionalId:   staff.id,
              professionalName: staff.name,
            });
          } else {
            console.log(`[AUDIT:SLOT_ELIMINADO] ${c.startISO.substring(11,16)} → duplicated_slot (ya cubierto por otro profesional)`);
          }
        }
      }
    }

    const result = Array.from(slotMap.values()).sort((a, b) =>
      a.startDatetime.localeCompare(b.startDatetime),
    );
    console.log("[AUDIT:SLOTS_FINALES]", result.map(s => ({
      startTime: s.time, endTime: s.endDatetime.substring(11,16),
      professionalId: s.professionalId, professionalName: s.professionalName,
      serviceId, serviceName, durationMinutes,
    })));
    params.onDebugTrace?.({ bookedIntervals: _bookedIntervalsTrace, generatedSlots: _traceSlots });
    return result;
  }

  // ── Profesional específico ───────────────────────────────────────────────────

  // Paso 1: Validar relación profesional ↔ servicio
  // Prioridad: ID (principal) → nombre (fallback) → sin restricción (todos)
  const _staffServiceIds  = staffServiceIds  ?? [];
  const _staffServices    = staffServices    ?? [];
  const hasByIds   = _staffServiceIds.length > 0;
  const hasByNames = _staffServices.length  > 0;
  let canDo             = true;
  let validationMethod  = "sin_restriccion";

  if (hasByIds) {
    canDo            = _staffServiceIds.includes(serviceId);
    validationMethod = "por_id";
  } else if (hasByNames) {
    canDo            = _staffServices.some(sv => sv.toLowerCase().trim() === serviceName.toLowerCase().trim());
    validationMethod = "por_nombre_fallback";
  }

  console.log("[AUDIT:PRO_SERVICE_RELATION]", {
    professionalId,
    professionalName,
    serviceIds:             _staffServiceIds,
    serviceNames:           _staffServices,
    validationMethod,
    professionalCanDoService: canDo,
  });

  if (!canDo) {
    console.log("[AUDIT:SLOT_ELIMINADO] ALL → professional_does_not_offer_service");
    params.onDebugTrace?.({ bookedIntervals: _bookedIntervalsTrace, generatedSlots: [] });
    return [];
  }

  // Paso 2: Elegir horario correcto (custom o empresa, nunca mezcla)
  const shifts = resolveShiftsForDay(
    configDay,
    staffScheduleConfig,
    businessActiveDays,
    businessDaySchedules,
    businessOpenFrom,
    businessOpenTo,
  );
  const schedSource = (staffScheduleConfig && !staffScheduleConfig.useCompanySchedule)
    ? "professional_custom" : "business";

  console.log("[AUDIT:HORARIO_USADO]", {
    profesional:    professionalName,
    scheduleSource: schedSource,
    turnos: shifts.map((sh, i) => ({
      turno:  i + 1,
      desde:  minutesToHHMM(sh.fromMin),
      hasta:  minutesToHHMM(sh.toMin),
      active: true,
    })),
  });

  // Paso 3: Día cerrado → sin slots
  if (shifts.length === 0) {
    console.log("[AUDIT:SLOT_ELIMINADO] ALL → day_closed");
    console.log("[AUDIT:SLOTS_FINALES] []");
    params.onDebugTrace?.({ bookedIntervals: _bookedIntervalsTrace, generatedSlots: [] });
    return [];
  }

  // Paso 4: Generar candidatos por turno (servicio completo debe caber)
  const generatedLog: Array<{ startTime: string; endTime: string; shiftNumber: number; reasonCreated: string }> = [];
  const allCandidatesWithShift: Array<{ startISO: string; endISO: string; shiftIdx: number }> = [];

  for (let si = 0; si < shifts.length; si++) {
    const sh = shifts[si];
    const shCandidates = slotsForShift(selectedDate, sh.fromMin, sh.toMin, durationMinutes);
    for (const c of shCandidates) {
      allCandidatesWithShift.push({ ...c, shiftIdx: si });
      generatedLog.push({
        startTime:     c.startISO.substring(11, 16),
        endTime:       c.endISO.substring(11, 16),
        shiftNumber:   si + 1,
        reasonCreated: `cabe_en_turno_${si + 1} (${minutesToHHMM(sh.fromMin)}-${minutesToHHMM(sh.toMin)})`,
      });
    }
  }
  console.log("[AUDIT:SLOTS_GENERADOS]", generatedLog);

  // Paso 5: Filtrar, deduplicar y auditar cada slot individualmente
  const seen = new Set<string>();
  const result: ReservationSlot[] = [];

  for (const c of allCandidatesWithShift) {
    const key = `${businessId}_${selectedDate}_${serviceId}_${professionalId ?? ""}_${c.startISO}`;
    if (seen.has(key)) {
      console.log(`[AUDIT:SLOT_ELIMINADO] ${c.startISO.substring(11,16)}-${c.endISO.substring(11,16)} → duplicated_slot`);
      continue;
    }
    seen.add(key);
    const reason = blockReason(c.startISO, c.endISO);
    if (reason) {
      const code = reason.startsWith("reserva") ? "overlaps_existing_reservation" : "overlaps_professional_go";
      console.log(`[AUDIT:SLOT_ELIMINADO] ${c.startISO.substring(11,16)}-${c.endISO.substring(11,16)} → ${code} (${reason})`);
    } else {
      result.push({
        time:             c.startISO.substring(11, 16),
        startDatetime:    c.startISO,
        endDatetime:      c.endISO,
        professionalId:   professionalId ?? "",
        professionalName: professionalName,
      });
    }
  }

  result.sort((a, b) => a.startDatetime.localeCompare(b.startDatetime));

  console.log("[AUDIT:SLOTS_FINALES]", result.map(s => ({
    startTime:      s.time,
    endTime:        s.endDatetime.substring(11, 16),
    professionalId: s.professionalId,
    professionalName: s.professionalName,
    serviceId,
    serviceName,
    durationMinutes,
  })));
  params.onDebugTrace?.({
    bookedIntervals: _bookedIntervalsTrace,
    generatedSlots:  allCandidatesWithShift.map(c => {
      const reason = blockReason(c.startISO, c.endISO);
      return {
        time:         c.startISO.substring(11, 16),
        endTime:      c.endISO.substring(11, 16),
        professional: professionalName,
        blocked:      !!reason,
        blockReason:  reason,
        shiftNumber:  c.shiftIdx + 1,
      };
    }),
  });
  console.log("[AVAILABLE_SLOTS_AFTER_FILTER]", {
    businessId,
    staffId:    professionalId ?? "(any)",
    date:       selectedDate,
    totalSlots: result.length,
    slots: result.map(s => ({
      time:    s.time,
      endTime: s.endDatetime?.slice(11, 16),
      slotKey: getBookingSlotKey({ businessId, staffId: s.professionalId, startDatetime: s.startDatetime, endDatetime: s.endDatetime }),
    })),
  });
  return result;
}

// ── Ocupados del profesional — go_log_v1 ──────────────────────────────────────
//
// Lee entradas de go_log_v1 donde professionalId coincide con el profesional
// y dateISO coincide con el día. Ignora eliminadas/rechazadas.
// Devuelve ClientBusyInterval[] para pasar a getAvailableReservationSlots.
//
// FUENTES:
//  1. Entradas GO normales — `professionalId === staffId` (visitas, reuniones…)
//  2. Entradas GO_BOOKING  — `staffId === staffId && type === "GO_BOOKING"`
//     Las reservas confirmadas se guardan en go_log_v1 con el campo `staffId`
//     (NO `professionalId`). Esta segunda capa garantiza que el motor de slots
//     use la MISMA lógica de bloqueo que `_checkProposalOverlap` (cambio propuesto).
//
// Estados que NO bloquean (misma regla que _checkProposalOverlap):
//   rechazado | cancelado | propuesto (tarjeta fantasma = posición propuesta)
// Estados que SÍ bloquean:
//   aceptado | pendiente | propuesta_pendiente | cualquier otro no excluido

export async function getStaffGoLogBusy(
  staffId:  string,
  dateISO:  string,
): Promise<ClientBusyInterval[]> {
  if (!staffId) return [];
  try {
    const raw = await AsyncStorage.getItem("go_log_v1");
    if (!raw) return [];
    const entries: Array<{
      id?:             string;
      professionalId?: string;
      staffId?:        string;  // GO_BOOKING entries use staffId, not professionalId
      type?:           string;
      dateISO?:        string;
      time?:           string;
      duration?:       string;
      deleted?:        boolean;
      estado?:         string;
    }> = JSON.parse(raw);

    const _parseBusy = (e: (typeof entries)[0]): ClientBusyInterval | null => {
      if (!e.time || typeof e.time !== "string") return null;
      const parts    = e.time.split(":");
      const h        = parseInt(parts[0] ?? "0", 10);
      const m        = parseInt(parts[1] ?? "0", 10);
      const startMin = h * 60 + m;
      const durMatch = (e.duration ?? "").match(/^(\d+)min$/);
      const durMin   = durMatch ? parseInt(durMatch[1], 10) : 60;
      const endMin   = startMin + durMin;
      const startISO = `${dateISO}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00`;
      const endISO   = `${dateISO}T${String(Math.floor(endMin/60)).padStart(2,"0")}:${String(endMin%60).padStart(2,"0")}:00`;
      return { start: startISO, end: endISO, reason: `GO log ${e.type ?? "entry"} ${e.time}` };
    };

    const _shouldBlock = (e: (typeof entries)[0]): boolean => {
      if (e.deleted) return false;
      // misma regla que _checkProposalOverlap
      if (e.estado === "rechazado" || e.estado === "cancelado" || e.estado === "propuesto") return false;
      return true;
    };

    const result: ClientBusyInterval[] = [];
    for (const e of entries) {
      if (e.dateISO !== dateISO) continue;
      if (!_shouldBlock(e)) continue;

      // Fuente 1: entrada GO normal (professionalId)
      // Fuente 2: cualquier tipo de entrada con staffId — misma lógica que _checkProposalOverlap
      // (sin restricción e.type === "GO_BOOKING": _checkProposalOverlap no filtra por tipo)
      const isStaffMatch =
        e.professionalId === staffId ||
        e.staffId === staffId;

      if (!isStaffMatch) continue;
      const interval = _parseBusy(e);
      if (interval) result.push(interval);
    }

    return result;
  } catch {
    return [];
  }
}

// ── DEBUG TEST — Isa + Tinte/Lavado en Lunes ──────────────────────────────────
//
// Test obligatorio del spec. Llama a getAvailableReservationSlots con parámetros
// hardcoded y verifica el resultado esperado.
// Invocar con: import { runReservasDebugTest } from "@/data/booking"; en GoDevPanel.

export async function runReservasDebugTest(): Promise<void> {
  console.log("====== DEBUG RESERVAS: TEST ISA — INICIO ======");
  console.log("[DEBUG_TEST] SLOT_STEP_MIN =", SLOT_STEP_MIN, "(slots cada 15min para cualquier duración)");

  // ── Horario personalizado de Isa (configDay: 0=Lun, 1=Mar…6=Dom, 5=Sáb) ──
  const ISA_SCHED: StaffScheduleInput = {
    useCompanySchedule: false,
    daySchedules: {
      // Lunes: dos turnos
      "0": { shift1: { from: "11:00", to: "13:00", active: true  },
             shift2: { from: "17:00", to: "19:00", active: true  } },
      // Sábado: turno único
      "5": { shift1: { from: "09:00", to: "14:00", active: true  },
             shift2: { from: "",      to: "",       active: false } },
      // Mar/Mié/Jue/Vie/Dom: cerrados (no existen en daySchedules → shifts=[])
    },
  };

  // Calcular próximo lunes desde hoy
  const today     = new Date();
  const jsDay     = today.getDay(); // 0=Dom…6=Sáb
  const daysToMon = jsDay === 1 ? 7 : (8 - jsDay) % 7 || 7;
  const monday    = new Date(today);
  monday.setDate(today.getDate() + daysToMon);
  const isoDate = (d: Date) => [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");

  const mondayISO   = isoDate(monday);
  const tuesdayISO  = isoDate(new Date(monday.getTime() + 86400000));
  const saturdayISO = isoDate(new Date(monday.getTime() + 5 * 86400000));

  console.log(`[DEBUG_TEST] Lunes: ${mondayISO}  Martes: ${tuesdayISO}  Sábado: ${saturdayISO}`);

  const baseParams = {
    businessId:           "nemesi_molina",
    businessName:         "Nemesi Molina",
    professionalId:       "nemesi_molina_staff_isa",
    professionalName:     "Isa",
    staffScheduleConfig:  ISA_SCHED,
    businessActiveDays:   [0, 1, 2, 3, 4, 5],
    businessDaySchedules: {} as Record<string, DayScheduleInput>,
    businessOpenFrom:     "09:00",
    businessOpenTo:       "20:00",
    staffGoBusyIntervals: [],
  };

  let allPass = true;

  // ── TEST 1: Prueba de tinte 45min — LUNES (turno partido 11-13 y 17-19) ──
  // Con step=15min: caben 11:00…12:15 en el turno mañana, y 17:00…18:15 en el turno tarde.
  console.log("\n--- TEST 1: Prueba de tinte 45min — Lunes ---");
  const t1Slots = await getAvailableReservationSlots({
    ...baseParams,
    selectedDate:    mondayISO,
    serviceId:       "test_tinte45_id",
    serviceName:     "Prueba de tinte",
    durationMinutes: 45,
    staffServices:   ["Prueba de tinte"],
    staffServiceIds: ["test_tinte45_id"],
  });
  const t1Times  = t1Slots.map(s => s.time);
  const wantT1   = [
    "11:00","11:15","11:30","11:45","12:00","12:15",
    "17:00","17:15","17:30","17:45","18:00","18:15",
  ];
  const t1Pass   = JSON.stringify(t1Times) === JSON.stringify(wantT1);
  allPass       = allPass && t1Pass;
  console.log(`[TEST:TINTE45_LUN] esperado → ${wantT1.join(", ")}`);
  console.log(`[TEST:TINTE45_LUN] obtenido → ${t1Times.join(", ")}`);
  console.log(`[TEST:TINTE45_LUN] ${t1Pass ? "✅ PASS" : "❌ FAIL"}`);

  // ── TEST 2: Prueba de tinte 45min — SÁBADO (turno único 09-14) ────────────
  // Último slot válido: 13:15 (13:15+45=14:00 ≤ 14:00); 13:30+45=14:15 > 14:00.
  console.log("\n--- TEST 2: Prueba de tinte 45min — Sábado ---");
  const t2Slots = await getAvailableReservationSlots({
    ...baseParams,
    selectedDate:    saturdayISO,
    serviceId:       "test_tinte45_id",
    serviceName:     "Prueba de tinte",
    durationMinutes: 45,
    staffServices:   ["Prueba de tinte"],
    staffServiceIds: ["test_tinte45_id"],
  });
  const t2Times  = t2Slots.map(s => s.time);
  const wantT2   = [
    "09:00","09:15","09:30","09:45",
    "10:00","10:15","10:30","10:45",
    "11:00","11:15","11:30","11:45",
    "12:00","12:15","12:30","12:45",
    "13:00","13:15",
  ];
  const t2Pass   = JSON.stringify(t2Times) === JSON.stringify(wantT2);
  allPass       = allPass && t2Pass;
  console.log(`[TEST:TINTE45_SAB] esperado → ${wantT2.join(", ")}`);
  console.log(`[TEST:TINTE45_SAB] obtenido → ${t2Times.join(", ")}`);
  console.log(`[TEST:TINTE45_SAB] ${t2Pass ? "✅ PASS" : "❌ FAIL"}`);

  // ── TEST 3: Martes — CERRADO (Isa no trabaja martes) ─────────────────────
  console.log("\n--- TEST 3: Prueba de tinte 45min — Martes (cerrado) ---");
  const t3Slots = await getAvailableReservationSlots({
    ...baseParams,
    selectedDate:    tuesdayISO,
    serviceId:       "test_tinte45_id",
    serviceName:     "Prueba de tinte",
    durationMinutes: 45,
    staffServices:   ["Prueba de tinte"],
    staffServiceIds: ["test_tinte45_id"],
  });
  const t3Times  = t3Slots.map(s => s.time);
  const t3Pass   = t3Times.length === 0;
  allPass       = allPass && t3Pass;
  console.log(`[TEST:TINTE45_MAR] esperado → [] (día cerrado)`);
  console.log(`[TEST:TINTE45_MAR] obtenido → [${t3Times.join(", ")}]`);
  console.log(`[TEST:TINTE45_MAR] ${t3Pass ? "✅ PASS" : "❌ FAIL"}`);

  // ── TEST 4: Lavado 15min — LUNES (8 slots por turno, step=15) ─────────────
  console.log("\n--- TEST 4: Lavado 15min — Lunes ---");
  const t4Slots = await getAvailableReservationSlots({
    ...baseParams,
    selectedDate:    mondayISO,
    serviceId:       "test_lavado_id",
    serviceName:     "Lavado",
    durationMinutes: 15,
    staffServices:   ["Lavado"],
    staffServiceIds: ["test_lavado_id"],
  });
  const t4Times   = t4Slots.map(s => s.time);
  const wantT4    = [
    "11:00","11:15","11:30","11:45","12:00","12:15","12:30","12:45",
    "17:00","17:15","17:30","17:45","18:00","18:15","18:30","18:45",
  ];
  const t4Pass    = JSON.stringify(t4Times) === JSON.stringify(wantT4);
  allPass        = allPass && t4Pass;
  console.log(`[TEST:LAVADO_LUN] esperado → ${wantT4.join(", ")}`);
  console.log(`[TEST:LAVADO_LUN] obtenido → ${t4Times.join(", ")}`);
  console.log(`[TEST:LAVADO_LUN] ${t4Pass ? "✅ PASS" : "❌ FAIL"}`);

  // ── TEST 5: Tinte 90min — LUNES (step=15 → 3 slots/turno) ────────────────
  // Turno 11-13: 11:00(OK,ends12:30), 11:15(OK,ends12:45), 11:30(OK,ends13:00), 11:45(FALLA,ends13:15)
  // Turno 17-19: 17:00, 17:15, 17:30  (17:45+90=19:15 > 19:00)
  console.log("\n--- TEST 5: Tinte 90min — Lunes ---");
  const t5Slots = await getAvailableReservationSlots({
    ...baseParams,
    selectedDate:    mondayISO,
    serviceId:       "test_tinte90_id",
    serviceName:     "Tinte",
    durationMinutes: 90,
    staffServices:   ["Tinte"],
    staffServiceIds: ["test_tinte90_id"],
  });
  const t5Times  = t5Slots.map(s => s.time);
  const wantT5   = ["11:00","11:15","11:30","17:00","17:15","17:30"];
  const t5Pass   = JSON.stringify(t5Times) === JSON.stringify(wantT5);
  allPass       = allPass && t5Pass;
  console.log(`[TEST:TINTE90_LUN] esperado → ${wantT5.join(", ")}`);
  console.log(`[TEST:TINTE90_LUN] obtenido → ${t5Times.join(", ")}`);
  console.log(`[TEST:TINTE90_LUN] ${t5Pass ? "✅ PASS" : "❌ FAIL"}`);

  console.log(`\n====== DEBUG RESERVAS: ${allPass ? "✅ TODOS PASS" : "❌ ALGÚN FALLO"} ======`);
}

// ── My confirmed bookings (customer view) ──────────────────────────────────────

export async function getMyBookings(customerId: string): Promise<Booking[]> {
  return getBookings({
    customerId,
    status: ["CONFIRMED", "HOLD", "COMPLETED"],
  });
}

export async function getMyUpcomingBookings(customerId: string): Promise<Booking[]> {
  const now = new Date().toISOString();
  const all = await getBookings({ customerId, status: ["CONFIRMED"] });
  return all
    .filter(b => b.startDatetime > now)
    .sort((a, b) => a.startDatetime.localeCompare(b.startDatetime));
}

// ── Refund calculation ─────────────────────────────────────────────────────────

export function computeRefundInfo(
  policy: CancellationPolicy,
  booking: Booking,
  itemPrice: number
): { refundAmount: number; refundPercent: number; label: string; isFree: boolean } {
  const hoursUntil =
    (new Date(booking.startDatetime).getTime() - Date.now()) / 3_600_000;
  const withinFreeWindow =
    policy.freeUntilHours > 0 && hoursUntil >= policy.freeUntilHours;

  if (withinFreeWindow || policy.refundType === "free") {
    return {
      refundAmount: itemPrice,
      refundPercent: 100,
      isFree: true,
      label:
        policy.freeUntilHours > 0
          ? `Cancelación gratuita hasta ${policy.freeUntilHours}h antes`
          : "Cancelación siempre gratuita",
    };
  }

  switch (policy.refundType) {
    case "full":
      return { refundAmount: itemPrice, refundPercent: 100, isFree: false, label: "Devolución completa (100%)" };
    case "half":
      return { refundAmount: itemPrice * 0.5, refundPercent: 50, isFree: false, label: "Devolución del 50%" };
    case "partial": {
      const pct = policy.refundPercent ?? 0;
      return {
        refundAmount: itemPrice * pct / 100,
        refundPercent: pct,
        isFree: false,
        label: `Devolución del ${pct}%`,
      };
    }
    case "fixed_fee": {
      const fee = policy.fixedFee ?? 0;
      const refund = Math.max(0, itemPrice - fee);
      const pct = itemPrice > 0 ? Math.round((refund / itemPrice) * 100) : 0;
      return {
        refundAmount: refund,
        refundPercent: pct,
        isFree: false,
        label: `${fee}€ de gastos · devolución ${refund.toFixed(0)}€`,
      };
    }
    default:
      return { refundAmount: 0, refundPercent: 0, isFree: false, label: "Sin devolución" };
  }
}
