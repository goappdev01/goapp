import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {transformSync} from 'esbuild';
import vm from 'node:vm';
const id='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222';
function fixture(){
 const calls=[],routes=new Map(),state={status:200,result:{exceptions:[],timezone:'Europe/Madrid',day:{dateISO:'2030-10-27',staffId:staff,openIntervals:[],closedIntervals:[]}},offline:false};
 const router={};for(const method of ['get','put','delete'])router[method]=(path,handler)=>routes.set(method+':'+path,handler);
 const imports={express:{Router:()=>router},'../lib/supabase':{bearerHeader:auth=>/^Bearer \S+$/.test(auth??'')?{Authorization:auth}:{},supabaseRequest:async(url,init)=>{calls.push({url,init});if(state.offline)throw Error('Offline');return Response.json(state.result,{status:state.status});}}};
 const module={exports:{}};vm.runInNewContext(transformSync(readFileSync('src/routes/bookingCalendar.ts','utf8'),{loader:'ts',format:'cjs'}).code,{module,exports:module.exports,require:name=>imports[name],Date,console});
 const request=(body,query={},authorization='Bearer isolated-owner')=>({body,query,header:key=>key==='authorization'?authorization:undefined});
 const response=()=>({statusCode:200,value:null,status(code){this.statusCode=code;return this;},json(value){this.value=value;return this;},setHeader(){}});
 const run=async(method,body,query={},authorization)=>{const res=response();await routes.get(method+':/booking-calendar-exceptions')(request(body,query,authorization),res);return res;};
 return {calls,state,run,runTimezone:async(body,authorization='Bearer isolated-owner')=>{const res=response();await routes.get('put:/booking-calendar-timezone')(request(body,{},authorization),res);return res;},runLink:async(source,authorization='Bearer isolated-owner')=>{const res=response();await routes.get('get:/booking-calendar-business')(request(null,{source_id:source},authorization),res);return res;}};
}
const command=()=>({business_id:id,staff_id:staff,dateISO:'2030-10-27',intervals:[{kind:'closed',startMinute:540,endMinute:780}],expectedRevision:0,requestId:'isolated-request'});
test('GET/PUT/DELETE forward the original caller JWT and strictly scoped canonical RPC arguments',async()=>{
 const f=fixture();let r=await f.run('get',null,{business_id:id,dateISO:'2030-10-27',staff_id:staff,from_date:'2030-10-01'});assert.equal(r.statusCode,200);
 assert.equal(f.calls[0].init.headers.Authorization,'Bearer isolated-owner');assert.deepEqual(JSON.parse(f.calls[0].init.body),{p_business_id:id,p_date_iso:'2030-10-27',p_staff_id:staff,p_from_date:'2030-10-01'});
 r=await f.run('put',command());assert.equal(r.statusCode,200);const saved=JSON.parse(f.calls[1].init.body);assert.equal(saved.p_delete,false);assert.equal(saved.p_expected_revision,0);assert.equal(saved.p_request_key,'isolated-request');assert.equal(saved.p_staff_id,staff);
 const {intervals,...body}=command();r=await f.run('delete',body);assert.equal(r.statusCode,200);assert.equal(JSON.parse(f.calls[2].init.body).p_delete,true);
});
test('missing authentication never calls the data API',async()=>{
 for(const method of ['get','put','delete']){const f=fixture(),{intervals,...deletion}=command(),r=await f.run(method,method==='put'?command():deletion,{business_id:id,dateISO:'2030-10-27'},'');assert.equal(r.statusCode,401);assert.equal(f.calls.length,0);}
});
test('invalid dates, minutes, duplicates, contradictory ranges and forged authors are rejected before RPC',async()=>{
 const invalid=[{dateISO:'2030-02-31'},{dateISO:'not-a-date'},{business_id:'demo'}, {staff_id:'foreign'}, {createdBy:id},{timezone:'UTC'}, {expectedRevision:-1}, {requestId:''},
  ...[[{kind:'closed',startMinute:10,endMinute:10}],[{kind:'closed',startMinute:1.5,endMinute:50}],[{kind:'closed',startMinute:0,endMinute:1441}],
   [{kind:'closed',startMinute:10,endMinute:40},{kind:'open',startMinute:20,endMinute:30}],
   [{kind:'closed',startMinute:10,endMinute:40},{kind:'closed',startMinute:10,endMinute:40}],
   [{kind:'closed',startMinute:10,endMinute:40,author:id}],[]].map(intervals=>({intervals}))];
 for(const patch of invalid){const f=fixture(),r=await f.run('put',{...command(),...patch});assert.equal(r.statusCode,400,JSON.stringify(patch));assert.equal(f.calls.length,0);}
});
test('uninstalled SQL and an unreachable backend are explicit failures, never simulated persisted success',async()=>{
 for(const code of ['PGRST202','42883','42P01','42703']){const f=fixture();f.state.status=404;f.state.result={code};const r=await f.run('put',command());assert.equal(r.statusCode,501);assert.equal(r.value.code,'BOOKING_CALENDAR_UNAVAILABLE');assert.match(r.value.error,/No se ha guardado/);}
 const f=fixture();f.state.offline=true;assert.equal((await f.run('put',command())).statusCode,503);
});
test('permission, revision, interval and DST errors retain meaningful operation-specific status',async()=>{
 for(const [code,message,status]of [['42501','BOOKING_FORBIDDEN',403],['PT409','BOOKING_CALENDAR_CHANGED',409],['PT422','BOOKING_CALENDAR_OVERLAP',422],['PT422','BOOKING_CALENDAR_AMBIGUOUS_TIME',422]]){const f=fixture();f.state.status=400;f.state.result={code,message};const r=await f.run('put',command());assert.equal(r.statusCode,status);assert.equal(r.value.code,message);assert.ok(r.value.error);}
});

test('a successful HTTP status with an incomplete result never reports a confirmed configuration',async()=>{
 for(const result of [null,{}, {exceptions:[],timezone:'UTC',day:{}}, {exceptions:[],timezone:'UTC',day:{dateISO:'another-date',staffId:staff,openIntervals:[],closedIntervals:[]}}]){const f=fixture();f.state.result=result;const r=await f.run('put',command());assert.equal(r.statusCode,502);assert.equal(r.value.code,'BOOKING_CALENDAR_INVALID_RESPONSE');}
});
test('multiple-professional API validates exact selections, revisions, caller and every returned day',async()=>{
 const other='33333333-3333-4333-8333-333333333333',staff_ids=[staff,other],expectedRevisions={[staff]:0,[other]:2};
 const b={business_id:id,staff_ids,dateISO:'2030-10-27',intervals:command().intervals,expectedRevisions,requestId:'batch'};
 const f=fixture();const day=f.state.result.day;f.state.result={...f.state.result,staffIds:staff_ids,days:[day,{...day,staffId:other}]};
 let r=await f.run('put',b);assert.equal(r.statusCode,200);assert.ok(f.calls[0].url.endsWith('/go_save_booking_calendar_exceptions_batch'));
 assert.deepEqual(JSON.parse(f.calls[0].init.body).p_expected_revisions,expectedRevisions);
 r=await f.run('get',null,{business_id:id,dateISO:b.dateISO,staff_ids:staff_ids.join(',')});assert.equal(r.statusCode,200);
 for(const patch of [{staff_ids:[]},{staff_ids:[staff,staff]},{staff_ids:[staff,'local']},{staff_id:staff},{expectedRevisions:{[staff]:0}},{expectedRevisions:{[staff]:0,[other]:-1}}]){r=await f.run('put',{...b,...patch});assert.equal(r.statusCode,400);}
 f.state.result.days.pop();r=await f.run('put',b);assert.equal(r.statusCode,502,'A partial selection is never a confirmed save');
});

test('calendar company resolution requires a server-owned exact link and rejects incomplete acknowledgements',async()=>{
 const f=fixture(),source='existing-local-company';f.state.result={businessId:id,sourceId:source,name:'María José',timezone:'Europe/Madrid'};
 let r=await f.runLink(source);assert.equal(r.statusCode,200);assert.equal(f.calls[0].init.headers.Authorization,'Bearer isolated-owner');assert.deepEqual(JSON.parse(f.calls[0].init.body),{p_source_id:source});
 assert.equal((await f.runLink(source,'')).statusCode,401);
 f.state.result={businessId:id,sourceId:'someone-else',name:'Another',timezone:'UTC'};assert.equal((await f.runLink(source)).statusCode,502);
 f.state.status=404;f.state.result={code:'PT404',message:'BOOKING_CALENDAR_BUSINESS_NOT_LINKED'};assert.equal((await f.runLink(source)).statusCode,404);
 f.state.result={code:'PGRST202'};assert.equal((await f.runLink(source)).statusCode,501);
});

test('timezone API forwards scoped CAS and distinguishes persistence, permission and committed-reservation protections',async()=>{
 const f=fixture(),command={business_id:id,timezone:'Europe/Madrid',expectedTimezone:'UTC'};f.state.result={businessId:id,timezone:'Europe/Madrid'};let r=await f.runTimezone(command);assert.equal(r.statusCode,200);assert.deepEqual(JSON.parse(f.calls[0].init.body),{p_business_id:id,p_timezone:'Europe/Madrid',p_expected_timezone:'UTC'});f.state.result=null;assert.equal((await f.runTimezone(command)).statusCode,502);f.state.result={businessId:id,timezone:'Europe/Madrid'};
 assert.equal((await f.runTimezone(command,'')).statusCode,401);assert.equal((await f.runTimezone({...command,owner_id:staff})).statusCode,400);assert.equal((await f.runTimezone({...command,timezone:'invalid/timezone'})).statusCode,400);
 f.state.status=409;f.state.result={code:'PT409',message:'BOOKING_TIMEZONE_HAS_COMMITMENTS'};r=await f.runTimezone(command);assert.equal(r.statusCode,409);assert.ok(r.value.error.includes('se conserva'));
 f.state.status=404;f.state.result={code:'PGRST202'};assert.equal((await f.runTimezone(command)).statusCode,501);
});
