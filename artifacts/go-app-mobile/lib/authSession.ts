import AsyncStorage from "@react-native-async-storage/async-storage";
import { readAuthCredentials, writeAuthCredentials, removeAuthCredentials, LEGACY_AUTH_SESSION_KEY, AuthCredentialStorageError } from "./authCredentialStorage";
import { notifySessionChanged, onSessionChanged } from "./sessionEvents";

export const AUTH_SESSION_KEY = LEGACY_AUTH_SESSION_KEY; // Legacy migration key, never a credential write destination.
const ACCOUNT_KEY = "go_account_type_v1";
const REFRESH_MARGIN_SECONDS = 60;

export type AuthSession = {
  access_token: string;
  refresh_token?: string | null;
  expires_at?: number;
  expires_in?: number;
  user: { id: string; email?: string; user_metadata?: Record<string, unknown>; [key: string]: unknown };
};
export type AuthIdentity = { userId: string; revision: number; sessionId?: string };

export class AuthSessionRequiredError extends Error {
  readonly status = 401;
  readonly code = "AUTH_REQUIRED";
  constructor() { super("Inicia sesión para continuar con GO."); this.name = "AuthSessionRequiredError"; }
}
export class AuthSessionUnavailableError extends Error {
  readonly status = 503;
  readonly code = "SESSION_REFRESH_UNAVAILABLE";
  constructor(message = "No se pudo renovar la sesión ahora. Comprueba la conexión y vuelve a intentarlo.") { super(message); this.name = "AuthSessionUnavailableError"; }
}

let revision = 0;
let recoveryNotice: string | null = null;
export function consumeAuthRecoveryNotice(): string | null {
  const notice = recoveryNotice; recoveryNotice = null; return notice;
}
let writes: Promise<unknown> = Promise.resolve();
let refreshFlight: { revision: number; token: string; promise: Promise<AuthSession> } | null = null;

function serialize<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.catch(() => {}).then(operation);
  writes = result.catch(() => {});
  return result;
}
export function getAuthApiBase(): string {
  return process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "")
    ?? (process.env.EXPO_PUBLIC_DOMAIN ? "https://" + process.env.EXPO_PUBLIC_DOMAIN + "/api" : "/api");
}

// Unverified claims schedule renewal and identify races only. They NEVER grant permissions.
function tokenHints(token: string): { exp?: number; session_id?: string } {
  try {
    const part = token.split(".")[1];
    if (!part || part.length > 65536 || !/^[A-Za-z0-9_-]+$/.test(part)) return {};
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let bits = 0, value = 0, encoded = "";
    for (const char of part.replace(/-/g, "+").replace(/_/g, "/")) {
      value = (value << 6) | alphabet.indexOf(char); bits += 6;
      if (bits >= 8) { bits -= 8; encoded += "%" + ((value >> bits) & 255).toString(16).padStart(2, "0"); }
    }
    const hints = JSON.parse(decodeURIComponent(encoded));
    return { ...(typeof hints.exp === "number" && Number.isFinite(hints.exp) ? { exp: hints.exp } : {}),
      ...(typeof hints.session_id === "string" ? { session_id: hints.session_id } : {}) };
  } catch { return {}; }
}
function decode(raw: string | null): AuthSession | null {
  try {
    const session = raw ? JSON.parse(raw) : null;
    return typeof session?.access_token === "string" && !!session.access_token
      && typeof session.user?.id === "string" && !!session.user.id ? session : null;
  } catch { return null; }
}
async function stored(): Promise<AuthSession | null> {
  try { return decode(await readAuthCredentials()); }
  catch (error) { throw new AuthSessionUnavailableError(error instanceof AuthCredentialStorageError ? error.message : undefined); }
}
export async function readAuthSession(): Promise<AuthSession | null> {
  await writes;
  return stored();
}
function identity(session: AuthSession, version = revision): AuthIdentity {
  return { userId: session.user.id, revision: version, sessionId: tokenHints(session.access_token).session_id };
}
export async function captureAuthIdentity(): Promise<AuthIdentity | null> {
  const version = revision, session = await readAuthSession();
  if (version !== revision) throw new AuthSessionRequiredError();
  return session ? identity(session, version) : null;
}
export async function isAuthIdentityCurrent(expected: AuthIdentity): Promise<boolean> {
  const session = await readAuthSession();
  return expected.revision === revision && session?.user.id === expected.userId
    && tokenHints(session.access_token).session_id === expected.sessionId;
}
function normalize(payload: Record<string, unknown>): AuthSession {
  const session = decode(JSON.stringify({ access_token: payload.access_token, user: payload.user }));
  if (!session) throw new AuthSessionUnavailableError();
  const expiresIn = typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in) && payload.expires_in > 0
    ? payload.expires_in : undefined;
  const expiresAt = typeof payload.expires_at === "number" && Number.isFinite(payload.expires_at)
    ? payload.expires_at : expiresIn ? Math.floor(Date.now() / 1000) + expiresIn : tokenHints(session.access_token).exp;
  return { ...session, refresh_token: typeof payload.refresh_token === "string" ? payload.refresh_token : null,
    ...(expiresIn ? { expires_in: expiresIn } : {}), ...(expiresAt ? { expires_at: expiresAt } : {}) };
}

/** All credential writes are ordered, so a late refresh cannot resurrect a logout/new login. */
export async function saveAuthSession(payload: Record<string, unknown>): Promise<void> {
  const session = normalize(payload), version = ++revision;
  await serialize(async () => {
    if (version !== revision) throw new AuthSessionRequiredError();
    await writeAuthCredentials(JSON.stringify(session), true);
  });
  if (version !== revision) throw new AuthSessionRequiredError();
  recoveryNotice = null;
  notifySessionChanged(); // Identity event, never emitted for token rotation.
}
export async function clearAuthSession(): Promise<void> {
  recoveryNotice = null;
  const version = ++revision;
  await serialize(() => removeAuthCredentials());
  if (version === revision) notifySessionChanged();
}
async function expireIfCurrent(session: AuthSession, version: number): Promise<void> {
  let removed = false;
  await serialize(async () => {
    const current = await stored();
    if (version !== revision || current?.access_token !== session.access_token
      || current.refresh_token !== session.refresh_token || current.user.id !== session.user.id) return;
    revision++;
    await removeAuthCredentials();
    removed = true;
  });
  if (removed) {
    recoveryNotice = "La sesión ya no es válida y no se puede renovar. Inicia sesión de nuevo para continuar con seguridad.";
    notifySessionChanged();
  }
}

async function refresh(session: AuthSession, version: number): Promise<AuthSession> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(getAuthApiBase() + "/supabase/auth/refresh", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: session.refresh_token }), signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      // A transport/gateway error or a generic 401/403 is NOT proof of a revoked session.
      if (response.status === 401 && payload?.code === "SESSION_UNRECOVERABLE") {
        await expireIfCurrent(session, version);
        throw new AuthSessionRequiredError();
      }
      throw new AuthSessionUnavailableError();
    }
    if (!payload || typeof payload.refresh_token !== "string" || !payload.refresh_token) throw new AuthSessionUnavailableError();
    const next = normalize(payload), beforeId = identity(session, version), nextId = identity(next, version);
    if (next.user.id !== session.user.id || beforeId.sessionId !== nextId.sessionId) throw new AuthSessionUnavailableError();
    await serialize(async () => {
      const current = await stored();
      if (version !== revision || current?.access_token !== session.access_token
        || current.refresh_token !== session.refresh_token) throw new AuthSessionRequiredError();
      await writeAuthCredentials(JSON.stringify(next));
    });
    if (version !== revision) throw new AuthSessionRequiredError();
    return next;
  } catch (error) {
    if (error instanceof AuthSessionRequiredError || error instanceof AuthSessionUnavailableError) throw error;
    throw new AuthSessionUnavailableError();
  } finally { clearTimeout(timer); }
}

export async function ensureAuthSession(options: { force?: boolean; rejectedAccessToken?: string } = {}): Promise<AuthSession | null> {
  const version = revision, session = await readAuthSession();
  if (version !== revision) throw new AuthSessionRequiredError();
  if (!session) return null;
  const expiry = session.expires_at ?? tokenHints(session.access_token).exp;
  const due = typeof expiry === "number" && expiry <= Math.floor(Date.now() / 1000) + REFRESH_MARGIN_SECONDS;
  const force = options.force && (!options.rejectedAccessToken || session.access_token === options.rejectedAccessToken);
  if (!force && !due) return session;
  if (!session.refresh_token) {
    if (force && options.rejectedAccessToken === session.access_token) {
      await expireIfCurrent(session, version);
      throw new AuthSessionRequiredError();
    }
    return session; // Legacy access-only sessions must be rejected by the server, not a device clock.
  }
  if (refreshFlight?.revision === version && refreshFlight.token === session.refresh_token) return refreshFlight.promise;
  const flight = { revision: version, token: session.refresh_token, promise: refresh(session, version) };
  refreshFlight = flight;
  void flight.promise.finally(() => { if (refreshFlight === flight) refreshFlight = null; }).catch(() => {});
  return flight.promise;
}

/** At most one retry after an authentication rejection, using the shared rotated credentials. */
export async function fetchWithAuth(url: string, init: RequestInit = {}, requireToken = true, expectedUserId?: string): Promise<Response> {
  const version = revision;
  let session = await ensureAuthSession();
  if ((requireToken && !session) || (expectedUserId && session?.user.id !== expectedUserId) || version !== revision)
    throw new AuthSessionRequiredError();
  const expected = session ? identity(session, version) : null;
  const send = () => {
    const headers = new Headers(init.headers);
    if (session) headers.set("Authorization", "Bearer " + session.access_token);
    return fetch(url, { ...init, headers });
  };
  let response = await send();
  if (expected && !await isAuthIdentityCurrent(expected)) throw new AuthSessionRequiredError();
  if (response.status === 401 && session) {
    const rejectedAccessToken = session.access_token;
    session = await ensureAuthSession({ force: true, rejectedAccessToken });
    if (!session || (expected && !await isAuthIdentityCurrent(expected))) throw new AuthSessionRequiredError();
    response = await send();
    if (expected && !await isAuthIdentityCurrent(expected)) throw new AuthSessionRequiredError();
    if (response.status === 401 && url === getAuthApiBase() + "/supabase/auth/me") {
      await expireIfCurrent(session, version);
      throw new AuthSessionRequiredError();
    }
  }
  return response;
}

/** Session data and account type are presentation; all protected permissions remain server-side. */
export async function restoreStoredAuthentication(): Promise<{ session: AuthSession | null; role: unknown }> {
  let session = await readAuthSession();
  if (!session) return { session: null, role: null };
  let role: unknown = await AsyncStorage.getItem(ACCOUNT_KEY) ?? session.user.user_metadata?.role;
  try {
    const response = await fetchWithAuth(getAuthApiBase() + "/supabase/auth/me", {}, true, session.user.id);
    if (response.ok) {
      const payload = await response.json();
      if (payload?.user?.id === session.user.id && typeof payload.profile?.role === "string") role = payload.profile.role;
    }
  } catch (error) {
    if (error instanceof AuthSessionRequiredError) {
      session = await readAuthSession();
      return { session, role: session ? await AsyncStorage.getItem(ACCOUNT_KEY) ?? session.user.user_metadata?.role : null };
    }
    // Offline, a gateway denial and temporary backend errors do not destroy stored authentication.
  }
  return { session: await readAuthSession(), role };
}

type ActivitySource = {
  currentState: string | null;
  addEventListener: (event: "change", listener: (state: string) => void) => { remove: () => void };
};
/** Exactly one root subscription. iOS may suspend timers; foreground always checks again. */
export function startAuthSessionMaintenance(activity: ActivitySource): () => void {
  let disposed = false, timer: ReturnType<typeof setInterval> | undefined;
  const tick = () => { if (!disposed && activity.currentState === "active") void ensureAuthSession().catch(() => {}); };
  const update = (state: string | null) => {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (state === "active" && !disposed) { tick(); timer = setInterval(tick, 30000); }
  };
  const subscription = activity.addEventListener("change", update);
  const unsubscribe = onSessionChanged(tick);
  update(activity.currentState);
  return () => { disposed = true; if (timer !== undefined) clearInterval(timer); subscription.remove(); unsubscribe(); };
}
