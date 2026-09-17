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

export function bearerHeader(authorization: string | undefined) {
  if (authorization?.startsWith("Bearer ")) return { Authorization: authorization };
  return {} as Record<string, string>;
}
