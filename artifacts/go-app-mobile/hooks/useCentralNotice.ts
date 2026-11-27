import {useEffect,useState} from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {captureAuthIdentity} from "@/lib/authSession";

const seen=new Set<string>();
export async function claimCentralNotice(userId:string,identity:{userId:string;sessionId?:string;revision:number}|null,storage:{getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<unknown>},isCurrent=()=>true){
  if(!identity||identity.userId!==userId)return false;
  const session=userId+":"+(identity.sessionId??"revision-"+identity.revision);
  if(seen.has(session))return false;
  const key="go_ai_limit_seen_session:"+encodeURIComponent(userId);
  if(await storage.getItem(key).catch(()=>null)===session){seen.add(session);return false;}
  if(!isCurrent()||seen.has(session))return false;
  seen.add(session);await storage.setItem(key,session).catch(()=>{});return true;
}
/** The warning is informational; this never changes the separate OpenAI consent. */
export function useCentralNotice(userId:string,visible:boolean){
  const [show,setShow]=useState(false);
  useEffect(()=>{let current=true;setShow(false);
    if(visible)void captureAuthIdentity().then(identity=>claimCentralNotice(userId,identity,AsyncStorage,()=>current)).then(claimed=>{if(current&&claimed)setShow(true);}).catch(()=>{});
    return()=>{current=false;};
  },[userId,visible]);
  return show;
}
