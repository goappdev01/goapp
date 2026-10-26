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
 const handlers=new Map(),calls=[];let upstream=Response.json([]);
 const router={get:(p,h)=>handlers.set('GET '+p,h),post:(p,h)=>handlers.set('POST '+p,h)};
 const supabase={bearerHeader:v=>v?.startsWith('Bearer ')?{Authorization:v}:{},supabaseRequest:async(...args)=>{calls.push(args);if(upstream instanceof Error)throw upstream;return upstream;}};
 const policy={};vm.runInNewContext(ts.transpileModule(readFileSync('src/lib/bookingGapPolicy.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:policy,require:name=>name==='./supabase'?supabase:require(name)});
 vm.runInNewContext(source,{exports:{},require(name){if(name==='express')return{Router:()=>router};if(name==='../lib/supabase')return supabase;if(name==='../lib/bookingGapPolicy')return policy;return require(name);}});
 return{calls,reply:r=>{upstream=r;},async request(method,{auth='Bearer fictional',body,query={},bookingId=id}={}){
  const result={status:200};const res={setHeader(){},status:n=>{result.status=n;return res;},type:()=>res,send:v=>{result.body=JSON.parse(v);return res;},json:v=>{result.body=v;return res;}};
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
