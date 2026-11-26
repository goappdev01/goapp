import { Alert, AppState, Linking, Platform } from "react-native";
import { ensureForegroundLocationPermission, readForegroundPosition, type ForegroundLocationAdapter, type LocationReadOptions } from "./locationAccess";

const activeOptions = (options: LocationReadOptions): LocationReadOptions => ({ ...options,
  isActive: () => AppState.currentState !== "background" && (!options.isActive || options.isActive()) });
export const readDeviceLocation = (adapter: ForegroundLocationAdapter, options: LocationReadOptions = {}) => readForegroundPosition(adapter, activeOptions(options));
/** Android geocoding needs authorization but does not need a GPS fix. */
export const ensureDeviceLocationPermission = (adapter: ForegroundLocationAdapter, options: LocationReadOptions = {}) => ensureForegroundLocationPermission(adapter, activeOptions(options));

/** Remediation only after a real obstruction; never a second permission dialog. */
export function offerLocationSettings(error: unknown, lang = "es", manual?: () => void): boolean {
  const code = (error as { code?: string })?.code;
  if (code !== "permission-blocked" && code !== "services-disabled") return false;
  const en = lang === "en", services = code === "services-disabled";
  Alert.alert(en ? "Location unavailable" : "Ubicación no disponible", services
    ? (en ? "Turn on location in device Settings > Privacy & Security > Location Services (iOS) or Location (Android), or enter a location manually." : "Activa la localización en Ajustes > Privacidad y seguridad > Localización (iOS) o Ubicación (Android), o introduce una ubicación manualmente.")
    : (en ? "Location permission is disabled. You can enable it in the app settings or enter a location manually." : "El permiso de ubicación está desactivado. Puedes activarlo en los ajustes de la aplicación o introducir una ubicación manualmente."), [
    { text: en ? "Enter manually" : "Introducir manualmente", style: "cancel", onPress: manual },
    { text: en ? "Open settings" : "Abrir ajustes", onPress: () => {
      return Promise.resolve().then(() => services && Platform.OS === "android"
        ? Linking.sendIntent("android.settings.LOCATION_SOURCE_SETTINGS") : Linking.openSettings())
        .catch(() => Alert.alert(en ? "Settings" : "Ajustes", en
        ? "Open device Settings > Location, or enter the location manually."
        : "Abre Ajustes del dispositivo > Localización o introduce la ubicación manualmente."));
    } },
  ]);
  return true;
}
