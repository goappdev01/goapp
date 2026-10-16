import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {createGateway} from './gateway.mjs';
import {loadAuthSession} from '../../artifacts/go-app-mobile/tests/helpers/auth-session-fixture.mjs';
const require=createRequire(import.meta.url),ts=require('typescript');
const backendPath=new URL('../../artifacts/api-server/src/routes/supabase.ts',import.meta.url);
const compile=code=>ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const sessionKey='go_supabase_session_v1',roleKey='go_account_type_v1',secureKey='go_auth_session_v2',logoutKey='go_auth_signed_out_v2';
const userId='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222';
const now=Date.parse('2026-10-12T16:00:00Z');
const jwt=expiry=>'test.'+Buffer.from(JSON.stringify({exp:expiry,session_id:sid})).toString('base64url')+'.test';
const session={access_token:jwt(now/1000-120),refresh_token:'fictitious-refresh',user:{id:userId,email:'owner@example.invalid',user_metadata:{role:'usuario'}}};
const renewed={...session,access_token:jwt(now/1000+3600),refresh_token:'fictitious-rotated',expires_in:3600,expires_at:now/1000+3600};
function backendRefresh(provider){
 const source=readFileSync(backendPath,'utf8'),ast=ts.createSourceFile(fileURLToPath(backendPath),source,ts.ScriptTarget.Latest,true);
 let handler;function find(node){
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='router.post'&&node.arguments[0]?.text==='/auth/refresh')handler=node.arguments[1];
  ts.forEachChild(node,find);
 }find(ast);assert.ok(handler,'Use the existing backend refresh handler');
 const context={exports:{},supabaseRequest:provider};vm.runInNewContext(compile('exports.handler = '+handler.getText(ast)),context);
 return async init=>{
  let status=200,payload,headers={};
  const res={setHeader(key,value){headers[key]=value;},status(value){status=value;return res;},json(value){payload=value;return res;}};
  await context.exports.handler({body:JSON.parse(init.body)},res);
  return Response.json(payload,{status,headers});
 };
}
async function circuit(run,{providerFailure,owner=true}={}){
 const calls=[],providerCalls=[],events=[],writes=[],removals=[],secureWrites=[];const secure=new Map();
 let failing=providerFailure;
 const provider=async(url,init)=>{
  providerCalls.push({url,init});assert.equal(url,'/auth/v1/token?grant_type=refresh_token');assert.equal(init.method,'POST');
  assert.deepEqual(JSON.parse(init.body),{refresh_token:'fictitious-refresh'});
  if(failing==='network')throw Error('private network detail');
  if(failing==='revoked')return Response.json({error_code:'refresh_token_not_found',msg:'Invalid refresh token'},{status:400});
  if(failing==='temporary')return Response.json({msg:'temporary failure'},{status:503});
  return Response.json(renewed);
 };
 const refresh=backendRefresh(provider);
 const backend=async(url,init)=>{
  calls.push({url,init});assert.ok(url.startsWith('http://127.0.0.1:3000/api/'));
  if(url.endsWith('/auth/refresh'))return refresh(init);
  const valid=new Headers(init.headers).get('Authorization')==='Bearer '+renewed.access_token;
  if(!valid)return Response.json({error:'invalid JWT'},{status:401});
  if(url.endsWith('/admin/access'))return Response.json({allowed:owner,role:owner?'admin':'usuario',level:owner?'owner':null,
    userId,permissions:owner?['admin.access']:[]});
  if(url.endsWith('/auth/me'))return Response.json({user:renewed.user,profile:{role:'usuario'}});
  if(url.endsWith('/manage/businesses'))return Response.json([{id:'33333333-3333-4333-8333-333333333333',verified:false}]);
  throw Error('Unexpected protected route');
 };
 const server=createGateway(backend);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port+'/api';
 const storage=new Map([[sessionKey,JSON.stringify(session)],[roleKey,'usuario'],
  ['go_owner_view_context_v1:'+userId,'BUSINESS'],['go_business_demo_catalog_v1:'+userId,'preserve businesses and selection'],
  ['go_business_demo_v1:'+userId,'preserve configuration, professionals, services, floor and reservations']]);
 const original=[...storage].filter(([key])=>key!==sessionKey&&key!==roleKey);
 const storageApi={getItem:async key=>storage.get(key)??null,
  setItem:async(key,value)=>{storage.set(key,value);writes.push(key);},
  removeItem:async key=>{removals.push([key]);storage.delete(key);},
  multiRemove:async keys=>{removals.push([...keys]);for(const key of keys)storage.delete(key);}};
 let clockTime=now;class Clock extends Date{static now(){return clockTime;}}
 const api=loadAuthSession({process:{env:{EXPO_PUBLIC_API_URL:base}},fetch,Headers,AbortController,Date:Clock},storageApi,
  {notifySessionChanged:()=>events.push('identity'),onSessionChanged:()=>()=>{}},
  {secure,write:key=>secureWrites.push(key)});
 try{await run({api,base,storage,secure,secureWrites,original,calls,providerCalls,events,writes,removals,setFailure:value=>{failing=value;},advanceTime:milliseconds=>{clockTime+=milliseconds;}});}
 finally{await new Promise(resolve=>server.close(resolve));}
}
const retained=f=>[...f.storage].filter(([key])=>key!==sessionKey&&key!==roleKey&&key!==logoutKey);

test('mobile → actual HTTP gateway → existing backend handler → simulated Auth refresh restores the session and protected owner reads',()=>circuit(async f=>{
 const checks=Array.from({length:8},()=>f.api.fetchWithAuth(f.base+'/supabase/auth/me'));
 const responses=await Promise.all(checks);assert.ok(responses.every(response=>response.status===200));
 const restored=await f.api.restoreStoredAuthentication();assert.equal(restored.role,'usuario');assert.equal(restored.session.user.id,userId);
 const current=JSON.parse(f.secure.get(secureKey));assert.equal(f.storage.has(sessionKey),false);assert.equal(current.access_token,renewed.access_token);
 assert.equal(current.refresh_token,renewed.refresh_token);assert.equal(current.expires_at,renewed.expires_at);
 assert.equal(f.providerCalls.length,1,'Concurrent mobile calls perform one provider renewal');
 assert.equal(f.calls.filter(call=>call.url.endsWith('/auth/refresh')).length,1);
 assert.deepEqual(f.writes,[]);assert.deepEqual(f.secureWrites,[secureKey,secureKey]);assert.deepEqual(f.removals,[[sessionKey],[sessionKey]]);assert.deepEqual(f.events,[]);
 assert.deepEqual(retained(f),f.original);
 const response=await f.api.fetchWithAuth(f.base+'/supabase/manage/businesses');
 assert.equal(response.status,200);assert.equal((await response.json())[0].verified,false);
 assert.ok(f.calls.every(call=>call.init.method==='GET'||call.url.endsWith('/auth/refresh')));
}));

test('renewing an ordinary identity grants no owner permission or access to protected business data',()=>circuit(async f=>{
 const result=await f.api.restoreStoredAuthentication();assert.equal(result.session.user.id,userId);assert.equal(result.role,'usuario');
 const response=await f.api.fetchWithAuth(f.base+'/supabase/manage/businesses');assert.equal(response.status,403);
 assert.equal(f.calls.some(call=>call.url.endsWith('/manage/businesses')),false,'The owner boundary rejects before reading business data');
 assert.equal(f.providerCalls.length,1);assert.deepEqual(f.removals,[[sessionKey],[sessionKey]]);assert.deepEqual(retained(f),f.original);
},{owner:false}));

test('provider revocation crosses the existing backend and gateway contract and requests authentication without deleting DEMO',()=>circuit(async f=>{
 const restored=await f.api.restoreStoredAuthentication();assert.equal(restored.session,null);
 assert.equal(f.storage.has(sessionKey),false);assert.equal(f.storage.has(roleKey),false);
 assert.equal(f.secure.has(secureKey),false);assert.equal(f.storage.get(logoutKey),'1');
 assert.deepEqual(f.removals,[[sessionKey],[sessionKey,roleKey]]);assert.deepEqual(f.events,['identity']);assert.deepEqual(retained(f),f.original);
},{providerFailure:'revoked'}));

for(const failure of ['temporary','network'])test(failure+' failure across the complete renewal circuit preserves credentials and recovers safely',()=>circuit(async f=>{
 const restored=await f.api.restoreStoredAuthentication();
 assert.equal(restored.session.user.id,userId);assert.equal(f.secure.get(secureKey),JSON.stringify(session));
 assert.equal(f.storage.has(sessionKey),false);assert.deepEqual(f.removals,[[sessionKey]]);assert.deepEqual(retained(f),f.original);
 f.setFailure(null);await assert.rejects(f.api.ensureAuthSession(),error=>error.code==='SESSION_REFRESH_UNAVAILABLE');
 assert.equal(f.providerCalls.length,1,'No provider retry during the recovery pause');
 f.advanceTime(30000);const next=await f.api.ensureAuthSession();assert.equal(next.refresh_token,renewed.refresh_token);
 assert.equal(f.providerCalls.length,2);assert.deepEqual(f.events,[]);assert.deepEqual(retained(f),f.original);
},{providerFailure:failure}));
