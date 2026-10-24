import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';import {createRequire} from 'node:module';import path from 'node:path';
import lifecycle from './helpers/react-lifecycle.cjs';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
function find(n,p){if(p(n))return n;let r;ts.forEachChild(n,c=>{if(!r)r=find(c,p)});return r;}
const decl=name=>find(ast,n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name).getText(ast);
const compile=text=>ts.transpileModule(text,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText;
const helper={exports:{}};vm.runInNewContext(compile(fs.readFileSync('data/goEntryPresentation.ts','utf8')),helper);
const panels={exports:{}};vm.runInNewContext(compile(fs.readFileSync('components/landing/landingPanels.ts','utf8')),panels);
function fixture(){
 const calls=[],alerts=[],ref={current:null},context={exports:{},entryIsInternal:helper.exports.entryIsInternal,internalEntryCommand:helper.exports.internalEntryCommand,landingCurrentEntry:panels.exports.landingCurrentEntry,
  lang:'es',setLandingDetailsId:id=>calls.push(['detail',id]),setCalOpen:v=>calls.push(['calendar',v]),openBookingProposal:(...args)=>calls.push(['booking',...args]),
  showToast:(...args)=>calls.push(['toast',...args]),Alert:{alert:(...args)=>alerts.push(args)},_validateProposalSlot:()=>({valid:true}),calFlow:{open:draft=>{context.draft=draft;}},
  changeTask:async(...args)=>calls.push(['task',...args]),currentReceivedIdRef:ref,proposalReturnRef:{current:null},formatISODate(){throw Error('existing date is required')},getToday(){},sendSuggestChangeFromCal:result=>calls.push(['proposal',result]),softDeleteGo:id=>calls.push(['cancel',id])};
 vm.runInNewContext(compile(`const ${decl('openEntryChange')};const ${decl('cancelEntryFromDetails')};exports.open=openEntryChange;exports.cancel=cancelEntryFromDetails;`),context);
 return {context,calls,alerts,ref,api:context.exports};
}
const task={id:'one-task',ownerUserId:'owner',type:'TAREA_INTERNA',kind:'sent',direction:'self',contactName:'',phone:'',dateISO:'2035-01-07',date:'7 enero',time:'10:00',duration:'60',estado:'aceptado'};
test('internal action edits through existing task persistence, without proposal, acceptance or extra record',async()=>{
 const f=fixture(),original=JSON.stringify(task);f.api.open(task);assert.equal(f.context.draft.skipDuration,true);assert.equal(f.context.draft.initialDateISO,task.dateISO);
 f.context.draft.onSave({dateISO:'2035-01-08',time:'11:15'});await new Promise(resolve=>setImmediate(resolve));
 const writes=f.calls.filter(c=>c[0]==='task');assert.equal(writes.length,1);assert.equal(writes[0][1].owner,'owner');assert.equal(writes[0][1].command.operation,'update');assert.equal(writes[0][1].command.date,'2035-01-08');assert.equal(writes[0][2],task);assert.equal(writes[0][4],true);
 assert.equal(f.calls.filter(c=>['booking','proposal'].includes(c[0])).length,0);assert.equal(JSON.stringify(task),original);
});
test('unverified task ownership cannot be edited or deleted by the detail action',()=>{
 const f=fixture(),unknown={...task,ownerUserId:undefined};f.api.open(unknown);f.api.cancel(unknown);assert.equal(f.context.draft,undefined);assert.equal(f.calls.filter(c=>c[0]==='task').length,0);assert.equal(f.alerts.length,0);
});
test('internal task cancellation needs explicit confirmation and invokes the existing authorized task command once',async()=>{
 const f=fixture();f.api.cancel(task);assert.equal(f.calls.filter(c=>c[0]==='task').length,0);const buttons=f.alerts[0][2];buttons.find(b=>b.style==='destructive').onPress();await new Promise(resolve=>setImmediate(resolve));
 const writes=f.calls.filter(c=>c[0]==='task');assert.equal(writes.length,1);assert.equal(writes[0][1].command.operation,'delete');assert.equal(writes[0][2].id,task.id);
});
test('canonical customer and business details call the one existing booking proposal flow',()=>{
 for(const business of [false,true]){const f=fixture(),entry={...task,type:'GO_BOOKING',customerBooking:!business,businessBooking:business};f.api.open(entry);
 const call=f.calls.find(c=>c[0]==='booking');assert.ok(call);assert.equal(call[1],entry);assert.equal(call[2],business?'business':undefined);assert.equal(f.calls.filter(c=>c[0]==='task').length,0);}
});
test('shared task changes retain the original and delegate to the existing negotiated proposal callback',()=>{
 const f=fixture(),entry={...task,type:'TAREA',direction:'outgoing',phone:'+34600123456',contactName:'Contacto vinculado'},saved=JSON.stringify(entry);f.api.open(entry,'calendar');
 assert.equal(f.ref.current,entry.id);assert.equal(f.context.proposalReturnRef.current,'calendar');assert.equal(f.context.draft.initialDateISO,entry.dateISO);
 const proposal={dateISO:'2035-01-08',time:'12:30'};f.context.draft.onSave(proposal);assert.equal(f.calls.filter(c=>c[0]==='proposal').length,1);assert.equal(f.calls.filter(c=>c[0]==='task').length,0);assert.equal(JSON.stringify(entry),saved);
});

test('Landing details remain open across refreshed scope objects and close on actual profile or account changes',async()=>{
 const {React,createRoot,document,evaluate}=lifecycle;
 let userId='owner-one',view={loaded:true,isOwner:true,isAdminView:false,view:'USER'},capture;
 const listeners=new Set();
 const identity=evaluate('hooks/useAssistantZoneScope.ts',{
  '@/data/booking':{getAuthenticatedUserId:async()=>userId},
  '@/lib/sessionEvents':{onSessionChanged:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}},
  '@/contexts/GoViewContext':{useGoView:()=>view},
  '@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({checking:false})},
  '@/contexts/OwnerBusinessDemoContext':{useOwnerBusinessDemo:()=>({loaded:true,demo:{businessId:'business-one'}})},
 });
 const effect=find(ast,n=>ts.isCallExpression(n)&&n.expression.getText(ast)==='useEffect'&&n.arguments[0]?.getText(ast)==='() => { setLandingDetailsId(null); }');
 assert.ok(effect,'Exercise the actual Home detail close effect');
 const context={exports:{},React,useState:React.useState,useEffect:React.useEffect,useAssistantZoneScope:identity.useAssistantZoneScope,useGoView:()=>view,capture:value=>{capture=value;}};
 vm.runInNewContext(compile(`exports.Panel=function Panel(){const goView=useGoView(),completionIdentity=useAssistantZoneScope();const ${decl('[landingDetailsId, setLandingDetailsId]')};${effect.getText(ast)};capture({id:landingDetailsId,scope:completionIdentity.scope,open:setLandingDetailsId});return React.createElement('div',null,landingDetailsId);};`),context);
 const root=createRoot(document.createElement('div'));
 const settle=async operation=>React.act(async()=>{operation?.();for(let i=0;i<8;i++)await Promise.resolve();});
 const render=()=>root.render(React.createElement(context.exports.Panel));
 try{
  await settle(render);assert.equal(capture.scope.userId,userId);
  await settle(()=>capture.open('reservation-one'));assert.equal(capture.id,'reservation-one');
  for(let i=0;i<4;i++){const previous=capture.scope;await settle(render);assert.notEqual(capture.scope,previous);assert.equal(capture.id,'reservation-one');}
  view={...view,view:'BUSINESS'};await settle(render);assert.equal(capture.id,null);
  await settle(()=>capture.open('business-reservation'));assert.equal(capture.id,'business-reservation');
  view={...view,isAdminView:true,view:'ADMIN'};await settle(render);assert.equal(capture.id,null);
  await settle(()=>capture.open('admin-reservation'));assert.equal(capture.id,'admin-reservation');
  userId='owner-two';await settle(()=>{for(const listener of listeners)listener();});assert.equal(capture.id,null);assert.equal(capture.scope.userId,userId);
  await settle(()=>capture.open('second-owner-reservation'));assert.equal(capture.id,'second-owner-reservation');
  userId=null;await settle(()=>{for(const listener of listeners)listener();});assert.equal(capture.id,null);assert.equal(capture.scope,null);
 }finally{await settle(()=>root.unmount());assert.equal(listeners.size,0);}
});
