import { calculateFinancialPlan,consolidateFinancialRows,emptyFinancialDocument,newFinancialAssumption,type FinancialDocument,type FinancialScenario,type FinancialProjection } from "@workspace/api-zod";

// The same twenty country codes already present in the saved GO plan. No statistics.
const COUNTRIES="AE AU BE BR CA CH CN CO DE ES FR GB IN IT JP KR MX NL PL US".split(" ");
const ACTIVITIES=[
 {id:"go_peluquerias",name:"GO Peluquerías"},{id:"go_restaurantes",name:"GO Restaurantes"},{id:"go_imprimir",name:"GO Imprimir"},{id:"go_unas",name:"GO Uñas"},{id:"go_encargos_supermercado",name:"GO Encargos supermercado"},
];
const normal=(value:string)=>value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]/g,"");
const valid=(value:number|null|undefined,max:number)=>typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<=max?value:null;
const key=(activity:string,country:string)=>activity+"|"+country;
export function calculatorCatalog(doc:FinancialDocument){
 let names:Intl.DisplayNames|undefined;try{names=new Intl.DisplayNames(["es"],{type:"region"});}catch{}
 const activities=ACTIVITIES.map(item=>{const saved=doc.activities.find(a=>a.id===item.id)||doc.activities.find(a=>normal(a.name)===normal(item.name));return saved?{...saved,name:item.name}:{...item,unit:"empresa" as const,enabled:true};});
 const countries=(doc.countries.length?doc.countries:COUNTRIES.map(code=>({code,name:names?.of(code)||code,currency:"EUR"}))).map(c=>({...c,name:names?.of(c.code)||c.name}));
 return{activities,countries};
}
function monthlyPrice(doc:FinancialDocument,assumptionId:string|undefined){return doc.revenues.find(r=>r.assumptionId===assumptionId&&r.kind==="monthly"&&r.year===0)||doc.revenues.find(r=>r.assumptionId===assumptionId&&r.kind==="monthly"&&r.year===doc.startYear);}
function euroRate(doc:FinancialDocument,countryCode:string){const currency=doc.countries.find(c=>c.code===countryCode)?.currency||"EUR";return currency==="EUR"?1:doc.fxRates.find(f=>f.currency===currency&&f.baseCurrency==="EUR"&&f.year===doc.startYear)?.rate??null;}
export type RevenueCalculatorRow={id:string;activityId:string;countryCode:string;activity:string;country:string;market:number|null;marketUsable:boolean;unit:string;share:number|null;fee:number|null;feeEditable:boolean;companies:number|null;monthly:number|null;annual:number|null;projection:FinancialProjection};
/** A full-portfolio, twelve-month income view through the existing engine. It never changes the saved growth, costs, currencies or annual exceptions. */
export function revenueCalculatorRows(doc:FinancialDocument,scenario:FinancialScenario):RevenueCalculatorRow[]{
 const catalog=calculatorCatalog(doc),view=emptyFinancialDocument("Proyección de ingresos GO",doc.startYear);view.horizon=1;view.activities=catalog.activities.map(a=>({...a,enabled:true}));view.countries=catalog.countries.map(c=>({...c,currency:"EUR"}));
 const marketMap=new Map<string,FinancialDocument["markets"][number]>();for(const item of doc.markets){const k=key(item.activityId,item.countryCode),old=marketMap.get(k);if(!old||item.referenceYear>old.referenceYear)marketMap.set(k,item);}
 const assumptions=new Map(doc.assumptions.filter(a=>a.scenario===scenario).map(a=>[key(a.activityId,a.countryCode),a]));
 const inputs=catalog.countries.flatMap(country=>catalog.activities.map(activity=>{const id=key(activity.id,country.code),assumption=assumptions.get(id),market=marketMap.get(id),price=monthlyPrice(doc,assumption?.id),rate=euroRate(doc,country.code);return{id,activityId:activity.id,countryCode:country.code,activity:activity.name,country:country.name,market:market?.companies??null,marketUsable:market?.verification!=="CONFLICTO",unit:market?.unit||activity.unit,share:assumption?.penetrationPct??null,fee:price?.value==null||rate===null?null:price.value*rate,feeEditable:rate!==null};}));
 for(const [i,row] of inputs.entries()){const id="calculator_"+i;view.assumptions.push({...newFinancialAssumption(id,row.activityId,row.countryCode,scenario,doc.startYear),marketCompanies:row.marketUsable?row.market:null,penetrationPct:valid(row.share,100),churnPct:0,acquisitionTiming:"start",costsConfirmed:true});view.revenues.push({id:"calculator_fee_"+i,assumptionId:id,year:0,name:"Cuota hipotética EUR",kind:"monthly",value:valid(row.fee,1e12)});}
 const projections=calculateFinancialPlan(view);
 return inputs.map((row,index)=>{const projection=projections[index],known=row.marketUsable&&row.market!==null&&valid(row.share,100)!==null&&valid(row.fee,1e12)!==null;const annual=known?projection.original.recurring:null;return{...row,companies:row.marketUsable&&row.market!==null&&valid(row.share,100)!==null?projection.potentialCompanies:null,monthly:annual===null?null:annual/12,annual,projection:{...projection,complete:known&&annual!==null,consolidated:projection.consolidated?{...projection.consolidated,revenue:annual}:null}};});
}
/** Updates only the chosen pair/scenario's share or monthly price. All other inputs and facts survive. */
export function updateRevenueCalculator(doc:FinancialDocument,activityId:string,countryCode:string,scenario:FinancialScenario,field:"share"|"fee",value:number|null):FinancialDocument{
 const catalog=calculatorCatalog(doc),activity=catalog.activities.find(a=>a.id===activityId),country=catalog.countries.find(c=>c.code===countryCode);if(!activity||!country)return doc;
 const activities=[...doc.activities,...catalog.activities.filter(a=>!doc.activities.some(old=>old.id===a.id))],countries=doc.countries.length?doc.countries:catalog.countries;
 const old=doc.assumptions.find(a=>a.activityId===activityId&&a.countryCode===countryCode&&a.scenario===scenario);
 const id=old?.id||("calc_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12)),assumption=old||newFinancialAssumption(id,activityId,countryCode,scenario,doc.startYear);
 const updated=field==="share"?{...assumption,penetrationPct:value}:assumption;
 const next={...doc,activities,countries,assumptions:old?doc.assumptions.map(a=>a.id===id?updated:a):[...doc.assumptions,updated]};
 if(field==="share")return next;
 const rate=euroRate(doc,countryCode);if(rate===null)return doc;const price=monthlyPrice(doc,id),amount=value===null?null:value/rate;
 return{...next,revenues:price?doc.revenues.map(r=>r.id===price.id?{...r,value:amount}:r):[...doc.revenues,{id:"calc_fee_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12),assumptionId:id,year:0,name:"Cuota mensual hipotética",kind:"monthly",value:amount}]};
}
export function revenueCalculatorTotals(rows:RevenueCalculatorRow[]){
 const known=rows.filter(r=>r.annual!==null),captured=rows.filter(r=>r.companies!==null),total=consolidateFinancialRows(rows.map(r=>r.projection))[0];
 const annual=known.length?total?.knownRevenueSubtotal??null:null;
 return{companies:captured.length?captured.reduce((sum,r)=>sum+r.companies!,0):null,monthly:annual===null?null:annual/12,annual,incomplete:known.length<rows.length,companiesIncomplete:captured.length<rows.length,known:known.length,rows:rows.length};
}
