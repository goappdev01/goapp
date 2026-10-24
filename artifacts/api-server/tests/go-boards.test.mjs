import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
const req=createRequire(path.join(process.cwd(),'package.json')), ts=req('typescript');
const zod=createRequire(path.resolve('../../lib/api-zod/package.json'))('zod');
function load(file,imports){const scope={exports:{},console,URLSearchParams,Error,require:name=>{if(name in imports)return imports[name];throw Error(name)}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,scope);return scope.exports;}
const contract=load('../../lib/api-zod/src/go-boards.ts',{zod});
const owner='11111111-1111-4111-8111-111111111111',board='22222222-2222-4222-8222-222222222222';
function fixture(){
  const common=[],routes=[],calls=[];let member=true,upstreamStatus=200,upstreamCode='';
  const router={use:(...handlers)=>common.push(...handlers),...Object.fromEntries(['get','put','post','delete'].map(method=>[method,(path,...handlers)=>routes.push({method,path,handlers})]))};
  const provider={bearerHeader:a=>({Authorization:a}),supabaseRequest:async(path,init)=>{
    calls.push({path,init});if(path==='/auth/v1/user')return Response.json({id:owner,user_metadata:{role:'admin'}});
    if(path.startsWith('/rest/v1/admin_memberships'))return Response.json(member?[{user_id:owner,level:'owner',permissions:[],active:true}]:[]);
    if(upstreamStatus!==200)return Response.json({code:upstreamCode},{status:upstreamStatus});
    if(path.includes('/rpc/go_board_save')){const body=JSON.parse(init.body);return Response.json({...body.p_document,version:body.p_expected+1});}
    return Response.json([]);
  }};
  const permissions=load('src/lib/adminPermissions.ts',{});
  const admin=load('src/middleware/requireAdmin.ts',{'../lib/supabase':provider,'../lib/adminPermissions':permissions});
  load('src/routes/boards.ts',{'express':{Router:()=>router},'@workspace/api-zod':contract,'../middleware/requireAdmin':admin,'../lib/supabase':provider});
  async function call(method,path,{headers={},body,query={},params={id:board}}={}){
    const request={header:name=>headers[name.toLowerCase()],body,query,params};
    const response={locals:{},statusCode:200,setHeader(){},status(code){this.statusCode=code;return this;},json(value){this.body=value;this.done=true;return this;}};
    const route=routes.find(r=>r.method===method&&r.path===path);assert.ok(route);
    for(const fn of [...common,...route.handlers]){let next=false;await fn(request,response,()=>{next=true;});if(!next)break;}
    return response;
  }
  return{call,calls,setMember:v=>{member=v},fail:(status,code)=>{upstreamStatus=status;upstreamCode=code}};
}
const headers={authorization:'Bearer fictional-token','x-go-context':'ADMIN'};
test('every board operation requires live ADMIN membership and explicit ADMIN context',async()=>{
  for(const [method,path] of [['get','/'],['get','/calendar'],['get','/:id'],['put','/:id'],['post','/transfer'],['delete','/:id']]){
    const f=fixture();assert.equal((await f.call(method,path)).statusCode,401);
    f.setMember(false);assert.equal((await f.call(method,path,{headers})).statusCode,403);
    assert.equal(f.calls.some(c=>c.path.includes('go_board')),false);
  }
  for(const context of ['USER','BUSINESS','']){const f=fixture();assert.equal((await f.call('get','/',{headers:{...headers,'x-go-context':context}})).statusCode,403);}
});
test('list pagination is bounded and all data queries retain caller identity',async()=>{
  const f=fixture();assert.equal((await f.call('get','/',{headers,query:{offset:30,archived:'all',search:'Proyecto'}})).statusCode,200);
  const call=f.calls.at(-1),url=new URL('http://test.invalid'+call.path);assert.equal(url.searchParams.get('limit'),'30');
  assert.equal(url.searchParams.get('offset'),'30');assert.equal(url.searchParams.get('owner_user_id'),'eq.'+owner);assert.equal(call.init.headers.Authorization,'Bearer fictional-token');
});
test('save rejects foreign ownership and preserves CAS revisions',async()=>{
  const f=fixture(),body={id:board,ownerUserId:owner,profile:'ADMIN',name:'Trabajo',description:'',cover:null,archived:false,position:1,version:0,columns:[],cards:[],view:'columns',anchorDate:'2026-10-24'};
  assert.equal((await f.call('put','/:id',{headers,body:{...body,ownerUserId:board}})).statusCode,400);
  const response=await f.call('put','/:id',{headers,body});assert.equal(response.statusCode,200);assert.equal(response.body.version,1);
  const sent=JSON.parse(f.calls.at(-1).init.body);assert.equal(sent.p_expected,0);assert.equal(sent.p_document.ownerUserId,owner);
});
test('version conflicts remain 409; provider outage is 503 and deletes require confirmation',async()=>{
  const f=fixture();f.fail(409,'PT409');assert.equal((await f.call('get','/',{headers})).statusCode,409);
  f.fail(500,'XX000');assert.equal((await f.call('get','/',{headers})).statusCode,503);
  assert.equal((await f.call('delete','/:id',{headers,query:{version:1}})).statusCode,400);
});
