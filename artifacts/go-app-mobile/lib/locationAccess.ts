/** Native foreground authorization only. No storage, network, subscriptions or
 * permission cache: Allow Once and revoked permissions are re-read on every use.
 */
export type LocationPermission = { status: string; canAskAgain?: boolean;
  ios?: { accuracy?: string }; android?: { accuracy?: string } };
export type DevicePosition = { coords: { latitude: number; longitude: number; accuracy?: number | null }; timestamp?: number };
export type ForegroundLocationAdapter = {
  getForegroundPermissionsAsync: () => Promise<LocationPermission>;
  requestForegroundPermissionsAsync: () => Promise<LocationPermission>;
  hasServicesEnabledAsync: () => Promise<boolean>;
  getCurrentPositionAsync: (options: { accuracy: number; mayShowUserSettingsDialog: boolean }) => Promise<DevicePosition>;
  getLastKnownPositionAsync?: (options: { maxAge: number }) => Promise<DevicePosition | null>;
  Accuracy: { Lowest: number; Low?: number; Balanced?: number };
};
export type LocationReadOptions = { requestPermission?: boolean; accuracy?: number; lastKnownMaxAgeMs?: number; isActive?: () => boolean };
export class LocationAccessError extends Error {
  constructor(public code: "permission-denied" | "permission-blocked" | "services-disabled" | "inactive" | "unavailable" | "permission-changed") {
    super({ "permission-denied": "Ubicación no autorizada. Puedes introducir la ubicación manualmente.",
      "permission-blocked": "El permiso de ubicación está desactivado. Puedes abrir Ajustes o introducir la ubicación manualmente.",
      "services-disabled": "La localización del dispositivo está desactivada. Actívala en Ajustes o introduce la ubicación manualmente.",
      inactive: "La solicitud de ubicación ya no está activa.", unavailable: "No se pudo obtener la ubicación. Puedes introducirla manualmente.",
      "permission-changed": "El permiso o la precisión de ubicación ha cambiado. Vuelve a intentarlo o introduce la ubicación manualmente." }[code]);
    this.name = "LocationAccessError";
  }
}
const requests = new WeakMap<object, Promise<LocationPermission>>();
const checkActive = (options: LocationReadOptions) => { if (options.isActive && !options.isActive()) throw new LocationAccessError("inactive"); };
const reduced = (permission: LocationPermission) => permission.ios?.accuracy === "reduced" || permission.android?.accuracy === "coarse";
const denied = (permission: LocationPermission) => new LocationAccessError(permission.canAskAgain === false ? "permission-blocked" : "permission-denied");
export async function ensureForegroundLocationPermission(adapter: ForegroundLocationAdapter, options: LocationReadOptions = {}): Promise<LocationPermission> {
  checkActive(options);
  let permission = await adapter.getForegroundPermissionsAsync();
  checkActive(options);
  if (permission.status === "granted") return permission;
  if (options.requestPermission === false || permission.canAskAgain === false) throw denied(permission);
  const key = adapter.requestForegroundPermissionsAsync;
  let request = requests.get(key);
  if (!request) {
    request = adapter.requestForegroundPermissionsAsync();
    requests.set(key, request);
    void request.finally(() => { if (requests.get(key) === request) requests.delete(key); }).catch(() => {});
  }
  permission = await request;
  checkActive(options);
  if (permission.status !== "granted") throw denied(permission);
  return permission;
}
export async function readForegroundPosition(adapter: ForegroundLocationAdapter, options: LocationReadOptions = {}): Promise<DevicePosition> {
  checkActive(options);
  if (!await adapter.hasServicesEnabledAsync()) throw new LocationAccessError("services-disabled");
  const permission = await ensureForegroundLocationPermission(adapter, options);
  checkActive(options);
  try {
    let point: DevicePosition | null = null;
    // A previous precise fix must not bypass a later approximate permission.
    if (!reduced(permission) && options.lastKnownMaxAgeMs && adapter.getLastKnownPositionAsync) {
      point = await adapter.getLastKnownPositionAsync({ maxAge: options.lastKnownMaxAgeMs }).catch(() => null);
      checkActive(options);
    }
    if (!point) point = await adapter.getCurrentPositionAsync({
      accuracy: reduced(permission) ? adapter.Accuracy.Low ?? adapter.Accuracy.Lowest : options.accuracy ?? adapter.Accuracy.Balanced ?? adapter.Accuracy.Lowest,
      mayShowUserSettingsDialog: false,
    });
    checkActive(options);
    const current = await adapter.getForegroundPermissionsAsync();
    checkActive(options);
    if (current.status !== "granted") throw denied(current);
    if (!reduced(permission) && reduced(current)) throw new LocationAccessError("permission-changed");
    if (!Number.isFinite(point.coords.latitude) || !Number.isFinite(point.coords.longitude)
      || Math.abs(point.coords.latitude) > 90 || Math.abs(point.coords.longitude) > 180) throw new LocationAccessError("unavailable");
    return point;
  } catch (error) {
    if (error instanceof LocationAccessError) throw error;
    checkActive(options);
    if (!await adapter.hasServicesEnabledAsync()) throw new LocationAccessError("services-disabled");
    const current = await adapter.getForegroundPermissionsAsync();
    checkActive(options);
    if (current.status !== "granted") throw denied(current);
    throw new LocationAccessError("unavailable");
  }
}
