import {test} from 'node:test';
import assert from 'node:assert/strict';
import {respond,createGateway} from './gateway.mjs';
const path='/api/supabase/auth/refresh';
const input={refresh_token:'fictitious-refresh'};
const session={access_token:'fictitious-access',refresh_token:'fictitious-rotated',
  expires_at:1900000000,expires_in:3600,user:{id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid'}};
function fixture(payload=session,status=200,headers={'content-type':'application/json'}){
 const calls=[];return {calls,request:async(url,init)=>{calls.push({url,init});
   return new Response(typeof payload==='string'?payload:JSON.stringify(payload),{status,headers});}};
}
async function httpFixture(run,request){
 const f=fixture(),server=createGateway(request??f.request);
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{await run('http://127.0.0.1:'+server.address().port,f);}
 finally{await new Promise(resolve=>server.close(resolve));}
}
const post=(...bodies)=>({method:'POST',url:path,body:bodies.length?bodies[0]:input,authorization:'Bearer caller-must-not-be-forwarded'});

test('renewal forwards only its opaque credential to the fixed backend auth route and returns the rotated pair',async()=>{
 const f=fixture({...session,private:'never return this',role:'admin'});
 const result=await respond(post(),f.request);
 assert.deepEqual(result,{status:200,body:session});assert.equal(f.calls.length,1);
 const call=f.calls[0];assert.equal(call.url,'http://127.0.0.1:3000'+path);
 assert.equal(call.init.method,'POST');assert.equal(call.init.redirect,'error');
 assert.deepEqual(JSON.parse(call.init.body),input);assert.equal(call.init.headers.Authorization,undefined);
 assert.equal(call.init.headers['Content-Type'],'application/json');assert.ok(call.init.signal instanceof AbortSignal);
 assert.ok(!call.url.includes(input.refresh_token));
});

test('malformed renewal bodies, unknown fields and overlong credentials never reach the backend',async()=>{
 for(const body of [undefined,null,[],{},false,1,{refresh_token:2},{refresh_token:''},{refresh_token:' '},
   {refresh_token:'a b'},{refresh_token:'a\nb'},{refresh_token:'a\u0000b'},{refresh_token:'a'.repeat(8193)},
   {...input,role:'admin'},{...input,user_id:session.user.id},{...input,access_token:session.access_token},
   {...input,email:'test@example.invalid'}]){
  const f=fixture();const result=await respond(post(body),f.request);
  assert.equal(result.status,400);assert.equal(f.calls.length,0);
  assert.ok(!JSON.stringify(result).includes('fictitious-refresh'));
 }
});

for(const [method,status]of [['GET',404],['HEAD',405],['PUT',405],['PATCH',405],['DELETE',405],['OPTIONS',405]]){
 test(method+' cannot use the renewal route',async()=>{
  const f=fixture();assert.equal((await respond({...post(),method},f.request)).status,status);assert.equal(f.calls.length,0);
 });
}
for(const url of [path+'?refresh_token=do-not-read',path+'/',path.toUpperCase(),'/api/supabase/auth/%72efresh',
 'http://evil.invalid'+path,'/api/supabase/auth/register','/api/supabase/auth/recover',
 '/api/supabase/admin/memberships','/api/supabase/manage/enrollment','/api/supabase/bookings']){
 test('renewal does not expose another POST route: '+url,async()=>{
  const f=fixture();assert.equal((await respond({...post(),url},f.request)).status,405);assert.equal(f.calls.length,0);
 });
}

for(const [status,upstreamCode,outwardStatus,outwardCode]of [
 [401,'SESSION_UNRECOVERABLE',401,'SESSION_UNRECOVERABLE'],
 [401,'SESSION_REFRESH_FAILED',401,'SESSION_REFRESH_FAILED'],
 [400,'REFRESH_TOKEN_REQUIRED',400,'SESSION_REFRESH_FAILED'],
 [403,'SESSION_UNRECOVERABLE',403,'SESSION_REFRESH_FAILED'],
 [429,'SESSION_REFRESH_FAILED',429,'SESSION_REFRESH_FAILED'],
 [500,'SESSION_UNRECOVERABLE',502,'SESSION_REFRESH_FAILED'],
 [503,'SESSION_REFRESH_FAILED',502,'SESSION_REFRESH_FAILED'],
 [302,'SESSION_REFRESH_FAILED',502,'SESSION_REFRESH_FAILED'],
]){
 test('renewal preserves the failure contract for '+status+' / '+upstreamCode+' without exposing credentials',async()=>{
  const result=await respond(post(),fixture({code:upstreamCode,error:'private '+input.refresh_token,
    access_token:session.access_token,refresh_token:session.refresh_token},status).request);
  assert.equal(result.status,outwardStatus);assert.equal(result.body.code,outwardCode);
  assert.ok(!JSON.stringify(result).includes('fictitious'));assert.ok(!JSON.stringify(result).includes('private'));
 });
}

test('network and malformed or oversized responses fail closed without leaking upstream detail',async()=>{
 const requests=[
  async()=>{throw Error('private '+input.refresh_token);},
  fixture('<html>'+input.refresh_token+'</html>',200,{'content-type':'text/html'}).request,
  fixture('not JSON '+input.refresh_token).request,
  fixture({extra:'x'.repeat(1048576)}).request,
 ];
 for(const request of requests){
  const result=await respond(post(),request);assert.equal(result.status,502);
  assert.equal(result.body.code,'SESSION_REFRESH_FAILED');assert.ok(!JSON.stringify(result).includes('fictitious'));
 }
});

test('invalid successful credentials and expiry fields cannot be returned as a usable session',async()=>{
 for(const payload of [null,{},[],{...session,access_token:1},{...session,access_token:'bad token'},
  {...session,access_token:'x'.repeat(8193)},{...session,refresh_token:''},{...session,user:{id:'bad'}},
  {...session,expires_in:'3600'},{...session,expires_at:0},{...session,expires_in:Infinity}]){
  assert.equal((await respond(post(),fixture(payload).request)).status,502);
 }
});

test('HTTP renewal accepts the mobile JSON contract, disables caching and forwards no caller authorization',()=>httpFixture(async(base,f)=>{
 const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer ignored'},body:JSON.stringify(input)});
 assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');
 assert.equal(r.headers.get('connection'),'close');assert.deepEqual(await r.json(),session);
 assert.equal(f.calls.length,1);assert.equal(f.calls[0].init.headers.Authorization,undefined);
}));

test('HTTP renewal rejects malformed JSON, non-JSON, content encoding and oversized bodies before upstream',()=>httpFixture(async(base,f)=>{
 const cases=[
  ['application/json','{',{},400],['text/plain',JSON.stringify(input),{},415],
  ['application/json',JSON.stringify(input),{'Content-Encoding':'gzip'},415],
  ['application/json','x'.repeat(12289),{},413],
 ];
 for(const [type,body,extra,status]of cases){
  const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':type,...extra},body});
  assert.equal(r.status,status);await r.text();
 }
 assert.equal(f.calls.length,0);
}));

test('chunked HTTP renewal is bounded even without Content-Length',()=>httpFixture(async(base,f)=>{
 const body=new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(12289)));controller.close();}});
 const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json'},body,duplex:'half'});
 assert.equal(r.status,413);await r.text();assert.equal(f.calls.length,0);
}));

test('HTTP renewal has its own five-attempt limit and preserves the existing login limit',()=>httpFixture(async(base,f)=>{
 const make=route=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify(route===path?input:{email:'test@example.invalid',password:'fictitious-password'})});
 for(let i=0;i<6;i++){const r=await make(path);assert.equal(r.status,i<5?200:429);await r.text();}
 for(let i=0;i<6;i++){const r=await make('/api/supabase/auth/login');assert.equal(r.status,i<5?200:429);await r.text();}
 assert.equal(f.calls.length,10);
}));
