import express, { Router, type IRouter } from "express";
import { requireAdmin } from "../middleware/requireAdmin";
import { bearerHeader, supabaseRequest } from "../lib/supabase";
import { emptyFinancialDocument, financialDocumentSchema, calculateFinancialPlan, consolidateFinancialRows, previewFinanceMarketImport, type FinancialPlan } from "@workspace/api-zod";

const router: IRouter = Router();
router.use(requireAdmin);
// Vendor JSON is scoped here so large files don't change global API parser limits.
router.use(express.json({ type: "application/vnd.go.finance+json", limit: "20mb" }));
const uuid = (value: unknown): value is string => typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const revision = (value: unknown): value is number => Number.isSafeInteger(value) && Number(value) > 0;
class FinancialError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }
async function rpc(name: string, args: object, authorization: string | undefined): Promise<any> {
  const response = await supabaseRequest("/rest/v1/rpc/finance_" + name, { method: "POST", headers: { ...bearerHeader(authorization), "Content-Type": "application/json" }, body: JSON.stringify(args) });
  if (response.ok) return response.json();
  const payload = await response.json().catch(() => ({})) as { code?: string };
  if (payload.code === "PGRST202" || payload.code === "42883" || payload.code === "42P01") throw new FinancialError(503,"FINANCE_SETUP_REQUIRED","La persistencia financiera todavía no está instalada en este entorno.");
  if (response.status === 401) throw new FinancialError(401,"AUTH_REQUIRED","Inicia sesión de nuevo.");
  if (response.status === 403 || payload.code === "42501") throw new FinancialError(403,"FINANCE_FORBIDDEN","No tienes autorización expresa para este plan.");
  if (payload.code === "PT409" || payload.code === "40001" || payload.code === "23505") throw new FinancialError(409,"FINANCE_CONFLICT","Los datos han cambiado. Recarga y revisa antes de guardar o revertir.");
  if (response.status === 400 || ["22023","23514","23503","22007","22008"].includes(payload.code || "")) throw new FinancialError(400,"FINANCE_INVALID","Los datos o las referencias no son válidos. Revisa la operación.");
  throw new FinancialError(502,"FINANCE_UNAVAILABLE","No se pudo completar la operación financiera. No se ha confirmado ningún cambio.");
}
const handle = (fn: (req: express.Request, res: express.Response) => Promise<unknown>): express.RequestHandler => async (req,res) => {
  try { await fn(req,res); }
  catch(error) { if(error instanceof FinancialError) res.status(error.status).json({ code:error.code,error:error.message });
    else res.status(502).json({code:"FINANCE_UNAVAILABLE",error:"No se pudo completar la operación financiera. Inténtalo de nuevo."}); }
};
const invalid = () => { throw new FinancialError(400,"FINANCE_INVALID","Revisa los datos de la operación."); };
async function readPlan(id: unknown, auth: string | undefined): Promise<FinancialPlan> {
  if (!uuid(id)) return invalid();
  const data = await rpc("get_plan",{p_id:id},auth);
  const document = financialDocumentSchema.safeParse(data?.document);
  if(!document.success || data.id!==id || !revision(data.version) || typeof data.canWrite!=="boolean") throw new FinancialError(502,"FINANCE_INVALID_RESPONSE","No se pudo verificar el plan guardado.");
  return {...data,document:document.data};
}
router.get("/access",handle(async(req,res)=>{res.json(await rpc("access",{},req.header("authorization")));}));
router.post("/plans",handle(async(req,res)=>{
  if(res.locals.adminLevel!=="owner") throw new FinancialError(403,"FINANCE_FORBIDDEN","Solo el administrador principal puede crear planes.");
  const title=req.body?.title,startYear=req.body?.startYear;
  if(typeof title!=="string" || !Number.isInteger(startYear)) return invalid();
  const parsed=financialDocumentSchema.safeParse(emptyFinancialDocument(title,startYear));if(!parsed.success)return invalid();
  res.status(201).json(await rpc("create_plan",{d:parsed.data},req.header("authorization")));
}));
router.get("/plans/:id",handle(async(req,res)=>{res.json(await readPlan(req.params.id,req.header("authorization")));}));
router.put("/plans/:id",handle(async(req,res)=>{
  const parsed=financialDocumentSchema.safeParse(req.body?.document);
  if(!uuid(req.params.id)||!revision(req.body?.version)||!parsed.success||typeof req.body?.reason!=="string"||!req.body.reason.trim()||req.body.reason.length>1000)return invalid();
  res.json(await rpc("save_plan",{p_id:req.params.id,p_version:req.body.version,d:parsed.data,reason:req.body.reason.trim()},req.header("authorization")));
}));
router.get("/plans/:id/results",handle(async(req,res)=>{
  const plan=await readPlan(req.params.id,req.header("authorization"));const rows=calculateFinancialPlan(plan.document);
  const offset=Number(req.query.offset??0),limit=Number(req.query.limit??250);
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(limit)||limit<1||limit>1000)return invalid();
  const selected=rows.filter(row=>(req.query.activityId===undefined||row.activityId===req.query.activityId)&&(req.query.countryCode===undefined||row.countryCode===req.query.countryCode)&&(req.query.scenario===undefined||row.scenario===req.query.scenario)&&(req.query.year===undefined||row.year===Number(req.query.year)));
  res.json({version:plan.version,baseCurrency:plan.document.baseCurrency,rows:selected.slice(offset,offset+limit),totalRows:selected.length,offset,limit,global:consolidateFinancialRows(rows)});
}));
for(const [path,name] of [["history","history"],["imports","list_imports"]] as const) router.get("/plans/:id/"+path,handle(async(req,res)=>{
  if(!uuid(req.params.id))return invalid();res.json(await rpc(name,{p_id:req.params.id},req.header("authorization")));
}));
router.get("/plans/:id/grants",handle(async(req,res)=>{if(!uuid(req.params.id))return invalid();res.json(await rpc("list_grants",{p_id:req.params.id},req.header("authorization")));}));
router.put("/plans/:id/grants",handle(async(req,res)=>{
  if(res.locals.adminLevel!=="owner")throw new FinancialError(403,"FINANCE_FORBIDDEN","Solo el administrador principal puede autorizar accesos.");
  const b=req.body;if(!uuid(req.params.id)||!uuid(b?.userId)||!revision(b?.version)||typeof b.canWrite!=="boolean"||typeof b.active!=="boolean"||typeof b.reason!=="string"||!b.reason.trim()||b.reason.length>1000)return invalid();
  res.json(await rpc("grant",{p_id:req.params.id,p_version:b.version,target:b.userId,write_access:b.canWrite,is_active:b.active,reason:b.reason.trim()},req.header("authorization")));
}));
router.post("/plans/:id/imports/preview",handle(async(req,res)=>{
  const plan=await readPlan(req.params.id,req.header("authorization"));if(!plan.canWrite)throw new FinancialError(403,"FINANCE_FORBIDDEN","El acceso a este plan es de solo lectura.");
  if(!revision(req.body?.version)||req.body.version!==plan.version)throw new FinancialError(409,"FINANCE_CONFLICT","Recarga el plan antes de preparar la importación.");
  const preview=previewFinanceMarketImport(req.body?.file,plan.document);const {candidate,...summary}=preview;
  if(!candidate){res.status(422).json(summary);return;}
  const saved=await rpc("prepare_import",{p_id:plan.id,p_version:plan.version,d:candidate,summary},req.header("authorization"));
  res.json({...saved,preview:summary,sample:candidate.markets.slice(-20)});
}));
router.post("/plans/:id/imports/:previewId/apply",handle(async(req,res)=>{
  if(!uuid(req.params.id)||!uuid(req.params.previewId)||req.body?.confirm!==true)return invalid();
  res.json(await rpc("apply_import",{p_id:req.params.id,p_preview:req.params.previewId},req.header("authorization")));
}));
router.delete("/plans/:id/imports/:previewId",handle(async(req,res)=>{
  if(!uuid(req.params.id)||!uuid(req.params.previewId))return invalid();await rpc("cancel_import",{p_id:req.params.id,p_preview:req.params.previewId},req.header("authorization"));res.json({canceled:true});
}));
router.post("/plans/:id/imports/:importId/revert",handle(async(req,res)=>{
  if(!uuid(req.params.id)||!uuid(req.params.importId)||!revision(req.body?.version)||req.body?.confirm!==true)return invalid();
  res.json(await rpc("revert_import",{p_id:req.params.id,p_version:req.body.version,p_import:req.params.importId},req.header("authorization")));
}));
router.use(((error, _req, res, _next) => { res.status(error?.type==="entity.too.large"?413:400).json({code:"FINANCE_INVALID_FILE",error:"Archivo inválido o demasiado grande (máximo 20 MB)."}); }) as express.ErrorRequestHandler);
export default router;
