import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {detailFixture} from './helpers/calendar-detail-lifecycle.mjs';
const require=createRequire(path.join(process.cwd(),'package.json'));
const {touchStream}=require('./tests/helpers/native-pan-responder.cjs');
const source=fs.readFileSync(path.join(path.dirname(require.resolve('react-native/package.json')),'Libraries/Components/ScrollView/ScrollView.js'),'utf8');
function nativeScrollMethod(name,owner){const start=source.indexOf('  '+name+':'),body=source.indexOf('= () => {',start),end=source.indexOf('\n  };',body);assert.ok(start>0&&body>start&&end>body);const arrow=source.slice(body+2,end+4);return Function('return ('+arrow+')').call(owner);}

for(const hand of['left','right'])test(`${hand}: touch-down hands the real native scroll lane to the mounted sheet before RN ScrollView can retain it`,async()=>{
 const f=await detailFixture({handedness:hand});let closes=0;
 try{await f.render({onClose:()=>closes++});const sheet=f.props.get('entry-details-sheet'),scroll=f.props.get('entry-details-scroll');
  assert.equal(scroll.onResponderRelease,undefined);assert.equal(f.props.get('entry-details-gesture-body').onResponderRelease,undefined);
  const scrollOwner={props:{},_isTouching:true,_observedScrollSinceBecomingResponder:true};
  assert.equal(nativeScrollMethod('_handleScrollShouldSetResponder',scrollOwner)(),true);
  assert.equal(nativeScrollMethod('_handleResponderTerminationRequest',scrollOwner)(),false,'installed ScrollView refuses to yield after it begins scrolling: a direct PanResponder-only replay misses this conflict');
  const s=touchStream({x:hand==='right'?380:10,y:600});sheet.onStartShouldSetResponderCapture(s.event());assert.equal(f.nativeScroll.enabled,false,'UIScrollView scrolling is disabled at finger-down, before it can emit the competing scroll event');
  const move=s.event(0,13,40);assert.equal(sheet.onMoveShouldSetResponderCapture(move),true);assert.equal(sheet.onMoveShouldSetResponder(move),true);sheet.onResponderGrant(move);
  await f.settle(()=>{sheet.onResponderMove(s.event(0,55,220));const up=s.event(0,55,10,true);sheet.onResponderRelease(up);sheet.onTouchEndCapture(up);});
  assert.equal(f.props.get('entry-details-modal').visible,false,'the existing Calendar short-panel path now closes the detail on the first 55-point drag');assert.equal(f.nativeScroll.enabled,true);assert.equal(closes,0);await f.nativeDismiss();assert.equal(closes,1);
 }finally{await f.dispose();}
});

for(const hand of['left','right'])test(`${hand}: taps, aborted drags, cancellation and stale events restore scrolling without changing reservation actions`,async()=>{
 const f=await detailFixture({handedness:hand});let time=1000;
 try{await f.render();const pan=f.props.get('entry-details-sheet'),stream=(x=hand==='right'?380:10)=>touchStream({x,y:600,time:time+=1000});
  const tap=stream();pan.onStartShouldSetResponderCapture(tap.event());assert.equal(f.nativeScroll.enabled,false);pan.onTouchEndCapture(tap.event(0,0,100,true));assert.equal(f.nativeScroll.enabled,true);assert.equal(f.props.get('entry-details-modal').visible,true);
  const cancelled=stream();pan.onStartShouldSetResponderCapture(cancelled.event());const stale=cancelled.event(0,30,30,true);pan.onTouchCancelCapture(stale);assert.equal(f.nativeScroll.enabled,true);
  const fresh=stream();pan.onStartShouldSetResponderCapture(fresh.event());pan.onTouchEndCapture(stale);assert.equal(f.nativeScroll.enabled,false,'late end cannot unlock a different contact');pan.onTouchEndCapture(fresh.event(0,30,40,true));assert.equal(f.nativeScroll.enabled,true);
  const center=stream(195);pan.onStartShouldSetResponderCapture(center.event());assert.equal(f.nativeScroll.enabled,true);const move=center.event(0,80);pan.onMoveShouldSetResponderCapture(move);assert.equal(pan.onMoveShouldSetResponder(move),false);
  const multiple=stream(),down=multiple.event();pan.onStartShouldSetResponderCapture(down);assert.equal(f.nativeScroll.enabled,false);down.nativeEvent.touches.push({...down.nativeEvent,identifier:1});pan.onStartShouldSetResponderCapture(down);assert.equal(f.nativeScroll.enabled,true);
  assert.equal(f.props.get('entry-details-modal').visible,true);await f.pressClose();await f.nativeDismiss();
 }finally{await f.dispose();}
});

test('the pre-c138 panel insets are preserved while the overlay is pinned to its actual presenter',async()=>{
 const f=await detailFixture();try{await f.render();const overlay=f.props.get('entry-details-overlay').style;
  assert.equal(overlay.position,'absolute');for(const edge of['top','left','right','bottom'])assert.equal(overlay[edge],0);
  assert.equal(overlay.paddingTop,55);assert.equal(overlay.paddingBottom,42);assert.equal(overlay.paddingHorizontal,8);
  const frame=f.props.get('entry-details-sheet').style[0];assert.equal(frame.flex,1);assert.equal(frame.width,'100%');assert.equal(frame.borderWidth,1.5);assert.equal(frame.borderRadius,18);
  assert.equal(f.props.get('Cerrar detalle').style.width,56);assert.equal(f.props.get('Cerrar detalle').style.height,56);
 }finally{await f.dispose();}
});
