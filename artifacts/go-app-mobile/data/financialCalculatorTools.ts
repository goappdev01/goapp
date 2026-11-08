import {calculateFinancialPlan,emptyFinancialDocument,financialDocumentSchema,newFinancialAssumption,type FinancialDocument,type FinancialScenario} from "@workspace/api-zod";
import {calculatorCatalog,updateRevenueCalculator,type RevenueCalculatorRow} from "./financialRevenueCalculator";

export const DIRECT_COST_NAME="Coste directo unitario";
const normalized=(s:string)=>s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").trim().toLocaleLowerCase().replace(/\s+/g," ");
const fresh=(prefix:string)=>prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12);
function validated(next:FinancialDocument){
 const result=financialDocumentSchema.safeParse(next);
 if(!result.success)throw Error("Revisa nombre, cantidad, unidad, año y referencia de la fuente. No se ha aplicado el cambio.");
 return result.data;
}
export function saveCalculatorActivity(doc:FinancialDocument,input:{id?:string;name:string;unit:FinancialDocument["activities"][number]["unit"];enabled:boolean}):FinancialDocument {
 const catalog=calculatorCatalog(doc),name=input.name.trim();
 if(!name||name.length>160)throw Error("Introduce un nombre de 1 a 160 caracteres.");
 if(catalog.activities.some(a=>a.id!==input.id&&normalized(a.name)===normalized(name)))throw Error("Ya existe una actividad con ese nombre.");
 const id=input.id||fresh("activity");
 if(input.id&&!catalog.activities.some(a=>a.id===input.id))throw Error("La actividad ya no existe.");
 const old=catalog.activities.find(a=>a.id===id);
 if(old&&old.unit!==input.unit&&doc.markets.some(m=>m.activityId===id))throw Error("La unidad de un mercado existente debe conservarse.");
 const item={id,name,unit:input.unit,enabled:input.enabled};
 const next={...doc,activities:old?catalog.activities.map(a=>a.id===id?item:a):[...catalog.activities,item]};
 return validated(next);
}
export function deleteCalculatorActivity(doc:FinancialDocument,id:string,confirmed:boolean):FinancialDocument {
 if(!confirmed)throw Error("Confirma la eliminación definitiva.");
 if(doc.markets.some(m=>m.activityId===id)||doc.assumptions.some(a=>a.activityId===id))throw Error("La actividad tiene datos asociados. Desactívala para conservar el histórico.");
 // The five built-in identities must remain available and are only deactivated.
 if(id.startsWith("go_"))throw Error("Las actividades originales se conservan; puedes desactivarlas.");
 return {...doc,activities:doc.activities.filter(a=>a.id!==id)};
}
export function saveCalculatorMarket(doc:FinancialDocument,market:FinancialDocument["markets"][number],confirmVerified=false,source?:FinancialDocument["sources"][number]):FinancialDocument {
 if(source&&doc.sources.some(s=>s.id===source.id))throw Error("La referencia ya existe. Elige su fuente o crea otra sin sobrescribirla.");
 const prior=doc.markets.find(m=>m.activityId===market.activityId&&m.countryCode===market.countryCode&&m.referenceYear===market.referenceYear);
 if(prior?.verification==="VERIFICADO"&&JSON.stringify(prior)!==JSON.stringify(market)&&!confirmVerified)throw Error("Confirma explícitamente el cambio del dato verificado.");
 const catalog=calculatorCatalog(doc);
 const next={...doc,activities:catalog.activities,countries:catalog.countries,
  sources:source?[...doc.sources.filter(s=>s.id!==source.id),source]:doc.sources,
  markets:prior?doc.markets.map(m=>m===prior?market:m):[...doc.markets,market]};
 return validated(next);
}
export function clearCalculatorSimulation(doc:FinancialDocument,countries:string[],activities:string[],scenario:FinancialScenario,fields:("share"|"fee")[]=["share","fee"]):FinancialDocument {
 if(!countries.length||!activities.length)throw Error("Selecciona países y actividades antes de limpiar.");
 const selected=doc.assumptions.filter(a=>countries.includes(a.countryCode)&&activities.includes(a.activityId)&&a.scenario===scenario);
 const ids=new Set(selected.map(a=>a.id));
 const feeIds=new Set(selected.map(a=>(doc.revenues.find(r=>r.assumptionId===a.id&&r.kind==="monthly"&&r.year===0)||doc.revenues.find(r=>r.assumptionId===a.id&&r.kind==="monthly"&&r.year===doc.startYear))?.id));
 // No deletion, no scenario facts, cost, source, annual exception or unselected combination changes.
 return {...doc,assumptions:fields.includes("share")?doc.assumptions.map(a=>ids.has(a.id)?{...a,penetrationPct:null}:a):doc.assumptions,
  revenues:fields.includes("fee")?doc.revenues.map(r=>feeIds.has(r.id)?{...r,value:null}:r):doc.revenues};
}
export function selectedCalculatorRows(rows:RevenueCalculatorRow[],countries:string[],activities:string[]){
 return rows.filter(r=>countries.includes(r.countryCode)&&activities.includes(r.activityId));
}
function rate(doc:FinancialDocument,country:string){
 const currency=doc.countries.find(c=>c.code===country)?.currency||"EUR";
 return currency==="EUR"?1:doc.fxRates.find(f=>f.currency===currency&&f.baseCurrency==="EUR"&&f.year===doc.startYear)?.rate??null;
}
export function calculatorUnitCost(doc:FinancialDocument,activity:string,country:string,scenario:FinancialScenario){
 const a=doc.assumptions.find(a=>a.activityId===activity&&a.countryCode===country&&a.scenario===scenario);
 const value=doc.costs.find(c=>c.assumptionId===a?.id&&c.name===DIRECT_COST_NAME&&c.year===0&&c.category==="operating"&&c.driver==="company_month")?.value;
 const fx=rate(doc,country);return value==null||fx===null?null:value*fx;
}
export function updateCalculatorDirectCost(doc:FinancialDocument,activity:string,country:string,scenario:FinancialScenario,value:number|null){
 if(value!==null&&(!Number.isFinite(value)||value<0||value>1e12))throw Error("Introduce un coste válido o deja el campo vacío.");
 const fx=rate(doc,country);if(fx===null)throw Error("Falta la conversión a EUR.");
 const old=doc.assumptions.find(a=>a.activityId===activity&&a.countryCode===country&&a.scenario===scenario);
 const next=updateRevenueCalculator(doc,activity,country,scenario,"share",old?.penetrationPct??null);
 const a=next.assumptions.find(a=>a.activityId===activity&&a.countryCode===country&&a.scenario===scenario);
 if(!a)throw Error("Selecciona una actividad y país válidos.");
 const existing=next.costs.find(c=>c.assumptionId===a.id&&c.year===0&&c.name===DIRECT_COST_NAME&&c.category==="operating"&&c.driver==="company_month");
 const cost={id:existing?.id||fresh("direct"),assumptionId:a.id,year:0,name:DIRECT_COST_NAME,category:"operating" as const,driver:"company_month" as const,value:value===null?null:value/fx};
 return validated({...next,costs:existing?next.costs.map(c=>c.id===existing.id?cost:c):[...next.costs,cost]});
}
/** Optional detail through the SAME financial engine; original income rows are unchanged. */
export function calculatorDirectResults(doc:FinancialDocument,rows:RevenueCalculatorRow[],scenario:FinancialScenario){
 return rows.map(row=>{
  const a=doc.assumptions.find(a=>a.activityId===row.activityId&&a.countryCode===row.countryCode&&a.scenario===scenario);
  const cost=doc.costs.find(c=>c.assumptionId===a?.id&&c.name===DIRECT_COST_NAME&&c.year===0&&c.category==="operating"&&c.driver==="company_month");
  const fx=rate(doc,row.countryCode),unitCost=cost?.value==null||fx===null?null:cost.value*fx;
  const view=emptyFinancialDocument("Costes directos",doc.startYear);view.horizon=1;
  view.activities=[{id:row.activityId,name:row.activity,unit:"empresa",enabled:true}];view.countries=[{code:row.countryCode,name:row.country,currency:"EUR"}];
  view.assumptions=[{...newFinancialAssumption("direct",row.activityId,row.countryCode,scenario,doc.startYear),newCompanies:row.companies,churnPct:0,acquisitionTiming:"start",costsConfirmed:unitCost!==null}];
  view.revenues=[{id:"price",assumptionId:"direct",year:0,name:"Cuota",kind:"monthly",value:row.fee}];
  view.costs=[{id:"cost",assumptionId:"direct",year:0,name:DIRECT_COST_NAME,category:"operating",driver:"company_month",value:unitCost}];
  const p=calculateFinancialPlan(view)[0],known=unitCost!==null&&row.annual!==null;
  const annualCost=known?p.original.operating:null,gross=known?p.original.margin:null;
  return {id:row.id,name:row.country+" · "+row.activity,unitCost,monthlyCost:annualCost===null?null:annualCost/12,annualCost,
   monthlyGross:gross===null?null:gross/12,annualGross:gross,margin:gross===null||!row.annual?null:gross/row.annual*100};
 });
}
