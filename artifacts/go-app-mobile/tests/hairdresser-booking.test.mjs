import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
import {fixture as calendarFixture} from './helpers/calendar-fixture.mjs';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');process.env.TZ='Europe/Madrid';
let clock=Date.parse('2030-01-07T08:00:00');class Clock extends Date{constructor(...args){super(...(args.length?args:[clock]));}static now(){return clock;}}
function load(file,imports={}){const context={exports:{},Date:Clock,Intl,console,Map,Set,require:key=>{if(key in imports)return imports[key];throw Error('Unexpected '+key);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);return context.exports;}
const storeModule=load('data/businessDemoStore.ts'),repoModule=load('data/demoBookingRepository.ts',{'./businessDemoStore':storeModule,"./bookingServices":load("data/bookingServices.ts")}),projection=load('data/customerBookingProjection.ts');
const completion=load('lib/goActionCompletion.ts');
const owner='11111111-1111-4111-8111-111111111111',company='33333333-3333-4333-8333-333333333333',otherCompany='44444444-4444-4444-8444-444444444444',plain=value=>JSON.parse(JSON.stringify(value));
const config={businessName:'',address:'',cartaUrl:'',sectorId:null,subId:null,plantillaItems:[],activeDays:[],openFrom:'09:00',openTo:'18:00',daySchedules:{},services:[],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,completedSteps:[],paymentMethod:null,isBusinessActive:false,staffSchedules:{}};
async function fixture(companyId=company,memory=new Map()){
 let allowed=true;const make=()=>storeModule.createBusinessDemoStore({ownerUserId:owner,companyId,initialConfig:config,canUse:()=>allowed,storage:{getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)}}),store=make();
 await store.updateConfig({businessName:'GO PELUQUERÍA',address:'Calle ficticia, Murcia',sectorId:'belleza',subId:'peluqueria',activeDays:[0,1,2,3,4],services:[{name:'Corte',duration:30,price:12}],plantillaItems:[{id:'staff',count:2,label:'Puestos',staffNames:['Ana','Luis']}],completedSteps:[0,1,2,3,4,5,6,7]});
 await store.saveFloorPlan({id:store.planId,businessId:store.businessId,updatedAt:1,elements:[0,1].map(i=>({id:'chair-'+i,label:i?'Luis':'Ana',type:'silla',reservable:true,status:'disponible',x:0,y:0,width:30,height:40,capacity:1}))});
 const repo=repoModule.createDemoBookingRepository(store,{now:()=>clock}),service=(await repo.getBookableItems(store.businessId))[0],staff=(await repo.getStaff(store.businessId))[0];
 const create=async(time='10:00')=>{const start='2030-01-07T'+time+':00',end=new Date(Date.parse(start)+1800000),result=await repo.claimSlot({businessId:store.businessId,bookableItemId:service.id,staffId:staff.id,customerId:owner,startDatetime:start,endDatetime:'2030-01-07T'+String(end.getHours()).padStart(2,'0')+':'+String(end.getMinutes()).padStart(2,'0')+':00',unitsReserved:1,peopleCount:1,status:'CONFIRMED',paymentStatus:'none'});assert.equal(result.ok,true);return result.booking;};
 return {store,repo,service,staff,make,memory,create,allow:value=>allowed=value,propose:(id,actor='customer',time='12:00')=>repo.changeBooking(id,store.businessId,actor,'propose',{dateISO:'2030-01-07',date:'Lunes 7',time,acceptFinancialTerms:true})};
}
test('create → request → company acceptance → reload uses one booking and both original calendar perspectives',async()=>{
 const f=await fixture(),b=await f.create(),before=plain(f.store.getSnapshot());let notifications=0;const stop=f.store.subscribe(()=>notifications++);
 assert.ok(b.slotKey);assert.equal(before.entries[0].slotKey,b.slotKey);assert.equal(f.repo.getCustomerEntries()[0].slotKey,b.slotKey);
 const requested=await f.propose(b.id);assert.equal(requested.startDatetime,b.startDatetime);assert.equal(requested.paymentStatus,b.paymentStatus);assert.equal(f.store.getSnapshot().entries[0].dateISO,'2030-01-07');assert.equal(f.store.getSnapshot().entries[0].time,'10:00');assert.equal(f.store.getSnapshot().entries[0].estado,'propuesto');assert.equal(f.repo.getCustomerEntries()[0].estado,'propuesta_pendiente');
 assert.equal(requested.slotKey,b.slotKey);assert.equal(f.store.getSnapshot().entries[0].slotKey,b.slotKey);assert.equal(f.repo.getCustomerEntries()[0].slotKey,b.slotKey);
 assert.equal((await f.repo.getAllSlots(f.store.businessId,f.service.id,'2030-01-07',f.staff.id)).find(s=>s.startDatetime.endsWith('T10:00:00')).isAvailable,false,'the original remains occupied');
 const accepted=await f.repo.changeBooking(b.id,f.store.businessId,'business','accept',{proposalId:requested.changeProposal.id});
 assert.equal(accepted.id,b.id);assert.ok(accepted.startDatetime.endsWith('T12:00:00'));assert.equal(accepted.staffId,b.staffId);assert.equal(accepted.bookableItemId,b.bookableItemId);assert.equal(accepted.paymentStatus,b.paymentStatus);assert.equal(accepted.changeProposal,undefined);
 assert.notEqual(accepted.slotKey,b.slotKey);assert.equal(f.store.getSnapshot().entries[0].slotKey,accepted.slotKey);assert.equal(f.repo.getCustomerEntries()[0].slotKey,accepted.slotKey);
 const data=f.store.getSnapshot();for(const key of ['bookings','reservations','entries'])assert.equal(data[key].length,1,key);assert.equal(data.entries[0].time,'12:00');assert.equal(f.repo.getCustomerEntries()[0].time,'12:00');assert.ok(notifications>=2);stop();
 const reloaded=f.make();await reloaded.load();assert.equal(reloaded.getSnapshot().bookings[0].id,b.id);assert.equal(reloaded.getSnapshot().entries[0].time,'12:00');assert.equal(reloaded.getSnapshot().bookings[0].changeHistory[0].outcome,'accepted');assert.equal(before.bookings[0].startDatetime,b.startDatetime);
 assert.equal(reloaded.getSnapshot().bookings[0].slotKey,accepted.slotKey);assert.equal(reloaded.getSnapshot().entries[0].slotKey,accepted.slotKey);assert.equal(repoModule.createDemoBookingRepository(reloaded,{now:()=>clock}).getCustomerEntries()[0].slotKey,accepted.slotKey);
});
test('rejection preserves original schedule, slot and financial data; business counterproposal requires customer acceptance',async()=>{
 const f=await fixture(),b=await f.create(),request=await f.propose(b.id);await f.repo.changeBooking(b.id,f.store.businessId,'business','reject',{proposalId:request.changeProposal.id});
 let stored=f.store.getSnapshot().bookings[0];assert.equal(stored.startDatetime,b.startDatetime);assert.equal(stored.slotKey,b.slotKey);assert.equal(stored.changeProposal,undefined);assert.equal(stored.changeHistory[0].outcome,'rejected');
 await f.propose(b.id);const counter=await f.propose(b.id,'business','13:00');assert.equal(counter.startDatetime,b.startDatetime);assert.equal(counter.changeHistory.at(-1).outcome,'countered');assert.equal(f.repo.getCustomerEntries()[0].estado,'propuesto');
 await assert.rejects(f.repo.changeBooking(b.id,f.store.businessId,'business','accept',{proposalId:counter.changeProposal.id}),/otra parte/);
 await f.repo.changeBooking(b.id,f.store.businessId,'customer','accept',{proposalId:counter.changeProposal.id});assert.equal(f.repo.getCustomerEntries()[0].time,'13:00');
});
test('double submission/acceptance is idempotent and stale proposal IDs cannot change another agreement',async()=>{
 const f=await fixture(),b=await f.create();const [a,c]=await Promise.all([f.propose(b.id),f.propose(b.id)]);assert.equal(a.changeProposal.id,c.changeProposal.id);
 const input={proposalId:a.changeProposal.id};await Promise.all([f.repo.changeBooking(b.id,f.store.businessId,'business','accept',input),f.repo.changeBooking(b.id,f.store.businessId,'business','accept',input)]);assert.equal(f.store.getSnapshot().bookings.length,1);assert.equal(f.store.getSnapshot().bookings[0].changeHistory.length,1);
 const newRequest=await f.propose(b.id,'customer','14:00');await assert.rejects(f.repo.changeBooking(b.id,f.store.businessId,'business','accept',input),/ha cambiado/);assert.equal(f.store.getSnapshot().bookings[0].changeProposal.id,newRequest.changeProposal.id);
});
test('acceptance rechecks occupancy and professional shifts, preserving the pending request and original slot on conflict',async()=>{
 const f=await fixture(),b=await f.create(),request=await f.propose(b.id);await f.create('12:00');const before=plain(f.store.getSnapshot());
 await assert.rejects(f.repo.changeBooking(b.id,f.store.businessId,'business','accept',{proposalId:request.changeProposal.id}),/no está disponible/);assert.deepEqual(plain(f.store.getSnapshot()),before);
 await assert.rejects(f.propose(b.id,'customer','08:30'),/no está disponible/);assert.deepEqual(plain(f.store.getSnapshot()),before);
});
test('paid reservations require explicit financial acceptance by both parties and never modify payment or create another booking',async()=>{
 const f=await fixture(),b=await f.create();await f.store.transactBookings(data=>{data.bookings[0].paymentStatus='paid';});
 await assert.rejects(f.repo.changeBooking(b.id,f.store.businessId,'customer','propose',{dateISO:'2030-01-07',time:'12:00'}),/condiciones económicas/);
 const request=await f.propose(b.id);await assert.rejects(f.repo.changeBooking(b.id,f.store.businessId,'business','accept',{proposalId:request.changeProposal.id}),/económicas/);
 await f.repo.changeBooking(b.id,f.store.businessId,'business','accept',{proposalId:request.changeProposal.id,acceptFinancialTerms:true});assert.equal(f.store.getSnapshot().bookings[0].paymentStatus,'paid');assert.equal(f.store.getSnapshot().bookings.length,1);
});
test('cancelling during negotiation updates both projections, preserves history and cannot revive the reservation',async()=>{
 const f=await fixture(),b=await f.create(),request=await f.propose(b.id);await f.repo.cancelBooking(b.id);assert.equal(f.store.getSnapshot().entries[0].bookingStatus,'cancelada');assert.equal(f.repo.getCustomerEntries()[0].estado,'rechazado');assert.equal(f.store.getSnapshot().bookings[0].changeProposal,undefined);assert.equal(f.store.getSnapshot().bookings[0].changeHistory[0].outcome,'cancelled');
 await assert.rejects(f.repo.changeBooking(b.id,f.store.businessId,'business','accept',{proposalId:request.changeProposal.id}),/no disponible/);assert.equal(f.store.getSnapshot().bookings.length,1);
});
test('company boundaries, permission revocation and unknown reservation IDs fail without changing either document',async()=>{
 const memory=new Map(),a=await fixture(company,memory),b=await fixture(otherCompany,memory),booking=await a.create(),before=plain(a.store.getSnapshot());await b.create();
 await assert.rejects(a.repo.changeBooking(booking.id,b.store.businessId,'business','propose',{dateISO:'2030-01-07',time:'12:00'}),/reales/);await assert.rejects(b.propose(booking.id),/no disponible/);assert.deepEqual(plain(a.store.getSnapshot()),before);
 a.allow(false);await assert.rejects(a.propose(booking.id),/autorizado/);
});
test('customer projection preserves business time across midnight and merges legacy views without creating tasks or copies',()=>{
 const b={id:'reservation',businessId:'b',bookableItemId:'cut',customerId:owner,staffId:'p',startDatetime:'2030-01-07T23:30:00Z',endDatetime:'2030-01-08T00:00:00Z',status:'CONFIRMED',paymentStatus:'paid'},business={id:'b',name:'GO PELUQUERÍA',location:'Murcia',timezone:'Europe/Madrid',phone:'',bookingColor:'#3D9A84'},service={id:'cut',title:'Corte'};
 const row=projection.customerBookingEntry(b,business,service,'Ana');assert.equal(row.dateISO,'2030-01-08');assert.equal(row.time,'00:30');assert.equal(row.contactName,business.name);assert.equal(row.intentLabel,'Corte');assert.equal(row.reservationId,b.id);
 const task={id:'task',type:'TAREA'},merged=projection.mergeCustomerBookingEntries([task,{...row,id:'go_booking_cli_reservation',time:'09:00'},{...row,id:'go_booking_prv_reservation'}],[row]);assert.equal(merged.length,2);assert.equal(merged[0],task);assert.equal(merged[1].time,'00:30');assert.equal(merged[1].id,row.id);assert.equal(merged.filter(e=>e.reservationId===b.id).length,1);
});

test('manual company edits cannot bypass agreement or reset an existing payment',async()=>{
 const f=await fixture(),b=await f.create();await f.store.transactBookings(data=>{data.bookings[0].paymentStatus='paid';});const before=plain(f.store.getSnapshot());
 await assert.rejects(f.store.saveReservations(f.store.planId,[{...before.reservations[0],time:'12:00',endDatetime:'2030-01-07T12:30:00'}]),/Proponer cambio/);assert.deepEqual(plain(f.store.getSnapshot()),before);
 await f.store.saveReservations(f.store.planId,[{...before.reservations[0],status:'confirmada'}]);assert.equal(f.store.getSnapshot().bookings[0].paymentStatus,'paid');assert.equal(f.store.getSnapshot().bookings[0].source,'customer');
});
test('Home routes booking decisions and drafts to the original reservation without GO writes or messages',()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];(function walk(n){nodes.push(n);ts.forEachChild(n,walk)})(ast);
 const decl=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name),booking={id:'booking'};
 for(const [name,op]of [['acceptProposal','accept'],['rejectProposal','reject']]){const calls=[],context={customerBookings:{entries:[booking]},respondCustomerBooking:(e,operation)=>calls.push([e.id,operation])};vm.runInNewContext(ts.transpileModule('('+decl(name).initializer.getText(ast)+')("booking");',{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,context);assert.deepEqual(calls,[['booking',op]]);}
 const calls=[],ctx={customerBookings:{entries:[booking]},currentReceivedIdRef:{current:'booking'},proposalReturnRef:{current:'calendar'},calFlow:{cancel:()=>calls.push('cancel')},confirmBookingDraft:(e,result)=>calls.push([e.id,result.time])};
 vm.runInNewContext(ts.transpileModule('('+decl('sendSuggestChangeFromCal').initializer.getText(ast)+')({time:"12:00"});',{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,ctx);assert.deepEqual(calls,[['booking','12:00'],'cancel']);
});

test('authoritative customer context excludes stale cache and another account while retaining normal GO actions',()=>{
 const task={id:'task',type:'TAREA'},stale={id:'go_booking_old',reservationId:'old',type:'GO_RESERVA',kind:'sent',customerBooking:true,ownerUserId:'foreign',time:'10:00'};
 assert.deepEqual(plain(projection.mergeCustomerBookingEntries([task,stale],[],true)),[task]);assert.deepEqual(plain(projection.mergeCustomerBookingEntries([task,stale],[],false)),[task]);
 const canonical={...stale,ownerUserId:owner},oldPrivate={...stale,detail:'Foreign private text'};assert.equal(projection.mergeCustomerBookingEntries([oldPrivate],[canonical],true)[0].detail,undefined);
});

test('the actual Home selectors show the same booking in My reservations, Calendar and Next visit through acceptance/rejection/cancellation',async()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];(function walk(n){nodes.push(n);ts.forEachChild(n,walk)})(ast);
 const decl=name=>nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
 const filtered=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='filtered'&&n.initializer?.getText(ast).startsWith('listEntries.filter'));
 assert.ok(filtered);assert.ok(decl('listEntries'));
 const f=await fixture(),booking=await f.create();
 const surfaces=()=>{
  const entries=f.repo.getCustomerEntries(),goLog=projection.mergeCustomerBookingEntries([{id:'task',kind:'sent',type:'TAREA',estado:'aceptado',dateISO:'2030-01-09',time:'09:00'}],entries,true);
  const completionDocument=completion.emptyCompletionDocument({userId:owner,context:'USER'});
  const scope={exports:{},goLog,Date:Clock,__DEV__:false,isUserMode:true,isBusinessMode:false,useMemo:fn=>fn(),getToday:()=>new Clock(),formatISODate:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),listFilter:'reservas',customerBookings:{entries},isPapelaraView:false,activityFilter:'todas',typeFilter:'todos',llamadasListOpen:false,
   mergeCompletionEntries:completion.mergeCompletionEntries,actionCompletion:{candidates:[],status:entry=>completion.completionDecision(entry,completionDocument)?.status}};
  vm.runInNewContext(ts.transpileModule('const '+decl('goDateTime').getText(ast)+';const '+decl('nextAppointments').getText(ast)+';const '+decl('listEntries').getText(ast)+';const '+filtered.getText(ast)+';exports.next=nextAppointments;exports.mine=filtered;',{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,scope);
  return {calendar:entries,mine:scope.exports.mine,next:scope.exports.next.filter(x=>x.g.reservationId===booking.id)};
 };
 let result=surfaces();assert.equal(result.mine.length,1);assert.equal(result.next.length,1);assert.equal(result.calendar[0].time,result.next[0].g.time);assert.equal(result.next[0].g.contactName,'GO PELUQUERÍA');assert.equal(result.next[0].g.intentLabel,'Corte');assert.equal(result.next[0].g.place,'Calle ficticia, Murcia');
 let request=await f.propose(booking.id);result=surfaces();assert.equal(result.next[0].g.time,'10:00');assert.equal(result.mine[0].time,'10:00');
 await f.repo.changeBooking(booking.id,f.store.businessId,'business','reject',{proposalId:request.changeProposal.id});assert.equal(surfaces().next[0].g.time,'10:00');
 request=await f.propose(booking.id);await f.repo.changeBooking(booking.id,f.store.businessId,'business','accept',{proposalId:request.changeProposal.id});result=surfaces();for(const row of [result.mine[0],result.calendar[0],result.next[0].g]){assert.equal(row.time,'12:00');assert.equal(row.reservationId,booking.id);}
 await f.repo.cancelBooking(booking.id);result=surfaces();assert.equal(result.next.length,0);assert.equal(result.mine.length,1);assert.equal(result.mine[0].bookingStatus,'cancelada');assert.equal(result.calendar[0].bookingStatus,'cancelada');assert.equal(f.store.getSnapshot().bookings.length,1);
});

test('proposing or cancelling a client draft preserves the existing Calendar layer and its scroll context',()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),nodes=[];(function walk(n){nodes.push(n);ts.forEachChild(n,walk)})(ast);
 const fn=nodes.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)==='openBookingProposal');
 for(const opened of [true,false]){const calls=[],context={calOpen:opened,calFlow:{open:opts=>context.options=opts},setCalOpen:value=>calls.push(value),confirmBookingDraft:()=>calls.push('confirm'),isGoDateTimePast:()=>false,lang:'es'};
  vm.runInNewContext(ts.transpileModule('('+fn.initializer.getText(ast)+')({id:"booking",dateISO:"2030-01-07",time:"10:00",duration:"30"});',{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,context);
  assert.deepEqual(calls,[true]);context.options.onCancel();assert.deepEqual(calls,opened?[true]:[true,false]);calls.length=0;context.options.onSave({dateISO:'2030-01-08',time:'12:00'});assert.deepEqual(calls,opened?['confirm']:[false,'confirm']);
 }
});

test('canonical customer confirmation refreshes its reservation without writing client/provider/task copies',async()=>{
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let callback;
 (function visit(n){if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='onBookingConfirmed'&&n.initializer?.expression?.getText(ast).includes('customerBookings.refresh'))callback=n.initializer.expression;ts.forEachChild(n,visit)})(ast);
 assert.ok(callback);let refresh=0,tutorial=0,writes=0;
 const context={exports:{},goView:{view:'USER'},demoBookingRepository:undefined,tutReservaRealizada:false,setTutReservaRealizada:()=>tutorial++,AsyncStorage:{setItem:async key=>{assert.equal(key,'tutorial.reservaRealizada');}},customerBookings:{refresh:async()=>refresh++},readGoLog:async()=>{writes++;throw Error('Not allowed');}};
 vm.runInNewContext(ts.transpileModule('exports.confirm = '+callback.getText(ast),{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,context);
 await context.exports.confirm({id:'reservation'});assert.equal(refresh,1);assert.equal(tutorial,1);assert.equal(writes,0);
 const overlay=fs.readFileSync('components/booking/BookingSearchOverlay.tsx','utf8');assert.ok(overlay.includes('if (!canonicalCustomerBookings) syncBookingToGoLog'));assert.ok(overlay.includes('canonicalCustomerBookings ? '));
});

test('company calendar cancellation clears only that proposal and keeps other negotiations confirmed',async()=>{
 const f=await fixture(),a=await f.create('10:00'),b=await f.create('11:00');await f.propose(a.id);await f.propose(b.id,'customer','13:00');
 const aEntry=f.store.getSnapshot().entries.find(e=>f.store.reservationBookingId(f.store.getSnapshot().reservations.find(r=>r.id===e.reservationId))===a.id);
 await f.store.updateEntries(entries=>entries.filter(e=>e.id!==aEntry.id));
 const rows=f.store.getSnapshot().bookings,cancelled=rows.find(row=>row.id===a.id),other=rows.find(row=>row.id===b.id);
 assert.equal(cancelled.status,'CANCELLED');assert.equal(cancelled.changeProposal,undefined);assert.equal(cancelled.changeHistory.at(-1).actor,'business');
 assert.equal(other.status,'CONFIRMED');assert.equal(other.startDatetime,b.startDatetime);assert.equal(other.changeProposal.time,'13:00');assert.equal(f.repo.getCustomerEntries().find(e=>e.bookingId===b.id).bookingStatus,'confirmada');
});

for(const bookingSource of ['canonical','DEMO'])test(bookingSource+' customer Calendar opens the real proposal flow beside Cancel and changes no booking until explicit confirmation',async()=>{
 const f=await fixture(),booking=await f.create(),before=plain(f.store.getSnapshot());
 // Use the production projection used by authenticated USER bookings. The DEMO
 // projection has a separate contract and must not be silently repaired in a test.
 const entry=bookingSource==='DEMO'?f.repo.getCustomerEntries()[0]:projection.customerBookingEntry(booking,{id:f.store.businessId,name:'GO PELUQUERÍA',location:'Calle ficticia, Murcia',timezone:'Europe/Madrid',phone:'',bookingColor:'#3D9A84'},f.service,f.staff.name);
 assert.equal(entry.customerBooking,true);
 const source=fs.readFileSync('app/index.tsx','utf8'),ast=ts.createSourceFile('home.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),all=[];
 (function visit(n){all.push(n);ts.forEachChild(n,visit)})(ast);
 const decl=name=>all.find(n=>ts.isVariableDeclaration(n)&&n.name.getText(ast)===name);
 const calendarHandler=all.find(n=>ts.isJsxAttribute(n)&&n.name.getText(ast)==='onProposeItem'&&n.initializer?.expression?.getText(ast).includes('const booking=customerBookings.entries.find'));
 assert.ok(calendarHandler,'use the actual customer Calendar connection');
 const alerts=[],mutations=[],toasts=[],calendarStates=[];
 const scope={exports:{},Date:Clock,lang:'es',calOpen:true,showToast:(...args)=>toasts.push(args),Alert:{alert:(...args)=>alerts.push(args)},
  setCalOpen:value=>calendarStates.push(value),getToday:()=>new Clock(),formatISODate:d=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-'),
  calFlow:{open:options=>{scope.draft=options}},customerBookings:{entries:[entry],mutate:(selected,operation,input)=>{
    assert.equal(selected.id,entry.id);const promise=f.repo.changeBooking(selected.reservationId,selected.businessId,'customer',operation,input);
    mutations.push({operation,input,promise});return promise;
  }},goLog:[],
 };
 const code=['isGoDateTimePast','runCustomerBooking','confirmBookingDraft','openBookingProposal'].map(name=>'const '+decl(name).getText(ast)+';').join('\n')+'\nexports.propose='+calendarHandler.initializer.expression.getText(ast)+';';
 vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,target:ts.ScriptTarget.ES2022}}).outputText,scope);
 const cal=calendarFixture({now:'2030-01-07T08:00:00'}),{AgendaBoard}=cal.load('components/AgendaOperativa.tsx');
 const props={goLog:[entry],viewMode:'dia',selectedDateISO:entry.dateISO,onProposeItem:scope.exports.propose,onDeleteItem:()=>{throw Error('Propose must not cancel the booking')}};
 const nodes=n=>!n||typeof n!=='object'?[]:[n,...(n.children??[]).flatMap(nodes)];
 const text=n=>typeof n==='string'?n:(n?.children??[]).map(text).join(' ');
 let tree=cal.render(AgendaBoard,props);
 const body=nodes(tree).find(n=>n.type==='TouchableOpacity'&&n.props.activeOpacity===0.85&&text(n).includes(entry.contactName));assert.ok(body);body.props.onPress();
 tree=cal.render(AgendaBoard,props);
 const detail=nodes(tree).find(n=>n.props.testID==='entry-details-scroll');assert.ok(detail);
 const propose=nodes(detail).find(n=>n.props.accessibilityLabel==='tasks_propose_change');
 const cancel=nodes(detail).find(n=>n.type==='TouchableOpacity'&&n.props.accessibilityLabel==='booking_state_rejected');
 assert.ok(propose);assert.ok(cancel);
 assert.equal(cancel.props.disabled,false);assert.equal(Object.assign({},...cancel.props.style).borderColor,'#FF000080');
 const sameRow=nodes(tree).find(n=>n.type==='View'&&n.children?.includes(propose)&&n.children?.includes(cancel));assert.ok(sameRow,'both customer actions share the same rendered action row');assert.equal(sameRow.props.style.flexDirection,'row');
 propose.props.onPress();
 assert.equal(scope.draft.startAt,'date');assert.equal(scope.draft.initialDateISO,entry.dateISO);assert.equal(scope.draft.initialTime,entry.time);assert.equal(scope.draft.initialDuration,entry.duration);
 assert.deepEqual(calendarStates,[true]);assert.equal(mutations.length,0);assert.deepEqual(plain(f.store.getSnapshot()),before);
 const result={dateISO:'2030-01-07',dateDraft:'Lunes 7',time:'12:00',duration:entry.duration};
 assert.equal(scope.draft.validate(result),null);scope.draft.onSave(result);
 assert.equal(alerts.at(-1)[0],'Confirmar propuesta de cambio');assert.equal(mutations.length,0);assert.deepEqual(plain(f.store.getSnapshot()),before);
 alerts.at(-1)[2].find(button=>button.style==='cancel').onPress();assert.equal(mutations.length,0);assert.deepEqual(plain(f.store.getSnapshot()),before);
 scope.draft.onSave(result);alerts.at(-1)[2].find(button=>button.text==='Confirmar propuesta').onPress();
 assert.equal(mutations.length,1);assert.equal(mutations[0].operation,'propose');assert.equal(mutations[0].input.acceptFinancialTerms,true);await mutations[0].promise;
 const saved=f.store.getSnapshot().bookings[0];assert.equal(saved.id,booking.id);assert.equal(saved.startDatetime,booking.startDatetime);assert.equal(saved.paymentStatus,booking.paymentStatus);
 assert.equal(saved.changeProposal.time,'12:00');assert.equal(saved.changeProposal.dateISO,'2030-01-07');assert.equal(f.store.getSnapshot().bookings.length,1);
});

test('legacy booking without slotKey projects its original key without storage writes or cross-company adoption after Reload',async()=>{
 const memory=new Map();let writes=0;const save=memory.set.bind(memory);memory.set=(key,value)=>{writes++;return save(key,value)};
 const f=await fixture(company,memory),other=await fixture(otherCompany,memory),booking=await f.create(),controlBooking=await other.create();
 const originalSlotKey=booking.slotKey;assert.ok(originalSlotKey);
 await f.store.transactBookings(data=>{delete data.bookings.find(row=>row.id===booking.id).slotKey;});
 assert.equal(f.store.getSnapshot().bookings[0].slotKey,undefined,'legacy setup removes the persisted booking field');
 const persistedBefore=JSON.stringify([...memory]),writesBefore=writes,otherBefore=plain(other.store.getSnapshot());
 const assertProjection=(store,repo)=>{
  const companyEntry=store.getSnapshot().entries.find(entry=>entry.reservationId===booking.id);
  const clientEntry=repo.getCustomerEntries().find(entry=>entry.bookingId===booking.id);
  assert.ok(companyEntry);assert.ok(clientEntry);
  for(const entry of [companyEntry,clientEntry]){
    assert.equal(entry.slotKey,originalSlotKey);assert.equal(entry.businessId,f.store.businessId);assert.equal(entry.staffId,booking.staffId);assert.equal(entry.ownerUserId,owner);
    assert.equal(entry.startDatetime,booking.startDatetime);assert.equal(entry.endDatetime,booking.endDatetime);assert.notEqual(entry.reservationId,controlBooking.id);
  }
 };
 assertProjection(f.store,f.repo);assert.equal(writes,writesBefore);assert.equal(JSON.stringify([...memory]),persistedBefore);
 const reopened=f.make();await reopened.load();
 assertProjection(reopened,repoModule.createDemoBookingRepository(reopened,{now:()=>clock}));
 assert.equal(reopened.getSnapshot().bookings[0].slotKey,undefined,'projection does not migrate or backfill the legacy row');
 assert.equal(writes,writesBefore);assert.equal(JSON.stringify([...memory]),persistedBefore);assert.deepEqual(plain(other.store.getSnapshot()),otherBefore);
});
