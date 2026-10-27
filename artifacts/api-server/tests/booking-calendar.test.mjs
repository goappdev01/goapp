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
 return {calls,state,run};
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