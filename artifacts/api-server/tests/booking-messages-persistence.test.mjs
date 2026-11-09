import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {PGlite} from '@electric-sql/pglite';
import {mkdtemp,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {ids,schema} from './helpers/booking-messages-fixture.mjs';

test('real Express and persisted isolated PostgreSQL: customer/company round trip, permissions, retries and restart',async()=>{
 // Auth/REST HTTP transport below is synthetic. No hosted identities or production connection are used.
 const dir=await mkdtemp(path.join(tmpdir(),'go-messages-persistence-'));
 let db=new PGlite(path.join(dir,'database'));await db.exec(schema);
 await db.exec(await readFile('supabase/drafts/booking_messages_v1.sql','utf8'));
 await build({entryPoints:['src/routes/bookingNegotiation.ts'],outfile:path.join(dir,'router.mjs'),bundle:true,platform:'node',format:'esm',
  banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
 const {default:router}=await import(pathToFileURL(path.join(dir,'router.mjs')));
 const {default:express}=await import('express');const app=express();app.use(express.json());app.use('/api/supabase',router);
 const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
 const base='http://127.0.0.1:'+server.address().port+'/api/supabase',original=globalThis.fetch;
 const oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
 process.env.SUPABASE_URL='https://go-messages-isolated.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='synthetic-public';
 let queue=Promise.resolve();
 const as=(actor,fn)=>{const run=queue.then(async()=>{await db.exec('begin;set local role authenticated;');
  try{await db.query("select set_config('request.jwt.claim.sub',$1,true)",[actor]);const result=await fn();await db.exec('commit');return result;}
  catch(error){await db.exec('rollback');throw error;}});queue=run.catch(()=>{});return run;};
 globalThis.fetch=async(url,init={})=>{
  if(!String(url).startsWith('https://go-messages-isolated.invalid'))return original(url,init);
  const target=new URL(url),actor=ids[String(init.headers?.Authorization).replace('Bearer ','')];
  if(!actor)return Response.json({error:'expired'},{status:401});
  if(target.pathname==='/auth/v1/user')return Response.json({id:actor});
  try{
   if(target.pathname.startsWith('/rest/v1/rpc/')){
    const fn=target.pathname.split('/').at(-1),params=JSON.parse(init.body);
    assert.ok(['go_booking_conversations','go_send_booking_message'].includes(fn));
    const names=Object.keys(params);for(const name of names)assert.match(name,/^p_[a-z_]+$/);
    const result=await as(actor,async()=>(await db.query('select public.'+fn+'('+names.map((name,i)=>name+'=>$'+(i+1)).join(',')+') result',Object.values(params))).rows[0].result);
    return Response.json(result);
   }
   if(target.pathname==='/rest/v1/businesses'){
    const business=target.searchParams.get('id').slice(3),owner=target.searchParams.get('owner_id').slice(3);
    return Response.json((await as(actor,()=>db.query('select id from public.businesses where id=$1 and owner_id=$2 and verified',[business,owner]))).rows);
   }
   if(target.pathname==='/rest/v1/bookings'){
    const bookings=target.searchParams.get('id').slice(4,-1).split(','),customer=target.searchParams.get('customer_id').slice(3);
    return Response.json((await as(actor,()=>db.query('select id from public.bookings where id=any($1::uuid[]) and customer_id=$2',[bookings,customer]))).rows);
   }
   throw Error('Unexpected data path');
  }catch(error){return Response.json({code:error.code,message:'isolated failure'},{status:error.code==='42501'?403:error.code==='PT409'?409:400});}
 };
 const call=(who,route,method='GET',body)=>original(base+route,{method,headers:{Authorization:'Bearer '+who,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
 const ok=async response=>{assert.equal(response.status,200,await response.clone().text());return response.json();};
 const message=n=>'99999999-9999-4999-8999-'+String(n).padStart(12,'0');
 const send=(who,n,text,booking=ids.booking)=>call(who,'/bookings/'+booking+'/messages','POST',{messageId:message(n),text});
 try{
  const before=(await db.query('select to_jsonb(b) data from public.bookings b order by id')).rows;
  assert.equal((await call('expired','/booking-conversations')).status,401);
  assert.deepEqual((await ok(await call('customer','/booking-conversations?booking_id='+ids.booking)))[0].messages,[]);
  const a=await ok(await send('customer',1,'Synthetic message A'));assert.equal(a.messages[0].senderId,'yo');
  assert.equal((await db.query('select count(*)::int n from go_reservation_negotiation.messages')).rows[0].n,1);
  const inbox=await ok(await call('owner','/booking-conversations?scope=business&business_id='+ids.business));
  assert.equal(inbox.length,1);assert.equal(inbox[0].messages[0].text,'Synthetic message A');
  assert.deepEqual(await ok(await call('owner','/booking-conversations?scope=personal')),[]);
  await ok(await send('owner',1,'Synthetic message B'));
  const fresh=await ok(await call('customer','/booking-conversations?scope=personal'));
  assert.deepEqual(fresh[0].messages.map(m=>m.text),['Synthetic message A','Synthetic message B']);
  for(const who of ['third','employee']){
   assert.equal((await call(who,'/booking-conversations?booking_id='+ids.booking)).status,403);
   assert.equal((await send(who,3,'Forbidden')).status,403);
   assert.deepEqual(await ok(await call(who,'/booking-conversations?scope=business&business_id='+ids.business)),[]);
  }
  const retries=await Promise.all([send('customer',1,'Synthetic message A'),send('customer',1,'Synthetic message A')]);for(const response of retries)await ok(response);
  assert.equal((await db.query('select count(*)::int n from go_reservation_negotiation.messages')).rows[0].n,2);
  assert.equal((await send('customer',1,'Changed retry')).status,409);
  assert.equal((await call('owner','/booking-conversations?booking_id='+ids.otherBooking)).status,403);
  await ok(await send('third',4,'Other company starts the conversation',ids.otherBooking));
  assert.equal((await ok(await call('customer','/booking-conversations?scope=personal'))).length,2);
  assert.equal((await ok(await call('owner','/booking-conversations?scope=business&business_id='+ids.business))).length,1);
  assert.deepEqual((await db.query('select to_jsonb(b) data from public.bookings b order by id')).rows,before);
  await db.query('update public.businesses set booking_enabled=false where id=$1',[ids.business]);
  assert.equal((await ok(await call('owner','/booking-conversations?scope=business&business_id='+ids.business))).length,1,'Unpublishing a catalogue cannot hide an authorized existing conversation');
  await queue;await db.close();db=new PGlite(path.join(dir,'database'));
  const restored=await ok(await call('customer','/booking-conversations?booking_id='+ids.booking));
  assert.deepEqual(restored[0].messages.map(m=>m.text),['Synthetic message A','Synthetic message B']);
  // Explicit policy: authenticated original participants can discuss a cancelled/completed booking; chat changes no contractual fields.
  for(const status of ['CANCELLED','COMPLETED','NO_SHOW']){
   await db.query('update public.bookings set status=$1 where id=$2',[status,ids.booking]);
   await ok(await send('owner',status==='CANCELLED'?5:status==='COMPLETED'?6:7,'Follow-up after '+status));
   assert.equal((await db.query('select status from public.bookings where id=$1',[ids.booking])).rows[0].status,status);
  }
  await assert.rejects(as(ids.customer,()=>db.query('select * from go_reservation_negotiation.messages')),error=>error.code==='42501');
  if(process.env.GO_MESSAGES_ACTIVATION_DIR){
   const activation=process.env.GO_MESSAGES_ACTIVATION_DIR;
   await db.exec(await readFile(path.join(activation,'preflight.sql'),'utf8'));
   const count=(await db.query('select count(*)::int n from go_reservation_negotiation.messages')).rows[0].n;
   await db.exec(await readFile(path.join(activation,'disable_messages.sql'),'utf8'));
   assert.equal((await call('customer','/booking-conversations?booking_id='+ids.booking)).status,403);
   assert.equal((await db.query('select count(*)::int n from go_reservation_negotiation.messages')).rows[0].n,count);
  }
 }finally{
  globalThis.fetch=original;process.env.SUPABASE_URL=oldUrl;process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;
  await new Promise(done=>server.close(done));await queue;await db.close();
 }
});
