import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,ts}=lifecycle;
const zod=createRequire(path.resolve('../../lib/api-zod/package.json'))('zod');
function load(file,imports){
  const scope={exports:{},Date,Error,AbortController,console,setTimeout,clearTimeout,setInterval:()=>1,clearInterval(){},require:name=>name==='react'?React:imports[name]??(()=>{throw Error(name)})()};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,scope);return scope.exports;
}
const contract=load('../../lib/api-zod/src/go-boards.ts',{zod}),model=load('lib/goBoards.ts',{'@workspace/api-zod':contract});
const storeApi=load('lib/goBoardsStore.ts',{'@workspace/api-zod':contract,'./goBoards':model});
const uid='11111111-1111-4111-8111-111111111111',bid='22222222-2222-4222-8222-222222222222',cid='33333333-3333-4333-8333-333333333333';
const board=()=>model.newBoard(bid,uid,'Local de prueba',cid,'2026-11-16');
const copy=v=>JSON.parse(JSON.stringify(v));
const settle=async()=>{for(let i=0;i<4;i++)await new Promise(setImmediate);};
function fixture({calendarFails=false,seed=null,legacy=false,strict=false}={}){
  let manager,entries=[],profile='ADMIN',allowed=true,user=uid,reads=0,refreshes=0,apiError=Object.assign(Error('API no disponible'),{status:503,code:'BOARD_UNAVAILABLE'});
  const memory=new Map(seed?[[`go_boards_v1:ADMIN:${uid}`,JSON.stringify(seed)]]:[]),calls=[],listeners=new Set();
  if(legacy)memory.set('go_tableros_v1','[{"name":"Sin propietario"}]');
  const storage={getItem:async k=>{reads++;return memory.get(k)??null},setItem:async(k,v)=>memory.set(k,v)};
  const hook=load('hooks/useGoBoards.ts',{
    'react-native':{AppState:{currentState:'active',addEventListener:()=>({remove(){}})}},
    '@react-native-async-storage/async-storage':storage,'@/lib/goBoardsCache':{boardsCache:storage},'@workspace/api-zod':contract,
    '@/contexts/GoViewContext':{useGoView:()=>({view:profile})},
    '@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({allowed,checking:false,userId:user,refresh:async()=>{refreshes++;allowed=false;}})},
    '@/data/booking':{supabaseApiRequest:async(route,init)=>{calls.push({route,init});if(apiError)throw apiError;return []; }},
    '@/lib/goBoardsStore':storeApi,'@/lib/goTaskAccess':{configureBoardTaskAccess(){}},'@/lib/goBoards':model,
    '@/lib/goLogStore':{readGoLog:async()=>{if(calendarFails)throw Error('Calendario ilegible');return copy(entries)},getGoLogSnapshot:()=>entries,
      subscribeGoLog:fn=>{listeners.add(fn);return()=>listeners.delete(fn)},
      updateGoLog:async(fn,guard)=>{guard?.();const next=fn(copy(entries));entries=next.entries;for(const fn of listeners)fn();}},
  });
  function Harness(){manager=hook.useGoBoards();return null;}
  const root=createRoot(document.createElement('div'));
  return {memory,calls,get manager(){return manager},get entries(){return entries},get reads(){return reads},get refreshes(){return refreshes},
    async render(){await React.act(async()=>{root.render(strict?React.createElement(React.StrictMode,null,React.createElement(Harness)):React.createElement(Harness));await settle();})},
    async act(fn){await React.act(async()=>{await fn();await settle();})},
    setProfile:v=>{profile=v},deny:()=>{allowed=false},setUser:v=>{user=v},fail:v=>{apiError=v},setEntries:v=>{entries=v},
    async close(){await React.act(()=>root.unmount());}};
}

test('real hook hydrates with both Calendar and API failing and supports local board/column/task creation',async()=>{
  const f=fixture({calendarFails:true,legacy:true});
  try{await f.render();assert.equal(f.manager.state.localReady,true);assert.equal(f.manager.legacyDetected,true);
    await f.act(()=>f.manager.store.save(board()));
    await f.act(()=>f.manager.store.change({type:'column',id:'44444444-4444-4444-8444-444444444444',title:'Trabajo'}));
    await f.act(()=>f.manager.store.change({type:'card',card:{entry:model.newBoardTask('same-task',uid,'Captura rápida'),columnId:cid,calendarLinked:false,archived:false}}));
    assert.equal(f.manager.state.selected.cards[0].entry.id,'same-task');assert.equal(f.manager.state.pending,1);assert.equal(f.manager.state.remoteReady,false);
    const durable=JSON.parse(f.memory.get(`go_boards_v1:ADMIN:${uid}`));assert.equal(durable.cache[bid].columns.length,2);assert.equal(durable.cache[bid].cards.length,1);
    assert.equal(f.memory.get('go_tableros_v1'),'[{"name":"Sin propietario"}]');
  }finally{await f.close();}
});

test('restart protects pending board changes from a stale Calendar projection and projects the same ID once',async()=>{
  const b=board(),entry={...model.newBoardTask('stable-id',uid,'Última edición local'),dateISO:'2026-11-17'};
  b.cards=[{entry,columnId:cid,calendarLinked:true,archived:false}];
  const f=fixture({seed:{cache:{[bid]:b},pending:{[bid]:{base:copy(b),next:copy(b)}}}});
  f.setEntries([{...entry,notes:'Proyección anterior',boardId:bid}]);
  try{await f.render();assert.equal(f.manager.state.boards.length,1);await f.act(()=>f.manager.open(bid));
    assert.equal(f.manager.state.selected.cards[0].entry.notes,'Última edición local');
    assert.equal(f.entries.length,1);assert.equal(f.entries[0].id,'stable-id');assert.equal(f.entries[0].notes,'Última edición local');
    await f.act(()=>f.manager.refresh());assert.equal(f.entries.length,1);
  }finally{await f.close();}
});

test('USER, BUSINESS and unverified ADMIN never read board cache or call its API',async()=>{
  for(const profile of ['USER','BUSINESS','ADMIN']){
    const f=fixture();f.setProfile(profile);if(profile==='ADMIN')f.deny();
    try{await f.render();assert.equal(f.manager.allowed,false);assert.equal(f.reads,0);assert.equal(f.calls.length,0);await assert.rejects(()=>f.manager.store.load(),/perfil/);}
    finally{await f.close();}
  }
});

test('expired session or revoked membership invalidates local authorization instead of treating it as offline',async()=>{
  for(const error of [Object.assign(Error('Sesión caducada'),{status:401}),Object.assign(Error('Rol revocado'),{status:403,code:'ADMIN_REQUIRED'})]){
    const f=fixture();f.fail(error);
    try{await f.render();await f.render();assert.equal(f.manager.allowed,false);assert.ok(f.refreshes>0);await assert.rejects(()=>f.manager.store.save(board()),/perfil/);}
    finally{await f.close();}
  }
});

test('switching ADMIN identities revokes old stores, even when returning to the first account',async()=>{
  const f=fixture();try{await f.render();const first=f.manager.store;await f.act(()=>first.save(board()));
    f.setUser('55555555-5555-4555-8555-555555555555');await f.render();assert.equal(f.manager.state.boards.length,0);await assert.rejects(()=>first.save(board()),/perfil/);
    f.setUser(uid);await f.render();assert.equal(f.manager.state.boards.length,1);await assert.rejects(()=>first.save(board()),/perfil/);
  }finally{await f.close();}
});

test('Expo development StrictMode keeps the live store usable and unmount revokes old asynchronous work',async()=>{
  const f=fixture({strict:true});let store;
  try{await f.render();store=f.manager.store;assert.equal(f.manager.state.localReady,true);await f.act(()=>store.save(board()));assert.equal(store.snapshot().boards.length,1);}
  finally{await f.close();}
  await assert.rejects(()=>store.save(board()),/perfil/);
});
