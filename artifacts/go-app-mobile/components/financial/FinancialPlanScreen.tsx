import React,{useEffect,useMemo,useRef,useState} from "react";
import {ActivityIndicator,ScrollView,Text,View,useWindowDimensions} from "react-native";
import {useNavigation} from "expo-router";
import {useAdminAccess} from "@/contexts/GoAdminAccessContext";
import {onSessionChanged} from "@/lib/sessionEvents";
import {openRevenueCalculator,type CalculatorSession} from "@/data/financialCalculatorSession";
import {loadFinancialDemo,saveFinancialDemo,type FinancialDemoState} from "@/data/financialDemoStore";
import {FinancialRevenueTable} from "./FinancialRevenueTable";
import {FinancialSimpleDemoTable} from "./FinancialSimpleDemoTable";
import {GO_NAVIGATION_OVERLAY_CLEARANCE} from "@/components/ui/GoNavigationRail";
import {FinanceButton,financeStyles as s} from "./FinancialUI";

export function FinancialPlanScreen(){
 const navigation=useNavigation();
 useEffect(()=>{navigation.setOptions({orientation:"all"});return()=>navigation.setOptions({orientation:"portrait"});},[navigation]);
 const {width,height}=useWindowDimensions(),scroll=useRef<React.ElementRef<typeof ScrollView>>(null),demoRef=useRef<FinancialDemoState|null>(null),loadToken=useRef(0);
 useEffect(()=>{scroll.current?.scrollTo({x:0,y:0,animated:false});},[width,height]);
 const admin=useAdminAccess(),[epoch,setEpoch]=useState(0),[session,setSession]=useState<CalculatorSession|null>(null),[revision,setRevision]=useState(0),[error,setError]=useState(""),[setupRequired,setSetupRequired]=useState(false);
 const [demoActive,setDemoActive]=useState(false),[demoState,setDemoState]=useState<FinancialDemoState|null>(null),[demoLoading,setDemoLoading]=useState(false),[demoError,setDemoError]=useState(""),[demoSaveError,setDemoSaveError]=useState("");
 useEffect(()=>onSessionChanged(()=>{loadToken.current++;demoRef.current=null;setDemoActive(false);setDemoState(null);setSession(null);setError("");setEpoch(v=>v+1);}),[]);
 useEffect(()=>{if(!admin.allowed||admin.checking||!admin.userId){loadToken.current++;demoRef.current=null;setDemoActive(false);setDemoState(null);}},[admin.allowed,admin.checking,admin.userId]);
 useEffect(()=>{if(!demoActive||!demoState||!admin.userId)return;let active=true;
  void saveFinancialDemo(admin.userId,demoState).then(()=>{if(active)setDemoSaveError("");},cause=>{if(active)setDemoSaveError(cause instanceof Error?cause.message:"No se guardaron los cambios en este dispositivo.");});
  return()=>{active=false;};
 },[demoActive,demoState,admin.userId]);
 useEffect(()=>{let active=true,off:(()=>void)|undefined,current:CalculatorSession|undefined;setSession(null);setError("");setSetupRequired(false);
  if(!demoActive&&admin.allowed&&!admin.checking&&admin.userId)void openRevenueCalculator(admin.userId).then(value=>{if(!active)return;current=value;off=value.subscribe(()=>setRevision(v=>v+1));setSession(value);}).catch(cause=>{if(!active)return;if(cause&&typeof cause==='object'&&'code' in cause&&cause.code==='FINANCE_SETUP_REQUIRED')setSetupRequired(true);else setError(cause&&typeof cause==='object'&&'message' in cause&&typeof cause.message==='string'?cause.message:"No se pudo abrir la calculadora. Vuelve a intentarlo.");});
  return()=>{active=false;off?.();if(current)void current.flush();};
 },[admin.userId,admin.allowed,admin.checking,epoch,demoActive]);
 const view=useMemo(()=>session?.snapshot(),[session,revision]);
 const enterDemo=()=>{if(!admin.userId)return;const token=++loadToken.current;setDemoActive(true);setDemoLoading(true);setDemoError("");
  void loadFinancialDemo(admin.userId).then(({state})=>{if(token!==loadToken.current)return;demoRef.current=state;setDemoState(state);setDemoSaveError("");setDemoLoading(false);},cause=>{if(token!==loadToken.current)return;setDemoError(cause instanceof Error?cause.message:"No se pudo leer la simulación local.");setDemoLoading(false);});
 };
 const updateDemo=(fn:(current:FinancialDemoState)=>FinancialDemoState)=>{const current=demoRef.current;if(!current)return;try{const next=fn(current);if(next===current)return;demoRef.current=next;setDemoState(next);}catch(cause){setDemoError(cause instanceof Error?cause.message:"No se pudo actualizar la simulación.");}};
 const retryDemoSave=()=>{if(!admin.userId||!demoRef.current)return;setDemoSaveError("");void saveFinancialDemo(admin.userId,demoRef.current).catch(cause=>setDemoSaveError(cause instanceof Error?cause.message:"No se guardaron los cambios."));};
 if(!admin.allowed||admin.checking||!admin.userId)return <View style={s.root}/>;
 return <ScrollView ref={scroll} style={[s.root,{minHeight:0}]} contentContainerStyle={[s.content,{flexGrow:1,paddingTop:8,paddingBottom:GO_NAVIGATION_OVERLAY_CLEARANCE,gap:10}]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
 {demoActive?<>
 <Text style={s.note}>DEMO · Datos guardados en este dispositivo; no se sincronizan en la nube. Las cifras de ejemplo son ficticias.</Text>
 <FinanceButton label="Salir de DEMO" onPress={()=>{loadToken.current++;setDemoActive(false);setDemoState(null);demoRef.current=null;setEpoch(v=>v+1);}}/>
 {demoLoading&&<ActivityIndicator accessibilityLabel="Abriendo simulación local"/>}
 {!!demoError&&<Text accessibilityRole="alert" style={s.error}>{demoError}</Text>}
 {!!demoSaveError&&<View><Text accessibilityRole="alert" style={s.error}>{demoSaveError}</Text><FinanceButton label="Reintentar guardado local" onPress={retryDemoSave}/></View>}
 {demoState&&<FinancialSimpleDemoTable state={demoState} update={updateDemo}/>}
 </>:<>
 {!view&&<FinanceButton label="Probar calculadora DEMO" onPress={enterDemo}/>}
 {setupRequired&&<Text style={s.note}>La calculadora alojada aún no está configurada. Puedes probar la simulación local sin guardar datos.</Text>}
 {!view&&!error&&!setupRequired&&<ActivityIndicator accessibilityLabel="Abriendo calculadora"/>}
 {!!error&&<View><Text accessibilityRole="alert" style={s.error}>{error}</Text><FinanceButton label="Reintentar" onPress={()=>setEpoch(v=>v+1)}/></View>}
 {view&&<>
 {!!view.error&&<View><Text accessibilityRole="alert" style={s.error}>{view.error}</Text>{view.canWrite&&<FinanceButton label="Reintentar guardado" onPress={()=>{void session!.flush();}}/>}</View>}
 {!view.canWrite&&<Text style={s.note}>Solo lectura</Text>}
 <FinancialRevenueTable doc={view.doc} onCalculate={()=>{void session!.flush();}} writable={view.canWrite} update={fn=>session!.change(fn)}/></>}
 </>}
 </ScrollView>;
}
