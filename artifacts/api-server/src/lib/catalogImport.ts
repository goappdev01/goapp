import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request } from "node:https";

export type ImportedService = { name: string; price: number | null; duration: number | null; description: string; category?: string; variant?: string; needsReview?: boolean };
export class CatalogImportError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export function publicCatalogAddress(address: string): boolean {
  if (address.includes(":")) {
    const value = address.toLowerCase();
    if (value.startsWith("::ffff:")) return publicCatalogAddress(value.slice(7));
    const prefix = Number.parseInt(value.split(":")[0], 16);
    return prefix >= 0x2000 && prefix <= 0x3fff
      && !/^(2001:(?:0:|2:|10:|20:|db8:)|2002:)/.test(value);
  }
  const bytes = address.split(".").map(Number);
  if (bytes.length !== 4 || bytes.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b, c] = bytes;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || a === 169 && b === 254
    || a === 172 && b >= 16 && b <= 31 || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99)
    || a === 100 && b >= 64 && b <= 127 || a === 198 && (b === 18 || b === 19)
    || a === 192 && b === 0 && (c === 0 || c === 2) || a === 198 && b === 51 && c === 100
    || a === 203 && b === 0 && c === 113);
}

export function catalogUrl(raw: string): URL {
  if (raw.length > 2048) throw new CatalogImportError("CATALOG_URL_INVALID", "El enlace es demasiado largo.");
  let url: URL;
  try { url = new URL(raw); } catch { throw new CatalogImportError("CATALOG_URL_INVALID", "Indica un enlace HTTPS válido."); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.port && url.port !== "443"
    || isIP(url.hostname) || url.hostname.toLowerCase().endsWith(".local") || !url.hostname.includes("."))
    throw new CatalogImportError("CATALOG_URL_INVALID", "Solo se admiten páginas HTTPS públicas.");
  if ([...url.searchParams.keys()].some(key => /(?:token|secret|signature|session|auth|api.?key|password)/i.test(key)))
    throw new CatalogImportError("CATALOG_URL_INVALID", "El enlace parece incluir acceso privado. Usa una página pública.");
  url.hash = "";
  return url;
}

async function publicLookup(host: string): Promise<{ address: string; family: 4 | 6 }> {
  const addresses = await lookup(host, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(item => !publicCatalogAddress(item.address)))
    throw new CatalogImportError("CATALOG_URL_PRIVATE", "El enlace no apunta a una página pública.");
  return addresses[0] as { address: string; family: 4 | 6 };
}

async function readPage(url: URL, address: { address: string; family: 4 | 6 }): Promise<{ status: number; location?: string; type: string; text: string }> {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: "GET", timeout: 12000, headers: { Accept: "text/html", "User-Agent": "GO-CatalogImport/1.0" },
      lookup: (_host, options, done) => {
        if (options.all) done(null, [{ address: address.address, family: address.family }]);
        else done(null, address.address, address.family);
      } }, response => {
      const status = response.statusCode ?? 502, type = String(response.headers["content-type"] ?? "").toLowerCase();
      const location = typeof response.headers.location === "string" ? response.headers.location : undefined;
      if (status >= 300 && status < 400) { response.resume(); resolve({ status, location, type, text: "" }); return; }
      if (status !== 200 || !type.startsWith("text/html")) { response.resume(); reject(new CatalogImportError("CATALOG_SOURCE_UNAVAILABLE", "La página no ofrece un catálogo HTML público.")); return; }
      const parts: Buffer[] = []; let size = 0;
      response.on("data", (part: Buffer) => { size += part.length; if (size > 512_000) { req.destroy(new CatalogImportError("CATALOG_SOURCE_TOO_LARGE", "La página supera el tamaño permitido.")); return; } parts.push(part); });
      response.on("end", () => resolve({ status, type, text: Buffer.concat(parts).toString("utf8") }));
      response.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new CatalogImportError("CATALOG_SOURCE_TIMEOUT", "La página tardó demasiado en responder.")));
    req.on("error", reject); req.end();
  });
}

export async function fetchPublicCatalog(raw: string): Promise<string> {
  let url = catalogUrl(raw);
  for (let redirects = 0; redirects <= 3; redirects++) {
    const page = await readPage(url, await publicLookup(url.hostname));
    if (page.status === 200) return page.text;
    if (!page.location || redirects === 3) throw new CatalogImportError("CATALOG_REDIRECT_INVALID", "El enlace redirige demasiadas veces.");
    url = catalogUrl(new URL(page.location, url).href);
  }
  throw new CatalogImportError("CATALOG_REDIRECT_INVALID", "No se pudo abrir el enlace.");
}

const entity = (text: string) => text.replace(/&(?:nbsp|amp|quot|apos|lt|gt|#(\d+));/gi, (value, decimal: string) => {
  const named: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&apos;": "'", "&lt;": "<", "&gt;": ">" };
  return decimal ? String.fromCodePoint(Number(decimal)) : named[value.toLowerCase()] ?? value;
});
const clean = (html: string) => entity(html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());

/** Conservative extraction: only explicit price rows, never inferred values. */
export function extractCatalogHtml(html: string): ImportedService[] {
  const safe = html.replace(/<!--[\s\S]*?-->|<(script|style|svg|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "");
  const blocks = [
    ...[...safe.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map(match => {
      const cells = [...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(cell => clean(cell[1]));
      return cells.length >= 2 ? cells.join(" · ") : "";
    }),
    ...[...safe.matchAll(/<(?:li|p|article)\b[^>]*>([\s\S]*?)<\/(?:li|p|article)>/gi)].map(match => clean(match[1])),
  ];
  const seen = new Set<string>(), results: ImportedService[] = [];
  for (const line of blocks) {
    if (line.length < 5 || line.length > 240 || /\b(?:desde|hasta|a partir de)\b/i.test(line)) continue;
    const prices = [...line.matchAll(/(?:^|\s|·)(\d{1,5}(?:[,.]\d{1,2})?)\s*(?:€|EUR)(?=\s|$|[.,;·])/gi)];
    if (prices.length !== 1) continue;
    const price = prices[0];
    const amount = Number(price[1].replace(",", "."));
    if (!Number.isFinite(amount) || amount > 100000) continue;
    const durationTokens = [...line.matchAll(/\b(?:(\d{1,2})\s*h(?:oras?)?\s*)?(\d{1,3})\s*min(?:utos?)?\b|\b(\d{1,2})\s*h(?:oras?)?(?:\s+(\d{1,2}))?\b/gi)];
    if (durationTokens.length > 1) continue;
    const duration = durationTokens[0];
    const minutes = duration ? (duration[3] ? Number(duration[3]) * 60 + Number(duration[4] ?? 0) : Number(duration[1] ?? 0) * 60 + Number(duration[2])) : null;
    const title = line.replace(price[0], " ").replace(duration?.[0] ?? "", " ").replace(/[·|:—–-]+/g, " ").replace(/\s+/g, " ").trim();
    const extra = title.match(/^(.*?)\s+(Alérgenos?\s+.+)$/i);
    const name = extra ? extra[1].replace(/[.\s]+$/, "") : title;
    const description = extra ? extra[2] : "";
    if (name.length < 2 || name.length > 120 || !/[\p{L}]/u.test(name)) continue;
    if (minutes !== null && (minutes < 1 || minutes > 1440)) continue;
    const key = name.toLocaleLowerCase("es"); if (seen.has(key)) continue;
    seen.add(key);
    results.push({ name, price: amount, duration: minutes, description });
    // Keep one extra result so the API can reject oversized menus explicitly.
    if (results.length === 41) break;
  }
  return results;
}

/** Read only explicit name/price pairs. Headings are hints, never products. */
export function extractCatalogText(text: string): ImportedService[] {
  const rows: ImportedService[] = [];
  const seen = new Set<string>();
  let category = "";
  for (const original of text.replace(/\r/g, "").split("\n")) {
    const line = original.replace(/[\t ]+/g, " ").trim();
    if (line.length < 2 || line.length > 240) continue;
    if (!/\d/.test(line) && line.length <= 55 && /^[\p{L}\s/&-]+$/u.test(line)) {
      category = line; continue;
    }
    if (/\b(?:desde|hasta|a partir de)\b/i.test(line)) continue;
    const duration = line.match(/\b(\d{1,3})\s*min(?:utos?)?\b/i);
    const withoutDuration = duration ? line.replace(duration[0], "").replace(/[·|\s]+$/, "").trim() : line;
    if ([...withoutDuration.matchAll(/\b\d+(?:[,.]\d{1,2})?\s*(?:€|EUR)(?=\s|$)/gi)].length > 1) continue;
    const matches = [...withoutDuration.matchAll(/(?:^|[\s·.])((?:\d{1,3}\.)?\d{1,5}(?:[,.]\d{1,2})?)\s*(?:€|EUR)?(?=\s*$|\s*[|·;])/gi)];
    if (matches.length !== 1) continue;
    const price = matches[0];
    const amount = Number(price[1].replace(/\.(?=\d{3}(?:[,.]|$))/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount > 100000) continue;
    const minutes = duration ? Number(duration[1]) : null;
    if (minutes !== null && (minutes < 1 || minutes > 1440)) continue;
    const before = withoutDuration.slice(0, price.index).replace(/[.·:|–—-]+$/g, "").trim();
    const [namePart, ...detail] = before.split(/\s+[–—]\s+/);
    const fullName = namePart.trim();
    const explicitVariant = fullName.match(/^(.*?)\s+\(([^()]{2,50})\)$/);
    const name = explicitVariant ? explicitVariant[1].trim() : fullName;
    const variant = explicitVariant?.[2].trim() ?? "";
    if (name.length < 2 || name.length > 120 || !/[\p{L}]/u.test(name)) continue;
    const key = `${category}|${name}|${variant}`.toLocaleLowerCase("es");
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ name, price: amount, duration: minutes, description: detail.join(" — "),
      ...(category ? { category } : {}), ...(variant ? { variant } : {}), needsReview: !duration });
    if (rows.length > 40) break;
  }
  return rows;
}
