import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';

const admin='00000000-0000-4000-8000-000000000001';
const ownerA='00000000-0000-4000-8000-000000000002';
const ownerB='00000000-0000-4000-8000-000000000003';
const customerA='00000000-0000-4000-8000-000000000004';
const customerB='00000000-0000-4000-8000-000000000005';
const customerC='00000000-0000-4000-8000-000000000006';
const oldCustomer='00000000-0000-4000-8000-000000000007';
const businessA='00000000-0000-4000-8000-000000000010';
const businessB='00000000-0000-4000-8000-000000000020';
const call=(db,name,params=[])=>db.query(`select public.${name}(${params.map((_,i)=>`$${i+1}`).join(',')}) result`,params).then(r=>r.rows[0].result);

test('physical QR ownership, immutable acquisition and booking eligibility contract',async()=>{
  const db=new PGlite({extensions:{pgcrypto}});
  try{
    await db.exec(`create role anon;create role authenticated;create schema auth;
      create table auth.users(id uuid primary key,created_at timestamptz not null default now());
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      create table public.businesses(id uuid primary key,owner_id uuid not null references auth.users(id),name text not null,
        verified boolean not null default false,booking_enabled boolean not null default false,ui_metadata jsonb not null default '{}');
      create table public.admin_memberships(user_id uuid primary key references auth.users(id),level text,permissions text[],active boolean);
      create table public.bookings(id uuid primary key default gen_random_uuid(),customer_id uuid not null references auth.users(id),
        business_id uuid not null references public.businesses(id),status text not null default 'PENDING');
      grant usage on schema public,auth to anon,authenticated;
      grant select,insert,update on public.bookings to authenticated;
      grant select on public.businesses to anon,authenticated;`);
    await db.exec(await readFile('supabase/migrations/20261126151423_go_commercial_qr_v1.sql','utf8'));
    for(const user of [admin,ownerA,ownerB,oldCustomer]) await db.query('insert into auth.users(id,created_at) values($1,now()-interval \'7 days\')',[user]);
    await db.query("insert into public.admin_memberships values($1,'owner','{}',true)",[admin]);
    await db.query("insert into public.businesses(id,owner_id,name,verified,booking_enabled,ui_metadata) values($1,$2,'A',true,true,'{\"category\":\"peluqueria\"}'),($3,$4,'B',true,true,'{\"category\":\"restaurante\"}')",[businessA,ownerA,businessB,ownerB]);
    const as=async(user,fn)=>{await db.exec('begin;set local role authenticated');try{
      await db.query("select set_config('request.jwt.claim.sub',$1,true)",[user]);const result=await fn();await db.exec('commit');return result;
    }catch(error){await db.exec('rollback');throw error;}};
    const requestId='00000000-0000-4000-8000-000000000099';
    const batch=await as(admin,()=>call(db,'go_commercial_create_batch',[20,requestId]));
    assert.equal((await as(admin,()=>call(db,'go_commercial_create_batch',[20,requestId]))).batchId,batch.batchId);
    await assert.rejects(()=>as(admin,()=>call(db,'go_commercial_create_batch',[100,requestId])),/GO_QR_REQUEST_CHANGED/);
    assert.match((await as(ownerA,()=>call(db,'go_commercial_supplier'))).url,/abarnom\.com/);
    await assert.rejects(()=>as(ownerA,()=>call(db,'go_commercial_set_supplier',['https://example.com/a',true])),/GO_QR_ADMIN_REQUIRED/);
    await as(admin,()=>call(db,'go_commercial_set_supplier',['https://example.com/a',false]));
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_supplier'))).url,null);
    assert.equal((await as(admin,()=>call(db,'go_commercial_admin_supplier'))).url,'https://example.com/a');
    await as(admin,()=>call(db,'go_commercial_set_supplier',['https://www.abarnom.com/portacartel-de-sobremesa-metacrilato-doble-posicion-a6-verticalhorizontal',true]));
    assert.equal(batch.codes.length,20);
    assert.equal(new Set(batch.codes.map(x=>x.code)).size,20);
    assert.deepEqual((await as(admin,()=>call(db,'go_commercial_get_batch',[batch.batchId]))).codes.map(x=>x.code),batch.codes.map(x=>x.code));
    await assert.rejects(()=>as(ownerA,()=>call(db,'go_commercial_get_batch',[batch.batchId])),/GO_QR_ADMIN_REQUIRED/);
    const code=batch.codes[0].code;
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_resolve',[code]))).state,'unassigned');
    await as(admin,()=>call(db,'go_commercial_authorize',[code,businessA,'First venue']));
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_preview_assignment',[code,businessA]))).canAssign,true);
    await assert.rejects(()=>as(ownerB,()=>call(db,'go_commercial_preview_assignment',[code,businessA])),/GO_QR_OWNER_REQUIRED/);
    await assert.rejects(()=>as(ownerB,()=>call(db,'go_commercial_assign',[code,businessB])),/GO_QR_NOT_AUTHORIZED|GO_QR_OWNER_REQUIRED/);
    await as(ownerA,()=>call(db,'go_commercial_assign',[batch.codes[0].inventoryId,businessA]));
    await as(ownerA,()=>call(db,'go_commercial_assign',[code,businessA]));
    await assert.rejects(()=>as(admin,()=>call(db,'go_commercial_authorize',[code,businessB,'No silent reassignment'])),/GO_QR_ALREADY_RESERVED/);
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_resolve',[code]))).businessId,businessA);
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_resolve',[businessA]))).businessId,businessA);
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_owned_poster',[businessA]))).published,true);
    await assert.rejects(()=>as(ownerB,()=>call(db,'go_commercial_owned_poster',[businessA])),/GO_QR_OWNER_REQUIRED/);
    const visit=await as(ownerA,()=>call(db,'go_commercial_issue_visit',[code]));
    await db.query('insert into auth.users(id) values($1)',[customerA]);
    assert.equal((await as(customerA,()=>call(db,'go_commercial_claim_acquisition',[visit.token]))).businessId,businessA);
    const later=await as(customerA,()=>call(db,'go_commercial_issue_visit',[businessB]));
    assert.equal((await as(customerA,()=>call(db,'go_commercial_claim_acquisition',[later.token]))).businessId,businessA);
    const direct=await as(ownerA,()=>call(db,'go_commercial_issue_visit',['direct']));
    await db.query('insert into auth.users(id) values($1)',[customerB]);
    await as(customerB,()=>call(db,'go_commercial_claim_acquisition',[direct.token]));
    const general=await as(ownerA,()=>call(db,'go_commercial_issue_visit',['go']));
    await db.query('insert into auth.users(id) values($1)',[customerC]);
    await as(customerC,()=>call(db,'go_commercial_claim_acquisition',[general.token]));
    await assert.rejects(()=>as(oldCustomer,()=>call(db,'go_commercial_claim_acquisition',[later.token])),/GO_QR_EXISTING_ACCOUNT/);
    const add=async(customer,business)=>{const id=(await db.query('insert into public.bookings(customer_id,business_id) values($1,$2) returning id',[customer,business])).rows[0].id;
      return (await db.query('select * from go_commercial_private.booking_attribution where booking_id=$1',[id])).rows[0];};
    assert.deepEqual([ (await add(customerA,businessA)).eligible,(await add(customerA,businessB)).eligible,
      (await add(customerB,businessA)).eligible,(await add(customerC,businessB)).eligible,
      (await add(oldCustomer,businessA)).eligible ],[false,true,true,true,null]);
    const tracked=(await db.query('select booking_id from go_commercial_private.booking_attribution where customer_id=$1 and beneficiary_business_id=$2 limit 1',[customerA,businessA])).rows[0].booking_id;
    await db.query("update public.bookings set status='CANCELLED' where id=$1",[tracked]);
    assert.equal((await db.query('select booking_status from go_commercial_private.booking_attribution where booking_id=$1',[tracked])).rows[0].booking_status,'CANCELLED');
    await as(admin,()=>call(db,'go_commercial_revoke',[code,'Replace venue']));
    assert.equal((await as(ownerA,()=>call(db,'go_commercial_resolve',[code]))).state,'revoked');
    await as(admin,()=>call(db,'go_commercial_authorize',[code,businessB,'New venue']));
    await as(ownerB,()=>call(db,'go_commercial_assign',[code,businessB]));
    assert.equal((await as(ownerB,()=>call(db,'go_commercial_resolve',[code]))).businessId,businessB);
    assert.equal((await db.query('select capturing_business_id from go_commercial_private.acquisitions where user_id=$1',[customerA])).rows[0].capturing_business_id,businessA);
    for(let issued=0;issued<99;issued++) await as(ownerB,()=>call(db,'go_commercial_issue_visit',[businessB]));
    await assert.rejects(()=>as(ownerB,()=>call(db,'go_commercial_issue_visit',[businessB])),/GO_QR_VISIT_LIMIT/);
  }finally{await db.close();}
});
