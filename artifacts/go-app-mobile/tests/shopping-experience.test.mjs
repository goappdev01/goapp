import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),h=require('./helpers/unified-note-fixture.cjs'),m=h.load('lib/shoppingNote.ts'),x=h.load('lib/shoppingExperience.ts',{'./shoppingNote':m});
const plain=h.plain;
function fixture(){let doc=m.emptyShopping();return{get doc(){return doc;},op(op){doc=m.applyShoppingOperation(doc,{operationId:m.shoppingId(),...op});return doc;},add(name,extra={}){const draft={...m.shoppingEditor(),name,...extra};doc=m.applyShoppingOperation(doc,{type:'saveItem',draft,operationId:m.shoppingId()});return doc.items.find(i=>i.id===draft.id);}};}

test('brands, varieties, package favorites and old documents survive optional-field extension without a price',()=>{
 const f=fixture(),a=f.add('Leche',{brand:'Marca A',format:'Botella',variety:'Entera',packageQuantity:'1',packageUnit:'litros',favorite:true});
 const b=f.add('Leche',{brand:'Marca B',format:'Brik',variety:'Entera',packageQuantity:'1',packageUnit:'litros'});
 assert.equal(f.doc.items.length,2);assert.equal(a.prices.length,0);assert.equal(m.shoppingEditor(a).brand,'Marca A');assert.equal(m.shoppingEditor(a).favorite,true);
 assert.equal(m.shoppingEditor(b).format,'Brik');assert.throws(()=>f.add('Leche',{brand:'Marca A',format:'Botella',variety:'Entera',packageQuantity:'1',packageUnit:'litros'}),/Ya existe/);
 const old=plain(f.doc);for(const i of old.items)for(const k of ['brand','variety','format','favorite'])delete i[k];m.validateShopping(old);
 assert.deepEqual(plain(m.shoppingEstimate(old)),{totals:{},unknown:2});
});

test('weight, volume, packages and units use comparable measurements; picked and planned totals separate known/unknown prices',()=>{
 for(const [unit,quantity,priceUnit,value,extra,expected] of [
  ['g','750','kg',4,{},3],['ml','250','litros',2,{},.5],['kg','1,5','kg',3,{},4.5],
  ['paquetes','2','paquetes',3,{packageQuantity:'500',packageUnit:'g'},6],['unidades','3','unidades',.1,{},.3],
  ['paquetes','2','kg',4,{packageQuantity:'500',packageUnit:'g'},4],
 ]){const f=fixture(),i=f.add('Producto',{unit,quantity,...extra});f.op({type:'store',value:'Tienda A'});f.op({type:'price',id:i.id,value,unit:priceUnit,observationId:m.shoppingId()});
  assert.equal(m.shoppingSubtotal(f.doc.items[0],f.doc.store).amount,expected);assert.equal(m.shoppingEstimate(f.doc,true).unknown,0);
  f.op({type:'bought',id:i.id,value:true});assert.equal(m.shoppingEstimate(f.doc,true).totals.EUR,expected);f.add('Sin precio');assert.equal(m.shoppingEstimate(f.doc).unknown,1);
 }
 const f=fixture(),i=f.add('Paquete desconocido',{unit:'paquetes'});f.op({type:'store',value:'A'});f.op({type:'price',id:i.id,value:3,unit:'kg',observationId:m.shoppingId()});assert.equal(m.shoppingEstimate(f.doc).unknown,1);
});

test('changing store never reuses another store price and correcting price retains every observation and currency',()=>{
 const f=fixture(),i=f.add('Arroz',{brand:'A',format:'Seco',unit:'kg'});f.op({type:'store',value:'A'});f.op({type:'price',id:i.id,value:2,unit:'kg',observationId:m.shoppingId()});
 f.op({type:'store',value:'B'});assert.equal(m.shoppingEstimate(f.doc).unknown,1);f.op({type:'price',id:i.id,value:3,unit:'kg',observationId:m.shoppingId()});
 assert.equal(m.shoppingEstimate(f.doc).totals.EUR,3);f.op({type:'store',value:'A'});assert.equal(m.shoppingEstimate(f.doc).totals.EUR,2);
 f.op({type:'price',id:i.id,value:2.5,unit:'kg',observationId:m.shoppingId()});assert.equal(f.doc.items[0].prices.length,3);assert.equal(m.shoppingEstimate(f.doc).totals.EUR,2.5);
 const changed={...m.shoppingEditor(f.doc.items[0]),brand:'Otra marca'};f.op({type:'saveItem',draft:changed});assert.equal(m.shoppingEstimate(f.doc).unknown,1);
 assert.equal(m.comparableShoppingPrices([{...f.doc.items[0].prices[0],currency:'USD'},f.doc.items[0].prices[1]]).length,0);
 assert.equal(m.comparableShoppingPrices([{...f.doc.items[0].prices[0],variety:'Integral'},f.doc.items[0].prices[1]]).length,0);
 assert.equal(m.comparableShoppingPrices([{...f.doc.items[0].prices[0],product:'Harina'},f.doc.items[0].prices[1]]).length,0);
 assert.equal(m.comparableShoppingPrices(f.doc.items[0].prices.map(p=>({...p,product:undefined}))).length,0);
});

test('finish snapshots the real bought items without deleting catalog, observations, favorite or pending draft; identical retry is idempotent',()=>{
 const f=fixture(),a=f.add('Pan',{favorite:true}),b=f.add('Leche'),draft={...m.shoppingEditor(),name:'Sin terminar',quantity:'1,'};f.op({type:'bought',id:a.id,value:true});f.op({type:'draft',draft});
 const finish={type:'finish',confirmed:true,operationId:m.shoppingId()};f.op(finish);f.op(finish);assert.equal(f.doc.purchases.length,1);assert.equal(f.doc.purchases[0].items[0].name,'Pan');
 assert.equal(f.doc.items.length,2);assert.equal(f.doc.items[0].favorite,true);assert.equal(f.doc.items[1].selected,true);assert.equal(f.doc.pendingEditor.quantity,'1,');
 f.op({type:'quantity',id:a.id,value:2});assert.equal(f.doc.purchases[0].items[0].quantity,1);assert.equal(f.doc.items.find(i=>i.id===b.id).bought,false);
});

test('approved eight orbits cover every stored category and place Others lower-right, Hygiene below and Congelados upper-left',()=>{
 assert.deepEqual(plain(x.SHOPPING_ORBITS.map(o=>o.label)),['Alimentos','Bebidas','Hogar','Otros','Higiene','Favoritos','Frescos','Congelados']);
 assert.deepEqual(plain(x.SHOPPING_ORBITS.flatMap(o=>o.categories)).sort(),plain(m.SHOPPING_CATEGORIES.map(c=>c[0])).sort());
 for(const width of [320,375,390,430,768])for(const scale of [1,1.8,2]){const l=x.shoppingOrbitLayout(width,scale),center=l.size/2;
  assert.equal(l.points.length,8);const others=l.points[3],care=l.points[4],frozen=l.points[7];assert.ok(others.x+l.button/2>center&&others.y+l.buttonHeight/2>l.height/2);assert.ok(care.y+l.buttonHeight/2>l.height/2);assert.ok(frozen.x+l.button/2<center&&frozen.y+l.buttonHeight/2<l.height/2);
  for(const p of l.points){assert.ok(p.x>=-.01&&p.y>=-.01);assert.ok(p.x+l.button<=l.size+.01&&p.y+l.buttonHeight<=l.height+.01);}
  for(let i=0;i<8;i++)for(let j=i+1;j<8;j++){const a=l.points[i],b=l.points[j];assert.ok(a.x+l.button<=b.x||b.x+l.button<=a.x||a.y+l.buttonHeight<=b.y||b.y+l.buttonHeight<=a.y,'orbit touch targets must not overlap');}
 }
});

test('manual route has no invented location, recalculates bought/store changes and leaves chilled then frozen last',()=>{
 const f=fixture(),ice=f.add('Helado',{category:'frozen'}),milk=f.add('Leche',{category:'dairy'}),bread=f.add('Pan',{category:'bakery'});f.op({type:'store',value:'A'});
 let r=x.shoppingRoute(f.doc);assert.equal(r.mode,'manual');assert.equal(r.navigationAvailable,false);assert.equal(r.unknown,3);assert.deepEqual(plain(r.steps.map(s=>s.item.id)),[bread.id,milk.id,ice.id]);assert.equal(r.checkout,undefined);
 f.op({type:'location',id:bread.id,aisle:'Junto a entrada'});assert.equal(x.shoppingRoute(f.doc).steps[0].aisle,'Junto a entrada');f.op({type:'bought',id:bread.id,value:true});assert.equal(x.shoppingRoute(f.doc).steps.length,2);
 f.op({type:'store',value:'B'});assert.equal(f.doc.locations.length,1);f.op({type:'bought',id:bread.id,value:false});assert.equal(x.shoppingRoute(f.doc).steps[0].aisle,undefined);
});

test('map adapter follows real graph distance, preserves cold order and known checkout but never claims live navigation',()=>{
 const f=fixture(),far=f.add('Arroz',{category:'pantry'}),near=f.add('Pasta',{category:'pantry'}),ice=f.add('Helado',{category:'frozen'});f.op({type:'store',value:'A'});
 const map={store:'A',entrance:'entry',checkout:'cash',nodes:[{id:'entry'},{id:'a',aisle:'A'},{id:'b',aisle:'B'},{id:'ice',aisle:'Frío'},{id:'cash',aisle:'Caja 1'}],edges:[{from:'entry',to:'a',distance:9},{from:'entry',to:'b',distance:2},{from:'b',to:'a',distance:4},{from:'a',to:'ice',distance:1},{from:'ice',to:'cash',distance:2}],products:{[far.id]:'a',[near.id]:'b',[ice.id]:'ice'}};
 const r=x.shoppingRoute(f.doc,map);assert.equal(r.mode,'map');assert.equal(r.navigationAvailable,false);assert.deepEqual(plain(r.steps.map(s=>s.item.id)),[near.id,far.id,ice.id]);assert.equal(r.checkout.aisle,'Caja 1');
 assert.equal(x.shoppingRoute(f.doc,{...map,store:'B'}).mode,'manual');
});

test('GO executes bounded commands on the same document; ambiguous presentations and unsupported compound requests cannot mutate it',()=>{
 const f=fixture(),execute=text=>{const result=x.shoppingCommand(f.doc,text);for(const op of result.operations||[])f.op(op);return result;};
 execute('Añade 2 kg de manzanas');assert.equal(f.doc.items[0].quantity,2);assert.equal(f.doc.items[0].unit,'kg');execute('Cantidad de manzanas a 1,5');assert.equal(f.doc.items[0].quantity,1.5);
 assert.match(execute('Qué queda').message,/manzanas/);execute('Marca cogido manzanas');assert.equal(f.doc.items[0].bought,true);assert.equal(execute('Ruta').route,true);
 execute('Quita manzanas');assert.equal(f.doc.items[0].selected,false);assert.equal(f.doc.items.length,1);execute('Añade manzanas');assert.equal(f.doc.items[0].selected,true);assert.equal(f.doc.items[0].bought,false);
 f.add('manzanas',{brand:'B'});assert.equal(execute('Cantidad de manzanas a 3').operations,undefined);assert.equal(execute('Añade pan y quita leche').operations,undefined);
 const before=JSON.stringify(f.doc);execute('Paga y borra todo');assert.equal(JSON.stringify(f.doc),before);
});
