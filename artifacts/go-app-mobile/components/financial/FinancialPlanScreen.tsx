import React,{useEffect,useMemo,useState} from "react";
import {ActivityIndicator,ScrollView,Text,View} from "react-native";
import {useNavigation} from "expo-router";
import {KeyboardAvoidingView} from "react-native-keyboard-controller";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {onSessionChanged} from "@/lib/sessionEvents";
import {openRevenueCalculator,type CalculatorSession} from "@/data/financialCalculatorSession";
import {FinancialRevenueTable} from "./FinancialRevenueTable";
import {FinanceButton,financeStyles as s} from "./FinancialUI";

export function FinancialPlanScreen(){
 const navigation=useNavigation();
 useEffect(()=>{navigation.setOptions({orientation:"all"});return()=>navigation.setOptions({orientation:"portrait"});},[navigation]);
 const admin=useAdminAccess(),[epoch,setEpoch]=useState(0),[session,setSession]=useState<CalculatorSession|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState("");
 useEffect(()=>onSessionChanged(()=>{setSession(null);setError("");setEpoch(v=>v+1);}),[]);
 useEffect(()=>{let active=true,off:(()=>void)|undefined,current:CalculatorSession|undefined;setSession(null);setError("");
  if(admin.allowed&&!admin.checking&&admin.userId)void openRevenueCalculator(admin.userId).then(value=>{if(!active)return;current=value;off=value.subscribe(()=>setRevision(v=>v+1));setSession(value);}).catch(()=>{if(active)setError("No se pudo abrir la calculadora. Comprueba tu conexión y vuelve a intentarlo.");});
  return()=>{active=false;off?.();if(current)void current.flush();};
 },[admin.userId,admin.allowed,admin.checking,epoch]);
 const view=useMemo(()=>session?.snapshot(),[session,revision]);
 if(!admin.allowed||admin.checking)return <View style={s.root}/>;
 return <KeyboardAvoidingView behavior="height" style={{flex:1}}><ScrollView style={s.root} contentContainerStyle={[s.content,{paddingTop:8,gap:10}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
 {!view&&!error&&<ActivityIndicator accessibilityLabel="Abriendo calculadora"/>}
 {!!error&&<View><Text accessibilityRole="alert" style={s.error}>{error}</Text><FinanceButton label="Reintentar" onPress={()=>setEpoch(v=>v+1)}/></View>}
 {view&&<>
 {!!view.error&&<View><Text accessibilityRole="alert" style={s.error}>{view.error}</Text>{view.canWrite&&<FinanceButton label="Reintentar guardado" onPress={()=>{void session!.flush();}}/>}</View>}
 {!view.canWrite&&<Text style={s.note}>Solo lectura</Text>}
 <FinancialRevenueTable doc={view.doc} onCalculate={()=>{void session!.flush();}} writable={view.canWrite} update={fn=>session!.change(fn)}/></>}
 </ScrollView></KeyboardAvoidingView>;
}
