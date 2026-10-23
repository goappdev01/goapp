import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
process.env.TZ="Europe/Madrid";
const ts=createRequire(import.meta.url)("typescript");
class Clock extends Date {constructor(...args){super(...(args.length?args:["2026-10-12T12:00:00+02:00"]));}static now(){return new Clock().getTime();}}
function load(file,modules){const c={exports:{},Date:Clock,Intl,console,require:k=>{if(k in modules)return modules[k];throw Error("Unexpected import "+k);}};vm.runInNewContext(ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,c);return c.exports;}
const scope={userId:"A",context:"demo:USER"};
const task=()=>({id:"buy",kind:"sent",type:"TAREA_INTERNA",ownerUserId:"A",taskContext:"demo:USER",notes:"Hacer la compra",dateISO:"2026-10-13",time:"17:00",reminders:[60],estado:"pendiente"});
function fixture(){let rows=[task()],user="A",mode="sound",global="on",permission={granted:true,canAskAgain:true,ios:{status:2,allowsSound:true,allowsAlert:true}},failCancel=false,request=0,preferenceWait=null;
 const os=new Map(),shown=new Map(),calls=[],focus=[];
 const storage={async multiGet(){if(preferenceWait)await preferenceWait;return[["go_alert_mode_v1",mode],["go_notif_enabled_v1",global]];}};
 const access=load("lib/goTaskAccess.ts",{"@/data/booking":{async getAuthenticatedUserId(){return user;}}});
 const reminders=load("lib/goTaskReminders.ts",{"@workspace/api-zod":{},"./goLogBridge":{},"./goTaskAccess":access});
 const scheduler=load("lib/goNativeReminderScheduler.ts",{"./goTaskAccess":access,"./goTaskReminders":reminders,"./goNoteTools":load("lib/goNoteTools.ts",{})});
 const native={IosAuthorizationStatus:{AUTHORIZED:2,PROVISIONAL:3,EPHEMERAL:4},SchedulableTriggerInputTypes:{DATE:"date"},AndroidImportance:{HIGH:4},async getPermissionsAsync(){return permission;},async requestPermissionsAsync(){request++;return permission;},async getAllScheduledNotificationsAsync(){return[...os.values()];},async getPresentedNotificationsAsync(){return[...shown.values()];},async scheduleNotificationAsync(r){calls.push(["schedule",r]);os.set(r.identifier,{identifier:r.identifier,content:r.content});return r.identifier;},async cancelScheduledNotificationAsync(id){calls.push(["cancel",id]);if(failCancel)throw Error("Native unavailable");os.delete(id);},async dismissNotificationAsync(id){shown.delete(id);}};
 const adapter=load("lib/goNativeNotificationAdapter.ts",{"react-native":{Platform:{OS:"ios"}},"expo-notifications":native});
 const bridge=load("lib/goTaskNotificationFocus.ts",{});bridge.onTaskNotificationFocus(v=>focus.push(v));
 const store={async readGoLog(){return JSON.parse(JSON.stringify(rows));}};
 function newRuntime(){return load("lib/goTaskReminderRuntime.ts",{"@react-native-async-storage/async-storage":{default:storage},"./goLogStore":store,"./goNoteTools":load("lib/goNoteTools.ts",{}),"./goTaskAccess":access,"./goTaskReminders":reminders,"./goNativeReminderScheduler":scheduler,"./goNativeNotificationAdapter":adapter,"./goTaskNotificationFocus":bridge});}
 const runtime=newRuntime();
 return{runtime,newRuntime,os,calls,native,focus,rows,update(value){rows=value;},user(value){user=value;},silent(){global="off";},permission(value){permission=value;},failCancel(value){failCancel=value;},wait(value){preferenceWait=value;},get requested(){return request;}};
}
test("assembled runtime registers mandatory 13 Oct 16:00 native request and a restart reuses stable OS identifier",async()=>{const f=fixture();const report=await f.runtime.setNativeTaskReminderScope(scope,"sound");assert.equal(report[0].status,"scheduled");assert.equal(f.os.size,1);const r=[...f.os.values()][0];assert.equal(f.calls.at(-1)[1].trigger.date,new Clock("2026-10-13T16:00:00+02:00").getTime());assert.equal(r.content.data.taskId,"buy");await f.runtime.refreshNativeTaskReminders(scope);assert.equal(f.calls.filter(x=>x[0]==="schedule").length,1);const restarted=f.newRuntime();await restarted.setNativeTaskReminderScope(scope,"sound");assert.equal(f.os.size,1);assert.equal([...f.os.keys()][0],r.identifier);});
test("task hour modification replaces existing OS schedule and removal cancels it",async()=>{const f=fixture();await f.runtime.setNativeTaskReminderScope(scope,"sound");const id=[...f.os.keys()][0];f.update([{...task(),time:"18:00"}]);const report=await f.runtime.refreshNativeTaskReminders(scope);assert.equal(report[0].at,new Clock("2026-10-13T17:00:00+02:00").getTime());assert.equal([...f.os.keys()][0],id);assert.equal(f.os.size,1);f.update([{...task(),reminders:[],notificationsEnabled:false}]);await f.runtime.refreshNativeTaskReminders(scope);assert.equal(f.os.size,0);});
test("persisted global off never creates a transient schedule at startup",async()=>{const f=fixture();f.silent();const report=await f.runtime.setNativeTaskReminderScope(scope,"sound");assert.equal(report[0].status,"muted");assert.equal(f.os.size,0);assert.equal(f.calls.some(x=>x[0]==="schedule"),false);});
test("permission denied persists task association without falsely scheduling; only explicit reminder asks",async()=>{const f=fixture();f.permission({granted:false,canAskAgain:true,ios:{status:1}});const report=await f.runtime.setNativeTaskReminderScope(scope,"sound");assert.equal(report[0].status,"denied");assert.equal(f.os.size,0);assert.equal(f.requested,0);await f.runtime.refreshNativeTaskReminders(scope,true);assert.equal(f.requested,1);f.permission({granted:true,canAskAgain:false,ios:{status:2}});assert.equal((await f.runtime.refreshNativeTaskReminders(scope))[0].status,"scheduled");});
test("logout cancels private schedules and prevents tap/readback from previous account",async()=>{const f=fixture();await f.runtime.setNativeTaskReminderScope(scope,"sound");const data=[...f.os.values()][0].content.data;await f.runtime.suspendNativeTaskReminders();assert.equal(f.os.size,0);f.user("B");await f.runtime.setNativeTaskReminderScope({userId:"B",context:"demo:USER"},"sound");assert.equal(await f.runtime.openNativeReminderTask(data),false);assert.equal(f.focus.length,0);assert.equal(f.os.size,0);});
test("business DEMO scope switches cancel user scope and cannot adopt its task",async()=>{const f=fixture();await f.runtime.setNativeTaskReminderScope(scope,"sound");await f.runtime.setNativeTaskReminderScope({userId:"A",context:"demo:BUSINESS:one"},"sound");assert.equal(f.os.size,0);assert.equal(await f.runtime.canPresentNativeTaskReminder({goTaskReminder:true,...scope}),false);});
test("tap validates active identity and focuses original task; deleted/missing/duplicate records never open",async()=>{const f=fixture();await f.runtime.setNativeTaskReminderScope(scope,"sound");const data=[...f.os.values()][0].content.data;assert.equal(await f.runtime.openNativeReminderTask(data),true);assert.equal(f.focus[0].task.id,"buy");assert.equal(await f.runtime.openNativeReminderTask({...data,userId:"B"}),false);f.update([{...task(),deleted:true}]);assert.equal(await f.runtime.openNativeReminderTask(data),false);f.update([task(),task()]);assert.equal(await f.runtime.openNativeReminderTask(data),false);});
test("native cancellation failure blocks logout completion and is not reported as success",async()=>{const f=fixture();await f.runtime.setNativeTaskReminderScope(scope,"sound");f.failCancel(true);await assert.rejects(f.runtime.suspendNativeTaskReminders(),/cancelar/);assert.equal(f.runtime.isNativeTaskScopeActive(scope),false);f.failCancel(false);await f.runtime.suspendNativeTaskReminders();assert.equal(f.os.size,0);});
test("logout during preference loading fences delayed activation and never resurrects requests",async()=>{const f=fixture();let release;f.wait(new Promise(resolve=>{release=resolve;}));const opening=f.runtime.setNativeTaskReminderScope(scope,"sound");await new Promise(resolve=>setImmediate(resolve));await f.runtime.suspendNativeTaskReminders();release();await opening;assert.equal(f.os.size,0);assert.equal(f.calls.some(x=>x[0]==="schedule"),false);});

test("linked GO alerts share the native queue; unlinking rejects obsolete delivery without blocking valid GO alerts",async()=>{
 const f=fixture();const linked={...task(),type:"GO",attachedNote:"Nota",reminders:[60,15],goAttachedNoteReminder:{version:1,minutes:15,shared:false}};
 f.update([linked]);await f.runtime.setNativeTaskReminderScope(scope,"sound");assert.equal(f.os.size,2);
 const reminders=[...f.os.values()].map(row=>row.content.data),note=reminders.find(row=>row.minutes===15),go=reminders.find(row=>row.minutes===60);
 assert.equal(await f.runtime.canPresentNativeTaskReminder(note),true);assert.equal(await f.runtime.canPresentNativeTaskReminder(go),true);
 f.update([{...linked,attachedNote:undefined}]);assert.equal(await f.runtime.canPresentNativeTaskReminder(note),false);assert.equal(await f.runtime.canPresentNativeTaskReminder(go),true);
 await f.runtime.refreshNativeTaskReminders(scope);assert.equal(f.os.size,1);assert.equal([...f.os.values()][0].content.data.minutes,60);
});
test("unlinking a shared GO alert preserves one valid delivery and preserves the original GO focus",async()=>{
 const f=fixture();const linked={...task(),type:"GO",attachedNote:"Nota",goAttachedNoteReminder:{version:1,minutes:60,shared:true}};
 f.update([linked]);await f.runtime.setNativeTaskReminderScope(scope,"sound");const data=[...f.os.values()][0].content.data;
 f.update([{...linked,attachedNote:""}]);await f.runtime.refreshNativeTaskReminders(scope);assert.equal(f.os.size,1);
 assert.equal(await f.runtime.canPresentNativeTaskReminder(data),true);assert.equal(await f.runtime.openNativeReminderTask(data),true);assert.equal(f.focus[0].task.id,linked.id);
});

function completionRequest(expected=scope){
 const at=new Clock("2026-10-13T18:30:00+02:00").getTime();
 return {identifier:"go-task-reminder-v1:"+encodeURIComponent(JSON.stringify([expected.userId,expected.context,"completion:buy",at])),
  taskId:"buy",minutes:0,at,scope:{...expected},title:"GO · ¿Has finalizado esta acción?",sound:true,signature:"",
  completion:{key:"buy",schedule:"confirmed-slot"}};
}
test("shared note/GO reminder and completion notice coexist in one native queue without duplicate refreshes",async()=>{
 const f=fixture(),linked={...task(),type:"GO",attachedNote:"Nota",goAttachedNoteReminder:{version:1,minutes:60,shared:true}};
 f.update([linked]);const request=completionRequest();
 f.runtime.registerActionCompletionRuntime({async requests(){return[request];},async present(){return true;},async open(){return true;}});
 await f.runtime.setNativeTaskReminderScope(scope,"sound");await f.runtime.refreshNativeTaskReminders(scope);
 assert.equal(f.os.size,2);assert.equal(f.calls.filter(row=>row[0]==="schedule").length,2);
 const payloads=[...f.os.values()].map(row=>row.content.data),completion=payloads.find(data=>data.goActionCompletion),note=payloads.find(data=>!data.goActionCompletion);
 assert.equal(completion.completionKey,"buy");assert.equal(note.minutes,60);
 assert.equal(await f.runtime.canPresentNativeTaskReminder(note),true);assert.equal(await f.runtime.canPresentNativeTaskReminder(completion),true);
 f.update([{...linked,attachedNote:""}]);await f.runtime.refreshNativeTaskReminders(scope);
 assert.equal(f.os.size,2);assert.equal(f.calls.filter(row=>row[0]==="schedule").length,2);
});
test("removing a note-only alert preserves completion; resolving completion preserves an independent GO alert",async()=>{
 const f=fixture(),linked={...task(),type:"GO",attachedNote:"Nota",reminders:[60,15],goAttachedNoteReminder:{version:1,minutes:15,shared:false}};
 let unresolved=true;f.update([linked]);
 f.runtime.registerActionCompletionRuntime({async requests(){return unresolved?[completionRequest()]:[];},async present(){return unresolved;},async open(){return unresolved;}});
 await f.runtime.setNativeTaskReminderScope(scope,"sound");assert.equal(f.os.size,3);
 f.update([{...linked,attachedNote:undefined}]);await f.runtime.refreshNativeTaskReminders(scope);
 assert.equal(f.os.size,2);assert.equal([...f.os.values()].some(row=>row.content.data.minutes===15),false);
 assert.equal([...f.os.values()].some(row=>row.content.data.goActionCompletion),true);
 unresolved=false;await f.runtime.refreshNativeTaskReminders(scope);
 assert.equal(f.os.size,1);assert.equal([...f.os.values()][0].content.data.minutes,60);
 assert.equal([...f.os.values()][0].content.data.goActionCompletion,undefined);
});
test("completion policy cannot present/open across account changes and stale cleanup cannot remove a newer policy",async()=>{
 const f=fixture();let firstOpens=0,secondOpens=0;
 const unregister=f.runtime.registerActionCompletionRuntime({async requests(){return[completionRequest()];},async present(){return true;},async open(){firstOpens++;return true;}});
 f.runtime.registerActionCompletionRuntime({async requests(){return[completionRequest()];},async present(){return true;},async open(){secondOpens++;return true;}});
 unregister();await f.runtime.setNativeTaskReminderScope(scope,"sound");
 const data=[...f.os.values()].find(row=>row.content.data.goActionCompletion).content.data;
 assert.equal(await f.runtime.openNativeReminderTask(data),true);assert.equal(firstOpens,0);assert.equal(secondOpens,1);
 f.user("B");assert.equal(await f.runtime.openNativeReminderTask(data),false);assert.equal(await f.runtime.canPresentNativeTaskReminder(data),false);
 assert.equal(secondOpens,1);await f.runtime.suspendNativeTaskReminders();assert.equal(f.os.size,0);
});
