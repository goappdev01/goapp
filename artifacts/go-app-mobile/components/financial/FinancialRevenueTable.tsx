import React,{useMemo,useState} from "react";
import {Keyboard,ScrollView,StyleSheet,Text,TouchableOpacity,View} from "react-native";
import type {FinancialDocument,FinancialScenario} from "@workspace/api-zod";
import {calculatorCatalog,revenueCalculatorRows,revenueCalculatorTotals,updateRevenueCalculator} from "@/data/financialRevenueCalculator";
import {FinanceChoice,FinanceNumber,FinanceTable,financialCount,financialMoney,financeStyles as s} from "./FinancialUI";

type Props={doc:FinancialDocument;writable:boolean;onCalculate?:()=>void;update:(fn:(doc:FinancialDocument)=>FinancialDocument)=>void};
export const revenueTableWidths=(width:number)=>width>=600?[140,190,160,140,140,155,145,145]:width>0&&width<340?[75,130,105,130,130,145,145,145]:[85,140,115,130,130,145,145,145];
const HEADERS=["País","Actividad","Empresas existentes","Captación (%)","Cuota/mes (€)","Empresas captadas","Ingresos/mes (€)","Ingresos/año (€)"];
const incomeMoney=(value:number|null)=>financialMoney(value,"EUR",0);
export function FinancialRevenueTable({doc,writable,update,onCalculate}:Props){
 const scenario="REAL" as const;
 const [width,setWidth]=useState(0),[calculationRevision,setCalculationRevision]=useState(0);const WIDTHS=revenueTableWidths(width);
 const [country,setCountry]=useState(()=>{const countries=calculatorCatalog(doc).countries;return countries.find(c=>c.code==="ES")?.code||countries[0]?.code||"";}),[activity,setActivity]=useState("");
 const catalog=useMemo(()=>calculatorCatalog(doc),[doc]),allRows=useMemo(()=>revenueCalculatorRows(doc,scenario),[doc,scenario,calculationRevision]);
 const rows=useMemo(()=>allRows.filter(r=>(!country||r.countryCode===country)&&(!activity||r.activityId===activity)),[allRows,country,activity]);
 const total=useMemo(()=>revenueCalculatorTotals(allRows),[allRows]);
 const countries=catalog.countries.filter(c=>!country||c.code===country).map(c=>({name:c.name,total:revenueCalculatorTotals(rows.filter(r=>r.countryCode===c.code))}));
 const activities=catalog.activities.filter(a=>!activity||a.id===activity).map(a=>({name:a.name,total:revenueCalculatorTotals(rows.filter(r=>r.activityId===a.id))}));
 return <View style={{gap:10,alignSelf:"stretch"}} onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
 <View style={s.row}><FinanceChoice label="País" value={country} options={[{value:"",label:"Todos los países"},...catalog.countries.map(c=>({value:c.code,label:c.name}))]} onChange={setCountry}/><FinanceChoice label="Actividad" value={activity} options={[{value:"",label:"Todas las actividades"},...catalog.activities.map(a=>({value:a.id,label:a.name}))]} onChange={setActivity}/><TouchableOpacity accessibilityRole="button" accessibilityLabel="CALCULAR" onPress={()=>{Keyboard.dismiss();setCalculationRevision(v=>v+1);onCalculate?.();}} style={t.calculate}><Text style={t.calculateText}>CALCULAR</Text></TouchableOpacity></View>
 <ScrollView horizontal nestedScrollEnabled keyboardShouldPersistTaps="handled" showsHorizontalScrollIndicator contentContainerStyle={t.table} accessibilityLabel="Tabla de proyección de ingresos GO">
 <View><View style={t.header}>{HEADERS.map((label,i)=><Text key={label} style={[t.cell,t.columnHeading,{width:WIDTHS[i]}]}>{label}</Text>)}</View>
 {rows.map(row=><View key={row.id} style={t.row}><Text style={[t.cell,t.name,{width:WIDTHS[0]}]}>{row.country}</Text><Text style={[t.cell,t.name,{width:WIDTHS[1]}]}>{row.activity}</Text><View style={[t.cell,{width:WIDTHS[2]}]}><Text style={[s.text,{fontSize:16,fontWeight:"600"}]}>{row.market===null?"Sin dato":financialCount(row.market)}</Text>{row.marketInReview&&row.market!==null&&<Text style={s.note}>En revisión</Text>}{row.unit!=="empresa"&&<Text style={s.note}>{row.unit==="establecimiento"?"Establecimientos":"Otra unidad"}</Text>}</View>
 <View style={[t.cell,{width:WIDTHS[3]}]}><FinanceNumber compact label={"Captación · "+row.country+" · "+row.activity} value={row.share} disabled={!writable} onChange={value=>update(d=>updateRevenueCalculator(d,row.activityId,row.countryCode,scenario,"share",value))}/></View>
 <View style={[t.cell,{width:WIDTHS[4]}]}><FinanceNumber compact label={"Cuota mensual EUR · "+row.country+" · "+row.activity} value={row.fee} disabled={!writable||!row.feeEditable} onChange={value=>update(d=>updateRevenueCalculator(d,row.activityId,row.countryCode,scenario,"fee",value))}/>{!row.feeEditable&&<Text style={s.note}>Falta conversión a EUR</Text>}</View>
 <Text style={[t.cell,t.result,{width:WIDTHS[5]}]}>{financialCount(row.companies)}</Text><Text style={[t.cell,t.result,{width:WIDTHS[6]}]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{incomeMoney(row.monthly)}</Text><Text style={[t.cell,t.result,{width:WIDTHS[7]}]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{incomeMoney(row.annual)}</Text></View>)}
 </View></ScrollView>
 <View style={t.totals}><Text style={[s.heading,t.totalHeading]}>{total.incomplete?"Total calculado":"Total general GO"}</Text>
 <View style={s.planBar}><Text style={s.text}>Empresas captadas</Text><Text style={t.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{financialCount(total.companies)}</Text></View>
 <View style={s.planBar}><Text style={s.text}>Ingreso mensual</Text><Text style={t.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{incomeMoney(total.monthly)}</Text></View>
 <View style={s.planBar}><Text style={s.text}>Ingreso anual</Text><Text style={t.totalValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{incomeMoney(total.annual)}</Text></View>
 </View>
 <Text style={[s.heading,t.totalHeading]}>Totales por país</Text><FinanceTable valueStyle={t.totalValue} headers={["País","Empresas captadas","Ingreso mensual","Ingreso anual"]} rows={countries.map(({name,total})=>[name,financialCount(total.companies),incomeMoney(total.monthly),incomeMoney(total.annual)])}/>
 <Text style={[s.heading,t.totalHeading]}>Totales por actividad</Text><FinanceTable valueStyle={t.totalValue} headers={["Actividad","Empresas captadas","Ingreso mensual","Ingreso anual"]} rows={activities.map(({name,total})=>[name,financialCount(total.companies),incomeMoney(total.monthly),incomeMoney(total.annual)])}/>
 </View>;
}
const t=StyleSheet.create({calculate:{minHeight:44,minWidth:112,flexGrow:1,backgroundColor:"#20784B",borderRadius:9,paddingHorizontal:16,paddingVertical:10,alignItems:"center",justifyContent:"center"},calculateText:{color:"#FFFFFF",fontSize:15,fontWeight:"800"},table:{borderWidth:1,borderColor:"#E2E6EB",borderRadius:12},header:{flexDirection:"row",backgroundColor:"#EEF1F5"},row:{flexDirection:"row",alignItems:"stretch",borderTopWidth:1,borderColor:"#E6E9EF",backgroundColor:"#FFFFFF"},cell:{paddingHorizontal:8,paddingVertical:8,justifyContent:"center"},columnHeading:{color:"#505A69",fontSize:12,lineHeight:16,fontWeight:"600"},name:{fontSize:13,lineHeight:18,color:"#232A35",textAlignVertical:"center"},result:{fontSize:18,fontWeight:"600",color:"#20784B",backgroundColor:"#F6F8FB",textAlignVertical:"center",fontVariant:["tabular-nums"]},totals:{paddingVertical:16,gap:12,borderTopWidth:1,borderColor:"#DCE1E8"},totalHeading:{color:"#20784B"},totalValue:{fontSize:17,fontWeight:"700",color:"#20784B",fontVariant:["tabular-nums"]}});
