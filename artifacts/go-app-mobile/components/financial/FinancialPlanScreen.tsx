import React,{useEffect,useRef,useState} from "react";
import {ActivityIndicator,Text,View} from "react-native";
import {useNavigation} from "expo-router";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {onSessionChanged} from "@/lib/sessionEvents";
import {loadFinancialDemo,saveFinancialDemo,type FinancialDemoState} from "@/data/financialDemoStore";
import {FinancialSimpleDemoTable} from "./FinancialSimpleDemoTable";
import {FinanceButton,financeStyles as s} from "./FinancialUI";

/** The presentation calculator is local. Hosted finance remains a separate, unchanged contract. */
export function FinancialPlanScreen(){
 const navigation=useNavigation();
 useEffect(()=>{navigation.setOptions({orientation:"all"});return()=>navigation.setOptions({orientation:"portrait"});},[navigation]);
 const admin=useAdminAccess(),[epoch,setEpoch]=useState(0),[state,setState]=useState<FinancialDemoState|null>(null);
 const [loading,setLoading]=useState(false),[error,setError]=useState(""),[saveError,setSaveError]=useState("");
 const token=useRef(0),current=useRef<FinancialDemoState|null>(null),loaded=useRef<FinancialDemoState|null>(null);
 useEffect(()=>onSessionChanged(()=>{token.current++;current.current=null;loaded.current=null;setState(null);setError("");setSaveError("");setEpoch(value=>value+1);}),[]);
 useEffect(()=>{const request=++token.current;current.current=null;loaded.current=null;setState(null);setError("");setSaveError("");
  if(!admin.allowed||admin.checking||!admin.userId)return;
  setLoading(true);
  void loadFinancialDemo(admin.userId).then(({state:result})=>{if(request!==token.current)return;loaded.current=result;current.current=result;setState(result);},cause=>{if(request===token.current)setError(cause instanceof Error?cause.message:"No se pudo abrir la calculadora local.");})
   .finally(()=>{if(request===token.current)setLoading(false);});
  return()=>{token.current++;};
 },[admin.userId,admin.allowed,admin.checking,epoch]);
 useEffect(()=>{if(!admin.userId||!state||state===loaded.current)return;let active=true;
  void saveFinancialDemo(admin.userId,state).then(()=>{if(active){loaded.current=state;setSaveError("");}},cause=>{if(active)setSaveError(cause instanceof Error?cause.message:"No se guardaron los cambios en este dispositivo.");});
  return()=>{active=false;};
 },[state,admin.userId]);
 const update=(fn:(before:FinancialDemoState)=>FinancialDemoState)=>{const before=current.current;if(!before)return;try{const next=fn(before);if(next!==before){current.current=next;setState(next);setError("");}}catch(cause){setError(cause instanceof Error?cause.message:"No se pudo actualizar la simulación.");}};
 const retrySave=()=>{if(!admin.userId||!current.current)return;const snapshot=current.current;setSaveError("");void saveFinancialDemo(admin.userId,snapshot).then(()=>{loaded.current=snapshot;},cause=>setSaveError(cause instanceof Error?cause.message:"No se guardaron los cambios."));};
 if(!admin.allowed||admin.checking||!admin.userId)return <View style={s.root}/>;
 return <View style={[s.root,{minHeight:0}]}>
  {loading&&<ActivityIndicator accessibilityLabel="Abriendo calculadora"/>}
  {!!error&&<View><Text accessibilityRole="alert" style={s.error}>{error}</Text>{!state&&<FinanceButton label="Reintentar" onPress={()=>setEpoch(value=>value+1)}/>}</View>}
  {!!saveError&&<View><Text accessibilityRole="alert" style={s.error}>{saveError}</Text><FinanceButton label="Reintentar guardado local" onPress={retrySave}/></View>}
  {state&&<FinancialSimpleDemoTable state={state} update={update}/>}
 </View>;
}
