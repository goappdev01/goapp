import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
const {Client}=createRequire(createRequire(import.meta.url).resolve('@workspace/db'))('pg');
const configured=process.env.GO_CALENDAR_TEST_URL;
async function connect(){
 assert.equal(process.env.GO_CALENDAR_TEST_CONFIRM,'isolated');const url=new URL(configured);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'65439');assert.equal(url.username,'go_booking_test_owner');assert.equal(url.pathname,'/go_booking_phase_test_20261025');
 const db=new Client({connectionString:String(url)});await db.connect();const {rows:[r]}=await db.query("select current_database() name,current_setting('go.booking_test_environment') marker,current_setting('listen_addresses') host");
 assert.deepEqual(r,{name:'go_booking_phase_test_20261025',marker:'phase-isolated',host:'127.0.0.1'});return db;
}
const date=new Date(Date.now()+10*86400000).toISOString().slice(0,10),addDate=(date,days)=>new Date(Date.parse(date+'T12:00:00Z')+days*86400000).toISOString().slice(0,10);
const closed=(a,z)=>({kind:'closed',startMinute:a,endMinute:z}),open=(a,z)=>({kind:'open',startMinute:a,endMinute:z});
test('real PostgreSQL calendar exceptions: dated authority, canonical booking engine and protected commitments',{skip:!configured},async t=>{
 const db=await connect();let ids;
 const one=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
 async function actor(user,sql,args=[]){const c=await connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await c.query(sql,args);await c.query('commit');return result.rows[0];}catch(e){await c.query('rollback');throw e;}finally{await c.end();}}
 async function fixture(){
  ids=Object.fromEntries(['owner','foreign','clientA','clientB','business','otherBusiness','a','b','cut','continuous','tint'].map(key=>[key,randomUUID()]));
  for(const name of ['owner','foreign','clientA','clientB'])await db.query('insert into auth.users(id,email) values($1,$2)',[ids[name],ids[name]+'@isolated.invalid']);
  await db.query("update public.profiles set role='empresa' where id=any($1::uuid[])",[[ids.owner,ids.foreign]]);
  await db.query("update public.profiles set full_name=case when id=$1 then 'Cliente A' else 'Cliente B' end where id=any($2::uuid[])",[ids.clientA,[ids.clientA,ids.clientB]]);
  for(const [business,owner]of [[ids.business,ids.owner],[ids.otherBusiness,ids.foreign]])await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,timezone) values($1,$2,'Isolated calendar fixture',true,true,'UTC')",[business,owner]);
  for(const [id,name,duration]of [[ids.cut,'Corte',20],[ids.continuous,'Continuo',60],[ids.tint,'Tinte',60]])await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,$3,$4,10,'EUR')",[id,ids.business,name,duration]);
  for(const [id,name]of [[ids.a,'Raul 1'],[ids.b,'Raul 2']])await db.query('insert into public.staff(id,business_id,display_name,ui_metadata) values($1,$2,$3,$4)',[id,ids.business,name,JSON.stringify({serviceIds:[ids.cut,ids.continuous,ids.tint]})]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,a::time,z::time,'UTC' from generate_series(0,6) d cross join (values('09:00','13:00'),('16:00','20:00')) v(a,z)",[ids.business]);
 }
 const at=(time,day=date)=>day+'T'+time+':00Z';
 const saveSQL='select public.go_save_booking_calendar_exception($1::uuid,$2::date,$3::uuid,$4::jsonb,$5::integer,$6::text,$7::boolean) r';
 const save=(intervals,{staff=null,day=date,revision=0,user=ids.owner,key=randomUUID(),deleting=false,business=ids.business}={})=>actor(user,saveSQL,[business,day,staff,JSON.stringify(intervals),revision,key,deleting]);
 const get=({staff=null,day=date,user=ids.owner,business=ids.business}={})=>actor(user,'select public.go_booking_calendar_exceptions($1::uuid,$2::date,$3::uuid,$2::date) r',[business,day,staff]);
 const avail=({staff=ids.a,day=date,service=ids.cut,services=[service]}={})=>actor(ids.clientA,'select public.go_booking_availability(p_business_id=>$1,p_service_ids=>$2,p_date_iso=>$3,p_staff_id=>$4) r',[ids.business,services,day,staff]);
 const create=(time,{staff=ids.a,day=date,user=ids.clientA,services=[ids.cut],key=randomUUID(),expected=null}={})=>actor(user,'select public.go_create_timeline_booking(p_business_id=>$1::uuid,p_service_ids=>$2::uuid[],p_starts_at=>$3::timestamptz,p_staff_id=>$4::uuid,p_request_key=>$5::text,p_expected_plan=>$6::jsonb) b',[ids.business,services,at(time,day),staff,key,expected]);
 const clock=value=>new Date(value).toISOString().slice(11,16),has=(result,time)=>result.r.slots.some(s=>clock(s.startsAt??s.startInstant)===time);
 const current=result=>result.r.exceptions.find(e=>e.dateISO===date&&e.staffId===null);
 const denied=promise=>assert.rejects(promise,e=>e.code==='42501');
 const blocked=promise=>assert.rejects(promise,e=>['BOOKING_OUTSIDE_AVAILABILITY','BOOKING_STAFF_UNAVAILABLE','BOOKING_GAP_NOT_MULTIPLE','BOOKING_CONFLICT'].includes(e.message));
 const tint=async()=>db.query('update public.services set ui_metadata=$1 where id=$2',[JSON.stringify({timing:{version:1,mode:'phases',resourcesConfigured:true,phases:[{id:'a',name:'Aplicar',kind:'work',durationMinutes:15,resources:[]},{id:'w',name:'Esperar',kind:'wait',durationMinutes:30,releaseProfessional:true,resources:[]},{id:'z',name:'Finalizar',kind:'work',durationMinutes:15,resources:[]}]}}),ids.tint]);
 try{
  await t.test('1 full-day closure removes all starts and rejects a stale confirmation; weekly rows remain unchanged',async()=>{
   await fixture();const before=(await db.query('select * from public.availability where business_id=$1 order by id',[ids.business])).rows;
   const available=await avail();assert.equal(has(available,'09:00'),true);const plan=available.r.slots.find(s=>clock(s.startsAt)==='09:00');
   await save([closed(0,1440)]);assert.equal((await avail()).r.slots.length,0);await blocked(create('09:00',{expected:plan}));
   assert.deepEqual((await db.query('select * from public.availability where business_id=$1 order by id',[ids.business])).rows,before);
  });
  await t.test('2 morning and 3 afternoon closures independently preserve the other shift',async()=>{
   await fixture();let r=await save([closed(540,780)]);assert.equal(has(await avail(),'09:00'),false);assert.equal(has(await avail(),'16:00'),true);
   await save([closed(960,1200)],{revision:current(r).revision});assert.equal(has(await avail(),'09:00'),true);assert.equal(has(await avail(),'16:00'),false);
  });
  await t.test('4 exact minutes and multiple intervals are persistent, editable and non-overlapping',async()=>{
   await fixture();let r=await save([closed(541,577),closed(1033,1059)]);assert.deepEqual(current(r).intervals,[closed(541,577),closed(1033,1059)]);
   assert.deepEqual(current(await get()).intervals,current(r).intervals);await blocked(create('09:00'));
   r=await save([closed(560,600)],{revision:current(r).revision});assert.deepEqual(current(r).intervals,[closed(560,600)]);
   await assert.rejects(save([closed(550,590),open(570,610)],{revision:current(r).revision}),e=>e.message==='BOOKING_CALENDAR_OVERLAP');
  });
  await t.test('5 opening a normally closed date and 7 deleting it restores the habitual closed day',async()=>{
   await fixture();await db.query('delete from public.availability where business_id=$1 and weekday=extract(dow from $2::date)',[ids.business,date]);assert.equal((await avail()).r.slots.length,0);
   const r=await save([open(600,840)]);assert.equal(has(await avail(),'10:00'),true);const {b}=await create('10:00');assert.equal(clock(b.ends_at),'10:20');
   const after=await save([],{revision:current(r).revision,deleting:true});assert.equal(current(after),undefined);assert.equal((await avail()).r.slots.length,0);
   assert.equal((await one('select status from public.bookings where id=$1',[b.id])).status,'CONFIRMED');
  });
  await t.test('6 editing and 8 same weekday on another date remain independent',async()=>{
   await fixture();let r=await save([closed(0,1440)]);assert.equal(has(await avail({day:addDate(date,7)}),'09:00'),true);
   r=await save([closed(540,780)],{revision:current(r).revision});assert.equal(has(await avail(),'16:00'),true);
   await save([],{revision:current(r).revision,deleting:true});assert.equal(has(await avail(),'09:00'),true);
  });
  await t.test('9 a professional closure and opening do not block or open other professionals',async()=>{
   await fixture();await save([closed(960,1200)],{staff:ids.a});assert.equal(has(await avail({staff:ids.a}),'16:00'),false);assert.equal(has(await avail({staff:ids.b}),'16:00'),true);
   const next=addDate(date,1);await db.query('delete from public.availability where business_id=$1 and weekday=extract(dow from $2::date)',[ids.business,next]);
   await save([open(600,840)],{staff:ids.a,day:next});assert.equal(has(await avail({staff:ids.a,day:next}),'10:00'),true);assert.equal((await avail({staff:ids.b,day:next})).r.slots.length,0);
   const auto=await avail({staff:null,day:next});assert.ok(auto.r.slots.length);assert.ok(auto.r.slots.every(s=>s.staffId===ids.a));
   await save([closed(0,1440)],{day:next});assert.equal((await avail({staff:ids.a,day:next})).r.slots.length,0,'Whole-business closure has precedence over an individual opening');
  });
  await t.test('10/11 the same SQL rejects closed work even through direct confirmation, not just search filtering',async()=>{
   await fixture();await save([closed(540,600)],{staff:ids.a});await blocked(create('09:00'));const {b}=await create('09:00',{staff:ids.b});assert.equal(b.staff_id,ids.b);
  });
  await t.test('12/13 existing bookings are reported, audited and never modified, cancelled or notified as cancelled',async()=>{
   await fixture();const {b}=await create('09:00');const original=await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]);
   const result=await save([closed(540,600)]);assert.deepEqual(current(result).conflicts.map(c=>c.bookingId),[b.id]);assert.equal(current(result).conflicts[0].customerName,'Cliente A');
   assert.deepEqual(await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]),original);
   const audit=await one('select actor_id,operation,affected_bookings from go_booking_timeline_private.calendar_exception_events where business_id=$1',[ids.business]);assert.equal(audit.actor_id,ids.owner);assert.equal(audit.operation,'create');assert.equal(audit.affected_bookings[0].bookingId,b.id);
   await assert.rejects(actor(ids.clientA,"select public.go_negotiate_booking($1,'propose',$2,0,null,$3,'09:20',$4,true)",[b.id,randomUUID(),date,at('09:20')]));
  });
  await t.test('14 closing and reopening connections preserves date, scope, author, revision and intervals',async()=>{
   await fixture();const saved=await save([closed(577,613)],{staff:ids.b});const row=saved.r.exceptions[0],later=(await get({staff:ids.b})).r.exceptions[0];assert.deepEqual(later,row);assert.equal(later.updatedBy,ids.owner);assert.equal(later.dateISO,date);assert.equal(later.staffId,ids.b);
  });
  await t.test('15 tenant and role boundaries cannot be bypassed through RPC or direct table mutation',async()=>{
   await fixture();await denied(save([closed(0,1440)],{user:ids.clientA}));await denied(save([closed(0,1440)],{user:ids.foreign}));await denied(get({user:ids.foreign}));
   await denied(save([closed(0,1440)],{business:ids.otherBusiness}));
   await assert.rejects(save([closed(0,1440)],{staff:randomUUID()}),e=>e.message==='BOOKING_STAFF_UNAVAILABLE');
   await denied(actor(ids.owner,'insert into public.booking_calendar_exceptions(business_id,local_date,timezone,intervals,created_by,updated_by) values($1,$2,\'UTC\',\'[]\',$3,$3)',[ids.business,date,ids.owner]));
   await save([closed(0,1440)]);const hidden=await actor(ids.foreign,'select count(*)::int n from public.booking_calendar_exceptions where business_id=$1',[ids.business]);assert.equal(hidden.n,0);
  });
  await t.test('16 phases and multiservice use exactly the same exceptional windows; released waits stay distinct from closures',async()=>{
   await fixture();await tint();const {b}=await create('10:00',{services:[ids.tint]});assert.equal(b.timing_snapshot.totalClientMinutes,60);
   const original=await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]);await save([closed(620,625)],{staff:ids.a});
   assert.equal((await get({staff:ids.a})).r.exceptions[0].conflicts.length,0,'A released wait does not occupy the professional');
   assert.equal(has(await avail(),'10:15'),false);assert.deepEqual(await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]),original);
   await save([closed(960,1020)]);await blocked(create('16:00',{services:[ids.cut,ids.tint],user:ids.clientB}));const another=await create('17:00',{services:[ids.cut,ids.tint],user:ids.clientB});assert.equal(another.b.timing_snapshot.totalClientMinutes,80);assert.equal(another.b.service_ids.length,2);
  });
  await t.test('idempotent saves and optimistic revisions prevent duplicate days, lost edits or replaying a key for different data',async()=>{
   await fixture();const key=randomUUID(),r=await save([closed(540,600)],{key});assert.deepEqual((await save([closed(540,600)],{key})).r,r.r);
   assert.equal((await one('select count(*)::int n from go_booking_timeline_private.calendar_exception_events where business_id=$1',[ids.business])).n,1);
   await assert.rejects(save([closed(600,660)],{key}),e=>e.message==='BOOKING_REQUEST_REUSED');
   const decisions=await Promise.allSettled([save([closed(600,660)],{revision:1}),save([closed(660,720)],{revision:1})]);assert.equal(decisions.filter(d=>d.status==='fulfilled').length,1);assert.equal(decisions.find(d=>d.status==='rejected').reason.message,'BOOKING_CALENDAR_CHANGED');
  });
  await t.test('a closure racing a stale customer confirmation shares the booking lock and wins before that confirmation',async()=>{
   await fixture();const lock=await connect();const lockPid=(await lock.query('select pg_backend_pid() pid')).rows[0].pid;let attempt;
   try{await lock.query('begin');await lock.query('set local role authenticated');await lock.query("select set_config('request.jwt.claim.sub',$1,true)",[ids.owner]);
    await lock.query(saveSQL,[ids.business,date,null,JSON.stringify([closed(540,600)]),0,randomUUID(),false]);
    attempt=create('09:00').then(value=>({value}),error=>({error}));let waiting=false;
    for(let i=0;i<100;i++){const row=await one("select exists(select 1 from pg_locks held join pg_locks waiting on waiting.locktype=held.locktype and waiting.database is not distinct from held.database and waiting.classid=held.classid and waiting.objid=held.objid and waiting.objsubid=held.objsubid where held.pid=$1 and held.locktype='advisory' and held.granted and not waiting.granted) yes",[lockPid]);if(row.yes){waiting=true;break;}await new Promise(r=>setTimeout(r,20));}
    assert.equal(waiting,true,'Confirmation must demonstrably wait on this business lock');await lock.query('commit');const outcome=await attempt;assert.ok(outcome.error);assert.equal(outcome.error.message,'BOOKING_OUTSIDE_AVAILABILITY');assert.equal((await one('select count(*)::int n from public.bookings where business_id=$1',[ids.business])).n,0);
   }finally{await lock.query('rollback');await lock.end();if(attempt)await attempt;}
  });
  await t.test('simultaneous clients cannot occupy the same open work interval',async()=>{
   await fixture();await save([closed(960,1200)]);const result=await Promise.allSettled([create('09:00'),create('09:00',{user:ids.clientB})]);assert.equal(result.filter(r=>r.status==='fulfilled').length,1);assert.equal((await one('select count(*)::int n from public.bookings where business_id=$1',[ids.business])).n,1);
  });
  await t.test('calendar dates use the establishment timezone, DST days and safe explicit local endpoints',async()=>{
   await fixture();await db.query("update public.businesses set timezone='Europe/Madrid' where id=$1;",[ids.business]);await db.query("update public.availability set timezone='Europe/Madrid' where business_id=$1",[ids.business]);
   const year=new Date().getUTCFullYear()+1,lastSunday=month=>{const d=new Date(Date.UTC(year,month+1,0,12));d.setUTCDate(d.getUTCDate()-d.getUTCDay());return d.toISOString().slice(0,10);},fall=lastSunday(9),spring=lastSunday(2);
   await assert.rejects(save([closed(135,165)],{day:spring}),e=>e.message==='BOOKING_CALENDAR_NONEXISTENT_TIME');await assert.rejects(save([closed(135,165)],{day:fall}),e=>e.message==='BOOKING_CALENDAR_AMBIGUOUS_TIME');
   const result=await save([closed(0,1440)],{day:fall}),range=result.r.day.closedIntervals[0];assert.equal(Date.parse(range.endsAt)-Date.parse(range.startsAt),25*3600000);assert.equal(result.r.timezone,'Europe/Madrid');assert.equal((await avail({day:fall})).r.slots.length,0);
   const springResult=await save([closed(0,1440)],{day:spring}),springRange=springResult.r.day.closedIntervals[0];assert.equal(Date.parse(springRange.endsAt)-Date.parse(springRange.startsAt),23*3600000);
  });
  await t.test('a dated closure subtracts the selected local portion of an overnight weekly shift',async()=>{
   await fixture();await db.query('delete from public.availability where business_id=$1',[ids.business]);await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone,ui_metadata) values($1,extract(dow from $2::date),'22:00','02:00','UTC','{\"endNextDay\":true}')",[ids.business,addDate(date,-1)]);
   await save([closed(0,60)]);const {r}=await get();assert.deepEqual(r.day.openIntervals.map(i=>[clock(i.startsAt),clock(i.endsAt)]),[['01:00','02:00']]);assert.equal(has(await avail(),'01:00'),true);await blocked(create('00:00'));
  });
  await t.test('actual mobile transport + API + isolated SQL persist one dated rule and preserve owner/tenant boundaries',async()=>{
   await fixture();const {createCalendarMobileBridge}=await import('./helpers/calendar-mobile-bridge.mjs');const owner=createCalendarMobileBridge(actor,ids.owner),foreign=createCalendarMobileBridge(actor,ids.foreign);
   const command={businessId:ids.business,staffId:ids.a,dateISO:date,intervals:[closed(540,600)],expectedRevision:0,requestId:randomUUID()};
   const saved=await owner.api.saveCalendarException(command,ids.owner);assert.equal(saved.exceptions[0].staffId,ids.a);assert.equal(saved.exceptions[0].updatedBy,ids.owner);
   assert.deepEqual(await owner.api.getCalendarExceptions(ids.business,date,ids.a,date,ids.owner),saved);assert.equal(has(await avail({staff:ids.a}),'09:00'),false);assert.equal(has(await avail({staff:ids.b}),'09:00'),true);
   await assert.rejects(foreign.api.getCalendarExceptions(ids.business,date,null,date,ids.foreign),e=>e.status===403);
   await owner.api.deleteCalendarException({...command,expectedRevision:saved.exceptions[0].revision,requestId:randomUUID()},ids.owner);assert.equal(has(await avail({staff:ids.a}),'09:00'),true);
   assert.ok(owner.calls.some(call=>call.name==='go_save_booking_calendar_exception'));assert.equal((await one('select count(*)::int n from public.booking_calendar_exceptions where business_id=$1',[ids.business])).n,1);
  });
  await t.test('acceptance revalidates a previously offered change after a closure; cancellation remains the existing explicit operation',async()=>{
   await fixture();const {b}=await create('09:00');const key=randomUUID();await actor(ids.clientA,"select public.go_negotiate_booking($1,'propose',$2,0,null,$3,'10:00',$4,true)",[b.id,key,date,at('10:00')]);
   const original=await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]);await save([closed(600,660)]);
   await assert.rejects(actor(ids.owner,"select public.go_negotiate_booking($1,'accept',$2,1,$3,null,null,null,true)",[b.id,randomUUID(),key]));assert.deepEqual(await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]),original);
   await actor(ids.clientA,"select public.go_negotiate_booking($1,'cancel',$2,1,null,null,null,null,true)",[b.id,randomUUID()]);assert.equal((await one('select status from public.bookings where id=$1',[b.id])).status,'CANCELLED');
  });

  const batchSQL='select public.go_save_booking_calendar_exceptions_batch($1::uuid,$2::date,$3::uuid[],$4::jsonb,$5::jsonb,$6::text,$7::boolean) r';
  const batch=(staff,intervals,options={})=>actor(options.user??ids.owner,batchSQL,[ids.business,options.day??date,staff,JSON.stringify(intervals),JSON.stringify(options.revisions??Object.fromEntries(staff.map(id=>[id,0]))),options.key??randomUUID(),options.deleting??false]);
  await t.test('multiple staff: atomic persistence, editing, idempotency, individual calendar availability and deletion',async()=>{
   await fixture();const c=randomUUID();await db.query("insert into public.staff(id,business_id,display_name,active,ui_metadata) values($1,$2,'Third professional',true,$3)",[c,ids.business,JSON.stringify({serviceIds:[ids.cut]})]);
   const selected=[ids.a,ids.b],key=randomUUID(),ranges=[closed(540,600),closed(1020,1080)];let r=await batch(selected,ranges,{key});
   assert.equal(r.r.days.length,2);assert.deepEqual(new Set(r.r.staffIds),new Set(selected));assert.equal(has(await avail(),'09:00'),false);assert.equal(has(await avail({staff:ids.b}),'09:00'),false);assert.equal(has(await avail({staff:c}),'09:00'),true);
   const read=await actor(ids.owner,'select public.go_booking_calendar_exceptions_batch($1::uuid,$2::date,$3::uuid[],$2::date) r',[ids.business,date,selected]);assert.deepEqual(read,r);
   await batch([...selected].reverse(),ranges,{key});assert.equal((await one('select count(*)::int n from public.booking_calendar_exceptions where business_id=$1',[ids.business])).n,2);
   await assert.rejects(batch([ids.a],ranges,{key}),e=>e.message==='BOOKING_REQUEST_REUSED');
   const revisions=Object.fromEntries(r.r.exceptions.map(e=>[e.staffId,e.revision]));r=await batch(selected,[closed(600,660)],{revisions});assert.equal(has(await avail(),'09:00'),true);
   const next=Object.fromEntries(r.r.exceptions.map(e=>[e.staffId,e.revision]));await batch(selected,[],{revisions:next,deleting:true});assert.equal((await get()).r.exceptions.length,0);assert.equal(has(await avail({staff:ids.b}),'10:00'),true);
  });
  await t.test('a stale member revision rolls back every member and an invalid/foreign selection saves nothing',async()=>{
   await fixture();await save([closed(540,600)],{staff:ids.b});
   await assert.rejects(batch([ids.a,ids.b],[closed(600,660)]),e=>e.message==='BOOKING_CALENDAR_CHANGED');
   assert.equal((await get({staff:ids.a})).r.exceptions.some(e=>e.staffId===ids.a),false);
   const foreign=randomUUID();await db.query("insert into public.staff(id,business_id,display_name) values($1,$2,'Other tenant')",[foreign,ids.otherBusiness]);
   for(const staff of [[ids.a,ids.a],[ids.a,foreign],[]])await assert.rejects(batch(staff,[closed(600,660)]));
   await denied(batch([ids.a],[closed(600,660)],{user:ids.foreign}));await denied(batch([ids.a],[closed(600,660)],{user:ids.clientA}));
   assert.equal((await one('select count(*)::int n from public.booking_calendar_exceptions where business_id=$1',[ids.business])).n,1);
  });
  await t.test('concurrent batches have one revision winner and closures conserve existing commitments and conflict identities',async()=>{
   await fixture();const {b}=await create('09:00');const before=await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]);
   const results=await Promise.allSettled([batch([ids.a,ids.b],[closed(540,600)]),batch([ids.b,ids.a],[closed(540,600)])]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
   const r=results.find(r=>r.status==='fulfilled').value;assert.equal(r.r.exceptions.find(e=>e.staffId===ids.a).conflicts[0].bookingId,b.id);
   assert.deepEqual(await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]),before);await blocked(create('09:00',{staff:ids.b,user:ids.clientB}));
  });
  await t.test('actual multiple selection mobile adapter and API persist and recover through canonical PostgreSQL',async()=>{
   await fixture();const {createCalendarMobileBridge}=await import('./helpers/calendar-mobile-bridge.mjs');const client=createCalendarMobileBridge(actor,ids.owner);
   const c={businessId:ids.business,staffIds:[ids.a,ids.b],dateISO:date,intervals:[open(780,840)],expectedRevisions:{[ids.a]:0,[ids.b]:0},requestId:randomUUID()};
   const saved=await client.api.saveCalendarExceptionsBatch(c,ids.owner);assert.equal(saved.days.length,2);assert.deepEqual(await client.api.getCalendarExceptionsBatch(ids.business,date,[ids.a,ids.b],date,ids.owner),saved);
   await client.api.deleteCalendarExceptionsBatch({...c,expectedRevisions:Object.fromEntries(saved.exceptions.map(e=>[e.staffId,e.revision])),requestId:randomUUID()},ids.owner);
   assert.equal((await get()).r.exceptions.length,0);assert.ok(client.calls.some(c=>c.name==='go_save_booking_calendar_exceptions_batch'));
  });

  await t.test('registered local company identity resolves only its exact owner link, with no name matching or direct client writes',async()=>{
   await fixture();const source='local-'+randomUUID();await db.query('insert into go_booking_timeline_private.calendar_business_links(source_id,owner_id,business_id) values($1,$2,$3)',[source,ids.owner,ids.business]);
   const sql='select public.go_booking_calendar_business($1::text) r';const linked=await actor(ids.owner,sql,[source]);assert.equal(linked.r.businessId,ids.business);assert.equal(linked.r.sourceId,source);await denied(actor(ids.owner,'select * from go_booking_timeline_private.calendar_booking_sources'));
   for(const user of [ids.foreign,ids.clientA])await assert.rejects(actor(user,sql,[source]),e=>e.message==='BOOKING_CALENDAR_BUSINESS_NOT_LINKED');
   await assert.rejects(actor(ids.owner,sql,['Isolated calendar fixture']),e=>e.message==='BOOKING_CALENDAR_BUSINESS_NOT_LINKED');
   await denied(actor(ids.owner,'insert into go_booking_timeline_private.calendar_business_links(source_id,owner_id,business_id) values($1,$2,$3)',[randomUUID(),ids.owner,ids.otherBusiness]));
   await db.query("update public.businesses set name='Renamed same business' where id=$1",[ids.business]);assert.equal((await actor(ids.owner,sql,[source])).r.businessId,ids.business);
  });

  await t.test('timezone selector persistence is atomic, tenant-scoped and preserves weekly wall-clock times',async()=>{
   await fixture();await db.query('insert into public.business_settings(business_id,payload) values($1,$2)',[ids.business,JSON.stringify({businessName:'Unchanged',timezone:'UTC',services:['Preserved']})]);
   const windows=async()=>(await db.query('select id,weekday,start_time,end_time,staff_id,active,ui_metadata from public.availability where business_id=$1 order by id',[ids.business])).rows;
   const before=await windows(),sql='select public.go_set_booking_calendar_timezone($1::uuid,$2::text,$3::text) r';
   let r=await actor(ids.owner,sql,[ids.business,'Atlantic/Canary','UTC']);assert.equal(r.r.timezone,'Atlantic/Canary');assert.deepEqual(await windows(),before);
   assert.deepEqual((await one('select payload from public.business_settings where business_id=$1',[ids.business])).payload,{businessName:'Unchanged',timezone:'Atlantic/Canary',services:['Preserved']});
   assert.equal((await actor(ids.owner,'select public.go_booking_calendar_business($1::text) r',[ids.business])).r.businessId,ids.business);
   await denied(actor(ids.foreign,sql,[ids.business,'Europe/Madrid','Atlantic/Canary']));await denied(actor(ids.clientA,sql,[ids.business,'Europe/Madrid','Atlantic/Canary']));
   await assert.rejects(actor(ids.owner,sql,[ids.business,'Europe/Madrid','UTC']),e=>e.message==='BOOKING_CALENDAR_CHANGED');await assert.rejects(actor(ids.owner,sql,[ids.business,'invalid/timezone','Atlantic/Canary']),e=>e.message==='BOOKING_INVALID_TIMEZONE');
   const {createCalendarMobileBridge}=await import('./helpers/calendar-mobile-bridge.mjs'),mobile=createCalendarMobileBridge(actor,ids.owner);
   assert.equal(await mobile.api.setCalendarBusinessTimezone(ids.business,'Europe/Madrid',ids.owner),'Europe/Madrid');assert.equal((await one('select timezone from public.businesses where id=$1',[ids.business])).timezone,'Europe/Madrid');assert.deepEqual(await windows(),before);
  });
  await t.test('changing a booked timezone cannot shift any existing reservation, and the same saved zone remains selectable',async()=>{
   await fixture();const {b}=await create('09:00');const before=await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]),sql='select public.go_set_booking_calendar_timezone($1::uuid,$2::text,$3::text) r';
   await assert.rejects(actor(ids.owner,sql,[ids.business,'Europe/Madrid','UTC']),e=>e.message==='BOOKING_TIMEZONE_HAS_COMMITMENTS');await actor(ids.owner,sql,[ids.business,'UTC','UTC']);assert.deepEqual(await one('select to_jsonb(b) value from public.bookings b where id=$1',[b.id]),before);
   await fixture();await save([closed(540,600)]);await assert.rejects(actor(ids.owner,sql,[ids.business,'Europe/Madrid','UTC']),e=>e.message==='BOOKING_TIMEZONE_HAS_COMMITMENTS');assert.equal((await get()).r.timezone,'UTC');
  });
 }finally{await db.end();}
});
