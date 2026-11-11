import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const req=createRequire(path.join(process.cwd(),'package.json')),ts=req('typescript');
const zod=createRequire(path.resolve('../../lib/api-zod/package.json'))('zod');
function load(file,imports){const scope={exports:{},console,URLSearchParams,Response,Error,require:name=>{if(name in imports)return imports[name];throw Error(name)}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);return scope.exports;}
const contract=load('../../lib/api-zod/src/sports-events.ts',{zod});
const user='11111111-1111-4111-8111-111111111111',recordId='22222222-2222-4222-8222-222222222222';
const record={id:recordId,ownerUserId:user,profile:'ADMIN',version:0,recordType:'offer',status:'draft',accessStatus:'unverified',policy:{status:'unverified',sourceUrl:''},
 event:{key:'league:match:2026-11-11',title:'Partido sintético',sport:'football',competition:'Liga',homeTeam:'A',awayTeam:'B',startsAt:'',timeZone:'',city:'',region:'',venue:'',officialEventUrl:''},
 seat:{stand:'',section:'',row:'',seat:'12',quantity:1},mode:'sale',price:20,currency:'EUR',ownerStatement:'self_declared'};
function fixture(){
 const common=[],routes=[],calls=[];let member=true,missing=false,failStatus=200,failCode='';
 const router={use:(...f)=>common.push(...f),...Object.fromEntries(['get','post','put','delete'].map(m=>[m,(p,...f)=>routes.push({method:m,path:p,handlers:f})]))};
 const provider={bearerHeader:a=>({Authorization:a}),supabaseRequest:async(path,init)=>{
  calls.push({path,init}); if(path==='/auth/v1/user')return Response.json({id:user});
  if(path.startsWith('/rest/v1/admin_memberships'))return Response.json(member?[{user_id:user,level:'owner',permissions:[],active:true}]:[]);
  if(missing)return Response.json({code:path.includes('/rpc/')?'PGRST202':'PGRST205',message:'go_sports_event_records not found'},{status:404});
  if(failStatus!==200)return Response.json({code:failCode,message:'failure'},{status:failStatus});
  if(path.includes('/rpc/go_sports_record_save')){const b=JSON.parse(init.body);return Response.json({...b.p_record,version:b.p_expected_version+1});}
  if(path.includes('/rpc/go_sports_record_withdraw'))return Response.json({...record,status:'cancelled',version:2});
  return Response.json([{id:recordId,record_type:'offer',version:1,document:{...record,version:1}}]);
 }};
 const permissions=load('src/lib/adminPermissions.ts',{}),admin=load('src/middleware/requireAdmin.ts',{'../lib/supabase':provider,'../lib/adminPermissions':permissions});
 load('src/routes/sports-events.ts',{'express':{Router:()=>router},'@workspace/api-zod':contract,'../middleware/requireAdmin':admin,'../lib/supabase':provider});
 async function call(method,path,{headers={},body,query={},params={id:recordId}}={}){
  const request={header:n=>headers[n.toLowerCase()],body,query,params};const response={locals:{},statusCode:200,status(c){this.statusCode=c;return this;},setHeader(){},json(v){this.body=v;this.done=true;return this;}};
  const route=routes.find(r=>r.method===method&&r.path===path);assert.ok(route);
  for(const fn of [...common,...route.handlers]){let next=false;await fn(request,response,()=>{next=true;});if(!next)break;}return response;
 }
 return{call,calls,routes,setMember:v=>member=v,setMissing:v=>missing=v,fail:(s,c)=>{failStatus=s;failCode=c;}};
}
const headers={authorization:'Bearer test-token','x-go-context':'ADMIN'};
test('sports record contract keeps access unverified, rejects invalid money, and does not accept QR fields',()=>{
 assert.equal(contract.sportsEventRecordSchema.safeParse(record).success,true);
 assert.equal(contract.sportsEventRecordSchema.safeParse({...record,price:-1}).success,false);
 assert.equal(contract.sportsEventRecordSchema.safeParse({...record,accessStatus:'verified'}).success,false);
 assert.equal(contract.sportsEventRecordSchema.safeParse({...record,qr:'sensitive'}).success,false);
 assert.equal(contract.sportsEventRecordSchema.safeParse({...record,ownerUserId:'33333333-3333-4333-8333-333333333333'}).success,true);
 assert.equal(contract.sportsEventRecordSchema.safeParse({...record,mode:'sale',price:undefined}).success,false);
 assert.equal(contract.sportsEventRecordSchema.safeParse({...record,mode:'exchange',price:undefined}).success,false);
  assert.equal(contract.sportsEventRecordSchema.safeParse({...record,mode:'free',price:20}).success,false);
  assert.equal(contract.sportsEventRecordSchema.safeParse({...record,mode:'sale',exchange:{compatibleModes:['ticket']}}).success,false);
  assert.equal(contract.sportsEventRecordSchema.safeParse({...record,mode:'exchange',price:20,exchange:{compatibleModes:['ticket']}}).success,false);
  assert.equal(contract.sportsEventRecordSchema.safeParse({...record,mode:'exchange',exchange:{fromDate:'2026-12-31',toDate:'2026-01-01',compatibleModes:['ticket']}}).success,false);
  assert.equal(contract.sportsEventRecordSchema.safeParse({id:recordId,ownerUserId:user,profile:'ADMIN',version:0,recordType:'saved_search',status:'draft',accessStatus:'unverified',policy:{status:'unverified',sourceUrl:''},title:'search',city:'',region:'',team:'',competition:'',venue:'',fromDate:'2026-12-31',toDate:'2026-01-01',modes:['sale']}).success,false);
});
test('server requires a live ADMIN membership and explicit ADMIN context on every operation',async()=>{
 for(const [method,path] of [['get','/records'],['get','/records/:id'],['post','/records'],['put','/records/:id'],['delete','/records/:id']]){
  const f=fixture();assert.equal((await f.call(method,path)).statusCode,401);
  f.setMember(false);assert.equal((await f.call(method,path,{headers})).statusCode,403);
  assert.equal(f.calls.some(x=>x.path.includes('go_sports_event_records')||x.path.includes('go_sports_record_')),false);
 }
 for(const context of ['USER','BUSINESS','']){const f=fixture();assert.equal((await f.call('get','/records',{headers:{...headers,'x-go-context':context}})).statusCode,403);}
});
test('list query is identity-scoped, bounded, and returns only the callers own records',async()=>{
 const f=fixture(),res=await f.call('get','/records',{headers,query:{offset:'20',limit:'40',recordType:'offer',sport:'football',status:'draft',search:'final'}});
 assert.equal(res.statusCode,200);const call=f.calls.at(-1),url=new URL('https://local.invalid'+call.path);
 assert.equal(url.searchParams.get('owner_user_id'),'eq.'+user);assert.equal(url.searchParams.get('limit'),'40');assert.equal(url.searchParams.get('offset'),'20');
 assert.equal(url.searchParams.get('record_type'),'eq.offer');assert.equal(call.init.headers.Authorization,'Bearer test-token');
});
test('create and edit bind owner, identity and expected version to RPC; withdraw is soft',async()=>{
 const f=fixture();assert.equal((await f.call('post','/records',{headers,body:{record:{...record,ownerUserId:'33333333-3333-4333-8333-333333333333'},expectedVersion:0}})).statusCode,400);
 const created=await f.call('post','/records',{headers,body:{record,expectedVersion:0}});assert.equal(created.statusCode,201);assert.equal(created.body.version,1);
 const sent=JSON.parse(f.calls.at(-1).init.body);assert.equal(sent.p_record.ownerUserId,user);assert.equal(sent.p_expected_version,0);
 assert.equal((await f.call('put','/records/:id',{headers,body:{record:{...record,id:'33333333-3333-4333-8333-333333333333'},expectedVersion:1}})).statusCode,400);
 assert.equal((await f.call('put','/records/:id',{headers,body:{record:{...record,version:1},expectedVersion:1}})).statusCode,200);
 assert.equal((await f.call('delete','/records/:id',{headers,query:{version:'1'}})).statusCode,200);
 assert.ok(f.calls.some(x=>x.path.includes('go_sports_record_withdraw')));
});
test('missing schema fails closed; conflicts are not retried or treated as success',async()=>{
 const f=fixture();f.setMissing(true);const missing=await f.call('get','/records',{headers});assert.equal(missing.statusCode,503);assert.equal(missing.body.code,'SPORTS_EVENTS_NOT_READY');
 const conflict=fixture();conflict.fail(409,'PT409');const res=await conflict.call('post','/records',{headers,body:{record,expectedVersion:0}});assert.equal(res.statusCode,409);assert.equal(res.body.code,'SPORTS_RECORD_CONFLICT');
});
test('route surface contains no payment, transfer or public listing operations',()=>{
 const f=fixture();assert.deepEqual(f.routes.map(r=>`${r.method} ${r.path}`),['get /records','get /records/:id','post /records','put /records/:id','delete /records/:id']);
});
