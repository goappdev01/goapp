import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { nestedCalendarFixture } from './helpers/nested-calendar-gestures.mjs';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {evaluate}=require('./tests/helpers/react-lifecycle.cjs');
const {nativePanResponder,touchStream}=require('./tests/helpers/native-pan-responder.cjs');

function fixture(width,hand){
 const responder=nativePanResponder(),ownership=evaluate('lib/calendarGestureOwnership.ts').calendarGestureOwnership;
 const {createCalendarCloseResponder}=evaluate('lib/calendarCloseResponder.ts',{'react-native':{PanResponder:responder},'./calendarGestureOwnership':{calendarGestureOwnership:ownership}});
 let time=1000;
 return(detail=false)=>{const calls=[];let enabled=true;
  const pan=createCalendarCloseResponder({enabled:()=>enabled,width:()=>width,handedness:()=>hand,detail,
   onClose:()=>calls.push('close'),onCollapse:()=>calls.push(detail?'close':'collapse'),onOpenMonth:detail?undefined:()=>calls.push('month')}).panHandlers;
  const stream=(x=hand==='right'?width-10:10,y=450)=>touchStream({x,y,time:time+=1000});
  return{pan,calls,stream,setEnabled:value=>enabled=value};
 };
}
function begin(pan,s,dy=13,dx=0){
 pan.onStartShouldSetResponderCapture(s.event());const e=s.event(dx,dy,40);
 assert.equal(pan.onMoveShouldSetResponderCapture(e),false,'Native capture updates touch history without taking ownership before children');
 const claimed=pan.onMoveShouldSetResponder(e);if(claimed)pan.onResponderGrant(e);return claimed;
}
function finish(f,s,dy,dx=0,duration=600){f.pan.onResponderMove(s.event(dx,dy,duration));const up=s.event(dx,dy,10,true);f.pan.onResponderRelease(up);return up;}

for(const hand of['left','right'])for(const width of[320,375,390,430])test(`${width}/${hand}: installed RN recognizer keeps Calendar activation and maps its short panel close to the detail`,()=>{
 const make=fixture(width,hand);
 for(const duration of[80,600,1200])for(const dy of[13,50,51,139,140,141,160]){
  const results=[];
  for(const detail of[false,true]){const f=make(detail),s=f.stream();assert.equal(begin(f.pan,s),true,'one normal vertical move activates both responders');finish(f,s,dy,0,duration);results.push(f.calls.includes('close'));}
  assert.deepEqual(results,[dy>140,dy>50],`same existing Calendar close rule at distance ${dy}, duration ${duration}`);
 }
 for(const detail of[false,true])for(const[dy,dx]of[[12,0],[13,13],[13,20]]){const f=make(detail);assert.equal(begin(f.pan,f.stream(),dy,dx),false);assert.deepEqual(f.calls,[]);}
});

for(const hand of['left','right'])test(`${hand}: a normal curved close needs no extra final angle or velocity test`,()=>{
 const make=fixture(390,hand);
 for(const detail of[false,true])for(const duration of[100,900]){const f=make(detail),s=f.stream();assert.equal(begin(f.pan,s),true);
  // Both began vertical inside the lane. Finger drift after grant is not an additional veto in Calendar.
  finish(f,s,160,hand==='right'?-170:170,duration);assert.deepEqual(f.calls,['close']);
 }
});

for(const hand of['left','right'])test(`${hand}: native central scroll, abort, stale release, multitouch and a fresh attempt do not close accidentally`,()=>{
 const make=fixture(390,hand),f=make(true),center=f.stream(195);f.pan.onStartShouldSetResponderCapture(center.event());
 const across=center.event(hand==='right'?185:-185,200,600);f.pan.onMoveShouldSetResponderCapture(across);assert.equal(f.pan.onMoveShouldSetResponder(across),false);
 const short=f.stream();assert.equal(begin(f.pan,short),true);finish(f,short,40);assert.deepEqual(f.calls,[]);
 const aborted=f.stream();assert.equal(begin(f.pan,aborted),true);const stale=aborted.event(0,80);f.pan.onResponderTerminate(stale);f.pan.onResponderRelease(aborted.event(0,200,10,true));assert.deepEqual(f.calls,[]);
 const fresh=f.stream();assert.equal(begin(f.pan,fresh),true);f.pan.onResponderTerminate(stale);f.pan.onResponderRelease(stale);finish(f,fresh,145);assert.deepEqual(f.calls,['close']);
 const multi=f.stream(),down=multi.event();down.nativeEvent.touches.push({...down.nativeEvent,identifier:1});f.pan.onStartShouldSetResponderCapture(down);
 const move=multi.event(0,160);f.pan.onMoveShouldSetResponderCapture(move);assert.equal(f.pan.onMoveShouldSetResponder(move),false);
});

for(const hand of['left','right'])test(`${hand}: a failed gesture followed by one valid native drag closes only the detail; the next Calendar touch remains usable`,async()=>{
 const f=await nestedCalendarFixture({hand});
 try{for(let cycle=0;cycle<10;cycle++){
  await f.open();await f.releaseDetail(f.stream(),40);assert.equal(f.detail.props.get('entry-details-modal').visible,true);
  const result=await f.releaseDetail(f.stream(),145,400);assert.equal(result.claimed,true);assert.equal(f.detail.props.get('entry-details-modal').visible,false);
  assert.equal((await f.releaseDetail(f.stream(),180)).claimed,false);f.calendarPan.onResponderRelease(result.up);assert.equal(f.calendarOpenRef.current,true);
  await f.acknowledge();f.calendarPan.onResponderRelease(result.up);assert.equal(f.calendarOpenRef.current,true);
  const s=f.stream(380),pan=f.calendarPan;assert.equal(begin(pan,s),true);pan.onResponderMove(s.event(0,70,200));pan.onResponderRelease(s.event(0,70,10,true));assert.equal(f.calendarOpenRef.current,true);assert.equal(f.counters.collapsed,cycle+1,'Calendar responds to a new shorter independent gesture');
  const close=f.stream(380);assert.equal(begin(pan,close),true);pan.onResponderMove(close.event(0,160,400));pan.onResponderRelease(close.event(0,160,10,true));f.refreshRoot();assert.equal(f.calendarOpenRef.current,false);assert.equal(f.root.enabled,true);await f.reopenCalendar();
 }assert.equal(f.counters.detailCloses,10);assert.equal(f.counters.calendarCloses,10);assert.equal(f.counters.globalCloses,0);}
 finally{await f.dispose();}
});
