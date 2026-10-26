import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import {randomUUID} from 'node:crypto';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const compile=source=>ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,alwaysStrict:false,esModuleInterop:false}}).outputText;
function load(file,imports={}){const scope={exports:{},Intl,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected import '+name);}};vm.runInNewContext(compile(readFileSync(file,'utf8')),scope);return scope.exports;}
const timing=load('data/serviceTiming.ts'),adapter=load('data/serviceWorkWait.ts',{'./serviceTiming':timing}),plain=x=>JSON.parse(JSON.stringify(x));
function functions(file,names,globals={}){const source=readFileSync(file,'utf8'),ast=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX),scope={exports:{},Intl,console,...globals};
 const declarations=names.map(name=>ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===name));assert.ok(declarations.every(Boolean));vm.runInNewContext(compile(declarations.map(n=>n.getText(ast)).join('\n')+';'+names.map(n=>'exports.'+n+'='+n+';').join('')),scope);return scope.exports;}
const bodies=functions('data/booking.ts',['serviceBody','mapRemoteService']);
const draft=()=>adapter.updateServiceWorkWait({duration:30},['15','30','15'],[],randomUUID);
const work=(id,minutes)=>({id,name:'',kind:'work',durationMinutes:minutes,resources:[]});
test('settings serialize and reload 15+30+15 as 60 while strict admission still refuses unverified resources',()=>{
 const pending=draft(),service={name:'Tinte',price:25,...pending};assert.equal(pending.duration,60);assert.equal(pending.timing.configurationStatus,'pending');assert.equal(pending.timing.resourcesConfigured,false);
 const saved=timing.serializeServiceConfiguration([service],{resources:[]});const loaded=JSON.parse(JSON.stringify(saved));assert.equal(loaded[0].duration,60);assert.deepEqual(loaded[0].timing.phases.map(p=>p.durationMinutes),[15,30,15]);assert.throws(()=>timing.validateServiceTiming(loaded[0].timing,{resources:[]}),/habilitados/);
 assert.deepEqual(plain(timing.serializeServiceConfiguration(loaded,{resources:[]})),loaded);
});
test('pending configurations retain unavailable resource demands and per-professional durations without fabricating confirmation',()=>{
 const resource=randomUUID(),professional=randomUUID(),source={version:1,mode:'phases',resourcesConfigured:true,phases:[{...work('work',30),resources:[{resourceId:resource,quantity:1,occupancy:'booking'}]}]};
 const value=timing.validateServiceTiming({...source,professionalTimings:{[professional]:{...source,durationMinutes:30}}},{purpose:'configuration',resources:[],durationMinutes:30});
 assert.equal(value.configurationStatus,'pending');assert.equal(value.resourcesConfigured,true);assert.equal(value.phases[0].resources[0].resourceId,resource);assert.equal(value.professionalTimings[professional].configurationStatus,'pending');assert.equal(value.professionalTimings[professional].durationMinutes,30);assert.throws(()=>timing.validateServiceTiming(value,{resources:[]}));
 for(const patch of [{quantity:0},{quantity:1.5},{resourceId:'not-an-id'}])assert.throws(()=>timing.validateServiceTiming({...source,phases:[{...source.phases[0],resources:[{...source.phases[0].resources[0],...patch}]}]},{purpose:'configuration',resources:[]}));
});
test('the production HTTP encoder cannot publish a pending draft as an active service, including missing active and nested drafts',()=>{
 for(const active of [true,false,undefined]){const input={businessId:randomUUID(),title:'Tinte',durationMinutes:60,price:25,customerCapacity:1,unitQuantity:1,paymentRequired:false,visible:true,active,timing:draft().timing};const body=plain(bodies.serviceBody(input));assert.equal(body.duration_minutes,60);assert.equal(body.active,false);assert.equal(body.ui_metadata.timingConfigurationPending,true);assert.equal(body.ui_metadata.timing,undefined);}
 const nested={version:1,mode:'simple',resourcesConfigured:false,phases:[work('general',60)],professionalTimings:{[randomUUID()]:{...draft().timing,durationMinutes:60}}};assert.equal(bodies.serviceBody({title:'Tinte',durationMinutes:60,active:true,timing:nested}).active,false);
});
test('ready settings retain their real full duration and are not given a pending marker',()=>{
 const original={duration:30,timing:{version:1,mode:'simple',resourcesConfigured:true,phases:[work('existing',30)]}};
 const next=adapter.updateServiceWorkWait(original,['15','30','15'],[],randomUUID);assert.equal(next.duration,60);assert.equal(next.timing.configurationStatus,undefined);assert.equal(next.timing.resourcesConfigured,true);
 const body=plain(bodies.serviceBody({title:'Tinte',durationMinutes:next.duration,timing:next.timing,active:true,visible:true}));assert.equal(body.active,true);assert.equal(body.duration_minutes,60);assert.equal(body.ui_metadata.timingConfigurationPending,undefined);assert.equal(timing.serviceTimingDuration(timing.validateServiceTiming(body.ui_metadata.timing)),60);
});

const configured=process.env.GO_BOOKING_CONFIG_TEST_URL;
async function connect(){assert.equal(process.env.GO_BOOKING_CONFIG_TEST_CONFIRM,'isolated');const url=new URL(configured);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'65439');assert.equal(url.username,'go_booking_test_owner');assert.equal(url.pathname,'/go_booking_phase_test_20261025');
 const {Client}=createRequire(path.resolve('../../lib/db/package.json'))('pg'),db=new Client({connectionString:String(url)});await db.connect();const row=(await db.query("select current_database() name,current_setting('go.booking_test_environment') marker,current_setting('listen_addresses') host")).rows[0];assert.deepEqual(row,{name:'go_booking_phase_test_20261025',marker:'phase-isolated',host:'127.0.0.1'});return db;}
test('REAL isolated PostgreSQL: new/existing pending times persist privately with 60 minutes, one inactive catalogue row and no unsafe booking',{skip:!configured},async t=>{
 const db=await connect();
 async function actor(user,sql,args=[]){const c=await connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const r=await c.query(sql,args);await c.query('commit');return r.rows;}catch(error){await c.query('rollback');throw error;}finally{await c.end();}}
 try{for(const existing of [false,true])await t.test(existing?'existing service keeps its ID and old accepted reservation':'new service stores its pending times without publishing a false slot',async()=>{
  const ids=Object.fromEntries(['owner','client','foreign','business','service','staff'].map(k=>[k,randomUUID()]));
  for(const key of ['owner','client','foreign'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[key],key+'-'+ids[key]+'@example.invalid']);
  await db.query("insert into public.businesses(id,owner_id,name,address,timezone,verified,booking_enabled) values($1,$2,'Exact-time pending test','Isolated','UTC',true,true)",[ids.business,ids.owner]);
  await db.query("insert into public.staff(id,business_id,display_name,ui_metadata) values($1,$2,'Test professional',$3)",[ids.staff,ids.business,JSON.stringify({serviceIds:[ids.service]})]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'09:00','19:00','UTC' from generate_series(0,6) d",[ids.business]);
  const day=new Date(Date.now()+7*86400000).toISOString().slice(0,10),start=day+'T10:00:00Z';let accepted;
  if(existing){await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,'Tinte',15,25,'EUR')",[ids.service,ids.business]);accepted=(await actor(ids.client,'select public.go_create_timeline_booking($1,$2,$3,$4,$5) booking',[ids.business,[ids.service],start,ids.staff,randomUUID()]))[0].booking;}
  const pending=draft(),config={businessId:ids.business,businessName:'Exact-time pending test',services:[{name:'Tinte',price:25,capacity:1,...pending}],plantillaItems:[],activeDays:[],daySchedules:{},staffSchedules:{},openFrom:'09:00',openTo:'19:00'};
  const writes=[];const sync=functions('contexts/GoBusinessConfigContext.tsx',['ensureBookingRecord'],{...timing,SECTORS:[],isCloudId:timing.isStableBookingId,deriveCancellationPolicy:()=>({}),
   getBusinesses:async()=>[{id:ids.business,name:config.businessName,timezone:'UTC',bookingActive:true}],saveBusiness:async()=>{},
   getBookableItems:async()=> (await actor(ids.owner,'select * from public.services where business_id=$1',[ids.business])).map(bodies.mapRemoteService),
   saveBookableItem:async item=>{const body=plain(bodies.serviceBody(item));writes.push(body);await actor(ids.owner,'update public.services set name=$1,duration_minutes=$2,price=$3,active=$4,ui_metadata=$5 where id=$6 and business_id=$7 returning id',[body.name,body.duration_minutes,body.price,body.active,body.ui_metadata,item.id,ids.business]);},
   createBookableItem:async item=>{const body=plain(bodies.serviceBody(item));writes.push(body);const row=(await actor(ids.owner,'insert into public.services(business_id,name,duration_minutes,price,currency,active,ui_metadata) values($1,$2,$3,$4,$5,$6,$7) returning *',[ids.business,body.name,body.duration_minutes,body.price,body.currency,body.active,body.ui_metadata]))[0];ids.service=row.id;return bodies.mapRemoteService(row);},
   getStaff:async()=>[],getAvailabilityWindows:async()=>[],migrateDayScheduleEntry:value=>value,
  }).ensureBookingRecord;
  const cloud=functions('data/booking.ts',['saveCloudConfiguration'],{management:'/supabase/manage',supabaseApiRequest:async(route,init,authenticated)=>{assert.equal(route,'/supabase/manage/businesses/'+ids.business+'/configuration');assert.equal(init.method,'PUT');assert.equal(authenticated,true);const payload=JSON.parse(init.body).payload;await actor(ids.owner,'insert into public.business_settings(business_id,payload) values($1,$2) on conflict(business_id) do update set payload=excluded.payload returning business_id',[ids.business,payload]);}}).saveCloudConfiguration;
  const persist=async cfg=>{await sync(cfg,async id=>assert.equal(id,ids.business),ids.owner);await cloud(ids.business,cfg);};
  await persist(config);assert.equal(writes.length,1);await persist(config);assert.equal(writes.length,1,'Reload/sync must reuse the same inactive row instead of reactivating or duplicating it');
  const row=(await db.query('select * from public.services where business_id=$1',[ids.business])).rows;assert.equal(row.length,1);assert.equal(row[0].duration_minutes,60);assert.equal(row[0].active,false);assert.equal(row[0].ui_metadata.timing,undefined);assert.equal(row[0].ui_metadata.timingConfigurationPending,true);
  const restored=(await actor(ids.owner,'select payload from public.business_settings where business_id=$1',[ids.business]))[0].payload;assert.equal(restored.services[0].duration,60);assert.deepEqual(restored.services[0].timing.phases.map(p=>p.durationMinutes),[15,30,15]);assert.equal(restored.services[0].timing.resourcesConfigured,false);
  assert.deepEqual(await actor(ids.foreign,'select payload from public.business_settings where business_id=$1',[ids.business]),[]);
  await assert.rejects(actor(ids.client,'select public.go_booking_timeline($1,$2,$3,$4)',[ids.business,[ids.service],day+'T12:00:00Z',ids.staff]),error=>error.message==='BOOKING_SERVICE_UNAVAILABLE');
  const edited=adapter.updateServiceWorkWait(restored.services[0],['20','40','20'],[],randomUUID);restored.services[0]={...restored.services[0],...edited};await persist(restored);assert.equal((await db.query('select duration_minutes from public.services where id=$1',[ids.service])).rows[0].duration_minutes,80);assert.equal((await actor(ids.owner,'select payload from public.business_settings where business_id=$1',[ids.business]))[0].payload.services[0].duration,80);
  if(accepted){const after=(await db.query('select starts_at,ends_at,timing_snapshot,status from public.bookings where id=$1',[accepted.id])).rows[0];assert.deepEqual(after.timing_snapshot,accepted.timing_snapshot);assert.equal(after.status,'CONFIRMED');assert.equal((Date.parse(after.ends_at)-Date.parse(after.starts_at))/60000,15);}
 });}finally{await db.end();}
});
