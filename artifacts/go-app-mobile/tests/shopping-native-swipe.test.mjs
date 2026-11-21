import test from 'node:test';import assert from 'node:assert/strict';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const pan=(ui,id)=>ui.gestures.get('shopping-item-'+id+'-swipe').pan;
async function swipe(ui,id,dx,success=true){await ui.run(()=>{const g=pan(ui,id);g.onBeginHandler();g.onStartHandler();g.onUpdateHandler({translationX:dx});g.onEndHandler({translationX:dx,velocityX:0},success);g.onFinalizeHandler({},success);});await ui.idle();}

for(const handedness of ['left','right'])test(`shared native Listados gesture: purchase, residual press, new touch and confirmed removal (${handedness})`,async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Manzanas');ui=await shoppingUI(f,{handedness});
  const combined=ui.gestures.get('shopping-item-'+item.id+'-swipe');assert.equal(combined.native.native,true);
  assert.deepEqual(Array.from(combined.pan.activeOffsetXValue),[-8,8]);assert.deepEqual(Array.from(combined.pan.failOffsetYValue),[-15,15]);assert.equal(combined.pan.cancelsTouchesInViewValue,true);
  await swipe(ui,item.id,70);assert.equal(f.doc().items[0].bought,true);
  assert.equal(ui.hosts.get('shopping-bought-'+item.id).accessibilityState.checked,true);
  await ui.tap('shopping-bought-'+item.id);await ui.tap('shopping-edit-'+item.id);assert.equal(f.doc().items[0].bought,true);assert.equal(ui.hosts.has('shopping-field-name'),false,'swipe release never opens editor');
  await ui.run(()=>pan(ui,item.id).onBeginHandler());await ui.tap('shopping-bought-'+item.id);assert.equal(f.doc().items[0].bought,false);
  await swipe(ui,item.id,-70);assert.equal(ui.alerts.at(-1).title,'Retirar de esta lista');assert.equal(f.doc().items[0].selected,true);
  await ui.run(()=>ui.alerts.at(-1).buttons.find(b=>b.style==='cancel').onPress?.());assert.equal(f.doc().items[0].selected,true);
  await swipe(ui,item.id,-70);await ui.run(()=>ui.alerts.at(-1).buttons.find(b=>b.text==='RETIRAR').onPress());await ui.idle();
  assert.equal(f.doc().items[0].selected,false);assert.equal(f.doc().items.length,1,'catalog and history are retained');
  assert.ok(ui.calls.some(c=>c[0]==='animate'&&c[1].useNativeDriver===true));
 }finally{await ui?.close();f.disk.close();}
});

test('shared gesture cancellation, small drags and active price/quantity editing do not buy or remove',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Leche');ui=await shoppingUI(f);
  await swipe(ui,item.id,12);await swipe(ui,item.id,-90,false);
  assert.equal(f.doc().items[0].bought,false);assert.equal(ui.alerts.length,0);
  for(const field of ['price-input','quantity']){
   await ui.run(()=>ui.hosts.get('shopping-'+field+'-'+item.id).onFocus());assert.equal(pan(ui,item.id).enabledValue,false);
   await ui.run(()=>ui.hosts.get('shopping-'+field+'-'+item.id).onEndEditing());await ui.idle();assert.equal(pan(ui,item.id).enabledValue,true);
  }
  await ui.run(()=>pan(ui,item.id).onBeginHandler());await ui.tap('shopping-details-'+item.id);assert.ok(ui.hosts.has('shopping-field-name'),'a new tap retains normal editing');
 }finally{await ui?.close();f.disk.close();}
});
