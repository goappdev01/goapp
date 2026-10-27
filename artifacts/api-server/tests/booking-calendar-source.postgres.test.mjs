import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {registeredBridge} from './helpers/registered-booking-bridge.mjs';
const {Client}=createRequire(createRequire(import.meta.url).resolve('@workspace/db'))('pg');
const configured=process.env.GO_CALENDAR_TEST_URL;
async function connect(){assert.equal(process.env.GO_CALENDAR_TEST_CONFIRM,'isolated');const url=new URL(configured);assert.equal(url.href,'postgresql://go_booking_test_owner@127.0.0.1:65439/go_booking_phase_test_20261025');const db=new Client({connectionString:url.href});await db.connect();assert.equal((await db.query("select current_setting('go.booking_test_environment') marker")).rows[0].marker,'phase-isolated');return db;}
const future=new Date(Date.now()+86400000);while(future.getUTCDay()!==1)future.setUTCDate(future.getUTCDate()+1);const date=future.toISOString().slice(0,10);
const plain=value=>JSON.parse(JSON.stringify(value));
test('registered customer circuit honors real calendar closures without local confirmations',{skip:!configured},async t=>{
 const db=await connect();
 async function actor(user,sql,args=[]){const c=await connect();try{await c.query('begin');await c.query('set local role authenticated');await c.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const row=(await c.query(sql,args)).rows[0];await c.query('commit');return row;}catch(e){await c.query('rollback');throw e;}finally{await c.end();}}
 async function fixture(){
  const ids=Object.fromEntries(['owner','foreign','company','cut','wash',...['a','b','c','d']].map(key=>[key,randomUUID()]));
  for(const user of [ids.owner,ids.foreign])await db.query('insert into auth.users(id,email) values($1,$2)',[user,user+'@isolated.invalid']);
  await db.query("update public.profiles set role='empresa',full_name='Test owner' where id=$1",[ids.owner]);
  await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,timezone,ui_metadata) values($1,$2,'Calendar source fixture',true,false,'Europe/Madrid',$3)",[ids.company,ids.owner,JSON.stringify({category:'peluqueria'})]);
  const source='demo_business_'+ids.owner+'_'+ids.company,cut=source+'_service_63_6f_72_74_65',wash=source+'_service_6c_61_76_61_64_6f';
  await db.query('insert into go_booking_timeline_private.calendar_business_links(owner_id,source_id,business_id) values($1,$2,$3)',[ids.owner,source,ids.company]);
  for(const [id,name,duration,sourceId]of [[ids.cut,'Corte',30,cut],[ids.wash,'Lavado',15,wash]])await db.query('insert into public.services(id,business_id,name,duration_minutes,price,currency,ui_metadata) values($1,$2,$3,$4,15,\'EUR\',$5)',[id,ids.company,name,duration,JSON.stringify({calendarSourceServiceId:sourceId})]);
  const staff=['a','b','c','d'].map((key,index)=>({id:source+'_staff_'+key,name:'Raul '+(index+1),canonical:ids[key]}));
  for(const person of staff)await db.query('insert into public.staff(id,business_id,display_name,ui_metadata) values($1,$2,$3,$4)',[person.canonical,ids.company,person.name,JSON.stringify({serviceIds:[ids.cut,ids.wash],calendarSourceStaffId:person.id})]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) values($1,1,'09:00','20:00','Europe/Madrid')",[ids.company]);
  const initial={businessName:'Calendar source fixture',address:'Existing address',sectorId:'belleza',subId:'peluqueria',timezone:'Europe/Madrid',activeDays:[0],openFrom:'09:00',openTo:'20:00',daySchedules:{},services:[{name:'Corte',duration:30,price:15},{name:'Lavado',duration:15,price:15}],plantillaItems:[{id:'group',name:'Profesionales',emoji:'',count:4,staffNames:staff.map(p=>p.name),staffIds:staff.map(p=>p.id),staffActive:staff.map(()=>true),staffServices:staff.map(()=>['Corte','Lavado'])}],completedSteps:[0,1,2,3,4,5,6,7],paymentPolicy:0,approvalPolicy:0,cancelPolicy:0,bookingEnabled:false,staffSchedules:{}};
  const f=registeredBridge(actor,ids.owner,initial,source,ids.company);await f.store.load();await f.store.saveFloorPlan({id:f.store.planId,businessId:source,elements:staff.map((p,index)=>({id:'seat_'+index,demoStaffId:p.id,demoKind:'professional',type:'silla',label:p.name,reservable:true,status:'disponible',x:0,y:0,width:52,height:52})),updatedAt:1});
  const repo=f.repo(),slots=(index=3,day=date)=>repo.getAllSlots(source,cut,day,staff[index].id,[cut]);
  const closure=async(index=3,intervals=[{kind:'closed',startMinute:540,endMinute:720}],day=date,revision=0)=>actor(ids.owner,'select public.go_save_booking_calendar_exception($1,$2,$3,$4,$5,$6,false) r',[ids.company,day,staff[index].canonical,JSON.stringify(intervals),revision,randomUUID()]);
  const hold=async(time='12:00',index=3)=>{const slot=(await slots(index)).find(s=>s.startDatetime.slice(11,16)===time);assert.ok(slot,'Expected '+time+' for '+staff[index].name);const q=await repo.quoteCatalog(source,[cut]);return repo.createHold({businessId:source,bookableItemId:cut,services:q.lines.map(line=>({id:line.itemId,title:line.name,durationMinutes:line.durationMinutes,price:line.charge,currency:line.currency})),catalogSnapshot:q,customerId:ids.owner,staffId:slot.staffId,...slot,unitsReserved:1,peopleCount:1});};
  return {...f,ids,staff,repo,source,cut,slots,closure,hold};
 }
 try{
  await t.test('Raul 3/4 closure 09:00–12:00 removes starts; others and 12:00 remain available',async()=>{
   const f=await fixture();await f.closure(2);await f.closure(3);
   for(const index of [2,3]){const slots=await f.slots(index);assert.ok(!slots.some(s=>s.startDatetime.slice(11,16)<'12:00'));assert.ok(slots.some(s=>s.startDatetime.slice(11,16)==='12:00'));}
   for(const index of [0,1])assert.ok((await f.slots(index)).some(s=>s.startDatetime.slice(11,16)==='09:00'));
   const unavailable=await actor(f.ids.owner,'select public.go_booking_availability(p_business_id=>$1,p_service_ids=>$2,p_date_iso=>$3,p_staff_id=>$4) r',[f.ids.company,[f.ids.cut],date,f.ids.d]);
   assert.deepEqual(plain((await f.slots()).map(s=>s.startInstant)),unavailable.r.slots.filter((s,i)=>true).map(s=>s.startsAt).filter(v=>new Date(v).getUTCMinutes()%15===0));
   assert.equal(f.calls.filter(c=>c.name==='go_create_catalog_booking').length,0);
  });
  await t.test('closure saved after selection rejects confirmation in API/SQL with zero local or server bookings',async()=>{
   const f=await fixture(),held=await f.hold('09:00');assert.equal(held.ok,true);assert.equal(f.store.getSnapshot().bookings.length,0);
   await f.closure();const refused=await f.repo.claimSlot({...held.booking,status:'CONFIRMED'}).catch(error=>({ok:false,error}));assert.equal(refused.ok,false);assert.equal(f.store.getSnapshot().bookings.length,0);
   assert.equal((await db.query('select count(*)::int n from public.bookings where business_id=$1',[f.ids.company])).rows[0].n,0);
  });
  await t.test('canonical confirmation, reload, customer/company projections and replay preserve a single booking',async()=>{
   const f=await fixture();await f.closure();const held=await f.hold(),confirmed=await f.repo.claimSlot({...held.booking,status:'CONFIRMED'});assert.equal(confirmed.ok,true);assert.equal(f.store.getSnapshot().bookings.length,1);assert.equal(f.store.getSnapshot().entries.length,1);assert.equal(f.repo.getCustomerEntries().length,1);
   const again=await f.repo.claimSlot({...held.booking,status:'CONFIRMED'});assert.equal(again.booking.id,confirmed.booking.id);assert.equal((await f.repo.getMyBookings()).length,1);
   const reopened=f.makeStore();await reopened.load();const next=f.modules('demoBookingRepository').createDemoBookingRepository(reopened);assert.equal((await next.getMyBookings()).length,1);
   await assert.rejects(f.store.transactBookings(data=>{data.bookings[0].services=[...(data.bookings[0].services??[]),{id:f.source+'_service_6c_61_76_61_64_6f',title:'Lavado',durationMinutes:15,price:15}];}),/servidor/);
   assert.equal((await db.query('select count(*)::int n from public.bookings where business_id=$1',[f.ids.company])).rows[0].n,1);
   const saved=(await db.query('select status,starts_at,ends_at from public.bookings where business_id=$1',[f.ids.company])).rows[0];assert.equal(saved.status,'CONFIRMED');assert.equal((saved.ends_at-saved.starts_at)/60000,30);
   await f.repo.cancelBooking(confirmed.booking.id);assert.equal((await f.repo.getMyBookings())[0].status,'CANCELLED');assert.ok((await f.slots()).some(s=>s.startDatetime.slice(11,16)==='12:00'));
  });
  await t.test('two confirmations racing the same professional only persist one commitment',async()=>{
   const f=await fixture(),first=await f.hold(),second=await f.hold();const results=await Promise.allSettled([f.repo.claimSlot({...first.booking,status:'CONFIRMED'}),f.repo.claimSlot({...second.booking,status:'CONFIRMED'})]);assert.equal(results.filter(r=>r.status==='fulfilled'&&r.value.ok===true).length,1);assert.equal((await db.query('select count(*)::int n from public.bookings where business_id=$1',[f.ids.company])).rows[0].n,1);
  });
  await t.test('partial overlap, a full-day closure and a dated extraordinary opening use the same engine',async()=>{
   const f=await fixture();await f.closure(3,[{kind:'closed',startMinute:900,endMinute:960}]);assert.ok(!(await f.slots()).some(s=>s.startDatetime.slice(11,16)==='14:45'));
   await f.closure(2,[{kind:'closed',startMinute:0,endMinute:1440}]);assert.equal((await f.slots(2)).length,0);
   const sunday=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);assert.equal((await f.slots(3,sunday)).length,0);
   await f.closure(3,[{kind:'open',startMinute:600,endMinute:720}],sunday);assert.ok((await f.slots(3,sunday)).some(s=>s.startDatetime.slice(11,16)==='10:00'));assert.equal((await f.slots(2,sunday)).length,0);
  });
  await t.test('an existing commitment survives a later closure and appears in its conflict report',async()=>{
   const f=await fixture(),held=await f.hold(),saved=await f.repo.claimSlot({...held.booking,status:'CONFIRMED'});const before=(await db.query('select to_jsonb(b) r from public.bookings b where id=$1',[saved.booking.serverBookingId])).rows[0].r;
   const result=await f.closure(3,[{kind:'closed',startMinute:720,endMinute:780}]);assert.equal(result.r.exceptions[0].conflicts[0].bookingId,saved.booking.serverBookingId);assert.deepEqual((await db.query('select to_jsonb(b) r from public.bookings b where id=$1',[saved.booking.serverBookingId])).rows[0].r,before);
   assert.equal((await f.repo.getMyBookings())[0].status,'CONFIRMED');
  });
  await t.test('backend outage, account switch and manual projection writes cannot fabricate confirmation',async()=>{
   const f=await fixture(),held=await f.hold();f.state.offline=true;await assert.rejects(f.slots());const refused=await f.repo.claimSlot({...held.booking,status:'CONFIRMED'}).catch(error=>({ok:false,error}));assert.equal(refused.ok,false);assert.equal(f.store.getSnapshot().bookings.length,0);
   f.state.offline=false;await assert.rejects(f.store.transactBookings(data=>data.bookings.push({...held.booking,id:'unverified',status:'CONFIRMED'})),/servidor/);assert.equal(f.store.getSnapshot().bookings.length,0);
   f.state.user=f.ids.foreign;await assert.rejects(f.slots());assert.equal((await db.query('select count(*)::int n from public.bookings where business_id=$1',[f.ids.company])).rows[0].n,0);
   await assert.rejects(actor(f.ids.foreign,'select public.go_booking_calendar_business($1) r',[f.source]),/NOT_LINKED/);
   await assert.rejects(actor(f.ids.foreign,'select public.go_booking_availability(p_business_id=>$1,p_service_ids=>$2,p_date_iso=>$3,p_staff_id=>$4) r',[f.ids.company,[f.ids.cut],date,f.ids.d]),/UNAVAILABLE/);
  });
 }finally{await db.end();}
});
