import React, { useMemo, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { saveCalculatorActivity } from "@/data/financialCalculatorTools";
import { updateFinancialDemoMarket } from "@/data/financialDemo";
import type { FinancialDemoState } from "@/data/financialDemoStore";
import { calculatorCatalog, revenueCalculatorRows, revenueCalculatorTotals, updateRevenueCalculator } from "@/data/financialRevenueCalculator";
import { FinanceChoice, FinanceMultiChoice, FinanceNumber, FinanceTable, financialCount, financialMoney, financeStyles as s } from "./FinancialUI";
import { GO_NAVIGATION_OVERLAY_CLEARANCE } from "@/components/ui/GoNavigationRail";

type Props = { state: FinancialDemoState; update: (fn: (current: FinancialDemoState) => FinancialDemoState) => void; onCalculate?: () => void };
const money = (value: number | null) => financialMoney(value, "EUR", 0);
const originLabel=(origin:string|undefined,estimated=false)=>origin==="official"?estimated?"Dato oficial · estimación Eurostat (e)":"Dato oficial verificado":origin==="manual"?"Estimación introducida":origin==="example"?"Ejemplo simulado":"Sin dato";

/** The selected country × activity pairs share the existing financial engine and local document. */
export function FinancialSimpleDemoTable({ state, update, onCalculate }: Props) {
  const viewport = useWindowDimensions();
  const [creating,setCreating]=useState(false);
  const [activityName,setActivityName]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const [revision,setRevision]=useState(0);
  const [invalidFields,setInvalidFields]=useState<string[]>([]);
  const catalog=useMemo(()=>calculatorCatalog(state.doc,true),[state.doc]);
  const selectedCountries=(state.selectedCountryCodes??[state.countryCode]).filter(code=>catalog.countries.some(item=>item.code===code));
  const selectedActivities=(state.selectedActivityIds??[state.activityId]).filter(id=>catalog.activities.some(item=>item.id===id&&item.enabled));
  const allRows=useMemo(()=>revenueCalculatorRows(state.doc,"REAL",true),[state.doc,revision]);
  const rows=allRows.filter(item=>selectedCountries.includes(item.countryCode)&&selectedActivities.includes(item.activityId)).map(item=>invalidFields.some(key=>key.startsWith(item.countryCode+"|"+item.activityId+"|"))?{...item,companies:null,monthly:null,annual:null}:item);
  const row=rows.find(item=>item.countryCode===state.countryCode&&item.activityId===state.activityId);
  const pairKey=state.countryCode+"|"+state.activityId;
  const known=rows.filter(item=>item.market!==null&&item.share!==null&&item.fee!==null&&item.annual!==null);
  const total=revenueCalculatorTotals(known);
  const countryTotals=selectedCountries.map(code=>{const country=catalog.countries.find(item=>item.code===code)!;const included=known.filter(item=>item.countryCode===code);const subtotal=revenueCalculatorTotals(included);return[country.name,financialCount(included.length?subtotal.companies:null),money(included.length?subtotal.monthly:null),money(included.length?subtotal.annual:null)];});
  const activityTotals=selectedActivities.map(id=>{const activity=catalog.activities.find(item=>item.id===id)!;const included=known.filter(item=>item.activityId===id);const subtotal=revenueCalculatorTotals(included);return[activity.name,financialCount(included.length?subtotal.companies:null),money(included.length?subtotal.monthly:null),money(included.length?subtotal.annual:null)];});
  const selectCountries=(codes:string[])=>{update(current=>({...current,selectedCountryCodes:codes,countryCode:codes.includes(current.countryCode)?current.countryCode:codes[0]??current.countryCode}));setNotice("");setError("");};
  const selectActivities=(ids:string[])=>{update(current=>({...current,selectedActivityIds:ids,activityId:ids.includes(current.activityId)?current.activityId:ids[0]??current.activityId}));setNotice("");setError("");};
  const markField=(field:string,invalid:boolean)=>setInvalidFields(previous=>invalid?[...new Set([...previous,pairKey+"|"+field])]:previous.filter(key=>key!==pairKey+"|"+field));
  const editMarket=(value:number|null)=>{
    if(value===null){markField("market",true);setError("Introduce las empresas existentes para esta combinación.");return;}
    if(!Number.isSafeInteger(value)||value<0||value>1e12){markField("market",true);setError("Introduce una cantidad entera válida de empresas. Ejemplo: 60.683.");return;}
    markField("market",false);update(current=>({...current,doc:updateFinancialDemoMarket(current.doc,state.activityId,state.countryCode,value)}));setError("");setNotice("");
  };
  const editAssumption=(field:"share"|"fee",value:number|null)=>{
    if(value!==null&&(!Number.isFinite(value)||value<0||value>(field==="share"?100:1e12))){markField(field,true);setError(field==="share"?"La captación debe estar entre 0 y 100 %.":"Introduce una cuota mensual válida.");return;}
    markField(field,false);update(current=>({...current,doc:updateRevenueCalculator(current.doc,state.activityId,state.countryCode,"REAL",field,value)}));setError("");setNotice("");
  };
  const createActivity=()=>{try{
    const doc=saveCalculatorActivity(state.doc,{name:activityName,unit:"empresa",enabled:true});
    const added=doc.activities.find(item=>!state.doc.activities.some(previous=>previous.id===item.id));
    if(!added)throw Error("No se pudo seleccionar la actividad creada.");
    update(current=>({...current,doc,activityId:added.id,selectedActivityIds:[added.id]}));
    setActivityName("");setCreating(false);setError("");setNotice("");
  }catch(cause){setError(cause instanceof Error?cause.message:"No se pudo guardar la actividad.");}};
  const clear=()=>{
    if(!selectedCountries.length||!selectedActivities.length){setError("Selecciona un país y una actividad para limpiar.");return;}
    update(current=>{const share=updateRevenueCalculator(current.doc,current.activityId,current.countryCode,"REAL","share",0);return{...current,doc:updateRevenueCalculator(share,current.activityId,current.countryCode,"REAL","fee",0)};});
    setInvalidFields(previous=>previous.filter(key=>key!==pairKey+"|share"&&key!==pairKey+"|fee"));setError("");setNotice("Simulación de esta combinación limpiada; empresas base conservadas.");Keyboard.dismiss();setRevision(value=>value+1);
  };
  const calculate=()=>{
    Keyboard.dismiss();setRevision(value=>value+1);
    if(!rows.length){setError("Selecciona al menos un país y una actividad.");setNotice("");return;}
    const incomplete=rows.filter(item=>item.market===null||item.share===null||item.fee===null||item.annual===null);
    if(incomplete.length){setError(`Faltan datos para ${incomplete.length} de ${rows.length} combinaciones. Revisa empresas, captación y cuota.`);setNotice("");return;}
    setError("");setNotice("Cálculo actualizado.");onCalculate?.();
  };
  return <View style={d.root}>
    <ScrollView testID="finance-results-scroll" style={d.resultsScroll} contentContainerStyle={d.resultsContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={d.disclaimer}>Simulación guardada en este dispositivo · ingresos hipotéticos</Text>
      {!rows.length?<View style={d.results}><Text style={s.heading}>Sin selección</Text><Text style={s.note}>Marca países y actividades para calcular.</Text></View>:<>
        <View style={d.results}><Text style={d.sectionTitle}>{known.length===rows.length?"Total general GO":"Total calculado · datos conocidos"}</Text>
          <View style={d.metricRow}><Text style={d.metricLabel}>Empresas captadas</Text><Text style={d.resultValue}>{financialCount(known.length?total.companies:null)}</Text></View>
          <View style={d.metricRow}><Text style={d.metricLabel}>Ingreso mensual</Text><Text style={d.resultValue}>{money(known.length?total.monthly:null)}</Text></View>
          <View style={d.metricRow}><Text style={d.metricLabel}>Ingreso anual</Text><Text style={d.resultValue}>{money(known.length?total.annual:null)}</Text></View>
          {known.length<rows.length&&<Text style={s.note}>{rows.length-known.length} combinaciones sin dato completo; no se suman.</Text>}
        </View>
        <View style={d.results}><Text style={d.sectionTitle} numberOfLines={2}>Combinación en edición · {row?.country} · {row?.activity}</Text>
          <View style={d.metricRow}><Text style={d.metricLabel}>Empresas captadas</Text><Text style={d.resultValue}>{financialCount(row?.companies??null)}</Text></View>
          <View style={d.metricRow}><Text style={d.metricLabel}>Ingreso mensual</Text><Text style={d.resultValue}>{money(row?.monthly??null)}</Text></View>
          <View style={d.metricRow}><Text style={d.metricLabel}>Ingreso anual</Text><Text style={d.resultValue}>{money(row?.annual??null)}</Text></View>
        </View>
        <Text style={d.breakdownTitle}>Desglose por país</Text><FinanceTable responsive headers={["País","Captadas","Mensual","Anual"]} rows={countryTotals}/>
        <Text style={d.breakdownTitle}>Desglose por actividad</Text><FinanceTable responsive headers={["Actividad","Captadas","Mensual","Anual"]} rows={activityTotals}/>
        <Text style={d.breakdownTitle}>Combinaciones seleccionadas</Text><FinanceTable responsive headers={["País","Actividad","Captadas","Mensual","Anual"]} rows={rows.map(item=>[item.country,item.activity+" · "+originLabel(item.marketOrigin,item.reference?.estimated),financialCount(item.companies),money(item.monthly),money(item.annual)])}/>
      </>}

      <View style={[d.selection,viewport.width<350&&d.stacked]}>
        <View style={{flex:1,minWidth:0,alignSelf:"stretch",justifyContent:"flex-end"}}><FinanceMultiChoice mobileSheet label="Países incluidos" values={selectedCountries} options={catalog.countries.map(item=>({value:item.code,label:item.name}))} onChange={selectCountries}/></View>
        <View style={{flex:1,minWidth:0,alignSelf:"stretch",justifyContent:"flex-end"}}><FinanceMultiChoice mobileSheet label="Actividades incluidas" values={selectedActivities} options={catalog.activities.filter(item=>item.enabled).map(item=>({value:item.id,label:item.name}))} onChange={selectActivities}/></View>
      </View>
      {!!rows.length&&<View style={[d.selection,viewport.width<350&&d.stacked]}>
        <FinanceChoice mobileSheet label="Editar país" value={state.countryCode} options={catalog.countries.filter(item=>selectedCountries.includes(item.code)).map(item=>({value:item.code,label:item.name}))} onChange={countryCode=>update(current=>({...current,countryCode}))}/>
        <FinanceChoice mobileSheet label="Editar actividad" value={state.activityId} options={catalog.activities.filter(item=>selectedActivities.includes(item.id)).map(item=>({value:item.id,label:item.name}))} onChange={activityId=>update(current=>({...current,activityId}))}/>
      </View>}
      {!creating?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Nueva actividad" onPress={()=>setCreating(true)} style={d.activityLink}><Text style={d.activityLinkText}>＋ Nueva actividad</Text></TouchableOpacity>
      :<View style={d.activityEditor}><TextInput accessibilityLabel="Nombre de la nueva actividad" value={activityName} onChangeText={setActivityName} placeholder="Nombre de la actividad" maxLength={160} style={s.input} returnKeyType="done" onSubmitEditing={createActivity}/>
        <View style={d.actions}><TouchableOpacity accessibilityRole="button" accessibilityLabel="GUARDAR ACTIVIDAD" onPress={createActivity} style={[d.action,d.calculate,{flex:2}]}><Text style={d.actionText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={.8}>GUARDAR ACTIVIDAD</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="Cancelar nueva actividad" onPress={()=>{setCreating(false);setActivityName("");setError("");}} style={[d.action,d.cancel]}><Text style={d.cancelText}>Cancelar</Text></TouchableOpacity></View>
      </View>}
      {!!rows.length&&<View style={d.inputs}>
        <Text style={s.note}>{originLabel(row?.marketOrigin,row?.reference?.estimated)}</Text>
        {row?.reference&&<Text selectable style={s.note}>Referencia: {financialCount(row.reference.companies)} empresas · {row.reference.source.organization} · {row.reference.source.year} · {row.reference.source.scope}{row.reference.estimated?" · estimación (e)":""}</Text>}
        <FinanceNumber key={pairKey+"|market"} integer label="Empresas existentes" value={row?.market??null} onChange={editMarket} placeholder="Sin dato"/>
        <View style={[d.selection,viewport.width<350&&d.stacked]}><FinanceNumber key={pairKey+"|share"} label="Captación (%)" value={row?.share??null} onChange={value=>editAssumption("share",value)}/><FinanceNumber key={pairKey+"|fee"} label="Cuota mensual (€)" value={row?.fee??null} disabled={!row?.feeEditable} onChange={value=>editAssumption("fee",value)}/></View>
      </View>}
      {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      {!!notice&&<Text accessibilityLiveRegion="polite" style={s.note}>{notice}</Text>}
    </ScrollView>
      <View testID="finance-sticky-actions" style={[d.actions,d.actionBar]}><TouchableOpacity accessibilityRole="button" accessibilityLabel="LIMPIAR" onPress={clear} style={[d.action,d.clear]}><Text style={d.actionText} numberOfLines={1} adjustsFontSizeToFit>LIMPIAR</Text></TouchableOpacity><TouchableOpacity accessibilityRole="button" accessibilityLabel="CALCULAR" onPress={calculate} style={[d.action,d.calculate]}><Text style={d.actionText} numberOfLines={1} adjustsFontSizeToFit>CALCULAR</Text></TouchableOpacity></View>
  </View>;
}

const d=StyleSheet.create({
  root:{flex:1,minHeight:0,alignSelf:"stretch",backgroundColor:"#F7F8FA"},resultsScroll:{flex:1,minHeight:0},resultsContent:{paddingHorizontal:10,paddingTop:6,gap:6,paddingBottom:GO_NAVIGATION_OVERLAY_CLEARANCE},disclaimer:{fontSize:10,color:"#677384"},
  results:{backgroundColor:"#FFFFFF",borderColor:"#E2E6EB",borderWidth:1,borderRadius:10,paddingHorizontal:10,paddingVertical:7,gap:3},sectionTitle:{fontSize:13,fontWeight:"700",color:"#171B22"},breakdownTitle:{fontSize:13,fontWeight:"700",color:"#171B22",marginTop:3},metricRow:{minHeight:24,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:6},metricLabel:{fontSize:12,color:"#344052",flexShrink:1},resultValue:{color:"#20784B",fontSize:15,fontWeight:"800",fontVariant:["tabular-nums"],textAlign:"right",flexShrink:1},
  selection:{flexDirection:"row",gap:8,alignItems:"flex-end"},stacked:{flexDirection:"column",alignItems:"stretch"},inputs:{gap:6},activityLink:{minHeight:44,justifyContent:"center",alignSelf:"flex-start"},activityLinkText:{color:"#205C9C",fontSize:13,fontWeight:"700"},activityEditor:{gap:6},
  actionBar:{padding:8,backgroundColor:"#FFFFFF",borderTopWidth:1,borderColor:"#DCE1E8"},actions:{flexDirection:"row",gap:10},action:{flex:1,minHeight:48,borderRadius:10,alignItems:"center",justifyContent:"center",paddingHorizontal:6},calculate:{backgroundColor:"#20784B"},clear:{backgroundColor:"#B53338"},cancel:{backgroundColor:"#F6F7F9",borderWidth:1,borderColor:"#CBD1DA"},actionText:{color:"#FFFFFF",fontWeight:"800",fontSize:15,textAlign:"center"},cancelText:{color:"#344052",fontWeight:"700"},
});
