import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

export const LEGACY_AUTH_SESSION_KEY = "go_supabase_session_v1";
export const SECURE_AUTH_SESSION_KEY = "go_auth_session_v2";
export const AUTH_LOGOUT_MARKER_KEY = "go_auth_signed_out_v2";
const ACCOUNT_KEY = "go_account_type_v1";
const OPTIONS: SecureStore.SecureStoreOptions = {
  keychainService: "go.auth.session.v2",
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  requireAuthentication: false, // Protected storage without an Expo Go biometric entitlement.
};

export class AuthCredentialStorageError extends Error {
  constructor() {
    super("No se pudo acceder al almacenamiento protegido de la sesión. Desbloquea el dispositivo y vuelve a intentarlo.");
    this.name = "AuthCredentialStorageError";
  }
}
let operations: Promise<unknown> = Promise.resolve();
let signedOut = false;
let webSession: string | null = null; // Web has no SecureStore: never persist browser credentials in AsyncStorage.
function ordered<T>(operation: () => Promise<T>): Promise<T> {
  const next = operations.catch(() => {}).then(operation);
  operations = next.catch(() => {});
  return next.catch(() => { throw new AuthCredentialStorageError(); });
}

/** Keep only the session pair and identity hints. Cached identity is never a permission grant. */
function credentialBytes(raw: string): string | null {
  try {
    const value = JSON.parse(raw);
    if (typeof value?.access_token !== "string" || !value.access_token
      || typeof value.user?.id !== "string" || !value.user.id) return null;
    const role = value.user.user_metadata?.role;
    return JSON.stringify({
      access_token: value.access_token,
      ...(typeof value.refresh_token === "string" || value.refresh_token === null ? { refresh_token: value.refresh_token } : {}),
      ...(typeof value.expires_at === "number" && Number.isFinite(value.expires_at) ? { expires_at: value.expires_at } : {}),
      ...(typeof value.expires_in === "number" && Number.isFinite(value.expires_in) ? { expires_in: value.expires_in } : {}),
      user: { id: value.user.id,
        ...(typeof value.user.email === "string" ? { email: value.user.email } : {}),
        ...(typeof role === "string" ? { user_metadata: { role } } : {}),
      },
    });
  } catch { return null; }
}
async function nativeAvailable(): Promise<void> {
  if (!await SecureStore.isAvailableAsync()) throw new AuthCredentialStorageError();
}
async function writeVerified(bytes: string): Promise<void> {
  await SecureStore.setItemAsync(SECURE_AUTH_SESSION_KEY, bytes, OPTIONS);
  if (await SecureStore.getItemAsync(SECURE_AUTH_SESSION_KEY, OPTIONS) !== bytes) throw new AuthCredentialStorageError();
}
async function removeLegacy(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_AUTH_SESSION_KEY);
}

/** Migrate once: verified Keychain/Keystore write BEFORE deleting the old plaintext copy. */
export function readAuthCredentials(): Promise<string | null> {
  return ordered(async () => {
    if (signedOut || await AsyncStorage.getItem(AUTH_LOGOUT_MARKER_KEY) === "1") return null;
    if (Platform.OS !== "web") {
      await nativeAvailable();
      const protectedValue = await SecureStore.getItemAsync(SECURE_AUTH_SESSION_KEY, OPTIONS);
      if (protectedValue !== null) {
        const bytes = credentialBytes(protectedValue);
        if (!bytes) throw new AuthCredentialStorageError(); // Never resurrect a legacy session behind a broken protected record.
        if (await AsyncStorage.getItem(LEGACY_AUTH_SESSION_KEY) !== null) await removeLegacy();
        return signedOut ? null : bytes;
      }
    } else if (webSession !== null) {
      if (await AsyncStorage.getItem(LEGACY_AUTH_SESSION_KEY) !== null) await removeLegacy();
      return signedOut ? null : webSession;
    }
    const legacy = await AsyncStorage.getItem(LEGACY_AUTH_SESSION_KEY);
    const bytes = legacy === null ? null : credentialBytes(legacy);
    if (bytes === null) return null;
    if (Platform.OS === "web") webSession = bytes;
    else await writeVerified(bytes);
    await removeLegacy();
    return signedOut ? null : bytes;
  });
}

/** Renewal cannot clear a logout marker; only an explicit successful login may do so. */
export function writeAuthCredentials(raw: string, newLogin = false): Promise<void> {
  return ordered(async () => {
    const bytes = credentialBytes(raw);
    if (!bytes) throw new AuthCredentialStorageError();
    if (!newLogin && (signedOut || await AsyncStorage.getItem(AUTH_LOGOUT_MARKER_KEY) === "1")) throw new AuthCredentialStorageError();
    if (Platform.OS === "web") webSession = bytes;
    else { await nativeAvailable(); await writeVerified(bytes); }
    await removeLegacy();
    if (newLogin) {
      await AsyncStorage.removeItem(AUTH_LOGOUT_MARKER_KEY);
      signedOut = false;
    }
  });
}

/** Durable non-secret tombstone prevents restoration after a partially completed logout. */
export function removeAuthCredentials(): Promise<void> {
  signedOut = true;
  webSession = null;
  return ordered(async () => {
    await AsyncStorage.setItem(AUTH_LOGOUT_MARKER_KEY, "1");
    if (Platform.OS !== "web") {
      await nativeAvailable();
      await SecureStore.deleteItemAsync(SECURE_AUTH_SESSION_KEY, OPTIONS);
    }
    await AsyncStorage.multiRemove([LEGACY_AUTH_SESSION_KEY, ACCOUNT_KEY]);
    // Leave the marker until a verified, explicit new login. It contains no credentials.
  });
}
