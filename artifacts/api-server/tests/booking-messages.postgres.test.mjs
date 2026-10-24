import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {catalogDatabase} from './helpers/prepare-catalog-db.mjs';

test('GO Communication uses one persisted reservation thread and existing participant permissions',{skip:!process.env.GO_CATALOG_TEST_URL},async t=>{
 const db=await catalogDatabase(),[owner,customer,other,secondOwner,business,otherBusiness,service,otherService,booking,otherBooking]=Array.from({length:10},()=>randomUUID());
 try{
  await db.query('begin');
  const draft=await readFile('supabase/drafts/booking_messages_v1.sql','utf8');
  await db.query(draft.replace(/^begin;$/m,'').replace(/^commit;$/m,''));
  for(const [id,name]of [[owner,'Owner'],[customer,'Customer'],[other,'Unrelated customer'],[secondOwner,'Second owner']]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@test.invalid']);
   await db.query('insert into public.profiles(id,full_name) values($1,$2) on conflict(id) do update set full_name=excluded.full_name',[id,name]);
  }
  for(const [id,who,title]of [[business,owner,'Registered salon'],[otherBusiness,secondOwner,'Other salon']])await db.query('insert into public.businesses(id,owner_id,name,verified,booking_enabled) values($1,$2,$3,true,true)',[id,who,title]);
  for(const [id,biz]of [[service,business],[otherService,otherBusiness]])await db.query("insert into public.services(id,business_id,name,duration_minutes,price) values($1,$2,'Service',30,25)",[id,biz]);
  for(const [id,biz,item]of [[booking,business,service],[otherBooking,otherBusiness,otherService]])await db.query("insert into public.bookings(id,business_id,customer_id,service_id,starts_at,ends_at,status) values($1,$2,$3,$4,now()+interval '20 days',now()+interval '20 days 30 minutes','CONFIRMED')",[id,biz,customer,item]);
  const original=(await db.query('select to_jsonb(r) data from public.bookings r where id=$1',[booking])).rows[0].data;
  const as=async who=>{await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[who]);await db.query('set local role authenticated');};
  const inbox=async id=>(await db.query('select public.go_booking_conversations($1) data',[id??null])).rows[0].data;
  const send=async(id,text='Message',bid=booking)=>(await db.query('select public.go_send_booking_message($1,$2,$3) data',[bid,id,text])).rows[0].data;
  const denied=async operation=>{await db.query('savepoint denied');try{await assert.rejects(operation)}finally{await db.query('rollback to savepoint denied');}};
  const first=randomUUID();
  await t.test('customer opens the correct company thread without creating a message',async()=>{await as(customer);const [thread]=await inbox(booking);assert.equal(thread.contactName,'Registered salon');assert.equal(thread.counterpartId,owner);assert.deepEqual(thread.messages,[]);assert.deepEqual(await inbox(),[]);});
  await t.test('sending persists once; company sees the same canonical thread and customer identity',async()=>{await as(customer);const sent=await send(first,'Hello salon');assert.equal(sent.messages.length,1);assert.equal(sent.messages[0].senderId,'yo');await as(owner);const [received]=await inbox();assert.equal(received.bookingId,booking);assert.equal(received.contactName,'Customer');assert.equal(received.counterpartId,customer);assert.equal(received.messages[0].senderId,customer);assert.equal(received.messages[0].text,'Hello salon');});
  await t.test('retry after lost response or Reload does not duplicate a message',async()=>{await as(customer);assert.equal((await send(first,'Hello salon')).messages.length,1);await denied(()=>send(first,'Altered request'));});
  await t.test('reply from general Communication is visible from the same booking detail',async()=>{await as(owner);await send(randomUUID(),'Hello customer');await as(customer);const [fromCard]=await inbox(booking),[general]=await inbox();assert.equal(fromCard.id,general.id);assert.equal(fromCard.messages.length,2);assert.equal(fromCard.messages[1].senderId,owner);assert.equal(fromCard.messages[1].text,'Hello customer');});
  await t.test('other users and companies cannot read or send to this thread',async()=>{for(const actor of [other,secondOwner]){await as(actor);assert.deepEqual(await inbox(),[]);await denied(()=>inbox(booking));await denied(()=>send(randomUUID()));}await as(owner);await denied(()=>inbox(otherBooking));await denied(()=>send(randomUUID(),'Other company',otherBooking));});
  await t.test('direct table access, anonymous reads and forged authors are not granted',async()=>{await as(customer);assert.equal((await db.query("select has_table_privilege('authenticated','go_reservation_negotiation.messages','select') ok")).rows[0].ok,false);await denied(()=>db.query("insert into go_reservation_negotiation.messages values($1,$2,$3,'Forged',now())",[booking,owner,randomUUID()]));await db.query('reset role');await db.query('set local role anon');await denied(()=>inbox(booking));});
  await t.test('communication never changes booking state, date, services, price or proposals',async()=>{await db.query('reset role');const after=(await db.query('select to_jsonb(r) data from public.bookings r where id=$1',[booking])).rows[0].data;assert.deepEqual(after,original);});
 }finally{await db.query('rollback');await db.end();}
});
