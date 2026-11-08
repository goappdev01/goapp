import {z} from "zod";
import {calculateFinancialPlan} from "./financial-calculations";
import {emptyFinancialDocument,newFinancialAssumption,financeCountryCode,FINANCE_SCENARIOS} from "./financial-plan";

const amount=z.number().finite().min(0).max(1e12).nullable();
/** Optional catalogue contract, deliberately NOT added to the deployed v1 document.
 * Enabling persistence needs a reviewed server/SQL extension; no mobile-only store. */
export const projectionItemSchema=z.object({
 id:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/),name:z.string().trim().min(1).max(160),
 kind:z.enum(["PRODUCTO","SERVICIO","SUSCRIPCION"]),enabled:z.boolean(),
 cataloguePrice:amount,directUnitCost:amount,period:z.enum(["month","year"]),
}).strict();
export const projectionHypothesisSchema=z.object({
 countryCode:financeCountryCode,scenario:z.enum(FINANCE_SCENARIOS),year:z.number().int().min(1800).max(2300),
 quantity:amount,market:amount,share:z.number().finite().min(0).max(100).nullable(),
 // Undefined inherits the permanent catalogue; null is explicitly "no data".
 price:amount.optional(),directUnitCost:amount.optional(),
}).strict();
export type ProjectionItem=z.infer<typeof projectionItemSchema>;
export type ProjectionHypothesis=z.infer<typeof projectionHypothesisSchema>;
/** Adapter to GO's existing engine, never a second financial engine or data store.
 * Inputs are EUR; conversion must be supplied by the existing documented FX layer. */
export function projectCatalogueItem(itemInput:ProjectionItem,hypothesisInput:ProjectionHypothesis){
 const item=projectionItemSchema.parse(itemInput),h=projectionHypothesisSchema.parse(hypothesisInput);
 if(!item.enabled)return null;
 const doc=emptyFinancialDocument("GO Proyecciones",h.year);doc.horizon=1;
 doc.activities=[{id:item.id,name:item.name,unit:item.kind==="SUSCRIPCION"?"empresa":"otra",enabled:true}];
 doc.countries=[{code:h.countryCode,name:h.countryCode,currency:"EUR"}];
 const price=h.price===undefined?item.cataloguePrice:h.price,cost=h.directUnitCost===undefined?item.directUnitCost:h.directUnitCost;
 const subscribers=h.market===null||h.share===null?null:Math.round(h.market*h.share/100);
 const a={...newFinancialAssumption("hypothesis",item.id,h.countryCode,h.scenario,h.year),churnPct:0,acquisitionTiming:"start" as const,costsConfirmed:cost!==null,
  newCompanies:item.kind==="SUSCRIPCION"?subscribers:1,
  operationsPerCompanyMonth:item.kind==="SUSCRIPCION"?null:h.quantity===null?null:h.quantity/(item.period==="year"?12:1)};
 doc.assumptions=[a];
 doc.revenues=[{id:"price",assumptionId:a.id,year:0,name:"Precio hipotético",kind:item.kind==="SUSCRIPCION"?(item.period==="year"?"annual":"monthly"):"operation",value:price}];
 doc.costs=[{id:"cost",assumptionId:a.id,year:0,name:"Coste directo",category:"operating",driver:item.kind==="SUSCRIPCION"?"company_month":"operation",
  value:cost===null?null:cost/(item.kind==="SUSCRIPCION"&&item.period==="year"?12:1)}];
 const projection=calculateFinancialPlan(doc)[0],annual=projection.original.revenue;
 const costs=cost===null?null:projection.original.operating;
 const gross=cost===null||annual===null?null:projection.original.margin;
 return {projection,monthlyRevenue:annual===null?null:annual/12,annualRevenue:annual,
  monthlyCost:costs===null?null:costs/12,annualCost:costs,monthlyGross:gross===null?null:gross/12,annualGross:gross,
  grossMarginPct:gross===null||annual===null||annual<=0?null:gross/annual*100};
}
