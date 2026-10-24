import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {catalogDatabase} from './helpers/prepare-catalog-db.mjs';

test('Reservation contact receipts enforce existing participant permissions (existing isolated PostgreSQL)',{skip:!process.env.GO_CATALOG_TEST_URL},async t=>{
 const db=await catalogDatabase();
 const ids=Array.from({length:9},()=>randomUUID()),[owner,customer,outsider,secondOwner,business,otherBusiness,service,otherService,booking]=ids;
 try{
  await db.query('begin');
  const draft=await readFile('supabase/drafts/booking_negotiation_v1.sql','utf8');
  const receipt=draft.match(/create function go_reservation_negotiation\.receipt[\s\S]+?\$\$;/)?.[0];assert.ok(receipt);
  await db.query(receipt.replace('create function','create or replace function'));
  await db.query("select set_config('request.jwt.claim.sub','',true)");
  for(const [id,name,phone] of [[owner,'Business owner','+34910123456'],[customer,'Registered customer','+34600123456'],[outsider,'Unrelated customer','+34699123456'],[secondOwner,'Other business owner','+34920123456']]){
   await db.query('insert into auth.users(id,email) values($1,$2)',[id,id+'@test.invalid']);
   await db.query("insert into public.profiles(id,full_name,phone) values($1,$2,$3) on conflict(id) do update set full_name=excluded.full_name,phone=excluded.phone",[id,name,phone]);
  }
  for(const [id,own,title]of [[business,owner,'Registered salon'],[otherBusiness,secondOwner,'Other salon']])await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,ui_metadata) values($1,$2,$3,true,true,$4)",[id,own,title,{phone:'910123456',phoneE164:'+34910123456',whatsappE164:'+34611123456'}]);
  for(const [id,b]of [[service,business],[otherService,otherBusiness]])await db.query("insert into public.services(id,business_id,name,duration_minutes,price) values($1,$2,'Registered service',60,25)",[id,b]);
  await db.query("insert into public.bookings(id,business_id,service_id,customer_id,starts_at,ends_at,status) values($1,$2,$3,$4,'2035-01-07T10:00:00Z','2035-01-07T11:00:00Z','CONFIRMED')",[booking,business,service,customer]);
  const as=async(actor,businessId)=>{
   await db.query('set local role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);
   const {rows:[row]}=await db.query('select public.go_booking_receipts($1) receipts',[businessId]);return row.receipts;
  };
  await t.test('business sees its actual customer and authorized phone, with business and service data',async()=>{
   const rows=await as(owner,business);assert.equal(rows.length,1);assert.equal(rows[0].id,booking);assert.equal(rows[0].customer_name,'Registered customer');assert.equal(rows[0].customer_phone,'+34600123456');assert.equal(rows[0].business_name,'Registered salon');assert.equal(rows[0].service_name,'Registered service');
  });
  await t.test('customer sees business phone and WhatsApp; no customer directory phone is exposed',async()=>{
   const rows=await as(customer,business);assert.equal(rows.length,1);assert.equal(rows[0].customer_phone,null);assert.equal(rows[0].business_phone,'+34910123456');assert.equal(rows[0].business_whatsapp,'+34611123456');
  });
  await t.test('unrelated customer and other company owner cannot obtain the receipt or its phone',async()=>{
   assert.deepEqual(await as(outsider,business),[]);assert.deepEqual(await as(secondOwner,business),[]);assert.deepEqual(await as(owner,otherBusiness),[]);
  });
  await t.test('phone updates resolve from the linked profile for existing reservations',async()=>{
   await db.query('reset role');await db.query("select set_config('request.jwt.claim.sub','',true)");await db.query("update public.profiles set phone='+34600123457' where id=$1",[customer]);
   const rows=await as(owner,business);assert.equal(rows[0].customer_phone,'+34600123457');
  });
  await t.test('private receipt helper remains inaccessible directly to authenticated users',async()=>{
   const {rows:[row]}=await db.query("select has_function_privilege('authenticated','go_reservation_negotiation.receipt(uuid)','execute') allowed");assert.equal(row.allowed,false);
  });
 }finally{await db.query('rollback');await db.end();}
});
