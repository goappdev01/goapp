import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import {createHash} from "node:crypto";
import {spawnSync} from "node:child_process";
import {createRequire} from "node:module";

const require=createRequire(path.join(process.cwd(),"package.json"));
const {React,createRoot,document,ts}=require("./tests/helpers/react-lifecycle.cjs");
const NOW=Date.parse("2030-01-07T14:00:00+01:00");
class Clock extends Date {constructor(...args){super(...(args.length?args:[NOW]));}static now(){return NOW;}}
const S={userId:"11111111-1111-4111-8111-111111111111",context:"live:USER"};
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText;
function load(file,imports={},reactCompiled=false){
 const context={exports:{},Error,Date:Clock,Intl,Map,Set,console,Promise,setTimeout,clearTimeout,setInterval,clearInterval,require:name=>{if(name in imports)return imports[name];if(name==="react/compiler-runtime")return require(name);throw Error("Unexpected import "+name);}};
  let source=fs.readFileSync(file,"utf8");
 if(reactCompiled){const expoRequire=createRequire(require.resolve("babel-preset-expo"));source=require("@babel/core").transformSync(source,{filename:file,babelrc:false,configFile:false,parserOpts:{sourceType:"module",plugins:["typescript","jsx"]},plugins:[[expoRequire("babel-plugin-react-compiler"),{target:"19"}]]}).code;}
 vm.runInNewContext(compile(source),context,{filename:file});return context.exports;
}
const core=load("lib/goActionCompletion.ts");
const entry=i=>({id:"task-"+i,type:"TAREA_INTERNA",kind:"sent",ownerUserId:S.userId,actionContext:S.context,dateISO:"2030-01-07",date:"Lunes 7",time:"09:00",duration:"30min",estado:"aceptado",intentLabel:"Tarea",notes:"Tarea "+i});
const deferred=()=>{let resolve;const promise=new Promise(done=>resolve=done);return {promise,resolve};};
const plain=value=>JSON.parse(JSON.stringify(value));

async function fixture({blocked=true,failTask=0,fontScale=1,width=390,nativeFailure=false,lang="es",failEveryWrite=false,reactCompiled=false}={}){
 const base=process.env.GO_COMPLETION_TEST_DIR || os.tmpdir();fs.mkdirSync(base,{recursive:true});
 const dir=fs.mkdtempSync(path.join(base,"go-completion-")),gate=deferred(),nativeGate=deferred();
 let writesOpen=!blocked,writable=!failEveryWrite,failed=false,scope={...S},model,force,refreshes=0;
 const buttons=new Map(),writes=[],attempts=[],proposals=[],entries=Array.from({length:7},(_,i)=>entry(i+1));
 const fileFor=key=>path.join(dir,createHash("sha256").update(key).digest("hex")+".json");
 const readFile=key=>fs.existsSync(fileFor(key))?fs.readFileSync(fileFor(key),"utf8"):null;
 const storage={
  async getItem(key){return readFile(key);},
  async setItem(key,value){
   const next=JSON.parse(value),previous=JSON.parse(readFile(key)||'{"records":{}}');
   const changed=Object.keys(next.records).filter(id=>JSON.stringify(next.records[id])!==JSON.stringify(previous.records[id]));
   attempts.push({key,changed});if(!writesOpen)await gate.promise;
   if(!writable)throw Error("Almacenamiento de prueba temporalmente no disponible");
   if(failTask && !failed && next.records[core.completionKey(entries[failTask-1])] && !previous.records[core.completionKey(entries[failTask-1])]){failed=true;throw Error("Disco de prueba temporalmente no disponible");}
   const tmp=fileFor(key)+".tmp";fs.writeFileSync(tmp,value);fs.renameSync(tmp,fileFor(key));writes.push({key,changed});
  }
 };
 const access={getTaskUser:async()=>scope.userId};
 const store=load("lib/goActionCompletionStore.ts",{"./goActionCompletion":core,"./goTaskAccess":access,"@react-native-async-storage/async-storage":{__esModule:true,default:storage}});
 const runtime={registerActionCompletionRuntime:()=>()=>{},refreshNativeTaskReminders:async()=>[],refreshActiveNativeTaskReminders:()=>{
  refreshes++;return nativeFailure?Promise.reject(Error("OS notification failure")):nativeGate.promise;
 }};
 const native={AppState:{addEventListener:()=>({remove(){}})},Platform:{OS:"ios"},PixelRatio:{getFontScale:()=>fontScale}};
 const hook=load("hooks/useActionCompletion.ts",{
  react:React,"react-native":native,"@/hooks/useAssistantZoneScope":{useAssistantZoneScope:()=>({ready:true,scope})},
  "@/contexts/OwnerBusinessDemoContext":{useOwnerBusinessDemo:()=>({demo:null,catalog:null})},
  "@/data/demoBookingRepository":{createDemoBookingRepository(){throw Error("No DEMO writes");},createDemoCatalogBookingRepository(){throw Error("No DEMO writes");}},
  "@/lib/goActionCompletionStore":store,"@/lib/goActionCompletion":core,"@/lib/goTaskReminderRuntime":runtime,
  "@/lib/goActionCompletionNotifications":{completionNotificationPolicy:{}}
 },reactCompiled);
 const box=name=>({children})=>React.createElement("div",{"data-native":name},children);
 for(const name of ["View","Text","ScrollView","KeyboardAvoidingView"])native[name]=box(name);
 native.TextInput=()=>React.createElement("input");
 native.Switch=()=>React.createElement("input");
 native.Modal=({visible,children})=>visible?React.createElement("div",null,children):null;
 native.TouchableOpacity=props=>{
  const label=props.accessibilityLabel;
  React.useLayoutEffect(()=>{if(label)buttons.set(label,props);return()=>{if(buttons.get(label)===props)buttons.delete(label);};},[props]);
  return React.createElement("button",{disabled:props.disabled,onClick:props.onPress},props.children);
 };
 const ui=load("components/landing/LandingActionCompletion.tsx",{
  react:React,"react-native":native,"react-native-safe-area-context":{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
  "@/components/ui/GoCloseButton":{GoCloseButton:box("GoCloseButton")},"@/lib/goActionCompletion":core
 });
 const settle=async action=>React.act(async()=>{await action?.();for(let i=0;i<12;i++)await new Promise(done=>setImmediate(done));});
 function Fixture(){const [,update]=React.useState(0);force=update;model=hook.useActionCompletion(entries);return React.createElement(ui.LandingActionCompletion,{model,frame:{x:18,y:100,width:width-36,height:280},availableWidth:width,lang,onPendingList(){},onPropose:e=>proposals.push({...e})});}
 const root=createRoot(document.createElement("div"));await settle(()=>root.render(React.createElement(Fixture)));
 const freshStore=()=>load("lib/goActionCompletionStore.ts",{"./goActionCompletion":core,"./goTaskAccess":access,"@react-native-async-storage/async-storage":{__esModule:true,default:storage}});
 return {get model(){return model},entries,buttons,writes,attempts,proposals,dir,fileFor,store,freshStore,ui,settle,get refreshes(){return refreshes},
  async press(label){const button=buttons.get(label);assert.ok(button,"Missing "+label);assert.ok(!button.disabled,label+" must be available");await settle(()=>{button.onPress();});},
  async release(){writesOpen=true;gate.resolve();await settle();},
  restoreStorage(){writable=true;},
  async switchScope(value){scope=value;await settle(()=>force(n=>n+1));},
  async finish(){await settle();assert.equal(model.savingCount,0);},
  async close(){writesOpen=true;gate.resolve();nativeGate.resolve([]);await settle(()=>root.unmount());},
 };
}

for(const status of ["done","pending"]){
 test("seven rapid "+status+" decisions advance before storage/native acknowledgement and persist once on disk",async t=>{
  const f=await fixture();const before=JSON.stringify(f.entries),started=performance.now();
  try{
   const label=status==="done"?"REALIZADO":"PENDIENTE";
   for(let i=0;i<7;i++){
    assert.equal(f.model.unresolved.find(e=>e.id===f.model.selected)?.id || f.model.unresolved[0]?.id,"task-"+(i+1));
    await f.press(label);assert.equal(f.model.unresolved.length,6-i);assert.equal(f.model.savingCount,i+1);
    assert.equal(Object.keys(f.model.doc.records).length,0,"no storage acknowledgement has been released");
   }
   t.diagnostic("Seven "+status+" presses accepted in "+(performance.now()-started).toFixed(1)+" ms with storage blocked.");
   assert.equal(f.writes.length,0);await f.release();await f.finish();
   assert.equal(f.refreshes,1,"native notification refresh is coalesced after the batch");
   assert.equal(f.writes.length,7);assert.equal(f.model.failedDecisions.length,0);assert.equal(JSON.stringify(f.entries),before);
   const persisted=await f.freshStore().readCompletionDocument(S);
   assert.equal(Object.keys(persisted.records).length,7);
   for(const e of f.entries){const record=persisted.records[core.completionKey(e)];assert.equal(record.decision.status,status);assert.equal(record.history.length,1);assert.equal(record.decision.at,NOW);}
   const child=spawnSync(process.execPath,["-e",'const fs=require("fs");const d=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));if(Object.keys(d.records).length!==7||Object.values(d.records).some(r=>r.history.length!==1))process.exit(2);console.log("7 distinct persisted histories survive a fresh process");',f.fileFor(core.completionStorageKey(S))],{encoding:"utf8"});
   assert.equal(child.status,0,child.stderr);t.diagnostic(child.stdout.trim());t.diagnostic("Real test storage: "+f.fileFor(core.completionStorageKey(S)));
  }finally{await f.close();}
 });
}

test("mixed decisions and a repeated stale tap retain their own identity and one history per task",async()=>{
 const f=await fixture();try{
  const first=f.model.unresolved[0];let a,b;
  await f.settle(()=>{a=f.model.decide(first,"done");b=f.model.decide(first,"done");});
  assert.equal(a,b);assert.equal(f.model.savingCount,1);
  for(let i=1;i<7;i++)await f.press(i%2?"PENDIENTE":"REALIZADO");
  await f.release();await Promise.all([a,b]);await f.finish();
  const persisted=await f.freshStore().readCompletionDocument(S);
  for(let i=0;i<7;i++){const r=persisted.records[core.completionKey(f.entries[i])];assert.equal(r.decision.status,i%2?"pending":"done");assert.equal(r.history.length,1);}
  assert.equal(f.writes.length,7);
 }finally{await f.close();}
});

test("a failed third write is recoverable by task; the other six survive and retry cannot duplicate histories",async()=>{
 const f=await fixture({failTask:3});try{
  for(let i=0;i<7;i++)await f.press("REALIZADO");
  await f.release();await f.finish();
  assert.equal(f.model.failedDecisions.length,1);assert.equal(f.model.failedDecisions[0].entry.id,"task-3");
  assert.equal(f.model.failedDecisions[0].status,"done");assert.match(f.model.failedDecisions[0].message,/Disco/);
  let persisted=await f.freshStore().readCompletionDocument(S);assert.equal(Object.keys(persisted.records).length,6);
  assert.equal(persisted.records[core.completionKey(f.entries[2])],undefined);
  const retry=f.buttons.get("Reintentar guardado de Tarea 3");assert.ok(retry);
  await f.settle(()=>{retry.onPress();retry.onPress();});await f.finish();
  persisted=await f.freshStore().readCompletionDocument(S);assert.equal(Object.keys(persisted.records).length,7);assert.equal(f.model.failedDecisions.length,0);
  for(const e of f.entries)assert.equal(persisted.records[core.completionKey(e)].history.length,1);
  assert.equal(f.writes.length,7);
 }finally{await f.close();}
});

test("proposal remains immediately available during other saves and only opens the existing draft for its own task",async()=>{
 const f=await fixture();try{
  await f.press("REALIZADO");await f.press("PENDIENTE");const target=f.model.unresolved[0],before=JSON.stringify(f.model.doc);
  await f.press("PROPONER CAMBIO");
  assert.equal(f.proposals.length,1);assert.equal(f.proposals[0].id,target.id);assert.equal(f.model.unresolved[0].id,target.id);
  assert.equal(JSON.stringify(f.model.doc),before);assert.equal(f.model.savingCount,2);assert.equal(target.changeProposal,undefined);
  assert.equal(f.writes.length,0);await f.release();await f.finish();
  const persisted=await f.freshStore().readCompletionDocument(S);
  assert.equal(Object.keys(persisted.records).length,2);assert.equal(persisted.records[core.completionKey(target)],undefined);
 }finally{await f.close();}
});

test("switching participant/context never exposes another participant's queued decisions or writes their document",async()=>{
 const f=await fixture();try{
  for(let i=0;i<7;i++)await f.press("REALIZADO");
  const B={userId:"22222222-2222-4222-8222-222222222222",context:"live:USER"};
  await f.switchScope(B);assert.equal(f.model.savingCount,0);assert.equal(f.model.failedDecisions.length,0);assert.equal(f.model.unresolved.length,0);
  await f.release();assert.equal(f.writes.some(w=>w.key===core.completionStorageKey(B)),false);
  assert.equal(Object.keys((await f.freshStore().readCompletionDocument(B)).records).length,0);
  await f.switchScope(S);assert.ok(f.model.failedDecisions.length>=6,"uncommitted old-scope decisions remain available for recovery");
 }finally{await f.close();}
});

test("notification failure after persistence never rolls back or falsely reports a failed save",async()=>{
 const f=await fixture({blocked:false,nativeFailure:true});try{
  await f.press("REALIZADO");await f.finish();assert.equal(f.model.failedDecisions.length,0);
  assert.equal(core.completionDecision(f.entries[0],await f.freshStore().readCompletionDocument(S)).status,"done");
  assert.match(f.model.feedback,/Decisiones guardadas/);
 }finally{await f.close();}
});

test("ES/EN decision labels remain whole, centered and accessible; square controls adapt only their own area",async()=>{
 for(const lang of ["es","en"])for(const width of [320,390,430])for(const fontScale of [1,1.3,2,3]){
  const f=await fixture({width,fontScale,lang});try{
   const layout=f.ui.completionDecisionLayout(width-52,fontScale);
   assert.ok(layout.columns>=1&&layout.columns<=3);assert.ok(layout.side>=44);assert.ok(layout.side*layout.columns+8*(layout.columns-1)<=width-52+.001);
   for(const label of lang==="es"?["REALIZADO","PENDIENTE","PROPONER CAMBIO"]:["DONE","PENDING","PROPOSE CHANGE"]){
    const props=f.buttons.get(label);assert.ok(props,label);assert.equal(props.style.width,props.style.height);assert.ok(props.style.minHeight>=44);
    const text=props.children.props;assert.equal(text.style.textAlign,"center");assert.equal(text.style.width,"100%");assert.equal(text.adjustsFontSizeToFit,true);
    assert.equal(text.numberOfLines,label.includes(" ")?2:1);assert.equal(text.children,label.replace(" ","\n"));
   }
  }finally{await f.close();}
 }
});


test("seven instant save failures never block following tasks and every captured decision can be recovered",async()=>{
 const f=await fixture({blocked:false,failEveryWrite:true,nativeFailure:true});try{
  for(let i=0;i<7;i++){await f.press(i%2?"PENDIENTE":"REALIZADO");assert.equal(f.model.unresolved.length,6-i);}
  assert.equal(f.model.failedDecisions.length,7);assert.equal(f.writes.length,0);assert.equal(Object.keys(f.model.doc.records).length,0);
  assert.doesNotMatch(f.model.feedback,/Decisiones guardadas/);f.restoreStorage();
  for(let i=0;i<7;i++)await f.press("Reintentar guardado de Tarea "+(i+1));
  await f.finish();const persisted=await f.freshStore().readCompletionDocument(S);assert.equal(f.model.failedDecisions.length,0);assert.equal(f.writes.length,7);
  for(let i=0;i<7;i++){const record=persisted.records[core.completionKey(f.entries[i])];assert.equal(record.decision.status,i%2?"pending":"done");assert.equal(record.history.length,1);}
 }finally{await f.close();}
});

test("the production React Compiler path also accepts seven rapid decisions before native acknowledgement",async()=>{
 for(const status of ["done","pending"]){const f=await fixture({reactCompiled:true});try{
  for(let i=0;i<7;i++)await f.press(status==="done"?"REALIZADO":"PENDIENTE");
  assert.equal(f.model.savingCount,7);assert.equal(f.model.unresolved.length,0);assert.equal(f.writes.length,0);
  await f.release();await f.finish();const persisted=await f.freshStore().readCompletionDocument(S);
  for(const e of f.entries){const record=persisted.records[core.completionKey(e)];assert.equal(record.decision.status,status);assert.equal(record.history.length,1);}
 }finally{await f.close();}}
});
