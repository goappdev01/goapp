import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {btree_gist} from '@electric-sql/pglite/contrib/btree_gist';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';

const ids=Object.fromEntries(['owner','customer','other','foreignOwner','company','foreignCompany','cut','wash','foreign'].map(key=>[key,randomUUID()]));
const at=time=>`2090-01-10T${time}:00Z`;
const baseDrafts=['booking_multi_service_v2.sql','booking_negotiation_v1.sql','booking_verification_v1.sql',
 'booking_timeline_v1.sql','booking_phase_wait_v1.sql','booking_gap_policy_v1.sql',
 'booking_calendar_exceptions_v1.sql','catalog_associations_v1.sql','catalog_voluntary_v1.sql'];

test('owned reservation keeps its start after a viable service change; foreign exclusions and occupied tails fail',async()=>{
 const db=new PGlite({extensions:{btree_gist,pgcrypto}});
 try{
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
  for(const file of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')&&name<'202611').sort())
   await db.exec(await readFile('supabase/migrations/'+file,'utf8'));
  for(const file of baseDrafts)await db.exec(await readFile('supabase/drafts/'+file,'utf8'));
  await db.exec(await readFile('supabase/migrations/20261126105540_go_restaurant_bookings_v1.sql','utf8'));
  await db.exec(await readFile('supabase/migrations/20261126155047_go_booking_change_selection_v1.sql','utf8'));
  const as=async(uid,fn)=>{await db.exec('begin;set local role authenticated');try{
   await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);const result=await fn();await db.exec('commit');return result;
  }catch(error){await db.exec('rollback');throw error;}};
  const scalar=async(sql,args)=> (await db.query(sql,args)).rows[0].result;
  const quote=(roots,selected=[],uid=ids.customer)=>as(uid,()=>scalar('select public.go_catalog_quote($1,$2::uuid[],$3::uuid[]) result',[ids.company,roots,selected]));
  const book=(roots,time,key,uid=ids.customer)=>as(uid,async()=>{
   const q=await scalar('select public.go_catalog_quote($1,$2::uuid[],array[]::uuid[]) result',[ids.company,roots]);
   return scalar('select public.go_create_catalog_booking(p_business_id=>$1,p_root_ids=>$2::uuid[],p_selected_ids=>array[]::uuid[],p_starts_at=>$3::timestamptz,p_staff_id=>null::uuid,p_request_key=>$4,p_expected_quote=>$5::jsonb) result',
    [ids.company,roots,at(time),key,JSON.stringify(q)]);
  });
  const act=(uid,booking,operation,revision,proposalId,selection,time='10:00',requestId=randomUUID())=>as(uid,()=>scalar(
   'select public.go_negotiate_booking_selection($1,$2,$3,$4,$5,$6,$7,$8::timestamptz,true,$9::jsonb) result',
   [booking,operation,requestId,revision,proposalId,'2090-01-10',time,at(time),selection?JSON.stringify(selection):null]));
  for(const uid of [ids.owner,ids.customer,ids.other,ids.foreignOwner])await db.query('insert into auth.users(id,email) values($1,$2)',[uid,uid+'@example.invalid']);
  await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,timezone) values($1,$2,'Salon',true,true,'UTC'),($3,$4,'Other',true,true,'UTC')",
   [ids.company,ids.owner,ids.foreignCompany,ids.foreignOwner]);
  await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,'Cut',20,20,'EUR'),($3,$2,'Wash',10,5,'EUR'),($4,$5,'Foreign',10,5,'EUR')",
   [ids.cut,ids.company,ids.wash,ids.foreign,ids.foreignCompany]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'08:00','23:00','UTC' from generate_series(0,6) d",[ids.company]);
  const original=await book([ids.cut],'10:00','original');
  const target=await quote([ids.cut,ids.wash]);
  const selection={serviceIds:target.serviceIds,staffId:null,durationMinutes:30,catalogSnapshot:target};
  const available=await as(ids.customer,()=>scalar('select public.go_booking_change_availability($1,$2::uuid[],$3::date,null,1,false,15) result',
   [original.id,target.serviceIds,'2090-01-10']));
  assert.ok(available.slots.some(row=>Date.parse(row.startsAt)===Date.parse(at('10:00'))),
   'the original minute remains selectable: '+JSON.stringify(available.slots.slice(0,3)));
  await assert.rejects(as(ids.other,()=>scalar('select public.go_booking_change_availability($1,$2::uuid[],$3::date) result',
   [original.id,target.serviceIds,'2090-01-10'])),/BOOKING_NOT_FOUND/);
  const proposed=await act(ids.customer,original.id,'propose',0,null,selection);
  assert.equal(Date.parse(proposed.starts_at),Date.parse(at('10:00')));assert.equal(proposed.catalog_snapshot.totalPrice,20);
  await assert.rejects(as(ids.customer,()=>db.query('update public.bookings set catalog_snapshot=$1::jsonb where id=$2',
   [JSON.stringify(target),original.id])),/CATALOG_SNAPSHOT_IMMUTABLE|Customers may only|permission denied/);
  const acceptedId=proposed.change_proposal.id;
  const retryId=randomUUID();
  const accepted=await act(ids.owner,original.id,'accept',1,acceptedId,null,'10:00',retryId);
  assert.equal(Date.parse(accepted.starts_at),Date.parse(at('10:00')));assert.equal(accepted.catalog_snapshot.totalPrice,25);
  assert.deepEqual(accepted.service_ids,[ids.cut,ids.wash]);
  assert.deepEqual(await act(ids.owner,original.id,'accept',1,acceptedId,null,'10:00',retryId),accepted);
  await assert.rejects(act(ids.other,original.id,'propose',2,null,selection),/BOOKING_NOT_FOUND/);
  // A product-only optional association changes the price, not the duration.
  const product=randomUUID();await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency,ui_metadata) values($1,$2,'Ampoule',0,3,'EUR',$3::jsonb)",
   [product,ids.company,JSON.stringify({catalogKind:'product'})]);
  const association=await as(ids.owner,()=>scalar("select public.go_catalog_associations($1,'create',$2::jsonb) result",
   [ids.company,JSON.stringify({sourceId:ids.cut,targetId:product,mode:'optional'})]));
  const productQuote=await quote([ids.cut,ids.wash],[association.id]);
  const productSelection={serviceIds:productQuote.serviceIds,staffId:null,durationMinutes:30,catalogSnapshot:productQuote};
  const withProduct=await act(ids.customer,original.id,'propose',2,null,productSelection).catch(e=>{e.message='product proposal: '+e.message;throw e});
  const productAccepted=await act(ids.owner,original.id,'accept',3,withProduct.change_proposal.id,null).catch(e=>{e.message='product acceptance: '+e.message;throw e});
  assert.equal(productAccepted.catalog_snapshot.totalPrice,28);
  assert.equal(Date.parse(productAccepted.ends_at)-Date.parse(productAccepted.starts_at),30*60000);
  assert.deepEqual(productAccepted.service_ids,[ids.cut,ids.wash]);
  // Rejection must leave the original booking and price untouched.
  const noProductQuote=await quote([ids.cut,ids.wash]);
  const removing=await act(ids.customer,original.id,'propose',4,null,{...selection,catalogSnapshot:noProductQuote});
  const rejected=await act(ids.owner,original.id,'reject',5,removing.change_proposal.id,null);
  assert.equal(rejected.catalog_snapshot.totalPrice,28);assert.equal(rejected.change_proposal,null);
  const second=await book([ids.cut],'12:00','second',ids.other);
  const pending=await act(ids.other,second.id,'propose',0,null,{...selection,catalogSnapshot:noProductQuote},'12:00');
  const blocker=await book([ids.wash],'12:20','blocker');
  assert.ok(second&&blocker);
  await assert.rejects(act(ids.owner,second.id,'accept',1,pending.change_proposal.id,null,'12:00'),/BOOKING_.*|conflict|exclusion/i);
  const unchanged=await db.query('select starts_at,ends_at,change_proposal from public.bookings where id=$1',[second.id]);
  assert.equal(Date.parse(unchanged.rows[0].ends_at)-Date.parse(unchanged.rows[0].starts_at),20*60000);
  assert.equal(unchanged.rows[0].change_proposal.id,pending.change_proposal.id);
  await assert.rejects(book([ids.cut],'10:00','third'),/BOOKING_.*|conflict|exclusion/i);
  // The same booking ID exclusion must preserve restaurant table and aforo.
  const restaurant=randomUUID(),meal=randomUUID(),dessert=randomUUID();
  await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,timezone,ui_metadata) values($1,$2,'Restaurant',true,true,'UTC',$3::jsonb)",
   [restaurant,ids.owner,JSON.stringify({category:'restaurante'})]);
  await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,'Meal',20,20,'EUR'),($3,$2,'Dessert',10,5,'EUR')",
   [meal,restaurant,dessert]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,d,'08:00','23:00','UTC' from generate_series(0,6) d",[restaurant]);
  await db.query("insert into public.business_settings(business_id,payload) values($1,$2::jsonb)",
   [restaurant,JSON.stringify({floorPlan:{id:'floor',businessId:restaurant,occupancyLimit:4,elements:[
    {id:'only-table',type:'mesa',capacity:4,status:'disponible',reservable:true}]}})]);
  const restaurantBooking=await as(ids.customer,()=>scalar(
   'select public.go_create_restaurant_timeline_booking(p_business_id=>$1,p_service_ids=>$2::uuid[],p_starts_at=>$3::timestamptz,p_staff_id=>null::uuid,p_request_key=>$4,p_party_size=>4) result',
   [restaurant,[meal],at('15:00'),'restaurant-original']));
  const restaurantQuote=await as(ids.customer,()=>scalar('select public.go_catalog_quote($1,$2::uuid[],array[]::uuid[]) result',[restaurant,[meal,dessert]]));
  const restaurantChoice={serviceIds:restaurantQuote.serviceIds,staffId:null,durationMinutes:30,catalogSnapshot:restaurantQuote};
  const restaurantSlots=await as(ids.customer,()=>scalar('select public.go_booking_change_availability($1,$2::uuid[],$3::date) result',
   [restaurantBooking.id,[meal,dessert],'2090-01-10']));
  assert.ok(restaurantSlots.slots.some(row=>Date.parse(row.startsAt)===Date.parse(at('15:00'))));
  const restaurantProposal=await act(ids.customer,restaurantBooking.id,'propose',0,null,restaurantChoice,'15:00');
  const restaurantAccepted=await act(ids.owner,restaurantBooking.id,'accept',1,restaurantProposal.change_proposal.id,null,'15:00');
  assert.equal(restaurantAccepted.party_size,4);assert.equal(restaurantAccepted.restaurant_table_id,'only-table');
  assert.equal(Date.parse(restaurantAccepted.ends_at)-Date.parse(restaurantAccepted.starts_at),30*60000);
  await assert.rejects(as(ids.other,()=>scalar(
   'select public.go_create_restaurant_timeline_booking(p_business_id=>$1,p_service_ids=>$2::uuid[],p_starts_at=>$3::timestamptz,p_staff_id=>null::uuid,p_request_key=>$4,p_party_size=>4) result',
   [restaurant,[meal],at('15:00'),'restaurant-conflict'])),/RESTAURANT_.*|BOOKING_.*|conflict/i);
 }finally{await db.close();}
});
