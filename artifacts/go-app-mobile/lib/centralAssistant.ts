import {captureAuthIdentity,fetchWithAuth,getAuthApiBase,isAuthIdentityCurrent} from "./authSession";
import {getAdminAccess} from "@/data/adminAccess";

export class CentralAssistantApiError extends Error{
  constructor(message:string,readonly status:number,readonly code?:string){super(message);}
}

export async function centralAssistantApi<T>(userId:string,path:"/capabilities"|"/respond"|"/transcribe"|"/history"|"/proposal/confirm"|"/proposal/cancel"|"/proposal/current",body?:unknown,signal?:AbortSignal,method?:"GET"|"PUT"):Promise<T>{
  const identity=await captureAuthIdentity(),access=await getAdminAccess();
  if(!identity||identity.userId!==userId||access.userId!==userId||!access.allowed||!await isAuthIdentityCurrent(identity))throw Error("No se pudo validar el acceso ADMIN.");
  const base=getAuthApiBase();if(!/^https:\/\//i.test(base))throw Error("La conexión segura con GO no está configurada.");
  const controller=new AbortController(),cancel=()=>controller.abort();signal?.addEventListener("abort",cancel,{once:true});if(signal?.aborted)controller.abort();
  const timer=setTimeout(cancel,55000);
  try{const response=await fetchWithAuth(base+"/central-assistant"+path,{method:method??(body===undefined?"GET":"POST"),headers:{"Content-Type":"application/json"},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:controller.signal},true,userId);
    const result=await response.json().catch(()=>null);
    if(!response.ok)throw new CentralAssistantApiError(response.status===404?"La IA central está pendiente de despliegue en el servidor.":typeof result?.error==="string"?result.error:"No se pudo conectar con la IA de GO.",response.status,typeof result?.code==="string"?result.code:undefined);
    if(!await isAuthIdentityCurrent(identity))throw Error("La sesión ha cambiado.");return result as T;
  }finally{clearTimeout(timer);signal?.removeEventListener("abort",cancel);}
}
