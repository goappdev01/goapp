import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { FINANCE_COUNTRY_CODES, FINANCE_SCENARIOS, EMPTY_ANNUAL, newFinancialAssumption, type FinancialDocument, type FinancialAssumption, type FinancialScenario } from "@workspace/api-zod";
import { COUNTRY_CONFIGS } from "@/utils/countryConfig";
import { FinanceButton, FinanceField, FinanceNumber, financeStyles as s } from "./FinancialUI";
export type FinancialEditProps={doc:FinancialDocument;update:(fn:(doc:FinancialDocument)=>FinancialDocument)=>void;writable:boolean;activityId:string;countryCode:string;scenario:FinancialScenario;year:number};
export const financeId=(prefix:string)=>prefix+"_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,12);
export function FinancialCountries({doc,update,writable,activityId,scenario}:FinancialEditProps){
 const [search,setSearch]=useState(""),[filter,setFilter]=useState("all"),[newName,setNewName]=useState(""),[newId,setNewId]=useState(""),[unit,setUnit]=useState<"empresa"|"establecimiento"|"otra">("empresa");
 const names=useMemo(()=>{try{return new Intl.DisplayNames(["es"],{type:"region"});}catch{return null;}},[]);
 const countryName=(code:string)=>doc.countries.find(c=>c.code===code)?.name||names?.of(code)||code;
 const selected=new Set(doc.assumptions.filter(a=>a.activityId===activityId&&a.scenario===scenario&&a.selected).map(a=>a.countryCode));
 const rows=FINANCE_COUNTRY_CODES.filter(code=>(filter==="all"||(filter==="selected"?selected.has(code):!selected.has(code)))&&(code+" "+countryName(code)).toLocaleLowerCase().includes(search.toLocaleLowerCase()));
 function choose(codes:string[],enabled:boolean){update(current=>{
  if(!enabled)return{...current,assumptions:current.assumptions.map(a=>a.activityId===activityId&&a.scenario===scenario&&codes.includes(a.countryCode)?{...a,selected:false}:a)};
  const countries=[...current.countries],assumptions=[...current.assumptions];
  for(const code of codes){if(!countries.some(c=>c.code===code))countries.push({code,name:countryName(code),currency:Object.values(COUNTRY_CONFIGS).find(c=>c.countryCode===code)?.currency||current.baseCurrency});
   for(const sc of FINANCE_SCENARIOS){const index=assumptions.findIndex(a=>a.activityId===activityId&&a.countryCode===code&&a.scenario===sc);
    if(index<0)assumptions.push({...newFinancialAssumption(financeId("hyp"),activityId,code,sc,current.startYear),selected:sc===scenario&&enabled});
    else if(sc===scenario)assumptions[index]={...assumptions[index],selected:enabled};}}
  return{...current,countries,assumptions};});}
 return <>
 <View style={s.card}><Text style={s.heading}>Actividades comerciales</Text><Text style={s.note}>El identificador se conserva para importaciones futuras. Desactivar excluye cálculos y conserva todos los datos.</Text>
 {doc.activities.map(a=><FinanceButton key={a.id} label={(a.enabled?"☑ ":"☐ ")+a.name+" · "+a.id} disabled={!writable} selected={a.enabled} onPress={()=>update(d=>({...d,activities:d.activities.map(x=>x.id===a.id?{...x,enabled:!x.enabled}:x)}))}/>)}
 <FinanceField label="Nombre de actividad" value={newName} onChange={setNewName} disabled={!writable}/><FinanceField label="Identificador estable" value={newId} onChange={setNewId} placeholder="actividad-elegida" disabled={!writable}/>
 <View style={s.row}>{(["empresa","establecimiento","otra"] as const).map(value=><FinanceButton key={value} label={value} selected={unit===value} disabled={!writable} onPress={()=>setUnit(value)}/>)}</View>
 <FinanceButton label="Añadir actividad al borrador" disabled={!writable||!newName.trim()||!/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,79}$/.test(newId)||doc.activities.some(a=>a.id===newId)} onPress={()=>{update(d=>({...d,activities:[...d.activities,{id:newId,name:newName.trim(),unit,enabled:true}]}));setNewName("");setNewId("");}}/>
 </View>
 <View style={s.card}><Text style={s.heading}>Países · {scenario}</Text><Text style={s.note}>Selección independiente para esta actividad y escenario. Seleccionar todos afecta al catálogo completo; deseleccionar no borra parámetros. Un país nuevo usa la moneda conocida de GO o la moneda base de proyección; revísala antes de introducir tarifas.</Text>
 <FinanceField label="Buscar país o código ISO" value={search} onChange={setSearch}/><View style={s.row}>{[["all","Todos"],["selected","Seleccionados"],["other","Sin seleccionar"]].map(([value,label])=><FinanceButton key={value} label={label} selected={filter===value} onPress={()=>setFilter(value)}/>)}</View>
 <View style={s.row}><FinanceButton label="Seleccionar todos" disabled={!writable||!activityId} onPress={()=>choose(FINANCE_COUNTRY_CODES,true)}/><FinanceButton label="Deseleccionar todos" disabled={!writable||!activityId} onPress={()=>choose(FINANCE_COUNTRY_CODES,false)}/></View>
 {!activityId&&<Text style={s.note}>Crea y elige una actividad antes de seleccionar países.</Text>}
 {rows.map(code=><TouchableOpacity key={code} accessibilityRole="checkbox" accessibilityState={{checked:selected.has(code),disabled:!writable||!activityId}} disabled={!writable||!activityId} onPress={()=>choose([code],!selected.has(code))} style={[s.button,selected.has(code)&&s.selected]}><Text style={s.text}>{selected.has(code)?"☑":"☐"} {code} — {countryName(code)}</Text></TouchableOpacity>)}
 </View></>;
}
const PARAMS: [keyof typeof EMPTY_ANNUAL,string][]=[
 ["penetrationPct","Objetivo de mercado (%)"],["annualGrowthPct","Crecimiento anual del objetivo (%)"],["marketGrowthPct","Crecimiento anual del mercado (%)"],["churnPct","Bajas anuales (%)"],
 ["newCompanies","Altas explícitas del año (opcional)"],["retainedCompanies","Cartera anterior retenida (opcional)"],["marketCompanies","Mercado supuesto del escenario (opcional)"],
 ["operationsPerCompanyMonth","Operaciones por empresa y mes"],["averageTicket","Importe medio de operación (no ingreso de GO)"],
];
export function FinancialParameters(props:FinancialEditProps){const{doc,update,writable,activityId,countryCode,scenario,year}=props;
 const assumption=doc.assumptions.find(a=>a.activityId===activityId&&a.countryCode===countryCode&&a.scenario===scenario);
 function change(fn:(a:FinancialAssumption)=>FinancialAssumption){if(!assumption)return;update(d=>({...d,assumptions:d.assumptions.map(a=>a.id===assumption.id?fn(a):a)}));}
 if(!assumption)return <View style={s.card}><Text style={s.text}>Selecciona este país en Países para preparar su hipótesis. No se crea una cartera ficticia.</Text></View>;
 const annual=year?assumption.years.find(y=>y.year===year)||{year,...EMPTY_ANNUAL}:assumption;
 return <View style={s.card}><Text style={s.heading}>Parámetros · {scenario} · {year||"Base"}</Text><Text style={s.note}>Real es una hipótesis editable, no un resultado observado. No se impone ningún porcentaje. En una excepción anual, vacío hereda la base; cero es una hipótesis explícita. Las altas explícitas prevalecen sobre el objetivo porcentual.</Text>
 <FinanceField label="Moneda de proyección del país" value={doc.countries.find(c=>c.code===countryCode)?.currency||""} disabled={!writable} onChange={currency=>update(d=>({...d,countries:d.countries.map(c=>c.code===countryCode?{...c,currency:currency.toUpperCase()}:c)}))}/>
 <FinanceNumber label="Año de inicio de esta actividad y país" value={assumption.startYear} disabled={!writable} onChange={v=>change(a=>({...a,startYear:v??0}))}/>
 <FinanceNumber label="Empresas existentes al inicio" value={assumption.openingCompanies} disabled={!writable} onChange={v=>change(a=>({...a,openingCompanies:v??Number.NaN}))}/>
 {PARAMS.map(([key,label])=><FinanceNumber key={key} label={label} value={annual[key]} placeholder={year&&assumption[key]!==null?"Heredado: "+assumption[key]:"Sin hipótesis"} disabled={!writable} onChange={v=>change(a=>year?{...a,years:[...a.years.filter(y=>y.year!==year),{...(a.years.find(y=>y.year===year)||{year,...EMPTY_ANNUAL}),[key]:v}]}:{...a,[key]:v})}/>)}
 <Text style={s.label}>Momento de incorporación · editable</Text><View style={s.row}>{([["uniform","Progresiva durante el año"],["start","Todas al inicio"],["end","Todas al final"]] as const).map(([value,label])=><FinanceButton key={value} label={label} selected={assumption.acquisitionTiming===value} disabled={!writable} onPress={()=>change(a=>({...a,acquisitionTiming:value}))}/>)}</View>
 <Text style={s.note}>La captación progresiva se distribuye entre los doce meses y factura media mensualidad a las altas de cada mes. Inicio/final son hipótesis explícitas alternativas; nunca se facturan automáticamente doce meses por cliente progresivo.</Text>
 </View>;
}
const REVENUE_KINDS={monthly:"Cuota mensual",annual:"Cuota anual (devengo proporcional)",commission:"Comisión (%)",operation:"Precio por operación",one_off:"Pago único por alta"} as const;
const COST_DRIVERS={company_month:"Por empresa y mes",hundred_company_month:"Por cada 100 empresas y mes (proporcional)",percent_revenue:"Porcentaje de ingreso propio",percent_margin:"Porcentaje de margen positivo (impuesto supuesto)",operation:"Por operación",fixed_month:"Importe fijo mensual",fixed_year:"Importe fijo anual"} as const;
export function FinancialPrices({cost=false,...props}:FinancialEditProps&{cost?:boolean}){
 const{doc,update,writable,activityId,countryCode,scenario,year}=props;const assumption=doc.assumptions.find(a=>a.activityId===activityId&&a.countryCode===countryCode&&a.scenario===scenario);
 const [kind,setKind]=useState<keyof typeof REVENUE_KINDS>("monthly"),[driver,setDriver]=useState<keyof typeof COST_DRIVERS>("fixed_month"),[category,setCategory]=useState<"operating"|"investment"|"tax">("operating"),[name,setName]=useState("");
 if(!assumption)return <Text style={s.text}>Elige una hipótesis de actividad, país y escenario.</Text>;
 const revenue=doc.revenues.filter(r=>r.assumptionId===assumption.id&&r.year===year),costs=doc.costs.filter(r=>r.assumptionId===assumption.id&&r.year===year);
 return <View style={s.card}><Text style={s.heading}>{cost?"Costes":"Ingresos"} · {year||"Base"}</Text><Text style={s.note}>{cost?"Cada concepto se contabiliza una vez en su país y actividad. Inversiones e impuestos quedan separados de los costes operativos. No se replican costes globales automáticamente. Hasta confirmar su definición, los importes son subtotales de conceptos introducidos.":"La base se aplica a los años activos. Una tarifa anual específica sustituye solo el modelo equivalente de la base. El importe de las operaciones se muestra separado del ingreso propio de GO."}</Text>
 {(cost?costs:revenue).map(row=><View key={row.id} style={s.card}><FinanceField label="Concepto" value={row.name} disabled={!writable} onChange={value=>update(d=>cost?{...d,costs:d.costs.map(r=>r.id===row.id?{...r,name:value}:r)}:{...d,revenues:d.revenues.map(r=>r.id===row.id?{...r,name:value}:r)})}/>
 <Text style={s.note}>{"driver" in row?row.category+" · "+COST_DRIVERS[row.driver]:REVENUE_KINDS[row.kind]}</Text><FinanceNumber label={"driver" in row&&row.driver.startsWith("percent_")||"kind" in row&&row.kind==="commission"?"Porcentaje":"Importe en moneda del país"} value={row.value} disabled={!writable} onChange={value=>update(d=>cost?{...d,costs:d.costs.map(r=>r.id===row.id?{...r,value}:r)}:{...d,revenues:d.revenues.map(r=>r.id===row.id?{...r,value}:r)})}/>
 <FinanceButton label="Quitar este concepto del borrador" disabled={!writable} onPress={()=>update(d=>cost?{...d,costs:d.costs.filter(r=>r.id!==row.id)}:{...d,revenues:d.revenues.filter(r=>r.id!==row.id)})}/></View>)}
 {cost?<><FinanceField label="Nuevo concepto de coste" value={name} disabled={!writable} onChange={setName} placeholder="Infraestructura, servidores, IA/API, soporte, personal, marketing, pagos, inversión u otro"/>
 <View style={s.row}>{([["operating","Operativo"],["investment","Inversión"],["tax","Impuesto supuesto"]] as const).map(([value,label])=><FinanceButton key={value} label={label} selected={category===value} disabled={!writable} onPress={()=>setCategory(value)}/>)}</View>
 <View style={s.row}>{Object.entries(COST_DRIVERS).filter(([key])=>key!=="percent_margin"||category==="tax").map(([key,label])=><FinanceButton key={key} label={label} selected={driver===key} disabled={!writable} onPress={()=>setDriver(key as keyof typeof COST_DRIVERS)}/>)}</View>
 <FinanceButton label="Añadir coste al borrador" disabled={!writable||!name.trim()||(driver==="percent_margin"&&category!=="tax")} onPress={()=>{update(d=>({...d,costs:[...d.costs,{id:financeId("cost"),assumptionId:assumption.id,year,name:name.trim(),category,driver,value:null}]}));setName("");}}/>
 <FinanceButton label={assumption.costsConfirmed?"☑ Costes definidos (incluido cero explícito)":"☐ Confirmar que los costes están definidos"} selected={assumption.costsConfirmed} disabled={!writable} onPress={()=>update(d=>({...d,assumptions:d.assumptions.map(a=>a.id===assumption.id?{...a,costsConfirmed:!a.costsConfirmed}:a)}))}/>
 </>:<><View style={s.row}>{Object.entries(REVENUE_KINDS).map(([key,label])=><FinanceButton key={key} label={label} selected={kind===key} disabled={!writable} onPress={()=>setKind(key as keyof typeof REVENUE_KINDS)}/>)}</View><FinanceButton label="Añadir modelo de ingreso" disabled={!writable||revenue.some(r=>r.kind===kind)} onPress={()=>update(d=>({...d,revenues:[...d.revenues,{id:financeId("revenue"),assumptionId:assumption.id,year,name:REVENUE_KINDS[kind],kind,value:null}]}))}/></>}
 {year!==0&&<Text style={s.note}>Los conceptos de la base siguen aplicándose salvo que exista su excepción anual. Las cuotas no se confunden con volumen de operaciones. Las tasas fiscales son hipótesis del usuario.</Text>}
 </View>;
}
