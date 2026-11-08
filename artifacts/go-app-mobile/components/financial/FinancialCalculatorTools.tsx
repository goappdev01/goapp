import React,{useState} from "react";
import {Alert,Text,View} from "react-native";
import type {FinancialDocument,FinancialScenario} from "@workspace/api-zod";
import {calculatorCatalog,type RevenueCalculatorRow} from "@/data/financialRevenueCalculator";
import {calculatorDirectResults,calculatorUnitCost,saveCalculatorActivity,saveCalculatorMarket,updateCalculatorDirectCost} from "@/data/financialCalculatorTools";
import {FinanceButton,FinanceChoice,FinanceField,FinanceNumber,FinanceTable,financialMoney,financialCount,financeStyles as s} from "./FinancialUI";

type Props={doc:FinancialDocument;writable:boolean;update:(fn:(d:FinancialDocument)=>FinancialDocument)=>void;scenario:FinancialScenario;rows:RevenueCalculatorRow[];onClearSelection:()=>void;onClearSimulation:(fields:("share"|"fee")[])=>void};
export function FinancialCalculatorTools({doc,writable,update,scenario,rows,onClearSelection,onClearSimulation}:Props){
 const catalog=calculatorCatalog(doc),[mode,setMode]=useState<""|"catalog"|"market"|"cost"|"manage">("");
 const [activity,setActivity]=useState(catalog.activities[0]?.id||""),[country,setCountry]=useState(catalog.countries.find(c=>c.code==="ES")?.code||catalog.countries[0]?.code||"");
 const [editing,setEditing]=useState<string|undefined>(),[name,setName]=useState(""),[unit,setUnit]=useState<"empresa"|"establecimiento"|"otra">("empresa"),[enabled,setEnabled]=useState(true);
 const [companies,setCompanies]=useState<number|null>(null),[year,setYear]=useState<number|null>(doc.startYear),[verification,setVerification]=useState<FinancialDocument["markets"][number]["verification"]>("NO_VERIFICADO");
 const [sourceId,setSourceId]=useState(doc.sources[0]?.id||""),[organization,setOrganization]=useState(""),[url,setUrl]=useState(""),[cost,setCost]=useState<number|null>(null),[error,setError]=useState("");
 const attempt=(fn:()=>void)=>{try{fn();setError("");}catch(e){setError(e instanceof Error?e.message:"Revisa los datos.");}};
 function loadMarket(a=activity,c=country){
  const current=doc.markets.filter(m=>m.activityId===a&&m.countryCode===c).sort((a,b)=>b.referenceYear-a.referenceYear)[0];
  setCompanies(current?.companies??null);setYear(current?.referenceYear??doc.startYear);setSourceId(current?.sourceId||doc.sources[0]?.id||"");setVerification(current?.verification??"NO_VERIFICADO");
 }
 const chooseActivity=(id:string)=>{setActivity(id);loadMarket(id,country);setCost(calculatorUnitCost(doc,id,country,scenario));setError("");};
 const current=catalog.activities.find(a=>a.id===activity);
 function editActivity(id:string){
  const item=catalog.activities.find(a=>a.id===id);if(!item)return;
  setEditing(id);setName(item.name);setUnit(item.unit);setEnabled(item.enabled);
 }
 function saveMarket(){
  if(!current||year===null||!Number.isInteger(year)){setError("Introduce una actividad y año válidos.");return;}
  const today=new Date().toISOString().slice(0,10),id=sourceId||("manual_"+Date.now().toString(36)+"_"+Math.random().toString(36).slice(2,8));
  const source=sourceId?undefined:{id,organization:organization.trim(),url:url.trim(),consultedOn:today,verification:"NO_VERIFICADO" as const,notes:"Referencia introducida manualmente por ADMIN"};
  const market={activityId:activity,countryCode:country,referenceYear:year,companies,unit:current.unit,sourceId:id,updatedOn:today,verification,notes:doc.markets.find(m=>m.activityId===activity&&m.countryCode===country&&m.referenceYear===year)?.notes||""};
  const apply=(confirmed=false)=>attempt(()=>update(d=>saveCalculatorMarket(d,market,confirmed,source)));
  const previous=doc.markets.find(m=>m.activityId===activity&&m.countryCode===country&&m.referenceYear===year);
  if(previous?.verification==="VERIFICADO")Alert.alert("Modificar dato verificado","El cambio quedará registrado en una nueva versión del documento. Valor anterior: "+financialCount(previous.companies)+". Nuevo: "+financialCount(companies)+".",[{text:"Cancelar",style:"cancel"},{text:"Confirmar cambio",onPress:()=>apply(true)}]);
  else apply();
 }
 const results=mode==="cost"?calculatorDirectResults(doc,rows,scenario):[];
 const complete=results.length>0&&results.every(r=>r.annualCost!==null&&r.annualGross!==null);
 const sum=(field:"annualCost"|"annualGross")=>complete?Math.round(results.reduce((s,r)=>s+r[field]!,0)*100)/100:null;
 return <>
 <View style={s.row}>
 <FinanceButton label="NUEVA ACTIVIDAD / PRODUCTO" disabled={!writable} onPress={()=>{setMode(mode==="catalog"?"":"catalog");setEditing(undefined);setName("");setUnit("empresa");setEnabled(true);setError("");}}/>
 <FinanceButton label="Más opciones" onPress={()=>{setMode(mode==="manage"?"":"manage");setError("");}}/>
 </View>
 {mode!==""&&<View style={s.card}>
 {mode==="manage"?<><FinanceButton label="Datos base" onPress={()=>{loadMarket();setMode("market");}}/>
 <FinanceButton label="Costes y beneficio" onPress={()=>{setCost(calculatorUnitCost(doc,activity,country,scenario));setMode("cost");}}/>
 <FinanceButton label="Limpiar selección" onPress={onClearSelection}/>
 <FinanceButton label="Limpiar captación" disabled={!writable} onPress={()=>onClearSimulation(["share"])}/>
 <FinanceButton label="Limpiar cuotas" disabled={!writable} onPress={()=>onClearSimulation(["fee"])}/>
 <FinanceButton label="Limpiar simulación" disabled={!writable} onPress={()=>onClearSimulation(["share","fee"])}/></>:
 mode==="catalog"?<>
 <Text style={s.heading}>Catálogo de actividades</Text>
 <FinanceChoice label="Editar actividad existente" value={editing||""} options={[{value:"",label:"Nueva actividad"},...catalog.activities.map(a=>({value:a.id,label:a.name+(a.enabled?"":" · Inactiva")}))]} onChange={id=>{if(id)editActivity(id);else{setEditing(undefined);setName("");}}}/>
 <FinanceField label="Nombre de actividad" value={name} onChange={setName} disabled={!writable}/>
 <FinanceChoice label="Unidad de mercado" value={unit} options={["empresa","establecimiento","otra"].map(value=>({value,label:value}))} onChange={v=>setUnit(v as typeof unit)} disabled={!writable}/>
 <FinanceButton label={enabled?"Actividad activa":"Actividad inactiva · conservar histórico"} selected={enabled} disabled={!writable} onPress={()=>setEnabled(v=>!v)}/>
 <FinanceButton label={editing?"Aplicar cambios de actividad":"Añadir actividad"} disabled={!writable||!name.trim()} onPress={()=>attempt(()=>{update(d=>saveCalculatorActivity(d,{id:editing,name,unit,enabled}));setName("");setEditing(undefined);})}/>
 <Text style={s.note}>La actividad mensual GO conserva sus datos y escenarios. Desactivar no borra mercados ni histórico. Los tipos PRODUCTO y SERVICIO y su precio de catálogo requieren ampliar el contrato del servidor; todavía no se guardan desde esta versión.</Text>
 </>:<>
 <FinanceChoice label="Actividad de datos base" value={activity} options={catalog.activities.map(a=>({value:a.id,label:a.name+(a.enabled?"":" · Inactiva")}))} onChange={chooseActivity}/>
 <FinanceChoice label="País de datos base" value={country} options={catalog.countries.map(c=>({value:c.code,label:c.name}))} onChange={id=>{setCountry(id);loadMarket(activity,id);setCost(calculatorUnitCost(doc,activity,id,scenario));}}/>
 {mode==="market"?<>
 <Text style={s.note}>Datos permanentes, independientes de los filtros y escenarios. Unidad: {current?.unit}. Los cambios se guardan en el mismo documento versionado.</Text>
 <FinanceNumber label="Cantidad base" value={companies} onChange={setCompanies} disabled={!writable}/>
 <FinanceNumber label="Año de referencia" value={year} onChange={setYear} disabled={!writable}/>
 <FinanceChoice label="Fuente" value={sourceId} options={[{value:"",label:"Nueva referencia manual"},...doc.sources.map(s=>({value:s.id,label:s.organization}))]} onChange={setSourceId} disabled={!writable}/>
 {!sourceId&&<><FinanceField label="Organización o referencia" value={organization} onChange={setOrganization} disabled={!writable}/><FinanceField label="URL de la fuente" value={url} onChange={setUrl} disabled={!writable}/></>}
 <FinanceChoice label="Estado del dato base" value={verification} options={["NO_VERIFICADO","ESTIMACION","CONFLICTO","VERIFICADO"].map(value=>({value,label:value}))} onChange={v=>setVerification(v as typeof verification)} disabled={!writable}/>
 <FinanceButton label="Aplicar dato base" disabled={!writable} onPress={saveMarket}/>
 </>:<>
 <Text style={s.note}>Hipótesis de coste directo por cliente y mes, en EUR · {scenario}. No incluye impuestos ni gastos generales. No es beneficio neto.</Text>
 <FinanceNumber label="Coste directo unitario EUR" value={cost} onChange={setCost} disabled={!writable}/>
 <FinanceButton label="Aplicar coste directo" disabled={!writable} onPress={()=>attempt(()=>update(d=>updateCalculatorDirectCost(d,activity,country,scenario,cost)))}/>
 <FinanceTable headers={["País · actividad","Coste/mes","Coste/año","Beneficio bruto/mes","Beneficio bruto/año","Margen %"]} rows={results.map(r=>[r.name,r.unitCost===null?"Coste sin dato":financialMoney(r.monthlyCost,"EUR"),financialMoney(r.annualCost,"EUR"),r.annualGross===null?"Beneficio no calculable":financialMoney(r.monthlyGross,"EUR"),financialMoney(r.annualGross,"EUR"),financialCount(r.margin)])}/>
 <Text style={s.text}>Total del subconjunto · Coste/año: {complete?financialMoney(sum("annualCost"),"EUR"):"Coste sin dato"} · Beneficio bruto/año: {complete?financialMoney(sum("annualGross"),"EUR"):"Beneficio no calculable"}</Text>
 </>}
 </>}
 {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
 <FinanceButton label="Cerrar controles" onPress={()=>setMode("")}/>
 </View>}
 </>;
}
