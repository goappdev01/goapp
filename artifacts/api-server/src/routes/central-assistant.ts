import {Router,type IRouter} from "express";
import {centralConversationSchema,centralHistoryWriteSchema} from "@workspace/api-zod";
import {requireAdmin} from "../middleware/requireAdmin";
import {bearerHeader,supabaseRequest} from "../lib/supabase";
import {centralSettings,centralControl,centralBookingsEnabled,CentralAiError} from "../lib/centralAiBudget";
import {respondCentral} from "../lib/centralAiResponse";
import {confirmCentralBooking} from "../lib/centralAiBookingTools";

const router:IRouter=Router();
router.use(requireAdmin);
const windows=new Map<string,{count:number;until:number}>();
const historyEnabled=()=>process.env.GO_CENTRAL_AI_HISTORY_ENABLED==="true";
router.get("/capabilities",async(req,res)=>{
  let available=false,actions=false,budget;
  if(centralSettings().enabled)try{const state=await centralControl(req.header("authorization"),"status");
    available=state.enabled===true&&state.remainingMicroUsd>=200000;actions=available&&centralBookingsEnabled()&&state.authorizedBusinesses?.length>0;
    budget={limitMicroUsd:state.limitMicroUsd,chargedMicroUsd:state.chargedMicroUsd,remainingMicroUsd:state.remainingMicroUsd};
  }catch{/* Fail closed, without revealing configuration or credentials. */}
  res.json({conversation:available,transcription:false,actions,model:centralSettings().model,budget,
    history:historyEnabled()?"account-opt-in":"local-opt-in"});
});

const failure=(res:any,error:unknown)=>res.status(error instanceof CentralAiError?error.status:503)
  .json({code:error instanceof CentralAiError?error.code:"AI_UNAVAILABLE",error:error instanceof CentralAiError?error.message:"No se pudo comprobar la operación. No se confirma ningún resultado."});
router.get("/proposal/current",async(req,res)=>{
  if(!centralBookingsEnabled()){res.json({proposal:null});return;}
  try{res.json({proposal:await centralControl(req.header("authorization"),"current")});}catch(error){failure(res,error);}
});
router.post("/proposal/cancel",async(req,res)=>{
  if(req.body?.consent!==true||Object.keys(req.body).some(key=>key!=="consent")){res.status(400).json({error:"Solicitud inválida."});return;}
  try{await centralControl(req.header("authorization"),"invalidate");res.json({cancelled:true,reservationCreated:false});}catch(error){failure(res,error);}
});
router.post("/proposal/confirm",async(req,res)=>{
  if(!centralSettings().enabled){res.status(503).json({error:"La prueba está desactivada."});return;}
  if(!centralBookingsEnabled()){res.status(503).json({code:"AI_BOOKINGS_DISABLED",error:"Las herramientas de reserva no están habilitadas."});return;}
  if(req.body?.consent!==true||req.body?.confirmed!==true||typeof req.body?.id!=="string"
    ||!centralHistoryId(req.body.id)||Object.keys(req.body).some(key=>!["id","confirmed","consent"].includes(key))){res.status(400).json({error:"Confirma expresamente los datos exactos de la propuesta."});return;}
  try{res.json(await confirmCentralBooking(req.header("authorization"),req.body.id));}catch(error){failure(res,error);}
});
const centralHistoryId=(id:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);

/** Dormant until the reviewed table and RLS are deployed. Caller JWT remains authoritative. */
router.get("/history",async(req,res)=>{
  if(!historyEnabled()){res.status(503).json({error:"El historial entre dispositivos aún no está habilitado."});return;}
  try{
    const query=new URLSearchParams({user_id:`eq.${res.locals.adminUserId}`,select:"revision,messages",limit:"1"});
    const response=await supabaseRequest(`/rest/v1/go_ai_conversations?${query}`,{headers:bearerHeader(req.header("authorization"))});
    if(!response.ok)throw Error("History read unavailable");
    const rows=await response.json() as unknown;
    if(!Array.isArray(rows)||rows.length>1)throw Error("Invalid history response");
    if(!rows.length){res.json({revision:0,messages:[]});return;}
    const row=rows[0] as {revision?:unknown;messages?:unknown};
    const checked=centralHistoryWriteSchema.safeParse({consent:true,revision:row.revision,messages:row.messages});
    if(!checked.success||checked.data.revision===0)throw Error("Invalid history data");
    res.json({revision:checked.data.revision,messages:checked.data.messages});
  }catch{res.status(502).json({error:"No se pudo recuperar el historial de esta cuenta."});}
});
router.put("/history",async(req,res)=>{
  if(!historyEnabled()){res.status(503).json({error:"El historial entre dispositivos aún no está habilitado."});return;}
  const parsed=centralHistoryWriteSchema.safeParse(req.body);
  if(!parsed.success){res.status(400).json({error:"Autoriza el guardado y envía un historial válido."});return;}
  const {revision,messages}=parsed.data,userId=res.locals.adminUserId as string;
  const headers={...bearerHeader(req.header("authorization")),"Content-Type":"application/json",Prefer:"return=representation"};
  const body=JSON.stringify({user_id:userId,messages,revision:revision+1,updated_at:new Date().toISOString()});
  try{
    const query=revision===0?"select=revision":new URLSearchParams({user_id:`eq.${userId}`,revision:`eq.${revision}`,select:"revision"}).toString();
    const response=await supabaseRequest(`/rest/v1/go_ai_conversations?${query}`,{method:revision===0?"POST":"PATCH",headers,body});
    if(response.status===409){res.status(409).json({error:"El historial cambió en otra sesión. Recárgalo antes de guardar."});return;}
    if(!response.ok)throw Error("History write unavailable");
    const rows=await response.json() as {revision?:unknown}[];
    if(!Array.isArray(rows)||rows.length!==1||rows[0]?.revision!==revision+1){res.status(409).json({error:"El historial cambió en otra sesión. Recárgalo antes de guardar."});return;}
    res.json({revision:revision+1});
  }catch{res.status(502).json({error:"No se pudo guardar el historial entre dispositivos."});}
});
router.post("/transcribe",(_req,res)=>{res.status(503).json({error:"Esta prueba no utiliza audio de pago. Puedes usar el dictado del teclado del dispositivo o escribir."});});
router.post("/respond",async(req,res)=>{
  if(req.body?.consent!==true){res.status(400).json({error:"Autoriza el envío de esta conversación a OpenAI antes de continuar."});return;}
  if(!centralSettings().enabled){res.status(503).json({error:"La conversación real requiere verificar cuenta, saldo y control acumulado de gasto."});return;}
  const conversation=centralConversationSchema.safeParse(req.body);
  if(!conversation.success){res.status(400).json({error:"Contenido inválido o demasiado extenso. Reduce el mensaje o inicia otra conversación."});return;}
  const now=Date.now(),user=res.locals.adminUserId as string;
  for(const [key,w] of windows)if(w.until<=now)windows.delete(key);
  const w=windows.get(user)??{count:0,until:now+60000};
  if(w.count>=6){res.setHeader("Retry-After",String(Math.max(1,Math.ceil((w.until-now)/1000))));res.status(429).json({error:"Espera un momento antes de enviar otra consulta."});return;}
  w.count++;windows.set(user,w);
  const started=Date.now(),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),45000);
  const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on("close",disconnected);
  try{
    const result=await respondCentral(req.header("authorization"),conversation.data.messages,controller.signal,conversation.data.requestId);
    res.json({...result,metrics:{...result.metrics,latencyMs:Date.now()-started}});
  }catch(error){if(!res.destroyed)failure(res,error);}
  finally{clearTimeout(timer);res.off("close",disconnected);}
});
export default router;
