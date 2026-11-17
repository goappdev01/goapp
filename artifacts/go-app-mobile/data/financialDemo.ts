import { emptyFinancialDocument, newFinancialAssumption, financialDocumentSchema, type FinancialDocument } from "@workspace/api-zod";
import { calculatorCatalog } from "./financialRevenueCalculator";

/** Ephemeral, visibly synthetic inputs for the existing calculator. Never persisted. */
export function createFinancialDemoDocument(startYear = new Date().getFullYear()): FinancialDocument {
  const doc = emptyFinancialDocument("Calculadora DEMO · datos ficticios", startYear);
  const catalog = calculatorCatalog(doc);
  doc.activities = catalog.activities;
  doc.countries = catalog.countries;
  const today = new Date().toISOString().slice(0, 10);
  doc.sources = [{ id: "go_demo_synthetic", organization: "GO DEMO · DATOS FICTICIOS", url: "https://example.invalid/go-demo", consultedOn: today, verification: "NO_VERIFICADO", notes: "Cifras sintéticas, solo en memoria" }];
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

/** Changes only an ephemeral DEMO input, never a verified market or a saved plan. */
export function updateFinancialDemoMarket(doc: FinancialDocument, activityId: string, countryCode: string, value: number | null): FinancialDocument {
  const catalog = calculatorCatalog(doc);
  const activity = catalog.activities.find(item => item.id === activityId);
  if (!activity || !catalog.countries.some(item => item.code === countryCode)) return doc;
  const companies = value !== null && Number.isSafeInteger(value) && value >= 0 && value <= 1e12 ? value : null;
  const existing = doc.markets.find(item => item.activityId === activityId && item.countryCode === countryCode);
  if (existing && Object.is(existing.companies, companies)) return doc;
  const today = new Date().toISOString().slice(0, 10);
  const market = existing ? { ...existing, companies, updatedOn: today } : {
    activityId, countryCode, referenceYear: doc.startYear, companies, unit: activity.unit,
    sourceId: "go_demo_synthetic", updatedOn: today, verification: "NO_VERIFICADO" as const,
    notes: "Dato ficticio introducido para la demostración",
  };
  return { ...doc, markets: existing ? doc.markets.map(item => item === existing ? market : item) : [...doc.markets, market] };
}
