import {financialDocumentSchema,type FinancialDocument,type FinancialPlan} from "@workspace/api-zod";
import {financialApi,parseFinancialPlan,type FinancialAccess} from "./financialPlans";
import {onSessionChanged} from "@/lib/sessionEvents";

type Snapshot={doc:FinancialDocument;canWrite:boolean;dirty:boolean;saving:boolean;error:string};
const sessions=new Map<string,CalculatorSession>(),loads=new Map<string,Promise<CalculatorSession>>();let epoch=0;
/** Serializes edits into the same private, versioned financial document. No device database or alternate market store. */
export class CalculatorSession{
 private doc:FinancialDocument;private revision=0;private saved=0;private error="";private active=true;
 private timer:ReturnType<typeof setTimeout>|null=null;private pending:Promise<void>|null=null;private abort:AbortController|null=null;
 private listeners=new Set<()=>void>();
 constructor(private plan:FinancialPlan,private userId:string){this.doc=plan.document;}
 snapshot():Snapshot{return{doc:this.doc,canWrite:this.plan.canWrite,dirty:this.revision!==this.saved,saving:!!this.pending,error:this.error};}
 subscribe(fn:()=>void){this.listeners.add(fn);return()=>{this.listeners.delete(fn);};}
 private emit(){if(this.active)for(const fn of this.listeners)fn();}
 change(fn:(doc:FinancialDocument)=>FinancialDocument){if(!this.active||!this.plan.canWrite)return;const next=fn(this.doc);if(next===this.doc)return;this.doc=next;this.revision++;this.error="";this.emit();if(this.timer)clearTimeout(this.timer);this.timer=setTimeout(()=>{this.timer=null;void this.flush();},450);}
 adopt(plan:FinancialPlan){this.plan={...this.plan,canWrite:plan.canWrite};if(this.revision===this.saved){this.plan=plan;this.doc=plan.document;}else if(plan.version!==this.plan.version)this.error="Los datos han cambiado en otra sesión. Tus cambios siguen pendientes y no se han sobrescrito.";}
 flush():Promise<void>{
  if(this.timer){clearTimeout(this.timer);this.timer=null;}
  if(this.pending)return this.pending.then(()=>this.active&&!this.error&&this.revision!==this.saved?this.flush():undefined);
  if(!this.active||!this.plan.canWrite||this.revision===this.saved)return Promise.resolve();
  if(!financialDocumentSchema.safeParse(this.doc).success){this.error="Revisa la captación (0–100 %) y las cuotas antes de guardar.";this.emit();return Promise.resolve();}
  const document=this.doc,revision=this.revision,version=this.plan.version;this.abort=new AbortController();const signal=this.abort.signal;
  const task=(async()=>{try{
   const result=await financialApi<FinancialPlan>("/plans/"+this.plan.id,this.userId,"PUT",{version,document,reason:"Actualización de captación y cuota hipotética de ingresos GO"},signal);
   if(!this.active)return;const saved=parseFinancialPlan(result);this.plan=saved;this.saved=revision;this.error="";if(this.revision===revision)this.doc=saved.document;
  }catch(error){if(this.active)this.error=error instanceof Error?error.message:"No se pudieron guardar los cambios. Vuelve a intentarlo.";}})();
  this.pending=task.then(()=>{this.pending=null;this.abort=null;this.emit();});this.emit();
  return this.pending.then(()=>this.active&&!this.error&&this.revision!==this.saved?this.flush():undefined);
 }
 cancel(){this.active=false;if(this.timer)clearTimeout(this.timer);this.abort?.abort();this.listeners.clear();}
}
onSessionChanged(()=>{epoch++;for(const session of sessions.values())session.cancel();sessions.clear();loads.clear();});
export function openRevenueCalculator(userId:string):Promise<CalculatorSession>{
 const current=loads.get(userId);if(current)return current;const token=epoch;
 const check=()=>{if(token!==epoch)throw new Error("Tu sesión de GO se está actualizando. Vuelve a intentarlo.");};
 const task=(async()=>{
  for(const [key,session] of sessions)if(key.startsWith(userId+"|"))await session.flush();check();
  const access=await financialApi<FinancialAccess>("/access",userId);check();let value:FinancialPlan;
  if(access.plans.length)value=await financialApi<FinancialPlan>("/plans/"+access.plans[0].id,userId);
  else if(access.canCreate)value=await financialApi<FinancialPlan>("/plans",userId,"POST",{title:"Proyección de ingresos GO",startYear:new Date().getFullYear()});
  else throw new Error("Todavía no tienes autorización para consultar estos datos.");
  check();const plan=parseFinancialPlan(value),key=userId+"|"+plan.id;let session=sessions.get(key);if(session)session.adopt(plan);else{session=new CalculatorSession(plan,userId);sessions.set(key,session);}return session;
 })();loads.set(userId,task);void task.finally(()=>{if(loads.get(userId)===task)loads.delete(userId);}).catch(()=>{});return task;
}
