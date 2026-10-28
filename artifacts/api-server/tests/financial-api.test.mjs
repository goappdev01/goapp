import {test} from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import path from 'node:path';import {pathToFileURL} from 'node:url';
import {fixture,full,A,B,C} from './financial-test-utils.mjs';
const out=path.resolve('../../tmp/financial-api-tests-'+process.pid+'.mjs');await build({entryPoints:['src/routes/financial-plans.ts'],outfile:out,bundle:true,platform:'node',format:'esm',banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
const {default:router}=await import(pathToFileURL(out)),{default:express}=await import('express');
test('financial API: live authentication, explicit plan ACL, validated writes and atomic import use real isolated PostgreSQL RPCs',async()=>{
 const f=await fixture(),old={url:process.env.SUPABASE_URL,key:process.env.SUPABASE_PUBLISHABLE_KEY},realFetch=globalThis.fetch;
 process.env.SUPABASE_URL='https://finance-test.invalid';process.env.SUPABASE_PUBLISHABLE_KEY='SYNTHETIC-PUBLIC-ONLY';
 const app=express();app.use(express.json());app.use('/api/supabase/admin/finance',router);const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));const local='http://127.0.0.1:'+server.address().port+'/api/supabase/admin/finance';
 const actors={owner:A,reader:B,other:C};let calls=[],queue=Promise.resolve(),setupMissing=false;
 globalThis.fetch=async(url,init={})=>{
  if(String(url).startsWith(local))return realFetch(url,init);if(!String(url).startsWith('https://finance-test.invalid'))throw Error('No external services allowed in financial tests');
  const run=async()=>{const target=new URL(url),token=init.headers.Authorization?.replace('Bearer ',''),actor=actors[token];calls.push(target.pathname);
   if(target.pathname==='/auth/v1/user')return actor?Response.json({id:actor,user_metadata:{role:'owner'}}):Response.json({error:'bad token'},{status:401});
   if(target.pathname==='/rest/v1/admin_memberships'){await f.db.exec('reset role');const r=await f.db.query('select * from public.admin_memberships where user_id=$1',[actor]);return Response.json(r.rows);}
   if(setupMissing)return Response.json({code:'PGRST202',message:'SENSITIVE INTERNAL CONFIGURATION'},{status:404});
   const name=target.pathname.split('/').at(-1).replace('finance_','');assert.match(name,/^[a-z_]+$/);await f.user(actor);const args=Object.values(JSON.parse(init.body||'{}'));
   try{return Response.json(await f.rpc(name,args));}catch(e){return Response.json({code:e.code,message:'SENSITIVE SQL DETAILS'},{status:e.code==='42501'?403:400});}
  };const result=queue.then(run,run);queue=result.catch(()=>{});return result;
 };
 async function request(route,method='GET',token='owner',body){return realFetch(local+route,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/vnd.go.finance+json'},...(body===undefined?{}:{body:JSON.stringify(body)})});}
 try{
  assert.equal((await request('/access','GET',null)).status,401);assert.equal((await request('/access','GET','invalid')).status,401);
  assert.equal((await request('/plans','POST','reader',{title:'forged',startYear:2026,role:'owner'})).status,403);
  let response=await request('/plans','POST','owner',{title:'SYNTHETIC PRIVATE PLAN',startYear:2026});assert.equal(response.status,201);let p=await response.json();assert.deepEqual(p.document.markets,[]);
  response=await request('/plans/'+p.id,'PUT','owner',{version:p.version,document:full(),reason:'SYNTHETIC inputs'});assert.equal(response.status,200);p=await response.json();
  assert.equal((await request('/plans/'+p.id,'GET','other')).status,403);assert.deepEqual((await(await request('/access','GET','other')).json()).plans,[]);
  response=await request('/plans/'+p.id+'/grants','PUT','owner',{version:p.version,userId:B,canWrite:false,active:true,reason:'SYNTHETIC explicit read'});assert.equal(response.status,200);p=await response.json();
  const read=await(await request('/plans/'+p.id,'GET','reader')).json();assert.equal(read.canWrite,false);assert.equal((await request('/plans/'+p.id,'PUT','reader',{version:p.version,document:read.document,reason:'forbidden'})).status,403);
  assert.equal((await request('/plans/'+p.id+'/grants','GET','reader')).status,403);assert.equal((await request('/plans/'+p.id+'/grants')).status,200);
  const invalid=structuredClone(p.document);invalid.assumptions[0].penetrationPct=150;const countBefore=calls.length;assert.equal((await request('/plans/'+p.id,'PUT','owner',{version:p.version,document:invalid,reason:'invalid'})).status,400);assert.ok(calls.slice(countBefore).every(c=>!c.includes('/rpc/')));
  assert.equal((await request('/plans/'+p.id,'PUT','owner',{version:1,document:p.document,reason:'stale'})).status,409);
  const results=await(await request('/plans/'+p.id+'/results')).json();assert.equal(results.rows[0].original.revenue,6000);assert.equal(results.rows[0].original.result,6000);assert.equal(results.global[0].amounts.revenue,6000);
  const rows=Array.from({length:220},(_,i)=>({countryCode:'FR',countryName:'Francia',activityId:'synthetic',activityName:'SYNTHETIC ACTIVITY',companies:1000+i,unit:'empresa',referenceYear:1900+i,sourceOrganization:'SYNTHETIC SOURCE',sourceUrl:'https://example.invalid/synthetic',consultedOn:'2026-10-27',updatedOn:'2026-10-27',verification:'NO_VERIFICADO',notes:'SYNTHETIC '.repeat(100)}));
  const body={version:p.version,file:{schemaVersion:'go-finance-market/1',rows}};assert.ok(JSON.stringify(body).length>100*1024);
  response=await request('/plans/'+p.id+'/imports/preview','POST','owner',body);assert.equal(response.status,200);const preview=await response.json();assert.equal(preview.preview.rows,220);assert.equal(preview.sample.length,20);assert.equal((await(await request('/plans/'+p.id)).json()).document.markets.length,1);
  assert.equal((await request('/plans/'+p.id+'/imports/'+preview.previewId+'/apply','POST','owner',{})).status,400);
  response=await request('/plans/'+p.id+'/imports/'+preview.previewId+'/apply','POST','owner',{confirm:true});assert.equal(response.status,200);p=await response.json();assert.equal(p.document.markets.length,221);assert.equal(p.document.assumptions[0].penetrationPct,10);assert.equal(p.document.revenues[0].value,10);
  assert.equal((await(await request('/plans/'+p.id+'/imports')).json()).length,1);assert.ok((await(await request('/plans/'+p.id+'/history')).json()).length>=4);
  response=await request('/plans/'+p.id+'/imports/'+preview.previewId+'/revert','POST','owner',{version:p.version,confirm:true});assert.equal(response.status,200);p=await response.json();assert.equal(p.document.markets.length,1);
  setupMissing=true;response=await request('/access');assert.equal(response.status,503);assert.doesNotMatch(await response.text(),/SENSITIVE|https:|SQL|apikey/);
 }finally{globalThis.fetch=realFetch;if(old.url===undefined)delete process.env.SUPABASE_URL;else process.env.SUPABASE_URL=old.url;if(old.key===undefined)delete process.env.SUPABASE_PUBLISHABLE_KEY;else process.env.SUPABASE_PUBLISHABLE_KEY=old.key;await new Promise(r=>server.close(r));await f.close();}
});
