import test from 'node:test';
import assert from 'node:assert/strict';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';

test('floating avoidance measures content and actions, leaving the shared auxiliary navigation space available',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});
  ui.geometry.set('shopping-layout-frame',[0,20,390,824]);
  ui.geometry.set('shopping-shortcut-row',[12,580,222,64]);
  ui.geometry.set('shopping-primary-actions',[12,652,366,68]);
  ui.geometry.set('shopping-eight-orbits',[12,200,366,372]);ui.geometry.set('shopping-orbit-home',[248,436,90,90]);ui.geometry.set('shopping-add-screen',[0,180,390,400]);
  ui.geometry.set('shopping-list-viewport',[0,0,0,0]);
  await ui.run(()=>ui.hosts.get('shopping-primary-actions').onLayout({nativeEvent:{layout:{height:68}}}));
  assert.deepEqual(JSON.parse(JSON.stringify(ui.hosts.get('shopping-navigation-frame').avoidRects)),[
   {x:12,y:468,width:222,height:64},{x:12,y:540,width:366,height:68},
   {x:248,y:324,width:90,height:90},{x:12,y:-12,width:366,height:70},
  ]);
  assert.equal(ui.hosts.get('shopping-navigation-frame').initialBottom,132);
  assert.equal(ui.hosts.get('shopping-navigation-frame').handedness,'right');
  await ui.render({handedness:'left'});assert.equal(ui.hosts.get('shopping-navigation-frame').handedness,'left');
 }finally{await ui?.close();f.disk.close();}
});

for(const handedness of ['left','right'])for(const width of [320,390,844]){
 test(`shopping footer ${handedness} ${width}: thumb-side order, text-sized buttons and shared auxiliary navigation`,async()=>{
  const f=await shoppingFixture();let ui;try{
   ui=await shoppingUI(f,{startList:false,handedness,width,height:width===844?390:844,fontScale:width===320?1.8:1});
   const footer=ui.hosts.get('shopping-thumb-controls'),actions=ui.hosts.get('shopping-primary-actions');
   assert.equal(actions.style[1].flexDirection,'row');
   assert.equal(Object.assign({},...actions.style.filter(Boolean)).flexWrap,'nowrap');
   assert.equal(footer.style[0].paddingHorizontal,12);assert.equal(footer.style[0].paddingBottom,4);
   assert.equal(ui.hosts.has('shopping-navigation-space'),false);
   assert.equal(ui.hosts.get('shopping-shortcut-row').style[0].flexWrap,'wrap');
   for(const id of ['shopping-manage-lists','shopping-list']){
    const style=Object.assign({},...ui.hosts.get(id).style.filter(Boolean));assert.equal(style.flex,1);assert.equal(style.flexShrink,1);
    assert.ok(style.paddingHorizontal>=8);assert.ok(style.minHeight>=44);
   }
   assert.ok(ui.hosts.has('shopping-back'));assert.ok(ui.hosts.has('shopping-close'));
   await ui.tap('shopping-list');await ui.tap('shopping-add');await ui.tap('shopping-orbit-home');await ui.tap('shopping-new-product');
   await ui.input('name','Producto de prueba');await ui.input('quantity','2');await ui.tap('shopping-save');
   assert.equal(f.doc().items[0].quantity,2);
   await ui.render({handedness:handedness==='left'?'right':'left'});
   assert.equal(ui.hosts.get('shopping-primary-actions').style[1].flexDirection,handedness==='left'?'row':'row-reverse');
  }finally{await ui?.close();f.disk.close();}
 });
}
