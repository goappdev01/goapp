import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),layout=h.load('lib/shoppingScreenLayout.ts');
const style=value=>Object.assign({},...(Array.isArray(value)?value.filter(Boolean):[value]));

test('shortcut reflow uses measured full labels and whole words, without shrinking typography',()=>{
 assert.deepEqual(h.plain(layout.shoppingShortcutLayout(294,{search:140,lists:70,searchWord:80,listWord:38})),{columns:2,searchLines:2,listLines:1});
 assert.deepEqual(h.plain(layout.shoppingShortcutLayout(224,{search:210,lists:120,searchWord:120,listWord:60})),{columns:1,searchLines:2,listLines:1});
 assert.deepEqual(h.plain(layout.shoppingShortcutLayout(500,{search:140,lists:70,searchWord:80,listWord:38})),{columns:2,searchLines:1,listLines:1});
});

for(const hand of ['left','right'])test(`Landing ${hand}: vertical existing navigator shares the lower dock; measured labels retain complete words`,async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false,handedness:hand,width:390,fontScale:1.4});
  const nav=ui.hosts.get('shopping-navigation-frame');assert.equal(nav.width,56);assert.equal(nav.height,120);assert.equal(nav.initialBottom,132);assert.equal(nav.handedness,hand);
  assert.equal(ui.hosts.get('shopping-floating-buttons').style.flexDirection,'column');
  assert.equal(style(ui.hosts.get('shopping-thumb-controls').style).flexDirection,undefined);
  assert.equal(ui.hosts.get('shopping-navigation-row').style[1].minHeight,0,'no extra row elevates the orbits to make room for navigation');
  await ui.run(()=>{for(const [key,width] of Object.entries({search:140,lists:70,searchWord:80,listWord:38}))ui.hosts.get('shopping-label-measure-'+key).onTextLayout({nativeEvent:{lines:[{width}]}});});
  assert.equal(ui.hosts.get('shopping-search-label').children,'Buscar productos');assert.equal(ui.hosts.get('shopping-lists-label').children,'Mis listas');
  assert.equal(ui.hosts.get('shopping-search-label').minimumFontScale,.85);
  await ui.tap('shopping-search-open');assert.equal(ui.hosts.get('shopping-floating-buttons').style.flexDirection,hand==='left'?'row-reverse':'row','product selector retains its existing horizontal navigation');
  await ui.tap('shopping-back');await ui.tap('shopping-manage-lists');assert.ok(ui.hosts.has('shopping-list-create'));
 }finally{await ui?.close();f.disk.close();}
});

test('narrow iPhone keeps one full-width search shortcut above the three fixed actions',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false,width:320,fontScale:1.8});
  await ui.run(()=>{for(const [key,width] of Object.entries({search:210,lists:120,searchWord:120,listWord:60}))ui.hosts.get('shopping-label-measure-'+key).onTextLayout({nativeEvent:{lines:[{width}]}});});
  assert.equal(style(ui.hosts.get('shopping-shortcut-row').style).flexDirection,'row');assert.equal(style(ui.hosts.get('shopping-search-open').style).flexDirection,'row');
  assert.equal(ui.hosts.get('shopping-search-label').children,'Buscar productos');assert.ok(style(ui.hosts.get('shopping-search-open').style).minHeight>=44);
 }finally{await ui?.close();f.disk.close();}
});

test('IA form is compact, near the lower dock, keyboard-aware; command execution and voice start remain connected',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});await ui.tap('shopping-go-orbit-hit');
  assert.equal(ui.hosts.get('shopping-assistant-scroll').contentContainerStyle.justifyContent,'flex-end');
  assert.equal(ui.hosts.get('shopping-assistant-question').style.fontSize,16);assert.equal(ui.hosts.get('shopping-assistant-example').style.fontSize,13);
  assert.equal(style(ui.hosts.get('shopping-command').style).fontSize,14);assert.equal(ui.hosts.get('shopping-assistant-actions').style.flexDirection,'row');
  for(const id of ['shopping-command-send','shopping-voice'])assert.ok(style(ui.hosts.get(id).style).minHeight>=44);
  await ui.run(()=>{ui.hosts.get('shopping-command').onChangeText('Añade 2 botellas de agua');ui.hosts.get('shopping-command').onFocus({target:123});ui.keyboard.show();});
  assert.ok(ui.calls.some(c=>c[0]==='reveal'&&c[1]===123));assert.equal(ui.hosts.get('shopping-back').keyboardVisible,true);
  await ui.tap('shopping-back');assert.equal(ui.hosts.get('shopping-command').value,'Añade 2 botellas de agua');
  await ui.tap('shopping-command-send');assert.equal(f.doc().items[0].quantity,2);await ui.tap('shopping-voice');assert.equal(ui.calls.filter(c=>c[0]==='voice-start').length,1);
  await ui.tap('shopping-list');assert.ok(ui.hosts.has('shopping-list-scroll'));
 }finally{await ui?.close();f.disk.close();}
});

test('long list content is clipped to its real viewport for floating avoidance, preserving the footer',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});await ui.tap('shopping-manage-lists');
  ui.geometry.set('shopping-layout-frame',[0,0,390,844]);ui.geometry.set('shopping-utility-viewport',[0,84,390,560]);
  ui.geometry.set('shopping-lists-content',[12,300,366,1000]);ui.geometry.set('shopping-primary-actions',[12,720,294,68]);ui.geometry.set('shopping-list-viewport',[0,0,0,0]);
  await ui.run(()=>ui.hosts.get('shopping-lists-content').onLayout());
  const rects=ui.hosts.get('shopping-navigation-frame').avoidRects;
  assert.ok(rects.some(r=>r.x===12&&r.y===208&&r.height===344),'offscreen scroll content cannot cover the floating dock in the collision calculation');
  assert.deepEqual(h.plain(layout.clipShoppingContent({x:12,y:300,width:366,height:1000},{x:0,y:84,width:390,height:560})),{x:12,y:300,width:366,height:344});
 }finally{await ui?.close();f.disk.close();}
});

test('short landscape viewport clips the orbital bounds before checking floating collisions',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false,width:844,height:390});
  ui.geometry.set('shopping-layout-frame',[0,0,844,390]);ui.geometry.set('shopping-add-screen',[0,100,844,130]);
  ui.geometry.set('shopping-seven-orbits',[352,100,480,480]);ui.geometry.set('shopping-orbit-home',[352,190,90,90]);ui.geometry.set('shopping-list-viewport',[0,0,0,0]);
  await ui.run(()=>ui.hosts.get('shopping-add-screen').onLayout());
  const rects=ui.hosts.get('shopping-navigation-frame').avoidRects;assert.ok(rects.some(rect=>rect.y===98));assert.ok(rects.every(rect=>rect.y>=8&&rect.y+rect.height<=138),'only the visible circle bands may constrain floating placement');
 }finally{await ui?.close();f.disk.close();}
});

test('Mis listas keeps every list and active indication; compact actions distinguish deletion and preserve drafts',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();for(let i=0;i<10;i++)await f.api().createShoppingList(f.disk.scope,f.disk.active,'Lista '+i);
  ui=await shoppingUI(f,{startList:false});await ui.tap('shopping-manage-lists');
  assert.equal([...ui.hosts.keys()].filter(key=>key.startsWith('shopping-list-select-')).length,11);
  assert.match(ui.container.textContent,/Activa/);assert.equal(ui.hosts.get('shopping-lists-scroll').contentContainerStyle.justifyContent,'flex-end');
  assert.equal(style(ui.hosts.get('shopping-list-name').style).fontSize,14);
  assert.equal(style(ui.hosts.get('shopping-list-delete').style).backgroundColor,'#fff2f2');
  assert.ok(style(ui.hosts.get('shopping-list-create').style).minHeight>=44);
  await ui.run(()=>{ui.hosts.get('shopping-list-name').onChangeText('Borrador conservado');ui.keyboard.show();});await ui.tap('shopping-back');
  assert.equal(ui.hosts.get('shopping-list-name').value,'Borrador conservado');assert.equal(f.disk.rows.length,11);
 }finally{await ui?.close();f.disk.close();}
});

test('supermarket text is proportionate and supports long names without shrinking monetary figures',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const name='Supermercado de pruebas con nombre largo';await f.run({type:'store',value:name});await f.add('Pan',{price:'4,50',store:name});
  ui=await shoppingUI(f);const label=ui.hosts.get('shopping-store-title');assert.equal(label.children,name);assert.equal(label.numberOfLines,2);assert.equal(label.style.fontSize,12);assert.equal(label.style.lineHeight,16);
  assert.equal(ui.hosts.get('shopping-estimate').style.fontSize,15);assert.equal(ui.hosts.get('shopping-estimate').children,'4,50 €');
  assert.equal(ui.hosts.get('shopping-navigation-frame').width,64);assert.equal(ui.hosts.get('shopping-secondary-navigation').style.flexWrap,'wrap');
 }finally{await ui?.close();f.disk.close();}
});
