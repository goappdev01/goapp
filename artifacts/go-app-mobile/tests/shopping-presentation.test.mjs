import {createRequire} from 'node:module';
const h=createRequire(import.meta.url)('./helpers/unified-note-fixture.cjs');
import test from 'node:test';import assert from 'node:assert/strict';
import {shoppingFixture,shoppingUI} from './helpers/shopping-fixture.mjs';
const flatten=style=>Object.assign({},...(Array.isArray(style)?style.filter(Boolean):[style]));

test('Landing identifies the active list compactly and updates it after explicit selection',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();ui=await shoppingUI(f,{startList:false});
  assert.equal(ui.hosts.get('shopping-orbit-active-list').children.join(''),'Lista activa: COMPRAS');
  assert.ok(ui.hosts.get('shopping-orbit-active-list').style.fontSize<=13);assert.match(ui.container.textContent,/GO\s+ComprasAñadir productos/);
  await ui.tap('shopping-manage-lists');await ui.run(()=>ui.hosts.get('shopping-list-name').onChangeText('Trabajo'));await ui.tap('shopping-list-create');
  assert.equal(ui.hosts.get('shopping-orbit-active-list').children.join(''),'Lista activa: Trabajo');
  assert.equal(ui.hosts.get('shopping-thumb-controls').style[0].paddingBottom,4);
  assert.equal(ui.hosts.get('shopping-shortcut-row').style[0].flex,1);
 }finally{await ui?.close();f.disk.close();}
});

test('Mis listas is a compact bottom-aligned scroll with thumb-arc actions; keyboard, rename, share and trash confirmation keep records',async()=>{
 const f=await shoppingFixture();let ui;try{
  const first=await f.open(),second=await f.api().createShoppingList(f.disk.scope,f.disk.active,'Familia');
  ui=await shoppingUI(f,{startList:false,width:320});await ui.tap('shopping-manage-lists');
  const scroll=ui.hosts.get('shopping-lists-scroll');assert.equal(scroll.contentContainerStyle.justifyContent,'flex-end');assert.equal(scroll.contentContainerStyle.gap,6);assert.equal(scroll.contentContainerStyle.flexGrow,1);
  assert.equal(ui.hosts.get('shopping-lists-editor').children.filter(Boolean).length,2);
  for(const id of ['shopping-list-create','shopping-list-rename','shopping-list-share','shopping-list-delete'])assert.ok(ui.hosts.get(id).style[0].minHeight>=44);
  await ui.run(()=>{ui.hosts.get('shopping-list-name').onChangeText('Oficina');ui.hosts.get('shopping-list-name').onFocus({target:123});ui.keyboard.show();});
  assert.ok(ui.calls.some(c=>c[0]==='reveal'&&c[1]===123));await ui.tap('shopping-back');assert.equal(ui.keyboard.visible,false);assert.equal(ui.hosts.get('shopping-list-name').value,'Oficina');
  await ui.tap('shopping-list-rename');assert.equal(f.disk.rows.find(row=>row.id===second.id).note.title,'Oficina');
  await ui.tap('shopping-list-share');assert.match(ui.calls.find(c=>c[0]==='share')[1].message,/Oficina/);
  await ui.tap('shopping-list-delete');assert.match(ui.alerts.at(-1).message,/papelera/);assert.equal(f.disk.rows.length,2);
  await ui.run(()=>ui.alerts.at(-1).buttons[0].onPress?.());await ui.close();ui=null;await f.disk.reopen();
  assert.equal((await f.open()).id,second.id);assert.equal(f.disk.rows.find(row=>row.id===first.id).note.title,'COMPRAS');
 }finally{await ui?.close();f.disk.close();}
});

test('product name dominates missing price; price keeps its touch area and only product trash icons become red',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();const item=await f.add('Manzanas de una presentación con nombre largo');ui=await shoppingUI(f);
  const text=h.React.Children.toArray(ui.hosts.get('shopping-edit-'+item.id).children)[0];
  const price=()=>ui.hosts.get('shopping-price-input-'+item.id);
  assert.equal(text.props.numberOfLines,undefined);assert.ok(flatten(text.props.style).fontSize>flatten(price().style).fontSize);
  assert.equal(flatten(price().style).fontSize,13);assert.ok(flatten(price().style).minHeight>=44);
  const trash=ui.hosts.get('shopping-trash-'+item.id);assert.equal(h.React.Children.toArray(trash.children)[0].props.color,'#c52e38');assert.ok(trash.style.minHeight>=44);
  await ui.run(()=>{ui.hosts.get('shopping-details-'+item.id).onLongPress();price().onChangeText('2,50');});
  assert.equal(flatten(price().style).fontSize,20);assert.equal(h.React.Children.toArray(ui.hosts.get('shopping-delete-'+item.id).children)[0].props.color,'#c52e38');
  assert.equal(h.React.Children.toArray(ui.hosts.get('shopping-favorite-'+item.id).children)[0].props.color,'#39688f');
  await ui.run(()=>price().onEndEditing());await ui.idle();assert.equal(f.model.shoppingEstimate(f.doc()).totals.EUR,2.5);
 }finally{await ui?.close();f.disk.close();}
});

test('TOTAL PREVISTO centers all three lines and gives long supermarket names a compact two-line label',async()=>{
 const f=await shoppingFixture();let ui;try{
  await f.open();await f.add('Pan',{price:'2,50'});await f.run({type:'store',value:'Mi supermercado'});ui=await shoppingUI(f);
  const card=ui.hosts.get('shopping-total-card');assert.equal(card.style.alignItems,'center');assert.equal(card.style.justifyContent,'center');assert.ok(card.style.paddingVertical>=5);
  for(const id of ['shopping-total-title','shopping-estimate','shopping-total-products'])assert.equal(ui.hosts.get(id).style.textAlign,'center');
  assert.equal(ui.hosts.get('shopping-store-title').numberOfLines,2);assert.equal(ui.hosts.get('shopping-store-title').style.fontSize,12);
 }finally{await ui?.close();f.disk.close();}
});
