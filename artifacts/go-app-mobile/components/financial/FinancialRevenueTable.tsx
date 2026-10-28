import React,{useMemo,useState} from "react";
import {ScrollView,StyleSheet,Text,View} from "react-native";
import type {FinancialDocument,FinancialScenario} from "@workspace/api-zod";
import {calculatorCatalog,revenueCalculatorRows,revenueCalculatorTotals,updateRevenueCalculator} from "@/data/financialRevenueCalculator";
import {FinanceChoice,FinanceNumber,FinanceTable,financialCount,financialMoney,financeStyles as s} from "./FinancialUI";

type Props={doc:FinancialDocument;writable:boolean;update:(fn:(doc:FinancialDocument)=>FinancialDocument)=>void};
const WIDTHS=[75,110,100,140,170,160,165,165];
const HEADERS=["País","Actividad","Empresas existentes","Captación prevista (%)","Cuota mensual por empresa (€)","Empresas captadas","Ingreso mensual (€)","Ingreso anual (€)"];
export function FinancialRevenueTable({doc,writable,update}:Props){
 const scenario="REAL" as const;
 const [country,setCountry]=useState(()=>{const countries=calculatorCatalog(doc).countries;return countries.find(c=>c.code==="ES")?.code||countries[0]?.code||"";}),[activity,setActivity]=useState("");
 const catalog=useMemo(()=>calculatorCatalog(doc),[doc]),allRows=useMemo(()=>revenueCalculatorRows(doc,scenario),[doc,scenario]);
 const rows=useMemo(()=>allRows.filter(r=>(!country||r.countryCode===country)&&(!activity||r.activityId===activity)),[allRows,country,activity]);
 const total=useMemo(()=>revenueCalculatorTotals(allRows),[allRows]);
 const countries=catalog.countries.filter(c=>!country||c.code===country).map(c=>({name:c.name,total:revenueCalculatorTotals(rows.filter(r=>r.countryCode===c.code))}));
 const activities=catalog.activities.filter(a=>!activity||a.id===activity).map(a=>({name:a.name,total:revenueCalculatorTotals(rows.filter(r=>r.activityId===a.id))}));
 return <>
 <View style={s.row}><FinanceChoice label="País" value={country} options={[{value:"",label:"Todos los países"},...catalog.countries.map(c=>({value:c.code,label:c.name}))]} onChange={setCountry}/><FinanceChoice label="Actividad" value={activity} options={[{value:"",label:"Todas las actividades"},...catalog.activities.map(a=>({value:a.id,label:a.name}))]} onChange={setActivity}/></View>
 <ScrollView horizontal nestedScrollEnabled keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator contentContainerStyle={t.table} accessibilityLabel="Tabla de proyección de ingresos GO">
 <View><View style={t.header}>{HEADERS.map((label,i)=><Text key={label} style={[t.cell,t.columnHeading,{width:WIDTHS[i]}]}>{label}</Text>)}</View>
 {rows.map(row=><View key={row.id} style={t.row}><Text style={[t.cell,t.name,{width:WIDTHS[0]}]}>{row.country}</Text><Text style={[t.cell,t.name,{width:WIDTHS[1]}]}>{row.activity}</Text><View style={[t.cell,{width:WIDTHS[2]}]}><Text style={[s.text,{fontSize:16,fontWeight:"600"}]}>{row.market===null?"Sin dato":financialCount(row.market)}</Text>{!row.marketUsable&&row.market!==null&&<Text style={s.note}>En revisión</Text>}{row.unit!=="empresa"&&<Text style={s.note}>{row.unit==="establecimiento"?"Establecimientos":"Otra unidad"}</Text>}</View>
 <View style={[t.cell,{width:WIDTHS[3]}]}><FinanceNumber compact label={"Captación · "+row.country+" · "+row.activity} value={row.share} disabled={!writable} onChange={value=>update(d=>updateRevenueCalculator(d,row.activityId,row.countryCode,scenario,"share",value))}/></View>
 <View style={[t.cell,{width:WIDTHS[4]}]}><FinanceNumber compact label={"Cuota mensual EUR · "+row.country+" · "+row.activity} value={row.fee} disabled={!writable||!row.feeEditable} onChange={value=>update(d=>updateRevenueCalculator(d,row.activityId,row.countryCode,scenario,"fee",value))}/>{!row.feeEditable&&<Text style={s.note}>Falta conversión a EUR</Text>}</View>
 <Text style={[t.cell,t.result,{width:WIDTHS[5]}]}>{financialCount(row.companies)}</Text><Text style={[t.cell,t.result,{width:WIDTHS[6]}]}>{financialMoney(row.monthly,"EUR")}</Text><Text style={[t.cell,t.result,{width:WIDTHS[7]}]}>{financialMoney(row.annual,"EUR")}</Text></View>)}
 </View></ScrollView>
 <View style={t.totals}><Text style={s.heading}>Total general GO</Text>
 <View style={s.planBar}><Text style={s.text}>Empresas captadas</Text><Text style={s.calculated}>{financialCount(total.companies)}{total.companiesIncomplete?" · parcial":""}</Text></View>
 <View style={s.planBar}><Text style={s.text}>Ingreso mensual</Text><Text style={t.totalValue}>{financialMoney(total.monthly,"EUR")}</Text></View>
 <View style={s.planBar}><Text style={s.text}>Ingreso anual</Text><Text style={t.totalValue}>{financialMoney(total.annual,"EUR")}</Text></View>
 {total.incomplete&&<Text style={s.note}>Total incompleto · {total.known} de {total.rows} filas con ingresos calculables.</Text>}
 </View>
 <Text style={s.heading}>Totales por país</Text><FinanceTable headers={["País","Empresas captadas","Ingreso mensual","Ingreso anual"]} rows={countries.map(({name,total})=>[name+(total.incomplete?" · parcial":""),financialCount(total.companies),financialMoney(total.monthly,"EUR"),financialMoney(total.annual,"EUR")])}/>
 <Text style={s.heading}>Totales por actividad</Text><FinanceTable headers={["Actividad","Empresas captadas","Ingreso mensual","Ingreso anual"]} rows={activities.map(({name,total})=>[name+(total.incomplete?" · parcial":""),financialCount(total.companies),financialMoney(total.monthly,"EUR"),financialMoney(total.annual,"EUR")])}/>
 </>;
}
const t=StyleSheet.create({table:{borderWidth:1,borderColor:"#E2E6EB",borderRadius:12},header:{flexDirection:"row",backgroundColor:"#EEF1F5"},row:{flexDirection:"row",alignItems:"stretch",borderTopWidth:1,borderColor:"#E6E9EF",backgroundColor:"#FFFFFF"},cell:{padding:10,justifyContent:"center"},columnHeading:{color:"#505A69",fontSize:12,fontWeight:"600"},name:{fontSize:13,color:"#232A35",textAlignVertical:"center"},result:{fontSize:17,fontWeight:"600",color:"#34445D",backgroundColor:"#F6F8FB",textAlignVertical:"center",fontVariant:["tabular-nums"]},totals:{paddingVertical:16,gap:12,borderTopWidth:1,borderColor:"#DCE1E8"},totalValue:{fontSize:17,fontWeight:"700",color:"#171B22",fontVariant:["tabular-nums"]}});
