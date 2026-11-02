type JsonObject = Record<string, unknown>;
const object = (value: unknown): value is JsonObject => !!value && typeof value === "object" && !Array.isArray(value);
export type LoginSessionPayload = JsonObject & { access_token: string; user: JsonObject & { id: string } };

/** Decode a complete session only. Server verification remains mandatory for privileges. */
export function loginSessionPayload(value: unknown): LoginSessionPayload | null {
  if (!object(value) || value.error) return null;
  const data = object(value.data) ? value.data : null;
  if (data?.error) return null;
  const candidate = value.access_token ? value : object(value.session) ? value.session
    : data?.access_token ? data : object(data?.session) ? data.session : null;
  if (!candidate || typeof candidate.access_token !== "string" || !candidate.access_token.trim()
    || !object(candidate.user) || typeof candidate.user.id !== "string" || !candidate.user.id.trim()) return null;
  // A wrapper may repeat identity, but must never contradict its session.
  for (const user of [value.user, data?.user]) {
    if (user != null && (!object(user) || user.id !== candidate.user.id)) return null;
  }
  return candidate as LoginSessionPayload;
}

/** Safe diagnostics contain no payload values, identities, credentials or tokens. */
export function invalidLoginResponse(status: number, json: boolean): string {
  return `Respuesta de inicio de sesión inválida (HTTP ${status}; ${json ? "LOGIN_SESSION_INCOMPLETE" : "LOGIN_JSON_INVALID"}). No se ha confirmado una nueva sesión; no es una denegación OWNER.`;
}
