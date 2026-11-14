import {test} from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import {createRequire} from 'node:module';
const require=createRequire(path.join(process.cwd(),'package.json')),{React,createRoot,document,ts}=require('./tests/helpers/react-lifecycle.cjs');
const compile=source=>ts.transpileModule(source,{compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const projection={exports:{}};vm.runInNewContext(compile(fs.readFileSync('data/customerBookingProjection.ts','utf8')),projection);
const presentation={exports:{}};vm.runInNewContext(compile(fs.readFileSync('data/goEntryPresentation.ts','utf8')),presentation);
const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',company='33333333-3333-4333-8333-333333333333',secondCompany='44444444-4444-4444-8444-444444444444',bookingId='55555555-5555-4555-8555-555555555555';
const booking={id:bookingId,businessId:company,bookableItemId:'cut',customerId:other,startDatetime:'2035-01-07T10:00:00',endDatetime:'2035-01-07T11:00:00',status:'CONFIRMED',paymentStatus:'none',changeRevision:3,changeProposal:{id:'proposal',proposedBy:'customer',dateISO:'2035-01-07',time:'12:00'},receipt:{serviceName:'Corte',staffName:'Ana'}};
async function fixture(options={}){
 let user=owner,business=company,model,session,update,revision=0,setVersion;
 const calls=[],listeners=new Set(),businesses=[company,secondCompany].map(id=>({id,name:'Test company',timezone:'UTC',location:'Test street',phone:''}));
 const api={getAuthenticatedUserId:async()=>user,getOwnedBusinesses:async()=>user===owner?businesses:[],getLiveBusinessBookings:async id=>options.readBookings?options.readBookings(id):[{...booking,businessId:id}],changeBookingRequest:async(...args)=>{calls.push(args);},subscribeBookingUpdates:fn=>{update=fn;return()=>update=undefined;}};
 const scope={exports:{},Error,console,setInterval:()=>1,clearInterval(){},require:key=>key==='@/data/goEntryPresentation'?presentation.exports:key==='react'?React:key==='react-native'?{AppState:{addEventListener:(_event,fn)=>{listeners.add(fn);return{remove:()=>listeners.delete(fn)};}}}:key==='@/data/booking'?api:key==='@/data/customerBookingProjection'?projection.exports:key==='@/lib/sessionEvents'?{onSessionChanged:fn=>{session=fn;return()=>session=undefined;}}:undefined};
 vm.runInNewContext(compile(fs.readFileSync('hooks/useBusinessBookings.ts','utf8')),scope);
 const settle=async fn=>React.act(async()=>{await fn?.();for(let i=0;i<15;i++)await new Promise(resolve=>setImmediate(resolve));});
 function Fixture(){const [v,set]=React.useState(revision);setVersion=set;model=scope.exports.useBusinessBookings(business,true);return React.createElement('div',null,v);}
 const root=createRoot(document.createElement('div'));await settle(()=>root.render(React.createElement(Fixture)));
 return {get model(){return model},calls,module:scope.exports,settle,async switchCompany(id){business=id;await settle(()=>setVersion(++revision));},async switchUser(id){user=id;await settle(()=>session?.());},async close(){await settle(()=>root.unmount());assert.equal(listeners.size,0);},async update(){await settle(()=>update?.());}};
}
test('business calendar uses the one canonical ID, incoming proposal, current revision and existing server command',async()=>{
 const f=await fixture();try{const entry=f.model.entries[0];assert.equal(entry.reservationId,bookingId);assert.equal(entry.customerBooking,false);assert.equal(entry.businessBooking,true);assert.equal(entry.estado,'propuesto');assert.equal(entry.professionalName,'Ana');assert.equal(entry.bookingChangeRevision,3);
 await f.settle(()=>f.model.mutate(entry,'accept',{acceptFinancialTerms:true}));assert.equal(f.calls.length,1);const [id,op,input,user]=f.calls[0];assert.equal(id,bookingId);assert.equal(op,'accept');assert.equal(input.expectedRevision,3);assert.equal(input.proposalId,'proposal');assert.equal(user,owner);
 }finally{await f.close();}
});
test('business/account changes reject retained callbacks without a write and remove the prior scope',async()=>{
 const f=await fixture();try{const previous=f.model,entry=previous.entries[0];await f.switchCompany(secondCompany);assert.ok(f.model.entries.every(e=>e.businessId===secondCompany));await assert.rejects(previous.mutate(entry,'cancel'),/identidad|empresa/);assert.equal(f.calls.length,0);
 const old=f.model,otherEntry=old.entries[0];await f.switchUser(other);assert.equal(f.model.entries.length,0);await assert.rejects(old.mutate(otherEntry,'cancel'),/identidad|empresa/);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});
test('business canonical merge drops stale cloud mirrors but keeps unrelated GO actions; it writes no local booking copy',async()=>{
 const f=await fixture();try{const canonical=f.model.entries[0],task={id:'task',type:'TAREA'},legacy={id:'go_booking_old',type:'GO_BOOKING',reservationId:bookingId},foreign={...legacy,id:'foreign',reservationId:'66666666-6666-4666-8666-666666666666'};
 const merged=f.module.mergeBusinessBookingEntries([task,legacy,foreign],f.model.entries);assert.equal(merged.length,2);assert.equal(merged[0].id,'task');assert.equal(merged[1].id,canonical.id);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('canonical duration uses elapsed instants across DST, rather than subtracting equal local clock labels',()=>{
 const entry=projection.exports.customerBookingEntry({...booking,startDatetime:'2027-10-31T02:30:00',endDatetime:'2027-10-31T02:30:00',startInstant:'2027-10-31T00:30:00Z',endInstant:'2027-10-31T01:30:00Z'},{id:company,name:'Test',timezone:'Europe/Madrid',location:'',phone:''},{title:'Corte'});
 assert.equal(entry.time,'02:30');assert.equal(entry.endTime,'02:30');assert.equal(entry.duration,'60min');
});

test('a temporary booking read failure keeps the last confirmed reservations and retry restores the same IDs',async()=>{
 let offline=false;const f=await fixture({readBookings:async id=>{if(offline)throw Error('Offline');return[{...booking,businessId:id}];}});
 try{offline=true;await f.update();assert.equal(f.model.entries[0].reservationId,bookingId);assert.equal(f.model.error,'Offline');assert.equal(f.model.loading,false);
 offline=false;await f.update();assert.equal(f.model.error,'');assert.equal(f.model.entries.length,1);assert.equal(f.model.entries[0].reservationId,bookingId);assert.equal(f.calls.length,0);
 }finally{await f.close();}
});

test('a new session of the same account invalidates previously retained reservation commands',async()=>{
 const f=await fixture();try{const previous=f.model,entry=previous.entries[0];await f.switchUser(owner);await assert.rejects(previous.mutate(entry,'cancel'),/identidad|empresa/);assert.equal(f.calls.length,0);assert.equal(f.model.entries.length,1);}finally{await f.close();}
});

test('foreign booking rows cannot be projected into the current business or replace confirmed rows',async()=>{
 let foreign=false;const f=await fixture({readBookings:async id=>[{...booking,businessId:foreign?secondCompany:id}]});
 try{foreign=true;await f.update();assert.match(f.model.error,/no corresponden/);assert.equal(f.model.entries[0].businessId,company);assert.equal(f.calls.length,0);}finally{await f.close();}
});

const plain=value=>JSON.parse(JSON.stringify(value));
function serverFixture(file,transport){
 const routes=new Map(),middleware=[],calls=[];
 const router={use:fn=>middleware.push(fn)};for(const method of ['get','post','put','patch','delete'])router[method]=(route,fn)=>routes.set(method+':'+route,fn);
 const exports={};vm.runInNewContext(compile(fs.readFileSync('../api-server/src/routes/'+file+'.ts','utf8')),{exports,Error,Intl,Date,URLSearchParams,console,require:key=>key==='express'?{Router:()=>router}:key==='../lib/supabase'?{
  bearerHeader:value=>value?.startsWith('Bearer ')?{Authorization:value}:{},
  supabaseRequest:async(url,init={})=>{calls.push({url,init});return transport(url,init);},
 }:undefined});
 return{calls,async run(route,query={},authorization='Bearer test-owner'){
  const req={query,body:{},header:()=>authorization},res={locals:{userId:owner},statusCode:200,value:null,headers:{},setHeader(k,v){this.headers[k]=v;},status(code){this.statusCode=code;return this;},json(value){this.value=plain(value);return this;}};
  for(const fn of middleware){let next=false;await fn(req,res,()=>{next=true;});if(!next)return res;}
  await routes.get(route)(req,res);return res;
 }};
}
const sourceId='local-explicit-company';
function sourceServer(options={}){
 return serverFixture('bookingCalendar',async url=>{
  const parsed=new URL('http://local.test'+url),q=parsed.searchParams;
  if(url.startsWith('/rest/v1/rpc/'))return Response.json(options.rpc??{code:'PGRST202'},{status:options.rpcStatus??404});
  if(url==='/auth/v1/user')return Response.json(options.user??{id:owner},{status:options.authStatus??200});
  if(options.offline)throw Error('Offline');
  if(parsed.pathname==='/rest/v1/businesses'){
   assert.equal(q.get('owner_id'),'eq.'+owner);assert.equal(q.get('verified'),'eq.true');
   return Response.json(q.has('id')&&q.get('id')!=='eq.'+company?[]:[{id:company,name:'Existing',timezone:'Atlantic/Canary'}]);
  }
  if(parsed.pathname==='/rest/v1/business_settings'){
   assert.equal(q.get('business_id'),'in.('+company+')');assert.equal(q.get('payload->>businessId'),'eq.'+sourceId);
   return Response.json(options.settings??[]);
  }
  if(['services','staff'].some(table=>parsed.pathname==='/rest/v1/'+table)){
   assert.equal(q.get('business_id'),'eq.'+company);
   return Response.json([{id:bookingId,business_id:company,ui_metadata:{calendarSourceServiceId:'local-service',calendarSourceStaffId:'local-staff'}}]);
  }
  throw Error('Unexpected request '+url);
 });
}

test('missing source SQL still reads the exact canonical business and stored IANA zone through authenticated owner records',async()=>{
 const f=sourceServer(),result=await f.run('get:/booking-calendar-business',{source_id:company});
 assert.equal(result.statusCode,200);assert.equal(result.value.businessId,company);assert.equal(result.value.timezone,'Atlantic/Canary');assert.equal(result.value.sourceId,company);
 assert.equal(result.value.serviceLinks[0].sourceId,'local-service');assert.equal(result.value.staffLinks[0].sourceId,'local-staff');assert.equal(result.value.bookingAuthority,false);
 assert.equal(result.headers['Cache-Control'],'no-store');assert.ok(f.calls.every(call=>call.init.headers.Authorization==='Bearer test-owner'));
 assert.ok(f.calls.every(call=>!call.init.method||call.url.startsWith('/rest/v1/rpc/')&&call.init.method==='POST'),'Fallback only reads records');
});

test('a legacy business resolves only through its exact persisted settings link, never by name or first owned company',async()=>{
 const f=sourceServer({settings:[{business_id:company,payload:{businessId:sourceId}}]}),r=await f.run('get:/booking-calendar-business',{source_id:sourceId});
 assert.equal(r.statusCode,200);assert.equal(r.value.sourceId,sourceId);assert.equal(r.value.businessId,company);
 const missing=await sourceServer().run('get:/booking-calendar-business',{source_id:sourceId});assert.equal(missing.statusCode,501);assert.equal(missing.value.code,'BOOKING_CALENDAR_LINK_UNAVAILABLE');
 const forged=await sourceServer({settings:[{business_id:secondCompany,payload:{businessId:sourceId}}]}).run('get:/booking-calendar-business',{source_id:sourceId});assert.equal(forged.statusCode,501);
 const ambiguous=await sourceServer({settings:[{business_id:company,payload:{businessId:sourceId}},{business_id:company,payload:{businessId:sourceId}}]}).run('get:/booking-calendar-business',{source_id:sourceId});assert.equal(ambiguous.statusCode,503);
});

test('source resolution preserves working RPC links and distinguishes forbidden, missing membership and temporary failures',async()=>{
 const response={businessId:company,sourceId,name:'Existing',timezone:'Europe/Madrid',serviceLinks:[],staffLinks:[],bookingLinks:[{id:bookingId,sourceId:'historical'}]};
 const existing=sourceServer({rpc:response,rpcStatus:200});assert.deepEqual((await existing.run('get:/booking-calendar-business',{source_id:sourceId})).value,response);assert.equal(existing.calls.length,1);
 const denied=sourceServer({rpc:{code:'42501'},rpcStatus:403});assert.equal((await denied.run('get:/booking-calendar-business',{source_id:company})).statusCode,403);assert.equal(denied.calls.length,1);
 assert.equal((await sourceServer().run('get:/booking-calendar-business',{source_id:secondCompany})).statusCode,404);
 assert.equal((await sourceServer({offline:true}).run('get:/booking-calendar-business',{source_id:company})).statusCode,503);
 assert.equal((await sourceServer({user:{},authStatus:401}).run('get:/booking-calendar-business',{source_id:company})).statusCode,401);
 const anonymous=sourceServer();assert.equal((await anonymous.run('get:/booking-calendar-business',{source_id:company},'')).statusCode,401);assert.equal(anonymous.calls.length,0);
});

test('configuration API scopes settings to the selected verified owner business while preserving the legacy unfiltered contract',async()=>{
 const f=serverFixture('management',async url=>{
  const parsed=new URL('http://local.test'+url),q=parsed.searchParams;
  if(url==='/auth/v1/user')return Response.json({id:owner});
  if(parsed.pathname==='/rest/v1/businesses'){
   assert.equal(q.get('owner_id'),'eq.'+owner);assert.equal(q.get('verified'),'eq.true');
   return Response.json(q.get('id')==='eq.'+other?[]:q.has('id')?[{id:company}]:[{id:company},{id:secondCompany}]);
  }
  if(parsed.pathname==='/rest/v1/business_settings')return Response.json([{business_id:company,payload:{businessName:'Selected'}}]);
  throw Error('Unexpected '+url);
 });
 let r=await f.run('get:/configuration',{business_id:company});assert.equal(r.statusCode,200);assert.equal(r.headers['Cache-Control'],'no-store');
 let settings=f.calls.find(call=>call.url.startsWith('/rest/v1/business_settings'));assert.equal(new URL('http://local.test'+settings.url).searchParams.get('business_id'),'in.('+company+')');
 r=await f.run('get:/configuration',{business_id:other});assert.equal(r.statusCode,404);
 r=await f.run('get:/configuration',{business_id:'local'});assert.equal(r.statusCode,400);
 r=await f.run('get:/configuration');assert.equal(r.statusCode,200);
});

test('cloud configuration client requests the selected UUID and rejects a foreign or malformed acknowledgement',async()=>{
 const source=fs.readFileSync('data/booking.ts','utf8'),ast=ts.createSourceFile('booking.ts',source,ts.ScriptTarget.Latest,true);
 const fn=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='getCloudConfiguration').getText(ast);
 let rows=[{business_id:company,payload:{businessId:'stale-local',businessName:'Selected'}}];const calls=[],scope={exports:{},URLSearchParams,isCloudId:value=>/^[0-9a-f-]{36}$/.test(value),management:'/supabase/manage',BookingApiError:Error,supabaseApiRequest:async(...args)=>{calls.push(args);return rows;}};
 vm.runInNewContext(compile('export '+fn.replace(/^export /,'')),scope);
 const value=await scope.exports.getCloudConfiguration(company,owner);assert.equal(value.businessId,company);assert.equal(calls[0][0],'/supabase/manage/configuration?business_id='+company);assert.equal(calls[0][3],owner);
 rows=[{business_id:secondCompany,payload:{}}];await assert.rejects(scope.exports.getCloudConfiguration(company,owner));
 for(const malformed of [null,{},[{business_id:company,payload:[]}],[{business_id:'local',payload:{}}]]){rows=malformed;await assert.rejects(scope.exports.getCloudConfiguration(company,owner));}
 rows=[];assert.equal(await scope.exports.getCloudConfiguration(company,owner),null);
});

function configSource(options={}){
 const calls=[],defaults={businessName:'',address:'',services:[],plantillaItems:[],activeDays:[0,1,2,3,4],daySchedules:{},staffSchedules:{},completedSteps:[],openFrom:'09:00',openTo:'20:00'};
 const business={id:company,name:'Existing',category:'peluqueria',location:'Existing street',timezone:'Atlantic/Canary',phone:'',bookingActive:false};
 const api={getAuthenticatedUserId:async()=>options.user??owner,getOwnedBusinesses:async user=>{calls.push(['businesses',user]);return options.businesses??[business];},getCloudConfiguration:async(id,user)=>{calls.push(['settings',id,user]);if(options.failure)throw Error('Temporary failure');return options.saved??null;},
 getOwnedBookableItems:async(id,user)=>{calls.push(['services',id,user]);return[{id:'service',businessId:company,title:'Corte',durationMinutes:30,price:20,customerCapacity:1}];},
 getOwnedStaff:async(id,user)=>{calls.push(['staff',id,user]);return[{id:'staff',businessId:company,name:'Ana',active:true,serviceIds:['service']}];},
 getOwnedAvailabilityWindows:async(id,user)=>{calls.push(['hours',id,user]);return options.windows??[{id:'hours',businessId:company,weekday:1,shiftIndex:0,visibleStartHour:10,visibleStartMinute:15,visibleEndHour:14,visibleEndMinute:30,active:true}];}};
 const scope={exports:{},Error,require:key=>key==='./booking'?api:key==='./serviceTiming'?{validateBusinessTimezone:value=>{new Intl.DateTimeFormat('en',{timeZone:value});return value;}}:key==='@/data/goSectorData'?{SECTORS:[{id:'belleza',subs:[{id:'peluqueria'}]}]}:undefined};
 vm.runInNewContext(compile(fs.readFileSync('data/synchronizedBusinessConfig.ts','utf8')),scope);
 return{load:()=>scope.exports.loadSynchronizedBusinessConfig(company,owner,defaults),api:scope.exports,calls,defaults};
}

test('all wizard fields rehydrate the selected business, saved settings and actual server zone without writes',async()=>{
 const saved={businessId:company,businessName:'Custom name',timezone:'Europe/Madrid',daySchedules:{'0':{shift1:{from:'11:00',to:'18:00',active:true}}},activeDays:[0],services:[{name:'Existing service'}],plantillaItems:[],completedSteps:[0,1,2,3,4,5,6,7]};
 const f=configSource({saved}),loaded=await f.load();assert.equal(loaded.businessId,company);assert.equal(loaded.timezone,'Atlantic/Canary');assert.deepEqual(plain(loaded.daySchedules),saved.daySchedules);assert.deepEqual(plain(loaded.services),saved.services);assert.equal(loaded.completedSteps.length,8);assert.equal(f.calls.length,2);
 const reloaded=await f.load();assert.deepEqual(plain(reloaded),plain(loaded));assert.ok(f.calls.every(call=>call[0]==='businesses'?call[1]===owner:call[1]===company&&call[2]===owner));
});

test('an existing business without a settings document reads its real company, staff, services and weekly hours rather than seeding defaults',async()=>{
 const f=configSource(),value=await f.load();assert.equal(value.businessId,company);assert.equal(value.businessName,'Existing');assert.equal(value.timezone,'Atlantic/Canary');assert.deepEqual(plain(value.activeDays),[0]);
 assert.equal(value.daySchedules['0'].shift1.from,'10:15');assert.equal(value.daySchedules['0'].shift1.to,'14:30');assert.equal(value.services[0].name,'Corte');assert.deepEqual(plain(value.plantillaItems[0].staffIds),['staff']);assert.equal(value.staffSchedules.staff.useCompanySchedule,true);
 const closed=await configSource({windows:[]}).load();assert.deepEqual(plain(closed.activeDays),[]);assert.deepEqual(plain(closed.daySchedules),{});
});

test('temporary failures, changed identity, unowned companies and unsupported/foreign hours never produce an editable default configuration',async()=>{
 await assert.rejects(configSource({failure:true}).load(),/Temporary/);await assert.rejects(configSource({businesses:[]}).load(),/no está disponible/);await assert.rejects(configSource({user:other}).load(),/cuenta ha cambiado/);
 await assert.rejects(configSource({windows:[{businessId:secondCompany}]}).load(),/otra empresa/);
 await assert.rejects(configSource({windows:[{businessId:company,weekday:1,shiftIndex:2,active:true}]}).load(),/conservan/);
 await assert.rejects(configSource({saved:{businessName:'Incomplete'}}).load(),/incompleta/);
});

const gate=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
async function providerFixture(read=async id=>({businessId:id,businessName:id===company?'Selected':'Second',timezone:'Atlantic/Canary',activeDays:[0],daySchedules:{'0':{shift1:{from:'10:15',to:'14:30',active:true},shift2:{from:'16:00',to:'20:00',active:false}}},completedSteps:[0,1,2,3,4,5,6,7]}),storage=new Map()){
 let access={allowed:true,snapshot:{userId:owner,business:{id:company}}},model,setVersion,version=0;
 const calls=[],writes=[],listeners=new Set(),scope={exports:{},Error,console,setTimeout:()=>1,clearTimeout(){},require:key=>{
  if(key==='react')return{default:React,...React};
  if(key==='react-native')return{Alert:{alert(){}},AppState:{}};
  if(key==='@/lib/sessionEvents')return{onSessionChanged:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  if(key==='./GoBusinessAccessContext')return{useBusinessAccess:()=>access};
  if(key==='./GoViewContext')return{useGoView:()=>({})};
  if(key==='./GoAdminAccessContext')return{useAdminAccess:()=>({})};
  if(key==='./OwnerBusinessDemoContext')return{useOwnerBusinessDemo:()=>({})};
  if(key==='@react-native-async-storage/async-storage')return{default:{getItem:async key=>storage.get(key)??null,setItem:async(...args)=>writes.push(args),removeItem:async()=>{}}};
  if(key==='@/data/businessCalendarWorkHours')return{BUSINESS_WORK_HOURS_PREFERENCE:'hours',businessWorkHoursKey:(user,business)=>user+':'+business};
  if(key==='@/data/goSectorData')return{SECTORS:[],SUGGESTED_SERVICES:{},initPlantillaItems:()=>[]};
  if(key==='@/data/serviceTiming')return{};
  if(key==='@/data/booking')return{getAuthenticatedUserId:async()=>access.snapshot?.userId??null,getCloudConfiguration:async(id,user)=>{calls.push({id,user});return read(id,user);}};
  if(key==='@/data/synchronizedBusinessConfig')return{loadSynchronizedBusinessConfig:async(id,user,defaults,saved)=>({...defaults,...saved,businessId:id})};
  throw Error('Unexpected provider import '+key);
 }};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('contexts/GoBusinessConfigContext.tsx','utf8'),{compilerOptions:{esModuleInterop:false,alwaysStrict:false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
 const settle=async action=>React.act(async()=>{await action?.();for(let i=0;i<12;i++)await new Promise(setImmediate);});
 function Probe(){model=scope.exports.useBusinessConfig();return React.createElement('div',null,model.config.businessName);}
 function Fixture(){const[v,set]=React.useState(0);setVersion=set;return React.createElement(scope.exports.GoBusinessConfigProvider,null,React.createElement(Probe,{v}));}
 const root=createRoot(document.createElement('div'));await settle(()=>root.render(React.createElement(Fixture)));
 return{get model(){return model;},calls,writes,settle,async select(id){access={...access,snapshot:{...access.snapshot,business:{id}}};await settle(()=>setVersion(++version));},async permission(allowed){access={...access,allowed};await settle(()=>setVersion(++version));},async session(userId){access={...access,snapshot:{...access.snapshot,userId}};await settle(()=>{for(const listener of listeners)listener();setVersion(++version);});},async close(){await settle(()=>root.unmount());assert.equal(listeners.size,0);}};
}

test('the shared wizard provider loads the selected business once, survives retry/reload and never writes while hydrating',async()=>{
 let failed=true;const f=await providerFixture(async id=>{if(failed)throw Error('Temporary failure');return{businessId:id,businessName:'Recovered',timezone:'Europe/Madrid',activeDays:[0],daySchedules:{},completedSteps:[0,1,2,3,4,5,6,7]};});
 try{assert.equal(f.model.loaded,false);assert.match(f.model.loadError,/Temporary/);assert.equal(f.model.config.businessId,undefined);assert.equal(f.writes.length,0);
 f.model.updateConfig({businessName:'Must not upload defaults'});assert.equal(f.writes.length,0);
 failed=false;await f.settle(()=>f.model.reloadConfig());assert.equal(f.model.loaded,true);assert.equal(f.model.config.businessId,company);assert.equal(f.model.config.timezone,'Europe/Madrid');assert.equal(f.model.config.completedSteps.length,8);assert.equal(f.writes.length,0);
 await f.settle(()=>f.model.reloadConfig());assert.equal(f.model.config.businessName,'Recovered');assert.ok(f.calls.every(call=>call.id===company&&call.user===owner));assert.equal(f.writes.length,0);
 }finally{await f.close();}
});

test('late company and session responses cannot hydrate another wizard; permission loss clears private configuration',async()=>{
 const pending=gate();const f=await providerFixture(async(id,user)=>id===company?pending.promise:{businessId:id,businessName:user===owner?'Second':'Other account',timezone:'UTC'});
 try{assert.equal(f.model.loaded,false);await f.select(secondCompany);assert.equal(f.model.config.businessId,secondCompany);
 pending.resolve({businessId:company,businessName:'Late first business'});await f.settle();assert.equal(f.model.config.businessId,secondCompany);assert.equal(f.model.config.businessName,'Second');
 await f.session(other);assert.equal(f.model.config.businessName,'Other account');assert.equal(f.calls.at(-1).user,other);assert.equal(f.writes.length,0);
 await f.permission(false);assert.equal(f.model.config.businessId,undefined);assert.equal(f.model.config.businessName,'');f.model.updateConfig({businessName:'Denied'});assert.equal(f.writes.length,0);
 }finally{await f.close();}
});

test('a pre-existing account draft is recovered only for its exact owned company and is never silently uploaded',async()=>{
 const key='go_business_config_v1:'+owner,storage=new Map([[key,JSON.stringify({businessId:company,businessName:'Unsynchronized edits',activeDays:[0],services:[],plantillaItems:[]})]]),f=await providerFixture(async()=>null,storage);
 try{assert.equal(f.model.config.businessName,'Unsynchronized edits');assert.equal(f.model.config.businessId,company);assert.equal(f.writes.length,0);
 await f.select(secondCompany);assert.equal(f.model.config.businessId,secondCompany);assert.notEqual(f.model.config.businessName,'Unsynchronized edits');assert.equal(f.writes.length,0);assert.ok(storage.has(key));
 }finally{await f.close();}
});

async function wizardFixture(){
 // Reuse the existing eight-step UI harness without registering its unrelated
 // suites. Supply its missing discount-component mock in this focused suite.
 const file=fs.readFileSync('tests/business-demo.test.mjs','utf8'),ast=ts.createSourceFile('fixture.mjs',file,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
 let declarations=ast.statements.filter(node=>ts.isVariableStatement(node)||ts.isFunctionDeclaration(node)||ts.isClassDeclaration(node)).map(node=>node.getText(ast)).join('\n');
 declarations=declarations.replace('if (key === "./CalendarExceptionsSection")','if (key === "./BookingDiscountSection") return { BookingDiscountSection: () => null };\n        if (key === "./CalendarExceptionsSection")');
 const publication=await import('./helpers/module-publication-fixture.mjs');
 const scope={console,Date,Set,Map,Promise,Error,process,setImmediate,createRequire,path,vm,readFileSync:fs.readFileSync,...publication};
 vm.runInNewContext(declarations+'\nglobalThis.fixture = {dataFixture,uiFixture,button,component,nodes,text,turn,floor};',scope);
 return scope.fixture;
}

test('the existing business wizard completes all eight steps and reopens with the same company, hours and timezone',async()=>{
 const h=await wizardFixture(),f=h.dataFixture();await f.store.updateConfig({businessName:'Existing company',address:'Existing address',phone:'912345678',sectorId:'belleza',subId:'peluqueria',timezone:'Atlantic/Canary',activeDays:[0],daySchedules:{'0':{shift1:{from:'10:15',to:'14:30',active:true},shift2:{from:'16:00',to:'20:00',active:false}}},services:[{name:'Corte',duration:30,price:20,capacity:1}],plantillaItems:[{id:'pro',label:'Puesto',emoji:'',count:1,staffNames:['Profesional']}]});
 await f.store.saveFloorPlan(h.floor(f.store));const before=plain(f.store.getSnapshot().config),ui=h.uiFixture(f),Screen=ui.load('components/empresa/EmpresaConfigScreen.tsx').EmpresaConfigScreen;let finished=0;
 for(let step=0;step<8;step++){const tree=ui.render(Screen,{onBack(){},startAtSteps:true,onFinalizarConfig:()=>finished++});const next=h.button(tree,step===7?'biz_finish_config':'biz_next');assert.ok(next,'Navigation for step '+step);next.props.onPress();await h.turn();}
 assert.equal(finished,1);const reopened=f.make();await reopened.load();const saved=plain(reopened.getSnapshot().config);assert.deepEqual(saved.completedSteps,[0,1,2,3,4,5,6,7]);
 assert.equal(saved.businessId,before.businessId);assert.equal(saved.timezone,before.timezone);assert.deepEqual(saved.daySchedules,before.daySchedules);assert.deepEqual(saved.services,before.services);assert.equal(ui.calls.external,0);
});

test('Horario habitual retries a failed server timezone read without altering weekly hours, and a late read cannot overwrite a chosen timezone',async()=>{
 const h=await wizardFixture(),f=h.dataFixture();await f.store.updateConfig({sectorId:'belleza',subId:'peluqueria'});const before=plain(f.store.getSnapshot().config);let offline=true;
 const ui=h.uiFixture(f,{timezoneResolver:async source=>{if(offline)throw Error('Temporary server failure');return{sourceId:source,businessId:company,name:'Existing',timezone:'Atlantic/Canary'};}}),Screen=ui.load('components/empresa/EmpresaConfigScreen.tsx').EmpresaConfigScreen;
 const step=h.component(ui.render(Screen,{onBack(){},startAtSteps:true,initialStep:2}),'StepHorario');ui.render(step.type,step.props);await h.turn();let tree=ui.render(step.type,step.props);
 assert.ok(h.nodes(tree).some(node=>node.props?.accessibilityRole==='alert'));assert.equal(f.store.getSnapshot().config.timezone,undefined);
 offline=false;h.nodes(tree).find(node=>node.props?.testID==='business-timezone-retry').props.onPress();ui.render(step.type,step.props);await h.turn();tree=ui.render(step.type,step.props);
 assert.ok(h.text(h.nodes(tree).find(node=>node.props?.testID==='business-timezone-selector')).includes('Atlantic/Canary'));assert.deepEqual(plain(f.store.getSnapshot().config.daySchedules),before.daySchedules);
 const fresh=h.dataFixture();await fresh.store.updateConfig({sectorId:'belleza',subId:'peluqueria'});const pending=gate(),race=h.uiFixture(fresh,{timezoneResolver:source=>pending.promise.then(()=>({sourceId:source,businessId:company,name:'Existing',timezone:'Europe/Madrid'})),timezoneAdapter:async(_source,zone)=>zone}),Race=race.load('components/empresa/EmpresaConfigScreen.tsx').EmpresaConfigScreen;
 const racedStep=h.component(race.render(Race,{onBack(){},startAtSteps:true,initialStep:2}),'StepHorario');tree=race.render(racedStep.type,racedStep.props);
 h.nodes(tree).find(node=>node.props?.testID==='business-timezone-selector').props.onPress();tree=race.render(racedStep.type,racedStep.props);h.nodes(tree).find(node=>node.props?.testID==='business-timezone-option-Atlantic/Canary').props.onPress();await h.turn();pending.resolve();await h.turn();
 assert.equal(fresh.store.getSnapshot().config.timezone,'Atlantic/Canary');
});

function registeredFixture(bookings=[]){
 const service='66666666-6666-4666-8666-666666666666',staff='77777777-7777-4777-8777-777777777777',local='registered-local',calls=[];
 const source={sourceId:local,businessId:company,timezone:'UTC',serviceLinks:[{id:service,sourceId:'local-service'}],staffLinks:[{id:staff,sourceId:'local-staff'}],bookingLinksComplete:false};
 const row={...booking,customerId:owner,bookableItemId:service,staffId:staff,receipt:{staffName:'Ana',serviceName:'Corte'}};
 const data={ownerUserId:owner,config:{services:[]},bookings,entries:[],reservations:[]};
 const store={ownerUserId:owner,businessId:local,load:async()=>data,transactBookings:async fn=>{calls.push('projection');return fn(data);}};
 class ApiError extends Error{}
 const scope={exports:{},Error,URLSearchParams,require:key=>key==='./booking'?{BookingApiError:ApiError,getAuthenticatedUserId:async()=>owner,supabaseApiRequest:async()=>source,getLiveBusinessBookings:async(id,user)=>{calls.push({id,user});return[row];}}:key==='./businessDemoStore'?{businessDemoProfessionalElement:()=>({id:'seat'})}:key==='./bookingTimeline'?{businessWallTime:instant=>instant}:key==='./catalogAssociations'?{}:undefined};
 vm.runInNewContext(compile(fs.readFileSync('data/registeredBookingRepository.ts','utf8')),scope);
 return{repo:scope.exports.withRegisteredBookingAuthority({},store,()=>{}),calls,data,row};
}

test('registered bookings are read from the server even after an empty local cache; reload uses persisted canonical IDs without duplicates',async()=>{
 const f=registeredFixture();const rows=await f.repo.getMyBookings();assert.equal(rows.length,1);assert.equal(rows[0].serverBookingId,bookingId);assert.equal(f.calls[0].id,company);assert.equal(f.calls[0].user,owner);
 const original={...rows[0],id:'historical-local-id'},reload=registeredFixture([original]);const again=await reload.repo.getMyBookings();assert.equal(again.length,1);assert.equal(again[0].id,'historical-local-id');assert.equal(again[0].serverBookingId,bookingId);
});

test('unavailable imported booking links retain unresolved history and never pretend an empty link list is complete',async()=>{
 const original={id:'unresolved-history',customerId:owner},f=registeredFixture([original]);await assert.rejects(f.repo.getMyBookings(),/sin duplicarlas/);assert.equal(f.data.bookings.length,1);assert.equal(f.data.bookings[0],original);assert.equal(f.calls.length,0);
});

test('saving renamed professionals preserves their persisted IDs, distinct equal names and inactive state',async()=>{
 const source=fs.readFileSync('contexts/GoBusinessConfigContext.tsx','utf8'),ast=ts.createSourceFile('provider.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ensureBookingRecord').getText(ast);
 const staffIds=['66666666-6666-4666-8666-666666666666','77777777-7777-4777-8777-777777777777'],saved=[];
 const scope={exports:{},Error,SECTORS:[],isCloudId:value=>/^[0-9a-f-]{36}$/.test(value),serializeServiceConfiguration:rows=>rows,validateBookingResources:value=>value,validateBusinessTimezone:value=>value,deriveCancellationPolicy:()=>({}),
  getBusinesses:async()=>[{id:company,timezone:'UTC',bookingActive:false}],saveBusiness:async()=>{},getBookableItems:async()=>[],
  getStaff:async()=>staffIds.map((id,index)=>({id,businessId:company,name:'Previous '+index,active:index===0})),saveStaff:async row=>saved.push(plain(row)),getAvailabilityWindows:async()=>[],deleteStaff:async()=>{throw Error('Existing professional must not be removed');}};
 vm.runInNewContext(compile('export '+fn),scope);await scope.exports.ensureBookingRecord({businessId:company,businessName:'Existing',services:[],activeDays:[],plantillaItems:[{staffNames:['Renamed','Renamed'],staffIds,staffServices:[[],[]]}]},async()=>{},owner,company);
 assert.deepEqual(saved.map(row=>row.id),staffIds);assert.deepEqual(saved.map(row=>row.name),['Renamed','Renamed']);assert.deepEqual(saved.map(row=>row.active),[true,false]);
});

test('a verified owner activates the existing company only after its catalogue sync, with no duplicate company',async()=>{
 const source=fs.readFileSync('contexts/GoBusinessConfigContext.tsx','utf8'),ast=ts.createSourceFile('provider.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ensureBookingRecord').getText(ast);
 const events=[];let fail=false;
 const scope={exports:{},Error,SECTORS:[],isCloudId:value=>/^[0-9a-f-]{36}$/.test(value),serializeServiceConfiguration:rows=>rows,validateBookingResources:value=>value,validateBusinessTimezone:value=>value,deriveCancellationPolicy:()=>({}),
  getAuthenticatedUserId:async()=>owner,getBusinesses:async user=>{assert.equal(user,owner);return[{id:company,timezone:'Europe/Madrid',bookingActive:false}];},
  saveBusiness:async row=>events.push(['business',row.bookingActive]),getBookableItems:async()=>{events.push(['catalogue']);if(fail)throw Error('Catalogue offline');return[];},
  getStaff:async()=>[],getAvailabilityWindows:async()=>[],createBusiness:async()=>{throw Error('Duplicate business');}};
 vm.runInNewContext(compile('export '+fn),scope);
 const cfg={businessId:company,businessName:'Existing',timezone:'Europe/Madrid',bookingEnabled:true,services:[],activeDays:[],plantillaItems:[]};
 assert.equal(await scope.exports.ensureBookingRecord(cfg,async id=>assert.equal(id,company),owner,company),company);
 assert.equal(events.at(-1)[0],'business');assert.equal(events.at(-1)[1],true);
 assert.equal(events.filter(event=>event[0]==='business'&&event[1]===true).length,1);
 events.length=0;fail=true;
 await assert.rejects(scope.exports.ensureBookingRecord(cfg,async()=>{},owner,company),/Catalogue offline/);
 assert.equal(events.some(event=>event[0]==='business'&&event[1]===true),false);
 events.length=0;
 await assert.rejects(scope.exports.ensureBookingRecord({...cfg,businessId:undefined},async()=>{},owner,company),/empresa seleccionada ha cambiado/);
 assert.equal(events.length,0);
});
