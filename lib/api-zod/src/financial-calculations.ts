import { financialDocumentSchema, type FinancialDocument, type FinancialAssumption, type FinancialScenario } from "./financial-plan";
export type Money = number | null;
export type FinancialAmounts = { recurring: Money; variable: Money; oneOff: Money; revenue: Money; operationsValue: Money;
  operating: Money; investments: Money; taxes: Money; margin: Money; result: Money; cashAfterInvestment: Money };
export type FinancialProjection = { activityId: string; countryCode: string; scenario: FinancialScenario; year: number; currency: string; baseCurrency: string;
  market: Money; potentialCompanies: Money; newCompanies: Money; retainedCompanies: Money; churnedCompanies: Money; activeCompanies: Money; companyMonths: Money;
  monthlyRevenuePerCompany: Money; monthlyRevenue: Money[]; original: FinancialAmounts; consolidated: FinancialAmounts | null; issues: string[]; localComplete: boolean; complete: boolean };
const zero = () => Array<number>(12).fill(0);
const digitsFor = (currency: string): number => { const digits=new Intl.NumberFormat("en", {style:"currency",currency}).resolvedOptions().maximumFractionDigits; if(digits===undefined)throw new Error("No se pudo verificar la precisión monetaria");return digits; };
const countSum = (values: Money[]): Money => values.some(value => value === null) ? null : (values as number[]).reduce((a,b)=>a+b,0);
const rawTimes = (a: Money,b: Money): Money => a===0||b===0?0:a===null||b===null?null:a*b;
function currencyMath(digits: number) {
 const scale = Math.pow(10,digits);
 const round = (value: number): Money => Number.isFinite(value) && Math.abs(value)<=Number.MAX_SAFE_INTEGER/scale ? Math.round((value+Math.sign(value)*Number.EPSILON)*scale)/scale : null;
 const total = (values: Money[]): Money => values.some(value=>value===null)?null:round((values as number[]).reduce((a,b)=>a+b,0));
 const diff = (a:Money,b:Money):Money => a===null||b===null?null:round(a-b);
 const times = (a:Money,b:Money):Money => {const raw=rawTimes(a,b);return raw===null?null:round(raw);};
 // Largest remainders reconcile monthly accrual to the exact rounded annual amount.
 const balance = (values: Money[]): Money[] => {
  if(values.some(value=>value===null||!Number.isFinite(value)||value<0))return values.map(value=>value===null?null:round(value));
  const numbers=values as number[], annual=total(numbers);if(annual===null)return numbers.map(()=>null);
  const units=numbers.map(value=>Math.floor(value*scale)), target=Math.round(annual*scale);
  const order=numbers.map((value,index)=>({index,remainder:value*scale-units[index]})).sort((a,b)=>b.remainder-a.remainder||a.index-b.index);
  let rest=target-units.reduce((a,b)=>a+b,0);for(const item of order){if(rest<=0)break;units[item.index]++;rest--;}
  return units.map(value=>value/scale);
 };
 function amounts(recurring:Money[],variable:Money[],oneOff:Money[],operations:Money[],operating:Money[],investments:Money[],taxes:Money[]):FinancialAmounts {
  const rec=total(recurring),vari=total(variable),one=total(oneOff),revenue=total([rec,vari,one]),op=total(operating),inv=total(investments),tax=total(taxes);
  const margin=diff(revenue,op);return{recurring:rec,variable:vari,oneOff:one,revenue,operationsValue:total(operations),operating:op,investments:inv,taxes:tax,margin,result:diff(margin,tax),cashAfterInvestment:diff(diff(margin,tax),inv)};
 }
 return{round,total,diff,times,balance,amounts};
}
const pairKey = (activity: string, country: string) => activity + "|" + country;
/** Pure shared engine. Results are derived, never saved as a second source of truth. */
export function calculateFinancialPlan(input: FinancialDocument): FinancialProjection[] {
  const doc = financialDocumentSchema.parse(input), out: FinancialProjection[] = [];
  const enabled = new Set(doc.activities.filter(row => row.enabled).map(row => row.id));
  const countries = new Map(doc.countries.map(row => [row.code, row]));
  const markets = new Map<string, typeof doc.markets>();
  for (const market of doc.markets) { const key = pairKey(market.activityId, market.countryCode); const list = markets.get(key) || []; list.push(market); markets.set(key, list); }
  for (const list of markets.values()) list.sort((a, b) => b.referenceYear - a.referenceYear);
  const revenueMap = new Map<string, typeof doc.revenues>(), costMap = new Map<string, typeof doc.costs>();
  for (const row of doc.revenues) { const list = revenueMap.get(row.assumptionId) || []; list.push(row); revenueMap.set(row.assumptionId, list); }
  for (const row of doc.costs) { const list = costMap.get(row.assumptionId) || []; list.push(row); costMap.set(row.assumptionId, list); }
  const fx = new Map(doc.fxRates.map(row => [[row.currency, row.baseCurrency, row.year].join("|"), row.rate]));
  for (const base of doc.assumptions) {
    if (!base.selected || !enabled.has(base.activityId)) continue;
    const country = countries.get(base.countryCode)!;
    const annual = new Map(base.years.map(row => [row.year, row]));
    let previousActive: Money = base.openingCompanies, previousShare: Money = base.penetrationPct;
    let previousMarket: Money | undefined;
    const {round,total,diff,times,balance,amounts}=currencyMath(digitsFor(country.currency));
    const commonMath=currencyMath(digitsFor(doc.baseCurrency));
    // Carry portfolios from their real start even if the visible horizon starts later.
    for (let y = Math.min(base.startYear, doc.startYear); y < doc.startYear + doc.horizon; y++) {
      const issues: string[] = [], addIssue = (message: string) => { if (!issues.includes(message)) issues.push(message); };
      const override = annual.get(y);
      const p = { ...base } as FinancialAssumption;
      if (override) for (const key of Object.keys(override) as (keyof typeof override)[]) {
        if (key !== "year" && override[key] !== null) Object.assign(p, { [key]: override[key] });
      }
      const started = y >= base.startYear, n = y - base.startYear;
      const fact=markets.get(pairKey(base.activityId,base.countryCode))?.find(row=>row.referenceYear<=y);
      let market:Money=null;
      if(override?.marketCompanies!=null)market=override.marketCompanies;
      else if(base.marketCompanies!==null){
       market=y<=base.startYear?base.marketCompanies:previousMarket===null||previousMarket===undefined||p.marketGrowthPct===null?null:previousMarket*(1+p.marketGrowthPct/100);
       addIssue("Tamaño de mercado introducido como hipótesis del escenario");
      } else if(fact?.companies!==null&&fact?.companies!==undefined&&fact.verification!=="CONFLICTO"){
       if(fact.referenceYear===y)market=fact.companies;
       else if(p.marketGrowthPct!==null)market=previousMarket===undefined?fact.companies*Math.pow(1+p.marketGrowthPct/100,y-fact.referenceYear):previousMarket===null?null:previousMarket*(1+p.marketGrowthPct/100);
       else addIssue("Falta crecimiento del mercado para proyectar un dato de otro año");
       if(fact.verification!=="VERIFICADO")addIssue("Mercado no verificado: hipótesis pendiente de contrastar");
       if(fact.referenceYear!==y)addIssue("Mercado proyectado desde "+fact.referenceYear+"; no es una observación del año");
      }
      if(market!==null&&(!Number.isFinite(market)||market>1e12)){market=null;addIssue("Mercado proyectado fuera del rango admitido");}
      previousMarket=market;
      if(market===null&&started)addIssue("Falta tamaño de mercado compatible");
      let share:Money=p.penetrationPct;
      if(started&&n>0&&override?.penetrationPct==null){
       if(previousShare===null||p.annualGrowthPct===null){share=null;addIssue("Falta crecimiento anual o porcentaje para este año");}
       else share=Math.min(100,previousShare*(1+p.annualGrowthPct/100));
      }
      if(started)previousShare=share;
      const potential: Money = market === null || share === null ? null : market * share / 100;
      let newCompanies: Money = started ? null : 0, retained: Money = started ? null : 0;
      let active: Money = started ? null : 0, churned: Money = started ? null : 0;
      let monthlyActive: Money[] = zero(), monthlyNew: Money[] = zero();
      const beginning: Money = previousActive;
      if (started) {
        if (share === null && p.newCompanies === null) addIssue("Falta porcentaje de captación o altas explícitas");
        let retention: Money = p.churnPct === null ? null : Math.pow(1 - p.churnPct / 100, 1 / 12);
        if (p.retainedCompanies !== null && beginning !== null) {
          if (p.retainedCompanies > beginning) { retention = null; addIssue("Las empresas retenidas no pueden superar la cartera inicial del año"); }
          else retention = beginning === 0 ? 1 : Math.pow(p.retainedCompanies / beginning, 1 / 12);
        }
        if (retention === null) addIssue("Falta hipótesis de bajas o permanencia");
        const weights = base.acquisitionTiming === "start" ? [1, ...Array<number>(11).fill(0)] : base.acquisitionTiming === "end" ? [...Array<number>(11).fill(0), 1] : Array<number>(12).fill(1 / 12);
        if (beginning !== null && retention !== null) {
          retained = beginning * Math.pow(retention, 12);
          if(potential!==null&&retained>potential)addIssue("La cartera retenida supera el objetivo; no se presumen bajas adicionales");
          const factor = weights.reduce((sum, weight, index) => sum + weight * Math.pow(retention!, 11 - index), 0);
          const desiredNew = p.newCompanies !== null ? p.newCompanies : potential === null ? null : factor > 0 ? Math.max(0, potential - retained) / factor : potential === 0 ? 0 : null;
          if (desiredNew !== null && Number.isFinite(desiredNew) && desiredNew <= 1e12) {
            let current: number = beginning, allNew = 0;
            for (let month = 0; month < 12; month++) {
              const survived = current * retention;
              const proposed = desiredNew * weights[month];
              const incorporated = market === null ? proposed : Math.min(proposed, Math.max(0, market - survived));
              if (incorporated < proposed - 0.000001) addIssue("Altas limitadas al mercado disponible");
              const fraction = base.acquisitionTiming === "start" ? 1 : base.acquisitionTiming === "end" ? 0 : 0.5;
              monthlyActive[month] = (current + survived) / 2 + incorporated * fraction;
              monthlyNew[month] = incorporated; allNew += incorporated; current = survived + incorporated;
            }
            newCompanies = allNew; active = current; churned = Math.max(0, beginning + allNew - current);
          } else { monthlyActive = Array<Money>(12).fill(null); monthlyNew = Array<Money>(12).fill(null); }
        } else { monthlyActive = Array<Money>(12).fill(null); monthlyNew = Array<Money>(12).fill(null); }
      }
      const portfolioCoherent=market===null||active===null||active<=market+0.000001;
      if(!portfolioCoherent)addIssue("La cartera declarada supera el mercado; revisa mercado y permanencia");
      if(started)previousActive = active;
      const rawRevenues = revenueMap.get(base.id) || [], rawCosts = costMap.get(base.id) || [];
      const revenueRows = rawRevenues.filter(row => row.year === y || (started && row.year === 0 && !rawRevenues.some(over => over.year === y && over.kind === row.kind)));
      const costRows = rawCosts.filter(row => row.year === y || (started && row.year === 0 && !rawCosts.some(over => over.year === y && over.name === row.name && over.category === row.category)));
      const recurring: Money[] = zero(), variable: Money[] = zero(), oneOff: Money[] = zero(), operating: Money[] = zero(), investments: Money[] = zero(), taxes: Money[] = zero();
      const operations = monthlyActive.map(value => started ? rawTimes(value, p.operationsPerCompanyMonth) : 0);
      const operationsValue = operations.map(value => times(value, p.averageTicket));
      if (started && !revenueRows.length) { addIssue("Falta modelo de ingresos; no se presume una tarifa gratuita"); recurring.fill(null); }
      if (started && !p.costsConfirmed) addIssue("Costes incompletos: confirma expresamente su definición, incluso si son cero");
      for(const row of revenueRows){
       const raw=monthlyActive.map((active,m)=>{
        if(row.kind==="monthly"||row.kind==="annual")return rawTimes(active,row.value===null?null:row.value/(row.kind==="annual"?12:1));
        if(row.kind==="one_off")return rawTimes(monthlyNew[m],row.value);
        if(row.kind==="operation")return rawTimes(operations[m],row.value);
        return rawTimes(operationsValue[m],row.value===null?null:row.value/100);
       });
       const values=balance(raw),target=row.kind==="monthly"||row.kind==="annual"?recurring:row.kind==="one_off"?oneOff:variable;
       values.forEach((value,m)=>{target[m]=total([target[m],value]);if(value===null)addIssue("Ingresos con parámetros incompletos o fuera de rango");});
      }
      const monthlyRevenue = recurring.map((value, m) => total([value, variable[m], oneOff[m]]));
      const calculateCost = (row: typeof doc.costs[number], month: number): Money => {
        if (row.driver === "company_month") return rawTimes(monthlyActive[month], row.value);
        if (row.driver === "hundred_company_month") return rawTimes(monthlyActive[month] === null ? null : monthlyActive[month]! / 100, row.value);
        if (row.driver === "operation") return rawTimes(operations[month], row.value);
        if (row.driver === "percent_revenue") return rawTimes(monthlyRevenue[month], row.value === null ? null : row.value / 100);
        if (row.driver === "percent_margin") { const margin = diff(total(monthlyRevenue), total(operating)); const annualTax = rawTimes(margin === null ? null : Math.max(0, margin), row.value === null ? null : row.value / 100); return annualTax === null ? null : annualTax / 12; }
        return row.value === null ? null : row.value / (row.driver === "fixed_year" ? 12 : 1);
      };
      // Operating costs first: tax on margin never depends on input ordering.
      for (const category of ["operating", "investment", "tax"] as const) {
        for(const row of costRows.filter(item=>item.category===category)){
         const values=balance(Array.from({length:12},(_,m)=>calculateCost(row,m))),target=category==="operating"?operating:category==="investment"?investments:taxes;
         values.forEach((value,m)=>{target[m]=total([target[m],value]);if(value===null)addIssue("Costes con parámetros incompletos o fuera de rango");});
        }
      }
      const rate = country.currency === doc.baseCurrency ? 1 : fx.get([country.currency, doc.baseCurrency, y].join("|"));
      if (rate === undefined) addIssue("Falta tipo de cambio documentado para " + y);
      const original = amounts(recurring, variable, oneOff, operationsValue, operating, investments, taxes);
      const convert = (values: Money[]) => commonMath.balance(values.map(value => rate === undefined || value === null ? null : value * rate));
      const consolidated = rate === undefined ? null : commonMath.amounts(convert(recurring), convert(variable), convert(oneOff), convert(operationsValue), convert(operating), convert(investments), convert(taxes));
      const companyMonths=countSum(monthlyActive);
      const monthlyRevenuePerCompany=original.revenue===null||companyMonths===null||companyMonths<=0?null:round(original.revenue/companyMonths);
      if (y >= doc.startYear) out.push({ activityId: base.activityId, countryCode: base.countryCode, scenario: base.scenario, year: y, currency: country.currency, baseCurrency: doc.baseCurrency,
        market, potentialCompanies: potential, newCompanies, retainedCompanies: retained, churnedCompanies: churned, activeCompanies: active,
        companyMonths, monthlyRevenuePerCompany, monthlyRevenue, original, consolidated, issues,
        localComplete: (!started || (portfolioCoherent && market !== null && active !== null && p.costsConfirmed)) && original.result !== null,
        complete: (!started || (portfolioCoherent && market !== null && active !== null && p.costsConfirmed)) && original.result !== null && consolidated !== null && consolidated.result !== null && consolidated.cashAfterInvestment !== null,
      });
    }
  }
  return out;
}
export type FinancialTotal = { year: number; scenario: FinancialScenario; rows: number; incompleteRows: number;
  amounts: FinancialAmounts; knownRevenueSubtotal: Money; activeCompanies: Money };
/** Every consolidation (country/activity/global) consumes these exact derived rows. */
export function consolidateFinancialRows(rows: FinancialProjection[], activityId?: string, countryCode?: string): FinancialTotal[] {
  const selected = rows.filter(row => (!activityId || row.activityId === activityId) && (!countryCode || row.countryCode === countryCode));
  const groups = new Map<string, FinancialProjection[]>();
  for (const row of selected) { const key = row.year + "|" + row.scenario; const list = groups.get(key) || []; list.push(row); groups.set(key, list); }
  return [...groups.values()].map(list => {
    const {round,total}=currencyMath(digitsFor(list[0].baseCurrency));
    const keys: (keyof FinancialAmounts)[] = ["recurring", "variable", "oneOff", "revenue", "operationsValue", "operating", "investments", "taxes", "margin", "result", "cashAfterInvestment"];
    const values = {} as FinancialAmounts;
    const incomplete = list.filter(row => !row.complete).length;
    for (const key of keys) values[key] = total(list.map(row => row.consolidated?.[key] ?? null));
    // A partial input set is never presented as a complete global profit.
    if (incomplete) { values.result = null; values.cashAfterInvestment = null; }
    return { year: list[0].year, scenario: list[0].scenario, rows: list.length, incompleteRows: incomplete, amounts: values,
      knownRevenueSubtotal: round(list.reduce((sum, row) => sum + (row.consolidated?.revenue || 0), 0)),
      activeCompanies: countSum(list.map(row => row.activeCompanies)) };
  }).sort((a, b) => a.year - b.year || a.scenario.localeCompare(b.scenario));
}
