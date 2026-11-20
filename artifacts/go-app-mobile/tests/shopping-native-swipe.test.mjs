import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const require=createRequire(import.meta.url),{nativePan,contact}=require('./helpers/native-pan.cjs');

test('installed RN PanResponder resets dx on grant; config-only fixtures miss that distance loss',()=>{
 let activation,granted,released;const pan=nativePan().create({onMoveShouldSetPanResponder:(_,g)=>{activation=g.dx;return true;},onPanResponderGrant:(_,g)=>{granted=g.dx;},onPanResponderRelease:(_,g)=>{released=g.dx;}}).panHandlers;
 const finger=contact();pan.onStartShouldSetResponderCapture(finger.event());let event=finger.move(40,1);
 pan.onMoveShouldSetResponderCapture(event);assert.equal(pan.onMoveShouldSetResponder(event),true);pan.onResponderGrant(event);
 event=finger.move(30,1);pan.onResponderMove(event);pan.onResponderRelease(event);
 assert.equal(activation,40);assert.equal(granted,0);assert.equal(released,30);
});

for(const direction of [-1,1])test(`product swipe ${direction}: real RN responder retains total movement across grant and release`,async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Manzanas');ui=await shoppingUI(f,{nativeResponder:true});
  const row=ui.hosts.get('shopping-item-'+item.id),finger=contact();
  await ui.run(()=>{row.onTouchStart();row.onStartShouldSetResponderCapture(finger.event());
   let event=finger.move(direction*40,1);const captured=row.onMoveShouldSetResponderCapture(event);
   assert.ok(captured||row.onMoveShouldSetResponder(event));row.onResponderGrant(event);
   assert.equal(row.onResponderTerminationRequest(event),false,'a recognized horizontal contact is retained');
   event=finger.move(direction*30,1);row.onResponderMove(event);row.onResponderRelease(event);
  });await ui.idle();
  if(direction>0){assert.equal(f.doc().items[0].bought,true);assert.equal(ui.alerts.length,0);}
  else{assert.equal(ui.alerts.at(-1)?.title,'Retirar de esta lista');assert.equal(f.doc().items[0].selected,true);}
 }finally{await ui?.close();f.disk.close();}
});

test('native responder rejects vertical/small movement and editing; cancellation cannot buy or remove',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Leche');ui=await shoppingUI(f,{nativeResponder:true});
  const row=ui.hosts.get('shopping-item-'+item.id);
  for(const [dx,dy] of [[8,60],[12,1]]){
   const finger=contact();await ui.run(()=>{row.onTouchStart();row.onStartShouldSetResponderCapture(finger.event());const event=finger.move(dx,dy);assert.equal(row.onMoveShouldSetResponderCapture(event),false);assert.equal(row.onMoveShouldSetResponder(event),false);});
  }
  const finger=contact();await ui.run(()=>{row.onTouchStart();row.onStartShouldSetResponderCapture(finger.event());let event=finger.move(40,1);assert.equal(row.onMoveShouldSetResponderCapture(event),true);row.onResponderGrant(event);row.onResponderTerminate(event);event=finger.move(40,1);row.onResponderMove(event);row.onResponderRelease(event);});
  assert.equal(f.doc().items[0].bought,false);assert.equal(ui.alerts.length,0);
  await ui.run(()=>{ui.hosts.get('shopping-price-input-'+item.id).onFocus();const inputFinger=contact();row.onStartShouldSetResponderCapture(inputFinger.event());assert.equal(row.onMoveShouldSetResponderCapture(inputFinger.move(75,0)),false);});
  await ui.run(()=>row.onTouchStart());await ui.tap('shopping-bought-'+item.id);assert.equal(f.doc().items[0].bought,true,'new intentional press remains available');
 }finally{await ui?.close();f.disk.close();}
});
