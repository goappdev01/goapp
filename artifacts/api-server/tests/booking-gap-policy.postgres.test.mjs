import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(createRequire(import.meta.url).resolve('@workspace/db')),{Client}=require('pg');
const configured=process.env.GO_BOOKING_GAP_TEST_URL;
function config(){assert.equal(process.env.GO_BOOKING_GAP_TEST_CONFIRM,'isolated');const u=new URL(configured);assert.equal(u.hostname,'127.0.0.1');assert.ok(['/go_booking_gap_test_20261025','/go_booking_phase_test_20261025'].includes(u.pathname));assert.equal(u.username,'go_booking_test_owner');return {connectionString:String(u)};}
async function connect(){const db=new Client(config());await db.connect();const {rows:[r]}=await db.query("select current_database() name,current_setting('go.booking_test_environment') marker,current_setting('listen_addresses') host");assert.ok(['go_booking_gap_test_20261025','go_booking_phase_test_20261025'].includes(r.name));assert.equal(r.marker,r.name==='go_booking_phase_test_20261025'?'phase-isolated':'gap-isolated');assert.equal(r.host,'127.0.0.1');return db;}
const future=new Date(Date.now()+10*86400000).toISOString().slice(0,10),at=time=>`${future}T${time}:00Z`;
test('18 mandatory cases against REAL PostgreSQL: one canonical engine, no extra listeners or production data',{skip:!configured},async t=>{
 const db=await connect();let ids,services;
 const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
 async function actor(user,sql,args=[]){const c=await connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await c.query(sql,args);await c.query('commit');return result.rows[0];}catch(e){await c.query('rollback');throw e;}finally{await c.end();}}
 async function fixture(durations=[20,35,45,60]){
  ids=Object.fromEntries(['owner','client','other','outsider','business','a','b'].map(key=>[key,randomUUID()]));services=[];
  for(const key of ['owner','client','other','outsider'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[key],key+'-'+ids[key]+'@example.invalid']);
  await db.query("insert into public.businesses(id,owner_id,name,address,timezone,verified,booking_enabled) values($1,$2,'Isolated business','Test address','UTC',true,true)",[ids.business,ids.owner]);
  for(const duration of durations){const id=randomUUID();services.push({id,duration});await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency,ui_metadata) values($1,$2,$3,$4,20,'EUR','{}')",[id,ids.business,'Service '+duration,duration]);}
  await db.query("insert into public.staff(id,business_id,display_name,ui_metadata) values($1,$2,'A',$3),($4,$2,'B',$3)",[ids.a,ids.business,JSON.stringify({serviceIds:services.map(s=>s.id)}),ids.b]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone,ui_metadata) select $1,d,'00:00','12:00','UTC','{}' from generate_series(0,6) d",[ids.business]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone,ui_metadata) select $1,d,'12:00','00:00','UTC','{\"endNextDay\":true}' from generate_series(0,6) d",[ids.business]);
 }
 const service=duration=>services.find(s=>s.duration===duration).id;
 const minimum=async(staff=ids.a)=>(await one('select go_booking_timeline_private.minimum_service($1,$2) m',[ids.business,staff])).m;
 const gaps=async(m,h)=>(await one('select go_booking_timeline_private.valid_gap($1,$2) ok',[h,m])).ok;
 const plan=async(s,time,staff=ids.a)=>actor(ids.client,'select public.go_booking_timeline($1,$2,$3,$4) p',[ids.business,[s],time,staff]);
 const create=async(s,time,{staff=ids.a,user=ids.client,key=randomUUID()}={})=>actor(user,'select public.go_create_timeline_booking($1,$2,$3,$4,$5) b',[ids.business,[s],time,staff,key]);
 const availability=async(s,from,to,staff=ids.a)=>actor(ids.client,'select public.go_booking_availability($1,$2,$3,$4,$5,1) a',[ids.business,[s],from,to,staff]);
 const legacy=async(s,start,end,staff=ids.a)=>{const id=randomUUID();await db.query("insert into public.bookings(id,business_id,service_id,staff_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,$5,$6,$7,'CONFIRMED')",[id,ids.business,s,staff,ids.client,start,end]);return id;};
 const policy=async(enabled,minutes=360,staff=ids.a)=>actor(ids.owner,"update public.staff set ui_metadata=ui_metadata||jsonb_build_object('gapPolicy',jsonb_build_object('allowLastMinuteGaps',$1::boolean,'lastMinuteMinutes',$2::integer)) where id=$3 returning ui_metadata",[enabled,minutes,staff]);
 const rejectsGap=promise=>assert.rejects(promise,e=>e.message==='BOOKING_GAP_NOT_MULTIPLE');
 try{
  for(const [i,m,h,allowed]of [[1,20,0,true],[2,20,20,true],[3,20,40,true],[4,20,15,false],[5,20,25,false],[6,20,35,false],[7,30,60,true],[8,30,45,false]])await t.test(`CASE ${i}: M=${m}, H=${h} => ${allowed}`,async()=>assert.equal(await gaps(m,h),allowed));
  await t.test('CASE 9: each professional minimum uses only their assigned active reservable services',async()=>{
   await fixture();await db.query("update public.staff set ui_metadata=jsonb_build_object('serviceIds',$1::jsonb) where id=$2",[JSON.stringify([service(45),service(60)]),ids.b]);assert.equal(await minimum(),20);assert.equal(await minimum(ids.b),45);
   await db.query("update public.staff set ui_metadata='{}' where id=$1",[ids.b]);assert.equal(await minimum(ids.b),null);assert.equal((await availability(service(20),at('10:00'),at('10:02'),ids.b)).a.slots.length,0);
   await db.query("update public.services set active=false where id=$1",[service(20)]);assert.equal(await minimum(),35);
  });
  await t.test('CASE 10: real 35-minute duration, exact multiples before AND after; no rounding or packing substitution',async()=>{
   await fixture();await legacy(service(45),at('10:00'),at('10:45'));await legacy(service(20),at('12:00'),at('12:20'));
   await rejectsGap(plan(service(35),at('11:00')));const {p}=await plan(service(35),at('11:05'));assert.equal(Date.parse(p.endsAt)-Date.parse(p.startsAt),35*60000);assert.equal(p.gapPolicy.professionals[0].minimumMinutes,20);assert.equal(p.gapPolicy.professionals[0].exceptionUsed,false);
   const {a}=await availability(service(35),at('11:00'),at('11:07'));assert.equal(a.gapPolicyVersion,1);assert.deepEqual(a.slots.map(s=>new Date(s.startsAt).toISOString()),[at('11:05').replace('Z','.000Z')]);
   const {b}=await create(service(35),at('11:05'));const retry=await create(service(35),at('11:05'),{key:b.timing_request_key});assert.equal(retry.b.id,b.id);
  });
  await t.test('CASE 11: breaks split real availability; never borrow minutes across lunch or closed blocks',async()=>{
   await fixture();await db.query('delete from public.availability where business_id=$1',[ids.business]);
   for(const [from,to]of [['09:00','12:00'],['13:00','18:00']])await db.query('insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,$2,$3,\'UTC\' from generate_series(0,6) d',[ids.business,from,to]);
   await legacy(service(20),at('11:00'),at('11:20'));await legacy(service(20),at('14:00'),at('14:20'));
   await assert.rejects(plan(service(60),at('11:30')),e=>e.message==='BOOKING_OUTSIDE_AVAILABILITY');
   assert.ok((await plan(service(20),at('13:00'))).p);await rejectsGap(plan(service(35),at('13:00')));
   await db.query("update public.staff set ui_metadata=ui_metadata||jsonb_build_object('bookingBlocks',jsonb_build_array(jsonb_build_object('startsAt',$1::text,'endsAt',$2::text))) where id=$3",[at('15:00'),at('16:00'),ids.a]);
   await assert.rejects(plan(service(20),at('15:00')),e=>['BOOKING_STAFF_UNAVAILABLE','BOOKING_CONFLICT'].includes(e.message));assert.equal((await availability(service(20),at('15:00'),at('15:01'))).a.slots.length,0);
  });
  const closeTime=hours=>{const d=new Date(Date.now()+hours*3600000);d.setUTCMinutes(0,0,0);return d;};
  for(const [caseId,hours,enabled,allowed]of [[12,8,true,false],[13,4,true,true],[14,4,false,false]])await t.test(`CASE ${caseId}: ${hours}h until start, exception=${enabled}, allowed=${allowed}`,async()=>{
   await fixture();await policy(enabled);const start=closeTime(hours),neighbor=new Date(start.getTime()+60*60000);
   await legacy(service(20),neighbor.toISOString(),new Date(neighbor.getTime()+20*60000).toISOString());
   if(!allowed)await rejectsGap(plan(service(35),start.toISOString()));else{
    const {p}=await plan(service(35),start.toISOString());assert.equal(p.gapPolicy.professionals[0].exceptionUsed,true);
    const {b}=await create(service(35),start.toISOString());assert.equal(b.status,'CONFIRMED');assert.equal(b.timing_snapshot.gapPolicy.professionals[0].exceptionUsed,true);assert.equal(b.timing_snapshot.gapPolicy.professionals[0].authorizedBy,ids.owner);
    await assert.rejects(create(service(35),start.toISOString(),{user:ids.other}),e=>['23P01','23505'].includes(e.code));
    await assert.rejects(plan(service(20),new Date(Date.now()-3600000).toISOString()),e=>e.message==='BOOKING_INVALID_INTERVAL');
   }
  });
  await t.test('CASE 15: incompatible accepted history is preserved; an untouched legacy gap does not block the day',async()=>{
   await fixture();const id=await legacy(service(20),at('09:00'),at('09:20'));await legacy(service(20),at('09:25'),at('09:45'));const before=await one('select to_jsonb(b) snapshot from public.bookings b where id=$1',[id]);
   await create(service(35),at('12:05'));assert.deepEqual(await one('select to_jsonb(b) snapshot from public.bookings b where id=$1',[id]),before);
  });
  await t.test('CASE 16: simultaneous clients cannot confirm the same staff interval; requests remain idempotent',async()=>{
   await fixture([20]);const users=[ids.client,ids.other],results=await Promise.allSettled(users.map(user=>create(service(20),at('10:00'),{user})));
   assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal((await one('select count(*)::int n from public.bookings where business_id=$1',[ids.business])).n,1);
  });
  await t.test('CASE 17: service and duration edits recompute the future minimum without changing committed appointments',async()=>{
   await fixture();const {b}=await create(service(35),at('10:00')),before=await one('select timing_snapshot,starts_at,ends_at from public.bookings where id=$1',[b.id]);
   await db.query('update public.services set duration_minutes=18 where id=$1',[service(20)]);assert.equal(await minimum(),18);
   assert.deepEqual(await one('select timing_snapshot,starts_at,ends_at from public.bookings where id=$1',[b.id]),before);
   await db.query("update public.staff set ui_metadata=jsonb_build_object('serviceIds',$1::jsonb) where id=$2",[JSON.stringify([service(45)]),ids.a]);assert.equal(await minimum(),45);
  });
  await t.test('CASE 18: opening/closing and overnight limits are real bounds, never fictitious fillers',async()=>{
   await fixture();await db.query('delete from public.availability where business_id=$1',[ids.business]);
   await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone,ui_metadata) select $1,d,'09:00','18:00','UTC','{}' from generate_series(0,6) d",[ids.business]);
   assert.ok((await plan(service(20),at('09:00'))).p);assert.ok((await plan(service(20),at('17:40'))).p);await rejectsGap(plan(service(20),at('09:07')));await rejectsGap(plan(service(35),at('17:25')));await assert.rejects(plan(service(35),at('17:26')));
   await db.query("update public.availability set start_time='22:00',end_time='06:00',ui_metadata='{\"endNextDay\":true}' where business_id=$1",[ids.business]);
   assert.ok((await plan(service(20),at('23:40'))).p);assert.ok((await plan(service(20),at('05:40'))).p);await assert.rejects(plan(service(20),at('05:41')));
  });
  await t.test('automatic professional selection skips a gap-invalid candidate and retains the valid exact assignment',async()=>{
   await fixture();const first=[ids.a,ids.b].sort()[0],second=first===ids.a?ids.b:ids.a;await legacy(service(20),at('12:00'),at('12:20'),first);
   const {p}=await plan(service(35),at('11:00'),null);assert.equal(p.staffId,second);const {b}=await create(service(35),at('11:00'),{staff:null});assert.equal(b.staff_id,second);
  });
  await t.test('negotiated rescheduling uses the same predicate and cancellation frees the actual intervals',async()=>{
   await fixture();const {b}=await create(service(35),at('10:00'));await legacy(service(20),at('12:00'),at('12:20'));
   const row=(await db.query('select * from public.bookings where id=$1',[b.id])).rows[0];
   await assert.rejects(actor(ids.client,"select public.go_negotiate_booking($1,'propose',$2,0,null,$3,'11:00',$4,true)",[b.id,randomUUID(),future,at('11:00')]),e=>e.message==='BOOKING_GAP_NOT_MULTIPLE');
   assert.equal((await one('select starts_at from public.bookings where id=$1',[b.id])).starts_at.toISOString(),new Date(row.starts_at).toISOString());
   const proposalId=randomUUID();await actor(ids.client,"select public.go_negotiate_booking($1,'propose',$2,0,null,$3,'11:05',$4,true)",[b.id,proposalId,future,at('11:05')]);
   assert.equal((await one('select starts_at from public.bookings where id=$1',[b.id])).starts_at.toISOString(),new Date(row.starts_at).toISOString());
   await actor(ids.owner,"select public.go_negotiate_booking($1,'accept',$2,1,$3,null,null,null,true)",[b.id,randomUUID(),proposalId]);
   assert.equal((await one('select starts_at from public.bookings where id=$1',[b.id])).starts_at.toISOString(),new Date(at('11:05')).toISOString());
   await actor(ids.client,"select public.go_negotiate_booking($1,'cancel',$2,2,null,null,null,null,false)",[b.id,randomUUID()]);assert.ok((await plan(service(35),at('11:05'))).p);
  });
  await t.test('configured internal waits remain intentional; resource conflicts still cannot be authorized away',async()=>{
   await fixture([20,75]);const phases=[{id:'apply',name:'Apply',kind:'work',durationMinutes:15,resources:[]},{id:'wait',name:'Wait',kind:'wait',durationMinutes:30,releaseProfessional:true,resources:[]},{id:'finish',name:'Finish',kind:'work',durationMinutes:30,resources:[]}];
   await db.query("update public.services set ui_metadata=$1 where id=$2",[JSON.stringify({timing:{version:1,mode:'phases',resourcesConfigured:true,phases}}),service(75)]);
   const {p}=await plan(service(75),at('10:00'));assert.equal(p.totalClientMinutes,75);assert.equal(p.workMinutes,45);assert.equal(p.waitMinutes,30);
   await fixture([20]);const resource=randomUUID();await db.query("update public.businesses set ui_metadata=$1 where id=$2",[JSON.stringify({bookingResources:[{id:resource,name:'Shared resource',capacity:1,active:true}]}),ids.business]);
   const timing={version:1,mode:'simple',resourcesConfigured:true,phases:[{id:'work',name:'Work',kind:'work',durationMinutes:20,resources:[{resourceId:resource,quantity:1,occupancy:'phase'}]}]};
   await db.query('update public.services set ui_metadata=$1 where id=$2',[JSON.stringify({timing}),service(20)]);await policy(true,525600,ids.b);await create(service(20),at('10:00'));await assert.rejects(create(service(20),at('10:00'),{staff:ids.b,user:ids.other}),e=>e.message==='BOOKING_RESOURCE_CONFLICT');
  });
  await t.test('owner authorization persists, customers and other businesses cannot enable exceptions or read analysis',async()=>{
   await fixture();const saved=await policy(true,17*60);assert.equal(saved.ui_metadata.gapPolicy.authorizedBy,ids.owner);assert.ok(saved.ui_metadata.gapPolicy.authorizedAt);
   assert.equal((await actor(ids.client,"update public.staff set ui_metadata=jsonb_build_object('gapPolicy',jsonb_build_object('allowLastMinuteGaps',true,'lastMinuteMinutes',1)) where id=$1 returning id",[ids.a])),undefined);
   assert.equal((await one('select ui_metadata from public.staff where id=$1',[ids.a])).ui_metadata.gapPolicy.lastMinuteMinutes,17*60);
   await assert.rejects(actor(ids.outsider,'select public.go_booking_day_analysis($1,$2)',[ids.business,new Date().toISOString().slice(0,10)]),e=>e.code==='42501');
   assert.equal((await one("select has_function_privilege('anon','public.go_booking_day_analysis(uuid,date)','execute') ok")).ok,false);
  });
  await t.test('nonreservable/product services never set M or receive bookings; unrelated saves preserve authorization',async()=>{
   await fixture();await db.query("update public.services set ui_metadata='{\"reservable\":false}' where id=$1",[service(20)]);
   await db.query("update public.services set ui_metadata='{\"catalogKind\":\"product\"}',duration_minutes=0 where id=$1",[service(35)]);
   await db.query("update public.services set ui_metadata='{\"archived\":true}' where id=$1",[service(60)]);
   assert.equal(await minimum(),45);await assert.rejects(plan(service(20),at('10:00')),e=>e.message==='BOOKING_SERVICE_UNAVAILABLE');
   const saved=(await policy(true,1020)).ui_metadata.gapPolicy;
   await actor(ids.owner,"update public.staff set ui_metadata=ui_metadata||jsonb_build_object('gapPolicy',jsonb_build_object('allowLastMinuteGaps',true,'lastMinuteMinutes',1020,'authorizedBy','spoofed','authorizedAt','fake'),'emoji','new') where id=$1",[ids.a]);
   assert.deepEqual((await one('select ui_metadata from public.staff where id=$1',[ids.a])).ui_metadata.gapPolicy,saved);
  });
  await t.test('DST fold instants keep real elapsed minutes and the same local establishment boundaries',async()=>{
   await fixture([20]);await db.query("update public.businesses set timezone='Europe/Madrid' where id=$1",[ids.business]);
   await db.query("update public.availability set start_time='01:00',end_time='04:00',timezone='Europe/Madrid',ui_metadata='{}' where business_id=$1",[ids.business]);
   const october=new Date(Date.UTC(new Date().getUTCFullYear()+1,9,31));october.setUTCDate(october.getUTCDate()-october.getUTCDay());const date=october.toISOString().slice(0,10);
   const first=date+'T00:40:00Z',second=date+'T01:40:00Z';
   for(const instant of [first,second]){const {p}=await plan(service(20),instant);assert.equal(p.timezone,'Europe/Madrid');assert.equal(Date.parse(p.endsAt)-Date.parse(p.startsAt),20*60000);assert.equal(p.gapPolicy.professionals[0].exceptionUsed,false);}
   const {a}=await availability(service(20),first,new Date(Date.parse(second)+60000).toISOString());
   assert.ok(a.slots.some(s=>Date.parse(s.startsAt)===Date.parse(first)));assert.ok(a.slots.some(s=>Date.parse(s.startsAt)===Date.parse(second)));
  });
  await t.test('a custom one-minute authorization never opens an interval outside its real threshold',async()=>{
   await fixture();await policy(true,1);const now=Date.now(),near=new Date(Math.floor(now/60000)*60000+60000),far=new Date(near.getTime()+60000);
   await legacy(service(20),new Date(near.getTime()+60*60000).toISOString(),new Date(near.getTime()+80*60000).toISOString());
   assert.equal((await plan(service(35),near.toISOString())).p.gapPolicy.professionals[0].exceptionUsed,true);
   await rejectsGap(plan(service(35),far.toISOString()));
  });
  await t.test('date enumeration skips impossible whole days while preserving the full canonical admission predicate',async()=>{
   await fixture([20,35]);await db.query('delete from public.availability where business_id=$1',[ids.business]);
   await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'09:00','18:00','UTC' from generate_series(0,6) d",[ids.business]);
   const begin=Date.now();const {a}=await actor(ids.client,'select public.go_booking_availability($1,$2,null,null,$3,15,$4,21,true) a',[ids.business,[service(35)],ids.a,future]);
   assert.equal(a.availableDates.length,0);assert.equal(a.slots.length,0);assert.equal(a.gapPolicyVersion,1);
   const {a:ordinary}=await availability(service(20),at('09:00'),at('10:01'));
   assert.deepEqual(ordinary.slots.map(slot=>new Date(slot.startsAt).toISOString().slice(11,16)),['09:00','09:20','09:40','10:00']);
   for(let offset=0;offset<61;offset++){const start=new Date(Date.parse(at('09:00'))+offset*60000).toISOString();let allowed=true;try{await plan(service(20),start);}catch(e){if(e.message!=='BOOKING_GAP_NOT_MULTIPLE')throw e;allowed=false;}
    assert.equal(ordinary.slots.some(slot=>Date.parse(slot.startsAt)===Date.parse(start)),allowed);}
   assert.equal((await actor(ids.client,'select public.go_booking_gap_policy_version() version')).version,1);
   console.log('21-day impossible-window query + minute-by-minute canonical comparison: '+(Date.now()-begin)+' ms');
  });
  await t.test('end-of-day analysis is owner-only, disjoint, read-only and reports persisted scheduled occupation',async()=>{
   await fixture([20]);const yesterday=new Date(Date.now()-86400000).toISOString().slice(0,10);await legacy(service(20),yesterday+'T10:00:00Z',yesterday+'T10:20:00Z');
   const result=await actor(ids.owner,'select public.go_booking_day_analysis($1,$2) report',[ids.business,yesterday]);assert.equal(result.report.finished,true);const a=result.report.professionals.find(p=>p.staffId===ids.a);assert.equal(a.legacyBookings,1);assert.equal(a.occupiedMinutes,20);assert.equal(a.availableMinutes-a.occupiedMinutes,a.freeMinutes);assert.equal(result.report.automaticConfigurationChanges,false);assert.equal(result.report.estimatedOpportunities,true);
  });
 }finally{await db.end();}
});
