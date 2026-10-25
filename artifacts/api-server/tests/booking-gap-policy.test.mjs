import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import path from 'node:path';
import {renderBookingGapUpgrade} from '../scripts/render-booking-gap-upgrade.mjs';
const ts=createRequire(path.join(process.cwd(),'package.json'))('typescript');
const compile=source=>transformSync(source,{loader:'ts',format:'cjs',target:'node22'}).code;
const plain=value=>JSON.parse(JSON.stringify(value));
const id='11111111-1111-4111-8111-111111111111';
function fixture(version=1){
 const calls=[],state={version,outage:false,phaseVersion:1};
 const upstream={bearerHeader:auth=>/^Bearer \S+$/.test(auth??'')?{Authorization:auth}:{},supabaseRequest:async(url,init)=>{
  calls.push({url,init});
  if(url.endsWith('go_booking_gap_policy_version')){if(state.outage)throw new Error('Offline');return Response.json(state.version);}
  if(url.endsWith('go_booking_phase_policy_version'))return Response.json(state.phaseVersion);
  return Response.json({ok:true});
 }};
 function load(file,imports={}){
  const scope={module:{exports:{}},Response,console,require:name=>name in imports?imports[name]:name==='node:crypto'?createRequire(import.meta.url)(name):(()=>{throw new Error('Unexpected import '+name);})()};
  scope.exports=scope.module.exports;
  vm.runInNewContext(compile(readFileSync(file,'utf8')),scope);return scope.module.exports;
 }
 const policy=load('src/lib/bookingGapPolicy.ts',{'./supabase':upstream});
 function route(file,method,route){
  const routes=new Map(),router={};for(const m of ['get','post','patch','delete','use'])router[m]=(...args)=>routes.set(m+':'+args[0],args.at(-1));
  load('src/routes/'+file+'.ts',{'express':{Router:()=>router},'../lib/supabase':upstream,'../lib/bookingGapPolicy':policy});
  return routes.get(method+':'+route);
 }
 const request=(body={},auth='Bearer isolated-caller')=>({body,query:{},params:{bookingId:id},header:key=>key==='authorization'?auth:undefined});
 const response=()=>({statusCode:200,value:null,status(n){this.statusCode=n;return this;},json(v){this.value=v;return this;},setHeader(){},type(){return this;},send(v){this.value=v;return this;}});
 return {state,calls,policy,route,request,response};
}
test('capability guard passes caller JWT and refuses missing/old/unavailable authority before a write',async()=>{
 for(const version of [1,0,null,{version:1}]){
  const f=fixture(version),res=f.response();let writes=0;
  if(await f.policy.requireBookingGapPolicy(f.request(),res))writes++;
  assert.equal(writes,version===1?1:0);assert.equal(res.statusCode,version===1?200:503);
  assert.equal(f.calls[0].init.headers.Authorization,'Bearer isolated-caller');assert.equal(f.calls[0].init.body,'{}');
 }
 const f=fixture();f.state.outage=true;const res=f.response();assert.equal(await f.policy.requireBookingGapPolicy(f.request(),res),false);assert.equal(res.statusCode,503);
});
test('timeline and catalog creation handlers fail closed on old SQL, without listening on another port',async()=>{
 for(const [file,route,body]of [['bookingTimeline','/bookings/timeline',{business_id:id,service_ids:[id],starts_at:'2035-01-08T10:00:00Z',request_key:'isolated'}],
 ['catalogAssociations','/bookings/catalog',{business_id:id,root_ids:[id],selected_ids:[],starts_at:'2035-01-08T10:00:00Z',request_key:'isolated',expected_quote:{}}]]){
  for(const version of [0,1]){const f=fixture(version),res=f.response();await f.route(file,'post',route)(f.request(body),res);
   assert.equal(res.statusCode,version===1?201:503);assert.equal(f.calls.length,version===1?3:1);
   if(version===1)assert.match(f.calls[2].url,/go_create_(timeline|catalog)_booking$/);
  }
  const f=fixture(),res=f.response();await f.route(file,'post',route)(f.request(body,''),res);assert.equal(res.statusCode,401);assert.equal(f.calls.length,0);
 }
});
test('negotiation requires gap authority for all time-changing decisions, while cancel/reject remain available',async()=>{
 for(const operation of ['propose','counter','accept','confirm','cancel','reject']){
  const f=fixture(0),res=f.response();await f.route('bookingNegotiation','post','/bookings/:bookingId/change')(f.request({operation,expectedRevision:0,dateISO:'2035-01-08',time:'10:00'}),res);
  const cancel=['cancel','reject'].includes(operation);assert.equal(res.statusCode,cancel?200:503);
  assert.equal(f.calls.some(c=>c.url.endsWith('go_negotiate_booking')),cancel);
 }
});
test('existing management validator accepts only explicit boolean/whole-minute authorizations and discards spoofed audit identity',()=>{
 const text=readFileSync('src/routes/management.ts','utf8'),ast=ts.createSourceFile('management.ts',text,ts.ScriptTarget.Latest,true);
 const declarations=ast.statements.filter(n=>ts.isFunctionDeclaration(n)&&['validate','validTimezone'].includes(n.name?.text)||ts.isVariableStatement(n)&&n.declarationList.declarations.some(d=>d.name.getText(ast)==='fields'));
 const scope={module:{exports:{}}};scope.exports=scope.module.exports;vm.runInNewContext(compile(declarations.map(n=>n.getText(ast)).join('\n')+'\nmodule.exports=validate;'),scope);
 const validate=scope.module.exports;
 const policy={allowLastMinuteGaps:true,lastMinuteMinutes:17*60,authorizedBy:'spoofed',authorizedAt:'fake'};
 assert.deepEqual(plain(validate('staff',{ui_metadata:{serviceIds:[id],gapPolicy:policy}},false)),{ui_metadata:{serviceIds:[id],gapPolicy:{allowLastMinuteGaps:true,lastMinuteMinutes:1020}}});
 for(const patch of [{lastMinuteMinutes:0},{lastMinuteMinutes:1.5},{lastMinuteMinutes:525601},{lastMinuteMinutes:'60'},{allowLastMinuteGaps:'true'}])assert.equal(validate('staff',{ui_metadata:{gapPolicy:{...policy,...patch}}},false),null);
});
test('upgrade is one atomic transaction derived from the canonical definitions, with no booking data migration',()=>{
 const sql=renderBookingGapUpgrade();assert.equal((sql.match(/^begin;$/gm)||[]).length,1);assert.equal((sql.match(/^commit;$/gm)||[]).length,1);
 for(const name of ['plan','availability','lock_configuration'])assert.equal((sql.match(new RegExp('create or replace function go_booking_timeline_private\\.'+name+'\\(','g'))||[]).length,1);
 assert.match(sql,/go_booking_timeline_private\.gap_admission\(p_business,p_start,result,p_exclude\)/);
 assert.doesNotMatch(sql,/^\s*(update|delete from|insert into|truncate) public\./im);assert.match(sql,/notify pgrst, 'reload schema'/);
});

test('new phase policy is required before writes; cancellation and rejection still work on an old server',async()=>{
 for(const phaseVersion of [0,null,{version:1}]){
  const f=fixture();f.state.phaseVersion=phaseVersion;const res=f.response();
  assert.equal(await f.policy.requireBookingGapPolicy(f.request(),res),false);assert.equal(res.statusCode,503);assert.equal(res.value.code,'BOOKING_PHASE_POLICY_UNAVAILABLE');assert.equal(f.calls.length,2);
 }
 for(const operation of ['cancel','reject']){const f=fixture(),res=f.response();f.state.phaseVersion=0;await f.route('bookingNegotiation','post','/bookings/:bookingId/change')(f.request({operation,expectedRevision:0}),res);assert.equal(res.statusCode,200);assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/go_negotiate_booking$/);}
});
test('professional capacity route authenticates, forwards only validated IDs and preserves SQL authorization denial',async()=>{
 const f=fixture(),req=f.request();req.query={business_id:id,staff_id:id,dateISO:'2035-01-08'};const res=f.response();
 await f.route('bookingTimeline','get','/booking-professional-capacity')(req,res);assert.equal(res.statusCode,200);assert.equal(f.calls.length,1);assert.match(f.calls[0].url,/go_booking_professional_capacity$/);assert.equal(f.calls[0].init.headers.Authorization,'Bearer isolated-caller');assert.deepEqual(JSON.parse(f.calls[0].init.body),{p_business_id:id,p_staff_id:id,p_date_iso:'2035-01-08'});
 const bad=f.request();bad.query={...req.query,staff_id:'foreign-local-name'};const rejected=f.response();await f.route('bookingTimeline','get','/booking-professional-capacity')(bad,rejected);assert.equal(rejected.statusCode,400);assert.equal(f.calls.length,1);
 const anonymous=f.request({},'');anonymous.query=req.query;const denied=f.response();await f.route('bookingTimeline','get','/booking-professional-capacity')(anonymous,denied);assert.equal(denied.statusCode,401);assert.equal(f.calls.length,1);
});
