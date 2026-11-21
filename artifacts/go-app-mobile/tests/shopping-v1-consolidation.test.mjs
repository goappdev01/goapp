import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs');
const m=h.load('lib/shoppingNote.ts'),art=h.load('lib/shoppingProductArt.ts',{'./shoppingNote':m}),share=h.load('lib/shoppingShare.ts',{'./shoppingNote':m});
const names=doc=>m.groupedShopping(doc,'all').flatMap(g=>g.items.map(({item})=>item.name));

test('product drawings use normalized product terms, specific drinks before fruit, and neutral unknowns',()=>{
  for(const [name,expected] of [['Manzanas Golden','🍎'],['PLÁTANOS','🍌'],['Naranja de mesa','🍊'],['Zanahorias','🥕'],['Tomates','🍅'],['Leche sin lactosa','🥛'],['Yogur natural','🥣'],['Queso fresco','🧀'],['Zumo de manzana','🧃'],['Tomate triturado','🥫']]){
    assert.equal(art.shoppingProductArt(name).art,expected,name);assert.equal(art.shoppingProductArt(name).specific,true);
  }
  assert.deepEqual(h.plain(art.shoppingProductArt('Mi producto desconocido')),{art:'📦',specific:false});
});

test('batch catalog save is atomic, keeps presentations/prices and rejects inherited fractional quantities',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const milk=await f.add('Leche',{quantity:'3',brand:'A'});await f.run({type:'price',id:milk.id,value:2,unit:'unidades',observationId:'milk-price'});await f.run({type:'select',id:milk.id,value:false});
  const batch={type:'addCatalog',operationId:'single-batch',products:[{name:'Leche',category:'dairy',id:milk.id},{name:'Pan',category:'bakery'},{name:'Pan',category:'bakery'}]};
  await f.run(batch);await f.run(batch);assert.equal(f.doc().items.length,2);assert.equal(f.doc().items.find(i=>i.id===milk.id).quantity,3);assert.equal(f.doc().items.find(i=>i.id===milk.id).prices.length,1);
  const old=h.plain(f.doc());old.items[0].quantity=1.5;old.items[0].selected=false;const before=JSON.stringify(old);
  assert.throws(()=>m.applyShoppingOperation(old,{type:'addCatalog',operationId:'legacy',products:[{name:'Sal',category:'pantry'},{name:'Leche',category:'dairy',id:milk.id}]}),/cantidad antigua/);
  assert.equal(JSON.stringify(old),before);await f.disk.reopen();assert.equal((await f.open()).note.shopping.items.length,2);
 }finally{f.disk.close();}
});

test('checked items form a stable global upper block across categories; removal preserves catalog/history',async()=>{
 const f=await shoppingFixture();try{
  await f.open();const apple=await f.add('Manzanas'),bread=await f.add('Pan'),milk=await f.add('Leche');
  await f.run({type:'bought',id:milk.id,value:true});assert.deepEqual(h.plain(names(f.doc())),['Leche','Manzanas','Pan']);
  await f.run({type:'bought',id:bread.id,value:true});assert.deepEqual(h.plain(names(f.doc())),['Pan','Leche','Manzanas']);
  await f.run({type:'bought',id:bread.id,value:false});assert.deepEqual(h.plain(names(f.doc())),['Leche','Manzanas','Pan']);
  await f.run({type:'select',id:apple.id,value:false});assert.equal(names(f.doc()).includes('Manzanas'),false);assert.equal(f.doc().items.length,3);
  await f.disk.reopen();assert.deepEqual(h.plain(names((await f.open()).note.shopping)),['Leche','Pan']);
 }finally{f.disk.close();}
});

test('category multiselection stays on screen, saves once, reports active list, and does not lose unsaved choices silently',async()=>{
 const f=await shoppingFixture();let ui;try{
  ui=await shoppingUI(f,{startList:false});await ui.tap('shopping-orbit-food');await ui.tap('shopping-subgroup-0');
  await ui.tap('shopping-catalog-food-Pan común');await ui.tap('shopping-catalog-food-Baguette');
  assert.equal(f.doc().items.length,0);assert.equal(ui.hosts.get('shopping-catalog-food-Pan común').accessibilityState.checked,true);
  await ui.tap('shopping-back');assert.match(ui.alerts.at(-1).message,/todavía no/);assert.ok(ui.hosts.has('shopping-catalog-food-Baguette'));
  await ui.run(()=>ui.alerts.at(-1).buttons[0].onPress?.());
  const save=ui.hosts.get('shopping-catalog-save');await ui.run(()=>{save.onPress();save.onPress();});await ui.idle();
  assert.equal(f.doc().items.length,2);assert.ok(ui.hosts.has('shopping-catalog-food-Pan común'));assert.match(ui.container.textContent,/Selección guardada en «COMPRAS»/);
  assert.equal(ui.hosts.get('shopping-catalog-save').disabled,true);
  await ui.tap('shopping-catalog-food-Pan integral');await ui.tap('shopping-close');assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  await ui.run(()=>ui.alerts.at(-1).buttons.find(b=>b.text==='DESCARTAR').onPress());assert.equal(ui.calls.filter(c=>c[0]==='close').length,1);assert.equal(f.doc().items.length,2);
 }finally{await ui?.close();f.disk.close();}
});

test('catalog save targets the identified active list and retries a failed readback without duplicate products',async()=>{
 const f=await shoppingFixture();let ui;try{
  const first=await f.open(),second=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Viaje');
  ui=await shoppingUI(f,{startList:false});assert.equal(ui.hosts.get('shopping-orbit-active-list').children.join(''),'Lista activa: Viaje');
  await ui.tap('shopping-orbit-food');await ui.tap('shopping-subgroup-0');await ui.tap('shopping-catalog-food-Pan común');
  f.disk.failRead(true);await ui.tap('shopping-catalog-save');assert.ok(ui.hosts.has('shopping-error'));
  assert.equal(f.disk.rows.find(r=>r.id===second.id).note.shopping.items.length,1);assert.equal(f.disk.rows.find(r=>r.id===first.id).note.shopping.items.length,0);
  f.disk.failRead(false);await ui.tap('shopping-catalog-save');assert.equal(f.disk.rows.find(r=>r.id===second.id).note.shopping.items.length,1);
  await ui.close();ui=null;await f.disk.reopen();assert.equal((await f.open()).id,second.id);
 }finally{await ui?.close();f.disk.close();}
});

test('swipe owns its contact: right selects once, left and trash share safe removal, vertical scroll is not claimed',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const milk=await f.add('Leche');ui=await shoppingUI(f);
  const row=()=>ui.gestures.get('shopping-item-'+milk.id+'-swipe').pan;
  assert.deepEqual(Array.from(row().failOffsetYValue),[-15,15]);
  await ui.run(()=>{const g=row();g.onBeginHandler();g.onStartHandler();g.onEndHandler({translationX:85,velocityX:0},true);g.onFinalizeHandler({},true);});await ui.idle();assert.equal(f.doc().items[0].bought,true);
  await ui.tap('shopping-bought-'+milk.id);assert.equal(f.doc().items[0].bought,true,'residual release cannot toggle the check');
  await ui.run(()=>row().onBeginHandler());await ui.tap('shopping-bought-'+milk.id);assert.equal(f.doc().items[0].bought,false,'next physical touch works');
  await ui.run(()=>{const g=row();g.onBeginHandler();g.onStartHandler();g.onEndHandler({translationX:-85,velocityX:0},true);g.onFinalizeHandler({},true);});assert.equal(ui.alerts.length,1);
  await ui.run(()=>ui.alerts.at(-1).buttons[0].onPress?.());assert.equal(f.doc().items[0].selected,true);
  await ui.run(()=>row().onBeginHandler());await ui.tap('shopping-trash-'+milk.id);await ui.run(()=>ui.alerts.at(-1).buttons.find(b=>b.text==='RETIRAR').onPress());await ui.idle();
  assert.equal(ui.hosts.has('shopping-item-'+milk.id),false);assert.equal(f.doc().items.length,1);assert.equal(f.doc().items[0].selected,false);
 }finally{await ui?.close();f.disk.close();}
});

test('narrow layout keeps complete product name, centered large price, mirrored controls and keyboard-safe footer',async()=>{
 for(const handedness of ['left','right']){
  const f=await shoppingFixture();let ui;try{
   await f.open();const item=await f.add('Leche de una presentación con un nombre muy largo');ui=await shoppingUI(f,{width:320,handedness});
   assert.equal(h.React.Children.toArray(ui.hosts.get('shopping-edit-'+item.id).children)[0].props.numberOfLines,undefined);
   const price=ui.hosts.get('shopping-price-input-'+item.id),priceStyle=Object.assign({},...price.style.filter(Boolean));assert.equal(priceStyle.textAlign,'center');assert.ok(priceStyle.fontSize<=14);assert.ok(priceStyle.minHeight>=44);
   assert.equal(ui.hosts.get('shopping-product-main-row-'+item.id).style[1].flexDirection,handedness==='left'?'row-reverse':'row');
   assert.ok(ui.hosts.get('shopping-thumb-controls').style[0].paddingBottom<=4);assert.equal(ui.hosts.has('shopping-navigation-space'),false);
   await ui.run(()=>{price.onFocus();price.onChangeText('2,75');ui.keyboard.show();});ui.keyboard.focused={blur:()=>ui.hosts.get('shopping-price-input-'+item.id).onEndEditing()};
   assert.equal(ui.hosts.get('shopping-back').keyboardVisible,true);await ui.tap('shopping-back');await ui.idle();assert.equal(f.model.shoppingEstimate(f.doc()).totals.EUR,2.75);assert.equal(ui.calls.some(c=>c[0]==='close'),false);
  }finally{await ui?.close();f.disk.close();}
 }
});

test('full share includes long purchase, units, brands, states, no history or private ids; empty is explicit',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();for(let i=0;i<30;i++)await f.add('Producto '+i,{brand:'Marca '+i});
  await f.run({type:'bought',id:f.doc().items[0].id,value:true});
  const text=share.shoppingShareText('Mi lista',f.doc());assert.match(text,/✓ Comprado · Producto 0 · Marca 0 × 1 unidades/);assert.match(text,/☐ Pendiente · Producto 29/);assert.equal(text.split('\n').length,31);
  assert.equal(text.includes(f.disk.scope.userId),false);assert.equal(text.includes(f.doc().items[0].id),false);assert.match(share.shoppingShareText('Vacía',m.emptyShopping()),/Lista vacía/);
  ui=await shoppingUI(f);await ui.tap('shopping-active-list');await ui.tap('shopping-list-share');assert.equal(ui.calls.find(c=>c[0]==='share')[1].message,share.shoppingShareText('COMPRAS',f.doc()));
 }finally{await ui?.close();f.disk.close();}
});

test('missing active pointer never manufactures COMPRAS or changes any persisted data',async()=>{
 const f=await shoppingFixture();try{
  const key=f.api().shoppingNoteId(f.disk.scope)+':active_list';await f.disk.storage.setItem(key,'missing-list');const writes=f.disk.writes;
  await assert.rejects(f.open(),/No se encuentra la lista activa/);assert.equal(f.disk.writes,writes);assert.equal(await f.disk.storage.getItem(key),'missing-list');assert.equal(f.disk.rows.length,0);
  await assert.rejects(f.api().openShoppingNote(f.disk.scope,f.disk.active,'missing-explicit'),/No se encuentra/);assert.equal(f.disk.writes,writes);
 }finally{f.disk.close();}
});

test('an orphaned active key offers existing own lists for explicit recovery without replacing the key on failed opening',async()=>{
 const f=await shoppingFixture();let ui;try{
  const row=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Conservada');
  await f.api().runShoppingOperation(f.disk.scope,f.disk.active,{type:'addCatalog',operationId:'retained',products:[{name:'Manzanas',category:'produce'}]},row.id);
  const key=f.api().shoppingNoteId(f.disk.scope)+':active_list';await f.disk.storage.setItem(key,'missing');const writes=f.disk.writes;
  ui=await shoppingUI(f,{startList:false});assert.equal(f.disk.writes,writes);assert.equal(await f.disk.storage.getItem(key),'missing');
  assert.ok(ui.hosts.has('shopping-recover-list-'+row.id));await ui.tap('shopping-recover-list-'+row.id);
  assert.equal(await f.disk.storage.getItem(key),row.id);assert.match(ui.container.textContent,/Manzanas/);assert.equal(f.disk.rows.length,1);assert.equal(ui.hosts.has('shopping-error'),false);
 }finally{await ui?.close();f.disk.close();}
});

test('three ADMIN lists survive concurrent snapshots, store changes, active pointer, trash, user switch and fresh storage load',async()=>{
 const f=await shoppingFixture();try{
  const scope={userId:f.disk.scope.userId,context:'live:ADMIN'},api=f.api(),active=()=>true;
  const first=await api.createShoppingList(scope,active,'Lunes'),second=await api.createShoppingList(scope,active,'Viernes'),third=await api.createShoppingList(scope,active,'Viaje');
  const base=await f.disk.store.readGoLog();
  await Promise.all([first,second,third].map((list,index)=>api.runShoppingOperation(scope,active,{type:'saveItem',operationId:'admin-'+index,draft:{...m.shoppingEditor(),name:'Producto '+index,quantity:String(index+1)}},list.id)));
  await f.disk.store.commitGoLogSnapshot(base,base.map(row=>({...row,notes:row.notes+' actualizado'})));
  await api.runShoppingOperation(scope,active,{type:'store',operationId:'store',value:'Súper Viaje'},third.id);
  await api.runShoppingOperation(scope,active,{type:'bought',operationId:'check',id:(await api.listShoppingLists(scope,active)).find(r=>r.id===third.id).note.shopping.items[0].id,value:true},third.id);
  await api.openShoppingNote(scope,active,third.id);await api.deleteShoppingList(scope,active,second.id);
  await f.disk.setUser('another');await assert.rejects(api.openShoppingNote(scope,active),/cuenta|sesión|usuario/i);await f.disk.setUser(scope.userId);
  await f.disk.reopen();const fresh=f.api(),opened=await fresh.openShoppingNote(scope,active);assert.equal(opened.id,third.id);assert.equal(opened.note.shopping.store,'Súper Viaje');assert.equal(opened.note.shopping.items[0].quantity,3);assert.equal(opened.note.shopping.items[0].bought,true);
  const rows=await fresh.listShoppingLists(scope,active);assert.equal(rows.length,3);assert.equal(rows.find(r=>r.id===second.id).deleted,true);assert.equal(rows.find(r=>r.id===first.id).note.shopping.items.length,1);
 }finally{f.disk.close();}
});
