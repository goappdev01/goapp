import React,{useEffect,useMemo,useState} from "react";
import {ActivityIndicator,ScrollView,Text,View} from "react-native";
import {useNavigation} from "expo-router";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {onSessionChanged} from "@/lib/sessionEvents";
import {openRevenueCalculator,type CalculatorSession} from "@/data/financialCalculatorSession";
import {createFinancialDemoDocument} from "@/data/financialDemo";
import type {FinancialDocument} from "@workspace/api-zod";
import {FinancialRevenueTable} from "./FinancialRevenueTable";
import {FinanceButton,financeStyles as s} from "./FinancialUI";

export function FinancialPlanScreen(){
 const navigation=useNavigation();
 useEffect(()=>{navigation.setOptions({orientation:"all"});return()=>navigation.setOptions({orientation:"portrait"});},[navigation]);
 const admin=useAdminAccess(),[epoch,setEpoch]=useState(0),[session,setSession]=useState<CalculatorSession|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState("");
 const [demoActive,setDemoActive]=useState(false),[demoDoc,setDemoDoc]=useState<FinancialDocument|null>(null);
 useEffect(()=>onSessionChanged(()=>{setDemoActive(false);setDemoDoc(null);setSession(null);setError("");setEpoch(v=>v+1);}),[]);
 useEffect(()=>{if(!admin.allowed||admin.checking||!admin.userId){setDemoActive(false);setDemoDoc(null);}},[admin.allowed,admin.checking,admin.userId]);
 useEffect(()=>{let active=true,off:(()=>void)|undefined,current:CalculatorSession|undefined;setSession(null);setError("");
  if(!demoActive&&admin.allowed&&!admin.checking&&admin.userId)void openRevenueCalculator(admin.userId).then(value=>{if(!active)return;current=value;off=value.subscribe(()=>setRevision(v=>v+1));setSession(value);}).catch(cause=>{if(active)setError(cause&&typeof cause==='object'&&'message' in cause&&typeof cause.message==='string'?cause.message:"No se pudo abrir la calculadora. Vuelve a intentarlo.");});
  return()=>{active=false;off?.();if(current)void current.flush();};
 },[admin.userId,admin.allowed,admin.checking,epoch,demoActive]);
 const view=useMemo(()=>session?.snapshot(),[session,revision]);
 if(!admin.allowed||admin.checking||!admin.userId)return <View style={s.root}/>;
 return <ScrollView style={s.root} contentContainerStyle={[s.content,{paddingTop:8,gap:10}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
 {demoActive&&demoDoc?<>
 <Text style={s.note}>DEMO · Datos ficticios solo en este dispositivo. Los cambios no se guardan en la nube y se perderán al salir.</Text>
 <FinanceButton label="Salir de DEMO" onPress={()=>{setDemoActive(false);setDemoDoc(null);setEpoch(v=>v+1);}}/>
 <FinancialRevenueTable doc={demoDoc} demo writable update={fn=>setDemoDoc(current=>current?fn(current):current)}/>
 </>:<>
 {!view&&<FinanceButton label="Probar calculadora DEMO" onPress={()=>{setDemoDoc(createFinancialDemoDocument());setDemoActive(true);}}/>}
 {!view&&!error&&<ActivityIndicator accessibilityLabel="Abriendo calculadora"/>}
 {!!error&&<View><Text accessibilityRole="alert" style={s.error}>{error}</Text><FinanceButton label="Reintentar" onPress={()=>setEpoch(v=>v+1)}/></View>}
 {view&&<>
 {!!view.error&&<View><Text accessibilityRole="alert" style={s.error}>{view.error}</Text>{view.canWrite&&<FinanceButton label="Reintentar guardado" onPress={()=>{void session!.flush();}}/>}</View>}
 {!view.canWrite&&<Text style={s.note}>Solo lectura</Text>}
 <FinancialRevenueTable doc={view.doc} onCalculate={()=>{void session!.flush();}} writable={view.canWrite} update={fn=>session!.change(fn)}/></>}
 </>}
 </ScrollView>;
}
