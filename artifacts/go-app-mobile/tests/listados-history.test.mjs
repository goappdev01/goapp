import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const require=createRequire(import.meta.url),f=require('./helpers/listados-fixture.cjs');
const {listHistoryBucket:bucket}=f.history;
const now=Date.parse('2030-11-06T12:00:00Z'),day=86400000;
const booking={id:'one-source',type:'GO_RESERVA',bookingServerStatus:'CONFIRMED',startDatetime:'2030-10-27T00:30:00Z',endDatetime:'2030-10-27T02:00:00Z'};
const done={status:'done',at:Date.parse('2030-10-27T02:01:00Z')};
test('explicit completion uses the full real zoned end, never the scheduled start or elapsed time alone',()=>{
 const before=JSON.stringify(booking);
 assert.equal(bucket(booking,undefined,now),'current');
 assert.equal(bucket(booking,{status:'pending',at:now},now),'current');
 assert.equal(bucket(booking,done,now),'old');
 assert.equal(bucket({...booking,endDatetime:'2030-11-06T13:00:00Z'},done,now),'current');
 assert.equal(bucket({...booking,localResolutionStatus:'pending'},done,now),'current');
 assert.equal(JSON.stringify(booking),before,'visibility never changes shared state or data');
});
for(const status of ['COMPLETED','CANCELLED','REJECTED','NO_SHOW'])test('terminal booking '+status+' enters ANTIGUAS, not voluntary archive',()=>{
 assert.equal(bucket({...booking,bookingServerStatus:status},undefined,now),'old');
});
test('90-day boundary and configurable interval hide without deletion, including DST offset and late confirmation',()=>{
 const end=Date.parse(booking.endDatetime),row=Object.freeze({...booking,bookingServerStatus:'COMPLETED'});
 assert.equal(bucket(row,undefined,end+90*day-1),'old');
 assert.equal(bucket(row,undefined,end+90*day),'hidden');
 assert.equal(bucket(row,undefined,end+90*day,180),'old');
 assert.equal(bucket(row,{status:'done',at:end+89*day},end+90*day),'old');
 assert.equal(bucket({...row,startDatetime:'2030-10-27T02:30:00+02:00',endDatetime:'2030-10-27T03:00:00+01:00'},undefined,end+90*day),'hidden');
 assert.equal(row.id,'one-source');assert.equal(row.bookingServerStatus,'COMPLETED');
});
test('a trusted zoned snapshot resolves a legacy wall-clock projection, while invalid decision time stays visible',()=>{
 const row={...booking,bookingServerStatus:'COMPLETED',startDatetime:'2030-10-27T02:30:00',endDatetime:'2030-10-27T03:00:00',bookingTimeline:{startsAt:'2030-10-27T00:30:00Z',endsAt:'2030-10-27T02:00:00Z'}};
 assert.equal(bucket(row,undefined,now),'old');assert.equal(bucket(row,{status:'done',at:NaN},now),'current');assert.equal(bucket(row,done,NaN),'current');
});
for(const row of [
 {...booking,startDatetime:undefined,endDatetime:undefined,dateISO:'2026-11-02',time:'09:00',duration:'30 min'},
 {...booking,startDatetime:'invalid',endDatetime:'invalid'},
 {...booking,startDatetime:'2030-10-27T10:00:00',endDatetime:'2030-10-27T10:30:00'},
 {id:'undated',type:'TAREA_INTERNA',notes:'Keep me',estado:'aceptado'},
])test('ambiguous completed data stays visible: '+JSON.stringify(row),()=>{
 assert.equal(bucket(row,done,now+500*day),'current');
});
test('overdue pending, active proposals, manual archive and completed personal tasks remain distinct',()=>{
 const task={id:'task',type:'TAREA_INTERNA',dateISO:'2030-11-01',time:'10:00',duration:'30 min',estado:'pendiente'};
 assert.equal(bucket(task,undefined,now),'current');assert.equal(bucket(task,{status:'pending',at:now},now),'current');
 assert.equal(bucket(task,{status:'done',at:now-1},now),'old');
 assert.equal(bucket({...booking,changeProposal:{date:'2030-11-10'}},done,now),'current');
 const archived=f.notes.buildNoteEntry({...f.notes.noteDraft(),content:'Personal archive',destination:'archive'},{userId:'one',context:'live:USER'});
 assert.equal(bucket(archived,done,now+500*day),'archive');
});

test('retention preference survives remount and separates users, companies and failed writes',async()=>{
 const {React,createRoot,document}=require('./helpers/react-lifecycle.cjs');
 const dir=mkdtempSync(path.join(os.tmpdir(),'go-list-history-'));
 let fail=false;
 const file=key=>path.join(dir,encodeURIComponent(key));
 const storage={getItem:async key=>{try{return readFileSync(file(key),'utf8');}catch{return null;}},setItem:async(key,value)=>{if(fail)throw Error('disk unavailable');writeFileSync(file(key),value);}};
 const {useListadosHistory}=f.load('hooks/useListadosHistory.ts',{'react':React,'@react-native-async-storage/async-storage':storage,'@/lib/listadosHistory':f.history});
 let api,scope={userId:'user-a',context:'live:BUSINESS:a'};
 const container=document.createElement('div');let root=createRoot(container);
 function Probe(){api=useListadosHistory(scope);return null;}
 const render=async()=>React.act(async()=>{root.render(React.createElement(Probe));await Promise.resolve();});
 try{
  await render();assert.equal(api.days,90);
  await React.act(async()=>api.save(180));assert.equal(api.days,180);
  await React.act(()=>root.unmount());root=createRoot(container);await render();assert.equal(api.days,180);
  scope={userId:'user-a',context:'live:BUSINESS:b'};await render();assert.equal(api.days,90);
  await React.act(async()=>api.save(30));assert.equal(api.days,30);
  scope={userId:'user-b',context:'live:BUSINESS:a'};await render();assert.equal(api.days,90);
  scope={userId:'user-a',context:'live:BUSINESS:a'};await render();assert.equal(api.days,180);
  fail=true;await React.act(async()=>api.save(365));assert.equal(api.days,180);assert.ok(api.error);
 }finally{await React.act(()=>root.unmount());rmSync(dir,{recursive:true,force:true});}
});
