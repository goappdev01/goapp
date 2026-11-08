import {useEffect,useRef} from "react";
import {AppState} from "react-native";
import {onSessionChanged} from "@/lib/sessionEvents";
/** No polling in background or hidden screens; identity invalidation precedes refresh. */
export function useSupportRefresh(enabled:boolean,refresh:()=>void,invalidate:()=>void){
 const latest=useRef({enabled,refresh,invalidate});latest.current={enabled,refresh,invalidate};
 useEffect(()=>{
  let active=AppState.currentState==="active";
  const foreground=AppState.addEventListener("change",next=>{
   const entered=next==="active"&&!active;active=next==="active";
   if(entered&&latest.current.enabled)latest.current.refresh();
  });
  const identity=onSessionChanged(()=>{latest.current.invalidate();if(latest.current.enabled)latest.current.refresh();});
  const timer=setInterval(()=>{if(active&&latest.current.enabled)latest.current.refresh();},30000);
  return()=>{foreground.remove();identity();clearInterval(timer);};
 },[]);
}
