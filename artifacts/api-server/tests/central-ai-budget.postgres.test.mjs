import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';

// An in-memory PostgreSQL engine only. No production URL or real account is used.
test('cumulative AI ledger: fail closed, protected accounting, reconciliation, uncertain charges and immutable confirmations',
 {skip:!process.env.GO_AI_TEST_DEPS},async()=>{
 const require=createRequire(path.join(process.env.GO_AI_TEST_DEPS,'package.json'));
 const {PGlite}=require('@electric-sql/pglite');const db=new PGlite();
 const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
 const R='33333333-3333-4333-8333-333333333333',S='44444444-4444-4444-8444-444444444444',T='55555555-5555-4555-8555-555555555555';
 const P='66666666-6666-4666-8666-666666666666',business='77777777-7777-4777-8777-777777777777',secret='test-only-capability-'.repeat(4);
 try{
  await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to authenticated;
   create table auth.users(id uuid primary key);insert into auth.users values('${A}'),('${B}');
   create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table public.admin_memberships(user_id uuid primary key,active boolean);insert into public.admin_memberships values('${A}',true),('${B}',true);`);
  await db.exec(fs.readFileSync(new URL('../supabase/migrations/20261127120000_go_central_ai_test_budget.sql',import.meta.url),'utf8'));
  const subject=async(id=A)=>{await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);await db.exec('set role authenticated');};
  const rpc=(op,payload={},key=secret)=>db.query('select public.go_ai_test_control($1,$2,$3::jsonb) result',[key,op,JSON.stringify(payload)]).then(r=>r.rows[0].result);
  await subject();await assert.rejects(()=>rpc('status'),/AI_ACCESS_DENIED/);
  await db.exec('reset role');await db.query(`update go_ai_private.test_budget set secret_hash=sha256(convert_to($1,'UTF8')),authorized_users=array[$2::uuid],authorized_businesses=array[$3::uuid],limit_micro_usd=600000`,[secret,A,business]);
  await subject();assert.equal((await rpc('status')).enabled,false);
  await assert.rejects(()=>rpc('reserve',{id:R,maximum:200000}),/AI_TEST_DISABLED/);
  await assert.rejects(()=>db.query('select * from go_ai_private.test_budget'),/permission denied/);
  await assert.rejects(()=>rpc('status',{},'wrong'.repeat(20)),/AI_ACCESS_DENIED/);
  await subject(B);await assert.rejects(()=>rpc('status'),/AI_ACCESS_DENIED/);
  await db.exec('reset role;set role anon');await assert.rejects(()=>rpc('status'),/permission denied/);
  await db.exec('reset role;update go_ai_private.test_budget set enabled=true');await subject();
  await rpc('reserve',{id:R,maximum:200000});
  assert.equal((await rpc('status')).chargedMicroUsd,200000);
  await assert.rejects(()=>rpc('reserve',{id:R,maximum:200000}),/AI_REQUEST_EXISTS/);
  await assert.rejects(()=>rpc('reserve',{id:S,maximum:200000}),/AI_CONCURRENT_REQUEST/);
  await rpc('prepare',{id:P,requestId:R,command:{business_id:business,request_key:'immutable'},summary:{business:'Local test'}});
  assert.equal((await rpc('current')).id,P);
  await rpc('settle',{id:R,cost:1000,input:100,output:100,calls:1,certain:true});
  assert.equal((await rpc('status')).chargedMicroUsd,1000);
  await rpc('settle',{id:R,cost:0,input:0,output:0,calls:1,certain:true});
  assert.equal((await rpc('status')).chargedMicroUsd,1000,'settlement cannot be replayed to refund more');
  await rpc('invalidate');await assert.rejects(()=>rpc('claim',{id:P}),/AI_PROPOSAL_STALE/);
  await rpc('reserve',{id:S,maximum:200000});
  await rpc('prepare',{id:T,requestId:S,command:{business_id:business,request_key:'same-key-on-retry'},summary:{business:'Local test'}});
  await rpc('settle',{id:S,cost:0,input:0,output:0,calls:0,certain:false});
  assert.equal((await rpc('status')).chargedMicroUsd,201000,'uncertain calls keep their maximum charge');
  const claim=await rpc('claim',{id:T});assert.equal(claim.command.request_key,'same-key-on-retry');
  assert.equal((await rpc('claim',{id:T})).command.request_key,'same-key-on-retry');
  await assert.rejects(()=>rpc('invalidate'),/AI_CONCURRENT_REQUEST/);
  await rpc('submitted',{id:T,bookingId:business,bookingStatus:'PENDING'});
  assert.equal((await rpc('claim',{id:T})).bookingStatus,'PENDING');
  await subject(B);await assert.rejects(()=>rpc('claim',{id:T}),/AI_ACCESS_DENIED/);
  await db.exec("reset role;update go_ai_private.requests set created_at=now()-interval '3 months';update go_ai_private.test_budget set limit_micro_usd=300000");await subject();
  assert.equal((await rpc('status')).chargedMicroUsd,201000,'old usage is cumulative, without monthly reset');
  await assert.rejects(()=>rpc('reserve',{id:business,maximum:200000}),/AI_BUDGET_EXHAUSTED/);
  assert.equal((await rpc('status')).chargedMicroUsd,201000);
 }finally{await db.close();}
});
