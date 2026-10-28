import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
let pg;try{pg=createRequire(import.meta.url)('@electric-sql/pglite');}catch{pg=createRequire(path.resolve('../../tmp/financial-pg-tests/package.json'))('@electric-sql/pglite');}const {PGlite}=pg;
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222',C='33333333-3333-4333-8333-333333333333';
const blank=()=>({schemaVersion:1,title:'SYNTHETIC TEST PLAN',baseCurrency:'EUR',startYear:2026,horizon:5,activities:[],countries:[],sources:[],markets:[],assumptions:[],revenues:[],costs:[],fxRates:[]});
function full(){return{...blank(),activities:[{id:'synthetic',name:'SYNTHETIC ACTIVITY',unit:'empresa',enabled:true}],countries:[{code:'ES',name:'España',currency:'EUR'},{code:'FR',name:'Francia',currency:'EUR'}],sources:[{id:'source',organization:'SYNTHETIC SOURCE',url:'https://example.invalid/synthetic',consultedOn:'2026-10-27',verification:'NO_VERIFICADO',notes:'SYNTHETIC ONLY'}],markets:[{activityId:'synthetic',countryCode:'ES',referenceYear:2026,companies:1000,unit:'empresa',sourceId:'source',updatedOn:'2026-10-27',verification:'NO_VERIFICADO',notes:'SYNTHETIC ONLY'}],assumptions:[{id:'hyp',activityId:'synthetic',countryCode:'ES',scenario:'REAL',selected:true,startYear:2026,openingCompanies:0,penetrationPct:10,annualGrowthPct:0,marketGrowthPct:0,churnPct:0,newCompanies:null,retainedCompanies:null,marketCompanies:null,operationsPerCompanyMonth:null,averageTicket:null,acquisitionTiming:'uniform',costsConfirmed:true,years:[]}],revenues:[{id:'fee',assumptionId:'hyp',year:0,name:'SYNTHETIC FEE',kind:'monthly',value:10}],costs:[],fxRates:[]};}
async function fixture(){const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;
create table public.admin_memberships(user_id uuid primary key,level text,permissions text[],active boolean);
insert into public.admin_memberships values('${A}','owner','{}',true),('${B}','technical','{admin.access}',true),('${C}','technical','{admin.access}',true);`);
 try { await db.exec(await readFile('supabase/drafts/financial_plans.sql','utf8')); } catch(error) { await db.close(); const safe=new Error("Financial schema: "+error.message+" at "+error.position); safe.code=error.code; throw safe; }
 async function user(id){await db.exec('reset role;set role authenticated;');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]);}
 async function rpc(name,args=[]){const {rows}=await db.query('select public.finance_'+name+'('+args.map((_,i)=>'$'+(i+1)).join(',')+') as value',args.map(v=>typeof v==='object'?JSON.stringify(v):v));return rows[0].value;}
 await user(A);return{db,user,rpc,async close(){await db.close();}};}


export {fixture,full,blank,A,B,C};
