import { z } from "zod";
import { financeCountryCode, financeUnit, financeVerification, financialDocumentSchema, type FinancialDocument } from "./financial-plan";
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === s; });
export const financeImportRowSchema = z.object({
  countryCode: financeCountryCode, countryName: z.string().trim().min(1).max(160),
  activityId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/), activityName: z.string().trim().min(1).max(160),
  companies: z.number().finite().nonnegative().max(1e12).nullable(), unit: financeUnit, referenceYear: z.number().int().min(1800).max(2300),
  sourceOrganization: z.string().trim().min(1).max(160), sourceUrl: z.string().url().max(2000).refine(s => /^https?:\/\//i.test(s)),
  consultedOn: calendarDate, updatedOn: calendarDate, verification: financeVerification, notes: z.string().max(2000),
}).strict().refine(row=>row.companies===null||row.unit==="otra"||Number.isInteger(row.companies),"El recuento de empresas o establecimientos debe ser entero");
export const financeMarketImportSchema = z.object({ schemaVersion: z.literal("go-finance-market/1"), rows: z.array(z.unknown()).min(1).max(25000) }).strict();
export type FinanceImportRow = z.infer<typeof financeImportRowSchema>;
export type FinanceImportPreview = { errors: { row: number; message: string }[]; warnings: string[]; rows: number; duplicates: number;
  inserted: number; updated: number; unchanged: number; candidate: FinancialDocument | null };
const canonical = (organization: string, url: string) => organization.trim().toLocaleLowerCase() + "|" + url.replace(/#.*$/, "").replace(/^(https?:\/\/)([^/]+)/i, (_match, scheme: string, host: string) => scheme.toLowerCase() + host.toLowerCase());
function sourceId(key: string): string {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < key.length; i++) { a = Math.imul(a ^ key.charCodeAt(i), 16777619); b = Math.imul(b, 33) ^ key.charCodeAt(i); }
  // Non-security identifier only. Full identity comparison below rejects any collision.
  return "src-" + (a >>> 0).toString(16).padStart(8, "0") + (b >>> 0).toString(16).padStart(8, "0");
}
export function previewFinanceMarketImport(input: unknown, original: FinancialDocument): FinanceImportPreview {
  const envelope = financeMarketImportSchema.safeParse(input);
  const report: FinanceImportPreview = { errors: [], warnings: [], rows: 0, duplicates: 0, inserted: 0, updated: 0, unchanged: 0, candidate: null };
  if (!envelope.success) { report.errors.push({ row: 0, message: "Formato/versionado inválido o límite de 25000 filas excedido" }); return report; }
  report.rows = envelope.data.rows.length;
  const doc = financialDocumentSchema.parse(original);
  const activities = new Map(doc.activities.map(row => [row.id, row])), countries = new Map(doc.countries.map(row => [row.code, row]));
  const sources = new Map(doc.sources.map(row => [row.id, row])), identities = new Map(doc.sources.map(row => [canonical(row.organization, row.url), row.id]));
  const keyOf = (row: { activityId: string; countryCode: string; referenceYear: number }) => [row.activityId, row.countryCode, row.referenceYear].join("|");
  const markets = new Map(doc.markets.map(row => [keyOf(row), row])), seen = new Map<string, string>();
  for (let index = 0; index < envelope.data.rows.length; index++) {
    const parsed = financeImportRowSchema.safeParse(envelope.data.rows[index]);
    if (!parsed.success) { report.errors.push({ row: index + 1, message: parsed.error.issues.map(issue => issue.path.join(".") + ": " + issue.message).join("; ") }); continue; }
    const row = parsed.data, key = keyOf(row), identity = canonical(row.sourceOrganization, row.sourceUrl), serialized = JSON.stringify(row);
    if (seen.has(key)) {
      report.duplicates++;
      if (seen.get(key) !== serialized) report.errors.push({ row: index + 1, message: "Duplicado con cifras, unidad o fuente incompatibles: " + key });
      continue;
    }
    seen.set(key, serialized);
    const activity = activities.get(row.activityId), current = markets.get(key);
    if (activity && (activity.unit !== row.unit || activity.name !== row.activityName)) {
      report.errors.push({ row: index + 1, message: "Actividad existente con nombre o unidad incompatible; revisa su identificador" }); continue;
    }
    const oldSource = current && sources.get(current.sourceId);
    if (current && (current.unit !== row.unit || (oldSource && canonical(oldSource.organization, oldSource.url) !== identity && current.companies !== row.companies)
      || (current.verification === "VERIFICADO" && row.verification !== "VERIFICADO"))) {
      report.errors.push({ row: index + 1, message: "Fuente incompatible o sustitución de un dato verificado por otro sin verificar: " + key }); continue;
    }
    const sid = identities.get(identity) || sourceId(identity), existingSource = sources.get(sid);
    if (existingSource && canonical(existingSource.organization, existingSource.url) !== identity) {
      report.errors.push({ row: index + 1, message: "Colisión de identificador de fuente; requiere revisión" }); continue;
    }
    if (!activity) activities.set(row.activityId, { id: row.activityId, name: row.activityName, unit: row.unit, enabled: true });
    if (!countries.has(row.countryCode)) countries.set(row.countryCode, { code: row.countryCode, name: row.countryName, currency: doc.baseCurrency });
    const source = { id: sid, organization: row.sourceOrganization, url: row.sourceUrl, consultedOn: row.consultedOn, verification: row.verification, notes: row.notes };
    // An older consultation cannot silently replace more recent provenance.
    if (!existingSource || row.consultedOn >= existingSource.consultedOn) sources.set(sid, source);
    identities.set(identity, sid);
    const market = { activityId: row.activityId, countryCode: row.countryCode, referenceYear: row.referenceYear,
      companies: row.companies, unit: row.unit, sourceId: sid, updatedOn: row.updatedOn, verification: row.verification, notes: row.notes };
    if (current && JSON.stringify(current) === JSON.stringify(market)) report.unchanged++;
    else if (current) report.updated++; else report.inserted++;
    markets.set(key, market);
  }
  if (report.duplicates) report.warnings.push(report.duplicates + " filas duplicadas detectadas; las idénticas se aplican una sola vez");
  if (report.errors.length) return report;
  const candidate = { ...doc, activities: [...activities.values()], countries: [...countries.values()], sources: [...sources.values()], markets: [...markets.values()] };
  const parsed = financialDocumentSchema.safeParse(candidate);
  if (!parsed.success) { report.errors.push({ row: 0, message: parsed.error.issues.map(issue => issue.message).join("; ") }); return report; }
  report.candidate = parsed.data;
  return report;
}
export function emptyFinanceImport(): { schemaVersion: "go-finance-market/1"; rows: FinanceImportRow[] } { return { schemaVersion: "go-finance-market/1", rows: [] }; }
