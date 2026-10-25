import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";import vm from "node:vm";import path from "node:path";import {createRequire} from "node:module";import {createHash} from "node:crypto";
const require=createRequire(path.join(process.cwd(),"package.json")),ts=require("typescript");
process.env.TZ="Europe/Madrid";
let clock=Date.parse("2026-10-20T13:30:00+02:00");
class Clock extends Date {constructor(...a){super(...(a.length?a:[clock]));} static now(){return clock;}}
function load(file,deps={}){const context={exports:{},Date:Clock,Intl,console,require:n=>{if(n in deps)return deps[n];throw Error("Unexpected import "+n);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{ alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return context.exports;}
const core=load("lib/goActionCompletion.ts"),S={userId:"A",context:"live:USER"},B={userId:"B",context:"live:USER"};
const action=(extra={})=>({id:"task",type:"TAREA_INTERNA",kind:"sent",dateISO:"2026-10-20",date:"20/10",time:"12:00",duration:"1h",estado:"aceptado",ownerUserId:"A",actionContext:"live:USER",intentLabel:"Contacto",notes:"Revisar cita",...extra});
const doc=()=>core.emptyCompletionDocument(S),plain=v=>JSON.parse(JSON.stringify(v));
test("30-minute grace starts at END, never at start; no function mutates action status",()=>{
 const e=action(),saved=JSON.stringify(e),d=doc(),end=Date.parse("2026-10-20T13:00:00+02:00");
 assert.equal(core.plannedActionEnd(e),end);assert.equal(core.awaitingCompletion(e,d,end+30*60000-1),false);assert.equal(core.awaitingCompletion(e,d,end+30*60000),true);assert.equal(e.estado,"aceptado");assert.equal(JSON.stringify(e),saved);assert.deepEqual(Object.keys(d.records),[]);
});
test("explicit end beats duration; absolute timestamps and midnight are supported",()=>{
 assert.equal(core.plannedActionEnd(action({duration:"2h",endTime:"12:30"})),Date.parse("2026-10-20T12:30:00+02:00"));
 assert.equal(core.plannedActionEnd(action({startDatetime:"2026-10-20T10:00:00Z",endDatetime:"2026-10-20T10:45:00Z"})),Date.parse("2026-10-20T10:45:00Z"));
 assert.equal(core.plannedActionEnd(action({time:"23:45",endTime:"00:15"})),Date.parse("2026-10-21T00:15:00+02:00"));
});
test("default duration is configurable without storing fictitious duration on a task",()=>{
 const e=action({duration:""});assert.equal(core.plannedActionEnd(e,45),Date.parse("2026-10-20T12:45:00+02:00"));assert.equal(e.duration,"");
 for(const [raw,n]of [["15m",15],["30 min",30],["1h",60],["2h",120],["1h 30min",90],["90",90],["1:30",90]])assert.equal(core.durationMinutes(raw),n);
 assert.equal(core.plannedActionEnd(action({duration:"abc"})),null);assert.equal(core.plannedActionEnd(action({time:""})),null);assert.equal(core.plannedActionEnd(action({dateISO:"2026-02-30"})),null);
});
test("DONE and PENDING are explicit, idempotent and independent of acceptance/proposals",()=>{
 const e=action(),d=doc(),pending=core.recordCompletion(d,e,"pending",clock);
 assert.equal(core.awaitingCompletion(e,pending,clock),false);assert.equal(core.pendingCompletion(e,pending),true);
 const done=core.recordCompletion(pending,e,"done",clock+1);
 assert.equal(core.pendingCompletion(e,done),false);assert.equal(core.completionDecision(e,done).status,"done");
 assert.equal(core.recordCompletion(done,e,"done",clock+2),done);assert.equal(done.records[core.completionKey(e)].history.length,2);
 assert.equal(e.estado,"aceptado");assert.equal(e.changeProposal,undefined);
});
test("reload/reopen, several unresolved actions and participant contexts retain independent decisions",()=>{
 const a=action(),b=action({id:"b"}),d=plain(core.recordCompletion(doc(),a,"done",clock));
 assert.equal(core.awaitingCompletion(a,d,clock),false);assert.equal(core.awaitingCompletion(b,d,clock),true);
 assert.equal(core.awaitingCompletion(a,core.emptyCompletionDocument({userId:"A",context:"demo:BUSINESS:one"}),clock),true);
 assert.notEqual(core.completionStorageKey(S),core.completionStorageKey(B));assert.notEqual(core.completionStorageKey(S),core.completionStorageKey({userId:"A",context:"live:BUSINESS"}));
});
test("rescheduling starts a new decision cycle while retaining the full previous history",()=>{
 const e=action(),d=core.recordCompletion(doc(),e,"done",clock),moved=action({dateISO:"2026-10-21"});
 assert.equal(core.completionDecision(moved,d),undefined);assert.equal(d.records[core.completionKey(e)].history.length,1);
 assert.equal(core.completionDecision(e,{...d,preferences:{...d.preferences,defaultDurationMinutes:15}}).status,"done");
});
test("a real proposal is separate; opening/cancelling a draft never creates or resolves anything",()=>{
 const e=action(),d=doc(),key=core.completionKey(e),saved=JSON.stringify(d);
 assert.equal(core.awaitingCompletion(e,d,clock),true);assert.equal(JSON.stringify(d),saved);assert.equal(d.records[key],undefined);
 const proposed=action({changeProposal:{dateISO:"2026-10-22",time:"14:00",originalDateISO:e.dateISO,originalTime:e.time,originalDuration:e.duration}});
 assert.equal(core.awaitingCompletion(proposed,d,clock),false);assert.equal(core.nextCompletionReminder(proposed,d,clock),null);
 assert.equal(proposed.estado,"aceptado");
});
test("24-hour default, custom 1h/2h/17h/fractional intervals and muting never change decisions",()=>{
 const e=action(),d=doc();assert.equal(d.preferences.reminderMinutes,1440);
 assert.equal(core.nextCompletionReminder(e,d,clock),clock+86400000);
 for(const minutes of [60,120,1020,7.5]){
  const p=core.recordCompletion(plain(d),e,"pending",clock);p.records[core.completionKey(e)].reminderMinutes=minutes;
  assert.equal(core.nextCompletionReminder(e,p,clock),clock+minutes*60000);
  p.preferences.pendingAlerts=false;assert.equal(core.nextCompletionReminder(e,p,clock),null);assert.equal(core.pendingCompletion(e,p),true);
 }
 const muted={...d,records:{[core.completionKey(e)]:{history:[],alerts:false}}};assert.equal(core.nextCompletionReminder(e,muted,clock),null);assert.equal(core.awaitingCompletion(e,muted,clock),true);
});
test("deleted/rejected/cancelled, unavailable dates and foreign accounts cannot be adopted",()=>{
 for(const extra of [{deleted:true},{estado:"rechazado"},{bookingStatus:"cancelada"}])assert.equal(core.awaitingCompletion(action(extra),doc(),clock),false);
 assert.equal(core.ownedCompletionEntry(action(),S),true);assert.equal(core.ownedCompletionEntry(action(),B),false);
 assert.equal(core.ownedCompletionEntry(action({ownerUserId:undefined}),S),false);assert.equal(core.ownedCompletionEntry(action({actionContext:"live:BUSINESS"}),S),false);
});
test("stable reservation identity deduplicates representations without mixing businesses or participants",()=>{
 const a=action({id:"cli",reservationId:"reservation",businessId:"one"}),b={...a,id:"professional"};
 assert.equal(core.completionKey(a),core.completionKey(b));assert.notEqual(core.completionKey(a),core.completionKey({...a,businessId:"two"}));
});
function storeFixture(){
 let user="A",failure=false;const memory=new Map(),writes=[];
 const api=load("lib/goActionCompletionStore.ts",{"@react-native-async-storage/async-storage":{__esModule:true,default:{async getItem(k){return memory.get(k)??null;},async setItem(k,v){if(failure)throw Error("disk");memory.set(k,v);writes.push([k,v]);}}},"./goTaskAccess":{async getTaskUser(){return user;}},"./goActionCompletion":core});
 return{api,memory,writes,user:v=>user=v,fail:()=>failure=true};
}
test("persistent store commits before publish; restart retrieves decision and concurrent updates are serialized",async()=>{
 const f=storeFixture(),e=action();f.api.setCompletionSource(S,[e]);const events=[];f.api.subscribeCompletions(()=>events.push(f.memory.has(core.completionStorageKey(S))));
 await Promise.all([f.api.decideCompletion(S,e,"pending",()=>true),f.api.decideCompletion(S,e,"done",()=>true)]);
 const raw=JSON.parse(f.memory.get(core.completionStorageKey(S)));assert.equal(raw.records[core.completionKey(e)].history.length,2);assert.equal(events.at(-1),true);
 assert.equal(core.completionDecision(e,await f.api.readCompletionDocument(S)).status,"done");
});
test("failed storage or corrupt data is not reported as a successful user decision",async()=>{
 const f=storeFixture(),e=action();f.api.setCompletionSource(S,[e]);await f.api.readCompletionDocument(S);f.fail();
 await assert.rejects(f.api.decideCompletion(S,e,"done",()=>true),/disk/);assert.equal(core.completionDecision(e,f.api.getCompletionDocument(S)),undefined);
 const g=storeFixture();g.memory.set(core.completionStorageKey(S),"bad");await assert.rejects(g.api.readCompletionDocument(S));assert.equal(g.writes.length,0);
});
test("context/identity switches and stale or ambiguous action snapshots cannot write another participant's history",async()=>{
 const f=storeFixture(),e=action();f.api.setCompletionSource(S,[e]);f.user("B");await assert.rejects(f.api.decideCompletion(S,e,"done",()=>true),/cuenta/);assert.equal(f.writes.length,0);
 f.user("A");await assert.rejects(f.api.decideCompletion(S,e,"done",()=>false),/cuenta/);
 f.api.setCompletionSource(S,[{...e,time:"13:00"}]);await assert.rejects(f.api.decideCompletion(S,e,"done",()=>true),/cambiado/);
 f.api.setCompletionSource(S,[e,e]);await assert.rejects(f.api.decideCompletion(S,e,"done",()=>true),/cambiado/);
});
test("completion notification policy uses only native requests; stable recurrence and DONE cancellation",async()=>{
 const f=storeFixture(),e=action();f.api.setCompletionSource(S,[e]);
 const policy=load("lib/goActionCompletionNotifications.ts",{"./goActionCompletion":core,"./goActionCompletionStore":f.api}).completionNotificationPolicy;
 const rows=await policy.requests(S);assert.equal(rows.length,8);assert.equal(rows[0].at,clock+86400000);assert.equal(rows[1].at-rows[0].at,86400000);assert.deepEqual(plain(await policy.requests(B)),[]);
 await f.api.decideCompletion(S,e,"done",()=>true);assert.equal((await policy.requests(S)).length,0);assert.equal(e.estado,"aceptado");
});
test("confirmation placement changes only its own frame, with unchanged orbital/card sources",()=>{
 const src=fs.readFileSync("app/index.tsx","utf8");
 assert.ok(src.includes('onSave:r=>Alert.alert'));assert.ok(src.includes('sendSuggestChangeFromCal(r)'));
 assert.ok(src.includes('!actionCompletion.unresolved.length && !actionCompletion.pending.length'));
 const ast=ts.createSourceFile("home.tsx",src,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];(function walk(n){nodes.push(n);ts.forEachChild(n,walk)})(ast);
 const baseline=JSON.parse(fs.readFileSync("tests/fixtures/landing-visual-baseline.json","utf8"));
 for(const name of ["PremiumOrbitBtn","INTENTS","GO_COLORS","goSize","orbitRadius","orbitBtnSize","microR","microSz","orbitWrapSize"]){
  const n=nodes.find(n=>(ts.isVariableDeclaration(n)||ts.isFunctionDeclaration(n))&&n.name?.getText(ast)===name);assert.ok(n,name);
  assert.equal(createHash("sha256").update(n.getText(ast).replace(/\s+/g,"")).digest("hex"),baseline[name],name);
 }
 const ui=fs.readFileSync("components/landing/LandingActionCompletion.tsx","utf8");assert.ok(ui.includes('minWidth:44,minHeight:44'));assert.ok(ui.includes('pointerEvents="box-none"'));assert.ok(ui.includes('position:"absolute"'));
});


test("provider completion never implies the customer's personal completion",()=>{
 const e=action({type:"GO_BOOKING",bookingStatus:"completada",reservationId:"r"});assert.equal(core.awaitingCompletion(e,doc(),clock),true);
});
test("calendar Pending is driven by the explicit scoped response, not the clock",()=>{
 const src=fs.readFileSync("components/AgendaOperativa.tsx","utf8"),a=src.indexOf("function isOverdue(g: GoEntry)"),b=src.indexOf("\nfunction isInDay",a);
 const f=vm.runInNewContext(ts.transpileModule(src.slice(a,b)+"\nisOverdue",{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,{});
 for(const estado of ["pendiente","aceptado"])assert.equal(f(action({estado,dateISO:"2020-01-01"})),false);
 assert.equal(f(action({localResolutionStatus:"pending"})),true);assert.equal(f(action({localResolutionStatus:"done"})),false);
});
test("source registration is fail closed for foreign or unowned actions and preserves company scope",()=>{
 const f=storeFixture();f.api.setCompletionSource(S,[action({ownerUserId:"B"}),action({ownerUserId:undefined})]);assert.equal(f.api.getCompletionSource(S).length,0);
});
test("merged completion projections preserve the canonical reservation across legacy IDs without adopting another company or owner",()=>{
 const canonical=action({id:"go_booking_canonical",reservationId:"reservation-one",businessId:"company-one",notes:"Datos vigentes"});
 const legacy={...canonical,id:"go_booking_cli_legacy",notes:"Copia antigua",time:"10:00"};
 const foreignCompany={...legacy,id:"other-company",businessId:"company-two"};
 const foreignOwner={...legacy,id:"other-owner",ownerUserId:"B"};
 const unowned={...legacy,id:"unowned",ownerUserId:undefined};
 const base=[canonical],candidates=[legacy,foreignCompany,foreignOwner,unowned],before=JSON.stringify([base,candidates]);
 const result=core.mergeCompletionEntries(base,candidates);
 assert.equal(result.length,4);assert.equal(result[0],canonical);assert.equal(result[0].time,canonical.time);
 assert.equal(result[1],foreignCompany);assert.equal(result[2],foreignOwner);assert.equal(result[3],unowned);
 assert.equal(JSON.stringify([base,candidates]),before);assert.equal(unowned.ownerUserId,undefined);
 const go=action({id:"personal-go",notes:"Original"}),duplicate={...go,notes:"Candidate",ownerUserId:"B"};
 const mergedGo=core.mergeCompletionEntries([go],[duplicate]);assert.equal(mergedGo.length,1);assert.equal(mergedGo[0],go);
});
test("foreground cannot show a completion notification before end plus 30 minutes",async()=>{
 const f=storeFixture(),e=action({time:"15:00"});f.api.setCompletionSource(S,[e]);
 const policy=load("lib/goActionCompletionNotifications.ts",{"./goActionCompletion":core,"./goActionCompletionStore":f.api}).completionNotificationPolicy;
 assert.equal(await policy.present(S,{completionKey:core.completionKey(e),completionSchedule:core.completionSchedule(e)}),false);
});
test("all completion reminders share the existing OS capacity, permissions and cancellation protocol",async()=>{
 const f=storeFixture(),e=action();f.api.setCompletionSource(S,[e]);
 const policy=load("lib/goActionCompletionNotifications.ts",{"./goActionCompletion":core,"./goActionCompletionStore":f.api}).completionNotificationPolicy;
 const controller=load("lib/goNativeReminderScheduler.ts",{"./goNoteTools":load("lib/goNoteTools.ts"),"./goTaskAccess":{isPersonalTask:()=>false},"./goTaskReminders":{taskInScope:()=>false,reminderOffsets:()=>[],reminderTaskInstant:()=>clock}});
 const os=new Map(),calls=[],state={permission:"denied",user:"A"};
 const ports={platform:"ios",readTasks:async()=>[],readCompletionRequests:s=>policy.requests(s),scopeValid:async s=>state.user===s.userId,
   permissions:async()=>state.permission,now:()=>clock,pending:async()=>[...os.values()],delivered:async()=>[],
   cancel:async id=>{os.delete(id);},dismiss:async()=>{},schedule:async r=>{
    calls.push(r);os.set(r.identifier,{identifier:r.identifier,data:{taskId:r.taskId,minutes:r.minutes,signature:r.signature}});return r.identifier;}};
 const scheduler=controller.createNativeReminderScheduler(ports);
 let report=await scheduler.setScope(S);assert.ok(report.length);assert.ok(report.every(r=>r.status==="denied"));assert.equal(os.size,0);
 state.permission="allowed";report=await scheduler.refresh(S);assert.equal(report.length,8);assert.ok(report.every(r=>r.status==="scheduled"));assert.equal(os.size,8);
 await scheduler.refresh(S);assert.equal(calls.length,8,"no duplicates on repeated checks");
 await f.api.decideCompletion(S,e,"done",()=>true);await scheduler.refresh(S);assert.equal(os.size,0);
 await scheduler.setScope(null);assert.equal(os.size,0);
 const g=storeFixture();g.api.setCompletionSource(S,[e]);
 const p=load("lib/goActionCompletionNotifications.ts",{"./goActionCompletion":core,"./goActionCompletionStore":g.api}).completionNotificationPolicy;
 for(let i=0;i<63;i++)os.set("external-"+i,{identifier:"external-"+i,data:{}});
 const capped=controller.createNativeReminderScheduler({...ports,readCompletionRequests:s=>p.requests(s)});
 report=await capped.setScope(S);assert.equal(report.filter(r=>r.status==="scheduled").length,1);assert.equal(report.filter(r=>r.status==="capacity").length,7);assert.equal(os.size,64);
 await capped.setScope(B);assert.equal(os.size,63,"other-account schedules removed; unrelated native notices preserved");
});
test("confirmation area adapts its frame without moving protected content",()=>{
 const ui=load("components/landing/LandingActionCompletion.tsx",{
  react:{__esModule:true,default:{}}, "react-native":{},
  "react-native-safe-area-context":{}, "@/components/ui/GoCloseButton":{}, "@/lib/goActionCompletion":core});
 const closed=ui.completionFrame({width:390,left:0,right:0,safeTop:100,commandsTop:485,openHeight:250,open:false});
 const opened=ui.completionFrame({width:390,left:0,right:0,safeTop:100,commandsTop:485,openHeight:250,open:true});
 assert.ok(opened.y<=closed.y);assert.equal(closed.width,354);assert.ok(opened.y+opened.height<=485-250-8);
});
