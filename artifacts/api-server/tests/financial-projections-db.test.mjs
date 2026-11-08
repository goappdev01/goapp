import {test} from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {fixture,full,A,B} from './financial-test-utils.mjs';
const out=path.resolve('../../tmp/compatible-finance-'+process.pid+'.mjs');
await build({entryPoints:['../go-app-mobile/data/financialCalculatorTools.ts'],outfile:out,bundle:true,format:'esm',platform:'node'});
const tools=await import(pathToFileURL(out));
test('PostgreSQL isolated: dynamic catalogue and ES/FR base facts persist through deactivation, clearing, reopen and conflicts',async()=>{
 const f=await fixture();try{
  let p=await f.rpc('create_plan',[full()]);
  const old=structuredClone(p.document.markets[0]);
  let d=tools.saveCalculatorActivity(p.document,{name:'Soporte',unit:'empresa',enabled:true});
  const a=d.activities.find(a=>a.name==='Soporte');
  for(const [countryCode,companies] of [['ES',1234],['FR',5678]]){
   d=tools.saveCalculatorMarket(d,{activityId:a.id,countryCode,companies,referenceYear:2026,unit:'empresa',sourceId:'source',updatedOn:'2026-11-08',verification:'NO_VERIFICADO',notes:'SYNTHETIC'});
  }
  d=tools.updateCalculatorDirectCost(d,a.id,'ES','REAL',3);
  p=await f.rpc('save_plan',[p.id,p.version,d,'SYNTHETIC catalogue, facts and cost']);
  d=tools.clearCalculatorSimulation(p.document,['ES'],[a.id],'REAL');
  d=tools.saveCalculatorActivity(d,{...a,enabled:false});
  p=await f.rpc('save_plan',[p.id,p.version,d,'SYNTHETIC inactive without deletion']);
  await f.user(B);await assert.rejects(f.rpc('get_plan',[p.id]),e=>e.code==='42501');
  await f.user(A);const read=await f.rpc('get_plan',[p.id]);
  assert.equal(read.document.markets.find(m=>m.activityId===a.id&&m.countryCode==='FR').companies,5678);
  assert.equal(read.document.markets.find(m=>m.activityId===a.id&&m.countryCode==='ES').companies,1234);
  assert.deepEqual(read.document.markets.find(m=>m.activityId===old.activityId),old);
  assert.equal(read.document.costs.find(c=>c.name===tools.DIRECT_COST_NAME).value,3);
  assert.equal(read.document.activities.find(x=>x.id===a.id).enabled,false);
  const reactivated=tools.saveCalculatorActivity(read.document,{...a,enabled:true});
  p=await f.rpc('save_plan',[p.id,p.version,reactivated,'SYNTHETIC reactivate']);
  assert.equal(p.document.activities.find(x=>x.id===a.id).enabled,true);
  await assert.rejects(f.rpc('save_plan',[p.id,p.version-1,reactivated,'SYNTHETIC stale']),e=>e.code==='PT409');
  assert.equal((await f.rpc('history',[p.id])).length,4);
 }finally{await f.close();}
});
test('PostgreSQL isolated: unsupported typed catalogue cannot be silently discarded by current document contract',async()=>{
 const f=await fixture();try{
  const p=await f.rpc('create_plan',[full()]);
  await assert.rejects(f.rpc('save_plan',[p.id,p.version,{...p.document,projectionItems:[]},'SYNTHETIC unsupported extension']),e=>e.code==='22023');
  const unchanged=await f.rpc('get_plan',[p.id]);assert.equal(unchanged.version,p.version);assert.deepEqual(unchanged.document,p.document);
 }finally{await f.close();}
});
