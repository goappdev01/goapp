import { test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// HTTP router integration with a mocked Supabase boundary. SQL/RLS execution is
// a separate suite, deliberately NOT claimed by these tests.
test('multiple-service HTTP contract, legacy isolation and safe RPC failure', async t => {
  const dir=await mkdtemp(path.join(tmpdir(),'go-multi-booking-'));
  const output=path.join(dir,'router.mjs');
  await build({entryPoints:['src/routes/supabase.ts'],outfile:output,bundle:true,platform:'node',format:'esm',banner:{js:`import {createRequire} from 'node:module';const require=createRequire(import.meta.url);`}});
  const {default:router}=await import(pathToFileURL(output).href),{default:express}=await import('express');
  const app=express();app.use(express.json());app.use(router);
  const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
  const base=`http://127.0.0.1:${server.address().port}`,realFetch=globalThis.fetch;
  const ids=Array.from({length:7},(_,i)=>`${i+1}`.repeat(8)+'-'+`${i+1}`.repeat(4)+'-4'+`${i+1}`.repeat(3)+'-8'+`${i+1}`.repeat(3)+'-'+`${i+1}`.repeat(12));
  const [customer,business,cut,colour,staff,bookingId,foreign]=ids;
  const catalog=[{id:cut,business_id:business,name:'Corte',duration_minutes:30,price:'12.10',currency:'EUR',active:true},
    {id:colour,business_id:business,name:'Tinte',duration_minutes:60,price:'20.20',currency:'EUR',active:true}];
  const payload={business_id:business,service_id:cut,service_ids:[cut,colour],staff_id:staff,customer_id:customer,
    starts_at:'2035-01-01T10:00:00Z',ends_at:'2035-01-01T11:30:00Z',request_key:'hold_123',status:'CONFIRMED'};
  let mode='ok',upstream=[],rows=[];
  const saved={id:bookingId,business_id:business,customer_id:customer,staff_id:staff,service_id:cut,service_ids:[cut,colour],
    starts_at:payload.starts_at,ends_at:payload.ends_at,status:'CONFIRMED',total_price:32.3,total_duration_minutes:90,currency:'EUR',
    service_details:catalog.map(s=>({id:s.id,title:s.name,durationMinutes:s.duration_minutes,price:Number(s.price),currency:s.currency,priceKnown:true}))};
  process.env.SUPABASE_URL='https://test.supabase.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test-public-key';
  globalThis.fetch=async(url,init={})=>{
    if(!String(url).startsWith(process.env.SUPABASE_URL))return realFetch(url,init);
    const route=new URL(url);upstream.push({path:route.pathname,init});
    assert.equal(init.headers.Authorization,'Bearer test-token');
    if(/go_booking_(gap|phase)_policy_version$/.test(route.pathname))return Response.json(1);
    if(route.pathname==='/auth/v1/user')return mode==='revoked'?Response.json({error:'invalid'},{status:401}):Response.json({id:customer});
    if(route.pathname==='/rest/v1/services')return Response.json(mode==='foreign'?[catalog[0],{...catalog[1],business_id:foreign}]:mode==='inactive'?[catalog[0]]:mode==='currency'?[catalog[0],{...catalog[1],currency:'USD'}]:catalog);
    if(route.pathname==='/rest/v1/rpc/go_booking_contract')return mode==='old'?Response.json({code:'PGRST202'},{status:404}):mode==='limited'?Response.json({code:'429'},{status:429}):Response.json({version:2,multiService:true});
    if(route.pathname==='/rest/v1/rpc/go_create_service_booking'){
      const body=JSON.parse(init.body);
      assert.deepEqual(body.p_service_ids,[cut,colour]);assert.equal(body.p_ends_at,payload.ends_at);assert.equal(body.p_request_key,payload.request_key);
      assert.equal('price' in body,false);assert.equal('customer_id' in body,false);
      if(mode==='old')return Response.json({code:'PGRST202'},{status:404});
      if(mode==='overlap')return Response.json({code:'23P01'},{status:409});
      if(mode==='schedule')return Response.json({code:'22023'},{status:400});
      if(mode==='denied')return Response.json({code:'42501'},{status:403});
      if(mode==='limited')return Response.json({code:'429'},{status:429});
      rows=[saved];return Response.json(saved);
    }
    if(route.pathname==='/rest/v1/bookings'&&!init.method)return Response.json(rows);
    throw Error('Unexpected write/fallback '+route.pathname);
  };
  const call=(body=payload,auth=true)=>realFetch(base+'/bookings',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer test-token'}:{})},body:JSON.stringify(body)});
  const rpcCalls=()=>upstream.filter(x=>x.path==='/rest/v1/rpc/go_create_service_booking').length;
  try{
    await t.test('requires authentication and rejects forged ownership before creating',async()=>{
      assert.equal((await call(payload,false)).status,401);assert.equal((await call({...payload,customer_id:foreign})).status,403);assert.equal(rpcCalls(),0);
      mode='revoked';assert.equal((await call()).status,401);assert.equal(rpcCalls(),0);mode='ok';
    });
    await t.test('empty, duplicate, malformed, excessive and mismatched selections cannot write',async()=>{
      for(const patch of [{service_ids:[]},{service_ids:[cut,cut]},{service_ids:[colour,cut]},{service_ids:[cut,'local-demo']},{request_key:''},{request_key:'a'.repeat(129)},{service_ids:Array(33).fill(cut)}]){
        assert.equal((await call({...payload,...patch})).status,400);
      }assert.equal(rpcCalls(),0);
    });
    await t.test('all IDs must be active, same business and same currency',async()=>{
      for(const value of ['foreign','inactive','currency']){mode=value;assert.equal((await call()).status,400);}assert.equal(rpcCalls(),0);mode='ok';
    });
    await t.test('validates aggregate duration instead of primary-service duration',async()=>{
      assert.equal((await call({...payload,ends_at:'2035-01-01T10:30:00Z'})).status,400);assert.equal(rpcCalls(),0);
    });
    await t.test('one atomic RPC carries every ID and stable retry key; canonical snapshots round-trip',async()=>{
      const first=await call({...payload,price:0,services:[{price:0}]});assert.equal(first.status,201);
      const [row]=await first.json();assert.equal(row.total_price,32.3);assert.equal(row.total_duration_minutes,90);assert.equal(row.service_details.length,2);
      const retry=await call();assert.equal((await retry.json())[0].id,row.id);assert.equal(rows.length,1);
      const list=await realFetch(base+'/bookings',{headers:{Authorization:'Bearer test-token'}});assert.deepEqual(await list.json(),rows);
      assert.equal(upstream.some(x=>x.path==='/rest/v1/bookings'&&x.init.method==='POST'),false);
    });
    await t.test('missing migration fails closed without primary-service fallback',async()=>{
      mode='old';const reply=await call();assert.equal(reply.status,503);assert.equal((await reply.json()).code,'MULTI_SERVICE_UNAVAILABLE');
      const cap=await realFetch(base+'/booking-capabilities',{headers:{Authorization:'Bearer test-token'}});assert.equal(cap.status,503);
    });
    await t.test('conflict, invalid availability, RLS denial and rate limiting propagate without retry',async()=>{
      for(const [value,status] of [['overlap',409],['schedule',400],['denied',403],['limited',429]]){mode=value;const count=rpcCalls();assert.equal((await call()).status,status);assert.equal(rpcCalls(),count+1);}
    });
    await t.test('capability is authenticated, versioned and read-only',async()=>{
      mode='ok';assert.equal((await realFetch(base+'/booking-capabilities')).status,401);
      const count=rpcCalls(),reply=await realFetch(base+'/booking-capabilities',{headers:{Authorization:'Bearer test-token'}});
      assert.deepEqual(await reply.json(),{version:2,multiService:true});assert.equal(rpcCalls(),count);
    });
  }finally{globalThis.fetch=realFetch;await new Promise(done=>server.close(done));}
});
