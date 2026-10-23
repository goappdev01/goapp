import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGateway} from './gateway.mjs';

const origin='http://100.105.48.111:8086';
const login='/api/supabase/auth/login',refresh='/api/supabase/auth/refresh';
const credentials={email:'fictitious@example.invalid',password:'fictitious-password'};
const session={access_token:'fictitious-access',refresh_token:'fictitious-refresh',user:{id:'11111111-1111-4111-8111-111111111111'}};
const owner={allowed:true,role:'admin',level:'owner',userId:session.user.id,permissions:['admin.access']};
async function fixture(run,{status=200,access=owner}={}){
 const calls=[];
 const server=createGateway(async(url,init)=>{
  calls.push({url,init});
  return Response.json(status!==200?{error:'private upstream detail',access_token:'do-not-leak'}:url.endsWith('/admin/access')?access:url.endsWith('/auth/me')?{user:session.user}:session,{status});
 });
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const base='http://127.0.0.1:'+server.address().port;
 const request=(path,init)=>fetch(base+path,init);
 try{await run({calls,request});}finally{await new Promise(done=>server.close(done));}
}
const preflight=(method='POST',headers='content-type',webOrigin=origin)=>({method:'OPTIONS',headers:{Origin:webOrigin,'Access-Control-Request-Method':method,'Access-Control-Request-Headers':headers}});
const post=(body=credentials,webOrigin=origin)=>({method:'POST',headers:{'Content-Type':'application/json',...(webOrigin?{Origin:webOrigin}:{})},body:JSON.stringify(body)});
function permitted(reply){assert.equal(reply.headers.get('access-control-allow-origin'),origin);assert.equal(reply.headers.get('access-control-allow-credentials'),null);assert.equal(reply.headers.get('cache-control'),'no-store');assert.match(reply.headers.get('vary'),/Origin/);}

for(const route of [login,refresh])test('authorized preflight allows only POST on '+route,()=>fixture(async({request,calls})=>{
 const reply=await request(route,preflight('POST','Content-Type, Authorization, ACCEPT'));
 assert.equal(reply.status,204);permitted(reply);assert.equal(await reply.text(),'');assert.equal(reply.headers.get('access-control-allow-methods'),'POST');
 assert.deepEqual(reply.headers.get('access-control-allow-headers').split(',').map(v=>v.trim().toLowerCase()).sort(),['accept','authorization','content-type']);assert.equal(calls.length,0);
}));

test('authenticated read preflight is allowed without bypassing the actual owner gate',()=>fixture(async({request,calls})=>{
 const pre=await request('/api/supabase/auth/me',preflight('GET','authorization'));assert.equal(pre.status,204);permitted(pre);assert.equal(calls.length,0);
 const actual=await request('/api/supabase/auth/me',{headers:{Origin:origin}});assert.equal(actual.status,401);permitted(actual);assert.equal(calls.length,0);
}));

test('unapproved, null, lookalike and alternate-port origins cannot preflight or submit credentials',()=>fixture(async({request,calls})=>{
 for(const value of ['https://evil.invalid','http://100.105.48.111:8087','http://localhost:8086','https://100.105.48.111:8086','http://100.105.48.111:8086.evil.invalid','null']){
  for(const init of [preflight('POST','content-type',value),post(credentials,value)]){
   const reply=await request(login,init);assert.equal(reply.status,403);assert.equal(reply.headers.get('access-control-allow-origin'),null);
   assert.ok(!(await reply.text()).includes(credentials.password));
  }
 }assert.equal(calls.length,0);
}));

test('CORS does not expose other methods, encoded routes, queries or new business writes',()=>fixture(async({request,calls})=>{
 for(const [route,method]of [[login,'GET'],[login,'DELETE'],[refresh,'GET'],['/api/supabase/bookings','POST'],['/api/supabase/auth/register','POST'],[login+'?x=1','POST'],['/api/supabase/auth/%6cogin','POST']]){
  const reply=await request(route,preflight(method));assert.equal(reply.status,403);assert.equal(reply.headers.get('access-control-allow-origin'),null);
 }assert.equal(calls.length,0);
}));

test('unsupported requested headers fail before contacting upstream',()=>fixture(async({request,calls})=>{
 for(const headers of ['x-api-key','content-type,x-custom-header']){const reply=await request(login,preflight('POST',headers));assert.equal(reply.status,403);assert.equal(reply.headers.get('access-control-allow-origin'),null);}
 assert.equal(calls.length,0);
}));

test('GET login stays deliberately unavailable; bare OPTIONS is not globally enabled',()=>fixture(async({request,calls})=>{
 assert.equal((await request(login)).status,404);assert.equal((await request(login,{method:'OPTIONS'})).status,405);assert.equal(calls.length,0);
}));

test('authorized browser login reaches the fixed backend once and retains safe response contract',()=>fixture(async({request,calls})=>{
 const reply=await request(login,post());assert.equal(reply.status,200);permitted(reply);assert.equal(reply.headers.get('set-cookie'),null);assert.deepEqual(await reply.json(),session);
 assert.equal(calls.length,1);assert.equal(calls[0].url,'http://127.0.0.1:3000'+login);assert.deepEqual(JSON.parse(calls[0].init.body),credentials);
 assert.equal(calls[0].init.headers.Origin,undefined);assert.equal(calls[0].init.headers.Authorization,undefined);assert.equal(calls[0].init.redirect,'error');
}));

for(const status of [400,401,403,429,500])test('browser can read sanitized authentication error '+status,()=>fixture(async({request,calls})=>{
 const reply=await request(login,post());assert.equal(reply.status,status===500?502:status);permitted(reply);
 const text=await reply.text();assert.ok(!text.includes('private'));assert.ok(!text.includes('do-not-leak'));assert.ok(!text.includes(credentials.password));assert.equal(calls.length,1);
},{status}));

test('malformed body and wrong content type retain validation and readable CORS errors',()=>fixture(async({request,calls})=>{
 const invalid=await request(login,post({}));assert.equal(invalid.status,400);permitted(invalid);
 const nonJson=await request(login,{method:'POST',headers:{Origin:origin,'Content-Type':'text/plain'},body:'{}'});assert.equal(nonJson.status,415);permitted(nonJson);assert.equal(calls.length,0);
}));

test('native login and refresh without Origin remain compatible and use no CORS cookie credentials',()=>fixture(async({request,calls})=>{
 for(const [route,body]of [[login,credentials],[refresh,{refresh_token:'fictitious-refresh'}]]){
  const reply=await request(route,post(body,null));assert.equal(reply.status,200);assert.equal(reply.headers.get('access-control-allow-origin'),null);assert.equal(reply.headers.get('access-control-allow-credentials'),null);
 }assert.equal(calls.length,2);
}));

test('browser renewal has the same narrow CORS and session contract',()=>fixture(async({request,calls})=>{
 const reply=await request(refresh,post({refresh_token:'fictitious-refresh'}));assert.equal(reply.status,200);permitted(reply);assert.equal((await reply.json()).refresh_token,session.refresh_token);assert.equal(calls.length,1);
}));

test('ordinary user remains denied by owner-only read gate with a readable 403',()=>fixture(async({request,calls})=>{
 const reply=await request('/api/supabase/auth/me',{headers:{Origin:origin,Authorization:'Bearer fictitious-access'}});assert.equal(reply.status,403);permitted(reply);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/admin/access'));
},{access:{...owner,allowed:false}}));

test('preflight never consumes login attempts; the existing five-POST limit remains enforced',()=>fixture(async({request,calls})=>{
 for(let i=0;i<6;i++)assert.equal((await request(login,preflight())).status,204);
 for(let i=0;i<6;i++){const reply=await request(login,post());assert.equal(reply.status,i<5?200:429);permitted(reply);await reply.text();}
 assert.equal(calls.length,5);
}));

test('the existing global rate limit still covers preflight requests',()=>fixture(async({request,calls})=>{
 for(let i=0;i<61;i++){const reply=await request(login,preflight());assert.equal(reply.status,i<60?204:429);await reply.text();}assert.equal(calls.length,0);
}));
