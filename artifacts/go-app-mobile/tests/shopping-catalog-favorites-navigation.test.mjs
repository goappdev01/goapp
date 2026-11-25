import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs');
const enter=async(ui,orbit,label)=>{await ui.tap('shopping-orbit-'+orbit+'-hit');if(label){const group=[...ui.hosts].find(([id,p])=>id.startsWith('shopping-subgroup-')&&p.accessibilityLabel===label);assert.ok(group,'subcategory '+label);await ui.tap(group[0]);}};
const row='shopping-catalog-bakery-Pan común';

test('catalog star creates one unselected favorite and never changes a prepared checkbox, even when it gains a canonical id',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery','Panadería y repostería');await ui.tap(row);assert.equal(ui.hosts.get(row).accessibilityState.checked,true);assert.equal(f.doc().items.length,0);
  const star=ui.hosts.get(row+'-favorite');await ui.run(()=>{star.onPress();star.onPress();});await ui.idle();const item=f.doc().items[0];assert.equal(f.doc().items.length,1);assert.equal(item.favorite,true);assert.equal(item.selected,false);assert.equal(item.bought,false);assert.equal(ui.hosts.get(row).accessibilityState.checked,true);assert.equal(ui.hosts.get(row+'-favorite').accessibilityState.checked,true);assert.equal(ui.hosts.get('shopping-catalog-save').disabled,false);
  await ui.tap(row+'-favorite');assert.equal(f.doc().items[0].favorite,false);assert.equal(ui.hosts.get(row).accessibilityState.checked,true);
  await ui.tap(row);assert.equal(ui.hosts.get(row).accessibilityState.checked,false);assert.equal(ui.hosts.get('shopping-catalog-save').disabled,true);assert.equal(f.doc().items[0].selected,false);
  await ui.tap(row+'-favorite');assert.equal(f.doc().items[0].favorite,true);assert.equal(ui.hosts.get(row).accessibilityState.checked,false);assert.equal(ui.hosts.get('shopping-catalog-save').disabled,true);
 }finally{await ui?.close();f.disk.close();}
});

test('star remains enabled for an in-list product and preserves quantity, prices, bought state and history',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Pan común',{category:'bakery',quantity:'3'});await f.run({type:'price',id:item.id,value:1.75,unit:item.unit,observationId:'bread-price'});await f.run({type:'bought',id:item.id,value:true});const before=h.plain(f.doc().items[0]);
  ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery','Panadería y repostería');assert.equal(ui.hosts.get(row).disabled,true);assert.equal(ui.hosts.get(row+'-favorite').disabled,false);await ui.tap(row+'-favorite');
  const after=h.plain(f.doc().items[0]);assert.equal(after.favorite,true);delete before.favorite;delete after.favorite;assert.deepEqual(after,before);assert.equal(f.doc().items.length,1);
  await ui.tap('shopping-back');await ui.tap('shopping-back');await ui.tap('shopping-list');assert.equal(ui.hosts.get('shopping-favorite-'+item.id).accessibilityState.checked,true);
 }finally{await ui?.close();f.disk.close();}
});

test('favorite state persists on reopen and is shared by search rows, category rows and the existing Favorites view',async()=>{
 const f=await shoppingFixture();let ui;try{
  const original=await f.open();ui=await shoppingUI(f,{startList:false});await enter(ui,'produce','Frutas');const id='shopping-catalog-produce-Manzanas';await ui.tap(id+'-favorite');const item=f.doc().items[0];assert.equal(item.selected,false);await ui.close();ui=null;await f.disk.reopen();assert.equal((await f.open()).id,original.id);
  ui=await shoppingUI(f,{startList:false});await enter(ui,'favorites');assert.ok(ui.hosts.has('shopping-favorite-item-'+item.id));assert.equal(ui.hosts.get('shopping-favorite-item-'+item.id+'-favorite').accessibilityState.checked,true);await ui.tap('shopping-back');await ui.tap('shopping-search-open');await ui.run(()=>ui.hosts.get('shopping-product-search').onChangeText('manzanas'));await ui.idle();
  assert.equal(ui.hosts.get(id+'-favorite').accessibilityState.checked,true);assert.equal(ui.hosts.get('shopping-saved-'+item.id+'-favorite').accessibilityState.checked,true);await ui.tap(id+'-favorite');assert.equal(ui.hosts.get('shopping-saved-'+item.id+'-favorite').accessibilityState.checked,false);assert.equal(f.doc().items.length,1);assert.equal(f.doc().items[0].selected,false);
  await ui.tap('shopping-back');await enter(ui,'produce','Frutas');assert.equal(ui.hosts.get(id+'-favorite').accessibilityState.checked,false);
 }finally{await ui?.close();f.disk.close();}
});

test('custom product favorite reuses the existing source import, preserves presentation and leaves source selection intact',async()=>{
 const f=await shoppingFixture();let ui;try{
  const source=await f.open(),item=await f.add('Pan propio',{category:'bakery',brand:'Casa',format:'Barra',quantity:'3',customCatalog:true,catalogOnly:true});await f.run({type:'price',id:item.id,value:2.5,unit:item.unit,observationId:'personal-price'});const sourceBefore=JSON.stringify(f.disk.rows.find(r=>r.id===source.id));const target=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Otra');
  ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery');const custom='shopping-custom-choice-'+item.id;await ui.tap(custom+'-favorite');const saved=f.doc().items[0];assert.equal(saved.id,item.id);assert.equal(saved.favorite,true);assert.equal(saved.selected,false);assert.equal(saved.quantity,3);assert.equal(saved.prices[0].price,2.5);assert.equal(JSON.stringify(f.disk.rows.find(r=>r.id===source.id)),sourceBefore);
  await ui.tap(custom);await ui.tap('shopping-catalog-save');assert.ok(ui.hosts.has('shopping-seven-orbits'));assert.equal(f.doc().items.length,1);assert.equal(f.doc().items[0].selected,true);assert.equal((await f.open()).id,target.id);
 }finally{await ui?.close();f.disk.close();}
});

test('favorite import cannot read or change another context or account',async()=>{
 const f=await shoppingFixture();try{
  const own=await f.open(),foreignContext=await f.open({...f.disk.scope,context:'live:ADMIN'},()=>true),before=JSON.stringify(f.disk.rows);
  await assert.rejects(()=>f.api().runShoppingOperation(f.disk.scope,f.disk.active,{type:'favorite',operationId:f.model.shoppingId(),product:{sourceListId:foreignContext.id,id:'not-owned',name:'Ajeno',category:'bakery'},value:true},own.id),/cuenta o contexto/);assert.equal(JSON.stringify(f.disk.rows),before);
  await f.disk.setUser('other-user');const foreign=await f.open({...f.disk.scope,userId:'other-user'},()=>true);await f.disk.setUser(f.disk.scope.userId);const others=JSON.stringify(f.disk.rows);
  await assert.rejects(()=>f.api().runShoppingOperation(f.disk.scope,f.disk.active,{type:'favorite',operationId:f.model.shoppingId(),product:{sourceListId:foreign.id,id:'other-item',name:'Ajeno',category:'bakery'},value:true},own.id),/cuenta o contexto/);assert.equal(JSON.stringify(f.disk.rows),others);
 }finally{f.disk.close();}
});

test('one batch save returns only to Landing, ignores repeated/stale presses and can immediately continue in another category',async()=>{
 const f=await shoppingFixture();let ui;try{
  const original=await f.open(),target=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Viaje');ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery','Panadería y repostería');await ui.tap(row);await ui.tap('shopping-catalog-bakery-Baguette');const save=ui.hosts.get('shopping-catalog-save');
  await ui.run(()=>{save.onPress();save.onPress();});await ui.idle();assert.ok(ui.hosts.has('shopping-seven-orbits'));assert.equal(ui.hosts.has('shopping-catalog-save'),false);assert.equal(ui.hosts.has('shopping-add'),false);assert.match(ui.container.textContent,/Selección guardada en «Viaje»/);assert.equal(f.doc().items.length,2);assert.equal(f.doc().operations.length,1);
  await ui.run(()=>save.onPress());await ui.idle();assert.equal(f.doc().operations.length,1);assert.equal((await f.open()).id,target.id);assert.equal(f.disk.rows.find(r=>r.id===original.id).note.shopping.items.length,0);
  await enter(ui,'produce','Frutas');await ui.tap('shopping-catalog-produce-Manzanas');await ui.tap('shopping-catalog-save');assert.ok(ui.hosts.has('shopping-seven-orbits'));assert.equal(f.doc().items.length,3);await ui.tap('shopping-list');assert.ok(ui.hosts.has('shopping-item-'+f.doc().items[0].id));
 }finally{await ui?.close();f.disk.close();}
});
for(const failure of ['write','read'])test('failed '+failure+' keeps the category and selection, then verifies retry before returning to Landing',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery','Panadería y repostería');await ui.tap(row);const fail=failure==='write'?f.disk.failWrite:f.disk.failRead;fail(true);await ui.tap('shopping-catalog-save');assert.ok(ui.hosts.has('shopping-error'));assert.ok(ui.hosts.has(row));assert.equal(ui.hosts.has('shopping-seven-orbits'),false);assert.equal(ui.hosts.get(row).accessibilityState.checked,true);assert.equal(ui.hosts.get('shopping-catalog-save').disabled,false);fail(false);
  await ui.tap('shopping-catalog-save');assert.ok(ui.hosts.has('shopping-seven-orbits'));assert.equal(f.doc().items.length,1);assert.equal(f.doc().operations.length,1);await ui.close();ui=null;await f.disk.reopen();assert.equal((await f.open()).note.shopping.items.length,1);
 }finally{await ui?.close();f.disk.close();}
});

test('selected subgroup heading is shown once including frozen fish, and search retains distinct group context',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});for(const [orbit,title] of [['protein','Pescado y marisco · Congelados'],['bakery','Panadería y repostería'],['produce','Frutas']]){await enter(ui,orbit,title);assert.equal(ui.hosts.get('shopping-catalog-heading').children,title);assert.equal(ui.container.textContent.split(title).length-1,1);assert.equal([...ui.hosts.keys()].some(id=>id.startsWith('shopping-catalog-group-heading-')),false);await ui.tap('shopping-back');await ui.tap('shopping-back');}
  await ui.tap('shopping-search-open');await ui.run(()=>ui.hosts.get('shopping-product-search').onChangeText('merluza'));await ui.idle();assert.ok([...ui.hosts.keys()].some(id=>id.startsWith('shopping-catalog-group-heading-')));assert.equal(ui.hosts.get('shopping-catalog-heading').children,'Buscar producto');
 }finally{await ui?.close();f.disk.close();}
});

test('favorite contact cannot claim the category swipe or trigger selection; choosing by name still supports the existing gesture',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery','Panadería y repostería');const swipe=()=>ui.hosts.get(row+'-swipe');await ui.run(()=>ui.hosts.get(row+'-favorite').onPressIn());assert.equal(swipe().onMoveShouldSetPanResponder({}, {dx:90,dy:0}),false);await ui.tap(row+'-favorite');assert.equal(ui.hosts.get(row).accessibilityState.checked,false);
  await ui.run(()=>{ui.hosts.get(row).onPressIn();swipe().onTouchStart();});assert.equal(swipe().onMoveShouldSetPanResponder({}, {dx:90,dy:0}),true);await ui.run(()=>{swipe().onPanResponderGrant();swipe().onPanResponderRelease({}, {dx:90,dy:0});});await ui.idle();assert.equal(ui.hosts.get(row).accessibilityState.checked,true);assert.equal(f.doc().items[0].favorite,true);assert.equal(f.doc().items[0].selected,false);
 }finally{await ui?.close();f.disk.close();}
});


test('an equivalent saved presentation is reused for a custom-source star even when the legacy ids differ',async()=>{
 const f=await shoppingFixture();let ui;try{
  const source=await f.open(),sourceItem=await f.add('Pan de casa',{category:'bakery',brand:'Casa',format:'Barra',quantity:'3',catalogOnly:true});const sourceBefore=JSON.stringify(f.disk.rows.find(r=>r.id===source.id));await f.api().createShoppingList(f.disk.scope,f.disk.active,'Actual');const activeItem=await f.add('Pan de casa',{category:'bakery',brand:'Casa',format:'Barra',quantity:'6'});assert.notEqual(sourceItem.id,activeItem.id);
  ui=await shoppingUI(f,{startList:false});await enter(ui,'bakery');const star='shopping-custom-choice-'+sourceItem.id+'-favorite';await ui.tap(star);assert.equal(f.doc().items.length,1);assert.equal(f.doc().items[0].id,activeItem.id);assert.equal(f.doc().items[0].quantity,6);assert.equal(f.doc().items[0].selected,true);assert.equal(ui.hosts.get(star).accessibilityState.checked,true);await ui.tap(star);assert.equal(ui.hosts.get(star).accessibilityState.checked,false);assert.equal(f.doc().items[0].selected,true);assert.equal(JSON.stringify(f.disk.rows.find(r=>r.id===source.id)),sourceBefore);
 }finally{await ui?.close();f.disk.close();}
});
