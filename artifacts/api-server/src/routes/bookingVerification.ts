import {Router,type IRouter} from "express";
import {bearerHeader,supabaseRequest} from "../lib/supabase";

const router:IRouter=Router();
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const operations=new Set(["issue","preview","arrive","invite","claim","revoke","wallet"]);
// Secrets are POST body values only. Never include them in URLs, logger fields,
// receipts, local storage or exception messages. Caller JWT remains authoritative.
router.post("/booking-verification",async(req,res)=>{
 res.setHeader("Cache-Control","no-store, private");res.setHeader("Pragma","no-cache");
 const auth=bearerHeader(req.header("authorization"));
 if(!auth.Authorization){res.status(401).json({error:"Authentication required"});return;}
 const input=req.body;
 if(!input || typeof input!=="object" || Array.isArray(input) || Object.keys(input).some(k=>!["operation","bookingId","businessId","secret","challenge"].includes(k))
   || !operations.has(input.operation) || [input.bookingId,input.businessId].some(id=>id!=null && (typeof id!=="string" || !uuid.test(id)))
   || input.secret!=null && (typeof input.secret!=="string" || input.secret.length>160)
   || input.challenge!=null && (typeof input.challenge!=="string" || input.challenge.length>80)
   || ["issue","invite","revoke"].includes(input.operation) && !input.bookingId
   || ["preview","arrive"].includes(input.operation) && !input.businessId
   || ["preview","claim"].includes(input.operation) && !input.secret
   || input.operation==="arrive" && !input.challenge){res.status(400).json({error:"Invalid verification command"});return;}
 try{
  const response=await supabaseRequest("/rest/v1/rpc/go_verify_booking",{method:"POST",headers:{...auth,"Content-Type":"application/json"},
   body:JSON.stringify({p_operation:input.operation,p_booking_id:input.bookingId??null,p_business_id:input.businessId??null,p_secret:input.secret??null,p_challenge:input.challenge??null})});
  const result=await response.json() as Record<string,unknown>;
  if(!response.ok){
   const missing=result.code==="PGRST202" || result.code==="42883";
   res.status(missing?501:response.status===401?401:response.status===403?403:503).json({code:missing?"VERIFICATION_NOT_INSTALLED":"VERIFICATION_UNAVAILABLE",error:missing?"La verificación requiere el SQL revisado del servidor.":"No se pudo comprobar la reserva. No se ha confirmado su llegada."});return;
  }
  if(result.error){const code=String(result.error);const status=[400,401,404,409,429].includes(Number(result.httpStatus))?Number(result.httpStatus):400;
   if(status===429)res.setHeader("Retry-After","60");
   const messages:Record<string,string>={VERIFICATION_INVALID:"Código no válido o no disponible para este establecimiento.",VERIFICATION_NOT_ACTIVE:"La reserva no está confirmada o ya ha finalizado.",VERIFICATION_ALREADY_ARRIVED:"La llegada ya está verificada. No se puede transferir ni generar otro código.",VERIFICATION_RATE_LIMIT:"Demasiados intentos. Espera un minuto.",VERIFICATION_OUTSIDE_ARRIVAL_WINDOW:"Todavía no se puede confirmar la llegada."};
   res.status(status).json({code,error:messages[code]??"No se pudo validar la operación."});return;}
  res.json(result);
 }catch{res.status(503).json({code:"VERIFICATION_UNAVAILABLE",error:"No se pudo comprobar el resultado. Actualiza antes de intentarlo de nuevo."});}
});
export default router;
