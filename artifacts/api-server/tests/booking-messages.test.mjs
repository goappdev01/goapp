import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import path from 'node:path';
const require=createRequire(path.join(process.cwd(),'package.json')),ts=require('typescript');
const source=ts.transpileModule(readFileSync('src/routes/bookingNegotiation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const id='11111111-1111-4111-8111-111111111111',messageId='22222222-2222-4222-8222-222222222222';
function fixture(){
 const handlers=new Map(),calls=[],authCalls=[];let upstream=Response.json([]),authStatus=200,businessRows=[{id}],bookingRows=[{id}];
 const router={get:(p,h)=>handlers.set('GET '+p,h),post:(p,h)=>handlers.set('POST '+p,h)};
 const supabase={bearerHeader:v=>v?.startsWith('Bearer ')?{Authorization:v}:{},supabaseRequest:async(...args)=>{
  if(args[0]==='/auth/v1/user'){authCalls.push(args);return Response.json({id},{status:authStatus});}
  calls.push(args);if(args[0].startsWith('/rest/v1/businesses?'))return Response.json(businessRows);
  if(args[0].startsWith('/rest/v1/bookings?'))return Response.json(bookingRows);
  if(upstream instanceof Error)throw upstream;return upstream;}};
 const policy={};vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/bookingGapPolicy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:policy,require:name=>name==='./supabase'?supabase:require(name)});
 vm.runInNewContext(source,{exports:{},require(name){if(name==='express')return{Router:()=>router};if(name==='../lib/supabase')return supabase;if(name==='../lib/bookingGapPolicy')return policy;return require(name);}});
 return{calls,authCalls,authStatus:n=>{authStatus=n;},businessRows:rows=>{businessRows=rows;},bookingRows:rows=>{bookingRows=rows;},reply:r=>{upstream=r;},async request(method,{auth='Bearer fictional',body,query={},bookingId=id}={}){
  const result={status:200};const res={setHeader(){},status:n=>{result.status=n;return res;},type:()=>res,send:v=>{result.body=JSON.parse(v);return res;},json:v=>{result.body=JSON.parse(JSON.stringify(v));return res;}};
  await handlers.get(method==='GET'?'GET /booking-conversations':'POST /bookings/:bookingId/messages')({header:()=>auth,query,params:{bookingId},body},res);return result;
 }};
}
test('message routes require authentication and forward only caller JWT and canonical booking context',async()=>{
 const g=fixture();assert.equal((await g.request('GET',{auth:''})).status,401);assert.equal(g.calls.length,0);
 await g.request('GET',{query:{booking_id:id}});assert.equal(g.calls.length,1);assert.equal(g.calls[0][0],'/rest/v1/rpc/go_booking_conversations');assert.equal(g.calls[0][1].headers.Authorization,'Bearer fictional');assert.deepEqual(JSON.parse(g.calls[0][1].body),{p_booking_id:id});
});
test('POST rejects forged authors, recipients and malformed messages before the data layer',async()=>{
 for(const body of [{messageId,text:'Hello',senderId:'another-user'},{messageId,text:'Hello',recipientId:'another-company'},{messageId,text:''},{messageId:'not-an-id',text:'Hello'}]){const f=fixture();assert.equal((await f.request('POST',{body})).status,400);assert.equal(f.calls.length,0);}
 const f=fixture();f.reply(Response.json({id:'booking:'+id}));assert.equal((await f.request('POST',{body:{messageId,text:'Hello'}})).status,200);assert.deepEqual(JSON.parse(f.calls[0][1].body),{p_booking_id:id,p_message_id:messageId,p_text:'Hello'});
});
test('unavailable persistence and network failures report failure rather than simulated success',async()=>{
 const f=fixture();f.reply(Response.json({code:'PGRST202'},{status:404}));const missing=await f.request('GET');assert.equal(missing.status,501);assert.equal(missing.body.code,'GO_MESSAGES_UNAVAILABLE');
 f.reply(new Error('Do not expose private connection detail'));const unavailable=await f.request('POST',{body:{messageId,text:'Retain draft'}});assert.equal(unavailable.status,503);assert.ok(unavailable.body.error.includes('texto se conserva'));assert.ok(!JSON.stringify(unavailable).includes('private connection'));
});

test('message endpoints reject expired sessions before RPC and isolate selected personal/company inboxes',async()=>{
 const expired=fixture();expired.authStatus(401);
 assert.equal((await expired.request('POST',{body:{messageId,text:'Private'}})).status,401);assert.equal(expired.calls.length,0);
 const rows=[{id:'booking:'+id,bookingId:id,businessId:id},{id:'booking:'+messageId,bookingId:messageId,businessId:messageId}];
 const company=fixture();company.reply(Response.json(rows));
 const selected=await company.request('GET',{query:{scope:'business',business_id:id}});
 assert.equal(selected.status,200);assert.deepEqual(selected.body,[{...rows[0],inboxScope:'business:'+id}]);
 assert.equal(company.calls[0][0],'/rest/v1/rpc/go_booking_conversations');
 const denied=fixture();denied.reply(Response.json([]));
 assert.deepEqual((await denied.request('GET',{query:{scope:'business',business_id:id}})).body,[]);
 const personal=fixture();personal.reply(Response.json(rows));personal.bookingRows([{id:messageId}]);
 const own=await personal.request('GET',{query:{scope:'personal'}});assert.deepEqual(own.body,[{...rows[1],inboxScope:'personal'}]);
 assert.ok(personal.calls.at(-1)[0].includes('customer_id=eq.'+id));
 for(const query of [{scope:'business'},{business_id:id},{scope:'personal',business_id:id},{scope:['personal']}]){
  const invalid=fixture();assert.equal((await invalid.request('GET',{query})).status,400);assert.equal(invalid.calls.length,0);
 }
});
