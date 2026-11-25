import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url), h=require('./helpers/unified-note-fixture.cjs');
const {shoppingFixture}=await import('./helpers/shopping-fixture.mjs');

function remoteFixture(){
  const records=new Map(); let fail=false;
  const id=scope=>scope.userId+'|'+scope.context;
  const normalize=value=>Array.isArray(value)?value.map(normalize):value&&typeof value==='object'
    ?Object.fromEntries(Object.entries(value).sort(([a],[b])=>b.localeCompare(a)).map(([key,item])=>[key,normalize(item)])):value;
  const copy=value=>JSON.parse(JSON.stringify(normalize(value)));
  return {records, setFail:value=>fail=value, id,
    readShoppingRemote:async scope=>{if(fail)throw Error('Sin conexión');return copy(records.get(id(scope))??{revision:0,lists:[],activeListId:null});},
    writeShoppingRemote:async(scope,expected,lists,activeListId)=>{
      if(fail)throw Error('Sin conexión');const previous=records.get(id(scope))??{revision:0,lists:[],activeListId:null};
      if(previous.revision!==expected)throw Error('Conflicto de revisión');
      records.set(id(scope),copy({revision:expected+1,lists,activeListId}));return expected+1;
    }};
}
function sync(disk,model,remote){return h.load('lib/shoppingSync.ts',{
  '@react-native-async-storage/async-storage':disk.storage,'./goLogStore':disk.store,
  './unifiedNotes':disk.model,'./shoppingNote':model,'./shoppingRemoteStore':remote});}

test('migrates the original list and history, then hydrates another device for the same account',async()=>{
  const first=await shoppingFixture(),second=await h.diskFixture(),remote=remoteFixture();
  try{
    await first.open();
    const original=await first.add('Pan',{price:'2.40'});
    const before=first.disk.rows.find(row=>row.note?.shopping);
    const a=sync(first.disk,first.model,remote);
    await a.syncShopping(first.disk.scope,first.disk.active);
    const saved=remote.records.get(remote.id(first.disk.scope));
    assert.equal(saved.lists.length,1);
    assert.equal(saved.lists[0].id,before.id);
    assert.equal(saved.lists[0].note.shopping.items[0].id,original.id);
    assert.equal(saved.lists[0].note.shopping.items[0].prices[0].price,2.4);
    const b=sync(second,first.model,remote);
    await b.syncShopping(second.scope,second.active);
    assert.deepEqual(h.plain(second.rows.filter(row=>row.note?.shopping)),h.plain(saved.lists));
    await b.updateShoppingLog(second.scope,second.active,rows=>({entries:rows.map(row=>row.id===before.id?{...row,note:{...row.note,title:'Compra semanal'}}:row),result:null}));
    assert.equal(remote.records.get(remote.id(second.scope)).lists[0].note.title,'Compra semanal');
    await a.syncShopping(first.disk.scope,first.disk.active);
    assert.equal(first.disk.rows.find(row=>row.id===before.id).note.title,'Compra semanal');
  }finally{first.disk.close();second.close();}
});

test('failed remote write leaves the local list unchanged and does not report success',async()=>{
  const fixture=await shoppingFixture(),remote=remoteFixture();
  try{
    await fixture.open();
    await fixture.add('Agua');const store=sync(fixture.disk,fixture.model,remote);
    await store.syncShopping(fixture.disk.scope,fixture.disk.active);
    const before=h.plain(fixture.disk.rows);
    remote.setFail(true);
    await assert.rejects(()=>store.updateShoppingLog(fixture.disk.scope,fixture.disk.active,rows=>({entries:rows.map(row=>row.note?.shopping?{...row,notes:'otro nombre'}:row),result:null})),/Sin conexión/);
    assert.deepEqual(h.plain(fixture.disk.rows),before);
  }finally{fixture.disk.close();}
});

test('divergent edits are retained locally and blocked instead of overwriting a second device',async()=>{
  const fixture=await shoppingFixture(),remote=remoteFixture();
  try{
    await fixture.open();
    await fixture.add('Leche');const store=sync(fixture.disk,fixture.model,remote);
    await store.syncShopping(fixture.disk.scope,fixture.disk.active);
    await fixture.disk.store.updateGoLog(rows=>({entries:rows.map(row=>row.note?.shopping?{...row,notes:'cambio local'}:row),result:null}));
    const server=remote.records.get(remote.id(fixture.disk.scope));
    server.lists[0].notes='cambio remoto';server.revision++;
    await assert.rejects(()=>store.syncShopping(fixture.disk.scope,fixture.disk.active),/dos dispositivos/);
    assert.equal(fixture.disk.rows.find(row=>row.note?.shopping).notes,'cambio local');
    assert.equal(server.lists[0].notes,'cambio remoto');
  }finally{fixture.disk.close();}
});

test('list create, rename, trash and restore all reach Supabase without duplicate IDs',async()=>{
  const fixture=await shoppingFixture(),remote=remoteFixture();
  try{
    const actualSync=sync(fixture.disk,fixture.model,remote);
    const api=h.load('lib/shoppingNoteStore.ts',{
      '@react-native-async-storage/async-storage':fixture.disk.storage,'./goTaskAccess':fixture.disk.access,
      './goLogStore':fixture.disk.store,'./unifiedNotes':fixture.disk.model,'./shoppingNote':fixture.model,
      './shoppingSync':actualSync});
    await api.openShoppingNote(fixture.disk.scope,fixture.disk.active);
    const created=await api.createShoppingList(fixture.disk.scope,fixture.disk.active,'Semanal');
    await api.renameShoppingList(fixture.disk.scope,fixture.disk.active,created.id,'Mensual');
    let snapshot=remote.records.get(remote.id(fixture.disk.scope));
    assert.equal(snapshot.lists.filter(row=>row.id===created.id).length,1);
    assert.equal(snapshot.lists.find(row=>row.id===created.id).note.title,'Mensual');
    await api.deleteShoppingList(fixture.disk.scope,fixture.disk.active,created.id);
    snapshot=remote.records.get(remote.id(fixture.disk.scope));
    assert.equal(snapshot.lists.find(row=>row.id===created.id).deleted,true);
    await api.restoreShoppingNote(fixture.disk.scope,fixture.disk.active,created.id);
    snapshot=remote.records.get(remote.id(fixture.disk.scope));
    assert.equal(snapshot.lists.find(row=>row.id===created.id).deleted,false);
    assert.equal(snapshot.activeListId,created.id);
  }finally{fixture.disk.close();}
});

test('a different authenticated account cannot hydrate the first account shopping records',async()=>{
  const first=await shoppingFixture(),second=await h.diskFixture(),remote=remoteFixture();
  try{
    await first.open();await first.add('Aceite');
    await sync(first.disk,first.model,remote).syncShopping(first.disk.scope,first.disk.active);
    await second.setUser('another-user');
    const other={userId:'another-user',context:'demo:USER'};
    await sync(second,first.model,remote).syncShopping(other,()=>true);
    assert.deepEqual(second.rows.filter(row=>row.note?.shopping),[]);
    assert.equal(remote.records.get(remote.id(other)),undefined);
  }finally{first.disk.close();second.close();}
});

test('an authentication denial never opens the offline cache',async()=>{
  const fixture=await shoppingFixture(),remote=remoteFixture();
  try{
    await fixture.open();await fixture.add('Huevos');
    await sync(fixture.disk,fixture.model,remote).syncShopping(fixture.disk.scope,fixture.disk.active);
    const denied={...remote,readShoppingRemote:async()=>{throw Object.assign(Error('Sesión denegada'),{code:'SHOPPING_ACCESS_DENIED'});}};
    await assert.rejects(()=>sync(fixture.disk,fixture.model,denied).syncShopping(fixture.disk.scope,fixture.disk.active),/Sesión denegada/);
  }finally{fixture.disk.close();}
});
