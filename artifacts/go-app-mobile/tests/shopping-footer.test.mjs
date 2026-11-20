import test from 'node:test';
import assert from 'node:assert/strict';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';

test('floating avoidance uses measured shortcut/action bounds and leaves the lower navigation lane available',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});
  ui.geometry.set('shopping-layout-frame',[0,20,390,824]);
  ui.geometry.set('shopping-shortcut-row',[12,580,366,44]);
  ui.geometry.set('shopping-thumb-controls',[0,632,390,150]);
  await ui.run(()=>ui.hosts.get('shopping-thumb-controls').onLayout());
  assert.deepEqual(JSON.parse(JSON.stringify(ui.hosts.get('shopping-navigation-frame').avoidRects)),[
   {x:12,y:468,width:366,height:44},{x:0,y:520,width:390,height:74},
  ]);
  assert.equal(ui.hosts.get('shopping-navigation-frame').handedness,'right');
  await ui.render({handedness:'left'});assert.equal(ui.hosts.get('shopping-navigation-frame').handedness,'left');
 }finally{await ui?.close();f.disk.close();}
});

for(const handedness of ['left','right'])for(const width of [320,390,844]){
 test(`shopping footer ${handedness} ${width}: thumb-side order, text-sized buttons and separate floating lane`,async()=>{
  const f=await shoppingFixture();let ui;try{
   ui=await shoppingUI(f,{startList:false,handedness,width,height:width===844?390:844,fontScale:width===320?1.8:1});
   const footer=ui.hosts.get('shopping-thumb-controls');
   assert.equal(footer.style[1].flexDirection,handedness==='left'?'row-reverse':'row');
   assert.equal(footer.style[0].justifyContent,'flex-end');assert.equal(footer.style[0].flexWrap,'wrap');
   assert.equal(footer.style[1].paddingHorizontal,12);assert.equal(footer.style[1].paddingBottom,76);
   for(const id of ['shopping-list','shopping-add']){
    const style=ui.hosts.get(id).style;assert.equal(style.flex,undefined);assert.equal(style.flexShrink,0);
    assert.ok(style.paddingHorizontal>=12);assert.ok(style.minHeight>=44);
   }
   assert.ok(ui.hosts.has('shopping-back'));assert.ok(ui.hosts.has('shopping-close'));
   await ui.tap('shopping-list');await ui.tap('shopping-add');await ui.tap('shopping-orbit-other');await ui.tap('shopping-new-product');
   await ui.input('name','Producto de prueba');await ui.input('quantity','2');await ui.tap('shopping-save');
   assert.equal(f.doc().items[0].quantity,2);
   await ui.render({handedness:handedness==='left'?'right':'left'});
   assert.equal(ui.hosts.get('shopping-thumb-controls').style[1].flexDirection,handedness==='left'?'row':'row-reverse');
  }finally{await ui?.close();f.disk.close();}
 });
}
