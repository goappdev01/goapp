/** Temporary development diagnostics. Never accepts identities, URLs or credentials. */
export type AuthTraceEvent =
  | "home.mount" | "home.unmount" | "home.restore.start" | "home.restore.end" | "home.restore.error" | "home.presentation"
  | "credentials.read" | "credentials.unavailable" | "session.saved" | "session.logout" | "session.expired" | "session.event"
  | "refresh.start" | "refresh.response" | "refresh.shared" | "refresh.paused"
  | "request.start" | "request.end" | "admin.check.start" | "admin.check.end" | "admin.check.error";
type Screen = "recovering" | "welcome" | "access" | "landing";
type Route = "identity" | "admin" | "business" | "protected";
type Outcome = "missing" | "restored" | "unknown-role";
export type AuthTraceDetails = {
  status?: number; revision?: number; request?: number; listeners?: number;
  present?: boolean; allowed?: boolean; checking?: boolean; loaded?: boolean;
  screen?: Screen; route?: Route; outcome?: Outcome; context?: "ADMIN" | "BUSINESS" | "USER";
};
type Entry = AuthTraceDetails & { sequence: number; elapsedMs: number; event: AuthTraceEvent };
const events = new Set<AuthTraceEvent>([
  "home.mount", "home.unmount", "home.restore.start", "home.restore.end", "home.restore.error", "home.presentation",
  "credentials.read", "credentials.unavailable", "session.saved", "session.logout", "session.expired", "session.event",
  "refresh.start", "refresh.response", "refresh.shared", "refresh.paused", "request.start", "request.end",
  "admin.check.start", "admin.check.end", "admin.check.error",
]);
const buffer: Entry[] = [];
const started = Date.now();
let sequence = 0;
const LIMIT = 120;
/** Log a bounded allowlist of metadata only, and keep diagnostics out of storage. */
export function recordAuthTrace(event: AuthTraceEvent, details: AuthTraceDetails = {}): void {
  if (typeof __DEV__ === "undefined" || !__DEV__ || !events.has(event) || sequence >= LIMIT) return;
  const safe: AuthTraceDetails = {};
  for (const key of ["status", "revision", "request", "listeners"] as const) {
    const value = details[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) safe[key] = Math.min(1000000, Math.floor(value));
  }
  for (const key of ["present", "allowed", "checking", "loaded"] as const) {
    if (typeof details[key] === "boolean") safe[key] = details[key];
  }
  const choices = {
    screen: ["recovering", "welcome", "access", "landing"],
    route: ["identity", "admin", "business", "protected"],
    outcome: ["missing", "restored", "unknown-role"],
    context: ["ADMIN", "BUSINESS", "USER"],
  } as const;
  for (const key of Object.keys(choices) as (keyof typeof choices)[]) {
    const value = details[key];
    if (typeof value === "string" && (choices[key] as readonly string[]).includes(value)) Object.assign(safe, { [key]: value });
  }
  const entry: Entry = { sequence: ++sequence, elapsedMs: Math.max(0, Date.now() - started), event, ...safe };
  buffer.push(entry);
  // Logging failures must never change the authentication outcome.
  try { console.info("[GO auth circuit]", JSON.stringify(entry)); } catch {}
}
export function readAuthTrace(): readonly Entry[] { return buffer.map(entry => ({ ...entry })); }
