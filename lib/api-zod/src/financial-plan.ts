import { z } from "zod";

export const FINANCE_SCENARIOS = ["PESIMISTA", "REAL", "OPTIMISTA"] as const;
// ISO 3166-1 alpha-2 identifiers only; no market counts or commercial catalogue.
export const FINANCE_COUNTRY_CODES = ("AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW").split(" ");
const countrySet = new Set(FINANCE_COUNTRY_CODES);
export const financeCountryCode = z.string().refine(value => countrySet.has(value), "Código ISO 3166-1 no compatible");
export const FINANCE_CURRENCY_CODES = ["AED","AFN","ALL","AMD","ANG","AOA","ARS","AUD","AWG","AZN","BAM","BBD","BDT","BGN","BHD","BIF","BMD","BND","BOB","BRL","BSD","BTN","BWP","BYN","BZD","CAD","CDF","CHF","CLP","CNY","COP","CRC","CUC","CUP","CVE","CZK","DJF","DKK","DOP","DZD","EGP","ERN","ETB","EUR","FJD","FKP","GBP","GEL","GHS","GIP","GMD","GNF","GTQ","GYD","HKD","HNL","HRK","HTG","HUF","IDR","ILS","INR","IQD","IRR","ISK","JMD","JOD","JPY","KES","KGS","KHR","KMF","KPW","KRW","KWD","KYD","KZT","LAK","LBP","LKR","LRD","LSL","LYD","MAD","MDL","MGA","MKD","MMK","MNT","MOP","MRU","MUR","MVR","MWK","MXN","MYR","MZN","NAD","NGN","NIO","NOK","NPR","NZD","OMR","PAB","PEN","PGK","PHP","PKR","PLN","PYG","QAR","RON","RSD","RUB","RWF","SAR","SBD","SCR","SDG","SEK","SGD","SHP","SLE","SLL","SOS","SRD","SSP","STN","SVC","SYP","SZL","THB","TJS","TMT","TND","TOP","TRY","TTD","TWD","TZS","UAH","UGX","USD","UYU","UZS","VES","VND","VUV","WST","XAF","XCD","XCG","XDR","XOF","XPF","XSU","YER","ZAR","ZMW","ZWG","ZWL"];
export const financeCurrency = z.string().refine(code => FINANCE_CURRENCY_CODES.includes(code), "Moneda ISO 4217 no compatible");
const id = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/);
const name = z.string().trim().min(1).max(160);
const year = z.number().int().min(1800).max(2300);
const amount = z.number().finite().min(0).max(1e12);
const percentage = z.number().finite().min(0).max(100);
const growth = z.number().finite().min(-100).max(1000);
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(s => { const d = new Date(s + "T00:00:00Z"); return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === s; });
export const financeVerification = z.enum(["NO_VERIFICADO", "VERIFICADO", "ESTIMACION", "CONFLICTO"]);
export const financeUnit = z.enum(["empresa", "establecimiento", "otra"]);
export const financeSource = z.object({ id, organization: name, url: z.string().url().max(2000).refine(s => /^https?:\/\//i.test(s)), consultedOn: date, verification: financeVerification, notes: z.string().max(2000) }).strict();
export const financeActivity = z.object({ id, name, unit: financeUnit, enabled: z.boolean() }).strict();
export const financeCountry = z.object({ code: financeCountryCode, name, currency: financeCurrency }).strict();
export const financeMarket = z.object({ activityId: id, countryCode: financeCountryCode, referenceYear: year,
  companies: amount.nullable(), unit: financeUnit, sourceId: id, updatedOn: date, verification: financeVerification, notes: z.string().max(2000) }).strict().refine(row => row.companies===null || row.unit==="otra" || Number.isInteger(row.companies), "El número observado de empresas o establecimientos debe ser entero");
const annualShape = {
  penetrationPct: percentage.nullable(), annualGrowthPct: growth.nullable(), marketGrowthPct: growth.nullable(),
  churnPct: percentage.nullable(), newCompanies: amount.nullable(), retainedCompanies: amount.nullable(),
  marketCompanies: amount.nullable(), operationsPerCompanyMonth: amount.nullable(), averageTicket: amount.nullable(),
};
export const financeYear = z.object({ year, ...annualShape }).strict();
export const financeAssumption = z.object({ id, activityId: id, countryCode: financeCountryCode,
  scenario: z.enum(FINANCE_SCENARIOS), selected: z.boolean(), startYear: year, openingCompanies: amount,
  ...annualShape, acquisitionTiming: z.enum(["uniform", "start", "end"]), costsConfirmed: z.boolean(),
  years: z.array(financeYear).max(50),
}).strict();
const scoped = { id, assumptionId: id, year: z.union([z.literal(0), year]), name };
export const financeRevenue = z.object({ ...scoped, kind: z.enum(["monthly", "annual", "commission", "operation", "one_off"]), value: amount.nullable() }).strict().refine(row => row.kind !== "commission" || row.value === null || row.value <= 100, "Comisión fuera de 0–100");
export const financeCost = z.object({ ...scoped, category: z.enum(["operating", "investment", "tax"]),
  driver: z.enum(["company_month", "hundred_company_month", "percent_revenue", "percent_margin", "operation", "fixed_month", "fixed_year"]), value: amount.nullable(),
}).strict().refine(row => !row.driver.startsWith("percent_") || row.value === null || row.value <= 100, "Porcentaje fuera de 0–100").refine(row => row.driver !== "percent_margin" || row.category === "tax", "El porcentaje sobre margen solo se admite como impuesto supuesto");
export const financeFx = z.object({ currency: financeCurrency, baseCurrency: financeCurrency, year,
  rate: z.number().finite().positive().max(1e9), sourceId: id, asOf: date }).strict().refine(row => row.currency!==row.baseCurrency || row.rate===1, "Una moneda respecto a sí misma tiene tipo 1");
const documentSchema = z.object({ schemaVersion: z.literal(1), title: name, baseCurrency: financeCurrency,
  startYear: year, horizon: z.number().int().min(1).max(50),
  activities: z.array(financeActivity).max(200), countries: z.array(financeCountry).max(249), sources: z.array(financeSource).max(25000),
  markets: z.array(financeMarket).max(25000), assumptions: z.array(financeAssumption).max(15000),
  revenues: z.array(financeRevenue).max(50000), costs: z.array(financeCost).max(50000), fxRates: z.array(financeFx).max(10000),
}).strict();
export const financialDocumentSchema = documentSchema.superRefine((doc, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: "custom", message });
  function unique<T>(rows: T[], key: (row: T) => string, label: string) {
    const found = new Set<string>(); for (const row of rows) { const k = key(row); if (found.has(k)) fail("Duplicado: " + label + " " + k); found.add(k); } return found;
  }
  const activities = unique(doc.activities, row => row.id, "actividad");
  const countries = unique(doc.countries, row => row.code, "país");
  const sources = unique(doc.sources, row => row.id, "fuente");
  const assumptions = unique(doc.assumptions, row => row.id, "hipótesis");
  unique(doc.assumptions, row => [row.activityId, row.countryCode, row.scenario].join("|"), "actividad/país/escenario");
  unique(doc.markets, row => [row.activityId, row.countryCode, row.referenceYear].join("|"), "mercado/año");
  unique(doc.revenues, row => row.id, "ingreso"); unique(doc.costs, row => row.id, "coste");
  unique(doc.costs, row => [row.assumptionId,row.year,row.category,row.name.toLocaleLowerCase()].join("|"), "concepto de coste/año");
  unique(doc.revenues, row => [row.assumptionId, row.year, row.kind].join("|"), "modelo de ingreso/año");
  unique(doc.fxRates, row => [row.currency, row.baseCurrency, row.year].join("|"), "conversión/año");
  const unitByActivity = new Map(doc.activities.map(row => [row.id, row.unit]));
  for (const row of [...doc.markets, ...doc.assumptions]) {
    if (!activities.has(row.activityId) || !countries.has(row.countryCode)) fail("Referencia actividad/país inexistente");
  }
  for (const row of doc.markets) {
    if (!sources.has(row.sourceId)) fail("Fuente inexistente");
    if (unitByActivity.get(row.activityId) !== row.unit) fail("Unidad estadística incompatible con la actividad");
  }
  for (const row of doc.assumptions) unique(row.years, item => String(item.year), "hipótesis anual");
  for (const row of [...doc.revenues, ...doc.costs]) if (!assumptions.has(row.assumptionId)) fail("Hipótesis inexistente");
  for (const row of doc.fxRates) if (!sources.has(row.sourceId)) fail("Fuente de conversión inexistente");
  if (doc.startYear + doc.horizon - 1 > 2300) fail("Horizonte fuera de rango");
  const selected = doc.assumptions.filter(row => row.selected && doc.activities.some(a => a.id === row.activityId && a.enabled)).length;
  if (doc.assumptions.filter(row => row.selected).reduce((sum,row) => sum + Math.max(doc.horizon,doc.startYear + doc.horizon - row.startYear),0) > 50000) fail("Reduce el horizonte o la selección: máximo 50000 proyecciones por plan");
});
export type FinancialDocument = z.infer<typeof financialDocumentSchema>;
export type FinancialAssumption = z.infer<typeof financeAssumption>;
export type FinancialMarket = z.infer<typeof financeMarket>;
export type FinancialScenario = typeof FINANCE_SCENARIOS[number];
export type FinancialPlan = { id: string; ownerUserId: string; version: number; canWrite: boolean; document: FinancialDocument };
export const EMPTY_ANNUAL = { penetrationPct: null, annualGrowthPct: null, marketGrowthPct: null, churnPct: null,
  newCompanies: null, retainedCompanies: null, marketCompanies: null, operationsPerCompanyMonth: null, averageTicket: null } as const;
export function emptyFinancialDocument(title = "Plan Financiero y Proyecciones", startYear = new Date().getFullYear()): FinancialDocument {
  return { schemaVersion: 1, title, startYear, horizon: 5, baseCurrency: "EUR", activities: [], countries: [], sources: [], markets: [], assumptions: [], revenues: [], costs: [], fxRates: [] };
}
export function newFinancialAssumption(id: string, activityId: string, countryCode: string, scenario: FinancialScenario, startYear: number): FinancialAssumption {
  return { id, activityId, countryCode, scenario, selected: true, startYear, openingCompanies: 0, ...EMPTY_ANNUAL, acquisitionTiming: "uniform", costsConfirmed: false, years: [] };
}
/** Reserved for the central Kai tool registry: proposals only; never auto-execute. */
export const financialKaiProposalSchema = z.object({ schemaVersion: z.literal(1), planId: z.string().uuid(), expectedVersion: z.number().int().positive(),
  operation: z.enum(["explain", "compare", "propose_hypotheses", "propose_countries", "propose_activities", "prepare_market_import"]),
  reason: name, proposedDocument: financialDocumentSchema.optional(),
  requiredConfirmations: z.tuple([z.literal("REVISAR_PROPUESTA"), z.literal("CONFIRMAR_APLICACION")]),
}).strict();
