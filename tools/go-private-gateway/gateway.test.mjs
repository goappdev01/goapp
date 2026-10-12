import {test} from 'node:test';
import assert from 'node:assert/strict';
import {respond,createGateway} from './gateway.mjs';
const owner={allowed:true,role:'admin',level:'owner',userId:'11111111-1111-4111-8111-111111111111',permissions:['admin.access']};
function fixture(access=owner,status=200){
 const calls=[];
 return {calls,request:async(url,init)=>{
   calls.push({url,init});
   return new Response(JSON.stringify(url.endsWith('/admin/access') ? access : {status:'ok'}),{status,headers:{'content-type':'application/json'}});
 }};
}
const req={method:'GET',url:'/api/supabase/admin/access',authorization:'Bearer test-session'};
for(const method of ['POST','PUT','PATCH','DELETE','OPTIONS','HEAD'])test(method+' is blocked before upstream',async()=>{
 const f=fixture();assert.equal((await respond({...req,method},f.request)).status,405);assert.equal(f.calls.length,0);
});
for(const url of ['/api/supabase/admin/memberships','/api/supabase/admin/audit','/api/supabase/bookings','/api/supabase/auth/login','/api/supabase/auth/refresh','/.env','/api/supabase/admin/access?token=x','http://evil.invalid/','/api/supabase/admin/%61ccess'])test(url+' is not exposed',async()=>{
 const f=fixture();assert.equal((await respond({...req,url},f.request)).status,404);assert.equal(f.calls.length,0);
});
test('missing or malformed session is rejected without contacting backend',async()=>{
 for(const authorization of [undefined,'Basic credentials','Bearer bad token']){
  const f=fixture();assert.equal((await respond({...req,authorization},f.request)).status,401);assert.equal(f.calls.length,0);
 }
});
test('upstream rejects invalid JWT and the gate relays no private payload',async()=>{
 const f=fixture({error:'invalid JWT',private:'never expose'},401);
 const result=await respond(req,f.request);assert.equal(result.status,401);assert.ok(!JSON.stringify(result).includes('private'));
});
test('technical ADMIN and ordinary users cannot access owner verification',async()=>{
 for(const access of [{...owner,level:'technical'},{...owner,allowed:false},{...owner,userId:'invalid'},{...owner,permissions:[]}]){
  assert.equal((await respond(req,fixture(access).request)).status,403);
 }
});
test('authorized owner can read through existing server identity checks',async()=>{
 const f=fixture();const result=await respond({...req,url:'/api/supabase/manage/businesses'},f.request);
 assert.equal(result.status,200);assert.equal(f.calls.length,2);
 assert.ok(f.calls.every(c=>c.init.method==='GET' && c.init.headers.Authorization===req.authorization && c.url.startsWith('http://127.0.0.1:3000/')));
});
test('health exposes only connectivity status',async()=>{
 const f=fixture();const result=await respond({method:'GET',url:'/api/healthz'},f.request);
 assert.deepEqual(result,{status:200,body:{status:'ok',mode:'private-read-only'}});
});
test('network errors fail closed and contain no details',async()=>{
 const result=await respond(req,async()=>{throw Error('secret-diagnostic-detail');});
 assert.equal(result.status,502);assert.ok(!JSON.stringify(result).includes('secret'));
});
test('HTTP handler rejects writes on a loopback-only ephemeral test server',async()=>{
 const f=fixture();const server=createGateway(f.request);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const response=await fetch('http://127.0.0.1:'+server.address().port+'/api/supabase/admin/access',{method:'POST',body:'fictitious-test'});
  assert.equal(response.status,405);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(f.calls.length,0);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
