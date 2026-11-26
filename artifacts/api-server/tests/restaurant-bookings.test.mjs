import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { randomUUID } from 'node:crypto';
import { btree_gist } from '@electric-sql/pglite/contrib/btree_gist';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const owner = '00000000-0000-4000-8000-000000000001';
const customerA = '00000000-0000-4000-8000-000000000002';
const customerB = '00000000-0000-4000-8000-000000000003';
const customerC = '00000000-0000-4000-8000-000000000004';
const otherOwner = '00000000-0000-4000-8000-000000000005';
const business = '00000000-0000-4000-8000-000000000010';
const otherBusiness = '00000000-0000-4000-8000-000000000020';
const service = '00000000-0000-4000-8000-000000000011';
const at = time => `2090-01-10T${time}:00Z`;
const drafts = ['booking_multi_service_v2.sql','booking_negotiation_v1.sql','booking_verification_v1.sql',
  'booking_timeline_v1.sql','booking_phase_wait_v1.sql','booking_gap_policy_v1.sql',
  'booking_calendar_exceptions_v1.sql','catalog_associations_v1.sql','catalog_voluntary_v1.sql',
  'booking_discounts_v1.sql'];

test('restaurant tables and party sizes use hosted PostgreSQL capacity and owner scope', async () => {
  const db = new PGlite({ extensions: { btree_gist, pgcrypto } });
  try {
    await db.exec("create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;");
    // Core booking migrations only; unrelated Storage migrations need Supabase's
    // storage schema, which is deliberately absent from this isolated fixture.
    for (const file of (await readdir('supabase/migrations')).filter(name => name.endsWith('.sql') && name < '202611').sort()) {
      try { await db.exec(await readFile(`supabase/migrations/${file}`, 'utf8')); } catch (error) { throw Error(`${file}: ${error.message}`); }
    }
    for (const file of drafts) {
      try { await db.exec(await readFile(`supabase/drafts/${file}`, 'utf8')); } catch (error) { throw Error(`${file}: ${error.message}`); }
    }
    await db.exec(await readFile('supabase/migrations/20261126105540_go_restaurant_bookings_v1.sql','utf8'));
    for (const uid of [owner,customerA,customerB,customerC,otherOwner]) await db.query('insert into auth.users(id,email) values($1,$2)',[uid,`${uid}@example.invalid`]);
    await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,timezone,ui_metadata) values($1,$2,'Restaurant',true,true,'UTC',$3::jsonb),($4,$5,'Other',true,true,'UTC',$3::jsonb)",
      [business,owner,JSON.stringify({category:'restaurante'}),otherBusiness,otherOwner]);
    await db.query("insert into public.services(id,business_id,name,duration_minutes,price,currency) values($1,$2,'Lunch',30,20,'EUR')",[service,business]);
    await db.query("insert into public.availability(business_id,weekday,start_time,end_time,timezone) select $1,day,'08:00','23:00','UTC' from generate_series(0,6) day",[business]);
    const plan = {id:'floor',businessId:business,occupancyLimit:8,elements:[
      {id:'table-a',type:'mesa',capacity:4,status:'disponible',reservable:true},
      {id:'table-b',type:'mesa',capacity:4,status:'disponible',reservable:true}]};
    const as = async (uid, fn) => { await db.exec('begin;set local role authenticated'); try {
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[uid]);
      const value = await fn(); await db.exec('commit'); return value;
    } catch (error) { await db.exec('rollback'); throw error; } };
    await as(owner,()=>db.query('insert into public.business_settings(business_id,payload) values($1,$2::jsonb)',[business,JSON.stringify({floorPlan:plan})]));
    const create = (uid,key,party=4,time='10:00') => as(uid,async()=> (await db.query(
      'select public.go_create_restaurant_timeline_booking(p_business_id=>$1,p_service_ids=>$2::uuid[],p_starts_at=>$3::timestamptz,p_staff_id=>null::uuid,p_request_key=>$4,p_party_size=>$5) result',
      [business,[service],at(time),key,party])).rows[0].result);
    await assert.rejects(()=>as(customerA,()=>db.query(
      'select public.go_create_timeline_booking(p_business_id=>$1,p_service_ids=>$2::uuid[],p_starts_at=>$3::timestamptz,p_staff_id=>null::uuid,p_request_key=>$4)',
      [business,[service],at('10:00'),'generic'])),/RESTAURANT_PARTY_REQUIRED/);
    const first = await create(customerA,'first');
    assert.equal(first.party_size,4); assert.equal(first.restaurant_table_id,'table-a');
    const availability = await as(customerB,async()=> (await db.query(
      'select public.go_restaurant_availability(p_business_id=>$1,p_service_ids=>$2::uuid[],p_from=>$3::timestamptz,p_to=>$4::timestamptz,p_party_size=>4) result',
      [business,[service],at('10:00'),at('10:01')])).rows[0].result);
    assert.ok(availability.slots.some(slot => Date.parse(slot.startsAt) === Date.parse(at('10:00'))),JSON.stringify(availability));
    const oversized = await as(customerB,async()=> (await db.query(
      'select public.go_restaurant_availability(p_business_id=>$1,p_service_ids=>$2::uuid[],p_from=>$3::timestamptz,p_to=>$4::timestamptz,p_party_size=>5) result',
      [business,[service],at('10:00'),at('10:01')])).rows[0].result);
    assert.equal(oversized.slots.length,0);
    const second = await create(customerB,'second');
    assert.equal(second.party_size,4); assert.equal(second.restaurant_table_id,'table-b');
    assert.equal((await create(customerA,'first')).id,first.id);
    await assert.rejects(()=>create(customerA,'first',2),/BOOKING_REQUEST_REUSED/);
    await assert.rejects(()=>create(customerC,'third'),/RESTAURANT_CAPACITY_UNAVAILABLE/);
    await assert.rejects(()=>as(owner,()=>db.query('update public.business_settings set payload=$1::jsonb where business_id=$2',
      [JSON.stringify({floorPlan:{...plan,elements:plan.elements.slice(1)}}),business])),/RESTAURANT_TABLE_IN_USE/);
    await assert.rejects(()=>as(owner,()=>db.query('update public.business_settings set payload=$1::jsonb where business_id=$2',
      [JSON.stringify({floorPlan:{...plan,occupancyLimit:7}}),business])),/RESTAURANT_AFORO_IN_USE/);
    const proposal = await as(customerA,async()=> (await db.query(
      "select public.go_negotiate_booking(p_booking_id=>$1,p_operation=>'propose',p_request_id=>$2,p_expected_revision=>0,p_date_iso=>'2090-01-10',p_time=>'11:00',p_financial_consent=>true) result",
      [first.id,randomUUID()])).rows[0].result);
    const moved = await as(owner,async()=> (await db.query(
      "select public.go_negotiate_booking(p_booking_id=>$1,p_operation=>'accept',p_request_id=>$2,p_expected_revision=>1,p_proposal_id=>$3,p_financial_consent=>true) result",
      [first.id,randomUUID(),proposal.change_proposal.id])).rows[0].result);
    assert.equal(moved.party_size,4); assert.equal(moved.restaurant_table_id,'table-a');
    assert.equal(Date.parse(moved.starts_at),Date.parse(at('11:00')));
    const third = await create(customerC,'third'); assert.equal(third.restaurant_table_id,'table-a');
    await as(customerB,()=>db.query("update public.bookings set status='CANCELLED' where id=$1",[second.id]));
    const fourth = await create(customerA,'fourth'); assert.equal(fourth.restaurant_table_id,'table-b');
    assert.equal((await as(otherOwner,()=>db.query('select * from public.bookings where business_id=$1',[business]))).rows.length,0);
    assert.equal((await as(otherOwner,()=>db.query('update public.business_settings set payload=$1::jsonb where business_id=$2 returning business_id',
      [JSON.stringify({floorPlan:{...plan,occupancyLimit:1}}),business]))).rows.length,0);
  } finally { await db.close(); }
});
