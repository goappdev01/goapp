import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import vm from 'node:vm';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),ts=require('typescript'),{build}=createRequire(path.resolve('../api-server/package.json'))('esbuild');
const out=path.resolve('../../tmp/projections-'+process.pid+'.mjs');
await build({entryPoints:['../../lib/api-zod/src/index.ts'],outfile:out,bundle:true,format:'esm',platform:'node'});
const model=await import(pathToFileURL(out));
function load(file,modules){const c={exports:{},console,Date,Intl,Math,require:k=>{if(k in modules)return modules[k];throw Error(k);}};vm.runInNewContext(ts.transpileModule(readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,c);return c.exports;}
const calc=load('data/financialRevenueCalculator.ts',{'@workspace/api-zod':model});
const tools=load('data/financialCalculatorTools.ts',{'@workspace/api-zod':model,'./financialRevenueCalculator':calc});
const plain=v=>JSON.parse(JSON.stringify(v));
test('a renamed original never claims another original identity or produces duplicate row keys',()=>{
 const d=model.emptyFinancialDocument();d.activities=[{id:'go_unas',name:'GO Peluquerías',unit:'empresa',enabled:true}];
 const ids=calc.calculatorCatalog(d).activities.map(a=>a.id);
 assert.equal(ids.length,5);assert.equal(new Set(ids).size,5);
});
function base(){let d=model.emptyFinancialDocument('SYNTHETIC',2026);d.countries=[{code:'ES',name:'España',currency:'EUR'},{code:'FR',name:'Francia',currency:'EUR'}];d.sources=[{id:'s',organization:'SYNTHETIC',url:'https://example.invalid',consultedOn:'2026-11-08',verification:'NO_VERIFICADO',notes:''}];return d;}
test('saved dynamic activities join all five originals; disabled records remain editable without revenue rows',()=>{
 let d=tools.saveCalculatorActivity(base(),{name:'Soporte',unit:'empresa',enabled:true});
 const item=d.activities.find(a=>a.name==='Soporte');assert.equal(calc.calculatorCatalog(d).activities.length,6);
 assert.throws(()=>tools.saveCalculatorActivity(d,{name:'  SÓPORTE ',unit:'empresa',enabled:true}));
 d=tools.saveCalculatorActivity(d,{...item,enabled:false});assert.equal(calc.calculatorCatalog(d).activities.length,6);
 assert.ok(!calc.revenueCalculatorRows(d,'REAL').some(r=>r.activityId===item.id));
 d=tools.saveCalculatorActivity(d,{...item,name:'Soporte renovado',enabled:true});
 assert.equal(calc.calculatorCatalog(d).activities.find(a=>a.id===item.id).name,'Soporte renovado');
 assert.equal(d.activities.find(a=>a.id===item.id).id,item.id);
});
test('country base quantities, sources and other scenarios survive filtering, clearing and reactivation',()=>{
 let d=tools.saveCalculatorActivity(base(),{name:'Soporte',unit:'empresa',enabled:true});
 const a=d.activities.find(a=>a.name==='Soporte');
 for(const [countryCode,companies] of [['ES',1000],['FR',2000]])d=tools.saveCalculatorMarket(d,{activityId:a.id,countryCode,companies,referenceYear:2026,unit:'empresa',sourceId:'s',updatedOn:'2026-11-08',verification:'NO_VERIFICADO',notes:'SYNTHETIC'});
 for(const scenario of ['REAL','OPTIMISTA'])d=calc.applyRevenueCalculatorInputs(d,['ES','FR'],[a.id],scenario,{share:10,fee:20});
 d=tools.updateCalculatorDirectCost(d,a.id,'ES','REAL',5);
 const facts=JSON.stringify([d.markets,d.sources,d.costs]),other=JSON.stringify(d.assumptions.filter(a=>a.scenario==='OPTIMISTA'));
 const filtered=tools.selectedCalculatorRows(calc.revenueCalculatorRows(d,'REAL'),['ES'],[a.id]);
 assert.equal(filtered.length,1);assert.equal(calc.revenueCalculatorTotals(filtered).annual,24000);
 d=tools.clearCalculatorSimulation(d,['ES'],[a.id],'REAL');
 assert.equal(JSON.stringify([d.markets,d.sources,d.costs]),facts);assert.equal(JSON.stringify(d.assumptions.filter(a=>a.scenario==='OPTIMISTA')),other);
 const r=calc.revenueCalculatorRows(d,'REAL').filter(r=>r.activityId===a.id);
 assert.equal(r.find(r=>r.countryCode==='FR').annual,48000);assert.equal(r.find(r=>r.countryCode==='ES').market,1000);
 assert.equal(r.find(r=>r.countryCode==='ES').share,null);assert.equal(r.find(r=>r.countryCode==='FR').fee,20);
 assert.throws(()=>tools.clearCalculatorSimulation(d,[],[a.id],'REAL'));
 assert.throws(()=>tools.deleteCalculatorActivity(d,a.id,true));
 assert.deepEqual(plain(model.financialDocumentSchema.parse(d)),plain(d));
});
test('verified base replacement requires explicit confirmation and does not rewrite the source or another year',()=>{
 let d=tools.saveCalculatorActivity(base(),{name:'Soporte',unit:'empresa',enabled:true});const a=d.activities.at(-1);
 const row={activityId:a.id,countryCode:'ES',companies:50,referenceYear:2026,unit:'empresa',sourceId:'s',updatedOn:'2026-11-08',verification:'VERIFICADO',notes:'SYNTHETIC'};
 d=tools.saveCalculatorMarket(d,row);const before=JSON.stringify(d);
 assert.throws(()=>tools.saveCalculatorMarket(d,{...row,companies:100}));assert.equal(JSON.stringify(d),before);
 const next=tools.saveCalculatorMarket(d,{...row,companies:100},true);
 assert.equal(next.markets[0].companies,100);assert.equal(JSON.stringify(next.sources),JSON.stringify(d.sources));
 const prior=tools.saveCalculatorMarket(next,{...row,referenceYear:2025});
 assert.equal(prior.markets.length,2);
});
test('direct costs remain unknown unless supplied, and zero cost is an explicit value through the GO engine',()=>{
 let d=tools.saveCalculatorActivity(base(),{name:'Soporte',unit:'empresa',enabled:true}),a=d.activities.at(-1);
 d=tools.saveCalculatorMarket(d,{activityId:a.id,countryCode:'ES',companies:100,referenceYear:2026,unit:'empresa',sourceId:'s',updatedOn:'2026-11-08',verification:'NO_VERIFICADO',notes:''});
 d=calc.applyRevenueCalculatorInputs(d,['ES'],[a.id],'REAL',{share:10,fee:20});
 const results=()=>tools.calculatorDirectResults(d,calc.revenueCalculatorRows(d,'REAL').filter(r=>r.activityId===a.id&&r.countryCode==='ES'),'REAL')[0];
 assert.equal(results().annualGross,null);
 d=tools.updateCalculatorDirectCost(d,a.id,'ES','REAL',5);assert.equal(results().annualCost,600);assert.equal(results().annualGross,1800);assert.equal(results().margin,75);
 d=tools.updateCalculatorDirectCost(d,a.id,'ES','REAL',0);assert.equal(results().annualCost,0);assert.equal(results().annualGross,2400);
 d=tools.updateCalculatorDirectCost(d,a.id,'ES','REAL',null);assert.equal(results().annualCost,null);assert.equal(results().annualGross,null);
});
test('quantities in different units never become a misleading captured-company total',()=>{
 const rows=[{companies:10,unit:'empresa',annual:null,projection:{year:2026,scenario:'REAL',consolidated:null,baseCurrency:'EUR'}},{companies:5,unit:'otra',annual:null,projection:{year:2026,scenario:'REAL',consolidated:null,baseCurrency:'EUR'}}];
 assert.equal(calc.revenueCalculatorTotals(rows).companies,null);assert.equal(calc.revenueCalculatorTotals(rows).companiesIncomplete,true);
});
test('optional product, service and subscription adapters use existing engine and keep catalogue and scenario inputs separate',()=>{
 const h={countryCode:'ES',year:2026,scenario:'REAL',quantity:10,market:1000,share:10};
 const item={id:'product',name:'SYNTHETIC',kind:'PRODUCTO',enabled:true,cataloguePrice:20,directUnitCost:5,period:'month'};
 const before=JSON.stringify(item),p=model.projectCatalogueItem(item,h);assert.equal(p.annualRevenue,2400);assert.equal(p.annualCost,600);assert.equal(p.annualGross,1800);assert.equal(p.grossMarginPct,75);
 assert.equal(model.projectCatalogueItem({...item,kind:'SERVICIO',period:'year'},h).annualRevenue,200);
 assert.equal(model.projectCatalogueItem({...item,kind:'SUSCRIPCION'},h).annualRevenue,24000);
 assert.equal(model.projectCatalogueItem({...item,kind:'SUSCRIPCION',period:'year'},h).annualRevenue,2000);
 assert.equal(model.projectCatalogueItem(item,{...h,price:30}).annualRevenue,3600);assert.equal(JSON.stringify(item),before);
 assert.equal(model.projectCatalogueItem({...item,directUnitCost:null},h).annualGross,null);
 assert.equal(model.projectCatalogueItem(item,{...h,price:0}).grossMarginPct,null);
 assert.equal(model.projectCatalogueItem({...item,enabled:false},h),null);
 assert.throws(()=>model.projectCatalogueItem(item,{...h,share:101}));
 const legacy=base();assert.ok(model.financialDocumentSchema.safeParse(legacy).success);
 assert.equal('projectionItems' in legacy,false);
});
