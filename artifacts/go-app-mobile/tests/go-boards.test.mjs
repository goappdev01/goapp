import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { createRequire } from 'node:module';
const req = createRequire(path.join(process.cwd(), 'package.json')), ts = req('typescript');
const zod = createRequire(path.resolve('../../lib/api-zod/package.json'))('zod');
function load(file, imports = {}) {
  const scope = { exports: {}, Date, Error, console, setTimeout, clearTimeout, require: name => {
    if (name in imports) return imports[name]; throw Error('Unexpected import '+name);
  } };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {fileName:file,compilerOptions:{ esModuleInterop: false, alwaysStrict: false,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.React}}).outputText,scope);
  return scope.exports;
}
const contract = load('../../lib/api-zod/src/go-boards.ts', {zod});
const model = load('lib/goBoards.ts', {'@workspace/api-zod':contract});
const {createBoardsStore} = load('lib/goBoardsStore.ts', {'@workspace/api-zod':contract,'./goBoards':model});
const uid='11111111-1111-4111-8111-111111111111', foreign='22222222-2222-4222-8222-222222222222';
const uuid = n => `33333333-3333-4333-8333-${String(n).padStart(12,'0')}`;
const board = n => model.newBoard(uuid(n),uid,'Proyecto '+n,uuid(1000+n),'2026-10-24');
const card = (b,n=1) => ({entry:model.newBoardTask('task-'+n,uid,'Tarea '+n),columnId:b.columns[0].id,calendarLinked:false,archived:false});
const clone = v => JSON.parse(JSON.stringify(v));
function fixture() {
  const memory=new Map(), remote=new Map(), calls=[]; let online=true, active=true;
  const storage={getItem:async key=>memory.get(key)??null,setItem:async(key,value)=>memory.set(key,value)};
  const api=async(route,method='GET',body,headers)=>{
    calls.push({route,method});if(!online)throw Error('Sin conexión');
    const url=new URL('http://test.invalid'+route),id=url.pathname.slice(1);
    if(method==='GET'&&url.pathname==='/')return [...remote.values()].filter(b=>!b.removed&&(url.searchParams.get('archived')==='all'||b.archived===(url.searchParams.get('archived')==='true'))).slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+30).map(clone);
    if(method==='GET'&&url.pathname==='/calendar')return [...remote.values()].slice(Number(url.searchParams.get('offset')),Number(url.searchParams.get('offset'))+30).map(clone);
    if(method==='GET'){if(!remote.has(id))throw Error('No encontrado');return clone(remote.get(id));}
    if(method==='PUT'){
      const old=remote.get(id);if((old?.version||0)!==body.version)throw Error('El tablero ha cambiado');
      const saved={...clone(body),version:body.version+1};remote.set(id,saved);return clone(saved);
    }
    if(method==='DELETE'){assert.equal(headers['X-GO-Confirm-Delete'],'yes');const document={...remote.get(id),removed:true,version:remote.get(id).version+1};remote.set(id,document);return {deleted:true,document};}
    if(route==='/transfer'){
      const source=remote.get(body.source),target=remote.get(body.target),entry=source.cards.find(c=>c.entry.id===body.task);
      source.cards=source.cards.filter(c=>c!==entry);target.cards.push({...entry,columnId:body.column});source.version++;target.version++;
      return clone({source,target});
    }
    throw Error('Unexpected '+route);
  };
  return {memory,remote,calls,storage,api,make:()=>createBoardsStore(uid,storage,api,()=>active),setOnline:v=>{online=v;},setActive:v=>{active=v;}};
}
test('only the authorized ADMIN profile enables the shared module',()=>{
  for(const profile of ['USER','BUSINESS','PROFESSIONAL','ADMIN'])for(const allowed of [false,true])
    assert.equal(contract.canUseGoBoards(profile,allowed,uid),profile==='ADMIN'&&allowed);
  assert.equal(contract.canUseGoBoards('ADMIN',true,null),false);
});
test('dates and time are independent and never invent midnight',()=>{
  const b=board(1),c=card(b);
  assert.equal(c.entry.dateISO,'');assert.equal(c.entry.time,'');
  const dated=model.moveBoardCardDate(c,'2026-10-25');assert.equal(dated.entry.time,'');
  const timed={...dated,entry:{...dated.entry,time:'17:30'}};
  assert.equal(model.moveBoardCardDate(timed,'2026-10-26').entry.time,'17:30');
  const undated=model.moveBoardCardDate(timed,'');assert.equal(undated.entry.time,'');assert.equal(undated.entry.id,c.entry.id);
  assert.throws(()=>contract.boardDatePatch('', '17:30'));
  for(const date of ['2026-13-01','2026-02-30','not-a-date'])assert.equal(contract.boardDocumentSchema.safeParse({...b,anchorDate:date}).success,false);
});
test('column and card moves preserve functional states, notes and stable identities',()=>{
  let b=board(1);b=model.updateBoard(b,{type:'column',id:uuid(100),title:'Terminadas'});
  const c=card(b);c.entry.detail='Conservar descripción';c.entry.messages=[{id:'note',goId:c.entry.id,text:'Nota',senderId:'yo',createdAt:1,deliveryMode:'internal'}];
  b=model.updateBoard(b,{type:'card',card:c});b=model.updateBoard(b,{type:'card',card:{...c,columnId:uuid(100)}});
  assert.equal(b.cards[0].entry.estado,'pendiente');assert.equal(b.cards[0].entry.localResolutionStatus,undefined);
  assert.equal(b.cards[0].entry.messages[0].goId,c.entry.id);assert.equal(b.cards.length,1);
  b=model.updateBoard(b,{type:'columnOrder',id:uuid(100),target:b.columns[0].id});assert.equal(b.columns[0].title,'Terminadas');
});
test('duplicate structure copies neither tasks nor their stable column IDs',()=>{
  const b=board(1);b.cards=[card(b)];const copy=model.duplicateBoardStructure(b,uuid(3),'Copia',()=>uuid(4));
  assert.equal(copy.cards.length,0);assert.notEqual(copy.columns[0].id,b.columns[0].id);assert.equal(copy.version,0);
});
test('private tasks stay outside Calendar and a linked task appears exactly once',()=>{
  const b=board(1),c=card(b);b.cards=[c];assert.equal(model.projectBoardCalendar(b,[]).length,0);
  c.calendarLinked=true;const unrelated={id:'unrelated',notes:'Original'};
  const entries=model.projectBoardCalendar(b,[unrelated]);const next=model.projectBoardCalendar(b,entries);
  assert.equal(next.length,2);assert.equal(next.filter(e=>e.id===c.entry.id).length,1);assert.equal(next[0].id,'unrelated');
  c.calendarLinked=false;assert.equal(model.projectBoardCalendar(b,next).length,1);
});
test('Calendar date changes update the same task without touching other board content',()=>{
  const b=board(1),c=card(b);c.calendarLinked=true;b.cards=[c];const updated={...c.entry,dateISO:'2026-10-28',date:'Miércoles',time:''};
  const changed=model.calendarChanges(b,[updated]);assert.equal(changed.cards[0].entry.id,c.entry.id);assert.equal(changed.cards[0].entry.dateISO,'2026-10-28');
  assert.equal(changed.cards[0].entry.time,'');assert.equal(changed.columns[0].id,b.columns[0].id);
  assert.equal(model.calendarChanges(b,[{...updated,ownerUserId:foreign}]),b);
});
test('invalid or foreign task references and duplicate task IDs fail closed',()=>{
  const b=board(1),c=card(b);assert.equal(contract.boardDocumentSchema.safeParse({...b,cards:[c,c]}).success,false);
  assert.equal(contract.boardDocumentSchema.safeParse({...b,cards:[{...c,entry:{...c.entry,ownerUserId:foreign}}]}).success,false);
  assert.equal(contract.boardDocumentSchema.safeParse({...b,profile:'USER'}).success,false);
});
test('50 real board saves, pagination, reopen and one task identity',async()=>{
  const f=fixture(),store=f.make();await store.load();
  for(let i=1;i<=50;i++)await store.save(board(i));
  assert.equal(f.remote.size,50);await store.list();assert.equal(store.snapshot().boards.length,30);assert.equal(store.snapshot().more,true);
  await store.list('', 'false',true);assert.equal(store.snapshot().boards.length,50);
  await store.open(uuid(1));const c=card(store.snapshot().selected);await store.change({type:'card',card:c});
  await store.change({type:'card',card:{...c,entry:{...c.entry,notes:'Título editado'}}});
  const reopened=f.make();await reopened.load();await reopened.open(uuid(1));assert.equal(reopened.snapshot().selected.cards.length,1);
  assert.equal(reopened.snapshot().selected.cards[0].entry.notes,'Título editado');
});
test('offline changes survive restart and synchronize once when connectivity returns',async()=>{
  const f=fixture(),store=f.make();await store.load();await store.save(board(1));f.setOnline(false);
  await store.change({type:'settings',patch:{name:'Sin conexión'}});assert.equal(store.snapshot().pending,1);
  const next=f.make();await next.load();await next.open(uuid(1));assert.equal(next.snapshot().selected.name,'Sin conexión');assert.equal(next.snapshot().pending,1);
  f.setOnline(true);await next.sync();assert.equal(next.snapshot().pending,0);assert.equal(f.remote.get(uuid(1)).name,'Sin conexión');assert.equal(f.remote.size,1);
});
test('two devices retain conflicts and resolve only after an explicit choice',async()=>{
  const f=fixture(),first=f.make();await first.load();await first.save(board(1));
  const second=f.make();await second.load();await second.open(uuid(1));
  await first.change({type:'settings',patch:{name:'Dispositivo uno'}});
  await second.change({type:'settings',patch:{name:'Dispositivo dos'}});
  assert.equal(second.snapshot().pending,1);assert.match(second.snapshot().error,/cambiado/);
  assert.equal(f.remote.get(uuid(1)).name,'Dispositivo uno');await second.resolveConflict(false);
  assert.equal(second.snapshot().selected.name,'Dispositivo uno');assert.equal(second.snapshot().pending,0);
});
test('session/profile switches block writes and never discard another identity cache',async()=>{
  const f=fixture(),store=f.make();await store.load();await store.save(board(1));const previous=[...f.memory.values()][0];
  f.setActive(false);await assert.rejects(()=>store.change({type:'settings',patch:{name:'Prohibido'}}),/perfil/);
  assert.equal([...f.memory.values()][0],previous);assert.equal(f.remote.get(uuid(1)).name,'Proyecto 1');
});
test('archiving, recovery, views, covers and explicit deletion remain persistent',async()=>{
  const f=fixture(),s=f.make();await s.load();await s.save(board(1));
  await s.change({type:'settings',patch:{archived:true,view:'month',cover:'data:image/jpeg;base64,YQ=='}});
  const next=f.make();await next.load();await next.open(uuid(1));assert.equal(next.snapshot().selected.view,'month');assert.equal(next.snapshot().selected.archived,true);
  await next.change({type:'settings',patch:{archived:false}});await next.remove(next.snapshot().selected);assert.equal([...f.remote.values()].filter(b=>!b.removed).length,0);
});
test('transfer changes association atomically while preserving the same task',async()=>{
  const f=fixture(),s=f.make();await s.load();await s.save(board(1));await s.change({type:'card',card:card(board(1))});
  const source=clone(s.snapshot().selected);await s.save(board(2));const target=clone(s.snapshot().selected);await s.open(source.id);
  await s.transfer('task-1',target,target.columns[0].id);
  assert.equal(f.remote.get(source.id).cards.length,0);assert.equal(f.remote.get(target.id).cards.length,1);assert.equal(f.remote.get(target.id).cards[0].entry.id,'task-1');
});
test('integration adds its entry only inside Calendar actions and leaves Landing render untouched',()=>{
  const source=fs.readFileSync('app/index.tsx','utf8'),start=source.indexOf('testID="calendar-actions"'),button=source.indexOf('accessibilityLabel="Tablero"');
  assert.ok(button>start);assert.ok(source.slice(start,button).includes('goView.view === "ADMIN" && adminAccess.allowed && !adminAccess.checking'));
  assert.ok(source.includes('<GoBoardsPanel visible={boardsOpen && calOpen}'));
});
test('the shared task engine blocks ADMIN board records in USER and BUSINESS',()=>{
  const access=load('lib/goTaskAccess.ts',{'@/data/booking':{getAuthenticatedUserId:async()=>uid}});
  const entry={...model.newBoardTask('linked',uid,'Privada'),boardId:uuid(1)};
  assert.equal(access.ownsTask(entry,uid),false);access.configureBoardTaskAccess(uid,true);
  assert.equal(access.ownsTask(entry,uid),true);access.configureBoardTaskAccess(uid,false);
  assert.equal(access.canReadBoardTask(entry),false);assert.equal(access.ownsTask({...entry,boardId:undefined},uid),true);
});
test('assistant integration requires both confirmations and the unchanged reviewed revision',async()=>{
  const actions=load('lib/goBoardsActions.ts',{'./goBoards':model}),f=fixture(),s=f.make();
  await s.load();await s.save(board(1));const prepared=actions.prepareBoardAction(s.snapshot().selected,{type:'settings',patch:{name:'Revisado'}});
  await assert.rejects(()=>actions.confirmBoardAction(s,prepared,{understood:true,approved:false}),/confirma/);
  await actions.confirmBoardAction(s,prepared,{understood:true,approved:true});assert.equal(f.remote.get(uuid(1)).name,'Revisado');
  await assert.rejects(()=>actions.confirmBoardAction(s,prepared,{understood:true,approved:true}),/cambiado/);
});
test('native photo cache commits its pointer only after the durable slot succeeds',async()=>{
  const pointers=new Map(),files=new Map();let fail=false;
  const storage={getItem:async key=>pointers.get(key)??null,setItem:async(key,value)=>pointers.set(key,value)};
  const fs={documentDirectory:'file:///documents/',makeDirectoryAsync:async()=>{},readAsStringAsync:async path=>files.get(path),writeAsStringAsync:async(path,value)=>{if(fail)throw Error('Disco lleno');files.set(path,value)}};
  const {boardsCache}=load('lib/goBoardsCache.ts',{'@react-native-async-storage/async-storage':{default:storage},'expo-file-system/legacy':fs,'react-native':{Platform:{OS:'android'}}});
  const key='go_boards_v1:ADMIN:'+uid;await boardsCache.setItem(key,'Primer documento');assert.equal(await boardsCache.getItem(key),'Primer documento');
  fail=true;await assert.rejects(()=>boardsCache.setItem(key,'Otro'),/Disco/);assert.equal(await boardsCache.getItem(key),'Primer documento');
  fail=false;await boardsCache.setItem(key,'Segundo documento');assert.equal(await boardsCache.getItem(key),'Segundo documento');assert.equal(files.size,2);
  await assert.rejects(()=>boardsCache.setItem('otra-cuenta','invalid'),/Ámbito/);
});
test('deleting a board preserves its linked GO task across a second device',async()=>{
  const f=fixture(),first=f.make();await first.load();const b=board(1),c=card(b);c.calendarLinked=true;b.cards=[c];await first.save(b);
  await first.remove(first.snapshot().selected);await first.list();assert.equal(first.snapshot().boards.length,0);
  const other=f.make();await other.load();await other.loadCalendar();
  const restored=other.allCached().reduce((entries,doc)=>model.projectBoardCalendar(doc,entries),[]);
  assert.equal(restored.length,1);assert.equal(restored[0].id,c.entry.id);
});
test('remote task removals clear only their old Calendar projection',()=>{
  const b=board(1),c=card(b);c.calendarLinked=true;b.cards=[c];const original=model.projectBoardCalendar(b,[{id:'unrelated'}]);
  const next=model.projectBoardCalendar({...b,cards:[]},original);assert.equal(next.length,1);assert.equal(next[0].id,'unrelated');
});
