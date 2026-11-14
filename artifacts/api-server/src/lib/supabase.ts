// Public/anon key only: caller JWTs and Supabase RLS remain authoritative.
export async function supabaseRequest(
  path: string,
  init: { method?: string; headers?: Record<string, string>; body?: string } = {},
) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (url && key) {
    return fetch(`${url.replace(/\/$/, "")}${path}`, {
      ...init,
      headers: { Accept: "application/json", apikey: key, ...init.headers },
      signal: AbortSignal.timeout(15000),
    });
  }
  if (url || key) throw new Error("Configure both SUPABASE_URL and a Supabase public key");
  const { ReplitConnectors } = await import("@replit/connectors-sdk");
  const connectors = new ReplitConnectors();
  return connectors.proxy("supabase", path, {
    method: init.method ?? "GET",
    headers: { Accept: "application/json", ...init.headers },
    ...(init.body === undefined ? {} : { body: init.body }),
  });
}

// Storage needs raw bytes; never re-encode private files as a UTF-8 string.
// Production uses the configured publishable key + user's JWT, not a service key.
export async function supabaseStorageRequest(path: string, authorization: string | undefined, init: {
  method?: string; contentType?: string; body?: Uint8Array<ArrayBuffer>;
} = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY;
  if (!url || !key || !authorization?.startsWith("Bearer ")) throw new Error("Authenticated storage unavailable");
  return fetch(`${url.replace(/\/$/, "")}${path}`, {
    method: init.method ?? "GET", headers: { apikey: key, Authorization: authorization,
      ...(init.contentType ? { "Content-Type": init.contentType, "x-upsert": "false" } : {}) },
    ...(init.body ? { body: init.body } : {}), signal: AbortSignal.timeout(20000),
  });
}

export function bearerHeader(authorization: string | undefined) {
  if (authorization?.startsWith("Bearer ")) return { Authorization: authorization };
  return {} as Record<string, string>;
}
