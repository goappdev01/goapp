import {Router,type IRouter} from "express";
import {centralConversationSchema} from "@workspace/api-zod";
import {requireAdmin} from "../middleware/requireAdmin";

const router:IRouter=Router();
router.use(requireAdmin);
const windows=new Map<string,{count:number;until:number}>();
const integer=(key:string)=>{const value=Number(process.env[key]);return Number.isSafeInteger(value)&&value>0?value:0;};
function settings(){
  const model=process.env.GO_CENTRAL_AI_MODEL,key=process.env.OPENAI_API_KEY;
  const output=integer("GO_CENTRAL_AI_MAX_OUTPUT_TOKENS"),requests=integer("GO_CENTRAL_AI_REQUESTS_PER_MINUTE");
  const enabled=process.env.GO_CENTRAL_AI_ENABLED==="true"&&!!key&&!!model&&output>0&&requests>0;
  return {enabled,key,model,output,requests,transcription:enabled&&process.env.GO_CENTRAL_AI_TRANSCRIPTION_ENABLED==="true"&&!!process.env.GO_CENTRAL_AI_TRANSCRIPTION_MODEL};
}
router.get("/capabilities",(_req,res)=>{const c=settings();res.json({conversation:c.enabled,transcription:c.transcription,actions:false,history:"local-opt-in"});});
router.post(["/respond","/transcribe"],async(req,res)=>{
  const c=settings(),audio=req.path==="/transcribe";
  if(req.body?.consent!==true){res.status(400).json({error:"Autoriza el envío de esta conversación a OpenAI antes de continuar."});return;}
  if(!c.enabled||audio&&!c.transcription){res.status(503).json({error:audio?"El dictado no está habilitado. Puedes escribir.":"La conversación con OpenAI aún no está habilitada por el administrador."});return;}
  const conversation=centralConversationSchema.safeParse(req.body);
  const validAudio=audio&&typeof req.body.audio==="string"&&req.body.audio.length>=100&&req.body.audio.length<=6700000&&/^[A-Za-z0-9+/]+={0,2}$/.test(req.body.audio)&&req.body.mime==="audio/m4a"&&Object.keys(req.body).every(k=>["audio","mime","consent"].includes(k));
  if(audio?!validAudio:!conversation.success){res.status(400).json({error:"Contenido inválido o demasiado extenso. Reduce el mensaje o inicia otra conversación."});return;}
  const now=Date.now(),user=res.locals.adminUserId as string;
  for(const [key,w] of windows)if(w.until<=now)windows.delete(key);
  const w=windows.get(user)??{count:0,until:now+60000};
  if(w.count>=c.requests){res.setHeader("Retry-After",String(Math.max(1,Math.ceil((w.until-now)/1000))));res.status(429).json({error:"Has alcanzado el límite de solicitudes configurado. Espera un momento."});return;}
  w.count++;windows.set(user,w);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),30000);
  const disconnected=()=>{if(!res.writableEnded)controller.abort();};res.on("close",disconnected);
  try{
    let body:FormData|string;
    if(audio){const bytes=Buffer.from(req.body.audio,"base64");if(bytes.length>5000000){res.status(413).json({error:"Grabación demasiado larga."});return;}
      const form=new FormData();form.append("file",new Blob([bytes],{type:"audio/m4a"}),"go.m4a");form.append("model",process.env.GO_CENTRAL_AI_TRANSCRIPTION_MODEL!);form.append("language","es");body=form;
    }else{
      if(!conversation.success)return;
      body=JSON.stringify({model:c.model,store:false,max_output_tokens:c.output,
        instructions:"Eres GO, una IA generalista. Conversa sobre cualquier tema legítimo en el idioma del interlocutor. No tienes acceso a datos de GO ni herramientas. Nunca afirmes haber realizado acciones, reservas, compras, envíos ni cambios. Si te piden actuar, explica que esta fase solo permite conversar y proponer, sin ejecutar. No solicites contraseñas ni secretos.",
        input:conversation.data.messages.map(m=>({role:m.role,content:m.text})),tools:[]});
    }
    const upstream=await fetch("https://api.openai.com/v1/"+(audio?"audio/transcriptions":"responses"),{method:"POST",redirect:"error",headers:{Authorization:"Bearer "+c.key,...(!audio?{"Content-Type":"application/json"}:{})},body,signal:controller.signal});
    if(!upstream.ok){res.status(upstream.status===429?429:502).json({error:"OpenAI no puede responder ahora. Conserva tu texto e inténtalo más tarde."});return;}
    const result=await upstream.json() as {text?:unknown;status?:string;output?:{type?:string;role?:string;content?:{type?:string;text?:string}[]}[]};
    const text=audio?result.text:Array.isArray(result.output)?result.output.filter((o:any)=>o.type==="message"&&o.role==="assistant").flatMap((o:any)=>o.content??[]).filter((o:any)=>o.type==="output_text").map((o:any)=>o.text).join("\n"):null;
    if(typeof text!=="string"||!text.trim()||text.length>4000||!audio&&result.status!=="completed")throw Error("Invalid or incomplete provider response");
    res.json(audio?{text}:{answer:text});
  }catch{if(!res.destroyed)res.status(502).json({error:"La conexión se ha interrumpido. Puedes continuar por texto o volver a intentarlo."});}
  finally{clearTimeout(timer);res.off("close",disconnected);}
});
export default router;
