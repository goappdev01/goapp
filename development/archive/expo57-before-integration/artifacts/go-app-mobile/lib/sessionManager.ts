export const SESSION_KEY = "go_supabase_session_v1";
export const ROLE_KEY = "go_account_type_v1";
export type Session = {
  access_token: string; refresh_token: string | null;
  user: { id?: string; user_metadata?: { role?: unknown }; [key: string]: unknown } | null;
  expires_at?: number;
};
type Storage = { getItem(k: string): Promise<string | null>; setItem(k: string, v: string): Promise<unknown>; multiRemove(keys: string[]): Promise<unknown> };
type Reply = { status: number; body: any };
export type Recovery = { session: Session | null; role: string | null; revision: number; temporary: boolean; accessTokenUsable?: boolean };

export class SessionRequestError extends Error {
  constructor(readonly code: "SESSION_CHANGED" | "SESSION_TEMPORARILY_UNAVAILABLE") {
    super(code === "SESSION_CHANGED"
      ? "La sesión ha cambiado. Vuelve a intentarlo."
      : "No se pudo recuperar la sesión para esta consulta. Comprueba la conexión y vuelve a intentarlo.");
    this.name = "SessionRequestError";
  }
}

/** Wait for the existing shared recovery; never send a known expired/unvalidated token. */
export async function sessionForRequest(
  manager: { recover(): Promise<Recovery>; isCurrent(result: Recovery): boolean },
  now: () => number = Date.now,
): Promise<Recovery> {
  const result = await manager.recover();
  if (!manager.isCurrent(result)) throw new SessionRequestError("SESSION_CHANGED");
  if (result.session && (
    (result.temporary && !result.accessTokenUsable) ||
    (result.session.expires_at !== undefined && result.session.expires_at <= now() / 1000)
  )) throw new SessionRequestError("SESSION_TEMPORARILY_UNAVAILABLE");
  return result;
}

/** Accepts the raw GoTrue response and the wrapped shapes used by older API adapters. */
export function sessionFromPayload(payload: unknown, now: () => number = Date.now): Session | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, any>;
  const candidate = root.session ?? root.data?.session ?? root.data ?? root;
  if (typeof candidate?.access_token !== "string" || !candidate.access_token) return null;
  const expiry = typeof candidate.expires_at === "number" ? candidate.expires_at
    : typeof candidate.expires_in === "number" ? Math.floor(now() / 1000) + candidate.expires_in : undefined;
  return {
    access_token: candidate.access_token,
    refresh_token: typeof candidate.refresh_token === "string" ? candidate.refresh_token : null,
    user: candidate.user && typeof candidate.user === "object" ? candidate.user : null,
    ...(expiry !== undefined && Number.isFinite(expiry) ? { expires_at: expiry } : {}),
  };
}

/** One authority for local session writes and refresh-token rotation. No credentials are retained. */
export function createSessionManager(deps: {
  storage: Storage; request(path: string, token?: string, refresh?: string): Promise<Reply>;
  changed(): void; now?: () => number;
}) {
  const now = deps.now ?? Date.now;
  let revision = 0;
  let queue: Promise<unknown> = Promise.resolve();
  let flight: { revision: number; promise: Promise<Recovery> } | undefined;
  function serial<T>(fn: () => Promise<T>): Promise<T> {
    const job = queue.then(fn, fn); queue = job.catch(() => {}); return job;
  }
  function normalize(payload: any): Session {
    const session = sessionFromPayload(payload, now);
    if (!session) throw new Error("Missing access token");
    return session;
  }
  async function snapshot() {
    return serial(async () => {
      const raw = await deps.storage.getItem(SESSION_KEY);
      const role = await deps.storage.getItem(ROLE_KEY);
      let session: Session | null = null;
      try { session = raw ? normalize(JSON.parse(raw)) : null; } catch { /* Invalid local record: never synthesize authentication. */ }
      return { raw, session, role, revision, temporary: false };
    });
  }
  // Revision changes synchronously, before awaiting storage: old HTTP responses lose authority immediately.
  async function save(payload: unknown, role: string) {
    const session = normalize(payload); const ticket = ++revision;
    await serial(async () => {
      if (revision !== ticket) return;
      await deps.storage.setItem(SESSION_KEY, JSON.stringify(session));
      await deps.storage.setItem(ROLE_KEY, role);
    });
    if (revision === ticket) deps.changed();
    return revision === ticket;
  }
  async function logout() {
    const ticket = ++revision;
    await serial(async () => {
      if (revision !== ticket) return;
      await deps.storage.multiRemove([SESSION_KEY, ROLE_KEY]);
    });
    if (revision === ticket) deps.changed();
    return revision === ticket;
  }
  async function recoverOnce(): Promise<Recovery> {
    let snap = await snapshot();
    if (!snap.session) return snap;
    const current = async () => {
      const raw = await deps.storage.getItem(SESSION_KEY);
      return revision === snap.revision && raw === snap.raw;
    };
    const replace = async (session: Session | null) => {
      await serial(async () => {
        if (!await current()) return;
        if (session) await deps.storage.setItem(SESSION_KEY, JSON.stringify(session));
        else await deps.storage.multiRemove([SESSION_KEY, ROLE_KEY]);
      });
      snap = await snapshot();
      return snap;
    };
    const renew = async (): Promise<'ok' | 'invalid' | 'temporary' | 'stale'> => {
      const old = snap.session!;
      if (!old.refresh_token) return 'temporary';
      const response = await deps.request('/supabase/auth/refresh', undefined, old.refresh_token);
      if (revision !== snap.revision) return 'stale';
      if (response.status >= 200 && response.status < 300) {
        const renewed = normalize(response.body);
        if (!renewed.refresh_token || !renewed.user?.id || (old.user?.id && old.user.id !== renewed.user.id)) return 'temporary';
        await replace(renewed);
        return 'ok';
      }
      return response.status === 401 && response.body?.code === 'SESSION_UNRECOVERABLE' ? 'invalid' : 'temporary';
    };
    try {
      let renewed = false;
      if (snap.session.expires_at !== undefined && snap.session.expires_at <= now() / 1000 + 60 && snap.session.refresh_token) {
        const status = await renew();
        if (status === 'stale') return snapshot();
        if (status === 'invalid') return replace(null);
        if (status === 'temporary') return { ...snap, temporary: true };
        renewed = true;
      }
      if (revision !== snap.revision) return snapshot();
      const response = await deps.request('/supabase/auth/me', snap.session!.access_token);
      if (revision !== snap.revision) return snapshot();
      // Legacy 401 can trigger renewal. Only SESSION_UNRECOVERABLE permits automatic deletion.
      if ((response.status === 401 && response.body?.code !== 'PROFILE_ACCESS_FAILED' && response.body?.code !== 'AUTH_USER_CHECK_FAILED') || response.body?.code === 'AUTH_TOKEN_INVALID') {
        if (!renewed && snap.session?.refresh_token) {
          const status = await renew();
          if (status === 'invalid') return replace(null);
          if (status === 'stale') return snapshot();
          return { ...snap, temporary: status === 'temporary' };
        }
        return { ...snap, temporary: true };
      }
      // Profile permissions, 5xx and network failures cannot revoke an existing session.
      const accessTokenUsable = (response.status >= 200 && response.status < 300) ||
        (response.body?.code === 'PROFILE_ACCESS_FAILED' && !!snap.session?.user?.id && response.body?.user?.id === snap.session.user.id);
      return { ...snap, temporary: response.status < 200 || response.status >= 300, accessTokenUsable };
    } catch { return { ...await snapshot(), temporary: true }; }
  }
  function recover(): Promise<Recovery> {
    if (flight?.revision === revision) return flight.promise;
    const job = { revision, promise: recoverOnce() };
    flight = job;
    void job.promise.finally(() => { if (flight === job) flight = undefined; }).catch(() => {});
    return job.promise;
  }
  return { save, logout, recover, isCurrent: (result: Recovery) => result.revision === revision };
}
