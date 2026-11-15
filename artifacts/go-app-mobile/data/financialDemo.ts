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
  for (const [countryIndex, country] of doc.countries.entries()) {
    for (const [activityIndex, activity] of doc.activities.entries()) {
      const id = `demo_${country.code}_${activity.id}`;
      doc.markets.push({ activityId: activity.id, countryCode: country.code, referenceYear: startYear,
        companies: 1000 + countryIndex * 100 + activityIndex * 200, unit: activity.unit,
        sourceId: "go_demo_synthetic", updatedOn: today, verification: "NO_VERIFICADO", notes: "Dato ficticio para probar la calculadora" });
      doc.assumptions.push({ ...newFinancialAssumption(id, activity.id, country.code, "REAL", startYear),
        penetrationPct: 5, acquisitionTiming: "start", costsConfirmed: true });
      doc.revenues.push({ id: `fee_${id}`, assumptionId: id, year: 0,
        name: "Cuota ficticia mensual", kind: "monthly", value: 29 });
    }
  }
  return financialDocumentSchema.parse(doc);
}
