import {test} from 'node:test';
import assert from 'node:assert/strict';
import {respond,createGateway} from './gateway.mjs';
const path='/api/supabase/auth/login';
const credentials={email:'fictitious@example.invalid',password:'fictitious-password'};
const session={access_token:'fictitious-access',refresh_token:'fictitious-refresh',user:{id:'11111111-1111-4111-8111-111111111111'}};
function fixture(payload=session,status=200){const calls=[];return {calls,request:async(url,init)=>{calls.push({url,init});return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});}};}
test('only login is forwarded; credentials unchanged and no caller headers relayed',async()=>{
 const f=fixture();const result=await respond({method:'POST',url:path,body:credentials,authorization:'Bearer do-not-forward'},f.request);
 assert.equal(result.status,200);assert.deepEqual(result.body.user,session.user);assert.equal(f.calls.length,1);
 assert.equal(f.calls[0].url,'http://127.0.0.1:3000'+path);assert.equal(f.calls[0].init.method,'POST');
 assert.deepEqual(JSON.parse(f.calls[0].init.body),credentials);assert.equal(f.calls[0].init.headers.Authorization,undefined);assert.equal(f.calls[0].init.redirect,'error');
});
for(const route of ['/api/supabase/auth/register','/api/supabase/auth/refresh','/api/supabase/auth/recover','/api/supabase/bookings','/api/supabase/admin/memberships','/api/supabase/manage/enrollment',path+'?x=1'])test('POST stays blocked: '+route,async()=>{
 const f=fixture();assert.equal((await respond({method:'POST',url:route,body:credentials},f.request)).status,405);assert.equal(f.calls.length,0);
});
test('malformed credentials and extra fields never reach backend',async()=>{
 for(const body of [undefined,{},[],{...credentials,role:'admin'},{...credentials,email:'invalid'},{...credentials,password:4},{...credentials,password:'a'.repeat(1025)}]){
  const f=fixture();assert.equal((await respond({method:'POST',url:path,body},f.request)).status,400);assert.equal(f.calls.length,0);
 }
});
test('failed upstream login does not return credentials or internal details',async()=>{
 const result=await respond({method:'POST',url:path,body:credentials},fixture({error:'private-detail'},401).request);
 assert.equal(result.status,401);assert.ok(!JSON.stringify(result).includes('private-detail'));
});
test('invalid successful response is not accepted as a session',async()=>{
 assert.equal((await respond({method:'POST',url:path,body:credentials},fixture({status:'ok'}).request)).status,502);
});
async function httpFixture(run){const f=fixture();const server=createGateway(f.request);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));try{await run('http://127.0.0.1:'+server.address().port,f);}finally{await new Promise(resolve=>server.close(resolve));}}
test('actual HTTP login forwards JSON and disables caching',()=>httpFixture(async(base,f)=>{
 const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.equal((await r.json()).access_token,session.access_token);assert.equal(f.calls.length,1);
}));
test('HTTP login rejects oversized body before upstream',()=>httpFixture(async(base,f)=>{
 const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:'x'.repeat(4097)});
 assert.equal(r.status,413);assert.equal(f.calls.length,0);
}));
test('HTTP login rejects non-JSON body before upstream',()=>httpFixture(async(base,f)=>{
 assert.equal((await fetch(base+path,{method:'POST',headers:{'Content-Type':'text/plain'},body:'{}'})).status,415);assert.equal(f.calls.length,0);
}));
test('only five login attempts per minute per device',()=>httpFixture(async(base,f)=>{
 for(let i=0;i<6;i++){
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)});
  assert.equal(r.status,i<5?200:429);await r.text();
 }
 assert.equal(f.calls.length,5);
}));
