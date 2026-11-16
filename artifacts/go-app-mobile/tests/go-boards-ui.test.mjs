import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {createRequire} from 'node:module';
import lifecycle from './helpers/react-lifecycle.cjs';
const {React,createRoot,document,req,ts}=lifecycle;
const zod=createRequire(path.resolve('../../lib/api-zod/package.json'))('zod');
function evaluate(file,imports,extra=''){
const scope={exports:{},Date,Error,setTimeout,clearTimeout,console,require:name=>name==='react'?React:name in imports?imports[name]:(()=>{throw Error(name)})()};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{ alwaysStrict: false,target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.React,esModuleInterop:true}}).outputText+extra,scope);return scope.exports;
}
const contract=evaluate('../../lib/api-zod/src/go-boards.ts',{zod}),model=evaluate('lib/goBoards.ts',{'@workspace/api-zod':contract});
const {createBoardsStore}=evaluate('lib/goBoardsStore.ts',{'@workspace/api-zod':contract,'./goBoards':model});
const uid='11111111-1111-4111-8111-111111111111',bid='22222222-2222-4222-8222-222222222222',cid='33333333-3333-4333-8333-333333333333';
function fixture(){
  let profile='ADMIN',allowed=true,buttons=[],inputs=[],picker={canceled:true};
  const text=v=>typeof v==='string'?v:Array.isArray(v)?v.map(text).join(''):v?.props?text(v.props.children):'';
  const host=name=>props=>{if(name==='button')buttons.push(props);if(name==='input')inputs.push(props);
    return React.createElement('div',{'data-kind':name},props.children);};
  const rn={View:host('view'),Text:host('text'),TextInput:host('input'),TouchableOpacity:host('button'),ScrollView:host('scroll'),
    FlatList:({data,renderItem,ListHeaderComponent,ListFooterComponent,ListEmptyComponent})=>React.createElement(React.Fragment,null,ListHeaderComponent,data.length?data.map((item,index)=>React.createElement(React.Fragment,{key:item.id},renderItem({item,index}))):ListEmptyComponent,ListFooterComponent),
    Image:host('image'),Switch:host('switch'),Alert:{alert(){}},StyleSheet:{create:v=>v}};
  const panel=evaluate('components/boards/GoBoardsPanel.tsx',{
    'react-native':rn,'react-native-safe-area-context':{useSafeAreaInsets:()=>({top:47,bottom:34,left:0,right:0})},
    '@expo/vector-icons':{Feather:host('icon')},'expo-image-picker':{launchImageLibraryAsync:async()=>picker},
    '@react-native-async-storage/async-storage':{getItem:async()=>null,setItem:async()=>{}},
    '@workspace/api-zod':contract,'@/components/debug/OwnerContextIndicator':{OwnerContextModal:host('modal')},
    '@/components/ui/GoCloseButton':{GoCloseButton:host('close')},'@/components/ui/GoTimePicker':{GoTimeField:host('time')},
    '@/components/KeyboardAwareScrollViewCompat':{KeyboardAwareScrollViewCompat:host('scroll')},
    '@/contexts/GoAdminAccessContext':{useAdminAccess:()=>({userId:uid,allowed,checking:false})},
    '@/contexts/GoViewContext':{useGoView:()=>({view:profile})},
    '@/hooks/useGoBoards':{},'@/lib/goBoards':model,'@/lib/goLogStore':{updateGoLog:async()=>{}},
    '@/lib/goActionCompletion':{completionKey:()=>'',completionSchedule:()=>''},'@/lib/goActionCompletionStore':{updateCompletionDocument:async()=>{}},
    './BoardDragSurface':{BoardDragSurface:host('drag'),BoardDragItem:host('drag-item'),useBoardDragging:()=>false},
  },'\nexports.inspect={TaskEditor,BoardEditor,BoardContents};');
  const element=document.createElement('div'),root=createRoot(element);
  async function render(Component,props){buttons=[];inputs=[];await React.act(async()=>{root.render(React.createElement(Component,props));await Promise.resolve();});}
  return{panel,element,render,setProfile:v=>{profile=v},deny:()=>{allowed=false},button:label=>buttons.findLast(p=>text(p.children)===label||p.accessibilityLabel===label),input:label=>inputs.findLast(p=>p.accessibilityLabel===label),
    async press(label){const button=this.button(label);assert.ok(button,label);assert.notEqual(button.disabled,true);await React.act(async()=>button.onPress());},
    async close(){await React.act(()=>root.unmount());},selectPhoto:v=>{picker=v}};
}
test('real module entry renders only for ADMIN and blocks profile changes',async()=>{
  const f=fixture(),props={visible:true,onClose(){},manager:{state:{boards:[],pending:0,error:'',selected:null,remoteReady:true},store:{list:async()=>{}},allowed:true}};
  try{for(const profile of ['USER','BUSINESS']){f.setProfile(profile);await f.render(f.panel.GoBoardsPanel,props);assert.equal(f.element.textContent,'');}
    f.setProfile('ADMIN');await f.render(f.panel.GoBoardsPanel,props);assert.match(f.element.textContent,/GO Tableros/);
    f.deny();await f.render(f.panel.GoBoardsPanel,props);assert.equal(f.element.textContent,'');
  }finally{await f.close();}
});
test('an unavailable API leaves the local empty state and editor operable with one compact status',async()=>{
  const f=fixture(),props={visible:true,onClose(){},manager:{state:{boards:[],pending:0,error:'La sincronización no está disponible.',localError:'',selected:null,remoteReady:false,localReady:true,conflicts:[]},store:{list:async()=>{}},refresh:async()=>{},allowed:true}};
  try{f.setProfile('ADMIN');await f.render(f.panel.GoBoardsPanel,props);
    assert.match(f.element.textContent,/Guardado en este dispositivo · Pendiente de sincronizar/);
    assert.doesNotMatch(f.element.textContent,/Sincronización de Tableros pendiente|La sincronización no está disponible/);
    assert.ok(f.button('Crear tablero'));
    await f.press('Crear tablero');assert.ok(f.input('Nombre del tablero'));assert.ok(f.button('Guardar tablero'));
  }finally{await f.close();}
});

test('a failed local read protects existing data instead of offering an empty writable cache',async()=>{
  const f=fixture(),props={visible:true,onClose(){},manager:{state:{boards:[],pending:0,error:'',localError:'No se pudo leer la copia local.',selected:null,remoteReady:false,localReady:false,conflicts:[]},store:{list:async()=>{}},refresh:async()=>{},allowed:true}};
  try{await f.render(f.panel.GoBoardsPanel,props);assert.ok(f.button('Reintentar lectura local'));assert.equal(f.button('Crear tablero'),undefined);assert.doesNotMatch(f.element.textContent,/Guardado en este dispositivo/);}
  finally{await f.close();}
});

test('a failed local save never displays a saved or synchronized confirmation',async()=>{
  const f=fixture(),props={visible:true,onClose(){},manager:{state:{boards:[],pending:0,error:'',localError:'No se ha guardado el cambio en este dispositivo.',selected:null,remoteReady:true,localReady:true,conflicts:[]},store:{list:async()=>{}},refresh:async()=>{},allowed:true}};
  try{await f.render(f.panel.GoBoardsPanel,props);assert.match(f.element.textContent,/No se ha guardado/);assert.doesNotMatch(f.element.textContent,/Guardado en este dispositivo|Sincronizado/);assert.ok(f.button('Crear tablero'));}
  finally{await f.close();}
});

test('real offline panel creates a board, column and card, moves it by touch and reopens its durable data',async()=>{
  const f=fixture(),memory=new Map(),storage={getItem:async key=>memory.get(key)??null,setItem:async(k,v)=>memory.set(k,v)};
  const api=async()=>{throw Object.assign(Error('Servidor sin esquema'),{code:'BOARD_UNAVAILABLE'})};
  const store=createBoardsStore(uid,storage,api,()=>true);await store.load();
  function Harness(){const state=React.useSyncExternalStore(store.subscribe,store.snapshot);return React.createElement(f.panel.GoBoardsPanel,{visible:true,onClose(){},manager:{state,store,allowed:true,open:id=>store.open(id),refresh:async()=>{await store.sync();await store.list();}}});}
  try{
    await f.render(Harness,{});await f.press('Crear tablero');
    await React.act(()=>f.input('Nombre del tablero').onChangeText('Prueba local iPhone'));
    await f.press('Guardar tablero');await f.press('Añadir columna');
    await React.act(()=>f.input('Nombre de columna').onChangeText('En curso'));await f.press('Guardar columna');
    await f.press('Añadir tarea');await React.act(()=>f.input('Título de la tarea').onChangeText('Ficha sintética'));
    await f.press('Guardar tarea');assert.equal(store.snapshot().selected.cards.length,1);
    await f.press('Abrir tarea Ficha sintética');await f.press('Por hacer');await f.press('Guardar tarea');
    const doc=store.snapshot().selected;assert.equal(doc.cards[0].columnId,doc.columns[0].id);assert.equal(doc.cards[0].entry.estado,'pendiente');
    assert.equal(doc.cards[0].entry.dateISO,'');assert.equal(doc.cards[0].entry.time,'');
    assert.match(f.element.textContent,/Guardado en este dispositivo · Pendiente de sincronizar/);assert.doesNotMatch(f.element.textContent,/Servidor sin esquema/);
    const restart=createBoardsStore(uid,storage,api,()=>true);await restart.load();await restart.open(doc.id);
    assert.equal(restart.snapshot().selected.name,'Prueba local iPhone');assert.equal(restart.snapshot().selected.cards[0].entry.id,doc.cards[0].entry.id);
    assert.equal(restart.snapshot().selected.columns.length,2);
  }finally{await f.close();}
});

test('conflict screen exposes both task contents and keeps checkpoints only after an explicit choice',async()=>{
  const f=fixture(),local=model.newBoard(bid,uid,'Mi copia',cid,'2026-11-16');local.version=1;
  local.cards=[{entry:model.newBoardTask('one-id',uid,'Edición local'),columnId:cid,calendarLinked:false,archived:false}];
  const remote={...local,name:'Copia remota',version:2,cards:[{...local.cards[0],entry:{...local.cards[0].entry,notes:'Edición de otro dispositivo'}}]};
  let raw=JSON.stringify({cache:{[bid]:local},pending:{[bid]:{base:local,next:local,conflict:true}}});
  const storage={getItem:async()=>raw,setItem:async(_k,v)=>{raw=v}};
  const store=createBoardsStore(uid,storage,async()=>remote,()=>true);await store.load();await store.open(bid);
  function Harness(){const state=React.useSyncExternalStore(store.subscribe,store.snapshot);return React.createElement(f.panel.GoBoardsPanel,{visible:true,onClose(){},manager:{state,store,allowed:true,open:id=>store.open(id),refresh:async()=>{}}});}
  try{await f.render(Harness,{});await f.press('Revisar conflictos');
    assert.match(f.element.textContent,/Edición local/);assert.match(f.element.textContent,/Edición de otro dispositivo/);assert.match(f.element.textContent,/Base anterior/);
    assert.equal(store.snapshot().pending,1);await f.press('Usar servidor');
    assert.equal(store.snapshot().selected.name,'Copia remota');assert.equal(store.snapshot().pending,0);assert.equal(JSON.parse(raw).checkpoints.length,1);
  }finally{await f.close();}
});
test('task editor saves the exact dated/untimed record and notes use its same ID',async()=>{
  const f=fixture(),board=model.newBoard(bid,uid,'Pruebas',cid,'2026-10-24');
  let card={entry:{...model.newBoardTask('stable-id',uid,'Trabajo'),dateISO:'2026-10-25',time:''},columnId:cid,calendarLinked:false,archived:false},saved;
  const props=()=>({board,card,onChange:value=>{card=value},onSave:value=>{saved=value},onDelete(){},onComplete(){},onTransfer(){}});
  try{await f.render(f.panel.inspect.TaskEditor,props());await f.press('Guardar tarea');assert.equal(saved.entry.dateISO,'2026-10-25');assert.equal(saved.entry.time,'');
    await f.press('Más opciones');
    await React.act(()=>f.input('Añadir nota interna').onChangeText('Nota compartida'));await f.press('Añadir nota');
    assert.equal(card.entry.messages[0].goId,'stable-id');assert.equal(card.entry.messages[0].text,'Nota compartida');
    card.entry.time='17:30';await f.render(f.panel.inspect.TaskEditor,props());await f.press('Sin fecha');assert.equal(card.entry.dateISO,'');assert.equal(card.entry.time,'');
  }finally{await f.close();}
});
test('all organization views display undated tasks without turning them into reservations',async()=>{
  const f=fixture(),b=model.newBoard(bid,uid,'Proyecto',cid,'2026-10-24');b.cards=[{entry:model.newBoardTask('card',uid,'Sin fecha real'),columnId:cid,calendarLinked:false,archived:false}];
  try{for(const view of contract.boardViews){await f.render(f.panel.inspect.BoardContents,{board:{...b,view},search:'',filter:'active',dateFilter:'',onOpen(){},onAdd(){},onColumn(){},onAddColumn(){},onDate(){}});
    assert.match(f.element.textContent,/Sin fecha real/);assert.doesNotMatch(f.element.textContent,/00:00/);}
  }finally{await f.close();}
});
test('cover picker uses the selected bytes, never a temporary device path',async()=>{
  const f=fixture();let board=model.newBoard(bid,uid,'Portada',cid,'2026-10-24');
  try{f.selectPhoto({canceled:false,assets:[{uri:'file:///temporary/photo.jpg',base64:'YQ==',mimeType:'image/jpeg'}]});
    await f.render(f.panel.inspect.BoardEditor,{board,setBoard:b=>{board=b},onSave(){}});await f.press('Elegir fotografía');
    assert.equal(board.cover,'data:image/jpeg;base64,YQ==');assert.equal(board.cover.includes('temporary'),false);
  }finally{await f.close();}
});
test('drag hit testing respects exact touch coordinates and the smallest valid target',()=>{
  const drag=evaluate('components/boards/BoardDragSurface.tsx',{'react-native':{PanResponder:{create:()=>({})},Text:'Text',View:'View'}});
  const targets=[{id:'column',kind:'column',x:10,y:10,width:270,height:700},{id:'card',kind:'card',x:25,y:50,width:240,height:80}];
  assert.equal(drag.boardDropTarget(targets,24,49,'card').id,'column');assert.equal(drag.boardDropTarget(targets,25,50,'card').id,'card');
  assert.equal(drag.boardDropTarget(targets,9,50,'card'),undefined);
  assert.equal(drag.boardDropTarget(targets,30,60,'column').id,'column');
});
