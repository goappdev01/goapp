import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import path from 'node:path';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {React,createRoot,document,rn,evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const business='11111111-1111-4111-8111-111111111111',staff='22222222-2222-4222-8222-222222222222',other='33333333-3333-4333-8333-333333333333',booking='44444444-4444-4444-8444-444444444444';
const entry={id:'one-booking',bookingId:booking,businessId:business,staffId:staff,businessBooking:true,dateISO:'2035-01-08',bookingTimeline:{version:1,timezone:'UTC',workMinutes:30,waitMinutes:30,releasedWaitMinutes:30}};
const response=(from='10:15',to='10:45',staffId=staff)=>({version:1,phasePolicyVersion:1,timezone:'UTC',dateISO:entry.dateISO,resourceValidationRequired:true,releasedCapacity:[{bookingId:booking,phaseId:'wait',staffId,startsAt:`2035-01-08T${from}:00Z`,endsAt:`2035-01-08T${to}:00Z`}]});
async function fixture(){
 const listeners=new Set(),calls=[],props=new Map();let current=response(),failure=false,pending;
 const native=name=>p=>{if(p.testID)props.set(p.testID,p);return React.createElement('div',{'data-native':name},p.children);};
 const api=evaluate('components/booking/BookingPhaseAvailability.tsx',{'react-native':{...rn,View:native('View'),Text:native('Text')},'@/contexts/LanguageContext':{useLanguage:()=>({lang:'es'})},'@/data/booking':{
  isCloudId:value=>/^[0-9a-f-]{36}$/i.test(value??''),subscribeBookingUpdates:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},
  getProfessionalReleasedCapacity:async(...args)=>{calls.push(args);if(pending)return pending;if(failure)throw Error('Old server');return current;},
 }});
 const container=document.createElement('div'),root=createRoot(container);
 const settle=async(fn=()=>{})=>React.act(async()=>{fn();for(let i=0;i<8;i++)await Promise.resolve();});
 const render=async(value=entry,professionalId)=>settle(()=>root.render(React.createElement(api.BookingPhaseAvailability,{entry:value,professionalId})));
 return {container,props,calls,listeners,render,settle,set current(value){current=value;},set failure(value){failure=value;},set pending(value){pending=value;},async refresh(){await settle(()=>listeners.forEach(fn=>fn()));},async close(){await settle(()=>root.unmount());}};
}
test('customer calendar does not request or expose professional capacity',async()=>{
 const f=await fixture();try{await f.render({...entry,businessBooking:false,bookingPerspective:'customer'});assert.equal(f.container.textContent,'');assert.equal(f.calls.length,0);assert.equal(f.listeners.size,0);}finally{await f.close();}
});
test('professional calendar reads canonical remaining capacity and refreshes after a second booking without duplicating the original',async()=>{
 const f=await fixture();try{
  await f.render();assert.match(f.container.textContent,/10:15–10:45/);assert.match(f.container.textContent,/Trabajo \/ espera: 30 \/ 30/);assert.equal(f.props.get('calendar-released-wait-capacity').pointerEvents,'none');assert.deepEqual(f.calls[0],[business,staff,entry.dateISO]);
  f.current=response('10:35','10:45');await f.refresh();assert.match(f.container.textContent,/10:35–10:45/);assert.doesNotMatch(f.container.textContent,/10:15–10:45/);assert.equal(f.listeners.size,1);assert.equal(entry.bookingTimeline.releasedWaitMinutes,30,'projection cannot mutate the accepted original');
  f.current={...response(),releasedCapacity:[]};await f.refresh();assert.match(f.container.textContent,/Sin espera libre restante/);
 }finally{await f.close();}assert.equal(f.listeners.size,0);
});
test('professional selector uses its own capacity and late responses from a previous selection cannot replace it',async()=>{
 const f=await fixture();let resolve;try{
  f.pending=new Promise(done=>resolve=done);await f.render();f.pending=undefined;f.current=response('12:15','12:45',other);await f.render(entry,other);assert.deepEqual(f.calls.at(-1),[business,other,entry.dateISO]);assert.match(f.container.textContent,/12:15–12:45/);
  await f.settle(()=>resolve(response()));assert.match(f.container.textContent,/12:15–12:45/);assert.doesNotMatch(f.container.textContent,/10:15/);
 }finally{await f.close();}
});
test('an unavailable server reports the limitation instead of promising a free phase or changing a booking',async()=>{
 const f=await fixture();try{f.failure=true;await f.render();assert.match(f.container.textContent,/aún no permite comprobar/);assert.doesNotMatch(f.container.textContent,/Profesional libre/);}finally{await f.close();}
});
