import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs'),m=h.load('lib/shoppingNote.ts'),taxonomy=h.load('lib/shoppingTaxonomy.ts',{'./shoppingNote':m}),catalog=h.load('lib/shoppingCatalog.ts',{'./shoppingNote':m,'./shoppingTaxonomy':taxonomy}),experience=h.load('lib/shoppingExperience.ts',{'./shoppingNote':m,'./shoppingTaxonomy':taxonomy});
const expected=['FRUTAS Y VERDURAS','CARNICERÍA Y PESCADERÍA','BEBIDAS','PANADERÍA Y PASTAS','LÁCTEOS Y REFRIGERADOS','DESPENSA','HIGIENE Y PERFUMERÍA','OTROS (HOGAR)'];
test('eight exact entrances and every original product/presentation survives a read-only mapping, including frozen and review',()=>{
 assert.deepEqual(h.plain(experience.SHOPPING_ENTRANCES.map(o=>o.label)),expected);
 const keys=groups=>groups.flatMap(g=>g.products.map(name=>g.category+':'+name)).sort();assert.deepEqual(keys(catalog.SHOPPING_CATALOG),keys(catalog.LEGACY_SHOPPING_CATALOG));
 for(const [name,category,orbit] of [['Manzanas','produce','produce'],['Pollo','meat','protein'],['Agua mineral','drinks','drinks'],['Bizcochos','pantry','pantry'],['Leche entera','dairy','dairy'],['Arroz blanco','pantry','pantry'],['Detergente de ropa','cleaning','home'],['Bombillas','cleaning','home'],['Merluza','frozen','protein'],['Menestra','frozen','produce'],['Helado','frozen','dairy'],['Tartas congeladas','frozen','dairy']])assert.equal(taxonomy.shoppingEntrance(name,category),orbit);
 assert.equal(taxonomy.shoppingEntrance('Congelado desconocido','frozen'),undefined);assert.ok(catalog.shoppingCatalogGroups('review').some(g=>g.products.includes('Croquetas')));
 assert.ok(catalog.shoppingCatalogGroups('protein').some(g=>g.category==='frozen'&&g.label.includes('Congelados')));
 const doc=m.emptyShopping(),before=JSON.stringify(doc);catalog.shoppingCatalogGroups('produce');catalog.shoppingPersonalCatalog([{id:'a',items:doc.items}],'home');assert.equal(JSON.stringify(doc),before);assert.equal(doc.categoryOrder.length,12);
});
for(const handedness of ['left','right'])test(`Landing ${handedness}: seven principal circles, home satellite and separate Favorites, one search and fixed Mis listas/GO/Lista; list keeps Añadir`,async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();await f.add('Arroz');ui=await shoppingUI(f,{startList:false,width:320,fontScale:1.4,handedness});
  for(const o of experience.SHOPPING_ORBITS)assert.equal(ui.hosts.get('shopping-orbit-'+o.id).accessibilityLabel,o.label);assert.ok(ui.hosts.has('shopping-orbit-favorites'));assert.ok(!ui.hosts.has('shopping-orbit-frozen'));assert.ok(!ui.hosts.has('shopping-add'));
  const row=ui.hosts.get('shopping-primary-actions');assert.deepEqual(h.React.Children.toArray(row.children).map(c=>c.props.testID).filter(Boolean),['shopping-manage-lists','shopping-go','shopping-list']);assert.equal(row.style[1].flexDirection,'row');
  assert.equal(h.React.Children.toArray(ui.hosts.get('shopping-shortcut-row').children).length,1);assert.equal(ui.hosts.has('shopping-navigation-space'),false);
  await ui.tap('shopping-list');assert.ok(ui.hosts.has('shopping-add'));assert.ok(!ui.container.textContent.includes('Mis listas ›'));assert.equal(ui.hosts.get('shopping-active-list').onPress,undefined);
  await ui.tap('shopping-add');await ui.tap('shopping-go');assert.ok(ui.hosts.has('shopping-command'));await ui.tap('shopping-back');await ui.tap('shopping-manage-lists');assert.ok(ui.hosts.has('shopping-list-create'));
 }finally{await ui?.close();f.disk.close();}
});
test('all eight submenus finish with OTRO; custom catalog saves independently, survives removal/reopen and can be used in another list',async()=>{
 const f=await shoppingFixture();let ui;try{
  const original=await f.open();ui=await shoppingUI(f,{startList:false});
  for(const o of experience.SHOPPING_ENTRANCES){await ui.tap('shopping-orbit-'+o.id);assert.ok(ui.hosts.has('shopping-new-product'));const nodes=[...ui.hosts.keys()];assert.ok(nodes.indexOf('shopping-new-product')>nodes.findIndex(k=>k.startsWith('shopping-subgroup-')));await ui.tap('shopping-back');}
  await ui.tap('shopping-orbit-bakery');await ui.tap('shopping-new-product');await ui.input('name','Pan especial de prueba');await ui.input('price','2,50');await ui.tap('shopping-save');
  const item=f.doc().items.find(i=>i.name==='Pan especial de prueba');assert.equal(item.selected,false);assert.equal(item.customCatalog,true);assert.ok(ui.hosts.has('shopping-custom-'+item.id));
  await ui.tap('shopping-custom-choice-'+item.id);await ui.tap('shopping-catalog-save');assert.equal(f.doc().items[0].selected,true);
  await ui.run(()=>f.run({type:'select',id:item.id,value:false}));await ui.idle();await ui.tap('shopping-orbit-bakery');assert.ok(ui.hosts.has('shopping-custom-'+item.id));
  await ui.close();ui=null;await f.disk.reopen();const saved=await f.open();assert.equal(saved.id,original.id);assert.equal(saved.note.shopping.items[0].id,item.id);
  const second=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Segunda');ui=await shoppingUI(f,{startList:false});await ui.tap('shopping-orbit-bakery');assert.ok(ui.hosts.has('shopping-custom-'+item.id));await ui.tap('shopping-custom-choice-'+item.id);await ui.tap('shopping-catalog-save');
  const secondSaved=await f.open();assert.equal(secondSaved.id,second.id);assert.equal(secondSaved.note.shopping.items[0].id,item.id);assert.equal(secondSaved.note.shopping.items[0].prices[0].price,2.5);assert.equal(secondSaved.note.shopping.items.length,1);
  await ui.tap('shopping-orbit-bakery');await ui.tap('shopping-custom-edit-'+item.id);await ui.input('name','Pan especial corregido');await ui.tap('shopping-save');assert.ok(ui.container.textContent.includes('Pan especial corregido'));
  await ui.tap('shopping-custom-remove-'+item.id);await ui.run(()=>ui.alerts.at(-1).buttons.find(b=>b.text==='QUITAR').onPress());await ui.idle();assert.equal(ui.hosts.has('shopping-custom-'+item.id),false);const retained=(await f.open()).note.shopping.items[0];assert.equal(retained.selected,true);assert.equal(retained.prices.length,1);
 }finally{await ui?.close();f.disk.close();}
});
test('star toggles without removing/selecting the item; Favorites and states survive storage reload',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Manzanas');ui=await shoppingUI(f);await ui.tap('shopping-favorite-'+item.id);assert.equal(f.doc().items[0].favorite,true);assert.equal(f.doc().items[0].selected,true);assert.equal(ui.alerts.length,0);
  await ui.tap('shopping-add');await ui.tap('shopping-orbit-favorites');assert.ok(ui.hosts.has('shopping-favorite-item-'+item.id));await ui.close();ui=null;await f.disk.reopen();await f.open();assert.equal(f.doc().items[0].favorite,true);
  ui=await shoppingUI(f);await ui.tap('shopping-favorite-'+item.id);assert.equal(f.doc().items[0].favorite,false);assert.equal(f.doc().items.length,1);
 }finally{await ui?.close();f.disk.close();}
});

test('personal catalog import is atomic, keeps identity/presentation and rejects other users or contexts without rewriting sources',async()=>{
 const f=await shoppingFixture();try{
  const source=await f.open(),item=await f.add('Pan propio',{category:'bakery',brand:'Mi marca',format:'Barra',quantity:'3',customCatalog:true,catalogOnly:true,favorite:true});
  await f.run({type:'price',id:item.id,value:2.25,unit:item.unit,observationId:f.model.shoppingId()});
  const original=JSON.stringify(f.disk.rows.find(r=>r.id===source.id));const target=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Destino');
  const op=()=>({type:'addCatalog',operationId:f.model.shoppingId(),products:[{name:item.name,category:item.category,id:item.id,sourceListId:source.id}]});
  let saved=await f.api().runShoppingOperation(f.disk.scope,f.disk.active,op(),target.id);assert.equal(saved.note.shopping.items[0].id,item.id);assert.equal(saved.note.shopping.items[0].quantity,3);assert.equal(saved.note.shopping.items[0].favorite,true);assert.equal(saved.note.shopping.items[0].prices[0].price,2.25);assert.equal(JSON.stringify(f.disk.rows.find(r=>r.id===source.id)),original);
  saved=await f.api().runShoppingOperation(f.disk.scope,f.disk.active,op(),target.id);assert.equal(saved.note.shopping.items.length,1);
  await assert.rejects(()=>f.api().runShoppingOperation(f.disk.scope,f.disk.active,{type:'saveItem',operationId:f.model.shoppingId(),draft:{...f.model.shoppingEditor(),name:item.name,category:'bakery',brand:'Mi marca',format:'Barra',quantity:'3',catalogOnly:true,customCatalog:true}},target.id),/ya está en tu catálogo/);
  const adminSource=await f.open({...f.disk.scope,context:'live:ADMIN'},()=>true);const contextBefore=JSON.stringify(f.disk.rows);
  await assert.rejects(()=>f.api().runShoppingOperation(f.disk.scope,f.disk.active,{...op(),products:[{...op().products[0],sourceListId:adminSource.id}]},target.id),/no pertenece/);assert.equal(JSON.stringify(f.disk.rows),contextBefore);
  await f.disk.setUser('foreign');const foreign={...f.disk.scope,userId:'foreign'};const foreignList=await f.open(foreign,()=>true);await f.disk.setUser(f.disk.scope.userId);
  const before=JSON.stringify(f.disk.rows);await assert.rejects(()=>f.api().runShoppingOperation(f.disk.scope,f.disk.active,{...op(),products:[{...op().products[0],sourceListId:foreignList.id}]},target.id),/no pertenece/);assert.equal(JSON.stringify(f.disk.rows),before);
 }finally{f.disk.close();}
});
test('explicit catalog removal from an owned trashed source keeps that list trashed and all purchase records intact',async()=>{
 const f=await shoppingFixture();try{
  const source=await f.open(),item=await f.add('Pan de catálogo',{category:'bakery',customCatalog:true,catalogOnly:true});const target=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Activa');
  await f.api().runShoppingOperation(f.disk.scope,f.disk.active,{type:'addCatalog',operationId:f.model.shoppingId(),products:[{name:item.name,category:item.category,id:item.id,sourceListId:source.id}]},target.id);
  await f.api().deleteShoppingList(f.disk.scope,f.disk.active,source.id);const hidden=await f.api().runShoppingOperation(f.disk.scope,f.disk.active,{type:'catalogVisibility',id:item.id,hidden:true,operationId:f.model.shoppingId()},source.id);assert.equal(hidden.deleted,true);
  const rows=await f.api().listShoppingLists(f.disk.scope,f.disk.active),personal=catalog.shoppingPersonalCatalog(rows.map(r=>({id:r.id,items:r.note.shopping.items})),'bakery');assert.equal(personal.length,0);assert.equal(rows.find(r=>r.id===target.id).note.shopping.items[0].selected,true);assert.equal((await f.open()).id,target.id);
 }finally{f.disk.close();}
});


test('seven approved principal categories, two composed satellites and all 212 presentations remain accessible',()=>{
 assert.deepEqual(h.plain(experience.SHOPPING_ORBITS.map(o=>o.label)),expected.slice(0,7));assert.equal(experience.SHOPPING_ORBITS.length,7);
 assert.equal(catalog.SHOPPING_CATALOG.flatMap(g=>g.products).length,212);
 assert.equal(catalog.shoppingCatalogGroups('review').flatMap(g=>g.products).length,4);
 const bakery=catalog.shoppingCatalogGroups('bakery').flatMap(g=>g.products),pantry=catalog.shoppingCatalogGroups('pantry').flatMap(g=>g.products);
 for(const name of ['Macarrones','Espaguetis','Fideos','Lasaña']){assert.ok(bakery.includes(name));assert.ok(!pantry.includes(name));}
 for(const name of ['Galletas','Magdalenas','Croissants','Bollería','Bizcochos']){assert.ok(pantry.includes(name));assert.ok(!bakery.includes(name));}
 for(const name of ['Tallarines','Pasta alimenticia','Pasta integral','Fusilli'])assert.equal(taxonomy.shoppingEntrance(name,'pantry'),'bakery');
 assert.equal(taxonomy.shoppingEntrance('Pasta de dientes','care'),'care');assert.notEqual(taxonomy.shoppingEntrance('Pastas de té','bakery'),'bakery');
 const icon=experience.SHOPPING_ORBITS.find(o=>o.id==='bakery').art;assert.equal(icon,'🥖🍝');assert.ok(!icon.includes('🍪'));
 for(const o of experience.SHOPPING_ORBITS)assert.equal([...o.art].filter(c=>c.codePointAt(0)>0x1F000).length,2,'two category illustrations');
 const doc=m.emptyShopping(),before=JSON.stringify(doc);for(const item of [{name:'Macarrones',category:'pantry'},{name:'Galletas',category:'bakery'}]){const original=JSON.stringify(item);taxonomy.shoppingItemEntrance(item);assert.equal(JSON.stringify(item),original);}assert.equal(JSON.stringify(doc),before);
});

test('pasta selection reuses stored pantry identity, while cookies remain selectable in Despensa',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const old=await f.add('Macarrones',{category:'pantry',catalogOnly:true});await f.run({type:'select',id:old.id,value:false});
  ui=await shoppingUI(f,{startList:false});await ui.tap('shopping-orbit-bakery-hit');
  const subgroup=[...ui.hosts].find(([id,p])=>id.startsWith('shopping-subgroup-')&&p.accessibilityLabel==='Pasta alimenticia');assert.ok(subgroup);await ui.tap(subgroup[0]);
  await ui.tap('shopping-catalog-bakery-Macarrones');await ui.tap('shopping-catalog-save');const saved=f.doc().items.filter(i=>i.name==='Macarrones');assert.equal(saved.length,1);assert.equal(saved[0].id,old.id);assert.equal(saved[0].category,'pantry');assert.equal(saved[0].selected,true);
  await ui.tap('shopping-orbit-pantry-hit');
  const cookies=[...ui.hosts].find(([id,p])=>id.startsWith('shopping-subgroup-')&&p.accessibilityLabel==='Galletas y repostería');assert.ok(cookies);await ui.tap(cookies[0]);assert.ok(ui.hosts.has('shopping-catalog-pantry-Galletas'));
 }finally{await ui?.close();f.disk.close();}
});
