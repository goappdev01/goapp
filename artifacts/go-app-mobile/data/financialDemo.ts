import { emptyFinancialDocument, newFinancialAssumption, financialDocumentSchema, type FinancialDocument } from "@workspace/api-zod";
import { calculatorCatalog } from "./financialRevenueCalculator";

/** Initial synthetic example. The local store subsequently preserves user edits. */
export function createFinancialDemoDocument(startYear = new Date().getFullYear()): FinancialDocument {
  const doc = emptyFinancialDocument("Calculadora DEMO · datos ficticios", startYear);
  const catalog = calculatorCatalog(doc);
  doc.activities = catalog.activities;
  doc.countries = catalog.countries;
  const today = new Date().toISOString().slice(0, 10);
  doc.sources = [{ id: "go_demo_synthetic", organization: "GO DEMO · DATOS FICTICIOS", url: "https://example.invalid/go-demo", consultedOn: today, verification: "NO_VERIFICADO", notes: "Ejemplo sintético de presentación" }];
  // One labelled example; all other market counts remain unknown until entered locally.
  const activityId = "go_peluquerias", countryCode = "ES", id = "demo_ES_go_peluquerias";
  doc.markets.push({ activityId, countryCode, referenceYear: startYear,
    companies: 46086, unit: "empresa", sourceId: "go_demo_synthetic", updatedOn: today,
    verification: "NO_VERIFICADO", notes: "Ejemplo ficticio introducido para la demostración" });
  doc.assumptions.push({ ...newFinancialAssumption(id, activityId, countryCode, "REAL", startYear),
    penetrationPct: 5, acquisitionTiming: "start", costsConfirmed: true });
  doc.revenues.push({ id: `fee_${id}`, assumptionId: id, year: 0,
    name: "Cuota ficticia mensual", kind: "monthly", value: 29 });
  return financialDocumentSchema.parse(doc);
}

/** Saves a local, unverified input without accepting an incomplete numeric draft. */
export function updateFinancialDemoMarket(doc: FinancialDocument, activityId: string, countryCode: string, value: number | null): FinancialDocument {
  const catalog = calculatorCatalog(doc);
  const activity = catalog.activities.find(item => item.id === activityId);
  if (!activity || !catalog.countries.some(item => item.code === countryCode)) return doc;
  if (value === null || !Number.isSafeInteger(value) || value < 0 || value > 1e12) return doc;
  const existing = doc.markets.filter(item => item.activityId === activityId && item.countryCode === countryCode)
    .sort((a, b) => b.referenceYear - a.referenceYear)[0];
  if (existing && Object.is(existing.companies, value)) return doc;
  const today = new Date().toISOString().slice(0, 10);
  const sourceId = "go_demo_local";
  const source = { id: sourceId, organization: "GO DEMO · ENTRADA LOCAL", url: "https://example.invalid/go-demo-local",
    consultedOn: today, verification: "NO_VERIFICADO" as const, notes: "Cantidad introducida en este dispositivo; sin verificación externa" };
  const market = existing ? { ...existing, companies: value, sourceId, updatedOn: today,
    verification: "NO_VERIFICADO" as const, notes: "Cantidad introducida en este dispositivo" } : {
    activityId, countryCode, referenceYear: doc.startYear, companies: value, unit: activity.unit,
    sourceId, updatedOn: today, verification: "NO_VERIFICADO" as const,
    notes: "Cantidad introducida en este dispositivo",
  };
  return { ...doc, sources: doc.sources.some(item => item.id === sourceId) ? doc.sources : [...doc.sources, source],
    markets: existing ? doc.markets.map(item => item === existing ? market : item) : [...doc.markets, market] };
}
