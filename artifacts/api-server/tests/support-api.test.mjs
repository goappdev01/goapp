import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

const id='11111111-1111-4111-8111-111111111111';
const requestId='22222222-2222-4222-8222-222222222222';
const fileId='33333333-3333-4333-8333-333333333333';
const key='44444444-4444-4444-8444-444444444444';
test('GO AYUDA API validates input, live JWT, RLS failures and private file operations',async()=>{
  const dir=await mkdtemp(path.join(tmpdir(),'go-support-api-'));
  await build({entryPoints:['src/routes/support.ts'],outfile:path.join(dir,'router.mjs'),bundle:true,platform:'node',format:'esm',
    banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
  const {default:router}=await import(pathToFileURL(path.join(dir,'router.mjs')));
  const {default:express}=await import('express');
  const app=express();app.use(express.json());app.use('/api/supabase/support',router);
  const server=app.listen(0,'127.0.0.1');await new Promise(done=>server.once('listening',done));
  const original=globalThis.fetch,oldUrl=process.env.SUPABASE_URL,oldKey=process.env.SUPABASE_PUBLISHABLE_KEY;
  process.env.SUPABASE_URL='https://support-test.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='test-public';
  let authStatus=200,rpcStatus=200,rpcCode='42501',upstream=[],storage=[];
  globalThis.fetch=async(url,init={})=>{
    if(!String(url).startsWith('https://support-test.invalid'))return original(url,init);
    const target=new URL(url),head=init.headers??{};
    assert.equal(head.Authorization,'Bearer test-token');assert.equal(head.apikey,'test-public');
    if(target.pathname==='/auth/v1/user')return Response.json({id},{status:authStatus});
    if(target.pathname.startsWith('/rest/v1/rpc/')){
      upstream.push({name:target.pathname.split('/').at(-1),body:JSON.parse(init.body)});
      if(rpcStatus!==200)return Response.json({code:rpcCode,message:'private detail'}, {status:rpcStatus});
      const name=target.pathname.split('/').at(-1);
      if(name==='go_support_file')return Response.json({id:fileId,object_path:`${requestId}/${fileId}`,mime_type:'application/pdf',byte_size:5});
      if(name==='go_support_expired')return Response.json([{id:requestId,files:[{id:fileId,path:`${requestId}/${fileId}` }]}]);
      if(name==='go_support_claim_expired')return Response.json({id:requestId,files:[{id:fileId,path:`${requestId}/${fileId}` }]});
      if(name==='go_support_readiness')return Response.json({ready:true,version:1,retentionMonths:12});
      if(name==='go_support_purge_expired')return Response.json(true);
      if(name==='go_support_reserve_file')return Response.json({id:fileId,clientId:'local1',fileName:'a.pdf',status:'uploading'});
      if(name==='go_support_confirm_file')return Response.json({id:fileId,status:'ready'});
      return Response.json({id:requestId,reference:'AY-00000001',status:'received'});
    }
    storage.push({method:init.method,path:target.pathname});
    if(target.pathname.includes('/object/sign/'))return Response.json({signedURL:`/storage/v1/object/sign/go-support-private/${requestId}/${fileId}?token=short`});
    return init.method==='GET'?new Response(new Uint8Array([37,80,68,70,45]),{status:200}):Response.json({path:target.pathname});
  };
  const base=`http://127.0.0.1:${server.address().port}/api/supabase/support`;
  const request=(route,method='GET',body,token='test-token',mime='application/json')=>original(base+route,{method,
    headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,'Content-Type':mime},
    ...(['POST','DELETE'].includes(method)?{body:body===undefined?undefined:typeof body==='string'||Buffer.isBuffer(body)?body:JSON.stringify(body)}:{})});
  try{
    assert.equal((await request('/requests','GET',undefined,null)).status,401);
    assert.equal(upstream.length,0);
    authStatus=401;assert.equal((await request('/requests')).status,401);authStatus=200;
    authStatus=403;assert.equal((await request('/requests')).status,401);authStatus=200;
    assert.deepEqual(await (await request('/capabilities')).json(),{ready:true,version:1,retentionMonths:12});
    rpcStatus=404;rpcCode='PGRST202';
    assert.equal((await request('/capabilities')).status,503);
    assert.equal((await (await request('/requests')).json()).code,'SUPPORT_SETUP_REQUIRED');
    rpcStatus=200;rpcCode='42501';upstream=[];
    assert.equal((await request('/requests','POST',{kind:'help',body:'',requestKey:key})).status,400);
    assert.equal(upstream.length,0);
    let response=await request('/requests','POST',{kind:'help',body:'  Necesito ayuda  ',requestKey:key,senderId:'forged'});
    assert.equal(response.status,200);assert.deepEqual(upstream.at(-1).body,{p_kind:'help',p_body:'Necesito ayuda',p_request_key:key,p_business_id:null});
    rpcStatus=403;response=await request('/requests?admin=true');assert.equal(response.status,403);assert.equal((await response.json()).code,'SUPPORT_ACCESS_DENIED');rpcStatus=200;
    assert.equal((await request('/requests?scope=personal')).status,200);
    assert.equal(upstream.at(-1).body.p_scope,'personal');assert.equal(upstream.at(-1).body.p_business_id,null);
    assert.equal((await request('/requests?scope=business&businessId='+requestId)).status,200);
    assert.equal(upstream.at(-1).body.p_business_id,requestId);
    for(const query of ['scope=business','scope=personal&businessId='+requestId,'businessId='+requestId,'admin=true&scope=personal','scope=unexpected']){
      const before=upstream.length;assert.equal((await request('/requests?'+query)).status,400);assert.equal(upstream.length,before);
    }
    assert.equal((await request(`/requests/${requestId}/actions`,'POST',{key,action:'status',status:'solved',revision:1})).status,200);
    assert.equal((await request(`/requests/${requestId}/actions`,'POST',{key,action:'status',status:'invalid',revision:1})).status,400);
    assert.equal((await request(`/requests/${requestId}/files`,'POST',{clientId:'local1',name:'a.pdf',mime:'application/pdf',size:5})).status,200);
    assert.equal((await request(`/files/${fileId}/content`,'POST',Buffer.from('%PDF-'),'test-token','image/jpeg')).status,400);
    assert.equal(storage.length,0);
    assert.equal((await request(`/files/${fileId}/content`,'POST',Buffer.from('%PDF-'),'test-token','application/pdf')).status,200);
    assert.equal(storage.length,1);assert.equal(storage[0].method,'POST');
    assert.equal((await request(`/files/${fileId}/confirm`,'POST')).status,200);
    response=await request(`/files/${fileId}/link`);assert.equal(response.status,200);assert.ok((await response.json()).url.includes('token=short'));
    response=await request(`/files/${fileId}/content`);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');
    response=await request('/retention/purge','POST');assert.equal(response.status,200);assert.deepEqual(await response.json(),{purged:1,pending:0});
    assert.equal(storage.at(-1).method,'DELETE');assert.equal(upstream.at(-1).name,'go_support_purge_expired');
  }finally{globalThis.fetch=original;process.env.SUPABASE_URL=oldUrl;process.env.SUPABASE_PUBLISHABLE_KEY=oldKey;
    await new Promise(done=>server.close(done));await rm(dir,{recursive:true,force:true});}
});
