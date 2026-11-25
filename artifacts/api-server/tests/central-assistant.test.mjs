import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';import vm from 'node:vm';import fs from 'node:fs';import {fileURLToPath} from 'node:url';import path from 'node:path';
const root=fileURLToPath(new URL('../../../',import.meta.url)),require=createRequire(new URL('../../go-app-mobile/package.json',import.meta.url));
const ts=require('typescript');
const h={load(file,imports={},globals={}){const context={exports:{},Date,Intl,URL,Error,console,setTimeout,clearTimeout,Promise,...globals,require:name=>{if(name in imports)return imports[name];throw Error('Unexpected '+name);}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context);return context.exports;}};
for(const http of [false,true])test('central route '+(http?'real Express HTTP':'contract adapter')+': consent, roles, provider payload, limits, transcription',{skip:http&&!process.env.GO_CENTRAL_TEST_DEPS},async()=>{
 const config={SUPABASE_URL:'https://auth.invalid',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',OPENAI_API_KEY:'synthetic-secret'},provider=[];let member=true,providerFail=false,history=null;
 const globals={process:{env:config},URLSearchParams,Buffer,Blob,FormData,AbortController,AbortSignal,fetch:async(url,init)=>{
  if(String(url).endsWith('/auth/v1/user'))return Response.json({id:'A',user_metadata:{role:'admin'}});
  if(String(url).includes('/rest/v1/admin_memberships?'))return Response.json(member?[{user_id:'A',level:'technical',permissions:['admin.access'],active:true}]:[]);
  if(String(url).includes('/rest/v1/go_ai_conversations?')){
   const query=new URL(String(url)).searchParams;
   if(init.method!=='POST'&&query.get('user_id')!=='eq.A')throw Error('Unscoped history request');
   if(init.method==='POST'){
    if(history)return Response.json({code:'23505'},{status:409});
    history=JSON.parse(init.body);return Response.json([{revision:history.revision}],{status:201});
   }
   if(init.method==='PATCH'){
    if(!history||query.get('revision')!==`eq.${history.revision}`)return Response.json([]);
    history=JSON.parse(init.body);return Response.json([{revision:history.revision}]);
   }
   return Response.json(history?[history]:[]);
  }
  if(String(url).startsWith('https://api.openai.com/')){provider.push({url:String(url),init});if(providerFail)throw Error('synthetic-secret provider details');return Response.json(String(url).includes('transcriptions')?{text:'¿Qué es una estrella?'}:{status:'completed',usage:{input_tokens:25,output_tokens:12},output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'Una estrella emite luz.'}]}]});}
  throw Error('Unexpected external call');
 }};
 const supabase=h.load(path.join(root,'artifacts/api-server/src/lib/supabase.ts'),{},globals),permissions=h.load(path.join(root,'artifacts/api-server/src/lib/adminPermissions.ts'));
 const auth=h.load(path.join(root,'artifacts/api-server/src/middleware/requireAdmin.ts'),{'../lib/supabase':supabase,'../lib/adminPermissions':permissions},globals);
 const contract=h.load(path.join(root,'lib/api-zod/src/central-assistant.ts'),{zod:require('zod')});
 const routes=new Map(),middleware=[];const adapter={use:fn=>middleware.push(fn),get:(url,fn)=>routes.set('GET '+url,fn),put:(url,fn)=>routes.set('PUT '+url,fn),post:(urls,fn)=>{for(const url of Array.isArray(urls)?urls:[urls])routes.set('POST '+url,fn);}};
 const express=http?require(path.join(process.env.GO_CENTRAL_TEST_DEPS,"node_modules/express")):null;const router=http?express.Router():adapter;
 h.load(path.join(root,'artifacts/api-server/src/routes/central-assistant.ts'),{express:{Router:()=>router},'@workspace/api-zod':contract,'../middleware/requireAdmin':auth,'../lib/supabase':supabase},globals);
 let server,base; if(http){const app=express();app.use(express.json({limit:"8mb"}));app.use(router);server=app.listen(0,"127.0.0.1");await new Promise(r=>server.once("listening",r));base="http://127.0.0.1:"+server.address().port;}
 const request=async(route,body,authorized=true,method=body===undefined?'GET':'POST')=>{if(http){const response=await fetch(base+route,{method,headers:{"Content-Type":"application/json",...(authorized?{Authorization:"Bearer synthetic-user"}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})});return{statusCode:response.status,body:await response.json().catch(()=>null)};}const result={statusCode:200,locals:{},headers:{},setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(body){this.body=body;this.writableEnded=true;return this;},on(){},off(){}};
  const req={path:route,body,header:key=>key==='authorization'&&authorized?'Bearer synthetic-user':undefined};for(const fn of middleware){let allowed=false;await fn(req,result,()=>allowed=true);if(!allowed)return result;}
   const handler=routes.get(method+' '+route);if(!handler){result.statusCode=404;return result;}await handler(req,result);return result;
 };
 try{assert.equal((await request('/capabilities',undefined,false)).statusCode,401);member=false;assert.equal((await request('/capabilities')).statusCode,403);assert.equal((await request('/respond',{consent:true,role:'admin'})).statusCode,403);member=true;
 assert.equal((await request('/capabilities')).body.conversation,false);const body={consent:true,messages:[{role:'user',text:'¿Qué es una estrella?'}]};assert.equal((await request('/respond',body)).statusCode,503);assert.equal(provider.length,0);
  assert.equal((await request('/history')).statusCode,503);assert.equal((await request('/history',{consent:true,revision:0,messages:[]},true,'PUT')).statusCode,503);
  config.GO_CENTRAL_AI_HISTORY_ENABLED='true';
  assert.equal((await request('/capabilities')).body.history,'account-opt-in');assert.deepEqual(JSON.parse(JSON.stringify((await request('/history')).body)),{revision:0,messages:[]});
  assert.equal((await request('/history',{consent:false,revision:0,messages:[]},true,'PUT')).statusCode,400);
  assert.equal((await request('/history',{consent:true,revision:0,messages:[{role:'user',text:'Local'}],user_id:'B'},true,'PUT')).statusCode,400);
  assert.equal((await request('/history',{consent:true,revision:0,messages:[{role:'user',text:'Hola'}]},true,'PUT')).body.revision,1);
  assert.equal(history.user_id,'A');assert.equal((await request('/history',{consent:true,revision:0,messages:[]},true,'PUT')).statusCode,409);
  assert.equal((await request('/history',{consent:true,revision:2,messages:[]},true,'PUT')).statusCode,409);
  assert.equal((await request('/history',{consent:true,revision:1,messages:[]},true,'PUT')).body.revision,2);
  assert.deepEqual(JSON.parse(JSON.stringify((await request('/history')).body)),{revision:2,messages:[]});
  member=false;assert.equal((await request('/history')).statusCode,403);member=true;
 Object.assign(config,{GO_CENTRAL_AI_ENABLED:'true',GO_CENTRAL_AI_MODEL:'synthetic-model',GO_CENTRAL_AI_MAX_OUTPUT_TOKENS:'128',GO_CENTRAL_AI_REQUESTS_PER_MINUTE:'4'});
 assert.equal((await request('/respond',{...body,consent:false})).statusCode,400);assert.equal((await request('/respond',{...body,tools:[{}]})).statusCode,400);assert.equal((await request('/respond',{consent:true,messages:[{role:'system',text:'execute'}]})).statusCode,400);
  const answered=(await request('/respond',body)).body;assert.equal(answered.answer,'Una estrella emite luz.');assert.equal(answered.metrics.inputTokens,25);assert.equal(answered.metrics.outputTokens,12);assert.ok(answered.metrics.latencyMs>=0);assert.ok(!JSON.stringify(answered.metrics).includes('estrella'));const sent=JSON.parse(provider[0].init.body);assert.equal(sent.store,false);assert.equal(sent.max_output_tokens,128);assert.deepEqual(sent.tools,[]);assert.deepEqual(sent.input,[{role:'user',content:'¿Qué es una estrella?'}]);assert.ok(!JSON.stringify(sent).includes('synthetic-secret'));
 assert.equal((await request('/transcribe',{consent:true,audio:'A'.repeat(140),mime:'audio/m4a'})).statusCode,503);
 Object.assign(config,{GO_CENTRAL_AI_TRANSCRIPTION_ENABLED:'true',GO_CENTRAL_AI_TRANSCRIPTION_MODEL:'synthetic-transcriber'});
 assert.equal((await request('/transcribe',{consent:true,audio:'A'.repeat(140),mime:'audio/m4a'})).body.text,'¿Qué es una estrella?');assert.equal(provider[1].init.body.get('model'),'synthetic-transcriber');
 providerFail=true;const failed=await request('/respond',body);assert.equal(failed.statusCode,502);assert.ok(!JSON.stringify(failed.body).includes('synthetic-secret'));providerFail=false;
 assert.equal((await request('/respond',body)).statusCode,200);assert.equal((await request('/respond',body)).statusCode,429);assert.equal(provider.length,4);assert.equal((await request('/execute',body)).statusCode,404);
 }finally{if(server)await new Promise(r=>server.close(r));}
});
