import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import { readFile, readdir } from 'node:fs/promises';

const owner='00000000-0000-4000-8000-000000000001', customer='00000000-0000-4000-8000-000000000002';
const outsider='00000000-0000-4000-8000-000000000003';
const company='00000000-0000-4000-8000-000000000010', other='00000000-0000-4000-8000-000000000020';
const cut='00000000-0000-4000-8000-000000000011', wash='00000000-0000-4000-8000-000000000012';
const style='00000000-0000-4000-8000-000000000013', foreign='00000000-0000-4000-8000-000000000021';
const day='2090-01-10', second='2090-01-11', third='2090-01-12';
const at=(time,date=day)=>date+'T'+time+':00+01:00';
const slot=(dateISO,startMinute,endMinute,basisPoints,serviceIds=null)=>({dateISO,startMinute,endMinute,basisPoints,serviceIds,active:true});
const files=['booking_multi_service_v2.sql','booking_negotiation_v1.sql','booking_verification_v1.sql','booking_timeline_v1.sql','booking_phase_wait_v1.sql',
 'booking_gap_policy_v1.sql','booking_calendar_exceptions_v1.sql','catalog_associations_v1.sql','catalog_voluntary_v1.sql','booking_discounts_v1.sql'];

test('dated discounts exercise the actual catalogue, scheduling, stored receipts and owner permissions in isolated PostgreSQL',async()=>{
 const db=new PGlite({extensions:{btree_gist,pgcrypto}});
 try {
  await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
  for(const filename of (await readdir('supabase/migrations')).filter(name=>name.endsWith('.sql')).sort()) {
   try { await db.exec(await readFile('supabase/migrations/'+filename,'utf8')); } catch(error) { throw Error(filename+": "+error.message); }
  }
  for(const filename of files) {
   try { await db.exec(await readFile('supabase/drafts/'+filename,'utf8')); } catch(error) { throw Error(filename+": "+error.message); }
  }
  await db.query('insert into auth.users(id) values($1),($2),($3)',[owner,customer,outsider]);
  await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,timezone) values($1,$2,'Company',true,true,'Europe/Madrid'),($3,$4,'Other',true,true,'UTC')",[company,owner,other,outsider]);
  await db.query("update public.businesses set ui_metadata=jsonb_build_object('category','Belleza/Peluquería') where id=$1",[company]);
  await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,'Cut',20,20,'EUR'),($3,$2,'Wash',10,10,'EUR'),($4,$2,'Style',30,30,'EUR'),($5,$6,'Foreign',10,10,'EUR')",[cut,company,wash,style,foreign,other]);
  await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,day,'08:00','23:00','Europe/Madrid' from generate_series(0,6) day",[company]);
  const as=async(actor,fn)=>{
   await db.exec('begin;set local role authenticated');
   try {await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);const value=await fn();await db.exec('commit');return value;}
   catch(error){await db.exec('rollback');throw error;}
  };
  const single=async(sql,args)=> (await db.query(sql,args)).rows[0].result;
  const manage=(actor,action,input={})=>as(actor,()=>single('select public.go_booking_discounts($1,$2,$3) result',[company,action,JSON.stringify(input)]));
  const quote=(time,services=[cut,wash,style],selected=[])=>as(customer,()=>single('select public.go_booking_discount_quote($1,$2::uuid[],$3::uuid[],$4) result',[company,services,selected,time]));
  const book=(time,expected,key)=>as(customer,()=>single("select public.go_create_catalog_booking(p_business_id=>$1,p_root_ids=>$2::uuid[],p_selected_ids=>$3::uuid[],p_starts_at=>$4::timestamptz,p_staff_id=>null::uuid,p_request_key=>$5,p_expected_quote=>$6::jsonb) result",[company,expected.rootIds,expected.selectedAssociationIds,time,key,JSON.stringify(expected)]));
  await assert.rejects(()=>manage(outsider,'list'),/CATALOG_FORBIDDEN/);
  await assert.rejects(()=>as(outsider,()=>single('select public.go_booking_discounts($1,$2,$3) result',
   [other,'create',JSON.stringify(slot(day,540,780,1000))])),/BOOKING_DISCOUNT_ACTIVITY_FORBIDDEN/);
  await assert.rejects(()=>manage(owner,'create',slot(day,540,780,10001)),/BOOKING_DISCOUNT_INVALID/);
  await assert.rejects(()=>manage(owner,'create',slot(day,540,780,1000,[foreign])),/BOOKING_DISCOUNT_INVALID_SERVICES/);
  const morning=await manage(owner,'create',slot(day,540,780,1000));
  assert.deepEqual(await manage(owner,'create',slot(day,540,780,1000)),morning);
  await assert.rejects(()=>manage(owner,'create',slot(day,550,600,500,[cut])),/BOOKING_DISCOUNT_OVERLAP/);
  await manage(owner,'create',slot(second,960,1140,2000,[style]));
  await manage(owner,'create',slot(third,600,720,500,[cut]));
  await manage(owner,'create',slot(day,780,900,0));
  const before=await quote(at('08:59')), after=await quote(at('13:00')), offer=await quote(at('09:00'));
  assert.equal(before.totalPrice,60);assert.equal(after.totalPrice,60);
  assert.equal(offer.originalTotal,60);assert.equal(offer.discountTotal,6);assert.equal(offer.totalPrice,54);
  assert.equal((await quote(at('16:00',second))).totalPrice,54);
  assert.equal((await quote(at('10:00',third))).totalPrice,59);
  assert.equal((await quote(at('09:00'),[style])).lines[0].discountBasisPoints,1000);
  const batch=await as(customer,()=>single('select public.go_booking_discount_prices($1,$2::uuid[],$3::uuid[],$4::timestamptz[]) result',
   [company,[cut,wash,style],[],[at('09:00'),at('13:00')]]));
  assert.equal(batch[new Date(at('09:00')).toISOString()].totalPrice,54);
  assert.equal(batch[new Date(at('13:00')).toISOString()].discountTotal,0);
  const booked=await book(at('09:00'),offer,'discount-test-original');
  assert.equal(booked.total_price,54);assert.equal(booked.catalog_snapshot.originalTotal,60);
  await assert.rejects(()=>book(at('10:00'),before,'discount-test-forged'),/CATALOG_QUOTE_STALE/);
  await assert.rejects(()=>as(customer,()=>single("select public.go_negotiate_booking($1,'propose',$2,0,null,$3,'13:00',$4,true) result",
   [booked.id,'00000000-0000-4000-8000-000000000099',day,at('13:00')])),/BOOKING_DISCOUNT_RESCHEDULE_REVIEW_REQUIRED/);
  await as(owner,()=>single("select public.go_catalog_associations($1,'create',$2) result",[company,JSON.stringify({sourceId:cut,targetId:wash,mode:'included'})]));
  const included=await quote(at('10:00'),[cut,style]);
  assert.equal(included.originalTotal,50);assert.equal(included.totalPrice,45);
  assert.equal(included.lines.find(line=>line.itemId===wash).charge,0);
  const optional=await as(owner,()=>single("select public.go_catalog_associations($1,'create',$2) result",[company,JSON.stringify({sourceId:cut,targetId:style,mode:'optional'})]));
  const supplement=await quote(at('11:00'),[cut],[optional.id]);
  assert.equal(supplement.totalPrice,45);
  assert.equal((await quote(at('11:00'),[cut])).totalPrice,18);
  const stale=await quote(at('11:00'),[cut]);
  await manage(owner,'update',{...slot(day,540,780,1500),id:morning.id,revision:1});
  await assert.rejects(()=>book(at('11:00'),stale,'discount-test-stale'),/CATALOG_QUOTE_STALE/);
  await assert.rejects(()=>manage(owner,'delete',{id:morning.id,revision:1}),/BOOKING_DISCOUNT_STALE/);
  await manage(owner,'delete',{id:morning.id,revision:2});
  assert.equal((await quote(at('11:00'),[cut])).totalPrice,20);
  const restored=(await db.query('select total_price,catalog_snapshot from public.bookings where id=$1',[booked.id])).rows[0];
  assert.equal(Number(restored.total_price),54);assert.equal(restored.catalog_snapshot.discountTotal,6);
  assert.equal((await book(at('09:00'),offer,'discount-test-original')).id,booked.id);
  assert.equal((await manage(owner,'list')).promotions.length,3);
  await db.query('update public.services set price=1.05 where id=$1',[style]);
  await manage(owner,'create',slot(third,600,720,1000,[style]));
  const cents=await quote(at('10:00',third),[style]);
  assert.equal(cents.discountTotal,0.11);assert.equal(cents.totalPrice,0.94);
  await db.query('update public.services set price=30 where id=$1',[style]);
  await db.query("insert into public.booking_calendar_exceptions(business_id,local_date,timezone,intervals,created_by,updated_by) values($1,$2,'Europe/Madrid',$4::jsonb,$3,$3)",[company,second,owner,JSON.stringify([{kind:'closed',startMinute:0,endMinute:1440}])]);
  const closed=await quote(at('16:00',second),[style]);
  await assert.rejects(()=>book(at('16:00',second),closed,'discount-test-closed'),/BOOKING_CONFLICT|BOOKING_OUTSIDE_AVAILABILITY|BOOKING_STAFF_UNAVAILABLE/);
  const permissions=await db.query("select has_table_privilege('authenticated','go_booking_discounts_private.promotions','select') as raw,has_function_privilege('anon','public.go_booking_discounts(uuid,text,jsonb)','execute') as anon");
  assert.deepEqual(permissions.rows,[{raw:false,anon:false}]);
 } finally { await db.close(); }
});
