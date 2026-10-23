import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';import path from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
process.env.TZ='Europe/Madrid';
let now=Date.parse('2030-01-07T12:00:00+01:00');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
function load(file,modules={}){const context={exports:{},Date:Clock,Intl,Map,Set,console,require:n=>{if(n in modules)return modules[n];throw Error('Unexpected dependency '+n);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText,context);return context.exports;}
const core=load('lib/goActionCompletion.ts'),plain=x=>JSON.parse(JSON.stringify(x));
const S={userId:'11111111-1111-4111-8111-111111111111',context:'live:USER'},entry=(extra={})=>({id:'one',ownerUserId:'11111111-1111-4111-8111-111111111111',actionContext:'live:USER',dateISO:'2030-01-07',date:'Lunes 7',time:'09:00',duration:'30min',estado:'aceptado',intentLabel:'Cita',notes:'Revisión',...extra});
function storageFixture(memory=new Map()){
 let user='11111111-1111-4111-8111-111111111111';const writes=[];
 const api=load('lib/goActionCompletionStore.ts',{'./goActionCompletion':core,'./goTaskAccess':{getTaskUser:async()=>user},'@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>{memory.set(k,v);writes.push(k);}}}});
 return{api,memory,writes,user:v=>user=v};
}
test('midnight and explicit overnight END trigger at exactly end plus 30 minutes',()=>{
 for(const extra of [{time:'23:45',duration:'30m'},{time:'23:45',endTime:'00:15'},{time:'23:45',startDatetime:'2030-01-07T23:45:00+01:00',endDatetime:'2030-01-08T00:15:00+01:00'}]){
  const e=entry(extra),doc=core.emptyCompletionDocument(S),due=Date.parse('2030-01-08T00:45:00+01:00');
  assert.equal(core.plannedActionEnd(e),due-1800000);assert.equal(core.awaitingCompletion(e,doc,due-1),false);assert.equal(core.awaitingCompletion(e,doc,due),true);assert.equal(e.estado,'aceptado');
 }
 assert.equal(core.plannedActionEnd(entry({endTime:'09:00'})),null,'equal endpoints do not invent a 24-hour appointment');
});
test('DST gaps/folds need an unambiguous timestamp; default duration does not change source records',()=>{
 for(const dateISO of ['2026-03-29','2026-10-25'])assert.equal(core.plannedActionEnd(entry({dateISO,time:'02:30'})),null);
 const e=entry({duration:''}),saved=JSON.stringify(e),doc=core.emptyCompletionDocument(S);doc.preferences.defaultDurationMinutes=17;
 assert.equal(core.plannedActionEnd(e,doc.preferences.defaultDurationMinutes),Date.parse('2030-01-07T09:17:00+01:00'));assert.equal(JSON.stringify(e),saved);
});
test('a future action cannot be marked by a stale confirmation UI',async()=>{
 const f=storageFixture(),e=entry({dateISO:'2030-01-08'});f.api.setCompletionSource(S,[e]);
 await assert.rejects(f.api.decideCompletion(S,e,'done',()=>true),/todavía/);assert.equal(f.writes.length,0);
});
test('persistent personal history survives a fresh runtime and keeps other actions unresolved',async()=>{
 const f=storageFixture(),a=entry(),b=entry({id:'two'});f.api.setCompletionSource(S,[a,b]);
 await f.api.decideCompletion(S,a,'pending',()=>true);await f.api.updateCompletionDocument(S,()=>true,doc=>({...doc,preferences:{defaultDurationMinutes:45,reminderMinutes:1020,pendingAlerts:false}}));
 const reopened=storageFixture(f.memory),doc=await reopened.api.readCompletionDocument(S);
 assert.equal(core.pendingCompletion(a,doc),true);assert.equal(core.awaitingCompletion(b,doc,now),true);assert.equal(doc.preferences.reminderMinutes,1020);assert.equal(doc.preferences.pendingAlerts,false);assert.equal(doc.records[core.completionKey(a)].history.length,1);
 reopened.api.setCompletionSource(S,[a,b]);await reopened.api.decideCompletion(S,a,'done',()=>true);
 assert.equal(core.completionDecision(a,await reopened.api.readCompletionDocument(S)).status,'done');assert.equal(a.estado,'aceptado');
});
test('invalid persisted settings/decisions fail closed without deleting or overwriting data',async()=>{
 for(const record of [{history:[],reminderMinutes:-1},{history:[],alerts:'yes'},{history:[],decision:{status:'done',at:now}},{history:[],remindAt:NaN}]){
  const f=storageFixture(),doc=core.emptyCompletionDocument(S);doc.records[core.completionKey(entry())]=record;const raw=JSON.stringify(doc);f.memory.set(core.completionStorageKey(S),raw);
  await assert.rejects(f.api.readCompletionDocument(S));assert.equal(f.memory.get(core.completionStorageKey(S)),raw);assert.equal(f.writes.length,0);
 }
});

const storeModule=load('data/businessDemoStore.ts'),services=load('data/bookingServices.ts');
const repoModule=load('data/demoBookingRepository.ts',{'./businessDemoStore':storeModule,'./bookingServices':services});
const initial={businessName:'',address:'',cartaUrl:'',sectorId:null,subId:null,plantillaItems:[],activeDays:[],openFrom:'09:00',openTo:'18:00',daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false,staffSchedules:{}};
async function demoFixture(companyId='one'){
 companyId=companyId==='one'?'33333333-3333-4333-8333-333333333333':'44444444-4444-4444-8444-444444444444';
 const memory=new Map(),make=()=>storeModule.createBusinessDemoStore({ownerUserId:'11111111-1111-4111-8111-111111111111',companyId,storage:{getItem:async k=>memory.get(k)??null,setItem:async(k,v)=>memory.set(k,v)},canUse:()=>true,initialConfig:initial}),store=make();
 await store.updateConfig({businessName:'DEMO '+companyId,address:'Dirección ficticia',sectorId:'belleza',subId:'peluqueria',activeDays:[0,1,2,3,4],services:[{name:'Corte',duration:30,price:10},{name:'Tinte',duration:60,price:20}],plantillaItems:[{id:'staff',count:1,label:'Puesto',staffNames:['Profesional']}],completedSteps:[0,1,2,3,4,5,6,7]});
 await store.saveFloorPlan({id:store.planId,businessId:store.businessId,updatedAt:1,elements:[{id:'chair',label:'Profesional',type:'silla',reservable:true,status:'disponible',x:0,y:0,width:30,height:40,capacity:1}]});
 const repo=repoModule.createDemoBookingRepository(store,{now:()=>Date.parse('2030-01-07T08:00:00+01:00')}),items=await repo.getBookableItems(store.businessId),staff=(await repo.getStaff(store.businessId))[0];
 const booking=await repo.claimSlot({businessId:store.businessId,bookableItemId:items[0].id,customerId:'11111111-1111-4111-8111-111111111111',staffId:staff.id,startDatetime:'2030-01-07T09:00:00',endDatetime:'2030-01-07T09:30:00',unitsReserved:1,peopleCount:1,status:'CONFIRMED',paymentStatus:'none'});
 assert.equal(booking.ok,true);return{store,repo,make,booking:booking.booking};
}
test('one DEMO reservation, two calendar perspectives and independent participant decisions',async()=>{
 const demo=await demoFixture(),client=demo.repo.getCustomerEntries()[0],professional=demo.store.getSnapshot().entries[0],f=storageFixture();
 const C={userId:'11111111-1111-4111-8111-111111111111',context:'demo:USER'},P={userId:'11111111-1111-4111-8111-111111111111',context:'demo:BUSINESS:'+demo.store.businessId};
 const before=JSON.stringify(demo.store.getSnapshot().bookings);f.api.setCompletionSource(C,[client]);await f.api.decideCompletion(C,client,'done',()=>true);
 f.api.setCompletionSource(P,[professional]);const providerDoc=await f.api.readCompletionDocument(P);assert.equal(core.completionDecision(professional,providerDoc),undefined);await f.api.decideCompletion(P,professional,'pending',()=>true);
 assert.equal(core.completionKey(client),core.completionKey(professional));assert.equal(JSON.stringify(demo.store.getSnapshot().bookings),before);assert.equal(core.completionDecision(client,await f.api.readCompletionDocument(C)).status,'done');
 const reloaded=demo.make();await reloaded.load();assert.equal(reloaded.getSnapshot().bookings.length,1);assert.equal(reloaded.getSnapshot().entries.length,1);assert.equal(reloaded.getSnapshot().bookings[0].status,'CONFIRMED');
 const foreignScope={...P,context:'demo:BUSINESS:other'};f.api.setCompletionSource(foreignScope,[professional]);assert.equal(f.api.getCompletionSource(foreignScope).length,0);
});
test('a completed global booking does not imply a customer response',()=>{
 const e=entry({type:'GO_BOOKING',reservationId:'r',bookingStatus:'completada'}),personal=core.emptyCompletionDocument(S);
 assert.equal(core.awaitingCompletion(e,personal,now),true);assert.equal(core.completionDecision(e,personal),undefined);
});
test('DEMO change draft has zero effects; final proposal keeps the original reservation and occupancy',async()=>{
 const f=await demoFixture('proposal'),saved=plain(f.store.getSnapshot()),e=f.repo.getCustomerEntries()[0];
 assert.equal(core.awaitingCompletion(e,core.emptyCompletionDocument({userId:'11111111-1111-4111-8111-111111111111',context:'demo:USER'}),now),true);
 const proposal={dateISO:'2030-01-07',date:'Lunes 7',time:'13:00',acceptFinancialTerms:true};
 assert.deepEqual(plain(f.store.getSnapshot()),saved,'opening a draft does not call the repository');
 await assert.rejects(f.repo.changeBooking(e.reservationId,'foreign','customer','propose',proposal),/empresas reales/);
 await assert.rejects(f.repo.changeBooking(e.reservationId,f.store.businessId,'business','accept',{proposalId:'stale-proposal',acceptFinancialTerms:true}),/cambiado/);
 // The canonical contract derives duration from the saved reservation, never a client duration hint.
 await f.repo.changeBooking(e.reservationId,f.store.businessId,'customer','propose',{...proposal,duration:'1h'});
 const next=f.store.getSnapshot(),{changeProposal,...unchangedBooking}=next.bookings[0];
 assert.equal(next.bookings.length,1);assert.equal(next.reservations.length,1);assert.deepEqual(plain(unchangedBooking),saved.bookings[0]);
 assert.equal(changeProposal.time,'13:00');assert.equal(changeProposal.duration,'30');assert.equal(changeProposal.proposedBy,'customer');
 assert.equal(next.entries[0].dateISO,e.dateISO);assert.equal(next.entries[0].time,e.time);assert.equal(next.entries[0].estado,'propuesto');
 assert.equal(f.repo.getCustomerEntries()[0].estado,'propuesta_pendiente');
 const slots=await f.repo.getAllSlots(f.store.businessId,next.bookings[0].bookableItemId,e.dateISO,next.bookings[0].staffId);
 assert.equal(slots.find(slot=>slot.startDatetime.includes('T09:00:00')).isAvailable,false,'the original interval stays occupied');
 assert.equal(slots.find(slot=>slot.startDatetime.includes('T13:00:00')).isAvailable,true,'a pending proposal does not occupy another slot');
 const reloaded=f.make();await reloaded.load();assert.equal(reloaded.getSnapshot().entries[0].changeProposal.time,'13:00');
});

function uiFixture(model){
 const state=[],effects=[];let cursor=0;const calls=[];
 const react={__esModule:true,Fragment:'Fragment',createElement:(type,props,...children)=>({type,props:props??{},children:children.flat(Infinity)}),useState(initial){const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>state[i]=typeof value==='function'?value(state[i]):value];},useEffect(fn){effects.push(fn);}};react.default=react;
 const native=Object.fromEntries(['View','Text','TouchableOpacity','Modal','ScrollView','TextInput','Switch'].map(n=>[n,n]));
 native.Platform={OS:'ios'};
 const component=load('components/landing/LandingActionCompletion.tsx',{react,'react-native':native,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},'@/components/ui/GoCloseButton':{GoCloseButton:'GoCloseButton'},'@/lib/goActionCompletion':core});
 const props={model,frame:{x:18,y:100,width:354,height:280},onPropose:e=>calls.push(['propose',e.id]),onPendingList:()=>calls.push(['list']),lang:'es'};
 return{...component,calls,props,render(){cursor=0;effects.length=0;return component.LandingActionCompletion(props);}};
}
const nodes=(n,p=()=>true)=>!n||typeof n!=='object'?[]:[...(p(n)?[n]:[]),...(n.children??[]).flatMap(x=>nodes(x,p))],text=n=>typeof n==='string'||typeof n==='number'?String(n):(n?.children??[]).map(text).join('');
test('real confirmation buttons dispatch exactly one personal decision or open the existing draft',()=>{
 const e=entry(),calls=[],model={scope:S,doc:core.emptyCompletionDocument(S),candidates:[e],unresolved:[e],pending:[],selected:null,decide:(e,s)=>calls.push([e.id,s]),setSelected(){},configure(){},busy:false};const ui=uiFixture(model),tree=ui.render();
 const choices=nodes(tree,n=>['REALIZADO','PENDIENTE','PROPONER CAMBIO'].includes(n.props.accessibilityLabel));assert.equal(choices.length,6,'same controls exist in the inline area and hidden modal');
 for(const label of ['REALIZADO','PENDIENTE','PROPONER CAMBIO']){const b=choices.find(n=>n.props.accessibilityLabel===label);assert.equal(b.props.style.width,b.props.style.height);assert.ok(b.props.style.minHeight>=44);b.props.onPress();}
 assert.deepEqual(calls,[['one','done'],['one','pending']]);assert.deepEqual(ui.calls,[['propose','one']]);assert.equal(e.changeProposal,undefined);
});
test('multiple unresolved/pending actions are reviewed individually and never disappear on a tab or close',()=>{
 const a=entry(),b=entry({id:'two'}),doc=core.emptyCompletionDocument(S),model={scope:S,doc,candidates:[a,b],unresolved:[a,b],pending:[],selected:null,setSelected:id=>model.selected=id,decide(){throw Error('No implicit response');},configure(){},busy:false};const ui=uiFixture(model);
 let tree=ui.render();nodes(tree,n=>n.props.accessibilityLabel==='Acción siguiente')[0].props.onPress();assert.equal(model.selected,'two');tree=ui.render();assert.equal(model.unresolved.length,2);
 ui.props.frame.height=44;tree=ui.render();nodes(tree,n=>n.type==='TouchableOpacity'&&text(n).includes('Confirma tus acciones'))[0].props.onPress();tree=ui.render();assert.equal(nodes(tree,n=>n.type==='Modal')[0].props.visible,true);nodes(tree,n=>n.type==='GoCloseButton')[0].props.onPress();assert.equal(model.unresolved.length,2);assert.equal(Object.keys(doc.records).length,0);
});
test('confirmation shrinks only its own area and uses a free header lane when cards occupy available height',()=>{
 const ui=uiFixture({});
 for(const profile of ['ADMIN','USER','BUSINESS'])for(const scale of [.85,1,1.15])for(const width of [320,390,430,844]){
  const args={width,left:width>800?44:0,right:width>800?44:0,safeTop:100,commandsTop:480,openHeight:250*scale,open:false,header:{x:90,y:60,width:150,height:44}},before=JSON.stringify(args),closed=ui.completionFrame(args),open=ui.completionFrame({...args,open:true});
  assert.ok(closed.x>=args.left);assert.ok(closed.x+closed.width<=width-args.right);assert.ok(open.y+open.height<=480-250*scale-8);assert.equal(JSON.stringify(args),before,profile);
 }
 const tiny=ui.completionFrame({width:320,left:0,right:0,safeTop:100,commandsTop:380,openHeight:400,open:true,header:{x:80,y:50,width:150,height:44}});assert.deepEqual(plain(tiny),{x:80,y:50,width:150,height:44});
});
test('Calendar decorates the original entries with scoped responses without mutating booking state',()=>{
 let owner='11111111-1111-4111-8111-111111111111',doc=core.recordCompletion(core.emptyCompletionDocument(S),entry(),'pending',now);
 const hook=load('hooks/useGoCalendarEntries.ts',{'./useActionCompletion':{useCompletionDocument:()=>({doc})},'@/lib/goActionCompletion':core,react:{useState:()=>[owner,()=>{}],useEffect(){}},'@/lib/goTaskAccess':{getTaskUser:async()=>owner,isPersonalTask:()=>true},'@/lib/sessionEvents':{onSessionChanged:()=>()=>{}}});
 const e=entry(),before=JSON.stringify(e),rows=hook.useGoCalendarEntries([e,entry({id:'foreign',ownerUserId:'other'})]);assert.equal(rows.length,1);assert.equal(rows[0].localResolutionStatus,'pending');assert.equal(JSON.stringify(e),before);assert.equal(rows[0].estado,'aceptado');
 doc=core.emptyCompletionDocument({userId:'11111111-1111-4111-8111-111111111111',context:'live:BUSINESS'});assert.equal(hook.useGoCalendarEntries([e])[0].localResolutionStatus,undefined);
});

test('muted iOS/Android and unsupported environments retain requests without claiming delivery',async()=>{
 const f=storageFixture(),e=entry();f.api.setCompletionSource(S,[e]);
 const policy=load('lib/goActionCompletionNotifications.ts',{'./goActionCompletion':core,'./goActionCompletionStore':f.api}).completionNotificationPolicy;
 const native=load('lib/goNativeReminderScheduler.ts',{'./goNoteTools':load('lib/goNoteTools.ts'),'./goTaskAccess':{isPersonalTask:()=>false},'./goTaskReminders':{taskInScope:()=>false,reminderOffsets:()=>[],reminderTaskInstant:()=>now}});
 for(const platform of ['ios','android','web']){
  const calls=[],ports={platform,readTasks:async()=>[],readCompletionRequests:s=>policy.requests(s),scopeValid:async()=>true,permissions:async()=>{calls.push('permission');return 'denied';},pending:async()=>[],delivered:async()=>[],schedule:async()=>{throw Error('Must not schedule');},cancel:async()=>{},dismiss:async()=>{},now:()=>now};
  const controller=native.createNativeReminderScheduler(ports),reports=await controller.setScope(S,'silent');assert.ok(reports.length);assert.ok(reports.every(r=>r.status===(platform==='web'?'unsupported':'muted')));assert.equal(calls.length,0);assert.equal(core.awaitingCompletion(e,await f.api.readCompletionDocument(S),now),true);
 }
 f.api.setCompletionSource(S,[e,e]);assert.equal((await policy.requests(S)).length,0,'ambiguous identities cannot duplicate native notices');
});
test('a delivered unresolved reminder remains visible until explicit response; DONE clears both queues',async()=>{
 const clockBefore=now;try{
 const f=storageFixture(),e=entry({time:'12:00'});f.api.setCompletionSource(S,[e]);
 const policy=load('lib/goActionCompletionNotifications.ts',{'./goActionCompletion':core,'./goActionCompletionStore':f.api}).completionNotificationPolicy;
 const native=load('lib/goNativeReminderScheduler.ts',{'./goNoteTools':load('lib/goNoteTools.ts'),'./goTaskAccess':{isPersonalTask:()=>false},'./goTaskReminders':{taskInScope:()=>false,reminderOffsets:()=>[],reminderTaskInstant:()=>now}}),pending=new Map(),delivered=new Map();
 const ports={platform:'ios',readTasks:async()=>[],readCompletionRequests:s=>policy.requests(s),scopeValid:async()=>true,permissions:async()=> 'allowed',pending:async()=>[...pending.values()],delivered:async()=>[...delivered.values()],now:()=>now,
  schedule:async r=>{pending.set(r.identifier,{identifier:r.identifier,data:{goActionCompletion:true,completionKey:r.completion.key,completionSchedule:r.completion.schedule,taskId:r.taskId,minutes:r.minutes,signature:r.signature}});return r.identifier;},cancel:async id=>pending.delete(id),dismiss:async id=>delivered.delete(id)};
 const controller=native.createNativeReminderScheduler(ports);await controller.setScope(S);const first=(await policy.requests(S))[0],notice=pending.get(first.identifier);pending.delete(first.identifier);delivered.set(first.identifier,notice);now=first.at+1;
 await controller.refresh(S);assert.equal(delivered.size,1);assert.equal(core.awaitingCompletion(e,await f.api.readCompletionDocument(S),now),true);
 await f.api.decideCompletion(S,e,'done',()=>true);await controller.refresh(S);assert.equal(pending.size,0);assert.equal(delivered.size,0);assert.equal(e.estado,'aceptado');
 }finally{now=clockBefore;}
});
test('reminder presets, a free fractional interval and pending mute are explicit user configuration',()=>{
 const e=entry(),calls=[],model={scope:S,doc:core.emptyCompletionDocument(S),candidates:[e],unresolved:[e],pending:[],selected:null,setSelected(){},decide(){throw Error('No implicit decision');},configure:(...args)=>calls.push(args),busy:false};const ui=uiFixture(model);
 let tree=ui.render();nodes(tree,n=>n.type==='TouchableOpacity'&&text(n)==='Recordatorios y duración')[0].props.onPress();tree=ui.render();
 for(const h of [1,2,17,24])nodes(tree,n=>n.type==='TouchableOpacity'&&text(n)===h+'h')[0].props.onPress();
 assert.deepEqual(calls.map(c=>c[2]),[60,120,1020,1440]);
 nodes(tree,n=>n.props.accessibilityLabel==='Siguiente aviso en horas')[0].props.onChangeText('1,25');
 nodes(tree,n=>n.props.accessibilityLabel==='Intervalo de recordatorio en horas')[0].props.onChangeText('17,5');
 nodes(tree,n=>n.props.accessibilityLabel==='Duración predeterminada en minutos')[0].props.onChangeText('45');tree=ui.render();
 nodes(tree,n=>n.type==='TouchableOpacity'&&text(n)==='GUARDAR')[0].props.onPress();assert.equal(calls.at(-1)[0].defaultDurationMinutes,45);assert.equal(calls.at(-1)[0].reminderMinutes,1050);assert.equal(calls.at(-1)[2],75);
 const switches=nodes(tree,n=>n.type==='Switch');switches[0].props.onValueChange(false);assert.equal(calls.at(-1)[0].pendingAlerts,false);switches[1].props.onValueChange(false);assert.equal(calls.at(-1)[3],false);assert.equal(Object.keys(model.doc.records).length,0);
});

test('the existing list and badges use explicit Pending and separate DEMO proposals, with no duplicate entries',()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];(function walk(n){all.push(n);ts.forEachChild(n,walk)})(ast);
 const declaration=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name).getText(ast);
 const raw=[entry({id:'elapsed',estado:'aceptado'}),entry({id:'future',dateISO:'2030-01-08',estado:'pendiente'}),entry({id:'unassigned',dateISO:'',time:'',estado:'pendiente'})],pending=entry({id:'demo',demoLocal:true}),proposal=entry({id:'proposal',demoLocal:true,estado:'propuesta_pendiente',changeProposal:{dateISO:'2030-01-08',time:'13:00'}}),context={exports:{},goLog:raw,mergeCompletionEntries:core.mergeCompletionEntries,actionCompletion:{candidates:[pending,proposal],status:e=>e.id==='demo'?'pending':undefined}};
 const code=['resolutionEntries','countPendiente','countPropuesta','listEntries'].map(n=>'const '+declaration(n)+';').join('\n')+'\nexports.result={countPendiente,countPropuesta,listEntries};';
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,context);
 assert.equal(context.exports.result.countPendiente,2,'one explicit decision and the existing undated task; elapsed/future actions never move automatically');assert.equal(context.exports.result.countPropuesta,1);assert.equal(context.exports.result.listEntries.length,5);assert.equal(new Set(context.exports.result.listEntries.map(e=>e.id)).size,5);assert.equal(raw[0].estado,'aceptado');assert.equal(raw[1].estado,'pendiente');
});

test('manual creation stamps only missing participant metadata and preserves declared owners/contexts',async()=>{
 let rows=[],write;const checked=[];
 const hook=load('hooks/useGoLog.ts',{
  react:{useEffect(){},useRef:value=>({current:value}),useCallback:fn=>fn,useSyncExternalStore:(_subscribe,get)=>get()},
  '@/lib/goTaskAccess':{assertTaskUser:async id=>{checked.push(id);assert.equal(id,S.userId);}},
  '@/lib/goLogStore':{getGoLogSnapshot:()=>rows,subscribeGoLog:()=>()=>{},readGoLog:async()=>rows,updateGoLog:update=>{write=Promise.resolve(update(rows)).then(next=>{rows=next.entries;});return write;}}
 });
 const foreign=entry({id:'foreign',ownerUserId:'other',actionContext:'live:BUSINESS',type:'GO'}),newAction=entry({id:'manual',ownerUserId:undefined,actionContext:undefined,type:'GO'}),[,set]=hook.useGoLog(S);
 set([foreign,newAction]);await write;assert.deepEqual(plain(rows[0]),plain(foreign));assert.equal(rows[1].ownerUserId,S.userId);assert.equal(rows[1].actionContext,S.context);assert.equal(checked.length,1);
});

function manualScopeFixture(assertUser=async()=>{},initial=[]){
 let rows=initial,write=null,cursor=0;const refs=[],callbacks=[];
 const react={useEffect(){},useSyncExternalStore:(_subscribe,get)=>get(),
  useRef(initial){const index=cursor++;if(!refs[index])refs[index]={current:initial};return refs[index];},
  useCallback(fn){const index=cursor++;if(!callbacks[index])callbacks[index]=fn;return callbacks[index];}};
 const hook=load('hooks/useGoLog.ts',{react,
  '@/lib/goTaskAccess':{assertTaskUser:assertUser},
  '@/lib/goLogStore':{getGoLogSnapshot:()=>rows,subscribeGoLog:()=>()=>{},readGoLog:async()=>rows,
   updateGoLog(update,assertActive){write=Promise.resolve().then(()=>update(rows)).then(next=>{assertActive?.();rows=next.entries;});return write;}}
 });
 return {render(scope){cursor=0;return hook.useGoLog(scope)[1];},get rows(){return rows;},get write(){return write;}};
}

test('a handler captured before scope hydration stays stable and reads the current user/company only when invoked',async()=>{
 const checked=[],f=manualScopeFixture(async user=>checked.push(user)),captured=f.render(null);
 captured([entry({id:'too-early',ownerUserId:undefined,actionContext:undefined})]);
 assert.equal(f.write,null);assert.equal(f.rows.length,0);assert.equal(checked.length,0);
 assert.equal(f.render(S),captured);
 captured([entry({id:'new-user',ownerUserId:undefined,actionContext:undefined})]);await f.write;
 assert.equal(f.rows[0].ownerUserId,S.userId);assert.equal(f.rows[0].actionContext,S.context);
 const company={...S,context:'demo:BUSINESS:company-one'};assert.equal(f.render(company),captured);
 captured(previous=>[...previous,entry({id:'new-company',ownerUserId:undefined,actionContext:undefined})]);await f.write;
 assert.equal(f.rows[0].actionContext,S.context);assert.equal(f.rows[1].actionContext,company.context);
});

test('scoped manual writes do not adopt a legacy action whose owner is unknown',async()=>{
 const legacy=entry({id:'legacy-without-owner',ownerUserId:undefined,actionContext:undefined}),f=manualScopeFixture(async()=>{},[legacy]),set=f.render(S);
 set(previous=>[...previous,entry({id:'new-owned-action',ownerUserId:undefined,actionContext:undefined})]);await f.write;
 assert.equal(f.rows[0],legacy);assert.equal(f.rows[0].ownerUserId,undefined);assert.equal(f.rows[0].actionContext,undefined);
 assert.equal(f.rows[1].ownerUserId,S.userId);assert.equal(f.rows[1].actionContext,S.context);
});

test('a queued manual response is rejected if its captured context changes during identity verification',async()=>{
 let release,entered;const gate=new Promise(resolve=>release=resolve),checking=new Promise(resolve=>entered=resolve);
 const f=manualScopeFixture(async()=>{entered();await gate;}),captured=f.render(S);
 captured([entry({id:'stale',ownerUserId:undefined,actionContext:undefined})]);await checking;
 assert.equal(f.render({...S,context:'demo:BUSINESS:company-two'}),captured);release();
 await assert.rejects(f.write,/cuenta o el calendario/);assert.equal(f.rows.length,0);
 captured([entry({id:'current',ownerUserId:undefined,actionContext:undefined})]);await f.write;
 assert.equal(f.rows[0].id,'current');assert.equal(f.rows[0].actionContext,'demo:BUSINESS:company-two');
});

test('the shared store rechecks presentation context after its last identity await and leaves the queue usable after rejection',async()=>{
 let release,entered,reads=0,active=true;const gate=new Promise(resolve=>release=resolve),checking=new Promise(resolve=>entered=resolve),writes=[];
 const store=load('lib/goLogStore.ts',{
  './goTaskAccess':{getTaskUser:async()=>{if(++reads===2){entered();await gate;}return S.userId;},isPersonalTask:()=>true},
  '@react-native-async-storage/async-storage':{__esModule:true,default:{getItem:async()=>null,setItem:async(key,value)=>writes.push([key,value])}}
 });
 const assertActive=()=>{if(!active)throw Error('El calendario ha cambiado.');};
 const pending=store.updateGoLog(()=>({entries:[entry({id:'old-context'})],result:undefined}),assertActive);
 await checking;active=false;release();await assert.rejects(pending,/calendario ha cambiado/);
 assert.equal(writes.length,0);assert.equal(store.getGoLogSnapshot().length,0);
 active=true;await store.updateGoLog(()=>({entries:[entry({id:'retry-current-context'})],result:undefined}),assertActive);
 assert.equal(writes.length,1);assert.equal(store.getGoLogSnapshot()[0].id,'retry-current-context');
});

test('canonical advanced booking projection retains one reservation, exact instants and immutable receipt during a personal response',async()=>{
 const projection=load('data/customerBookingProjection.ts');
 const booking={id:'reservation-canonical',businessId:'business-one',customerId:S.userId,bookableItemId:'cut',staffId:'professional-one',
  status:'CONFIRMED',startDatetime:'2030-01-07T09:00:00+01:00',endDatetime:'2030-01-07T10:30:00+01:00',
  startInstant:'2030-01-07T08:00:00.000Z',endInstant:'2030-01-07T09:30:00.000Z',changeRevision:4,
  timingSnapshot:{timezone:'Europe/Madrid',segments:[{kind:'work',minutes:30},{kind:'wait',minutes:60}]},
  receipt:{timezone:'Europe/Madrid',serviceName:'Corte + tinte',totalPriceMinor:6500,services:[{id:'cut'},{id:'colour'}]}};
 const business={id:'business-one',name:'Peluquería de prueba',location:'Calle ficticia 1',timezone:'Europe/Madrid'},item={id:'cut',title:'Corte'};
 const canonical=projection.customerBookingEntry(booking,business,item,'Profesional de prueba');
 const legacy={...canonical,id:'go_booking_cli_'+booking.id,notes:'proyección anterior'};
 const merged=projection.mergeCustomerBookingEntries([legacy],[canonical],true),savedBooking=JSON.stringify(booking),savedEntry=JSON.stringify(merged[0]);
 assert.equal(merged.length,1);assert.equal(merged[0].id,canonical.id);assert.equal(merged[0].reservationId,booking.id);
 assert.equal(merged[0].bookingChangeRevision,4);assert.equal(merged[0].bookingTimeline,booking.timingSnapshot);
 assert.equal(core.plannedActionEnd(merged[0]),Date.parse(booking.endInstant));assert.equal(merged[0].duration,'90min');
 const f=storageFixture();f.api.setCompletionSource(S,merged);await f.api.decideCompletion(S,merged[0],'pending',()=>true);
 assert.equal(core.completionDecision(merged[0],await f.api.readCompletionDocument(S)).status,'pending');
 assert.equal(JSON.stringify(booking),savedBooking);assert.equal(JSON.stringify(merged[0]),savedEntry);
 assert.equal(booking.receipt.services.length,2);assert.equal(booking.receipt.totalPriceMinor,6500);assert.equal(booking.status,'CONFIRMED');
});

test('calendar cannot decorate a USER entry with another company context response for the same reservation key',()=>{
 const companyScope={...S,context:'live:BUSINESS:company-one'},userEntry=entry({reservationId:'shared-booking',businessId:'company-one'});
 const companyEntry={...userEntry,actionContext:companyScope.context};
 const doc=core.recordCompletion(core.emptyCompletionDocument(companyScope),companyEntry,'pending',now);
 const hook=load('hooks/useGoCalendarEntries.ts',{'./useActionCompletion':{useCompletionDocument:()=>({doc})},'@/lib/goActionCompletion':core,
  react:{useState:()=>[S.userId,()=>{}],useEffect(){}},'@/lib/goTaskAccess':{getTaskUser:async()=>S.userId,isPersonalTask:()=>true},'@/lib/sessionEvents':{onSessionChanged:()=>()=>{}}});
 const rows=hook.useGoCalendarEntries([userEntry,companyEntry,{...companyEntry,id:'foreign',ownerUserId:'another-user'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].localResolutionStatus,undefined);assert.equal(rows[1].localResolutionStatus,'pending');
 assert.equal(userEntry.estado,'aceptado');assert.equal(companyEntry.estado,'aceptado');
});
